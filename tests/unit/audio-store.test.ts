import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { GameState } from '../../src/shared/types'
import { createGame, move } from '../../src/game/engine'
import { emptyAchievementProgress } from '../../src/game/achievements'
import { useGameStore } from '../../src/renderer/stores/useGameStore'
import { encodeSettings, type SessionRecord } from '../../src/renderer/stores/session'
import { boardOf, stateWithBoard } from './support'

/**
 * T20 的接线半边：store 什么时候发声、mute 怎么活过刷新
 *
 * 两个假件，各替掉一件真的：
 *   · `../../src/renderer/audio/synth` 被换成一个只记调用的桩。**tone.ts 不被换**——
 *     「这一步到底是 move 还是 merge、合并数值是几」是真实的推导，桩掉的只是真正的
 *     振荡器（那些由 tests/unit/synth.test.ts 用假 AudioContext 钉着）；
 *   · `../../src/renderer/stores/sessionStore` 被换成一个内存假后端（与
 *     tests/unit/session-persist.test.ts 同一路子），于是 settings 桶的读写是真的，
 *     「刷新之后还是静音的」因此是一条能断言的接线，不是一句口头承诺。
 *
 * 本文件不碰 window：局面一律用 `useGameStore.setState` 直接摆进去（与 session-persist
 * 的 `mount` 同一路子），`startRun` 要走 `window.location.search`，这里一个都不调。
 */

/** 发声记录：桩把每一次 play 的实参抄在这里 */
const played = vi.hoisted(() => ({
  calls: [] as { event: string; muted: boolean; value: number }[],
}))

vi.mock('../../src/renderer/audio/synth', () => ({
  synth: {
    play: (event: string, options: { muted: boolean; value: number }): void => {
      played.calls.push({ event, muted: options.muted, value: options.value })
    },
  },
}))

/** 内存假后端。桶与真的 IndexedDB 一一对应 */
const backend = vi.hoisted(() => {
  const buckets = {
    settings: new Map<string, unknown>(),
    session: new Map<string, unknown>(),
    history: new Map<number, unknown>(),
    records: new Map<string, unknown>(),
    stats: new Map<string, unknown>(),
  }
  return { buckets, writes: [] as string[] }
})

vi.mock('../../src/renderer/stores/sessionStore', () => ({
  readSettingsRaw: async (): Promise<unknown> =>
    backend.buckets.settings.get('current') ?? null,
  readSessionRaw: async (): Promise<unknown> => backend.buckets.session.get('current') ?? null,
  readHistoryRaw: async (count: number): Promise<unknown[]> => {
    const out: unknown[] = []
    for (let index = 0; index < count; index += 1) out.push(backend.buckets.history.get(index))
    return out
  },
  readRecordsEntries: async (): Promise<readonly { key: string; value: unknown }[]> =>
    [...backend.buckets.records].map(([key, value]) => ({ key, value })),
  readStatsRaw: async (): Promise<unknown> => backend.buckets.stats.get('current') ?? null,
  writeSettings: async (record: unknown): Promise<void> => {
    backend.writes.push('settings')
    backend.buckets.settings.set('current', record)
  },
  saveRun: async (record: unknown, delta: { kind: string; index?: number; game?: GameState }) => {
    backend.writes.push(`session:${delta.kind}`)
    backend.buckets.session.set('current', record)
    if (delta.kind === 'push' && delta.index !== undefined) {
      backend.buckets.history.set(delta.index, delta.game)
    }
    if (delta.kind === 'pop' && delta.index !== undefined) {
      backend.buckets.history.delete(delta.index)
    }
    if (delta.kind === 'reset') backend.buckets.history.clear()
  },
  clearRun: async (): Promise<void> => {
    backend.writes.push('clear')
    backend.buckets.session.delete('current')
    backend.buckets.history.clear()
  },
  writeSettlement: async (settlement: {
    modeId: string
    styleId: string
    score: number
    highestTile: number
    startedAt: number | null
  }): Promise<{ kind: 'written'; unlocked: [] }> => {
    backend.writes.push('settlement')
    const key = `${settlement.modeId}:${settlement.styleId}`
    const previous = (backend.buckets.records.get(key) ?? {
      bestScore: 0,
      highestTile: 0,
    }) as { bestScore: number; highestTile: number }
    backend.buckets.records.set(key, {
      version: 1,
      bestScore: Math.max(previous.bestScore, settlement.score),
      highestTile: Math.max(previous.highestTile, settlement.highestTile),
    })
    // stats 桶**故意不写**：本票不关心战绩统计，而 loadSettled 读一个空桶只会得到
    // 「还没有统计过」，那正是此时该有的诚实结论
    return { kind: 'written', unlocked: [] }
  },
}))

