import { describe, expect, test, vi } from 'vitest'
import { createSynth, synth } from '../../src/renderer/audio/synth'
import type {
  AudioContextLike,
  GainLike,
  OscillatorLike,
  PlayOptions,
  Synth,
} from '../../src/renderer/audio/synth'
import { mergedValueOf, pitchForValue, planFor } from '../../src/renderer/audio/tone'
import type { GameState } from '../../src/shared/types'
import { boardOf, stateWithBoard } from './support'

/**
 * T20 的合成半边（纯决策 + WebAudio 胶水），全部用**假 AudioContext** 驱动
 *
 * 为什么必须能这样测：本会话被明确要求不打开任何浏览器、不跑 Playwright，而「声音对不
 * 对」在这里根本不可验证（headless 浏览器里音频本来就听不见）。能验证的是**决策**：
 * 有没有在手势之前造出 AudioContext、静音时连造都不造、四个事件各自排出什么振荡器、
 * 音高是否随数值单调上升。这些全是数字，于是它们必须是可断言的数字——本文件钉的就是
 * 这一组。至于「好不好听」，只有 owner 在真机上说了算。
 */

/**
 * 装在 import 之前的全局 AudioContext 替身
 *
 * `vi.hoisted` 的工厂在 import 之前跑，所以 synth.ts 模块求值那一刻（如果它敢造一个
 * AudioContext）已经被这里数着。「导入即不构造」因此是一条真正的断言，不是一句
 * 「看起来没有」。
 */
const importSpy = vi.hoisted(() => {
  let constructed = 0
  class CountingContext {
    constructor() {
      constructed += 1
    }
  }
  globalThis.AudioContext = CountingContext as unknown as typeof AudioContext
  return { constructions: (): number => constructed }
})

// ─── 假 AudioContext ────────────────────────────────────────────────────────

/** 一个被排下来的振荡器：`scheduleTone` 对一个 ToneSpec 的全部动作都记在这里 */
interface ScheduledTone {
  type: OscillatorType
  frequency: number
  /** 起振时刻（秒，相对 context 的 currentTime） */
  startAt: number
  /** 停振时刻 */
  stopAt: number
  /** 音量包络的峰值（历史上被设过的最大值） */
  peakGain: number
}

/** 一条接线：谁接到了谁上面。用来证明图是振荡器 → 增益 → destination */
interface Edge {
  from: 'oscillator' | 'gain'
  to: 'gain' | 'destination'
}

/** 假参数：真参数之外多记一个「被设过的最大值」，也就是包络峰值 */
interface FakeParam {
  value: number
  readonly peak: number
  setValueAtTime(value: number, time: number): void
  exponentialRampToValueAtTime(value: number, time: number): void
}

interface FakeAudio {
  /** 工厂被调了几次 = 造了几个 AudioContext */
  readonly constructed: number
  /** resume() 被调了几次 */
  readonly resumes: number
  /** 按 stop 顺序排下来的振荡器 */
  readonly tones: ScheduledTone[]
  readonly edges: Edge[]
  createContext(): AudioContextLike
  /** 把 context 摆成 suspended：验证「手势里造出来的也要唤醒」 */
  setSuspended(): void
  /** 让 createOscillator 抛错：验证「WebAudio 炸掉不带崩一局棋」 */
  setBroken(broken: boolean): void
}

