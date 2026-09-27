import { describe, expect, test } from 'vitest'
import { move, settle } from '../../src/game/engine'
import { NOW, stateWithBoard } from './support'
import { runResultAnnouncement, swapPrompt } from '../../src/renderer/components/RunAnnouncement'
import { runEndLabel } from '../../src/renderer/components/runEndLabel'
import type { GameState } from '../../src/shared/types'
import type { Coordinate } from '../../src/game/board'

/**
 * T22 的播报内容：什么算「一局的结果」、什么不算。
 *
 * 这里只测**内容**（那一句话由哪些事实组成、什么时候根本没有话），不测 live region
 * 的接线——role="status" 在 DOM 上有没有生效只有浏览器能回答，那是
 * tests/e2e/task-22-a11y.spec.ts 的事（且不被本会话执行）。
 *
 * 判据全部来自 SPEC §3.4 那句「Important state changes are announced without
 * duplicating every intermediate value」：本文件的用例分成两半，一半守着「重要变化
 * 要说」，另一半守着「中间值不许说」。
 */

/** 四个 1024：一次左移合出两个 2048，正好是第一次达标（同 run-endings.test.ts 的局面） */
const WIN_ROWS: (number | null)[][] = [
  [1024, 1024, 1024, 1024],
  [null, null, null, null],
  [null, null, null, null],
  [null, null, null, null],
]

/**
 * 一步即死局：第 0 行右端留一个空格，右移把它整体推过去。
 * 空出来的是 (0,0)，生成那一格后 16 格全满且横纵相邻都不相等——四个方向都推不动。
 * 邻居全是 8，所以生成 2 还是 4 都死局，这条路径不依赖随机进度。
 */
const ONE_STEP_FROM_DEADLOCK: (number | null)[][] = [
  [8, 2, 4, null],
  [8, 2, 4, 8],
  [2, 4, 8, 2],
  [4, 8, 2, 4],
]

/** 经典模式的目标值（ announcements 里要念出来） */
const TARGET = 2048

/** 走一步到 stuck：引擎自己判死局，store 只是收结果 */
function deadlocked(): GameState {
  const before = stateWithBoard(ONE_STEP_FROM_DEADLOCK)
  const outcome = move(before, 'right')
  expect(outcome.state.phase).toBe('stuck')
  return outcome.state
}

describe('播报只说结果，不说过程', () => {
  test('活跃局没有结果可播：playing 恒为 null', () => {
    const game = stateWithBoard(WIN_ROWS)
    expect(game.phase).toBe('playing')
    expect(runResultAnnouncement(game, TARGET)).toBeNull()
  })

  test('一次 Move 什么都不播：得分涨了也一个字节都不说', () => {
    // 「不重复播报」的正面形状：这里是**一次合并**（1024×2 → 2048），分数涨了 2048、
    // phase 转去 won——所以这句断言听着的不是「有合并」而是「有结果」。
    // 换成一次普通合并（不达标）时 phase 仍是 playing，这里仍然是 null：
    // 中间值（每一次得分）一条都不播，这正是本用例要守的那一半
    const before = stateWithBoard([
      [2, 2, null, null],
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
    ])
    const outcome = move(before, 'left')
    expect(outcome.state.phase).toBe('playing')
    expect(outcome.state.score).toBeGreaterThan(0)
    expect(runResultAnnouncement(outcome.state, TARGET)).toBeNull()
  })

  test('同一个状态进去永远得到同一句话：没有 delta，就没有重复播报', () => {
    const stuck = deadlocked()
    const first = runResultAnnouncement(stuck, TARGET)
    const second = runResultAnnouncement(stuck, TARGET)
    expect(first).not.toBeNull()
    // 反复渲染（倒计时每 250ms 重渲染一次外壳）不会产出第二句话
    expect(second).toBe(first)
  })
})

