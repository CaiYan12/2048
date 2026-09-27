import { describe, expect, test } from 'vitest'
import type { Direction } from '../../src/shared/types'
import { createGestureTracker } from '../../src/renderer/components/GestureTracker'
import { SWIPE_THRESHOLD } from '../../src/renderer/components/SwipeGesture'

/**
 * 手势状态机：一次「按下 → 松手」之间，浏览器调用 down / up / cancel / lost 的**顺序**。
 *
 * 为什么它值得单独一个文件：T10 真正的缺陷不在识别器（那是个纯函数，边界早就逐像素
 * 钉死了），而在顺序上——`up` 无条件清零再比对，于是被忽略的第二根手指松手时冒泡上来
 * 的 pointerup 会清掉第一根的起点，一次有意的划动产出零次 Move。顺序写错时肉眼看到
 * 的现象是「划了没反应」，与「阈值太大」一模一样，而 DOM 上的事件处理器没有任何单测
 * 驱动得了。抽成 GestureTracker 之后，这里把每种顺序逐帧重放一遍，包括浏览器不会按
 * 那个顺序给你的组合。
 *
 * 这一票改动之前，以上每一句话都无法被测：这就是它必须可测的全部理由。
 */

/** 一次够长的划动：比阈值多出一点，方向由坐标差决定 */
const FAR = SWIPE_THRESHOLD + 40

/** 把一次 up 的结果记下来：null 说明这一次没有 Move，不进列表 */
function record(moves: Direction[], direction: Direction | null): void {
  if (direction) moves.push(direction)
}

describe('多指：第二根手指松手不消费第一根的起点', () => {
  test('down(A) → down(B) 被忽略 → up(B) → up(A)：恰好一次 Move', () => {
    const gesture = createGestureTracker()
    const moves: Direction[] = []
    gesture.down(1, { x: 0, y: 0 })
    // 第二根手指按在棋盘别处：已有手势在进行，整体忽略
    gesture.down(2, { x: 500, y: 500 })
    // 这根手指先松手，它的 pointerup 照样冒泡到 .board 上——它不该动任何东西
    record(moves, gesture.up(2, { x: 560, y: 560 }))
    // 划动的那一根现在才松：起点必须还是按下那一刻的那个
    record(moves, gesture.up(1, { x: 0, y: FAR }))
    expect(moves).toEqual(['down'])
  })

  test('被忽略的手指可以随便松：长划、短划、原地点一下都不产出 Move', () => {
    const gesture = createGestureTracker()
    const moves: Direction[] = []
    gesture.down(1, { x: 0, y: 0 })
    gesture.down(2, { x: 500, y: 500 })
    record(moves, gesture.up(2, { x: 500, y: 500 }))
    record(moves, gesture.up(2, { x: 900, y: 900 }))
    expect(moves).toEqual([])
    // 而真正那一根从头到尾没被影响过
    record(moves, gesture.up(1, { x: 0, y: FAR }))
    expect(moves).toEqual(['down'])
  })
})

describe('down 报告接收与否：捕获判在守卫之后', () => {
  test('第一根接收（true），第二根被忽略（false）', () => {
    const gesture = createGestureTracker()
    // false 就是 Board 不调 setPointerCapture 的依据。反过来的顺序（先捕再问）会让
    // 这根手指也捕获到位，它的 pointerup / lostpointercapture 于是重定向到 .board 上
    expect(gesture.down(1, { x: 0, y: 0 })).toBe(true)
    expect(gesture.down(2, { x: 500, y: 500 })).toBe(false)
  })

  test('上一场收场之后又能接收：解楔、收尾、空手势都一样', () => {
    const gesture = createGestureTracker()
    gesture.down(1, { x: 0, y: 0 })
    expect(gesture.up(1, { x: FAR, y: 0 })).toBe('right')
    // 上一场已经收尾，起点该空了，下一根收得进来
    expect(gesture.down(2, { x: 0, y: 0 })).toBe(true)
    expect(gesture.up(2, { x: 0, y: FAR })).toBe('down')

    // 没送到的 pointerup 之后同理：起点被 lost 收走，下一根照样进得来
    gesture.down(1, { x: 0, y: 0 })
    gesture.lost(1)
    expect(gesture.down(2, { x: 0, y: 0 })).toBe(true)
    expect(gesture.up(2, { x: FAR, y: 0 })).toBe('right')
  })
})

