import { getMode } from '../shared/modes'
import type { ModeId } from '../shared/modes'
import type { Direction, GameState, MoveOutcome } from '../shared/types'
import { createRng, restoreRng } from '../shared/rng'
import { createBoard, holdsAtLeast, isDeadlocked, slideBoard } from './board'
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
    phase: 'playing',
    endReason: null,
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
  // 只有 playing 接受移动。三个非活跃阶段各有各的道理，共一条守卫比依赖巧合更硬：
  //   won  —— 胜利面板正等玩家决定继续还是结算，此时按方向键不该偷偷推棋盘；
  //   stuck—— 死局的定义就是四方向皆无合法移动（守卫只是把这个定义写成硬规则）；
  //   ended—— 结算只执行一次（mode-contract §3），结算那一刻的棋盘与分数必须冻结。
  // 与无效移动同一条退出路径：原对象原样返回，不生成、不计分、不进历史。
  if (state.phase !== 'playing') return { state, changed: false, gained: 0 }

  const mode = getMode(state.modeId)
  const slide = slideBoard(state.board, direction, mode.mergeFamily)

  // 无效 Move：原对象原样返回——不生成、不计分、不进历史，
  // store 见到同一个引用连重渲染都不会发生。
  if (!slide.changed) return { state, changed: false, gained: 0 }

  // 达标是里程碑而非终局（mode-contract §3）：只升不降。合出目标块的那一步棋盘上
  // 一定有它，所以按棋盘判定即可，不必让 slide 再回报一个标志。
  const reachedTarget = state.reachedTarget || holdsAtLeast(slide.board, mode.target)
  // 胜利面板只弹一次：触发器是 reachedTarget 由假转真（本局第一次达标）。
  // 之后再合出目标块，phase 保持 playing——玩家不会被同一个面板打断第二次。
  const wonNow = reachedTarget && !state.reachedTarget

  const slid: GameState = {
    ...state,
    board: slide.board,
    score: state.score + slide.gained,
    moves: state.moves + 1,
    reachedTarget,
    phase: wonNow ? 'won' : 'playing',
  }

  // 只在棋盘真的变了之后才生成（mode-contract 的 Spawn 定义）
  const spawned = spawnTile(slid, restoreRng(slid.rngState))

  // 胜利优先于死局：同一步既合出目标块又把棋盘填死时，先让玩家看见胜利面板，
  // 继续玩时由 continueRun 发现「续走即死局」再转去死局面板（见下）。
  if (wonNow) return { state: spawned, changed: true, gained: slide.gained }

  // 死局在生成**之后**判定：新落的那个方块可能正是填满棋盘的那一格
  if (isDeadlocked(spawned)) {
    return {
      state: { ...spawned, phase: 'stuck' },
      changed: true,
      gained: slide.gained,
    }
  }
  return { state: spawned, changed: true, gained: slide.gained }
}

/**
 * 从胜利面板继续玩：分数与棋盘一个字节都不动，phase 回到 playing。
 *
 * 若续走的那一刻四方向已经没有合法移动（合出目标块的那一步同时把棋盘填死），
 * 直接转去 stuck——面板顺序由这里保证：玩家不会再看见第二次胜利面板。
 */
export function continueRun(state: GameState): GameState {
  if (state.phase !== 'won') return state
  return { ...state, phase: isDeadlocked(state) ? 'stuck' : 'playing' }
}

/**
 * 结束并记录：置 ended + endReason 'deadlock'，只允许从 stuck 进入。
 *
 * 幂等——已结算的局原样返回，因为 mode-contract §3 要求结算只执行一次；
 * 非 stuck 阶段同样原样返回：界面上根本没有这个入口，函数层面也不给走后门的机会。
 *
 * 记录本身归 T17：这里只把终态与原因定下来。
 */
export function settle(state: GameState): GameState {
  if (state.phase !== 'stuck') return state
  return { ...state, phase: 'ended', endReason: 'deadlock' }
}

/**
 * 开新局：终态化当前局（abandoned），**不写任何记录**；新局由调用方 createGame。
 *
 * mode-contract §3：「活跃局中直接『新游戏』= 放弃本局，不写任何记录」。
 * 记录归 T17。已结算的局原样返回，避免把 deadlock 改判成 abandoned
 * ——结算原因与结算本身一样，只发生一次。
 */
export function abandon(state: GameState): GameState {
  if (state.phase === 'ended') return state
  return { ...state, phase: 'ended', endReason: 'abandoned' }
}
