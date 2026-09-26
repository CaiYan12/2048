import { expect, test, type Page } from '@playwright/test'

/**
 * T08 的 Daily 纵向切片：模式可选、UTC 日期标签、跨 UTC 零点的换题，以及**两次全新
 * 加载给同一张盘**——那是本模式全部的产品承诺。
 *
 * 局面确定性来自两件事，而不是 `?seed=`：
 *   1. 固定时钟。Daily 的题只由 UTC 日期推导，所以每个用例先 `page.clock.install`
 *      装上同一个时刻，再加载页面。**`?seed=` 对 Daily 无效**（见 stores/seed.ts 的
 *      说明：一条 URL 就能换题的话，「同一个 UTC 日期全球同一题」
 *      这句话处处是洞）。
 *   2. `?board=` 开局局面夹具仍在：局面铺好之后每一步仍走真实按键与真实规则内核。
 *
 * 期望值的来历：先用同一套规则内核离线推演这段按键序列（固定时钟 + 固定日期串），
 * 逐格核对之后才写进断言，与 tests/unit/daily.test.ts 钉的是同一批数。
 *
 * 读棋盘的方式：底板格是固定结构且有 data-cell，方块层有 data-tile-id / data-row /
 * data-col / data-value。
 */

/** 固定时钟：UTC 2026-09-26 中午。这一天的日期串就是 '2026-09-26' */
const FIXED_CLOCK = new Date('2026-09-26T12:00:00Z')
const FIXED_DATE = '2026-09-26'

/** 跨过 UTC 零点之后的那一刻：此刻再开新局就该换成 2026-09-27 的题 */
const NEXT_INSTANT = new Date('2026-09-27T00:00:05Z')
const NEXT_DATE = '2026-09-27'

/** 离线推演得到的开局盘面（日期 2026-09-26） */
const OPENING_26: (number | null)[][] = [
  [null, null, null, null],
  [2, null, null, null],
  [null, null, null, null],
  [2, null, null, null],
]

/** 离线推演得到的开局盘面（日期 2026-09-27） */
const OPENING_27: (number | null)[][] = [
  [null, 2, null, null],
  [null, null, null, null],
  [null, null, null, null],
  [2, null, null, null],
]

/** 离线推演：从 2026-09-26 的开局走 左/上/右/下 四步（第一次左移是无效移动） */
const WALK_AFTER_FOUR_KEYS: (number | null)[][] = [
  [null, null, null, null],
  [null, null, null, 2],
  [null, null, null, 4],
  [2, null, null, 2],
]

/** 四个方向键按这个顺序走，与上面的期望棋盘配套 */
const WALK_KEYS: readonly string[] = ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown']

/** 行优先局面 → board 参数值（空串 = 空格） */
function boardQuery(rows: (number | null)[][]): string {
  return rows.flat().map((value) => value ?? '').join(',')
}

/** 开局 URL 带局面：局面铺好之后每一步仍走真实按键与真实规则内核 */
function startUrl(rows: (number | null)[][]): string {
  return `/?board=${boardQuery(rows)}`
}

/** 从 DOM 还原棋盘：棋盘是固定结构，有方块才有 data-tile-id */
async function readBoard(page: Page): Promise<(number | null)[][]> {
  const cellCount = await page.locator('.board__cell').count()
  const size = Math.sqrt(cellCount)
  const grid: (number | null)[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, (): number | null => null)
  )
  const tiles = page.locator('[data-tile-id]')
  for (let index = 0; index < (await tiles.count()); index += 1) {
    const tile = tiles.nth(index)
    const row = Number(await tile.getAttribute('data-row'))
    const col = Number(await tile.getAttribute('data-col'))
    grid[row][col] = Number(await tile.getAttribute('data-value'))
  }
  return grid
}

/** 收集 console / page 错误：Daily 是新的开局路径，React 警告要当场看见 */
function watchProblems(page: Page): string[] {
  const problems: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  return problems
}

/**
 * 页面加载后选 Daily 并开局。
 *
 * 模式没有 URL 入口，所以模式就是开局界面上的那个按钮——点错模式等于拿 classic 的
 * 规则跑 Daily 的日期标签两侧的断言。
 */
async function startDaily(page: Page): Promise<void> {
  await page.getByRole('button', { name: '每日' }).click()
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()
}

