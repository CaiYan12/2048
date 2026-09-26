import { defineConfig, devices } from '@playwright/test'

/**
 * 本地预览服务与 baseURL 必须指向同一个地址（含 Pages 子路径 /2048/）。
 * 健康检查用 localhost；本地与 CI 一律不复用残留服务——上一次没退出的 preview
 * 里是旧 build，让它接住请求就等于拿陈旧产物冒充本次结果。宁可失败也不复用：
 * 4173 已被占用时 --strictPort 直接报错（reuseExistingServer 恒为 false），
 * 把端口冲突摊到明面上，而不是安静地测一份错的东西。
 *
 * 一律 headless：项目所有者在自己的机器上同时做别的工作，弹出的浏览器窗口会抢走
 * 键盘焦点。需要看渲染结果时读回 DOM（computed style / data-* / 文本），不开可见
 * 窗口；也不要 --headed、--debug、--ui、codegen 或打开 trace viewer。
 */
const PREVIEW_ORIGIN = 'http://localhost:4173'
const BASE_URL = `${PREVIEW_ORIGIN}/2048/`

// 跑构建预览而不是 dev server：只有构建产物才会暴露 base、CSS 与字体的
// 真实路径问题，dev server 的路径规则和上线不一致。
const WEB_SERVER_COMMAND =
  'npm run build && npm run preview -- --port 4173 --strictPort'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'line',
  use: {
    baseURL: BASE_URL,
    // 永不弹可见窗口（理由见文件头注释）。默认值也是 true，写出来是为了让
    // 「headless」成为一个有据可查的约定，而不是恰好赶上的默认值。
    headless: true,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    command: WEB_SERVER_COMMAND,
    url: BASE_URL,
    reuseExistingServer: false,
  },
})
