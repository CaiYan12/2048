import { readFileSync, readdirSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { MODES, type ModeDefinition } from '../../src/shared/modes'
import { createBoardLayout, fitCellSize } from '../../src/renderer/components/BoardLayout'
import { valueLadder } from '../../src/renderer/components/ValueLadder'

/**
 * T23 的浏览器矩阵：六模式 × 三风格共 18 个组合，桌面与手机视口各跑一遍
 * （SPEC §4「The final browser matrix visits all 18 mode/style combinations on
 * desktop and mobile-sized viewports」）。
 *
 * 跑法：`npx playwright test tests/e2e/task-23-matrix.spec.ts`。headless + 后台 +
 * workers ≤ 4 三条都是硬约束（AGENTS.md 与派发令；上限写在 playwright.config.ts，
 * 不靠谁记得加命令行参数）。
 *
 * **本文件证什么**
 *   1. 18 个组合（清单由 MODES × THEMES 推导，不手抄）在两个视口下都可加载、可操作、
 *      无控制台错误、无横向溢出；
 *   2. 六模式各自的特殊状态：5×5、障碍、长数值、终局结算、缩放（SPEC §3.2 的
 *      「rendered desktop and mobile review」的结构侧半边）；
 *   3. 三套风格各自的设计卡身份特征——「不是只换颜色」这一条的结构证据；
 *   4. 每套风格 × 每视口一张截图，落盘在 test-results/task-23-matrix/。
 *
 * **本文件不证什么**
 *   · 好不好看。截图证明页面渲染了，不证明它好看；设计卡的逐项视觉复核要真人，
 *     结论与「结构已验 / 要真人看」的分界写在 task-23-report.md。
 *   · 读屏软件真的会念出来（同 task-22-a11y.spec.ts 的边界）。
 *
 * 两条既有约定在这里延续：
 *   · Tab 步数一律从 DOM 推导，一个都不写死（T13 / T18 / T22 各摔过一次）；
 *   · 局面确定性靠 `?seed=` + `?board=` 两条一起给（T08 起的规矩：只给 board 的话，
 *     移动之后的生成走随机流）。
 */

/** 确定性种子：两台视口、十来个用例共用一个，出问题好对账 */
const SEED = '20260926'

/** 终局用例的开局分：终局面板说的就是这一局的最后一分，0 分看不出「分数还在」 */
const SETTLED_SCORE = 1234

/** 缩放用例的视口宽度：320 是最窄的真实设备（BoardLayout.ts 的地板就按它留的余量） */
const ZOOM_WIDTHS: readonly number[] = [320, 393, 520, 768, 1280]

interface ThemeInfo {
  id: string
  label: string
}

/**
 * 风格注册表的运行时快照（SPEC §3.2：注册表改动只发生在 themes/index.ts）。
 *
 * **为什么读源码文本而不是 import**：每套风格的 config.ts 顶部都 `import './tokens.css'`，
 * 而 Playwright 的模块加载器是 Node ESM——.css 会当场 ERR_UNKNOWN_FILE_EXTENSION
 * （本票实测：node 直接 import config.ts 就炸在这一行），注册表在 e2e 里 import 不
 * 进来，只能按它稳定的源码形状读：index.ts 给出顺序与常量名，各家 config.ts 给出
 * 字面量。解析与真实注册表脱钩的那一天，`注册表解析与界面一致` 那条守卫用例会先炸，
 * 而不是安静地少跑几个组合——所以这里允许朴素，不允许无声失败。
 */
function readThemeRegistry(): readonly ThemeInfo[] {
  const themesDir = new URL('../../src/renderer/styles/themes/', import.meta.url)
  const index = readFileSync(new URL('index.ts', themesDir), 'utf8')
  // 条目形如 `id: classicStyleId,\n    label: classicLabel,`
  const entries = [...index.matchAll(/id:\s*(\w+StyleId),\s*label:\s*(\w+Label)/g)]
  // 解析不出东西就让本次收集直接失败：矩阵少跑几个组合比 collection error 更糟——
  // 后者当场看得见，前者要等有人在报告里问「18 个组合在哪」
  if (entries.length === 0) {
    throw new Error('从 themes/index.ts 里解析不出任何风格，注册表的源码形状变了')
  }
  const values = new Map<string, string>()
  for (const item of readdirSync(themesDir, { withFileTypes: true })) {
    if (!item.isDirectory()) continue
    const source = readFileSync(new URL(`${item.name}/config.ts`, themesDir), 'utf8')
    for (const match of source.matchAll(
      /export const (\w+)(?::\s*StyleId)?\s*=\s*'([^']+)'/g
    )) {
      values.set(match[1], match[2])
    }
  }
  return entries.map(([, idName, labelName]) => ({
    id: values.get(idName) ?? '',
    label: values.get(labelName) ?? idName,
  }))
}