function createFakeAudio(): FakeAudio {
  let constructed = 0
  let resumes = 0
  let broken = false
  let state: AudioContextState = 'running'
  const tones: ScheduledTone[] = []
  const edges: Edge[] = []
  // 每个振荡器各自的接点与时刻。闭包变量按「同时只有一个音在配」摆放——scheduleTone
  // 是同步的，一个音配完才配下一个，所以这里不需要按振荡器各存一份
  // 假增益器：GainLike 加一个「被设过的最大值」，音量包络的峰值从它读出来
  let gainOf: (GainLike & { readonly gain: FakeParam }) | null = null
  let startedAt = 0
  let stoppedAt = 0

  /**
   * 造一个假参数。这里只记不改真东西——没有浏览器在听，而断言要的恰恰是
   * 「被设过哪些值」（峰值就是音量包络的形状）。
   */
  const makeParam = (): FakeParam => {
    let peak = 0
    const param: FakeParam = {
      value: 0,
      get peak(): number {
        return peak
      },
      setValueAtTime(value: number): void {
        peak = Math.max(peak, value)
        param.value = value
      },
      exponentialRampToValueAtTime(value: number): void {
        peak = Math.max(peak, value)
        param.value = value
      },
    }
    return param
  }

  return {
    get constructed(): number {
      return constructed
    },
    get resumes(): number {
      return resumes
    },
    get tones(): ScheduledTone[] {
      return tones
    },
    get edges(): Edge[] {
      return edges
    },
    setSuspended(): void {
      state = 'suspended'
    },
    setBroken(value: boolean): void {
      broken = value
    },
    createContext(): AudioContextLike {
      constructed += 1
      // destination 是一个固定对象：断言「接上了它」时要有同一个身份可比
      const destination = {
        name: 'destination',
        connect: (): void => {},
      }
      return {
        get currentTime(): number {
          // 恒 0：于是 startAt / stopAt 就是 plan 里的 delay / duration，断言不必再减一次
          return 0
        },
        get state(): AudioContextState {
          return state
        },
        destination,
        createOscillator(): OscillatorLike {
          if (broken) throw new Error('这一个环境没有振荡器')
          const frequency = makeParam()
          const oscillator: OscillatorLike = {
            type: 'sine',
            frequency,
            connect(target: unknown): void {
              // 振荡器只被接到增益器上。接的是不是真的增益，由「有 gain 属性」认
              gainOf = target as GainLike & { readonly gain: FakeParam }
              edges.push({ from: 'oscillator', to: 'gain' })
            },
            start(when?: number): void {
              startedAt = when ?? 0
            },
            stop(when?: number): void {
              stoppedAt = when ?? 0
              // stop 是 scheduleTone 的最后一个动作，此刻振荡器与它的增益都已配齐
              tones.push({
                type: oscillator.type,
                frequency: frequency.value,
                startAt: startedAt,
                stopAt: stoppedAt,
                peakGain: gainOf?.gain.peak ?? 0,
              })
            },
          }
          return oscillator
        },
        createGain(): GainLike {
          const gain = makeParam()
          return {
            gain,
            connect(): void {
              edges.push({ from: 'gain', to: 'destination' })
            },
          }
        },
        resume(): Promise<void> {
          resumes += 1
          state = 'running'
          return Promise.resolve()
        },
      }
    },
  }
}

/** 造一个 synth：WebAudio 走假 context，降级判断由测试现给 */
function newSynth(audio: FakeAudio, reduced = false): Synth {
  return createSynth({
    createContext: () => audio.createContext(),
    prefersReducedSensation: () => reduced,
  })
}

const UNMUTED: PlayOptions = { muted: false, value: 0 }

// ─── 手势之前不构造 ─────────────────────────────────────────────────────────

describe('AudioContext 只在用户手势之后才存在', () => {
  test('导入 synth.ts 一个 AudioContext 都不造', () => {
    // 模块在文件最上面就导入完了，而全局替身在 import 之前就装着。模块求值那一刻
    // 若造过 context，这个数不会是 0
    expect(importSpy.constructions()).toBe(0)
  })

  test('生产环境那一个 synth：导入之后不造，第一次发声才造，且只造一个', () => {
    expect(importSpy.constructions()).toBe(0)
    // 这里的替身只会计数、不会发音，所以只断言构造次数，不断言音色
    synth.play('move', UNMUTED)
    expect(importSpy.constructions()).toBe(1)
    synth.play('merge', { muted: false, value: 8 })
    synth.play('win', UNMUTED)
    // 惰性单例：后面每一次发声都复用第一次造出来的那一个
    expect(importSpy.constructions()).toBe(1)
  })

  test('新建出来的 synth 在第一次发声之前一个 context 都没有', () => {
    const audio = createFakeAudio()
    const sound = newSynth(audio)
    expect(audio.constructed).toBe(0)
    expect(audio.tones).toHaveLength(0)
    sound.play('move', UNMUTED)
    expect(audio.constructed).toBe(1)
    expect(audio.tones).toHaveLength(1)
  })
})

// ─── 静音在构造之前判 ───────────────────────────────────────────────────────

