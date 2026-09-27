import type { JSX } from 'react'

interface Props {
  /** 这一局抽题所用的 UTC 日期串，'YYYY-MM-DD'（store 开局时记下的那个） */
  date: string
}

/**
 * Daily 的日期说明（T08）
 *
 * 一句话说清「这一局是哪一天的题」。它必须是**开局那天的 UTC 日期**而不是今天的：
 * 跨过 UTC 零点之后，昨天开的那局标签不能跟着翻篇（T08 不变式 B 的可见形态）——
 * 玩家据此知道自己在打哪一天的题，也据此判断什么时候能换新题。
 *
 * 住在外壳里，不碰棋盘的固定 DOM 结构（ADR-0002）：它是说明文字，与 Board 平级。
 * `data-daily-date` 是 e2e 的断言点，取值就是那个日期串本身。
 */
export function DailyDateLabel({ date }: Props): JSX.Element {
  return (
    <p className="hint" data-daily-date={date}>
      每日题目 · UTC {date}
    </p>
  )
}
