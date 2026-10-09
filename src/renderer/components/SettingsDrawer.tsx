import type { JSX, RefObject } from 'react'

/**
 * 设置抽屉（T37 · 父规格 docs/specs/settings-drawer.md · ADR-0010）
 *
 * 两个组件、两份职责：
 *
 *   · `SettingsEntry` —— 右上角那颗纯图标按钮。**恒可见**（唯一例外是读档中），
 *     所以它住在页面内容那一段里，跟着那一段一起被 `inert` 收走。
 *   · `SettingsDrawer` —— 遮罩 + 面板。它必须留在页面内容**之外**（`inert` 不该
 *     盖住它自己），所以它是 `App` 里那个包裹元素的兄弟。
 *
 * **这一票是硬切**（T38 才做进出动效）：开着就挂载、关掉就卸载，没有退场状态、
 * 没有 `data-settings-leaving`、没有动画时长。三条关法（点外侧 / 「收起」/ `Esc`）
 * 与焦点进出由 `App` 编排，这里只出 DOM 与语义。
 *
 * 结构、摆位与三个层级（入口 6 / 遮罩 7 / 抽屉 8）在共享外壳 `styles/index.css`，
 * 底面 / 圆角 / 内边距 / 标题字体归三套风格自己的 `styles.css`——抽屉不是第五个插槽
 * （ADR-0010，判据同结果层与彩蛋）。
 */

/**
 * 齿轮的图形（T37）。**一份、三套共用**，与 `AchievementDefinition.emoji` 同一条理由：
 * 三份拷贝必然漂开。颜色走 `currentColor`（在 JSX 上就是 `fill="currentColor"`），
 * 所以它自己不引入任何色值、不新增任何色对。
 *
 * **画成面（填充式），不画线**：三套风格的笔画语言不同（Classic 粗面填充、Claude 发丝线），
 * 一份线稿总要有一家接受用不上的线宽；面则三家都读得通（父规格架构决策 2）。
 *
 * 形状：8 齿、齿根半径 7.4、齿尖 10.4、轴孔半径 3，`viewBox` 24×24。
 * `fillRule="evenodd"` 让轴孔那个子路径真的成为**孔**（否则它被同一笔填充吃掉）。
 */
const GEAR_PATH =
  'M10.21 4.82L10.73 1.68A10.4 10.4 0 0 1 13.27 1.68L13.79 4.82A7.4 7.4 0 0 1 15.81 5.66L18.40 3.80A10.4 10.4 0 0 1 20.20 5.60L18.34 8.19A7.4 7.4 0 0 1 19.18 10.21L22.32 10.73A10.4 10.4 0 0 1 22.32 13.27L19.18 13.79A7.4 7.4 0 0 1 18.34 15.81L20.20 18.40A10.4 10.4 0 0 1 18.40 20.20L15.81 18.34A7.4 7.4 0 0 1 13.79 19.18L13.27 22.32A10.4 10.4 0 0 1 10.73 22.32L10.21 19.18A7.4 7.4 0 0 1 8.19 18.34L5.60 20.20A10.4 10.4 0 0 1 3.80 18.40L5.66 15.81A7.4 7.4 0 0 1 4.82 13.79L1.68 13.27A10.4 10.4 0 0 1 1.68 10.73L4.82 10.21A7.4 7.4 0 0 1 5.66 8.19L3.80 5.60A10.4 10.4 0 0 1 5.60 3.80L8.19 5.66A7.4 7.4 0 0 1 10.21 4.82ZM9 12A3 3 0 1 0 15 12A3 3 0 1 0 9 12Z'

interface EntryProps {
  /** 抽屉开着没有。只用来报 `aria-expanded` 与 e2e 的断言点——开着时这一颗被抽屉盖住 */
  open: boolean
  /** 点一下开抽屉。不开着时它接得到指针；开着时它被遮罩压着，这一下落在遮罩上（= 关） */
  onOpen(): void
  /** 关掉抽屉时焦点回落的落点（`App` 那个「焦点真的掉了」的 effect 用它） */
  entryRef: RefObject<HTMLButtonElement | null>
}

/**
 * 入口：一颗纯图标按钮。
 *
 * **可访问名是「设置」**（`aria-label`），一个图标按钮因此仍是一个有名字的控件；
 * `aria-expanded` 报它开着还是关着。命中区 3rem——与方向键、两颗圆钮同一个数。
 *
 * **状态只有三个**：hover、焦点环、开着（`aria-expanded`）。刻意**没有按下反馈**——
 * 本仓库一个控件都没有 `:active`，给入口单独加会让它是唯一一个（父规格决策 22）。
 * 「开着」不换底色（那是「选中」的意思，本套已经花给别处）：开着这件事由抽屉本身说。
 */
export function SettingsEntry({ open, onOpen, entryRef }: EntryProps): JSX.Element {
  return (
    <button
      type="button"
      className="settings-entry"
      ref={entryRef}
      aria-label="设置"
      aria-expanded={open}
      data-settings-open={open ? 'true' : 'false'}
      onClick={onOpen}
    >
      {/* 装饰图形：名字已经由按钮的 aria-label 说全了，图不再进无障碍树 */}
      <svg
        className="settings-entry__icon"
        viewBox="0 0 24 24"
        fill="currentColor"
        fillRule="evenodd"
        aria-hidden="true"
        focusable="false"
      >
        <path d={GEAR_PATH} />
      </svg>
    </button>
  )
}

interface DrawerProps {
  /** 三条关法里有两条落在这儿：点遮罩（=「外侧」）与点「收起」 */
  onClose(): void
  /** 打开时焦点落在这个容器上（不是关闭按钮——一次误敲回车会当场关掉） */
  panelRef: RefObject<HTMLDivElement | null>
}

/**
 * 遮罩 + 抽屉本体。
 *
 * **遮罩吃掉全部指针**，这就是「设置禁用整页」的落点：它是这一层的「外侧」，
 * 点它即关。抽屉本身坐在遮罩之上（z-index 8 > 7），所以点抽屉里的东西不会穿到遮罩上。
 *
 * **抽屉是 `role="dialog"` + 一个名字**，`tabIndex={-1}` 让它接得住编程式焦点。
 * **不加 `aria-modal`**：背景已经被 `inert` 从无障碍树里摘掉了，同一件事不说两遍
 * （父规格架构决策 7）。
 *
 * 内容这一票只有两件：标题「设置」与一颗写「收起」的 `.control`——后者与战绩面板
 * 用的是同一个说法，一个仓库里「关掉一层」不该有两种叫法。静音行是 T39 的事。
 */
export function SettingsDrawer({ onClose, panelRef }: DrawerProps): JSX.Element {
  return (
    <>
      <div className="settings-scrim" data-settings-scrim onClick={onClose} />
      <div
        className="settings-drawer"
        role="dialog"
        aria-label="设置"
        tabIndex={-1}
        ref={panelRef}
        data-settings-drawer
      >
        <div className="settings-drawer__head">
          <h2 className="settings-drawer__title">设置</h2>
          <button type="button" className="control" onClick={onClose}>
            收起
          </button>
        </div>
      </div>
    </>
  )
}
