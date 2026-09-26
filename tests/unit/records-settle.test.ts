import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { CellSpec } from './support'
import type { GameState, StyleId } from '../../src/shared/types'
import type { Settlement, SettlementWrite } from '../../src/renderer/stores/records'
import { createGame, move } from '../../src/game/engine'
import { NOW, stateWithBoard } from './support'
import { useGameStore } from '../../src/renderer/stores/useGameStore'
import { emptyAchievementProgress } from '../../src/game/achievements'

/**
 * T17 的接线：一次结算怎么变成盘上的一条记录与统计
 *
 * 用一个内存假后端替掉真的 IndexedDB（`vi.mock` 掉 ./sessionStore），与
 * tests/unit/session-persist.test.ts 同一个路子——**这里不是在测 IndexedDB**，
 * 而是在测本票自己写的那几道决策：
 *   · 一局归哪一个风格（结算那一刻的那一个，切几次都只归最后那一个）；
 *   · 最高分 / 最高方块 / 总局数 / 胜局 / 时长按公式怎么变；
 *   · 放弃的一局不写、结算只写一次、已结算的数据不被新游戏擦掉；
 *   · 旧版 / 损坏的桶**不被静默重置**；
 *   · 撤销过几百步的一局与干净的一局在记录里无法区分。
 *
 * 假后端里的合并与拒绝逻辑**调用真的纯函数**（records.ts）：于是「递进来的结算
 * 怎么变成一条记录」这一段是本票的代码在被测，假后端只负责搬字节。
 * 真的 IndexedDB 那半边由 tests/e2e/records.spec.ts 覆盖（跑它的是控制人的 sweep）。
 */

/** 第一局的起始时刻：开局早于结算半小时，于是本局时长是可算的 1800000 */
const RUN_START = Date.UTC(2026, 8, 26, 11, 30)
/** 第一局的结算时刻 */
const SETTLE_AT = Date.UTC(2026, 8, 26, 12)
/** 第二局的起始时刻与结算时刻：两局必须起始于不同时刻，否则幂等键会把第二局也认成第一局 */
const SECOND_RUN_START = Date.UTC(2026, 8, 26, 12, 30)
const SECOND_SETTLE_AT = Date.UTC(2026, 8, 26, 13)

const fake = vi.hoisted(() => {
  const store = {
    settings: new Map<string, unknown>(),
    session: new Map<string, unknown>(),
    history: new Map<number, unknown>(),
    /** records 桶：键 `${modeId}:${styleId}` */
    records: new Map<string, unknown>(),
    /** stats 桶：单例 */
    stats: new Map<string, unknown>(),
    /** 每一次写盘的类目序列，按发生顺序 */
    writes: [] as string[],
    /** writeSettlement 被调了几次（不管有没有真写） */
    settlementCalls: 0,
    /** 真的写盘写了几次 */
    settlementWrites: 0,
  }
  return { store, failWrites: false }
})

