import { expect, test, type Page } from '@playwright/test'
import { STYLE_CATALOG, type StyleId } from '../../src/shared/styleCatalog'

/**
 * 结果层的**共享契约**：同一套断言对三套风格各跑一遍（ADR-0008 · T26）。
 *
 * 接的是 toast 契约那条既有缝（toast-contract.spec.ts）：三份实现必然漂移，唯一能防
 * 漂移的就是同一套断言跑三遍。所以这个文件里没有一句「Classic 会这样、Material 会那样」
 * 的分叉——三套风格的差别只通过「各自的 token」体现，而断言断的是同一组不变量：
 *
 *   1. 遮罩三个阶段都半透明，强度按 stuck（最亮）→ won → ended（最暗）排列；
 *   2. 卡片不透明（文字与按钮的对比度因此与改动前逐字节相同）；
 *   3. 棋盘留在文档里，格子一枚不少、终局数值不变；
 *   4. 这一层的矩形与棋盘逐像素相同、`z-index: 3` 不变、照旧把指针接得牢牢的；
 *   5. 四项读数齐全且数值正确；最高分按「结算那一刻的风格」归属；
 *   6. 交换拾取期间整层隐藏，收摊后回来。
 *
 * 局面确定性来自 `?seed=` + `?board=` + `?score=`（开局夹具）：四个 1024 一次左移合出
 * 两个 2048（达标），一副右端留空的满局一次右移即死局。每一步仍走真实按键与真实内核。
 *
 * **这个文件不断的事**（边界写清楚，免得读的人以为它证了更多）：
 *   · 遮罩「看起来」有没有让棋盘退后——那是眼睛的活（设计卡 §6 用文字回答），
 *     这里只证明三档 alpha 的顺序；
 *   · 撤销让步数减一——撤销会把 phase 也搬回 playing，结果层当场不在画面上，
 *     只能由 tests/unit/result-readout.test.ts 证。
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
 * 空出来的是 (0,0)，生成那一格后 16 格全满且横向纵向相邻都不相等——与
 * run-endings.spec.ts 同款。这一动没有合并，所以分数一步不涨。
 */
const ONE_STEP_FROM_DEADLOCK: (number | null)[][] = [
  [8, 2, 4, null],
  [8, 2, 4, 8],
  [2, 4, 8, 2],
  [4, 8, 2, 4],
]

/**
 * **一步既达标、又是最后一步合法移动**（`won → stuck` 连击的夹具）。
 *
 * 一次下移把第 3 列那两个 1024 合成 2048（第一次达标），空出来的是 (0,3)，生成那一格后
 * 16 格全满。全盘只用 8 / 16 / 1024 三个值，新落的方块只可能是 2 或 4——它与任何一格都
 * 合不上，所以「生成落在哪、值是多少」都不影响死局判定（已拿 60 个种子逐个验过：这一手
 * 之后 phase 恒为 won，且恒为死局）。于是这条用例与 seed 无关，不需要把 seed 写进断言。
 */
const WIN_THEN_DEADLOCK: (number | null)[][] = [
  [8, 16, 8, 1024],
  [16, 8, 16, 1024],
  [8, 16, 8, 16],
  [16, 8, 16, 8],
]

/** 这一局开局的分数：两局要用两个认得出来的数，一个 500 一个 250 */
const FIRST_RUN_SCORE = 500
const SECOND_RUN_SCORE = 250

/** 收集 console / page 错误：新的渲染路径上若有 React 警告要当场看见 */
function watchProblems(page: Page): string[] {
  const problems: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  return problems
}

/** 开局：选风格 → 开始游戏 */
async function startRun(
  page: Page,
  styleId: StyleId,
  label: string,
  rows: (number | null)[][],
  score = 0
): Promise<void> {
  await page.goto(startUrl(rows, score))
  await page.getByRole('group', { name: '风格' }).getByRole('button', { name: label }).click()
  await expect(page.locator('main')).toHaveAttribute('data-style', styleId)
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()
}

/** 一步达标：左移合出两个 2048 → 胜利里程碑 */
async function reachWin(page: Page): Promise<void> {
  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('[data-panel="win"]')).toBeVisible()
}

/** 一步走死：右移铺满 16 格 → 死局（还没决定的那一档） */
async function reachStuck(page: Page): Promise<void> {
  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-panel="gameover"]')).toBeVisible()
}

/** 收摊：死局那一层上「结束并记录」 → ended */
async function settleFromStuck(page: Page): Promise<void> {
  await page.locator('[data-panel="gameover"]').getByRole('button', { name: '结束并记录' }).click()
  await expect(page.locator('[data-result-tier="ended"]')).toBeVisible()
}

/** 遮罩的计算背景色（原样字符串，调用方自己解 alpha） */
async function scrimBackground(page: Page): Promise<string> {
  return page.locator('.overlay__scrim').evaluate((element) => getComputedStyle(element).backgroundColor)
}

