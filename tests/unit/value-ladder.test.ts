import { describe, expect, test } from 'vitest'
import { MODES, getMode } from '../../src/shared/modes'
import {
  BEYOND_SLOT,
  TILE_SLOT_COUNT,
  tileRank,
  tileSlot,
  valueLadder,
} from '../../src/renderer/components/ValueLadder'

/**
 * T13 的配色阶梯：从模式声明推出价值阶梯，再按相对进度折成主题的 11 个色档。
 *
 * 这组测试是「Classic 必须逐字节不变」那道闸门的一半（另一半在 tests/e2e/style-switch.spec.ts
 * 里读真实计算样式）。每一行的期望值都是手推的：阶梯由 spawnValues + target + mergeFamily
 * 推出，桶位是 ceil(rank / totalRanks × 11)，没有一个数是跑实现抄回来的。
 */

/** 经典家族（2 的幂）的 11 级阶梯 */
const POWERS: readonly number[] = [
  2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048,
]

/** 斐波那契家族的 17 级阶梯：1, 2, 之后每一项 = 前两项之和 */
const FIBONACCI: readonly number[] = [
  1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597, 2584,
]

describe('valueLadder：从模式已声明的数据推出阶梯', () => {
  test('classic：11 级，顶端正好是目标值 2048', () => {
    expect(valueLadder(getMode('classic'))).toEqual(POWERS)
  })

  test('fibonacci：17 级，顶端正好是目标值 2584', () => {
    expect(valueLadder(getMode('fibonacci'))).toEqual(FIBONACCI)
  })

  test('big-board：12 级，含 4096（它自己的目标值）', () => {
    expect(valueLadder(getMode('big-board'))).toEqual([
      2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096,
    ])
  })

  test('walls / daily / time-attack 与 classic 同一条阶梯', () => {
    for (const id of ['walls', 'daily', 'time-attack'] as const) {
      expect(valueLadder(getMode(id)), id).toEqual(POWERS)
    }
  })

  test('阶梯顶端恒等于该模式的 target——所以它没有第二个真相来源', () => {
    for (const mode of MODES) {
      const ladder = valueLadder(mode)
      expect(ladder[ladder.length - 1], mode.id).toBe(mode.target)
    }
  });

  test('阶梯的下一步就是该家族的合并表下一步（不含写死的数字）', () => {
    // 幂家族：最高值的搭档是它自己（2+2→4）；斐波那契：搭档是前一项（1+2→3）。
    // 这条钉的是推导规则的形状，不是某一模式的某一串数——换目标值也该照这个形状推。
    const powers = valueLadder(getMode('classic'))
    for (let i = 2; i < powers.length; i += 1) {
      expect(powers[i]).toBe(powers[i - 1] * 2)
    }
    const fib = valueLadder(getMode('fibonacci'))
    for (let i = 2; i < fib.length; i += 1) {
      expect(fib[i]).toBe(fib[i - 1] + fib[i - 2])
    }
  })

  test('ModeDefinition 没有为阶梯加字段：推导只读已有的声明', () => {
    // 加一个 ladder 字段等于让六份模式声明各自维护第二份真相，而两份真相必然不一致。
    // 这里冻结字段清单，谁加了就在此炸掉。
    expect(Object.keys(getMode('classic')).sort()).toEqual(
      [
        'id',
        'label',
        'size',
        'mergeFamily',
        'spawnValues',
        'target',
        'walls',
        'timeLimitSeconds',
      ].sort()
    )
  })
})

describe('tileRank：数值在阶梯里的 1-based 位置', () => {
  test('阶梯内的值按下标取位（1-based）', () => {
    const classic = valueLadder(getMode('classic'))
    expect(tileRank(classic, 2)).toBe(1)
    expect(tileRank(classic, 4)).toBe(2)
    expect(tileRank(classic, 1024)).toBe(10)
    expect(tileRank(classic, 2048)).toBe(11)
  })

  test('阶梯外的值（超过目标）记作「末位之后一位」，于是它折成 beyond 档', () => {
    const classic = valueLadder(getMode('classic'))
    // 经典模式继续玩到 4096：不在 11 级阶梯里，但必须有个确定的位次
    expect(tileRank(classic, 4096)).toBe(12)
    expect(tileSlot(tileRank(classic, 4096), classic.length)).toBe(BEYOND_SLOT)
  })

  test('斐波那契低段不是 2 的幂，也各有确定的位次', () => {
    const fib = valueLadder(getMode('fibonacci'))
    expect(tileRank(fib, 1)).toBe(1)
    expect(tileRank(fib, 3)).toBe(3)
    expect(tileRank(fib, 5)).toBe(4)
  })
})

