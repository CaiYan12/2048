import type { ModeId } from '../shared/modes'
import type { GameState } from '../shared/types'

/**
 * 成就的**纯判定**：给一份「本局事实」，答「这一局此刻满足了哪几个成就」。
 *
 * 本文件零 DOM、零 `indexedDB`、零 `window`、零 `Date`：事实由调用方喂进来，解锁集合从
 * 这些事实算出来。于是「这一局该不该解锁某个成就」可以在 node 环境里被单测逐条驱动，
 * 而不必先在浏览器里打一局——T14 的闸门已经证明过：没人在真实环境里跑过的那一层，
 * 恰恰是缺陷最爱住的地方。
 *
 * **判据只有本局**（ADR-0007）。这一层不接受、也不读任何跨局累积的进度：
 *   · 分数 / 最高方块 / 曾达标 —— 终局 GameState 自己就带着；
 *   · 本局合并次数 —— 宿主增量维护（每步 O(1)，撤销按该步差值回退）；
 *   · 本局风格切换次数 —— session 桶的一个字段，它是**发生过的事件**，不是位置，
 *     所以住在撤销恢复不到的地方（T19）。
 *
 * 因此「同一个成就解锁了没有」这件事永远只由**眼前这一局**回答：同一份事实永远给出
 * 同一份集合，撤销改动了事实就把它收回（唯一例外见 unlockedAchievements 的注释）。
 * 成就 id 因此也不再是持久化身份——退休一个成就不需要存储迁移（ADR-0007）：
 * 没有任何字节写过盘，也就没有字节要迁。
 *
 * **为什么是七个**：`mode-collector`（六个模式各赢一次）与 `daily-stand`（连续 7 个
 * UTC 日期各结算一局 Daily）跨局才成立，单局内无法自证，按 ADR-0007 直接退休——
 * 注册表里没有它们的行，界面上也不留占位。`first-merge` 是 2026-09-28 之后应所有者
 * 要求**新加**的第七个（不在原附录里）：它同样单局可自证，而且是全场最早能拿到的
 * 里程碑——玩家不必打到中后盘才第一次看见这套祝贺。
 *
 * 风格轴那两条远期成就（`全风格征服` / `复古大师`）同样不在这里：它们的前提是
 * **整套特色风格上线**，在三套基准风格下连「全风格」指什么都说不清，所以
 * `AchievementId` 与 `ACHIEVEMENTS` 里都没有它们的 id——不是「先占一行、等以后填」，
 * 而是结构上就不给它们留位置。
 */

/**
 * 已实现的成就 id。
 *
 * id 是**界面与测试的身份**，不是持久化身份：它没有写进任何桶，所以退休它不用迁移
 * （ADR-0007；与风格 id 的规矩刚好相反）。
 */
export type AchievementId =
  /** 首次合并：本局完成第一次合并（全场最早能拿到的那个里程碑） */
  | 'first-merge'
  /** 首胜：本局达成目标块 */
  | 'first-win'
  /** 4096：本局合出 4096 */
  | 'tile-4096'
  /** 大数猎人：本局合出 8192 */
  | 'tile-8192'
  /** 快手：本局 Time Attack 超过 20000 分 */
  | 'quick-hand'
  /** 合并机器：本局完成 200 次合并 */
  | 'merge-machine'
  /** 风格旅行者：本局内切换 5 次以上风格 */
  | 'style-traveller'

export interface AchievementDefinition {
  id: AchievementId
  /** 界面用名（中文） */
  label: string
  /**
   * 祝贺里的那个图标。**它是内容，不是装饰**：它报出「你拿到了哪一个」，与 label 同一条
   * 职责——所以它住在这里，三套风格共用一份，而不是各抄一遍（各抄三份必然漂开）。
   *
   * 2026-09-28 应所有者要求加的。三套设计卡 §7 原先一律「禁 emoji 当装饰」，那是冲着
   * 棋盘、方块与外壳的静态长相说的；这一处是消息的一部分，禁令据此收窄，见各卡 §10。
   */
  emoji: string
  /** 达成条件的原话。战绩面板照实显示它——永远是一句「本局」的口径 */
  condition: string
}

/**
 * 全部已实现成就的**恒定次序**。
 *
 * 恒定不只是好看：解锁集合按它排序，于是「同一份事实 → 同一份集合」在字节上也可比，
 * 一条诉状里几个成就的先后因此稳定，e2e 也有稳定下标。
 */
