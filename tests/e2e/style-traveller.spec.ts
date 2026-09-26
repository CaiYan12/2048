import { expect, test, type Page } from '@playwright/test'

/**
 * T19 的风格旅行者：单局内切过 5 次以上风格 → 只解锁一次，刷新之后计数与解锁都在。
 *
 * **本文件由 T19 编写、不由 T19 执行**（派发令明令：不准跑 playwright、不准开浏览器，
 * 也不准用任何驱动真实浏览器的 MCP）。期望值来自同一条规则内核的离线推演 +
 * tests/unit/style-traveller.test.ts 已经钉住的那一段：阈值钉在 5、判据 `>=`，
 * 撤销不倒回、放弃不留痕。跑不跑由控制人决定。
 *
 * DOM 契约沿用 T18：解锁提示是 `[data-achievement-notice]`，统计面板是
 * `[data-stats-panel]`，成就一行一个 `[data-achievement="<id>"]` 带 `data-unlocked`。
 *
 * 局面确定性来自 `?seed=` + `?board=`（开局夹具）：合出 2048 靠人手按键无法复现，
 * 而这里要断言的正是「切够次数 → 结算 → 解锁」这一路。局面铺好之后每一步仍然走
 * 真实点击与真实规则内核。四张 1024 一次左移 = 第一次达标，与
 * tests/e2e/achievements.spec.ts / run-endings.spec.ts 同款。
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

/** 收集 console / page 错误：解锁提示是新的渲染路径，React 警告要当场看见 */
function watchProblems(page: Page): string[] {
  const problems: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  return problems
}

/**
 * 切换一次风格，返回切到的那个名字。
 *
 * **从 DOM 上推出切哪一个**，而不是写死「第 n 个按钮」：T18 的评审记着一次 Tab 顺序
 * 脆弱性——外壳上多一个选择器就把按 Tab 数按钮的用例全打断了。这里问的是
 * aria-pressed 不为 true 的那一个（StylePicker 的选中态就挂在这个属性上），
 * 于是加一套风格、或者选择器的位置变了，这个走法都还成立。
 */
async function switchOnce(page: Page): Promise<string> {
  const picker = page.getByRole('group', { name: '风格' })
  const buttons = picker.getByRole('button')
  const count = await buttons.count()
  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index)
    if ((await button.getAttribute('aria-pressed')) !== 'true') {
      const label = (await button.textContent()) ?? ''
      await button.click()
      return label
    }
  }
  throw new Error('风格选择器上应当有一个没被选中的按钮')
}

/** 连续切 count 次（每次都切到一个真的不同的风格上） */
async function switchTimes(page: Page, count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) await switchOnce(page)
}

/** 打开战绩与统计面板 */
async function openStats(page: Page): Promise<void> {
  await page.getByRole('button', { name: '战绩与统计' }).click()
  await expect(page.locator('[data-stats-panel]')).toBeVisible()
}

/** 开局（同一副四 1024），再切 count 次风格，最后左移达标 */
async function playToWin(page: Page, switches: number): Promise<void> {
  await page.goto(startUrl(FOUR_1024, 4321))
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()
  await switchTimes(page, switches)
  // 点风格按钮把焦点从棋盘上带走了，而方向键只在棋盘是事件目标时才生效
  // （game.spec.ts 钉住的契约）。少了这一行，左移会落在按钮上、一个 Move 都不产生
  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('[data-panel="win"]')).toBeVisible()
}

test('切四次：不够，风格旅行者还锁着（阈值是 5，不是 4）', async ({ page }) => {
  const problems = watchProblems(page)
  await playToWin(page, 4)
  await page.getByRole('button', { name: '结束并记录' }).click()

  await openStats(page)
  await expect(page.locator('[data-achievement="style-traveller"]')).toHaveAttribute(
    'data-unlocked',
    'false'
  )
  // 锁着的那一行照实写出条件：不把条件藏起来（SPEC §3.3 的原话）
  await expect(page.locator('[data-achievement="style-traveller"]')).toContainText(
    '单局内切换 5 次以上风格'
  )
  expect(problems).toEqual([])
})

test('切五次解锁，切六次也只解锁一次', async ({ page }) => {
  const problems = watchProblems(page)

  await playToWin(page, 5)
  // 达标那一瞬间还没有结算，于是还没有解锁提示
  await expect(page.locator('[data-achievement-notice]')).toHaveCount(0)
  await page.getByRole('button', { name: '结束并记录' }).click()

  const notice = page.locator('[data-achievement-notice]')
  await expect(notice).toBeVisible()
  // 这一局同时首胜，所以那一句里两个成就都在；而它只有**一条**，不是每个成就一条
  await expect(notice).toContainText('风格旅行者')
  await expect(notice).toHaveCount(1)

  await openStats(page)
  await expect(page.locator('[data-achievement="style-traveller"]')).toHaveAttribute(
    'data-unlocked',
    'true'
  )
  expect(problems).toEqual([])
})

