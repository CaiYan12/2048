import { expect, test, type Page } from '@playwright/test'
import { STYLE_CATALOG, type StyleId } from '../../src/shared/styleCatalog'
import type { ContrastPair } from '../../scripts/check-contrast.mjs'
import classicContrast from '../../src/renderer/styles/themes/classic/contrast.json' with { type: 'json' }
import claudeContrast from '../../src/renderer/styles/themes/claude/contrast.json' with { type: 'json' }
import materialContrast from '../../src/renderer/styles/themes/material/contrast.json' with { type: 'json' }

/**
 * 「一念神魔」的**共享契约**：同一套断言对三套风格各跑一遍（T29）。
 *
 * 接的是 toast 契约与结果层契约那条既有缝（ADR-0002 增补）：三套风格在彩蛋上只出 token
 * 与 CSS（父规格的架构决策 11——**外壳，不是第四个插槽**），而三份实现必然漂移，唯一能
 * 防漂移的就是同一套断言跑三遍。所以这个文件里没有一句「Classic 会这样、Material 会那样」
 * 的分叉，唯一的例外是末尾那条「三套的底面 / 描边确实互不相同」。
 *
 * 契约逐条（与 GitHub issue #32 的验收标准一一对应）：
 *   1. 八下口令（方向键与 WASD 等价）打出两颗圆钮；无效方向也计数；一个错键整个清空；
 *   2. 八下照旧推棋盘、菜单不挡棋、Esc 随时收起；
 *   3. 三个结局各授予该授予的：先 B 后 A → 道通成魔；先点 A → 学艺不精；
 *      第一段窗口到期**静默**、什么都不授予；第二段窗口到期 → 当断即断；
 *   4. 两段窗口都由动画驱动、`animationend` 收尾——**没有一个 JS 定时器**；
 *   5. reduced-motion 下环不可见而计时动画照旧（整个特性最尖锐的陷阱，架构决策 4），
 *      一个位移都没有，两段窗口照旧到期；
 *   6. 阶段变化与开新局都立刻收起、什么都不授予；
 *   7. 两种视口下都不横向溢出（红线：文档永不横向滚动）；
 *   8. T34 补的两条：**键盘全程可达**（打码不偷焦点、Tab 到两颗钮、回车与空格激活、Esc
 *      收起），以及 B 碎到一半时第一段窗口到期**不算放任流尽**（机器规则 4 钉的是一个
 *      真的会发生的赛跑，不是防御性编程）。
 *   9. T36 补的两条：**堕落染墨只在二念的终局里出现**（控制人 2026-10-01 裁定：染血的触发
 *      条件是重复输入两次作弊码，不是「输错了」），以及那段两拍终局本身的顺序与时长。
 *
 * **两段 30 秒怎么证**：时长只活在 CSS 里（`styles/index.css` 的 `--shenmo-window-duration`），
 * 而 30 秒等不起。所以这里断三件事——(a) 计算样式上那条动画真的挂着、时长真的是 30s；
 * (b) 用**合成**的 `animationend` 把「到期」派发出去，菜单照旧收起（不靠墙钟）；
 * (c) 装一个**假时钟**再走整套流程——任何藏在 JS 里的定时器都会在那儿冻住，而两段窗口
 * 必须照旧到期（架构决策 3 的理由正是这一条）。
 *
 * 局面确定性来自 `?seed=` + `?board=`（开局夹具）。两个夹具的来处都写在本文件头。
 */

/** 行优先局面 → board 参数值（空串 = 空格） */
function boardQuery(rows: (number | null)[][]): string {
  return rows.flat().map((value) => value ?? '').join(',')
}

/**
 * 神魔码的八下（up up down down left right left right）。父规格与 issue 的正文当年写的是
 * 「six presses / 六下」，而两处把序列写全了的地方都是八下——经典游戏机口诀的方向段本来
 * 就是八下，T29 按序列裁了八下。`tests/unit/shenmo-choice.test.ts` 用 `SHENMO_CODE.length`
 * 把它钉住。
 */
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

/** WASD 版：同一串方向，另一种手。App 的 MOVE_KEYS 查表前 toLowerCase，所以大写也命中 */
const WASD_KEYS: readonly string[] = ['w', 'w', 's', 's', 'a', 'd', 'a', 'd']

/**
 * **永不合并的盘**（4 个方块 / 12 个空格）
 *
 * 本文件大半用例的底座，理由有三：
 *   1. **没有任何一个 2 或 4**——经典模式的生成值只有这两个，于是 spawn 永远合不上盘上
 *      任何一块（8/16/32/64 互不相等），八下之内不可能有合并，「什么都没授予」才有干净的话可说；
 *   2. **↑ 与 ← 都是无效方向**：四列均顶格在上、四行均贴边在左。于是「无效方向也计数」
 *      由「菜单照样现身」直接证明——机器若只听有效移动，前两下就断了；
 *   3. 12 个空格，八下（乃至更长的序列）都填不满，死局不可能。
 *
 * 配 `SEED_SILENT`（扫 3000 个种子后挑的 score 恒为 0 那一小撮之一，probe 已逐下核过）。
 */
const SILENT_ROWS: (number | null)[][] = [
  [8, 16, 32, 64],
  [null, null, null, null],
  [null, null, null, null],
  [null, null, null, null],
]
const SEED_SILENT = 9

/**
 * **第九下达标**的盘（用户故事 8：阶段变化要收起菜单）
 *
 * 第 0 列 `8 / 1024 / 16 / 1024` 整列填满、中间夹一块 16，于是：
 *   · ↑ 与 ↓ 都推不动这一列（列是满的，滑动不发生，也就没有合并判定）——那一对 1024 在
 *     前八下里始终隔着 16，一次都合不上；
 *   · ← 与 → 把第 2 行的 `16 / 32` 横着挪开，到第八下结束时空位就在那一对中间；
 *   · 第九下按 ↑ → 两个 1024 并成 2048 → phase 变 won → 摊当场收起。
 *
 * `SEED_PHASE = 1` 是拿真内核逐下推演后钉死的（probe 只在这一个种子上成立，故写死成 1）。
 */
const PHASE_ROWS: (number | null)[][] = [
  [8, 16, 32, 64],
  [1024, null, null, null],
  [16, 32, null, null],
  [1024, null, null, null],
]
const SEED_PHASE = 1

/**
 * **满盘十六档**（T33 的堕落染墨要用，**T36 起它的触发条件是两遍走完**）：十二个色档 +
 * 四个 beyond，四行四列全满、十六个值两两不相等（2…65536 全是不同的 2 的幂）。
 *
 * 为什么非得是满盘：堕落染墨要量的是**十二档同时在盘上**的血色，而神魔码那八下必须是
 * 无效移动（「无效方向也计数」要的就是这个）——这副盘 ↑ ↓ ← → 一个方向都推不动，于是
 * 棋盘一个格子都不动、一次都不合并，两遍走完的那一刻十二档原样躺在盘上。
 * 同一条性质有单测钉着（四个方向 changed 全为 false），tests/e2e/contrast-computed.spec.ts
 * 的 `egg` 场景用的是同一副盘。
 */
const DIM_ROWS: (number | null)[][] = [
  [2, 4, 8, 16],
  [32, 64, 128, 256],
  [512, 1024, 2048, 4096],
  [8192, 16384, 32768, 65536],
]
/**
 * 种子照旧给（仓库的规矩：`?board=` 不带 `?seed=` 时开局之后的生成是随机的）。这一个
 * 具体取什么值都无关——这副盘上一个方向都推不动，于是永远不会有生成。
 */
const SEED_DIM = 20260926

/**
 * **一步成胜局**：四个 1024，一次左移合出两个 2048 → 本局第一次达标 → phase 变 won
 * （run-endings.spec.ts 同款）。**不能拿「盘上已经有 2048」的局面**：夹具按棋盘把
 * `reachedTarget` 置真，而胜利的触发条件是它由假转真——从真起步的面板一次都不弹。
 */
const WIN_ROWS: (number | null)[][] = [
  [1024, 1024, 1024, 1024],
  [null, null, null, null],
  [null, null, null, null],
  [null, null, null, null],
]

/**
 * **一步即死局**：第 0 行右端留一个空格，右移把整行推过去，空出的 (0,0) 由生成填上。
 * (0,0) 的邻居全是 8，所以生成 2 还是 4 都死局——这一条路径不依赖随机进度
 * （run-endings.spec.ts / audio.spec.ts 同款）。
 */
const DEADLOCK_ROWS: (number | null)[][] = [
  [8, 2, 4, null],
  [8, 2, 4, 8],
  [2, 4, 8, 2],
  [4, 8, 2, 4],
]

function silentUrl(): string {
  return `/?seed=${SEED_SILENT}&board=${boardQuery(SILENT_ROWS)}`
}

function winUrl(): string {
  return `/?seed=${SEED_SILENT}&board=${boardQuery(WIN_ROWS)}`
}

function deadlockUrl(): string {
  return `/?seed=${SEED_SILENT}&board=${boardQuery(DEADLOCK_ROWS)}`
}

function phaseUrl(): string {
  return `/?seed=${SEED_PHASE}&board=${boardQuery(PHASE_ROWS)}`
}

function dimUrl(): string {
  return `/?seed=${SEED_DIM}&board=${boardQuery(DIM_ROWS)}`
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

/** 开局：选风格 → 开始游戏 */
async function startRun(page: Page, styleId: StyleId, label: string, url: string): Promise<void> {
  await page.goto(url)
  await page.getByRole('group', { name: '风格' }).getByRole('button', { name: label }).click()
  await expect(page.locator('main')).toHaveAttribute('data-style', styleId)
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()
}

/** 从 DOM 还原棋盘：格子在就表示有方块 */
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

/** 打一遍口令（真按键） */
async function typeCode(page: Page, keys: readonly string[] = CODE_KEYS): Promise<void> {
  await page.locator('[data-board]').focus()
  for (const key of keys) await page.keyboard.press(key)
}

/** 抉择摊：`.shenmo` 容器。收起时一个节点都不在 DOM 里 */
const menu = (page: Page) => page.locator('.shenmo')

/**
 * 二念那一颗成就的名字与那句诗（T32）。业主给的原话，逐字钉住——那句话会出现在 toast 的
 * 下行，同时是悬顶上唯一的一行字，错一个字就是另一句梗
 */
const SECOND_PASS_NAME = '走火入魔'
const SECOND_PASS_NOTE = '一念为神，一念成魔，念念为贪，非念而魔'

/**
 * 彩蛋四颗成就的名字。断「什么都没授予」时逐个点名的就是这四个——**含走火入魔**：
 * 它只在第二遍完整走完时授予，所以「先点 A」「放任流尽」那两条路上它一出现就是回归
 * （某个改动把遍数判错了）。只断前三个的话，那种错会安静地漏过去。
 */
const EGG_NAMES: readonly string[] = ['道通成魔', '学艺不精', '当断即断', SECOND_PASS_NAME]

/** 屏幕上有没有任何一条祝贺提到彩蛋的那四个名字 */
async function toastNamesEgg(page: Page): Promise<boolean> {
  const toasts = page.locator('[data-toast]')
  for (let index = 0; index < (await toasts.count()); index += 1) {
    const text = (await toasts.nth(index).textContent()) ?? ''
    if (EGG_NAMES.some((name) => text.includes(name))) return true
  }
  return false
}

/** 悬顶：`.shenmo-strip`。它**不是 toast**——连 `data-toast` 都不带，所以不进那套计时 */
const strip = (page: Page) => page.locator('.shenmo-strip')

/**
 * 提到某个名字的那一条祝贺。
 *
 * **不能用裸的 `[data-toast]` + `toContainText`**：屏幕上同时可以有好几条（打码那几下会
 * 顺手合出「首次合并」、第一遍结「道通成魔」、第二遍结「走火入魔」，而每条活 5 秒以上），
 * 裸定位器会当场撞 strict mode violation——T30 在这上面踩过同一条（`wish.spec.ts` 的
 * 第 4 条坑）。先按文字筛、再数 1 条，两件事各自说清。
 */
function toastFor(page: Page, text: string): ReturnType<Page['locator']> {
  return page.locator('[data-toast]').filter({ hasText: text })
}

/** 完整走一遍魔道：点 B → 合成动画把破碎退场说完 → 只剩 A → 点 A。两遍都靠它 */
async function completePass(page: Page): Promise<void> {
  await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'choice')
  await page.getByRole('button', { name: '抉择 B' }).click()
  await fireAnimationEnd(page, '[data-shenmo-button="b"]', 'shenmo-break-fade')
  await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'ring')
  await page.getByRole('button', { name: '抉择 A' }).click()
  await expect(menu(page)).toHaveCount(0)
}

