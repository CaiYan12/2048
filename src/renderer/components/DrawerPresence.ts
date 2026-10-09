import { useCallback, useState } from 'react'

/**
 * 设置抽屉的**在场**裁决（T38 · 父规格 docs/specs/settings-drawer.md 的架构决策 10 / 11 ·
 * ADR-0010）
 *
 * T37 把抽屉做成硬切：`settingsOpen` 一翻就挂载 / 卸载，「在场上」与「开着」是同一件事。
 * T38 给这一层补上进出动效之后，**挂载 ≠ 打开**——关掉之后容器要比「关闭」多活一段退场动画
 * （200ms）。那段时间由这一个文件说了算：此刻场上还有没有这一层、它是不是正在退场。
 *
 * **为什么住在渲染层而不是 store**：这段延迟是**纯呈现时机**，除了这一块 DOM 之外没有第二
 * 个消费者（与 `ResultPresence.ts`、`ShenmoFall.ts` 完全同一条理由）。store 里的每个字段都被
 * hydrate / setState 的字段表牵着走，为「这一层什么时候消失」的布尔量维护一份可持久状态，
 * 是把呈现细节升格成领域事实（SPEC §4：store 是协调者，不替界面记账）。
 *
 * **形状照两个先例**：纯函数 + 一个薄 hook，函数里没有 React。于是判断能在 node 单测里逐条
 * 驱动（`tests/unit/drawer-presence.test.ts`），挂不挂得上（DOM、动画、指针）归 e2e。
 *
 * **为什么退场靠动画结束事件而不是定时器**：装假时钟的测试（`page.clock`）会把 `setTimeout`
 * 整个冻住，退场就永远播不完——结果层与彩蛋菜单都为这件事各付过一遍代价
 * （`.codex/memories/result-layer.md` 第 6 条）。动画结束事件来自渲染管线，JS 定时器怎么假都
 * 够不着它；顺带一个好处，两个时长只活在 CSS 里，JS 一个副本都没有。
 */

/** 抽屉的在场状态：在不在场上 + 是不是正在退场 */
export interface DrawerPresenceState {
  mounted: boolean
  leaving: boolean
}

/** 场上什么都没有。关掉且退场播完 = 从未打开过，两个都是空场 */
export const EMPTY_DRAWER_PRESENCE: DrawerPresenceState = { mounted: false, leaving: false }

/**
 * 下一步的在场状态。**纯函数**：所有判断都在这里，所以它能被单测逐条驱动，而不必先把一个
 * hook 架起来。
 *
 * 三条规则：
 *
 *   1. **开着 → 在场上、不退场**。正在退场中又被打开（点「收起」之后 200ms 内又点入口，
 *      或点外侧关掉的一瞬间又点开）走这一条——取消退场，层原地留着，不摘也不重挂。
 *   2. **关掉、且手上有东西、且没在退场 → 标退场，层留着**，等退场动画播完（`drop`）再摘。
 *      这就是「挂载 ≠ 打开」的全部：多出来的一段就是那 200ms。
 *   3. **其余原样返回**：关着且本来就没挂（避免每次无效输入换一个新对象）、或已经在退场
 *      （别再标一次、也别提前摘）。
 */
export function nextDrawerPresence(
  current: DrawerPresenceState,
  open: boolean
): DrawerPresenceState {
  if (open) {
    // 规则 1：已经开着且不在退场 → 引用原样返回（免得白渲染）
    if (current.mounted && !current.leaving) return current
    return { mounted: true, leaving: false }
  }
  // 规则 3：没过场可退（本来就没挂 / 已经在退场）
  if (!current.mounted || current.leaving) return current
  // 规则 2：留着它播退场
  return { mounted: true, leaving: true }
}

/** hook 交出去的东西：纯状态 + 一个「退场播完了」的动作 */
export interface DrawerPresence extends DrawerPresenceState {
  /**
   * 退场放完。由 SettingsDrawer 的 `onExited` 调（抽屉那条退场动画的 `animationend`），
   * 不是由定时器调——理由见文件头。
   */
  drop(): void
}

/**
 * 在场状态的 hook：把上面的纯判断接到 React 上，并把「退场播完了」接到 CSS 动画上。
 *
 * **为什么状态调整写在渲染期而不是 effect 里**：`settingsOpen` 一变，`data-settings-leaving`
 * 必须在**同一次提交**里落到 DOM 上（父规格决策 10：退场那一帧起整块不再接指针）。写在
 * effect 里的话，中间会多出一帧「层还在、还接着指针」的画面——而那正是那一条要消除的东西。
 * 渲染期调整状态是 React 文档里「props 变化时校正 state」那一条路子（同 ResultPresence /
 * ShenmoFall）：同一组件内 setState，React 会在提交前用新状态重渲染一次。
 */
export function useDrawerPresence(open: boolean): DrawerPresence {
  const [presence, setPresence] = useState<DrawerPresenceState>(
    nextDrawerPresence(EMPTY_DRAWER_PRESENCE, open)
  )
  // 上一帧的输入。只在它真的翻了时才校正 state：每帧都校正是渲染循环
  const [seen, setSeen] = useState(open)

  if (seen !== open) {
    setSeen(open)
    const next = nextDrawerPresence(presence, open)
    if (next !== presence) setPresence(next)
  }

  // useCallback 只为让 `onExited` 的引用稳定下来：这一层每个渲染都新建一个闭包的话，
  // 每帧都在给 SettingsDrawer 换一个新 prop，白费一次子树比对
  const drop = useCallback((): void => {
    // `current.leaving` 是防重入——同一条动画结束事件被两条路各叫一次时，第二次什么都不做；
    // 也只摘已经在退场的那一层（正常到点它一定在退场）
    setPresence((current) => (current.leaving ? EMPTY_DRAWER_PRESENCE : current))
  }, [])

  return { ...presence, drop }
}
