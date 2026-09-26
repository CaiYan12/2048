import type { Rng } from '../shared/rng'
import { getMode } from '../shared/modes'
import type { GameState } from '../shared/types'
import { playableCells } from './board'

/**
 * 生成权重在所有模式同口径：低值 90% / 高值 10%（mode-contract §1）。
 * 它是规则而不是模式数据——modes.ts 只声明这两个值本身，权重到处一样。
 */
const LOW_VALUE_RATE = 0.9

/** 在随机空格里放入一个新方块。RNG 由调用方注入，进度写回 state.rngState */
export function spawnTile(state: GameState, rng: Rng): GameState {
  const cells = playableCells(state.board)
  // 满盘时无格可放。正常路径上 move 只在棋盘真的变了之后才生成，但 spawn 是纯函数，
  // 不假设调用方一定留了空格；原样返回比抛错更贴合「无效输入不改变状态」的口径。
  if (cells.length === 0) return state

  const mode = getMode(state.modeId)
  const [row, col] = cells[rng.int(cells.length)]
  const value = rng.next() < LOW_VALUE_RATE ? mode.spawnValues[0] : mode.spawnValues[1]
  const board = state.board.map((r) => [...r])
  board[row][col] = { id: state.nextTileId, value }

  return {
    ...state,
    board,
    nextTileId: state.nextTileId + 1,
    rngState: rng.serialize(),
  }
}
