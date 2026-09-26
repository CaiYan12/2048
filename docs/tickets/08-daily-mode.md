# T08 交付 UTC Daily 模式

- 状态：已发布，待执行；GitHub [#9](https://github.com/CaiYan12/2048/issues/9)
- 类型：vertical
- 原计划阶段：P1
- SPEC 用户故事：11
- Blocked by: T01, T03

## 交付范围

贯通 UTC 日期到种子、可恢复的 PRNG 进度、Daily 入口与日期说明。

## 验收标准

- [ ] 相同 UTC 日期与输入序列得到相同初始及后续棋盘；时区变化不改变结果。
- [ ] UTC 零点后的新局使用新题，已开始的一局保持原种子。
- [ ] 单测覆盖日期边界与确定性序列，Playwright 能选择和游玩 Daily。

## 验证

以注入时间做单测；浏览器验证日期标签与玩法。
