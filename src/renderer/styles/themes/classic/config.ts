import type { JSX } from 'react'
import type { OverlaySlot, StyleId } from '../../../../shared/types'
// 自己的 CSS 由 config 引进来：注册表 index.ts 引 config，于是入口 main.tsx 不逐个 import
// 主题 CSS——加第三套风格时只加一个文件夹和注册表一行（SPEC 用户故事 28）。
import './tokens.css'
import './styles.css'

/**
 * Classic 风格配置
 *
 * id / label 供注册表与开局界面用；两个插槽交给 Board 渲染（ADR-0002）。
 * T03 两个插槽都是空的：需要插槽的是 Aero 的 gloss、Terminal 的扫描线那类
 * **结构**装饰（ADR-0002 举的例子），而 Classic 设计卡 §6 只保留合并微动效与胜利面板
 * 标题的进入反馈——那是 CSS animation，不占 DOM。等某套风格真需要挂件时，换掉这里的返回值即可，
 * 棋盘与引擎都不动。
 */
export const classicStyleId: StyleId = 'classic'

export const classicLabel = 'Classic'

const emptyOverlay: OverlaySlot = (): JSX.Element | null => null

export const boardOverlay: OverlaySlot = emptyOverlay
export const tileOverlay: OverlaySlot = emptyOverlay
