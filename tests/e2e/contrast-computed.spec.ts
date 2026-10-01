import { expect, test, type Page } from '@playwright/test'
import type { ContrastPair } from '../../scripts/check-contrast.mjs'
import classicContrast from '../../src/renderer/styles/themes/classic/contrast.json' with { type: 'json' }
import claudeContrast from '../../src/renderer/styles/themes/claude/contrast.json' with { type: 'json' }
import materialContrast from '../../src/renderer/styles/themes/material/contrast.json' with { type: 'json' }

/**
 * T14：对比度闸门的第二层——从**渲染结果**里读回每一对
 *
 * SPEC §4 那句「check:contrast validates declared pairs, with browser computed-style
 * checks to catch declarations that differ from rendered CSS」是两层：JSON 与 tokens.css
 * 那一层在 `npm run check:contrast`（浏览器之外），本文件是浏览器那一层。
 *
 * 存在的理由：**声明对了不等于渲染对了**。三套风格的 styles.css 同时打进同一个产物，
 * 一条规则漏了 data-style、一个选择器写错、一个 @media 把作用域改了——表上仍然写着
 * 6.74:1，而页面上根本不是那个颜色。这一层专门抓这个：按每对自带的 probe 找到真实
 * 元素，读它的计算样式，与表上的 hex 逐通道对。
 *
 * 期望值全部从 contrast.json 来，一个 hex 都不在这里写死：改表必须同步改渲染，
 * 两边脱钩时炸的是这一层，而不是「某天有人发现闸门从来没报过」。
 *
 * probe 的三个字段（语义见 check-contrast.mjs 的 auditPair）：
 *   selector   前景取自哪个元素
 *   read       color（默认）/ background / ring。ring 用于焦点环与选中环——环的颜色
 *              不在 color 上（Classic 是 box-shadow 双环，Material 与 Claude 是 outline），
 *              所以从环的声明里取色。
 *   background 背景取自哪个元素。小标签压在面板上、环压在空格上，这类背景不在元素自己身上。
 *   hover      先悬停再读（悬停态那一对）。
 *
 * **T15 起 ring 探针分两步读**：Claude 的控件有一圈**静止态**描边（1px 暖灰，不填色的
 * 描边按钮），而 Tab 之后同一边会变成焦点环（3px 陶土色）。两种颜色都要量，所以
 * 「不带 :focus-visible 的环」在键盘导航**之前**读，「带 :focus-visible 的环」在 Tab **之后**
 * 读。写在一步里的话，静止态那一对会在焦点环已经覆盖它之后才被读取，于是一次都没量过。
 *
 * **opacity 跟着一起读**：元素级 opacity 不进 color 的计算值（它是独立属性），所以
 * 「读到的 color」与「眼睛看到的颜色」对 `from` 那几对不是同一个东西——基色与 opacity
 * 必须各自对一遍，再把两者压在背景上对合成色，三件事都做过才叫「渲染对上了」。
 * （T15 之后三套风格的表里一对都没有 from：Classic 那两处已换成显式声明的色值。
 * 这条路径仍然保留并由单测用合成对覆盖，因为闸门要能咬人。）
 *
 * **本文件由 T14 编写、T15 扩展，但不运行**（跑它的是控制人的统一 sweep）：本次会话被明确
 * 要求不启动 Playwright、不开任何浏览器。全部断言都走真实 DOM 与计算样式。
 */

type Scene = 'start' | 'run' | 'walls' | 'milestone'

/** 与 contrast.json 的 scene 字段一一对应；多一个场景就在此登记，并补一个 setupScene 分支 */
const SCENES: readonly Scene[] = ['start', 'run', 'walls', 'milestone']

interface StyleFixture {
  id: string
  label: string
  pairs: readonly ContrastPair[]
}

const STYLES: readonly StyleFixture[] = [
  { id: 'classic', label: 'Classic', pairs: classicContrast.pairs },
  { id: 'material', label: 'Material', pairs: materialContrast.pairs },
  { id: 'claude', label: 'Claude', pairs: claudeContrast.pairs },
]

/** 铺齐 11 个色档 + beyond 的开局局面：2,4,8,…,2048,4096 + 四个空格 */
const LADDER_BOARD = '2,4,8,16,32,64,128,256,512,1024,2048,4096,,,,'

