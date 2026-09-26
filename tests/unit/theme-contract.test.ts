import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { THEMES } from '../../src/renderer/styles/themes'
import classicContrast from '../../src/renderer/styles/themes/classic/contrast.json'
import materialContrast from '../../src/renderer/styles/themes/material/contrast.json'

/**
 * 主题文件夹的契约（ADR-0002）
 *
 * board.css 与 tokens.css 都是普通 CSS，TypeScript 看不见它们漏声明什么——这正是
 * Classic 设计卡 §2 反复警告的那类 bug：**新风格漏了 `--wall-bg`，browser 一个字都不报**，
 * `background` 退回 transparent，墙变回四个看不见的洞（T07 修掉的就是它）。
 * 所以契约在这里用文本断言钉住：每套风格都要交齐那一套色值，且棋盘层的配色键与主题
 * 令牌真的对得上。
 *
 * 这些是**文本**断言而不是渲染断言：渲染那一半由 tests/e2e/style-switch.spec.ts 读
 * 计算样式完成（本文件不碰浏览器，见 vitest.config.ts 的 node 环境约定）。
 */

const themeCss = (styleId: string, file: string): string =>
  readFileSync(
    new URL(`../../src/renderer/styles/themes/${styleId}/${file}`, import.meta.url),
    'utf8'
  )
const boardCss = (): string =>
  readFileSync(new URL('../../src/renderer/styles/board.css', import.meta.url), 'utf8')

/**
 * 每套风格必须声明的令牌。分三类：
 *   · board.css 里**没有默认值**的（漏了就是透明/继承色，静默错）；
 *   · 外壳 styles.css 每个主题都要用的语义色；
 *   · 带默认值的那些（--cell-radius / --tile-move-easing …）不在此列——默认值就是
 *     Classic 的现值，不声明不算漏。
 */
const REQUIRED_TOKENS: readonly string[] = [
  // board.css 无默认值
  '--page',
  '--board',
  '--cell-bg',
  '--wall-bg',
  '--ink',
  '--ink-bright',
  '--control-bg',
  '--control-bg-hover',
  '--control-bg-selected',
  '--focus',
  '--font-body',
  '--tile-beyond',
  '--tile-beyond-ink',
  // 11 个色档，连字色一起
  ...Array.from({ length: 11 }, (_, index) => `--tile-${index + 1}`),
  ...Array.from({ length: 11 }, (_, index) => `--tile-${index + 1}-ink`),
]

/** board.css 里 11 条 [data-bucket] 规则的样子 */
const BUCKET_RULE = /\.board__tile\[data-bucket='(\d+)'\]\s*\{([^}]*)\}/g

describe('board.css 的配色键是 data-bucket', () => {
  test('11 条桶位规则，各自把 --tile-bg / --tile-ink 指向同名令牌', () => {
    const css = boardCss()
    const rules = [...css.matchAll(BUCKET_RULE)]
    expect(rules.map((rule) => rule[1])).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
      '11',
    ])
    for (const rule of rules) {
      const slot = rule[1]
      const body = rule[2]
      expect(body, `data-bucket='${slot}'`).toContain(`--tile-bg: var(--tile-${slot})`)
      expect(body, `data-bucket='${slot}'`).toContain(`--tile-ink: var(--tile-${slot}-ink)`)
    }
  })

  test('兜底档是 beyond：折出 11 之外的桶位没有任何规则命中', () => {
    const css = boardCss()
    // 这一条同时把「只有一个兜底档」钉住：谁再加第 13 个档位，这里会先炸
    expect(css).toContain('--tile-bg: var(--tile-beyond)')
    expect(css).toContain('--tile-ink: var(--tile-beyond-ink')
    // 数值键的配色规则一条都不剩（按数值取档那套机制已经拆掉）
    expect(css).not.toMatch(/data-value='\d+'/)
  })

  test('方块层的三个可覆盖钩子都有默认值，默认值就是 Classic 现值', () => {
    const css = boardCss()
    expect(css).toContain('var(--tile-elevation, 0 0 #0000)')
    expect(css).toContain('var(--tile-font-weight, 700)')
    expect(css).toContain('var(--tile-move-easing, ease-out)')
  })
})

describe('每套主题都交齐那一套色值', () => {
  for (const theme of THEMES) {
    test(`${theme.id}：令牌清单一个都不少，且按 [data-style='<id>'] 作用域声明`, () => {
      const tokens = themeCss(theme.id, 'tokens.css')
      expect(tokens).toContain(`[data-style='${theme.id}'] {`)
      for (const token of REQUIRED_TOKENS) {
        expect(tokens, `${theme.id} 缺 ${token}`).toContain(`${token}:`)
      }
    })

    test(`${theme.id}：styles.css 的每条规则都按 data-style 隔开`, () => {
      // 两套风格的 styles.css 同时打进同一个产物。哪条规则漏了 data-style，
      // 它就会在**另一套**风格上也生效，而生效顺序由打包结果决定、不由设计决定
      const styles = themeCss(theme.id, 'styles.css')
      for (const line of styles.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed.includes('{')) continue
        // @media 之类的前缀行不含选择器，它里面的规则各自带 data-style
        if (trimmed.startsWith('@')) continue
        expect(trimmed, `${theme.id} 有一条没按 data-style 隔开的规则：${trimmed}`).toContain(
          `data-style='${theme.id}'`
        )
      }
    })

    test(`${theme.id}：棋盘层的每个色值都在 contrast.json 里量过`, () => {
      // 声明了却没量过的色值，等于把对比度闸门漏了一个口子（T14 的脚本会补上渲染侧校验）
      const tokens = themeCss(theme.id, 'tokens.css')
      const declared = [
        ...tokens.matchAll(/--tile-(?:\d+|beyond):\s*(#[0-9a-f]{6})/g),
      ].map((match) => match[1])
      expect(declared).toHaveLength(12)

      const contrast = theme.id === 'classic' ? classicContrast : materialContrast
      const measured = contrast.pairs.map((pair) => pair.background)
      for (const colour of declared) {
        expect(measured, `${theme.id} 的 ${colour} 没进对比度表`).toContain(colour)
      }
    })
  }
})
