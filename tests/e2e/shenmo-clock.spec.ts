import { expect, test, type Page } from '@playwright/test'
import { STYLE_CATALOG } from '../../src/shared/styleCatalog'

/**
 * 时之狭：堕落窗口开着的时候时钟被按住，收摊时那一段时间归玩家
 * （T33 · 父Spec 的架构决策 16，控制人 2026-10-01 裁定）
 *
 * **这是整组彩蛋唯一在玩法上值点钱的一处**，所以它值得单独一个文件：它要的是装假时钟的
 * 限时局 + 一副八下全部无效的盘，与 `shenmo.spec.ts`（经典局、真实时钟）不是同一条路。
 *
 * 时钟用 `page.clock`（repo 在 T08 的 daily.spec.ts 第一次用，T09 的 time-attack.spec.ts
 * 用得最全）：装表之后 `pauseAt` 停住，时间只由本文件用 runFor 推进。于是「表冻住了」
 * 是一个**读到的事实**（读数没变），不是等了一段时间之后的推测——三分钟等不起，而一级
 * 一格地掉也演不出来。
 *
 * **裁定是什么、为什么**（写在明处，免得后来者按另一句改）：
 *   控制人 2026-10-01 裁定「那 30 秒真归玩家」。理由是「只冻显示」会让屏幕替证据撒谎：
 *   玩家站在抉择前 30 秒、屏幕冻结在还剩 0:20，点下 A 的当场就可能超时结算——那一行
 *   读数刚刚说了谎，而这个项目最反对的正是这件事（结果层那一整套论证就是为它写的）。
 *   所以这里断三件事：(a) 窗口开着时读数一格不掉、一帧面板都不出，**哪怕墙上时钟已经
 *   越过截止点**；(b) 收摊那一刻把按住的那段整段还回来，读数接回表停着时候的那个数；
 *   (c) deadline 与 engine 一个字节都没碰——被按住的只有喂给时钟的 now。
 *   规格的「与既有 SPEC 的对齐」段已据实改写（gives the held time back），并记明
 *   「只冻显示」被考虑过并否决。刷新不还（不落盘）：否则「站着抉择等刷新」就是一条
 *   免费延时的缝（SPEC §3.1）。
 */

/** 开局时刻：倒计时的 3:00 就读这一刻（与 time-attack.spec.ts 同一个瞬间） */
const START = new Date('2026-09-26T12:00:00Z')
const SEED = 20260926

/**
 * **满盘十六档**：四行四列全满、十六个值两两不相等（2…65536 全是不同的 2 的幂）。
 *
 * 于是 ↑ ↓ ← → 一个方向都推不动——神魔码那八下全是无效移动，而无效移动照旧计数
 * （父Spec 用户故事 2），棋盘因此一个格子都不动。这副盘同时被
 * `tests/e2e/shenmo.spec.ts` 的堕落染墨与 `contrast-computed.spec.ts` 的 `egg` 场景用着。
 */
const BLIND_ROWS: (number | null)[][] = [
  [2, 4, 8, 16],
  [32, 64, 128, 256],
  [512, 1024, 2048, 4096],
  [8192, 16384, 32768, 65536],
]

/** 神魔码的八下（方向键版） */
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

function boardQuery(rows: (number | null)[][]): string {
  return rows.flat().map((value) => value ?? '').join(',')
}

