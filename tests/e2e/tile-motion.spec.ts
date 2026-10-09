import { expect, test, type Browser, type Page } from '@playwright/test'
// T42 审查修复：主面板的风格按钮摘除了（选择搬进抽屉），选风格改走共享的抽屉路径
import { pickStyle } from './settings-helpers'

/**
 * T21 的 UI 半边：方块动效与 reduced-motion 静态替代。
 *
 * **本文件由 T21 编写、不由 T21 执行**（派发令明令：不准跑 playwright、不准开浏览器）。
 * 期望值来自同一套规则内核的离线推演，跑不跑由控制人决定。
 *
 * 边界先说清楚，免得读的人以为这里证了更多东西：
 *
 *   · **能证的（behavioural）**：同一个 data-tile-id 换了 data-row / data-col 而节点
 *     没有多出来；一次合并只在产物那一格留下一枚方块；reduced-motion 下 translate
 *     过渡真的不存在、棋盘照旧推得动、分数照旧涨；连打不丢输入。
 *   · **能量化的 visual**：实际浏览器逐帧位置、合并脉冲起点、来源透明度与面板遮挡。
 *     主观观感仍需结合保存的截图复核，数字阈值不能替代视觉判断。
 *
 * 局面确定性来自 `?seed=` 与 `?board=` 这两条调试缝（同 swap.spec.ts 的口径：两个都
 * 必须给，只给 board 的话「移动之后的生成」会飘）。夹具按行优先编号，所以开局时
 * `data-tile-id` 就是 1、2、3…，可以逐枚写死。
 */

/** 行优先局面 → board 参数值（空串 = 空格） */
function boardQuery(rows: (number | null)[][]): string {
  return rows.flat().map((value) => value ?? '').join(',')
}

/** 开局 URL：固定种子让「移动之后的生成」也可预期 */
function startUrl(rows: (number | null)[][], score = 0, seed = 20260926): string {
  return `./?seed=${seed}&board=${boardQuery(rows)}&score=${score}`
}

/**
 * 一次纯位移的局面：只有 (0,1) 一个空格，其余 15 格填满且横竖相邻都不相等。
 * 向左一按只有第 0 行会动（2 8 16 挤到前三格），不产生任何合并——这条用例要的
 * 就是「没有合并」。
 * 顺带把局面钉死：走完之后唯一的空格是 (0,3)，所以生成**必然**落在那格上，
 * 「哪一枚是新的」因此不必赌随机进度（值仍是 2 或 4，那一条不断）。
 */
const MOVE_ONLY: (number | null)[][] = [
  [2, null, 8, 16],
  [4, 8, 16, 2],
  [8, 16, 2, 4],
  [16, 2, 4, 32],
]

/** MOVE_ONLY 向左之后第 0 行的前三格（第四格是这一动新生成的） */
const MOVE_ONLY_AFTER_ROW0 = [2, 8, 16]

/** 单枚方块上下跨行：原先按行嵌套的 React children 会把它卸载后重建 */
const VERTICAL_ONLY: (number | null)[][] = [
  [2, null, null, null],
  [null, null, null, null],
  [null, null, null, null],
  [null, null, null, null],
]

/** 一次最多八组配对，反向移动会再次合并，方便检查快速输入是否堆叠旧来源载体 */
const DENSE_MERGES: (number | null)[][] = [
  [2, 2, 2, 2],
  [4, 4, 4, 4],
  [8, 8, 8, 8],
  [16, 16, 16, 16],
]

const REPEATED_MERGE: (number | null)[][] = [
  [2, 2, 2, 2],
  [null, null, null, null],
  [null, null, null, null],
  [null, null, null, null],
]

/**
 * 一次合并的局面：第 0 行 2 2，其余空。向左一按，引擎把身份归「落在目标格上」的那一枚
 * （board.ts 的 placed.push），于是 id 1 变成 4、id 2 从 DOM 上消失。
 */
const MERGE: (number | null)[][] = [
  [2, 2, null, null],
  [null, null, null, null],
  [null, null, null, null],
  [null, null, null, null],
]

/**
 * 一次达标：1024 + 1024 → 2048，同一动既合并又翻转 reachedTarget。
 * 局面里原本没有 2048，所以开局 reachedTarget 是 false，胜利面板只在这一动冒头。
 */
const WIN: (number | null)[][] = [
  [1024, 1024, null, null],
  [null, null, null, null],
  [null, null, null, null],
  [null, null, null, null],
]

/** 收集 console / page 错误：新挂上的属性与 CSS 若有 React 警告要当场看见 */
function watchProblems(page: Page): string[] {
  const problems: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  return problems
}

/** 开局：点「开始游戏」，等棋盘就位 */
async function start(page: Page, url: string): Promise<void> {
  await page.goto(url)
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()
}

/** 方块快照：身份 + 位置 + 数值。动效要钉的正是「同一批身份换了位置」 */
interface TileSnapshot {
  id: string
  value: number
  row: number
  col: number
}

async function readTiles(page: Page): Promise<TileSnapshot[]> {
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
  return snapshots
}

/** 从 DOM 还原棋盘：有方块才有 data-tile-id，逐格按 data-row / data-col 索引 */
async function readBoard(page: Page): Promise<(number | null)[][]> {
  const cellCount = await page.locator('.board__cell').count()
  const size = Math.sqrt(cellCount)
  const grid: (number | null)[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, (): number | null => null)
  )
  for (const tile of await readTiles(page)) grid[tile.row][tile.col] = tile.value
  return grid
}

/** 一个方块上的动效相关计算样式。参数是选择器，好让「那一枚」不必先知道身份 */
async function tileStyle(page: Page, selector: string): Promise<Record<string, string>> {
  return page.locator(selector).evaluate((el) => {
    const style = getComputedStyle(el)
    return {
      transitionProperty: style.transitionProperty,
      transitionDuration: style.transitionDuration,
      animationName: style.animationName,
      animationDuration: style.animationDuration,
      animationDelay: style.animationDelay,
      zIndex: style.zIndex,
      opacity: style.opacity,
      dataBucket: el.getAttribute('data-bucket') ?? '',
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    }
  })
}

interface MotionTrace {
  frames: { t: number; progress: number }[]
  events: { kind: string; t: number; detail: string }[]
  styleUpdateAt: number
  transitionRunAt: number
}

