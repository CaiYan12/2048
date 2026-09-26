import { expect, test, type Page } from '@playwright/test'

/**
 * T09 的限时切片：模式可选、六个模式全在、倒计时由绝对截止点推导、到点结算成
 * timeout 且与死局是两句不同的话、**提前死局不会被到点改判成超时**，以及
 * **胜利之后继续玩：截止点照旧带过去，到点仍结算成 timeout**。
 *
 * 时钟用 `page.clock`（repo 在 T08 的 daily.spec.ts 第一次用）。装表之后每一步
 * 都立刻 `pauseAt` 停住：Playwright 的 `install` 允许 `resume()` 让时间按真实速度
 * 流，而 Time Attack 是三分钟——靠真实等待走完一局等于把这条用例写成三分钟。
 * 停住之后，时间只由本文件用 runFor / fastForward 推进，断言因此完全确定。
 *
 * 局面确定性：`?seed=`（随机流）+ `?board=`（开局局面夹具，见 stores/fixture.ts）。
 * **T08 修复轮留下的规矩**：`?board=` 不带 `?seed=` 时开局之后的生成是随机的
 * （`?seed=` 缺失曾经被读成种子 0，那个 bug 已修掉），所以这两个参数总是一起给，
 * 断言也只限于夹具钉住的东西。
 */

/** 开局时刻：倒计时的 3:00 就读这一刻 */
const START = new Date('2026-09-26T12:00:00Z')

/** 固定种子：与其余 e2e 同一个，方便和离线推演对账 */
const SEED = 20260926

/**
 * 一步即死局：第 0 行右端留一个空格，右移把它整体推过去。
 * 空出来的是 (0,0)，生成那一格后 16 格全满且横向纵向相邻都不相等
 * （邻居全是 8，所以生成 2 还是 4 都死局——这一条路径不依赖随机进度）。
 * 与 tests/e2e/run-endings.spec.ts 同一副局面。
 */
const ONE_STEP_FROM_DEADLOCK: (number | null)[][] = [
  [8, 2, 4, null],
  [8, 2, 4, 8],
  [2, 4, 8, 2],
  [4, 8, 2, 4],
]

/** 行优先局面 → board 参数值（空串 = 空格） */
function boardQuery(rows: (number | null)[][]): string {
  return rows.flat().map((value) => value ?? '').join(',')
}

/** 四个 1024：一次左移合出两个 2048，正好是「第一次达标」（T04 的同款局面） */
const FOUR_1024: (number | null)[][] = [
  [1024, 1024, 1024, 1024],
  [null, null, null, null],
  [null, null, null, null],
  [null, null, null, null],
]

/** 开局 URL：固定种子让「移动后的生成」也可预期，`rows` 给了就再钉开局局面 */
function startUrl(rows?: (number | null)[][]): string {
  const board = rows === undefined ? '' : `&board=${boardQuery(rows)}`
  return `/?seed=${SEED}${board}`
}

/** 从 DOM 还原棋盘：棋盘是固定结构，有方块才有 data-tile-id */
async function readBoard(page: Page): Promise<(number | null)[][]> {
  const cellCount = await page.locator('.board__cell').count()
  const size = Math.sqrt(cellCount)
  const grid: (number | null)[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, (): number | null => null)
  )
  const tiles = page.locator('[data-tile-id]')
  for (let index = 0; index < (await tiles.count()); index += 1) {
    const tile = tiles.nth(index)
    const row = Number(await tile.getAttribute('data-row'))
    const col = Number(await tile.getAttribute('data-col'))
    grid[row][col] = Number(await tile.getAttribute('data-value'))
  }
  return grid
}

/** 收集 console / page 错误：倒计时是新的渲染路径，React 警告要当场看见 */
function watchProblems(page: Page): string[] {
  const problems: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  return problems
}

