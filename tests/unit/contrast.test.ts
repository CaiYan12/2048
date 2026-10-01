import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import {
  auditPair,
  BASIS_MINIMUM,
  contrastRatio,
  effectiveForeground,
  RATIO_TOLERANCE,
  SCENES,
  type ContrastPair,
} from '../../scripts/check-contrast.mjs'
import classic from '../../src/renderer/styles/themes/classic/contrast.json'
import claude from '../../src/renderer/styles/themes/claude/contrast.json'
import material from '../../src/renderer/styles/themes/material/contrast.json'

/**
 * 对比度声明自校验：每一套风格的 contrast.json 里，每一对都要
 *   1) 实测比值 ≥ 声明的 minimum；
 *   2) 声明的 ratio 与这里按 WCAG 2.x 复算的一致（±0.02，容两位小数的四舍五入）；
 *   3) basis 与 minimum 自洽（T14 新增的字段：口径写进表里，「哪一对靠大字豁免」
 *      才可审计，而不是靠记忆） ；
 *   4) scene 与 probe 齐备且合法（浏览器那一层 tests/e2e/contrast-computed.spec.ts
 *      按它分工况、按它读计算样式）。
 *
 * 为什么值得在单测里做一遍：T14 的 check-contrast 会从同一份 JSON 与 tokens.css
 * 重新取色再算，而这张表是人写的。若某个色值改了、表没跟上，这里先炸——比等到
 * 闸门才发现得早，也比「表上写着 8.88 但实际 7.22」这种漂移更难查。
 *
 * 公式与 auditPair 都从 scripts/check-contrast.mjs import：闸门与它的测试共用
 * 一份实现，免得两边各抄一份然后悄悄漂开。下面每个用例都不依赖 auditPair 自己
 * 的判断——它们把判据（门槛、容差、字段齐备）重新写一遍，等于第二份实现。
 */

interface StylePairs {
  id: string
  pairs: readonly ContrastPair[]
}

const tokensCss = (styleId: string): string =>
  readFileSync(
    new URL(`../../src/renderer/styles/themes/${styleId}/tokens.css`, import.meta.url),
    'utf8'
  )

const STYLES: readonly StylePairs[] = [
  { id: classic.styleId, pairs: classic.pairs },
  { id: material.styleId, pairs: material.pairs },
  { id: claude.styleId, pairs: claude.pairs },
]

/** 所有对，带上它属于哪一套风格（问题信息里要能说出是哪一套） */
const ALL_PAIRS: ReadonlyArray<{ styleId: string; pair: ContrastPair }> = STYLES.flatMap(
  (style) => style.pairs.map((pair) => ({ styleId: style.id, pair }))
)

/** 按 usage 找一对（找不到就让用例失败，而不是安静地跳过） */
function findPair(styleId: string, keyword: string): ContrastPair {
  const style = STYLES.find((item) => item.id === styleId)
  if (style === undefined) throw new Error(`没有 ${styleId} 这套风格`)
  const pair = style.pairs.find((item) => item.usage.includes(keyword))
  if (pair === undefined) throw new Error(`${styleId} 的表里没有「${keyword}」这一对`)
  return pair
}

/** '#rrggbb' → [r, g, b]。用来看一个色值有多「彩」——通道差越大越饱和 */
function channels(hex: string): [number, number, number] {
  const digits = hex.replace('#', '')
  return [
    parseInt(digits.slice(0, 2), 16),
    parseInt(digits.slice(2, 4), 16),
    parseInt(digits.slice(4, 6), 16),
  ]
}

describe('contrast.json：声明与实测一致', () => {
  for (const style of STYLES) {
    test(`${style.id}：每一对都达到声明的 minimum，且 ratio 与复算一致`, () => {
      expect(style.pairs.length).toBeGreaterThan(0)
      for (const pair of style.pairs) {
        const measured = contrastRatio(effectiveForeground(pair), pair.background)
        expect(measured, `${style.id} · ${pair.usage}`).toBeGreaterThanOrEqual(pair.minimum)
        // 表上的数是四舍五入到两位小数的实测值，不是拍出来的目标值
        expect(
          Math.abs(measured - pair.ratio),
          `${style.id} · ${pair.usage}`
        ).toBeLessThanOrEqual(RATIO_TOLERANCE)
      }
    })

    test(`${style.id}：闸门的逐项校验一把过`, () => {
      // auditPair 是 check-contrast 的判定本体。这里对每一对都要它一声不出——
      // 它一响，就是这一对真的有问题
      for (const pair of style.pairs) {
        expect(auditPair(tokensCss(style.id), pair), `${style.id} · ${pair.usage}`).toEqual([])
      }
    })
  }
})

