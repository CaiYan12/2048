import { expect, test, type Page } from '@playwright/test'
import { STYLE_CATALOG } from '../../src/shared/styleCatalog'

/**
 * 卡片那一行（T31 · 父规格的架构决策 17：**一个座位，两处用法**）。
 *
 * 它住在结果层卡片的最末（`.overlay__line`，在记录标记之后、按钮之前），一句话：
 *   · 死局 / 超时 / 放弃那一刻 → 一句本局总结（分数、最高块、合并次数、步数），
 *     死因随 `endReason` 变，放弃那一次的罪名叫「弃甲曳兵」；
 *   · 道通成魔那一局 → 一句梗（一念收下了，账照算），账一句不少。
 *
 * 两个用法共用 `resultCardLine` 这一个纯函数（App 现算递进来，与读数同一条路子），
 * 所以这里断的全是**整句**——数字一个都没写死，断整句就是同时断「没有写死任何数值」。
 *
 * **四种结束原因里，`abandoned` 在浏览器里没有那一刻**：活跃局点「新游戏」会立刻开新局
 * （T04 起就是这样），界面上从来露不出放弃那一档。所以「弃甲曳兵」那一句只由
 * `tests/unit/result-card-line.test.ts` 证——同一个纯函数的另一半，不是没人证。
 *
 * 局面确定性来自 `?seed=` + `?board=` + `?score=`（开局夹具）：四个 1024 一次左移合出
 * 两个 2048（达标），一副右端留空的满局一次右移即死局；彩蛋那一条用一副
 * **四方向全锁死的满盘**（口径见下）。每一步仍走真实按键与真实规则内核。
 */

/** 行优先局面 → board 参数值（空串 = 空格） */
function boardQuery(rows: (number | null)[][]): string {
  return rows.flat().map((value) => value ?? '').join(',')
}

/** 开局 URL：固定种子让「移动之后的生成」也可预期 */
function startUrl(rows: (number | null)[][], score = 0, seed = 20260926): string {
  return `/?seed=${seed}&board=${boardQuery(rows)}&score=${score}`
}

/** 四个 1024：一次左移合出两个 2048，正好是「第一次达标」 */
const FOUR_1024: (number | null)[][] = [
  [1024, 1024, 1024, 1024],
  [null, null, null, null],
  [null, null, null, null],
  [null, null, null, null],
]

/**
 * 一步即死局：第 0 行右端留一个空格，右移把它整体推过去。
 * 空出来的是 (0,0)，生成那一格后 16 格全满且横向纵向相邻都不相等。
 * (0,0) 的邻居全是 8，所以生成 2 还是 4 都死局——这一条路径不依赖随机进度。
 */
const ONE_STEP_FROM_DEADLOCK: (number | null)[][] = [
  [8, 2, 4, null],
  [8, 2, 4, 8],
  [2, 4, 8, 2],
  [4, 8, 2, 4],
]

/**
 * **四方向全锁死的满盘**（彩蛋那一条的底座）
 *
 * 一个 4 阶循环拉丁方：每行每列都是 2 / 4 / 8 / 16 的一个排列，于是横向纵向相邻
 * 一概不相等——**四个方向都不合法**（`isDeadlocked` 为真），而夹具按 playing 开局，
 * 于是一次有效移动都没有、phase 还是 playing。神魔码的八下因此**一步都不推动棋盘**
 * （无效方向也计数，用户故事 2），口诀走得完，也不会凭空走进 won / stuck。
 *
 * 换掉 (0,0) 与 (3,3) 两枚之后仍是死局（两格的值换到对角的行与列里，相邻相等一概
 * 不出现）——「交换把一个活着的局走死」那条恢复路径，靠它把卡片请出来。
 */
const LOCKED_ROWS: (number | null)[][] = [
  [2, 4, 8, 16],
  [4, 8, 16, 2],
  [8, 16, 2, 4],
  [16, 2, 4, 8],
]

/** 神魔码的八下（↑↑↓↓←→←→）。序列在 shenmo.spec.ts 的文件头有据可查 */
const CODE_KEYS: readonly string[] = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
]

/** 卡片那一行。没有时整个元素不在 DOM 里（调用方判 null，不渲染空节点） */
const line = (page: Page) => page.locator('.overlay__line')

/** 收集 console / page 错误：新的渲染路径上若有 React 警告要当场看见 */
function watchProblems(page: Page): string[] {
  const problems: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  return problems
}

