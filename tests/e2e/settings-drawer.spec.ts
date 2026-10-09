import { expect, test, type Locator, type Page } from '@playwright/test'
import { STYLE_CATALOG, type StyleId } from '../../src/shared/styleCatalog'
// T42：开/关抽屉与选风格的助手收编到共享模块（父规格决策 13）——本文件原先自己抄的
// pickStyle / openDrawer / closeDrawer / settledAnimations 删除，调用方改走下面这一份
import { closeSettings, openSettings, pickStyle } from './settings-helpers'

/**
 * 设置抽屉：打开、拦住、关掉、回到原处（T37），进出动效（T38），以及静音行（T39）。
 * 父规格 docs/specs/settings-drawer.md · ADR-0010 · GitHub #39（T37）/ #40（T38）/ #41（T39）。
 *
 * 同一套断言对三套风格各跑一遍（接结果层与彩蛋那两条既有缝）：抽屉是**外壳**不是第五个
 * 插槽，三套只出 token 与 CSS，所以唯一能防漂移的就是同一组不变量跑三遍。文件里没有一句
 * 「Classic 会这样、Material 会那样」的分叉——差别只通过各自的计算样式体现。
 *
 * 契约逐条（与票据 T37 / T38 的验收标准一一对应）：
 *   1. 入口在开局界面 / 局中 / 结果层在场 / 二念扣下时同址，只在读档中隐藏；
 *   2. 入口是纯图标按钮：可访问名「设置」、3rem 命中区、`aria-expanded`、只有三个状态；
 *   3. 图形是一份三套共用的内联 SVG，颜色走 `currentColor`；
 *   4. 打开之后每一条指针路径都落在遮罩 / 抽屉上；
 *   5. 打开之后方向键 / WASD / Z 被吃掉、不滚页面；滚轮照旧；文本入口照旧拿得到自己的键；
 *   6. 打开之后 `Tab` 到不了遮罩后面（页面内容 `inert`）；
 *   7. 三种关法都通；`Esc` 优先于底下的交换摊，也优先于神魔摊（打码之后那两颗圆钮）；
 *   8. 关掉之后回到离开时的状态；焦点打开时落在容器、关闭时回到入口；
 *   9. 抽屉是 `role="dialog"` + 名字、不加 `aria-modal`；贴右铺满、宽 `min(22rem,100vw)`。
 *  10. **T38 动效**：进 250ms / 出 200ms + 曲线 `cubic-bezier(0.32, 0.72, 0, 1)`；退场的
 *      终点是 `animationend`（假时钟冻不住它）；退场那一帧起交出指针；reduced-motion 撤
 *      位移、两个时长不变；结果层与彩蛋菜单的 150ms 一个字节没动。
 *  11. **T39 静音行**：左静态标签（`<span id>`）+ 右开关，可访问名由 `aria-labelledby` 引用
 *      标签、不用 `<label>`、无可见状态文字；整行可点；两态靠滑块位置 + 轨道换色说；几何
 *      三套共用（轨道 2.25rem × 1.25rem、滑块 1rem、行程 1rem、行内间距 0.75rem）；
 *      `data-mute` 语义未变（控件搬了地方、长相变了，它说的意思一字未改）。
 *  12. **T40 浮层不被 `inert` 收走**：抽屉开着时页面内容整块 `inert`，而 Toast 栈与礼炮
 *      （以及悬顶）住在那个包裹元素**之外**——它们是盖在页面上的浮层，跟着一起被收走就等于
 *      「设置开着时祝贺看不见、礼炮不响」。悬顶的断言在「入口在四种页面状态下同址」那条里
 *      （它在那一路局里稳定在场）；Toast 由一次确定性的合并触发；礼炮的粒子 canvas 是瞬态
 *      （粒子熄完就卸载），改用 reduced-motion 下那行**整局都在场**的 `.cannon__still` 证
 *      同一条 DOM 归属（两种形态是同一个 `<Cannon>` 的兄弟节点，结构逐字相同）。
 *
 * **T38 起关掉抽屉不再是硬切**：容器比「关闭」多活一段退场动画，所以开与关都要等动画
 * 收尾——那两个助手自 T42 起收编在共享模块 `settings-helpers.ts`（`openSettings` /
 * `closeSettings`），本文件的调用方一并迁移。那些「关掉之后立刻 count 0」的旧断言
 * 改成「等退场播完再 count 0」，是规格决策 10 要求的行为变化，不是为了让新用例变绿。
 *
 * 局面确定性来自 `?seed=` + `?board=`（开局夹具）。**显式局面优先于存档**
 * （`hasExplicitStart`），所以每个状态各 goto 一次就各自拿一页干净的，不会互相串。
 */

/** 行优先局面 → board 参数值（空串 = 空格） */
function boardQuery(rows: (number | null)[][]): string {
  return rows.flat().map((value) => value ?? '').join(',')
}

/** 开局 URL：固定种子让「移动之后的生成」也可预期 */
function startUrl(rows: (number | null)[][]): string {
  return `/?seed=20260926&board=${boardQuery(rows)}`
}

/**
 * 活跃局：第 3 行右端留一个空格，四个方向都推得动。用来验「正在打的一局还在打」与
 * 「打开抽屉不推棋」——它有合法移动，所以棋盘动不动是可观测的。
 */
const ACTIVE: (number | null)[][] = [
  [2, 4, 8, 16],
  [4, 8, 16, 2],
  [8, 16, 2, 4],
  [16, 2, 4, null],
]

/** 四个 1024：一次左移合出两个 2048（第一次达标），结果层当场挂上 */
const FOUR_1024: (number | null)[][] = [
  [1024, 1024, 1024, 1024],
  [null, null, null, null],
  [null, null, null, null],
  [null, null, null, null],
]

/** 满盘十六档、两两不相等：神魔码那八下全是无效移动，棋盘一个格子都不动 */
const LADDER_FULL_BOARD =
  '2,4,8,16,32,64,128,256,512,1024,2048,4096,8192,16384,32768,65536'

/**
 * 第 0 行只有一对 2，其余三行互不相邻相等：一次左移恰好完成**一次**合并，离目标块还远。
 * 那一步会解锁「首次合并」（注册表第一位），于是**一条祝贺确定性地浮出来**——用它来证
 * 「Toast 栈住在 inert 之外」时，不必去赌一条偶发的祝贺。
 */
const ONE_PAIR: (number | null)[][] = [
  [2, 2, null, null],
  [4, 8, 16, 32],
  [64, 128, 256, 512],
  [2, 4, 8, 16],
]

/** 神魔码的八下（↑↑↓↓←→←→） */
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

/**
 * 页面上所有可能成为 Tab 停靠点的元素（原生可聚焦 + 正的 tabindex）。
 * 与 task-22-a11y / contrast-computed 同一份口径——三处都从它推导走查，不各写一套。
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** 收集 console / page 错误：新挂的层与新挂的属性若有 React 警告要当场看见 */
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
  for (let index = 0; index < (await tiles.count()); index += 1) {
    const tile = tiles.nth(index)
    const row = Number(await tile.getAttribute('data-row'))
    const col = Number(await tile.getAttribute('data-col'))
    grid[row][col] = Number(await tile.getAttribute('data-value'))
  }
  return grid
}

/** 开局：选风格 → 开始游戏 */
async function startRun(page: Page, style: StyleId, url: string): Promise<void> {
  await page.goto(url)
  const label = STYLE_CATALOG.find((entry) => entry.id === style)?.label ?? style
  await pickStyle(page, label)
  await expect(page.locator('main')).toHaveAttribute('data-style', style)
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()
}

/** 入口那颗齿轮（可访问名是「设置」） */
const entry = (page: Page): Locator => page.locator('.settings-entry')
const drawer = (page: Page): Locator => page.locator('[data-settings-drawer]')

/** 读抽屉与遮罩此刻的计算动效：动画名 + 时长 + 曲线（换风格不该换这三个数——它们是外壳的） */
function motionTiming(page: Page): Promise<{
  drawer: { name: string; duration: string; easing: string }
  scrim: { name: string; duration: string; easing: string }
}> {
  return page.evaluate(() => {
    const read = (selector: string): { name: string; duration: string; easing: string } => {
      const style = getComputedStyle(document.querySelector(selector) as Element)
      return {
        name: style.animationName,
        duration: style.animationDuration,
        easing: style.animationTimingFunction,
      }
    }
    return { drawer: read('[data-settings-drawer]'), scrim: read('[data-settings-scrim]') }
  })
}

