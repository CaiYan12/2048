# T44 · 风格下拉框的态：拆环拆选中块，只留两档底色

**Parent**: `docs/specs/style-picker.md`（GitHub [#44](https://github.com/CaiYan12/2048/issues/44)）·
T43（#46，已落地）的**人眼复核第二条 BLOCK** · 2026-10-12 两轮 grilling 定案
**Blocked by**: 无。**GitHub**: #47。**状态**: ready-for-agent

## 背景：为什么有这一票

T43 交付后所有者人眼复核：**「大矩形方块观感尤为不适，不要。均改为仅选项的底色变化，hover、
active 都有态」**。实证来源（T43 落地的三处重态）：① 选中态整行填充（Material `#6750a4` 饱和
紫块 / Claude `#a8482b` 陶土块 / Classic `#4a443f` 深棕块）；② 聚焦环（Material/Claude 3px
outline 画在选项盒外侧——每枚选项各套一个方框；Classic 2px 内缩亮框）。

grilling 两轮定案（含一次算术摊牌）：三态分色需要每套四个可辨底色，而 Classic 整条暗 ramp 只有
三个值、Material 浅步只有三个——**选中不单独标**（所有者裁）。最终态：**所有环与选中块全部
拆除，列表态只用底色，hover 与键盘聚焦各一档、两档分净**。

## 交付范围

从玩家角度：菜单是一列干净的行——指到哪行、哪行亮一档底色（鼠标 hover 与键盘聚焦各一档，
两档不同）；没有描边、没有外框、没有彩色大块；当前风格不靠列表里的色块标（触发钮的名字报着
它，打开列表时焦点就落在它身上，读屏软件照旧念「已选中」）。

逐项（细节以父规格修订后的决策 14 与三张设计卡 §12「风格选择（T42 · T43 · T44 修订）」为准）：

- **拆**：三套 options 上所有的环与外框（Classic 的 `box-shadow: inset 0 0 0 2px`、Material /
  Claude 的 3px `outline` + `outline-offset`）与选中态整行填充（`[aria-selected]` 的
  `background`）——**全部移除**。
- **两档底色（逐套从既有 ramp 取，零新色值）**：
  - Classic：hover = `--control-bg` `#6f6055`（亮一步）、聚焦 = `--focus` `#4a443f`（暗一步）；
  - Material：hover = `--control-bg` `#e8def8`（亮一步）、聚焦 = `--cell-bg` `#e6e0e9`；
  - Claude：hover = `--control-bg-hover` `#e3dccc`（暗一步）、聚焦 = `--rule` `#b8af9b`（再暗一档）。
- **级联顺序**：`:focus` 规则必须写在 `:hover` 规则**之后**（同 specificity，后者胜）——焦点与
  指针同落一枚选项时以聚焦为准。在注释里写明这条顺序是承重墙。
- **`aria-selected` 语义不动**：属性照旧渲染（e2e 与读屏的断言点），只是不再有对应的视觉填充。
- **不动**：触发钮（选择框形状 + chevron + 旋转）、菜单面/边界/圆角（T43 的成果）、开合无
  动画、三层 Esc、焦点进列表、整行可点、行为契约全链。

## 验收标准

**拆除**
- [ ] 三套 options 上**零**环、零 outline、零 box-shadow（计算样式断言：`outline-style` 为
      `none` 或宽 0、`box-shadow` 为 `none`）。
- [ ] 选中项（`aria-selected="true"`）的 `background` 与普通选项**相同**（= 菜单面）——不再有
      任何选中块。

**两档底色（三套逐套断计算样式）**
- [ ] hover 态逐套等于卡上那一档（Classic `#6f6055` / Material `#e8def8` / Claude `#e3dccc`），
      且**不等于**菜单面。
- [ ] 聚焦态逐套等于卡上那一档（Classic `#4a443f` / Material `#e6e0e9` / Claude `#b8af9b`），
      且**不等于** hover 档、不等于菜单面。
- [ ] 焦点与 hover 同落一枚选项时显示聚焦档（级联顺序承重墙——把两条规则换顺序会红）。

**语义与行为不变（回归）**
- [ ] `aria-selected` 属性断言（T42/T43 既有）一条不动、全绿。
- [ ] T42/T43 的行为契约全绿：三层 Esc、焦点进列表落选中项、箭头循环 + Home/End、Enter 选中
      收列表回焦、Tab 收列表、整行可点、换肤不丢焦点。
- [ ] `settings-style-row.spec.ts` 里 T43 写的「选中底 / 聚焦环」断言**按本票预期更换**（逐条
      在报告里说明为什么），不许整体删除用例来规避。

**闸门**
- [ ] typecheck 0 错；`npm test` 全绿（**基线 920 / 50**，本票不改纯逻辑，数不变）；
      `npm run build` 通过。
- [ ] `check:contrast`：**移除**选中块对（亮墨/白 on `--control-bg-selected` 那几对）与 T43 的
      ring 口径聚焦对，**新增** hover / 聚焦两档的文字对（选项文字 vs 各档）——两层一起动，
      `ratio` 一律 `contrastRatio` 复算。`contrast.test.ts` 的暖色对计数会随移除下降（Claude
      尤甚——T42/T43 加进去的暖色对这次全退场），按实际改并在注释里写清脉络。新对数以实际
      声明为准，报告给出。
- [ ] 目标 e2e 后台 headless 全绿：`settings-style-row.spec.ts` + `settings-drawer.spec.ts` +
      `contrast-computed.spec.ts`；**并跑一次全量**、如实报总数。

**文档**
- [ ] `AGENTS.md` 设置节补一行 T44 状态（照既有体例）。README 不动（T42 勾的风格条描述仍成立）。

## 基线（2026-10-12，`main` = `b189aa8`）

typecheck 0 错 · unit **920 / 50** · build ✓ · 闸门 **3 风格 150 对** · 全量 e2e
**886 passed / 0 failed / 14 skipped** · dev 服务器 5173 在跑（所有者人眼复核用）。

## 硬约束

- **只在 `t44` 分支上提交。不许碰 `main`、不许 push、不许关或改任何 GitHub issue 或 PR**
  （关 #47 由所有者验收后进行）。
- **不许改**规格、票据、ADR、`GLOSSARY.md`、三张设计卡——已由所有者裁定（卡 §12 的 T44 修订段
  就是判据）。发现矛盾就**报告**，不要自行决定。
- Playwright **只准后台跑、一律 headless**：不许 `--headed` / `--debug` / `--ui`，不许开
  trace viewer / HTML report / codegen，**不许用任何会开真实浏览器窗口的 MCP** 或 Puppeteer。
- 单测环境是 node，**不用** `@testing-library/react`。
- 本机 `core.autocrlf=true`：别在断言里写死带 `\n` 的 CSS needle。
- **假时钟用例必须 `install()` 之后立刻 `pauseAt()`**（`.codex/memories/e2e-debt.md` 第四节）。
- 红的旧断言先取基线再谈回归；不许为变绿放松断言。整块替换 CSS 规则时**逐行核对保留行**。
- 环境注意：WorkBuddy safe-delete shim（genie-trash）间歇 fail-closed 拦删除（`dist` 被拦会让
  Playwright webServer 构建失败）——跑 e2e 前先 `cmd //c rmdir /s /q dist`；用 `cmd //c rmdir`
  绕过一切删除。

## 流程

工作树 `.claude/worktrees/t44`（分支 `t44`，基线 = `main`）。实现 → 独立审查（新眼睛，自己重跑
闸门与 e2e、逐套量两档底色并验级联顺序承重墙）→ 审查通过后 `merge --no-ff` 进 `main`（单票一刀，
无集成分支）。票据 Evidence 在实现票内回填。
