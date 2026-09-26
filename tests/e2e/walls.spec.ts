import { expect, test, type Page } from '@playwright/test'

/**
 * T07 的障碍切片：模式可选、冻结的四格图案可见且与空格/方块分得开、墙把 lane 切断。
 *
 * **本文件由 T07 的 implementer 写出但未执行**：真实渲染、字号与两种视口的滚动行为归
 * 控制人的扫描。期望值全部经同一套规则内核离线推演得到（走的就是本文件同一条入口：
 * `fixtureFromQuery` + `?seed=20260926`，与 tests/unit/walls.test.ts 同一批局面），
 * 不是照手算写下来的。
 *
 * 局面确定性来自 `?seed=` 与 `?board=`（见 `useGameStore` / `stores/fixture.ts`）：
 * 同一个 seed 得到同一个开局与同一条随机流，`?board=` 把开局局面钉死。**模式没有 URL
 * 入口**——它由开局界面上的按钮决定，所以每个用例都得先点「障碍」再点「开始游戏」
 * （点错模式等于拿 classic 的棋盘跑障碍的局面，四格墙根本不存在）。
 *
 * 读棋盘的方式：底板格是固定结构且有 data-cell，方块层有 data-tile-id / data-row /
 * data-col / data-value。墙既不是 tile 也没有数值，所以 readBoard 在墙的位置取到 null。
 */

/** 开局 URL：固定种子让「移动后的生成」也可预期 */
const SEED_URL = '/?seed=20260926'

/** 契约冻结的四个障碍坐标（tests/unit/fixtures/mode-contract.json 同口径） */
const WALL_CELLS: readonly (readonly [number, number])[] = [
  [1, 1],
  [1, 2],
  [2, 1],
  [2, 2],
]

/** 四个方向轮着按，与 tests/unit/walls.test.ts 的走查同一条序列 */
const WALK_KEYS: readonly string[] = [
  'ArrowLeft',
  'ArrowUp',
  'ArrowRight',
  'ArrowDown',
]

/** 行优先局面 → board 参数值（空串 = 空格；障碍格由 fixture 按模式声明自动保持 wall） */
function boardQuery(rows: (number | null)[][]): string {
  return rows.flat().map((value) => value ?? '').join(',')
}

/** 开局 URL 带局面：局面铺好之后每一步仍走真实按键与真实规则内核 */
function startUrl(rows: (number | null)[][]): string {
  return `/?seed=20260926&board=${boardQuery(rows)}`
}

/** 从 DOM 还原棋盘：棋盘是固定结构，有方块才有 data-tile-id */
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

/** 底板格按行优先渲染，所以第 row*size+col 个 .board__cell 就是 (row,col) 那一格 */
function cellIndex(row: number, col: number): number {
  return row * 4 + col
}

/** 开局前先选模式：e2e 没有模式 URL 入口，模式就是开局界面上的那个按钮 */
async function startWalls(page: Page): Promise<void> {
  await page.getByRole('button', { name: '障碍' }).click()
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()
}

/** 收集 console / page 错误：障碍是新的渲染路径，React 警告要当场看见 */
function watchProblems(page: Page): string[] {
  const problems: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  return problems
}

/** #rrggbb → [r,g,b]，用于把浏览器算出的 rgb() 与 tokens.css 的色值对起来 */
function parseRgb(value: string): [number, number, number] {
  const match = value.match(/\d+(\.\d+)?/g)
  if (!match || match.length < 3) throw new Error(`认不出的颜色：${value}`)
  return [Number(match[0]), Number(match[1]), Number(match[2])]
}

/** 两个颜色是否同一个色值（容差 1：浏览器可能返回小数或做过色彩管理） */
function sameColor(a: string, b: string, tolerance = 1): boolean {
  const [ar, ag, ab] = parseRgb(a)
  const [br, bg, bb] = parseRgb(b)
  return (
    Math.abs(ar - br) <= tolerance &&
    Math.abs(ag - bg) <= tolerance &&
    Math.abs(ab - bb) <= tolerance
  )
}

