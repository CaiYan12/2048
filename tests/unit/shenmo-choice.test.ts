import { describe, expect, test } from 'vitest'
import type { ShenmoOutcome } from '../../src/game/achievements'
import {
  INITIAL_SHENMO,
  nextShenmo,
  SHENMO_CODE,
  shenmoAfterRunChange,
  shenmoCleared,
  shenmoNewRun,
  type ShenmoInput,
  type ShenmoLeavingFrom,
  type ShenmoStage,
  type ShenmoState,
} from '../../src/renderer/components/ShenmoChoice'
import type { Direction } from '../../src/shared/types'

/**
 * 「一念神魔」的 pure machine（T29 · 父规格的架构决策 1–6）
 *
 * 这个文件里没有 React、没有浏览器：`nextShenmo` 是纯函数，「码缓冲怎么攒、阶段怎么迁、
 * 每个结局授予什么、一遍怎么算」全部判断都在它里面，所以能在这里逐条驱动。挂不挂得上
 * （DOM、动画、指针、两颗圆钮的位置）归 tests/e2e/shenmo.spec.ts。
 *
 * 边界说清楚，免得读的人以为它证了更多：
 *   · **不证时长**。30 秒只活在 CSS 里（`styles/index.css`），这里没有第二个副本，
 *     这一层连一个计时字段都不给（`ShenmoState` 只有 typed / stage / leavingFrom /
 *     outcome / key / passes——`passes` 数的是走过几遍，不是过了多久）。
 *   · **不证 WASD 等价**。机器吃的是 `Direction`，方向键与 WASD 的归一在 App 的
 *     `MOVE_KEYS` 里。所以这里只用「方向」说话——真实按键那一半由 e2e 打。
 */

/**
 * 一个「动作」：一个方向、点一颗钮、破碎播完、一段窗口到期、收起、或者退场播完。
 *
 * 用一张可以写的联合而不是 `ShenmoInput`：用例要能一行写完 `press(EMPTY, [...CODE, 'a'])`
 * 这种序列，而 `ShenmoInput` 是机器那边的判别联合，写起来要在每一项上重复 `kind`。
 *
 * `exit`（T35）是宿主报「退场动画播完了」的那一下，喂给机器的是 `{ kind: 'left' }。
 * **它不能叫 `'left'`**：那与方向 `left`（口诀第五、七下）撞名，`inputOf` 会把五、七两下
 * 当成退场指令——整份用例会安静地一个码都攒不起来。连开的两个结局之间必须垫它：否则
 * 机器停在 `leaving` 上，方向键与点钮都是空气，第二个摊根本不会被召出来。
 */
type Step = Direction | 'a' | 'b' | 'broke' | 'window1' | 'window2' | 'away' | 'exit'

function inputOf(step: Step): ShenmoInput {
  if (step === 'a' || step === 'b') return { kind: 'choose', button: step }
  if (step === 'broke') return { kind: 'broke' }
  if (step === 'window1') return { kind: 'window', window: 1 }
  if (step === 'window2') return { kind: 'window', window: 2 }
  if (step === 'away') return { kind: 'away' }
  if (step === 'exit') return { kind: 'left' }
  return { kind: 'direction', direction: step }
}

/** 把一串动作按顺序喂进机器。返回最后那个状态与一路上结出的所有果 */
function press(state: ShenmoState, steps: readonly Step[]): PressResult {
  const outcomes: ShenmoOutcome[] = []
  let current = state
  for (const step of steps) {
    const result = nextShenmo(current, inputOf(step))
    current = result.state
    if (result.outcome !== null) outcomes.push(result.outcome)
  }
  return { state: current, outcomes }
}

/** 一串动作的回报 */
interface PressResult {
  state: ShenmoState
  outcomes: ShenmoOutcome[]
}

/** 只按方向 */
function type(state: ShenmoState, ...directions: Direction[]): ShenmoState {
  return press(state, directions).state
}

/**
 * 播完退场（T35）：`leaving` → `idle`。终局之后要接着打下一套码、或再走一遍，就得先垫
 * 这一下——机器停在退场中时方向与点钮都是空气（那 150ms 里按烂键盘也不该召出下一个摊）。
 */
