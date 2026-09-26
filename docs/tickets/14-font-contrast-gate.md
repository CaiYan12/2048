# T14 补齐字体切换与风格对比度验收

- 状态：已发布，待执行；GitHub [#15](https://github.com/CaiYan12/2048/issues/15)
- 类型：vertical
- 原计划阶段：P5
- SPEC 用户故事：24、26–27
- Blocked by: T13

## 交付范围

以 Classic/Material 为真实样本修复切换后字体状态、逐家族版权/OFL、`contrast.json` 与校验脚本，并验证页面实际计算样式。

## 验收标准

- [ ] 切到首次使用的字体时 loading/ready/fallback 正确更新；慢网和 404 不永久误报 ready。
- [ ] 两套风格的文字、Tile、按钮与焦点前景/背景对达到统一阈值；声明与 computed style 一致。
- [ ] 每个已用字体家族有对应授权及版权文本，构建预览能加载本地字体。

## 验证

`npm run check:contrast`、Playwright 拦截字体请求与浏览器样式检查。