async function recordMotionPath(page: Page, key: string): Promise<MotionTrace> {
  const tile = page.locator('[data-tile-id="1"]')
  await tile.evaluate((element, key) => {
    const parse = (value: string): { x: number; y: number } => {
      const match = value.match(/^\s*(-?[\d.]+)px\s+(-?[\d.]+)px/)
      if (match === null) throw new Error(`Unexpected translate: ${value}`)
      return { x: Number(match[1]), y: Number(match[2]) }
    }
    const from = parse(element.style.translate)
    const trace = {
      frames: [] as { t: number; progress: number }[],
      events: [] as { kind: string; t: number; detail: string }[],
      styleUpdateAt: -1,
      transitionRunAt: -1,
      inputAt: -1,
      done: false,
    }
    const traceWindow = window as typeof window & { __tileMotionTrace?: typeof trace }
    traceWindow.__tileMotionTrace = trace
    document.addEventListener('keydown', (event) => {
      if ((event as KeyboardEvent).key === key && trace.inputAt < 0) {
        trace.inputAt = performance.now()
        trace.events.push({ kind: 'keydown', t: 0, detail: key })
      }
    }, true)
    element.addEventListener('transitionrun', (event) => {
      const transition = event as TransitionEvent
      trace.events.push({
        kind: 'transitionrun',
        t: performance.now() - trace.inputAt,
        detail: transition.propertyName,
      })
      if (transition.propertyName === 'translate' && trace.transitionRunAt < 0) {
        trace.transitionRunAt = performance.now() - trace.inputAt
      }
    })
    new MutationObserver(() => {
      const target = parse(element.style.translate)
      if (
        trace.styleUpdateAt < 0 &&
        trace.inputAt >= 0 &&
        (target.x !== from.x || target.y !== from.y)
      ) {
        trace.styleUpdateAt = performance.now() - trace.inputAt
      }
      trace.events.push({
        kind: 'style',
        t: trace.inputAt < 0 ? -1 : performance.now() - trace.inputAt,
        detail: element.style.translate,
      })
    }).observe(element, { attributes: true, attributeFilter: ['style'] })

    const sample = (): void => {
      const target = parse(element.style.translate)
      const current = parse(getComputedStyle(element).translate)
      const deltaX = target.x - from.x
      const deltaY = target.y - from.y
      const denominator = deltaX * deltaX + deltaY * deltaY
      const progress =
        denominator === 0
          ? 0
          : ((current.x - from.x) * deltaX + (current.y - from.y) * deltaY) / denominator
      trace.frames.push({
        t: trace.inputAt < 0 ? 0 : performance.now() - trace.inputAt,
        progress,
      })
      if (trace.inputAt < 0 || trace.frames[trace.frames.length - 1].t < 260) requestAnimationFrame(sample)
      else trace.done = true
    }
    requestAnimationFrame(sample)
  }, key)

  await page.keyboard.press(key)
  const traceFinished = await page
    .waitForFunction(
      () => (window as typeof window & { __tileMotionTrace?: { done: boolean } }).__tileMotionTrace?.done,
      undefined,
      { timeout: 1500 }
    )
    .then(() => true)
    .catch(() => false)
  if (!traceFinished) {
    const diagnostic = await page.evaluate(() => ({
      trace: (window as typeof window & { __tileMotionTrace?: unknown }).__tileMotionTrace,
      activeElement: document.activeElement?.outerHTML.slice(0, 120),
    }))
    throw new Error(`${key} trace did not finish: ${JSON.stringify(diagnostic)}`)
  }
  const trace = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __tileMotionTrace?: {
            frames: { t: number; progress: number }[]
            events: { kind: string; t: number; detail: string }[]
            styleUpdateAt: number
            transitionRunAt: number
          }
        }
      ).__tileMotionTrace
  )
  if (trace === undefined) throw new Error('Missing tile motion trace')
  return trace
}

test('位移连续：同一个 data-tile-id 换格，节点没有多出来，过渡真的挂在 translate 上', async ({
  page,
}) => {
  const problems = watchProblems(page)
  await start(page, startUrl(MOVE_ONLY))

  // 开局 15 枚：满盘只留 (0,1) 一个空格
  await expect(page.locator('[data-tile-id]')).toHaveCount(15)
  await expect(page.locator('[data-tile-id="2"]')).toHaveAttribute('data-col', '2')
  await expect(page.locator('[data-tile-id="3"]')).toHaveAttribute('data-col', '3')

  // 在 3 号那枚的 DOM 节点上打一个 React 管不着的印记。
  // **这是「同一个节点走过来」唯一可证的形式**：位移动画是不可见的中间态，而 DOM 属性
  // （data-row / data-col / data-value）在「节点滑过去」与「就地卸载重画」两种实现下
  // 完全一样——只有节点本身换没换能分辨。换成位置做 key 时 React 会为新的 key 建一个
  // 新节点、把旧节点卸载，印记跟着旧节点一起消失，所以这一条正是那道闸门
  await page.locator('[data-tile-id="3"]').evaluate((el) => {
    el.setAttribute('data-t21-node-mark', 'kept')
  })

  // 移动前就有一条 translate 过渡在（不是这一动才加上来的）：位移的载体从开局那一刻
  // 就在，换格只是让浏览器补中间帧
  const before = await tileStyle(page, '[data-tile-id="3"]')
  expect(before.transitionProperty).toContain('translate')
  expect(parseFloat(before.transitionDuration)).toBeGreaterThan(0)

  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowLeft')

  // 身份不变、位置变了——这就是「同一枚方块走过去」的全部可证部分
  await expect(page.locator('[data-tile-id="2"]')).toHaveAttribute('data-col', '1')
  await expect(page.locator('[data-tile-id="3"]')).toHaveAttribute('data-col', '2')
  await expect(page.locator('[data-tile-id="1"]')).toHaveAttribute('data-col', '0')
  await expect(page.locator('[data-tile-id="1"]')).toHaveAttribute('data-value', '2')

  // 印记还在 ⇒ 走过来的就是开局那一个节点，不是就地重画的一个新节点
  await expect(page.locator('[data-tile-id="3"]')).toHaveAttribute('data-t21-node-mark', 'kept')

  // 一枚不多一枚不少：每个身份在 DOM 上只有一个节点（key 变化导致的卸载重挂会
  // 让同一枚方块跳而不是滑；而那正是不改 key 的全部理由）
  for (const id of ['1', '2', '3']) {
    await expect(page.locator(`[data-tile-id="${id}"]`)).toHaveCount(1)
  }
  // 原样 15 枚 + 这一动生成的一枚 = 16 枚，一个多余的节点都没有
  await expect(page.locator('[data-tile-id]')).toHaveCount(16)

  // 这一动没有任何合并：data-merge 一个都不该出现
  await expect(page.locator('.board__tile[data-merge="true"]')).toHaveCount(0)

  // 整副棋盘逐格钉死（第四格是新的那一枚，值不断）：满盘只有一个空格，走完它正好
  // 被补上，所以其余 15 格一个字节都不该差
  const board = await readBoard(page)
  expect(board.slice(1)).toEqual(MOVE_ONLY.slice(1))
  expect(board[0].slice(0, 3)).toEqual(MOVE_ONLY_AFTER_ROW0)
  expect(board[0][3]).toBeGreaterThanOrEqual(2)
  // 没有合并就没有加分
  await expect(page.locator('[data-score]')).toHaveText('0')

  expect(problems).toEqual([])
})

