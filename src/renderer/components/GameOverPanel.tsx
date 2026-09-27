import type { JSX } from 'react'
import type { GameState } from '../../shared/types'
import { runEndLabel } from './runEndLabel'

interface Props {
  game: GameState
  onSettle(): void
  onNewGame(): void
  /** 撤销一步（T11）。只摆在还没结算的死局面板上——ended 之后一律不可用 */
  onUndo(): void
  /** 进入交换拾取（T12）。同 StatusBar 的「交换」按钮，调的是 store 里同一个动作 */
  onSwap(): void
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
 * `stuckRecoveryMoves: ["undo", "swap"]` 说明死局是**可恢复**的，两个恢复动作因此
 * 并排摆在面板最前面。已结算那一侧什么都不加：进入 ended 后撤销与交换一律不可用
 * （mode-contract §3 关键不变量 4），那道判断住在 store 的 undo / selectCell 里，
 * 面板只是照着 phase 决定露不露入口。
 *
 * **关于 isInteractiveTarget 的说明（T11 review 的交接）**：这个按钮是 `.board` 的
 * **兄弟节点**（ADR-0002 的固定 DOM，面板与方向按钮都在棋盘壳外面），它的键盘事件
 * 根本不冒泡到 Board 的 onKeyDown——它受的是 DOM 作用域保护，**不是**那道守卫。
 * 别在这里写「守卫保护了面板按钮」，T11 上那句话是错的：守卫只保护 `.board`
 * *内部*的控件（Board.tsx 的 isInteractiveTarget）。
 */
export function GameOverPanel({
  game,
  onSettle,
  onNewGame,
  onUndo,
  onSwap,
}: Props): JSX.Element {
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
            {/* 撤销摆在最前：死局是给玩家反悔的，不是给玩家认命的。
                交换摆在它旁边：契约把两者并列为恢复动作（stuckRecoveryMoves）。
                可访问名要与 StatusBar 那一枚分开：stuck 阶段两枚同时在画面上，都叫
                「交换」的话读屏玩家会连着听到两个同名控件，分不清哪一个在手边
                （T22 记录、T23 修）。可见文字不动，aria-label 只补上「在哪里」——
                它与可见文字的前缀一致，所以 2.5.3 的 Label in Name 仍然成立，
                swap.spec.ts 的 panel.getByRole('button', { name: '交换' }) 是子串匹配，
                也照旧命中这一枚。动作仍是 store 里同一个 toggleSwap，机制一个字没动。 */}
            <button type="button" className="control" onClick={onUndo}>
              撤销
            </button>
            <button
              type="button"
              className="control"
              aria-label="交换两枚方块（死局面板）"
              onClick={onSwap}
            >
              交换
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
