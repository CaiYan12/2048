import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import {
  alphaOf,
  cannonOrigins,
  spawnBurst,
  stepBurst,
  type Particle,
  type Rgb,
} from './CannonParticles'
import { TILE_SLOT_COUNT } from './ValueLadder'

/**
 * 「一念」的礼炮（T30 · 父规格架构决策 13）
 *
 * 第一遍走完的那一刻，页面左上与右上各射一发真粒子：约 150 颗/发，带重力、旋转、阻尼
 * 与寿命，颜色取色阶顶端三档的令牌。**canvas 手写，一个第三方库都没有**（仓库一个都
 * 没有，CannonParticles.ts 是那套物理，本文件只负责把它按帧画出去）。
 *
 * 三件事写在这里而不是父规格另说：
 *   · **颜色从令牌读，不写死**：三个值挂在 data-style 上，canvas 就在那只壳里，继承
 *     拿到的就是玩家选的那一套——于是三套风格的礼炮自动各成一套，加第四套风格一行代码
 *     都不用改（那正是「外壳不是插槽」的意思，父规格架构决策 11）。
 *   · **覆盖层一个指针都不吃**：`pointer-events: none`。看得见不等于点得到，这个仓库
 *     在「定位元素吞掉后代非定位内容的指针」上摔过一次（`.codex/memories/result-layer.md`
 *     第 1 条），礼炮是满屏 fixed 层，那条坑正对着它。
 *   · **reduced-motion 下不画 canvas**，礼炮降级成一行静止的字，其余报酬一毫不减
 *     （用户故事 38）。
 */

/**
 * 色阶顶端三档（TILE_SLOT_COUNT = 11 → 第 9 / 10 / 11 档）。
 *
 * 取**档位**而不是数值：档位在三套风格里是三组不同的色，而档位与模式无关（大棋盘的第
 * 11 档是 4096、经典的是 2048，礼炮不该因为换了个模式就换套颜色）。
 */
const TOP_TILE_TOKENS: readonly string[] = [
  `--tile-${TILE_SLOT_COUNT - 2}`,
  `--tile-${TILE_SLOT_COUNT - 1}`,
  `--tile-${TILE_SLOT_COUNT}`,
]

/** 一步的上限（秒）。切到后台标签页再回来，两帧之间可能隔着半分钟——不夹这一下，
 *  粒子会一步瞬移穿过整块画面，「衰减」读起来像一个跳变 */
const MAX_STEP = 1 / 30

/** 画面外多少距离就不再画。弹道高点远超视口高度，画了也看不见 */
const CULL_MARGIN = 8

/** `#rrggbb` → rgb 三元组。形状不对就抛：theme-contract 钉过每套风格都声明全部色档，
 *  真读到空值说明令牌被删了，那时礼炮该当场说，而不是安静画出一片黑 */