test('三套风格的长距离移动逐帧连续，起步不突跳、落点不瞬移', async ({ page }) => {
  const problems = watchProblems(page)
  const fixtures: { key: string; rows: (number | null)[][] }[] = [
    {
      key: 'ArrowLeft',
      rows: [
        [null, null, null, 2],
        [null, null, null, null],
        [null, null, null, null],
        [null, null, null, null],
      ],
    },
    {
      key: 'ArrowRight',
      rows: [
        [2, null, null, null],
        [null, null, null, null],
        [null, null, null, null],
        [null, null, null, null],
      ],
    },
    {
      key: 'ArrowUp',
      rows: [
        [null, null, null, null],
        [null, null, null, null],
        [null, null, null, null],
        [2, null, null, null],
      ],
    },
    {
      key: 'ArrowDown',
      rows: [
        [2, null, null, null],
        [null, null, null, null],
        [null, null, null, null],
        [null, null, null, null],
      ],
    },
  ]

  for (const theme of ['Classic', 'Material', 'Claude']) {
    for (const fixture of fixtures) {
      await start(page, startUrl(fixture.rows))
      await pickStyle(page, theme)
      await page.locator('[data-board]').focus()
      const trace = await recordMotionPath(page, fixture.key)

      expect(trace.transitionRunAt, `${theme} ${fixture.key} transition start`).toBeGreaterThanOrEqual(0)
      expect(trace.styleUpdateAt, `${theme} ${fixture.key} state commit`).toBeGreaterThanOrEqual(0)
      expect(trace.styleUpdateAt, `${theme} ${fixture.key} state commit`).toBeLessThan(150)
      expect(
        trace.transitionRunAt - trace.styleUpdateAt,
        `${theme} ${fixture.key} transition after style commit`
      ).toBeLessThan(50)
      const moved = trace.frames.filter((frame) => frame.progress > 0.005)
      expect(moved.length, `${theme} ${fixture.key} rendered frames`).toBeGreaterThan(4)
      expect(moved[0].t - trace.transitionRunAt, `${theme} ${fixture.key} first visible motion`).toBeLessThan(40)
      expect(moved[0].progress, `${theme} ${fixture.key} first visible step`).toBeGreaterThan(0.08)
      expect(moved[moved.length - 1].progress, `${theme} ${fixture.key} final position`).toBeGreaterThan(0.98)

      let largestFrameStep = 0
      for (let index = 1; index < trace.frames.length; index += 1) {
        const step = trace.frames[index].progress - trace.frames[index - 1].progress
        expect(step, `${theme} ${fixture.key} monotonic frame ${index}`).toBeGreaterThanOrEqual(-0.015)
        largestFrameStep = Math.max(largestFrameStep, step)
      }
      expect(largestFrameStep, `${theme} ${fixture.key} largest rendered step`).toBeLessThan(0.3)
    }
  }

  expect(problems).toEqual([])
})

test('单步横移结束后再下移，同一方块仍产生逐帧位移', async ({ page }) => {
  const problems = watchProblems(page)
  await start(page, startUrl([
    [2, null, 4, null],
    [null, 8, null, null],
    [4, null, null, 2],
    [null, null, 16, null],
  ]))
  const board = page.locator('[data-board]')
  const tile = page.locator('[data-tile-id="2"]')
  await board.focus()
  await tile.evaluate((element) => {
    element.setAttribute('data-audit-marker', 'same-node')
    element.addEventListener('transitionrun', (event) => {
      if ((event as TransitionEvent).propertyName === 'translate') {
        element.setAttribute('data-translate-transition-seen', 'true')
      }
    })
  })

  await page.keyboard.press('ArrowLeft')
  await expect(tile).toHaveAttribute('data-col', '1')
  await page.waitForTimeout(260)
  await page.keyboard.press('ArrowDown')
  await expect(tile).toHaveAttribute('data-row', '2')

  await expect(tile).toHaveAttribute('data-audit-marker', 'same-node')
  await expect(tile).toHaveAttribute('data-translate-transition-seen', 'true')
  expect(problems).toEqual([])
})

test('上下移动跨行时保留原节点，并且 translate 过渡正在运行', async ({ page }) => {
  const problems = watchProblems(page)
  await start(page, startUrl(VERTICAL_ONLY))

  const tile = page.locator('[data-tile-id="1"]')
  await tile.evaluate((el) => el.setAttribute('data-t21-node-mark', 'kept'))
  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowDown')

  await expect(tile).toHaveAttribute('data-row', '3')
  await expect(tile).toHaveAttribute('data-t21-node-mark', 'kept')
  await expect
    .poll(() => tile.evaluate((el) => el.getAnimations().some((animation) => animation.playState === 'running')))
    .toBe(true)

  expect(problems).toEqual([])
})

