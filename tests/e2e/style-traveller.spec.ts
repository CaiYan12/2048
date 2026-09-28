import { expect, test, type Page } from '@playwright/test'
import { STYLE_CATALOG } from '../../src/shared/styleCatalog'

/**
 * 风格旅行者：单局内切过 5 次以上风格 → **当场**一条祝贺，刷新之后计数与解锁都还在。
 *
 * ADR-0007 之后成就不落盘、也不等结算：切够第 5 次的那一刻就解锁（阈值钉在 5、判据
 * `>=`，由 tests/unit/achievements.test.ts 与 tests/unit/style-traveller.test.ts 钉住）。
 * 本文件验的是浏览器那一层：祝贺真的浮出来、只响一次、刷新不重播。
 *
 * DOM 契约（与 achievements.spec.ts 同一份）：祝贺是 `[data-toast]`；统计面板是
 * `[data-stats-panel]`，成就一行一个 `[data-achievement="<id>"]`，**不带解锁状态**。
 *
 * 确定性来自 `?seed=` + `?board=`：切风格本身与局面无关，用一副铺好的局面只为让棋盘
 * 立刻可玩（切换计数只数「活的这一局」里的真实换皮）。
 */

/** 行优先局面 → board 参数值（空串 = 空格） */
function boardQuery(rows: (number | null)[][]): string {
  return rows.flat().map((value) => value ?? '').join(',')
}

/** 一副铺好的 4×4：怎样的按键都不至于一步就死，方便反复切风格 */
const LAID_OUT: (number | null)[][] = [
  [1024, 2, 4, 8],
  [16, 32, 64, 128],
  [256, 8, 2, 4],
  [null, 2, 4, 8],
]

function startUrl(): string {
  return `/?seed=20260926&board=${boardQuery(LAID_OUT)}&score=4321`
}

/** 收集 console / page 错误：祝贺是新的渲染路径，React 警告要当场看见 */
function watchProblems(page: Page): string[] {
  const problems: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  return problems
}

/** 打开战绩与统计面板（开关：已经开着就不再点） */
async function openStats(page: Page): Promise<void> {
  const panel = page.locator('[data-stats-panel]')
  if (!(await panel.isVisible())) {
    await page.getByRole('button', { name: '战绩与统计' }).click()
  }
  await expect(panel).toBeVisible()
}

/**
 * 切换一次风格。**目标从 `data-style` 推**——那是 store 的真实状态落在外壳上的信号——
 * 而不是从 `aria-pressed` 推：后者是同一个事实的另一个投影，可能慢一帧。
 *
 * 上一版正是栽在这一点上（`.scratch/pw-baseline.log` 里那条时红时绿的 `style-traveller`）：
 * 点完一枚按钮之后立刻问「哪一枚没被选中」，如果 React 还没提交，问到的仍是**旧**的
 * 那一枚，于是同一枚被点两次；第二次对 store 是 no-op（`setStyle` 对同一个 id 直接返回
 * 原 state），而「等它变成 aria-pressed=true」这一步又已经为真——一次切换就这么丢了，
 * 计数与 `data-style` 双双比预期少一次。
 *
 * 现在两头都不靠它：目标由**目录 + 当前 data-style** 算出来（必然与当前不同，不可能撞成
 * no-op），点完之后等 `data-style` 真的变成目标 id——**这一条只有 store 动了才成立**。
 */
async function switchOnce(page: Page): Promise<void> {
  const shell = page.locator('main')
  const current = await shell.getAttribute('data-style')
  const target = STYLE_CATALOG.find((entry) => entry.id !== current)
  if (target === undefined) throw new Error(`从 data-style=${current} 找不到另一套风格可切`)
  await page.getByRole('group', { name: '风格' }).getByRole('button', { name: target.label }).click()
  await expect(shell).toHaveAttribute('data-style', target.id)
}

/** 连续切 count 次（每次都切到一个真的不同的风格上） */
async function switchTimes(page: Page, count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) await switchOnce(page)
}

/**
 * 等这一局的风格**真的落到盘上**再往下走。
 *
 * `setStyle` 的那两次写盘（settings + session）是 **fire-and-forget** 的：store 的动作
 * 不等 IndexedDB 的事务收口，而 `switchOnce` 的后置断言证明的只是**渲染**动了。于是紧跟着
 * `page.goto('/')` 会把一个还在飞的事务连同这一页一起丢掉——刷新之后读回来的还是上一条，
 * `data-style` 停在 classic 不动。
 *
 * 这就是这一条用例时红时绿的根：机器空着时那几毫秒够事务落地，四路并行跑起来就不够了
 * （探针实测：单独跑总是过、`--repeat-each` 下几乎必红）。所以这里等的是**盘上那个值**，
 * 不是一段 sleep——判据与玩家的真实处境同一条：刷新之前，这一局得先存下去。
 */
async function waitForPersistedStyle(page: Page, expected: string): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(async (want) => {
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('2048')
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
          })
          const read = (store: string): Promise<unknown> =>
            new Promise((resolve, reject) => {
              const transaction = db.transaction(store, 'readonly')
              const request = transaction.objectStore(store).get('current')
              request.onsuccess = () => resolve(request.result)
              request.onerror = () => reject(request.error)
            })
          const session = (await read('session')) as { styleId?: string } | null
          const settings = (await read('settings')) as { styleId?: string } | null
          db.close()
          return `${session?.styleId}/${settings?.styleId}`
        }, expected),
      { timeout: 5000 }
    )
    .toBe(`${expected}/${expected}`)
}

