import { describe, expect, test } from 'vitest'
import type { CellSpec } from './support'
import type { Coordinate } from '../../src/game/board'
import type { GameState } from '../../src/shared/types'
import { abandon, swap } from '../../src/game/engine'
import { useGameStore } from '../../src/renderer/stores/useGameStore'
import { NOW, stateWithBoard, tilesOf, valueGrid } from './support'

/**
 * T12 的纵向切片：可撤销的作弊交换。
 *
 * 分两半：引擎的 swap（规则）在 src/game/engine.ts，选择态与历史在 store
 * （src/renderer/stores/useGameStore.ts）。两者之间只有一个 null 约定——
 * 「什么都没发生」——所以这里分别钉它两边：引擎侧钉 null 的四种来路与重判死局的
 * 三种走向，store 侧钉「只有有效交换进历史」与选择态状态机。
 *
 * 期望值全部手算：下面每张棋盘的相邻相等关系都逐格核过之后才写进注释，
 * 不是跑一遍实现抄回来的——跑实现抄期望等于循环论证，什么也证不了。
 */

/**
 * 满盘、横纵相邻全不相等。每一行都是上一行的循环左移：
 *   行  2 4 8 16 / 4 8 16 2 / 8 16 2 4 / 16 2 4 8
 *   列  2 4 8 16 / 4 8 16 2 / 8 16 2 4 / 16 2 4 8
 * 行与列各自内部没有相邻相等对，所以四方向皆无合法移动 = 纯死局。
 */
const LATIN: CellSpec[][] = [
  [2, 4, 8, 16],
  [4, 8, 16, 2],
  [8, 16, 2, 4],
  [16, 2, 4, 8],
]

/**
 * LATIN 把 (0,0) 与 (0,1) 对调之后的局面：
 *   4 2 8 16 / 4 8 16 2 / 8 16 2 4 / 16 2 4 8
 * 唯一的相邻相等对在**列 0**：(0,0)=4 与 (1,0)=4。逐格核过其余行列，
 * 没有任何别的相等对，所以这是「有且仅有一个方向有效」的活跃局。
 *
 * 它与 LATIN 是同一对棋盘的两个方向：a→b 与 b→a 都是同一个交换
 * （交换是自己的逆运算），下面重判死局那三条用例因此各用一次，互不复制。
 */
const LATIN_ONE_PAIR: CellSpec[][] = [
  [4, 2, 8, 16],
  [4, 8, 16, 2],
  [8, 16, 2, 4],
  [16, 2, 4, 8],
]

/**
 * LATIN 把 (0,0) 与 (3,3) 对调之后的局面：
 *   8 4 8 16 / 4 8 16 2 / 8 16 2 4 / 16 2 4 2
 * 动的只有行 0 与列 3 的头尾各一格：8 4 8 16 与 16 2 4 2 自身无相邻相等对，
 * 列 0 变成 8 4 8 16、列 3 变成 16 2 4 2，也都没有。于是**换了但仍是死局**。
 */
const LATIN_STILL_STUCK: CellSpec[][] = [
  [8, 4, 8, 16],
  [4, 8, 16, 2],
  [8, 16, 2, 4],
  [16, 2, 4, 2],
]

/** 稀疏局面：有空格就一定有方向推得动，所以任何交换都不会把它变成死局 */
const SPARSE: CellSpec[][] = [
  [2, 4, null, null],
  [8, 16, null, null],
  [null, null, null, null],
  [null, null, null, null],
]

/**
 * Walls 模式的手铺局面。障碍落在 mode-contract §1 冻结的居中 2×2 块上，
 * 其余八格里摆了数值方块——(1,1) 是墙，正是「墙不能选」那一枚的目标。
 * 四角与最后一行都是可玩格。
 */
const WALLS: CellSpec[][] = [
  [2, 'wall', 'wall', 4],
  [2, 'wall', 'wall', 8],
  [4, 'wall', 'wall', 2],
  [8, 16, 4, 2],
]

/** 把局面摆成「死局可恢复面板」那一刻：phase 是 stuck，棋盘是 LATIN */
function stuckBoard(rows: CellSpec[][] = LATIN): GameState {
  return { ...stateWithBoard(rows, 7), phase: 'stuck' }
}