/** 全空开局：只为了拿到四个墙与若干空格（障碍那一对不需要方块） */
const EMPTY_BOARD = ',,,,,,,,,,,,,,,'
/** 四个 1024：一次左移合出两个 2048，第一次达标 → 结果层挂上（milestone 那一幕） */
const MILESTONE_BOARD = '1024,1024,1024,1024,,,,,,,,,,,,'

/**
 * 页面上所有可能成为 Tab 停靠点的元素（原生可聚焦 + 正的 tabindex）。
 *
 * 这一串只写一份：既要给 page.locator 数第几个用，也要传给 evaluate 从 DOM 里推导
 * 下一个停靠点。两边必须是同一份，否则「第 N 个」指的是两个不同的列表。
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

async function pickStyle(page: Page, label: string): Promise<void> {
  await page.getByRole('group', { name: '风格' }).getByRole('button', { name: label }).click()
}

async function setupScene(page: Page, scene: Scene, label: string): Promise<void> {
  switch (scene) {
    case 'start':
      // 开局界面：小标签落在纸面上（--page）
      await page.goto('/?seed=20260926')
      await pickStyle(page, label)
      return
    case 'run':
      // 局中：面板、控件、提示、12 个色档、焦点环与选中环全在这一幕
      await page.goto(`/?seed=20260926&board=${LADDER_BOARD}`)
      await pickStyle(page, label)
      await page.getByRole('button', { name: '开始游戏' }).click()
      await expect(page.locator('[data-board]')).toBeVisible()
      return
    case 'walls':
      // 墙模式：先选模式再开局（?board= 由开局那一刻的模式解释，见 fixture.ts）
      await page.goto(`/?seed=20260926&board=${EMPTY_BOARD}`)
      await page.getByRole('group', { name: '模式' }).getByRole('button', { name: '障碍' }).click()
      await pickStyle(page, label)
      await page.getByRole('button', { name: '开始游戏' }).click()
      await expect(page.locator('[data-board]')).toBeVisible()
      return
    case 'milestone': {
      // T26 的结果层：四个 1024 一次左移合出两个 2048（第一次达标），层当场挂上。
      // 这一幕只为量卡片那一面存在——卡片整个不透明，而读数小标签的色对虽然早在表里，
      // 探针取的却是记分卡上的 .panel__label；没有人量过「压在结果层卡片上」的这一下。
      await page.goto(`/?seed=20260926&board=${MILESTONE_BOARD}`)
      await pickStyle(page, label)
      await page.getByRole('button', { name: '开始游戏' }).click()
      await expect(page.locator('[data-board]')).toBeVisible()
      await page.locator('[data-board]').focus()
      await page.keyboard.press('ArrowLeft')
      await expect(page.locator('[data-result-tier="won"]')).toBeVisible()
      return
    }
  }
}

/** 从页面上读回一对声明的前景与背景（null = 探针里的选择器在页面上根本不存在） */
async function readProbe(
  page: Page,
  probe: NonNullable<ContrastPair['probe']>
): Promise<{ foreground: string[]; background: string | null; opacity: number } | null> {
  return page.evaluate((target) => {
    const element = document.querySelector(target.selector)
    if (element === null) return null
    const style = getComputedStyle(element)
    const surface =
      target.background === undefined ? element : document.querySelector(target.background)
    const foreground: string[] = []
    const read = target.read ?? 'color'
    if (read === 'ring') {
      // 环不在 color 上：Classic 用「页面色垫圈 + 深色描边」的 box-shadow 双环，
      // Material 用 outline。两种都读，层里出现过的颜色都算
      if (parseFloat(style.outlineWidth) > 0 && style.outlineStyle !== 'none') {
        foreground.push(style.outlineColor)
      }
      if (style.boxShadow !== 'none') {
        foreground.push(...(style.boxShadow.match(/rgba?\([^)]*\)/g) ?? []))
      }
    } else if (read === 'background') {
      // 障碍那一对：前景就是元素自己的底色
      foreground.push(style.backgroundColor)
    } else {
      foreground.push(style.color)
    }
    return {
      foreground,
      background: surface === null ? null : getComputedStyle(surface).backgroundColor,
      // 元素级 opacity 单独读：它改变这个元素实际显示的颜色，却**不会**进 color 的
      // 计算值（getComputedStyle().color 给的是合成前的基色，如 Classic 的
      // .panel__label 读到 rgb(249,246,242) 而不是 #e4e0da），所以必须由这一层读回来
      opacity: parseFloat(style.opacity),
    }
  }, probe)
}

