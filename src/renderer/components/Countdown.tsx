import { useEffect, useState, type JSX } from 'react'
import { countdownLabel } from './CountdownLabel'
import { useGameStore } from '../stores/useGameStore'

interface Props {
  /** 本局的绝对截止时间戳（epoch ms），createGame 按注入的 now 写进 state */
  deadline: number
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
 * 不设 aria-live：每秒播报一次的倒计时会把读屏软件变成念秒机器。
 */
export function Countdown({ deadline }: Props): JSX.Element {
  const tick = useGameStore((state) => state.tick)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const read = (): void => {
      setNow(Date.now())
      tick()
    }
    // 挂载即读一次：T16 恢复一个「已经到期但还没被结算」的局面时，不必先等
    // 一个间隔才收场
    read()
    const timer = window.setInterval(read, READ_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [tick])

  const label = countdownLabel(deadline, now)

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
