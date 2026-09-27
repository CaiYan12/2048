import { describe, expect, test } from 'vitest'
import contract from './fixtures/mode-contract.json'
import { getMode } from '../../src/shared/modes'
import type { Direction, GameState } from '../../src/shared/types'
import { createBoard, isDeadlocked, playableCells } from '../../src/game/board'
import { continueRun, createGame, move } from '../../src/game/engine'
import { NOW, stateWithBoard, tilesOf, valueGrid, type CellSpec } from './support'

/**
 * T07 的障碍切片：引擎一个字没改（T03 起它就吃 mode.walls / playableCells），
 * 所以这里全经公开面（createGame / move / isDeadlocked）驱动。
 *
 * 这张票的意义全在一条：**T03 以来没有任何测试跑过 `lanesOf` 的墙分支**——
 * contract.test.ts 只数格子，从没在带墙的棋盘上移动过。所以下面的期望值不是照实现抄，
 * 而是照 mode-contract §2（压紧 + 从目标边向内逐对扫描 + 障碍切断 lane）手工推演，
 * 再与内核输出逐格对上的。
 *
 * 冻结障碍是居中 2×2，于是每一条被墙切开的 lane **都只剩一格**：第 1/2 行切成
 * [(r,0)] 与 [(r,3)]，第 1/2 列切成 [(0,c)] 与 [(3,c)]；不被打断的只有第 0/3 行与
 * 第 0/3 列。这一点决定了本文件所有判别用例的形状——跨墙的两个格子不在同一条 lane
 * 里，所以既不合并也滑不过去。
 */

/** 模式声明只读一份：测试里不抄 4 与 2048，也不抄那四个坐标 */
const MODE = getMode('walls')

/**
 * 契约冻结的四个障碍坐标，从模式声明读（类型是 readonly 二元组，取坐标时不用再断言）。
 * contract.test.ts 已经把它与 fixtures/mode-contract.json 对齐过，这里不抄第二份。
 */
const WALLS = MODE.walls

const ALL_DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right']

/** 四个方向轮着按：一条 lane 走不完所有格，轮换才让生成铺开到全盘 */
const WALK_CYCLE: readonly Direction[] = ['left', 'up', 'right', 'down']

/** isDeadlocked 与「四方向都推不动」必须是同一件事：前者是谓词，后者是它的可观察后果 */
function noDirectionMoves(state: GameState): boolean {
  return ALL_DIRECTIONS.every((direction) => !move(state, direction).changed)
}

/** 四个墙坐标的字符串集合：`playableCells` 的坐标拿来跟它做差集 */
const WALL_CELLS: ReadonlySet<string> = new Set(WALLS.map(([row, col]) => `${row},${col}`))

/** 四个墙坐标是否原样。逐步查它 = 「生成没落在墙上」+「墙没被滑动改写」 */
function wallsIntact(state: GameState): boolean {
  return (
    WALLS.every(([row, col]) => state.board[row][col] === 'wall') &&
    state.board.flat().filter((cell) => cell === 'wall').length === WALLS.length
  )
}

describe('模式声明：居中 2×2 障碍块', () => {
  test('障碍坐标就是契约冻结的居中 2×2，其余 12 格可玩', () => {
    expect(MODE.size).toBe(contract.walls.boardSize)
    expect(MODE.walls).toEqual(contract.walls.blocked)
    expect(MODE.mergeFamily).toBe('powers-of-two')
    expect(MODE.spawnValues).toEqual(contract.spawnWeights.default.values)
    expect(MODE.target).toBe(2048)
    expect(MODE.timeLimitSeconds).toBe(null)

    const board = createBoard(MODE.size, MODE.walls)
    // 12 个非墙格；playableCells 是「未占用的非墙格」，空棋盘上正好也是 12
    expect(board.flat().filter((cell) => cell !== 'wall')).toHaveLength(
      contract.walls.playableCellCount
    )
    expect(playableCells(board)).toHaveLength(contract.walls.playableCellCount)
  })

  test('空棋盘上四个墙一丝不差，且一个都不在可玩格里', () => {
    const board = createBoard(MODE.size, MODE.walls)
    for (const [row, col] of WALLS) {
      expect(board[row][col], `wall ${row},${col}`).toBe('wall')
    }
    // 墙不进 playableCells：这是「生成永不落在墙上」的直接依据（spawn.ts 只从这里取格）。
    // 判据是坐标集合的差集，不是逐个问「这个格子是不是墙」——playableCells 本来就只回
    // null 格，「取出来的格子不是墙」恒真，那种写法抓不到把 `cell === null` 写成
    // `cell !== 'wall'` 的改法（那样墙也算可生成格，某一步生成就会覆盖它）。
    const returned = playableCells(board).map(([row, col]) => `${row},${col}`)
    const everyNonWall = board.flatMap((row, r) => row.map((_, c) => `${r},${c}`))
    expect(new Set(returned)).toEqual(
      new Set(everyNonWall.filter((at) => !WALL_CELLS.has(at)))
    )
  })
})