function afterExit(state: ShenmoState): ShenmoState {
  return press(state, ['exit']).state
}

/** 神魔码本身， shorthand */
const CODE = SHENMO_CODE

/** 空场 */
const EMPTY = INITIAL_SHENMO

describe('神魔码：八下方向', () => {
  test('口诀就是经典游戏机的那一段方向：up up down down left right left right', () => {
    expect([...CODE]).toEqual(['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right'])
    // 八下，不是六下、不是十下。父规格的 Goal 段与 issue 的标题段都把序列写全了，
    // 而两处正文里的「six presses / 六下」是笔误——本文件用长度把它钉住
    expect(CODE).toHaveLength(8)
  })

  test('空场上按下第一下之前，码一个都没攒', () => {
    expect(EMPTY.typed).toBe(0)
    expect(EMPTY.stage).toBe('idle')
  })

  test('八下全对：摊现身，同时码缓冲归零', () => {
    const result = press(EMPTY, CODE)
    expect(result.state.stage).toBe('choice')
    expect(result.outcomes).toEqual([])
    // 摊开着时码缓冲已经没有意义——不清零的话，摊收起来那一瞬间会凭空再召一次
    expect(result.state.typed).toBe(0)
  })

  test('少一下都不现身：前七下按对，第八下还没按', () => {
    const state = type(EMPTY, ...CODE.slice(0, 7))
    expect(state.stage).toBe('idle')
    expect(state.typed).toBe(7)
    const done = type(state, CODE[7])
    expect(done.stage).toBe('choice')
  })

  test('一个错键整个清空，而且清回 0——不是「拿这个错键当地一键重新匹配」', () => {
    // 第七下本该是 left，按了 up：整个清空。**不是**「up 正好是第一下，于是从 1 重来」
    const almost = type(EMPTY, ...CODE.slice(0, 6))
    const wrong = type(almost, 'up')
    expect(wrong.typed).toBe(0)
    expect(wrong.stage).toBe('idle')
    // 从零开始真要把八下重新打完
    expect(type(wrong, ...CODE).stage).toBe('choice')
  })

  test('错在第二下也一样：第一下白按', () => {
    expect(type(type(EMPTY, 'up'), 'up').typed).toBe(2)
    // 第二下本该是 up，按 down：清回 0
    expect(type(type(EMPTY, 'up'), 'down').typed).toBe(0)
  })

  test('无效方向也计数：机器不看结果，只看按了哪一下', () => {
    // 判据在 App：`hear` 紧跟在 `move()` 后面无条件调用，而引擎对无效移动原样返回。
    // 这一层因此没有任何「有效吗」的入参——这是父规格架构决策 1 的直接后果，
    // 也是为什么 e2e 要用一个「↑ 推不动」的夹具去证它
    const state = type(EMPTY, ...CODE)
    expect(state.stage).toBe('choice')
  })

  test('摊开着不攒码：方向照样被旁听到，但一个都不进缓冲', () => {
    // 否则第一段窗口一到期，紧接着那几下会把第二个摊当场召出来
    const open = type(EMPTY, ...CODE)
    const after = press(open, ['up', 'up', 'down', 'down'])
    expect(after.state.typed).toBe(0)
    expect(after.state.stage).toBe('choice')
    // 一路按到底也不会有第二个摊、也不会结出任何果
    expect(press(after.state, [...CODE]).outcomes).toEqual([])
  })

  test('没有时间窗：状态里连一个时间字段都没有，攒到一半放一晚上照样接着算', () => {
    // 父规格用户故事 5「不设最短间隔」。这一层连表达时间的地方都没给，
    // 所以「隔了多久」在原理上不可能影响结果——只能靠形状证明
    const half = type(EMPTY, ...CODE.slice(0, 4))
    // 六个字段，一个与时间有关的都没有。`passes` 是 T32 的遍数计数器（当时授权加的），
    // 它数的是**发生过的几遍**，不是「过了多久」；`leavingFrom` 是 T35 的「退场从哪一档
    // 开始」，只在 `leaving` 时有值（平时是 null），同样与时间无关。所以这条用例的主张
    // 一字未改，只是名单多了两个与时间无关的字段。
    expect(Object.keys(half).sort()).toEqual([
      'leavingFrom',
      'outcome',
      'outcomeKey',
      'passes',
      'stage',
      'typed',
    ])
    expect(type(half, ...CODE.slice(4)).stage).toBe('choice')
  })
})

