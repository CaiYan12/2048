import { describe, expect, test } from 'vitest'
import type { CellSpec } from './support'
import type { GameState } from '../../src/shared/types'
import { MODES } from '../../src/shared/modes'
import { move, swap } from '../../src/game/engine'
import {
  ACHIEVEMENTS,
  countMergesAlongPath,
  FIRST_MERGE_COUNT,
  mergeCountBetween,
  MERGE_MACHINE_COUNT,
  QUICK_HAND_SCORE,
  STYLE_TRAVELLER_SWITCHES,
  TILE_4096,
  TILE_8192,
  unlockedAchievements,
  type RunFacts,
} from '../../src/game/achievements'
import { stateWithBoard } from './support'

/**
 * 成就的单局判定（ADR-0007）。
 *
 * 判定是纯函数：本局事实喂进去，解锁集合算出来，没有任何 DOM、没有 indexedDB、没有
 * Date。于是每条成就都按「阈值下 / 正好 / 阈值上」钉住，而且钉住它是**派生**的——
 * 同一份事实永远给出同一份集合，没有任何累积入参能改变它。
 *
 * 跨局的那两条（模式收藏家、每日坚守）已按 ADR-0007 退休：注册表里没有它们的行，
 * 界面上也没有占位，所以这里连「它不解锁」都不必断言——它们不存在。
 */

/**
 * 本局事实的基准。每个用例按需改一两个字段。
 *
 * `merges: 0` 是**刻意的中性基线**：一旦默认给它一个正数，每个用例都会顺带拿到
 * 「首次合并」，于是 `toEqual([...])` 这类断言就再也分不清自己在验哪一条。
 * 要验那一条的用例自己把 merges 摆出来（见「首次合并」那一组）。
 */
