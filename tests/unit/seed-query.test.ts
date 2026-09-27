import { describe, expect, test } from 'vitest'
import { seedFromSearch } from '../../src/renderer/stores/seed'

/**
 * `?seed=` 解析（store 的取种缝）
 *
 * 这个文件存在的理由：这条缝曾经把「参数缺失」读成「seed=0」，于是浏览器里每一局
 * 不带 `?seed=` 的开局都是同一张盘、`drawSeed()` 永远走不到，而所有 fixture 都显式
 * 带 `?seed=` 或 `?board=`，没有一条断言看得见它（从 T04 存活到 T08）。**测试缝
 * 自己必须可测**——解析因此是一个吃 query 串的纯函数（与 `fixtureFromQuery` 同一条
 * 性质），window 留在 store 一侧。
 *
 * store 的取种顺序是 `daily?.seed ?? seedFromSearch(search) ?? drawSeed()`：
 * `drawSeed()` 会不会失达，只取决于 seedFromSearch 在「没给参数」时返回什么。所以
 * 把「没给 → null」钉死，就等于把「浏览器里 Math.random 走得到」钉死。
 */

describe('?seed= 解析', () => {
  test('没给参数 → null：缺失不能被读成 seed=0', () => {
    // 空串与只有问号：window.location.search 的真实形态
    expect(seedFromSearch('')).toBeNull()
    expect(seedFromSearch('?')).toBeNull()
    // 别的参数在场，唯独没有 seed：T04 的 ?board= 夹具走的就是这种 query
    expect(seedFromSearch('?board=2,4,8,8')).toBeNull()
    expect(seedFromSearch('board=2,4,8,8&score=12')).toBeNull()
  })

  test('给了空值 → null：?seed= 与 ?seed=+ 都是「没给」', () => {
    // Number('') === 0、Number(' ') === 0，而 0 是 ?? 的非空值——不显式挡掉就又是 seed=0
    expect(seedFromSearch('?seed=')).toBeNull()
    expect(seedFromSearch('?seed=+')).toBeNull()
    expect(seedFromSearch('?seed=%20')).toBeNull()
    expect(seedFromSearch('?seed=++')).toBeNull()
  })

  test('显式的 0 是合法种子：修缺失不能顺手把 0 也吞掉', () => {
    // 上两条的反面边界：null 表示「没给」，0 表示「给了个 0」，两者必须能分开
    expect(seedFromSearch('?seed=0')).toBe(0)
    expect(seedFromSearch('seed=0')).toBe(0)
    expect(seedFromSearch('?seed=0&board=2,4,8,8')).toBe(0)
  })

  test('合法整数照原样交出', () => {
    expect(seedFromSearch('?seed=42')).toBe(42)
    expect(seedFromSearch('?seed=20260926')).toBe(20260926)
    // uint32 上界：drawSeed 的取值范围，Daily 的种子也落在这里
    expect(seedFromSearch('?seed=4294967295')).toBe(4294967295)
  })

  test('非整数的 seed 视为没给：宁可退回随机，也不要拿 NaN 当种子', () => {
    for (const bad of ['abc', '1.5', 'NaN', '-', '2026-09-26']) {
      expect(seedFromSearch(`?seed=${bad}`), bad).toBeNull()
    }
  })

  test('取种顺序因此落在随机那一侧：没给参数时 ?? 左侧是 nullish', () => {
    // store: daily?.seed ?? seedFromSearch(search) ?? drawSeed()
    // 非 Daily 模式 daily 为 null，于是 ?? 一路退到 drawSeed()——这一条把那个
    // 「一路退到底」的可能性钉住：任何一处返回非 nullish，随机抽种就失达了
    for (const search of ['', '?', '?seed=', '?board=2,4,8,8', '?seed=abc']) {
      expect(seedFromSearch(search), search).toBeNull()
    }
  })
})
