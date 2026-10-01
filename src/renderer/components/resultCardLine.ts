import type { EndReason } from '../../shared/types'
import type { ResultTier } from './ResultLayer'

/**
 * 卡片那一行（T31 · 父规格的架构决策 17：**一个座位，两处用法**）。
 *
 * 它回答「这一局到底是怎么走的」，两种情形各要一句：
 *   · 这一局结出过「道通成魔」→ 彩蛋那一局的一句梗（一念收下了，账照算）；
 *   · 这一局死了（死局 / 超时 / 放弃）或赢着收工 → 一句本局总结，死因随 `endReason` 变，
 *     放弃那一次的罪名叫**弃甲曳兵**。
 *
 * **为什么两种情形共用一个函数而不是两套**：它们要的是同一个座位（卡片最末一行），拆成
 * 两套就等于让「哪一句出现在哪」这件事有两个真相。父规格把它点名成不许写成两套。
 *
 * **为什么是渲染层的一个纯模块，而不是 store 里的一个字段**：这一行没有第二个消费者，
 * 也不落盘（结算即清档，刷新之后看不见卡片）。它与 `runEndLabel` 是同一条路子——两个
 * 「按结束原因说话」的纯判定住在同一个目录，于是「为什么结束」与「这一局怎么走的」
 * 两句话挨在一起，谁也改不丢另一句。
 *
 * **数字全部来自入参，一个都不写死**：分数、最高块、合并次数、步数由调用方（App）从
 * 这一局现成的读数递进来。于是同一个函数对任何一局都给一句真话，e2e 里可以整句一字
 * 不差地断下来。
 *
 * 它**不**重复卡片上已经说过的话：标题与那一句话（`runEndLabel`）负责「为什么结束」，
 * 这一行只负责「账是多少」外加一声评注。唯一要斟酌的是放弃那一次的「弃甲曳兵」——卡片
 * 那一句是「主动放弃了本局」，这是一句新话，不是同一句换个说法。
 */

/** 本局事实 + 这一层是哪一档。**只有这一份形状**：App 拼好递进来，函数里一个字节的算术都没有 */
export interface CardLineFacts {
  /**
   * 此刻场上这一层的档位（`ResultPresence` 的 `ResultLayerSpec.tier`）。
   *
   * 为什么需要它：`endReason` 在**死局还没结算**与**里程碑还没收工**两种情形下都是 null，
   * 而这两种要的是两句不同的话——前者是死局总结，后者「这一局还没结束，没什么可说」。
   * 光看 endReason 分不开这两者。
   */
  tier: ResultTier
  /** 为什么结束。已结算那一侧才有；`won` 与 `stuck` 两档恒为 null */
  endReason: EndReason
  /** 本局分数（卡片读数同一个数） */
  score: number
  /** 本局最高方块（`records.highestTileOf`，与记录那一份同一把尺子） */
  highestTile: number
  /** 本局合并次数。撤销按该步差值回退，所以它是**眼前这条路径**的合并数 */
  merges: number
  /** 有效 Move 计数（`GameState.moves`：撤销减一，作弊交换不动它） */
  moves: number
  /** 本局结出过「道通成魔」（抉择里先 B 后 A）。它让这一行换成彩蛋那句梗 */
  wish: boolean
}

/** 道通成魔那一局的梗（父规格的架构决策 17 的第二种用法）。「账照算」说的是彩蛋不收钱 */
const WISH_HEAD = '一念收下了，账照算'

/** 死局的话头。**还没结算**（`stuck`）与**已结算**（`ended` + `deadlock`）共用它 */
const DEADLOCK_HEAD = '这一局是自己走完的'

/** 超时的话头。钟是墙上那三分钟，棋盘是手上这一盘——先满的是钟 */
const TIMEOUT_HEAD = '钟比棋盘先满'

/**
 * 放弃那一次的**罪名**（用户故事 37：走开也是结束的一种）。
 *
 * 父规格与 issue 都点名要这四个字。它不是「主动放弃了本局」的换说法——卡片那一句说
 * 的是事实，这一句说的是对这事实的评价。
 */
const ABANDONED_HEAD = '弃甲曳兵'

/** 赢着收工的话头 */
const WON_HEAD = '赢下的一局'

/**
 * 同一份账。**这是「一个机制」最直白的那一处**：四种结束方式与道通成魔那一局共用它，
 * 于是「这句话从本局事实生成」不是一句承诺，而是同一个字符串插值。
 */
function ledger(facts: CardLineFacts): string {
  return `${facts.score} 分，最高 ${facts.highestTile}，合并 ${facts.merges} 次，${facts.moves} 步`
}

/** 穷尽性守卫：往 EndReason 里加一个值而没在下面分支，这里就编不过（同 runEndLabel） */
function assertNever(reason: never): never {
  throw new Error(`未处理的结束原因：${String(reason)}`)
}

/**
 * 已结算那一侧的话头。
 *
 * 写成对 EndReason 的穷尽 switch，理由与 `runEndLabel` 同一条：加一个结束原因而忘了补
 * 分支，编译直接炸，而不是每个那样的局都静默落回同一句话。
 *
 * `null` 那一支是**不可达**的（`settle` / `abandon` / `tick` 三条进 ended 的路都写原因），
 * 所以它给的是 null——「没什么可说」比编一句结束方式诚实。
 */
function endedHead(endReason: EndReason): string | null {
  switch (endReason) {
    case 'deadlock':
      return DEADLOCK_HEAD
    case 'timeout':
      return TIMEOUT_HEAD
    case 'abandoned':
      return ABANDONED_HEAD
    case 'won':
      return WON_HEAD
    case null:
      return null
    default:
      return assertNever(endReason)
  }
}

/**
 * 卡片那一行。null = 这一层没什么可说（调用方据此**不挂这个元素**，而不是挂一句空话）。
 *
 * 次序是有意的：**彩蛋那句梗压在一切终局之上**。一个既唤过一念神魔、最后又死局收场的
 * 一局，卡片上说的是彩蛋——那是这一局的收礼，而死局的账它一句都没少报（同一个 ledger）。
 */
export function resultCardLine(facts: CardLineFacts): string | null {
  if (facts.wish) return `${WISH_HEAD}：${ledger(facts)}`
  // 里程碑那一层（tier 'won'）：这一局还活着，没有「怎么结束」可说
  if (facts.tier === 'won') return null
  const head = facts.tier === 'stuck' ? DEADLOCK_HEAD : endedHead(facts.endReason)
  return head === null ? null : `${head}：${ledger(facts)}`
}