/**
 * 装固定时钟 → 全新加载 → 选 Daily → 开局。
 *
 * 时钟必须在 goto **之前**装（Playwright 的约定），否则页面脚本读到的还是真实时间，
 * 「固定日期」就落空了。
 */
async function openDaily(page: Page, url = '/'): Promise<void> {
  await page.clock.install({ time: FIXED_CLOCK })
  await page.goto(url)
  await startDaily(page)
}

/**
 * 再全新加载一次（时钟还在当天，不重新 install）。
 *
 * 用来验「刷新不换题」：种子必须在每一次页面加载时由同样的 UTC 日期重新推出同一个
 * 值，而不是某份只在当次会话里生效的缓存。
 */
async function reloadDaily(page: Page, url = '/'): Promise<void> {
  await page.clock.setSystemTime(FIXED_CLOCK)
  await page.goto(url)
  await startDaily(page)
}

test('开局界面能选每日：五个模式一个不多，日期标签与盘面对上固定时钟', async ({ page }) => {
  const problems = watchProblems(page)
  await page.clock.install({ time: FIXED_CLOCK })
  await page.goto('/')

  // AVAILABLE_MODE_IDS 放宽到正好这五个：未实现的 time-attack 不该以「不可点」的
  // 样子出现在界面上（StartScreen 不从 MODES 过滤）
  const modes = page.getByRole('group', { name: '模式' }).getByRole('button')
  await expect(modes).toHaveText(['经典', '斐波那契', '大棋盘', '障碍', '每日'])

  // 没开局就没有日期标签：它只属于一局 Daily，不是外壳常驻件
  await expect(page.locator('[data-daily-date]')).toHaveCount(0)

  const daily = page.getByRole('button', { name: '每日' })
  await daily.click()
  await expect(daily).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '开始游戏' }).click()

  const board = page.locator('[data-board]')
  await expect(board).toHaveAttribute('data-mode', 'daily')
  await expect(page.locator('[data-score]')).toHaveText('0')
  // 目标就是模式声明的 2048：Daily 与 Classic 规则完全相同
  await expect(
    page.locator('.panel', { hasText: '目标' }).locator('.panel__value')
  ).toHaveText('2048')
  await expect(page.locator('[data-tile-id]')).toHaveCount(2)

  // 日期标签：写的正是这一局抽题那天的 UTC 日期
  const label = page.locator('[data-daily-date]')
  await expect(label).toHaveCount(1)
  await expect(label).toHaveAttribute('data-daily-date', FIXED_DATE)
  await expect(label).toContainText(FIXED_DATE)

  // 盘面与离线推演逐格一致：全球在这一天拿到的是同一张盘
  expect(await readBoard(page)).toEqual(OPENING_26)

  expect(problems).toEqual([])
})

