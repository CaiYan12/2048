import { expect, test } from '@playwright/test'

/**
 * T02 的工具链闸门，随 T03 的新外壳更新断言点。
 *
 * 只验三件事：外壳能加载、Tailwind 的 CSS 真的落到页面上、自托管字体会被
 * 真实请求并成功返回（含 Pages 子路径）。规则、模式与玩法由 game.spec.ts
 * 覆盖，这里不预设它们的断言。
 */
test('外壳加载，Tailwind 与自托管字体都到位', async ({ page }) => {
  const fontRequests: string[] = []
  const problems: string[] = []

  page.on('response', (response) => {
    if (response.url().endsWith('.woff2')) fontRequests.push(response.url())
  })
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))

  await page.goto('/')

  const heading = page.getByRole('heading', { level: 1 })
  await expect(heading).toHaveText('2048')

  // @theme inline 的语义类 + Classic tokens.css 的字体栈共同作用的结果：标题的计算
  // 字体族要以本地 Inter 开头，而不是掉到回退栈上去。
  const headingFontFamily = await heading.evaluate(
    (el) => getComputedStyle(el).fontFamily
  )
  expect(headingFontFamily).toContain('Inter')

  // Tailwind 的 utility 真的编译进来了：外壳 main 上挂着 grid，计算值就该是 grid。
  // 这个断言同时是 guard——<main> 的 UA 默认是 block，所以它不可能恒真。
  //
  // 为什么不沿用 T02 的色值比对：外壳的底色现在来自 Classic 的 tokens.css
  // （--page），不再来自 Tailwind 调色板（ADR-0002 要求观感能随风格整块替换，
  // 写死在 utility 里的色值风格管不到）。于是拿 --color-slate-950 当探针已经没有
  // 意义，改用布局 utility 当探针：Tailwind 编译没进来，display 就退回 block。
  const shellDisplay = await page
    .locator('main')
    .evaluate((el) => getComputedStyle(el).display)
  expect(shellDisplay).toBe('grid')

  // 字体是懒加载的，等字体赛跑收尾再统计网络请求，免得只看到请求前的快照。
  await page.waitForFunction(() => document.fonts.status === 'loaded')
  expect(fontRequests.length).toBeGreaterThan(0)
  for (const url of fontRequests) {
    // SPEC 用户故事 30：资源必须落在 Pages 仓库子路径下。fonts.css 里写的是
    // 绝对路径 /fonts/...，全靠 vite base 才换成 /2048/fonts/...
    expect(url).toContain('/2048/fonts/')
  }

  // initFontState 已接线：加载完应升到 ready（超时则是 fallback，同样算失败）。
  await expect(page.locator('html')).toHaveAttribute('data-font-state', 'ready')

  expect(problems).toEqual([])
})