describe('tileSlot：按相对进度折成 11 个色档', () => {
  test('各模式声明的色档数就是 board.css 写的规则数', () => {
    expect(TILE_SLOT_COUNT).toBe(11)
    expect(BEYOND_SLOT).toBe(TILE_SLOT_COUNT + 1)
  })

  test('Classic：桶位与秩恒等——这正是「逐字节不变」', () => {
    // 11 级阶梯 × 11 档：rank / 11 × 11 = rank，ceil 不改变任何一档。
    // 于是重构前按 [data-value='N'] 取到的色档，与重构后按 data-bucket 取到的完全一致，
    // 每个数值都不串味、不跳档。
    const classic = valueLadder(getMode('classic'))
    expect(classic).toHaveLength(TILE_SLOT_COUNT)
    classic.forEach((value, index) => {
      const rank = tileRank(classic, value)
      expect(tileSlot(rank, classic.length), `value ${value}`).toBe(index + 1)
    })
  })

  test('Classic：整张「数值 → 色档」表逐行钉住', () => {
    // 重构前 board.css 的 11 个 [data-value] 选择器就是这一张表的顺序；
    // 现在它由 data-bucket 承担，表本身一个格子都不许动
    const classic = valueLadder(getMode('classic'))
    const table = classic.map((value) => [value, tileSlot(tileRank(classic, value), classic.length)])
    expect(table).toEqual([
      [2, 1],
      [4, 2],
      [8, 3],
      [16, 4],
      [32, 5],
      [64, 6],
      [128, 7],
      [256, 8],
      [512, 9],
      [1024, 10],
      [2048, 11],
    ])
  })

  test('Fibonacci：2584 落在顶档，而不是 beyond', () => {
    // 这是本 ticket 修的核心：按数值取档时，17 个值一个都匹配不上那 11 个选择器，
    // 整块棋盘掉进 --tile-beyond，进度在颜色上完全看不见
    const fib = valueLadder(getMode('fibonacci'))
    expect(fib).toHaveLength(17)
    expect(tileSlot(tileRank(fib, 2584), fib.length)).toBe(TILE_SLOT_COUNT)
  })

  test('Fibonacci：17 级压到 11 档，逐档映射如预期', () => {
    const fib = valueLadder(getMode('fibonacci'))
    const table = fib.map(
      (value) => [value, tileSlot(tileRank(fib, value), fib.length)] as const
    )
    expect(table).toEqual([
      [1, 1],
      [2, 2],
      [3, 2],
      [5, 3],
      [8, 4],
      [13, 4],
      [21, 5],
      [34, 6],
      [55, 6],
      [89, 7],
      [144, 8],
      [233, 8],
      [377, 9],
      [610, 10],
      [987, 10],
      [1597, 11],
      [2584, 11],
    ])
  })

  test('Big Board：4096 是它自己的目标值，落顶档而非 beyond', () => {
    const big = valueLadder(getMode('big-board'))
    expect(tileSlot(tileRank(big, 2048), big.length)).toBe(TILE_SLOT_COUNT)
    expect(tileSlot(tileRank(big, 4096), big.length)).toBe(TILE_SLOT_COUNT)
    // 再往上才归 beyond：beyond 的语义从此是「超出本模式目标」，不是「4096 起」
    expect(tileSlot(tileRank(big, 8192), big.length)).toBe(BEYOND_SLOT)
  })

  test('桶位永远落在 1..12：不会出现没有 CSS 规则对应的空号', () => {
    for (const mode of MODES) {
      const ladder = valueLadder(mode)
      for (const value of [...ladder, ladder[ladder.length - 1] * 2]) {
        const slot = tileSlot(tileRank(ladder, value), ladder.length)
        expect(slot, `${mode.id} ${value}`).toBeGreaterThanOrEqual(1)
        expect(slot, `${mode.id} ${value}`).toBeLessThanOrEqual(BEYOND_SLOT)
      }
    }
  })

  test('最低一档永远是第 1 档，最高一档永远够得着顶档', () => {
    for (const mode of MODES) {
      const ladder = valueLadder(mode)
      // 1：ceil 不可能给出 0（算式写成「先乘后除」，rank × 11 是精确整数）
      expect(tileSlot(1, ladder.length), mode.id).toBe(1)
      // target：ceil(11 × total / total) = 11
      expect(tileSlot(ladder.length, ladder.length), mode.id).toBe(TILE_SLOT_COUNT)
    }
  })

  test('算式写成「先乘后除」是防御性的：真实数据上两种写法不打架', () => {
    // rank / totalRanks 这一侧在 IEEE 754 里不可精确表示，先除再 ceil 理论上可能差一；
    // 实测 2..60 级这个区间里两种写法完全一致，所以这条钉的是**形状**而不是某一处奇迹——
    // 将来加更长的阶梯（比如 64 级）时，先乘后除那一侧不会先坏
    const fib = valueLadder(getMode('fibonacci'))
    const naive = (rank: number, total: number): number =>
      Math.min(Math.ceil(rank / total * TILE_SLOT_COUNT), BEYOND_SLOT)
    expect(fib.map((_, index) => tileSlot(index + 1, fib.length))).toEqual(
      fib.map((_, index) => naive(index + 1, fib.length))
    )
  })
})
