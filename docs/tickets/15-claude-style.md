# T15 交付 Claude Design 风格

- 状态：已发布，待执行；GitHub [#16](https://github.com/CaiYan12/2048/issues/16)
- 类型：vertical
- 原计划阶段：P5
- SPEC 用户故事：17–18、24、26–28
- Blocked by: T14

## 交付范围

在 `src/renderer/styles/themes/claude/` 先写 `DESIGN.md`，再实现 `tokens.css`、`styles.css`、`config.ts`、`contrast.json` 并注册该风格。设计卡需使“排版、留白与暖色层级”可被识别；重点检查标题、正文、卡片与长数值的协调。只使用固定 Board 结构和两个装饰插槽，不改规则内核。

## 验收标准

- [ ] 开局风格选择器与局中切换均可选择 Claude Design；切换前后棋盘、分数、随机进度及计时不变。
- [ ] 桌面与手机截图能逐项对照设计卡；目标、长数值、胜负面板、键盘焦点及触屏操作保持可用。
- [ ] `contrast.json` 达统一阈值且与计算样式一致；该风格的字体失败和 reduced-motion 状态有明确回退。
- [ ] Playwright 覆盖该风格与当前已完成模式的基础路径；全部六模式完成后纳入 18 组合矩阵。

## 验证

运行 typecheck、build、contrast 与该风格的 e2e；人工检查桌面/手机截图及设计卡。
