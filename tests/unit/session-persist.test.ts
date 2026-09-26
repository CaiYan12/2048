import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { GameState } from '../../src/shared/types'
import { createGame, move } from '../../src/game/engine'
import { NOW } from './support'
import { useGameStore } from '../../src/renderer/stores/useGameStore'
import {
  STORAGE_VERSION,
  encodeSession,
  encodeSettings,
  type SessionRecord,
} from '../../src/renderer/stores/session'

/**
 * T16 的持久化接线：store ↔ 存档桶之间的那一段
 *
 * 用一个内存假后端替掉真的 IndexedDB（`vi.mock` 掉 ./sessionStore）。**这不是在
 * 测 IndexedDB**——那是浏览器的事（tests/e2e/session.spec.ts 走真库）。这里测的是
 * 本 Ticket 自己写的那部分决策：
 *   · 一步写多少（每步两条，不是把整条撤销历史重写一遍）；
 *   · 写不写得进去，界面说不说实话；
 *   · 读回来的东西怎么落到 store 上，落完之后还能不能一路撤到开局；
 *   · 新游戏擦什么、不擦什么。
 *
 * 假后端的桶与真库一一对应（settings / session / history / records），
 * 其中 records 是 T17 的桶——**只放一个种子值用来证明没人碰它**。
 */

/** 假后端。vi.hoisted 保证工厂在 import 之前就建好 */
const fake = vi.hoisted(() => {
  const store = {
    settings: new Map<string, unknown>(),
    session: new Map<string, unknown>(),
    history: new Map<number, unknown>(),
    /** T17 的桶。本 Ticket 既不建也不写，这里只证明「没人碰它」 */
    records: new Map<string, unknown>(),
    /** 每一次写盘的类目序列，按发生顺序 */
    writes: [] as string[],
  }
  /** 读被挂住时等在那里的解锁函数，逐个收着（读有几步就有几个） */
  let gates: (() => void)[] = []
  const api = {
    store,
    /** 打开这个开关之后每一次读都挂住，直到 releaseReads() */
    blockReads: false,
    /** 打开这个开关之后每一次写都失败 */
    failWrites: false,
    /** 打开这个开关之后每一次读都失败（隐私模式 / 存储被禁用） */
    failReads: false,
    releaseReads(): void {
      // 解锁之后就不再拦：读存档是好几步（settings → session → 历史），
      // 只放行第一步会把第二步永远挂在原地
      api.blockReads = false
      const pending = gates
      gates = []
      for (const gate of pending) gate()
    },
    waitForGate(): Promise<void> {
      if (!api.blockReads) return Promise.resolve()
      return new Promise<void>((resolve) => {
        gates.push(resolve)
      })
    },
  }
  return api
})

vi.mock('../../src/renderer/stores/sessionStore', () => ({
  readSettingsRaw: async (): Promise<unknown> => {
    await fake.waitForGate()
    if (fake.failReads) throw new DOMException('Storage disabled', 'UnknownError')
    return fake.store.settings.get('current') ?? null
  },
  readSessionRaw: async (): Promise<unknown> => {
    await fake.waitForGate()
    if (fake.failReads) throw new DOMException('Storage disabled', 'UnknownError')
    return fake.store.session.get('current') ?? null
  },
  readHistoryRaw: async (count: number): Promise<unknown[]> => {
    // 真库的 getAll 按键升序，前 count 条属于这一局；少一条就是少一条，不补 null
    const out: unknown[] = []
    for (let index = 0; index < count; index += 1) out.push(fake.store.history.get(index))
    return out
  },
  writeSettings: async (record: unknown): Promise<void> => {
    if (fake.failWrites) {
      throw new DOMException('Simulated quota exceeded', 'QuotaExceededError')
    }
    fake.store.writes.push('settings')
    fake.store.settings.set('current', record)
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
    // 与真库逐字相同的行为：push 写一条、pop 删一条、reset 清桶
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
}))

/** 让 store 里那些 fire-and-forget 的写盘把 catch 分支跑完 */
async function settleWrites(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve()
}

/** 读写存档是一次异步流程，等它落地 */
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
    storageNotice: null,
    restoring: true,
  })
}

