/**
 * 棋盘布局的唯一数值来源
 *
 * cell-size / gap / padding 全在这里算，board.css 只从 CSS 变量消费。
 * 若把数值抄进 CSS 一份，改棋盘尺寸就会出现两处对不上的局面。
 */

export const BOARD_CELL_SIZE = 100
export const BOARD_GAP = 12
export const BOARD_PADDING = 12

/** 棋盘两侧留给页面的留白（px）：窄屏按它反算格子能有多大 */
export const BOARD_SIDE_MARGIN = 24

/** 再窄也不低于这个格边长：低于它方块上的数字就读不出来了 */
export const BOARD_CELL_SIZE_MIN = 48

export interface BoardLayout {
  size: number
  /** 含内边距与间距的整块棋盘边长（px） */
  pixelSize: number
  /** 格子 [row][col] 相对棋盘坐标系左上角的偏移（px），transform 用它定位 */
  cellOffset(row: number, col: number): { x: number; y: number }
}

export function createBoardLayout(size: number, cellSize = BOARD_CELL_SIZE): BoardLayout {
  const gap = BOARD_GAP
  const padding = BOARD_PADDING
  const pixelSize = padding * 2 + cellSize * size + gap * (size - 1)

  return {
    size,
    pixelSize,
    cellOffset: (row, col) => ({
      x: col * (cellSize + gap),
      y: row * (cellSize + gap),
    }),
  }
}

/**
 * 给定视口宽度时该用多大的格子：桌面取上限，放不下就按比例缩。
 *
 * 纯函数（视口宽度由调用方从 window 传入），所以 BoardLayout.ts 本身不碰 DOM。
 * T23 的 18 组合遍历会验证：任何尺寸的棋盘都不能横向溢出。
 */
export function fitCellSize(size: number, viewportWidth: number): number {
  const available = viewportWidth - BOARD_SIDE_MARGIN * 2
  const inner = (cellSize: number) =>
    BOARD_PADDING * 2 + cellSize * size + BOARD_GAP * (size - 1)

  if (inner(BOARD_CELL_SIZE) <= available) return BOARD_CELL_SIZE

  const fitted = Math.floor((available - BOARD_PADDING * 2 - BOARD_GAP * (size - 1)) / size)
  return Math.max(fitted, BOARD_CELL_SIZE_MIN)
}
