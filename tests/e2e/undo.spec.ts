import { expect, test, type Page } from '@playwright/test'

/**
 * T11 的 UI 半边：撤销按钮与键盘 z。
 *
 * **本文件由 T11 编写、不由 T11 执行**（派发令明令：不准跑 playwright、不准开浏览器，
 * 也不准用任何驱动真实浏览器的 MCP）。期望值来自同一条规则内核的离线推演 + 手工推演，
 * 跑不跑由控制人决定。
 *
 * 局面确定性来自 `?seed=` 与 `?board=` 这两条调试缝（见 useGameStore / stores/fixture.ts），
 * 而且**两个都必须给**：只给 `?board=` 不给 `?seed=` 的话，移动之后的生成走随机抽种，
 * 死局夹具腾出的那一格会落到别处去（T08 起的既定口径，run-endings.spec.ts 的
 * startUrl 就是这么拼的）。
 *
 * DOM 契约（task-3-interfaces 定下的那套）：
 *   · [data-board] 是棋盘；[data-tile-id] / [data-value] / [data-row] / [data-col] 是方块；
 *   · [data-score] 是得分；
 *   · 死局面板是 [data-panel="gameover"]，**只有还没结算那一侧**才带「撤销」按钮。
 */

/** 行优先局面 → board 参数值（空串 = 空格） */
function boardQuery(rows: (number | null)[][]): string {
  return rows.flat().map((value) => value ?? '').join(',')
}

/** 开局 URL：固定种子让「移动后的生成」也可预期（与 run-endings.spec.ts 同一拼法） */
function startUrl(rows: (number | null)[][], score = 0, seed = 20260926): string {
  return `/?seed=${seed}&board=${boardQuery(rows)}&score=${score}`
}

/**
 * 一步即死局：第 0 行右端留一个空格，右移把它整体推过去。
 * 空出来的是 (0,0)，生成补上那一格后 16 格全满且横纵相邻都不相等。
 * (0,0) 的邻居全是 8，所以生成 2 还是 4 都死局——这条路径不依赖随机进度。
 * 与 run-endings.spec.ts 的 ONE_STEP_FROM_DEADLOCK 是同一个局面：撤销按钮要恢复的
 * 就是它，两个 spec 报同一张盘才便于对照。
 */
const ONE_STEP_FROM_DEADLOCK: (number | null)[][] = [
  [8, 2, 4, null],
  [8, 2, 4, 8],
  [2, 4, 8, 2],
  [4, 8, 2, 4],
]

/** 普通开局，只固定种子：开局两个方块 (2,0)=2、(3,3)=4（与 game.spec.ts 同一口径） */
const SEED_URL = '/?seed=20260926'

/** 收集 console / page 错误：撤销是新的派发路径，React 警告要当场看见 */
function watchProblems(page: Page): string[] {
  const problems: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  return problems
}

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
    grid[row][col] = Number(await cell.getAttribute('data-value'))
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

async function readScore(page: Page): Promise<number> {
  return Number(await page.locator('[data-score]').textContent())
}

/** 开局：点「开始游戏」，等棋盘就位 */
async function start(page: Page, url: string): Promise<void> {
  await page.goto(url)
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()
}

test('撤销按钮把一次合法移动之后的棋盘搬回来', async ({ page }) => {
  const problems = watchProblems(page)
  await start(page, startUrl(ONE_STEP_FROM_DEADLOCK))

  const opening = await readBoard(page)
  const openingTiles = await readTiles(page)
  expect(await readScore(page)).toBe(0)

  // 一步右移：行 0 推紧、腾出的 (0,0) 由生成补上，随后死局面板弹出
  await page.keyboard.press('ArrowRight')
  const panel = page.locator('[data-panel="gameover"]')
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('heading')).toHaveText('死局')
  // 死局还没结算：没有结束原因（结束原因只在 ended 上出现）
  expect(await panel.getAttribute('data-end-reason')).toBeNull()
  expect(await readBoard(page)).not.toEqual(opening)

  // 面板上必须真的有「撤销」——mode-contract §3 的 stuckRecoveryMoves 第一条。
  // 没有这一步，玩家唯一的出路就是「结束并记录」或「新游戏」，那就不叫可恢复面板了
  await panel.getByRole('button', { name: '撤销' }).click()

  // 棋盘逐格回到开局夹具，方块身份也回到同一批 id
  expect(await readBoard(page)).toEqual(opening)
  // 分数这里**故意不断言**：这条夹具的右移一步是纯滑动，gained = 0，分数从头到尾
  // 没离开过 0——写 expect(score).toBe(0) 会是一句空转的断言（哪怕撤销把分数擦成
  // 别的值也照样绿）。「分数跟着回来」由真正得分的那两条顶着：第 2 条（5 步、末态
  // 得分 12）与第 8 条（右移合并得 4）。
  expect(await readTiles(page)).toEqual(openingTiles)
  // 撤销之后回到活跃局：面板该退下，否则玩家被一个不该在的面板拦住
  await expect(panel).toHaveCount(0)

  expect(problems).toEqual([])
})