/** 读一个元素的计算背景色 */
function backgroundColorOf(page: Page, selector: string): Promise<string> {
  return page
    .locator(selector)
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor)
}

test('开局界面能选障碍：四个模式一个不多，棋盘切到 4×4 带四格墙', async ({ page }) => {
  const problems = watchProblems(page)
  await page.goto(SEED_URL)

  // AVAILABLE_MODE_IDS 放宽到正好这四个：未实现的 daily / time-attack
  // 不该以「不可点」的样子出现在界面上（StartScreen 不从 MODES 过滤）
  const modes = page.getByRole('group', { name: '模式' }).getByRole('button')
  await expect(modes).toHaveText(['经典', '斐波那契', '大棋盘', '障碍'])

  const walls = page.getByRole('button', { name: '障碍' })
  await walls.click()
  await expect(walls).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '开始游戏' }).click()

  const board = page.locator('[data-board]')
  await expect(board).toHaveAttribute('data-mode', 'walls')
  await expect(page.locator('[data-score]')).toHaveText('0')
  // 目标就是模式声明的 2048
  await expect(
    page.locator('.panel', { hasText: '目标' }).locator('.panel__value')
  ).toHaveText('2048')
  await expect(page.locator('[data-tile-id]')).toHaveCount(2)
  expect(await readBoard(page)).toEqual([
    [null, null, null, null],
    [null, null, null, null],
    [2, null, null, null],
    [null, null, null, 4],
  ])

  // 16 格底板一块不少；四格墙带 data-cell='wall'，其余 12 格是 'empty'
  await expect(page.locator('.board__cell')).toHaveCount(16)
  await expect(page.locator(".board__cell[data-cell='wall']")).toHaveCount(4)
  await expect(page.locator(".board__cell[data-cell='empty']")).toHaveCount(12)
  // 墙的位置就是契约冻结的居中 2×2：逐格查属性，不是「数出四个」就算完
  for (const [row, col] of WALL_CELLS) {
    await expect(page.locator('.board__cell').nth(cellIndex(row, col))).toHaveAttribute(
      'data-cell',
      'wall'
    )
  }

  expect(problems).toEqual([])
})

test('冻结的四格图案可见：墙与空格、墙与数值方块都靠计算色值分得开', async ({ page }) => {
  const problems = watchProblems(page)
  // 12 块全铺满，让「最亮那档方块」与「空格」都真的出现在盘面上
  await page.goto(
    startUrl([
      [2, 4, 2, 4],
      [8, null, null, 8],
      [4, null, null, 4],
      [2, 4, 8, 4],
    ])
  )
  await startWalls(page)

  await expect(page.locator('[data-tile-id]')).toHaveCount(12)
  await expect(page.locator(".board__cell[data-cell='wall']")).toHaveCount(4)

  /**
   * 墙必须看得见。T07 之前的失败形态是**四格墙渲染成四个看不见的洞**（底板层一律
   * 吃 --cell-bg），所以这里直接读计算样式：墙格的背景色必须与可玩空格、与最亮那档
   * 方块都不同。
   *
   * 声明值与实测比值见 themes/classic/contrast.json 与 DESIGN.md 第 9 节：
   *   --wall-bg #3f4a52 vs --cell-bg #cdc1b4 = 5.14:1（≥ 3，非文字指示器）
   * 这里只核「色值确实是声明的那一个、且没有掉回空格色」；比值本身由 contrast.json
   * 承载，T14 的 check-contrast 从渲染后的 CSS 重新算一遍。
   *
   * **浏览器还需要确认的一件事**：本文件没有跑过，所以「看起来分得开」这件事只有几何
   * 与色值证据，没有截图证据。控制人的扫描要真眼看一次四格墙在两种视口下的样子。
   */
  const wallBg = await backgroundColorOf(page, ".board__cell[data-cell='wall']")
  const emptyBg = await backgroundColorOf(page, ".board__cell[data-cell='empty']")
  const tile2Bg = await backgroundColorOf(page, "[data-tile-id][data-value='2']")

  expect(wallBg).not.toBe('rgba(0, 0, 0, 0)')
  expect(emptyBg).not.toBe('rgba(0, 0, 0, 0)')
  // 墙不是「掉回了空格的 --cell-bg」
  expect(sameColor(wallBg, emptyBg)).toBe(false)
  // 墙的色值与方块阶梯的暖色不同族（色值本身不同，比值见 contrast.json）
  expect(sameColor(wallBg, tile2Bg)).toBe(false)

  // 墙的 token 在棋盘根元素上解析得出来，且就是 tokens.css 声明的那个值：
  // CSS 变量真的接到了这个格子上，不是写死在别处的魔法数
  const wallToken = await page
    .locator('[data-board]')
    .evaluate((el) => getComputedStyle(el).getPropertyValue('--wall-bg').trim())
  expect(wallToken).toBe('#3f4a52')

  // 墙不带数字：方块永远带数字、障碍永远不带，这是「没把它当成一块待合并的方块」的判据
  for (let index = 0; index < 4; index++) {
    const text = await page
      .locator(".board__cell[data-cell='wall']")
      .nth(index)
      .evaluate((el) => el.textContent ?? '')
    expect(text.trim()).toBe('')
  }
  await expect(page.locator("[data-tile-id][data-value='2']").first()).toHaveText('2')

  expect(problems).toEqual([])
})

