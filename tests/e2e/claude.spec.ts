import { expect, test, type Page } from '@playwright/test'
import { createBoardLayout, fitCellSize } from '../../src/renderer/components/BoardLayout'

/**
 * T15 的 Claude 纵向切片：三套风格之外的第三套，从开局界面到局中、从键盘到窄屏。
 *
 * **本文件由 T15 编写但不运行**（跑它的是控制人的统一 sweep）：本次会话被明确要求不启动
 * Playwright、不开任何浏览器。断言全部走 data-* 的 DOM 契约 + 计算样式，不伸进 store。
 *
 * 分工：这一份管「Claude 自己成立吗」——选得到、玩得动、数字用上了衬线、面板不填色、
 * 板面有那一圈线、reduced-motion 与字体失败各有回退、窄屏不横向溢出。
 * 「换风格不动规则状态」在 style-switch.spec.ts，渲染对得上声明在 contrast-computed.spec.ts，
 * 两处都不在这里重复。
 *
 * 确定性来自 `?seed=`（见 useGameStore 的说明）：同一个 seed 得到同一个初始局面与同一条
 * 随机流，所以对照组（一路 Classic）与实验组（Claude）跑同一串按键，终局必须逐格一致。
 */

interface TileSnapshot {
  id: string
  value: number
  rank: number
  slot: number
  row: number
  col: number
}

interface RunSnapshot {
  mode: string
  style: string | null
  score: string
  tiles: TileSnapshot[]
}

/** 从 DOM 还原一局的全部可观测状态（含 data-style：观感也要一起记下来） */
async function readRun(page: Page): Promise<RunSnapshot> {
  const board = page.locator('[data-board]')
  const tiles = page.locator('[data-tile-id]')
  const snapshots: TileSnapshot[] = []
  for (let index = 0; index < (await tiles.count()); index += 1) {
    const tile = tiles.nth(index)
    snapshots.push({
      id: (await tile.getAttribute('data-tile-id')) ?? '',
      value: Number(await tile.getAttribute('data-value')),
      rank: Number(await tile.getAttribute('data-rank')),
      slot: Number(await tile.getAttribute('data-bucket')),
      row: Number(await tile.getAttribute('data-row')),
      col: Number(await tile.getAttribute('data-col')),
    })
  }
  return {
    mode: (await board.getAttribute('data-mode')) ?? '',
    style: await page.locator('main').getAttribute('data-style'),
    score: (await page.locator('[data-score]').textContent()) ?? '',
    tiles: snapshots,
  }
}

async function pickStyle(page: Page, label: string): Promise<void> {
  await page.getByRole('group', { name: '风格' }).getByRole('button', { name: label }).click()
}

/** 收 console error / pageerror；返回的数组必须是空数组 */
function watchProblems(page: Page): string[] {
  const problems: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  return problems
}

const SEED_URL = '/?seed=20260926'

