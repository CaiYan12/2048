import { expect, test, type Page } from '@playwright/test'
import type { ContrastPair } from '../../scripts/check-contrast.mjs'
import classicContrast from '../../src/renderer/styles/themes/classic/contrast.json'
import materialContrast from '../../src/renderer/styles/themes/material/contrast.json'

/**
 * T14：对比度闸门的第二层——从**渲染结果**里读回每一对
 *
 * SPEC §4 那句「check:contrast validates declared pairs, with browser computed-style
 * checks to catch declarations that differ from rendered CSS」是两层：JSON 与 tokens.css
 * 那一层在 `npm run check:contrast`（浏览器之外），本文件是浏览器那一层。
 *
 * 存在的理由：**声明对了不等于渲染对了**。两套风格的 styles.css 同时打进同一个产物，
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
 *              不在 color 上（Classic 是 box-shadow 双环，Material 是 outline），
 *              所以从环的声明里取色。
 *   background 背景取自哪个元素。小标签压在面板上、环压在空格上，这类背景不在元素自己身上。
 *   hover      先悬停再读（悬停态那一对）。
 *
 * **本文件由 T14 编写但不运行**（跑它的是控制人的统一 sweep）：本次会话被明确要求不启动
 * Playwright、不开任何浏览器。全部断言都走真实 DOM 与计算样式。
 */

type Scene = 'start' | 'run' | 'walls'

/** 与 contrast.json 的 scene 字段一一对应；多一个场景就在此登记，并补一个 setupScene 分支 */
const SCENES: readonly Scene[] = ['start', 'run', 'walls']

interface StyleFixture {
  id: string
  label: string
  pairs: readonly ContrastPair[]
}

const STYLES: readonly StyleFixture[] = [
  { id: 'classic', label: 'Classic', pairs: classicContrast.pairs },
  { id: 'material', label: 'Material', pairs: materialContrast.pairs },
]

/** 铺齐 11 个色档 + beyond 的开局局面：2,4,8,…,2048,4096 + 四个空格 */
const LADDER_BOARD = '2,4,8,16,32,64,128,256,512,1024,2048,4096,,,,'

/** 全空开局：只为了拿到四个墙与若干空格（障碍那一对不需要方块） */
const EMPTY_BOARD = ',,,,,,,,,,,,,,,'

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
  }
}

/** 从页面上读回一对声明的前景与背景（null = 探针里的选择器在页面上根本不存在） */
async function readProbe(
  page: Page,
  probe: NonNullable<ContrastPair['probe']>
): Promise<{ foreground: string[]; background: string | null } | null> {
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

/** alpha 合成：opacity .85 的小标签就是这样成形的（与 check-contrast 的 compositeHex 同算式） */
function compositeOver(foreground: string, background: string): string {
  const top = parseColour(foreground)
  const under = parseColour(background)
  const mix = (x: number, y: number): number => Math.round(top.a * x + (1 - top.a) * y)
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
  // 文字：半透明前景先压在背景上，再与声明的合成色对
  const composited = compositeOver(rendered.foreground[0], rendered.background)
  expect(
    sameColour(composited, pair.foreground),
    `${where}：渲染成 ${composited}，声明是 ${pair.foreground}`
  ).toBe(true)
}

/** 同一幕里探针有先后顺序：静态 → 悬停 → 键盘焦点 → 交换拾取 */
async function checkPairs(page: Page, pairs: readonly ContrastPair[]): Promise<void> {
  const plain = pairs.filter((pair) => pair.probe?.hover !== true && pair.probe?.read !== 'ring')
  for (const pair of plain) await expectPair(page, pair)

  const hovered = pairs.filter((pair) => pair.probe?.hover === true)
  if (hovered.length > 0) {
    await page.locator(hovered[0].probe?.selector ?? '').first().hover()
    for (const pair of hovered) await expectPair(page, pair)
  }

  // 焦点环要键盘导航才出来：从棋盘按 Tab，「新游戏」拿到 :focus-visible。
  // 探针写成 .control:focus-visible 而不是 .control——它有焦点时才存在，
  // 所以 Tab 没生效（没匹配上 focus-visible）时这里是「找不到元素」而不是静悄悄读到别的按钮
  const controlRings = pairs.filter(
    (pair) => pair.probe?.read === 'ring' && pair.probe?.selector.startsWith('.control')
  )
  if (controlRings.length > 0) {
    await page.locator('[data-board]').focus()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: '新游戏' })).toBeFocused()
    for (const pair of controlRings) await expectPair(page, pair)
  }

  // 选中环要先开交换拾取再点一枚方块（board.css 的 [data-selected='true']）
  const tileRings = pairs.filter(
    (pair) => pair.probe?.read === 'ring' && pair.probe?.selector.startsWith('.board__tile')
  )
  if (tileRings.length > 0) {
    await page.getByRole('button', { name: '交换' }).click()
    await page.locator('[data-tile-id="1"]').click()
    await expect(page.locator('.board__tile[data-selected="true"]')).toHaveCount(1)
    for (const pair of tileRings) await expectPair(page, pair)
  }
}

test('两套风格的每一对都写着 e2e 认得的 scene（认不得的场景先在这里炸，不被静悄悄跳过）', () => {
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
