import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { STYLE_CATALOG } from '../../src/shared/styleCatalog'
import { resolveThemes, type StyleSlots } from '../../src/renderer/styles/themes'

/**
 * 风格装载：目录是白名单，文件夹是实现（ADR-0006 / SC-03）
 *
 * 这一层要钉的是三句话：
 *
 *   1. **谁定序与身份**——顺序、id、label 一律取自 `STYLE_CATALOG`，不取自文件夹；
 *   2. **缺了要响**——目录声明了某套风格、而 `themes/<id>/config.ts` 不存在（或没交出
 *      两个插槽）时**抛错**。不静默少一套、更不许回落成 Classic：一个静默回落的注册表
 *      会让选择器上少一个按钮，而玩家点不到的那套风格看起来像「设计如此」；
 *   3. **多余的休眠**——目录之外的文件夹一律不装载。
 *
 * 为什么 `resolveThemes` 收一份「发现结果」而不是自己 glob：glob 的参数必须是字面量
 * （Vite 文档明确写了不能传变量），所以发现只能发生在模块顶层；把「从目录解析」这一半
 * 抽成纯函数，才能用一份假发现结果去驱动上面三条，而不是靠临时删文件夹来验。
 */
const CATALOG_IDS = STYLE_CATALOG.map((entry) => entry.id)

/** 一个够用的假 config：这一层只关心它交没交出三个插槽（两个装饰 + 一个呈现） */
function slots(): StyleSlots {
  return { boardOverlay: () => null, tileOverlay: () => null, toast: () => null }
}

/**
 * 假发现结果：键的写法与 `import.meta.glob` 给出的一致，也就是相对本模块的
 * 路径形式（`./<id>/config.ts`）。这里不把 glob 的模式字面量写进注释——注释里出现
 * 那个通配符加斜杠会**提前结束块注释**（实测炸在解析阶段）。
 */
function discovered(ids: readonly string[] = CATALOG_IDS): Record<string, StyleSlots> {
  return Object.fromEntries(ids.map((id) => [`./${id}/config.ts`, slots()]))
}

describe('按目录解析风格实现', () => {
  test('顺序、id、label 全取自目录，插槽取自各自的文件夹', () => {
    const boardOverlay = (): null => null
    const themes = resolveThemes({
      './material/config.ts': { boardOverlay, tileOverlay: () => null, toast: () => null },
      './classic/config.ts': slots(),
      './claude/config.ts': slots(),
    })

    expect(themes.map((theme) => [theme.id, theme.label])).toEqual(
      STYLE_CATALOG.map((entry) => [entry.id, entry.label])
    )
    // 插槽确实来自那个文件夹，不是被换成了默认值
    expect(themes[1].boardOverlay).toBe(boardOverlay)
  })

  test('目录声明了、文件夹却没有：抛错，不静默少一套', () => {
    const modules = discovered()
    delete modules['./claude/config.ts']

    expect(() => resolveThemes(modules)).toThrow(/claude/)
  })

  test('config 在、装饰插槽没交齐：抛错（必需配置缺失）', () => {
    const broken = { boardOverlay: undefined } as unknown as StyleSlots
    expect(() => resolveThemes({ ...discovered(), './classic/config.ts': broken })).toThrow(
      /classic/
    )
  })

  test('config 在、呈现插槽（成就祝贺）没交：同样抛错，绝不回退到别的风格的长相', () => {
    // ADR-0002 的增补：每套风格必须交齐三件插槽。少一个 toast 时静默用 Classic 那一份
    // 是最糟的两种做法之一——玩家点的是 B、看到的是 A。所以这里当场炸
    const broken = { boardOverlay: () => null, tileOverlay: () => null } as unknown as StyleSlots
    expect(() => resolveThemes({ ...discovered(), './claude/config.ts': broken })).toThrow(/claude/)
  })

  test('目录之外的文件夹休眠：装载结果不多不少，正好是目录那几套', () => {
    const themes = resolveThemes({ ...discovered(), './terminal/config.ts': slots() })

    expect(themes.map((theme) => theme.id)).toEqual(CATALOG_IDS)
    expect(themes).toHaveLength(STYLE_CATALOG.length)
  })
})

describe('身份与实现各归各位', () => {
  /**
   * 测试文件里同一套 glob：它证明「目录里每一个 id 都真有对应的 config.ts 被 Vite 发现」，
   * 而不只是「文件夹在磁盘上」。
   */
  const configs = import.meta.glob('../../src/renderer/styles/themes/*/config.ts', {
    eager: true,
  }) as Record<string, Record<string, unknown>>

  test('每套风格都真有被发现的 config.ts', () => {
    const found = Object.keys(configs)
      .map((path) => path.split('/').slice(-2)[0])
      .sort()
    expect(found).toEqual([...CATALOG_IDS].sort())
  })

  test('config 只交出三个插槽：id 与 label 归目录所有', () => {
    // 两件装饰 + 一件呈现（ADR-0002）。多一个键就说明有东西绕过了目录身份
    for (const [path, module] of Object.entries(configs)) {
      expect(Object.keys(module).sort(), path).toEqual(['boardOverlay', 'tileOverlay', 'toast'])
    }
  })

  test('每个目录条目都有完整的风格文件夹与必需文件（六件套）', () => {
    // 五个文件 + 一个呈现插槽的实现文件。**六件**是 ADR-0002 增补之后的数量：
    // 缺 toast.tsx 的风格在注册表解析时就会炸（上面那条用例），这里补的是「文件真的在」
    for (const id of CATALOG_IDS) {
      for (const file of [
        'DESIGN.md',
        'tokens.css',
        'styles.css',
        'config.ts',
        'contrast.json',
        'toast.tsx',
      ]) {
        const path = new URL(`../../src/renderer/styles/themes/${id}/${file}`, import.meta.url)
        expect(existsSync(path), `themes/${id}/${file} 缺失`).toBe(true)
      }
    }
  })

  test('共享层不携带 React 类型：插槽与声明归渲染层', () => {
    // 判据是「共享层不 import react」。OverlaySlot 要引用 JSX，它留在 shared/types.ts 里
    // 就等于让共享层（以及只想知道 StyleId 合法性的调用方）被迫认识 react
    const source = readFileSync(new URL('../../src/shared/types.ts', import.meta.url), 'utf8')
    expect(source).not.toContain("from 'react'")
  })
})