/**
 * 从 IndexedDB 的某一个桶里读那条单例记录（`null` = 桶是空的）。
 *
 * 写盘是 fire-and-forget，所以凡是要证明「盘上没有」的断言都走这个读，而不是等一个
 * 墙钟——T29 在 style-traveller 上踩过的坑正是「不等落盘就 reload」。
 */
async function readBucket(page: Page, store: string): Promise<Record<string, unknown> | null> {
  return page.evaluate(async (name) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('2048')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const value = await new Promise<unknown>((resolve, reject) => {
      const transaction = db.transaction(name, 'readonly')
      const request = transaction.objectStore(name).get('current')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    db.close()
    // 空桶给的是 **undefined**（键不存在），不是 null。归一成 null：「桶是空的」只有一种
    // 说法，断言那边才不必分两种情况写
    return value === undefined ? null : (value as Record<string, unknown>)
  }, store)
}

/** 等 session 桶里那一局的某一个字段等于期望值（等**盘上那个值**，不等墙钟） */
async function waitForSession(
  page: Page,
  pick: (session: Record<string, unknown>) => unknown,
  expected: unknown
): Promise<void> {
  await expect
    .poll(async () => {
      const session = await readBucket(page, 'session')
      return session === null ? null : pick(session)
    }, { timeout: 5000 })
    .toBe(expected)
}

/**
 * 等 session 桶里某一个数字字段**追上**盘面上那个值（`>=`）。
 *
 * 为什么是「追上」而不是「等于」：写盘是 fire-and-forget，而分数一直在涨——扣下之后那八下
 * 照样在推棋盘（引擎不知道页面空了），所以后来落盘的那个数只会更大。等它追上就等于
 * 「盘上已经是扣下之后的那个状态，而且没有倒退」。
 */
async function waitForSessionAtLeast(
  page: Page,
  pick: (session: Record<string, unknown>) => unknown,
  minimum: number
): Promise<void> {
  await expect
    .poll(async () => {
      const session = await readBucket(page, 'session')
      return session === null ? null : pick(session)
    }, { timeout: 5000 })
    .toBeGreaterThanOrEqual(minimum)
}

/**
 * 派发一条**合成**的 `animationend`，把「一段窗口到头了」说给机器听。
 *
 * 为什么必须是合成的：两段都是 30 秒，等不起；而墙钟一掺进来，`time-attack.spec.ts` 那种
 * 装假时钟的用例就会把它整个冻住（结果层在同一件事上红过四条，见 `.codex/memories/result-layer.md`
 * 第 6 条）。派发与读回分成两步：派发走 `page.evaluate`（JS 定时器怎么假都够不着它），
 * 读回走 Playwright 自己的 `expect` 轮询（跑在驱动进程里，页面里的假时钟碰不到）。
 *
 * 事件从目标元素上冒泡：App 里的处理器判 `event.target === event.currentTarget`，
 * 所以 B 的破碎动画不会冒泡到 A 的环上被当成窗口到期（T27 在结果层上抓到的同一类坑）。
 */
async function fireAnimationEnd(page: Page, selector: string, animationName: string): Promise<void> {
  await page.evaluate(
    ({ target, name }) => {
      const element = document.querySelector<HTMLElement>(target)
      element?.dispatchEvent(new AnimationEvent('animationend', { bubbles: true, animationName: name }))
    },
    { target: selector, name: animationName }
  )
}

/**
 * 点下**第二遍**的抉择 A，并当场把二念的两拍终局冻住（T36 的终局断言专用）。
 *
 * 为什么触发与第一次停住必须在同一次 `page.evaluate` 里：终局有 1200ms，而「列正带着
 * `data-shenmo-fall`」这件事要读得到。分成两步（先 `click()` 再回来停）的话，中间几个协议
 * 往返一慢，菜单自己那条 150ms 的退场先播完、把抉择 A 摘掉，两拍也继续往下走——断言就成了
 * 与墙钟赛跑（照 `settleIntoLeaving` 的老路子）。同一次 evaluate 里 `click()` 的提交落地后
 * 立刻 `getAnimations()`：它会强制一次样式重算，那条退场动画此刻就在手上。
 *
 * 为什么还要**再停一遍**：二念的果要走一次 store（机器的 `onOutcome` →
 * `recordShenmoOutcome`），那是比 `leaving` 晚一两帧的**另一次提交**，而 `data-shenmo-dim`
 * 与血染都由它驱动——那一提交带来的动画是新对象，不在第一次的名单里。等它用的是
 * Playwright 自己的轮询（跑在驱动进程里，页面里的假时钟碰不到它），而不是 `setTimeout` 或
 * 帧循环：装假时钟的用例那两条都会被冻住。
 *
 * 过渡只拖到中途（`background-color` 那条 seek 到时长的一半）：「血是涌上来的，不是跳上来的」
 * 只有量中途才看得出来——末值上「切换」与「染开」长得一模一样。末值由 `finishDye` 补上。
 */
async function settleIntoFall(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('[data-shenmo-button="a"]')?.click()
    for (const animation of document.getAnimations()) animation.pause()
  })
  await expect(page.locator('main')).toHaveAttribute('data-shenmo-dim', 'true')
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      if ('transitionProperty' in animation) {
        const effect = animation.effect as KeyframeEffect | null
        const duration = effect?.getComputedTiming().duration
        animation.pause()
        // 时长一半 = 染到一半。0s（reduced-motion）时 seek 到 0，与「瞬间切换」同义
        if (typeof duration === 'number') animation.currentTime = duration / 2
      } else {
        animation.pause()
      }
    }
  })
}

/**
 * 把染墨那条过渡推到**末帧**，好让末值读数对得上表上声明的血色（T36）。
 *
 * 为什么不能一开始就推：600ms 等不起，而过渡中途读到的是插值中的颜色，不是表上那个值；
 * 更重要的是「涌」这件事必须先在往返之间被量到（见 `settleIntoFall`）。
 */
async function finishDye(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      if ('transitionProperty' in animation) animation.finish()
    }
  })
}

/**
 * 把二念的两拍终局用**合成**的 `animationend` 推到底（T36），不等那 1200ms。
 *
 * 两条事件各自指名自己那一拍（App 的判据认动画名），所以次序反了、或者真实的结束事件已经
 * 先到过，都不改变结果：`nextShenmoFall` 只认「当前节拍 + 对应的事件」。派发与读回分成
 * 两步（派发走 `page.evaluate`，读回走 Playwright 自己的轮询），与 `fireAnimationEnd`
 * 同一条路子。
 */
async function fallThrough(page: Page): Promise<void> {
  await fireAnimationEnd(page, '[data-shenmo-fall]', 'shenmo-fall-dye')
  await fireAnimationEnd(page, '[data-shenmo-fall]', 'shenmo-fall-out')
}

/**
 * 淡出那一拍的**关键帧**（T36）：名字、时长、起跑延迟，以及末帧的 opacity / transform 与
 * 这条动画一共碰了哪些属性。
 *
 * 为什么读关键帧而不是把动画拖到末帧再读计算样式：`currentTime` 一到末尾，浏览器会把
 * 「这一播放完了」当成真事派发 `animationend`——那一下会把页面当场扣下，而用例正要由自己
 * 的合成事件决定它什么时候算播完。第一版就是这么自作主张红的：末帧读到的是空字符串，
 * 因为元素已经被摘掉了（`getComputedStyle` 对脱离文档的节点给空值）。
 *
 * 只认以这一列为效果目标的 **CSS 动画**：染墨那些 transition 也在这张表里（`settleIntoFall`
 * 把它们拖在中途），而它们没有 `animationName`。
 */
async function fallFrames(page: Page): Promise<{
  name: string
  duration: string
  delay: string
  endOpacity: string
  endTransform: string
  properties: string[]
}> {
  return page.locator('[data-shenmo-fall]').evaluate((element) => {
    const style = getComputedStyle(element)
    const animation = document.getAnimations().find((item) => {
      const effect = item.effect as KeyframeEffect | null
      return effect?.target === element && 'animationName' in item
    })
    const frames = (animation?.effect as KeyframeEffect | null)?.getKeyframes() ?? []
    const last = frames.at(-1) as Record<string, string> | undefined
    return {
      name: style.animationName,
      duration: style.animationDuration,
      delay: style.animationDelay,
      endOpacity: last?.opacity ?? '',
      endTransform: last?.transform ?? '',
      // 「这一个位移都没有」的正面证据：这条动画的关键帧里只有 opacity（对比
      // `shenmo-fall-out` 那一条，它有 transform）。offset / easing 之类是每个关键帧
      // 自带的元数据，不是这条动画碰的属性
      properties: [
        ...new Set(frames.flatMap((frame) => Object.keys(frame))),
      ].filter((key) => !['offset', 'computedOffset', 'easing', 'composite'].includes(key)),
    }
  })
}

/**
 * 触发一条终局，然后**等一帧再暂停整页动画**（T35 的退场断言专用）。
 *
 * 为什么触发与暂停必须在同一次 `page.evaluate` 里：退场只有 150ms，而「容器正带着
 * `data-shenmo-leaving`」这件事要读得到。分成两步（先 `click()` 再回来暂停）的话，中间
 * 几个协议往返一慢，真实的 `animationend` 已经把节点摘掉了，断言就成了与墙钟赛跑。放进
 * 来之后风险窗口缩到**一帧**：等一帧是给 React 把退场标记落上 DOM 的时间——渲染管线给的，
 * 不是 JS 定时器，`page.clock` 那套假时钟够不着它（同一理由见 `fireAnimationEnd` 的注释）。
 * 暂停之后真实结束事件永远不会来，于是卸载由紧接着那条合成事件说。
 */
async function settleIntoLeaving(page: Page, act: ActOnMenu): Promise<void> {
  await page.evaluate(
    ({ kind, target, name }) =>
      new Promise<void>((resolve) => {
        const element = document.querySelector<HTMLElement>(target)
        if (element === null) {
          resolve()
          return
        }
        if (kind === 'click') element.click()
        else
          element.dispatchEvent(
            new AnimationEvent('animationend', { bubbles: true, animationName: name })
          )
        requestAnimationFrame(() => {
          for (const animation of document.getAnimations()) animation.pause()
          resolve()
        })
      }),
    { kind: act.kind, target: act.target, name: 'name' in act ? act.name : '' }
  )
}

/** `settleIntoLeaving` 的两种触发方式：点一颗钮，或派发一条收尾用的合成动画结束事件 */
type ActOnMenu =
  | { readonly kind: 'click'; readonly target: string }
  | { readonly kind: 'dispatch'; readonly target: string; readonly name: string }

/**
 * 容器上那条退场动画的**终局读数**：名字、时长，以及把动画暂停并拖到末帧之后的透明度与
 * 位移。一次 evaluate 里做完，一个墙钟都不掺（150ms 等不起；假时钟冻得住 JS 定时器、冻不住
 * 渲染管线，所以 seek 也走 evaluate）。
 *
 * 「淡到接近 0」于是是**量到的**而不是推测的：末帧的 opacity 就是这段动画自己要停在的地方。
 * 位移那一栏同时是 reduced-motion 的判据——降级之后一个位移都没有（`transform: none`）。
 */
