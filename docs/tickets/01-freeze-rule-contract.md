# T01 固化模式示例与结算边界

- 状态：已发布，待项目所有者决策；GitHub [#2](https://github.com/CaiYan12/2048/issues/2)
- 类型：decision gate
- 原计划阶段：P1
- SPEC 用户故事：3–16、21
- Blocked by: none

## 交付范围

在 `docs/SPEC.md` 与 `tests/unit/fixtures/` 固化四个 Walls 坐标、非 Classic 生成权重、Fibonacci 连锁合并示例，以及终局后 Undo／作弊交换是否可恢复和结算时点。不得在此票实现游戏。

## 验收标准

- [ ] 所有未定参数都有明确取值与至少一个具体例子；不再出现“实现时定”。
- [ ] 死局、限时到时、达标后继续、终局后操作与结算的先后关系可画成无歧义状态图。
- [ ] 更新 SPEC、计划与受影响 ADR；下游 ticket 可据此写确定性测试。

## 验证

人工对照 SPEC 第 5 节与原计划；确认每项已被明确决策。
