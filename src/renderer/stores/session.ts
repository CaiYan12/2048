import { MODES, type ModeId } from '../../shared/modes'
import { THEMES } from '../styles/themes'
import type {
  Board,
  Cell,
  EndReason,
  GameState,
  RunPhase,
  StyleId,
  Tile,
} from '../../shared/types'

/**
 * 存档的形状、版本与判定（SPEC §3.3 三个桶的纯逻辑半边）
 *
 * 本文件**一行 I/O 都没有**：不碰 indexedDB、不碰 window、不碰 JSON.parse 之外
 * 的任何平台 API。于是「一份旧版 / 损坏 / 形状不对的存档该不该被当成可续玩」这条
 * 判定可以在 node 环境里被单测直接驱动——T16 的验收标准 2 全押在这上面，而
 * T14 的闸门已经证明过：没人在真实环境里跑过的那一层，恰恰是缺陷最爱住的地方。
 *
 * 三个桶（SPEC §3.3）：settings / session / records+stats。本票（T16）只写前两个。
 * records 与 stats 归 T17 / T18，这里连对象存储都不为它们建——提前建一个空桶
 * 等于替一票未写的需求定型。版本号是全局的：三个桶从此共用 STORAGE_VERSION，
 * T17 加桶时不需要重新设计版本这件事。
 *
 * **T17 的改动**：records / stats 两个桶由 T17 的 records.ts + sessionStore.ts 建起来，
 * 本文件只扩了 SessionRecord.startedAt（T17 的「本局时长」要从它推导，见那边）。
 * 顺序是有意的：纯逻辑的两个半边各自可被 node 单测驱动，I/O 仍然只有一处。
 */

/**
 * 存档格式版本（SPEC §3.3「Storage needs a version」）
 *
 * 它是**拒绝**的开关，不是兼容层：读到不相等的版本一律当成不可恢复，
 * 由界面明说「这一局无法继续」，绝不在两种形状之间猜（旧形状少一个字段、
 * 多一个枚举值，猜错的后果是把一局棋盘悄悄恢复成另一局）。
 */
export const STORAGE_VERSION = 1

/** 存档数据库名与三个桶名（I/O 半边在 sessionStore.ts，两处必须一致） */
export const STORAGE_DB_NAME = '2048'
export const SETTINGS_STORE = 'settings'
export const SESSION_STORE = 'session'
export const HISTORY_STORE = 'history'
/** 单例记录在各自桶里的键：settings 与 session 都只有当前这一份 */
export const SINGLETON_KEY = 'current'

/** 四个运行阶段，与 src/shared/types.ts 的 RunPhase 同一组字面量 */
const PHASES: readonly RunPhase[] = ['playing', 'won', 'stuck', 'ended']
/** 四个结束原因（mode-contract §3：timeout 是第四条，与其余三条不共用代码） */
const END_REASONS: readonly EndReason[] = ['won', 'deadlock', 'abandoned', 'timeout']

/** Daily 日期串的形状（store 的 todayUtc() 产出的就是这一种） */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * 拒绝的原因。三句话在界面上是三句不同的话（见 restoreFailureMessage）：
 *   unreadable  字节坏了，连 JSON 都解不出来；
 *   version     形状本来是好的，但格式版本不是当前这一个；
 *   shape       版本对得上，内容却对不上规则数据该有的形状。
 */
export type RejectReason = 'unreadable' | 'version' | 'shape'

/**
 * 被拒绝的存档属于哪个桶。同一句话要说出是哪一个读不出来，否则玩家不知道该修什么
 *
 * T17 加了 records / stats 两个：它们读不出来时说的是另一件事（不是「这一局没了」，
 * 而是「本地记录没法读，也不会被重置成 0」），所以主语要能指到它们身上。
 */
export type StorageBucket = 'settings' | 'session' | 'records' | 'stats'

