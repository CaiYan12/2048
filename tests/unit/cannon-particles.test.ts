import { describe, expect, test } from 'vitest'
import {
  CONE_MAX,
  CONE_MIN,
  DRAG,
  GRAVITY,
  LIFE_MAX,
  LIFE_MIN,
  PARTICLES_PER_BURST,
  SIZE_MAX,
  SIZE_MIN,
  SPEED_MAX,
  SPEED_MIN,
  SPIN_MAX,
  alphaOf,
  cannonOrigins,
  spawnBurst,
  stepBurst,
  stepParticle,
  type BurstOrigin,
  type Particle,
  type Rgb,
  type Rng,
} from '../../src/renderer/components/CannonParticles'

/**
 * T30 的纯逻辑缝：礼炮粒子的运动（父规格架构决策 13 的原话——「粒子运动是时间的纯函数，
 * 这正是它能不靠 canvas 被测的原因」）。
 *
 * canvas 那一半（读令牌、按帧画、摘掉自己）不在这里测：它只有一个 DOM 断言，住在
 * tests/e2e/wish.spec.ts。这里逐条钉的是**物理**：发射锥、重力、阻尼、自旋、寿命、
 * 衰减，以及「一发放完自己会空」。
 *
 * 随机源由测试注入：一个固定序列用来对精确值，一个 LCG 用来查分布与可复现性。
 */

/** 固定序列：这颗 rng 每次都返回同一个数，于是每一颗粒子抽到同一组参数 */
function fixed(value: number): Rng {
  return () => value
}