test('生成入场：新入盘的那一枚带 data-spawn，且全盘只有它带', async ({ page }) => {
  const problems = watchProblems(page)
  await start(page, startUrl(MOVE_ONLY))

  // 开局 15 枚是「棋盘第一次出现」，按裁决不该有任何动效旗标——
  // diffTileMotion 的第一条早退就是为这个，否则每次刷新都要看一遍整盘淡入
  await expect(page.locator('.board__tile[data-spawn="true"]')).toHaveCount(0)

  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowLeft')

  // 满盘只留一个空格，走的正是它：新生成的那一枚就在 (0,3)
  const spawned = page.locator('.board__tile[data-spawn="true"]')
  await expect(spawned).toHaveCount(1)
  await expect(spawned).toHaveAttribute('data-row', '0')
  await expect(spawned).toHaveAttribute('data-col', '3')
  // 入场是 @starting-style + 过渡：属性在，规则由 CSS 兑现（裁决表见 TileMotion.ts）
  const style = await tileStyle(page, '.board__tile[data-spawn="true"]')
  expect(style.transitionProperty).toContain('opacity')
  expect(parseFloat(style.transitionDuration)).toBeGreaterThan(0)

  expect(problems).toEqual([])
})

test('合并只保留一个规则方块身份，来源载体飞到产物格后离场', async ({ page }) => {
  const problems = watchProblems(page)
  await start(page, startUrl(MERGE))
  await pickStyle(page, 'Material')

  await expect(page.locator('[data-tile-id]')).toHaveCount(2)
  const mergeSource = page.locator('.board__tile[data-merge-source-id="2"]')
  const product = page.locator('[data-tile-id="1"]')
  await product.evaluate((el) => {
    el.addEventListener('transitionrun', (event) => {
      if ((event as TransitionEvent).propertyName === 'scale') {
        const count = Number(el.getAttribute('data-merge-scale-transition-count') ?? '0') + 1
        el.setAttribute('data-merge-scale-transition-count', String(count))
        el.setAttribute('data-merge-pulse-transition-property', getComputedStyle(el).transitionProperty)
      }
    })
  })
  await page.locator('[data-board]').focus()
  await page.keyboard.down('ArrowLeft')
  const sourceStyle = await tileStyle(page, '.board__tile[data-merge-source-id="2"]')
  await page.keyboard.up('ArrowLeft')
  expect(sourceStyle.animationName).toBe('none')
  expect(sourceStyle.transitionProperty).toContain('translate')
  expect(sourceStyle.transitionProperty).not.toContain('opacity')
  expect(sourceStyle.transitionProperty).not.toContain('scale')
  expect(sourceStyle.opacity).toBe('1')
  expect(parseFloat(sourceStyle.transitionDuration)).toBeGreaterThan(0)
  expect(sourceStyle.dataBucket).toBe('1')

  // 产物就在合并那一格上：身份 1、数值 4
  await expect(product).toHaveCount(1)
  await expect(product).toHaveAttribute('data-value', '4')
  await expect(product).toHaveAttribute('data-row', '0')
  await expect(product).toHaveAttribute('data-col', '0')
  const productStyle = await tileStyle(page, '[data-tile-id="1"]')
  expect(Number(productStyle.zIndex)).toBeGreaterThan(Number(sourceStyle.zIndex))

  // **一个规则身份，不是两个**：2 号退出 data-tile-id 集合；短暂的来源载体只用
  // data-merge-source-id 标记，不能混入规则棋盘查询。
  await expect(page.locator('[data-tile-id="2"]')).toHaveCount(0)
  await expect(page.locator('.board__tile[data-row="0"][data-col="0"]')).toHaveCount(1)
  // 原样两枚 − 被吞的一枚 + 生成的一枚 = 两枚
  await expect(page.locator('[data-tile-id]')).toHaveCount(2)

  // 合并载者正是产物，脉冲开始时位移通道仍然存在
  await expect(page.locator('.board__tile[data-merge="true"]')).toHaveCount(1)
  const style = await tileStyle(page, '[data-tile-id="1"]')
  expect(style.animationName).toBe('none')
  expect(style.transitionProperty).toContain('translate')
  await expect(product).toHaveAttribute('data-merge-scale-transition-count', '2')
  const pulseProperties = await product.getAttribute('data-merge-pulse-transition-property')
  expect(pulseProperties).toContain('translate')
  expect(pulseProperties).toContain('scale')
  await expect(mergeSource).toHaveCount(0)
  // 分数按合并计：mergeScore(4) = 4
  await expect(page.locator('[data-score]')).toHaveText('4')

  expect(problems).toEqual([])
})

test('快速转向不清掉待播合并反馈，脉冲时位移仍可继续', async ({ page }) => {
  const problems = watchProblems(page)
  await start(page, startUrl(MERGE))
  await pickStyle(page, 'Material')

  const board = page.locator('[data-board]')
  const product = page.locator('[data-tile-id="1"]')
  await board.evaluate((element) => {
    const startedAt = performance.now()
    element.addEventListener(
      'transitionrun',
      (event) => {
        const transition = event as TransitionEvent
        const tile = transition.target
        if (
          transition.propertyName === 'scale' &&
          tile instanceof HTMLElement &&
          tile.dataset.mergePulse === 'up'
        ) {
          element.setAttribute('data-pulse-start-ms', String(performance.now() - startedAt))
        }
      },
      true
    )
  })

  await board.focus()
  await page.keyboard.press('ArrowLeft')
  await page.waitForTimeout(30)
  await page.keyboard.press('ArrowRight')

  await expect(product).toHaveAttribute('data-col', '3')
  await expect
    .poll(() => board.getAttribute('data-pulse-start-ms'), { intervals: [10, 20, 30] })
    .not.toBeNull()
  const pulseStart = Number(await board.getAttribute('data-pulse-start-ms'))
  expect(pulseStart).toBeLessThan(180)

  const pulseStyle = await tileStyle(page, '[data-tile-id="1"]')
  expect(pulseStyle.transitionProperty).toContain('translate')
  expect(pulseStyle.transitionProperty).toContain('scale')
  const moving = await product.evaluate((element) =>
    getComputedStyle(element).translate !== element.style.translate
  )
  expect(moving).toBe(true)
  expect(problems).toEqual([])
})

