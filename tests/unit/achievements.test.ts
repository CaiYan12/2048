import { describe, expect, test } from 'vitest'
import type { CellSpec } from './support'
import type { GameState } from '../../src/shared/types'
import { MODES } from '../../src/shared/modes'
import { move, swap } from '../../src/game/engine'
import {
  ACHIEVEMENTS,
  applyRunToAchievements,
  countMergesAlongPath,
  decodeAchievementProgress,
  emptyAchievementProgress,
  mergeCountBetween,
  utcDayNumberOf,
  type AchievementProgress,
  type RunFacts,
} from '../../src/game/achievements'
import { applyRunToStats, settlementOf } from '../../src/renderer/stores/records'
import { NOW, stateWithBoard } from './support'
import { useGameStore } from '../../src/renderer/stores/useGameStore'

/**
 * T18 的成就判定：九个模式轴成就里**能推导的那七个**。
 *
 * 判定全部是纯函数：本局事实（分数 / 最高方块 / 曾达标 / 合并次数 / Daily 日期）喂进去，
 * 解锁与进度算出来，没有任何 DOM、没有 indexedDB、没有 Date。于是每个成就都按
 * 「解锁一次 + 不解锁一次」两个用例钉住，同样的事实递进去永远得到同样的结论（可重放）。
 *
 * **为什么只有七个**：「完美一局」与「无作弊通关」要判「本局**曾经**用过撤销 / 作弊
 * 交换」，而撤销把前态弹出撤销栈之后那件事在持久化状态里不留痕迹（重做同一步还原出
 * 逐字节相同的状态，rngState 一起回退）。判定它们需要一个只增不减的计数器，而那正是
 * ADR-0003 禁的标记字段——owner 裁决之前这两个成就不实现，见 achievements.ts 头注。
 */

/** 一局死局收工的终局基准。每个用例按需改一两个字段 */
function facts(overrides: Partial<RunFacts> = {}): RunFacts {
  return {
    modeId: 'classic',
    score: 4242,
    highestTile: 1024,
    reachedTarget: false,
    merges: 12,
    dailyDate: null,
    ...overrides,
  }
}

/** 一份已有进度。每个用例按需改一两个字段 */
function progress(overrides: Partial<AchievementProgress> = {}): AchievementProgress {
  return { ...emptyAchievementProgress(), ...overrides }
}

/**
 * 连续若干天的 Daily 结算：一天一局，按顺序递进去。
 *
 * 日期串是 `SessionRecord.dailyDate` 的口径（T08：它不能从种子反推，只能由结算方带来），
 * 这里的用例直接写日期串——「哪一天结算过一局」本来就该由这一层说得准。
 */
function settleDailies(dates: readonly string[], from: AchievementProgress | null = null): AchievementProgress {
  let current = from ?? emptyAchievementProgress()
  for (const date of dates) {
    current = applyRunToAchievements(
      current,
      facts({ modeId: 'daily', reachedTarget: false, dailyDate: date })
    ).progress
  }
  return current
}

/** 只有第 0 行有一个相邻相等对、别处都不相等的棋盘：一次左移合并 1 对 */
const ONE_PAIR: CellSpec[][] = [
  [2, 2, 4, 8],
  [4, 8, 16, 32],
  [64, 128, 256, 512],
  [1024, 2, 4, 8],
]

/** 第 0 行与第 3 行各有一个相邻相等对：一次左移合并 2 对 */
const TWO_PAIRS: CellSpec[][] = [
  [2, 2, 4, 8],
  [4, 8, 16, 32],
  [64, 128, 256, 512],
  [2, 2, 4, 8],
]

/** 每行都有两对相邻相等：一次左移合掉 8 对 */
const FOUR_PAIRS: CellSpec[][] = [
  [2, 2, 4, 4],
  [8, 8, 16, 16],
  [32, 32, 64, 64],
  [128, 128, 256, 256],
]

/** 只有一个空格的棋盘：左移只是滑动，一个都不合并 */
const PACK_ONLY: CellSpec[][] = [
  [2, null, 4, null],
  [8, 16, 32, 64],
  [128, 256, 512, 1024],
  [2, 4, 8, 16],
]