/** 一份摆在 store 里的对局（不碰 window，与 tests/unit/undo.test.ts 同一路子） */
function mount(game: GameState): void {
  useGameStore.setState({
    game,
    dailyDate: null,
    history: [],
    swapArmed: false,
    swapSelection: null,
  })
}

/** 一直往右再往下的驱动器：够长的有效移动链，big-board 上走不死 */
const CYCLE: readonly ('left' | 'right' | 'up' | 'down')[] = ['left', 'right', 'up', 'down']

/** 走 count 步有效移动，返回走完之后的那一个状态 */
function playMoves(count: number): GameState {
  let state = createGame('big-board', 20260926, NOW)
  let effective = 0
  let attempts = 0
  while (effective < count) {
    attempts += 1
    if (attempts > count * 20) throw new Error('有线循环不该走到这里')
    const outcome = move(state, CYCLE[effective % CYCLE.length])
    if (!outcome.changed) continue
    effective += 1
    state = outcome.state
  }
  return state
}

/** 一条完整记录：把当前 store 里的这一局按存档形状塞进假后端 */
function seedBackend(): SessionRecord {
  const state = useGameStore.getState()
  const record = encodeSession({
    game: state.game as GameState,
    dailyDate: state.dailyDate,
    styleId: state.styleId,
    historyLength: state.history.length,
  })
  fake.store.session.set('current', record)
  state.history.forEach((entry, index) => {
    fake.store.history.set(index, entry)
  })
  return record
}

beforeEach(() => {
  fake.store.settings.clear()
  fake.store.session.clear()
  fake.store.history.clear()
  fake.store.records.set('classic:material', { bestScore: 9999 })
  fake.store.writes = []
  fake.failWrites = false
  fake.failReads = false
  fake.blockReads = false
  pristineStore()
})

