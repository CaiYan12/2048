import { describe, expect, test } from 'vitest'
import type { CellSpec } from './support'
import { MODES } from '../../src/shared/modes'
import { holdsAtLeast, slideBoard } from '../../src/game/board'
import { MERGE } from '../../src/game/merge'
import type { Direction } from '../../src/shared/types'
import type { GameState } from '../../src/shared/types'
import { valueLadder } from '../../src/renderer/components/ValueLadder'
import { plantWishPair, wishCells, wishPair } from '../../src/renderer/components/WishPair'
import { useGameStore } from '../../src/renderer/stores/useGameStore'
import { NOW, stateWithBoard, tilesOf, valueGrid } from './support'

/**
 * T30 的纵向切片：「一念」的奖品——一对「合一次就达标」的相邻方块。
 *
 * 分两半，与 T12 的 swap 同一条路子：**摆到哪里**是纯函数（WishPair.ts，零 DOM 零随机），
 * **怎么进历史、怎么写盘、阶段守卫**在 store。两端之间只有一个 null 约定——「什么都没
 * 发生」。
 *
 * 期望值全部手算 / 从模式声明推出来，没有一条是跑实现抄回来的：
 *   · 奖品那一对由 `MERGE(低, 高) === 该模式的 target` 现证（六个模式各一遍），
 *     而不是抄一份 [1024, 1024] 的数组——那正是本票要防的「按家族写特例」；
 *   · 摆位对着手铺局面逐格核过（哪两格相邻、哪两格都空、墙在哪）；
 *   · 「一次合并就达标」用真的内核（slideBoard）走过去，不靠眼看。
 */

/** 稀疏局面：12 个空格，任何相邻空格对都在里面 */
const SPARSE: CellSpec[][] = [
  [2, 4, null, null],
  [8, 16, null, null],
  [null, null, null, null],
  [null, null, null, null],
]

/**
 * 满盘、横纵相邻全不相等（拉丁方）：没有任何空格，于是「没有相邻空格可摆」的兜底
 * 就在这张盘上兑现。行 0 是 2/4/8/16，所以兜底改掉的是 (0,0) 与 (0,1)。
 */
const LATIN: CellSpec[][] = [
  [2, 4, 8, 16],
  [4, 8, 16, 2],
  [8, 16, 2, 4],
  [16, 2, 4, 8],
]

/**
 * Walls 模式的手铺局面：第 3 列（零基 col 3）三个空格竖着相邻，其余格子是数值方块。
 * 中心 2×2 是墙（mode-contract §1 冻结的位置），所以 (0,1)-(0,2) 这一对「挨着的空格」
 * 根本不存在——它们挨着的是墙。第一处都空的相邻对因此是 (0,3) 与 (1,3)。
 */
const WALLS_SPARSE: CellSpec[][] = [
  [2, 'wall', 'wall', null],
  [2, 'wall', 'wall', null],
  [4, 'wall', 'wall', null],
  [8, 16, 4, 2],
]

/**
 * 棋盘格的「墙」排成棋盘格：八个墙把八个非障碍格两两隔开，任两格都不正交相邻。
 * 这不是任何模式能打出来的局面（spawn 永远留得下一处可走），所以它只为证明
 * 「一处相邻都没有时纯函数说 no」而存在。
 */
const ISOLATED: CellSpec[][] = [
  [4, 'wall', 8, 'wall'],
  ['wall', 2, 'wall', 16],
  [8, 'wall', 2, 'wall'],
  ['wall', 16, 'wall', 4],
]

const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right']

/** 棋盘网格，便于对着注释里的手铺局面读 */
function grid(state: { board: Parameters<typeof valueGrid>[0] }): (number | 'W' | null)[][] {
  return valueGrid(state.board)
}

// ---------------------------------------------------------------- 纯函数半边

