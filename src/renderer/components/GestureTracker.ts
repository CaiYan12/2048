import type { Direction } from '../../shared/types'
import { SWIPE_THRESHOLD, swipeDirection, type Point } from './SwipeGesture'

/** 一次手势进行中的中间状态：起点，以及这个起点属于哪个指针 */
interface ActiveGesture {
  pointerId: number
  point: Point
}

/**
 * 手势状态机的四个入口。
 *
 * 只有 `up` 有可能给出方向，其余三个都是「这次手势怎么收场」——它们必须能在
 * tests/unit 里逐帧驱动，原因见 `createGestureTracker` 的注释：缺陷出在**调用顺序**
 * 上，而顺序只有浏览器能给。
 */
export interface GestureTracker {
  /** 按下。已有一根手指在手势里就整体忽略：第二根起点不该覆写第一根的 */
  down(pointerId: number, point: Point): void
  /** 松手。起点属于这个指针才判一次方向；否则什么都不做，也不清掉别人的起点 */
  up(pointerId: number, point: Point): Direction | null
  /** 取消。同样只认自己的那一次 */
  cancel(pointerId: number): void
  /** 丢捕获：手势作废。它不在 `up` 的守卫里，所以必须单独一个入口 */
  lost(): void
}

/**
 * 一次「按下 → 松手」之间发生的事，全部收在这一个纯模块里。
 *
 * 为什么它必须独立于组件：这一票真正的缺陷不在识别器（那是个纯函数，边界早就逐像素
 * 钉死了），而在**处理器被浏览器调用的顺序**上。`onPointerUp` 里「先清零再比对」
 * 会把第二根手指松手时冒泡上来的事件当成第一根手指的收尾——起点被清空，第一根手指
 * 随后松手时什么都对不上，一次有意的划动产出零次 Move，玩家看到的是「划了没反应」。
 * 顺序写错时，肉眼现象与「阈值太大」一模一样，而 DOM 上的 onPointerDown /
 * onPointerUp 没有任何单测能驱动。抽成这只返回四个函数的工厂之后，那串顺序（包括
 * 浏览器不会按那个顺序给你的组合）能在 tests/unit 里逐帧重放。
 *
 * DOM 一个都没搬走：`setPointerCapture`、事件对象、`onMove` 都还在 Board.tsx。
 */
export function createGestureTracker(): GestureTracker {
  let active: ActiveGesture | null = null

  return {
    down(pointerId, point) {
      // 已经有一根手指在手势里就忽略第二根：两个起点互相覆写，最后算出来的是
      // 第三根手指的轨迹
      if (active) return
      active = { pointerId, point }
    },
    up(pointerId, point) {
      const current = active
      // 先比对、后清零。反过来写（无条件清零再比对）就把第二根手指松手时冒泡上来的
      // pointerup 当成第一根的收尾，一次有意的划动产出零次 Move。原先那句「这里是被
      // 忽略的第二根手指松手时走这里」的注释，说的正是会把事情弄坏的那一种情况
      if (!current || current.pointerId !== pointerId) return null
      active = null
      return swipeDirection(current.point, point, SWIPE_THRESHOLD)
    },
    cancel(pointerId) {
      // 同一个守卫形状：不是这次手势的取消不清别人的场
      if (!active || active.pointerId !== pointerId) return
      active = null
    },
    lost() {
      // 无条件作废。捕获只在**一根**手指上做过，所以 lostpointercapture 只会为它触发，
      // 被忽略的第二根手指从未捕获过，不会走到这里。少了这个入口会楔住：一次没送到
      // 的 pointerup 会把起点永远留在里面，而 down 的「已有一根在手势里就忽略第二根」
      // 从此再也不放行任何新手势
      active = null
    },
  }
}