test('切四次：不够，一条祝贺都没有（阈值是 5，不是 4）', async ({ page }) => {
  const problems = watchProblems(page)
  await page.goto(startUrl())
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()

  await switchTimes(page, 4)

  await expect(page.locator('[data-toast]')).toHaveCount(0)
  // 面板上的那一行照实写着这个门槛
  await openStats(page)
  await expect(page.locator('[data-achievement="style-traveller"]')).toContainText(
    '本局切换 5 次以上风格'
  )
  expect(problems).toEqual([])
})

test('切到第五次当场解锁，只响一条；再切也不多响', async ({ page }) => {
  const problems = watchProblems(page)

  await page.goto(startUrl())
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()

  await switchTimes(page, 4)
  await expect(page.locator('[data-toast]')).toHaveCount(0)

  await switchOnce(page)
  const item = page.locator('[data-toast]')
  await expect(item).toHaveCount(1)
  await expect(item).toContainText('风格旅行者')

  // 再切一次：集合没变，就没有新的跃迁，也就不会再响一条
  await switchOnce(page)
  await expect(page.locator('[data-toast]')).toHaveCount(1)

  expect(problems).toEqual([])
})

test('局中刷新：切过的次数跟着这一局回来，补到阈值照样解锁，但不重播', async ({ page }) => {
  const problems = watchProblems(page)

  await page.goto(startUrl())
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()
  // 先切三次：还不够，此刻刷新一次，看这三次数不数得回来
  await switchTimes(page, 3)
  // **先等这一局存下去**：切完就立刻 goto 会把还在飞的写盘事务丢掉
  await waitForPersistedStyle(page, 'material')

  // 刷新：`?seed=` / `?board=` 优先于存档（T16），所以先 goto('/') 把参数去掉再 reload
  await page.goto('/')
  await page.reload()
  await expect(page.locator('[data-board]')).toBeVisible()
  // **等恢复落定再切**：hydrate 是异步的，棋盘一出现时 store 里的 styleId 可能还是默认的
  // classic（刷新前是 material），于是选择器上的 aria-pressed 与 store 短暂不一致——
  // 这时点那枚「看起来没被选中」的按钮，可能正是 store 已经选中的那一个，那一下是 no-op，
  // 一次切换都不算。data-style 落在外壳上，是「恢复真的生效了」的那个信号。
  await expect(page.locator('main')).toHaveAttribute('data-style', 'material')
  // 恢复是**静默基线**：三条切换还不构成解锁，屏幕上也没有半条补放的祝贺
  await expect(page.locator('[data-toast]')).toHaveCount(0)

  // 再切两次：3 + 2 = 5，正好压线。若切换计数没跟着这一局活过刷新，这里就差两次
  await switchTimes(page, 2)
  await expect(page.locator('[data-toast]')).toHaveCount(1)
  await expect(page.locator('[data-toast]')).toContainText('风格旅行者')
  expect(problems).toEqual([])
})

test('切够五次之后刷新：解锁还在，但一条祝贺都不重播', async ({ page }) => {
  const problems = watchProblems(page)

  await page.goto(startUrl())
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()
  await switchTimes(page, 5)
  await expect(page.locator('[data-toast]')).toHaveCount(1)
  // 同上：存档先落地，再刷新
  await waitForPersistedStyle(page, 'material')

  await page.goto('/')
  await page.reload()
  await expect(page.locator('[data-board]')).toBeVisible()

  // 恢复建立静默基线：解锁照算（集合与刷新前一致），但一条祝贺都不补放
  await expect(page.locator('[data-toast]')).toHaveCount(0)
  expect(problems).toEqual([])
})

test('换风格不碰这一局：同一副棋盘切五次，盘面状态一个字段都不动', async ({ page }) => {
  const problems = watchProblems(page)

  await page.goto(startUrl())
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()

  /** 盘面此刻的全部可观测状态：身份、数值、行列、分数 */
  const readRun = async (): Promise<string> => {
    const tiles = page.locator('[data-tile-id]')
    const cells: string[] = []
    for (let index = 0; index < (await tiles.count()); index += 1) {
      const tile = tiles.nth(index)
      cells.push(
        [
          await tile.getAttribute('data-tile-id'),
          await tile.getAttribute('data-value'),
          await tile.getAttribute('data-row'),
          await tile.getAttribute('data-col'),
        ].join(':')
      )
    }
    return `${await page.locator('[data-board]').getAttribute('data-mode')}|${
      await page.locator('[data-score]').textContent()
    }|${cells.join(',')}`
  }

  const before = await readRun()
  await switchTimes(page, 5)
  // **深相等在这里不够**：换皮若把 run 重建一遍、每个值都还在，这个断言照样过——
  // 所以 data-tile-id 的同一性由 style-switch.spec.ts 单独钉，这一条钉的是
  // 「盘面状态没变」（值）。两条一起才闭合
  expect(await readRun()).toBe(before)
  expect(problems).toEqual([])
})