import type { GameState } from '../../shared/types'
import {
  HISTORY_STORE,
  SESSION_STORE,
  SETTINGS_STORE,
  SINGLETON_KEY,
  STORAGE_DB_NAME,
  restoreNotice,
  type HistoryDelta,
  type SessionRecord,
  type SettingsRecord,
} from './session'
import {
  RECORDS_STORE,
  STATS_STORE,
  applyRunToStats,
  applySettlement,
  decodeStats,
  decodeStyleRecord,
  recordKey,
  type Settlement,
  type SettlementWrite,
} from './records'

/**
 * 本地存储的 I/O 半边：IndexedDB 的打开、读写、失败翻译
 *
 * 判定（旧版 / 损坏 / 形状）全部在 ./session.ts 与 ./records.ts，这里**只搬字节**：
 * 把平台错误变成一个拒绝的 Promise，把「一条记录 / 一条历史」变成一个事务。
 *
 * 为什么只有 IndexedDB，没有 localStorage 退路：localStorage 只能整体存一个值，
 * 而撤销路径是几百 KB 到几 MB 的数组——走它就得每步把整条历史重新序列化一遍，
 * 那正是 T11 实测出不划算的形态（10,000 次累计约 30 GB）。存储不可用时诚实的
 * 做法是**说清楚存不了**（mode-contract §4 的写入失败条款），而不是换一个
 * 把同一件事做得更贵的后端。SPEC §6 也把后端排除在外，这里纯本地。
 *
 * T17 起这个文件多管两个桶：`records`（按 `${modeId}:${styleId}` 一个键一条）与
 * `stats`（单例）。它们的纯逻辑半边在 ./records.ts，这里仍然只搬字节。
 */

/**
 * 数据库版本。**T17 从 1 涨到 2**：新桶必须靠 onupgradeneeded 才建得出来，
 * 而那个回调只在版本号变大时才跑——不涨的话，已经打开过一次 v1 的浏览器永远
 * 看不到 records / stats 两个对象存储，之后每一次写都会撞 NotFoundError。
 * 它与会话记录的 version（session.ts 的 STORAGE_VERSION）各升各的：一个说
 * 「库里有哪几个桶」，一个说「一条记录是什么形状」。
 */
const DB_VERSION = 2

/** 五个桶的建库清单。顺序无含义，逐个 contains 判断 */
const BUCKETS: readonly string[] = [
  SETTINGS_STORE,
  SESSION_STORE,
  HISTORY_STORE,
  RECORDS_STORE,
  STATS_STORE,
]

/** 打开过一次就留着：每步都 open 一次是把一次网络往返换成一次本地握手 */
let connection: Promise<IDBDatabase> | null = null

function openStorage(): Promise<IDBDatabase> {
  connection ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(STORAGE_DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      // 一张清单建齐五个桶（T17 加 records / stats 两个，见 DB_VERSION 为什么涨）。
      // history 用**外联键**（数字索引），不开 keyPath：键就是「第几条前态」，
      // 撤销弹掉第 n 条就是 delete(n)，与 New Game 的 clear 是同一套索引口径。
      for (const name of BUCKETS) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name)
        }
      }
    }
    request.onsuccess = () => {
      resolve(request.result)
    }
    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB 打不开'))
    }
  })
  // 失败的那次不留缓存：隐私模式与临时故障不该把这一页永久钉死在「存不了」上，
  // 下一次写入还该再试一遍（试完再失败，界面照样会说）
  connection.catch(() => {
    connection = null
  })
  return connection
}

/** 一次读取：请求的成功 / 错误 → Promise 的落地 */
function fromRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result)
    }
    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB 读取失败'))
    }
  })
}

/**
 * 一次写入：等事务收口，但**优先采信请求自己的错误**
 *
 * 为什么不能只等事务：配额用尽时请求带的是 QuotaExceededError，而事务中止时
 * 只给一个光秃秃的 AbortError。界面上要说的前一句是「本地存储已满」，
 * 那是一个玩家能动手解决的原因；后一句什么都没说。谁先失败就采信谁，
 * 而规范里请求的错误事件本来就先于中止事件——所以这不是抢跑，是照顺序抄下来。
 */
function settleWrite(
  transaction: IDBTransaction,
  requests: readonly Promise<unknown>[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    const fail = (error: unknown): void => {
      if (settled) return
      settled = true
      reject(error)
    }
    const done = (): void => {
      if (settled) return
      settled = true
      resolve()
    }
    transaction.oncomplete = done
    transaction.onabort = () => {
      fail(transaction.error ?? new Error('IndexedDB 写入被中断'))
    }
    transaction.onerror = () => {
      fail(transaction.error ?? new Error('IndexedDB 写入失败'))
    }
    for (const request of requests) {
      request.catch(fail)
    }
  })
}

