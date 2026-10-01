import type { Coordinate } from '../../game/board'
import { slideBoard } from '../../game/board'
import { getMode } from '../../shared/modes'
import type { Direction, Board, GameState, Tile } from '../../shared/types'

/**
 * 棋盘动效的裁决（T21）
 *
 * 这里只放**决定**，不放任何 DOM 与 CSS：哪一枚方块在这一帧该有哪个效果、胜利时面板
 * 如何给出反馈、各效果靠什么 CSS 机制实现、reduced-motion 下各自退化成什么。决定住在 .ts 里的理由是
 * 它们得能在 node 环境里被单测——CSS 里的规则没法断言「合并没有用 @starting-style」，
 * 而这张表能。
 *
 * 与 CSS 的边界（ADR-0001 的同一条精神，只是方向相反）：**这里不写时长、不写颜色、
 * 不写选择器**，只写「哪个效果归哪个机制、时长由哪个变量驱动」。CSS 是这些决定的
 * 消费者，tests/unit/tile-motion.test.ts 负责把棋盘层与外壳的 CSS 钩子钉在一起——
 * primal-setup-plan P9 要的「JS/CSS 时长契约」就是那一组断言。
 */

/**
 * 四个效果（SPEC 用户故事 24、27 · 验收标准 1）
 *
 * 方块沿空间路径滑动；合并来源落到产物下面，产物接近落点时脉冲；达标时面板标题给出
 * 一次短促的进入反馈。
 */
export type TileEffect = 'move' | 'spawn' | 'merge' | 'win'

/** 四个效果的名字表。测试与上面那些 Record 都以它为全集，免得漏一个 */
export const TILE_EFFECTS: readonly TileEffect[] = ['move', 'spawn', 'merge', 'win']

/**
 * 时长契约（ms）
 *
 * **必须与 board.css 里同名变量的兜底值保持一致**——测试逐项对着 CSS 文本核，改一边
 * 不改另一边当场炸。当前三套风格都声明相同的位移节奏，以免同一局游戏换肤后物理感突变。
 *
 * 取值理由（T21 派发令要求「选时长并说明为什么」）：
 *
 *   · move 150ms：方块跨越整个 5×5 一行是 448px，走完约 3000px/s；统一的 ease-out 曲线
 *     让移动从按键后第一帧起步并在落点收束，下一步仍从当前画面重定向。
 *   · spawn 120ms：比 move 短一截。新方块与滑动同帧发生，它该先静下来，观众的目光
 *     才落在终点而不是落在半路上。
 *   · merge 80ms CSS 过渡预算：40ms 放大、40ms 回落。回落阶段需在 transitionend 后经 React 提交，
 *     所以浏览器观察到的总墙钟时长还包含帧间隔；80ms 指两段 scale transition 的时长之和。
 *     脉冲在位移接近结束时启动，新的方向仍可重定向位置。
 *   · win 180ms：胜利面板标题做一次淡入和轻微缩放；棋盘仍在面板下方。
 */
export const TILE_EFFECT_DURATIONS: Readonly<Record<TileEffect, number>> = {
  move: 150,
  spawn: 120,
  merge: 80,
  win: 180,
}

/** 合并脉冲的上升与回落各占一半；transition 可在下一次输入到来时平滑中断 */
export const TILE_MERGE_PULSE_STEP_MS = TILE_EFFECT_DURATIONS.merge / 2

/**
 * 驱动每个效果时长的 CSS 变量名
 *
 * 合并有独立的脉冲时长；它在位移接近结束时开始，不与 move 共用计时。
 */
export const EFFECT_DURATION_TOKEN: Readonly<Record<TileEffect, string>> = {
  move: '--tile-move-duration',
  spawn: '--tile-spawn-duration',
  merge: '--tile-merge-duration',
  win: '--win-title-duration',
}

/**
 * 四个效果各自的 CSS 机制（验收标准 2：`@starting-style` 只用于适用的入场）
 *
 * 写成表而不是注释：注释会与 CSS 漂开，表能被单测逐项对着 board.css 核。
 *
 *   · move    — transition。它要的是「从 A 到 B」。
 *   · spawn   — @starting-style。它要的正是「这个元素刚被插进 DOM」，而四个效果里
 *               只有生成会插入新元素（新 key → 新节点）。
 *   · merge   — transition。上升 / 回落两段各是一次 scale 状态变化，下一步输入能从
 *               当前比例平滑重定向，不会重播一条过时的关键帧。
 *   · win     — animation。结果层标题入场一次，方块自身保留目标状态标记。
 */
