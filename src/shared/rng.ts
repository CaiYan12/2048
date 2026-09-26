import type { RngState } from './types'

/**
 * 可恢复随机源
 *
 * mulberry32：单个 32 位无符号状态，所以 `serialize()` 就是那个计数器本身，
 * `restoreRng(state)` 能**接着**同一条流继续走——T08 的每日复现与 T16 的刷新续玩
 * 都建立在这个性质上，因此单测显式验证它。
 *
 * 规则内核自己不调用 Math.random（ADR-0001）：种子由调用方在开局时注入，
 * 之后的进度存在 GameState.rngState 里跟着状态走。
 */
export interface Rng {
  /** [0, 1) */
  next(): number
  /** [0, n) 整数 */
  int(n: number): number
  /** 可恢复进度：刷新后续玩靠它（ADR-0001）。必须是一个 plain number */
  serialize(): RngState
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  return {
    next,
    int: (n: number) => Math.floor(next() * n),
    serialize: () => state,
  }
}

/** 从序列化进度恢复同一条流。等于「以那个计数器为种子新建」，因为状态就是种子 */
export function restoreRng(state: RngState): Rng {
  return createRng(state)
}
