import { useCallback, useEffect, useRef, useState } from 'react'
import type { ShenmoOutcome } from '../../game/achievements'
import type { Direction } from '../../shared/types'

/**
 * 「一念神魔」的**pure machine**（T29 · 架构决策 1–6；T32 补上遍数计数器与二念那个果；
 * T35 补上菜单自己的退场）
 *
 * 这个文件是彩蛋的全部规则：神魔码的缓冲、抉择的阶段迁移、两个窗口各自到期时授予什么、
 * 一遍怎么算。**零 React、零 DOM、零计时器**——所以它能被单测逐条驱动，而不必先把一个
 * hook 架起来、或先在浏览器里打一遍口诀。形状与测试缝照 `ResultPresence.ts`：一个纯函数
 * + 一个 hook，钩子只负责把纯函数接到 React 与 CSS 动画上。
 *
 * **为什么口令是被旁听的（架构决策 1）**：那八下就是普通移动，走的是 App 里既有的
 * `MOVE_KEYS` 查表（方向键与 WASD 在那儿归一）、既有的 `move()`、既有的三条让路与 Esc
 * 分支。这里**不新增输入态、不吞键**。代价说在明处：因为按键真的推动了棋盘，「回到打码
 * 之前」只能意味着菜单与码缓冲——那八下走出来的位置不会退回去。
 *
 * **为什么 store 只拿得到「结出的果」（架构决策 2）**：码缓冲、阶段、两个窗口全是
 * **协调状态**，除了这一块 DOM 之外没有第二个消费者，所以它们住在这里。store 只留一件
 * 东西——这一局在抉择里结出过哪些果（`shenmoOutcomes`），因为成就是从「本局事实」派生的，
 * 而事实在 store 里拼（`runFactsOf`）。那个字段是彩蛋碰 store 的唯一理由。
 *
 * **两个窗口都不计时**（架构决策 3）：`window` 这个入参由宿主在 `animationend` 上喂进来，
 * 这里没有任何 `setTimeout`。装假时钟的测试会把定时器队列整个冻住，一个测试走不完的
 * 窗口等于永远不到期——结果层为这件事付过一遍代价（`.codex/memories/result-layer.md` 第 6 条）。
 */

/**
 * 神魔码：经典游戏机口诀的**方向段**八下（架构决策 1）。
 *
 * BA 那两个「按钮键」在这儿的对应物是**屏幕上真的那两颗圆钮**——所以码本身只由方向组成，
 * 这也正好让「无效方向也计数」天然成立：引擎对无效移动原样返回，而旁听不看结果，
 * 只看按了哪一下。
 *
 * 写成一张表而不是一串 if：读代码的人要一眼看出「第八下是 right」，而 `nextShenmo` 按
 * 下标取期望值，天然就是「一个错键整个清空」。
 */
export const SHENMO_CODE: readonly Direction[] = [
  'up',
  'up',
  'down',
  'down',
  'left',
  'right',
  'left',
  'right',
]

/**
 * 抉择的阶段。`idle` = 场上什么都没有（码可能在攒，也可能什么都没有）
 *
 * `leaving`（T35 补上）：**菜单自己的退场**。机器的每一条终局（三个授予、两段窗口流尽、
 * Esc）都先落到这一档，等宿主把退场动画播完的那一下 `left` 到了才归 `idle`。为什么终局
 * 不能像从前那样直接回 `idle`：那会让每一条结局都成了一次硬切——控制人实测的原话是
 * 「上上下下左右左右A》AB全消失没有动画」。父规格只写了「clears both buttons at once」，
 * 从未规定菜单自身的退场，所以这是补一条被漏掉的规格，不是改一条已定的裁决。
 */
export type ShenmoStage =
  /** A 与 B 都在，第一段 30 秒的窗口在走 */
  | 'choice'
  /** B 刚被点碎，正在播破碎退场；此刻点 A 仍然算走完这条魔道 */
  | 'breaking'
  /** B 碎了，只剩 A 与那道渐薄的环；第二段 30 秒的窗口在走 */
  | 'ring'
  /** 收起。与 `choice` 分开写：`away` 之后必须真的回到「没有摊」，而不是「摊还在、没按键」 */
  | 'idle'
  /** 退场中：容器正在播退场动画，`left` 到了才归 `idle`（见上面那段） */
  | 'leaving'

