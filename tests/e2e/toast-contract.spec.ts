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

/**
 * **永不合并、也死不了**的盘（4 个方块 / 12 个空格），配 `SEED_SILENT`（shenmo.spec.ts
 * 同款夹具）。
 *
 * 彩蛋那一条用例要用它：神魔码的八下必须既不成句、也不让棋盘走进 won / stuck——
 * 四个 1024 那个夹具按到 ← 就合出 2048，phase 一变码缓冲当场清零（用户故事 8），
 * 口诀根本走不完。
 */
const SILENT_ROWS: (number | null)[][] = [
  [8, 16, 32, 64],
  [null, null, null, null],
  [null, null, null, null],
  [null, null, null, null],
]

/** 扫 3000 个种子后挑的 score 恒为 0 那一小撮之一（shenmo.spec.ts 的同一支） */
const SEED_SILENT = 9

function silentUrl(): string {
  return `/?seed=${SEED_SILENT}&board=${boardQuery(SILENT_ROWS)}`
}

/** 神魔码的八下（↑↑↓↓←→←→）。序列在 shenmo.spec.ts 的文件头有据可查 */
const CODE_KEYS: readonly string[] = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
]

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
async function startRun(
  page: Page,
  styleId: StyleId,
  label: string,
  url = startUrl()
): Promise<void> {
  await page.goto(url)
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

    // —— T31：note（一念神魔那四颗各自的梗）——
    // 成就自带 note 时下行换成它、本套祝词让位：这句话是这几颗成就的笑话本身，不是风格
    // 在说话（与 emoji 同一条理由，见注册表 `AchievementDefinition.note`）。
    // 断言整句、不断「含有某个词」——这句梗会原样出现在玩家眼前。
    test('成就自带 note：下行换成那句梗，本套的祝词让位，两行结构不变', async ({ page }) => {
      await startRun(page, style.id, style.label, silentUrl())

      // 打完整条神魔码 → 抉择现身 → 先 B（破碎退场）→ 合成 animationend → 再 A。
      // 破碎那一下用合成事件收尾（两段窗口都是 30 秒，等不起；墙钟会把 time-attack 那种
      // 装假时钟的用例冻住——shenmo.spec.ts 的同一条理由）
      await page.locator('[data-board]').focus()
      for (const key of CODE_KEYS) await page.keyboard.press(key)
      await expect(page.locator('.shenmo')).toHaveAttribute('data-shenmo-stage', 'choice')
      await page.getByRole('button', { name: '抉择 B' }).click()
      await expect(page.locator('.shenmo')).toHaveAttribute('data-shenmo-stage', 'breaking')
      await page.evaluate(() => {
        const element = document.querySelector<HTMLElement>('[data-shenmo-button="b"]')
        element?.dispatchEvent(
          new AnimationEvent('animationend', { bubbles: true, animationName: 'shenmo-break-fade' })
        )
      })
      await page.getByRole('button', { name: '抉择 A' }).click()

      // 这一条里只有道通成魔：静音盘不会合并，于是没有首次合并、也没有首胜
      const item = toast(page)
      await expect(item).toHaveCount(1)
      await expect(item).toContainText('道通成魔')
      // 下行整句就是用户给的那句原话
      await expect(item.locator('.toast__note')).toHaveText('既见未来，为何不拜？')
      // 本套那句祝词让位了：三套的 TAG 都是「解锁成就」，它一个字节都不在
      await expect(item).not.toContainText('解锁成就')
      // 两行结构没变：上行 head（图标 + 名字）、下行 note，整整两个 <p>，不多不少
      await expect(item.locator('p')).toHaveCount(2)
      await expect(item.locator('.toast__head')).toContainText('道通成魔')

      // **屏幕阅读器**：toast 本来就是 `role="status"`（隐式 polite + atomic），那句话
      // 只要进了这棵子树就会被整条播报。这里断的正是「它真的在 DOM 里」
      await expect(item).toHaveAttribute('role', 'status')
      await expect(item).toContainText('既见未来，为何不拜？')
    })

    test('reduced-motion 下这句话一个字节不变：降级的是动，不是字', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await startRun(page, style.id, style.label, silentUrl())
      await page.locator('[data-board]').focus()
      for (const key of CODE_KEYS) await page.keyboard.press(key)
      await expect(page.locator('.shenmo')).toHaveAttribute('data-shenmo-stage', 'choice')
      await page.getByRole('button', { name: '抉择 B' }).click()
      // **不断 'breaking' 那一档**：reduced-motion 下破碎退场的时长归零，档位可能一帧就
      // 翻过去，断言它等于赌一次竞态（shenmo.spec.ts 的 reduced-motion 那条也不断它）
      await page.evaluate(() => {
        const element = document.querySelector<HTMLElement>('[data-shenmo-button="b"]')
        element?.dispatchEvent(
          new AnimationEvent('animationend', { bubbles: true, animationName: 'shenmo-break-fade' })
        )
      })
      await page.getByRole('button', { name: '抉择 A' }).click()

      const item = toast(page).first()
      await expect(item).toHaveCount(1)
      await expect(item.locator('.toast__note')).toHaveText('既见未来，为何不拜？')
      await expect(item).not.toContainText('解锁成就')
      // 动效确实归零了（这一套的 reduced-motion 分支），而字一个都没动
      const duration = await item.evaluate((element) => getComputedStyle(element).transitionDuration)
      expect(duration).toMatch(/^0s/)
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