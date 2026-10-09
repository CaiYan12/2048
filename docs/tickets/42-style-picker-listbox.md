# T42 · 风格选择搬进设置抽屉：自绘 listbox + 三层 Esc 优先序

**Parent**: `docs/specs/style-picker.md`（GitHub [#44](https://github.com/CaiYan12/2048/issues/44)）·
README TODO「设置界面引入」第二条 · 裁决记录 `.codex/memories/style-picker.md`
**Blocked by**: 无。**GitHub**: #45。**状态**: ready-for-agent

## 交付范围

从玩家角度：打开设置，抽屉里「音效」行下面多一行「风格」——左边静态标签、右边一颗显示**当前
风格名**的触发钮；按下它弹出一个下拉列表（三个选项，从风格注册表长出来，当前项标 `aria-selected`），
焦点落进列表里的选中项，方向键上下移动（循环）、`Home`/`End` 跳两头、`Enter` 选中并收列表、
`Esc` 只收列表并把焦点还给触发钮、`Tab` 收列表继续走。选中的一刻整页换肤（棋盘、方块、字体），
抽屉不关、焦点不丢、触发钮的名字立刻更新。列表收着时一切照旧：`Esc` 关抽屉、方向键被吞。
主面板那三颗风格按钮**消失**；开局界面的按钮组原样保留。

实现要点（细节以父规格决策 1–14 为准）：

- 触发行照静音行语法：`<span id>` 标签 + `aria-labelledby` + **整行可点**；触发钮是 `.control` +
  `aria-expanded` + `aria-haspopup="listbox"`，不给 `aria-pressed`。
- **焦点进列表**（APG listbox 形态）：展开即 `focus()` 落在选中项上；DOM 焦点在 option 间移动。
- **Esc 三层优先序 listbox > 抽屉 > 交换摊/神魔摊**——列表的开合状态由与抽屉**同一个 keydown
  分发点**持有（不另开监听器赛跑）；这是对 `settings-drawer.md` 决策 9 的就地修订（那边已加
  `(amended 2026-10-09)` 标记）。列表展开时 `ArrowUp/Down/Home/End` 归列表（组件自己
  preventDefault）——SPEC §3.4 的第二个放行例外。
- 列表展开时，抽屉内其他指针按下先收列表（不关抽屉）；点遮罩照旧关抽屉。列表**无进场动画**
  （父规格决策 10）。
- **共享 e2e 助手模块就此建立**（review-fix 阶段记下的既定承诺）：`openSettings` /
  `closeSettings` / `pickStyle` 收进一个模块；6 份各自拷贝的 `pickStyle` 删除、调用方改走抽屉
  路径；`audio.spec.ts` 与 `settings-drawer.spec.ts` 里各自抄的那两套开/关抽屉助手一并收编。
  抽屉契约「指针路径逐条过」里「风格按钮」条目更新（页面常驻那颗没了）。

## 验收标准

**这一行**
- [ ] 行结构：左静态标签「风格」（可访问名恒定）+ 右触发钮；整行可点（点标签也展开）；触发钮
      报 `aria-expanded` 与 `aria-haspopup="listbox"`、名字由 `aria-labelledby` 来、无 `aria-pressed`。
- [ ] 位置：静音行之下第二行。

**列表与键盘**
- [ ] 选项 = 注册表全部风格、名字 = 各自 label、顺序一致；当前项 `aria-selected`；列表不滚动。
- [ ] 展开那一刻焦点落在**选中项**上；`ArrowUp/Down` 移 DOM 焦点且**循环**；`Home/End` 跳两头。
- [ ] `Enter` 选中并收列表、焦点回触发钮、触发钮名字更新；点选项同效。
- [ ] `Esc`：列表开着只收列表（焦点回触发钮）；收着关抽屉——三层优先序有测试钉住
      （列表开着时 `Esc` **不**关抽屉、底下的摊也不收）。
- [ ] `Tab` 收列表并继续 Tab 走查；焦点不落在 `inert` 的页面内容上。
- [ ] 列表展开时方向键四键归列表（不推棋、不滚页）；列表收着时照旧被吞。

**换肤与域**
- [ ] 抽屉开着切风格：整页换肤、抽屉不关、焦点不丢（保持在触发钮/列表）、`data-style` 换；
      `style-switch.test.ts` 字段表契约一字不改照旧全绿。
- [ ] 规则层零接触：分数/棋盘状态/撤销/计时一个不碰（既有单测口径）。

**搬家与助手**
- [ ] 主面板的风格按钮不在 DOM；开局界面按钮组原样保留，且是全仓唯一 `group` 名「风格」。
- [ ] 共享助手模块建立；6 份 `pickStyle` 拷贝与 2 套开/关抽屉助手拷贝删除、调用方迁移；
      相关 spec 全绿。
- [ ] 抽屉契约的指针路径用例更新后照旧全过。

**闸门**
- [ ] typecheck 0 错；`npm test` 全绿（新增纯函数单测：高亮移动器的循环与 Home/End，形状照
      presence 模块的先例）；`npm run build` 通过。
- [ ] `check:contrast`：`settings` 一幕新增 listbox 各对（选项文字 vs 列表底面 / vs 聚焦底 /
      选中项那对）——**两层一起动**（声明侧 + `probe` 加「先展开列表」动作的计算样式侧），
      新对数以实际声明为准（预期 ~3 对/套），全部用既有色值、只加角色名。
- [ ] 目标 e2e 后台 headless 全绿：新建的风格行契约（三套各一遍）+ `settings-drawer.spec.ts` +
      `game.spec.ts` + `audio.spec.ts`。

## 基线（2026-10-09，`main` = `b6be41b`）

typecheck 0 错 · unit **910 / 49** · build ✓ · 闸门 **3 风格 141 对** · 全量 e2e
**842 passed / 14 skipped / 0 failed**。

## 硬约束

- **只在 `t42` 分支上提交。不许碰 `main`、不许 push、不许关或改任何 GitHub issue 或 PR**
  （关 #45 由所有者在验收后进行）。发现票与规格矛盾就**报告**，不要自行决定。
- **不许改**规格、票据、ADR、`GLOSSARY.md`——它们已由所有者裁定；设计卡只许按 §12 已写明的
  角色实现，不另造色值。
- Playwright **只准后台跑、一律 headless**：不许 `--headed` / `--debug` / `--ui`，不许开
  trace viewer / HTML report / codegen，**不许用任何会开真实浏览器窗口的 MCP** 或 Puppeteer。
- 单测环境是 node，**不用** `@testing-library/react`。
- 本机 `core.autocrlf=true`：**别在断言里写死带 `\n` 的 CSS needle**。
- **用假时钟的用例必须 `install()` 之后立刻 `pauseAt()`**（`.codex/memories/e2e-debt.md` 第四节；
  T38 栽过一次）。
- 红了先取基线再谈回归（`.codex/memories/working-agreements.md`）；不许为变绿放松任何断言。

## 流程

工作树 `.claude/worktrees/t42`（分支 `t42`，基线 = `main`）。实现 → 独立审查（新眼睛，自己重跑
闸门与 e2e）→ 审查通过后 `merge --no-ff` 进 `main`（单票一刀，无集成分支）。票据 Evidence 在
实现票内回填。