async function exitFacts(page: Page): Promise<{
  name: string
  duration: string
  opacityAtEnd: string
  transformAtEnd: string
}> {
  return page.locator('.shenmo').evaluate((element) => {
    // 找**以这个容器为效果目标**的那条动画，不按名字找：reduced-motion 下它换成
    // `shenmo-fade-out`，名字不同而读的是同一条（进场那条 `shenmo-enter` 早被换掉了）。
    // `effect` 的静态类型是基类 `AnimationEffect`，`target` 住在 `KeyframeEffect` 上——而
    // CSS 动画的 effect 正是一个 KeyframeEffect，所以往那一侧读就读得到
    const exit = document.getAnimations().find((animation) => {
      const effect = animation.effect as KeyframeEffect | null
      return effect?.target === element
    })
    exit?.pause()
    // 拖到末帧。150ms 是 T21 定下的共享姿态，唯一一份声明活在 styles/index.css 里
    if (exit !== undefined) exit.currentTime = 150
    const style = getComputedStyle(element)
    return {
      name: style.animationName,
      duration: style.animationDuration,
      opacityAtEnd: style.opacity,
      transformAtEnd: style.transform,
    }
  })
}

/** 那道环上挂着的动画：名字 + 时长。两段窗口由它证明「挂着、真的是 30 秒」 */
async function ringAnimation(page: Page): Promise<{ name: string; duration: string }> {
  return page.locator('.shenmo__ring').evaluate((element) => {
    const style = getComputedStyle(element)
    return { name: style.animationName, duration: style.animationDuration }
  })
}

/**
 * 三套风格的对比度表（T33）。堕落档的期望值**从表上来**，不在这里写死第二份 hex——
 * 写死就成了第三份真相，风格改色时它会撒谎（与「三套各穿自己的衣服」那条同一条规矩）
 */
const CONTRAST: Readonly<Record<StyleId, { pairs: readonly ContrastPair[] }>> = {
  classic: classicContrast,
  material: materialContrast,
  claude: claudeContrast,
}

/** 表上某一个色档在指定场景里声明的底色。找不到就让用例失败，而不是安静跳过 */
function declaredTile(style: StyleId, bucket: string, scene: 'run' | 'egg'): string {
  const selector = `.board__tile[data-bucket='${bucket}']`
  const pair = CONTRAST[style].pairs.find(
    (item) => item.scene === scene && item.probe?.selector === selector
  )
  if (pair === undefined) throw new Error(`${style} 的表里没有 ${scene} 场景的 ${selector}`)
  return pair.background
}

/** 'rgb(222, 212, 202)' → '#decac4'：计算样式与表上的 hex 之间只差这一步 */
function hexOf(colour: string): string {
  const parts = /rgba?\(([^)]+)\)/.exec(colour)
  if (parts === null) throw new Error(`认不出的颜色：${colour}`)
  const [r = 0, g = 0, b = 0] = parts[1].split(',').map((part) => Number(part.trim()))
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

/**
 * 三通道之和。只用来判「暗下去了」——不是对比度算式，也不假装是。
 * （OKLCH 的明度降一档会把每个通道都往黑推，所以这一个和够说明「动了」；差多少由
 *  check:contrast 那 12 对新探针说。）
 * **T35 起只用于盘面**（棋盘底面 / 可玩空格）：那两个面的主张是「跟着染深了」，通道和
 * 确实一路往下。方块那一侧换成了 bloodOf——血染是把色相与彩度整个换掉，红通道反而会
 * 升，一个和已经说不动「染了」这件事。
 */
function brightness(colour: string): number {
  const parts = /rgba?\(([^)]+)\)/.exec(colour)
  if (parts === null) throw new Error(`认不出的颜色：${colour}`)
  return parts[1]
    .split(',')
    .map((part) => Number(part.trim()))
    .reduce((sum, channel) => sum + channel, 0)
}

/**
 * 「染了血」：红通道成了主通道，且红与最亮的另一通道拉开了多少。
 * 不是主通道（红 ≤ 绿 或 红 ≤ 蓝）就返回 −1，于是「没染血」在任何输入下都不可能更大。
 *
 * **为什么换掉 brightness**：T35 之前堕落是「中性压暗一档」，三通道一起往黑推，一个和
 * 就够。血染换的是色相与彩度——红通道往上升、绿蓝往下降，Claude 最暗两档（基线本就贴近
 * 纯黑）的通道和甚至略微回升。判据于是换成主张本身：堕落不再是「暂停式压暗」，而是
 * 「这块纸染成了血色」。红与次亮通道的差在 48 个堕落取值上一路上升（最保守的一对也涨 35）。
 */
function bloodOf(colour: string): number {
  const parts = /rgba?\(([^)]+)\)/.exec(colour)
  if (parts === null) throw new Error(`认不出的颜色：${colour}`)
  const [r = 0, g = 0, b = 0] = parts[1].split(',').map((part) => Number(part.trim()))
  if (r <= g || r <= b) return -1
  return r - Math.max(g, b)
}

/** 十二档 + beyond 此刻在盘上的底色（按桶位取，beyond 是 '12'；同名桶只读第一枚） */
async function readTileColours(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const seen: Record<string, string> = {}
    for (const element of document.querySelectorAll<HTMLElement>('.board__tile[data-bucket]')) {
      const bucket = element.dataset.bucket ?? ''
      // beyond 有四枚，取第一枚就够（四枚同色）
      if (seen[bucket] === undefined) seen[bucket] = getComputedStyle(element).backgroundColor
    }
    return seen
  })
}

/**
 * **棋盘自己的两个面**此刻的底色（T34）：`board` = `.board` 自己的底面（棋子外面的那一圈），
 * `cell` = 可玩空格（`.board__cell[data-cell='empty']`）。
 *
 * 满盘十六档里十六个格子都在方块底下，而格子节点照旧渲染（底板层与方块层是两棵树），
 * 所以计算样式读得回来——`data-cell` 只在障碍模式才变成 'wall'。
 */
async function readSurfaceColours(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const out: Record<string, string> = {}
    const board = document.querySelector('.board')
    const cell = document.querySelector(".board__cell[data-cell='empty']")
    if (board !== null) out.board = getComputedStyle(board).backgroundColor
    if (cell !== null) out.cell = getComputedStyle(cell).backgroundColor
    return out
  })
}

/** 表上某一个面在堕落态（egg）里声明的色值。找不到就让用例失败，而不是安静跳过 */
function declaredSurface(style: StyleId, selector: string): string {
  const pair = CONTRAST[style].pairs.find(
    (item) => item.scene === 'egg' && item.probe?.selector === selector
  )
  if (pair === undefined) throw new Error(`${style} 的表里没有 egg 场景的 ${selector}`)
  // 这两个面的探针把**面自己**当前景（read: 'background'），所以色值在前景那一栏
  return pair.foreground
}

/** 两个面的中文名（断言信息里要说得清是哪一个） */
const FACE_NAMES: Readonly<Record<string, string>> = {
  board: '棋盘底面',
  cell: '可玩空格',
}

/** 两个面的探针选择器（与 contrast.json 的 egg 场景一一对应） */
const FACE_SELECTORS: Readonly<Record<string, string>> = {
  board: '.board',
  cell: ".board__cell[data-cell='empty']",
}

