import type { JSX } from 'react'
import type { OverlaySlot } from '../../types'
// 自己的 CSS 由 config 引进来：注册表按目录装载 config，于是入口 main.tsx 不逐个 import
// 主题 CSS——加一套风格只加一个文件夹和目录一行（SPEC 用户故事 28）。
import './tokens.css'
import './styles.css'

/**
 * Classic 风格配置
 *
 * 交三样东西：两个**装饰插槽**（`boardOverlay` / `tileOverlay`，ADR-0002）与一个
 * **呈现插槽**（`toast`）。**身份不在这里**——id 与 label 归目录
 * （src/shared/styleCatalog.ts），文件夹里再抄一份就有了两个可能互相矛盾的真话。
 *
 * 两个装饰插槽都是空的：需要插槽的是 Aero 的 gloss、Terminal 的扫描线那类
 * **结构**装饰（ADR-0002 举的例子），而 Classic 设计卡 §6 只保留合并微动效与胜利面板
 * 标题的进入反馈——那是 CSS animation，不占 DOM。等某套风格真需要挂件时，换掉这里的返回值即可，
 * 棋盘与引擎都不动。
 *
 * 呈现插槽不空：成就祝贺是**每套风格自己实现**的（设计卡 §10），它在 `./toast.tsx` 里，
 * 由这里转出来——注册表只认识 config.ts 的导出，所以那一份必须从这里露头。
 */
const emptyOverlay: OverlaySlot = (): JSX.Element | null => null

export const boardOverlay: OverlaySlot = emptyOverlay
export const tileOverlay: OverlaySlot = emptyOverlay
export { toast } from './toast'
