# T29 神魔码与抉择：从打口令到三个结局，一次打穿

- 状态：本地实现与验收完成（GitHub #32 未在本阶段更新）
- 类型：vertical（tracer bullet）
- 原计划阶段：README TODO · 一念神魔
- 父级规格：[`docs/specs/easter-egg.md`](../specs/easter-egg.md)（GitHub [#30](https://github.com/CaiYan12/2048/issues/30)）
- 本票对应：架构决策 1–6、9 前半（前三颗）、11、18；用户故事 1–17、31、39、40、41
- Blocked by: 无

## 交付范围

把「打口诀」这件事本身一次打穿：窗口中八下口令被旁听 → 两颗圆钮现身 → 三个结局各授予该授予的。
六个术语照 CONTEXT.md 走（一念神魔 / 神魔码 / 抉择 / 一念 / 二念 / 悬顶），代码命名与注释一律用它们。

**竖着切的四块**

1. **纯机器** `src/renderer/components/ShenmoChoice.ts`（新增）：神魔码缓冲规则、抉择的四阶段迁移、
   两段窗口各自到期授予什么、一遍怎么算。纯函数 `nextShenmo` + hook `useShenmo`，零 React、零 DOM、
   零计时字段——形状与测试缝照 `ResultPresence.ts`。**它是本票最重要的一块**，单测先写（红）再实现。
2. **store 只加一个字段** `shenmoOutcomes`（`RunFacts` 同步加）：彩蛋唯一碰 store 的地方
   （架构决策 2）。三颗成就因此走现有解锁 / 撤销 / toast 机制，一条新机制都没建。
3. **App.tsx**：窗口 keydown 里旁听那八下（不新增输入态、不吞键；三条让路规定与 Esc 既有行为不变，
   Esc 只多一条本地条件）；渲染两颗钮；删掉末尾三块被注释的「临时调试钩子」。
4. **共享外壳动效 + 三套主题只出 token 与 CSS**：破碎退场、那道环、两段 30 秒全部动画驱动、
   听 `animationend`，**没有一个 JS 定时器**；reduced-motion 下环不可见而计时动画必须留下。

**不属于本票**（别处的活）：礼炮 canvas / 一念按钮 / 败局墓志铭（T30）、二念与悬顶（T31）、
堕落染墨 / 时之狭 / 音效（T32）、CONTEXT.md 与 ADR-0009 与 README 彩蛋分组（T28）。
README 只改了成就个数那一句。

## 验收标准

- [x] 口令八下（↑↑↓↓←→←→）方向键与 WASD 等价；无效方向也计数；一个错键整个清空（清回 0，
      不是「拿错键当地一键重配」）；不设最短间隔（状态里连一个时间字段都没有）；八下照旧推棋盘。
- [x] 三条让路规定（文本入口 / 棋盘区内交互控件 / 带修饰键的组合）与 Esc 的既有行为都不变——
      Esc 只多一条本地条件，照交换摊那条的写法（并列的「或」，不是嵌套）。
- [x] 缓冲区在阶段变化与开新局时清零；开局界面（没有棋盘）输码什么也不发生
      （浏览器契约第一条：开局界面上打完八下再开局，`.shenmo` 一个节点都没有）。
- [x] 两颗圆形按钮 A 与 B 现身：宽视口嵌在包住棋盘的那只壳里向两侧探出，窄视口挪到棋盘下一行；
      两种宽度下都不横向溢出（`documentElement.scrollWidth <= clientWidth`）。
- [x] 菜单不挡棋：方向键照旧走、也不打断它；两颗钮的盒子都不压棋盘；Esc 随时收起。
- [x] 第一级窗口（谁都没点）30 秒后**静默**收起、什么都不授予；第二级窗口（只剩 A）30 秒到时
      授予「当断即断」。先 B 后 A 授予「道通成魔」；先点 A 授予「学艺不精」、两颗同时退场。
- [x] 两个窗口都由动画驱动、`animationend` 收尾，没有一个 JS 定时器；reduced-motion 下环不可见
      而计时动画照跑、窗口照旧到期。
- [x] 前三颗成就入册（七 → 十），条件句都是「本局」口径；所有写死「七个」的地方一并同步。
- [x] 单测钉住纯机器：缓冲规则、阶段迁移、每个结局授予什么、一遍怎么算。
- [x] 浏览器契约用真实按键与真实点击走完整条流程：打码见钮、三个结局各走一遍、阶段变化收起、
      Esc 收起；两段退场用合成 `animationend` 钉。

## 验证

**自动闸门**（全部实跑，数字见 Evidence）

- `npm run typecheck`、`npm test`、`npm run build`、`npm run check:contrast` 全通过。
- 全量 Playwright（**后台、headless**，`workers: 4`，preview 构建产物）0 failed。
- 本文件新增的 `tests/e2e/shenmo.spec.ts`（9 条共享契约 + 1 条三套对照）对三套风格 × 两个视口
  各跑一遍，全绿；`tests/e2e/contrast-computed.spec.ts` 新增一个 `egg` 场景，同例全绿。

**人眼复核没做**：三套风格 × 桌面 / 手机两个视口下「机器答话了」那一瞬间的长相、破碎退场的
「碎」读起来像不像一次崩解、那道环渐薄的节奏——headless 与「不许开真实窗口」的约定下这一半不能
由 agent 代做。本票所有绘制证据都是读回计算样式与合成动画事件，没有人眼看过一次。

**写死「七个」的地方：判断标准是「描写现在 → 跟着现在走；描写当时 → 留在当时」**

- **已同步成十**：`tests/unit/achievements.test.ts` 的长度断言与 id 数组、`tests/e2e/achievements.spec.ts`
  的行数与 id 列表、`README.md` 成就个数那一句、`AGENTS.md` 成就小节、`docs/SPEC.md` §3.3、
  `docs/adr/0007`（补一条带日期的增补，原文一字未改）、`.codex/memories/achievements-single-run.md`
  与 `INDEX.md`、`src/game/achievements.ts` 文件头与 `FIRST_MERGE_COUNT` 的注释。
- **一个字都没动**：`docs/specs/single-run-achievements.md` 的验收框与 Evidence、`.scratch/achievements-single-run/`
  的票据与 `pw-*.log`——它们是**已收官规格在当时**验到的内容，改就是把记录改成假话。
- **父规格 `docs/specs/easter-egg.md` 没动**：它说的「registry grows from seven to eleven」是
  **整组四颗**的口径；本票只落地前三颗（到十），第十一颗由 T31 的「二念」补上。

## Evidence

**实现落在哪**

- `src/renderer/components/ShenmoChoice.ts`（新增）：纯函数 `nextShenmo` + hook `useShenmo` +
  `SHENMO_CODE`（八下方向）、`shenmoCleared`、`ShenmoRunKey`。四个阶段 `idle / choice / breaking / ring`，
  四种输入 `direction / choose / broke / window / away`。**零计时字段**——30 秒只活在 CSS 里。
- `src/game/achievements.ts`：`ShenmoOutcome`（三个果的新类型）、`AchievementId` 追加三颗、
  `ACHIEVEMENTS` 追加三行、`RunFacts.shenmoOutcomes`、`unlockedAchievements` 三条 `includes` 判定。
- `src/renderer/stores/useGameStore.ts`：一个字段 `shenmoOutcomes` + 一个动作 `recordShenmoOutcome`。
  `runFactsOf` 加第四个入参（默认空，三处静默基线不传），`advance` 加第五个（默认跟 store 上那一份）。
- `src/renderer/App.tsx`：三块被注释的调试钩子整块删除；keydown effect 里 Esc 多一条本地条件、
  方向分支多一句 `shenmo.hear(direction)`；棋盘那只壳里渲染两颗钮与那道环。
- `src/renderer/styles/index.css`：结构 / 摆位 / 节奏 / 四条关键帧 / reduced-motion 降级。
- 三套 `tokens.css` 各五个 token、三套 `styles.css` 各三条规则（底面 / 描边 / 焦点环）。**没有第四种插槽**。
- 三套 `contrast.json` 各三对新色对（A/B 字 vs 底面、静止描边 vs 底面、焦点环 vs 页面），新增 `egg` 场景。

**验收数字**

- `npm run typecheck`：**0 error**。
- `npm test`：**812 passed / 44 files**（0 error）。本次**新增 30 条**（`shenmo-choice.test.ts` 24 +
  `achievement-host.test.ts` 彩蛋 6）；`achievements.test.ts` / `contrast.test.ts` /
  `achievements.spec.ts` 是**改写**不是新增（`7 → 10`）。加完新文件之后同树其余部分是 782 / 43，
  两个数相减就是新增量——**没有另做一次 `git stash` 基线**（工作树里有 T28 未提交的改动，
  为了量一个数字把它藏起来再放回来不划算）。
- `npm run build`：**✓ 81 modules transformed，built in 293ms**（T29 前 80 modules，多出来的是 ShenmoChoice.ts）。
- `npm run check:contrast`：**3 套风格 77 对**（T29 前 68；+9 = 三套各三对彩蛋自己的色对），全部达标。
- 全量 Playwright（**后台、headless**，`workers: 4`，preview 构建产物）：**570 passed / 14 skipped /
  0 failed**（1.8m，exit 0）。T29 前是 502 / 14 / 0，差额 68 条 = `shenmo.spec.ts` 的 62 条 +
  `contrast-computed.spec.ts` 新 `egg` 场景的 6 条。
- `game.spec.ts` 按既有做法另跑 `--repeat-each=4`：**40 passed / 0 failed**（键盘全流程那条，防止本票
  把方向键的契约改坏）。
- 本票新增 `tests/e2e/shenmo.spec.ts`：**62 条全绿**（9 条共享契约 × 3 风格 × 2 视口 = 54，加 1 条
  三套对照 × 2 视口 = 2，加 `contrast-computed.spec.ts` 新增的 `egg` 场景 3 风格 × 2 视口 = 6）。

**新增 / 改写的测试契约**

1. `tests/unit/shenmo-choice.test.ts`（新增 24 条）：码缓冲（八下、少一下、一个错键清回 0 且不是
   「错键当地一键」、摊开着不攒码、无时间窗由状态形状证明）、阶段迁移（B → breaking → brok(e) → ring、
   碎到一半点 A 算走完、B 不在时点 B 是空气）、三个结局各授予什么、每段窗口只在自己那一段到期、
   `away` 什么都不授予、一遍只算 B → A、同一个果可以结第二次（编号动、字不动）。
2. `tests/unit/achievements.test.ts`：`toHaveLength(7)` → `10` 与十个 id 数组；新增「一念神魔的三个果」
   一组七个用例（含「放任第一段窗口流尽不在这个联合里」——用类型钉住架构决策 5）。
3. `tests/unit/achievement-host.test.ts`：新增「一念神魔的果」六条（记账即解锁、三个果三条祝贺而集合
   仍按注册表次序、同一个果只记一次、撤销收不回、彩蛋进度一个字节都不落盘、新一局归零）。
4. `tests/e2e/shenmo.spec.ts`（新增）：共享契约九条 + 三套对照一条。
   - `打口令见两颗钮`：先量一眼「↑ 按下去棋盘一个字节都没动」（无效移动），再打完余下七下——
     「无效方向也计数」因此是量到的事实而不是推测；
   - `WASD 等价，一个错键整个清空`；
   - `菜单不挡棋`：摊开着按方向键棋盘照旧变；容器 `pointer-events: none`；两颗钮的盒子都不压棋盘；
     Esc 收起且三个彩蛋名字一个都没出现；
   - `结局一`：点 B → `breaking` → 合成 `animationend` → `ring`，断环的计算样式真的是
     `shenmo-ring` / `30s` → 点 A → 道通成魔；
   - `结局二与三之一`：先点 A → 学艺不精；第一段窗口静默到期（合成 `shenmo-window`）→ 菜单没了、
     三个名字一个都没出现；
   - `结局三之二`：第二段窗口到期（合成 `shenmo-ring`）→ 当断即断；
   - `阶段变化与开新局`：第九下达标 → `[data-result-tier="won"]` 出现、摊当场消失、什么都没授予；
     再走一遍「打码 → 新游戏」证开新局也清零；
   - `reduced-motion`：环的 `border-top-color` 是 `rgba(0, 0, 0, 0)`（撤颜料，不是撤动画）、
     `animation-name` 换成 `shenmo-ring-still` 而时长仍是 `30s`，窗口照旧到期；
   - `摆位与红线`：按视口分岔——宽视口断两颗钮探出棋盘盒子两侧、窄视口断它们在棋盘下一行；
     两种都断 `scrollWidth <= clientWidth`；
   - `假时钟`：`page.clock.install()` 之后整套流程照旧走完——任何藏在 JS 里的定时器都会在那儿冻住；
   - `三套各穿自己的衣服`：三个渲染出来的底面两两不同、三个描边两两不同（不写死色值）。
5. `tests/e2e/contrast-computed.spec.ts`：新增 `egg` 场景（打码 → 量两颗钮自己的三对色）。
6. `tests/unit/contrast.test.ts`：Claude 的暖色配对数 4 → 5（新增的那对是彩蛋两颗钮的焦点环，
   仍落在既有的「此刻有焦点」这一个用法上，**没有引入第二块暖色**）。

**踩到的坑（六条，都是本票自己踩的）**

1. **`@media` 写在基础规则前面， specificity 同分时被后来者盖回去。** 宽视口那段
   `@media (min-width: 760px)` 原本放在 `.shenmo__button` 基础规则**之前**，而两边都是 (0,1,0)：
   基础规则那条 `position: relative` 于是赢了，宽视口的 `position: absolute` / `top: 50%` 整个失效。
   现象极具欺骗性——`left`、`translate`、`top` 都「生效」了（它们分别来自 (0,2,0) 的按钮选择器和
   只在媒体块里声明的 `top`），只有 `position` 没换上，于是两颗钮停在棋盘正中间、几何断言
   `buttons[0].left < board.left` 拿到 529 < 410 而红。**没有报错、没有警告**，只是「钮没探出去」。
   修法：把整块搬到基础规则之后，并在那里写一条注释说明为什么不能挪回去。
   探针当时量到的数字（viewport 1280×720 / `documentElement` 1280/1280 / 760px 断点两侧余量 /
   按钮 computed `position: relative` + `translate: calc(-100% - 10px) -50%`）就是定案的依据；
   探针本身是一次性的，已删，它告诉你的事记在这里。
2. **`newGame` 不改变「这一局还在打」这个布尔量。** 机器的收起信号原本是 `active =
   game !== null && phase === 'playing'`。`newGame` 之后 phase 还是 `playing`、`game` 也不是 null，
   一个比特都不动——而摊必须收起（用户故事 8 的后半句）。是浏览器契约抓到它的：
   「开新局也清零」那条断言在 6 个组合上全红。修法是把收起信号从**布尔量**换成**值**
   （`ShenmoRunKey`，宿主拼 `phase @ runStartedAt`）：身份一变就收起，而换局必然变身份。
   这也解释了为什么不能用 `game` 对象身份——撤销一步就换一个引用，摊会被撤销收掉。
3. **结果层延迟卸载那 150ms 里有第二个「新游戏」。** 点过面板上那一颗之后，正在淡出的面板还在
   DOM 里，`getByRole('button', { name: '新游戏' })` 当场撞 strict mode。修法是把点击指到
   `[data-panel="win"]` 里那一颗。**这是 T27 的在场裁决顺带来的一个新测试面**，写彩蛋用例时会遇到。
4. **摊开着时旁听不攒码，所以「错键」用例不能接着上一次成功打码做。** 上一次摊还开着，
   机器按规则 1 忽略所有方向——再按四下什么都不会发生，看着像「清除没生效」。修法是换一局重开。
5. **CSS 声明漏尾分号在这个仓库是第三次踩坑，本票一次都没有。** 每改一个 CSS 文件都跑了
   `grep -nE '^\s+[a-z-]+:[^;{}]*$' <file>`，报出来的全是注释里的句子与跨行值的续行。
6. **`animationend` 会冒泡**（T27 的第 4 条坑，本票原样复现）：B 的破碎动画与 A 的环都在
   `.shenmo` 里，不判 `event.target === event.currentTarget` 的话 B 碎一下会被当成窗口到期。
   两个处理器都判了，并且断言的 animationName 也各管各的（`shenmo-break-fade` / 两条窗口）。

**两处歧义，按证据裁了，写在明处**

1. **口令是八下还是六下。** 父规格与 issue 的正文都有「six presses / 六下」，而两处**把序列写全了
   的地方都是八下**（父规格 Goal 段 "up, up, down, down, left, right, left, right"、issue 标题段
   「↑↑↓↓←→←→」），并且经典游戏机口诀的方向段本来就是八下。按序列走，**八下**；单测用
   `SHENMO_CODE.length` 把它钉住，注释里写明「six」是笔误。
2. **三句用户原话在注册表里没有位置。** 业主给的三句——「既见未来，为何不拜？」「形不成形，
   意不在意」「心若不决，毋寻邪道」——不是**条件**，而 `AchievementDefinition.condition` 是战绩面板
   照实显示的「本局」口径；父规格的架构决策 9 也只为**二念**那一颗开了可选的 `note` 字段。
   所以三句话记在 `src/game/achievements.ts` 注册表上方的注释与本票里，由后面的呈现票
   （T30/T31）决定它们落在哪一套风格的哪一句祝词上。**没有**为它们加字段——那会让面板说谎。

**顺带补上的一件事**：用户故事 40（「别让一个笑话花掉可读性」）落在本票的是**那两颗钮**自己。
于是三套 `contrast.json` 各加三对、闸门新开一个 `egg` 场景，68 → 77 对。**悬顶与一念按钮那两半
不属于本票**（T31/T30），届时那一层的色对由它们补。

**设计技能（业主点名，已读并遵循）**：`~/.agents/skills/design-flow/SKILL.md`（总索引）+ 三个子技能
`frontend-design` / `animate` / `frontend-ui-engineering`。按它们做了这几条：

- `frontend-design`「Spend your boldness in one place」——全特性只有一个签名时刻：B **裂成两片飞开**。
  其余全部安静（两颗钮是各自风格既有控件语言的延伸，没有新颜色、没有新投影语言）。
- `frontend-design`「Typography carries the personality」——两颗钮用 `--font-display` + 700，
  即「这一套里最大的那个字」，A 与 B 因此读起来像机器在说话，不像一对图标按钮。
- `animate`「Extend the codebase's tokens, don't fork them」——150ms + 内置 `ease-out` 一条曲线都不多
  （T27 定的共享姿态）；破碎退场同样 150ms，没有引入第二条曲线。
- `animate`「transform / opacity only」+「clip-path 是第四个」——破碎的「裂」靠 `clip-path` 剪两半，
  环的渐薄靠 `scale`，没有碰 width / border-width / top / left。
- `animate`「Should this animate at all」——两颗钮现身只做一次 150ms 淡入 + 升起 4px（与结果层卡片
  同一条）；**两段窗口不做「倒计时数字」**：它是唯一真正承载信息的动画，30 秒一秒一跳的读数是
  数据在动，不是风格在动。
- `frontend-ui-engineering`「Accessibility」——两颗钮是真 `<button>`、可 Tab、带 `aria-label`；
  环 `aria-hidden`（它不承载文字信息）；破碎那两片是伪元素，天生不进无障碍树。
- `frontend-ui-engineering`「Contrast ≥ 4.5 / ≥ 3」——两颗钮自己的三对色对进闸门（68 → 77）。

**与本项目既有约定冲突、而我选了既有约定的地方（两处）**

1. `animate` 的 `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`「别用内置 ease-out 做刻意的动画」——
   本项目从 T21 起把 **150ms + 内置 ease-out** 记成一条「已接受的稳定性决定」（AGENTS.md 的 T21 一节
   明写「别引入第二条曲线」）。按项目约定走，**没有**引入自定义 cubic-bezier。
2. `frontend-ui-engineering` 的 hover 建议（`@media (hover: hover) and (pointer: fine)` 门控）——
   本项目 `.control:hover` 一贯是裸的背景互换、不过门控（触屏上误触一次 hover 的代价只是颜色变一下）。
   照既有形状走，**没有**给两颗钮加 hover 门控。

**没做的 / 边界**

- **人眼复核没做**（见「验证」）。
- **没有一个真的 30 秒被等完**：时长由计算样式（`animation-duration: 30s`）+ 合成 `animationend`
  + 假时钟三条证据钉住，没有一条用例真的等 30 秒。第一段窗口那条 `shenmo-window` 是一条
  「opacity 恒为 0、只缩放」的动画——**刻意不写成空动画**：「什么都不做」的动画会不会派发
  `animationend` 是引擎的实现细节，不该拿一个 30 秒的窗口去赌。
- **破碎退场是「裂成两片飞开」而不是粒子**：`clip-path` 把 B 剪成左右两半、各飞 6px 并旋转 8°。
  真正的碎屑粒子是 T30/T32 的活，tracer bullet 不越界。
- **彩蛋进度不落盘**（内存字段，与 `settlementAttribution` 同一条理由）：刷新之后这一局的彩蛋
  从零起，果也还能再结一次。父规格的架构决策 10 对二念那一颗说的就是这件事，本票照办。
- **没有为那两颗钮加 `aria-live`**：摊现身的时候读屏软件不会主动播报。两颗钮是可聚焦、带
  `aria-label`（「抉择 A」/「抉择 B」）的真按钮，键盘 Tab 到得了（用户故事 39 的正文要求）；
  「出现时被念出来」是 AAA 一级的事，且需要决定它会说什么——留给控制人拍板。
