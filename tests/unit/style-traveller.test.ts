import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { GameState, StyleId } from '../../src/shared/types'
import { NOW, stateWithBoard } from './support'
import { useGameStore } from '../../src/renderer/stores/useGameStore'
import type { SessionRecord } from '../../src/renderer/stores/session'

/**
 * T19 的风格旅行者：切换计数的**前半段**——它怎么被数、怎么活着跨过刷新。
 *
 * 判定本身（阈值钉在 5、判据是 `>=`）在 tests/unit/achievements.test.ts 里按纯函数钉住；
 * 本文件钉的是那一层之外的四件事，也都是 T18 摔过的坑的邻居：
 *   · 计数只数**活的这一局里真实的换皮**——重复选当前风格不算，开局前与结算后都不算；
 *   · 它是**发生过的事件**，撤销一步不许把它带回那一步的数（T18 的「本局曾经撤销过」
 *     至今不可恢复，而切换次数是廉价可数的事实，没理由再摔一次）；
 *   · 它跟着这一局活在 session 桶里，于是「刷新之后从零数起」这件事不会发生；
 *   · 放弃了的一局不留半点痕迹。
 *
 * **结算之后没有「成就进度」可查了**（ADR-0007）：解锁是从对局状态派生的，所以本文件
 * 断言的是 store 上的 `unlocked` 与 `toasts`，而不是某个桶里的一份记录。切够五次那一刻
 * 就该解锁——不是等到收工。
 *
 * 假后端用内存 Map 替掉真的 IndexedDB（`vi.mock`），而**合并与拒绝调用真的纯函数**
 * （records.ts）。真的 IndexedDB 那半边由 tests/e2e/style-traveller.spec.ts 覆盖。
 */

/** 第一局的起始时刻：给一个与 NOW 不同的值，让结算载荷里的数都认得出是哪一个 */
const RUN_START = Date.UTC(2026, 8, 26, 11, 30)
/** 结算时刻 */
const SETTLE_AT = Date.UTC(2026, 8, 26, 12)

/** 假后端。vi.hoisted 保证工厂在 import 之前就建好 */
const fake = vi.hoisted(() => ({
  store: {
    settings: new Map<string, unknown>(),
    session: new Map<string, unknown>(),
    history: new Map<number, unknown>(),
    records: new Map<string, unknown>(),
    stats: new Map<string, unknown>(),
    /** writeSettlement 真的写了几次 */
    settlements: 0,
  },
}))

vi.mock('../../src/renderer/stores/sessionStore', async () => {
  // 真的纯函数：结算怎么并进记录与统计因此是本票的代码在被测，而不是假后端的复刻
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
      fake.store.settings.set('current', record)
    },
    writeSettlement: async (settlement: Parameters<typeof records.applyRunToStats>[1]) => {
      // 与真的 writeSettlement 同一条次序：先判读不读得出来，再合并，最后才落盘
      const key = records.recordKey(settlement.modeId, settlement.styleId)
      const parsedRecord = records.decodeStyleRecord(fake.store.records.get(key))
      if (parsedRecord.kind === 'rejected') {
        return { kind: 'rejected', notice: session.restoreNotice(parsedRecord.reason, 'records') }
      }
      const parsedStats = records.decodeStats(fake.store.stats.get('current'))
      if (parsedStats.kind === 'rejected') {
        return { kind: 'rejected', notice: session.restoreNotice(parsedStats.reason, 'stats') }
      }
      fake.store.settlements += 1
      fake.store.records.set(
        key,
        records.applySettlement(parsedRecord.kind === 'ok' ? parsedRecord.record : null, settlement)
      )
      fake.store.stats.set(
        'current',
        records.applyRunToStats(parsedStats.kind === 'ok' ? parsedStats.record : null, settlement)
      )
      return { kind: 'written' }
    },
    saveRun: async (
      record: unknown,
      delta: { kind: string; index?: number; game?: GameState }
    ) => {
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
      fake.store.session.delete('current')
      fake.store.history.clear()
    },
  }
})

/** 让 store 里那些 fire-and-forget 的写盘把整条链跑完（写盘 → 读回 → 落 state） */
async function settleWrites(): Promise<void> {
  for (let index = 0; index < 16; index += 1) await Promise.resolve()
}