describe('wishPair：奖品那一对从模式自己声明的数据推出来', () => {
  test('六个模式各自推出来的一对，合一次正好是本模式的 target', () => {
    for (const mode of MODES) {
      const [low, high] = wishPair(mode)
      // 两个值都来自本模式自己的阶梯（不写死任何数值）
      const ladder = valueLadder(mode)
      expect(ladder, mode.id).toContain(low)
      expect(ladder, mode.id).toContain(high)
      expect(low, mode.id).toBeLessThanOrEqual(high)
      // 一次合并正好达标——这是「摆下去就快到了」的全部含义
      expect(MERGE[mode.mergeFamily](low, high), mode.id).toBe(mode.target)
      // 两个值都低于 target：摆下去还算一次玩家自己走到的达标，不是白给
      expect(high, mode.id).toBeLessThan(mode.target)
    }
  })

  test('规格点名的三个答案（同一个式子的三个解，不是三个特例）', () => {
    // 父规格的架构决策 7 与用户故事 21 / 22 / 23 逐字点名的三对数
    expect(wishPair(MODES.find((mode) => mode.id === 'classic')!)).toEqual([1024, 1024])
    expect(wishPair(MODES.find((mode) => mode.id === 'fibonacci')!)).toEqual([987, 1597])
    expect(wishPair(MODES.find((mode) => mode.id === 'big-board')!)).toEqual([2048, 2048])
  })

  test('阶梯顶端往下扫，取的是最高的那一对', () => {
    // 斐波那契的阶梯里 (377, 610) 也能合成 987、但不是 target；答案必须是顶端那一对
    const fibonacci = MODES.find((mode) => mode.id === 'fibonacci')!
    const ladder = valueLadder(fibonacci)
    const top = ladder[ladder.length - 1]
    const [low, high] = wishPair(fibonacci)
    expect(high).toBe(ladder[ladder.length - 2])
    expect(low).toBe(ladder[ladder.length - 3])
    expect(MERGE.fibonacci(low, high)).toBe(top)
  })
})

describe('wishCells：摆在哪两个格子', () => {
  test('两处都空着时优先用它们（行优先、先右后下）', () => {
    expect(wishCells(stateWithBoard(SPARSE).board)).toEqual([[0, 2], [0, 3]])
  })

  test('障碍格一律跳过：挨着墙的那两格「空格」不是可选项', () => {
    // (0,1) 与 (0,2) 是墙。若把墙当空格，第一对就会是它们；正确答案是第 3 列
    // 竖着相邻的那两格——墙一格都没被选中（T07：墙永不持数值）
    expect(wishCells(stateWithBoard(WALLS_SPARSE, 7, 'walls').board)).toEqual([[0, 3], [1, 3]])
  })

  test('没有相邻空格时按字面改掉两处相邻的方块（满盘兜底）', () => {
    // LATIN 满盘、没有一个空格：兜底落在第一处相邻对方块上，也就是 (0,0) 与 (0,1)。
    // 「盘子快满」本来就是「快死了」，此刻还要求玩家自己腾地方，这个按钮就什么都不是
    expect(wishCells(stateWithBoard(LATIN).board)).toEqual([[0, 0], [0, 1]])
  })

  test('一处相邻的非障碍格都没有时返回 null（什么都没发生）', () => {
    expect(wishCells(stateWithBoard(ISOLATED, 7, 'walls').board)).toBeNull()
  })
})

describe('plantWishPair：落成新状态', () => {
  test('经典模式：两枚 1024 落在相邻空格上，其余格子一个都没动', () => {
    const before = stateWithBoard(SPARSE, 7)
    const snapshot = JSON.stringify(before)

    const after = plantWishPair(before)

    expect(after).not.toBeNull()
    if (after === null) return
    expect(grid(after)).toEqual([
      [2, 4, 1024, 1024],
      [8, 16, null, null],
      [null, null, null, null],
      [null, null, null, null],
    ])
    // 身份从 nextTileId 顺序发（stateWithBoard 把它钉在 100），计数器 +2
    expect(after.board[0][2]).toEqual({ id: 100, value: 1024 })
    expect(after.board[0][3]).toEqual({ id: 101, value: 1024 })
    expect(after.nextTileId).toBe(102)
    // 入参一个字节都没被碰：不看这条，「改旧棋盘省一次复制」的实现也能全绿
    expect(JSON.stringify(before)).toBe(snapshot)
  })

  test('十一个 GameState 字段逐项钉：不计分、不记步数、不耗随机进度、不动相位', () => {
    // time-attack 打底：deadline 天然非 null，于是「截止点也没动」有东西可断。
    // 其余字段也各给一个不取默认值的数，免得断言落在一串巧合的初始值上
    const before: GameState = {
      ...stateWithBoard(SPARSE, 7, 'time-attack'),
      score: 4242,
      moves: 9,
      reachedTarget: true,
    }
    const after = plantWishPair(before)

    expect(after?.score).toBe(4242)
    expect(after?.moves).toBe(9)
    expect(after?.phase).toBe('playing')
    expect(after?.endReason).toBeNull()
    expect(after?.reachedTarget).toBe(true)
    expect(after?.rngState).toBe(7)
    expect(after?.initialSeed).toBe(before.initialSeed)
    expect(after?.deadline).toBe(NOW + 180_000)
    expect(after?.modeId).toBe('time-attack')
    // 字段集合没有变多也没有变少
    expect(Object.keys(after ?? {}).sort()).toEqual(Object.keys(before).sort())
  })

  test('墙一格都没被碰：Walls 模式下奖品落在可玩格里', () => {
    const before = stateWithBoard(WALLS_SPARSE, 7, 'walls')

    const after = plantWishPair(before)

    expect(grid(after ?? before)).toEqual([
      [2, 'W', 'W', 1024],
      [2, 'W', 'W', 1024],
      [4, 'W', 'W', null],
      [8, 16, 4, 2],
    ])
    // 障碍格的集合一个不多一个不少
    expect(tilesOf(after?.board ?? []).length).toBe(tilesOf(before.board).length + 2)
  })

  test('六个模式都通用：摆下去之后，四个方向里有一个合出 target', () => {
    // 用真的内核走过去（slideBoard，与引擎同一份代码），不靠眼看「这一对挨着」
    for (const mode of MODES) {
      for (const rows of [SPARSE, LATIN]) {
        const planted = plantWishPair(stateWithBoard(rows, 7, mode.id))
        expect(planted, `${mode.id}`).not.toBeNull()
        if (planted === null) continue
        const reached = DIRECTIONS.some((direction) =>
          holdsAtLeast(slideBoard(planted.board, direction, mode.mergeFamily).board, mode.target)
        )
        expect(reached, `${mode.id}：摆下去却合不出 ${mode.target}`).toBe(true)
      }
    }
  })

  test('没有相邻可写格时返回 null，棋盘原样', () => {
    const before = stateWithBoard(ISOLATED, 7, 'walls')
    expect(plantWishPair(before)).toBeNull()
  })
})

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