/**
 * 退场中的菜单画的是哪一档。`stage === 'leaving'` 时它才有值（其余时候是 null）。
 *
 * 为什么要单独记住它：退场放的是**同一个容器**，而 `leaving` 这一个字不说 B 在不在——
 * 不记住的话，先点 A 之后 B 会在淡出中凭空冒回来。形状照 `ResultPresence` 的
 * `{ layer, leaving }`：那一层也把「哪一层」与「正在退场」分成两个字存着。
 */
export type ShenmoLeavingFrom = 'choice' | 'breaking' | 'ring'

/** 两颗圆钮的身份。屏幕上是 A 与 B 两个字符，机房里是小写 */
export type ShenmoButton = 'a' | 'b'

/** 两段窗口的身份。1 = 谁都没点的那 30 秒，2 = 只剩 A 之后的那 30 秒 */
export type ShenmoWindow = 1 | 2

/** 机器的全部状态。五个字段，一个计时字段都没有——时间不在这一层 */
export interface ShenmoState {
  /** 已经**连续**按对了几下（神魔码的前缀长度）。错一下归零 */
  readonly typed: number
  readonly stage: ShenmoStage
  /**
   * 退场是从哪一档开始的（`stage === 'leaving'` 时才是它，其余时候 null）。
   *
   * 机器的判断一个字节都不用它——它纯粹是给 DOM 的：退场放的是同一个容器，内容必须与
   * 进场时逐项相同，否则先点 A 之后 B 会在淡出中凭空冒回来（见 `ShenmoLeavingFrom`）。
   */
  readonly leavingFrom: ShenmoLeavingFrom | null
  /** 最近结出的那个果；null = 这一局还没结出过任何果 */
  readonly outcome: ShenmoOutcome | null
  /**
   * `outcome` 的身份。同一个果**可能结第二次**（先放任一次环流尽，再打一遍码走完 B → A），
   * 那时 `outcome` 的字没变、值没变，只有这个编号会动——宿主据此认「又一次」，
   * 否则第二次会被同一条 `useEffect` 依赖吃掉。
   */
  readonly outcomeKey: number
  /**
   * **这一局已经完整走完几遍 B → A**（T32 · 父规格的架构决策 6 / 8）。
   *
   * 为什么机器里必须有一个遍数计数器：二念的唯一判据是「这是第二遍」，而「第几遍」
   * 这件事只有走过的人知道——先点 A、放任任一段窗口流尽都**不算一遍**（父规格的
   * 架构决策 6），所以它不能从别的字段推出来。宿主（store 的 `shenmoOutcomes`）认得
   * 的是**结出的果**，而「第一次结出 first-pass」与「第二次结出 first-pass」在它那儿
   * 是同一条记录（`recordShenmoOutcome` 幂等）——分辨第几遍只能发生在理由最充分的
   * 这一层，也就是「一遍怎么算」这条规则的家里。
   *
   * 它**跟着「局」走，不跟着「阶段」走**：Esc（`away` → 退场）与阶段变化
   * （`shenmoCleared`）都只收起摊，遍数一个比特都不动——`playing → won → 继续玩 →
   * playing` 之后，第二遍还得是第二遍，而**换局清零**（`shenmoNewRun`）：上一局结出的果
   * 跟着上一局消失，走过的遍数也是那一局的事。一轮的历史是「一念 → 二念 → 之后轮回」，
   * 但一轮只属于某一局。
   */
  readonly passes: number
}

/** 空场：什么都没有，码也没攒 */
export const INITIAL_SHENMO: ShenmoState = {
  typed: 0,
  stage: 'idle',
  leavingFrom: null,
  outcome: null,
  outcomeKey: 0,
  passes: 0,
}

/** 喂给机器的五种输入。方向与点钮是**真的发生过**的事，窗口到期由动画派发 */
export type ShenmoInput =
  | { readonly kind: 'direction'; readonly direction: Direction }
  | { readonly kind: 'choose'; readonly button: ShenmoButton }
  /** B 的破碎退场播完了：`breaking` → `ring`，第二段窗口从此开始 */
  | { readonly kind: 'broke' }
  | { readonly kind: 'window'; readonly window: ShenmoWindow }
  /** Esc：玩家自己收摊，什么都不授予，**先落到退场**（换阶段 / 换局不走这条，它们走
      `shenmoCleared` / `shenmoNewRun`，瞬收——见 `shenmoCleared` 的注释） */
  | { readonly kind: 'away' }
  /**
   * 退场播完了（T35）：宿主在容器那条退场动画的 `animationend` 上调它，**不是**定时器
   *（理由与两段窗口同一条：假时钟冻得住 JS 计时，冻不住渲染管线）。`leaving` → `idle`。
   */
  | { readonly kind: 'left' }

