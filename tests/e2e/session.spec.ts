import { expect, test, type Page } from '@playwright/test'

/**
 * T16 的存档纵向切片：刷新后续上上一局，旧版 / 损坏 / 写不进去都不假装。
 *
 * **本文件由 T16 编写，但不由它运行**（跑它的是控制人的统一 sweep，而且要 build +
 * preview）：本 Ticket 的会话被明确要求不启动 Playwright、不开任何浏览器。
 * 所以这里的断言全部走 data-* 的 DOM 契约（task-3-interfaces §7b）+ 计算样式，
 * 不伸进 store 改状态。**没跑过的 e2e 约四成会带着一处前提错误**（T11 的实测规律），
 * 这是本文件已知的风险，不是「已验证」。
 *
 * 局面确定性来自 `?seed=`（stores/seed.ts 的调试缝）。**显式开局指令优先于存档**
 * （useGameStore.doHydrate 里的 hasExplicitStart）：所以带 `?seed=` 的加载一定是
 * 一局新的，用来做对照组；而不带参数的加载才是「刷新后续玩」那一侧。本文件的
 * 对照组 / 实验组正是按这条分工搭的。
 *
 * 「刷新」用两种写法都覆盖：`page.goto('/')`（不带参数的一次新加载）与
 * `page.reload()`（F5，此时文档 URL 已经没有参数了）。IndexedDB 是同源的，
 * 两者对它来说是同一件事。
 */

interface TileSnapshot {
  id: string
  value: number
  row: number
  col: number
}

interface RunSnapshot {
  mode: string
  style: string
  score: string
  tiles: TileSnapshot[]
}

/** 从 DOM 还原一局的全部可观测状态（与 style-switch.spec.ts 同一套读法） */
async function readRun(page: Page): Promise<RunSnapshot> {
  const board = page.locator('[data-board]')
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
  return {
    mode: (await board.getAttribute('data-mode')) ?? '',
    style: (await page.locator('main').getAttribute('data-style')) ?? '',
    score: (await page.locator('[data-score]').textContent()) ?? '',
    tiles: snapshots,
  }
}

/** 选择器上按名字点一套风格 */
async function pickStyle(page: Page, label: string): Promise<void> {
  await page.getByRole('group', { name: '风格' }).getByRole('button', { name: label }).click()
}

/** 开局（同一条 seed） */
async function startRun(page: Page): Promise<void> {
  await page.goto(SEED_URL)
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()
}

