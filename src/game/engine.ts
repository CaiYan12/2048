import { getMode } from '../shared/modes'
import type { ModeId } from '../shared/modes'
import type {
  Board,
  Cell,
  Direction,
  GameState,
  MoveOutcome,
  RunPhase,
  Tile,
} from '../shared/types'
import { createRng, restoreRng } from '../shared/rng'
import {
  createBoard,
  holdsAtLeast,
  isDeadlocked,
  slideBoard,
  type Coordinate,
} from './board'
import { spawnTile } from './spawn'

/**
 * 规则内核的公开面（SPEC §4）
 *
 * 这里零 DOM 引用、零 Math.random、零 Date：种子由调用方在 createGame 时注入，
 * 之后随机进度存在 state.rngState 里跟着状态走；限时模式的**时钟**同样由调用方
 * 在每个需要当前时刻的地方（createGame 的 now、tick 的 now）注入（ADR-0001）。
 */

/**
 * 限时秒数 → 截止时间戳（epoch ms）；非限时模式恒为 null。
 *
 * 截止时间按 now + 限时秒数算，是**绝对**时间戳而不是「还剩多久」：后台挂起与刷新
 * 页面都改不了它（SPEC §3.1「后台、刷新不延长时限」）。界面上的剩余时间是调用方拿
 * deadline − now 现算的，所以这里不累计任何「已经过去多久」。T16 持久化 `deadline`
 * 之后，续玩落在同一个截止点上——这正是它必须是绝对值的全部理由。
 */
function deadlineOf(modeId: ModeId, now: number): number | null {
  const seconds = getMode(modeId).timeLimitSeconds
  return seconds === null ? null : now + seconds * 1000
}

/**
 * 开局：摆好空棋盘，连开两个方块。
 *
 * `now` 是调用方注入的当前时刻（epoch ms），**必填、没有默认值**：给个默认值就等于
 * 允许一局 Time Attack 带着 1970 年的截止点出生，T16 的恢复会把它读成「早就过期了」
 * 而立刻结算。非限时模式的 deadline 恒为 null，与 now 无关。
 */
