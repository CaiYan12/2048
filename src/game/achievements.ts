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
 * **为什么是十一个**：`mode-collector`（六个模式各赢一次）与 `daily-stand`（连续 7 个
 * UTC 日期各结算一局 Daily）跨局才成立，单局内无法自证，按 ADR-0007 直接退休——
 * 注册表里没有它们的行，界面上也不留占位。`first-merge` 是 2026-09-28 之后应所有者
 * 要求**新加**的第七个（不在原附录里）：它同样单局可自证，而且是全场最早能拿到的
 * 里程碑——玩家不必打到中后盘才第一次看见这套祝贺。
 * **一念神魔**（T29）又把末尾三颗带进来：道通成魔 / 学艺不精 / 当断即断，条件全是
 * 「本局在抉择里发生了什么」，由彩蛋进度那一个字段（`RunFacts.shenmoOutcomes`）供着。
 * 父规格的架构决策 6 说得很清楚：**一遍只算完整的 B → A**，所以那一个记的是「结出的果」，
 * 不是「走到第几步」。**第十一颗由 T32 的二念落地**：`shenmo-second-pass`（走火入魔），
 * 条件是本局第二次完整走完 B → A——那个「第二次」落地为**一个新的果**
 * （`second-pass`）而不是同一个果出现两遍，所以 `includes` 一个成员就够，不必计数
 * （host 的 `recordShenmoOutcome` 本来就是幂等的，同一条记录记两遍它只认第一遍）。
 *
 * **`note` 字段（T31）只归一念神魔那四颗**：它是这几颗成就自己的梗，即用户给的原话。
 * 住注册表而不是住三套风格各自的祝词里，与 emoji 同一条理由（ADR-0007 把 emoji 裁成
 * 「内容，不是装饰」）：那是这几颗成就的笑话本身，不是风格在说话。其余七颗没有它，
 * 于是三套 toast 照旧显示各自的祝词——一个字节不动。
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
  /** 道通成魔：一念神魔的第一遍——本局在抉择里先 B 后 A（T29） */
  | 'shenmo-first-pass'
  /** 学艺不精：本局在抉择刚开时先点了 A（T29） */
  | 'shenmo-wrong-order'
  /** 当断即断：本局任由那道环流尽（T29） */
  | 'shenmo-hesitation'
  /** 走火入魔：本局第二次在抉择里先 B 后 A（T32） */
  | 'shenmo-second-pass'

/**
 * 「一念神魔」的抉择结出的三种果（T29 · 父规格的架构决策 5）。
 *
 * **只有一种是时钟到期授予的**：`hesitated`。`wrong-order` 是玩家点的，`first-pass` 也是
 * 玩家点的，而第一段窗口到期**什么都不授予**（一个打错的码不该指控任何人）——所以它不在
 * 这个联合里。
 *
 * 为什么这个类型住在 `src/game/`：它是**成就的事实**，于是 `RunFacts` 要为它开一个字段。
 * 判定住在这一层、渲染层只负责产出它，这正是 ADR-0001 的分工反过来用——渲染层可以依赖
 * 规则层，规则层一个字节都不碰渲染层。
 *
 * **`second-pass` 与 `first-pass` 是两个果，不是同一个果结两次**（T32）：二念的判据是
 * 「这是第二遍」，而宿主记果是幂等的（同一个果只记一次）——所以第二遍若还结
 * `first-pass`，store 那儿一个比特都不会动，走火入魔也就永远解锁不了。让机器在第二遍
 * 结出一个**新**的果，`includes('second-pass')` 就成了最直白的判据，而「第三遍及以后」
 * 也自然落在同一个成员上（轮回没有第三种果）。
 */
