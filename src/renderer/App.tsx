import { useEffect, useRef, useState, type JSX } from 'react'
import type { ModeId } from '../shared/modes'
import { Board } from './components/Board'
import { Countdown } from './components/Countdown'
import { DailyDateLabel } from './components/DailyDateLabel'
import { DirectionPad } from './components/DirectionPad'
import { GameOverPanel } from './components/GameOverPanel'
import { StatsPanel } from './components/StatsPanel'
import { StatusBar } from './components/StatusBar'
import { StorageNotice } from './components/StorageNotice'
import { StartScreen } from './components/StartScreen'
import { StylePicker } from './components/StylePicker'
import { WinPanel } from './components/WinPanel'
import { recheckEffectiveFont } from './styles/fontState'
import { useGameStore } from './stores/useGameStore'

/**
 * 外壳：开局前是模式 / 风格选择，开局后是棋盘 + 信息条 + 终局面板。
 *
 * 这里只做编排——规则在 src/game/，呈现规则在 themes/<id>/，状态在单 store。
 * T04 起按 phase 挂面板：won → 胜利里程碑，stuck / ended → 死局与终局。
 * T09 起按 deadline 挂倒计时：限时模式才读表，其余模式的 deadline 是 null。
 * T11 起把撤销接到死局面板与键盘 z 上：面板只在 stuck 时给它留入口（ended 之后
 * 不可用，那道判断在 store 的 undo 里），键盘那条路在 won 阶段同样有效——
 * mode-contract §3 只禁 ended 之后的撤销。
 * T12 起把作弊交换接到 StatusBar 与死局面板：拾取中先收起死局面板，否则它那层
 * 不透明满盖会把方块挡住，指针那条路点不到东西（理由见下面板那一段）。
 * T13 起把风格切换接到外壳上：`data-style` 是整套换肤机制的根——每套风格的
 * tokens.css / styles.css 都把自己的规则挂在 `[data-style='<id>']` 之下，所以多套风格的
 * CSS 同时活在同一个产物里也不互相覆盖。它挂在外壳而不是 .board 上：ADR-0002 规定棋盘
 * DOM 固定，而外壳正是「可以换实现」的那一层（设计卡 §5）。
 * T14 起在 styleId 变化时重跑字体状态机：换风格可能换了一套从没下载过的字体，
 * 启动时那一次检测的结论不能永久锁住它（ADR-0005 最后一句）。
 * T16 起在挂载时读一次存档：刷新之后这一局接着打。读存档是异步的，所以第一帧
 * 显示的是「正在恢复」而不是开局界面——先把开局界面画出来再撤掉，玩家看见的就是
 * 一次「我的一局好像没了」的闪烁。
 * T17 起同一批读取把记录与统计（records / stats 两个桶）一起带回来，外壳上多一个
 * 「战绩与统计」入口：开局前与局中都能看，它不盖棋盘、不抢焦点。
 */
