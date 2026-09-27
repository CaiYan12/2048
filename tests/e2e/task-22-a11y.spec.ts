import { expect, test, type Page } from '@playwright/test'

/**
 * T22 的 UI 半边：键盘、触屏与屏幕阅读器验收（SPEC §3.4）
 *
 * **本文件由 T22 编写、不由 T22 执行**：本次会话被明确要求不启动 Playwright、不开任何
 * 浏览器，也不用任何驱动真实浏览器的 MCP / Puppeteer。期望值来自同一套规则内核的离线
 * 推演 + 对 DOM 契约的逐条核对，跑不跑由控制人的统一 sweep 决定。
 *
 * 边界先说清楚，免得读的人以为这里证了更多东西：
 *
 *   · **能证的（structural / behavioural）**：焦点顺序、每一个停靠点上有没有一圈
 *     看得见的环（读**计算样式**，不是只看 activeElement）、环压在自己那层背景上的
 *     对比度、role / aria-label / aria-pressed / aria-expanded、live region 的存在
 *     与内容、reduced-motion 下整套键盘路径还走得通、状态一个字节都没少。
 *   · **证不了的**：屏幕阅读器真的会念出来。这里没有任何合成语音，没有 NVDA /
 *     VoiceOver，所以「role=status 会让它被念出来」是一条**结构断言**——
 *     机制在位、内容正确，而「某一台读屏软件在某一个浏览器上确实开了口」
 *     需要真人会话，见 task-22-report.md 的清单。
 *
 * 局面确定性来自 `?seed=` 与 `?board=` 这两条调试缝（T08 定下的规矩：两个都给，
 * 只给 board 的话「移动之后的生成」会飘）。开局夹具按行优先编号，所以开局时
 * `data-tile-id` 就是 1、2、3…，可以逐枚写死。
 *
 * **Tab 步数一律从 DOM 推导，一个都不写死**（T13 与 T18 在这上面都摔过）：外壳在
 * T15 之后多了一组风格按钮，T10 又给触摸设备加了四个方向钮。写死步数的走查会在
 * 下一次加控件时静默走到别的地方去，而红色指向的原因与「键盘到不到得了」毫无关系。
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
 * 一步即死局：第 0 行右端留一个空格，右移把它整体推过去。
 * 空出来的是 (0,0)，生成那一格后 16 格全满且横纵相邻都不相等——四方向皆无合法移动。
 * (0,0) 的邻居全是 8，所以生成 2 还是 4 都死局：这条路径不依赖随机进度。
 * 与 run-endings.spec.ts / undo.spec.ts / swap.spec.ts 的 ONE_STEP_FROM_DEADLOCK 同一个局面，
 * 换 (0,0)↔(0,1) 之后仍然有那个空格、仍是活跃局。
 */
const ONE_STEP_FROM_DEADLOCK: (number | null)[][] = [
  [8, 2, 4, null],
  [8, 2, 4, 8],
  [2, 4, 8, 2],
  [4, 8, 2, 4],
]

/**
 * 留了一个空格的活跃局（swap.spec.ts 的 ACTIVE）：第 0 行 2 4 8 16、第 1 行 4 8 16 2、
 * 第 2 行 8 16 2 4、第 3 行 16 2 4 空。(3,3) 空着所以四个方向都推得动——拾取态下
 * 按方向键那条用例要的就是「推得动」。
 */
const ACTIVE: (number | null)[][] = [
  [2, 4, 8, 16],
  [4, 8, 16, 2],
  [8, 16, 2, 4],
  [16, 2, 4, null],
]

/** 一次合并的开局：第 0 行 2 2，其余空。向左一按合出一个 4、得 4 分 */
const MERGE: (number | null)[][] = [
  [2, 2, null, null],
  [null, null, null, null],
  [null, null, null, null],
  [null, null, null, null],
]

/** 四个 1024：一次左移合出两个 2048，正好是第一次达标 */
const FOUR_1024: (number | null)[][] = [
  [1024, 1024, 1024, 1024],
  [null, null, null, null],
  [null, null, null, null],
  [null, null, null, null],
]

/** 收集 console / page 错误：这条路径上新挂的属性与 CSS 若有 React 警告要当场看见 */
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