describe('结果播报的内容', () => {
  test('达标：念出目标值与「不是终局」，并带当前得分', () => {
    const before = stateWithBoard(WIN_ROWS)
    const outcome = move(before, 'left')
    expect(outcome.state.phase).toBe('won')

    const message = runResultAnnouncement(outcome.state, TARGET)
    expect(message).not.toBeNull()
    // 目标值要说出来：读屏玩家看不见棋盘上那一枚
    expect(message).toContain(String(TARGET))
    // 这句话的全部意义就是「别以为结束了」——漏了它，读屏玩家会在能继续玩的时候收工
    expect(message).toContain('里程碑')
    expect(message).toContain('不是终局')
    expect(message).toContain(String(outcome.state.score))
  })

  test('死局：念出四方向无路可走、三个出口与当前得分', () => {
    const message = runResultAnnouncement(deadlocked(), TARGET)
    expect(message).not.toBeNull()
    expect(message).toContain('死局')
    expect(message).toContain('四方向都无合法移动')
    // 三个出口都要出现：stuckRecoveryMoves 的三个动作 + 收工
    expect(message).toContain('撤销')
    expect(message).toContain('交换')
    expect(message).toContain('结束并记录')
  })

  test('死局结算：结束原因与终局分数都说，原因与面板同一份口径', () => {
    const ended = settle(deadlocked())
    expect(ended.phase).toBe('ended')

    const message = runResultAnnouncement(ended, TARGET)
    expect(message).not.toBeNull()
    // 复用 runEndLabel：面板显示的那一句与播报的那一句必须是同一句，
    // 否则「看得见的人」与「听得见的人」拿到的不是同一条事实
    expect(message).toContain(runEndLabel(ended))
    expect(message).toContain('最终得分')
    expect(message).toContain(String(ended.score))
  })

  test('超时结算：超时是强制结算，说它与死局不同的话', () => {
    // 直接按引擎的终态形状摆：tick 的结算路径归 T09 的用例，这里只要 endReason
    // 是 timeout 时播报跟着换句子
    const timedOut: GameState = { ...deadlocked(), phase: 'ended', endReason: 'timeout' }
    const message = runResultAnnouncement(timedOut, TARGET)
    expect(message).not.toBeNull()
    expect(message).toContain('时间到')
    expect(message).not.toContain('死局')
  })

  test('赢下后收工：说成赢下的一局，不说成败局', () => {
    const won = settle(move(stateWithBoard(WIN_ROWS), 'left').state)
    expect(won.endReason).toBe('won')
    const message = runResultAnnouncement(won, TARGET)
    expect(message).not.toBeNull()
    expect(message).toContain('赢下的一局')
  })

  test('不同模式的目标值跟着模式走：不写死 2048', () => {
    // 大棋盘的目标是 4096。播报里念的是模式自己的 target，不是经典的那一个
    const game = stateWithBoard(
      [
        [2048, 2048, 2048, 2048],
        [null, null, null, null],
        [null, null, null, null],
        [null, null, null, null],
      ],
      7,
      'big-board'
    )
    const outcome = move(game, 'left')
    expect(outcome.state.phase).toBe('won')
    const message = runResultAnnouncement(outcome.state, 4096)
    expect(message).toContain('4096')
    expect(message).not.toContain('2048')
  })
})

describe('交换拾取的操作播报', () => {
  test('没进拾取态：一句话都没有', () => {
    expect(swapPrompt(false, null)).toBeNull()
  })

  test('等第一枚：请选择第一枚方块，Esc 退出', () => {
    expect(swapPrompt(true, null)).toBe('请选择第一枚方块，Esc 退出')
  })

  test('等第二枚：行号列号按人口计数从 1 起', () => {
    // DOM 上的 data-row / data-col 是零基，给人看的从 1：零基那一枚是 (0,0)
    const selection: Coordinate = [0, 0]
    expect(swapPrompt(true, selection)).toBe('已选择第 1 行第 1 列，再选一枚方块完成交换')
    expect(swapPrompt(true, [3, 2])).toBe('已选择第 4 行第 3 列，再选一枚方块完成交换')
  })

  test('拾取态一关就安静：Esc 之后没有残留的一句', () => {
    // T12 的 Esc 路径把 swapArmed 与 swapSelection 一起清掉，这里守住「清了就没有话」
    expect(swapPrompt(false, [0, 0])).toBeNull()
  })
})