const THEMES: readonly ThemeInfo[] = readThemeRegistry()

/** 风格身份用例用的展示局面取第一个模式（4×4，阶梯最密的那一个） */
const SHOWCASE_MODE: ModeDefinition = MODES[0]

/** 缩放用例两种棋盘尺寸的代表模式：每个尺寸取第一个声明它的模式 */
const SIZE_REPRESENTATIVES: readonly ModeDefinition[] = MODES.filter(
  (mode, index, all) => all.findIndex((item) => item.size === mode.size) === index
)

// —— 局面夹具 ——

/** 行优先局面 → ?board= 参数（空串 = 空格） */
function boardQuery(values: readonly (number | null)[]): string {
  return values.map((value) => (value === null ? '' : String(value))).join(',')
}

/** 开局 URL：seed 与 board 两个都给（T08 起的规矩），score 可省 */
function startUrl(values: readonly (number | null)[], score = 0): string {
  return `/?seed=${SEED}&board=${boardQuery(values)}&score=${score}`
}

/**
 * 开局局面：本模式自己声明的两个生成值 + 一片空格。
 *
 * 为什么跟着 spawnValues 走而不是写死 2/4：模式数据是唯一真相（mode-contract §1），
 * 夹具跟着它推导，加第七种模式时这里自动成立。留空格是为了「至少一个方向合法」——
 * 空格所在的那一行，任一横向移动都会压缩它，所以四个方向里必有合法者。哪个方向
 * 合法取决于局面，而那不是本票要证的（各模式票证过），由 makeOneLegalMove 依次试。
 */
function openingFixture(mode: ModeDefinition): (number | null)[] {
  const cells: (number | null)[] = Array.from({ length: mode.size * mode.size }, () => null)
  cells[0] = mode.spawnValues[0]
  cells[1] = mode.spawnValues[1]
  return cells
}

/**
 * 一步即死的终局局面（按模式声明推导，障碍与非障碍同一套算式）。
 *
 * 形状：两个阶梯值 A / B 按行错位交替铺满棋盘，只在右上角 (0, size−1) 留一个空格；
 * 往右一按把空格挤到 (0,0)、由生成补上。补上的值只可能是 spawnValues，而 A / B 与
 * 生成值互不可合（等值家族里祇要不相亲等；斐波那契家族里隔着至少两档，因为它的合并
 * 表吃的是**相邻**两项），所以补完的满盘四方向皆无合法移动——deadlock 的定义。
 *
 * 「隔着至少两档」是斐波那契家族专属的要求，所以 A / B 的起点按家族分叉：等值家族
 * 从阶梯第 3 项起，斐波那契家族从第 4 项起，且 A 与 B 再隔一档。第 1 行与第 0 行
 * **同相**是故意的：右移会把第 0 行整体右推一格，只有第 1 行与它同相，推完之后每一
 * 列才仍然 A/B 相间——否则 (0,1) 会与 (1,1) 撞成同值，那就不再是死局。
 *
 * 障碍模式同一套算式成立：墙格被跳过（保持 wall），剩下的格子按同一 parity 铺出来
 * 正是各段各自交替的形状——墙把行与列切成段，每段内部仍然 A/B 相间。
 */
