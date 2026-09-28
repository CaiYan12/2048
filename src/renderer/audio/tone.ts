import type { Board, GameState, Tile } from '../../shared/types'

/**
 * 合成决策的纯半边（T20 · SPEC 用户故事 23）
 *
 * 本文件**一个 WebAudio 名词都没有**：不碰 window、不碰 AudioContext、不碰 Date。
 * 它只回答三件事——
 *   1. 方块数值对应哪个音高（`pitchForValue`）；
 *   2. 一次事件要哪几个振荡器、什么波形、多响多久（`planFor`）；
 *   3. 这一步到底发生了什么（`mergedValueOf`：合并了吗，合出多大）。
 * 于是「音色与音高的决策」可以在 node 环境里被单测逐条驱动，而 WebAudio 那一半边
 * （建振荡器、排包络、惰性造 AudioContext）住在 synth.ts，由测试注入一个假的
 * AudioContext——两半都不需要在浏览器里才能被验证。
 *
 * **这里没有任何一句「规则」**：引擎已经发生的事情是唯一的输入，输出只有声音。
 */

/**
 * 一次发声的事件种类
 *
 * 前四个是 T20 点名的（移动 / 合并 / 胜利 / 失败）；`blocked`（无法移动）是此后应项目
 * 所有者要求补上的**第五个**——README 的 TODO 已把它列进「各类音效调整下拉框」，而
 * 一个下拉框能列出的选项，首先得是一个事件。它的音色是占位（见 planFor 的 blocked 分支）。
 */
export type SoundEvent = 'move' | 'merge' | 'win' | 'loss' | 'blocked'

/** 一个振荡器的规格。synth.ts 照它建振荡器与增益包络，一个数字都不自己加 */
export interface ToneSpec {
  waveform: OscillatorType
  /** 频率（Hz） */
  frequency: number
  /** 峰值音量（0–1） */
  peakGain: number
  /** 相对事件起点的起振时刻（秒）。一串音符靠它排成先后 */
  delay: number
  /** 这一个音振多久（秒） */
  duration: number
}

/** 一次事件的完整配音方案：一串振荡器 + 一共响多久 */
export interface VoicePlan {
  tones: readonly ToneSpec[]
  /** 从事件起点到最后一个音收完的总时长（秒） */
  duration: number
}

// ─── 音高 ────────────────────────────────────────────────────────────────────

/**
 * 音高的基数：方块数值 2 落在 C4（261.63 Hz）
 *
 * 从 2 起算而不是从 0：方块数值的最小值就是 1（斐波那契的 1/2），而 0 不是方块。
 */
const BASE_FREQUENCY = 261.63

/**
 * 数值每翻一倍升几个半音。两个 = 一个全音
 *
 * 于是经典模式从 2 到 4096 恰好跨两个八度——既听得出来「这一下合大了」，
 * 又不会在长局的后期尖到刺耳。每翻倍只升半个音的话，整局只有一个八度，
 * 「大合并」与「小合并」听起来差不太多，那音高就不携带信息了。
 */
const SEMITONES_PER_DOUBLING = 2

// ─── 四个事件的音色 ──────────────────────────────────────────────────────────

/** 移动音的固定频率（F3）：它响得最勤，所以音量与时长都压在合并音之下 */
const MOVE_FREQUENCY = 174.61
const MOVE_DURATION = 0.06
const MOVE_PEAK_GAIN = 0.1

/**
 * 无法移动的占位音色：A2（比移动音低一个八度多一点），且更短、更轻
 *
 * 「更闷、更短、更轻」就是这一声的全部设计：它要说的是「什么都没发生」，所以三样
 * 都压在移动音之下——走得动的那一下已经够轻了，走不动的不该比它更响。
 * 音色本身是占位：README 的 TODO 把「震动等特效」留给后来者，那才是这一声的最终形态。
 */
const BLOCKED_FREQUENCY = 110
const BLOCKED_DURATION = 0.05
const BLOCKED_PEAK_GAIN = 0.08

/** 合并音时长与音量。音高不在这里定，它由方块数值算出来 */
const MERGE_DURATION = 0.16
const MERGE_PEAK_GAIN = 0.2
/**
 * 合并音里高八度泛音所占的比例
 *
 * 纯正弦听起来像一块安静的提示音，加一个低音量的八度泛音才有「被合上」的质感。
 * 八度而不是五度：泛音必须是基频的整数倍才不与基音打架。
 */
