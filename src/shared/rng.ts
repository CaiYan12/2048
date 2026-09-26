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

/** FNV-1a 32 的偏移基准 */
const FNV_OFFSET_BASIS = 0x811c9dc5
/** FNV-1a 32 的乘数质数 */
const FNV_PRIME = 0x01000193
/** murmur3 收尾混合的两个乘数（fmix32 的常数） */
const FMIX_C1 = 0x85ebca6b
const FMIX_C2 = 0xc2b2ae35

/**
 * UTC 日期串 → 32 位初始种子（Daily 模式专用，T08）
 *
 * 入参形如 `'YYYY-MM-DD'`（正好是 `new Date().toISOString().slice(0, 10)`），
 * 由调用方读钟后传入：本文件与 `src/game/` 一样不碰 Date / Math.random（ADR-0001），
 * store 就是那个调用方。
 *
 * **为什么必须是真有雪崩的哈希**：日期串只有 10 个字节，而且相邻两天只差**一个字符**
 * （`2026-09-26` vs `2026-09-27`）。弱哈希——包括「直接把 20260926 当种子」这种
 * 最顺手的写法——会让相邻日期的种子只差一两个比特。实测（2,000 个连续 UTC 日期的
 * 相邻种子对按位比较的平均差异）：
 *   日期当数字            2.09 / 32 比特
 *   只用 FNV-1a          10.24 / 32 比特
 *   FNV-1a + fmix32      15.91 / 32 比特（理论上限 16）
 * 前两种形态下全世界玩家每天拿到的开局高度相似，本模式就白做了。
 *
 * 所以分两步：FNV-1a 先把整串吃进 32 位累加器（无表、常数小、易复核），再用
 * murmur3 的 fmix32 收尾，把累加器里的局部差扩散到全部 32 位。
 *
 * **改了它就会静默改掉每一个 Daily 开局**——过去与将来的题目全部变样。所以
 * `tests/unit/daily.test.ts` 把若干固定日期的种子值**钉死**而不是推导，
 * 哈希一改测试立刻红，不给「无声换题」留门。
 */
export function seedFromUtcDate(utcDate: string): number {
  let hash = FNV_OFFSET_BASIS
  for (let index = 0; index < utcDate.length; index += 1) {
    hash ^= utcDate.charCodeAt(index)
    hash = Math.imul(hash, FNV_PRIME)
  }
  // fmix32：murmur3 的 finalizer，xorshift + 两个乘数，把低位差推上高位
  hash ^= hash >>> 16
  hash = Math.imul(hash, FMIX_C1)
  hash ^= hash >>> 13
  hash = Math.imul(hash, FMIX_C2)
  hash ^= hash >>> 16
  return hash >>> 0
}
