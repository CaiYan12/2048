import { describe, expect, test } from 'vitest'
import contract from './fixtures/mode-contract.json'
import { getMode } from '../../src/shared/modes'
import type { Direction, GameState } from '../../src/shared/types'
import { isDeadlocked } from '../../src/game/board'
import { continueRun, createGame, move } from '../../src/game/engine'
import { NOW, stateWithBoard, tilesOf, valueGrid } from './support'
import { tileDigits, tileLabel } from '../../src/renderer/components/TileLabel'

/**
 * T05 的斐波那契切片：引擎一个字没改，只填了 `src/game/merge.ts` 里那一行合并表。
 *
 * 全部经公开面（createGame / move / continueRun / isDeadlocked）驱动，**不**直接摸
 * MERGE——要证的是「一次移动在棋盘上发生了什么」，不是「表里有没有某一对」。
 * 期望值全部由同一套规则内核离线推演得到（临时脚本跑完即删，未进提交），
 * 不是照着手算的合并过程写下来的。
 *
 * 操作数顺序的裁决见 merge.ts 与 board.ts 的注释：一律按 lane 自然序传参。
 * 所以 `[1,2,3]` 向左与向右合出的**不是同一对**——向左合 (1,2)、向右合 (2,3)。
 * 只测一个方向证明不了这条裁决，两个方向都测才钉得住。
 */

/** 三行「惰性」填充：横纵相邻都没有可合并对，且本来就压紧，四个方向都推不动 */
const INERT_ROWS: (number | null)[][] = [
  [8, 2, 8, 2],
  [8, 2, 8, 2],
  [8, 2, 8, 2],
]

/** 手铺一个只有该行会变的局面：input 压紧后贴在目标边那端，其余三行惰性且铺满 */
function rowBoard(input: readonly number[], direction: 'left' | 'right'): (number | null)[][] {
  // 行宽从模式声明读，不写死 4：棋盘尺寸是 mode 的数据，这里再抄一份早晚和 modes.ts 长歪
  const size = getMode('fibonacci').size
  const row: (number | null)[] = Array.from({ length: size }, () => null)
  const start = direction === 'left' ? 0 : size - input.length
  input.forEach((value, index) => {
    row[start + index] = value
  })
  return [row, ...INERT_ROWS]
}

/** 夹具的 examples 只有 left / right（列轴另用手铺局面专测）；冒出第三个值就炸，别安静地按 right 跑 */
function frozenDirection(raw: string): 'left' | 'right' {
  if (raw !== 'left' && raw !== 'right') {
    throw new Error(`mode-contract 的 examples 里没有这个方向：${raw}`)
  }
  return raw
}

describe('契约冻结的六个例子', () => {
  // 逐条照 fixture 的 examples 跑，不重抄一遍数值：契约改了要让这里跟着改，
  // 而不是留一份手抄的副本在测试里慢慢和契约长歪。
  for (const example of contract.fibonacci.examples) {
    const direction = frozenDirection(example.direction)
    const side = direction === 'left' ? '左' : '右'

    test(`[${example.input.join(',')}] ${side}移 → [${example.expected.join(',')}]，+${example.scoreDelta}`, () => {
      const before = stateWithBoard(rowBoard(example.input, direction), 7, 'fibonacci')

      const outcome = move(before, direction)

      expect(outcome.changed).toBe(true)
      expect(outcome.gained).toBe(example.scoreDelta)
      expect(outcome.state.score).toBe(example.scoreDelta)
      expect(outcome.state.moves).toBe(1)

      // 其余三行铺满，生成只能落进这一行。去掉空格后是「产物们 + 一个新方块」，
      // 而产物就是契约写的 expected——新方块挤在目标边那一端。
      const lane = valueGrid(outcome.state.board)[0].filter((value) => value !== null)
      expect(lane).toHaveLength(example.expected.length + 1)
      const products =
        direction === 'left'
          ? lane.slice(0, example.expected.length)
          : lane.slice(-example.expected.length)
      expect(products).toEqual([...example.expected])

      // 新方块只来自模式声明的取值域。这里刻意不断言抽到哪一档——那是 ?seed= 那条
      // 缝的职责，本测试要的是「域」而不是「某一次抽取」。
      const spawned = direction === 'left' ? lane[lane.length - 1] : lane[0]
      expect(getMode('fibonacci').spawnValues).toContain(spawned)
    })
  }
})