test('固定局面：一次左移合并计分并生成，逐格与离线推演一致', async ({ page }) => {
  const problems = watchProblems(page)
  // 第 0 行 [2,2,4,8]，其余三行铺满且横竖都没有可合并对：一次左移只有这一行会变
  await openDaily(
    page,
    startUrl([
      [2, 2, 4, 8],
      [8, 4, 8, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
    ])
  )

  // 开局即铺满的 16 块；一次左移并两个、生一个，所以还是 16 块
  await expect(page.locator('[data-tile-id]')).toHaveCount(16)
  await expect(page.locator('[data-score]')).toHaveText('0')

  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowLeft')

  await expect(page.locator('[data-score]')).toHaveText('4')
  // [2,2,4,8] → [4,4,8,新]：2+2 合出 4，唯一空出的 (0,3) 由生成填上。
  // 生成值由这一天的随机流决定（钉死的时钟 → 钉死的种子 → 钉死的那个 2）
  expect(await readBoard(page)).toEqual([
    [4, 4, 8, 2],
    [8, 4, 8, 4],
    [4, 2, 4, 2],
    [2, 4, 2, 4],
  ])

  expect(problems).toEqual([])
})

test('同一 UTC 日期内再开一局：题不变，仍是同一张盘', async ({ page }) => {
  const problems = watchProblems(page)
  await openDaily(page)

  await expect(page.locator('[data-tile-id]')).toHaveCount(2)
  const first = await readBoard(page)

  // 同一 UTC 日期里点「新游戏」：Daily 按当前日期重新抽题，题当然还是这一天的题
  await page.getByRole('button', { name: '新游戏' }).click()
  await expect(page.locator('[data-tile-id]')).toHaveCount(2)
  expect(await readBoard(page)).toEqual(first)
  await expect(page.locator('[data-daily-date]')).toHaveAttribute('data-daily-date', FIXED_DATE)

  expect(problems).toEqual([])
})

test('两次全新加载给同一张盘：刷新不换题', async ({ page }) => {
  const problems = watchProblems(page)

  await openDaily(page)
  await expect(page.locator('[data-tile-id]')).toHaveCount(2)
  const first = await readBoard(page)
  const firstLabel = await page.locator('[data-daily-date]').getAttribute('data-daily-date')

  // 第二次全新加载：同一个时钟、重新 goto、重新点模式与开始
  await reloadDaily(page)
  await expect(page.locator('[data-tile-id]')).toHaveCount(2)
  const second = await readBoard(page)
  const secondLabel = await page.locator('[data-daily-date]').getAttribute('data-daily-date')

  expect(first).toEqual(OPENING_26)
  expect(second).toEqual(first)
  expect(secondLabel).toBe(firstLabel)

  expect(problems).toEqual([])
})

test('固定开局走得动：四个方向键之后，盘面按离线推演演进', async ({ page }) => {
  const problems = watchProblems(page)
  await openDaily(page)

  await expect(page.locator('[data-tile-id]')).toHaveCount(2)
  await page.locator('[data-board]').focus()
  for (const key of WALK_KEYS) {
    await page.keyboard.press(key)
  }

  // 第一次左移是无效移动（两块都在第 0 列，压不紧也合不了），所以步数是 3；
  // 唯一一次合并是上移时 (1,0) 的 2 与 (3,0) 的 2 → 4
  await expect(page.locator('[data-score]')).toHaveText('4')
  expect(await readBoard(page)).toEqual(WALK_AFTER_FOUR_KEYS)

  expect(problems).toEqual([])
})

/**
 * 不变式 B 的浏览器形态：跨过 UTC 零点时，**已经开的那一局**一个字都不变。
 *
 * 同一串按键走两遍：A 遍的时钟从头到尾停在 2026-09-26；B 遍走到一半时把时钟推到
 * 2026-09-27 零点之后。两遍的盘面必须逐格相同——已开的局只认自己的 initialSeed，
 * UTC 日期不会被重新咨询。少了对照那一遍，「没变」就只是什么都没发生。
 */
test('跨过 UTC 零点：已开的一局一字不变，新游戏才换成新题', async ({ page }) => {
  const problems = watchProblems(page)

  // A 遍：时钟一路停在当天
  await openDaily(page)
  await page.locator('[data-board]').focus()
  for (const key of WALK_KEYS) {
    await page.keyboard.press(key)
  }
  const uninterrupted = await readBoard(page)
  await expect(page.locator('[data-score]')).toHaveText('4')

  // B 遍：同一次全新加载，时钟先拨回当天，走到一半再跨过零点
  await reloadDaily(page)
  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowUp')
  // 时钟推进到 2026-09-27T00:00:05Z：此时若题库被重新咨询，这一局的后续生成就会变
  await page.clock.setSystemTime(NEXT_INSTANT)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowDown')

  // 已开的局保持原种子：与时钟从未前进的那一遍逐格相同
  expect(await readBoard(page)).toEqual(uninterrupted)
  await expect(page.locator('[data-score]')).toHaveText('4')
  // 标签也还写着这一局抽题那天的日期，不跟着「今天」翻篇
  await expect(page.locator('[data-daily-date]')).toHaveAttribute(
    'data-daily-date',
    FIXED_DATE
  )

  // 新局才换题：此刻开新局，日期与盘面都换成 2026-09-27 的
  await page.getByRole('button', { name: '新游戏' }).click()
  await expect(page.locator('[data-daily-date]')).toHaveAttribute('data-daily-date', NEXT_DATE)
  await expect(page.locator('[data-tile-id]')).toHaveCount(2)
  expect(await readBoard(page)).toEqual(OPENING_27)
  await expect(page.locator('[data-score]')).toHaveText('0')

  expect(problems).toEqual([])
})
