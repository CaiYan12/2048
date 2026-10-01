import type { JSX } from 'react'
import type { ResultReadout } from '../stores/records'
import type { ResultLayerSpec } from './ResultPresence'
import { ResultLayer } from './ResultLayer'
import { endReasonLabel, STUCK_LABEL } from './runEndLabel'

interface Props {
  /**
   * **持有中的那一层**（T27）：三档、哪一处、为什么结束全由它说，不跟活的 `game.phase` 走。
   * 换层连击那 150ms 里 phase 已经是下一档了，而场上正在离开的还是上一档——按 phase 画
   * 的话，一个正在退场的层会被描述成当前档（架构决策 10 点名要避免的那件事）。
   */
  spec: ResultLayerSpec
  readout: ResultReadout
  /**
   * 卡片那一行（T31）。由 App 用 `resultCardLine` 从本局 facts 算好递进来——**不在两个
   * 面板里各算一遍**，那正是父规格的架构决策 17 要防的两套真相
   */
  line: string | null
  onSettle(): void
  onNewGame(): void
  /** 撤销一步（T11）。只摆在还没结算的死局面板上——ended 之后一律不可用 */
  onUndo(): void
  /** 进入交换拾取（T12）。同 StatusBar 的「交换」按钮，调的是 store 里同一个动作 */
  onSwap(): void
  /** 正在退场（T27）。原样转交 ResultLayer：它只决定 `data-result-leaving` 在不在 */
  leaving?: boolean
  /** 退场播完了（T27）。原样转交 ResultLayer，由它从动画结束事件上捡起来 */
  onExited?(): void
}

/**
 * 死局 / 终局面板（mode-contract §3：死局先给可恢复面板，不直接判负）。
 *
 * 渲染时机：stuck（死局，还没决定）与 ended（已结算）。ended 的原因有三种——
 * deadlock（死局收工）、won（达成目标后主动收工）、以及 abandoned（在 store 里紧跟着
 * createGame，界面永远来不及露它）。
 *
 * 「为什么结束」从 spec.endReason 读，不靠面板自己推断（SPEC 用户故事 7）：
 * 死局与超时必须是两句不同的话，读懂 endReason 即可。
 *
 * T04 只给「结束并记录」和「新游戏」。T11 在这里补「撤销」——mode-contract §3 的
 * `stuckRecoveryMoves: ["undo", "swap"]` 说明死局是**可恢复**的，两个恢复动作因此
 * 并排摆在面板最前面。已结算那一侧什么都不加：进入 ended 后撤销与交换一律不可用
 * （mode-contract §3 关键不变量 4），那道判断住在 store 的 undo / selectCell 里，
 * 面板只是照着 phase 决定露不露入口。
 *
 * **关于 isInteractiveTarget 的说明（T11 review 的交接）**：这个按钮是 `.board` 的
 * **兄弟节点**（ADR-0002 的固定 DOM，面板与方向按钮都在棋盘壳外面），它的键盘事件
 * 根本不冒泡到 Board 的 onKeyDown——它受的是 DOM 作用域保护，**不是**那道守卫。
 * 别在这里写「守卫保护了面板按钮」，T11 上那句话是错的：守卫只保护 `.board`
 * *内部*的控件（Board.tsx 的 isInteractiveTarget）。
 *
 * T26：结构归 ResultLayer（半透明遮罩 + 不透明卡片，ADR-0008），本文件只留自己的标题、
 * 那一句话与四个按钮——三项逐字节未改。读数由 App 用 records.ts 的纯函数算好递进来。
 * T31：卡片那一行也由 App 算好递进来（父规格的架构决策 17）。
 * T27：App 经 `leaving` 递进退场旗标、经 `onExited` 接「退场播完了」（何时退场、何时
 * 摘层全由 ResultPresence.ts 算），本文件只转交。
 */
export function GameOverPanel({
  spec,
  readout,
  line,
  onSettle,
  onNewGame,
  onUndo,
  onSwap,
  leaving,
  onExited,
}: Props): JSX.Element {
  // 三档与哪一处的映射只有一份：ResultPresence.ts 的 layerForPhase（App 拿它算「此刻
  // 意味着哪一层」，而这个 spec 就是那一刻被持有下来的答案）。这里只按它决定露哪半套
  // 按钮、说哪句话——本文件只可能是 stuck 与 ended 两档。
  const settled = spec.tier === 'ended'

  return (
    <ResultLayer
      tier={spec.tier}
      panel={spec.panel}
      endReason={spec.endReason}
      readout={readout}
      line={line}
      title={settled ? '本局已结束' : '死局'}
      sentence={settled ? endReasonLabel(spec.endReason) : STUCK_LABEL}
      leaving={leaving}
      onExited={onExited}
      actions={
        settled ? (
          <button type="button" className="control" onClick={onNewGame}>
            新游戏
          </button>
        ) : (
          <>
            {/* 撤销摆在最前：死局是给玩家反悔的，不是给玩家认命的。
                交换摆在它旁边：契约把两者并列为恢复动作（stuckRecoveryMoves）。
                可访问名要与 StatusBar 那一枚分开：stuck 阶段两枚同时在画面上，都叫
                「交换」的话读屏玩家会连着听到两个同名控件，分不清哪一个在手边
                （T22 记录、T23 修）。可见文字不动，aria-label 只补上「在哪里」——
                它与可见文字的前缀一致，所以 2.5.3 的 Label in Name 仍然成立，
                swap.spec.ts 的 panel.getByRole('button', { name: '交换' }) 是子串匹配，
                也照旧命中这一枚。动作仍是 store 里同一个 toggleSwap，机制一个字没动。 */}
            <button type="button" className="control" onClick={onUndo}>
              撤销
            </button>
            <button
              type="button"
              className="control"
              aria-label="交换两枚方块（死局面板）"
              onClick={onSwap}
            >
              交换
            </button>
            <button type="button" className="control" onClick={onSettle}>
              结束并记录
            </button>
            <button type="button" className="control" onClick={onNewGame}>
              新游戏
            </button>
          </>
        )
      }
    />
  )
}
