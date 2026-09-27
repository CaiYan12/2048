import { planFor, type SoundEvent, type ToneSpec } from './tone'

/**
 * WebAudio 那一半边（T20）：惰性造 AudioContext、把 VoicePlan 排成真正的音频图
 *
 * 三条铁律，逐条都有浏览器策略或本项目契约撑着：
 *
 * 1. **用户手势之前不构造 AudioContext。** 浏览器规定手势之前造出来的 context 是
 *    suspended 的，还会往 console 打一句 warning；本项目的每一次发声都发生在手势
 *    之后（按键 / 点击派发 move），所以「第一次发声事件」就是最早的合法时机。
 *    于是 context 是**惰性单例**：不在模块作用域、不在组件挂载时、不在渲染里造。
 * 2. **先判静音，再碰 AudioContext。** 静音时连 context 都不造。合成完再把增益
 *    归零是错的——那仍然建了一整套音频图、仍然占着一条音频线程，白做工还要担风险。
 * 3. **音频绝不改变规则。** 这里只读事件、只排振荡器，没有一句写 store、没有一句
 *    推 GameState、不碰 rngState。反过来说：音频这条路**炸掉也不能把一局棋带崩**，
 *    所以整段包在 try 里，失败一次就安静地废掉（`unavailable`）。
 *
 * 测试把 `AudioContext` 换成一个假的（`createSynth` 的两个依赖就是为此留的入口），
 * 于是「手势前没造过」「静音连造都不造」「四个事件各自响成什么样」全是可断言的
 * 事实，不需要打开任何浏览器。
 */

/**
 * WebAudio 的最小面：synth 只用这几个成员
 *
 * 故意不写成 `AudioContext` 本身——那会让单测必须在 jsdom / 真浏览器里跑，
 * 而本项目的单测环境是 node（vitest.config.ts 钉着）。真实 AudioContext 结构上
 * 满足这个接口（tsc 会证），假的只要实现这几个方法就能被注入。
 */
export interface AudioNodeLike {
  /** 参数故意松散：真的 AudioNode 有十几个成员，而 synth 只需要「接上去」 */
  connect(target: unknown): void
}

export interface AudioParamLike {
  value: number
  setValueAtTime(value: number, startTime: number): void
  exponentialRampToValueAtTime(value: number, endTime: number): void
}

export interface GainLike extends AudioNodeLike {
  readonly gain: AudioParamLike
}

export interface OscillatorLike extends AudioNodeLike {
  type: OscillatorType
  readonly frequency: AudioParamLike
  start(when?: number): void
  stop(when?: number): void
}

export interface AudioContextLike {
  readonly currentTime: number
  /** 用真的那个联合类型：iOS 上还有 'interrupted'，自己另写一个三值联合会漏掉它 */
  readonly state: AudioContextState
  readonly destination: AudioNodeLike
  createOscillator(): OscillatorLike
  createGain(): GainLike
  resume(): Promise<void>
}

/** `play` 的两个实参 */
export interface PlayOptions {
  /** 静音。**在 AudioContext 之前判**，理由见文件头第 2 条 */
  muted: boolean
  /** 合并事件的有效数值（音高由它定）；其余事件传 0，实现忽略它 */
  value: number
}

export interface Synth {
  play(event: SoundEvent, options: PlayOptions): void
}

/** synth 的两个外部依赖。都注入而不是直接摸全局，是为了让单测能换掉它们 */
export interface SynthDeps {
  /** 造一个 AudioContext。**只在第一次发声事件里调** */
  createContext(): AudioContextLike
  /** 玩家是否要求降低感官刺激。每次发声现问一次，不缓存（系统设置会变） */
  prefersReducedSensation(): boolean
}

/**
 * 指数音量 ramp 的下界
 *
 * `exponentialRampToValueAtTime` 到不了 0（对数曲线永远摸不到轴），给 0 会让整个
 * ramp 被浏览器忽略、声音一路响到振荡器被 stop。所以「静音」用这个极小值表达。
 */
const SILENT_GAIN = 0.0001

