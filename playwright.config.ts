import { defineConfig, devices } from '@playwright/test'

/**
 * 本地预览服务与 baseURL 必须指向同一个地址（含 Pages 子路径 /2048/）。
 * 健康检查用 localhost；CI 不复用残留服务，避免上一次没退出的 preview 冒充本次结果。
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
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    command: WEB_SERVER_COMMAND,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
  },
})
