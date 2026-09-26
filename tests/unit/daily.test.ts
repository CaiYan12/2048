import { describe, expect, test } from 'vitest'
import { createGame, move } from '../../src/game/engine'
import { getMode } from '../../src/shared/modes'
import { seedFromUtcDate } from '../../src/shared/rng'
import type { Direction } from '../../src/shared/types'
import { tilesOf, valueGrid } from './support'

/**
 * T08 Daily 模式（UTC 日期 → 种子）
 *
 * Daily 与 Classic 的**规则完全相同**（4×4、2 的幂、[2,4] 90/10、目标 2048、无墙、
 * 无时限），所以这里不重复 T03 的规则断言；要钉住的是它唯一的不同：种子从哪来。
 *
 * 三条主线：
 *   1. 哈希本身——日期串短而高度规则（`2026-09-26` 与 `2026-09-27` 只差一个字符），
 *      弱哈希会让相邻日期的种子只差一两个比特，于是全球玩家每天拿到几乎同一张盘。
 *      「相邻日期必须离得远」是本模式唯一不能有的失败，所以它被显式测试，不是靠祝福。
 *   2. 不变式 A——同日期同输入 → 同盘，且本地时区进不来。
 *   3. 不变式 B——跨过 UTC 零点：已开的局保持原种子，新局才换题。
 *
 * 全部经公开面（seedFromUtcDate / createGame / move）驱动，不测私有助手。
 */

/** 连续日期窗口的起点：2026-01-01T00:00:00Z */
const WINDOW_START = Date.UTC(2026, 0, 1)

/** 生成连续 UTC 日期串。测试自己按 UTC 造串，不依赖运行机器的时区 */
function utcDates(count: number, startMs = WINDOW_START): string[] {
  return Array.from(
    { length: count },
    (_, index) => new Date(startMs + index * 86400000).toISOString().slice(0, 10)
  )
}

/** 两个 uint32 按位不同的位数（0–32）。雪崩效应的度量 */
function bitDistance(a: number, b: number): number {
  let bits = (a ^ b) >>> 0
  let count = 0
  while (bits !== 0) {
    count += bits & 1
    bits >>>= 1
  }
  return count
}

/** 开局盘面的指纹：两块方块各自的「行,列=值」。用来比较两天的题是不是同一张 */
function signature(rows: ReturnType<typeof valueGrid>): string {
  const tiles: string[] = []
  rows.forEach((row, rowIndex) =>
    row.forEach((cell, colIndex) => {
      if (cell !== null) tiles.push(`${rowIndex},${colIndex}=${cell}`)
    })
  )
  return tiles.sort().join(' | ')
}

/** 四个方向轮着按：一段既会滑动也会生成的确定序列 */
const MOVE_CYCLE: readonly Direction[] = ['left', 'up', 'right', 'down']

