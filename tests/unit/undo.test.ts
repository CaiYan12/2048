import { describe, expect, test } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { CellSpec } from './support'
import type { Direction, GameState } from '../../src/shared/types'
import { abandon, createGame } from '../../src/game/engine'
import { useGameStore } from '../../src/renderer/stores/useGameStore'
import { NOW, stateWithBoard, tilesOf, valueGrid } from './support'

/**
 * T11 的纵向切片：无次数上限的撤销。
 *
 * 撤销住在 store（`useGameStore` 的 history + undo），引擎一个字不改——T03 已经把
 * move 定为不可变过渡，`move` 对无效输入（含 phase 不是 playing）原样返回同一个引用，
 * 这就是「只有有效 Move 进历史」的全部依据（ADR-0003）。
 *
 * **为什么这里用 setState 驱动 store**：`startRun` 读 `window.location.search`
 * （?seed= / ?board= 两条调试缝都在那一层），而 vitest 跑在 node 环境里，没有 window。
 * 所以测试把 store 摆成「刚开局」之后再开始按键，与浏览器里的差别只在开局那一行——
 * 被断言的 history / undo / move 是同一份代码。键盘归属与真实 DOM 归
 * tests/e2e/undo.spec.ts（T11 只写不跑）。
 *
 * 期望值全部手算：下面每个局面的「哪几个方向有效」都是逐格核过相邻相等关系之后写在
 * 注释里的，不是跑一遍实现抄回来的——跑实现抄期望等于循环论证，什么也证不了。
 */

/** 把 store 摆成「刚开局」：等价于浏览器里点完开始游戏的那一刻 */
function mount(state: GameState): void {
  useGameStore.setState({ game: state, dailyDate: null, history: [] })
}

/** 走一步有效移动 */
function move(direction: Direction): void {
  useGameStore.getState().move(direction)
}

/** 撤销一步 */
function undo(): void {
  useGameStore.getState().undo()
}

function current(): GameState {
  const game = useGameStore.getState().game
  if (game === null) throw new Error('store 里没有对局')
  return game
}

/** 棋盘网格，便于对着注释里的手铺局面读 */
function grid(state: GameState): (number | 'W' | null)[][] {
  return valueGrid(state.board)
}

/**
 * 满盘、有**且仅有**一对相邻相等方块（(0,0)=2 与 (0,1)=2）的 4×4 局面。
 *
 * 逐格核过的相邻关系：
 *   行  2 2 8 16 / 8 16 2 8 / 16 2 4 16 / 4 8 16 4
 *   列  2 8 16 4 / 2 16 2 8 / 8 2 4 16 / 16 8 16 4
 * 只有 (0,0)-(0,1) 这一对相等，所以：
 *   · left  —— 合并那一对，行 0 变 [4, 8, 16, _]，**有效**；
 *   · right —— 同一对改成从右端扫，也合并，**有效**；
 *   · up / down —— 没有纵向相等对，且棋盘已满，一格都推不动，**无效**。
 *
 * 更要紧的是 left 之后的局面：合并腾出一格，生成正好落在那格 (0,3)。它的右邻 (0,2)=16、
 * 下邻 (1,3)=8，都不在生成值 {2, 4} 里，所以**无论抽到 2 还是 4，满盘 16 格再无任何
 * 相邻相等对**——left 之后必然死局。于是「之后还有几个方向有效」不依赖随机进度，
 * 下面的手算步数才是确定的。
 */
const ONE_PAIR: CellSpec[][] = [
  [2, 2, 8, 16],
  [8, 16, 2, 8],
  [16, 2, 4, 16],
  [4, 8, 16, 4],
]

/** 满盘、横纵相邻全不相等：四方向皆无合法移动的纯死局 */
const PURE_DEADLOCK: CellSpec[][] = [
  [2, 4, 2, 4],
  [8, 2, 4, 8],
  [2, 4, 8, 2],
  [4, 8, 2, 4],
]

/** row 0 只有一对 2，其余全空：四个方向都推得动（不是死局），且左移必合并 */
const PAIR_OPENING: CellSpec[][] = [
  [2, 2, null, null],
  [null, null, null, null],
  [null, null, null, null],
  [null, null, null, null],
]

/** 稀疏局面：左 / 上 / 右 / 下四个方向都有效（不会撞进死局） */
const SPARSE: CellSpec[][] = [
  [2, null, null, null],
  [null, null, null, null],
  [null, null, null, null],
  [null, null, null, 4],
]

/**
 * 一步即死局的经典局面：右移把行 0 推紧，腾出的 (0,0) 由生成补上，而那一格的右邻
 * (0,1)=8 与下邻 (1,0)=8 都不等于生成值，所以无论抽 2 还是 4 都是死局。
 */