describe('合并次数：沿路径数「消失的方块身份」', () => {
  test('一次合并少一个身份，一次滑动一个都不少', () => {
    const before = stateWithBoard(ONE_PAIR, 7)
    const after = move(before, 'left').state
    // 手算：第 0 行 2+2 → 4 落在目标格、被吞的那个身份从棋盘上消失；其余三行
    // 没有相邻相等，一个都不合并。所以这一次迁移恰好一次合并
    expect(mergeCountBetween(before, after)).toBe(1)
    // 只滑动不合并的一步：身份一个不少
    const slideBefore = stateWithBoard(PACK_ONLY, 7)
    expect(mergeCountBetween(slideBefore, move(slideBefore, 'left').state)).toBe(0)
  })

  test('一次移动合并几对就数几对', () => {
    const before = stateWithBoard(FOUR_PAIRS, 7)
    // 四行各两对 = 8 对。逐对核过相邻相等关系之后写在注释里，不是跑实现抄回来的
    expect(mergeCountBetween(before, move(before, 'left').state)).toBe(8)
  })

  test('一次交换一个都不合并：两枚方块换个位置，身份集合逐字节相同', () => {
    const before = stateWithBoard(ONE_PAIR, 7)
    const swapped = swap(before, [0, 0], [0, 2])
    expect(swapped).not.toBeNull()
    expect(mergeCountBetween(before, swapped as GameState)).toBe(0)
  })

  test('整条路径逐段累计：两步各 2 对，一共 4 对', () => {
    const first = stateWithBoard(TWO_PAIRS, 7)
    const second = move(first, 'left').state
    const third = move(second, 'left').state
    // 每一步都合并第 0 行与第 3 行各一对（2 对）。第二步合并的是 4+4 与 4+4，
    // 与第一步产出什么无关，所以这个期望值不依赖随机生成的那一枚
    expect(mergeCountBetween(first, second)).toBe(2)
    expect(mergeCountBetween(second, third)).toBe(2)
    expect(countMergesAlongPath([first, second], third)).toBe(4)
  })

  test('路径摘掉一步就少算一步：只数当前路径，与 moves 同一条口径', () => {
    // 走两步、再撤一步。撤销之后 history 里只剩开局那一个状态，于是合并次数回到 2——
    // 「单局完成 200 次合并」在撤销存在的前提下只有这一种可复现的读法
    const opening = stateWithBoard(TWO_PAIRS, 7)
    useGameStore.setState({ game: opening, dailyDate: null, history: [] })
    useGameStore.getState().move('left')
    useGameStore.getState().move('left')
    const twoSteps = useGameStore.getState()
    expect(countMergesAlongPath(twoSteps.history, twoSteps.game as GameState)).toBe(4)

    useGameStore.getState().undo()
    const oneStep = useGameStore.getState()
    expect(countMergesAlongPath(oneStep.history, oneStep.game as GameState)).toBe(2)
    // 反过来比（S2 → S1）也数得出 1：这个度量是**有方向**的，撤销那一步看起来就像一次
    // 合并——第二步吞掉的身份在回退之后又回来了。所以只能沿路径逐段数，拿起点与终点
    // 比一下是不成立的
    expect(mergeCountBetween(twoSteps.game as GameState, oneStep.game as GameState)).toBe(1)
  })

  test('合并次数可从持久化状态推导：整条路径过一遍 JSON 一个都不少', () => {
    // 撤销路径以 GameState 全文的形式存在 history 桶里（T16），所以「合并了几次」
    // 必须能从那一份读回来——这也是跨刷新不丢合并进度的全部依据
    const first = stateWithBoard(TWO_PAIRS, 7)
    const second = move(first, 'left').state
    const third = move(second, 'left').state
    const fromDisk = JSON.parse(JSON.stringify([first, second, third])) as GameState[]
    expect(countMergesAlongPath(fromDisk.slice(0, 2), fromDisk[2])).toBe(4)
  })

  test('开局就结算（没有历史）：0 次合并', () => {
    const opening = stateWithBoard(ONE_PAIR, 7)
    expect(countMergesAlongPath([], opening)).toBe(0)
  })
})

