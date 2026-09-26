import { expect, test, type Browser, type Page } from '@playwright/test'

/**
 * T21 的 UI 半边：方块动效与 reduced-motion 静态替代。
 *
 * **本文件由 T21 编写、不由 T21 执行**（派发令明令：不准跑 playwright、不准开浏览器）。
 * 期望值来自同一套规则内核的离线推演，跑不跑由控制人决定。
 *
 * 边界先说清楚，免得读的人以为这里证了更多东西：
 *
 *   · **能证的（behavioural）**：同一个 data-tile-id 换了 data-row / data-col 而节点
 *     没有多出来；一次合并只在产物那一格留下一枚方块；reduced-motion 下 transform
 *     过渡真的不存在、棋盘照旧推得动、分数照旧涨；连打不丢输入。
 *   · **证不了的（visual）**：动起来**好不好看**。过渡存在 ≠ 曲线舒服 ≠ 时长合适，
 *     那一半只能由真实浏览器截图/录屏回答，不在这份断言的能力范围内。
 *
 * 局面确定性来自 `?seed=` 与 `?board=` 这两条调试缝（同 swap.spec.ts 的口径：两个都
 * 必须给，只给 board 的话「移动之后的生成」会飘）。夹具按行优先编号，所以开局时
 * `data-tile-id` 就是 1、2、3…，可以逐枚写死。
 */

/** 行优先局面 → board 参数值（空串 = 空格） */
function boardQuery(rows: (number | null)[][]): string {
  return rows.flat().map((value) => value ?? '').join(',')
}

/** 开局 URL：固定种子让「移动之后的生成」也可预期 */
function startUrl(rows: (number | null)[][], score = 0, seed = 20260926): string {
  return `/?seed=${seed}&board=${boardQuery(rows)}&score=${score}`
}

/**
 * 一次纯位移的局面：只有 (0,1) 一个空格，其余 15 格填满且横竖相邻都不相等。
 * 向左一按只有第 0 行会动（2 8 16 挤到前三格），不产生任何合并——这条用例要的
 * 就是「没有合并」。
 * 顺带把局面钉死：走完之后唯一的空格是 (0,3)，所以生成**必然**落在那格上，
 * 「哪一枚是新的」因此不必赌随机进度（值仍是 2 或 4，那一条不断）。
 */
const MOVE_ONLY: (number | null)[][] = [
  [2, null, 8, 16],
  [4, 8, 16, 2],
  [8, 16, 2, 4],
  [16, 2, 4, 32],
]

/** MOVE_ONLY 向左之后第 0 行的前三格（第四格是这一动新生成的） */
const MOVE_ONLY_AFTER_ROW0 = [2, 8, 16]

/**
 * 一次合并的局面：第 0 行 2 2，其余空。向左一按，引擎把身份归「落在目标格上」的那一枚
 * （board.ts 的 placed.push），于是 id 1 变成 4、id 2 从 DOM 上消失。
 */
const MERGE: (number | null)[][] = [
  [2, 2, null, null],
  [null, null, null, null],
  [null, null, null, null],
  [null, null, null, null],
]

/**
 * 一次达标：1024 + 1024 → 2048，同一动既合并又翻转 reachedTarget。
 * 局面里原本没有 2048，所以开局 reachedTarget 是 false，胜利面板只在这一动冒头。
 */
const WIN: (number | null)[][] = [
  [1024, 1024, null, null],
  [null, null, null, null],
  [null, null, null, null],
  [null, null, null, null],
]

/** 收集 console / page 错误：新挂上的属性与 CSS 若有 React 警告要当场看见 */
function watchProblems(page: Page): string[] {
  const problems: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  return problems
}

/** 开局：点「开始游戏」，等棋盘就位 */
async function start(page: Page, url: string): Promise<void> {
  await page.goto(url)
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()
}

/** 方块快照：身份 + 位置 + 数值。动效要钉的正是「同一批身份换了位置」 */
interface TileSnapshot {
  id: string
  value: number
  row: number
  col: number
}

