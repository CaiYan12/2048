import { describe, expect, test } from 'vitest'
import type { GameState } from '../../src/shared/types'
import { seedFromUtcDate } from '../../src/shared/rng'
import {
  STORAGE_VERSION,
  assembleSession,
  hasExplicitStart,
  decodeSession,
  decodeSessionText,
  encodeSession,
  encodeSettings,
  decodeSettings,
  restoreNotice,
  storageUnavailableNotice,
  writeFailureMessage,
  type SessionRecord,
} from '../../src/renderer/stores/session'
import { stateWithBoard } from './support'

/**
 * T16 的存档形状、版本与判定（纯逻辑半边）
 *
 * 本文件不碰 indexedDB、不碰 window：判定逻辑整段住在 src/renderer/stores/session.ts，
 * 于是「旧版 / 损坏 / 形状不对的存档该不该被当成可续玩」这条可以在 node 里直接驱动。
 * T14 的闸门已经证明过：没人在真实环境里跑过的那一层，恰恰是缺陷最爱住的地方。
 *
 * 这里的 GameState 全部用手铺局面 + stateWithBoard 造，每个字段都给一个能认出来的值
 * （support.ts 的口径）。断言落在一串巧合的初始值上就什么也证明不了。
 */

/** 本局起始时刻：开局早于 NOW 半小时，于是 T17 的时长公式有一个能算的数 */
const RUN_START = Date.UTC(2026, 8, 26, 11, 30)

/** 一局每个字段都不取默认值的对局：walls 打底（盘面上有墙），四个非活跃字段各给一个数 */
function distinctiveGame(): GameState {
  return {
    ...stateWithBoard(
      [
        [2, 4, 8, null],
        [16, 'wall', 'wall', 64],
        [128, 'wall', 'wall', 512],
        [null, null, null, null],
      ],
      123456,
      'walls'
    ),
    score: 4242,
    moves: 9,
    nextTileId: 77,
    reachedTarget: true,
    // 'stuck' 而不是 'playing'：死局面板露着的时候刷新，这一档必须一起恢复
    phase: 'stuck',
  }
}

/** 一条完整的 session 记录 */
function distinctiveRecord(): SessionRecord {
  return {
    version: STORAGE_VERSION,
    styleId: 'material',
    dailyDate: null,
    // T19 的切换次数：defaultRecord 这一局切过 3 次
    styleSwitches: 3,
    // T17 的本局起始时刻。给一个与 NOW 不同的值：时长公式要从它算到结算那一刻，
    // 而断言落在一串巧合的初始值上就什么也证明不了
    startedAt: RUN_START,
    game: distinctiveGame(),
    historyLength: 3,
  }
}

/** 走一遍真实的存档路径：编码 → JSON → 解码。字节往返是存档的日常形态 */
function roundTrip(record: SessionRecord): ReturnType<typeof decodeSession> {
  return decodeSession(JSON.parse(JSON.stringify(record)))
}

describe('显式开局指令优先于存档', () => {
  test('?seed= / ?board= 都算显式指令', () => {
    // 带的正是这两个参数时，刷新不该悄悄续上一局，而是按指令重开一局
    expect(hasExplicitStart('?seed=20260926')).toBe(true)
    expect(hasExplicitStart('?board=2,4,,8')).toBe(true)
    expect(hasExplicitStart('?seed=20260926&board=2,4,,8')).toBe(true)
  })

  test('空参数也算：那同样是一次指定，不能当成「没给」放存档进来', () => {
    // seed.ts 把空值解析成「没给」，那是决定**用什么种子**；这里问的是
    // 「玩家是不是在指定开局」。两者不矛盾：空 seed 退回随机抽种，
    // 而这一次加载仍然是玩家指定的一次加载
    expect(hasExplicitStart('?seed=')).toBe(true)
    expect(hasExplicitStart('?board=')).toBe(true)
    expect(hasExplicitStart('?seed=+')).toBe(true)
  })

  test('没有指令、或参数长得不像指令，就不拦着存档恢复', () => {
    expect(hasExplicitStart('')).toBe(false)
    expect(hasExplicitStart('?')).toBe(false)
    expect(hasExplicitStart('?seedling=1')).toBe(false)
    expect(hasExplicitStart('?boards=2')).toBe(false)
    // 别的调试参数不算：只有 seed 与 board 是开局指令
    expect(hasExplicitStart('?whatever=1')).toBe(false)
  })
})