describe('静音', () => {
  test('静音的第一次发声连 AudioContext 都不构造', () => {
    const audio = createFakeAudio()
    const sound = newSynth(audio)
    sound.play('merge', { muted: true, value: 2048 })
    // 这是本票最要紧的一条：不是「合成完再把增益归零」，而是压根不碰 WebAudio
    expect(audio.constructed).toBe(0)
    expect(audio.tones).toHaveLength(0)
  })

  test('响过之后转静音：context 还是那一个，一个振荡器都不再建', () => {
    const audio = createFakeAudio()
    const sound = newSynth(audio)
    sound.play('merge', { muted: false, value: 8 })
    expect(audio.constructed).toBe(1)
    const afterFirst = audio.tones.length

    sound.play('merge', { muted: true, value: 1024 })
    sound.play('win', { muted: true, value: 0 })
    expect(audio.constructed).toBe(1)
    expect(audio.tones).toHaveLength(afterFirst)
  })

  test('四个事件在静音下一声都没有', () => {
    const audio = createFakeAudio()
    const sound = newSynth(audio)
    for (const event of ['move', 'merge', 'win', 'loss'] as const) {
      sound.play(event, { muted: true, value: 16 })
    }
    expect(audio.constructed).toBe(0)
    expect(audio.tones).toHaveLength(0)
  })
})

// ─── 四个事件的音色 ─────────────────────────────────────────────────────────

describe('四个事件各自响成什么样', () => {
  test('移动：一个短促低沉的正弦，是四个事件里最不显眼的那一个', () => {
    const audio = createFakeAudio()
    const sound = newSynth(audio)
    sound.play('move', UNMUTED)
    const [tone] = audio.tones
    expect(audio.tones).toHaveLength(1)
    expect(tone.type).toBe('sine')
    expect(tone.frequency).toBe(174.61)
    // 60 毫秒：一次按键的长度。再长就连成一片
    expect(tone.stopAt - tone.startAt).toBeCloseTo(0.06, 5)
    // 比合并音轻一半：它响得最勤，不能盖过别的声音
    expect(tone.peakGain).toBeCloseTo(0.1, 5)
  })

  test('合并：两个振荡器——三角波基音 + 低音量的八度泛音', () => {
    const audio = createFakeAudio()
    const sound = newSynth(audio)
    sound.play('merge', { muted: false, value: 8 })
    expect(audio.tones).toHaveLength(2)
    const [fundamental, overtone] = audio.tones
    expect(fundamental.type).toBe('triangle')
    expect(overtone.type).toBe('sine')
    // 泛音必须是八度：不是整数倍的话会与基音打架
    expect(overtone.frequency).toBeCloseTo(fundamental.frequency * 2, 5)
    expect(overtone.peakGain).toBeLessThan(fundamental.peakGain)
  })

  test('合并的音高随 Tile 数值单调上升（本票的核心要求）', () => {
    const audio = createFakeAudio()
    const sound = newSynth(audio)
    const values = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096]
    const heard: number[] = []
    values.forEach((value, index) => {
      sound.play('merge', { muted: false, value })
      // 每一次合并排两个振荡器（基音 + 泛音），第 index 次发声的基音在 2*index 上
      heard.push(audio.tones[index * 2].frequency)
    })
    // 严格递增：数值大一档音就高一档，一步都不许回头
    for (let index = 1; index < heard.length; index += 1) {
      expect(heard[index]).toBeGreaterThan(heard[index - 1])
    }
    // 与纯函数逐档相等：WebAudio 那一侧没有自己改过一次音高
    values.forEach((value, index) => {
      expect(heard[index]).toBeCloseTo(pitchForValue(value), 5)
    })
    // 翻一倍 = 一个全音（两个半音）的固定比例，与它在哪一档无关
    expect(pitchForValue(8) / pitchForValue(4)).toBeCloseTo(Math.pow(2, 2 / 12), 6)
    // 斐波那契那套数值也单调：合并表换了，音高的判据不换
    expect(pitchForValue(13)).toBeGreaterThan(pitchForValue(8))
    expect(pitchForValue(5)).toBeGreaterThan(pitchForValue(3))
  })

  test('数值钳在 1：0 与负数算得出一个能听的频率，不是 NaN', () => {
    expect(pitchForValue(1)).toBeGreaterThan(0)
    expect(pitchForValue(0)).toBe(pitchForValue(1))
    expect(pitchForValue(-4)).toBe(pitchForValue(1))
    expect(Number.isFinite(pitchForValue(1))).toBe(true)
  })

  test('胜利：三个三角波上行琶音，一个比一个高、一个比一个晚', () => {
    const audio = createFakeAudio()
    const sound = newSynth(audio)
    sound.play('win', UNMUTED)
    const tones = audio.tones
    expect(tones).toHaveLength(3)
    expect(tones.every((tone) => tone.type === 'triangle')).toBe(true)
    expect(tones[1].frequency).toBeGreaterThan(tones[0].frequency)
    expect(tones[2].frequency).toBeGreaterThan(tones[1].frequency)
    // 三个音错开排：同时响的不超过两个，加起来不会削顶
    expect(tones[0].startAt).toBe(0)
    expect(tones[1].startAt).toBeCloseTo(0.09, 5)
    expect(tones[2].startAt).toBeCloseTo(0.18, 5)
  })

  test('失败：三个音下行，且单个音比胜利的长', () => {
    const lossAudio = createFakeAudio()
    const winAudio = createFakeAudio()
    newSynth(lossAudio).play('loss', UNMUTED)
    newSynth(winAudio).play('win', UNMUTED)
    const lossTones = lossAudio.tones
    expect(lossTones).toHaveLength(3)
    expect(lossTones[1].frequency).toBeLessThan(lossTones[0].frequency)
    expect(lossTones[2].frequency).toBeLessThan(lossTones[1].frequency)
    // 收尾比庆祝长：失败要余一会儿，胜利要干脆
    const winTone = winAudio.tones[0]
    expect(lossTones[0].stopAt - lossTones[0].startAt).toBeGreaterThan(
      winTone.stopAt - winTone.startAt
    )
  })

  test('音频图是真的：振荡器 → 增益 → destination，没有一个振荡器直接怼出去', () => {
    const audio = createFakeAudio()
    const sound = newSynth(audio)
    sound.play('win', UNMUTED)
    expect(audio.edges).toEqual([
      { from: 'oscillator', to: 'gain' },
      { from: 'gain', to: 'destination' },
      { from: 'oscillator', to: 'gain' },
      { from: 'gain', to: 'destination' },
      { from: 'oscillator', to: 'gain' },
      { from: 'gain', to: 'destination' },
    ])
    // 每个音都收尾：不收尾的振荡器会被浏览器一直算下去，那是真的在漏
    for (const tone of audio.tones) {
      expect(tone.stopAt).toBeGreaterThan(tone.startAt)
    }
  })
})