const ONE_STEP_FROM_DEADLOCK: CellSpec[][] = [
  [8, 2, 4, null],
  [8, 4, 8, 2],
  [2, 8, 4, 8],
  [4, 2, 8, 4],
]

/** 长链用的固定方向序列。索引 = 已走完的有效步数，无效方向被跳过、不进这个计数 */
const CYCLE: readonly Direction[] = ['left', 'up', 'right', 'down']

const CHAIN_SEED = 20260926

/** 长链要求走到的有效步数——「超过旧 N 步」里的那个 N，取 300 */
const CHAIN_LENGTH = 300

/**
 * 有效移动的尝试上限。**有界**：超过就当构造失败并抛出，绝不做无界循环。
 * 8 倍是留给无效方向的余量：同一条定向序列在 5×5 上实测能走 475+ 步（上一班的探针），
 * 平均每步一次尝试，8 倍够宽，又不是一个可能达到的数字。
 */
const ATTEMPT_CAP = CHAIN_LENGTH * 8

/** 沿固定方向序列把 store 走到 target 步有效移动；无效方向跳过、不计步 */
function driveChain(target: number): void {
  let attempts = 0
  while (useGameStore.getState().history.length < target) {
    if (attempts >= ATTEMPT_CAP) {
      throw new Error(
        `构造长链失败：${attempts} 次尝试只走出 ${useGameStore.getState().history.length} 步有效移动`
      )
    }
    attempts += 1
    // 方向跟着「已走完的有效步数」走，所以被跳过的无效方向不会让序列错位
    const done = useGameStore.getState().history.length
    move(CYCLE[done % CYCLE.length])
  }
}

describe('只有有效 Move 进入历史', () => {
  test('一对一可合并的满盘：一次有效，其余方向一步历史都不留', () => {
    const opening = stateWithBoard(ONE_PAIR, 7)
    mount(opening)

    // 手算：5 次按键里只有第 1 次（left）有效——它合并掉满盘唯一那一对；
    // 合并腾出的格子被生成补上，而 2 与 4 都补不出新的相邻相等对，所以第 2 次起
    // 引擎直接判死局，left/up/right/down 一律原样返回、不进历史。
    move('left')
    move('up')
    move('right')
    move('down')
    move('left')

    const state = useGameStore.getState()
    expect(state.history).toHaveLength(1)
    expect(state.game?.moves).toBe(1)
    expect(state.game?.phase).toBe('stuck')
    // 历史里那一格正是移动前的那一个对象
    expect(state.history[0]).toBe(opening)
    const afterLeft = grid(current())
    // 合并腾出的那一格 (0,3) 被生成补上：补 2 还是 4 由随机进度决定，这里不钉数值，
    // 钉的是「两种都造不出新的相邻相等对」——右邻 (0,2)=16、下邻 (1,3)=8 都不等于生成值
    expect(afterLeft[0].slice(0, 3)).toEqual([4, 8, 16])
    expect([2, 4]).toContain(afterLeft[0][3])
    expect(afterLeft.slice(1)).toEqual([
      [8, 16, 2, 8],
      [16, 2, 4, 16],
      [4, 8, 16, 4],
    ])
  })

  test('纯死局满盘：四个方向全无效，一步历史都不留、状态引用不变', () => {
    const opening = stateWithBoard(PURE_DEADLOCK, 7)
    mount(opening)

    move('up')
    move('down')
    move('left')
    move('right')

    const state = useGameStore.getState()
    expect(state.history).toEqual([])
    // 同一个引用：无效移动在 store 这一侧连新 state 都没造出来
    expect(state.game).toBe(opening)
    expect(state.game?.moves).toBe(0)
  })
})

