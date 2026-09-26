/**
 * 数值 → 可读标签
 *
 * Classic 就是 `String(value)`；模块单独存在的理由在 planned structure 里写着——
 * T05 的斐波那契长数值（2584、4181）要有地方做格式化，而不是伸手去改组件。
 */

export function tileLabel(value: number): string {
  return String(value)
}

/** 数值的位数，棋盘层按它选字号档位 */
export function tileDigits(value: number): number {
  return tileLabel(value).length
}