/** 棋盘网格，便于对着注释里的手铺局面读 */
function grid(state: GameState): (number | 'W' | null)[][] {
  return valueGrid(state.board)
}

// ---------------------------------------------------------------- store 半边

/** 把 store 摆成「刚开局」：等价于浏览器里点完开始游戏的那一刻 */
function mount(state: GameState): void {
  useGameStore.setState({
    game: state,
    dailyDate: null,
    history: [],
    swapArmed: false,
    swapSelection: null,
  })
}

/** 开交换拾取 */
function arm(): void {
  useGameStore.getState().toggleSwap()
}

/** 拾取一枚方块（第一枚 / 同一枚取消 / 第二枚完成都由 store 判断） */
function pick(coordinate: Coordinate): void {
  useGameStore.getState().selectCell(coordinate)
}

/** 走一步移动 */
function move(direction: 'left' | 'right' | 'up' | 'down'): void {
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

function selection(): Coordinate | null {
  return useGameStore.getState().swapSelection
}

// ------------------------------------------------------------ 引擎：合法交换

describe('swap：一次合法交换', () => {
  test('两枚数值方块交换位置，分数不变，其余 GameState 字段逐项不变', () => {
    // time-attack 打底：deadline 天然非 null，于是「截止点也没动」有东西可断。
    // 其余字段也各给一个不取默认值的数，免得断言落在一串巧合的初始值上
    const before: GameState = {
      ...stateWithBoard(SPARSE, 7, 'time-attack'),
      score: 4242,
      moves: 9,
      nextTileId: 100,
      rngState: 123456,
      reachedTarget: true,
    }
    const snapshot = JSON.stringify(before)

    const after = swap(before, [0, 0], [1, 1])

    expect(after).not.toBeNull()
    if (after === null) return
    // 棋盘：两枚方块换了位置，其余格子一个都没动
    expect(grid(after)).toEqual([
      [16, 4, null, null],
      [8, 2, null, null],
      [null, null, null, null],
      [null, null, null, null],
    ])
    // 十个字段逐项钉（ticket 验收标准 1 的「分数不变」要的是这一整张单子）：
    // 交换移动方块，不改变任何规则量
    expect(after.score).toBe(4242)
    expect(after.rngState).toBe(123456)
    expect(after.moves).toBe(9)
    expect(after.nextTileId).toBe(100)
    expect(after.reachedTarget).toBe(true)
    expect(after.initialSeed).toBe(before.initialSeed)
    expect(after.deadline).toBe(NOW + 180_000)
    expect(after.modeId).toBe('time-attack')
    expect(after.endReason).toBe(null)
    // 交换不动 phase（除了重判死局那三种走向，见下一组）
    expect(after.phase).toBe('playing')
    // 整个 GameState 的字段集合没有变多也没有变少
    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort())
    // 入参一个字节都没被碰：不看这条，「改旧棋盘省一次复制」的实现也能全绿
    expect(JSON.stringify(before)).toBe(snapshot)
  })

  test('被交换的方块带着自己的身份走，盘上一枚不多一枚不少', () => {
    const before = stateWithBoard(SPARSE, 7)
    // 手铺局面按行序分配身份：(0,0) 是 1 号（值 2），(1,1) 是 4 号（值 16）
    const beforeTiles = tilesOf(before.board).map((tile) => tile.id)

    const after = swap(before, [0, 0], [1, 1])

    expect(after?.board[0][0]).toEqual({ id: 4, value: 16 })
    expect(after?.board[1][1]).toEqual({ id: 1, value: 2 })
    // 身份集合一个不多一个不少、也不重新编号（GLOSSARY.md 的 Tile）。
    // 排序后比对：tilesOf 按棋盘顺序读，交换之后顺序当然变了，那是位置的事
    expect(tilesOf(after?.board ?? []).map((tile) => tile.id).sort()).toEqual(
      [...beforeTiles].sort()
    )
  })

  test('交换不生成、不计分、不消耗随机进度', () => {
    // 与 move 的分界：move 之后 rngState 前进一步、moves +1、可能多一枚方块；
    // 交换一条都不占。空出来的那一格依旧空着，没有新方块落进去
    const before = stateWithBoard(SPARSE, 7)

    const after = swap(before, [0, 0], [1, 1])

    expect(after?.rngState).toBe(before.rngState)
    expect(after?.moves).toBe(0)
    expect(tilesOf(after?.board ?? [])).toHaveLength(tilesOf(before.board).length)
    // 4 枚方块、12 个空格：一个都没多
    expect(grid(after ?? before).flat().filter((cell) => cell === null)).toHaveLength(12)
  })
})

