import { expect, test, type Page } from '@playwright/test'
import { MERGE } from '../../src/game/merge'
import { getMode, type ModeId } from '../../src/shared/modes'
import { STYLE_CATALOG, type StyleId } from '../../src/shared/styleCatalog'

/**
 * 「一念」的报酬：礼炮与那颗按钮（T30 · 父规格架构决策 7 / 13 · 用户故事 18–27、38）。
 *
 * 同一套断言对三套风格各跑一遍（接的是 T29 的 `shenmo.spec.ts` 那条既有缝：彩蛋是外壳
 * 不是插槽，三套只出 token 与 CSS，所以唯一能防漂移的就是同一套契约跑三遍）。例外是
 * 末尾那两条「三套各穿自己的衣服」与「六模式通用」——它们断的不是同一组不变量。
 *
 * 契约逐条（与 GitHub issue #33 的验收标准一一对应）：
 *   1. 先 B 后 A → 两上角各射一发真粒子：canvas 在场、不吃指针、画得出像素；
 *   2. 粒子颜色来自色阶顶端三档的令牌（data 属性与计算样式对账 + 像素逐个对）；
 *   3. 道通成魔照旧走既有 toast；页面底部出现「一念神魔」按钮；
 *   4. 按钮摆下一对相邻方块：一次合并即达成本模式的 target，六模式全部通用；
 *   5. 可撤销、不计分、没有空格时改掉两处相邻的方块、障碍格一律跳过、写 session；
 *   6. 非 playing 阶段无效、开新局收回；
 *   7. reduced-motion 下礼炮降级成一行静止的字，其余报酬不变；
 *   8. 红线：两种视口下都不横向溢出。
 *
 * 局面确定性来自 `?seed=` + `?board=`（开局夹具，与 T29 同一条缝）。两段 30 秒照旧用
 * **合成**的 `animationend` 派发，不靠墙钟（理由见 T29 的文件头）。
 */

/** 行优先局面 → board 参数值（空串 = 空格） */
function boardQuery(rows: (number | null)[][]): string {
  return rows.flat().map((value) => value ?? '').join(',')
}

/** 神魔码的八下（↑↑↓↓←→←→）。T29 钉过：正文里的「六下」是笔误 */
const CODE_KEYS: readonly string[] = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
]

/** 模式：界面名与 ModeId 两张皮（开局界面上点的是界面名） */
const MODE_CHOICES: readonly { label: string; id: ModeId }[] = [
  { label: '经典', id: 'classic' },
  { label: '斐波那契', id: 'fibonacci' },
  { label: '大棋盘', id: 'big-board' },
  { label: '障碍', id: 'walls' },
  { label: '每日', id: 'daily' },
  { label: '限时', id: 'time-attack' },
]

/** 空盘：八下之后还有一堆相邻空格，于是「奖品落在空格上」是默认路径 */
const EMPTY_ROWS: (number | null)[][] = Array.from({ length: 4 }, () =>
  Array.from({ length: 4 }, (): number | null => null)
)

/**
 * 满盘、横纵相邻全不相等（拉丁方）：「没有相邻空格」的兜底就在这张盘上兑现。
 * 四个方向都推不动它，于是打码那八下一步都不走——按下按钮时盘子还是满的。
 */
const LATIN_ROWS: (number | null)[][] = [
  [2, 4, 8, 16],
  [4, 8, 16, 2],
  [8, 16, 2, 4],
  [16, 2, 4, 8],
]

function emptyUrl(): string {
  return `/?seed=20260926&board=${boardQuery(EMPTY_ROWS)}`
}

function latinUrl(): string {
  return `/?seed=20260926&board=${boardQuery(LATIN_ROWS)}`
}

/** 收集 console / page 错误：新的渲染路径上若有 React 警告要当场看见 */
function watchProblems(page: Page): string[] {
  const problems: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  return problems
}

/** 开局：选模式 → 选风格 → 开始游戏 */
async function startRun(
  page: Page,
  style: StyleId,
  modeId: ModeId,
  label: string,
  url: string
): Promise<void> {
  const mode = MODE_CHOICES.find((choice) => choice.id === modeId)
  if (mode === undefined) throw new Error(`未知模式：${modeId}`)
  await page.goto(url)
  await page.getByRole('group', { name: '模式' }).getByRole('button', { name: mode.label }).click()
  await page.getByRole('group', { name: '风格' }).getByRole('button', { name: label }).click()
  await expect(page.locator('main')).toHaveAttribute('data-style', style)
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()
}