describe('抉择的阶段迁移', () => {
  test('点 B：摊进入破碎退场，此刻既没有果、也没有收起', () => {
    const open = type(EMPTY, ...CODE)
    const breaking = press(open, ['b'])
    expect(breaking.state.stage).toBe('breaking')
    expect(breaking.outcomes).toEqual([])
  })

  test('破碎播完：只剩 A 与那道环，第二段窗口从此开始', () => {
    const open = type(EMPTY, ...CODE)
    const ring = press(open, ['b', 'broke'])
    expect(ring.state.stage).toBe('ring')
    expect(ring.outcomes).toEqual([])
  })

  test('B 不在的时候点 B 是空气：碎了、只剩 A、以及从来没见过摊', () => {
    const open = type(EMPTY, ...CODE)
    const ring = press(open, ['b', 'broke'])
    expect(press(ring.state, ['b']).state.stage).toBe('ring')
    expect(press(EMPTY, ['b']).state.stage).toBe('idle')
  })

  test('破碎退场还没播完就点 A：算走完这一遍（玩家确实点过 B）', () => {
    const open = type(EMPTY, ...CODE)
    const result = press(open, ['b', 'a'])
    // 先落到退场（T35）：终局不再直接回 idle——那一下就是控制人抓到的硬切。
    // 退场从 `breaking` 开始，所以 DOM 上 B 还在（正碎着），跟着容器一起淡出去
    expect(result.state.stage).toBe('leaving')
    expect(result.state.leavingFrom).toBe('breaking')
    expect(result.outcomes).toEqual(['first-pass'])
    // 退场播完才归 idle。果与编号在这一路上一个字节都没丢（宿主早在 grant 那一刻收到果）
    const idle = afterExit(result.state)
    expect(idle.stage).toBe('idle')
    expect(idle.leavingFrom).toBeNull()
    expect(idle.outcome).toBe('first-pass')
    expect(idle.passes).toBe(1)
  })

  test('空场上点 A 是空气：没有摊就没有选项', () => {
    expect(press(EMPTY, ['a']).outcomes).toEqual([])
  })
})

