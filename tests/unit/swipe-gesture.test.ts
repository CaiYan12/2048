import { describe, expect, test } from 'vitest'
import type { Direction } from '../../src/shared/types'
import { SWIPE_THRESHOLD, swipeDirection, type Point } from '../../src/renderer/components/SwipeGesture'

/**
 * 滑动识别器是本票**全部**正确性的所在，所以边界一条不漏地钉在这里。
 *
 * 重点不是「能识别四个方向」（那在第一次手动试玩时就会露出来），而是三件只在边界上
 * 才分得开的事：
 *   1. 阈值是**含端点**的——正好 24px 划得动，23px 划不动。这两条只差一像素，
 *      却是两个不同结果；少一条，实现里把 `<` 写成 `<=` 就一路绿着过去。
 *   2. 斜划必须落在**某一个**方向上，且只落一个。
 *   3. 识别器无状态：同一划动问几次都是同一个答案。「一次划动只触发一次 Move」
 *      靠组件只在 pointerup 问一次来保证（见 Board.tsx），这里证明的是「问几次
 *      都不会问出第二个答案」。
 */

/** 起点固定在原点，终点直接给位移——位移就是手势本身 */
const byTravel = (dx: number, dy: number): Direction | null =>
  swipeDirection({ x: 0, y: 0 }, { x: dx, y: dy }, SWIPE_THRESHOLD)

describe('四方向：位移达到阈值即给出方向', () => {
  // 正好等于阈值。含端点的比较：差这一条，「24px 划不动」与「23px 划得动」
  // 两种实现都测得过。
  // 名字里打的是**两个**位移而不只是 dx：只打 dx 的话，down / up 两行会印成「正好
  // 0px 的位移算达到阈值」——在这个把测试名当文档看的仓库里，那看着就像写错了
  // （而它其实说的是「竖直方向正好走了 24px」）
  test.each([
    ['right', SWIPE_THRESHOLD, 0],
    ['left', -SWIPE_THRESHOLD, 0],
    ['down', 0, SWIPE_THRESHOLD],
    ['up', 0, -SWIPE_THRESHOLD],
  ])('%s：位移 (%i, %i) 正好达到阈值', (expected, dx, dy) => {
    expect(byTravel(dx, dy)).toBe(expected)
  })

  // 远远越过：一次普通的拇指轻扫，没有任何理由判不出来
  test.each([
    ['right', 120, 0],
    ['left', -120, 0],
    ['down', 0, 120],
    ['up', 0, -120],
  ])('%s：位移 (%i, %i) 越过阈值仍然给出同一个方向', (expected, dx, dy) => {
    expect(byTravel(dx, dy)).toBe(expected)
  })
})

describe('短滑：差一像素也一次都不触发', () => {
  // 负方向同样有左右之分，不能只测正的
  test.each([
    [SWIPE_THRESHOLD - 1, 0],
    [-(SWIPE_THRESHOLD - 1), 0],
    [0, SWIPE_THRESHOLD - 1],
    [0, -(SWIPE_THRESHOLD - 1)],
  ])('位移 (%i, %i)：差一像素，null', (dx, dy) => {
    expect(byTravel(dx, dy)).toBeNull()
  })

  test('阈值是参数，不是写死在实现里的一厘米', () => {
    // 同一段位移换个阈值就是另一个答案：实现若把 24 抄在函数体内，这一条立刻红
    expect(swipeDirection({ x: 0, y: 0 }, { x: 10, y: 0 }, SWIPE_THRESHOLD)).toBeNull()
    expect(swipeDirection({ x: 0, y: 0 }, { x: 10, y: 0 }, 10)).toBe('right')
    expect(swipeDirection({ x: 0, y: 0 }, { x: 10, y: 0 }, 11)).toBeNull()
  })
})