/** 线性同余 LCG：够用的可复现随机，单测不需要密码学强度 */
function lcg(seed: number): Rng {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

/** 顶端三档的颜色占位（真的值由 Cannon.tsx 从令牌读，物理不关心是哪三个色） */
const PALETTE: readonly Rgb[] = [
  [133, 100, 11],
  [124, 93, 10],
  [108, 81, 9],
]

const LEFT: BurstOrigin = { x: 0, y: 0, toward: 1 }
const RIGHT: BurstOrigin = { x: 1280, y: 0, toward: -1 }

function particles(rng: Rng, origin: BurstOrigin = LEFT): readonly Particle[] {
  return spawnBurst(rng, origin, PALETTE)
}

describe('spawnBurst：一发射出', () => {
  test('一发就是 PARTICLES_PER_BURST 颗，全部从发射点出发', () => {
    const burst = particles(lcg(7), RIGHT)
    expect(burst).toHaveLength(PARTICLES_PER_BURST)
    for (const particle of burst) {
      expect(particle.x).toBe(RIGHT.x)
      expect(particle.y).toBe(RIGHT.y)
    }
  })

  test('两上角对射：左边的朝右、右边的朝左，两发都朝下', () => {
    const left = particles(lcg(11), LEFT)
    const right = particles(lcg(11), RIGHT)
    // 锥角恒在 (0, π/2) 里，所以 vx 的符号由发射方向定、vy 恒为正
    for (const particle of left) {
      expect(particle.vx).toBeGreaterThan(0)
      expect(particle.vy).toBeGreaterThan(0)
    }
    for (const particle of right) {
      expect(particle.vx).toBeLessThan(0)
      expect(particle.vy).toBeGreaterThan(0)
    }
  })

  test('速度、寿命、尺寸、自旋全都落在自己的区间里', () => {
    for (const particle of particles(lcg(3))) {
      expect(Math.hypot(particle.vx, particle.vy)).toBeGreaterThanOrEqual(SPEED_MIN)
      expect(Math.hypot(particle.vx, particle.vy)).toBeLessThanOrEqual(SPEED_MAX)
      expect(particle.life).toBeGreaterThanOrEqual(LIFE_MIN)
      expect(particle.life).toBeLessThanOrEqual(LIFE_MAX)
      // maxLife 就是出生时的寿命：透明度衰减的分母，差一点都不该发生
      expect(particle.maxLife).toBe(particle.life)
      expect(particle.size).toBeGreaterThanOrEqual(SIZE_MIN)
      expect(particle.size).toBeLessThanOrEqual(SIZE_MAX)
      expect(Math.abs(particle.spin)).toBeLessThanOrEqual(SPIN_MAX)
      // 颜色只从三个令牌里来（引用同一份，所以逐个相等就够）
      expect(PALETTE).toContain(particle.color)
    }
  })

  test('同一个随机源给出同一发：纯函数不藏状态', () => {
    expect(particles(lcg(42), LEFT)).toEqual(particles(lcg(42), LEFT))
    // 换个种子就不同（否则第二条是空话）
    expect(particles(lcg(42), LEFT)).not.toEqual(particles(lcg(43), LEFT))
  })

  test('固定序列下的第一颗粒子：每个参数都算得出来', () => {
    // rng 恒返回 0.5，于是四个抽签各取自己区间的中点：
    //   速度 = 240 + 0.5 × 400 = 440；锥角 = 0.12 + 0.5 × 0.93 = 0.585 rad
    //   寿命 = 1.1 + 0.5 × 1.0 = 1.6 s；尺寸 = 3 + 0.5 × 4 = 5 px
    //   自旋 = (0.5 × 2 − 1) × 14 = 0；颜色 = 三个里的第 2 个（floor(0.5 × 3) = 1）
    const [first] = particles(fixed(0.5), LEFT)
    expect(first.vx).toBeCloseTo(366.8333, 3)
    expect(first.vy).toBeCloseTo(242.9677, 3)
    expect(first.life).toBe(1.6)
    expect(first.size).toBe(5)
    expect(first.spin).toBe(0)
    expect(first.color).toBe(PALETTE[1])
    // 出生朝向随机：0.5 × 2π = π
    expect(first.angle).toBeCloseTo(Math.PI, 10)
  })
})

describe('stepParticle：走一步', () => {
  const resting: Particle = {
    x: 0,
    y: 0,
    vx: 100,
    vy: 0,
    angle: 0,
    spin: 2,
    size: 5,
    color: [1, 2, 3],
    life: 1,
    maxLife: 1,
  }

  test('重力与阻尼的手算值（不只断「变大了」）', () => {
    const after = stepParticle(resting, 0.5)
    // 阻尼 = (1 − DRAG)^dt = √0.65 ≈ 0.8062258
    // x = 100 × 0.5 = 50；vy 从 0 起步，所以这一帧只有重力那半项 = 1400 × 0.5 = 700
    expect(after.x).toBe(50)
    expect(after.y).toBe(0)
    expect(after.vx).toBeCloseTo(80.6226, 3)
    expect(after.vy).toBe(700)
    // 朝向与寿命是精确的加减法
    expect(after.angle).toBe(1)
    expect(after.life).toBeCloseTo(0.5, 10)
  })

  test('入参不被改（一步就是换一个对象，同一帧读两次不会读出两种状态）', () => {
    const snapshot = JSON.stringify(resting)
    stepParticle(resting, 0.25)
    expect(JSON.stringify(resting)).toBe(snapshot)
  })

  test('重力把竖直速度越拉越大，阻尼把水平速度越磨越小', () => {
    let particle = stepParticle(resting, 1 / 60)
    const horizontal = particle.vx
    const falling = particle.vy
    particle = stepParticle(particle, 1 / 60)
    expect(particle.vx).toBeLessThan(horizontal)
    expect(particle.vy).toBeGreaterThan(falling)
  })
})

describe('stepBurst 与 alphaOf：一发放完', () => {
  test('寿命耗尽的那些被摘掉，剩下的照旧在飞', () => {
    const burst = particles(lcg(5))
    const dying: Particle = { ...burst[0], life: 0.2, maxLife: 2 }
    const alive = stepBurst([dying, burst[1]], 0.5)
    expect(alive).toHaveLength(1)
    expect(alive[0].life).toBeCloseTo(burst[1].life - 0.5, 10)
  })

  test('放到寿命上限之外，一整发必然自己空', () => {
    let burst = particles(lcg(9))
    // 2 秒是从容的上界：寿命最长 LIFE_MAX(2.1) 而每步最多 1/30 秒
    for (let elapsed = 0; elapsed < 3 * 60; elapsed += 1) {
      burst = stepBurst(burst, 1 / 60)
    }
    expect(burst).toHaveLength(0)
  })

  test('透明度跟剩余寿命走，夹在 0 与 1 之间', () => {
    const particle: Particle = { ...particles(fixed(0.5))[0], life: 0.4, maxLife: 1.6 }
    expect(alphaOf(particle)).toBeCloseTo(0.25, 10)
    expect(alphaOf({ ...particle, life: 0 })).toBe(0)
    expect(alphaOf({ ...particle, life: -1 })).toBe(0)
    expect(alphaOf({ ...particle, life: 99 })).toBe(1)
  })
})

describe('cannonOrigins：两个上角', () => {
  test('左上朝右下、右上朝左下，按视口宽取', () => {
    const [left, right] = cannonOrigins(1280)
    expect(left).toEqual({ x: 0, y: 0, toward: 1 })
    expect(right).toEqual({ x: 1280, y: 0, toward: -1 })
  })
})
