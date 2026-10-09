import { useEffect, useRef, type JSX, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react'
import type { StyleId } from '../../shared/types'
import { THEMES } from '../styles/themes'
import { nextHighlight } from './ListboxHighlight'

interface Props {
  /** 此刻选中的风格（触发钮的名字与选中项都从它来） */
  styleId: StyleId
  /** 选一个风格。局中切换只写 store 的 styleId 一个字段（style-switch.test.ts 钉住字段表） */
  onChange(id: StyleId): void
  /**
   * 列表开不开。**它不住在这里**——住在 `App` 的 keydown 分发点上（父规格决策 6：三层
   * `Esc` 优先序要在那一条分发链里裁决，不另开监听器赛跑），这一层只消费与上报。
   */
  open: boolean
  onOpenChange(open: boolean): void
}

/**
 * 风格标签的 id。与 `MuteToggle` 的 LABEL_ID 同一条理由：**静态、三套风格共用一份**，
 * 不必用 `useId`——那会让 e2e 与读屏软件读到一串随机的冒号串。
 */
const LABEL_ID = 'settings-style-label'

/**
 * 风格行（T42 · 抽屉的第二件租客 · 父规格 docs/specs/style-picker.md）
 *
 * **行语法照静音行**（父规格决策 3）：左边一个从不改字的 `<span id>`，右边的触发钮用
 * `aria-labelledby` 引用它当可访问名；整行可点是规格明写的、可测的意图，不是 `<label>`
 * 的转发。触发钮是 `.control`、显示**当前风格名**、报 `aria-expanded` +
 * `aria-haspopup="listbox"`、**不给 `aria-pressed`**——「展开」这件事由 `aria-expanded`
 * 说，与入口同一个判断。
 *
 * **自绘 listbox**（决策 2，原生 select 换不了肤被否）：选项从注册表 THEMES 长出来
 * （与 StylePicker 同一条理由——列表就是能力本身），名字 = `theme.label`，当前项标
 * `aria-selected`。三个选项，不滚动。
 *
 * **焦点进列表**（决策 5，APG listbox 形态）：展开那一刻 DOM 焦点落在**选中项**上；
 * `ArrowUp` / `ArrowDown` 在 option 间移真实焦点且**循环**、`Home` / `End` 跳两头——
 * 下一个 index 由纯函数 `nextHighlight` 算，移焦点用真实 `focus()`
 * （`aria-activedescendant` 被否：id 记账对第一份手写的读屏正确性是风险）。
 * `Enter`（与点选项同效）选中并收列表；`Tab` 收列表、焦点先回触发钮再让默认动作
 * 接着走查（不 preventDefault，所以 Tab 序不断）；`Esc` 归 App 的分发点（决策 6），
 * 收列表后焦点同样由下面的开合 effect 还给触发钮。
 *
 * **聚焦的选项底色即高亮**（决策 14）：非选中项 = `--control-bg-hover`，选中项 =
 * `--control-bg-selected`——焦点恒可见为两者之一，颜色归三套风格自己的 styles.css
 * （设计卡 §12）。列表**没有进场动画**（决策 10：它是开着的层里的状态变化，不是一层）。
 */
export function StyleRow({ styleId, onChange, open, onOpenChange }: Props): JSX.Element {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // 开合的那一刻管焦点：展开 → 落在选中项上；收起 → 还给触发钮。
  // 「刚变」与「本来如此」要分开（与 App 里 previousStatsOpen 同一条理由）：
  // 抽屉打开时这一行以 open=false 挂载，不能抢走抽屉容器刚拿到的焦点。
  const previousOpen = useRef(open)
  useEffect(() => {
    const wasOpen = previousOpen.current
    previousOpen.current = open
    if (wasOpen === open) return
    if (open) {
      listRef.current
        ?.querySelector<HTMLElement>('[aria-selected="true"]')
        ?.focus({ preventScroll: true })
    } else {
      triggerRef.current?.focus({ preventScroll: true })
    }
  }, [open])

  // 选中并收列表。Enter 与点选项同效（父规格用户故事 8）；
  // 焦点回触发钮由上面的开合 effect 接（open 翻下去的那一次提交之后跑）
  const choose = (id: StyleId): void => {
    onChange(id)
    onOpenChange(false)
  }

  // 整行可点：点触发钮与点标签是同一个开关。选项不归它管——点选项是「选中」，
  // 不是「再收一次」（选择器把事件目标挡在列表里时直接返回）。
  const handleRowClick = (event: ReactMouseEvent<HTMLDivElement>): void => {
    if ((event.target as Element).closest('[data-style-list]') !== null) return
    onOpenChange(!open)
  }

  // 列表自己的键盘（父规格决策 5 / 7）：四个导航键移 DOM 焦点并 preventDefault
  // （不推棋、不滚页——SPEC §3.4 的第二个放行例外）；Enter 选中；Tab 收列表并把
  // 焦点先还触发钮、**不 preventDefault**——Tab 的默认动作从触发钮接着走查，
  // 与列表收着时从触发钮按 Tab 是同一条路。Esc 不在这里：三层优先序归 App 的分发点。
  const handleListKeyDown = (event: ReactKeyboardEvent<HTMLUListElement>): void => {
    const target = event.target as Element
    const current = THEMES.findIndex((theme) => theme.id === target.getAttribute('data-style-option'))
    if (current === -1) return
    const key = event.key
    if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'Home' || key === 'End') {
      event.preventDefault()
      const nextIndex = nextHighlight(current, key, THEMES.length)
      // 选项的 DOM 顺序就是注册表的顺序（THEMES.map 的产物），所以第 nextIndex 个孩子
      // 就是该去的那一项。真实 focus()——高亮即焦点（决策 5）；preventScroll 是「不滚页」
      // 的一半（另一半是上面的 preventDefault），三个选项不滚动，列表也没有自己的滚动条
      ;(listRef.current?.children[nextIndex] as HTMLElement | undefined)?.focus({
        preventScroll: true,
      })
      return
    }
    if (key === 'Enter') {
      event.preventDefault()
      choose(THEMES[current].id)
      return
    }
    if (key === 'Tab') {
      onOpenChange(false)
      triggerRef.current?.focus({ preventScroll: true })
    }
  }

  const currentTheme = THEMES.find((theme) => theme.id === styleId) ?? THEMES[0]

  return (
    <div className="settings-row" data-style-row onClick={handleRowClick}>
      <span className="settings-row__label" id={LABEL_ID}>
        风格
      </span>
      {/* 触发钮自己不再接 onClick：点它（或键盘回车 / 空格激活它）冒泡到行处理器，
          与静音行的开关同一条路子——两处各接一个会翻两遍 */}
      <button
        type="button"
        className="control settings-style__trigger"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-labelledby={LABEL_ID}
        ref={triggerRef}
      >
        {currentTheme.label}
      </button>
      {/* 列表只在开着时存在（没有退场动画——决策 10）。绝对定位在行下方，几何在
          共享外壳 index.css，颜色归三套风格自己的 styles.css（设计卡 §12） */}
      {open && (
        <ul
          className="settings-style__list"
          role="listbox"
          aria-labelledby={LABEL_ID}
          data-style-list
          ref={listRef}
          onKeyDown={handleListKeyDown}
        >
          {THEMES.map((theme) => (
            <li
              key={theme.id}
              role="option"
              className="settings-style__option"
              data-style-option={theme.id}
              aria-selected={theme.id === styleId}
              tabIndex={-1}
              onClick={() => choose(theme.id)}
            >
              {theme.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
