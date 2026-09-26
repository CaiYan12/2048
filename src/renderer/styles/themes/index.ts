import type { StyleDefinition, StyleId } from '../../../shared/types'
import {
  boardOverlay,
  classicLabel,
  classicStyleId,
  tileOverlay,
} from './classic/config'

/**
 * 风格注册表（SPEC §3.2：注册表改动只发生在这里）
 *
 * T03 只有 classic 一套；T13 / T15 各自加一个文件夹并在这里多一行，
 * 引擎与棋盘结构都不动（ADR-0002）。
 */
export const THEMES: readonly StyleDefinition[] = [
  {
    id: classicStyleId,
    label: classicLabel,
    boardOverlay,
    tileOverlay,
  },
]

export const DEFAULT_THEME_ID: StyleId = classicStyleId

export function getTheme(id: StyleId): StyleDefinition {
  const theme = THEMES.find((item) => item.id === id)
  // 与 getMode 同理：StyleId 是编译期联合，运行期不该有未知值
  if (!theme) throw new Error(`未知风格：${id}`)
  return theme
}
