import { expect, test, type Page } from '@playwright/test'

/**
 * T10 的触屏纵向切片：四方向滑动各触发恰好一次 Move、短滑与轻点不误触、四个方向
 * 按钮各一次、键盘路径两个视口都不回退；桌面视口上方向按钮不在布局里。
 *
 * 局面确定性：`?seed=` + `?board=` 两条一起给（T08 定下的规矩——只有 ?board= 时生成
 * 走随机流）。开局局面刻意只放**一个**方块在正中央：盘面只有一个可动块，于是
 *   1. 一次合法 Move 只会多出**一个**方块（一次划动连触两次会多出两个）；
 *   2. 不存在合并的可能（得有两块同值才合得上），所以每一次划动的结果都只由一个
 *      移动造成，不会掺进随机的合并分支；
 *   3. 生成位置由 seed 决定，因此断言里一句都不提它，只追踪开局那块的身份
 *      （data-tile-id="1"）落到哪一格。
 *
 * 手势用 page.mouse 划，不用 touchscreen：识别器接的是 pointerdown/pointerup，而
 * Chromium 对任何输入（鼠标 / 触摸笔 / 真实手指）都会派发这对事件。touchscreen
 * 只有 tap，划不了手势；本文件的理由详见 task-10-report.md。
 */

/** 开局 URL：固定种子让「移动后的生成」也可预期 */
const SEED = '20260926'

/** 行优先局面 → board 参数值（空串 = 空格） */
function boardQuery(rows: (number | null)[][]): string {
  return rows.flat().map((value) => value ?? '').join(',')
}

/** 开局 URL 带局面：局面铺好之后，每一步仍然走真实输入与真实规则内核 */
function startUrl(rows: (number | null)[][]): string {
  return `/?seed=${SEED}&board=${boardQuery(rows)}`
}

/**
 * 正中央孤零零一个 2 的开局。
 *
 * 四个方向各能合法移动一次（它不在任何边缘），而盘面只有一块，于是「一次划动 =
 * 一次 Move = 多出一个方块」这个等式不受随机数与合并干扰。
 */
const SINGLE_TILE: (number | null)[][] = [
  [null, null, null, null],
  [null, 2, null, null],
  [null, null, null, null],
  [null, null, null, null],
]

/** 一次划动后那块开局方块该落在哪一格：位移 → (row, col) */
const EXPECTED_CELL = {
  up: { row: '0', col: '1' },
  down: { row: '3', col: '1' },
  left: { row: '1', col: '0' },
  right: { row: '1', col: '3' },
} as const

/** 选模式并开局，等棋盘真的在 DOM 里（经典是开局界面的默认选中项） */
async function openFixture(page: Page): Promise<void> {
  await page.goto(startUrl(SINGLE_TILE))
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()
  // 开局情形本身：只有正中央那一块
  await expect(page.locator('[data-tile-id]')).toHaveCount(1)
  await expect(page.locator('[data-tile-id="1"]')).toHaveAttribute('data-row', '1')
  await expect(page.locator('[data-tile-id="1"]')).toHaveAttribute('data-col', '1')
}

/**
 * 在棋盘正中央起手划一刀。
 *
 * 位移用的是**视口坐标**，与识别器吃的 clientX/clientY 同一套（boundingBox 也是
 * 视口坐标）。steps 让中间真的分几次 pointermove 过去，而不是一步跳到位——这正是
 * 「一次划动会不会连触多次」想看的形状。
 */
async function swipe(page: Page, dx: number, dy: number): Promise<void> {
  const box = await page.locator('[data-board]').boundingBox()
  if (!box) throw new Error('棋盘不在 DOM 里')
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 8 })
  await page.mouse.up()
}

/**
 * 「恰好一次」的三条断言：
 *   1. 开局那块落在该落的那一格（方向对）；
 *   2. 方块总数只多出一个（连触两次会多出两个）；
 *   3. 分数还是 0（这一局没有可合并的对，动分就说明多走了不止一步）。
 */
