import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import type { Direction, GameState, StyleId } from '../../shared/types'
import type { Coordinate } from '../../game/board'
import { getMode } from '../../shared/modes'
import { getTheme } from '../styles/themes'
import { TileView } from './TileView'
import { tileRank, tileSlot, valueLadder } from './ValueLadder'
import {
  BOARD_GAP,
  BOARD_PADDING,
  createBoardLayout,
  fitCellSize,
  type BoardLayout,
} from './BoardLayout'
import { createGestureTracker, type GestureTracker } from './GestureTracker'
import { diffTileMotion } from './TileMotion'
import { withinPickRadius } from './TilePick'

interface Props {
  game: GameState
  /** 当前风格（T13）：只决定两个装饰插槽取哪一套的配置。data-style 挂在外壳上 */
  styleId: StyleId
  onMove(direction: Direction): void
  onUndo(): void
  /** 交换拾取中（T12）：true 时方块才进 Tab 序列、才认轻点 */
  swapArmed: boolean
  /** 等第二枚的那一枚（T12）；null = 没有待确认的选择 */
  swapSelection: Coordinate | null
  onSelectCell(coordinate: Coordinate): void
  onExitSwap(): void
}

/**
 * 移动键 → 方向。方向键（SPEC §3.4）+ WASD（用户故事 2 的原文就是「arrow keys or WASD」）。
 * 只用小写查找，Shift 的大写与方向键都能命中。
 */
const MOVE_KEYS: Readonly<Record<string, Direction>> = {
  arrowup: 'up',
  arrowdown: 'down',
  arrowleft: 'left',
  arrowright: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
}

/**
 * 撤销键（T11，ADR-0003）。与 MOVE_KEYS 并排放，为的是让两条键位** visibly 共用
 * 同一条查表路子**：查表前先 toLowerCase，所以 Shift+Z 的 `Z` 自动命中同一个键，
 * WASD 的大写也是这样命中的——不必为大写单列一行。加撤销键只改这一处。
 *
 * **为什么不是 Ctrl+Z**：那个组合在浏览器与操作系统里已经被占用（多数桌面是文本
 * 撤销，有的路径被浏览器自身吃掉），而本项目的撤销不是文本编辑撤销，是把一局游戏
 * 推回上一步；共用一个手势只会让玩家在「不知道哪一个会生效」的地方按错。处理器里
 * 因此另有一条「带 Ctrl / Meta / Alt 的 z 一律不撤销」，把这个决定做到底。
 * `u` 也考虑过：它不撞车，但读起来像菜单助记键，不像一个游戏动作。
 */
const UNDO_KEYS: Readonly<Record<string, boolean>> = { z: true }

/** 键盘事件落在交互控件上就放行：它们要保留原生键盘行为（SPEC §3.4） */
function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return target.closest('button, select, input, a[href]') !== null
}

/**
 * 一次拾取候选：按下时落在数值方块上的那一根手指（T12）。
 *
 * 与手势状态机各记各的：判「点中」的位移阈值在 TilePick.ts，判「划动」的在
 * GestureTracker.ts。两份判据故意不共享入口，理由见 TilePick 的说明。
 */
interface PickCandidate {
  pointerId: number
  point: { x: number; y: number }
  row: number
  col: number
}

/**
 * 按下那一刻如果落在数值方块上，就产出一个拾取候选；否则 null。
 *
 * 认的是**元素**而不是坐标：方块在 DOM 上按 [row][col] 绝对定位（board.css），
 * 「这一下按在哪一枚上」由 DOM 回答最不容易和几何计算脱节。空格与障碍在底板层
 * （.board__cells，pointer-events:none），按到它们时目标根本不是方块，于是天然没有
 * 候选——「障碍不能被选中」因此是结构决定的，不需要一条特判。
 */
function pickCandidate(event: PointerEvent<HTMLDivElement>): PickCandidate | null {
  if (!(event.target instanceof Element)) return null
  const tile = event.target.closest('[data-tile-id]')
  if (!(tile instanceof HTMLElement)) return null
  const row = Number(tile.dataset.row)
  const col = Number(tile.dataset.col)
  // data-row / data-col 一向由 Board 自己写成整数；取不到就当没按在方块上，
  // 绝不让 NaN 坐标流到 store 里去
  if (!Number.isInteger(row) || !Number.isInteger(col)) return null
  return {
    pointerId: event.pointerId,
    point: { x: event.clientX, y: event.clientY },
    row,
    col,
  }
}