const OVERTONE_GAIN_RATIO = 0.35

/** 一串琶音里相邻两个音的间隔 */
const NOTE_STAGGER = 0.09
/** 琶音里单个音的时长 */
const NOTE_DURATION = 0.13
/** 琶音的峰值音量。三个音错开排，所以同时响的不超过两个 */
const ARPEGGIO_PEAK_GAIN = 0.14

/** 失败音比胜利音长、比胜利音慢：收尾不该和庆祝一样响、一样急 */
const LOSS_NOTE_DURATION = 0.24
const LOSS_NOTE_STAGGER = 0.13

/** 胜利的三个音：C 大调上行琶音。上行 = 「上去了」 */
const WIN_NOTES: readonly number[] = [523.25, 659.25, 783.99]
/** 失败的三个音：A 小调下行。下行 = 「落了」 */
const LOSS_NOTES: readonly number[] = [329.63, 261.63, 220]

// ─── 降低感官刺激 ────────────────────────────────────────────────────────────

/**
 * 降低感官刺激时的增益比例（`prefers-reduced-motion: reduce`）
 *
 * 一个要「少一点动」的玩家通常也要「少一点响」。做法不是把音量整体调低——
 * 那会让所有事件听起来都像坏掉的音箱——而是**砍掉多余的刺激**：琶音收成一个音、
 * 泛音去掉、每个音都短一半。音高仍然携带「合出了多大的方块」这个信息，
 * 所以降低刺激不等于把耳朵闭上。
 */
const REDUCED_GAIN_SCALE = 0.5
const REDUCED_DURATION_SCALE = 0.6

/**
 * 方块数值 → 频率（Hz）。**严格单调**：数值越大音越高
 *
 * 这是 ticket 的硬要求，也是「声音携带信息而不是装饰」的落点：合出 1024 的那一下
 * 不必看棋盘就知道比刚才那一下大。取 log2 而不是线性映射，因为方块数值本身是
 * 指数增长的（2 的幂 / 斐波那契）——线性映射下前一半的数值会挤在一个极窄的频段里，
 * 后一半直接冲破可听范围。
 */
export function pitchForValue(value: number): number {
  // 方块数值必然 ≥1；0 / 负数没有意义，钳住以免算出 NaN 或负频率
  const safe = Math.max(value, 1)
  // 数值 2 → 0 个半音；每翻一倍加两个半音
  const semitones = (Math.log2(safe) - 1) * SEMITONES_PER_DOUBLING
  return BASE_FREQUENCY * Math.pow(2, semitones / 12)
}

/** 一串音的总长度：最后一个音收完的那一刻 */
function totalDuration(tones: readonly ToneSpec[]): number {
  return tones.reduce((end, tone) => Math.max(end, tone.delay + tone.duration), 0)
}

/** 收成一份方案。总时长由最后一个音算出来，不另写一个数——两个数会对不上 */
function planOf(tones: readonly ToneSpec[]): VoicePlan {
  return { tones, duration: totalDuration(tones) }
}

/**
 * 一串琶音。降低感官刺激时收成**一个音**
 *
 * 收成的是最后一个音：胜利那条是最高那个（听得出是好事），失败那条是最低那个
 * （听得出是坏事）——事件的「性质」因此没有丢失，丢的只是华丽。
 */
function arpeggio(
  notes: readonly number[],
  duration: number,
  stagger: number,
  reduced: boolean
): readonly ToneSpec[] {
  if (reduced) {
    return [
      {
        waveform: 'triangle',
        frequency: notes[notes.length - 1],
        peakGain: ARPEGGIO_PEAK_GAIN * REDUCED_GAIN_SCALE,
        delay: 0,
        duration: duration * REDUCED_DURATION_SCALE,
      },
    ]
  }
  return notes.map((frequency, index): ToneSpec => ({
    waveform: 'triangle',
    frequency,
    peakGain: ARPEGGIO_PEAK_GAIN,
    delay: index * stagger,
    duration,
  }))
}

