import { describe, expect, test } from 'vitest'
import {
  EMPTY_DRAWER_PRESENCE,
  nextDrawerPresence,
  type DrawerPresenceState,
} from '../../src/renderer/components/SettingsPresence'

/**
 * T38 设置抽屉的**在场**裁决（父规格 docs/specs/settings-drawer.md 的架构决策 10 / 11 ·
 * ADR-0010）
 *
 * 这个文件里没有 React、没有浏览器：`nextDrawerPresence` 是纯函数，「这一层此刻在不在场上、
 * 是不是正在退场」的全部判断都在它里面，所以能在这里逐条驱动。挂不挂得上（DOM、动画、指针）
 * 归 tests/e2e/settings-drawer.spec.ts。
 *
 * 边界说清楚，免得读的人以为它证了更多：
 *   · **不证时长**。250ms / 200ms 只活在 CSS 里（styles/index.css 的 `settings-drawer-*`），
 *     这一层连一个数字都不给——时长由 e2e 从计算样式上量。
 *   · **不证 reduced-motion**。那是浏览器契约（撤位移只留淡入淡出），在 e2e 里量。
 *   · **不证 hook 的复位时机**（「打开→取消退场」是渲染期校正）。复位**规则**在下面那条
 *     用例里，接不接得上 React 归 e2e。
 */

/** 空场：关着且退场播完了 */
const NONE: DrawerPresenceState = EMPTY_DRAWER_PRESENCE
/** 在场上、不退场 */
const OPEN: DrawerPresenceState = { mounted: true, leaving: false }
/** 在场上、正在退场 */
const LEAVING: DrawerPresenceState = { mounted: true, leaving: true }

describe('开着：在场上、不退场', () => {
  test('从空场打开：挂上', () => {
    expect(nextDrawerPresence(NONE, true)).toEqual(OPEN)
  })

  test('已经开着：引用原样返回（免得白渲染）', () => {
    const current = OPEN
    expect(nextDrawerPresence(current, true)).toBe(current)
  })

  test('退场中途又打开：取消退场，层原地留着（不摘也不重挂）', () => {
    // 点「收起」之后 200ms 内又点入口，或点外侧关掉的一瞬间又点开——层已经在台上，
    // 重挂会让它从头播一遍进场，等于把一次「反悔」读成一次「刚打开」
    expect(nextDrawerPresence(LEAVING, true)).toEqual(OPEN)
  })
})

describe('关掉：留着它退场，挂载 ≠ 打开', () => {
  test('从「开着」到关掉：层留着、标上退场', () => {
    expect(nextDrawerPresence(OPEN, false)).toEqual(LEAVING)
  })

  test('已经在退场：什么都不做（不能再标一次，也不能提前摘掉）', () => {
    const current = LEAVING
    expect(nextDrawerPresence(current, false)).toBe(current)
  })

  test('关着且本来就没挂：什么都不做（引用原样返回）', () => {
    const current = NONE
    expect(nextDrawerPresence(current, false)).toBe(current)
  })
})

describe('反复喂同一个输入不换对象', () => {
  // 这条看着琐碎，其实是防渲染循环的：hook 只在输入真的翻了时才调这个函数，而它一旦
  // 每次返回新对象，`next !== presence` 就恒成立，一次校正会把渲染推成循环
  test('连续两次「关掉」返回同一个引用', () => {
    const leaving = nextDrawerPresence(OPEN, false)
    expect(leaving).toEqual(LEAVING)
    expect(nextDrawerPresence(leaving, false)).toBe(leaving)
  })

  test('连续两次「开着」返回同一个引用', () => {
    const open = nextDrawerPresence(NONE, true)
    expect(open).toEqual(OPEN)
    expect(nextDrawerPresence(open, true)).toBe(open)
  })
})