for (const style of STYLE_CATALOG) {
  test.describe(`${style.label} · 一念神魔的共享契约`, () => {
    test('打口令见两颗钮：无效方向也计数，八下照旧推棋盘', async ({ page }) => {
      const problems = watchProblems(page)
      await page.goto(silentUrl())
      await page.getByRole('group', { name: '风格' }).getByRole('button', { name: style.label }).click()
      // **开局界面输码什么也不发生**（用户故事 7）：那八下连 `hear` 都到不了（App 的
      // `game === null` 分支只做 preventDefault 就返回），摊也没有身份可挂
      await page.keyboard.press('ArrowUp')
      for (const key of CODE_KEYS.slice(1)) await page.keyboard.press(key)
      await page.getByRole('button', { name: '开始游戏' }).click()
      await expect(page.locator('[data-board]')).toBeVisible()
      await expect(menu(page)).toHaveCount(0)

      const opening = await readBoard(page)
      // 第一下按 ↑：这一列顶格在上，滑动不发生——**无效移动**。先量一眼棋盘什么都没变，
      // 再往下打完，于是「无效方向也计数」不是推测而是量到的事实
      await page.locator('[data-board]').focus()
      await page.keyboard.press('ArrowUp')
      expect(await readBoard(page)).toEqual(opening)

      for (const key of CODE_KEYS.slice(1)) await page.keyboard.press(key)

      // 两颗圆钮现身，摊在「抉择」那一档
      await expect(menu(page)).toBeVisible()
      await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'choice')
      await expect(page.locator('[data-shenmo-button="a"]')).toHaveCount(1)
      await expect(page.locator('[data-shenmo-button="b"]')).toHaveCount(1)
      // 两颗钮是可聚焦、有名字的真按钮（用户故事 39：彩蛋不是鼠标专属）
      await expect(page.getByRole('button', { name: '抉择 A' })).toBeVisible()
      await expect(page.getByRole('button', { name: '抉择 B' })).toBeVisible()

      // 八下照旧推棋盘：与夹具相比棋盘确实变了（大片空格被 spawn 填过）
      expect(await readBoard(page)).not.toEqual(opening)
      // 而这个盘上没有任何 2 / 4：八下之内不可能合并，于是一条祝贺都没有
      await expect(page.locator('[data-toast]')).toHaveCount(0)

      expect(problems).toEqual([])
    })

    test('WASD 等价，一个错键整个清空', async ({ page }) => {
      const problems = watchProblems(page)

      // WASD：同一串方向的另一种按法（MOVE_KEYS 在查表前 toLowerCase）
      await startRun(page, style.id, style.label, silentUrl())
      await typeCode(page, WASD_KEYS)
      await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'choice')

      // 一个错键整个清空：前三下对、第四下本该是 ↓ 却按了 →，于是清零——
      // **不是**「拿这个错键当地一键重新匹配」。所以此刻再补四下也凑不出八下。
      // 换一局重开：上一个摊还开着，而摊开着时旁听只攒码、不吞键（机器规则 1），
      // 留着它就没法在这里试「错键」
      await startRun(page, style.id, style.label, silentUrl())
      await typeCode(page, ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowRight'])
      await expect(menu(page)).toHaveCount(0)
      await typeCode(page, CODE_KEYS.slice(4))
      await expect(menu(page)).toHaveCount(0)

      // 从零把整串打完才现身
      await typeCode(page, CODE_KEYS)
      await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'choice')

      expect(problems).toEqual([])
    })

    test('菜单不挡棋：方向键照旧推、两颗钮不压棋盘，Esc 随时收起', async ({ page }) => {
      const problems = watchProblems(page)
      await startRun(page, style.id, style.label, silentUrl())
      await typeCode(page)
      await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'choice')
      const withMenu = await readBoard(page)

      // 方向键照旧走：菜单挂着按一下，棋盘变了。摊开着时旁听只攒码、不吞键（架构决策 1）
      await page.locator('[data-board]').focus()
      await page.keyboard.press('ArrowDown')
      expect(await readBoard(page)).not.toEqual(withMenu)

      // 容器不吃指针，只有两颗钮自己接：这一片不许挡住棋盘（用户故事 11）
      const pointerEvents = await menu(page).evaluate((element) => getComputedStyle(element).pointerEvents)
      expect(pointerEvents).toBe('none')
      // 「两颗钮的盒子不压棋盘」由下面「摆位与红线」那一条**严格**钉住：宽视口断言它们探出
      // 棋盘两侧、窄视口断言整行落在棋盘下方。这里原有一条 `every(overlaps) === false` 的弱版
      // （只要不是两颗都压住就算过），与那条严格的重合——删掉，免得读的人以为摆位只钉到这个
      // 程度（code review 发现 8）

      // Esc 随时收起（用户故事 12），而且什么都不授予
      await page.keyboard.press('Escape')
      await expect(menu(page)).toHaveCount(0)
      expect(await toastNamesEgg(page)).toBe(false)

      expect(problems).toEqual([])
    })

    /**
     * 键盘全程可达（用户故事 39 · T34 的收口票把它从「两颗钮是可聚焦的真按钮」补成
     * **一条走完的路**）。
     *
     * 这里每一句都走真按键，一个 `click()` 都没有：彩蛋不是鼠标专属，指的是一个只用键盘的
     * 玩家能把整条路走完，而不是「按钮刚好是 `<button>`」。
     */
    test('键盘全程可达：打码不偷焦点，Tab 到两颗钮，回车与空格激活，Esc 收起', async ({ page }) => {
      const problems = watchProblems(page)
      await startRun(page, style.id, style.label, silentUrl())

      // 打码那八下都从棋盘出发。摊现身是一次 state 变化，而**焦点不许被偷走**——被偷走的
      // 不是那一下点击，是此后每一次方向键（键盘玩家的整局都挂在焦点落在哪儿上）
      await typeCode(page)
      await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'choice')
      await expect(page.locator('[data-board]')).toBeFocused()

      // Tab：从棋盘出去第一个停靠点就是 A，第二个是 B（DOM 顺序即 Tab 顺序——两颗钮嵌在
      // 包住棋盘的那只壳里，紧跟 Board 之后）。窄视口上它们在棋盘下一行、宽视口在两侧，
      // 两种摆位都不改变「排在棋盘后面」这件事，所以同一条断言两个视口都成立
      await page.keyboard.press('Tab')
      await expect(page.locator('[data-shenmo-button="a"]')).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(page.locator('[data-shenmo-button="b"]')).toBeFocused()

      // Esc 从钮上直接收起（用户故事 12），而且什么都不授予。**放在「激活」之前**：否则
      // 第一条路走完之后屏幕上还留着道通成魔，「什么都没授予」就说不清了
      await page.keyboard.press('Escape')
      await expect(menu(page)).toHaveCount(0)
      expect(await toastNamesEgg(page)).toBe(false)

      // 第二遍：用**回车**激活 B（不是鼠标点）。走的是同一条 onClick 路——一颗 `<button>`
      // 的原生行为，App 一个 keydown 都没为它加
      await typeCode(page)
      await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'choice')
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')
      await expect(page.locator('[data-shenmo-button="b"]')).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'breaking')

      // 破碎退场由合成的 animationend 收尾（不靠墙钟）。B 随它一起不在 DOM 里，于是焦点
      // 掉到 body——而**方向键照旧推得动**（键盘住在 window 上，与焦点落没落到 body 无关）。
      // 这是 2026-09-28 那条「点空白之后照样推棋盘」契约的同一个理由，彩蛋这一侧也要成立
      await fireAnimationEnd(page, '[data-shenmo-button="b"]', 'shenmo-break-fade')
      await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'ring')
      await expect(page.locator('[data-shenmo-button="b"]')).toHaveCount(0)
      const before = await readBoard(page)
      await page.keyboard.press('ArrowDown')
      expect(await readBoard(page)).not.toEqual(before)

      // 只剩 A，而它离棋盘还是只有一个 Tab（B 走了，A 还在原处）
      await page.locator('[data-board]').focus()
      await page.keyboard.press('Tab')
      await expect(page.locator('[data-shenmo-button="a"]')).toBeFocused()
      // 空格同样算激活：与回车一样是 `<button>` 的原生行为
      await page.keyboard.press(' ')
      await expect(menu(page)).toHaveCount(0)
      await expect(toastFor(page, '道通成魔')).toHaveCount(1)

      expect(problems).toEqual([])
    })

    test('结局一：先 B 后 A → 道通成魔（破碎退场 + 那道环）', async ({ page }) => {
      const problems = watchProblems(page)
      await startRun(page, style.id, style.label, silentUrl())
      await typeCode(page)
      await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'choice')

      await page.getByRole('button', { name: '抉择 B' }).click()
      // 点 B：进入破碎退场。此刻 B 还在、还在播
      await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'breaking')
      await expect(page.locator('[data-shenmo-button="b"]')).toHaveAttribute('data-shenmo-breaking', 'true')

      // 破碎退场播完（合成 animationend，不靠墙钟）→ 只剩 A，第二段窗口开始
      await fireAnimationEnd(page, '[data-shenmo-button="b"]', 'shenmo-break-fade')
      await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'ring')
      await expect(page.locator('[data-shenmo-button="b"]')).toHaveCount(0)
      await expect(page.locator('[data-shenmo-button="a"]')).toHaveCount(1)

      // 那道环的动画**真的挂着**、时长真的是 30 秒——「两段都由动画驱动」的可见证据
      const ring = await ringAnimation(page)
      expect(ring.name).toBe('shenmo-ring')
      expect(ring.duration).toBe('30s')

      await page.getByRole('button', { name: '抉择 A' }).click()
      await expect(menu(page)).toHaveCount(0)
      // 道通成魔：走完一遍的祝贺，与别的成就同一条通道（用户故事 31）
      await expect(page.locator('[data-toast]')).toContainText('道通成魔')

      expect(problems).toEqual([])
    })

    test('结局二与三之一：先点 A → 学艺不精；第一段窗口静默到期、什么都不授予', async ({ page }) => {
      const problems = watchProblems(page)

      // 先点 A：两颗一起退场——**进退场，不是凭空消失**（T35）。控制人实测抓到的原话是
      // 「上上下下左右左右A》AB全消失没有动画」：那时每一条终局都是硬切。点下去与「暂停
      // 整页动画」在同一次 evaluate 里做，理由见 `settleIntoLeaving`——150ms 的退场等不起
      // 一个协议往返
      await startRun(page, style.id, style.label, silentUrl())
      await typeCode(page)
      await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'choice')
      await settleIntoLeaving(page, { kind: 'click', target: '[data-shenmo-button="a"]' })
      // 容器先带着退场标记：它与 stage 变在**同一次提交**里落到 DOM 上（渲染期校正，
      // 没有 effect 中间那一帧——ADR-0008 决策 9 照结果层的那一条）
      await expect(menu(page)).toHaveAttribute('data-shenmo-leaving', 'true')
      // 而报的仍是「刚才还在的那一档」，B 也还在：退场放的是同一个容器，画的是同一摊——
      // 不然先点 A 之后 B 会在淡出中凭空冒回来
      await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'choice')
      await expect(page.locator('[data-shenmo-button="b"]')).toHaveCount(1)
      // 淡到接近 0（暂停 + 拖到末帧再读，不靠墙钟）。方向与进场相反：进场从下方 4px
      // 升起，退场往下沉 2px
      const exit = await exitFacts(page)
      expect(exit.name).toBe('shenmo-leave')
      expect(exit.duration).toBe('0.15s')
      expect(Number(exit.opacityAtEnd)).toBe(0)
      expect(exit.transformAtEnd).toBe('matrix(1, 0, 0, 1, 0, 2)')
      // 退场播完：合成的 animationend 说给容器听（`event.target === currentTarget` 那两道
      // 判据在 App 里）→ 机器归 idle → 菜单真的不在 DOM 里
      await fireAnimationEnd(page, '.shenmo', 'shenmo-leave')
      await expect(menu(page)).toHaveCount(0)
      await expect(page.locator('[data-toast]')).toContainText('学艺不精')

      // 放任第一段窗口流尽：**静默**收起，什么都不授予（架构决策 5——一个打错的码不该
      // 指控任何人）。所以这里断的是「菜单没了」+「三个名字一个都没出现」。
      // 它也是一条终局，于是照旧先落退场再走（「静默」说的是不授予，不是原地蒸发）
      await startRun(page, style.id, style.label, silentUrl())
      await typeCode(page)
      await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'choice')
      // 第一段窗口那条动画确实挂着（它不可见，但它是「到期」的唯一信号）
      expect((await ringAnimation(page)).name).toBe('shenmo-window')
      await fireAnimationEnd(page, '.shenmo__ring', 'shenmo-window')
      await expect(menu(page)).toHaveCount(0)
      expect(await toastNamesEgg(page)).toBe(false)

      expect(problems).toEqual([])
    })

    test('结局三之二：第二段窗口到期 → 当断即断', async ({ page }) => {
      const problems = watchProblems(page)
      await startRun(page, style.id, style.label, silentUrl())
      await typeCode(page)
      await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'choice')

      await page.getByRole('button', { name: '抉择 B' }).click()
      await fireAnimationEnd(page, '[data-shenmo-button="b"]', 'shenmo-break-fade')
      await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'ring')

      // 第二段 30 秒流尽
      await fireAnimationEnd(page, '.shenmo__ring', 'shenmo-ring')
      await expect(menu(page)).toHaveCount(0)
      await expect(page.locator('[data-toast]')).toContainText('当断即断')

      expect(problems).toEqual([])
    })

    /**
     * 机器规则 4 的那一条：**B 碎到一半时第一段 30 秒到了头，玩家动过手，不算放任时间流尽**。
     *
     * 这不是防御性编程，是一个真的会发生的赛跑：玩家在第 29.95 秒点下 B，B 的破碎退场
     * （150ms）与第一段窗口的 `animationend` 落在这同一瞬之间。窗口 1 只在 `choice` 到期，
     * 所以动过手的人保住他的魔道——按「哪段先到算哪段」实现的话，那一下点击会被窗口 1 的
     * 结尾静默吞掉，玩家点了 B 却什么也没发生。
     *
     * **回归是真的**：把 `ShenmoChoice.ts` 里 window 1 那句 `stage !== 'choice'` 拆掉再跑，
     * 这条会红（摊当场收起、B 不在 DOM 上）。已按 T33 在时之狭上的做法当场验过。
     */
    test('B 碎到一半时第一段窗口到头：动过手的人不算放任流尽', async ({ page }) => {
      const problems = watchProblems(page)
      await startRun(page, style.id, style.label, silentUrl())
      await typeCode(page)
      await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'choice')

      await page.getByRole('button', { name: '抉择 B' }).click()
      await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'breaking')
      // 破碎退场还没播完，第一段窗口的动画先到了头：摊必须还在，B 也必须还在
      await fireAnimationEnd(page, '.shenmo__ring', 'shenmo-window')
      await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'breaking')
      await expect(page.locator('[data-shenmo-button="b"]')).toHaveCount(1)
      expect(await toastNamesEgg(page)).toBe(false)

      // 破碎退场自己收尾，魔道照旧走成「只剩 A」
      await fireAnimationEnd(page, '[data-shenmo-button="b"]', 'shenmo-break-fade')
      await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'ring')

      expect(problems).toEqual([])
    })

    /**
     * 堕落染墨的**新地址**（T36 · 控制人 2026-10-01 裁定，**故意的行为变更**）。
     *
     * 业主的原话：「你似乎理解错我的意思了，这个染血色的触发条件是**重复输入两次作弊码**，
     * 先染出血色，然后**淡出关闭棋盘页面**。并非是输错了，输错了直接重来。」再追问一句
     * 「第二次输对码时 A/B 抉择还出现吗」，答的是「仍然先出 A/B，走完才染血」。
     *
     * 于是染墨从「只剩 A 的那 30 秒」搬到**二念的终局**。这一条把旧主张逐条改掉——旧版断
     * 的是「魔道那 30 秒里染成血色、两个出口都当场退回去」，如今断的是反话与其正话：
     * 魔道那 30 秒一眼血色都没有、两个出口一律不染，而第二遍走完才染，且染的是**同一组
     * 血色值**（contrast.json 的 egg 场景，一个字都没改）。**一条断言都没删**——删了就没有
     * 人守「那边不许有血」了，而这正是本次裁定要钉住的东西。
     */
    test('堕落染墨：魔道那 30 秒一眼血色都没有，血只在二念的终局里涌上来', async ({ page }) => {
      const problems = watchProblems(page)
      await startRun(page, style.id, style.label, dimUrl())
      await typeCode(page)
      await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'choice')

      // 堕落前先读一遍：于是「染了血」是一个**比较**，不是「看着像染了」
      const bright = await readTileColours(page)
      expect(Object.keys(bright).sort()).toEqual(
        ['1', '10', '11', '12', '2', '3', '4', '5', '6', '7', '8', '9']
      )
      for (const [bucket, colour] of Object.entries(bright)) {
        expect(hexOf(colour), `${style.label} 第 ${bucket} 档堕落前的底色`).toBe(
          declaredTile(style.id, bucket, 'run')
        )
      }
      // **棋盘自己的两个面也先读一遍**（T34）：它们与十二档同一条主张——「整个场景染了」。
      // 而这里要证的是反话：魔道那 30 秒里它们一个比特都不动
      const brightSurfaces = await readSurfaceColours(page)
      expect(Object.keys(brightSurfaces).sort()).toEqual(['board', 'cell'])

      // 点 B → 破碎 → 只剩 A：**魔道那 30 秒一眼血色都没有**（染血的开关搬去二念终局了）。
      // 玩家还在选，那不是入魔——而「错键整个清空重来」与血色无关（既有行为，另有单测钉）
      await page.getByRole('button', { name: '抉择 B' }).click()
      await fireAnimationEnd(page, '[data-shenmo-button="b"]', 'shenmo-break-fade')
      await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'ring')
      // 总开关整个不在 DOM 上（React 在值为 undefined 时连属性都不渲染）
      await expect(page.locator('main')).not.toHaveAttribute('data-shenmo-dim', 'true')
      // 十二档与两个盘面仍是堕落前读到的那一组值
      expect(await readTileColours(page)).toEqual(bright)
      expect(await readSurfaceColours(page)).toEqual(brightSurfaces)

      // 出口一：放任环流尽（合成 animationend，不等 30 秒）→ 当断即断，依旧不染。
      // 「时间到」与「点 A」是两个不同的出口，而两个都不该染——旧实现里这一条断的是
      // 「暗档当场退回去」，如今断的是「它压根没上来过」
      await fireAnimationEnd(page, '.shenmo__ring', 'shenmo-ring')
      await expect(menu(page)).toHaveCount(0)
      await expect(toastFor(page, '当断即断')).toHaveCount(1)
      await expect(page.locator('main')).not.toHaveAttribute('data-shenmo-dim', 'true')
      expect(await readTileColours(page)).toEqual(bright)

      // 第一遍完整走完：同一串口诀 → 点 B → 破碎 → 只剩 A → 点 A。**这一遍也不染**——
      // 一念给的是奖品，不是代价（父规格的架构决策 6：只有第二遍是另一句话）
      await typeCode(page)
      await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'choice')
      await page.getByRole('button', { name: '抉择 B' }).click()
      await fireAnimationEnd(page, '[data-shenmo-button="b"]', 'shenmo-break-fade')
      await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'ring')
      await expect(page.locator('main')).not.toHaveAttribute('data-shenmo-dim', 'true')
      await page.getByRole('button', { name: '抉择 A' }).click()
      await expect(menu(page)).toHaveCount(0)
      await expect(toastFor(page, '道通成魔')).toHaveCount(1)
      await expect(page.locator('main')).not.toHaveAttribute('data-shenmo-dim', 'true')
      expect(await readTileColours(page)).toEqual(bright)
      expect(await readSurfaceColours(page)).toEqual(brightSurfaces)

      // 第二遍：同一串口诀再打一遍，走到只剩 A —— **依然没有血色**。第一遍与第二遍摆出的
      // 是同一副摊（机器那一边由单测钉），这里证的是「走到第二遍的环上也不提前染」
      await typeCode(page)
      await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'choice')
      await page.getByRole('button', { name: '抉择 B' }).click()
      await fireAnimationEnd(page, '[data-shenmo-button="b"]', 'shenmo-break-fade')
      await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'ring')
      await expect(page.locator('main')).not.toHaveAttribute('data-shenmo-dim', 'true')

      // **点下第二遍的 A**：血染涌上来。点击与冻结同一次 evaluate（理由见 `settleIntoFall`）
      await settleIntoFall(page)
      await expect(page.locator('main')).toHaveAttribute('data-shenmo-dim', 'true')

      // **血是「涌」上来的，不是「跳」上来的**：过渡被拖到时长的一半，每一档都严格落在基座值
      // 与血色之间。末值上「切换」与「染开」长得一模一样——只有量中途才知道浏览器真的在补帧
      // （这一条同时守住 board.css 那几条 transition 真的在跑：写在 after-change 样式里的
      //  过渡才是会跑的那一种）
      const midDye = await readTileColours(page)
      expect(Object.keys(midDye).sort()).toEqual(Object.keys(bright).sort())
      for (const [bucket, colour] of Object.entries(midDye)) {
        const blood = declaredTile(style.id, bucket, 'egg')
        expect(colour, `${style.label} 第 ${bucket} 档染到一半的底色`).not.toBe(bright[bucket])
        expect(hexOf(colour), `${style.label} 第 ${bucket} 档染到一半的底色`).not.toBe(blood)
      }

      // 推到末帧再读：末值就是表上声明的那个血色
      await finishDye(page)
      const dimmed = await readTileColours(page)
      for (const [bucket, colour] of Object.entries(dimmed)) {
        // 1) 每一档都换成了**表上声明的那个血色**——染墨落实为令牌换色，不是盖一层半透明
        //    遮罩（遮罩在闸门眼里是隐形的，父规格的架构决策 15 说的就是这件事）
        expect(hexOf(colour), `${style.label} 第 ${bucket} 档的堕落底色`).toBe(
          declaredTile(style.id, bucket, 'egg')
        )
        // 2) 而且**确实染了血**（bloodOf）：红通道成了主通道、且比最亮的另一通道拉开更多——
        //    不是把同一组值重新贴一遍，也不是只把亮度拨了一下
        expect(bloodOf(colour), `${style.label} 第 ${bucket} 档没有染上血色`).toBeGreaterThan(
          bloodOf(bright[bucket])
        )
      }
      // 十二档一个都没少：堕落态仍然是十二档，不是「只剩几档看得见」
      expect(Object.keys(dimmed)).toHaveLength(12)

      // 棋盘自己的两个面（T34）：换成表上声明的血色，而且确实染深了。判据比十二档多一条——
      // 它们不载字，主张是「盘面跟着整个场景一起染」，所以血与深两个方向都要在
      const dimmedSurfaces = await readSurfaceColours(page)
      for (const [face, colour] of Object.entries(dimmedSurfaces)) {
        const name = FACE_NAMES[face] ?? face
        expect(hexOf(colour), `${style.label} ${name}的堕落底色`).toBe(
          declaredSurface(style.id, FACE_SELECTORS[face])
        )
        // 血与深两件事分开断：盘面染成血（与十二档同一条判据），而且确实比堕落前深
        expect(bloodOf(colour), `${style.label} ${name}没有染上血色`).toBeGreaterThan(
          bloodOf(brightSurfaces[face])
        )
        expect(brightness(colour), `${style.label} ${name}没有变暗`).toBeLessThan(
          brightness(brightSurfaces[face])
        )
      }

      expect(problems).toEqual([])
    })

    /**
     * 二念的**两拍终局**（T36 · 控制人 2026-10-01 裁定）。
     *
     * 原话：「先染出血色，然后**淡出关闭棋盘页面**。并非是输错了，输错了直接重来。」
     * 于是第二遍完整走完 B → A 之后，整条游戏列走一段两拍才被扣下：
     * 血染上来（600ms）→ 停一拍（200ms）→ 淡出（400ms）→ 只剩「重新开始」与悬顶。
     *
     * 三条为什么值得一条用例：
     *   · **两拍必须分开推进**。合成 `animationend` 各指名自己那一拍（App 判动画名），所以
     *     「血没染完就淡出」这种把两拍并成一拍的回归会当场红在第一道断言上；
     *   · **时长只活在 CSS 里**，所以这里量的是计算样式上的那个数（0.6s / 0.4s + 0.2s 延迟），
     *     不是「看起来对了」；
     *   · **悬顶与祝贺落在血染那一帧**（不是页面扣下之后）：玩家点下 A 的那一刻就知道
     *     发生了什么，而那 1200ms 里它一直看得见。
     */
    test('二念的终局：血染涌上来，停一拍，整列淡出，页面才扣下', async ({ page }) => {
      const problems = watchProblems(page)
      await startRun(page, style.id, style.label, silentUrl())

      // 两遍完整的 B → A。第一遍给一念（奖品），第二遍结二念（代价）——终局从第二遍点 A 起跑
      await typeCode(page)
      await completePass(page)
      await expect(toastFor(page, '道通成魔')).toHaveCount(1)
      await typeCode(page)
      await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'choice')
      await page.getByRole('button', { name: '抉择 B' }).click()
      await fireAnimationEnd(page, '[data-shenmo-button="b"]', 'shenmo-break-fade')
      await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'ring')

      // 点下第二遍的 A：整列**还在台上**（要等淡出才走），而血染已经上来了。
      // 触发与冻结同一次 evaluate（理由见 `settleIntoFall`）——不然两拍自己播完，
      // 下面的读数就成了与墙钟赛跑
      await settleIntoFall(page)
      const column = page.locator('[data-shenmo-fall]')
      await expect(column).toHaveAttribute('data-shenmo-fall', 'dye')
      await expect(page.locator('main')).toHaveAttribute('data-shenmo-dim', 'true')
      // 棋盘还在：被扣下是**淡出播完之后**的事，不是这一帧
      await expect(page.locator('[data-board]')).toHaveCount(1)
      // 悬顶与祝贺都在血染这一帧就落下（父规格的架构决策 10；toast 走普通通道，用户故事 31）
      await expect(strip(page)).toHaveCount(1)
      await expect(strip(page)).toContainText(SECOND_PASS_NAME)
      await expect(toastFor(page, SECOND_PASS_NAME)).toHaveCount(1)
      // 整列一个指针都不接：血染到一半不该能被那颗「新游戏」拽回一局能打的棋
      expect(await column.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe('none')

      // 血染那一拍：跑满 600ms 的节拍器动画（它自己一个像素都不画，理由见 index.css 那段）
      const dye = await column.evaluate((element) => {
        const style = getComputedStyle(element)
        return { name: style.animationName, duration: style.animationDuration }
      })
      expect(dye).toEqual({ name: 'shenmo-fall-dye', duration: '0.6s' })

      // 第一拍播完（合成 animationend，不靠墙钟）→ 淡出那一拍：200ms 停顿 + 400ms 淡出
      await fireAnimationEnd(page, '[data-shenmo-fall]', 'shenmo-fall-dye')
      await expect(column).toHaveAttribute('data-shenmo-fall', 'out')
      // 末帧：淡到 0，且沉下去 2px（与结果层的卡片退场同一个数——落下比升起轻）。
      // 读关键帧而不是把动画拖到末帧，理由见 `fallFrames`
      const fade = await fallFrames(page)
      expect(fade.name).toBe('shenmo-fall-out')
      expect(fade.duration).toBe('0.4s')
      expect(fade.delay).toBe('0.2s')
      expect(fade.endOpacity).toBe('0')
      expect(fade.endTransform).toBe('translateY(2px)')

      // 第二拍播完 → 页面扣下：只剩「重新开始」与那条悬顶（T32 的既有行为，一个字都没改）
      await fireAnimationEnd(page, '[data-shenmo-fall]', 'shenmo-fall-out')
      await expect(page.locator('[data-board]')).toHaveCount(0)
      await expect(page.locator('.shenmo')).toHaveCount(0)
      await expect(strip(page)).toHaveCount(1)
      await expect(page.getByRole('button', { name: '重新开始' })).toHaveCount(1)
      // 焦点有着落（T34 · 用户故事 39 的另一半）：玩家刚刚点的是抉择 A，而那颗钮随整列一起
      // 被摘下，焦点于是掉到 body——页面上只剩一颗按钮，这一条保证它有地方可去
      await expect(page.getByRole('button', { name: '重新开始' })).toBeFocused()

      // **同一局会话里还能再走一次**（T36 新补的一脚）：点「重新开始」= 开新局，彩蛋旗标跟着
      // 清零，而两拍的节拍必须**跟着复位**——不复位的话第二次二念会一瞬间扣下页面、两拍一次
      // 都不播（玩家看到的还是旧行为，而这一回是回归）。纯函数那一条由单测钉，这里证的是
      // 复位真的接上了 React
      await page.getByRole('button', { name: '重新开始' }).click()
      await expect(page.locator('[data-board]')).toBeVisible()
      await expect(strip(page)).toHaveCount(0)
      await typeCode(page)
      await completePass(page)
      await typeCode(page)
      await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'choice')
      await page.getByRole('button', { name: '抉择 B' }).click()
      await fireAnimationEnd(page, '[data-shenmo-button="b"]', 'shenmo-break-fade')
      await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'ring')
      await page.getByRole('button', { name: '抉择 A' }).click()
      // 第二局的二念照旧从血染那一拍起跑，而不是一上来就扣下
      await expect(page.locator('[data-shenmo-fall]')).toHaveAttribute('data-shenmo-fall', 'dye')

      expect(problems).toEqual([])
    })

    /**
     * reduced-motion 下的终局（T36）：染墨**瞬间**切换、淡出只剩透明度，而两拍照旧播完。
     *
     * 这是整个特性最尖锐的那个陷阱的又一版（架构决策 4）：环那一侧靠「只撤颜料、不换动画」
     * 保住计时，终局这一侧同理——**降级的是动，不是流程**。一个请求了少动量的玩家不能被
     * 永久困在一段播不完的终局里，页面必须照旧扣下去。
     *
     * 两处降级各自一条判据：
     *   · 染墨把时长**置 0**而不是把 `transition` 拆掉。拆掉会把 T21 那三条位移 / 入场 /
     *     合并脉冲一起弄丢（终局那 600ms 里玩家照样可能按方向键，症状只是「染血的时候方块
     *     不滑了」）——所以这里断的是 background-color 那一条时长归零，其余三条原样；
     *   · 淡出换成只有透明度的那一条，一个位移都没有（淡出是允许的，位移不是）。
     * 节拍器一个字节都不动：它本来一个位移都没有，没有可撤的颜料，而**两拍的推进全靠它**。
     */
    test('reduced-motion 下的终局：染墨瞬间、淡出只剩透明度，而两拍照旧播完', async ({ page }) => {
      const problems = watchProblems(page)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await startRun(page, style.id, style.label, silentUrl())

      // 两遍走完：第一遍一念，第二遍二念（reduced-motion 下破碎退场也是一次淡出，碎渣一个
      // 都不渲染，那一条由下面那条 reduced-motion 用例钉）
      await typeCode(page)
      await completePass(page)
      await typeCode(page)
      await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'choice')
      await page.getByRole('button', { name: '抉择 B' }).click()
      await fireAnimationEnd(page, '[data-shenmo-button="b"]', 'shenmo-break-fade')
      await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'ring')

      // 点下第二遍的 A 并当场冻住（触发与第一次停住必须在同一次 evaluate 里，理由见
      // `settleIntoFall`）。冻结不改变计算样式上的声明，所以下面读的都是「降级之后的样子」
      await settleIntoFall(page)
      const column = page.locator('[data-shenmo-fall]')
      await expect(column).toHaveAttribute('data-shenmo-fall', 'dye')
      // 节拍器照旧跑满 600ms：它一个位移都没有，没有可撤的颜料。**降级把过渡时长置 0 时不许
      // 顺手把它也置 0**——那会把「停一拍」归零，两拍并成一拍，reduced-motion 下点击之后页面
      // 当场扣下（第一版就是这么坏的，这一条就是它的回归用例）
      const beat = await column.evaluate((element) => {
        const style = getComputedStyle(element)
        return { name: style.animationName, duration: style.animationDuration }
      })
      expect(beat).toEqual({ name: 'shenmo-fall-dye', duration: '0.6s' })
      // 方块那一条过渡：background-color 归零，而四条通道一条都没少（前三条的时长是各风格
      // 自己的 reduced-motion 降级——Material / Claude 把它们也置 0，那与本票无关；这里断的
      // 是「没有把 transition 拆掉」：拆掉的话 background-color 这一条会连通道一起消失）
      const dye = await page.locator('.board__tile').first().evaluate((element) => {
        const style = getComputedStyle(element)
        return { property: style.transitionProperty, duration: style.transitionDuration }
      })
      expect(dye.property.split(', ')).toEqual(['translate', 'opacity', 'scale', 'background-color'])
      expect(dye.duration.split(', ').at(-1)).toBe('0s')

      // 第一拍播完 → 淡出那一拍换成只有透明度的那一条：时长与停顿照旧（reduced-motion 要的是
      // 「少一点动」，不是「什么都没有」），而**一个位移都没有**——关键帧里只有 opacity
      // （对比正常态那一条，它有 transform）。读关键帧而不是把动画拖到末帧，理由见
      // `fallFrames`：拖到末尾会自己派发一次 `animationend`，把页面当场扣下
      await fireAnimationEnd(page, '[data-shenmo-fall]', 'shenmo-fall-dye')
      await expect(column).toHaveAttribute('data-shenmo-fall', 'out')
      const fade = await fallFrames(page)
      expect(fade.name).toBe('shenmo-fall-fade')
      expect(fade.duration).toBe('0.4s')
      expect(fade.delay).toBe('0.2s')
      expect(fade.properties).toEqual(['opacity'])
      expect(fade.endOpacity).toBe('0')
      expect(fade.endTransform).toBe('')

      // **而两拍照旧播完**（架构决策 4 要保住的就是这件事）：合成事件把页面扣下
      await fireAnimationEnd(page, '[data-shenmo-fall]', 'shenmo-fall-fade')
      await expect(page.locator('[data-board]')).toHaveCount(0)
      await expect(page.getByRole('button', { name: '重新开始' })).toHaveCount(1)
      await expect(strip(page)).toHaveCount(1)

      expect(problems).toEqual([])
    })

    test('阶段变化与开新局都立刻收起、什么都不授予', async ({ page }) => {
      const problems = watchProblems(page)
      await startRun(page, style.id, style.label, phaseUrl())
      await typeCode(page)
      await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'choice')

      // 第九下按 ↑：两个 1024 并成 2048 → phase 变 won → 摊当场消失（架构决策 5 后半句：
      // 被打断不是动摇，什么都不授予）
      await page.locator('[data-board]').focus()
      await page.keyboard.press('ArrowUp')
      await expect(page.locator('[data-result-tier="won"]')).toBeVisible()
      await expect(menu(page)).toHaveCount(0)
      expect(await toastNamesEgg(page)).toBe(false)

      // 开新局同样清零：摊不许跟到新棋盘上，果也不许跟到新一局。
      // 从**胜利面板上**那一颗「新游戏」走出去：同名按钮在延迟卸载的 150ms 里会有两个，
      // 不指明哪一个会撞 strict mode（T27 的在场裁决顺带来的一个测试要当心的地方）
      await page.locator('[data-panel="win"]').getByRole('button', { name: '新游戏' }).click()
      await expect(page.locator('[data-result-tier]')).toHaveCount(0)
      await expect(page.locator('[data-board]')).toBeVisible()
      await typeCode(page)
      await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'choice')
      await page.getByRole('button', { name: '新游戏' }).click()
      await expect(menu(page)).toHaveCount(0)
      expect(await toastNamesEgg(page)).toBe(false)

      expect(problems).toEqual([])
    })

    /**
     * 非 playing 阶段打码什么都不发生（T29 之后修的回归 · code review 发现 2）。
     *
     * App 的 keydown 只对 `game === null` 早退：won / stuck / ended 底下 `move()` 被 store 拒了，
     * 而那八下照样往机器里攒——机器不认识阶段，它只认「这一局的身份」（`phase@startedAt`），
     * 身份在阶段变化时只把摊收起、不停止旁听。于是结果层挂着时连按八下方向键会**真的召出
     * 第二个摊**：宽视口两颗钮探在棋盘盒子外、点得着（还能把限时时钟按住），窄视口被
     * `inset: 0` 的遮罩整个压住、看得见点不动，30 秒后静默消失。
     * 修法是 `hear` 那一下加 `game.phase === 'playing'` 守卫（与一念按钮、`plantWish`
     * 同一个口径）。三个非对局阶段各走一遍。
     */
    test('won / stuck / ended 底下打码：菜单一个都不现身', async ({ page }) => {
      const problems = watchProblems(page)

      /** 把神魔码打一遍：菜单一个节点都不该在 DOM 里 */
      async function typeAndExpectNothing(): Promise<void> {
        await expect(menu(page)).toHaveCount(0)
        await typeCode(page)
        await expect(menu(page)).toHaveCount(0)
        await expect(page.locator('[data-shenmo-button]')).toHaveCount(0)
      }

      // won：一步合出第二个 2048 → 胜利面板
      await startRun(page, style.id, style.label, winUrl())
      await page.locator('[data-board]').focus()
      await page.keyboard.press('ArrowLeft')
      await expect(page.locator('[data-panel="win"]')).toBeVisible()
      await typeAndExpectNothing()

      // stuck：一步即死局 → 死局面板
      await startRun(page, style.id, style.label, deadlockUrl())
      await page.locator('[data-board]').focus()
      await page.keyboard.press('ArrowRight')
      await expect(page.locator('[data-panel="gameover"]')).toBeVisible()
      await typeAndExpectNothing()

      // ended：从死局面板结算 → 终局
      await page.getByRole('button', { name: '结束并记录' }).click()
      await expect(page.locator('[data-panel="gameover"]')).toBeVisible()
      await typeAndExpectNothing()

      expect(problems).toEqual([])
    })

    /**
     * B 的破碎退场（T34 重做）：**450ms、四片、错开起跑**。
     *
     * 为什么时长值得一条用例：150ms 是一闪，而这是整个彩蛋**唯一的一次物理事件**——
     * 两段 30 秒都是「什么都不发生」的计时，抓不住是应该的，这一下不是。原话是业主自己
     * 跑过之后的回话：「没看到破碎的动画」。时长只活在 CSS 里（`index.css` 的
     * `--shenmo-break-duration`），所以这里断的是计算样式上那个数，不是「看起来变长了」。
     *
     * 四片碎渣是**真的元素**（两个伪元素各只能装一片），只在 `breaking` 那一刻挂载、
     * `aria-hidden`；字形写在每片自己的 `::before` 上而不是当作文本子节点，所以按钮的
     * 可访问名字仍是「抉择 B」，不会变成「BBBB」。
     *
     * **先把动画全部暂停再量**（而不是抢在 450ms 之前）：`broke()` 听的是
     * `animationend`，那块墙钟一到 B 就整颗离开 DOM，慢一步这一条会读到一个空数组。
     * 暂停的动画不派发结束事件，于是摊稳稳停在 `breaking` 上等断言。
     */
    test('B 碎成四片：450ms 四片错开起跑，碎片是装饰、不进无障碍树', async ({ page }) => {
      const problems = watchProblems(page)
      await startRun(page, style.id, style.label, silentUrl())
      await typeCode(page)
      await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'choice')
      // 摊开着的时候一颗碎片都不在：它们只在破碎那一刻挂载
      await expect(page.locator('.shenmo__shard')).toHaveCount(0)

      await page.getByRole('button', { name: '抉择 B' }).click()
      await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'breaking')
      await expect(page.locator('[data-shenmo-button="b"]')).toHaveAttribute(
        'data-shenmo-breaking',
        'true'
      )

      const shards = await page.locator('.shenmo__shard').evaluateAll((elements) => {
        // 暂停整页的动画：450ms 的墙钟会把 B 整颗摘掉（见上面那段注释）
        for (const animation of document.getAnimations()) animation.pause()
        return elements.map((element) => {
          const style = getComputedStyle(element)
          return {
            quadrant: element.getAttribute('data-shenmo-shard'),
            hidden: element.getAttribute('aria-hidden'),
            animation: style.animationName,
            duration: style.animationDuration,
            delay: style.animationDelay,
            clip: style.clipPath,
            glyph: getComputedStyle(element, '::before').content,
            text: element.textContent ?? '',
          }
        })
      })

      // 四片，各占一个象限（顺序就是 DOM 顺序：左上 → 右上 → 左下 → 右下）
      expect(shards.map((shard) => shard.quadrant)).toEqual(['tl', 'tr', 'bl', 'br'])
      for (const shard of shards) {
        expect(shard.hidden, '碎片是装饰，不能进无障碍树').toBe('true')
        // 字形由 ::before 给，元素自己一个字符都不带——这是「名字不变 BBBB」的根
        expect(shard.glyph).toBe('"B"')
        expect(shard.text).toBe('')
        // 各剪一个象限（不是「缩放一个圆了事」）
        expect(shard.clip).not.toBe('none')
        // 每片只播 360ms：最后一片晚 90ms 起跑，得让它在 450ms 上正好收尾——
        // 用整段 450ms 的话，`broke()` 摘掉 B 的那一刻它还悬在半空中
        expect(shard.duration, `${shard.quadrant} 片的时长`).toBe('0.36s')
      }
      // 错开起跑：0 / 30 / 60 / 90ms（--shenmo-shard-stagger 是 30ms）
      expect(shards.map((shard) => shard.delay)).toEqual(['0s', '0.03s', '0.06s', '0.09s'])
      expect(shards.map((shard) => shard.animation)).toEqual([
        'shenmo-shard-tl',
        'shenmo-shard-tr',
        'shenmo-shard-bl',
        'shenmo-shard-br',
      ])
      // 整颗按钮自己那条淡出跑满 450ms。**这个名字一个字都不能改**：App 的
      // `onAnimationEnd` 判据、以及本文件与 contrast-computed / wish / clock 三份
      // 派发的合成 `animationend` 都指着它
      const fade = await page.locator('[data-shenmo-button="b"]').evaluate((element) => {
        const style = getComputedStyle(element)
        return { name: style.animationName, duration: style.animationDuration }
      })
      expect(fade).toEqual({ name: 'shenmo-break-fade', duration: '0.45s' })

      // **碎渣的动画结束事件不许冒充「破碎播完」**（T27 的同款坑，而这一回多出四条
      // 后代动画）：四片都是按钮的后代，它们各播一条动画，结束事件一路冒到按钮的
      // `onAnimationEnd` 上。判据是 `event.target === event.currentTarget`（外加
      // animationName 那一层）。这里把第一片碎渣的结束事件派发出去，摊必须**还在
      // breaking**——真被冒充的话，机器会提前 300 多毫秒走到「只剩 A」，而玩家看见的
      // 是「B 还在碎、环已经开始走」
      await page.evaluate(() => {
        document
          .querySelector('.shenmo__shard')
          ?.dispatchEvent(new AnimationEvent('animationend', { bubbles: true, animationName: 'shenmo-shard-tl' }))
      })
      await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'breaking')
      await expect(page.locator('[data-shenmo-button="b"]')).toHaveCount(1)

      // 退场播完：四片跟着整颗按钮一起离开 DOM，不是「留下四片透明的 B」
      await fireAnimationEnd(page, '[data-shenmo-button="b"]', 'shenmo-break-fade')
      await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'ring')
      await expect(page.locator('.shenmo__shard')).toHaveCount(0)

      expect(problems).toEqual([])
    })

    test('reduced-motion：环不可见而计时动画留下，一个位移都没有，两段窗口照旧到期', async ({
      page,
    }) => {
      // 整个特性最尖锐的陷阱（架构决策 4）：照结果层那条路子把计时动画也换掉，菜单就永远
      // 不收起——一个请求了少动量的玩家会被困在一个收不回去的摊前，那比动画本身严重得多
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await startRun(page, style.id, style.label, silentUrl())
      await typeCode(page)
      await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'choice')

      // 进场只淡入淡出：`shenmo-enter` 带着 4px 升起，reduced-motion 下换成一条只有
      // opacity 的 `shenmo-fade-in`（与结果层的卡片同一条降级路子）
      expect(await menu(page).evaluate((element) => getComputedStyle(element).animationName)).toBe(
        'shenmo-fade-in'
      )

      await page.getByRole('button', { name: '抉择 B' }).click()
      await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'breaking')
      // 破碎退场里那四片碎渣一个都不渲染（用户故事 38：没有「裂成几半飞走」这件事）。
      // **碎渣是真元素了**（T34：两个伪元素各只能装一片，装不下四片），所以判据跟着
      // 搬了家——「不渲染」现在由 `display: none` 说。它读得回来，所以这仍是量到的而
      // 不是推测。当年读的是按钮自己的 `::before` 的 `content: none`；伪元素那两片已经
      // 没有了，再读 `::before` 只会安静地读到 none，而那不再是任何证据
      const shards = await page
        .locator('[data-shenmo-button="b"] .shenmo__shard')
        .evaluateAll((elements) =>
          elements.map((element) => ({
            display: getComputedStyle(element).display,
            hidden: element.getAttribute('aria-hidden'),
          }))
        )
      // React 不知道 reduced-motion，四片照样挂在那儿（切成两半飞走那件事由 CSS 撤掉）
      expect(shards).toHaveLength(4)
      for (const shard of shards) {
        expect(shard.display, 'reduced-motion 下一片都不渲染').toBe('none')
        expect(shard.hidden).toBe('true')
      }

      await fireAnimationEnd(page, '[data-shenmo-button="b"]', 'shenmo-break-fade')
      await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'ring')

      // 环的**颜料**被撤掉（描边透明），而动画一行没动：名字换成「不动的那一版」、
      // 时长仍是 30 秒——`animationend` 照旧到位
      const ring = await page.locator('.shenmo__ring').evaluate((element) => {
        const style = getComputedStyle(element)
        return {
          animationName: style.animationName,
          animationDuration: style.animationDuration,
          borderColor: style.borderTopColor,
        }
      })
      expect(ring.animationName).toBe('shenmo-ring-still')
      expect(ring.animationDuration).toBe('30s')
      // 一圈透明的边 = 没有任何可见的环（写法不是 opacity：那一位会被动画盖掉）
      expect(ring.borderColor).toBe('rgba(0, 0, 0, 0)')

      // 于是第二段窗口照旧到期、菜单照旧收起（架构决策 4 要保住的就是这件事）。
      // 派发与暂停在同一次 evaluate 里（见 `settleIntoLeaving`）：这条终局的退场也要读得到
      await settleIntoLeaving(page, {
        kind: 'dispatch',
        target: '.shenmo__ring',
        name: 'shenmo-ring-still',
      })
      await expect(menu(page)).toHaveAttribute('data-shenmo-leaving', 'true')
      // reduced-motion 下的退场：只留淡入淡出那一对，一个位移都没有（与进场的降级同一条
      // 路子）。**时长照旧 150ms**——reduced-motion 要的是「少一点动」，不是「什么都没有」；
      // 而这一换只动容器自己那条，环的计时动画一行没碰，所以结束事件照旧到位
      const exit = await exitFacts(page)
      expect(exit.name).toBe('shenmo-fade-out')
      expect(exit.duration).toBe('0.15s')
      expect(Number(exit.opacityAtEnd)).toBe(0)
      expect(exit.transformAtEnd).toBe('none')
      // 退场播完（合成 animationend，不靠墙钟）→ 机器归 idle → 菜单不在 DOM 里
      await fireAnimationEnd(page, '.shenmo', 'shenmo-fade-out')
      await expect(menu(page)).toHaveCount(0)
      await expect(page.locator('[data-toast]')).toContainText('当断即断')

      // 第一段窗口也照旧到期。它那条动画在 reduced-motion 下**一个字都没改**——它本来
      // 全程不可见，没有可撤的颜料——所以这里断的是「再打一遍码，它照样收摊」
      await typeCode(page)
      await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'choice')
      expect((await ringAnimation(page)).name).toBe('shenmo-window')
      await fireAnimationEnd(page, '.shenmo__ring', 'shenmo-window')
      await expect(menu(page)).toHaveCount(0)
      // 静默：除了刚拿到的那颗当断即断，一个彩蛋祝贺都没多出来（架构决策 5——一个打错的码
      // 不该指控任何人）。**不跟总条数比**：当断即断自己走着 5 秒的寿命，数条数会把
      // 「它到期了」误读成「多了条新的」
      for (const name of ['道通成魔', '学艺不精', SECOND_PASS_NAME]) {
        await expect(page.locator('[data-toast]').filter({ hasText: name })).toHaveCount(0)
      }
    })

    test('摆位与红线：两种视口下都不横向溢出', async ({ page }) => {
      await startRun(page, style.id, style.label, silentUrl())
      await typeCode(page)
      await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'choice')

      const wide = (page.viewportSize()?.width ?? 0) >= 760
      const metrics = await page.evaluate(() => {
        const board = document.querySelector('[data-board]')
        const container = document.querySelector('.shenmo')
        return {
          overflow: {
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
          },
          containerPosition: container === null ? '' : getComputedStyle(container).position,
          board: board === null ? null : board.getBoundingClientRect().toJSON(),
          buttons: [...document.querySelectorAll('.shenmo__button')].map((element) =>
            element.getBoundingClientRect().toJSON()
          ),
        }
      })

      // 红线：文档永不横向滚动（与 task-23-matrix / big-board 同一条契约）
      expect(
        metrics.overflow.scrollWidth,
        `${style.label}：彩蛋两颗钮让页面横向溢出了`
      ).toBeLessThanOrEqual(metrics.overflow.clientWidth)

      expect(metrics.buttons).toHaveLength(2)
      const board = metrics.board
      if (wide) {
        // 宽视口：嵌在包住棋盘的那只壳里，**向两侧探出**棋盘自己的盒子（架构决策 12）
        expect(metrics.containerPosition).toBe('absolute')
        expect(metrics.buttons[0].left).toBeLessThan(board.left)
        expect(metrics.buttons[1].right).toBeGreaterThan(board.right)
      } else {
        // 窄视口：挪到棋盘**下一行**（那边棋盘两侧只剩几个像素，探出去必然顶穿文档）
        for (const button of metrics.buttons) {
          expect(button.top).toBeGreaterThanOrEqual(board.bottom)
        }
      }
    })

    test('二念：第二遍扣下棋盘——只剩重新开始与那条悬顶，而这一局一点没事', async ({ page }) => {
      const problems = watchProblems(page)
      await startRun(page, style.id, style.label, silentUrl())

      // 第一遍：一念。棋盘照旧在，悬顶一根毛都没有（走火入魔那时还没被拿到）
      await typeCode(page)
      await completePass(page)
      await expect(page.locator('[data-board]')).toBeVisible()
      await expect(strip(page)).toHaveCount(0)
      await expect(toastFor(page, '道通成魔')).toHaveCount(1)

      // 扣下之前先记住这一局的两个数：分数（DOM 上读得到）与**起始时刻**（盘上读得到）。
      // 下面用它们证明「这一局还是同一局、一个都没少」——起始时刻尤其关键：换一局、结算
      // 清档、恢复失败，三种情况都会让它变或消失
      const score = await page.locator('[data-score]').textContent()
      const beforeClear = await readBucket(page, 'session')
      const startedAt = (beforeClear as { startedAt?: number | null } | null)?.startedAt ?? null
      // 这个读数必须真的在（T17 起它跟着一局跨刷新）：是 null 的话下面那句「没变」就是空话
      expect(startedAt).not.toBeNull()

      // 第二遍：同一串口诀再打一遍。菜单 / 破碎 / 环逐项相同由单测钉，这里只证结局不同
      await typeCode(page)
      await completePass(page)
      // **T36：扣下之前先走完两拍终局**（血染 → 停一拍 → 淡出）。两拍由合成 animationend
      // 推到底，不等那 1200ms——过程本身由上面那条「二念的终局」逐项量，这里只要它结束
      await fallThrough(page)

      // 走火入魔：照旧走普通 toast 那条通道（用户故事 31：四颗都是同一套祝贺机制）
      await expect(toastFor(page, SECOND_PASS_NAME)).toHaveCount(1)

      // 悬顶在场：emoji + 名字 + 那句诗。它**不是 toast**——既没有 data-toast，
      // 也没有 toast 那一句「解锁成就」的 TAG
      await expect(strip(page)).toHaveCount(1)
      await expect(strip(page)).toContainText(SECOND_PASS_NAME)
      await expect(strip(page)).toContainText(SECOND_PASS_NOTE)
      await expect(strip(page)).not.toContainText('解锁成就')
      await expect(strip(page)).not.toHaveAttribute('data-toast', /.*/)

      // 页面清空到只剩「重新开始」：棋盘、彩蛋那两颗钮、一念的奖品、战绩入口、
      // 新游戏按钮与那行提示，一个节点都不在
      await expect(page.locator('[data-board]')).toHaveCount(0)
      await expect(page.locator('.shenmo')).toHaveCount(0)
      await expect(page.locator('.wish')).toHaveCount(0)
      await expect(page.getByRole('button', { name: '一念神魔' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: '战绩与统计' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: '新游戏' })).toHaveCount(0)
      await expect(page.locator('.hint')).toHaveCount(0)
      await expect(page.getByRole('button', { name: '重新开始' })).toHaveCount(1)

      // 焦点有着落（T34 · 用户故事 39 的另一半）：玩家刚刚点的是**抉择 A**，而那颗钮随
      // 整页一起被摘下。那一刻页面上只剩一颗按钮，焦点该落在它身上——停在 body 上的话，
      // 读屏软件面前就是一页空白，键盘玩家要连着按 Tab 才知道刚才那个钮去了哪。
      // 方向键不会因此失灵（键盘住在 window 上），所以这一条要的不是「还能用」
      await expect(page.getByRole('button', { name: '重新开始' })).toBeFocused()

      // 而这一局**没有被结束**（架构决策 8 / 用户故事 30）：不结算、不写记录、统计桶
      // 一格不动。屏幕上的记分卡已经收起来了，所以这三件事从盘上读。
      // · session 桶里那一局照旧躺着，**起始时刻一个都没变**——换一局 / 结算清档 / 恢复
      //   失败都会让它变或消失，所以它是「还是同一局」最硬的那个读数；
      // · 分数只增不减：扣下之后那八下照样在推棋盘（引擎不知道页面空了，无效方向还不
      //   计入步数，所以不问步数、只问分数没少）；
      // · records 与 stats 两个桶一个字节都没多——结算一次都不曾发生。
      await waitForSessionAtLeast(
        page,
        (session) => (session as { game?: { score?: number } }).game?.score ?? null,
        Number(score)
      )
      const session = await readBucket(page, 'session')
      expect((session as { startedAt?: number | null } | null)?.startedAt ?? null).toBe(startedAt)
      expect((session as { game?: { phase?: string } }).game?.phase).toBe('playing')
      expect(await readBucket(page, 'records')).toBeNull()
      expect(await readBucket(page, 'stats')).toBeNull()

      // 悬顶与 toast 栈共用一个顶端而不重叠：栈的偏移由外壳设置（data-shenmo-pinned），
      // 于是那条祝贺整整齐齐排在悬顶下面
      const offset = await page
        .locator('main')
        .evaluate((element) => getComputedStyle(element).getPropertyValue('--toast-top').trim())
      expect(offset).not.toBe('')
      const geometry = await page.evaluate(() => {
        const top = document.querySelector('.shenmo-strip')?.getBoundingClientRect()
        const toast = document.querySelector('.toast-stack')?.getBoundingClientRect()
        return { stripBottom: top?.bottom ?? null, toastTop: toast?.top ?? null }
      })
      expect(geometry.stripBottom).not.toBeNull()
      expect(geometry.toastTop).not.toBeNull()
      expect(geometry.toastTop as number).toBeGreaterThanOrEqual(geometry.stripBottom as number)

      // 悬顶一个指针都不吃（架构决策 10：它是一条读数，而玩家此刻唯一能做的事是点重新开始）
      const pointerEvents = await strip(page).evaluate(
        (element) => getComputedStyle(element).pointerEvents
      )
      expect(pointerEvents).toBe('none')

      // 读屏软件与键盘那一边：`role="status"`（隐式 polite + atomic）让它出现的那一刻
      // 整条播报一次，之后一直留在无障碍树里可回读；而它**不占一个 Tab 停靠点**——
      // 一颗不能操作的词留在 Tab 顺序里，只是让每次 Tab 都停在一句话上
      await expect(strip(page)).toHaveAttribute('role', 'status')
      await expect(strip(page)).not.toHaveAttribute('tabindex', /.*/)
      for (let step = 0; step < 4; step += 1) {
        await page.keyboard.press('Tab')
        const focused = await page.evaluate(() => document.activeElement?.closest('.shenmo-strip'))
        expect(focused, `第 ${step + 1} 次 Tab 把焦点停在了悬顶上`).toBeNull()
      }

      // 红线照旧：这一页多了一条满宽的悬顶，文档依然永不横向滚动
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
      )
      expect(overflow).toBe(true)

      expect(problems).toEqual([])
    })

    /**
     * 遍数计数器不许跨局泄漏（T32 之后修的回归 · code review 发现 1）。
     *
     * 第 1 局走完一遍拿到一念 → 点新游戏 → 第 2 局再走**第一遍**。若遍数跟着活到了第 2 局
     * （`shenmoCleared` 只清码缓冲与摊，不清 `passes`），那第一遍会被判成二念：当场扣下页面、
     * 钉上悬顶，而第 2 局永远拿不到一念的奖品。store 的 `shenmoOutcomes` 在这同一刻清空，
     * 所以「奖品收回又回来」与「页面没被扣下」是同一件事的两半。
     */
    test('新游戏收回一念：第二局的第一遍仍然是道通成魔，页面不被扣下', async ({ page }) => {
      const problems = watchProblems(page)
      await startRun(page, style.id, style.label, silentUrl())

      // 第一遍：一念到手，奖品按钮出现，悬顶一根毛都没有
      await typeCode(page)
      await completePass(page)
      await expect(toastFor(page, '道通成魔')).toHaveCount(1)
      await expect(page.getByRole('button', { name: '一念神魔' })).toBeVisible()
      await expect(strip(page)).toHaveCount(0)

      // 点「新游戏」：上一局结出的果跟着上一局消失，按钮当场收回
      await page.getByRole('button', { name: '新游戏' }).click()
      await expect(page.getByRole('button', { name: '一念神魔' })).toHaveCount(0)
      await expect(page.locator('[data-board]')).toBeVisible()

      // 第二局的第一遍：授的还是一念，页面没被扣下，按钮回来了。
      // （点新游戏时 toast 栈被清空——`baselineOf` 返回空栈——所以此时只有这一条道通成魔。）
      await typeCode(page)
      await completePass(page)
      await expect(toastFor(page, '道通成魔')).toHaveCount(1)
      await expect(toastFor(page, SECOND_PASS_NAME)).toHaveCount(0)
      await expect(strip(page)).toHaveCount(0)
      await expect(page.locator('[data-board]')).toBeVisible()
      await expect(page.getByRole('button', { name: '一念神魔' })).toBeVisible()

      expect(problems).toEqual([])
    })

    test('刷新即恢复：这一局照旧回来，悬顶与扣下一起没，而且还能再扣一次', async ({ page }) => {
      const problems = watchProblems(page)
      await startRun(page, style.id, style.label, silentUrl())
      await typeCode(page)
      await completePass(page)
      await typeCode(page)
      await completePass(page)
      // 两拍终局播完才扣下（T36：血染 → 停一拍 → 淡出）。合成事件推到底，不等墙钟
      await fallThrough(page)
      await expect(strip(page)).toHaveCount(1)
      await expect(page.getByRole('button', { name: '重新开始' })).toHaveCount(1)

      // 等 session 落盘再刷新（写盘是 fire-and-forget，T29 的 style-traveller 上踩过）
      await waitForSession(
        page,
        (session) => (session as { game?: { phase?: string } }).game?.phase,
        'playing'
      )

      // **必须回到不带参数的地址**：`?seed=` / `?board=` 是显式开局指令，hydrate 据此
      // 拒绝恢复存档（session.ts 的 hasExplicitStart）。带着参数 reload 会看到开局界面，
      // 那不是「这一局没回来」，是「这一次加载要的是指令给的那一局」。T16 / records.spec.ts
      // 为这件事各留过一条注释。
      await page.goto('/')
      // 这一局回来了（T16 的恢复路径），而悬顶与扣下一起没：彩蛋旗标不落盘，这是父规格
      // 架构决策 8 / 10 明写的后果——「这一局没被碰过」与「刷新带得回来」是同一句话的两半
      await expect(page.locator('[data-board]')).toBeVisible()
      await expect(strip(page)).toHaveCount(0)
      await expect(page.getByRole('button', { name: '新游戏' })).toHaveCount(1)

      // 恢复之后彩蛋进度从零起：于是**还能再走一次火入魔、再被扣下一次**
      await typeCode(page)
      await completePass(page)
      await typeCode(page)
      await completePass(page)
      await fallThrough(page)
      await expect(strip(page)).toHaveCount(1)
      await expect(page.locator('[data-board]')).toHaveCount(0)
      await expect(page.getByRole('button', { name: '重新开始' })).toHaveCount(1)

      expect(problems).toEqual([])
    })

    test('假时钟下整套流程照旧走完：两段窗口没有一个 JS 定时器', async ({ page }) => {
      // 装了假时钟之后，任何藏在 JS 里的 setTimeout 都会冻住——而两段 30 秒必须照旧到期
      await page.clock.install()
      await startRun(page, style.id, style.label, silentUrl())
      await typeCode(page)
      await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'choice')

      await page.getByRole('button', { name: '抉择 B' }).click()
      await fireAnimationEnd(page, '[data-shenmo-button="b"]', 'shenmo-break-fade')
      await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'ring')

      // 越过大半段假时间再让窗口到头：JS 时钟是假的，动画不是——菜单照旧收起
      await page.clock.runFor(40000)
      await fireAnimationEnd(page, '.shenmo__ring', 'shenmo-ring')
      await expect(menu(page)).toHaveCount(0)
      await expect(page.locator('[data-toast]')).toContainText('当断即断')
    })
  })
}

