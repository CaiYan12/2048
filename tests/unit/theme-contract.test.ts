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
 *
 * —— T14：令牌清单从 CSS 里推出来，不再手写（收口的是 bug 的类，不是那一处）——
 *
 * 原来这里有一张手写的 REQUIRED_TOKENS。手写表只能挡住「我想到过的那些」——
 * T13 加 Material 时它就漏了两项（`--control-ink` / `--ink-variant` 全是 Material
 * 新增、手写表里没有的），而漏了它们的表现和漏 `--wall-bg` 一模一样：浏览器不报，
 * 只是安静地不是你要的样子。所以现在改成从 CSS 反推：
 *
 *   必需令牌 = board.css 与每套风格自己的 styles.css 里 **读了却没有默认值**的 var(--x)
 *              − 同一个文件里声明过的（那是那一层的私有变量，不是主题要交的）
 *              − Board.tsx 用内联 style 注入的运行时尺寸
 *
 * 加新风格时漏一个令牌、或者以后谁往 board.css 里新读一个令牌，这里当场炸。
 *
 * —— 加一套新风格要交的东西（checklist）——
 *
 *   1. `DESIGN.md`：参考特征、色彩角色、字体角色、布局与密度、棋盘 vs 外壳、独有装饰
 *      与动效、禁用清单、窄屏策略、对比度与无障碍共九节（两套基准风格各有一份范本）。
 *   2. `tokens.css`：`[data-style='<id>']` 作用域下交齐下面推出的那一套令牌，
 *      **含 11 个色档连字色 + beyond**，以及 `--wall-bg`（漏了墙会透明）。
 *   3. `styles.css`：每条规则都按 `[data-style='<id>']` 隔开。
 *   4. `config.ts`：id / label / 两个插槽，并由它 import 自己的两份 CSS。
 *   5. `contrast.json`：每一对前景/背景都过线，并带 basis / scene / probe 三个字段
 *      （T14 起；缺 probe 会让浏览器那一层对不上号）。
 *   6. `themes/index.ts` 注册一行。
 *   7. 若用到新的字体家族：`src/renderer/styles/fontLicences.json` 加一条授权与版权
 *      （tests/unit/font-licences.test.ts 会核），字体文件放进 `public/fonts/<dir>/`
 *      并在 `fonts.css` 声明（同字形类别的回退栈在 fonts.css 的 :root 里）。
 */

const themeCss = (styleId: string, file: string): string =>
  readFileSync(
    new URL(`../../src/renderer/styles/themes/${styleId}/${file}`, import.meta.url),
    'utf8'
  )
const boardCss = (): string =>
  readFileSync(new URL('../../src/renderer/styles/board.css', import.meta.url), 'utf8')

/**
 * 一份 CSS 里所有 `var(--x)` / `var(--x, fallback)` 读取。
 *
 * 手写扫描而不是正则：fallback 里可能再套一个 var()（board.css 的
 * `--tile-beyond-ink, var(--ink-bright)`），按括号深度配对才数得准逗号在哪一层。
 * `hasDefault` 决定这个令牌是不是「漏了就静默出错」的那一类：有默认值的漏了只是
 * 换个样子，没默认值的漏了直接用不上（background 退回 transparent、border-radius 归零）。
 */
function varReads(css: string): Array<{ name: string; hasDefault: boolean }> {
  const reads: Array<{ name: string; hasDefault: boolean }> = []
  let cursor = 0
  for (;;) {
    const at = css.indexOf('var(', cursor)
    if (at === -1) break
    let depth = 1
    let index = at + 4
    let inner = ''
    while (index < css.length && depth > 0) {
      const char = css[index]
      if (char === '(') depth += 1
      else if (char === ')') {
        depth -= 1
        if (depth === 0) break
      }
      inner += char
      index += 1
    }
    let slash = 0
    let comma = -1
    for (let position = 0; position < inner.length; position += 1) {
      const char = inner[position]
      if (char === '(') slash += 1
      else if (char === ')') slash -= 1
      else if (char === ',' && slash === 0) {
        comma = position
        break
      }
    }
    const name = inner.slice(0, comma === -1 ? inner.length : comma).trim()
    if (name.startsWith('--')) reads.push({ name, hasDefault: comma !== -1 })
    cursor = index + 1
  }
  return reads
}

/** 一份 CSS 自己声明了哪些自定义属性（`--x:` 开头的行） */
function declaredNames(css: string): string[] {
  return [...css.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((match) => match[1])
}

/**
 * Board.tsx 用内联 style 贴到棋盘根元素上的运行时尺寸（BoardLayout 算出来的）。
 * 它们不是主题要交的令牌——漏了也不该在这里报。
 */
const RUNTIME_INJECTED: readonly string[] = ['--board-size-px', '--board-padding', '--cell-size']

/**
 * board.css 给 beyond 档的字色留了兜底（`var(--tile-beyond-ink, var(--ink-bright))`），
 * 所以漏声明不会静默出错。但两套设计卡都要求「每一档连字色一起声明」，深浅字的分界
 * 是哪一档是主题自己的决定、不由 board.css 猜，所以它仍然必交。
 */
const ALSO_REQUIRED: readonly string[] = ['--tile-beyond-ink']

/**
 * 一套风格必须交齐的令牌：board.css 读的 + 它自己 styles.css 读的，去掉本层私有与
 * 运行时注入，再补上手写的那一条。
 */
function requiredTokens(styleId: string): readonly string[] {
  const fromBoard = new Set(
    varReads(boardCss())
      .filter((read) => !read.hasDefault)
      .map((read) => read.name)
      .filter(
        (name) =>
          !declaredNames(boardCss()).includes(name) && !RUNTIME_INJECTED.includes(name)
      )
  )
  const styles = themeCss(styleId, 'styles.css')
  const fromStyles = varReads(styles)
    .filter((read) => !read.hasDefault)
    .map((read) => read.name)
    .filter((name) => !declaredNames(styles).includes(name))
  return [...new Set([...fromBoard, ...fromStyles, ...ALSO_REQUIRED])].sort()
}

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
    const required = requiredTokens(theme.id)

    test(`${theme.id}：board.css 与它自己的 styles.css 读到的每个令牌都声明了`, () => {
      const tokens = themeCss(theme.id, 'tokens.css')
      expect(tokens).toContain(`[data-style='${theme.id}'] {`)
      for (const token of required) {
        expect(tokens, `${theme.id} 缺 ${token}`).toContain(`${token}:`)
      }
    })

    test(`${theme.id}：推出的清单比原来那张手写表更严`, () => {
      // 这条钉的是「清单真的从 CSS 推出来、没有偷懒」：Material 的 --control-ink /
      // --ink-variant、以及两套风格都用的 --cell-radius / --board-radius 都只在
      // styles.css 里读、手写表里从没有过，现在必须出现在清单里
      for (const token of ['--cell-radius', '--board-radius', '--wall-bg', '--tile-beyond-ink']) {
        expect(required, `${theme.id} 的清单里应该有 ${token}`).toContain(token)
      }
      if (theme.id === 'material') {
        expect(required).toContain('--control-ink')
        expect(required).toContain('--ink-variant')
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
