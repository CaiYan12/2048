import { expect, test, type Page } from '@playwright/test'
import { STYLE_CATALOG } from '../../src/shared/styleCatalog'
import { closeSettings, openSettings, pickStyle } from './settings-helpers'

/**
 * 风格行：设置抽屉的第二件租客（T42 · 父规格 docs/specs/style-picker.md · GitHub #45）。
 *
 * 与 settings-drawer.spec.ts 同一条理由：抽屉是**外壳**不是第五个插槽，三套风格只出
 * token 与 CSS——所以同一组不变量对三套各跑一遍，文件里没有一句「Classic 会怎样」的
 * 分叉，差别只走各自的计算样式（对比度由 contrast-computed 那一票量，这里不重复）。
 *
 * 契约逐条（与票据 T42 的验收标准对应，决策号是父规格的）：
 *   1. 行语法照静音行（决策 3）：左静态 `<span id>` 标签 + 右触发钮，可访问名由
 *      `aria-labelledby` 引用；整行可点；触发钮是 `.control`、显示当前风格名、报
 *      `aria-expanded` + `aria-haspopup="listbox"`、**没有 `aria-pressed`**；
 *   2. 行摆在静音行下面（验收标准的「below the sound row」）；
 *   3. 自绘 listbox（决策 2）：选项从注册表 THEMES 长出来，DOM 顺序 = 目录顺序，
 *      当前项标 `aria-selected`；
 *   4. 焦点进列表（决策 5）：展开那一刻 DOM 焦点落在**选中项**上；`ArrowUp` /
 *      `ArrowDown` 循环、`Home` / `End` 跳两头，移的是真实焦点（没有
 *      `aria-activedescendant`），且不推棋、不滚页（SPEC §3.4 的第二个放行例外）；
 *   5. `Enter`（与点选项同效，用户故事 8）选中并收列表，焦点回触发钮、触发钮的名字
 *      与整页换肤都跟上；抽屉不关、焦点不丢；
 *   6. 三层 `Esc`（决策 6）：列表开着只收列表（抽屉与底下的摊都无恙），再按才收抽屉，
 *      第三按才轮到底下的摊；收列表后焦点回触发钮；
 *   7. 指针（决策 8）：点选项即选中；点抽屉里列表之外的地方**只收列表**；遮罩照旧
 *      收整个抽屉；
 *   8. 主面板那组风格按钮没有了（行为变化）：局中不再有 `role="group"` 名「风格」，
 *      开局界面的按钮组是唯一的一个（它自己的测试用本地查询，不归这份契约管）。
 *
 * 键盘导航在局中验：棋盘动没动只有在有棋子的局里才可观测。局面确定性来自
 * `?seed=` + `?board=`（与 settings-drawer.spec.ts 同一款夹具）。
 */

/** 行优先局面 → board 参数值（空串 = 空格） */
function boardQuery(rows: (number | null)[][]): string {
  return rows.flat().map((value) => value ?? '').join(',')
}

/** 开局 URL：固定种子让局面可预期 */
function startUrl(rows: (number | null)[][]): string {
  return `/?seed=20260926&board=${boardQuery(rows)}`
}

/** 活跃局：第 3 行右端留一个空格，四个方向都推得动——「棋盘动没动」因此可观测 */
const ACTIVE: (number | null)[][] = [
  [2, 4, 8, 16],
  [4, 8, 16, 2],
  [8, 16, 2, 4],
  [16, 2, 4, null],
]

/** 开局：选风格 → 开始游戏（走抽屉路径——T42 起这是唯一的选风格路径） */
async function startRun(
  page: Page,
  styleId: (typeof STYLE_CATALOG)[number]['id'],
  url: string
): Promise<void> {
  await page.goto(url)
  const label = STYLE_CATALOG.find((entry) => entry.id === styleId)?.label ?? styleId
  await pickStyle(page, label)
  await expect(page.locator('main')).toHaveAttribute('data-style', styleId)
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()
}

/** 收集 console / page 错误：新挂的组件若有 React 警告要当场看见 */
function watchProblems(page: Page): string[] {
  const problems: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  return problems
}

/** 棋盘的一行式快照：方块的身份、位置与值拼成一行，动没动一眼可比 */
async function boardSnapshot(page: Page): Promise<string> {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-tile-id]')]
      .map(
        (tile) =>
          `${tile.getAttribute('data-tile-id')}@${tile.getAttribute('data-row')},` +
          `${tile.getAttribute('data-col')}=${tile.getAttribute('data-value')}`
      )
      .join('|')
  )
}