/**
 * 一次事件的配音方案
 *
 * `value` 只有 merge 看得懂（它定音高），其余事件传什么都被忽略。
 * `reduced` 是「玩家要求降低感官刺激」，由调用方从媒体查询现读现传——本文件不碰
 * window，所以这条判断必须是个参数而不是一次内部查询。
 */
export function planFor(event: SoundEvent, value: number, reduced: boolean): VoicePlan {
  // 两个比例一次算清：`reduced` 只影响「多响、多大声」，不影响「响的是什么」
  const gainScale = reduced ? REDUCED_GAIN_SCALE : 1
  const durationScale = reduced ? REDUCED_DURATION_SCALE : 1
  switch (event) {
    // 移动：一声短促低沉的正弦。它是这五个事件里最勤的一个（每一次按键），
    // 所以刻意做得轻——否则响得最多的会是声音最大的
    case 'move': {
      const duration = MOVE_DURATION * durationScale
      return planOf([
        {
          waveform: 'sine',
          frequency: MOVE_FREQUENCY,
          peakGain: MOVE_PEAK_GAIN * gainScale,
          delay: 0,
          duration,
        },
      ])
    }
    // 合并：三角波基音 + 八度泛音，音高随方块数值。三角波而不是方波，
    // 因为方波的泛音列太密，一次移动连着合两三下会糊成一片噪音
    case 'merge': {
      const frequency = pitchForValue(value)
      const duration = MERGE_DURATION * durationScale
      const tones: ToneSpec[] = [
        {
          waveform: 'triangle',
          frequency,
          peakGain: MERGE_PEAK_GAIN * gainScale,
          delay: 0,
          duration,
        },
      ]
      // 泛音是「锦上添花」那一个：降低刺激时第一个被砍掉，音高还在
      if (!reduced) {
        tones.push({
          waveform: 'sine',
          frequency: frequency * 2,
          peakGain: MERGE_PEAK_GAIN * gainScale * OVERTONE_GAIN_RATIO,
          delay: 0,
          duration,
        })
      }
      return planOf(tones)
    }
    case 'win':
      return planOf(arpeggio(WIN_NOTES, NOTE_DURATION, NOTE_STAGGER, reduced))
    case 'loss':
      return planOf(arpeggio(LOSS_NOTES, LOSS_NOTE_DURATION, LOSS_NOTE_STAGGER, reduced))
    // 无法移动：一个极短的低音。它不排第二个音、也不带数值——这一声只回答
    // 「你按的那个方向走不动」，没有第二件事要说
    case 'blocked': {
      const duration = BLOCKED_DURATION * durationScale
      return planOf([
        {
          waveform: 'sine',
          frequency: BLOCKED_FREQUENCY,
          peakGain: BLOCKED_PEAK_GAIN * gainScale,
          delay: 0,
          duration,
        },
      ])
    }
  }
}

/** 棋盘上所有数值方块（墙与空格都排除） */
function numericTiles(board: Board): readonly Tile[] {
  return board.flat().filter((cell): cell is Tile => cell !== null && cell !== 'wall')
}

/**
 * 这一步合出了多大的方块；**没有合并则 null**
 *
 * 判据是身份（`src/shared/types.ts` 的 `Tile.id`）：合并产物落在被吞掉那一对的
 * 「落在目标格上」的那个方块上，**id 不变而数值变大**（`src/game/board.ts` 的
 * `placed.push({ id: head.id, value: successor })`）。于是「同一个 id、数值变大」
 * 就是一次合并，而新数值正是音高该用的那个值。
 *
 * 新生成的那一枚 id 在前态里不存在，天然被排除——所以**这里不需要碰 src/game/**，
 * 也不需要引擎回报任何合并信息。ADR-0001 的铁律（规则内核零音频知识）因此没有
 * 被凿开一个洞：这是渲染层拿着两个状态自己读出来的。
 */
export function mergedValueOf(previous: GameState, next: GameState): number | null {
  const before = new Map<number, number>()
  for (const tile of numericTiles(previous.board)) before.set(tile.id, tile.value)
  let merged: number | null = null
  for (const tile of numericTiles(next.board)) {
    const old = before.get(tile.id)
    // 一次移动可能合并好几次，取最大的那个：同时合出 4 与 64 时，响的是大的那个
    if (old !== undefined && old < tile.value && (merged === null || tile.value > merged)) {
      merged = tile.value
    }
  }
  return merged
}
