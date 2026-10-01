import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { move } from '../../src/game/engine'
import {
  EFFECT_DURATION_TOKEN,
  EFFECT_MECHANISM,
  EFFECT_REDUCED_MOTION,
  NO_TILE_MOTION,
  TILE_EFFECTS,
  TILE_EFFECT_DURATIONS,
  TILE_MERGE_PULSE_STEP_MS,
  diffMergeSources,
  diffTileMotion,
} from '../../src/renderer/components/TileMotion'
import type { Board, Cell, Direction, GameState } from '../../src/shared/types'
import { stateWithBoard, type CellSpec } from './support'

/**
 * T21 方块动效：裁决表 + 状态 diff 的单测
 *
 * 分两半，各回答一个不同的问题：
 *
 *   1. **裁决表与 board.css 对得上吗**（派发令要的「JS/CSS 时长契约」）。
 *      时长写在 .ts 里、规则写在 CSS 里，两边漂开没有任何编译期信号——浏览器只会
 *      安静地用兜底值。所以这里读 board.css 的**原文**逐项核：钩子名、兜底值、
 *      每个效果用的机制、reduced-motion 的静态替代物，一个都不许对不上。
 *   2. **哪一枚方块在这一帧该有哪个动效**（`diffTileMotion`）。
 *      纯函数、node 环境，所以可以直接用手铺的局面跑：合成、撤销、换局、换模式、
 *      刷新续玩各一条。
 *
 * 本文件**不碰浏览器**（vitest.config.ts 的 node 环境约定）：动效看起来怎么样，
 * 要由 tests/e2e/tile-motion.spec.ts 与真实浏览器截图回答；这里只证明裁决本身没错。
 */

/** 去掉注释再扫结构。注释里也写着这些关键词，不剥掉会把「提到过」当成「用了」 */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

const boardCss = (): string =>
  stripComments(
    readFileSync(new URL('../../src/renderer/styles/board.css', import.meta.url), 'utf8')
  )
const shellCss = (): string =>
  stripComments(
    readFileSync(new URL('../../src/renderer/styles/index.css', import.meta.url), 'utf8')
  )

/**
 * 从 `from` 起按括号配对取第一个块的正文。
 *
 * 不用正则：块里还套着规则块，`[^}]*` 数不到正确的那一层括号。
 */
function blockAfter(css: string, from: number, label: string): string {
  let depth = 0
  let start = -1
  for (let index = from; index < css.length; index += 1) {
    const char = css[index]
    if (char === '{') {
      depth += 1
      if (start === -1) start = index + 1
    } else if (char === '}') {
      depth -= 1
      if (depth === 0) return css.slice(start, index)
    }
  }
  throw new Error(`${label} 没有闭合`)
}

/** 一个 at-rule 块的正文（按名字取第一个）。`header` 不含结尾的 `{` */
function atRuleBlock(css: string, header: string): string {
  const at = css.indexOf(header)
  expect(at, `board.css 里找不到 ${header}`).toBeGreaterThanOrEqual(0)
  return blockAfter(css, at + header.length, header)
}

/**
 * 一条普通规则块的正文（按选择器文本取第一个）。
 *
 * 选择器**必须**带上结尾的 `{`：`.board__tile` 是 `.board__tiles` 的前缀，不带花括号
 * 会先撞到底板层那条共用规则上（`.board__cells, .board__tiles`）。花括号在这里是
 * 消歧的一部分，不是语法——所以要从花括号**所在的位置**开始数括号，而不是跳过它。
 */
function ruleBlock(css: string, selector: string): string {
  const needle = selector.includes('{') ? selector : `${selector} {`
  const at = css.indexOf(needle)
  expect(at, `board.css 里找不到 ${selector}`).toBeGreaterThanOrEqual(0)
  return blockAfter(css, at + needle.indexOf('{'), selector)
}

const REDUCED_MOTION_HEADER = '@media (prefers-reduced-motion: reduce)'

/** 动效本体：reduced-motion 那一块之前的全部规则 */
function motionCss(): string {
  const css = boardCss()
  const at = css.indexOf(REDUCED_MOTION_HEADER)
  expect(at, 'board.css 里应该有 reduced-motion 降级块').toBeGreaterThanOrEqual(0)
  return css.slice(0, at)
}

/** reduced-motion 降级块的正文 */
function reducedMotionCss(): string {
  return atRuleBlock(boardCss(), REDUCED_MOTION_HEADER)
}

