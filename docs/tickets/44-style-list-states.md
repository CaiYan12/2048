# T44 · 风格下拉框的态：拆环拆选中块，只留两档底色

**Parent**: `docs/specs/style-picker.md`（GitHub [#44](https://github.com/CaiYan12/2048/issues/44)）·
T43（#46，已落地）的**人眼复核第二条 BLOCK** · 2026-10-12 两轮 grilling 定案
**Blocked by**: 无。**GitHub**: #47。**状态**: 已完成（2026-10-15 所有者验收通过，人眼复核闭环）

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

## Evidence（实现回填 · 2026-10-15 · 提交 `f32f5a2`，分支 `t44`）

**四道闸门**：typecheck 0 错 · unit **920 / 50**（与基线同数，本票不改纯逻辑）·
`npm run build` 通过 · `check:contrast` **3 风格 147 对**（基线 150）。三套各**删三对 / 增两对**：
删「选中控件文字」对、「聚焦环」`ring` 对、「选中项底」对；增 hover / 聚焦两档文字对。所有 `ratio`
用 `scripts/check-contrast.mjs` 的 `contrastRatio` 复算，无手算。

**目标 e2e**（`settings-style-row` + `settings-drawer` + `contrast-computed`，后台 headless）：
**190 passed**（基线 184 + 本票新增 3 个「级联顺序」用例 × 2 视口）。
**全量 Playwright**（后台 headless）：**892 passed / 14 skipped / 0 failed**（票据基线
886 / 14 / 0；+6 即新增用例，skip 数不变）。

**逐套实测**（`getComputedStyle` 读渲染值，比值用 `contrastRatio` 复算）：

| | Classic | Material | Claude |
|---|---|---|---|
| 菜单面（T43，本票不动） | `#5f564e`（`--control-bg-hover`） | `#d8cee8`（`--control-bg-hover`） | `#f0eee6`（`--page`） |
| hover 档 | `#6f6055`（`--control-bg`）**5.60** | `#e8def8`（`--control-bg`）**13.24** | `#e3dccc`（`--control-bg-hover`）**11.35** |
| 聚焦档 | `#4a443f`（`--focus`）**8.90** | `#e6e0e9`（`--cell-bg`）**13.21** | `#b8af9b`（`--rule`）**7.12** |
| 选中项（未聚焦 / 未 hover）底 | 透明（透出菜单面） | 透明 | 透明 |
| 选项上的环 / `box-shadow` | 无 | 无 | 无 |

上表「环 = 无」在**所有态**（键盘展开 / 指针展开 / 移焦点）下成立——修掉 UA 默认环之后（见下「修复轮」）。

逐套的 hover 档、聚焦档、菜单面三者互不相同（e2e 逐套断 `≠`，不是同义反复）。

**级联顺序承重墙怎么测**（新增用例「焦点与 hover 同落一枚选项时显示聚焦档」）：展开列表后焦点落在
选中项上；先 `page.mouse.move(0, 0)` 读一次「只有焦点、没有 hover」的底 = 聚焦档；再 `selected.hover()`
把指针悬停到**同一枚**选项上，用 `element.matches(':hover') && element.matches(':focus')` 证明确实同时
成立，再读计算底 = 聚焦档（并断 `≠ hover 档`）。把 `styles.css` 里 `:focus` 与 `:hover` 两条换序，这条
用例即红。

**`settings-style-row.spec.ts` 断言变动清单**（逐条说明为什么，没有一条为变绿而放松）：
- 「菜单面与聚焦环（T43）」改成「菜单面与列表态（T43 · T44）」：①② 菜单面 / 边界 / 圆角三条**原样
  保留**（T43 的成果本票不动）；③④ 换新口径——原「选中底 = `--control-bg-selected` + 亮墨、聚焦 = 环」
  两条断言随实现退场（选中块与环都不存在了），改为断「聚焦项 = 聚焦档、零 `outline`、零 `box-shadow`」
  与「未聚焦未 hover 的选项底透明（= 菜单面）」「选中项的底与普通选项相同」。
- ③「零 `outline` / 零 `box-shadow`」的守卫**扩到两条展开路径**（修复轮）：指针展开态保留原断言；
  新增键盘展开态（`trigger.focus()` + `Enter`）读 `.settings-style__option:focus`，并先断
  `matches(':focus-visible') === true`、再在 `ArrowDown` 移焦点后复读一次——指针态 `:focus-visible`
  为假，只守它等于没守（原守卫量错了态）。
- 新增「焦点与 hover 同落一枚选项时显示聚焦档」（承重墙）。
- 其余行为断言（`aria-selected`、三层 Esc、焦点进列表、箭头循环 + Home/End、Enter 收列表回焦、Tab 收
  列表、整行可点、换肤不丢焦点、触发钮形状 / chevron / 旋转、菜单面 / 边界 / 圆角）**一条未动**。

**`claude.spec.ts` 的连带改动**（票据未列、实现时发现，报告于此）：`'选中的那一套换成暖色填充，其余
控件仍是纸面'` 原来量的是抽屉列表里的选中项（T42 迁移的现址）。本票把选中块拆了，那一处不再是暖色
填充，用例改到**开局界面的风格按钮组**（`.control[aria-pressed='true']` 仍是那块 `--control-bg-selected`
暖色，§7 按角色计不受影响）——是现址迁移的收口，不是放松。同时删掉本文件里随之不再使用的
`openSettings` / `closeSettings` 导入。

**`contrast-computed.spec.ts` 的改动**：listbox 批次新增「hover 那几对要先把指针移到一枚**非聚焦**选项上
再读」（聚焦档会盖住 hover 档）；`restingRings` 的 `expandList !== true` 排除本票后**不再拦下任何一对**
（T43 那条唯一的 ring + expandList 对已退场）——**保留**为通用不变量（带 `expandList` 的环归列表批次），
注释写明理由。

**`tests/unit/contrast.test.ts`**：Claude 暖色对 **8 → 5**（T42 加的选中项底、T43 加的聚焦环、更早的
「已选中风格按钮文字」三对随列表态退场），注释按 T44 脉络改写。

**修复轮（键盘焦点态的 UA 默认环 · 独立审查驳回的唯一阻塞项）**：T44 落地的三套 `styles.css` 在拆环时
没有补一条压 UA 默认环的规则——选项聚焦时浏览器会替 `:focus-visible` 补一圈默认方框，而本控件的主用
路径正是键盘（触发钮 `Enter` 展开），那一刻外框全程在（实测计算样式 `outline-style: auto` / 宽 1px，
正是被驳回的「大矩形」）。修法：在**共享外壳** `.settings-style__option` 上加 `outline: none`（理由与
「选项几何共用」同一条——三套逐字相同、无风格差异）。守卫随之从「只量指针展开态」（`:focus-visible`
为假，读到 `none` 是空守卫）改成**两条展开路径都断言**（逐条见上）；**守卫是真的**——把 `outline: none`
注释掉后，键盘那条断言在三套上**全红**（`：键盘展开态的选项还留着 outline（UA 默认环没压掉）`），还原
后全绿。本轮不改任何对数或 unit 条数（只加一条 CSS 声明、改测试与注释）。

**没有被验证的**：两档底色的并排观感、hover 与聚焦在灰度上是否分得开、以及「大矩形方块拆干净了没有」
——这些要人眼；headless 与「不许开真实窗口」的约定下 agent 不能代做（同 T43）。另：本票只移除了
`--control-bg-selected` 在**抽屉列表选中项**上的那一处用法，令牌本身三套都仍声明且仍被别处使用（开局
界面按下态按钮 / 开关开态轨道），一个令牌都没删。


## 复核轮（人眼复核第一轮发现 · 2026-10-15 · 提交见 `main` 的 merge）

**所有者人眼复核截图发现**：圆角场景下首 / 末行的底色**伸出菜单的圆角边界**（截图那处是末行左下角）。

**取证的探针数字**（临时探针跑完即删，`getComputedStyle` + `getBoundingClientRect`；末列两个数是
**同一个量的两个高度**——末行底边 / 末行底边往上 0.5px，因为测试探针取后者、而伸出最明显处在
前者）：

| 风格 | 列表圆角 | 列表 `overflow` | 垂直内边距 | 末行底边距列表底边 | 内缩 @末行底边 | 内缩 @末行底−0.5 |
| --- | --- | --- | --- | --- | --- | --- |
| classic | 6px | `visible` | 4px | 4px | 0.34px（看不见） | 0.19px |
| material | **12px** | `visible` | 4px | 4px | **3.06px**（截图所见） | **2.63px** |
| claude | 4px | `visible` | 4px | 4px | 0px | 0px |

选项是**满宽方角**的（末行 `left` / `right` 与列表逐值相等），列表有圆角却没有任何裁剪——于是
hover / 聚焦把底色画出来的那一刻，方角就伸出去。**机制三套共通**，只是前两套的内缩量小到看不见。

**修法**：共享外壳 `.settings-style__list` 加 `overflow: hidden`（几何归共享外壳，与「底面 / 边界 /
圆角归三套」不冲突）。是**裁剪不是滚动**（三个选项永远装得下）；只裁后代，列表自己的 `outline`
发丝线（Classic / Claude）与投影（Material）不受影响。注释里写明了代价：将来若给选项加「画在盒外」
的焦点环会被这里裁掉，那时要重新裁一次这件事。

**守卫（两条，都在 `settings-style-row.spec.ts` 的「菜单面与列表态」用例里，逐套跑）**：
① 列表 `overflow` 必须为 `hidden`；② 在圆角内缩量 >1px 的那一套上做**命中测试**——把指针停在末行上
（让它的底色真画出来），再 `elementsFromPoint` 探「圆角外、方角内」那一点，断言命中栈里**没有**选项
（只声明 `overflow` 不算，点得着就说明没裁掉）。

**守卫是真的（两个方向的实测）**：把 `overflow: hidden` 摘掉 → 三套的声明断言**全红**
（`Expected: "hidden" / Received: "visible"`）；再把声明那条暂时摘掉、单跑效果断言 → **Material 红**
（`圆角外的那一角仍点得着选项（裁剪没生效）——命中栈 LI.settings-style__option > DIV.settings-drawer
> …`），Classic 与 Claude 按 `inset > 1` 的设计跳过。还原后全绿（该 spec 50 passed）。红 / 绿签名与
内缩量逐项相符（2 failed = Material × 桌面 / 手机，4 passed = 另两套 × 两视口；Material 的 2.63px
远超 1px 门槛，另两套 0.19 / 0 远低于）。

**独立审查追加的一条防退化断言**（审查者指出：`inset > 1` 换算下来约等于「圆角 > 8.5px」，若将来
把**圆角最大**的那一套也调小到 8.5px 以下，这条唯一的效果级守卫会**静默跳过**——声明那条照旧绿，
因为 `overflow` 没动）：新增 `MENU_MAX_RADIUS` 与一条断言——圆角最大的那一套**必须**一直存在
「该被裁掉的那一条」（`inset > 1`）。门槛随调参失效这件事从此会红，而不是无声变成空话。

**独立审查实测的一条连带效果（记录，非缺陷）**：加 `overflow: hidden` 会让列表内的文字抗锯齿从
**LCD 次像素**降级为**灰度**（实测同像素 `195,187,181` vs `227,189,85` 带彩色边缘；对照组噪声底
仅 0–16px / Δ≤2，故为真实变化非抖动）。视觉上不可感，对比度闸门读的是令牌、不受影响；这里记一笔
是因为它属于「裁剪」这个动作的另一面——`overflow` 会新建裁剪层，文字就不再走次像素渲染。

**本轮不改**：闸门对数（仍 **147 对**，修复不新增色对）、unit 条数（**920 / 50**）、任何行为契约、
触发钮 / 菜单面 / 边界 / 圆角（T43 的成果）。

**仍没有被验证的**：修好之后的**实机观感**（圆角处裁得干不干净）仍要人眼——headless 下 agent 不能
代做。人眼复核其余项（两档底色并排观感、灰度可分性）同样仍欠。

## 收官（2026-10-15 · 所有者验收通过）

**人眼复核闭环**。这一格此前挂着「没做」——由所有者在本机 dev 服务器上手看完成，过程是**一轮真实的
复核循环**，不是补签：

1. 所有者复核中**发现一处圆角场景的 UI bug**（截图：菜单末行左下角，底色方角伸出圆角外）→ 本票
   追问、定位、修复（提交 `c95998f`，merge `fd07a36`），并补两条守卫（`overflow` 声明 + 命中测试），
   两条都验了会红。
2. 独立审查通过并合并；审查跟进的防退化断言与两处订正另成一笔（`acf32bb`，merge `43533ff`）。
3. 所有者确认**对当前状态满意** → 验收通过，#47 关闭。

**最终状态**：`main` = `origin/main` = **`43533ff`**。typecheck 0 错 · **920 unit / 50 files** ·
`npm run build` 通过 · `check:contrast` **3 风格 147 对** · 全量 Playwright **892 passed / 14 skipped /
0 failed**。

**仍欠（不属于本票）**：README「设置界面引入」组余下五条（预设下拉 / 背景音乐 / 逐事件音效 / 上帝
模式 / 语言）；窄视口横向溢出另在 T41（#43）里挂着。
