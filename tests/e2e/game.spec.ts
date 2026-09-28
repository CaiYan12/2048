import { expect, test, type Page } from '@playwright/test'

/**
 * T03 的 Classic 纵向切片：确定性合并 + Tile 身份 + 键盘归属。
 *
 * 全部走真实按键与真实 DOM，不伸进 store 里改状态。局面确定性来自
 * `?seed=` 这个调试入口（见 useGameStore 的说明）：同一个 seed 得到同一个
 * 初始局面与同一条随机流，所以下面每一步的期望棋盘都是逐格写死的。
 *
 * 期望值的来历：先用同一套规则内核离线推演这段按键序列，再逐格核对手势
 * （哪一格合并、哪一格生成、哪一次无效），确认无误后才写进断言。
 */

interface TileSnapshot {
  id: string
  value: number
  row: number
  col: number
}

/** 从 DOM 还原棋盘：棋盘是固定结构，格子在就表示有方块 */
async function readBoard(page: Page): Promise<(number | null)[][]> {
  const cellCount = await page.locator('.board__cell').count()
  const size = Math.sqrt(cellCount)
  const grid: (number | null)[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, (): number | null => null)
  )
  const cells = page.locator('[data-tile-id]')
  for (let index = 0; index < (await cells.count()); index++) {
    const cell = cells.nth(index)
    const row = Number(await cell.getAttribute('data-row'))
    const col = Number(await cell.getAttribute('data-col'))
    const value = Number(await cell.getAttribute('data-value'))
    grid[row][col] = value
  }
  return grid
}

async function readTiles(page: Page): Promise<TileSnapshot[]> {
  const cells = page.locator('[data-tile-id]')
  const snapshots: TileSnapshot[] = []
  for (let index = 0; index < (await cells.count()); index++) {
    const cell = cells.nth(index)
    snapshots.push({
      id: (await cell.getAttribute('data-tile-id')) ?? '',
      value: Number(await cell.getAttribute('data-value')),
      row: Number(await cell.getAttribute('data-row')),
      col: Number(await cell.getAttribute('data-col')),
    })
  }
  return snapshots
}

const SEED_URL = '/?seed=20260926'

test('固定 seed 下的确定性合并：滑动、计分、生成，无效移动不变', async ({ page }) => {
  const problems: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))

  await page.goto(SEED_URL)
  await page.getByRole('button', { name: '开始游戏' }).click()

  const board = page.locator('[data-board]')
  const score = page.locator('[data-score]')
  await expect(board).toHaveAttribute('data-mode', 'classic')
  await expect(score).toHaveText('0')

  // 开局两个方块：(2,0)=2、(3,3)=4，其余全空
  expect(await readBoard(page)).toEqual([
    [null, null, null, null],
    [null, null, null, null],
    [2, null, null, null],
    [null, null, null, 4],
  ])

  // 一次合法移动：两个方块各自贴边，暂无合并，随后生成一个新方块
  await page.keyboard.press('ArrowUp')
  expect(await readBoard(page)).toEqual([
    [2, null, null, 4],
    [null, null, null, null],
    [null, null, null, 2],
    [null, null, null, null],
  ])
  await page.keyboard.press('ArrowLeft')
  expect(await readBoard(page)).toEqual([
    [2, 4, null, null],
    [4, null, null, null],
    [2, null, null, null],
    [null, null, null, null],
  ])

  // 无效移动：同一方向再来一次。不生成、不计分，棋盘一个格子都不动
  const beforeInvalid = await readBoard(page)
  const tilesBeforeInvalid = await readTiles(page)
  await page.keyboard.press('ArrowLeft')
  expect(await readBoard(page)).toEqual(beforeInvalid)
  expect(await readTiles(page)).toEqual(tilesBeforeInvalid)
  await expect(score).toHaveText('0')

  // 继续两次合法移动，出现本局第一次合并：右移把两个 2 合成一个 4，得 4 分
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowRight')
  await expect(score).toHaveText('4')
  expect(await readBoard(page)).toEqual([
    [null, null, 4, null],
    [null, null, null, 4],
    [null, null, null, 4],
    [null, null, 2, 4],
  ])

  // 再上一次，同列两个 4 合成 8，又得 8 分
  await page.keyboard.press('ArrowUp')
  await expect(score).toHaveText('12')
  expect(await readBoard(page)).toEqual([
    [4, null, 4, 8],
    [null, null, 2, 4],
    [null, null, null, null],
    [null, null, null, null],
  ])

  expect(problems).toEqual([])
})

