import type { JSX } from 'react'
import type { Direction } from '../../shared/types'

interface Props {
  onMove(direction: Direction): void
}

/**
 * 四个方向键：label 是无障碍名（读屏念它），glyph 是屏幕上的箭头。
 * 名字用「向上 / 向下 / 向左 / 向右」而不是箭头字符：读屏软件对箭头符号的念法
 * 各不相同（「上箭头」/「上指」/干脆不念），写清字才可预期。
 */
const KEYS: Readonly<{ direction: Direction; label: string; glyph: string }[]> = [
  { direction: 'up', label: '向上', glyph: '↑' },
  { direction: 'down', label: '向下', glyph: '↓' },
  { direction: 'left', label: '向左', glyph: '←' },
  { direction: 'right', label: '向右', glyph: '→' },
]

/**
 * 屏幕方向按钮（T10 · SPEC 用户故事 13）
 *
 * 显隐只按**输入设备**，不按视口宽度：宽屏也可能接着触屏，窄屏也可能是鼠标。
 * styles.css 里 `@media (pointer: coarse)` 说的正是「主指针不精确」（手指），
 * 它就是该不该给屏幕方向的判据。桌面端整块是 display:none——不是「看不见」而是
 * **不在布局里**，外壳的 flex/gap 不会给它留缝。
 *
 * 它是**外壳元素**：摆在 .board 之外、与 Board 平级。ADR-0002 的棋盘固定 DOM 不
 * 因为一个按钮多出节点，两个装饰插槽也只归装饰；棋盘 / 方块层的 board.css 更不会
 * 进来染指它。四个按钮调的是 App 传下来的同一个 move——与键盘、滑动同一条派发
 * 路径，不在这里另开一套。
 */
export function DirectionPad({ onMove }: Props): JSX.Element {
  return (
    <div className="dpad" role="group" aria-label="方向按钮">
      {KEYS.map(({ direction, label, glyph }) => (
        <button
          key={direction}
          type="button"
          className="control dpad__key"
          data-direction={direction}
          aria-label={label}
          onClick={() => onMove(direction)}
        >
          <span aria-hidden="true">{glyph}</span>
        </button>
      ))}
    </div>
  )
}