function facts(overrides: Partial<RunFacts> = {}): RunFacts {
  return {
    modeId: 'classic',
    score: 4242,
    highestTile: 1024,
    reachedTarget: false,
    merges: 0,
    // T19 的风格切换次数：这里默认没切过，风格旅行者的用例按需覆盖它
    styleSwitches: 0,
    ...overrides,
  }
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

describe('注册表：七个成就，全部是「本局」口径', () => {
  test('恰好七个，次序恒定，跨局的那两条一行都没有', () => {
    // 撤销了模式的收藏家与每日坚守：它们的条件是「赢遍六个模式」「连续七天」，
    // 单局内无法自证，于是连占位都没有（ADR-0007）
    expect(ACHIEVEMENTS.map((item) => item.id)).toEqual([
      'first-merge',
      'first-win',
      'tile-4096',
      'tile-8192',
      'quick-hand',
      'merge-machine',
      'style-traveller',
    ])
    expect(ACHIEVEMENTS).toHaveLength(7)
    // 六个模式还在（模式轴没变），只是没有任何成就依赖「赢遍它们」
    expect(MODES).toHaveLength(6)
  })

  test('每一条的条件文案都自称「本局」——它必须与实现同一个口径', () => {
    for (const item of ACHIEVEMENTS) {
      expect(item.condition, `${item.id} 的条件没有说是本局`).toContain('本局')
    }
    expect(ACHIEVEMENTS.find((item) => item.id === 'style-traveller')?.condition).toBe(
      '本局切换 5 次以上风格'
    )
    expect(ACHIEVEMENTS.find((item) => item.id === 'tile-4096')?.label).toBe('4096')
    expect(ACHIEVEMENTS.find((item) => item.id === 'tile-8192')?.label).toBe('大数猎人')
  })

  test('阈值与界面说的那几个数完全一致', () => {
    expect(TILE_4096).toBe(4096)
    expect(TILE_8192).toBe(8192)
    expect(QUICK_HAND_SCORE).toBe(20000)
    expect(MERGE_MACHINE_COUNT).toBe(200)
    expect(STYLE_TRAVELLER_SWITCHES).toBe(5)
  })
})

describe('七个成就：阈值下 / 正好 / 阈值上', () => {
  test('首次合并：本局第一次合并就解锁（阈值 1，全场最早的那一个）', () => {
    expect(FIRST_MERGE_COUNT).toBe(1)
    expect(unlockedAchievements(facts({ merges: 0 }))).toEqual([])
    expect(unlockedAchievements(facts({ merges: 1 }))).toEqual(['first-merge'])
    expect(unlockedAchievements(facts({ merges: 2 }))).toEqual(['first-merge'])
    // 一局开局、一局死局收工（没有任何合并）：都不解锁
    expect(unlockedAchievements(facts({ merges: 0, reachedTarget: true }))).toEqual(['first-win'])
  })

  test('首胜：本局达标就解锁，没达标不解锁', () => {
    expect(unlockedAchievements(facts({ reachedTarget: true }))).toContain('first-win')
    expect(unlockedAchievements(facts({ reachedTarget: false }))).toEqual([])
    // 判据是 reachedTarget 而不是「结束原因是 won」：达标后继续玩到死局再收工也算赢过
    // （与 stats.wins 同一把尺子）
  })

  test('4096：正好 4096 解锁，2048 不解锁', () => {
    expect(unlockedAchievements(facts({ highestTile: 4096 }))).toEqual(['tile-4096'])
    expect(unlockedAchievements(facts({ highestTile: 2048 }))).toEqual([])
  })

  test('大数猎人：8192 解锁，且它顺带解锁 4096', () => {
    expect(unlockedAchievements(facts({ highestTile: 8192 }))).toEqual([
      'tile-4096',
      'tile-8192',
    ])
    // 4096 只够解锁 4096：最高方块再大也翻不回去
    expect(unlockedAchievements(facts({ highestTile: 4096 }))).toEqual(['tile-4096'])
  })

  test('快手：Time Attack 本局**超过** 20000 分解锁，等于 20000 不解', () => {
    expect(
      unlockedAchievements(facts({ modeId: 'time-attack', score: 20001 }))
    ).toEqual(['quick-hand'])
    expect(unlockedAchievements(facts({ modeId: 'time-attack', score: 20000 }))).toEqual([])
    // 别的模式打再高也不算：这个成就只认 Time Attack 的单局分
    expect(unlockedAchievements(facts({ modeId: 'classic', score: 99999 }))).toEqual([])
  })

  test('合并机器：本局 200 次解锁，199 不解，201 照旧解锁', () => {
    // 199 与 200 都已 >= 1，所以这两档顺带拿到「首次合并」（阈值 1 的成就）
    expect(unlockedAchievements(facts({ merges: 199 }))).toEqual(['first-merge'])
    expect(unlockedAchievements(facts({ merges: 200 }))).toEqual(['first-merge', 'merge-machine'])
    expect(unlockedAchievements(facts({ merges: 201 }))).toEqual(['first-merge', 'merge-machine'])
  })

  test('风格旅行者：4 次不解锁，5 次解锁，6 次也解锁（阈值那一刀切在 5）', () => {
    expect(unlockedAchievements(facts({ styleSwitches: 4 }))).toEqual([])
    expect(unlockedAchievements(facts({ styleSwitches: 5 }))).toEqual(['style-traveller'])
    expect(unlockedAchievements(facts({ styleSwitches: 6 }))).toEqual(['style-traveller'])
    // 一次都没换过当然不解锁
    expect(unlockedAchievements(facts({ styleSwitches: 0 }))).toEqual([])
  })
})

describe('派生：同一份事实永远给出同一份集合', () => {
  test('连着算三遍逐字节相同，集合次序恒等于 ACHIEVEMENTS 的次序', () => {
    const run = facts({
      reachedTarget: true,
      highestTile: 8192,
      modeId: 'time-attack',
      score: 30000,
      merges: 250,
      styleSwitches: 5,
    })
    const once = unlockedAchievements(run)
    expect(once).toEqual([
      'first-merge',
      'first-win',
      'tile-4096',
      'tile-8192',
      'quick-hand',
      'merge-machine',
      'style-traveller',
    ])
    expect(unlockedAchievements(run)).toEqual(once)
    expect(unlockedAchievements(run)).toEqual(once)
    // 次序由注册表定，不由「哪一条先满足」定
    const registryOrder = ACHIEVEMENTS.map((item) => item.id)
    const positions = once.map((id) => registryOrder.indexOf(id))
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  test('集合只认这一份事实：没有任何累积入参能改变它', () => {
    // 事实里没有一个「上一局」的字段——所以「别人打过 8192」这件事影响不到这一局
    const factsKeys = Object.keys(facts()).sort()
    expect(factsKeys).toEqual([
      'highestTile',
      'merges',
      'modeId',
      'reachedTarget',
      'score',
      'styleSwitches',
    ])
  })

  test('事实退回去，集合跟着退回去（撤销要能收回，除了那一个例外）', () => {
    const won = unlockedAchievements(facts({ reachedTarget: true }))
    expect(won).toContain('first-win')
    // 事实里 reachedTarget 变回 false：集合不再有首胜——派生的定义就是这一条
    expect(unlockedAchievements(facts({ reachedTarget: false }))).not.toContain('first-win')
    expect(unlockedAchievements(facts({ merges: 200 }))).toContain('merge-machine')
    expect(unlockedAchievements(facts({ merges: 199 }))).not.toContain('merge-machine')
  })
})

describe('合并次数：数「消失的方块身份」', () => {
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

  test('同一对状态两个方向算一遍，得到的正是同一步加进去 / 退回去的那个数', () => {
    // 宿主增量维护本局合并数靠的就是这一条：走一步加 `(before, after)`，撤一步减
    // `(before, after)`——同一对状态、同一个数，所以来回走多少遍都不会漂
    const before = stateWithBoard(TWO_PAIRS, 7)
    const after = move(before, 'left').state
    expect(mergeCountBetween(before, after)).toBe(2)
    expect(mergeCountBetween(before, after)).toBe(2)
    // 反过来（after → before）**不是**同一个数：回退方向上「重新出现」的那几个身份里
    // 混着对方生成的那一枚，所以合并次数这个度量是有方向的，只能沿同一对状态同向取
    expect(mergeCountBetween(after, before)).not.toBe(mergeCountBetween(before, after))
  })
})

describe('沿撤销路径累计：恢复一局时建立基线', () => {
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

  test('路径摘掉一步就少算一步：只数当前路径', () => {
    const first = stateWithBoard(TWO_PAIRS, 7)
    const second = move(first, 'left').state
    const third = move(second, 'left').state
    // 撤销把第二步从路径上摘掉之后，累计只剩第一步那 2 对
    expect(countMergesAlongPath([first, second], third)).toBe(4)
    expect(countMergesAlongPath([first], second)).toBe(2)
  })

  test('合并次数可从持久化状态推导：整条路径过一遍 JSON 一个都不少', () => {
    // 撤销路径以 GameState 全文的形式存在 history 桶里（T16），所以「合并了几次」
    // 必须能从那一份读回来——这是刷新之后合并机器不被抹掉的唯一依据
    const first = stateWithBoard(TWO_PAIRS, 7)
    const second = move(first, 'left').state
    const third = move(second, 'left').state
    const fromDisk = JSON.parse(JSON.stringify([first, second, third])) as GameState[]
    expect(countMergesAlongPath(fromDisk.slice(0, 2), fromDisk[2])).toBe(4)
  })

  test('开局就恢复（没有历史）：0 次合并', () => {
    const opening = stateWithBoard(ONE_PAIR, 7)
    expect(countMergesAlongPath([], opening)).toBe(0)
  })
})