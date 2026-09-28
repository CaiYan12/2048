import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import type { StyleId } from '../../src/shared/styleCatalog'
import { STYLE_CATALOG } from '../../src/shared/styleCatalog'
import type { StyleId as TypesStyleId } from '../../src/shared/types'
import { DEFAULT_THEME_ID, THEMES } from '../../src/renderer/styles/themes'

/**
 * 风格目录的契约（ADR-0006 / SC-01）
 *
 * 这一条在 SC-03 之后仍然成立，而且是它守着的那条最关键的边界：注册表由「目录 + 文件夹」
 * 长出来，界面、持久化、测试三边都只能从目录取身份。一旦目录与注册表分叉，先炸在这里，
 * 而不是由界面上的错位来暴露。
 *
 * 目录那一半是纯的：文件零 import，不碰 React / CSS / DOM / 渲染层。零 import 是
 * 「不依赖渲染」的操作化形式——它挡的是往后有人图省事把 themes/index.ts 或某个
 * config.ts 引进来（那些文件顶层 `import './tokens.css'`，于是校验又绑回渲染层）。
 */

const CATALOG_SOURCE = new URL('../../src/shared/styleCatalog.ts', import.meta.url)

const catalogIds = STYLE_CATALOG.map((entry) => entry.id)

/**
 * 去掉注释再扫 import：注释里会写到 `import './tokens.css'` 这种反例（解释「为什么不能
 * 把 config.ts 引进来」），那是散文不是代码。断言的对象是真正的模块依赖。
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '')
}

describe('目录是纯的', () => {
  test('styleCatalog.ts 零 import：不碰 React / CSS / DOM / 渲染层', () => {
    const source = stripComments(readFileSync(CATALOG_SOURCE, 'utf8'))
    const specifiers = [
      ...source.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g),
      ...source.matchAll(/\bimport\s*['"]([^'"]+)['"]/g),
    ].map((match) => match[1])
    expect(specifiers).toEqual([])
  })
})

describe('目录声明的身份', () => {
  test('id 唯一', () => {
    expect(new Set(catalogIds).size).toBe(catalogIds.length)
  })

  test('持久化身份就是这三个 id——改 label 或调顺序都不该动它们', () => {
    // 集合相等（排序后比）而不是逐位相等：这条钉的是 id **本身**的稳定，不是顺序。
    // 顺序由下一条用例单独钉，于是「重排目录」与「重命名 id」是两件事，
    // 前者是展示层自由，后者是持久化迁移（ADR-0006 第 6 条）。
    expect([...catalogIds].sort()).toEqual(['classic', 'claude', 'material'])
  })
})

describe('目录与注册表对齐', () => {
  test('id、label、顺序三者逐位相同', () => {
    const fromCatalog = STYLE_CATALOG.map((entry) => ({ id: entry.id, label: entry.label }))
    const fromRegistry = THEMES.map((theme) => ({ id: theme.id, label: theme.label }))
    expect(fromCatalog).toEqual(fromRegistry)
  })

  test('渲染默认风格是目录里的一个条目', () => {
    expect(catalogIds).toContain(DEFAULT_THEME_ID)
  })
})

describe('StyleId 由目录派生', () => {
  test('目录里每个 id 都是 StyleId，未知 id 被编译期拒绝', () => {
    const accepted: readonly StyleId[] = catalogIds
    expect(accepted).toEqual(['classic', 'material', 'claude'])

    // @ts-expect-error 'aero' 不在目录里；这条若不再报错，说明联合被改回了手写或放宽了
    const unknown: StyleId = 'aero'
    expect(unknown).toBe('aero')
  })

  test('types.ts 只是转出同一份 StyleId，没有留下第二份手写联合', () => {
    // 两边能互相赋值即同一个类型；若 types.ts 又写了一份等价联合，这里仍会通过，
    // 所以真正的守卫是上一条的 @ts-expect-error + 本票删掉的那行手写联合。
    const fromCatalog: StyleId = catalogIds[0]
    const viaTypes: TypesStyleId = fromCatalog
    const backAgain: StyleId = viaTypes
    expect(backAgain).toBe('classic')
  })
})
