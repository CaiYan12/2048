import { expect, test, type Page } from '@playwright/test'

/**
 * T17 的记录 / 统计纵向切片：结算 → 按结算风格写记录 → 面板看得见 → 刷新还在。
 *
 * **本文件由 T17 编写，但不运行**（跑它的是控制人的统一 sweep，而且要 build + preview）。
 * 断言全部走 data-* 的 DOM 契约，不伸进 store 改状态。没跑过的 e2e 约四成会带着
 * 一处前提错误（T11 的实测规律），这是本文件已知的风险，不是「已验证」。
 *
 * 局面确定性来自 `?seed=` / `?board=`（开局夹具，见 src/renderer/stores/fixture.ts）：
 * 死局与胜局靠人手按键几乎无法复现，而这里要断言的正是「结束并记录」这一下。
 * 局面铺好之后，每一步仍然走真实按键与真实规则内核。
 *
 * **`?seed=` / `?board=` 优先于存档**（T16 的 hasExplicitStart）：带着参数的加载
 * 一定是一局新的。所以「结算 → 刷新 → 记录还在」这一路上，刷新用的是 `goto('/')`
 * 把参数去掉再 `reload()`——与 tests/e2e/session.spec.ts 同一套写法。参数还在的
 * 加载验的是对照组（重开一局），不是续玩那一侧。
 *
 * 读记录一律走**落盘的那一份**：面板上的数字是 hydrate 时从 records / stats 两个桶
 * 读回来的，刷新之后仍然对得上，就证明它不在内存里另算了一份。
 */

/** 行优先局面 → board 参数值（空串 = 空格） */
function boardQuery(rows: (number | null)[][]): string {
  return rows.flat().map((value) => value ?? '').join(',')
}

/** 开局 URL：固定种子让「移动后的生成」也可预期，固定分数让记录里的 bestScore 可断言 */
function startUrl(rows: (number | null)[][], score: number): string {
  return `/?seed=20260926&board=${boardQuery(rows)}&score=${score}`
}

/** 一步即死局：一次右移填满棋盘，而横竖相邻都不相等（tests/e2e/run-endings.spec.ts 同款） */
const ONE_STEP_FROM_DEADLOCK: (number | null)[][] = [
  [8, 2, 4, null],
  [8, 2, 4, 8],
  [2, 4, 8, 2],
  [4, 8, 2, 4],
]

/** 收集 console error / pageerror；返回的数组必须是空数组 */
function watchProblems(page: Page): string[] {
  const problems: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  return problems
}

/**
 * 打开战绩与统计面板。
 *
 * **幂等**：那个按钮是**开关**（aria-expanded 跟着面板走），所以面板已经开着时再点一次
 * 是把它关掉。原来这里无条件点一下，于是「面板开着的时候点新游戏、接着再 openStats」
 * 那条路必然失败——面板没关，这一下把它关了（实测 records 的第 187 与 212 两条都很容易
 * 踩到）。已经开着就直接断言可见，不重复点。
 */
async function openStats(page: Page): Promise<void> {
  const panel = page.locator('[data-stats-panel]')
  if (!(await panel.isVisible())) {
    await page.getByRole('button', { name: '战绩与统计' }).click()
  }
  await expect(panel).toBeVisible()
}

/** 一条记录的两个数字 */
async function readRecord(
  page: Page,
  key: string
): Promise<{ bestScore: string; highestTile: string } | null> {
  const row = page.locator(`[data-record="${key}"]`)
  if ((await row.count()) === 0) return null
  return {
    bestScore: (await row.getAttribute('data-best-score')) ?? '',
    highestTile: (await row.getAttribute('data-highest-tile')) ?? '',
  }
}

/** 统计面板上的三个数字（成就那一栏已随 ADR-0007 撤下：它答不上「谁解锁了」） */
async function readStats(page: Page): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const key of ['totalRuns', 'wins', 'timePlayedMs']) {
    out[key] = (await page.locator(`[data-stat="${key}"]`).textContent()) ?? ''
  }
  return out
}

/** 开局并走成死局，停在待收工的那一刻 */
async function reachDeadlock(page: Page): Promise<void> {
  await page.goto(startUrl(ONE_STEP_FROM_DEADLOCK, 4321))
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-score]')).toHaveText('4321')
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-panel="gameover"]')).toBeVisible()
  await expect(page.locator('[data-panel="gameover"]')).toHaveCount(1)
  // 16 格全满、四方向皆无合法移动
  await expect(page.locator('[data-tile-id]')).toHaveCount(16)
}

