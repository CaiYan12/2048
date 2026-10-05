# 2048

A 2048 variant collection built to practise frontend styles on one rules core. The first
release targets three baseline styles; specialty styles are future work.

> 🚧 **SPEC and local tickets drafted; game implementation not started.**
> Scope and acceptance are in [`docs/SPEC.md`](docs/SPEC.md). The original stages and
> decisions remain in [`docs/primal-setup-plan.md`](docs/primal-setup-plan.md).

## What it is

Two orthogonal axes:

- **Mode** (rules) — 6 modes: Classic, Fibonacci, Big Board, Walls, Daily, Time Attack
- **Style** (presentation) — first release: Classic, Material, Claude Design

Any style can be applied to any mode, and styles can be switched mid-game.

The project exists to practise frontend craft. Balance is explicitly **not** a goal —
undo is unlimited, records are local toys, and there is a cheat button that swaps two
tiles.

## What's here now

| Path                       | What                                                              |
| -------------------------- | ----------------------------------------------------------------- |
| [`GLOSSARY.md`](GLOSSARY.md) | Domain glossary. Terminology is enforced — see its `_Avoid_` list  |
| `docs/primal-setup-plan.md`| The original P0–P10 blueprint and its ticket mapping |
| `docs/SPEC.md`           | Buildable behavior, user stories, architecture and verification contract |
| `docs/tickets/`          | Small, dependency-linked implementation tickets with acceptance checks |
| `docs/adr/`                | Nine architecture decisions, each with the trade-off that produced it |
| `AGENTS.md`                | Coding rules, tech stack, two hard architectural constraints       |
| `docs/agents/`             | Per-repo config the engineering skills read                        |
| `LICENSE`                  | MIT                                                                |

## Architecture in one paragraph

`src/game/` is pure logic with zero DOM references and an injectable RNG.
`src/renderer/` is React 19 + Tailwind. A **style is one folder** —
`tokens.css` + `styles.css` + `config.ts` — applied against a fixed board structure
with two decoration slots, so adding a style never touches the engine. The board and
tile layer deliberately does *not* use Tailwind utilities; Tailwind only dresses the
chrome around it. See [ADR-0002](docs/adr/0002-style-as-folder-with-decoration-slots.md).

## Workflow

