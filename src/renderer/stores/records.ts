import type { Board, EndReason, GameState, StyleId } from '../../shared/types'
import { MODES, type ModeId } from '../../shared/modes'
import { THEMES } from '../styles/themes'
import {
  applyRunToAchievements,
  countMergesAlongPath,
  decodeAchievementProgress,
  emptyAchievementProgress,
  type AchievementId,
  type AchievementProgress,
} from '../../game/achievements'
import {
  STORAGE_VERSION,
  describeStorageFailure,
  type RejectReason,
  type StorageNotice,
} from './session'

/**
 * 战绩与统计（SPEC §3.3 的 `records` / `stats` 两个桶的**纯逻辑半边**）
 *
 * 与 session.ts 同一条分工：本文件**一行 I/O 都没有**——不碰 indexedDB、不碰 window、
 * 不碰 Date。于是「一次结算该把哪一条记录改成什么」可以在 node 环境里被单测直接驱动。
 * T14 的闸门已经证明过：没人在真实环境里跑过的那一层，恰恰是缺陷最爱住的地方。
 *
 * 形状（SPEC §3.3）：
 *   · `records[mode][style]` 存 **最高分**与**最高 Tile**，一局只归**结算那一刻**
 *     所处的风格（mode-contract §3「成绩归结算那一刻所处的风格」）；
 *   · `stats` 存 **总局数、胜局、累计时长、成就解锁**。成就归 T18，本票只把
 *     `achievements` 这个插槽接到 `src/game/achievements.ts` 的纯判定上——进度存在哪里、
 *     怎么拒绝坏形状都由那边定，这里只负责搬它过「结算即作废 session」那道边界。
 *
 * **没有任何「这一局用过撤销」的标记，也没有「完美一局」标志**（ADR-0003 + SPEC §6）：
 * 用过撤销的一局与干净的一局在记录里逐字节同形。T18 的两个「不使用撤销 / 不使用交换」
 * 成就要的「曾经用过」在持久状态里不可推导（撤销弹掉前态后不留痕迹），按 owner 裁决
 * 之前不实现、也不为它们加字段——见 achievements.ts 头注。
 *
 * **T19 的风格切换次数不在此列**：它是**事实**（这一局换过几次观感），不是对玩家行为的
 * 评判，所以它不违反 ADR-0003「只增不减的标记字段」禁令的那半边——那条禁令禁的是
 * 「本局用过撤销 / 作弊」这种会污染记录的判据字段。它同样住在 session 桶而不是
 * records / stats：结算之后这一局连同计数一起作废，两个战绩桶里不留「切换过几次」。
 */

/** 两个新桶的名字（I/O 半边在 sessionStore.ts，两处必须一致） */
export const RECORDS_STORE = 'records'
export const STATS_STORE = 'stats'

/** 一条记录。`records[mode][style]` 在库里摊成一个键（见 recordKey） */
export interface StyleRecord {
  version: number
  /** 最高分。**最大值语义**：一局更差的成绩不许把它拉低（SPEC §3.3「stores best score」） */
  bestScore: number
  /** 最高方块。同样最大值语义 */
  highestTile: number
}

/** 统计。单例，落在 stats 桶的 current 键上 */
export interface StatsRecord {
  version: number
  /** 结算过的一局数。**放弃的一局不算**（mode-contract §3：abandon 不写记录） */
  totalRuns: number
  /** 其中曾达到目标块的一局数。判据见 applyRunToStats */
  wins: number
  /** 累计时长（毫秒）。公式见 Settlement.timePlayedMs */
  timePlayedMs: number
  /**
   * 成就进度（T18 · SPEC §3.3 的「achievement unlocks」）
   *
   * 形状与判据都在 `src/game/achievements.ts`：那一层是纯函数，本文件只管把它搬过
   * 「结算即作废 session」那道边界。**缺这个字段不是错误**——T17 时代的 stats 没有它，
   * 那时按「还没有任何成就进度」收（与 SessionRecord.startedAt 同一条理由：没给不是错，
   * 给错了才是）；给了却对不上形状则整桶拒绝，绝不猜一个默认值。理由见 decodeStats。
   */
  achievements: AchievementProgress
  /**
   * 上一次被数进统计的那一局的起始时刻 = 「结算只执行一次」的幂等键
   *
   * 为什么它必须**落盘**而不是活在内存里：结算只执行一次（mode-contract §3）这件事，
   * 光靠引擎的早退只能挡住「同一个对象被 settle 两次」。写盘的那一方还要能挡住
   * 「同一次结算被递进来两次」——而那是刷新之后也还得成立的约束，所以键只能住在这里。
   * 代价是同一毫秒内开两局时后一局的计数会被跳过（分数与最高方块的 max 本来就幂等），
   * 这是可辩的最小代价：一次结算被数成两次才是这条键要防的那件事。
   */
  lastRunStartedAt: number | null
}

