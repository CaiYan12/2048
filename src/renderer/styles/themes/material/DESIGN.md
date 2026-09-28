# Material · 设计卡

> 风格 id：`material`。本卡是这套风格与 T23 视觉复核逐项对照的依据，先于 CSS 写成。
> 参考原型：Google 的 **Material Design 3**（基线配色、色调阶梯、elevation、emphasized 动效）
> 与 Material Design 2 的「抬起的卡片 + 大胆色块」气质。

## 1. 参考与氛围

- **可辨识的参考**：Material 3 的浅色基线主题——一层带紫调的近白表面（`#fef7ff`）、
  一张被抬起的白色卡片（板面）、以及**同一色相的一条明度阶梯**。看到这屏的人应当认出
  「这是 Material」，而不是「又一套紫色主题」。
- **气质**：克制、系统化、有层级。层级靠 **elevation（投影）与表面色阶**表达，
  不靠边框、不靠渐变、不靠纹理。
- **唯一允许的装饰**： elevation 投影，以及方块合并时按 emphasized 曲线走过的
  位移/淡入（时长由本风格令牌给出，T21 落地）。
- **与 Classic 的分界**：Classic 是全扁平、禁投影；Material 的全部识别度就在
  「投影 + 圆角 + 色调阶梯」上。两者不是同一套观感换 hex——所以本卡每一条都要能
  对着 Classic 说出「这里不一样」。

## 2. 色彩角色

全部色值由 `tokens.css` 提供，`board.css` 只负责把色值贴到固定 DOM 上。
表面色取 Material 3 基线浅色主题的实际角色名，便于逐项对照。

| 角色 | 变量 | 色值 | Material 3 角色名 |
| --- | --- | --- | --- |
| 纸面（页面底） | `--page` | `#fef7ff` | surface |
| 棋盘（抬起的一张白卡） | `--board` | `#ffffff` | surface-container-lowest |
| 空格 | `--cell-bg` | `#e6e0e9` | surface-container-highest |
| 障碍（Walls 模式的四格固定障碍） | `--wall-bg` | `#49454f` | on-surface-variant |
| 正文 / 小字 | `--ink` | `#1d1b20` | on-surface |
| 次要正文（提示、说明） | `--ink-variant` | `#49454f` | on-surface-variant |
| 控件上的字（tonal 按钮） | `--control-ink` | `#1d192b` | on-secondary-container |
| 控件底 | `--control-bg` | `#e8def8` | secondary-container |
| 控件悬停 | `--control-bg-hover` | `#d8cee8` | secondary-container + 8% on-surface |
| 选中态控件底 | `--control-bg-selected` | `#6750a4` | primary |
| 深底上的字 / 选中控件上的字 | `--ink-bright` | `#ffffff` | on-primary |
| 焦点 | `--focus` | `#625b71` | secondary |
| 方块阶梯 | `--tile-1` … `--tile-11` | 见表下 | 主色的色调阶梯（tonal palette） |
| 超出本模式目标的方块 | `--tile-beyond` | `#300f62` | 主色最深色调 |

### 方块阶梯：明度阶梯，不按数值按秩

**T13 起，方块底色不再按数值取档，而按「在本模式目标前的相对进度」取档。** 担子在一对纯函数
上（`src/renderer/components/ValueLadder.ts`）：`valueLadder(mode)` 从模式**已经声明的**
`spawnValues` + `target` + `mergeFamily` 推出这个模式的有序价值阶梯，方块拿自己的值去阶梯里
查一个 1-based 的 `data-rank`，再按 `ceil(rank / totalRanks × 11)` 折成 11 个色档里的一个
（`data-bucket`）。所以：

- **本风格的 11 个色档是同一条主色相的明度阶梯**（hue 293.7 的 OKLCH 色调梯，
  固定在主色 `#6750a4` 的色相上，逐档变暗）。秩越高越暗、越接近主色本体，
  这就是 Material 3「tonal palette」的做法。
- 阶梯在经典模式里 11 秩（2…2048）与 11 档一一对应；在斐波那契模式里 17 秩
  （1…2584）压到 11 档，2584 落在**顶档**而不是某个「beyond」深色桶——
  按数值取档的那套机制下，斐波那契全部方块都会掉进 `--tile-beyond`，进度在颜色上完全看不见。
- `--tile-beyond` 的意思是「**超过本模式的目标值**」，不是「4096 起」。
  大棋盘的 4096 是它自己的目标值，于是落在顶档；再往上（8192 起）才归 beyond。

