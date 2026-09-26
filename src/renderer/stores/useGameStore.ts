import { create } from 'zustand'
import type { Direction, GameState, StyleId } from '../../shared/types'
import type { ModeId } from '../../shared/modes'
import { DEFAULT_MODE_ID } from '../../shared/modes'
import type { Coordinate } from '../../game/board'
import { DEFAULT_THEME_ID } from '../styles/themes'
import {
  abandon,
  continueRun,
  createGame,
  move,
  settle,
  swap,
  tick,
} from '../../game/engine'
import { seedFromUtcDate } from '../../shared/rng'
import { fixtureFromQuery } from './fixture'
import { seedFromSearch } from './seed'
import {
  assembleSession,
  decodeSession,
  decodeSettings,
  encodeSession,
  encodeSettings,
  storageUnavailableNotice,
  restoreNotice,
  writeFailureMessage,
  type HistoryDelta,
  type RestoredSession,
  type SessionSnapshot,
  type StorageNotice,
} from './session'
import {
  clearRun,
  readHistoryRaw,
  readSessionRaw,
  readSettingsRaw,
  saveRun,
  writeSettings,
} from './sessionStore'

/**
 * 唯一的 Zustand store（SPEC §4：无 slice、无中间件）
 *
 * 它是**协调者，不是第二套规则引擎**：只负责调 createGame / move / continueRun /
 * settle / tick / abandon / swap 并把结果收着，一切规则判断（含 phase 迁移、到点
 * 该不该结算、一次交换该不该解锁死局）都在 src/game/ 里。
 *
 * 它同时是**读钟的那一方**（ADR-0001）：Math.random 与 UTC 日期都在这里取，
 * src/game/ 与 src/shared/ 里一行 Date 都没有。
 */
