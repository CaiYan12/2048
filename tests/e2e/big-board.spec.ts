import { expect, test, type Page } from '@playwright/test'

/**
 * T06 的 5×5 切片：模式可选、25 格开局、真实按键移动边缘行列、两种视口都不横向溢出、
 * 4096 四位数不挤出格子、一步死局走完整条终局。
 *
 * 局面确定性来自 `?seed=` 与 `?board=` 这两条调试入口（见 `useGameStore` /
 * `stores/fixture.ts`）：同一个 seed 得到同一个初始局面与同一条随机流。**模式没有 URL
 * 入口**——它由开局界面上的按钮决定，所以每个用例都得先点「大棋盘」再点「开始游戏」
 * （点错模式等于拿 classic 的表跑 5×5 的局面）。
 *
 * 本文件由 T06 的 implementer 写出但**未执行**：真实渲染、字形宽度与两条视口的滚动
 * 行为归控制人的扫描。期望值全部经同一套规则内核离线推演得到（含每一步的分数与逐格
 * 棋盘），不是照着手算的合并过程写下来的；字号那一档照 `board.css` 的 data-digits
 * 规则反推（四位数 = 0.27 倍格边长），格子边长由 BoardLayout 按视口现算，所以期望值
 * 现读现算，不写死一个数。
 */

/** 开局 URL：固定种子让「移动后的生成」也可预期 */
const SEED_URL = '/?seed=20260926'

/** 行优先局面 → board 参数值（空串 = 空格） */
function boardQuery(rows: (number | null)[][]): string {
  return rows.flat().map((value) => value ?? '').join(',')
}

/** 开局 URL 带局面：局面铺好之后，每一步仍然走真实按键与真实规则内核 */
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
async function startBigBoard(page: Page): Promise<void> {
  await page.getByRole('button', { name: '大棋盘' }).click()
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()
}

/** 收集 console / page 错误：新棋盘尺寸是新的渲染路径，React 警告要当场看见 */
function watchProblems(page: Page): string[] {
  const problems: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  return problems
}

/**
 * 每个方块都必须整块落在自己的底板格子里。
 *
 * 25 格比 16 格更容易在这里出错：格子边长变小、列数变多，任何一处偏移算错都会让
 * 方块压到隔壁格子上（观感上就是「遮挡」）。只读一次快照，不在移动过程中比对——
 * 方块带 transform 过渡，动画进行中量到的是中间位置，那会是假失败。
 */
async function expectTilesInsideCells(page: Page, tolerance = 1): Promise<void> {
  // 底板格子由 Board.tsx 按行优先渲染，所以第 row*size+col 个就是 (row,col) 那一格
  const cellCount = await page.locator('.board__cell').count()
  const size = Math.sqrt(cellCount)
  const cells = await page.locator('.board__cell').evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect()
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
    })
  )
  const tiles = await page.locator('[data-tile-id]').evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect()
      return {
        row: Number(node.getAttribute('data-row')),
        col: Number(node.getAttribute('data-col')),
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      }
    })
  )

  expect(cells).toHaveLength(size * size)
  for (const tile of tiles) {
    const cell = cells[tile.row * size + tile.col]
    const at = `(${tile.row},${tile.col})`
    if (!cell) throw new Error(`${at} 没有对应的底板格子`)
    expect(tile.left, `${at} 左边界越出格子`).toBeGreaterThanOrEqual(cell.left - tolerance)
    expect(tile.top, `${at} 上边界越出格子`).toBeGreaterThanOrEqual(cell.top - tolerance)
    expect(tile.right, `${at} 右边界越出格子`).toBeLessThanOrEqual(cell.right + tolerance)
    expect(tile.bottom, `${at} 下边界越出格子`).toBeLessThanOrEqual(cell.bottom + tolerance)
  }
}

/** 惰性填充：25 格全满、横纵相邻都不相等且本来就压紧，四个方向都推不动 */
const FULL_BOARD: (number | null)[][] = [
  [2, 4, 2, 4, 2],
  [4, 2, 4, 2, 4],
  [2, 4, 2, 4, 2],
  [4, 2, 4, 2, 4],
  [2, 4, 2, 4, 2],
]