test('切六次同样解锁一次：多切一次不会多响一次', async ({ page }) => {
  const problems = watchProblems(page)

  await playToWin(page, 6)
  await page.getByRole('button', { name: '结束并记录' }).click()
  const notice = page.locator('[data-achievement-notice]')
  await expect(notice).toHaveCount(1)
  await expect(notice).toContainText('风格旅行者')

  await openStats(page)
  await expect(page.locator('[data-achievement="style-traveller"]')).toHaveAttribute(
    'data-unlocked',
    'true'
  )
  // 成就解锁那个数字也跟着注册表走：这一局是首胜 + 风格旅行者 = 2
  await expect(page.locator('[data-stat="achievementUnlocks"]')).toHaveText('2')
  expect(problems).toEqual([])
})

test('局中刷新：切过的次数跟着这一局回来，补到阈值照样解锁', async ({ page }) => {
  const problems = watchProblems(page)

  await page.goto(startUrl(FOUR_1024, 4321))
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()
  // 先切三次：还不够，此刻刷新一次，看这三次数不数得回来
  await switchTimes(page, 3)

  // 刷新：`?seed=` / `?board=` 优先于存档（T16），所以先 goto('/') 把参数去掉再 reload
  await page.goto('/')
  await page.reload()
  await expect(page.locator('[data-board]')).toBeVisible()

  // 再切两次：3 + 2 = 5，正好压线。若切换计数没跟着这一局活过刷新，这里就差两次
  await switchTimes(page, 2)
  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('[data-panel="win"]')).toBeVisible()
  await page.getByRole('button', { name: '结束并记录' }).click()

  await expect(page.locator('[data-achievement-notice]')).toContainText('风格旅行者')
  await openStats(page)
  await expect(page.locator('[data-achievement="style-traveller"]')).toHaveAttribute(
    'data-unlocked',
    'true'
  )
  expect(problems).toEqual([])
})

test('结算之后再刷新：那一句不重播，而解锁还在盘上', async ({ page }) => {
  const problems = watchProblems(page)

  await playToWin(page, 6)
  await page.getByRole('button', { name: '结束并记录' }).click()
  await expect(page.locator('[data-achievement-notice]')).toBeVisible()

  await page.goto('/')
  await page.reload()
  // 提示只由「落库前后的差」产生，而 hydrate 只读盘上那份已解锁列表——重播不会发生
  await expect(page.locator('[data-achievement-notice]')).toHaveCount(0)

  await openStats(page)
  await expect(page.locator('[data-achievement="style-traveller"]')).toHaveAttribute(
    'data-unlocked',
    'true'
  )
  expect(problems).toEqual([])
})

test('换风格不碰这一局：同一副棋盘切五次，盘面状态一个字段都不动', async ({ page }) => {
  const problems = watchProblems(page)

  await page.goto(startUrl(FOUR_1024, 4321))
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()

  /** 盘面此刻的全部可观测状态：身份、数值、行列、分数 */
  const readRun = async (): Promise<string> => {
    const tiles = page.locator('[data-tile-id]')
    const cells: string[] = []
    for (let index = 0; index < (await tiles.count()); index += 1) {
      const tile = tiles.nth(index)
      cells.push(
        [
          await tile.getAttribute('data-tile-id'),
          await tile.getAttribute('data-value'),
          await tile.getAttribute('data-row'),
          await tile.getAttribute('data-col'),
        ].join(':')
      )
    }
    return `${await page.locator('[data-board]').getAttribute('data-mode')}|${
      await page.locator('[data-score]').textContent()
    }|${cells.join(',')}`
  }

  const before = await readRun()
  await switchTimes(page, 5)
  // **深相等在这里不够**：换皮若把 run 重建一遍、每个值都还在，这个断言照样过——
  // 所以 data-tile-id 的同一性与 DOM 节点的引用由 style-switch.spec.ts 单独钉，
  // 这一条钉的是「盘面状态没变」（值）。两条一起才闭合
  expect(await readRun()).toBe(before)

  // 换五次皮不影响胜负路径：左移照样合出 2048
  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('[data-panel="win"]')).toBeVisible()
  expect(problems).toEqual([])
})