describe('开局', () => {
  test('固定种子的开局逐格确定：两个方块分居两格，四格墙原样', () => {
    const state = createGame('walls', 20260926, NOW)

    expect(valueGrid(state.board)).toEqual([
      [null, null, null, null],
      [null, 'W', 'W', null],
      [2, 'W', 'W', null],
      [null, null, null, 4],
    ])
    // 两个方块用掉 1、2 号身份；墙占掉 4 格，所以盘面只有 2 块
    expect(state.nextTileId).toBe(3)
    expect(tilesOf(state.board)).toHaveLength(contract.walls.initialTiles)
    expect(state.score).toBe(0)
    expect(state.moves).toBe(0)
    expect(state.reachedTarget).toBe(false)
    expect(state.phase).toBe('playing')
  })

  test('开局棋盘：12 格可玩、4 格墙、2 块分居两格，且没有一块落在墙上', () => {
    /**
     * 多个种子跑同一条性质：契约要求两个方块各从未被占用的可玩格里独立随机取，
     * 所以「分居两格」与「不落在墙上」必须是结构保证，不是某个种子的巧合。
     */
    for (const seed of [20260926, 1, 42, 7, 999983]) {
      const state = createGame('walls', seed, NOW)
      const tiles = tilesOf(state.board)
      const tileCells = state.board.flatMap((row, r) =>
        row.map((cell, c) => ({ cell, at: `${r},${c}` }))
      )

      expect(tiles, `seed ${seed}`).toHaveLength(contract.walls.initialTiles)
      for (const tile of tiles) {
        expect(MODE.spawnValues, `seed ${seed}`).toContain(tile.value)
      }
      expect(
        state.board.flat().filter((cell) => cell !== 'wall'),
        `seed ${seed}`
      ).toHaveLength(contract.walls.playableCellCount)
      expect(playableCells(state.board), `seed ${seed}`).toHaveLength(
        contract.walls.playableCellCount - contract.walls.initialTiles
      )
      // 逐坐标查墙：只要障碍坐标上出现数值方块，这一条立刻炸。
      // 光看「tilesOf 里没有 wall」是运行时恒真的，抓不到这个 bug。
      for (const [row, col] of WALLS) {
        expect(state.board[row][col], `seed ${seed} 的 wall ${row},${col}`).toBe('wall')
      }
      const occupied = tileCells.filter(({ cell }) => cell !== null && cell !== 'wall')
      expect(new Set(occupied.map(({ at }) => at)).size, `seed ${seed}`).toBe(
        contract.walls.initialTiles
      )
    }
  })

  test('开局一定可玩：每个种子至少有一个方向推得动', () => {
    /**
     * 这不是碰巧：12 个可玩格全都靠在未被打断的第 0/3 行或第 0/3 列上（被墙切开的
     * lane 都只剩一格，那一格也同时属于第 0/3 行或第 0/3 列），而打开局只有两块，
     * 所以至少有一块能在自己那条多格 lane 里滑动。真会死局的是 12 格全满的局面
     * （见「只因墙而存在的死局」），两块的开局不可能死。
     */
    for (const seed of [20260926, 1, 42, 7, 999983, 123456, 5]) {
      const state = createGame('walls', seed, NOW)
      const legal = ALL_DIRECTIONS.filter((direction) => move(state, direction).changed)
      expect(legal, `seed ${seed}`).not.toHaveLength(0)
      expect(isDeadlocked(state), `seed ${seed}`).toBe(false)
      expect(noDirectionMoves(state), `seed ${seed}`).toBe(false)
    }
  })
})

