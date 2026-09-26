import type { JSX } from 'react'
import type { StyleId } from '../../shared/types'
import { THEMES } from '../styles/themes'

interface Props {
  value: StyleId
  onChange(id: StyleId): void
}

/**
 * 风格选择器（SPEC 用户故事 1 / 17–18）
 *
 * **只遍历注册表 THEMES**：不在表里的风格不出现在界面上。加一套风格时这里一行都不用改——
 * 「选择器与实际能力脱节」这件事因此不可能发生，因为界面上那一列就是从能力本身长出来的。
 *
 * 开局前与局中共用同一个组件（T13 的验收标准 2）。局中切换只写 store 的 styleId 一个字段，
 * 棋盘 / 分数 / 随机进度 / 计时一个都不碰（tests/unit/style-switch.test.ts 钉住整张字段表）。
 *
 * 缩略预览是 T14 的故事（T14 的标题里写着选择器的字体与对比度）：这里只列名字。
 * 提前做预览要凭空决定「预览怎么渲染一套风格」，而那正是 T14 该和闸门一起定的事。
 */
export function StylePicker({ value, onChange }: Props): JSX.Element {
  return (
    <div className="flex w-full flex-col gap-3" role="group" aria-label="风格">
      <span className="panel__label">风格</span>
      {/* flex-auto 而不是 flex-1：按文字宽度占位，一行放不下就折行。两套风格在
          max-w-md 的内容区里放得下一行，加第三套时自动折成两行，不用调字宽。 */}
      <div className="flex flex-wrap gap-2">
        {THEMES.map((theme) => (
          <button
            key={theme.id}
            type="button"
            className="control flex-auto"
            aria-pressed={value === theme.id}
            onClick={() => onChange(theme.id)}
          >
            {theme.label}
          </button>
        ))}
      </div>
    </div>
  )
}