/** @starting-style 块的正文（全表应当只有一块） */
function startingStyleCss(): string {
  return atRuleBlock(motionCss(), '@starting-style')
}

// —— 手铺局面的小工具：只需要「哪些身份在盘上、值多少」，不关心位置语义 ——

const EMPTY_ROW: CellSpec[] = [null, null, null, null]

/** 把若干行贴在 4×4 空格棋盘上（classic 的尺寸，够放得下所有用例） */
function board(rows: CellSpec[][]): CellSpec[][] {
  const grid: CellSpec[][] = [0, 1, 2, 3].map((index) => (rows[index] ?? [...EMPTY_ROW]).slice())
  while (grid.length < 4) grid.push([...EMPTY_ROW])
  return grid
}

describe('四个效果的裁决表是完整的', () => {
  test('四张表以同一组效果为键，一个都不缺、也没有第五个', () => {
    expect([...TILE_EFFECTS]).toEqual(['move', 'spawn', 'merge', 'win'])
    const tables = [TILE_EFFECT_DURATIONS, EFFECT_DURATION_TOKEN, EFFECT_MECHANISM, EFFECT_REDUCED_MOTION]
    for (const table of tables) {
      expect([...Object.keys(table)].sort()).toEqual([...TILE_EFFECTS].sort())
    }
  })

  test('每个时长都是正数，每个静态替代都写了出来', () => {
    for (const effect of TILE_EFFECTS) {
      expect(TILE_EFFECT_DURATIONS[effect], effect).toBeGreaterThan(0)
      // 静态替代是这四行字符串存在的全部意义：空着等于说「这个效果降级后就没了」，
      // 而 SPEC §3.2 要求的是「每一个都有静态替代」
      expect(EFFECT_REDUCED_MOTION[effect].length, effect).toBeGreaterThan(0)
      expect(EFFECT_MECHANISM[effect].length, effect).toBeGreaterThan(0)
    }
  })

  test('win 那条静态替代说的是「看得见棋盘」，不是「保持覆盖」', () => {
    // T26 把结果层从「不透明满盖棋盘」改成了「半透明遮罩 + 不透明卡片」（ADR-0008）。
    // 文件头说这张表是权威、注释才会与它漂开——而这一次漂的是反方向：注释改了，
    // 表还留在「棋盘保持覆盖」，说的正是被删掉的那件事，而上面两条用例只断长度，
    // 一个字都不会红。所以把这句话本身钉住。
    expect(EFFECT_REDUCED_MOTION.win, 'win 的静态替代必须提到遮罩').toContain('遮罩')
    expect(EFFECT_REDUCED_MOTION.win, 'win 的静态替代不许再说棋盘被盖住').not.toContain(
      '保持覆盖'
    )
  })
})

