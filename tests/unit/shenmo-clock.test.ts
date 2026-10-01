import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { GameState } from '../../src/shared/types'
import { createGame, tick } from '../../src/game/engine'
import { useGameStore } from '../../src/renderer/stores/useGameStore'
import { stateWithBoard, NOW } from './support'

/**
 * 时之狭：堕落窗口开着的时候时钟被按住，收摊时那一段时间归玩家
 * （T33 · 父Spec 的架构决策 16，控制人 2026-10-01 裁定）
 *
 * 三个假件沿 T20 的 `audio-store.test.ts` 那条既有缝：synth 换成只记账的桩（于是
 * 「这一下有没有响」可断言），sessionStore 换成内存假后端（于是结算真的会写一次，
 * 而写了几次也数得出来）。本文件不碰 window：局面一律 `useGameStore.setState` 摆进去。
 *
 * **引擎一行都不改**：`tick(state, now)` 的三个早退照旧，deadline 照旧是绝对时间戳。
 * 「按住」不是改写 deadline、也不是给引擎传一个假时刻（那会让 engine 知道时钟被暂停），
 * 而是**喂给时钟的 now 减去累计按住的毫秒**（`shenmoHeldMs`）——display 与 deadline
 * 比较因此吃同一把尺子。父Spec 的「与既有 SPEC 的对齐」段已据实改写：gives the held
 * time back，并记明「只冻显示」被考虑过并否决（那条路会让屏幕比截止点多走一段，
 * 玩家点下 A 的当场就可能超时——本项目最反对的「屏幕替证据撒谎」）。
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

/** 内存假后端。只实现 tick 这一条路会碰到的几个 */
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
  saveRun: async (record: unknown): Promise<void> => {
    backend.writes.push(`session:${record === null ? 'reset' : 'write'}`)
    backend.buckets.session.set('current', record)
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
  }): Promise<{ kind: 'written' }> => {
    backend.writes.push('settlement')
    const key = `${settlement.modeId}:${settlement.styleId}`
    backend.buckets.records.set(key, { version: 1, bestScore: settlement.score })
    return { kind: 'written' }
  },
}))

/** 一次读存档是几步异步，等它落地（结算之后 loadSettled 会跑一遍） */
async function settleWrites(): Promise<void> {
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
    shenmoOutcomes: [],
    runMerges: 0,
    unlocked: [],
    toasts: [],
    nextToastKey: 0,
    records: [],
    stats: null,
    settlementAttribution: null,
    storageNotice: null,
    restoring: true,
    mute: false,
    // 时之狭的两个字段：每个用例从「没按住过」起。不清的话上一个用例按住的起始时刻会
    // 漏到下一个用例里——那个漏法不会红，只会让「一格格掉」莫名少算
    shenmoHeldMs: 0,
    shenmoHoldStartedAt: null,
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
    runMerges: 0,
    unlocked: [],
    toasts: [],
    nextToastKey: 0,
    // 摆一副新局等于「这一局刚开局」：没有任何一秒被按住过
    shenmoHeldMs: 0,
    shenmoHoldStartedAt: null,
  })
}

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

/**
 * 一副**早就过了截止点**的限时局：开局时刻推到两百万毫秒之前。
 *
 * 于是「问一次 tick」必然结算——这正是本票要的东西：把「该不该问」与「问了下场如何」
 * 分成两件事看。非限时的对照局同一副盘、classic 模式（deadline 恒为 null）。
 */
function expiredRun(): GameState {
  return createGame('time-attack', 20260926, Date.now() - 200_000)
}

/** 一副还活着的限时局：`?board=` 夹具之外的寻常开局（deadline 在未来） */
function liveRun(): GameState {
  return createGame('time-attack', 20260926, Date.now())
}

/** 一副寻常的经典局：不限时，tick 对它本来就什么都不会做 */
function classicRun(): GameState {
  return stateWithBoard([
    [2, 4, null, null],
    [null, null, null, null],
    [null, null, null, null],
    [null, null, null, null],
  ])
}