/** 一次输入之后的收获：新状态 + 这一下有没有结出果来 */
export interface ShenmoTransition {
  readonly state: ShenmoState
  readonly outcome: ShenmoOutcome | null
}

/**
 * 带出果的迁移：摊收起（**先落到退场**）、码缓冲清零，编号 +1（所以同一个果第二次结出来
 * 时身份是新的）。
 *
 * 三个出口（学艺不精 / 道通成魔 / 当断即断）都走它——**结出果就等于收摊**，没有
 * 「果拿到了、摊还挂着」这种中间态。而「收摊」如今是 `leaving` 而不是 `idle`：结出的果
 * **先记在状态里**（`outcome` / `outcomeKey` / `passes` 一个字节都不丢），等退场播完那
 * 一下 `left` 才归 `idle`——宿主（store）在 grant 这一刻就收到果了，延迟的只是菜单从
 * DOM 上离开。擦掉那些字段会让「这一局结出过什么」凭空少一条。
 */
function grant(state: ShenmoState, outcome: ShenmoOutcome): ShenmoState {
  return {
    ...state,
    typed: 0,
    stage: 'leaving',
    leavingFrom: openStageOf(state),
    outcome,
    outcomeKey: state.outcomeKey + 1,
  }
}

/**
 * 摊摆在桌面上的那一档；`idle` / `leaving` 给 null。
 *
 * 只给 `leavingFrom` 用：正要退场的那一档由它记住，而机器自己的判断一个字节都不读它。
 */
function openStageOf(state: ShenmoState): ShenmoLeavingFrom | null {
  if (state.stage === 'choice' || state.stage === 'breaking' || state.stage === 'ring') {
    return state.stage
  }
  return null
}

/**
 * 下一步。**纯函数**：所有判断都在这里，所以它能被单测逐条驱动。
 *
 * 规则逐条（编号与 `tests/unit/shenmo-choice.test.ts` 的 describe 一一对应）：
 *
 *   1. **只有空场上攒码**。摊开着的时候按方向照样推棋盘（旁听不拦），但**不**再往码里
 *      攒——否则窗口一到期、紧接着那几下会立刻把第二个摊召出来。
 *   2. **一个错键整个清空**，而且是清回 0，不是「顺手拿这个错键当地一键重新匹配」。
 *      口诀的含义本来就是「一下不错地打完」。
 *   3. **八下齐了才现身**：`typed` 到长度那一刻结成 `choice`，同时 `typed` 归零——
 *      摊开着时它已经没有意义。
 *   4. **阶段只认自己那一段的输入**。窗口 1 只在 `choice` 到期、窗口 2 只在 `ring` 到期；
 *      `broke` 只在 `breaking` 有嘴。这不是防御性编程，是「先 B 后 A」这条顺序本身——
 *      B 碎到一半时窗口 1 的 30 秒到了头，玩家**确实动了手**，不该被判成放任时间流尽。
 *   5. **三个结局，只有一个是时钟到期授予的**（架构决策 5）。窗口 1 到期**静默**收起——
 *      一个打错的码不该指控任何人；窗口 2 到期授予当断即断；先点 A 授予学艺不精；
 *      B → A 授予道通成魔。而「放任窗口 1」**不在 `ShenmoOutcome` 里**——它在裁决这一层
 *      连表达的可能都没有。
 *   6. **一遍只算 B → A**（架构决策 6）。先点 A、或放任任一段窗口流尽，都**不算一遍**，
 *      也什么都不推进。第一遍与第二遍摆出的是**同一副摊**——笑话就是你真又打了一遍。
 *      遍数由 `passes` 数，也是它唯一要做的事：第一次走完结一念的果，之后每一遍结
 *      二念的果（T32）。
 *   7. **机器的每一条终局都播退场**（T35）：三个授予、两段窗口流尽、Esc 都先落到
 *      `leaving`，等宿主把退场动画播完的那一下 `left` 才归 `idle`。**外部打断不播**：
 *      换阶段 / 换局由 hook 直接调 `shenmoCleared` / `shenmoNewRun` 瞬收（那一瞬结果层
 *      正在盖上来或新局已开，动画没有意义），Esc 是玩家自己收摊，照旧播。退场期间机器
 *      照旧收得住：方向不攒码、点钮是空气、窗口到期是空气——那 150ms 里把键盘按烂也
 *      不该召出下一个摊。
 */
