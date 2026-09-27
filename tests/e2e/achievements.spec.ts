import { expect, test, type Page } from '@playwright/test'

/**
 * T18 的 UI 半边：成就解锁提示 + StatsPanel 的已解锁状态。
 *
 * **本文件由 T18 编写、不由 T18 执行**（派发令明令：不准跑 playwright、不准开浏览器，
 * 也不准用任何驱动真实浏览器的 MCP）。期望值来自同一条规则内核的离线推演 + 手工推演，
 * 跑不跑由控制人决定。
 *
 * 局面确定性来自 `?seed=` / `?board=`（开局夹具）：合出 2048 靠人手按键几乎无法复现，
 * 而这里要断言的正是「第一次达标 → 结算 → 解锁」这一路。局面铺好之后，每一步仍然走
 * 真实按键与真实规则内核（run-endings.spec.ts 的 FOUR_1024 同一副盘）。
 *
 * DOM 契约：
 *   · 解锁提示是 `[data-achievement-notice]`，`role="status"`，带一个「知道了」按钮；
 *   · 统计面板是 `[data-stats-panel]`；成就一行一个 `[data-achievement="<id>"]`，
 *     带 `data-unlocked`；
 *   · 「战绩与统计」入口是普通 button，走 Tab 顺序可达（不抢焦点）。
 *
 * **跑不到的两个成就在这里没有用例**：合并机器要 200 次合并、每日坚守要连续 7 个
 * UTC 日期，两者都不是一次 e2e 能造出来的（一个要几百步，一个要改系统日期）。
 * 它们在 tests/unit/achievements.test.ts 里被纯逻辑钉住——分工与其余票一致。
 */

/** 行优先局面 → board 参数值（空串 = 空格） */
function boardQuery(rows: (number | null)[][]): string {
  return rows.flat().map((value) => value ?? '').join(',')
}

/** 开局 URL：固定种子让「移动后的生成」也可预期 */
function startUrl(rows: (number | null)[][], score = 0): string {
  return `/?seed=20260926&board=${boardQuery(rows)}&score=${score}`
}

/** 四个 1024：一次左移合出两个 2048，正好是「第一次达标」（run-endings.spec.ts 同款） */
const FOUR_1024: (number | null)[][] = [
  [1024, 1024, 1024, 1024],
  [null, null, null, null],
  [null, null, null, null],
  [null, null, null, null],
]

/** 收集 console / page 错误：解锁提示是新的渲染路径，React 警告要当场看见 */
function watchProblems(page: Page): string[] {
  const problems: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  return problems
}

/** 打开战绩与统计面板 */
async function openStats(page: Page): Promise<void> {
  await page.getByRole('button', { name: '战绩与统计' }).click()
  await expect(page.locator('[data-stats-panel]')).toBeVisible()
}

test('第一次达标后结算：解锁提示出现一次，说的是首胜', async ({ page }) => {
  const problems = watchProblems(page)
  await page.goto(startUrl(FOUR_1024, 4321))
  await page.getByRole('button', { name: '开始游戏' }).click()

  // 一次左移合出两个 2048：胜利面板出现，而**此刻还没有结算**，所以还没有解锁提示
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('[data-panel="win"]')).toBeVisible()
  await expect(page.locator('[data-achievement-notice]')).toHaveCount(0)

  await page.getByRole('button', { name: '结束并记录' }).click()
  const notice = page.locator('[data-achievement-notice]')
  await expect(notice).toBeVisible()
  await expect(notice).toContainText('首胜')
  // 一次解锁只提示一次：页面上只有一条，不是每个成就一条
  await expect(notice).toHaveCount(1)
  // 4096 这一局没合出来，所以它还在锁着的那一栏里
  await expect(page.locator('[data-achievement="tile-4096"]')).toHaveAttribute(
    'data-unlocked',
    'false'
  )

  expect(problems).toEqual([])
})

test('刷新之后不重播：提示不再出现，而解锁还在', async ({ page }) => {
  const problems = watchProblems(page)
  await page.goto(startUrl(FOUR_1024, 4321))
  await page.getByRole('button', { name: '开始游戏' }).click()
  await page.keyboard.press('ArrowLeft')
  await page.getByRole('button', { name: '结束并记录' }).click()
  await expect(page.locator('[data-achievement-notice]')).toBeVisible()

  // 刷新：`?seed=` / `?board=` 优先于存档（T16），所以先 goto('/') 把参数去掉再 reload
  await page.goto('/')
  await page.reload()
  await expect(page.locator('[data-stats-panel]')).toHaveCount(0)
  // 提示只由「落库前后的差」产生，而 hydrate 只读盘上那份已解锁列表——重播不会发生
  await expect(page.locator('[data-achievement-notice]')).toHaveCount(0)

  // 解锁本身在盘上：刷新之后照旧看得见
  await openStats(page)
  await expect(page.locator('[data-achievement="first-win"]')).toHaveAttribute(
    'data-unlocked',
    'true'
  )
  await expect(page.locator('[data-stat="achievementUnlocks"]')).toHaveText('1')

  expect(problems).toEqual([])
})

test('收起提示不动盘上的解锁', async ({ page }) => {
  await page.goto(startUrl(FOUR_1024, 4321))
  await page.getByRole('button', { name: '开始游戏' }).click()
  await page.keyboard.press('ArrowLeft')
  await page.getByRole('button', { name: '结束并记录' }).click()
  await expect(page.locator('[data-achievement-notice]')).toBeVisible()

  await page.getByRole('button', { name: '知道了' }).click()
  await expect(page.locator('[data-achievement-notice]')).toHaveCount(0)

  await openStats(page)
  await expect(page.locator('[data-achievement="first-win"]')).toHaveAttribute(
    'data-unlocked',
    'true'
  )
})

test('StatsPanel：八个成就各一行，锁着的那一行照实写出条件，键盘可达', async ({ page }) => {
  const problems = watchProblems(page)
  await page.goto('/')
  await page.getByRole('button', { name: '开始游戏' }).click()
  await page.keyboard.press('ArrowLeft')
  await page.getByRole('button', { name: '结束并记录' }).click()

  // 键盘路径：Tab 到「战绩与统计」按钮，回车打开（不抢焦点，走原生 Tab 顺序）
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-stats-panel]')).toBeVisible()

  const rows = page.locator('[data-achievement]')
  // T19 起是八个：七个模式轴 + 风格旅行者
  await expect(rows).toHaveCount(8)
  // 一局死局、没赢过：一个都没解锁，而每一行都把条件写出来
  for (const id of ['first-win', 'mode-collector', 'tile-4096', 'tile-8192', 'quick-hand', 'daily-stand', 'merge-machine', 'style-traveller']) {
    await expect(page.locator(`[data-achievement="${id}"]`)).toHaveAttribute(
      'data-unlocked',
      'false'
    )
  }
  await expect(page.locator('[data-achievement="daily-stand"]')).toContainText(
    '连续 7 个 UTC 日期各结算至少一局 Daily'
  )
  // 收起按钮也是原生 button，Tab 出得去
  await expect(page.getByRole('button', { name: '收起' })).toBeVisible()

  expect(problems).toEqual([])
})