/** 一副铺好的局面。默认 `playing`——要走得动一步，撤销才撤得动一个位置 */
function stuckRun(overrides: Partial<GameState> = {}): GameState {
  return {
    ...stateWithBoard(
      [
        [1024, 2, 4, 8],
        [16, 32, 64, 128],
        [256, 8, 2, 4],
        // 末行第一格留空：左移才真的走得通。全挤在左边的棋盘一次左移是无效移动，
        // 而无效移动不进历史，撤销会变成空操作——那样撤销相关的用例就什么也没证
        [null, 2, 4, 8],
      ],
      123456
    ),
    score: 4242,
    moves: 9,
    reachedTarget: false,
    // 默认 playing：`move` 在 stuck / won / ended 上原样返回同一个对象（引擎的早退），
    // 于是那几个 phase 上一次移动也走不通、撤销更是空操作。要结算的用例显式传
    // phase: 'stuck'（与其余测试同一条路子）
    phase: 'playing',
    endReason: null,
    ...overrides,
  }
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
    unlocked: [],
    toasts: [],
    nextToastKey: 0,
    records: [],
    stats: null,
    storageNotice: null,
    restoring: true,
  })
}

/** 把一局摆进 store（game 传 null = 还在开局界面）。风格与切换次数按用例给 */
function mount(
  game: GameState | null,
  options: { styleId?: StyleId; styleSwitches?: number } = {}
): void {
  useGameStore.setState({
    game,
    dailyDate: null,
    history: [],
    swapArmed: false,
    swapSelection: null,
    styleId: options.styleId ?? 'classic',
    runStartedAt: RUN_START,
    styleSwitches: options.styleSwitches ?? 0,
  })
}

/** 盘上那条 session 记录（读出来给断言用） */
function sessionOnDisk(): SessionRecord | null {
  return (fake.store.session.get('current') as SessionRecord | undefined) ?? null
}

/** 依次切到这些风格。每一格都必须与切换时的当前风格不同——写重复的那一格不叫切换 */
function switchStyles(sequence: readonly StyleId[]): void {
  for (const id of sequence) useGameStore.getState().setStyle(id)
}

/** 三套基准风格轮一遍：经典 → Material → Claude → 经典 */
const ROUND: readonly StyleId[] = ['material', 'claude', 'classic']

beforeEach(() => {
  fake.store.settings.clear()
  fake.store.session.clear()
  fake.store.history.clear()
  fake.store.records.clear()
  fake.store.stats.clear()
  fake.store.settlements = 0
  pristineStore()
})

