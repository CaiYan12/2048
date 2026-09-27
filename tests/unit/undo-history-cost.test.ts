import { describe, expect, test } from 'vitest'
import type { Direction, GameState } from '../../src/shared/types'
import { createGame, move } from '../../src/game/engine'
import { NOW } from './support'

/**
 * T11 的实测（mode-contract §4「必须实测的指标」）
 *
 * ticket 验收标准第三条：**测试测量长局历史成本，不通过截断旧状态满足内存限制**。
 * 这里的任务是测出数字并报告，不是把数字改好——ADR-0003 禁的就是悄悄丢历史，
 * 所以下面没有任何上限、环形缓冲或截断。
 *
 * ┌ 两件必须分清楚的事 ────────────────────────────────────────────────┐
 * │ 1. **真实对局能下多久**。同一条定向序列（left/up/right/down）在 5×5 上   │
 * │    实测 **1,318** 步就走死（本文件底部 `realGameCeiling()` 每次跑都会    │
 * │    把它算出来并打进控制台那张表），换贪心策略约 1,800 步。               │
 * │    10,000 步**不可能来自一局真实对局**。                                │
 * │ 2. **撤销栈本身的成本**。mode-contract §4 要测的是这个：1,000 / 10,000 │
 * │    份前态留在 history 里，占多少字节、序列化要多久。本次因此直接把      │
 * │    1,000 / 10,000 份快照压进 history 数组来测——快照取自真实对局的     │
 * │    中间状态（形状与数值分布都是真的），但「凑到 10,000 份」靠的是多段   │
 * │    真实对局，不是一局下到底。测的是栈的成本，不是一局的长度。          │
 * └────────────────────────────────────────────────────────────────────┘
 *
 * 指标口径（mode-contract §4 的表）：
 *   · 内存占用（撤销栈）——node 环境没有 `performance.memory`（那是 Chrome 专有），
 *     所以用 **JSON 序列化后的字节数**这个确定性代理：同一份历史每次序列化字节数
 *     完全相同，可复现、可回归。这是契约认可的做法，不是退而求其次。
 *   · 序列化后写入量——同上，字符串长度即字节数（ASCII）。
 *   · 刷新后恢复耗时——归 T16（它才有持久化层），这里只给「读回并解析同一份历史」
 *     的上界参考。
 *
 * `performance.memory` 拿不到这件事本身也要说清楚：上面的代理测的是**数据量**，
 * 不是浏览器堆占用。真要报堆占用得在真实浏览器里量，那是 T16 的事。
 */

/** 方向序列：与 tests/unit/undo.test.ts 的长链驱动同一条，索引跟着有效步数走 */
const CYCLE: readonly Direction[] = ['left', 'up', 'right', 'down']

/** 每一段真实对局最多的尝试次数。有界：超过就换下一段，绝不做无界循环 */
const SEGMENT_ATTEMPT_CAP = 4_000

/**
 * 真实对局的上限也设一个界：同一条定向序列实测 1,318 步走死，4,000 次尝试
 * 足够让它「走到死为止」，又不会在死局上空转太久。
 */
const CEILING_ATTEMPT_CAP = 4_000

/** 采集 count 份「长得像长局中段」的前态 */
function collectSnapshots(count: number): GameState[] {
  const out: GameState[] = []
  let seed = 20260926
  while (out.length < count) {
    let state = createGame('big-board', seed, NOW)
    seed += 1
    let attempts = 0
    while (out.length < count && attempts < SEGMENT_ATTEMPT_CAP) {
      attempts += 1
      const outcome = move(state, CYCLE[attempts % CYCLE.length])
      if (!outcome.changed) continue
      // 与 store 的口径一致：历史里放的是**移动前**那一个状态
      out.push(state)
      state = outcome.state
    }
  }
  return out
}

/** 一段真实对局能走多少步有效移动（走死为止）——上面第 1 件事的那个数 */
function realGameCeiling(): number {
  let state = createGame('big-board', 20260926, NOW)
  let effective = 0
  let attempts = 0
  while (attempts < CEILING_ATTEMPT_CAP) {
    attempts += 1
    const outcome = move(state, CYCLE[effective % CYCLE.length])
    if (!outcome.changed) continue
    state = outcome.state
    effective += 1
  }
  return effective
}

interface Measurement {
  /** 历史条目数 */
  entries: number
  /** JSON.stringify(history).length——撤销栈的序列化字节数 */
  bytes: number
  /** 每份前态平均多少字节 */
  bytesPerEntry: number
  /** 采集这 count 份快照的耗时中位数（ms，3 次取样取中间那次） */
  collectMs: number
  /** 序列化耗时中位数（ms，3 次取样取中间那次） */
  serializeMs: number
  /** 把这 count 份快照按 store 的方式推进 history 的耗时中位数（ms） */
  pushMs: number
  /** 每 1,000 次入栈的耗时（ms）——平方增长的直接读数 */
  pushMsPerThousand: number
}

/** 取三次计时的中位数，消掉单次 GC 抖动 */
function medianOf(run: () => void): number {
  const samples: number[] = []
  for (let i = 0; i < 3; i++) {
    const started = performance.now()
    run()
    samples.push(performance.now() - started)
  }
  samples.sort((a, b) => a - b)
  return samples[1]
}