/** 从 DOM 还原棋盘 */
async function readBoard(page: Page): Promise<(number | null)[][]> {
  const cellCount = await page.locator('.board__cell').count()
  const size = Math.sqrt(cellCount)
  const grid: (number | null)[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, (): number | null => null)
  )
  const cells = page.locator('[data-tile-id]')
  for (let index = 0; index < (await cells.count()); index += 1) {
    const cell = cells.nth(index)
    const row = Number(await cell.getAttribute('data-row'))
    const col = Number(await cell.getAttribute('data-col'))
    const value = Number(await cell.getAttribute('data-value'))
    grid[row][col] = value
  }
  return grid
}

/** 棋盘上有几格是墙（障碍格的集合一个都不能少） */
async function wallCount(page: Page): Promise<number> {
  return page.locator('.board__cell[data-cell="wall"]').count()
}

/** 打一遍口令 */
async function typeCode(page: Page): Promise<void> {
  await page.locator('[data-board]').focus()
  for (const key of CODE_KEYS) await page.keyboard.press(key)
}

/** 派发一条合成的 `animationend`，把「B 碎完了」说给机器听（不靠墙钟） */
async function breakB(page: Page): Promise<void> {
  await page.evaluate(() => {
    document
      .querySelector('[data-shenmo-button="b"]')
      ?.dispatchEvent(
        new AnimationEvent('animationend', { bubbles: true, animationName: 'shenmo-break-fade' })
      )
  })
}

/**
 * 打到「只剩 A」：打码 → 点 B → 等它碎完。**不 grant**——点 A 那一下留给调用方，
 * 因为「授予发生的时刻」是礼炮计时的零点，要抢在它后面读像素的用例得自己掌握这一刻
 * （T35 起 `completeFirstPass` 末尾多等一段菜单退场，见那两个用例里的注释）。
 */
async function fallToRing(page: Page): Promise<void> {
  await typeCode(page)
  await expect(page.locator('.shenmo')).toHaveAttribute('data-shenmo-stage', 'choice')
  await page.getByRole('button', { name: '抉择 B' }).click()
  await breakB(page)
  // 碎完：B 不在了，只剩 A 与那道环——此刻菜单**还在**，别把「收起」和「只剩 A」搞混
  await expect(page.locator('.shenmo')).toHaveAttribute('data-shenmo-stage', 'ring')
  await expect(page.locator('[data-shenmo-button="b"]')).toHaveCount(0)
}

/** 走完第一遍：打到只剩 A → 点 A → 道通成魔 */
async function completeFirstPass(page: Page): Promise<void> {
  await fallToRing(page)
  await page.getByRole('button', { name: '抉择 A' }).click()
  await expect(page.locator('.shenmo')).toHaveCount(0)
  // 用 filter 而不是裸的 [data-toast]：这一局打码那几下可能已经合出过第一次合并，
  // 屏幕上会同时有两条祝贺——裸 locator 撞 strict mode（本票自己踩过的坑）
  await expect(page.locator('[data-toast]').filter({ hasText: '道通成魔' })).toHaveCount(1)
}

/** 那颗按钮 */
const wish = (page: Page) => page.getByRole('button', { name: '一念神魔' })

interface CellDelta {
  row: number
  col: number
  from: number | null
  to: number | null
}

/** 两副棋盘逐格相减，返回「动了哪几格」 */
function diff(before: (number | null)[][], after: (number | null)[][]): CellDelta[] {
  const changed: CellDelta[] = []
  after.forEach((row, r) =>
    row.forEach((value, c) => {
      if (before[r][c] !== value) changed.push({ row: r, col: c, from: before[r][c], to: value })
    })
  )
  return changed
}

/** 两个格子是不是正交相邻（奖品必须是「一次滑动就并排碰上」） */
function adjacent(a: CellDelta, b: CellDelta): boolean {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1
}