describe('切换计数：只数活的这一局里真实的换皮', () => {
  test('局中真的换一次加一次，轮一遍就是三', () => {
    mount(stuckRun())
    switchStyles(ROUND)
    const state = useGameStore.getState()
    expect(state.styleSwitches).toBe(3)
    // 轮回出发点：计数管的是「换过几次」，不管最后停在哪儿
    expect(state.styleId).toBe('classic')
  })

  test('重复选当前风格一次都不加，连 state 都不换', () => {
    // 同一 id 重复调用在 T13 就已经是「连 state 都不换」——
    // 这里补的是：它也不许被算成一次切换，否则「停在原地不动」会变成刷成就最便宜的路
    mount(stuckRun())
    switchStyles(ROUND)
    const before = useGameStore.getState()
    const recordBefore = JSON.stringify(sessionOnDisk())

    // 轮完一圈停在 classic，所以这里重复点的就是当前那一个
    expect(before.styleId).toBe('classic')
    useGameStore.getState().setStyle(before.styleId)

    const after = useGameStore.getState()
    expect(after.styleSwitches).toBe(3)
    // 引用相等：什么都没发生，React 那边一次重渲染都不该有
    expect(after).toBe(before)
    // 盘上那份也没被重写一遍（同一个 id 不写盘，是 setStyle 的既有行为）
    expect(JSON.stringify(sessionOnDisk())).toBe(recordBefore)
  })

  test('开局界面换来换去不算「单局内」：还没开局就没有局', () => {
    // 阈值的原文是「单局内」。开局前在选择器上挑花眼与「这一局里换过几次观感」
    // 不是同一件事——否则玩家在开局界面抖七下就能白拿一个成就
    mount(null)
    switchStyles([...ROUND, ...ROUND, 'material'])
    expect(useGameStore.getState().styleSwitches).toBe(0)
    // 一局都没开，也就没有 session 可写（setStyle 的既有行为）
    expect(sessionOnDisk()).toBeNull()
    // 也就没有成就可言
    expect(useGameStore.getState().unlocked).toEqual([])
  })

  test('已结算的一局不再计数：这一局已经结束了', () => {
    // 结算只执行一次，所以结算之后多换几次皮碰不到任何战绩——
    // 但计数不许跟着长，否则下一个读它的地方会拿到一个说不清属于哪一局的数
    mount(stuckRun({ phase: 'ended', endReason: 'deadlock' }), { styleSwitches: 5 })
    useGameStore.getState().setStyle('material')
    expect(useGameStore.getState().styleSwitches).toBe(5)
  })

  test('撤销一步：计数原地不动', () => {
    // 本票的核心。把计数当成「位置的属性」是实现里最顺手的那个误读——撤销搬回整个
    // 前态，顺手就把计数一起带回那一步的数，于是「切过五次」能被撤销抹掉。
    // T18 在「本局曾经撤销过」上摔的就是这个坑（那件事至今不可恢复），而切换次数
    // 是廉价可数的事实：它是一次**事件**，发生过就是发生过
    const opening = stuckRun()
    mount(opening)
    useGameStore.getState().move('left')
    expect(useGameStore.getState().history).toHaveLength(1)
    switchStyles([...ROUND, 'material'])
    expect(useGameStore.getState().styleSwitches).toBe(4)

    useGameStore.getState().undo()

    const undone = useGameStore.getState()
    // 撤销真的退了一步（历史空了），而计数停在 4
    expect(undone.history).toHaveLength(0)
    expect(undone.styleSwitches).toBe(4)
    // 盘上那份也写的是 4：撤销那一步的 session 记录当场从 store 取，所以刷新之后
    // 读回来的还是 4（下面「跨过刷新」那一组把这个性质钉到 hydrate 上）
    expect(sessionOnDisk()?.styleSwitches).toBe(4)
    // 撤销本身照旧生效：game 回到移动前那一个对象
    expect(undone.game).toBe(opening)
  })

  test('一次有效移动也不碰它：棋盘在走，计数不跟着走', () => {
    mount(stuckRun())
    switchStyles(['material', 'claude'])
    useGameStore.getState().move('left')
    // 那一步真的走进了历史：不是一次无效移动（无效移动连 state 都不换）
    expect(useGameStore.getState().history).toHaveLength(1)
    expect(useGameStore.getState().styleSwitches).toBe(2)
    expect(sessionOnDisk()?.styleSwitches).toBe(2)
  })
})

describe('解锁就发生在切够的那一刻', () => {
  test('切四次还不够、切五次当场解锁，并浮出一条祝贺', () => {
    // ADR-0007：成就的判定跟着对局状态走，不等结算。所以断言的对象是 store 上的
    // `unlocked` 与 `toasts`——不是某个桶里的一份记录（那东西已经不落盘了）
    mount(stuckRun())
    switchStyles([...ROUND, 'material'])
    expect(useGameStore.getState().styleSwitches).toBe(4)
    expect(useGameStore.getState().unlocked).toEqual([])
    expect(useGameStore.getState().toasts).toEqual([])

    switchStyles(['claude'])
    const unlocked = useGameStore.getState()
    expect(unlocked.styleSwitches).toBe(5)
    expect(unlocked.unlocked).toEqual(['style-traveller'])
    expect(unlocked.toasts).toEqual([{ key: 1, ids: ['style-traveller'] }])
  })

  test('再多切几次不会多响一条：集合没变就没有新的跃迁', () => {
    mount(stuckRun())
    switchStyles([...ROUND, 'material', 'claude'])
    expect(useGameStore.getState().toasts).toHaveLength(1)

    switchStyles(['classic'])
    const after = useGameStore.getState()
    expect(after.styleSwitches).toBe(6)
    expect(after.toasts).toHaveLength(1)
    expect(after.unlocked).toEqual(['style-traveller'])
  })

  test('收掉那一句祝贺不改变解锁集合：集合是从对局派生的', () => {
    mount(stuckRun())
    switchStyles([...ROUND, 'material', 'claude'])
    const key = useGameStore.getState().toasts[0].key
    useGameStore.getState().dismissToast(key)
    expect(useGameStore.getState().toasts).toEqual([])
    expect(useGameStore.getState().unlocked).toEqual(['style-traveller'])
  })
})

