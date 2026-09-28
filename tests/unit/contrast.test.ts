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
    // 12 个色档全部按普通文字量（设计卡 §9：连一位数的第一档也是 8.71:1）
    const buckets = material.pairs.filter((pair) =>
      pair.probe?.selector.includes("data-bucket='")
    )
    expect(buckets).toHaveLength(12)
    for (const pair of buckets) {
      expect(pair.minimum, pair.usage).toBe(4.5)
    }
  })

  test('Claude 也没有一档依赖大字口径，且深浅字断在第 6 / 7 档之间', () => {
    // 设计卡 §9 的承诺：字号随位数变化，但本套没有任何一对需要 3:1 豁免
    const claudeBuckets = claude.pairs.filter((pair) =>
      pair.probe?.selector.includes("data-bucket='")
    )
    expect(claudeBuckets).toHaveLength(12)
    for (const pair of claudeBuckets) {
      expect(pair.basis, pair.usage).toBe('regular')
      expect(pair.minimum, pair.usage).toBe(4.5)
    }
    // 前 6 档深字、后 6 档亮字（含 beyond）。死区在相对亮度 0.174～0.254 之间，
    // 断在第 6 / 7 档，所以这一行是「两个方向真的各占一半」的证据
    const inks = claudeBuckets.map((pair) => pair.foreground)
    expect(inks.slice(0, 6).every((ink) => ink === '#26241f')).toBe(true)
    expect(inks.slice(6).every((ink) => ink === '#fbf9f4')).toBe(true)
  })

  test('Claude 的暖色只出现在三个用法上，其余方块底色是低彩度的暖灰', () => {
    // 设计卡 §2：单一暖色强调色 = 选中控件、焦点环、目标档方块。出现第四处暖色填充，
    // 「稀缺」就没了，而这是这套风格最大的可辨识特征
    const WARM = '#a8482b'
    const warm = claude.pairs.filter(
      (pair) => pair.background === WARM || pair.foreground === WARM
    )
    // 选中控件（底）、焦点环 vs 纸面、选中环 vs 空格、第 11 档方块（底）= 四处，
    // 其中两个环是同一块色值的两种用法，正好对上「三个用法」
    expect(warm).toHaveLength(4)

    // 11 个色档 + beyond：除第 11 档外全部是低彩度暖灰——r ≥ g ≥ b 且通道差 ≤ 50。
    // 「暖色层级不靠饱和色」由此变成机器可验的一句话（暖色本体的通道差是 125）
    const buckets = claude.pairs.filter((pair) =>
      pair.probe?.selector.includes("data-bucket='")
    )
    expect(buckets).toHaveLength(12)
    for (const pair of buckets) {
      if (pair.background === WARM) continue
      const [r, g, b] = channels(pair.background)
      expect(r, pair.usage).toBeGreaterThanOrEqual(g)
      expect(g, pair.usage).toBeGreaterThanOrEqual(b)
      expect(r - b, `${pair.usage} 通道差`).toBeLessThanOrEqual(50)
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
