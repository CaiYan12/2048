import { create } from 'zustand'
import type { Direction, GameState } from '../../shared/types'
import type { ModeId } from '../../shared/modes'
import { abandon, continueRun, createGame, move, settle } from '../../game/engine'
import { seedFromUtcDate } from '../../shared/rng'
import { fixtureFromQuery } from './fixture'
import { seedFromSearch } from './seed'

/**
 * 唯一的 Zustand store（SPEC §4：无 slice、无中间件）
 *
 * 它是**协调者，不是第二套规则引擎**：只负责调 createGame / move / continueRun /
 * settle / abandon 并把结果收着，一切规则判断（含 phase 迁移）都在 src/game/ 里。
 *
 * 它同时是**读钟的那一方**（ADR-0001）：Math.random 与 UTC 日期都在这里取，
 * src/game/ 与 src/shared/ 里一行 Date 都没有。
 */
export interface GameStore {
  game: GameState | null // null = 尚未开局
  /**
   * Daily 这一局的 UTC 日期串（'YYYY-MM-DD'）；非 Daily 模式为 null
   *
   * 为什么它不住进 GameState：它是**外壳要显示的一句话**，不是规则数据。规则数据是
   * initialSeed（种子本身），而日期串从种子里反推不回来（哈希是单向的），所以开局抽题
   * 那一刻由 store 把它收着。也正因如此它记的是「这一局抽题那天的日期」，不是渲染时
   * 现算的今天——跨过 UTC 零点之后，昨天开的那局标签不能跟着翻篇。
   */
  dailyDate: string | null
  startRun(modeId: ModeId): void
  move(direction: Direction): void
  /** 从胜利面板继续玩：分数与棋盘保留，phase 由引擎判回 playing 还是 stuck */
  continueRun(): void
  /** 结束并记录：死局与胜利面板都进得去；幂等（结算只执行一次） */
  settle(): void
  /** 放弃当前局并开新局。活跃局直接新游戏 = 放弃本局，不写任何记录 */
  newGame(): void
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
  startRun: (modeId) => {
    // 种子在这里抽：store 是调用方，Math.random 与 UTC 日期都由它取
    // （ADR-0001 禁的是 src/game/ 自己抽，不是禁调用方抽）。
    // Daily 用 UTC 日期推导，其余模式才看 ?seed=（解析与理由见 ./seed：它是调试 /
    // 验收的确定性入口，SPEC §6 无服务器、无排行榜，所以不是作弊面）。
    const daily = modeId === 'daily' ? drawDailySeed() : null
    const seed = daily?.seed ?? seedFromSearch(window.location.search) ?? drawSeed()
    // 开局局面夹具：?board= 给了合法局面就从那开局（T04 的终局 e2e 靠它复现局面，
    // 后续每一步仍走真实按键与真实内核）。只有开局读它——「新游戏」用的是 drawSeed。
    set({
      game: fixtureFromQuery(window.location.search, modeId, seed) ?? createGame(modeId, seed),
      dailyDate: daily?.date ?? null,
    })
  },
  move: (direction) => {
    set((state) => {
      if (!state.game) return state
      const outcome = move(state.game, direction)
      // 无效移动连 state 都不换：React 看到同一个对象就直接跳过重渲染。
      // 面板挡着（won / stuck / ended）时 move 也返回同一个对象，同理。
      return outcome.changed ? { game: outcome.state } : state
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
      return { game: createGame(modeId, seed), dailyDate: daily?.date ?? null }
    })
  },
}))
