import { describe, expect, test } from 'vitest'
import { getMode } from '../../src/shared/modes'
import type { Direction, GameState } from '../../src/shared/types'
import { createBoard, isDeadlocked, playableCells } from '../../src/game/board'
import { continueRun, createGame, move } from '../../src/game/engine'
import { stateWithBoard, tilesOf, valueGrid } from './support'
import { tileDigits } from '../../src/renderer/components/TileLabel'

/**
 * T06 的 5×5 切片：引擎一个字没改（T03 起它就读 mode.size / mergeFamily /
 * playableCells，T05 已经用一整个斐波那契家族证明过），所以这里全经公开面驱动，
 * 证的是「25 格的棋盘真的能玩」。
 *
 * 期望值全部由同一套规则内核离线推演得到（临时脚本跑完即删，未进提交）。
 *
 * 两条是这票的核心：
 *   1. **边缘行/列**。4×4 的 lane 用例里，四条边上的格子一直被覆盖着（边就是边），
 *      但只要某个 bug 只碰内部 lane，4×4 也能全绿——所以这里的四个手铺局面把
 *      可合并对分别放在上边行、下边行、左边列、右边列，并断言**垂直方向一格不动**，
 *      证明动的确实是那条边，不是顺手带动了别处。
 *   2. **满盘即确定性**。四个局面都铺满 25 格，于是移动产生的唯一空格由生成填上，
 *      而生成只依赖 rngState——期望棋盘仍然逐格写死，不必靠随机。
 */

/** 模式声明只读一份：测试里不抄 5 与 4096 */
const MODE = getMode('big-board')

/** 5×5 的惰性填充：横纵相邻都不相等，且本来就压紧，四个方向都推不动 */
const FILLER: (number | null)[][] = [
  [2, 4, 2, 4, 2],
  [4, 2, 4, 2, 4],
  [2, 4, 2, 4, 2],
  [4, 2, 4, 2, 4],
  [2, 4, 2, 4, 2],
]

/** 在惰性填充上改几格，得到只剩指定局面的 25 格棋盘 */
function withEdits(...edits: [number, number, number][]): (number | null)[][] {
  const rows = FILLER.map((row) => [...row])
  for (const [row, col, value] of edits) rows[row][col] = value
  return rows
}

/** 上边行（row 0）里的一对 */
const ROW_TOP = withEdits([0, 0, 8], [0, 1, 8])
/** 下边行（row 4）里的一对 */
const ROW_BOTTOM = withEdits([4, 3, 8], [4, 4, 8])
/** 左边列（column 0）里的一对 */
const COL_LEFT = withEdits([0, 0, 8], [1, 0, 8])
/** 右边列（column 4）里的一对 */
const COL_RIGHT = withEdits([3, 4, 8], [4, 4, 8])

const ALL_DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right']

/** 棋盘上数值方块占据的「row,col」集合 */
function occupiedCells(board: GameState['board']): Set<string> {
  const positions = new Set<string>()
  board.forEach((row, r) =>
    row.forEach((cell, c) => {
      if (cell !== null && cell !== 'wall') positions.add(`${r},${c}`)
    })
  )
  return positions
}

/** isDeadlocked 与「四方向都推不动」必须是同一件事：前者是谓词，后者是它的可观察后果 */
function noDirectionMoves(state: GameState): boolean {
  return ALL_DIRECTIONS.every((direction) => !move(state, direction).changed)
}

describe('模式声明：5×5 与 4096 都来自契约', () => {
  test('25 格、2 的幂、目标 4096、无障碍、不限时', () => {
    expect(MODE.size).toBe(5)
    expect(MODE.target).toBe(4096)
    expect(MODE.mergeFamily).toBe('powers-of-two')
    expect(MODE.spawnValues).toEqual([2, 4])
    expect(MODE.walls).toEqual([])
    expect(MODE.timeLimitSeconds).toBe(null)
  })

  test('createBoard(5, []) 铺出正好 25 个空格，全部可生成', () => {
    const board = createBoard(MODE.size, MODE.walls)
    expect(board).toHaveLength(MODE.size)
    for (const row of board) expect(row).toHaveLength(MODE.size)
    // 无障碍模式：25 格都能生成。这是「生成覆盖四条边」的前提
    expect(playableCells(board)).toHaveLength(25)
    expect(tilesOf(board)).toHaveLength(0)
  })
})

