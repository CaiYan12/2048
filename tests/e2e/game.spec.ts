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

test('移动键只在棋盘是预定目标时生效', async ({ page }) => {
  await page.goto(SEED_URL)

  // 开局界面：聚焦「开始游戏」按方向键，按钮保留原生键盘行为（方向键不激活它），
  // 也不会凭空长出棋盘
  const start = page.getByRole('button', { name: '开始游戏' })
  await start.focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('w')
  await expect(start).toBeVisible()
  await expect(page.locator('[data-board]')).toHaveCount(0)

  await start.click()
  await expect(page.locator('[data-board]')).toBeVisible()
  const before = await readBoard(page)

  // 焦点离开棋盘（落到页面上）时，方向键不该再推动棋盘
  await page.evaluate(() => {
    ;(document.activeElement as HTMLElement | null)?.blur()
  })
  await page.keyboard.press('ArrowLeft')
  expect(await readBoard(page)).toEqual(before)

  // 焦点回到棋盘，同一个键立刻生效
  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowLeft')
  expect(await readBoard(page)).not.toEqual(before)
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