test('连续撤销撤过 5 步，回到开局', async ({ page }) => {
  const problems = watchProblems(page)
  await start(page, SEED_URL)
  const opening = await readBoard(page)
  const openingTiles = await readTiles(page)

  // 五步有效移动（与 game.spec.ts 同一条序列：上、左、下、右、上全部有效，
  // 末态得分 12——那条 spec 已经逐格钉过这张盘）
  for (const key of ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp']) {
    await page.keyboard.press(key)
  }
  expect(await readScore(page)).toBe(12)
  expect(await readBoard(page)).not.toEqual(opening)

  // 五次 z 一次一次按：这里要证的正是「每一步撤销都成立」，
  // 不是最后看起来对了一次。任何上限 / 环形缓冲都会在中间某一次露馅
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('z')
  }

  expect(await readBoard(page)).toEqual(opening)
  expect(await readScore(page)).toBe(0)
  // criterion-2 的可见半边：方块身份与位置一起回来
  expect(await readTiles(page)).toEqual(openingTiles)

  expect(problems).toEqual([])
})

test('开局没有撤销入口：此时按 z 什么都不会发生', async ({ page }) => {
  const problems = watchProblems(page)
  await start(page, SEED_URL)
  const opening = await readBoard(page)

  // 死局面板在开局根本不渲染，所以「撤销」这个入口连按钮都不该在 DOM 里——
  // 一个点不动的禁用按钮只会被玩家当成 bug
  await expect(page.getByRole('button', { name: '撤销' })).toHaveCount(0)
  await expect(page.locator('[data-panel="gameover"]')).toHaveCount(0)

  // 历史是空的：按 z 是空操作，棋盘一个格子都不动，也不会绕回别的局面
  await page.keyboard.press('z')
  await page.keyboard.press('Z')
  expect(await readBoard(page)).toEqual(opening)
  expect(await readScore(page)).toBe(0)

  expect(problems).toEqual([])
})

test('结算之后撤销被拒绝：按钮没了，键盘那条路也不通', async ({ page }) => {
  const problems = watchProblems(page)
  await start(page, startUrl(ONE_STEP_FROM_DEADLOCK))
  await page.keyboard.press('ArrowRight')
  const panel = page.locator('[data-panel="gameover"]')
  await expect(panel).toBeVisible()

  const stuck = await readBoard(page)
  await panel.getByRole('button', { name: '结束并记录' }).click()

  // 结算那一侧只剩「新游戏」：撤销入口整个消失
  // （mode-contract §3 关键不变量 4：进入 ended 后 Undo 与作弊交换一律不可用）
  await expect(panel).toHaveAttribute('data-end-reason', 'deadlock')
  await expect(panel.getByRole('button', { name: '撤销' })).toHaveCount(0)

  // 键盘那条路也一并被拒：守卫住在 store 的 undo 里，不是只藏在面板的显隐上
  await page.locator('[data-board]').focus()
  await page.keyboard.press('z')
  expect(await readBoard(page)).toEqual(stuck)

  expect(problems).toEqual([])
})

test('z 在棋盘聚焦时触发撤销，Shift+Z 是同一个键', async ({ page }) => {
  const problems = watchProblems(page)
  await start(page, SEED_URL)
  const opening = await readBoard(page)

  await page.keyboard.press('ArrowUp')
  expect(await readBoard(page)).not.toEqual(opening)

  await page.keyboard.press('z')
  expect(await readBoard(page)).toEqual(opening)

  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Z') // 大写：Board 的 UNDO_KEYS 查表前先 toLowerCase
  expect(await readBoard(page)).toEqual(opening)

  expect(problems).toEqual([])
})

test('Ctrl+Z 不是撤销：组合键整键放行给浏览器', async ({ page }) => {
  const problems = watchProblems(page)
  await start(page, SEED_URL)
  const opening = await readBoard(page)

  await page.keyboard.press('ArrowUp')
  const moved = await readBoard(page)
  expect(moved).not.toEqual(opening)

  // Board.tsx:112 在撤销判断**之前**就为 ctrlKey / metaKey / altKey 放行。
  // 这条断言是把「为什么不用 Ctrl+Z」那个决定钉成可执行的那一半：少了它，
  // 那个决定只是 UNDO_KEYS 上头的一段注释——谁把提前 return 删了都照样全绿。
  await page.keyboard.press('Control+z')
  expect(await readBoard(page)).toEqual(moved)
  // 组合键也不该顺手把分动了：撤销没发生，分数与棋盘一个样
  expect(await readScore(page)).toBe(0)

  // 同一个键去掉修饰键就立刻生效：证明上面那一次没撤销是修饰键的功劳，不是键坏了
  await page.keyboard.press('z')
  expect(await readBoard(page)).toEqual(opening)

  expect(problems).toEqual([])
})