async function expectExactlyOneMove(
  page: Page,
  direction: 'up' | 'down' | 'left' | 'right'
): Promise<void> {
  const cell = EXPECTED_CELL[direction]
  const tile = page.locator('[data-tile-id="1"]')
  await expect(tile).toHaveCount(1)
  await expect(tile).toHaveAttribute('data-row', cell.row)
  await expect(tile).toHaveAttribute('data-col', cell.col)
  await expect(page.locator('[data-tile-id]')).toHaveCount(2)
  await expect(page.locator('[data-score]')).toHaveText('0')
}

/** 收集 console / page 错误：新输入路径不该带出任何 React 警告 */
function watchProblems(page: Page): string[] {
  const problems: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  return problems
}

test('手机视口：指针真的是「粗」的，四个方向按钮真的在布局里', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile', '只有手机视口是触摸环境')
  const problems = watchProblems(page)
  await openFixture(page)

  // 这一条是整个显隐机制的**前提**：方向按钮与触摸版提示都挂在 pointer: coarse 上，
  // 若仿真出来的指针是 fine，下面每一条按钮用例都会以「按钮不存在」失败。把前提
  // 单独钉一条，失败时原因就直接写在脸上，不用去猜是不是按钮渲染错了
  const pointerCoarse = await page.evaluate(
    () => window.matchMedia('(pointer: coarse)').matches
  )
  expect(pointerCoarse, '手机仿真必须让 (pointer: coarse) 成立').toBe(true)

  // 反过来也钉：粗指针环境下四个按钮一个不少，且真的可见（不是 display:none）
  await expect(page.getByRole('button', { name: '向上' })).toBeVisible()
  await expect(page.getByRole('button', { name: '向下' })).toBeVisible()
  await expect(page.getByRole('button', { name: '向左' })).toBeVisible()
  await expect(page.getByRole('button', { name: '向右' })).toBeVisible()
  expect(
    await page.locator('.dpad').evaluate((el) => getComputedStyle(el).display)
  ).toBe('grid')
  // 触摸版提示进场，键盘那一版让位。用类名而不是 getByText：那两个 span 的文本会
  // 一起构成 <p> 的文本内容，按文本查找会同时命中父元素
  await expect(page.locator('.hint__touch')).toBeVisible()
  await expect(page.locator('.hint__touch')).toHaveText('滑动或点方向按钮移动方块')
  await expect(page.locator('.hint__pointer')).toBeHidden()

  expect(problems).toEqual([])
})

test('滑动向上：一次划动恰好一次 Move', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile', '只有手机视口划得动')
  const problems = watchProblems(page)
  await openFixture(page)
  await swipe(page, 0, -120)
  await expectExactlyOneMove(page, 'up')
  expect(problems).toEqual([])
})

test('滑动向下：一次划动恰好一次 Move', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile', '只有手机视口划得动')
  const problems = watchProblems(page)
  await openFixture(page)
  await swipe(page, 0, 120)
  await expectExactlyOneMove(page, 'down')
  expect(problems).toEqual([])
})

test('滑动向左：一次划动恰好一次 Move', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile', '只有手机视口划得动')
  const problems = watchProblems(page)
  await openFixture(page)
  await swipe(page, -120, 0)
  await expectExactlyOneMove(page, 'left')
  expect(problems).toEqual([])
})

test('滑动向右：一次划动恰好一次 Move', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile', '只有手机视口划得动')
  const problems = watchProblems(page)
  await openFixture(page)
  await swipe(page, 120, 0)
  await expectExactlyOneMove(page, 'right')
  expect(problems).toEqual([])
})

test('短滑与轻点：一次 Move 都不触发', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile', '只有手机视口划得动')
  const problems = watchProblems(page)
  await openFixture(page)

  // 15px：阈值是 24（SwipeGesture.ts），差 9px，够不着的划动
  await swipe(page, 0, -15)
  await expect(page.locator('[data-tile-id]')).toHaveCount(1)
  await expect(page.locator('[data-tile-id="1"]')).toHaveAttribute('data-row', '1')
  await expect(page.locator('[data-tile-id="1"]')).toHaveAttribute('data-col', '1')
  await expect(page.locator('[data-score]')).toHaveText('0')

  // 原地轻点：位移为 0，识别器按「没有位移就没有方向」挡掉。
  // 上一刀没动盘面，所以这里仍然是同一个开局局面
  await swipe(page, 0, 0)
  await expect(page.locator('[data-tile-id]')).toHaveCount(1)
  await expect(page.locator('[data-tile-id="1"]')).toHaveAttribute('data-row', '1')
  await expect(page.locator('[data-tile-id="1"]')).toHaveAttribute('data-col', '1')
  await expect(page.locator('[data-score]')).toHaveText('0')

  expect(problems).toEqual([])
})