describe('开局：固定种子的 5×5', () => {
  test('固定种子的开局逐格确定，两个方块分居两格', () => {
    const state = createGame('big-board', 20260926)

    expect(valueGrid(state.board)).toEqual([
      [null, null, null, null, null],
      [null, null, null, null, null],
      [null, null, null, 2, null],
      [null, null, null, null, null],
      [null, null, null, null, 4],
    ])
    // 两个方块用掉 1、2 号身份，下一个是 3；25 格棋盘上只有 2 块
    expect(state.nextTileId).toBe(3)
    expect(tilesOf(state.board)).toHaveLength(2)
    expect(occupiedCells(state.board).size).toBe(2)
    expect(state.score).toBe(0)
    expect(state.moves).toBe(0)
    expect(state.reachedTarget).toBe(false)
    expect(state.deadline).toBe(null)
  })

  test('多个种子的开局都只出现 2 与 4，两个方块永远分居两格', () => {
    for (const seed of [1, 42, 7, 999983]) {
      const state = createGame('big-board', seed)
      const tiles = tilesOf(state.board)
      expect(tiles, `seed ${seed}`).toHaveLength(2)
      for (const tile of tiles) expect(MODE.spawnValues, `seed ${seed}`).toContain(tile.value)
      // 分居两格 = 两个不同坐标；身份天然不同，坐标才说明问题
      expect(occupiedCells(state.board).size, `seed ${seed}`).toBe(2)
      // 棋盘尺寸来自声明，不是测试里抄的 5
      expect(state.board, `seed ${seed}`).toHaveLength(MODE.size)
      for (const row of state.board) expect(row, `seed ${seed}`).toHaveLength(MODE.size)
    }
  })
})

describe('移动覆盖边缘行与边缘列', () => {
  /**
   * 四个局面各只有一对同值块，分别贴在上边行、下边行、左边列、右边列。
   * 断言「活着」的那一侧方向（另一侧会把棋盘推成死局，见死局小节），
   * 以及垂直方向一格不动——后一半才是「边缘真的在动」的证据：
   * 少了它，一个只在内部 lane 出错的实现也能让这些格子全绿。
   */
  const cases = [
    {
      name: '上边行：左移',
      rows: ROW_TOP,
      direction: 'left' as const,
      expected: [
        [16, 2, 4, 2, 2],
        [4, 2, 4, 2, 4],
        [2, 4, 2, 4, 2],
        [4, 2, 4, 2, 4],
        [2, 4, 2, 4, 2],
      ],
    },
    {
      name: '下边行：右移',
      rows: ROW_BOTTOM,
      direction: 'right' as const,
      expected: [
        [2, 4, 2, 4, 2],
        [4, 2, 4, 2, 4],
        [2, 4, 2, 4, 2],
        [4, 2, 4, 2, 4],
        [2, 2, 4, 2, 16],
      ],
    },
    {
      name: '左边列：上移',
      rows: COL_LEFT,
      direction: 'up' as const,
      expected: [
        [16, 4, 2, 4, 2],
        [2, 2, 4, 2, 4],
        [4, 4, 2, 4, 2],
        [2, 2, 4, 2, 4],
        [2, 4, 2, 4, 2],
      ],
    },
    {
      name: '右边列：下移',
      rows: COL_RIGHT,
      direction: 'down' as const,
      expected: [
        [2, 4, 2, 4, 2],
        [4, 2, 4, 2, 2],
        [2, 4, 2, 4, 4],
        [4, 2, 4, 2, 2],
        [2, 4, 2, 4, 16],
      ],
    },
  ]

  for (const { name, rows, direction, expected } of cases) {
    test(`${name}：边缘那一行/列压紧并合并`, () => {
      const outcome = move(stateWithBoard(rows, 7, 'big-board'), direction)

      expect(outcome.changed).toBe(true)
      // 8+8 → 16，得分按产物数值
      expect(outcome.gained).toBe(16)
      expect(outcome.state.score).toBe(16)
      expect(outcome.state.moves).toBe(1)
      // 合两个、生一个，25 格棋盘上总数不变
      expect(tilesOf(outcome.state.board)).toHaveLength(25)
      expect(valueGrid(outcome.state.board)).toEqual(expected)
    })
  }

  test('垂直方向一格不动：动的确实是那条边，不是整盘都在动', () => {
    // 每个局面铺满且惰性，所以沿着另一根轴按下去必须原样返回——
    // 同一个引用是 move 对无效输入的口径（不进撤销历史，也不生成）
    const pairs: [(number | null)[][], readonly Direction[]][] = [
      [ROW_TOP, ['up', 'down']],
      [ROW_BOTTOM, ['up', 'down']],
      [COL_LEFT, ['left', 'right']],
      [COL_RIGHT, ['left', 'right']],
    ]

    for (const [rows, directions] of pairs) {
      const before = stateWithBoard(rows, 7, 'big-board')
      for (const direction of directions) {
        const outcome = move(before, direction)
        expect(outcome.changed, direction).toBe(false)
        expect(outcome.gained, direction).toBe(0)
        expect(outcome.state, direction).toBe(before)
        expect(tilesOf(outcome.state.board), direction).toHaveLength(25)
      }
    }
  })

  test('一个方块在一次移动里最多合并一次：2,2,2,2 得两个 4，不是一个 8', () => {
    // 第 0 行 [2,2,2,2,4]，其余四行惰性
    const outcome = move(
      stateWithBoard(withEdits([0, 0, 2], [0, 1, 2], [0, 2, 2], [0, 3, 2], [0, 4, 4]), 7, 'big-board'),
      'left'
    )

    expect(outcome.gained).toBe(8)
    // 两个产物 4 并排却不合并——5 格棋盘同样成立，lane 长度不改变这条规则
    expect(valueGrid(outcome.state.board)[0].slice(0, 3)).toEqual([4, 4, 4])
  })
})