test('死局 → 结束并记录：结算的那一刻，成绩落在经典 × 经典这一格里', async ({ page }) => {
  const problems = watchProblems(page)
  await reachDeadlock(page)

  await page.getByRole('button', { name: '结束并记录' }).click()
  await expect(page.locator('[data-panel="gameover"]')).toHaveAttribute('data-end-reason', 'deadlock')

  await openStats(page)
  // 只有一条记录，而且就是这一局结算时所在的那一套风格
  await expect(page.locator('[data-record]')).toHaveCount(1)
  expect(await readRecord(page, 'classic:classic')).toEqual({
    // 4321 = 开局自带的分数（右移那一行没有合并，一步没涨）
    bestScore: '4321',
    // 盘面上最大的那块是 8
    highestTile: '8',
  })
  // 统计按公式：一局死局、没有胜局、时长是一段墙上时间
  const stats = await readStats(page)
  expect(stats.totalRuns).toBe('1')
  expect(stats.wins).toBe('0')
  expect(stats.timePlayedMs).toMatch(/^\d+:\d{2}$/)
  // 成就那一栏已经撤下（ADR-0007）：面板不再声称谁解锁了
  await expect(page.locator('[data-stat="achievementUnlocks"]')).toHaveCount(0)

  expect(problems).toEqual([])
})

test('局中切到 Material 再结算：只有 Material 的记录变化', async ({ page }) => {
  const problems = watchProblems(page)

  // 对照组：一局不换风格，经典 × 经典记下一笔
  await reachDeadlock(page)
  await page.getByRole('button', { name: '结束并记录' }).click()
  await openStats(page)
  const classicBefore = await readRecord(page, 'classic:classic')
  expect(classicBefore).toEqual({ bestScore: '4321', highestTile: '8' })
  await expect(page.locator('[data-record]')).toHaveCount(1)

  // 实验组：同一个 seed 再来一局，局中换成 Material 再结算
  await page.goto(startUrl(ONE_STEP_FROM_DEADLOCK, 4321))
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()
  await page
    .getByRole('group', { name: '风格' })
    .getByRole('button', { name: 'Material' })
    .click()
  await expect(page.locator('main')).toHaveAttribute('data-style', 'material')

  // **先把焦点交回棋盘再按键**：开局那一刻焦点是应用替我们放在棋盘上的，而上面点过风格
  // 按钮，焦点已经落在那个按钮上——此时按方向键改的是按钮的焦点/页面滚动，棋盘一步不动，
  // 于是死局面板永远不出现（实测就是这么红的）。reachDeadlock 那条路没有中途点按钮，
  // 所以它不需要这一句。
  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-panel="gameover"]')).toBeVisible()
  await page.getByRole('button', { name: '结束并记录' }).click()

  await openStats(page)
  // 两套风格各有一笔，数字逐项相同（同一 seed、同一串按键）
  const material = await readRecord(page, 'classic:material')
  expect(material).toEqual({ bestScore: '4321', highestTile: '8' })
  // 经典那一格一个数字都没动：切风格不写记录，结算只归当前那一个
  expect(await readRecord(page, 'classic:classic')).toEqual(classicBefore)
  await expect(page.locator('[data-record]')).toHaveCount(2)
  // 两局都数进去了
  expect((await readStats(page)).totalRuns).toBe('2')

  expect(problems).toEqual([])
})

test('结算之后刷新：开局界面回来了，而记录还在原地', async ({ page }) => {
  const problems = watchProblems(page)
  await reachDeadlock(page)
  await page.getByRole('button', { name: '结束并记录' }).click()
  await openStats(page)
  const before = await readRecord(page, 'classic:classic')
  const statsBefore = await readStats(page)

  // 刷新。**先把参数去掉**：带着 ?seed= / ?board= 的加载是一局新的（T16 的
  // hasExplicitStart），那不是这一路要验的东西。不带参数才是「读存档」那一侧
  await page.goto('/')
  await page.reload()

  // 已结算的一局安静作废（T16）：没有棋盘、没有提示、开局界面在
  await expect(page.getByRole('button', { name: '开始游戏' })).toBeVisible()
  await expect(page.locator('[data-board]')).toHaveCount(0)
  await expect(page.locator('[data-storage-notice]')).toHaveCount(0)

  // 而成绩一个字节都没少：这一份是从盘上读回来的，不是内存里剩下来的
  await openStats(page)
  expect(await readRecord(page, 'classic:classic')).toEqual(before)
  expect(await readStats(page)).toEqual(statsBefore)

  expect(problems).toEqual([])
})

test('结算之后再开新游戏：已结算的数据一个字节都不被擦', async ({ page }) => {
  const problems = watchProblems(page)
  await reachDeadlock(page)
  await page.getByRole('button', { name: '结束并记录' }).click()
  await openStats(page)
  const settled = await readRecord(page, 'classic:classic')

  // 从已结算的面板开新局：本局作废、新一局落成新的存档
  await page.getByRole('button', { name: '新游戏' }).click()
  await expect(page.locator('[data-panel]')).toHaveCount(0)
  await expect(page.locator('[data-score]')).toHaveText('0')

  await openStats(page)
  // 记录照旧，而总局数没有变成 2——新开的一局还没有结算过
  expect(await readRecord(page, 'classic:classic')).toEqual(settled)
  expect((await readStats(page)).totalRuns).toBe('1')

  await page.goto('/')
  await page.reload()
  await openStats(page)
  expect(await readRecord(page, 'classic:classic')).toEqual(settled)

  expect(problems).toEqual([])
})

