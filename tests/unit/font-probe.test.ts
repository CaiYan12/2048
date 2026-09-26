import { describe, expect, test } from 'vitest'
import { firstLocalFamily, watchState } from '../../src/renderer/styles/fontProbe'

/**
 * 字体就绪判据的纯半边（T14）
 *
 * 为什么单测值得为它写一遍：最容易写错的一条判据是「404 与慢网在 check() 眼里同形」
 * ——两者都让 document.fonts.check() 返回 false，可收口完全相反。判据住在纯模块
 * fontProbe.ts 里，于是这里能逐种情形喂事实，不摸 document（vitest 是 node 环境）。
 */

describe('watchState：探测事实 → 该落的态', () => {
  test('没有要等的本地字体时就是 ready', () => {
    // 整条栈都是系统字体：check() 一律答 true，本就不该挂在 loading 上等一个不存在的东西
    expect(watchState([])).toBe('ready')
  })

  test('全部就绪才是 ready', () => {
    expect(
      watchState([
        { ready: true, failed: false },
        { ready: true, failed: false },
      ])
    ).toBe('ready')
  })

  test('一位彻底挂了就 fallback，不等超时', () => {
    // 404 的正确收口。check() 对 error 状态也返回 false，与「还在下载」同形，
    // 区分它们的只有 face.status——所以这里是「立即降级」而不是「先闪一下 loading」
    expect(watchState([{ ready: false, failed: true }])).toBe('fallback')
    expect(
      watchState([
        { ready: true, failed: false },
        { ready: false, failed: true },
      ])
    ).toBe('fallback')
  })

  test('还在下载是 loading', () => {
    expect(watchState([{ ready: false, failed: false }])).toBe('loading')
    // 一位就绪一位在途：这一套没有齐，所以是 loading 而不是 ready
    expect(
      watchState([
        { ready: true, failed: false },
        { ready: false, failed: false },
      ])
    ).toBe('loading')
  })

  test('ready 与 failed 同时出现时 fallback 优先', () => {
    // 「一半降级」不是状态：data-font-state 挂在 <html> 上，主题按它整体补偿形态，
    // 所以挂掉的那一位会把整份形态带下去
    expect(
      watchState([
        { ready: true, failed: false },
        { ready: false, failed: true },
      ])
    ).toBe('fallback')
  })
})

describe('firstLocalFamily：font-family 计算值 → 本地字体名', () => {
  test('取栈里第一个非通用项（本地字体必然在最前）', () => {
    expect(
      firstLocalFamily(`'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`)
    ).toBe('Inter')
    expect(firstLocalFamily(`Roboto Flex, system-ui, sans-serif`)).toBe('Roboto Flex')
    expect(firstLocalFamily(`  'Fraunces' , Georgia, serif`)).toBe('Fraunces')
  })

  test('整条栈都是系统/通用字体时返回 null', () => {
    expect(firstLocalFamily('serif, sans-serif')).toBeNull()
    expect(firstLocalFamily('system-ui')).toBeNull()
    expect(firstLocalFamily('')).toBeNull()
  })

  test('系统字体名照原样返回（它无害：check() 对系统字体一律答 true）', () => {
    // 这一条不是 bug：函数只负责「谁排在栈最前」。系统字体名排在前面意味着这套风格
    // 没有自托管本地字体可等，交给 check() 自然得到「随时可用」
    expect(firstLocalFamily('Georgia, serif')).toBe('Georgia')
  })

  test('跳过 var() 原样 token 与空项', () => {
    // 自定义属性计算值里 var() 已被浏览器代入；真原样出现时它不是字族名
    expect(firstLocalFamily("var(--fallback-grotesk)")).toBeNull()
    expect(firstLocalFamily("'Inter', var(--fallback-grotesk)")).toBe('Inter')
  })

  test('通用关键字大小写无关', () => {
    expect(firstLocalFamily('SANS-SERIF')).toBeNull()
    expect(firstLocalFamily('Monospace')).toBeNull()
  })
})
