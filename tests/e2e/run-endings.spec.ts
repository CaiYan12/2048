import { expect, test, type Page } from '@playwright/test'

/**
 * T04 的终局路径：胜利→继续、死局→结算、新游戏不沿用旧局面、面板按钮不吃方向键。
 *
 * 局面确定性来自 `?board=`（开局夹具，见 src/renderer/stores/fixture.ts）与
 * `?seed=` 这两条调试入口——胜利与死局靠人手按键几乎无法复现，而这里要断言的
 * 恰恰是这两条路径。局面铺好之后，每一步仍然走真实按键与真实规则内核。
 *
 * 期望值的来历：先用同一套规则内核离线推演这段按键序列，再逐格核对手势，
 * 确认无误后才写进断言。
 */

/** 行优先局面 → board 参数值（空串 = 空格） */
function boardQuery(rows: (number | null)[][]): string {
  return rows.flat().map((value) => value ?? '').join(',')
}

/** 开局 URL：固定种子让「移动后的生成」也可预期 */
function startUrl(rows: (number | null)[][], score = 0, seed = 20260926): string {
  return `/?seed=${seed}&board=${boardQuery(rows)}&score=${score}`
}

/** 四个 1024：一次左移合出两个 2048，正好是「第一次达标」 */
const FOUR_1024: (number | null)[][] = [
  [1024, 1024, 1024, 1024],
  [null, null, null, null],
  [null, null, null, null],
  [null, null, null, null],
]

/** 局面里已经有 2048：再合出一个目标块不该重新弹胜利面板 */
const ALREADY_WON: (number | null)[][] = [
  [2048, 1024, 1024, null],
  [null, null, null, null],
  [null, null, null, null],
  [null, null, null, null],
]

/**
 * 一步即死局：第 0 行右端留一个空格，右移把它整体推过去。
 * 空出来的是 (0,0)，生成那一格后 16 格全满且横向纵向相邻都不相等。
 * (0,0) 的邻居全是 8，所以生成 2 还是 4 都死局——这一条路径不依赖随机进度。
 */
const ONE_STEP_FROM_DEADLOCK: (number | null)[][] = [
  [8, 2, 4, null],
  [8, 2, 4, 8],
  [2, 4, 8, 2],
  [4, 8, 2, 4],
]

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

/** 收集 console / page 错误：终局面板是新的渲染路径，React 警告要当场看见 */
function watchProblems(page: Page): string[] {
  const problems: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  return problems
}

test('胜利 → 继续玩：分数与棋盘一个格子都不动，之后仍能接着走', async ({ page }) => {
  const problems = watchProblems(page)
  await page.goto(startUrl(FOUR_1024, 4321))
  await page.getByRole('button', { name: '开始游戏' }).click()

  const panel = page.locator('[data-panel="win"]')
  // 开局只是四个 1024：还没达标，所以胜利面板不存在
  await expect(panel).toHaveCount(0)
  await expect(page.locator('[data-score]')).toHaveText('4321')

  // 一次左移合出两个 2048：+2048 +2048，生成落在 (2,3)
  await page.keyboard.press('ArrowLeft')
  await expect(panel).toBeVisible()
  await expect(page.locator('[data-score]')).toHaveText('8417')
  expect(await readBoard(page)).toEqual([
    [2048, 2048, null, null],
    [null, null, null, null],
    [null, null, null, 2],
    [null, null, null, null],
  ])

  // 继续玩：面板消失，分数与棋盘原样保留
  const boardAtWin = await readBoard(page)
  await page.getByRole('button', { name: '继续玩' }).click()
  await expect(panel).toHaveCount(0)
  await expect(page.locator('[data-score]')).toHaveText('8417')
  expect(await readBoard(page)).toEqual(boardAtWin)

  // 接着走真的还能走：两个 2048 合成 4096，且**不再**弹胜利面板
  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowLeft')
  expect(await readBoard(page)).not.toEqual(boardAtWin)
  await expect(page.locator('[data-panel]')).toHaveCount(0)
  // 12513 = 8417 + 4096（两个 2048 合成一个 4096）；新生成的 4 落在 (0,3)
  await expect(page.locator('[data-score]')).toHaveText('12513')

  expect(problems).toEqual([])
})

test('已经达标过的局面再合出目标块：胜利面板不回来', async ({ page }) => {
  const problems = watchProblems(page)
  await page.goto(startUrl(ALREADY_WON, 100))
  await page.getByRole('button', { name: '开始游戏' }).click()

  // 局面里已经有 2048（reachedTarget = true），phase 仍是 playing
  await expect(page.locator('[data-panel]')).toHaveCount(0)

  await page.keyboard.press('ArrowLeft')

  // 又合出一个 2048，但面板不弹：胜利状态一局只显示一次
  await expect(page.locator('[data-panel]')).toHaveCount(0)
  expect((await readBoard(page))[0].slice(0, 2)).toEqual([2048, 2048])
  await expect(page.locator('[data-score]')).toHaveText('2148')

  expect(problems).toEqual([])
})

