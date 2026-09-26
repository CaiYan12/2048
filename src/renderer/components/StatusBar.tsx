import type { JSX } from 'react'
import type { GameState } from '../../shared/types'
import type { Coordinate } from '../../game/board'
import { getMode } from '../../shared/modes'
import { swapPrompt } from './RunAnnouncement'

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
  // 拾取态的操作播报（T22 定策略，内容在 RunAnnouncement.ts）
  const prompt = swapPrompt(swapArmed, swapSelection)

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
            操作播报（ticket 交付范围最后一项）。**只用文字把当前状态念出来**：
            行号列号都按人口计数从 1 起——DOM 上 data-row 是零基，两套口径
            故意分开：给人看的从 1，给规则与选择态用的从 0。

            T12 落下这句话时刻意**没有**定 live region 策略（原话「屏幕阅读器验收归
            T22，抢先造一套机制届时会变成第二套与它打架的」）。T22 定的策略就是上面
            那一条：内容按当前状态推导、一句一事、与 StorageNotice / AchievementNotice
            共用 role="status" 这个机制——所以这里补的只是 role 与 data-swap-prompt
            这两个钩子，话本身还是同一句，而且由 swapPrompt 这一个纯函数出（内容因此
            可单测，见 tests/unit/announcement.test.ts）。
            拾取态是键盘玩家在屏幕上唯一会变的东西，两枚方块之间 Tab 时它得被念出来。
            多余的进度反馈已经由方块自己的 aria-label（位置 + 数值 +「按 Enter 选择」）
            与 aria-pressed 给足，这里只说「现在轮到选第几枚」这一件面板上没有的事。
          */}
          {prompt !== null && (
            <p
              className="hint"
              // data-swap-prompt 是 e2e 的断言点（DOM 契约），两个值对应
              // 拾取态的两步：等第一枚 / 等第二枚
              data-swap-prompt={swapSelection === null ? 'first' : 'second'}
              role="status"
            >
              {prompt}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