/** 从 computed transform 里取出平移的 x 分量（px）。没有位移就是 0 */
function translateX(transform: string): number {
  const parts = /matrix\(([^)]+)\)/.exec(transform)
  if (parts === null) return 0
  const values = parts[1].split(',').map((value) => Number(value.trim()))
  return values[4] ?? 0
}

/**
 * 点入口开抽屉，并在若干帧上采下计算样式——**在同一个 evaluate 里**，因为进场只有 250ms，
 * 来回一次 CDP 就错过第一帧了（结果层那条 `watchMotion` 的注释同一条理由）。
 *
 * 采到的东西只为本票要证的两件事：第一帧是不可见的基础态（`both` 的起点填充，没有闪一帧），
 * 以及它自右滑入（x 从正的一整块宽度起、落到 0）。
 */
function sampleArrival(
  page: Page,
  frames: number
): Promise<{ opacity: number; transform: string; animation: string }[]> {
  return page.evaluate((count) => {
    return new Promise<{ opacity: number; transform: string; animation: string }[]>((resolve) => {
      const entryButton = document.querySelector<HTMLElement>('.settings-entry')
      entryButton?.click()
      const sampled: { opacity: number; transform: string; animation: string }[] = []
      const tick = (): void => {
        const panel = document.querySelector<HTMLElement>('[data-settings-drawer]')
        const style = panel === null ? null : getComputedStyle(panel)
        sampled.push({
          opacity: style === null ? -1 : Number(style.opacity),
          transform: style === null ? 'missing' : style.transform,
          animation: style === null ? 'missing' : style.animationName,
        })
        if (sampled.length >= count) resolve(sampled)
        else requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
  }, frames)
}

/** 入口的矩形（取到 0.1px，避免浮点噪声把「同址」比出假的差） */
async function entryBox(page: Page): Promise<{ x: number; y: number; w: number; h: number } | null> {
  return entry(page).evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const round = (value: number): number => Math.round(value * 10) / 10
    return { x: round(rect.x), y: round(rect.y), w: round(rect.width), h: round(rect.height) }
  })
}

/** 元素的计算底色 */
function background(page: Page, selector: string): Promise<string> {
  return page.locator(selector).evaluate((element) => getComputedStyle(element).backgroundColor)
}

/**
 * 读静音开关此刻的三样东西：轨道底色、滑块底色、滑块相对轨道的水平位移（T39）。
 *
 * 两态的比较全由用例来做——helper 只把计算样式与几何原样端出来。位移用真实的
 * `getBoundingClientRect`（而不是读 transform 字符串）算，因为它已经把
 * `translate(1rem, …)` 算进去了，读到的就是「滑块此刻在哪儿」。
 */
function readSwitch(page: Page): Promise<{ trackBg: string; thumbBg: string; thumbOffset: number }> {
  return page.locator('.settings-switch').evaluate((sw) => {
    const thumb = sw.querySelector('.settings-switch__thumb') as HTMLElement
    const trackRect = sw.getBoundingClientRect()
    const thumbRect = thumb.getBoundingClientRect()
    return {
      trackBg: getComputedStyle(sw).backgroundColor,
      thumbBg: getComputedStyle(thumb).backgroundColor,
      thumbOffset: thumbRect.x - trackRect.x,
    }
  })
}

/**
 * 焦点元素那一圈环（与 task-22-a11y 同一把尺子）：Material / Claude 用 outline，
 * Classic 用「页面色垫圈 + 深色描边」的 box-shadow 双环，取最宽的一圈。
 */
async function activeRing(page: Page): Promise<{ width: number; colour: string | null }> {
  return page.evaluate(() => {
    const element = document.activeElement
    if (element === null || element === document.body) return { width: 0, colour: null }
    const style = getComputedStyle(element)
    const outlineWidth = parseFloat(style.outlineWidth)
    if (style.outlineStyle !== 'none' && outlineWidth > 0) {
      return { width: outlineWidth, colour: style.outlineColor }
    }
    const layers = [
      ...style.boxShadow.matchAll(
        /rgba?\([^)]*\)\s+(?:-?\d+(?:\.\d+)?px\s+){3}(\d+(?:\.\d+)?)px/g
      ),
    ].map((layer) => ({
      colour: layer[0].slice(0, layer[0].indexOf(')') + 1),
      spread: Number(layer[1]),
    }))
    if (layers.length === 0) return { width: 0, colour: null }
    const widest = layers.reduce((a, b) => (b.spread > a.spread ? b : a))
    return { width: widest.spread, colour: widest.colour }
  })
}

/** 一直按 Tab，直到焦点落在设置入口上（步数上限从 DOM 数出来，不写死） */
async function tabToEntry(page: Page): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  const limit = (await page.locator(FOCUSABLE).count()) + 2
  for (let step = 0; step <= limit; step += 1) {
    const focused = await entry(page).evaluate((element) => element === document.activeElement)
    if (focused) return
    await page.keyboard.press('Tab')
  }
  throw new Error('按遍了 Tab 也没走到设置入口')
}

/**
 * 按一下某键，回报**应用有没有把它吃掉**（`preventDefault`）。
 *
 * 探针监听器注册在应用的 window 监听**之后**，所以它看到的 `defaultPrevented` 就是应用
 * 上报的那个值（game.spec.ts 的 arrowDownConsumed 同一条路）。注册之后才按键——不等
 * 就是竞态。
 */
async function keyConsumed(page: Page, key: string): Promise<boolean | undefined> {
  await page.evaluate(() => {
    ;(window as typeof window & { __t37Prevented?: boolean }).__t37Prevented = undefined
    window.addEventListener('keydown', (event) => {
      ;(window as typeof window & { __t37Prevented?: boolean }).__t37Prevented =
        event.defaultPrevented
    })
  })
  await page.keyboard.press(key)
  return page.evaluate(
    () => (window as typeof window & { __t37Prevented?: boolean }).__t37Prevented
  )
}

/**
 * 把一个控件中心的那一击交给浏览器点，断言它落在遮罩或抽屉上。
 *
 * 「看得见」不等于「点得到」：这正是抽屉拦人的全部所指（result-layer.md 第 1 条）。
 * 结果层那两条几何用例证明的是同一件事的另一半——那里是遮罩接住棋盘角落。
 */