/** 按下一念的按钮，回报「动了哪几格」 */
async function pressWish(page: Page): Promise<CellDelta[]> {
  const before = await readBoard(page)
  await wish(page).click()
  await expect(wish(page)).toBeVisible()
  return diff(before, await readBoard(page))
}

/** 把刚摆下的那一对合掉：横着的一对按 ←，竖着的一对按 ↑ */
async function mergePlantedPair(page: Page, moved: readonly CellDelta[]): Promise<void> {
  const [first, second] = moved
  await page.locator('[data-board]').focus()
  await page.keyboard.press(first.row === second.row ? 'ArrowLeft' : 'ArrowUp')
}

/** 读出礼炮画在两个上角的像素：不透明像素数 + 出现过的颜色 */
async function readCannonPixels(
  page: Page
): Promise<{ left: number; right: number; colours: string[] }> {
  return page.evaluate(async () => {
    const empty = { left: 0, right: 0, colours: [] as string[] }
    const frame = (): Promise<void> =>
      new Promise((resolve) => requestAnimationFrame(() => resolve()))
    // canvas 是点下 A 的那一刻挂上的，第一帧才排上动画。这里**逐帧等**而不是等一个
    // 固定帧数：头几帧三百颗粒子还挤在发射点上互相盖着，放得越开越数得清。上限 60 帧
    // 仍在整发的寿命（1.1–2.1 秒）之内
    //
    // **记住最好的一帧，不是最后一帧**（T35 之后补的一条）：粒子穿过两个上角只有一两百
    // 毫秒，而读它之前那一串铺设步骤（结算退场、祝贺断言）随时可能把那扇窗口挤过去——
    // T35 给菜单加退场之后，`completeFirstPass` 末尾多等 150ms，两个用例当场红在
    // 「读回来一帧粒子都飞走了的空画面」上。返回最好的一帧不改任何判据（两颗角都要超过
    // 200 才收工），只是不让「什么时候开始读」决定「读不读得到」——与这份规格里其余
    // 「不靠墙钟」的断言同一条规矩。
    let best = empty
    for (let index = 0; index < 60; index += 1) {
      await frame()
      const canvas = document.querySelector<HTMLCanvasElement>('.cannon')
      if (canvas === null) return best
      const context = canvas.getContext('2d')
      if (context === null) return best
      const scale = canvas.width / canvas.clientWidth
      // 角落上各裁一块。**按画布尺寸夹住**：手机上视口比桌面窄，裁过头 getImageData
      // 会越界；夹过之后窄屏上裁的就是整幅宽
      const crop = Math.min(Math.round(400 * scale), canvas.width, canvas.height)
      const sample = (x: number): { pixels: number; colours: string[] } => {
        const data = context.getImageData(x, 0, crop, crop).data
        const colours = new Set<string>()
        let pixels = 0
        for (let index = 0; index < data.length; index += 4) {
          // 只数几乎不透明的那些：半透明边缘像素是**预乘**存进缓冲区的，读回来时低位
          // alpha 会把 RGB 摊薄成一团糊——那不是「用了别的颜色」，是量法的噪声
          if (data[index + 3] < 250) continue
          pixels += 1
          colours.add(`${data[index]},${data[index + 1]},${data[index + 2]}`)
        }
        return { pixels, colours: [...colours] }
      }
      const left = sample(0)
      const right = sample(canvas.width - crop)
      const seen = {
        left: left.pixels,
        right: right.pixels,
        colours: [...left.colours, ...right.colours],
      }
      if (Math.min(seen.left, seen.right) > Math.min(best.left, best.right)) best = seen
      if (seen.left > 200 && seen.right > 200) return seen
    }
    return best
  })
}

/** 'r,g,b' → 与一组 `#rrggbb` 的最大通道差（取最小） */
function nearestColourDistance(colour: string, palette: readonly string[]): number {
  const [r = 0, g = 0, b = 0] = colour.split(',').map(Number)
  return Math.min(
    ...palette.map((hex) => {
      const value = Number.parseInt(hex.slice(1), 16)
      return Math.max(
        Math.abs(r - ((value >> 16) & 0xff)),
        Math.abs(g - ((value >> 8) & 0xff)),
        Math.abs(b - (value & 0xff))
      )
    })
  )
}

