import type { ModeId } from '../shared/modes'
import { MODES } from '../shared/modes'
import type { GameState } from '../shared/types'

/**
 * 模式轴成就的**纯判定**（计划附录「本次成就清单」的九个模式轴成就 · SPEC §3.3）
 *
 * 本文件零 DOM、零 `indexedDB`、零 `window`、零 `Date`：一次结算带来的**本局事实**
 * 由调用方喂进来，解锁与进度从这些事实算出来。于是「这一局该不该解锁某个成就」可以在
 * node 环境里被单测逐条驱动，而不必先在浏览器里打一局——T14 的闸门已经证明过：
 * 没人在真实环境里跑过的那一层，恰恰是缺陷最爱住的地方。
 *
 * **没有任何「本局用过撤销」的标记，今后也不许有**（ADR-0003 + SPEC §6）。撤销过
 * 的一局与干净的一局在记录里逐字节同形，T17 的两条测试钉的就是这件事。本文件因此
 * 只消费**能从持久化状态推导出来**的本局事实：
 *   · 分数 / 最高方块 / 曾达标 —— 终局 GameState 自己就带着；
 *   · 合并次数 —— 沿结算时的撤销路径逐段数（见 countMergesAlongPath）；
 *   · Daily 日期 —— SessionRecord.dailyDate（T08：它不能从种子反推，只能由结算方带来）。
 *
 * 进度住在 stats 桶里（SPEC §3.3「stats stores ... achievement unlocks」），形状判据在
 * 本文件的 decodeAchievementProgress，与 STORAGE_VERSION 同一套版本 / 拒绝次序。
 *
 * **为什么只有七个 id**：「完美一局」与「无作弊通关」要的是「这一局**曾经**用过撤销 /
 * 作弊交换」，而撤销把前态弹出撤销栈之后，那件事在持久化状态里不再留下任何痕迹——
 * undo 之后 history.length 与 moves 一起回退，两者之差只在交换时变化（见
 * countMergesAlongPath 上方对 `history.length - moves` 的说明）。判定这两个成就需要
 * 一个只增不减的计数器，而加这个字段正是 ADR-0003 明令禁止的标记字段。owner 裁决
 * 之前这两个成就**不实现**，而不是换一个将就的推导。
 */

/**
 * 已实现的模式轴成就 id。
 *
 * id 是成就的身份：它进 stats 桶的 `unlocked` 列表，于是**改名就是一管理解进度清零**。
 * 界面上显示的是 label，id 只在存档与 e2e 的 data-* 里出现。
 */
export type AchievementId =
  /** 首胜：任一模式第一次胜利 */
  | 'first-win'
  /** 模式收藏家：六个模式各赢至少一次 */
  | 'mode-collector'
  /** 4096：任一模式合出 4096 */
  | 'tile-4096'
  /** 大数猎人：合出 8192 */
  | 'tile-8192'
  /** 快手：Time Attack 单局超过 20000 分 */
  | 'quick-hand'
  /** 每日坚守：连续 7 个 UTC 日期各结算至少一局 Daily */
  | 'daily-stand'
  /** 合并机器：单局完成 200 次合并 */
  | 'merge-machine'

export interface AchievementDefinition {
  id: AchievementId
  /** 界面用名（中文） */
  label: string
  /** 解锁条件的原话。锁着的时候照实显示它，不把条件藏起来 */
  condition: string
}

/**
 * 全部已实现成就的**恒定次序**。
 *
 * 恒定不只是好看：`unlocked` 列表按它排序，于是「同样的进度 → 同样的字节」，
 * 刷新前后逐字节可比；e2e 断言第几个成就也才有个稳定下标。
 */
export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  { id: 'first-win', label: '首胜', condition: '任一模式首次胜利' },
  { id: 'mode-collector', label: '模式收藏家', condition: '六个模式各赢至少一次' },
  { id: 'tile-4096', label: '4096', condition: '任一模式合出 4096' },
  { id: 'tile-8192', label: '大数猎人', condition: '合出 8192' },
  { id: 'quick-hand', label: '快手', condition: 'Time Attack 单局超过 20000 分' },
  { id: 'daily-stand', label: '每日坚守', condition: '连续 7 个 UTC 日期各结算至少一局 Daily' },
  { id: 'merge-machine', label: '合并机器', condition: '单局完成 200 次合并' },
]

