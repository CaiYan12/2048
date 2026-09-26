import { describe, expect, test } from 'vitest'
import { MODES } from '../../src/shared/modes'
import { THEMES } from '../../src/renderer/styles/themes'
import { STORAGE_VERSION, restoreNotice, type SessionRecord } from '../../src/renderer/stores/session'
import {
  applyRunToStats,
  applySettlement,
  decodeRecords,
  decodeStats,
  decodeStyleRecord,
  emptyStats,
  formatDuration,
  highestTileOf,
  recordKey,
  settlementOf,
  settlementWriteFailureMessage,
  type Settlement,
  type StatsRecord,
  type StyleRecord,
} from '../../src/renderer/stores/records'
import { emptyAchievementProgress } from '../../src/game/achievements'
import { stateWithBoard } from './support'
import type { GameState } from '../../src/shared/types'

/**
 * T17 的战绩 / 统计纯逻辑（records.ts 半边）
 *
 * 本文件不碰 indexedDB、不碰 window、不碰 Date：`settlementOf` 的时钟由参数注入，
 * 其余函数是纯粹的算术。于是「一次结算该把哪一条记录改成什么」可以被逐条钉住，
 * 而不必先在浏览器里打一局。T14 的闸门已经证明过：没人在真实环境里跑过的那一层，
 * 恰恰是缺陷最爱住的地方。
 *
 * 这里每个数都给一个能认出来的值（support.ts 的口径）：断言落在一串巧合的初始值上
 * 就什么也证明不了。
 */

/** 本局起始时刻：开局早于结算半小时 */
const RUN_START = Date.UTC(2026, 8, 26, 11, 30)
/** 结算时刻：正好半小时之后，于是本局时长是可算的 1800000 */
const SETTLE_AT = Date.UTC(2026, 8, 26, 12)

/** 一局死局收工的终局：Walls 打底（盘面上有墙），方块铺到 1024 */
function settledDeadlock(): GameState {
  return {
    ...stateWithBoard(
      [
        [1024, 2, 4, 8],
        [16, 'wall', 'wall', 64],
        [128, 'wall', 'wall', 512],
        [256, 8, 2, 4],
      ],
      123456,
      'walls'
    ),
    score: 4242,
    moves: 9,
    reachedTarget: false,
    phase: 'ended',
    endReason: 'deadlock',
  }
}

/** 一局达标后收工的终局：同样的盘面，reachedTarget 置真 */
function settledWin(): GameState {
  return { ...settledDeadlock(), reachedTarget: true, endReason: 'won' }
}

/** 一次结算的基准形状。每个用例按需改一两个字段 */
function settlement(overrides: Partial<Settlement> = {}): Settlement {
  return {
    modeId: 'classic',
    styleId: 'classic',
    score: 4242,
    highestTile: 1024,
    reachedTarget: false,
    endReason: 'deadlock',
    timePlayedMs: 1800000,
    startedAt: RUN_START,
    merges: 0,
    dailyDate: null,
    ...overrides,
  }
}

/** 一条已有的记录：键由调用点给，值给一个能认出来的数 */
function record(bestScore: number, highestTile: number): StyleRecord {
  return { version: STORAGE_VERSION, bestScore, highestTile }
}

/** 一份已有的统计：四个数字各给一个能认出来的值 */
function stats(overrides: Partial<StatsRecord> = {}): StatsRecord {
  return {
    version: STORAGE_VERSION,
    totalRuns: 3,
    wins: 1,
    timePlayedMs: 5400000,
    achievements: emptyAchievementProgress(),
    lastRunStartedAt: null,
    ...overrides,
  }
}