/**
 * 三通道向量。这里只需要减法、点积与长度，所以不引一个向量库——仓库一个依赖都没有。
 */
type Vec = readonly [number, number, number]

/** 读回的像素 '88,64,149' → 三元组（**与 nearestColourDistance 同一套解析**） */
function channelsOf(colour: string): Vec {
  const [r = 0, g = 0, b = 0] = colour.split(',').map(Number)
  return [r, g, b]
}

/** `#rrggbb` → 三元组 */
function channelsOfHex(hex: string): Vec {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

function minus(a: Vec, b: Vec): Vec {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function dot(a: Vec, b: Vec): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function length(a: Vec): number {
  return Math.hypot(a[0], a[1], a[2])
}

/** 一个点离一条线段有多近（三维） */
function distanceToSegment(point: Vec, from: Vec, to: Vec): number {
  const edge = minus(to, from)
  const span = dot(edge, edge)
  const offset = minus(point, from)
  // 共线时投影夹到线段里：连线之外的最近点是端点，而端点本来就是色值自己
  if (span === 0) return length(offset)
  const t = Math.max(0, Math.min(1, dot(offset, edge) / span))
  return length(minus(offset, [edge[0] * t, edge[1] * t, edge[2] * t]))
}

/**
 * 容差（通道）。留给**预乘存储读回的舍入**：三百颗粒子都从这两个角出发，头几帧同一个
 * 像素上叠着几十层，而层数就是 8bit 量化的累加次数——所以它没有一个小上界，只有实测
 * 范围（三风格 × 两视口各跑一次：**2.83 – 5.26 个通道**）。取 12 是这个范围的两倍以上，
 * 而色阶之外的颜色离这个三角形有二十几个通道（拿 `--tile-beyond` 去比最近的一档也有
 * 26），所以 12 照样拦得住「用了色阶外的颜色」。
 */
const BLEND_TOLERANCE = 12

/**
 * 一个颜色离「这三档张成的三角形」有多远（通道空间的距离）。
 *
 * **模型是「这三个色值的任意凸组合」**——那正是 source-over 叠加 palette 色粒子的数学
 * 真相：读回来的像素 = Σ wᵢ·Cᵢ，而三颗以上粒子压在一个像素上时，归一化之后的权重和
 * 恒等于 1（预乘存储与读回都不改变这件事）。所以它落在三角形**内部**，不是边上。
 *
 * **为什么不是「离三条连线近」**：共线判据问的是「两两压出来的 blend」，可三颗一起压
 * 就在三角形里面——Claude 的顶端三档（两档墨 + 一档陶土）张成的是一个胖三角形，质心
 * 离最近的边有二十几个通道，按连线判会把画得最准的那几颗判成色阶之外。
 * **为什么不是「离某一档近」**：那是另一件事——中等比率的 blend 离两头都有三十几
 * （T30 在 Classic 上量到过 98）。
 *
 * **为什么用「距离」而不是「质心坐标各在容差内」**：质心坐标的条件数等于三角形的厚度。
 * Classic 与 Material 的顶端三档几乎是同一条线上的三个点（实测厚度不到一个通道），
 * 那时一两个通道的读回误差会被放大成一倍以上的质心偏移——容差必须开到比它要吸收的
 * 舍入大两个数量级，判据就废了。通道空间的距离跟三角形的胖瘦无关。
 */
function distanceToTriangle(point: Vec, tokens: readonly string[]): number {
  const [a, b, c] = tokens.map(channelsOfHex)
  const u = minus(b, a)
  const v = minus(c, a)
  const w = minus(point, a)
  // 平面上最近点：三个通道两个未知数的最小二乘。det = |u × v|²，只有三档真的共线时才是 0
  const det = dot(u, u) * dot(v, v) - dot(u, v) ** 2
  if (det <= 1e-9) {
    // 退化：三角形扁成一条线段，就对三条边逐个问
    return Math.min(
      distanceToSegment(point, a, b),
      distanceToSegment(point, b, c),
      distanceToSegment(point, a, c)
    )
  }
  const s = (dot(u, w) * dot(v, v) - dot(v, w) * dot(u, v)) / det
  const t = (dot(v, w) * dot(u, u) - dot(u, w) * dot(u, v)) / det
  const projected: Vec = [
    a[0] + s * u[0] + t * v[0],
    a[1] + s * u[1] + t * v[1],
    a[2] + s * u[2] + t * v[2],
  ]
  const offPlane = length(minus(point, projected))
  // 质心坐标：α = 1 − s − t、β = s、γ = t。三个都非负才真的落在三角形里
  if (s >= 0 && t >= 0 && s + t <= 1) return offPlane
  // 投影落在三角形外：最近点在一条边上。面内那段与面外残差互相垂直，所以按勾股合成
  const planar = Math.min(
    distanceToSegment(projected, a, b),
    distanceToSegment(projected, b, c),
    distanceToSegment(projected, a, c)
  )
  return Math.hypot(offPlane, planar)
}

for (const style of STYLE_CATALOG) {
  test.describe(`${style.label} · 一念的礼炮与奖品`, () => {
    test('先 B 后 A：两上角各射一发真粒子，覆盖层一个指针都不吃', async ({ page }) => {
      const problems = watchProblems(page)
      await startRun(page, style.id, 'classic', style.label, emptyUrl())
      // 前四步照旧走到「只剩 A」，grant 那一下亲手做——**像素必须紧接着它读**，理由在
      // 下面那段（T35 之后特意改成这个顺序）
      await fallToRing(page)
      await page.getByRole('button', { name: '抉择 A' }).click()
      // 真粒子：两个上角都画出了像素（读回来的，不是「元素在就算画了」）。
      //
      // **为什么这一句要抢在其余断言前面**（T35 给菜单加退场之后从后头挪到这里）：礼炮
      // 角落那块像素窗口只有一两百毫秒——探针逐帧量过，点下 A 之后约 100ms 起两角各
      // 500+，260ms 前后跌到 200 以下，430ms 之后角落基本空了。而 `completeFirstPass`
      // 末尾要等菜单退场播完（T35 起多 150ms）再等祝贺落定，等完再读就读到了窗口外：
      // 实测最好的一帧只剩一二十个像素，而门槛是 200。菜单与祝贺两句断言跟着读数后面走，
      // 一个字节都没少断——礼炮整发射 1.1–2.1 秒，读数收工后它还在。
      const painted = await readCannonPixels(page)
      await expect(page.locator('.shenmo')).toHaveCount(0)
      await expect(page.locator('[data-toast]').filter({ hasText: '道通成魔' })).toHaveCount(1)

      const cannon = page.locator('.cannon')
      await expect(cannon).toHaveCount(1)
      // 覆盖层是 fixed、铺满视口、**一个指针都不吃**（架构决策 13 的原话）
      const layer = await cannon.evaluate((element) => {
        const own = getComputedStyle(element)
        return {
          position: own.position,
          pointerEvents: own.pointerEvents,
          zIndex: own.zIndex,
          ariaHidden: element.getAttribute('aria-hidden'),
        }
      })
      expect(layer.position).toBe('fixed')
      expect(layer.pointerEvents).toBe('none')
      expect(layer.zIndex).toBe('5')
      // 它不进无障碍树：这一声是装饰，说句话的是那颗按钮与那条祝贺
      expect(layer.ariaHidden).toBe('true')

      // 「看得见」不等于「点得到」：canvas 铺满整页，而 elementFromPoint 打在上面
      // 却不能落在它身上——否则整页的点击都被这一层接走（result-layer.md 第 1 条）
      const hit = await page.evaluate(() => {
        const canvas = document.querySelector('.cannon')
        return {
          topLeft: document.elementFromPoint(2, 2) === canvas,
          middle:
            document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2) === canvas,
        }
      })
      expect(hit.topLeft).toBe(false)
      expect(hit.middle).toBe(false)

      // 两个上角都画出了像素：这一句原来在这儿，T35 起搬到点 A 后面（上面那段注释是理由）
      expect(painted.left, `${style.label}：左上角没有粒子`).toBeGreaterThan(200)
      expect(painted.right, `${style.label}：右上角没有粒子`).toBeGreaterThan(200)

      expect(problems).toEqual([])
    })

    test('粒子颜色来自色阶顶端三档的令牌（三套因此各成一套）', async ({ page }) => {
      await startRun(page, style.id, 'classic', style.label, emptyUrl())
      // grant 那一下亲手做，读数抢在它后面：与上一条同一个窗口（点下 A 之后约 100ms 起
      // 两角各 500+，430ms 之后基本空了），而 `completeFirstPass` 末尾那段退场 + 祝贺
      // 会把它整段挤过去（T35 起菜单退场多 150ms）
      await fallToRing(page)
      await page.getByRole('button', { name: '抉择 A' }).click()
      const painted = await readCannonPixels(page)
      await expect(page.locator('.shenmo')).toHaveCount(0)
      await expect(page.locator('[data-toast]').filter({ hasText: '道通成魔' })).toHaveCount(1)

      const declared = await page.locator('.cannon').evaluate((element) => {
        const computed = getComputedStyle(element)
        return {
          tokens: [9, 10, 11].map((slot) => computed.getPropertyValue(`--tile-${slot}`).trim()),
          palette: (element as HTMLElement).dataset.cannonPalette ?? '',
        }
      })
      // 画布上报的三个色值就是令牌里的三个色值（逐字对账，不写死任何一套的色）
      expect(declared.palette.split(' ')).toEqual(declared.tokens)

      expect(painted.colours.length).toBeGreaterThan(0)
      // 三档都真的画了上去：只断「至少一个」的话，「少取一档」照样过
      for (const token of declared.tokens) {
        const nearest = Math.min(
          ...painted.colours.map((colour) => nearestColourDistance(colour, [token]))
        )
        expect(nearest, `${style.label}：色阶 ${token} 没有出现在画面上`).toBeLessThanOrEqual(3)
      }
      // 其余每个颜色都必须是这三档的凸组合（容差只留给预乘读回的累计舍入，见 BLEND_TOLERANCE）
      for (const colour of painted.colours) {
        const distance = distanceToTriangle(channelsOf(colour), declared.tokens)
        expect(
          distance,
          `${style.label}：粒子画出了色阶之外的颜色 ${colour}（离三档张成的三角形 ${distance.toFixed(2)} 个通道）`
        ).toBeLessThanOrEqual(BLEND_TOLERANCE)
      }
    })

    test('按钮授予、可撤销、不计分；开新局收回', async ({ page }) => {
      const problems = watchProblems(page)
      await startRun(page, style.id, 'classic', style.label, emptyUrl())
      const wallsBefore = await wallCount(page)
      await completeFirstPass(page)

      // 按钮现身：一颗真 button、有可见文字、与「新游戏」分得开
      await expect(wish(page)).toBeVisible()
      await expect(wish(page)).toHaveText('一念神魔')
      await expect(page.getByRole('button', { name: '新游戏' })).toHaveCount(1)

      // 摆下一对相邻方块：动了且只动了两格
      const scoreBefore = await page.locator('[data-score]').getAttribute('data-score')
      const moved = await pressWish(page)
      expect(moved).toHaveLength(2)
      expect(adjacent(moved[0], moved[1])).toBe(true)
      // 经典模式：两个 1024，一次合并正好达标
      expect(moved.map((cell) => cell.to)).toEqual([1024, 1024])

      // 不计分：摆之前多少分，摆之后还是多少分（步数不在 DOM 上，那一半由
      // tests/unit/wish-pair.test.ts 逐字段钉——「证不了就不硬证」）
      await expect(page.locator('[data-score]')).toHaveAttribute('data-score', scoreBefore ?? '0')

      // 撤销把奖品收回去：棋盘回到按下之前，而按钮还在（发生过的事不退）
      const planted = await readBoard(page)
      await page.locator('[data-board]').focus()
      await page.keyboard.press('z')
      expect(await readBoard(page)).not.toEqual(planted)
      await expect(wish(page)).toBeVisible()
      // 障碍格的集合一个都没少
      expect(await wallCount(page)).toBe(wallsBefore)

      // 开新局收回：礼物属于挣到它的那一局
      await page.getByRole('button', { name: '新游戏' }).click()
      await expect(page.locator('[data-result-tier]')).toHaveCount(0)
      await expect(wish(page)).toHaveCount(0)
      // 礼炮那一层也跟着走（它是同一个事实的另一半）
      await expect(page.locator('.cannon')).toHaveCount(0)

      expect(problems).toEqual([])
    })

    test('写 session：盘上那一对跨得过一次读盘', async ({ page }) => {
      await startRun(page, style.id, 'classic', style.label, emptyUrl())
      await completeFirstPass(page)
      const moved = await pressWish(page)
      expect(moved).toHaveLength(2)

      // 写盘是 fire-and-forget，所以等的是**盘上那个值**而不是墙钟（T29 在
      // style-traveller 上踩过的同一个坑）：会话桶里那一局的方块数必须已经跟上
      await expect
        .poll(
          () =>
            page.evaluate(async () => {
              const db = await new Promise<IDBDatabase>((resolve, reject) => {
                const request = indexedDB.open('2048')
                request.onsuccess = () => resolve(request.result)
                request.onerror = () => reject(request.error)
              })
              const read = (store: string): Promise<unknown> =>
                new Promise((resolve, reject) => {
                  const transaction = db.transaction(store, 'readonly')
                  const request = transaction.objectStore(store).get('current')
                  request.onsuccess = () => resolve(request.result)
                  request.onerror = () => reject(request.error)
                })
              const session = (await read('session')) as { game?: { board?: unknown[][] } } | null
              db.close()
              const board = session?.game?.board ?? []
              return board.flat().filter((cell) => cell !== null && cell !== 'wall').length
            }),
          { timeout: 5000 }
        )
        .toBe((await readBoard(page)).flat().filter((value) => value !== null).length)
    })

    test('非 playing 阶段无效：面板露头时按钮不在，回来时它还在', async ({ page }) => {
      await startRun(page, style.id, 'classic', style.label, emptyUrl())
      await completeFirstPass(page)
      const moved = await pressWish(page)
      // 把刚摆下的那一对合掉 → 达标 → 胜利面板露头
      await mergePlantedPair(page, moved)
      await expect(page.locator('[data-result-tier="won"]')).toBeVisible()
      // 按钮当场不在（用户故事 24），面板上也没有第二颗同名按钮
      await expect(wish(page)).toHaveCount(0)
      await expect(
        page.locator('[data-panel="win"]').getByRole('button', { name: '一念神魔' })
      ).toHaveCount(0)

      // 继续玩：按钮回来（授予跟着这一局，不跟着阶段）
      await page.locator('[data-panel="win"]').getByRole('button', { name: '继续玩' }).click()
      await expect(page.locator('[data-result-tier]')).toHaveCount(0)
      await expect(wish(page)).toBeVisible()
    })

    test('reduced-motion：礼炮降级成一行静止的字，其余报酬不变', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await startRun(page, style.id, 'classic', style.label, emptyUrl())
      await completeFirstPass(page)

      // 一个字都不动的那一行：canvas 一个节点都没有
      await expect(page.locator('.cannon')).toHaveCount(0)
      const still = page.locator('.cannon__still')
      await expect(still).toHaveCount(1)
      await expect(still).toHaveText('礼炮两声：左上、右上')
      // 静止：一条动画都没有，也没有待起的过渡
      const motion = await still.evaluate((element) => {
        const style = getComputedStyle(element)
        return { animation: style.animationName, duration: style.transitionDuration }
      })
      expect(motion.animation).toBe('none')
      expect(motion.duration).toBe('0s')

      // 其余报酬一毫不减：按钮照旧授予，照旧摆得下一对
      await expect(wish(page)).toBeVisible()
      const moved = await pressWish(page)
      expect(moved).toHaveLength(2)
      expect(moved.map((cell) => cell.to)).toEqual([1024, 1024])
    })

    test('红线：按钮与那一行静止的字都不让页面横向溢出', async ({ page }) => {
      await startRun(page, style.id, 'classic', style.label, emptyUrl())
      await completeFirstPass(page)
      await expect(wish(page)).toBeVisible()

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      expect(
        overflow.scrollWidth,
        `${style.label}：一念的按钮把页面撑横向溢出了`
      ).toBeLessThanOrEqual(overflow.clientWidth)
    })
  })
}