describe('种子推导：seedFromUtcDate', () => {
  /**
   * 这些数是**契约**，不是「跑出来是多少就写多少」的快照。
   *
   * 换哈希会静默改掉每一个 Daily 开局：昨天玩过的题、下周的题、以及所有靠
   * 「同日期同盘」建立的分享与比较，全部无声变样。所以把若干固定日期的种子值
   * 钉死在这里——哈希一改，这条立刻红，不给「无声换题」留门。
   */
  test('固定日期的种子值被钉死：换哈希会让每一个 Daily 开局静默变样', () => {
    expect(seedFromUtcDate('1970-01-01')).toBe(2754922661)
    expect(seedFromUtcDate('2000-01-01')).toBe(2489979977)
    // 闰日也要在表里：日期串合法性与闰年无关，但它是最容易在改动中被顺手改错的输入
    expect(seedFromUtcDate('2024-02-29')).toBe(3735184193)
    // 相邻四天：差异必须看起来毫无规律，这也是「不相关」的直观快照
    expect(seedFromUtcDate('2026-09-25')).toBe(1873511710)
    expect(seedFromUtcDate('2026-09-26')).toBe(2167566727)
    expect(seedFromUtcDate('2026-09-27')).toBe(3960550642)
    expect(seedFromUtcDate('2026-09-28')).toBe(2381867363)
    // 跨月、跨年：日期串里多个字符同时变的情形
    expect(seedFromUtcDate('2026-10-01')).toBe(3032859102)
    expect(seedFromUtcDate('2026-12-31')).toBe(917404904)
  })

  test('返回值是 uint32 整数：可以直接喂给 createRng', () => {
    for (const date of utcDates(60)) {
      const seed = seedFromUtcDate(date)
      expect(Number.isInteger(seed), date).toBe(true)
      expect(seed, date).toBeGreaterThanOrEqual(0)
      // mulberry32 内部按无符号 32 位走，所以这里就必须已经收进无符号范围
      expect(seed, date).toBeLessThan(0x100000000)
    }
  })

  /**
   * 这是本模式唯一不能有的失败的具体度量。
   *
   * 32 位里差多少比特：完全随机的两个数平均差 16 位。实测过三种写法的差距——
   *   日期当数字（20260926）   平均 2.09 位
   *   只用 FNV-1a（无收尾）   平均 10.12 位
   *   FNV-1a + fmix32（本实现）平均 16.03 位
   * 断言卡在 14 位（过半）：前两种形态直接红，本实现有余量。
   */
  test('相邻日期的种子必须离得远：一年 365 对平均相差过半比特', () => {
    const dates = utcDates(366)
    const seeds = dates.map(seedFromUtcDate)

    const distances: number[] = []
    for (let index = 1; index < seeds.length; index += 1) {
      distances.push(bitDistance(seeds[index - 1], seeds[index]))
    }
    const average = distances.reduce((sum, value) => sum + value, 0) / distances.length
    const closest = Math.min(...distances)

    expect(distances).toHaveLength(365)
    // 「几乎相同」的直接反义：没有任何一对相邻日期只差几个比特
    expect(closest, `最近的一对只差 ${closest} 位`).toBeGreaterThanOrEqual(8)
    expect(average, `平均只差 ${average.toFixed(2)} 位`).toBeGreaterThanOrEqual(14)
    // 相邻日期之间一个重复种子都不许有（同种子 = 同题，玩家连打两天同一盘）
    expect(new Set(seeds).size).toBe(seeds.length)
  })

  /**
   * 单比特扰动也要扩散。`'6'`(0x36) 与 `'7'`(0x37) 只差最低位，所以相邻日期
   * 在输入侧就是单比特差；输出侧必须炸开半个字。
   *
   * 注意这条**不**区分「有收尾」与「无收尾」：FNV-1a 自身对单字符差已经能给出
   * 平均 15 位。真正区分它们的是上一条（相邻日期串只差一个字符时，FNV-1a 的
   * 累加器只把这一处差往后传一位，平均只剩 10 位）。所以两条都要在。
   */
  test('日期串里翻一个比特，也要扩散到半个字', () => {
    const samples = ['2026-09-26', '2026-09-25', '2026-08-27', '2026-09-17', '2025-12-31']
    const distances: number[] = []
    for (const date of samples) {
      for (let index = 0; index < date.length; index += 1) {
        for (let bit = 0; bit < 8; bit += 1) {
          const flipped =
            date.slice(0, index) +
            String.fromCharCode(date.charCodeAt(index) ^ (1 << bit)) +
            date.slice(index + 1)
          if (flipped === date) continue
          distances.push(bitDistance(seedFromUtcDate(date), seedFromUtcDate(flipped)))
        }
      }
    }

    const average = distances.reduce((sum, value) => sum + value, 0) / distances.length
    expect(distances.length).toBeGreaterThan(300)
    expect(average, `平均只差 ${average.toFixed(2)} 位`).toBeGreaterThanOrEqual(14)
  })

  test('同一串日期只给同一粒种子：函数没有任何第二个入参', () => {
    const date = '2026-09-26'
    // 重复调用与独立调用结果一致：没有隐藏的计数器、没有读钟、没有 Math.random。
    // 「时区变化不改变结果」在这条上成立——它只吃那一个字符串（见不变式 A 的用例）
    expect(seedFromUtcDate(date)).toBe(seedFromUtcDate(date))
    expect(seedFromUtcDate(date)).toBe(seedFromUtcDate('2026-09-26'))
    // 日期串是大小写敏感的原样输入：函数不做任何归一化，形状由调用方保证
    expect(seedFromUtcDate('2026-09-26')).not.toBe(seedFromUtcDate('2026-09-2'))
  })
})

