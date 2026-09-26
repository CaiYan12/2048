import type { JSX } from 'react'
import type { GameState } from '../../shared/types'
import { runEndLabel } from './runEndLabel'

interface Props {
  game: GameState
  onSettle(): void
  onNewGame(): void
}

/**
 * 死局 / 终局面板（mode-contract §3：死局先给可恢复面板，不直接判负）。
 *
 * 渲染时机：stuck（死局，还没决定）与 ended（已结算）。T04 的 ended 只可能是
 * deadlock——abandoned 那一档在 store 里紧跟着 createGame，界面永远来不及露它。
 *
 * 「为什么结束」从 game.endReason 读，不靠面板自己推断（SPEC 用户故事 7）：
 * 死局与超时必须是两句不同的话，读懂 endReason 即可。
 *
 * T04 只给「结束并记录」和「新游戏」。撤销与交换是 T11 / T12 的事：那两个按钮
 * 将来加在同一个面板上；这里连禁用的占位都不放——一个点不动的按钮只会被当成 bug。
 */
export function GameOverPanel({ game, onSettle, onNewGame }: Props): JSX.Element {
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
