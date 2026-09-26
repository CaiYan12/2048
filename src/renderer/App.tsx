import type { JSX } from 'react'
import type { ModeId } from '../shared/modes'
import { Board } from './components/Board'
import { StatusBar } from './components/StatusBar'
import { StartScreen } from './components/StartScreen'
import { useGameStore } from './stores/useGameStore'

/**
 * 外壳：开局前是模式 / 风格选择，开局后是棋盘 + 信息条。
 *
 * 这里只做编排——规则在 src/game/，呈现规则在 themes/<id>/，状态在单 store。
 * 胜利面板、死局面板与「新游戏」归 T04，撤销归 T11，本文件不预设它们的结构。
 */
export default function App(): JSX.Element {
  const game = useGameStore((state) => state.game)
  const startRun = useGameStore((state) => state.startRun)
  const move = useGameStore((state) => state.move)

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
          <Board game={game} onMove={move} />
          <p className="hint">方向键或 WASD 移动方块</p>
        </div>
      )}
    </main>
  )
}
