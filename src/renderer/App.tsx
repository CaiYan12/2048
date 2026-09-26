import type { JSX } from 'react'

/**
 * 空壳应用
 *
 * 本票只证明工具链是通的：Tailwind 4 接入生效、自托管字体被真实请求、React 能挂载。
 * 模式选择、棋盘与风格系统由后续 ticket 建立，这里不预设它们的结构，
 * 免得空壳先长成一套需要维护的假界面。
 */

// App 是全项目唯一的 default export（primal-setup-plan 的目录结构口径）；
// 其余组件一律具名导出 + 局部 interface Props。
export default function App(): JSX.Element {
  return (
    <main className="grid min-h-dvh place-items-center bg-slate-950 text-slate-100">
      <div className="px-6 text-center">
        {/* font-display / font-body 是 index.css 里 @theme inline 映射出来的语义类，
            指向 fonts.css 声明的本地字体。标题写西文数字是故意的：latin 子集
            才会真的去请求 woff2，中文不会触发（见 fonts.css 的 unicode-range）。 */}
        <h1 className="font-display text-6xl font-bold tracking-tight">2048</h1>
        <p className="font-body mt-4 text-sm text-slate-400">
          工具链空壳已就绪，模式与风格由后续迭代接入
        </p>
      </div>
    </main>
  )
}
