import { expect, test, type Page } from '@playwright/test'

/**
 * T13 的风格切换纵向切片：material ⇄ classic 在局中来回切换，规则状态一个字节都不动。
 *
 * **本文件由 T13 编写但不运行**（跑它的是控制人的统一 sweep）：跑它要先 build + preview，
 * 而本次会话被明确要求不启动 Playwright、不开任何浏览器。断言全部走 data-* 的 DOM 契约
 * （task-3-interfaces §7b）+ 计算样式，不伸进 store 改状态。
 *
 * 确定性来自 `?seed=`（见 useGameStore 的说明）：同一个 seed 得到同一个初始局面与同一条
 * 随机流。所以**同一套按键序列跑两遍**——一遍完全不换风格、一遍来回切换三次——
 * 两次的终局必须逐格一致。这一条同时证明了随机进度没有被动过：新生成的那颗方块
 * 落在哪一格，只有 rngState 能决定。
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
  score: string
  tiles: TileSnapshot[]
}

/** 从 DOM 还原一局的全部可观测状态 */
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
    score: (await page.locator('[data-score]').textContent()) ?? '',
    tiles: snapshots,
  }
}

/** 选择器上按名字点一套风格 */
async function pickStyle(page: Page, label: string): Promise<void> {
  await page.getByRole('group', { name: '风格' }).getByRole('button', { name: label }).click()
}

