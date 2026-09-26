# T04 交付胜利、死局与新游戏路径

- 状态：已发布，待执行；GitHub [#5](https://github.com/CaiYan12/2048/issues/5)
- 类型：vertical
- 原计划阶段：P2–P3
- SPEC 用户故事：6–7
- Blocked by: T03

## 交付范围

在规则状态、Store 与界面贯通目标达成、继续玩、死局、结算原因及新游戏；提供 WinPanel 与 GameOverPanel。

## 验收标准

- [ ] 首次达到目标只显示一次胜利状态；继续玩保留分数和棋盘。
- [ ] 四方向皆无合法 Move 时显示死局；新游戏不沿用旧局面。
- [ ] 确定性单测与 e2e 覆盖胜利继续、死局和重开。

## 验证

`npm test`、Playwright 终局路径、桌面浏览器人工复核。