function parseHex(raw: string): Rgb {
  const match = /^#([0-9a-f]{6})$/i.exec(raw.trim())
  if (match === null) throw new Error(`礼炮读不到色阶顶端三档：${JSON.stringify(raw)}`)
  const value = Number.parseInt(match[1], 16)
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

/** rgb 三元组 → `#rrggbb`。只为 data 属性上那份对账用 */
function toHex(color: Rgb): string {
  return `#${color.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

/** 从当前风格的令牌里读顶端三档。元素必须在 shell 里——自定义属性向下继承 */
function topTilePalette(element: Element): readonly Rgb[] {
  const style = getComputedStyle(element)
  return TOP_TILE_TOKENS.map((token) => parseHex(style.getPropertyValue(token)))
}

/** 画一粒：挪到它的位置、转到它的朝向、按剩余寿命定透明度，画一小片纸条 */
function drawParticle(
  context: CanvasRenderingContext2D,
  particle: Particle,
  height: number
): void {
  // 落到画面下面就不再画：绝大多数粒子在寿命耗尽之前就已经飞出视口了
  if (particle.y > height + CULL_MARGIN) return
  const [red, green, blue] = particle.color
  context.save()
  context.translate(particle.x, particle.y)
  context.rotate(particle.angle)
  context.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alphaOf(particle)})`
  // 长边是短边的一倍半：一小片斜斜的纸条比一个方块更像礼花
  context.fillRect(
    -particle.size / 2,
    -particle.size * 0.375,
    particle.size,
    particle.size * 0.75
  )
  context.restore()
}

/** reduced-motion 的当前值。用 listener 跟着系统设置走：一局打到一半玩家改主意也算 */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = (): void => setReduced(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return reduced
}

interface CanvasProps {
  /** 最后一颗粒子熄灭时通知宿主：这一层可以走了 */
  onSpent: () => void
}

/**
 * canvas 那一半：一发射完就播完，播完自己摘掉自己。
 *
 * **终点不是 `setTimeout`**：装假时钟的 e2e 会把定时器队列整个冻住，礼炮就永远停不下
 * 来（结果层的退场在同一件事上红过四条，`.codex/memories/result-layer.md` 第 6 条）。
 * 这里连定时器都没有——最后一颗粒子熄灭的那一帧就是终点。
 */
function CannonCanvas({ onSpent }: CanvasProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return
    const context = canvas.getContext('2d')
    if (context === null) return

    // 尺寸按 CSS 像素对齐、按设备像素比放大：不放大的话在 Retina 上是一片糊
    const width = window.innerWidth
    const height = window.innerHeight
    const scale = window.devicePixelRatio || 1
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    context.setTransform(scale, 0, 0, scale, 0, 0)

    // 三个色值照原样落在 data 属性上：e2e 拿它与计算样式里的令牌逐字对账，「颜色取自
    // 色阶顶端三档」因此是量到的事实，不是推测。它顺带也是排障时唯一的现场记录
    const palette = topTilePalette(canvas)
    canvas.dataset.cannonPalette = palette.map(toHex).join(' ')

    let particles: readonly Particle[] = cannonOrigins(width).flatMap((origin) =>
      spawnBurst(Math.random, origin, palette)
    )
    let previous = performance.now()

    const step = (now: number): void => {
      const dt = Math.min((now - previous) / 1000, MAX_STEP)
      previous = now
      particles = stepBurst(particles, dt)
      context.clearRect(0, 0, width, height)
      for (const particle of particles) drawParticle(context, particle, height)
      if (particles.length === 0) {
        onSpent()
        return
      }
      requestAnimationFrame(step)
    }
    const frame = requestAnimationFrame(step)

    return () => cancelAnimationFrame(frame)
  }, [onSpent])

  return <canvas ref={canvasRef} className="cannon" data-cannon="true" aria-hidden="true" />
}

interface Props {
  /** 这一念的报酬该到账了吗（本局结出过 first-pass 即真；开新局照旧收回） */
  granted: boolean
}

/**
 * 宿主只递一个布尔量进来：**该不该响**。什么时候响、响多久、什么时候收，全在这里面。
 *
 * 时长由粒子寿命决定（1.1–2.1 秒），CSS 与 JS 两边都没有第二个副本——与两段 30 秒同一条
 * 纪律（`--shenmo-window-duration` 只活在 CSS 里）。
 */
export function Cannon({ granted }: Props): JSX.Element | null {
  const reduced = useReducedMotion()
  // 放完了。下一回再授予（换一局重新走一遍）时按下方的 effect 复位
  const [spent, setSpent] = useState(false)
  // 引用必须稳定：它是 CannonCanvas 那个 effect 的依赖，而 App 每一次派发（走一步、
  // 翻一次成就）都会重新渲染这一层——箭头函数每天换一个，礼炮就会被重启无数次
  const handleSpent = useCallback(() => setSpent(true), [])
  useEffect(() => {
    if (granted) setSpent(false)
  }, [granted])

  if (!granted || spent) return null
  if (reduced) {
    // 一行静止的字：两段窗口与礼炮都不该变成「多一个会动的东西」（用户故事 38）。
    // 留它的原因是那一发礼炮此时是这一局唯一的可见痕迹——祝贺说的是成就，不是这声炮
    return <p className="cannon__still">礼炮两声：左上、右上</p>
  }
  return <CannonCanvas onSpent={handleSpent} />
}