/** 按 row / col 取一枚方块（交换拾取要点的就是它） */
function tileAt(page: Page, row: number, col: number) {
  return page.locator(`.board__tile[data-row="${row}"][data-col="${col}"]`)
}

/** 走完一遍「一念神魔」：打码 → 先 B（破碎退场用合成 animationend 收尾）→ 再 A */
async function earnFirstPass(page: Page): Promise<void> {
  await page.locator('[data-board]').focus()
  for (const key of CODE_KEYS) await page.keyboard.press(key)
  await expect(page.locator('.shenmo')).toHaveAttribute('data-shenmo-stage', 'choice')
  await page.getByRole('button', { name: '抉择 B' }).click()
  // 破碎退场播完（合成 animationend，不靠墙钟）：只剩 A，第二段窗口开始
  await page.evaluate(() => {
    const element = document.querySelector<HTMLElement>('[data-shenmo-button="b"]')
    element?.dispatchEvent(
      new AnimationEvent('animationend', { bubbles: true, animationName: 'shenmo-break-fade' })
    )
  })
  await page.getByRole('button', { name: '抉择 A' }).click()
  await expect(page.locator('.shenmo')).toHaveCount(0)
  await expect(page.locator('[data-toast]')).toContainText('道通成魔')
}

test('死局那一刻：卡片最末一行是本局总结', async ({ page }) => {
  const problems = watchProblems(page)
  await page.goto(startUrl(ONE_STEP_FROM_DEADLOCK))
  await page.getByRole('button', { name: '开始游戏' }).click()

  // 一次右移把棋盘填满：四方向都无合法移动。这一动没有合并，所以分数一步不涨
  await page.keyboard.press('ArrowRight')
  const panel = page.locator('[data-panel="gameover"]')
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('heading')).toHaveText('死局')

  // 整句断死：1480 那个基准局在这里是 0 分（一枪没开），合并 0 次、走了 1 步、
  // 最高块是盘面上那个 8——四个数字全部来自这一局的现成读数
  await expect(line(page)).toHaveText('这一局是自己走完的：0 分，最高 8，合并 0 次，1 步')

  // 它坐在卡片最末：记录标记（本局不是新纪录，不在场）之后、按钮之前
  await expect(panel.locator('.overlay__line')).toHaveCount(1)
  expect(problems).toEqual([])
})

test('结算不改变这一行：死局收工之后逐字相同', async ({ page }) => {
  const problems = watchProblems(page)
  await page.goto(startUrl(ONE_STEP_FROM_DEADLOCK))
  await page.getByRole('button', { name: '开始游戏' }).click()
  await page.keyboard.press('ArrowRight')
  const panel = page.locator('[data-panel="gameover"]')
  await expect(panel).toBeVisible()
  const atDeadlock = await line(page).textContent()

  await panel.getByRole('button', { name: '结束并记录' }).click()
  await expect(panel).toHaveAttribute('data-end-reason', 'deadlock')
  await expect(line(page)).toHaveText(atDeadlock ?? '')
  // 而且标题从「死局」换成「本局已结束」——变的只是那句正式的结束原因，总结一行不动
  await expect(panel.getByRole('heading')).toHaveText('本局已结束')
  expect(problems).toEqual([])
})

test('赢下的一局：里程碑那一层没有这一行，赢着收工之后才有', async ({ page }) => {
  const problems = watchProblems(page)
  await page.goto(startUrl(FOUR_1024, 4321))
  await page.getByRole('button', { name: '开始游戏' }).click()

  // 一次左移合出两个 2048：达标，胜利面板浮出来
  await page.keyboard.press('ArrowLeft')
  const winPanel = page.locator('[data-panel="win"]')
  await expect(winPanel).toBeVisible()
  // 这一局**还活着**（won 只是里程碑，不是终局）：没有「怎么结束」可说，
  // 于是这一行整个不在 DOM 里——不是一句空话，是一个节点都没有
  await expect(line(page)).toHaveCount(0)

  // 赢着收工：才算真的结束，于是有了那句总结
  await winPanel.getByRole('button', { name: '结束并记录' }).click()
  const settled = page.locator('[data-panel="gameover"]')
  await expect(settled).toHaveAttribute('data-end-reason', 'won')
  await expect(line(page)).toHaveText('赢下的一局：8417 分，最高 2048，合并 2 次，1 步')
  expect(problems).toEqual([])
})