describe('原地轻点：没有任何位移就没有方向', () => {
  test('零位移 → null', () => {
    expect(byTravel(0, 0)).toBeNull()
  })

  test('阈值降到 0 也不该把一次点击读成「向右」', () => {
    // 识别器里的零位移挡格是为这条存在的：少了它，点击会落进水平分支变成移动
    expect(swipeDirection({ x: 0, y: 0 }, { x: 0, y: 0 }, 0)).toBeNull()
  })

  test('一两像素的抖动也不算划动', () => {
    expect(byTravel(1, 0)).toBeNull()
    expect(byTravel(0, -1)).toBeNull()
  })
})

describe('斜划按轴优势解决，且只落一个方向', () => {
  test('明显偏向一条轴：听那条轴的', () => {
    // 纵向占优，横向那点漂移不算横向移动
    expect(byTravel(100, -40)).toBe('right')
    expect(byTravel(-100, 40)).toBe('left')
    expect(byTravel(40, 100)).toBe('down')
    expect(byTravel(40, -100)).toBe('up')
  })

  test('近平局也必须有确定答案，不能两个方向都算', () => {
    // 差 1px 就分出了胜负：位移更长的那条轴说话
    expect(byTravel(40, 41)).toBe('down')
    expect(byTravel(41, 40)).toBe('right')
    expect(byTravel(-40, -41)).toBe('up')
    expect(byTravel(-41, -40)).toBe('left')
  })

  test('恰好 45°：取水平（平局约定，swipeDirection 的注释写着为什么是他）', () => {
    expect(byTravel(40, 40)).toBe('right')
    expect(byTravel(-40, 40)).toBe('left')
    expect(byTravel(40, -40)).toBe('right')
    expect(byTravel(-40, -40)).toBe('left')
  })

  test('斜划但两条轴都够长：仍然只有一个方向', () => {
    // 一次大斜划给出一个答案而不是两个——「两个方向都算」会让方块连着动两下
    expect(byTravel(90, 90)).toBe('right')
    expect(byTravel(-90, -90)).toBe('left')
  })

  test('斜划但主轴不够长：null', () => {
    // 两条轴都没到阈值，谁也不欠谁一次移动
    expect(byTravel(20, 20)).toBeNull()
    expect(byTravel(-20, -20)).toBeNull()
  })
})

describe('识别器是无状态的纯函数', () => {
  test('同一段手势问几次都是同一个答案', () => {
    // 「一次划动只问一次」由组件保证，这里保证「问几次也不会问出第二个答案」：
    // 有状态的实现（例如每问一次往累计值上加位移）会在这一条露出来
    const start: Point = { x: 0, y: 0 }
    const end: Point = { x: 60, y: 0 }
    expect(swipeDirection(start, end, SWIPE_THRESHOLD)).toBe('right')
    expect(swipeDirection(start, end, SWIPE_THRESHOLD)).toBe('right')
    expect(swipeDirection(start, end, SWIPE_THRESHOLD)).toBe('right')
  })

  test('不改写入参：起点与终点都是只读的', () => {
    // 纯函数若往参数上写东西，调用方的起点就被这一次手势污染了，下一根手指
    // 从上一次的终点起手。冻结入参，写它就是 TypeError
    const start = Object.freeze({ x: 0, y: 0 })
    const end = Object.freeze({ x: 40, y: 0 })
    expect(swipeDirection(start, end, SWIPE_THRESHOLD)).toBe('right')
    expect(start).toEqual({ x: 0, y: 0 })
    expect(end).toEqual({ x: 40, y: 0 })
  })

  test('逐帧看过去：只有越过阈值的那一帧才说得出口', () => {
    // 模拟一次划动被拆成中间帧逐帧问（组件不这么做，这里只是把「中间帧各自
    // 只按自己的行程说话」钉住）：20px 与 10px 的中间帧永远是 null，越过 24px
    // 才第一次说出方向
    const start: Point = { x: 0, y: 0 }
    const spoken: (Direction | null)[] = []
    for (let dx = 0; dx <= 100; dx += 10) {
      spoken.push(swipeDirection(start, { x: dx, y: 0 }, SWIPE_THRESHOLD))
    }
    expect(spoken).toEqual([null, null, null, 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right'])
  })
})