async function expectPointerBlocked(page: Page, target: Locator, label: string): Promise<void> {
  const box = await target.boundingBox()
  expect(box, `${label} 量不到矩形（它不在布局里）`).not.toBeNull()
  if (box === null) return
  const hit = await page.evaluate(
    ({ x, y }) => {
      const element = document.elementFromPoint(x, y)
      return {
        tag: element === null ? null : element.tagName,
        inLayer:
          element instanceof Element &&
          element.closest('[data-settings-scrim],[data-settings-drawer]') !== null,
      }
    },
    { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  )
  expect(
    hit.inLayer,
    `${label} 那一击没有落在遮罩 / 抽屉上（落到了 <${hit.tag}>）`
  ).toBe(true)
}

/** 打一遍神魔码（棋盘得先拿到焦点，脚本才收得到那八下） */
async function typeCode(page: Page): Promise<void> {
  await page.locator('[data-board]').focus()
  for (const key of CODE_KEYS) await page.keyboard.press(key)
}

/** 派一条合成的 `animationend`，把「B 碎完了」说给机器听（不靠墙钟） */
async function breakB(page: Page): Promise<void> {
  await page.evaluate(() => {
    document
      .querySelector('[data-shenmo-button="b"]')
      ?.dispatchEvent(
        new AnimationEvent('animationend', { bubbles: true, animationName: 'shenmo-break-fade' })
      )
  })
}

/** 走完一遍完整的 B → A（第一遍授予一念、第二遍触发二念的两拍终局） */
async function completePass(page: Page): Promise<void> {
  await typeCode(page)
  await expect(page.locator('.shenmo')).toHaveAttribute('data-shenmo-stage', 'choice')
  await page.getByRole('button', { name: '抉择 B' }).click()
  await breakB(page)
  await expect(page.locator('.shenmo')).toHaveAttribute('data-shenmo-stage', 'ring')
  await page.getByRole('button', { name: '抉择 A' }).click()
  await expect(page.locator('.shenmo')).toHaveCount(0)
}

/** 两遍走完 → 页面被扣下（只剩一颗「重新开始」） */
async function reachPageCleared(page: Page): Promise<void> {
  await completePass(page)
  await completePass(page)
  await expect(page.getByRole('button', { name: '重新开始' })).toBeVisible()
}

for (const style of STYLE_CATALOG) {
  test.describe(`${style.label} · 设置抽屉`, () => {
    test('入口在四种页面状态下同址；开合之后回到原处', async ({ page }) => {
      const problems = watchProblems(page)

      // ① 开局界面：入口就在，开合一次照旧
      await page.goto('/?seed=20260926')
      await pickStyle(page, style.label)
      await expect(page.getByRole('button', { name: '开始游戏' })).toBeVisible()
      const startBox = await entryBox(page)
      await openSettings(page)
      await closeSettings(page)
      await expect(page.getByRole('button', { name: '开始游戏' })).toBeVisible()
      expect(await entryBox(page), `${style.label}：开局界面开合之后入口挪了地`).toEqual(startBox)

      // ② 局中：开关抽屉不许碰这一局
      await startRun(page, style.id, startUrl(ACTIVE))
      const runBox = await entryBox(page)
      const runBoard = await readBoard(page)
      await openSettings(page)
      await closeSettings(page)
      expect(await readBoard(page), `${style.label}：开关抽屉把棋盘动了`).toEqual(runBoard)
      // 正在打的一局还在打：关掉之后同一动照旧推得动
      const beforeMove = await readBoard(page)
      await page.locator('[data-board]').focus()
      await page.keyboard.press('ArrowRight')
      expect(await readBoard(page), `${style.label}：关掉抽屉后棋盘推不动了`).not.toEqual(
        beforeMove
      )
      expect(await entryBox(page), `${style.label}：局中入口与开局界面不同址`).toEqual(startBox)
      expect(await entryBox(page)).toEqual(runBox)

      // ③ 结果层在场：开关抽屉不许把结果层弄丢
      await startRun(page, style.id, startUrl(FOUR_1024))
      await page.locator('[data-board]').focus()
      await page.keyboard.press('ArrowLeft')
      await expect(page.locator('[data-result-tier="won"]')).toBeVisible()
      const winBox = await entryBox(page)
      await openSettings(page)
      await closeSettings(page)
      await expect(page.locator('[data-result-tier="won"]')).toBeVisible()
      expect(await entryBox(page), `${style.label}：结果层在场时入口不同址`).toEqual(startBox)
      expect(winBox).toEqual(startBox)

      // ④ 二念扣下：入口照旧，且悬顶**不在**被 inert 的那一块里（父规格架构决策 6）。
      //
      // **这里不断言礼炮**：它在第一遍走完时授予、粒子一熄就 `onSpent` 卸载自己
      // （`Cannon`：`granted` 只在 false→true 那一下复位 `spent`，二念走完时它早已是
      // true 且不再变化），从第一遍到这一页之间隔着第二遍与 1200ms 两拍终局，
      // 到这儿 `.cannon` 早已不在场——抓它只会抓到一条与本票无关的红。要证的是
      // 「浮层不被 inert」，悬顶是这一类里**稳定在场**的那个，由它来证（Toast 栈与
      // 礼炮同样住在 `.contents` 之外、是它的兄弟，证据在 App.tsx 的结构里）。
      await startRun(page, style.id, `/?seed=20260926&board=${LADDER_FULL_BOARD}`)
      await reachPageCleared(page)
      const clearedBox = await entryBox(page)
      await openSettings(page)
      const structure = await page.evaluate(() => {
        const wrapper = document.querySelector('main > div.contents')
        // 这一页的**页面内容**只剩「重新开始」与入口——棋盘早被二念收走了（那一分支
        // 只渲染一颗按钮），所以不能拿棋盘当「页面内容在 inert 里」的证据
        const buttons = wrapper === null ? [] : [...wrapper.querySelectorAll('button')]
        const hasRestart = buttons.some((button) => (button.textContent ?? '').trim() === '重新开始')
        const strip = document.querySelector('.shenmo-strip')
        return {
          inert: wrapper?.hasAttribute('inert') ?? false,
          hasRestart,
          containsEntry: wrapper !== null && wrapper.contains(document.querySelector('.settings-entry')),
          stripPresent: strip !== null,
          containsStrip: wrapper !== null && strip !== null && wrapper.contains(strip),
        }
      })
      // 页面内容确实被 inert 收走（那一页的按钮与入口都在那一块里）
      expect(structure.inert, `${style.label}：页面那块没有被 inert`).toBe(true)
      expect(structure.hasRestart, `${style.label}：重新开始不在 inert 那一块里`).toBe(true)
      expect(structure.containsEntry).toBe(true)
      // 而悬顶是**浮层**，不在 inert 那一块里（父规格架构决策 6）
      expect(structure.stripPresent, `${style.label}：二念扣下时悬顶应该在`).toBe(true)
      expect(structure.containsStrip, `${style.label}：悬顶被 inert 一起收走了`).toBe(false)
      await closeSettings(page)
      // 被扣下的那一页还是被扣下
      await expect(page.getByRole('button', { name: '重新开始' })).toBeVisible()
      expect(await entryBox(page), `${style.label}：二念扣下时入口不同址`).toEqual(startBox)
      expect(clearedBox).toEqual(startBox)

      expect(problems).toEqual([])
    })

    test('入口是纯图标按钮：名字、3rem 命中区、aria-expanded、只有三个状态', async ({ page }) => {
      const problems = watchProblems(page)
      await page.goto('/?seed=20260926')
      await pickStyle(page, style.label)

      // 纯图标：可访问名是「设置」，自身一个可见字都没有
      await expect(page.getByRole('button', { name: '设置' })).toHaveCount(1)
      await expect(entry(page)).toBeVisible()
      expect((await entry(page).innerText()).trim(), `${style.label}：入口里混进了文字`).toBe('')
      await expect(entry(page)).toHaveAttribute('aria-expanded', 'false')

      // 3rem 命中区（48px），正方形
      const box = await entry(page).boundingBox()
      expect(box?.width, `${style.label}：入口命中区不是 3rem`).toBe(48)
      expect(box?.height, `${style.label}：入口命中区不是 3rem`).toBe(48)

      // 状态一：静止。状态二：悬停——底色真的换了一档
      const rest = await background(page, '.settings-entry')
      await entry(page).hover()
      const hover = await background(page, '.settings-entry')
      expect(hover, `${style.label}：入口没有悬停态`).not.toBe(rest)

      // 状态三：键盘焦点环，看得见
      await page.mouse.move(0, 0)
      await tabToEntry(page)
      const ring = await activeRing(page)
      expect(ring.width, `${style.label}：入口的焦点环看不见`).toBeGreaterThanOrEqual(2)
      expect(ring.colour, `${style.label}：入口的焦点环没有颜色`).not.toBeNull()

      // 刻意没有按下反馈（父规格决策 22）：悬停 + 按住与只悬停同一个底色，也没有位移
      await entry(page).hover()
      const hoverTransform = await entry(page).evaluate((el) => getComputedStyle(el).transform)
      const pressed = await (async () => {
        const rect = await entry(page).boundingBox()
        if (rect === null) throw new Error('入口量不到矩形')
        await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2)
        await page.mouse.down()
        const state = await entry(page).evaluate((element) => ({
          bg: getComputedStyle(element).backgroundColor,
          transform: getComputedStyle(element).transform,
          active: element.matches(':active'),
        }))
        await page.mouse.move(0, 0)
        await page.mouse.up()
        return state
      })()
      expect(pressed.active, '按下没有真的落在入口上').toBe(true)
      expect(pressed.bg, `${style.label}：入口有按下反馈（换了底色）`).toBe(hover)
      expect(pressed.transform, `${style.label}：入口有按下反馈（动了形状）`).toBe(hoverTransform)

      // 「开着」是第三个状态，由 aria-expanded 报出（开着不换底色——那是「选中」的意思）
      await openSettings(page)
      await expect(entry(page)).toHaveAttribute('aria-expanded', 'true')
      await expect(entry(page)).toHaveAttribute('data-settings-open', 'true')
      await closeSettings(page)
      await expect(entry(page)).toHaveAttribute('aria-expanded', 'false')

      expect(problems).toEqual([])
    })

    test('打开：每一条指针路径都落在遮罩上；抽屉是 dialog + 名字、形状贴右铺满', async ({
      page,
    }) => {
      const problems = watchProblems(page)

      // 窄屏铺满整屏（父规格决策 21）：宽 320 → min(22rem, 100vw) = 320，左右都齐边。
      //
      // **在开局界面上量，不在局中量**：本套契约在 mobile 项目里也要跑一遍，而移动端
      // 上棋盘在 320 视口里比视口宽，内容一横向溢出，移动端 Chromium 就把整页缩到「适配」
      // 比例——那时 `window.innerWidth`（视觉视口，约 444）不再等于 `100vw`（布局视口，
      // 320），抽屉 `right: 0; width: min(22rem, 100vw)` 于是钉在放大后的视觉视口右缘、
      // 却只有布局视口那么宽，看着像差了一截。那截差是浏览器为「棋盘溢出」做的缩放，
      // 不是抽屉的尺寸。开局界面没有棋盘、不溢出，两把尺子重合，量的才是抽屉自己的 CSS。
      await page.goto('/?seed=20260926')
      await pickStyle(page, style.label)
      await page.setViewportSize({ width: 320, height: 700 })
      await openSettings(page)
      const narrow = await drawer(page).evaluate((element) => {
        const rect = element.getBoundingClientRect()
        return { x: rect.x, w: rect.width, vw: window.innerWidth }
      })
      expect(narrow.w, `${style.label}：窄屏抽屉没有铺满整屏`).toBe(narrow.vw)
      expect(narrow.x, `${style.label}：窄屏抽屉没有齐左边缘`).toBe(0)
      await closeSettings(page)

      // 撑高视口：页脚那几个入口在默认 720 高之下，撑开它们全在视口里才好量中心
      await page.setViewportSize({ width: 1280, height: 1400 })
      await startRun(page, style.id, startUrl(ACTIVE))

      await openSettings(page)

      // 形状与语义（这一票的验收标准「The drawer's shape」与「Focus and assistive technology」）
      const shape = await drawer(page).evaluate((element) => {
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return {
          position: style.position,
          role: element.getAttribute('role'),
          label: element.getAttribute('aria-label'),
          modal: element.getAttribute('aria-modal'),
          x: rect.x,
          y: rect.y,
          w: rect.width,
          h: rect.height,
          vw: window.innerWidth,
          vh: window.innerHeight,
        }
      })
      expect(shape.position, `${style.label}：抽屉没有脱离布局`).toBe('fixed')
      expect(shape.role, `${style.label}：抽屉不是 dialog`).toBe('dialog')
      expect(shape.label, `${style.label}：抽屉没有名字`).toBe('设置')
      // 不加 aria-modal：背景已经被 inert 说了同一件事，不必说两遍
      expect(shape.modal, `${style.label}：抽屉不该加 aria-modal`).toBeNull()
      expect(shape.x + shape.w, `${style.label}：抽屉没有贴住右边缘`).toBeCloseTo(shape.vw, 0)
      expect(shape.y, `${style.label}：抽屉没有顶上边缘`).toBe(0)
      expect(shape.h, `${style.label}：抽屉没有铺满高度`).toBe(shape.vh)
      expect(shape.w, `${style.label}：抽屉宽度不是 min(22rem, 100vw)`).toBeCloseTo(
        Math.min(22 * 16, shape.vw),
        0
      )

      // 窄屏铺满整屏已在文件开头量过（开局界面）——上面这一套是宽视口下的形状
      await closeSettings(page)

      // 指针路径逐条过：宽视口下点得到棋盘、方向键、新游戏、交换、战绩入口。
      // **「风格按钮」这一条随 T42 摘掉了**：主面板那组风格按钮已经搬进抽屉（行为变化
      // 要求的更新，不是放松断言），局中页面上不再有这一颗可点的目标——风格行的指针
      // 路径由 style-row 那份契约逐条量
      const targets: [Locator, string][] = [
        [page.locator('[data-board]'), '棋盘'],
        [page.getByRole('button', { name: '新游戏' }), '新游戏'],
        [page.getByRole('button', { name: '交换' }), '交换'],
        [page.getByRole('button', { name: '战绩与统计' }), '战绩入口'],
      ]
      const dpad = page.getByRole('group', { name: '方向按钮' }).getByRole('button', { name: '向上' })
      if (await dpad.isVisible()) targets.push([dpad, '方向按钮'])

      await openSettings(page)
      for (const [target, label] of targets) {
        if (!(await target.isVisible())) continue
        await expectPointerBlocked(page, target, `${style.label}：${label}`)
      }
      await closeSettings(page)

      // 结果层的按钮：开着棋盘上的那种盘，抽屉照旧接得住
      await startRun(page, style.id, startUrl(FOUR_1024))
      await page.locator('[data-board]').focus()
      await page.keyboard.press('ArrowLeft')
      await expect(page.locator('[data-result-tier="won"]')).toBeVisible()
      await openSettings(page)
      await expectPointerBlocked(
        page,
        page.locator('[data-panel="win"]').getByRole('button', { name: '继续玩' }),
        `${style.label}：结果层的按钮`
      )
      await closeSettings(page)

      expect(problems).toEqual([])
    })

    test('打开：方向键 / WASD / Z 被吃掉、不滚页面；滚轮照旧；文本入口照旧拿到键', async ({
      page,
    }) => {
      const problems = watchProblems(page)
      // 逼仄的视口：页面一定比它高，于是「滚不滚」是可观测的（game.spec 同款）
      await page.setViewportSize({ width: 1100, height: 420 })
      await startRun(page, style.id, startUrl(ACTIVE))
      await page.evaluate(() => window.scrollTo(0, 0))

      await openSettings(page)
      const board = await readBoard(page)
      const score = await page.locator('[data-score]').textContent()

      // 方向键 / WASD / Z 一律先 preventDefault 再吞掉：不推棋、不撤销、也不滚页面
      for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'z', 'Z']) {
        expect(
          await keyConsumed(page, key),
          `${style.label}：抽屉开着时 ${key} 没有被吃掉`
        ).toBe(true)
      }
      expect(await readBoard(page), `${style.label}：抽屉开着时棋盘被推动了`).toEqual(board)
      await expect(page.locator('[data-score]')).toHaveText(score ?? '')
      expect(await page.evaluate(() => window.scrollY), `${style.label}：方向键把页面滚走了`).toBe(0)
      // 一路吞键之后抽屉照旧开着
      await expect(drawer(page)).toBeVisible()

      // 滚轮照旧能滚（页面只由滚轮滚动那条常驻约定）——指针搁在遮罩上
      await page.mouse.move(4, 200)
      await page.mouse.wheel(0, 400)
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)

      // 文本入口（T39 会往抽屉里放静音行；这里先验守卫本身）照旧拿得到自己的键：
      // 事件目标是输入框时应用整键放行，方向键是「移光标」不是「推棋盘」
      await page.evaluate(() => {
        const panel = document.querySelector('[data-settings-drawer]')
        if (panel === null) throw new Error('抽屉不在 DOM 里')
        const input = document.createElement('input')
        input.type = 'text'
        input.id = 't37-probe-input'
        panel.append(input)
        input.focus()
      })
      expect(
        await keyConsumed(page, 'ArrowLeft'),
        `${style.label}：抽屉里的文本入口没拿回自己的方向键`
      ).toBe(false)

      expect(problems).toEqual([])
    })

    test('打开：Tab 到不了遮罩后面的页面（页面内容 inert）', async ({ page }) => {
      const problems = watchProblems(page)
      await startRun(page, style.id, startUrl(ACTIVE))
      await openSettings(page)

      // 机制：页面内容整块挂着 inert，棋盘与入口都在那一块里
      const structure = await page.evaluate(() => {
        const wrapper = document.querySelector('main > div.contents')
        return {
          inert: wrapper?.getAttribute('inert') !== null,
          containsBoard: wrapper !== null && wrapper.contains(document.querySelector('[data-board]')),
          containsEntry: wrapper !== null && wrapper.contains(document.querySelector('.settings-entry')),
        }
      })
      expect(structure.inert, `${style.label}：抽屉开着时页面那块没被 inert`).toBe(true)
      expect(structure.containsBoard).toBe(true)
      expect(structure.containsEntry).toBe(true)

      // 走查：连按 Tab，焦点一次都不许落在遮罩后面的页面上。
      // 判据用 closest 分类，而不是「停在第几个」——有界地转到为止（T13 / T18 的教训）
      let sawDrawer = false
      for (let step = 0; step < 12; step += 1) {
        await page.keyboard.press('Tab')
        const where = await page.evaluate(() => {
          const element = document.activeElement
          if (element === null || element === document.body) return { kind: 'body' as const, tag: 'body' }
          if (element.closest('[data-settings-drawer]') !== null) {
            return { kind: 'drawer' as const, tag: element.tagName }
          }
          if (element.closest('main > div.contents') !== null) {
            return { kind: 'page' as const, tag: element.tagName }
          }
          return { kind: 'other' as const, tag: element.tagName }
        })
        if (where.kind === 'drawer') sawDrawer = true
        expect(
          where.kind,
          `${style.label}：Tab 之后焦点落到了遮罩后面的 <${where.tag}> 上`
        ).not.toBe('page')
      }
      // 焦点确实在抽屉里转过（不是「哪儿都到不了」那种假绿）
      expect(sawDrawer, `${style.label}：Tab 怎么按都进不了抽屉`).toBe(true)

      // 抽屉照旧开着
      await expect(drawer(page)).toBeVisible()
      expect(problems).toEqual([])
    })

    test('三种关法都通；Esc 优先于底下的交换摊；焦点进出到位', async ({ page }) => {
      const problems = watchProblems(page)
      await startRun(page, style.id, startUrl(ACTIVE))

      // 关法一：点外侧（遮罩）
      await openSettings(page)
      // 焦点落在**容器**上，不是关闭按钮——一次误敲回车会当场关掉（父规格决策 7）
      const focusedOnOpen = await page.evaluate(() => ({
        isPanel: document.activeElement?.hasAttribute('data-settings-drawer') ?? false,
        isCloseButton:
          (document.activeElement?.textContent ?? '').trim() === '收起',
      }))
      expect(focusedOnOpen.isPanel, `${style.label}：打开时焦点没有落在容器上`).toBe(true)
      expect(focusedOnOpen.isCloseButton, `${style.label}：打开时焦点落在了关闭按钮上`).toBe(false)

      await page.mouse.click(4, 300)
      await expect(drawer(page)).toHaveCount(0)
      // 焦点回到入口（判据是「焦点真的掉了」，见 App 里那个 effect）
      await expect(entry(page)).toBeFocused()

      // 关法二：抽屉里的「收起」
      await openSettings(page)
      await closeSettings(page)
      await expect(entry(page)).toBeFocused()

      // 关法三：Esc
      await openSettings(page)
      await page.keyboard.press('Escape')
      await expect(drawer(page)).toHaveCount(0)
      await expect(entry(page)).toBeFocused()

      // Esc 优先于底下的交换摊：抽屉开着时先关抽屉，摊照旧开着；再按一次才收摊
      await page.getByRole('button', { name: '交换' }).click()
      await expect(page.locator('.board__tile[data-selectable="true"]')).not.toHaveCount(0)
      await openSettings(page)
      await page.keyboard.press('Escape')
      await expect(drawer(page)).toHaveCount(0)
      await expect(
        page.locator('.board__tile[data-selectable="true"]'),
        `${style.label}：关抽屉那一下把底下的交换摊也收了`
      ).not.toHaveCount(0)
      await page.keyboard.press('Escape')
      await expect(page.locator('.board__tile[data-selectable="true"]')).toHaveCount(0)

      expect(problems).toEqual([])
    })

    test('进出都播：进 250ms / 出 200ms + 抽屉曲线；退场动画一结束层就卸载', async ({ page }) => {
      const problems = watchProblems(page)
      await startRun(page, style.id, startUrl(ACTIVE))

      // 进场：点入口那一帧起采样。22 帧（约 360ms）盖过 250ms 的进场——比它短就看不到终态。
      // 第一帧必须是**关键帧的起点**（`both` 的起点填充），不是一帧可见的基础态——T21 在
      // 胜利标题上踩过那个坑（加 rAF 状态门控，可见的底色会先画一帧再闪隐）
      const arrival = await sampleArrival(page, 22)
      expect(arrival[0]?.animation, `${style.label}：抽屉没有播进场动画`).toBe('settings-drawer-in')
      expect(arrival[0]?.opacity, `${style.label}：进场第一帧就可见了（先闪一帧基础态）`).toBeLessThan(1)
      // 自右滑入：第一帧在整块宽度之外（x 为正），终态落回 0
      expect(translateX(arrival[0]?.transform ?? ''), `${style.label}：进场不是自右滑入`).toBeGreaterThan(0)
      expect(translateX(arrival.at(-1)?.transform ?? 'missing'), `${style.label}：进场没落到 x=0`).toBe(0)
      expect(arrival.at(-1)?.opacity, `${style.label}：进场没淡到不透明`).toBe(1)

      // 时长与曲线是抽屉自取的那一套，三套风格一个数（它们住在外壳，不该跟着风格变）
      const timing = await motionTiming(page)
      expect(timing.drawer, `${style.label}：抽屉的进场节奏不是 250ms + 抽屉曲线`).toEqual({
        name: 'settings-drawer-in',
        duration: '0.25s',
        easing: 'cubic-bezier(0.32, 0.72, 0, 1)',
      })
      expect(timing.scrim, `${style.label}：遮罩的进场节奏不是 250ms + 抽屉曲线`).toEqual({
        name: 'settings-fade-in',
        duration: '0.25s',
        easing: 'cubic-bezier(0.32, 0.72, 0, 1)',
      })

      // 退场：点「收起」与读 DOM 在同一个 evaluate 里（退场只有 200ms）。它比进场短一截、
      // 换的是退场那一组关键帧
      const exit = await page.evaluate(
        () =>
          new Promise<{ name: string; duration: string; easing: string }>((resolve) => {
            const closeButton = [
              ...document.querySelectorAll<HTMLElement>('[data-settings-drawer] .control'),
            ].find((element) => element.textContent?.trim() === '收起')
            closeButton?.click()
            requestAnimationFrame(() => {
              const style = getComputedStyle(
                document.querySelector('[data-settings-drawer]') as Element
              )
              resolve({
                name: style.animationName,
                duration: style.animationDuration,
                easing: style.animationTimingFunction,
              })
            })
          })
      )
      expect(exit, `${style.label}：抽屉的退场节奏不是 200ms + 抽屉曲线`).toEqual({
        name: 'settings-drawer-out',
        duration: '0.2s',
        easing: 'cubic-bezier(0.32, 0.72, 0, 1)',
      })
      // 退场播完层才卸载（动画结束事件驱动，不是 CSS 把 opacity 摁在 0 上藏着）
      await expect(drawer(page)).toHaveCount(0)

      expect(problems).toEqual([])
    })

    test('退场第一帧就交出指针：data-settings-leaving 与开合同一次提交', async ({ page }) => {
      const problems = watchProblems(page)
      await startRun(page, style.id, startUrl(ACTIVE))
      await openSettings(page)

      // 点遮罩（=「外侧」）那一帧与读 DOM 在同一个 evaluate：开合状态变的同一次提交里，
      // 遮罩与抽屉都必须已标着退场、且不再接指针（父规格决策 10）
      const frame = await page.evaluate(
        () =>
          new Promise<{
            mounted: boolean
            leaving: string | null
            scrimLeaving: string | null
            pointerEvents: string
            hitIsLayer: boolean
          }>((resolve) => {
            // 点遮罩上一点（棋盘那一带的坐标）：这一下就是「关掉」，与「点外侧」同一条路
            const scrim = document.querySelector<HTMLElement>('[data-settings-scrim]')
            scrim?.click()
            requestAnimationFrame(() => {
              const panel = document.querySelector<HTMLElement>('[data-settings-drawer]')
              const scrimNow = document.querySelector<HTMLElement>('[data-settings-scrim]')
              const hit =
                scrimNow === null
                  ? null
                  : document.elementFromPoint(
                      scrimNow.getBoundingClientRect().width / 2,
                      window.innerHeight / 2
                    )
              resolve({
                mounted: panel !== null,
                leaving: panel?.getAttribute('data-settings-leaving') ?? null,
                scrimLeaving: scrimNow?.getAttribute('data-settings-leaving') ?? null,
                pointerEvents: panel === null ? '' : getComputedStyle(panel).pointerEvents,
                hitIsLayer:
                  hit instanceof Element &&
                  hit.closest('[data-settings-scrim],[data-settings-drawer]') !== null,
              })
            })
          })
      )

      // 容器还在 DOM 里（退场要播 200ms），并且**标着退场**——遮罩与抽屉各挂一个
      expect(frame.mounted, `${style.label}：退场第一帧容器就不在了`).toBe(true)
      expect(frame.leaving, `${style.label}：退场第一帧抽屉没标 leaving`).toBe('true')
      expect(frame.scrimLeaving, `${style.label}：退场第一帧遮罩没标 leaving`).toBe('true')
      // 而它已经不接指针了：这一条是「关掉之后马上点新游戏」不被吞掉的保证
      expect(frame.pointerEvents, `${style.label}：退场中的抽屉还在接指针`).toBe('none')
      // 同一件事的第二种说法：视口正中那一点最上面已经不是这一层了
      expect(frame.hitIsLayer, `${style.label}：退场中的遮罩还挡在页面上`).toBe(false)

      // 退场播完，层不在 DOM 里
      await expect(drawer(page)).toHaveCount(0)

      expect(problems).toEqual([])
    })

    test('假时钟下关掉抽屉照旧卸载：退场的终点是 animationend，不是定时器', async ({ page }) => {
      const problems = watchProblems(page)
      // `install` 只装假定时器（并允许 `resume()` 让时间按真实速度流），**不冻时间**；要冻住
      // 必须紧跟着 `pauseAt`。所以这里两步都做：装上之后立刻停表，藏在 JS 里的 setTimeout
      // 才真的冻住——若退场靠定时器，这里就永远摘不掉那一层。动画结束事件来自渲染管线，
      // 假时钟够不着它（结果层与菜单各付过一遍学费）。先例见 time-attack.spec.ts 第 7–11 行
      // 的说明与第 95–96 行的 `install` + `pauseAt`。
      await page.clock.install()
      await page.clock.pauseAt(Date.now())
      await startRun(page, style.id, startUrl(ACTIVE))

      // 不用 openSettings / closeSettings：那两个共享助手里有一段 waitForFunction 轮询，
      // 而假时钟下不该拿它去赌。直接点、直接等卸载
      await entry(page).click()
      await expect(drawer(page)).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(drawer(page), `${style.label}：假时钟下抽屉没被卸载掉`).toHaveCount(0)
      // 页面照旧回到原处（这一局还能推）
      await page.locator('[data-board]').focus()
      const before = await readBoard(page)
      await page.keyboard.press('ArrowRight')
      expect(await readBoard(page), `${style.label}：假时钟下关掉抽屉后棋盘推不动了`).not.toEqual(before)

      expect(problems).toEqual([])
    })

    test('reduced-motion：撤掉位移、只留淡入淡出，两个时长不变', async ({ browser }) => {
      // 用户故事 17：要求「少一点动」的玩家仍然看得见抽屉、仍然关得掉。所以同时断言
      // 「位移没了」与「两个时长不变」两件事
      const context = await browser.newContext({ reducedMotion: 'reduce' })
      const page = await context.newPage()
      const problems = watchProblems(page)
      try {
        await startRun(page, style.id, startUrl(ACTIVE))

        // 进场：只淡入、不位移，且仍是 250ms
        const arrival = await sampleArrival(page, 8)
        expect(arrival[0]?.animation, `${style.label}：reduced-motion 下抽屉没换成淡入`).toBe(
          'settings-fade-in'
        )
        for (const frame of arrival) {
          expect(frame.transform, `${style.label}：reduced-motion 下抽屉仍在位移`).toBe('none')
        }
        const entryTiming = await motionTiming(page)
        expect(entryTiming.drawer, `${style.label}：reduced-motion 下进场时长变了`).toEqual({
          name: 'settings-fade-in',
          duration: '0.25s',
          easing: 'cubic-bezier(0.32, 0.72, 0, 1)',
        })

        // 开关滑块的位移过渡也撤（与抽屉同一条降级路子）：transition-property 里没有
        // transform（位置瞬时就位），换色的淡变保留。在退场之前读——抽屉还在、是落定态
        const thumbTransition = await page.evaluate(() =>
          getComputedStyle(
            document.querySelector('.settings-switch__thumb') as Element
          ).transitionProperty
        )
        expect(
          thumbTransition,
          `${style.label}：reduced-motion 下滑块的位移过渡没撤`
        ).not.toContain('transform')
        expect(
          thumbTransition,
          `${style.label}：reduced-motion 下滑块换色的淡变也没了`
        ).toContain('background-color')

        // 退场：同样只淡出、不位移，且仍是 200ms
        const exit = await page.evaluate(
          () =>
            new Promise<{ name: string; duration: string; transform: string }>((resolve) => {
              const closeButton = [
                ...document.querySelectorAll<HTMLElement>('[data-settings-drawer] .control'),
              ].find((element) => element.textContent?.trim() === '收起')
              closeButton?.click()
              requestAnimationFrame(() => {
                const style = getComputedStyle(
                  document.querySelector('[data-settings-drawer]') as Element
                )
                resolve({
                  name: style.animationName,
                  duration: style.animationDuration,
                  transform: style.transform,
                })
              })
            })
        )
        expect(exit, `${style.label}：reduced-motion 下退场不是 200ms 的淡出`).toEqual({
          name: 'settings-fade-out',
          duration: '0.2s',
          transform: 'none',
        })
        // 层照旧消失
        await expect(drawer(page)).toHaveCount(0)

        expect(problems).toEqual([])
      } finally {
        await context.close()
      }
    })

    test('静音行：左静态标签 + 右开关；整行可点；两态靠位置与换色说；data-mute 语义未变', async ({
      page,
    }) => {
      const problems = watchProblems(page)
      await page.goto('/?seed=20260926')
      await pickStyle(page, style.label)
      await openSettings(page)

      const row = page.locator('.settings-row')
      const label = row.locator('.settings-row__label')
      const sw = row.locator('.settings-switch')

      // ① 行是「左标签 + 右开关」：标签是**静态可见文字**，可访问名由 aria-labelledby
      //    引用它这一份——不是另写一份 aria-label，也不是 <label>
      await expect(label).toHaveText('音效')
      await expect(label).toHaveAttribute('id', 'settings-sound-label')
      await expect(sw).toHaveAttribute('role', 'switch')
      await expect(sw).toHaveAttribute('aria-labelledby', 'settings-sound-label')
      await expect(sw).toHaveAccessibleName('音效')
      expect(
        await row.locator('label').count(),
        `${style.label}：静音行里混进了 <label>（它会把点击悄悄转发进控件）`
      ).toBe(0)

      // ② 开关自己一个可见字都没有（**没有可见状态文字**），行里也没有「已开 / 已关」这类字
      expect((await sw.innerText()).trim(), `${style.label}：开关里混进了可见文字`).toBe('')
      await expect(row).not.toContainText('已开')
      await expect(row).not.toContainText('已关')

      // 默认未静音 → 开关是「开」（状态归 aria-checked，名字不随它变）
      await expect(sw).toHaveAttribute('data-mute', 'false')
      await expect(sw).toHaveAttribute('aria-checked', 'true')

      // ③ 几何：轨道 2.25rem × 1.25rem、滑块 1rem、行内间距 0.75rem——三套共用一套骨架
      const geometry = await row.evaluate((element) => {
        const track = (
          element.querySelector('.settings-switch') as HTMLElement
        ).getBoundingClientRect()
        const thumb = (
          element.querySelector('.settings-switch__thumb') as HTMLElement
        ).getBoundingClientRect()
        return {
          trackW: track.width,
          trackH: track.height,
          thumbW: thumb.width,
          thumbH: thumb.height,
          gap: getComputedStyle(element).columnGap,
        }
      })
      expect(geometry.trackW, `${style.label}：轨道宽不是 2.25rem`).toBe(36)
      expect(geometry.trackH, `${style.label}：轨道高不是 1.25rem`).toBe(20)
      expect(geometry.thumbW, `${style.label}：滑块不是 1rem`).toBe(16)
      expect(geometry.thumbH, `${style.label}：滑块不是 1rem`).toBe(16)
      expect(geometry.gap, `${style.label}：行内间距不是 0.75rem`).toBe('12px')

      // 「开」态这一刻的两个判据（滑块靠右、轨道是开态色）
      const on = await readSwitch(page)

      // ④ 整行可点：点**标签**（不是开关本身）也该翻一次——规格明写的、可测的意图
      await label.click()
      await expect(sw).toHaveAttribute('aria-checked', 'false')
      await expect(sw).toHaveAttribute('data-mute', 'true')
      await expect(sw, `${style.label}：可访问名随状态变了`).toHaveAccessibleName('音效')
      // 状态过渡（150ms）播完再读计算样式：transition 是补间，读到半路就是半路的色、
      // 半路的位移（过渡本身是 2026-10-09 人眼复核 BLOCK 之后才有的）
      await page.waitForTimeout(250)
      const off = await readSwitch(page)

      // ⑤ 两态靠**滑块位置 + 轨道换色**说：行程正好 1rem（16px），轨道底色两态不同
      expect(
        Math.round(on.thumbOffset - off.thumbOffset),
        `${style.label}：滑块行程不是 1rem`
      ).toBe(16)
      expect(off.trackBg, `${style.label}：两态轨道没有换色`).not.toBe(on.trackBg)

      // ⑥ 滑块换色规则：本套若给滑块单独声明了开态角色色（--switch-thumb-on），两态就换色；
      //    没声明（Classic 复用 --ink-bright，一个色在两条轨道上都过线）就该恒定。判据取自
      //    计算样式里的令牌本身，不是「Classic 会怎样」的硬编码分叉
      const thumbOnToken = await row.evaluate((element) =>
        getComputedStyle(element).getPropertyValue('--switch-thumb-on').trim()
      )
      if (thumbOnToken === '') {
        expect(off.thumbBg, `${style.label}：没声明滑块开态色，滑块却换色了`).toBe(on.thumbBg)
      } else {
        expect(off.thumbBg, `${style.label}：声明了滑块开态色，滑块却没换色`).not.toBe(on.thumbBg)
      }

      // ⑥.5 人眼复核（2026-10-09 BLOCK）补上的三项守卫：轨道是胶囊形（与圆形滑块切合）、
      //      两态切换有 150ms 过渡（不瞬跳）、关态的轨道仍读得出是一根轨道——**三套都带
      //      一圈发丝线**（Classic 的关态底色与抽屉面同一个值，没有线它整块隐入；Material
      //      与抽屉面近撞；Claude 的控件本就不填色）。此刻开关正处于关态（④点过）。
      const switchSkin = await row.evaluate((element) => {
        const track = element.querySelector('.settings-switch') as HTMLElement
        const thumb = element.querySelector('.settings-switch__thumb') as HTMLElement
        const trackCS = getComputedStyle(track)
        const thumbCS = getComputedStyle(thumb)
        const drawerCS = getComputedStyle(track.closest('[data-settings-drawer]') as HTMLElement)
        return {
          radius: trackCS.borderRadius,
          trackTransition: trackCS.transitionProperty,
          thumbTransition: thumbCS.transitionProperty,
          thumbDuration: thumbCS.transitionDuration,
          trackBg: trackCS.backgroundColor,
          drawerBg: drawerCS.backgroundColor,
          trackOutline: `${trackCS.outlineStyle} ${trackCS.outlineWidth}`,
        }
      })
      expect(switchSkin.radius, `${style.label}：轨道不是胶囊形（圆滑块切不合直角轨道）`).toBe(
        '999px'
      )
      expect(switchSkin.thumbTransition, `${style.label}：滑块位移没有过渡`).toContain('transform')
      expect(switchSkin.thumbTransition, `${style.label}：滑块换色没有过渡`).toContain(
        'background-color'
      )
      expect(switchSkin.thumbDuration, `${style.label}：滑块过渡不是 150ms`).toContain('0.15s')
      expect(switchSkin.trackTransition, `${style.label}：轨道换色没有过渡`).toContain(
        'background-color'
      )
      expect(
        switchSkin.trackOutline !== 'none 0px',
        `${style.label}：关态轨道没有发丝线——三套的关态轨道都靠它读出来（Classic 的关态底色甚至与抽屉面同一个值）`
      ).toBe(true)

      // ⑦ 再点回来（这回点**开关自己**：点它冒泡到行处理器，也只翻一次，不是两遍）
      await sw.click()
      await expect(sw).toHaveAttribute('aria-checked', 'true')
      await expect(sw).toHaveAttribute('data-mute', 'false')

      expect(problems).toEqual([])
    })

    test('Esc 优先于底下的神魔摊：抽屉开着时先关抽屉，两颗圆钮照旧开着', async ({ page }) => {
      const problems = watchProblems(page)
      // 与上面「Esc 优先于交换摊」同一条规矩的另一半：`Esc` 关的是**最上面那一层**。
      // 神魔摊是打码之后冒出来的两颗圆钮（抉择 A / B），App 的 Esc 分支里两个条件是并列的
      // 「或」——两摊同时开着的概率为零，但两处都要各有一条断言，免得将来谁只删了其中一条
      // 分支还自认绿。用满盘开局：那八下全是无效移动，棋盘一个格子都不动、码才攒得住。
      await startRun(page, style.id, `/?seed=20260926&board=${LADDER_FULL_BOARD}`)
      await typeCode(page)
      await expect(page.locator('.shenmo')).toHaveAttribute('data-shenmo-stage', 'choice')

      await openSettings(page)
      await page.keyboard.press('Escape')
      await expect(drawer(page)).toHaveCount(0)
      await expect(
        page.locator('.shenmo'),
        `${style.label}：关抽屉那一下把底下的神魔摊也收了`
      ).toHaveCount(1)
      // 第二次 `Esc` 才收摊（它此刻就是剩下的那一层）
      await page.keyboard.press('Escape')
      await expect(page.locator('.shenmo')).toHaveCount(0)

      expect(problems).toEqual([])
    })

    test('浮层不被 inert 收走：开着抽屉时 Toast 栈仍在页面内容之外', async ({ page }) => {
      const problems = watchProblems(page)
      // 挑一副「一步恰好一次合并」的开局：那一步解锁「首次合并」（注册表第一位），一条祝贺
      // **确定性地**浮出来——成就只看本局，所以这不是抽奖。用它证父规格架构决策 6 的那半句话：
      // 开着抽屉时被 `inert` 的是**页面内容**，不是盖在页面上的浮层。若哪天有人把 Toast 挪进
      // 那个包裹元素，它会连指针、焦点、读屏一起被收走——而「悬停时暂停计时」正是靠它接得住指针。
      await startRun(page, style.id, startUrl(ONE_PAIR))
      await page.locator('[data-board]').focus()
      await page.keyboard.press('ArrowLeft')
      await expect(page.locator('[data-toast-stack]')).toHaveCount(1)

      await openSettings(page)
      const where = await page.evaluate(() => {
        const wrapper = document.querySelector('main > div.contents')
        const stack = document.querySelector('[data-toast-stack]')
        return {
          inert: wrapper?.hasAttribute('inert') ?? false,
          stackPresent: stack !== null,
          containsStack: wrapper !== null && stack !== null && wrapper.contains(stack),
        }
      })
      // 页面内容确实被 inert 收走（判据：抽屉开着）
      expect(where.inert, `${style.label}：开着抽屉时页面那块没被 inert`).toBe(true)
      // 而 Toast 栈是浮层，住在那个包裹元素之外，不被一起收走（架构决策 6）
      expect(where.stackPresent, `${style.label}：开着抽屉时 Toast 栈不见了`).toBe(true)
      expect(where.containsStack, `${style.label}：Toast 栈被 inert 一起收走了`).toBe(false)
      await closeSettings(page)

      expect(problems).toEqual([])
    })

    test('浮层不被 inert 收走：开着抽屉时礼炮那一层仍在页面内容之外', async ({ browser }) => {
      // **为什么借 reduced-motion**：礼炮正常形态是满屏 fixed 的粒子 canvas，粒子 1.1–2.1 秒
      // 熄完就 `onSpent` 卸载自己——按墙钟去抢它是竞态（本地快就过、CI 慢就红）。reduced-motion
      // 下它退化成一行动静全无的字 `.cannon__still`，而那一行在**整局里都在场**（reduced 分支
      // 不画 canvas，也就没有 `onSpent` 来置 `spent`），于是这条结构判据有一个稳定的证物。
      // 两种形态由同一个 `<Cannon>` 渲染、都是 `main` 的直接子节点（`.contents` 的兄弟），
      // DOM 归属逐字相同——所以由静止那一行证得的结论，对粒子那一层同样成立。
      const context = await browser.newContext({ reducedMotion: 'reduce' })
      const page = await context.newPage()
      const problems = watchProblems(page)
      try {
        await startRun(page, style.id, `/?seed=20260926&board=${LADDER_FULL_BOARD}`)
        // 走完一遍 B → A：第一遍结出 first-pass，礼炮那一层到场（`wishGranted` 为真）
        await completePass(page)
        await expect(page.locator('.cannon__still')).toHaveCount(1)

        await openSettings(page)
        const where = await page.evaluate(() => {
          const wrapper = document.querySelector('main > div.contents')
          const cannon = document.querySelector('.cannon__still')
          return {
            inert: wrapper?.hasAttribute('inert') ?? false,
            cannonPresent: cannon !== null,
            containsCannon: wrapper !== null && cannon !== null && wrapper.contains(cannon),
          }
        })
        expect(where.inert, `${style.label}：开着抽屉时页面那块没被 inert`).toBe(true)
        expect(where.cannonPresent, `${style.label}：开着抽屉时礼炮那一层不见了`).toBe(true)
        expect(where.containsCannon, `${style.label}：礼炮那一层被 inert 一起收走了`).toBe(false)
        await closeSettings(page)

        expect(problems).toEqual([])
      } finally {
        await context.close()
      }
    })
  })
}