interface Channels {
  r: number
  g: number
  b: number
  a: number
}

function parseColour(value: string): Channels {
  const parts = /rgba?\(([^)]+)\)/.exec(value)
  if (parts === null) throw new Error(`认不出的颜色：${value}`)
  const channels = parts[1].split(',').map((part) => Number(part.trim()))
  const [r = 0, g = 0, b = 0, a = 1] = channels
  return { r, g, b, a }
}

/** '#rrggbb' → 通道 */
function hexChannels(hex: string): Channels {
  const digits = hex.replace('#', '')
  return {
    r: parseInt(digits.slice(0, 2), 16),
    g: parseInt(digits.slice(2, 4), 16),
    b: parseInt(digits.slice(4, 6), 16),
    a: 1,
  }
}

/** 两色逐通道比，容 1：浏览器与声明都按 8bit 算，四舍五入可能差 1 */
function sameColour(rendered: string, hex: string, tolerance = 1): boolean {
  const a = parseColour(rendered)
  const b = hexChannels(hex)
  return (
    Math.abs(a.r - b.r) <= tolerance &&
    Math.abs(a.g - b.g) <= tolerance &&
    Math.abs(a.b - b.b) <= tolerance
  )
}

/**
 * opacity 差多少算「没变」。不为精确相等：这个值先在 CSS 文本里存一轮、再从计算样式
 * 读回来，浏览器序列化浮点数的方式是细节不是语义。0.005 的来处是同一把尺子的另一面——
 * 比它更小的 opacity 变化对合成色每个通道的影响不足 1/255，`sameColour` 的容差都分不出。
 */
const OPACITY_TOLERANCE = 0.005

/**
 * alpha 合成：「颜色自己的 alpha」与「元素级 opacity」相乘之后再压（与 check-contrast
 * 的 compositeHex 同算式，只是那里按表上的 from.opacity 算，这里按元素上读到的算）。
 * 乘法而不是取其一：rgba(…, .85) 的元素又带 opacity 时，实际不透明度是两者相乘。
 */
function compositeOver(foreground: string, background: string, opacity: number): string {
  const top = parseColour(foreground)
  const under = parseColour(background)
  const alpha = top.a * opacity
  const mix = (x: number, y: number): number => Math.round(alpha * x + (1 - alpha) * y)
  return `rgb(${mix(top.r, under.r)}, ${mix(top.g, under.g)}, ${mix(top.b, under.b)})`
}

async function expectPair(page: Page, pair: ContrastPair): Promise<void> {
  const probe = pair.probe
  if (probe === undefined) throw new Error(`${pair.usage} 没有 probe`)
  const where = `${pair.usage}（探针 ${probe.selector}）`

  const rendered = await readProbe(page, probe)
  // 找不到元素就是这一层存在的意义：选择器没生效，表上那一对没人验过
  expect(rendered, `${where}：页面上找不到这个元素`).not.toBeNull()
  if (rendered === null) return

  const backgroundLabel = probe.background ?? probe.selector
  expect(
    rendered.background,
    `${where}：背景选择器 ${backgroundLabel} 在页面上找不到`
  ).not.toBeNull()
  if (rendered.background === null) return

  // 背景一律不透明；真有半透明底色的那天，要把「它压在什么上面」写进 probe.background
  expect(parseColour(rendered.background).a, `${where}：背景不是不透明的`).toBe(1)
  expect(sameColour(rendered.background, pair.background), `${where}：背景对不上`).toBe(true)

  if ((probe.read ?? 'color') === 'ring') {
    // 环：声明的颜色必须出现在环的某一层里（Classic 的双环有两层，另一层是垫圈色）
    const ring = rendered.foreground.find((colour) => sameColour(colour, pair.foreground))
    expect(ring, `${where}：环的声明里没有这个颜色`).toBeDefined()
    return
  }
  // 文字：先核「声明 vs 渲染」的两个原料，再压在背景上与声明的合成色对
  const from = pair.from
  if (from !== undefined) {
    // 基色。opacity 是独立属性、不进 color 的计算值，所以这一对要问的是
    // 「元素上那个还没合成的基色」是不是表上的 base——这正是「声明有没有渲染出来」
    // 的问题，此前一次都没问过
    expect(
      sameColour(rendered.foreground[0], from.base),
      `${where}：声明的基色是 ${from.base}，元素上读到 ${rendered.foreground[0]}`
    ).toBe(true)
    // opacity。同样按元素上读到的算：改了 CSS 却忘了改表时，下面那次合成会对不上，
    // 而这一次先把话说明白——是哪个原料漂了，不用从一个合成色去反推
    expect(
      Math.abs(rendered.opacity - from.opacity) <= OPACITY_TOLERANCE,
      `${where}：声明的 opacity 是 ${from.opacity}，元素上是 ${rendered.opacity}`
    ).toBe(true)
  }
  // 合成。用**元素上读到的 opacity**，不用表上的 from.opacity：那样「CSS 改了、表没改」
  // 会被合成色对不上抓住，而不是被表上的旧值悄悄带过去
  const composited = compositeOver(rendered.foreground[0], rendered.background, rendered.opacity)
  expect(
    sameColour(composited, pair.foreground),
    `${where}：渲染成 ${composited}，声明是 ${pair.foreground}`
  ).toBe(true)
}