describe('七个成就：解锁与不解锁各一例', () => {
  test('首胜：第一次赢就解锁，没赢过就不解锁', () => {
    const win = applyRunToAchievements(null, facts({ reachedTarget: true }))
    expect(win.unlocked).toEqual(['first-win'])
    expect(win.progress.unlocked).toEqual(['first-win'])
    // 没赢过的一局：一个都不解锁，进度里也没有首胜
    const loss = applyRunToAchievements(null, facts({ reachedTarget: false }))
    expect(loss.unlocked).toEqual([])
    expect(loss.progress.unlocked).toEqual([])
  })

  test('模式收藏家：六个模式各赢一次才解锁，差一个都不行', () => {
    // 五个模式赢过：还差一个
    const five = progress({ modesWon: ['classic', 'fibonacci', 'big-board', 'walls', 'daily'] })
    const still = applyRunToAchievements(five, facts({ reachedTarget: false }))
    expect(still.unlocked).toEqual([])
    // 第六个模式赢下来的这一局：解锁
    const sixth = applyRunToAchievements(five, facts({ modeId: 'time-attack', reachedTarget: true }))
    expect(sixth.unlocked).toEqual(['first-win', 'mode-collector'])
    // 同一个模式赢第二次不加进度（并集语义）
    const repeat = applyRunToAchievements(sixth.progress, facts({ modeId: 'classic', reachedTarget: true }))
    expect(repeat.progress.modesWon).toEqual([
      'classic',
      'fibonacci',
      'big-board',
      'walls',
      'daily',
      'time-attack',
    ])
  })

  test('4096：合出就解锁，差一点不解', () => {
    const big = applyRunToAchievements(null, facts({ highestTile: 4096 }))
    expect(big.unlocked).toEqual(['tile-4096'])
    const justUnder = applyRunToAchievements(null, facts({ highestTile: 2048 }))
    expect(justUnder.unlocked).toEqual([])
    expect(justUnder.progress.highestTile).toBe(2048)
  })

  test('大数猎人：8192 才解锁，且它顺带解锁 4096（合出 8192 之前必然合出过 4096）', () => {
    const hunter = applyRunToAchievements(null, facts({ highestTile: 8192 }))
    expect(hunter.unlocked).toEqual(['tile-4096', 'tile-8192'])
    // 4096 只够解锁 4096，够不着大数猎人
    const notYet = applyRunToAchievements(null, facts({ highestTile: 4096 }))
    expect(notYet.unlocked).toEqual(['tile-4096'])
    expect(notYet.progress.unlocked).not.toContain('tile-8192')
  })

  test('快手：Time Attack 单局**超过** 20000 分解锁，等于 20000 不解', () => {
    const fast = applyRunToAchievements(
      null,
      facts({ modeId: 'time-attack', score: 20001, reachedTarget: true })
    )
    expect(fast.unlocked).toEqual(['first-win', 'quick-hand'])
    const exactly = applyRunToAchievements(
      null,
      facts({ modeId: 'time-attack', score: 20000 })
    )
    expect(exactly.unlocked).toEqual([])
    // 别的模式打再高也不算：这个成就只认 Time Attack 的单局分
    const classic = applyRunToAchievements(null, facts({ modeId: 'classic', score: 99999 }))
    expect(classic.unlocked).toEqual([])
    expect(classic.progress.bestTimeAttackScore).toBe(0)
  })

  test('合并机器：单局 200 次合并解锁，199 不解', () => {
    const machine = applyRunToAchievements(null, facts({ merges: 200 }))
    expect(machine.unlocked).toEqual(['merge-machine'])
    const almost = applyRunToAchievements(null, facts({ merges: 199 }))
    expect(almost.unlocked).toEqual([])
    expect(almost.progress.bestMerges).toBe(199)
  })

  test('每日坚守：连续 7 天各结算一局 Daily 才解锁，6 天不解', () => {
    const week = settleDailies([
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
      '2026-09-06',
      '2026-09-07',
    ])
    expect(week.dailyStreakLength).toBe(7)
    expect(week.unlocked).toEqual(['daily-stand'])
    expect(week.dailyStreakDate).toBe('2026-09-07')
    // 只差一天：链条够长，但还没到 7
    const six = settleDailies([
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
      '2026-09-06',
    ])
    expect(six.dailyStreakLength).toBe(6)
    expect(six.unlocked).toEqual([])
  })
})

