import { expect, test, type Locator, type Page } from '@playwright/test'
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
 * **T43 视觉修订**（人眼复核驳回「不符合下拉框准则」后的定案，决策 3 / 14 修订段 +
 * 三张设计卡 §12）在上表行为契约之上补三条，逐套分量：
 *   9. 触发钮是选择框的形状：`flex: 1` 占满剩余行宽、风格名靠左、chevron 靠右
 *      （内联 SVG 走 `currentColor`，列表开着时旋转 180°——transform，不碰布局）；
 *  10. 菜单是一块有边界的浮层：底色逐套换一档（Classic / Material `--control-bg-hover`、
 *      Claude `--page`，**不等于抽屉面**）、圆角逐套取 toast 那一档、边界逐套各自语言
 *      （Classic 亮墨发丝线 / Material 比抽屉高一档的投影 / Claude `--control-border` 细线）；
 *
 * **T44 视觉修订**（第二次人眼复核 BLOCK：「大矩形方块观感尤为不适，不要。均改为仅选项的
 * 底色变化」；决策 14 的 T44 修订段 + 三张设计卡 §12「风格选择（T42 · T43 · T44 修订）」）
 * 把上面第 11 条整条换掉：
 *  11'. 列表态只剩底色、两档，无环、无选中块：hover 与键盘聚焦各一档底色（逐套见下表），
 *      两档分净、也都不等于菜单面；聚焦的选项没有任何 outline / box-shadow；选中项
 *      （`aria-selected="true"`）不再有填充——属性照旧渲染（读屏与行为断言点），底回到菜单面；
 *      焦点与 hover 同落一枚选项时**以聚焦为准**（`:focus` 规则写在 `:hover` 之后，级联
 *      顺序是承重墙——换序必红，见下面那条专门用例）。对比度比值归 contrast-computed 那一票
 *      量，这里不重复。
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

/**
 * T43 逐套期望值（设计卡 §12「风格选择（T42 · T43 修订）」）：菜单面与圆角三套通用。
 * 底色全部「比抽屉面换一档」——T42 被驳回的正是菜单面与抽屉面逐字节同值。颜色写成
 * `rgb()` 因为 getComputedStyle 读回来的是这个形式（与 claude.spec.ts 断选中项同一路子）。
 */
const MENU_SURFACE = {
  classic: {
    /** --control-bg-hover #5f564e */
    background: 'rgb(95, 86, 78)',
    /** --cell-radius（toast 那一档） */
    radius: '6px',
  },
  material: {
    /** --control-bg-hover #d8cee8 */
    background: 'rgb(216, 206, 232)',
    /** --cell-radius（toast 那一档） */
    radius: '12px',
  },
  claude: {
    /** --page #f0eee6 */
    background: 'rgb(240, 238, 230)',
    /** --board-radius */
    radius: '4px',
  },
} as const

/** 发丝线语言的两套色（Material 的边界语言是投影，不在此表）：Classic --ink-bright / Claude --control-border */
const MENU_HAIRLINE = {
  classic: 'rgb(249, 246, 242)',
  claude: 'rgb(133, 124, 109)',
} as const

/** Material 菜单投影那一档的最大模糊（M3 elevation level 4；抽屉那一档是 8px，本表用于「高一档」的精确断言） */
const MENU_SHADOW_BLUR = 10

/**
 * T44 逐套两档底色（设计卡 §12「风格选择（T42 · T43 · T44 修订）」）：hover 与键盘聚焦各一档，
 * 两档分净、也都不等于菜单面。色值逐套从各自既有 ramp 取，零新色值；`rgb()` 形式因为
 * getComputedStyle 读回来的就是这个（与 MENU_SURFACE 同一路子）。
 */
const HOVER_SHADE = {
  /** --control-bg #6f6055（亮一步，退回抽屉面那一档） */
  classic: 'rgb(111, 96, 85)',
  /** --control-bg #e8def8（亮一步） */
  material: 'rgb(232, 222, 248)',
  /** --control-bg-hover #e3dccc（暗一步） */
  claude: 'rgb(227, 220, 204)',
} as const