describe('T14 新增的两个字段：口径与场景是可审计的，不是注释', () => {
  test('每一对都声明 basis，且与 minimum 自洽', () => {
    for (const { styleId, pair } of ALL_PAIRS) {
      expect(Object.keys(BASIS_MINIMUM), `${styleId} · ${pair.usage}`).toContain(pair.basis)
      // 口径与门槛必须一致：否则「按大字 3:1 走」这句话可以随便写
      expect(pair.minimum, `${styleId} · ${pair.usage}`).toBe(BASIS_MINIMUM[pair.basis])
    }
  })

  test('每一对都声明 scene，且是 e2e 分工况认得的三个之一', () => {
    for (const { styleId, pair } of ALL_PAIRS) {
      expect(SCENES, `${styleId} · ${pair.usage}`).toContain(pair.scene)
    }
  })

  test('每一对都带 probe，形状合法（浏览器那一层按它读计算样式）', () => {
    for (const { styleId, pair } of ALL_PAIRS) {
      expect(pair.probe, `${styleId} · ${pair.usage}`).toBeDefined()
      const probe = pair.probe
      if (probe === undefined) throw new Error('probe 必填')
      expect(probe.selector, `${styleId} · ${pair.usage}`).not.toBe('')
      // 环压在别的底色上、小标签压在面板上：这两种背景不在元素自己身上
      if (probe.background !== undefined) {
        expect(probe.background, `${styleId} · ${pair.usage}`).not.toBe('')
      }
      if (probe.read !== undefined) {
        expect(['color', 'background', 'ring'], `${styleId} · ${pair.usage}`).toContain(probe.read)
      }
    }
  })

  test('Classic 唯一依赖大字口径的是 8 号，其余每一档都按普通文字 4.5:1 走', () => {
    // 设计卡 §9 的口径：字号随位数变化，但唯一豁免的是「永远一位数、字号最大」的 8 号
    const large = ALL_PAIRS.filter(({ pair }) => pair.basis === 'large')
    expect(large).toHaveLength(1)
    expect(large[0].styleId).toBe('classic')
    expect(large[0].pair.background).toBe('#c2622c')
  })

  test('Classic 与 Claude 没有一档依赖大字口径：阶梯度量与字号分档完全解耦', () => {
    const materialLarge = material.pairs.filter((pair) => pair.basis === 'large')
    expect(materialLarge).toHaveLength(0)
    // 12 个色档 + 12 个堕落档（T33）全部按普通文字量（设计卡 §9：连一位数的第一档也是
    // 8.71:1）。堕落那一组探针同样是 `.board__tile[data-bucket='N']`，所以这个筛子
    // 把它们一起收进来——那不是意外：堕落档本来就该按同一副口径量
    const buckets = material.pairs.filter((pair) =>
      pair.probe?.selector.includes("data-bucket='")
    )
    expect(buckets).toHaveLength(24)
    for (const pair of buckets) {
      expect(pair.minimum, pair.usage).toBe(4.5)
    }
  })

  test('Claude 也没有一档依赖大字口径，且深浅字断在第 6 / 7 档之间', () => {
    // 设计卡 §9 的承诺：字号随位数变化，但本套没有任何一对需要 3:1 豁免
    // （12 个色档 + 12 个堕落档，T33）
    const claudeBuckets = claude.pairs.filter((pair) =>
      pair.probe?.selector.includes("data-bucket='")
    )
    expect(claudeBuckets).toHaveLength(24)
    for (const pair of claudeBuckets) {
      expect(pair.basis, pair.usage).toBe('regular')
      expect(pair.minimum, pair.usage).toBe(4.5)
    }
    // 前 6 档深字、后 6 档亮字（含 beyond）。死区在相对亮度 0.174～0.254 之间，
    // 断在第 6 / 7 档，所以这一行是「两个方向真的各占一半」的证据。
    // **两组分开看**（堕落档是表里第二批 12 对）：染墨染的是明度，深浅字的分界在堕落态
    // 一动不动——所以每一组内部都仍是前 6 后 6。混在一起切就分不出「断口挪没挪」
    const byScene = (scene: string): string[] =>
      claudeBuckets.filter((pair) => pair.scene === scene).map((pair) => pair.foreground)
    for (const scene of ['run', 'egg']) {
      const inks = byScene(scene)
      expect(inks, scene).toHaveLength(12)
      expect(inks.slice(0, 6).every((ink) => ink === '#26241f'), scene).toBe(true)
      expect(inks.slice(6).every((ink) => ink === '#fbf9f4'), scene).toBe(true)
    }
  })

  test('Claude 的暖色只出现在三个用法上，其余方块底色是低彩度的暖灰', () => {
    // 设计卡 §2：单一暖色强调色 = 选中控件、焦点环、目标档方块。出现第四处暖色填充，
    // 「稀缺」就没了，而这是这套风格最大的可辨识特征
    const WARM = '#a8482b'
    const warm = claude.pairs.filter(
      (pair) => pair.background === WARM || pair.foreground === WARM
    )
    // 选中控件（底）、焦点环 vs 纸面、选中环 vs 空格、第 11 档方块（底）= 四处，
    // 其中两个环是同一块色值的两种用法，正好对上「三个用法」。
    // T29 的彩蛋两颗圆钮是**第五处**、T30 的一念按钮是**第六处**，但两者都落在既有的
    // 「此刻有焦点」那一个用法上——用的都是 `--focus`，没有引入第二块暖色。所以仍是
    // 3 个用法、6 对色值。加一对色值不改变判据；多一个**用法**才会。
    // **堕落染墨把它降到 5 对**：egg 场景那一对在堕落态里用的是 `--focus` 的暗档值
    // （T33 是 OKLCH −0.05 的 #97391b，**T35 血色染墨后是同色相再压两档的 #650100**），
    // 不再是这块陶土色本体。那是**同一块色暗一档**，不是引入第二种暖色——真正多的是一块
    // 「衍生色值」，用法一个没多。盘面染成血色之后空格亮了一截，T33 那个值只剩 2.22:1，
    // 所以焦点环跟着再压（tests/unit/contrast.test.ts 另有一条按令牌关系钉着这一对）。
    expect(warm).toHaveLength(5)

    // 11 个色档 + beyond + 11 个堕落档 + 堕落 beyond（T33）：**未堕落**那 12 档里，除第 11 档
    // 这块陶土本体外全部是低彩度暖灰——r ≥ g ≥ b 且通道差 ≤ 50。「暖色层级不靠饱和色」由此
    // 变成机器可验的一句话（暖色本体的通道差是 125）。
    // 所以这里不断「底色 === 暖色本体」那一条，而是断「大通道差的底色」——多出来的任何一个
    // 都是新的一处饱和填充。
    // **T35 血色染墨把它从 2 改成 13**：堕落态 12 档整条染成血红（OKLCH 色相 27、彩度
    // 0.19 一档），通道差全在 50 以上（连最浅那档 #ffc8c1 也有 62），于是「低彩度」这条
    // 判据**只对未堕落阶梯成立**——堕落阶梯全体高彩度正是业主要的「饱和度显著提高」。
    // 13 = 未堕落的本体 1 + 堕落阶梯 12。断言拆成两半写，是为了让「哪一半变了」说得出来：
    const buckets = claude.pairs.filter((pair) =>
      pair.probe?.selector.includes("data-bucket='")
    )
    expect(buckets).toHaveLength(24)
    const highChroma = buckets.filter((pair) => {
      const [r, , b] = channels(pair.background)
      return r - b > 50
    })
    // 未堕落那一半仍然只有一块暖色本体：稀缺性这条主张在非堕落态上一个洞都没开
    expect(highChroma.filter((pair) => pair.scene === 'run')).toHaveLength(1)
    expect(highChroma.map((pair) => pair.background)).toContain(WARM)
    // 堕落那一半整条是血：12 档一个不落，这正是「全家都染、不留亮斑」
    expect(highChroma.filter((pair) => pair.scene === 'egg')).toHaveLength(12)
    for (const pair of buckets) {
      const [r, g, b] = channels(pair.background)
      // 两半共同的一条：红必须是主通道。这是「暖」的底线，堕落阶梯也守得住——
      // 它现在红得更厉害（r 是最暗那档的 8 倍以上）
      expect(r, pair.usage).toBeGreaterThanOrEqual(g)
      expect(r, pair.usage).toBeGreaterThanOrEqual(b)
      if (pair.scene === 'run') {
        // 「低彩度暖灰」这条主张**只属于未堕落阶梯**，一个字都没动：r ≥ g ≥ b 且通道差 ≤ 50
        expect(g, pair.usage).toBeGreaterThanOrEqual(b)
        // 第 11 档那块陶土本体是本阶梯唯一的高彩度档（通道差 125），它自己免这条
        if (!highChroma.includes(pair)) {
          expect(r - b, `${pair.usage} 通道差`).toBeLessThanOrEqual(50)
        }
      }
      // 堕落那一半不再断 g ≥ b：OKLCH h 27 的深红映射进 sRGB 时，绿与蓝都被压到 20/255 以内，
      // 而蓝会偶尔高过绿（#ae0813 = 174,8,19）。那不是「偏蓝」——红通道是另一者的 9 倍；
      // 要保住 g ≥ b 只能把色相推到 30° 以上，那已经开始偏橙，而 27 才是血浆那一段的正中。
      // 于是这一半的主张换成上面那条「红是主通道」+ 12 档全高彩度，两句都更贴近事实
    }

    // 墙是唯一的冷色表面（b > r）：刻意落在暖色阶梯之外（同 Classic / Material 的判据）。
    // 这一对里墙是**前景**、可玩空格是背景（board.css 读的是 [data-cell='wall'] 的底色）
    const wall = claude.pairs.find((pair) => pair.foreground === '#3b4750')
    expect(wall, '障碍那一对得在表里').toBeDefined()
    const [wr, , wb] = channels(wall?.foreground ?? '#000000')
    expect(wb).toBeGreaterThan(wr)
  })
})