describe('跨局进度：只增不减，刷新前后逐字节同形', () => {
  test('几局累积起来：赢过的模式、最高方块、最高合并数各按各的来', () => {
    let current = applyRunToAchievements(
      null,
      facts({ modeId: 'classic', reachedTarget: true, highestTile: 2048, merges: 60 })
    ).progress
    current = applyRunToAchievements(
      current,
      facts({ modeId: 'fibonacci', highestTile: 1024, merges: 12 })
    ).progress
    current = applyRunToAchievements(
      current,
      facts({ modeId: 'fibonacci', reachedTarget: true, highestTile: 4096, merges: 150 })
    ).progress
    expect(current.modesWon).toEqual(['classic', 'fibonacci'])
    expect(current.highestTile).toBe(4096)
    expect(current.bestMerges).toBe(150)
    expect(current.unlocked).toEqual(['first-win', 'tile-4096'])
  })

  test('更差的一局拉不动任何一项（最大值 / 并集语义）', () => {
    const previous = progress({
      modesWon: ['classic'],
      highestTile: 4096,
      bestMerges: 300,
      unlocked: ['first-win', 'tile-4096', 'merge-machine'],
    })
    const next = applyRunToAchievements(
      previous,
      facts({ modeId: 'walls', reachedTarget: false, highestTile: 8, merges: 3 })
    ).progress
    expect(next.modesWon).toEqual(['classic'])
    expect(next.highestTile).toBe(4096)
    expect(next.bestMerges).toBe(300)
    // 已解锁的成就**不会**因为一局差劲而收回
    expect(next.unlocked).toEqual(['first-win', 'tile-4096', 'merge-machine'])
  })

  test('同一个结算递两次：进度逐字节相同，第二次没有任何新解锁', () => {
    const once = applyRunToAchievements(null, facts({ reachedTarget: true, highestTile: 8192 }))
    const twice = applyRunToAchievements(once.progress, facts({ reachedTarget: true, highestTile: 8192 }))
    expect(twice.progress).toEqual(once.progress)
    expect(twice.unlocked).toEqual([])
  })

  test('unlocked 的次序恒等于 ACHIEVEMENTS 的次序', () => {
    // 倒着递：先 8192 再首胜，落库的次序仍按注册表——刷新前后逐字节可比
    let current = applyRunToAchievements(null, facts({ highestTile: 8192 })).progress
    current = applyRunToAchievements(current, facts({ reachedTarget: true })).progress
    // 这一局把 8192 与首胜一起解锁；其余四个（mode-collector / quick-hand / daily-stand /
    // merge-machine）一个都没够上。落库次序按 ACHIEVEMENTS，与解锁先后无关
    expect(current.unlocked).toEqual(['first-win', 'tile-4096', 'tile-8192'])
  })

  test('一次结算可能同时解锁好几个', () => {
    const all = applyRunToAchievements(
      progress({ modesWon: ['classic', 'fibonacci', 'big-board', 'walls', 'daily'] }),
      facts({ modeId: 'time-attack', reachedTarget: true, highestTile: 8192, merges: 250, score: 20001 })
    )
    expect(all.unlocked).toEqual([
      'first-win',
      'mode-collector',
      'tile-4096',
      'tile-8192',
      'quick-hand',
      'merge-machine',
    ])
    expect(all.progress.unlocked).toEqual([
      'first-win',
      'mode-collector',
      'tile-4096',
      'tile-8192',
      'quick-hand',
      'merge-machine',
    ])
  })
})