/** 按下一念的按钮 */
function press(): void {
  useGameStore.getState().plantWish()
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

describe('store：一念的奖品照作弊交换的形状', () => {
  test('按一次：进历史恰好一条，前态就是按下之前那一个对象', () => {
    const before = stateWithBoard(SPARSE, 7)
    mount(before)

    press()

    const state = useGameStore.getState()
    expect(state.history).toHaveLength(1)
    // 同一个引用：store 收着旧对象就是完整前态（ADR-0003），撤销因此白拿
    expect(state.history[0]).toBe(before)
    expect(state.game).not.toBe(before)
    // 棋盘上多出来一对相邻的 1024
    expect(grid(current())).toEqual([
      [2, 4, 1024, 1024],
      [8, 16, null, null],
      [null, null, null, null],
      [null, null, null, null],
    ])
    // 不计分、不记步数（用户故事 26）
    expect(state.game?.moves).toBe(0)
    expect(state.game?.score).toBe(0)
  })

  test('撤销把奖品收回去，而授予不收回（撤销搬回棋盘，不搬回发生过的事）', () => {
    const before = stateWithBoard(SPARSE, 7)
    mount(before)
    press()

    undo()

    const state = useGameStore.getState()
    // 棋盘回到按下之前
    expect(state.game).toBe(before)
    expect(state.history).toEqual([])
    // 而「拿到过一念」是这一局发生过的事，与 styleSwitches 同一条理由：撤销不退它
    expect(state.shenmoOutcomes).toEqual([])
    // 再按一次还在（按钮还在）——于是能反复摆，历史一条一条地长
    press()
    expect(useGameStore.getState().history).toHaveLength(1)
  })

  test('非 playing 阶段什么都不发生（won / stuck / ended 是面板在接管输入）', () => {
    for (const phase of ['won', 'stuck', 'ended'] as const) {
      const before: GameState = { ...stateWithBoard(SPARSE, 7), phase }
      mount(before)

      press()

      const state = useGameStore.getState()
      expect(state.game, phase).toBe(before)
      expect(state.history, phase).toEqual([])
    }
  })

  test('没开局也什么都不发生', () => {
    useGameStore.setState({ game: null, history: [] })
    press()
    expect(useGameStore.getState().game).toBeNull()
    expect(useGameStore.getState().history).toEqual([])
  })

  test('满盘兜底：没有相邻空格时改掉两处相邻的方块，一样进历史', () => {
    const before = stateWithBoard(LATIN, 7)
    mount(before)

    press()

    // (0,0) 与 (0,1) 的 2 / 4 被 1024 / 1024 顶掉，其余格子一个都没动
    expect(grid(current())).toEqual([
      [1024, 1024, 8, 16],
      [4, 8, 16, 2],
      [8, 16, 2, 4],
      [16, 2, 4, 8],
    ])
    expect(useGameStore.getState().history).toHaveLength(1)
  })

  test('拾取中的半个选择一并收摊：棋盘变了，等第二枚的那一枚不在原处了', () => {
    const before = stateWithBoard(SPARSE, 7)
    mount(before)
    useGameStore.setState({ swapArmed: true, swapSelection: [0, 1] })

    press()

    const state = useGameStore.getState()
    expect(state.swapArmed).toBe(false)
    expect(state.swapSelection).toBeNull()
  })
})
