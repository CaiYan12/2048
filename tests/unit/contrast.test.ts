import { describe, expect, test } from 'vitest'
import classic from '../../src/renderer/styles/themes/classic/contrast.json'
import material from '../../src/renderer/styles/themes/material/contrast.json'

/**
 * 对比度声明自校验：每一套风格的 contrast.json 里，每一对都要
 *   1) 实测比值 ≥ 声明的 minimum；
 *   2) 声明的 ratio 与这里按 WCAG 2.x 公式算出来的一致（±0.02，容的是两位小数的四舍五入）。
 *
 * 为什么值得在单测里做一遍：T14 的 check-contrast 会从**渲染后的 CSS** 重新取色再算，
 * 而这张表是人写的。若某个色值改了、表没跟上，这里先炸——比等 T14 的脚本发现得早，
 * 也比「表上写着 8.88 但实际 7.22」这种漂移更难查。
 *
 * 公式就是 WCAG 2.x 的相对亮度：sRGB 通道先线性化，再按 0.2126 / 0.7152 / 0.0722 加权。
 */

interface DeclaredPair {
  usage: string
  foreground: string
  background: string
  minimum: number
  ratio: number
}

/** sRGB 0..255 → 线性光 0..1 */
function linearChannel(byte: number): number {
  const channel = byte / 255
  return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)
}

/** '#rrggbb' → WCAG 相对亮度 */
function relativeLuminance(hex: string): number {
  const digits = hex.replace('#', '')
  expect(digits, hex).toMatch(/^[0-9a-f]{6}$/)
  const r = linearChannel(parseInt(digits.slice(0, 2), 16))
  const g = linearChannel(parseInt(digits.slice(2, 4), 16))
  const b = linearChannel(parseInt(digits.slice(4, 6), 16))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG 对比度：(亮的 + 0.05) / (暗的 + 0.05) */
function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground)
  const b = relativeLuminance(background)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

function checkStyle(styleId: string, pairs: readonly DeclaredPair[]): void {
  test(`${styleId}：每一对都达到声明的 minimum，且 ratio 与实测一致`, () => {
    expect(pairs.length).toBeGreaterThan(0)
    for (const pair of pairs) {
      const measured = contrastRatio(pair.foreground, pair.background)
      expect(measured, `${styleId} · ${pair.usage}`).toBeGreaterThanOrEqual(pair.minimum)
      // 表上的数是四舍五入到两位小数的实测值，不是拍出来的目标值
      expect(Math.abs(measured - pair.ratio), `${styleId} · ${pair.usage}`).toBeLessThan(0.02)
    }
  })
}

describe('contrast.json：声明与实测一致', () => {
  checkStyle(classic.styleId, classic.pairs)
  checkStyle(material.styleId, material.pairs)
})

describe('Material 的对比度表：T13 带来的两处新账', () => {
  test('选中方块那一环 vs 空格底在表内（T14 的交接条目）', () => {
    // Classic 的表只有焦点环 vs **页面色**，没有「选中环 vs --cell-bg」这一对——
    // 而 board.css 的 [data-selected='true'] 在每一套风格上都存在，环落在空格上。
    // Material 把它补上了，T14 做统一闸门时不必再推导
    const ring = material.pairs.find(
      (pair) => pair.foreground === '#625b71' && pair.background === '#e6e0e9'
    )
    expect(ring).toBeDefined()
    expect(ring?.minimum).toBe(3)
    expect(ring?.usage).toContain('T14')
  })

  test('方块阶梯十二档全在表内，且没有一档依赖大字 3:1 口径', () => {
    // Classic 的 8 号是唯一按大字 3:1 走的一档；Material 每一档都按普通文字 4.5:1 算，
    // 所以「字号随位数变化」不参与这套风格的对比度结论
    const tileBackgrounds = [
      '#c2adff',
      '#b9a4ff',
      '#b09bf7',
      '#a892ee',
      '#9f89e4',
      '#9781db',
      '#7861b8',
      '#6851a6',
      '#594195',
      '#4b3183',
      '#3c1f71',
      '#300f62',
    ]
    for (const background of tileBackgrounds) {
      const pair = material.pairs.find((item) => item.background === background)
      expect(pair, background).toBeDefined()
      expect(pair?.minimum, background).toBe(4.5)
    }
  })

  test('障碍 vs 可玩空格在表内，按非文字指示器的 3:1 走', () => {
    const wall = material.pairs.find(
      (pair) => pair.foreground === '#49454f' && pair.background === '#e6e0e9'
    )
    expect(wall).toBeDefined()
    expect(wall?.minimum).toBe(3)
  })
})
