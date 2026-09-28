import type { JSX } from 'react'
import { ACHIEVEMENTS } from '../../game/achievements'
import { MODES } from '../../shared/modes'
import { THEMES } from '../styles/themes'
import { formatDuration, type RecordEntry, type StatsRecord } from '../stores/records'

interface Props {
  /** 已结算的记录，按模式 × 风格。空 = 一局都还没结算过 */
  records: readonly RecordEntry[]
  /** 基础统计；null = 一局都还没结算过 */
  stats: StatsRecord | null
  onClose(): void
}

/**
 * 战绩与统计面板（SPEC §3.3 的 records / stats 两桶的界面半边 · 用户故事 21/22）
 *
 * **这是外壳 UI，不是棋盘层**：Tailwind utility 可以用在这里（ADR-0002 只把棋盘与
 * 方块层锁在 board.css 里），而 `.panel` / `.panel__label` / `.panel__value` /
 * `.control` 这些语义类照旧复用——轮子在这里，重造一套只会让三套风格各自跑偏。
 *
 * 与 `.board` 是**兄弟节点**（ADR-0002 的固定 DOM 不许往棋盘里塞东西），所以：
 *   · 它是独立的一块，不盖住棋盘，打开它不影响正在打的那一局；
 *   · 键盘到达它走的是普通 Tab 顺序（按钮是原生 button），不需要也不应该抢焦点——
 *     一打开就把焦点从棋盘上拽走，玩家会以为这一局被打断了。
 *
 * 成就区是一份**静态清单**：每条成就的名字与条件，仅此而已。它不声称任何一条已解锁——
 * 成就是单局可自证的东西、解锁集合从眼前的棋盘派生（ADR-0007），而这块面板既看不到
 * 当前棋盘、也没有任何跨局的解锁状态可读。写「已解锁 / 未解锁」就是在编一个它不知道的
 * 结论。`data-*` 是 e2e 的断言点（DOM 契约），与其余组件同一套路。
 */
export function StatsPanel({ records, stats, onClose }: Props): JSX.Element {
  // 只列真的有记录的模式 / 风格：铺满 6×3 = 18 个空格只会让人以为那 18 个组合
  // 都打过了，而「没打过」在这块面板上的诚实长相是**不出现在这里**
  const modes = MODES.filter((mode) => records.some((entry) => entry.modeId === mode.id))
  const totalRuns = stats?.totalRuns ?? 0
  const wins = stats?.wins ?? 0
  const timePlayedMs = stats?.timePlayedMs ?? 0

  return (
    <section
      className="flex w-full max-w-md flex-col gap-3"
      role="group"
      aria-label="战绩与统计"
      data-stats-panel
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="shell__title text-2xl">战绩与统计</h2>
        <button type="button" className="control" onClick={onClose}>
          收起
        </button>
      </div>

      {records.length === 0 ? (
        <p className="hint">
          还没有任何记录。结算一局之后，这里按「模式 × 风格」记下它的最高分与最高方块。
        </p>
      ) : (
        <div className="flex flex-col gap-3" data-records>
          {modes.map((mode) => (
            <div key={mode.id} className="flex flex-col gap-1" data-record-mode={mode.id}>
              <span className="panel__label">{mode.label}</span>
              {THEMES.filter((theme) =>
                records.some((entry) => entry.modeId === mode.id && entry.styleId === theme.id)
              ).map((theme) => {
                const entry = records.find(
                  (item) => item.modeId === mode.id && item.styleId === theme.id
                )
                if (entry === undefined) return null
                return (
                  <div
                    key={theme.id}
                    className="flex items-center justify-between gap-3"
                    data-record={`${mode.id}:${theme.id}`}
                    data-best-score={entry.bestScore}
                    data-highest-tile={entry.highestTile}
                  >
                    <span>{theme.label}</span>
                    <span className="flex items-baseline gap-3">
                      <span className="panel__value">{entry.bestScore}</span>
                      <span className="panel__label">最高方块</span>
                      <span className="panel__value">{entry.highestTile}</span>
                    </span>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-2" data-stats>
        <div className="panel">
          <div className="panel__label">总局数</div>
          <div className="panel__value" data-stat="totalRuns">
            {totalRuns}
          </div>
        </div>
        <div className="panel">
          <div className="panel__label">胜局</div>
          <div className="panel__value" data-stat="wins">
            {wins}
          </div>
        </div>
        <div className="panel">
          <div className="panel__label">累计时长</div>
          <div className="panel__value" data-stat="timePlayedMs">
            {formatDuration(timePlayedMs)}
          </div>
        </div>
      </div>

      {/* 成就清单（ADR-0007）：一行一个成就，照实写出它的条件。
          这里**没有**解锁状态可言——集合从眼前的棋盘派生，而这块面板看不到那一局。
          data-achievement 是 e2e 的断言点（DOM 契约）。 */}
      <ul className="flex flex-col gap-1" data-achievements>
        {ACHIEVEMENTS.map((item) => (
          <li
            key={item.id}
            className="flex items-baseline justify-between gap-3"
            data-achievement={item.id}
          >
            <span className="panel__label">{item.label}</span>
            <span className="hint">{item.condition}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