export function createGame(modeId: ModeId, seed: number, now: number): GameState {
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
    // 开局种子同时记在 initialSeed 上：之后每一步只读 rngState，这个值跟着状态走
    // 但不参与规则——它是「这一局的题号」，给 T08 的跨零点不变量与 T16 的持久化读
    initialSeed: seed,
    rngState: rng.serialize(),
    moves: 0,
    deadline: deadlineOf(modeId, now),
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
 * swap 属于 T12，实现在本文件末尾：它同样是不可变过渡，同样靠引用相等表达
 * 「什么都没发生」（返回 null）。
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
 * 结束并记录：置 ended + 结束原因，只允许从 stuck / won 进入；幂等。
 *
 * 两条入口、两个原因：
 *   stuck → deadlock（死局后收工）；
 *   won   → won（mode-contract §3 状态图补订的 won→结算边：正文第一句就写着
 *          达成目标块后玩家可选「继续玩」或结算，图原先漏画了这条边）。
 *          `won` 是**赢下的收工**，不是败因。
 *
 * 幂等——已结算的局原样返回，因为 mode-contract §3 要求结算只执行一次；
 * 其余阶段（playing）同样原样返回：界面上根本没有这个入口，函数层面也不给走后门的机会。
 *
 * 记录本身归 T17：这里只把终态与原因定下来。
 */
export function settle(state: GameState): GameState {
  if (state.phase !== 'stuck' && state.phase !== 'won') return state
  return {
    ...state,
    phase: 'ended',
    endReason: state.phase === 'won' ? 'won' : 'deadlock',
  }
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

/**
 * 时间推进到 now。只在 playing 阶段到期时强制结算；其余情况原样返回（同一引用）
 *
 * mode-contract §3：「Time Attack 到时立即结算，此后不能 Undo、不能交换」——到期是
 * 唯一一条由**时间**而不是玩家触发的结算路径，与 settle / abandon 并列成为该节
 * 「其他进入 ended 的路径」里列出的第五条。
 *
 * 三条早退，逐条都有理由：
 *
 *   phase !== 'playing' —— **计时器不许把死局改判成超时。** 一局在 t=60s 死局、
 *     t=180s 到点，诚实的结束原因是 deadlock：它早就已经死了，等玩家点「结束并记录」
 *     才写下来。mode-contract §3 把超时定为**强制**结算，而把死局留成**玩家自己决定**
 *     的结算，所以到点在 won / stuck / ended 上一律不动作。
 *   deadline === null   —— 非限时模式对任何 now 都无感，epoch 与遥远的未来都算。
 *   now < deadline      —— 还没到点，原样返回。
 *
 * 边界含端点：判据写 `now < deadline`，所以 `now === deadline`（倒计时读到 0:00 的
 * 那一毫秒）就结算。反过来写 `now > deadline` 会让已经归零的表和多活一毫秒的棋盘
 * 同时存在，而读表周期（外壳 250ms）远长于一毫秒，这一毫秒的实际效果只是把到期
 * 时刻推给下一次读表——边界测试钉的就是这里，改一个字符它们会红。
 *
 * 幂等不靠第二套机制：`settle` / `abandon` / `tick` 三条路径都用同一个早退——
 * 已结算的局原样返回同一个对象，所以结算只执行一次（mode-contract §3）。
 *
 * **为什么它不复用 settle**（接口单规则 4 原话是「tick 应走共用的结算路径」，这里
 * 做不到，理由得写下来）：`settle` 的 endReason 是**从 phase 反推**的
 * （won → 'won'，其余 → 'deadlock'），而 tick 的入参 phase 恒为 'playing'——
 * 第一条早退已经把 won / stuck 挡在外面了。若真的改走 settle，一局 Time Attack
 * 到点会被写成 `deadlock`：把「强制超时」说成「玩家自己撞上死局」，正是
 * mode-contract §3 用两句不同文案去区分的那两件事。
 * （严格说，settle 的守卫只放 stuck / won 进，所以对 playing 态调用它会**原样返回**
 * 而不是写成 deadlock——但那时 tick 就根本不会结算了。两种读法都指向同一结论：
 * timeout 无法经由 settle 表达。）所以这里自己写终态字面量。
 *
 * 共用的不变量因此不在代码里，而在约定上，两条都一样重要，改 tick 时请一起守住：
 *
 *   1. **结算只执行一次，靠引用相等。** 三条路径的终局判据都是同一个早退
 *      （`phase !== 'playing'` / `phase === 'ended'`），已结算的局原样返回同一对象。
 *      store 与 React 都拿引用相等当「什么都没发生」看（见 useGameStore 的 tick）。
 *   2. **「该由谁决定结束」不外移。** tick 只回答「现在到没到点」，不回答「这局是
 *      怎么死的」——后者由 phase 与玩家的动作定，所以 timeout 只能由这条路径写。
 *
 * **交接给 T16 / T17**：`timeout` 是第四条终局迁移，与 settle（won / deadlock）、
 * abandon（abandoned）**不共用任何一行代码**。T16 持久化时只要有 deadline 与
 * phase 就够恢复这个状态（deadline 是绝对时间戳，见 deadlineOf）；T17 写记录时要
 * 记得终局原因有四个取值而不是三个——`runEndLabel` 的四个分支是它们的界面半边，
 * 别只按 settle 那两条去枚举。
 */
export function tick(state: GameState, now: number): GameState {
  if (state.phase !== 'playing') return state
  if (state.deadline === null || now < state.deadline) return state
  return { ...state, phase: 'ended', endReason: 'timeout' }
}

/**
 * 取一格。越界记作 undefined 而不是抛：棋盘里没有这一格，与「这一格是空的」
 * （null）是两件事，调用方该拒绝的是前者。
 *
 * 越界是可能到达的：坐标由调用方（渲染层）从 DOM 上读出来再递进来，
 * 而 DOM 与棋盘不一致的那一瞬间不值得让整局游戏崩掉。
 */
function cellAt(board: Board, [row, col]: Coordinate): Cell | undefined {
  return board[row]?.[col]
}

function isTile(cell: Cell | undefined): cell is Tile {
  return cell !== undefined && cell !== null && cell !== 'wall'
}

/** 同一格。坐标是零基 [row, col]，逐位比即可 */
function sameCellAt(a: Coordinate, b: Coordinate): boolean {
  return a[0] === b[0] && a[1] === b[1]
}

/**
 * 交换两枚数值方块的位置（T12 · SPEC §5 的 swap · 用户故事 15）。
 *
 * **它改变方块的位置，不改变任何规则量**：score / rngState / moves / nextTileId /
 * reachedTarget / initialSeed / deadline 一个都不动。所以除了 board 与 phase，
 * 新状态与旧状态逐字段相同——交换不是一次移动，不生成、不计分、不消耗随机进度。
 *
 * 非法选择返回 null，含义是「什么都没发生」：store 因此既不进撤销历史
 * （ADR-0003：无效输入不加历史），也不重渲染。四种非法：
 *   任一端是墙 / 空格 / 越界 —— 只有数值方块参与交换；
 *   两端同一格            —— 那是取消选择，由 store 的状态机处理，不是引擎的事；
 *   已终局（phase === 'ended'）—— mode-contract §3 关键不变量 4：「进入 ended 后，
 *                           Undo 与作弊交换一律不可用」。Time Attack 到点强制结算的
 *                           那一局也落在这里（settlement.undoDisabledAfterEnded /
 *                           swapDisabledAfterEnded 两条契约字段由这一行兑现）。
 *
 * **它同样是不可变过渡**：返回新对象、绝不改传入的那个。于是撤销历史白拿——
 * store 留着旧对象就是完整前态（ADR-0003），与 move 同一个道理，T03 的那个裁决
 * 在这里第二次兑现。
 */
export function swap(state: GameState, first: Coordinate, second: Coordinate): GameState | null {
  if (state.phase === 'ended') return null
  if (sameCellAt(first, second)) return null

  const firstCell = cellAt(state.board, first)
  const secondCell = cellAt(state.board, second)
  if (!isTile(firstCell) || !isTile(secondCell)) return null

  // 行先复制再改：棋盘是二维数组，只换外层的话内层行仍是共享的，
  // 「旧棋盘一个字节都没被碰」就不成立了
  const board: Board = state.board.map((row) => [...row])
  board[first[0]][first[1]] = secondCell
  board[second[0]][second[1]] = firstCell
  const swapped: GameState = { ...state, board }

  /**
   * 交换之后重判死局——mode-contract §3 把 swap 列为 `stuckRecoveryMoves` 的第二项，
   * 整个票的存在理由就是这一行。三种走向都要：
   *   stuck  → 解锁了：phase 回 playing（可恢复面板自动退下）；
   *   stuck  → 还死着：留在 stuck，玩家可以再换一次或撤销；
   *   playing→ 交换把它走死：转 stuck，与 move 完全同一个重判。
   *
   * won **不在**重判里：胜利里程碑面板正等玩家决定「继续玩」还是「结束并记录」，
   * 一次交换不该把那个面板撤掉。而方块动了之后四方向的合法性真的可能变，
   * 所以续走那一刻由 continueRun 重新判——它本来就是干这个的。
   */
  const phase: RunPhase =
    state.phase === 'won' ? state.phase : isDeadlocked(swapped) ? 'stuck' : 'playing'

  return { ...swapped, phase }
}
