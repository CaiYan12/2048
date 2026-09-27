import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import licences from '../../src/renderer/styles/fontLicences.json'
import { firstLocalFamily } from '../../src/renderer/styles/fontProbe'
import { THEMES } from '../../src/renderer/styles/themes'

/**
 * 逐家族字体授权与版权表（T14 · SPEC §3.2「每种分发的字体都要保留自己的授权与版权声明」）
 *
 * 为什么逐家族而不是一份通用声明了事：这 11 个家族虽同属 OFL-1.1，但版权行各不相同，
 * 而 OFL 1.1 的 Copyright Condition 要求随分发保留那份声明；更实际的理由是——T15 之后
 * 每加一套风格都可能引入新家族，这张表就是它要先查的地方，而只有机器核得住它。
 *
 * 核的是三边对齐：fonts.css 声明的 @font-face ↔ 本表登记 ↔ public/fonts/ 里的文件。
 * 任何一边多出来、少下去都是问题：fonts.css 多出来的家族没有授权记录，
 * 目录里多出来的文件根本没被 shipped 的 CSS 引用（或反之，登记了个不存在的文件）。
 */

const fontsCss = (): string =>
  readFileSync(new URL('../../src/renderer/styles/fonts.css', import.meta.url), 'utf8')
const tokensCss = (styleId: string): string =>
  readFileSync(
    new URL(`../../src/renderer/styles/themes/${styleId}/tokens.css`, import.meta.url),
    'utf8'
  )

/** 本仓库已知的授权标识（新增家族时在这里加一行，别的是不认识的） */
const KNOWN_LICENCES: readonly string[] = ['OFL-1.1']

/** fonts.css 里每一条 @font-face 声明：家族 + 它 src 里的本地路径 */
function fontFaces(): Array<{ family: string; url: string; file: string }> {
  // 先剥注释：fonts.css 的注释里有一行 `font-family: '<本地字体>'` 的写法说明，
  // 不剥就会凭空多出一个家族来
  const css = fontsCss().replace(/\/\*[\s\S]*?\*\//g, '')
  return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].flatMap(([, body]) => {
    const family = /font-family:\s*'([^']+)'/.exec(body)
    const src = /src:\s*url\('([^']+)'\)/.exec(body)
    if (family === null || src === null) return []
    const url = src[1]
    return [{ family: family[1], url, file: url.slice(url.lastIndexOf('/') + 1) }]
  })
}

/** 一套风格 tokens.css 里 --font-* 声明用到的本地字体名 */
function themeFamilies(styleId: string): string[] {
  const declarations = [
    ...tokensCss(styleId).matchAll(/--font-[a-z-]+:\s*([^;]+);/g),
  ].map((match) => firstLocalFamily(match[1]))
  return [...new Set(declarations.filter((name): name is string => name !== null))]
}

describe('授权表与 fonts.css 双向对齐', () => {
  test('fonts.css 里每个家族都有一条登记', () => {
    const families = [...new Set(fontFaces().map((face) => face.family))]
    expect(families.length).toBeGreaterThan(0)
    const registered = licences.families.map((entry) => entry.family)
    for (const family of families) {
      expect(registered, `fonts.css 用了 ${family}，但授权表里没有它`).toContain(family)
    }
  })

  test('授权表里每一条登记都真的在 fonts.css 里被声明', () => {
    // 反方向也要核：登记一个没人用的家族，表就会慢慢长成一份考古清单
    const families = new Set(fontFaces().map((face) => face.family))
    for (const entry of licences.families) {
      expect(families, `授权表登记了 ${entry.family}，但 fonts.css 里没有它`).toContain(
        entry.family
      )
    }
  })
})

