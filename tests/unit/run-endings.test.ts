import { describe, expect, test } from 'vitest'
import { abandon, continueRun, createGame, move, settle } from '../../src/game/engine'
import { holdsAtLeast, isDeadlocked } from '../../src/game/board'
import { boardOf, NOW, stateWithBoard, valueGrid } from './support'
import { runEndLabel } from '../../src/renderer/components/runEndLabel'
import type { GameState } from '../../src/shared/types'

/**
 * T04 的规则状态：胜利里程碑、继续玩、死局、结算与新游戏。
 *
 * 全部经引擎公开面（createGame / move / continueRun / settle / abandon）走——
 * 只探一个自己写的内部助手证明不了任何迁移真的发生了。
 */

/** 四个 1024：一次左移合出两个 2048，正好是「第一次达标」的场面 */
const WIN_ROWS: (number | null)[][] = [
  [1024, 1024, 1024, 1024],
  [null, null, null, null],
  [null, null, null, null],
  [null, null, null, null],
]

/**
 * 一步即死局的局面：第 0 行右端留一个空格。
 * 右移把第 0 行整体推过去、空出来的是 (0,0)，生成那一格后棋盘 16 格全满且
 * 横向纵向相邻都不相等——所以四个方向都没有合法移动。
 * 邻居全是 8，因此生成的 2 或 4 都成立：不依赖随机进度，任何 seed 都死局。
 */
const ONE_STEP_FROM_DEADLOCK: (number | null)[][] = [
  [8, 2, 4, null],
  [8, 2, 4, 8],
  [2, 4, 8, 2],
  [4, 8, 2, 4],
]

/** 剥掉 phase / endReason 的副本——用来断言「除阶段之外一个字段都没动」 */
type WithoutEnd = Omit<GameState, 'phase' | 'endReason'>
function withoutEnd({
  phase: _phase,
  endReason: _endReason,
  ...rest
}: GameState): WithoutEnd {
  return rest
}

describe('move：胜利里程碑', () => {
  test('合出目标块置 won：分数、棋盘、里程碑都在，endReason 仍是 null', () => {
    const before = stateWithBoard([
      [1024, 1024, null, null],
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
    ])

    const outcome = move(before, 'left')

    expect(outcome.changed).toBe(true)
    expect(outcome.state.phase).toBe('won')
    // 里程碑不是终局（mode-contract §3）：没有结束原因，等玩家决定
    expect(outcome.state.endReason).toBe(null)
    expect(outcome.state.reachedTarget).toBe(true)
    expect(outcome.state.score).toBe(2048)
    expect(valueGrid(outcome.state.board)[0][0]).toBe(2048)
  })

  test('第二次合出目标块不再弹胜利面板：只弹一次', () => {
    // 四连 1024 一次左移合出两个 2048 → won；继续玩之后再把两个 2048 合成 4096
    const outcome = move(stateWithBoard(WIN_ROWS), 'left')
    expect(outcome.state.phase).toBe('won')

    const playing = continueRun(outcome.state)
    expect(playing.phase).toBe('playing')

    const again = move(playing, 'left')
    expect(again.changed).toBe(true)
    // 又造出一个远超目标的方块，但面板不回来：触发器是 reachedTarget 由假转真
    expect(again.state.reachedTarget).toBe(true)
    expect(again.state.phase).toBe('playing')
    expect(again.state.score).toBe(8192)
  })

  test('胜利面板挡着的时候，方向键推不动棋盘', () => {
    const won = move(stateWithBoard(WIN_ROWS), 'left').state

    const outcome = move(won, 'left')

    expect(outcome.changed).toBe(false)
    expect(outcome.gained).toBe(0)
    // 同一个引用：不进撤销历史，也不触发重渲染
    expect(outcome.state).toBe(won)
    expect(outcome.state.score).toBe(4096)
  })
})