describe('三个结局各授予什么', () => {
  test('先 B 后 A：道通成魔，摊先落到退场', () => {
    const open = type(EMPTY, ...CODE)
    const result = press(open, ['b', 'broke', 'a'])
    expect(result.outcomes).toEqual(['first-pass'])
    // 两段式主张（T35）：`leaving`（从 `ring` 退——B 早碎了，DOM 上只剩 A）→ `left` → idle
    expect(result.state.stage).toBe('leaving')
    expect(result.state.leavingFrom).toBe('ring')
    // 彩蛋进度是**结出的果**，不是「走到第几步」：收起之后 typed 归零，可以再打一遍
    expect(result.state.typed).toBe(0)
    const idle = afterExit(result.state)
    expect(idle.stage).toBe('idle')
    expect(idle.typed).toBe(0)
    expect(idle.outcome).toBe('first-pass')
  })

  test('先点 A：学艺不精，两颗一起退场', () => {
    const open = type(EMPTY, ...CODE)
    const result = press(open, ['a'])
    expect(result.outcomes).toEqual(['wrong-order'])
    // 摊收起 = 先落到退场。从 `choice` 退，所以 DOM 上 A 与 B 都还在，一起淡出去——
    // 「两颗一起退场」从硬切变成了两段，这正是本票要的那件事
    expect(result.state.stage).toBe('leaving')
    expect(result.state.leavingFrom).toBe('choice')
    expect(afterExit(result.state).stage).toBe('idle')
  })

  test('放任第一段窗口流尽：静默收起，什么都不授予', () => {
    const open = type(EMPTY, ...CODE)
    const result = press(open, ['window1'])
    expect(result.outcomes).toEqual([])
    // 一个打错的码不该指控任何人（父规格架构决策 5）——**静默说的是不授予**，不是
    // 「菜单原地蒸发」：那 30 秒流尽也是一条终局，退场照旧播（T35）
    expect(result.state.stage).toBe('leaving')
    expect(result.state.leavingFrom).toBe('choice')
    expect(result.state.typed).toBe(0)
    expect(afterExit(result.state).stage).toBe('idle')
  })

  test('放任第二段窗口流尽：当断即断', () => {
    const open = type(EMPTY, ...CODE)
    const result = press(open, ['b', 'broke', 'window2'])
    expect(result.outcomes).toEqual(['hesitated'])
    // 两段式主张（T35）：从 `ring` 退（只剩 A 与那道环），播完才 idle
    expect(result.state.stage).toBe('leaving')
    expect(result.state.leavingFrom).toBe('ring')
    expect(afterExit(result.state).stage).toBe('idle')
  })

  test('每段窗口只在自己那一段到期', () => {
    const open = type(EMPTY, ...CODE)
    const ring = press(open, ['b', 'broke']).state
    // 走到只剩 A 的时候，第一段窗口的那 30 秒**不算数**：玩家确实动了手
    expect(press(ring, ['window1']).state.stage).toBe('ring')
    expect(press(ring, ['window1']).outcomes).toEqual([])
    // 反过来，摊刚开的时候第二段窗口到不了期
    expect(press(open, ['window2']).outcomes).toEqual([])
    expect(press(open, ['window2']).state.stage).toBe('choice')
  })

  test('破碎退场进行到一半时第一段窗口到点：照样不算放任', () => {
    // B 是玩家点的，30 秒的最后一刻点了手，凭什么判他犹豫
    const open = type(EMPTY, ...CODE)
    const result = press(open, ['b', 'window1'])
    expect(result.state.stage).toBe('breaking')
    expect(result.outcomes).toEqual([])
    // 破碎播完之后第二段窗口自己开始走
    expect(press(result.state, ['broke']).state.stage).toBe('ring')
  })

  test('Esc：先落到退场再由 left 归 idle，什么都不授予；外部打断才真的立刻收起', () => {
    const open = type(EMPTY, ...CODE)
    // 第一半：**Esc 走机器的 `away`，它播退场**（T35）。菜单是玩家自己收的，那一下值得
    // 被看见；三个姿势各来一次，每一个都先落 `leaving`、再由 `left` 归 idle
    for (const state of [open, press(open, ['b']).state, press(open, ['b', 'broke']).state]) {
      const result = press(state, ['away'])
      expect(result.state.stage).toBe('leaving')
      expect(result.state.leavingFrom).toBe(state.stage)
      expect(result.state.typed).toBe(0)
      expect(result.outcomes).toEqual([])
      expect(afterExit(result.state).stage).toBe('idle')
    }
    // 第二半：**外部打断不 anim**（换阶段 / 换局由 hook 直接调 `shenmoCleared` /
    // `shenmoNewRun`，不经 `nextShenmo`）。那一瞬结果层正在盖上来或新局已开，一个正在
    // 淡出的菜单只会挡住玩家要看的东西——所以这一条边界必须与上面那半分开钉，
    // 而不是让「收起」只有一种形状
    for (const state of [open, press(open, ['b']).state, press(open, ['b', 'broke']).state]) {
      expect(shenmoCleared(state).stage).toBe('idle')
      expect(shenmoCleared(state).leavingFrom).toBeNull()
    }
    expect(shenmoAfterRunChange('playing@111', 'won@111', open).stage).toBe('idle')
    expect(shenmoAfterRunChange('playing@111', 'playing@222', open)).toEqual(INITIAL_SHENMO)

    // 攒到一半被打断：码缓冲一起清零，半句口诀不能过会儿自己长完。
    // 空场上的 Esc 不进退场（没有摊可退），只把码缓冲擦掉
    const half = type(EMPTY, ...CODE.slice(0, 5))
    expect(press(half, ['away']).state.typed).toBe(0)
    expect(press(half, ['away']).state.stage).toBe('idle')
  })
})

