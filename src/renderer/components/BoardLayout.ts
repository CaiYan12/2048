/**
 * 棋盘布局的唯一数值来源
 *
 * cell-size / gap / padding 全在这里算，board.css 只从 CSS 变量消费。
 * 若把数值抄进 CSS 一份，改棋盘尺寸就会出现两处对不上的局面。
 */

export const BOARD_CELL_SIZE = 100
export const BOARD_GAP = 12
export const BOARD_PADDING = 12

/**
 * 棋盘两侧留给页面的留白（px）：窄屏按它反算格子能有多大。
 *
 * 24 = 外壳每侧 px-4 的 16，再加一份竖向滚动条宽度：Board.tsx 按 window.innerWidth
 * 读数（含滚动条），而 px-4 落在 documentElement.clientWidth 上（不含），桌面端多出
 * 的这一份不是缓冲而是滚动条——320px 视口带 ~15px 滚动条时算式预算 272、真实内容区
 * 273，只剩 1px，正是这 8px 买回来的。移动端是浮层滚动条，那时它才真的是余量。
 */
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
 * 为什么是 36：它是「方块上的数字还读得清」的底线，不是「棋盘放不放得下」的底线。
 * board.css 给一位数字的兜底字号是 `calc(var(--cell-size) * 0.45)`，36 × 0.45 =
 * 16.2px，这就是「还读得清」那一档的下沿。至于放不放得下：地板每降 2px，5×5 的
 * 布雷点就跟着降 10px（cell = 32 时棋盘 232px，280px 视口上正好放得下）——压地板
 * 确实换得来「放得下」，只是每一步都要拿一位数字的字号去换。320px 是最窄的真实
 * 设备，留 20px 余量足够，所以取值停在这里。
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
 * 棋盘会重新宽于可用空间。注意这里说的是算式的那把尺子：可用空间 = viewport − 48
 * （每侧 BOARD_SIDE_MARGIN = 24）；页面真正的内容区是外壳的 `viewport − 32`（px-4
 * 每侧 16），所以同一块棋盘要到更窄才真的让页面横滚——5×5 的 252px 棋盘是 284px
 * 以下、4×4 的 204px 棋盘是 236px 以下。300px 视口上 5×5 不但放得下，还富余 16px。
 * 真到那一步也宁可溢出不再缩：数字缩到读不清比横向滚动更难救，而真实设备
 * 不会低于 320px。
 */
export function fitCellSize(size: number, viewportWidth: number): number {
  const available = viewportWidth - BOARD_SIDE_MARGIN * 2
  const inner = (cellSize: number) =>
    BOARD_PADDING * 2 + cellSize * size + BOARD_GAP * (size - 1)

  if (inner(BOARD_CELL_SIZE) <= available) return BOARD_CELL_SIZE

  const fitted = Math.floor((available - BOARD_PADDING * 2 - BOARD_GAP * (size - 1)) / size)
  return Math.max(fitted, BOARD_CELL_SIZE_MIN)
}
