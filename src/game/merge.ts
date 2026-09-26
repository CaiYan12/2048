import type { MergeFamily } from '../shared/modes'

/**
 * 按合并家族分派的合并表
 *
 * 一次查找，不是 if-else：引擎只问「这两个数按当前家族合成什么」，不关心是哪个模式。
 * 所以加斐波那契只是往表里填一行，引擎零改动。
 *
 * 注意操作数顺序：一律按 **lane 的自然序**（左块, 右块）传入，与移动方向无关。
 * mode-contract §2 的 `[1,2,3]` 向右必须合出 `2+3→5`：若按「离目标边近的那个在前」
 * 传参就会拿到 `(3,2)`，而斐波那契表是单向的，(3,2) 配不上就漏合并、错计分。
 * Classic 等值合并不受顺序影响，但表的形状要为 T05 现在就定对。
 */
export const MERGE: Record<MergeFamily, (a: number, b: number) => number | null> = {
  // 幂：等值才合
  'powers-of-two': (a, b) => (a === b ? a + b : null),
  // 斐波那契：相邻数列项可合，含 1+1→2（T05 落表，取自 mode-contract.json 的 mergeTable）
  fibonacci: () => null,
}