describe('堕落窗口开着：时钟被按住，引擎问都不问', () => {
  test('早就过了截止点也不结算：引擎一次都没被问', () => {
    const game = expiredRun()
    mount(game)
    // 先确认这一副盘真的「一问就死」：否则下面那条什么都没发生可能只是因为没到期
    expect(game.deadline).not.toBeNull()
    expect((game.deadline as number) < Date.now()).toBe(true)

    useGameStore.getState().tick(true)

    const after = useGameStore.getState().game as GameState
    // 同一个对象：连新 state 都没造（引用相等即「什么都没发生」）
    expect(after).toBe(game)
    expect(after.phase).toBe('playing')
    expect(after.endReason).toBeNull()
    // deadline 一个字节都没动——「按住」按住的是时钟，不是截止点（SPEC §3.1）
    expect(after.deadline).toBe(game.deadline)
    // 而这一段的起始时刻记下了：它是收摊时「还回来多少」的唯一凭据
    expect(useGameStore.getState().shenmoHoldStartedAt).not.toBeNull()
    // 一声都没有，一次写盘都没有：到点那一路（loss 音 + 结算）整个没发生
    expect(played.calls).toEqual([])
    expect(backend.writes).toEqual([])
  })

  test('活着的限时局被按住：棋盘原样，只是记下起始时刻', () => {
    const game = liveRun()
    mount(game)
    useGameStore.getState().tick(true)
    expect(useGameStore.getState().game).toBe(game)
    expect(useGameStore.getState().game?.phase).toBe('playing')
    // 已经在按住：再按一次读表连 state 都不换（引用相等即「什么都没发生」）
    const held = useGameStore.getState()
    useGameStore.getState().tick(true)
    expect(useGameStore.getState()).toBe(held)
    expect(useGameStore.getState().shenmoHeldMs).toBe(0)
  })

  test('没开局（开局界面）也什么都不做', () => {
    mount(classicRun())
    useGameStore.setState({ game: null })
    expect(() => useGameStore.getState().tick(true)).not.toThrow()
    expect(useGameStore.getState().game).toBeNull()
  })

  test('非限时模式：按住与不按住都是同一副棋盘', () => {
    // 时之狭「只在那儿」：classic 没有 deadline，引擎的第二条早退本来就把它原样送回
    const game = classicRun()
    mount(game)
    useGameStore.getState().tick(true)
    expect(useGameStore.getState().game).toBe(game)
    useGameStore.getState().tick()
    expect(useGameStore.getState().game).toBe(game)
  })
})

describe('窗口一有结果：立刻恢复，剩余时间一格不少', () => {
  test('同一句 tick 照旧到点结算：loss 音与结算写入都回来了', () => {
    const game = expiredRun()
    mount(game)
    useGameStore.getState().tick(true)
    expect(useGameStore.getState().game).toBe(game)

    // 窗口收了摊 → 不按住。到点强制结算照旧（与 T09 / T20 判的是同一条）
    useGameStore.getState().tick(false)
    const after = useGameStore.getState().game as GameState
    expect(after.phase).toBe('ended')
    expect(after.endReason).toBe('timeout')
    expect(played.calls.map((call) => call.event)).toEqual(['loss'])
    expect(backend.writes).toContain('settlement')
    // 结算那一刻的归属照旧落下来（T26）
    expect(useGameStore.getState().settlementAttribution).not.toBeNull()
  })

  test('按住的那些 tick 一次都没攒下：恢复那一刻结出的就是引擎用被按住的时钟判的判决', () => {
    // 「一格不少」在 node 里能钉到的最硬一句：按住几遍再收摊，落下来的状态与**拿同一个
    // 前态、用同一个 effective now 直接问引擎**逐字段相同。换句话说，按住既没有把截止点
    // 往后推、也没有让这一局少死一次或多死一次——它只是把那段时间从时钟上摘下来。
    // （数得出来的那一格一格在浏览器里：读数冻住、恢复那一刻接着走，e2e 用假时钟钉。）
    const held = expiredRun()
    mount(held)
    useGameStore.getState().tick(true)
    useGameStore.getState().tick(true)
    useGameStore.getState().tick(true)
    expect(useGameStore.getState().game).toBe(held)

    // 窗口收了摊 → 不按住
    useGameStore.getState().tick(false)
    const afterHold = useGameStore.getState().game as GameState
    expect(afterHold.phase).toBe('ended')
    expect(afterHold.endReason).toBe('timeout')
    // 与「同一个前态 + 同一把被按住的尺子」同一个判决：引擎照旧是唯一的裁决者
    const heldMs = useGameStore.getState().shenmoHeldMs
    expect(afterHold).toEqual(tick(held, Date.now() - heldMs))
    // 截止点一个字节都没动
    expect(afterHold.deadline).toBe(held.deadline)

    // 幂等：再问一次还是同一个对象（结算只执行一次，不靠第二套机制）
    useGameStore.getState().tick()
    expect(useGameStore.getState().game).toBe(afterHold)
    // 而记录只写了一次
    expect(backend.writes.filter((write) => write === 'settlement')).toHaveLength(1)
  })

  test('不传参数就是老契约：tick() 与 T20 那年一个样', () => {
    // audio-store.test.ts 的「超时强制结算响 loss」调的就是无参的这一句。它不许改，
    // 所以这里再钉一次：缺省不按住（held 恒 0，于是 effective now 就是 Date.now()）
    const game = expiredRun()
    mount(game)
    useGameStore.getState().tick()
    expect(useGameStore.getState().game?.endReason).toBe('timeout')
    expect(played.calls.map((call) => call.event)).toEqual(['loss'])
    // 一次都没按住过：老契约那条路上这两个字段一动不动
    expect(useGameStore.getState().shenmoHeldMs).toBe(0)
    expect(useGameStore.getState().shenmoHoldStartedAt).toBeNull()
  })

  test('按住期间连一次写盘的边都没蹭到：收摊才结算', async () => {
    const game = expiredRun()
    mount(game)
    for (let index = 0; index < 10; index += 1) useGameStore.getState().tick(true)
    await settleWrites()
    expect(backend.writes).toEqual([])
    expect(useGameStore.getState().storageNotice).toBeNull()

    useGameStore.getState().tick(false)
    await settleWrites()
    expect(backend.writes).toEqual(['settlement', 'clear'])
  })
})

