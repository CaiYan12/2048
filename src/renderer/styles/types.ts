import type { JSX } from 'react'
import type { StyleId } from '../../shared/styleCatalog'
import type { AchievementToast } from '../../game/achievements'

/**
 * 渲染层的风格声明（ADR-0006 第 3 条：`StyleDefinition` 与两个插槽类型归渲染层）
 *
 * 这些都要认识 React——插槽是组件，所以它们不能住在 `src/shared`：共享层一旦引用
 * JSX，「只想判一个存下来的风格 id 合不合法」的调用方（session.ts / records.ts）就被迫
 * 认识 react 与它背后的渲染世界。目录给身份，渲染层给实现，这里是两者交界处的类型。
 */

/**
 * **装饰插槽**的组件形状：纯呈现、不吃 props、可返回 null 表示该风格没有这项装饰。
 * 两个插槽由 config.ts 提供，Board 从风格配置里解构出来渲染，不写死成 null。
 *
 * 装饰插槽**只许装饰**：棋盘 DOM 的结构、交互与方块身份都归固定组件所有（ADR-0002）。
 */
export type OverlaySlot = () => JSX.Element | null

/**
 * **呈现插槽**拿到的两样东西（ADR-0002 的两类插槽，2026-09-28 起分开命名）。
 *
 * 与装饰插槽不同，呈现插槽**拥有结构与行为**：它决定长什么样、放在哪、怎么消失。
 * 宿主（store）只负责「什么时候该有一条」——于是这个接口必须窄到只剩这两件事，
 * 否则三套风格就会各自长出一套解锁判定。
 */
export interface ToastSlotProps {
  /** 待呈现的祝贺。宿主已经把同一次跃迁里的成就合成一条、并按上限截到最多三条 */
  toasts: readonly AchievementToast[]
  /** 这一条已经结束（自己消失）：宿主据此把它移出栈 */
  onDone(key: number): void
}

/**
 * 呈现插槽的组件形状。**每一套风格都要交**（与两个装饰插槽并列的第三件），
 * 缺了在注册表解析时抛错，绝不回退到别的风格的长相。
 *
 * 它要满足的**共享契约**（三套风格逐条相同，由同一套 Playwright 断言各跑一遍钉住）：
 *   · 约 5 秒后自行消失；
 *   · 指针悬停或焦点落在里面时暂停计时；
 *   · 每条带 `role="status"`，一次一条地礼貌播报；
 *   · 最多三条同屏（栈由宿主封顶）；
 *   · **从不抢走键盘焦点**（没有 autofocus；`tabindex="0"` 只是让用户能主动 Tab 进来暂停）；
 *   · 尊重 `prefers-reduced-motion`（降级的是「怎么动」，不是「长什么样」）；
 *   · 不遮棋盘、不压四个方向按钮、不拦操作。
 *
 * 坐标与长相不在这个接口里：它们是各风格设计卡 §10 的事（design-flow）。
 */
export type ToastSlot = (props: ToastSlotProps) => JSX.Element | null

/**
 * 一套风格暴露给注册表与棋盘的最小声明。
 *
 * `id` / `label` 由注册表从目录填进来，**不由风格文件夹交**（那是 ADR-0006 的分工：
 * 身份只有一份，写在目录里）。
 */
export interface StyleDefinition {
  id: StyleId
  label: string
  boardOverlay: OverlaySlot
  tileOverlay: OverlaySlot
  toast: ToastSlot
}