describe('一整个 session 的往返', () => {
  test('编码后解回来，十一个字段逐项等价', () => {
    const game = distinctiveGame()
    const record = encodeSession({
      game,
      dailyDate: null,
      styleId: 'material',
      historyLength: 3,
      startedAt: RUN_START,
      styleSwitches: 3,
    })

    const parsed = roundTrip(record)

    expect(parsed.kind).toBe('ok')
    if (parsed.kind !== 'ok') return
    // 逐字段等价：identity 会变（JSON 造新对象），那是允许的；等价性本身是硬要求
    expect(parsed.record.game).toEqual(game)
    expect(parsed.record.styleId).toBe('material')
    expect(parsed.record.dailyDate).toBeNull()
    expect(parsed.record.historyLength).toBe(3)
    expect(parsed.record.version).toBe(STORAGE_VERSION)
    // 起始时刻一个毫秒都不差：T17 的「本局时长」从它算到结算那一刻，
    // 差一秒就是统计上平白多出来的一秒
    expect(parsed.record.startedAt).toBe(RUN_START)
    // 切换次数一个都不差：T19 的风格旅行者在结算那一刻要读到「这一局切过几次」，
    // 刷新之后少一次就是一个已经达成的成就被判成没达成
    expect(parsed.record.styleSwitches).toBe(3)
    // 墙与空格各就各位：walls 模式恢复出来还得是四格墙
    expect(parsed.record.game.board[1][1]).toBe('wall')
    expect(parsed.record.game.board[1][2]).toBe('wall')
    expect(parsed.record.game.board[2][1]).toBe('wall')
    expect(parsed.record.game.board[2][2]).toBe('wall')
    expect(parsed.record.game.board[0][3]).toBeNull()
  })

  test('限时模式的绝对截止点与随机进度一起回来（ADR-0001 的那一句）', () => {
    // time-attack 打底：deadline 天然非 null。rngState 是下一次生成的依据，
    // 少它一格，刷新后的方块会落到别处——那正是 ADR-0001 要求存进度的原因
    const record = encodeSession({
      game: {
        ...stateWithBoard(
          [
            [2, 2, null, null],
            [4, 4, null, null],
            [null, null, null, null],
            [null, null, null, null],
          ],
          987654,
          'time-attack'
        ),
        score: 20,
        moves: 5,
      },
      dailyDate: null,
      styleId: 'classic',
      historyLength: 0,
      startedAt: RUN_START,
      styleSwitches: 0,
    })
    const parsed = roundTrip(record)
    if (parsed.kind !== 'ok') throw new Error('应当读得出来')

    expect(parsed.record.game.deadline).not.toBeNull()
    expect(parsed.record.game.rngState).toBe(987654)
    expect(parsed.record.game.modeId).toBe('time-attack')
  })

  test('5×5 的棋盘按 5×5 判：少一行读不出来', () => {
    const record = encodeSession({
      game: stateWithBoard(
        [
          [2, 4, null, null, null],
          [8, 16, null, null, null],
          [32, 64, null, null, null],
          [null, null, null, null, null],
          [null, null, null, null, null],
        ],
        7,
        'big-board'
      ),
      dailyDate: null,
      styleId: 'classic',
      historyLength: 0,
      startedAt: RUN_START,
      styleSwitches: 0,
    })
    expect(roundTrip(record).kind).toBe('ok')

    // 人为抹掉最后一行：4 行的棋盘喂给 5×5 的读法必须被拒。
    // 接收方安静地漏一行，那正是最容易藏生成错误的位置
    const broken: SessionRecord = {
      ...record,
      game: { ...record.game, board: record.game.board.slice(0, 4) },
    }
    const parsed = roundTrip(broken)
    expect(parsed.kind).toBe('rejected')
    if (parsed.kind !== 'rejected') return
    expect(parsed.reason).toBe('shape')
  })
})

