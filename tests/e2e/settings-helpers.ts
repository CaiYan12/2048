import { expect, type Locator, type Page } from '@playwright/test'

/**
 * 设置抽屉的共享 e2e 助手（T42 · 父规格 docs/specs/style-picker.md 决策 13）
 *
 * review-fix 阶段记下的既定承诺在这一票兑现：`openSettings` / `closeSettings` /
 * `pickStyle` 只住这一份，不再每份 spec 各抄一套。此前六份 `pickStyle` 拷贝与两套
 * 开/关抽屉助手（audio.spec.ts、settings-drawer.spec.ts 各一份）全部收编到这里，
 * 调用方改走本模块。
 *
 * **`pickStyle` 走抽屉路径**（T42 起这是风格选择的唯一路径）：开抽屉 → 触发钮 → 选项 →
 * 收抽屉。主面板那组风格按钮已经摘除，开局界面的按钮组是它自己的测试在用本地查询
 * （那是被测对象，不走助手）。走一遍抽屉顺带就是对新控件最频繁的一条用户路径的持续
 * 回归：此后每个需要换风格的 e2e 都在替 T42 把关。
 *
 * 开与关都要等动画收尾（T38 起抽屉有 250/200 的进出）：`toBeVisible()` 在滑入途中就
 * 成立，紧接着的点击会撞上还在动的元素；退场没播完时容器还在 DOM 里。时长只活在 CSS
 * 一处，这里等的是 `getAnimations()` 而不是写死的毫秒数。
 *
 * **假时钟的用例不要用这套助手**：`settledAnimations` 的 `waitForFunction` 轮询会被
 * `page.clock` 冻住（`.codex/memories/e2e-debt.md` 第四节）——settings-drawer.spec.ts
 * 的假时钟用例自己直接点、直接等卸载，就是为这个。
 */

/** 入口那颗齿轮（可访问名是「设置」） */
const settingsEntry = (page: Page): Locator => page.locator('.settings-entry')

/** 抽屉面板本身 */
const settingsDrawer = (page: Page): Locator => page.locator('[data-settings-drawer]')

/**
 * 等抽屉的进出动画播完（T38 的 helper，原样收编）。用 `getAnimations()` 而不是写死
 * 250 / 200ms：时长只该活在 CSS 一处。`polling: 50` 明写出来，是为了不依赖页面的
 * requestAnimationFrame（那也正是假时钟会冻住的东西）。
 */
export async function settledAnimations(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const element = document.querySelector('[data-settings-drawer]')
      if (element === null) return true
      const animations = element.getAnimations()
      return animations.length > 0 && animations.every((item) => item.playState !== 'running')
    },
    undefined,
    { polling: 50 }
  )
}

/**
 * 打开设置抽屉：点入口，等抽屉就位、且进场动画播完。
 *
 * **先看它开没开**：入口被遮罩压着，抽屉开着时再点一下落在遮罩上 =「关」（e2e-debt
 * 的老坑：开关型入口不能无条件点）。收着时它一个都不在，直接进。
 */
export async function openSettings(page: Page): Promise<void> {
  if ((await settingsDrawer(page).count()) > 0) return
  await settingsEntry(page).click()
  await expect(settingsDrawer(page)).toBeVisible()
  await settledAnimations(page)
}

/**
 * 关掉设置抽屉：点「收起」，等**退场动画播完**再等它离开 DOM（T38）。
 * `toHaveCount(0)` 等的是 animationend 驱动的卸载（Playwright 的重试会自动等够）；
 * 先 `settledAnimations` 是为了让调用方返回时退场真的播完了，而不是停在中间态。
 */
export async function closeSettings(page: Page): Promise<void> {
  await settingsDrawer(page).getByRole('button', { name: '收起' }).click()
  await settledAnimations(page)
  await expect(settingsDrawer(page)).toHaveCount(0)
}

/**
 * 选一个风格（按设计卡的 label，如 'Classic' / 'Material' / 'Claude'）：开抽屉 →
 * 触发钮（可访问名 = `aria-labelledby` 引用的行标签「风格」）→ 选项 → 收抽屉。
 * 选项在列表里只在开着时存在；点它冒泡成一次选中，列表收上、整页换肤。
 */
export async function pickStyle(page: Page, label: string): Promise<void> {
  await openSettings(page)
  await page.getByRole('button', { name: '风格' }).click()
  await page.getByRole('option', { name: label }).click()
  await closeSettings(page)
}