export interface GameStore {
  game: GameState | null // null = 尚未开局
  /**
   * 前一状态栈。索引 0 是本局第一次有效移动之前的那一个状态，越往后越新。
   *
   * 无上限、不截断、不做环形缓冲（ADR-0003：撤销要能一路回到开局，「第 N 步之前
   * 是什么」必须全在）。`startRun` 与 `newGame` 把它清空——开局棋盘就是 `game`
   * 自己，历史里没有比它更早的东西，所以**从开局撤销不可能，也不会绕回第 N 步**。
   */
  history: readonly GameState[]
  /**
   * Daily 这一局的 UTC 日期串（'YYYY-MM-DD'）；非 Daily 模式为 null
   *
   * 为什么它不住进 GameState：它是**外壳要显示的一句话**，不是规则数据。规则数据是
   * initialSeed（种子本身），而日期串从种子里反推不回来（哈希是单向的），所以开局抽题
   * 那一刻由 store 把它收着。也正因如此它记的是「这一局抽题那天的日期」，不是渲染时
   * 现算的今天——跨过 UTC 零点之后，昨天开的那局标签不能跟着翻篇。
   */
  dailyDate: string | null
  /**
   * 开局界面选中的那一个模式（T16 进 settings 桶）
   *
   * 与 game.modeId 问的不是同一个问题：这一字段是「玩家在开局界面上选了哪个」，
   * game.modeId 是「这一局在打哪个」。两处都要有，因为 SPEC §3.3 的 settings 桶
   * 存 selected mode，而 session 桶存这一局——刷新之后回到开局界面时，选中的
   * 那个模式还该是玩家上次选的那个，不该每次都被重置回经典。
   */
  selectedModeId: ModeId
  /**
   * 交换选择态：已经被拾取、等待第二枚的那一枚方块（零基 [row, col]）。
   * null = 此刻没有待确认的选择。
   *
   * **为什么它不住进 GameState**：它是一次进行中的意图，不是这局的规则数据。
   * 规则数据是引擎认的那十个字段（src/shared/types.ts）；把一个「我正打算换哪两枚」
   * 塞进去，等于让 T16 持久化一个半截编辑、让 T17 的重放读到一次不存在的迁移。
   * 因此它也不被撤销恢复——撤销搬回的是完整前态（含 phase），选择是界面自己的事。
   */
  swapSelection: Coordinate | null
  /**
   * 交换拾取模式是否开着：开着时棋盘上的数值方块才可被拾取（Tab 停靠 + 轻点选中）。
   *
   * 为什么不能只靠 swapSelection：死局时 `.overlay` 是不透明满盖
   * （styles.css 的 inset:0 + 实底），面板不收起就点不到方块，指针那条路直接断；
   * 而活跃局里需要一个明确的入口，否则随手点两枚方块就是一次不可预期的交换。
   * 与 swapSelection 一样：不进 GameState、不进历史、不持久化（T16 存的是这一局，
   * 不是一个还没做完的编辑）。
   */
  swapArmed: boolean
  /**
   * 当前风格（T13）。开局前与局中都能改，改完只换呈现。
   *
   * 为什么它住在 store 而不是 GameState：它是**界面状态**，不是这一局的规则数据。
   * GameState 的字段（src/shared/types.ts）由引擎认领，塞一个 styleId 进去等于让
   * T16 持久化一次外观选择、让 T17 的重放把它当成一次状态迁移。SPEC §3.2 也把话说死了：
   * 风格不能改变规则、分数、计时器，以及控件的无障碍含义。
   *
   * 切换的代价因此只有**一个字段**：setStyle 只写 styleId，game / history / dailyDate /
   * swapArmed / swapSelection 一个都不碰、连对象都不新建——所以 zustand 那边 board 收到
   * 的还是同一个 game 引用，React 会把棋盘那一层整个跳过去。tests/unit/style-switch.test.ts
   * 钉的正是这一整张字段表。
   */
  styleId: StyleId
  /** 换开局界面上选中的模式（T16：写 settings 桶）。不改动已经开的那一局 */
  selectMode(id: ModeId): void
  /** 换风格。只改呈现；同一 id 重复调用连 state 都不换 */
  setStyle(id: StyleId): void
  /** 开 / 关交换拾取。StatusBar 与死局面板的那两个按钮调的是同一个动作 */
  toggleSwap(): void
  /**
   * 拾取一枚方块：第一枚记下；同一枚再拾一次是取消；不同的一枚完成这次交换。
   * 非法组合（墙 / 空格，以及已终局）什么都不发生——连 state 都不换
   */
  selectCell(coordinate: Coordinate): void
  /** Esc：取消选择并退出拾取（用户故事 16 的「不用指针退出交换」） */
  clearSwap(): void
  startRun(modeId: ModeId): void
  move(direction: Direction): void
  /** 撤销一步：把栈顶那个完整前态搬回 game。空栈与已结算都是原样返回 */
  undo(): void
  /** 从胜利面板继续玩：分数与棋盘保留，phase 由引擎判回 playing 还是 stuck */
  continueRun(): void
  /** 结束并记录：死局与胜利面板都进得去；幂等（结算只执行一次） */
  settle(): void
  /** 时间推进到当前时刻：到期由引擎强制结算。未到期与非限时模式都是空操作 */
  tick(): void
  /** 放弃当前局并开新局。活跃局直接新游戏 = 放弃本局，不写任何记录 */
  newGame(): void
  /**
   * 存档与恢复的状态：界面上那一句提示（T16 验收标准 2）
   *
   * null = 一切正常。非空的两种情形：存档读不出来（旧版 / 损坏 / 形状不对），
   * 以及**写不进去**。写入失败那句话必须说的是实话——页面内的撤销一条都没少，
   * 但刷新之后这一局可能续不上（mode-contract §4 的原话口径）。
   */
  storageNotice: StorageNotice | null
  /**
   * 是否还在读存档。true 时界面显示「正在恢复」，不显示开局界面
   *
   * 初值就是 true：读存档要异步跑几步（打开数据库 → 读 settings → 读 session →
   * 读撤销历史），这几步里先把开局界面画出来再撤掉，玩家看见的就是一次
   * 「我的一局好像没了」的闪烁。宁可先亮一句「正在恢复」。
   */
  restoring: boolean
  /** 读一次存档并落到 store 上。App 挂载时调一次（T16） */
  hydrate(): void
}

/** 同一格。坐标是零基 [row, col]，逐位比即可 */
function sameCell(a: Coordinate, b: Coordinate): boolean {
  return a[0] === b[0] && a[1] === b[1]
}

/** 抽一个随机种子 */
function drawSeed(): number {
  return Math.floor(Math.random() * 0xffffffff)
}

/**
 * 今天（UTC）的日期串，`'YYYY-MM-DD'`
 *
 * 只认 UTC：Daily 的承诺是「同一个 UTC 日期全球同一题」，本地时区一掺进来，
 * 东半球与西半球就会在不同的日期上抽题。toISOString 本身就是 UTC 口径。
 */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Daily 抽题：日期串 → 种子，连它要显示的那句话一起交出来 */
