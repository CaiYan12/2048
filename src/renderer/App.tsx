import { useEffect, useCallback, useRef, useState, type AnimationEvent, type JSX } from 'react'
import type { ModeId } from '../shared/modes'
import type { Direction } from '../shared/types'
import type { ShenmoOutcome } from '../game/achievements'
import { Board } from './components/Board'
import { Cannon } from './components/Cannon'
import { Countdown } from './components/Countdown'
import { DailyDateLabel } from './components/DailyDateLabel'
import { DirectionPad } from './components/DirectionPad'
import { GameOverPanel } from './components/GameOverPanel'
import { RunAnnouncer } from './components/RunAnnouncer'
import { layerForPhase, useResultLayerPresence } from './components/ResultPresence'
import { resultCardLine } from './components/resultCardLine'
import { SettingsDrawer, SettingsEntry } from './components/SettingsDrawer'
import { useDrawerPresence } from './components/DrawerPresence'
import { useShenmo, type ShenmoButton } from './components/ShenmoChoice'
import { useShenmoFall } from './components/ShenmoFall'
import { ShenmoStrip } from './components/ShenmoStrip'
import { StatsPanel } from './components/StatsPanel'
import { StatusBar } from './components/StatusBar'
import { StorageNotice } from './components/StorageNotice'
import { StartScreen } from './components/StartScreen'
import { WinPanel } from './components/WinPanel'
import { recheckEffectiveFont } from './styles/fontState'
import { getTheme } from './styles/themes'
import { highestTileOf, resultReadout } from './stores/records'
import { useGameStore } from './stores/useGameStore'

/**
 * 外壳：开局前是模式 / 风格选择，开局后是棋盘 + 信息条 + 终局面板。
 *
 * 这里只做编排——规则在 src/game/，呈现规则在 themes/<id>/，状态在单 store。
 * T04 起按 phase 挂面板：won → 胜利里程碑，stuck / ended → 死局与终局。
 * T26 起两处面板共用 ResultLayer（半透明遮罩 + 不透明卡片，ADR-0008）。
 * T27 起「这一刻场上该有哪一层」由 ResultPresence.ts 算：phase 只回答「此刻**意味着**」
 * 哪一层，而层要比 phase 多活一段退场时间（ADR-0008 的架构决策 9 / 10）。
 * T09 起按 deadline 挂倒计时：限时模式才读表，其余模式的 deadline 是 null。
 * T11 起把撤销接到死局面板与键盘 z 上：面板只在 stuck 时给它留入口（ended 之后
 * 不可用，那道判断在 store 的 undo 里），键盘那条路在 won 阶段同样有效——
 * mode-contract §3 只禁 ended 之后的撤销。
 * T12 起把作弊交换接到 StatusBar 与死局面板：拾取中先收起结果层，否则它那层盖在棋盘上
 * 会把方块挡住，指针那条路点不到东西（理由见下面板那一段；T26 起它是半透明遮罩，
 * 但「看得见」不等于「点得到」，那条理由一字未改）。
 * T13 起把风格切换接到外壳上：`data-style` 是整套换肤机制的根——每套风格的
 * tokens.css / styles.css 都把自己的规则挂在 `[data-style='<id>']` 之下，所以多套风格的
 * CSS 同时活在同一个产物里也不互相覆盖。它挂在外壳而不是 .board 上：ADR-0002 规定棋盘
 * DOM 固定，而外壳正是「可以换实现」的那一层（设计卡 §5）。
 * T14 起在 styleId 变化时重跑字体状态机：换风格可能换了一套从没下载过的字体，
 * 启动时那一次检测的结论不能永久锁住它（ADR-0005 最后一句）。
 * T16 起在挂载时读一次存档：刷新之后这一局接着打。读存档是异步的，所以第一帧
 * 显示的是「正在恢复」而不是开局界面——先把开局界面画出来再撤掉，玩家看见的就是
 * 一次「我的一局好像没了」的闪烁。
 * T17 起同一批读取把记录与统计（records / stats 两个桶）一起带回来，外壳上多一个
 * 「战绩与统计」入口：开局前与局中都能看，它不盖棋盘、不抢焦点。
 * ADR-0007 起外壳上多一个**呈现插槽**（ADR-0002）：成就祝贺由**当前风格自己渲染**
 * （`getTheme(styleId).toast`），宿主只把「待呈现的几条 + 本条已结束」递过去。
 * 它挂在 `.board` 之外（设计卡 §10：fixed 贴视口**上方正中**），所以不遮棋盘、不压方向按钮。
 * 2026-09-28 起**键盘也住在这里**：整页、从页面加载那一刻起，方向键都是游戏的键，
 * 而且一律不让浏览器拿去滚页面（理由见下面那段 effect）。
 * T29 起**一念神魔**的彩蛋也从这里旁听：那八下就是普通移动，App 既有的 `MOVE_KEYS`
 * 查表把方向键与 WASD 归一成同一个方向，推进 `move()` 之后顺手递进 `ShenmoChoice.ts`
 * 那台 pure machine。App **不新增输入态、不吞键**，三条让路规定与 Esc 的既有行为一个字
 * 都没改（Esc 只多一条本地条件，见那段 effect）。旧「临时调试钩子」的三块注释也随之
 * 删掉——暗道比不给按钮更糟，而这一回按钮后面有真东西（父规格的架构决策 19）。
 * T30 起第一遍走完的报酬也在这儿：两上角各射一发礼炮（`Cannon`，canvas 手写粒子），
 * 以及页面底部那颗「一念神魔」按钮——两者的开关是同一个事实（store 的
 * `shenmoOutcomes` 里有 first-pass），所以授予与收回只有一处说了算。
 */

/**
 * 移动键 → 方向。方向键（SPEC §3.4）+ WASD（用户故事 2 的原文就是「arrow keys or WASD」）。
 * 只用小写查找，Shift 的大写与方向键都能命中。
 */
const MOVE_KEYS: Readonly<Record<string, Direction>> = {
  arrowup: 'up',
  arrowdown: 'down',
  arrowleft: 'left',
  arrowright: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
}

/**
 * 撤销键（T11，ADR-0003）。与 MOVE_KEYS 并排放，为的是让两条键位** visibly 共用
 * 同一条查表路子**：查表前先 toLowerCase，所以 Shift+Z 的 `Z` 自动命中同一个键，
 * WASD 的大写也是这样命中的——不必为大写单列一行。加撤销键只改这一处。
 *
 * **为什么不是 Ctrl+Z**：那个组合在浏览器与操作系统里已经被占用（多数桌面是文本
 * 撤销），抢过来会让玩家在别处按 Ctrl+Z 时推回上一步。撤销键因此是裸 `z`，
 * 而带 Ctrl / Meta / Alt 的组合整个放行（见 effect 里那一条）。
 */
const UNDO_KEYS: Readonly<Record<string, boolean>> = { z: true }

/**
 * B 碎掉时那四片碎渣所在的象限（T34）。
 *
 * **为什么是真元素而不是伪元素**：两个伪元素（`::before` / `::after`）各只能装一片，
 * 四片起必须在按钮里渲染真的节点。它们只在 `data-shenmo-breaking='true'` 那一刻挂载
 * （App 的条件就是 `shenmoStage === 'breaking'`），破碎一结束 B 整颗离开 DOM。
 * `aria-hidden` 不能省：碎片是装饰，而按钮的可访问名字是 `aria-label` 给的「抉择 B」——
 * 字形若当作文本子节点进来，屏幕阅读器念的就是「抉择 B B B B」。
 *
 * 四个名字就是它们在按钮里的位置（左上 / 右上 / 左下 / 右下），CSS 按它给象限与飞走
 * 的方向（`index.css` 的 `.shenmo__shard[data-shenmo-shard='…']`）。写成一张表而不是
 * 四段 JSX：四片是一模一样的形状，只有这一处不同。
 */
const SHENMO_SHARDS: readonly ('tl' | 'tr' | 'bl' | 'br')[] = ['tl', 'tr', 'bl', 'br']

