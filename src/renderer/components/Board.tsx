import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import type { Direction, GameState } from '../../shared/types'
import { getMode } from '../../shared/modes'
import { DEFAULT_THEME_ID, getTheme } from '../styles/themes'
import { TileView } from './TileView'
import {
  BOARD_GAP,
  BOARD_PADDING,
  createBoardLayout,
  fitCellSize,
  type BoardLayout,
} from './BoardLayout'
import { SWIPE_THRESHOLD, swipeDirection, type Point } from './SwipeGesture'

interface Props {
  game: GameState
  onMove(direction: Direction): void
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

/** 键盘事件落在交互控件上就放行：它们要保留原生键盘行为（SPEC §3.4） */
function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return target.closest('button, select, input, a[href]') !== null
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
 * 颜色来自当前风格 tokens.css，尺寸来自 BoardLayout，呈现可整体替换而结构不动。
 * 插槽永远从风格配置解构出来渲染，不写死成 null——否则 T13/T15 想加装饰时
 * 又得回来改这个组件。
 */
export function Board({ game, onMove }: Props): JSX.Element {
  const mode = getMode(game.modeId)
  const theme = getTheme(DEFAULT_THEME_ID)
  // 插槽的数据名叫 boardOverlay / tileOverlay（interface sheet 定的形状），
  // 组件名按房子风格用 PascalCase，所以解构时改个名
  const { boardOverlay: BoardOverlay, tileOverlay: TileOverlay } = theme

  const cellSize = useCellSize(mode.size)
  const layout: BoardLayout = createBoardLayout(mode.size, cellSize)

  // 开局即把焦点给棋盘：否则玩家还得先点一下页面，方向键才有去处
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true })
  }, [])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (isInteractiveTarget(event.target)) return
    const direction = MOVE_KEYS[event.key.toLowerCase()]
    if (!direction) return
    event.preventDefault()
    onMove(direction)
  }

  // 手势起点只进 ref，不进 state：拖动过程中没有任何东西要显示它，而每帧
  // setState 会让 5×5 棋盘白重渲染一遍。「派生显示状态按需进 React」——这里
  // 没有显示依赖，所以一根手指按下去到松手之间 React 一次都不参与
  const gesture = useRef<{ pointerId: number; point: Point } | null>(null)

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    // 与键盘同一条守卫：落在棋盘内的交互控件上的手势放行。这里不只是「别误动棋盘」——
    // 指针捕获会把后续的 pointerup 连同兼容鼠标事件（含 click）一起重定向到棋盘，
    // 在控件上捕获等于把那个控件的点击吃掉。T03 的 e2e 已经钉了这条守卫的键盘半边
    if (isInteractiveTarget(event.target)) return
    // 已经有一根手指在手势里就忽略第二根：两个起点互相覆写，最后算出来的是第三根
    // 手指的轨迹
    if (gesture.current) return
    // 捕获指针：划出棋盘边界再松手也算一次完整手势。不捕获的话 pointerup 落在棋盘
    // 外，这次划动整段丢掉（触摸设备上手指划过棋盘边缘是常事）
    event.currentTarget.setPointerCapture(event.pointerId)
    gesture.current = {
      pointerId: event.pointerId,
      point: { x: event.clientX, y: event.clientY },
    }
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>): void => {
    const active = gesture.current
    gesture.current = null
    // 起点不匹配就不是这次手势（上面被忽略的第二根手指松手时走这里）
    if (!active || active.pointerId !== event.pointerId) return
    // 手势只在这里判一次：起点是按下那一刻，终点是松手那一刻，中间帧一概不看。
    // 每帧都判的话，一次划动会连着触发多个 Move——而非法 Move 是空操作，画面看着
    // 几乎对，棋盘却会从中间某一帧开始动，那是规则测试看不见的静默损坏
    // （T10 interface sheet §2 点名要防的正是它）
    const direction = swipeDirection(
      { x: active.point.x, y: active.point.y },
      { x: event.clientX, y: event.clientY },
      SWIPE_THRESHOLD
    )
    if (!direction) return
    onMove(direction)
  }

  // 取消（浏览器把手势收走、或被别的事件流打断）：手势作废，一次 Move 都不触发
  const handlePointerCancel = (): void => {
    gesture.current = null
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
            // key 用 Tile.id：React 才会复用同一个 DOM 节点，T21 的位移动画才成立
            return (
              <TileView
                key={cell.id}
                tile={cell}
                row={rowIndex}
                col={colIndex}
                offset={layout.cellOffset(rowIndex, colIndex)}
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
