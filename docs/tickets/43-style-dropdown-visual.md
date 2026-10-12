# T43 · 风格下拉框的视觉修订：chevron、逐套菜单面、聚焦用环

**Parent**: `docs/specs/style-picker.md`（GitHub [#44](https://github.com/CaiYan12/2048/issues/44)）·
T42（#45，已落地）的**人眼复核驳回** · 2026-10-12 两轮 grilling 定案
**Blocked by**: 无。**GitHub**: #46。**状态**: ready-for-agent

## 背景：为什么有这一票

T42 交付的自绘 listbox 在行为上全绿，但所有者人眼复核判定：**「不符合下拉框准则」**。三条实证：
① 触发钮没有任何指示符（全仓 grep `chevron/▾` 零命中），不按就不知道能展开；② 菜单底色与抽屉面
在三套里**逐字节同值**（各自 §12 的表就是这么写的）且无边框、无投影、无圆角——菜单读作「一行
变三行」而不是「一层浮上来」；③ 三套各自的空间语言（Material 的 elevation、Claude 的细线、
Classic 的纯平实底）在菜单上全部缺席。

## 交付范围

从玩家角度：触发钮变成**选择框的形状**（占满行宽、风格名靠左、chevron 靠右），按下弹出的菜单
是一块**有边界的浮层**——三套各自说自己「在上」的话；聚焦的选项用**环**标出，选中的选项用
**底色**标出，两者永不混淆。行为契约（焦点进列表、箭头循环、三层 Esc、整行可点）**不变**。

逐项（细节以父规格修订后的决策 3 / 14 与三张设计卡 §12「风格选择（T42 · T43 修订）」为准）：

- **触发钮**：`flex: 1` 占满剩余行宽；风格名靠左；**chevron** 靠右（内联 SVG 走
  `currentColor`，与齿轮同路子，`flex: none` 钉右侧），列表开着时旋转 180°（transform）。
- **菜单面（逐套换一档，全都不是新色值）**：Classic / Material `--control-bg-hover`；
  Claude `--page`。
- **菜单的边界（逐套各自语言）**：Classic = 1px `--ink-bright` 发丝线；Material = 投影比抽屉
  **高一档**（toast 先例的 elevation 路子，抽屉那一档在 §12 抽屉段）；Claude = 1px
  `--control-border` 细线（比抽屉的 `--rule` 重一档）。
- **圆角**：逐套取各自 toast 那一档（Classic `--cell-radius` / Material `--cell-radius` /
  Claude `--board-radius`）。
- **聚焦 = 环、选中 = 底**（修订父规格决策 14）：聚焦的选项用各套焦点语言的内缩环
  （Classic = 内缩亮墨 `box-shadow`；Material / Claude = `--focus` 内缩 outline）；选中项照旧
  `--control-bg-selected` + 亮墨。**现状「聚焦选项 `outline: none` + hover 底」整条作废**——
  hover 底已被菜单面占用，且 Classic 只有两档暗色，第三档不存在。
- **不动**：开合仍无动画（决策 10 不变）；三层 Esc、焦点进列表、整行可点、注册表选项、
  `data-style-*` 断言点、`pickStyle` 助手路径全不动。

## 验收标准

**触发钮**
- [ ] 占满行宽（`flex: 1`）：风格名靠左、chevron 靠右；chevron 是内联 SVG 且颜色跟随按钮文字色
      （`currentColor`），三套各自读得对。
- [ ] chevron 在列表开着时旋转 180°、关着时归位（transform，不碰布局）；`aria-expanded` 语义不变。

**菜单面与边界（三套逐套断计算样式）**
- [ ] 菜单底色逐套换档：Classic/Material `--control-bg-hover`、Claude `--page`——**不等于**抽屉面。
- [ ] 边界逐套：Classic 1px `--ink-bright` 发丝线；Material 有投影且比抽屉高一档；Claude 1px
      `--control-border` 细线（比抽屉的 `--rule` 重）。
- [ ] 圆角逐套 = 各自 toast 那一档；菜单仍绝对定位于触发钮下方、盖住内容不推布局。

**聚焦与选中**
- [ ] 聚焦的选项显示**环**（内缩，逐套各自焦点语言），且环 ≠ 选中底的视觉（两态机制不同）。
- [ ] 选中的选项仍是 `--control-bg-selected` + 亮墨；焦点落在选中项上时环与选中底**同时成立
      且可辨**（这是本票的核心场景：打开列表那一刻焦点就在选中项上）。
- [ ] 「聚焦选项 `outline: none`」的旧规则已移除。

**行为不变（回归）**
- [ ] T42 的 `settings-style-row.spec.ts` 契约**不因本票改行为**而放松——原有断言该保留的保留，
      该更新的（读菜单计算样式的）逐条说明为什么。
- [ ] 三层 Esc、箭头循环 + Home/End、Enter 选中收列表回焦、Tab 收列表、换肤不丢焦点：全部照旧全绿。

**闸门**
- [ ] typecheck 0 错；`npm test` 全绿（**基线 920 / 50**，本票不改纯逻辑，数不变）；
      `npm run build` 通过。
- [ ] `check:contrast`：菜单新面带来的新对**两层一起动**（三套 `contrast.json` 声明 + 计算样式侧
      的量法——菜单面换了，`settings` 幕里那些对的 `background` 与 `ratio` 要跟着换；聚焦环若走
      `ring` 探针的路子也要两层同步）。`ratio` 一律用 `contrastRatio` 复算，**不许手算**。
      新对数以实际声明为准并在报告里给出。
- [ ] 目标 e2e 后台 headless 全绿：`settings-style-row.spec.ts` + `settings-drawer.spec.ts` +
      `contrast-computed.spec.ts`。

**文档**
- [ ] 父规格决策 3 / 14 的修订段**已由本票的父文档落笔**（2026-10-12 `(amended …)` 标记）——
      实现者不许再改规格。
- [ ] `AGENTS.md` 设置节补一行 T43 状态（照既有体例）。README 不动（T42 已勾的风格条描述仍成立）。

## 基线（2026-10-12，`main` = `e87b222`）

typecheck 0 错 · unit **920 / 50** · build ✓ · 闸门 **3 风格 150 对** · 全量 e2e
**874 passed / 0 failed / 14 skipped** · dev 服务器 5173 在跑（所有者人眼复核用）。

## 硬约束

- **只在 `t43` 分支上提交。不许碰 `main`、不许 push、不许关或改任何 GitHub issue 或 PR**
  （关 #46 由所有者验收后进行）。
- **不许改**规格、票据、ADR、`GLOSSARY.md`、三张设计卡——它们已由所有者裁定（本票的 §12 修订
  段就是判据）。发现矛盾就**报告**，不要自行决定。
- Playwright **只准后台跑、一律 headless**：不许 `--headed` / `--debug` / `--ui`，不许开
  trace viewer / HTML report / codegen，**不许用任何会开真实浏览器窗口的 MCP** 或 Puppeteer。
- 单测环境是 node，**不用** `@testing-library/react`。
- 本机 `core.autocrlf=true`：别在断言里写死带 `\n` 的 CSS needle。
- **假时钟用例必须 `install()` 之后立刻 `pauseAt()`**（`.codex/memories/e2e-debt.md` 第四节）。
- 红的旧断言先取基线再谈回归；不许为变绿放松断言。整块替换 CSS 规则时**逐行核对保留行**
  （T42 修复轮的前科：替换块漏了一行 `border-radius`，被自己的守卫抓住）。
- 环境注意：WorkBuddy safe-delete shim（genie-trash）会间歇拦删除——用 `cmd //c rmdir /s /q`。

## 流程

工作树 `.claude/worktrees/t43`（分支 `t43`，基线 = `main`）。实现 → 独立审查（新眼睛，自己重跑
闸门与 e2e、逐套量菜单面与环）→ 审查通过后 `merge --no-ff` 进 `main`（单票一刀，无集成分支）。
票据 Evidence 在实现票内回填。