export default function App(): JSX.Element {
  // 外壳元素本身。字体重探需要它：这一套风格的字体栈挂在 data-style 上，
  // 只有这个元素算得出来（fontState.ts 的 effectiveFamilies）
  const shellRef = useRef<HTMLElement>(null)
  const game = useGameStore((state) => state.game)
  const dailyDate = useGameStore((state) => state.dailyDate)
  const styleId = useGameStore((state) => state.styleId)
  const selectedModeId = useGameStore((state) => state.selectedModeId)
  const setStyle = useGameStore((state) => state.setStyle)
  const selectMode = useGameStore((state) => state.selectMode)
  const storageNotice = useGameStore((state) => state.storageNotice)
  const restoring = useGameStore((state) => state.restoring)
  const hydrate = useGameStore((state) => state.hydrate)
  const startRun = useGameStore((state) => state.startRun)
  const move = useGameStore((state) => state.move)
  const undo = useGameStore((state) => state.undo)
  const continueRun = useGameStore((state) => state.continueRun)
  const settle = useGameStore((state) => state.settle)
  const newGame = useGameStore((state) => state.newGame)
  const swapArmed = useGameStore((state) => state.swapArmed)
  const swapSelection = useGameStore((state) => state.swapSelection)
  const toggleSwap = useGameStore((state) => state.toggleSwap)
  const selectCell = useGameStore((state) => state.selectCell)
  const clearSwap = useGameStore((state) => state.clearSwap)
  const records = useGameStore((state) => state.records)
  const stats = useGameStore((state) => state.stats)

  // 战绩面板的开合。住在 App 而不是 store：它只被这一处用到，而 store 里的每个
  // 字段都会被 hydrate / setState 的字段表牵着走（T16 的形状判据就是这么变复杂的）
  const [statsOpen, setStatsOpen] = useState(false)

  const handleStart = (modeId: ModeId): void => {
    startRun(modeId)
  }

  // 字体状态机跟着风格走（T14）。写在 effect 里而不是 setStyle 里：store 是协调者，
  // 不该伸手摸 document（SPEC §4）。同字族之间切换时不闪 loading 的那道判据在
  // fontState 里——它按「正在观察的那一组变了没有」决定要不要重新观察
  useEffect(() => {
    recheckEffectiveFont(shellRef.current)
  }, [styleId])

  // 读一次存档（T16）。写在挂载 effect 里而不是 store 的模块初始化里：IndexedDB
  // 是异步的，模块求值那一刻什么都读不到。StrictMode 会把这个 effect 跑两遍，
  // hydrate 内部记着正在进行的读，两遍读同一份、只落一次状态。
  //
  // 顺序无关紧要：恢复出来的 styleId 若与当前不同，上面那个 effect 会因为它
  // 的依赖变了而重跑一次字体重探——恢复一套从没下载过字体的风格，走的正是
  // 「切换风格」那条已经验过的路（ADR-0005 最后一句要求的就是这件事）
  useEffect(() => {
    hydrate()
  }, [hydrate])

  return (
    <main
      ref={shellRef}
      className="shell grid min-h-dvh place-items-center px-4 py-8"
      // 换肤机制唯一的钩子：每套风格的令牌与呈现规则都按这个属性选择
      data-style={styleId}
    >
      {/* 存档读不出来 / 写不进去（T16 验收标准 2）。摆在外壳最上面、开局界面与
          棋盘都看得到的地方——写入失败是在打一局的过程中冒出来的，只在开局界面
          提示等于在玩家唯一还在玩的时刻闭嘴 */}
      {storageNotice !== null && <StorageNotice notice={storageNotice} />}
      {restoring ? (
        <section className="flex flex-col items-center gap-2 py-8">
          <h1 className="shell__title text-6xl">2048</h1>
          <p className="hint">正在恢复上次的一局…</p>
        </section>
      ) : game === null ? (
        <StartScreen
          onStart={handleStart}
          selectedModeId={selectedModeId}
          onSelectMode={selectMode}
          styleId={styleId}
          onStyleChange={setStyle}
        />
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
          <StatusBar
            game={game}
            swapArmed={swapArmed}
            swapSelection={swapSelection}
            onToggleSwap={toggleSwap}
          />
          {/* Daily 的日期说明（T08）：写的是这一局抽题那天的 UTC 日期，跨零点也不翻篇。
              摆在外壳里，与 Board 平级——ADR-0002 的棋盘固定结构不许塞进来说明文字。 */}
          {game.modeId === 'daily' && dailyDate !== null && <DailyDateLabel date={dailyDate} />}
          {/* 局中也能换风格（T13 验收标准 2）：只写 store 的 styleId 一个字段，
              棋盘 / 分数 / 随机进度 / 计时一个都不碰。摆在这里而不是塞进 StatusBar：
              它是「这一局的观感」，不是「这一局的状态」。与开局界面共用同一个
              StylePicker，列表来自 THEMES 注册表。 */}
          <StylePicker value={styleId} onChange={setStyle} />
          {/* 棋盘与面板共用一个相对定位的壳。面板是外壳元素（Tailwind 也只在外壳这侧），
              不能塞进 .board：那层是 ADR-0002 的固定 DOM 结构。w-fit 让这个壳正好
              裹住棋盘，面板 inset:0 才只盖住棋盘，不会横铺整个页面。 */}
          <div className="relative w-fit">
            <Board
              game={game}
              styleId={styleId}
              onMove={move}
              onUndo={undo}
              swapArmed={swapArmed}
              swapSelection={swapSelection}
              onSelectCell={selectCell}
              onExitSwap={clearSwap}
            />
            {game.phase === 'won' && (
              <WinPanel onContinue={continueRun} onSettle={settle} onNewGame={newGame} />
            )}
            {/* 死局可恢复面板。**拾取中先收起**：.overlay 是不透明满盖
                （styles.css 的 inset:0 + 实底），它挡着棋盘就点不到方块，指针那条
                交换路径会整个断掉。收起不等于规则变了一步——phase 仍是 stuck，
                拾取收摊（完成 / Esc / 一次移动）若还死着，面板自己回来。
                ended 那一侧没有「拾取中」可言：store 的 selectCell 直接拒绝它，
                所以它不受这个条件影响。 */}
            {((game.phase === 'stuck' && !swapArmed) || game.phase === 'ended') && (
              <GameOverPanel
                game={game}
                onSettle={settle}
                onNewGame={newGame}
                onUndo={undo}
                onSwap={toggleSwap}
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

      {/* 战绩与统计（T17 · 用户故事 22）。摆在两个分支**外面**：开局前看得到
          「上一局留下了什么」，局中也看得到，而入口只有一个——同一个组件、同一个
          按钮，不按 phase 分叉。它是 `.board` 的兄弟（ADR-0002 的固定 DOM 不许
          往棋盘里塞东西），所以打开它不盖棋盘、也不打断这一局；键盘到达它走普通
          Tab 顺序，不带 autofocus——一把焦点从棋盘上拽走，玩家会以为这局被打断了。 */}
      {!restoring && (
        <div className="mt-4 flex flex-col items-center gap-4">
          <button
            type="button"
            className="control"
            aria-expanded={statsOpen}
            onClick={() => setStatsOpen((open) => !open)}
          >
            战绩与统计
          </button>
          {statsOpen && (
            <StatsPanel records={records} stats={stats} onClose={() => setStatsOpen(false)} />
          )}
        </div>
      )}
    </main>
  )
}
