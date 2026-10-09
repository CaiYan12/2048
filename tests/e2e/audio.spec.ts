import { expect, test, type Page } from '@playwright/test'
// T42：开/关抽屉的助手收编到共享模块（父规格决策 13）——本文件原先自己抄的那一套删除
import { closeSettings, openSettings } from './settings-helpers'

/**
 * T20 的浏览器半边：静音控件可操作、跨刷新保持，以及「仓库里没有音频文件」。
 *
 * **本文件由 T20 编写、不由它执行**（派发令明令：不准跑 playwright、不准开浏览器，
 * 也不准用任何驱动真实浏览器的 MCP）。跑它的是控制人的统一 sweep，而且要
 * build + preview（playwright.config.ts 的 webServer）。**没跑过的 e2e 约四成会带着
 * 一处前提错误**（T11 留下的实测规律），这是本文件已知的风险，不是「已验证」。
 *
 * 「声音对不对」在这里**不可验证**：headless 浏览器里音频本来就听不见。可验证的是
 * 行为——静音这个开关点了算数、刷新之后还算数、静音着一局照样打完、请求列表里一个
 * 音频文件都没有。至于好不好听，只有 owner 在真机上说了算。
 *
 * 局面确定性来自 `?seed=` / `?board=` 这两条调试缝（stores/seed.ts、stores/fixture.ts）：
 * 断言合并与死局都需要一副写得死的棋盘，随机开局做不到。
 *
 * **T39 把静音控件从页脚搬进了设置抽屉**：它现在是「左静态标签 + 右开关」的一行，所以碰它
 * 之前得先开抽屉（下面两个 helper）。本文件里关于**旧控件自身文案**的断言改成了新行的，
 * 而关于**落盘值**（`data-mute`）的断言一行没改——控件搬了地方、换了长相，它说的意思一个字
 * 没动，那个不对称本身就是这条验收的检查。
 */

/** 行优先局面 → board 参数值（空串 = 空格） */
function boardQuery(rows: (number | null)[][]): string {
  return rows.flat().map((value) => value ?? '').join(',')
}

/** 开局 URL：固定种子 + 固定局面 */
function startUrl(rows: (number | null)[][], seed = 20260926): string {
  return `/?seed=${seed}&board=${boardQuery(rows)}`
}

/**
 * 数一数这个页面造了几个 AudioContext
 *
 * `addInitScript` 在页面脚本之前跑，所以从加载那一刻起每一次构造都被记着。
 * 这条断言是 ticket 验收标准 1 的浏览器半边：**首次用户手势之前不创建 AudioContext**。
 * 单测那半边（tests/unit/synth.test.ts）证的是「不在导入时构造」，这里证的是
 * 「不在加载时构造」——两件事各有各的失败方式。
 */
async function countAudioContexts(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as unknown as { __audioContexts: number }).__audioContexts
  )
}

async function watchAudioContexts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const Real = window.AudioContext
    const marker = window as unknown as { __audioContexts: number }
    marker.__audioContexts = 0
    window.AudioContext = class extends Real {
      constructor() {
        super()
        marker.__audioContexts += 1
      }
    } as unknown as typeof AudioContext
  })
}

/** 收集请求 URL：后面断言「一个音频文件都没被请求」 */
function watchRequests(page: Page): string[] {
  const urls: string[] = []
  page.on('request', (request) => urls.push(request.url()))
  return urls
}

/**
 * 静音开关。`data-mute` 是断言点（true = 静音），自 T20 起没变。
 *
 * **T39 起它住在设置抽屉里**（`MuteToggle` 从页脚那颗裸按钮变成「左静态标签 + 右开关」的
 * 一行），所以碰它之前得先把抽屉打开。控件搬了地方，`data-mute` 与它的语义一个字没动：
 * 本文件里关于落盘值的断言因此一行都没改。
 */
function muteButton(page: Page) {
  return page.locator('button[data-mute]')
}

/**
 * 等 settings 桶里的 mute 真的写落地
 *
 * 写盘是 fire-and-forget 的（useGameStore 里的 `void writeSettings(...)`），点完静音
 * 立刻刷新可能撞在写入完成之前——那样测出来的是一场竞态，不是持久化。所以直接从盘上
 * 读，等那一份真的翻了再刷新。
 */
