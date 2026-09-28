import type { JSX } from 'react'
import type { GameState } from '../../shared/types'
import { getMode } from '../../shared/modes'
import { runResultAnnouncement } from './RunAnnouncement'

interface Props {
  game: GameState
}

/**
 * 一局的结果播报区（T22 验收标准 2）
 *
 * **它是外壳元素**：摆在 .board 之外、与 StatusBar 平级——ADR-0002 的棋盘固定 DOM
 * 不许往棋盘里塞东西，而播报区不是棋盘的一部分。
 *
 * **只用文字**（`sr-only`，Tailwind 的 visually-hidden，所以它只对读屏软件存在）：
 * 面板（WinPanel / GameOverPanel）已经把那句话显示给看得见的人，包括终局分数之外
 * 的一切；再摆一份可见文字是在同一个屏幕上重复同一句话。播报区补上的正是面板上没有
 * 的那一样——终局分数（SPEC §3.4 的「关键结果」）。
 *
 * **不抢焦点**：一把焦点从棋盘上拽走，玩家会以为这一局被打断了（StatsPanel 头注里
 * 同一条理由）。
 *
 * **live region 的机制沿用仓库里已有的那一条**（StorageNotice 与各风格的成就祝贺都是
 * `role="status"`）：每个提示自带一个 status 区，一条区只说一件事，内容按当前
 * 状态推导（RunAnnouncement.ts）。本区不是第二套策略——它是同一套策略的第四个用户：
 * 结算、达标、死局这三件「一局的结果」此前一条都没有被播报过，而 StatusBar 的操作
 * 播报更是从 T12 起就写着「live region 策略归 T22」。
 *
 * **为什么不用 aria-live="assertive"**：这些不是需要立刻打断玩家的事。玩家刚按下的
 * 是一个方向键，此刻抢话只会盖掉他正在听的东西。
 */
export function RunAnnouncer({ game }: Props): JSX.Element | null {
  const message = runResultAnnouncement(game, getMode(game.modeId).target)
  // 活跃局（playing）什么都不渲染：没有结果要播，也不留一个空区域在 DOM 里
  if (message === null) return null

  return (
    <p className="sr-only" role="status" data-run-status={game.phase}>
      {message}
    </p>
  )
}
