# Tickets 索引

> 状态：已发布到 [GitHub Issues](https://github.com/CaiYan12/2048/issues)，父级规格为 [#1](https://github.com/CaiYan12/2048/issues/1)。需求依据为 [SPEC](../SPEC.md)；原计划仍提供 P0–P10 的主题分组。每份 ticket 的验收标准独立可检查，`Blocked by` 已写入正文并建立 GitHub 原生依赖。T01 是产品规则决策闸门，T02 是工具链使能票；其余实施票按纵向交付行为拆分。

| Ticket | 可交付行为 | 原阶段 | Blocked by |
| --- | --- | --- | --- |
| [T01](https://github.com/CaiYan12/2048/issues/2) · [本地](01-freeze-rule-contract.md) | 固化模式示例与结算边界 | P1 | none |
| [T02](https://github.com/CaiYan12/2048/issues/3) · [本地](02-bootstrap-app.md) | 建立可运行、可检查的空壳应用 | P0 | none |
| [T03](https://github.com/CaiYan12/2048/issues/4) · [本地](03-classic-playable.md) | 交付可移动和计分的 Classic 纵向切片 | P1–P2 | T01, T02 |
| [T04](https://github.com/CaiYan12/2048/issues/5) · [本地](04-run-endings.md) | 交付胜利、死局与新游戏路径 | P2–P3 | T03 |
| [T05](https://github.com/CaiYan12/2048/issues/6) · [本地](05-fibonacci-mode.md) | 交付 Fibonacci 模式 | P1 | T01, T03 |
| [T06](https://github.com/CaiYan12/2048/issues/7) · [本地](06-big-board-mode.md) | 交付 Big Board 模式 | P1 | T01, T03 |
| [T07](https://github.com/CaiYan12/2048/issues/8) · [本地](07-walls-mode.md) | 交付 Walls 模式 | P1 | T01, T03 |
| [T08](https://github.com/CaiYan12/2048/issues/9) · [本地](08-daily-mode.md) | 交付 UTC Daily 模式 | P1 | T01, T03 |
| [T09](https://github.com/CaiYan12/2048/issues/10) · [本地](09-time-attack-mode.md) | 交付 Time Attack 模式 | P1–P3 | T01, T04 |
| [T10](https://github.com/CaiYan12/2048/issues/11) · [本地](10-touch-controls.md) | 交付触屏滑动和方向按钮 | P3 | T03 |
| [T11](https://github.com/CaiYan12/2048/issues/12) · [本地](11-unlimited-undo.md) | 交付无次数上限的撤销 | P3 | T01, T03, T04 |
| [T12](https://github.com/CaiYan12/2048/issues/13) · [本地](12-cheat-swap.md) | 交付可撤销的作弊交换 | P4 | T01, T07, T11 |
| [T13](https://github.com/CaiYan12/2048/issues/14) · [本地](13-style-system-material.md) | 用 Material 交付第一条完整风格切换路径 | P5 | T03 |
| [T14](https://github.com/CaiYan12/2048/issues/15) · [本地](14-font-contrast-gate.md) | 补齐字体切换与风格对比度验收 | P5 | T13 |
| [T15](https://github.com/CaiYan12/2048/issues/16) · [本地](15-claude-style.md) | 交付 Claude Design 风格 | P5 | T14 |
| [T16](https://github.com/CaiYan12/2048/issues/17) · [本地](16-resume-session.md) | 保存并恢复设置与当前一局 | P6 | T08, T09, T11, T12, T13 |
| [T17](https://github.com/CaiYan12/2048/issues/18) · [本地](17-records-stats.md) | 按结算风格写入记录并展示统计 | P6–P7 | T04, T13, T16 |
| [T18](https://github.com/CaiYan12/2048/issues/19) · [本地](18-mode-achievements.md) | 交付九个模式轴成就 | P7 | T05, T06, T07, T08, T09, T17 |
| [T19](https://github.com/CaiYan12/2048/issues/20) · [本地](19-style-traveler.md) | 交付风格旅行者成就 | P7 | T15, T17, T18 |
| [T20](https://github.com/CaiYan12/2048/issues/21) · [本地](20-procedural-audio.md) | 交付可静音的程序化音效 | P8 | T03, T16 |
| [T21](https://github.com/CaiYan12/2048/issues/22) · [本地](21-tile-motion.md) | 交付方块动效与静态替代 | P9 | T14, T15 |
| [T22](https://github.com/CaiYan12/2048/issues/23) · [本地](22-accessibility-acceptance.md) | 完成键盘、触屏与屏幕阅读器验收 | P10 | T09, T10, T12, T19, T20, T21 |
| [T23](https://github.com/CaiYan12/2048/issues/24) · [本地](23-style-matrix-acceptance.md) | 完成全部模式 × 风格的浏览器矩阵验收 | P5、P10 | T05, T06, T07, T08, T09, T15, T22 |
| [T24](https://github.com/CaiYan12/2048/issues/25) · [本地](24-publish-pages.md) | 完成 CI 闸门、README 与 Pages 发布验收 | P10 | T16, T17, T18, T19, T20, T21, T22, T23 |
| [T25](https://github.com/CaiYan12/2048/issues/27) · [本地](25-result-layer-semantics.md) | 立起「结果层」术语与它的裁决记录 | README TODO | none |
| [T26](https://github.com/CaiYan12/2048/issues/28) · [本地](26-result-layer-scrim.md) | 交付结果层的两件套与卡片读数 | README TODO | T25 |
| [T27](https://github.com/CaiYan12/2048/issues/29) · [本地](27-result-layer-motion.md) | 交付结果层的进出动效并跑完全量验收 | README TODO | T26 |
| [T28](https://github.com/CaiYan12/2048/issues/31) · [本地](28-shenmo-semantics.md) | 立起「一念神魔」的术语与它的裁决记录 | README TODO · 彩蛋 | none |
| [T29](https://github.com/CaiYan12/2048/issues/32) · [本地](29-shenmo-code.md) | 神魔码与抉择：口令被旁听到，A/B 现身，三个结局都走得通 | README TODO · 彩蛋 | none |
| [T30](https://github.com/CaiYan12/2048/issues/33) · [本地](30-shenmo-wish.md) | 一念的奖品与礼炮 | README TODO · 彩蛋 | T29 |
| [T31](https://github.com/CaiYan12/2048/issues/37) · [本地](31-shenmo-words.md) | 彩蛋的那几行字：卡片附加行两处用法、败局墓志铭，以及四颗成就各自的梗 | README TODO · 彩蛋 | T29 |
| [T32](https://github.com/CaiYan12/2048/issues/34) · [本地](32-shenmo-second-pass.md) | 二念：扣下棋盘与顶端那条悬顶 | README TODO · 彩蛋 | T29, T31 |
| [T33](https://github.com/CaiYan12/2048/issues/35) · [本地](33-shenmo-dim-clock-sound.md) | 堕落染墨、时之狭与两声 | README TODO · 彩蛋 | T29 |
| [T34](https://github.com/CaiYan12/2048/issues/36) · [本地](34-shenmo-contract-gates.md) | 彩蛋的浏览器契约与全量闸门 | README TODO · 彩蛋 | T30, T31, T32, T33 |
| [T37](https://github.com/CaiYan12/2048/issues/39) · [本地](37-settings-drawer-open-block-close.md) | 设置抽屉能开能关：整页被拿走，关掉回到原处 | README TODO · 设置界面引入 | none |
| [T38](https://github.com/CaiYan12/2048/issues/40) · [本地](38-settings-drawer-motion.md) | 抽屉的进出动效：250 / 200ms + 一条抽屉曲线 | README TODO · 设置界面引入 | T37 |
| [T39](https://github.com/CaiYan12/2048/issues/41) · [本地](39-settings-drawer-sound-row.md) | 静音行：带标签的开关（含对比度闸门多一幕） | README TODO · 设置界面引入 | T37 |
| [T40](https://github.com/CaiYan12/2048/issues/42) · [本地](40-settings-drawer-contract-gates.md) | 共享契约、四处修订与全量验收 | README TODO · 设置界面引入 | T38, T39 |
| [T41](https://github.com/CaiYan12/2048/issues/43) · [本地](41-narrow-viewport-overflow.md) | 窄视口横向溢出：棋盘 + 页边距把 320 撑到 328 | T37 审查的复核发现 | — |

执行时先完成无阻塞的 T01 与 T02，再从依赖已关闭的 ticket 中选择。T03 是第一个可玩纵向切片；T13 用 Material 证明可在局中切换，T15 交付第三套 Claude 风格。T23 验收 6 × 3 = 18 组合，T24 才发布。本次未列入的九套特色风格保留在 [README TODO](../../README.md#todo远期规划)。

T25–T27 是 **README TODO「成功与失败界面变更」** 这一组，父级规格是结果层 spec（[#26](https://github.com/CaiYan12/2048/issues/26)），与上表 P 阶段那一套无关。它们是线性链：T25（术语与裁决记录，无阻塞）→ T26（两件套与读数）→ T27（动效与全量验收）。

T28–T34 是 **README TODO「彩蛋」** 这一组，父级规格是一念神魔 spec（[#30](https://github.com/CaiYan12/2048/issues/30)）。形状与上两组都不同：**两张根票并行**（T28 只动字、T29 只动码，文件域故意错开），T29 一落地则 T30 / T31 / T33 三路并行，T32 等 T31 的 `note` 字段，T34 收口。裁决记录是 ADR-0009——彩蛋是**共享外壳而不是第四个呈现插槽**，与 ADR-0008 对结果层的同一裁决。注意 issue 号与票号在这一组**不同序**（T31 是 #37、T32–T34 是 #34–#36）：T31 是拆票过程中新开的，编号按创建顺序而非拓扑顺序。

T37–T40 是 **README TODO「设置界面引入」** 这一组的**第一刀**（抽屉外壳 + 把已有的静音开关搬进去），父级规格是设置抽屉 spec（[#38](https://github.com/CaiYan12/2048/issues/38)），裁决是 ADR-0010。形状与前三组都不同：**没有单独的语义根票**——T25 / T28 那种「只动字的术语与裁决票」在这一组是**父规格落笔时一并做完的**（ADR-0010、三处 ADR 互引、`GLOSSARY.md` 的「设置」与「二念」两处修订、以及 SPEC 自己那四处修订都已在库里），所以这一组直接从实现开始。T37 无阻塞；**T38 与 T39 只被 T37 阻塞、两条可并行**（动效与内容互不相干）；T40 等两者都完成才收口。这一组的其余六条（预设 / 风格搬家 / 音乐 / 逐事件音效 / 上帝模式 / 语言）**不在本次**；风格搬家会单独成票——它是搬家不是新能力，但一动就要改 16 个 e2e 规范里取风格按钮的那套助手。

远端按拓扑顺序创建了 **39** 张票，加 **4** 张父级规格 issue（共 43 个 issue），原生依赖按拓扑顺序建立；**截至 2026-10-09 仍打开的门共 2 条**（阻塞票一关闭，那条边就不再计入——所以这个数只说明「现在卡在哪」，不是「一共连了多少条」）。T25–T27、T37–T40 均标记 `ready-for-agent`；T01 标记 `ready-for-human`，规则选择需先由项目所有者确认。后续关闭 blocker 时，再按真实依赖状态更新可执行标签；不要把父级 SPEC issue 当作子票完成状态。
