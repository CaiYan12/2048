import type { JSX } from 'react'
import { DEFAULT_MODE_ID, getMode, type ModeId } from '../../shared/modes'
import type { StyleId } from '../../shared/types'
import { StylePicker } from './StylePicker'

interface Props {
  onStart(modeId: ModeId): void
  /**
   * 开局界面选中的模式（T16：住在 store 里，进 settings 桶）
   *
   * 为什么不放本地 state：选中的模式要**跟到下一回打开这个页面**——它是「设置」，
   * 刷新之后该还选着玩家上次选的那个（SPEC §3.3 的 settings 桶）。与 styleId
   * 同一条道理，两者共用同一个选择器的样子，只是一个在模式那一组、一个在风格那一组。
   */
  selectedModeId: ModeId
  onSelectMode(id: ModeId): void
  /** 当前风格（T13）：住在 store 里，开局前选的就是开局后用的那一套 */
  styleId: StyleId
  onStyleChange(id: StyleId): void
}

/**
 * 已交付的模式：T03 的 classic、T05 的 fibonacci、T06 的 big-board、T07 的 walls、
 * T08 的 daily、T09 的 time-attack——六种到此全部到位，这张清单就是 MODES 的全文。
 *
 * 不从 MODES 里过滤——未实现的模式不该以「不可点」的样子出现在界面上。
 * 要放宽的是这张清单本身：T09 加进 time-attack 之后，它已经与 MODES 等长；
 * 将来加第七种模式时，仍然是 MODES 与这里各加一行。
 */
const AVAILABLE_MODE_IDS: readonly ModeId[] = [
  DEFAULT_MODE_ID,
  'fibonacci',
  'big-board',
  'walls',
  'daily',
  'time-attack',
]

/** 模式与风格选择（用户故事 1）。缩略预览是 T14 的故事 */
export function StartScreen({
  onStart,
  selectedModeId,
  onSelectMode,
  styleId,
  onStyleChange,
}: Props): JSX.Element {
  const mode = getMode(selectedModeId)

  return (
    <section className="flex w-full max-w-md flex-col items-center gap-6 py-8">
      <h1 className="shell__title text-6xl">2048</h1>
      <p className="hint">一套规则内核，六种模式，多套风格</p>

      <div className="flex w-full flex-col gap-3" role="group" aria-label="模式">
        <span className="panel__label">模式</span>
        {/* flex-auto 而不是 flex-1：模式按钮按文字宽度占位，一行放不下就折行。
            六个中文模式名（T09 加进「限时」之后）在 max-w-md 的内容区里放不进一行，
            于是按 flex-wrap 折成两行——flex-wrap 正是为这一幕准备的，不用调字宽，
            也不必为了塞进一行把模式名砍短。 */}
        <div className="flex flex-wrap gap-2">
          {AVAILABLE_MODE_IDS.map((id) => {
            const option = getMode(id)
            return (
              <button
                key={id}
                type="button"
                className="control flex-auto"
                aria-pressed={selectedModeId === id}
                onClick={() => onSelectMode(id)}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* 风格选择（T13）。为什么不在这里存本地 state：选中的风格要**带进这一局**
          ——它住在 store 里，开局界面与局中共用同一个选择器、同一个值。
          T03 那版在这里放了一份 useState，于是「开局选了 material」对局一点影响都没有
          （Board 读的是 DEFAULT_THEME_ID）。列表由 THEMES 注册表驱动，界面上只会出现
          真实存在的风格。 */}
      <StylePicker value={styleId} onChange={onStyleChange} />

      <button
        type="button"
        className="control w-full text-lg"
        onClick={() => onStart(selectedModeId)}
      >
        开始游戏
      </button>
    </section>
  )
}
