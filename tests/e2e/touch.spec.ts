import { expect, test, type Page } from '@playwright/test'

/**
 * T10 的触屏纵向切片：四方向滑动各触发恰好一次 Move、短滑与轻点不误触、四个方向
 * 按钮各一次、键盘路径两个视口都不回退；桌面视口上方向按钮不在布局里。
 * 「只判一次」由两段合起来看：松手**之前**盘面一格不动（swipe 里那条），松手之后
 * 恰好只多出一个方块（expectExactlyOneMove）。中间那一段不能省——引擎的空操作 Move
 * 原对象原样返回，第二发若是空操作，前后两个棋盘在 DOM 上完全无法区分。
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
 *
 * 中间那条断言是「一次划动只判一次」唯一的直接证据：**划到位、还没松手的那一刻，盘面
 * 一个格子都不能动**。识别器若在阈值跨越那一刻就触发（例如把监听挂回 pointermove），
 * 盘面会在松手之前先动一次；而松手后的棋盘断言只看得出「多走了一步」，看不出这一步
 * 是先走的——所以那条洞只能从松手之前堵。松手后那三条补不上它的原因不是断言写得弱，
 * 是信息不存在：引擎的空操作 Move 原对象原样返回（不生成、不计分、不换棋盘），于是
 * 第二发是不是空操作全由 seed 把生成落在哪决定，那一种情况下前后两个棋盘在 DOM 上
 * 一模一样。与 seed 无关的那一条只能加在松手之前。
 *
 * 「方块数一个不差」就等于「一次都没触发」：一次合法 Move 必然多出一个方块。
 */
async function swipe(page: Page, dx: number, dy: number): Promise<void> {
  const box = await page.locator('[data-board]').boundingBox()
  if (!box) throw new Error('棋盘不在 DOM 里')
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  // 起手之前的方块数：这一趟划动唯一合法的效果就是「松手那一刻多出一个」
  const before = await page.locator('[data-tile-id]').count()
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 8 })
  await expect(page.locator('[data-tile-id]')).toHaveCount(before)
  await page.mouse.up()
}

/**
 * 「恰好一次」的三条断言：
 *   1. 开局那块落在该落的那一格（方向对）；
 *   2. 方块总数只多出一个（连触两次会多出两个）；
 *   3. 分数还是 0：这一局没有可合并的对，所以分数不为 0 就说明多走的那一步顺手合了
 *      一次。单独看它最弱（不动分的话它恒为 0），它只是前两条的兜底，不是主力。
 *
 * 第 2 条抓得到「多走了一步」，但抓不全：第二发若是空操作，棋盘与只走一步时一模一样
 * （引擎的空操作 Move 原对象原样返回，理由见 swipe 的注释）。所以这三条与 swipe 中间
 * 那一条各管一段——松手之前那一条管「判得太早」，这三条管「判得太多」，缺任一段都有
 * 回归能悄悄过去。
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

/**
 * 收集 console / page 错误：新输入路径不该带出任何 React 警告。
 *
 * 它安在 beforeEach / afterEach 而不是十二个用例体里，理由有两条：一是它本来就是「环境
 * 应该是什么样」，不是用例的主张——功能整个删掉它也会绿；二是写在用例体里就成了十二
 * 个会忘记的地方，而忘记的那一个不会有任何提示。beforeEach 装收集器，afterEach 断言
 * 它收空：跳过的用例不走钩子，也不会误报。
 */
function watchProblems(page: Page): string[] {
  const problems: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  return problems
}

let problems: string[] = []

test.beforeEach(({ page }) => {
  problems = watchProblems(page)
})

test.afterEach(() => {
  expect(problems, '新输入路径不该带出任何 console / page 错误').toEqual([])
})

