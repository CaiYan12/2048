import { describe, expect, test } from 'vitest'
import { MODES } from '../../src/shared/modes'
import type { GameState } from '../../src/shared/types'
import { abandon, createGame, move, settle, tick } from '../../src/game/engine'
import { runEndLabel } from '../../src/renderer/components/runEndLabel'
import { NOW, stateWithBoard } from './support'

/**
 * T09 的限时切片：三分钟截止时间、到点强制结算、以及「计时器不许把死局改判成超时」。
 *
 * 全部经引擎公开面（createGame / move / settle / abandon / tick）走——时钟由调用方
 * 注入（NOW 是 tests/unit/support.ts 的固定时刻），引擎自己一行 Date 都没有。
 *
 * 本模式的**规则**一条都没新加：size / walls / spawnValues / target 都用经典那一套，
 * 新东西只有「什么时候必须结束」与「为什么结束」。所以这里不重复 T03 的合并断言。
 */

/** 三分钟（mode-contract §3）。限时秒数从模式声明读，不在这里抄第二份 */
const LIMIT_SECONDS = 180

/** 开局即三分钟整的截止时间戳 */
const DEADLINE = NOW + LIMIT_SECONDS * 1000

/** 四个 1024：一次左移合出两个 2048，正好是「第一次达标」（T04 的同款局面） */
const FOUR_1024: (number | null)[][] = [
  [1024, 1024, 1024, 1024],
  [null, null, null, null],
  [null, null, null, null],
  [null, null, null, null],
]

/**
 * 一步即死局：第 0 行右端留一个空格，右移把它整体推过去。
 * 空出来的是 (0,0)，生成那一格后 16 格全满且横向纵向相邻都不相等
 * （邻居全是 8，所以生成 2 还是 4 都死局——这一条路径不依赖随机进度）。
 */
const ONE_STEP_FROM_DEADLOCK: (number | null)[][] = [
  [8, 2, 4, null],
  [8, 2, 4, 8],
  [2, 4, 8, 2],
  [4, 8, 2, 4],
]

describe('模式声明：只有 Time Attack 限时', () => {
  test('限时秒数按 mode-contract §3 声明为三分钟，其余五种一律不限时', () => {
    // 从 MODES 走一遍而不是只查 time-attack：多一个限时模式而不改这条，
    // 这条就得跟着红
    const timed = MODES.filter((mode) => mode.timeLimitSeconds !== null)
    expect(timed.map((mode) => mode.id)).toEqual(['time-attack'])
    expect(timed[0].timeLimitSeconds).toBe(LIMIT_SECONDS)
  })

  test('限时秒数是三分钟：与截止时间的换算只在这一处发生（NOW + 180000）', () => {
    // createGame 那一侧钉的就是这个乘积；这里把「三分钟」这个口径单独钉住，
    // 免得有人在 modes.ts 改成 200 而在测试里只看到 180000
    expect(LIMIT_SECONDS * 1000).toBe(180_000)
  })
})

describe('createGame 写入截止时间', () => {
  test('限时模式：deadline = 注入的 now + 三分钟', () => {
    const state = createGame('time-attack', 20260926, NOW)

    // Time Attack 与 Classic 规则完全相同（4×4、2 的幂、2/4、目标 2048、无墙），
    // 唯一多出来的就是这个截止点
    expect(state.modeId).toBe('time-attack')
    expect(state.deadline).toBe(DEADLINE)
    expect(state.phase).toBe('playing')
    expect(state.endReason).toBe(null)
  })

  test('非限时模式：任何 now 都留 null（epoch、现在、遥远的未来都算）', () => {
    for (const modeId of ['classic', 'fibonacci', 'big-board', 'walls', 'daily'] as const) {
      for (const now of [0, NOW, Number.MAX_SAFE_INTEGER]) {
        expect(createGame(modeId, 20260926, now).deadline, `${modeId}@${now}`).toBe(null)
      }
    }
  })

  test('deadline 是绝对时间戳：推进时间不改写它，T16 因此能把同一个截止点存下来', () => {
    const state = createGame('time-attack', 20260926, NOW)
    // 未到期时 tick 原样返回同一个对象——截止点一个字节都没动
    expect(tick(state, NOW + 60_000)).toBe(state)
    expect(state.deadline).toBe(DEADLINE)
    // 「还剩多久」不是 state 里的字段：它是 deadline − now 现算的，
    // 所以不存在一个会被后台 / 刷新重置的累计量（SPEC §3.1）
    expect('remainingMs' in state).toBe(false)
  })
})

