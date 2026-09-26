import type { JSX } from 'react'
import type { ModeId } from '../shared/modes'
import { Board } from './components/Board'
import { GameOverPanel } from './components/GameOverPanel'
import { StatusBar } from './components/StatusBar'
import { StartScreen } from './components/StartScreen'
import { WinPanel } from './components/WinPanel'
import { useGameStore } from './stores/useGameStore'

/**
 * 外壳：开局前是模式 / 风格选择，开局后是棋盘 + 信息条 + 终局面板。
 *
 * 这里只做编排——规则在 src/game/，呈现规则在 themes/<id>/，状态在单 store。
 * T04 起按 phase 挂面板：won → 胜利里程碑，stuck / ended → 死局与终局。
 * 撤销（T11）与作弊交换（T12）将来加在死局面板上，不预埋结构。
 */
export default function App(): JSX.Element {
  const game = useGameStore((state) => state.game)
  const startRun = useGameStore((state) => state.startRun)
  const move = useGameStore((state) => state.move)
  const continueRun = useGameStore((state) => state.continueRun)
  const settle = useGameStore((state) => state.settle)
  const newGame = useGameStore((state) => state.newGame)

  const handleStart = (modeId: ModeId): void => {
    startRun(modeId)
  }

  return (
    <main className="shell grid min-h-dvh place-items-center px-4 py-8">
      {game === null ? (
        <StartScreen onStart={handleStart} />
      ) : (
        <div className="flex flex-col items-center gap-4">
          <h1 className="shell__title text-5xl">2048</h1>
          <StatusBar game={game} />
          {/* 棋盘与面板共用一个相对定位的壳。面板是外壳元素（Tailwind 也只在外壳这侧），
              不能塞进 .board：那层是 ADR-0002 的固定 DOM 结构。w-fit 让这个壳正好
              裹住棋盘，面板 inset:0 才只盖住棋盘，不会横铺整个页面。 */}
          <div className="relative w-fit">
            <Board game={game} onMove={move} />
            {game.phase === 'won' && (
              <WinPanel onContinue={continueRun} onSettle={settle} onNewGame={newGame} />
            )}
            {(game.phase === 'stuck' || game.phase === 'ended') && (
              <GameOverPanel game={game} onSettle={settle} onNewGame={newGame} />
            )}
          </div>
          {/* 面板露头时它自己带「新游戏」入口；这里再摆一个会同名重歧，
              所以在活跃局才显示（mode-contract §3：活跃局直接新游戏 = 放弃本局）。
              移动键提示同理：面板露着（won / stuck / ended）时方向键一概是空操作，
              摆着这句提示就是在骗人，所以它跟按钮共用一个 phase 条件。 */}
          {game.phase === 'playing' && (
            <>
              <button type="button" className="control" onClick={newGame}>
                新游戏
              </button>
              <p className="hint">方向键或 WASD 移动方块</p>
            </>
          )}
        </div>
      )}
    </main>
  )
}