describe('continueRun', () => {
  test('保留分数与棋盘，只把 phase 放回 playing', () => {
    const won = move(stateWithBoard(WIN_ROWS), 'left').state
    expect(won.score).toBe(4096)

    const continued = continueRun(won)

    expect(continued.phase).toBe('playing')
    // 除 phase 之外一个字段都没动：分数、棋盘、随机进度、里程碑、步数全部原样
    expect(withoutEnd(continued)).toEqual(withoutEnd(won))
  })

  test('续走即死局时直接转去 stuck，不再回 playing', () => {
    // 胜利面板可以出现在一张已经死掉的棋盘上（合出目标块的那一步同时把棋盘填死）。
    // 这时「继续玩」的下一站是死局面板——玩家不会再看见第二次胜利面板。
    const deadWithTarget = stateWithBoard([
      [2, 8, 2, 2048],
      [8, 2, 4, 8],
      [2, 4, 8, 2],
      [4, 8, 2, 4],
    ])
    const won: GameState = { ...deadWithTarget, reachedTarget: true, phase: 'won' }

    const continued = continueRun(won)

    expect(continued.phase).toBe('stuck')
    expect(continued.endReason).toBe(null)
    expect(withoutEnd(continued)).toEqual(withoutEnd(won))
  })

  test('只有 won 能继续玩：其他阶段原样返回', () => {
    const playing = stateWithBoard([
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ])
    expect(continueRun(playing)).toBe(playing)

    const stuck = move(stateWithBoard(ONE_STEP_FROM_DEADLOCK), 'right').state
    expect(continueRun(stuck)).toBe(stuck)
  })
})

describe('move：死局', () => {
  test('合法移动加生成之后四方向皆无路 → stuck，而不是结束', () => {
    const before = stateWithBoard(ONE_STEP_FROM_DEADLOCK)

    const outcome = move(before, 'right')

    expect(outcome.changed).toBe(true)
    expect(outcome.state.phase).toBe('stuck')
    // 死局是**可恢复**面板（mode-contract §3）：没有结束原因，Undo / 交换归 T11 / T12
    expect(outcome.state.endReason).toBe(null)
    expect(outcome.state.reachedTarget).toBe(false)
    // 生成那一步正是填满棋盘的那一格，16 格全满
    expect(valueGrid(outcome.state.board)).toEqual([
      [2, 8, 2, 4],
      [8, 2, 4, 8],
      [2, 4, 8, 2],
      [4, 8, 2, 4],
    ])
    expect(isDeadlocked(outcome.state)).toBe(true)
  })

  test('stuck 不能被一次移动离开：四个方向都推不动', () => {
    const stuck = move(stateWithBoard(ONE_STEP_FROM_DEADLOCK), 'right').state

    for (const outcome of [
      move(stuck, 'left'),
      move(stuck, 'right'),
      move(stuck, 'up'),
      move(stuck, 'down'),
    ]) {
      expect(outcome.changed).toBe(false)
      expect(outcome.state).toBe(stuck)
    }
  })
})

describe('move：无效移动', () => {
  test('整盘已压紧且无可合并对：phase 一个字节都不动，原对象原样返回', () => {
    const before = stateWithBoard([
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ])

    const outcome = move(before, 'left')

    expect(outcome.changed).toBe(false)
    expect(outcome.state).toBe(before)
    expect(outcome.state.phase).toBe('playing')
    expect(outcome.state.moves).toBe(0)
  })

  test('won / stuck / ended 三个阶段都不接受移动', () => {
    const won = move(stateWithBoard(WIN_ROWS), 'left').state

    for (const phase of ['won', 'stuck', 'ended'] as const) {
      const state: GameState = { ...won, phase }
      const outcome = move(state, 'left')
      expect(outcome.changed, phase).toBe(false)
      // 同一个引用，且分数没被结算后的移动改掉
      expect(outcome.state, phase).toBe(state)
      expect(outcome.state.score, phase).toBe(won.score)
    }
  })
})

