import { useEffect, useRef, useState, type JSX } from 'react'
import { achievementUnlockLabel, type AchievementToast } from '../../../../game/achievements'
import type { ToastSlot, ToastSlotProps } from '../../types'

/**
 * Material 的成就祝贺（设计卡 §10）
 *
 * 呈现插槽**拥有结构与行为**（ADR-0002）：这一份文件管「长什么样、放在哪、怎么消失」，
 * 而「什么时候该有一条」是宿主（store）的事——这里不判断任何成就条件，也不读存储。
 *
 * 共享契约（三套风格逐条相同，由同一套 Playwright 断言各跑一遍）：
 *   · 约 5 秒后自行消失；指针悬停或焦点落在里面时**暂停计时**，移开接着走剩下的时间；
 *   · `role="status"`（隐式 polite + atomic）：每条只播报一次，且在场期间一直留在
 *     无障碍树里可回读；
 *   · `tabindex="0"` 让它进 Tab 顺序——「焦点在内时暂停」正是靠它成立的；但**从不自动
 *     抢焦点**，解锁不改变 `document.activeElement`；
 *   · 最多三条同屏（栈由宿主封顶）；
 *   · 尊重 `prefers-reduced-motion`（CSS 里时长归零，投影与色值一律不变）；
 *   · 位置与配色见设计卡 §10——贴视口右上角、不进文档流、卡片之外点击穿透。
 *
 * 为什么进场分两步（`entered` 那个 state）：要让 CSS 过渡真的跑起来，元素得先以「起点」
 * 画一帧、再切到「终点」。起点是**不可见**的（opacity 0），所以这里不会出现 T21 在
 * 胜利标题上踩过的那种「可见的底色先闪一下」——看不见的东西先画一帧没有代价。
 */

/** 进场之后可见多久（设计卡 §10：约 5 秒） */
const VISIBLE_MS = 5000

/** 出场的过渡时长：与 CSS 里 `.toast--leaving` 的 200ms 一致，动画结束再通知宿主 */
const EXIT_MS = 200

interface Props {
  toast: AchievementToast
  onDone(key: number): void
}

/** 一条祝贺。它自己管自己的计时：暂停、继续、出场，都在这一层 */
function MaterialToast({ toast, onDone }: Props): JSX.Element {
  const [entered, setEntered] = useState(false)
  const [leaving, setLeaving] = useState(false)
  // 悬停与聚焦**各自**记一个，两个条件谁在都能让计时停下来，互不解除：
  // 契约原文是「pointer over it, or focus inside it」——所以指针移开时若焦点还在里面，
  // 它仍然该停着（一个 boolean 会让两种触发互相清掉，那是实现上的想当然）
  const [hovering, setHovering] = useState(false)
  const [focused, setFocused] = useState(false)
  const paused = hovering || focused
  // 剩余可见时长。暂停时把已经过去的那一段扣掉，继续时从剩下的接着走（不重新计满）
  const remaining = useRef(VISIBLE_MS)
  const startedAt = useRef(0)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    if (paused || leaving) return
    startedAt.current = Date.now()
    const timer = window.setTimeout(() => setLeaving(true), remaining.current)
    return () => {
      window.clearTimeout(timer)
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current))
    }
  }, [paused, leaving])

  useEffect(() => {
    if (!leaving) return
    // 出场动画放完再从栈里摘掉：`onDone` 由宿主处理（它只把这一条移出栈）
    const timer = window.setTimeout(() => onDone(toast.key), EXIT_MS)
    return () => window.clearTimeout(timer)
  }, [leaving, onDone, toast.key])

  const names = toast.ids.map(achievementUnlockLabel).join('、')
  const className = `toast${entered ? '' : ' toast--entering'}${leaving ? ' toast--leaving' : ''}`

  return (
    <div
      className={className}
      data-toast
      data-toast-key={toast.key}
      role="status"
      tabIndex={0}
      onPointerEnter={() => setHovering(true)}
      onPointerLeave={() => setHovering(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <span className="toast__label">解锁成就：</span>
      <span className="toast__names">{names}</span>
    </div>
  )
}

/** 呈现插槽本体：没有待呈现的祝贺时什么都不渲染（空栈不留一个空盒子） */
export const toast: ToastSlot = ({ toasts, onDone }: ToastSlotProps): JSX.Element | null => {
  if (toasts.length === 0) return null
  return (
    <div className="toast-stack" data-toast-stack>
      {/* 宿主按「旧 → 新」给，这里倒着渲染：**最新的一条在最上**（设计卡 §10） */}
      {[...toasts].reverse().map((item) => (
        <MaterialToast key={item.key} toast={item} onDone={onDone} />
      ))}
    </div>
  )
}