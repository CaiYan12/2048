import type { Direction } from '../../shared/types'

/**
 * 滑动阈值（px）：位移**达到**它才算一次有意划动，差一分就什么都不是。
 *
 * 为什么是 24：它要同时躲开两种误判——
 *   · 太小：一次本想点空格、手指却带着挪动的轻点会被当成划动（点按漂移通常在 10px
 *     以内），玩家看到的是「只是点了一下棋盘，方块却动了」；
 *   · 太大：一次短促但明确的拨动被吞掉，游戏显得迟钝。
 * 24 落在两者之间（约为点按漂移上限的两倍半），而在最窄的设备上（320px 视口下
 * 5×5 的 252px 棋盘）还不到棋盘宽度的十分之一，短促拨动照样过得去。手机拇指的
 * 接触面约 40～50px 宽，24 大致是它的半边——一次有意的轻扫立刻越过它。
 *
 * 比较是**含端点**的：位移正好等于阈值即算达到（swipeDirection 里写的是 `< threshold`）。
 */
export const SWIPE_THRESHOLD = 24

/** 手势的一端：视口坐标（px）。纯数值结构，所以识别器不碰任何 DOM 类型 */
export interface Point {
  x: number
  y: number
}

/**
 * 起点 + 终点 + 阈值 → 方向；达不到阈值（或原地轻点）返回 null。
 *
 * 它是**纯函数**：只吃三个数、只吐一个方向，不看任何 DOM、不读任何时钟。于是边界
 * 行为（正好等于阈值、差一像素、斜划怎么判）能在 tests/unit/ 里逐条驱动，不必借
 * 一个浏览器——而这块逻辑的正确性恰恰是触屏输入的全部，所以它必须可测。
 *
 * 「一次划动只触发一次 Move」这句由调用方保证，不在这里：识别器每一次被问都只按
 * 眼前的起终点回答（无状态），所以同一划动问几次都是同一个答案；把「问几次」
 * 收敛成「问一次」是组件的责任，见 Board.tsx 的 pointerup。
 */
export function swipeDirection(start: Point, end: Point, threshold: number): Direction | null {
  const dx = end.x - start.x
  const dy = end.y - start.y

  // 原地轻点：没有任何位移就没有方向。哪怕阈值是 0 也要挡在这里，否则一次点击
  // 会固定落进下面的水平分支、变成「向右移动」——点一下棋盘，方块动了
  if (dx === 0 && dy === 0) return null

  // 轴优势：谁走得远听谁的。斜划也要给一个确定性答案，而不是「两个方向都算」或
  // 「都不算」——玩家斜着一扫，最贴近他意图的那一个方向才是正确答案。
  //
  // 两条轴恰好相等时取水平（这里写 >=）：竖划多数是从屏幕下方起手往上推，dy 明显
  // 大于 dx，很少落进平局；横划起手就在棋盘上、手腕一沉就带出斜度，所以平局更
  // 可能是想横着拨。这不是「水平更常用」的含糊话，而是两种斜划的来路不同。
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (Math.abs(dx) < threshold) return null
    return dx > 0 ? 'right' : 'left'
  }
  if (Math.abs(dy) < threshold) return null
  return dy > 0 ? 'down' : 'up'
}
