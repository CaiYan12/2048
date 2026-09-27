import { expect, test, type Page } from '@playwright/test'

/**
 * T05 的斐波那契切片：模式可选、按契约的合并表合并、长数字在两种视口下都不溢出。
 *
 * 局面确定性来自 `?seed=` 与 `?board=` 这两条调试入口（见 `useGameStore` /
 * `stores/fixture.ts`）：同一个 seed 得到同一个初始局面与同一条随机流，`?board=`
 * 则把开局局面钉死。**模式没有 URL 入口**——它由开局界面上的按钮决定，所以每个用例
 * 都得先点「斐波那契」再点「开始游戏」（`fixtureFromQuery` 拿到的 modeId 就是这个
 * 按钮传下去的，点错模式等于拿 classic 的表跑斐波那契的局面）。
 *
 * 期望值的来历：先用同一套规则内核离线推演这段按键序列（含每一步的分数与逐格棋盘），
 * 确认无误后才写进断言。长数字那一档的字号是从 `board.css` 的 data-digits 规则反推的
 * （四位数 = 0.27 倍格边长），不是估的；格子边长由 BoardLayout 按视口现算，所以这里
 * 现读现算，两份期望值在桌面与窄屏上各自成立。
 */

/** 开局 URL：固定种子让「移动后的生成」也可预期 */
const FIBONACCI_URL = '/?seed=20260926'

/**
 * 棋盘上的值必须都在斐波那契数列里，这一模式才算真的在跑。
 * 列到 6765 为止：2584 之后继续玩才触得到 4181 / 6765。
 */
const FIBONACCI_VALUES = [
  1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597, 2584, 4181, 6765,
]

/** 行优先局面 → board 参数值（空串 = 空格） */
function boardQuery(rows: (number | null)[][]): string {
  return rows.flat().map((value) => value ?? '').join(',')
}

/** 开局 URL 带局面：局面铺好之后每一步仍走真实按键与真实规则内核 */
function startUrl(rows: (number | null)[][]): string {
  return `/?seed=20260926&board=${boardQuery(rows)}`
}

/** 从 DOM 还原棋盘：棋盘是固定结构，格子在就表示有方块 */
async function readBoard(page: Page): Promise<(number | null)[][]> {
  const cellCount = await page.locator('.board__cell').count()
  const size = Math.sqrt(cellCount)
  const grid: (number | null)[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, (): number | null => null)
  )
  const tiles = page.locator('[data-tile-id]')
  for (let index = 0; index < (await tiles.count()); index++) {
    const tile = tiles.nth(index)
    const row = Number(await tile.getAttribute('data-row'))
    const col = Number(await tile.getAttribute('data-col'))
    grid[row][col] = Number(await tile.getAttribute('data-value'))
  }
  return grid
}

/** 开局前先选模式：e2e 没有模式 URL 入口，模式就是开局界面上的那个按钮 */
async function startFibonacci(page: Page): Promise<void> {
  await page.getByRole('button', { name: '斐波那契' }).click()
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()
}

/** 收集 console / page 错误：模式切换是新的渲染路径，React 警告要当场看见 */
function watchProblems(page: Page): string[] {
  const problems: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  return problems
}

/** 第 0 行 [1,2,3,8]，其余三行铺满且横竖都没有可合并对：一次左移只有这一行会变 */
const LEFT_FIXTURE: (number | null)[][] = [
  [1, 2, 3, 8],
  [8, 2, 8, 2],
  [8, 2, 8, 2],
  [8, 2, 8, 2],
]

/** 同一组数换个方向：[8,1,2,3]。末行多一个 3，是为了让右移之后棋盘还有一步可走，
 *  不至于一步就死局把面板招来（面板兄弟节点挡着，后面的断言会很难写） */
const RIGHT_FIXTURE: (number | null)[][] = [
  [8, 1, 2, 3],
  [8, 2, 8, 2],
  [8, 2, 8, 2],
  [8, 3, 8, 2],
]

/** 目标块 2584 落在 (0,0)，其余格子铺满且无可合并对：专门用来看长数字怎么渲染 */
const LONG_FIXTURE: (number | null)[][] = [
  [2584, 8, 21, 5],
  [8, 1, 8, 1],
  [1, 8, 1, 8],
  [8, 1, 8, 1],
]

test('开局界面能选斐波那契，开始后棋盘与目标都切过去', async ({ page }) => {
  const problems = watchProblems(page)
  await page.goto(FIBONACCI_URL)

  const fibonacci = page.getByRole('button', { name: '斐波那契' })
  await expect(fibonacci).toBeVisible()
  await fibonacci.click()
  await expect(fibonacci).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '开始游戏' }).click()

  const board = page.locator('[data-board]')
  await expect(board).toHaveAttribute('data-mode', 'fibonacci')
  await expect(page.locator('[data-score]')).toHaveText('0')
  // 目标就是契约冻结的 2584，不是 classic 的 2048
  await expect(page.locator('.panel', { hasText: '目标' }).locator('.panel__value')).toHaveText(
    '2584'
  )
  await expect(page.locator('[data-tile-id]')).toHaveCount(2)
  // 与 classic 同一种子同一条随机流，只有取值不同：低值 1、高值 2
  expect(await readBoard(page)).toEqual([
    [null, null, null, null],
    [null, null, null, null],
    [1, null, null, null],
    [null, null, null, 2],
  ])

  expect(problems).toEqual([])
})

