/**
 * 风格列表的高亮移动器（T42 · 父规格 docs/specs/style-picker.md 决策 5）
 *
 * **为什么是纯函数 + 独立文件**：与 `DrawerPresence.ts` / `ResultPresence.ts` 同一条路子
 * ——判断本身不碰 DOM、不碰 React，就能在 node 单测里逐条驱动
 * （`tests/unit/listbox-highlight.test.ts`）；焦点真的落到哪一格、`:focus` 底色换没换，
 * 是浏览器的事，归 e2e。DOM 焦点管理（真实 `focus()`，`aria-activedescendant` 被否）
 * 由 `StyleRow.tsx` 接线：这一层只回答「下一个 index 是几」。
 *
 * **循环是规格明写的**（APG listbox 的 wrapping：三个选项都要完全可达）：ArrowDown 从
 * 末尾回开头、ArrowUp 从开头回末尾。`Home` / `End` 跳两头、不循环。
 */

/** 列表展开时归它管的四个导航键（父规格决策 7 的第二个放行例外） */
export type ListboxNavKey = 'ArrowUp' | 'ArrowDown' | 'Home' | 'End'

/**
 * 从「当前 index + 一个导航键」算出下一个 index。
 *
 * **函数是全的**：`current` 越界（包括 -1）先收进 `0..count-1` 再算——调用方不必先夹，
 * 也不会有 NaN 流进 `focus()`。空列表原样返回 `current`（注册表为空不是它会遇到的
 * 输入，但不炸）。
 */
export function nextHighlight(current: number, key: ListboxNavKey, count: number): number {
  if (count <= 0) return current
  const from = Math.min(Math.max(current, 0), count - 1)
  switch (key) {
    case 'Home':
      return 0
    case 'End':
      return count - 1
    case 'ArrowUp':
      return (from - 1 + count) % count
    case 'ArrowDown':
      return (from + 1) % count
  }
}