describe('每块每步最多合并一次', () => {
  test('[1,1,3] 左移得 [2,3]：产物 2 不能再与紧跟的 3 合并', () => {
    // 这一条是「一次合并」最锋利的形态：产物 2 与后面的 3 恰好是相邻项
    // （2+3→5），放行了就该出 5。出了 5 说明扫描没跳过产物。
    const outcome = move(stateWithBoard(rowBoard([1, 1, 3], 'left'), 7, 'fibonacci'), 'left')

    expect(outcome.gained).toBe(2)
    expect(valueGrid(outcome.state.board)[0].slice(0, 2)).toEqual([2, 3])
  })

  test('[1,1,1,1] 左移得 [2,2]：两对独立合并，各自产物不再参与', () => {
    // 四个 1 是两对，不是一个连乘。产物 2 与右边的 2 也合不了（2+2 不在表里），
    // 所以结果恒为两个 2——与 Classic 的 [2,2,2,2]→[4,4] 同构。
    const outcome = move(stateWithBoard(rowBoard([1, 1, 1, 1], 'left'), 7, 'fibonacci'), 'left')

    expect(outcome.gained).toBe(4)
    expect(valueGrid(outcome.state.board)[0].slice(0, 2)).toEqual([2, 2])
    // 四块并两块，加上新生成的那一个：总数减一
    expect(tilesOf(outcome.state.board)).toHaveLength(15)
  })

  test('[1,1,2,2] 左移得 [2,2,2]：产物 2 旁边还有同值的 2，照样不合', () => {
    const outcome = move(stateWithBoard(rowBoard([1, 1, 2, 2], 'left'), 7, 'fibonacci'), 'left')

    expect(outcome.gained).toBe(2)
    expect(valueGrid(outcome.state.board)[0].slice(0, 3)).toEqual([2, 2, 2])
  })
})

describe('扫描起点决定合并对（列轴同样按自然序）', () => {
  // 第 0 列放 [1,2,3]，其余三列铺满且横纵都无可合并对：整张棋盘只有第 0 列会变。
  // 填充值不是随手写的——8 与 2 交替让四条 lane 在 up/down 之外也推不动。
  const COLUMN_BOARD: (number | null)[][] = [
    [1, 8, 2, 8],
    [2, 8, 2, 8],
    [3, 8, 2, 8],
    [null, 2, 8, 2],
  ]

  test('同一列上移得 [3,3]，下移得 [1,5]：方向不同，合并对不同', () => {
    const up = move(stateWithBoard(COLUMN_BOARD, 7, 'fibonacci'), 'up')
    expect(up.gained).toBe(3)
    expect(valueGrid(up.state.board).map((row) => row[0]).slice(0, 2)).toEqual([3, 3])

    const down = move(stateWithBoard(COLUMN_BOARD, 7, 'fibonacci'), 'down')
    // 从下往上扫：2+3→5 是产物，剩下的 1 停在上方
    expect(down.gained).toBe(5)
    expect(valueGrid(down.state.board).map((row) => row[0]).slice(-2)).toEqual([1, 5])
  })
})

