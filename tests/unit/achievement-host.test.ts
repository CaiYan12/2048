import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { CellSpec } from './support'
import type { Direction, GameState, StyleId } from '../../src/shared/types'
import { createGame, move } from '../../src/game/engine'
import { countMergesAlongPath } from '../../src/game/achievements'
import { NOW, stateWithBoard } from './support'
import { useGameStore } from '../../src/renderer/stores/useGameStore'
import { encodeSession, type SessionRecord } from '../../src/renderer/stores/session'

/**
 * 成就宿主的状态机（单局成就规格的架构决策 6）。
 *
 * 宿主的全部职责：认出**锁定 → 解锁**的那一次跃迁、把一次跃迁里的几个成就合成一条祝贺、
 * 按上限截掉最旧的、并在撤销让条件不再成立时把集合收回来。它住在 store 里，所以这一整台
 * 状态机**不需要渲染就能验证**——本文件就是这件事（渲染那一层由 Playwright 按三套风格
 * 各跑一遍契约）。
 *
 * 断言的对象只有玩家或别的模块看得见的东西：`unlocked`、`toasts`、`runMerges`，以及
 * 假后端里的字节。不碰任何私有字段名，也不断言内部调用次序。
 *
 * 假后端替掉真的 IndexedDB（`vi.mock`），合并与判定调用真的纯函数——与
 * tests/unit/style-traveller.test.ts 同一个路子。真 IndexedDB 那半边由 Playwright 覆盖。
 */

/** 假后端。vi.hoisted 保证工厂在 import 之前就建好 */
const fake = vi.hoisted(() => ({
  store: {
    settings: new Map<string, unknown>(),
    session: new Map<string, unknown>(),
    history: new Map<number, unknown>(),
    records: new Map<string, unknown>(),
    stats: new Map<string, unknown>(),
  },
}))

vi.mock('../../src/renderer/stores/sessionStore', async () => {
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
      fake.store.settings.set('current', record)
    },
    writeSettlement: async (settlement: Parameters<typeof records.applyRunToStats>[1]) => {
      const existing = records.decodeStats(fake.store.stats.get('current'))
      fake.store.stats.set(
        'current',
        records.applyRunToStats(existing.kind === 'ok' ? existing.record : null, settlement)
      )
      return { kind: 'written' }
    },
    saveRun: async (
      record: unknown,
      delta: { kind: string; index?: number; game?: GameState }
    ): Promise<void> => {
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

/** 让 store 里那些 fire-and-forget 的写盘把整条链跑完 */
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
    unlocked: [],
    toasts: [],
    nextToastKey: 0,
    records: [],
    stats: null,
    storageNotice: null,
    restoring: true,
  })
}

/**
 * 把一局摆进 store。`runMerges` 显式给——它平时由宿主增量维护，而用例要的
 * 是「已经合并了 199 次」这种中间态，直接摆出来比真走 199 步便宜得多
 */
function mount(
  game: GameState,
  options: { runMerges?: number; styleSwitches?: number } = {}
): void {
  useGameStore.setState({
    game,
    dailyDate: null,
    history: [],
    swapArmed: false,
    swapSelection: null,
    runStartedAt: Date.UTC(2026, 8, 26, 11, 30),
    runMerges: options.runMerges ?? 0,
    styleSwitches: options.styleSwitches ?? 0,
  })
}

/**
 * 一副一左移就合出目标块的棋盘：第 0 行是待合的一对，其余行铺满互不相邻相等的值。
 *
 * `pairs` 决定合出什么（1024+1024 → 2048 = 经典的目标块；2048+2048 → 4096 = 大棋盘的
 * 目标块），`modeId` 跟着那一档走。
 */
function boardWithPair(
  pairs: number,
  cols: 4 | 5 = 4,
  modeId: 'classic' | 'big-board' = 'classic'
): GameState {
  const filler: CellSpec[] = Array.from({ length: cols }, (_unused, index) => 2 ** (index + 1))
  const row0: CellSpec[] = [pairs, pairs, ...Array.from({ length: cols - 2 }, () => null)]
  const row1 = cols === 5 ? [...filler].reverse() : filler
  const rows: CellSpec[][] = [row0, filler.slice(), row1, filler.slice(), row1.slice()]
  return {
    ...stateWithBoard(rows.slice(0, cols), 123456, modeId),
    score: 0,
    moves: 0,
    reachedTarget: false,
    phase: 'playing',
    endReason: null,
  }
}

beforeEach(() => {
  fake.store.settings.clear()
  fake.store.session.clear()
  fake.store.history.clear()
  fake.store.records.clear()
  fake.store.stats.clear()
  pristineStore()
})