describe('版本不符：拒绝，不当成可续玩', () => {
  test('版本不是当前这一个，一律拒绝', () => {
    for (const version of [0, 2, 99, -1, '1', null, undefined]) {
      const parsed = decodeSession({ ...distinctiveRecord(), version })
      expect(parsed.kind, `version = ${String(version)}`).toBe('rejected')
      if (parsed.kind !== 'rejected') continue
      expect(parsed.reason, `version = ${String(version)}`).toBe('version')
    }
  })

  test('少了一个 version 字段也按版本不符拒', () => {
    const { version: _dropped, ...withoutVersion } = distinctiveRecord()
    const parsed = decodeSession(withoutVersion)
    expect(parsed.kind).toBe('rejected')
    if (parsed.kind !== 'rejected') return
    expect(parsed.reason).toBe('version')
  })

  test('settings 桶同一条版本判据', () => {
    const record = encodeSettings('fibonacci', 'claude')
    expect(decodeSettings(record)).toEqual({
      kind: 'ok',
      record: { version: STORAGE_VERSION, modeId: 'fibonacci', styleId: 'claude', mute: false },
    })
    const old = decodeSettings({ ...record, version: 0 })
    expect(old.kind).toBe('rejected')
    if (old.kind !== 'rejected') return
    expect(old.reason).toBe('version')
  })

  test('没存过不是错：absent', () => {
    // null / undefined = 第一次打开这个页面，不是损坏
    expect(decodeSession(null)).toEqual({ kind: 'absent' })
    expect(decodeSession(undefined)).toEqual({ kind: 'absent' })
    expect(decodeSettings(null)).toEqual({ kind: 'absent' })
    expect(decodeSessionText('null')).toEqual({ kind: 'absent' })
  })
})

describe('字节坏了：拒绝', () => {
  test('解不出 JSON 的文本按 unreadable 拒', () => {
    for (const text of [
      '',
      '   ',
      'not json at all',
      '{"version":1',
      '{"version":1,"styleId":',
      // 注意：'[{...}]' 这种**解得出来**的 JSON 不算坏字节，它走 shape 那一档
      // （见下面「形状对不上」）。两种拒绝在界面上是两句不同的话
    ]) {
      const parsed = decodeSessionText(text)
      expect(parsed.kind, JSON.stringify(text)).toBe('rejected')
      if (parsed.kind !== 'rejected') continue
      expect(parsed.reason, JSON.stringify(text)).toBe('unreadable')
    }
  })

  test('坏字节与坏版本是两句不同的话', () => {
    // 界面要为两种失败各说一句：一个说「数据坏了」，一个说「版本不对」
    expect(restoreNotice('unreadable', 'session').message).toContain('已损坏')
    expect(restoreNotice('version', 'session').message).toContain(`不是 v${STORAGE_VERSION}`)
    expect(restoreNotice('shape', 'session').message).toContain('对不上')
    // 两句话的主语都要说明怎么继续：不是「请联系支持」，而是「开新游戏即可」
    expect(restoreNotice('unreadable', 'session').message).toContain('开始新游戏')
  })
})