/**
 * 一次结算要写进记录的全部信息。
 *
 * 它在 `settle` / `tick` 两条路径上、session 存档被作废**之前**就地从终局状态取出来
 * （T16 的交接项：结算即作废 session，所以能读的时刻只有作废之前）。
 */
export interface Settlement {
  modeId: ModeId
  /** 结算那一刻的风格：一局只归它一个（mode-contract §3） */
  styleId: StyleId
  score: number
  highestTile: number
  /**
   * 曾达到目标块。**胜局数按它数，不按 endReason**：mode-contract §3 定「达标只是
   * 里程碑，不是终局」，SPEC §3.3 的「including a run that reached the target and
   * continued」说的就是这种事——达标后继续玩到死局再收工，结算原因是 deadlock，
   * 但它确实赢过。按 endReason 数会把这种局记成负局。
   */
  reachedTarget: boolean
  endReason: EndReason
  /**
   * 本局时长（毫秒）= 结算时刻 − 本局起始时刻，**墙上时间**，六模式同一个公式。
   *
   * 为什么选墙上时间而不是「有效着法时间」：它必须能从持久化状态推导出来
   * （一局中途刷新不许丢掉一半时长），而 GameState 里没有任何一步的时间戳，
   * 每一步的时间戳都得从零加起。起始时刻因此进 session 桶（SessionRecord.startedAt），
   * 与 dailyDate 同一条路：不是规则数据，但必须跨过刷新活着。
   *
   * **Time Attack 不叠加第二项**：它的 deadline 已经把这局的墙上时间封了顶，
   * 到时强制结算，于是这个公式天然给出接近 180000 的一个数。在这里再补一笔
   * 「限时模式按限时算」就是同一段时间数两遍。
   */
  timePlayedMs: number
  /** 本局起始时刻；同时是统计的幂等键（StatsRecord.lastRunStartedAt） */
  startedAt: number | null
  /**
   * 本局合并次数（T18 的合并机器读它）
   *
   * 它只能沿**结算时的撤销路径**数：合并吞掉一个 Tile 身份、生成只新增身份，于是
   * 相邻两个状态的「消失身份数」就是这一段完成的合并数（achievements.mergeCountBetween）。
   * 所以结算必须把路径一起带来——而路径随 session 存档一起作废，能读的时刻与
   * timePlayedMs 一样，只有作废之前（见 settlementOf 的 prior 参数）。
   */
  merges: number
  /**
   * 本局**真实发生**的风格切换次数（T19 的风格旅行者读它）
   *
   * 与 merges / dailyDate 同一条路：它不是 GameState 的字段（结算那一刻的终局里没有
   * 「这一局换过几次观感」），而是 session 桶里一个跟着这一局活的计数。所以结算方必须
   * 在 session 作废之前把它带进来，晚一步就只剩 0——而那是**把一个已经达成的成就判成
   * 没达成**，比没有这个成就更糟（玩家明明切够了五次）。
   *
   * 只数真的换了的那几次：重复选当前风格不是切换，一次都不加（ticket 验收标准 1）。
   */
  styleSwitches: number
  /**
   * 本局的 Daily UTC 日期串；非 Daily 为 null（T18 的每日坚守读它）
   *
   * 来源只能是 `SessionRecord.dailyDate`：种子是单向哈希，日期串从 initialSeed 反推
   * 不回来（T08）。它不是规则数据，但必须跟着这一局活到结算那一刻，于是与 startedAt
   * 同一条路——住 session 桶、在结算时由调用方带进来。
   */
  dailyDate: string | null
}

/** 读出来给界面看的一条记录。键里的身份与值里的数字在这里合起来 */
export interface RecordEntry {
  modeId: ModeId
  styleId: StyleId
  bestScore: number
  highestTile: number
}