describe('T14 交接的三笔账，两套风格都齐了', () => {
  test('Classic 补上「选中环 vs 空格底」——T12 量出、此前不在表内', () => {
    // 交接条目 1：带 spread 的 box-shadow 画在 border box 外侧，环落在 --cell-bg 上，
    // 而 Classic 的表此前只有焦点环 vs 页面色
    const ring = findPair('classic', '选中方块')
    expect(ring.foreground).toBe('#4a443f')
    expect(ring.background).toBe('#cdc1b4')
    expect(ring.basis).toBe('non-text')
    expect(ring.minimum).toBe(3)
    expect(ring.ratio).toBeCloseTo(5.43, 2)
    expect(ring.probe?.read).toBe('ring')
  })

  test('Classic 的两处 .panel__label 都量过：面板底与纸面是两对不同的值', () => {
    // 交接条目 2：同一个类在两种底色上。**T15 起两对都是显式声明的色值**——opacity 会让
    // getComputedStyle().color 读到合成前的本色，闸门只能从 style.opacity 回头补算，
    // 那是绕开而不是修好。两个新色值正是当年合成出来的那两个颜色，所以比值一个都没漂
    const onPanel = findPair('classic', '面板上的小标签')
    expect(onPanel.from, 'T15 之后这一对不再走半透明合成').toBeUndefined()
    expect(onPanel.foreground).toBe('#e4e0da')
    expect(onPanel.background).toBe('#6f6055')
    expect(onPanel.ratio).toBeCloseTo(4.59, 2)
    expect(onPanel.probe?.selector).toBe('.panel__label')
    expect(onPanel.probe?.background).toBe('.panel')

    const onPage = findPair('classic', '开局界面的分组小标签')
    expect(onPage.from).toBeUndefined()
    expect(onPage.foreground).toBe('#766e66')
    expect(onPage.background).toBe('#faf8ef')
    expect(onPage.ratio).toBeCloseTo(4.71, 2)
    expect(onPage.probe?.background).toBe('.shell')

    // 两个色值在 tokens.css 里都真的声明了：漏一个，.panel__label 会安静地退回继承色
    const tokens = tokensCss('classic')
    expect(tokens).toContain('--ink-variant: #766e66')
    expect(tokens).toContain('--ink-bright-variant: #e4e0da')
    // 而 styles.css 里那个 .panel__label 不再带 opacity 声明（注释里提到这个词不算）。
    // **这一条只管 .panel__label 那几条规则**：`opacity` 本身不是禁物——成就祝贺的进 / 出场
    // 就是整条卡片的淡入淡出（设计卡 §10），那是动效，不是「把一个色值压暗」。
    // 原来这里断的是「整份 styles.css 里一处 opacity 都没有」，那只是当年的巧合。
    const styles = readFileSync(
      new URL('../../src/renderer/styles/themes/classic/styles.css', import.meta.url),
      'utf8'
    )
    const panelLabelRules = styles
      .split('}')
      .filter((block) => block.includes('.panel__label') && block.includes('{'))
    expect(panelLabelRules.length, '两张 .panel__label 规则都该在').toBeGreaterThan(0)
    for (const rule of panelLabelRules) {
      expect(rule, '.panel__label 不该再用 opacity 压明度').not.toMatch(/^\s*opacity\s*:/m)
    }
  })

  test('T15 之后三套风格的表里一对都不走半透明合成', () => {
    // 这正是派发令要的收口：opacity 那套绕开计算样式的做法不该比第三套风格活得更久
    for (const style of STYLES) {
      for (const pair of style.pairs) {
        expect(pair.from, `${style.id} · ${pair.usage}`).toBeUndefined()
      }
    }
  })

  test('Material 的同一对（选中环 vs 空格底）也仍在表内', () => {
    const ring = findPair('material', '选中方块')
    expect(ring.foreground).toBe('#625b71')
    expect(ring.background).toBe('#e6e0e9')
    expect(ring.ratio).toBeCloseTo(4.98, 2)
  })
})

