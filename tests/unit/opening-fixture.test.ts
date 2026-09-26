import { describe, expect, test } from 'vitest'
import { fixtureFromQuery } from '../../src/renderer/stores/fixture'
import { createGame, move } from '../../src/game/engine'
import { tilesOf, valueGrid } from './support'

/**
 * 开局局面夹具（?board=）——T04 终局 e2e 的确定性来源。
 *
 * 它必须只做一件事：把给定棋盘当成一局**合法**的状态交出来，让之后的每一步
 * 仍然由真实规则内核决定。所以除「铺得对」之外，还要断言「后续 move 真的按规则
 * 跑」——否则夹具就可能是在另造一个平行的规则世界。
 */

/** 行优先局面 → board 参数值（空串 = 空格） */
function boardQuery(rows: (number | null)[][]): string {
  return `board=${rows.flat().map((value) => value ?? '').join(',')}`
}

const FOUR_1024: (number | null)[][] = [
  [1024, 1024, 1024, 1024],
  [null, null, null, null],
  [null, null, null, null],
  [null, null, null, null],
]

describe('开局局面夹具', () => {
  test('合法局面照铺：棋盘、分数、随机进度都对齐，后续 move 按规则跑', () => {
    const state = fixtureFromQuery(`${boardQuery(FOUR_1024)}&score=4321`, 'classic', 20260926)

    expect(state).not.toBeNull()
    if (state === null) return
    expect(valueGrid(state.board)).toEqual([
      [1024, 1024, 1024, 1024],
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
    ])
    expect(state.score).toBe(4321)
    // 开局初态的其余字段：步数 0、随机进度与同种子的普通开局一致
    expect(state.moves).toBe(0)
    expect(state.rngState).toBe(createGame('classic', 20260926).rngState)
    // 方块身份按行序分配，下一个身份接在后面
    expect(tilesOf(state.board).map((tile) => tile.id)).toEqual([1, 2, 3, 4])
    expect(state.nextTileId).toBe(5)
    expect(state.phase).toBe('playing')
    expect(state.endReason).toBe(null)

    // 关键：交出去的状态由真实内核驱动——一次左移就该合出两个 2048 并达标
    const outcome = move(state, 'left')
    expect(outcome.state.phase).toBe('won')
    expect(outcome.state.reachedTarget).toBe(true)
    expect(outcome.state.score).toBe(4321 + 4096)
  })

  test('局面里已经有目标块 = 曾经达标，但 phase 仍是 playing', () => {
    const rows: (number | null)[][] = [
      [2048, 1024, 1024, null],
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
    ]

    const state = fixtureFromQuery(`${boardQuery(rows)}&score=100`, 'classic', 1)

    expect(state).not.toBeNull()
    if (state === null) return
    expect(state.reachedTarget).toBe(true)
    expect(state.phase).toBe('playing')
    // 「再合出一个目标块不弹胜利面板」的起点就在这里：move 之后 phase 保持 playing
    const outcome = move(state, 'left')
    expect(outcome.state.reachedTarget).toBe(true)
    expect(outcome.state.phase).toBe('playing')
    expect(valueGrid(outcome.state.board)[0].slice(0, 2)).toEqual([2048, 2048])
  })

  test('score 缺省 0', () => {
    expect(fixtureFromQuery(boardQuery(FOUR_1024), 'classic', 1)?.score).toBe(0)
  })

  test('障碍格保持 wall：夹具不能把方块塞到墙上去', () => {
    // query 在四个墙的位置照样给数
    const rows: (number | null)[][] = [
      [2, 4, 8, 8],
      [4, 8, 8, 2],
      [8, 2, 2, 4],
      [null, 4, 8, 2],
    ]

    const state = fixtureFromQuery(boardQuery(rows), 'walls', 1)

    expect(state).not.toBeNull()
    if (state === null) return
    // 契约冻结的居中 2×2 块仍是墙
    expect(state.board[1][1]).toBe('wall')
    expect(state.board[1][2]).toBe('wall')
    expect(state.board[2][1]).toBe('wall')
    expect(state.board[2][2]).toBe('wall')
    expect(state.board.flat().filter((cell) => cell === 'wall')).toHaveLength(4)
  })

  test('尺寸必须正好：长度不对就退回随机开局', () => {
    expect(fixtureFromQuery('board=2,4,8', 'classic', 1)).toBeNull()
    // 4×4 的局面喂给 5×5 的 Big Board 也不行
    expect(fixtureFromQuery(boardQuery(FOUR_1024), 'big-board', 1)).toBeNull()
    const twentyFive = Array.from({ length: 25 }, () => '')
    expect(fixtureFromQuery(`board=${twentyFive.join(',')}`, 'big-board', 1)).not.toBeNull()
  })

  test('格子值只接受正整数：0、负数、小数、非数字一律拒绝', () => {
    const tokens = FOUR_1024.flat().map((value) => value ?? '')
    for (const bad of ['0', '-2', '2.5', 'x', ' 2', '0x2', '+2']) {
      const query = `board=${[bad, ...tokens.slice(1)].join(',')}`
      expect(fixtureFromQuery(query, 'classic', 1), bad).toBeNull()
    }
  })

  test('score 只接受非负整数', () => {
    expect(fixtureFromQuery(`${boardQuery(FOUR_1024)}&score=-1`, 'classic', 1)).toBeNull()
    expect(fixtureFromQuery(`${boardQuery(FOUR_1024)}&score=1.5`, 'classic', 1)).toBeNull()
    expect(fixtureFromQuery(`${boardQuery(FOUR_1024)}&score=x`, 'classic', 1)).toBeNull()
    expect(fixtureFromQuery(`${boardQuery(FOUR_1024)}&score=0`, 'classic', 1)?.score).toBe(0)
  })

  test('没给 board 就退回随机开局', () => {
    expect(fixtureFromQuery('seed=20260926', 'classic', 1)).toBeNull()
    expect(fixtureFromQuery('', 'classic', 1)).toBeNull()
  })
})
