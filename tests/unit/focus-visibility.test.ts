import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { BASIS_MINIMUM, contrastRatio } from '../../scripts/check-contrast.mjs'
import { THEMES } from '../../src/renderer/styles/themes'

/**
 * T22 验收标准 1 的静态半边：**每一个焦点目标都要有一个看得见的环**。
 *
 * 焦点可见性不是「某个元素拿到了焦点」，而是「拿到焦点的那一个有一条与背景分得开的环」。
 * 后者是颜色与几何的事实，所以它能在 node 里被断言：从 CSS 文本里取出环的声明、把它
 * 引用的令牌解析回 tokens.css 里的色值、再按 WCAG 复算它压在什么底色上。这不替代浏览器
 * 那一层（tests/e2e/task-22-a11y.spec.ts 读计算样式），它替代的是「环没了却没人知道」。
 *
 * 为什么值得单独立一个文件：环的声明散在三处——外壳控件与棋盘在每套风格的 styles.css、
 * 方块在共用的 board.css。三套风格 × 三个焦点目标 = 九条规则，任何一条被删掉、被改成
 * `outline: 0`、或者被换成一个与底色分不清的颜色，都不会有任何编译器或运行时报错，
 * 页面只是安静地少了一圈环。
 *
 * 焦点目标清单（与 Board.tsx / App.tsx 里真实的 tabindex 一一对应）：
 *   · `.control`   外壳上每一个按钮（模式 / 风格 / 开始 / 交换 / 撤销 / 新游戏 / 静音 /
 *                  战绩 / 收起 / 知道了 / 四个方向钮）
 *   · `.board`     棋盘根本身（tabIndex 0，方向键与 Z 的归属就在这里）
 *   · `.board__tile` 交换拾取中的方块（TileView 的 `tabIndex={selectable ? 0 : undefined}`）
 *
 * `.dpad__key` 没有自己的环规则：它带 `.control` 类，用的就是上面第一条（T10 的理由：
 * 「键面复用 .control 的配色与焦点环」）。浏览器那一层逐个 Tab 到它再读计算样式。
 */

const tokensCss = (styleId: string): string =>
  readFileSync(
    new URL(`../../src/renderer/styles/themes/${styleId}/tokens.css`, import.meta.url),
    'utf8'
  )
const themeStylesCss = (styleId: string): string =>
  readFileSync(
    new URL(`../../src/renderer/styles/themes/${styleId}/styles.css`, import.meta.url),
    'utf8'
  )
const boardCss = (): string =>
  readFileSync(new URL('../../src/renderer/styles/board.css', import.meta.url), 'utf8')

/** 选择器里出现的正则元字符逐个转义，然后取跟在它后面的那一块 */
function ruleBody(css: string, selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css)
  return match === null ? null : match[1]
}