export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  // 它排在最前：注册表的次序就是展示次序，而这是**最快能拿到**的那一个——
  // 随便开一局，几步之内第一次合并就解锁，玩家因此能立刻看懂这套祝贺机制在说什么
  { id: 'first-merge', label: '首次合并', emoji: '🧩', condition: '本局完成第一次合并' },
  { id: 'first-win', label: '首胜', emoji: '🏆', condition: '本局达成目标块' },
  { id: 'tile-4096', label: '4096', emoji: '💠', condition: '本局合出 4096' },
  { id: 'tile-8192', label: '大数猎人', emoji: '🚀', condition: '本局合出 8192' },
  { id: 'quick-hand', label: '快手', emoji: '⚡', condition: '本局 Time Attack 超过 20000 分' },
  { id: 'merge-machine', label: '合并机器', emoji: '⚙️', condition: '本局合并 200 次' },
  // 风格轴那一个排在最后：解锁集合按这张表排序，于是刷新前后逐字节可比
  { id: 'style-traveller', label: '风格旅行者', emoji: '🎨', condition: '本局切换 5 次以上风格' },
]

/**
 * 首次合并：本局合并次数到 1（**阈值就是 1**）。
 *
 * 它是 2026-09-28 应项目所有者要求新加的第七个成就（原附录里的六个之外），
 * 加它的理由与 ADR-0007 同一条：条件必须单局可自证——`merges >= 1` 在第一步合并
 * 那一刻就成立，不需要任何跨局进度。它在注册表里排第一，因为它是全场最早能拿到的
 * 里程碑（其余几个都要打到中后盘才有机会）。
 */
export const FIRST_MERGE_COUNT = 1

/** 4096：任一模式本局合出 4096 */
export const TILE_4096 = 4096

/** 大数猎人：本局合出 8192 */
export const TILE_8192 = 8192

/** 快手：Time Attack 本局超过 20000 分。**超过**，所以判据是严格大于 */
export const QUICK_HAND_SCORE = 20000

/** 合并机器：本局 200 次合并 */
export const MERGE_MACHINE_COUNT = 200

/**
 * 风格旅行者：「本局内切换 5 次以上风格」，**阈值钉在 5，判据是 `>=`**。
 *
 * 「以上」在边界上是含本数的（中文规范里「以上」含本数、「超过」不含），而同一张
 * 计划表里的「超过 20000 分」被实现成严格大于——同一份文件的两个措辞应当读出两个
 * 意思，否则它没必要换词。所以 **5 次解锁、4 次不解**，判据写成
 * `facts.styleSwitches >= STYLE_TRAVELLER_SWITCHES`。
 *
 * 钉在这里而不是留给读代码的人现猜：界面上照实显示的条件原话就是「切换 5 次以上」，
 * 常数与界面必须说同一个数。tests/unit/achievements.test.ts 把 4 / 5 / 6 三档都钉住，
 * 日后谁也换不成另一种读法。
 */
export const STYLE_TRAVELLER_SWITCHES = 5

/**
 * 本局事实：判定一个成就需要的全部输入。
 *
 * 它与结算载荷（records.ts 的 Settlement）**只是字段重合**，不是同一个东西：判定住在
 * `src/game/`，而 `src/game/` 不许依赖渲染层（ADR-0001 的分工）。所以这里单独声明，
 * 由调用方（store）在每一次对局状态变化之后现拼一份。
 *
 * **这里没有最高方块的计算**：那一个数 records.ts 已经有 highestTileOf，抄一份就是同一个
 * 概念有两个实现。调用方取那一份，连同商业模式无关的三个计数一起递进来。
 */
export interface RunFacts {
  modeId: ModeId
  score: number
  highestTile: number
  /** 曾达到目标块。胜局判据，与 stats.wins 同一条（达标是里程碑，不是终局） */
  reachedTarget: boolean
  /** 本局合并次数。宿主增量维护、撤销按该步差值回退（不读任何跨局进度） */
  merges: number
  /** 本局**真实发生**的风格切换次数。它只增不减，见 unlockedAchievements 的例外 */
  styleSwitches: number
}