describe('settle', () => {
  test('死局结算：ended + deadlock', () => {
    const stuck = move(stateWithBoard(ONE_STEP_FROM_DEADLOCK), 'right').state

    const settled = settle(stuck)

    expect(settled.phase).toBe('ended')
    expect(settled.endReason).toBe('deadlock')
    // 棋盘与分数冻结在结算那一刻
    expect(withoutEnd(settled)).toEqual(withoutEnd(stuck))
  })

  test('胜利面板结算：ended + won（mode-contract §3 补订的 won→结算边）', () => {
    const won = move(stateWithBoard(WIN_ROWS), 'left').state

    const settled = settle(won)

    expect(settled.phase).toBe('ended')
    // won 是**赢下的收工**，不是败因：与 deadlock / abandoned 三者互不相同，
    // 也因此不能沿用任何一个原有的结束原因值
    expect(settled.endReason).toBe('won')
    expect(withoutEnd(settled)).toEqual(withoutEnd(won))
  })

  test('幂等：再结算返回同一个对象（结算只执行一次）', () => {
    const settled = settle(move(stateWithBoard(ONE_STEP_FROM_DEADLOCK), 'right').state)

    expect(settle(settled)).toBe(settled)
    expect(settle(settle(settled)).endReason).toBe('deadlock')
  })

  test('从 won 结算之后同样幂等：won 也不会被 abandon 改判', () => {
    const settled = settle(move(stateWithBoard(WIN_ROWS), 'left').state)
    expect(settled.endReason).toBe('won')

    expect(settle(settled)).toBe(settled)
    expect(abandon(settled)).toBe(settled)
    expect(settled.endReason).toBe('won')
  })

  test('活跃局不能结算：原样返回（进得去的只有 stuck 与 won）', () => {
    // 注意 move 落地的这个状态 phase 就是 won，不是 playing——不能拿它充活跃局。
    // 真要覆盖 playing，得用 continueRun 把它送回 playing。
    const won = move(stateWithBoard(WIN_ROWS), 'left').state
    const playing = continueRun(won)
    expect(playing.phase).toBe('playing')

    expect(settle(playing)).toBe(playing)
  })
})

describe('abandon', () => {
  test('活跃局放弃：ended + abandoned，除原因之外什么都不动', () => {
    // 先真的走一步，让分数 / 步数 / 随机进度都是非平凡值
    const playing = move(
      stateWithBoard([
        [4, 2, 4, 2],
        [8, 4, 8, 4],
        [2, 2, 4, 8],
        [4, 2, 4, 2],
      ]),
      'left'
    ).state
    expect(playing.score).toBeGreaterThan(0)

    const abandoned = abandon(playing)

    expect(abandoned.phase).toBe('ended')
    expect(abandoned.endReason).toBe('abandoned')
    expect(withoutEnd(abandoned)).toEqual(withoutEnd(playing))
  })

  test('胜利面板上放弃：同样是 abandoned（活跃局包含 won）', () => {
    const won = move(stateWithBoard(WIN_ROWS), 'left').state

    const abandoned = abandon(won)

    expect(abandoned.phase).toBe('ended')
    expect(abandoned.endReason).toBe('abandoned')
    expect(withoutEnd(abandoned)).toEqual(withoutEnd(won))
  })

  test('已结算的局不接受改判：deadlock 不会被覆写成 abandoned', () => {
    const settled = settle(move(stateWithBoard(ONE_STEP_FROM_DEADLOCK), 'right').state)

    const again = abandon(settled)

    expect(again).toBe(settled)
    expect(again.endReason).toBe('deadlock')
  })
})