describe('被忽略的第二根手指也会丢捕获：lost 按 pointerId 比对', () => {
  test('down(A) → down(B) 被忽略 → lost(B) → up(A)：仍然恰好一次 Move', () => {
    const gesture = createGestureTracker()
    const moves: Direction[] = []
    gesture.down(1, { x: 0, y: 0 })
    gesture.down(2, { x: 500, y: 500 })
    // 这一串在重排之前是隐形的：组件为 B 捕过（就算没有，触摸指针在按下目标上也有
    // 隐式捕获），B 松手时 lostpointercapture 照样重定向到 .board。旧的无条件 lost()
    // 在这里把 A 的起点擦掉，下面那次 up 什么都对不上——一次有意的划动产出零次 Move
    gesture.lost(2)
    record(moves, gesture.up(1, { x: 0, y: FAR }))
    expect(moves).toEqual(['down'])
  })

  test('漂出棋盘再松手的 B 也一样：起点还在，方向还算得出来', () => {
    const gesture = createGestureTracker()
    const moves: Direction[] = []
    gesture.down(1, { x: 0, y: 0 })
    gesture.down(2, { x: 500, y: 500 })
    // 捕获重定向的不只是棋盘内的释放：B 划到棋盘外再抬手，pointerup 与
    // lostpointercapture 都被送回 .board，擦起点的那一面比重排之前更大
    gesture.lost(2)
    gesture.cancel(2)
    record(moves, gesture.up(1, { x: FAR, y: 0 }))
    expect(moves).toEqual(['right'])
  })
})

describe('一次手势之后，下一根手指照样进得来', () => {
  test('down(A) → up(A) → down(A2) → up(A2)：第二次手势仍然有效', () => {
    const gesture = createGestureTracker()
    expect(gesture.up(1, { x: 0, y: FAR })).toBeNull() // 什么都没按过
    gesture.down(1, { x: 0, y: 0 })
    expect(gesture.up(1, { x: 0, y: FAR })).toBe('down')
    gesture.down(2, { x: 10, y: 10 })
    expect(gesture.up(2, { x: 10 + FAR, y: 10 })).toBe('right')
  })

  test('down(A) → 捕获被放掉 → down(A2) → up(A2)：没送到的 pointerup 不楔住后续手势', () => {
    const gesture = createGestureTracker()
    gesture.down(1, { x: 0, y: 0 })
    // 浏览器把这次 pointerup 吃掉了（指针被收走之类）。组件此刻唯一的补救就是
    // onLostPointerCapture；没有它，起点会永远留在里面，而 down 的「已有一根在手势里
    // 就忽略第二根」从此再也不放行任何新手势——整块棋盘永久失灵。
    // 递下去的是**这一根**的 pointerId：解楔靠的正是它自己的捕获释放，lost 的守卫
    // 因此照样放行。把守卫拆掉这条会红，楔子防护才算真的还在
    gesture.lost(1)
    gesture.down(2, { x: 0, y: 0 })
    expect(gesture.up(2, { x: FAR, y: 0 })).toBe('right')
  })

  test('够不到阈值的划动同样要把起点收走，下一根手指不受牵连', () => {
    const gesture = createGestureTracker()
    gesture.down(1, { x: 0, y: 0 })
    // 空操作手势：没有方向，但起点必须跟着这次收尾一起清掉
    expect(gesture.up(1, { x: SWIPE_THRESHOLD - 1, y: 0 })).toBeNull()
    gesture.down(1, { x: 0, y: 0 })
    expect(gesture.up(1, { x: FAR, y: 0 })).toBe('right')
  })
})

describe('取消只认自己那一次', () => {
  test('别人的取消不清这次手势的场', () => {
    // 与 up 同一个守卫形状：取消也是会冒泡到 .board 上的事件，第二根手指被浏览器
    // 取消时同样会走到这里
    const gesture = createGestureTracker()
    gesture.down(1, { x: 0, y: 0 })
    gesture.cancel(2)
    expect(gesture.up(1, { x: FAR, y: 0 })).toBe('right')
  })

  test('自己的取消作废手势：同一位移之后什么都不是', () => {
    const gesture = createGestureTracker()
    gesture.down(1, { x: 0, y: 0 })
    gesture.cancel(1)
    expect(gesture.up(1, { x: FAR, y: 0 })).toBeNull()
  })
})

describe('没有任何手势时，四个入口都是空操作', () => {
  test('空手势上松手、取消、丢捕获都不产出 Move 也不抛', () => {
    const gesture = createGestureTracker()
    expect(gesture.up(1, { x: FAR, y: 0 })).toBeNull()
    gesture.cancel(1)
    gesture.lost(1)
    gesture.down(1, { x: 0, y: 0 })
    expect(gesture.up(1, { x: 0, y: FAR })).toBe('down')
  })
})
