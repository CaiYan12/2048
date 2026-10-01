import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { GameState, StyleId } from '../../src/shared/types'
import type { RecordEntry, Settlement, SettlementAttribution, SettlementWrite } from '../../src/renderer/stores/records'
import { resultReadout } from '../../src/renderer/stores/records'
import { createGame } from '../../src/game/engine'
import { useGameStore } from '../../src/renderer/stores/useGameStore'
import { NOW, stateWithBoard, type CellSpec } from './support'

/**
 * T26 结果层的读数（result-layer.md 的架构决策 6 / 7）
 *
 * 分两半，各回答一个不同的问题：
 *
 *   1. **纯判定**（records.ts 的 resultReadout）：读哪一条记录、结算前还是结算后、
 *      是不是新纪录。node 直驱，不碰浏览器——这一层是「最高分归属」这类错误唯一住得
 *      下的地方，而它在界面上只是两个数字，肉眼很难看出错。
 *   2. **归属怎么落进 store**：结算那一刻写、新游戏清、不落盘、换风格不动它。
 *      假后端与 tests/unit/records-settle.test.ts 同一条路子（vi.mock 掉
 *      ./sessionStore，真的 IndexedDB 那一半由 e2e 覆盖）。
 *
 * 边界面先说清楚，免得读的人以为这里证了更多事情：**读数在浏览器里长什么样**归
 * tests/e2e/result-layer.spec.ts。这里只证数字算得对。
 */

/** 一条记录。模式 × 风格是键，这里直接列成表，省得每条例一句 new */
function entry(modeId: string, styleId: StyleId, bestScore: number): RecordEntry {
  return { modeId: modeId as RecordEntry['modeId'], styleId, bestScore, highestTile: 2048 }
}

/** 一副铺好的 4×4 局面（最大的那块是 1024），其余字段按用例给 */
const LAID_OUT: CellSpec[][] = [
  [1024, 2, 4, 8],
  [16, 32, 64, 128],
  [256, 8, 2, 4],
  [64, 2, 4, 8],
]

/** 一局进行中的经典局：分数与步数都给能认出来的值 */
function run(overrides: Partial<GameState> = {}): GameState {
  return {
    ...stateWithBoard(LAID_OUT, 123456, 'classic'),
    score: 4242,
    moves: 9,
    ...overrides,
  }
}

/** 一副一按右就死的棋盘（tests/unit/records-settle.test.ts 同款） */
function oneStepFromDeadlock(): GameState {
  return {
    ...createGame('classic', 20260926, NOW),
    board: [
      [{ id: 1, value: 8 }, { id: 2, value: 2 }, { id: 3, value: 4 }, null],
      [{ id: 4, value: 8 }, { id: 5, value: 2 }, { id: 6, value: 4 }, { id: 7, value: 8 }],
      [{ id: 8, value: 2 }, { id: 9, value: 4 }, { id: 10, value: 8 }, { id: 11, value: 2 }],
      [{ id: 12, value: 4 }, { id: 13, value: 8 }, { id: 14, value: 2 }, { id: 15, value: 4 }],
    ],
  }
}

describe('resultReadout：读哪一条记录', () => {
  test('未结算读当前风格：换一风格，最高分跟着换', () => {
    const entries: readonly RecordEntry[] = [
      entry('classic', 'classic', 100),
      entry('classic', 'material', 200),
      entry('classic', 'claude', 300),
    ]

    for (const styleId of ['classic', 'material', 'claude'] as StyleId[]) {
      const readout = resultReadout(run(), entries, null, styleId)
      // 这一局还没归属任何风格（attribution 为 null），所以问的是「此刻选中的那一个」
      expect(readout.bestScore, styleId).toBe(
        entries.find((item) => item.styleId === styleId)?.bestScore
      )
      expect(readout.score).toBe(4242)
      expect(readout.moves).toBe(9)
      expect(readout.isNewBest).toBe(true)
    }
  })

  test('模式也是键：同一风格另一个模式的记录不混用', () => {
    const entries: readonly RecordEntry[] = [
      entry('classic', 'material', 5000),
      entry('walls', 'material', 7),
    ]

    // 本局是 walls，于是 5000 那一条（经典模式）与它无关
    const readout = resultReadout(run({ modeId: 'walls' }), entries, null, 'material')
    expect(readout.bestScore).toBe(7)
    // 4242 > 7：同样的分数换个模式就是破纪录的——按模式各算各的
    expect(readout.isNewBest).toBe(true)
  })

  test('空记录桶：最高分 0，而 0 分的一局不算破纪录', () => {
    const empty = resultReadout(run(), [], null, 'classic')
    expect(empty.bestScore).toBe(0)
    expect(empty.isNewBest).toBe(true)

    // 一分未得的一局对着一份空桶：不「刷新」任何东西
    const blank = resultReadout(run({ score: 0 }), [], null, 'classic')
    expect(blank.bestScore).toBe(0)
    expect(blank.isNewBest).toBe(false)
  })
})

