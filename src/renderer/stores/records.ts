import type { Board, EndReason, GameState, StyleId } from '../../shared/types'
import { MODES, type ModeId } from '../../shared/modes'
import { STYLE_CATALOG } from '../../shared/styleCatalog'
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
 *   · `stats` 存 **总局数、胜局、累计时长**（加一个幂等键）。**没有成就字段**：
 *     ADR-0007 之后成就是单局可自证的东西，判定住在 `src/game/achievements.ts`、由 store
 *     在对局进行中驱动，两个桶里一个字节都不落——所以也就没有迁移、没有版本号变更。
 *
 * **没有任何「这一局用过撤销」的标记，也没有「完美一局」标志**（ADR-0003 + SPEC §6）：
 * 用过撤销的一局与干净的一局在记录里逐字节同形。两个「不使用撤销 / 不使用交换」的成就
 * 要的「曾经用过」在持久状态里不可推导（撤销弹掉前态后不留痕迹），按 owner 裁决之前
 * 不实现、也不为它们加字段——见 achievements.ts 头注。
 *
 * **T19 的风格切换次数也不在此列**：它是**事实**（这一局换过几次观感），不是对玩家
 * 行为的评判。它住在 session 桶而不是 records / stats：结算之后这一局连同计数一起作废，
 * 两个战绩桶里不留「切换过几次」——而单局内的成就判定要用它，所以它跟着这一局活到
 * 结算（跨刷新）为止（`SessionRecord.styleSwitches`）。
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
   * 每一步的时间戳都得从零加起。起始时刻因此进 session 桶（SessionRecord.startedAt）：
   * 不是规则数据，但必须跨过刷新活着。
   *
   * **Time Attack 不叠加第二项**：它的 deadline 已经把这局的墙上时间封了顶，
   * 到时强制结算，于是这个公式天然给出接近 180000 的一个数。在这里再补一笔
   * 「限时模式按限时算」就是同一段时间数两遍。
   */
  timePlayedMs: number
  /** 本局起始时刻；同时是统计的幂等键（StatsRecord.lastRunStartedAt） */
  startedAt: number | null
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
 * 没有「这一次解锁了什么」可言：成就的祝贺由 store 在对局进行中发出，与写盘无关
 * （ADR-0007）。
 */
export type SettlementWrite =
  | { kind: 'written' }
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
 * **它不再带成就相关的东西**：合并次数、风格切换次数、Daily 日期都只为单局成就判定
 * 服务，而那个判定现在住在 store、由对局状态驱动（ADR-0007），与写盘这一条路无关。
 */
export function settlementOf(
  game: GameState,
  styleId: StyleId,
  startedAt: number | null,
  now: number
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
  }
}

/** 从没结算过时的统计。三个数字全 0 */
export function emptyStats(): StatsRecord {
  return {
    version: STORAGE_VERSION,
    totalRuns: 0,
    wins: 0,
    timePlayedMs: 0,
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

/**
 * 把一次结算并进统计。**同一次结算只数一次**（mode-contract §3「结算只执行一次」）。
 *
 * 判据是 `startedAt`：它与上一次被数进去的那一局相同，就原样返回**同一个对象**
 * （引用相等）——调用方拿它当「什么都没发生」看，同一次结算被递第二次时总数也不许
 * 从 1 变成 2。分数与最高方块在 applySettlement 那边本来就幂等，所以这里只管计数。
 *
 * 胜局数按 `reachedTarget` 而不按 `endReason`，理由写在 Settlement.reachedTarget 上。
 *
 * **没有「这一次解锁了什么」可言**：成就的判定与祝贺都住在 store，与写盘无关
 * （ADR-0007）。于是这一段只剩三个计数。
 */
export function applyRunToStats(stats: StatsRecord | null, settlement: Settlement): StatsRecord {
  const previous = stats ?? emptyStats()
  if (settlement.startedAt !== null && settlement.startedAt === previous.lastRunStartedAt) {
    return previous
  }
  return {
    version: STORAGE_VERSION,
    totalRuns: previous.totalRuns + 1,
    wins: previous.wins + (settlement.reachedTarget ? 1 : 0),
    timePlayedMs: previous.timePlayedMs + settlement.timePlayedMs,
    lastRunStartedAt: settlement.startedAt,
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
  // 风格身份问共享目录，不问渲染注册表（同 session.ts 的 isKnownStyle）：记录里的键
  // 属于存档层，判它合不合法不该把各风格的 CSS 拉进这条依赖链
  if (!STYLE_CATALOG.some((entry) => entry.id === styleId)) return null
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

/**
 * 统计桶能不能用。同一套版本 / 形状判据。
 *
 * **它对未知字段宽容，对坏形状不宽容**（ADR-0007）：这里逐项取出自己认识的那几个字段，
 * 交出一份**只有那几个键**的记录，多出来的字段一律丢掉。于是上一版写下的那一条——里面
 * 还带着一个 `achievements` 块（含已退休的成就 id）——照旧读得出它那几个统计数字，而不是因为一个
 * 认不得的字段整条作废：退休一个成就不该让玩家丢掉战绩。旧字节也不必迁移：记录在下次
 * 结算时整条重写，多余的东西自然消失，所以没有版本号变更、没有迁移脚本。
 *
 * 宽容只到这里。`totalRuns` 是负数、`version` 对不上这类**形状本身是垃圾**的记录仍然
 * 整桶拒绝，绝不猜一个默认值（SPEC §3.3「不许假装持久化成功」）。
 */
export function decodeStats(raw: unknown): StatsParse {
  if (raw === null || raw === undefined) return { kind: 'absent' }
  if (!isRecord(raw)) return { kind: 'rejected', reason: 'shape' }
  if (raw.version !== STORAGE_VERSION) return { kind: 'rejected', reason: 'version' }
  if (!isInteger(raw.totalRuns, 0)) return { kind: 'rejected', reason: 'shape' }
  if (!isInteger(raw.wins, 0)) return { kind: 'rejected', reason: 'shape' }
  if (!isInteger(raw.timePlayedMs, 0)) return { kind: 'rejected', reason: 'shape' }
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