export function nextShenmo(current: ShenmoState, input: ShenmoInput): ShenmoTransition {
  switch (input.kind) {
    case 'direction':
      // 规则 1：摊开着不攒码。开局界面没有棋盘，那边由宿主的 `ShenmoRunKey = null` 把关
      if (current.stage !== 'idle') return { state: current, outcome: null }
      if (input.direction !== SHENMO_CODE[current.typed]) {
        // 规则 2：整个清空。**不是**「这一下标着 0 就地重开」
        return { state: { ...current, typed: 0 }, outcome: null }
      }
      // 规则 3：八下齐了
      if (current.typed + 1 === SHENMO_CODE.length) {
        return { state: { ...current, typed: 0, stage: 'choice' }, outcome: null }
      }
      return { state: { ...current, typed: current.typed + 1 }, outcome: null }

    case 'choose':
      // B 只在摊刚开的时候还在。碎到一半、或只剩 A 的时候再点 B 是空气
      if (input.button === 'b') {
        if (current.stage !== 'choice') return { state: current, outcome: null }
        return { state: { ...current, stage: 'breaking' }, outcome: null }
      }
      // A 的意义由**它之前有没有人点过 B** 决定：摊刚开时点 A 是「形不成形」，
      // 走过魔道再点 A 才是这一遍。碎到一半点 A 也算——玩家确实走完了 B 那一下
      if (current.stage === 'choice') {
        return { state: grant(current, 'wrong-order'), outcome: 'wrong-order' }
      }
      if (current.stage === 'breaking' || current.stage === 'ring') {
        // 规则 6：完整走完一遍。**遍数计数器只在这里动**（先点 A 与放任流尽都不算），
        // 而动它的唯一目的就是分辨第几遍——第一遍结一念的果，之后每一遍结二念的果
        // （T32：走火入魔）。第二遍之后没有第三种果：第三遍、第四遍都是同一句，
        // 因为笑话在「你又来了一遍」，不在编号。
        const passes = current.passes + 1
        const outcome: ShenmoOutcome = current.passes === 0 ? 'first-pass' : 'second-pass'
        return { state: grant({ ...current, passes }, outcome), outcome }
      }
      return { state: current, outcome: null }

    case 'broke':
      if (current.stage !== 'breaking') return { state: current, outcome: null }
      return { state: { ...current, stage: 'ring' }, outcome: null }

    case 'window':
      // 规则 4：每段窗口只在自己那一段到期
      if (input.window === 1) {
        if (current.stage !== 'choice') return { state: current, outcome: null }
        // 规则 5：静默收起，什么都不授予——**也先落到退场**。「静默」说的是不指控任何人，
        // 不是「菜单原地蒸发」：那 30 秒流尽也是一条终局，退场照旧播
        return {
          state: { ...current, typed: 0, stage: 'leaving', leavingFrom: 'choice' },
          outcome: null,
        }
      }
      if (current.stage !== 'ring') return { state: current, outcome: null }
      return { state: grant(current, 'hesitated'), outcome: 'hesitated' }

    case 'left':
      // 规则 7：退场播完了。**只有 `leaving` 认这一下**：别的阶段收到它什么都不做（防的是
      // 宿主编错接线，不是玩家输入）。果与编号**原样留着**——宿主早在 grant 那一刻就收到
      // 果了，这一下只是把菜单从 DOM 上摘掉；擦掉它会让状态里「这一局结出过什么」少一条
      if (current.stage !== 'leaving') return { state: current, outcome: null }
      return { state: { ...current, stage: 'idle', leavingFrom: null }, outcome: null }

    case 'away':
      // 规则 5 的另一半：被打断不是动摇，什么都不授予。Esc 走这一条——**它照旧播退场**
      // （菜单是玩家自己收的，那一下值得被看见）。换阶段 / 换局不走它：那两条是外部打断，
      // 由 hook 直接调 `shenmoCleared` / `shenmoNewRun`，瞬收（见 `shenmoCleared` 的注释）。
      // **退场中再收一次什么都不改**：摊已经在走了，那一下 Esc 只是又按了一遍——不提前
      // 掐掉退场，也不换个新对象（hook 的 `putAway` 靠同一判据挡掉无变化的重渲染）
      if (current.stage === 'leaving') return { state: current, outcome: null }
      if (current.stage === 'idle') return { state: { ...current, typed: 0 }, outcome: null }
      return {
        state: { ...current, typed: 0, stage: 'leaving', leavingFrom: current.stage },
        outcome: null,
      }
  }
}