// ------------------------------------------------------------ 引擎：非法选择

describe('swap：非法选择返回 null', () => {
  test('墙不能选（Walls 模式，契约冻结的四处障碍）', () => {
    const before = stateWithBoard(WALLS, 7, 'walls')
    // (1,1) 是障碍：SPEC §60 原话「Walls never move, merge, spawn, or participate in swap」
    expect(before.board[1][1]).toBe('wall')
    // 墙当第一端、当第二端都一样
    expect(swap(before, [1, 1], [0, 0])).toBeNull()
    expect(swap(before, [0, 0], [1, 1])).toBeNull()
  })

  test('空格不能选', () => {
    const before = stateWithBoard(SPARSE, 7)
    expect(before.board[0][2]).toBeNull()
    expect(swap(before, [0, 2], [0, 0])).toBeNull()
    expect(swap(before, [0, 0], [0, 2])).toBeNull()
  })

  test('同一格不能选：那是取消选择，不是一次交换', () => {
    const before = stateWithBoard(LATIN, 7)
    expect(swap(before, [0, 0], [0, 0])).toBeNull()
  })

  test('越界坐标不能选', () => {
    const before = stateWithBoard(LATIN, 7)
    // 棋盘里没有这个坐标：与「这一格是空的」是两件事，一样拒绝
    expect(swap(before, [0, 9], [0, 0])).toBeNull()
    expect(swap(before, [0, 0], [7, 0])).toBeNull()
  })

  test('已终局不能选——四个结束原因共用同一条守卫', () => {
    // mode-contract §3 关键不变量 4「进入 ended 后，Undo 与作弊交换一律不可用」，
    // 对应契约 JSON 的 swapDisabledAfterEnded。终局原因有四个取值，
    // 所以逐个摆一次：只测一个的实现可能把另外三个漏掉
    const base = stateWithBoard(LATIN, 7)
    for (const endReason of ['deadlock', 'won', 'abandoned', 'timeout'] as const) {
      const ended: GameState = { ...base, phase: 'ended', endReason }
      expect(swap(ended, [0, 0], [0, 1]), endReason).toBeNull()
    }
    // Time Attack 那条真实路径：到点由 tick 强制结算，此后交换不可用
    const timedOut = { ...base, phase: 'ended' as const, endReason: 'timeout' as const }
    expect(swap(timedOut, [0, 3], [3, 0])).toBeNull()
    // 用 abandon 走一遍真实入口，证明上面摆出来的 ended 与引擎造出来的是同一种
    expect(swap(abandon(base), [0, 0], [0, 1])).toBeNull()
  })

  test('非法选择不动棋盘：返回值是 null，没有半个新状态', () => {
    const before = stateWithBoard(SPARSE, 7)
    const snapshot = JSON.stringify(before)

    expect(swap(before, [0, 2], [0, 0])).toBeNull() // 空格
    expect(swap(before, [0, 0], [0, 0])).toBeNull() // 同一格
    // null 而不是一个「等价的新对象」：store 靠这条区分「什么都没发生」
    // 与「交换成了但棋盘恰好一样」（两枚同值方块对调），后者必须进历史
    expect(JSON.stringify(before)).toBe(snapshot)
  })
})

// ---------------------------------------------------- 引擎：重判死局（本票核心）