/** 模式收藏家的目标：**当前注册表里有几个模式**就得赢几个，不写死 6（modes.ts 是唯一真话） */
export const MODE_COLLECTOR_TARGET = MODES.length

/** 4096：计划附录的「任一模式合出 4096」 */
export const TILE_4096 = 4096

/** 大数猎人：计划附录的「合出 8192」 */
export const TILE_8192 = 8192

/** 快手：计划附录的「Time Attack 单局超过 20000 分」。**超过**，所以判据是严格大于 */
export const QUICK_HAND_SCORE = 20000

/** 每日坚守：连续 7 个 UTC 日期 */
export const DAILY_STREAK_TARGET = 7

/** 合并机器：单局 200 次合并 */
export const MERGE_MACHINE_COUNT = 200

/**
 * 成就进度（住在 stats 桶里）。
 *
 * 每一项都是**只增不减**的最大值 / 并集语义，这正是 SPEC §3.3 要的形状：同一次结算
 * 递两次，进度逐字节相同，所以「写两次」与「写一次」在这里不可区分。
 */
export interface AchievementProgress {
  /** 已解锁的成就 id，按 ACHIEVEMENTS 的次序。展示与「是否已解锁」都读它 */
  unlocked: readonly AchievementId[]
  /** 赢过的模式（判据是曾达标，与 stats.wins 同一条）。模式收藏家的进度 */
  modesWon: readonly ModeId[]
  /** 历史最高方块。4096 与大数猎人读它 */
  highestTile: number
  /** 单局最高合并数（沿结算时的撤销路径数）。合并机器读它 */
  bestMerges: number
  /** Time Attack 单局最高分。快手读它 */
  bestTimeAttackScore: number
  /** 连续 Daily 结算链上的最后一天（UTC 日期串）；从没结算过 Daily 为 null */
  dailyStreakDate: string | null
  /** 连续天数。同一天再结一局不推进，断一天从头数 */
  dailyStreakLength: number
}

/** 从没有任何进度时的形状。刚打开这个页面就是这样 */
export function emptyAchievementProgress(): AchievementProgress {
  return {
    unlocked: [],
    modesWon: [],
    highestTile: 0,
    bestMerges: 0,
    bestTimeAttackScore: 0,
    dailyStreakDate: null,
    dailyStreakLength: 0,
  }
}

/**
 * 一次结算带来的本局事实。
 *
 * 它与 `Settlement`（records.ts）**结构同名**：结算载荷本来就要带着这些字段跨过
 * 「结算即作废 session」那道边界，所以调用方直接把 settlement 递进来即可，不必再抄一份。
 * 这里单独声明而不 import 那个类型，是为了让 `src/game/` 不依赖渲染层（ADR-0001 的分工）。
 * 也因此**这里不自己算最高方块**：那一个数 records.ts 已经在算（highestTileOf），
 * 抄一份就是同一个概念有两个实现。
 */
export interface RunFacts {
  modeId: ModeId
  score: number
  highestTile: number
  /** 曾达到目标块。胜局判据，与 stats.wins 同一条（达标是里程碑，不是终局） */
  reachedTarget: boolean
  /** 本局合并次数（沿结算时的撤销路径数） */
  merges: number
  /** 本局的 Daily UTC 日期串；非 Daily 为 null */
  dailyDate: string | null
}

/** 一次结算的成就结论：新进度，以及**这一次**新解锁了哪些成就 */
export interface AchievementOutcome {
  progress: AchievementProgress
  /** 只装这一次新解锁的。同一个成就第二次递进来时空数组，于是提示不会重复响 */
  unlocked: readonly AchievementId[]
}

/** 棋盘上这一局出现过的方块身份（合并会吞掉一个身份，见 mergeCountBetween） */
function tileIdsOf(state: GameState): Set<number> {
  const ids = new Set<number>()
  for (const row of state.board) {
    for (const cell of row) {
      if (cell !== null && cell !== 'wall') ids.add(cell.id)
    }
  }
  return ids
}