describe('一遍怎么算', () => {
  test('只有完整的 B → A 算一遍：先点 A 与放任流尽都不推进任何东西', () => {
    const open = type(EMPTY, ...CODE)
    // 先点 A：结出一个果，但那一遍没有完成
    expect(press(open, ['a']).outcomes).toEqual(['wrong-order'])
    // 放任流尽：结出另一个果，那一遍也没有完成
    expect(press(open, ['window1']).outcomes).toEqual([])
    expect(press(open, ['b', 'broke', 'window2']).outcomes).toEqual(['hesitated'])
    // 机器自己**数遍数**（`passes`，T32 起的字段）：store 那个 `shenmoOutcomes` 幂等，
    // 同一个果只留一条，它答不了「这是第几遍」（父规格架构决策 2/6）——所以数遍数只能
    // 发生在「一遍怎么算」这条规则的家里。而**换局会把它清零**（`shenmoNewRun`）：一轮
    // 只属于某一局，走过的遍数不跨局累积
  })

  test('同一个果可以结第二次：编号跟着动，字可以不变', () => {
    // 垫一个 `left`（T35）：第一个结局之后机器停在退场中，不播完那一下的话方向与点钮
    // 都是空气，第二套码根本打不进来
    const first = press(EMPTY, [...CODE, 'a', 'exit']).state
    const second = press(first, [...CODE, 'a'])
    expect(second.state.outcome).toBe('wrong-order')
    // 字没变，编号变了——宿主靠编号认「又一次」，否则第二次会被同一条 effect 依赖吃掉
    expect(second.state.outcomeKey).toBe(first.outcomeKey + 1)
    expect(second.outcomes).toEqual(['wrong-order'])
  })

  test('一整局可以走出「错序 → 完整一遍 → 犹豫」的顺序', () => {
    // 三个结局各垫一个 `left`（T35）：退场播完那一下是「下一个摊可以开了」的信号
    const wrong = press(EMPTY, [...CODE, 'a', 'exit']).state
    const passed = press(wrong, [...CODE, 'b', 'broke', 'a', 'exit']).state
    const hesitated = press(passed, [...CODE, 'b', 'broke', 'window2', 'exit']).state
    expect(hesitated.outcomeKey).toBe(3)
    // 三次都是真的发生过的事，一次都没被后一次抵消
    expect([wrong.outcome, passed.outcome, hesitated.outcome]).toEqual([
      'wrong-order',
      'first-pass',
      'hesitated',
    ])
  })
})

