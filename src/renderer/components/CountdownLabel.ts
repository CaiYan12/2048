/**
 * 截止时间戳 + 当前时刻 → 「m:ss」剩余时间
 *
 * 单独拎成模块而不是组件里的一行模板字符串，理由有两条：
 *   1. 「还剩多久」这个读法是本票唯一会被后台 / 刷新检验的口径（SPEC §3.1），
 *      它必须是纯函数才能被单测直接驱动，而不必借一个浏览器。
 *   2. 界面上的这一行与 store 推进时间用的判据必须来自同一个 deadline——两者各写
 *      一份就会出现「表说 0:00 而棋盘还能动」这种自相矛盾的画面。
 *
 * 分钟位不补零、秒位补零：三分钟模式永远不需要小时位，`0:05` 比 `00:05` 少一个
 * 无信息字符，也就少一分数字宽度的抖动。
 */

/** 一秒的毫秒数 */
const SECOND_MS = 1000

export function countdownLabel(deadline: number, now: number): string {
  // 到点之后仍显示 0:00 而不是负数：过期那一瞬棋盘已经被结算收走，这一行只剩
  // 「读数是 0」要传达
  const remaining = Math.max(0, deadline - now)
  // 向上取整到整秒：deadline − now 只剩 1ms 时读 0:01 而不是 0:00。
  // 否则表已经归零而这一局还活着——那是骗人的一秒。
  const seconds = Math.ceil(remaining / SECOND_MS)
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}