/**
 * 一次状态迁移里完成了多少次合并 = **消失的方块身份数**。
 *
 * 为什么可以这么数：`slideBoard` 合并时保留「落在目标格上」的那个身份、吞掉另一个
 * （board.ts 的身份归属注释），生成只新增一个从未用过的身份（spawn.ts 的 nextTileId）。
 * 所以一次移动前后的身份差集，恰好就是被合并吞掉的那几个——滑动不吞身份、交换一个都
 * 不吞（两枚方块换个位置，身份集合逐字节相同）、生成只加不删。三条合起来，这个差
 * 的大小就是合并次数，且**不需要**任何计数器参与。
 *
 * 它同时解释了 `history.length - moves` 为什么数不出撤销：一次有效移动让历史与 moves
 * 同时 +1，一次撤销让两者同时 −1，两者之差只在**交换**时 +1（交换进历史、不进 moves）。
 * 所以那个差是「路径上的交换数」，与撤销无关；而撤销弹掉的前态在持久化状态里不留任何
 * 痕迹（重做同一步会还原出逐字节相同的状态），「曾经撤销过」因此**不可推导**。
 */
export function mergeCountBetween(before: GameState, after: GameState): number {
  const beforeIds = tileIdsOf(before)
  const afterIds = tileIdsOf(after)
  let swallowed = 0
  for (const id of beforeIds) {
    if (!afterIds.has(id)) swallowed += 1
  }
  return swallowed
}

/**
 * 沿一条撤销路径累计合并次数：`prior[0] → prior[1] → … → prior[n-1] → final`。
 *
 * **只数当前路径**，与 `moves` 同一条口径：撤销把一步从路径上摘掉，重做又放回来，
 * 于是被撤销又重做的那一步只算一次。「单局完成 200 次合并」在撤销存在的前提下只有
 * 这一种可复现的读法——按「这辈子按过的所有合并键」数的话，刷新之后无从恢复。
 *
 * `prior` 就是 store 的 `history`（索引 0 是开局那一个状态，越往后越新），`final` 是
 * 结算那一刻的终局。整条路径都在 history 桶里持久化（T16），所以这个数跨刷新不变。
 */
export function countMergesAlongPath(
  prior: readonly GameState[],
  final: GameState
): number {
  let merges = 0
  let current: GameState | null = null
  for (const state of prior) {
    if (current !== null) merges += mergeCountBetween(current, state)
    current = state
  }
  if (current !== null) merges += mergeCountBetween(current, final)
  return merges
}

/**
 * UTC 日期串 → 从公元纪元起算的天数。形状不对返回 null（运行期走到这里的都是合法形状，
 * 判据在 decodeAchievementProgress；导出是为了让「连续两天」这件事可被单独钉住）。
 *
 * **不用 `Date`**：`src/game/` 一行 Date 都没有（ADR-0001），而这里要的只是一个
 * 「两个日期差几天」的算术。用民用历法的天算术（Howard Hinnant 的 days_from_civil）
 * 现算，纯整数除法，没有时区、没有闰秒、没有本地化——UTC 日期的差就该是这个数。
 */
export function utcDayNumberOf(date: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (match === null) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  // 一月与二月按「上一年的十三、十四月」算，于是闰日永远落在年末
  const shiftedYear = month <= 2 ? year - 1 : year
  const era = Math.floor(shiftedYear / 400)
  const yearOfEra = shiftedYear - era * 400
  const shiftedMonth = month > 2 ? month - 3 : month + 9
  const dayOfYear = Math.floor((153 * shiftedMonth + 2) / 5) + day - 1
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear
  return era * 146097 + dayOfEra - 719468
}

/**
 * 把一次结算并进成就进度。**纯函数、可重放**：同一份进度与同一份事实，结论逐字节相同。
 *
 * 每一项都只增不减（最大值 / 并集），所以同一次结算递两次与递一次不可区分——
 * 与 applySettlement 的最大值语义同一条理由（SPEC §3.3 要的形状）。
 */