describe('闸门真的会咬人（auditPair 对坏数据必须出声）', () => {
  const tokens = (): string => tokensCss('classic')

  test('改一个声明的 ratio 就报', () => {
    // 这就是派发令要求的破坏原型：表上写 5.72、实测 5.7196，把声明改成 5.5 必须炸
    const pair = findPair('classic', '方块 2')
    const perturbed: ContrastPair = { ...pair, ratio: 5.5 }
    const problems = auditPair(tokens(), perturbed)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('声明 ratio 5.5')
    expect(problems[0]).toContain('5.7196')
  })

  test('把门槛抬到实测之上就报（低于口径）', () => {
    const pair = findPair('classic', '方块 8')
    const perturbed: ContrastPair = { ...pair, minimum: 4.5 }
    const problems = auditPair(tokens(), perturbed)
    expect(problems.some((problem) => problem.includes('低于口径'))).toBe(true)
  })

  test('口径与门槛不一致就报', () => {
    // 「按大字 3:1 走」不能只是一句注释：basis 改 regular 而 minimum 还写 3，必须炸
    const pair = findPair('classic', '方块 8')
    const perturbed: ContrastPair = { ...pair, basis: 'regular' }
    const problems = auditPair(tokens(), perturbed)
    expect(problems.some((problem) => problem.includes('门槛是 4.5'))).toBe(true)
  })

  test('引用 tokens.css 没声明的色值就报', () => {
    const pair = findPair('classic', '方块 2')
    const perturbed: ContrastPair = { ...pair, background: '#123456' }
    const problems = auditPair(tokens(), perturbed)
    expect(problems.some((problem) => problem.includes('没有声明'))).toBe(true)
  })

  test('半透明合成色与 from 复算不一致就报', () => {
    // T15 之后三套风格的表里一对都没有 from（Classic 那两处已换成显式声明的色值），
    // 于是这条改成拿一对**合成出来的假数据**喂闸门：验的是闸门还会咬人，
    // 不是某套风格的数据。合成关系取自 T14 的 Classic——--ink-bright #f9f6f2 以 .85
    // 压在 --control-bg #6f6055 上正是 #e4e0da（4.59:1），那对真实数据现在长在上面一条里
    const honest: ContrastPair = {
      usage: '合成对（闸门自己的测试数据，不属于任何一套风格）',
      basis: 'regular',
      foreground: '#e4e0da',
      from: { base: '#f9f6f2', opacity: 0.85 },
      background: '#6f6055',
      minimum: 4.5,
      ratio: 4.59,
      scene: 'run',
      probe: { selector: '.panel__label', background: '.panel' },
    }
    expect(auditPair(tokens(), honest)).toEqual([])
    const perturbed: ContrastPair = { ...honest, foreground: '#ffffff' }
    const problems = auditPair(tokens(), perturbed)
    expect(problems.some((problem) => problem.includes('不一致'))).toBe(true)
  })

  test('缺 probe 就报（浏览器那一层会因此安静地少验一对）', () => {
    const pair = findPair('classic', '方块 2')
    const { probe, ...withoutProbe } = pair
    const problems = auditPair(tokens(), withoutProbe as ContrastPair)
    expect(problems.some((problem) => problem.includes('probe.selector'))).toBe(true)
  })
})