/** settings 桶（SPEC §3.3：选中的模式、选中的风格、静音开关） */
export interface SettingsRecord {
  version: number
  modeId: ModeId
  styleId: StyleId
  /**
   * 静音开关。**T20 才会有人读它**，此刻 store 里没有这个字段，所以
   * encodeSettings 恒写 false。为什么现在就把它放进形状：T20 若在自己那一票里
   * 往这里加字段，SPEC §3.3 的「存档需要一个版本」就得为它单独涨一次版本，
   * 而涨版本号是 owner 决策。字段先占位，T20 只填值，不动形状。
   */
  mute: boolean
}

/**
 * session 桶：这一局此刻的全部可恢复状态（SPEC §3.3）
 *
 * 「当前模式」取自 `game.modeId` 而不再单列一个顶层字段——引擎自己认领的那一个
 * 字段就是权威，抄一份出来只会创造两个可能互相矛盾的真话。
 *
 * 撤销历史**不在这个记录里**：它按索引散放在 history 桶里，一条前态一条记录。
 * 理由见 sessionStore.ts 的 saveRun——那是 T11 实测出的写入形态。
 */
export interface SessionRecord {
  version: number
  styleId: StyleId
  /**
   * Daily 这一局的 UTC 日期串（'YYYY-MM-DD'）；非 Daily 为 null
   *
   * 它**不能从种子推回来**：seedFromUtcDate 是 FNV-1a + fmix32 的单向哈希，
   * 没有任何函数把 32 位种子还原成日期串。所以刷新丢掉它，Daily 的日期标签就会
   * 在其余一切正常恢复的情况下显示一个错日期（或者退回「今天」而跨过 UTC 零点
   * 之后翻篇）。它与 game.initialSeed 各存各的，谁也不是谁的副本。
   */
  dailyDate: string | null
  /**
   * 本局起始时刻（epoch ms）；null = 没有记下来
   *
   * T17 的「本局时长」要从它推导，所以它必须**跟着这一局跨过刷新**——不进这个记录的
   * 话，刷新再结算就只能从头算起，而「刷新丢掉一半时长」正是 SPEC §3.3 要防的那件事。
   * 它不住进 GameState：那是墙上时钟读数，不是规则数据（ADR-0001 的分工），
   * 于是与 dailyDate 同一条路——住 store、进这个桶。
   *
   * **null 是合法的**（T17 之前开的局没有这个字段）：那时的本局时长无从得知，
   * 结算时记 0，而分数与最高方块照记。为它把整局拒掉，等于因为一个统计字段
   * 毁掉一局还能下的棋。给了却不是 ≥1 的整数则按形状拒绝——0 是 1970 年，
   * 不是一次真实的开局。
   */
  startedAt: number | null
  game: GameState
  /** 撤销历史的长度：history 桶里 [0, historyLength) 这一段属于这一局 */
  historyLength: number
}

/** 恢复出来的那一局：store 要落的五个字段（拾取态刻意不在内，见 useGameStore） */
export interface RestoredSession {
  game: GameState
  history: readonly GameState[]
  dailyDate: string | null
  styleId: StyleId
  startedAt: number | null
}

/** 读一份存档的结论。三态缺一不可：没存过不是错，存了读不得才是 */
export type SessionParse =
  | { kind: 'ok'; record: SessionRecord }
  | { kind: 'absent' }
  | { kind: 'rejected'; reason: RejectReason }

/** settings 桶的读取消向，形状同上 */
export type SettingsParse =
  | { kind: 'ok'; record: SettingsRecord }
  | { kind: 'absent' }
  | { kind: 'rejected'; reason: RejectReason }

/** 界面上那一句提示的种类。两种失败在界面上是两段不同的话 */
export type StorageNoticeKind = 'restore-rejected' | 'write-failed'

export interface StorageNotice {
  kind: StorageNoticeKind
  message: string
}