describe('四个方向在带墙棋盘上的完整结果', () => {
  /**
   * 四个局面各让**一条未被打断的 lane**（第 0 行 / 第 0 列）正常合并，同时让墙两侧
   * 各躺一对同值块。断言整张 16 格棋盘，所以「墙两侧不动」与「没被打断的那条正常合」
   * 在同一张期望值里同时成立。
   *
   * 12 个可玩格全铺满：合并恰好空出一格，生成只能落进那一格，于是期望值不含随机
   * （生成值由钉死的 rngState 决定，低位 90% 抽 2）。
   */
  const cases = [
    {
      name: '左移：第 0 行尾部一对合并，第 1/2 行跨墙的同值块不合',
      rows: [
        [2, 4, 2, 2],
        [8, 'wall', 'wall', 8],
        [4, 'wall', 'wall', 4],
        [2, 4, 8, 4],
      ] as CellSpec[][],
      direction: 'left' as const,
      expected: [
        [2, 4, 4, 2],
        [8, 'W', 'W', 8],
        [4, 'W', 'W', 4],
        [2, 4, 8, 4],
      ],
    },
    {
      name: '右移：第 0 行首部一对合并，跨墙的同值块同样不合',
      rows: [
        [2, 2, 4, 2],
        [8, 'wall', 'wall', 8],
        [4, 'wall', 'wall', 4],
        [2, 4, 8, 4],
      ] as CellSpec[][],
      direction: 'right' as const,
      expected: [
        [2, 4, 4, 2],
        [8, 'W', 'W', 8],
        [4, 'W', 'W', 4],
        [2, 4, 8, 4],
      ],
    },
    {
      name: '上移：第 0 列一对合并，第 1/2 列跨墙的同值块不合',
      rows: [
        [2, 2, 4, 8],
        [2, 'wall', 'wall', 2],
        [4, 'wall', 'wall', 4],
        [2, 2, 4, 2],
      ] as CellSpec[][],
      direction: 'up' as const,
      expected: [
        [4, 2, 4, 8],
        [4, 'W', 'W', 2],
        [2, 'W', 'W', 4],
        [2, 2, 4, 2],
      ],
    },
    {
      name: '下移：第 0 列一对合并，跨墙的同值块同样不合',
      rows: [
        [2, 2, 4, 8],
        [4, 'wall', 'wall', 2],
        [2, 'wall', 'wall', 4],
        [2, 2, 4, 2],
      ] as CellSpec[][],
      direction: 'down' as const,
      expected: [
        [2, 2, 4, 8],
        [2, 'W', 'W', 2],
        [4, 'W', 'W', 4],
        [4, 2, 4, 2],
      ],
    },
  ]

  for (const { name, rows, direction, expected } of cases) {
    test(name, () => {
      const outcome = move(stateWithBoard(rows, 7, 'walls'), direction)

      expect(outcome.changed).toBe(true)
      expect(outcome.gained).toBe(4)
      expect(outcome.state.score).toBe(4)
      expect(outcome.state.moves).toBe(1)
      // 合两个、生一个，12 个可玩格上总数不变
      expect(tilesOf(outcome.state.board)).toHaveLength(contract.walls.playableCellCount)
      expect(outcome.state.phase).toBe('playing')
      expect(valueGrid(outcome.state.board)).toEqual(expected)
    })
  }

  test('跨墙同值块永不合并：一次合法移动里，墙两侧的 2,2 与 4,4 全部原样', () => {
    /**
     * 把「跨墙不许合并」单独拎出来：第 0 行有一次**会发生的**合并（2+2→4，+4 分），
     * 第 1/2 行各躺一对跨墙同值块。若墙两侧也合了，分数会是 4+4+8=16、且 (1,0) 变成 4。
     * 所以这里连分数带位置一起钉——这是「墙把 lane 切断」最直接的后果。
     */
    const rows: CellSpec[][] = [
      [2, 4, 2, 2],
      [2, 'wall', 'wall', 2],
      [4, 'wall', 'wall', 4],
      [2, 4, 8, 4],
    ]
    const outcome = move(stateWithBoard(rows, 7, 'walls'), 'left')

    expect(outcome.changed).toBe(true)
    // 只有第 0 行那一次 2+2；跨墙的 2+2 与 4+4 一分不加
    expect(outcome.gained).toBe(4)
    expect(valueGrid(outcome.state.board)).toEqual([
      [2, 4, 4, 2],
      [2, 'W', 'W', 2],
      [4, 'W', 'W', 4],
      [2, 4, 8, 4],
    ])
  })
})