// —— 二念（T32 · 父规格的架构决策 6 / 8 / 10）——
// 这一组是 T32 加的：T29 那 24 条彼时逐字未改，是对「没弄坏既有行为」的判据。T35
// （本票，菜单退场）之后其中断「终局之后 stage 是 idle」的几条按两段式改写，一条都没删
// ——理由与清单写在下面那一组的注释里。新行为（遍数计数器与第二个果）的全部判断都在这里。
describe('二念：一遍只数完整走完 B → A，第二遍结出的是另一个果', () => {
  /** 把一串动作一步一步喂进去，记下每一步之后的阶段与一路上结出的果 */
  function trace(
    state: ShenmoState,
    steps: readonly Step[]
  ): { stages: ShenmoStage[]; outcomes: ShenmoOutcome[] } {
    const stages: ShenmoStage[] = []
    const outcomes: ShenmoOutcome[] = []
    let current = state
    for (const step of steps) {
      const result = nextShenmo(current, inputOf(step))
      current = result.state
      stages.push(current.stage)
      if (result.outcome !== null) outcomes.push(result.outcome)
    }
    return { stages, outcomes }
  }

  /** 完整走一遍：打码 → B → 破碎播完 → A */
  const PASS: readonly Step[] = [...CODE, 'b', 'broke', 'a']

  test('第一遍结一念的果，第二遍结二念的果，遍数计数器一路数下去', () => {
    // 两遍之间垫一个 `left`（T35）：第一遍的退场播完，第二套码才打得进来
    const first = press(EMPTY, [...PASS, 'exit'])
    expect(first.outcomes).toEqual(['first-pass'])
    expect(first.state.passes).toBe(1)

    const second = press(first.state, PASS)
    expect(second.outcomes).toEqual(['second-pass'])
    expect(second.state.passes).toBe(2)
    // 摊每一次都真的收起来了：扣下是渲染层的事，机器这边只负责「果子熟了」。
    // 而「收起来」如今是两段——落到 `leaving`（从 `ring` 退），播完才 idle
    expect(second.state.stage).toBe('leaving')
    expect(second.state.leavingFrom).toBe('ring')
    expect(afterExit(second.state).stage).toBe('idle')
  })

  test('先点 A 与放任两段窗口流尽都不推进遍数', () => {
    // 把三种「不算一遍」的路各走一遍，遍数一个都不该动。三条路各垫一个 `left`（T35）：
    // 每一条都是终局，退场播完那一下才让下一条路走得进来
    const wrongOrder = press(EMPTY, [...CODE, 'a', 'exit']).state
    const letWindowOne = press(wrongOrder, [...CODE, 'window1', 'exit']).state
    const hesitated = press(letWindowOne, [...CODE, 'b', 'broke', 'window2', 'exit']).state
    expect(hesitated.passes).toBe(0)
    // 两个果、两次编号（第一段窗口静默收起不结果，所以不占编号）
    expect(hesitated.outcomeKey).toBe(2)

    // 而这三个「不算」之后再走一遍完整的 B → A，仍然是**第一遍**
    const after = press(hesitated, PASS)
    expect(after.outcomes).toEqual(['first-pass'])
    expect(after.state.passes).toBe(1)
  })

  test('第三遍及以后每一遍都是二念的果：轮回没有第三种果', () => {
    let state = press(EMPTY, [...PASS, 'exit']).state
    const outcomes: ShenmoOutcome[] = ['first-pass']
    for (let index = 0; index < 3; index += 1) {
      const next = press(state, [...PASS, 'exit'])
      outcomes.push(next.outcomes[0])
      state = next.state
    }
    // 一念、二念、二念、二念——笑话在「你又来了一遍」，不在编号
    expect(outcomes).toEqual(['first-pass', 'second-pass', 'second-pass', 'second-pass'])
    expect(state.passes).toBe(4)
    expect(state.outcomeKey).toBe(4)
  })

  test('遍数不跟着 away / 收起清零：Esc 收掉的是摊，不是走过的路', () => {
    const passed = press(EMPTY, [...PASS, 'exit']).state
    expect(passed.passes).toBe(1)
    // Esc（`away`）与 hook 里那条 `shenmoCleared` 都只清码缓冲与摊
    expect(shenmoCleared(passed).passes).toBe(1)
    expect(press(passed, ['away']).state.passes).toBe(1)
    // 于是收起来再打一遍，结的是二念的果，不是从零开始的一念
    expect(press(shenmoCleared(passed), PASS).outcomes).toEqual(['second-pass'])
  })

  test('第二遍摆出的摊与第一遍逐项相同，只有最后那一下的果不同', () => {
    // 两遍之间垫一个 `left`（T35）：第一遍的退场播完，第二套码才打得进来
    const first = trace(EMPTY, PASS)
    const second = trace(press(EMPTY, [...PASS, 'exit']).state, PASS)
    // 阶段迁移一格都不差：同一颗 B、同一场破碎、同一道环、同一颗 A
    expect(second.stages).toEqual(first.stages)
    // 八下攒码期间阶段一直是 idle（摊还没现身），所以有意义的是末四格——T35 起末位换了
    // 一个字：终局先落 `leaving`，宿主把退场播完的那一下 `left` 才归 idle
    expect(first.stages.slice(-4)).toEqual(['choice', 'breaking', 'ring', 'leaving'])
    // 差的一样只有一处：最后结出的果
    expect(first.outcomes).toEqual(['first-pass'])
    expect(second.outcomes).toEqual(['second-pass'])
  })

  test('破碎进行到一半点 A 也算这一遍：遍数与完整走完的另一半同一条规则', () => {
    // 与 T29「破碎退场还没播完就点 A：算走完这一遍」同一边界，只是这一遍数也动
    const first = press(EMPTY, [...CODE, 'b', 'a'])
    expect(first.outcomes).toEqual(['first-pass'])
    expect(first.state.passes).toBe(1)
    // 而摊刚开就点 A（错序）那一遍不动
    expect(press(EMPTY, [...CODE, 'a']).state.passes).toBe(0)
  })
})

