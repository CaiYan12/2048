import { expect, test, type Page } from '@playwright/test'
import { MODES, type ModeDefinition } from '../../src/shared/modes'
import { STYLE_CATALOG } from '../../src/shared/styleCatalog'
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
 *   1. 18 个组合（清单由 MODES × 风格目录推导，不手抄）在两个视口下都可加载、可操作、
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

interface StyleInfo {
  id: string
  label: string
}

/**
 * 风格清单直接来自共享目录（ADR-0006 / SC-02）。
 *
 * **为什么这里现在可以 import 了**：原先这段读的是源码文本 + 正则（themes/index.ts
 * 给顺序与常量名，各家 config.ts 给字面量），因为 config.ts 顶层 `import
 * './tokens.css'`，而 Playwright 的模块加载器是 Node ESM——.css 当场
 * ERR_UNKNOWN_FILE_EXTENSION，注册表在 e2e 里 import 不进来。共享目录是一张零 import
 * 的表，Node ESM 直接 import 得进来；这正是把风格身份从渲染层拆出去的收益之一，
 * 那层「朴素、但会与真实能力静默脱钩」的源码解析也一起消失了。
 *
 * 顺序 / id / label 全由目录给出。目录与**界面**是否一致由下面那条守卫用例负责
 * （界面此刻仍由渲染注册表驱动，注册表拆掉是 SC-03 的事）。
 */
const STYLES: readonly StyleInfo[] = STYLE_CATALOG

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
 * 从界面选一个模式再开局。
 *
 * **这一下不能省**：模式没有 URL 入口，而 `?board=` 由**开局那一刻选中的模式**解释
 * （fixture.ts 的 fixtureFromQuery 拿的是当前模式的 size 与合并表）。漏掉它，夹具会被
 * 默认的 Classic 解释，两种后果都很难从症状看回原因：
 *   · 尺寸不同的（5×5 的 25 格 vs Classic 的 16 格）——夹具**解析失败、退回随机开局**，
 *     于是 `?score=` 与盘面一起丢掉（现象是「分数期望 1234 实测 0」「目标块不在盘上」）；
 *   · 尺寸相同但阶梯不同的（斐波那契也是 4×4）——夹具照收，但档位按 Classic 的阶梯取
 *     （现象是「目标块期望第 11 档实测第 12 档」）。
 * 缩放、终局结算、长数值这三条用例各踩过一次同一个坑，所以收成一个帮手。
 */
