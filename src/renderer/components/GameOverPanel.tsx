import type { JSX } from 'react'
import type { GameState } from '../../shared/types'
import { runEndLabel } from './runEndLabel'

interface Props {
  game: GameState
  onSettle(): void
  onNewGame(): void
  /** 撤销一步（T11）。只摆在还没结算的死局面板上——ended 之后一律不可用 */
  onUndo(): void
}

/**
 * 死局 / 终局面板（mode-contract §3：死局先给可恢复面板，不直接判负）。
 *
 * 渲染时机：stuck（死局，还没决定）与 ended（已结算）。ended 的原因有三种——
 * deadlock（死局收工）、won（达成目标后主动收工）、以及 abandoned（在 store 里紧跟着
 * createGame，界面永远来不及露它）。
 *
 * 「为什么结束」从 game.endReason 读，不靠面板自己推断（SPEC 用户故事 7）：
 * 死局与超时必须是两句不同的话，读懂 endReason 即可。
 *
 * T04 只给「结束并记录」和「新游戏」。T11 在这里补「撤销」——mode-contract §3 的
 * `stuckRecoveryMoves: ["undo", "swap"]` 说明死局是**可恢复**的，而 T12 的作弊交换
 * 将来摆在它旁边。已结算那一侧什么都不加：进入 ended 后撤销一律不可用
 * （mode-contract §3 关键不变量 4），那道判断住在 store 的 undo 里，面板只是照着
 * phase 决定露不露入口。
 */
export function GameOverPanel({ game, onSettle, onNewGame, onUndo }: Props): JSX.Element {
  const settled = game.phase === 'ended'

  return (
    <section
      className="overlay"
      data-panel="gameover"
      data-end-reason={game.endReason}
    >
      <h2 className="overlay__title">{settled ? '本局已结束' : '死局'}</h2>
      <p className="overlay__text">{runEndLabel(game)}</p>
      <div className="flex gap-2">
        {settled ? (
          <button type="button" className="control" onClick={onNewGame}>
            新游戏
          </button>
        ) : (
          <>
            {/* 撤销摆在最前：死局是给玩家反悔的，不是给玩家认命的 */}
            <button type="button" className="control" onClick={onUndo}>
              撤销
            </button>
            <button type="button" className="control" onClick={onSettle}>
              结束并记录
            </button>
            <button type="button" className="control" onClick={onNewGame}>
              新游戏
            </button>
          </>
        )}
      </div>
    </section>
  )
}