/** '3:00' → 秒数 */
function parseSeconds(label: string | null): number {
  const [minutes, seconds] = (label ?? '0:00').split(':').map(Number)
  return minutes * 60 + seconds
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

test('F5 之后：棋盘、下一颗方块、分数、模式一模一样，且是一局接续不是一局新的', async ({
  page,
}) => {
  const problems = watchProblems(page)

  // 对照组：一路不刷新，三段按键走完
  await startRun(page)
  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowLeft')
  const afterTwo = await readRun(page)
  await page.keyboard.press('ArrowRight')
  const control = await readRun(page)
  // 先确认这一串按键真的推动了棋盘，否则后面「一致」可能什么都没证明
  expect(control).not.toEqual(afterTwo)

  // 实验组：同一 seed 重新开局，只走前两段，然后刷新
  await startRun(page)
  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowLeft')
  const beforeRefresh = await readRun(page)
  expect(beforeRefresh).toEqual(afterTwo)

  // F5。此时文档 URL 已经不带 ?seed=（上一行的 startRun 落在 SEED_URL 上，
  // 所以先 goto('/') 把参数去掉，再 reload）——不带参数才是「续玩」那一侧
  await page.goto('/')
  await page.reload()

  // 没有任何点击，棋盘自己回来了：这才是「续上上一局」
  await expect(page.locator('[data-board]')).toBeVisible()
  const afterRefresh = await readRun(page)
  expect(afterRefresh).toEqual(beforeRefresh)
  // 也不该冒出任何提示：正常恢复不是异常
  await expect(page.locator('[data-storage-notice]')).toHaveCount(0)

  // 下一颗方块：把第三段按键走完，与对照组的终局逐格一致。
  // tile 的身份（data-tile-id）也一起比对——身份变了说明 nextTileId 没恢复，
  // 而那是 T21 位移动画与「同一个方块」的共同依据
  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowRight')
  expect(await readRun(page)).toEqual(control)

  expect(problems).toEqual([])
})

test('刷新之后撤销路径还在：一路撤回到开局', async ({ page }) => {
  const problems = watchProblems(page)

  await startRun(page)
  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowUp')
  const afterOne = await readRun(page)
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowDown')
  const afterThree = await readRun(page)
  // 先确认这几步真的推动了棋盘，否则「一致」可能什么都没证明
  expect(afterThree).not.toEqual(afterOne)

  await page.goto('/')
  await page.reload()
  await expect(page.locator('[data-board]')).toBeVisible()
  // 撤销栈跟着一起回来了：撤销之前先确认这一点
  expect(await readRun(page)).toEqual(afterThree)

  // 撤销三次：一次回到两步，一次回到一步，一次回到开局盘面
  await page.locator('[data-board]').focus()
  await page.keyboard.press('z')
  const undoneOne = await readRun(page)
  expect(undoneOne).not.toEqual(afterOne)
  await page.keyboard.press('z')
  const undoneTwo = await readRun(page)
  expect(undoneTwo).toEqual(afterOne)
  await page.keyboard.press('z')
  const opening = await readRun(page)
  expect(opening).not.toEqual(undoneTwo)
  expect(opening.tiles).toHaveLength(2)
  expect(opening.score).toBe('0')

  expect(problems).toEqual([])
})

test('刷新之后风格与 Time Attack 的剩余时间都跟到同一处', async ({ page }) => {
  const problems = watchProblems(page)

  // 限时模式 + Material：两个都要跨过刷新
  await page.goto('/?seed=20260926')
  await page.getByRole('group', { name: '模式' }).getByRole('button', { name: '限时' }).click()
  await pickStyle(page, 'Material')
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-countdown]')).toBeVisible()
  await expect(page.locator('main')).toHaveAttribute('data-style', 'material')

  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowUp')
  const before = await readRun(page)
  const remaining = await page.locator('[data-countdown]').textContent()

  await page.goto('/')
  await page.reload()

  // 风格没被重置回经典（那是 settings / session 两个桶里的 selected style）
  await expect(page.locator('main')).toHaveAttribute('data-style', 'material')
  // 倒计时还在，而且没有被重新按满 3:00——deadline 是绝对时间戳（SPEC §3.1）
  await expect(page.locator('[data-countdown]')).toBeVisible()
  const afterRemaining = await page.locator('[data-countdown]').textContent()
  expect(parseSeconds(afterRemaining)).toBeLessThanOrEqual(parseSeconds(remaining))
  // 也不会凭空少一大截：刷新只该花掉刷新本身的那么多时间
  expect(parseSeconds(remaining) - parseSeconds(afterRemaining)).toBeLessThan(10)
  expect(parseSeconds(afterRemaining)).toBeGreaterThan(0)
  // 棋盘也接上了
  expect(await readRun(page)).toEqual(before)

  expect(problems).toEqual([])
})

