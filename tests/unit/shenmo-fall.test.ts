import { describe, expect, test } from 'vitest'
import {
  nextShenmoFall,
  type ShenmoFallBeat,
} from '../../src/renderer/components/ShenmoFall'

/**
 * 二念的**两拍终局**（T36 · 控制人 2026-10-01 裁定）
 *
 * 这个文件里没有 React、没有浏览器：`nextShenmoFall` 是纯函数，「两拍的顺序、每一拍在什么
 * 条件下进、什么条件下出」全部判断都在它里面，所以能在这里逐条驱动。挂不挂得上（DOM、
 * 动画、时长对不对得上 CSS）归 tests/e2e/shenmo.spec.ts 那条新用例。
 *
 * 边界说清楚，免得读的人以为它证了更多：
 *   · **不证时长**。600ms / 200ms / 400ms 只活在 CSS 里（styles/index.css 的
 *     `[data-shenmo-fall]`），这一层连一个数字都不给——时长由 e2e 从计算样式上量。
 *   · **不证 reduced-motion**。那是浏览器契约：时长归零 / 淡出换成只有透明度那一条，在
 *     shenmo.spec.ts 里量。
 *   · **不证 hook 的复位时机**（「旗标翻下去 → 复位」那是渲染期校正）。复位**规则**在
 *     下面那一条用例里，接不接得上 React 归 e2e（刷新 / 新开一局之后再走一次二念）。
 */

describe('两拍的顺序：血染 → 停一拍 → 淡出 → 扣下', () => {
  test('dye → out → done，一帧都不许多', () => {
    // 起跑：二念的果刚结出来（store 的 second-pass 落定的那一帧）
    let beat: ShenmoFallBeat = nextShenmoFall('none', { kind: 'cleared', cleared: true })
    expect(beat).toBe('dye')
    // 血染那一播放完才轮到淡出——那 600ms 正是业主要的「血涌上来」，跳过去就只剩一次闪
    beat = nextShenmoFall(beat, { kind: 'finished', finished: 'dye' })
    expect(beat).toBe('out')
    // 淡出那一播放完，页面才扣下
    beat = nextShenmoFall(beat, { kind: 'finished', finished: 'out' })
    expect(beat).toBe('done')
  })

  test('从没结出过二念的果：cleared 一直是假，节拍一个都不动', () => {
    // 一念（第一遍走完）不启动终局——那一遍给的是奖品，不是代价
    expect(nextShenmoFall('none', { kind: 'cleared', cleared: false })).toBe('none')
  })
})

describe('每一拍只认自己那一条结束事件', () => {
  test('血染那一拍不会被淡出的结束事件提前推走，反过来也一样', () => {
    // 为什么这一条要紧：两条监听挂在**同一列**上，而 `animationend` 会冒泡。名字判据哪怕
    // 漏了一处，错的结束事件就把两拍并成一拍（600ms 的染血只剩 0ms），而症状只是
    // 「血好像没上来」——没有任何报错
    expect(nextShenmoFall('dye', { kind: 'finished', finished: 'out' })).toBe('dye')
    expect(nextShenmoFall('out', { kind: 'finished', finished: 'dye' })).toBe('out')
  })

  test('没有终局与已经扣下：一条迟到的结束事件什么都不拉起', () => {
    // 真实的动画结束事件随时可能到——测试派发过合成事件之后它照旧会来。而 `done` 之后
    // 页面已经扣下，那一列都不在 DOM 上了
    expect(nextShenmoFall('none', { kind: 'finished', finished: 'dye' })).toBe('none')
    expect(nextShenmoFall('none', { kind: 'finished', finished: 'out' })).toBe('none')
    expect(nextShenmoFall('done', { kind: 'finished', finished: 'dye' })).toBe('done')
    expect(nextShenmoFall('done', { kind: 'finished', finished: 'out' })).toBe('done')
  })
})

describe('旗标翻下去：两拍复位，下一局的二念照旧从头播', () => {
  test('开新局 / 恢复存档把彩蛋旗标清了：无论播到哪一拍都回到 none', () => {
    // 不复位的代价：同一局里第二次二念会**一瞬间**扣下页面、两拍一次都不播——玩家看到
    // 的还是旧行为，而这一次是回归
    expect(nextShenmoFall('out', { kind: 'cleared', cleared: false })).toBe('none')
    expect(nextShenmoFall('done', { kind: 'cleared', cleared: false })).toBe('none')
    // 而翻上来（又一次二念结出果）永远从血染那一拍起跑
    expect(nextShenmoFall('none', { kind: 'cleared', cleared: true })).toBe('dye')
    expect(nextShenmoFall('done', { kind: 'cleared', cleared: true })).toBe('dye')
  })
})