describe('形状对不上：拒绝', () => {
  /** 逐项喂坏一个字段，每一个都必须被 shape 拒掉 */
  const broken: ReadonlyArray<[string, () => unknown]> = [
    ['整个载荷是数组', () => [distinctiveRecord()]],
    ['整个载荷是字符串', () => 'session'],
    ['game 缺失', () => ({ ...distinctiveRecord(), game: undefined })],
    ['game 是数组', () => ({ ...distinctiveRecord(), game: [] })],
    ['modeId 是未知模式', () => ({ ...distinctiveRecord(), game: { ...distinctiveGame(), modeId: 'aero' } })],
    ['棋盘是扁平数组', () => ({ ...distinctiveRecord(), game: { ...distinctiveGame(), board: [2, 4, 8, null] } })],
    ['某一列少了', () => ({ ...distinctiveRecord(), game: { ...distinctiveGame(), board: distinctiveGame().board.map((row) => row.slice(0, 3)) } })],
    ['方块少了 value', () => ({ ...distinctiveRecord(), game: { ...distinctiveGame(), board: [[{ id: 1 }], [], [], []] } })],
    ['方块 id 是 0', () => ({ ...distinctiveRecord(), game: { ...distinctiveGame(), board: [[{ id: 0, value: 2 }], [], [], []] } })],
    ['方块值是字符串', () => ({ ...distinctiveRecord(), game: { ...distinctiveGame(), board: [[{ id: 1, value: '2' }], [], [], []] } })],
    ['phase 不在四个里', () => ({ ...distinctiveRecord(), game: { ...distinctiveGame(), phase: 'won-and-gone' } })],
    ['endReason 不在四个里', () => ({ ...distinctiveRecord(), game: { ...distinctiveGame(), endReason: 'cheated' } })],
    ['score 是负数', () => ({ ...distinctiveRecord(), game: { ...distinctiveGame(), score: -1 } })],
    ['reachedTarget 是数字', () => ({ ...distinctiveRecord(), game: { ...distinctiveGame(), reachedTarget: 1 } })],
    ['nextTileId 是 0', () => ({ ...distinctiveRecord(), game: { ...distinctiveGame(), nextTileId: 0 } })],
    ['rngState 是 NaN', () => ({ ...distinctiveRecord(), game: { ...distinctiveGame(), rngState: Number.NaN } })],
    ['rngState 是字符串', () => ({ ...distinctiveRecord(), game: { ...distinctiveGame(), rngState: '7' } })],
    ['moves 是小数', () => ({ ...distinctiveRecord(), game: { ...distinctiveGame(), moves: 1.5 } })],
    ['deadline 是字符串', () => ({ ...distinctiveRecord(), game: { ...distinctiveGame(), deadline: '1700000000000' } })],
    ['deadline 是 NaN', () => ({ ...distinctiveRecord(), game: { ...distinctiveGame(), deadline: Number.NaN } })],
    ['historyLength 是负数', () => ({ ...distinctiveRecord(), historyLength: -1 })],
    ['historyLength 不是整数', () => ({ ...distinctiveRecord(), historyLength: 1.5 })],
    ['styleId 是未知风格', () => ({ ...distinctiveRecord(), styleId: 'aero' })],
    ['dailyDate 形状不对', () => ({ ...distinctiveRecord(), dailyDate: '2026-9-26' })],
    ['dailyDate 是数字', () => ({ ...distinctiveRecord(), dailyDate: 20260926 })],
    ['startedAt 是 0', () => ({ ...distinctiveRecord(), startedAt: 0 })],
    ['startedAt 是负数', () => ({ ...distinctiveRecord(), startedAt: -1 })],
    ['startedAt 是小数', () => ({ ...distinctiveRecord(), startedAt: 1.5 })],
    ['startedAt 是字符串', () => ({ ...distinctiveRecord(), startedAt: '2026-09-26' })],
    ['styleSwitches 是负数', () => ({ ...distinctiveRecord(), styleSwitches: -1 })],
    ['styleSwitches 是小数', () => ({ ...distinctiveRecord(), styleSwitches: 1.5 })],
    ['styleSwitches 是字符串', () => ({ ...distinctiveRecord(), styleSwitches: '3' })],
    ['styleSwitches 是 NaN', () => ({ ...distinctiveRecord(), styleSwitches: Number.NaN })],
  ]

  test.each(broken)('%s：整局按不可恢复处理', (_name, make) => {
    const parsed = decodeSession(make())
    expect(parsed.kind).toBe('rejected')
    if (parsed.kind !== 'rejected') return
    expect(parsed.reason).toBe('shape')
  })

  test('墙与空格是合法形状：别把正常存档拒了', () => {
    // 上面那一堆「拒绝」的判据同时是一道误杀风险：障碍与空格都必须在合法形状里
    const parsed = roundTrip(distinctiveRecord())
    expect(parsed.kind).toBe('ok')
  })
})