/** 撤销历史这一步发生了什么。写入方据此决定 history 桶的那一次操作 */
export type HistoryDelta =
  /** 只改 session 记录（换风格、里程碑、恢复继续玩这类不推动进度的动作） */
  | { kind: 'none' }
  /** 压栈一条：写入 history[index]，同时 session 记录的 historyLength 已经算上它 */
  | { kind: 'push'; index: number; game: GameState }
  /** 弹出一条：删掉 history[index]——它就是刚刚被撤销搬回 game 的那一个前态 */
  | { kind: 'pop'; index: number }
  /** 新一局：整条撤销历史作废（开局棋盘就是 game 自己，往前没有更早的状态） */
  | { kind: 'reset' }

/** 存档里要的五个字段 + 那一个 GameState。调用点就地拼，绝不先克隆一份 store 状态 */
export interface SessionSnapshot {
  game: GameState
  dailyDate: string | null
  styleId: StyleId
  historyLength: number
  /** 本局起始时刻（T17 的时长公式用）。见 SessionRecord.startedAt */
  startedAt: number | null
}

// ─── 形状判据 ────────────────────────────────────────────────────────────────

/**
 * 这一次加载是不是带着**显式开局指令**（`?seed=` / `?board=`）
 *
 * 显式指令优先于存档。理由不是为测试行方便，而是这两个缝本身的性质：它们说的是
 * 「这一次从这一题 / 这一副局面开局」，是一条命令，不是一个默认值（见 stores/seed.ts
 * 与 stores/fixture.ts 的头注）。存档盖掉它，这条缝在任何有存档的浏览器里都会静默
 * 失效——同一个 seed 跑第二遍拿到的是上一局的残局，对照实验整套作废。
 *
 * 副作用要说清楚：带了这两个参数的刷新**不会**续上上一局，而是按指令重开一局。
 * 这是那条缝的既有语义，不是本 Ticket 新加的限制。
 */
export function hasExplicitStart(search: string): boolean {
  const params = new URLSearchParams(search)
  // has 而不是 get：给了空值（?seed=）也算显式指令——seed.ts 把空值解析成
  // 「没给」，但那是在决定**用什么种子**；这里问的是「玩家是不是在指定开局」，
  // 空参数同样是一次指定，而且与 seed.ts 的兜底并不矛盾
  return params.has('seed') || params.has('board')
}


function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 整数且有下界。方块身份与数值、分数、步数、随机进度都走这一道 */
function isInteger(value: unknown, min: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min
}

function isKnownMode(value: unknown): value is ModeId {
  return MODES.some((mode) => mode.id === value)
}

function isKnownStyle(value: unknown): value is StyleId {
  return THEMES.some((theme) => theme.id === value)
}

function decodeTile(raw: unknown): Tile | null {
  if (!isRecord(raw)) return null
  // 两个字段都要在：JSON 只留一个 value 的「方块」渲染得出来，但它没有身份，
  // 而身份是 T21 位移动画与 T11 撤销校验共同的依据
  const id = raw.id
  const value = raw.value
  if (!isInteger(id, 1) || !isInteger(value, 1)) return null
  return { id, value }
}

/**
 * 棋盘：行数、列数都按这个模式声明的大小来，格子只有 null / 'wall' / 方块三种
 *
 * 尺寸判据不是洁癖：一局 5×5 的棋盘塞进 4×4 的读法里，读取方会安静地漏掉最后
 * 一行，而那正是最容易藏生成错误的位置。墙也要逐个认——障碍不参与移动、合并、
 * 生成与交换（mode-contract §1），少了它 walls 模式恢复出来就是一块能跑的棋盘。
 */
function decodeBoard(raw: unknown, size: number): Board | null {
  if (!Array.isArray(raw) || raw.length !== size) return null
  const board: Board = []
  for (const rowRaw of raw as unknown[]) {
    if (!Array.isArray(rowRaw) || rowRaw.length !== size) return null
    const row: Cell[] = []
    for (const cellRaw of rowRaw as unknown[]) {
      if (cellRaw === null) {
        row.push(null)
        continue
      }
      if (cellRaw === 'wall') {
        row.push('wall')
        continue
      }
      const tile = decodeTile(cellRaw)
      if (tile === null) return null
      row.push(tile)
    }
    board.push(row)
  }
  return board
}

