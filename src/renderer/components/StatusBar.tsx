import type { JSX } from 'react'
import type { GameState } from '../../shared/types'
import { getMode } from '../../shared/modes'

interface Props {
  game: GameState
}

/** 分数 / 目标 / 最高方块（用户故事 5）。撤销按钮归 T11，作弊交换归 T12 */
export function StatusBar({ game }: Props): JSX.Element {
  const mode = getMode(game.modeId)
  const highest = game.board
    .flat()
    .reduce<number>(
      (max, cell) =>
        cell !== null && cell !== 'wall' ? Math.max(max, cell.value) : max,
      0
    )

  return (
    <div className="flex flex-wrap items-start justify-center gap-3">
      <div className="panel">
        <div className="panel__label">得分</div>
        {/* data-score 是 e2e 的断言点（task-3-interfaces 的 DOM 契约） */}
        <div className="panel__value" data-score={game.score}>
          {game.score}
        </div>
      </div>
      <div className="panel">
        <div className="panel__label">目标</div>
        <div className="panel__value">{mode.target}</div>
      </div>
      <div className="panel">
        <div className="panel__label">最高方块</div>
        <div className="panel__value">{highest}</div>
      </div>
    </div>
  )
}
