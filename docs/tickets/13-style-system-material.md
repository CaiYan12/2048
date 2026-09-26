# T13 用 Material 交付第一条完整风格切换路径

- 状态：已发布，待执行；GitHub [#14](https://github.com/CaiYan12/2048/issues/14)
- 类型：vertical
- 原计划阶段：P5
- SPEC 用户故事：17–18、27–28
- Blocked by: T03

## 交付范围

建立主题注册、`data-style`、两装饰插槽、风格选择器和 Material 的独立设计卡/样式，使 Classic↔Material 在局中切换。

## 验收标准

- [ ] 风格切换立即改变外观，但棋盘、分数、计时及 PRNG 进度不变。
- [ ] Material 具有独立的色彩、层级、排版及响应式处理；开局与局中均能选择。
- [ ] 局部修改只涉及主题文件夹、注册表及通用风格选择 UI，不改规则内核。

## 验证

Playwright 切换状态不变断言、桌面/手机截图与设计卡核对。