/**
 * 三套各给两颗钮自己的底面与描边（用户故事 41：机器答话的语气随风格变）。
 *
 * 放在循环外面：它断的不是同一组不变量，而是「三份实现确实不同」。只断「不是 none」的话，
 * 三份互抄也照样过——所以这里比的是**三个渲染值两两不同**，不写死任何一套的色值
 * （写死就成了第三份真相，风格改色时它会撒谎）。
 */
test('三套风格的两颗圆钮各穿自己的衣服', async ({ page }) => {
  const looks: { label: string; background: string; outline: string }[] = []
  for (const style of STYLE_CATALOG) {
    await startRun(page, style.id, style.label, silentUrl())
    await typeCode(page)
    await expect(menu(page)).toHaveAttribute('data-shenmo-stage', 'choice')
    const look = await page.locator('[data-shenmo-button="a"]').evaluate((element) => {
      const computed = getComputedStyle(element)
      return { background: computed.backgroundColor, outline: computed.outlineColor }
    })
    looks.push({ label: style.label, ...look })
  }
  const backgrounds = looks.map((look) => look.background)
  const outlines = looks.map((look) => look.outline)
  expect(new Set(backgrounds).size, `三套的钮面撞车了：${backgrounds.join(' / ')}`).toBe(3)
  expect(new Set(outlines).size, `三套的钮边撞车了：${outlines.join(' / ')}`).toBe(3)
})