describe('跃迁：锁定 → 解锁发一条，一直解锁着不再发', () => {
  test('一步合出目标块：首胜当场解锁，并浮出一条祝贺', () => {
    mount(boardWithPair(1024))
    expect(useGameStore.getState().unlocked).toEqual([])

    useGameStore.getState().move('left')

    const state = useGameStore.getState()
    expect(state.game?.reachedTarget).toBe(true)
    expect(state.unlocked).toEqual(['first-merge', 'first-win'])
    expect(state.toasts).toEqual([{ key: 1, ids: ['first-merge', 'first-win'] }])
  })

  test('已经解锁着再走一步：集合不动，也就不再发号', () => {
    mount(boardWithPair(1024))
    useGameStore.getState().move('left')
    expect(useGameStore.getState().toasts).toHaveLength(1)

    // 达标之后「继续玩」回到 playing，再走一步：事实里 reachedTarget 仍是真，
    // 集合逐项相同 —— 没有任何新的跃迁
    useGameStore.getState().continueRun()
    useGameStore.getState().move('left')

    const state = useGameStore.getState()
    expect(state.unlocked).toEqual(['first-merge', 'first-win'])
    expect(state.toasts).toHaveLength(1)
  })

  test('一次跃迁里满足三个成就：合成**一条**，名字按注册表次序排好', () => {
    // 大棋盘的目标块是 4096：一对 2048 一合就同时是「首胜」「4096」；再把本局合并数
    // 摆到 199，这一步正好是第 200 次 —— 合并机器也在同一次跃迁里
    mount(boardWithPair(2048, 5, 'big-board'), { runMerges: 199 })

    useGameStore.getState().move('left')

    const state = useGameStore.getState()
    expect(state.game?.reachedTarget).toBe(true)
    expect(state.runMerges).toBe(200)
    // 四个成就，一条祝贺（不是每个成就一条）——这一步是第一次合并，所以
    // 「首次合并」也在同一次跃迁里，按注册表次序排在首胜前面
    expect(state.toasts).toHaveLength(1)
    expect(state.toasts[0].ids).toEqual(['first-merge', 'first-win', 'tile-4096', 'merge-machine'])
    expect(state.unlocked).toEqual(['first-merge', 'first-win', 'tile-4096', 'merge-machine'])
  })
})

describe('撤销收回：事实退回去，集合跟着退；重新达成算新的一次跃迁', () => {
  test('撤销掉达标那一步：解锁消失，再来一次又是一条新的祝贺', () => {
    mount(boardWithPair(1024))
    useGameStore.getState().move('left')
    expect(useGameStore.getState().unlocked).toEqual(['first-merge', 'first-win'])

    useGameStore.getState().undo()
    const revoked = useGameStore.getState()
    expect(revoked.game?.reachedTarget).toBe(false)
    // 集合收回了：它从事实派生，事实里 reachedTarget 已经不是真
    expect(revoked.unlocked).toEqual([])

    useGameStore.getState().move('left')
    const again = useGameStore.getState()
    expect(again.unlocked).toEqual(['first-merge', 'first-win'])
    // 第二条，编号 +1：撤销之后达成算**新的一次跃迁**，不是「已经祝贺过」
    expect(again.toasts.map((toast) => toast.key)).toEqual([1, 2])
  })

  test('风格旅行者是唯一收不回的那个：它的计数不跟撤销回退', () => {
    // ADR-0007 的刻意不对称：让切换计数可回退，玩家就能靠「撤销 + 再切一下」反复
    // 刷出同一条祝贺。于是它解锁之后本局收不回来，而其余五个都随事实回退
    const opening = boardWithPair(1024)
    mount(opening)
    for (const id of ['material', 'claude', 'classic', 'material', 'claude'] as StyleId[]) {
      useGameStore.getState().setStyle(id)
    }
    expect(useGameStore.getState().unlocked).toEqual(['style-traveller'])

    // 走一步再撤销：棋盘回退了，而切换计数与它对上的那个解锁纹丝不动
    useGameStore.getState().move('left')
    expect(useGameStore.getState().unlocked).toContain('first-win')
    useGameStore.getState().undo()

    const state = useGameStore.getState()
    expect(state.game).toBe(opening)
    expect(state.unlocked).toEqual(['style-traveller'])
  })
})

