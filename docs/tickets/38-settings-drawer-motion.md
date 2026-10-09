# T38 设置抽屉的进出动效

- 状态：未开始（GitHub [#40](https://github.com/CaiYan12/2048/issues/40)）
- 类型：vertical
- 原计划阶段：README TODO · 设置界面引入（第一刀）
- 父级规格：[`docs/specs/settings-drawer.md`](../specs/settings-drawer.md)（GitHub [#38](https://github.com/CaiYan12/2048/issues/38)）
- 裁决：[ADR-0010](../adr/0010-settings-drawer-is-shell-not-a-fifth-slot.md)（动效那两条裁决）
- 本票对应：验收标准里「Motion」那一组
- Blocked by: T37（GitHub [#39](https://github.com/CaiYan12/2048/issues/39)）

## 交付范围

抽屉开始滑进来而不是跳出来，而且**退场由动画的结束事件驱动，不是一个定时器**。新增一台纯函数
机器回答「这一层此刻在不在场上」——挂载不等于打开，因为退场要比关闭多活一段动画；形状照结果层
在场模块与彩蛋 fall 模块。两个值在一处声明，并各自标注属于哪一类手势。

## 验收标准

- [ ] 进场 **250ms**、退场 **200ms**、曲线 **`cubic-bezier(0.32, 0.72, 0, 1)`**；两个值都在
      共享外壳里声明，并在同一处写明**作用域只到抽屉与将来同类的整页层**（理由归 ADR-0010）。
- [ ] 退场的终点是 `animationend`，不是 `setTimeout`——装假时钟的用例不会把抽屉钉在开着。
- [ ] `data-settings-leaving` 与开合状态在**同一次提交**落到 DOM，于是第一帧就把指针还回去
      （T37 的那条验收在这一票之后仍然成立）。
- [ ] 退场那一帧起整块不再接指针。
- [ ] reduced-motion：撤掉位移、只留淡入淡出，**两个时长不变**。
- [ ] **结果层与彩蛋菜单的 150ms 值一个字节都没变**——这一条是「作用域没有漏」的检查，
      不是修辞。
- [ ] 那台纯机器有 node 单测（无浏览器、无 React），先例是结果层与彩蛋两个在场模块的单测。
- [ ] 既有契约一条都不许为它改绿。

## 验证

未做。

## Evidence

未做。
