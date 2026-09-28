import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { THEMES } from '../../src/renderer/styles/themes'
import classicContrast from '../../src/renderer/styles/themes/classic/contrast.json'
import claudeContrast from '../../src/renderer/styles/themes/claude/contrast.json'
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
 *      与动效、禁用清单、窄屏策略、对比度与无障碍、成就祝贺共**十**节（三套基准风格
 *      各有一份范本，T15 的 `claude` 是第三份，且它证明了三套可以各有各的设计语言而不是
 *      同一套换色；2026-09-28 加的第 10 节是 toast 的坐标与视觉）。
 *   2. `tokens.css`：`[data-style='<id>']` 作用域下交齐下面推出的那一套令牌，
 *      **含 11 个色档连字色 + beyond**，以及 `--wall-bg`（漏了墙会透明）。
 *   3. `styles.css`：每条规则都按 `[data-style='<id>']` 隔开。
 *   4. `config.ts`：**三个插槽**（两个装饰 + 一个呈现）与自己的两份 CSS import。
 *      id 与 label 归目录，不在文件夹里（ADR-0006）。
 *   5. `toast.tsx`：成就祝贺的呈现插槽实现（见各设计卡第 10 节）。
 *   6. `contrast.json`：每一对前景/背景都过线，并带 basis / scene / probe 三个字段
 *      （T14 起；缺 probe 会让浏览器那一层对不上号）。
 *   7. `themes/index.ts` 注册一行。
 *   8. 若用到新的字体家族：`src/renderer/styles/fontLicences.json` 加一条授权与版权
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
const shellCss = (): string =>
  readFileSync(new URL('../../src/renderer/styles/index.css', import.meta.url), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    ''
  )

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
 * 组件内联 style 注入的运行时尺寸与逐方块坐标。
 * 它们不是主题要交的令牌——漏了也不该在这里报。
 */
const RUNTIME_INJECTED: readonly string[] = [
  '--board-size-px',
  '--board-padding',
  '--cell-size',
  '--merge-source-from',
  '--merge-source-to',
]

/**
 * board.css 给 beyond 档的字色留了兜底（`var(--tile-beyond-ink, var(--ink-bright))`），
 * 所以漏声明不会静默出错。但两套设计卡都要求「每一档连字色一起声明」，深浅字的分界
 * 是哪一档是主题自己的决定、不由 board.css 猜，所以它仍然必交。
 */
const ALSO_REQUIRED: readonly string[] = ['--tile-beyond-ink']