function deadlockFixture(mode: ModeDefinition): (number | null)[] {
  const ladder = valueLadder(mode)
  // 生成值占阶梯前两位（index 0/1）；等值家族从 index 2 起，斐波那契从 index 3 起
  const start = mode.mergeFamily === 'fibonacci' ? 3 : 2
  const [a, b] = [ladder[start], ladder[start + 2]]
  // 行错位：第 0、1 行从 A 起，第 2 行起偶数行从 B、奇数行从 A。第 1 行与第 0 行
  // **同相**是故意的：右移会把第 0 行整体右推一格，只有第 1 行与它同相、第 2 行起换相，
  // 推完之后每一列才仍然 A/B 相间——否则第 0 列会撞出两个相邻同值，那就不再是死局
  const rowPhase = (row: number): number => (row <= 1 ? 0 : row % 2 === 0 ? 1 : 0)
  const walls = new Set(mode.walls.map(([row, col]) => `${row}-${col}`))
  const cells: (number | null)[] = Array.from({ length: mode.size * mode.size }, () => null)
  for (let row = 0; row < mode.size; row += 1) {
    for (let col = 0; col < mode.size; col += 1) {
      if (walls.has(`${row}-${col}`)) continue
      cells[row * mode.size + col] = (rowPhase(row) + col) % 2 === 0 ? a : b
    }
  }
  // 唯一空格在右上角：右移之后它被挤到左上角，由生成补上
  cells[mode.size - 1] = null
  return cells
}

/** 「超过本模式目标」的那个值：等值家族翻倍，斐波那契家族取阶梯再往上一步 */
function beyondValue(mode: ModeDefinition): number {
  const ladder = valueLadder(mode)
  const top = ladder[ladder.length - 1]
  return mode.mergeFamily === 'fibonacci' ? top + ladder[ladder.length - 2] : top * 2
}

/**
 * 展示局面：本模式自己的整条阶梯 + 一个「超过目标」的值。
 *
 * 阶梯值取自 valueLadder（从 spawnValues 与 target 推出来），所以这套局面在任何模式
 * 下都成立。值全部互不相同，于是盘面上**不可能**出现合并——截图与字号测量不会被一次
 * 随机合并改写，也不会合出目标块把胜利面板招来。阶梯短于 size² 的模式留出空格，
 * 于是它始终是活跃局。
 */
function showcaseFixture(mode: ModeDefinition): (number | null)[] {
  const room = mode.size * mode.size
  const values = [beyondValue(mode), ...valueLadder(mode).slice(-(room - 1))]
  const empties = Math.max(room - values.length, 0)
  return [...values, ...Array.from({ length: empties }, (): null => null)]
}

// —— 页面读数的小工具 ——

/** 收 console error / pageerror：React 的 key 警告与资源加载失败都要当场看见 */
function watchProblems(page: Page): string[] {
  const problems: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  return problems
}

/** 盘面的可比较签名：id + 数值 + 行列。按 id 排序，与 document order 无关 */
function boardSignature(page: Page): Promise<string> {
  return page
    .locator('[data-tile-id]')
    .evaluateAll((nodes) =>
      nodes
        .map((node) =>
          [
            node.getAttribute('data-tile-id'),
            node.getAttribute('data-value'),
            node.getAttribute('data-row'),
            node.getAttribute('data-col'),
          ].join(':')
        )
        .sort()
        .join('|')
    )
}

/**
 * 一次合法操作：四个方向依次试，直到有一个真的推动棋盘。
 *
 * 判据是「棋盘真的变了」而不是「按了一个键」——无效移动连 state 都不换（store 的
 * move），前后两个棋盘在 DOM 上完全无法区分，「按了键」什么都不能证明。墙模式另外
 * 要求四个固定障碍一个都没被推动、也没有方块落到墙格上（障碍永不移动 / 合并 / 生成，
 * SPEC §3.1）——「尊重墙」因此是断言，不是假设。
 */
