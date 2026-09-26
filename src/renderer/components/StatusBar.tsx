import type { JSX } from 'react'
import type { GameState } from '../../shared/types'
import type { Coordinate } from '../../game/board'
import { getMode } from '../../shared/modes'

interface Props {
  game: GameState
  /** 交换拾取是否开着（T12） */
  swapArmed: boolean
  /** 等第二枚的那一枚；null = 没有待确认的选择（T12） */
  swapSelection: Coordinate | null
  onToggleSwap(): void
}

/**
 * 分数 / 目标 / 最高方块（用户故事 5）+ 作弊交换的入口与操作播报（T12，用户故事 15/16）。
 *
 * 交换的入口为什么也在这一条：原票的交付范围原话是「StatusBar 按钮」，而死局那一侧
 * （GameOverPanel）另有一个同功能的按钮——两处调的是 store 里同一个 toggleSwap，
 * 不是一个规则两套实现。模式规矩上把 swap 列为 `stuckRecoveryMoves`，所以死局玩家
 * 从面板上手边就能换；活跃局里想试一把，也从这里进。
 *
 * 只在 playing / stuck 露头：won 上面是「继续玩还是结算」的决策面板，ended 之后
 * mode-contract §3 关键不变量 4 直接禁交换——不给入口比给一个点不动的按钮诚实。
 */
export function StatusBar({ game, swapArmed, swapSelection, onToggleSwap }: Props): JSX.Element {
  const mode = getMode(game.modeId)
  const highest = game.board
    .flat()
    .reduce<number>(
      (max, cell) =>
        cell !== null && cell !== 'wall' ? Math.max(max, cell.value) : max,
      0
    )
  const swapAvailable = game.phase === 'playing' || game.phase === 'stuck'

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
      {swapAvailable && (
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            className="control"
            // aria-pressed 让「现在就在交换拾取里」对读屏软件可见，
            // 同时 hit styles.css 的 .control[aria-pressed='true'] 选中态配色
            aria-pressed={swapArmed}
            onClick={onToggleSwap}
          >
            {swapArmed ? '取消交换' : '交换'}
          </button>
          {/*
            操作播报（ticket 交付范围最后一项）。**只用文字把当前状态念出来**，
            不建 live region、不定 aria-live 策略：屏幕阅读器验收归 T22，
            这里抢先造一套机制，届时会变成第二套与它打架的策略。
            行号列号都按人口计数从 1 起——DOM 上 data-row 是零基，两套口径
            故意分开：给人看的从 1，给规则与选择态用的从 0。
          */}
          {swapSelection !== null ? (
            <p className="hint">
              已选择第 {swapSelection[0] + 1} 行第 {swapSelection[1] + 1} 列，再选一枚方块完成交换
            </p>
          ) : (
            swapArmed && <p className="hint">请选择第一枚方块，Esc 退出</p>
          )}
        </div>
      )}
    </div>
  )
}
