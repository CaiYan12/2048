# T21 交付方块动效与静态替代

- 状态：已发布，待执行；GitHub [#22](https://github.com/CaiYan12/2048/issues/22)
- 类型：vertical
- 原计划阶段：P9
- SPEC 用户故事：24、27
- Blocked by: T14, T15

## 交付范围

基于 Tile 稳定身份实现移动连续、生成入场、合并脉冲和胜利序列；逐项设计 reduced-motion 静态替代。

## 验收标准

- [ ] 滑动、生成、合并和胜利的视觉反馈与实际状态一致，无重复 Tile 或瞬移。
- [ ] `@starting-style` 仅用于适用的入场，其他动作采用合适的 CSS 过渡/动画。
- [ ] reduced-motion 下无位移动画但状态和操作完整。

## 验证

Playwright 动效状态及 reduced-motion 用例、真实浏览器截图/录屏复核。
