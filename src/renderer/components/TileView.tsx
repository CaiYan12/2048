import type { KeyboardEvent, JSX } from 'react'
import type { Tile } from '../../shared/types'
import { NO_TILE_MOTION, type TileMotion } from './TileMotion'
import { tileDigits, tileLabel } from './TileLabel'

// Props 保持局部：仓库里每个组件都只在自己文件里用，导出没有第二个消费者
interface Props {
  tile: Tile
  row: number
  col: number
  /** transform 定位，来自 BoardLayout.cellOffset——宽高由 board.css 用同一个变量算 */
  offset: { x: number; y: number }
  /** 数值在本模式价值阶梯里的 1-based 位置（ValueLadder.tileRank）。阶梯外 = 超过目标 */
  rank: number
  /** 按相对进度折进主题 11 个色档里的第几档（ValueLadder.tileSlot）。board.css 的配色键 */
  slot: number
  /**
   * 这一帧的动效旗标（T21）。只变成三个 data-* 属性：**这里不做任何动画**——
   * 动画一律在 board.css 里由这三个属性驱动，组件连时长都不碰。理由与 T13 的配色键
   * 同一条：CSS 管呈现，组件只管把事实说出去。
   */
  motion?: TileMotion
  /** 交换拾取中（T12）：这枚方块可以被选中 */
  selectable: boolean
  /** 它正是等第二枚的那一枚（T12） */
  selected: boolean
  onSelect(): void
}

/**
 * 单个方块。身份（data-tile-id）与数值（data-value）都落在 DOM 上：
 * T21 靠 data-tile-id 认出「同一个方块」来做位移动画，e2e 靠它断言
 * 「Tile 身份不随位置变化」。
 *
 * T13 起多加两个属性：`data-rank`（阶梯位置）与 `data-bucket`（色档）。为什么 bucket
 * 也要上 DOM：board.css 的配色键是它，而它由 ValueLadder 的纯函数算出来——算式放进
 * .ts 是为了能单测，CSS 里写不出「ceil 之后再按算出的数索引一个静态 token 名」。
 *
 * T21 起再多三个属性：`data-spawn` / `data-merge` / `data-win`，各自是入场、
 * 合并脉冲与胜利序列的开关。它们与拾取态那两条同一条规矩——**只加属性、不加节点**
 * （ADR-0002 的棋盘固定 DOM 结构不许因为一个动效多出一层），且没动静的那一帧三个
 * 属性都不出现，DOM 与 T21 之前逐字节一致。
 */
export function TileView({
  tile,
  row,
  col,
  offset,
  rank,
  slot,
  motion = NO_TILE_MOTION,
  selectable,
  selected,
  onSelect,
}: Props): JSX.Element {
  /** Enter / Space = 拾取这枚方块（用户故事 16 的纯键盘路径） */
  const handleActivate = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    // Space 默认会滚页面：这一层是游戏界面，按下它就是「选择这枚方块」
    event.preventDefault()
    onSelect()
  }

  return (
    <div
      className="board__tile"
      data-tile-id={tile.id}
      data-value={tile.value}
      data-rank={rank}
      data-bucket={slot}
      data-digits={tileDigits(tile.value)}
      // 三个动效钩子，规则全在 board.css：没动静的那一帧三个属性都不出现，
      // DOM 与 T21 之前逐字节一致（换风格与 T12 都不受影响）。
      // `|| undefined` 是 React 删掉布尔属性的正规写法——写成 false 会渲染出
      // data-spawn="false"，那个值同样命中 [data-spawn='true'] 之外的选择器，
      // 于是「有没有这个属性」就不再是干净的开关了
      data-spawn={motion.spawn || undefined}
      data-merge={motion.merge || undefined}
      data-win={motion.win || undefined}
      // 两个呈现钩子，规则在 board.css：没进拾取态时这两个属性都不出现，
      // DOM 与 T12 之前逐字节一致（换风格与 T21 都不受影响）
      data-selectable={selectable || undefined}
      data-selected={selected || undefined}
      data-row={row}
      data-col={col}
      style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
      tabIndex={selectable ? 0 : undefined}
      // role=button 而不是真 <button>：真按钮会被 Board 的 isInteractiveTarget
      // 认成「交互控件」而整键放行，方向键在它上面就失灵了——那道守卫是给面板按钮
      // 留的。拾取中按方向键移动方块必须仍然成立，所以这里只要语义、不要元素
      role={selectable ? 'button' : undefined}
      aria-pressed={selectable ? selected : undefined}
      aria-label={
        selectable
          ? `第 ${row + 1} 行第 ${col + 1} 列的方块，数值 ${tile.value}，按 Enter 选择`
          : undefined
      }
      onKeyDown={selectable ? handleActivate : undefined}
    >
      {tileLabel(tile.value)}
    </div>
  )
}