test('存档损坏：界面给出可见提示，不把坏数据当成可续玩的一局', async ({ page }) => {
  const problems = watchProblems(page)

  await startRun(page)
  await page.locator('[data-board]').focus()
  const opening = await readRun(page)
  await page.keyboard.press('ArrowUp')
  const moved = await readRun(page)
  // 先确认这一步真的推动了棋盘：否则「坏数据没被恢复」可能只是棋盘本来就没动
  expect(moved).not.toEqual(opening)

  // 往 session 桶里塞一句不是存档的东西。用浏览器自己的 IndexedDB 写，
  // 不碰 store——要坏的正是「读取时读到这东西」这条路
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('2048', 1)
      request.onupgradeneeded = () => {
        for (const name of ['settings', 'session', 'history']) {
          if (!request.result.objectStoreNames.contains(name)) {
            request.result.createObjectStore(name)
          }
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('session', 'readwrite')
      // 一句中文文本：解得出 JSON 的部分根本没有，形状也无从谈起
      transaction.objectStore('session').put('这不是一个存档', 'current')
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    db.close()
  })

  await page.goto('/')

  // 提示可见，且说的是真话
  const notice = page.locator('[data-storage-notice]')
  await expect(notice).toBeVisible()
  await expect(notice).toHaveAttribute('data-storage-notice', 'restore-rejected')
  await expect(notice).toContainText('这一局读不出来')
  await expect(notice).toContainText('已损坏')
  await expect(notice).toContainText('开始新游戏')

  // 不假装恢复：盘面没有回来，开局界面在
  await expect(page.locator('[data-board]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '开始游戏' })).toBeVisible()

  expect(problems).toEqual([])
})

test('写入失败：界面给出警告，且说的是实话——页面内的撤销仍然可用', async ({ page }) => {
  // 让 IndexedDB 的每一次 put 都失败，形态照抄真实的 QuotaExceededError：
  // 错误对象是真的 DOMException，请求上带着它，并且真实浏览器对配额超限的处理
  // 就是连整个事务一起中止——三件事在这里都做了
  await page.addInitScript(() => {
    const quota = (): DOMException =>
      new DOMException('Simulated quota exceeded', 'QuotaExceededError')
    const openObjectStore = IDBTransaction.prototype.objectStore
    IDBTransaction.prototype.objectStore = function (name: string) {
      const store = openObjectStore.call(this, name)
      const transaction = this
      const originalPut = store.put.bind(store)
      ;(store as unknown as { put: unknown }).put = (value: unknown, key?: IDBValidKey) => {
        const request = originalPut(value, key) as IDBRequest
        Object.defineProperty(request, 'error', { configurable: true, get: quota })
        // 微任务里派发：onerror 的接收方是在 put 返回之后才挂上的，
        // 同步派发会掉在一个还没有监听者的请求上
        queueMicrotask(() => {
          request.onerror?.(new Event('error'))
        })
        transaction.abort()
        return request
      }
      return store
    }
  })
  const problems = watchProblems(page)

  await startRun(page)

  // 提示可见，且三段话都在：失败了、页面内的撤销还在、刷新可能续不上
  const notice = page.locator('[data-storage-notice]')
  await expect(notice).toBeVisible()
  await expect(notice).toHaveAttribute('data-storage-notice', 'write-failed')
  await expect(notice).toContainText('保存失败')
  await expect(notice).toContainText('本地存储已满')
  await expect(notice).toContainText('撤销仍然可用')
  await expect(notice).toContainText('刷新后可能无法继续')

  // 「撤销仍然可用」不是空话：按几下、撤销，棋盘真的回退
  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowLeft')
  const moved = await readRun(page)
  await page.keyboard.press('z')
  const undone = await readRun(page)
  expect(undone).not.toEqual(moved)
  await page.keyboard.press('z')
  expect(await readRun(page)).not.toEqual(undone)

  expect(problems).toEqual([])
})

test('新游戏不擦已结算数据：records 桶里的东西原样留在原地', async ({ page }) => {
  const problems = watchProblems(page)

  // 先把「已结算数据」摆进 records 桶。**本 Ticket 还没有 records 的写入方**
  // （那是 T17），所以这里直接用浏览器自己的 IndexedDB 摆一个进去；要验的是
  // 「新游戏的写入路径不碰它」。四个桶在建库那一刻就摆好，因为应用持有连接时
  // 升级数据库会被它挡住
  await page.addInitScript(() => {
    const request = indexedDB.open('2048', 1)
    request.onupgradeneeded = () => {
      const db = request.result
      for (const name of ['settings', 'session', 'history', 'records']) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name)
      }
      db.transaction('records', 'readwrite')
        .objectStore('records')
        .put({ bestScore: 9999, highestTile: 2048 }, 'classic:material')
    }
  })

  await startRun(page)
  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowUp')

  // 新游戏：未结算的 session 被放弃，新一局落成新的存档
  await page.getByRole('button', { name: '新游戏' }).click()
  await expect(page.locator('[data-score]')).toHaveText('0')
  const fresh = await readRun(page)

  await page.goto('/')
  await page.reload()
  await expect(page.locator('[data-board]')).toBeVisible()

  // 续上的是**新**那一局，不是被放弃的那一局：分数归零、盘面是新盘
  expect(await readRun(page)).toEqual(fresh)
  await expect(page.locator('[data-score]')).toHaveText('0')
  await expect(page.locator('[data-storage-notice]')).toHaveCount(0)

  // 而 records 一个字节都没被碰
  const survived = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('2048', 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const value = await new Promise<unknown>((resolve, reject) => {
      const get = db.transaction('records', 'readonly').objectStore('records').get('classic:material')
      get.onsuccess = () => resolve(get.result)
      get.onerror = () => reject(get.error)
    })
    db.close()
    return value
  })
  expect(survived).toEqual({ bestScore: 9999, highestTile: 2048 })

  expect(problems).toEqual([])
})