describe('未被打断的 lane 也包括第 3 行与第 3 列', () => {
  /**
   * 上面那组只走了第 0 行 / 第 0 列，那只能证明 lane 的**起点**那一侧还在，证明不了
   * 末侧：把 `lanesOf` 的循环写成 `line < size - 1`（整条丢掉第 3 行 / 第 3 列），
   * 上面每一条照样全绿。这里让第 3 行与第 3 列各合一次，把 lane 的**终点**钉住。
   *
   * 形状与上面一致：12 个可玩格全铺满，合并恰好空出 (3,3) 一格，生成只能落进那一格，
   * 于是期望值不含随机（生成值由钉死的 rngState=7 决定，低位 90% 抽 2）。
   */
  const cases = [
    {
      name: '左移：第 3 行尾部一对合并，第 0 行与跨墙的同值块都不合',
      rows: [
        [2, 4, 2, 4],
        [8, 'wall', 'wall', 8],
        [4, 'wall', 'wall', 4],
        [2, 4, 2, 2],
      ] as CellSpec[][],
      direction: 'left' as const,
      expected: [
        [2, 4, 2, 4],
        [8, 'W', 'W', 8],
        [4, 'W', 'W', 4],
        [2, 4, 4, 2],
      ],
    },
    {
      name: '上移：第 3 列一对合并，第 0 列与跨墙的同值块都不合',
      rows: [
        [2, 4, 2, 2],
        [4, 'wall', 'wall', 2],
        [2, 'wall', 'wall', 4],
        [4, 2, 8, 2],
      ] as CellSpec[][],
      direction: 'up' as const,
      expected: [
        [2, 4, 2, 4],
        [4, 'W', 'W', 4],
        [2, 'W', 'W', 2],
        [4, 2, 8, 2],
      ],
    },
  ]

  for (const { name, rows, direction, expected } of cases) {
    test(name, () => {
      const outcome = move(stateWithBoard(rows, 7, 'walls'), direction)

      expect(outcome.changed).toBe(true)
      expect(outcome.gained).toBe(4)
      expect(outcome.state.score).toBe(4)
      expect(outcome.state.moves).toBe(1)
      // 合两个、生一个，12 个可玩格上总数不变
      expect(tilesOf(outcome.state.board)).toHaveLength(contract.walls.playableCellCount)
      expect(outcome.state.phase).toBe('playing')
      expect(valueGrid(outcome.state.board)).toEqual(expected)
    })
  }
})