test('三分钟到点：换成超时那一句（假时钟，与 time-attack.spec.ts 同一条路子）', async ({ page }) => {
  const problems = watchProblems(page)
  // 时钟必须在 goto 之前装（Playwright 的约定）：页面脚本读到的才是固定时刻，
  // deadline 才落在 START + 三分钟上
  await page.clock.install({ time: new Date('2026-09-26T12:00:00Z') })
  await page.clock.pauseAt(new Date('2026-09-26T12:00:00Z'))
  await page.goto(startUrl(FOUR_1024, 4321))
  await page.getByRole('group', { name: '模式' }).getByRole('button', { name: '限时' }).click()
  await page.getByRole('button', { name: '开始游戏' }).click()

  // 先达标、再继续玩：tick 的守卫不放 won 进（提前死局/胜局不会被到点改判成超时），
  // 所以要走到 playing 才等得到那道钟
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('[data-panel="win"]')).toBeVisible()
  await page.getByRole('button', { name: '继续玩' }).click()
  await expect(page.locator('[data-panel]')).toHaveCount(0)

  // fastForward 的语义是「合上笔记本再打开」：期间到期的回调各触发一次
  await page.clock.fastForward(180_000)
  await page.clock.runFor(250)

  const panel = page.locator('[data-panel="gameover"]')
  await expect(panel).toHaveAttribute('data-end-reason', 'timeout')
  await expect(line(page)).toHaveText('钟比棋盘先满：8417 分，最高 2048，合并 2 次，1 步')
  expect(problems).toEqual([])
})

test('道通成魔那一局：最末一行是那句梗，而账一句不少', async ({ page }) => {
  const problems = watchProblems(page)
  await page.goto(startUrl(LOCKED_ROWS))
  await page.getByRole('button', { name: '开始游戏' }).click()

  // 打完整条口令、走完一遍（先 B 后 A）。八下一步都没推动棋盘——四方向全锁死，
  // 无效方向也计数
  await earnFirstPass(page)

  // 用一个交换把这个「锁着但活着」的局带走：换 (0,0) 与 (3,3)，棋盘仍是死局，
  // 于是 phase 由 playing 转 stuck，卡片请出来（mode-contract §3 的
  // 「交换把它走死」那一条恢复路径）
  await page.getByRole('button', { name: '交换' }).click()
  await tileAt(page, 0, 0).click()
  await tileAt(page, 3, 3).click()

  const panel = page.locator('[data-panel="gameover"]')
  await expect(panel).toBeVisible()
  // 梗压在一切终局之上（这一局死局收场，说的还是彩蛋那句），而四个数字照旧报——
  // 彩蛋不收钱，账也没被抹掉。0 分 / 最高 16：八下一步都没走成
  await expect(line(page)).toHaveText('一念收下了，账照算：0 分，最高 16，合并 0 次，0 步')
  expect(problems).toEqual([])
})

/**
 * 三套风格各跑一遍的那一条：这一行**不引入新色值**。
 *
 * 它与读数小标签同一支墨（`--ink-variant` on 卡片面），而那一对在 milestone 场景已经
 * 量过（三套 contrast.json 各有一条）。所以这里不加新的对比度对、只为对称硬撑——
 * 断的正是「两个字都一样」这个事实：谁把这一行改成第二种颜色，红的是这一条。
 */
for (const style of STYLE_CATALOG) {
  test(`${style.label} · 卡片那一行与读数小标签同一支墨（不引入新色值）`, async ({ page }) => {
    const problems = watchProblems(page)
    await page.goto(startUrl(ONE_STEP_FROM_DEADLOCK))
    await page.getByRole('group', { name: '风格' }).getByRole('button', { name: style.label }).click()
    await expect(page.locator('main')).toHaveAttribute('data-style', style.id)
    await page.getByRole('button', { name: '开始游戏' }).click()

    await page.keyboard.press('ArrowRight')
    await expect(page.locator('[data-panel="gameover"]')).toBeVisible()

    const ink = await line(page).evaluate((element) => getComputedStyle(element).color)
    const label = await page
      .locator('.overlay__readout dt')
      .first()
      .evaluate((element) => getComputedStyle(element).color)
    expect(ink, `${style.label} 的卡片那一行用了第二种墨`).toBe(label)
    // 字号与记录标记同一档：它是这句标题与那句话的注脚，不是第二段正文
    const size = await line(page).evaluate((element) => getComputedStyle(element).fontSize)
    expect(size).toBe('12px')
    expect(problems).toEqual([])
  })
}
