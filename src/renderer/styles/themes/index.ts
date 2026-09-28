import { STYLE_CATALOG, type StyleId } from '../../../shared/styleCatalog'
import type { OverlaySlot, StyleDefinition, ToastSlot } from '../types'

/**
 * 风格注册表：目录是白名单，文件夹是实现（ADR-0006 / SC-03）
 *
 * 加一套风格的完整动作从此是两件：目录加一行 + 新建 `themes/<id>/` 文件夹。**这里不用改**，
 * 也不存在第二份「界面能选哪些风格」的清单——选择器与统计面板遍历 THEMES，而 THEMES 由
 * 目录与文件夹共同长出来。注册表与真实能力因此不可能脱节。
 *
 * 加一套风格时唯一要交的接口是下面那个 `StyleSlots`：身份（id / label）与顺序归目录，
 * 文件夹只交实现。
 */

/**
 * 每套风格的 `config.ts` 必须交出的三样东西（ADR-0002 的两个装饰插槽 + 呈现插槽）。
 *
 * 交集刻意收得很窄：装饰插槽只管「棋盘要渲染什么装饰」，呈现插槽只管「祝贺长什么样、
 * 怎么消失」——其余一切都归固定结构与宿主。
 * 身份不在这里——id 与 label 归目录，抄在文件夹里就等于有了两个可能互相矛盾的真话。
 */
export interface StyleSlots {
  boardOverlay: OverlaySlot
  tileOverlay: OverlaySlot
  toast: ToastSlot
}

/**
 * 把一份「发现结果」按目录解析成注册表。
 *
 * 顺序、id、label 一律取自目录；只有三个插槽取自文件夹。**缺一件就抛错**：
 * 目录声明了某套风格而 `themes/<id>/config.ts` 不在（或没交齐插槽）时，静默少一套
 * 会让选择器上少一个按钮而看起来「设计如此」，回落成 Classic 更糟——玩家点的是 B、
 * 看到的是 A。两种都不如当场炸。
 * **呈现插槽同样不许缺**（ADR-0002）：少一个 toast 也不能回退到别的风格的长相，
 * 「这一套的祝贺长什么样」同样是这套风格必须自己回答的事（用户故事 22）。
 *
 * 收一份发现结果而不是自己 glob，是为了让上面这三条能被单测直接驱动（glob 的参数必须是
 * 字面量，见下），而不是靠临时删文件夹来验。
 */
export function resolveThemes(modules: Record<string, StyleSlots>): readonly StyleDefinition[] {
  return STYLE_CATALOG.map((entry) => {
    const slots = modules[`./${entry.id}/config.ts`]
    if (slots === undefined) {
      throw new Error(`风格目录声明了 ${entry.id}，但 themes/${entry.id}/config.ts 不存在`)
    }
    if (typeof slots.boardOverlay !== 'function' || typeof slots.tileOverlay !== 'function') {
      throw new Error(`themes/${entry.id}/config.ts 没有交齐两个装饰插槽`)
    }
    if (typeof slots.toast !== 'function') {
      throw new Error(`themes/${entry.id}/config.ts 没有交呈现插槽（成就祝贺）`)
    }
    return {
      id: entry.id,
      label: entry.label,
      boardOverlay: slots.boardOverlay,
      tileOverlay: slots.tileOverlay,
      toast: slots.toast,
    }
  })
}

/**
 * 发现：把所有 `themes/<id>/config.ts` 静态引进来。
 *
 * 为什么是 glob 而不是手写一张 import 表：手写表就是本票要拆掉的那份「注册表」——
 * 加一套风格要改两处（文件夹 + 列表），而两处就会漂。这里只发现、不判断身份，身份由
 * 目录给：不在目录里的文件夹照样不会被 `resolveThemes` 取用，于是它休眠。
 *
 * 各 config.ts 顶层 import 自己的 tokens.css / styles.css，所以这套发现同时把各风格的
 * CSS 带进产物：入口 main.tsx 仍然一个字都不用改（SPEC 用户故事 28），多套风格依旧同时
 * 加载（切换要在一帧内完成，不能等一次网络往返）。
 *
 * 参数必须是**字面量**：Vite 的 `import.meta.glob` 不接受变量或表达式（官方文档
 * Features → Glob Import 的 caveat）。
 */
const discovered = import.meta.glob<StyleSlots>('./*/config.ts', { eager: true })

/** 风格注册表（SPEC §3.2）。这个文件里没有一个写死的风格身份 */
export const THEMES: readonly StyleDefinition[] = resolveThemes(discovered)

/**
 * 默认风格。
 *
 * **故意不写成「目录里的第一套」**：展示顺序与「新玩家先看到哪一套」是两件事，把后者
 * 绑到前者上，等于以后谁调一下目录顺序就悄悄改了默认观感。
 */
export const DEFAULT_THEME_ID: StyleId = 'classic'

export function getTheme(id: StyleId): StyleDefinition {
  const theme = THEMES.find((item) => item.id === id)
  // 与 getMode 同理：StyleId 是编译期联合，运行期不该有未知值
  if (!theme) throw new Error(`未知风格：${id}`)
  return theme
}