| 档 | 底色 | 上面的字 | 对比度 | 对应数值（经典 / 斐波那契 / 大棋盘） |
| --- | --- | --- | --- | --- |
| 1 | `#c2adff` | `--ink` | 8.71:1 | 2 / 1 / 2 |
| 2 | `#b9a4ff` | `--ink` | 7.98:1 | 4 / 2, 3 / 4 |
| 3 | `#b09bf7` | `--ink` | 7.22:1 | 8 / 5 / 8 |
| 4 | `#a892ee` | `--ink` | 6.51:1 | 16 / 8 / 16 |
| 5 | `#9f89e4` | `--ink` | 5.83:1 | 32 / 13 / 32 |
| 6 | `#9781db` | `--ink` | 5.27:1 | 64 / 21, 34 / 64 |
| 7 | `#7861b8` | `--ink-bright` | 5.00:1 | 128 / 55, 89 / 128 |
| 8 | `#6851a6` | `--ink-bright` | 6.33:1 | 256 / 144, 233 / 256 |
| 9 | `#594195` | `--ink-bright` | 8.03:1 | 512 / 377, 610 / 512 |
| 10 | `#4b3183` | `--ink-bright` | 10.16:1 | 1024 / 987, 1597 / 1024 |
| 11 | `#3c1f71` | `--ink-bright` | 12.91:1 | 2048 / 2584 / 4096 |
| beyond | `#300f62` | `--ink-bright` | 15.32:1 | 超过本模式目标值 |

**为什么浅色档占 6 个、深色档占 5 个**：底色与字色的对比度在 oklch 亮度约 0.55–0.66 之间
有一道「两种字色都过不了 4.5:1」的死区（实测：L=0.60 配白字 4.3、配深字 4.3）。
所以阶梯在死区两侧必须断开一次——前 6 档用深字、后 5 档用白字，中间那一步的亮度跳变
（相邻亮度比 1.54）就是这个断口的代价。Classic 的阶梯在 4→8 之间有一道更大的跳变
（亮度比 3.1），所以这不是 Material 一家的特例，是「11 档 × 4.5:1」的算术后果。
死区附近的第 7 档（5.00:1）是全部 12 档里最紧的一档，写在表里是为了让 T14/T23 复核时
**先看这一档**，而不是等它悄悄漂移。

**障碍（`#49454f`）**：用 on-surface-variant，刻意是一块**中性灰**而不是阶梯里任何一档紫色。
判据与 Classic 同一条：障碍必须同时与「可玩空格」和「数值方块」分得开，而方块永远带数字、
障碍永远不带（棋盘固定结构的一部分，`board.css` 的 `[data-cell='wall']`）。
实测 vs 空格 `#e6e0e9` = 7.21:1，按非文字指示器的 3:1 走（Walls 模式里这一对承载
「哪些格能放方块」）。

**新风格的 `tokens.css` 必须声明 `--wall-bg`**（同 Classic 设计卡 §2 的理由）：
漏了它，`[data-cell='wall']` 的计算值无效、`background` 退回 `transparent`——墙会变回
四个看不见的洞，浏览器一个字都不报。

## 3. 字体角色

- **展示**：标题「2048」与分数数字 → `Roboto Flex`，500（Classic 用 700 + Inter；
  同是无衬线，但字族与字重都不同，落到回退栈也在同一类别内）。
- **正文**：界面标签、按钮、说明 → `Roboto Flex`，400 / 500。
- **方块数值** → `Roboto Flex`，**500**（`--tile-font-weight`，Classic 是 700），
  `font-variant-numeric: tabular-nums` 照旧（合并时数字不抖）。
- **小标签**（分数 / 目标 / 最高方块上的那行）→ 500 + 0.12em 字距 + 大写，
  这是 Material 2 的 label 口径；界面文案是中文，大写只对西文可见，所以真正的识别度
  落在字重 500 与 0.12em 字距上，不靠大写。
- **回退**：同字形类别，`var(--fallback-grotesk)`（ADR-0005；`fonts.css` 把 Roboto Flex
  归在 grotesk 一类）。缺字时整套风格在无衬线一类内降级。
- **字号由外壳的 Tailwind utility 决定**（`text-5xl` / `text-6xl` 写在 `App.tsx` 与
  `StartScreen.tsx` 上，那是外壳骨架、不属于任何风格）。风格拥有的是字族、字重、字距与
  行高；这是当前架构下风格能改的全部排版参数，写下来免得 T23 拿「标题字号不符合 M3 的
  display 尺」来卡这套风格——要改字号先改外壳那两个 utility 类，那不是本风格的事。