// —— 菜单自己的退场（T35 · 人眼复核抓到的缺陷：有进场、没有任何退场）——
// 控制人的原话是「上上下下左右左右A》AB全消失没有动画」。修法照结果层 T27 那一套
// （ADR-0008 决策 9 / 10 + ResultPresence.ts）：机器多一个 `leaving` 阶段，终局先落到
// 它，宿主把退场动画播完的那一下 `left` 才归 `idle`。这一组钉的就是那段时间里机器的行为。
// 上面 T29 / T32 那两组里断言「终局之后 stage 是 idle」的用例已按本票逐条改成两段式
// （先 `leaving`、再由 `left` 归 idle），一条都没删——这是故意的行为变更，不是弱化。
describe('退场：终局先落 leaving，left 才归 idle', () => {
  /** 先点 A 之后那一刻的状态（`leaving`，从 `choice` 退） */
  function wrongOrderLeaving(): ShenmoState {
    return press(EMPTY, [...CODE, 'a']).state
  }

  test('每一条终局都落 leaving，且记住自己从哪一档退', () => {
    // 三个授予 + 第一段窗口静默流尽：四个出口，无一硬切（Esc 那条在上面「三个结局」那组
    // 与下面「退场中再按 Esc」各钉一次）。记住自己从哪一档退是为了 DOM 画得对——退场
    // 放的是同一个容器，而 `leaving` 这一个字不说 B 在不在
    const open = type(EMPTY, ...CODE)
    const exits: readonly [ShenmoState, ShenmoLeavingFrom | null][] = [
      [press(open, ['a']).state, 'choice'],
      [press(open, ['window1']).state, 'choice'],
      [press(open, ['b', 'broke', 'a']).state, 'ring'],
      [press(open, ['b', 'broke', 'window2']).state, 'ring'],
      [press(open, ['b', 'a']).state, 'breaking'],
    ]
    for (const [state, from] of exits) {
      expect(state.stage).toBe('leaving')
      expect(state.leavingFrom).toBe(from)
    }
  })

  test('left 归零：只有 leaving 认这一下，果与编号原样留着', () => {
    const leaving = wrongOrderLeaving()
    expect(leaving.outcome).toBe('wrong-order')
    const idle = afterExit(leaving)
    expect(idle.stage).toBe('idle')
    expect(idle.leavingFrom).toBeNull()
    // 果不是这一下该擦的东西：宿主早在 grant 那一刻就收到它了，`left` 只是把菜单从 DOM
    // 上摘掉。擦掉它会让状态里「这一局结出过什么」凭空少一条
    expect(idle.outcome).toBe('wrong-order')
    expect(idle.outcomeKey).toBe(leaving.outcomeKey)

    // 别的阶段收到 `left` 是空气（防的是宿主编错接线，不是玩家输入）
    expect(nextShenmo(type(EMPTY, ...CODE), { kind: 'left' }).state.stage).toBe('choice')
    expect(nextShenmo(INITIAL_SHENMO, { kind: 'left' }).state).toBe(INITIAL_SHENMO)
  })

  test('退场期间机器收得住：不攒码、不收选择、窗口到期是空气', () => {
    // 那 150ms 里把键盘按烂，也不该把下一个摊召出来。父规格为「摊开着不攒码」付过同一条
    // 理由：「窗口一到期、紧接着那几下会立刻把第二个摊召出来」——退场是同一段时间
    const leaving = wrongOrderLeaving()
    const mashed = press(leaving, [...CODE, 'a', 'b', 'window1', 'window2', ...CODE]).state
    expect(mashed.stage).toBe('leaving')
    expect(mashed.typed).toBe(0)
    expect(mashed.outcomeKey).toBe(leaving.outcomeKey)
    // 退场播完才重新听得见：这时候再打八下，摊真的会再来
    expect(type(afterExit(mashed), ...CODE).stage).toBe('choice')
  })

  test('退场中再按 Esc：摊已经在走了，那一下什么都不改', () => {
    const leaving = wrongOrderLeaving()
    // 原样返回同一个对象（不是换一个等值的新对象）：hook 的 `putAway` 靠同一判据挡掉
    // 无变化的重渲染，而这一条是那个判据在纯函数一侧的根据
    expect(nextShenmo(leaving, { kind: 'away' }).state).toBe(leaving)
  })

  test('空场上的 Esc 只擦码缓冲：没有摊可退，也就不进退场', () => {
    const half = type(EMPTY, ...CODE.slice(0, 5))
    const away = press(half, ['away']).state
    expect(away.stage).toBe('idle')
    expect(away.typed).toBe(0)
    expect(away.leavingFrom).toBeNull()
  })
})

