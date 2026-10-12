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
 * chevron 的图形（T43）。**与 `SettingsDrawer.tsx` 的 `GEAR_PATH` 同一条路子**：一份
 * 模块级常量 + 内联 SVG + `currentColor`——它自己不引入任何色值、不新增任何色对，
 * 三套风格各读各的按钮文字色。形状是一只朝下的小尖角（chevron-down，`viewBox` 24×24），
 * **画成线（stroke）不画面**：齿轮是面因为三套的笔画语言不同，而这一只三角小尖角
 * 用 2px 粗的线在三套上都读得通（与 lucide 的 chevron-down 同一形状）。
 */
const CHEVRON_PATH = 'M6 9l6 6 6-6'

/**
 * 风格行（T42 · 抽屉的第二件租客 · 父规格 docs/specs/style-picker.md）
 *
 * **行语法照静音行**（父规格决策 3）：左边一个从不改字的 `<span id>`，右边的触发钮用
 * `aria-labelledby` 引用它当可访问名；整行可点是规格明写的、可测的意图，不是 `<label>`
 * 的转发。触发钮是 `.control`、显示**当前风格名**、报 `aria-expanded` +
 * `aria-haspopup="listbox"`、**不给 `aria-pressed`**——「展开」这件事由 `aria-expanded`
 * 说，与入口同一个判断。**T43 修订**：触发钮是选择框的形状——`flex: 1` 占满行里剩余的
 * 一段宽度，风格名靠左、chevron 靠右（内联 SVG 走 `currentColor`，与齿轮同一条路子；
 * 列表开着时旋转 180°）。
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
 * **聚焦的选项用环、选中的选项用底**（T43 修订父规格决策 14）：聚焦 = 各套焦点语言的一圈
 * 内缩环（Classic = 内缩亮墨 `box-shadow`；Material / Claude = `--focus` 的 outline——
 * 环画在选项盒外侧、落在菜单面上：那两套的 `--focus` 与 `--control-bg-selected` 分别是
 * 1.00:1 的同色/近同色，内缩会掉进选中底里「两态相撞」，外侧才环 ≠ 选中底），选中 = 照旧
 * `--control-bg-selected` + 亮墨。打开列表那一刻焦点就在选中项上，环与选中底同时成立且
 * 可辨。颜色归三套风格自己的 styles.css（设计卡 §12）。列表**没有进场动画**（决策 10：
 * 它是开着的层里的状态变化，不是一层），chevron 的 180° 旋转也因此**不加过渡**——开合
 * 无动画，状态一跳到位（transform，不碰布局）。
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
          与静音行的开关同一条路子——两处各接一个会翻两遍。
          T43 起它是**选择框的形状**（父规格决策 3 修订）：flex: 1 占满行里剩余的一段
          宽度，风格名靠左、chevron 靠右。chevron 是内联 SVG 走 currentColor（与齿轮
          同一条路子），列表开着时旋转 180°——旋转由 aria-expanded 驱动（CSS 认语义
          状态，不另设属性），不碰布局 */}
      <button
        type="button"
        className="control settings-style__trigger"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-labelledby={LABEL_ID}
        ref={triggerRef}
      >
        <span className="settings-style__name">{currentTheme.label}</span>
        {/* 装饰图形：名字已经由 aria-labelledby 引的行标签说全了，图不再进无障碍树 */}
        <svg
          className="settings-style__chevron"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d={CHEVRON_PATH} />
        </svg>
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
