import { expect, test } from '@playwright/test'

/**
 * T02 的工具链闸门。
 *
 * 只验三件事：外壳能加载、Tailwind 的 CSS 真的落到页面上、自托管字体会被
 * 真实请求并成功返回（含 Pages 子路径）。规则、模式与玩法由后续 ticket 的
 * 用例覆盖，这里不预设它们的断言。
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

  // @theme inline 的语义类 + fonts.css 的字体栈共同作用的结果：标题的计算
  // 字体族要以本地 Inter 开头，而不是掉到回退栈上去。
  const headingFontFamily = await heading.evaluate(
    (el) => getComputedStyle(el).fontFamily
  )
  expect(headingFontFamily).toContain('Inter')

  // Tailwind 的 utility 真的编译进来了：外壳 main 的背景色应等于调色板 token
  // slate-950。色值不写死——让 token 也走一遍 computed style，两边经过同样的
  // 归一化（Tailwind 4 用 oklch，Chrome 会把 0.129 显示成 12.9%）再比对。
  //
  // 但相等本身不足为证，必须先有 guard。Tailwind 4 会按需摇树调色板：只有
  // 某次 utility 真的被引用到，它对应的 --color-* 变量才会出现在产物里。于是
  // 一旦 bg-slate-950 没被编译出来，:root 上的 --color-slate-950 也一起消失，
  // applied 与 token 双双退化成 transparent（rgba(0, 0, 0, 0)）——等式依旧成立，
  // 断言却什么都没验证。guard 断言颜色确实存在，挡住这个恒真的空转；它同时也
  // 覆盖样式表整体没加载、只剩 utility 生效的偏瘫情形。
  const shell = await page.locator('main').evaluate((el) => {
    const probe = document.createElement('div')
    probe.style.backgroundColor = 'var(--color-slate-950)'
    document.body.append(probe)
    const token = getComputedStyle(probe).backgroundColor
    probe.remove()
    return { applied: getComputedStyle(el).backgroundColor, token }
  })
  expect(shell.applied).not.toBe('rgba(0, 0, 0, 0)')
  expect(shell.applied).toBe(shell.token)

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
