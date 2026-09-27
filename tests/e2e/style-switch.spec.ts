import { expect, test, type Page } from '@playwright/test'

/**
 * T13 的风格切换纵向切片：material ⇄ classic 在局中来回切换，规则状态一个字节都不动。
 * T15 扩展：claude 加入这条路径（开局与局中都能选，一轮游 classic → claude → material →
 * classic 走完，tile 节点与盘面状态都不动），以及三套风格的方块色两两不同。
 *
 * **本文件由 T13 编写、T15 扩展，但不运行**（跑它的是控制人的统一 sweep）：跑它要先 build +
 * preview，而本次会话被明确要求不启动 Playwright、不开任何浏览器。断言全部走 data-* 的 DOM
 * 契约（task-3-interfaces §7b）+ 计算样式，不伸进 store 改状态。
 *
 * 确定性来自 `?seed=`（见 useGameStore 的说明）：同一个 seed 得到同一个初始局面与同一条
 * 随机流。所以**同一套按键序列跑两遍**——一遍完全不换风格、一遍来回切换三次——
 * 两次的终局必须逐格一致。这一条同时证明了随机进度没有被动过：新生成的那颗方块
 * 落在哪一格，只有 rngState 能决定。
 */

interface TileSnapshot {
  id: string
  value: number
  rank: number
  slot: number
  row: number
  col: number
}

interface RunSnapshot {
  mode: string
  score: string
  tiles: TileSnapshot[]
}

/** 从 DOM 还原一局的全部可观测状态 */
async function readRun(page: Page): Promise<RunSnapshot> {
  const board = page.locator('[data-board]')
  const tiles = page.locator('[data-tile-id]')
  const snapshots: TileSnapshot[] = []
  for (let index = 0; index < (await tiles.count()); index += 1) {
    const tile = tiles.nth(index)
    snapshots.push({
      id: (await tile.getAttribute('data-tile-id')) ?? '',
      value: Number(await tile.getAttribute('data-value')),
      rank: Number(await tile.getAttribute('data-rank')),
      slot: Number(await tile.getAttribute('data-bucket')),
      row: Number(await tile.getAttribute('data-row')),
      col: Number(await tile.getAttribute('data-col')),
    })
  }
  return {
    mode: (await board.getAttribute('data-mode')) ?? '',
    score: (await page.locator('[data-score]').textContent()) ?? '',
    tiles: snapshots,
  }
}

/** 选择器上按名字点一套风格 */
async function pickStyle(page: Page, label: string): Promise<void> {
  await page.getByRole('group', { name: '风格' }).getByRole('button', { name: label }).click()
}

/** 开局（同一条 seed），可选地在开局前先选风格 */
async function startRun(page: Page, url: string): Promise<void> {
  await page.goto(url)
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()
}

/** 收 console error / pageerror；返回的数组必须是空数组 */
function watchProblems(page: Page): string[] {
  const problems: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  return problems
}

const SEED_URL = '/?seed=20260926'

test('开局前选 Material，进局后选 Classic，棋盘与分数一个字段都不动', async ({ page }) => {
  const problems = watchProblems(page)

  await page.goto(SEED_URL)
  // 开局前选风格：选择器读的是 store，所以这里选的就是这一局要用的
  await pickStyle(page, 'Material')
  await expect(page.locator('main')).toHaveAttribute('data-style', 'material')
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()
  await expect(page.locator('main')).toHaveAttribute('data-style', 'material')

  const before = await readRun(page)

  // 局中切回 Classic：外观立刻变，规则状态不变
  await pickStyle(page, 'Classic')
  await expect(page.locator('main')).toHaveAttribute('data-style', 'classic')

  // 逐字段断言（不是「分数没变」）：身份、数值、阶梯位、色档、行列、分数、模式全在内
  expect(await readRun(page)).toEqual(before)

  expect(problems).toEqual([])
})