describe('这一局的切换计数跨过刷新活着', () => {
  test('走一步、撤一步、再刷新：切过的次数与解锁都还在，但**不重放祝贺**', async () => {
    // 验收标准 2 的主场景，也是这个字段非得住进 session 桶不可的理由：结算那一刻
    // session 存档连同撤销历史一起作废，「这一局切过几次」只有跟着这一局活才读得出来。
    // 中间那一次撤销是刻意的：它是「把计数当成位置的属性」这个误读唯一能钻的缝
    mount(stuckRun(), { styleSwitches: 3, styleId: 'material' })
    switchStyles(['claude', 'classic'])
    expect(useGameStore.getState().styleSwitches).toBe(5)
    expect(useGameStore.getState().unlocked).toEqual(['style-traveller'])
    useGameStore.getState().move('left')
    expect(useGameStore.getState().history).toHaveLength(1)
    useGameStore.getState().undo()
    expect(useGameStore.getState().history).toHaveLength(0)
    // 撤销搬回的是棋盘位置：换过五次皮这件事没有跟着回退
    expect(useGameStore.getState().styleSwitches).toBe(5)
    // 盘上那条记录也带着 5：这是刷新之后唯一读得到它的地方
    expect(sessionOnDisk()?.styleSwitches).toBe(5)

    // 刷新：先把自己清成「还没开局」，再让 hydrate 从假后端把这一局读回来
    pristineStore()
    useGameStore.getState().hydrate()
    await settleWrites()

    const restored = useGameStore.getState()
    expect(restored.game).not.toBeNull()
    // 计数与局一起回来：一次都不差（assembleSession → styleSwitches）
    expect(restored.styleSwitches).toBe(5)
    // 观感也跟着这一局回来：session 桶存的是「这一局的观感」，而最后切到的是经典
    expect(restored.styleId).toBe('classic')
    // 单局成就规格的架构决策 12：恢复**建立静默基线**——集合照算（用户故事 11：刷新不丢解锁），
    // 但一条祝贺都不补放（用户故事 10：刷新不是一场吹号）
    expect(restored.unlocked).toEqual(['style-traveller'])
    expect(restored.toasts).toEqual([])
  })

  test('刷新已经结过算的一局：那一局连同计数一起消失，也就没有解锁可言', async () => {
    // 结算即作废 session（T16），所以刷新之后计数回到 0；而这一局已经不在了，
    // 成就集合从「没有任何一局」派生出来就是空的（ADR-0007：成就不跨局）
    mount(stuckRun({ phase: 'stuck' }))
    // 真的切够五次，让解锁发生（mount 直接摆状态，不走状态机）
    switchStyles([...ROUND, 'material', 'claude'])
    expect(useGameStore.getState().unlocked).toEqual(['style-traveller'])
    vi.setSystemTime(SETTLE_AT)
    useGameStore.getState().settle()
    await settleWrites()
    // 结算之后集合照旧在：它是从这一局派生的，而结算没有动任何事实
    expect(useGameStore.getState().unlocked).toEqual(['style-traveller'])

    pristineStore()
    useGameStore.getState().hydrate()
    await settleWrites()

    expect(useGameStore.getState().styleSwitches).toBe(0)
    expect(useGameStore.getState().unlocked).toEqual([])
    expect(useGameStore.getState().toasts).toEqual([])
    // 而结算把战绩照旧写了下来（成绩与成就是两件事）
    expect(fake.store.settlements).toBe(1)
  })

  test('没解锁的一局结算完：集合仍然是空的', async () => {
    mount(stuckRun({ phase: 'stuck' }), { styleSwitches: 4 })
    vi.setSystemTime(SETTLE_AT)
    useGameStore.getState().settle()
    await settleWrites()
    expect(useGameStore.getState().unlocked).toEqual([])
    expect(useGameStore.getState().toasts).toEqual([])
  })
})