describe('达标 4096', () => {
  /** 两个 2048 并排躺在上边行，一次左移合出目标块 */
  const WINNING = withEdits([0, 0, 2048], [0, 1, 2048])

  test('合出 4096：reachedTarget 置真、phase 转 won、分数按产物计', () => {
    const outcome = move(stateWithBoard(WINNING, 7, 'big-board'), 'left')

    expect(outcome.gained).toBe(4096)
    expect(outcome.state.score).toBe(4096)
    expect(outcome.state.reachedTarget).toBe(true)
    expect(outcome.state.phase).toBe('won')
    expect(valueGrid(outcome.state.board)[0][0]).toBe(4096)
  })

  test('合出 2048（2 的幂，但小于目标）：不达标，仍是 playing', () => {
    // 达标判的是目标块本身，不是「是不是 2 的幂」——否则 2048 就该弹胜利面板
    const outcome = move(
      stateWithBoard(withEdits([0, 0, 1024], [0, 1, 1024]), 7, 'big-board'),
      'left'
    )

    expect(outcome.gained).toBe(2048)
    expect(outcome.state.reachedTarget).toBe(false)
    expect(outcome.state.phase).toBe('playing')
    expect(valueGrid(outcome.state.board)[0][0]).toBe(2048)
  })

  test('继续玩之后还能接着合，胜利面板不回来', () => {
    const won = move(stateWithBoard(WINNING, 7, 'big-board'), 'left').state
    const resumed = continueRun(won)
    expect(resumed.phase).toBe('playing')
    expect(resumed.reachedTarget).toBe(true)
    expect(resumed.score).toBe(4096)

    // 上边行末尾那两个 2 是唯一一对：再左移合出一个 4，面板不再出现
    const next = move(resumed, 'left')
    expect(next.changed).toBe(true)
    expect(next.gained).toBe(4)
    expect(next.state.phase).toBe('playing')
    expect(next.state.score).toBe(4100)
    expect(valueGrid(next.state.board)[0].slice(0, 4)).toEqual([4096, 2, 4, 4])
  })
})