describe('每日坚守的日期边界', () => {
  test('同一天再结一局：链条停在原地，不推进也不重来', () => {
    const twice = settleDailies(['2026-09-01', '2026-09-01'])
    expect(twice.dailyStreakLength).toBe(1)
    expect(twice.dailyStreakDate).toBe('2026-09-01')
    // 一天里打几局都算「这一天结算过」：「连续 7 天」数的是日期，不是局数
    const thrice = settleDailies(['2026-09-01', '2026-09-01', '2026-09-01', '2026-09-02'])
    expect(thrice.dailyStreakLength).toBe(2)
  })

  test('隔一天 = 断档：从断档那天重新数 1', () => {
    // N 与 N+2 之间空着一天，「连续」就断了。这是字面意思，没有中间态可选
    const gapped = settleDailies(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-05'])
    expect(gapped.dailyStreakLength).toBe(1)
    expect(gapped.dailyStreakDate).toBe('2026-09-05')
  })

  test('差得更多同样断，且断之前攒的长度不算数', () => {
    const far = settleDailies(['2026-08-01', '2026-08-02', '2026-09-30'])
    expect(far.dailyStreakLength).toBe(1)
  })

  test('别的模式不推进也不打断链条', () => {
    // 中间打一局经典：链条原地不动
    let current = settleDailies(['2026-09-01', '2026-09-02'])
    current = applyRunToAchievements(
      current,
      facts({ modeId: 'classic', reachedTarget: true })
    ).progress
    expect(current.dailyStreakLength).toBe(2)
    expect(current.dailyStreakDate).toBe('2026-09-02')
    // 第二天再打一局 Daily，接得上
    current = applyRunToAchievements(
      current,
      facts({ modeId: 'daily', dailyDate: '2026-09-03' })
    ).progress
    expect(current.dailyStreakLength).toBe(3)
  })

  test('跨月与跨年也算连续：日期差是按天算的，不是按字符串', () => {
    const day = (date: string): number => {
      const value = utcDayNumberOf(date)
      if (value === null) throw new Error(`形状不对：${date}`)
      return value
    }
    expect(day('2026-10-01')).toBe(day('2026-09-30') + 1)
    expect(day('2027-01-01')).toBe(day('2026-12-31') + 1)
    // 闰年：2028 是闰年，2 月 29 存在
    expect(day('2028-03-01')).toBe(day('2028-02-29') + 1)
    // 形状不对认不出来：返回 null，由调用方按「无法比较」处理
    expect(utcDayNumberOf('2026-9-6')).toBeNull()
  })

  test('断档之后重新攒满 7 天，仍然可以解锁', () => {
    // 断过一次，再连 7 天：链条从 1 数到 7，成就照旧解锁
    const dates = [
      '2026-09-01',
      '2026-09-05', // 断
      '2026-09-05',
      '2026-09-06',
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
      '2026-09-11',
    ]
    const again = settleDailies(dates)
    expect(again.dailyStreakLength).toBe(7)
    expect(again.unlocked).toEqual(['daily-stand'])
  })
})

describe('结算接线：事实从结算载荷带过来', () => {
  const RUN_START = Date.UTC(2026, 8, 26, 11, 30)
  const SETTLE_AT = Date.UTC(2026, 8, 26, 12)

  /** 一副第 0 行与第 3 行各有一个相邻相等对的 4×4 局面 */
  function opening(): GameState {
    return stateWithBoard(TWO_PAIRS, 7)
  }

  test('结算载荷带着合并次数与 Daily 日期，成就按它们判', () => {
    const settlement = settlementOf(
      move(opening(), 'left').state,
      'material',
      RUN_START,
      SETTLE_AT,
      [opening()],
      '2026-09-26'
    )
    // 沿路径数出来：这一步合并了 2 对（第 0 行与第 3 行各一对）
    expect(settlement.merges).toBe(2)
    expect(settlement.dailyDate).toBe('2026-09-26')
    const outcome = applyRunToStats(null, settlement)
    expect(outcome.stats.achievements.bestMerges).toBe(2)
    expect(outcome.stats.achievements.dailyStreakDate).toBe('2026-09-26')
    expect(outcome.stats.achievements.dailyStreakLength).toBe(1)
  })

  test('结算只执行一次：同一个对象原样返回，第二次没有新解锁', () => {
    const settlement = settlementOf(
      move(opening(), 'left').state,
      'material',
      RUN_START,
      SETTLE_AT,
      [opening()],
      null
    )
    const first = applyRunToStats(null, settlement)
    const second = applyRunToStats(first.stats, settlement)
    // 为什么不能只写 toEqual：把这一行重建一遍、每个字段都一样，toEqual 照样过；
    // 而这里要断的是「第二次落库的记录与第一次是同一个东西」——计数与进度都没有被
    // 第二次写入碰过。深相等证不了「什么都没变」（T13 的评审立下的规矩）
    expect(second.stats).toBe(first.stats)
    expect(second.unlocked).toEqual([])
  })
})

describe('成就进度的形状判据：拒绝，而不是静默重置', () => {
  test('没存过不是错：T17 时代的 stats 没有这个字段，按「还没有进度」收', () => {
    expect(decodeAchievementProgress(null)).toEqual({ kind: 'absent' })
    expect(decodeAchievementProgress(undefined)).toEqual({ kind: 'absent' })
  })

  test('正常的一份进度过得去，七个字段一起交出来', () => {
    const parsed = decodeAchievementProgress({
      unlocked: ['first-win'],
      modesWon: ['classic'],
      highestTile: 4096,
      bestMerges: 200,
      bestTimeAttackScore: 20001,
      dailyStreakDate: '2026-09-07',
      dailyStreakLength: 7,
    })
    expect(parsed.kind).toBe('ok')
    if (parsed.kind !== 'ok') return
    expect(parsed.progress.unlocked).toEqual(['first-win'])
    expect(parsed.progress.modesWon).toEqual(['classic'])
  })

  const broken: ReadonlyArray<[string, () => unknown]> = [
    ['整个进度是数组', () => []],
    ['整个进度是字符串', () => 'achievements'],
    ['unlocked 不是数组', () => ({ ...emptyAchievementProgress(), unlocked: 'first-win' })],
    ['unlocked 里混进不认识的 id', () => ({ ...emptyAchievementProgress(), unlocked: ['perfect-run'] })],
    ['modesWon 里混进不认识的模式', () => ({ ...emptyAchievementProgress(), modesWon: ['aero'] })],
    ['modesWon 不是数组', () => ({ ...emptyAchievementProgress(), modesWon: 'classic' })],
    ['highestTile 是负数', () => ({ ...emptyAchievementProgress(), highestTile: -1 })],
    ['highestTile 是小数', () => ({ ...emptyAchievementProgress(), highestTile: 1.5 })],
    ['bestMerges 是字符串', () => ({ ...emptyAchievementProgress(), bestMerges: '200' })],
    ['bestTimeAttackScore 是 NaN', () => ({ ...emptyAchievementProgress(), bestTimeAttackScore: Number.NaN })],
    ['dailyStreakDate 形状不对', () => ({ ...emptyAchievementProgress(), dailyStreakDate: '2026-9-6' })],
    ['dailyStreakDate 是数字', () => ({ ...emptyAchievementProgress(), dailyStreakDate: 20260906 })],
    ['dailyStreakLength 是负数', () => ({ ...emptyAchievementProgress(), dailyStreakLength: -1 })],
    // 缺一个字段：这份数据来自另一种形状。猜一个默认值会造出「解锁了一半成就」的假进度
    ['缺 unlocked', () => { const p = emptyAchievementProgress() as unknown as Record<string, unknown>; delete p.unlocked; return p }],
    ['缺 dailyStreakLength', () => { const p = emptyAchievementProgress() as unknown as Record<string, unknown>; delete p.dailyStreakLength; return p }],
  ]

  test.each(broken)('%s：按形状拒', (_name, make) => {
    expect(decodeAchievementProgress(make()).kind).toBe('rejected')
  })

  test('六个模式一个都不能少：注册表是唯一真话', () => {
    // 收藏家的目标按 MODES 的长度算：加一个模式就得赢七个，不写死 6
    expect(MODES).toHaveLength(6)
    expect(ACHIEVEMENTS).toHaveLength(7)
  })
})