async function startRun(page: Page, mode: ModeDefinition): Promise<void> {
  await page
    .getByRole('group', { name: '模式' })
    .getByRole('button', { name: mode.label })
    .click()
  await page.getByRole('button', { name: '开始游戏' }).click()
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

test.describe('18 组合矩阵（MODES × 目录 × 桌面/手机）', () => {
  test('目录与界面一致：选择器列出的就是目录里的三套，id、label、顺序都一样', async ({
    page,
  }) => {
    // 这条守卫钉的是「目录 == 界面」：界面此刻由渲染注册表驱动（SC-03 才会拆它），
    // 注册表与目录一旦分叉就先在这里炸，而不是让矩阵安静地少跑几个组合
    await page.goto(`/?seed=${SEED}`)
    const picker = page.getByRole('group', { name: '风格' })
    const buttons = picker.getByRole('button')
    await expect(buttons).toHaveCount(STYLES.length)

    const fromDom: StyleInfo[] = []
    for (let index = 0; index < STYLES.length; index += 1) {
      // 点一下再读 main[data-style]：界面上的 id 就在那里（换肤机制唯一的钩子）
      await buttons.nth(index).click()
      fromDom.push({
        id: (await page.locator('main').getAttribute('data-style')) ?? '',
        label: ((await buttons.nth(index).textContent()) ?? '').trim(),
      })
    }
    expect(fromDom).toEqual([...STYLES])
  })

  for (const mode of MODES) {
    for (const theme of STYLES) {
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
      await startRun(page, mode)
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

      // 结果层是棋盘那个盒子上的一层（T26 起是半透明遮罩 + 不透明卡片，ADR-0008），
      // 它是 .board 的**兄弟**节点：盖得住棋盘，但不该把棋盘推走。「不占布局」这件事
      // 直接断言机制，而不是比代理量：
      //   · 它必须脱离布局（position: absolute），否则会参与排版、把棋盘往下推；
      //   · 它的矩形必须与棋盘逐像素相同——盖的正是棋盘那一块，不多不少。
      //
      // 为什么不比「结算前后的棋盘矩形」（那是这里原来的写法）：那个代理量会被与面板
      // **无关**的变化污染，实测（探针，2026-09-28）——
      //   · 大棋盘桌面：结算后页面**滚了 22px**，视口坐标的 y 因此变小，而文档坐标没变；
      //   · 限时两个视口：结算后**倒计时那一行消失**，整页矮 72px，棋盘在文档坐标里真的上移。
      // 两者都不是面板干的，却都让那个代理量红——测的不是它想测的东西。
      const geometry = await page.evaluate(() => {
        const round = (value: number): number => Math.round(value * 10) / 10
        const box = (
          selector: string
        ): { x: number; y: number; width: number; height: number } | null => {
          const element = document.querySelector(selector)
          if (element === null) return null
          const rect = element.getBoundingClientRect()
          return {
            x: round(rect.x),
            y: round(rect.y),
            width: round(rect.width),
            height: round(rect.height),
          }
        }
        const overlay = document.querySelector('[data-panel="gameover"]')
        return {
          position: overlay === null ? 'none' : getComputedStyle(overlay).position,
          board: box('[data-board]'),
          overlay: box('[data-panel="gameover"]'),
        }
      })
      expect(geometry.position, `${mode.label}：终局面板必须脱离布局，否则它会推走棋盘`).toBe(
        'absolute'
      )
      expect(
        geometry.overlay,
        `${mode.label}：终局面板的矩形必须与棋盘逐像素相同`
      ).toEqual(geometry.board)

      // 结束并记录 → 结算（mode-contract §3：endReason 从 phase 反推，死局收工 = deadlock）
      await panel.getByRole('button', { name: '结束并记录' }).click()
      await expect(panel).toHaveAttribute('data-end-reason', 'deadlock')
      await expect(panel.getByRole('heading')).toHaveText('本局已结束')
      await expect(panel).toContainText('死局')
      // 分数还在：StatusBar 在 ended 之后照旧渲染，面板说的就是这一局的最后一分
      await expect(page.locator('[data-score]')).toHaveText(String(SETTLED_SCORE))
      // 格子一枚都没少
      await expect(page.locator('.board__cell')).toHaveCount(mode.size * mode.size)

      await expectNoOverflow(page, `${mode.label} 终局`)
      expect(problems, `${mode.label} 终局有控制台错误`).toEqual([])
    })
  }

  for (const mode of MODES) {
    test(`${mode.label}：长数值落在字号档位上，每一位都还读得清、不溢出格子`, async ({ page }) => {
      await page.goto(startUrl(showcaseFixture(mode)))
      await startRun(page, mode)
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
          await startRun(page, mode)
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
  /**
   * 「方块上有没有看得见的投影」。
   *
   * **不能用 `boxShadow !== 'none'` 当判据**：board.css 给方块永远留着一个 box-shadow 槽
   * （`var(--tile-elevation, 0 0 #0000)`），兜底值是**全透明**的一层——因为拾取环要与主题
   * 自己的 elevation 合成同一层，两者不能互相顶掉（board.css 里那段说明）。于是没声明
   * `--tile-elevation` 的风格 computed 出来是 `rgba(0, 0, 0, 0) 0px 0px 0px 0px`，
   * **永远不等于 'none'**，那个写法会把 Classic / Claude 误判成「有投影」。
   * 实测（探针）：三套里只有 Material 声明了这个变量，另两套读出来是空串。
   *
   * 真判据是「这一层看不看得见」：颜色有没有不透明度。带颜色的层哪怕半透明也算。
   */
  function hasVisibleShadow(shadow: string): boolean {
    if (shadow === 'none') return false
    return !/rgba?\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(shadow)
  }

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
      // 纸面照 tokens.css / DESIGN.md §2 / contrast.json 的 #f0eee6（= 240,238,230）。
      // 这里原来写 226，是把 e6 抄成 e2，与那三处都对不上
      page: 'rgb(240, 238, 230)',
      font: 'Source Sans 3',
      board: { background: 'rgb(250, 248, 242)', elevation: false, rule: true },
      control: 'rgb(240, 238, 230)',
      tile: { family: 'Playfair Display', weight: '700', numeric: ['lining-nums', 'tabular-nums'] },
      tileElevation: false,
    },
  }

  for (const theme of STYLES) {
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
      expect(hasVisibleShadow(tile.shadow), `${theme.label} 的方块投影与设计卡不符`).toBe(
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