test('固定局面：从左扫 1+2 得 3，产物不再与后面的 8 合并', async ({ page }) => {
  const problems = watchProblems(page)
  await page.goto(startUrl(LEFT_FIXTURE))
  await startFibonacci(page)

  // 开局即铺好的 16 块；一次左移并两个、生一个，所以还是 16 块
  await expect(page.locator('[data-tile-id]')).toHaveCount(16)
  await expect(page.locator('[data-score]')).toHaveText('0')

  await page.keyboard.press('ArrowLeft')

  await expect(page.locator('[data-score]')).toHaveText('3')
  // [1,2,3,8] → [3,3,8,新]：1+2=3 是产物，它跳过了右边的 8（3+8 不相邻），
  // 后面的 3 与 8 也各自落位。新方块 1 落在唯一的空格 (0,3)
  expect(await readBoard(page)).toEqual([
    [3, 3, 8, 1],
    [8, 2, 8, 2],
    [8, 2, 8, 2],
    [8, 2, 8, 2],
  ])

  expect(problems).toEqual([])
})

test('固定局面：从右扫 2+3 得 5——同一组数换个方向，合并对就不同', async ({ page }) => {
  const problems = watchProblems(page)
  await page.goto(startUrl(RIGHT_FIXTURE))
  await startFibonacci(page)

  await page.keyboard.press('ArrowRight')

  await expect(page.locator('[data-score]')).toHaveText('5')
  // [8,1,2,3] → [新,8,1,5]：从右边缘扫，先撞上的是 3 与 2 → 2+3=5 是产物。
  // 这一条是「操作数顺序」裁决的判别用例：按 lane 自然序传参才拿得到 (2,3)，
  // 换成「离目标边近的在前」就会拿 (3,2)，单向表配不上、合并漏掉、分数停在 0。
  // 左移那条证不了这件事——左移时两个方向下拿到的都是 (1,2)。
  expect(await readBoard(page)).toEqual([
    [1, 8, 1, 5],
    [8, 2, 8, 2],
    [8, 2, 8, 2],
    [8, 3, 8, 2],
  ])

  expect(problems).toEqual([])
})

test('长数字 2584：四位数档的字号与不溢出，桌面窄屏都过', async ({ page }) => {
  const problems = watchProblems(page)
  await page.goto(startUrl(LONG_FIXTURE))
  await startFibonacci(page)

  const tile = page.locator('[data-tile-id][data-value="2584"]')
  await expect(tile).toHaveCount(1)
  await expect(tile).toHaveText('2584')
  // 位数是 board.css 选字号档的唯一依据
  await expect(tile).toHaveAttribute('data-digits', '4')

  // 格子边长由 BoardLayout 按视口现算（桌面 100px、Pixel 5 的 393px 视口 71px），
  // 所以期望的字体大小也现读现算，不写死一个数
  const cellSize = await page
    .locator('[data-board]')
    .evaluate((el) => parseFloat(getComputedStyle(el).getPropertyValue('--cell-size')))
  const metrics = await tile.evaluate((el) => ({
    fontSize: parseFloat(getComputedStyle(el).fontSize),
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }))
  // board.css 的 data-digits='4' 档就是 0.27 倍格边长
  expect(Math.abs(metrics.fontSize - cellSize * 0.27)).toBeLessThan(0.5)
  // 四位数不许挤出格子：TileView 就是一个格子见方的盒子，字宽超过它就会横向溢出
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth)

  // 一位数那档（0.45 倍）必须明显更大：证明确实按位数换了档，
  // 而不是所有方块都落在同一个默认字号上
  const singleDigit = await page
    .locator('[data-tile-id][data-digits="1"]')
    .first()
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
  expect(singleDigit).toBeGreaterThan(metrics.fontSize)

  expect(problems).toEqual([])
})

test('斐波那契模式走得动：六次方向键之后，盘面仍然是斐波那契数', async ({ page }) => {
  const problems = watchProblems(page)
  await page.goto(FIBONACCI_URL)
  await startFibonacci(page)

  const opening = await readBoard(page)
  for (const key of ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft']) {
    await page.keyboard.press(key)
  }

  // 逐格期望值由同一套内核离线推演：14 = 3+3+3+5（四次合并的产物数值）
  await expect(page.locator('[data-score]')).toHaveText('14')
  const played = await readBoard(page)
  expect(played).toEqual([
    [5, null, null, 1],
    [3, null, null, null],
    [3, null, null, null],
    [null, null, null, null],
  ])
  expect(played).not.toEqual(opening)

  // 六步之内盘面上出现的每个值都必须是斐波那契数——这是这一模式与 classic 的
  // 可观察分界：classic 走完同样的按键会出现 4，这里一个 4 都不该有
  for (const row of played) {
    for (const value of row) {
      if (value === null) continue
      expect(FIBONACCI_VALUES, `盘面上的 ${value}`).toContain(value)
    }
  }

  expect(problems).toEqual([])
})