test('z 落在棋盘内的控件上：不撤销，也不吃掉控件自己的激活', async ({ page }) => {
  const problems = watchProblems(page)
  await start(page, SEED_URL)
  const opening = await readBoard(page)
  await page.keyboard.press('ArrowUp')
  const moved = await readBoard(page)
  expect(moved).not.toEqual(opening)

  // T03 的同一条路数：棋盘区里没有真实控件（面板与方向按钮都在 .board 外面，
  // ADR-0002 的固定 DOM 不许塞控件进去），所以插一个替身按钮进去。要证的是
  // 「事件目标是交互控件就放行」这条守卫本身——少了它，玩家在控件上按 z 会误动棋盘。
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
  await page.keyboard.press('z')
  // 一步都没退：守卫把这次按键整键放行给控件了
  expect(await readBoard(page)).toEqual(moved)

  // 同一按键，焦点回到棋盘就生效——证明上面没动是守卫的功劳，不是键坏了
  await page.locator('[data-board]').focus()
  await page.keyboard.press('z')
  expect(await readBoard(page)).toEqual(opening)

  expect(problems).toEqual([])
})

test('面板上的撤销按钮保留原生键盘激活（Enter 照旧触发它；这条路径不经 Board 的守卫）', async ({
  page,
}) => {
  const problems = watchProblems(page)
  await start(page, startUrl(ONE_STEP_FROM_DEADLOCK))
  const opening = await readBoard(page)
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-panel="gameover"]')).toBeVisible()

  // 焦点给面板里的「撤销」，按 Enter：按钮自己的激活要照旧发生。
  //
  // 但要说清楚这条路径**证明了什么**：面板是 .board 的兄弟节点（ADR-0002 的固定
  // DOM，面板与方向按钮都在棋盘壳外面），所以面板上的 keydown 根本不会冒泡到
  // Board 的 onKeyDown——它经过的是按钮的原生行为，不是 isInteractiveTarget 守卫。
  // 换言之：即使把守卫整条删掉，这条用例照样绿。它钉的是「撤销这个新控件没有把
  // 键盘激活关掉」这一件 UI 事实；守卫的键位半边由第 6 条（棋盘内插的替身控件）钉。
  await page
    .locator('[data-panel="gameover"]')
    .getByRole('button', { name: '撤销' })
    .focus()
  await page.keyboard.press('Enter')
  expect(await readBoard(page)).toEqual(opening)

  expect(problems).toEqual([])
})

test('撤销之后分数与方块身份一起回到前值（criterion-2 的可见半边）', async ({ page }) => {
  const problems = watchProblems(page)
  await start(page, SEED_URL)

  // 上、左两步：与 game.spec.ts 同一条序列，此刻还没有合并，得分仍是 0、盘上 4 块
  //（开局 2 块 + 两次生成）
  for (const key of ['ArrowUp', 'ArrowLeft']) await page.keyboard.press(key)
  const beforeScoring = await readBoard(page)
  const beforeScoringTiles = await readTiles(page)

  // 下、右两步：右移把同行两个 2 合成一个 4，得分 4（game.spec.ts 逐格钉过这张盘）。
  // 注意得分的是**右移**：下移纯滑动，gained = 0
  for (const key of ['ArrowDown', 'ArrowRight']) await page.keyboard.press(key)
  expect(await readScore(page)).toBe(4)

  // 两次 z——因为一次 z 只撤一步。撤掉的第一步是得分那一步（ArrowRight），
  // 此时棋盘停在 ArrowDown 之后的局面、分数已回 0，但还不是上面抓的快照；
  // 第二次 z 才把 ArrowDown 也撤掉，棋盘与身份一起回到快照。
  // 刻意不用「快照贴到得分那一步之前 + 按一次 z」的写法：那样「每按一次只退一格」
  // 这条性质就看不见了。两步两撤，按少了自然红。
  await page.keyboard.press('z')
  await page.keyboard.press('z')

  expect(await readScore(page)).toBe(0)
  expect(await readBoard(page)).toEqual(beforeScoring)
  // 身份逐个回来：同一批 data-tile-id，位置也一起回来
  //（合并会吞掉一个身份并新生成一块，撤销之后那两块都回来了，所以方块数也会多一个）
  expect(await readTiles(page)).toEqual(beforeScoringTiles)

  expect(problems).toEqual([])
})