/** settings 桶读出来。没存过就是 null——「没存」与「存坏了」是两件事，别混 */
export async function readSettingsRaw(): Promise<unknown> {
  const db = await openStorage()
  const store = db.transaction(SETTINGS_STORE, 'readonly').objectStore(SETTINGS_STORE)
  const raw = await fromRequest(store.get(SINGLETON_KEY))
  return raw ?? null
}

/** session 桶读出来（判定归调用方） */
export async function readSessionRaw(): Promise<unknown> {
  const db = await openStorage()
  const store = db.transaction(SESSION_STORE, 'readonly').objectStore(SESSION_STORE)
  const raw = await fromRequest(store.get(SINGLETON_KEY))
  return raw ?? null
}

/**
 * 读撤销历史的前 count 条（按键升序）
 *
 * 多读了不裁、少读了不编：条数不够由 assembleSession 判成「整局不可恢复」
 * （撤不到开局的存档不算可恢复，ADR-0003）。这里刻意不补 null、不重排——
 * 少一条就是少一条，替它编一条才是把悄悄丢历史写进代码里。
 */
export async function readHistoryRaw(count: number): Promise<unknown[]> {
  if (count === 0) return []
  const db = await openStorage()
  const store = db.transaction(HISTORY_STORE, 'readonly').objectStore(HISTORY_STORE)
  const all = await fromRequest(store.getAll())
  // getAll 按键升序给（对象存储的排序就是键序），前 count 条属于这一局
  return (all as unknown[]).slice(0, count)
}

/**
 * 写 settings 桶。每步 O(1)：一条小记录
 */
export async function writeSettings(record: SettingsRecord): Promise<void> {
  const db = await openStorage()
  const transaction = db.transaction(SETTINGS_STORE, 'readwrite')
  await settleWrite(transaction, [
    fromRequest(transaction.objectStore(SETTINGS_STORE).put(record, SINGLETON_KEY)),
  ])
}

/**
 * 写这一局：session 记录 + 撤销历史的**那一步**
 *
 * 这是本票避免 O(n²) 写入的地方。T11 实测出不可接受的是「每步把整条历史重新
 * 序列化一遍」（10,000 次累计约 30 GB、单次整栈序列化 13.55 ms），而**不是**
 * 「保留完整前态快照」这件事本身——后者是线性的（每份约 572 B）。所以这里每步
 * 只写两样东西：一条 session 记录（含 game 与 historyLength），加 / 删 history 桶里
 * 的那**一条**前态。无论撤销栈多深，一步就是一步的字节数。
 *
 * 两样东西放进同一个事务：session 记录说「撤销历史有 n 条」，history 桶里就得
 * 真有那 n 条。分两次写的话，中间崩一次会留下「说有 n 条、实际只有 n−1 条」的
 * 存档，而那正好会被 assembleSession 判成不可恢复——一次无谓的进度丢失。
 */
export async function saveRun(record: SessionRecord, delta: HistoryDelta): Promise<void> {
  const db = await openStorage()
  const transaction = db.transaction([SESSION_STORE, HISTORY_STORE], 'readwrite')
  const historyStore = transaction.objectStore(HISTORY_STORE)
  const requests: Promise<unknown>[] = [
    fromRequest(transaction.objectStore(SESSION_STORE).put(record, SINGLETON_KEY)),
  ]
  switch (delta.kind) {
    case 'none':
      break
    case 'push':
      // 压栈的那一条 = 移动前那个完整前态。就这一条，不是整条历史
      requests.push(fromRequest(historyStore.put(delta.game, delta.index)))
      break
    case 'pop':
      // 撤销弹掉的那一条 = 刚刚被搬回 game 的那一个前态
      requests.push(fromRequest(historyStore.delete(delta.index)))
      break
    case 'reset':
      // 新一局：整条历史作废。开局棋盘就是 game 自己，往前没有更早的状态
      requests.push(fromRequest(historyStore.clear()))
      break
  }
  await settleWrite(transaction, requests)
}

/**
 * 放弃这一局：清 session 记录 + 整条撤销历史。**绝不动 records / stats**
 * （验收标准 3 的「不擦除已结算数据」——那两个桶由 T17 的 records.ts 定形状，
 * 这里只有结算那一条写入路径碰得到它们，而它只在结算时被调用）
 */
