# T21 交付方块动效与静态替代

- 状态：本地实现与验收完成；GitHub [#22](https://github.com/CaiYan12/2048/issues/22) 未在本阶段更新
- 类型：vertical
- 原计划阶段：P9
- SPEC 用户故事：24、27
- Blocked by: T14, T15

## 交付范围

基于 Tile 稳定身份实现移动连续、生成入场、合并脉冲和胜利序列；逐项设计 reduced-motion 静态替代。

## 验收标准

- [x] 滑动、生成、合并和胜利的视觉反馈与实际状态一致，无重复 Tile 或瞬移。
- [x] `@starting-style` 仅用于适用的入场，其他动作采用合适的 CSS 过渡/动画。
- [x] reduced-motion 下无位移动画但状态和操作完整。

## 验证

**自动验证**

- `npm test`：738 项通过。
- `npm run typecheck`：通过。
- `npm run build`：通过；Playwright 构建预览也成功启动。
- `tests/e2e/tile-motion.spec.ts`：39 项通过、1 项按预期跳过；最后一次清理后，胜利标题、三风格面板和 reduced-motion 的定向用例 6 项通过（桌面与 Pixel 5 仿真）。

**浏览器与绘制帧复核**

- 本机 `http://localhost:5173/2048/` 可访问；无头 Chromium 的绘制帧复核覆盖 Classic、Material、Claude × 普通/reduced-motion 六种组合。胜利标题没有淡入前的全显帧，透明度单调到达 1；动画各开始、结束一次，无取消或浏览器错误。
- 另以绘制帧复核合并载体、移动、生成与脉冲；30ms 连按、撤销、无效 transition 兜底均未留下卡住的缩放或幽灵脉冲。
- 此处手机结果为 Pixel 5 浏览器仿真，不代表实体手机测试。GitHub #22 的关闭状态未由本地验收替代。

## 已接受的运动取舍

- 合并脉冲的 80ms 是两段 CSS scale transition 的时长总和（各 40ms），不是端到端墙钟时长。浏览器实测总包络约 130–160ms，额外时间来自 `transitionend` 后的 React 阶段提交；该差异已记录，不作为 80ms 实时保证。
- 三套风格共用 150ms + 内置 `ease-out`。旧曲线分别出现首帧突跳和起步迟滞；共享曲线是已接受的稳定性取舍。
- 胜利标题在首次渲染时直接附着 keyframe；不要添加 `requestAnimationFrame` 状态门控，否则可见基础态会先绘制一帧再闪隐。标题基础态保持可见，并保留 180ms 时长兜底。
