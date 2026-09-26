import type { JSX } from 'react'
import type { ModeId } from './modes'

/** 移动方向。顺序无含义，仅作联合类型 */
export type Direction = 'up' | 'down' | 'left' | 'right'

/**
 * 稳定身份：跨移动不变。渲染层靠它做位移动画（T21），撤销靠它校验（T11）。
 * 同一个方块在一局里自始至终是同一个 id，只有位置在变（CONTEXT.md 的 Tile）。
 */
export interface Tile {
  id: number
  value: number
}

/** null = 空格子；'wall' = 障碍（T07，永不移动/合并/生成）；Tile = 数值方块 */
export type Cell = Tile | 'wall' | null

/** [row][col]，零基；mode-contract 的口径 */
export type Board = Cell[][]

/** 随机源的可恢复进度。mulberry32 的 32 位计数器本身，所以 serialize/restore 无损 */
export type RngState = number

/**
 * 运行阶段。mode-contract §3 的四个状态；只有 ended 是终局。
 * won 只是里程碑面板（可以继续玩），stuck 是可恢复的死局面板（Undo / 交换）。
 */
export type RunPhase = 'playing' | 'won' | 'stuck' | 'ended'

/**
 * 为什么结束。deadlock = 死局后点「结束并记录」；abandoned = 活跃局或死局面板上点「新游戏」；
 * won = 达成目标后主动收工（mode-contract §3 状态图补订的 won→结算边）；
 * timeout = Time Attack 三分钟到点，由 tick 强制结算（T09）。
 *
 * `won` 是**赢下的收工**，不是失败：渲染它的 runEndLabel 不许写成一句败局的话。
 * timeout 与 deadlock 也必须是两句不同的话——mode-contract §3 把超时定为**强制**结算，
 * 死局留给玩家自己决定，两回事在界面上要能区分开（SPEC 用户故事 7）。
 */
export type EndReason = 'won' | 'deadlock' | 'abandoned' | 'timeout' | null

export interface GameState {
  modeId: ModeId
  board: Board
  score: number
  /** 曾达到目标值的里程碑标志；可无限次进出，不是终局（mode-contract §3） */
  reachedTarget: boolean
  /**
   * 运行阶段（mode-contract §3 的四个状态；只有 ended 是终局）。
   * 与 reachedTarget 问的不是同一个问题：reachedTarget 说「这局曾经达标」，只升不降，
   * 给 T17 的记录与 T18 的成就读；phase 说「此刻在做什么」，会随面板开关变化。
   * 两者故意并存，不收成一个。
   */
  phase: RunPhase
  /** 结束原因；未结束前恒为 null */
  endReason: EndReason
  /** 下一个 Tile 身份的计数器，参与持久化（T16 要求身份可恢复） */
  nextTileId: number
  /**
   * 本局最初使用的种子。Daily 由 UTC 日期推导（seedFromUtcDate），其余模式由调用方抽取
   *
   * 不是多余的字段：Daily 的种子来自**外部且会变**的输入（日期），把这个推导结果
   * 收进状态里才是「这一局认自己的种子」的直接表达。否则推导结果只以 rngState 的
   * 形式隐式存在，跨 UTC 零点那条不变量就没法直接断言（T08 的两条不变量之一）。
   * T16 持久化时也顺手把它存下来，刷新续玩不用重新推日期。
   */
  initialSeed: number
  rngState: RngState
  /** 有效 Move 计数。T11/T16 的长局实测（1,000 / 10,000 次）按它统计 */
  moves: number
  /**
   * Time Attack 的截止时间戳（epoch ms）；非限时模式为 null
   *
   * 它是**绝对**时间戳而不是「还剩多久」：界面显示的剩余时间是 deadline − now 现算的，
   * 所以后台挂起、刷新页面都不延长限额（SPEC §3.1），T16 持久化时也只要把它存下来，
   * 续玩就落在同一个截止点上。没有一个字段在累计「已经过去多久」。
   */
  deadline: number | null
}

export interface MoveOutcome {
  state: GameState
  /** 棋盘是否改变。无效 Move：不生成、不计分、不进历史，state 与原状态同一引用 */
  changed: boolean
  /** 本次得分增量 */
  gained: number
}

/**
 * 风格 id。每套风格是一个字面量，T13/T15 各添一个（加法，不动引擎与棋盘 DOM）。
 * `Run` 故意不在此声明：它是 T16 的持久化形状，提前声明等于替一票未写的需求定型。
 */
export type StyleId = 'classic'

/**
 * 装饰插槽的组件形状：纯呈现、不吃 props、可返回 null 表示该风格没有这项装饰。
 * 两个插槽由 config.ts 提供，Board 从风格配置里解构出来渲染，不写死成 null。
 */
export type OverlaySlot = () => JSX.Element | null

/** 一套风格暴露给注册表与棋盘的最小声明。T13 落地换肤机制时再往里加字段 */
export interface StyleDefinition {
  id: StyleId
  label: string
  boardOverlay: OverlaySlot
  tileOverlay: OverlaySlot
}
