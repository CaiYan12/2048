/**
 * 模式声明（规则数据，非逻辑）
 *
 * 六模式全部在此字面量声明，规则内核只读数据：size / walls / spawnValues /
 * timeLimitSeconds 都被引擎通用消费，所以 Big Board、Walls、Time Attack 不需要
 * 在引擎里长分支。T05–T09 各补自己那个字面量的行为，而不是改引擎结构。
 */

export type ModeId =
  | 'classic'
  | 'fibonacci'
  | 'big-board'
  | 'walls'
  | 'daily'
  | 'time-attack'

export type MergeFamily = 'powers-of-two' | 'fibonacci'

export interface ModeDefinition {
  id: ModeId
  /** 界面用名（中文） */
  label: string
  size: number
  mergeFamily: MergeFamily
  /** [低值, 高值]；权重恒为低 90% / 高 10%（mode-contract §1） */
  spawnValues: readonly [number, number]
  target: number
  /** 固定障碍，零基 [row, col]；无障碍模式为 [] */
  walls: readonly (readonly [number, number])[]
  /** 限时秒数；非限时模式为 null */
  timeLimitSeconds: number | null
}

export const MODES: readonly ModeDefinition[] = [
  {
    id: 'classic',
    label: '经典',
    size: 4,
    mergeFamily: 'powers-of-two',
    spawnValues: [2, 4],
    target: 2048,
    walls: [],
    timeLimitSeconds: null,
  },
  {
    id: 'fibonacci',
    label: '斐波那契',
    size: 4,
    mergeFamily: 'fibonacci',
    spawnValues: [1, 2],
    target: 2584,
    walls: [],
    timeLimitSeconds: null,
  },
  {
    id: 'big-board',
    label: '大棋盘',
    size: 5,
    mergeFamily: 'powers-of-two',
    spawnValues: [2, 4],
    target: 4096,
    walls: [],
    timeLimitSeconds: null,
  },
  {
    id: 'walls',
    label: '障碍',
    size: 4,
    mergeFamily: 'powers-of-two',
    spawnValues: [2, 4],
    target: 2048,
    // mode-contract §1 冻结的居中 2×2 障碍块，零基坐标；其余 12 格可玩
    walls: [
      [1, 1],
      [1, 2],
      [2, 1],
      [2, 2],
    ],
    timeLimitSeconds: null,
  },
  {
    id: 'daily',
    label: '每日',
    size: 4,
    mergeFamily: 'powers-of-two',
    spawnValues: [2, 4],
    target: 2048,
    walls: [],
    timeLimitSeconds: null,
  },
  {
    id: 'time-attack',
    label: '限时',
    size: 4,
    mergeFamily: 'powers-of-two',
    spawnValues: [2, 4],
    target: 2048,
    walls: [],
    // mode-contract §3：3 分钟墙上时间，到时立即结算（T09 写入 deadline）
    timeLimitSeconds: 180,
  },
]

export const DEFAULT_MODE_ID: ModeId = 'classic'

export function getMode(id: ModeId): ModeDefinition {
  const mode = MODES.find((item) => item.id === id)
  // ModeId 是编译期联合，运行期不该有未知值；真出现了说明类型被绕过，
  // 此时抛错比返回 undefined 让引擎在别处空引用好定位。
  if (!mode) throw new Error(`未知模式：${id}`)
  return mode
}
