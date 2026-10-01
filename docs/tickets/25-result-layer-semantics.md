# T25 立起「结果层」术语与它的裁决记录

- 状态：本地实现与验收完成（GitHub #27 未在本阶段更新）
- 类型：decision gate
- 原计划阶段：README TODO · 成功与失败界面变更
- 父级规格：[结果层 spec](result-layer.md)（GitHub [#26](https://github.com/CaiYan12/2048/issues/26)）
- SPEC 用户故事：—（本票只立语义与裁决记录，行为由 T26 / T27 交付）
- Blocked by: none

## 交付范围

把「结果层」这个词立起来，并把「用半透明遮罩 + 不透明卡片取代不透明满盖」的那份裁决写成
ADR-0008；同步所有还在用旧词、旧说法的地方。**不碰任何产品代码。**

## 验收标准

- [x] ADR-0008 写清：为什么用半透明遮罩 + 不透明卡片取代不透明满盖，以及它如何回答原来那份
      「半透明会把棋盘上的方块透出来，只会让人以为还能动它」的理由；Decision / Consequences
      两节齐全，且写明这是一次**推翻**而不是一次新发展。
- [x] `CONTEXT.md` 新增「**结果层（Result layer）**」词条：三种非对局阶段共用的那一层，
      报出当前这一局的结果并给出去向；与 Toast 的区别写清（toast 是「不需要玩家处理的一句话」，
      结果层是「要你选一个方向的一层」）。`_Avoid_` 沿用 Board 条目已禁「面板」的口径，并说明
      「弹窗 / 通知」已被 Toast 条目花掉、不能拿来指它。
- [x] `docs/mode-contract.md` §3 的「胜利面板 / 可恢复面板 / 本局已结束」改为结果层措辞；
      **五条关键不变量与状态图一字不改**。
- [x] README TODO 该条题干就地修正：面板从来不遮挡整个画面——它遮挡的是棋盘，而且是不透明地
      遮挡；第二个 checkbox（达成目标块后继续游戏）标注为**现行已有行为**，不算待办。
- [x] `docs/SPEC.md` §5 冻结规则 3 附近加一句回指 ADR-0008；**冻结值一字不动**（不构成新裁决）。
- [x] `docs/tickets/README.md` 索引加入 T25–T27，父级规格指向结果层 spec。

## 验证

**自动验证**

- 全仓检索（`git grep`）：**本组新写与改写的正文里**，`面板`、`弹窗`、`通知`、`结算界面`
  不再被用来指这一层。这句话只说本组自己的文字，不说全仓——范围划清楚比一句做不到的
  大话有用：
  - **已清**：`CONTEXT.md` 新词条、`mode-contract.md` §3 与下游表、`README.md` 该节、
    `SPEC.md` 回指句、`App.tsx` / `useGameStore.ts` / `GameOverPanel.tsx` /
    `ResultPresence.ts` / `ResultLayer.tsx` / `TileMotion.ts` 里本组新写或改写的注释与
    用例名、三处 `styles.css` 注释、三张设计卡 §6。
  - **刻意留下不动**（四条，逐条有理由）：
    ① `.overlay` 类名、`data-panel` / `data-result-tier` 测试钩子——改名会牵动一大批
    既有断言，而钩子不是散文；
    ② 记分卡的 `.panel` 类名——那是另一个东西；
    ③ **历史文档**（`primal-setup-plan.md`、`2048-execution.md`、已关闭的 T15 / T21 票据）
    与**已存在用例名**（`tile-motion.spec.ts:1017`「胜利面板在三套风格都覆盖整块棋盘」）——
    它们是当时的记录，改写旧档等于篡改历史，且那条用例的断言至今成立（层确实还盖着棋盘）；
    ④ `src/game/engine.ts` 与 `docs/SPEC.md` §5 冻结规则 3 的既有措辞——前者按架构铁律
    本就不该引用呈现层词汇（要改是另一张票），后者是冻结文本，本次只加一句回指。
- `git grep` + `git diff` 证明 `docs/mode-contract.md` §3 的五条不变量与状态图除盒标签
  「（可恢复面板）」→「（可恢复状态）」外字节级未变；箭头、标识符、补订注正文一概未动。

**人工核对**

- ADR-0008 读起来能让一个第一次看到半透明遮罩的人明白「为什么不透明」，而不只是「现在是半透明」。

## Evidence

2026-10-01：本票落地，未碰任何产品代码（`git status --short -- src tests package.json
tsconfig*.json playwright.config.ts vite.config.ts` 为空）。ADR-0008 新建；`CONTEXT.md`
末尾新增 `### 结果层` 小节（紧贴 Toast，便于两词条相互呼应 `_Avoid_`）；`mode-contract.md`
§3 三处措辞 + 状态图一个盒标签 + 对下游表两格；README 整节改写并顺势把「What's here now」
表的 ADR 计数从 Five 改成 Eight（0006、0007 当时就没更新这个数，本票加了第八份）；
SPEC §5 只加一句回指。
