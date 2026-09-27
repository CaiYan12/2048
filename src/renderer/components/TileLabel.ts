/**
 * 数值 → 可读标签
 *
 * T05 落位时核对过：斐波那契的目标块 2584 是四位数，`tileDigits` 给出 4，
 * board.css 的 data-digits='4' 档（0.27 倍格边长）就是为它准备的——所以这里不需要
 * 为长数值加任何特例，`String(value)` 照旧。
 *
 * 模块单独存在的理由在 planned structure 里写着：**真**需要压缩显示时在这里做，
 * 而不是伸手去改组件。真要动手的阈值在七位数以上（1346269 起，2584 之后还得再合十几次）。
 */

export function tileLabel(value: number): string {
  return String(value)
}

/** 数值的位数，棋盘层按它选字号档位 */
export function tileDigits(value: number): number {
  return tileLabel(value).length
}