export type ShenmoOutcome =
  /** 先点 A：形不成形，意不在意（学艺不精） */
  | 'wrong-order'
  /** 放任第二段窗口流尽：心若不决（当断即断） */
  | 'hesitated'
  /** 先 B 后 A：既见未来，为何不拜（道通成魔）。父规格的架构决策 6：**这才算一遍** */
  | 'first-pass'
  /**
   * **第二次**先 B 后 A（T32 · 走火入魔）。第一遍之后每一遍都结它——包括第三遍、
   * 第四遍：笑话在「你又来了一遍」，轮回没有第三种果。
   */
  | 'second-pass'

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
  /**
   * 这一颗成就自己的**梗**（T31 · 父规格的架构决策 9 与 17）。一念神魔那四颗各有一句
   * 用户给的原话，其余七颗没有这个字段。
   *
   * 为什么它不住 `condition`：`condition` 是战绩面板照实显示的「本局」口径判据，塞一句
   * 调侃进去等于让面板说谎。为什么它不住三套风格各自的祝词里：emoji 在 ADR-0007 里
   * 已被裁定为「内容，不是装饰」，这几句话是同一类东西——**它们是这几颗成就的笑话本身，
   * 不是风格的嗓音**。祝词留给其余七颗。
   *
   * 它唯一的读者是 toast：成就带 `note` 时下行显示它，不带时照旧显示本套自己的祝词
   * （三份 toast.tsx 逐条相同的那个分支）。**它不出现在战绩面板上**——那里说的是条件。
   */
  note?: string
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
  // —— 一念神魔（T29 / T32）——
  // 追加在末尾，也因为「注册表的次序就是展示次序」，而彩蛋这四个是**后来才有**的：
  // 前七个随便开一局就有机会看见，这四个要玩家自己打出一串口诀来。父规格的架构决策 9
  // 定的次序是「一念、错序、犹豫、二念」，T29 落地前三颗，T32 补上第四颗。
  //
  // 图标与「用户原话」：道通成魔取 🐒👿（猴脸 + 角，一念神魔的正面与反面）；
  // 学艺不精 🤜、当断即断 🔏。三句原话——「既见未来，为何不拜？」「形不成形，意不在意」
  // 「心若不决，毋寻邪道」——**不是 `condition`**：那是战绩面板照实显示的「本局」口径
  // 判据，塞一句调侃进去就等于让面板说谎。T31 因此把 `note` 立成注册表的可选字段，
  // 三句话各归其位（T29 当时只能把它们记在这一段注释里）。
  //
  // **第四颗（二念 / 走火入魔）由 T32 入册**（T31 把那一行的形状停在注释里等它）：它就是
  // 那颗**悬在视口顶端**的成就——走完第二遍之后页面被扣下，只剩它与一颗「重新开始」，
  // 于是这句诗也成了这一局余下时间里唯一的一行字。emoji 取 😈：道通成魔那颗是 🐒👿
  // （一体两面），这一颗是彻底翻过去了的那一面。
  {
    id: 'shenmo-first-pass',
    label: '道通成魔',
    emoji: '🐒👿',
    condition: '本局在抉择里先 B 后 A',
    note: '既见未来，为何不拜？',
  },
  {
    id: 'shenmo-wrong-order',
    label: '学艺不精',
    emoji: '🤜',
    condition: '本局在抉择刚开时先点了 A',
    note: '形不成形，意不在意',
  },
  {
    id: 'shenmo-hesitation',
    label: '当断即断',
    emoji: '🔏',
    condition: '本局任由那道环流尽',
    note: '心若不决，毋寻邪道',
  },
  {
    id: 'shenmo-second-pass',
    label: '走火入魔',
    emoji: '😈',
    condition: '本局在抉择里第二次先 B 后 A',
    note: '一念为神，一念成魔，念念为贪，非念而魔',
  },
]