describe('墙把 lane 切断：跨墙不许滑过去', () => {
  /**
   * 判别用例：墙的一侧是空格、另一侧躺着一个方块。把墙当空气的「整行/整列扫描」会把
   * 这个方块推到目标边；正确行为是它待在墙这一侧的原格上。四个方向各一个局面，
   * 并且连相反方向一起断言（那半边同样没有可合的邻居，应当一动不动）。
   *
   * 断言 `outcome.state === before`：一个格子都没动，所以不生成、不进历史。
   * 这三条合起来才是「无效移动」的完整口径。
   */
  const cases = [
    {
      name: '左移：(1,0) 空着，(1,3) 的 8 不许滑过墙',
      rows: [
        [2, 4, 2, 4],
        [null, 'wall', 'wall', 8],
        [4, 'wall', 'wall', 4],
        [4, 2, 8, 2],
      ] as CellSpec[][],
      directions: ['left', 'right'] as const,
      stayAt: [1, 3] as const,
      emptyAt: [1, 0] as const,
    },
    {
      name: '右移：(2,3) 空着，(2,0) 的 8 不许滑过墙',
      rows: [
        [2, 4, 2, 4],
        [4, 'wall', 'wall', 8],
        [8, 'wall', 'wall', null],
        [4, 2, 8, 2],
      ] as CellSpec[][],
      directions: ['left', 'right'] as const,
      stayAt: [2, 0] as const,
      emptyAt: [2, 3] as const,
    },
    {
      name: '上移：(0,1) 空着，(3,1) 的 8 不许滑过墙',
      rows: [
        [2, null, 4, 8],
        [8, 'wall', 'wall', 2],
        [4, 'wall', 'wall', 4],
        [2, 8, 4, 2],
      ] as CellSpec[][],
      directions: ['up', 'down'] as const,
      stayAt: [3, 1] as const,
      emptyAt: [0, 1] as const,
    },
    {
      name: '下移：(3,2) 空着，(0,2) 的 8 不许滑过墙',
      rows: [
        [2, 8, 8, 2],
        [8, 'wall', 'wall', 4],
        [4, 'wall', 'wall', 2],
        [2, 4, null, 8],
      ] as CellSpec[][],
      directions: ['up', 'down'] as const,
      stayAt: [0, 2] as const,
      emptyAt: [3, 2] as const,
    },
  ]

  for (const { name, rows, directions, stayAt, emptyAt } of cases) {
    test(name, () => {
      const before = stateWithBoard(rows, 7, 'walls')
      const [stayRow, stayCol] = stayAt
      const [emptyRow, emptyCol] = emptyAt

      for (const direction of directions) {
        const outcome = move(before, direction)
        const grid = valueGrid(outcome.state.board)

        expect(outcome.changed, direction).toBe(false)
        expect(outcome.gained, direction).toBe(0)
        // 同一个引用：无效移动的口径（不生成、不进历史、连重渲染都不该发生）
        expect(outcome.state, direction).toBe(before)
        // 方块留在墙这一侧，墙那一侧的空格一个都没被填上
        expect(grid[stayRow][stayCol], `${direction} 的 (${stayRow},${stayCol})`).toBe(8)
        expect(grid[emptyRow][emptyCol], `${direction} 的 (${emptyRow},${emptyCol})`).toBeNull()
        expect(wallsIntact(outcome.state), direction).toBe(true)
      }
    })
  }
})

describe('多步走查：墙一个字节都不动', () => {
  /**
   * 墙永不移动、永不合并、永不生成，这条要靠**连续多步**才钉得住：生成每一步都可能
   * 落在任何可玩格上，只要 playableCells 有一处把墙算进去，某个种子的某一步就会把墙
   * 换成方块。所以这里连走几十步，逐步查那四个坐标——它们只要有一刻不是 'wall'，
   * 就是「生成落在墙上」或「墙被滑动改写」。
   *
   * 四个种子全都在 12 个可玩格填满时走进死局：障碍模式的可玩面积只有 12 格，比经典
   * 少四格，所以「填满 → 死局」来得更快，这本身就是障碍模式该有的样子。
   */
  const WALK_SEEDS: readonly number[] = [20260926, 1, 42, 7]
  const WALK_STEPS = 60

  test.each(WALK_SEEDS)('seed %i：走到终局，四个墙坐标每一步都是 wall', (seed) => {
    let state = createGame('walls', seed, NOW)
    let effectiveMoves = 0
    let steps = 0

    for (; steps < WALK_STEPS; steps++) {
      const outcome = move(state, WALK_CYCLE[steps % WALK_CYCLE.length])
      state = outcome.state
      if (outcome.changed) effectiveMoves += 1

      expect(wallsIntact(state), `step ${steps} 的四格墙`).toBe(true)
      if (state.phase !== 'playing') break
    }

    // 走查要有样本意义：至少二十来步真的推动了棋盘
    expect(effectiveMoves).toBeGreaterThan(20)
    // 12 个可玩格全满之后走进死局；此时四方向皆无合法移动，墙仍在原位
    expect(tilesOf(state.board)).toHaveLength(contract.walls.playableCellCount)
    expect(state.phase).toBe('stuck')
    expect(isDeadlocked(state)).toBe(true)
    expect(noDirectionMoves(state)).toBe(true)
  })
})