describe('键与身份：一局只归一个风格', () => {
  test('键就是 `模式:风格`，六个模式 × 三套风格两两不撞', () => {
    expect(recordKey('classic', 'material')).toBe('classic:material')
    expect(recordKey('time-attack', 'claude')).toBe('time-attack:claude')
    // 两个槽位各归其主，拼成一个键。整张矩阵扫一遍：18 个键两两不同——
    // 撞键会让两套风格的记录互相覆盖，而那是 SPEC §3.3「按模式与风格记账」的底线
    const keys = new Set<string>()
    for (const mode of MODES) {
      for (const theme of THEMES) keys.add(recordKey(mode.id, theme.id))
    }
    expect(keys.size).toBe(18)
    // 同一个键恒定：幂等键靠它认「同一局」，字符串飘了的话一切都认不出来
    expect(recordKey('walls', 'claude')).toBe(recordKey('walls', 'claude'))
  })

  test('最高方块从棋盘上取，墙与空格不参与', () => {
    const board = stateWithBoard(
      [
        [2048, null, null, null],
        ['wall', 'wall', 4, null],
        [null, 16, null, null],
        [null, null, null, null],
      ],
      7,
      'walls'
    ).board
    expect(highestTileOf(board)).toBe(2048)
    // 空盘 / 只有墙：记 0 而不是 NaN 或 undefined
    expect(
      highestTileOf([
        [null, null],
        ['wall', null],
      ])
    ).toBe(0)
  })
})

describe('从终局状态取出一次结算', () => {
  test('分数、最高方块、曾达标、结束原因各自就位', () => {
    const payload = settlementOf(settledDeadlock(), 'material', RUN_START, SETTLE_AT, [], null)
    expect(payload).toEqual({
      modeId: 'walls',
      styleId: 'material',
      score: 4242,
      highestTile: 1024,
      reachedTarget: false,
      endReason: 'deadlock',
      timePlayedMs: 1800000,
      startedAt: RUN_START,
      merges: 0,
      dailyDate: null,
    })
  })

  test('本局时长 = 结算时刻 − 起始时刻，墙上时间，六模式同一个公式', () => {
    // 换一个模式、换一个起始时刻，公式不变：这里只是「差多少算多少」
    const walls = settlementOf(settledDeadlock(), 'classic', RUN_START, SETTLE_AT, [], null)
    expect(walls.timePlayedMs).toBe(1800000)
    const later = settlementOf(settledDeadlock(), 'classic', RUN_START, SETTLE_AT + 42500, [], null)
    expect(later.timePlayedMs).toBe(1842500)
    // 时钟被拨回（用户改系统时间）：不记负数。负数时长会让累计时长越算越少，
    // 而那是一个没有任何界面能发现的腐败
    const backwards = settlementOf(settledDeadlock(), 'classic', RUN_START, RUN_START - 5000, [], null)
    expect(backwards.timePlayedMs).toBe(0)
  })

  test('Time Attack 不叠加第二项：它的 deadline 已经封了顶，时长照旧是一段时间差', () => {
    // 限时模式的三分钟由 deadline 兑现（engine.deadlineOf），本票的公式不看 deadline——
    // 到点强制结算时它就是「一段墙上时间」，再补一笔「限时模式按 180 秒算」就是
    // 把同一段时间数两遍
    const timeoutRun: GameState = {
      ...settledDeadlock(),
      modeId: 'time-attack',
      phase: 'ended',
      endReason: 'timeout',
      deadline: RUN_START + 180000,
    }
    const payload = settlementOf(timeoutRun, 'claude', RUN_START, SETTLE_AT, [], null)
    expect(payload.endReason).toBe('timeout')
    expect(payload.timePlayedMs).toBe(1800000)
  })

  test('没有起始时刻（T17 之前开的那一局）：时长记 0，分数与最高方块照记', () => {
    // 为它把整局拒掉，等于因为一个统计字段毁掉一局还能下的棋
    const payload = settlementOf(settledDeadlock(), 'classic', null, SETTLE_AT, [], null)
    expect(payload.timePlayedMs).toBe(0)
    expect(payload.score).toBe(4242)
    expect(payload.highestTile).toBe(1024)
    // 幂等键跟着为 null：这一局无法被「同一次结算」识别，于是它每次都算一次
    expect(payload.startedAt).toBeNull()
  })
})