test('开局前选 Claude：选择器列得出、按得动，开局界面就是这一套', async ({ page }) => {
  const problems = watchProblems(page)

  await page.goto(SEED_URL)
  const picker = page.getByRole('group', { name: '风格' })
  await expect(picker.getByRole('button', { name: 'Claude' })).toBeVisible()
  await pickStyle(page, 'Claude')

  // 选中态与外壳上的 data-style 同时跟上：后者是整套换肤机制唯一的钩子
  await expect(picker.getByRole('button', { name: 'Claude' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await expect(page.locator('main')).toHaveAttribute('data-style', 'claude')

  // 开局界面这一屏的元素都得在：标题、分组小标签、模式按钮、开始按钮
  await expect(page.locator('.shell__title')).toHaveText('2048')
  await expect(page.getByRole('button', { name: '开始游戏' })).toBeVisible()
  await expect(page.getByRole('group', { name: '模式' }).getByRole('button')).toHaveCount(6)

  expect(problems).toEqual([])
})

test('Claude 局内可玩：同一 seed 同一串按键，与一路 Classic 的终局逐格一致', async ({ page }) => {
  const problems = watchProblems(page)

  // 对照组：一路 Classic，中间什么都不点
  await page.goto(SEED_URL)
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()
  const controlStart = await readRun(page)
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowDown')
  const controlEnd = await readRun(page)

  // 实验组：开局前选 Claude，进局后局中再切走再切回
  await page.goto(SEED_URL)
  await pickStyle(page, 'Claude')
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()
  await expect(page.locator('main')).toHaveAttribute('data-style', 'claude')

  // 开局局面与对照组逐格一致（style 字段除外：它本来就该不同）
  const start = await readRun(page)
  expect({ ...start, style: null }).toEqual({ ...controlStart, style: null })

  // 局中来回切：观感立刻变，键盘与指针路径照旧
  await pickStyle(page, 'Material')
  await expect(page.locator('main')).toHaveAttribute('data-style', 'material')
  await pickStyle(page, 'Claude')
  await expect(page.locator('main')).toHaveAttribute('data-style', 'claude')

  // 点风格按钮把焦点从棋盘上带走了。方向键只在棋盘是事件目标时才生效——这不是巧合，
  // 是被钉住的契约（game.spec.ts「移动键只在棋盘是预定目标时生效」）。所以按键之前
  // 要把焦点还回棋盘；少了这一行，三个方向键全落在风格按钮上，「同 seed 同按键」就退化成了
  // 「根本没走完序列」
  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowDown')

  // 终局也逐格一致：连新生成方块的位置都一样，说明随机进度没有被换皮碰过
  const end = await readRun(page)
  expect({ ...end, style: null }).toEqual({ ...controlEnd, style: null })
  expect(end.style).toBe('claude')

  expect(problems).toEqual([])
})

test('Claude 的方块数字真的用上了展示衬线（--tile-font-family 这个钩子接到了）', async ({
  page,
}) => {
  // board.css 的 font-family 读的是 --tile-font-family，默认值是 --font-body。所以这个钩子
  // 没接上时的表现是「方块数字与另两套一样是无衬线」——页面照样能跑，只是这套风格
  // 「排版优先」最硬的一条证据没了。这里把它钉住
  await page.goto(SEED_URL)
  await pickStyle(page, 'Claude')
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()

  const tileType = await page
    .locator('[data-tile-id]')
    .first()
    .evaluate((el) => {
      const style = getComputedStyle(el)
      return { family: style.fontFamily, weight: style.fontWeight, numeric: style.fontVariantNumeric }
    })

  // Playfair Display 在最前，回退落在同一字形类别内（Georgia / Times，ADR-0005）
  expect(tileType.family).toContain('Playfair Display')
  expect(tileType.family).toContain('Georgia')
  // 字重 700：把 didone 的细笔画在长数值（0.2 倍格边长 ≈ 20px）上撑住（tokens.css 的说明）
  expect(tileType.weight).toBe('700')
  // 等宽数字照旧声明（Playfair 的 latin 子集不带 tnum，所以它不会真的等宽——这是设计卡 §3
  // 明写的取舍，不是漏写）
  expect(tileType.numeric).toContain('tabular-nums')
})

test('Claude 的外壳不填色：面板透明、控件只有一圈线、板面外那一圈细线在', async ({ page }) => {
  // 这一条是「三套风格在灰度截图里分得开」的结构侧证据（DESIGN.md §9 的指纹表）：
  // Classic 的控件是一块深棕、Material 是一块浅紫，Claude 两处都不填
  await page.goto(SEED_URL)
  await pickStyle(page, 'Claude')
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()

  const panel = await page
    .locator('.panel')
    .first()
    .evaluate((el) => {
      const style = getComputedStyle(el)
      return {
        background: style.backgroundColor,
        borderTopWidth: style.borderTopWidth,
        borderTopColor: style.borderTopColor,
        color: style.color,
      }
    })
  // 面板没有底色（对照 Classic #6f6055 / Material #e8def8），上面那条 1px 细线替它分栏
  expect(panel.background).toBe('rgba(0, 0, 0, 0)')
  expect(panel.borderTopWidth).toBe('1px')
  expect(panel.borderTopColor).toBe('rgb(184, 175, 155)') // --rule #b8af9b
  // 面板文字是正文色，不是亮底方块那种亮字
  expect(panel.color).toBe('rgb(38, 36, 31)')

  const control = await page
    .locator('.control')
    .first()
    .evaluate((el) => {
      const style = getComputedStyle(el)
      return {
        background: style.backgroundColor,
        outlineWidth: style.outlineWidth,
        outlineStyle: style.outlineStyle,
        outlineColor: style.outlineColor,
        outlineOffset: style.outlineOffset,
      }
    })
  // 控件底就是纸面（不填色），边界由 outline 说——用 outline 而不是 border 是为了不进布局。
  // 值照 tokens.css 的 --page / --control-bg（#f0eee6）：这里原来写成 226，是把 e6 抄成了 e2，
  // 与设计卡 §2、contrast.json 量的那 7 对都对不上（三处都是 #f0eee6）
  expect(control.background).toBe('rgb(240, 238, 230)') // --control-bg = --page = #f0eee6
  expect(control.outlineStyle).toBe('solid')
  expect(control.outlineColor).toBe('rgb(133, 124, 109)') // --control-border #857c6d
  expect(control.outlineOffset).toBe('-1px')
  expect(parseFloat(control.outlineWidth)).toBeGreaterThan(0)

  // 板面外那一圈细线：颜色是 --rule，且它**不占布局**——棋盘宽度必须逐像素等于
  // BoardLayout 算出来的那一份（多一像素 border 都会让它变小，实测差值就是 1–2px）。
  //
  // 期望值**现算而不是写死**：原来是 460（12×2 + 100×4 + 12×3，桌面 4×4 的数），
  // 于是这条用例在手机视口上必挂（Pixel 5 上实测 344 = 24 + 71×4 + 36，71 是
  // fitCellSize(4, 393)）。写成算式之后两个视口都成立，而「不多不少」这句断言强度没变。
  const viewportWidth = await page.evaluate(() => window.innerWidth)
  const board = await page.locator('[data-board]').evaluate((el) => {
    const style = getComputedStyle(el)
    return {
      outlineColor: style.outlineColor,
      outlineStyle: style.outlineStyle,
      width: el.getBoundingClientRect().width,
    }
  })
  expect(board.outlineStyle).toBe('solid')
  expect(board.outlineColor).toBe('rgb(184, 175, 155)')
  expect(board.width).toBe(createBoardLayout(4, fitCellSize(4, viewportWidth)).pixelSize)
})

test('选中的那一套换成暖色填充，其余控件仍是纸面', async ({ page }) => {
  // 全壳唯一一处暖色填充是 --control-bg-selected（DESIGN.md §2）
  await page.goto(SEED_URL)
  await pickStyle(page, 'Claude')
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()

  const selected = await page
    .locator('.control[aria-pressed="true"]')
    .first()
    .evaluate((el) => {
      const style = getComputedStyle(el)
      return { background: style.backgroundColor, color: style.color }
    })
  expect(selected.background).toBe('rgb(168, 72, 43)') // #a8482b
  expect(selected.color).toBe('rgb(251, 249, 244)') // --ink-bright

  // 未选中的那些仍是纸面（#f0eee6，见上一条的说明）
  const other = await page
    .locator('.control[aria-pressed="false"]')
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(other).toBe('rgb(240, 238, 230)')
})

test('reduced-motion：位移与淡入归零，方块直接到位', async ({ browser }) => {
  // SPEC §3.2：reduced-motion 要有静态替代。Claude 没有投影也没有缩放，所以它的静态
  // 替代由 board.css 的降级块给：过渡整个关掉 + 三个静止记号。这里断第一条——
  // 「一个动画都不剩」。**逐条判零而不是逐条比长度**：T21 给 .board__tile 加了
  // scale 这条入场用的过渡，过渡列表从两条变三条，「正好两条」不再是可断言的实现细节
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  const page = await context.newPage()
  try {
    await page.goto(SEED_URL)
    await pickStyle(page, 'Claude')
    await page.getByRole('button', { name: '开始游戏' }).click()
    await expect(page.locator('[data-board]')).toBeVisible()

    const tile = await page
      .locator('[data-tile-id]')
      .first()
      .evaluate((el) => {
        const style = getComputedStyle(el)
        return {
          property: style.transitionProperty,
          animation: style.animationName,
          durations: style.transitionDuration.split(',').map((value) => value.trim()),
          visible: el.getBoundingClientRect().width > 0,
        }
      })
    // 过渡整个关掉（board.css 的 reduced-motion 块），于是浏览器把列表收成一条 0s
    for (const duration of tile.durations) expect(parseFloat(duration)).toBe(0)
    // 脉冲与方块动画同样一个都不剩
    expect(tile.animation).toBe('none')
    expect(tile.visible).toBe(true)
  } finally {
    await context.close()
  }
})

test('本机字体失败：落 fallback，而不是永久误报 ready', async ({ page }) => {
  // 验收标准 3 的前半句。Playfair Display 的 latin 子集挡掉——404 的收口必须是 fallback，
  // 而且页面照样可读：字体栈里 Georgia 接在后面（ADR-0005 的同一类别内降级）
  await page.route('**/playfair-display*.woff2', async (route) => {
    await route.abort()
  })

  await page.goto(SEED_URL)
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()
  // 先让 Classic 的 Inter 走完一轮，使「第一次用到某字体」落在 Playfair Display 上
  await expect(page.locator('html')).toHaveAttribute('data-font-state', 'ready')

  await pickStyle(page, 'Claude')
  await expect(page.locator('main')).toHaveAttribute('data-style', 'claude')
  await expect(page.locator('html')).toHaveAttribute('data-font-state', 'fallback', {
    timeout: 5000,
  })

  // 声明本身还在：失败的是本地文件，不是这份风格（回退栈 Georgia 接得住）
  const family = await page
    .locator('[data-tile-id]')
    .first()
    .evaluate((el) => getComputedStyle(el).fontFamily)
  expect(family).toContain('Playfair Display')
  expect(family).toContain('Georgia')
})

test('窄屏（Pixel 5 视口）：三套风格的按钮折成两行，棋盘不横向溢出', async ({ page }) => {
  // 验收标准 2。设计卡 §8：风格选择器按 flex-auto + flex-wrap 折行，不把棋盘挤出屏外
  await page.setViewportSize({ width: 393, height: 727 })
  await page.goto(SEED_URL)
  await pickStyle(page, 'Claude')

  const group = page.getByRole('group', { name: '风格' })
  const buttons = group.getByRole('button')
  await expect(buttons).toHaveCount(3)

  // 三个按钮**要么排进一行、要么折成两行**——两条路都对，本用例要守的是「不撑破容器」
  // （撑破才会把棋盘挤出屏外，那是验收标准 2 真正关心的那件事）。
  //
  // 原来断言「必须占两行」（三个 top 至少有两种）。那是照 Claude 设计卡 §8 的预期写的，
  // 而实测（探针 2026-09-28，393px 视口）：三枚 110.6 + 121.9 + 112.5 = 345.0px，
  // 加 2×8px 间距正好 **361px = 容器宽**——一行刚好放下，余量为 0。
  // 也就是说设计卡那句话与现状不符（已记在 open-items.md B10，未擅自改设计卡）。
  const bounds = await page.evaluate(() => {
    const picker = document.querySelector('[role="group"][aria-label="风格"]')
    if (picker === null) return { groupRight: -1, rights: [] as number[] }
    const groupRight = picker.getBoundingClientRect().right
    const rights = [...picker.querySelectorAll('button')].map(
      (button) => button.getBoundingClientRect().right
    )
    return { groupRight, rights }
  })
  expect(bounds.rights).toHaveLength(3)
  for (const right of bounds.rights) {
    // 半像素容差：getBoundingClientRect 是小数，flex 舍入会差一点点
    expect(right, '风格按钮撑出了选择器容器').toBeLessThanOrEqual(bounds.groupRight + 0.5)
  }

  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()

  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    boardWidth: document.querySelector('[data-board]')?.getBoundingClientRect().width ?? 0,
  }))
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth)
  // 棋盘收在视口内：4×4 在 393px 宽下 fitCellSize 后的那一份
  expect(layout.boardWidth).toBeLessThanOrEqual(layout.clientWidth)
})