## 4. 布局与密度

- 单列居中：标题 → 分数 / 目标 / 最高方块 → 风格选择 → 棋盘 → 方向按钮与操作提示。
  骨架与 Classic 逐字节一致（ADR-0002：棋盘固定结构；外壳骨架也保持一份）。
- **密度比 Classic 松**：控件内边距 0.625rem × 1.5rem（Classic 是 0.625rem × 1.25rem）、
  面板内边距 0.75rem × 1rem（Classic 是 0.5rem × 0.875rem）、终局面板内边距 1.5rem
  （Classic 是 1rem）。间距节奏按 4dp 网格取值，这是 Material 与 Classic 在布局上
  唯一能分开的地方（外壳的 gap / padding 由 Tailwind 统一，见 §5）。
- 棋盘尺寸仍由模式数据与 `BoardLayout.ts` 决定，格子边长、间距、内边距只有一份数值。

## 5. 棋盘与外壳的区别处理

- **棋盘层**（`board.css`，不用任何 Tailwind utility）：固定 DOM 结构 + `boardOverlay`
  / `tileOverlay` 两个装饰插槽。
  - 板面是**一张被抬起的白卡**：`--board: #ffffff` + elevation 投影；
  - 空格是 surface-container-highest（比白卡暗一档），于是「哪一格有方块」靠
    方块 vs 空格的明度层级成立（第一档 vs 空格 1.51:1，与 Classic 的 1.41:1 同量级）；
  - 圆角走 Material 的 shape scale：板面 16px（large）、方块 12px（medium）——
    Classic 两处都是 6px，这是两者一眼可分的地方之一。
- **外壳**（Tailwind utility + 本风格 `styles.css` 的语义类）：管页面底色、文字色、
  间距与响应式。外壳的**布局**（`grid place-items-center px-4 py-8`、`gap-4`）由 `App.tsx`
  统一持有，不属于任何风格；风格拥有外壳的**观感**（表面色、控件形状与配色、字号字重）。
  这条边界写在这里，免得后续把骨架改成三份。
- 两个装饰插槽在 Classic 与 Material **都是空的**（`config.ts` 里返回 null）：
  Material 的层级感全部由 CSS（投影 + 表面色 + 圆角）表达，不需要 DOM 节点；
  真需要结构装饰的风格（Aero 的 gloss、Terminal 的扫描线）届时只改 `config.ts` 的返回值，
  棋盘与引擎都不动（ADR-0002）。插槽机制由 `Board.tsx` 从风格配置解构后渲染，
  不写死成 null——所以这条边界现在就是活的。

## 6. 独有装饰与动效

- **elevation**：板面 3dp 级投影（`0 1px 3px rgba(0,0,0,.12), 0 4px 8px 3px rgba(0,0,0,.1)`），
  方块 2dp 级（`--tile-elevation`）。Classic 禁 `box-shadow`，这正是两套风格在
  `board.css` 上分歧最大的一处：棋盘层给方块留了 `--tile-elevation` 这个**带透明默认值的
  变量**，Classic 不声明它（渲染与改动前逐字节相同），Material 声明自己的投影。
- **位移动效**：`--tile-move-duration: 150ms` + `ease-out`，与其他风格共用，避免长时长和
  前段突跳打断连续游玩。
- **生成动效**：`--tile-spawn-duration: 160ms`（Classic 120ms），只淡入不缩放
  （本风格继续保持这条约定）。
- **合并与胜利**：两段 CSS scale 过渡合计 80ms，在接近落点时启动；React 提交回落阶段时增加的帧间隔会延长浏览器观察到的总时长。不透明胜利面板盖住棋盘，标题轻微淡入。
- **选中态**：被选中的那一枚在投影之上再描一圈 `--focus`（`board.css` 的
  `[data-selected='true']`），环与投影通过 `--tile-elevation` 合成，不会互相顶掉。
- `prefers-reduced-motion: reduce` 下 `--tile-move-duration` / `--tile-spawn-duration`
  归零，投影保留（投影不是动效，是层级）。位移以外的三个效果换成**静止记号**（board.css
  的 reduced-motion 块）：生成与合并描一圈 `--focus`，胜利描粗一档且常驻。用 outline 而
  不是 box-shadow，正是为了不与 elevation 与拾取环抢同一个属性。SPEC §3.2。
- **本风格不用**：渐变、`filter`、扫描线、网格纹理、emoji 装饰、把方块做成 `<button>`。

## 7. 禁用的通用样式