async function readTiles(page: Page): Promise<TileSnapshot[]> {
  const tiles = page.locator('[data-tile-id]')
  const snapshots: TileSnapshot[] = []
  for (let index = 0; index < (await tiles.count()); index += 1) {
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

/** 从 DOM 还原棋盘：有方块才有 data-tile-id，逐格按 data-row / data-col 索引 */
async function readBoard(page: Page): Promise<(number | null)[][]> {
  const cellCount = await page.locator('.board__cell').count()
  const size = Math.sqrt(cellCount)
  const grid: (number | null)[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, (): number | null => null)
  )
  for (const tile of await readTiles(page)) grid[tile.row][tile.col] = tile.value
  return grid
}

/** 一个方块上的动效相关计算样式。参数是选择器，好让「那一枚」不必先知道身份 */
async function tileStyle(page: Page, selector: string): Promise<Record<string, string>> {
  return page.locator(selector).evaluate((el) => {
    const style = getComputedStyle(el)
    return {
      transitionProperty: style.transitionProperty,
      transitionDuration: style.transitionDuration,
      animationName: style.animationName,
      animationDuration: style.animationDuration,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    }
  })
}

test('位移连续：同一个 data-tile-id 换格，节点没有多出来，过渡真的挂在 transform 上', async ({
  page,
}) => {
  const problems = watchProblems(page)
  await start(page, startUrl(MOVE_ONLY))

  // 开局 15 枚：满盘只留 (0,1) 一个空格
  await expect(page.locator('[data-tile-id]')).toHaveCount(15)
  await expect(page.locator('[data-tile-id="3"]')).toHaveAttribute('data-col', '2')
  await expect(page.locator('[data-tile-id="4"]')).toHaveAttribute('data-col', '3')

  // 在 3 号那枚的 DOM 节点上打一个 React 管不着的印记。
  // **这是「同一个节点走过来」唯一可证的形式**：位移动画是不可见的中间态，而 DOM 属性
  // （data-row / data-col / data-value）在「节点滑过去」与「就地卸载重画」两种实现下
  // 完全一样——只有节点本身换没换能分辨。换成位置做 key 时 React 会为新的 key 建一个
  // 新节点、把旧节点卸载，印记跟着旧节点一起消失，所以这一条正是那道闸门
  await page.locator('[data-tile-id="3"]').evaluate((el) => {
    el.setAttribute('data-t21-node-mark', 'kept')
  })

  // 移动前就有一条 transform 过渡在（不是这一动才加上来的）：位移的载体从开局那一刻
  // 就在，换格只是让浏览器补中间帧
  const before = await tileStyle(page, '[data-tile-id="3"]')
  expect(before.transitionProperty).toContain('transform')
  expect(parseFloat(before.transitionDuration)).toBeGreaterThan(0)

  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowLeft')

  // 身份不变、位置变了——这就是「同一枚方块走过去」的全部可证部分
  await expect(page.locator('[data-tile-id="3"]')).toHaveAttribute('data-col', '1')
  await expect(page.locator('[data-tile-id="4"]')).toHaveAttribute('data-col', '2')
  await expect(page.locator('[data-tile-id="1"]')).toHaveAttribute('data-col', '0')
  await expect(page.locator('[data-tile-id="1"]')).toHaveAttribute('data-value', '2')

  // 印记还在 ⇒ 走过来的就是开局那一个节点，不是就地重画的一个新节点
  await expect(page.locator('[data-tile-id="3"]')).toHaveAttribute('data-t21-node-mark', 'kept')

  // 一枚不多一枚不少：每个身份在 DOM 上只有一个节点（key 变化导致的卸载重挂会
  // 让同一枚方块跳而不是滑；而那正是不改 key 的全部理由）
  for (const id of ['1', '3', '4']) {
    await expect(page.locator(`[data-tile-id="${id}"]`)).toHaveCount(1)
  }
  // 原样 15 枚 + 这一动生成的一枚 = 16 枚，一个多余的节点都没有
  await expect(page.locator('[data-tile-id]')).toHaveCount(16)

  // 这一动没有任何合并：data-merge 一个都不该出现
  await expect(page.locator('.board__tile[data-merge="true"]')).toHaveCount(0)

  // 整副棋盘逐格钉死（第四格是新的那一枚，值不断）：满盘只有一个空格，走完它正好
  // 被补上，所以其余 15 格一个字节都不该差
  const board = await readBoard(page)
  expect(board.slice(1)).toEqual(MOVE_ONLY.slice(1))
  expect(board[0].slice(0, 3)).toEqual(MOVE_ONLY_AFTER_ROW0)
  expect(board[0][3]).toBeGreaterThanOrEqual(2)
  // 没有合并就没有加分
  await expect(page.locator('[data-score]')).toHaveText('0')

  expect(problems).toEqual([])
})

test('生成入场：新入盘的那一枚带 data-spawn，且全盘只有它带', async ({ page }) => {
  const problems = watchProblems(page)
  await start(page, startUrl(MOVE_ONLY))

  // 开局 15 枚是「棋盘第一次出现」，按裁决不该有任何动效旗标——
  // diffTileMotion 的第一条早退就是为这个，否则每次刷新都要看一遍整盘淡入
  await expect(page.locator('.board__tile[data-spawn="true"]')).toHaveCount(0)

  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowLeft')

  // 满盘只留一个空格，走的正是它：新生成的那一枚就在 (0,3)
  const spawned = page.locator('.board__tile[data-spawn="true"]')
  await expect(spawned).toHaveCount(1)
  await expect(spawned).toHaveAttribute('data-row', '0')
  await expect(spawned).toHaveAttribute('data-col', '3')
  // 入场是 @starting-style + 过渡：属性在，规则由 CSS 兑现（裁决表见 TileMotion.ts）
  const style = await tileStyle(page, '.board__tile[data-spawn="true"]')
  expect(style.transitionProperty).toContain('opacity')
  expect(parseFloat(style.transitionDuration)).toBeGreaterThan(0)

  expect(problems).toEqual([])
})

test('一次合并只产出一个方块：产物带 data-merge，被吞的那一枚不在 DOM 里', async ({ page }) => {
  const problems = watchProblems(page)
  await start(page, startUrl(MERGE))

  await expect(page.locator('[data-tile-id]')).toHaveCount(2)
  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowLeft')

  // 产物就在合并那一格上：身份 1、数值 4
  const product = page.locator('[data-tile-id="1"]')
  await expect(product).toHaveCount(1)
  await expect(product).toHaveAttribute('data-value', '4')
  await expect(product).toHaveAttribute('data-row', '0')
  await expect(product).toHaveAttribute('data-col', '0')

  // **一个，不是两个**：被吞掉的 2 号从 DOM 上消失，合并那一格只有一个节点。
  // 这是 key 保持 Tile.id 的直接后果——身份归「落在目标格上」的那一枚（board.ts）
  await expect(page.locator('[data-tile-id="2"]')).toHaveCount(0)
  await expect(page.locator('.board__tile[data-row="0"][data-col="0"]')).toHaveCount(1)
  // 原样两枚 − 被吞的一枚 + 生成的一枚 = 两枚
  await expect(page.locator('[data-tile-id]')).toHaveCount(2)

  // 合并脉冲的载者正是产物，且只有它。脉冲由 animation 兑现（expect 见下面）
  await expect(page.locator('.board__tile[data-merge="true"]')).toHaveCount(1)
  const style = await tileStyle(page, '[data-tile-id="1"]')
  expect(style.animationName).toBe('tile-merge-pulse')
  // 分数按合并计：mergeScore(4) = 4
  await expect(page.locator('[data-score]')).toHaveText('4')

  expect(problems).toEqual([])
})

test('胜利序列：合出目标块的那一枚带 data-win，呼吸只做一次', async ({ page }) => {
  const problems = watchProblems(page)
  await start(page, startUrl(WIN))

  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowLeft')

  // 达标的那一枚
  const winner = page.locator('.board__tile[data-win="true"]')
  await expect(winner).toHaveCount(1)
  await expect(winner).toHaveAttribute('data-tile-id', '1')
  await expect(winner).toHaveAttribute('data-value', '2048')

  const style = await tileStyle(page, '[data-tile-id="1"]')
  expect(style.animationName).toBe('tile-win-breath')
  // 一次性（动画次数 1，CSS 里那个 `1` 由单测钉住），不做庆祝循环
  expect(style.animationDuration).not.toBe('0s')

  // 里程碑面板照旧由 T04 的 WinPanel 宣布——方块只是被点到名的那一枚
  await expect(page.getByRole('button', { name: '继续玩' })).toBeVisible()
  // 胜利吞掉合并：同一枚这一帧既是合并产物又是达标者，两个旗标都在它身上，
  // 而 CSS 靠 :not([data-win='true']) 只让胜利那一个跑。直接证据就是上面的
  // animationName——它取到的是 tile-win-breath 而不是 tile-merge-pulse
  await expect(page.locator('.board__tile[data-merge="true"]')).toHaveCount(1)
  await expect(page.locator('.board__tile[data-merge="true"][data-win="true"]')).toHaveCount(1)

  expect(problems).toEqual([])
})

test('reduced-motion：没有位移过渡，棋盘照旧能动、分数照旧涨，静态记号顶上', async ({
  browser,
}) => {
  // 用户故事 24：要求「少一点动」的玩家仍然看得见每一枚方块、仍然走得动。
  // 所以这里同时断言「动画没了」与「游戏还在」两件事——只断言前者是关掉功能，
  // 只断言后者是没做降级
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  const page = await context.newPage()
  try {
    const problems = watchProblems(page)
    await start(page, startUrl(MERGE))

    // 开局就确认频道是关着的：方块在、数字读得清
    const opening = await tileStyle(page, '[data-tile-id="1"]')
    expect(opening.transitionProperty).toBe('none')
    expect(opening.animationName).toBe('none')
    await expect(page.locator('[data-tile-id]')).toHaveCount(2)

    await page.locator('[data-board]').focus()
    await page.keyboard.press('ArrowLeft')

    // 状态与操作完整：棋盘推走了、分数按合并计了
    await expect(page.locator('[data-tile-id="1"]')).toHaveAttribute('data-value', '4')
    await expect(page.locator('[data-tile-id="2"]')).toHaveCount(0)
    await expect(page.locator('[data-score]')).toHaveText('4')
    await expect(page.locator('[data-tile-id]')).toHaveCount(2)

    // 静态替代真的落到画面上：产物描一圈，而不是什么都没有
    const merged = await tileStyle(page, '[data-tile-id="1"]')
    expect(merged.animationName).toBe('none')
    expect(merged.outlineStyle).toBe('solid')
    expect(parseFloat(merged.outlineWidth)).toBeGreaterThan(0)

    // 再来一发方向键：输入频道仍然是通的（这一步不预判棋盘怎么走——
    // 它只保证「降级之后键盘还活着」，真断了会是 console error）
    await page.keyboard.press('ArrowUp')
    expect(problems).toEqual([])
  } finally {
    await context.close()
  }
})

test('快速连打不丢输入：一步一等与连续按得到同一副棋盘', async ({ page }) => {
  const problems = watchProblems(page)
  // 同一个 URL 起两局。两局的种子与开局局面完全相同，所以**输入序列相同就必须
  // 得到同一副棋盘**——中途丢掉任何一次输入都会让两副棋盘分叉。
  // 这正是「过渡期间不许丢输入」的可证形式：状态在按键那一刻就已经是新状态，
  // 动画只是随后补帧；谁要是把输入挡住等动画跑完，这一条当场红
  const url = startUrl([
    [2, 4, 8, 16],
    [4, 8, 16, 2],
    [8, 16, 2, 4],
    [16, 2, 4, null],
  ])
  const sequence = ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowRight']

  const play = async (): Promise<(number | null)[][]> => {
    await page.goto(url)
    await page.getByRole('button', { name: '开始游戏' }).click()
    await expect(page.locator('[data-board]')).toBeVisible()
    await page.locator('[data-board]').focus()
    for (const key of sequence) await page.keyboard.press(key)
    return readBoard(page)
  }

  const spacing = await play()
  const rapid = await play()

  // 两局都不是白打：棋盘真的离开了开局局面
  expect(spacing).not.toEqual([
    [2, 4, 8, 16],
    [4, 8, 16, 2],
    [8, 16, 2, 4],
    [16, 2, 4, null],
  ])
  // 逐格相同：没有一次输入被过渡吞掉
  expect(rapid).toEqual(spacing)

  expect(problems).toEqual([])
})