/**
 * 键盘事件要放行给浏览器的目标。
 *
 * 监听挂在 window 上，够得着的目标是一整个页面，所以放行条件必须准：
 *
 *   · **文本入口一律放行**：方向键在 `input` / `textarea` / `select` / `contenteditable`
 *     里是「移光标、换选项」，不是「推棋盘」。README TODO 里的设置界面会有一排下拉框，
 *     就是这条守卫要保住的场景。
 *   · **棋盘区内的交互控件放行**：它们在棋盘里面，方向键归它们（T03 就钉过这条）。
 *     棋盘**之外**的按钮不在此列——面板上的「继续玩」按方向键照样会去推棋盘，挡不挡得住
 *     是 store 的 phase 说了算。这正是所有者要的「全局」。
 */
function allowsNativeKeys(target: EventTarget | null, board: HTMLElement | null): boolean {
  if (!(target instanceof Element)) return false
  if (
    target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !==
    null
  ) {
    return true
  }
  return board !== null && board.contains(target) && target.closest('button, a[href]') !== null
}

export default function App(): JSX.Element {
  // 外壳元素本身。字体重探需要它：这一套风格的字体栈挂在 data-style 上，
  // 只有这个元素算得出来（fontState.ts 的 effectiveFamilies）
  const shellRef = useRef<HTMLElement>(null)
  const game = useGameStore((state) => state.game)
  const dailyDate = useGameStore((state) => state.dailyDate)
  const styleId = useGameStore((state) => state.styleId)
  const selectedModeId = useGameStore((state) => state.selectedModeId)
  const setStyle = useGameStore((state) => state.setStyle)
  const recordShenmoOutcome = useGameStore((state) => state.recordShenmoOutcome)
  // 一念神魔的两个占位音（T33）：什么时候发由 App 判，synth 只住在 store 里
  const playShenmoSound = useGameStore((state) => state.playShenmoSound)
  const mute = useGameStore((state) => state.mute)
  const setMute = useGameStore((state) => state.setMute)
  const selectMode = useGameStore((state) => state.selectMode)
  const storageNotice = useGameStore((state) => state.storageNotice)
  const restoring = useGameStore((state) => state.restoring)
  const hydrate = useGameStore((state) => state.hydrate)
  const startRun = useGameStore((state) => state.startRun)
  const storeMove = useGameStore((state) => state.move)
  const undo = useGameStore((state) => state.undo)
  const continueRun = useGameStore((state) => state.continueRun)
  const settle = useGameStore((state) => state.settle)
  const newGame = useGameStore((state) => state.newGame)
  // 本局起始时刻（T17 的本局时长从它算）。T29 的彩蛋也读它——彩蛋的「这一局的身份」
  // 由「阶段 @ 起始时刻」拼，换局必变、局中一步都不变（见下面那段注释）
  const runStartedAt = useGameStore((state) => state.runStartedAt)
  // 本局合并次数（T31：卡片那一行要的另一本账）。彩蛋那个字段同一条理由，下面
  // 「一念的奖品」那一段已经取过了，这里不取第二遍
  const runMerges = useGameStore((state) => state.runMerges)
  const swapArmed = useGameStore((state) => state.swapArmed)
  const swapSelection = useGameStore((state) => state.swapSelection)
  const toggleSwap = useGameStore((state) => state.toggleSwap)
  const selectCell = useGameStore((state) => state.selectCell)
  const clearSwap = useGameStore((state) => state.clearSwap)
  // 一念的奖品（T30）：本局在抉择里结出过 first-pass 即「拿到了」——礼炮与那颗按钮
  // 都从这一个事实出发，于是「第一遍授予、开新局收回」由 store 的重置点一次说清
  const shenmoOutcomes = useGameStore((state) => state.shenmoOutcomes)
  const wishGranted = shenmoOutcomes.includes('first-pass')
  const plantWish = useGameStore((state) => state.plantWish)
  // 二念的代价（T32 · 父规格的架构决策 8 / 10）：本局**第二次**结出 first-pass（那个
  // 「第二次」在机器里长成一个新的果 `second-pass`）即「棋盘被扣下」。它驱动三件事——
  // 视口顶端那条悬顶（立刻）、走火入魔那颗祝贺（也是立刻：机器的 `onOutcome` → store，
  // 于是**血刚涌上来的那一帧玩家就知道发生了什么**，而不是等页面扣下之后），以及两拍
  // 终局的起跑（页面清空到只剩一颗「重新开始」，T36 起在血染与淡出播完之后才到达）。
  // 与一念的奖品同一个事实、同一条理由：**它是 store 那个不落盘的彩蛋字段，所以刷新即
  // 恢复**，恢复之后这一局的彩蛋进度从零起，玩家还能再走一次火入魔、再被扣下一次。这是
  // 架构决策 8 明写的**后果，不是漏洞**——「这一局从头到尾没有被碰过」与「刷新能把它带
  // 回来」是同一句话的两半，谁也改不掉另一半。
  const shenmoSecondPass = shenmoOutcomes.includes('second-pass')
  const records = useGameStore((state) => state.records)
  // 这一局结算那一刻的归属（T26）：结果层的「最高分」读哪一条记录由它说了算
  const settlementAttribution = useGameStore((state) => state.settlementAttribution)
  const stats = useGameStore((state) => state.stats)
  const toasts = useGameStore((state) => state.toasts)
  const dismissToast = useGameStore((state) => state.dismissToast)
  const moveSequence = useRef(0)
  const boardRef = useRef<HTMLDivElement>(null)
  const moveContext = useRef<{
    direction: Direction
    id: number
    steps: number
    startPositions: ReadonlyMap<number, string>
  } | null>(null)

  // 战绩面板的开合。住在 App 而不是 store：它只被这一处用到，而 store 里的每个
  // 字段都会被 hydrate / setState 的字段表牵着走（T16 的形状判据就是这么变复杂的）
  const [statsOpen, setStatsOpen] = useState(false)
  // 战绩面板的开关。面板收起时焦点该还给谁，由它回答（下面那个 effect）
  const statsToggleRef = useRef<HTMLButtonElement>(null)
  // 开关状态的上一个值：只为分辨「刚收起」与「从没开过」。挂载那一遍 StatsOpen
  // 本来就是 false，不分辨的话它会被当成一次「收起」而在载入时抢走焦点
  const previousStatsOpen = useRef(statsOpen)
  // 二念那一页唯一的那颗按钮（T34）。整页被扣下时焦点落在它身上（下面那个 effect）
  const restartRef = useRef<HTMLButtonElement>(null)
  // 「页面刚被扣下」与「从没扣过」也要分开，与 previousStatsOpen 同一条理由。
  // **它记的是 `pageCleared` 而不是 `shenmoSecondPass`**（T36）：两拍终局那 1200ms 里
  // 页面还活着，而那期间 focus effect 不该动手（玩家点的抉择 A 还拿着焦点）
  const previousSecondPass = useRef(false)

  // 设置抽屉的开合（T37）。住在 App 而不是 store：它是纯会话状态、明确**不落盘**
  // （刷新进到一个开着的设置层，那是一个会记住错误的页面，父规格架构决策 16），
  // 而 store 的每个字段都被 hydrate / setState 的字段表牵着走。
  const [settingsOpen, setSettingsOpen] = useState(false)
  // 风格列表的开合（T42）。**与 settingsOpen 同一个分发点持有**（父规格决策 6）：三层
  // Esc 优先序（列表 > 抽屉 > 底下的摊）要在下面那一条 keydown 分发链里裁决，若让
  // StyleRow 自己另持一份状态，Esc 就成了两个监听者赛跑。它同样不落盘——列表开着时
  // 抽屉关掉（点遮罩 / 收起 / Esc），下次打开从收着开始。
  const [styleListOpen, setStyleListOpen] = useState(false)
  // 入口那颗齿轮。关掉抽屉时焦点回落到它身上（下面那个 effect）
  const settingsEntryRef = useRef<HTMLButtonElement>(null)
  // 抽屉容器。打开时焦点落在**容器**上而不是关闭按钮——一次误敲回车会当场关掉
  const settingsPanelRef = useRef<HTMLDivElement>(null)
  // 抽屉的**在场**（T38 · 父规格决策 10 / 11）。T37 是「开着即挂载、关掉即卸载」的硬切；
  // T38 起这一层要比关闭多活一段退场动画，于是「在场上」不再等于「开着」——那台裁决住在
  // DrawerPresence.ts（纯函数 + 薄 hook）。渲染期校正保证 `data-settings-leaving` 与开合
  // 状态在同一次提交落 DOM。
  const drawer = useDrawerPresence(settingsOpen)
  // 「刚离开 DOM」与「从没挂过」也要分开，与 previousStatsOpen 同一条理由。依赖是
  // `drawer.mounted` 而不是 `settingsOpen`——见下面那个焦点 effect
  const previousDrawerMounted = useRef(drawer.mounted)

  // 结果层的在场（T27 · ADR-0008 的架构决策 9 / 10）。T26 是「phase 一到就挂、一走就
  // 没」，T27 要它播完退场再走——于是「场上该有哪一层」由这一个 hook 说，phase 只回答
  // 「此刻**意味着**哪一层」。它住在渲染层：这段延迟没有第二个消费者（理由写在
  // ResultPresence.ts 的文件头）。
  //
  // 拾取中整层**当场**收起（`instantHide`）：那是一个进得快出得也快的模式，给它加一段
  // 淡出只会让「看清两枚方块」变卡——T12 / T26 的行为一字不改。注意 ended 那一侧不
  // 收起：store 的 selectCell 直接拒绝已终局的一局，`swapArmed` 陪 `ended` 出现时结果层
  // 照旧在（T26 的条件就是只有 `stuck` 才看 swapArmed）。
  const instantHide = game !== null && swapArmed && game.phase === 'stuck'
  const implied = game === null || instantHide ? null : layerForPhase(game.phase, game.endReason)
  const presence = useResultLayerPresence(implied, instantHide)

  // 卡片那一行（T31 · 父规格的架构决策 17）：**一个座位两处用法**——道通成魔那一局的梗，
  // 与死局 / 超时 / 放弃那一刻的本局总结。句子由 resultCardLine 从本局 facts 生成，
  // 与读数同一条路子（都在这里现算、都不落盘、两个面板都不自己判）。
  // **按持有中的那一层算，不按活的 phase**：退场那一刻画的是正在离开的那一层，它说的也
  // 该是那一层的事（与 ResultPresence 不冻结读数是同一条规矩的两半——数字每帧现算，
  // 而「哪一层」由它记得）。
  const resultLine =
    presence.layer !== null && game !== null
      ? resultCardLine({
          tier: presence.layer.tier,
          endReason: presence.layer.endReason,
          score: game.score,
          highestTile: highestTileOf(game.board),
          merges: runMerges,
          moves: game.moves,
          wish: wishGranted,
        })
      : null

  // 一念神魔的 pure machine（T29）。码缓冲、阶段、两个窗口全住在 ShenmoChoice.ts 里，
  // 这里只做三件事：告诉它「这一局的身份」（身份一变，摊当场收起、什么都不授予）、
  // 把结出的果递给 store（彩蛋碰 store 的唯一入口）、以及把它算出来的阶段画出来。
  //
  // 身份由「阶段 @ 本局起始时刻」拼：两者在一局进行中都恒定，而换阶段与换一局都变。
  // **不能只判 `game !== null`**——`newGame` 之后 phase 还是 playing、game 也不是 null，
  // 布尔量一个比特都不动，而摊必须收起（用户故事 8 的后半句）。起始时刻是 store 里
  // 现成的字段（T17 的本局时长从它算），换局必变、局中一步都不变。
  //
  // `onOutcome` 必须是稳定引用：它是 hook 里那个 effect 的依赖，每天换一个等于每天都
  // 把上一次果重新通知一遍
  const handleShenmoOutcome = useCallback(
    (outcome: ShenmoOutcome): void => {
      recordShenmoOutcome(outcome)
    },
    [recordShenmoOutcome]
  )
  const shenmoRunKey =
    game === null || runStartedAt === null ? null : `${game.phase}@${runStartedAt}`
  const shenmo = useShenmo(shenmoRunKey, handleShenmoOutcome)

  // 神魔码的阶段。单独取出来而不是整个 `shenmo`：下面那个 keydown effect 的依赖表要它，
  // 而 `shenmo` 每帧都是新对象（照 presence 那条路子）
  const shenmoStage = shenmo.stage

  // 退场中画的是哪一档（T35）。`leaving` 这一个字不说 B 在不在，所以机器用 `leavingFrom`
  // 记住它：退场放的是**同一个容器**，内容若在这一刻换掉，先点 A 之后 B 会在淡出中凭空
  // 冒回来。非退场阶段就是阶段本身。`data-shenmo-stage` 因此照旧报「看得见的那一档」，
  // 退场另由 `data-shenmo-leaving` 说——与结果层 `data-result-tier` + `data-result-leaving`
  // 那一对同一个路子。
  const shenmoVisibleStage =
    shenmoStage === 'leaving' && shenmo.leavingFrom !== null ? shenmo.leavingFrom : shenmoStage

  // **堕落窗口开着**（T33）：点过 B 之后、抉择有结果之前（父规格的架构决策 16 说的
  // 「魔道」）。`breaking` 也算——B 正在碎，玩家已经选了，那 450ms 不是「还没决定」。
  // **T36 起它只管时之狭**：染墨搬到二念的终局去了（见下面 `falling`），而血与时之狭是
  // 两件事——所有者另行批过「免费犹豫变成买来的时间」，与那一抹血没有关系。
  const demonOpen = shenmoStage === 'breaking' || shenmoStage === 'ring'

  // 二念的**两拍终局**（T36 · 控制人 2026-10-01 裁定）。第二遍完整走完 B → A 之后：
  // 血染涌上来（600ms）→ 停一拍（200ms）→ 整条游戏列淡出（400ms）→ 页面扣下。
  // **染血的开关因此从「魔道那 30 秒」搬到「二念的果结出来」**：业主的原话是「这个染血色的
  // 触发条件是重复输入两次作弊码，先染出血色，然后淡出关闭棋盘页面。并非是输错了，输错了
  // 直接重来」——所以点过 B 之后那 30 秒一眼血色都没有，错键依旧整个清空重来（既有行为）。
  // 两拍由 CSS 动画推进、`animationend` 收尾（下面 `handleShenmoFallEnd`），一个 JS
  // 定时器都没有：装假时钟的测试会把 setTimeout 整个冻住，终局就永远播不完。
  const fall = useShenmoFall(shenmoSecondPass)
  // 两拍在场 = 整列还在台上（血染 + 淡出）；播完（done）页面才真的扣下
  const falling = shenmoSecondPass && fall.beat !== 'done'
  // 「页面已经被扣下了」。**T36 起它与「二念的果结出来了」不再是同一刻**，中间隔着血染与
  // 淡出那 1200ms——悬顶、祝贺、统计入口的收起都改挂在它上面（见下面各处）
  const pageCleared = shenmoSecondPass && !falling

  /**
   * 点一颗圆钮（T33）：两个占位音跟着这一次点击走。
   *
   * 为什么发号点在这儿而不是 store 的果记账上：`recordShenmoOutcome` 是幂等的（同一个
   * 果本局只记一次），而礼炮要的是**每一次**收尾都响——第二遍走完魔道时不再授予任何
   * 果，那一刻照旧放礼炮（父规格的架构决策 6：第二遍摆出同一副摊）。判定「这一下该
   * 不该响」的现场在点击这儿：只有 App 知道此刻是哪个阶段。store 只递事件名给 synth
   * （`playShenmoSound`），App 一个 synth 名词都不碰。
   */
  const chooseShenmo = (button: ShenmoButton): void => {
    // 退场播完之前什么都不发生（T35）。容器上 `pointer-events: none` 只挡得住鼠标，
    // 挡不住回车与空格——一颗正在淡出的钮被键盘再激活一次，玩家听到的还是「又碎了一遍」
    // / 「又响了一遍号角」（T33 为 B 的 150ms 双击补过同一条学费，照那个路子）。机器的
    // stage 守卫本来也把 leaving 上的 choose 吞掉，这一道守的是**声音**：那几个发号点
    // 排在机器的守卫之前。
    if (shenmoStage === 'leaving') return
    if (button === 'b') {
      // 破碎退场进行中再点 B 是空气（机器的 stage 守卫把它吃掉），那一声破碎音也不该
      // 再响。放在这儿而不是给 CSS 补 `pointer-events: none`：那一招挡得住鼠标，
      // 挡不住回车与空格——一颗正在碎的钮被键盘再激活一次，玩家听到的还是「又碎了一遍」。
      if (shenmoStage === 'choice') playShenmoSound('shatter')
      shenmo.choose('b')
      return
    }
    // 走过魔道再点 A 才是这一遍的收尾，礼炮配那一下；摊刚开就点 A 是「学艺不精」，
    // 那一下只有果、没有号角（父规格的架构决策 5：三个结局各说各的话）
    if (demonOpen) playShenmoSound('fanfare')
    shenmo.choose('a')
  }

  /**
   * 菜单自己的退场播完了（T35）：App 在容器上听这条动画的结束事件，据此把那一摊摘掉
   * （机器的 `left`）。形状照结果层的 `ResultLayer.onExited` + `ResultPresence.drop`。
   *
   * **为什么是动画结束而不是定时器**：装假时钟的测试（时之狭那一份用 `page.clock`）会把
   * `setTimeout` 整个冻住，退场就永远播不完——结果层为这件事付过一遍代价
   * （`.codex/memories/result-layer.md` 第 6 条）。动画结束事件来自渲染管线，假时钟够不着
   * 它；顺带一个好处，150ms 只活在 CSS 一个地方。
   *
   * 两道判据抄 ResultLayer：`leaving` 挡掉进场那条 `shenmo-enter` 自己的结束事件（放进场
   * 时它也会冒到这颗容器上）；`event.target === event.currentTarget` 挡掉**冒泡**上来的
   * 后代动画——环的两段 30 秒、B 的破碎与四片碎渣全是这颗容器的后代，而 T27 在结果层上
   * 栽的正是「胜利标题 180ms 的后代动画在退场只播 130ms 时把层摘掉」。**不判动画名字**：
   * reduced-motion 下容器换的是淡出那一条（`shenmo-fade-out`），判据一个字都不用改。
   */
  const handleShenmoExit = (event: AnimationEvent<HTMLDivElement>): void => {
    if (shenmoStage !== 'leaving') return
    if (event.target !== event.currentTarget) return
    shenmo.left()
  }

  /**
   * 二念的两拍终局：**某一播放完了**（T36）。App 在整条游戏列上听动画结束事件，据此把节拍
   * 往前推一格（`ShenmoFall.ts` 的纯函数）——血染那一播放完才淡出，淡出那一播放完才扣下。
   *
   * 两道判据抄菜单退场与结果层那两处，一条都不能少：
   *   · `event.target === event.currentTarget`：`animationend` 会**冒泡**，而环的两条 30 秒、
   *     B 的破碎与四片碎渣、菜单自己的退场全是这一列的后代——T27 在结果层上栽的正是
   *     「胜利标题那条 180ms 的后代动画在退场只播 130ms 时把层摘掉」；
   *   · **认准动画名**：淡出那一拍在 reduced-motion 下换成只有透明度的
   *     `shenmo-fall-fade`（index.css 末尾那个 @media），两个名字都认；而这两条监听挂在
   *     同一列上，认错了名字就会把两拍并成一拍。
   */
  const handleShenmoFallEnd = (event: AnimationEvent<HTMLDivElement>): void => {
    if (event.target !== event.currentTarget) return
    if (event.animationName === 'shenmo-fall-dye') {
      fall.advance({ kind: 'finished', finished: 'dye' })
      return
    }
    if (event.animationName === 'shenmo-fall-out' || event.animationName === 'shenmo-fall-fade') {
      fall.advance({ kind: 'finished', finished: 'out' })
    }
  }

  const handleStart = (modeId: ModeId): void => {
    startRun(modeId)
  }

  const move = (direction: Direction): void => {
    const before = useGameStore.getState().game
    const previousMove = moveContext.current
    const startPositions = new Map<number, string>()
    boardRef.current?.querySelectorAll<HTMLElement>('[data-tile-id]').forEach((tile) => {
      startPositions.set(Number(tile.dataset.tileId), getComputedStyle(tile).translate)
    })
    const move = {
      direction,
      id: moveSequence.current + 1,
      steps: (previousMove?.steps ?? 0) + 1,
      startPositions,
    }
    moveContext.current = move
    storeMove(direction)
    const after = useGameStore.getState().game
    if (
      before !== null &&
      after !== null &&
      after.board !== before.board &&
      after.moves === before.moves + 1
    ) {
      moveSequence.current = move.id
    } else if (moveContext.current === move) {
      moveContext.current = previousMove
    }
  }

  // 字体状态机跟着风格走（T14）。写在 effect 里而不是 setStyle 里：store 是协调者，
  // 不该伸手摸 document（SPEC §4）。同字族之间切换时不闪 loading 的那道判据在
  // fontState 里——它按「正在观察的那一组变了没有」决定要不要重新观察
  useEffect(() => {
    recheckEffectiveFont(shellRef.current)
  }, [styleId])

  // 读一次存档（T16）。写在挂载 effect 里而不是 store 的模块初始化里：IndexedDB
  // 是异步的，模块求值那一刻什么都读不到。StrictMode 会把这个 effect 跑两遍，
  // hydrate 内部记着正在进行的读，两遍读同一份、只落一次状态。
  //
  // 顺序无关紧要：恢复出来的 styleId 若与当前不同，上面那个 effect 会因为它
  // 的依赖变了而重跑一次字体重探——恢复一套从没下载过字体的风格，走的正是
  // 「切换风格」那条已经验过的路（ADR-0005 最后一句要求的就是这件事）
  useEffect(() => {
    hydrate()
  }, [hydrate])

  // 战绩面板一收起就把焦点还给开关（T17 的面板 · T22 验收标准 1）。
  // 「收起」那枚按钮与面板一起卸载，焦点掉到 body 上，此后方向键失灵——键盘玩家
  // 每关一次面板就断一次键盘，而 SPEC §3.4 把 statistics 明确列在键盘操作范围内。
  // 鼠标玩家点一下棋盘就恢复了，所以它只在纯键盘路径上现形。
  // 判据是「焦点真的掉了」而不是「statsOpen 变了」：只在丢了焦点这一种情况下动手，
  // 否则它会从玩家正在用的别处把焦点抢走。方向与 Board.tsx 里那个 effect 同一条
  // 路子（那里还棋盘，这里还开关—— disclosures 关掉之后焦点回触发器）
  useEffect(() => {
    const wasOpen = previousStatsOpen.current
    previousStatsOpen.current = statsOpen
    // 没开关过（含挂载那一遍）与「刚打开」都不管
    if (!wasOpen || statsOpen) return
    if (document.activeElement !== document.body) return
    statsToggleRef.current?.focus()
  }, [statsOpen])

  // 结果层真被卸载时，把焦点还给棋盘（T22 的同一条约定 · T27 新添的一半）。
  //
  // T22 抓到的是「面板上的按钮随面板一起消失，焦点掉到 body，方向键从此失灵」。那条
  // 修在 Board.tsx 里，判据是「焦点真的掉了」，依赖里带 `game`。T27 之后它**不够**了：
  // 延迟卸载让层比 phase 多活 150ms，于是 Board 那个 effect 在 phase 变的那一刻跑起来
  // 时，被聚焦的按钮还在 DOM 上（它正跟着层一起淡出），判据不成立、提前返回；等层真的
  // 卸载、焦点掉到 body 时，`game` 已经不再变，那个 effect 不再跑——键盘每用一次结果层
  // 就断一次，T22 修好的那个坑被同一个改动挖了回来。
  //
  // 所以这一半放在这里，依赖换成 presence.layer：它从「有层」翻成「没有层」的那一次提交，
  // 正是层从 DOM 上消失的那一次（React 先摘节点、再跑 effect，所以此时焦点已经掉到 body）。
  // 判据与守卫抄 Board 那条：焦点没掉就不动手；拾取进行中不还（那时焦点该留给可 Tab
  // 的方块，提前拽走会把交换的键盘路径打断）。
  useEffect(() => {
    if (swapArmed || swapSelection !== null) return
    if (document.activeElement !== document.body) return
    boardRef.current?.focus({ preventScroll: true })
  }, [presence.layer, swapArmed, swapSelection])

  // 二念把整页扣下时，焦点落在「重新开始」上（T34 · 用户故事 39 的另一半）。
  //
  // 与上面两处同一条路子（T17 的战绩面板、T22 的结果层），连判据都一样：**焦点真的掉了**
  // 才动手（`activeElement === document.body`），而不是「`shenmoSecondPass` 翻了」——
  // 否则它会从玩家正在用的别处把焦点抢走。「刚扣下」与「从没扣过」也要分开，用的是上一个值。
  //
  // **T36 起判据换成「页面真的清空了」**（`pageCleared`）而不是「二念的果结出来了」：
  // 中间隔着两拍终局，而那 1200ms 里玩家点的抉择 A 还拿着焦点——在授果那一刻跑这一条，
  // `activeElement !== document.body` 会当场返回；等血染播完、整列卸载、焦点掉到 body 时，
  // `shenmoSecondPass` 已经不再变，它再也不跑。方向键不会因此失灵（键盘住在 window 上，
  // 与焦点落没落到 body 无关），所以这一条要的不是「还能用」，是「有地方可去」。
  useEffect(() => {
    // 只管「刚扣下」那一下：上一次就已经扣着，或者此刻没被扣下，都不动
    const wasCleared = previousSecondPass.current
    previousSecondPass.current = pageCleared
    if (!pageCleared || wasCleared) return
    if (document.activeElement !== document.body) return
    restartRef.current?.focus()
  }, [pageCleared])

  // 设置抽屉的焦点（T37 · 用户故事 15 / 16）。
  //
  // 打开时焦点落进抽屉、落在**容器**上（`role="dialog"` + `tabIndex={-1}`），不是落在
  // 「收起」那颗按钮上：一次误敲回车会当场把这一层关掉（父规格架构决策 7）。这一条不是
  // 「要不要移动焦点」的选择——页面内容 `inert` 之后焦点必然掉到 body，只剩「移到哪」。
  //
  // 关闭时把焦点还给入口，判据与上面三处逐字相同：**焦点真的掉了**才动手
  // （`activeElement === document.body`），否则它会从玩家正在用的别处把焦点抢走。
  // 入口与抽屉在 DOM 上不是同一支，所以两件事分成两个 effect：打开是「无条件移入」，
  // 关闭是「丢了才还」。
  useEffect(() => {
    if (!settingsOpen) return
    settingsPanelRef.current?.focus({ preventScroll: true })
  }, [settingsOpen])

  // 关闭时把焦点还给入口。**判据是「抽屉真的离开了 DOM」（drawer.mounted 翻下去），
  // 不是「settingsOpen 翻了」**——T38 起这一层比关闭多活一段退场动画：`settingsOpen`
  // 翻下去那一刻容器还在台上、还拿着焦点（`activeElement !== body`，判据不成立），等退场
  // 播完容器卸载、焦点掉到 body 时，`settingsOpen` 已经不再变，挂在它上面的 effect 再也不跑。
  // 这与结果层 T27 把依赖从 `game` 换成 `presence.layer` 是同一条教训
  // （`.codex/memories/result-layer.md` 第 7 条），区别只在于这里「在不在场上」是布尔量。
  useEffect(() => {
    const wasMounted = previousDrawerMounted.current
    previousDrawerMounted.current = drawer.mounted
    if (!wasMounted || drawer.mounted) return
    if (document.activeElement !== document.body) return
    settingsEntryRef.current?.focus({ preventScroll: true })
  }, [drawer.mounted])

  // 键盘住在 **App** 上（2026-09-28）。
  //
  // 它先在棋盘元素上，后来搬到 window，现在再往上搬到 App——因为所有者要求把「方向键不再
  // 滚页面」扩到**开局界面**，而那时还没有棋盘可挂。App 比 Board 活得久，正是这条契约该住
  // 的地方：整页、从页面加载那一刻起，方向键都是游戏的键。开局界面没有棋盘，于是前面的几个
  // 分支自然什么都不做——但**滚动照旧被挡掉**，这就是这次改动的全部内容。
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (allowsNativeKeys(event.target, boardRef.current)) return
      // 带修饰键的组合整键放行：Alt+← 是「后退」、Ctrl/⌘+← 是文字导航。挂在棋盘上时
      // 范围小、撞得少，搬到整页之后必须让开。
      if (event.ctrlKey || event.metaKey || event.altKey) return
      // 设置抽屉开着（T37）：方向键 / WASD / Z 先 `preventDefault` 再**吞掉**——不推棋、
      // 不撤销、也不滚页面（SPEC §3.4「页面只由滚轮滚动」的常驻约定）。文本入口在上面那道
      // `allowsNativeKeys` 就整键放行了，所以抽屉里将来的下拉框照旧拿得到自己的键。
      // `Esc` 关**最上面那一层**（T42 起是三层：列表 > 抽屉 > 底下的交换摊 / 神魔摊）——
      // 列表开着时只收列表（焦点回触发钮由 StyleRow 的开合 effect 接），收着才轮到抽屉。
      // 这一段排在 `game === null` **之前**：开局界面上桌也能开抽屉，那时没有棋盘，
      // 但「吞键」这件事一模一样。列表展开时 `ArrowUp/Down/Home/End` 归列表——组件自己在
      // listbox 上 preventDefault 并移 DOM 焦点（父规格决策 7 的第二个放行例外），这里的
      // 吞键对方向键是第二道（同一事件再 preventDefault 一次是无害的幂等）。
      if (settingsOpen) {
        const key = event.key.toLowerCase()
        if (key === 'escape') {
          event.preventDefault()
          if (styleListOpen) setStyleListOpen(false)
          else setSettingsOpen(false)
          return
        }
        if (MOVE_KEYS[key] || UNDO_KEYS[key]) event.preventDefault()
        return
      }
      // 开局界面（还没有这一局）与恢复中：没有棋盘可推，但方向键照样吃掉——纯观感需求，
      // 所有者要的是「页面只由滚轮滚动」，而他明确说过这一条要覆盖开局界面
      if (game === null) {
        if (MOVE_KEYS[event.key.toLowerCase()]) event.preventDefault()
        return
      }
      const key = event.key.toLowerCase()
      // Esc：取消选择并退出交换拾取（用户故事 16 的「不用指针退出」）。
      // **只在真的收着摊时才拦**：全局吞掉 Esc 会顺手吃掉浏览器的停止加载与退出全屏。
      // T29 起多一条**本地**条件——彩蛋那两颗圆钮也算「我们正收着的摊」：摊开着时收掉
      // 它正是玩家要的，菜单不挡棋，Esc 是玩家唯一的退出路径（父规格用户故事 12）。
      // 两个条件是并列的「或」，不是嵌套：两摊同时开着的概率为零（阶段一变摊就收起）。
      if (key === 'escape') {
        const swapOpen = swapArmed || swapSelection !== null
        const shenmoOpen = shenmoStage !== 'idle'
        if (swapOpen || shenmoOpen) {
          event.preventDefault()
          if (swapOpen) clearSwap()
          if (shenmoOpen) shenmo.putAway()
        }
        return
      }
      const direction = MOVE_KEYS[key]
      if (direction) {
        // 就这一句让方向键不再滚页面。所有者要的是「页面上只留滚轮」
        event.preventDefault()
        move(direction)
        // 一念神魔的旁听（T29）：**在 move 之后**。无效移动也计数——引擎对无效移动原样
        // 返回，而口令要的正是「这一下我真的按了」（父规格用户故事 2）；方向键与 WASD 在
        // MOVE_KEYS 里已经归一成同一个 direction，所以这里没有第二张表。
        // **只在 playing 里攒码**（与一念按钮、`plantWish` 的阶段守卫同一个口径）：那三个
        // 非对局阶段 `move()` 被 store 拒了，而那八下照样往机器里攒、攒满了真的召出第二个
        // 摊——宽视口两颗钮探在棋盘盒子外、点得着（还能把限时时钟按住），窄视口被 `inset: 0`
        // 的遮罩整个压住、看得见点不动，30 秒后静默消失。机器不认识阶段（它只认这一局的身份），
        // 所以这道关只能在这儿把。
        if (game.phase === 'playing') shenmo.hear(direction)
        return
      }
      if (UNDO_KEYS[key]) {
        event.preventDefault()
        undo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    game,
    move,
    undo,
    clearSwap,
    swapArmed,
    swapSelection,
    shenmo,
    shenmoStage,
    settingsOpen,
    styleListOpen,
  ])

  // 当前风格的呈现插槽。身份只有一份（目录），实现由那一套风格自己交（themes/<id>/toast.tsx）
  const Toast = getTheme(styleId).toast

  // 设置抽屉的开合（T37）。入口那一下只开（开着时它被遮罩压着，点不到第二次）；
  // 关掉有「收起」、点外侧两条在 SettingsDrawer 里，`Esc` 在键盘 effect 里——四条路径
  // 都落到同一个 setter 上，所以状态只有一个来源。关抽屉顺手把风格列表也收上（T42）：
  // 列表住在抽屉这一层里，抽屉走了它没有单独活着的理由，下次打开从收着开始。
  const openSettings = (): void => setSettingsOpen(true)
  const closeSettings = (): void => {
    setSettingsOpen(false)
    setStyleListOpen(false)
  }

  return (
    <main
      ref={shellRef}
      className="shell grid min-h-dvh place-items-center px-4 py-8"
      // 换肤机制唯一的钩子：每套风格的令牌与呈现规则都按这个属性选择
      data-style={styleId}
      // 堕落染墨（T33 起、**T36 搬了地方**）：二念的两拍终局里，三套风格各自的
      // tokens.css 里那一组「血色」的 12 个方块令牌在这个属性下生效。**落在 main 上
      // 而不是单独某个元素上**：自定义属性靠继承往下走，而棋盘在 main 的孙层；
      // 与 data-style 同一个元素、同一个作用域，也顺手让三套风格的令牌块写成
      // `[data-style='x'][data-shenmo-dim='true']` 这一种形状。React 在值为 undefined
      // 时整个属性不渲染，于是「没有染墨」就是「这个属性不在 DOM 上」。
      // **T36 起它只在二念的终局里出现**（控制人裁定：染血的触发条件是重复输入两次作弊码，
      // 不是「输错了」）。魔道那 30 秒一眼血色都没有——点过 B 之后玩家还在选，那不是入魔。
      data-shenmo-dim={falling ? 'true' : undefined}
      // 二念的悬顶在位（T32 · 父规格的架构决策 10）：外壳靠这一个属性把 toast 栈的
      // 偏移设置成「悬顶的高度 + 1rem」（index.css 里那条规则），三套主题的
      // .toast-stack 读那个变量而不是各自写死一个距离。React 在值为 undefined 时整个
      // 属性不渲染，于是悬顶没了偏移就退回 1rem——与 data-shenmo-dim 同一条路子。
      data-shenmo-pinned={shenmoSecondPass ? 'true' : undefined}
    >
      {/* 存档读不出来 / 写不进去（T16 验收标准 2）。摆在外壳最上面、开局界面与
          棋盘都看得到的地方——写入失败是在打一局的过程中冒出来的，只在开局界面
          提示等于在玩家唯一还在玩的时刻闭嘴 */}
      {storageNotice !== null && <StorageNotice notice={storageNotice} />}
      {/* 成就祝贺（ADR-0007 · 呈现插槽 ADR-0002）：当前风格自己渲染的一条短提示。
          位置/长相/消失表现全在 themes/<id>/styles.css 与 toast.tsx（设计卡 §10），
          这里只把「待呈现的几条 + 本条已结束」递过去。 */}
      <Toast toasts={toasts} onDone={dismissToast} />
      {/* 悬顶（T32 · 父规格的架构决策 10）：走火入魔那一颗成就钉在视口顶端，本局余下
          时间都在。**它不是第五条 toast**——不进计时、不自动消失、连 data-toast 都不带
          （带了就会被 toast 契约那一套断言抓住）。位置与 toast 栈共用顶端而不重叠：
          上面那个 data-shenmo-pinned 把栈的偏移设成了这条的高度。 */}
      {shenmoSecondPass && <ShenmoStrip id="shenmo-second-pass" />}
      {/* 礼炮（T30）：满屏 `position: fixed` 的 canvas（reduced-motion 下是一行静止的字）。
          T37 起它从游戏列搬到这儿，与上面两条浮层并列——抽屉开着时被 `inert` 的是
          **页面内容**，不是这些盖在页面上的浮层（父规格架构决策 6；礼炮是一个指针都不吃的
          装饰层，inert 它没有意义）。normal 情形它是 fixed，放哪儿都不动布局。
          **一条写下来的代价**：reduced-motion 下它退化成的 `<p class="cannon__still">`
          是流内元素，从「棋盘下方」搬到这儿会落到内容之上——只影响「已得一念报酬 + 要求
          少动」这一个组合，且这一行本来就没有任何测试钉它的位置（wish.spec 只断它在、
          断它的字、断它不动、断它不横向溢出）。 */}
      <Cannon granted={wishGranted} />
      {/* 页面内容（T37 · 父规格架构决策 6）：收进一个包裹元素，遮罩与抽屉留在它**外面**、
          仍在 `<main>` 里，`data-style` 令牌照旧继承。开着时整块 `inert`——指针、焦点、
          Tab 顺序一起被拿走；`inert` 不挡 window 上的 keydown，所以键盘那一段仍由下面那个
          effect 接管。
          **为什么是 `display: contents`（Tailwind 的 `contents`）**：`inert` 只能挂在 DOM
          元素上，而 main 是 `grid place-items: center`——真塞一个会生成盒子的包裹层，就把
          「分支 + 页脚两个 grid 行」并成了「一个」，启动界面上 footer 的落点当场下移。
          `contents` 不生成盒子，子元素照旧是 main 的 grid 项，于是这一步是**零布局变化**
          的前置（实测：inert 挂在它上面照样挡得住编程式焦点与指针命中，Playwright 探针
          验过——见票 T37 的验证）。 */}
      <div className="contents" inert={settingsOpen ? true : undefined}>
        {restoring ? (
          <section className="flex flex-col items-center gap-2 py-8">
            <h1 className="shell__title text-6xl">2048</h1>
            <p className="hint">正在恢复上次的一局…</p>
          </section>
        ) : game === null ? (
          <StartScreen
            onStart={handleStart}
            selectedModeId={selectedModeId}
            onSelectMode={selectMode}
            styleId={styleId}
            onStyleChange={setStyle}
          />
        ) : pageCleared ? (
          /* 二念（T32 · 父规格的架构决策 8）：**棋盘被扣下**。这一局一点没事——
             phase 还是 playing、不结算、不写记录、统计桶一格不动、规则内核一行没改，
             连 store 的字段都只是照旧躺着。这里收走的只是**渲染层那一整列**：棋盘、
             记分卡、彩蛋那两颗钮、一念的奖品、方向按钮、新游戏按钮与那行提示，一起
             不在画面上。玩家此刻唯一能做的事就是「重新开始」——而它就是新游戏
             （mode-contract §3：活跃局点它 = 放弃本局），与面板上那一颗同一个动作。
           **刷新即恢复**：session 一直持着这一局，彩蛋旗标不落盘，所以回来之后还能
             再走一次火入魔、再被扣下一次（架构决策 8 明说这是后果不是漏洞）。
           **T36 起它等多拍终局播完才出现**：血染（600ms）→ 停一拍（200ms）→ 淡出（400ms）
             之后再落到这一分支。从前「二念的果结出来」与「页面被扣下」是同一刻（T35 为此
             特批过「不等菜单退场播完」：整页被扣下本身就是那一击的动画），现在中间隔着
             1200ms，那条特例自然失效——菜单那 150ms 的退场照旧播（A 随血一起淡出去），
             而这一分支仍在两播放完之后到达，一个字节都没改。 */
          <section className="flex flex-col items-center gap-2 py-8">
            <button type="button" className="control" ref={restartRef} onClick={newGame}>
              重新开始
            </button>
          </section>
        ) : (
          <div
            className="flex flex-col items-center gap-4"
            // 二念的两拍终局（T36）：`dye` = 血染那一拍，`out` = 停一拍 + 淡出那一拍。
            // 属性落在**整列**上而不是某一块上：要淡出的是「棋盘 + 信息条 + 控制钮」这一整条
            // 游戏列（业主要的是「淡出关闭棋盘页面」），而血染的 transition 也挂在这一列的
            // 后代上（board.css 读这一个属性）。两拍由下面那个 onAnimationEnd 推进。
            data-shenmo-fall={falling ? fall.beat : undefined}
            onAnimationEnd={handleShenmoFallEnd}
          >
            <h1 className="shell__title text-5xl">2048</h1>
            {/* 限时模式的倒计时（T09）：外壳元素，与 StatusBar 平级摆着，不进 .board
                ——ADR-0002 的棋盘固定 DOM 结构不许因为一个倒计时多出节点。
                deadline 为 null 就说明这一模式不限时；结算之后表也没用了，
                剩下的「为什么结束」由 GameOverPanel 从 endReason 读，不在这里推断。
                T33 起多一个 `clockHeld`：堕落窗口开着时这一行读数不动（时之狭）。
                **T36 起终局那 1200ms 也算被按住**：玩家正在看血，不能被一声超时打断——
                而那一段结束时页面已经扣下、倒计时跟着卸载，按住的账就此不了了之（这一局
                不会再走下去，刷新也不继承它：hydrate 把两个字段归零）。 */}
            {game.deadline !== null && game.phase !== 'ended' && (
              <Countdown deadline={game.deadline} clockHeld={demonOpen || falling} />
            )}
            <StatusBar
              game={game}
              swapArmed={swapArmed}
              swapSelection={swapSelection}
              onToggleSwap={toggleSwap}
            />
            {/* 一局的结果播报（T22 验收标准 2）。只对读屏软件存在（sr-only），不抢焦点、
                不盖棋盘：它是 Shell 元素，与 StatusBar 平级。什么时候说话、说什么，
                全在 RunAnnouncement.ts 那张表里。 */}
            <RunAnnouncer game={game} />
            {/* Daily 的日期说明（T08）：写的是这一局抽题那天的 UTC 日期，跨零点也不翻篇。
                摆在外壳里，与 Board 平级——ADR-0002 的棋盘固定结构不许塞进来说明文字。 */}
            {game.modeId === 'daily' && dailyDate !== null && <DailyDateLabel date={dailyDate} />}
            {/* T42 起局中的风格选择搬进了设置抽屉（README TODO「设置界面引入」第二条）：
                页面常驻的那一组按钮摘除，「这一局的观感」现在是抽屉的第二件租客。
                开局界面的按钮组原样保留（选模式 → 选风格 → 开始 的流程仍在同一屏上，
                StartScreen 自己的那份挂载没动），换肤机制本身（data-style + setStyle）
                一字未改。 */}
            {/* 棋盘与结果层共用一个相对定位的壳。它是外壳元素（Tailwind 也只在外壳这侧），
                不能塞进 .board：那层是 ADR-0002 的固定 DOM 结构。w-fit 让这个壳正好
                裹住棋盘，结果层 inset:0 才只盖住棋盘，不会横铺整个页面。 */}
            <div className="relative w-fit">
              <Board
                game={game}
                boardRef={boardRef}
                styleId={styleId}
                moveContext={moveContext}
                onMove={move}
                swapArmed={swapArmed}
                swapSelection={swapSelection}
                onSelectCell={selectCell}
              />
              {/* 结果层（T26 的结构 · T27 的进出动效）：**一次只在场一层**，是哪一层由
                  presence 说——它比 phase 多记住一段退场时间。T26 的两条 phase 条件合成
                  这一条：`won` 与 `stuck`/`ended` 各是自己的那一处，`leaving` 是这段多出来
                  的时间，原样递进 ResultLayer（它只负责把 data-result-leaving 挂上）。
                  读数仍在两处各自现算（与 T26 逐字节相同）：退场那一刻**不**冻结它。
                  「拾取中整层收起」那条分支没有消失——它搬进了 instantHide（见上面那段）。 */}
              {presence.layer !== null && game !== null && (
                presence.layer.panel === 'win' ? (
                  <WinPanel
                    readout={resultReadout(game, records, settlementAttribution, styleId)}
                    line={resultLine}
                    onContinue={continueRun}
                    onSettle={settle}
                    onNewGame={newGame}
                    leaving={presence.leaving}
                    onExited={presence.drop}
                  />
                ) : (
                  <GameOverPanel
                    spec={presence.layer}
                    readout={resultReadout(game, records, settlementAttribution, styleId)}
                    line={resultLine}
                    onSettle={settle}
                    onNewGame={newGame}
                    onUndo={undo}
                    onSwap={toggleSwap}
                    leaving={presence.leaving}
                    onExited={presence.drop}
                  />
                )
              )}
              {/* 一念神魔的两颗圆钮（T29）。住在这个壳里而不是 .board 里：ADR-0002 的棋盘
                  固定 DOM 一个节点都不许多，而**外壳**正是「可以换实现」的那一层。
                  宽视口下它们向两侧探出棋盘自己的盒子（壳不是棋盘），窄视口下落到棋盘下一行
                  （那边棋盘两侧只剩几个像素，spec 的架构决策 12 量的就是这个）。
                  **不挡棋**：容器 pointer-events: none，只有两颗钮自己接；方向键照旧走，
                  滚动照旧被吃掉。两个窗口都由 CSS 动画驱动、animationend 收尾，没有定时器。
                  **`leaving` 也渲染**（T35）：stage 只要不在 idle，容器就在 DOM 上——机器的
                  每一条终局都先落到退场，等那条退场动画播完（`handleShenmoExit` → 机器的
                  `left`）才真的离开。于是「此刻场上有没有这一摊」不再等于「机器此刻在哪个
                  阶段」，与结果层 T27 起「phase 意味着那一层、层比 phase 多活一段退场」
                  是同一条规矩。 */}
              {shenmoStage !== 'idle' && (
                <div
                  className="shenmo"
                  // 报的是**看得见的那一档**：退场中它是 `leavingFrom`（机器记住的「刚才还在
                  // 这一档」），挂在 `choice` / `ring` 上的两条窗口动画于是照旧放到容器淡出去
                  // 的那一刻——环还在渐薄，不会中途被抽走
                  data-shenmo-stage={shenmoVisibleStage}
                  // 退场的总开关（照 `.overlay[data-result-leaving]` 那条，ADR-0008 决策 9）：
                  // 指针当场交出去、动画换成退场那一组。它与 stage 变在**同一次提交**里落到
                  // DOM——这里读的是机器这一帧的状态，渲染期就定好了，没有 effect 中间那一帧
                  // （决策 9 为结果层立的最重要一条：多出一帧「层还在、还接指针」，继续玩之后
                  // 马上划一下的玩家就会对着不动的棋盘发懵）
                  data-shenmo-leaving={shenmoStage === 'leaving' ? 'true' : undefined}
                  onAnimationEnd={handleShenmoExit}
                >
                  <button
                    type="button"
                    className="shenmo__button"
                    data-shenmo-button="a"
                    aria-label="抉择 A"
                    onClick={() => chooseShenmo('a')}
                  >
                    A
                    {/* 那道环：两个 30 秒都挂在它身上。第一段（谁都没点）它不可见，
                        第二段（只剩 A）它渐薄——「一个元素、两条路径」是 spec 架构决策 3
                        特意要的形状，因为两个窗口都得有个动画可听。
                        判 event.target === event.currentTarget：animationend 会冒泡，
                        而 B 的破碎动画正是它的同类——不判的话 B 碎一下会被当成窗口到期。 */}
                    <span
                      className="shenmo__ring"
                      aria-hidden="true"
                      onAnimationEnd={(event) => {
                        if (event.target !== event.currentTarget) return
                        // 名字即身份：两条 30 秒各有一套关键帧，所以「哪一段到头了」
                        // 由动画自己说，不必再问此刻的阶段
                        const which = event.animationName === 'shenmo-window' ? 1 : 2
                        shenmo.windowDone(which)
                      }}
                    />
                  </button>
                  {shenmoVisibleStage !== 'ring' && (
                    <button
                      type="button"
                      className="shenmo__button"
                      data-shenmo-button="b"
                      // 破碎退场进行中：这一下是空气（机器与那一声都不再理会它），
                      // 动画一结束机器切到「只剩 A」
                      data-shenmo-breaking={shenmoVisibleStage === 'breaking' ? 'true' : undefined}
                      aria-label="抉择 B"
                      onClick={() => chooseShenmo('b')}
                      onAnimationEnd={(event) => {
                        if (event.target !== event.currentTarget) return
                        if (event.animationName !== 'shenmo-break-fade') return
                        shenmo.broke()
                      }}
                    >
                      B
                      {/* 四片碎渣（T34）：450ms 的破碎退场里各带一个 B、错开起跑朝自己的
                          对角飞走。只在 breaking 时挂载，装饰、不进无障碍树。
                          **它们的 animationend 也会冒泡到这颗按钮上**（四片各播一条动画）。
                          四条动画的名字与 `shenmo-break-fade` 不同，所以 `animationName`
                          那道判据今天就把它们挡掉了；而 `event.target !== event.currentTarget`
                          是承重墙——T27 的教训正是「后代的动画结束事件冒泡上来冒充祖先的」，
                          将来谁给碎片改个名、或给按钮自己加第二条动画，最先漏的就是这一道。 */}
                      {shenmoVisibleStage === 'breaking' &&
                        SHENMO_SHARDS.map((shard) => (
                          <span
                            key={shard}
                            className="shenmo__shard"
                            data-shenmo-shard={shard}
                            aria-hidden="true"
                          />
                        ))}
                    </button>
                  )}
                </div>
              )}
            </div>
            {/* 一念的两件报酬（T30）：**那颗按钮**摆在这儿。礼炮（`<Cannon>`）T37 起搬到
                main 下的浮层那一段去了（抽屉开着时它不该被 inert）——按钮仍是「机器答话
                之后递给你的东西」，贴着棋盘出现；从棋盘 Tab 出去，下一个停靠点就是它
                （用户故事 39：彩蛋不是鼠标专属）。 */}
            {/* 非 playing 阶段无效（用户故事 24）。与「新游戏」同一个形状——直接不渲染，
                而不是一颗点不动的灰按钮：面板露头时摆一颗不能用的钮，就是在骗人。 */}
            {game.phase === 'playing' && wishGranted && (
              <button type="button" className="wish" onClick={plantWish}>
                一念神魔
              </button>
            )}
            {/* 屏幕方向按钮（T10）：外壳元素，与 Board 平级——ADR-0002 的棋盘固定
                DOM 不增节点。只在触摸设备显示（styles.css 的 pointer: coarse），
                桌面端连布局都不占。它调的是同一个 move，与键盘、滑动共用一条派发
                路径。 */}
            <DirectionPad onMove={move} />
            {/* 面板露头时它自己带「新游戏」入口；这里再摆一个会同名重歧，
                所以在活跃局才显示（mode-contract §3：活跃局直接新游戏 = 放弃本局）。
                移动键提示同理：面板露着（won / stuck / ended）时方向键一概是空操作，
                摆着这句提示就是在骗人，所以它跟按钮共用一个 phase 条件。 */}
            {game.phase === 'playing' && (
              <>
                <button type="button" className="control" onClick={newGame}>
                  新游戏
                </button>
                <p className="hint">
                  {/* 两句话按输入设备二选一（T10）：触摸设备上没有方向键也没有 WASD，
                      摆着那一版是在骗人。判据与方向按钮同一条 pointer: coarse。
                      Z 撤销只写在前一句里：键盘用户才用得上它，触摸设备的撤销入口是
                      死局面板上的「撤销」按钮。快捷键不写出来等于没有——这票加的就是
                      一条没人告诉玩家的隐藏键。 */}
                  <span className="hint__pointer">方向键或 WASD 移动方块，Z 撤销</span>
                  <span className="hint__touch">滑动或点方向按钮移动方块</span>
                </p>
              </>
            )}
          </div>
        )}

        {/* 战绩与统计（T17 · 用户故事 22）。摆在两个分支**外面**：开局前看得到
            「上一局留下了什么」，局中也看得到，而入口只有一个——同一个组件、同一个
            按钮，不按 phase 分叉。它是 `.board` 的兄弟（ADR-0002 的固定 DOM 不许
            往棋盘里塞东西），所以打开它不盖棋盘、也不打断这一局；键盘到达它走普通
            Tab 顺序，不带 autofocus——一把焦点从棋盘上拽走，玩家会以为这局被打断了。
            **二念扣下时它也收起来**（T32）：那一页清到只剩一个重开按钮、视口顶端那条悬顶，
            以及右上角那**一个设置入口**（**2026-10-09 修订**：设置入口恒可见，所以那一页不再
            是「只剩一颗重新开始」），而这些入口属于一个还能打的一局。**判据是 `pageCleared`
            而不是「二念的果结出来了」**（T36）：两拍终局那 1200ms 里整列还在台上，入口该跟着它
            一起淡出——先一步消失会留下一帧「棋盘还在、统计入口没了」的半成品画面。
            存档读写出错的那条提示不在此列——它是故障，
            任何时候都不该被藏起来。 */}
        {!restoring && !pageCleared && (
          <div className="mt-4 flex flex-col items-center gap-4">
            {/* 静音开关（T20）**T39 起搬进了抽屉**：它现在是那层壳里的第一件设置
                （左静态标签 + 右开关的一行），不再是这场里的一颗裸按钮。
                store 的字段、落盘与语义一个都没动——只换了位置与长相。 */}
            <button
              type="button"
              className="control"
              ref={statsToggleRef}
              aria-expanded={statsOpen}
              onClick={() => setStatsOpen((open) => !open)}
            >
              战绩与统计
            </button>
            {statsOpen && (
              <StatsPanel records={records} stats={stats} onClose={() => setStatsOpen(false)} />
            )}
          </div>
        )}

        {/* 设置入口（T37 · 父规格架构决策 4）：**恒可见**——开局界面、局中、结果层在场、
            二念扣下都在同一个位置，唯一例外是读档中（`restoring`）：那一刻改的设置会被
            盘上那份覆盖回去，把这个窗口藏起来才够不着它。
            它住在**页面内容这一段里**：开着抽屉时会被 `inert` 一并收走——「开着」这件事
            由抽屉自己说，而入口此刻压在遮罩底下、点它也只会点到遮罩上（父规格决策 8）。 */}
        {!restoring && (
          <SettingsEntry open={settingsOpen} onOpen={openSettings} entryRef={settingsEntryRef} />
        )}
      </div>

      {/* 遮罩 + 抽屉（T37 的结构 · T38 的进出）：留在包裹元素**之外**（`inert` 不该盖住
          这一层自己），仍在 `<main>` 里——`data-style` 令牌照旧继承。
          **挂载条件换成 `drawer.mounted` 而不是 `settingsOpen`**：关掉之后容器还要多活一段
          退场动画（那台裁决在 DrawerPresence.ts），退场动画结束时它自己上报 `onExited`
          （`drawer.drop`）才卸载。`leaving` 由 App 递进去，只用来挂 `data-settings-leaving`。 */}
      {drawer.mounted && (
        <SettingsDrawer
          onClose={closeSettings}
          panelRef={settingsPanelRef}
          leaving={drawer.leaving}
          onExited={drawer.drop}
          muted={mute}
          onToggle={setMute}
          styleId={styleId}
          onStyleChange={setStyle}
          styleListOpen={styleListOpen}
          onStyleListOpenChange={setStyleListOpen}
        />
      )}
    </main>
  )
}
