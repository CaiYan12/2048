import { useEffect, useRef, useState, type CSSProperties, type JSX, type KeyboardEvent } from 'react'
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
