import { describe, expect, test } from 'vitest'
import type { EndReason } from '../../src/shared/types'
import { resultCardLine, type CardLineFacts } from '../../src/renderer/components/resultCardLine'

/**
 * 卡片那一行（T31 · 父规格的架构决策 17：**一个座位，两处用法**）。
 *
 * 它是纯函数：本局 facts 喂进去，一句话（或 null）出来。所以五种结束原因、三种档位、
 * 以及「彩蛋那一局优先」全都能在 node 里逐条钉住——尤其是 **`abandoned` 那一句**：
 * 活跃局点「新游戏」会立刻开新局，界面上从来露不出放弃那一档（T04 起就是这样），
 * 于是「放弃那次的罪名是弃甲曳兵」只能在这一层被证明，浏览器里没有那个时刻。
 *
 * 每一句都整句断死，不只断「含有某个词」：这句话会原样出现在玩家眼前，而它的数字
 * 全部来自入参——断整句就是同时断「没有写死任何数值」。
 */

/** 一副好认的本局事实：四个数字两两不同，于是「哪一个被漏掉」一眼看得出来 */
function facts(overrides: Partial<CardLineFacts> = {}): CardLineFacts {
  return {
    tier: 'stuck',
    endReason: null,
    score: 1480,
    highestTile: 512,
    merges: 37,
    moves: 201,
    wish: false,
    ...overrides,
  }
}

/** 同一份账。四句话共用它——这是「一个机制」最直白的那一处 */
const LEDGER = '1480 分，最高 512，合并 37 次，201 步'

describe('死局：还没结算与已结算是同一句', () => {
  test('死局那一刻（stuck，还没结算）', () => {
    expect(resultCardLine(facts())).toBe(`这一局是自己走完的：${LEDGER}`)
  })

  test('死局收工之后（ended + deadlock）：一个字都不变', () => {
    const stuck = resultCardLine(facts())
    const settled = resultCardLine(facts({ tier: 'ended', endReason: 'deadlock' }))
    // 结算不改变这一局是怎么走的——两句话逐字节相同。换成两句就说明写成两套了
    expect(settled).toBe(stuck)
  })
})

describe('另外三种结束方式：四种 endReason 各有一句', () => {
  test('超时：钟比棋盘先满', () => {
    expect(resultCardLine(facts({ tier: 'ended', endReason: 'timeout' }))).toBe(
      `钟比棋盘先满：${LEDGER}`
    )
  })

  test('放弃：死因是「弃甲曳兵」', () => {
    expect(resultCardLine(facts({ tier: 'ended', endReason: 'abandoned' }))).toBe(
      `弃甲曳兵：${LEDGER}`
    )
    // 它不是卡片那一句「主动放弃了本局」的换说：那一句在 runEndLabel 里，说的是事实
    expect(resultCardLine(facts({ tier: 'ended', endReason: 'abandoned' }))).not.toContain(
      '主动放弃'
    )
  })

  test('赢着收工：赢下的一局也有账', () => {
    expect(resultCardLine(facts({ tier: 'ended', endReason: 'won' }))).toBe(
      `赢下的一局：${LEDGER}`
    )
  })
})

describe('「没什么可说」的两处边界', () => {
  test('里程碑那一层（tier won）：这一局还活着，没有结束方式可言', () => {
    expect(resultCardLine(facts({ tier: 'won', endReason: null }))).toBeNull()
  })

  test('已结算却没有原因（不可达，但必须给出一句话而不是编一句）', () => {
    // settle / abandon / tick 三条进 ended 的路都写原因，所以这个状态不该出现；
    // 真出现时说「没什么可说」，比现编一句结束方式诚实
    expect(resultCardLine(facts({ tier: 'ended', endReason: null }))).toBeNull()
  })
})

describe('道通成魔那一局：梗压在一切终局之上', () => {
  test('三种档位下都是同一句梗', () => {
    const wish = `一念收下了，账照算：${LEDGER}`
    expect(resultCardLine(facts({ wish: true }))).toBe(wish)
    expect(resultCardLine(facts({ tier: 'won', wish: true }))).toBe(wish)
    expect(resultCardLine(facts({ tier: 'ended', endReason: 'deadlock', wish: true }))).toBe(wish)
    expect(resultCardLine(facts({ tier: 'ended', endReason: 'timeout', wish: true }))).toBe(wish)
  })

  test('梗优先，账一句都不少：彩蛋那一局死局收场时说的还是那句梗', () => {
    const line = resultCardLine(facts({ tier: 'ended', endReason: 'deadlock', wish: true }))
    expect(line).toContain('一念收下了')
    // 而四个数字照旧报——彩蛋不收钱，账也没被抹掉
    expect(line).toContain(LEDGER)
  })
})

describe('数字全部来自入参：没有一个是写死的', () => {
  test('换一副事实，四个数字逐个跟着换', () => {
    const line = resultCardLine(
      facts({ score: 4242, highestTile: 2048, merges: 96, moves: 1500 })
    )
    expect(line).toBe('这一局是自己走完的：4242 分，最高 2048，合并 96 次，1500 步')
  })

  test('一局什么都没干：四个零也说一句话', () => {
    expect(resultCardLine(facts({ score: 0, highestTile: 2, merges: 0, moves: 0 }))).toBe(
      '这一局是自己走完的：0 分，最高 2，合并 0 次，0 步'
    )
  })
})

describe('穷尽性：三档 × 五种结束原因都给出结论，一个都不抛', () => {
  test('每一种组合都往返一次', () => {
    const tiers = ['won', 'stuck', 'ended'] as const
    const reasons: (EndReason | null)[] = [null, 'deadlock', 'timeout', 'abandoned', 'won']
    for (const tier of tiers) {
      for (const endReason of reasons) {
        const line = resultCardLine(facts({ tier, endReason }))
        expect(typeof line === 'string' || line === null).toBe(true)
        // 有话说的那些，账都在句子里——没有「给了 tier 却漏数字」的半句
        if (line !== null) expect(line).toContain('1480 分，最高 512')
      }
    }
  })
})
