import { describe, expect, test } from 'vitest'
import { nextHighlight } from '../../src/renderer/components/ListboxHighlight'

/**
 * T42 风格列表的**高亮移动器**（父规格 docs/specs/style-picker.md 的测试决策）。
 *
 * 这个文件里没有 React、没有浏览器：`nextHighlight` 是纯函数，「从当前 index 与一个
 * 导航键算出下一个 index」的全部判断都在它里面，所以能在这里逐条驱动。焦点真的落没落上、
 * 循环在实际的 option 之间走不走，归 tests/e2e/settings-style-row.spec.ts。
 *
 * 边界说清楚，免得读的人以为它证了更多：
 *   · **不证焦点**。DOM 焦点的落点与 `:focus` 高亮是浏览器契约，在 e2e 里量。
 *   · **不证键的归属**（列表展开时这四个键归列表、组件自己 preventDefault）——
 *     那是 App 的 keydown 分发点与组件 onKeyDown 的接线，e2e 钉。
 */

describe('ArrowUp / ArrowDown：移动一格，循环', () => {
  test('ArrowDown 从中间往下一格', () => {
    expect(nextHighlight(1, 'ArrowDown', 3)).toBe(2)
  })

  test('ArrowDown 从最后一格循环回第一格', () => {
    expect(nextHighlight(2, 'ArrowDown', 3)).toBe(0)
  })

  test('ArrowUp 从中间往上一格', () => {
    expect(nextHighlight(1, 'ArrowUp', 3)).toBe(0)
  })

  test('ArrowUp 从第一格循环回最后一格', () => {
    expect(nextHighlight(0, 'ArrowUp', 3)).toBe(2)
  })

  test('只有一个选项时原地不动（循环是同一位）', () => {
    expect(nextHighlight(0, 'ArrowDown', 1)).toBe(0)
    expect(nextHighlight(0, 'ArrowUp', 1)).toBe(0)
  })
})

describe('Home / End：跳两头（不循环）', () => {
  test('Home 从任何位置都到第一格', () => {
    expect(nextHighlight(0, 'Home', 3)).toBe(0)
    expect(nextHighlight(1, 'Home', 3)).toBe(0)
    expect(nextHighlight(2, 'Home', 3)).toBe(0)
  })

  test('End 从任何位置都到最后一格', () => {
    expect(nextHighlight(0, 'End', 3)).toBe(2)
    expect(nextHighlight(1, 'End', 3)).toBe(2)
    expect(nextHighlight(2, 'End', 3)).toBe(2)
  })
})

describe('越界的 current 收进范围内再算（函数是全的，不靠调用方先夹）', () => {
  test('current 越过末尾时按末尾算', () => {
    expect(nextHighlight(5, 'ArrowDown', 3)).toBe(0)
    expect(nextHighlight(5, 'End', 3)).toBe(2)
  })

  test('current 为负时按头算', () => {
    expect(nextHighlight(-1, 'ArrowUp', 3)).toBe(2)
    expect(nextHighlight(-1, 'Home', 3)).toBe(0)
  })

  test('空列表原样返回（注册表为空不是它会遇到的输入，但不炸）', () => {
    expect(nextHighlight(0, 'ArrowDown', 0)).toBe(0)
  })
})
