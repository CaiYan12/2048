# T39 静音行：带标签的开关（含对比度闸门多一幕）

- 状态：已完成（GitHub [#41](https://github.com/CaiYan12/2048/issues/41) 未在本阶段更新）
- 类型：vertical
- 原计划阶段：README TODO · 设置界面引入（第一刀）
- 父级规格：[`docs/specs/settings-drawer.md`](../specs/settings-drawer.md)（GitHub [#38](https://github.com/CaiYan12/2048/issues/38)）
- 裁决：[ADR-0010](../adr/0010-settings-drawer-is-shell-not-a-fifth-slot.md)（滑块换色那条算术）
- 本票对应：验收标准里「The sound row」那一组，以及三张设计卡 §12 的开关与底面颜色
- Blocked by: T37（GitHub [#39](https://github.com/CaiYan12/2048/issues/39)）

## 交付范围

声音开关从页脚那颗裸按钮搬进抽屉，变成一行：左边一个静态标签、右边一个开关。它按得动、
读屏软件念得出「音效，开关，开」、刷新之后还是静音。同时给对比度闸门**多一幕**——现有七幕里
没有一幕是抽屉开着的。

## 验收标准

- [x] 行是「左标签 + 右开关」：标签是静态可见文字（`<span id>`），可访问名由 `aria-labelledby`
      引用它，**不是**另写一份 `aria-label`；**不用 `<label>`**——那会让浏览器悄悄把点击转发进
      控件。
- [x] 开关是 `role="switch"` + `aria-checked`，可访问名不随状态变，**没有可见状态文字**。
- [x] 整行可点，而且是明写的、可测的意图，不是副产物。
- [x] 两态靠**滑块位置 + 轨道换色**说；滑块在 Material 与 Claude 的开态**换色**（Classic 恒一个
      色，因为它那块亮墨在两个轨道色上都过线）；轨道 2.25rem × 1.25rem、滑块 1rem、行程 1rem，
      **三套共用一套骨架**。
- [x] 逐套新增角色行：Classic **2 个**（`--switch-track` / `--switch-track-on`，滑块复用既有的
      亮墨）、Material **4 个**、Claude **4 个**；**三套一个新材料色值都没有**，新的只是角色名。
- [x] `data-mute` 仍是断言点、语义不变；`audio.spec.ts` 里关于旧控件自身文案的断言改成新行的，
      关于落盘值的断言**一行不改**——那个不对称本身就是「搬了控件、没动它的意思」的检查。
- [x] 对比度：开关的六条非文字条目，加上各套底面自身「标题 + 行标签」那几对入表；
      `check-contrast.mjs` 的 `SCENES` 与 `contrast-computed.spec.ts` 的 `setupScene`
      **两处各加一幕**（抽屉开着），否则「每一对都写着 e2e 认得的 scene / 每一幕都得有人量」
      那两条两向断言会炸。先例是 T26 的 milestone、T29 的 egg、T30 的 wish、T32 的 pinned。
- [x] 新条目在浏览器那一层按 probe 读得到计算样式，不是只声明。
- [x] `MuteToggle` 那条「名字随状态变所以不给 pressed」的注释**就地改写**成「标签改成静态之后，
      用 pressed 本来就是对的」——改写而不是删除，免得下一个人把旧模式恢复回来。
- [x] 既有契约一条都不许为它改绿。

## 验证

见父规格 Evidence 与 T40 的收官数字。静音行那一条对三套风格各跑一遍；对比度两处各加一幕
`settings`，`check:contrast` 到 **141 对**（T39 落地时是 141，本票复核通过）。

## Evidence

声音开关从页脚那颗裸按钮搬进抽屉、变成「左静态标签 + 右 `role="switch"`」的一行已落地并验收；
三套共用几何、逐套新增角色行、**一个新材料色值都没有**。对比度闸门两处各加一幕 `settings`
（`SCENES` 八幕）。`data-mute` 语义与落盘一字未改（`audio.spec.ts` 的那条断言未动）。
**人眼复核没做**（headless 约定，见 T40）。