describe('swap：重判死局（mode-contract §3 的 stuckRecoveryMoves）', () => {
  test('stuck → 换出一个合法移动 → phase 回 playing', () => {
    // 本票存在的理由。LATIN 是纯死局，把 (0,0) 与 (0,1) 对调后列 0 出现
    // (0,0)=4 与 (1,0)=4 这一对相等方块——于是 up / down 第一次有了合法移动
    const before = stuckBoard()
    // 开局棋盘的形状也要钉住（LATIN 逐字对上）：`grid` 的定义就是 valueGrid，
    // 拿它跟自己比是恒真断言——把 swap 整个删了这条也绿，所以期望值必须手写
    expect(grid(before)).toEqual([
      [2, 4, 8, 16],
      [4, 8, 16, 2],
      [8, 16, 2, 4],
      [16, 2, 4, 8],
    ])

    const after = swap(before, [0, 0], [0, 1])

    expect(after).not.toBeNull()
    expect(after?.phase).toBe('playing')
    // 换出来的正是 LATIN_ONE_PAIR（见上面那张手铺局面）
    expect(grid(after ?? before)).toEqual(valueGrid(stateWithBoard(LATIN_ONE_PAIR, 7).board))
    // 分数、随机进度、步数一个都没动——恢复是白拿的，代价只有一次撤销
    expect(after?.score).toBe(before.score)
    expect(after?.moves).toBe(before.moves)
    expect(after?.rngState).toBe(before.rngState)
  })

  test('stuck → 换了还是死局 → 留在 stuck', () => {
    // 换 (0,0) 与 (3,3)：行 0 仍是 8 4 8 16、列 3 仍是 16 2 4 2，
    // 都没有相邻相等对，四方向依旧无合法移动。于是面板不该消失——
    // 「换一下就好」不是保证，玩家可以再换一次或者撤销
    const before = stuckBoard()

    const after = swap(before, [0, 0], [3, 3])

    expect(after?.phase).toBe('stuck')
    expect(grid(after ?? before)).toEqual(valueGrid(stateWithBoard(LATIN_STILL_STUCK, 7).board))
  })

  test('playing → 交换把它换死 → 转 stuck', () => {
    // 与第一条同一对棋盘、相反方向：LATIN_ONE_PAIR 本来有那唯一一对可合并方块，
    // 把它换回 LATIN 之后四方向皆无合法移动。这一步证明「重判」不是单向的兜底，
    // 而是与 move 判死局同一个函数（board.ts 的 isDeadlocked）
    const before = stateWithBoard(LATIN_ONE_PAIR, 7)
    expect(before.phase).toBe('playing')

    const after = swap(before, [0, 0], [0, 1])

    expect(after?.phase).toBe('stuck')
    expect(grid(after ?? before)).toEqual(valueGrid(stateWithBoard(LATIN, 7).board))
  })

  test('won 不在重判里：胜利里程碑面板不因为一次交换被撤掉', () => {
    // 胜利面板正等玩家决定「继续玩」还是「结束并记录」，此时交换不该把 phase 改掉。
    // 方块确实动了，所以续走那一刻由 continueRun 重新判（见下一段）
    const before: GameState = { ...stateWithBoard(SPARSE, 7), phase: 'won' }

    const after = swap(before, [0, 0], [1, 1])

    expect(after?.phase).toBe('won')
    expect(grid(after ?? before)[0][0]).toBe(16)
  })
})

// ------------------------------------------------------------ store：进历史

