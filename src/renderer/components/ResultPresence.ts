import { useCallback, useEffect, useRef, useState } from 'react'
import type { EndReason, RunPhase } from '../../shared/types'
import type { PanelId, ResultTier } from './ResultLayer'

/**
 * 结果层的**在场**裁决（T27 · ADR-0008 的架构决策 9 / 10）
 *
 * T26 把结果层交给 `phase`：非对局阶段一到，层当场挂上；phase 一走，层当场消失。T27 要它
 * **播完退场再走**，于是「此刻场上该有哪一层」不再等于「此刻的 phase 意味着哪一层」——
 * 中间多出一段「已经不该有层、但层还在台上淡出」的时间。这一个文件就是那一段时间的全部
 * 规则。
 *
 * **为什么住在渲染层而不是 store**：这段延迟是**纯呈现时机**，除了这一块 DOM 之外没有
 * 第二个消费者——store 里已经为祝贺的计时付过一遍代价（toasts / dismissToast），再让它
 * 替一个「只影响这一层什么时候消失」的布尔量维护一份可持久状态，是把呈现细节升格成领域
 * 事实。SPEC §4 那条界线（store 是协调者，不替界面记账）说的正是这件事。
 *
 * **为什么不在这一层冻结读数**：它只记住「哪一层」——`tier` / `panel` / `endReason`
 * 三个字。四项读数由 App 每帧现算递进来，因为退场那一刻数字是**对的**：分数一步没动，
 * 步数刚被撤销减一。一个正在以 150ms 淡出的数字，不值得为它存一份快照——快照存下来只会
 * 让它停在「上一句话」上，而那一句话已经过时了。
 */

/** 这一层的身份：三档 + 哪一处 + 为什么结束。**不含任何读数**（理由见文件头） */
export interface ResultLayerSpec {
  tier: ResultTier
  panel: PanelId
  endReason: EndReason | null
}

/** 此刻场上该有什么：哪一层（null = 场上什么都没有）+ 它是不是正在退场 */
export interface PresenceState {
  layer: ResultLayerSpec | null
  leaving: boolean
}

/** hook 交出去的东西：纯状态 + 一个「退场播完了」的动作 */
export interface ResultLayerPresence extends PresenceState {
  /**
   * 退场放完。由 ResultLayer 的 `onExited` 调（卡片那条退场动画的 `animationend`），
   * 不是由定时器调——理由见 hook 里那段注释。
   */
  drop(): void
}

/** 场上什么都没有。拾取中收起与「从没有过层」共用它——两个都是空场 */
export const EMPTY_PRESENCE: PresenceState = { layer: null, leaving: false }

/**
 * `phase` → 这一层的三档与哪一处。**这张映射只在这一处**：App 拿它算「此刻意味着哪
 * 一层」，e2e 拿 `data-result-tier` / `data-panel` 断的是同一件事。
 *
 * WinPanel / GameOverPanel 各自递给 ResultLayer 的那一份与此同源（两个面板文件里有注释
 * 指回这里）。映射写成一张表而不是 if 链：三档的顺序就是 ADR-0008 第三条「强度按还剩多少
 * 决定可做」排的那一条，读表比读分支直观。
 */
export function layerForPhase(phase: RunPhase, endReason: EndReason): ResultLayerSpec | null {
  if (phase === 'won') return { tier: 'won', panel: 'win', endReason: null }
  if (phase === 'stuck') return { tier: 'stuck', panel: 'gameover', endReason: null }
  if (phase === 'ended') return { tier: 'ended', panel: 'gameover', endReason }
  return null
}

/** 两层是不是同一处。调用方每帧新建描述对象，所以必须逐字段比，不能比引用 */
function sameSpec(a: ResultLayerSpec | null, b: ResultLayerSpec | null): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  return a.tier === b.tier && a.panel === b.panel && a.endReason === b.endReason
}

interface Seen {
  implied: ResultLayerSpec | null
  instantHide: boolean
}

function sameSeen(a: Seen, b: Seen): boolean {
  return a.instantHide === b.instantHide && sameSpec(a.implied, b.implied)
}

/**
 * 下一步的在场状态。**纯函数**：所有判断都在这里，所以它能被单测逐条驱动，而不必先把
 * 一个 hook 架起来。
 *
 * 四条规则，逐条对应 ADR-0008 的架构决策 9 / 10：
 *
 *   1. **phase 意味着哪一层，就持着哪一层**（`sameSpec` 命中时原样返回）；
 *   2. **phase 不再意味着任何一层** → 手上那一层留着，标上退场，等退场播完再摘掉；
 *   3. **退场中途换了另一层** → 立刻换上、退场标记取消。不在一段退场上面再叠一段进场
 *      （同一时刻台上只有一层，叠不起来；真叠了就是两张卡片上下相压）；
 *   4. **没有过渡直接换层**（`won` 继续玩那一手可能是最后一步合法移动，于是同一次提交里
 *      `won` 变成 `stuck`）→ 旧层先播完退场，新层再进场。两段相接是延迟卸载的自然结果，
 *      读起来正是「里程碑退下、死局到来」——播完时换哪一层由 `drop` 现问 `implied`，
 *      所以这里不必把它存下来。
 */