describe('一步写多少', () => {
  test('一次有效移动 = 一条 session 记录 + 一条新压栈的前态，索引逐个递增', () => {
    mount(createGame('big-board', 20260926, NOW))
    fake.store.writes = []

    let effective = 0
    for (let step = 0; step < 12 && effective < 5; step += 1) {
      const before = useGameStore.getState()
      useGameStore.getState().move(CYCLE[step % CYCLE.length])
      if (useGameStore.getState().game === before.game) continue
      effective += 1
    }
    expect(effective).toBe(5)

    const pushes = fake.store.writes.filter((entry) => entry === 'session:push')
    // 每步只写两条：session 记录 + 那一条前态。整条撤销历史没有被重写一遍
    // （T11 实测：10,000 步的整栈重写累计约 30 GB，那件事在这里不做）
    expect(pushes).toHaveLength(5)
    // pop / reset / clear 一次都没有：这一串动作只有压栈
    expect(fake.store.writes.filter((entry) => entry !== 'session:push')).toEqual([])
    // 每条前态各就各位：索引 = 它在撤销栈里的位置，不是追加到一份越写越大的日志里
    const historyLength = useGameStore.getState().history.length
    for (let index = 0; index < historyLength; index += 1) {
      expect(fake.store.history.has(index)).toBe(true)
    }
    expect(fake.store.history.size).toBe(historyLength)
    // 少一次写盘就是少一次可恢复：写盘的次数与有效移动的次数相同
    expect(pushes.length).toBe(historyLength)
  })

  test('一次撤销 = 一条 session 记录 + 删掉弹出的那一条', () => {
    const opening = createGame('big-board', 20260926, NOW)
    mount(opening)
    // 走两步，攒两条历史
    useGameStore.getState().move(CYCLE[0])
    useGameStore.getState().move(CYCLE[1 % CYCLE.length])
    const two = useGameStore.getState()
    expect(two.history).toHaveLength(2)

    fake.store.writes = []
    useGameStore.getState().undo()

    expect(fake.store.writes).toEqual(['session:pop'])
    // 被删的正是弹出的那一条：索引就是新栈的长度
    expect(fake.store.history.has(1)).toBe(false)
    expect(fake.store.history.has(0)).toBe(true)
  })

  test('无效移动一次盘都不写', () => {
    // 一副四方向都动不了的棋盘：满盘且横竖相邻都不相等。往任何方向按都是
    // 无效移动——引擎原样返回同一个引用，store 连 state 都不换
    mount({
      ...createGame('classic', 20260926, NOW),
      board: [
        [{ id: 1, value: 2 }, { id: 2, value: 4 }, { id: 3, value: 2 }, { id: 4, value: 4 }],
        [{ id: 5, value: 4 }, { id: 6, value: 2 }, { id: 7, value: 4 }, { id: 8, value: 2 }],
        [{ id: 9, value: 2 }, { id: 10, value: 4 }, { id: 11, value: 2 }, { id: 12, value: 4 }],
        [{ id: 13, value: 4 }, { id: 14, value: 2 }, { id: 15, value: 4 }, { id: 16, value: 2 }],
      ],
    })
    const before = useGameStore.getState()

    for (const direction of ['left', 'right', 'up', 'down'] as const) {
      useGameStore.getState().move(direction)
    }

    // 一个字节都不写，连 state 都没换
    expect(fake.store.writes).toEqual([])
    expect(useGameStore.getState().game).toBe(before.game)
  })

  test('新游戏：reset 一次，records 一个字节都不碰', () => {
    mount(createGame('big-board', 20260926, NOW))
    useGameStore.getState().move(CYCLE[0])
    useGameStore.getState().move(CYCLE[1 % CYCLE.length])
    expect(fake.store.history.size).toBeGreaterThan(0)

    fake.store.writes = []
    useGameStore.getState().newGame()

    // 验收标准 3 的前半句：未结算的 session 被放弃
    expect(fake.store.writes).toEqual(['session:reset'])
    expect(fake.store.history.size).toBe(0)
    // 后半句：已结算数据不擦。records 是 T17 的桶，本 Ticket 连建都不建，
    // 所以「不擦」不是靠一条小心翼翼的排除项，而是压根没有能擦它的代码路径
    expect(fake.store.records.get('classic:material')).toEqual({ bestScore: 9999 })
    expect(fake.store.writes.some((entry) => entry.includes('records'))).toBe(false)
  })

  test('结算之后这一局的存档作废：下一次加载回到开局界面，而不是一块死棋盘', () => {
    // 一步即死的局面（tests/e2e/run-endings.spec.ts 的同款）：右移填满棋盘，
    // 而横竖相邻都不相等，于是转 stuck；再 settle 转 ended
    mount({
      ...createGame('classic', 20260926, NOW),
      board: [
        [{ id: 1, value: 8 }, { id: 2, value: 2 }, { id: 3, value: 4 }, null],
        [{ id: 4, value: 8 }, { id: 5, value: 2 }, { id: 6, value: 4 }, { id: 7, value: 8 }],
        [{ id: 8, value: 2 }, { id: 9, value: 4 }, { id: 10, value: 8 }, { id: 11, value: 2 }],
        [{ id: 12, value: 4 }, { id: 13, value: 8 }, { id: 14, value: 2 }, { id: 15, value: 4 }],
      ],
    })
    useGameStore.getState().move('right')
    expect(useGameStore.getState().game?.phase).toBe('stuck')

    fake.store.writes = []
    useGameStore.getState().settle()

    expect(useGameStore.getState().game?.phase).toBe('ended')
    expect(fake.store.writes).toEqual(['clear'])
    expect(fake.store.session.size).toBe(0)
    expect(fake.store.history.size).toBe(0)
    // records 仍然没被碰
    expect(fake.store.records.get('classic:material')).toEqual({ bestScore: 9999 })
  })
})

