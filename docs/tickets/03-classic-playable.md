# T03 交付可移动和计分的 Classic 纵向切片

- 状态：已发布，待执行；GitHub [#4](https://github.com/CaiYan12/2048/issues/4)
- 类型：vertical
- 原计划阶段：P1–P2
- SPEC 用户故事：1–5、27–29
- Blocked by: T01, T02

## 交付范围

以 Classic 数据贯通纯规则内核、可恢复随机源、单 Zustand store、固定 Board/Tile DOM、`board.css`、Classic 设计卡与样式、键盘操作和得分 UI。

## 验收标准

- [ ] 固定棋盘中一次合法 Move 按合并表滑动、合并、计分并生成；无效 Move 不生成。
- [ ] Tile 身份不随位置变化；输入键仅在游戏目标上拦截，其他控件保留默认键盘行为。
- [ ] 有纯逻辑测试与确定性 Playwright 合并测试；P1 起单测不能零测试通过。

## 验证

`npm test`、typecheck、build、Playwright 固定局面测试及真实浏览器键盘试玩。
