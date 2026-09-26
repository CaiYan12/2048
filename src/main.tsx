import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './renderer/App'
import { initFontState } from './renderer/styles/fontState'

// fonts.css 从入口引，不在 index.css 里 @import：@tailwindcss/vite 会把 CSS 中的
// 本地 @import 内联一份，Vite 的 CSS 模块图又会解析同一个 @import 再内联一份，
// 构建产物里 13 条 @font-face 就出现两次（实测 26 条）。从 JS 引一次即干净。
import './renderer/styles/fonts.css'
import './renderer/styles/index.css'

const container = document.getElementById('root')
// strict 模式下 getElementById 返回可空。挂载点缺失等于构建产物与 index.html
// 不同步，直接失败比带着 null 继续渲染更容易定位。
if (!container) throw new Error('index.html 缺少 #root 挂载点')

// 字体加载态要在首屏文本之前落上 <html>：先标记 loading，浏览器才会先用
// 回退字体把内容画出来（font-display: swap 的配套，见 fontState.ts 注释）。
initFontState()

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)
