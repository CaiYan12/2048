import { expect, test, type Page } from '@playwright/test'

/**
 * T14：字体状态机与自托管字体的本地加载
 *
 * **本文件由 T14 编写但不运行**（跑它的是控制人的统一 sweep）：本次会话被明确要求不启动
 * Playwright、不开任何浏览器。断言走 data-font-state / 响应拦截 / 计算样式，不伸进 store。
 *
 * 验的三件事（ticket 验收标准 1 与 3）：
 *   1. 首屏先标 loading，字体到位才升 ready；
 *   2. 切到一套「第一次用到某字体」的风格时，data-font-state 走 loading → ready
 *      （慢网也一样：先 loading，字体到位才升），而切回一份已经加载过的字体不许
 *      再进 loading（单向升级要防的就是这个横跳）；
 *   3. .woff2 被挡掉时是 fallback，不是永久误报 ready；以及构建预览里的字体真的
 *      从本地路径加载成功。
 *
 * `document.fonts.check()` 是被动查询、且对「还在下」和「404」都返回 false，所以这里
 * 不轮询它，而是装一个 MutationObserver 记录 data-font-state 的**每一次**变化——
 * 一次都不会漏，也就不需要猜「什么时候去看一眼」。observer 用 addInitScript 挂在
 * 导航最前面（任何页面脚本之前），否则「404 一失败就落 fallback」这种转眼就完成的
 * 变化，可能在 goto 返回之前就走完了。
 */

/** 从导航的第一步起记录 data-font-state 的每一次变化 */
async function watchFontState(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen: string[] = []
    const bank = window as unknown as { __fontStates: string[] }
    bank.__fontStates = seen
    new MutationObserver(() => {
      seen.push(document.documentElement.dataset.fontState ?? '')
    }).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-font-state'],
    })
  })
}

/** 记录归零：之后的断言只看接下来发生的事（首屏那一轮已经单独断过） */
async function resetFontStateTrace(page: Page): Promise<void> {
  await page.evaluate(() => {
    const bank = window as unknown as { __fontStates: string[] }
    bank.__fontStates = []
  })
}

async function fontStateTrace(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __fontStates: string[] }).__fontStates)
}

