import type { JSX } from 'react'
import type { Tile } from '../../shared/types'
import { tileDigits, tileLabel } from './TileLabel'

// Props 保持局部：仓库里每个组件都只在自己文件里用，导出没有第二个消费者
interface Props {
  tile: Tile
  row: number
  col: number
  /** transform 定位，来自 BoardLayout.cellOffset——宽高由 board.css 用同一个变量算 */
  offset: { x: number; y: number }
}

/**
 * 单个方块。身份（data-tile-id）与数值（data-value）都落在 DOM 上：
 * T21 靠 data-tile-id 认出「同一个方块」来做位移动画，e2e 靠它断言
 * 「Tile 身份不随位置变化」。
 */
export function TileView({ tile, row, col, offset }: Props): JSX.Element {
  return (
    <div
      className="board__tile"
      data-tile-id={tile.id}
      data-value={tile.value}
      data-digits={tileDigits(tile.value)}
      data-row={row}
      data-col={col}
      style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
    >
      {tileLabel(tile.value)}
    </div>
  )
}