test('四个方向的合并来源都沿移动轴飞到对应产物格', async ({ page }) => {
  const problems = watchProblems(page)
  const directions: {
    key: string
    vertical: boolean
    sources: { id: string; from: readonly [number, number]; to: readonly [number, number] }[]
    products: { id: string; value: string; row: string; col: string }[]
  }[] = [
    {
      key: 'ArrowLeft',
      vertical: false,
      sources: [
        { id: '2', from: [0, 1], to: [0, 0] },
        { id: '4', from: [0, 3], to: [0, 1] },
      ],
      products: [
        { id: '1', value: '4', row: '0', col: '0' },
        { id: '3', value: '8', row: '0', col: '1' },
      ],
    },
    {
      key: 'ArrowRight',
      vertical: false,
      sources: [
        { id: '1', from: [0, 0], to: [0, 2] },
        { id: '3', from: [0, 2], to: [0, 3] },
      ],
      products: [
        { id: '2', value: '4', row: '0', col: '2' },
        { id: '4', value: '8', row: '0', col: '3' },
      ],
    },
    {
      key: 'ArrowUp',
      vertical: true,
      sources: [
        { id: '2', from: [1, 0], to: [0, 0] },
        { id: '4', from: [3, 0], to: [1, 0] },
      ],
      products: [
        { id: '1', value: '4', row: '0', col: '0' },
        { id: '3', value: '8', row: '1', col: '0' },
      ],
    },
    {
      key: 'ArrowDown',
      vertical: true,
      sources: [
        { id: '1', from: [0, 0], to: [2, 0] },
        { id: '3', from: [2, 0], to: [3, 0] },
      ],
      products: [
        { id: '2', value: '4', row: '2', col: '0' },
        { id: '4', value: '8', row: '3', col: '0' },
      ],
    },
  ]

  for (const direction of directions) {
    const rows: (number | null)[][] = Array.from({ length: 4 }, () => Array(4).fill(null))
    if (direction.vertical) {
      for (let row = 0; row < 4; row += 1) rows[row]![0] = [2, 2, 4, 4][row]!
    } else {
      rows[0] = [2, 2, 4, 4]
    }
    await start(page, startUrl(rows))
    await page.locator('[data-board]').focus()
    await page.keyboard.press(direction.key)

    const mergeSources = page.locator('[data-merge-source-id]')
    await expect(mergeSources).toHaveCount(2)
    const dimensions = await page.locator('[data-board]').evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        cell: Number.parseFloat(style.getPropertyValue('--cell-size')),
        gap: Number.parseFloat(style.getPropertyValue('--board-gap')),
      }
    })
    const offset = ([row, col]: readonly [number, number]): string => {
      const x = col * (dimensions.cell + dimensions.gap)
      const y = row * (dimensions.cell + dimensions.gap)
      return `${x === 0 ? 0.001 : x}px ${y === 0 ? 0.001 : y}px`
    }
    const actualSources = await mergeSources.evaluateAll((elements) =>
      elements
        .map((element) => ({
          id: element.getAttribute('data-merge-source-id') ?? '',
          from: element.style.getPropertyValue('--merge-source-from'),
          to: element.style.getPropertyValue('--merge-source-to'),
        }))
        .sort((a, b) => Number(a.id) - Number(b.id))
    )
    const expectedSources = direction.sources
      .map(({ id, from, to }) => ({ id, from: offset(from), to: offset(to) }))
      .sort((a, b) => Number(a.id) - Number(b.id))
    expect(actualSources).toEqual(expectedSources)

    const actualProducts = await page.locator('.board__tile[data-merge="true"]').evaluateAll((elements) =>
      elements
        .map((element) => ({
          id: element.getAttribute('data-tile-id') ?? '',
          value: element.getAttribute('data-value') ?? '',
          row: element.getAttribute('data-row') ?? '',
          col: element.getAttribute('data-col') ?? '',
        }))
        .sort((a, b) => Number(a.id) - Number(b.id))
    )
    expect(actualProducts).toEqual(
      [...direction.products].sort((a, b) => Number(a.id) - Number(b.id))
    )
    await expect(mergeSources).toHaveCount(0)
  }

  expect(problems).toEqual([])
})

test('合并脉冲围绕产物格中心扩展，不向右下漂移', async ({ page }) => {
  const problems = watchProblems(page)
  const cases: {
    key: string
    vertical: boolean
    line: number
    pairStart: number
  }[] = [
    { key: 'ArrowLeft', vertical: false, line: 1, pairStart: 0 },
    { key: 'ArrowRight', vertical: false, line: 2, pairStart: 2 },
    { key: 'ArrowUp', vertical: true, line: 2, pairStart: 0 },
    { key: 'ArrowDown', vertical: true, line: 0, pairStart: 2 },
  ]

  for (const item of cases) {
    const rows: (number | null)[][] = Array.from({ length: 4 }, () => Array(4).fill(null))
    if (item.vertical) {
      rows[item.pairStart]![item.line] = 2
      rows[item.pairStart + 1]![item.line] = 2
    } else {
      rows[item.line]![item.pairStart] = 2
      rows[item.line]![item.pairStart + 1] = 2
    }
    await start(page, startUrl(rows))
    const board = page.locator('[data-board]')
    await board.evaluate((element) => {
      element.addEventListener('transitionrun', (event) => {
        const transition = event as TransitionEvent
        const tile = transition.target
        if (
          !(tile instanceof HTMLElement) ||
          transition.propertyName !== 'scale' ||
          tile.dataset.mergePulse !== 'up'
        ) {
          return
        }
        let frames = 0
        let largestScale = 1
        const sampleExpandedFrame = (): void => {
          const scale = Number.parseFloat(getComputedStyle(tile).scale)
          if (scale > largestScale) {
            const row = Number(tile.dataset.row)
            const col = Number(tile.dataset.col)
            const size = Math.sqrt(element.querySelectorAll('.board__cell').length)
            const cell = element.querySelectorAll('.board__cell')[row * size + col]
            if (!(cell instanceof HTMLElement)) return
            const tileRect = tile.getBoundingClientRect()
            const cellRect = cell.getBoundingClientRect()
            largestScale = scale
            tile.dataset.mergeCenterDriftX = String(
              tileRect.left + tileRect.width / 2 - (cellRect.left + cellRect.width / 2)
            )
            tile.dataset.mergeCenterDriftY = String(
              tileRect.top + tileRect.height / 2 - (cellRect.top + cellRect.height / 2)
            )
            tile.dataset.mergeScaleSample = String(scale)
          }
          frames += 1
          if (frames < 8 && largestScale < 1.04) requestAnimationFrame(sampleExpandedFrame)
          else if (largestScale > 1) tile.dataset.mergeGeometryReady = 'true'
        }
        requestAnimationFrame(sampleExpandedFrame)
      }, true)
    })
    await board.focus()
    await page.keyboard.press(item.key)

    const product = page.locator('.board__tile[data-merge="true"]')
    await expect(product).toHaveCount(1)
    const productId = await product.getAttribute('data-tile-id')
    if (productId === null) throw new Error('Missing merge product identity')
    const stableProduct = page.locator(`[data-tile-id="${productId}"]`)
    await expect(stableProduct).toHaveAttribute('data-merge-geometry-ready', 'true')
    const geometry = await stableProduct.evaluate((element) => {
      return {
        centerDriftX: Number(element.dataset.mergeCenterDriftX),
        centerDriftY: Number(element.dataset.mergeCenterDriftY),
        scale: element.dataset.mergeScaleSample ?? '',
      }
    })
    expect(Math.abs(geometry.centerDriftX), `${item.key} horizontal center drift`).toBeLessThan(1)
    expect(Math.abs(geometry.centerDriftY), `${item.key} vertical center drift`).toBeLessThan(1)
    expect(Number.parseFloat(geometry.scale)).toBeGreaterThan(1)
  }

  expect(problems).toEqual([])
})