test('固定局面：左移只动第 0 行，跨墙的同值块一格不动', async ({ page }) => {
  const problems = watchProblems(page)
  await page.goto(
    startUrl([
      [2, 4, 2, 2],
      [8, null, null, 8],
      [4, null, null, 4],
      [2, 4, 8, 4],
    ])
  )
  await startWalls(page)

  // 开局即铺好的 12 块；一次左移并两个、生一个，所以还是 12 块
  await expect(page.locator('[data-tile-id]')).toHaveCount(12)
  await expect(page.locator('[data-score]')).toHaveText('0')

  // 开局界面那个「开始游戏」已经卸载，浏览器会把焦点退给 body；显式聚焦棋盘。
  // 这一步不是在被测行为里（键盘归属由 game.spec.ts 专门钉），只是让按键有着落
  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowLeft')

  await expect(page.locator('[data-score]')).toHaveText('4')
  // 第 0 行 [2,4,2,2] → [2,4,4,新]：2+2 合出 4，(0,3) 由生成填上（低位 90% 抽 2）。
  // 第 1/2 行各躺一对跨墙同值块（8,8 与 4,4）——它们不在同一条 lane 里，所以原地不动。
  // 少了这一条，「墙把 lane 切断」在浏览器里就等于没验证过
  expect(await readBoard(page)).toEqual([
    [2, 4, 4, 2],
    [8, null, null, 8],
    [4, null, null, 4],
    [2, 4, 8, 4],
  ])
  // 四格墙仍在原位：既是「墙不动」的可观察后果，也说明生成没落到墙上去
  await expect(page.locator(".board__cell[data-cell='wall']")).toHaveCount(4)
  for (const [row, col] of WALL_CELLS) {
    await expect(page.locator('.board__cell').nth(cellIndex(row, col))).toHaveAttribute(
      'data-cell',
      'wall'
    )
  }

  expect(problems).toEqual([])
})

test('固定局面：上移只动第 0 列，跨墙的同值块原地不动', async ({ page }) => {
  const problems = watchProblems(page)
  await page.goto(
    startUrl([
      [2, 2, 4, 8],
      [2, null, null, 2],
      [4, null, null, 4],
      [2, 2, 4, 2],
    ])
  )
  await startWalls(page)

  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowUp')

  await expect(page.locator('[data-score]')).toHaveText('4')
  // 第 0 列 [2,2,4,2] → [4,4,2,新]；第 1/2 列各一对跨墙同值块（2,2 与 4,4）不合。
  // 列轴同样按 lane 自然序，所以这条是「列方向上墙切断了 lane」的判别用例
  expect(await readBoard(page)).toEqual([
    [4, 2, 4, 8],
    [4, null, null, 2],
    [2, null, null, 4],
    [2, 2, 4, 2],
  ])
  await expect(page.locator(".board__cell[data-cell='wall']")).toHaveCount(4)

  expect(problems).toEqual([])
})

