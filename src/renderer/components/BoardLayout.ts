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

/**
 * 再窄也不低于这个格边长（px）。
 *
 * 它守的是「方块上的数字还读得清」，不是「棋盘放不放得下」：board.css 的位数阶梯
 * 每一档都是 `calc(var(--cell-size) * 比例)`，字号跟着格子等比缩，所以一位数字在
 * 36px 的格子上仍有 16.2px。原值 48 是字号还不随格子缩的那个时代定下的，理由
 * （「低于它数字读不出来」）早已不成立——真正会读不出来的是四位数（0.27 倍格边长），
 * 而那是格子物理宽度的上限，不是地板能救的。
 *
 * 为什么是 36：5×5 的棋盘宽 = 24 + 5×cell + 48，于是在 300px 视口上正好放得下
 * （cell = 36 时棋盘 252px = 视口 300 − 两侧 48）。再往下压只是让一位数字也变小，
 * 换不来「放得下」。320px 是最窄的真实设备，留 20px 余量足够。
 */
export const BOARD_CELL_SIZE_MIN = 36

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
 *
 * 「不溢出」这句以 BOARD_CELL_SIZE_MIN 兜得住为前提：视口低于
 * `48 + 24 + size×36 + 12×(size−1)`（5×5 是 300px、4×4 是 252px）时地板开始赢，
 * 棋盘会重新宽于可用空间。那时宁可溢出也不再缩——数字缩到读不清比横向滚动更难救，
 * 而真实设备不会低于 320px。
 */
export function fitCellSize(size: number, viewportWidth: number): number {
  const available = viewportWidth - BOARD_SIDE_MARGIN * 2
  const inner = (cellSize: number) =>
    BOARD_PADDING * 2 + cellSize * size + BOARD_GAP * (size - 1)

  if (inner(BOARD_CELL_SIZE) <= available) return BOARD_CELL_SIZE

  const fitted = Math.floor((available - BOARD_PADDING * 2 - BOARD_GAP * (size - 1)) / size)
  return Math.max(fitted, BOARD_CELL_SIZE_MIN)
}