/** 一次读存档是几步异步，等它落地 */
async function settleHydration(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
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
    records: [],
    stats: null,
    storageNotice: null,
    restoring: true,
    // T20 的两个字段：默认不静音
    mute: false,
  })
}

/** 把一局摆进 store（不碰 window） */
function mount(game: GameState): void {
  useGameStore.setState({
    game,
    dailyDate: null,
    history: [],
    swapArmed: false,
    swapSelection: null,
    runStartedAt: null,
  })
}

/**
 * 刚刚**真的会响**的那些调用（按顺序）
 *
 * 为什么不是「一次都没调」：静音这道判断住在 synth 里（brief 要求「碰 AudioContext
 * 之前先判静音」），所以 store 照样会把事件递过去，只是每一次都带着 `muted: true`。
 * 桩看得见这些调用，而它们一个都不会变成声音——于是这里数的是**不带 muted 的**那
 * 些，与「玩家会听见什么」是同一件事。
 */
function audible(): { event: string; muted: boolean; value: number }[] {
  return played.calls.filter((call) => !call.muted)
}

/** 会响的事件名序列 */
function events(): string[] {
  return audible().map((call) => call.event)
}

/** 每一次被递过去的调用都带了 muted（store 没有把静音这件事藏着不说） */
function everyCallMuted(): boolean {
  return played.calls.length > 0 && played.calls.every((call) => call.muted)
}

/** 一次合并：左移把两个 2 合成一个 4 */
const MERGE_ROWS = [
  [2, 2, null, null],
  [null, null, null, null],
  [null, null, null, null],
  [null, null, null, null],
]

/** 一次纯滑动：两个方块都已贴左，还得再挪一格才贴边 */
const SLIDE_ROWS = [
  [null, 2, null, null],
  [null, 4, null, null],
  [null, null, null, null],
  [null, null, null, null],
]

/** 一步即死局（与 tests/e2e/undo.spec.ts 的 ONE_STEP_FROM_DEADLOCK 同一副盘） */
const ONE_STEP_FROM_DEADLOCK = [
  [8, 2, 4, null],
  [8, 2, 4, 8],
  [2, 4, 8, 2],
  [4, 8, 2, 4],
]

beforeEach(() => {
  played.calls = []
  backend.buckets.settings.clear()
  backend.buckets.session.clear()
  backend.buckets.history.clear()
  backend.buckets.records.clear()
  backend.buckets.stats.clear()
  backend.writes = []
  pristineStore()
})

// ─── 四个事件什么时候响 ─────────────────────────────────────────────────────

