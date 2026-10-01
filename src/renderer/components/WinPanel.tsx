import type { JSX } from 'react'
import type { ResultReadout } from '../stores/records'
import { ResultLayer } from './ResultLayer'

interface Props {
  readout: ResultReadout
  /**
   * 卡片那一行（T31）。由 App 用 `resultCardLine` 从本局 facts 算好递进来——**不在两个
   * 面板里各算一遍**，那正是父规格的架构决策 17 要防的两套真相
   */
  line: string | null
  onContinue(): void
  onSettle(): void
  onNewGame(): void
  /** 正在退场（T27）。原样转交 ResultLayer：它只决定 `data-result-leaving` 在不在 */
  leaving?: boolean
  /** 退场播完了（T27）。原样转交 ResultLayer，由它从动画结束事件上捡起来 */
  onExited?(): void
}

/**
 * 胜利里程碑面板（mode-contract §3：达标只是里程碑，不是终局）。
 *
 * 只在 phase === 'won' 时渲染，且只在这一局第一次达标时渲染——再合出目标块不会
 * 把它重新弹出来（触发条件是 reachedTarget 由假转真）。
 *
 * 三条出路（mode-contract §3 正文：达成目标块 → 胜利面板，玩家可选「继续玩」或结算）：
 *   「继续玩」是主路径，分数与棋盘一个字节不动；
 *   「结束并记录」就此收工——引擎把它结算成 endReason 'won'，那是赢下的收工，不是败局；
 *   「新游戏」按契约等于放弃本局（abandon，不写记录）。
 * 三条路三种后果：继续与结束并记录都能留下这个胜局，新游戏留下不了。
 * 撤销 / 交换归 T11 / T12，加在死局面板上，这里不预留任何禁用入口。
 *
 * T26：结构归 ResultLayer（半透明遮罩 + 不透明卡片，ADR-0008），本文件只留自己的标题、
 * 那一句话与三个按钮——三项逐字节未改。读数由 App 用 records.ts 的纯函数算好递进来。
 * T31：卡片那一行也由 App 算好递进来（父规格的架构决策 17）。
 * T27：App 经 `leaving` 递进退场旗标、经 `onExited` 接「退场播完了」（何时退场、何时
 * 摘层全由 ResultPresence.ts 算），本文件只转交。
 */
export function WinPanel({
  readout,
  line,
  onContinue,
  onSettle,
  onNewGame,
  leaving,
  onExited,
}: Props): JSX.Element {
  return (
    <ResultLayer
      tier="won"
      panel="win"
      readout={readout}
      line={line}
      title="达成目标"
      sentence="这是里程碑，不是终局：可以接着玩，也可以就此收工。"
      leaving={leaving}
      onExited={onExited}
      actions={
        <>
          <button type="button" className="control" onClick={onContinue}>
            继续玩
          </button>
          <button type="button" className="control" onClick={onSettle}>
            结束并记录
          </button>
          <button type="button" className="control" onClick={onNewGame}>
            新游戏
          </button>
        </>
      }
    />
  )
}
