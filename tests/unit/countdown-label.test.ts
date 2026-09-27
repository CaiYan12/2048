import { describe, expect, test } from 'vitest'
import { countdownLabel } from '../../src/renderer/components/CountdownLabel'
import { NOW } from './support'

/**
 * 倒计时的读数口径（T09）
 *
 * 它是纯函数，所以直接在 node 里驱动——不必为了验证一行字符串起一个浏览器。
 * 与 tests/unit/time-attack.test.ts 的分工：那份钉「引擎什么时候结算」，
 * 这份钉「界面上那一行怎么读」，两边的截止时间戳必须对得上。
 */

/** 固定时刻从 support.ts 导入，不在这里另写一份：两边必须是同一个瞬间 */
const DEADLINE = NOW + 180_000

describe('countdownLabel', () => {
  test('开局读三分钟整', () => {
    expect(countdownLabel(DEADLINE, NOW)).toBe('3:00')
  })

  test('走过多少就读少多少：读数只由 deadline − now 决定', () => {
    // 没有任何「累计过去多久」的中间量：同一个 deadline 配不同的 now，
    // 读数就按差走（后台挂起 / 刷新页面的性质，SPEC §3.1）
    expect(countdownLabel(DEADLINE, NOW + 60_000)).toBe('2:00')
    expect(countdownLabel(DEADLINE, NOW + 119_000)).toBe('1:01')
    expect(countdownLabel(DEADLINE, NOW + 179_000)).toBe('0:01')
  })

  test('整秒边界含端点：到点那一刻读 0:00，前一毫秒读 0:01', () => {
    // 与引擎的判据（now >= deadline 结算）同一条边界：表读到 0:00 的瞬间
    // 这一局就该结束了。向上取整是这里的关键——floor 会让表提前一秒归零。
    expect(countdownLabel(DEADLINE, DEADLINE - 1)).toBe('0:01')
    expect(countdownLabel(DEADLINE, DEADLINE)).toBe('0:00')
    expect(countdownLabel(DEADLINE, DEADLINE + 5_000)).toBe('0:00')
  })

  test('秒位补零、分钟位不补（三分钟模式不需要小时位）', () => {
    expect(countdownLabel(NOW + 5_000, NOW)).toBe('0:05')
    expect(countdownLabel(NOW + 65_000, NOW)).toBe('1:05')
    expect(countdownLabel(NOW + 125_000, NOW)).toBe('2:05')
  })

  test('到点之后不出现负数：过期那一瞬只剩「读数是 0」要传达', () => {
    expect(countdownLabel(DEADLINE, DEADLINE + 86_400_000)).toBe('0:00')
    expect(countdownLabel(NOW, NOW + 1)).toBe('0:00')
  })
})