test('固定局面：墙那一侧有空格，方块不许滑过墙', async ({ page }) => {
  const problems = watchProblems(page)
  await page.goto(
    startUrl([
      [2, 4, 2, 4],
      [null, null, null, 8],
      [4, null, null, 4],
      [4, 2, 8, 2],
    ])
  )
  await startWalls(page)

  // 开局 11 块，左移一个格子都不该动：把墙当空气的整行扫描会把 (1,3) 的 8 推到 (1,0)
  await expect(page.locator('[data-tile-id]')).toHaveCount(11)
  await expect(page.locator('[data-score]')).toHaveText('0')

  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowLeft')

  // 无效移动：不生成、不记分、不进撤销历史，所以棋盘与开局逐格一致，(1,0) 仍空着
  await expect(page.locator('[data-score]')).toHaveText('0')
  await expect(page.locator('[data-tile-id]')).toHaveCount(11)
  expect(await readBoard(page)).toEqual([
    [2, 4, 2, 4],
    [null, null, null, 8],
    [4, null, null, 4],
    [4, 2, 8, 2],
  ])

  expect(problems).toEqual([])
})

test('固定开局走四个方向：墙一个都不动，棋盘照常演进', async ({ page }) => {
  const problems = watchProblems(page)
  await page.goto(SEED_URL)
  await startWalls(page)

  await expect(page.locator('[data-tile-id]')).toHaveCount(2)
  await page.locator('[data-board]').focus()
  for (const key of WALK_KEYS) {
    await page.keyboard.press(key)
  }

  // 四步里没有一次合并，所以分数仍是 0；六块方块逐格由同一套内核推演得到
  await expect(page.locator('[data-score]')).toHaveText('0')
  await expect(page.locator('[data-panel]')).toHaveCount(0)
  expect(await readBoard(page)).toEqual([
    [null, 2, 4, 4],
    [null, null, null, null],
    [4, null, null, null],
    [2, null, null, 2],
  ])
  await expect(page.locator('.board__cell')).toHaveCount(16)
  await expect(page.locator(".board__cell[data-cell='wall']")).toHaveCount(4)
  for (const [row, col] of WALL_CELLS) {
    await expect(page.locator('.board__cell').nth(cellIndex(row, col))).toHaveAttribute(
      'data-cell',
      'wall'
    )
  }

  expect(problems).toEqual([])
})

test('一路走到死局：四格墙始终在原位，结束并记录后新游戏给干净开局', async ({ page }) => {
  const problems = watchProblems(page)
  await page.goto(SEED_URL)
  await startWalls(page)

  /**
   * 障碍模式的可玩面积只有 12 格，比经典少四格，所以「填满 → 死局」来得更快：
   * 这个 seed 走到第 27 个按键就死局。多按的几次是空操作（phase 非 playing 时
   * move 原样返回），所以这里按满 40 次，不依赖确切步数。
   */
  await page.locator('[data-board]').focus()
  for (let index = 0; index < 40; index++) {
    await page.keyboard.press(WALK_KEYS[index % WALK_KEYS.length])
  }

  const panel = page.locator('[data-panel="gameover"]')
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('四方向都无合法移动')
  await expect(page.locator('[data-score]')).toHaveText('88')
  await expect(page.locator('[data-tile-id]')).toHaveCount(12)
  // 走完这一路，四格墙一步都没动过（生成也一步都没落到墙上去）
  expect(await readBoard(page)).toEqual([
    [8, 2, 8, 2],
    [2, null, null, 4],
    [16, null, null, 8],
    [4, 2, 8, 4],
  ])
  await expect(page.locator(".board__cell[data-cell='wall']")).toHaveCount(4)

  // 死棋盘推不动：焦点放回棋盘上按四个方向键，一个格子都不该变、也不该多出第 13 块。
  // 必须先聚焦 [data-board]——面板是 .board 的兄弟节点，从面板按钮出发的 keydown
  // 压根冒泡不到 Board 的 handler，那样按完什么都证明不了
  await page.locator('[data-board]').focus()
  for (const key of WALK_KEYS) {
    await page.keyboard.press(key)
  }
  await expect(page.locator('[data-tile-id]')).toHaveCount(12)
  expect(await readBoard(page)).toEqual([
    [8, 2, 8, 2],
    [2, null, null, 4],
    [16, null, null, 8],
    [4, 2, 8, 4],
  ])

  // 终局：结束并记录 → 原因是 deadlock，再开一局是干净的开局（仍是 12 格可玩 + 四格墙）
  await page.getByRole('button', { name: '结束并记录' }).click()
  await expect(panel).toHaveAttribute('data-end-reason', 'deadlock')
  await page.getByRole('button', { name: '新游戏' }).click()
  await expect(panel).toHaveCount(0)
  await expect(page.locator('[data-score]')).toHaveText('0')
  await expect(page.locator('[data-tile-id]')).toHaveCount(2)
  await expect(page.locator('.board__cell')).toHaveCount(16)
  await expect(page.locator(".board__cell[data-cell='wall']")).toHaveCount(4)

  expect(problems).toEqual([])
})