/**
 * 从棋盘按一次 Tab，会停在哪里：按 FOCUSABLE 在 DOM 里的序号算，-1 = 推不出来。
 *
 * 为什么必须从 DOM 推导：方向按钮（T10）只在 `(pointer: coarse)` 的设备上占位——
 * 桌面端整块是 `display: none`，既不在布局里、也不是焦点停靠点；Pixel 5 上它却是四个
 * 真实按钮，就摆在棋盘与「新游戏」之间。于是同一次 Tab，桌面落在「新游戏」、手机上
 * 落在「向上」，两边都对。写死名字会在 mobile project 上红，写死「跳过四个」则是在
 * 假设一个只在触屏上存在的障碍。
 *
 * 要适配的是这条走查，不是把方向按钮变成不可聚焦：它是 T10 交付的控件，键盘玩家
 * 同样该 Tab 得到它。所以这里照 swap.spec.ts 的 crossPickerSteps 那条路子办——按页面
 * 上真实的停靠点数走一步，不写死。
 *
 * display:none 的子树要跳过的原因是浏览器的顺序焦点导航本来就不进去；判据用循环查
 * 各层计算样式，不猜视口宽度（显隐判据是输入设备，不是宽度）。
 */
async function nextFocusStopAfterBoard(page: Page): Promise<number> {
  return page.evaluate((selector) => {
    const board = document.querySelector('[data-board]')
    if (board === null) return -1
    const candidates = [...document.querySelectorAll(selector)]
    const from = candidates.indexOf(board)
    if (from === -1) return -1
    // 元素自己或任一祖先被收起（display:none / visibility:hidden）就不在焦点序列里
    const rendered = (element: Element): boolean => {
      for (let node: Element | null = element; node !== null; node = node.parentElement) {
        const style = getComputedStyle(node)
        if (style.display === 'none' || style.visibility === 'hidden') return false
      }
      return true
    }
    for (let index = from + 1; index < candidates.length; index += 1) {
      if (rendered(candidates[index])) return index
    }
    return -1
  }, FOCUSABLE)
}