/** 十一个字段逐个认（src/shared/types.ts 的 GameState 全文） */
function decodeGame(raw: unknown): GameState | null {
  if (!isRecord(raw)) return null
  const modeId = raw.modeId
  if (!isKnownMode(modeId)) return null
  const size = MODES.find((mode) => mode.id === modeId)?.size ?? 0
  const board = decodeBoard(raw.board, size)
  if (board === null) return null
  if (!isInteger(raw.score, 0)) return null
  if (typeof raw.reachedTarget !== 'boolean') return null
  if (!PHASES.includes(raw.phase as RunPhase)) return null
  if (raw.endReason !== null && !END_REASONS.includes(raw.endReason as EndReason)) return null
  if (!isInteger(raw.nextTileId, 1)) return null
  // 种子与随机进度是普通 32 位数：NaN / Infinity / 字符串在这里一律挡下，
  // 它们会让 restoreRng 产出一条再也生不出方块的流，而盘面看着完全正常
  if (typeof raw.initialSeed !== 'number' || !Number.isFinite(raw.initialSeed)) return null
  if (typeof raw.rngState !== 'number' || !Number.isFinite(raw.rngState)) return null
  if (!isInteger(raw.moves, 0)) return null
  // deadline 是绝对时间戳（src/shared/types.ts）：null = 不限时，否则必须是有限数。
  // 一个 NaN 截止点会让限时模式在恢复后立刻被判成「早就到点」而强制结算
  if (raw.deadline !== null && (typeof raw.deadline !== 'number' || !Number.isFinite(raw.deadline))) {
    return null
  }
  return {
    modeId,
    board,
    score: raw.score,
    reachedTarget: raw.reachedTarget,
    phase: raw.phase as RunPhase,
    endReason: raw.endReason as EndReason,
    nextTileId: raw.nextTileId,
    initialSeed: raw.initialSeed,
    rngState: raw.rngState,
    moves: raw.moves,
    deadline: raw.deadline as number | null,
  }
}

/** Daily 日期串：null = 非 Daily 模式；形状不对就是拒绝（显式三态，不用哨兵符号） */
function decodeDailyDate(
  raw: unknown
): { ok: true; value: string | null } | { ok: false } {
  if (raw === null) return { ok: true, value: null }
  if (typeof raw !== 'string' || !DATE_PATTERN.test(raw)) return { ok: false }
  return { ok: true, value: raw }
}

/**
 * 本局起始时刻：`null` / 缺这个字段都按「没有记下来」收（T17 之前开的局），
 * 否则必须是 ≥1 的整数。
 *
 * 缺字段与显式 null 同等对待，理由与 decodeSession 的 absent 一脉相承：没给不是错，
 * 给错了才是。而 0 被单列出来拒掉——它是 1970 年，任何真实的开局都不会落在那里，
 * 放它过去会让 T17 的时长算出一个两千多万毫秒的数。
 */
function decodeStartedAt(
  raw: unknown
): { ok: true; value: number | null } | { ok: false } {
  if (raw === null || raw === undefined) return { ok: true, value: null }
  if (!isInteger(raw, 1)) return { ok: false }
  return { ok: true, value: raw }
}

// ─── 编码（store → 存档） ─────────────────────────────────────────────────────

export function encodeSession(snapshot: SessionSnapshot): SessionRecord {
  return {
    version: STORAGE_VERSION,
    styleId: snapshot.styleId,
    dailyDate: snapshot.dailyDate,
    startedAt: snapshot.startedAt,
    game: snapshot.game,
    historyLength: snapshot.historyLength,
  }
}

export function encodeSettings(modeId: ModeId, styleId: StyleId): SettingsRecord {
  return {
    version: STORAGE_VERSION,
    modeId,
    styleId,
    // mute 恒 false：T20 才有第一个读它的人（见 SettingsRecord.mute 的理由）
    mute: false,
  }
}

// ─── 解码（存档 → store） ─────────────────────────────────────────────────────