describe('开局棋盘', () => {
  /**
   * 逐格钉死。两用：既是确定性证据，也是 e2e 期望值的出处
   * （tests/e2e/daily.spec.ts 用固定时钟把 date 钉在 2026-09-26，读的就是这张盘）。
   */
  test('固定日期的开局棋盘逐格确定', () => {
    expect(valueGrid(createGame('daily', seedFromUtcDate('2026-09-26')).board)).toEqual([
      [null, null, null, null],
      [2, null, null, null],
      [null, null, null, null],
      [2, null, null, null],
    ])
    expect(valueGrid(createGame('daily', seedFromUtcDate('2026-09-27')).board)).toEqual([
      [null, 2, null, null],
      [null, null, null, null],
      [null, null, null, null],
      [2, null, null, null],
    ])
    expect(valueGrid(createGame('daily', seedFromUtcDate('2026-10-01')).board)).toEqual([
      [null, null, null, 2],
      [null, null, null, null],
      [null, null, null, null],
      [null, 2, null, null],
    ])
    // 两块的身份按生成顺序发：1 号先落，2 号后落
    expect(tilesOf(createGame('daily', seedFromUtcDate('2026-09-26')).board)).toEqual([
      { id: 1, value: 2 },
      { id: 2, value: 2 },
    ])
  })

  test('开局只用 {2,4} 且两块分居两格：60 个连续日期逐一核对', () => {
    const dates = utcDates(60, Date.UTC(2026, 8, 20))
    let low = 0
    let high = 0

    for (const date of dates) {
      const board = createGame('daily', seedFromUtcDate(date)).board
      const filled: [number, number][] = []
      for (let row = 0; row < board.length; row += 1) {
        for (let col = 0; col < board[row].length; col += 1) {
          const cell = board[row][col]
          if (cell === null || cell === 'wall') continue
          // mode-contract §1：生成值只有 [2,4] 两档（权重 90/10 由契约用例管）
          expect([2, 4], `${date} 的 (${row},${col})`).toContain(cell.value)
          if (cell.value === 2) low += 1
          else high += 1
          filled.push([row, col])
        }
      }
      expect(filled, date).toHaveLength(2)
      // 两块必须在两格不同的位置上：同格意味着两次生成互相覆盖
      expect(filled[0], date).not.toEqual(filled[1])
    }

    // 60 天 120 块里两档都出现过——若种子把日期压成极少数几个值，窗口里就会出现
    // 整片同值开局，这一条与上一条合起来才看得见
    expect(low).toBeGreaterThan(0)
    expect(high).toBeGreaterThan(0)
  })

  /**
   * 「相邻日期不给同一张盘」的加强形态：60 天里盘面必须铺得开。
   *
   * 为什么不是逐对比对相邻两天：开局盘面只有 120 种形状（16 格里挑 2 格、各配 2 或
   * 4），相邻两天撞盘的概率约 1/120——**好哈希在两个月的窗口里也会撞上一两次**
   * （本实现在三个不同起点的窗口里实测 47 / 47 / 56 张不同盘面，都撞过）。所以
   * 「相邻两天必须不同」是抛硬币，不是性质，拿它当断言会骗人。
   *
   * 真正有牙的是**系统性重题**：只吃日期串一小部分的哈希（例如只取「日」那两位）
   * 会让相隔整月的日期共用一粒种子，实测 60 天只剩 28 张不同的盘——那就是
   * 「几乎每个玩家每天打几乎同一张盘」，本模式最不能有的失败。
   */
  test('连续 60 天的开局盘面铺得开：没有哪一天在系统性重题', () => {
    const dates = utcDates(60, Date.UTC(2026, 0, 1))
    const boards = new Set(
      dates.map((date) =>
        signature(valueGrid(createGame('daily', seedFromUtcDate(date)).board))
      )
    )

    // 好哈希：47–56 / 60（差的是生日碰撞）。只取「日」：28 / 60
    expect(boards.size, `60 天只有 ${boards.size} 张不同的盘`).toBeGreaterThanOrEqual(40)
  })

  /**
   * 票的论断：Daily 与 Classic 规则完全相同，模式只改种子的来源。
   * 这条把「引擎没有为 Daily 长分支」钉成可断言的断言——同种子必须给出同一个盘、
   * 同一条随机流、同一个身份计数器。
   */
  test('Daily 与 Classic 同种子同盘：模式没有加任何规则', () => {
    for (const date of ['2026-09-26', '2026-09-27', '2026-10-01']) {
      const seed = seedFromUtcDate(date)
      const daily = createGame('daily', seed)
      const classic = createGame('classic', seed)

      expect(valueGrid(daily.board), date).toEqual(valueGrid(classic.board))
      // 不只开局一样：随机进度也落在同一个计数器上，所以之后的每一步都会一样
      expect(daily.rngState, date).toBe(classic.rngState)
      expect(daily.nextTileId, date).toBe(classic.nextTileId)
      expect(daily.initialSeed, date).toBe(seed)
      // 唯一允许的差别是身份：modeId 与界面用名
      expect(daily.modeId).toBe('daily')
      expect(classic.modeId).toBe('classic')
      // 模式声明逐字段相同（size / 合并表 / 生成值 / 目标 / 障碍 / 限时）
      expect({ ...getMode('daily'), id: '', label: '' }).toEqual({
        ...getMode('classic'),
        id: '',
        label: '',
      })
    }
  })
})