async function expectPersistedMute(page: Page, muted: boolean): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('2048')
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
          })
          const read = new Promise<unknown>((resolve, reject) => {
            const get = db
              .transaction('settings', 'readonly')
              .objectStore('settings')
              .get('current')
            get.onsuccess = () => resolve(get.result)
            get.onerror = () => reject(get.error)
          })
          const record = (await read) as { mute?: unknown } | null
          db.close()
          return record?.mute ?? null
        }),
      { message: `等 settings 桶里的 mute 变成 ${String(muted)}` }
    )
    .toBe(muted)
}

/** 一局合并：左移把两个 2 合成一个 4 */
const MERGE_BOARD: (number | null)[][] = [
  [2, 2, null, null],
  [null, null, null, null],
  [null, null, null, null],
  [null, null, null, null],
]

/** 一步即死局：右移把第 0 行右端那个空格填掉，16 格全满且相邻不等（与 undo.spec 同一副盘） */
const ONE_STEP_FROM_DEADLOCK: (number | null)[][] = [
  [8, 2, 4, null],
  [8, 2, 4, 8],
  [2, 4, 8, 2],
  [4, 8, 2, 4],
]

test('静音控件：点了算数，刷新之后还算数', async ({ page }) => {
  await page.goto('/?seed=20260926')

  // T39：静音是设置，住在设置抽屉里——先开抽屉。旧控件那句「随状态变」的文案现在拆成
  // 两半：行里一个静态标签「音效」，状态由开关的 aria-checked 说（可访问名不随状态变）
  await openSettings(page)
  const mute = muteButton(page)
  await expect(mute).toHaveAccessibleName('音效')
  await expect(mute).toHaveAttribute('aria-checked', 'true')
  await expect(mute).toHaveAttribute('data-mute', 'false')
  await closeSettings(page)

  await page.getByRole('button', { name: '开始游戏' }).click()
  // 局中同一个开关还在：不按 phase 分叉，入口只有一个
  await openSettings(page)
  await expect(mute).toHaveAccessibleName('音效')
  await expect(mute).toHaveAttribute('aria-checked', 'true')

  await mute.click()
  await expect(mute).toHaveAttribute('aria-checked', 'false')
  await expect(mute).toHaveAttribute('data-mute', 'true')
  await closeSettings(page)
  await expectPersistedMute(page, true)

  // 刷新（reload 保留 URL，此时已经没有参数了）
  await page.reload()
  await openSettings(page)
  await expect(mute).toHaveAttribute('data-mute', 'true')
  await expect(mute).toHaveAttribute('aria-checked', 'false')

  // 再点一次就回来了，并且这个「回来」也跟着刷新活下来
  await mute.click()
  await expect(mute).toHaveAttribute('data-mute', 'false')
  await closeSettings(page)
  await expectPersistedMute(page, false)
  await page.goto('/')
  await openSettings(page)
  await expect(mute).toHaveAttribute('data-mute', 'false')
})

test('静音的第一次按键连 AudioContext 都不造', async ({ page }) => {
  await watchAudioContexts(page)
  await page.goto('/?seed=20260926')

  // 加载完、一个交互都还没有：一个 context 都不该存在
  expect(await countAudioContexts(page)).toBe(0)

  // T39：开关在抽屉里，先开抽屉再点；点完关掉，好接着开始这一局
  await openSettings(page)
  await muteButton(page).click()
  await expect(muteButton(page)).toHaveAttribute('data-mute', 'true')
  await closeSettings(page)
  await expectPersistedMute(page, true)
  await page.getByRole('button', { name: '开始游戏' }).click()

  // 静音着按方向键：一步有效移动（会有合并音、移动音），但一个 context 都没有
  await page.keyboard.press('ArrowUp')
  await expect(page.locator('[data-tile-id]')).toHaveCount(3)
  expect(await countAudioContexts(page)).toBe(0)

  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowDown')
  expect(await countAudioContexts(page)).toBe(0)
})