describe('放弃了的一局与结算之后：都不留半点进度', () => {
  test('切过五次之后放弃并开新局：计数归零、集合清空，两个战绩桶一个字节都没写', async () => {
    mount(stuckRun())
    switchStyles([...ROUND, 'material', 'claude'])
    expect(useGameStore.getState().styleSwitches).toBe(5)
    expect(useGameStore.getState().unlocked).toEqual(['style-traveller'])

    useGameStore.getState().newGame()
    await settleWrites()

    // 计数归零、集合清空：被放弃的那一局切过几次、解锁过什么，跟着它一起消失
    const fresh = useGameStore.getState()
    expect(fresh.styleSwitches).toBe(0)
    expect(fresh.unlocked).toEqual([])
    expect(fresh.toasts).toEqual([])
    expect(fresh.runMerges).toBe(0)
    // 而「放弃不写任何记录」（mode-contract §3）：两个战绩桶连一次都没碰过
    expect(fake.store.settlements).toBe(0)
    expect(fake.store.stats.size).toBe(0)
    expect(fake.store.records.size).toBe(0)
    // 新一局的存档里计数也是 0：若上一个 run 把它带过来，下一局开局就凭空多出几次
    expect(sessionOnDisk()?.styleSwitches).toBe(0)
  })

  test('再开一局之前换风格，新一局从零开始数', () => {
    // 「开局前换的不算」与「新局从零数」是同一条规则的两端：计数跟着一局走，
    // 不跟着玩家走
    mount(stuckRun())
    switchStyles([...ROUND, 'material'])
    useGameStore.getState().newGame()
    // 新游戏不换风格（T13：选好的观感应跟着玩家），所以这一轮从 Claude 起，
    // 三格分别是 claude → classic → material，一次都没撞上「当前风格」
    expect(useGameStore.getState().styleId).toBe('material')
    switchStyles(['claude', 'classic', 'material'])
    expect(useGameStore.getState().styleSwitches).toBe(3)
  })

  test('结算之后：战绩里没有任何「切换过几次」的字段，也没有成就', async () => {
    mount(stuckRun({ phase: 'stuck' }), { styleSwitches: 6 })
    vi.setSystemTime(SETTLE_AT)
    useGameStore.getState().settle()
    await settleWrites()

    // 这一局的存档连同计数一起作废（T16）：能读到它的时刻只有结算之前
    expect(sessionOnDisk()).toBeNull()
    const stats = fake.store.stats.get('current') as Record<string, unknown>
    expect(Object.keys(stats).sort()).toEqual(
      ['lastRunStartedAt', 'timePlayedMs', 'totalRuns', 'version', 'wins'].sort()
    )
    expect(Object.keys(stats)).not.toContain('achievements')
    expect(Object.keys(stats)).not.toContain('styleSwitches')
  })
})

describe('换风格不碰这一局：引用相等，不是值相等', () => {
  test('连着切五次：game / history / 棋盘都是原来那几个对象', () => {
    // T13 立下的规矩：**深相等不能证明「什么都没变」**——把这一局重建一遍、每个值都
    // 还在，toEqual 照样过（tests/unit/style-switch.test.ts 里那一整张字段表断的就是值）。
    // 所以这里断引用：zustand 的比较与 T21 的位移动画都认引用，重建出来的不是同一个对象
    const run = stuckRun()
    mount(run)
    const before = useGameStore.getState()
    const snapshot = JSON.stringify(before.game)

    switchStyles([...ROUND, 'material', 'claude'])

    const after = useGameStore.getState()
    expect(after.game).toBe(before.game)
    expect(after.history).toBe(before.history)
    expect(after.game?.board).toBe(before.game?.board)
    expect(JSON.stringify(after.game)).toBe(snapshot)
    // 分数、步数、随机进度一个都没动：换皮若碰过 rngState，下一步的落点就会变
    expect(after.game?.score).toBe(before.game?.score)
    expect(after.game?.moves).toBe(before.game?.moves)
    expect(after.game?.rngState).toBe(before.game?.rngState)
    // 该变的变了：观感与计数
    expect(after.styleId).not.toBe(before.styleId)
    expect(after.styleSwitches).toBe(5)
  })

  test('切够次数之后结算：记录归结算那一个风格，且没有风格轴以外的字段', () => {
    // 一局只归一个风格（mode-contract §3「成绩归结算那一刻所处的风格」），
    // 而风格旅行者数的是「换过几次」——两件事各记各的，谁也不替谁说话
    mount(stuckRun({ phase: 'stuck' }), { styleSwitches: 5, styleId: 'claude' })
    vi.setSystemTime(SETTLE_AT)
    useGameStore.getState().settle()

    expect(fake.store.records.has('classic:claude')).toBe(true)
    const record = fake.store.records.get('classic:claude') as Record<string, unknown>
    expect(record.bestScore).toBe(4242)
    expect(record.highestTile).toBe(1024)
    // 记录里只有这三个键：没有 styleSwitches，也没有任何「切过几次」的痕迹
    expect(Object.keys(record).sort()).toEqual(['bestScore', 'highestTile', 'version'])
  })
})