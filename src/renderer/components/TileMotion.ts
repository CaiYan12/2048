import type { Board, GameState, Tile } from '../../shared/types'

/**
 * 方块动效的裁决（T21）
 *
 * 这里只放**决定**，不放任何 DOM 与 CSS：哪一枚方块在这一帧该有哪个效果、四个效果
 * 各自靠什么 CSS 机制实现、reduced-motion 下各自退化成什么。决定住在 .ts 里的理由是
 * 它们得能在 node 环境里被单测——CSS 里的规则没法断言「合并没有用 @starting-style」，
 * 而这张表能。
 *
 * 与 CSS 的边界（ADR-0001 的同一条精神，只是方向相反）：**这里不写时长、不写颜色、
 * 不写选择器**，只写「哪个效果归哪个机制、时长由哪个变量驱动」。CSS 是这些决定的
 * 消费者，tests/unit/tile-motion.test.ts 负责把两边钉在一起——primal-setup-plan
 * P9 要的「JS/CSS 时长契约」就是那一组断言。
 */

/**
 * 四个效果（SPEC 用户故事 24、27 · 验收标准 1）
 *
 * 顺序即它们在一次移动里的发生顺序：方块先走，走到位的两枚合成一枚，合出的那一枚
 * 脉冲，达到目标时冒一次呼吸。
 */
export type TileEffect = 'move' | 'spawn' | 'merge' | 'win'

/** 四个效果的名字表。测试与上面那些 Record 都以它为全集，免得漏一个 */
export const TILE_EFFECTS: readonly TileEffect[] = ['move', 'spawn', 'merge', 'win']

/**
 * 时长契约（ms）
 *
 * **必须与 board.css 里同名变量的兜底值保持一致**——测试逐项对着 CSS 文本核，改一边
 * 不改另一边当场炸。这里存的是**默认值**（也就是 Classic 现值）：Material / Claude 在
 * 自己的 tokens.css 里覆盖，那是风格自己的事，不进这张表。
 *
 * 取值理由（T21 派发令要求「选时长并说明为什么」）：
 *
 *   · move 140ms：方块跨越整个 5×5 一行是 4×(100+12)=448px，140ms 走完约 3200px/s，
 *     读起来是「滑过去」而不是「闪过去」；同时它小于一个快玩家的按键间隔，不会出现
 *     「上一次还没走完，下一次已经排上」——那种堆积会让棋盘对自己的状态撒谎。
 *   · spawn 120ms：比 move 短一截。新方块与滑动同帧发生，它该先静下来，观众的目光
 *     才落在终点而不是落在半路上。
 *   · merge 140ms：**与 move 同一个值**。两个操作数与产物在同一帧里走完，观众不会
 *     分别计时，所以也不必准备第二个常量（三套设计卡的合并时长都与各自位移时长相同）。
 *   · win 1500ms：唯一一个可以长的。它长不起来坏事——合出目标块的那一刻 phase 转到
 *     won，引擎不接受任何移动（engine.ts 的 `phase !== 'playing'` 早退），所以不可能
 *     有输入在这个动画里排队。反过来，一次性的 1.5s 呼吸读作「里程碑」而不是「庆祝
 *     循环」。
 */
export const TILE_EFFECT_DURATIONS: Readonly<Record<TileEffect, number>> = {
  move: 140,
  spawn: 120,
  merge: 140,
  win: 1500,
}

/**
 * 驱动每个效果时长的 CSS 变量名
 *
 * 合并那一条指向位移的变量而不是自己有一个：理由见 TILE_EFFECT_DURATIONS.merge。
 * 表里出现两次同名不是重复——它记录的是「这两个效果共用一个时长」这个决定。
 */
export const EFFECT_DURATION_TOKEN: Readonly<Record<TileEffect, string>> = {
  move: '--tile-move-duration',
  spawn: '--tile-spawn-duration',
  merge: '--tile-move-duration',
  win: '--tile-win-duration',
}

/**
 * 四个效果各自的 CSS 机制（验收标准 2：`@starting-style` 只用于适用的入场）
 *
 * 写成表而不是注释：注释会与 CSS 漂开，表能被单测逐项对着 board.css 核。
 *
 *   · move    — transition。它要的是「从 A 到 B」。
 *   · spawn   — @starting-style。它要的正是「这个元素刚被插进 DOM」，而四个效果里
 *               只有生成会插入新元素（新 key → 新节点）。
 *   · merge   — animation。它要的是一次性脉冲；且**不能**重新入场——产物与两个操作数
 *               是同一个节点，起始帧根本不会出现。
 *   · win     — animation。同上，且更克制。
 */
export const EFFECT_MECHANISM: Readonly<Record<TileEffect, string>> = {
  move: 'transition',
  spawn: '@starting-style',
  merge: 'animation',
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
 *   · merge   图「这一枚是两枚合出来的」→ 同样换成记号。被吞掉的那一枚已经不在 DOM
 *              里，能指出的只剩产物（这正是不做留存节点的原因，见 Board.tsx）。
 *   · win     图「你到目标了」→ 记号**常驻**：这是本局的事实，不该跟着下一次移动消失
 *              （T04 的面板只在那一刻说话）。
 */
export const EFFECT_REDUCED_MOTION: Readonly<Record<TileEffect, string>> = {
  move: 'transition: none，方块直接落在新格',
  spawn: 'data-spawn 的静止描边',
  merge: 'data-merge 的静止描边',
  win: 'data-win 的常驻描边',
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
