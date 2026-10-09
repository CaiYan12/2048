import { expect, test, type Page } from '@playwright/test'

/**
 * T12 的 UI 半边：作弊交换——规则、选择态、两个入口、键盘/Esc 路径、障碍限制与操作播报。
 *
 * **本文件由 T12 编写、不由 T12 执行**（派发令明令：不准跑 playwright、不准开浏览器，
 * 也不准用任何驱动真实浏览器的 MCP / Puppeteer / 会开真实窗口的东西）。期望值来自同一
 * 套规则内核的离线推演 + 手工推演，跑不跑由控制人决定。
 *
 * 局面确定性来自 `?seed=` 与 `?board=` 这两条调试缝（见 stores/fixture.ts），而且
 * **两个都必须给**：只给 `?board=` 不给 `?seed=` 的话，`createGame` 抽的是随机种子，
 * 「移动之后的生成」会飘（T08 起的既定口径，run-endings.spec.ts 与 undo.spec.ts 都
 * 是这么拼的）。纯交换本身不生成、不消耗随机进度，但**走到死局要靠一次移动**，
 * 那一步会生成——所以只给 seed 不给 board 会飘，两个都给才钉得死。
 *
 * DOM 契约（在 task-3-interfaces 那套之上，T12 新增的都在这里）：
 *   · 方块元素 = `.board__tile`，带 data-tile-id / data-value / data-row / data-col；
 *   · 拾取中才出现 data-selectable，被选中的那一枚才出现 data-selected（board.css 描环）；
 *   · 入口 = StatusBar 里的「交换 / 取消交换」按钮与死局面板上的「交换」；
 *   · 操作播报 = StatusBar 里那句「已选择第 X 行第 Y 列，再选一枚方块完成交换」。
 *   底板格 `.board__cell` 有 pointer-events:none：墙与空格的点击到不了任何方块元素，
 *   这正是「墙不能被选中」的结构性原因。
 */

/** 行优先局面 → board 参数值（空串 = 空格） */
function boardQuery(rows: (number | null)[][]): string {
  return rows.flat().map((value) => value ?? '').join(',')
}

/** 开局 URL：固定种子让「移动后的生成」也可预期 */
function startUrl(rows: (number | null)[][], score = 0, seed = 20260926): string {
  return `/?seed=${seed}&board=${boardQuery(rows)}&score=${score}`
}

/**
 * 留了一个空格的活跃局：第 0 行 2 4 8 16、第 1 行 4 8 16 2、第 2 行 8 16 2 4、
 * 第 3 行 16 2 4 8（(3,3) 空着）。因为有一个空格，四个方向都推得动，所以它是
 * 一个**活跃局**而不是死局——键盘与指针那几条用例要的就是这个普通场景。
 *
 * 换 (0,0) 与 (0,1) 之后第 0 行变成 4 2 8 16：仍然有 (3,3) 这个空格，四个方向依旧
 * 推得动，phase 保持 playing。所以这几条用例断言的是「棋盘变了、分数没变、
 * 面板没冒出来」，不掺死局那一层。
 */
const ACTIVE: (number | null)[][] = [
  [2, 4, 8, 16],
  [4, 8, 16, 2],
  [8, 16, 2, 4],
  [16, 2, 4, null],
]

/** ACTIVE 换过 (0,0)↔(0,1) 之后的样子，逐格手算 */
const ACTIVE_SWAPPED: (number | null)[][] = [
  [4, 2, 8, 16],
  [4, 8, 16, 2],
  [8, 16, 2, 4],
  [16, 2, 4, null],
]

/**
 * 一步即死局：第 0 行右端留一个空格，右移把它整体推过去。
 * 空出来的是 (0,0)，生成补上那一格后 16 格全满且横纵相邻都不相等。
 * (0,0) 的右邻是 8、下邻是 8，所以生成 2 还是 4 都死局——这条路径不依赖随机进度。
 * 与 run-endings.spec.ts / undo.spec.ts 的 ONE_STEP_FROM_DEADLOCK 是同一个局面。
 */
const ONE_STEP_FROM_DEADLOCK: (number | null)[][] = [
  [8, 2, 4, null],
  [8, 2, 4, 8],
  [2, 4, 8, 2],
  [4, 8, 2, 4],
]

