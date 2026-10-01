import { getMode } from '../../shared/modes'
import type { ModeDefinition } from '../../shared/modes'
import type { Coordinate } from '../../game/board'
import { MERGE } from '../../game/merge'
import type { Board, GameState } from '../../shared/types'
import { valueLadder } from './ValueLadder'

/**
 * 「一念」的奖品：一对「合一次就达标」的相邻方块（T30 · 父规格架构决策 7）
 *
 * 纯函数，零 DOM、零随机——所以它能被单测逐条驱动，包括「六模式全部通用」这一条。
 * canvas、按钮与 store 的动作都在别处，这一文件只回答两个问题：**摆哪两个值**、
 * **摆在哪两格**。
 *
 * **为什么奖品那一对从模式自己声明的数据推**（父规格架构决策 7 的原话：「derived from the
 * mode's own declared data — the value ladder and the merge table — so the same code works
 * for all six modes without a special case per family」）：写死六个数组就是六份特例，而
 * `ModeDefinition` 早就声明了 `spawnValues` / `target` / `mergeFamily`——阶梯（ValueLadder）
 * 与合并表（merge.ts 的 MERGE）都只从这三样推。于是经典 1024/1024、斐波那契 987/1597、
 * 大棋盘合到 4096 是**同一个式子的三个答案**，没有一个家族分支。算式本身也不写死任何
 * 数值：单测对六个模式各证一遍「MERGE(低, 高) === 该模式的 target」。
 *
 * **为什么它住在渲染层而不是规则内核**：内核（src/game/）的三样东西这个函数一个都不
 * 碰——不迁移 phase、不结算、不判死局、不消耗随机进度。作弊交换之所以住在
 * engine.ts，是因为 mode-contract §3 把那一次交换列成了 `stuckRecoveryMoves` 的第二项，
 * 它是一条规则；一念是外壳递给你的一份礼物，父规格的 Out of scope 第一条就是
 * 「规则一个字节都不许动」。于是这与 `swapSelection` 同一条路：作弊的状态住在渲染层
 * 与 store，规则内核不认它。
 */

/**
 * 奖品那一对：阶梯上「合一次正好是本模式 target」的相邻两档，取**最高**的那一对。
 *
 * 从顶端往下扫而不是直接取末尾两档：末尾两档在两个家族里都恰好是答案，但「恰好」
 * 是阶梯构造的一个性质，不是一个可以顺手假设的前提。扫一遍的代价是 O(n²)（n ≤ 17），
 * 而它把「为什么这一对能达标」变成了一句当场可验的话。
 *
 * 幂家族里答案形如 (v, v)（1024 与 1024），斐波那契里形如 (前项, 后项)（987 与 1597）。
 * 两种形状都是这个扫法找到的第一对，所以没有「按家族换算法」这回事。
 */
export function wishPair(mode: ModeDefinition): readonly [number, number] {
  const ladder = valueLadder(mode)
  const merge = MERGE[mode.mergeFamily]
  for (let high = ladder.length - 1; high >= 0; high -= 1) {
    for (let low = high; low >= 0; low -= 1) {
      if (merge(ladder[low], ladder[high]) === mode.target) {
        return [ladder[low], ladder[high]]
      }
    }
  }
  // 走不到：阶梯的循环一直推到顶端不低于 target，而 target 正是它下面两档合出来的
  // （ValueLadder 的构造就是这么写的）。真走到这里说明模式声明自相矛盾——那时抛出来，
  // 比悄悄还一个不达标的奖品好定位（与 getMode 对未知 id 的同一条路子）
  throw new Error(`模式 ${mode.id} 的阶梯里找不到能合成 ${mode.target} 的相邻一对`)
}

/**
 * 摆在哪两个格子：两个**正交相邻**的非障碍格。
 *
 * 相邻必须是正交的（挨在一起），因为奖品要的是「一次滑动就并排碰上」：中间隔着一格的
 * 两处永远不会在同一次移动里碰头。障碍格一律跳过（T07：墙永不持数值）。
 *
 * 顺序是行优先、先右后下，于是同一张盘每次按下都摆同一处——奖品不抽奖，也就不用
 * 为它注入随机源。
 *
 * 优先两格都空着；没有相邻空格时退回**字面改掉两处相邻格子**（父规格架构决策 7 保留的
 * 旧调试钩子兜底）：晚局盘子快满，而「快满了」本来就是「快死了」，此刻还要求玩家自己
 * 腾地方，这个按钮就什么都不是了。
 */
export function wishCells(board: Board): readonly [Coordinate, Coordinate] | null {
  const pairs: (readonly [Coordinate, Coordinate])[] = []
  board.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (cell === 'wall') return
      if (c + 1 < row.length && board[r][c + 1] !== 'wall') {
        pairs.push([[r, c], [r, c + 1]])
      }
      if (r + 1 < board.length && board[r + 1][c] !== 'wall') {
        pairs.push([[r, c], [r + 1, c]])
      }
    })
  })
  if (pairs.length === 0) return null
  const bothEmpty = pairs.find(
    ([first, second]) =>
      board[first[0]][first[1]] === null && board[second[0]][second[1]] === null
  )
  return bothEmpty ?? pairs[0]
}

/**
 * 落成新状态：两枚新方块 + `nextTileId + 2`，**其余字段一律不变**。
 *
 * 与作弊交换逐字对照的性质：不计分、不递增步数、不消耗随机进度、不动 phase、不动
 * deadline、不动 reachedTarget（两个值都低于 target，摆下去也不该算「曾经达标」）。
 * 于是 undo 搬回的就是按下之前那一格棋盘（用户故事 25），而 session 写的形状与一次
 * 交换完全相同（用户故事 26：本局的数字照旧说真话）。
 *
 * `null` 只表示「盘上连两个相邻的非障碍格都没有」，调用方照旧原样返回——
 * 与 `swap` 的非法组合同一条约定。
 *
 * **阶段守卫不在这里**：它住在 store 的那个动作里（与 selectCell 的 `ended` 守卫同一条
 * 路）。这个函数只回答「摆到哪里」，于是单测能拿任何 phase 的状态驱动它。
 */
export function plantWishPair(state: GameState): GameState | null {
  const cells = wishCells(state.board)
  if (cells === null) return null
  const values = wishPair(getMode(state.modeId))
  // 行先复制再改：棋盘是二维数组，只换外层的话内层行仍是共享的，「旧棋盘一个字节都
  // 没被碰」就不成立（engine.swap 里同一句）
  const board: Board = state.board.map((row) => [...row])
  const [first, second] = cells
  board[first[0]][first[1]] = { id: state.nextTileId, value: values[0] }
  board[second[0]][second[1]] = { id: state.nextTileId + 1, value: values[1] }
  // 身份从 nextTileId 顺序发：盘上现存的身份全都小于它，所以两枚新的不会撞名，
  // 而刷新（T16）之后计数器跟着状态走，恢复的一局接着发也不会重号
  return { ...state, board, nextTileId: state.nextTileId + 2 }
}