describe('合并表顺着数列延续，不是五对硬编码', () => {
  test.each([
    [5, 8],
    [8, 13],
    [13, 21],
    [21, 34],
    [89, 144],
    [610, 987],
    [987, 1597],
    [1597, 2584],
    // 2584 之后继续玩才触得到：契约只冻结到 5+8→13，正文写着「按数列延续」
    [2584, 4181],
    [4181, 6765],
  ])('%i + %i 这一对真的合并且按产物计分', (a, b) => {
    // 行 = [a, b, 8, 2]：扫描先撞上 (a,b) 合出产物，之后只剩 8 与 2（合不了），
    // 于是产物必然落在第 0 列，整张棋盘也只有这一行会变。
    const outcome = move(stateWithBoard([[a, b, 8, 2], ...INERT_ROWS], 7, 'fibonacci'), 'left')

    expect(outcome.changed).toBe(true)
    expect(outcome.gained).toBe(a + b)
    expect(valueGrid(outcome.state.board)[0][0]).toBe(a + b)
  })

  // 夹具冻结的那五对逐对经一次真实移动再验一遍：契约与实现不许靠「我记得」对齐
  for (const [pair, successor] of Object.entries(contract.fibonacci.mergeTable)) {
    const [a, b] = pair.split('+').map(Number)
    test(`契约冻结的 ${pair} → ${successor}`, () => {
      const outcome = move(stateWithBoard([[a, b, 8, 2], ...INERT_ROWS], 7, 'fibonacci'), 'left')
      expect(outcome.gained).toBe(successor)
      expect(valueGrid(outcome.state.board)[0][0]).toBe(successor)
    })
  }

  /**
   * 合不了的相邻对。后两格是填充，选它们是为了让 (b, 填充) 也**不**构成相邻项——
   * 否则左移时合并发生在别处，验的就不是「这一对合不了」。
   * 例如 13 与 8 是相邻项（8+13→21），所以 b = 13 的行不能拿 8 当填充。
   */
  const NON_PAIRS: readonly (readonly [number, number, number, number])[] = [
    [2, 2, 8, 2],
    [3, 3, 8, 2],
    [8, 8, 8, 2],
    [13, 13, 2, 8],
    [21, 21, 8, 2],
    [1, 3, 8, 2],
    [3, 8, 8, 2],
    [5, 13, 2, 8],
    [34, 89, 8, 2],
    [89, 233, 8, 2],
  ]

  // 不是所有「相等」或「都是斐波那契数」的组合都能合——只有相邻项能合。
  // 这里连计分带位置一起钉：gained 0、changed false、同一个 state 引用。
  for (const [a, b, fillerA, fillerB] of NON_PAIRS) {
    test(`${a} + ${b} 不在表里：整盘一个格子都不动`, () => {
      const before = stateWithBoard([[a, b, fillerA, fillerB], ...INERT_ROWS], 7, 'fibonacci')

      const outcome = move(before, 'left')

      expect(outcome.gained).toBe(0)
      expect(outcome.changed).toBe(false)
      expect(outcome.state).toBe(before)
      expect(tilesOf(outcome.state.board)).toHaveLength(16)
    })
  }
})

describe('开局与生成只用模式声明的数值', () => {
  test('固定种子的开局逐格确定，两个方块分居两格且只取 1 / 2', () => {
    const state = createGame('fibonacci', 20260926, NOW)

    // 与 Classic 同一种子同一条随机流，只有取值不同：低值 1、高值 2
    expect(valueGrid(state.board)).toEqual([
      [null, null, null, null],
      [null, null, null, null],
      [1, null, null, null],
      [null, null, null, 2],
    ])
    expect(state.nextTileId).toBe(3)
    expect(state.score).toBe(0)
    expect(state.reachedTarget).toBe(false)
  })

  test('多个种子的开局都只出现 1 与 2', () => {
    const values = [1, 2]
    for (const seed of [1, 42, 7, 999983]) {
      const state = createGame('fibonacci', seed, NOW)
      const tiles = tilesOf(state.board)
      expect(tiles, `seed ${seed}`).toHaveLength(2)
      for (const tile of tiles) expect(values, `seed ${seed}`).toContain(tile.value)
    }
  })

  test('连走 100 步，新方块始终只来自 [1,2]，且不塌成单值', () => {
    // 域的断言而不是某一次抽取：种子的职责是钉死一次开局，「90% 低值」这条规则
    // 要靠长跑的分布来证——只走两三步的话两种值不一定都出现过。
    const cycle: readonly Direction[] = ['left', 'up', 'right', 'down']
    let state = createGame('fibonacci', 20260926, NOW)
    const spawned: number[] = []

    for (let step = 0; step < 100; step++) {
      const before = tilesOf(state.board).length
      const outcome = move(state, cycle[step % cycle.length])
      state = outcome.state
      if (!outcome.changed) continue
      // 身份顺序分配，所以身份最新的那个就是刚生成的
      const tiles = tilesOf(state.board)
      if (tiles.length > before) spawned.push(tiles.reduce((a, b) => (a.id > b.id ? a : b)).value)
    }

    // 100 步还没走死，样本才有意义（否则后一半根本没生成）
    expect(state.phase).toBe('playing')
    // 合并那一步不改变方块总数（并两个、生一个），所以采样数远小于步数，
    // 三十来个已经足够把「域」定下来
    expect(spawned.length).toBeGreaterThan(20)
    // 域正好是声明的两个值：不多（不会冒出 4），也不少（没有塌成单值）
    expect([...new Set(spawned)].sort((x, y) => x - y)).toEqual([1, 2])
    for (const value of spawned) expect(getMode('fibonacci').spawnValues).toContain(value)
  })
})