/**
 * 障碍模式的可玩局面：障碍落在契约冻结的居中 2×2 块上（fixture 按模式声明保持 wall），
 * (0,3) 空着所以四个方向都推得动。(1,1) 是墙，正是「墙不能被选中」那一击的目标。
 *
 * 换 (0,0) 与 (0,1) 之后第 0 行变成 4 2 8 _，仍然有那个空格，仍是活跃局。
 */
const WALLS: (number | null)[][] = [
  [2, 4, 8, null],
  [4, null, null, 2],
  [8, null, null, 4],
  [16, 2, 4, 8],
]

/** 收集 console / page 错误：交换是新的派发路径，React 警告要当场看见 */
function watchProblems(page: Page): string[] {
  const problems: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  return problems
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

interface TileSnapshot {
  id: string
  value: number
  row: number
  col: number
}

/** 方块快照：身份 + 位置 + 数值。交换要钉的正是「同一批身份换了位置」 */
async function readTiles(page: Page): Promise<TileSnapshot[]> {
  const tiles = page.locator('[data-tile-id]')
  const snapshots: TileSnapshot[] = []
  for (let index = 0; index < (await tiles.count()); index++) {
    const tile = tiles.nth(index)
    snapshots.push({
      id: (await tile.getAttribute('data-tile-id')) ?? '',
      value: Number(await tile.getAttribute('data-value')),
      row: Number(await tile.getAttribute('data-row')),
      col: Number(await tile.getAttribute('data-col')),
    })
  }
  return snapshots
}

/**
 * 方块快照 → 「身份编号 → 数值」。
 *
 * 为什么非要这张表、不直接逐位比快照数组：`Board.tsx` 的 `key={cell.id}` 让 React
 * 按 key 复用 DOM 节点，于是节点被**重排**成新 children 的顺序——交换 1、2 号之后
 * 键序列从 [1,2,3,…] 变成 [2,1,3,…]（T21 的位移动画要的正是这个节点复用，
 * 见 T03 的稳定身份裁决）。而 readTiles 走的是 document order（`nth(index)`），
 * 收到的列表因此是同一批方块的另一种排列。逐位比 `toEqual` 会在一次**纯重排**上
 * 误报失败；「身份 → 数值」这张表与顺序无关，才是这里真正要证的东西。
 */
function valueById(tiles: TileSnapshot[]): Record<string, number> {
  const table: Record<string, number> = {}
  for (const tile of tiles) table[tile.id] = tile.value
  return table
}

/**
 * 方块快照 → 「身份编号 → 这一枚的全部事实（数值 + 位置）」。
 *
 * 与 valueById 同一条理由，只是多带位置。**document order 不是一条安全的比较基准**，
 * 所以凡是「同一批方块」的比较都按身份索引做，理由就是上面那段：节点被 React 按 key
 * 复用与重排，`nth(index)` 收到的只是同一批方块的另一种排列。
 *
 * 这一点对本文件尤其要紧：这里断言的每一句「哪些棋子换了位置、哪些没动」都以「哪一枚
 * 是哪一枚」为前提。按 document order 逐位比，一次纯重排就能让「对的那次交换」读成红，
 * 而红色指向的原因（顺序）与交换做对了没有毫无关系——T12 因此埋过一次，T21 的位移动效
 * 让重排从偶发变成必然，所以剩下的两处都在这里换成按身份索引。
 */
function snapshotById(tiles: TileSnapshot[]): Record<string, Omit<TileSnapshot, 'id'>> {
  const table: Record<string, Omit<TileSnapshot, 'id'>> = {}
  for (const tile of tiles) {
    table[tile.id] = { value: tile.value, row: tile.row, col: tile.col }
  }
  return table
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

/** 开局前先选模式：e2e 没有模式 URL 入口（与 walls.spec.ts 同一口径） */
async function startWalls(page: Page, rows: (number | null)[][]): Promise<void> {
  await page.goto(startUrl(rows))
  await page.getByRole('button', { name: '障碍' }).click()
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toHaveAttribute('data-mode', 'walls')
}

/** 按 [row][col] 取那一枚方块 */
function tileAt(page: Page, row: number, col: number) {
  return page.locator(`.board__tile[data-row="${row}"][data-col="${col}"]`)
}

test('纯键盘完成一次交换：进拾取态、选第一枚、选第二枚、确认', async ({ page }) => {
  const problems = watchProblems(page)
  await start(page, startUrl(ACTIVE, 500))
  const opening = await readBoard(page)
  const openingTiles = await readTiles(page)
  expect(await readScore(page)).toBe(500)
  // 开局后焦点在棋盘上（Board 的挂载 effect）。显式再给一次：别的用例（如
  // run-endings.spec.ts）也会先 focus，说明这一步不依赖时序巧合
  await page.locator('[data-board]').focus()

  // 拾取态是整条键盘路径的入口。Shift+Tab 从棋盘回到它。T42 起风格选择器搬进了设置
  // 抽屉（行为变化要求的更新）：局中页面上棋盘的上一个停靠点就是状态条上的「交换」，
  // 一步就到——「走得到交换入口」这条语义不变，中间穿过选择器的那一段没有了
  await page.keyboard.press('Shift+Tab')
  await expect(page.getByRole('button', { name: '交换' })).toBeFocused()
  await page.keyboard.press('Enter')
  // 按钮文案变「取消交换」、aria-pressed 变 true——拾取态开着这件事要说出来
  await expect(page.getByRole('button', { name: '取消交换' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  // 拾取中的方块带 data-selectable，且进了 Tab 序列
  await expect(page.locator('.board__tile[data-selectable="true"]').first()).toBeVisible()

  // 导航到第一枚方块：T42 起风格选择器在抽屉里，交换入口的下一个停靠点就是棋盘根，
  // 一步就到（与上面那条 Shift+Tab 同一次前提变化）
  await expect(page.locator('[data-board]')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.locator('[data-tile-id="1"]')).toBeFocused()

  // 激活 = 拾取第一枚
  await page.keyboard.press('Enter')
  await expect(page.getByText('已选择第 1 行第 1 列，再选一枚方块完成交换')).toBeVisible()
  // 被拾取的那一枚描环（board.css 的 data-selected）
  await expect(page.locator('.board__tile[data-selected="true"]')).toHaveCount(1)
  await expect(page.locator('[data-tile-id="1"]')).toHaveAttribute('data-selected', 'true')
  // 只拾取、还没交换：棋盘与分数一个格子都不动
  expect(await readBoard(page)).toEqual(opening)
  expect(await readScore(page)).toBe(500)

  // 导航到另一枚，再按一次 Enter = 确认，交换完成
  await page.keyboard.press('Tab')
  await expect(page.locator('[data-tile-id="2"]')).toBeFocused()
  await page.keyboard.press('Enter')

  // 两枚方块换了位置：1 号（值 2）到了第 1 行第 2 列，2 号（值 4）到了第 1 行第 1 列
  await expect(page.locator('[data-tile-id="1"]')).toHaveAttribute('data-col', '1')
  await expect(page.locator('[data-tile-id="2"]')).toHaveAttribute('data-col', '0')
  expect(await readBoard(page)).toEqual(ACTIVE_SWAPPED)
  // 分数不变：作弊交换的承诺（用户故事 15）
  expect(await readScore(page)).toBe(500)
  // 拾取态收摊：按钮回到「交换」，播报退下，方块不再是 Tab 停靠点
  await expect(page.getByRole('button', { name: '交换' })).toBeVisible()
  await expect(page.locator('.board__tile[data-selectable="true"]')).toHaveCount(0)
  // 这一次交换进了撤销历史：按 z 把交换前的棋盘整盘搬回来
  await page.locator('[data-board]').focus()
  await page.keyboard.press('z')
  expect(await readBoard(page)).toEqual(opening)
  // 按身份编号索引再比，**不按 document order 逐位比**（理由见 snapshotById 的注释）
  expect(snapshotById(await readTiles(page))).toEqual(snapshotById(openingTiles))
  expect(await readScore(page)).toBe(500)

  expect(problems).toEqual([])
})

test('Esc 退出交换：选择清空、拾取态关掉、棋盘一个格子都没动', async ({ page }) => {
  const problems = watchProblems(page)
  await start(page, startUrl(ACTIVE, 500))
  const opening = await readBoard(page)

  await page.getByRole('button', { name: '交换' }).click()
  await page.locator('[data-tile-id="1"]').click()
  await expect(page.getByText('已选择第 1 行第 1 列，再选一枚方块完成交换')).toBeVisible()

  // 焦点在被拾取的那一枚上（点它的时候给的），Esc 冒泡到棋盘根的处理器。
  // 用户故事 16 的「不用指针退出交换」就是这一下
  await page.keyboard.press('Escape')

  await expect(page.getByText('已选择第 1 行第 1 列')).toHaveCount(0)
  await expect(page.getByText('请选择第一枚方块，Esc 退出')).toHaveCount(0)
  // 拾取态关掉：按钮回到未按下态，方块退出 Tab 序列
  await expect(page.getByRole('button', { name: '交换' })).toBeVisible()
  await expect(page.getByRole('button', { name: '交换' })).toHaveAttribute(
    'aria-pressed',
    'false'
  )
  await expect(page.locator('.board__tile[data-selectable="true"]')).toHaveCount(0)
  // 什么都没发生：棋盘、分数、历史都没动
  expect(await readBoard(page)).toEqual(opening)
  expect(await readScore(page)).toBe(500)

  // 键盘没有因此失灵：退出之后方向键照旧推得动棋盘（这是「焦点还给棋盘」那条
  // effect 存在的理由，少了它 Esc 之后方向键会掉到 body 上）。
  // ACTIVE 的有效方向是 right 与 down：left / up 在这张盘上推不动任何一枚
  await page.keyboard.press('ArrowRight')
  expect(await readBoard(page)).not.toEqual(opening)

  expect(problems).toEqual([])
})

test('同一枚方块拾取两次 = 取消选择，拾取态仍然开着', async ({ page }) => {
  const problems = watchProblems(page)
  await start(page, startUrl(ACTIVE, 500))
  const opening = await readBoard(page)

  await page.getByRole('button', { name: '交换' }).click()
  await page.locator('[data-tile-id="1"]').click()
  await expect(page.getByText('已选择第 1 行第 1 列，再选一枚方块完成交换')).toBeVisible()

  // 再点同一枚：取消（ticket 验收标准 1），只清选择、不关拾取
  await page.locator('[data-tile-id="1"]').click()

  await expect(page.getByText('已选择第 1 行第 1 列')).toHaveCount(0)
  await expect(page.getByText('请选择第一枚方块，Esc 退出')).toBeVisible()
  await expect(page.locator('.board__tile[data-selected="true"]')).toHaveCount(0)
  expect(await readBoard(page)).toEqual(opening)
  expect(await readScore(page)).toBe(500)

  // 拾取态还开着：立刻另选一枚就还能交换，不必从入口重来
  await page.locator('[data-tile-id="1"]').click()
  await expect(page.getByText('已选择第 1 行第 1 列，再选一枚方块完成交换')).toBeVisible()

  expect(problems).toEqual([])
})

test('指针完成一次交换：点两枚方块，分数不变', async ({ page }) => {
  const problems = watchProblems(page)
  await start(page, startUrl(ACTIVE, 500))
  const openingTiles = await readTiles(page)

  await page.getByRole('button', { name: '交换' }).click()
  // 第一枚：轻点。这里走的是 Board 的 pointerup 判定而不是 tile 上的 click——
  // setPointerCapture 会把 click 重定向到 .board（见 Board.tsx 的 pickCandidate）
  await page.locator('[data-tile-id="1"]').click()
  await expect(page.getByText('已选择第 1 行第 1 列，再选一枚方块完成交换')).toBeVisible()
  // 第二枚：完成
  await page.locator('[data-tile-id="2"]').click()

  expect(await readBoard(page)).toEqual(ACTIVE_SWAPPED)
  expect(await readScore(page)).toBe(500)
  // 身份与数值的对应关系一枚都没变：交换只动位置，不动数值、不重新编号。
  // 按身份编号索引再比，**不按 document order 逐位比**（理由见 valueById 的注释）
  const swappedTiles = await readTiles(page)
  // 长度先单独断：相等就证明「一枚不多一枚不少」，也把「这次失败若只是因为顺序」
  // 变成看得见的事实，而不是下一次读红时靠推断才知道
  expect(swappedTiles).toHaveLength(openingTiles.length)
  expect(valueById(swappedTiles)).toEqual(valueById(openingTiles))
  // 位置逐个钉：1 号与 2 号对调，其余一枚都没挪
  expect(swappedTiles.find((tile) => tile.id === '1')).toMatchObject({
    row: 0,
    col: 1,
    value: 2,
  })
  expect(swappedTiles.find((tile) => tile.id === '2')).toMatchObject({
    row: 0,
    col: 0,
    value: 4,
  })
  // 其余一枚都没挪。同样按身份编号索引再比——逐位比 document order 的话，
  // 一次纯重排就会把这句读成红，而红色指向的原因与交换做对了没有毫无关系
  // （T21 的位移动效把重排从偶发变成必然，理由见 snapshotById 的注释）
  expect(
    snapshotById(swappedTiles.filter((tile) => tile.id !== '1' && tile.id !== '2'))
  ).toEqual(snapshotById(openingTiles.filter((tile) => tile.id !== '1' && tile.id !== '2')))
  // 换到的位置与棋盘网格一致
  await expect(page.locator('[data-tile-id="1"]')).toHaveAttribute('data-col', '1')
  await expect(page.locator('[data-tile-id="2"]')).toHaveAttribute('data-col', '0')

  expect(problems).toEqual([])
})

test('障碍不能被选中：点到墙的位置什么都不会发生', async ({ page }) => {
  const problems = watchProblems(page)
  await startWalls(page, WALLS)
  const opening = await readBoard(page)
  expect(await readScore(page)).toBe(0)

  // 结构上的理由：墙不是方块，所以墙的位置上根本没有 [data-tile-id]。
  // （底板格有 pointer-events:none，点下去命中的是棋盘容器，不是任何一枚方块）
  await expect(tileAt(page, 1, 1)).toHaveCount(0)
  await expect(page.locator('.board__cell[data-cell="wall"]')).toHaveCount(4)

  await page.getByRole('button', { name: '交换' }).click()
  await tileAt(page, 0, 0).click()
  await expect(page.getByText('已选择第 1 行第 1 列，再选一枚方块完成交换')).toBeVisible()

  // 墙 (1,1) 的中心：用两枚方块的包围盒推出格距，再从 (0,0) 平移一格。
  // 不用 .board__cell[data-cell=wall] 直接 click：它有 pointer-events:none，
  // playwright 的可点击性检查会在它上面超时
  const anchor = await tileAt(page, 0, 0).boundingBox()
  const right = await tileAt(page, 0, 1).boundingBox()
  const below = await tileAt(page, 1, 0).boundingBox()
  if (!anchor || !right || !below) throw new Error('量不到方块位置')
  const pitchX = right.x - anchor.x
  const pitchY = below.y - anchor.y
  await page.mouse.click(anchor.x + pitchX + anchor.width / 2, anchor.y + pitchY + anchor.height / 2)

  // 选择原样留着、棋盘一个格子都没动、也没有多出一条历史
  await expect(page.getByText('已选择第 1 行第 1 列，再选一枚方块完成交换')).toBeVisible()
  await expect(page.locator('.board__tile[data-selected="true"]')).toHaveCount(1)
  expect(await readBoard(page)).toEqual(opening)
  expect(await readScore(page)).toBe(0)

  // 换个真正可选的方块，交换照旧完成——证明上面那一下「没反应」是墙的功劳，
  // 不是输入路径坏了
  await tileAt(page, 0, 1).click()
  expect(await readBoard(page)).toEqual([
    [4, 2, 8, null],
    [4, null, null, 2],
    [8, null, null, 4],
    [16, 2, 4, 8],
  ])
  expect(await readScore(page)).toBe(0)

  expect(problems).toEqual([])
})

test('死局之后的交换：换开了就回到活跃局，还能接着走', async ({ page }) => {
  const problems = watchProblems(page)
  await start(page, startUrl(ONE_STEP_FROM_DEADLOCK))

  // 一步右移把第 0 行推紧、腾出的 (0,0) 由生成补上，随后死局面板弹出
  await page.keyboard.press('ArrowRight')
  const panel = page.locator('[data-panel="gameover"]')
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('heading')).toHaveText('死局')
  const deadlocked = await readBoard(page)
  // 满盘：16 枚方块，四方向皆无合法移动
  expect(deadlocked.flat().every((cell) => cell !== null)).toBe(true)

  // 死局面板上的「交换」：mode-contract §3 的 stuckRecoveryMoves 第二条
  await panel.getByRole('button', { name: '交换' }).click()
  // 面板收起——T26 起它是半透明遮罩 + 不透明卡片（ADR-0008），「看得见棋盘」不等于
  // 「点得到棋盘」：遮罩照旧把指针接得牢牢的，不收起点不到底下的方块
  await expect(panel).toHaveCount(0)
  await expect(page.getByText('请选择第一枚方块，Esc 退出')).toBeVisible()

  // 换 (0,1) 与 (1,1)：第 0 行变成 [生成值, 2, 2, 4]，出现一对相邻相等方块。
  // 与生成值是 2 还是 4 无关（这一格的值由 ?seed= 钉死，但它不参与这个判断），
  // 所以这条不依赖随机进度
  await tileAt(page, 0, 1).click()
  await expect(page.getByText('已选择第 1 行第 2 列，再选一枚方块完成交换')).toBeVisible()
  await tileAt(page, 1, 1).click()

  // 面板没有回来：phase 由引擎重判回 playing（mode-contract §3 的
  // 「恢复成功 → playing」）
  await expect(page.locator('[data-panel]')).toHaveCount(0)
  const swapped = await readBoard(page)
  expect(swapped).not.toEqual(deadlocked)
  // 换出来的正是那一对相邻相等方块
  expect(swapped[0][1]).toBe(2)
  expect(swapped[0][2]).toBe(2)
  expect(swapped[1][0]).toBe(8)
  expect(swapped[1][1]).toBe(8)

  // 真的能接着走：左移把两对相等方块各自合并，棋盘动了。
  // 得分 20 = 4 + 16：第 0 行那一对 2+2 → 4（加产物的值，mode-contract §2 的同一条
  // 规则），第 1 行那一对 8+8 → 16。两对的数值都与生成值无关，所以这条不依赖随机进度
  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowLeft')
  expect(await readBoard(page)).not.toEqual(swapped)
  expect(await readScore(page)).toBe(20)

  // 这一次交换同样进了历史：两次 z 先撤回左移、再撤回交换，死局那一盘整盘回来，
  // 面板跟着回来（stuck 没有被交换抹掉，只是被恢复了）
  await page.keyboard.press('z')
  await page.keyboard.press('z')
  expect(await readBoard(page)).toEqual(deadlocked)
  await expect(panel).toBeVisible()

  expect(problems).toEqual([])
})

test('结算之后没有交换入口：面板上不摆，键盘也进不去', async ({ page }) => {
  const problems = watchProblems(page)
  await start(page, startUrl(ONE_STEP_FROM_DEADLOCK))
  await page.keyboard.press('ArrowRight')
  const panel = page.locator('[data-panel="gameover"]')
  await expect(panel).toBeVisible()
  await panel.getByRole('button', { name: '结束并记录' }).click()
  await expect(panel).toHaveAttribute('data-end-reason', 'deadlock')

  // 结算那一侧只剩「新游戏」：mode-contract §3 关键不变量 4
  await expect(panel.getByRole('button', { name: '交换' })).toHaveCount(0)
  // StatusBar 也不给入口（playing / stuck 才露头，ended 不摆一个点不动的按钮）
  await expect(page.getByRole('button', { name: '交换' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '取消交换' })).toHaveCount(0)
  // 于是没有任何一枚方块带 data-selectable：键盘上没有可以「激活」的目标，
  // 指针上也没有可以点的目标——入口消失比入口存在却无反应诚实
  await expect(page.locator('.board__tile[data-selectable="true"]')).toHaveCount(0)

  // 在棋盘上按 Enter 也换不动：守卫住在 store 的 selectCell 里，不在面板显隐上
  const settled = await readBoard(page)
  await page.locator('[data-board]').focus()
  await page.keyboard.press('Enter')
  expect(await readBoard(page)).toEqual(settled)

  expect(problems).toEqual([])
})