/** 开局：点「开始游戏」，等棋盘就位（键盘用例改用 tabUntil 走这条路，不用点） */
async function startWithClick(page: Page, url: string): Promise<void> {
  await page.goto(url)
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()
}

/**
 * 页面上所有可能成为 Tab 停靠点的元素（原生可聚焦 + 正的 tabindex）。
 * 与 contrast-computed.spec.ts 同一份口径——两边都从它推导走查，不各写一套。
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** 此刻焦点所在的那一个停靠点，压缩成几个可比较的字段 */
interface Stop {
  tag: string
  /** aria-label 优先，没有就用可见文字——读屏软件报的就是这个 */
  name: string
  /** 数值方块的身份（棋盘里的那几枚）；其余停靠点是空串 */
  tile: string
  /** 棋盘根本身 */
  board: boolean
}

/** 读 document.activeElement。body = 焦点掉地上了（这一条本身就是一种失败） */
async function readActive(page: Page): Promise<Stop> {
  return page.evaluate(() => {
    const element = document.activeElement
    if (element === null || element === document.body) {
      return { tag: 'body', name: '', tile: '', board: false }
    }
    return {
      tag: element.tagName.toLowerCase(),
      name: (element.getAttribute('aria-label') ?? element.textContent ?? '').trim(),
      tile: element.getAttribute('data-tile-id') ?? '',
      board: element.hasAttribute('data-board'),
    }
  })
}

/**
 * 一直按 Tab（或 Shift+Tab），直到焦点落在 match 描述的那个停靠点上。
 *
 * 步数上限 = 页面上停靠点的总数（外加两步余量给「从最后一个绕回第一个」那一下）：
 * 上限本身从 DOM 数出来，所以外壳长出控件时这里自动变长。写死步数的版本在某次
 * 加控件之后会静默走到别的地方——T13 与 T18 已经各摔过一次。
 *
 * 走不到就抛错并把最后停在哪儿说出来：这是一条走查，不是一条宽容的等待。
 */
async function tabUntil(
  page: Page,
  match: (stop: Stop) => boolean,
  shift = false
): Promise<void> {
  const limit = (await page.locator(FOCUSABLE).count()) + 2
  for (let step = 0; step <= limit; step += 1) {
    const stop = await readActive(page)
    if (match(stop)) return
    await page.keyboard.press(shift ? 'Shift+Tab' : 'Tab')
  }
  throw new Error(`按了 ${limit} 次 Tab 也没走到目标停靠点，最后停在 ${JSON.stringify(await readActive(page))}`)
}

/** 环外侧的两层背景：外壳控件与棋盘落在页面上，方块上的环落在空格底上 */
const SHELL_BACKGROUND = '.shell'
const CELL_BACKGROUND = ".board__cell[data-cell='empty']"

interface Ring {
  width: number
  /** 那一圈的颜色。null = 没有一圈环（outline 没了、box-shadow 里也没有一层） */
  colour: string | null
}

/**
 * 一个有焦点元素的**计算样式**里的那一圈环。
 *
 * 两件事这里刻意不看 activeElement 就算完：环必须**存在**、必须**够粗**、必须与它所
 * 在的背景分得开。「某个元素拿到了焦点」不等于「焦点看得见」——本票的验收标准 1
 * 要的是后者。
 *
 * 两种画法都认，因为它们各有理由（不是谁写错了）：
 *   · Material / Claude 用 outline（本风格的层级语言就是投影，焦点再叠一层投影会让读者
 *     分不清哪层是焦点、哪层是 elevation）；
 *   · Classic 用「页面色垫圈 + 深色描边」的 box-shadow 双环。双环取**最宽**那一圈——
 *     它就是贴在外层背景上的那一圈，内圈是垫色（与背景同色，量它没有意义）。
 */
