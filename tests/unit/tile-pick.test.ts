import { describe, expect, test } from 'vitest'
import {
  PICK_RADIUS,
  withinPickRadius,
} from '../../src/renderer/components/TilePick'
import { SWIPE_THRESHOLD } from '../../src/renderer/components/SwipeGesture'

/**
 * 点选判定的边界（T12 交换拾取）。
 *
 * 它必须与滑动识别器**分开钉**，因为两者回答的不是同一个问题（理由见 TilePick.ts
 * 的说明）：这里钉的是「这一下算点中吗」，那里钉的是「这是一次划动吗」。三条边界：
 *
 *   1. 半径是**含端点**的——位移正好 12px 算点中，13px 不算；
 *   2. 半径是**欧氏**的——12px 的斜向位移也是 12px，不会被拆成 x/y 各 12；
 *   3. 与划动阈值之间**没有灰区**：12 以下一律点选，24 以上一律划动，
 *      中间那段（12 < d ≤ 24）两个判定都为假，于是既不会移动也不会选中——
 *      这正是「一次误触不该同时推棋盘又换方块」的保证。
 */

/** 起点固定在原点，终点直接给位移——位移就是这一下 */
const byTravel = (dx: number, dy: number): boolean =>
  withinPickRadius({ x: 0, y: 0 }, { x: dx, y: dy })

describe('withinPickRadius', () => {
  test('原地轻点（位移 0）算点中', () => {
    expect(byTravel(0, 0)).toBe(true)
  })

  test.each([
    [PICK_RADIUS, 0],
    [0, PICK_RADIUS],
    [-PICK_RADIUS, 0],
    [0, -PICK_RADIUS],
    // 斜向也算：(8,8) 的欧氏距离约 11.3，在半径内
    [8, 8],
  ])('位移 (%i, %i) 在半径内算点中', (dx, dy) => {
    expect(byTravel(dx, dy)).toBe(true)
  })

  test('位移正好等于半径算点中（含端点）', () => {
    // 差这一条，把 <= 写成 < 的实现会一路绿着过去
    expect(byTravel(PICK_RADIUS, 0)).toBe(true)
    expect(byTravel(0, PICK_RADIUS)).toBe(true)
  })

  test('超出半径一格就不算点中', () => {
    expect(byTravel(PICK_RADIUS + 1, 0)).toBe(false)
    expect(byTravel(0, PICK_RADIUS + 1)).toBe(false)
    expect(byTravel(-PICK_RADIUS - 1, 0)).toBe(false)
  })

  test('欧氏距离：横向 12 与斜向 12 的判定不同', () => {
    // 拆成 x/y 各自比半径的实现会把斜向 12/12（欧氏约 16.97）也判成点中
    expect(byTravel(12, 12)).toBe(false)
    // (8,8)：欧氏约 11.3，在半径内
    expect(byTravel(8, 8)).toBe(true)
  })

  test('半径小于划动阈值：中间那段两个判定都为假', () => {
    // 误触不许「又移动又选中」。d 落在 (12, 24] 时：不是点选，
    // 也达不到 SWIPE_THRESHOLD（24），于是 swapDirection 同样给不出方向
    expect(PICK_RADIUS).toBeLessThan(SWIPE_THRESHOLD)
    for (const d of [13, 16, 20, SWIPE_THRESHOLD]) {
      expect(byTravel(d, 0), `${d}px`).toBe(false)
    }
  })
})
