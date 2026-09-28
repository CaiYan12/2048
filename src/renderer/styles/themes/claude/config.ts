import type { JSX } from 'react'
import type { OverlaySlot } from '../../types'
// 自己的 CSS 由 config 引进来：注册表按目录装载 config，于是「加一套风格 = 加一个文件夹 +
// 目录一行」成立，入口 main.tsx 一个字都不用改（SPEC 用户故事 28）。
import './tokens.css'
import './styles.css'

/**
 * Claude 风格配置
 *
 * 交三个插槽：两个装饰插槽（ADR-0002）与一个呈现插槽（`toast`）；id 与 label 归目录，
 * 不在这里。
 * 两个装饰插槽都是空的：Claude 的装饰是**排印与细线**（衬线数字、纸面明度层级、板面外那一圈线），
 * 全部由 CSS 表达，不需要 DOM 节点。真需要结构装饰的风格（Aero 的 gloss、Terminal 的扫描线）
 * 届时只改这里的返回值，棋盘与引擎都不动（ADR-0002）。
 * 呈现插槽不空：成就祝贺是本风格自己实现的（设计卡 §10），在 `./toast.tsx` 里，
 * 由这里转出来——注册表只认识 config.ts 的导出。
 */
const emptyOverlay: OverlaySlot = (): JSX.Element | null => null

export const boardOverlay: OverlaySlot = emptyOverlay
export const tileOverlay: OverlaySlot = emptyOverlay
export { toast } from './toast'