describe('裁决表与 board.css 逐项对得上', () => {
  test('每个效果的时长钩子都在 CSS 里，兜底值与契约一致', () => {
    for (const effect of TILE_EFFECTS) {
      const token = EFFECT_DURATION_TOKEN[effect]
      const css = effect === 'win' ? shellCss() : motionCss()
      const hook = `var(${token}, ${TILE_EFFECT_DURATIONS[effect]}ms)`
      expect(css, `${effect} 的时长钩子`).toContain(hook)
    }
  })

  test('合并脉冲有独立时长，且不覆盖方块位移通道', () => {
    const css = motionCss()
    expect(EFFECT_DURATION_TOKEN.merge).not.toBe(EFFECT_DURATION_TOKEN.move)
    expect(EFFECT_DURATION_TOKEN.merge).toBe('--tile-merge-duration')
    expect(TILE_MERGE_PULSE_STEP_MS * 2).toBe(TILE_EFFECT_DURATIONS.merge)
    expect(css).toContain(".board__tile[data-merge-pulse='up']")
    expect(css).toContain(".board__tile[data-merge-pulse='down']")
    expect(css).toContain('transition-property: translate, scale')
    expect(css).toContain(".board__tile[data-merge-pulse='down'] {\n  scale: none;")
    expect(ruleBlock(css, ".board__tile[data-merge='true']")).toContain('z-index: 2')
    expect(ruleBlock(css, '.board__tile[data-merge-source-id]')).toContain('z-index: 1')
    expect(css).toContain(
      `calc(var(${EFFECT_DURATION_TOKEN.merge}, ${TILE_EFFECT_DURATIONS.merge}ms) / 2)`
    )
    expect(EFFECT_MECHANISM.merge).toBe('transition')
    const sourceRule = ruleBlock(css, '.board__tile[data-merge-source-id]')
    expect(sourceRule).toContain('transition:')
    expect(sourceRule).not.toContain('opacity')
    expect(sourceRule).not.toContain('scale')
    expect(sourceRule).not.toContain('animation:')
    expect(css).not.toContain('@keyframes tile-merge-source-exit')
  })

  test('位移是 translate 过渡，不是 animation、不是 @starting-style', () => {
    const base = ruleBlock(motionCss(), '.board__tile {')
    expect(base).toContain('transition:')
    expect(base).toContain(`translate var(--tile-move-duration, ${TILE_EFFECT_DURATIONS.move}ms)`)
    // animation 是留给不适合 transition 的效果，基规则上一个都不能有
    expect(base).not.toContain('animation')
  })

  test('@starting-style 全表只出现一次，且只服务入场（验收标准 2）', () => {
    const css = motionCss()
    expect(css.split('@starting-style').length - 1).toBe(1)
    const entry = startingStyleCss()
    expect(entry).toContain("[data-spawn='true']")
    expect(entry).toContain('var(--tile-enter-from-opacity, 0.6)')
    expect(entry).toContain('var(--tile-enter-from-scale, 1)')
    // 滑动与合并都不是入场：一个根本没有重新插入节点，另一个的产物与两个操作数
    // 共用一个节点——起始帧压根不会出现，硬套只会得到一张静止的第一帧
    expect(entry).not.toContain('data-merge')
    expect(entry).not.toContain('data-win')
  })

  test('合并走 scale transition，胜利标题用一次性动画在外壳入场', () => {
    const shell = shellCss()
    expect(motionCss()).toContain(".board__tile[data-merge-pulse='up']")
    expect(motionCss()).toContain(".board__tile[data-merge-pulse='down']")
    expect(motionCss()).toContain('scale: var(--tile-merge-scale, 1.08)')
    expect(motionCss()).not.toContain('animation: tile-merge-pulse')
    expect(shell).toContain('@keyframes win-panel-title-enter')
    expect(shell).toContain(
      'animation: win-panel-title-enter var(--win-title-duration, 180ms) ease-out 1 both'
    )
    expect(shell).toContain(
      'animation: win-panel-title-fade var(--win-title-duration, 180ms) ease-out 1 both'
    )
    expect(ruleBlock(shell, "[data-panel='win'] .overlay__title")).toContain('opacity: 1')
    expect(ruleBlock(shell, "[data-panel='win'] .overlay__title")).toContain('scale: 1')
    expect(shell).toContain('@keyframes win-panel-title-fade')
    expect(boardCss()).not.toContain('.overlay__title')
    expect(EFFECT_DURATION_TOKEN.win).toBe('--win-title-duration')
    expect(EFFECT_MECHANISM.win).toBe('animation')
  })
})

describe('reduced-motion：每条通道都换成静态替代（验收标准 3）', () => {
  const reduced = reducedMotionCss()

  test('位移与两个脉冲都停', () => {
    expect(reduced).toContain('transition: none')
    expect(reduced).toContain('animation: none')
  })

  test('入场的起点值改成与终点相同', () => {
    // 一个把过渡整个关掉的浏览器不会把新方块卡在半透明上。
    // 变量直接声明在 .board__tile 上而不是靠继承：直接声明永远压过主题 tokens.css
    // 里的同名声明，于是三套风格在这里表现一致，与打包顺序无关
    expect(reduced).toContain('--tile-enter-from-opacity: 1')
    expect(reduced).toContain('--tile-enter-from-scale: 1')
  })

  test('三个记号各自有一条规则（位移没有记号：方块直接落在新格）', () => {
    // 位移那条不需要记号——身份在 data-tile-id、位置在 data-row / data-col 上，
    // 棋盘不会撒谎，只是不再表演过程。其余三条都要一个不动的记号
    expect(reduced).toContain("[data-spawn='true']")
    expect(reduced).toContain("data-merge='true']")
    expect(reduced).toContain("[data-win='true']")
  })
})