/**
 * 读档中（`restoring`）入口与抽屉都不在——这一条与风格无关，只跑一遍。
 *
 * 怎么把那一帧冻住：初始化的 `hydrate()` 打开 IndexedDB，把那一步换成一只**永不落地**的
 * 请求（挂上的 `onsuccess` / `onerror` 一辈子不响），于是 `restoring` 恒为 true。这是唯一
 * 能稳定站进那个窗口的办法——真跑的话那几毫秒一闪而过，按墙钟去抢是竞态。
 */
test('读档中入口与抽屉都不在', async ({ page }) => {
  const problems = watchProblems(page)
  await page.addInitScript(() => {
    const never = (): unknown => ({
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
      result: null,
      error: null,
    })
    Object.defineProperty(indexedDB, 'open', { value: never, configurable: true })
  })

  await page.goto('/?seed=20260926')
  // 正在恢复那句话在，说明确实卡在读档窗口里
  await expect(page.getByText('正在恢复上次的一局…')).toBeVisible()
  await expect(entry(page)).toHaveCount(0)
  await expect(drawer(page)).toHaveCount(0)

  expect(problems).toEqual([])
})

/**
 * 入口的图形是一份**三套共用**的内联 SVG、颜色走 `currentColor`。与风格无关，只跑一遍。
 *
 * 「共用一份」怎么证：三套各自渲染出来的 `path` 的 `d` **逐字相同**。三份拷贝一旦有人
 * 单独改一笔，这里就红——这正是 ADR-0002 要的「一份实现」的可测版本。真要证「同一个源
 * 文件」得看仓库结构（`SettingsDrawer.tsx` 里只有一份 GEAR_PATH），e2e 够不着源码。
 */