async function makeOneLegalMove(page: Page, mode: ModeDefinition): Promise<string> {
  const before = await boardSignature(page)
  for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
    await page.keyboard.press(key)
    const after = await boardSignature(page)
    if (after === before) continue
    if (mode.walls.length > 0) {
      await expect(
        page.locator(".board__cell[data-cell='wall']"),
        `${mode.label}：墙格数量变了`
      ).toHaveCount(mode.walls.length)
      for (const [row, col] of mode.walls) {
        await expect(
          page.locator(`.board__tile[data-row="${row}"][data-col="${col}"]`),
          `${mode.label}：有方块落到了墙格 (${row},${col}) 上`
        ).toHaveCount(0)
      }
    }
    return key
  }
  throw new Error(`${mode.label}：四个方向都没能推动棋盘，这不是一个可操作的局面`)
}

/**
 * 横向溢出：SPEC §3.2 的窄屏义务，也是 fitCellSize 的验收（算式与地板见 BoardLayout.ts）。
 * 判据取 documentElement 而不是 .board：溢出的是页面，而棋盘宽过内容区时页面一定横滚。
 */
async function expectNoOverflow(page: Page, where: string): Promise<void> {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    boardWidth: document.querySelector('[data-board]')?.getBoundingClientRect().width ?? 0,
  }))
  expect(
    metrics.scrollWidth,
    `${where}：页面横向溢出（${metrics.scrollWidth} > ${metrics.clientWidth}）`
  ).toBeLessThanOrEqual(metrics.clientWidth)
  expect(metrics.boardWidth, `${where}：棋盘宽过内容区`).toBeLessThanOrEqual(metrics.clientWidth)
}

test.describe('18 组合矩阵（MODES × THEMES × 桌面/手机）', () => {
  test('注册表解析与界面一致：选择器列出的就是 THEMES，顺序也一样', async ({ page }) => {
    // 这条守卫钉的是上面 readThemeRegistry 的解析：解析与界面脱钩时先在这里炸，
    // 而不是让矩阵安静地少跑几个组合
    await page.goto(`/?seed=${SEED}`)
    const picker = page.getByRole('group', { name: '风格' })
    const buttons = picker.getByRole('button')
    await expect(buttons).toHaveCount(THEMES.length)

    const fromDom: ThemeInfo[] = []
    for (let index = 0; index < THEMES.length; index += 1) {
      // 点一下再读 main[data-style]：界面上的 id 就在那里（换肤机制唯一的钩子）
      await buttons.nth(index).click()
      fromDom.push({
        id: (await page.locator('main').getAttribute('data-style')) ?? '',
        label: ((await buttons.nth(index).textContent()) ?? '').trim(),
      })
    }
    expect(fromDom).toEqual([...THEMES])
  })

  for (const mode of MODES) {
    for (const theme of THEMES) {
      test(`${theme.label} × ${mode.label}：可加载、可操作、无控制台错误、无横向溢出`, async ({
        page,
      }) => {
        const problems = watchProblems(page)
        const where = `${theme.label} × ${mode.label}`

        await page.goto(startUrl(openingFixture(mode)))
        await expect(page.getByRole('button', { name: '开始游戏' })).toBeVisible()

        // 模式与风格都从界面选：模式没有 URL 入口，而 ?board= 由开局那一刻选中的模式
        // 解释（fixture.ts），所以点模式的顺序必须落在「开始游戏」之前
        await page
          .getByRole('group', { name: '模式' })
          .getByRole('button', { name: mode.label })
          .click()
        await page
          .getByRole('group', { name: '风格' })
          .getByRole('button', { name: theme.label })
          .click()
        await expect(page.locator('main')).toHaveAttribute('data-style', theme.id)
        await page.getByRole('button', { name: '开始游戏' }).click()

        const board = page.locator('[data-board]')
        await expect(board).toBeVisible()
        await expect(board).toHaveAttribute('data-mode', mode.id)
        // 棋盘格数 = 模式声明的尺寸：5×5 少一格就是布局出错，而它在另四个模式里看不出来
        await expect(page.locator('.board__cell')).toHaveCount(mode.size * mode.size)

        // 每一枚方块都落在 11 个色档里：掉出本模式阶梯的值会落到 beyond 档，那是
        // 「超过本模式目标」的意思，不该在开局局面出现（T13 的分档机制 per-mode 验证）
        const buckets = await page
          .locator('[data-tile-id]')
          .evaluateAll((nodes) => nodes.map((node) => Number(node.getAttribute('data-bucket'))))
        expect(buckets.length).toBeGreaterThan(0)
        for (const bucket of buckets) {
          expect(bucket, `${where}：有方块落在 11 个色档之外`).toBeGreaterThanOrEqual(1)
          expect(bucket, `${where}：有方块落在 11 个色档之外`).toBeLessThanOrEqual(11)
        }

        // 可操作：一次真的推动棋盘的操作（墙模式另验障碍一个都没被推动）
        await board.focus()
        await makeOneLegalMove(page, mode)

        await expectNoOverflow(page, where)
        expect(problems, `${where}：有控制台错误`).toEqual([])
      })
    }
  }
})