describe('达标 2584', () => {
  test('合出 2584：reachedTarget 置真、phase 转 won、分数按产物计', () => {
    const outcome = move(
      stateWithBoard([[1597, 987, 8, 2], ...INERT_ROWS], 7, 'fibonacci'),
      'left'
    )

    expect(outcome.gained).toBe(2584)
    expect(outcome.state.score).toBe(2584)
    expect(outcome.state.reachedTarget).toBe(true)
    expect(outcome.state.phase).toBe('won')
    expect(valueGrid(outcome.state.board)[0][0]).toBe(2584)
  })

  test('合出 1597（斐波那契数，但小于目标）：不达标，仍是 playing', () => {
    // 达标判的是目标块本身，不是「是不是斐波那契数」——否则 1597 就该弹胜利面板
    const outcome = move(
      stateWithBoard([[987, 610, 8, 2], ...INERT_ROWS], 7, 'fibonacci'),
      'left'
    )

    expect(outcome.gained).toBe(1597)
    expect(outcome.state.reachedTarget).toBe(false)
    expect(outcome.state.phase).toBe('playing')
    expect(valueGrid(outcome.state.board)[0][0]).toBe(1597)
  })

  test('继续玩之后再合并：分数接着涨，胜利面板不回来', () => {
    const won = move(stateWithBoard([[1597, 987, 8, 2], ...INERT_ROWS], 7, 'fibonacci'), 'left').state
    const resumed = continueRun(won)
    expect(resumed.phase).toBe('playing')
    expect(resumed.reachedTarget).toBe(true)
    expect(resumed.score).toBe(2584)

    const next = move(resumed, 'left')
    // 2584 + 8 + 2 + 1 里 2+1→3 是唯一一对；reachedTarget 已经为真，不会再弹面板
    expect(next.gained).toBe(3)
    expect(next.state.score).toBe(2587)
    expect(next.state.phase).toBe('playing')
    expect(valueGrid(next.state.board)[0].slice(0, 3)).toEqual([2584, 8, 3])
  })
})

describe('长链：一路合到 13 还在合', () => {
  test('两步之内 2+3→5、再 5+8→13', () => {
    // 第一步 [2,3,8,8] → [5,8,8,新]：产物 5 与右边的 8 恰好是相邻项，
    // 但本次移动已经跳过它；第二步左移才真的 5+8→13。
    const first = move(stateWithBoard([[2, 3, 8, 8], ...INERT_ROWS], 7, 'fibonacci'), 'left')
    expect(first.gained).toBe(5)
    expect(valueGrid(first.state.board)[0].slice(0, 3)).toEqual([5, 8, 8])

    const second = move(first.state, 'left')
    expect(second.gained).toBe(13)
    expect(second.state.score).toBe(18)
    expect(second.state.phase).toBe('playing')
    expect(valueGrid(second.state.board)[0][0]).toBe(13)
  })

  test('一行之内两对独立合到 21', () => {
    // [8,13,2,1]：8+13→21 与 2+1→3 是两对，互不干扰
    const outcome = move(stateWithBoard([[8, 13, 2, 1], ...INERT_ROWS], 7, 'fibonacci'), 'left')

    expect(outcome.gained).toBe(21 + 3)
    expect(valueGrid(outcome.state.board)[0].slice(0, 2)).toEqual([21, 3])
  })
})

