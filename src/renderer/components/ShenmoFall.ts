import { useCallback, useState } from 'react'

/**
 * 二念的**两拍终局**（T36 · 控制人 2026-10-01 裁定）
 *
 * 业主的原话：「你似乎理解错我的意思了，这个染血色的触发条件是**重复输入两次作弊码**，
 * 先染出血色，然后**淡出关闭棋盘页面**。并非是输错了，输错了直接重来。」再追问一句
 * 「第二次输对码时 A/B 抉择还出现吗」，答的是「仍然先出 A/B，走完才染血」。
 *
 * 所以堕落染墨的开关从「魔道那 30 秒」搬到**二念的终局**：第二遍完整走完 B → A 之后——
 * 血染涌上来（600ms）→ 停一拍（200ms）→ 整条游戏列淡出（400ms）→ 页面扣下到只剩
 * 「重新开始」与那条悬顶（T32 的既有行为，一个字都没改）。而魔道那 30 秒（点 B → 破碎
 * → 只剩 A 加一圈变薄的环 → 点 A 给一念的奖品）**一眼血色都没有**；错键依旧整个清空
 * 重来，与血色无关（既有行为）。
 *
 * **为什么住在渲染层而不是机器里**：`ShenmoChoice.ts` 那台 pure machine 是彩蛋的**规则**
 * （码缓冲、阶段迁移、授予什么、一遍怎么算），它的架构决策 3 明写「两个窗口都不计时——
 * 时间不在这一层」。而这两拍是**纯呈现时机**：三个时长只活在 CSS 里，机器一个字段都不必
 * 多；它要知道的只是「果熟了」，而那件事 `passes` 计数器与 `grant` 早说完了。放进机器的
 * 代价还有一条：`ShenmoStage` 要为两拍加新档，而 T29 / T32 / T34 那几十条既有单测断的
 * 正是「每一条终局都落 leaving」——加档就是改那些主张。形状照 `ResultPresence.ts`：
 * 一个纯函数 + 一个 hook，钩子只负责把纯函数接到 React 与 CSS 动画上。
 *
 * **为什么不用 JS 定时器**：装假时钟的测试（时之狭那一份用 `page.clock.pauseAt`）会把
 * `setTimeout` 整个冻住，两拍就永远播不完——结果层为这件事付过一遍代价
 * （`.codex/memories/result-layer.md` 第 6 条），两段窗口与菜单退场照同一个路子躲开它。
 * 三拍各自由一条 CSS 动画顶住，宿主听 `animationend` 推进（App 的 `handleShenmoFallEnd`）。
 */

/**
 * 节拍。`none` = 没有终局；`dye` = 血染那一拍；`out` = 停一拍 + 淡出那一拍；
 * `done` = 页面已经扣下（只剩「重新开始」与悬顶）。
 */
export type ShenmoFallBeat = 'none' | 'dye' | 'out' | 'done'

/** 哪一播放完了。宿主从**动画名**推它（见 App.tsx 的两道判据） */
export type ShenmoFallFinished = 'dye' | 'out'

/**
 * 喂给纯函数的两种输入：宿主的两种事实。
 *
 *   · `cleared` 是「二念的果结出来了没有」（store 的 `shenmoOutcomes` 里有 second-pass，
 *     而它同时就是悬顶的开关）。它翻上来，终局起跑；它翻下去（开新局 / 恢复存档把彩蛋
 *     旗标清了），两拍复位。
 *   · `finished` 是「某一拍播完了」，由那一拍的 `animationend` 带来。
 */
export type ShenmoFallInput =
  | { readonly kind: 'cleared'; readonly cleared: boolean }
  | { readonly kind: 'finished'; readonly finished: ShenmoFallFinished }

/**
 * 下一步的节拍。**纯函数**：两拍的顺序与每拍的进入条件都在这里，所以它能被单测逐条驱动。
 *
 * 三条规则：
 *
 *   1. **顺序固定**：`dye` → `out` → `done`，一帧都不许多。血染没播完就淡出，玩家看到的是
 *      「闪了一下血、页面没了」，而那 600ms 正是业主要的「血涌上来」。
 *   2. **每拍只认自己那一条结束事件**。两条监听挂在同一列上，而 `animationend` 会冒泡——
 *      名字判据哪怕漏了一处，错的结束事件会把两拍并成一拍。
 *   3. **没有终局与已经扣下都 absorb 一切**：一条迟到的结束事件不许把已经过去的终局重新
 *      拉起来（真实的动画结束事件随时可能到——测试派发过合成事件之后它照旧会来）。
 */
export function nextShenmoFall(
  current: ShenmoFallBeat,
  input: ShenmoFallInput
): ShenmoFallBeat {
  if (input.kind === 'cleared') return input.cleared ? 'dye' : 'none'
  if (current === 'dye') return input.finished === 'dye' ? 'out' : current
  if (current === 'out') return input.finished === 'out' ? 'done' : current
  return current
}

/** hook 交出去的东西：当前节拍 + 一个推进动作 */
export interface ShenmoFall {
  readonly beat: ShenmoFallBeat
  /** 二念的果结出来了 / 某一播放完了。宿主在 `animationend` 上调它 */
  advance(input: ShenmoFallInput): void
}

/**
 * 两拍终局的 hook：把纯函数接到 React 与 CSS 动画上。形状照 `useResultLayerPresence`：
 * **状态调整写在渲染期而不是 effect 里**——`second-pass` 一记进 store，`data-shenmo-dim`
 * 与 `data-shenmo-fall='dye'` 必须在**同一次提交**里落到 DOM 上。写在 effect 里会多出一帧
 * 「果已经熟了、血还没染」，而那正是这一拍要说的话。渲染期校正 state 是 React 文档里
 * 「props 变化时校正 state」那一条路子（`useShenmo` 的 `seenKey` 同款）。
 */
export function useShenmoFall(cleared: boolean): ShenmoFall {
  const [beat, setBeat] = useState<ShenmoFallBeat>('none')
  // 上一帧的「二念的果在不在」。只在它真的翻了时才校正：每帧都校正是渲染循环
  const [seen, setSeen] = useState(cleared)

  if (seen !== cleared) {
    setSeen(cleared)
    setBeat(nextShenmoFall(beat, { kind: 'cleared', cleared }))
  }

  // 用函数式更新而不是闭包里的 beat：宿主可能在 React 提交之前连派两条结束事件
  // （测试就刻意这么干），那时第二次必须接着第一次的结果走
  const advance = useCallback((input: ShenmoFallInput): void => {
    setBeat((current) => nextShenmoFall(current, input))
  }, [])

  return { beat, advance }
}