describe('一次有效移动响什么', () => {
  test('纯滑动响 move：一声不携带数值信息的确认音', () => {
    mount(stateWithBoard(SLIDE_ROWS))
    useGameStore.getState().move('left')
    expect(events()).toEqual(['move'])
  })

  test('一次合并响 merge，音高带的是合出来的那个数值', () => {
    mount(stateWithBoard(MERGE_ROWS))
    useGameStore.getState().move('left')
    expect(events()).toEqual(['merge'])
    expect(played.calls[0]).toEqual({ event: 'merge', muted: false, value: 4 })
  })

  test('合出 1024 与刚才合出 4 是不同的两个音高', () => {
    mount(
      stateWithBoard([
        [512, 512, null, null],
        [null, null, null, null],
        [null, null, null, null],
        [null, null, null, null],
      ])
    )
    useGameStore.getState().move('left')
    expect(played.calls[0].value).toBe(1024)
  })

  test('无效移动一个音都没有', () => {
    // 两个方块都贴左边：左移是无效移动（引擎原样返回同一个对象）
    const game = stateWithBoard([
      [2, null, null, null],
      [4, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
    ])
    mount(game)
    useGameStore.getState().move('left')
    expect(events()).toEqual([])
    // 而且 state 都没换：声音这一侧没有偷偷碰任何东西
    expect(useGameStore.getState().game).toBe(game)
  })

  test('合出目标块只响 win，不叠加 merge', () => {
    mount(
      stateWithBoard([
        [1024, 1024, null, null],
        [null, null, null, null],
        [null, null, null, null],
        [null, null, null, null],
      ])
    )
    useGameStore.getState().move('left')
    // 这一步既是合并也是胜利。两个音一起响只会糊成一声，而胜利是这一步里
    // 最值得说的一件事
    expect(events()).toEqual(['win'])
    expect(useGameStore.getState().game?.phase).toBe('won')
  })
})

describe('结算响什么', () => {
  test('死局后收工响 loss', () => {
    const opening = stateWithBoard(ONE_STEP_FROM_DEADLOCK)
    mount(opening)
    useGameStore.getState().move('right')
    // 先确认这一局真的走进了死局（与 e2e 同一副盘）
    expect(useGameStore.getState().game?.phase).toBe('stuck')
    played.calls = []

    useGameStore.getState().settle()
    expect(events()).toEqual(['loss'])
    expect(useGameStore.getState().game?.endReason).toBe('deadlock')
  })

  test('从胜利面板收工不再响：胜利那一刻已经响过', () => {
    mount(
      stateWithBoard([
        [1024, 1024, null, null],
        [null, null, null, null],
        [null, null, null, null],
        [null, null, null, null],
      ])
    )
    useGameStore.getState().move('left')
    expect(events()).toEqual(['win'])
    played.calls = []

    useGameStore.getState().settle()
    expect(events()).toEqual([])
  })

  test('超时强制结算响 loss', () => {
    // 开局时刻推到两百万毫秒之前，于是 deadline 早就过了
    const game = createGame('time-attack', 20260926, Date.now() - 200000)
    mount(game)
    useGameStore.getState().tick()
    expect(useGameStore.getState().game?.endReason).toBe('timeout')
    expect(events()).toEqual(['loss'])
  })
})

describe('ticket 没有点名的事件不响', () => {
  test('撤销不响：每撤一步都响一声，最爱的功能就没法用了', () => {
    mount(stateWithBoard(MERGE_ROWS))
    useGameStore.getState().move('left')
    expect(useGameStore.getState().history).toHaveLength(1)
    played.calls = []

    useGameStore.getState().undo()
    expect(events()).toEqual([])
    expect(useGameStore.getState().game).toEqual(stateWithBoard(MERGE_ROWS))
  })

  test('放弃本局不响：那是玩家主动点的「新游戏」', () => {
    mount(stateWithBoard(MERGE_ROWS))
    played.calls = []
    useGameStore.getState().newGame()
    expect(events()).toEqual([])
    expect(useGameStore.getState().game?.moves).toBe(0)
  })

  test('作弊交换不响：它不改任何规则量，也不值得一个专属音', () => {
    mount(
      stateWithBoard([
        [2, 4, null, null],
        [null, null, null, null],
        [null, null, null, null],
        [null, null, null, null],
      ])
    )
    useGameStore.setState({ swapArmed: true })
    played.calls = []

    useGameStore.getState().selectCell([0, 0])
    useGameStore.getState().selectCell([0, 1])
    expect(events()).toEqual([])
    // 交换真的发生了，所以这条用例证的不是「没接线」而是「响了也不该有」
    expect(useGameStore.getState().game?.board[0][0]).toEqual({ id: 2, value: 4 })
  })
})

// ─── 静音 ───────────────────────────────────────────────────────────────────

describe('静音是设置，跟着玩家跨刷新', () => {
  test('静音时一步有效移动一次都不播', () => {
    useGameStore.setState({ mute: true })
    mount(stateWithBoard(MERGE_ROWS))
    useGameStore.getState().move('left')
    // 一声都不会响：synth 见到 muted 就在碰 AudioContext 之前返回
    expect(audible()).toEqual([])
    expect(everyCallMuted()).toBe(true)
  })

  test('setMute 写 settings 桶，写的是玩家真正选的那个值', () => {
    useGameStore.getState().setMute(true)
    const record = backend.buckets.settings.get('current') as { mute: boolean }
    expect(record.mute).toBe(true)
    expect(backend.writes).toEqual(['settings'])

    useGameStore.getState().setMute(false)
    expect((backend.buckets.settings.get('current') as { mute: boolean }).mute).toBe(false)
  })

  test('同一个值重复设置连盘都不重写', () => {
    useGameStore.getState().setMute(true)
    useGameStore.getState().setMute(true)
    expect(backend.writes).toEqual(['settings'])
    expect(useGameStore.getState().mute).toBe(true)
  })

  test('刷新之后还是静音的：hydrate 从 settings 桶读回来', async () => {
    backend.buckets.settings.set('current', encodeSettings('fibonacci', 'claude', true))
    await useGameStore.getState().hydrate()
    await settleHydration()

    expect(useGameStore.getState().mute).toBe(true)
    // 设置桶的另两个字段照旧被恢复：静音没有挤掉它们的位置
    expect(useGameStore.getState().selectedModeId).toBe('fibonacci')
    expect(useGameStore.getState().styleId).toBe('claude')
    // 静音着的一局也打得动，而且一声都不响
    mount(stateWithBoard(MERGE_ROWS))
    useGameStore.getState().move('left')
    expect(audible()).toEqual([])
    expect(everyCallMuted()).toBe(true)
  })

  test('设置读不出来时回到默认（不静音），并说出来', async () => {
    // 一份形状不对的 settings：modeId 不在注册表里
    backend.buckets.settings.set('current', {
      version: 1,
      modeId: 'aero',
      styleId: 'classic',
      mute: true,
    })
    await useGameStore.getState().hydrate()
    await settleHydration()

    // 读不出来的那一份**不会被半信半疑地应用**：默认值比猜出来的值诚实
    expect(useGameStore.getState().mute).toBe(false)
    expect(useGameStore.getState().storageNotice?.kind).toBe('restore-rejected')
  })

  test('换模式 / 换风格不把静音写丢', () => {
    useGameStore.getState().setMute(true)
    useGameStore.getState().selectMode('walls')
    expect((backend.buckets.settings.get('current') as { mute: boolean }).mute).toBe(true)
    useGameStore.getState().setStyle('material')
    const record = backend.buckets.settings.get('current') as {
      modeId: string
      styleId: string
      mute: boolean
    }
    expect(record).toEqual({ version: 1, modeId: 'walls', styleId: 'material', mute: true })
  })
})

// ─── 声音不改变规则 ─────────────────────────────────────────────────────────

describe('音效不改变规则', () => {
  test('响着走一步之后，盘面与引擎的产物逐字段相同', () => {
    const opening = stateWithBoard(MERGE_ROWS)
    mount(opening)
    // 期望值直接从内核算：不走 store，于是 store 这一侧的任何手脚都会露出来
    const expected = move(opening, 'left').state

    useGameStore.getState().move('left')
    expect(events()).toEqual(['merge'])
    const actual = useGameStore.getState().game as GameState
    expect(actual).toEqual(expected)
    // 深相等之外再钉一次「是新的那个对象」：不可变过渡本来就该给新引用
    expect(actual).not.toBe(opening)
    // 随机推进与计分都只由内核说了算
    expect(actual.rngState).toBe(expected.rngState)
    expect(actual.score).toBe(expected.score)
    expect(actual.moves).toBe(expected.moves)
  })

  test('静音与不静音走同一步，落下来的是同一个状态', () => {
    const opening = stateWithBoard(MERGE_ROWS)
    mount(opening)
    useGameStore.getState().move('left')
    const loud = useGameStore.getState().game as GameState

    mount(stateWithBoard(MERGE_ROWS))
    useGameStore.setState({ mute: true })
    useGameStore.getState().move('left')
    const silent = useGameStore.getState().game as GameState

    expect(silent).toEqual(loud)
  })
})

// ─── 一条没人要的记录：mute 不进 session 桶 ─────────────────────────────────

describe('mute 只活在 settings 桶', () => {
  test('一次有效移动写下的 session 记录里没有 mute', () => {
    mount(stateWithBoard(MERGE_ROWS))
    useGameStore.getState().move('left')
    const record = backend.buckets.session.get('current') as SessionRecord
    // 静音不是这一局的规则数据：把它塞进 session 等于让 T16 持久化一次外观选择
    expect(Object.keys(record)).not.toContain('mute')
  })
})
