import type { Board, Cell, GameState, Tile } from '../../src/shared/types'
import { createGame } from '../../src/game/engine'

/** 一个格子的写法：数字 = 方块值，null = 空格，'wall' = 障碍块 */
type CellSpec = number | null | 'wall'

/**
 * 用手铺局面造棋盘。
 *
 * Tile 的 id 按行序从 1 递增分配，让断言里可以直接写 id 数值——「身份不随位置变化」
 * 这条要靠 id 逐格比对来证明，id 不可预期的话断言就没法写。
 */
export function boardOf(rows: CellSpec[][]): Board {
  let id = 1
  return rows.map((row) =>
    row.map((spec): Cell => {
      if (spec === null) return null
      if (spec === 'wall') return 'wall'
      const tile: Tile = { id, value: spec }
      id += 1
      return tile
    })
  )
}

/** 以合法初态为底换成手铺局面；随机进度钉死，让「移动后的生成」也可预期 */
export function stateWithBoard(rows: CellSpec[][], rngState = 7): GameState {
  const base = createGame('classic', 1)
  return {
    ...base,
    board: boardOf(rows),
    score: 0,
    moves: 0,
    nextTileId: 100,
    rngState,
  }
}

/** 只取数值网格（障碍记作 'W'，空格记作 null）——期望值可以照着 mode-contract 的表写 */
export function valueGrid(board: Board): (number | 'W' | null)[][] {
  return board.map((row) =>
    row.map((cell) => {
      if (cell === null) return null
      if (cell === 'wall') return 'W'
      return cell.value
    })
  )
}

/** 棋盘上所有数值方块的列表 */
export function tilesOf(board: Board): Tile[] {
  return board.flat().filter((cell): cell is Tile => cell !== null && cell !== 'wall')
}
