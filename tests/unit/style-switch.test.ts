import { describe, expect, test } from 'vitest'
import type { GameState } from '../../src/shared/types'
import type { StyleId } from '../../src/shared/types'
import {
  DEFAULT_THEME_ID,
  THEMES,
  getTheme,
} from '../../src/renderer/styles/themes'
import { useGameStore } from '../../src/renderer/stores/useGameStore'
import { stateWithBoard } from './support'

/**
 * T13 的风格切换：注册表 + 「切换只改呈现」这条不变量。
 *
 * 不变量是本票的第一条验收标准，也是 naive 实现最容易破的那一条：把 styleId 和 game 放进
 * 同一个 set()、或者顺手重算一次 derived 状态，看起来都「能用」，但棋盘对象换了引用，
 * T21 的位移动画与 zustand 的相等比较都会跟着出问题。所以这里断的是**整张字段表**，
 * 不是「分数没变」。
 */

/** 规则状态的十一个字段（src/shared/types.ts 的 GameState 全文），一个都不许少 */
const RULE_FIELDS: readonly (keyof GameState)[] = [
  'modeId',
  'board',
  'score',
  'reachedTarget',
  'phase',
  'endReason',
  'nextTileId',
  'initialSeed',
  'rngState',
  'moves',
  'deadline',
]

/**
 * 一份每个字段都不取默认值的对局：time-attack 打底（deadline 天然非 null），
 * 其余字段各给一个能认出来的数——断言落在一串巧合的初始值上就什么也证不了。
 */
function distinctiveGame(): GameState {
  return {
    ...stateWithBoard(
      [
        [2, 4, 8, 16],
        [32, 64, 128, 256],
        [512, 1024, 2048, null],
        [null, null, null, null],
      ],
      123456,
      'time-attack'
    ),
    score: 4242,
    moves: 9,
    nextTileId: 77,
    reachedTarget: true,
    // 'stuck' 而不是 'playing'：死局面板露着的时候也能换风格，这一档必须一起不动
    phase: 'stuck',
  }
}

/** 摆一份 store 状态进去（不碰规则，只为了有个现场） */
function mount(game: GameState): void {
  useGameStore.setState({
    game,
    dailyDate: '2026-09-26',
    history: [game],
    styleId: DEFAULT_THEME_ID,
    swapArmed: true,
    swapSelection: [0, 1],
  })
}

/** 只取规则字段，摊平成可逐项比对的形状 */
function ruleFields(game: GameState): Record<string, unknown> {
  const picked: Record<string, unknown> = {}
  for (const field of RULE_FIELDS) picked[field] = game[field]
  return picked
}

describe('风格注册表', () => {
  test('恰好注册三套，界面上不会出现第四套', () => {
    // StylePicker 只遍历 THEMES，所以这张表就是选择器的全部内容；
    // 不在表里的风格不可能出现在界面上（SPEC §3.2「注册表与选择器只暴露已完成风格」）
    expect(THEMES.map((theme) => theme.id)).toEqual(['classic', 'material', 'claude'])
    expect(THEMES.map((theme) => theme.label)).toEqual(['Classic', 'Material', 'Claude'])
    expect(DEFAULT_THEME_ID).toBe('classic')
  })

  test('getTheme 三套都取得到，未知 id 抛错而不是静默返回', () => {
    expect(getTheme('classic').id).toBe('classic')
    expect(getTheme('material').id).toBe('material')
    expect(getTheme('claude').id).toBe('claude')
    // StyleId 是编译期联合，运行期出现未知值说明类型被绕过了。
    // T13 断言的是 `getTheme('claude')` 抛错；T15 注册了 claude，于是这句话搬到下一个 id 上
    expect(() => getTheme('aero' as StyleId)).toThrow('未知风格：aero')
  })

  test('每套都交出两个装饰插槽（Board 无条件解构渲染它们）', () => {
    for (const theme of THEMES) {
      expect(typeof theme.boardOverlay, theme.id).toBe('function')
      expect(typeof theme.tileOverlay, theme.id).toBe('function')
      // 三套基准风格的插槽都渲染 null：Material 的层级感、Claude 的排印与细线
      // 全部由 CSS 表达（ADR-0002）
      expect(theme.boardOverlay(), theme.id).toBeNull()
      expect(theme.tileOverlay(), theme.id).toBeNull()
    }
  })
})