describe('本局合并数：增量维护的数与「沿路径数一遍」永远一致', () => {
  /** 第 0 行与第 3 行各有一个相邻相等对：一次左移合并 2 对 */
  const TWO_PAIRS: CellSpec[][] = [
    [2, 2, 4, 8],
    [4, 8, 16, 32],
    [64, 128, 256, 512],
    [2, 2, 4, 8],
  ]

  /** 四个方向轮着推：够长的有效移动链（无效的那几下引擎自己早退，不进历史） */
  const DRIVE: readonly Direction[] = ['left', 'right', 'up', 'down']

  test('一步加的是它真的合掉的次数，撤一步减回去，来回不漂', () => {
    mount(stateWithBoard(TWO_PAIRS, 7))
    expect(useGameStore.getState().runMerges).toBe(0)

    useGameStore.getState().move('left')
    expect(useGameStore.getState().runMerges).toBe(2)

    useGameStore.getState().undo()
    expect(useGameStore.getState().runMerges).toBe(0)

    // 再走一次同一步：加回去的仍然是 2（同一对状态、同一个数）
    useGameStore.getState().move('left')
    expect(useGameStore.getState().runMerges).toBe(2)
  })

  test('撤销栈很深时仍然只按该步差值算：增量与路径数出来的永远相等', () => {
    // 判据不写成「比某个魔数」：增量维护的数必须**恒等于**沿当前路径数出来的那个数。
    // 两者一致就说明撤销确实只按差值回退（没有重数整条路径、也没有漂）
    mount(createGame('big-board', 20260926, NOW))
    let guard = 0
    while (useGameStore.getState().history.length < 40 && guard < 400) {
      useGameStore.getState().move(DRIVE[guard % DRIVE.length])
      guard += 1
    }
    const deep = useGameStore.getState()
    expect(deep.history.length).toBeGreaterThanOrEqual(40)
    expect(deep.runMerges).toBe(countMergesAlongPath(deep.history, deep.game as GameState))

    useGameStore.getState().undo()
    const undone = useGameStore.getState()
    expect(undone.runMerges).toBe(countMergesAlongPath(undone.history, undone.game as GameState))
  })

  test('本局合并数不写进 GameState，也不写进存档形状', () => {
    mount(stateWithBoard(TWO_PAIRS, 7))
    useGameStore.getState().move('left')
    // GameState 的字段一个都没多（ADR-0001：规则数据由引擎认领）
    const gameKeys = Object.keys(useGameStore.getState().game as object)
    expect(gameKeys).not.toContain('runMerges')
    expect(gameKeys).not.toContain('merges')
    // 存档记录同样只有它一直有的那几个键
    const record = fake.store.session.get('current') as SessionRecord
    expect(Object.keys(record).sort()).toEqual(
      ['dailyDate', 'game', 'historyLength', 'startedAt', 'styleId', 'styleSwitches', 'version']
    )
  })
})

describe('堆叠：最多三条，第四条到达时丢最旧', () => {
  test('连着四次跃迁：栈里只剩最新那三条', () => {
    mount(boardWithPair(1024))
    // 走 → 撤 → 走 → 撤 …… 每一次「走」都是一次新的跃迁（撤销把解锁收回了）
    for (const _unused of Array.from({ length: 3 })) {
      useGameStore.getState().move('left')
      useGameStore.getState().undo()
    }
    expect(useGameStore.getState().toasts.map((toast) => toast.key)).toEqual([1, 2, 3])

    // 第四条进场：最旧那一条被丢掉
    useGameStore.getState().move('left')
    const state = useGameStore.getState()
    expect(state.toasts).toHaveLength(3)
    expect(state.toasts.map((toast) => toast.key)).toEqual([2, 3, 4])
    expect(state.nextToastKey).toBe(4)
  })

  test('收掉一条只把那条移出栈，集合不动', () => {
    mount(boardWithPair(1024))
    useGameStore.getState().move('left')
    useGameStore.getState().dismissToast(1)
    expect(useGameStore.getState().toasts).toEqual([])
    expect(useGameStore.getState().unlocked).toEqual(['first-merge', 'first-win'])
    // 收一个不存在的 key 什么都不发生（同一个 state 引用）
    const before = useGameStore.getState()
    useGameStore.getState().dismissToast(99)
    expect(useGameStore.getState()).toBe(before)
  })
})