describe('写不进去时界面上说什么', () => {
  test('配额用尽：提示可见，并且说的是实话', async () => {
    mount(createGame('big-board', 20260926, NOW))
    fake.failWrites = true

    useGameStore.getState().move(CYCLE[0])
    await settleWrites()

    const notice = useGameStore.getState().storageNotice
    expect(notice).not.toBeNull()
    expect(notice?.kind).toBe('write-failed')
    // 真话的三段：失败了、页面内的撤销还在、刷新可能续不上
    expect(notice?.message).toContain('保存失败')
    expect(notice?.message).toContain('本地存储已满')
    expect(notice?.message).toContain('撤销仍然可用')
    expect(notice?.message).toContain('刷新后可能无法继续')
    // 界面这一侧的撤销栈一条都没少：写失败不影响内存里的历史
    expect(useGameStore.getState().history).toHaveLength(1)
    expect(useGameStore.getState().history[0]).toBe(useGameStore.getState().history[0])
  })

  test('设置写失败也说同一句话，而且不妨碍这一局继续打', async () => {
    fake.failWrites = true
    useGameStore.getState().selectMode('walls')
    await settleWrites()

    expect(useGameStore.getState().storageNotice?.kind).toBe('write-failed')
    expect(useGameStore.getState().selectedModeId).toBe('walls')
  })

  test('恢复之后换风格：两个桶都写，而这一局一个字段都不动', async () => {
    // 引用相等，不只是值相等：T13 的复核立下的规矩——深相等证不了「什么都没变」，
    // 把 run 重建一遍、每个值都还在，toEqual 照样过。这里断的是同一个对象
    const game = createGame('big-board', 20260926, NOW)
    mount(game)
    useGameStore.getState().move(CYCLE[0])
    const before = useGameStore.getState()

    fake.store.writes = []
    useGameStore.getState().setStyle('material')
    const after = useGameStore.getState()

    expect(after.game).toBe(before.game)
    expect(after.history).toBe(before.history)
    expect(after.dailyDate).toBe(before.dailyDate)
    expect(after.styleId).toBe('material')
    // 换风格写两个桶（SPEC §3.3 两边都列了 selected style），一条历史都不动
    expect(fake.store.writes).toEqual(['settings', 'session:none'])
    expect(fake.store.history.size).toBe(before.history.length)
  })
})

