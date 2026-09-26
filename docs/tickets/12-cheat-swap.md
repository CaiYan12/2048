# T12 交付可撤销的作弊交换

- 状态：已发布，待执行；GitHub [#13](https://github.com/CaiYan12/2048/issues/13)
- 类型：vertical
- 原计划阶段：P4
- SPEC 用户故事：15–16
- Blocked by: T01, T07, T11

## 交付范围

贯通 swap 规则、选择态、StatusBar 按钮、键盘/Esc 路径、障碍限制和操作播报。

## 验收标准

- [ ] 两枚数值 Tile 交换位置且分数不变；同格二次选择取消，Wall 不能选。
- [ ] 交换加入 Undo 历史并重判死局；终局后行为遵守 T01 的结算决策。
- [ ] 纯键盘与指针均可完成和退出交换；单测/e2e 覆盖。

## 验证

单测与 Playwright 键盘/指针/Walls 用例。