export async function clearRun(): Promise<void> {
  const db = await openStorage()
  const transaction = db.transaction([SESSION_STORE, HISTORY_STORE], 'readwrite')
  const requests: Promise<unknown>[] = [
    fromRequest(transaction.objectStore(SESSION_STORE).delete(SINGLETON_KEY)),
    fromRequest(transaction.objectStore(HISTORY_STORE).clear()),
  ]
  await settleWrite(transaction, requests)
}

// ─── T17：战绩与统计 ─────────────────────────────────────────────────────────

/**
 * 读出全部记录（键 + 值成对给出）。
 *
 * 键与值分开读再配对，是因为**身份在键里**（`${modeId}:${styleId}`）而值里只有数字。
 * 那正是 T16 的 e2e 往 records 桶摆种子值时的形状（`put({bestScore, highestTile},
 * 'classic:material')`），本票沿用同一个口径，不另造一套「值里再抄一遍身份」的形状——
 * 抄一份就能对不上，而对不上的两份身份没有裁判。
 */
export async function readRecordsEntries(): Promise<readonly { key: string; value: unknown }[]> {
  const db = await openStorage()
  const store = db.transaction(RECORDS_STORE, 'readonly').objectStore(RECORDS_STORE)
  // getAllKeys 与 getAll 按键同一顺序给，逐位配上即可
  const [keys, values] = await Promise.all([
    fromRequest(store.getAllKeys()),
    fromRequest(store.getAll()),
  ])
  return (keys as IDBValidKey[]).map((key, index) => ({
    key: String(key),
    value: (values as unknown[])[index],
  }))
}

/** 统计桶读出来（判定归 records.ts 的 decodeStats） */
export async function readStatsRaw(): Promise<unknown> {
  const db = await openStorage()
  const store = db.transaction(STATS_STORE, 'readonly').objectStore(STATS_STORE)
  const raw = await fromRequest(store.get(SINGLETON_KEY))
  return raw ?? null
}

/**
 * 写一次结算：records 与 stats **同一个事务**。
 *
 * 为什么必须同事务：一条记录说「最高分涨了」，统计就得说「总局数 +1」。分两次写的
 * 话，中间崩一次会留下一对互相矛盾的数字（分数变了、局数没变），而那对数字谁都不能
 * 修——本地存储没有谁能修。与 saveRun 把 session 与 history 放进同一个事务是同一条理由。
 *
 * 读也在这个事务里（get 之后再 put，中间不落事件循环）：先读后写，才能保证「在旧值
 * 之上取 max」这件事读到的确实是旧值，而不是上一次写盘留下的中间态。
 *
 * **读不出来就什么都不写**，返回 rejected 而不是抛：桶里的旧数据读不得时，
 * 静默重置成 0 比写不进去更糟（SPEC §3.3「不许假装持久化成功」）。界面上那句话
 * 由返回值带着走，磁盘上那份原样留着。
 */
export async function writeSettlement(settlement: Settlement): Promise<SettlementWrite> {
  const db = await openStorage()
  const transaction = db.transaction([RECORDS_STORE, STATS_STORE], 'readwrite')
  const recordsStore = transaction.objectStore(RECORDS_STORE)
  const statsStore = transaction.objectStore(STATS_STORE)
  const key = recordKey(settlement.modeId, settlement.styleId)

  const rawRecord = fromRequest(recordsStore.get(key))
  const rawStats = fromRequest(statsStore.get(SINGLETON_KEY))
  const [existingRecord, existingStats] = await Promise.all([rawRecord, rawStats])

  const parsedRecord = decodeStyleRecord(existingRecord)
  if (parsedRecord.kind === 'rejected') {
    return { kind: 'rejected', notice: restoreNotice(parsedRecord.reason, 'records') }
  }
  const parsedStats = decodeStats(existingStats)
  if (parsedStats.kind === 'rejected') {
    return { kind: 'rejected', notice: restoreNotice(parsedStats.reason, 'stats') }
  }

  const record = applySettlement(
    parsedRecord.kind === 'ok' ? parsedRecord.record : null,
    settlement
  )
  const stats = applyRunToStats(
    parsedStats.kind === 'ok' ? parsedStats.record : null,
    settlement
  )
  await settleWrite(transaction, [
    fromRequest(recordsStore.put(record, key)),
    fromRequest(statsStore.put(stats, SINGLETON_KEY)),
  ])
  return { kind: 'written' }
}
