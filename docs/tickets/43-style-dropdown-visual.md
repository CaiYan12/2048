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

## Evidence（实现回填 · 2026-10-12 · 提交 `a7b03fa`，分支 `t43`）

**四道闸门**：typecheck 0 错 · unit **920 / 50**（与基线同数，本票不改纯逻辑）·
`npm run build` 通过 · `check:contrast` **3 风格 150 对**（对数与基线相同——三套各**两对原地
改写**：选项文字对改菜单面口径、聚焦对从文字口径改成 `ring` 口径；无新增对、无删除对。
所有 `ratio` 用 `scripts/check-contrast.mjs` 的 `contrastRatio` 复算，无手算）。

**目标 e2e**（`settings-style-row` + `settings-drawer` + `contrast-computed`，后台 headless）：
**184 passed**（基线 172 + 本票新增 6 个用例 × 2 视口）。
**全量 Playwright**（后台 headless）：**886 passed / 14 skipped / 0 failed**（票据基线
874 / 0 / 14；+12 即新增用例，skip 数不变——14 个是套件既有的条件跳过，本票未加也未减）。

**逐套实测**（`getComputedStyle` 读渲染值，比值用 `contrastRatio` 复算）：

| | Classic | Material | Claude |
|---|---|---|---|
| 菜单面 | `#5f564e`（`--control-bg-hover`，≠ 抽屉面 `#6f6055`） | `#d8cee8`（`--control-bg-hover`，≠ 抽屉面 `#e8def8`） | `#f0eee6`（`--page`，≠ 抽屉板面） |
| 选项文字 vs 菜单面 | 6.66 | 11.35 | 13.35 |
| 边界 | 1px `--ink-bright` 发丝线 | 投影 M3 level 4（最大模糊 10px > 抽屉 8px，且与抽屉不同串） | 1px `--control-border`（≠ 抽屉 `--rule`） |
| 圆角（toast 档） | `--cell-radius` 6px | `--cell-radius` 12px | `--board-radius` 4px |
| 聚焦环 | 内缩 `box-shadow` `#f9f6f2`：菜单面上 6.66、选中底上 8.90 | `--focus` `#625b71` 3px outline（盒外侧）：菜单面上 4.28 | `--focus` `#a8482b` 3px outline（盒外侧）：菜单面上 4.98 |

**核心场景**（展开那一刻焦点落选中项）：三套都实测到「选中底 + 聚焦环」同时成立且可辨——
Classic 内缩环压在选中底上（8.90），Material / Claude 外侧环绕着选中底；ArrowDown 移到非选中项
时环在、选中底不在（e2e 逐套断到）。

**T42 断言的变动清单**（没有一条为变绿而放松）：
- `tests/unit/contrast.test.ts`：Claude 暖色对 7 → 8——T43 把「菜单聚焦环」那一对并入暖色表
  （同色值、新角色位），断言值随实现改，理由写在注释里。
- `tests/e2e/contrast-computed.spec.ts`：`restingRings` 过滤器加 `expandList !== true` 排除——
  T43 环对的选择器是 `:focus` 而非 `:focus-visible`，会被扫进「静止态」批，而那一批跑在列表
  收起之后（`页面上找不到这个元素`）。这是筛选完备性修复，不是放松断言。
- `tests/e2e/settings-style-row.spec.ts`：只新增用例（逐套「选择框形状」「菜单面与聚焦环」
  两组），T42 原有行为断言全保留；运行中修掉两处**本票新测试自己的笔误**（chevron 的 `stroke`
  属性写在 `<svg>` 上却从 `<path>` 读；「下一个非选中项」误用 `.first()`，激活 Material 时
  答案应是目录里的下一套）。

**与设计卡的出入（报告，不自行改卡）**：三张卡 §12 都写聚焦环「内缩」，但 Material / Claude 的
`--focus` 压在各自选中底上实测 **1.0019 / 1.0000**（Claude 是与选中底同色），字面内缩的环在
选中项上不可见——违反本票验收标准「环 ≠ 选中底的视觉」「同时成立且可辨」与卡自己的「两态机制
不同、永不相撞」。实现取**验收标准优先**：Classic 保内缩（亮墨环在两种底上都够：6.66 / 8.90，
且内缩不会探出选项盒与相邻项相叠），Material / Claude 用卡里同款的「`--focus` 3px outline」
画在选项盒**外侧**、落在菜单面上（4.28 / 4.98，均过非文字 3:1）。是否回改设计卡请所有者裁定。

**未验**：人眼复核没做（三套 × 桌面 / 手机下触发钮、菜单面、聚焦环与选中底的并排观感只能由人
看）；真实浏览器窗口未开（约定只准 headless）。

**环境坑（复跑者注意）**：WorkBuddy safe-delete shim 会间歇拦 `dist` 删除，Playwright 的
webServer 构建随即失败——每次跑 e2e / build 前先 `cmd //c rmdir /s /q dist`（Git Bash 里参数要
写双斜杠，否则 MSYS 把 `/q` 转成 `Q:`）。
