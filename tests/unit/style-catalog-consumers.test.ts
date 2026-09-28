import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { STYLE_CATALOG } from '../../src/shared/styleCatalog'
import {
  STORAGE_VERSION,
  decodeSession,
  decodeSettings,
  type SessionRecord,
} from '../../src/renderer/stores/session'
import { decodeRecords, recordKey } from '../../src/renderer/stores/records'
import { stateWithBoard } from './support'

/**
 * 目录的消费者：存档校验（ADR-0006 / SC-02）
 *
 * 两组断言，问的是同一件事的两面：
 *
 *   1. **依赖**——session.ts / records.ts 判「这个风格 id 认不认得」时只许问共享目录。
 *      它们此前问的是渲染注册表 THEMES，而注册表顶层 import 各风格的 config.ts、
 *      config.ts 又 import './tokens.css'：于是「一份旧存档能不能续玩」这条判定
 *      被绑在了渲染层上。SC-03 把注册表拆掉之后，这条耦合会直接变成坏掉的功能，
 *      所以它必须在本票先断掉。
 *   2. **行为**——目录里的每一个 id 都被接受、目录外的被拒。断言从目录推导而不是
 *      手抄三个 id，加第四套风格时这两条自动跟上去。
 *
 * 第 1 组为什么是**读源码**而不是跑起来观察：vitest 跑在 Vite 管线里，`import
 * './tokens.css'` 会被静默处理成一个空模块——在测试环境里「import 了 CSS」根本
 * 不报错，只有 Playwright 那种 Node ESM 加载器才会当场 ERR_UNKNOWN_FILE_EXTENSION。
 * 所以这条边界在源码文本上验，与 tests/unit/style-catalog.test.ts 的纯度断言同一路子。
 */

const CATALOG_IDS = STYLE_CATALOG.map((entry) => entry.id)

/** 本局起始时刻：给一个真实的数，免得断言落在一串巧合的默认值上 */
const RUN_START = Date.UTC(2026, 8, 26, 11, 30)

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '')
}

/** 一个模块真正 import 了哪些模块说明符 */
function specifiersOf(source: string): string[] {
  const code = stripComments(source)
  return [
    ...code.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g),
    ...code.matchAll(/\bimport\s*['"]([^'"]+)['"]/g),
  ].map((match) => match[1])
}

/** 两个校验模块：本票要断掉它们与渲染层的耦合 */
const VALIDATION_MODULES = [
  ['session.ts', '../../src/renderer/stores/session.ts'],
  ['records.ts', '../../src/renderer/stores/records.ts'],
] as const

describe('存档校验不再经过渲染层', () => {
  for (const [name, relative] of VALIDATION_MODULES) {
    test(`${name} 只从共享目录取风格身份`, () => {
      const specifiers = specifiersOf(
        readFileSync(new URL(relative, import.meta.url), 'utf8')
      )
      // 注册表（它把各风格的 CSS 引进来）与任何 CSS 都不许出现在这条依赖链上
      expect(
        specifiers.filter(
          (specifier) => specifier.includes('styles/themes') || specifier.endsWith('.css')
        ),
        `${name} 又绕回渲染层了`
      ).toEqual([])
      // 正面的一半：它是从目录问的，而不是干脆不校验
      expect(specifiers).toContain('../../shared/styleCatalog')
    })
  }
})

// ─── 形状夹具：除了 styleId 之外每个字段都取一个能认出来的值 ────────────────────

function settingsWith(styleId: unknown): unknown {
  return { version: STORAGE_VERSION, modeId: 'classic', styleId, mute: false }
}

function sessionWith(styleId: unknown): unknown {
  const record: Omit<SessionRecord, 'styleId'> & { styleId: unknown } = {
    version: STORAGE_VERSION,
    styleId,
    dailyDate: null,
    startedAt: RUN_START,
    styleSwitches: 0,
    game: stateWithBoard([
      [2, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
    ]),
    historyLength: 0,
  }
  return record
}

function recordValue(): unknown {
  return { version: STORAGE_VERSION, bestScore: 10, highestTile: 2 }
}

describe('目录里的每个 id 都被接受', () => {
  test('settings 桶', () => {
    for (const id of CATALOG_IDS) {
      const parsed = decodeSettings(settingsWith(id))
      expect(parsed.kind, id).toBe('ok')
      if (parsed.kind === 'ok') expect(parsed.record.styleId).toBe(id)
    }
  })

  test('session 桶', () => {
    for (const id of CATALOG_IDS) {
      const parsed = decodeSession(sessionWith(id))
      expect(parsed.kind, id).toBe('ok')
      if (parsed.kind === 'ok') expect(parsed.record.styleId).toBe(id)
    }
  })

  test('records 桶的键', () => {
    for (const id of CATALOG_IDS) {
      const key = recordKey('classic', id)
      const parsed = decodeRecords([{ key, value: recordValue() }])
      expect(parsed.kind, key).toBe('ok')
      if (parsed.kind === 'ok') expect(parsed.entries[0].styleId).toBe(id)
    }
  })
})

describe('目录外的 id 一律严格拒绝', () => {
  test('三个桶都按形状拒绝，不是静默回落到默认风格', () => {
    // 「回落」比拒绝更糟：玩家会在一局 aero 的存档上看到 classic 的棋盘，
    // 而界面上没有一个字说明发生过什么
    expect(decodeSettings(settingsWith('aero'))).toEqual({ kind: 'rejected', reason: 'shape' })
    expect(decodeSession(sessionWith('aero'))).toEqual({ kind: 'rejected', reason: 'shape' })
    expect(decodeRecords([{ key: 'classic:aero', value: recordValue() }])).toEqual({
      kind: 'rejected',
      reason: 'shape',
    })
  })
})