// —— 换局重置什么（T32 之后修的跨局泄漏 · code review 发现 1）——
// 遍数是**这一局**的事实：换局清零、阶段变化不清零。整条判断住在导出的纯函数里
// （`shenmoAfterRunChange`），所以这里逐条驱动它；hook 只在「什么时候调」上接线。
// 这一组是后来加的：T29 那 24 条与 T32 那一组此后一条都没动过——直到 T35（本票）按
// 「终局先落 leaving」逐条改写了其中断「终局之后 stage 是 idle」的主张，一条都没删。
describe('换局与阶段变化：遍数跟着局走，不跟着阶段走', () => {
  /** 完整走一遍：打码 → B → 破碎播完 → A（与上面那一组同一条） */
  const PASS: readonly Step[] = [...CODE, 'b', 'broke', 'a']

  test('换了另一局：连遍数一起归零', () => {
    // 第 1 局走完一遍（passes = 1、授过 first-pass）之后点「新游戏」：起始时刻变了，
    // 而 phase 还是 playing、game 也不是 null——只有 key 的后半截变了
    const passed = press(EMPTY, PASS).state
    expect(passed.passes).toBe(1)
    // 机器的摊正落在退场上（T35），而换局把它**连退场一起**收掉：不等那 150ms 播完
    expect(passed.stage).toBe('leaving')
    const next = shenmoAfterRunChange('playing@111', 'playing@222', passed)
    expect(next).toEqual(INITIAL_SHENMO)
    expect(next.passes).toBe(0)
    // 于是第 2 局再走第一遍，结的是一念的果，不是二念的果
    expect(press(next, PASS).outcomes).toEqual(['first-pass'])
    // 单看那条重置规则也站得住：换局给的就是空场（含遍数）
    expect(shenmoNewRun()).toEqual(INITIAL_SHENMO)
    expect(shenmoNewRun().passes).toBe(0)
  })

  test('同一局里换阶段：只收起摊，遍数一个比特都不动', () => {
    const passed = press(EMPTY, PASS).state
    // playing → won：摊收起、码缓冲清零（`shenmoCleared` 上面那条早就钉着），遍数留着。
    // **这一条就是「外部打断不 anim」的那道边界**（T35）：换阶段由 hook 直接调
    // `shenmoCleared`、不经 `nextShenmo`，于是 `leaving` 被就地抹成 `idle`——那一瞬结果层
    // 正在盖上来，一个还在淡出的菜单只会挡住玩家要看的东西
    const won = shenmoAfterRunChange('playing@111', 'won@111', passed)
    expect(won.passes).toBe(1)
    expect(won.stage).toBe('idle')
    expect(won.leavingFrom).toBeNull()
    expect(won.typed).toBe(0)
    // won → 继续玩 → playing：起始时刻没变，还是同一局，收起来再走一遍结的是二念的果
    const back = shenmoAfterRunChange('won@111', 'playing@111', won)
    expect(back.passes).toBe(1)
    expect(press(back, PASS).outcomes).toEqual(['second-pass'])
    // 三个非对局阶段各来一次，遍数一次都没动
    for (const phase of ['won', 'stuck', 'ended'] as const) {
      expect(shenmoAfterRunChange('playing@111', `${phase}@111`, passed).passes, phase).toBe(1)
    }
  })

  test('null 身份不充当任何一局的一半：换局那一条规则照旧生效', () => {
    const passed = press(EMPTY, PASS).state
    // 开局界面（还没有局）与从界面外回来：都当作换局，机器整个回到空场
    expect(shenmoAfterRunChange(null, 'playing@222', passed)).toEqual(INITIAL_SHENMO)
    expect(shenmoAfterRunChange('playing@111', null, passed)).toEqual(INITIAL_SHENMO)
  })
})