/** 棋盘随视口缩放（设计卡 §8）：只在尺寸真的变化时重算，resize 频率不高 */
function useCellSize(size: number): number {
  const [cellSize, setCellSize] = useState(() =>
    fitCellSize(size, window.innerWidth)
  )
  useEffect(() => {
    const sync = (): void => setCellSize(fitCellSize(size, window.innerWidth))
    window.addEventListener('resize', sync)
    return () => window.removeEventListener('resize', sync)
  }, [size])
  return cellSize
}

/**
 * 棋盘（ADR-0002 的固定 DOM 结构 + 两个装饰插槽）
 *
 * 这里渲染的是**结构**：一层底板格子、一层方块、两个插槽。
 * 颜色来自当前风格 tokens.css（经外壳上的 data-style 选中），尺寸来自 BoardLayout，
 * 呈现可整体替换而结构不动。风格 id 只用来取插槽配置——board.css 的配色键是 data-bucket，
 * 主题的色值由 data-style 那边的 CSS 变量给出，所以这个组件不接触任何色值。
 * 插槽永远从风格配置解构出来渲染，不写死成 null——否则 T13/T15 想加装饰时
 * 又得回来改这个组件。
 */
export function Board({
  game,
  styleId,
  onMove,
  onUndo,
  swapArmed,
  swapSelection,
  onSelectCell,
  onExitSwap,
}: Props): JSX.Element {
  const mode = getMode(game.modeId)
  const theme = getTheme(styleId)
  // 插槽的数据名叫 boardOverlay / tileOverlay（interface sheet 定的形状），
  // 组件名按房子风格用 PascalCase，所以解构时改个名
  const { boardOverlay: BoardOverlay, tileOverlay: TileOverlay } = theme
  // 本模式的价值阶梯（T13）。方块按「在本模式目标前的相对进度」取色，所以阶梯必须
  // 跟着模式走：经典 11 级、斐波那契 17 级、大棋盘 12 级。纯函数、每次渲染重算的
  // 代价是十几个元素的数组，不值得为它加 memo
  const ladder = valueLadder(mode)

  const cellSize = useCellSize(mode.size)
  const layout: BoardLayout = createBoardLayout(mode.size, cellSize)

  // 上一帧的局面（T21）。只用来回答「这一帧哪几枚该有动静」——它不呈现任何东西，
  // 所以不进 state；render 里读、commit 之后的 effect 里才写。于是 StrictMode 的
  // 二次渲染读到的还是同一个上一帧，diff 不会被算重；而一次与棋盘无关的重渲染
  // （改视口、换风格）拿到的上一帧就是同一副棋盘，自然一个旗标都不亮。
  // 推断本身在 TileMotion.ts：那是个纯函数，`src/game/` 与这个 ref 都碰不到它。
  // 它**只喂三个 data-* 属性**，不动 rngState、不动分数、不动身份，也不拦任何输入
  // ——动画是 CSS 的事，键盘按下的那一刻棋盘就已经是新状态了。
  const previous = useRef<GameState | null>(null)
  const motion = diffTileMotion(previous.current, game, mode.target)
  useEffect(() => {
    previous.current = game
  }, [game])

  // 开局即把焦点给棋盘：否则玩家还得先点一下页面，方向键才有去处
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true })
  }, [])
  // 交换交互一收摊（完成 / Esc / 被一次移动或撤销清掉）就把焦点还给棋盘。
  // 不还就会掉进一个键盘陷阱：拾取中的方块才带 tabIndex，模式一关它取不到了，
  // 焦点落在 body 上，方向键从此失灵——而键盘玩家每完成一次交换都正好走到这里，
  // 所以这不是补丁，是那条路径的一部分
  //
  // T22：同一个陷阱还有另一条来路，**更宽**——玩家在终局面板 / 胜利面板上按下的
  // 任何一枚按钮都会让那一层面板卸载，被聚焦的按钮跟着从 DOM 上消失，焦点掉到
  // body 上：撤销、继续玩、结束并记录、新游戏，四条路一条都逃不掉。此后方向键
  // 失灵，键盘玩家每用一次面板就断一次（鼠标玩家点一下棋盘就恢复了，所以这个
  // 缺陷只在纯键盘路径上现形——T22 的验收标准 1 正是那条路径）。
  // 判据因此从「拾取态收摊了」换成「焦点掉到 body 上了」：移动一步时焦点在棋盘上，
  // 这一问是个空操作；只有焦点真的丢了才把它还给棋盘。拾取收摊那一路径也仍然
  // 由它覆盖（tabIndex 一摘掉焦点就掉到 body），所以两条并成一条 effect 就够。
  // 依赖里带 game：没有它，一条不换 game 的纯界面变化（收起面板、Esc 出拾取）
  // 不会重跑；带上它，每一次状态变化都问一次那句话，代价是一次相等比较。
  useEffect(() => {
    if (swapArmed || swapSelection !== null) return
    if (document.activeElement !== document.body) return
    rootRef.current?.focus({ preventScroll: true })
  }, [game, swapArmed, swapSelection])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (isInteractiveTarget(event.target)) return
    const key = event.key.toLowerCase()
    // Esc：取消选择并退出交换拾取（用户故事 16 的「不用指针退出」）。键名与移动键
    // 同一条 lowercase 查表路子（'Escape'.toLowerCase() === 'escape'）。
    // 顺序在移动键之前：拾取中按 Esc 只该收摊，不该顺手推一下棋盘
    if (key === 'escape') {
      event.preventDefault()
      onExitSwap()
      return
    }
    const direction = MOVE_KEYS[key]
    if (direction) {
      event.preventDefault()
      onMove(direction)
      return
    }
    // 带修饰键的 z 不算撤销：Ctrl+Z / Cmd+Z 是浏览器与操作系统的文本撤销，本项目
    // 刻意不给它让路（见 UNDO_KEYS 的说明）。放行的意义是让浏览器照旧处理它自己的
    // 组合，而不是被棋盘吃掉。移动键不改这条——那是既有行为，这票不动它。
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (UNDO_KEYS[key]) {
      event.preventDefault()
      onUndo()
    }
  }

  // 手势起点只进 ref，不进 state：拖动过程中没有任何东西要显示它，而每帧
  // setState 会让 5×5 棋盘白重渲染一遍。「派生显示状态按需进 React」——这里
  // 没有显示依赖，所以一根手指按下去到松手之间 React 一次都不参与。
  // 状态机整段在 GestureTracker.ts：缺陷出在处理器被调用的**顺序**上，而顺序只有
  // 浏览器能给，抽成纯模块之后那串顺序才能在 tests/unit 里逐帧重放
  // useState 的懒初始化只跑一次；写成 useRef(createGestureTracker()) 会每渲染
  // 造一个再扔掉
  const [gesture] = useState(createGestureTracker)
  // 拾取候选与手势起点各记各的（见 PickCandidate 的说明）。ref 而不是 state：
  // 按下到松手之间没有任何东西要显示它
  const pick = useRef<PickCandidate | null>(null)

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    // 与键盘同一条守卫：落在棋盘内的交互控件上的手势放行。这里不只是「别误动棋盘」——
    // 指针捕获会把后续的 pointerup 连同兼容鼠标事件（含 click）一起重定向到棋盘，
    // 在控件上捕获等于把那个控件的点击吃掉。T03 的 e2e 已经钉了这条守卫的键盘半边
    if (isInteractiveTarget(event.target)) return
    // 交换拾取：按下就在方块上就记一个候选。与手势**并行**、互不依赖——
    // 即便这一根手指随后被手势状态机忽略（第二根手指），一次真正的轻点照样算选中，
    // 因为它本来就是另一个问题（见 TilePick）
    pick.current = swapArmed ? pickCandidate(event) : null
    // 先问状态机收不收这根手指，再决定捕不捕。顺序反了会漏第二根手指进来：捕获是
    // **被忽略的手指也吃得下的副作用**——触摸指针在按下目标上有隐式捕获，组件不为
    // 它调 setPointerCapture，它的 pointerup / lostpointercapture 照样被重定向到 .board。
    // 于是第二根手指一松手就抽走第一根的起点，一次有意的划动产出零次 Move。
    // 守卫判断留在 GestureTracker.down 里（只此一份），这里只按它的答复行动——
    // 内联回来等于把抽成纯模块换来的可测性还回去
    const accepted = gesture.down(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    })
    if (!accepted) return
    // 捕获指针：划出棋盘边界再松手也算一次完整手势。不捕获的话 pointerup 落在棋盘
    // 外，这次划动整段丢掉（触摸设备上手指划过棋盘边缘是常事）
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>): void => {
    // 手势只在这里判一次：起点是按下那一刻，终点是松手那一刻，中间帧一概不看。
    // 每帧都判的话，一次划动会连着触发多个 Move——而非法 Move 是空操作，画面看着
    // 几乎对，棋盘却会从中间某一帧开始动，那是规则测试看不见的静默损坏
    // （T10 interface sheet §2 点名要防的正是它）。「判几次」的逻辑整段在
    // GestureTracker.up 里，这里只负责把它接到 onMove 上
    const direction = gesture.up(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    })
    // 拾取候选与手势问的是两个问题（TilePick 的说明），所以这里两个都问：
    // 划成了就先手势，轻点过才轮到拾取。位移够小的判定用指针 id 与位移各对一次，
    // 于是第二根手指的松手既不会抹掉别人的候选，也不会被误当成一次点选
    const candidate = pick.current
    pick.current = null
    if (direction) {
      onMove(direction)
      return
    }
    if (
      candidate !== null &&
      candidate.pointerId === event.pointerId &&
      withinPickRadius(candidate.point, { x: event.clientX, y: event.clientY })
    ) {
      onSelectCell([candidate.row, candidate.col])
    }
  }

  // 取消（浏览器把手势收走、或被别的事件流打断）：手势作废，一次 Move 都不触发；
  // 拾取候选一并作废，但它只认自己的那一次——擦掉别人的候选不是补救，是破坏
  const handlePointerCancel = (event: PointerEvent<HTMLDivElement>): void => {
    gesture.cancel(event.pointerId)
    if (pick.current?.pointerId === event.pointerId) pick.current = null
  }

  // 捕获被释放也作废，但只作废自己的那一次：擦掉别人的起点不是补救，是破坏。
  // 「只有 swiping 那一根会走到这里」是不成立的——隐式捕获让被忽略的第二根手指的
  // 释放也被重定向到 .board，所以必须把 pointerId 递下去，由 GestureTracker.lost 用
  // 与 cancel 同一形状的守卫比对。它同时是防楔子的唯一入口：一次没送到的 pointerup
  // 会把起点永远留在里面，而 down 的「已有一根在手势里就忽略第二根」从此再也不放行
  // 任何新手势
  const handleLostPointerCapture = (event: PointerEvent<HTMLDivElement>): void => {
    gesture.lost(event.pointerId)
  }

  const style = {
    '--board-size-px': `${layout.pixelSize}px`,
    '--cell-size': `${cellSize}px`,
    '--board-gap': `${BOARD_GAP}px`,
    '--board-padding': `${BOARD_PADDING}px`,
  } as CSSProperties

  return (
    <div
      ref={rootRef}
      className="board"
      data-board
      data-mode={mode.id}
      tabIndex={0}
      // application：方向键要交给游戏本身处理，而不是被读屏软件的浏览模式吃掉
      role="application"
      aria-label={`${mode.label}棋盘，方向键或 WASD 移动方块`}
      style={style}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onLostPointerCapture={handleLostPointerCapture}
    >
      <div className="board__cells" aria-hidden="true">
        {Array.from({ length: mode.size * mode.size }, (_, index) => {
          const row = Math.floor(index / mode.size)
          const col = index % mode.size
          const { x, y } = layout.cellOffset(row, col)
          return (
            <div
              key={`${row}-${col}`}
              className="board__cell"
              // data-cell 是底板层的「这一格是什么」：T07 之前空格与障碍渲染得一模一样，
              // 于是四格墙是四个看不见的洞。风格按它上色（board.css 的 [data-cell='wall']），
              // 无障碍模式的每个格子都是 'empty'，行为与改动前一致。
              data-cell={game.board[row][col] === 'wall' ? 'wall' : 'empty'}
              style={{ transform: `translate(${x}px, ${y}px)` }}
            />
          )
        })}
      </div>

      <div className="board__tiles">
        {game.board.map((row, rowIndex) =>
          row.map((cell, colIndex) => {
            if (cell === null || cell === 'wall') return null
            // key 用 Tile.id：React 才会复用同一个 DOM 节点，T21 的位移动画才成立。
            // **不许改成位置做 key**——那会让 React 卸载再重挂，方块跳而不是滑，
            // 一次合并还会在同一格里出现两枚（T21 验收标准 1 禁的正是它）
            const rank = tileRank(ladder, cell.value)
            return (
              <TileView
                key={cell.id}
                tile={cell}
                row={rowIndex}
                col={colIndex}
                offset={layout.cellOffset(rowIndex, colIndex)}
                rank={rank}
                slot={tileSlot(rank, ladder.length)}
                motion={motion.get(cell.id)}
                selectable={swapArmed}
                selected={
                  swapSelection !== null &&
                  swapSelection[0] === rowIndex &&
                  swapSelection[1] === colIndex
                }
                onSelect={() => onSelectCell([rowIndex, colIndex])}
              />
            )
          })
        )}
      </div>

      <BoardOverlay />
      <TileOverlay />
    </div>
  )
}
