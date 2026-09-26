import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './renderer/App'
import { initFontState } from './renderer/styles/fontState'

// fonts.css 从入口引，不在 index.css 里 @import：@tailwindcss/vite 会把 CSS 中的
// 本地 @import 内联一份，Vite 的 CSS 模块图又会解析同一个 @import 再内联一份，
// 构建产物里 13 条 @font-face 就出现两次（实测 26 条）。从 JS 引一次即干净。
import './renderer/styles/fonts.css'
// board.css 与主题 CSS 同样从 JS 引、不进 index.css 的 @import（同上的双份内联坑）。
// 主题 CSS 不在这里逐个引：每套风格的 config.ts 引自己的 tokens.css / styles.css，
// 注册表 themes/index.ts 引 config——于是「加一套风格 = 加一个文件夹 + 注册表一行」，
// 入口一个字都不用改（SPEC 用户故事 28）。多套风格同时加载也是有意为之：切换要在
// 一帧内完成，不能等一次网络往返。
import './renderer/styles/board.css'
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
