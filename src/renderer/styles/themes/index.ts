import type { StyleDefinition, StyleId } from '../../../shared/types'
import {
  boardOverlay,
  classicLabel,
  classicStyleId,
  tileOverlay,
} from './classic/config'
import {
  boardOverlay as materialBoardOverlay,
  materialLabel,
  materialStyleId,
  tileOverlay as materialTileOverlay,
} from './material/config'

/**
 * 风格注册表（SPEC §3.2：注册表改动只发生在这里）
 *
 * T03 只有 classic 一套；T13 加上 material、T15 加上 claude，引擎与棋盘结构都不动
 * （ADR-0002）。选择器与开局界面只遍历这张表——不在 THEMES 里的风格不出现在界面上，
 * 界面与真实能力因此不会脱节。
 *
 * 每套风格的 CSS 由它自己的 config.ts 引进来（见 material/config.ts 的说明），
 * 所以加一套风格只改本文件一行 + 新增那个文件夹。
 */
export const THEMES: readonly StyleDefinition[] = [
  {
    id: classicStyleId,
    label: classicLabel,
    boardOverlay,
    tileOverlay,
  },
  {
    id: materialStyleId,
    label: materialLabel,
    boardOverlay: materialBoardOverlay,
    tileOverlay: materialTileOverlay,
  },
]

export const DEFAULT_THEME_ID: StyleId = classicStyleId

export function getTheme(id: StyleId): StyleDefinition {
  const theme = THEMES.find((item) => item.id === id)
  // 与 getMode 同理：StyleId 是编译期联合，运行期不该有未知值
  if (!theme) throw new Error(`未知风格：${id}`)
  return theme
}