/** 整桶记录的读取结论。三态与 session 同构：没存过不是错，存了读不得才是 */
export type RecordsParse =
  | { kind: 'ok'; entries: readonly RecordEntry[] }
  | { kind: 'absent' }
  | { kind: 'rejected'; reason: RejectReason }

/** 一条记录的读取结论（写盘路径逐键用） */
export type StyleRecordParse =
  | { kind: 'ok'; record: StyleRecord }
  | { kind: 'absent' }
  | { kind: 'rejected'; reason: RejectReason }

/** 统计桶的读取结论 */
export type StatsParse =
  | { kind: 'ok'; record: StatsRecord }
  | { kind: 'absent' }
  | { kind: 'rejected'; reason: RejectReason }

/**
 * 写一次结算的结论。
 *
 * `rejected` 是与「写不进去」并列的另一种失败：桶里的旧数据读不出来，于是**什么
 * 都不写**——把它静默重置成 0 比写不进去更糟（SPEC §3.3「不许假装持久化成功」）。
 * 界面上那句话由 notice 带着走。
 *
 * `unlocked` 是**这一次**新解锁的成就（T18 的即时提示靠它）：它由落库前后的进度相减
 * 得到，只在真的写了盘的那一次存在。结算只执行一次，于是提示也只可能响一次。
 */
export type SettlementWrite =
  | { kind: 'written'; unlocked: readonly AchievementId[] }
  | { kind: 'rejected'; notice: StorageNotice }

/** 键就是身份：`records[mode][style]` 摊平后的那一个串（与 T16 的 e2e 种子值同一个口径） */
export function recordKey(modeId: ModeId, styleId: StyleId): string {
  return `${modeId}:${styleId}`
}

/** 棋盘上最大的数值方块。空盘 / 只有障碍记 0 */
export function highestTileOf(board: Board): number {
  return board
    .flat()
    .reduce<number>(
      (max, cell) => (cell !== null && cell !== 'wall' ? Math.max(max, cell.value) : max),
      0
    )
}

/**
 * 从终局状态取出这一次结算要写的全部信息。
 *
 * `startedAt` 允许为 null：一个在 T17 之前开局的 session 恢复出来就是这个形状，
 * 那时本局时长无从得知（记 0，分数与最高方块照记）。这是为「不因为一个统计字段
 * 毁掉一局还能下的棋」付的代价，写在这里免得日后有人以为那是漏算。
 *
 * `prior` 是结算那一刻的**撤销路径**（store 的 history，索引 0 是开局那一个状态）。
 * 它必须在这一刻传进来，是因为合并次数只能沿它数（见 Settlement.merges），而路径与
 * session 存档一起在结算时作废——晚一步就没有了。`dailyDate` 同理：它是 session 桶
 * 里的字段，不是规则数据，结算方不带过来就丢了。`styleSwitches` 是同一个道理的第三个
 * 例子（T19）：它跟着这一局活，而这一局在结算那一刻被作废。
 */
export function settlementOf(
  game: GameState,
  styleId: StyleId,
  startedAt: number | null,
  now: number,
  prior: readonly GameState[],
  dailyDate: string | null,
  styleSwitches: number
): Settlement {
  return {
    modeId: game.modeId,
    styleId,
    score: game.score,
    highestTile: highestTileOf(game.board),
    reachedTarget: game.reachedTarget,
    endReason: game.endReason,
    timePlayedMs: startedAt === null ? 0 : Math.max(0, now - startedAt),
    startedAt,
    // 合并次数只能沿撤销路径数，判据在 achievements.countMergesAlongPath
    merges: countMergesAlongPath(prior, game),
    styleSwitches,
    dailyDate,
  }
}

/** 从没结算过时的统计。四个数字全 0，成就进度为空 */
export function emptyStats(): StatsRecord {
  return {
    version: STORAGE_VERSION,
    totalRuns: 0,
    wins: 0,
    timePlayedMs: 0,
    achievements: emptyAchievementProgress(),
    lastRunStartedAt: null,
  }
}

