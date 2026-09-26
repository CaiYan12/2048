# T02 建立可运行、可检查的空壳应用

- 状态：已发布，待执行；GitHub [#3](https://github.com/CaiYan12/2048/issues/3)
- 类型：enabling infrastructure
- 原计划阶段：P0
- SPEC 用户故事：29–30
- Blocked by: none

## 交付范围

建立根目录 `index.html`、钉死的依赖与 lockfile、Vite/TypeScript/Tailwind、Vitest/Playwright 配置和最小 React 空壳。CI 从 `npm ci` 到 typecheck、测试与构建；配置 Pages 子路径但本票不发布。

## 验收标准

- [ ] `npm run dev`、`npm run typecheck`、`npm run build`、`npm run preview` 可执行。
- [ ] Playwright 的本地服务地址与 `baseURL` 一致，构建预览能加载 CSS 与已有字体。
- [ ] P0 零测试通过被明确标记为工具链检查；第一条真实测试加入后移除 `passWithNoTests`。

## 验证

执行四个 npm 脚本、检查构建资源路径与 CI 配置；记录准确的依赖版本。