// ─── 惰性与唤醒 ─────────────────────────────────────────────────────────────

describe('context 的惰性与唤醒', () => {
  test('suspended 的 context 在同一个手势里被唤醒', () => {
    const audio = createFakeAudio()
    audio.setSuspended()
    const sound = newSynth(audio)
    sound.play('move', UNMUTED)
    expect(audio.constructed).toBe(1)
    expect(audio.resumes).toBe(1)
  })

  test('已经在跑的 context 不去多按一次 resume', () => {
    const audio = createFakeAudio()
    const sound = newSynth(audio)
    sound.play('move', UNMUTED)
    sound.play('move', UNMUTED)
    expect(audio.resumes).toBe(0)
  })
})

// ─── 降低感官刺激 ───────────────────────────────────────────────────────────

describe('降低感官刺激（prefers-reduced-motion）', () => {
  test('胜利与失败的琶音各收成一个音，且更轻更短', () => {
    const audio = createFakeAudio()
    const sound = newSynth(audio, true)
    sound.play('win', UNMUTED)
    sound.play('loss', UNMUTED)
    // 每次发声一个音：两串琶音变成两声
    expect(audio.tones).toHaveLength(2)
    for (const tone of audio.tones) {
      expect(tone.peakGain).toBeLessThan(0.14)
      expect(tone.stopAt - tone.startAt).toBeLessThan(0.2)
    }
  })

  test('合并音去掉泛音、音量减半，但音高照旧携带数值信息', () => {
    const audio = createFakeAudio()
    const sound = newSynth(audio, true)
    sound.play('merge', { muted: false, value: 512 })
    expect(audio.tones).toHaveLength(1)
    // 音高不降：降低刺激不等于把「合出了多大」这个信息一起关掉
    expect(audio.tones[0].frequency).toBeCloseTo(pitchForValue(512), 5)
    expect(audio.tones[0].peakGain).toBeLessThan(0.2)
  })

  test('移动音照旧只有一声，只是更短更轻', () => {
    const audio = createFakeAudio()
    const sound = newSynth(audio, true)
    sound.play('move', UNMUTED)
    expect(audio.tones).toHaveLength(1)
    expect(audio.tones[0].peakGain).toBeLessThan(0.1)
    expect(audio.tones[0].stopAt - audio.tones[0].startAt).toBeLessThan(0.06)
  })
})