/** 'rgba(29, 27, 32, 0.3)' → 0.3。读不出来直接抛：宁可红，也不要拿一个错颜色比出个好看的数 */
function alphaOf(colour: string): number {
  const parts = /rgba?\(([^)]+)\)/.exec(colour)
  if (parts === null) throw new Error(`认不出的颜色：${colour}`)
  const channels = parts[1].split(',').map((part) => Number(part.trim()))
  return channels.length === 4 ? channels[3] : 1
}

/** 从 DOM 还原棋盘：棋盘是固定结构，格子在就表示有方块 */
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

/** 四项读数那一段的文字（去掉空白后逐项对，行内怎么折都不断言） */
async function readoutText(page: Page): Promise<string> {
  const text = await page.locator('.overlay__readout').innerText()
  return text.replace(/\s+/g, '')
}

/**
 * 一次真手势：起手在棋盘正中，按 dx / dy 划出去。
 *
 * 用 page.mouse 而不是 touchscreen：识别器接的是 pointerdown / pointerup，而 Chromium 对
 * 鼠标也派发这一对（tests/e2e/touch.spec.ts 的同一条理由）。
 */
async function swipe(page: Page, dx: number, dy: number): Promise<void> {
  const box = await page.locator('[data-board]').boundingBox()
  if (box === null) throw new Error('棋盘不在 DOM 里')
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 8 })
  await page.mouse.up()
}

/** 一帧上读到的东西。进场与退场用同一把尺子量，所以只有一张形状 */
interface MotionFrame {
  cardOpacity: number
  cardTransform: string
  cardAnimation: string
  scrimAnimation: string
  titleAnimation: string
}

/**
 * 在**同一个 evaluate** 里触发一次输入，然后在若干帧上读回计算样式与动画事件。
 *
 * 为什么必须同一个 evaluate：进场与退场各只有 150ms，来回一次 CDP 就把窗口错过了。而
 * 退场那一帧尤其重要——`data-result-leaving` 必须在 phase 变的那一次提交里就落在 DOM 上
 * （ADR-0008 的架构决策 9），分两次调用的话读到的可能是「层还在、还接指针」的中间态，
 * 也可能层已经没了，两种都测不到想测的那一帧。
 *
 * 两处实现上的坑，都是实测出来的：
 *
 *   1. **监听挂在 document 上，不挂在元素上**。合成事件派发出去之后 React 还没提交
 *      （`querySelector` 当场是 0 个），挂在元素上会挂到空集上；而动画事件是**冒泡**的，
 *      挂在 document 上先后都能收到，于是不必跟提交时机赛跑。
 *   2. **帧数要盖过最慢的那条动画**。进场那一轮里胜利标题是关键帧 180ms，比卡片自己的
 *      150ms 长——取样太短就看不到 `end` 事件，会误判成「没放完」。
 *
 * `trigger` 为 null = 什么都不触发，只采现在已经挂在场上的那一层（reduced-motion 用）。
 */
async function watchMotion(
  page: Page,
  trigger: { key: string } | { click: string } | null,
  frames: number
): Promise<{ frames: MotionFrame[]; events: string[] }> {
  return page.evaluate(
    async (options: { trigger: { key: string } | { click: string } | null; frames: number }) => {
      if (options.trigger !== null && 'key' in options.trigger) {
        window.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: options.trigger.key,
            bubbles: true,
            cancelable: true,
          })
        )
      } else if (options.trigger !== null && 'click' in options.trigger) {
        const name = options.trigger.click
        const button = [...document.querySelectorAll<HTMLElement>('.overlay__card .control')].find(
          (element) => element.textContent?.trim() === name
        )
        button?.click()
      }
      const events: string[] = []
      const record =
        (kind: string) =>
        (event: Event): void => {
          const animation = event as AnimationEvent
          const target = event.target
          events.push(
            `${kind}:${animation.animationName}@${target instanceof Element ? target.className : '?'}`
          )
        }
      document.addEventListener('animationstart', record('start'))
      document.addEventListener('animationend', record('end'))
      document.addEventListener('animationcancel', record('cancel'))
      const sampled: MotionFrame[] = []
      await new Promise<void>((resolve) => {
        const tick = (): void => {
          const card = document.querySelector<HTMLElement>('.overlay__card')
          const scrim = document.querySelector<HTMLElement>('.overlay__scrim')
          const title = document.querySelector<HTMLElement>('.overlay__title')
          const cardStyle = card === null ? null : getComputedStyle(card)
          const scrimStyle = scrim === null ? null : getComputedStyle(scrim)
          const titleStyle = title === null ? null : getComputedStyle(title)
          sampled.push({
            cardOpacity: cardStyle === null ? -1 : Number(cardStyle.opacity),
            cardTransform: cardStyle === null ? 'missing' : cardStyle.transform,
            cardAnimation: cardStyle === null ? 'missing' : cardStyle.animationName,
            scrimAnimation: scrimStyle === null ? 'missing' : scrimStyle.animationName,
            titleAnimation: titleStyle === null ? 'missing' : titleStyle.animationName,
          })
          if (sampled.length >= options.frames) resolve()
          else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
      return { frames: sampled, events }
    },
    { trigger, frames }
  )
}