describe('不变式 A：同日期同输入 → 同盘，时区进不来', () => {
  test('同一个 UTC 日期开两局：整个状态逐字节相同', () => {
    // 两次**独立**抽题：各自重新推种子、各自开局。这才是「同日期同盘」的形态——
    // 先存一份种子再开两局只能证明引擎确定，证明不了「从日期推出种子」这件事确定。
    const first = createGame('daily', seedFromUtcDate('2026-09-26'))
    const second = createGame('daily', seedFromUtcDate('2026-09-26'))

    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
    expect(first.initialSeed).toBe(seedFromUtcDate('2026-09-26'))
    expect(first.modeId).toBe('daily')
  })

  test('40 步相同按键：两局每一步都逐字节相同', () => {
    // 同样各自独立抽题，种子先对齐再开走——整条链（日期 → 种子 → 40 步）都钉住
    const seed = seedFromUtcDate('2026-09-27')
    expect(seedFromUtcDate('2026-09-27')).toBe(seed)

    let first = createGame('daily', seed)
    let second = createGame('daily', seed)

    for (let step = 0; step < 40; step += 1) {
      const direction = MOVE_CYCLE[step % MOVE_CYCLE.length]
      const one = move(first, direction)
      const two = move(second, direction)

      expect(one.changed, `第 ${step} 步 changed`).toBe(two.changed)
      expect(one.gained, `第 ${step} 步 gained`).toBe(two.gained)
      // 逐字节：棋盘、随机进度、分数、里程碑、身份计数器、步数一个数都不许差。
      // 用 JSON 全量比对而不是只比棋盘——rngState 差一位，后面的盘迟早会分叉，
      // 而在第 40 步之前它可能还没显形
      expect(JSON.stringify(two.state), `第 ${step} 步`).toBe(JSON.stringify(one.state))

      first = one.state
      second = two.state
    }
  })

  /**
   * 时区不变的真实形态。
   *
   * 单测里改不了运行机器的时区，也不该假装能改。能钉住的是更强的那句：推导函数
   * **只吃一个 UTC 日期串**，本地时区根本不在输入里。下面三个时刻的 UTC 日期都是
   * 2026-09-26，而它们在 UTC+2 下已经算 9 月 27 日、在 UTC-5 下还是 9 月 26 日——
   * 只要调用方按 UTC 取串（toISOString 天生就是 UTC），结果完全一致。
   */
  test('时区无关：UTC 日期串是唯一入参，本地时区进不来', () => {
    const instants = [
      '2026-09-26T00:00:30Z',
      '2026-09-26T12:00:00Z',
      '2026-09-26T23:59:59Z',
    ]

    for (const instant of instants) {
      // 调用方就是这么取串的（useGameStore 的 todayUtc 与此逐字相同）
      const date = new Date(instant).toISOString().slice(0, 10)
      expect(date).toBe('2026-09-26')
      expect(seedFromUtcDate(date), instant).toBe(seedFromUtcDate('2026-09-26'))
      // 连盘面也一致：这才是玩家能看见的那句承诺
      expect(
        JSON.stringify(createGame('daily', seedFromUtcDate(date)).board),
        instant
      ).toBe(JSON.stringify(createGame('daily', seedFromUtcDate('2026-09-26')).board))
    }

    // 一秒之后 UTC 翻篇，题目就该跟着换：两侧都断言，测试才不会靠「两档都被冻住」过关
    const nextDate = new Date('2026-09-27T00:00:00Z').toISOString().slice(0, 10)
    expect(nextDate).toBe('2026-09-27')
    expect(seedFromUtcDate(nextDate)).not.toBe(seedFromUtcDate('2026-09-26'))
  })
})

