import { describe, expect, test } from 'vitest'
import { createRng, restoreRng } from '../../src/shared/rng'

describe('RNG', () => {
  test('serialize → restore → continue 与一条不间断的流逐位相同', () => {
    const uninterrupted = createRng(99)
    const straight = [uninterrupted.next(), uninterrupted.next(), uninterrupted.next()]

    const interrupted = createRng(99)
    const head = [interrupted.next(), interrupted.next()]
    const snapshot = interrupted.serialize()
    const tail = [interrupted.next()]

    const restored = restoreRng(snapshot)
    const replayed = [restored.next()]

    // 恢复之后接着走，得到的就是中断那一刻之后的那一位
    expect(replayed).toEqual(tail)
    // 而且整条流与从未中断的完全相同
    expect([...head, ...tail]).toEqual(straight)
    // 可恢复进度必须是一个 plain number（要走 JSON 持久化，T16）
    expect(typeof snapshot).toBe('number')
  })

  test('int(n) 落在 [0, n) 内且不会越界', () => {
    const rng = createRng(7)
    const seen = new Set<number>()
    for (let i = 0; i < 200; i++) {
      const value = rng.int(3)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(3)
      expect(Number.isInteger(value)).toBe(true)
      seen.add(value)
    }
    // 三个取值都出现过：不是只会返回某一个数
    expect(seen).toEqual(new Set([0, 1, 2]))
  })
})