describe('撤销恢复 criterion-2 的全列表', () => {
  test('棋盘 / 分数 / 身份 / 随机进度 / moves / phase 一起回来，且是同一个对象', () => {
    // 用 time-attack 打底：deadline 天然非 null，不必手工编一个假截止点
    const before: GameState = {
      ...stateWithBoard(PAIR_OPENING, 7, 'time-attack'),
      score: 20,
      moves: 5,
    }
    mount(before)

    move('left')
    const moved = current()
    // 先确认这一步真的改变了棋盘，否则后面都在证明空操作
    expect(moved.moves).toBe(6)
    expect(moved.score).toBe(24)
    expect(grid(moved)[0][0]).toBe(4)

    undo()
    const restored = current()

    // 逐项钉：ticket 验收标准第二条的那张单子
    expect(restored.board).toEqual(before.board)
    expect(restored.score).toBe(20)
    expect(restored.moves).toBe(5)
    expect(restored.rngState).toBe(before.rngState)
    expect(restored.reachedTarget).toBe(before.reachedTarget)
    expect(restored.phase).toBe('playing')
    expect(restored.endReason).toBe(null)
    expect(restored.deadline).toBe(NOW + 180_000)
    expect(restored.initialSeed).toBe(1)
    expect(restored.nextTileId).toBe(100)
    // 身份逐格比对：同一个方块撤回来之后还是同一个 id，不是重新编号
    before.board.forEach((row, r) =>
      row.forEach((cell, c) => {
        expect(restored.board[r][c], `${r},${c}`).toEqual(cell)
      })
    )
    // 最强的形式：搬回来的就是当初收进历史的那一个对象，一字节都没差
    expect(restored).toBe(before)
  })

  test('撤销之后的那一次生成，与撤销前那一步完全相同', () => {
    // 专门钉 rngState：撤销恢复的是整个 GameState，所以随机进度跟着回来。
    // 只存差量的实现（棋盘差量、分数差量）在这里会静默走偏——生成落到另一格、
    // 换个数值或换个 id，十几步之内都没人发现。
    mount(stateWithBoard(PAIR_OPENING, 7))

    move('left')
    const first = current()
    undo()
    move('left')
    const second = current()

    // 同一个棋盘、同一次生成：落点、数值、身份全都相同
    expect(second).toEqual(first)
    expect(grid(second)).toEqual(grid(first))
    expect(second.rngState).toBe(first.rngState)
  })
})

describe('长链：撤过任何「旧 N 步」回到开局', () => {
  test('300 次有效移动之后连续 300 次撤销，回到的正是开局那一个对象', () => {
    const opening = createGame('big-board', CHAIN_SEED, NOW)
    mount(opening)

    // 有界驱动：循环 + 显式上限（超上限直接抛），不递归、不搜索
    driveChain(CHAIN_LENGTH)

    const deep = useGameStore.getState()
    expect(deep.history).toHaveLength(CHAIN_LENGTH)
    expect(deep.game?.moves).toBe(CHAIN_LENGTH)
    // 300 步还没走死：这条链是「长局中段」，不是「一局打完」，undo 才有东西可退
    expect(deep.game?.phase).toBe('playing')

    // 300 次撤销也是个循环。任何上限 / 环形缓冲在这里都会露馅：
    // 栈被截断的话，回到的不可能是开局那一个对象
    for (let i = 0; i < CHAIN_LENGTH; i++) undo()

    const back = useGameStore.getState()
    expect(back.history).toEqual([])
    // 同一引用：方块身份、随机进度、分数全部逐字节回到开局
    expect(back.game).toBe(opening)
  })
})

describe('空栈与已结算', () => {
  test('开局就撤销：空操作，返回同一个引用', () => {
    const opening = createGame('big-board', CHAIN_SEED, NOW)
    mount(opening)

    undo()
    undo()

    const state = useGameStore.getState()
    expect(state.game).toBe(opening)
    expect(state.history).toEqual([])
  })

  test('deadlock 结算之后撤销被拒绝', () => {
    const before = stateWithBoard(ONE_STEP_FROM_DEADLOCK, 7)
    mount(before)
    move('right')
    expect(current().phase).toBe('stuck')

    useGameStore.getState().settle()
    const settled = current()
    expect(settled.phase).toBe('ended')
    expect(settled.endReason).toBe('deadlock')

    undo()
    const state = useGameStore.getState()
    expect(state.game).toBe(settled)
    expect(state.history).toHaveLength(1)
  })

  test('达成目标后结算（endReason won）之后撤销被拒绝', () => {
    mount(
      stateWithBoard(
        [
          [2048, 2048, null, null],
          [null, null, null, null],
          [null, null, null, null],
          [null, null, null, null],
        ],
        7
      )
    )
    move('left')
    expect(current().phase).toBe('won')

    useGameStore.getState().settle()
    const settled = current()
    expect(settled.endReason).toBe('won')

    undo()
    expect(useGameStore.getState().game).toBe(settled)
    expect(useGameStore.getState().history).toHaveLength(1)
  })

  test('主动放弃（endReason abandoned）之后撤销被拒绝', () => {
    // 走 store 看不见 abandoned：newGame 在同一个 set 里先 abandon 再 createGame，
    // 被放弃的那个状态活不过一次赋值。所以用引擎把它造出来直接摆进 store——
    // 要证的是「phase === 'ended' 就拒绝」这条守卫本身，与它怎么走到 ended 无关。
    const opening = stateWithBoard(PAIR_OPENING, 7)
    const abandoned = abandon(opening)
    expect(abandoned.phase).toBe('ended')
    expect(abandoned.endReason).toBe('abandoned')

    mount(opening)
    move('left')
    useGameStore.setState({ game: abandoned })

    undo()
    const state = useGameStore.getState()
    expect(state.game).toBe(abandoned)
    expect(state.history).toHaveLength(1)
  })

  test('Time Attack 到点强制结算（endReason timeout）之后撤销被拒绝', () => {
    // deadline 置 0 = 早就到点；store 的 tick 用真实时钟读，Date.now() 必然大于它
    mount({ ...stateWithBoard(PAIR_OPENING, 7, 'time-attack'), deadline: 0 })
    move('left')
    expect(useGameStore.getState().history).toHaveLength(1)

    useGameStore.getState().tick()
    const timedOut = current()
    expect(timedOut.phase).toBe('ended')
    expect(timedOut.endReason).toBe('timeout')

    undo()
    const state = useGameStore.getState()
    expect(state.game).toBe(timedOut)
    expect(state.history).toHaveLength(1)
  })
})

