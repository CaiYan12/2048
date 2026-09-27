import type { GameState } from '../../shared/types'

/**
 * 穷尽性守卫：联合每加一个值而没在这张表里分支，这里就编不过。
 * `assertNever` 的入参类型收窄成 never，传入任何真实值都是类型错误。
 */
function assertNever(reason: never): never {
  throw new Error(`未处理的 EndReason：${String(reason)}`)
}

/**
 * 结束原因的文案（SPEC 用户故事 7：玩家要能看出「为什么结束」）。
 *
 * 面板不自己猜结束原因——原因从 state.endReason 读，这里只负责
 * 「联合值 → 一句中文」这一张表。死局还没结算（stuck）也说「为什么」：
 * 那个 phase 本身就是原因。
 *
 * 写成对 EndReason 的穷尽 switch，而不是一串 if：往联合里加 timeout（T09）时
 * 忘了在这里补分支会**直接编译失败**——T09 加 timeout 那一刻正是被这条炸出来的
 * （`Argument of type '"timeout"' is not assignable to parameter of type 'never'`）。
 * 否则每个超时局都会静默落回默认那句「本局已结束」，既没有类型错误也没有测试会红。
 */
export function runEndLabel(game: GameState): string {
  if (game.phase === 'stuck') return '四方向都无合法移动'
  switch (game.endReason) {
    case 'deadlock':
      return '死局：四方向都无合法移动'
    case 'timeout':
      // 与死局刻意不共用任何词：到点是**强制**结算，死局是玩家自己收工
      return '时间到：三分钟已经用完'
    // 活跃局点「新游戏」会立刻开新局，所以 abandoned 在 T04 的界面上露不出来；
    // 这一档必须留着——T17/T18 与 timeout 并排读同一个函数
    case 'abandoned':
      return '主动放弃了本局'
    case 'won':
      return '达成目标后收工：赢下的一局'
    case null:
      return '本局已结束'
    default:
      return assertNever(game.endReason)
  }
}