/**
 * 一份 session 记录能不能用。
 *
 * `null` / `undefined` 走 absent——**没存过东西不是错误**，那是第一次打开这个页面。
 * 其余一切读不出来的形态都走 rejected，由界面说出来（SPEC §3.3「invalid or
 * unwritable state must be surfaced without pretending restoration succeeded」）。
 */
export function decodeSession(raw: unknown): SessionParse {
  if (raw === null || raw === undefined) return { kind: 'absent' }
  if (!isRecord(raw)) return { kind: 'rejected', reason: 'shape' }
  // 版本先判：形状再对也不许跨版本猜（见 STORAGE_VERSION 的理由）
  if (raw.version !== STORAGE_VERSION) return { kind: 'rejected', reason: 'version' }
  if (!isKnownStyle(raw.styleId)) return { kind: 'rejected', reason: 'shape' }
  const dailyDate = decodeDailyDate(raw.dailyDate)
  if (!dailyDate.ok) return { kind: 'rejected', reason: 'shape' }
  const startedAt = decodeStartedAt(raw.startedAt)
  if (!startedAt.ok) return { kind: 'rejected', reason: 'shape' }
  if (!isInteger(raw.historyLength, 0)) return { kind: 'rejected', reason: 'shape' }
  const game = decodeGame(raw.game)
  if (game === null) return { kind: 'rejected', reason: 'shape' }
  return {
    kind: 'ok',
    record: {
      version: STORAGE_VERSION,
      styleId: raw.styleId,
      dailyDate: dailyDate.value,
      startedAt: startedAt.value,
      game,
      historyLength: raw.historyLength,
    },
  }
}

/** settings 桶的同一条判定（SPEC §3.3） */
export function decodeSettings(raw: unknown): SettingsParse {
  if (raw === null || raw === undefined) return { kind: 'absent' }
  if (!isRecord(raw)) return { kind: 'rejected', reason: 'shape' }
  if (raw.version !== STORAGE_VERSION) return { kind: 'rejected', reason: 'version' }
  if (!isKnownMode(raw.modeId)) return { kind: 'rejected', reason: 'shape' }
  if (!isKnownStyle(raw.styleId)) return { kind: 'rejected', reason: 'shape' }
  // 静音开关也认形状：T20 之前它恒为 false，一个非布尔值说明这份记录来自
  // 另一种形状，那就不该被半信半疑地应用（默认值比猜出来的值诚实）
  if (typeof raw.mute !== 'boolean') return { kind: 'rejected', reason: 'shape' }
  return {
    kind: 'ok',
    record: {
      version: STORAGE_VERSION,
      modeId: raw.modeId,
      styleId: raw.styleId,
      mute: raw.mute,
    },
  }
}

/** 一段存档文本：先解字节，再判形状。解不出来就是 unreadable，不是 shape */
export function decodeSessionText(text: string): SessionParse {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { kind: 'rejected', reason: 'unreadable' }
  }
  return decodeSession(parsed)
}

/** 撤销历史的一条：形状与 game 完全同一套判据（它们本来就是同一个类型） */
export function decodeHistoryEntry(raw: unknown): GameState | null {
  return decodeGame(raw)
}

/**
 * 把 session 记录 + 撤销历史条目组装成 store 要的那四个字段。
 *
 * 任何一条对不上就整体作废（返回 null）：**撤不到开局的存档不算可恢复**
 * （ADR-0003：撤销不留上限、不静默丢历史）。少给最后一条前态，玩家撤销到
 * 第 N 步时会静默少一次可撤销——那正是契约明令禁止的那种「悄悄丢历史」。
 */
export function assembleSession(
  record: SessionRecord,
  historyRaw: readonly unknown[]
): RestoredSession | null {
  // 条数必须一条不少：条目数对不上，说明历史被截断或掺了别的东西
  if (historyRaw.length !== record.historyLength) return null
  const history: GameState[] = []
  for (const raw of historyRaw) {
    const entry = decodeHistoryEntry(raw)
    if (entry === null) return null
    history.push(entry)
  }
  return {
    game: record.game,
    history,
    dailyDate: record.dailyDate,
    styleId: record.styleId,
    startedAt: record.startedAt,
  }
}