/** 风格行、触发钮、列表、第 i 个选项——一份口径，全文件共用 */
const styleRow = (page: Page) => page.locator('[data-style-row]')
const trigger = (page: Page) => page.locator('[data-settings-drawer]').getByRole('button', { name: '风格' })
const listBox = (page: Page) => page.locator('[data-style-list]')
const optionAt = (page: Page, id: string) => page.locator(`[data-style-option="${id}"]`)

for (const style of STYLE_CATALOG) {
  const index = STYLE_CATALOG.findIndex((entry) => entry.id === style.id)
  /** 目录里 style 的下一套（循环取模）：「选一个别的风格」永远有确定的答案 */
  const next = STYLE_CATALOG[(index + 1) % STYLE_CATALOG.length]

  test.describe(`${style.label} · 风格行`, () => {
    test('行结构与触发钮：静音行下面的第二行；整行可点；名字由 aria-labelledby 引静态标签；展开态全报在 aria-expanded 上', async ({
      page,
    }) => {
      const problems = watchProblems(page)
      await startRun(page, style.id, startUrl(ACTIVE))
      await openSettings(page)

      // ① 行摆在静音行下面：抽屉里就两行，风格行的 y 更大
      const rows = page.locator('.settings-row')
      await expect(rows, `${style.label}：抽屉里不是两行设置`).toHaveCount(2)
      const muteBox = await rows.nth(0).boundingBox()
      const styleBox = await styleRow(page).boundingBox()
      expect(
        styleBox?.y ?? -1,
        `${style.label}：风格行没有摆在静音行下面`
      ).toBeGreaterThan(muteBox?.y ?? Number.MAX_SAFE_INTEGER)

      // ② 行语法照静音行：左静态标签 + 右触发钮，可访问名由 aria-labelledby 引用
      const label = styleRow(page).locator('.settings-row__label')
      await expect(label, `${style.label}：行标签不是「风格」`).toHaveText('风格')
      await expect(label).toHaveAttribute('id', 'settings-style-label')
      await expect(trigger(page)).toHaveAttribute('aria-labelledby', 'settings-style-label')
      await expect(trigger(page), `${style.label}：触发钮的可访问名不是行标签`).toHaveAccessibleName(
        '风格'
      )
      // 触发钮显示**当前风格名**，并且是 .control 那一族
      await expect(trigger(page)).toHaveText(style.label)
      expect(
        await trigger(page).evaluate((element) => element.classList.contains('control')),
        `${style.label}：触发钮不是 .control`
      ).toBe(true)

      // ③ 展开态全报在 aria-expanded 上，没有 aria-pressed（「展开」与「按下」是两件事）
      await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false')
      await expect(trigger(page)).toHaveAttribute('aria-haspopup', 'listbox')
      expect(
        await trigger(page).getAttribute('aria-pressed'),
        `${style.label}：触发钮不该有 aria-pressed`
      ).toBeNull()

      // ④ 整行可点：点**标签**（不是触发钮）也开列表——规格明写的、可测的意图
      await label.click()
      await expect(listBox(page), `${style.label}：点行标签没有开出列表`).toBeVisible()
      await expect(trigger(page)).toHaveAttribute('aria-expanded', 'true')
      await expect(listBox(page)).toHaveAttribute('role', 'listbox')
      await expect(listBox(page)).toHaveAttribute('aria-labelledby', 'settings-style-label')

      // ⑤ 选项就是注册表：DOM 顺序 = 目录顺序，当前项标 aria-selected，别的都不标
      const options = listBox(page).getByRole('option')
      await expect(options, `${style.label}：选项不是三个`).toHaveCount(STYLE_CATALOG.length)
      for (let i = 0; i < STYLE_CATALOG.length; i += 1) {
        const entry = STYLE_CATALOG[i]
        await expect(optionAt(page, entry.id), `${style.label}：第 ${i} 项不在注册表顺序上`).toHaveText(
          entry.label
        )
        const selected = entry.id === style.id ? 'true' : 'false'
        await expect(
          optionAt(page, entry.id),
          `${style.label}：${entry.label} 的 aria-selected 应为 ${selected}`
        ).toHaveAttribute('aria-selected', selected)
      }

      // ⑥ 再点一次行标签收上（整行是开关，不是单向阀）
      await label.click()
      await expect(listBox(page), `${style.label}：再点行标签没有收上列表`).toHaveCount(0)
      await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false')

      // ⑦ 键盘照旧进得来：触发钮拿到焦点后按 Enter（按钮的默认激活）冒泡成行点击
      await trigger(page).focus()
      await page.keyboard.press('Enter')
      await expect(listBox(page), `${style.label}：键盘激活触发钮没有开出列表`).toBeVisible()
      await trigger(page).click()
      await expect(listBox(page)).toHaveCount(0)

      await closeSettings(page)
      expect(problems, `${style.label}：console / page 出错了`).toEqual([])
    })

    test('焦点进列表：展开落在选中项；箭头循环、Home/End 跳两头；Enter 选中并收列表、焦点与换肤都跟上；棋盘一步未动', async ({
      page,
    }) => {
      const problems = watchProblems(page)
      await startRun(page, style.id, startUrl(ACTIVE))
      await openSettings(page)

      // ① 展开那一刻，DOM 焦点落在**选中项**上（决策 5——不是高亮一个影子）
      await trigger(page).click()
      await expect(
        listBox(page).locator('[aria-selected="true"]'),
        `${style.label}：展开后焦点没有落在选中项上`
      ).toBeFocused()
      expect(
        await listBox(page).locator('[aria-selected="true"]').getAttribute('data-style-option'),
        `${style.label}：标着选中的不是当前风格`
      ).toBe(style.id)

      // ② 导航键移真实焦点：下一项 / 上一项 / 两头 / 两端循环。全程棋盘一个格子不动、
      //    页面一像素不滚（SPEC §3.4 的第二个放行例外——这些键归列表，不归棋盘）
      const beforeBoard = await boardSnapshot(page)
      const beforeScroll = await page.evaluate(() => window.scrollY)
      await page.keyboard.press('ArrowDown')
      await expect(
        optionAt(page, STYLE_CATALOG[(index + 1) % STYLE_CATALOG.length].id),
        `${style.label}：ArrowDown 没有移到下一项`
      ).toBeFocused()
      await page.keyboard.press('ArrowUp')
      await expect(optionAt(page, style.id), `${style.label}：ArrowUp 没有移回来`).toBeFocused()
      await page.keyboard.press('Home')
      await expect(
        optionAt(page, STYLE_CATALOG[0].id),
        `${style.label}：Home 没有跳到第一项`
      ).toBeFocused()
      await page.keyboard.press('End')
      await expect(
        optionAt(page, STYLE_CATALOG[STYLE_CATALOG.length - 1].id),
        `${style.label}：End 没有跳到最后一项`
      ).toBeFocused()
      await page.keyboard.press('ArrowDown')
      await expect(
        optionAt(page, STYLE_CATALOG[0].id),
        `${style.label}：从最后一项 ArrowDown 没有绕回第一项`
      ).toBeFocused()
      await page.keyboard.press('ArrowUp')
      await expect(
        optionAt(page, STYLE_CATALOG[STYLE_CATALOG.length - 1].id),
        `${style.label}：从第一项 ArrowUp 没有绕回最后一项`
      ).toBeFocused()
      expect(
        await boardSnapshot(page),
        `${style.label}：列表里按方向键把棋盘推动了`
      ).toBe(beforeBoard)
      expect(
        await page.evaluate(() => window.scrollY),
        `${style.label}：列表里按方向键把页面滚走了`
      ).toBe(beforeScroll)

      // ③ Enter 选中此刻聚焦的那一项并收列表：焦点回触发钮、触发钮的名字换、整页换肤，
      //    抽屉**不**跟着关。此刻焦点在最后一项（②的末尾绕到了那儿），选中的就是它
      await page.keyboard.press('Enter')
      const last = STYLE_CATALOG[STYLE_CATALOG.length - 1]
      await expect(listBox(page), `${style.label}：Enter 之后列表还开着`).toHaveCount(0)
      await expect(trigger(page), `${style.label}：Enter 之后焦点没有回触发钮`).toBeFocused()
      await expect(trigger(page), `${style.label}：触发钮的名字没有跟上新风格`).toHaveText(
        last.label
      )
      await expect(
        page.locator('main'),
        `${style.label}：Enter 选中后整页没有换肤`
      ).toHaveAttribute('data-style', last.id)
      await expect(
        page.locator('[data-settings-drawer]'),
        `${style.label}：选风格把抽屉也关了`
      ).toBeVisible()

      // ④ aria-selected 挪到了新选中项——选项只在列表开着时存在，重新展开看一眼
      await trigger(page).click()
      await expect(
        optionAt(page, last.id),
        `${style.label}：选完之后 aria-selected 没有挪到新选中项`
      ).toHaveAttribute('aria-selected', 'true')
      await trigger(page).click()
      await expect(listBox(page)).toHaveCount(0)

      await closeSettings(page)
      expect(problems, `${style.label}：console / page 出错了`).toEqual([])
    })

    test('三层 Esc：列表开着只收列表；再按收抽屉；底下的交换摊两次都无恙', async ({ page }) => {
      const problems = watchProblems(page)
      await startRun(page, style.id, startUrl(ACTIVE))

      // 先把底下的摊摆好：交换摊开着
      await page.getByRole('button', { name: '交换' }).click()
      await expect(page.locator('.board__tile[data-selectable="true"]')).not.toHaveCount(0)

      await openSettings(page)
      await trigger(page).click()
      await expect(listBox(page)).toBeVisible()

      // 第一层：Esc 只收列表——抽屉还在台上，底下的摊也原封不动
      await page.keyboard.press('Escape')
      await expect(listBox(page), `${style.label}：Esc 没有收掉列表`).toHaveCount(0)
      await expect(
        page.locator('[data-settings-drawer]'),
        `${style.label}：收列表那一下把抽屉也关了`
      ).toBeVisible()
      await expect(
        page.locator('.board__tile[data-selectable="true"]'),
        `${style.label}：收列表那一下把底下的交换摊收了`
      ).not.toHaveCount(0)
      // 焦点回触发钮（收列表 = 回到展开前的位置）
      await expect(trigger(page), `${style.label}：收列表后焦点没有回触发钮`).toBeFocused()

      // 第二层：再按 Esc 才轮到抽屉
      await page.keyboard.press('Escape')
      await expect(page.locator('[data-settings-drawer]')).toHaveCount(0)
      await expect(
        page.locator('.board__tile[data-selectable="true"]'),
        `${style.label}：关抽屉那一下把底下的交换摊也收了`
      ).not.toHaveCount(0)

      // 第三层：摊此刻就是最上面那层，第三次 Esc 收它
      await page.keyboard.press('Escape')
      await expect(
        page.locator('.board__tile[data-selectable="true"]'),
        `${style.label}：第三次 Esc 没有收掉交换摊`
      ).toHaveCount(0)

      expect(problems, `${style.label}：console / page 出错了`).toEqual([])
    })

    test('指针：点选项即选中并收列表、抽屉与焦点无恙；点抽屉里列表外只收列表；遮罩照旧收整个抽屉', async ({
      page,
    }) => {
      const problems = watchProblems(page)
      await startRun(page, style.id, startUrl(ACTIVE))
      await openSettings(page)

      // ① 点选项 = 选中（用户故事 8）：列表收上、焦点回触发钮、名字与整页换肤跟上、
      //    抽屉不关——局中换肤不断焦
      await trigger(page).click()
      await optionAt(page, next.id).click()
      await expect(listBox(page), `${style.label}：点选项之后列表还开着`).toHaveCount(0)
      await expect(
        page.locator('[data-settings-drawer]'),
        `${style.label}：点选项把抽屉也关了`
      ).toBeVisible()
      await expect(trigger(page), `${style.label}：点选项之后焦点没有回触发钮`).toBeFocused()
      await expect(trigger(page), `${style.label}：触发钮的名字没有跟上新风格`).toHaveText(
        next.label
      )
      await expect(
        page.locator('main'),
        `${style.label}：抽屉开着换风格，整页没有换肤`
      ).toHaveAttribute('data-style', next.id)

      // ② 决策 8：列表开着时，点抽屉里**列表之外**的地方（这里点标题）只收列表，
      //    抽屉照旧开着——「外侧」的裁决权只在遮罩手里
      await trigger(page).click()
      await expect(listBox(page)).toBeVisible()
      await page.locator('.settings-drawer__title').click()
      await expect(listBox(page), `${style.label}：点抽屉里列表外没有收掉列表`).toHaveCount(0)
      await expect(
        page.locator('[data-settings-drawer]'),
        `${style.label}：点抽屉里列表外把抽屉也关了`
      ).toBeVisible()

      // ③ 遮罩仍旧收整个抽屉（列表开着也不豁免）
      await trigger(page).click()
      await expect(listBox(page)).toBeVisible()
      await page.mouse.click(8, 300)
      await expect(
        page.locator('[data-settings-drawer]'),
        `${style.label}：点遮罩没有关掉抽屉`
      ).toHaveCount(0)

      expect(problems, `${style.label}：console / page 出错了`).toEqual([])
    })

    test('Tab 收列表接着走查：列表收上、焦点离开选项与触发钮、不落在被 inert 的页面内容上', async ({
      page,
    }) => {
      const problems = watchProblems(page)
      await startRun(page, style.id, startUrl(ACTIVE))
      await openSettings(page)

      await trigger(page).click()
      await expect(listBox(page)).toBeVisible()

      // Tab 的契约：收列表 + 焦点先回触发钮、再让默认动作从触发钮接着走（不
      // preventDefault）。所以一次 Tab 之后：列表没了、焦点不在任何选项上、也不在
      // 触发钮上（它只是中转站），且绝没有越过抽屉落到被 inert 的页面内容里
      await page.keyboard.press('Tab')
      await expect(listBox(page), `${style.label}：Tab 没有收掉列表`).toHaveCount(0)
      const where = await page.evaluate(() => {
        const element = document.activeElement
        if (element === null || element === document.body) return 'body'
        if (element.closest('[data-style-option]') !== null) return 'option'
        if (element.closest('[data-settings-drawer]') !== null) return 'drawer'
        if (element.closest('main > div.contents') !== null) return 'page'
        return 'other'
      })
      expect(where, `${style.label}：Tab 之后焦点落在了 ${where}`).not.toBe('option')
      expect(where, `${style.label}：Tab 把焦点送进了被 inert 的页面内容`).not.toBe('page')
      // 焦点确实还在走查（没有凭空消失）：往回一步该回到触发钮——它与收着列表时
      // 从触发钮按 Tab 是同一条路，这是「Tab 序不断」的可测版本
      await page.keyboard.press('Shift+Tab')
      await expect(trigger(page), `${style.label}：Shift+Tab 没有回到触发钮`).toBeFocused()

      await closeSettings(page)
      expect(problems, `${style.label}：console / page 出错了`).toEqual([])
    })
  })
}

