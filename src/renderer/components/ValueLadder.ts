import type { ModeDefinition } from '../../shared/modes'

/**
 * 方块的价值阶梯与色档映射（纯函数，零 DOM）
 *
 * **为什么需要它**：方块底色原先按 `data-value` 分档，board.css 里 11 个属性选择器只覆盖
 * 2 的幂到 2048。斐波那契模式的 17 个值（1…2584）一个都匹配不上，整块棋盘全掉进
 * `--tile-beyond`——进度在颜色上完全看不见。而每一套风格真正要表达的是「在这个模式自己的
 * 目标之前走了多远」，不是「这一格写着哪个数字」。
 *
 * 阶梯只从模式**已经声明的**数据推出来（`spawnValues` + `target` + `mergeFamily`），
 * 不给 `ModeDefinition` 加字段：加一个字段等于让六份模式声明各自再维护一份真相，
 * 而两份真相必然会不一致（mode-contract §1 冻结的正是那一份）。
 *
 * 阶梯为什么能推：`spawnValues` 给出最低两档，之后每一档都是「把当前最高值和它的搭档合起来」
 * ——2 的幂家族里最高值的搭档是它自己（2+2→4），斐波那契家族里是它前一项（1+2→3）。
 * 这正是两个家族合并表的下一步，所以阶梯顶端必然落在 `target` 上。
 */

/** 每套主题必须声明的色档数。board.css 只写这许多条 [data-bucket] 规则 */
export const TILE_SLOT_COUNT = 11

/** 超出本模式目标值的方块落在这里（board.css 的兜底档，对应 --tile-beyond） */
export const BEYOND_SLOT = TILE_SLOT_COUNT + 1

/**
 * 一个模式的有序价值阶梯：从最低生成值到 target，含两端。
 *
 * 经典 [2,4,…,2048] 11 级；斐波那契 [1,2,3,5,…,2584] 17 级；大棋盘 [2,…,4096] 12 级。
 */
export function valueLadder(mode: ModeDefinition): readonly number[] {
  const [low, high] = mode.spawnValues
  const ladder: number[] = [low]
  if (high !== low) ladder.push(high)

  // 每一步都严格变大（搭档至少是 1），所以这个循环必然穿过 target 后停下，不需要额外兜底
  while (ladder[ladder.length - 1] < mode.target) {
    const top = ladder[ladder.length - 1]
    const partner = mode.mergeFamily === 'fibonacci' ? ladder[ladder.length - 2] : top
    ladder.push(top + partner)
  }
  return ladder
}

/**
 * 数值在阶梯里的位置，1-based。阶梯外的值（超过本模式目标）记作「末位之后一位」，
 * 于是它会折成 beyond 档——这正是「超出目标」该有的样子。
 */
export function tileRank(ladder: readonly number[], value: number): number {
  const index = ladder.indexOf(value)
  return index === -1 ? ladder.length + 1 : index + 1
}

/**
 * 秩 → 色档：按相对进度折算，`ceil(rank / totalRanks × 11)`。
 *
 * 乘法写在除法前面、且都是整数：`rank * TILE_SLOT_COUNT` 在 IEEE 754 下是精确整数，
 * 直接除会先落进浮点近似（rank/totalRanks 不可精确表示），ceil 就可能被推到相邻的档上。
 *
 * 超过 11 的一律夹到 beyond 档，不让它变成一个没有 CSS 规则对应的空号。
 */
export function tileSlot(rank: number, totalRanks: number): number {
  const slot = Math.ceil((rank * TILE_SLOT_COUNT) / totalRanks)
  return Math.min(slot, BEYOND_SLOT)
}