/**
 * 假时钟（**只假 Date**：setTimeout 照旧是真的，`settleWrites` 靠它排一次微任务）。
 *
 * 这是「那 30 秒真归玩家」的正面证据，也是「只冻显示」被否决的原因：
 *   · 墙上时钟可以越过截止点整整一段——只要堕落窗口开着，这一局就活着、面板就不出现；
 *   · 收摊那一刻把按住的那段还回来，effective now 落在窗口打开的那一刻，于是读数接回
 *     表停着时候的那个数，一格不多、一格不少；
 *   · deadline 自始至终一个字节都没动，引擎对「时钟被按住」一无所知。
 */
describe('时钟被按住：那 30 秒真归玩家', () => {
  /** `stateWithBoard(..., 'time-attack')` 的截止点 = NOW + 三分钟（modes.ts 声明） */
  const DEADLINE = NOW + 180_000

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    // 距到点还有整整十秒：够看出「越过截止点」与「差十秒」的差别
    vi.setSystemTime(NOW + 170_000)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /** 一副活着的限时局：deadline = NOW + 180_000（与 run 场景同源的固定时刻） */
  function timedRun(): GameState {
    return stateWithBoard(
      [
        [2, 4, null, null],
        [null, null, null, null],
        [null, null, null, null],
        [null, null, null, null],
      ],
      7,
      'time-attack'
    )
  }

  test('窗口开着时墙上时钟越过截止点也不结算，收摊把按住的那段还回来', () => {
    const game = timedRun()
    mount(game)
    expect(game.deadline).toBe(DEADLINE)

    useGameStore.getState().tick(true)
    // 墙上时钟越过截止点整整 50 秒（T09 的用例钉过：这个 now 一问就死）
    vi.setSystemTime(NOW + 230_000)
    useGameStore.getState().tick(true)
    // 而这一局还活着：引擎问都不问，面板一个字节都没落
    const held = useGameStore.getState().game as GameState
    expect(held).toBe(game)
    expect(held.phase).toBe('playing')
    expect(played.calls).toEqual([])
    expect(backend.writes).toEqual([])

    // 收摊：60 秒整还回来 → effective now 落回 NOW + 170_000，还剩整整十秒
    useGameStore.getState().tick(false)
    const after = useGameStore.getState().game as GameState
    expect(after).toBe(game)
    expect(after.phase).toBe('playing')
    expect(useGameStore.getState().shenmoHeldMs).toBe(60_000)
    expect(useGameStore.getState().shenmoHoldStartedAt).toBeNull()
    // deadline 自始至终一个字节都没动
    expect(after.deadline).toBe(DEADLINE)

    // 再走 11 秒（effective now = NOW + 181_000，越过截止点一毫秒）才结算成 timeout
    vi.setSystemTime(NOW + 241_000)
    useGameStore.getState().tick(false)
    expect(useGameStore.getState().game?.phase).toBe('ended')
    expect(useGameStore.getState().game?.endReason).toBe('timeout')
    expect(played.calls.map((call) => call.event)).toEqual(['loss'])
  })

  test('两段窗口分别按住：累计是相加的，不是各算各的', () => {
    const game = timedRun()
    mount(game)

    // 第一段：按住 20 秒。收摊后 effective now 还停在 NOW + 170_000（还剩十秒）
    useGameStore.getState().tick(true)
    vi.setSystemTime(NOW + 190_000)
    useGameStore.getState().tick(false)
    expect(useGameStore.getState().game).toBe(game)
    expect(useGameStore.getState().shenmoHeldMs).toBe(20_000)

    // 第二段：再按住 30 秒。累计 50 秒，effective now 仍是 NOW + 170_000
    useGameStore.getState().tick(true)
    vi.setSystemTime(NOW + 220_000)
    useGameStore.getState().tick(false)
    expect(useGameStore.getState().game).toBe(game)
    expect(useGameStore.getState().shenmoHeldMs).toBe(50_000)
    expect(useGameStore.getState().game?.phase).toBe('playing')

    // 一路走到墙上 NOW + 240_000：effective now = NOW + 190_000，越过截止点十秒 → 结算
    vi.setSystemTime(NOW + 240_000)
    useGameStore.getState().tick(false)
    expect(useGameStore.getState().game?.endReason).toBe('timeout')
  })

  test('按住了多久与读表节奏无关：收摊那一次算清整段', () => {
    // 为什么记「起始时刻」而不是每次读表累加，这一条就是判据：窗口开着之后一次读表都
    // 没有（浏览器给后台标签页降频、假时钟把 interval 整个冻住，都是这个形状），收摊时
    // 整段 230 秒一并还回来。按读表累加的写法会在这里漏掉最后那一截，这一局当场死掉
    const game = timedRun()
    mount(game)
    useGameStore.getState().tick(true)
    vi.setSystemTime(NOW + 400_000)
    useGameStore.getState().tick(false)
    expect(useGameStore.getState().game).toBe(game)
    expect(useGameStore.getState().game?.phase).toBe('playing')
    expect(useGameStore.getState().shenmoHeldMs).toBe(230_000)
  })

  test('新一局归零：被按住的那一段不跟到下一局', () => {
    const game = timedRun()
    mount(game)
    useGameStore.getState().tick(true)
    vi.setSystemTime(NOW + 200_000)
    useGameStore.getState().tick(false)
    expect(useGameStore.getState().shenmoHeldMs).toBe(30_000)

    useGameStore.getState().newGame()
    const fresh = useGameStore.getState()
    expect(fresh.shenmoHeldMs).toBe(0)
    expect(fresh.shenmoHoldStartedAt).toBeNull()
    // 而新局的截止点照旧从那一个 now 起算（T09：新游戏不继承上一局的任何东西）
    expect(fresh.game?.deadline).toBe(NOW + 200_000 + 180_000)
  })
})

describe('守卫不碰引擎', () => {
  test('引擎的 tick 自己一句都没改：三条早退照旧', () => {
    // 「engine 对时钟是否暂停一无所知」的正面证据：直接驱动内核算一遍，与 T09 那年断的
    // 是同三条（未到期原样返回 / 到点含端点 / 幂等）。store 的守卫是**外面**的一层
    const live = liveRun()
    const deadline = live.deadline as number
    expect(tick(live, deadline - 1)).toBe(live)
    expect(tick(live, deadline).endReason).toBe('timeout')
    const once = tick(live, deadline)
    expect(tick(once, deadline + 60_000)).toBe(once)

    // 结算冻结的就是那一刻的棋盘与分数：到点不改历史事实
    const opening = expiredRun()
    const expired = tick(opening, Date.now())
    expect(expired.board).toEqual(opening.board)
    expect(expired.score).toBe(0)
  })
})