test('三套风格共用同一份齿轮：path 逐字相同、颜色走 currentColor', async ({ page }) => {
  const problems = watchProblems(page)
  const gears: { label: string; d: string }[] = []

  for (const style of STYLE_CATALOG) {
    await page.goto('/?seed=20260926')
    await pickStyle(page, style.label)
    const svg = entry(page).locator('svg.settings-entry__icon')
    await expect(svg).toHaveCount(1)
    await expect(svg.locator('path')).toHaveCount(1)

    const read = await svg.evaluate((element) => {
      const path = element.querySelector('path')
      if (path === null) return null
      return {
        d: path.getAttribute('d') ?? '',
        fillAttr: element.getAttribute('fill'),
        // currentColor 落到最后：图形的填充色就是按钮自己的文字色
        fillComputed: getComputedStyle(path).fill,
        buttonColour: getComputedStyle(element.parentElement as Element).color,
        ariaHidden: element.getAttribute('aria-hidden'),
      }
    })
    expect(read, `${style.label}：找不到齿轮那条 path`).not.toBeNull()
    if (read === null) continue
    expect(read.d.length, `${style.label}：齿轮 path 是空的`).toBeGreaterThan(20)
    expect(read.fillAttr, `${style.label}：齿轮没有走 currentColor`).toBe('currentColor')
    expect(read.fillComputed, `${style.label}：currentColor 没有解析成按钮的文字色`).toBe(
      read.buttonColour
    )
    // 装饰图形不进无障碍树：名字已经由按钮的 aria-label 说全了
    expect(read.ariaHidden, `${style.label}：齿轮图没有对读屏软件隐藏`).toBe('true')
    gears.push({ label: style.label, d: read.d })
  }

  const distinct = new Set(gears.map((gear) => gear.d))
  expect(
    distinct.size,
    `${gears.map((gear) => gear.label).join(' / ')} 的齿轮 path 不是同一份`
  ).toBe(1)

  expect(problems).toEqual([])
})