/**
 * 一套风格必须交齐的令牌：board.css、shell CSS 与它自己的 styles.css 读的，去掉本层
 * 私有与运行时注入，再补上手写的那一条。
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
  const shell = shellCss()
  const fromShell = varReads(shell)
    .filter((read) => !read.hasDefault)
    .map((read) => read.name)
    .filter((name) => !declaredNames(shell).includes(name))
  return [...new Set([...fromBoard, ...fromStyles, ...fromShell, ...ALSO_REQUIRED])].sort()
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

  test('方块层的四个可覆盖钩子都有默认值，默认值就是 Classic 现值', () => {
    const css = boardCss()
    expect(css).toContain('var(--tile-elevation, 0 0 #0000)')
    expect(css).toContain('var(--tile-font-weight, 700)')
    expect(css).toContain('var(--tile-move-easing, ease-out)')
    // 第四个由 T15 补：方块字族。默认值写成 var(--font-body) 而不是一个具体字体名，
    // 于是不声明它的 Classic / Material 渲染与改动前逐字节相同，而 Claude 可以把自己
    // 的展示衬线贴上方块数字（见 material 声明 --tile-font-weight 的同一条路子）
    expect(css).toContain('var(--tile-font-family, var(--font-body))')
    // 时长钩子同样有默认值：150ms / 120ms 是当前三套风格的公共基线
    expect(css).toContain('var(--tile-move-duration, 150ms)')
    expect(css).toContain('var(--tile-spawn-duration, 120ms)')
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
      if (theme.id === 'claude') {
        // Claude 的控件不填色，所以它自己 styles.css 读到的令牌与另两套不是同一组：
        // 描边、焦点、板面外那一圈线都是它的私事，漏一个都不会静默出错（浏览器一个字不报）
        expect(required).toContain('--control-border')
        expect(required).toContain('--rule')
        expect(required).toContain('--ink-variant')
        expect(required).toContain('--control-bg-selected')
      }
      if (theme.id === 'classic') {
        // T15：Classic 的 .panel__label 不再用 opacity 调明度，改成显式声明的两个次要色。
        // 纸面上那个就在 styles.css 里读，所以它现在也在这张从 CSS 反推的清单里——
        // 原来它只靠 .panel__label 没有 color 声明（继承）活着，反推不出任何东西
        expect(required).toContain('--ink-variant')
        expect(required).toContain('--ink-bright-variant')
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

      const contrast =
        theme.id === 'classic'
          ? classicContrast
          : theme.id === 'material'
            ? materialContrast
            : claudeContrast
      const measured = contrast.pairs.map((pair) => pair.background)
      for (const colour of declared) {
        expect(measured, `${theme.id} 的 ${colour} 没进对比度表`).toContain(colour)
      }
    })
  }
})

describe('T15：方块字族这个钩子真的被 Claude 用上了', () => {
  test('Claude 把方块数字换成展示衬线，另两套不声明（于是渲染就是 Classic 现值）', () => {
    // board.css 的默认值是 var(--font-body)，所以「不声明」= Classic 的 Inter、
    // Material 的 Roboto Flex。Claude 是三套里唯一一套让方块数字用衬线的——
    // 这是它「排版优先」最硬的一条证据，也是加这个钩子的全部理由
    const claudeTokens = themeCss('claude', 'tokens.css')
    expect(claudeTokens).toContain('--tile-font-family: var(--font-display)')
    expect(themeCss('classic', 'tokens.css')).not.toContain('--tile-font-family')
    expect(themeCss('material', 'tokens.css')).not.toContain('--tile-font-family')
    // 方块字重显式写 700：默认值也是 700，声明它是为了把「长数值要撑住 didone 的细笔画」
    // 这个决定落在文件里，而不是靠「没人改过默认值」
    expect(claudeTokens).toContain('--tile-font-weight: 700')
    // 而 Claude 的展示字是 Playfair Display、正文是 Source Sans 3，两族都不同他人
    expect(themeCss('claude', 'tokens.css')).toContain(
      "--font-display: 'Playfair Display'"
    )
    expect(themeCss('claude', 'tokens.css')).toContain("--font-body: 'Source Sans 3'")
  })

  test('Claude 的方块数字锁成齐线：子集带 lnum，board.css 那行 tabular-nums 对它是空转', () => {
    // 设计卡 §3 把「方块数字锁定齐线数字」写成选 Playfair 的理由之一，而 board.css 的
    // font-variant-numeric 只请求 tabular-nums——Playfair 的 subset 不带 tnum（同一个
    // 探针：只有 lnum / zero / case / frac），所以那一行对 Claude 从来不生效。缺口补在
    // Claude 自己的 styles.css 里：一条按 data-style 隔开的 .board__tile 规则，请求子集
    // 确实带的 lnum。tabular-nums 留在声明里——对回退栈里真带 tnum 的字体仍然有效。
    const claudeStyles = themeCss('claude', 'styles.css')
    expect(claudeStyles).toContain("[data-style='claude'] .board__tile")
    expect(claudeStyles).toContain('font-variant-numeric: lining-nums tabular-nums')
    // 另两套不碰 .board__tile：它们的 tabular-nums 真的生效（Inter / Roboto Flex 带 tnum），
    // board.css 那一行就够。这里断的是「样式表里没有第二条 .board__tile 规则」，
    // 不断 font-variant-numeric 本身——那两套的 .panel__value 也声明它
    expect(themeCss('classic', 'styles.css')).not.toContain('.board__tile')
    expect(themeCss('material', 'styles.css')).not.toContain('.board__tile')
  })
})
