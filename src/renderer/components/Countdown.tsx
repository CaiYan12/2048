import { useEffect, useState, type JSX } from 'react'
import { countdownLabel } from './CountdownLabel'
import { useGameStore } from '../stores/useGameStore'

interface Props {
  /** 本局的绝对截止时间戳（epoch ms），createGame 按注入的 now 写进 state */
  deadline: number
  /**
   * 一念神魔的堕落窗口正开着（T33 · 父规格的架构决策 16，控制人 2026-10-01 裁定
   * 「那 30 秒真归玩家」）。true 时这一行**读数不动**，`tick` 也照原样递过去
   * （store 那边记下起始时刻、问都不问引擎）。窗口一有结果它翻回 false，
   * 依赖表里的它让读表周期当场重跑一次——于是恢复是立刻的，不必再等 250ms。
   */
  clockHeld: boolean
}

/**
 * 读表间隔（ms）。
 *
 * 显示粒度是 1 秒，所以刷新率不需要更高；但只要这个间隔存在，到期那一刻最多迟
 * 半个间隔才被发现。250ms 足够短——玩家看不出「到点」与「被结算」之间有空隙，
 * 又不至于每 50ms 就把外壳重渲染一遍。
 */
const READ_INTERVAL_MS = 250

/**
 * 限时模式的倒计时（T09）
 *
 * 它是**外壳**元素，与 StatusBar / DailyDateLabel 平级，不进 .board：ADR-0002 的
 * 棋盘固定 DOM 结构不许因为一个倒计时多出一个节点。
 *
 * 剩余时间不是它自己记的：每个读表周期都从 `deadline - Date.now()` 现算，所以后台
 * 挂起、刷新页面都不会「攒」出额外的时间（SPEC §3.1）。到点也由它推动——问一次
 * store.tick()，该不该结算由引擎判；这里不写第二套规则。
 *
 * **T33 的时之狭**（控制人 2026-10-01 裁定「那 30 秒真归玩家」）：堕落窗口开着时这一行
 * 读数不动、`tick` 也照原样递过去；收摊那一刻 store 把按住的那一段并进累计，于是
 * `deadline - effectiveNow` 接回表停着时候的那个数——玩家看见表停在 2:40，收摊读到的
 * 剩余时间就还是 2:40。**有效时钟是 `Date.now() - shenmoHeldMs`，display 与 deadline
 * 比较吃的是同一把尺子**：屏幕不再比棋盘里的截止点多走一段，那正是本项目最反对的
 * 「屏幕替证据撒谎」。deadline 一个字节都没动（它是绝对时间戳），被按住的只有 clock。
 *
 * 不设 aria-live：每秒播报一次的倒计时会把读屏软件变成念秒机器。
 */
export function Countdown({ deadline, clockHeld }: Props): JSX.Element {
  const tick = useGameStore((state) => state.tick)
  // 堕落窗口累计按住的毫秒（T33）。窗口开着时它**不含**进行中的那一段——那一段由
  // `shenmoHoldStartedAt` 记着、收摊那一下才并进来；而窗口开着时这一行本来就不更新
  // 读数（下面那个分支），所以那一刻显示的正是按住的起点，两把尺子在此相接
  const heldMs = useGameStore((state) => state.shenmoHeldMs)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const read = (): void => {
      // 表停着的时候连读数都不更新：按住期间的读数由 heldMs 兜着（它不变，
      // 所以显示的剩余也不该变）
      if (!clockHeld) setNow(Date.now())
      tick(clockHeld)
    }
    // 挂载即读一次：T16 恢复一个「已经到期但还没被结算」的局面时，不必先等
    // 一个间隔才收场。
    // `clockHeld` 也在依赖表里：它由 true 翻回 false 的那一次提交正是「抉择收了摊」，
    // 让 effect 重跑一次，读表当场继续（否则要再等最多半个 READ_INTERVAL_MS）
    read()
    const timer = window.setInterval(read, READ_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [tick, clockHeld])

  // 被按住的时钟：减掉累计按住的毫秒，那一段不算在玩家头上（父规格的架构决策 16）。
  // 到点之后 countdownLabel 自己把剩余夹到 0:00
  const label = countdownLabel(deadline, now - heldMs)

  return (
    <div className="panel">
      <div className="panel__label">剩余时间</div>
      {/* data-countdown 是 e2e 的断言点，取值就是显示出来的那一行 */}
      <div className="panel__value" data-countdown={label}>
        {label}
      </div>
    </div>
  )
}