test.describe('代表局面：六模式的特殊状态（SPEC §3.2 的 rendered review）', () => {
  for (const mode of MODES) {
    test(`${mode.label}：终局结算后面板与分数都在，棋盘不在面板后面位移`, async ({ page }) => {
      const problems = watchProblems(page)
      await page.goto(startUrl(deadlockFixture(mode), SETTLED_SCORE))
      await page.getByRole('button', { name: '开始游戏' }).click()
      await expect(page.locator('[data-board]')).toBeVisible()
      await expect(page.locator('[data-score]')).toHaveText(String(SETTLED_SCORE))

      // 一步把局面走死：开局夹具是「一步即死」，stuck 面板是 mode-contract §3 的
      // 可恢复面板（恢复动作摆在那里，但本用例走的是「结束并记录」那条）
      await page.locator('[data-board]').focus()
      await page.keyboard.press('ArrowRight')
      const panel = page.locator('[data-panel="gameover"]')
      await expect(panel).toBeVisible()
      await expect(panel.getByRole('heading')).toHaveText('死局')
      // 死局这件事被播报（T22 的 role=status）：内容是当前状态推导的一句
      await expect(page.locator('[data-run-status="stuck"]')).toHaveText(/死局/)

      // stuck 阶段两枚「交换」同时在画面上（StatusBar 一枚 + 死局面板一枚，调的是
      // store 里同一个 toggleSwap）。可访问名必须分得开，否则读屏玩家连着听到两个
      // 同名控件，分不清哪一个在手边（T22 记录、T23 修）
      const swapButtons = page.getByRole('button', { name: '交换' })
      await expect(swapButtons).toHaveCount(2)
      const swapNames = await swapButtons.evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute('aria-label') ?? node.textContent?.trim() ?? '')
      )
      expect(
        new Set(swapNames).size,
        `两枚交换按钮撞了同一个可访问名：${swapNames.join(' / ')}`
      ).toBe(2)

      // 面板是不透明满盖（.overlay 的 inset:0 + 实底），它是 .board 的**兄弟**节点：
      // 盖得住棋盘，但不该把棋盘推走。面板露头时量与结算之后量，两个矩形必须一样
      const boardRect = async (): Promise<{ x: number; y: number; width: number; height: number }> =>
        page.locator('[data-board]').evaluate((el) => {
          const box = el.getBoundingClientRect()
          return { x: box.x, y: box.y, width: box.width, height: box.height }
        })
      const withPanel = await boardRect()

      // 结束并记录 → 结算（mode-contract §3：endReason 从 phase 反推，死局收工 = deadlock）
      await panel.getByRole('button', { name: '结束并记录' }).click()
      await expect(panel).toHaveAttribute('data-end-reason', 'deadlock')
      await expect(panel.getByRole('heading')).toHaveText('本局已结束')
      await expect(panel).toContainText('死局')
      // 分数还在：StatusBar 在 ended 之后照旧渲染，面板说的就是这一局的最后一分
      await expect(page.locator('[data-score]')).toHaveText(String(SETTLED_SCORE))
      // 棋盘一个像素都没动，格子一枚都没少
      expect(await boardRect()).toEqual(withPanel)
      await expect(page.locator('.board__cell')).toHaveCount(mode.size * mode.size)

      await expectNoOverflow(page, `${mode.label} 终局`)
      expect(problems, `${mode.label} 终局有控制台错误`).toEqual([])
    })
  }

  for (const mode of MODES) {
    test(`${mode.label}：长数值落在字号档位上，每一位都还读得清、不溢出格子`, async ({ page }) => {
      await page.goto(startUrl(showcaseFixture(mode)))
      await page.getByRole('button', { name: '开始游戏' }).click()
      await expect(page.locator('[data-board]')).toBeVisible()

      // 目标值在第 11 档、超过目标的值在 beyond 档（board.css 的兜底档，data-bucket='12'）：
      // 三套设计卡都把「第 11 档 = 本模式的目标」写成阶梯唯一一次「到了」，beyond 才是
      // 「过了目标」。大棋盘的 4096 是它自己的目标值，所以落第 11 档而不是 beyond
      await expect(page.locator(`[data-tile-id][data-value="${mode.target}"]`)).toHaveAttribute(
        'data-bucket',
        '11'
      )
      await expect(
        page.locator(`[data-tile-id][data-value="${beyondValue(mode)}"]`)
      ).toHaveAttribute('data-bucket', '12')

      // 位数档位与标签一致，字号跟着格子缩，数字不溢出不遮挡（SPEC §3.2 的「不遮挡或丢失」）
      const cellSize = await page
        .locator('[data-board]')
        .evaluate((el) => parseFloat(getComputedStyle(el).getPropertyValue('--cell-size')))
      const tiles = await page.locator('[data-tile-id]').evaluateAll((nodes) =>
        nodes.map((node) => {
          const style = getComputedStyle(node)
          return {
            value: node.textContent ?? '',
            digits: node.getAttribute('data-digits'),
            fontSize: parseFloat(style.fontSize),
            overflow: node.scrollWidth - node.clientWidth,
          }
        })
      )
      expect(tiles.length).toBeGreaterThan(0)
      for (const tile of tiles) {
        expect(Number(tile.digits), `方块 ${tile.value} 的位数档位不对`).toBe(tile.value.length)
        // 字号永远不超过格子：board.css 的位数阶梯一位 0.45 倍格边长、六位往上 0.2 倍
        expect(tile.fontSize, `方块 ${tile.value} 的字号大过了格子`).toBeLessThanOrEqual(cellSize)
        // 排版宽度不超出方块内宽：长数值在全屏与窄屏都不被格子切掉
        expect(tile.overflow, `方块 ${tile.value} 的数字宽出了格子`).toBeLessThanOrEqual(1)
      }

      await expectNoOverflow(page, `${mode.label} 长数值`)
    })
  }

  test('缩放：五种视口宽度下 4×4 与 5×5 都不横向溢出，格边长就是 fitCellSize 的那一份', async ({
    browser,
  }) => {
    // 本用例自带视口，两个 project 跑出来是同一个结果：桌面那次就够
    test.skip(test.info().project.name !== 'desktop', '本用例自带视口，两个 project 重复')
    for (const width of ZOOM_WIDTHS) {
      // 每个视口一个全新 context：一局没打完的 run 会进存档，同一个页面里第二次 goto
      // 会把它恢复回来、开局界面根本不出现（T22 记过这条）
      const context = await browser.newContext({ viewport: { width, height: 800 } })
      const page = await context.newPage()
      try {
        for (const mode of SIZE_REPRESENTATIVES) {
          await page.goto(startUrl(openingFixture(mode)))
          await page.getByRole('button', { name: '开始游戏' }).click()
          await expect(page.locator('[data-board]')).toBeVisible()

          const measured = await page.evaluate(() => {
            const board = document.querySelector('[data-board]')
            const style = getComputedStyle(board as Element)
            return {
              innerWidth: window.innerWidth,
              scrollWidth: document.documentElement.scrollWidth,
              clientWidth: document.documentElement.clientWidth,
              cellSize: parseFloat(style.getPropertyValue('--cell-size')),
              boardWidth: (board as Element).getBoundingClientRect().width,
            }
          })
          const where = `${width}px · ${mode.label}`
          // innerWidth 必须等于设定的视口宽度：垂直滚动条会把它吃掉，而那会让下面那条
          // fitCellSize 断言读到一个棋盘挂载时并没有用过的宽度
          expect(measured.innerWidth, `${where}：滚动条把 innerWidth 吃掉了`).toBe(width)
          expect(measured.scrollWidth, `${where}：页面横向溢出`).toBeLessThanOrEqual(
            measured.clientWidth
          )
          expect(measured.boardWidth, `${where}：棋盘宽过内容区`).toBeLessThanOrEqual(
            measured.clientWidth
          )
          // 格边长与整块棋盘只有一份数值（BoardLayout.ts），棋盘层只消费 CSS 变量。
          // 这里验的是「DOM 真的用了那一份」；算式本身由 tests/unit/board-layout.test.ts 证
          expect(measured.cellSize, `${where}：格边长不是 fitCellSize 的那个值`).toBe(
            fitCellSize(mode.size, width)
          )
          expect(measured.boardWidth, `${where}：棋盘边长不是 createBoardLayout 的那个值`).toBe(
            createBoardLayout(mode.size, measured.cellSize).pixelSize
          )
        }
      } finally {
        await context.close()
      }
    }
  })
})