test('两种视口都不横向溢出：scrollWidth 不许超过视口，墙格仍是声明的色值', async ({ page }) => {
  const problems = watchProblems(page)
  await page.goto(
    startUrl([
      [2, 4, 2, 4],
      [8, null, null, 8],
      [4, null, null, 4],
      [2, 4, 8, 4],
    ])
  )
  await startWalls(page)

  const metrics = await page.evaluate(() => {
    const board = document.querySelector('[data-board]') as HTMLElement
    const rect = board.getBoundingClientRect()
    return {
      // documentElement.scrollWidth 才是「页面到底有没有横向滚动条」的判据：
      // 它把溢出内容一起算进来，而视口宽度只是「看得见的那一块」
      scrollWidth: document.documentElement.scrollWidth,
      // clientWidth 扣掉了滚动条：拿它比 scrollWidth 才不会因为竖向滚动条误判
      clientWidth: document.documentElement.clientWidth,
      innerWidth: window.innerWidth,
      boardWidth: rect.width,
      boardLeft: rect.left,
      boardRight: rect.right,
    }
  })

  const viewport = page.viewportSize()
  if (!viewport) throw new Error('拿不到视口尺寸')

  // 1. 没有横向溢出：这是本用例的主判据，两个视口（桌面 1280、Pixel 5 393）各自成立
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth)
  // 视口 sanity：测得的就是这个项目的视口，不是别的什么宽度。
  // 少了这一条，桌面 1280 那次跑通只证明「宽屏不溢出」，窄屏根本没被证明
  expect(metrics.clientWidth).toBeLessThanOrEqual(viewport.width)
  // clientWidth 从不超过 innerWidth：竖向滚动条（若有）只吃 innerWidth 不吃 clientWidth
  expect(metrics.clientWidth).toBeLessThanOrEqual(metrics.innerWidth)

  // 2. 棋盘完整落在内容区里：障碍模式仍是 4×4，窄屏下与经典同规格
  expect(metrics.boardLeft).toBeGreaterThanOrEqual(16)
  expect(metrics.boardRight).toBeLessThanOrEqual(metrics.clientWidth - 16)

  // 墙格在窄屏上仍是 declared token 的那个色值，没有掉回空格色
  const wallBg = await backgroundColorOf(page, ".board__cell[data-cell='wall']")
  const emptyBg = await backgroundColorOf(page, ".board__cell[data-cell='empty']")
  expect(sameColor(wallBg, emptyBg)).toBe(false)

  await expect(page.locator('.board__cell')).toHaveCount(16)
  await expect(page.locator(".board__cell[data-cell='wall']")).toHaveCount(4)
  await expect(page.locator("[data-tile-id][data-value='2']").first()).toBeVisible()

  expect(problems).toEqual([])
})
