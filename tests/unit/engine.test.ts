import { describe, expect, test } from 'vitest'
import { createGame, move } from '../../src/game/engine'
import { stateWithBoard, tilesOf, valueGrid } from './support'

describe('createGame', () => {
  test('固定种子的开局棋盘逐格确定，两个方块分居两格', () => {
    const state = createGame('classic', 20260926)

    expect(valueGrid(state.board)).toEqual([
      [null, null, null, null],
      [null, null, null, null],
      [2, null, null, null],
      [null, null, null, 4],
    ])
    expect(state.score).toBe(0)
    expect(state.moves).toBe(0)
    // 两个方块用掉 1、2 号身份，下一个是 3
    expect(state.nextTileId).toBe(3)
    expect(state.reachedTarget).toBe(false)
    // deadline 由 T09 按注入的时间写入，这里保持 null
    expect(state.deadline).toBe(null)
  })
})

describe('move：一次合法移动', () => {
  test('滑动、合并、计分并生成，全部照合并表发生', () => {
    // 手铺局面：只有第 2 行会变，且压紧后只留下一个空格——
    // 生成的格子必然落在 (2,3)，值由固定随机进度决定（低值 90% 的那一档）
    const before = stateWithBoard([
      [4, 2, 4, 2],
      [8, 4, 8, 4],
      [2, 2, 4, 8],
      [4, 2, 4, 2],
    ])

    const outcome = move(before, 'left')

    expect(outcome.changed).toBe(true)
    expect(outcome.gained).toBe(4)
    expect(outcome.state.score).toBe(4)
    expect(outcome.state.moves).toBe(1)
    expect(valueGrid(outcome.state.board)).toEqual([
      [4, 2, 4, 2],
      [8, 4, 8, 4],
      [4, 4, 8, 2],
      [4, 2, 4, 2],
    ])

    // 合掉一个、新生成一个，总数不变
    expect(tilesOf(before.board)).toHaveLength(16)
    expect(tilesOf(outcome.state.board)).toHaveLength(16)

    // 生成用掉了 100 号身份，落在唯一的那个空格
    expect(tilesOf(outcome.state.board).find((tile) => tile.id === 100)).toEqual({
      id: 100,
      value: 2,
    })

    // 合并产物继承了「落在目标格上」的那个方块的身份
    expect(outcome.state.board[2][0]).toEqual({ id: 9, value: 4 })
  })

  test('四个方向各自按目标边压紧与合并', () => {
    // 每个局面都只有一条 lane 会动，且动完只剩一个空格，
    // 于是生成的落点是确定的，整张期望棋盘可以逐格写死。
    const cases = [
      {
        direction: 'left' as const,
        rows: [
          [4, 2, 4, 2],
          [8, 4, 8, 4],
          [2, 2, 4, 8],
          [4, 2, 4, 2],
        ],
        expected: [
          [4, 2, 4, 2],
          [8, 4, 8, 4],
          [4, 4, 8, 2],
          [4, 2, 4, 2],
        ],
        gained: 4,
      },
      {
        direction: 'right' as const,
        rows: [
          [4, 2, 4, 2],
          [8, 4, 8, 4],
          [8, 4, 2, 2],
          [4, 2, 4, 2],
        ],
        expected: [
          [4, 2, 4, 2],
          [8, 4, 8, 4],
          [2, 8, 4, 4],
          [4, 2, 4, 2],
        ],
        gained: 4,
      },
      {
        direction: 'up' as const,
        rows: [
          [4, 2, 4, 2],
          [8, 4, 8, 4],
          [2, 4, 2, 8],
          [4, 2, 8, 2],
        ],
        expected: [
          [4, 2, 4, 2],
          [8, 8, 8, 4],
          [2, 2, 2, 8],
          [4, 2, 8, 2],
        ],
        gained: 8,
      },
      {
        direction: 'down' as const,
        rows: [
          [4, 2, 4, 2],
          [8, 4, 8, 4],
          [2, 8, 2, 4],
          [4, 4, 4, 2],
        ],
        expected: [
          [4, 2, 4, 2],
          [8, 4, 8, 2],
          [2, 8, 2, 8],
          [4, 4, 4, 2],
        ],
        gained: 8,
      },
    ]

    for (const { direction, rows, expected, gained } of cases) {
      const outcome = move(stateWithBoard(rows), direction)
      expect(outcome.changed).toBe(true)
      expect(outcome.gained, direction).toBe(gained)
      expect(valueGrid(outcome.state.board), direction).toEqual(expected)
    }
  })

  test('Tile 身份不随位置变化', () => {
    const before = stateWithBoard([
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, 8],
    ])

    const after = move(before, 'up').state

    // 8 号（boardOf 分配的 1 号）从 (3,3) 走到 (0,3)，id 不变
    expect(after.board[0][3]).toEqual({ id: 1, value: 8 })
  })

  test('一个方块在一次移动里最多合并一次：2,2,2,2 得两个 4，不是一个 8', () => {
    const before = stateWithBoard([
      [2, 2, 2, 2],
      [8, 4, 8, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
    ])

    const outcome = move(before, 'left')

    expect(outcome.gained).toBe(8)
    // 产物不能接着参与本次移动的第二次合并
    expect(valueGrid(outcome.state.board)[0]).toEqual([4, 4, 2, null])
  })

  test('合并产物不能与既有的同值方块再合并：4,2,2 得 4 和 4', () => {
    const before = stateWithBoard([
      [4, 2, 2, 8],
      [8, 4, 8, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
    ])

    const outcome = move(before, 'left')

    expect(outcome.gained).toBe(4)
    expect(valueGrid(outcome.state.board)[0]).toEqual([4, 4, 8, 2])
  })

  test('合出目标块时记下里程碑，且不因此结束', () => {
    const before = stateWithBoard([
      [1024, 1024, 4, 2],
      [8, 4, 8, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
    ])

    const outcome = move(before, 'left')

    expect(outcome.state.reachedTarget).toBe(true)
    expect(outcome.state.score).toBe(2048)
    expect(valueGrid(outcome.state.board)[0][0]).toBe(2048)
  })
})

describe('move：无效移动', () => {
  test('整盘已压紧且无可合并对：不生成、不计分，state 原样返回', () => {
    const before = stateWithBoard([
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ])

    const outcome = move(before, 'left')

    expect(outcome.changed).toBe(false)
    expect(outcome.gained).toBe(0)
    // 同一个引用：不进撤销历史（ADR-0003 的「无效输入不加历史」），也不触发重渲染
    expect(outcome.state).toBe(before)
    expect(outcome.state.score).toBe(0)
    expect(tilesOf(outcome.state.board)).toHaveLength(16)
  })
})