/**
 * **外部打断**的收摊：码缓冲与摊一起清零，**不**结出任何果，也**不播退场**。遍数还在——
 * 收起不是换局。
 *
 * 为什么这一条与 `nextShenmo` 的 `away` 分成两个函数：`away` 是**玩家自己**收摊（Esc），
 * 那一下值得被看见，于是先落到 `leaving`、播完退场才归 `idle`；而这一条只有 hook 在
 * 「这一局的身份变了」时直接调（换阶段 / 换局，不经 `nextShenmo`）——那一瞬结果层正在
 * 盖上来、或新一局已经开张，一个正在淡出的菜单只会挡住玩家要看的东西。T35 之后菜单
 * 有了退场，于是这条分界必须写下来：**不是每条收起都该有动画**。
 * （ Esc 因此不走这里——hook 的 `putAway` 走机器的 `away`。）
 */
export function shenmoCleared(current: ShenmoState): ShenmoState {
  return { ...current, stage: 'idle', typed: 0, leavingFrom: null }
}

/**
 * 开一局新的：机器整个回到空场，**连遍数一起**（与 `shenmoCleared` 并列的另一条重置规则）。
 *
 * 为什么遍数必须跟着清零：它数的是「这一局已经完整走完几遍」，而换局之后上一局发生的事
 * 跟着上一局一起消失——store 的 `shenmoOutcomes` 就在同一刻清空（startRun / newGame），
 * 于是遍数也是**某一局**的事实（store 的 `shenmoOutcomes` 注释原话：「走完两遍的那个笑话
 * 因此永远属于某一局，不会跨局累积」）。T32 落地时漏了它：第 2 局再走第一遍时
 * `current.passes === 0` 已为假，结出的果于是成了二念——玩家当场被扣下页面、钉上悬顶，
 * 而第 2 局永远拿不到一念的奖品。
 *
 * 与 `shenmoCleared` 的分工：**阶段变化**走收起（遍数一个比特都不动；Esc 是玩家自己收摊，
 * 走机器的 `away`——播放退场，遍数同样不动），**换另一局**走这一个（全部归零）。hook 按
 * `shenmoAfterRunChange` 分这一刀，自己不判。
 */
export function shenmoNewRun(): ShenmoState {
  return INITIAL_SHENMO
}

/**
 * 「这一局的身份」变了之后，机器该变成什么样。**纯函数**：判「这是换了阶段还是换了局」
 * 与「换了局该重置什么」都在这里，所以 hook 里没有一堆 if，而整条规则能被单测逐条驱动。
 *
 * 身份是 `phase@startedAt`（见 `ShenmoRunKey`），两段各自回答一个问题：
 *   · **`startedAt` 变了 = 换了另一局**（startRun / newGame / 恢复存档）→ `shenmoNewRun`：
 *     遍数跟着上一局消失；
 *   · **只有 `phase` 变了 = 同一局里换了阶段**（won / stuck / ended、继续玩回来）
 *     → `shenmoCleared`：摊收起、码缓冲清零，走过的遍数还在。
 */
export function shenmoAfterRunChange(
  previous: ShenmoRunKey,
  next: ShenmoRunKey,
  current: ShenmoState
): ShenmoState {
  return sameRun(previous, next) ? shenmoCleared(current) : shenmoNewRun()
}

/** 两个 key 是不是同一局。`null`（还没有局）不充当任何一局的一半 */
function sameRun(a: ShenmoRunKey, b: ShenmoRunKey): boolean {
  if (a === null || b === null) return false
  return runOf(a) === runOf(b)
}

/**
 * key 里「局」的那一段：宿主拼 `phase@startedAt`，所以最后一个 `@` 之后就是起始时刻。
 * 入参不是 null——`sameRun` 先把这个可能挡掉了，所以这里只管非空的 key
 */
