# T06 交付 Big Board 模式

- 状态：已发布，待执行；GitHub [#7](https://github.com/CaiYan12/2048/issues/7)
- 类型：vertical
- 原计划阶段：P1
- SPEC 用户故事：9
- Blocked by: T01, T03

## 交付范围

贯通 5×5 模式声明、规则状态、Board 布局和响应式显示。

## 验收标准

- [ ] 棋盘确为 25 Cell、目标为 4096，移动与生成覆盖边缘行列。
- [ ] 桌面与手机视口均无横向溢出、Tile 遮挡或不可点击控件。
- [ ] 单测与 Playwright 覆盖 5×5 开局、移动、终局。

## 验证

单测、两个视口的 Playwright 与截图复核。