vi.mock('../../src/renderer/stores/sessionStore', async () => {
  // 真的纯函数：合并与拒绝的逻辑因此是本票的代码在被测，而不是假后端的复刻
  const records = await import('../../src/renderer/stores/records')
  const session = await import('../../src/renderer/stores/session')
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
      if (fake.failWrites) {
        throw new DOMException('Simulated quota exceeded', 'QuotaExceededError')
      }
      fake.store.writes.push('settings')
      fake.store.settings.set('current', record)
    },
    writeSettlement: async (settlement: Settlement): Promise<SettlementWrite> => {
      fake.store.settlementCalls += 1
      if (fake.failWrites) {
        throw new DOMException('Simulated quota exceeded', 'QuotaExceededError')
      }
      const key = records.recordKey(settlement.modeId, settlement.styleId)
      // 与真的 writeSettlement 同一条次序：先判读不读得出来，再合并，最后才落盘
      const parsedRecord = records.decodeStyleRecord(fake.store.records.get(key))
      if (parsedRecord.kind === 'rejected') {
        return { kind: 'rejected', notice: session.restoreNotice(parsedRecord.reason, 'records') }
      }
      const parsedStats = records.decodeStats(fake.store.stats.get('current'))
      if (parsedStats.kind === 'rejected') {
        return { kind: 'rejected', notice: session.restoreNotice(parsedStats.reason, 'stats') }
      }
      fake.store.settlementWrites += 1
      fake.store.writes.push('settlement')
      fake.store.records.set(
        key,
        records.applySettlement(parsedRecord.kind === 'ok' ? parsedRecord.record : null, settlement)
      )
      const outcome = records.applyRunToStats(
        parsedStats.kind === 'ok' ? parsedStats.record : null,
        settlement
      )
      fake.store.stats.set('current', outcome.stats)
      // 「这一次新解锁了哪些」跟着一次真正的写盘一起回来（与真的 writeSettlement 同一条路）
      return { kind: 'written', unlocked: outcome.unlocked }
    },
    saveRun: async (
      record: unknown,
      delta: { kind: string; index?: number; game?: GameState }
    ): Promise<void> => {
      if (fake.failWrites) {
        throw new DOMException('Simulated quota exceeded', 'QuotaExceededError')
      }
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
      if (fake.failWrites) {
        throw new DOMException('Simulated quota exceeded', 'QuotaExceededError')
      }
      fake.store.writes.push('clear')
      fake.store.session.delete('current')
      fake.store.history.clear()
    },
  }
})

/** 让 store 里那些 fire-and-forget 的写盘把整条链跑完（写盘 → 读回 → 落 state） */
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
    records: [],
    stats: null,
    achievementNotice: null,
    storageNotice: null,
    restoring: true,
  })
}

/** 把一局摆进 store。风格与起始时刻按用例给：两局就要有两个起始时刻 */
function mount(
  game: GameState,
  options: {
    styleId?: StyleId
    startedAt?: number
    history?: readonly GameState[]
    dailyDate?: string | null
  } = {}
): void {
  useGameStore.setState({
    game,
    dailyDate: options.dailyDate ?? null,
    history: options.history ?? [],
    swapArmed: false,
    swapSelection: null,
    styleId: options.styleId ?? 'classic',
    // 与 game 一起落下：结算那一刻才算得出本局时长
    runStartedAt: options.startedAt ?? RUN_START,
  })
}

/** 一副铺好的 4×4 局面：最大的那块是 1024，其余每个数都认得出 */
const LAID_OUT: CellSpec[][] = [
  [1024, 2, 4, 8],
  [16, 32, 64, 128],
  [256, 8, 2, 4],
  [64, 2, 4, 8],
]

/** 一副大棋盘局面：最大的那块是 2048 */
const LAID_OUT_5: CellSpec[][] = [
  [2048, 2, 4, 8, 16],
  [32, 64, 128, 256, 512],
  [1024, 8, 2, 4, 8],
  [16, 2, 4, 8, 2],
  [4, 8, 2, 4, 8],
]

/** 一副局面里最大只有 16 的小盘：用来造「更差的一局」 */
const LOW: CellSpec[][] = [
  [2, 4, 8, 16],
  [4, 8, 16, 2],
  [8, 16, 2, 4],
  [16, 2, 4, 8],
]

/** 一局待收工的终局：默认经典模式、死局，分数与方块都给能认出来的值 */
function run(overrides: Partial<GameState> = {}, rows: CellSpec[][] = LAID_OUT): GameState {
  return {
    ...stateWithBoard(rows, 123456, overrides.modeId ?? 'classic'),
    score: 4242,
    moves: 9,
    reachedTarget: false,
    phase: 'stuck',
    endReason: null,
    ...overrides,
  }
}

/** 一副一按右就死的棋盘（tests/unit/session-persist.test.ts 与 tests/e2e/run-endings.spec.ts 同款） */
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

/** 读一条记录（键 `${模式}:${风格}`） */
function recordAt(modeId: string, styleId: string): {
  version: number
  bestScore: number
  highestTile: number
} {
  return fake.store.records.get(`${modeId}:${styleId}`) as {
    version: number
    bestScore: number
    highestTile: number
  }
}