test('方向按钮：向上', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile', '只有手机视口摆得下方向按钮')
  const problems = watchProblems(page)
  await openFixture(page)
  await page.getByRole('button', { name: '向上' }).click()
  await expectExactlyOneMove(page, 'up')
  expect(problems).toEqual([])
})

test('方向按钮：向下', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile', '只有手机视口摆得下方向按钮')
  const problems = watchProblems(page)
  await openFixture(page)
  await page.getByRole('button', { name: '向下' }).click()
  await expectExactlyOneMove(page, 'down')
  expect(problems).toEqual([])
})

test('方向按钮：向左', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile', '只有手机视口摆得下方向按钮')
  const problems = watchProblems(page)
  await openFixture(page)
  await page.getByRole('button', { name: '向左' }).click()
  await expectExactlyOneMove(page, 'left')
  expect(problems).toEqual([])
})

test('方向按钮：向右', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile', '只有手机视口摆得下方向按钮')
  const problems = watchProblems(page)
  await openFixture(page)
  await page.getByRole('button', { name: '向右' }).click()
  await expectExactlyOneMove(page, 'right')
  expect(problems).toEqual([])
})

test('键盘路径无回归：两个视口都仍然只走 onMove 那一条', async ({ page }) => {
  const problems = watchProblems(page)
  await openFixture(page)

  // 显式聚焦：开局界面的「开始游戏」已经卸载，焦点退给 body 了。
  // 这一步不在被测行为里（键盘归属由 game.spec.ts 专门钉），只是让按键不因焦点
  // 落在哪而悬空
  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowUp')
  await expectExactlyOneMove(page, 'up')

  // WASD 走的是同一张 MOVE_KEYS 表，同样只触发一次。重开一局而不是接着按：盘面
  // 只有一块时一次移动不可能合并，于是这条断言不掺任何随机分支（接着按下去，
  // 新生成那块的位置由 seed 定，可能正好凑出一对同值）
  await openFixture(page)
  await page.keyboard.press('w')
  await expectExactlyOneMove(page, 'up')

  expect(problems).toEqual([])
})

test('桌面视口：方向按钮不在布局里，键盘路径不变', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', '只有桌面视口没有触摸')
  const problems = watchProblems(page)
  await openFixture(page)

  // 断言的是**不存在**，不是「看不见」：display:none 的盒子被无障碍树摘掉，
  // getByRole 一条都找不到
  for (const name of ['向上', '向下', '向左', '向右']) {
    await expect(
      page.getByRole('button', { name }),
      `${name} 不该出现在桌面视口`
    ).toHaveCount(0)
  }

  // 「不占用布局」的几何证据：盒子既不是零尺寸占位，也没在 flex/gap 里留一道缝。
  //   · display 是 none——页面根本不排它，flex 的 gap 不为它留任何空隙；
  //   · 量不到矩形（getBoundingClientRect 全 0）证明它一个像素都没占
  const metrics = await page.locator('.dpad').evaluate((el) => {
    const style = getComputedStyle(el)
    const rect = el.getBoundingClientRect()
    return { display: style.display, width: rect.width, height: rect.height }
  })
  expect(metrics.display).toBe('none')
  expect(metrics.width).toBe(0)
  expect(metrics.height).toBe(0)

  // 提示的键盘那一版照旧，触摸那一版同样不占位
  await expect(page.locator('.hint__pointer')).toBeVisible()
  await expect(page.locator('.hint__touch')).toBeHidden()

  // 键盘路径：桌面视口上一如既往
  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowLeft')
  await expectExactlyOneMove(page, 'left')

  expect(problems).toEqual([])
})
