import { create } from 'zustand'
import type { Direction, GameState } from '../../shared/types'
import type { ModeId } from '../../shared/modes'
import type { Coordinate } from '../../game/board'
import {
  abandon,
  continueRun,
  createGame,
  move,
  settle,
  swap,
  tick,
} from '../../game/engine'
import { seedFromUtcDate } from '../../shared/rng'
import { fixtureFromQuery } from './fixture'
import { seedFromSearch } from './seed'

/**
 * 唯一的 Zustand store（SPEC §4：无 slice、无中间件）
 *
 * 它是**协调者，不是第二套规则引擎**：只负责调 createGame / move / continueRun /
 * settle / tick / abandon / swap 并把结果收着，一切规则判断（含 phase 迁移、到点
 * 该不该结算、一次交换该不该解锁死局）都在 src/game/ 里。
 *
 * 它同时是**读钟的那一方**（ADR-0001）：Math.random 与 UTC 日期都在这里取，
 * src/game/ 与 src/shared/ 里一行 Date 都没有。
 */
export interface GameStore {
  game: GameState | null // null = 尚未开局
  /**
   * 前一状态栈。索引 0 是本局第一次有效移动之前的那一个状态，越往后越新。
   *
   * 无上限、不截断、不做环形缓冲（ADR-0003：撤销要能一路回到开局，「第 N 步之前
   * 是什么」必须全在）。`startRun` 与 `newGame` 把它清空——开局棋盘就是 `game`
   * 自己，历史里没有比它更早的东西，所以**从开局撤销不可能，也不会绕回第 N 步**。
   */
  history: readonly GameState[]
  /**
   * Daily 这一局的 UTC 日期串（'YYYY-MM-DD'）；非 Daily 模式为 null
   *
   * 为什么它不住进 GameState：它是**外壳要显示的一句话**，不是规则数据。规则数据是
   * initialSeed（种子本身），而日期串从种子里反推不回来（哈希是单向的），所以开局抽题
   * 那一刻由 store 把它收着。也正因如此它记的是「这一局抽题那天的日期」，不是渲染时
   * 现算的今天——跨过 UTC 零点之后，昨天开的那局标签不能跟着翻篇。
   */
  dailyDate: string | null
  /**
   * 交换选择态：已经被拾取、等待第二枚的那一枚方块（零基 [row, col]）。
   * null = 此刻没有待确认的选择。
   *
   * **为什么它不住进 GameState**：它是一次进行中的意图，不是这局的规则数据。
   * 规则数据是引擎认的那十个字段（src/shared/types.ts）；把一个「我正打算换哪两枚」
   * 塞进去，等于让 T16 持久化一个半截编辑、让 T17 的重放读到一次不存在的迁移。
   * 因此它也不被撤销恢复——撤销搬回的是完整前态（含 phase），选择是界面自己的事。
   */
  swapSelection: Coordinate | null
  /**
   * 交换拾取模式是否开着：开着时棋盘上的数值方块才可被拾取（Tab 停靠 + 轻点选中）。
   *
   * 为什么不能只靠 swapSelection：死局时 `.overlay` 是不透明满盖
   * （styles.css 的 inset:0 + 实底），面板不收起就点不到方块，指针那条路直接断；
   * 而活跃局里需要一个明确的入口，否则随手点两枚方块就是一次不可预期的交换。
   * 与 swapSelection 一样：不进 GameState、不进历史、不持久化（T16 存的是这一局，
   * 不是一个还没做完的编辑）。
   */
  swapArmed: boolean
  /** 开 / 关交换拾取。StatusBar 与死局面板的那两个按钮调的是同一个动作 */
  toggleSwap(): void
  /**
   * 拾取一枚方块：第一枚记下；同一枚再拾一次是取消；不同的一枚完成这次交换。
   * 非法组合（墙 / 空格，以及已终局）什么都不发生——连 state 都不换
   */
  selectCell(coordinate: Coordinate): void
  /** Esc：取消选择并退出拾取（用户故事 16 的「不用指针退出交换」） */
  clearSwap(): void
  startRun(modeId: ModeId): void
  move(direction: Direction): void
  /** 撤销一步：把栈顶那个完整前态搬回 game。空栈与已结算都是原样返回 */
  undo(): void
  /** 从胜利面板继续玩：分数与棋盘保留，phase 由引擎判回 playing 还是 stuck */
  continueRun(): void
  /** 结束并记录：死局与胜利面板都进得去；幂等（结算只执行一次） */
  settle(): void
  /** 时间推进到当前时刻：到期由引擎强制结算。未到期与非限时模式都是空操作 */
  tick(): void
  /** 放弃当前局并开新局。活跃局直接新游戏 = 放弃本局，不写任何记录 */
  newGame(): void
}

/** 同一格。坐标是零基 [row, col]，逐位比即可 */
function sameCell(a: Coordinate, b: Coordinate): boolean {
  return a[0] === b[0] && a[1] === b[1]
}

