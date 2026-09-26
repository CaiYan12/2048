import { useState, type JSX } from 'react'
import { DEFAULT_MODE_ID, getMode, type ModeId } from '../../shared/modes'
import type { StyleId } from '../../shared/types'
import { DEFAULT_THEME_ID, getTheme } from '../styles/themes'

interface Props {
  onStart(modeId: ModeId): void
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

/** 模式与风格选择（用户故事 1）。缩略预览是 T13/T14 的故事 */
export function StartScreen({ onStart }: Props): JSX.Element {
  const [modeId, setModeId] = useState<ModeId>(DEFAULT_MODE_ID)
  // 目前只有一套风格：选择只是把「已选」显示出来。T13 的换肤机制落地前，
  // 选哪套都渲染同一套——所以这里不做多余的持久化。
  const [styleId, setStyleId] = useState<StyleId>(DEFAULT_THEME_ID)

  const mode = getMode(modeId)
  const style = getTheme(styleId)

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
                aria-pressed={modeId === id}
                onClick={() => setModeId(id)}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex w-full flex-col gap-3" role="group" aria-label="风格">
        <span className="panel__label">风格</span>
        {/* 只有一套风格：直接列它。T13/T15 各加一个文件夹并进 THEMES 注册表后，
            这里改成遍历 THEMES 即可，界面的其他部分不动 */}
        <button
          type="button"
          className="control"
          aria-pressed={styleId === style.id}
          onClick={() => setStyleId(style.id)}
        >
          {style.label}
        </button>
      </div>

      <button
        type="button"
        className="control w-full text-lg"
        onClick={() => onStart(modeId)}
      >
        开始游戏
      </button>
    </section>
  )
}