test('material → classic → material 与完全不切换的同一 seed 同一按键序列结果一致', async ({
  page,
}) => {
  const problems = watchProblems(page)

  // 对照组：一路 Classic，中间什么都不点
  await startRun(page, SEED_URL)
  const controlStart = await readRun(page)
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowDown')
  const controlEnd = await readRun(page)

  // 实验组：同一 seed、同一套按键，只在按键之前来回切换三次
  await startRun(page, SEED_URL)
  await pickStyle(page, 'Material')
  await expect(page.locator('main')).toHaveAttribute('data-style', 'material')
  await pickStyle(page, 'Classic')
  await pickStyle(page, 'Material')
  await expect(page.locator('main')).toHaveAttribute('data-style', 'material')

  // 开局局面与对照组逐格一致
  expect(await readRun(page)).toEqual(controlStart)

  // 点风格按钮把焦点从棋盘上带走了。方向键只在棋盘是事件目标时才生效——这不是巧合，
  // 是被钉住的契约（game.spec.ts「移动键只在棋盘是预定目标时生效」：焦点不在棋盘上时
  // 同一个键不许推动棋盘）。所以按键序列之前要先把焦点还回棋盘，仓库里每个走键盘的
  // 用例都是这么办的（swap.spec.ts 的 :183 / :240 / :438）。
  // 对照组不需要这一步：它点完「开始游戏」就直接由 Board 的挂载 effect 拿到了焦点。
  // 少了这一行，三个方向键全都落在风格按钮上、一个 Move 都不产生，
  // 「同 seed 同按键序列」这条就退化成了「根本没走完序列」
  await page.locator('[data-board]').focus()

  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowDown')

  // 终局也逐格一致：连新生成方块的位置都一样，说明随机进度没有被换皮碰过
  expect(await readRun(page)).toEqual(controlEnd)
  expect(await readRun(page)).not.toEqual(controlStart)

  expect(problems).toEqual([])
})