/** 当前风格实际在用的本地字体名（与 fontState.ts 的 effectiveFamilies 同一个读法） */
async function effectiveFamily(page: Page): Promise<string> {
  return page.evaluate(() => {
    const shell = document.querySelector('main[data-style]')
    if (shell === null) return ''
    const stack = getComputedStyle(shell).getPropertyValue('--font-body')
    return stack.split(',')[0].trim().replace(/^['"]|['"]$/g, '')
  })
}

/** 选择器上按名字点一套风格（同 style-switch.spec.ts 的路子） */
async function pickStyle(page: Page, label: string): Promise<void> {
  await page.getByRole('group', { name: '风格' }).getByRole('button', { name: label }).click()
}

/** 装成慢网：拖 700ms 再放行，好让 loading 窗口是可观测的、不靠运气 */
async function slowDownFonts(page: Page, pattern = '**/*.woff2'): Promise<void> {
  await page.route(pattern, async (route) => {
    await new Promise((resolve) => {
      setTimeout(resolve, 700)
    })
    await route.continue()
  })
}

test('首屏先标 loading，字体到位才升 ready（启动那一轮）', async ({ page }) => {
  await watchFontState(page)
  await slowDownFonts(page)
  // 字体都被拖住：这一页开局时一定拿不到它们，所以此刻必须还是 loading
  await page.goto('/?seed=20260926')
  await expect(page.locator('html')).toHaveAttribute('data-font-state', 'loading')

  await resetFontStateTrace(page)
  await expect(page.locator('html')).toHaveAttribute('data-font-state', 'ready', {
    timeout: 5000,
  })
  // 升了一次，且只升一次（单向升级：ready 之后不会再退回 fallback）。
  // trace 是**变化**的序列：fontState.setState 只在状态真的变了时才落属性，所以同值
  // 重写不会出现在这里。于是这条断言语的是状态机的行为，不是浏览器的记录习惯
  expect(await fontStateTrace(page)).toEqual(['ready'])
})

test('切到第一次用到的字体：慢网下走 loading → ready', async ({ page }) => {
  await watchFontState(page)
  await slowDownFonts(page, '**/roboto-flex*.woff2')
  await page.goto('/?seed=20260926')

  // 先一路 Classic 把 Inter 加载完，让「第一次用到」落在 Roboto Flex 上
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-font-state', 'ready')

  await resetFontStateTrace(page)
  await pickStyle(page, 'Material')
  await expect(page.locator('main')).toHaveAttribute('data-style', 'material')

  // 切过去的那一刻必须是 loading：Roboto Flex 的请求刚发出去（700ms 后才回）
  await expect(page.locator('html')).toHaveAttribute('data-font-state', 'loading')
  expect(await fontStateTrace(page)).toEqual(['loading'])

  // 字体到位后升到 ready，且只升一次（单向：不来回横跳）
  await expect(page.locator('html')).toHaveAttribute('data-font-state', 'ready', {
    timeout: 5000,
  })
  expect(await fontStateTrace(page)).toEqual(['loading', 'ready'])

  // 「不是误报」的正面证据：这一位真的可用了
  const family = await effectiveFamily(page)
  expect(family).toBe('Roboto Flex')
  expect(
    await page.evaluate((name) => document.fonts.check(`12px '${name}'`), family)
  ).toBe(true)
})

test('切回已经加载过的字体不再进 loading', async ({ page }) => {
  await watchFontState(page)
  await page.goto('/?seed=20260926')
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()

  // 两套字体都加载过：Material 的 Roboto Flex 走完一轮 loading → ready
  await pickStyle(page, 'Material')
  await expect(page.locator('main')).toHaveAttribute('data-style', 'material')
  await expect(page.locator('html')).toHaveAttribute('data-font-state', 'ready')
  await pickStyle(page, 'Classic')
  await expect(page.locator('html')).toHaveAttribute('data-font-state', 'ready')

  await resetFontStateTrace(page)

  // 来回切三次：两套字体都是已加载的，状态机一次都不该动
  await pickStyle(page, 'Material')
  await pickStyle(page, 'Classic')
  await pickStyle(page, 'Material')
  await expect(page.locator('main')).toHaveAttribute('data-style', 'material')

  // 空序列 = data-font-state 一个值都没变过。若这里出现 loading，就是一次没有理由的横跳；
  // 出现 ready 则是白写属性。三种写法在 setState 的去重之后都只剩下同一种解释：
  // 状态机在这几次切换里一次都不该动（字体没变，recheckEffectiveFont 直接返回）
  expect(await fontStateTrace(page)).toEqual([])
  await expect(page.locator('html')).toHaveAttribute('data-font-state', 'ready')
})

test('字体 404：落 fallback，而不是永久停在 ready', async ({ page }) => {
  await watchFontState(page)
  // 断掉本地字体：这一页一个 woff2 都拿不到
  await page.route('**/*.woff2', async (route) => {
    await route.abort()
  })
  await page.goto('/?seed=20260926')
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()

  // 404 的正确收口是 fallback，且不许再变成 ready（永久误报 ready 就是这个 bug 的样子）。
  // 这里看的是**全量**记录：从加载开始到最后一次变化，ready 一次都不该出现过
  await expect(page.locator('html')).toHaveAttribute('data-font-state', 'fallback', {
    timeout: 5000,
  })
  const trace = await fontStateTrace(page)
  expect(trace).not.toContain('ready')
  expect(trace.at(-1)).toBe('fallback')
})

test('构建预览里的字体从本地路径加载成功（验收标准 3）', async ({ page }) => {
  const fontResponses: Array<{ url: string; status: number }> = []
  page.on('response', (response) => {
    if (response.url().endsWith('.woff2')) {
      fontResponses.push({ url: response.url(), status: response.status() })
    }
  })

  await page.goto('/?seed=20260926')
  await expect(page.locator('html')).toHaveAttribute('data-font-state', 'ready')

  // 至少要有一个本地字体真的下来了，而且全部成功、全部来自本站（不是第三方 CDN）
  expect(fontResponses.length).toBeGreaterThan(0)
  for (const response of fontResponses) {
    expect(response.status, response.url).toBe(200)
    const url = new URL(response.url)
    expect(url.origin, response.url).toBe(new URL(page.url()).origin)
    expect(url.pathname, response.url).toContain('/fonts/')
    expect(response.url, response.url).not.toContain('gstatic')
  }

  // 「加载成功」到最后还是落在 check() 上：这一位确实可用，不是 state 自己在说空话
  const family = await effectiveFamily(page)
  expect(family).toBe('Inter')
  expect(
    await page.evaluate((name) => document.fonts.check(`12px '${name}'`), family)
  ).toBe(true)
})