/**
 * 三套各给那颗按钮与那三档粒子自己的颜色（用户故事 41）。
 *
 * 放在循环外面：它断的不是同一组不变量，而是「三份实现确实不同」。只断「不是 none」的话，
 * 三份互抄也照样过——所以这里比的是**三个渲染值两两不同**，不写死任何一套的色值
 * （写死就成了第三份真相，风格改色时它会撒谎）。
 */
test('三套风格的一念按钮与礼炮各穿自己的衣服', async ({ page }) => {
  const looks: { label: string; background: string; outline: string; palette: string }[] = []
  for (const style of STYLE_CATALOG) {
    await startRun(page, style.id, 'classic', style.label, emptyUrl())
    await completeFirstPass(page)
    // 一次 evaluate 里读齐全套：canvas 的寿命就是那一发的寿命（1.1–2.1 秒），
    // 分几次读会把「元素已经自己收起来了」误读成「没画」
    const look = await page.evaluate(() => {
      const wish = document.querySelector('.wish')
      const cannon = document.querySelector('.cannon')
      const style = wish === null ? null : getComputedStyle(wish)
      return {
        background: style?.backgroundColor ?? '',
        outline: style?.outlineColor ?? '',
        palette: (cannon as HTMLElement | null)?.dataset.cannonPalette ?? '',
      }
    })
    looks.push({ label: style.label, ...look })
  }
  const backgrounds = looks.map((look) => look.background)
  const outlines = looks.map((look) => look.outline)
  const palettes = looks.map((look) => look.palette)
  expect(new Set(backgrounds).size, `三套的按钮底面撞车了：${backgrounds.join(' / ')}`).toBe(3)
  expect(new Set(outlines).size, `三套的按钮描边撞车了：${outlines.join(' / ')}`).toBe(3)
  expect(new Set(palettes).size, `三套的礼炮配色撞车了：${palettes.join(' / ')}`).toBe(3)
})