test('风格选择器只列注册表里的三套，没有第四套', async ({ page }) => {
  // 开局界面
  await page.goto(SEED_URL)
  const startPicker = page.getByRole('group', { name: '风格' })
  await expect(startPicker.getByRole('button')).toHaveCount(3)
  await expect(startPicker.getByRole('button', { name: 'Classic' })).toBeVisible()
  await expect(startPicker.getByRole('button', { name: 'Material' })).toBeVisible()
  // T15：第三套。选择器只遍历 THEMES，所以这一行同时证明了它注册进来了
  await expect(startPicker.getByRole('button', { name: 'Claude' })).toBeVisible()

  // 局中：同一个组件、同一份注册表
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()
  const runPicker = page.getByRole('group', { name: '风格' })
  await expect(runPicker.getByRole('button')).toHaveCount(3)

  // 选中态跟着 data-style 走（aria-pressed 同时喂给 .control[aria-pressed='true'] 的配色）
  await expect(runPicker.getByRole('button', { name: 'Classic' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await pickStyle(page, 'Claude')
  await expect(runPicker.getByRole('button', { name: 'Claude' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await expect(page.locator('main')).toHaveAttribute('data-style', 'claude')
  await pickStyle(page, 'Material')
  await expect(page.locator('main')).toHaveAttribute('data-style', 'material')
})

test('同一副棋盘在三套风格下渲染出三组不同的方块色，且 Classic 逐字节不变', async ({ page }) => {
  const problems = watchProblems(page)

  // ?board= 铺一副带齐 11 档 + beyond 的棋盘：2,4,8,…,2048,4096 加四个空格。
  // 这一步是「Classic 逐字节不变」的证明——重构前 board.css 按 data-value 取这 12 个色值，
  // 重构后按 data-bucket 取，两者必须一个都不串
  const ladderBoard = '2,4,8,16,32,64,128,256,512,1024,2048,4096,,,,'
  await page.goto(`/?board=${ladderBoard}`)
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()

  /** 数值 → 该风格 tokens.css 里那个色值的计算值。每张表都是那一套的设计卡 §2 */
  const classicColours: Record<string, string> = {
    '2': 'rgb(238, 228, 218)',
    '4': 'rgb(237, 224, 200)',
    '8': 'rgb(194, 98, 44)',
    '16': 'rgb(181, 86, 31)',
    '32': 'rgb(165, 74, 28)',
    '64': 'rgb(149, 63, 24)',
    '128': 'rgb(145, 106, 14)',
    '256': 'rgb(138, 104, 13)',
    '512': 'rgb(133, 100, 11)',
    '1024': 'rgb(124, 93, 10)',
    '2048': 'rgb(108, 81, 9)',
    '4096': 'rgb(74, 68, 63)',
  }
  const materialColours: Record<string, string> = {
    '2': 'rgb(194, 173, 255)',
    '4': 'rgb(185, 164, 255)',
    '8': 'rgb(176, 155, 247)',
    '16': 'rgb(168, 146, 238)',
    '32': 'rgb(159, 137, 228)',
    '64': 'rgb(151, 129, 219)',
    '128': 'rgb(120, 97, 184)',
    '256': 'rgb(104, 81, 166)',
    '512': 'rgb(89, 65, 149)',
    '1024': 'rgb(75, 49, 131)',
    '2048': 'rgb(60, 31, 113)',
    '4096': 'rgb(48, 15, 98)',
  }
  // T15：纸 → 暖灰 → 墨。2048（第 11 档）是全阶梯唯一一处陶土色，4096 回到近黑
  const claudeColours: Record<string, string> = {
    '2': 'rgb(247, 244, 236)',
    '4': 'rgb(239, 233, 219)',
    '8': 'rgb(227, 218, 198)',
    '16': 'rgb(211, 200, 174)',
    '32': 'rgb(193, 182, 148)',
    '64': 'rgb(168, 158, 141)',
    '128': 'rgb(116, 104, 90)',
    '256': 'rgb(92, 83, 74)',
    '512': 'rgb(70, 62, 55)',
    '1024': 'rgb(46, 41, 37)',
    '2048': 'rgb(168, 72, 43)',
    '4096': 'rgb(29, 26, 23)',
  }

  const colours = async (): Promise<Record<string, string>> => {
    const found: Record<string, string> = {}
    const tiles = page.locator('[data-tile-id]')
    for (let index = 0; index < (await tiles.count()); index += 1) {
      const tile = tiles.nth(index)
      const value = (await tile.getAttribute('data-value')) ?? ''
      found[value] = await tile.evaluate((el) => getComputedStyle(el).backgroundColor)
    }
    return found
  }

  // 每个数值都落在 tokens.css 声明的那个色值上（含 4096 归 beyond）
  expect(await colours()).toEqual(classicColours)

  // 换到 Material：同一副棋盘，色值全变
  await pickStyle(page, 'Material')
  await expect(page.locator('main')).toHaveAttribute('data-style', 'material')
  expect(await colours()).toEqual(materialColours)

  // 再换到 Claude：第三组色值，且每一格都真的有着落（透明说明掉出了阶梯）
  await pickStyle(page, 'Claude')
  await expect(page.locator('main')).toHaveAttribute('data-style', 'claude')
  const claudeRendered = await colours()
  expect(claudeRendered).toEqual(claudeColours)
  for (const [value, colour] of Object.entries(claudeRendered)) {
    expect(colour, `value ${value}`).not.toBe('rgba(0, 0, 0, 0)')
  }

  // 三套两两不同：同一个档位在三套风格下是三个颜色
  for (const [value, colour] of Object.entries(classicColours)) {
    expect(materialColours[value], `material vs classic, value ${value}`).not.toBe(colour)
    expect(claudeColours[value], `claude vs classic, value ${value}`).not.toBe(colour)
    expect(claudeColours[value], `claude vs material, value ${value}`).not.toBe(
      materialColours[value]
    )
  }

  // 换回 Classic：色值回到重构前那一张表，一个都不漂
  await pickStyle(page, 'Classic')
  expect(await colours()).toEqual(classicColours)

  expect(problems).toEqual([])
})

test('换风格不重建棋盘：tile 的 DOM 节点还是同一批对象（引用相等，不是值相等）', async ({
  page,
}) => {
  const problems = watchProblems(page)
  await page.goto(SEED_URL)
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()

  // T13 复核留下的规则：**深相等不能证明「什么都没变」**——把对象重建一遍、每个值都
  // 还在，toEqual 照样过（上面几个用例正是这么断言的，它们断的是「值没变」）。所以这里
  // 换成引用相等：DOM 节点是一次性对象，重建出来的节点不是同一个 node。把引用留在
  // window 上，换完风格再逐个问「还在文档里吗」——被重建的节点会掉出文档，于是这里会响。
  // 它同时钉住 Board 没有因为换风格重新挂载：重挂一次，整套 tile 节点全部换新，
  // T21 的位移动画（靠 data-tile-id 复用同一个节点）会当场失效。
  await page.evaluate(() => {
    const bank = window as unknown as { __tiles: Element[] }
    bank.__tiles = [...document.querySelectorAll('[data-tile-id]')]
    expect(bank.__tiles.length).toBeGreaterThan(0)
  })

  await pickStyle(page, 'Material')
  await expect(page.locator('main')).toHaveAttribute('data-style', 'material')

  const identity = await page.evaluate(() => {
    const bank = window as unknown as { __tiles: Element[] }
    const live = document.querySelectorAll('[data-tile-id]')
    return {
      sameCount: bank.__tiles.length === live.length,
      allAttached: bank.__tiles.every((node) => document.contains(node)),
      sameIds: bank.__tiles.every(
        (node, index) =>
          node.getAttribute('data-tile-id') === live[index]?.getAttribute('data-tile-id')
      ),
    }
  })

  expect(identity).toEqual({ sameCount: true, allAttached: true, sameIds: true })

  expect(problems).toEqual([])
})

test('classic → claude → material → classic 走一圈：tile 节点与盘面状态都不动', async ({ page }) => {
  const problems = watchProblems(page)
  await page.goto(SEED_URL)
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()

  // 先按几下，让随机进度走掉一步：换皮若碰过 rngState，这一段之后两组的终局会分叉
  const before = await readRun(page)
  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowLeft')
  const moved = await readRun(page)
  expect(moved).not.toEqual(before)

  // tile 节点的引用留在 window 上（理由同上一个用例：DOM 节点是一次性对象，
  // 重建出来的不是同一个 node，被重建的节点会掉出文档）
  await page.evaluate(() => {
    const bank = window as unknown as { __tiles: Element[] }
    bank.__tiles = [...document.querySelectorAll('[data-tile-id]')]
  })

  await pickStyle(page, 'Claude')
  await expect(page.locator('main')).toHaveAttribute('data-style', 'claude')
  await pickStyle(page, 'Material')
  await expect(page.locator('main')).toHaveAttribute('data-style', 'material')
  await pickStyle(page, 'Classic')
  await expect(page.locator('main')).toHaveAttribute('data-style', 'classic')

  const identity = await page.evaluate(() => {
    const bank = window as unknown as { __tiles: Element[] }
    const live = document.querySelectorAll('[data-tile-id]')
    return {
      sameCount: bank.__tiles.length === live.length,
      allAttached: bank.__tiles.every((node) => document.contains(node)),
      sameIds: bank.__tiles.every(
        (node, index) =>
          node.getAttribute('data-tile-id') === live[index]?.getAttribute('data-tile-id')
      ),
    }
  })
  expect(identity).toEqual({ sameCount: true, allAttached: true, sameIds: true })

  // 规则字段也一个都不动。**这不是上一个用例的重复**：那一条证「节点没被重建」（引用），
  // 这一条证「盘面状态没变」（值）。T13 的教训是深相等证不了「什么都没变」，
  // 而引用相等也证不了「值还是对的」——两条一起才闭合
  expect(await readRun(page)).toEqual(moved)

  expect(problems).toEqual([])
})

test('data-rank 是阶梯位置、data-bucket 是色档：两套语义不混', async ({ page }) => {
  const problems = watchProblems(page)

  // 斐波那契 17 级阶梯压到 11 档：rank 一路到 17，bucket 只到 11。
  // **必须先点「斐波那契」再开局**：模式没有 URL 入口（fibonacci.spec.ts 的文件头
  // 写明了理由），不点就是默认的 classic——而盘面上这些值一个都不在 classic 的
  // 11 级阶梯里，整盘会落到 beyond 档，这张表证的就不是斐波那契的分档算术了
  const fibBoard = '1,2,3,5,8,13,21,34,55,89,144,233,377,610,987,1597'
  await page.goto(`/?board=${fibBoard}`)
  await page.getByRole('button', { name: '斐波那契' }).click()
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()

  const tiles = page.locator('[data-tile-id]')
  await expect(tiles).toHaveCount(16)
  const seen: Array<{ value: number; rank: number; slot: number }> = []
  for (let index = 0; index < 16; index += 1) {
    const tile = tiles.nth(index)
    seen.push({
      value: Number(await tile.getAttribute('data-value')),
      rank: Number(await tile.getAttribute('data-rank')),
      slot: Number(await tile.getAttribute('data-bucket')),
    })
  }

  // 2584 不在盘面上（?board= 只铺 16 格），这里验证的是 17 级阶梯前 16 项的映射
  expect(seen.map((tile) => [tile.value, tile.rank, tile.slot])).toEqual([
    [1, 1, 1],
    [2, 2, 2],
    [3, 3, 2],
    [5, 4, 3],
    [8, 5, 4],
    [13, 6, 4],
    [21, 7, 5],
    [34, 8, 6],
    [55, 9, 6],
    [89, 10, 7],
    [144, 11, 8],
    [233, 12, 8],
    [377, 13, 9],
    [610, 14, 10],
    [987, 15, 10],
    [1597, 16, 11],
  ])

  // 11 个色档全用上，rank 却一路到 16：两个语义确实分开。bucket 会撞车（3 与 5 同档、
  // 13 与 21 同档），rank 从不撞车——把两者混成一个数字，撞车的那几行会立刻看得出来
  const slots = new Set(seen.map((tile) => tile.slot))
  expect(slots.size).toBeLessThan(seen.length)
  expect(Math.max(...seen.map((tile) => tile.slot))).toBe(11)
  expect(new Set(seen.map((tile) => tile.rank)).size).toBe(seen.length)

  expect(problems).toEqual([])
})

test('换风格不影响计时：限时模式的倒计时照旧走', async ({ page }) => {
  const problems = watchProblems(page)
  await page.goto('/?seed=20260926')
  // 先定模式再定风格，然后开局（开局界面还能改，进了局就只剩棋盘了）
  await page.getByRole('group', { name: '模式' }).getByRole('button', { name: '限时' }).click()
  await pickStyle(page, 'Material')
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-countdown]')).toBeVisible()
  await expect(page.locator('main')).toHaveAttribute('data-style', 'material')

  // deadline 是绝对时间戳，无法逐格比对，所以只断方向：换皮不许把它推走
  const first = await page.locator('[data-countdown]').textContent()
  await pickStyle(page, 'Classic')
  const second = await page.locator('[data-countdown]').textContent()
  expect(parseSeconds(second)).toBeLessThanOrEqual(parseSeconds(first))

  expect(problems).toEqual([])
})

/** '2:59' → 秒数 */
function parseSeconds(label: string | null): number {
  const [minutes, seconds] = (label ?? '0:00').split(':').map(Number)
  return minutes * 60 + seconds
}