/** 上边行（row 0）里的一对同值块：左移合掉它，垂直方向一格不动 */
const EDGE_ROW: (number | null)[][] = [
  [8, 8, 2, 4, 2],
  [4, 2, 4, 2, 4],
  [2, 4, 2, 4, 2],
  [4, 2, 4, 2, 4],
  [2, 4, 2, 4, 2],
]

/** 左边列（column 0）里的一对同值块：上移合掉它，水平方向一格不动 */
const EDGE_COLUMN: (number | null)[][] = [
  [8, 4, 2, 4, 2],
  [8, 2, 4, 2, 4],
  [2, 4, 2, 4, 2],
  [4, 2, 4, 2, 4],
  [2, 4, 2, 4, 2],
]

/** 两个 2048 并排躺在上边行：一次左移合出目标块 4096 */
const WINNING: (number | null)[][] = [
  [2048, 2048, 2, 4, 2],
  [4, 2, 4, 2, 4],
  [2, 4, 2, 4, 2],
  [4, 2, 4, 2, 4],
  [2, 4, 2, 4, 2],
]

/**
 * 一步即死局：第 0 行右端留一个空格，右移把整行推过去，空出的 (0,0) 由生成填上。
 * 填上那一格的右邻与下邻都是 8，所以生成 2 还是 4 都死局——不依赖随机进度。
 */
const ONE_STEP_FROM_DEADLOCK: (number | null)[][] = [
  [8, 2, 4, 8, null],
  [8, 4, 8, 2, 4],
  [2, 8, 4, 8, 2],
  [4, 2, 8, 4, 8],
  [8, 4, 2, 8, 4],
]

test('开局界面能选大棋盘：六个模式一个不多，25 格与目标 4096 都切过去', async ({ page }) => {
  const problems = watchProblems(page)
  await page.goto(SEED_URL)

  // AVAILABLE_MODE_IDS 从五个放宽到正好六个（T09 加进 time-attack）：六种模式
  // 到此全部到位，未实现的更不该以「不可点」的样子出现在界面上
  const modes = page.getByRole('group', { name: '模式' }).getByRole('button')
  await expect(modes).toHaveText(['经典', '斐波那契', '大棋盘', '障碍', '每日', '限时'])

  const bigBoard = page.getByRole('button', { name: '大棋盘' })
  await bigBoard.click()
  await expect(bigBoard).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '开始游戏' }).click()

  const board = page.locator('[data-board]')
  await expect(board).toHaveAttribute('data-mode', 'big-board')
  await expect(page.locator('[data-score]')).toHaveText('0')
  // 目标就是模式声明的 4096，不是 classic 的 2048
  await expect(
    page.locator('.panel', { hasText: '目标' }).locator('.panel__value')
  ).toHaveText('4096')
  await expect(page.locator('[data-tile-id]')).toHaveCount(2)
  expect(await readBoard(page)).toEqual([
    [null, null, null, null, null],
    [null, null, null, null, null],
    [null, null, null, 2, null],
    [null, null, null, null, null],
    [null, null, null, null, 4],
  ])

  // 验收标准第一条：棋盘确为 25 Cell；方块都落在自己的格子里（25 格更容易偏移算错）
  await expect(page.locator('.board__cell')).toHaveCount(25)
  await expectTilesInsideCells(page)

  expect(problems).toEqual([])
})

