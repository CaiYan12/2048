/**
 * 礼炮的粒子（T30 · 父规格架构决策 13）
 *
 * 真粒子：位置 / 速度 / 重力 / 阻尼 / 旋转 / 寿命全是**时间的纯函数**，没有 DOM、没有
 * canvas、没有 requestAnimationFrame——所以它被单测逐条驱动，而「礼炮真的在飞」这件事
 * 不靠人眼也说得清。canvas 那一半在 Cannon.tsx：它只负责读令牌、按帧调 `stepBurst`
 * 与把这些方块画出去。
 *
 * 为什么不用库：仓库一个动画库都没有（T21 起Motion 类需求全走 CSS，这一处连 CSS 都
 * 不够用——三百颗粒子每帧各转各的），而这套物理不到四十行。
 */

/** 随机源。由调用方注入——与 ADR-0001 同一条纪律：纯函数不自己抽 */
export type Rng = () => number

/** 一个粒子的颜色：rgb 三元组（来自色阶顶端三档的令牌，取色在 Cannon.tsx） */
export type Rgb = readonly [number, number, number]

/** 一发礼炮的粒子数（issue 的原话：约 150 颗/发） */
export const PARTICLES_PER_BURST = 150

/** 重力，px/s²。屏幕坐标向下为正 */
export const GRAVITY = 1400

/** 初速区间，px/s */
export const SPEED_MIN = 240
export const SPEED_MAX = 640

/** 寿命区间，秒 */
export const LIFE_MIN = 1.1
export const LIFE_MAX = 2.1

/** 尺寸区间，px（短边；长边是它的一倍半，比例归画法不归物理） */
export const SIZE_MIN = 3
export const SIZE_MAX = 7

/** 自旋区间，rad/s。正负各一半——礼花的纸片没有统一转向 */
export const SPIN_MAX = 14

/** 空气阻尼：每秒保留的速度比例。写成指数衰减，于是 30fps 与 144fps 走出同一条轨迹 */
export const DRAG = 0.35

/**
 * 发射锥：与水平线的夹角区间，弧度，向下为正。
 *
 * 两端都留余量：贴地（0）的一射像扫地，直上（π/2）的一射像喷泉。左上往右下、
 * 右上往左下，两发互为镜像——「两个上角对射」说的是这个。
 */
export const CONE_MIN = 0.12
export const CONE_MAX = 1.05

/** 一个粒子。**不可变**：一步就是换一个对象，于是「同一帧被读两次」不会读出两种状态 */
export interface Particle {
  readonly x: number
  readonly y: number
  readonly vx: number
  readonly vy: number
  /** 当前朝向，弧度 */
  readonly angle: number
  /** 自旋速度，弧度/秒 */
  readonly spin: number
  readonly size: number
  readonly color: Rgb
  /** 剩余寿命，秒；<= 0 即熄灭 */
  readonly life: number
  /** 出生时的寿命。透明度衰减的分母 */
  readonly maxLife: number
}

/** 一个发射点：屏幕上的一个角，与它指向的那一侧（1 = 向右，-1 = 向左） */
export interface BurstOrigin {
  readonly x: number
  readonly y: number
  readonly toward: 1 | -1
}

/** 两个上角各一发（issue 的「左上与右上各射一发」）。按视口宽取，左右互为镜像 */
export function cannonOrigins(width: number): readonly [BurstOrigin, BurstOrigin] {
  return [
    { x: 0, y: 0, toward: 1 },
    { x: width, y: 0, toward: -1 },
  ]
}

/**
 * 一发射出：`PARTICLES_PER_BURST` 颗粒子，全部从发射点出发，各自的角度、速度、寿命、
 * 尺寸、转向、颜色都由 `rng` 现抽。
 *
 * 抽的每一样都落在区间里，所以「约 150 颗、有重力与旋转与衰减与寿命」这几件事在函数
 * 签名上就看得见，不必等画出来。
 */
export function spawnBurst(
  rng: Rng,
  origin: BurstOrigin,
  palette: readonly Rgb[]
): readonly Particle[] {
  const particles: Particle[] = []
  for (let index = 0; index < PARTICLES_PER_BURST; index += 1) {
    const speed = SPEED_MIN + rng() * (SPEED_MAX - SPEED_MIN)
    // 锥角只量与水平线的夹角（恒为正），朝左还是朝右由 toward 单独乘在水平分量上：
    // 拿负角去求余弦的话 cos 是偶函数、vx 照旧是正的，右上那一发会打到画面外去
    const aim = CONE_MIN + rng() * (CONE_MAX - CONE_MIN)
    const life = LIFE_MIN + rng() * (LIFE_MAX - LIFE_MIN)
    particles.push({
      x: origin.x,
      y: origin.y,
      vx: Math.cos(aim) * speed * origin.toward,
      vy: Math.sin(aim) * speed,
      // 出生朝向随机：一片纸被抛出去的时候没有「正面朝上」这回事
      angle: rng() * Math.PI * 2,
      spin: (rng() * 2 - 1) * SPIN_MAX,
      size: SIZE_MIN + rng() * (SIZE_MAX - SIZE_MIN),
      color: palette[Math.floor(rng() * palette.length)],
      life,
      maxLife: life,
    })
  }
  return particles
}

/**
 * 走一步。**纯函数**：给定一个粒子与一个步长，给出下一步，不改入参。
 *
 * 三个式子各一件事：位置按速度积分、速度按阻尼衰减并被重力拉一把、朝向按自旋转。
 * 阻尼乘在速度上而不是乘在位移上，所以它同时管水平与竖直两条——礼花的纸片一边飘一边
 * 横向慢下来，那一下只有阻尼给得出。
 */
export function stepParticle(particle: Particle, dt: number): Particle {
  const damping = Math.pow(1 - DRAG, dt)
  return {
    ...particle,
    x: particle.x + particle.vx * dt,
    y: particle.y + particle.vy * dt,
    vx: particle.vx * damping,
    vy: particle.vy * damping + GRAVITY * dt,
    angle: particle.angle + particle.spin * dt,
    life: particle.life - dt,
  }
}

/** 推进一整发，并把寿命耗尽的那几颗摘掉（「这一发放完了」由它回答） */
export function stepBurst(particles: readonly Particle[], dt: number): readonly Particle[] {
  return particles
    .map((particle) => stepParticle(particle, dt))
    .filter((particle) => particle.life > 0)
}

/**
 * 透明度：跟着剩余寿命线性走到底。
 *
 * 这就是「衰减」的另一半（另一半是速度阻尼）。写在纯函数里而不是 canvas 的
 * globalAlpha：canvas 那一侧每帧为三百颗粒子改一次全局状态，而它是可以从状态算出来的。
 */
export function alphaOf(particle: Particle): number {
  return Math.max(0, Math.min(1, particle.life / particle.maxLife))
}
