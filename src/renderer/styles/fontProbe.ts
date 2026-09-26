/**
 * 字体就绪判据的纯半边（DOM 半边在 fontState.ts）
 *
 * 为什么单独抽一个模块：最容易写错的一条判据是「404 与慢网在 document.fonts.check()
 * 眼里同形」——两者都让 check() 返回 false，可它们要的收口完全相反（一个继续等、
 * 一个立刻降级）。这种判据必须能在 tests/unit 里逐种情形喂一遍，而摸 document 的
 * 那个文件在 vitest 里跑不起来（vitest.config.ts 的 node 环境约定）。
 */

/** data-font-state 的三态，与 fontState.ts 落上 <html> 的那三个值一致 */
export type FontState = 'loading' | 'ready' | 'fallback'

/** 一位本地字体的探测事实：两个问题各问一次，答案都由 document.fonts 给 */
export interface FontFacts {
  /**
   * `document.fonts.check()` 的答案：「渲染它还不会再触发一次字体加载吗」。
   *
   * 它是**被动查询**（MDN：check() 不触发加载，触发是 load() 的事），所以可以
   * 当纯查询反复用；它也不会把 404 误判成 true——加载失败的那一位在它眼里同样
   * 返回 false，否则这里根本用不上 face.status。
   */
  ready: boolean
  /** 这个家族有 @font-face 是 error（404 / 网络错误）：彻底没戏，不必再等 */
  failed: boolean
}

/**
 * 一组探测事实 → 该落的态。判定顺序即优先级：全部就绪才算 ready；有一位彻底
 * 挂了就整体降级；剩下的是「还在下载」。
 *
 * 为什么「有一位挂」不是「只看那一位」：data-font-state 挂在 <html> 上，
 * 没有「一半降级」这种状态，而主题是按这个属性整体补偿形态的——所以挂掉的那
 * 一位会把整份形态带下去。
 */
export function watchState(facts: readonly FontFacts[]): FontState {
  // 没有要等的本地字体：稳态就是 ready，不该让这一套风格挂在 loading 上
  if (facts.length === 0) return 'ready'
  if (facts.every((fact) => fact.ready)) return 'ready'
  if (facts.some((fact) => fact.failed)) return 'fallback'
  return 'loading'
}

/** CSS 的通用字体关键字：出现在栈里说明这一位不是自托管字体 */
const GENERIC_FAMILIES: ReadonlySet<string> = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'math',
  'emoji',
  'fangsong',
])

/**
 * 一条 font-family 计算值 → 它的本地字体名（栈里第一个非通用项）。
 *
 * 为什么取「第一个」而不是整栈：每套风格的字体栈都写成「本地字体名 + 同一字形
 * 类别的回退栈」（ADR-0005、fonts.css 的 :root），本地那位必然在最前；整条回退
 * 栈里全是系统字体，问它们「准备好没有」没有意义——document.fonts.check 对系统
 * 字体一律回答 true。整条栈都是系统字体时返回 null，意思是「这一套没有要等的
 * 本地字体」。
 *
 * 按逗号切开：家族名里带逗号时必须加引号，那种栈会被这里切错。本仓库的回退栈
 * 没有这种情况（fonts.css 里逐个看过），真出现时这个函数要先改成带引号感知的
 * 扫描器。
 */
export function firstLocalFamily(stack: string): string | null {
  for (const entry of stack.split(',')) {
    const name = entry.trim().replace(/^['"]|['"]$/g, '')
    // var(--fallback-*) 原样出现时跳过：它的值由浏览器代入，不是一个字族名
    if (name === '' || name.startsWith('var(')) continue
    if (GENERIC_FAMILIES.has(name.toLowerCase())) continue
    return name
  }
  return null
}