/**
 * 堕落染墨里的焦点环（T33 之后补的窟窿）。
 *
 * board.css 里「选中方块那一圈描边」用 `--focus` 画在方块**外侧**、落在 `--cell-bg` 上，
 * 所以这一对真正的关系是「焦点环 vs 空格底」。染墨把空格暗掉一成七，同一块色值就可能
 * 掉到非文字 3:1 以下——Claude 实测从 3.34 掉到 2.82。修法是暗档块里把 `--focus` 也走
 * 同一步，所以这一对必须由令牌关系钉住：谁把暗档里的 `--focus` 删掉，这里就红。
 *
 * **为什么用单测而不是探针**：量它的那一幕需要「盘上同时有十二档色阶、堕落态开着、
 * 还有一个空格」，而「满盘且相邻不相等」正是为了让八下口令搅不动棋盘才那么铺的——
 * 给探针腾一个空格就会让口令落子、可能把空格填回去。令牌关系是不依赖盘子的一张脸。
 */
describe('堕落染墨：焦点环仍然压在空格上看得出', () => {
  const hex = /--focus:\s*(#[0-9a-fA-F]{6})/
  const cell = /--cell-bg:\s*(#[0-9a-fA-F]{6})/

  const luminance = (value: string): number => {
    const channels = [1, 3, 5].map((index) => Number.parseInt(value.slice(index, index + 2), 16) / 255)
    const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }

  const contrast = (a: string, b: string): number => {
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x)
    return (high + 0.05) / (low + 0.05)
  }

  for (const id of ['classic', 'material', 'claude']) {
    test(`${id}：暗档的 --focus 对暗档的 --cell-bg 仍过非文字 3:1，且确实暗了一档`, () => {
      const css = tokensCss(id)
      // 按选择器整块抓，不按 split 后 find：split 出来的第一块是「基座块 + 暗档块前面那段
      // 注释」，用 find 找 data-shenmo-dim 会命中它，于是读到的是基座的 --focus——自己骗自己
      const dimBlock = css.match(
        new RegExp(`\\[data-style='${id}'\\]\\[data-shenmo-dim='true'\\]\\s*\\{([^}]*)\\}`)
      )?.[1]
      const baseBlock = css.match(new RegExp(`\\[data-style='${id}'\\]\\s*\\{([^}]*)\\}`))?.[1]
      expect(dimBlock, `${id} 的 tokens.css 里没有堕落暗档块`).toBeDefined()

      const dimFocus = dimBlock?.match(hex)?.[1]
      const dimCell = dimBlock?.match(cell)?.[1]
      const baseFocus = baseBlock?.match(hex)?.[1]
      expect(dimFocus, `${id} 的暗档块没有覆盖 --focus`).toBeDefined()
      expect(dimCell, `${id} 的暗档块没有覆盖 --cell-bg`).toBeDefined()

      const ratio = contrast(dimFocus as string, dimCell as string)
      expect(
        ratio,
        `${id}：堕落态焦点环 ${dimFocus} 对空格 ${dimCell} 只有 ${ratio.toFixed(2)}:1`
      ).toBeGreaterThanOrEqual(3)

      // 「堕落 = 整个世界暗一档」这条意图：焦点环必须真的走了这一步。
      // 少了它，Claude 那种明度高的暖色就会在暗掉的空格上掉线。
      expect(luminance(dimFocus as string)).toBeLessThan(luminance(baseFocus as string))
    })
  }
})
