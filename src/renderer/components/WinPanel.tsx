import type { JSX } from 'react'

interface Props {
  onContinue(): void
  onNewGame(): void
}

/**
 * 胜利里程碑面板（mode-contract §3：达标只是里程碑，不是终局）。
 *
 * 只在 phase === 'won' 时渲染，且只在这一局第一次达标时渲染——再合出目标块不会
 * 把它重新弹出来（触发条件是 reachedTarget 由假转真）。
 *
 * 两条出路：「继续玩」是主路径，分数与棋盘一个字节不动；「新游戏」按契约等于
 * 放弃本局（abandon，不写记录）。撤销 / 交换归 T11 / T12，加在死局面板上，
 * 这里不预留任何禁用入口。
 */
export function WinPanel({ onContinue, onNewGame }: Props): JSX.Element {
  return (
    <section className="overlay" data-panel="win">
      <h2 className="overlay__title">达成目标</h2>
      <p className="overlay__text">这是里程碑，不是终局：可以接着玩，也可以就此开新局。</p>
      <div className="flex gap-2">
        <button type="button" className="control" onClick={onContinue}>
          继续玩
        </button>
        <button type="button" className="control" onClick={onNewGame}>
          新游戏
        </button>
      </div>
    </section>
  )
}
