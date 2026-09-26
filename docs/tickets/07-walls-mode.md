# T07 交付 Walls 模式

- 状态：已发布，待执行；GitHub [#8](https://github.com/CaiYan12/2048/issues/8)
- 类型：vertical
- 原计划阶段：P1
- SPEC 用户故事：10
- Blocked by: T01, T03

## 交付范围

使用已固化四格图案贯通模式声明、障碍分段移动、固定障碍呈现和模式选择。

## 验收标准

- [ ] Wall 永不移动、合并或生成 Tile，移动轨道被 Wall 正确分段。
- [ ] 开局可玩；障碍与数值 Tile 在键盘和视觉上可区分。
- [ ] 单测覆盖 Wall 两侧滑动/合并/死局，Playwright 可游玩并看到四格图案。

## 验证

确定性单测与桌面/手机 e2e。