function drawDailySeed(): { seed: number; date: string } {
  const date = todayUtc()
  return { seed: seedFromUtcDate(date), date }
}

/**
 * 一次写盘失败：把平台错误翻成界面上那一句，并让它露出来（验收标准 2）
 *
 * 用的是 `useGameStore.setState` 而不是闭包里的 `set`：这些写盘发生在动作里，
 * 而写盘失败这件事与「哪一个动作触发的」无关，界面只需要知道存不进去了。
 */
function reportWriteFailure(error: unknown): void {
  useGameStore.setState({
    storageNotice: { kind: 'write-failed', message: writeFailureMessage(error) },
  })
}

/** 写 settings 桶（SPEC §3.3 第一个桶）。一条小记录，每步 O(1) */
function persistSettings(modeId: ModeId, styleId: StyleId): void {
  void writeSettings(encodeSettings(modeId, styleId)).catch(reportWriteFailure)
}

/**
 * 写这一局：session 记录 + 撤销历史的那一步
 *
 * 写在动作的 set() 里面而不是 set() 之后：那样每个动作都要先把 patch 算一遍再
 * 落一遍。这里的写是**幂等**的——记录里装的是「即将提交的那个状态」的全文，
 * 同一段写两遍字节完全相同，所以从 updater 里发出去也安全。
 *
 * 每步的字节量与撤销栈的深度无关（T11 实测的是「每步把整条历史重新序列化一遍」
 * 那一项不可接受，约 30 GB 累计；保留完整前态这件事本身是线性的，每份约 572 B）。
 * 详见 sessionStore.ts 的 saveRun。
 */
function persistSession(snapshot: SessionSnapshot, delta: HistoryDelta): void {
  void saveRun(encodeSession(snapshot), delta).catch(reportWriteFailure)
}

/** 作废这一局的存档：session 记录 + 整条撤销历史 */
function clearPersistedRun(): void {
  void clearRun().catch(reportWriteFailure)
}

/** 正在进行的读存档。StrictMode 会把挂载 effect 跑两遍，两遍读同一份 */
let hydration: Promise<void> | null = null

/**
 * 读一次存档，把能用的落到 store 上（SPEC §3.3 的三个桶，本 Ticket 只读前两个）
 *
 * 四步：读 settings → 读 session → 读撤销历史 → 落状态。任何一步读不出来都不
 * 假装：设置坏了回到默认值并说出来，一局坏了不开这一局并说出来。
 *
 * 已结算的一局（phase === 'ended'）**安静作废**，不算损坏：ended 之后撤销与
 * 交换一律不可用（mode-contract §3 关键不变量 4），所以那一局没有可恢复的东西。
 * 留着它，下一次加载会还原出一块死棋盘而不是开局界面。结算数据在 records 桶
 * （T17），那才是「已结算数据」，本 Ticket 从不碰它。
 */
