import { expect, test, type Page } from '@playwright/test'
import { STYLE_CATALOG, type StyleId } from '../../src/shared/styleCatalog'

/**
 * 成就祝贺的**共享契约**：同一套断言对三套风格各跑一遍（ADR-0002 增补 · 验收标准 6）。
 *
 * 三份实现必然漂移，唯一能防漂移的就是同一套断言跑三遍——所以这个文件里没有一句
 * 「Classic 会这样、Material 会那样」的分叉，除了最后一处刻意钉住「三套长相确实不同」
 * 的证据（底色）。
 *
 * 契约逐条（与 `src/renderer/styles/types.ts` 的 ToastSlot 注释同一份）：
 *   1. 约 5 秒后自行消失；
 *   2. 指针悬停时暂停；
 *   3. 焦点落在里面时暂停；
 *   4. 每条带 `role="status"`，一次一条地播报；
 *   5. 最多三条同屏，第四条丢最旧；
 *   6. 从不抢走键盘焦点；
 *   7. 尊重 `prefers-reduced-motion`（照旧出现，只是不再动）；
 *   8. 不遮棋盘、不压四个方向按钮、不拦操作。
 *
 * 确定性来自 `?seed=` + `?board=`（开局夹具）：四个 1024 一次左移就合出两个 2048，
 * 正好是「第一次达标」——那一步当场解锁首胜并浮出一条祝贺（ADR-0007：成就跟着对局状态
 * 走，不等结算）。之后的每一步仍然走真实按键与真实规则内核。
 */

/** 行优先局面 → board 参数值（空串 = 空格） */
function boardQuery(rows: (number | null)[][]): string {
  return rows.flat().map((value) => value ?? '').join(',')
}

/** 四个 1024：一次左移合出两个 2048，正好是「第一次达标」 */
const FOUR_1024: (number | null)[][] = [
  [1024, 1024, 1024, 1024],
  [null, null, null, null],
  [null, null, null, null],
  [null, null, null, null],
]

function startUrl(): string {
  return `/?seed=20260926&board=${boardQuery(FOUR_1024)}&score=4321`
}

/** 每套风格的祝贺底色（tokens.css 的 --control-bg / --page）。三套必须互不相同 */
const TOAST_BACKGROUND: Record<StyleId, string> = {
  classic: 'rgb(111, 96, 85)',
  material: 'rgb(232, 222, 248)',
  claude: 'rgb(240, 238, 230)',
}

/**
 * 每套风格的投影（2026-09-28 应所有者要求「toast 要有阴影」）。
 *
 * 三套的影**不是同一个**，因为「有影」在三种设计语言里是三种说法：Classic 全扁平，所以最轻；
 * Material 本来就有板面那组 elevation；Claude 静态版面零投影，所以只是一声耳语。
 * 这里断的是「各是各的那一层」——只断「不是 none」的话，三份实现互抄也照样过。
 */
const TOAST_SHADOW: Record<StyleId, string> = {
  classic: 'rgba(74, 68, 63, 0.3)',
  material: 'rgba(0, 0, 0, 0.12)',
  claude: 'rgba(38, 36, 31, 0.14)',
}

/** 开局：选风格 → 开始游戏 */
async function startRun(page: Page, styleId: StyleId, label: string): Promise<void> {
  await page.goto(startUrl())
  await page.getByRole('group', { name: '风格' }).getByRole('button', { name: label }).click()
  await expect(page.locator('main')).toHaveAttribute('data-style', styleId)
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()
}

/** 一步达标：首胜在**这一步**当场解锁，于是祝贺浮出来（此刻还没有结算） */
async function unlockFirstWin(page: Page): Promise<void> {
  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('[data-panel="win"]')).toBeVisible()
  await expect(page.locator('[data-toast]')).toHaveCount(1)
}

/** 收 / 放一次：撤销那一步 → 解锁随之收回；再走一步 → 又是一次新的跃迁 */
async function cycleThroughWin(page: Page): Promise<void> {
  await page.locator('[data-board]').focus()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('z')
}

const toast = (page: Page) => page.locator('[data-toast]')