describe('每一条登记都是逐家族的，不是一份通用声明', () => {
  test('每条都点名一个已知授权', () => {
    for (const entry of licences.families) {
      expect(KNOWN_LICENCES, `${entry.family} 的授权是 ${entry.licence}`).toContain(entry.licence)
    }
  })

  test('授权正文在仓库里，且就是 OFL 1.1', () => {
    const path = join('public', 'fonts', 'OFL.txt')
    expect(existsSync(path)).toBe(true)
    const text = readFileSync(path, 'utf8')
    expect(text).toContain('SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007')
    expect(licences.licenceText).toBe('public/fonts/OFL.txt')
  })

  test('每条都带自己的版权行，且 11 条互不相同', () => {
    // 「互不相同」这一条正是逐家族登记的意义：一份通用声明在这里会当场露出来
    const copyrights = licences.families.map((entry) => entry.copyright)
    for (const entry of licences.families) {
      expect(entry.copyright, entry.family).toMatch(/^Copyright \d{4}/)
    }
    expect(new Set(copyrights).size).toBe(copyrights.length)
    expect(copyrights.length).toBe(licences.families.length)
  })

  test('登记的文件清单与 fonts.css 的 src 逐字一致，且文件都在 public/ 里', () => {
    // 目录名（roboto-flex）与字体名（Roboto Flex）不是一个约定，所以路径以 fonts.css
    // 的 src 为准、不按家族名推——推错的那天它会安静地核着一个不存在的路径
    for (const face of fontFaces()) {
      const entry = licences.families.find((item) => item.family === face.family)
      expect(entry, `fonts.css 有 ${face.family} 的 @font-face，授权表里却没有这一条`).toBeDefined()
      expect(entry?.files, `${face.family} 少登记 ${face.file}`).toContain(face.file)
      // /fonts/… 是站点根路径，落到仓库里是 public/fonts/…
      const onDisk = fileURLToPath(new URL(`../../public${face.url}`, import.meta.url))
      expect(existsSync(onDisk), `${face.url} 不在 public/ 里`).toBe(true)
      expect(statSync(onDisk).size, `${face.url} 是空文件`).toBeGreaterThan(0)
    }
    // 反向：授权表登记了 fonts.css 没引用的文件，同样是账目不平
    for (const entry of licences.families) {
      const shipped = fontFaces()
        .filter((face) => face.family === entry.family)
        .map((face) => face.file)
      expect(entry.files.sort(), `${entry.family} 的文件清单与 fonts.css 不一致`).toEqual(
        [...shipped].sort()
      )
    }
  })
})

describe('风格与字体的对应关系真的成立', () => {
  test('每套风格用到的字体都登记了它自己', () => {
    // 这一条是「未来加家族的地方」：T15 引入 Fraunces 时，若忘了在表里登记
    // 那一栏，这里立刻炸——而不是等发布前才发现少一份版权
    for (const theme of THEMES) {
      for (const family of themeFamilies(theme.id)) {
        const entry = licences.families.find((item) => item.family === family)
        expect(entry, `${theme.id} 用了 ${family}，授权表里没有这一条`).toBeDefined()
        expect(entry?.usedBy, `${family} 没把 ${theme.id} 记进 usedBy`).toContain(theme.id)
      }
    }
  })

  test('usedBy 里只有注册表里真实存在的风格 id', () => {
    const ids = new Set<string>(THEMES.map((theme) => theme.id))
    for (const entry of licences.families) {
      for (const user of entry.usedBy) {
        expect(ids, `${entry.family} 的 usedBy 里有未注册的 ${user}`).toContain(user)
      }
    }
  })

  test('三套风格各自用上了自己的家族，且互不相同', () => {
    expect(themeFamilies('classic')).toEqual(['Inter'])
    expect(themeFamilies('material')).toEqual(['Roboto Flex'])
    // T15：Claude 是唯一一套用两个家族的——衬线做展示与方块数字，人文无衬线做正文。
    // 两个都不与另两套撞（Inter / Roboto Flex 已被占），第三套再用同一族就把
    // 「三套风格三种字体」这件事打穿了
    expect(themeFamilies('claude')).toEqual(['Playfair Display', 'Source Sans 3'])
    const all = ['classic', 'material', 'claude'].flatMap((id) => themeFamilies(id))
    expect(new Set(all).size).toBe(all.length)
  })
})