/**
 * 这一局此刻解锁了哪几个成就。**纯函数、可重放**：同一份事实永远给出同一份集合。
 *
 * 集合按 `ACHIEVEMENTS` 的恒定次序给出。判据全是「本局」：
 *   · 首次合并 = 本局至少合并过一次（`merges >= 1`）——全场最早能拿到的那一个；
 *   · 首胜 = 本局曾达标（`reachedTarget`，与 stats.wins 同一把尺子：达标后继续玩到死局
 *     再收工那一局也算赢过）；
 *   · 4096 / 大数猎人 = 本局盘面上出现过的最高方块（合出 8192 必然先合出 4096，所以
 *     前者顺带解锁后者）；
 *   · 快手 = 本局是 Time Attack **且**本局分数超过 20000（别的模式打再高也不算）；
 *   · 合并机器 = 本局合并次数到 200；
 *   · 风格旅行者 = 本局切换次数到 5。
 *
 * **唯一一处不对称**：`style-traveller` 读的切换计数**不跟撤销回退**（ADR-0003 对那个
 * 计数的裁决），所以它解锁之后本局收不回来——而其余五个都随事实回退而收回。这不是
 * 漏写：让那个计数可回退，玩家就能靠「撤销 + 再切一下」反复刷出同一条祝贺
 * （ADR-0007 把它记为刻意保留的不对称，而不是待修的缺陷）。集合仍然是从事实**派生**的，
 * 只是那份事实里有一个只增不减的分量。
 */
export function unlockedAchievements(facts: RunFacts): readonly AchievementId[] {
  const satisfied = new Set<AchievementId>()
  if (facts.merges >= FIRST_MERGE_COUNT) satisfied.add('first-merge')
  if (facts.reachedTarget) satisfied.add('first-win')
  if (facts.highestTile >= TILE_4096) satisfied.add('tile-4096')
  if (facts.highestTile >= TILE_8192) satisfied.add('tile-8192')
  if (facts.modeId === 'time-attack' && facts.score > QUICK_HAND_SCORE) satisfied.add('quick-hand')
  if (facts.merges >= MERGE_MACHINE_COUNT) satisfied.add('merge-machine')
  if (facts.styleSwitches >= STYLE_TRAVELLER_SWITCHES) satisfied.add('style-traveller')
  // 按 ACHIEVEMENTS 的恒定次序落库：同一份事实 → 同一份集合，一条提示里几个成就的先后稳定
  return ACHIEVEMENTS.filter((item) => satisfied.has(item.id)).map((item) => item.id)
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
 * 宿主用它做两件事，都在 O(棋盘格数) 内完成、与撤销栈深度无关：
 *   · 一次有效移动之后 `mergeCountBetween(before, after)` 累加；
 *   · 一次撤销时对**同一对**状态再算一遍，得到的就是那一步当初加进去的数——
 *     撤销因此按步差值回退，而不是把整条路径重数一遍。
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
 * 于是被撤销又重做的那一步只算一次。
 *
 * 它只有一个调用者：宿主从存档恢复一局时**建立基线**。本局合并次数是那个「读不出状态
 * 的事实」，而整条撤销路径都在 history 桶里持久化（T16）——所以恢复时把路径数一遍，
 * 得到的正是刷新前那个数，合并机器的解锁因此不会被一次刷新抹掉。运行期不调它：
 * 那会变成每步 O(路径长度)。
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
 * 一次「锁定 → 解锁」跃迁带来的一批成就 = 一条祝贺。
 *
 * 它是**数据**，不是呈现：宿主（store）决定什么时候该有一条、把同一次跃迁里满足的
 * 几个成就合并成一条、并按 `ACHIEVEMENTS` 的次序排好；风格拿到它之后自己决定长相与
 * 消失表现（ADR-0002 的呈现插槽）。`key` 是这一条的身份，堆叠与「本条已结束」都认它。
 */
export interface AchievementToast {
  /** 这一条的身份。堆叠时 React 的 key 与「谁结束了」的回调都认它 */
  key: number
  /** 这一条里包含的成就，按 ACHIEVEMENTS 的恒定次序 */
  ids: readonly AchievementId[]
}

/** 界面上一句「解锁了什么」：一条祝贺里几个成就的名字拼起来用它，措辞只在这一处 */
export function achievementUnlockLabel(id: AchievementId): string {
  const found = ACHIEVEMENTS.find((item) => item.id === id)
  return found === undefined ? id : found.label
}

/** 同上，取的是那个图标。查不到时给一个中性图标，不抛——界面不该因为一个 id 崩掉 */
export function achievementEmoji(id: AchievementId): string {
  const found = ACHIEVEMENTS.find((item) => item.id === id)
  return found === undefined ? '✨' : found.emoji
}