function measure(entries: number): Measurement {
  // 采集也计时。collectSnapshots 是拿真实对局一段一段打出来的，此前它完全没被计时，
  // 于是「会不会失控」那道闸门只看小头。实测（10,000 档）采集约 42 ms、入栈约 73 ms：
  // 采集不是最大头，最大头是入栈那条平方曲线；但它既然在测量里，就该在被测量的账上。
  // 三次取中位；最后一份样本直接拿去用，不多打一遍。
  let history: GameState[] = []
  const collectMs = medianOf(() => {
    history = collectSnapshots(entries)
    // 一条都不许少：这是「不截断」的断言本体
    expect(history).toHaveLength(entries)
  })

  const serializeMs = medianOf(() => {
    JSON.stringify(history)
  })
  const bytes = JSON.stringify(history).length

  // 入栈成本：与 store 里那一行逐字相同的表达式
  // （`return { game: outcome.state, history: [...state.history, state.game] }`）。
  // 在这里单独计时而不是走 10,000 次 store.move：表达式相同，而省下的正是
  // zustand 的订阅簿记——node 里没有订阅者，但那部分开销测出来没有意义。
  const pushMs = medianOf(() => {
    let stack: readonly GameState[] = []
    for (const snapshot of history) stack = [...stack, snapshot]
    expect(stack).toHaveLength(entries)
  })

  return {
    entries,
    bytes,
    bytesPerEntry: Math.round(bytes / entries),
    collectMs,
    serializeMs,
    pushMs,
    pushMsPerThousand: (pushMs / entries) * 1_000,
  }
}

describe('长局历史成本（mode-contract §4 的实测）', () => {
  const thousand = measure(1_000)
  const tenThousand = measure(10_000)

  test('1,000 / 10,000 份前态的真实数字', () => {
    // 控制台里的这张表就是 ticket 第三条要求交付的东西；断言只钉「不许截断」
    // 与「CI 跑得动」，不去把数字改好。
    console.table([
      { 指标: '历史条目数', '1,000 次': thousand.entries, '10,000 次': tenThousand.entries },
      { 指标: '序列化字节数', '1,000 次': thousand.bytes, '10,000 次': tenThousand.bytes },
      {
        指标: '每份前态字节',
        '1,000 次': thousand.bytesPerEntry,
        '10,000 次': tenThousand.bytesPerEntry,
      },
      {
        指标: '采集快照耗时 ms（中位）',
        '1,000 次': thousand.collectMs.toFixed(2),
        '10,000 次': tenThousand.collectMs.toFixed(2),
      },
      {
        指标: '序列化耗时 ms（中位）',
        '1,000 次': thousand.serializeMs.toFixed(2),
        '10,000 次': tenThousand.serializeMs.toFixed(2),
      },
      {
        指标: '入栈总耗时 ms（中位）',
        '1,000 次': thousand.pushMs.toFixed(2),
        '10,000 次': tenThousand.pushMs.toFixed(2),
      },
      {
        指标: '每 1,000 步入栈 ms',
        '1,000 次': thousand.pushMsPerThousand.toFixed(2),
        '10,000 次': tenThousand.pushMsPerThousand.toFixed(2),
      },
      // 上面第 1 件事：真实对局的上限，与 10,000 那列不是一回事
      {
        指标: '（参考）一局真实 5×5 的有效步数',
        '1,000 次': '—',
        '10,000 次': realGameCeiling(),
      },
    ])
  })

  test('一条历史都不截断：条目数与字节数都随规模线性走', () => {
    // 环形缓冲 / 步数上限会让 10,000 那一列停在「缓冲大小 × 每份字节」上，
    // 于是每份字节数会明显高于 1,000 那一列。两个深度必须几乎相等。
    expect(tenThousand.entries).toBe(10 * thousand.entries)
    expect(tenThousand.bytesPerEntry).toBeGreaterThan(thousand.bytesPerEntry * 0.9)
    expect(tenThousand.bytesPerEntry).toBeLessThan(thousand.bytesPerEntry * 1.1)
    // 没有上限的别名叫法：10 倍的条目就是 10 倍的字节
    expect(tenThousand.bytes).toBeGreaterThan(9 * thousand.bytes)
  })

  test('入栈是 O(n) 一次、整条链 O(n²)：每 1,000 步的成本随深度上升', () => {
    // `[...state.history, state.game]` 每步都要把已有历史整份复制一遍，
    // 于是「每 1,000 步花多久」会随栈深上升——这是本次设计的事实，
    // 测出来就是为了把它摊在报告里，不是为了让数字好看。
    //
    // 增长阶数单看入栈这一项：采集快照是**线性**的（每份一份常量工作），把它并进
    // 来的话斜率会被摊薄，真要盯的还是入栈那条平方曲线。
    expect(tenThousand.pushMsPerThousand).toBeGreaterThan(thousand.pushMsPerThousand)
  })

  test('CI 承受得住：采集、序列化与入栈都不许把测试拖到秒级', () => {
    // 契约的边界条款：不得把测试规模说成浏览器容量保证。这个上界同理——
    // 它是「这条测试不会拖垮 CI」的闸门，不是对浏览器存储的承诺。
    // 采集那一项必须也在这个闸门里：它是这份测量的大头，漏掉它等于没闸。
    expect(thousand.collectMs).toBeLessThan(2_000)
    expect(tenThousand.collectMs).toBeLessThan(2_000)
    expect(tenThousand.serializeMs).toBeLessThan(2_000)
    expect(tenThousand.pushMs).toBeLessThan(2_000)
    const totalMs =
      thousand.collectMs +
      tenThousand.collectMs +
      thousand.pushMs +
      tenThousand.pushMs +
      thousand.serializeMs +
      tenThousand.serializeMs
    expect(totalMs).toBeLessThan(5_000)
  })
})