async function readActiveRing(page: Page): Promise<Ring> {
  return page.evaluate(() => {
    const element = document.activeElement
    if (element === null || element === document.body) return { width: 0, colour: null }
    const style = getComputedStyle(element)

    const outlineWidth = parseFloat(style.outlineWidth)
    if (style.outlineStyle !== 'none' && outlineWidth > 0) {
      return { width: outlineWidth, colour: style.outlineColor }
    }

    // box-shadow 的一层层环：`rgb(...) 0px 0px 0px 4px`。颜色在前的那种才认——
    // Material 的 elevation 把颜色写在偏移后面，它本来就不是环，不该被算进来
    const layers = [...style.boxShadow.matchAll(/rgba?\([^)]*\)\s+(?:-?\d+(?:\.\d+)?px\s+){3}(\d+(?:\.\d+)?)px/g)]
      .map((layer) => ({ colour: layer[0].slice(0, layer[0].indexOf(' ')), spread: Number(layer[1]) }))
    if (layers.length === 0) return { width: 0, colour: null }
    const widest = layers.reduce((a, b) => (b.spread > a.spread ? b : a))
    return { width: widest.spread, colour: widest.colour }
  })
}

/** 某一块表面的背景色（环压在它上面） */
async function backgroundColour(page: Page, selector: string): Promise<string> {
  const colour = await page
    .locator(selector)
    .first()
    .evaluate((element) => getComputedStyle(element).backgroundColor)
  return colour
}

/** 'rgb(74, 68, 63)' → 通道。认不出来直接抛：宁可红，也不要拿一个错颜色比出个好看的数 */
function channels(value: string): { r: number; g: number; b: number } {
  const parts = /rgba?\(([^)]+)\)/.exec(value)
  if (parts === null) throw new Error(`认不出的颜色：${value}`)
  const [r = 0, g = 0, b = 0] = parts[1].split(',').map((part) => Number(part.trim()))
  return { r, g, b }
}

