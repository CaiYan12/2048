import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * GitHub Pages 仓库子路径：https://caiyan12.github.io/2048/
 *
 * base 必须现在就设对。构建时 Vite 用它重写 index.html 的入口脚本、CSS 与
 * 字体等绝对路径资源；留到上线前再改，等于把整站资源路径一次全改错。
 * 本票不发布（GOAL 排除部署），这里的 base 只为预览与后续闸门预先对齐。
 */
const PAGES_BASE = '/2048/'

export default defineConfig({
  base: PAGES_BASE,
  plugins: [react(), tailwindcss()],
})