beforeEach(() => {
  // 只假 Date：setTimeout 仍是真的，于是 await 微任务与「等一下再读」两件事都不被卡住
  vi.useFakeTimers({ toFake: ['Date'], now: RUN_START })
  fake.store.settings.clear()
  fake.store.session.clear()
  fake.store.history.clear()
  fake.store.records.clear()
  fake.store.stats.clear()
  fake.store.writes = []
  fake.store.settlementCalls = 0
  fake.store.settlementWrites = 0
  fake.failWrites = false
  pristineStore()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('结算只写当前风格的一条记录', () => {
  test('死局收工：记录落在结算那一刻的风格上，别的风格一条都没有', async () => {
    mount(run({ modeId: 'walls' }), { styleId: 'material', startedAt: RUN_START })
    vi.setSystemTime(SETTLE_AT)

    useGameStore.getState().settle()
    await settleWrites()

    // 恰好一条记录，键就是结算那一刻的模式 × 风格
    expect([...fake.store.records.keys()]).toEqual(['walls:material'])
    expect(recordAt('walls', 'material')).toEqual({
      version: 1,
      bestScore: 4242,
      highestTile: 1024,
    })
    // 同一局的另外两套风格一条都没有
    expect(fake.store.records.has('walls:classic')).toBe(false)
    expect(fake.store.records.has('walls:claude')).toBe(false)
    // 而这一局的存档随之作废（T16 的行为不变）
    expect(fake.store.session.size).toBe(0)
    expect(fake.store.writes).toEqual(['settlement', 'clear'])
  })

  test('走过真实的一步再结算：从一局真的死局里写出来', async () => {
    mount(oneStepFromDeadlock(), { styleId: 'classic' })

    useGameStore.getState().move('right')
    expect(useGameStore.getState().game?.phase).toBe('stuck')
    vi.setSystemTime(SETTLE_AT)

    useGameStore.getState().settle()
    await settleWrites()

    // 分数一步没涨（那一行没有合并），最高方块是盘面上那个 8
    expect(recordAt('classic', 'classic')).toEqual({
      version: 1,
      bestScore: 0,
      highestTile: 8,
    })
  })

  test('换风格本身不写记录，而这一局还是同一个对象', async () => {
    // 本票验收标准 1 的前半句 + T13 review 立下的规矩：**引用相等，不只是值相等**。
    // 深相等证不了「什么都没变」——把这一局重建一遍、每个值都还在，toEqual 照样过；
    // 而这里要断的是「风格切换没有触发任何写入」，所以两边都断
    mount(run({ modeId: 'walls' }), { styleId: 'classic' })
    const before = useGameStore.getState()

    fake.store.settlementCalls = 0
    fake.store.writes = []
    useGameStore.getState().setStyle('material')
    const after = useGameStore.getState()

    expect(after.game).toBe(before.game)
    expect(after.history).toBe(before.history)
    expect(after.runStartedAt).toBe(before.runStartedAt)
    expect(after.styleId).toBe('material')
    // 一次写盘都没有，更别说记录
    expect(fake.store.settlementCalls).toBe(0)
    expect(fake.store.records.size).toBe(0)
    expect(fake.store.writes).not.toContain('settlement')
    // 换风格照旧写 settings 与 session 两个桶（T16 的行为不变）
    expect(fake.store.writes).toEqual(['settings', 'session:none'])
  })

  test('连切五次风格再结算：只归最后那一个', async () => {
    mount(run({ modeId: 'walls' }), { styleId: 'classic' })
    for (const id of ['material', 'claude', 'classic', 'claude', 'material'] as StyleId[]) {
      useGameStore.getState().setStyle(id)
    }
    expect(useGameStore.getState().styleId).toBe('material')

    useGameStore.getState().settle()
    await settleWrites()

    expect([...fake.store.records.keys()]).toEqual(['walls:material'])
  })

  test('胜利面板上收工：赢下的一局按胜局数', async () => {
    mount(run({ reachedTarget: true, phase: 'won' }), { styleId: 'claude' })

    useGameStore.getState().settle()
    await settleWrites()

    expect([...fake.store.records.keys()]).toEqual(['classic:claude'])
    expect(fake.store.stats.get('current')).toMatchObject({ totalRuns: 1, wins: 1 })
  })

  test('Time Attack 到点强制结算：也写记录，时长就是那一段墙上时间', async () => {
    // 限时模式的 deadline 是绝对时间戳（ADR-0001）：早就过了点，于是在 tick 里强制结算
    mount(
      run({ modeId: 'time-attack', phase: 'playing', deadline: RUN_START + 180000 }),
      { styleId: 'claude' }
    )
    vi.setSystemTime(SETTLE_AT)

    useGameStore.getState().tick()
    await settleWrites()

    expect(useGameStore.getState().game?.endReason).toBe('timeout')
    expect([...fake.store.records.keys()]).toEqual(['time-attack:claude'])
    // 30 分钟 = 1800000，一个毫秒都不多：限时模式不叠加第二项
    expect(fake.store.stats.get('current')).toMatchObject({
      totalRuns: 1,
      timePlayedMs: 1800000,
    })
  })
})

describe('最高分与最高方块只升不降', () => {
  test('更好的一局抬高 best，更差的一局拉不动它', async () => {
    mount(run())
    vi.setSystemTime(SETTLE_AT)
    useGameStore.getState().settle()
    await settleWrites()
    expect(recordAt('classic', 'classic')).toMatchObject({ bestScore: 4242, highestTile: 1024 })

    // 第二局：同一个桶里分数与方块都低得多的一局。起始时刻推后半小时，
    // 所以它是另一局而不是同一次结算被递了第二次
    pristineStore()
    mount(run({ score: 12 }, LOW), { startedAt: SECOND_RUN_START })
    vi.setSystemTime(SECOND_SETTLE_AT)
    useGameStore.getState().settle()
    await settleWrites()

    // best 与最高方块都没被拉低
    expect(recordAt('classic', 'classic')).toEqual({
      version: 1,
      bestScore: 4242,
      highestTile: 1024,
    })
    // 但总局数照旧 +1：一局更差的成绩也是一局
    expect(fake.store.stats.get('current')).toMatchObject({ totalRuns: 2, timePlayedMs: 3600000 })
  })

  test('完全相同的一局再结算一次：两个数字都不动，统计多一局', async () => {
    mount(run())
    vi.setSystemTime(SETTLE_AT)
    useGameStore.getState().settle()
    await settleWrites()

    pristineStore()
    mount(run(), { startedAt: SECOND_RUN_START })
    vi.setSystemTime(SECOND_SETTLE_AT)
    useGameStore.getState().settle()
    await settleWrites()

    expect(recordAt('classic', 'classic')).toEqual({
      version: 1,
      bestScore: 4242,
      highestTile: 1024,
    })
    expect(fake.store.stats.get('current')).toMatchObject({ totalRuns: 2, timePlayedMs: 3600000 })
  })
})

describe('统计按公式累加', () => {
  test('总局数、胜局、累计时长各按各的来', async () => {
    mount(run(), { styleId: 'classic' })
    vi.setSystemTime(SETTLE_AT)
    useGameStore.getState().settle()
    await settleWrites()

    // 第二局：大棋盘上达标后收工，起始与结算都推后半小时
    pristineStore()
    mount(
      run({ modeId: 'big-board', reachedTarget: true, phase: 'won' }, LAID_OUT_5),
      { styleId: 'material', startedAt: SECOND_RUN_START }
    )
    vi.setSystemTime(SECOND_SETTLE_AT)
    useGameStore.getState().settle()
    await settleWrites()

    const stats = fake.store.stats.get('current') as {
      totalRuns: number
      wins: number
      timePlayedMs: number
      achievements: { unlocked: readonly string[] }
      lastRunStartedAt: unknown
    }
    expect(stats.totalRuns).toBe(2)
    // 第二局曾达标，第一局没有：胜局 1
    expect(stats.wins).toBe(1)
    // 1800000 + 1800000：两局各自的墙上时间相加
    expect(stats.timePlayedMs).toBe(3600000)
    // 第二局曾达标，于是首胜在这一局解锁（T18）；幂等键是最近那一局的起始时刻
    expect(stats.achievements.unlocked).toEqual(['first-win'])
    expect(stats.lastRunStartedAt).toBe(SECOND_RUN_START)
  })

  test('胜局按「曾达标」数，不按结束原因', async () => {
    // SPEC §3.3 的「including a run that reached the target and continued」：达标后
    // 继续玩到死局再收工，结束原因是 deadlock，但它确实赢过
    mount(run({ reachedTarget: true }))
    useGameStore.getState().settle()
    await settleWrites()
    expect(fake.store.stats.get('current')).toMatchObject({ totalRuns: 1, wins: 1 })
  })
})

describe('放弃与幂等', () => {
  test('新游戏放弃未结算的一局：一条记录都不写', async () => {
    mount(run({ modeId: 'walls' }), { styleId: 'material' })
    useGameStore.getState().move('left')
    fake.store.settlementCalls = 0
    fake.store.writes = []

    useGameStore.getState().newGame()
    await settleWrites()

    expect(fake.store.settlementCalls).toBe(0)
    expect(fake.store.records.size).toBe(0)
    expect(fake.store.stats.size).toBe(0)
    // 只写了新一局的 session：reset 一次，别的什么都没有
    expect(fake.store.writes).toEqual(['session:reset'])
  })

  test('结算只写一次：连点两次「结束并记录」，只写一次盘', async () => {
    mount(run())
    vi.setSystemTime(SETTLE_AT)

    useGameStore.getState().settle()
    await settleWrites()
    // 第二下：引擎对已结算的局原样返回同一个对象，于是 store 连动作都不再走
    useGameStore.getState().settle()
    useGameStore.getState().settle()
    await settleWrites()

    expect(fake.store.settlementCalls).toBe(1)
    expect(fake.store.settlementWrites).toBe(1)
    expect(fake.store.writes.filter((entry) => entry === 'settlement')).toHaveLength(1)
    // 幂等键那一层还在：同一次结算若被递进写盘两次，总数不许从 1 变成 2。
    // 这里直接把它递两次，模拟「store 那一层没拦住」的情形
    await writeSameSettlementTwice()
    expect(fake.store.stats.get('current')).toMatchObject({ totalRuns: 1, timePlayedMs: 1800000 })
    expect(recordAt('classic', 'classic')).toMatchObject({ bestScore: 4242, highestTile: 1024 })
  })

  test('已结算的数据在新游戏里活得下去', async () => {
    mount(run({ modeId: 'walls' }), { styleId: 'material' })
    useGameStore.getState().settle()
    await settleWrites()
    const settled = fake.store.records.get('walls:material')
    const stats = fake.store.stats.get('current')

    fake.store.writes = []
    fake.store.settlementCalls = 0
    useGameStore.getState().newGame()
    await settleWrites()

    expect(fake.store.records.get('walls:material')).toEqual(settled)
    expect(fake.store.stats.get('current')).toEqual(stats)
    expect(fake.store.settlementCalls).toBe(0)
    expect(fake.store.writes).toEqual(['session:reset'])
  })
})

describe('读回来与拒绝', () => {
  test('一次「刷新」之后，两个桶原样落到 store 上', async () => {
    mount(run({ modeId: 'walls' }), { styleId: 'material' })
    vi.setSystemTime(SETTLE_AT)
    useGameStore.getState().settle()
    await settleWrites()

    // 全新一次加载：store 回到还没开局的样子，再 hydrate
    pristineStore()
    useGameStore.getState().hydrate()
    await settleWrites()

    const state = useGameStore.getState()
    expect(state.restoring).toBe(false)
    // 界面上那份就是盘上那份：模式、风格、两个数字逐项对上
    expect(state.records).toEqual([
      { modeId: 'walls', styleId: 'material', bestScore: 4242, highestTile: 1024 },
    ])
    expect(state.stats).toMatchObject({ totalRuns: 1, wins: 0, timePlayedMs: 1800000 })
    expect(state.storageNotice).toBeNull()
  })

  test('结算之后刷新：开局界面在，而记录还在', async () => {
    mount(run({ modeId: 'walls' }), { styleId: 'material' })
    useGameStore.getState().settle()
    await settleWrites()

    pristineStore()
    useGameStore.getState().hydrate()
    await settleWrites()

    // 已结算的一局安静作废（T16），于是这一局没有棋盘可恢复
    expect(useGameStore.getState().game).toBeNull()
    expect(fake.store.session.size).toBe(0)
    // 而成绩一个字节都没少
    expect(recordAt('walls', 'material')).toMatchObject({ bestScore: 4242 })
  })

  test('旧版记录：不写、不重置，界面上说出来', async () => {
    // 桶里躺着一份版本 99 的记录（形状本身是好的），而这一局正要写进同一个键
    fake.store.records.set('classic:classic', { version: 99, bestScore: 7777, highestTile: 512 })
    mount(run())

    useGameStore.getState().settle()
    await settleWrites()

    // 一次都没写：旧数据原样留着，既没有被新成绩覆盖，也没有被重置成 0
    expect(recordAt('classic', 'classic')).toEqual({
      version: 99,
      bestScore: 7777,
      highestTile: 512,
    })
    expect(fake.store.settlementWrites).toBe(0)
    // 提示说的是实话：读不出来、已保留、本次不会写入
    const notice = useGameStore.getState().storageNotice
    expect(notice?.kind).toBe('restore-rejected')
    expect(notice?.message).toContain('记录读不出来')
    expect(notice?.message).toContain('已保留原有数据')
  })

  test('统计桶形状坏了：这一局也不写记录', async () => {
    // 一个负数总局数：不是「旧版」而是「坏」，同样不许被静默重置
    fake.store.stats.set('current', {
      version: 1,
      totalRuns: -1,
      wins: 0,
      timePlayedMs: 0,
      achievements: emptyAchievementProgress(),
      lastRunStartedAt: null,
    })
    mount(run())

    useGameStore.getState().settle()
    await settleWrites()

    expect(fake.store.settlementWrites).toBe(0)
    expect(fake.store.records.size).toBe(0)
    expect(useGameStore.getState().storageNotice?.message).toContain('统计读不出来')
  })

  test('写不进去时说的是战绩那一句', async () => {
    mount(run())
    fake.failWrites = true

    useGameStore.getState().settle()
    await settleWrites()

    const notice = useGameStore.getState().storageNotice
    expect(notice?.kind).toBe('write-failed')
    expect(notice?.message).toContain('战绩没有写入本地记录')
    // 这一局已经打完了，所以那一句不许再说「撤销仍然可用」——那是 session 写入失败的话
    expect(notice?.message).not.toContain('撤销仍然可用')
  })
})

describe('撤销辅助的一局与干净的一局无法区分', () => {
  test('撤销过几百步的胜局 vs 干净的同分胜局：记录与统计逐字节同形', async () => {
    // 一局达标后收工、撤销过几百步的：60 步有效移动、400 条撤销历史
    const history: GameState[] = Array.from({ length: 400 }, (_unused, index) =>
      run({ reachedTarget: true, phase: 'won', moves: index })
    )
    mount(run({ reachedTarget: true, phase: 'won', moves: 60 }), { history })
    vi.setSystemTime(SETTLE_AT)
    useGameStore.getState().settle()
    await settleWrites()

    const assistedRecord = JSON.stringify(fake.store.records.get('classic:classic'))
    const assistedStats = JSON.stringify(fake.store.stats.get('current'))

    // 另一台「浏览器」：同一局、同样的盘面与分数，只是没有撤销历史
    fake.store.records.clear()
    fake.store.stats.clear()
    pristineStore()
    mount(run({ reachedTarget: true, phase: 'won', moves: 60 }), { history: [] })
    useGameStore.getState().settle()
    await settleWrites()

    expect(JSON.stringify(fake.store.records.get('classic:classic'))).toBe(assistedRecord)
    expect(JSON.stringify(fake.store.stats.get('current'))).toBe(assistedStats)
    // 钉住键的集合：日后谁加一个「本局撤销过几次」的字段，这句会当场红
    expect(Object.keys(fake.store.records.get('classic:classic') as object)).toEqual([
      'version',
      'bestScore',
      'highestTile',
    ])
    // 统计那一侧同样只有本票声明的几个键
    expect(Object.keys(fake.store.stats.get('current') as object).sort()).toEqual(
      ['achievements', 'lastRunStartedAt', 'timePlayedMs', 'totalRuns', 'version', 'wins'].sort()
    )
  })
})

describe('成就解锁：提示只响一次，进度跨刷新保持', () => {
  /** 盘上那份统计的成就进度 */
  function progressOnDisk(): { unlocked: readonly string[]; modesWon: readonly string[] } {
    return (fake.store.stats.get('current') as {
      achievements: { unlocked: readonly string[]; modesWon: readonly string[] }
    }).achievements
  }

  test('赢下第一局：提示带着「首胜」出现，盘上也真的解锁了', async () => {
    mount(run({ reachedTarget: true, phase: 'won' }), { styleId: 'material' })
    vi.setSystemTime(SETTLE_AT)

    useGameStore.getState().settle()
    await settleWrites()

    expect(useGameStore.getState().achievementNotice).toEqual(['first-win'])
    expect(progressOnDisk().unlocked).toEqual(['first-win'])
  })

  test('一局什么都没解锁：提示保持 null', async () => {
    // 死局收工、没赢过：counters 照记，但没有成就变多
    mount(run(), { styleId: 'material' })
    vi.setSystemTime(SETTLE_AT)

    useGameStore.getState().settle()
    await settleWrites()

    expect(useGameStore.getState().achievementNotice).toBeNull()
    expect(progressOnDisk().unlocked).toEqual([])
  })

  test('连点两次「结束并记录」：第二次不响（结算只执行一次）', async () => {
    mount(run({ reachedTarget: true, phase: 'won' }), { styleId: 'material' })
    vi.setSystemTime(SETTLE_AT)

    useGameStore.getState().settle()
    await settleWrites()
    // 第二下：引擎对已结算的局原样返回同一个对象，store 连动作都不再走
    useGameStore.getState().settle()
    useGameStore.getState().settle()
    await settleWrites()

    expect(fake.store.settlementCalls).toBe(1)
    expect(useGameStore.getState().achievementNotice).toEqual(['first-win'])
    expect(progressOnDisk().unlocked).toEqual(['first-win'])
  })

  test('刷新之后不再播报，而盘上的解锁一个都没少', async () => {
    mount(run({ reachedTarget: true, phase: 'won' }), { styleId: 'material' })
    vi.setSystemTime(SETTLE_AT)
    useGameStore.getState().settle()
    await settleWrites()

    // 一次「刷新」：store 回到还没开局的样子，再 hydrate
    pristineStore()
    useGameStore.getState().hydrate()
    await settleWrites()

    // 提示不重播——它只在写盘那一次由「落库前后的差」产生，hydrate 只读盘上那份列表
    expect(useGameStore.getState().achievementNotice).toBeNull()
    // 而解锁本身在盘上，刷新之后照旧看得见
    expect(useGameStore.getState().stats?.achievements.unlocked).toEqual(['first-win'])
  })

  test('跨局进度在刷新后保持：模式收藏家的进度不丢', async () => {
    // 第一局：经典赢一次
    mount(run({ reachedTarget: true, phase: 'won' }), { styleId: 'material', startedAt: RUN_START })
    vi.setSystemTime(SETTLE_AT)
    useGameStore.getState().settle()
    await settleWrites()

    // 第二局：斐波那契再赢一次（另一次加载，起始时刻也换一个）
    pristineStore()
    mount(
      run({ modeId: 'fibonacci', reachedTarget: true, phase: 'won' }, LAID_OUT),
      { styleId: 'claude', startedAt: SECOND_RUN_START }
    )
    vi.setSystemTime(SECOND_SETTLE_AT)
    useGameStore.getState().settle()
    await settleWrites()
    expect(progressOnDisk().modesWon).toEqual(['classic', 'fibonacci'])
    // 第二局是这一局才解锁的（首胜在第一局就解过了），提示只带新的那一个
    expect(useGameStore.getState().achievementNotice).toBeNull()

    // 刷新：两个模式的进度都还在，一个都没被重置
    pristineStore()
    useGameStore.getState().hydrate()
    await settleWrites()
    expect(useGameStore.getState().stats?.achievements.modesWon).toEqual(['classic', 'fibonacci'])
    expect(useGameStore.getState().stats?.achievements.unlocked).toEqual(['first-win'])
  })

  test('Daily 的日期跟着结算走：一天一次，同一天不推进', async () => {
    mount(run({ modeId: 'daily' }), { styleId: 'classic', dailyDate: '2026-09-01' })
    vi.setSystemTime(SETTLE_AT)
    useGameStore.getState().settle()
    await settleWrites()
    expect(progressOnDisk()).toMatchObject({
      dailyStreakDate: '2026-09-01',
      dailyStreakLength: 1,
    })

    // 同一天再结一局：链条停在原地
    pristineStore()
    mount(run({ modeId: 'daily' }), {
      styleId: 'classic',
      startedAt: SECOND_RUN_START,
      dailyDate: '2026-09-01',
    })
    vi.setSystemTime(SECOND_SETTLE_AT)
    useGameStore.getState().settle()
    await settleWrites()
    expect(progressOnDisk()).toMatchObject({
      dailyStreakDate: '2026-09-01',
      dailyStreakLength: 1,
    })
  })

  test('收起提示不动盘上的解锁', async () => {
    mount(run({ reachedTarget: true, phase: 'won' }), { styleId: 'material' })
    vi.setSystemTime(SETTLE_AT)
    useGameStore.getState().settle()
    await settleWrites()

    useGameStore.getState().dismissAchievementNotice()
    expect(useGameStore.getState().achievementNotice).toBeNull()
    // 盘上那一份原样：收起只是一句提示，不是把成就收回去
    expect(progressOnDisk().unlocked).toEqual(['first-win'])
    expect(useGameStore.getState().stats?.achievements.unlocked).toEqual(['first-win'])
  })

  test('旧版 / 坏形状的成就进度：这一局什么都不写', async () => {
    // 桶里躺着一份形状坏了的成就进度（版本号是对的）——整桶按形状拒，于是这一局的
    // 战绩与进度都不写，桌面上那一句说明白「已保留原有数据」
    fake.store.stats.set('current', {
      version: 1,
      totalRuns: 0,
      wins: 0,
      timePlayedMs: 0,
      achievements: { unlocked: ['perfect-run'] },
      lastRunStartedAt: null,
    })
    mount(run({ reachedTarget: true, phase: 'won' }), { styleId: 'material' })

    useGameStore.getState().settle()
    await settleWrites()

    expect(fake.store.settlementWrites).toBe(0)
    expect(fake.store.records.size).toBe(0)
    expect(useGameStore.getState().achievementNotice).toBeNull()
    expect(useGameStore.getState().storageNotice?.message).toContain('统计读不出来')
  })
})

/**
 * 把同一份结算递给写盘那一层两次，模拟「写入方自己没守住」的情形。
 *
 * 这条走的是**被 mock 的那一个 writeSettlement**（它内部调用真的 merge），
 * 于是断言的是「writer 递两次也只写一次」这件事本身，而不是 store 的动作路径。
 */
async function writeSameSettlementTwice(): Promise<void> {
  const records = await import('../../src/renderer/stores/records')
  const store = await import('../../src/renderer/stores/sessionStore')
  const settlement = records.settlementOf(run(), 'classic', RUN_START, SETTLE_AT, [], null)
  await store.writeSettlement(settlement)
  await store.writeSettlement(settlement)
}