test('固定局面：左移合掉上边行的一对，边缘行真的在动', async ({ page }) => {
  const problems = watchProblems(page)
  await page.goto(startUrl(EDGE_ROW))
  await startBigBoard(page)

  await expect(page.locator('[data-tile-id]')).toHaveCount(25)
  await expect(page.locator('[data-score]')).toHaveText('0')

  // 焦点显式放回棋盘：开局界面那个「开始游戏」已经卸载，浏览器会把焦点退给 body。
  // 这一步不是在被测行为里（键盘归属由 game.spec.ts 专门钉），只是让后面的按键
  // 不因焦点落在哪而悬空
  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowLeft')

  await expect(page.locator('[data-score]')).toHaveText('16')
  expect(await readBoard(page)).toEqual([
    [16, 2, 4, 2, 2],
    [4, 2, 4, 2, 4],
    [2, 4, 2, 4, 2],
    [4, 2, 4, 2, 4],
    [2, 4, 2, 4, 2],
  ])

  expect(problems).toEqual([])
})

test('固定局面：上移合掉左边列的一对，边缘列真的在动', async ({ page }) => {
  const problems = watchProblems(page)
  await page.goto(startUrl(EDGE_COLUMN))
  await startBigBoard(page)

  // 同上：显式聚焦，按键才一定落在棋盘上
  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowUp')

  await expect(page.locator('[data-score]')).toHaveText('16')
  // 只有第 0 列在动：列首合出 16，其余四列逐格未变——
  // 这条是「边缘列」的判别用例，只碰内部 lane 的实现过不了它
  expect(await readBoard(page)).toEqual([
    [16, 4, 2, 4, 2],
    [2, 2, 4, 2, 4],
    [4, 4, 2, 4, 2],
    [2, 2, 4, 2, 4],
    [2, 4, 2, 4, 2],
  ])

  expect(problems).toEqual([])
})

test('两种视口都不横向溢出：scrollWidth 不许超过视口，控件点得着', async ({ page }) => {
  const problems = watchProblems(page)
  await page.goto(startUrl(FULL_BOARD))
  await startBigBoard(page)
  await expect(page.locator('.board__cell')).toHaveCount(25)

  const metrics = await page.evaluate(() => {
    const board = document.querySelector('[data-board]') as HTMLElement
    const rect = board.getBoundingClientRect()
    const style = getComputedStyle(board)
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
      cellSize: parseFloat(style.getPropertyValue('--cell-size')),
      boardSizePx: parseFloat(style.getPropertyValue('--board-size-px')),
    }
  })

  const viewport = page.viewportSize()
  if (!viewport) throw new Error('拿不到视口尺寸')

  // 1. 没有横向溢出：这是本用例的主判据，两个视口（桌面 1280、Pixel 5 393）各自成立
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth)
  // 视口 sanity：测得的就是这个项目的视口，不是别的什么宽度
  expect(metrics.clientWidth).toBeLessThanOrEqual(viewport.width)
  // clientWidth 从不超过 innerWidth：竖向滚动条（若有）只吃 innerWidth 不吃 clientWidth
  expect(metrics.clientWidth).toBeLessThanOrEqual(metrics.innerWidth)

  // 2. 整块棋盘落在页面内容区里：外壳 px-4 每侧让出 16px，BoardLayout 每侧预留 24px，
  //    所以棋盘的左右边界都该离视口边缘 ≥16px——这是「不溢出」在几何上的样子
  expect(metrics.boardLeft).toBeGreaterThanOrEqual(16)
  expect(metrics.boardRight).toBeLessThanOrEqual(metrics.clientWidth - 16)

  // 3. 棋盘宽度就是 BoardLayout 算出来的那个值，CSS 变量与 DOM 一致：
  //    pixelSize = padding×2 + cell×size + gap×(size−1) = 12×2 + cell×5 + 12×4
  expect(metrics.boardWidth).toBeCloseTo(metrics.boardSizePx, 0)
  expect(metrics.boardSizePx).toBeCloseTo(12 * 2 + metrics.cellSize * 5 + 12 * 4, 0)

  // 4. 控件点得着：Playwright 的 click 会等元素可交互，被棋盘盖住就直接失败。
  //    25 格的棋盘在窄视口上最高，这一条专门盯「棋盘长大把按钮顶出去/盖住」
  await page.getByRole('button', { name: '新游戏' }).click()
  await expect(page.locator('[data-score]')).toHaveText('0')
  await expect(page.locator('[data-tile-id]')).toHaveCount(2)

  expect(problems).toEqual([])
})

