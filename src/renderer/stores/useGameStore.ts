import { create } from 'zustand'
import type { Direction, GameState } from '../../shared/types'
import type { ModeId } from '../../shared/modes'
import { createGame, move } from '../../game/engine'

/**
 * 唯一的 Zustand store（SPEC §4：无 slice、无中间件）
 *
 * 它是**协调者，不是第二套规则引擎**：只负责调 createGame / move 并把结果收着，
 * 一切规则判断都在 src/game/ 里。
 */
export interface GameStore {
  game: GameState | null // null = 尚未开局
  startRun(modeId: ModeId): void
  move(direction: Direction): void
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
  if (raw === null) return null
  const seed = Number(raw)
  // 非整数的 seed 视为没给：宁可退回随机，也不要拿 NaN 当种子开局
  return Number.isInteger(seed) ? seed : null
}

export const useGameStore = create<GameStore>()((set) => ({
  game: null,
  startRun: (modeId) => {
    // 种子在这里抽：store 是调用方，Math.random 由它用（ADR-0001 禁的是 src/game/ 自己抽）
    const seed = seedFromLocation() ?? Math.floor(Math.random() * 0xffffffff)
    set({ game: createGame(modeId, seed) })
  },
  move: (direction) => {
    set((state) => {
      if (!state.game) return state
      const outcome = move(state.game, direction)
      // 无效移动连 state 都不换：React 看到同一个对象就直接跳过重渲染
      return outcome.changed ? { game: outcome.state } : state
    })
  },
}))
