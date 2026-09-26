# T17 按结算风格写入记录并展示统计

- 状态：已发布，待执行；GitHub [#18](https://github.com/CaiYan12/2048/issues/18)
- 类型：vertical
- 原计划阶段：P6–P7
- SPEC 用户故事：21–22
- Blocked by: T04, T13, T16

## 交付范围

贯通 run settlement、`records[mode][style]`、基础 stats 和 StatsPanel；达标后继续玩的胜局标志保留到结算。

## 验收标准

- [ ] 切换风格本身不写记录；结算时仅当前风格的记录变化。
- [ ] 最高分、最高 Tile、总局数、胜局数和时长按规则更新，新游戏放弃未结算局不记记录。
- [ ] 浏览器可按模式和风格查看结果；单测/e2e 覆盖切风格后结算。

## 验证

确定性结算单测及 Playwright 记录/统计流程。