describe('不变式 B：跨过 UTC 零点', () => {
  const TODAY = '2026-09-26'
  const TOMORROW = '2026-09-27'

  test('已开始的一局保持原种子：时钟翻篇后继续走，一字不差', () => {
    const todaySeed = seedFromUtcDate(TODAY)
    const tomorrowSeed = seedFromUtcDate(TOMORROW)

    // 前提：两天确实抽到不同的题。少了这一条，下面的「不变」可能只是两局都被冻住
    expect(tomorrowSeed).not.toBe(todaySeed)

    // 未被打断的那局：六步走完，逐步留快照
    let control = createGame('daily', todaySeed)
    const expected: string[] = [JSON.stringify(control)]
    for (let step = 0; step < 6; step += 1) {
      control = move(control, MOVE_CYCLE[step % MOVE_CYCLE.length]).state
      expected.push(JSON.stringify(control))
    }

    // 被打断的那局：走到第三步之后「现在」已经是第二天。新日期的种子明明算得出来，
    // 但这一局的每一步都只读 state.rngState——日期一次都没有被重新咨询过
    let crossed = createGame('daily', todaySeed)
    const actual: string[] = [JSON.stringify(crossed)]
    for (let step = 0; step < 6; step += 1) {
      if (step === 3) {
        expect(crossed.initialSeed, '跨零点时这一局还认着旧种子').toBe(todaySeed)
        expect(tomorrowSeed).not.toBe(crossed.initialSeed)
      }
      crossed = move(crossed, MOVE_CYCLE[step % MOVE_CYCLE.length]).state
      actual.push(JSON.stringify(crossed))
    }

    expect(actual).toEqual(expected)
    expect(crossed.initialSeed).toBe(todaySeed)
  })

  test('跨过零点后开新局：换题，且换的是新日期的题', () => {
    const yesterday = createGame('daily', seedFromUtcDate(TODAY))
    const fresh = createGame('daily', seedFromUtcDate(TOMORROW))

    expect(fresh.initialSeed).toBe(seedFromUtcDate(TOMORROW))
    // 逐格写死的那张开局（见「固定日期的开局棋盘逐格确定」）——不是「不同就行」，
    // 而是必须正是新日期的题
    expect(valueGrid(fresh.board)).toEqual([
      [null, 2, null, null],
      [null, null, null, null],
      [null, null, null, null],
      [2, null, null, null],
    ])
    expect(valueGrid(fresh.board)).not.toEqual(valueGrid(yesterday.board))
  })
})

/**
 * 可恢复进度：T16 的刷新续玩建立在它上面。
 *
 * Daily 的种子来自外部输入，所以「把整局状态存下来再读回去，之后每一步与从未
 * 刷新时相同」这件事必须先在这里成立——否则刷新一次就当天的题换了张脸。
 */
describe('可恢复的 PRNG 进度', () => {
  test('JSON 往返后续走：与从未中断的那局一字不差', () => {
    const seed = seedFromUtcDate('2026-09-26')
    let straight = createGame('daily', seed)
    let roundTripped = createGame('daily', seed)

    for (let step = 0; step < 20; step += 1) {
      const direction = MOVE_CYCLE[step % MOVE_CYCLE.length]
      straight = move(straight, direction).state
      // T16 的持久化就是这句话：整局状态过一遍 JSON。rngState 必须是个 plain number，
      // 否则这一趟会把随机进度丢掉
      roundTripped = move(JSON.parse(JSON.stringify(roundTripped)), direction).state
      expect(JSON.stringify(roundTripped), `第 ${step} 步`).toBe(JSON.stringify(straight))
    }

    expect(typeof straight.rngState).toBe('number')
    expect(straight.initialSeed).toBe(seed)
  })
})