describe('读回来怎么落到 store 上', () => {
  test('一整个 session 读回来：棋盘、撤销路径、风格、日期一起到位', async () => {
    const game = createGame('big-board', 20260926, NOW)
    mount(game)
    useGameStore.getState().move(CYCLE[0])
    useGameStore.getState().move(CYCLE[1 % CYCLE.length])
    useGameStore.getState().setStyle('material')
    useGameStore.setState({ dailyDate: '2026-09-26', swapArmed: true, swapSelection: [0, 1] })
    const before = useGameStore.getState()
    seedBackend()

    // 全新一次「刷新」：store 回到还没开局的样子，再 hydrate
    pristineStore()
    expect(useGameStore.getState().game).toBeNull()
    useGameStore.getState().hydrate()
    await settleHydration()

    const after = useGameStore.getState()
    expect(after.restoring).toBe(false)
    // 值逐项等价（JSON 往返会造新对象，那是允许的）
    expect(after.game).toEqual(before.game)
    expect(after.history).toEqual(before.history)
    expect(after.history).toHaveLength(before.history.length)
    expect(after.dailyDate).toBe('2026-09-26')
    expect(after.styleId).toBe('material')
    expect(after.storageNotice).toBeNull()
    // 拾取态不恢复：它是一次做了一半的编辑，不是这一局的规则数据
    expect(after.swapArmed).toBe(false)
    expect(after.swapSelection).toBeNull()
  })

  test('300 步的有效移动之后，一路撤销回到的正是开局那一个对象', async () => {
    // 这是本票最硬的一条：恢复必须保住「撤到开局」，一个 GameState 都不许多、
    // 少、或者换掉（ADR-0003 + mode-contract §4 唯一不可谈判的那一条）
    const opening = createGame('big-board', 20260926, NOW)
    mount(opening)
    for (let step = 0; step < 300; step += 1) {
      useGameStore.getState().move(CYCLE[step % CYCLE.length])
    }
    const deep = useGameStore.getState()
    expect(deep.history).toHaveLength(300)
    seedBackend()

    // 刷新：store 清空，再读回来
    pristineStore()
    useGameStore.getState().hydrate()
    await settleHydration()

    const restored = useGameStore.getState()
    expect(restored.history).toHaveLength(300)
    expect(restored.game).toEqual(deep.game)
    const first = restored.history[0]

    for (let step = 0; step < 300; step += 1) useGameStore.getState().undo()

    const back = useGameStore.getState()
    expect(back.history).toHaveLength(0)
    // 同一个对象：搬回来的就是当初收进历史的那一个，一字节都没差。
    // 用 toEqual 会输给「重建一份值相等的」，所以这里断引用
    expect(back.game).toBe(first)
    // 撤回的那一个对象就是开局棋盘本身：步数归零、盘面与当初一模一样
    expect((back.game as GameState).moves).toBe(0)
    expect(back.game).toEqual(opening)
  })

  test('读存档的那几步里玩家开了新局：存档不许盖上去', async () => {
    // 读写竞态。开局界面就在第一帧，玩家完全点得比读存档快——
    // 那时候把存档盖上去，等于把玩家刚开的一局换成另一局
    fake.blockReads = true
    fake.store.session.set(
      'current',
      encodeSession({
        game: createGame('classic', 20260926, NOW),
        dailyDate: null,
        styleId: 'classic',
        historyLength: 0,
      })
    )

    useGameStore.getState().hydrate()
    // 读还挂着：此刻玩家点了一个模式并开局
    const started = createGame('walls', 20260926, NOW)
    useGameStore.setState({ game: started, restoring: true })
    fake.releaseReads()
    await settleHydration()

    expect(useGameStore.getState().game).toBe(started)
    expect(useGameStore.getState().restoring).toBe(false)
  })

  test('连存储都打不开：说的是「这一局无法恢复」，界面上不会永远停在「正在恢复」', async () => {
    // 隐私模式 / 存储被禁用：读都读不了。这同样是「不假装」——界面要说的是恢复
    // 没发生，而不是安静开一局新的
    fake.failReads = true

    useGameStore.getState().hydrate()
    await settleHydration()

    const state = useGameStore.getState()
    expect(state.storageNotice?.kind).toBe('restore-rejected')
    expect(state.storageNotice?.message).toContain('无法恢复')
    expect(state.storageNotice?.message).toContain('开始新游戏')
    expect(state.game).toBeNull()
    // 这一句是硬要求：restoring 永远为 true 的话玩家面对的是一句永远不退的
    // 「正在恢复」，比没有这句话更糟
    expect(state.restoring).toBe(false)
  })

  test('旧版 session：不当成可续玩，而是明说，store 里什么都不恢复', async () => {
    // 一份版本 0 的记录（形状本身是好的）
    fake.store.session.set('current', {
      version: 0,
      styleId: 'material',
      dailyDate: '2026-09-26',
      game: createGame('classic', 20260926, NOW),
      historyLength: 0,
    })

    useGameStore.getState().hydrate()
    await settleHydration()

    const state = useGameStore.getState()
    // 界面说清楚了，而不是安静开一局新的让玩家以为恢复成功
    expect(state.storageNotice?.kind).toBe('restore-rejected')
    expect(state.storageNotice?.message).toContain(`不是 v${STORAGE_VERSION}`)
    expect(state.game).toBeNull()
    expect(state.restoring).toBe(false)
    // 默认值而不是猜出来的值：风格回到 classic
    expect(state.styleId).toBe('classic')
  })

  test('撤销历史少一条：整局按不可恢复处理', async () => {
    // 撤不到开局的存档不算可恢复（ADR-0003）——少给最后一条前态，
    // 玩家撤销到第 N 步时会静默少一次可撤销
    const game = createGame('big-board', 20260926, NOW)
    mount(game)
    useGameStore.getState().move(CYCLE[0])
    useGameStore.getState().move(CYCLE[1 % CYCLE.length])
    seedBackend()
    // 人为抹掉最后一条
    fake.store.history.delete(fake.store.history.size - 1)

    pristineStore()
    useGameStore.getState().hydrate()
    await settleHydration()

    const state = useGameStore.getState()
    expect(state.game).toBeNull()
    expect(state.storageNotice?.kind).toBe('restore-rejected')
  })

  test('已结算的一局安静作废：不是损坏，是这一局打完了', async () => {
    const ended: GameState = {
      ...createGame('classic', 20260926, NOW),
      phase: 'ended',
      endReason: 'timeout',
    }
    fake.store.session.set(
      'current',
      encodeSession({
        game: ended,
        dailyDate: null,
        styleId: 'classic',
        historyLength: 0,
      })
    )

    useGameStore.getState().hydrate()
    await settleHydration()

    const state = useGameStore.getState()
    // 没有提示：ended 之后撤销与交换一律不可用，那一局没有可恢复的东西。
    // 留着它，下一次加载会还原出一块死棋盘而不是开局界面
    expect(state.storageNotice).toBeNull()
    expect(state.game).toBeNull()
    expect(fake.store.writes).toEqual(['clear'])
  })

  test('settings 坏了不阻塞这一局，但要说出来', async () => {
    fake.store.settings.set('current', { version: 0, modeId: 'walls', styleId: 'aero', mute: false })
    const game = createGame('fibonacci', 20260926, NOW)
    mount(game)
    seedBackend()

    pristineStore()
    useGameStore.getState().hydrate()
    await settleHydration()

    const state = useGameStore.getState()
    // 这一局照样恢复（session 桶是好的）
    expect(state.game).toEqual(game)
    // 设置那一边说出来，用的是它自己那句话
    expect(state.storageNotice?.kind).toBe('restore-rejected')
    expect(state.storageNotice?.message).toContain('设置')
    // 一局恢复完之后 storageNotice 属于设置——两条同时坏时以 session 为先，
    // 这里只坏了设置，所以玩家看到的是设置那句
  })
})

