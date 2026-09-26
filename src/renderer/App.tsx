import type { JSX } from 'react'
import type { ModeId } from '../shared/modes'
import { Board } from './components/Board'
import { Countdown } from './components/Countdown'
import { DailyDateLabel } from './components/DailyDateLabel'
import { DirectionPad } from './components/DirectionPad'
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
 * T09 起按 deadline 挂倒计时：限时模式才读表，其余模式的 deadline 是 null。
 * T11 起把撤销接到死局面板与键盘 z 上：面板只在 stuck 时给它留入口（ended 之后
 * 不可用，那道判断在 store 的 undo 里），键盘那条路在 won 阶段同样有效——
 * mode-contract §3 只禁 ended 之后的撤销。作弊交换是 T12 的事，这里不预埋。
 */
export default function App(): JSX.Element {
  const game = useGameStore((state) => state.game)
  const dailyDate = useGameStore((state) => state.dailyDate)
  const startRun = useGameStore((state) => state.startRun)
  const move = useGameStore((state) => state.move)
  const undo = useGameStore((state) => state.undo)
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
          {/* 限时模式的倒计时（T09）：外壳元素，与 StatusBar 平级摆着，不进 .board
              ——ADR-0002 的棋盘固定 DOM 结构不许因为一个倒计时多出节点。
              deadline 为 null 就说明这一模式不限时；结算之后表也没用了，
              剩下的「为什么结束」由 GameOverPanel 从 endReason 读，不在这里推断。 */}
          {game.deadline !== null && game.phase !== 'ended' && (
            <Countdown deadline={game.deadline} />
          )}
          <StatusBar game={game} />
          {/* Daily 的日期说明（T08）：写的是这一局抽题那天的 UTC 日期，跨零点也不翻篇。
              摆在外壳里，与 Board 平级——ADR-0002 的棋盘固定结构不许塞进来说明文字。 */}
          {game.modeId === 'daily' && dailyDate !== null && <DailyDateLabel date={dailyDate} />}
          {/* 棋盘与面板共用一个相对定位的壳。面板是外壳元素（Tailwind 也只在外壳这侧），
              不能塞进 .board：那层是 ADR-0002 的固定 DOM 结构。w-fit 让这个壳正好
              裹住棋盘，面板 inset:0 才只盖住棋盘，不会横铺整个页面。 */}
          <div className="relative w-fit">
            <Board game={game} onMove={move} onUndo={undo} />
            {game.phase === 'won' && (
              <WinPanel onContinue={continueRun} onSettle={settle} onNewGame={newGame} />
            )}
            {(game.phase === 'stuck' || game.phase === 'ended') && (
              <GameOverPanel
                game={game}
                onSettle={settle}
                onNewGame={newGame}
                onUndo={undo}
              />
            )}
          </div>
          {/* 屏幕方向按钮（T10）：外壳元素，与 Board 平级——ADR-0002 的棋盘固定
              DOM 不增节点。只在触摸设备显示（styles.css 的 pointer: coarse），
              桌面端连布局都不占。它调的是同一个 move，与键盘、滑动共用一条派发
              路径。 */}
          <DirectionPad onMove={move} />
          {/* 面板露头时它自己带「新游戏」入口；这里再摆一个会同名重歧，
              所以在活跃局才显示（mode-contract §3：活跃局直接新游戏 = 放弃本局）。
              移动键提示同理：面板露着（won / stuck / ended）时方向键一概是空操作，
              摆着这句提示就是在骗人，所以它跟按钮共用一个 phase 条件。 */}
          {game.phase === 'playing' && (
            <>
              <button type="button" className="control" onClick={newGame}>
                新游戏
              </button>
              <p className="hint">
                {/* 两句话按输入设备二选一（T10）：触摸设备上没有方向键也没有 WASD，
                    摆着那一版是在骗人。判据与方向按钮同一条 pointer: coarse。
                    Z 撤销只写在前一句里：键盘用户才用得上它，触摸设备的撤销入口是
                    死局面板上的「撤销」按钮。快捷键不写出来等于没有——这票加的就是
                    一条没人告诉玩家的隐藏键。 */}
                <span className="hint__pointer">方向键或 WASD 移动方块，Z 撤销</span>
                <span className="hint__touch">滑动或点方向按钮移动方块</span>
              </p>
            </>
          )}
        </div>
      )}
    </main>
  )
}