export function applyRunToAchievements(
  progress: AchievementProgress | null,
  facts: RunFacts
): AchievementOutcome {
  const previous = progress ?? emptyAchievementProgress()
  const next: AchievementProgress = {
    ...previous,
    unlocked: previous.unlocked,
    modesWon: previous.modesWon,
    highestTile: Math.max(previous.highestTile, facts.highestTile),
    bestMerges: Math.max(previous.bestMerges, facts.merges),
    bestTimeAttackScore:
      facts.modeId === 'time-attack'
        ? Math.max(previous.bestTimeAttackScore, facts.score)
        : previous.bestTimeAttackScore,
  }

  /**
   * 模式收藏家的进度：赢过的模式。
   *
   * 判据是 `reachedTarget` 而不是 `endReason === 'won'`——mode-contract §3 定「达标只是
   * 里程碑」，SPEC §3.3 的「including a run that reached the target and continued」说的
   * 就是达标后继续玩到死局再收工那种：结束原因是 deadlock，但它确实赢过。与
   * stats.wins 按同一把尺子量，两个数字才对得上。
   */
  if (facts.reachedTarget && !next.modesWon.includes(facts.modeId)) {
    next.modesWon = [...next.modesWon, facts.modeId]
  }

  /**
   * 每日坚守的进度：**连续** UTC 日期、每天至少结算一局 Daily。
   *
   * 三条边界（owner 需要拍板的都拍在这里）：
   *   · 同一天第二次结算 —— 链条停在原地，不推进也不重来。一天里打几局都算
   *     「这一天结算过」，「连续 7 天」数的是日期，不是局数；
   *   · 差正好一天 —— 链条 +1；
   *   · 差两天及以上（含「隔了一天」）—— 链条**断**，从这一天重新数 1。
   *     N 与 N+2 是断的，这是「连续」的字面意思，没有中间态可选。
   *
   * 只认 Daily 结算：别的模式不推进也不打断链条（这一条成就问的是「每天打一局
   * 每日」，中间打一局经典不影响它）。日期只能来自 SessionRecord.dailyDate
   * （T08：seedFromUtcDate 是单向哈希，日期串从种子里反推不回来）。
   */
  if (facts.dailyDate !== null) {
    const today = utcDayNumberOf(facts.dailyDate)
    const last = next.dailyStreakDate === null ? null : utcDayNumberOf(next.dailyStreakDate)
    if (today !== null && last !== null && today === last) {
      // 同一天：原样留着
    } else if (today !== null && last !== null && today === last + 1) {
      next.dailyStreakLength += 1
      next.dailyStreakDate = facts.dailyDate
    } else {
      // 第一天，或断档：从今天重新数
      next.dailyStreakLength = 1
      next.dailyStreakDate = facts.dailyDate
    }
  }

  const unlocked = new Set(previous.unlocked)
  const newly: AchievementId[] = []
  const grant = (id: AchievementId): void => {
    if (unlocked.has(id)) return
    unlocked.add(id)
    newly.push(id)
  }

  if (facts.reachedTarget) grant('first-win')
  if (next.modesWon.length >= MODE_COLLECTOR_TARGET) grant('mode-collector')
  if (next.highestTile >= TILE_4096) grant('tile-4096')
  if (next.highestTile >= TILE_8192) grant('tile-8192')
  if (next.bestTimeAttackScore > QUICK_HAND_SCORE) grant('quick-hand')
  if (next.dailyStreakLength >= DAILY_STREAK_TARGET) grant('daily-stand')
  if (next.bestMerges >= MERGE_MACHINE_COUNT) grant('merge-machine')

  // 按 ACHIEVEMENTS 的恒定次序落库：刷新前后逐字节可比，e2e 也有稳定下标
  next.unlocked = ACHIEVEMENTS.filter((item) => unlocked.has(item.id)).map((item) => item.id)
  return { progress: next, unlocked: newly }
}

/** 成就进度读出来的结论。三态与其余桶同构：没存过不是错，存了读不得才是 */
export type AchievementProgressParse =
  | { kind: 'ok'; progress: AchievementProgress }
  /** 没有这个字段 = T17 时代的 stats（那时还没有成就进度），按「还没有任何进度」收 */
  | { kind: 'absent' }
  | { kind: 'rejected' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isCount(value: unknown, min: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min
}

function isIdList<T extends string>(value: unknown, known: readonly T[]): value is T[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'string' && known.includes(item as T))
  )
}