export const EFFECT_MECHANISM: Readonly<Record<TileEffect, string>> = {
  move: 'transition',
  spawn: '@starting-style',
  merge: 'transition',
  win: 'animation',
}

/**
 * 每个效果在 `prefers-reduced-motion: reduce` 下的静态替代（SPEC §3.2 · 用户故事 24）
 *
 * **降级不是关掉功能**，T20 对音频的做法（收成一个单音，不是静音）是同一条精神：
 * 每个效果先说清自己在图什么，再给出不动而同样说得清的那一半。玩家仍然看得见每一枚
 * 方块、仍然走得动、分数照旧更新——少的是表演，不是信息。
 *
 *   · move    图「这一枚从哪儿来」→ 方块直接落在新格。身份在 data-tile-id、位置在
 *              data-row / data-col 上，棋盘不会撒谎，只是不再表演过程。
 *   · spawn   图「这一枚是新的，不是挪过来的」→ 不动就分不出来，换成**记号**：
 *              data-spawn 的那一枚描一圈 --focus，下一次移动时记号跟着新的一批走。
 *   · merge   图「这一枚是两枚合出来的」→ 同样换成记号。reduced-motion 不渲染飞行载体，
 *              只给规则棋盘里的合并产物描边。
 *   · win     图「你到目标了」→ 标题只淡入，不缩放；卡片照旧不透明、遮罩照旧压暗棋盘。
 */
export const EFFECT_REDUCED_MOTION: Readonly<Record<TileEffect, string>> = {
  move: 'transition: none，方块直接落在新格',
  spawn: 'data-spawn 的静止描边',
  merge: 'data-merge 的静止描边',
  win: '标题只淡入，棋盘透过遮罩仍可见',
}

/** 单枚方块在这一帧该带的动效旗标。三个互不排斥，但 spawn 与 merge 实际不会同时为真 */
export interface TileMotion {
  /** 这一帧新入盘：入场的载者 */
  spawn: boolean
  /** 这一帧由合并产生：合并脉冲的载者 */
  merge: boolean
  /** 这一帧达成目标：胜利序列的载者 */
  win: boolean
}

/** 什么动静都没有。共享一个常量：Board 每帧要为十几枚方块取它，不值得各造一个对象 */
export const NO_TILE_MOTION: TileMotion = { spawn: false, merge: false, win: false }

/** 身份编号 → 这一帧的动效旗标。没有条目的身份就是 NO_TILE_MOTION */
export type TileMotionMap = ReadonlyMap<number, TileMotion>

/** 棋盘上所有数值方块，按身份编号索引 */
function tilesById(board: Board): Map<number, Tile> {
  const found = new Map<number, Tile>()
  for (const row of board) {
    for (const cell of row) {
      // 窄化成 Tile：null（空格）与 'wall'（障碍）都不是方块，也永远不会是动效的载者
      if (cell !== null && cell !== 'wall') found.set(cell.id, cell)
    }
  }
  return found
}

/** 一次移动里因合并而离盘的操作数，以及它飞向的合并格 */
export interface MergeSourceMotion {
  key: string
  tile: Tile
  from: Coordinate
  to: Coordinate
}

/** 按障碍切分移动通道，与规则内核的 lane 边界保持一致 */
function motionLanes(board: Board, direction: Direction): Coordinate[][] {
  const size = board.length
  const alongRow = direction === 'left' || direction === 'right'
  const lanes: Coordinate[][] = []

  for (let line = 0; line < size; line += 1) {
    let run: Coordinate[] = []
    for (let index = 0; index <= size; index += 1) {
      if (index === size) {
        if (run.length > 0) lanes.push(run)
        run = []
        continue
      }
      const coordinate: Coordinate = alongRow ? [line, index] : [index, line]
      if (board[coordinate[0]][coordinate[1]] === 'wall') {
        if (run.length > 0) lanes.push(run)
        run = []
      } else {
        run.push(coordinate)
      }
    }
  }
  return lanes
}

/**
 * 找出本次有效移动中被合并吞掉的方块，并按规则内核的实际结果配对到产物。
 *
 * 这里只返回渲染层要用的起点、终点和稳定 key；合并规则仍由 slideBoard 唯一决定。
 */