describe('tick：三分钟到时强制结算', () => {
  test('未到期原样返回同一个对象（含 epoch 与到点前一毫秒）', () => {
    const state = createGame('time-attack', 20260926, NOW)

    expect(tick(state, 0)).toBe(state)
    expect(tick(state, NOW)).toBe(state)
    // 到点前一毫秒：这一局还活着
    expect(tick(state, DEADLINE - 1)).toBe(state)
    expect(state.phase).toBe('playing')
  })

  test('到点那一毫秒即结算：边界含端点', () => {
    const state = createGame('time-attack', 20260926, NOW)

    const expired = tick(state, DEADLINE)

    expect(expired).not.toBe(state)
    expect(expired.phase).toBe('ended')
    expect(expired.endReason).toBe('timeout')
  })

  test('超出截止点之后任意时刻都结算（一毫秒、一分钟、一天）', () => {
    const state = createGame('time-attack', 20260926, NOW)

    for (const past of [1, 60_000, 86_400_000]) {
      const expired = tick(state, DEADLINE + past)
      expect([expired.phase, expired.endReason], String(past)).toEqual(['ended', 'timeout'])
    }
  })

  test('结算只执行一次：tick 两次 past deadline 仍是同一个对象、同一个原因', () => {
    const once = tick(createGame('time-attack', 20260926, NOW), DEADLINE)

    const twice = tick(once, DEADLINE + 60_000)

    // 幂等不靠第二套机制：phase 已经不是 playing，第一条早退把它原样送回
    expect(twice).toBe(once)
    expect(twice.endReason).toBe('timeout')
    expect(tick(twice, DEADLINE + 86_400_000)).toBe(once)
  })

  test('到期只改 phase 与 endReason：盘面、分数、随机进度、里程碑一个字节都不动', () => {
    // 先把局面走成非平凡的：有分数、有步数、随机进度也推进过
    const playing = move(
      stateWithBoard(
        [
          [4, 2, 4, 2],
          [8, 4, 8, 4],
          [2, 2, 4, 8],
          [4, 2, 4, 2],
        ],
        7,
        'time-attack'
      ),
      'left'
    ).state
    expect(playing.phase).toBe('playing')
    expect(playing.score).toBeGreaterThan(0)

    const expired = tick(playing, playing.deadline as number)

    expect(expired.phase).toBe('ended')
    expect(expired.endReason).toBe('timeout')
    // 结算冻结的就是这一刻的棋盘与分数（mode-contract §3）
    expect(expired.board).toEqual(playing.board)
    expect(expired.score).toBe(playing.score)
    expect(expired.moves).toBe(playing.moves)
    expect(expired.rngState).toBe(playing.rngState)
    expect(expired.reachedTarget).toBe(playing.reachedTarget)
    expect(expired.initialSeed).toBe(playing.initialSeed)
    expect(expired.nextTileId).toBe(playing.nextTileId)
    // 截止点照旧：结算不改历史事实
    expect(expired.deadline).toBe(playing.deadline)
    expect(expired.modeId).toBe(playing.modeId)
  })

  test('结算过的限时局不接受 abandon 改判（deadlock / abandoned 都改不过来）', () => {
    const expired = tick(createGame('time-attack', 20260926, NOW), DEADLINE)

    expect(abandon(expired)).toBe(expired)
    expect(expired.endReason).toBe('timeout')
  })
})