describe('开局界面上的选择也进 settings', () => {
  test('选模式与选风格都写 settings 桶', async () => {
    fake.store.writes = []
    useGameStore.getState().selectMode('daily')
    await settleWrites()
    useGameStore.getState().setStyle('claude')
    await settleWrites()

    expect(fake.store.writes).toEqual(['settings', 'settings'])
    const record = fake.store.settings.get('current')
    expect(record).toEqual({
      version: STORAGE_VERSION,
      modeId: 'daily',
      styleId: 'claude',
      // mute 是 T20 的字段：形状先占位，值恒 false
      mute: false,
    })
  })

  test('读回来的设置落成开局界面上的选中项', async () => {
    fake.store.settings.set('current', encodeSettings('time-attack', 'claude'))
    useGameStore.getState().hydrate()
    await settleHydration()

    expect(useGameStore.getState().selectedModeId).toBe('time-attack')
    expect(useGameStore.getState().styleId).toBe('claude')
  })

  test('带了 ?seed= 的加载不恢复这一局，但设置照旧恢复', async () => {
    // 显式开局指令优先于存档：那一次加载要的是指令给的那一题。
    // 浏览器里 reflect 的是「同一个 seed 跑第二遍」——夹具用例的对照组
    // （tests/e2e/claude.spec.ts 等）正是这么写的
    vi.stubGlobal('window', { location: { search: '?seed=20260926' } })
    fake.store.settings.set('current', encodeSettings('walls', 'claude'))
    fake.store.session.set(
      'current',
      encodeSession({
        game: createGame('classic', 20260926, NOW),
        dailyDate: null,
        styleId: 'material',
        historyLength: 0,
      })
    )

    useGameStore.getState().hydrate()
    await settleHydration()

    const state = useGameStore.getState()
    // 这一局没有恢复（开局界面会照 ?seed= 重开一局），但风格与模式的选择恢复了
    expect(state.game).toBeNull()
    expect(state.storageNotice).toBeNull()
    expect(state.selectedModeId).toBe('walls')
    expect(state.styleId).toBe('claude')
    // 存档没被这一句删掉：玩家真去开局时它会被覆盖，而不是先被悄悄清一次
    expect(fake.store.session.size).toBe(1)
    expect(fake.store.writes).toEqual([])
    vi.unstubAllGlobals()
  })
})