// ─── 炸掉不带崩游戏 ─────────────────────────────────────────────────────────

describe('WebAudio 不可用', () => {
  test('造不出振荡器也不抛，而且这条路就此安静地废掉', () => {
    const audio = createFakeAudio()
    audio.setBroken(true)
    const sound = newSynth(audio)
    expect(() => sound.play('merge', { muted: false, value: 8 })).not.toThrow()
    expect(() => sound.play('win', UNMUTED)).not.toThrow()
    expect(audio.tones).toHaveLength(0)
  })
})

// ─── 纯决策半边：这一步发生了什么 ───────────────────────────────────────────

describe('mergedValueOf：这一步合出了多大的方块', () => {
  test('一次合并：同一个 id 数值变大，返回值正是合出来的那个数', () => {
    const rows = [
      [2, 2, null, null],
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
    ]
    const before = stateWithBoard(rows)
    // 引擎的口径：产物落在被吞那一对的「落在目标格上」的那个方块上，id 不变
    // （src/game/board.ts 的 placed）。所以前态的 (0,0)=id 1 数值 2 → 后态数值 4
    const after: GameState = { ...before, board: boardOf([[4, null, null, null]]) }
    expect(mergedValueOf(before, after)).toBe(4)
  })

  test('一次纯滑动：身份没变、数值没变，于是没有合并', () => {
    const before = stateWithBoard([
      [null, 2, null, null],
      [null, 4, null, null],
      [null, null, null, null],
      [null, null, null, null],
    ])
    const after: GameState = {
      ...before,
      board: boardOf([
        [2, null, null, null],
        [4, null, null, null],
        [null, null, null, null],
        [null, null, null, null],
      ]),
    }
    // boardOf 按同一套行序发 id，所以两边的 id 一一对应，只是位置变了
    expect(mergedValueOf(before, after)).toBeNull()  })

  test('新生成的那一枚不算合并：它的 id 在前态里不存在', () => {
    const before = stateWithBoard([
      [2, 2, null, null],
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
    ])
    const after: GameState = {
      ...before,
      board: boardOf([
        [4, null, null, null],
        [null, null, null, null],
        [null, null, null, null],
        [null, null, null, null],
      ]),
    }
    // 生成落在 (3,3)，id 是 before.nextTileId（support.ts 钉的 100）
    after.board[3][3] = { id: before.nextTileId, value: 2 }
    expect(mergedValueOf(before, after)).toBe(4)
  })

  test('同一步里好几次合并，取最大的那一个', () => {
    const before = stateWithBoard([
      [2, 2, 64, 64],
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
    ])
    const after: GameState = {
      ...before,
      board: [
        [{ id: 1, value: 4 }, { id: 3, value: 128 }, null, null],
        [null, null, null, null],
        [null, null, null, null],
        [null, null, null, null],
      ],
    }
    // 合出 4 与 128 同时发生：响的是大的那个，否则小的会把大的盖掉
    expect(mergedValueOf(before, after)).toBe(128)
  })

  test('障碍不参与：墙里没有身份可比', () => {
    const before = stateWithBoard(
      [
        [2, 'wall', 8, 8],
        [null, null, null, null],
        [null, null, null, null],
        [null, null, null, null],
      ],
      7,
      'walls'
    )
    // boardOf 跳过 'wall' 发 id：这一盘 (0,0)=1、(0,2)=2、(0,3)=3
    const after: GameState = {
      ...before,
      board: boardOf([
        [2, 'wall', 16, null],
        [null, null, null, null],
        [null, null, null, null],
        [null, null, null, null],
      ]),
    }
    expect(mergedValueOf(before, after)).toBe(16)
  })
})

describe('planFor：一份方案自己说得清', () => {
  test('总时长撑得住最后一个音：delay + duration 正好收口', () => {
    for (const event of ['move', 'merge', 'win', 'loss'] as const) {
      const plan = planFor(event, 64, false)
      const end = plan.tones.reduce((max, tone) => Math.max(max, tone.delay + tone.duration), 0)
      expect(plan.duration).toBeCloseTo(end, 6)
    }
  })

  test('峰值音量都在 0 与 1 之间：事件叠在一起也削不了顶', () => {
    for (const event of ['move', 'merge', 'win', 'loss'] as const) {
      for (const tone of planFor(event, 2048, false).tones) {
        expect(tone.peakGain).toBeGreaterThan(0)
        expect(tone.peakGain).toBeLessThan(1)
      }
    }
  })
})