/**
 * 风格按钮存在的地方只有一个（与风格无关，只跑一遍）：
 * 开局界面的按钮组是唯一的 `role="group"` 名「风格」；局中那一组已经摘除，
 * 抽屉里唯一的「风格」控件是触发钮。
 */
test('主面板那组风格按钮没有了：开局界面的组是唯一的一个，局中只剩抽屉里的触发钮', async ({
  page,
}) => {
  const problems = watchProblems(page)

  // 开局界面：恰好一个「风格」组，按钮按目录顺序排——它自己的测试在用本地查询，
  // 这里只钉「全世界只有一个」这个数
  await page.goto('/?seed=20260926')
  const group = page.getByRole('group', { name: '风格' })
  await expect(group, '开局界面的「风格」组不在').toHaveCount(1)
  const groupButtons = group.getByRole('button')
  await expect(groupButtons).toHaveCount(STYLE_CATALOG.length)
  for (let i = 0; i < STYLE_CATALOG.length; i += 1) {
    await expect(groupButtons.nth(i)).toHaveText(STYLE_CATALOG[i].label)
  }

  // 局中：组没了；抽屉收着时连触发钮也没有（列表只在抽屉里）
  await startRun(page, STYLE_CATALOG[0].id, startUrl(ACTIVE))
  await expect(
    page.getByRole('group', { name: '风格' }),
    '局中还留着主面板的「风格」组'
  ).toHaveCount(0)
  await expect(trigger(page), '抽屉收着时「风格」触发钮不该在').toHaveCount(0)

  // 抽屉开着：触发钮恰好一颗，列表收着时一个选项都不在
  await openSettings(page)
  await expect(trigger(page), '抽屉开着时「风格」触发钮不在').toHaveCount(1)
  await expect(listBox(page)).toHaveCount(0)

  await closeSettings(page)
  expect(problems).toEqual([])
})
