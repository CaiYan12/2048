import { expect, test, type Page } from '@playwright/test'

/**
 * 成就的 UI 半边（ADR-0007）：解锁当场浮出当前风格的祝贺 + 战绩面板上的静态清单。
 *
 * **祝贺当场出现**——不是在结算那一刻：成就跟着对局状态走，合出目标块的那一步就解锁了
 * （用户故事 1「acknowledgement lands while the move that earned it is still on screen」）。
 * 所以这里在「结束并记录」之前就断言它已经在屏幕上。
 *
 * DOM 契约：
 *   · 祝贺是 `[data-toast]`，容器 `[data-toast-stack]`，`role="status"`，**没有**任何按钮
 *     （它自己会走，不是一件要玩家处理的事）；
 *   · 统计面板是 `[data-stats-panel]`；成就一行一个 `[data-achievement="<id>"]`，
 *     **不带任何解锁状态**——那块面板看不到眼前的棋盘，「已解锁 N」它答不上来；
 *   · 「战绩与统计」入口走普通 Tab 顺序（不抢焦点）。
 *
 * 局面确定性来自 `?seed=` / `?board=`（开局夹具）。跑不到的两个成就在这里没有用例：
 * 合并机器要 200 次合并、风格旅行者要切五次风格（后者在 style-traveller.spec.ts），
 * 它们在 tests/unit/ 里被纯逻辑钉住。
 */

/** 行优先局面 → board 参数值（空串 = 空格） */
function boardQuery(rows: (number | null)[][]): string {
  return rows.flat().map((value) => value ?? '').join(',')
}

/** 开局 URL：固定种子让「移动后的生成」也可预期 */
function startUrl(rows: (number | null)[][], score = 0): string {
  return `/?seed=20260926&board=${boardQuery(rows)}&score=${score}`
}

/** 四个 1024：一次左移合出两个 2048，正好是「第一次达标」 */
const FOUR_1024: (number | null)[][] = [
  [1024, 1024, 1024, 1024],
  [null, null, null, null],
  [null, null, null, null],
  [null, null, null, null],
]

/**
 * 一步即死局：第 0 行右端留一个空格，右移把它填满，四方向皆无合法移动
 * （与 records.spec.ts / run-endings.spec.ts 同款局面）。
 */
const ONE_STEP_FROM_DEADLOCK: (number | null)[][] = [
  [8, 2, 4, null],
  [8, 2, 4, 8],
  [2, 4, 8, 2],
  [4, 8, 2, 4],
]

/**
 * 第 0 行只有一对 2，其余三行都排成互不相邻相等：一次左移恰好完成**一次**合并，
 * 离目标块（2048）还远得很——用来验「首次合并」这个最早能拿到的里程碑。
 */
const ONE_PAIR: (number | null)[][] = [
  [2, 2, null, null],
  [4, 8, 16, 32],
  [64, 128, 256, 512],
  [2, 4, 8, 16],
]

/** 收集 console / page 错误：祝贺是新的渲染路径，React 警告要当场看见 */
function watchProblems(page: Page): string[] {
  const problems: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  return problems
}

/** 打开战绩与统计面板（它是个开关，已经开着就不再点） */
async function openStats(page: Page): Promise<void> {
  const panel = page.locator('[data-stats-panel]')
  if (!(await panel.isVisible())) {
    await page.getByRole('button', { name: '战绩与统计' }).click()
  }
  await expect(panel).toBeVisible()
}

test('达标那一刻就祝贺，不用等到结算', async ({ page }) => {
  const problems = watchProblems(page)
  await page.goto(startUrl(FOUR_1024, 4321))
  await page.getByRole('button', { name: '开始游戏' }).click()

  // 一次左移合出两个 2048：胜利面板出现，而**此刻还没有结算**——祝贺已经在了
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('[data-panel="win"]')).toBeVisible()
  const item = page.locator('[data-toast]')
  await expect(item).toHaveCount(1)
  await expect(item).toContainText('首胜')
  // 那一步同时是这一局的第一次合并，所以「首次合并」也在同一条祝贺里
  await expect(item).toContainText('首次合并')
  await expect(item).toHaveAttribute('role', 'status')
  // 它是「一条会自己走的提示」，不是一件要玩家处理的事：没有任何按钮
  await expect(item.getByRole('button')).toHaveCount(0)
  await expect(page.locator('[data-achievement-notice]')).toHaveCount(0)

  await page.getByRole('button', { name: '结束并记录' }).click()
  // 结算之后不再多出一条：解锁只发生一次，祝贺也只响一次
  await expect(item).toHaveCount(1)

  expect(problems).toEqual([])
})