describe('死局', () => {
  /** isDeadlocked 与「四方向都推不动」必须是同一件事：前者是谓词，后者是它的可观察后果 */
  function noDirectionMoves(state: GameState): boolean {
    const directions: readonly Direction[] = ['up', 'down', 'left', 'right']
    return directions.every((direction) => !move(state, direction).changed)
  }

  const LOCKED: (number | null)[][] = [
    [1, 8, 1, 8],
    [8, 1, 8, 1],
    [1, 8, 1, 8],
    [8, 1, 8, 1],
  ]

  test('16 格全满且横纵相邻都不是相邻项：四方向都推不动', () => {
    const state = stateWithBoard(LOCKED, 7, 'fibonacci')

    expect(isDeadlocked(state)).toBe(true)
    expect(noDirectionMoves(state)).toBe(true)

    for (const direction of ['up', 'down', 'left', 'right'] as const) {
      const outcome = move(state, direction)
      expect(outcome.changed, direction).toBe(false)
      expect(outcome.gained, direction).toBe(0)
      // 同一个引用：不进历史，也不生成
      expect(outcome.state, direction).toBe(state)
      expect(tilesOf(outcome.state.board), direction).toHaveLength(16)
    }
  })

  test('还有空格或还有相邻项：两种判据一致地判「不是死局」', () => {
    const withGap = stateWithBoard(
      [[1, 8, 1, null], [8, 1, 8, 1], [1, 8, 1, 8], [8, 1, 8, 1]],
      7,
      'fibonacci'
    )
    // 全满，但第 1 行的 2 与 1 是相邻项（2+1→3）：某个方向推得动，所以不是死局
    const withPair = stateWithBoard(
      [
        [2, 8, 1, 8],
        [2, 1, 8, 1],
        [1, 8, 1, 8],
        [8, 1, 8, 1],
      ],
      7,
      'fibonacci'
    )

    for (const state of [withGap, withPair]) {
      expect(isDeadlocked(state)).toBe(false)
      expect(noDirectionMoves(state)).toBe(false)
    }
  })

  test('一步把棋盘填死：phase 转 stuck，两种生成值都躲不过', () => {
    // 第 0 行右端留一个空格，右移把它整体推过去。空出来的是 (0,0)，它的上下右邻居
    // 全是 8——生成 1 还是 2 都跟 8 合不了，所以这条路径不依赖随机进度。
    const outcome = move(
      stateWithBoard(
        [[8, 1, 8, null], [8, 1, 8, 1], [1, 8, 1, 8], [8, 1, 8, 1]],
        7,
        'fibonacci'
      ),
      'right'
    )

    expect(outcome.changed).toBe(true)
    expect(outcome.gained).toBe(0)
    expect(outcome.state.phase).toBe('stuck')
    expect(tilesOf(outcome.state.board)).toHaveLength(16)
    expect(valueGrid(outcome.state.board)).toEqual(LOCKED)
    expect(isDeadlocked(outcome.state)).toBe(true)
  })
})

describe('数值标签的位数 → 棋盘字号档位', () => {
  // 位数是 board.css 选字号档的唯一依据（data-digits），所以档位必须从标签推导，
  // 不能靠肉眼估。2584 是四位数，落在 0.27 倍格边长那一档。
  test.each([
    [1, '1', 1],
    [2, '2', 1],
    [13, '13', 2],
    [144, '144', 3],
    [1597, '1597', 4],
    [2584, '2584', 4],
    [4181, '4181', 4],
    [10946, '10946', 5],
  ])('%i → 标签 %s、%i 位', (value, label, digits) => {
    expect(tileLabel(value)).toBe(label)
    expect(tileDigits(value)).toBe(digits)
  })
})