function runOf(runKey: string): string {
  // 为什么切最后一个 `@`：phase 是四个字面量、startedAt 是 epoch ms，两边都不含这个字符，
  // 所以「最后一个」与「第一个」今天等价——写上是因为格式若将来变了，这里不该安静地错
  const at = runKey.lastIndexOf('@')
  return at === -1 ? runKey : runKey.slice(at + 1)
}

/** 这一下是不是真的改变了状态。为真就不换对象引用，省掉一次无谓的重渲染 */
function sameShenmo(a: ShenmoState, b: ShenmoState): boolean {
  return (
    a.typed === b.typed &&
    a.stage === b.stage &&
    a.outcomeKey === b.outcomeKey &&
    // 遍数也在这儿比：它跟着 grant 与换局（`shenmoNewRun`）两条路变，而两条都必然连着
    // outcomeKey 一起动（前者 +1、后者归零），所以这一项今天不改变任何行为——写上是因为
    // 「真的改没改」该把每个字段都问一遍，而不是赌「将来动 pass 的人一定记得连编号一起动」
    a.passes === b.passes &&
    // 退场从哪一档开始的也在这儿比：它只给 DOM 用，而「这一下有没有改动菜单要画的东西」
    // 同样该问一遍——只比 stage 的话 `leaving` → `leaving` 但换了来源会被当成没变
    a.leavingFrom === b.leavingFrom
  )
}

/** 宿主交出去的东西：纯状态 + 五个动作。五个动作的引用**全程稳定**（见 hook 里的注释） */
export interface ShenmoControl {
  readonly stage: ShenmoStage
  readonly typed: number
  /** 退场是从哪一档开始的（只在 `stage === 'leaving'` 时有值）。渲染靠它画退场中的那一摊 */
  readonly leavingFrom: ShenmoLeavingFrom | null
  /** 一个方向真的被按下了。宿主在**推动棋盘之后**调它——无效移动也算 */
  hear(direction: Direction): void
  /** 一颗圆钮被点了 */
  choose(button: ShenmoButton): void
  /** 一段窗口的动画跑完了（`animationend`，不是定时器） */
  windowDone(window: ShenmoWindow): void
  /** B 的破碎退场播完了 */
  broke(): void
  /** 菜单自己的退场播完了（容器那条退场动画的 `animationend`，不是定时器） */
  left(): void
  /** Esc */
  putAway(): void
}

/**
 * 这一局的**身份**。摊只在一局正在进行时成立，而「身份」要同时认出两件事
 * （父规格的用户故事 8）：
 *
 *   · **阶段变了**（won / stuck / ended，或回开局界面）→ null；
 *   · **换了另一局**（startRun / newGame / 恢复存档）→ 变成另一个值。
 *
 * 第二件事不能只靠 `active` 布尔量判：`newGame` 之后 phase 还是 `playing`、`game` 也不是 null，
 * 布尔量一个比特都不动——而摊必须收起。所以这里比的是**值**，不是真假。
 * 宿主由 `phase` + 这一局的起始时刻拼它：两者在一局进行中都恒定，换局或换阶段必变。
 *
 * 宿主拼的格式是 `phase@startedAt`（`App.tsx` 的 `shenmoRunKey`），而**这个格式是契约的
 * 一部分**：`shenmoAfterRunChange` 按「后一半变没变」分辨换局与换阶段（阶段变化只收起、
 * 换局连遍数一起归零），所以改格式要同步改它。`@` 由 phase 与 epoch ms 各让一步——两边
 * 都不含这个字符。
 */
export type ShenmoRunKey = string | null

/**
 * 机器接到 React 上的那一半。形状与 `useResultLayerPresence` 同一条路子：
 *
 *   · **状态调整写在渲染期而不是 effect 里**。摊必须在「这一局变了」的**同一次提交**里
 *     从 DOM 上消失——写在 effect 里会多出一帧「这一局已经结算、彩蛋的摊还挂在棋盘旁」。
 *     渲染期校正 state 是 React 文档里「props 变化时校正 state」那一条路子。
 *   · **身份一变就收起**（不是「变成假」才收）：换阶段与换一局都要收起，而后者不改变
 *     `active` 的真假（见 `ShenmoRunKey` 的注释）。收起之外，**换局还要连遍数归零**
 *     （`shenmoAfterRunChange` 按 key 的哪一段变了分这一刀：阶段变化只收起，换局全部重来）。
 *   · **动作的引用全程稳定**（`useCallback(…, [])`）。App 那个 window keydown effect
 *     的依赖表里带着它们，引用每天换一个就等于每天重挂一次监听。
 */