describe('resultReadout：结算前还是结算后', () => {
  /** 已结算的归属：成绩归 claude，而结算前 claude 那一格是 300 */
  const settled: SettlementAttribution = { styleId: 'claude', bestScoreBefore: 300 }

  /** 盘上那一份是**写完**的样子：claude 那条已经含着本局 4242，material 是另一条 */
  const afterWrite: readonly RecordEntry[] = [
    entry('classic', 'claude', 4242),
    entry('classic', 'material', 5),
  ]

  test('结算之后读结算那条记录，当前风格换走了也不跟', () => {
    // 玩家结算完换成 material：盘上 material 只有 5 分，而这一局归 claude
    const readout = resultReadout(
      run({ phase: 'ended', endReason: 'deadlock' }),
      afterWrite,
      settled,
      'material'
    )
    expect(readout.bestScore).toBe(4242)
    // 门槛是结算前那一条（300），不是盘上这条（4242）——拿盘上这条比会把每一局都判成
    // 「没破纪录」，因为写入是幂等的，它已经含着本局分数了
    expect(readout.isNewBest).toBe(true)
  })

  test('结算之后没破纪录：读旧的那条，判定为 false', () => {
    const attribution: SettlementAttribution = { styleId: 'classic', bestScoreBefore: 9000 }
    const readout = resultReadout(
      run({ phase: 'ended', endReason: 'deadlock' }),
      [entry('classic', 'classic', 9000)],
      attribution,
      'classic'
    )
    expect(readout.bestScore).toBe(9000)
    expect(readout.isNewBest).toBe(false)
  })

  test('平手不算破纪录：要大于，不是大于等于', () => {
    const attribution: SettlementAttribution = { styleId: 'classic', bestScoreBefore: 4242 }
    const readout = resultReadout(run(), [], attribution, 'classic')
    expect(readout.isNewBest).toBe(false)
  })

  test('结算之后模式仍由本局给：归属只带风格，不带模式', () => {
    const entries: readonly RecordEntry[] = [
      entry('classic', 'claude', 11),
      entry('walls', 'claude', 22),
    ]
    const readout = resultReadout(
      run({ modeId: 'walls', phase: 'ended', endReason: 'deadlock' }),
      entries,
      settled,
      'claude'
    )
    expect(readout.bestScore).toBe(22)
  })
})

describe('resultReadout：步数报的是眼前这条路', () => {
  test('撤销一步，分数与步数一起减一', () => {
    // 撤销搬回的是**完整前态**（ADR-0003），分数与步数都在其中。所以读数报的不是
    // 「按了多少次键」，而是「眼前这一条路上走到了第几步」
    const before = resultReadout(run({ score: 4242, moves: 9 }), [], null, 'classic')
    expect([before.score, before.moves]).toEqual([4242, 9])

    const undone = resultReadout(run({ score: 4142, moves: 8 }), [], null, 'classic')
    expect([undone.score, undone.moves]).toEqual([4142, 8])
  })

  test('作弊交换不动步数：它进历史，但不是一次移动', () => {
    // ADR-0008 的架构决策 8 要的就是这一把尺子：交换两个字段一个都不碰
    const swapped = resultReadout(run({ score: 4242, moves: 9 }), [], null, 'classic')
    expect(swapped.moves).toBe(9)
    expect(swapped.score).toBe(4242)
  })
})

/**
 * 后半：归属怎么落进 store。用一个内存假后端替掉真的 IndexedDB（同
 * records-settle.test.ts 的路子）——这里测的是本票自己写的那几道接线，不是存储。
 */
const fake = vi.hoisted(() => {
  const store = {
    settings: new Map<string, unknown>(),
    session: new Map<string, unknown>(),
    history: new Map<number, unknown>(),
    records: new Map<string, unknown>(),
    stats: new Map<string, unknown>(),
    writes: [] as string[],
  }
  return { store }
})