async function doHydrate(): Promise<void> {
  let settings: { modeId: ModeId; styleId: StyleId } | null = null
  let settingsNotice: StorageNotice | null = null
  let sessionNotice: StorageNotice | null = null
  let restored: RestoredSession | null = null

  try {
    const rawSettings = await readSettingsRaw()
    const parsedSettings = decodeSettings(rawSettings)
    if (parsedSettings.kind === 'ok') {
      settings = {
        modeId: parsedSettings.record.modeId,
        styleId: parsedSettings.record.styleId,
      }
    } else if (parsedSettings.kind === 'rejected') {
      settingsNotice = restoreNotice(parsedSettings.reason, 'settings')
    }

    const rawSession = await readSessionRaw()
    const parsedSession = decodeSession(rawSession)
    if (parsedSession.kind === 'ok') {
      if (parsedSession.record.game.phase === 'ended') {
        clearPersistedRun()
      } else {
        const rawHistory = await readHistoryRaw(parsedSession.record.historyLength)
        restored = assembleSession(parsedSession.record, rawHistory)
        // 组装不出来 = 撤销路径不完整（条数少了 / 某一条形状不对）。
        // 那种存档**不算可恢复**：ADR-0003 禁的就是悄悄丢历史
        if (restored === null) sessionNotice = restoreNotice('shape', 'session')
      }
    } else if (parsedSession.kind === 'rejected') {
      sessionNotice = restoreNotice(parsedSession.reason, 'session')
    }
  } catch {
    // 连存储都打不开（隐私模式 / 存储被禁用）：这一局无从恢复。
    // 这同样是「不假装」——界面要说的是恢复没发生，而不是安静开一局新的
    sessionNotice = storageUnavailableNotice()
  }

  // 一局的恢复结果比设置更值得说：设置坏了还能默认着玩，一局坏了玩家要知道
  const notice = sessionNotice ?? settingsNotice

  useGameStore.setState((state) => {
    // 读存档是异步的，这几步里玩家可能已经点了「开始游戏」。那一刻之后不许再把
    // 存档盖上去——那等于把玩家刚开的一局换成另一局（读写竞态，不是理论风险：
    // 开局界面就在第一帧，玩家完全点得比读存档快）
    if (state.game !== null) return { restoring: false }
    const patch: Partial<GameStore> = {
      restoring: false,
      storageNotice: notice,
      selectedModeId: settings?.modeId ?? state.selectedModeId,
      // 这一局自己的风格优先于设置里的那个：session 桶存的是「这一局的观感」
      styleId: restored?.styleId ?? settings?.styleId ?? state.styleId,
    }
    if (restored !== null) {
      patch.game = restored.game
      patch.history = restored.history
      patch.dailyDate = restored.dailyDate
      // 拾取态与选择态刻意不恢复：它们是一次做了一半的编辑，不是这一局的规则数据
      // （swapArmed / swapSelection 的注释写的就是这件事）。恢复一个
      // swapArmed: true 会让刷新后的每枚方块都挂着可选中样式，却没有任何
      // 解释得清的入口把它收掉
      patch.swapArmed = false
      patch.swapSelection = null
    }
    return patch
  })
}