/**
 * 项目名必须还是 desktop 与 mobile。
 *
 * 本文件里靠 `test.info().project.name !== 'mobile'` 决定跑不跑的用例有十条，那是字符串
 * 比对：哪天有人把 playwright.config.ts 里的 mobile 改名（'phone' / 'iPhone' ……），十条
 * 用例会在**每一个**项目里安静地跳过，整轮扫描照样全绿——触屏覆盖就这样被无声关掉，而
 * 看结果的人只会看到「没跑」。这一条在哪个项目里都跑，名字不在预期集合内就红，改名只能
 * 大声地失败。
 */
test('项目名：mobile 与 desktop 都还在跑', () => {
  expect(
    ['desktop', 'mobile'],
    '项目名被改过，十条靠 project.name 决定跑不跑的用例会全部静默跳过'
  ).toContain(test.info().project.name)
})

test('手机视口：指针真的是「粗」的，四个方向按钮真的在布局里', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile', '只有手机视口是触摸环境')
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
  // touch-action: none 是验收标准 1 在真机上成立的唯一一行（board.css 的 .board）：
  // 不设它，一次纵向划动先被浏览器读成滚页面，手势在阈值还没到的时候就变成
  // pointercancel，玩家看到的是「滑了没反应」。删掉这一行，本文件其余每一条用例仍然
  // 全绿（仿真环境里页面滚不滚不影响它们的断言），所以它必须自己单独钉一条
  expect(
    await page.locator('[data-board]').evaluate((el) => getComputedStyle(el).touchAction)
  ).toBe('none')
  // 触摸版提示进场，键盘那一版让位。用类名而不是 getByText：那两个 span 的文本会
  // 一起构成 <p> 的文本内容，按文本查找会同时命中父元素
  await expect(page.locator('.hint__touch')).toBeVisible()
  await expect(page.locator('.hint__touch')).toHaveText('滑动或点方向按钮移动方块')
  await expect(page.locator('.hint__pointer')).toBeHidden()
})

test('滑动向上：一次划动恰好一次 Move', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile', '只有手机视口划得动')
  await openFixture(page)
  await swipe(page, 0, -120)
  await expectExactlyOneMove(page, 'up')
})

test('滑动向下：一次划动恰好一次 Move', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile', '只有手机视口划得动')
  await openFixture(page)
  await swipe(page, 0, 120)
  await expectExactlyOneMove(page, 'down')
})

test('滑动向左：一次划动恰好一次 Move', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile', '只有手机视口划得动')
  await openFixture(page)
  await swipe(page, -120, 0)
  await expectExactlyOneMove(page, 'left')
})

test('滑动向右：一次划动恰好一次 Move', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile', '只有手机视口划得动')
  await openFixture(page)
  await swipe(page, 120, 0)
  await expectExactlyOneMove(page, 'right')
})

test('短滑与轻点：一次 Move 都不触发', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile', '只有手机视口划得动')
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
})

test('方向按钮：向上', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile', '只有手机视口摆得下方向按钮')
  await openFixture(page)
  await page.getByRole('button', { name: '向上' }).click()
  await expectExactlyOneMove(page, 'up')
})

test('方向按钮：向下', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile', '只有手机视口摆得下方向按钮')
  await openFixture(page)
  await page.getByRole('button', { name: '向下' }).click()
  await expectExactlyOneMove(page, 'down')
})

test('方向按钮：向左', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile', '只有手机视口摆得下方向按钮')
  await openFixture(page)
  await page.getByRole('button', { name: '向左' }).click()
  await expectExactlyOneMove(page, 'left')
})

test('方向按钮：向右', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile', '只有手机视口摆得下方向按钮')
  await openFixture(page)
  await page.getByRole('button', { name: '向右' }).click()
  await expectExactlyOneMove(page, 'right')
})

test('键盘路径无回归：两个视口都仍然只走 onMove 那一条', async ({ page }) => {
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
})

test('桌面视口：方向按钮不在布局里，键盘路径不变', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', '只有桌面视口没有触摸')
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
})