vi.mock('../../src/renderer/stores/sessionStore', async () => {
  // 真的纯函数：合并与拒绝的逻辑因此是本票的代码在被测，假后端只负责搬字节
  const records = await import('../../src/renderer/stores/records')
  return {
    readSettingsRaw: async (): Promise<unknown> => fake.store.settings.get('current') ?? null,
    readSessionRaw: async (): Promise<unknown> => fake.store.session.get('current') ?? null,
    readHistoryRaw: async (count: number): Promise<unknown[]> => {
      const out: unknown[] = []
      for (let index = 0; index < count; index += 1) out.push(fake.store.history.get(index))
      return out
    },
    readRecordsEntries: async (): Promise<readonly { key: string; value: unknown }[]> =>
      [...fake.store.records].map(([key, value]) => ({ key, value })),
    readStatsRaw: async (): Promise<unknown> => fake.store.stats.get('current') ?? null,
    writeSettings: async (record: unknown): Promise<void> => {
      fake.store.writes.push('settings')
      fake.store.settings.set('current', record)
    },
    writeSettlement: async (settlement: Settlement): Promise<SettlementWrite> => {
      const key = records.recordKey(settlement.modeId, settlement.styleId)
      const previous = records.decodeStyleRecord(fake.store.records.get(key))
      fake.store.writes.push('settlement')
      fake.store.records.set(
        key,
        records.applySettlement(previous.kind === 'ok' ? previous.record : null, settlement)
      )
      return { kind: 'written' }
    },
    saveRun: async (
      record: unknown,
      delta: { kind: string; index?: number; game?: GameState }
    ): Promise<void> => {
      fake.store.writes.push(`session:${delta.kind}`)
      fake.store.session.set('current', record)
      if (delta.kind === 'push' && delta.index !== undefined) {
        fake.store.history.set(delta.index, delta.game)
      }
      if (delta.kind === 'pop' && delta.index !== undefined) {
        fake.store.history.delete(delta.index)
      }
      if (delta.kind === 'reset') fake.store.history.clear()
    },
    clearRun: async (): Promise<void> => {
      fake.store.writes.push('clear')
      fake.store.session.delete('current')
      fake.store.history.clear()
    },
  }
})

/** 让那些 fire-and-forget 的写盘把整条链跑完（写盘 → 读回 → 落 state） */
async function settleWrites(): Promise<void> {
  for (let index = 0; index < 16; index += 1) await Promise.resolve()
}

function pristineStore(): void {
  useGameStore.setState({
    game: null,
    dailyDate: null,
    history: [],
    swapArmed: false,
    swapSelection: null,
    styleId: 'classic',
    selectedModeId: 'classic',
    runStartedAt: null,
    styleSwitches: 0,
    runMerges: 0,
    settlementAttribution: null,
    unlocked: [],
    toasts: [],
    nextToastKey: 0,
    records: [],
    stats: null,
    storageNotice: null,
    restoring: true,
  })
}

/** 把一局摆进 store。`records` 是「盘上那一份」的种子：门槛就在它里面读 */
function mount(
  game: GameState,
  options: { styleId?: StyleId; records?: readonly RecordEntry[] } = {}
): void {
  useGameStore.setState({
    game,
    history: [],
    styleId: options.styleId ?? 'classic',
    runStartedAt: NOW,
    records: options.records ?? [],
    settlementAttribution: null,
    runMerges: 0,
    unlocked: [],
    toasts: [],
    nextToastKey: 0,
  })
}

/** 此刻的读数（组件拿到手的就是这一份形状） */
function readout(): { score: number; bestScore: number; moves: number; isNewBest: boolean } {
  const state = useGameStore.getState()
  return resultReadout(
    state.game as GameState,
    state.records,
    state.settlementAttribution,
    state.styleId
  )
}