for (const style of STYLE_CATALOG) {
  test.describe(`${style.label} · 成就祝贺的共享契约`, () => {
    test('解锁那一刻浮出这一套自己的祝贺：一条、带名字、带礼貌播报', async ({ page }) => {
      await startRun(page, style.id, style.label)
      // 达标之前一条都没有
      await expect(toast(page)).toHaveCount(0)

      await unlockFirstWin(page)

      const item = toast(page).first()
      await expect(item).toHaveAttribute('role', 'status')
      await expect(item).toContainText('解锁成就')
      await expect(item).toContainText('首胜')
      // 一次解锁只有**一条**，不是每个成就一条
      await expect(page.locator('[data-toast-stack]')).toHaveCount(1)
      // 长相是这一套自己的：底色就是本风格 tokens.css 里那一个（三套互不相同）
      const background = await item.evaluate((element) => getComputedStyle(element).backgroundColor)
      expect(background, `${style.label} 的祝贺底色与设计卡不符`).toBe(TOAST_BACKGROUND[style.id])
      // 阴影也是这一套自己的那一种（Classic 轻、Material 板面那组 elevation、Claude 耳语）
      const shadow = await item.evaluate((element) => getComputedStyle(element).boxShadow)
      expect(shadow, `${style.label} 的祝贺没有阴影`).not.toBe('none')
      expect(shadow, `${style.label} 的祝贺阴影与设计卡不符`).toContain(TOAST_SHADOW[style.id])
    })

    test('约 5 秒之后自行消失，不用玩家点掉', async ({ page }) => {
      await startRun(page, style.id, style.label)
      await unlockFirstWin(page)

      // 出场还有 200ms，给到 8 秒的余量足够
      await expect(toast(page)).toHaveCount(0, { timeout: 8000 })
      await expect(page.locator('[data-toast-stack]')).toHaveCount(0)
    })

    test('指针悬停时暂停计时，移开之后接着走', async ({ page }) => {
      await startRun(page, style.id, style.label)
      await unlockFirstWin(page)

      await toast(page).first().hover()
      // 悬停中：过了 5 秒它还在（计时的钟停了）
      await page.waitForTimeout(6000)
      await expect(toast(page)).toHaveCount(1)

      // 移开指针：剩下的时间接着走，于是它照旧会消失。
      // **不用 hover 棋盘**：达标之后胜利面板正盖在棋盘上，指针落不下去。
      // 移到视口左上角那一点——它落在栈的外面（卡片靠右对齐），于是 paused 解除
      await page.mouse.move(4, 4)
      await expect(toast(page)).toHaveCount(0, { timeout: 9000 })
    })

    test('焦点落在里面时也暂停，而且鼠标移开也不解除', async ({ page }) => {
      await startRun(page, style.id, style.label)
      await unlockFirstWin(page)

      await toast(page).first().focus()
      // 再把指针放上去、然后移开：焦点还在里面，所以计时**仍然**停着。
      // 「悬停」与「聚焦」是两个各自成立的条件，不是一个开关——一个 boolean 会让
      // 后发生的那个事件把另一个抹掉，而契约原文是「pointer over it, **or** focus inside it」
      await toast(page).first().hover()
      await page.mouse.move(4, 4)

      await page.waitForTimeout(6000)
      await expect(toast(page)).toHaveCount(1)
    })

    test('从不抢走键盘焦点：解锁不改变 document.activeElement', async ({ page }) => {
      await startRun(page, style.id, style.label)
      await page.locator('[data-board]').focus()

      await page.keyboard.press('ArrowLeft')
      await expect(toast(page)).toHaveCount(1)

      // 焦点仍在棋盘上：方向键照旧归游戏（tabindex="0" 只是让用户能主动 Tab 进来暂停）
      const onBoard = await page.evaluate(
        () => document.activeElement?.hasAttribute('data-board') ?? false
      )
      expect(onBoard, '解锁把焦点从棋盘上抢走了').toBe(true)
    })

    test('最多三条同屏：第四条到达时丢最旧，最新那一条永远看得见', async ({ page }) => {
      await startRun(page, style.id, style.label)
      // 走 → 撤 ×3：每一次「走」都是一次新的跃迁（撤销把首胜收回了），三条先占满
      for (let step = 0; step < 3; step += 1) await cycleThroughWin(page)

      await expect(toast(page)).toHaveCount(3)

      // 第四条进场：最旧那一条被丢掉，仍然只有三条
      await cycleThroughWin(page)
      await expect(toast(page)).toHaveCount(3)
    })

    test('不遮棋盘、也不压四个方向按钮', async ({ page }) => {
      await startRun(page, style.id, style.label)
      await unlockFirstWin(page)

      const stack = await page.locator('[data-toast-stack]').boundingBox()
      const board = await page.locator('[data-board]').boundingBox()
      expect(stack).not.toBeNull()
      expect(board).not.toBeNull()
      if (stack === null || board === null) return
      // 整叠祝贺落在棋盘**上沿之上**：一行都不遮
      expect(stack.y + stack.height, `${style.label} 的祝贺压到棋盘上了`).toBeLessThanOrEqual(
        board.y
      )

      // 触摸设备上方向按钮才在布局里（桌面端 `display: none`，连无障碍树都进不去——
      // 所以这里按类名取，而不是 getByRole：那个角色定位器在桌面端会一直等不到元素）。
      // 它在棋盘的**下方**，同样一条都不压
      const dpad = page.locator('.dpad')
      if (await dpad.isVisible()) {
        const box = await dpad.boundingBox()
        if (box !== null) expect(stack.y + stack.height).toBeLessThanOrEqual(box.y)
      }
    })

    test('卡片之外的点击穿透到下面的控件（不拦操作）', async ({ page }) => {
      await startRun(page, style.id, style.label)
      await unlockFirstWin(page)

      // 容器本身不接指针：它铺满整幅宽度，若接了指针，顶部的按钮就全点不动了
      const pointerEvents = await page
        .locator('[data-toast-stack]')
        .evaluate((element) => getComputedStyle(element).pointerEvents)
      expect(pointerEvents).toBe('none')
      // 而卡片自己是接指针的——「悬停暂停」正是靠它
      const itemPointerEvents = await toast(page)
        .first()
        .evaluate((element) => getComputedStyle(element).pointerEvents)
      expect(itemPointerEvents).toBe('auto')
    })

    test('reduced-motion：照旧出现、内容不变，只是不再动', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await startRun(page, style.id, style.label)
      await page.locator('[data-board]').focus()
      await page.keyboard.press('ArrowLeft')

      // 降级的是「怎么动」，不是「长什么样」：它照旧出现、照旧是这一套的底色
      const item = toast(page).first()
      await expect(item).toHaveCount(1)
      await expect(item).toContainText('首胜')
      const computed = await item.evaluate((element) => {
        const style = getComputedStyle(element)
        return { duration: style.transitionDuration, background: style.backgroundColor }
      })
      expect(computed.duration).toMatch(/^0s/)
      expect(computed.background).toBe(TOAST_BACKGROUND[style.id])
    })
  })
}