/** WCAG 2.x 相对亮度（与 scripts/check-contrast.mjs 同一个公式，见下面的说明） */
function luminance(value: string): number {
  const { r, g, b } = channels(value)
  const channel = (byte: number): number => {
    const normalised = byte / 255
    return normalised <= 0.04045
      ? normalised / 12.92
      : Math.pow((normalised + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG 2.x 对比度 */
function contrast(foreground: string, background: string): number {
  const a = luminance(foreground)
  const b = luminance(background)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/**
 * 非文字指示器的门槛（SPEC §3.2：大字与适用的非文字指示器至少 3:1）。
 * 焦点环属于 1.4.11 的非文字指示器。**为什么这里要自己算一遍**：
 * scripts/check-contrast.mjs 那一层算的是**声明值**（contrast.json 里的 hex），
 * 而这一层要量的是**渲染值**（浏览器真的合成出来的那个颜色）——声明对了不等于渲染对
 * 了，这正是 T14 立两层闸门的理由。公式逐字相同，两份实现不会漂：这份只读计算样式。
 */
const NON_TEXT_MINIMUM = 3

/** 环至少要多粗才看得见（工程判据：更细的环在低分屏上与文字笔画分不开） */
const RING_MIN_WIDTH = 2

/**
 * 此刻有焦点的那一个停靠点：一圈看得见的环，且它与自己那层背景分得开。
 *
 * 这是本票对「焦点始终可见」的全部断言形状——不看 activeElement 就算了，
 * 每一站都读计算样式。backgroundSelector 说环外面是什么：外壳控件与棋盘是页面，
 * 棋盘里的方块是空格底（环画在方块外侧，见 board.css 的 outline-offset）。
 */
async function expectRingVisible(page: Page, backgroundSelector: string): Promise<void> {
  const stop = await readActive(page)
  const ring = await readActiveRing(page)
  expect(
    ring.width,
    `焦点在 <${stop.tag}>「${stop.name}」上，却没有一圈 ${RING_MIN_WIDTH}px 以上的环`
  ).toBeGreaterThanOrEqual(RING_MIN_WIDTH)
  expect(ring.colour, `焦点在 <${stop.tag}>「${stop.name}」上没有环的颜色`).not.toBeNull()

  const background = await backgroundColour(page, backgroundSelector)
  const ratio = contrast(ring.colour ?? '', background)
  expect(
    ratio,
    `焦点在 <${stop.tag}>「${stop.name}」上的环是 ${ring.colour}，压在 ${background} 上只有 ${ratio.toFixed(2)}:1`
  ).toBeGreaterThanOrEqual(NON_TEXT_MINIMUM)
}

/** 一枚方块的呈现事实：过渡、动画、静止态描边（reduced-motion 那几个用例要用） */
async function tileStyle(
  page: Page,
  selector: string
): Promise<{ transitionProperty: string; animationName: string; outlineStyle: string; outlineWidth: string }> {
  return page.locator(selector).evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      transitionProperty: style.transitionProperty,
      animationName: style.animationName,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    }
  })
}

test('纯键盘从开局到结算：选风格、开局、死局、撤销、交换、重开', async ({ page }) => {
  const problems = watchProblems(page)
  await page.goto(startUrl(ONE_STEP_FROM_DEADLOCK, 500))
  await expect(page.getByRole('button', { name: '开始游戏' })).toBeVisible()

  // —— 选风格（用户故事 1 / 17：键盘玩家换得了风格）——
  await tabUntil(page, (stop) => stop.tag === 'button' && stop.name === 'Material')
  await expectRingVisible(page, SHELL_BACKGROUND)
  await page.keyboard.press('Enter')
  await expect(page.locator('main')).toHaveAttribute('data-style', 'material')
  await expect(
    page.getByRole('group', { name: '风格' }).getByRole('button', { name: 'Material' })
  ).toHaveAttribute('aria-pressed', 'true')

  // —— 开局 ——
  await tabUntil(page, (stop) => stop.name === '开始游戏')
  await expectRingVisible(page, SHELL_BACKGROUND)
  await page.keyboard.press('Enter')
  const board = page.locator('[data-board]')
  await expect(board).toBeVisible()
  // 开局即把焦点给棋盘（Board 的挂载 effect），而那一刻环是看得见的：
  // 「有焦点」与「焦点看得见」是两件事，这里断言后者
  await expect(board).toBeFocused()
  await expectRingVisible(page, SHELL_BACKGROUND)

  const opening = await readBoard(page)
  await expect(page.locator('[data-score]')).toHaveText('500')

  // —— 一次移动推进死局 ——
  await page.keyboard.press('ArrowRight')
  const panel = page.locator('[data-panel="gameover"]')
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('heading')).toHaveText('死局')
  // 死局这件事被播报：role=status 的结果区带着原因与当前得分
  await expect(page.locator('[data-run-status="stuck"]')).toHaveText(/死局/)
  await expect(page.locator('[data-run-status="stuck"]')).toHaveText(/500/)

  // —— 撤销（面板第一条恢复动作）——
  await tabUntil(page, (stop) => stop.tag === 'button' && stop.name === '撤销')
  await expectRingVisible(page, SHELL_BACKGROUND)
  await page.keyboard.press('Enter')
  await expect(panel).toHaveCount(0)
  expect(await readBoard(page)).toEqual(opening)
  await expect(page.locator('[data-score]')).toHaveText('500')
  // 面板卸载会把被聚焦的按钮从 DOM 上带走、焦点掉到 body。Board 的那个 effect 把它
  // 还给棋盘——少了它，从这里开始的方向键会失灵（本用例后面每一步都接着按方向键）
  await expect(board).toBeFocused()
  await expectRingVisible(page, SHELL_BACKGROUND)

  // —— 作弊交换（Shift+Tab 回到 StatusBar 的入口，Tab 进棋盘里的方块）——
  await tabUntil(page, (stop) => stop.name === '交换', true)
  await expectRingVisible(page, SHELL_BACKGROUND)
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: '取消交换' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  // 拾取态这一步也被播报（T12 的可见提示 + role=status）
  await expect(page.locator('[data-swap-prompt="first"]')).toHaveText(
    '请选择第一枚方块，Esc 退出'
  )

  await tabUntil(page, (stop) => stop.tile !== '')
  const firstTile = (await readActive(page)).tile
  // 拾取中的方块自己也是焦点目标，所以它自己那一圈环必须看得见（board.css 的
  // .board__tile:focus-visible，T22 补的正是这一条）
  await expectRingVisible(page, CELL_BACKGROUND)
  await page.keyboard.press('Enter')
  await expect(page.locator('.board__tile[data-selected="true"]')).toHaveCount(1)
  await expect(page.locator(`[data-tile-id="${firstTile}"]`)).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await expect(page.locator('[data-swap-prompt="second"]')).toHaveText(
    '已选择第 1 行第 1 列，再选一枚方块完成交换'
  )

  // 第二枚：Tab 到另一枚方块，Enter = 交换完成
  await tabUntil(page, (stop) => stop.tile !== '' && stop.tile !== firstTile)
  await page.keyboard.press('Enter')
  const swapped = await readBoard(page)
  expect(swapped).not.toEqual(opening)
  // 作弊交换的承诺：位置换了，分数一个都没动
  await expect(page.locator('[data-score]')).toHaveText('500')
  // 拾取态收摊：方块不再是 Tab 停靠点，按钮回到「交换」
  await expect(page.locator('.board__tile[data-selectable="true"]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '交换' })).toBeVisible()
  // 焦点从被摘掉 tabIndex 的那枚方块上还回来（同一个 effect 的另一半理由）
  await expect(board).toBeFocused()

  // —— 交换之后输入频道仍然通：方向键立刻推得动 ——
  await page.keyboard.press('ArrowRight')
  expect(await readBoard(page)).not.toEqual(swapped)

  // —— 撤销把那一动搬回来，再撤一次把交换搬回来 ——
  await page.keyboard.press('z')
  expect(await readBoard(page)).toEqual(swapped)
  await page.keyboard.press('z')
  expect(await readBoard(page)).toEqual(opening)

  // —— 再推进死局，结束并记录 ——
  await page.keyboard.press('ArrowRight')
  await expect(panel).toBeVisible()
  await tabUntil(page, (stop) => stop.name === '结束并记录')
  await expectRingVisible(page, SHELL_BACKGROUND)
  await page.keyboard.press('Enter')
  await expect(panel).toHaveAttribute('data-end-reason', 'deadlock')
  // 结算结果被播报：原因（与面板同一句口径）+ 最终得分
  await expect(page.locator('[data-run-status="ended"]')).toHaveText(/死局/)
  await expect(page.locator('[data-run-status="ended"]')).toHaveText(/最终得分 500/)
  // 焦点也没有掉到 body 上（同一个 effect）
  await expect(board).toBeFocused()

  // —— 重开：面板上的「新游戏」给一局干净的 ——
  await tabUntil(page, (stop) => stop.name === '新游戏')
  await page.keyboard.press('Enter')
  await expect(panel).toHaveCount(0)
  await expect(page.locator('[data-score]')).toHaveText('0')
  await expect(page.locator('[data-tile-id]')).toHaveCount(2)
  await expect(page.locator('[data-panel]')).toHaveCount(0)
  // 活跃局没有结果要播：区域不在 DOM 里，而不是留一句旧的
  await expect(page.locator('[data-run-status]')).toHaveCount(0)
  await expect(board).toBeFocused()
  // 新一局的方向键立刻生效（重开是最容易把键盘弄丢的一次）。四个方向全按一遍：
  // 只按一个方向时，「新局恰好那一动不合法」会让这条断言假红——两枚方块 14 个空格的
  // 盘面不可能是死局，所以四个方向里必然有一个推得动
  const fresh = await readBoard(page)
  for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
    await page.keyboard.press(key)
  }
  expect(await readBoard(page)).not.toEqual(fresh)

  expect(problems).toEqual([])
})

test('拾取态下方向键仍然移动、Enter 仍然选中（两条路互不挡住）', async ({ page }) => {
  const problems = watchProblems(page)
  await startWithClick(page, startUrl(ACTIVE, 500))

  await page.getByRole('button', { name: '交换' }).click()
  await tabUntil(page, (stop) => stop.tile !== '')
  await expect(page.locator('.board__tile[data-selectable="true"]')).not.toHaveCount(0)

  // TileView 用的是 role="button" 的 div，不是真 <button>：真按钮会被 Board 的
  // isInteractiveTarget 认成「交互控件」而整键放行，方向键在一枚有焦点的方块上就失灵了
  // （那道守卫是给放进棋盘区的真控件留的）。这里验的是**移动**那一半
  const before = await readBoard(page)
  await page.keyboard.press('ArrowRight')
  expect(await readBoard(page)).not.toEqual(before)
  // 一次移动顺带把拾取态收了（store 的 move 清摊），所以下面重新进来验另一半
  await expect(page.locator('.board__tile[data-selectable="true"]')).toHaveCount(0)

  await page.getByRole('button', { name: '交换' }).click()
  await tabUntil(page, (stop) => stop.tile !== '')
  // **激活**那一半：同一个焦点上按 Enter = 拾取这一枚
  await page.keyboard.press('Enter')
  await expect(page.locator('.board__tile[data-selected="true"]')).toHaveCount(1)
  await expect(page.locator('[data-swap-prompt="second"]')).toBeVisible()
  // 选中之后焦点环还在（焦点环与选中环并存，看得见的那一个没被顶掉）
  await expectRingVisible(page, CELL_BACKGROUND)

  expect(problems).toEqual([])
})

test('结果播报：里程碑才说话，一次 Move 什么都不播', async ({ page }) => {
  const problems = watchProblems(page)
  await page.goto(startUrl(FOUR_1024, 4321))
  await expect(page.getByRole('button', { name: '开始游戏' })).toBeVisible()

  // 活跃局：一局的结果什么都不是，所以一条播报都没有
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()
  await expect(page.locator('[data-run-status]')).toHaveCount(0)

  // 一次 Move（合并、得分从 4321 涨上去）之后仍然一条都没有：
  // SPEC §3.4 的「without duplicating every intermediate value」守的就是这一条
  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowLeft')
  // 8417 = 4321 + 2048 + 2048：四个 1024 左移合出两个 2048，一次合并的产物不在
  // 同一动里再合（mode-contract §2）。同 run-endings.spec.ts 的那个局面
  await expect(page.locator('[data-score]')).toHaveText('8417')
  await expect(page.locator('[data-run-status]')).toHaveCount(0)

  // 达标：一句话说出目标值与「这不是终局」
  await expect(page.locator('[data-panel="win"]')).toBeVisible()
  const status = page.locator('[data-run-status="won"]')
  await expect(status).toHaveCount(1)
  await expect(status).toHaveAttribute('role', 'status')
  await expect(status).toHaveText(/达成目标 2048/)
  await expect(status).toHaveText(/不是终局/)

  // 里程碑面板上的按钮继续用键盘（面板是 .board 的兄弟，Tab 就到）
  await page.getByRole('button', { name: '继续玩' }).focus()
  await expectRingVisible(page, SHELL_BACKGROUND)

  expect(problems).toEqual([])
})

test('终局播报带着结束原因与最终得分（与面板同一句口径）', async ({ page }) => {
  const problems = watchProblems(page)
  await startWithClick(page, startUrl(ONE_STEP_FROM_DEADLOCK, 500))
  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowRight')

  const status = page.locator('[data-run-status="stuck"]')
  await expect(status).toHaveCount(1)
  // 与 GameOverPanel 上那句话同一个来源（runEndLabel），只是多了分数
  await expect(status).toHaveText(/四方向都无合法移动/)
  await expect(status).toHaveText(/得分 500/)

  await page.getByRole('button', { name: '结束并记录' }).click()
  await expect(page.locator('[data-run-status="ended"]')).toHaveText(/最终得分 500/)
  // 播报不抢焦点（一把拽走会让玩家以为这一局被打断了）
  await expect(page.locator('[data-board]')).toBeFocused()

  expect(problems).toEqual([])
})

test('reduced-motion：整条键盘路径走得通，状态一个字节都没少', async ({ page }) => {
  // 用户故事 24：要求「少一点动」的玩家仍然看得见每一枚方块、仍然走得动、
  // 分数照旧涨、面板照旧能操作。所以这里同时断言「动画没了」与「游戏还在」——
  // 只断言前者是关掉功能，只断言后者是没做降级
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const problems = watchProblems(page)
  await page.goto(startUrl(MERGE))
  await expect(page.getByRole('button', { name: '开始游戏' })).toBeVisible()

  // 开局就确认频道是关着的：两枚方块都在、数字读得清
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()
  await expect(page.locator('[data-tile-id]')).toHaveCount(2)
  const opening = await tileStyle(page, '[data-tile-id="1"]')
  expect(opening.transitionProperty).toBe('none')
  expect(opening.animationName).toBe('none')

  // 走得动、分数照旧涨（合并的产物与分数都在）
  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('[data-tile-id="1"]')).toHaveAttribute('data-value', '4')
  await expect(page.locator('[data-tile-id="2"]')).toHaveCount(0)
  await expect(page.locator('[data-score]')).toHaveText('4')

  // 静态替代真的落到画面上：产物描一圈，而不是什么都没有
  const merged = await tileStyle(page, '[data-tile-id="1"]')
  expect(merged.animationName).toBe('none')
  expect(merged.outlineStyle).toBe('solid')
  expect(parseFloat(merged.outlineWidth)).toBeGreaterThan(0)

  // 降级之后键盘还活着：撤销（z）与换风格都在
  await page.keyboard.press('z')
  await expect(page.locator('[data-tile-id="1"]')).toHaveAttribute('data-value', '2')
  await expect(page.locator('[data-score]')).toHaveText('0')
  await tabUntil(page, (stop) => stop.tag === 'button' && stop.name === 'Claude', true)
  await page.keyboard.press('Enter')
  await expect(page.locator('main')).toHaveAttribute('data-style', 'claude')
  await expect(page.locator('[data-board]')).toBeVisible()

  // 拾取态在降级之后也完整：方块进 Tab 序列、焦点环仍然看得见、Enter 仍然选中
  await page.getByRole('button', { name: '交换' }).click()
  await tabUntil(page, (stop) => stop.tile !== '')
  // reduced-motion 的静态记号用的是同一个 outline，与焦点环同一层——这一枚同时说着
  // 「它有焦点」与（有新生成时）「它是新的」，2px 也仍然看得见
  await expectRingVisible(page, CELL_BACKGROUND)
  await page.keyboard.press('Enter')
  await expect(page.locator('.board__tile[data-selected="true"]')).toHaveCount(1)

  expect(problems).toEqual([])
})

/** 三套基准风格：环各自的画法不同（Classic 是 box-shadow 双环，另两套是 outline） */
const STYLES: readonly { label: string; id: string }[] = [
  { label: 'Classic', id: 'classic' },
  { label: 'Material', id: 'material' },
  { label: 'Claude', id: 'claude' },
]

/**
 * 每一套风格各起一个用例（不是一个用例里循环）：一局没打完的 run 会进存档，
 * 同一个页面里第二次 goto 会把它恢复回来、开局界面根本不出现。分用例则每个都拿
 * 一个新的 context，与 contrast-computed.spec.ts 按风格 × 场景铺用例是同一条路子。
 */
for (const style of STYLES) {
  test(`${style.label}：外壳控件、棋盘、拾取中的方块三个焦点目标都看得见`, async ({ page }) => {
    const problems = watchProblems(page)
    await page.goto('/?seed=20260926')
    await expect(page.getByRole('button', { name: '开始游戏' })).toBeVisible()

    // 开局界面：一组风格按钮就是外壳控件（默认那套不必点，本来就是它）
    await tabUntil(page, (stop) => stop.tag === 'button' && stop.name === style.label)
    await expectRingVisible(page, SHELL_BACKGROUND)

    // 非默认风格先选上（默认那套点了也无害，但那一步没有意义）
    if (style.id !== 'classic') {
      await page.keyboard.press('Enter')
      await expect(page.locator('main')).toHaveAttribute('data-style', style.id)
    }
    await tabUntil(page, (stop) => stop.name === '开始游戏')
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-board]')).toBeVisible()

    // 局中：把焦点用键盘送到棋盘（点过按钮之后 :focus-visible 不成立，Tab 才成立），
    // 再走到下一个外壳控件
    await page.getByRole('group', { name: '风格' }).getByRole('button').last().focus()
    await page.keyboard.press('Tab')
    await expect(page.locator('[data-board]')).toBeFocused()
    await expectRingVisible(page, SHELL_BACKGROUND)

    await tabUntil(page, (stop) => stop.tag === 'button' && stop.name === '新游戏')
    await expectRingVisible(page, SHELL_BACKGROUND)

    // 拾取中的方块：环落在空格底上（board.css 的 outline-offset），不是页面上
    await page.getByRole('button', { name: '交换' }).click()
    await tabUntil(page, (stop) => stop.tile !== '')
    await expectRingVisible(page, CELL_BACKGROUND)

    expect(problems).toEqual([])
  })
}

