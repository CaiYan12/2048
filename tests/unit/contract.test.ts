import { describe, expect, test } from 'vitest'
import contract from './fixtures/mode-contract.json'
import { MODES, getMode } from '../../src/shared/modes'
import { createBoard, isDeadlocked, playableCells } from '../../src/game/board'
import { createGame } from '../../src/game/engine'
import type { Cell, Tile } from '../../src/shared/types'
import { stateWithBoard } from './support'

/**
 * 契约一致性：模式声明的值与 tests/unit/fixtures/mode-contract.json 对齐。
 *
 * 这些数值由项目所有者在 T01 冻结，下游 ticket 的确定性测试都从这里取——
 * 所以测试**导入**契约而不是照 SPEC 重抄一遍：键名写错要编译失败，
 * 而不是安静地 lookup 出一个 undefined。
 */

function isTile(cell: Cell): cell is Tile {
  return cell !== null && cell !== 'wall'
}

describe('模式声明与冻结契约一致', () => {
  test('classic：4×4、2 的幂、2/4、目标 2048、无障碍、不限时', () => {
    const classic = getMode('classic')
    expect(classic.size).toBe(contract.walls.boardSize)
    expect(classic.mergeFamily).toBe('powers-of-two')
    expect(classic.spawnValues).toEqual(contract.spawnWeights.default.values)
    expect(classic.target).toBe(2048)
    expect(classic.walls).toEqual([])
    expect(classic.timeLimitSeconds).toBe(null)
  })

  test('生成值只有契约里的那两组，权重恒为低 90% / 高 10%', () => {
    expect(getMode('fibonacci').spawnValues).toEqual(contract.spawnWeights.fibonacci.values)
    for (const id of ['classic', 'big-board', 'walls', 'daily', 'time-attack'] as const) {
      expect(getMode(id).spawnValues, id).toEqual(contract.spawnWeights.default.values)
    }
  })

  test('障碍坐标就是契约冻结的居中 2×2 块，其余 12 格可玩', () => {
    const walls = getMode('walls')
    expect(walls.size).toBe(contract.walls.boardSize)
    expect(walls.walls).toEqual(contract.walls.blocked)

    const board = createBoard(walls.size, walls.walls)
    expect(playableCells(board)).toHaveLength(contract.walls.playableCellCount)
    expect(board.flat().filter((cell) => cell === 'wall')).toHaveLength(
      contract.walls.blocked.length
    )
  })

  test('fibonacci 目标块与 big-board 尺寸、限时秒数按 SPEC §3.1 声明', () => {
    expect(getMode('fibonacci').target).toBe(contract.fibonacci.targetTile)
    expect(getMode('big-board').size).toBe(5)
    expect(getMode('big-board').target).toBe(4096)
    // mode-contract §3：Time Attack 三分钟
    expect(getMode('time-attack').timeLimitSeconds).toBe(180)
    for (const mode of MODES) {
      if (mode.id === 'time-attack') continue
      expect(mode.timeLimitSeconds, mode.id).toBe(null)
    }
  })

  test('引擎读的是模式数据，不是写死的 4×4 与 2/4', () => {
    // 尺寸、障碍、生成值全部来自声明：T06/T07 才能只加字面量而不动引擎
    const walls = createGame('walls', 20260926)
    expect(walls.board).toHaveLength(contract.walls.boardSize)
    expect(walls.board.flat().filter((cell) => cell === 'wall')).toHaveLength(
      contract.walls.blocked.length
    )
    for (const tile of walls.board.flat().filter(isTile)) {
      expect(contract.spawnWeights.default.values).toContain(tile.value)
    }

    const big = createGame('big-board', 20260926)
    expect(big.board).toHaveLength(5)
    expect(big.board.every((row) => row.length === 5)).toBe(true)
  })

  test('开局两个方块占不同可玩格（契约的 initialTilesMustBeDistinctCells）', () => {
    const opening = createGame('walls', 20260926)
    const occupied = opening.board.flatMap((row, r) =>
      row.map((cell, c) => ({ cell, at: `${r},${c}` }))
    )
    const tiles = occupied.filter(({ cell }) => isTile(cell))
    expect(tiles).toHaveLength(contract.walls.initialTiles)
    expect(tiles.every(({ cell }) => cell !== 'wall')).toBe(true)
    if (contract.walls.initialTilesMustBeDistinctCells) {
      expect(new Set(tiles.map(({ at }) => at)).size).toBe(contract.walls.initialTiles)
    }
  })
})

describe('isDeadlocked', () => {
  test('四方向全部无合法移动即死局', () => {
    const packed = stateWithBoard([
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ])
    expect(isDeadlocked(packed)).toBe(true)
  })

  test('还有空格可走就不是死局', () => {
    expect(
      isDeadlocked(
        stateWithBoard([
          [2, 4, 2, 4],
          [4, 2, 4, 2],
          [2, 4, 2, 4],
          [4, 2, 4, null],
        ])
      )
    ).toBe(false)
  })

  test('无可合并对但有空格可推，同样不是死局', () => {
    expect(
      isDeadlocked(
        stateWithBoard([
          [2, 4, null, null],
          [4, 2, null, null],
          [2, 4, null, null],
          [4, 2, null, null],
        ])
      )
    ).toBe(false)
  })
})