describe('diffTileMotion：哪一枚在这一帧有动静', () => {
  /** 同一局里的一帧：initialSeed 与 modeId 都沿用 classic 的基线 */
  const frame = (rows: CellSpec[][]): ReturnType<typeof stateWithBoard> =>
    stateWithBoard(board(rows), 7, 'classic')
  /** 另一局：只换种子。用来证明「换局不是一次过渡」 */
  const otherRun = (rows: CellSpec[][]): ReturnType<typeof stateWithBoard> => ({
    ...stateWithBoard(board(rows), 7, 'classic'),
    initialSeed: 99,
  })

  test('第一帧什么都不发生：棋盘刚出现，没有「刚刚」可言', () => {
    expect(diffTileMotion(null, frame([[2, 2, null, null]]), 2048).size).toBe(0)
  })

  test('纯位移：身份两帧都在、值没变，一个旗标都不亮', () => {
    // 这是「移动靠 CSS 过渡、不靠任何 JS 旗标」的根据——旗标亮了就说明多了一套机制
    const before = frame([[2, null, null, null]])
    const after = frame([[null, 2, null, null]])
    expect(diffTileMotion(before, after, 2048).size).toBe(0)
  })

  test('生成：新入盘的那一枚带 spawn', () => {
    const before = frame([[2, null, null, null]])
    const after = frame([[2, 2, null, null]])
    const motion = diffTileMotion(before, after, 2048)
    expect(motion.get(2)).toEqual({ spawn: true, merge: false, win: false })
    // 1 号只是安安稳稳待在原格，不该被算成有动静
    expect(motion.get(1)).toBeUndefined()
  })

  test('合并：产物带 merge，被吞掉的那一枚被忽略', () => {
    // 引擎把身份归「落在目标格上」的那个方块（board.ts 的 placed.push），
    // 所以 1 号是产物、2 号消失——diff 只看得出产物
    const before = frame([[2, 2, null, null]])
    const after = frame([[4, null, null, null]])
    const motion = diffTileMotion(before, after, 2048)
    expect(motion.get(1)).toEqual({ spawn: false, merge: true, win: false })
    expect(motion.get(2)).toBeUndefined()
  })

  test('合成目标块：同一帧 merge 与 win 一起亮', () => {
    const before = frame([[1024, 1024, null, null]])
    const after = { ...frame([[2048, null, null, null]]), reachedTarget: true }
    expect(diffTileMotion(before, after, 2048).get(1)).toEqual({
      spawn: false,
      merge: true,
      win: true,
    })
  })

  test('胜利不重播：判据与引擎的 wonNow 逐字相同', () => {
    // 刷新续玩、从胜利面板继续玩之后又合出一个目标块，都不该再放那一口气
    const won = { ...frame([[2048, null, null, null]]), reachedTarget: true }
    const stillWon = { ...frame([[2048, 2, null, null]]), reachedTarget: true }
    const motion = diffTileMotion(won, stillWon, 2048)
    expect(motion.get(1)).toBeUndefined()
    // 新生成的那一枚照旧是生成：胜利不重播不等于什么都不发生
    expect(motion.get(2)).toEqual({ spawn: true, merge: false, win: false })
  })

  test('换局不是一次过渡：新局的 id 会撞上旧局残留的 id', () => {
    // 少了这条守卫，「开局就摆好的两枚」会被误判成一次合并——脉冲会无缘无故响一下。
    // 这里故意造一个值变高的撞车局面，证明守卫挡住的是它
    const before = frame([[4, null, null, null]])
    const after = otherRun([[4, 2, null, null]])
    expect(diffTileMotion(before, after, 2048).size).toBe(0)
  })

  test('换模式同理', () => {
    const before = frame([[4, null, null, null]])
    const after = stateWithBoard(board([[4, null, null, null]]), 7, 'fibonacci')
    expect(diffTileMotion(before, after, 2584).size).toBe(0)
  })

  test('撤销不会触发脉冲：值只升不降才是合并', () => {
    // 撤销把合并拆回去，值降了；而被拆出来的那一枚重新出现在盘上，按「新入盘」
    // 淡入一次——它确实刚刚回到盘上，这不算谎话
    const merged = frame([[4, null, null, null]])
    const restored = frame([[2, 2, null, null]])
    const motion = diffTileMotion(merged, restored, 2048)
    expect(motion.get(1)).toBeUndefined()
    expect(motion.get(2)).toEqual({ spawn: true, merge: false, win: false })
  })

  test('交换不触发任何动效：只换位置，值与身份都不变', () => {
    // T12 的作弊交换。它不在裁决表里，所以这里必须什么都不亮——
    // 否则玩家每换一次棋子都看到一遍合并脉冲。
    // 后半个棋盘手写：boardOf 按行序编号，写不出「1 号带着 2 挪到右边」这种交换结果
    const before = frame([[2, 4, null, null]])
    // 后半个棋盘直接按 Cell 摆：boardOf 按行序编号，写不出「1 号带着 2 挪到右边」这种
    // 交换结果。局面本身不重要，重要的是「同一批身份换了位置、值一个都没变」
    const blank = (): Cell[] => [null, null, null, null]
    const swapped: Board = [blank(), blank(), blank(), blank()]
    swapped[0][0] = { id: 2, value: 4 }
    swapped[0][1] = { id: 1, value: 2 }
    const after: GameState = { ...frame([[2, 4, null, null]]), board: swapped }
    expect(diffTileMotion(before, after, 2048).size).toBe(0)
  })

  test('没有动静时取到的是共享的空旗标', () => {
    expect(NO_TILE_MOTION).toEqual({ spawn: false, merge: false, win: false })
    const before = frame([[2, null, null, null]])
    const after = frame([[null, null, null, 2]])
    // 不在表里的身份就是没有动静；共享常量让十几枚方块共用一个对象
    expect(diffTileMotion(before, after, 2048).get(1)).toBeUndefined()
  })

  test('动效只读状态：两帧棋盘一个字节都没被碰', () => {
    // 与 T20 的音效同一条边界：动效观察状态，不生产状态
    const before = frame([[2, 2, null, null]])
    const after = frame([[4, 2, null, null]])
    const snapshot = structuredClone({ before: before.board, after: after.board })
    diffTileMotion(before, after, 2048)
    expect(before.board).toEqual(snapshot.before)
    expect(after.board).toEqual(snapshot.after)
    // 分数、随机进度、身份计数也一样：它们连入参都没进这个函数
    expect(after.score).toBe(before.score)
    expect(after.rngState).toBe(before.rngState)
    expect(after.nextTileId).toBe(before.nextTileId)
  })
})

