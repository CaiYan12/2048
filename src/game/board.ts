import { getMode } from '../shared/modes'
import type { MergeFamily } from '../shared/modes'
import type { Board, Cell, Direction, GameState, Tile } from '../shared/types'
import { MERGE } from './merge'
import { mergeScore } from './score'

/** 零基 [row, col] 坐标，与 modes.ts 的 walls 声明同口径 */
type Coordinate = readonly [number, number]

/** 一条 lane：沿移动轴的一串连续非障碍格子，按自然序（左→右 / 上→下）排列 */
type Lane = readonly Coordinate[]

/** 棋盘表示 / 合法移动 / 死局判定（primal-setup-plan 的目录结构口径） */

/** 一次滑动的结果：新棋盘、得分增量、棋盘是否改变 */
export interface SlideResult {
  board: Board
  gained: number
  changed: boolean
}

export function createBoard(
  size: number,
  walls: readonly (readonly [number, number])[]
): Board {
  const board: Board = Array.from({ length: size }, (): Cell[] =>
    Array.from({ length: size }, (): Cell => null)
  )
  for (const [row, col] of walls) board[row][col] = 'wall'
  return board
}

/** 可生成格：非空格之外的所有格子都排除——障碍不生成，已有方块的格子也不生成 */
export function playableCells(board: Board): readonly Coordinate[] {
  const cells: Coordinate[] = []
  board.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (cell === null) cells.push([r, c])
    })
  })
  return cells
}

const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right']

/** 四个方向都没有合法移动即死局（CONTEXT.md 的 Game over） */
export function isDeadlocked(state: GameState): boolean {
  const family = getMode(state.modeId).mergeFamily
  return DIRECTIONS.every((direction) => !slideBoard(state.board, direction, family).changed)
}

/**
 * 棋盘上是否存在数值 ≥ value 的方块。
 *
 * 住在 board.ts 而不是 engine.ts：它是棋盘谓词，与 isDeadlocked / playableCells 同族；
 * 引擎用它判「里程碑是否达成」，开局夹具（?board= 那条调试缝）也要用同一份判据，
 * 免得「达标」这件事在仓库里出现两个实现。
 */
export function holdsAtLeast(board: Board, value: number): boolean {
  return board.some((row) =>
    row.some((cell) => cell !== null && cell !== 'wall' && cell.value >= value)
  )
}

/**
 * 沿方向滑动并合并，不生成、不计分之外的一切规则都在这里。
 *
 * 算法（mode-contract §2）：把每条 lane 的方块向目标边压紧，再从目标边向内逐对扫描；
 * 满足合并表即合并，产物在本次移动内不再合并；分数加每个产物的数值。
 * 障碍把 lane 切断，两侧各自独立，谁也不跨越障碍。
 */
export function slideBoard(
  board: Board,
  direction: Direction,
  family: MergeFamily
): SlideResult {
  const merge = MERGE[family]
  const next: Cell[][] = board.map((row) => [...row])
  let gained = 0

  for (const lane of lanesOf(board, direction)) {
    const tiles: Tile[] = []
    for (const [row, col] of lane) {
      const cell = board[row][col]
      if (cell !== null && cell !== 'wall') tiles.push(cell)
    }
    if (tiles.length === 0) continue

    // 压紧：方块按「离目标边的距离」排好，落格也从目标边那端开始发
    const towardStart = direction === 'left' || direction === 'up'
    const packed = towardStart ? tiles : [...tiles].reverse()
    const slots = towardStart ? lane : [...lane].reverse()

    const placed: Cell[] = []
    let i = 0
    while (i < packed.length) {
      const head = packed[i]
      const tail = packed[i + 1]
      if (tail === undefined) {
        placed.push(head)
        i += 1
        continue
      }
      // 操作数一律按 lane 自然序传入（与方向无关），理由见 merge.ts 的说明
      const earlier = towardStart ? head : tail
      const later = towardStart ? tail : head
      const successor = merge(earlier.value, later.value)
      if (successor === null) {
        placed.push(head)
        i += 1
        continue
      }
      // 身份归「落在目标格上」的那个方块：被吞掉的那个 id 留给渲染层做位移动画（T21），
      // 撤销（T11）也只需要一个身份来校验。
      placed.push({ id: head.id, value: successor })
      gained += mergeScore(successor)
      // 跳过两个操作数 = 产物本次移动内不再合并（mode-contract §2）
      i += 2
    }

    for (let k = 0; k < slots.length; k++) {
      const [row, col] = slots[k]
      next[row][col] = k < placed.length ? placed[k] : null
    }
  }

  const changed = board.some((row, r) =>
    row.some((cell, c) => !sameCell(cell, next[r][c]))
  )
  return { board: next, gained, changed }
}

/** lane 只由障碍切断：同一行/列里连续的非障碍格构成一条独立 lane */
function lanesOf(board: Board, direction: Direction): Lane[] {
  const size = board.length
  const alongRow = direction === 'left' || direction === 'right'
  const lanes: Lane[] = []
  for (let line = 0; line < size; line++) {
    let run: Coordinate[] = []
    for (let i = 0; i < size; i++) {
      const row = alongRow ? line : i
      const col = alongRow ? i : line
      if (board[row][col] === 'wall') {
        if (run.length > 0) lanes.push(run)
        run = []
        continue
      }
      run.push([row, col])
    }
    if (run.length > 0) lanes.push(run)
  }
  return lanes
}

function sameCell(a: Cell, b: Cell): boolean {
  if (a === null || b === null) return a === b
  if (a === 'wall' || b === 'wall') return a === b
  // 方块的值跟随身份不变，所以比 id 就够；id 相同即同一格同一块
  return a.id === b.id
}