test.describe('设计卡与视觉复核（SPEC §3.2 的 human review 结构侧）', () => {
  /**
   * 每套风格的设计卡断言：数字全部抄自各自 DESIGN.md 的 §2 / §3 / §5。
   *
   * 为什么逐套写死：设计卡的色值是**设计**，不是能从代码推导的事实；矩阵要自动
   * 扩展的是组合清单，不是另一个人的配色裁决。加第四套风格时把它的设计卡抄进来，
   * 忘了抄会由用例里的 toBeDefined 当场说一句「先抄设计卡」。
   */
  interface ThemeCard {
    /** 纸面（页面底） */
    page: string
    /** 外壳正文的字族（设计卡 §3 的字体角色） */
    font: string
    /** 板面与它的层级语言：扁平 / 投影 / 一圈细线 */
    board: { background: string; elevation: boolean; rule: boolean }
    /** 控件底色；描边那一套的控件不填色，底色就是纸面 */
    control: string
    /** 方块数值的排版：字族、字重、数字特性 */
    tile: { family: string; weight: string; numeric: readonly string[] }
    /** 方块的 elevation（Material 的层级语言在方块上也有一份） */
    tileElevation: boolean
  }

  const DESIGN_CARDS: Record<string, ThemeCard> = {
    classic: {
      page: 'rgb(250, 248, 239)',
      font: 'Inter',
      board: { background: 'rgb(187, 173, 160)', elevation: false, rule: false },
      control: 'rgb(111, 96, 85)',
      tile: { family: 'Inter', weight: '700', numeric: ['tabular-nums'] },
      tileElevation: false,
    },
    material: {
      page: 'rgb(254, 247, 255)',
      font: 'Roboto Flex',
      board: { background: 'rgb(255, 255, 255)', elevation: true, rule: false },
      control: 'rgb(232, 222, 248)',
      tile: { family: 'Roboto Flex', weight: '500', numeric: ['tabular-nums'] },
      tileElevation: true,
    },
    claude: {
      page: 'rgb(240, 238, 226)',
      font: 'Source Sans 3',
      board: { background: 'rgb(250, 248, 242)', elevation: false, rule: true },
      control: 'rgb(240, 238, 226)',
      tile: { family: 'Playfair Display', weight: '700', numeric: ['lining-nums', 'tabular-nums'] },
      tileElevation: false,
    },
  }

  for (const theme of THEMES) {
    test(`${theme.label}：设计卡的身份特征（不是只换颜色）`, async ({ page }) => {
      const card = DESIGN_CARDS[theme.id]
      expect(
        card,
        `${theme.label} 还没有设计卡断言：加第四套风格时把它的 DESIGN.md §2/§3/§5 抄进来`
      ).toBeDefined()

      await page.goto(startUrl(showcaseFixture(SHOWCASE_MODE)))
      await page
        .getByRole('group', { name: '风格' })
        .getByRole('button', { name: theme.label })
        .click()
      await page.getByRole('button', { name: '开始游戏' }).click()
      await expect(page.locator('[data-board]')).toBeVisible()

      // 先把焦点从棋盘上引开再量样式：Classic 的焦点环是 box-shadow 双环、Material 与
      // Claude 的板面焦点环是 outline，而棋盘开局就拿着焦点。引不开的话，量到的会是
      // 焦点环而不是这套风格的层级语言（Classic 会「凭空多出投影」）
      await page.getByRole('button', { name: '战绩与统计' }).focus()
      await expect(page.locator('[data-board]')).not.toBeFocused()

      const shell = await page.locator('.shell').evaluate((el) => {
        const style = getComputedStyle(el)
        return { background: style.backgroundColor, font: style.fontFamily }
      })
      const board = await page.locator('[data-board]').evaluate((el) => {
        const style = getComputedStyle(el)
        return {
          background: style.backgroundColor,
          shadow: style.boxShadow,
          outline: style.outlineStyle === 'none' ? '' : `${style.outlineStyle} ${style.outlineWidth}`,
        }
      })
      const control = await page
        .locator('.control')
        .first()
        .evaluate((el) => getComputedStyle(el).backgroundColor)
      const tile = await page.locator('[data-tile-id]').first().evaluate((el) => {
        const style = getComputedStyle(el)
        return {
          family: style.fontFamily,
          weight: style.fontWeight,
          numeric: style.fontVariantNumeric,
          shadow: style.boxShadow,
        }
      })

      expect(shell.background, `${theme.label} 纸面色与设计卡不符`).toBe(card.page)
      expect(shell.font, `${theme.label} 的外壳正文字族与设计卡不符`).toContain(card.font)
      expect(board.background, `${theme.label} 板面色与设计卡不符`).toBe(card.board.background)
      // 层级语言三选一：扁平（无投影无细线）/ 投影 / 一圈细线。这一条是「不是只换颜色」
      // 最硬的结构证据——同一副棋盘，三套风格的板面处理各不相同
      expect(board.shadow !== 'none', `${theme.label} 的板面投影与设计卡不符`).toBe(
        card.board.elevation
      )
      expect(board.outline !== '', `${theme.label} 的板面细线与设计卡不符`).toBe(card.board.rule)
      expect(control, `${theme.label} 的控件底色与设计卡不符`).toBe(card.control)
      expect(tile.shadow !== 'none', `${theme.label} 的方块投影与设计卡不符`).toBe(
        card.tileElevation
      )
      expect(tile.family, `${theme.label} 方块数字的字族与设计卡不符`).toContain(card.tile.family)
      expect(tile.weight, `${theme.label} 方块数字的字重与设计卡不符`).toBe(card.tile.weight)
      for (const feature of card.tile.numeric) {
        expect(tile.numeric, `${theme.label} 方块数字缺 ${feature} 特性`).toContain(feature)
      }
    })

    test(`${theme.label}：视觉复核截图（按视口落盘，供真人对照设计卡）`, async ({
      page,
    }, testInfo) => {
      const problems = watchProblems(page)
      await page.goto(startUrl(showcaseFixture(SHOWCASE_MODE)))
      await page
        .getByRole('group', { name: '风格' })
        .getByRole('button', { name: theme.label })
        .click()
      await page.getByRole('button', { name: '开始游戏' }).click()
      await expect(page.locator('[data-board]')).toBeVisible()
      // 走两步让盘面活起来：截图要照的是动效落回之后的稳态，而且多几枚方块才看得出
      // 色档与字号阶梯。展示局面的值全部互不相同，所以这两步不可能触发合并脉冲，
      // 也不会合出目标块把胜利面板招来
      await page.locator('[data-board]').focus()
      await page.keyboard.press('ArrowLeft')
      await page.keyboard.press('ArrowUp')

      // 落盘路径带风格 id 与视口（project 名）：test-results/ 已在 .gitignore 里，
      // 复核记录按这个路径引用（task-23-report.md）
      await page.screenshot({
        path: `test-results/task-23-matrix/${theme.id}-${testInfo.project.name}.png`,
        fullPage: true,
      })
      expect(problems, `${theme.label} 截图前有控制台错误`).toEqual([])
    })
  }
})