/** UTC 日期串的形状（与 session.ts 的 DATE_PATTERN 同一个口径，两边各自认一遍） */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * 成就进度的形状判据。
 *
 * **版本由调用方先判**（decodeStats 按 STORAGE_VERSION 拒旧版），所以这里只说形状。
 * 七个字段全都在：缺一个就说明这份数据来自另一种形状，那时猜一个默认值比读不出来
 * 更糟——它会造出一个「解锁了一半成就」的假进度，而本地存储没有谁能修它。
 */
export function decodeAchievementProgress(raw: unknown): AchievementProgressParse {
  if (raw === null || raw === undefined) return { kind: 'absent' }
  if (!isRecord(raw)) return { kind: 'rejected' }
  if (!isIdList(raw.unlocked, ACHIEVEMENTS.map((item) => item.id))) return { kind: 'rejected' }
  if (!isIdList(raw.modesWon, MODES.map((mode) => mode.id))) return { kind: 'rejected' }
  if (!isCount(raw.highestTile, 0)) return { kind: 'rejected' }
  if (!isCount(raw.bestMerges, 0)) return { kind: 'rejected' }
  if (!isCount(raw.bestTimeAttackScore, 0)) return { kind: 'rejected' }
  if (raw.dailyStreakDate !== null && typeof raw.dailyStreakDate !== 'string') {
    return { kind: 'rejected' }
  }
  if (typeof raw.dailyStreakDate === 'string' && !DATE_PATTERN.test(raw.dailyStreakDate)) {
    return { kind: 'rejected' }
  }
  if (!isCount(raw.dailyStreakLength, 0)) return { kind: 'rejected' }
  return {
    kind: 'ok',
    progress: {
      unlocked: raw.unlocked,
      modesWon: raw.modesWon,
      highestTile: raw.highestTile,
      bestMerges: raw.bestMerges,
      bestTimeAttackScore: raw.bestTimeAttackScore,
      dailyStreakDate: raw.dailyStreakDate,
      dailyStreakLength: raw.dailyStreakLength,
    },
  }
}

/** 界面上一句「解锁了什么」。给提示与统计面板共用，措辞只在这一处 */
export function achievementUnlockLabel(id: AchievementId): string {
  const found = ACHIEVEMENTS.find((item) => item.id === id)
  return found === undefined ? id : found.label
}

/**
 * 「完美一局」与「无作弊通关」的挂点：**这里现在什么都没有，等 owner 裁决**。
 *
 * 计划附录里的两条：
 *   · 完美一局 = 不使用撤销通关
 *   · 无作弊通关 = 不使用作弊交换通关
 *
 * 裁决落成之后，接手的人要写的就是 applyRunToAchievements 里与上面七个谓词并排的两行：
 *
 *     if (facts.undoCount > 0) grant('perfect-run')
 *     if (facts.swapCount > 0) grant('no-cheat-run')
 *
 * 外加两件事，缺一不可：
 *   1. `AchievementId` 联合里添 'perfect-run' / 'no-cheat-run'，`ACHIEVEMENTS` 里按附录
 *      原话添两条（label 与 condition 直接抄，**不要改写成别的口径**）；
 *   2. `RunFacts` 各多一个字段，而且它们**只能由运行期累加**：
 *        undoCount: number   —— 本局撤销过几次
 *        swapCount:  number   —— 本局作弊交换过几次
 *
 * 为什么必须是累加量而不是结算时的快照：撤销把前态弹出撤销栈之后，那件事在持久化状态里
 * 不留痕迹——`history.length` 与 `moves` 一起回退（撤销恢复的是整个前态），重做同一步会
 * 还原出**逐字节相同**的状态（rngState 也一起回退），`initialSeed` 是开局那一颗、与撤销
 * 无关。所以「本局曾经撤销过」这个事实只能由运行期记着，而它要跨过刷新活在盘上，就得在
 * `SessionRecord` 里有一个字段——那正是 ADR-0003 禁止的「本局用过撤销」标记。
 *
 * **因此在 owner 拍板之前，这里有意留空。** 一个将就的替代口径（例如按「结算那一刻的
 * 路径上有没有撤销痕迹」判）会在「撤销后又重做同一步」这种真实操作上给出反的结论，
 * 而那种结论比没有成就更糟：它会让玩家以为自己在用一个有漏洞的排行榜。
 */