/** 抽一个随机种子 */
function drawSeed(): number {
  return Math.floor(Math.random() * 0xffffffff)
}

/**
 * 今天（UTC）的日期串，`'YYYY-MM-DD'`
 *
 * 只认 UTC：Daily 的承诺是「同一个 UTC 日期全球同一题」，本地时区一掺进来，
 * 东半球与西半球就会在不同的日期上抽题。toISOString 本身就是 UTC 口径。
 */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Daily 抽题：日期串 → 种子，连它要显示的那句话一起交出来 */
function drawDailySeed(): { seed: number; date: string } {
  const date = todayUtc()
  return { seed: seedFromUtcDate(date), date }
}

export const useGameStore = create<GameStore>()((set) => ({
  game: null,
  dailyDate: null,
  // 还没开局，也就没有历史可言：空栈让开局后的第一次撤销必然空操作
  history: [],
  // 还没开局：没有拾取、也没有选择
  swapArmed: false,
  swapSelection: null,
  toggleSwap: () => {
    set((state) => ({
      swapArmed: !state.swapArmed,
      // 关掉的那一刻选择一并作废：拾取目标都没了，半个选择留着只会误导
      swapSelection: null,
    }))
  },
  selectCell: (coordinate) => {
    set((state) => {
      const game = state.game
      // 三道门：没开局、没在拾取态、已终局。最后一道是 T11 留下的那道 ended 守卫
      // （useGameStore.undo 里同一条注释），mode-contract §3 用它同时挡 Undo 与交换
      // ——两处共用一条规则，而不是面板各自判断一遍
      if (!game || !state.swapArmed || game.phase === 'ended') return state
      // 同一枚再拾一次 = 取消（ticket 验收标准 1）。只清选择、不关拾取：
      // 玩家可以立刻另选一枚，不必重新走一遍入口
      if (state.swapSelection !== null && sameCell(state.swapSelection, coordinate)) {
        return { ...state, swapSelection: null }
      }
      // 第一枚：只记选择。棋盘一个格子都不动，也不进历史
      if (state.swapSelection === null) return { ...state, swapSelection: coordinate }
      // 第二枚：规则判断全在引擎里。null = 非法组合（墙 / 空格 / 越界），
      // 于是既不加历史也不换 state——选择原样留着，玩家可以改选别的一枚
      const swapped = swap(game, state.swapSelection, coordinate)
      if (swapped === null) return state
      // 与 move 进历史同一条路子：先走通的才把**操作前**那个完整前态压栈
      return {
        game: swapped,
        history: [...state.history, game],
        // 一次拾取只完成一次交换：收摊。ESC、一次移动、撤销同样收摊（见各动作）
        swapArmed: false,
        swapSelection: null,
      }
    })
  },
  clearSwap: () => {
    set((state) =>
      state.swapArmed || state.swapSelection !== null
        ? { swapArmed: false, swapSelection: null }
        : state
    )
  },
  startRun: (modeId) => {
    // 种子在这里抽：store 是调用方，Math.random 与 UTC 日期都由它取
    // （ADR-0001 禁的是 src/game/ 自己抽，不是禁调用方抽）。
    // Daily 用 UTC 日期推导，其余模式才看 ?seed=（解析与理由见 ./seed：它是调试 /
    // 验收的确定性入口，SPEC §6 无服务器、无排行榜，所以不是作弊面）。
    const daily = modeId === 'daily' ? drawDailySeed() : null
    const seed = daily?.seed ?? seedFromSearch(window.location.search) ?? drawSeed()
    // 时钟也在这里取：createGame 与开局夹具都只吃一个注入的 now，src/game/ 里
    // 一行 Date 都没有（ADR-0001）。限时模式的 deadline 由这个 now 决定，
    // 非限时模式忽略它。
    const now = Date.now()
    // 开局局面夹具：?board= 给了合法局面就从那开局（T04 的终局 e2e 靠它复现局面，
    // 后续每一步仍走真实按键与真实内核）。只有开局读它——「新游戏」用的是 drawSeed。
    set({
      game:
        fixtureFromQuery(window.location.search, modeId, seed, now) ??
        createGame(modeId, seed, now),
      dailyDate: daily?.date ?? null,
      // 每一局的历史从空开始：开局棋盘就是 game 自己，往前没有更早的状态。
      // 「新游戏」同样在这里清空（见 newGame），否则新一局能撤回到上一局去。
      history: [],
      // 上一局没做完的交换拾取不带到新一局来：拾取态与选择都是
      // 「本局此刻的界面状态」，与历史同一个边界
      swapArmed: false,
      swapSelection: null,
    })
  },
  move: (direction) => {
    set((state) => {
      if (!state.game) return state
      const outcome = move(state.game, direction)
      // 无效移动连 state 都不换：React 看到同一个对象就直接跳过重渲染。
      // 面板挡着（won / stuck / ended）时 move 也返回同一个对象，同理。
      if (!outcome.changed) return state
      // 只有真的走通了一步，才把**移动前**那个状态收进历史。判据就是 changed：
      // 无效移动时引擎原样返回同一个引用（engine.move 的两条早退），所以「棋盘
      // 根本没变」已经包含在 changed 里，再补一道引用比较是多余的。这条性质由
      // tests/unit/undo.test.ts 钉着，不在这里靠「相信引擎」活着。
      //
      // 展开成新数组而不是 push：history 对外是 readonly，原地改会绕过 zustand
      // 的引用相等比较，撤销后的重渲染就漏了。代价是每次 O(n)——长局因此是
      // O(n²)，mode-contract §4 要求实测这个成本（task-11 的测量那一笔），
      // 现在既没有上限也没有环形缓冲，ADR-0003 禁的就是悄悄丢历史。
      //
      // 交换拾取一并收摊：棋盘变了，等第二枚的那一枚已经不在玩家以为的地方，
      // 半个选择继续摆在屏幕上就是在骗人。无效移动走的是上面那条早退，
      // 什么都不发生，于是也不该清掉任何东西
      return {
        game: outcome.state,
        history: [...state.history, state.game],
        swapArmed: false,
        swapSelection: null,
      }
    })
  },
  undo: () => {
    set((state) => {
      if (!state.game) return state
      // 空栈 = 已经撤回开局（开局棋盘就是 game 自己），原样返回：
      // 绝不能绕回第 N 步，那等于把开局和历史尾巴缝成一个环。
      if (state.history.length === 0) return state
      // mode-contract §3：「进入 ended 后，Undo 与作弊交换一律不可用」。
      // 三个终局原因（deadlock / abandoned / timeout）共用这一条守卫。
      // 写在 store 而不是面板里，是因为 T12 的作弊交换要的是同一条守卫——
      // 面板各自判断的话，那条规则在仓库里就会出现两份。
      if (state.game.phase === 'ended') return state
      // 弹栈顶，不递归：栈是数组，一步撤销就是换两个字段。
      // stuck 不是终局（mode-contract §3），所以死局面板上的「撤销」走这条路。
      // 拾取态与选择一并收摊，理由同 move：棋盘回退了一格，
      // 「等第二枚的那一枚」这个意图已经不对着任何真实的东西了
      return {
        game: state.history[state.history.length - 1],
        history: state.history.slice(0, -1),
        swapArmed: false,
        swapSelection: null,
      }
    })
  },
  continueRun: () => {
    set((state) => {
      if (!state.game) return state
      // 引擎自己判断「续走即死局」该不该转去 stuck，store 只收结果
      return { game: continueRun(state.game) }
    })
  },
  settle: () => {
    set((state) => {
      if (!state.game) return state
      // 幂等：再点一次返回同一个对象，store 收着同一引用，界面什么都不发生
      return { game: settle(state.game) }
    })
  },
  tick: () => {
    set((state) => {
      if (!state.game) return state
      const next = tick(state.game, Date.now())
      // 没到期（或非限时、或已不在 playing）时引擎原样返回同一个对象：这里连新
      // state 都不造。与 move 的无效移动同一条路子——引用相等即「什么都没发生」，
      // zustand 的选择器因此不会触发重渲染，倒计时的读表也就不打扰棋盘那一层。
      return next === state.game ? state : { game: next }
    })
  },
  newGame: () => {
    set((state) => {
      if (!state.game) return state
      // 先终态化再开新局：mode-contract §3 把「活跃局直接新游戏」定义为放弃本局，
      // 所以这一步必须走 abandon（不写记录）。被放弃的那个状态只活在这一次 set 里，
      // 界面看不到它——紧接着就是一张干净的开局棋盘，不沿用任何旧格子与旧分数。
      //
      // 现在只读 abandoned.modeId，而 abandon 并不改 modeId，所以这一行目前**不可观测**。
      // 别删：它是 T17「写记录」要接的那道缝——届时被放弃的那个终态就是 abandoned 记录的
      // 依据，在此之前它刻意保持惰性，不写任何东西。
      const abandoned = abandon(state.game)
      const modeId = abandoned.modeId
      // 「新游戏」重新抽题：Daily 按**当前** UTC 日期抽——跨过零点再开新局就是新题
      // （T08 不变式 B 的「新局」半边）。其余模式照旧随机，这里不再读 ?seed=：
      // 那条缝只在开局那一刻读（T03 起的行为，T04/T06/T07 的 e2e 依赖它不变）。
      const daily = modeId === 'daily' ? drawDailySeed() : null
      const seed = daily?.seed ?? drawSeed()
      // 新一局的历史从空开始：撤销的边界是「本局的开局」，跨不过「新游戏」这道墙。
      // 不这么做的话，新一局能一路撤回到上一局的棋盘上。拾取态同一个边界：
      // 上一局没做完的交换不许跟到新棋盘上来
      return {
        game: createGame(modeId, seed, Date.now()),
        dailyDate: daily?.date ?? null,
        history: [],
        swapArmed: false,
        swapSelection: null,
      }
    })
  },
}))
