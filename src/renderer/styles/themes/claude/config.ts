import type { JSX } from 'react'
import type { OverlaySlot, StyleId } from '../../../../shared/types'
// 自己的 CSS 由 config 引进来：注册表 index.ts 引 config，于是「加一套风格 = 加一个文件夹 +
// 注册表一行」成立，入口 main.tsx 一个字都不用改（SPEC 用户故事 28）。
import './tokens.css'
import './styles.css'

/**
 * Claude 风格配置
 *
 * id / label 供注册表与风格选择器用；两个插槽交给 Board 渲染（ADR-0002）。
 * 两个插槽都是空的：Claude 的装饰是**排印与细线**（衬线数字、纸面明度层级、板面外那一圈线），
 * 全部由 CSS 表达，不需要 DOM 节点。真需要结构装饰的风格（Aero 的 gloss、Terminal 的扫描线）
 * 届时只改这里的返回值，棋盘与引擎都不动（ADR-0002）。
 */
export const claudeStyleId: StyleId = 'claude'

export const claudeLabel = 'Claude'

const emptyOverlay: OverlaySlot = (): JSX.Element | null => null

export const boardOverlay: OverlaySlot = emptyOverlay
export const tileOverlay: OverlaySlot = emptyOverlay
