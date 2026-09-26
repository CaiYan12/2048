/**
 * 字体加载态
 *
 * 把「字体没到位」变成 CSS 能看见的**设计态**，而不是一场事故。
 *
 * `font-display: swap` 保证浏览器不会因为等字体而阻塞渲染，但它有个盲区：
 * 慢网或 404 时，页面上静悄悄地用着回退字体，没人知道本地字体到底来没来。
 * 这里补上第二道机制——在 <html> 上落一个 data-font-state，主题可以据此补偿形态
 * （比如缺字时加重字重、拉宽字距，让回退形态仍然贴合该风格）。
 *
 * 三态：
 *   loading  初始。先用回退字体渲染，不作补偿。
 *   ready    本地字体可用，或加载失败但系统回退已在同类内。
 *   fallback 超时仍未就绪。主题应当进入降级形态。
 *
 * ready 之后不会再退回 fallback——升级是单向的，避免视觉反复横跳。
 */

const FONT_READY_TIMEOUT_MS = 2500

type FontState = 'loading' | 'ready' | 'fallback'

function hasFailedFontFace(): boolean {
  // status 为 'error' 说明该 @font-face 的 src 取不到（404 / 网络错误）。
  for (const face of document.fonts) {
    if (face.status === 'error') return true
  }
  return false
}

function setState(state: FontState): void {
  document.documentElement.dataset.fontState = state
}

export function initFontState(): void {
  const root = document.documentElement
  root.dataset.fontState = 'loading'

  let settled = false

  const settle = (state: FontState): void => {
    if (settled) return
    settled = true
    window.clearTimeout(timer)
    setState(state)
  }

  const timer = window.setTimeout(() => {
    settle('fallback')
  }, FONT_READY_TIMEOUT_MS)

  // fonts.ready 在「所有在用的字体都加载完或确认失败」时 resolve。
  // 它可能因为慢网挂住，所以上面那个超时是硬上限。
  void document.fonts.ready.then(() => {
    settle(hasFailedFontFace() ? 'fallback' : 'ready')
  })
}