// ─── 界面上那一句话 ───────────────────────────────────────────────────────────

/** 每个桶在界面那句话里的主语。四个桶四句话，混成一个主语玩家就不知道该修什么 */
function bucketSubject(bucket: StorageBucket): string {
  switch (bucket) {
    case 'settings':
      return '设置'
    case 'session':
      return '这一局'
    case 'records':
      return '记录'
    case 'stats':
      return '统计'
  }
}

/**
 * 存档读不出来时界面上说的那句。
 *
 * 两句都要做到「不假装」：不说「已恢复」，也不说「存档已损坏，请联系支持」这种
 * 不接地的话——本地说存储没有谁能修，玩家唯一要听进去的是「这一局没了，
 * 开新游戏就行，页面里已经走掉的撤销还在」。
 */
export function restoreFailureMessage(reason: RejectReason, bucket: StorageBucket): string {
  const subject = bucketSubject(bucket)
  switch (reason) {
    case 'unreadable':
      return `${subject}读不出来：存档数据已损坏。`
    case 'version':
      return `${subject}读不出来：存档版本不是 v${STORAGE_VERSION}（旧版或来自另一套格式）。`
    case 'shape':
      return `${subject}读不出来：存档内容与当前规则对不上。`
  }
  return `${subject}读不出来。`
}

/** 旧版 / 损坏的完整提示：设置读不出来还能玩，一局读不出来就得说清怎么继续 */
export function restoreNotice(reason: RejectReason, bucket: StorageBucket): StorageNotice {
  const tail =
    bucket === 'settings'
      ? '已回到默认设置，本局不受影响。'
      : bucket === 'session'
        ? '开始新游戏即可，页面内已有的撤销不受影响。'
        : '已保留原有数据，本次结算的战绩不会写入。'
  return {
    kind: 'restore-rejected',
    message: `${restoreFailureMessage(reason, bucket)}${tail}`,
  }
}

/**
 * 连存储都打不开时那一句（隐私模式 / 存储被禁用）
 *
 * 与「存档读不出来」分开：那句是数据坏了，这句是**压根没有存储可用**。
 * 玩家能做的事也一样不同——这里没有存档可丢，只有「这一局只能活在当前页面里」。
 */
export function storageUnavailableNotice(): StorageNotice {
  return {
    kind: 'restore-rejected',
    message: '读不出本地存储（可能是隐私模式或存储被禁用）：上次的一局无法恢复。开始新游戏即可。',
  }
}

/**
 * 写盘失败时界面上说的那句（mode-contract §4 的原话口径）
 *
 * 「保留当前页面内的撤销能力，并明确提示刷新后可能无法续玩」——所以这句话的
 * 主语必须是**撤销还在**，然后才是**刷新可能续不上**。顺序反了就是在说
 * 「你的进度丢了」，那不是事实：这一页里的撤销栈一条都没少。
 */
export function writeFailureMessage(error: unknown): string {
  const reason = describeStorageFailure(error)
  return `${reason}页面内的撤销仍然可用，但刷新后可能无法继续这一局。`
}

/** 失败的技术原因，翻成一句玩家能懂的话。T17 的战绩写入失败复用同一个原因映射 */
export function describeStorageFailure(error: unknown): string {
  if (isDomException(error)) {
    if (error.name === 'QuotaExceededError') return '保存失败：本地存储已满。'
    if (error.name === 'InvalidStateError' || error.name === 'UnknownError') {
      return '保存失败：浏览器拒绝了本地存储（可能是隐私模式）。'
    }
  }
  return '保存失败：无法写入本地存储。'
}

/** DOMException 在 node 环境里也是全局的（Node ≥ 17），所以这个判据可被单测直接驱动 */
function isDomException(error: unknown): error is DOMException {
  return (
    typeof DOMException !== 'undefined' &&
    error instanceof DOMException
  )
}