export const useGameStore = create<GameStore>()((set) => ({
  game: null,
  dailyDate: null,
  // 还没开局，也就没有历史可言：空栈让开局后的第一次撤销必然空操作
  history: [],
  // 默认经典风格。它不随开局清空——玩家选好的观感应跟着他，不该每开一局被重置回 classic
  styleId: DEFAULT_THEME_ID,
  // 开局界面上的选中项与风格同一性质：刷新之后该还选着玩家上次选的那个（T16 的
  // settings 桶）。它不随开局清空，也不受新游戏影响——选过什么模式是「设置」，
  // 不是「这一局在打哪个模式」
  selectedModeId: DEFAULT_MODE_ID,
  selectMode: (id) => {
    set((state) => {
      if (state.selectedModeId === id) return state
      // 开局界面选中的模式只进 settings 桶，不动 session：后者存的是这一局
      // （SPEC §3.3 两个桶各存各的）。写在同一处，于是「选了哪个模式」与
      // 「选了哪套风格」走的是同一条路径，不存在第二套只写一半的逻辑
      persistSettings(id, state.styleId)
      return { selectedModeId: id }
    })
  },
  setStyle: (id) => {
    set((state) => {
      if (state.styleId === id) return state
      // 风格同时是「设置」与「这一局的观感」：SPEC §3.3 的 settings 与 session
      // 两个桶都列了 selected style，所以两边都写。session 那一份只在本局存在时
      // 写——开局界面上的选择没有一局可挂，而「还没开局」与「这一局是空的」
      // 在存档里是同一件事
      persistSettings(state.selectedModeId, id)
      if (state.game !== null) {
        persistSession(
          {
            game: state.game,
            dailyDate: state.dailyDate,
            styleId: id,
            historyLength: state.history.length,
          },
          { kind: 'none' }
        )
      }
      return { styleId: id }
    })
  },
  // 还没开局：没有拾取、也没有选择
  swapArmed: false,
  swapSelection: null,
  toggleSwap: () => {
    set((state) => ({
      swapArmed: !state.swapArmed,
      // 关掉的那一刻选择一并作废：拾取目标都没了，半个选择留着只会误导
      swapSelection: null,
    }))
  },
  selectCell: (coordinate) => {
    set((state) => {
      const game = state.game
      // 三道门：没开局、没在拾取态、已终局。最后一道是 T11 留下的那道 ended 守卫
      // （useGameStore.undo 里同一条注释），mode-contract §3 用它同时挡 Undo 与交换
      // ——两处共用一条规则，而不是面板各自判断一遍
      if (!game || !state.swapArmed || game.phase === 'ended') return state
      // 同一枚再拾一次 = 取消（ticket 验收标准 1）。只清选择、不关拾取：
      // 玩家可以立刻另选一枚，不必重新走一遍入口
      if (state.swapSelection !== null && sameCell(state.swapSelection, coordinate)) {
        return { ...state, swapSelection: null }
      }
      // 第一枚：只记选择。棋盘一个格子都不动，也不进历史
      if (state.swapSelection === null) return { ...state, swapSelection: coordinate }
      // 第二枚：规则判断全在引擎里。null = 非法组合（墙 / 空格 / 越界），
      // 于是既不加历史也不换 state——选择原样留着，玩家可以改选别的一枚
      const swapped = swap(game, state.swapSelection, coordinate)
      if (swapped === null) return state
      // 与 move 进历史同一条路子：先走通的才把**操作前**那个完整前态压栈
      const history = [...state.history, game]
      // 一次交换照样只写一条：它移动了两枚方块、不改任何规则量（T12），
      // 所以存档形状与 move 完全相同——session 记录 + 新压栈的那一条前态
      persistSession(
        {
          game: swapped,
          dailyDate: state.dailyDate,
          styleId: state.styleId,
          historyLength: history.length,
        },
        { kind: 'push', index: history.length - 1, game }
      )
      return {
        game: swapped,
        history,
        // 一次拾取只完成一次交换：收摊。ESC、一次移动、撤销同样收摊（见各动作）
        swapArmed: false,
        swapSelection: null,
      }
    })
  },
  clearSwap: () => {
    set((state) =>
      state.swapArmed || state.swapSelection !== null
        ? { swapArmed: false, swapSelection: null }
        : state
    )
  },
  startRun: (modeId) => {
    // 种子在这里抽：store 是调用方，Math.random 与 UTC 日期都由它取
    // （ADR-0001 禁的是 src/game/ 自己抽，不是禁调用方抽）。
    // Daily 用 UTC 日期推导，其余模式才看 ?seed=（解析与理由见 ./seed：它是调试 /
    // 验收的确定性入口，SPEC §6 无服务器、无排行榜，所以不是作弊面）。
    const daily = modeId === 'daily' ? drawDailySeed() : null
    const seed = daily?.seed ?? seedFromSearch(window.location.search) ?? drawSeed()
    // 时钟也在这里取：createGame 与开局夹具都只吃一个注入的 now，src/game/ 里
    // 一行 Date 都没有（ADR-0001）。限时模式的 deadline 由这个 now 决定，
    // 非限时模式忽略它。
    const now = Date.now()
    // 开局局面夹具：?board= 给了合法局面就从那开局（T04 的终局 e2e 靠它复现局面，
    // 后续每一步仍走真实按键与真实内核）。只有开局读它——「新游戏」用的是 drawSeed。
    const game =
      fixtureFromQuery(window.location.search, modeId, seed, now) ??
      createGame(modeId, seed, now)
    const dailyDate = daily?.date ?? null
    // 风格不改：开局界面选的就是这一局要用的那一个（T13），所以存档里也跟着走
    const styleId = useGameStore.getState().styleId
    set({
      game,
      dailyDate,
      // 每一局的历史从空开始：开局棋盘就是 game 自己，往前没有更早的状态。
      // 「新游戏」同样在这里清空（见 newGame），否则新一局能撤回到上一局去。
      history: [],
      // 上一局没做完的交换拾取不带到新一局来：拾取态与选择都是
      // 「本局此刻的界面状态」，与历史同一个边界
      swapArmed: false,
      swapSelection: null,
    })
    // reset：上一局的撤销历史整条作废。这是「新游戏不擦除已结算数据」的另一半——
    // 被擦的只有 session 与 history 两个桶，records / stats（T17）一个字节都不碰
    persistSession({ game, dailyDate, styleId, historyLength: 0 }, { kind: 'reset' })
  },
  move: (direction) => {
    set((state) => {
      if (!state.game) return state
      const outcome = move(state.game, direction)
      // 无效移动连 state 都不换：React 看到同一个对象就直接跳过重渲染。
      // 面板挡着（won / stuck / ended）时 move 也返回同一个对象，同理。
      if (!outcome.changed) return state
      // 只有真的走通了一步，才把**移动前**那个状态收进历史。判据就是 changed：
      // 无效移动时引擎原样返回同一个引用（engine.move 的两条早退），所以「棋盘
      // 根本没变」已经包含在 changed 里，再补一道引用比较是多余的。这条性质由
      // tests/unit/undo.test.ts 钉着，不在这里靠「相信引擎」活着。
      //
      // 展开成新数组而不是 push：history 对外是 readonly，原地改会绕过 zustand
      // 的引用相等比较，撤销后的重渲染就漏了。代价是每次 O(n)——长局因此是
      // O(n²)，mode-contract §4 要求实测这个成本（task-11 的测量那一笔），
      // 现在既没有上限也没有环形缓冲，ADR-0003 禁的就是悄悄丢历史。
      //
      // 交换拾取一并收摊：棋盘变了，等第二枚的那一枚已经不在玩家以为的地方，
      // 半个选择继续摆在屏幕上就是在骗人。无效移动走的是上面那条早退，
      // 什么都不发生，于是也不该清掉任何东西
      const history = [...state.history, state.game]
      // 一次有效移动只写两条：session 记录 + 新压栈的那一个前态。栈多深都不多写
      // （T11 实测出不可接受的是每步把整条历史重新序列化一遍，那件事在这里不做）
      persistSession(
        {
          game: outcome.state,
          dailyDate: state.dailyDate,
          styleId: state.styleId,
          historyLength: history.length,
        },
        { kind: 'push', index: history.length - 1, game: state.game }
      )
      return {
        game: outcome.state,
        history,
        swapArmed: false,
        swapSelection: null,
      }
    })
  },
  undo: () => {
    set((state) => {
      if (!state.game) return state
      // 空栈 = 已经撤回开局（开局棋盘就是 game 自己），原样返回：
      // 绝不能绕回第 N 步，那等于把开局和历史尾巴缝成一个环。
      if (state.history.length === 0) return state
      // mode-contract §3：「进入 ended 后，Undo 与作弊交换一律不可用」。
      // 三个终局原因（deadlock / abandoned / timeout）共用这一条守卫。
      // 写在 store 而不是面板里，是因为 T12 的作弊交换要的是同一条守卫——
      // 面板各自判断的话，那条规则在仓库里就会出现两份。
      if (state.game.phase === 'ended') return state
      // 弹栈顶，不递归：栈是数组，一步撤销就是换两个字段。
      // stuck 不是终局（mode-contract §3），所以死局面板上的「撤销」走这条路。
      // 拾取态与选择一并收摊，理由同 move：棋盘回退了一格，
      // 「等第二枚的那一枚」这个意图已经不对着任何真实的东西了
      const history = state.history.slice(0, -1)
      // 撤销同样只写两条：session 记录 + 删掉刚刚弹出的那一条前态。
      // 索引就是新栈的长度——被弹掉的那一条原来就在这个位置上
      persistSession(
        {
          game: state.history[state.history.length - 1],
          dailyDate: state.dailyDate,
          styleId: state.styleId,
          historyLength: history.length,
        },
        { kind: 'pop', index: history.length }
      )
      return {
        game: state.history[state.history.length - 1],
        history,
        swapArmed: false,
        swapSelection: null,
      }
    })
  },
  continueRun: () => {
    set((state) => {
      if (!state.game) return state
      // 引擎自己判断「续走即死局」该不该转去 stuck，store 只收结果
      const next = continueRun(state.game)
      // phase 变了才写：引用相等即「什么都没发生」，与 move 的无效移动同一条路子
      if (next !== state.game) {
        persistSession(
          {
            game: next,
            dailyDate: state.dailyDate,
            styleId: state.styleId,
            historyLength: state.history.length,
          },
          { kind: 'none' }
        )
      }
      return { game: next }
    })
  },
  settle: () => {
    set((state) => {
      if (!state.game) return state
      // 幂等：再点一次返回同一个对象，store 收着同一引用，界面什么都不发生
      const next = settle(state.game)
      if (next === state.game) return state
      // 结算之后这一局没有可恢复的东西（ended 之后撤销与交换一律不可用，
      // mode-contract §3 关键不变量 4），所以存档一起作废：下一次加载回到开局
      // 界面，而不是还原一块死棋盘。被擦的只有 session 与 history 两个桶——
      // 「已结算数据」在 records 桶（T17），本 Ticket 从不碰它
      if (next.phase === 'ended') {
        clearPersistedRun()
      } else {
        persistSession(
          {
            game: next,
            dailyDate: state.dailyDate,
            styleId: state.styleId,
            historyLength: state.history.length,
          },
          { kind: 'none' }
        )
      }
      return { game: next }
    })
  },
  tick: () => {
    set((state) => {
      if (!state.game) return state
      const next = tick(state.game, Date.now())
      // 没到期（或非限时、或已不在 playing）时引擎原样返回同一个对象：这里连新
      // state 都不造。与 move 的无效移动同一条路子——引用相等即「什么都没发生」，
      // zustand 的选择器因此不会触发重渲染，倒计时的读表也就不打扰棋盘那一层。
      if (next === state.game) return state
      // 到点强制结算是「离开本局」的一条路，于是与 move / undo / startRun /
      // newGame 同一条边界：拾取态与选择一并收摊。少了这一行，Time Attack 到点
      // 之后会留下 swapArmed: true 配 phase: 'ended'——方块还挂着 data-selectable /
      // tabIndex / role="button" / aria-pressed、被选中的那枚还描着环，而按钮与
      // 播报已经跟着 run 一起消失了。功能上 inert（selectCell 与 undo 都拦在
      // ended 守卫外），但这是一份没有任何入口解释得清的残留状态。
      // 超时结算与 settle 同一条边界：这一局打完了，存档随之作废（见 settle）
      if (next.phase === 'ended') {
        clearPersistedRun()
      } else {
        persistSession(
          {
            game: next,
            dailyDate: state.dailyDate,
            styleId: state.styleId,
            historyLength: state.history.length,
          },
          { kind: 'none' }
        )
      }
      return { game: next, swapArmed: false, swapSelection: null }
    })
  },
  newGame: () => {
    set((state) => {
      if (!state.game) return state
      // 先终态化再开新局：mode-contract §3 把「活跃局直接新游戏」定义为放弃本局，
      // 所以这一步必须走 abandon（不写记录）。被放弃的那个状态只活在这一次 set 里，
      // 界面看不到它——紧接着就是一张干净的开局棋盘，不沿用任何旧格子与旧分数。
      //
      // 现在只读 abandoned.modeId，而 abandon 并不改 modeId，所以这一行目前**不可观测**。
      // 别删：它是 T17「写记录」要接的那道缝——届时被放弃的那个终态就是 abandoned 记录的
      // 依据，在此之前它刻意保持惰性，不写任何东西。
      const abandoned = abandon(state.game)
      const modeId = abandoned.modeId
      // 「新游戏」重新抽题：Daily 按**当前** UTC 日期抽——跨过零点再开新局就是新题
      // （T08 不变式 B 的「新局」半边）。其余模式照旧随机，这里不再读 ?seed=：
      // 那条缝只在开局那一刻读（T03 起的行为，T04/T06/T07 的 e2e 依赖它不变）。
      const daily = modeId === 'daily' ? drawDailySeed() : null
      const seed = daily?.seed ?? drawSeed()
      const game = createGame(modeId, seed, Date.now())
      const dailyDate = daily?.date ?? null
      // 验收标准 3：「新游戏放弃未结算 session，不擦除已结算数据」。
      // 前半句由这个 reset 兑现——上一局的撤销历史整条作废；后半句由**不碰**
      // records / stats 兑现（T17 的桶本 Ticket 连建都不建，见 session.ts 文件头）
      persistSession(
        {
          game,
          dailyDate,
          styleId: state.styleId,
          historyLength: 0,
        },
        { kind: 'reset' }
      )
      // 新一局的历史从空开始：撤销的边界是「本局的开局」，跨不过「新游戏」这道墙。
      // 不这么做的话，新一局能一路撤回到上一局的棋盘上。拾取态同一个边界：
      // 上一局没做完的交换不许跟到新棋盘上来
      return {
        game,
        dailyDate,
        history: [],
        swapArmed: false,
        swapSelection: null,
      }
    })
  },
  // 还没有提示，也还没有在读存档（false 由 hydrate 在读完之后落）
  storageNotice: null,
  restoring: true,
  hydrate: () => {
    // 记一次正在进行的读：React StrictMode 会把挂载 effect 跑两遍，两遍读同一份
    // 才不会有两次 IndexedDB 读、两次 setState。读完就清空，之后还想再读可以再调
    hydration ??= doHydrate().finally(() => {
      hydration = null
    })
  },
}))
