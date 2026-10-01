import { describe, expect, test } from 'vitest'
import {
  EMPTY_PRESENCE,
  layerForPhase,
  nextPresence,
  type PresenceState,
  type ResultLayerSpec,
} from '../../src/renderer/components/ResultPresence'

/**
 * T27 结果层的**在场**裁决（result-layer.md 的架构决策 9 / 10）
 *
 * 这个文件里没有 React、没有浏览器：`nextPresence` 是纯函数，「层什么时候该在场上、什么
 * 时候该退场、换层连击怎么接」全部判断都在它里面，所以能在这里逐条驱动。挂不挂得上
 * （DOM、动画、指针）归 tests/e2e/result-layer.spec.ts。
 *
 * 边界说清楚：**这一层不测时长对得上 CSS**。150ms 只用来在动画放完后把层摘掉，它对玩家
 * 隐形，为它立一份 JS/CSS 契约测试是给一个不可能被看见的偏差上税。
 */

/** 达标那一层。endReason 只有终局那两档给，所以这一层永远是 null */
const WON: ResultLayerSpec = { tier: 'won', panel: 'win', endReason: null }
/** 死局（还没决定）*/
const STUCK: ResultLayerSpec = { tier: 'stuck', panel: 'gameover', endReason: null }
/** 已结算 */
const ENDED: ResultLayerSpec = { tier: 'ended', panel: 'gameover', endReason: 'deadlock' }

/** 场上什么都没有 */
const NONE = EMPTY_PRESENCE

/** 一层在场上，不退场 */
function holding(spec: ResultLayerSpec): PresenceState {
  return { layer: spec, leaving: false }
}

/** 一层在场上，正在退场 */
function leaving(spec: ResultLayerSpec): PresenceState {
  return { layer: spec, leaving: true }
}

/** 逐字段比，免得「新对象但内容相同」被当成变化 */
function same(spec: ResultLayerSpec | null): ResultLayerSpec | null {
  return spec === null ? null : { ...spec }
}

describe('phase → 这一层的映射', () => {
  test('四个 phase 各归各的一处：playing 不意味任何层', () => {
    expect(layerForPhase('playing', null)).toBeNull()
    expect(layerForPhase('won', null)).toEqual(WON)
    expect(layerForPhase('stuck', null)).toEqual(STUCK)
    expect(layerForPhase('ended', 'won')).toEqual({
      tier: 'ended',
      panel: 'gameover',
      endReason: 'won',
    })
  })

  test('为什么结束跟着 phase 走：win 那一处不给，终局两档才给', () => {
    // win 不是终局，所以它的 endReason 恒为 null——DOM 上 data-end-reason 整个不出现
    for (const reason of ['won', 'deadlock', 'abandoned', 'timeout', null] as const) {
      expect(layerForPhase('won', reason)?.endReason).toBeNull()
    }
    // 死局那一档还没有「为什么结束」可言（那是结算时才有的事实）
    expect(layerForPhase('stuck', 'deadlock')?.endReason).toBeNull()
    // 终局两档照原样带上
    expect(layerForPhase('ended', 'timeout')?.endReason).toBe('timeout')
  })
})

describe('phase 意味着哪一层就持着哪一层', () => {
  test('从空场进场', () => {
    expect(nextPresence(NONE, WON, false)).toEqual(holding(WON))
    expect(nextPresence(NONE, STUCK, false)).toEqual(holding(STUCK))
  })

  test('同一层一直在场上：状态原样返回（引用都不换，免得白渲染）', () => {
    const current = holding(STUCK)
    expect(nextPresence(current, same(STUCK), false)).toBe(current)
  })

  test('空场 + 空 phase：什么都没有，也什么都不做', () => {
    const current = NONE
    expect(nextPresence(current, null, false)).toBe(current)
  })
})

describe('phase 不再意味着任何一层：留着它退场', () => {
  test('从「有一层」到 null：层留着，标上退场', () => {
    expect(nextPresence(holding(STUCK), null, false)).toEqual(leaving(STUCK))
    expect(nextPresence(holding(WON), null, false)).toEqual(leaving(WON))
  })

  test('已经在退场就什么都不做（不能再标一次，也不能立刻摘掉）', () => {
    const current = leaving(STUCK)
    expect(nextPresence(current, null, false)).toBe(current)
  })
})

describe('退场中途：立刻换、取消退场', () => {
  test('换了另一层：立刻换上，退场标记取消（不在一段退场上再叠一段进场）', () => {
    expect(nextPresence(leaving(STUCK), WON, false)).toEqual(holding(WON))
    expect(nextPresence(leaving(WON), STUCK, false)).toEqual(holding(STUCK))
  })

  test('同一层回来（撤销出去又走回来）：取消退场，层原地留着', () => {
    expect(nextPresence(leaving(STUCK), same(STUCK), false)).toEqual(holding(STUCK))
  })

  test('换到终局那一档也一样：stuck 退场中途结算', () => {
    expect(nextPresence(leaving(STUCK), ENDED, false)).toEqual(holding(ENDED))
  })
})

describe('没有过渡直接换层：旧层先退场，新层再进场', () => {
  test('won 继续玩那一手同时是最后一步合法移动：同一次提交里 won 变 stuck', () => {
    // 架构决策 10：引擎的 continueRun 是**一个**纯迁移，所以这一手是一次提交从 won 到
    // stuck，中间没有「playing」那一帧。层因此必须自己接住这段顺序：先把胜利层标成退场，
    // 到点再换成死局层
    const current = holding(WON)
    expect(nextPresence(current, STUCK, false)).toEqual(leaving(WON))
  })

  test('胜利层上「结束并记录」：won 直接变 ended，同样两段相接', () => {
    expect(nextPresence(holding(WON), ENDED, false)).toEqual(leaving(WON))
  })

  test('两档都在场但 tier 不同（stuck → ended）也算换层：旧档先退场', () => {
    // 两个都是 gameover 那一处，但 tier 不同——卡片上那句话、遮罩的强度全变了，
    // 所以它是「另一层」，不是同一层换个说法
    expect(nextPresence(holding(STUCK), ENDED, false)).toEqual(leaving(STUCK))
  })
})

describe('作弊交换拾取中：整层当场收起', () => {
  test('拾取中无论相位如何都收起，且不播退场', () => {
    expect(nextPresence(holding(STUCK), null, true)).toEqual(NONE)
    expect(nextPresence(holding(WON), null, true)).toEqual(NONE)
    // 连退场中途也当场收：那是一个进得快出得也快的模式，淡出只会让挑方块变卡
    expect(nextPresence(leaving(STUCK), null, true)).toEqual(NONE)
  })

  test('ended 那一侧不收：拾取旗标配不上它，`implied` 照旧是终局层', () => {
    // store 的 selectCell 直接拒绝已终局的一局，所以 App 只在 stuck 才把拾取当成
    // 「收起」的理由；走到这里说明调用方没给 instantHide
    expect(nextPresence(holding(ENDED), ENDED, false)).toEqual(holding(ENDED))
  })
})