/**
 * 装表 → 停表 → 全新加载 → 选「限时」，**不点「开始游戏」**。
 *
 * 时钟必须在 goto **之前**装（Playwright 的约定），页面脚本读到的才是固定时刻，
 * deadline 才落在 START + 三分钟上。
 *
 * 为什么单独拆出这一步：模式清单、风格清单全都属于开局界面，点掉「开始游戏」
 * 之后 StartScreen 就卸载了，那时候再去 getByRole('group', { name: '模式' }) 只会
 * 查到 0 个元素。要断言开局界面，就得在开局界面还挂着的时候断言。
 */
async function selectTimeAttack(page: Page, url = startUrl()): Promise<void> {
  await page.clock.install({ time: START })
  await page.clock.pauseAt(START)
  await page.goto(url)
  await page.getByRole('button', { name: '限时' }).click()
}

/** 选「限时」并开局：真正要跑起来的用例走这条 */
async function openTimeAttack(page: Page, url = startUrl()): Promise<void> {
  await selectTimeAttack(page, url)
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()
}

test('开局界面能选限时：六个模式一个不多，倒计时读 3:00', async ({ page }) => {
  const problems = watchProblems(page)
  // 只选模式、不开局：这一段断言的是开局界面本身。
  // 本票原先在这里调 openTimeAttack（它连「开始游戏」一起点掉），断言因此落在
  // 一张已经卸载的界面上——不是 locator 写错，是拿的帮手比自己以为的多做了事。
  await selectTimeAttack(page)

  // AVAILABLE_MODE_IDS 从五个放宽到正好六个（T09 加进 time-attack）：六种模式
  // 到此全部到位，未实现的更不该以「不可点」的样子出现在界面上
  const modes = page.getByRole('group', { name: '模式' }).getByRole('button')
  await expect(modes).toHaveText(['经典', '斐波那契', '大棋盘', '障碍', '每日', '限时'])

  // 界面确认选中的是限时（aria-pressed 由 StartScreen 自己维护）
  await expect(page.getByRole('button', { name: '限时' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )

  // 开一局，然后**当场**读表：表停在 START 上一毫秒都没走过，所以这一读数就是
  // 「开局那一刻的三分钟整」，而不是这一局已经开始跑了一阵子之后的剩余量
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()

  // Time Attack 与 Classic 同规则：4×4、目标 2048、开局两个方块
  await expect(page.locator('[data-board]')).toHaveAttribute('data-mode', 'time-attack')
  await expect(page.locator('.board__cell')).toHaveCount(16)
  await expect(page.locator('[data-tile-id]')).toHaveCount(2)
  await expect(page.locator('[data-score]')).toHaveText('0')

  // 倒计时：读数就是开局那一刻的三分钟整
  const countdown = page.locator('[data-countdown]')
  await expect(countdown).toHaveCount(1)
  await expect(countdown).toHaveText('3:00')
  await expect(page.locator('.panel', { hasText: '剩余时间' })).toHaveCount(1)

  // 它是外壳元素：不进 .board 里面（ADR-0002 的固定 DOM 结构不许因为一个倒计时
  // 多出节点），底板的 16 格也一个没多
  await expect(page.locator('.board__cell')).toHaveCount(16)
  await expect(page.locator('.board [data-countdown]')).toHaveCount(0)

  expect(problems).toEqual([])
})

test('倒计时由绝对截止点推导：推进多少就读少多少，到点前一瞬还活着', async ({ page }) => {
  const problems = watchProblems(page)
  await openTimeAttack(page)
  const countdown = page.locator('[data-countdown]')

  // 每个检查点之间恰好推进整数分钟：读数按 deadline − now 走，
  // 中间没有任何「累计过去多久」的状态会被后台 / 刷新重置（SPEC §3.1）
  await expect(countdown).toHaveText('3:00')
  await page.clock.runFor(60_000)
  await expect(countdown).toHaveText('2:00')
  await page.clock.runFor(60_000)
  await expect(countdown).toHaveText('1:00')
  // 秒位补零、分钟位不补
  await page.clock.runFor(30_000)
  await expect(countdown).toHaveText('0:30')

  // 到点前一秒：这一局还活着——没有面板、没有多出来的方块、分数一步没涨
  await page.clock.runFor(29_000)
  await expect(countdown).toHaveText('0:01')
  await expect(page.locator('[data-panel]')).toHaveCount(0)
  await expect(page.locator('[data-tile-id]')).toHaveCount(2)
  await expect(page.locator('[data-score]')).toHaveText('0')

  // 再把最后那一秒走完：同一行读数归零的瞬间，面板出现、原因就是 timeout。
  // 边界这一侧（到点含端点）与 unit 测试钉的是同一条判据
  await page.clock.runFor(1000)
  await expect(page.locator('[data-countdown]')).toHaveCount(0)
  const panel = page.locator('[data-panel="gameover"]')
  await expect(panel).toHaveAttribute('data-end-reason', 'timeout')
  await expect(panel).toContainText('时间到')

  expect(problems).toEqual([])
})

test('三分钟到点即结束：原因可读为 timeout，与死局是两句不同的话', async ({ page }) => {
  const problems = watchProblems(page)
  await openTimeAttack(page)

  // fastForward 的语义正是「合上笔记本再打开」：期间到期的回调各触发一次。
  // 这一步合起来三分钟，对应真实世界里玩家把页面晾在后台。
  await page.clock.fastForward(180_000)
  // 再走一个读表周期：到期那一刻的 read 一定跑过（fastForward 之后周期重新排表，
  // 多走一步是双保险，不是靠它推进时间）
  await page.clock.runFor(250)

  const panel = page.locator('[data-panel="gameover"]')
  await expect(panel).toBeVisible()
  // 界面不自己推断「表归零了」：原因从 endReason 读
  await expect(panel).toHaveAttribute('data-end-reason', 'timeout')
  await expect(panel.getByRole('heading')).toHaveText('本局已结束')
  // 与死局那句不共用词：到点是**强制**结算，死局是玩家自己收工
  await expect(panel).toContainText('时间到')
  await expect(panel).not.toContainText('死局')
  await expect(panel).not.toContainText('无合法移动')

  // 倒计时退场：结算之后不需要再看表，「为什么结束」归面板说
  await expect(page.locator('[data-countdown]')).toHaveCount(0)

  // mode-contract §3：结算之后不能 Undo、不能交换——方向上就是「一下都推不动」
  const frozen = await readBoard(page)
  await page.locator('[data-board]').focus()
  for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
    await page.keyboard.press(key)
  }
  expect(await readBoard(page)).toEqual(frozen)

  // 结算只执行一次：ended 的面板只剩「新游戏」一个出口
  await expect(panel.getByRole('button')).toHaveText(['新游戏'])
  await expect(page.getByRole('button', { name: '结束并记录' })).toHaveCount(0)

  expect(problems).toEqual([])
})

test('提前死局不会被到点改判：仍是死局，原因只在玩家收工时写下', async ({ page }) => {
  const problems = watchProblems(page)
  await openTimeAttack(page, startUrl(ONE_STEP_FROM_DEADLOCK))

  // 一次右移把棋盘填满：四方向都无合法移动，此刻距到点还有三分钟
  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowRight')
  const panel = page.locator('[data-panel="gameover"]')
  await expect(panel).toBeVisible()
  // 死局还没结算：标题是「死局」而不是「本局已结束」，也没有结束原因
  await expect(panel.getByRole('heading')).toHaveText('死局')
  expect(await panel.getAttribute('data-end-reason')).toBeNull()
  await expect(page.locator('[data-tile-id]')).toHaveCount(16)
  expect(await readBoard(page)).toEqual([
    [2, 8, 2, 4],
    [8, 2, 4, 8],
    [2, 4, 8, 2],
    [4, 8, 2, 4],
  ])

  // 时钟推过整个截止点：死局不许被计时器改写成超时。本票最关键的一条——
  // mode-contract §3 把超时定为**强制**结算，而把死局留成**玩家自己决定**的结算，
  // 所以到点在 stuck 上一律不动作。
  await page.clock.fastForward(180_000)
  await page.clock.runFor(250)
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('heading')).toHaveText('死局')
  expect(await panel.getAttribute('data-end-reason')).toBeNull()
  // 棋盘一个字节都没动：不是被结算冻结的，是本来就锁着
  const locked = await readBoard(page)
  await expect(page.locator('[data-tile-id]')).toHaveCount(16)
  await expect(page.locator('[data-score]')).toHaveText('0')

  // 只有玩家自己收工，原因才落下来，而且是 deadlock 不是 timeout
  await page.getByRole('button', { name: '结束并记录' }).click()
  await expect(panel).toHaveAttribute('data-end-reason', 'deadlock')
  await expect(panel.getByRole('heading')).toHaveText('本局已结束')
  await expect(panel).toContainText('死局')
  await expect(panel).not.toContainText('时间到')
  expect(await readBoard(page)).toEqual(locked)

  expect(problems).toEqual([])
})