test('触屏方向按钮也播放合并来源动画', async ({ page }) => {
  const problems = watchProblems(page)
  await start(page, startUrl(MERGE))
  const leftButton = page.getByRole('button', { name: '向左' })
  if (!(await leftButton.isVisible())) test.skip()

  await leftButton.click()
  const source = page.locator('.board__tile[data-merge-source-id="2"]')
  await expect(source).toHaveCount(1)
  const style = await tileStyle(page, '.board__tile[data-merge-source-id="2"]')
  expect(style.animationName).toBe('none')
  expect(style.transitionProperty).toContain('translate')
  expect(style.dataBucket).toBe('1')
  await expect(source).toHaveCount(0)
  await expect(page.locator('[data-score]')).toHaveText('4')

  expect(problems).toEqual([])
})

test('下一步合并中断并替换上一步的离场载体', async ({ page }) => {
  const problems = watchProblems(page)
  await start(page, startUrl(DENSE_MERGES))
  await pickStyle(page, 'Material')
  await page.locator('[data-board]').focus()

  await page.keyboard.press('ArrowLeft')
  await page.waitForTimeout(30)
  const firstMoveSources = await page.locator('[data-merge-source-id]').count()
  expect(firstMoveSources).toBe(8)

  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(30)
  const activeSources = await page.locator('[data-merge-source-id]').count()
  expect(activeSources).toBeLessThanOrEqual(8)
  const activeSpawns = await page.locator('.board__tile[data-spawn="true"]').count()
  expect(activeSpawns).toBeLessThanOrEqual(1)
  const duplicateIds = await page.locator('[data-tile-id]').evaluateAll((tiles) => {
    const ids = tiles.map((tile) => tile.getAttribute('data-tile-id'))
    return ids.length - new Set(ids).size
  })
  expect(duplicateIds).toBe(0)

  expect(problems).toEqual([])
})

test('同一方块连续两次合并，第二次脉冲从当前位置重新触发', async ({ page }) => {
  const problems = watchProblems(page)
  await start(page, startUrl(REPEATED_MERGE))
  await pickStyle(page, 'Material')
  const product = page.locator('[data-tile-id="1"]')
  await product.evaluate((el) => {
    el.addEventListener('transitionrun', (event) => {
      if ((event as TransitionEvent).propertyName === 'scale') {
        const count = Number(el.getAttribute('data-merge-scale-transition-count') ?? '0') + 1
        el.setAttribute('data-merge-scale-transition-count', String(count))
      }
    })
  })
  await page.locator('[data-board]').focus()

  await page.keyboard.press('ArrowLeft')
  await page.waitForTimeout(20)
  await page.keyboard.press('ArrowLeft')
  await expect(product).toHaveAttribute('data-value', '8')
  await expect
    .poll(() => product.getAttribute('data-merge-pulse'), { intervals: [10, 20, 30] })
    .toBe('up')
  await expect
    .poll(() => product.getAttribute('data-merge-pulse'), { intervals: [10, 20, 30] })
    .toBe('down')
  await expect(product).not.toHaveAttribute('data-merge-pulse')
  await expect(product).toHaveAttribute('data-merge-scale-transition-count', '2')

  expect(problems).toEqual([])
})

test('Claude 在 150ms 连按后所有合并脉冲都能回到 1', async ({ page }) => {
  const problems = watchProblems(page)
  await start(page, startUrl(DENSE_MERGES))
  await pickStyle(page, 'Claude')
  const board = page.locator('[data-board]')
  await board.focus()

  for (let index = 0; index < 24; index += 1) {
    await page.keyboard.press(index % 2 === 0 ? 'ArrowLeft' : 'ArrowRight')
    await page.waitForTimeout(150)
  }
  await page.waitForTimeout(1200)

  const residuals = await board.locator('[data-tile-id]').evaluateAll((tiles) =>
    tiles.flatMap((tile) => {
      const style = getComputedStyle(tile)
      const scale = style.scale === 'none' ? 1 : Number.parseFloat(style.scale)
      return tile.hasAttribute('data-merge-pulse') || Math.abs(scale - 1) > 0.001
        ? [{ id: tile.getAttribute('data-tile-id'), phase: tile.getAttribute('data-merge-pulse'), scale }]
        : []
    })
  )
  expect(residuals).toEqual([])
  await expect(page.locator('[data-merge-source-id]')).toHaveCount(0)

  expect(problems).toEqual([])
})

test('撤销会作废尚未播放的合并脉冲', async ({ page }) => {
  const problems = watchProblems(page)
  await start(page, startUrl(MERGE))
  await pickStyle(page, 'Material')
  const board = page.locator('[data-board]')
  await board.focus()

  await page.keyboard.press('ArrowLeft')
  await page.waitForTimeout(25)
  await page.keyboard.press('z')
  await expect(page.locator('[data-tile-id]')).toHaveCount(2)
  await page.waitForTimeout(450)

  const state = await board.evaluate((element) => {
    const tiles = [...element.querySelectorAll<HTMLElement>('[data-tile-id]')]
    return {
      values: tiles.map((tile) => Number(tile.dataset.value)).sort((a, b) => a - b),
      pulses: tiles.filter((tile) => tile.hasAttribute('data-merge-pulse')).length,
      scales: tiles.map((tile) => getComputedStyle(tile).scale),
    }
  })
  expect(state.values).toEqual([2, 2])
  expect(state.pulses).toBe(0)
  expect(state.scales.every((scale) => scale === 'none' || Math.abs(Number.parseFloat(scale) - 1) < 0.001)).toBe(true)

  expect(problems).toEqual([])
})