describe('dailyDate：与种子各存各的', () => {
  test('种子推不出日期，改种子也不改日期', () => {
    const date = '2026-09-26'
    const record = distinctiveRecord()
    const daily: SessionRecord = {
      ...record,
      dailyDate: date,
      // 故意把种子换成与这一天毫无关系的一个数：若实现从种子反推日期，
      // 恢复出来的日期就会跟着变——这一行就是那道闸门
      game: { ...record.game, initialSeed: 4242 },
    }

    const parsed = roundTrip(daily)

    expect(parsed.kind).toBe('ok')
    if (parsed.kind !== 'ok') return
    expect(parsed.record.dailyDate).toBe(date)
    expect(parsed.record.game.initialSeed).toBe(4242)
    // 顺带钉住哈希的性质：日期 → 种子这一段有雪崩，反向没有函数
    expect(seedFromUtcDate(date)).not.toBe(4242)
    expect(seedFromUtcDate('2026-09-27')).not.toBe(seedFromUtcDate(date))
  })

  test('非 Daily 的一局 dailyDate 恒为 null，恢复出来还是 null', () => {
    const parsed = roundTrip(distinctiveRecord())
    if (parsed.kind !== 'ok') throw new Error('应当读得出来')
    expect(parsed.record.dailyDate).toBeNull()
  })

  test('Daily 的日期串走完整往返：一个字符都不差', () => {
    const parsed = roundTrip({ ...distinctiveRecord(), dailyDate: '2026-01-01' })
    if (parsed.kind !== 'ok') throw new Error('应当读得出来')
    expect(parsed.record.dailyDate).toBe('2026-01-01')
  })
})

describe('本局风格切换次数：T19 要它跨过刷新活着', () => {
  test('给了一个就原样回来，一次都不差', () => {
    const parsed = roundTrip({ ...distinctiveRecord(), styleSwitches: 6 })
    if (parsed.kind !== 'ok') throw new Error('应当读得出来')
    expect(parsed.record.styleSwitches).toBe(6)
  })

  test('0 是合法值：一局一次没换过与换过三次是两回事，都得读得出来', () => {
    const parsed = roundTrip({ ...distinctiveRecord(), styleSwitches: 0 })
    if (parsed.kind !== 'ok') throw new Error('应当读得出来')
    expect(parsed.record.styleSwitches).toBe(0)
  })

  test('没有这个字段（T18 及更早开的局）照样能恢复，按「还没数过」收 0', () => {
    // 与 startedAt 同一条理由：那时没有人在数切换，0 是诚实的值。为它把整局拒掉，
    // 等于因为一个统计字段毁掉一局还能下的棋
    const { styleSwitches: _absent, ...withoutSwitches } = distinctiveRecord()
    const parsed = decodeSession(withoutSwitches)
    expect(parsed.kind).toBe('ok')
    if (parsed.kind !== 'ok') return
    expect(parsed.record.styleSwitches).toBe(0)
    // 其余字段一个都没少：拒绝的判据只针对给了却不对的值
    expect(parsed.record.startedAt).toBe(RUN_START)
  })

  test('显式 null 与缺字段同等对待：不是损坏，是「没记」', () => {
    // 用 unknown 接住：这一条就是要把一个形状不对的值递进去（T16 时代的存档可能
    // 什么都没有，也可能有 null），判据收不收它由 decodeSession 自己说
    const withNull: unknown = { ...distinctiveRecord(), styleSwitches: null }
    const parsed = decodeSession(withNull)
    expect(parsed.kind).toBe('ok')
    if (parsed.kind !== 'ok') return
    expect(parsed.record.styleSwitches).toBe(0)
  })

  test('assembleSession 把切换次数一并交出来', () => {
    // store 靠它落在 styleSwitches 上，于是刷新之后结算时读得到这一局切过几次
    const record: SessionRecord = { ...distinctiveRecord(), styleSwitches: 5, historyLength: 0 }
    const restored = assembleSession(record, [])
    expect(restored?.styleSwitches).toBe(5)
  })
})

describe('本局起始时刻：T17 的时长公式要从它推导', () => {
  test('给了一个就只能原样回来，一个毫秒都不差', () => {
    const parsed = roundTrip({ ...distinctiveRecord(), startedAt: RUN_START })
    if (parsed.kind !== 'ok') throw new Error('应当读得出来')
    expect(parsed.record.startedAt).toBe(RUN_START)
  })

  test('没有这个字段（T17 之前开的局）照样能恢复，起始时刻记 null', () => {
    // 不因为一个统计字段毁掉一局还能下的棋：那局的时长无从可知，结算时记 0，
    // 而分数与最高方块照记。整局拒掉是另一种处理，这里明确不选它
    const { startedAt: _absent, ...withoutStartedAt } = distinctiveRecord()
    const parsed = decodeSession(withoutStartedAt)
    expect(parsed.kind).toBe('ok')
    if (parsed.kind !== 'ok') return
    expect(parsed.record.startedAt).toBeNull()
    // 其余字段一个都没少：拒绝的判据只针对给了却不对的值
    expect(parsed.record.game).toEqual(distinctiveGame())
  })

  test('assembleSession 把起始时刻一并交出来，撤销历史一条都不少', () => {
    const record = distinctiveRecord()
    const restored = assembleSession(record, [
      distinctiveGame(),
      distinctiveGame(),
      distinctiveGame(),
    ])
    expect(restored?.startedAt).toBe(RUN_START)
    expect(restored?.history).toHaveLength(3)
  })
})