test('胜利之后继续玩：截止点照旧带过去，到点仍结算成 timeout', async ({ page }) => {
  const problems = watchProblems(page)
  // 开局即四个 1024（T04 的同款局面）：一次左移合出两个 2048，正好在截止之前达标。
  // ?board= 与 ?seed= 一起给（T08 修复轮定下的规矩），于是「移动后的生成」也可预期
  await openTimeAttack(page, startUrl(FOUR_1024))

  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowLeft')
  const winPanel = page.locator('[data-panel="win"]')
  await expect(winPanel).toBeVisible()
  await expect(page.locator('[data-score]')).toHaveText('4096')
  const boardAtWin = await readBoard(page)

  // 趁表还停在 START：胜利面板挂着，读数仍是整三分钟——此刻距到点整整三分钟
  await expect(page.locator('[data-countdown]')).toHaveText('3:00')

  // 时钟推过截止点：won 期间 tick 是空操作（计时器不许改判任何非 playing 阶段），
  // 所以此刻表读 0:00 而面板仍是「达成目标」、没有任何结束原因
  await page.clock.fastForward(180_000)
  await page.clock.runFor(250)
  await expect(winPanel).toBeVisible()
  await expect(page.locator('[data-countdown]')).toHaveText('0:00')
  expect(await winPanel.getAttribute('data-end-reason')).toBeNull()

  // 继续玩：phase 回到 playing，而 deadline 是绝对时间戳、continueRun 不动它——
  // 所以下一个读表周期就把这一局结算掉。**SPEC §3.1「后台、刷新不延长时限」在
  // 这条路上看得见**：若 continueRun 里重算或清掉 deadline，这一局会被悄悄延长成
  // 一整段新的三分钟，而这里会一直停在 playing。
  await page.getByRole('button', { name: '继续玩' }).click()
  await expect(winPanel).toHaveCount(0)
  // 走一个读表周期：结算就是由这一步触发的（Countdown 每 250ms 问一次 store.tick），
  // 不是靠轮询等出来的
  await page.clock.runFor(250)

  const panel = page.locator('[data-panel="gameover"]')
  await expect(panel).toBeVisible()
  await expect(panel).toHaveAttribute('data-end-reason', 'timeout')
  await expect(panel.getByRole('heading')).toHaveText('本局已结束')
  await expect(panel).toContainText('时间到')
  await expect(panel).not.toContainText('死局')
  // 倒计时退场就是 phase 离开 playing 的可观测证据：App 只在 phase !== 'ended' 时挂它
  await expect(page.locator('[data-countdown]')).toHaveCount(0)

  // 结算冻结的就是胜利那一刻的棋盘与分数：继续玩不改盘面，超时也不改
  await expect(page.locator('[data-score]')).toHaveText('4096')
  expect(await readBoard(page)).toEqual(boardAtWin)

  expect(problems).toEqual([])
})