/** 起振时间：8 毫秒。再快就听成一声咔哒，再慢就糊掉起始 */
const ATTACK_SECONDS = 0.008

/** 一个音：建振荡器与增益，按包络排完就停掉 */
function scheduleTone(context: AudioContextLike, tone: ToneSpec): void {
  const startAt = context.currentTime + tone.delay
  const endAt = startAt + tone.duration
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.type = tone.waveform
  oscillator.frequency.setValueAtTime(tone.frequency, startAt)
  // 音量包络：从 SILENT_GAIN 快速抬到峰值，再指数衰减回 SILENT_GAIN。
  // 两条指数曲线而不是线性，理由是「被敲击的东西」都这么衰减；线性收尾听起来
  // 像有人在拧音量旋钮
  gain.gain.setValueAtTime(SILENT_GAIN, startAt)
  gain.gain.exponentialRampToValueAtTime(tone.peakGain, startAt + ATTACK_SECONDS)
  gain.gain.exponentialRampToValueAtTime(SILENT_GAIN, endAt)
  oscillator.connect(gain)
  gain.connect(context.destination)
  oscillator.start(startAt)
  // stop 是必须的：不收尾的振荡器会被浏览器一直算下去，那是真的在漏
  oscillator.stop(endAt)
}

export function createSynth(deps: SynthDeps): Synth {
  // 惰性单例。**不在模块作用域、不在挂载时、不在渲染里**赋值（文件头第 1 条）
  let context: AudioContextLike | null = null
  // 这条声音的路已经废了。造不出 / 排不动时置位，之后每次 play 直接返回——
  // 一个没有 WebAudio 的环境照样能完整地玩这一局
  let unavailable = false

  const ensureContext = (): AudioContextLike | null => {
    if (context !== null) return context
    try {
      context = deps.createContext()
      // 手势里造出来的 context 正常就是 running，iOS Safari 仍可能给 suspended，
      // 于是趁还在同一个手势里把它唤醒。reject 不需要理会——那时声音只是不出来，
      // 而一句没人接的 rejection 会变成 console error（e2e 的 watchProblems 会
      // 把它当失败），所以这里显式吞掉
      if (context.state === 'suspended') void context.resume().catch(() => {})
    } catch {
      unavailable = true
      return null
    }
    return context
  }

  return {
    play(event, options) {
      // **静音在构造之前判**：静音时一个振荡器都不建（文件头第 2 条）
      if (options.muted || unavailable) return
      const audio = ensureContext()
      if (audio === null) return
      try {
        const plan = planFor(event, options.value, deps.prefersReducedSensation())
        for (const tone of plan.tones) scheduleTone(audio, tone)
      } catch {
        // 调度中途炸掉（个别环境缺某个振荡器类型 / context 已被关掉）：
        // 这一声没了，游戏一个字都不受影响（文件头第 3 条）
        unavailable = true
      }
    },
  }
}

/**
 * 玩家是否要求降低感官刺激（`prefers-reduced-motion: reduce`）
 *
 * 项目对 reduced-motion 的义务早就立下了（SPEC §3.2、每套风格 styles.css 的降级），
 * 而一个要求「少一点动」的玩家通常也要求「少一点响」——音频这边的对应物就是
 * 把每个事件收短、收轻、去掉泛音与琶音（见 tone.ts 的 REDUCED_* 常量）。
 *
 * 读的是媒体查询而不是一个自己的设置项：**这是系统的意愿，不该由本项目再问一遍**，
 * 也不该被写进 settings 桶冒充玩家的选择。
 */
export function prefersReducedSensation(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * 生产环境那一个 synth
 *
 * 模块求值只做一件事：把工厂和媒体查询包进一个对象。**AudioContext 要到第一次
 * 发声才被造出来**（`ensureContext` 里那句 `deps.createContext()`），所以这个
 * 模块在 node 单测里 import 也不会碰任何浏览器 API——tests/unit/synth.test.ts
 * 正是用这一点把「导入即不构造」钉成一条断言。
 */
export const synth = createSynth({
  createContext: () => new AudioContext(),
  prefersReducedSensation,
})