Issues are tracked in [GitHub Issues](https://github.com/CaiYan12/2048/issues). The project is built with
[Matt Pocock's agent skills](https://github.com/mattpocock/skills), installed as the
`mattpocock-skills` Claude Code plugin; the per-repo conventions those skills follow
are documented in [`docs/agents/`](docs/agents/).

## TODO（远期规划）

本节是**本仓库的 README TODO**：全部远期规划的单一入口。收录特色风格研究、三组变更设想
（成就机制、成功/失败界面、设置界面）、无效移动的反馈，以及彩蛋。

三组变更设想**尚未实现**，也不改动现有代码与文档；它们将作为**独立工作流**另建各自的
SPEC、tickets 与计划文档来推进。本节只记录方向与约定，不对现行实现构成约束。

### 特色风格研究

先完成 Classic、Material、Claude 的切换与 3 × 6 组合验收，再逐套决定是否实施下列特色风格。以下仓库是在 2026-09-26 核对过的**设计研究参考**，本次不安装依赖、不复制素材；将来使用代码、字体或图像前分别复核其许可证与项目约束。

- [ ] **Terminal** — [Terminalize](https://github.com/pabletos/terminalize)（MIT）：研究终端面板、等宽排版及可选屏幕效果。
- [ ] **Frutiger Aero** — [frutiger-aero-everywhere](https://github.com/TheAgencyMGE/frutiger-aero-everywhere)（MIT）：研究 glass/gloss 层次和不改变原有布局的装饰策略。
- [ ] **Web 2000** — [GeoCities Web 1.0](https://github.com/NovusGFX/retro-design-system/blob/main/styles/14-geocities-web10/index.html) 与 [Y2K Chrome](https://github.com/NovusGFX/retro-design-system/blob/main/styles/50-y2k-chrome/index.html)（同属 MIT 项目）：分别研究早期网页排版与千禧年镀铬效果。
- [ ] **Win10 Metro** — [Metro UI](https://github.com/olton/metroui)（MIT）：研究平面磁贴、字体层级及响应式组件组织。
- [ ] **Win98** — [98.css](https://github.com/jdan/98.css)（MIT）：研究窗口、按钮、边框和控件状态的经典 Windows 视觉语法。
- [ ] **Aqua** — [Aqua](https://github.com/igorfelipeduca/aqua)（MIT）：研究凝胶按钮、条纹和金属窗口的层次；只作视觉参考，不引入其 shadcn 组件体系。
- [ ] **Cyberpunk** — [cyberpunk-ui](https://github.com/laddtnov/cyberpunk-ui)（MIT）：研究色彩 token、发光边缘和动效的静态替代。
- [ ] **Bauhaus** — [Hammhaus](https://github.com/g3hamm/hammhaus)（MIT）：研究纸张、原色、几何和海报式排版的 token 系统。
- [ ] **Newspaper** — [the-lamplighter](https://github.com/starinzlob/the-lamplighter)（代码 MIT，字体 OFL）：研究报纸网格、纸张纹理及中英文字体层级。
- [ ] 在对应风格上线后再实现 `全风格征服` 与 `复古大师`；当前版本实现附录里的**六个**（五个模式轴成就 + `风格旅行者`），外加一个不在附录里的新成就 `首次合并`（2026-09-28 应所有者要求加的，它同样单局可自证，而且是全场最早能拿到的里程碑），**注册表因此是七个**；2026-10-01 一念神魔追加在末尾，**注册表到十一个**——前三颗（道通成魔 / 学艺不精 / 当断即断）条件全是「本局在抉择里发生了什么」，第四颗「二念 · 走火入魔」的条件是「本局第二次先 B 后 A」。`模式收藏家` 与 `每日坚守` 按 **ADR-0007 退休**——它们的条件（赢遍六个模式、连续七个 UTC 日期）单局内无法自证，去持久化之后必然永远拿不到；`完美一局` 与 `无作弊通关` 按 ADR-0003 的裁决挂起。**当前版本没有为附录里没实现的那几个预留任何占位行**，注册表里没有它们的 id，界面上也不会出现暗示未来风格可用的空壳。

每个远期风格都需先写自己的 `DESIGN.md`，沿用固定 Board 与两个装饰插槽，并单独通过对比度、桌面/手机视觉和交互验收。参考仓库的设计语言不等于本项目可以直接复制其组件树。

### 成就机制变更

**方向**（2026-09-27 由项目所有者确认）：成就改为**达成条件即释放 toast 祝贺**，不再需要
其他任何因素影响。

**状态（2026-09-28）：已实现**。决策在 ADR-0007 与就地修订的 ADR-0002，完整规格在
`docs/specs/single-run-achievements.md`，纵向票据在 `.scratch/achievements-single-run/`。
祝贺文案照本节原文带 **emoji**（2026-09-28 补上）：上行是 `图标 + 成就名`（图标取自
`src/game/achievements.ts` 的注册表，每个成就一个，三套风格共用），下行是**每套风格自己的
一句祝词**。三套设计卡原先一律「禁 emoji 当装饰」，那条禁令据此收窄到棋盘、方块与外壳的
静态部分——祝贺里的图标是**内容**（它报出你拿到了哪一个），不是装饰。

- [x] 解锁不再改写页面文字，改为风格化 toast，由**当前风格自己实现**（呈现插槽）。
- [x] 成就解锁不再跨局保存：本局内达成条件即**立即**触发 toast，不写入任何持久化存储。

**约定**

- 本项目没有账户体系，原文「不再局限于账户」按「不跨局持久化」理解。
- 「成就不持久化」是反直觉取舍（后来者会问「为什么不保存」），建议新工作流记一则 ADR。

### 成功与失败界面变更

已发布为独立 SPEC 与 tickets：结果层 [spec](docs/specs/result-layer.md)（GitHub
[#26](https://github.com/CaiYan12/2048/issues/26)），纵向票 **T25–T27**
（[#27](https://github.com/CaiYan12/2048/issues/27) / [#28](https://github.com/CaiYan12/2048/issues/28) /
[#29](https://github.com/CaiYan12/2048/issues/29)）。

- [ ] 结果层改为**半透明遮罩 + 不透明卡片**：遮罩是半透明的，于是暂停那一刻的棋盘始终可见；
      卡片不透明，所以它上面的字与按钮和今天一样可读、一样过对比度闸门。原题干的「结算界面
      不再遮挡整个画面」不准确——这一层从来不遮挡视口，它是棋盘那个
      `position: absolute; inset: 0` 的兄弟节点，遮挡的一直是**棋盘**，而且是不透明地遮挡；
      本次要改的正是这件事。
- [x] 达成目标块后选择继续游戏，则继续正常游戏。**这是现行已有行为，不是待办**——原题干的
      第二条早已由 T04 交付，本组不碰它。

**约定**

- 术语统一为**结果层（Result layer）**，词条见 `GLOSSARY.md`。不用「结算界面」指 `won` 阶段
  （合出目标块不是结算，那一局还在继续），也不用「面板」（它已禁给棋盘用，又是记分卡的
  CSS 类名）。
- 遮罩强度按阶段分三档：越是没有决定可做越暗——`stuck` 最亮（要不要 Undo 得看着棋盘定），
  `ended` 最暗（没什么可决定了）。压暗还是起雾，由各套风格自己在设计过程里定。
- 只改呈现：规则、阶段、恢复路径、结算时机、撤销历史、记录语义一个字都不动。
- **本组推翻了一条已经写下来的旧裁决**：三处 `styles.css` 注释与三张设计卡 §6 当年以
  「半透明会把棋盘上的方块透出来，只会让人以为还能动它」为由选了不透明底色。这次推翻与它的
  答复记在 **ADR-0008**——读到那些旧论证时，不要以为该把实现改回去。

### 设置界面引入

将另建独立 SPEC 与 tickets 推进。

- [ ] 页面右上角引入设置入口；点击后从页面右侧向左滑出独立设置会话，弹出期间禁用所有主页面与游戏操作；点击会话外侧或关闭按钮时收起，回到正常游戏。
- [ ] 设置预设下拉框，可保存自己的预设。
- [ ] 风格设置下拉框——主面板不再自选风格，移入设置。
- [ ] 背景音乐开关，以及进入时是否开启背景音乐（当前音乐用占位代码）。
- [ ] 各类音效调整下拉框（含「关」选项）：合并成功、仅移动位置、无法移动、游戏成功（达成目标块）、游戏失败。取消各数值各自不同的合并成功音效，统一为一个以减少体积；暂只可设置当前音效。
- [ ] **上帝模式**：该行单独样式，用炫彩渐变与专属普通/hover 特效；为一个开关，开启时将在面板上展示切换数值的按钮。它与现有 **Cheat swap（作弊交换）为同一功能**，本项只是在设置里控制该按钮的显示与否，不新增规则。
- [ ] 其他可能影响游戏的必要调整项，如语言等。

**约定**

- 术语：题述的「主题」下拉框 = **风格（Style）**。GLOSSARY.md 的 `_Avoid_` 明确禁用「主题 / theme」
  指代风格，文档一律写「风格」。
- 「上帝模式」只作 UI 标签，功能词汇仍用「作弊交换」。
- 「游戏成功」的判定按**目标块（Target tile）**，经典模式是 2048、斐波那契是 2584、
  大棋盘是 4096——不要写死为 2048。

### 无效移动的反馈

无法移动（无效移动）**已有占位音效**：`SoundEvent` 的第五个事件 `blocked`
（`src/renderer/audio/tone.ts`），与其余四个事件同等的代码地位——同一套决策函数、同样受
静音与「降低感官刺激」约束，也已作为可调项列进上面「设置界面引入」的音效下拉框清单。
音色本身是占位（A2 的一声短音），最终形态由本节推进。

**约定**

- 这一声只在 `playing` 阶段响：won / stuck / ended 三个阶段是**面板在接管输入**，不是玩家
  试了一个走不动的方向，那三种情形不该出声。
- 规则量（分数、步数、生成、撤销历史）一个字都不因此改变。

- [ ] 无法移动时给出**震动等特效**的简单实现：棋盘轻微的视觉上在移动方向上震一下（不是设备真实震动），
  配一个短促的视觉提示（例如方块层的一次极轻回弹）。

### 彩蛋

游戏里**有**一个彩蛋：一念神魔。在棋盘上敲出老游戏机那条口令，机器会当真回答——两个圆钮
出现在棋盘旁（手机上是棋盘下方），一个 A 一个 B。它有三段结局、一次代价和四个成就，
**不改任何规则量**：不写记录、不结算、不计步、不计分，撤销历史与阶段机一个字节都不动。
规格：[`docs/specs/easter-egg.md`](docs/specs/easter-egg.md)（GitHub
[#30](https://github.com/CaiYan12/2048/issues/30)）；两条裁决在
[ADR-0009](docs/adr/0009-shenmo-is-shell-not-a-fourth-slot.md)；六个规范词在
[`GLOSSARY.md`](GLOSSARY.md) 的「一念神魔」条目。

二念那一下的代价是**两拍**（2026-10-01 应所有者要求改的，规格的架构决策 20）：第一遍走完
什么都不会发生，第二遍完整走完 B → A 之后——整个场景先染上血色（约 600ms，血是「涌」上来的，
不是一下跳过来），停一拍（约 200ms），然后整条游戏列淡出（约 400ms），页面才清空到只剩一颗
「重新开始」与视口顶端那条悬顶。**染血的触发条件是重复输入两次口令**，不是输错了：魔道那
30 秒（点过 B 之后）一眼血色都没有，错键照旧整个清空重来。

- [ ] 子彩蛋「重力掉落」：二念把棋盘拿走之后，让页面元素带着重量掉下去。这是「页面被清空」
  这一下的自然延续，**明确欠着**——spec 的 Out of scope 写明了它被推迟，就靠这一行记账。

**约定**

- 口令**绝不**出现在界面上任何地方：不进帮助、不进提示、不做按钮文案，本篇也不写它是哪
  一条——能被玩家自己撞见，是它成立的另一半。文档里它只出现在规格与 ADR 这类记录裁决的地方。
- 术语用「一念神魔 / 神魔码 / 抉择 / 一念 / 二念 / 悬顶」六个；别再叫「作弊码」「外挂」
  「调数」（这三个已花给「作弊交换」），也别叫「横幅」（悬顶是一条成就读数，不是页头广告带）。
- 它是**共享外壳，不是第四个呈现插槽**：风格只出 token 与 CSS——两颗按钮的表面/边缘/阴影、
  悬顶与「一念」那颗按钮的表面、以及十二档方块压暗后的值。加一套风格不会因此多一个必交文件。

## License

[MIT](LICENSE) © WindowsIt