describe('diffMergeSources：被吞操作数飞向正确的合并格', () => {
  const cases: {
    direction: Direction
    rows: CellSpec[][]
    from: readonly [number, number]
    to: readonly [number, number]
    sourceId: number
  }[] = [
    { direction: 'left', rows: [[2, 2, null, null]], from: [0, 1], to: [0, 0], sourceId: 2 },
    { direction: 'right', rows: [[2, 2, null, null]], from: [0, 0], to: [0, 3], sourceId: 1 },
    { direction: 'up', rows: [[2, null, null, null], [2, null, null, null]], from: [1, 0], to: [0, 0], sourceId: 2 },
    { direction: 'down', rows: [[2, null, null, null], [2, null, null, null]], from: [0, 0], to: [3, 0], sourceId: 1 },
  ]

  for (const example of cases) {
    test(example.direction, () => {
      const before = stateWithBoard(board(example.rows), 7, 'classic')
      const result = move(before, example.direction)
      expect(result.changed).toBe(true)
      expect(diffMergeSources(before, result.state, example.direction, 9)).toMatchObject([
        { key: `9:${example.sourceId}`, from: example.from, to: example.to },
      ])
    })
  }
})

describe('Tile key 的身份基准是 Tile.id', () => {
  /**
   * key 的身份基准住在源码里，**TypeScript 看不见它**——换成位置做 key 一样编译得过、
   * 一样跑得动，只是方块会跳而不是滑。像 theme-contract.test.ts 钉 CSS 文本那样，
   * 这里把源码文本钉住：e2e 那一层由节点印记抓同一条（tile-motion.spec.ts），
   * 而这一层能在 node 里跑，不必等浏览器。
   */
  const boardSource = (): string =>
    readFileSync(
      new URL('../../src/renderer/components/Board.tsx', import.meta.url),
      'utf8'
    )

  test('方块列表的 key 取 Tile.id', () => {
    const source = boardSource()
    expect(source).toContain('key={cell.id}')
  })

  test('key 不许用位置拼', () => {
    // 位置做 key：React 为新的 key 建新节点、卸载旧节点。于是位移动画一个中间帧都没有
    //（方块「跳」而不是「滑」），而一次合并还会把两枚叠在同一格上——T21 验收标准 1
    // 禁的正是它。这也是本票唯一一处「看起来更简洁的统一写法」会造成静默损坏的地方
    const source = boardSource()
    // [^}]* 之内出现 rowIndex / colIndex 就是位置拼出来的 key（模板字符串与算式都算）
    expect(source).not.toMatch(/key=\{[^}]*\b(rowIndex|colIndex)\b/)
  })
})