/** 开局（同一条 seed），可选地在开局前先选风格 */
async function startRun(page: Page, url: string): Promise<void> {
  await page.goto(url)
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()
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

test('开局前选 Material，进局后选 Classic，棋盘与分数一个字段都不动', async ({ page }) => {
  const problems = watchProblems(page)

  await page.goto(SEED_URL)
  // 开局前选风格：选择器读的是 store，所以这里选的就是这一局要用的
  await pickStyle(page, 'Material')
  await expect(page.locator('main')).toHaveAttribute('data-style', 'material')
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()
  await expect(page.locator('main')).toHaveAttribute('data-style', 'material')

  const before = await readRun(page)

  // 局中切回 Classic：外观立刻变，规则状态不变
  await pickStyle(page, 'Classic')
  await expect(page.locator('main')).toHaveAttribute('data-style', 'classic')

  // 逐字段断言（不是「分数没变」）：身份、数值、阶梯位、色档、行列、分数、模式全在内
  expect(await readRun(page)).toEqual(before)

  expect(problems).toEqual([])
})

test('material → classic → material 与完全不切换的同一 seed 同一按键序列结果一致', async ({
  page,
}) => {
  const problems = watchProblems(page)

  // 对照组：一路 Classic，中间什么都不点
  await startRun(page, SEED_URL)
  const controlStart = await readRun(page)
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowDown')
  const controlEnd = await readRun(page)

  // 实验组：同一 seed、同一套按键，只在按键之前来回切换三次
  await startRun(page, SEED_URL)
  await pickStyle(page, 'Material')
  await expect(page.locator('main')).toHaveAttribute('data-style', 'material')
  await pickStyle(page, 'Classic')
  await pickStyle(page, 'Material')
  await expect(page.locator('main')).toHaveAttribute('data-style', 'material')

  // 开局局面与对照组逐格一致
  expect(await readRun(page)).toEqual(controlStart)

  // 点风格按钮把焦点从棋盘上带走了。方向键只在棋盘是事件目标时才生效——这不是巧合，
  // 是被钉住的契约（game.spec.ts「移动键只在棋盘是预定目标时生效」：焦点不在棋盘上时
  // 同一个键不许推动棋盘）。所以按键序列之前要先把焦点还回棋盘，仓库里每个走键盘的
  // 用例都是这么办的（swap.spec.ts 的 :183 / :240 / :438）。
  // 对照组不需要这一步：它点完「开始游戏」就直接由 Board 的挂载 effect 拿到了焦点。
  // 少了这一行，三个方向键全都落在风格按钮上、一个 Move 都不产生，
  // 「同 seed 同按键序列」这条就退化成了「根本没走完序列」
  await page.locator('[data-board]').focus()

  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowDown')

  // 终局也逐格一致：连新生成方块的位置都一样，说明随机进度没有被换皮碰过
  expect(await readRun(page)).toEqual(controlEnd)
  expect(await readRun(page)).not.toEqual(controlStart)

  expect(problems).toEqual([])
})

test('风格选择器只列注册表里的两套，没有第三套', async ({ page }) => {
  // 开局界面
  await page.goto(SEED_URL)
  const startPicker = page.getByRole('group', { name: '风格' })
  await expect(startPicker.getByRole('button')).toHaveCount(2)
  await expect(startPicker.getByRole('button', { name: 'Classic' })).toBeVisible()
  await expect(startPicker.getByRole('button', { name: 'Material' })).toBeVisible()

  // 局中：同一个组件、同一份注册表
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()
  const runPicker = page.getByRole('group', { name: '风格' })
  await expect(runPicker.getByRole('button')).toHaveCount(2)

  // 选中态跟着 data-style 走（aria-pressed 同时喂给 .control[aria-pressed='true'] 的配色）
  await expect(runPicker.getByRole('button', { name: 'Classic' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await pickStyle(page, 'Material')
  await expect(runPicker.getByRole('button', { name: 'Material' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await expect(page.locator('main')).toHaveAttribute('data-style', 'material')
})

test('同一副棋盘在两套风格下渲染出不同的方块色，且 Classic 逐字节不变', async ({ page }) => {
  const problems = watchProblems(page)

  // ?board= 铺一副带齐 11 档 + beyond 的棋盘：2,4,8,…,2048,4096 加四个空格。
  // 这一步是「Classic 逐字节不变」的证明——重构前 board.css 按 data-value 取这 12 个色值，
  // 重构后按 data-bucket 取，两者必须一个都不串
  const ladderBoard = '2,4,8,16,32,64,128,256,512,1024,2048,4096,,,,'
  await page.goto(`/?board=${ladderBoard}`)
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()

  /** 数值 → Classic tokens.css 里那个色值的计算值 */
  const classicColours: Record<string, string> = {
    '2': 'rgb(238, 228, 218)',
    '4': 'rgb(237, 224, 200)',
    '8': 'rgb(194, 98, 44)',
    '16': 'rgb(181, 86, 31)',
    '32': 'rgb(165, 74, 28)',
    '64': 'rgb(149, 63, 24)',
    '128': 'rgb(145, 106, 14)',
    '256': 'rgb(138, 104, 13)',
    '512': 'rgb(133, 100, 11)',
    '1024': 'rgb(124, 93, 10)',
    '2048': 'rgb(108, 81, 9)',
    '4096': 'rgb(74, 68, 63)',
  }

  const colours = async (): Promise<Record<string, string>> => {
    const found: Record<string, string> = {}
    const tiles = page.locator('[data-tile-id]')
    for (let index = 0; index < (await tiles.count()); index += 1) {
      const tile = tiles.nth(index)
      const value = (await tile.getAttribute('data-value')) ?? ''
      found[value] = await tile.evaluate((el) => getComputedStyle(el).backgroundColor)
    }
    return found
  }

  // 每个数值都落在 tokens.css 声明的那个色值上（含 4096 归 beyond）
  expect(await colours()).toEqual(classicColours)

  // 换到 Material：同一副棋盘，色值全变
  const materialColours = await (async () => {
    await pickStyle(page, 'Material')
    await expect(page.locator('main')).toHaveAttribute('data-style', 'material')
    return colours()
  })()
  for (const [value, colour] of Object.entries(classicColours)) {
    expect(materialColours[value], `value ${value}`).not.toBe(colour)
  }
  // 且每一格都真的有着落：透明说明掉出了阶梯
  for (const [value, colour] of Object.entries(materialColours)) {
    expect(colour, `value ${value}`).not.toBe('rgba(0, 0, 0, 0)')
  }

  // 换回 Classic：色值回到重构前那一张表，一个都不漂
  await pickStyle(page, 'Classic')
  expect(await colours()).toEqual(classicColours)

  expect(problems).toEqual([])
})

test('data-rank 是阶梯位置、data-bucket 是色档：两套语义不混', async ({ page }) => {
  const problems = watchProblems(page)

  // 斐波那契 17 级阶梯压到 11 档：rank 一路到 17，bucket 只到 11。
  // **必须先点「斐波那契」再开局**：模式没有 URL 入口（fibonacci.spec.ts 的文件头
  // 写明了理由），不点就是默认的 classic——而盘面上这些值一个都不在 classic 的
  // 11 级阶梯里，整盘会落到 beyond 档，这张表证的就不是斐波那契的分档算术了
  const fibBoard = '1,2,3,5,8,13,21,34,55,89,144,233,377,610,987,1597'
  await page.goto(`/?board=${fibBoard}`)
  await page.getByRole('button', { name: '斐波那契' }).click()
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()

  const tiles = page.locator('[data-tile-id]')
  await expect(tiles).toHaveCount(16)
  const seen: Array<{ value: number; rank: number; slot: number }> = []
  for (let index = 0; index < 16; index += 1) {
    const tile = tiles.nth(index)
    seen.push({
      value: Number(await tile.getAttribute('data-value')),
      rank: Number(await tile.getAttribute('data-rank')),
      slot: Number(await tile.getAttribute('data-bucket')),
    })
  }

  // 2584 不在盘面上（?board= 只铺 16 格），这里验证的是 17 级阶梯前 16 项的映射
  expect(seen.map((tile) => [tile.value, tile.rank, tile.slot])).toEqual([
    [1, 1, 1],
    [2, 2, 2],
    [3, 3, 2],
    [5, 4, 3],
    [8, 5, 4],
    [13, 6, 4],
    [21, 7, 5],
    [34, 8, 6],
    [55, 9, 6],
    [89, 10, 7],
    [144, 11, 8],
    [233, 12, 8],
    [377, 13, 9],
    [610, 14, 10],
    [987, 15, 10],
    [1597, 16, 11],
  ])

  // 11 个色档全用上，rank 却一路到 16：两个语义确实分开。bucket 会撞车（3 与 5 同档、
  // 13 与 21 同档），rank 从不撞车——把两者混成一个数字，撞车的那几行会立刻看得出来
  const slots = new Set(seen.map((tile) => tile.slot))
  expect(slots.size).toBeLessThan(seen.length)
  expect(Math.max(...seen.map((tile) => tile.slot))).toBe(11)
  expect(new Set(seen.map((tile) => tile.rank)).size).toBe(seen.length)

  expect(problems).toEqual([])
})

test('换风格不影响计时：限时模式的倒计时照旧走', async ({ page }) => {
  const problems = watchProblems(page)
  await page.goto('/?seed=20260926')
  // 先定模式再定风格，然后开局（开局界面还能改，进了局就只剩棋盘了）
  await page.getByRole('group', { name: '模式' }).getByRole('button', { name: '限时' }).click()
  await pickStyle(page, 'Material')
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-countdown]')).toBeVisible()
  await expect(page.locator('main')).toHaveAttribute('data-style', 'material')

  // deadline 是绝对时间戳，无法逐格比对，所以只断方向：换皮不许把它推走
  const first = await page.locator('[data-countdown]').textContent()
  await pickStyle(page, 'Classic')
  const second = await page.locator('[data-countdown]').textContent()
  expect(parseSeconds(second)).toBeLessThanOrEqual(parseSeconds(first))

  expect(problems).toEqual([])
})

/** '2:59' → 秒数 */
function parseSeconds(label: string | null): number {
  const [minutes, seconds] = (label ?? '0:00').split(':').map(Number)
  return minutes * 60 + seconds
}
