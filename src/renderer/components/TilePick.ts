import type { Point } from './SwipeGesture'

/**
 * 点选半径（px）：按下到松手之间位移小于它，才算「点中」而不是「划动」（T12 的
 * 交换拾取）。
 *
 * **为什么这是独立的一份判据、不复用 GestureTracker 的「没有方向」**：那个 tracker
 * 回答的是「这是一次划动吗」（T10），tap 问的是「这一下没挪地方吗」。两问的答案并不
 * 总是一致——被忽略的第二根手指、慢速小位移、以及指针根本没被 down 接收的几种组合，
 * 都会让 tracker 的 up 返回 null 而那一根确实划过一段路。混成一个入口，等于让 tap
 * 路径绕开 T10 为「第二根手指不许抹掉起点」加的那道守卫；而那段守卫是 T10 用一轮
 * 返工换来的，不能再被绕一次。
 *
 * 阈值与 SWIPE_THRESHOLD（24px）的关系：划动阈值之上手势赢，之下一律算点选，
 * 中间没有「既划动又点中」的灰区。12px 略高于 SwipeGesture 记的点按漂移上限（10px），
 * 鼠标单击的位移通常是 0。
 */
export const PICK_RADIUS = 12

/** 位移是否小到算一次点选。比**位移**而不是比坐标相等：指针几乎不会回到同一个浮点坐标 */
export function withinPickRadius(start: Point, end: Point): boolean {
  const dx = end.x - start.x
  const dy = end.y - start.y
  return dx * dx + dy * dy <= PICK_RADIUS * PICK_RADIUS
}