describe('setStyle：切换只写一个字段', () => {
  test('十一个规则字段逐项不变，且 game 是同一个对象引用', () => {
    const game = distinctiveGame()
    mount(game)

    const before = useGameStore.getState()
    const beforeFields = ruleFields(game)
    const snapshot = JSON.stringify(beforeFields)

    useGameStore.getState().setStyle('material')

    const after = useGameStore.getState()
    // 同一个引用，不只是「值相等」：game 换了引用，T21 的位移动画与 zustand 的
    // 相等比较会跟着出问题，而那种 damage 在截图上看不出来
    expect(after.game).toBe(before.game)
    expect(ruleFields(after.game as GameState)).toEqual(beforeFields)
    expect(JSON.stringify(after.game)).toBe(snapshot)
    // 该变的变了
    expect(after.styleId).toBe('material')
  })

  test('其余界面字段也不动：历史、每日日期、拾取态、选择态', () => {
    const game = distinctiveGame()
    mount(game)
    const before = useGameStore.getState()

    useGameStore.getState().setStyle('material')

    const after = useGameStore.getState()
    // 历史同一个引用：撤销栈不许因为换一次皮多一条或少一条
    expect(after.history).toBe(before.history)
    expect(after.history).toHaveLength(1)
    expect(after.dailyDate).toBe('2026-09-26')
    expect(after.swapArmed).toBe(true)
    expect(after.swapSelection).toEqual([0, 1])
  })

  test('同一个 id 重复调用连 state 都不换（引用相等即零重渲染）', () => {
    mount(distinctiveGame())
    useGameStore.getState().setStyle('material')
    const once = useGameStore.getState()

    useGameStore.getState().setStyle('material')

    expect(useGameStore.getState()).toBe(once)
  })

  test('来回切换：material → classic → material，规则状态与第一次切换后完全一致', () => {
    const game = distinctiveGame()
    mount(game)
    const snapshot = JSON.stringify(ruleFields(game))

    useGameStore.getState().setStyle('material')
    const afterFirst = useGameStore.getState()
    useGameStore.getState().setStyle('classic')
    useGameStore.getState().setStyle('material')

    const afterThird = useGameStore.getState()
    expect(afterThird.game).toBe(afterFirst.game)
    expect(JSON.stringify(afterThird.game)).toBe(snapshot)
    expect(afterThird.styleId).toBe('material')
  })

  test('换风格不碰时间：deadline 还是那个绝对时间戳', () => {
    // 限时模式的截止点是绝对时间戳；换皮若顺手重算一次计时就等于延长了本局
    const game = distinctiveGame()
    expect(game.deadline).not.toBeNull()
    mount(game)
    const deadline = useGameStore.getState().game?.deadline

    useGameStore.getState().setStyle('material')

    expect(useGameStore.getState().game?.deadline).toBe(deadline)
  })
})

describe('T15：Claude 也走同一条不变量', () => {
  test('classic → claude：十一个字段逐项不变，且 game 是同一个对象引用', () => {
    const game = distinctiveGame()
    mount(game)

    const before = useGameStore.getState()
    const beforeFields = ruleFields(game)
    useGameStore.getState().setStyle('claude')
    const after = useGameStore.getState()

    // 引用相等，不只是值相等：game 换了引用，T21 的位移动画与 zustand 的相等比较会跟着出问题
    expect(after.game).toBe(before.game)
    expect(ruleFields(after.game as GameState)).toEqual(beforeFields)
    expect(after.history).toBe(before.history)
    expect(after.dailyDate).toBe('2026-09-26')
    expect(after.swapSelection).toEqual([0, 1])
    expect(after.styleId).toBe('claude')
  })

  test('三套风格一轮游 classic → claude → material → classic，规则状态与引用都不动', () => {
    // T15 派发令点名的组合。逐个引用比对：轮完一圈回到 classic，history 与 game 都还是
    // 出发时那两个对象——而不是「每一轮重建一份值相等的」
    const game = distinctiveGame()
    mount(game)
    const snapshot = JSON.stringify(ruleFields(game))
    const start = useGameStore.getState()

    useGameStore.getState().setStyle('claude')
    const afterClaude = useGameStore.getState()
    useGameStore.getState().setStyle('material')
    const afterMaterial = useGameStore.getState()
    useGameStore.getState().setStyle('classic')
    const afterClassic = useGameStore.getState()

    for (const state of [afterClaude, afterMaterial, afterClassic]) {
      expect(state.game).toBe(start.game)
      expect(state.history).toBe(start.history)
    }
    expect(JSON.stringify(afterClassic.game)).toBe(snapshot)
    expect(afterClassic.styleId).toBe('classic')
    expect(afterClaude.styleId).toBe('claude')
    expect(afterMaterial.styleId).toBe('material')
  })
})