describe('状态迁移表（task-4-interfaces §4）', () => {
  test('won 主线：playing → won → playing → abandoned，终局之后什么都不接受', () => {
    const won = move(stateWithBoard(WIN_ROWS), 'left').state
    expect([won.phase, won.endReason]).toEqual(['won', null])

    // 结算边（mode-contract §3 状态图补订）：won 也能就此收工，留下一个赢下的结局
    const settled = settle(won)
    expect([settled.phase, settled.endReason]).toEqual(['ended', 'won'])
    expect(settle(settled)).toBe(settled)

    // 放弃边：新游戏不写记录，所以原因不是 won
    const givenUp = abandon(won)
    expect([givenUp.phase, givenUp.endReason]).toEqual(['ended', 'abandoned'])

    const playing = continueRun(won)
    expect(playing.phase).toBe('playing')

    const abandoned = abandon(playing)
    expect([abandoned.phase, abandoned.endReason]).toEqual(['ended', 'abandoned'])

    // ended 是终局：四个动作全部原样返回
    expect(abandon(abandoned)).toBe(abandoned)
    expect(settle(abandoned)).toBe(abandoned)
    expect(continueRun(abandoned)).toBe(abandoned)
    expect(move(abandoned, 'left').state).toBe(abandoned)
  })

  test('stuck 主线：playing → stuck → ended，两条按钮走两个不同原因', () => {
    const stuck = move(stateWithBoard(ONE_STEP_FROM_DEADLOCK), 'right').state
    expect([stuck.phase, stuck.endReason]).toEqual(['stuck', null])
    // 死局不能被一次移动离开
    expect(move(stuck, 'right').state).toBe(stuck)

    const settled = settle(stuck)
    expect([settled.phase, settled.endReason]).toEqual(['ended', 'deadlock'])

    const givenUp = abandon(stuck)
    expect([givenUp.phase, givenUp.endReason]).toEqual(['ended', 'abandoned'])

    // 结算只执行一次：两个终态都不再被改写
    expect(settle(givenUp)).toBe(givenUp)
    expect(abandon(settled)).toBe(settled)
  })

  test('playing 直接新游戏一样是 abandoned，且新局是另一张干净棋盘', () => {
    const playing = move(stateWithBoard(WIN_ROWS), 'left').state

    const abandoned = abandon(playing)
    expect([abandoned.phase, abandoned.endReason]).toEqual(['ended', 'abandoned'])

    // 新局由调用方开：同样的种子给出同样的开局，但 reachedTarget 回到 false——
    // 上一局的里程碑不带到下一局
    const fresh = createGame('classic', 1, NOW)
    expect(fresh.phase).toBe('playing')
    expect(fresh.reachedTarget).toBe(false)
    expect(fresh.moves).toBe(0)
    expect(fresh.endReason).toBe(null)
  })
})

describe('holdsAtLeast（里程碑判据）', () => {
  test('≥ 目标值才算达标；障碍与空格不算', () => {
    expect(holdsAtLeast(boardOf([[1024, 4], [null, 'wall']]), 2048)).toBe(false)
    expect(holdsAtLeast(boardOf([[2048, 4], [null, 'wall']]), 2048)).toBe(true)
    // 超过目标同样算：Big Board 的 8192 之于 4096
    expect(holdsAtLeast(boardOf([[4096, 4], [null, 'wall']]), 2048)).toBe(true)
  })
})

describe('结束原因可区分（SPEC 用户故事 7）', () => {
  const stuck = move(stateWithBoard(ONE_STEP_FROM_DEADLOCK), 'right').state

  test('runEndLabel 的每个分支各说一句话，六句互不相同', () => {
    const deadlock: GameState = { ...stuck, phase: 'ended', endReason: 'deadlock' }
    const abandoned: GameState = { ...stuck, phase: 'ended', endReason: 'abandoned' }
    // 结算后的 won 由引擎真的走过来，不手搓：settle 是它唯一的入口
    const won = settle(move(stateWithBoard(WIN_ROWS), 'left').state)
    expect(won.endReason).toBe('won')
    // 未结束的活跃局：endReason 还是 null
    const playing: GameState = { ...stuck, phase: 'playing', endReason: null }
    // 超时（T09）：唯一一条由时间而不是玩家触发的结算路径
    const timeout: GameState = { ...stuck, phase: 'ended', endReason: 'timeout' }

    expect(runEndLabel(stuck)).toContain('无合法移动')
    expect(runEndLabel(deadlock)).toContain('死局')
    expect(runEndLabel(abandoned)).toContain('放弃')
    expect(runEndLabel(won)).toContain('达成目标')
    expect(runEndLabel(playing)).toBe('本局已结束')
    // 赢下的收工不许落回默认那句——那不是一句能区分原因的话，
    // 也说明它不是漏了分支的被静默兜底
    expect(runEndLabel(won)).not.toBe('本局已结束')
    // 超时同样不许落回默认句，也不该与死局共用词（到点是强制，死局是玩家自己收工）
    expect(runEndLabel(timeout)).toContain('时间到')
    expect(runEndLabel(timeout)).not.toContain('死局')
    expect(runEndLabel(timeout)).not.toBe('本局已结束')
    // 读屏与肉眼都能区分「怎么结束的」
    expect(
      new Set([
        runEndLabel(stuck),
        runEndLabel(deadlock),
        runEndLabel(abandoned),
        runEndLabel(won),
        runEndLabel(timeout),
        runEndLabel(playing),
      ]).size
    ).toBe(6)
  })
})