- 禁 Tailwind 调色板色值出现在棋盘与方块层（连 `bg-slate-100` 都不行）；
  也禁出现在外壳——本风格所有色值都在 `tokens.css` 里。
- 禁渐变背景、禁 `filter`、禁 emoji 当装饰。
- 禁把方块做成 `<button>`：方块是状态不是控件，交互归棋盘根元素。
- 禁在 `src/game/` 里出现任何本风格的引用（ADR-0001）。
- 禁用 `opacity` 调文字明度（Classic 的 `.panel__label` 当年用 `opacity: .85`，
  那会让对比度按比例打折；T15 已换成显式声明的 `--ink-variant` / `--ink-bright-variant`）。
  本风格的次要文字另外声明一个够对比度的色值（`--ink-variant`），不靠半透明。

## 8. 手机窄屏策略

- 视口 ≤ 520px 时格子边长收缩（`BoardLayout.fitCellSize`），间距与圆角同比缩小。
  本风格的圆角是**固定 px**（16 / 12），不像字号那样跟着格子缩：Material 的 shape scale
  是绝对尺，格子缩到 71px 时 12px 圆角仍是 12px。这是有意的——圆角是这套风格的识别度，
  跟着缩就会在窄屏上「变形」。
- 信息条从横排改为竖排堆叠，分数不被裁切（外壳的 `flex-wrap` 承担，风格不改骨架）。
- 风格选择器在窄屏与信息条同宽、按文字宽度折行（`flex-auto` + `flex-wrap`，
  与模式按钮同一条路子），不会把棋盘挤出屏外。
- 4dp 密度在窄屏仍然成立：控件内边距不缩，缩的是棋盘与间距。

## 9. 对比度与无障碍

- 正文与小字按 4.5:1 走，非文字指示器（焦点环、选中环、障碍）按 3:1 走。
  所有实际组合与实测比值列在 `contrast.json`，T14 的 `npm run check:contrast` 照它校验。
- **T14 给每一对补上三个字段**：`basis`（口径 regular / large / non-text，与 `minimum`
  必须自洽）、`scene`（start / run / walls，这一对在哪个页面状态下量到）、`probe`（页面上
  真正被量到的元素）。「哪一对靠大字豁免」因此是表上的一个字段；而浏览器那一层
  （tests/e2e/contrast-computed.spec.ts）按 probe 读计算样式——声明对了不等于渲染对了，
  选择器失效、漏了 data-style 这类事只有那一层抓得到。
- 方块数值全部按 4.5:1 走，**没有**任何一档依赖大字 3:1 口径——包括一位数的第一档
  （8.71:1）。Classic 的 8 号是唯一按大字口径走的一档，本风格不需要这个例外，
  所以「字号随位数变化」与本风格的对比度结论完全解耦。
- **T14 复核时确认的两处 start / run 分野**：分组小标签同一个 `.panel__label` 既在 tonal
  面板里（7.22:1）又在开局界面的纸面上（8.88:1），两对都在表内、各自一个 scene。
- **选中环那一对（4.98:1）已并入闸门**：T13 把它补进 `contrast.json` 时留下「T14 做统一
  闸门时不必再推导」的交接，T14 的闸门与浏览器那一层现在都按它验；Classic 的同名一对
  （5.43:1）也一并补齐——两套风格的选中环都落在 `--cell-bg` 上（board.css 的
  `[data-selected='true']`，带 spread 的 box-shadow 画在 border box 外侧）。
- **焦点环用 `outline` 而不是 `box-shadow`**：Material 的层级语言就是投影，
  焦点环再叠一层投影会与 elevation 打架（读者分不清哪层是焦点、哪层是层级）。
  所以控件与板面的焦点都是 `outline: 3px solid var(--focus); outline-offset: 2px`，
  环只与页面色相邻：`#625b71` vs `#fef7ff` = 6.13:1。
- **空格 vs 棋盘（1.30:1）与棋盘 vs 页面（1.05:1）不在表内**，理由同 Classic 设计卡 §9：
  那是装饰性的明度层级。真正承载信息的是「方块 vs 空格」（第一档 1.51:1 起）
  与「障碍 vs 可玩空格」（7.21:1，表内）。
- **成就祝贺（toast）不新增色对**：它只用 §10 列的、本表已经量过的那两对
  （`--control-ink` on `--control-bg` 13.24、`--ink-variant` on `--control-bg` 7.22）。
  闸门一行都不用改，这一条装饰也不欠任何对比度的账。

## 10. 成就祝贺（toast）