describe('store：一次有效交换进历史恰好一条', () => {
  test('历史里那一格正是交换前那一个对象', () => {
    const before = stateWithBoard(LATIN_ONE_PAIR, 7)
    mount(before)
    arm()

    pick([0, 0])
    pick([0, 1])

    const state = useGameStore.getState()
    expect(state.history).toHaveLength(1)
    // 同一个引用：store 收着旧对象就是完整前态（ADR-0003），撤销因此白拿
    expect(state.history[0]).toBe(before)
    expect(state.game).not.toBe(before)
    expect(state.game?.phase).toBe('stuck')
    // 换出来的棋盘就是 LATIN（见上面那两张手铺局面）
    expect(grid(current())).toEqual(valueGrid(stateWithBoard(LATIN, 7).board))
  })

  test('连续两次拾取各完成一次交换：历史两条，顺序是新的在后', () => {
    mount(stateWithBoard(LATIN_ONE_PAIR, 7))
    arm()
    pick([0, 0])
    pick([0, 1])
    const afterFirst = current()
    arm()
    pick([0, 0])
    pick([0, 1])

    const state = useGameStore.getState()
    expect(state.history).toHaveLength(2)
    expect(state.history[1]).toBe(afterFirst)
    // 两次同一个交换 = 换回原样：棋盘回到 LATIN_ONE_PAIR，那一对可合并方块回来了，
    // 于是 phase 由引擎重判回 playing。记账在 store，判断在引擎，两处不重复
    expect(state.game?.phase).toBe('playing')
    expect(grid(current())).toEqual(valueGrid(stateWithBoard(LATIN_ONE_PAIR, 7).board))
  })

  test('非法交换不进历史，state 连换都不换', () => {
    // 墙 / 空格到不了界面（底板层 pointer-events:none，没有方块元素可点），
    // 但 store 的 selectCell 是公开动作，必须自己守住引擎的 null 约定——
    // 否则「非法交换也压一条历史」会让撤销凭空多退一格
    const before = stateWithBoard(WALLS, 7, 'walls')
    mount(before)
    arm()
    pick([0, 0])

    pick([1, 1]) // 墙

    const state = useGameStore.getState()
    expect(state.history).toEqual([])
    expect(state.game).toBe(before)
    // 选择原样留着：玩家可以改选别的一枚，不必从入口重来
    expect(state.swapSelection).toEqual([0, 0])
  })

  test('没在拾取态时 selectCell 什么都不发生', () => {
    const before = stateWithBoard(LATIN_ONE_PAIR, 7)
    mount(before)

    pick([0, 0])

    const state = useGameStore.getState()
    expect(state.game).toBe(before)
    expect(state.history).toEqual([])
    expect(state.swapSelection).toBeNull()
  })

  test('已终局时 selectCell 被拒绝（与 undo 同一条守卫）', () => {
    // mode-contract §3：ended 之后 Undo 与交换一律不可用。守卫住在 store 里，
    // 面板的显隐只是它的界面半边——少了这一条，键盘路径能绕过面板
    const before = { ...stateWithBoard(LATIN_ONE_PAIR, 7), phase: 'ended' as const, endReason: 'deadlock' as const }
    mount(before)
    arm()

    pick([0, 0])

    const state = useGameStore.getState()
    expect(state.history).toEqual([])
    expect(state.game).toBe(before)
    expect(state.swapSelection).toBeNull()
  })
})

// -------------------------------------------------------- store：选择态状态机