test('战绩与统计面板键盘可达，而且不打扰棋盘自己的行为', async ({ page }) => {
  const problems = watchProblems(page)

  // 先结算一局，让面板里有东西可看
  await reachDeadlock(page)
  await page.getByRole('button', { name: '结束并记录' }).click()
  await openStats(page)
  await expect(page.locator('[data-record="classic:classic"]')).toBeVisible()
  await page.getByRole('button', { name: '收起' }).click()
  // 从已结算的面板开一局新的：接下来要验的是「面板开着的时候棋盘还好不好」，
  // 而 ended 的棋盘本来就推不动，证不了这件事
  await page.getByRole('button', { name: '新游戏' }).click()
  await expect(page.locator('[data-panel]')).toHaveCount(0)
  await expect(page.locator('[data-score]')).toHaveText('0')

  // 键盘打开面板：原生 button，Tab 停得下、Enter 打得开
  const toggle = page.getByRole('button', { name: '战绩与统计' })
  await toggle.focus()
  await expect(toggle).toBeFocused()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await page.keyboard.press('Enter')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('[data-stats-panel]')).toBeVisible()

  // 它是 .board 的**兄弟**，不是盖在棋盘上的一层：棋盘还在，一个格子都没被挡住
  await expect(page.locator('[data-board]')).toBeVisible()
  await expect(page.locator('[data-tile-id]')).toHaveCount(2)

  // 面板里的「收起」同样原生可达：Tab 就到，Enter 就关
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: '收起' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-stats-panel]')).toHaveCount(0)

  // 收摊之后棋盘照旧推得动：两枚开局方块 + 新生成的一枚 = 3
  //
  // **四个方向依次试，不假定 ArrowLeft 一定推得动**：新游戏的盘面是随机的，两枚方块本来
  // 就靠左时左移是一次无效移动——无效移动不生成（CONTEXT.md 的 Spawn），方块数停在 2，
  // 于是这条断言会时红时绿（实测隔离跑 3/3 过、整批跑偶发红）。
  await page.locator('[data-board]').focus()
  for (const key of ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown']) {
    await page.keyboard.press(key)
    if ((await page.locator('[data-tile-id]').count()) === 3) break
  }
  await expect(page.locator('[data-tile-id]')).toHaveCount(3)
  await expect(page.locator('[data-stats-panel]')).toHaveCount(0)

  expect(problems).toEqual([])
})

test('上一版写下的统计（带已退休的成就 id）照旧显示，不整条作废', async ({ page }) => {
  const problems = watchProblems(page)

  // 先让应用把库与桶建出来——下面那个 open 不带版本号，等于「用已有的那个库」，
  // 而不是把「库里有哪几个桶」这个实现细节抄进测试（session.spec.ts 同一条路子）
  await page.goto('/')
  await expect(page.getByRole('button', { name: '开始游戏' })).toBeVisible()

  // 往 stats 桶里放一条**上一版形状**的记录：版本号是对的，但多了一个 achievements 块，
  // 里面还写着两个已经退休的成就 id。ADR-0007 要的是「退休一个成就不该让玩家丢掉战绩」，
  // 所以这条记录必须读得出来，而不是被整条拒绝
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('2048')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('stats', 'readwrite')
      transaction.objectStore('stats').put(
        {
          version: 1,
          totalRuns: 4,
          wins: 2,
          timePlayedMs: 3600000,
          achievements: {
            unlocked: ['mode-collector', 'daily-stand'],
            modesWon: ['classic', 'fibonacci'],
            highestTile: 4096,
            bestMerges: 250,
            bestTimeAttackScore: 21000,
            dailyStreakDate: '2026-09-07',
            dailyStreakLength: 7,
          },
          lastRunStartedAt: null,
        },
        'current'
      )
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    db.close()
  })

  await page.goto('/')
  await expect(page.getByRole('button', { name: '开始游戏' })).toBeVisible()
  // 桌面上没有「统计读不出来」那句话：认不得的字段被丢掉，三个数字照旧认
  await expect(page.locator('[data-storage-notice]')).toHaveCount(0)

  await openStats(page)
  const stats = await readStats(page)
  expect(stats.totalRuns).toBe('4')
  expect(stats.wins).toBe('2')
  // 3600000ms → '1:00:00'
  expect(stats.timePlayedMs).toBe('1:00:00')

  expect(problems).toEqual([])
})