/** 从 computed transform 里取出平移的 y 分量（px）。没有位移就是 0 */
function translateY(transform: string): number {
  const parts = /matrix\(([^)]+)\)/.exec(transform)
  if (parts === null) return 0
  const values = parts[1].split(',').map((value) => Number(value.trim()))
  return values[5] ?? 0
}

for (const style of STYLE_CATALOG) {
  test.describe(`${style.label} · 结果层的共享契约`, () => {
    test('三档遮罩都半透明，强度按 stuck → won → ended 变暗', async ({ page }) => {
      const problems = watchProblems(page)

      // 一档一次开局：三个阶段互不相遇（won 与 stuck 各自是一次真实的按键序列），
      // 与其在一页里绕来绕去，不如把每次的来路写清楚
      await startRun(page, style.id, style.label, ONE_STEP_FROM_DEADLOCK, FIRST_RUN_SCORE)
      await reachStuck(page)
      await expect(page.locator('[data-result-tier]')).toHaveAttribute('data-result-tier', 'stuck')
      const stuck = await scrimBackground(page)

      await startRun(page, style.id, style.label, FOUR_1024, FIRST_RUN_SCORE)
      await reachWin(page)
      await expect(page.locator('[data-result-tier]')).toHaveAttribute('data-result-tier', 'won')
      const won = await scrimBackground(page)

      await startRun(page, style.id, style.label, ONE_STEP_FROM_DEADLOCK, FIRST_RUN_SCORE)
      await reachStuck(page)
      await settleFromStuck(page)
      const ended = await scrimBackground(page)

      const stuckAlpha = alphaOf(stuck)
      const wonAlpha = alphaOf(won)
      const endedAlpha = alphaOf(ended)
      // 三档都半透明：全透明等于没遮罩，全不透明等于回到改动前
      for (const [tier, alpha] of [
        ['stuck', stuckAlpha],
        ['won', wonAlpha],
        ['ended', endedAlpha],
      ] as const) {
        expect(alpha, `${style.label} 的 ${tier} 遮罩不是半透明的：${alpha}`).toBeGreaterThan(0)
        expect(alpha, `${style.label} 的 ${tier} 遮罩不是半透明的：${alpha}`).toBeLessThan(1)
      }
      // 强度按「还剩多少决定可做」排：死局最亮（要看清棋盘才选得出撤销还是交换）、
      // 达标居中、结算最暗（什么都不用决定了）
      expect(
        stuckAlpha < wonAlpha && wonAlpha < endedAlpha,
        `${style.label} 的三档顺序不对：stuck ${stuckAlpha} / won ${wonAlpha} / ended ${endedAlpha}`
      ).toBe(true)

      expect(problems).toEqual([])
    })

    test('卡片不透明；棋盘留在文档里，格子一枚不少、终局数值不变；几何与 z-index 不变', async ({
      page,
    }) => {
      const problems = watchProblems(page)
      await startRun(page, style.id, style.label, ONE_STEP_FROM_DEADLOCK, FIRST_RUN_SCORE)
      await reachStuck(page)
      // 结算之前的盘面抄下来：结算不许动一个格子
      const boardAtStuck = await readBoard(page)

      await settleFromStuck(page)

      // 卡片不透明——这一条是整套改动的底气所在：文字与按钮的对比度因此可测
      const cardBackground = await page
        .locator('.overlay__card')
        .evaluate((element) => getComputedStyle(element).backgroundColor)
      expect(alphaOf(cardBackground), `${style.label} 的卡片不是不透明的`).toBe(1)

      // 棋盘仍在文档里：16 格一枚不少，终局数值逐格相同
      await expect(page.locator('[data-board]')).toBeVisible()
      await expect(page.locator('.board__cell')).toHaveCount(16)
      await expect(page.locator('[data-tile-id]')).toHaveCount(16)
      expect(await readBoard(page)).toEqual(boardAtStuck)
      await expect(page.locator('[data-score]')).toHaveText(String(FIRST_RUN_SCORE))

      // 几何与 z-order：这一层仍是棋盘那个 absolute / inset:0 的兄弟节点，
      // 矩形逐像素相同，仍然坐在棋盘上面。tile-motion.spec.ts 与
      // task-23-matrix.spec.ts 那两条契约断言的就是这一件事，这里换一套 viewport 再断一次
      const geometry = await page.evaluate(() => {
        const round = (value: number): number => Math.round(value * 10) / 10
        const box = (selector: string): { x: number; y: number; width: number; height: number } | null => {
          const element = document.querySelector(selector)
          if (element === null) return null
          const rect = element.getBoundingClientRect()
          return { x: round(rect.x), y: round(rect.y), width: round(rect.width), height: round(rect.height) }
        }
        const overlay = document.querySelector<HTMLElement>('[data-result-tier]')
        return {
          position: overlay === null ? 'none' : getComputedStyle(overlay).position,
          zIndex: overlay === null ? '' : getComputedStyle(overlay).zIndex,
          board: box('[data-board]'),
          overlay: box('[data-result-tier]'),
        }
      })
      expect(geometry.position, `${style.label}：结果层必须脱离布局，否则它会推走棋盘`).toBe(
        'absolute'
      )
      expect(geometry.zIndex, `${style.label}：结果层的 z-index 必须仍是 3`).toBe('3')
      expect(geometry.overlay, `${style.label}：结果层的矩形必须与棋盘逐像素相同`).toEqual(
        geometry.board
      )

      // 层挂着的时候不横向溢出。卡片比改动前多了两行（读数 + 新纪录标记），Claude 的
      // 卡片内边距又是三套里最大的 1.75rem——「矩形等于棋盘」只证明它不推布局，
      // 不证明它没顶出视口，所以这一条要单独量（task-23-matrix.spec.ts 的
      // expectNoOverflow 只在 playing 态被调用）
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      expect(
        overflow.scrollWidth,
        `${style.label}：结果层挂着时页面横向溢出（${overflow.scrollWidth} > ${overflow.clientWidth}）`
      ).toBeLessThanOrEqual(overflow.clientWidth)

      // 遮罩照旧把指针接得牢牢的——这正是「交换拾取期间要收起整层」那条分支的理由
      // （半透明不改变「看得见」与「点得到」是两件事）。取样点取棋盘上沿正中的那条窄条：
      // 卡片比棋盘矮，这一条必然是遮罩，与卡片有多大、棋盘多小都无关
      const intercepted = await page.evaluate(() => {
        const board = document.querySelector<HTMLElement>('[data-board]')
        const scrim = document.querySelector<HTMLElement>('.overlay__scrim')
        const card = document.querySelector<HTMLElement>('.overlay__card')
        if (board === null || scrim === null || card === null) return null
        const boardRect = board.getBoundingClientRect()
        const cardRect = card.getBoundingClientRect()
        const point = document.elementFromPoint(
          boardRect.left + boardRect.width / 2,
          (boardRect.top + cardRect.top) / 2
        )
        return {
          topIsScrim: point === scrim,
          topReachesPanel: point instanceof Element && point.closest('[data-result-tier]') !== null,
        }
      })
      expect(intercepted?.topReachesPanel, `${style.label}：棋盘角落那一击没有落在结果层上`).toBe(
        true
      )
      expect(intercepted?.topIsScrim, `${style.label}：角落那一击应该被遮罩接住`).toBe(true)

      expect(problems).toEqual([])
    })

    test('四项读数齐全且数值正确', async ({ page }) => {
      const problems = watchProblems(page)
      // 第一局（这个浏览器上下文里还没有任何记录）：500 分、一步、于是破纪录
      await startRun(page, style.id, style.label, ONE_STEP_FROM_DEADLOCK, FIRST_RUN_SCORE)
      await reachStuck(page)
      await settleFromStuck(page)

      // 四件都在，且顺序是 分数 / 最高分 / 步数
      await expect(page.locator('.overlay__readout dt')).toHaveText(['分数', '最高分', '步数'])
      await expect(page.locator('.overlay__readout dd')).toHaveText([
        String(FIRST_RUN_SCORE),
        String(FIRST_RUN_SCORE),
        '1',
      ])
      // 一行话的新纪录标记（这一局把 0 破成了 500）
      await expect(page.locator('.overlay__record')).toHaveText('本局刷新了最高分')

      // 标签是小字注脚，不是大字主角：正文那句仍比它大一档
      const sizes = await page.evaluate(() => {
        const readout = document.querySelector<HTMLElement>('.overlay__readout')
        const sentence = document.querySelector<HTMLElement>('.overlay__text')
        if (readout === null || sentence === null) return null
        return {
          readout: parseFloat(getComputedStyle(readout).fontSize),
          sentence: parseFloat(getComputedStyle(sentence).fontSize),
        }
      })
      expect(sizes?.readout).toBeLessThan(sizes?.sentence ?? 0)

      // 标题、那一句话、四个按钮一字未改（T26 的验收标准：卡片只添读数）
      await expect(page.locator('[data-panel="gameover"]').getByRole('heading')).toHaveText(
        '本局已结束'
      )
      await expect(page.locator('.overlay__text')).toHaveText('死局：四方向都无合法移动')
      await expect(page.locator('[data-panel="gameover"]').getByRole('button')).toHaveText([
        '新游戏',
      ])

      expect(problems).toEqual([])
    })

    test('最高分按结算那一刻的风格归属：未结算跟当前风格，结算之后跟结算风格', async ({
      page,
    }) => {
      const problems = watchProblems(page)
      const other = STYLE_CATALOG.find((entry) => entry.id !== style.id) as
        | (typeof STYLE_CATALOG)[number]
        | undefined
      expect(other, '目录里应该还有第二套风格').toBeDefined()

      // 第一局：本风格 500 分收工 → 这一格的记录是 500
      await startRun(page, style.id, style.label, ONE_STEP_FROM_DEADLOCK, FIRST_RUN_SCORE)
      await reachStuck(page)
      await settleFromStuck(page)
      await expect(page.locator('.overlay__readout')).toContainText(`最高分${FIRST_RUN_SCORE}`)
      await expect(page.locator('.overlay__record')).toHaveText('本局刷新了最高分')

      // 第二局换另一套风格、换个分数。**重开一次页面**而不是点「新游戏」：后者抽的是
      // 随机开盘局面，没法再一步走死；而刷新之后战绩桶照旧读得回来（T16），于是
      // 「第一局那 500」仍然盘上躺着，正好当这一局的对照组。
      await startRun(page, other?.id ?? style.id, other?.label ?? style.label, ONE_STEP_FROM_DEADLOCK, SECOND_RUN_SCORE)
      await reachStuck(page)

      // 还没结算：读数是**当前风格**的记录（另一套一条都没有 = 0），不是上一局留在
      // 本风格的那 500。分数与步数都对着这一局
      expect(await readoutText(page)).toBe(`分数${SECOND_RUN_SCORE}最高分0步数1`)
      // 250 > 0：未结算也照着当前那条记录判新纪录，于是标记在场
      await expect(page.locator('.overlay__record')).toHaveText('本局刷新了最高分')

      await settleFromStuck(page)
      // 结算之后换回本风格去：这一局归的是另一套，读数仍读**结算那一刻**的那一套
      // （250），不是当前这一套的 500——两者都不同，所以哪一边都不含糊
      await page
        .getByRole('group', { name: '风格' })
        .getByRole('button', { name: style.label })
        .click()
      await expect(page.locator('main')).toHaveAttribute('data-style', style.id)
      expect(await readoutText(page)).toBe(`分数${SECOND_RUN_SCORE}最高分${SECOND_RUN_SCORE}步数1`)

      expect(problems).toEqual([])
    })

    test('交换拾取期间整层隐藏，收摊后回来', async ({ page }) => {
      const problems = watchProblems(page)
      await startRun(page, style.id, style.label, ONE_STEP_FROM_DEADLOCK, FIRST_RUN_SCORE)
      await reachStuck(page)
      await expect(page.locator('[data-result-tier]')).toBeVisible()

      // 死局那一层上的「交换」：整层收起。遮罩照旧斥指针，收起是它唯一的出路
      await page
        .locator('[data-panel="gameover"]')
        .getByRole('button', { name: '交换' })
        .click()
      await expect(page.locator('[data-result-tier]')).toHaveCount(0)
      await expect(page.locator('.overlay__scrim')).toHaveCount(0)
      await expect(page.getByText('请选择第一枚方块，Esc 退出')).toBeVisible()
      // 挑得到方块：那一层真的不在挡着
      await expect(page.locator('.board__tile[data-selectable="true"]')).toHaveCount(16)

      // Esc 取消拾取：phase 仍是 stuck，结果层自己回来
      await page.keyboard.press('Escape')
      await expect(page.locator('[data-result-tier="stuck"]')).toBeVisible()
      await expect(page.locator('.overlay__scrim')).toHaveCount(1)

      expect(problems).toEqual([])
    })

    test('进场与退场都播：150ms + ease-out，两段各自己开始、自己收尾，没有取消', async ({
      page,
    }) => {
      const problems = watchProblems(page)
      await startRun(page, style.id, style.label, FOUR_1024, FIRST_RUN_SCORE)

      // 进场：那一下左移与读 DOM 在同一个 evaluate 里，于是第一帧就是层刚挂上那一刻。
      // 22 帧（约 360ms）是刻意盖过胜利标题那 180ms 的——比它短就看不到 `end` 事件
      const entry = await watchMotion(page, { key: 'ArrowLeft' }, 22)
      expect(entry.frames[0]?.cardAnimation, `${style.label}：卡片没有播进场动画`).toBe(
        'result-card-in'
      )
      expect(entry.frames[0]?.scrimAnimation, `${style.label}：遮罩没有播进场动画`).toBe(
        'result-fade-in'
      )
      // 第一帧就是关键帧的起点，不是可见的基础态（T21 在胜利标题上踩过的那个坑：
      // 加一道 rAF 状态门控，可见的底色会先画一帧再闪隐。这里用关键帧动画，不需要门控）
      expect(Number(entry.frames[0]?.cardOpacity), `${style.label}：基础态先画了一帧`).toBeLessThan(
        1
      )
      // 升起约 4px，落点是 0
      expect(translateY(entry.frames[0]?.cardTransform ?? '')).toBeGreaterThan(0)
      expect(translateY(entry.frames[0]?.cardTransform ?? '')).toBeLessThanOrEqual(4)
      // 最后一帧卡片还在场上（`translateY` 对 'missing' 返回 0，不断这一句它会被空过）
      expect(entry.frames.at(-1)?.cardAnimation, `${style.label}：进场还没播完层就没了`).toBe(
        'result-card-in'
      )
      expect(translateY(entry.frames.at(-1)?.cardTransform ?? 'missing')).toBe(0)
      // 淡入：至少有一帧不透明、且最终到 1
      expect(entry.frames.some((frame) => frame.cardOpacity === 1)).toBe(true)
      // 胜利标题那条关键帧**照旧附着在第一次渲染上**（T21 的结论不许回归：不加 rAF 状态
      // 门控，否则可见的基础态会先画一帧再闪隐）。它与卡片自己的淡入叠在一起各自动各的，
      // 这就是「合成」二字的全部含义——两段动画在两个元素上，互不取消
      expect(entry.frames[0]?.titleAnimation, `${style.label}：胜利标题的关键帧没附着上`).toBe(
        'win-panel-title-enter'
      )
      expect(entry.events).toContain('start:win-panel-title-enter@overlay__title')
      // 每一条动画都自己开始、自己结束，没有一条被取消
      expect(entry.events).toContain('start:result-card-in@overlay__card')
      expect(entry.events).toContain('end:result-card-in@overlay__card')
      expect(entry.events).toContain('start:result-fade-in@overlay__scrim')
      expect(entry.events).toContain('end:result-fade-in@overlay__scrim')
      expect(entry.events.filter((event) => event.startsWith('cancel:'))).toEqual([])
      // 时长与曲线就是项目为方块定下的那一套（T21 记成的共享姿态），三套风格一个数
      const timing = await page.evaluate(() => {
        const read = (selector: string): { duration: string; easing: string } => {
          const style = getComputedStyle(document.querySelector(selector) as Element)
          return { duration: style.animationDuration, easing: style.animationTimingFunction }
        }
        return { card: read('.overlay__card'), scrim: read('.overlay__scrim') }
      })
      expect(timing.card, `${style.label}：卡片的节奏不是共享的那一套`).toEqual({
        duration: '0.15s',
        easing: 'ease-out',
      })
      expect(timing.scrim, `${style.label}：遮罩的节奏不是共享的那一套`).toEqual({
        duration: '0.15s',
        easing: 'ease-out',
      })

      // 退场：「继续玩」那一下与读 DOM 同样在同一个 evaluate 里
      const exit = await watchMotion(page, { click: '继续玩' }, 12)
      expect(exit.frames[0]?.cardAnimation, `${style.label}：卡片没有播退场动画`).toBe(
        'result-card-out'
      )
      expect(exit.frames[0]?.scrimAnimation, `${style.label}：遮罩没有播退场动画`).toBe(
        'result-fade-out'
      )
      // 往下沉约 2px：至少有一帧的卡片真的在往下走（进场那一轮是由 4px 升到 0，这一轮
      // 是从 0 沉到 2px——两条曲线方向相反，才读得出「来了又走了」而不是原地放大缩小）
      const sank = exit.frames.map((frame) => translateY(frame.cardTransform))
      expect(Math.max(...sank), `${style.label}：退场没有往下沉`).toBeGreaterThan(0)
      expect(Math.max(...sank), `${style.label}：退场沉得比 2px 还多`).toBeLessThanOrEqual(2)
      // 真的在淡出：至少有一帧的卡片已经不透明了（不是「当场消失」那种硬切）。
      // 为什么不断言「淡到 0」：150ms 到点那一帧层正好被摘掉，opacity 0 与「不在 DOM 里」
      // 是同一帧的两件事，采样永远踩不到那个 0——所以终点由下面那条「层不在了」说
      expect(exit.frames.some((frame) => frame.cardOpacity >= 0 && frame.cardOpacity < 1)).toBe(
        true
      )
      expect(exit.events).toContain('start:result-card-out@overlay__card')
      expect(exit.events).toContain('start:result-fade-out@overlay__scrim')
      expect(exit.events.filter((event) => event.startsWith('cancel:'))).toEqual([])
      // 为什么没有 `end:result-card-out`：层是在动画放完的同一刻被摘掉的，而 Chromium 对
      // 「元素带着填充中的动画被移出文档」不发 animationend（也不发 cancel，实测两条都
      // 没有）。所以「放完了」不能靠 end 事件说，要靠下面这两条：摘掉之前那一帧的卡片
      // 已经淡到几乎看不见（没有「当场消失」的硬切），且层确实不在 DOM 里了
      const present = exit.frames.filter((frame) => frame.cardOpacity >= 0)
      expect(
        present.at(-1)?.cardOpacity,
        `${style.label}：卡片没淡完就被摘掉了，那一下会看见一次跳变`
      ).toBeLessThan(0.2)
      // 退场播完层就不在 DOM 里了（卡片那条动画一结束 ResultPresence 就把它摘掉，
      // 不是靠 CSS 把 opacity 摁在 0 上藏着）
      expect(exit.frames.at(-1)?.cardAnimation, `${style.label}：退场播完层还在 DOM 里`).toBe(
        'missing'
      )

      expect(problems).toEqual([])
    })

    test('退场第一帧就把指针与键盘都还给棋盘', async ({ page }) => {
      const problems = watchProblems(page)
      await startRun(page, style.id, style.label, FOUR_1024, FIRST_RUN_SCORE)
      await reachWin(page)

      // 「继续玩」那一下与读 DOM 在同一个 evaluate：相位变的同一次提交里，层必须已经
      // 标着退场、且不再接指针（ADR-0008 的架构决策 9）
      const frame = await page.evaluate(
        () =>
          new Promise<{
            tier: string | null
            leaving: string | null
            pointerEvents: string
            hitIsLayer: boolean
          }>((resolve) => {
            const button = [
              ...document.querySelectorAll<HTMLElement>('[data-panel="win"] .control'),
            ].find((element) => element.textContent?.trim() === '继续玩')
            button?.click()
            requestAnimationFrame(() => {
              const section = document.querySelector<HTMLElement>('[data-result-tier]')
              const board = document.querySelector<HTMLElement>('[data-board]')
              const rect = board === null ? null : board.getBoundingClientRect()
              // 取样点取棋盘上沿正中的窄条：卡片比棋盘矮，这一条必然是遮罩——与上面
              // 那条「遮罩照旧接指针」同一个位置，与卡片多大、棋盘多小都无关
              const hit =
                rect === null
                  ? null
                  : document.elementFromPoint(rect.left + rect.width / 2, rect.top + 4)
              // 退场第一帧就按方向键：键盘本来就跟着 phase 放行，这里证的是「没有那 150ms」
              window.dispatchEvent(
                new KeyboardEvent('keydown', {
                  key: 'ArrowLeft',
                  bubbles: true,
                  cancelable: true,
                })
              )
              resolve({
                tier: section?.getAttribute('data-result-tier') ?? null,
                leaving: section?.getAttribute('data-result-leaving') ?? null,
                pointerEvents: section === null ? '' : getComputedStyle(section).pointerEvents,
                hitIsLayer:
                  hit instanceof Element && hit.closest('[data-result-tier]') !== null,
              })
            })
          })
      )

      // 层还在 DOM 里（退场要播 150ms），并且**标着退场**
      expect(frame.tier).toBe('won')
      expect(frame.leaving).toBe('true')
      // 而它已经不接指针了：这一条是本票最重要的一句
      expect(frame.pointerEvents, `${style.label}：退场中的层还在接指针`).toBe('none')
      // 同一件事的第二种说法：那一点上最上面已经不是这一层了
      expect(frame.hitIsLayer, `${style.label}：退场中的遮罩还挡在棋盘上`).toBe(false)
      // 键盘当场推得动：两个 2048 合成 4096（8692 = 500 + 2048 + 2048 + 4096）
      await expect(page.locator('[data-score]')).toHaveText(String(FIRST_RUN_SCORE + 2048 + 2048 + 4096))
      // 退场播完，层不在 DOM 里
      await expect(page.locator('[data-result-tier]')).toHaveCount(0)
      // 再补一刀真手势：指针那条路也真的还给了棋盘（往下划一定合法——4096 不在底行）
      const beforeSwipe = await readBoard(page)
      await swipe(page, 0, 120)
      expect(await readBoard(page)).not.toEqual(beforeSwipe)

      expect(problems).toEqual([])
    })

    test('reduced-motion：卡片上一个位移都没有，层照旧出现与消失、棋盘照旧能推', async ({
      browser,
    }) => {
      // 用户故事 13：要求「少一点动」的玩家仍然看得见层、仍然走得动、数字照旧可读。
      // 所以这里同时断言「位移没了」与「功能都在」两件事
      const context = await browser.newContext({ reducedMotion: 'reduce' })
      const page = await context.newPage()
      const problems = watchProblems(page)
      try {
        await startRun(page, style.id, style.label, ONE_STEP_FROM_DEADLOCK, FIRST_RUN_SCORE)
        await page.locator('[data-board]').focus()
        await page.keyboard.press('ArrowRight')

        // 进场：只淡入，不位移
        const entry = await watchMotion(page, null, 8)
        expect(entry.frames[0]?.cardAnimation).toBe('result-fade-in')
        for (const frame of entry.frames) {
          expect(frame.cardTransform, `${style.label}：reduced-motion 下卡片仍在位移`).toBe('none')
        }
        // 层照旧出现：遮罩仍是半透明的那一档（三档顺序由上面那条用例管，这里只证明
        // 「淡入」没有把遮罩一起关掉），读数照旧在
        await expect(page.locator('[data-result-tier="stuck"]')).toBeVisible()
        const alpha = alphaOf(await scrimBackground(page))
        expect(alpha, `${style.label}：reduced-motion 下遮罩不见了`).toBeGreaterThan(0)
        expect(alpha, `${style.label}：reduced-motion 下遮罩变成不透明`).toBeLessThan(1)
        await expect(page.locator('.overlay__readout dd').first()).toHaveText(
          String(FIRST_RUN_SCORE)
        )

        // 退场：同样只淡出
        const exit = await watchMotion(page, { click: '撤销' }, 8)
        expect(exit.frames[0]?.cardAnimation).toBe('result-fade-out')
        for (const frame of exit.frames) {
          expect(frame.cardTransform, `${style.label}：reduced-motion 下退场仍在位移`).toBe('none')
        }
        // 层照旧消失（撤销把 phase 搬回 playing）
        await expect(page.locator('[data-result-tier]')).toHaveCount(0)

        // 棋盘照旧推得动：再走一次右移，16 格铺满、又回到死局那一层
        await page.locator('[data-board]').focus()
        await page.keyboard.press('ArrowRight')
        await expect(page.locator('[data-tile-id]')).toHaveCount(16)
        await expect(page.locator('[data-result-tier="stuck"]')).toBeVisible()

        expect(problems).toEqual([])
      } finally {
        await context.close()
      }
    })

    test('won 继续玩直接掉进 stuck：胜利层先退场，死局层再进场', async ({ page }) => {
      const problems = watchProblems(page)
      await startRun(page, style.id, style.label, WIN_THEN_DEADLOCK, FIRST_RUN_SCORE)
      await page.locator('[data-board]').focus()
      // 一次下移既合出 2048（第一次达标），又把 16 格铺满
      await page.keyboard.press('ArrowDown')
      await expect(page.locator('[data-result-tier="won"]')).toBeVisible()

      // 引擎的 continueRun 是**一个**纯迁移：这一下提交里 won 直接变成 stuck，中间没有
      // 「playing」那一帧。所以两段相接全靠层自己接住（架构决策 10）
      const frame = await page.evaluate(
        () =>
          new Promise<{ tier: string | null; leaving: string | null; pointerEvents: string }>(
            (resolve) => {
              const button = [
                ...document.querySelectorAll<HTMLElement>('[data-panel="win"] .control'),
              ].find((element) => element.textContent?.trim() === '继续玩')
              button?.click()
              requestAnimationFrame(() => {
                const section = document.querySelector<HTMLElement>('[data-result-tier]')
                resolve({
                  tier: section?.getAttribute('data-result-tier') ?? null,
                  leaving: section?.getAttribute('data-result-leaving') ?? null,
                  pointerEvents: section === null ? '' : getComputedStyle(section).pointerEvents,
                })
              })
            }
          )
      )
      // 胜利层在退场，且当场就不接指针
      expect(frame.tier).toBe('won')
      expect(frame.leaving).toBe('true')
      expect(frame.pointerEvents).toBe('none')

      // 退场播完之后，**当前**那一层是死局：没有任何一个被宣告为当前的旧层
      const stuck = page.locator('[data-result-tier="stuck"]')
      await expect(stuck).toBeVisible()
      await expect(stuck).not.toHaveAttribute('data-result-leaving', 'true')
      await expect(page.locator('[data-panel="win"]')).toHaveCount(0)
      // 死局这一档重新接指针：它正在等玩家选撤销、交换还是认命
      expect(await stuck.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe(
        'auto'
      )
      // 死局层的四个按钮都在，撤销摆在最前
      await expect(stuck.getByRole('button').first()).toHaveText('撤销')

      expect(problems).toEqual([])
    })

    // 回归：退场的终点只认**卡片自己**的动画结束事件。
    //
    // `animationend` 会冒泡，而胜利标题那一条 180ms 关键帧长在 `.overlay__title` 上、正是
    // 这张卡片的后代，且比卡片那一条长 30ms。第一版只在卡片上挂 onAnimationEnd 而不看
    // `event.target`：玩家在胜利层出现后 150–180ms 内点「继续玩」时，标题那一条会代替卡片的
    // 退场把层摘掉——退场只播了约 130ms，卡片剩一截透明度凭空消失。
    //
    // 这条用例**不靠墙钟**：合成一个从标题冒泡上来的 animationend，看层有没有被摘。判据由
    // 事件本身定，于是它不会因为机器快慢而时红时绿。两次派发写在同一个 evaluate 里，理由
    // 与上文那条用例相同——分两次调用会错过这 150ms。
    test('回归：标题那条动画的结束不能代替卡片的退场把层摘掉', async ({ page }) => {
      const problems = watchProblems(page)
      await startRun(page, style.id, style.label, FOUR_1024, FIRST_RUN_SCORE)
      await reachWin(page)
      await expect(page.locator('[data-result-tier="won"]')).toBeVisible()

      const counts = await page.evaluate(
        () =>
          new Promise<{ afterTitle: number; afterCard: number }>((resolve) => {
            const continueButton = [
              ...document.querySelectorAll<HTMLElement>('[data-panel="win"] .control'),
            ].find((element) => element.textContent?.trim() === '继续玩')
            continueButton?.click()
            const fire = (selector: string, animationName: string): void => {
              document
                .querySelector<HTMLElement>(selector)
                ?.dispatchEvent(
                  new AnimationEvent('animationend', { bubbles: true, animationName })
                )
            }
            // 点完先等一帧：leaving 要在同一次提交里落上 DOM，这一帧之后才读得到
            requestAnimationFrame(() => {
              fire('[data-result-tier="won"] .overlay__title', 'win-panel-title-enter')
              requestAnimationFrame(() => {
                const afterTitle = document.querySelectorAll('[data-panel="win"]').length
                fire('[data-result-tier="won"] .overlay__card', 'result-card-out')
                requestAnimationFrame(() => {
                  resolve({
                    afterTitle,
                    afterCard: document.querySelectorAll('[data-panel="win"]').length,
                  })
                })
              })
            })
          })
      )
      // 标题那一条冒泡上来：层还在退场，一个都没被摘掉
      expect(counts.afterTitle, '标题那条 animationend 把层摘掉了').toBe(1)
      // 卡片自己的那一条才摘得掉它
      expect(counts.afterCard).toBe(0)

      expect(problems).toEqual([])
    })
  })
}