/**
 * 把一次结算并进一条记录。**幂等**：同一个结算递两次，结果逐字节相同。
 *
 * 幂等不靠第二套机制，靠的就是最大值语义本身——best score 与 highest Tile 都是
 * max，max(max(a,b),b) === max(a,b)。所以「写两次」与「写一次」在这两个数字上
 * 不可区分，这正是 SPEC §3.3 要的形状。
 */
export function applySettlement(record: StyleRecord | null, settlement: Settlement): StyleRecord {
  const previous = record ?? { version: STORAGE_VERSION, bestScore: 0, highestTile: 0 }
  return {
    version: STORAGE_VERSION,
    bestScore: Math.max(previous.bestScore, settlement.score),
    highestTile: Math.max(previous.highestTile, settlement.highestTile),
  }
}

/** 把一次结算并进统计的结论。`unlocked` 只装**这一次**新解锁的成就 */
export interface StatsOutcome {
  stats: StatsRecord
  /** 本次新解锁的成就 id。空数组 = 这一局没有解锁任何成就 */
  unlocked: readonly AchievementId[]
}

/**
 * 把一次结算并进统计。**同一次结算只数一次**（mode-contract §3「结算只执行一次」）。
 *
 * 判据是 `startedAt`：它与上一次被数进去的那一局相同，就原样返回——
 * 同一次结算被递第二次时，总数不许从 1 变成 2。分数与最高方块在 applySettlement
 * 那边本来就幂等，所以这里只管计数。
 *
 * 胜局数按 `reachedTarget` 而不按 `endReason`，理由写在 Settlement.reachedTarget 上。
 *
 * **成就进度与计数在同一条路上走**：`unlocked` 是「这一次新解锁了哪些」，由
 * 落库前的进度与落库后的进度相减得到——不是界面上算出来的一份。界面提示因此只响一次：
 * 刷新之后 hydrate 只读盘上那份已解锁列表，谁也不再算一次差。
 */
export function applyRunToStats(
  stats: StatsRecord | null,
  settlement: Settlement
): StatsOutcome {
  const previous = stats ?? emptyStats()
  if (settlement.startedAt !== null && settlement.startedAt === previous.lastRunStartedAt) {
    // 已经数过这一局了。原样返回**同一个对象**（引用相等），调用方拿它当「什么都没发生」看
    return { stats: previous, unlocked: [] }
  }
  // 结算载荷与 RunFacts 结构同名（成就那边刻意不 import 渲染层的类型），直接递过去
  const outcome = applyRunToAchievements(previous.achievements, settlement)
  return {
    stats: {
      version: STORAGE_VERSION,
      totalRuns: previous.totalRuns + 1,
      wins: previous.wins + (settlement.reachedTarget ? 1 : 0),
      timePlayedMs: previous.timePlayedMs + settlement.timePlayedMs,
      achievements: outcome.progress,
      lastRunStartedAt: settlement.startedAt,
    },
    unlocked: outcome.unlocked,
  }
}

