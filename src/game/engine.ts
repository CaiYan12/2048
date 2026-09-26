import { getMode } from '../shared/modes'
import type { ModeId } from '../shared/modes'
import type { Board, Direction, GameState, MoveOutcome } from '../shared/types'
import { createRng, restoreRng } from '../shared/rng'
import { createBoard, slideBoard } from './board'
import { spawnTile } from './spawn'

/**
 * 规则内核的公开面（SPEC §4）
 *
 * 这里零 DOM 引用、零 Math.random、零 Date：种子由调用方在 createGame 时注入，
 * 之后随机进度存在 state.rngState 里跟着状态走（ADR-0001）。
 */

/** 开局：摆好空棋盘，连开两个方块。**不**设 deadline，限时模式由 T09 写入 */
export function createGame(modeId: ModeId, seed: number): GameState {
  const mode = getMode(modeId)
  const rng = createRng(seed)
  const opening: GameState = {
    modeId,
    board: createBoard(mode.size, mode.walls),
    score: 0,
    reachedTarget: false,
    nextTileId: 1,
    rngState: rng.serialize(),
    moves: 0,
    deadline: null,
  }
  // 开局两个方块各自从未被占用的可玩格里独立随机取（mode-contract §1），
  // 所以第二次生成天然落不到第一次那一格上。
  return spawnTile(spawnTile(opening, rng), rng)
}

/**
 * 一次移动。
 *
 * **不可变过渡**：返回新的 GameState，绝不改传入的那个对象。这正是撤销的实现方式
 * （ADR-0003：store 留着旧对象即可，历史自然无限）——所以引擎里既没有 undo 函数，
 * 也没有历史数组，T11 要的是历史对象，不是引擎能力。
 *
 * swap / tick 属于 T12 / T09，此处不实现。
 */
export function move(state: GameState, direction: Direction): MoveOutcome {
  const mode = getMode(state.modeId)
  const slide = slideBoard(state.board, direction, mode.mergeFamily)

  // 无效 Move：原对象原样返回——不生成、不计分、不进历史，
  // store 见到同一个引用连重渲染都不会发生。
  if (!slide.changed) return { state, changed: false, gained: 0 }

  const slid: GameState = {
    ...state,
    board: slide.board,
    score: state.score + slide.gained,
    moves: state.moves + 1,
    // 达标是里程碑而非终局（mode-contract §3）：只升不降。合出目标块的那一步棋盘上
    // 一定有它，所以按棋盘判定即可，不必让 slide 再回报一个标志。
    reachedTarget: state.reachedTarget || holdsAtLeast(slide.board, mode.target),
  }

  // 只在棋盘真的变了之后才生成（mode-contract 的 Spawn 定义）
  const spawned = spawnTile(slid, restoreRng(slid.rngState))
  return { state: spawned, changed: true, gained: slide.gained }
}

function holdsAtLeast(board: Board, value: number): boolean {
  return board.some((row) =>
    row.some((cell) => cell !== null && cell !== 'wall' && cell.value >= value)
  )
}