describe('stuck 不是终局', () => {
  test('死局之后撤销成功，棋盘正是移动前那一个', () => {
    const before = stateWithBoard(ONE_STEP_FROM_DEADLOCK, 7)
    mount(before)
    move('right')
    expect(current().phase).toBe('stuck')

    undo()
    const state = useGameStore.getState()
    expect(state.game).toBe(before)
    expect(state.game?.phase).toBe('playing')
    expect(state.history).toEqual([])
    expect(grid(current())).toEqual([
      [8, 2, 4, null],
      [8, 4, 8, 2],
      [2, 8, 4, 8],
      [4, 2, 8, 4],
    ])
  })
})

describe('没有 assisted 标记', () => {
  /** 递归列出目录下的每个文件（node 环境的 fs；src/ 里没有符号链接） */
  function filesUnder(dir: string): string[] {
    const found: string[] = []
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) found.push(...filesUnder(full))
      else found.push(full)
    }
    return found
  }

  /** 键名里带 assist（大小写不敏感）的字段名 */
  function assistKeys(value: object): string[] {
    return Object.keys(value).filter((key) => /assist/i.test(key))
  }

  test('src/ 下没有任何一处提到 assisted', () => {
    // 文档里当然有（ADR-0003 / SPEC §6 都在讲「不加」），要被禁住的是代码：
    // 一旦有人给状态加一个标记，这条断言立刻红。
    const files = filesUnder('src')
    expect(files.length).toBeGreaterThan(0)
    const hits = files.filter((file) => /assist/i.test(readFileSync(file, 'utf8')))
    expect(hits).toEqual([])
  })

  test('状态、商店与历史里都没有这个字段', () => {
    mount(stateWithBoard(PAIR_OPENING, 7))
    move('left')
    const state = useGameStore.getState()

    expect(state.game).not.toBeNull()
    expect(assistKeys(state)).toEqual([])
    if (state.game) expect(assistKeys(state.game)).toEqual([])
    expect(state.history).toHaveLength(1)
    for (const entry of state.history) expect(assistKeys(entry)).toEqual([])
    // 撤销不留下痕迹：撤回来的那些历史条目本身也不带标记
    undo()
    for (const entry of useGameStore.getState().history) {
      expect(assistKeys(entry)).toEqual([])
    }
  })

  test('用过撤销的一局与没用过的那一局逐字节相同', () => {
    // ADR-0003 说「用过撤销的一局照样计入最高分与统计」，SPEC §6 把 assisted 划在范围外。
    // 这条是它的可执行半边：撤销唯一的代价是时间，不是状态。之所以成立，是因为
    // rngState 随整个 GameState 一起被恢复——中间插一次撤销再原样重放，随机流与
    // 身份计数都回到同一个点上，终局于是逐字节相同。
    mount(stateWithBoard(SPARSE, 7))
    move('left')
    move('up')
    const cleanEnd = current()

    mount(stateWithBoard(SPARSE, 7))
    move('left')
    undo() // 白走一步，再原样重放
    move('left')
    move('up')
    const assistedEnd = current()

    expect(assistedEnd).toEqual(cleanEnd)
    expect(JSON.stringify(assistedEnd)).toBe(JSON.stringify(cleanEnd))
    // 身份也是同一套：不是「值相同、编号不同」
    expect(tilesOf(assistedEnd.board).map((tile) => tile.id)).toEqual(
      tilesOf(cleanEnd.board).map((tile) => tile.id)
    )
  })
})
