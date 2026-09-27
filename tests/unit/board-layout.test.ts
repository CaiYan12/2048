import { describe, expect, test } from 'vitest'
import {
  BOARD_CELL_SIZE,
  BOARD_CELL_SIZE_MIN,
  BOARD_PADDING,
  BOARD_SIDE_MARGIN,
  createBoardLayout,
  fitCellSize,
} from '../../src/renderer/components/BoardLayout'

/**
 * BoardLayout 是布局的唯一数值来源：Board.tsx 把 cell-size 贴成 CSS 变量，
 * board.css 只消费、不抄第二份。fitCellSize 是其中唯一的**判断**——放不放得下
 * 全由它一句话决定，而它此前一条测试都没有。于是「窄屏上 5×5 横向溢出」这件事
 * 只在有人打开窄窗口时才现形，npm test 一路绿。T06 把断言补在这里。
 *
 * 两个刻意：
 *   · 棋盘宽不重抄公式，走 createBoardLayout(size, cell).pixelSize——同一个计算的
 *     公开面，免得测试里养一份早晚和实现长歪的副本；
 *   · 断言写成「要么放得下，要么就是地板在兜底」的不变式，而不是一张写死的表：
 *     表只能防住这几个宽度，不变式能防住**任何** width × size 组合（T23 要遍历的
 *     正是这件事）。
 */

/** 视口扣掉两侧留白后真正能放棋盘的空间 */
const available = (viewport: number): number => viewport - BOARD_SIDE_MARGIN * 2

/** 给定格边长时整块棋盘多宽（含内边距与间距） */
const boardWidth = (size: number, cell: number): number => createBoardLayout(size, cell).pixelSize

describe('fitCellSize：宽屏取上限', () => {
  // 桌面视口远大于棋盘，一格都不该缩：缩了就是白扔屏幕
  test.each([
    [4, 1280],
    [4, 640],
    [5, 1280],
    [5, 768],
  ])('%i×%i：直接用 BOARD_CELL_SIZE', (size, viewport) => {
    expect(fitCellSize(size, viewport)).toBe(BOARD_CELL_SIZE)
    expect(boardWidth(size, BOARD_CELL_SIZE)).toBeLessThanOrEqual(available(viewport))
  })
})

describe('fitCellSize：5×5 的窄视口（T06 的测量表）', () => {
  /**
   * 每一行都是「视口 → 格边长、棋盘宽、放不放得下」。
   * 393 是 Playwright 的手机视口（Pixel 5），320 是最窄的真实设备（小安卓）。
   * 300 是地板刚好兜得住的边界：再窄一格棋盘就会重新宽于可用空间。
   */
  test.each([
    [393, 54, 342],
    [375, 51, 327],
    [360, 48, 312],
    [340, 44, 292],
    [320, 40, 272],
    [300, 36, 252],
  ])('%ipx 视口：格 %ipx、棋盘 %ipx，一格不差地放得下', (viewport, cell, board) => {
    const fitted = fitCellSize(5, viewport)
    expect(fitted).toBe(cell)
    expect(boardWidth(5, fitted)).toBe(board)
    expect(boardWidth(5, fitted)).toBeLessThanOrEqual(available(viewport))
  })

  test('低于地板兜得住的范围：宁可溢出也不再缩', () => {
    // 280px 时算式给出 32，小于地板，于是夹回地板：棋盘 252px 宽于可用的 232px。
    // 这是有意为之——数字缩到读不清比横向滚动更难救，而真实设备不会低于 320px。
    expect(fitCellSize(5, 280)).toBe(BOARD_CELL_SIZE_MIN)
    expect(boardWidth(5, BOARD_CELL_SIZE_MIN)).toBeGreaterThan(available(280))
  })
})

describe('fitCellSize：4×4 的窄视口', () => {
  // 5×5 的修复不许把 4×4 弄坏：4×4 在不缩的地段一格都没动，
  // 缩的起点仍是 252px（4 个格子比 5 个窄，所以阈值更低）
  test.each([
    [393, 71, 344],
    [320, 53, 272],
    [300, 48, 252],
    [260, 38, 212],
    [252, 36, 204],
  ])('%ipx 视口：格 %ipx、棋盘 %ipx，放得下', (viewport, cell, board) => {
    const fitted = fitCellSize(4, viewport)
    expect(fitted).toBe(cell)
    expect(boardWidth(4, fitted)).toBe(board)
    expect(boardWidth(4, fitted)).toBeLessThanOrEqual(available(viewport))
  })

  test('320px：4×4 从未被地板夹过，与 5×5 的故障无关', () => {
    // 5×5 在 320px 上原来溢出 40px，4×4 在同一视口上一直是 53px 的格子——
    // 这条钉住「故障只属于 25 格」，免得日后的修复把 4×4 一起动坏
    expect(fitCellSize(4, 320)).toBeGreaterThan(BOARD_CELL_SIZE_MIN)
    expect(boardWidth(4, fitCellSize(4, 320))).toBeLessThanOrEqual(available(320))
  })
})

describe('fitCellSize：地板与不变式', () => {
  test('格子永不低于地板，也永不高于上限', () => {
    for (const size of [4, 5]) {
      for (let viewport = 120; viewport <= 1440; viewport += 1) {
        const cell = fitCellSize(size, viewport)
        expect(cell, `size ${size} @ ${viewport}`).toBeGreaterThanOrEqual(BOARD_CELL_SIZE_MIN)
        expect(cell, `size ${size} @ ${viewport}`).toBeLessThanOrEqual(BOARD_CELL_SIZE)
      }
    }
  })

  test('扫过每个视口：放不下时一定是地板在兜底，不会是算式算错', () => {
    // 算式保证：只要 fitted ≥ 地板，棋盘宽就一定 ≤ 可用空间（floor 让宽度只会更小）。
    // 所以「溢出」与「地板生效」必须是同一件事——任何让这两者脱钩的改动都会在这里炸，
    // 而不必等到有人打开窄窗口。
    for (const size of [4, 5]) {
      for (let viewport = 120; viewport <= 1440; viewport += 1) {
        const cell = fitCellSize(size, viewport)
        const overflowed = boardWidth(size, cell) > available(viewport)
        if (overflowed) {
          expect(cell, `size ${size} @ ${viewport} 溢出却不是地板在兜底`).toBe(
            BOARD_CELL_SIZE_MIN
          )
        }
      }
    }
  })

  test('25 格也排得进棋盘里：右下角正好贴边，不溢出一分', () => {
    // 5×5 的验收标准第一条就是「棋盘确为 25 Cell」。格子的偏移由 cellOffset 算，
    // 它是 transform 定位的唯一来源：这里少一分是留了条缝，多一分就是把最后一列
    // 挤出棋盘——而挤出棋盘在 4×4 上也一样会发生，不是 25 格专属。
    for (const size of [4, 5]) {
      for (const cell of [BOARD_CELL_SIZE_MIN, 44, BOARD_CELL_SIZE]) {
        const layout = createBoardLayout(size, cell)
        expect(layout.cellOffset(0, 0)).toEqual({ x: 0, y: 0 })
        const corner = layout.cellOffset(size - 1, size - 1)
        expect(corner.x + cell + BOARD_PADDING * 2, `size ${size} cell ${cell}`).toBe(
          layout.pixelSize
        )
        expect(corner.y + cell + BOARD_PADDING * 2, `size ${size} cell ${cell}`).toBe(
          layout.pixelSize
        )
      }
    }
  })
})