test('第一次合并就解锁「首次合并」：随便开一局也能马上看到祝贺', async ({ page }) => {
  const problems = watchProblems(page)
  await page.goto(startUrl(ONE_PAIR))
  await page.getByRole('button', { name: '开始游戏' }).click()
  // 开局那一刻一条都没有：这个成就是**这一步**做出来的
  await expect(page.locator('[data-toast]')).toHaveCount(0)

  await page.keyboard.press('ArrowLeft')

  const item = page.locator('[data-toast]')
  await expect(item).toHaveCount(1)
  await expect(item).toContainText('首次合并')
  // 图标是注册表给的那一个（设计卡 §10 的两行结构：上行图标 + 名字，下行风格的声音）
  await expect(item.locator('.toast__emoji')).toHaveText('🧩')
  await expect(item.locator('.toast__note')).toContainText('解锁成就')
  // 这一步没达标、也没合出 4096：祝贺里只有它一个（不是「顺手带出来一堆」）
  await expect(item).not.toContainText('首胜')

  // 面板上七个成就，第一个就是它（注册表次序 = 展示次序）
  await openStats(page)
  const rows = page.locator('[data-achievement]')
  await expect(rows).toHaveCount(7)
  await expect(rows.first()).toContainText('首次合并')
  expect(problems).toEqual([])
})

test('刷新之后不重播，而这一局连同它已经拿到的东西一起回来', async ({ page }) => {
  const problems = watchProblems(page)
  await page.goto(startUrl(FOUR_1024, 4321))
  await page.getByRole('button', { name: '开始游戏' }).click()
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('[data-toast]')).toHaveCount(1)

  // 刷新：`?seed=` / `?board=` 优先于存档（T16），所以先 goto('/') 把参数去掉再 reload。
  // 这一局还在 won（没结算），所以它会被恢复出来；而恢复**建立静默基线**——
  // 集合照算，一条祝贺都不补放（单局成就规格的架构决策 12）
  await page.goto('/')
  await page.reload()
  await expect(page.locator('[data-board]')).toBeVisible()
  await expect(page.locator('[data-toast]')).toHaveCount(0)

  expect(problems).toEqual([])
})

test('祝贺自己走掉，玩家一个按钮都不用按', async ({ page }) => {
  const problems = watchProblems(page)
  await page.goto(startUrl(FOUR_1024, 4321))
  await page.getByRole('button', { name: '开始游戏' }).click()
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('[data-toast]')).toHaveCount(1)

  await expect(page.locator('[data-toast]')).toHaveCount(0, { timeout: 8000 })
  await expect(page.locator('[data-toast-stack]')).toHaveCount(0)
  expect(problems).toEqual([])
})

test('StatsPanel：七个成就各一行，照实写出条件，键盘可达，且不声称谁已解锁', async ({ page }) => {
  const problems = watchProblems(page)
  // **用确定的「一步即死局」局面**：这条用例要的是「一局死局、没赢过」的结算
  await page.goto(startUrl(ONE_STEP_FROM_DEADLOCK))
  await page.getByRole('button', { name: '开始游戏' }).click()
  await page.keyboard.press('ArrowRight')
  await page.getByRole('button', { name: '结束并记录' }).click()

  // 键盘路径：Tab 到「战绩与统计」按钮，回车打开（走原生 Tab 顺序）。
  // **别假定它正好是下一站**：结算之后焦点落在面板里的按钮上，而 Tab 顺序取决于面板
  // 摆了什么。转到它为止（有界），而不是「按一次就该是它」。
  const toggle = page.getByRole('button', { name: '战绩与统计' })
  for (let step = 0; step < 12; step += 1) {
    if (await toggle.evaluate((element) => element === document.activeElement)) break
    await page.keyboard.press('Tab')
  }
  await expect(toggle).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-stats-panel]')).toBeVisible()

  const rows = page.locator('[data-achievement]')
  // ADR-0007 之后是六个；2026-09-28 又加了「首次合并」，所以现在是七个
  await expect(rows).toHaveCount(7)
  for (const id of [
    'first-merge',
    'first-win',
    'tile-4096',
    'tile-8192',
    'quick-hand',
    'merge-machine',
    'style-traveller',
  ]) {
    const row = page.locator(`[data-achievement="${id}"]`)
    await expect(row).toHaveCount(1)
    // **不声称任何解锁状态**：这块面板看不到眼前的棋盘，那个结论它答不上来
    await expect(row).not.toHaveAttribute('data-unlocked', /.*/)
  }
  // 条件照实写出来，而且都是「本局」口径
  await expect(page.locator('[data-achievement="style-traveller"]')).toContainText(
    '本局切换 5 次以上风格'
  )
  await expect(page.locator('[data-achievement="tile-4096"]')).toContainText('本局合出 4096')
  // 两个退休的成就一行都没有，界面上也不留任何占位
  await expect(page.locator('[data-achievement="mode-collector"]')).toHaveCount(0)
  await expect(page.locator('[data-achievement="daily-stand"]')).toHaveCount(0)
  // 「已解锁 N」那个计数连同它的面板一起没了
  await expect(page.locator('[data-stat="achievementUnlocks"]')).toHaveCount(0)
  // 收起按钮也是原生 button，Tab 出得去
  await expect(page.getByRole('button', { name: '收起' })).toBeVisible()

  expect(problems).toEqual([])
})