test('4096：四位数字号档，字不挤出格子', async ({ page }) => {
  const problems = watchProblems(page)
  await page.goto(startUrl(WINNING))
  await startBigBoard(page)

  // 同上：显式聚焦，按键才一定落在棋盘上（4096 要靠这一手才出现）
  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowLeft')

  const tile = page.locator('[data-tile-id][data-value="4096"]')
  await expect(tile).toHaveCount(1)
  await expect(tile).toHaveText('4096')
  // 位数是 board.css 选字号档的唯一依据
  await expect(tile).toHaveAttribute('data-digits', '4')
  await expect(page.locator('[data-score]')).toHaveText('4096')

  const metrics = await tile.evaluate((el) => ({
    fontSize: parseFloat(getComputedStyle(el).fontSize),
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
    // 底色必须真的是某个色档：透明说明掉出了阶梯，方块就是块白板
    background: getComputedStyle(el).backgroundColor,
  }))
  const cellSize = await page
    .locator('[data-board]')
    .evaluate((el) => parseFloat(getComputedStyle(el).getPropertyValue('--cell-size')))

  // board.css 的 data-digits='4' 档就是 0.27 倍格边长（格子边长按视口现算）
  expect(Math.abs(metrics.fontSize - cellSize * 0.27)).toBeLessThan(0.5)
  // 四位数不许挤出格子：TileView 就是一个格子见方的盒子，字宽超过它就会横向溢出
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth)
  // 4096 落在阶梯声明的末档之外，按裁决归 --tile-beyond（T13–T15 才重新按秩分档），
  // 这里只验它「有着落且读得出」，不替它挑一个别的颜色
  expect(metrics.background).not.toBe('rgba(0, 0, 0, 0)')

  expect(problems).toEqual([])
})

test('一步死局：25 格锁死，结束并记录后新游戏给干净开局', async ({ page }) => {
  const problems = watchProblems(page)
  await page.goto(startUrl(ONE_STEP_FROM_DEADLOCK))
  await startBigBoard(page)
  // 开局 24 块 + 唯一的那个空格
  await expect(page.locator('[data-tile-id]')).toHaveCount(24)
  await expect(page.locator('[data-panel]')).toHaveCount(0)

  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowRight')

  const panel = page.locator('[data-panel="gameover"]')
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('四方向都无合法移动')
  await expect(page.locator('[data-tile-id]')).toHaveCount(25)
  await expect(page.locator('[data-score]')).toHaveText('0')
  expect(await readBoard(page)).toEqual([
    [2, 8, 2, 4, 8],
    [8, 4, 8, 2, 4],
    [2, 8, 4, 8, 2],
    [4, 2, 8, 4, 8],
    [8, 4, 2, 8, 4],
  ])

  // 死棋盘推不动：焦点放回棋盘上按四个方向键，一个格子都不该变、也不该多出第 26 块。
  // 必须先聚焦 [data-board]——面板是 .board 的兄弟节点，从面板按钮出发的 keydown
  // 压根冒泡不到 Board 的 handler，那样按完什么都证明不了
  const locked = await readBoard(page)
  await page.locator('[data-board]').focus()
  for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
    await page.keyboard.press(key)
  }
  expect(await readBoard(page)).toEqual(locked)
  await expect(page.locator('[data-tile-id]')).toHaveCount(25)

  // 终局：结束并记录 → 原因是 deadlock，再开一局是干净的开局
  await page.getByRole('button', { name: '结束并记录' }).click()
  await expect(panel).toHaveAttribute('data-end-reason', 'deadlock')
  await page.getByRole('button', { name: '新游戏' }).click()
  await expect(panel).toHaveCount(0)
  await expect(page.locator('[data-score]')).toHaveText('0')
  await expect(page.locator('[data-tile-id]')).toHaveCount(2)
  await expect(page.locator('.board__cell')).toHaveCount(25)

  expect(problems).toEqual([])
})