describe('撤销历史：一条都不许少', () => {
  test('条数对得上才组装得出来', () => {
    const record = distinctiveRecord()
    const entries = [distinctiveGame(), distinctiveGame(), distinctiveGame()]
    const restored = assembleSession(record, entries)
    expect(restored).not.toBeNull()
    expect(restored?.history).toHaveLength(3)
    expect(restored?.game).toEqual(record.game)
    expect(restored?.styleId).toBe(record.styleId)
  })

  test('少一条 / 多一条 = 撤不到开局，整局按不可恢复处理', () => {
    const record = distinctiveRecord()
    const entries = [distinctiveGame(), distinctiveGame(), distinctiveGame()]
    // 少一条：撤销到第 N 步时玩家会静默少一次可撤销——ADR-0003 禁的就是这个
    expect(assembleSession(record, entries.slice(0, 2))).toBeNull()
    // 多一条：historyLength 与实际内容不符，同样不能猜
    expect(assembleSession(record, [...entries, distinctiveGame()])).toBeNull()
  })

  test('某一条形状不对 = 整局不可恢复', () => {
    const record = distinctiveRecord()
    const entries: unknown[] = [distinctiveGame(), { id: 1 }, distinctiveGame()]
    expect(assembleSession(record, entries)).toBeNull()
  })

  test('开局那一局没有历史：0 条是合法的', () => {
    const record: SessionRecord = { ...distinctiveRecord(), historyLength: 0 }
    expect(assembleSession(record, [])).not.toBeNull()
  })
})

describe('写入失败那句话说的是实话', () => {
  test('配额用尽：说清是满了，并且先说撤销还在', () => {
    const message = writeFailureMessage(
      new DOMException('Simulated quota exceeded', 'QuotaExceededError')
    )
    expect(message).toContain('本地存储已满')
    // mode-contract §4 的口径顺序：先撤销还在，再刷新可能续不上。
    // 反过来说成「进度丢了」不是事实——这一页里的撤销栈一条都没少
    expect(message.indexOf('撤销仍然可用')).toBeLessThan(message.indexOf('刷新后可能无法继续'))
  })

  test('隐私模式 / 存储被禁用：说清是浏览器拒了', () => {
    for (const name of ['InvalidStateError', 'UnknownError']) {
      expect(writeFailureMessage(new DOMException('x', name))).toContain('浏览器拒绝了本地存储')
    }
  })

  test('认不出的错误也有兜底的一句，不许沉默', () => {
    for (const error of [new Error('boom'), 'string rejection', null, undefined]) {
      const message = writeFailureMessage(error)
      expect(message).toContain('保存失败')
      expect(message).toContain('撤销仍然可用')
    }
  })

  test('内部抛出的错误不会顺着 Promise 逃逸：字符串也是合法拒绝值', () => {
    // 平台错误被包成字符串拒绝是可能的（test 里、或者某个 polyfill 里），
    // 那句话仍然要能生成
    expect(writeFailureMessage('quota')).toContain('保存失败')
  })
})

describe('连存储都打不开那一句', () => {
  test('说的是「这一局无法恢复」加「开新游戏即可」', () => {
    const notice = storageUnavailableNotice()
    expect(notice.kind).toBe('restore-rejected')
    expect(notice.message).toContain('无法恢复')
    expect(notice.message).toContain('开始新游戏')
    // 不假装恢复成功，也不撒谎说数据丢了
    expect(notice.message).not.toContain('已恢复')
  })
})