export function nextPresence(
  current: PresenceState,
  implied: ResultLayerSpec | null,
  instantHide: boolean
): PresenceState {
  // 作弊交换拾取中：整层**当场**收起，不播退场（ADR-0008 架构决策 11）。
  // 那是一个进得快出得也快的模式，给它加一段淡出只会让「看清楚两枚方块」这件事变卡。
  if (instantHide) return EMPTY_PRESENCE
  if (current.leaving) {
    // 规则 3：同一层回来（撤销出去又走回来）也走这一条——取消退场，层原地留着
    if (implied === null) return current
    return { layer: implied, leaving: false }
  }
  if (implied === null) {
    // 规则 2：手上什么都没有可退时，什么都不做（否则每次无效输入都换一个新对象）
    return current.layer === null ? current : { ...current, leaving: true }
  }
  if (sameSpec(current.layer, implied)) return current
  if (current.layer === null) return { layer: implied, leaving: false }
  // 规则 4：换层连击
  return { layer: current.layer, leaving: true }
}

/**
 * 在场状态的 hook：把上面的纯判断接到 React 上，并把「退场播完了」接到 CSS 动画上。
 *
 * `implied` 每帧新建（它是 `phase` 的投影），所以判「变没变」必须逐字段比；`instantHide`
 * 是布尔量，比引用就够。
 *
 * **为什么状态调整写在渲染期而不是 effect 里**：`phase` 一变，`data-result-leaving` 必须
 * 在**同一次提交**里落到 DOM 上。写在 effect 里的话，中间会多出一帧「层还在、还接指针」
 * 的画面——而那正是 ADR-0008 架构决策 9 要消除的东西（玩家继续玩之后马上划一下，棋盘
 * 必须当场就有反应）。渲染期调整状态是 React 文档里「props 变化时校正 state」那一条路子：
 * 同一组件内 setState，React 会在提交前用新状态重渲染一次。
 *
 * **为什么退场播完靠 `animationend` 而不是 `setTimeout`**：装假时钟的测试（time-attack
 * 用 `page.clock.pauseAt`）会把 `setTimeout` 整个冻住，层的退场就永远播不完——实测那一条
 * Spec 当场红了两遍。动画结束事件来自渲染管线，JS 定时器怎么假都够不着它。顺带一个好处：
 * 不再有一个「150ms」同时活在 JS 与 CSS 两边等着谁忘改。
 */
export function useResultLayerPresence(
  implied: ResultLayerSpec | null,
  instantHide: boolean
): ResultLayerPresence {
  const [presence, setPresence] = useState<PresenceState>({ layer: implied, leaving: false })
  // 上一帧的输入。只在输入真的变了时才校正 state：否则每帧都校正一次会变成渲染循环
  // （`implied` 每帧都是新对象，比引用永远是「变了」）
  const [seen, setSeen] = useState<Seen>({ implied, instantHide })
  // `implied` 的最新值。退场到点时「该换成哪一层」现问它，而不是把开始退场那一刻的
  // 答案存下来：那一答可能已经过期——换层连击进行到一半时又撤销，`implied` 回到 null，
  // 缓存的那一答会让一层「已经不该在场上」的关卡在退场结束后自己冒出来。
  const latest = useRef(implied)

  if (!sameSeen(seen, { implied, instantHide })) {
    setSeen({ implied, instantHide })
    const next = nextPresence(presence, implied, instantHide)
    if (next !== presence) setPresence(next)
  }

  // 写在 effect 里而不是渲染期：渲染期不写 ref（重渲染可能被丢弃，ref 会停在半路上）
  useEffect(() => {
    latest.current = implied
  })

  // useCallback 只为让 `onExited` 的引用稳定下来：这一层每个渲染都新建一个闭包的话，
  // 每帧都在给 ResultLayer 换一个新 prop，白费一次子树比对
  const drop = useCallback((): void => {
    // 换成「此刻意味着的那一层」：可能是同一层、另一层（换层连击）、或者 null（正常退场）。
    // `current.leaving` 这一问是防重入——同一个动作被两条路各叫一次时，第二次什么都不做
    setPresence((current) =>
      current.leaving ? { layer: latest.current, leaving: false } : current
    )
  }, [])

  return { ...presence, drop }
}