export function useShenmo(
  /** 这一局的身份。`null` = 摊不成立；值变了 = 收起（`ShenmoRunKey`） */
  runKey: ShenmoRunKey,
  /** 结出一个果时通知宿主（store 只在这时候被碰一下） */
  onOutcome: (outcome: ShenmoOutcome) => void
): ShenmoControl {
  const [state, setState] = useState<ShenmoState>(INITIAL_SHENMO)
  const [seenKey, setSeenKey] = useState<ShenmoRunKey>(runKey)

  if (seenKey !== runKey) {
    setSeenKey(runKey)
    // 这一次身份变化是「换了阶段」还是「换了局」由纯函数答（hook 只负责什么时候调它）：
    // 前者只收起摊，后者连遍数一起归零。`seenKey` 在这个闭包里还是上一个值——setSeenKey
    // 排下的是一次重渲染，不会改到本次执行里的局部
    const next = shenmoAfterRunChange(seenKey, runKey, state)
    if (!sameShenmo(state, next)) setState(next)
  }

  // `runKey` 的最新值。`hear` 要读它——而 `hear` 的引用必须稳定，所以不能依赖 `runKey`。
  // 写在 effect 里而不是渲染期：渲染期不写 ref（重渲染可能被丢弃，ref 会停在半路上）。
  // 那一帧的陈旧由上面这个渲染期校正兜底：身份变了的同一次提交里 state 已经清空，
  // 陈旧的那一次 `hear` 顶多把 `typed` 写成 1，随后就被这一行擦掉。
  const keyRef = useRef(runKey)
  useEffect(() => {
    keyRef.current = runKey
  }, [runKey])

  // 果的通知走 effect 而不是在渲染期直接调：那是一次写 store 的副作用，渲染期不许做。
  // 判据是 `outcomeKey` 而不是 `outcome`——同一个果可能结第二次（放任一次环流尽，再打一遍
  // 码走完 B → A），那时 outcome 这个字没变、值没变，只有编号会动。挂在渲染闭包上读，
  // 不往 ref 里写（渲染期写 ref 会在重渲染被丢弃时停在半路上）
  useEffect(() => {
    if (state.outcomeKey === 0 || state.outcome === null) return
    onOutcome(state.outcome)
  }, [state.outcomeKey, state.outcome, onOutcome])

  const hear = useCallback((direction: Direction): void => {
    if (keyRef.current === null) return
    setState((current) => nextShenmo(current, { kind: 'direction', direction }).state)
  }, [])

  const choose = useCallback((button: ShenmoButton): void => {
    setState((current) => nextShenmo(current, { kind: 'choose', button }).state)
  }, [])

  const windowDone = useCallback((window: ShenmoWindow): void => {
    setState((current) => nextShenmo(current, { kind: 'window', window }).state)
  }, [])

  const brokeCb = useCallback((): void => {
    setState((current) => nextShenmo(current, { kind: 'broke' }).state)
  }, [])

  const leftCb = useCallback((): void => {
    setState((current) => nextShenmo(current, { kind: 'left' }).state)
  }, [])

  const putAway = useCallback((): void => {
    setState((current) => {
      // Esc 走机器的 `away`，**不走** `shenmoCleared`：Esc 是玩家自己收摊，播退场；而
      // `shenmoCleared` 留给外部打断（换阶段 / 换局，见那个函数的注释）。两条路的分别
      // 由 hook 在「调谁」上分，机器自己不判——与 `shenmoAfterRunChange` 同一条路子。
      const next = nextShenmo(current, { kind: 'away' }).state
      // 空场上（或退场中）再收一次不动状态：Esc 连按两下不该换来两次重渲染
      return sameShenmo(current, next) ? current : next
    })
  }, [])

  return {
    stage: state.stage,
    typed: state.typed,
    leavingFrom: state.leavingFrom,
    hear,
    choose,
    windowDone,
    broke: brokeCb,
    left: leftCb,
    putAway,
  }
}