describe('最高分与最高方块：只升不降', () => {
  test('更高的分数抬高 best', () => {
    expect(applySettlement(record(1000, 512), settlement({ score: 4242 })).bestScore).toBe(4242)
  })

  test('更差的一局拉不动它', () => {
    expect(applySettlement(record(9999, 2048), settlement({ score: 12, highestTile: 4 }))).toEqual(
      record(9999, 2048)
    )
  })

  test('从来没有记录时从 0 起算，第一局就落下来', () => {
    expect(applySettlement(null, settlement({ score: 4242, highestTile: 1024 }))).toEqual(
      record(4242, 1024)
    )
  })

  test('两个数字各自独立：分数涨了但方块没变大，只动一个', () => {
    // 一局可以「分高、方块小」（比如善用合并却始终没合出大块）
    const merged = applySettlement(record(100, 2048), settlement({ score: 5000, highestTile: 64 }))
    expect(merged).toEqual(record(5000, 2048))
  })

  test('同一个结算递两次，结果逐字节相同（max 的幂等性）', () => {
    const once = applySettlement(record(1000, 512), settlement())
    const twice = applySettlement(once, settlement())
    expect(twice).toEqual(once)
  })
})

describe('统计按本票的公式更新', () => {
  test('第一局：总局数 1、胜局看曾达标、时长就是这一局的时长', () => {
    const { stats: deadlock } = applyRunToStats(null, settlement({ timePlayedMs: 1800000 }))
    expect(deadlock).toEqual({
      version: STORAGE_VERSION,
      totalRuns: 1,
      wins: 0,
      timePlayedMs: 1800000,
      // 成就进度：这一局没赢、没到 4096，但最高方块 1024 被记了下来（进度里的最大值语义）。
      // 一个成就都没解锁，所以 unlocked 是空的
      achievements: { ...emptyAchievementProgress(), highestTile: 1024 },
      lastRunStartedAt: RUN_START,
    })
    const { stats: win } = applyRunToStats(null, settlement({ reachedTarget: true, timePlayedMs: 90000 }))
    expect(win.totalRuns).toBe(1)
    expect(win.wins).toBe(1)
    expect(win.timePlayedMs).toBe(90000)
  })

  test('总局数与时长各自累加，一局都不串', () => {
    let current = applyRunToStats(null, settlement({ timePlayedMs: 1800000 })).stats
    current = applyRunToStats(
      current,
      settlement({ startedAt: RUN_START + 1800000, timePlayedMs: 600000 })
    ).stats
    expect(current.totalRuns).toBe(2)
    expect(current.timePlayedMs).toBe(2400000)
  })

  test('胜局按「曾达到目标块」数，不按结束原因', () => {
    // mode-contract §3：达标只是里程碑。SPEC §3.3 的「including a run that reached the
    // target and continued」说的就是下面第一种——达标后继续玩到死局再收工，
    // 结束原因是 deadlock，但它确实赢过。按 endReason 数会把这种局记成负局
    const { stats: deadlockAfterWin } = applyRunToStats(null, settlement({ reachedTarget: true }))
    expect(deadlockAfterWin.wins).toBe(1)
    const { stats: timeout } = applyRunToStats(null, settlement({ reachedTarget: false, endReason: 'timeout' }))
    expect(timeout.wins).toBe(0)
    const { stats: win } = applyRunToStats(null, settlement({ reachedTarget: true, endReason: 'won' }))
    expect(win.wins).toBe(1)
  })

  test('同一个结算递两次只数一次：结算只执行一次', () => {
    // 这是本票对「writer 不许写两次」的那一半：引擎的早退挡的是「同一个对象被结算
    // 两次」，而计数这一边要自己说了算，否则总数会从 1 变成 2。
    // 两种递法都要挡住：从「还没数过」起递两次，与从「已经数过这一局」起再递一次
    let current = applyRunToStats(null, settlement()).stats
    expect(current.totalRuns).toBe(1)
    expect(current.timePlayedMs).toBe(1800000)
    current = applyRunToStats(current, settlement()).stats
    expect(current.totalRuns).toBe(1)
    expect(current.timePlayedMs).toBe(1800000)

    const counted = stats({ lastRunStartedAt: RUN_START })
    // 数过的同一局：**同一个对象**原样返回（引用相等）， unlocked 也是空的——
    // 同一次结算不会被第二次计入，也不会第二次解锁
    const again = applyRunToStats(counted, settlement())
    expect(again.stats).toBe(counted)
    expect(again.unlocked).toEqual([])
  })

  test('不同的一局照旧各数一次：幂等键认的是局，不是数值', () => {
    const { stats: first } = applyRunToStats(stats(), settlement())
    const { stats: second } = applyRunToStats(
      first,
      settlement({ startedAt: RUN_START + 1800000, timePlayedMs: 600000 })
    )
    expect(second.totalRuns).toBe(stats().totalRuns + 2)
    // 两局的分数、方块、时长完全相同也不要紧：它们起始于不同时刻，是两局
    const { stats: third } = applyRunToStats(
      second,
      settlement({ startedAt: RUN_START + 1800000, timePlayedMs: 600000 })
    )
    expect(third).toBe(second)
  })

  test('成就进度跟着结算走：解锁了就往 unlocked 里落一个', () => {
    // T18 的接线在 records.ts 这一侧只有一句话：结算 → 成就判定 → 落库。
    // 这里钉的是「它真的发生了」，判定本身在 tests/unit/achievements.test.ts
    const { stats: first, unlocked } = applyRunToStats(
      null,
      settlement({ reachedTarget: true, highestTile: 4096 })
    )
    expect(unlocked).toEqual(['first-win', 'tile-4096'])
    expect(first.achievements.unlocked).toEqual(['first-win', 'tile-4096'])
    // 同一局递第二次：进度不动，也没有「新解锁」
    const { stats: twice, unlocked: none } = applyRunToStats(
      first,
      settlement({ startedAt: RUN_START + 1, reachedTarget: true, highestTile: 4096 })
    )
    expect(twice.achievements.unlocked).toEqual(['first-win', 'tile-4096'])
    expect(none).toEqual([])
    // 从没结算过时的统计：成就进度为空，不是 null 也不是 undefined
    expect(emptyStats().achievements.unlocked).toEqual([])
  })
})