describe('只因墙而存在的死局', () => {
  /** 12 个可玩格全满，横纵相邻都不相等——在经典模式下这同样叫死局 */
  const WALL_DEADLOCK: CellSpec[][] = [
    [2, 4, 2, 4],
    [8, 'wall', 'wall', 8],
    [4, 'wall', 'wall', 4],
    [2, 4, 8, 2],
  ]

  /** 同一组数字去掉墙：第 1/2 行整行同值，四个方向都推得动 */
  const SAME_NUMBERS_NO_WALLS: (number | null)[][] = [
    [2, 4, 2, 4],
    [8, 8, 8, 8],
    [4, 4, 4, 4],
    [2, 4, 8, 2],
  ]

  test('带墙：四方向都推不动，isDeadlocked 一致', () => {
    const state = stateWithBoard(WALL_DEADLOCK, 7, 'walls')

    expect(isDeadlocked(state)).toBe(true)
    expect(noDirectionMoves(state)).toBe(true)

    for (const direction of ALL_DIRECTIONS) {
      const outcome = move(state, direction)
      expect(outcome.changed, direction).toBe(false)
      expect(outcome.gained, direction).toBe(0)
      // 同一个引用：不进历史，也不生成（一生成就多出一块，死局就被掩盖了）
      expect(outcome.state, direction).toBe(state)
      expect(tilesOf(outcome.state.board), direction).toHaveLength(
        contract.walls.playableCellCount
      )
    }
  })

  test('同一组数字去掉墙：四个方向都推得动——死局确实只因墙而存在', () => {
    /**
     * 上一条的对照组：数字完全一样，只把四格墙换成普通格。若它也推不动，上面那条就只是
     * 在测「经典死局」，与墙无关。这里第 1/2 行整行同值，去掉墙立刻四个方向都能合。
     */
    const plain = stateWithBoard(SAME_NUMBERS_NO_WALLS, 7, 'classic')

    expect(isDeadlocked(plain)).toBe(false)
    expect(noDirectionMoves(plain)).toBe(false)
    for (const direction of ALL_DIRECTIONS) {
      expect(move(plain, direction).changed, direction).toBe(true)
    }
  })

  test('墙还在的时候有个空位就不是死局', () => {
    const withGap: CellSpec[][] = [
      [null, 4, 2, 4],
      [8, 'wall', 'wall', 8],
      [4, 'wall', 'wall', 4],
      [2, 4, 8, 2],
    ]
    const state = stateWithBoard(withGap, 7, 'walls')

    expect(isDeadlocked(state)).toBe(false)
    expect(noDirectionMoves(state)).toBe(false)

    // 第 0 行是未被打断的 lane：左移把 [null,4,2,4] 压成 [4,2,4]，腾出 (0,3)
    const outcome = move(state, 'left')
    expect(outcome.changed).toBe(true)
    expect(outcome.gained).toBe(0)
    expect(valueGrid(outcome.state.board)[0].slice(0, 3)).toEqual([4, 2, 4])
    // 顺带一个障碍模式的特点：唯一的空格被生成填上之后，12 个可玩格立刻全满且四方向
    // 无可合对，所以这一步走完就是死局——障碍模式的死局来得比经典早
    expect(outcome.state.phase).toBe('stuck')
    expect(isDeadlocked(outcome.state)).toBe(true)
  })
})

describe('障碍模式照常达标', () => {
  test('合出 2048：reachedTarget 置真、phase 转 won，墙一格未动', () => {
    // 两个 2048 躺在未被打断的第 0 行，一次左移合出目标块 4096
    const rows: CellSpec[][] = [
      [2048, 2048, 2, 4],
      [8, 'wall', 'wall', 8],
      [4, 'wall', 'wall', 4],
      [2, 4, 8, 2],
    ]
    const outcome = move(stateWithBoard(rows, 7, 'walls'), 'left')

    expect(outcome.gained).toBe(4096)
    expect(outcome.state.score).toBe(4096)
    expect(outcome.state.reachedTarget).toBe(true)
    expect(outcome.state.phase).toBe('won')
    expect(valueGrid(outcome.state.board)[0][0]).toBe(4096)
    expect(wallsIntact(outcome.state)).toBe(true)

    /**
     * 继续玩的那一刻，12 个可玩格已经全满且四方向都没有可合对，所以引擎按
     * mode-contract §3 的裁决直接转去死局面板（won 只弹一次，续走即死局）。
     * 这一条同时证明「障碍模式的目标与结束判定走的是同一套内核」。
     */
    const resumed = continueRun(outcome.state)
    expect(resumed.phase).toBe('stuck')
    expect(resumed.reachedTarget).toBe(true)
    expect(resumed.score).toBe(4096)
    expect(isDeadlocked(resumed)).toBe(true)
  })
})