test('结构与语义：读屏软件能拿到的名字全部在位', async ({ page }) => {
  const problems = watchProblems(page)
  await page.goto('/?seed=20260926')
  await expect(page.getByRole('button', { name: '开始游戏' })).toBeVisible()

  // 开局界面：两组选择都是带名字的 group，选中态用 aria-pressed 说
  await expect(page.getByRole('group', { name: '模式' })).toBeVisible()
  await expect(page.getByRole('group', { name: '风格' })).toBeVisible()
  await expect(
    page.getByRole('group', { name: '模式' }).getByRole('button', { name: '经典' })
  ).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()

  // 棋盘：role=application + 一句说明它说什么的名字（方向键交给游戏本身处理）
  const board = page.locator('[data-board]')
  await expect(board).toHaveAttribute('role', 'application')
  await expect(board).toHaveAttribute('aria-label', /方向键或 WASD 移动方块/)
  // 底板层是装饰：不朗读
  await expect(page.locator('.board__cells')).toHaveAttribute('aria-hidden', 'true')

  // 拾取中的方块：role=button + aria-pressed + 一句带位置与数值的名字
  await page.getByRole('button', { name: '交换' }).click()
  const tile = page.locator('[data-tile-id="1"]')
  await expect(tile).toHaveAttribute('role', 'button')
  await expect(tile).toHaveAttribute('aria-pressed', 'false')
  await expect(tile).toHaveAttribute('aria-label', /第 1 行第 1 列的方块，数值 \d+，按 Enter 选择/)

  // 战绩面板的开关：aria-expanded 说它开着没有；面板是棋盘兄弟，不盖棋盘
  const toggle = page.getByRole('button', { name: '战绩与统计' })
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.focus()
  await page.keyboard.press('Enter')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('[data-stats-panel]')).toBeVisible()
  await expect(page.locator('[data-board]')).toBeVisible()

  // 面板里的「收起」同样原生可达：Tab 就到，Enter 就关
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: '收起' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-stats-panel]')).toHaveCount(0)
  // 焦点回到开关上，没有掉到 body（折叠面板收起来之后，焦点回它自己的触发器）。
  // 少了它，关一次面板方向键就失灵一次——SPEC §3.4 把 statistics 列在键盘操作范围内
  await expect(toggle).toBeFocused()
  await expectRingVisible(page, SHELL_BACKGROUND)

  expect(problems).toEqual([])
})