describe('没有任何字段能区分「用过撤销的一局」与「干净的一局」', () => {
  /** 一局达标后收工、撤销过几百步的终局 */
  function assistedWin(): GameState {
    return {
      ...settledWin(),
      // 400 步历史、60 步有效移动 = 中途撤销了 340 次。它确实赢过，
      // 也确实一路撤回来过——而记录里不许留下任何能指认这件事的痕迹
      moves: 60,
    }
  }

  test('记录的键恰好三个，且与干净的一局逐字节相同', () => {
    // 撤销 400 步的一局
    const assisted = applySettlement(
      null,
      settlementOf(assistedWin(), 'material', RUN_START, SETTLE_AT, [], null)
    )
    // 一模一样的一局，只是没有撤销历史：同样的盘面、同样的分数、同样的方块
    const clean = applySettlement(
      null,
      settlementOf(settledWin(), 'material', RUN_START, SETTLE_AT, [], null)
    )
    expect(assisted).toEqual(clean)
    // 逐字节同形还不够，还要钉住**没有第三个字段**： someone 日后加一个
    // 「本局撤销过几次」的字段，这句会当场红（ADR-0003 + SPEC §6 明令禁止）
    expect(Object.keys(assisted)).toEqual(['version', 'bestScore', 'highestTile'])
  })

  test('统计的键也恰好这六个，撤销历史进不去', () => {
    const assisted = applyRunToStats(
      null,
      settlementOf(assistedWin(), 'material', RUN_START, SETTLE_AT, [], null)
    ).stats
    const clean = applyRunToStats(
      null,
      settlementOf(settledWin(), 'material', RUN_START, SETTLE_AT, [], null)
    ).stats
    expect(assisted).toEqual(clean)
    // SPEC §3.3 的四个数字 + 成就进度 + 幂等键。没有任何一项携带 undo / history / moves /
    // undoCount——「本局撤销过几次」在结构上就传不到这里来（撤销栈住在 store 而不在
    // GameState）。成就进度里的 bestMerges 确实要沿结算时的路径数，但它是**跨局取最大值**
    // 的一个数，不是「这一局用过撤销」的信号：撤一步会让它变小，永远不会因为撤销而变大，
    // 于是它无法用来区分「撤销过的一局」与「干净的一局」（ADR-0003 要的正是这一点）
    expect(Object.keys(assisted).sort()).toEqual(
      ['achievements', 'lastRunStartedAt', 'timePlayedMs', 'totalRuns', 'version', 'wins'].sort()
    )
  })

  test('结算载荷本身看不见撤销历史：GameState 的十一个字段里没有它', () => {
    // 撤销栈住在 store 而不是 GameState（ADR-0003 的完整前态方案），于是「这一局
    // 撤销过多少次」在结构上就传不到这里来——不是靠某条判断过滤掉的
    const payload = settlementOf(assistedWin(), 'material', RUN_START, SETTLE_AT, [], null)
    expect(Object.keys(payload)).not.toContain('history')
    expect(Object.keys(payload)).not.toContain('moves')
    expect(Object.keys(payload)).not.toContain('undoCount')
    expect(Object.keys(settledWin())).not.toContain('history')
  })
})