test('第一次发声才造 AudioContext，而且只造一个', async ({ page }) => {
  await watchAudioContexts(page)
  await page.goto('/?seed=20260926')
  expect(await countAudioContexts(page)).toBe(0)

  await page.getByRole('button', { name: '开始游戏' }).click()
  // 开局界面点「开始游戏」也在手势里，但它不产生任何声音：context 仍不存在
  expect(await countAudioContexts(page)).toBe(0)

  await page.keyboard.press('ArrowUp')
  expect(await countAudioContexts(page)).toBe(1)

  // 一路按下去：复数次发声，复数个事件，仍然只有那一个 context
  for (const key of ['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp']) {
    await page.keyboard.press(key)
  }
  expect(await countAudioContexts(page)).toBe(1)
})

test('静音着一局照样打得完：合并、死局、结算、新游戏', async ({ page }) => {
  const urls = watchRequests(page)
  await page.goto(startUrl(MERGE_BOARD))
  // T39：开关在抽屉里，先开抽屉点一下静音，关掉抽屉再开始这一局
  await openSettings(page)
  await muteButton(page).click()
  await closeSettings(page)
  await page.getByRole('button', { name: '开始游戏' }).click()

  // 一次合并：2+2 → 4，计分跟着走。声音这条路静音着，规则一个字都没少
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('[data-score]')).toHaveText('4')
  await expect(page.locator('[data-tile-id][data-value="4"]')).toHaveCount(1)
  await expect(page.locator('[data-tile-id]')).toHaveCount(2)

  // 换一副一步即死局的盘，照样走过去：死局面板、撤销、结算、新游戏
  await page.goto(startUrl(ONE_STEP_FROM_DEADLOCK))
  // 刷新之后静音还在：这一路都是在静音状态下打完的（落盘值那条断言一字未改）
  await openSettings(page)
  await expect(muteButton(page)).toHaveAttribute('data-mute', 'true')
  await closeSettings(page)
  await page.getByRole('button', { name: '开始游戏' }).click()
  await page.keyboard.press('ArrowRight')

  const panel = page.locator('[data-panel="gameover"]')
  await expect(panel).toBeVisible()
  // endReason 还没落：stuck 只是「还没决定」，不是终局（run-endings.spec.ts 同一口径）
  expect(await panel.getAttribute('data-end-reason')).toBeNull()
  // 死局是可恢复的：撤销把这一步退回去，面板随之退下
  await panel.getByRole('button', { name: '撤销' }).click()
  await expect(panel).toBeHidden()

  // 再死一次，这次收工
  await page.keyboard.press('ArrowRight')
  await expect(panel).toBeVisible()
  await panel.getByRole('button', { name: '结束并记录' }).click()
  await expect(panel).toContainText('本局已结束')
  await expect(panel).toHaveAttribute('data-end-reason', 'deadlock')

  // 结算完开新局（active 局的「新游戏」= 放弃本局，不写记录）
  await panel.getByRole('button', { name: '新游戏' }).click()
  await expect(panel).toBeHidden()
  await expect(page.locator('[data-board]')).toHaveAttribute('data-mode', 'classic')
  await expect(page.locator('[data-score]')).toHaveText('0')

  // 验收标准 1 后半句：整个过程中一个音频文件都没被请求过（WebAudio 是实时合成的）
  const audioRequests = urls.filter((url) =>
    /\.(mp3|wav|ogg|m4a|aac|flac|opus|webm)(\?|$)/i.test(url) || /\/audio\//.test(url)
  )
  expect(audioRequests).toEqual([])
})

test('repository 里没有音频文件：请求列表里连一个都没有', async ({ page }) => {
  const urls = watchRequests(page)
  // 从加载第一帧就开始收集，包括字体与脚本：这里要证的是「没有新增音频资产」
  await page.goto('/?seed=20260926')
  await page.getByRole('button', { name: '开始游戏' }).click()
  for (const key of ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']) {
    await page.keyboard.press(key)
  }
  // 请求里只有字体 / 脚本 / 样式：一个音频后缀都没有，也没有 /audio/ 这一节路径
  const audioRequests = urls.filter((url) =>
    /\.(mp3|wav|ogg|m4a|aac|flac|opus|webm)(\?|$)/i.test(url) || /\/audio\//.test(url)
  )
  expect(audioRequests).toEqual([])
  // 顺带证明这一路真的发出了请求（不然上面那条会因为「什么都没加载」而侥幸通过）
  expect(urls.length).toBeGreaterThan(0)
})