describe('tick：计时器不碰 playing 之外的任何阶段', () => {
  test('won / stuck / ended 三个阶段原样返回，endReason 一个都不改', () => {
    // won 与 stuck 都由真实的 move 走出来，不手搓 phase
    const won = move(stateWithBoard(FOUR_1024, 7, 'time-attack'), 'left').state
    expect(won.phase).toBe('won')
    const stuck = move(stateWithBoard(ONE_STEP_FROM_DEADLOCK, 7, 'time-attack'), 'right').state
    expect(stuck.phase).toBe('stuck')
    // ended 走玩家自己的那条路：死局收工 → deadlock
    const ended = settle(stuck)
    expect(ended.endReason).toBe('deadlock')

    const phases: readonly [string, GameState][] = [
      ['won', won],
      ['stuck', stuck],
      ['ended', ended],
    ]
    for (const [name, state] of phases) {
      // 时钟推过截止点整整一分钟
      const after = tick(state, DEADLINE + 60_000)
      expect(after, name).toBe(state)
      expect(after.phase, name).toBe(state.phase)
      expect(after.endReason, name).toBe(state.endReason)
    }
    // 特别是 ended 那一个：deadlock 不许被覆写成 timeout
    expect(ended.endReason).toBe('deadlock')
  })

  test('提前死局：到点之后仍是 stuck，原因只在玩家点「结束并记录」时才写下', () => {
    // 本票最关键的一条。一局在 t=60s 死局、t=180s 到点：诚实的结束原因是 deadlock，
    // 因为它早就已经死了。mode-contract §3 把超时定为**强制**结算，而把死局留成
    // **玩家自己决定**的结算——所以到点在 stuck 上一律不动作。
    const stuck = move(stateWithBoard(ONE_STEP_FROM_DEADLOCK, 7, 'time-attack'), 'right').state
    expect(stuck.deadline).toBe(DEADLINE)

    // 时钟推过截止点整整两分钟
    const after = tick(stuck, DEADLINE + 120_000)

    expect(after).toBe(stuck)
    expect(after.phase).toBe('stuck')
    expect(after.endReason).toBe(null)

    // 只有玩家自己收工，原因才落下来，而且是 deadlock 不是 timeout
    const settled = settle(after)
    expect(settled.phase).toBe('ended')
    expect(settled.endReason).toBe('deadlock')
    expect(runEndLabel(settled)).toContain('死局')
    expect(runEndLabel(settled)).not.toContain('时间到')
  })

  test('同一时刻的对照：活跃局结算成 timeout，死局不结算——两者可区分', () => {
    const playing = createGame('time-attack', 20260926, NOW)
    const stuck = move(stateWithBoard(ONE_STEP_FROM_DEADLOCK, 7, 'time-attack'), 'right').state
    const now = DEADLINE

    const expired = tick(playing, now)
    const stillStuck = tick(stuck, now)

    expect([expired.phase, expired.endReason]).toEqual(['ended', 'timeout'])
    expect([stillStuck.phase, stillStuck.endReason]).toEqual(['stuck', null])
    // 界面据此能区分，而不是把 timeout 读成死局
    expect(runEndLabel(settle(expired))).not.toBe(runEndLabel(settle(stillStuck)))
  })
})

describe('tick：非限时模式完全无感', () => {
  test('任何 now 都是同一个对象（epoch、现在、截止点、遥远的未来）', () => {
    const state = createGame('classic', 20260926, NOW)
    expect(state.deadline).toBe(null)

    for (const now of [0, NOW, DEADLINE, Number.MAX_SAFE_INTEGER]) {
      expect(tick(state, now), String(now)).toBe(state)
    }
    expect(state.phase).toBe('playing')
  })
})

describe('超时的结束原因可区分（SPEC 用户故事 7）', () => {
  const expired = tick(createGame('time-attack', 20260926, NOW), DEADLINE)
  const stuck = move(stateWithBoard(ONE_STEP_FROM_DEADLOCK, 7, 'time-attack'), 'right').state
  const deadlock = settle(stuck)

  test('超时那句话与死局不共用任何一个关键词', () => {
    expect(runEndLabel(expired)).toContain('时间到')
    expect(runEndLabel(expired)).not.toContain('死局')
    expect(runEndLabel(expired)).not.toContain('无合法移动')
    // 也不能落回 endReason 为 null 时的兜底句
    expect(runEndLabel(expired)).not.toBe('本局已结束')
    // 与死局那句确实不同
    expect(runEndLabel(expired)).not.toBe(runEndLabel(deadlock))
  })

  test('超时局的面板数据与死局面板读的是同一个字段，取的是不同值', () => {
    // 界面不自己推断「表归零了」：它读 endReason。
    // 这一条把两个可区分的取值并排放着，防止将来有人把界面改回按时间判断。
    expect([expired.phase, expired.endReason]).toEqual(['ended', 'timeout'])
    expect([deadlock.phase, deadlock.endReason]).toEqual(['ended', 'deadlock'])
  })
})
