# T24 完成 CI 闸门、README 与 Pages 发布验收

- 状态：已发布，待执行；GitHub [#25](https://github.com/CaiYan12/2048/issues/25)
- 类型：vertical
- 原计划阶段：P10
- SPEC 用户故事：29–30
- Blocked by: T16, T17, T18, T19, T20, T21, T22, T23

## 交付范围

汇总真实能力更新 README/AGENTS 项目信息，CI 跑 typecheck、unit、contrast、build 和 e2e；经 GitHub Actions 发布 `dist` 到 Pages 并进行线上功能验收。

## 验收标准

- [ ] CI 全绿且不允许零单测假绿；Pages 的脚本、CSS、字体无 404。
- [ ] 线上能开局、移动、切换风格、刷新续玩；README 与实际功能一致。
- [ ] 记录部署提交、工作流结果与线上页面的功能证据；不以 HTTP 200 代替验收。

## 验证

CI、构建预览和线上浏览器功能检查。
