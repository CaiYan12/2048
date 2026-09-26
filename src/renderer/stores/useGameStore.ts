import { create } from 'zustand'
import type { Direction, GameState } from '../../shared/types'
import type { ModeId } from '../../shared/modes'
import { abandon, continueRun, createGame, move, settle } from '../../game/engine'
import { fixtureFromQuery } from './fixture'

/**
 * 唯一的 Zustand store（SPEC §4：无 slice、无中间件）
 *
 * 它是**协调者，不是第二套规则引擎**：只负责调 createGame / move / continueRun /
 * settle / abandon 并把结果收着，一切规则判断（含 phase 迁移）都在 src/game/ 里。
 */
export interface GameStore {
  game: GameState | null // null = 尚未开局
  startRun(modeId: ModeId): void
  move(direction: Direction): void
  /** 从胜利面板继续玩：分数与棋盘保留，phase 由引擎判回 playing 还是 stuck */
  continueRun(): void
  /** 结束并记录：只有死局进得去；幂等（结算只执行一次） */
  settle(): void
  /** 放弃当前局并开新局。活跃局直接新游戏 = 放弃本局，不写任何记录 */
  newGame(): void
}

/** 抽一个随机种子 */
function drawSeed(): number {
  return Math.floor(Math.random() * 0xffffffff)
}

/**
 * 确定性测试缝：`?seed=12345` 替代随机种子。
 *
 * Playwright 的「固定局面合并测试」与 T08 的每日复现都走这个入口——同一个 seed 得到
 * 同一个初始局面和同一条随机流。本项目无服务器、无排行榜、也不主张竞技公平
 * （SPEC §6），所以它是调试/验收入口，不是作弊面；不带该参数时行为不变。
 */
function seedFromLocation(): number | null {
  if (typeof window === 'undefined') return null
  const raw = new URLSearchParams(window.location.search).get('seed')
  // 非整数的 seed 视为没给：宁可退回随机，也不要拿 NaN 当种子开局
  const seed = Number(raw)
  return Number.isInteger(seed) ? seed : null
}

export const useGameStore = create<GameStore>()((set) => ({
  game: null,
  startRun: (modeId) => {
    // 种子在这里抽：store 是调用方，Math.random 由它用（ADR-0001 禁的是 src/game/ 自己抽）
    const seed = seedFromLocation() ?? drawSeed()
    // 开局局面夹具：?board= 给了合法局面就从那开局（T04 的终局 e2e 靠它复现局面，
    // 后续每一步仍走真实按键与真实内核）。只有开局读它——「新游戏」用的是 drawSeed。
    set({ game: fixtureFromQuery(window.location.search, modeId, seed) ?? createGame(modeId, seed) })
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
      const abandoned = abandon(state.game)
      return { game: createGame(abandoned.modeId, drawSeed()) }
    })
  },
}))