function blindUrl(): string {
  return `/?seed=${SEED}&board=${boardQuery(BLIND_ROWS)}`
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

/** 选「限时」并开局（假时钟装好、停住之后）。风格由调用方给——不依赖 settings 桶的默认值 */
async function openTimeAttack(page: Page, label: string): Promise<void> {
  await page.clock.install({ time: START })
  await page.clock.pauseAt(START)
  await page.goto(blindUrl())
  await page.getByRole('button', { name: '限时' }).click()
  await page.getByRole('group', { name: '风格' }).getByRole('button', { name: label }).click()
  await page.getByRole('button', { name: '开始游戏' }).click()
  await expect(page.locator('[data-board]')).toBeVisible()
}

/** 打一遍口令（八下全是无效移动） */
async function typeCode(page: Page): Promise<void> {
  await page.locator('[data-board]').focus()
  for (const key of CODE_KEYS) await page.keyboard.press(key)
}

/** 点 B，然后派一条合成的 `animationend` 让破碎退场收尾 → 只剩 A（堕落窗口开着） */
async function fallToRing(page: Page): Promise<void> {
  await page.getByRole('button', { name: '抉择 B' }).click()
  await page.evaluate(() => {
    document
      .querySelector('[data-shenmo-button="b"]')
      ?.dispatchEvent(new AnimationEvent('animationend', { bubbles: true, animationName: 'shenmo-break-fade' }))
  })
  await expect(page.locator('.shenmo')).toHaveAttribute('data-shenmo-stage', 'ring')
}

/** 悬顶：`.shenmo-strip`。它**不是 toast**——连 `data-toast` 都不带（shenmo.spec.ts 同款） */
const strip = (page: Page) => page.locator('.shenmo-strip')

/**
 * 三套风格各跑一遍，两个视口各跑一遍（T34 收口：父规格的 Test strategy 要的是「一条共享
 * 契约 × 每套风格 × 每个视口」，而彩蛋是三份 spec 分担的，所以每一份都自己跑满矩阵）。
 *
 * 时之狭本身是 store 的一条协调规则，与风格无关——但**彩蛋不是**：一颗把两颗钮藏起来的
 * 风格会让这条用例从头就走不下去。跑满三套正是为了「风格漂移」这件事有人管，哪怕这里断
 * 的是时间。
 */
for (const style of STYLE_CATALOG) {
  test.describe(`${style.label} · 时之狭`, () => {
    test('堕落窗口开着时时钟被按住，收摊把那 200 秒整段还给玩家', async ({ page }) => {
      const problems = watchProblems(page)
      await openTimeAttack(page, style.label)
      const countdown = page.locator('[data-countdown]')
      await expect(countdown).toHaveText('3:00')

      await typeCode(page)
      await expect(page.locator('.shenmo')).toHaveAttribute('data-shenmo-stage', 'choice')

      // 摊刚开（A 与 B 都在，还没人选）时表照旧走：时之狭只管**堕落窗口**——点过 B、
      // 只剩 A 的那 30 秒（父Spec 架构决策 16 的「魔道」）。在摊前犹豫的代价照旧是代价
      await page.clock.runFor(20_000)
      await expect(countdown).toHaveText('2:40')

      await fallToRing(page)

      // 窗口开着：推进 200 秒——**墙上时钟越过截止点整整 40 秒**（deadline 在 3:00 处）。
      // 读数一格都不掉，一帧面板都不出：被按住的是时钟，棋盘里那个截止点自始至终没动
      await page.clock.runFor(200_000)
      await expect(countdown).toHaveText('2:40')
      await expect(page.locator('[data-panel]')).toHaveCount(0)
      await expect(page.locator('[data-tile-id]')).toHaveCount(16)
      await expect(page.locator('[data-score]')).toHaveText('0')

      // 抉择收摊：点 A 走完这一遍。锁一解开，读表周期当场重跑（Countdown 的依赖表里带着
      // clockHeld），于是恢复是**立刻**的——不必再等一个 250ms 的读表间隔。
      // 而接上的那个数是 **2:40**：按住的那 200 秒整段还给了玩家。控制人裁定的就是这一行——
      // 「只冻显示」的旧实现会在这一刻显示 0:00 并当场超时结算，读数刚说完就翻了脸
      await page.getByRole('button', { name: '抉择 A' }).click()
      await expect(page.locator('.shenmo')).toHaveCount(0)
      await expect(countdown).toHaveText('2:40')

      // 恢复之后照旧一级一级地掉。此刻墙上时钟已经走了 220 秒，而 effective clock 只走了
      // 20 秒——再走满 160 秒才到点：总墙上用时 380 秒，正好比截止点晚了一个被按住的 200 秒
      await page.clock.runFor(159_000)
      await expect(countdown).toHaveText('0:01')
      await page.clock.runFor(1_000)
      await expect(page.locator('[data-countdown]')).toHaveCount(0)
      await expect(page.locator('[data-panel="gameover"]')).toHaveAttribute('data-end-reason', 'timeout')

      expect(problems).toEqual([])
    })

    /**
     * 终局那 1200ms 里时钟**也**停住（T36 · 控制人 2026-10-01 裁定）。
     *
     * 业主的原话是「先染出血色，然后淡出关闭棋盘页面」——而那两拍（血染 600ms → 停一拍
     * 200ms → 淡出 400ms）播的时候，玩家正在看一出戏。这一条断的就是「看戏的时候不许被一声
     * 超时打断」：墙上时钟越过截止点整整 70 秒，读数一格都不掉、一帧面板都不出。
     *
     * 与上面那一条的分工：上面那条按住的是**堕落窗口**（点过 B 之后那 30 秒，控制人裁过的
     * 「免费犹豫变成买来的时间」），这一条按住的是**二念的终局**——`clockHeld` 是两者的和
     * （App 里 `demonOpen || falling`）。两件事共用一个开关，而各自的裁令不同，所以要分开钉。
     *
     * 终局靠合成 `animationend` 推到底（不等那 1200ms）：派发走 `page.evaluate`，读回走
     * Playwright 的轮询，一个墙钟都不掺。页面扣下之后倒计时跟着卸载，被按住的那一段就此
     * 不了了之——这一局不会再走下去，而刷新也不继承它（hydrate 把两个字段归零）。
     */
    test('终局那两拍里时钟也停住：越过截止点 70 秒，读数一格都不掉', async ({ page }) => {
      const problems = watchProblems(page)
      await openTimeAttack(page, style.label)
      const countdown = page.locator('[data-countdown]')
      await expect(countdown).toHaveText('3:00')

      // 第一遍：一念。点 B 之前先走 20 秒（堕落窗口还没开，表照旧走）→ 2:40
      await typeCode(page)
      await expect(page.locator('.shenmo')).toHaveAttribute('data-shenmo-stage', 'choice')
      await page.clock.runFor(20_000)
      await expect(countdown).toHaveText('2:40')
      await fallToRing(page)
      await page.getByRole('button', { name: '抉择 A' }).click()
      await expect(page.locator('.shenmo')).toHaveCount(0)

      // 第二遍：再走 30 秒（表照旧走），然后点 B 走进堕落窗口——表从这一刻停住。
      // 不停在具体哪一个读数上：终局的主张是「读数一格都不掉」，所以先把停住那一刻的那一行
      // 记下来，往后与它比（250ms 的读表周期 + 向上取整会让「几秒」这种绝对数差一秒）
      await typeCode(page)
      await expect(page.locator('.shenmo')).toHaveAttribute('data-shenmo-stage', 'choice')
      await page.clock.runFor(30_000)
      await fallToRing(page)
      const parked = (await countdown.textContent()) ?? ''
      expect(parked).not.toBe('0:00')

      // 点下第二遍的 A：二念结出果，两拍终局起跑。**点击与停住在同一次 evaluate 里**：
      // 终局有 1200ms，而「时钟被按住」这件事要读到——分成两步的话几个协议往返一慢，两拍自己
      // 播完、页面扣下、倒计时跟着卸载。store 那一提交带来的动画是新对象，所以等终局真的落
      // 在 DOM 上之后再停一遍（等它用 Playwright 自己的轮询，假时钟碰不到它）
      await page.evaluate(() => {
        document.querySelector<HTMLElement>('[data-shenmo-button="a"]')?.click()
        for (const animation of document.getAnimations()) animation.pause()
      })
      await expect(page.locator('[data-shenmo-fall]')).toHaveAttribute('data-shenmo-fall', 'dye')
      await page.evaluate(() => {
        for (const animation of document.getAnimations()) animation.pause()
      })

      // 越过截止点整整 70 秒（deadline 在 3:00 处）：读数停在原处，一帧面板都不出
      await page.clock.runFor(200_000)
      await expect(countdown).toHaveText(parked)
      await expect(page.locator('[data-panel]')).toHaveCount(0)
      await expect(page.locator('[data-tile-id]')).toHaveCount(16)

      // 两拍推到底 → 页面扣下，倒计时跟着卸载（它是那一列的一部分）
      await page.evaluate(() => {
        document
          .querySelector('[data-shenmo-fall]')
          ?.dispatchEvent(new AnimationEvent('animationend', { bubbles: true, animationName: 'shenmo-fall-dye' }))
      })
      await expect(page.locator('[data-shenmo-fall]')).toHaveAttribute('data-shenmo-fall', 'out')
      await page.evaluate(() => {
        document
          .querySelector('[data-shenmo-fall]')
          ?.dispatchEvent(new AnimationEvent('animationend', { bubbles: true, animationName: 'shenmo-fall-out' }))
      })
      await expect(page.locator('[data-countdown]')).toHaveCount(0)
      await expect(page.getByRole('button', { name: '重新开始' })).toHaveCount(1)
      await expect(strip(page)).toHaveCount(1)

      expect(problems).toEqual([])
    })

    test('只在那儿：不限时的模式里，彩蛋关于时间什么都不会变', async ({ page }) => {
      const problems = watchProblems(page)
      // **经典模式**（不是 Classic 那套风格）：`限时` 那一格不点。风格照样显式选，
      // 与 openTimeAttack 同一条——不依赖 settings 桶的默认值
      await page.clock.install({ time: START })
      await page.clock.pauseAt(START)
      await page.goto(blindUrl())
      await page.getByRole('group', { name: '风格' }).getByRole('button', { name: style.label }).click()
      await page.getByRole('button', { name: '开始游戏' }).click()
      await expect(page.locator('[data-board]')).toBeVisible()
      // 一开始就没有倒计时这一块（deadline 为 null 的模式的既有形状）
      await expect(page.locator('[data-countdown]')).toHaveCount(0)

      await typeCode(page)
      await fallToRing(page)
      // 堕落窗口开着，而这块表仍然不存在：没有「暂停一个不存在的倒计时」这种事
      await expect(page.locator('[data-countdown]')).toHaveCount(0)
      await expect(page.locator('[data-panel]')).toHaveCount(0)
      await expect(page.locator('[data-tile-id]')).toHaveCount(16)

      // 走完这一遍，棋盘与分数照旧（八下无效移动，一次都没推过）
      await page.getByRole('button', { name: '抉择 A' }).click()
      await expect(page.locator('.shenmo')).toHaveCount(0)
      await expect(page.locator('[data-score]')).toHaveText('0')

      expect(problems).toEqual([])
    })
  })
}