解锁一个成就时浮出的一条短提示（ADR-0007；词汇见 `CONTEXT.md` 的 Toast 词条）。它是
**每套风格自己实现的呈现插槽**（ADR-0002），所以这一节是本套的长相与消失表现，
而「什么时候该有一条」全在 store。

**位置与堆叠**

- `position: fixed`，贴视口右上角：`top: 0.75rem`、`left/right: 0.75rem`，向右对齐。
  **不进文档流**——流内的一条提示会把棋盘整体推下去，正在打的一局当场错位。
- 宽 `min(22rem, calc(100vw - 1.5rem))`；最多三条，**最新的一条在最上**，自第二条起
  向下排（gap `0.5rem`，4dp 网格）。第四条到达时丢最旧（单局成就规格的架构决策 6）。
- **为什么是右上**：棋盘在页面正中、方向按钮在它正下方（触摸设备上是一整行），
  右上是这两处之外、且在手机与桌面都留得出空的地方。三条 × 约 `3.5rem` + 间距
  ≈ `12rem`，仍落在棋盘上沿之上。
- 容器 `pointer-events: none`、每张卡片 `pointer-events: auto`：卡片**之外**的点击
  穿透到下面的控件，所以它不拦操作。

**结构**

`div.toast-stack > div.toast[role=status][tabindex=0]`，里面两句：`「解锁成就：」` 与成就名
（一次跃迁里满足几个就写几个，用「、」连起来——一条提示，不是每个成就一条）。
容器与每一条都用 `div` 而不是 `ul`/`li`：这些是**状态消息**，不是「一列东西」；`role="status"` 会把 `listitem` 覆盖掉，剩下的那个 `ul` 在无障碍树里就是一份空列表。

**色彩、形状与字体**

| 用途 | 令牌 | 色值 | 对比度 |
| --- | --- | --- | --- |
| 表面（tonal） | `--control-bg` | `#e8def8` | — |
| 成就名 | `--control-ink` | `#1d192b` | 13.24:1（与 `.panel__value` 同一对） |
| 前缀「解锁成就：」 | `--ink-variant` | `#49454f` | 7.22:1（与面板小标签同一对） |

圆角复用 `--cell-radius`（12px，M3 medium）——它是 tonal 面板的近亲，不另立一套圆角。
字体 `--font-body`（Roboto Flex），成就名 500、前缀 400。

**elevation 与「唯一被抬起的卡」那句话的关系（本卡就地更正）**

此前 `styles.css` 的介绍把板面写成「全屏唯一被抬起的一张卡」。**更正为「静态版面上
唯一被抬起的一张卡」**：toast 是一个**瞬时浮层**，它不在页面的静态层级里，而是像
M3 的 snackbar 那样在 3dp 上短暂停留——与板面同一组投影
（`0 1px 3px rgba(0,0,0,.12), 0 4px 8px 3px rgba(0,0,0,.1)`）。
在它出现的那几秒里，全屏确实有第二张被抬起的卡，而那正是 Material 里
「浮层高于版面」的正常读法。

**动效**

- **进**：`opacity 0→1` + `translateY(-8px)→0`，**180ms** + `ease-out`（与全局同一条曲线，§6）。
- **停**：进场结束之后可见 **5000ms**；指针悬停在这一条上或焦点落在它里面时**暂停计时**，
  移开 / 失焦接着走剩下的时间（不重新计满）。
- **出**：`opacity 1→0` + `translateY(0)→-8px`，**200ms**，动画结束再从栈里移除。
  **投影全程不变**——不 animate `box-shadow`：那是层级，不是动效（§6 的同一条理由）。
- **`prefers-reduced-motion: reduce`**：进 / 出时长归 0（直接出现、直接消失），
  投影与全部色值一个字段都不变——降级的是「怎么动」，不是「长什么样」。

**无障碍**

- `role="status"`（隐式 polite + atomic）：每条只播报一次，且整条在场期间一直留在
  无障碍树里，读屏用户可以回头再读。
- `tabindex="0"` 让它进 Tab 顺序——「焦点在内时暂停」正是靠它成立的。但**从不自动抢焦点**：
  解锁不改变 `document.activeElement`，方向键照旧归棋盘。
- 焦点环用 `outline: 3px solid var(--focus); outline-offset: 2px`（与控件、板面同一条，
  §9 的理由一样：本风格的层级语言是投影，焦点不再叠一层投影）。

**约束核对**：不遮棋盘（贴顶、最多三条）· 不压方向按钮（在页尾，离顶部最远）·
不拦操作（容器穿透）· 三条同屏仍可读（每条一行、最长两行，名字之间顿号分隔）。