/** tokens.css 里一个令牌的色值（取不到 = 这套风格没有声明它） */
function tokenHex(tokens: string, name: string): string | null {
  const match = new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{6})`).exec(tokens)
  return match === null ? null : match[1].toLowerCase()
}

interface Ring {
  width: number
  token: string
}

/**
 * 一条 `:focus-visible` 规则里的那一圈环。
 *
 * 两种画法都认，因为它们各有理由（不是谁写错了）：Material / Claude 用 `outline`，
 * Classic 用「页面色垫圈 + 深色描边」的 box-shadow 双环。双环取**最宽**那一圈——
 * 它就是贴在外层背景上的那一圈，内圈只是垫色（与背景同色，量不出对比度也不需要量）。
 *
 * 认不出来就返回 null：`outline: 0`、`outline: none`、`box-shadow: none` 全都落在这里，
 * 而它们正是「环被删掉了」的三种写法。调用方必须因此失败，不能默认通过。
 */
function ringOf(body: string): Ring | null {
  const outline = /outline:\s*(\d+(?:\.\d+)?)px\s+solid\s+var\((--[a-z0-9-]+)\)/.exec(body)
  if (outline !== null) return { width: Number(outline[1]), token: outline[2] }

  const layers = [...body.matchAll(/0 0 0 (\d+(?:\.\d+)?)px\s+var\((--[a-z0-9-]+)\)/g)]
  if (layers.length === 0) return null
  // 最宽的一圈贴在外层背景上：Classic 的内圈是 --page（垫色），外圈才是要量的那一个
  const widest = layers.reduce((a, b) => (Number(b[1]) > Number(a[1]) ? b : a))
  return { width: Number(widest[1]), token: widest[2] }
}

/** 一个焦点目标：环写在哪个文件、哪条规则里，环外面是什么底色 */
interface FocusTarget {
  /** 名字，只用于失败信息 */
  label: string
  css: () => string
  selector: string
  /** 环外侧的背景令牌（环画在它上面） */
  background: string
}

const shellTarget = (styleId: string, selector: string, label: string): FocusTarget => ({
  label,
  css: () => themeStylesCss(styleId),
  selector: `[data-style='${styleId}'] ${selector}`,
  // 外壳上两个焦点目标的环都画在页面上（Classic 的双环内圈就是 --page 自己）
  background: '--page',
})

describe('每个焦点目标都有一条看得见的环', () => {
  for (const theme of THEMES) {
    const targets: readonly FocusTarget[] = [
      shellTarget(theme.id, '.control:focus-visible', '外壳控件'),
      shellTarget(theme.id, '.board:focus-visible', '棋盘'),
      {
        // 拾取中的方块：环写在共用的 board.css 里（方块层不用 Tailwind、不按风格分叉），
        // 画在方块外侧，于是落在空格底上
        label: '拾取中的方块',
        css: boardCss,
        selector: '.board__tile:focus-visible',
        background: '--cell-bg',
      },
    ]

    for (const target of targets) {
      test(`${theme.id} · ${target.label}：环存在、够粗、与底色分得开`, () => {
        const css = target.css()
        const body = ruleBody(css, target.selector)
        // 环整条规则没了。这一条就是「删掉焦点指示」会炸的地方
        expect(body, `${theme.id} 没有 ${target.selector} 这条规则`).not.toBeNull()
        if (body === null) return

        const ring = ringOf(body)
        // outline: 0 / box-shadow: none / 换了写法——三种都算「环没了」
        expect(ring, `${theme.id} · ${target.label} 的 :focus-visible 规则里认不出一圈环`).not.toBeNull()
        if (ring === null) return

        // 2px 是非文字指示器能看清的下限（WCAG 1.4.11 只管对比度，粗度是工程判据：
        // 更细的环在低分屏上与文字笔画分不开）
        expect(ring.width, `${theme.id} · ${target.label} 的环只有 ${ring.width}px`).toBeGreaterThanOrEqual(2)

        const tokens = tokensCss(theme.id)
        const colour = tokenHex(tokens, ring.token)
        expect(colour, `${theme.id} 没有声明 ${ring.token}（环引用了一个不存在的色值）`).not.toBeNull()
        const background = tokenHex(tokens, target.background)
        expect(background, `${theme.id} 没有声明 ${target.background}`).not.toBeNull()
        if (colour === null || background === null) return

        // 环压在自己声明的那层底色上：这一对就是「看得出焦点」的判据
        const ratio = contrastRatio(colour, background)
        expect(
          ratio,
          `${theme.id} · ${target.label} 的环 ${colour} 压在 ${background} 上只有 ${ratio.toFixed(2)}:1`
        ).toBeGreaterThanOrEqual(BASIS_MINIMUM['non-text'])
      })
    }
  }
})

describe('焦点环不引入第二种颜色', () => {
  test('三套风格的三个焦点目标全都用 --focus', () => {
    // 「全壳只有焦点与被选中用暖色」（Claude tokens.css 的原话）与 Classic 的
    // 「选中态就用焦点那个深棕」是同一条决定：焦点色只有一份，换风格时跟着 tokens.css 走。
    // 这条钉住它——谁哪天给某个焦点目标单独指定一个颜色，这里先炸
    const cases: readonly { css: string; selector: string }[] = [
      { css: themeStylesCss('classic'), selector: "[data-style='classic'] .control:focus-visible" },
      { css: themeStylesCss('classic'), selector: "[data-style='classic'] .board:focus-visible" },
      { css: themeStylesCss('material'), selector: "[data-style='material'] .control:focus-visible" },
      { css: themeStylesCss('material'), selector: "[data-style='material'] .board:focus-visible" },
      { css: themeStylesCss('claude'), selector: "[data-style='claude'] .control:focus-visible" },
      { css: themeStylesCss('claude'), selector: "[data-style='claude'] .board:focus-visible" },
      // 方块层是共用的：一条规则对三套风格同时成立，色值也只有一个
      { css: boardCss(), selector: '.board__tile:focus-visible' },
    ]
    for (const item of cases) {
      const ring = ringOf(ruleBody(item.css, item.selector) ?? '')
      expect(ring, `${item.selector} 认不出一圈环`).not.toBeNull()
      expect(ring?.token).toBe('--focus')
    }
  })
})