test('胜利反馈由面板标题承接，目标方块不会浮到面板上方', async ({ page }) => {
  const problems = watchProblems(page)
  await start(page, startUrl(WIN))

  await page.locator('[data-board]').evaluate((board) => {
    const audit = {
      inputAt: -1,
      animationStarts: [] as string[],
      samples: [] as { t: number; opacity: number; scale: string; animationName: string; running: number }[],
      done: false,
    }
    ;(window as typeof window & { __winTitleAudit?: typeof audit }).__winTitleAudit = audit
    document.addEventListener('keydown', (event) => {
      if ((event as KeyboardEvent).key === 'ArrowLeft' && audit.inputAt < 0) {
        audit.inputAt = performance.now()
      }
    }, true)
    document.addEventListener('animationstart', (event) => {
      const title = event.target
      if (title instanceof HTMLElement && title.matches('[data-panel="win"] .overlay__title')) {
        audit.animationStarts.push((event as AnimationEvent).animationName)
      }
    }, true)
    const sample = (): void => {
      const title = document.querySelector<HTMLElement>('[data-panel="win"] .overlay__title')
      if (title !== null && audit.inputAt >= 0) {
        const style = getComputedStyle(title)
        audit.samples.push({
          t: performance.now() - audit.inputAt,
          opacity: Number(style.opacity),
          scale: style.scale,
          animationName: style.animationName,
          running: title.getAnimations().filter((animation) => animation.playState === 'running').length,
        })
        if (performance.now() - audit.inputAt >= 240) audit.done = true
      }
      if (!audit.done) requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })

  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowLeft')
  await page.waitForFunction(
    () => (window as typeof window & { __winTitleAudit?: { done: boolean } }).__winTitleAudit?.done,
    undefined,
    { timeout: 1000 }
  )
  const titleAudit = await page.evaluate(
    () => (window as typeof window & { __winTitleAudit?: { animationStarts: string[]; samples: { opacity: number; scale: string; animationName: string; running: number }[] } }).__winTitleAudit
  )
  if (titleAudit === undefined) throw new Error('Missing win title trace')
  expect(titleAudit.animationStarts).toContain('win-panel-title-enter')
  expect(titleAudit.samples[0]?.animationName).toBe('win-panel-title-enter')
  expect(titleAudit.samples[0]?.opacity).toBeLessThan(0.99)
  expect(titleAudit.samples.some((sample) => sample.opacity < 0.99 || sample.scale !== '1')).toBe(true)
  expect(titleAudit.samples.some((sample) => sample.running > 0)).toBe(true)

  // 达标的那一枚
  const winner = page.locator('.board__tile[data-win="true"]')
  await expect(winner).toHaveCount(1)
  await expect(winner).toHaveAttribute('data-tile-id', '1')
  await expect(winner).toHaveAttribute('data-value', '2048')

  const style = await tileStyle(page, '[data-tile-id="1"]')
  expect(style.animationName).toBe('none')
  const titleStyle = await tileStyle(page, '[data-panel="win"] .overlay__title')
  expect(titleStyle.animationName).toBe('win-panel-title-enter')
  expect(parseFloat(titleStyle.animationDuration)).toBeCloseTo(0.18)

  await expect(page.getByRole('button', { name: '继续玩' })).toBeVisible()
  await expect(page.locator('.board__tile[data-merge="true"]')).toHaveCount(1)
  await expect(page.locator('.board__tile[data-merge="true"][data-win="true"]')).toHaveCount(1)

  const panelHit = await winner.evaluate((tile) => {
    const rect = tile.getBoundingClientRect()
    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    const panel = document.querySelector<HTMLElement>('[data-panel="win"]')
    return {
      topIsPanel: top instanceof Element && top.closest('[data-panel="win"]') !== null,
      panelZIndex: panel === null ? '' : getComputedStyle(panel).zIndex,
    }
  })
  expect(panelHit.panelZIndex).toBe('3')
  expect(panelHit.topIsPanel).toBe(true)

  expect(problems).toEqual([])
})

test('胜利面板在三套风格都覆盖整块棋盘', async ({ page }) => {
  const problems = watchProblems(page)

  for (const theme of ['Classic', 'Material', 'Claude']) {
    await start(page, startUrl(WIN))
    await pickStyle(page, theme)
    await page.locator('[data-board]').focus()
    await page.keyboard.press('ArrowLeft')

    const coverage = await page.locator('[data-panel="win"]').evaluate((panel) => {
      const board = document.querySelector<HTMLElement>('[data-board]')
      if (board === null) throw new Error('Missing board')
      const rect = board.getBoundingClientRect()
      const inset = 24
      const points: readonly (readonly [number, number])[] = [
        [rect.left + inset, rect.top + inset],
        [rect.right - inset, rect.top + inset],
        [rect.left + inset, rect.bottom - inset],
        [rect.right - inset, rect.bottom - inset],
      ]
      return {
        zIndex: getComputedStyle(panel).zIndex,
        pointsCovered: points.every(([x, y]) => {
          const top = document.elementFromPoint(x, y)
          return top instanceof Element && top.closest('[data-panel="win"]') !== null
        }),
      }
    })
    expect(coverage.zIndex, theme).toBe('3')
    expect(coverage.pointsCovered, theme).toBe(true)
  }

  expect(problems).toEqual([])
})

test('reduced-motion：没有位移过渡，棋盘照旧能动、分数照旧涨，静态记号顶上', async ({
  browser,
}) => {
  // 用户故事 24：要求「少一点动」的玩家仍然看得见每一枚方块、仍然走得动。
  // 所以这里同时断言「动画没了」与「游戏还在」两件事——只断言前者是关掉功能，
  // 只断言后者是没做降级
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  const page = await context.newPage()
  try {
    const problems = watchProblems(page)
    await start(page, startUrl(MERGE))

    // 开局就确认频道是关着的：方块在、数字读得清
    const opening = await tileStyle(page, '[data-tile-id="1"]')
    expect(opening.transitionProperty).toBe('none')
    expect(opening.animationName).toBe('none')
    await expect(page.locator('[data-tile-id]')).toHaveCount(2)

    await page.locator('[data-board]').focus()
    await page.keyboard.press('ArrowLeft')

    // 状态与操作完整：棋盘推走了、分数按合并计了
    await expect(page.locator('[data-tile-id="1"]')).toHaveAttribute('data-value', '4')
    await expect(page.locator('[data-tile-id="2"]')).toHaveCount(0)
    await expect(page.locator('[data-score]')).toHaveText('4')
    await expect(page.locator('[data-tile-id]')).toHaveCount(2)

    // 静态替代真的落到画面上：产物描一圈，而不是什么都没有
    const merged = await tileStyle(page, '[data-tile-id="1"]')
    expect(merged.animationName).toBe('none')
    expect(merged.outlineStyle).toBe('solid')
    expect(parseFloat(merged.outlineWidth)).toBeGreaterThan(0)

    // 再来一发方向键：输入频道仍然是通的（这一步不预判棋盘怎么走——
    // 它只保证「降级之后键盘还活着」，真断了会是 console error）
    await page.keyboard.press('ArrowUp')

    await start(page, startUrl(WIN))
    await page.locator('[data-board]').focus()
    await page.keyboard.press('ArrowLeft')
    const title = page.locator('[data-panel="win"] .overlay__title')
    const reducedTitle = await title.evaluate((element) => {
      const style = getComputedStyle(element)
      return { animationName: style.animationName, scale: style.scale }
    })
    expect(reducedTitle.animationName).toBe('win-panel-title-fade')
    expect(reducedTitle.scale).toBe('1')

    expect(problems).toEqual([])
  } finally {
    await context.close()
  }
})

test('同一帧合并多步输入时保留位移过渡通道', async ({ page }) => {
  const problems = watchProblems(page)
  await start(page, startUrl([
    [2, 2, 4, 4],
    [null, null, null, null],
    [null, null, null, null],
    [null, null, null, null],
  ]))
  const board = page.locator('[data-board]')
  await board.focus()
  const product = page.locator('[data-tile-id="2"]')

  // 两个同步键盘事件让规则状态走完「右、下」两步，React 只呈现最终棋盘。
  const positionSkipped = await board.evaluate(async (element) => {
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await new Promise(requestAnimationFrame)
    const tile = element.querySelector<HTMLElement>('[data-tile-id="2"]')
    if (tile === null) throw new Error('missing final merge product')
    return {
      skipped: element.hasAttribute('data-skip-tile-transition'),
    }
  })
  expect(positionSkipped.skipped).toBe(false)

  await expect(product).toHaveAttribute('data-row', '3')
  await expect(product).toHaveAttribute('data-col', '2')
  await expect(board).not.toHaveAttribute('data-skip-tile-transition')
  await expect(page.locator('[data-merge-source-id], [data-spawn="true"]')).toHaveCount(0)
  const style = await tileStyle(page, '[data-tile-id="2"]')
  expect(style.transitionProperty).toContain('translate')

  await page.keyboard.press('ArrowUp')
  await expect(page.locator('[data-board]')).not.toHaveAttribute('data-skip-tile-transition')
  const resumedTransitions = await page.locator('[data-tile-id]').evaluateAll((elements) =>
    elements.map((element) => getComputedStyle(element).transitionProperty)
  )
  expect(resumedTransitions.some((transition) => transition.includes('translate'))).toBe(true)

  expect(problems).toEqual([])
})

test('上一段位移未完成时快速转向从当前画面平滑续走', async ({ page }) => {
  const problems = watchProblems(page)
  await start(page, startUrl([
    [2, 2, 4, 4],
    [null, null, null, null],
    [null, null, null, null],
    [null, null, null, null],
  ]))
  const board = page.locator('[data-board]')
  await board.focus()

  // 让第一步先提交一次，再在下一帧立刻改变轴向。
  await board.evaluate(async (element) => {
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await new Promise(requestAnimationFrame)
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
  })

  await expect(board).not.toHaveAttribute('data-skip-tile-transition')
  await expect(page.locator('[data-merge-source-id]')).toHaveCount(0)
  const hasRunningTranslate = await page.locator('[data-tile-id="4"]').evaluate(async (element) => {
    for (let frame = 0; frame < 12; frame += 1) {
      await new Promise(requestAnimationFrame)
      if (getComputedStyle(element).translate !== element.style.translate) return true
    }
    return false
  })
  expect(hasRunningTranslate).toBe(true)

  expect(problems).toEqual([])
})

test('快速连打不丢输入：一步一等与连续按得到同一副棋盘', async ({ page }) => {
  const problems = watchProblems(page)
  // 同一个 URL 起两局。两局的种子与开局局面完全相同，所以**输入序列相同就必须
  // 得到同一副棋盘**——中途丢掉任何一次输入都会让两副棋盘分叉。
  // 这正是「过渡期间不许丢输入」的可证形式：状态在按键那一刻就已经是新状态，
  // 动画只是随后补帧；谁要是把输入挡住等动画跑完，这一条当场红
  const url = startUrl([
    [2, 4, 8, 16],
    [4, 8, 16, 2],
    [8, 16, 2, 4],
    [16, 2, 4, null],
  ])
  const sequence = ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowRight']

  const play = async (): Promise<(number | null)[][]> => {
    await page.goto(url)
    await page.getByRole('button', { name: '开始游戏' }).click()
    await expect(page.locator('[data-board]')).toBeVisible()
    await page.locator('[data-board]').focus()
    for (const key of sequence) await page.keyboard.press(key)
    return readBoard(page)
  }

  const spacing = await play()
  const rapid = await play()

  // 两局都不是白打：棋盘真的离开了开局局面
  expect(spacing).not.toEqual([
    [2, 4, 8, 16],
    [4, 8, 16, 2],
    [8, 16, 2, 4],
    [16, 2, 4, null],
  ])
  // 逐格相同：没有一次输入被过渡吞掉
  expect(rapid).toEqual(spacing)

  expect(problems).toEqual([])
})