describe('版本与形状：拒绝，而不是静默重置', () => {
  test('版本不是当前这一个，一律拒绝', () => {
    for (const version of [0, 2, 99, -1, '1', null, undefined]) {
      const parsed = decodeStyleRecord({
        version,
        bestScore: 4242,
        highestTile: 1024,
      })
      expect(parsed.kind, `version = ${String(version)}`).toBe('rejected')
      if (parsed.kind !== 'rejected') continue
      expect(parsed.reason, `version = ${String(version)}`).toBe('version')
    }
  })

  test('少了一个 version 字段也按版本不符拒', () => {
    const parsed = decodeStyleRecord({ bestScore: 4242, highestTile: 1024 })
    expect(parsed.kind).toBe('rejected')
    if (parsed.kind !== 'rejected') return
    expect(parsed.reason).toBe('version')
  })

  test('没存过不是错：absent', () => {
    expect(decodeStyleRecord(null)).toEqual({ kind: 'absent' })
    expect(decodeStyleRecord(undefined)).toEqual({ kind: 'absent' })
    expect(decodeStats(null)).toEqual({ kind: 'absent' })
    expect(decodeRecords([])).toEqual({ kind: 'absent' })
  })

  const brokenRecords: ReadonlyArray<[string, () => unknown]> = [
    ['整个载荷是数组', () => [{ version: STORAGE_VERSION, bestScore: 1, highestTile: 2 }]],
    ['整个载荷是字符串', () => 'records'],
    ['bestScore 缺失', () => ({ version: STORAGE_VERSION, highestTile: 1024 })],
    ['bestScore 是负数', () => ({ version: STORAGE_VERSION, bestScore: -1, highestTile: 1024 })],
    ['bestScore 是小数', () => ({ version: STORAGE_VERSION, bestScore: 1.5, highestTile: 1024 })],
    ['bestScore 是字符串', () => ({ version: STORAGE_VERSION, bestScore: '4242', highestTile: 1024 })],
    ['highestTile 是 NaN', () => ({ version: STORAGE_VERSION, bestScore: 0, highestTile: Number.NaN })],
    ['墙的字符串混进了 highestTile', () => ({ version: STORAGE_VERSION, bestScore: 0, highestTile: 'wall' })],
  ]

  test.each(brokenRecords)('%s：按形状拒', (_name, make) => {
    const parsed = decodeStyleRecord(make())
    expect(parsed.kind).toBe('rejected')
    if (parsed.kind !== 'rejected') return
    expect(parsed.reason).toBe('shape')
  })

  const brokenStats: ReadonlyArray<[string, () => unknown]> = [
    ['整个载荷是数组', () => []],
    ['totalRuns 缺失', () => ({ version: STORAGE_VERSION, wins: 0, timePlayedMs: 0, achievements: emptyAchievementProgress(), lastRunStartedAt: null })],
    ['totalRuns 是负数', () => ({ ...emptyStats(), totalRuns: -1 })],
    ['wins 是小数', () => ({ ...emptyStats(), wins: 1.5 })],
    ['timePlayedMs 是负数', () => ({ ...emptyStats(), timePlayedMs: -1 })],
    ['timePlayedMs 是字符串', () => ({ ...emptyStats(), timePlayedMs: '1800000' })],
    ['achievements.unlocked 不是数组', () => ({ ...emptyStats(), achievements: { ...emptyAchievementProgress(), unlocked: 'first-win' } })],
    ['achievements.unlocked 里混进不认识的 id', () => ({ ...emptyStats(), achievements: { ...emptyAchievementProgress(), unlocked: ['perfect-run'] } })],
    ['achievements.modesWon 里混进不认识的模式', () => ({ ...emptyStats(), achievements: { ...emptyAchievementProgress(), modesWon: ['aero'] } })],
    ['achievements.bestMerges 是负数', () => ({ ...emptyStats(), achievements: { ...emptyAchievementProgress(), bestMerges: -1 } })],
    ['achievements.dailyStreakDate 形状不对', () => ({ ...emptyStats(), achievements: { ...emptyAchievementProgress(), dailyStreakDate: '2026-9-6' } })],
    ['achievements 缺一个字段', () => ({ ...emptyStats(), achievements: { unlocked: [] } })],
    ['lastRunStartedAt 是 0', () => ({ ...emptyStats(), lastRunStartedAt: 0 })],
    ['lastRunStartedAt 是小数', () => ({ ...emptyStats(), lastRunStartedAt: 1.5 })],
  ]

  test.each(brokenStats)('%s：按形状拒', (_name, make) => {
    const parsed = decodeStats(make())
    expect(parsed.kind).toBe('rejected')
    if (parsed.kind !== 'rejected') return
    expect(parsed.reason).toBe('shape')
  })

  test('整桶记录：任何一条读不出来 = 整桶拒绝，不挑一条能看的用', () => {
    const good = { key: 'classic:material', value: record(4242, 1024) }
    const stale = {
      key: 'classic:classic',
      value: { version: 99, bestScore: 7777, highestTile: 512 },
    }
    // 一条旧版就够：整桶按版本不符拒
    const parsed = decodeRecords([good, stale])
    expect(parsed.kind).toBe('rejected')
    if (parsed.kind !== 'rejected') return
    expect(parsed.reason).toBe('version')
  })

  test('整桶记录：键里的身份也要认，未知模式 / 风格一律拒', () => {
    for (const key of ['aero:classic', 'classic:aero', 'classic', 'classic:material:extra', ':']) {
      const parsed = decodeRecords([{ key, value: record(1, 2) }])
      expect(parsed.kind, key).toBe('rejected')
      if (parsed.kind !== 'rejected') continue
      expect(parsed.reason, key).toBe('shape')
    }
  })

  test('整桶记录：一条好的一条「键在值没了」，同样拒', () => {
    const parsed = decodeRecords([
      { key: 'classic:material', value: record(1, 2) },
      { key: 'walls:claude', value: null },
    ])
    expect(parsed.kind).toBe('rejected')
    if (parsed.kind !== 'rejected') return
    expect(parsed.reason).toBe('shape')
  })

  test('整桶记录：都好才过得去，身份与数字一起交出来', () => {
    const parsed = decodeRecords([
      { key: 'classic:material', value: record(4242, 1024) },
      { key: 'walls:claude', value: record(9, 4) },
    ])
    expect(parsed.kind).toBe('ok')
    if (parsed.kind !== 'ok') return
    expect(parsed.entries).toEqual([
      { modeId: 'classic', styleId: 'material', bestScore: 4242, highestTile: 1024 },
      { modeId: 'walls', styleId: 'claude', bestScore: 9, highestTile: 4 },
    ])
  })

  test('正常的一份统计过得去，且 round trip 逐字段等价', () => {
    const parsed = decodeStats(JSON.parse(JSON.stringify(stats())))
    expect(parsed.kind).toBe('ok')
    if (parsed.kind !== 'ok') return
    expect(parsed.record).toEqual(stats())
  })

  test('形状不判逻辑：wins 大于总局数也收得下', () => {
    // 这一层只回答「像不像一份统计」，不回答「自洽不自洽」——后者真要判就得引入
    // 「本票不想发明的规则」，而形状判据一旦开始讲逻辑就会越来越像第二套引擎
    const parsed = decodeStats({ ...emptyStats(), wins: 99, totalRuns: 1 })
    expect(parsed.kind).toBe('ok')
    if (parsed.kind !== 'ok') return
    expect(parsed.record.wins).toBe(99)
  })

  test('一条 session 记录与一条战绩记录的形状互不影响', () => {
    // 两个桶各自的判据：session 那边加 startedAt 不影响 records 这边
    const session: SessionRecord = {
      version: STORAGE_VERSION,
      styleId: 'material',
      dailyDate: null,
      startedAt: RUN_START,
      game: settledWin(),
      historyLength: 3,
    }
    expect(JSON.parse(JSON.stringify(session)).startedAt).toBe(RUN_START)
    expect(decodeStyleRecord(record(1, 2)).kind).toBe('ok')
  })
})