describe('从存档恢复：建立静默基线', () => {
  test('恢复一局已经解锁过的：集合一个都没丢，但一条祝贺都不补放', async () => {
    // 盘面里带一个 8192：highestTile 一读就够两个方块成就；再把切换计数摆到 5，
    // 风格旅行者也该在。这样恢复必须给出一个有内容、却静悄悄的集合
    const opening = {
      ...stateWithBoard(
        [
          [8192, 2, 4, 8],
          [16, 32, 64, 128],
          [256, 8, 2, 4],
          [2, 4, 8, 16],
        ],
        123456
      ),
      score: 4242,
    }
    const first = move(opening, 'left').state

    fake.store.session.set(
      'current',
      encodeSession({
        game: first,
        dailyDate: null,
        styleId: 'material',
        historyLength: 1,
        startedAt: Date.UTC(2026, 8, 26, 11, 30),
        styleSwitches: 5,
      })
    )
    fake.store.history.set(0, opening)

    pristineStore()
    useGameStore.getState().hydrate()
    await settleWrites()

    const state = useGameStore.getState()
    expect(state.game).not.toBeNull()
    // 解锁一个都没丢（用户故事 11）
    expect(state.unlocked).toEqual(['tile-4096', 'tile-8192', 'style-traveller'])
    // 一条祝贺都不补放（用户故事 10）：这些是刷新前就打成的，不是「刚才」
    expect(state.toasts).toEqual([])
  })

  test('恢复出来的本局合并数沿撤销路径数出来，与刷新前那个数一致', async () => {
    // 合并次数是唯一「读不出状态」的事实，而整条撤销路径就在盘上——所以恢复时数一遍，
    // 得到的正是刷新前那个数
    const opening = stateWithBoard(
      [
        [2, 2, 4, 8],
        [4, 8, 16, 32],
        [64, 128, 256, 512],
        [2, 2, 4, 8],
      ],
      7
    )
    const first = move(opening, 'left').state
    const second = move(first, 'left').state

    fake.store.session.set(
      'current',
      encodeSession({
        game: second,
        dailyDate: null,
        styleId: 'classic',
        historyLength: 2,
        startedAt: null,
        styleSwitches: 0,
      })
    )
    fake.store.history.set(0, opening)
    fake.store.history.set(1, first)

    pristineStore()
    useGameStore.getState().hydrate()
    await settleWrites()

    const state = useGameStore.getState()
    // 每一步各合掉两对（第 0 行与第 3 行），两步共 4
    expect(state.runMerges).toBe(4)
    expect(state.toasts).toEqual([])
  })

  test('没有任何可恢复的一局：三个字段都从零起', async () => {
    pristineStore()
    useGameStore.getState().hydrate()
    await settleWrites()

    const state = useGameStore.getState()
    expect(state.game).toBeNull()
    expect(state.runMerges).toBe(0)
    expect(state.unlocked).toEqual([])
    expect(state.toasts).toEqual([])
  })
})

describe('一个字节都不落盘：成就与存储无关（ADR-0007）', () => {
  test('解锁之后，盘上没有任何一个桶写着成就', () => {
    mount(boardWithPair(1024))
    useGameStore.getState().move('left')
    expect(useGameStore.getState().unlocked).toEqual(['first-merge', 'first-win'])

    const persisted = JSON.stringify([
      [...fake.store.settings.values()],
      [...fake.store.session.values()],
      [...fake.store.history.values()],
      [...fake.store.records.values()],
      [...fake.store.stats.values()],
    ])
    expect(persisted).not.toContain('unlocked')
    expect(persisted).not.toContain('achievement')
    expect(persisted).not.toContain('first-win')
    // 统计桶本来就没碰过：这一局还没结算
    expect(fake.store.stats.size).toBe(0)
  })

  test('结算写下的统计里也没有成就字段', async () => {
    mount(boardWithPair(1024))
    useGameStore.getState().move('left')
    useGameStore.setState({
      game: { ...(useGameStore.getState().game as GameState), phase: 'stuck' },
    })

    useGameStore.getState().settle()
    await settleWrites()

    const stats = fake.store.stats.get('current') as Record<string, unknown>
    expect(Object.keys(stats).sort()).toEqual(
      ['lastRunStartedAt', 'timePlayedMs', 'totalRuns', 'version', 'wins'].sort()
    )
  })
})

describe('新一局是一道边界：集合清空、计数归零、编号复用', () => {
  test('newGame 之后没有任何解锁，也没有祝贺', () => {
    // `startRun` 要读 window.location，浏览器之外调不了；它与 newGame 走的是同一条
    // 基线（baselineOf），所以这里用 newGame 验那一台状态机。真正由 startRun 建立
    // 基线那一条路由 Playwright 覆盖（夹具开局不吹号）
    mount(boardWithPair(1024))
    useGameStore.getState().move('left')
    expect(useGameStore.getState().unlocked).toEqual(['first-merge', 'first-win'])

    useGameStore.getState().newGame()

    const fresh = useGameStore.getState()
    // 新一局是一副全新的随机开局：没有任何成就该解锁，也没有祝贺
    expect(fresh.unlocked).toEqual([])
    expect(fresh.toasts).toEqual([])
    expect(fresh.runMerges).toBe(0)
    expect(fresh.nextToastKey).toBe(0)
  })
})