test('死局 → 结束并记录 → 原因可读 → 新游戏是干净的开局', async ({ page }) => {
  const problems = watchProblems(page)
  await page.goto(startUrl(ONE_STEP_FROM_DEADLOCK))
  await page.getByRole('button', { name: '开始游戏' }).click()

  // 一次右移把棋盘填满：四方向都无合法移动
  await page.keyboard.press('ArrowRight')

  const panel = page.locator('[data-panel="gameover"]')
  await expect(panel).toBeVisible()
  // 死局还没结算：没有结束原因（结束原因只在 ended 上出现）
  expect(await panel.getAttribute('data-end-reason')).toBeNull()
  await expect(panel).toContainText('四方向都无合法移动')
  // 16 格全满
  await expect(page.locator('[data-tile-id]')).toHaveCount(16)
  expect(await readBoard(page)).toEqual([
    [2, 8, 2, 4],
    [8, 2, 4, 8],
    [2, 4, 8, 2],
    [4, 8, 2, 4],
  ])

  // 结束并记录：面板还在，但原因变成可读的 deadlock
  await page.getByRole('button', { name: '结束并记录' }).click()
  await expect(panel).toBeVisible()
  await expect(panel).toHaveAttribute('data-end-reason', 'deadlock')
  await expect(panel.getByRole('heading')).toHaveText('本局已结束')
  await expect(panel).toContainText('死局')

  // 新游戏：面板退下，棋盘是一张干净的开局，分数归零
  await page.getByRole('button', { name: '新游戏' }).click()
  await expect(panel).toHaveCount(0)
  await expect(page.locator('[data-score]')).toHaveText('0')
  await expect(page.locator('[data-tile-id]')).toHaveCount(2)

  expect(problems).toEqual([])
})

test('活跃局直接点新游戏：放弃本局，不沿用任何旧格子与旧分数', async ({ page }) => {
  const problems = watchProblems(page)
  await page.goto(startUrl(FOUR_1024, 5000))
  await page.getByRole('button', { name: '开始游戏' }).click()

  await expect(page.locator('[data-score]')).toHaveText('5000')
  await expect(page.locator('[data-tile-id]')).toHaveCount(4)
  // 活跃局的「新游戏」在棋盘外面，且此刻它是页面上唯一一个
  await page.getByRole('button', { name: '新游戏' }).click()

  await expect(page.locator('[data-score]')).toHaveText('0')
  const tiles = page.locator('[data-tile-id]')
  await expect(tiles).toHaveCount(2)
  // 旧局面里的 1024 一个都不剩
  for (let index = 0; index < 2; index++) {
    const value = await tiles.nth(index).getAttribute('data-value')
    expect(Number(value)).toBeLessThan(1024)
  }
  // 也没有面板跟着出来：新局是 playing，不是被放弃的那个终态
  await expect(page.locator('[data-panel]')).toHaveCount(0)

  expect(problems).toEqual([])
})

test('面板按钮上的方向键不动棋盘，收起面板后同一个键立刻生效', async ({ page }) => {
  const problems = watchProblems(page)
  await page.goto(startUrl(FOUR_1024, 4321))
  await page.getByRole('button', { name: '开始游戏' }).click()
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('[data-panel="win"]')).toBeVisible()

  const boardAtWin = await readBoard(page)
  await expect(page.locator('[data-score]')).toHaveText('8417')

  // 焦点落在面板按钮上，四个方向键 + WASD 一概不动棋盘。
  // 注意：这不是在验 Board 里那个 isInteractiveTarget 守卫——面板是 .board 的**兄弟**
  // （ADR-0002 的固定 DOM 不许往棋盘里塞东西），从按钮出发的 keydown 根本冒泡不到
  // Board 的 handler，守卫压根没被问过。这里断言的是「面板挡着时按键推不动棋盘」这个
  // 用户可见的事实，别把标题写成守卫。
  await page.getByRole('button', { name: '继续玩' }).focus()
  for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'w', 'd']) {
    await page.keyboard.press(key)
  }
  expect(await readBoard(page)).toEqual(boardAtWin)
  await expect(page.locator('[data-score]')).toHaveText('8417')
  await expect(page.locator('[data-panel="win"]')).toBeVisible()

  // 键没坏：面板挡着的时候确实什么都按不动（move 对 won 一律拒绝），所以要证明
  // 「上面没动不是键坏了」就得先收起面板——点「继续玩」回到 playing，胜负盘一个格子不动。
  await page.getByRole('button', { name: '继续玩' }).click()
  await expect(page.locator('[data-panel="win"]')).toHaveCount(0)
  expect(await readBoard(page)).toEqual(boardAtWin)

  // 回到 playing 之后，棋盘上同一个键立刻生效
  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowLeft')
  expect(await readBoard(page)).not.toEqual(boardAtWin)

  expect(problems).toEqual([])
})