test('Tile 身份不随位置变化（data-tile-id 在移动后仍然是同一个）', async ({ page }) => {
  await page.goto(SEED_URL)
  await page.getByRole('button', { name: '开始游戏' }).click()

  const before = await readTiles(page)
  expect(before).toHaveLength(2)
  const two = before.find((tile) => tile.value === 2)
  const four = before.find((tile) => tile.value === 4)
  expect(two).toBeDefined()
  expect(four).toBeDefined()

  await page.keyboard.press('ArrowUp')

  const after = await readTiles(page)
  // 移动后多出一个新生成的方块，原有那两个的身份还在
  expect(after).toHaveLength(3)
  const movedTwo = after.find((tile) => tile.id === two?.id)
  const movedFour = after.find((tile) => tile.id === four?.id)
  expect(movedTwo).toEqual({ id: two?.id, value: 2, row: 0, col: 0 })
  expect(movedFour).toEqual({ id: four?.id, value: 4, row: 0, col: 3 })
})

test('移动键整页都在线：焦点离开棋盘照样推得动（点一下空白之后就是这种处境）', async ({
  page,
}) => {
  await page.goto(SEED_URL)

  // 开局界面：聚焦「开始游戏」按方向键，按钮保留原生键盘行为（方向键不激活它），
  // 也不会凭空长出棋盘。**这一格现在还有一个新理由**：开局界面没有棋盘，也就没有
  // 那个 window 监听——那边方向键仍旧是浏览器的
  const start = page.getByRole('button', { name: '开始游戏' })
  await start.focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('w')
  await expect(start).toBeVisible()
  await expect(page.locator('[data-board]')).toHaveCount(0)

  await start.click()
  await expect(page.locator('[data-board]')).toBeVisible()

  // 焦点落到页面上——点一下棋盘以外的空白就是这个效果。2026-09-28 之前这里方向键
  // 是死的（键盘挂在棋盘元素上，够不着），所有者实测报的就是这一条
  await page.evaluate(() => {
    ;(document.activeElement as HTMLElement | null)?.blur()
  })
  const before = await readBoard(page)
  await page.keyboard.press('ArrowLeft')
  expect(await readBoard(page), '焦点不在棋盘上时方向键推不动棋盘').not.toEqual(before)
})

test('方向键归棋盘、不再滚动页面；滚轮照旧能滚（只有滚轮能滚）', async ({ page }) => {
  // 逼仄的视口：页面一定比它高，于是「滚不滚」是可观测的
  await page.setViewportSize({ width: 1100, height: 420 })
  await page.goto(SEED_URL)
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()
  // 焦点故意丢到页面上，正是「点一下棋盘以外」之后的处境
  await page.evaluate(() => {
    ;(document.activeElement as HTMLElement | null)?.blur()
    window.scrollTo(0, 0)
  })

  // 结构侧的证据：这一下**被应用吃掉了**（preventDefault）。探针监听器注册在应用的
  // window 监听**之后**，所以它看到的 defaultPrevented 就是应用上报的那个值。
  // 注册这一步必须**等它落地**再按键——不等就是一个竞态（上一版就是这么写的，
  // 实测报了一次 flaky）
  await page.evaluate(() => {
    ;(window as typeof window & { __keyPrevented?: boolean }).__keyPrevented = undefined
    window.addEventListener('keydown', (event) => {
      ;(window as typeof window & { __keyPrevented?: boolean }).__keyPrevented =
        event.defaultPrevented
    })
  })
  await page.keyboard.press('ArrowDown')
  const consumed = await page.evaluate(
    () => (window as typeof window & { __keyPrevented?: boolean }).__keyPrevented
  )
  expect(consumed, '方向键没有被吃掉，浏览器会拿它去滚页面').toBe(true)
  expect(await page.evaluate(() => window.scrollY), '方向键把页面滚走了').toBe(0)

  // 行为侧的证据（所有者那半句「仅允许鼠标滚轮滚动」）：滚轮照旧
  await page.mouse.move(550, 200)
  await page.mouse.wheel(0, 400)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
})

test('键位落在棋盘区内的控件上时不移动棋盘（守卫未来插槽控件的路径）', async ({
  page,
}) => {
  await page.goto(SEED_URL)
  await page.getByRole('button', { name: '开始游戏' }).click()
  const before = await readBoard(page)

  // T03 的棋盘区里还没有真实控件，所以这里插一个替身按钮：要证明的是
  // 「事件目标是交互控件就放行」这条守卫本身。T13/T15 若往插槽里放控件，
  // 走的就是同一条路径；少了守卫，玩家在那些控件上按方向键就会误动棋盘。
  await page.evaluate(() => {
    const board = document.querySelector('[data-board]')
    if (!board) throw new Error('棋盘不在 DOM 里')
    const button = document.createElement('button')
    button.type = 'button'
    button.id = 'slot-control'
    button.textContent = '插槽控件替身'
    board.append(button)
  })

  await page.locator('#slot-control').focus()
  await page.keyboard.press('ArrowLeft')
  expect(await readBoard(page)).toEqual(before)

  // 同一按键，焦点回到棋盘就生效——证明上面没动是守卫的功劳，不是键坏了
  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowLeft')
  expect(await readBoard(page)).not.toEqual(before)
})