/**
 * 首次合并：本局合并次数到 1（**阈值就是 1**）。
 *
 * 它是 2026-09-28 应项目所有者要求新加的第七个成就（原附录里的六个之外），
 * 加它的理由与 ADR-0007 同一条：条件必须单局可自证——`merges >= 1` 在第一步合并
 * 那一刻就成立，不需要任何跨局进度。它在注册表里排第一，因为它是全场最早能拿到的
 * 里程碑（其余几个都要打到中后盘才有机会）。
 *
 * 「第七个」是**它当时**的序号，不是注册表现在的大小：T29 的彩蛋三颗追加在末尾、T32 的
 * 二念补第四颗，于是注册表到十一个（见文件头）。
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
  /**
   * 本局在「一念神魔」的抉择里结出过的果（T29）。**彩蛋唯一住进 store 的东西**
   * （父规格的架构决策 2）：码缓冲、阶段、两个窗口都是协调状态，住在渲染层；而成就是从
   * 本局事实派生的，事实只在 store 里拼得全。
   *
   * 三条性质，逐条对应一个会被问到的「为什么不」：
   *   · **不跟撤销回退**——它是发生过的事件，与 `styleSwitches` 同一条理由。撤销一步
   *     棋盘是回去了，可玩家真的点过那颗钮；
   *   · **不落盘**——没有任何结算、记录或统计要读它，而父规格的架构决策 10 已经把二念
   *     那一颗定成「内存字段」。刷新之后这一局的彩蛋进度从零起，果也还能再结一次；
   *   · **只记「结出的果」，不记「走到第几步」**——父规格的架构决策 6：一遍只算完整的
   *     B → A。放任任一段窗口流尽、或先点了 A，都**不算一遍**，不推进任何东西。
   */
  shenmoOutcomes: readonly ShenmoOutcome[]
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
 *   · 风格旅行者 = 本局切换次数到 5；
 *   · 道通成魔 = 本局结出过 `first-pass`（抉择里先 B 后 A，父规格的架构决策 6 的「一遍」）；
 *   · 学艺不精 = 本局结出过 `wrong-order`（抉择刚开时先点了 A）；
 *   · 当断即断 = 本局结出过 `hesitated`（放任那道环流尽）；
 *   · 走火入魔 = 本局结出过 `second-pass`（**第二次**先 B 后 A，T32）。
 *
 * **彩蛋那一组的一个边界**：放任**第一段**窗口流尽什么都不授予（父规格的架构决策 5）——
 * 一个打错的码不该指控任何人。所以 `ShenmoOutcome` 里没有「放任第一段」这个成员，它在
 * 裁决这一层连表达的可能都没有。
 *
 * **唯一一处不对称**：`style-traveller` 读的切换计数**不跟撤销回退**（ADR-0003 对那个
 * 计数的裁决），所以它解锁之后本局收不回来——而其余六个都随事实回退而收回。彩蛋那一组
 * 同理（`shenmoOutcomes` 是发生过的事件）：撤销一步不会把玩家点过的钮变回没点。
 * 这不是漏写：让那些事实可回退，玩家就能靠「撤销 + 再切一下」反复刷出同一条祝贺
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
  // 彩蛋四个（T29 / T32）。`includes` 而不是计数：四个条件的原话都是「本局发生过什么」，
  // 与「发生过几次」无关——同一个果发生过两次也只该祝贺一次（二念那一个靠的是**另一个**
  // 果 `second-pass`，所以这里照样不必计数）
  if (facts.shenmoOutcomes.includes('first-pass')) satisfied.add('shenmo-first-pass')
  if (facts.shenmoOutcomes.includes('wrong-order')) satisfied.add('shenmo-wrong-order')
  if (facts.shenmoOutcomes.includes('hesitated')) satisfied.add('shenmo-hesitation')
  if (facts.shenmoOutcomes.includes('second-pass')) satisfied.add('shenmo-second-pass')
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

/**
 * 这一条祝贺的**梗**：这一批成就里第一个带 `note` 的那一句；都没有就给 null。
 *
 * 为什么取「第一个」而不是拼起来：note 是一句完整的话（「既见未来，为何不拜？」），
 * 几句话拼在一行里谁也读不完。**「第一个」按 `ids` 给出的次序算**——宿主
 * （advanceAchievements）已经把它们按 ACHIEVEMENTS 的恒定次序排好，于是这与
 * names 那一行「稳定先后」是同一回事，不必在这里把注册表再翻一遍。
 *
 * null 的语义是「这一条没有自己的梗」——三套 toast 据此决定下行显示本套自己的祝词，
 * 于是「判断哪一句」只有这一处，三份实现不会漂开。
 */
export function achievementNoteOf(ids: readonly AchievementId[]): string | null {
  for (const id of ids) {
    const note = ACHIEVEMENTS.find((item) => item.id === id)?.note
    if (note !== undefined) return note
  }
  return null
}