/** `mode:style` → id 对。形状不对就是 null（调用方按整桶拒绝处理） */
function parseRecordKey(key: string): { modeId: ModeId; styleId: StyleId } | null {
  // 必须正好两段：`classic:material:extra` 这种多出来一段的键说明它是别的东西写的，
  // 截前两段「差不多能用」正是猜
  const parts = key.split(':')
  if (parts.length !== 2) return null
  const [modeId, styleId] = parts
  if (!MODES.some((mode) => mode.id === modeId)) return null
  if (!THEMES.some((theme) => theme.id === styleId)) return null
  return { modeId: modeId as ModeId, styleId: styleId as StyleId }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isInteger(value: unknown, min: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min
}

/** 一条记录能不能用。版本先判，与 session 桶同一条次序（见 session.ts 的 STORAGE_VERSION） */
export function decodeStyleRecord(raw: unknown): StyleRecordParse {
  if (raw === null || raw === undefined) return { kind: 'absent' }
  if (!isRecord(raw)) return { kind: 'rejected', reason: 'shape' }
  if (raw.version !== STORAGE_VERSION) return { kind: 'rejected', reason: 'version' }
  if (!isInteger(raw.bestScore, 0)) return { kind: 'rejected', reason: 'shape' }
  if (!isInteger(raw.highestTile, 0)) return { kind: 'rejected', reason: 'shape' }
  return {
    kind: 'ok',
    record: { version: STORAGE_VERSION, bestScore: raw.bestScore, highestTile: raw.highestTile },
  }
}

/**
 * 整桶记录。**任何一条读不出来 = 整桶拒绝**，挑一条能看的用不是「恢复」。
 *
 * 键里的身份与值里的数字分开校验：一个 `aero:classic` 的键说明这份数据来自另一套
 * 风格注册表，那时照它显示一行「某风格 9999 分」是在编一个不存在的风格。
 */
export function decodeRecords(entries: readonly { key: string; value: unknown }[]): RecordsParse {
  if (entries.length === 0) return { kind: 'absent' }
  const decoded: RecordEntry[] = []
  for (const entry of entries) {
    const ids = parseRecordKey(entry.key)
    if (ids === null) return { kind: 'rejected', reason: 'shape' }
    const parsed = decodeStyleRecord(entry.value)
    if (parsed.kind === 'rejected') return { kind: 'rejected', reason: parsed.reason }
    // absent 只可能出现在「键在、值没了」这种自相矛盾的桶里：同样不当成能看
    if (parsed.kind === 'absent') return { kind: 'rejected', reason: 'shape' }
    decoded.push({
      modeId: ids.modeId,
      styleId: ids.styleId,
      bestScore: parsed.record.bestScore,
      highestTile: parsed.record.highestTile,
    })
  }
  return { kind: 'ok', entries: decoded }
}

/** 统计桶能不能用。同一套版本 / 形状判据 */
export function decodeStats(raw: unknown): StatsParse {
  if (raw === null || raw === undefined) return { kind: 'absent' }
  if (!isRecord(raw)) return { kind: 'rejected', reason: 'shape' }
  if (raw.version !== STORAGE_VERSION) return { kind: 'rejected', reason: 'version' }
  if (!isInteger(raw.totalRuns, 0)) return { kind: 'rejected', reason: 'shape' }
  if (!isInteger(raw.wins, 0)) return { kind: 'rejected', reason: 'shape' }
  if (!isInteger(raw.timePlayedMs, 0)) return { kind: 'rejected', reason: 'shape' }
  const achievements = decodeAchievementProgress(raw.achievements)
  // 成就进度这一层只说形状（版本上面已经判过）：缺字段按「还没有进度」收，给了却对不上
  // 形状则整桶拒绝——猜一个默认进度会造出「解锁了一半成就」的假象，而本地存储没有谁能修
  if (achievements.kind === 'rejected') return { kind: 'rejected', reason: 'shape' }
  // 幂等键允许 null（从没结算过），否则必须是 ≥1 的整数——与 startedAt 同一道判据
  if (raw.lastRunStartedAt !== null && !isInteger(raw.lastRunStartedAt, 1)) {
    return { kind: 'rejected', reason: 'shape' }
  }
  return {
    kind: 'ok',
    record: {
      version: STORAGE_VERSION,
      totalRuns: raw.totalRuns,
      wins: raw.wins,
      timePlayedMs: raw.timePlayedMs,
      achievements:
        achievements.kind === 'ok' ? achievements.progress : emptyAchievementProgress(),
      lastRunStartedAt: raw.lastRunStartedAt as number | null,
    },
  }
}

/**
 * 读两个新桶的结论由**调用方**用 decodeRecords / decodeStats 现取：那里要分清
 * 「没存过」与「读不得」，而这两件事在界面上是两句话，放进一个帮手上就分不开了。
 * 所以本文件不提供「读一整个 stats 出来」的便利函数——便利函数正是藏默认值的地方。
 */

/** 时长 → 'M:SS' / 'H:MM:SS'。给统计面板用 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const seconds = totalSeconds % 60
  const minutes = Math.floor(totalSeconds / 60) % 60
  const hours = Math.floor(totalSeconds / 3600)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}

/**
 * 战绩写不进去时界面上说的那句。
 *
 * 与 session 那句分开：那一句的主语是**撤销还在**（mode-contract §4 的原话口径），
 * 而这一局已经打完了，没有什么可撤销的——能说的是「这一局的战绩没有记进去」。
 * 反过来说「进度丢了」不是事实：分数与棋盘都在屏幕上，只是本地记录少了一条。
 */
export function settlementWriteFailureMessage(error: unknown): string {
  return `${describeStorageFailure(error)}这一局的战绩没有写入本地记录。`
}