export function diffMergeSources(
  before: GameState | null,
  after: GameState,
  direction: Direction,
  transitionId: number
): readonly MergeSourceMotion[] {
  if (
    before === null ||
    before.modeId !== after.modeId ||
    before.initialSeed !== after.initialSeed ||
    after.moves !== before.moves + 1
  ) {
    return []
  }

  const slidBoard = slideBoard(before.board, direction, getMode(before.modeId).mergeFamily).board
  const beforeTiles = tilesById(before.board)
  const slidTiles = tilesById(slidBoard)
  const removedIds = new Set([...beforeTiles.keys()].filter((id) => !slidTiles.has(id)))
  const mergedIds = new Set(
    [...slidTiles].flatMap(([id, tile]) => {
      const earlier = beforeTiles.get(id)
      return earlier !== undefined && tile.value > earlier.value ? [id] : []
    })
  )
  const reverse = direction === 'right' || direction === 'down'
  const sources: MergeSourceMotion[] = []

  for (const lane of motionLanes(before.board, direction)) {
    const orderedLane = reverse ? [...lane].reverse() : lane
    const removed = orderedLane.flatMap((coordinate) => {
      const tile = before.board[coordinate[0]][coordinate[1]]
      return tile !== null && tile !== 'wall' && removedIds.has(tile.id)
        ? [{ tile, coordinate }]
        : []
    })
    const products = orderedLane.flatMap((coordinate) => {
      const tile = slidBoard[coordinate[0]][coordinate[1]]
      return tile !== null && tile !== 'wall' && mergedIds.has(tile.id)
        ? [{ tile, coordinate }]
        : []
    })

    for (let index = 0; index < Math.min(removed.length, products.length); index += 1) {
      const source = removed[index]
      const product = products[index]
      if (source === undefined || product === undefined) continue
      sources.push({
        key: `${transitionId}:${source.tile.id}`,
        tile: source.tile,
        from: source.coordinate,
        to: product.coordinate,
      })
    }
  }

  return sources
}

/**
 * 相邻两帧之间，哪些方块刚刚发生了什么。
 *
 * **它只读状态、绝不写状态**：不动 rngState、不动分数、不动身份，返回值只用来给
 * DOM 加三个 data-* 属性。与 T20 的音效同一条边界——动效观察状态，不生产状态。
 *
 * `targetValue` 由调用方（模式定义）传入而不是在这里 getMode：这个函数的全部输入都
 * 是普通数据，单测因此可以直接用手铺的局面跑，不必先搭一个模式。
 *
 * 三条判据，逐条都有「为什么不是另一种」：
 *
 *   1. `before === null` → 什么都不发生。棋盘第一次出现（开局、刷新续玩、从开局界面
 *      进场）时没有「刚刚」可言，不该给整块棋盘放一遍入场。
 *   2. 换了模式或换了种子 → 什么都不发生。这是**另一块棋盘**，不是一次过渡。少了这
 *      一条，新局的 id 从 1 重新编号会撞上旧局残留的 id，把「开局就摆好的两枚」误判
 *      成一次合并（脉冲会无缘无故响一下）。
 *   3. 同一局之内 → 按身份比：
 *         · id 只在后面出现      → 生成；
 *         · id 两帧都在、值变高了 → 合并。
 *      值**只升不降**是合并的充分判据：幂等家族倍乘、斐波那契取后继，两者产物的值都
 *      严格大于两个操作数。撤销会把值降回去，所以撤销不会误触发脉冲；而撤销带来一个
 *      曾经消失的身份时，那一枚按「新入盘」淡入一次——它确实重新出现在盘上，这不算谎话。
 */
export function diffTileMotion(
  before: GameState | null,
  after: GameState,
  targetValue: number
): TileMotionMap {
  if (before === null) return new Map()
  // 另一块棋盘，不是一次过渡（判据 2）
  if (before.modeId !== after.modeId || before.initialSeed !== after.initialSeed) return new Map()

  const previous = tilesById(before.board)
  const current = tilesById(after.board)
  const motion = new Map<number, TileMotion>()

  for (const [id, tile] of current) {
    const earlier = previous.get(id)
    if (earlier === undefined) {
      motion.set(id, { spawn: true, merge: false, win: false })
    } else if (tile.value > earlier.value) {
      motion.set(id, { spawn: false, merge: true, win: false })
    }
  }

  // 胜利序列只在新达标的那一帧播一次。判据与引擎 move() 里的 wonNow 逐字相同
  // （engine.ts 的 `reachedTarget && !state.reachedTarget`）：刷新续玩、从胜利面板
  // 继续玩之后再合出目标块，都不会重播那一口气。
  // `before` 非空已由上面保证，所以这里不需要为「没有上一帧」单开一条分支。
  if (!after.reachedTarget || before.reachedTarget) return motion
  for (const [id, tile] of current) {
    if (tile.value < targetValue) continue
    const existing = motion.get(id) ?? NO_TILE_MOTION
    motion.set(id, { ...existing, win: true })
  }
  return motion
}