test.describe('触摸设备（mobile project）', () => {
  test('方向按钮是真实的控件：Tab 停得下、Enter 打得开、焦点看得见', async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile', '只有手机视口是触摸环境')
    const problems = watchProblems(page)
    await page.goto(startUrl(ACTIVE))
    await expect(page.getByRole('button', { name: '开始游戏' })).toBeVisible()
    await page.getByRole('button', { name: '开始游戏' }).click()
    await expect(page.locator('[data-board]')).toBeVisible()

    // T10 的判据是输入设备而不是视口宽度：宽屏也可能接着触屏。这里是 mobile project，
    // 所以四个方向按钮真的在布局里，也是真的 Tab 停靠点
    const dpad = page.getByRole('group', { name: '方向按钮' })
    await expect(dpad).toBeVisible()
    // 向右而不是向上：ACTIVE 的四列已经各自贴边，向上是空操作（棋盘一个格子都不动，
    // 断言不出来「这一下生效了」）；第 3 行的空格让向右合法
    await tabUntil(page, (stop) => stop.tag === 'button' && stop.name === '向右')
    await expectRingVisible(page, SHELL_BACKGROUND)

    // 方向按钮调的是同一个 move：与键盘、滑动共用一条派发路径
    const before = await readBoard(page)
    await page.keyboard.press('Enter')
    expect(await readBoard(page)).not.toEqual(before)

    expect(problems).toEqual([])
  })
})