describe('时长的界面写法', () => {
  test.each([
    [0, '0:00'],
    [999, '0:00'],
    [1000, '0:01'],
    [90000, '1:30'],
    [1800000, '30:00'],
    [3599999, '59:59'],
    [3600000, '1:00:00'],
    [3723000, '1:02:03'],
  ])('%d 毫秒 → %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected)
  })
})

describe('写不进去时那一句', () => {
  test('配额用尽说清是满了，并且说的是「战绩没有记进去」', () => {
    const message = settlementWriteFailureMessage(
      new DOMException('Simulated quota exceeded', 'QuotaExceededError')
    )
    expect(message).toContain('本地存储已满')
    expect(message).toContain('战绩没有写入本地记录')
    // 它不许说「进度丢了」：分数与棋盘都在屏幕上，只是本地记录少了一条
    expect(message).not.toContain('进度丢了')
  })

  test('认不出的错误也有兜底的一句，不许沉默', () => {
    for (const error of [new Error('boom'), 'string rejection', null]) {
      expect(settlementWriteFailureMessage(error)).toContain('战绩没有写入本地记录')
    }
  })
})

describe('两个新桶的提示语', () => {
  test('records 与 stats 各有各的主语，而且都说了「已保留原有数据」', () => {
    const records = restoreNotice('version', 'records')
    expect(records.kind).toBe('restore-rejected')
    expect(records.message).toContain('记录读不出来')
    expect(records.message).toContain(`不是 v${STORAGE_VERSION}`)
    expect(records.message).toContain('已保留原有数据')
    const statsNotice = restoreNotice('shape', 'stats')
    expect(statsNotice.message).toContain('统计读不出来')
    // 一局读不出来那句话照旧说的是「开新游戏即可」：两套措辞不许混
    expect(restoreNotice('shape', 'session').message).toContain('开始新游戏即可')
    expect(restoreNotice('shape', 'settings').message).toContain('已回到默认设置')
  })
})