/**
 * 六模式通用（用户故事 21 / 22 / 23 与 issue 的「不按家族写特例」）。
 *
 * 放在风格循环外面：它断的是同一件事在每个模式上都成立，与风格无关——经典风格跑完六个
 * 模式就够，再乘三套风格只是把同一个结论抄两遍。断的是**性质**（两个值按本模式的合并表
 * 正好合成它的 target、两格正交相邻、墙一格没碰），不是某一组写死的数值。
 */
for (const mode of MODE_CHOICES) {
  test(`${mode.label}：按钮摆下一对相邻方块，一次合并即达标`, async ({ page }) => {
    await startRun(page, 'classic', mode.id, 'Classic', emptyUrl())
    const definition = getMode(mode.id)
    const wallsBefore = await wallCount(page)
    await completeFirstPass(page)

    const moved = await pressWish(page)
    expect(moved).toHaveLength(2)
    expect(adjacent(moved[0], moved[1])).toBe(true)
    const [first, second] = moved.map((cell) => cell.to)
    expect(first, '两格都该由奖品填上').not.toBeNull()
    expect(second, '两格都该由奖品填上').not.toBeNull()
    if (first === null || second === null) return
    // 一次合并正好达成本模式的 target——六模式全过，没有一个家族分支
    expect(MERGE[definition.mergeFamily](first, second)).toBe(definition.target)
    // 墙一格都没被碰
    expect(await wallCount(page)).toBe(wallsBefore)
  })
}

/**
 * 满盘兜底（父规格架构决策 7 的后半句）：没有相邻空格时按字面改掉两处相邻的**方块**。
 *
 * 用经典风格一张拉丁方满盘：四个方向都推不动它，于是打码那八下一步都不走，按按钮时
 * 盘子还是满的——奖品就只能落在两处方块上。
 */
test('满盘兜底：没有相邻空格时改掉两处相邻的方块', async ({ page }) => {
  await startRun(page, 'classic', 'classic', 'Classic', latinUrl())
  await completeFirstPass(page)

  const moved = await pressWish(page)
  expect(moved).toHaveLength(2)
  expect(adjacent(moved[0], moved[1])).toBe(true)
  // 两处**原来都有方块**（不是空格），被顶掉的值也照实报出来
  for (const cell of moved) {
    expect(cell.from, `(${cell.row},${cell.col}) 原来是空的，说明兜底没走`).not.toBeNull()
  }
  // 顶上来的是两个 1024：一次合并照样达标
  expect(moved.map((cell) => cell.to)).toEqual([1024, 1024])
})