/**
 * T38：抽屉自取一套值，**共享的 150ms 一个字节都没被带走**。这一条是「作用域没有漏」的
 * 检查，不是修辞（父规格决策 10 / 11）。
 *
 * 结果层的卡片与彩蛋菜单仍是 150ms + 内置 ease-out（它们的验收按那一套做的、已经关闭，
 * 而「一整屏的行程」那条理由对 4px 的升降根本不成立）。把这两处与抽屉那一套**分开来看**，
 * 才读得出「仓库里是两个值、不是一个被改过的值」。与风格无关，只跑一遍。
 */
test('抽屉自取一套值：结果层与彩蛋菜单的 150ms 一个字节没动', async ({ page }) => {
  const problems = watchProblems(page)

  // 结果层的卡片与遮罩：仍是共享的那一套
  await startRun(page, STYLE_CATALOG[0].id, startUrl(FOUR_1024))
  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('[data-result-tier="won"]')).toBeVisible()
  const overlay = await page.evaluate(() => {
    const read = (selector: string): { duration: string; easing: string } => {
      const style = getComputedStyle(document.querySelector(selector) as Element)
      return { duration: style.animationDuration, easing: style.animationTimingFunction }
    }
    return { card: read('.overlay__card'), scrim: read('.overlay__scrim') }
  })
  expect(overlay.card, '结果层的 150ms 被抽屉那一套带走了').toEqual({
    duration: '0.15s',
    easing: 'ease-out',
  })
  expect(overlay.scrim, '结果层的 150ms 被抽屉那一套带走了').toEqual({
    duration: '0.15s',
    easing: 'ease-out',
  })

  // 彩蛋菜单：也是共享的那一套（不得跟着抽屉漂）
  await startRun(page, STYLE_CATALOG[0].id, `/?seed=20260926&board=${LADDER_FULL_BOARD}`)
  await page.locator('[data-board]').focus()
  for (const key of CODE_KEYS) await page.keyboard.press(key)
  await expect(page.locator('.shenmo')).toHaveAttribute('data-shenmo-stage', 'choice')
  const menu = await page.locator('.shenmo').evaluate((element) => {
    const style = getComputedStyle(element)
    return { duration: style.animationDuration, easing: style.animationTimingFunction }
  })
  expect(menu, '彩蛋菜单的 150ms 被抽屉那一套带走了').toEqual({
    duration: '0.15s',
    easing: 'ease-out',
  })

  expect(problems).toEqual([])
})
