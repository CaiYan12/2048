# T20 交付可静音的程序化音效

- 状态：已发布，待执行；GitHub [#21](https://github.com/CaiYan12/2048/issues/21)
- 类型：vertical
- 原计划阶段：P8
- SPEC 用户故事：23
- Blocked by: T03, T16

## 交付范围

在移动、合并、胜利和失败事件中使用 WebAudio 实时合成不同音色，音高随 Tile 数值变化；提供持久化 mute 控件。

## 验收标准

- [ ] 首次用户手势前不创建 AudioContext；仓库不增加音频文件。
- [ ] mute 后不触发可听输出，刷新后保持 mute；音效不改变规则状态。
- [ ] 浏览器验证常见事件的发声与静音切换。

## 验证

浏览器事件验证、Playwright mute 状态与仓库资产检查。
