import type { Board, Cell, GameState, Tile } from '../../src/shared/types'
import type { ModeId } from '../../src/shared/modes'
import { createGame } from '../../src/game/engine'

/** 一个格子的写法：数字 = 方块值，null = 空格，'wall' = 障碍块 */
export type CellSpec = number | null | 'wall'

/**
 * 单测注入的固定时刻（epoch ms）：UTC 2026-09-26 中午，与 tests/e2e/daily.spec.ts
 * 钉的是同一个瞬间。
 *
 * 非限时模式的 deadline 恒为 null，所以除限时相关用例外这个值不影响任何断言。
 * 每个调用点仍然显式传它：时钟由调用方注入是 ADR-0001 的一半，写在这里是为了让
 * 「注入」在每个 createGame 调用点上都看得见，而不是被一个默认值藏起来——
 * createGame 的 now 之所以必填，正是为了不留那个默认值。
 */
export const NOW = Date.UTC(2026, 8, 26, 12)

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

/**
 * 以合法初态为底换成手铺局面；随机进度钉死，让「移动后的生成」也可预期。
 *
 * modeId 决定用哪张合并表：引擎的 lane 算法对所有家族同一套，所以同一个手铺局面
 * 喂给 fibonacci 就是「换表不换算法」——T05 的用例靠这个参数走同一份代码路径。
 *
 * 时钟与 support.ts 外层的 NOW 同一个值：限时模式（time-attack）的手铺局面因此带
 * deadline = NOW + 180000，T09 的 tick 用例直接在这上面跑。
 */
export function stateWithBoard(
  rows: CellSpec[][],
  rngState = 7,
  modeId: ModeId = 'classic'
): GameState {
  const base = createGame(modeId, 1, NOW)
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