const FOCUS_SHADE = {
  /** --focus #4a443f（暗一步） */
  classic: 'rgb(74, 68, 63)',
  /** --cell-bg #e6e0e9（另一档浅步） */
  material: 'rgb(230, 224, 233)',
  /** --rule #b8af9b（再暗一档） */
  claude: 'rgb(184, 175, 155)',
} as const

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

    test('触发钮是选择框的形状（T43）：flex:1 占满剩余行宽、名左 chevron 右；开着时旋转 180°、不碰布局', async ({
      page,
    }) => {
      const problems = watchProblems(page)
      await startRun(page, style.id, startUrl(ACTIVE))
      await openSettings(page)

      // ① 占满剩余行宽：flex-grow 是 1，且触发钮顶到行右缘（标签只在左边占自动宽）
      const grow = await trigger(page).evaluate((element) => getComputedStyle(element).flexGrow)
      expect(grow, `${style.label}：触发钮没有 flex: 1 占满剩余行宽`).toBe('1')
      const rowBox = await styleRow(page).boundingBox()
      const triggerBox = await trigger(page).boundingBox()
      expect(
        Math.abs((triggerBox?.x ?? 0) + (triggerBox?.width ?? 0) - ((rowBox?.x ?? 0) + (rowBox?.width ?? 0))),
        `${style.label}：触发钮没有顶到行右缘`
      ).toBeLessThanOrEqual(1)

      // ② 名左 chevron 右：名字贴内容区左缘、chevron 贴内容区右缘，两者以触发钮中线分界
      const name = trigger(page).locator('.settings-style__name')
      const chevron = trigger(page).locator('.settings-style__chevron')
      const nameBox = await name.boundingBox()
      const chevronBox = await chevron.boundingBox()
      const insets = await trigger(page).evaluate((element) => {
        const style = getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        return {
          left: rect.left + parseFloat(style.paddingLeft),
          right: rect.right - parseFloat(style.paddingRight),
          middle: rect.left + rect.width / 2,
        }
      })
      expect(
        Math.abs((nameBox?.x ?? 0) - insets.left),
        `${style.label}：风格名没有靠左`
      ).toBeLessThanOrEqual(1.5)
      expect(
        Math.abs((chevronBox?.x ?? 0) + (chevronBox?.width ?? 0) - insets.right),
        `${style.label}：chevron 没有靠右`
      ).toBeLessThanOrEqual(1.5)
      expect(nameBox?.x ?? -1, `${style.label}：风格名跑到了右半`).toBeLessThan(insets.middle)
      expect(chevronBox?.x ?? -1, `${style.label}：chevron 跑到了左半`).toBeGreaterThan(insets.middle)
      // chevron 钉在右侧：flex: none（不参与剩余空间分配）
      const chevronFlex = await chevron.evaluate((element) => getComputedStyle(element).flexGrow)
      expect(chevronFlex, `${style.label}：chevron 没有 flex: none 钉在右侧`).toBe('0')

      // ③ chevron 是内联 SVG、颜色跟随按钮文字色（currentColor），且对读屏软件隐藏
      // stroke 写在 svg 上、path 继承（与齿轮同一条路），所以属性从 svg 读、计算值从 path 读
      const chevronRead = await chevron.evaluate((svg) => {
        const path = svg.querySelector('path')
        return {
          strokeAttr: svg.getAttribute('stroke') ?? '',
          strokeComputed: path === null ? '' : getComputedStyle(path).stroke,
          viewBox: svg.getAttribute('viewBox') ?? '',
          hidden: svg.getAttribute('aria-hidden'),
        }
      })
      const buttonColour = await trigger(page).evaluate((element) => getComputedStyle(element).color)
      expect(chevronRead.strokeAttr, `${style.label}：chevron 没有走 currentColor`).toBe('currentColor')
      expect(
        chevronRead.strokeComputed,
        `${style.label}：currentColor 没有解析成按钮文字色`
      ).toBe(buttonColour)
      expect(chevronRead.viewBox, `${style.label}：chevron 不是 24×24 量级的 viewBox`).toBe('0 0 24 24')
      expect(chevronRead.hidden, `${style.label}：chevron 没有对读屏软件隐藏`).toBe('true')

      // ④ 旋转：关着时归位、开着时 180°；aria-expanded 语义不变
      const closed = await chevron.evaluate((element) => ({
        transform: getComputedStyle(element).transform,
        box: element.getBoundingClientRect().toJSON(),
      }))
      expect(closed.transform, `${style.label}：收着时 chevron 没有归位`).toBe('none')
      await trigger(page).click()
      await expect(listBox(page)).toBeVisible()
      await expect(trigger(page)).toHaveAttribute('aria-expanded', 'true')
      const opened = await chevron.evaluate((element) => ({
        transform: getComputedStyle(element).transform,
        box: element.getBoundingClientRect().toJSON(),
      }))
      expect(opened.transform, `${style.label}：开着时 chevron 没有旋转 180°`).toBe('matrix(-1, 0, 0, -1, 0, 0)')
      // transform 不碰布局：旋转前后占位与尺寸一模一样（180° 的方块本来就该如此）
      expect(opened.box.width, `${style.label}：旋转把 chevron 的宽度碰了`).toBeCloseTo(closed.box.width, 1)
      expect(opened.box.height, `${style.label}：旋转把 chevron 的高度碰了`).toBeCloseTo(closed.box.height, 1)
      expect(opened.box.x, `${style.label}：旋转把 chevron 的横向位置碰了`).toBeCloseTo(closed.box.x, 1)
      // 再收上：归位
      await trigger(page).click()
      await expect(listBox(page)).toHaveCount(0)
      expect(
        await chevron.evaluate((element) => getComputedStyle(element).transform),
        `${style.label}：再收上时 chevron 没有归位`
      ).toBe('none')

      await closeSettings(page)
      expect(problems, `${style.label}：console / page 出错了`).toEqual([])
    })

    test('菜单面与列表态（T43 · T44）：逐套换档的面 ≠ 抽屉面、边界逐套各自语言；列表态只剩两档底色、无环无选中块', async ({
      page,
    }) => {
      const problems = watchProblems(page)
      await startRun(page, style.id, startUrl(ACTIVE))
      await openSettings(page)
      await trigger(page).click()
      await expect(listBox(page)).toBeVisible()

      // ① 菜单面逐套换一档，且不等于抽屉面（T42 被驳回的正是逐字节同值；T44 不动这一层）
      const surface = await listBox(page).evaluate((element) => {
        const style = getComputedStyle(element)
        return {
          background: style.backgroundColor,
          radius: style.borderTopLeftRadius,
          outlineWidth: style.outlineWidth,
          outlineStyle: style.outlineStyle,
          outlineColour: style.outlineColor,
          shadow: style.boxShadow,
        }
      })
      const drawer = await page
        .locator('[data-settings-drawer]')
        .evaluate((element) => {
          const style = getComputedStyle(element)
          return { background: style.backgroundColor, shadow: style.boxShadow, outlineColour: style.outlineColor }
        })
      const expected = MENU_SURFACE[style.id]
      expect(surface.background, `${style.label}：菜单面与抽屉面同值（没有换档）`).not.toBe(drawer.background)
      expect(surface.background, `${style.label}：菜单面不是设计卡那一档`).toBe(expected.background)
      expect(surface.radius, `${style.label}：菜单圆角不是 toast 那一档`).toBe(expected.radius)

      // ② 边界逐套各自语言：Classic 亮墨发丝线 / Material 比抽屉高一档的投影 / Claude 重一档的细线
      if (style.id === 'material') {
        const blur = (shadow: string): number =>
          Math.max(0, ...([...shadow.matchAll(/[\d.]+px/g)].map((match) => parseFloat(match[0]))))
        expect(surface.shadow, `${style.label}：菜单没有投影（本套说「在上」的语言就是 elevation）`).not.toBe('none')
        expect(
          blur(surface.shadow),
          `${style.label}：菜单的投影没有比抽屉高一档`
        ).toBeGreaterThan(blur(drawer.shadow))
        expect(
          blur(surface.shadow),
          `${style.label}：菜单的投影不是设计卡那一档（M3 level 4）`
        ).toBe(MENU_SHADOW_BLUR)
        expect(surface.shadow, `${style.label}：菜单的投影与抽屉同一档`).not.toBe(drawer.shadow)
      } else {
        expect(surface.outlineStyle, `${style.label}：菜单没有那一圈线`).toBe('solid')
        expect(surface.outlineWidth, `${style.label}：菜单那一圈不是 1px 细线`).toBe('1px')
        expect(surface.outlineColour, `${style.label}：菜单那一圈不是设计卡那个色`).toBe(
          MENU_HAIRLINE[style.id]
        )
        // Claude 那一档要比抽屉的 --rule 重：两条线不同色（细线更重，菜单压过抽屉）
        if (style.id === 'claude') {
          expect(surface.outlineColour, `${style.label}：菜单细线与抽屉同值（没有重一档）`).not.toBe(
            drawer.outlineColour
          )
        }
      }

      // ③ 展开那一刻焦点落在选中项上（决策 5），而列表态只剩底色：它显示的是**聚焦档**，
      //    不是选中块；选项上也没有任何环（outline 归零、box-shadow 归 none）。
      //    **两条展开路径都要守**：指针（上面那次 trigger click，`:focus-visible` 为假）与
      //    键盘（本控件的主用路径——触发钮 Enter 展开，`:focus-visible` 为真，UA 会给它补
      //    一圈默认方框）。先读指针态：把指针移开，读「只有焦点、没有 hover」的那一档
      await page.mouse.move(0, 0)
      const selected = listBox(page).locator('[aria-selected="true"]')
      await expect(selected, `${style.label}：展开后焦点没有落在选中项上`).toBeFocused()
      const focused = await selected.evaluate((element) => {
        const style = getComputedStyle(element)
        return {
          background: style.backgroundColor,
          outlineWidth: style.outlineWidth,
          outlineStyle: style.outlineStyle,
          shadow: style.boxShadow,
        }
      })
      expect(focused.background, `${style.label}：聚焦项不是聚焦档`).toBe(FOCUS_SHADE[style.id])
      expect(focused.background, `${style.label}：聚焦档与 hover 档同值（两档没分净）`).not.toBe(
        HOVER_SHADE[style.id]
      )
      expect(focused.background, `${style.label}：聚焦档与菜单面同值`).not.toBe(expected.background)
      expect(
        focused.outlineStyle === 'none' || parseFloat(focused.outlineWidth) === 0,
        `${style.label}：聚焦项还留着 outline（环没拆干净）`
      ).toBe(true)
      expect(focused.shadow, `${style.label}：聚焦项还留着 box-shadow（环没拆干净）`).toBe('none')

      // ③b **键盘展开态**（同一枚选项、同一条不变量，但走主用路径）：指针态读不到 UA 默认环
      //     （`:focus-visible` 为假），所以必须键盘重开一遍，否则这条守卫量错了态。收上再开，
      //     并顺带钉住「此刻确实是 :focus-visible」——环为零是因为被压掉了，不是因为量错态
      const readRing = (option: Locator) =>
        option.evaluate((element) => {
          const css = getComputedStyle(element)
          return { outlineStyle: css.outlineStyle, outlineWidth: css.outlineWidth, shadow: css.boxShadow }
        })
      await page.keyboard.press('Escape')
      await expect(listBox(page), `${style.label}：Esc 没有收上列表`).toHaveCount(0)
      await trigger(page).focus()
      await page.keyboard.press('Enter')
      await expect(listBox(page), `${style.label}：键盘激活触发钮没有开出列表`).toBeVisible()
      const kbdOption = listBox(page).locator('.settings-style__option:focus')
      await expect(kbdOption, `${style.label}：键盘展开后焦点没有落在选项上`).toBeFocused()
      expect(
        await kbdOption.evaluate((element) => element.matches(':focus-visible')),
        `${style.label}：键盘展开态没有命中 :focus-visible（这条守卫量错了态）`
      ).toBe(true)
      const kbdRing = await readRing(kbdOption)
      expect(
        kbdRing.outlineStyle === 'none' || parseFloat(kbdRing.outlineWidth) === 0,
        `${style.label}：键盘展开态的选项还留着 outline（UA 默认环没压掉）`
      ).toBe(true)
      expect(kbdRing.shadow, `${style.label}：键盘展开态的选项还留着 box-shadow`).toBe('none')
      // 键盘移动焦点之后（ArrowDown）仍是同一态——移焦点也在键盘路径上，环照旧为零
      await page.keyboard.press('ArrowDown')
      const kbdMoved = listBox(page).locator('.settings-style__option:focus')
      await expect(kbdMoved, `${style.label}：ArrowDown 没有移开焦点`).toBeFocused()
      const movedRing = await readRing(kbdMoved)
      expect(
        movedRing.outlineStyle === 'none' || parseFloat(movedRing.outlineWidth) === 0,
        `${style.label}：ArrowDown 后的选项还留着 outline`
      ).toBe(true)
      expect(movedRing.shadow, `${style.label}：ArrowDown 后的选项还留着 box-shadow`).toBe('none')
      // 把焦点移回选中项，交还给 ④（④ 从选中项按 ArrowDown 起步）
      await page.keyboard.press('ArrowUp')
      await expect(selected, `${style.label}：ArrowUp 没有把焦点移回选中项`).toBeFocused()

      // ④ 未聚焦、未 hover 的选项：底回到菜单面（选中块退场——`aria-selected` 照旧只归读屏）。
      //    把焦点从选中项挪到目录里的下一套，再读三枚各自的底：原选中项与「第三枚（既不聚焦
      //    也不选中）」必须一样且完全透明（透明即透出菜单面，就是验收说的「= 菜单面」）；
      //    聚焦的那一枚显示聚焦档。三枚各自的底都不是选中块
      await page.keyboard.press('ArrowDown')
      const other = optionAt(page, next.id)
      await expect(other, `${style.label}：ArrowDown 没有移开焦点`).toBeFocused()
      const rest = STYLE_CATALOG[(index + 2) % STYLE_CATALOG.length]
      const restRead = await optionAt(page, rest.id)
        .evaluate((element) => getComputedStyle(element).backgroundColor)
      expect(restRead, `${style.label}：普通选项不是透明（透出菜单面）`).toBe('rgba(0, 0, 0, 0)')
      const selectedRest = await selected.evaluate((element) => getComputedStyle(element).backgroundColor)
      expect(
        selectedRest,
        `${style.label}：选中项还有填充（aria-selected 不该有底色，选中块没拆干净）`
      ).toBe(restRead)
      const otherRead = await other.evaluate((element) => getComputedStyle(element).backgroundColor)
      expect(otherRead, `${style.label}：聚焦的非选中项不是聚焦档`).toBe(FOCUS_SHADE[style.id])

      // ⑤ 圆角裁剪（T44 复核轮 · 2026-10-15 所有者人眼复核发现）：选项是**满宽方角**的，而
      //    列表有圆角——首 / 末行的底色一画出来，方角就会伸出菜单的圆角边界（圆角越大越明显，
      //    Material 的 12px 肉眼可见）。修法是共享外壳给列表 `overflow: hidden`。
      //    这里既钉住那条声明，也在「确实有一段该被裁掉」的那一套上用**命中测试**证明裁剪真的
      //    生效——只声明 `overflow` 是不够的，点得着就说明没裁掉。
      const lastOption = listBox(page).locator('.settings-style__option').last()
      await lastOption.hover()
      const corner = await listBox(page).evaluate((element) => {
        const listRect = element.getBoundingClientRect()
        const options = [...element.querySelectorAll('.settings-style__option')]
        const lastRect = options[options.length - 1].getBoundingClientRect()
        const listStyle = getComputedStyle(element)
        const radius = parseFloat(listStyle.borderTopLeftRadius)
        // 探针取末行下缘往上 0.5px 那条水平线（还在行的盒子里）。圆角在该高度上的水平内缩量
        // 就是「本该被裁掉的那一条」：内缩量 > 1px 的套才值得做命中测试。
        const probeY = lastRect.bottom - 0.5
        const aboveCentre = Math.max(0, probeY - (listRect.bottom - radius))
        const inset = radius - Math.sqrt(Math.max(0, radius * radius - aboveCentre * aboveCentre))
        return {
          overflow: listStyle.overflow,
          radius,
          inset,
          probeX: listRect.left + 1,
          probeY,
          rowLeft: lastRect.left,
          rowRight: lastRect.right,
          listLeft: listRect.left,
          listRight: listRect.right,
        }
      })
      expect(corner.overflow, `${style.label}：列表没有裁剪，行的方角会伸出圆角`).toBe('hidden')
      expect(corner.rowLeft, `${style.label}：末行不是满宽（裁剪这条守卫的前提不成立）`).toBeCloseTo(
        corner.listLeft,
        0
      )
      expect(corner.rowRight, `${style.label}：末行不是满宽（裁剪这条守卫的前提不成立）`).toBeCloseTo(
        corner.listRight,
        0
      )
      if (corner.inset > 1) {
        const stack = await page.evaluate(
          ({ x, y }) =>
            document.elementsFromPoint(x, y).map((node) => `${node.tagName}.${node.className}`),
          { x: corner.probeX, y: corner.probeY }
        )
        expect(
          stack.some((entry) => entry.includes('settings-style__option')),
          `${style.label}：圆角外的那一角仍点得着选项（裁剪没生效）——命中栈 ${stack.join(' > ')}`
        ).toBe(false)
      }

      await closeSettings(page)
      expect(problems, `${style.label}：console / page 出错了`).toEqual([])
    })

    test('焦点与 hover 同落一枚选项时显示聚焦档（T44 级联顺序承重墙）', async ({ page }) => {
      const problems = watchProblems(page)
      await startRun(page, style.id, startUrl(ACTIVE))
      await openSettings(page)
      await trigger(page).click()
      await expect(listBox(page)).toBeVisible()

      // 展开即焦点落在选中项上（决策 5）。先把指针移开，读一次「只有焦点、没有 hover」的底
      const selected = listBox(page).locator('[aria-selected="true"]')
      await expect(selected, `${style.label}：展开后焦点没有落在选中项上`).toBeFocused()
      await page.mouse.move(0, 0)
      const focusOnly = await selected.evaluate((element) => getComputedStyle(element).backgroundColor)
      expect(focusOnly, `${style.label}：只有焦点时不是聚焦档`).toBe(FOCUS_SHADE[style.id])

      // 把指针悬停到**同一枚**选项上：`:hover` 与 `:focus` 同时成立。两条规则同 specificity，
      // 写在后面的 `:focus` 胜——**把两条规则换顺序，这里就会读到 hover 档**（承重墙）。
      await selected.hover()
      expect(
        await selected.evaluate((element) => element.matches(':hover') && element.matches(':focus')),
        `${style.label}：没能同时造出 hover 与 focus（这一步的铺设坏了）`
      ).toBe(true)
      const both = await selected.evaluate((element) => getComputedStyle(element).backgroundColor)
      expect(both, `${style.label}：hover 与焦点同落时没有以聚焦为准`).toBe(FOCUS_SHADE[style.id])
      expect(both, `${style.label}：同落时读到了 hover 档（级联顺序被换过）`).not.toBe(HOVER_SHADE[style.id])

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