describe('store：选择态状态机', () => {
  test('第一枚拾取只记选择：棋盘、历史、随机进度都不动', () => {
    const before = stateWithBoard(LATIN_ONE_PAIR, 7)
    mount(before)
    arm()

    pick([0, 1])

    const state = useGameStore.getState()
    expect(state.swapSelection).toEqual([0, 1])
    expect(state.swapArmed).toBe(true)
    // 同一个引用：第一枚还没有任何规则后果
    expect(state.game).toBe(before)
    expect(state.history).toEqual([])
  })

  test('同一枚再拾一次 = 取消选择，拾取态仍然开着', () => {
    // ticket 验收标准 1 的原话。只清选择不关拾取：玩家可以立刻另选一枚，
    // 不必重新走一遍入口
    mount(stateWithBoard(LATIN_ONE_PAIR, 7))
    arm()
    pick([0, 1])

    pick([0, 1])

    const state = useGameStore.getState()
    expect(state.swapSelection).toBeNull()
    expect(state.swapArmed).toBe(true)
    expect(state.history).toEqual([])
  })

  test('Esc 把选择与拾取态一起清掉（用户故事 16 的「不用指针退出」）', () => {
    mount(stateWithBoard(LATIN_ONE_PAIR, 7))
    arm()
    pick([0, 1])

    useGameStore.getState().clearSwap()

    const state = useGameStore.getState()
    expect(state.swapSelection).toBeNull()
    expect(state.swapArmed).toBe(false)
  })

  test('一次有效移动把选择与拾取态一起清掉', () => {
    // 棋盘变了，「等第二枚的那一枚」已经不在玩家以为的地方
    mount(stateWithBoard(LATIN_ONE_PAIR, 7))
    arm()
    pick([0, 1])

    move('down')

    const state = useGameStore.getState()
    expect(state.swapSelection).toBeNull()
    expect(state.swapArmed).toBe(false)
    expect(state.history).toHaveLength(1)
  })

  test('无效移动什么都不清：什么都没发生', () => {
    // 与「无效移动不进历史」同一条原则：一次被引擎拒绝的按键既不动棋盘，
    // 也不该擦掉玩家刚做的选择
    mount(stateWithBoard(LATIN, 7)) // 纯死局：四个方向全部无效
    arm()
    pick([0, 1])

    move('up')
    move('down')

    const state = useGameStore.getState()
    expect(state.swapSelection).toEqual([0, 1])
    expect(state.swapArmed).toBe(true)
    expect(state.history).toEqual([])
  })

  test('一次撤销把选择与拾取态一起清掉', () => {
    mount(stateWithBoard(LATIN_ONE_PAIR, 7))
    move('down')
    arm()
    pick([0, 1])

    undo()

    const state = useGameStore.getState()
    expect(state.swapSelection).toBeNull()
    expect(state.swapArmed).toBe(false)
    expect(state.history).toEqual([])
  })

  test('Time Attack 到点结算：拾取态与选择一并收摊', () => {
    // 离开本局的五条路（move / undo / startRun / newGame / tick）里，tick 是唯一
    // 漏清这两个字段的——settle 与 continueRun 在拾取态下根本到不了：拾取中 phase
    // 是 playing 或 stuck，而死局面板上的「结束并记录」被拾取收起（App.tsx 的
    // overlay 在 armed 时不渲染），StatusBar 上那个按钮也只挂在 playing / stuck。
    // 所以「人还在拾取态里，局却走了」只有到点这一种走法，这条用例就是钉它。
    //
    // deadline 置 0 = 早就到点；store 的 tick 用真实时钟读（Date.now() 必然大于 0），
    // 与 undo.test.ts 那条超时撤销用的是同一个手法
    mount({ ...stateWithBoard(LATIN_ONE_PAIR, 7, 'time-attack'), deadline: 0 })
    arm()
    pick([0, 1])
    expect(useGameStore.getState().swapArmed).toBe(true)

    useGameStore.getState().tick()

    const state = useGameStore.getState()
    expect(state.swapArmed).toBe(false)
    expect(state.swapSelection).toBeNull()
    expect(state.game?.phase).toBe('ended')
    expect(state.game?.endReason).toBe('timeout')
  })

  test('一次完成的交换自己收摊：拾取态不留在那儿', () => {
    mount(stateWithBoard(LATIN_ONE_PAIR, 7))
    arm()
    pick([0, 0])
    pick([0, 1])

    const state = useGameStore.getState()
    expect(state.swapArmed).toBe(false)
    expect(state.swapSelection).toBeNull()
    expect(state.history).toHaveLength(1)
  })

  test('toggleSwap 再按一次：拾取态关掉，选择一并作废', () => {
    mount(stateWithBoard(LATIN_ONE_PAIR, 7))
    arm()
    pick([0, 1])

    useGameStore.getState().toggleSwap()

    const state = useGameStore.getState()
    expect(state.swapArmed).toBe(false)
    expect(state.swapSelection).toBeNull()
  })

  test('选择态不跨局：开局与新游戏都把它清掉', () => {
    // 拾取态与历史同一个边界（见 startRun / newGame 的注释）
    mount(stateWithBoard(LATIN_ONE_PAIR, 7))
    arm()
    pick([0, 1])
    useGameStore.setState({ swapArmed: true })

    useGameStore.getState().newGame()
    const fresh = useGameStore.getState()
    expect(fresh.swapArmed).toBe(false)
    expect(fresh.swapSelection).toBeNull()
    expect(fresh.history).toEqual([])
  })
})

// ------------------------------------------------------------ 撤销一次交换

describe('撤销一次交换', () => {
  test('undo 之后搬回来的正是交换前那一个对象，选择态也清掉', () => {
    const before = stateWithBoard(LATIN_ONE_PAIR, 7)
    mount(before)
    arm()
    pick([0, 0])
    pick([0, 1])
    expect(current().phase).toBe('stuck')

    undo()
    const restored = current()

    // 逐项钉（criterion-2 的可见半边）：棋盘、分数、身份、随机进度、步数、phase
    expect(restored).toBe(before)
    expect(restored.phase).toBe('playing')
    expect(grid(restored)).toEqual(valueGrid(stateWithBoard(LATIN_ONE_PAIR, 7).board))
    expect(restored.score).toBe(before.score)
    expect(restored.moves).toBe(before.moves)
    expect(restored.rngState).toBe(before.rngState)
    expect(restored.nextTileId).toBe(before.nextTileId)
    // 选择态是界面自己的事，撤销不把它当历史搬回来
    expect(useGameStore.getState().swapSelection).toBeNull()
    expect(useGameStore.getState().swapArmed).toBe(false)
    expect(useGameStore.getState().history).toEqual([])
  })
})