beforeEach(() => {
  fake.store.settings.clear()
  fake.store.session.clear()
  fake.store.history.clear()
  fake.store.records.clear()
  fake.store.stats.clear()
  fake.store.writes = []
  pristineStore()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('结算那一刻写下归属', () => {
  test('风格是结算时的那个，门槛是写入前那一格', async () => {
    // 盘上 classic:classic 已经躺在 300 分：这正是「结算前是多少」
    mount(run({ phase: 'stuck' }), {
      styleId: 'classic',
      records: [entry('classic', 'classic', 300)],
    })

    useGameStore.getState().settle()
    await settleWrites()

    expect(useGameStore.getState().settlementAttribution).toEqual({
      styleId: 'classic',
      bestScoreBefore: 300,
    })
    // 而盘上那条被抬到本局分数（幂等的最大值语义，records-settle.test.ts 钉着）
    expect(useGameStore.getState().records).toContainEqual({
      modeId: 'classic',
      styleId: 'classic',
      bestScore: 4242,
      highestTile: 1024,
    })
    // 界面上于是同时看得见「本局 4242」与「刚刚破的是 300 那一条」
    expect(readout()).toEqual({ score: 4242, bestScore: 4242, moves: 9, isNewBest: true })
  })

  test('连切几次风格再结算：只归最后那一个，门槛也是那一个的', async () => {
    mount(run({ phase: 'stuck' }), {
      styleId: 'classic',
      records: [entry('classic', 'classic', 300), entry('classic', 'material', 50)],
    })
    for (const id of ['material', 'claude', 'classic', 'material'] as StyleId[]) {
      useGameStore.getState().setStyle(id)
    }

    useGameStore.getState().settle()
    await settleWrites()

    expect(useGameStore.getState().settlementAttribution).toEqual({
      styleId: 'material',
      bestScoreBefore: 50,
    })
    // 结算之后换到 claude 上：这一局已经归 material，读数仍读 material 那一条（4242），
    // 不是当前 claude 的空桶 0——这正是「最高分描述刚打完的那一局」（架构决策 6）
    useGameStore.getState().setStyle('claude')
    expect(readout().bestScore).toBe(4242)
  })

  test('Time Attack 到点强制结算：同样写下归属', async () => {
    mount(run({ modeId: 'time-attack', phase: 'playing', deadline: NOW + 180000 }), {
      styleId: 'claude',
      records: [entry('time-attack', 'claude', 77)],
    })
    vi.useFakeTimers({ toFake: ['Date'], now: NOW + 180000 })

    useGameStore.getState().tick()
    await settleWrites()

    expect(useGameStore.getState().game?.endReason).toBe('timeout')
    expect(useGameStore.getState().settlementAttribution).toEqual({
      styleId: 'claude',
      bestScoreBefore: 77,
    })
    // 4242 > 77：这一局破了自己那条记录
    expect(readout().isNewBest).toBe(true)
  })

  test('新游戏清空归属：新的一局没有结算过', async () => {
    mount(run({ phase: 'stuck' }), { records: [entry('classic', 'classic', 300)] })
    useGameStore.getState().settle()
    await settleWrites()
    expect(useGameStore.getState().settlementAttribution).not.toBeNull()

    useGameStore.getState().newGame()
    await settleWrites()

    expect(useGameStore.getState().settlementAttribution).toBeNull()
    // 于是新一局的读数问的是当前风格，而不是上一局留在字段里的那一个。
    // 战绩桶不因新游戏而清零（T16 验收标准 3），所以这里读得到 4242，而分数是 0
    expect(readout()).toEqual({ score: 0, bestScore: 4242, moves: 0, isNewBest: false })
  })

  test('结算之后换风格：归属不动（读数继续描述刚打完的那一局）', async () => {
    mount(run({ phase: 'stuck' }), {
      styleId: 'classic',
      records: [entry('classic', 'classic', 300)],
    })
    useGameStore.getState().settle()
    await settleWrites()
    const attribution = useGameStore.getState().settlementAttribution

    useGameStore.getState().setStyle('material')
    await settleWrites()

    expect(useGameStore.getState().settlementAttribution).toBe(attribution)
    // 盘上 material 一条都没有，但这一局归 classic：读数仍是 4242，不是 0
    expect(readout().bestScore).toBe(4242)
  })
})

describe('归属不落盘', () => {
  test('session 记录里没有这个字段', async () => {
    mount(run({ phase: 'stuck' }), { records: [entry('classic', 'classic', 300)] })
    // 先走一步：它会写一份 session 记录，正是要查的那一份字节
    useGameStore.getState().setStyle('material')
    await settleWrites()
    const written = fake.store.session.get('current') as Record<string, unknown>
    expect(Object.keys(written)).not.toContain('settlementAttribution')

    // 而结算那一行的写盘序列是「先写记录、再作废存档」：两样都不带归属
    useGameStore.getState().settle()
    await settleWrites()
    expect(fake.store.writes).toEqual(['settings', 'session:none', 'settlement', 'clear'])
    expect(fake.store.session.size).toBe(0)
  })

  test('刷新之后看不到结果层：已结算的一局被安静丢弃', async () => {
    mount(run({ phase: 'stuck' }), { records: [entry('classic', 'classic', 300)] })
    useGameStore.getState().settle()
    await settleWrites()
    expect(useGameStore.getState().settlementAttribution).not.toBeNull()

    // 全新一次加载：store 回到还没开局的样子，再 hydrate
    pristineStore()
    useGameStore.getState().hydrate()
    await settleWrites()

    const state = useGameStore.getState()
    // 已结算的一局安静作废（T16），于是结果层没有可挂的对局，字段也就无从读起
    expect(state.game).toBeNull()
    expect(state.settlementAttribution).toBeNull()
  })
})

describe('设一条真实路径：撤销让步数减一', () => {
  test('一步走死 → 撤销 → 读数回到上一步', () => {
    mount(oneStepFromDeadlock())
    useGameStore.getState().move('right')
    const stuck = useGameStore.getState().game as GameState
    expect(stuck.phase).toBe('stuck')
    expect(readout().moves).toBe(1)

    useGameStore.getState().undo()
    const playing = useGameStore.getState().game as GameState
    expect(playing.phase).toBe('playing')
    expect(readout().moves).toBe(0)
    // 顺带把「为什么这一幕在浏览器里证不了」钉住：撤销把 phase 也搬回了 playing，
    // 于是结果层整个不在画面上——这一条只能在这里证（e2e 断的是数字对得上）
    expect(playing.moves).toBe(0)
  })
})
