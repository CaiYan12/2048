import type { GameState } from '../../shared/types'
import { runEndLabel } from './runEndLabel'

/**
 * 一局的**结果**播报（T22 验收标准 2 · SPEC §3.4「Important state changes are announced」）
 *
 * 为什么抽成 .ts：播报的**内容**得能在 node 环境里被单测（见 tests/unit/announcement.test.ts），
 * 而它写的每一句都对应一条「什么算重要状态变化」的裁决，那些裁决正是本票要留档的东西。
 * 与 TileMotion.ts 同一条路子：决定住在纯模块里，组件只负责把它挂到 live region 上。
 *
 * —— 播报策略（本票定的那一条）——
 *
 *   · **只播结果，不播过程。** phase 从 playing 转去 won / stuck / ended 才有一句话；
 *     一次 Move 什么都不播。理由正是 SPEC §3.4 后半句「without duplicating every
 *     intermediate value」：每走一步都念一次得分与合并，读屏软件就变成一台复读机，
 *     而玩家要的是「这一局现在怎么了」。
 *   · **分数不是每步都重要，但它写在结果里。** 分数在 StatusBar 的「得分」面板上
 *     （带标签，可随需读取），所以它不必逐次播报；而结算那一刻它是结果的一部分，
 *     于是三句话都带着它。
 *   · **内容由当前状态推导，不记上一帧。** 同一个 game 进去永远得到同一句话，所以
 *     「重复播报」在结构上就不可能发生——没有 delta，就没有 delta 算错的可能。
 *     代价是「说完就安静」：区域里放着最后一句话，读屏软件不会因为同样的文字再念一遍。
 */
export function runResultAnnouncement(game: GameState, target: number): string | null {
  switch (game.phase) {
    case 'playing':
      // 活跃局没有「结果」可播：棋盘本身由 .board 的 role=application + aria-label
      // 播报（Board.tsx），走一步只是一个中间值
      return null
    case 'won':
      // 达标只是里程碑（mode-contract §3）。这句话必须说清它**不是**终局——
      // 否则读屏玩家会以为这一局结束了，而面板上那三个出口他还没听说
      return `达成目标 ${target}，得分 ${game.score}。这是里程碑，不是终局：可以继续玩，也可以就此收工`
    case 'stuck':
      // 死局是可恢复的（stuckRecoveryMoves）。说出三个出口，读屏玩家才知道
      // 「走不动了」不等于「只能认命」
      return `死局：四方向都无合法移动，得分 ${game.score}。可以撤销或交换，也可以结束并记录`
    case 'ended':
      // 结束原因从 runEndLabel 来（与面板同一份口径：死局、超时、赢下收工是三句
      // 不同的话，SPEC 用户故事 7）。带终局分数——面板上不显示它，而它是这一局的结果
      return `本局结束：${runEndLabel(game)}，最终得分 ${game.score}`
  }
}

/**
 * 交换拾取的操作播报（T12 交付的可见文字 · T22 定它的播报策略）
 *
 * 从 StatusBar 的内联模板抽出来，为的是让「拾取态该念什么」可被单测——那句话是
 * 键盘玩家的全部进度反馈：他在两枚方块之间 Tab，屏幕上没有别的东西在动。
 *
 * 行号列号按**人口计数从 1 起**：DOM 上的 data-row / data-col 是零基（给规则与选择态用），
 * 两套口径故意分开，理由见 StatusBar 的原注释。
 */
export function swapPrompt(swapArmed: boolean, selection: readonly [number, number] | null): string | null {
  if (!swapArmed) return null
  if (selection === null) return '请选择第一枚方块，Esc 退出'
  return `已选择第 ${selection[0] + 1} 行第 ${selection[1] + 1} 列，再选一枚方块完成交换`
}