/** 同一幕里探针有先后顺序：静态 → 悬停 → 静止态环 → 键盘焦点环 → 交换拾取 */
async function checkPairs(page: Page, pairs: readonly ContrastPair[]): Promise<void> {
  const plain = pairs.filter((pair) => pair.probe?.hover !== true && pair.probe?.read !== 'ring')
  for (const pair of plain) await expectPair(page, pair)

  const hovered = pairs.filter((pair) => pair.probe?.hover === true)
  if (hovered.length > 0) {
    await page.locator(hovered[0].probe?.selector ?? '').first().hover()
    for (const pair of hovered) await expectPair(page, pair)
    // 读完之后把指针移开：悬停是**这一步故意制造**的状态，而下一步「静止态的环」按定义
    // 要在没有悬停、没有焦点的状态下读。不移开的话，同一枚 .control 会带着悬停底色被读到
    // ——Claude 的表上两对都探 `.control`（悬停对 #e3dccc / 静止描边对纸面 #f0eee6），
    // 于是描边那一对读到的是悬停底色，报「背景对不上」（实测红了两个视口）。
    await page.mouse.move(0, 0)
  }

  // 静止态的环（Claude 控件那一圈 1px 描边）要在键盘导航**之前**读：Tab 之后同一边的
  // outline 会被焦点环覆盖，那时读到的就不再是表上声明的那个颜色
  //
  // **方块上的环不归这一档**：它要先开交换拾取、再点一枚方块才存在，那套动作在最后。
  // 原来这里只按「read === 'ring'、选择器不带 :focus-visible」筛，于是方块环也被夹进来，
  // 在没有选中方块的那一刻去读——必然是「页面上找不到这个元素」（Classic / Material 各两个视口）。
  const tileRing = (pair: ContrastPair): boolean =>
    pair.probe?.read === 'ring' && (pair.probe?.selector ?? '').startsWith('.board__tile')
  const restingRings = pairs.filter(
    (pair) =>
      pair.probe?.read === 'ring' &&
      !(pair.probe?.selector ?? '').includes(':focus-visible') &&
      !tileRing(pair)
  )
  for (const pair of restingRings) await expectPair(page, pair)

  // 焦点环要键盘导航才出来：从棋盘按一次 Tab，下一个停靠点（桌面是「新游戏」）拿到
  // :focus-visible。探针写成 .control:focus-visible 而不是 .control——它有焦点时才存在，
  // 所以 Tab 没生效（没匹配上 focus-visible）时这里是「找不到元素」而不是静悄悄读到别的按钮。
  // 判据是选择器里带 :focus-visible，不是「以 .control 开头」：Claude 的静止态描边也长在
  // .control 上（上面那一步已经量过），再把它拖到 Tab 之后只会读到同一个轮廓
  const controlRings = pairs.filter((pair) =>
    (pair.probe?.selector ?? '').includes(':focus-visible')
  )
  if (controlRings.length > 0) {
    await page.locator('[data-board]').focus()
    await page.keyboard.press('Tab')
    // 停靠点由 DOM 推（理由见 nextFocusStopAfterBoard）：桌面是「新游戏」，
    // Pixel 5 是方向按钮的「向上」——两个 project 各自的正确答案
    const stop = await nextFocusStopAfterBoard(page)
    expect(stop, '从棋盘推导不出下一个 Tab 停靠点（棋盘不可聚焦，或后面没有可见控件）').toBeGreaterThan(
      -1
    )
    await expect(page.locator(FOCUSABLE).nth(stop)).toBeFocused()
    for (const pair of controlRings) await expectPair(page, pair)
  }

  // 选中环要先开交换拾取再点一枚方块（board.css 的 [data-selected='true']）
  const tileRings = pairs.filter(tileRing)
  if (tileRings.length > 0) {
    await page.getByRole('button', { name: '交换' }).click()
    await page.locator('[data-tile-id="1"]').click()
    await expect(page.locator('.board__tile[data-selected="true"]')).toHaveCount(1)
    for (const pair of tileRings) await expectPair(page, pair)
  }
}

test('三套风格的每一对都写着 e2e 认得的 scene（认不得的场景先在这里炸，不被静悄悄跳过）', () => {
  const seen = new Set<Scene>()
  for (const style of STYLES) {
    for (const pair of style.pairs) {
      expect(SCENES, `${style.id} · ${pair.usage}`).toContain(pair.scene as Scene)
      seen.add(pair.scene as Scene)
    }
  }
  // 三个场景都要有人量：登记了第四个场景却没有用例，等于那批声明没人验
  expect([...seen].sort()).toEqual([...SCENES].sort())
})

for (const style of STYLES) {
  for (const scene of SCENES) {
    const pairs = style.pairs.filter((pair) => pair.scene === scene)
    if (pairs.length === 0) continue

    test(`${style.label} · ${scene} 场景：每一对声明都从渲染结果里量得到`, async ({ page }) => {
      await setupScene(page, scene, style.label)
      await expect(page.locator('main')).toHaveAttribute('data-style', style.id)
      await checkPairs(page, pairs)
    })
  }
}