describe('5×5 死局', () => {
  test('25 格全满且横纵相邻都不相等：四方向都推不动，isDeadlocked 一致', () => {
    const state = stateWithBoard(FILLER, 7, 'big-board')

    expect(isDeadlocked(state)).toBe(true)
    expect(noDirectionMoves(state)).toBe(true)

    for (const direction of ALL_DIRECTIONS) {
      const outcome = move(state, direction)
      expect(outcome.changed, direction).toBe(false)
      expect(outcome.gained, direction).toBe(0)
      // 同一个引用：不进历史，也不生成
      expect(outcome.state, direction).toBe(state)
      expect(tilesOf(outcome.state.board), direction).toHaveLength(25)
    }
  })

  test('留一个空格就不是死局：判据一致地判「还能走」', () => {
    const withGap: (number | null)[][] = FILLER.map((row, index) =>
      index === 0 ? [null, ...row.slice(1)] : row
    )
    const state = stateWithBoard(withGap, 7, 'big-board')

    expect(isDeadlocked(state)).toBe(false)
    expect(noDirectionMoves(state)).toBe(false)
  })

  /**
   * 一步即死局：第 0 行右端留一个空格，右移把整行推过去，空出的 (0,0) 由生成填上。
   * 填上那一格的右邻与下邻都是 8，所以生成 2 还是 4 都死局——这条路径不依赖随机进度
   * （已用 20,000 个 rngState 核过：生成值 2 与 4 都出现，无一例外都是死局）。
   */
  const ONE_STEP_FROM_DEADLOCK: (number | null)[][] = [
    [8, 2, 4, 8, null],
    [8, 4, 8, 2, 4],
    [2, 8, 4, 8, 2],
    [4, 2, 8, 4, 8],
    [8, 4, 2, 8, 4],
  ]

  test('一步把棋盘填死：phase 转 stuck，且不依赖生成抽到哪一档', () => {
    for (const rngState of [1, 2, 3, 7, 13, 99, 12345]) {
      const outcome = move(stateWithBoard(ONE_STEP_FROM_DEADLOCK, rngState, 'big-board'), 'right')

      expect(outcome.changed, `rngState ${rngState}`).toBe(true)
      expect(outcome.gained, `rngState ${rngState}`).toBe(0)
      expect(outcome.state.phase, `rngState ${rngState}`).toBe('stuck')
      expect(tilesOf(outcome.state.board), `rngState ${rngState}`).toHaveLength(25)
      expect(isDeadlocked(outcome.state), `rngState ${rngState}`).toBe(true)
      expect(noDirectionMoves(outcome.state), `rngState ${rngState}`).toBe(true)

      // 只有生成那一格随随机进度变，其余 24 格逐格写死
      const grid = valueGrid(outcome.state.board)
      expect(MODE.spawnValues, `rngState ${rngState}`).toContain(grid[0][0])
      expect(grid.slice(1), `rngState ${rngState}`).toEqual([
        [8, 4, 8, 2, 4],
        [2, 8, 4, 8, 2],
        [4, 2, 8, 4, 8],
        [8, 4, 2, 8, 4],
      ])
      expect(grid[0].slice(1), `rngState ${rngState}`).toEqual([8, 2, 4, 8])
    }
  })
})

describe('生成覆盖四条边', () => {
  test('连走 60 步：生成的方块落遍第 0 / 第 4 行与第 0 / 第 4 列，且只取 2 与 4', () => {
    // 验收标准第一条是「移动与生成覆盖边缘行列」。移动由上面四个手铺局面钉着，
    // 生成要的是「可玩格 = 全部 25 格」：无障碍模式的 playableCells 就是 25 个，
    // 所以四条边必须都能落子。只走两三步的话边角不一定都出现过，得跑一段。
    const cycle: readonly Direction[] = ['left', 'up', 'right', 'down']
    let state = createGame('big-board', 20260926)
    const rows = new Set<number>()
    const cols = new Set<number>()
    const values = new Set<number>()
    let spawns = 0

    for (let step = 0; step < 60; step++) {
      const nextTileId = state.nextTileId
      const outcome = move(state, cycle[step % cycle.length])
      state = outcome.state
      if (!outcome.changed) continue
      // 身份顺序分配，所以刚生成的那个就是这一号
      const spawned = tilesOf(state.board).find((tile) => tile.id === nextTileId)
      if (!spawned) continue
      spawns += 1
      values.add(spawned.value)
      state.board.forEach((row, r) =>
        row.forEach((cell, c) => {
          if (cell !== null && cell !== 'wall' && cell.id === spawned.id) {
            rows.add(r)
            cols.add(c)
          }
        })
      )
    }

    // 60 步还没走死，样本才有意义
    expect(state.phase).toBe('playing')
    expect(spawns).toBeGreaterThan(20)
    expect([...rows].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4])
    expect([...cols].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4])
    // 域正好是声明的两个值：不多（不会冒出 8），也不少（没有塌成单值）
    expect([...values].sort((a, b) => a - b)).toEqual([2, 4])
  })
})

describe('4096 的位数', () => {
  // 位数是 board.css 选字号档的唯一依据（data-digits）：4096 是四位数，落在
  // 0.27 倍格边长那一档。e2e 在真实浏览器里核这一档不挤出格子
  test('4096 → 四位，走 board.css 的 data-digits=4 档', () => {
    expect(tileDigits(4096)).toBe(4)
    // 同一档上的邻居：2048 是 4×4 的目标块，斐波那契的 2584 也是这一档
    expect(tileDigits(2048)).toBe(4)
    expect(tileDigits(512)).toBe(3)
    expect(tileDigits(128)).toBe(3)
  })
})
