# 2048 实现执行计划

由 24 张已发布 ticket 按依赖拓扑合成，供 subagent-driven-development 使用。
父级规格: [SPEC](../SPEC.md)；规则契约: [mode-contract](../mode-contract.md)；
目标与约束: [GOAL](GOAL.md)；词汇表: [CONTEXT.md](../../CONTEXT.md)。

**T24（CI 闸门与 Pages 发布）不在本计划内** —— GOAL 明确暂不上线部署。

## Global Constraints

以下约束对所有 Task 生效，是每次评审的注意焦点。

### 架构铁律

1. `src/game/` 零 DOM 引用，随机源与时间由调用方注入（ADR-0001）。
2. 一套风格 = `themes/<id>/` 下 `DESIGN.md` + `tokens.css` + `styles.css` + `config.ts` + `contrast.json` + `toast.tsx`；
   棋盘只渲染固定 DOM 结构 + `boardOverlay` / `tileOverlay` 两个装饰插槽（ADR-0002）。
3. 棋盘与方块层用 `board.css`，**不用** Tailwind utility；Tailwind 只修饰外壳。
4. 撤销不设上限、不静默丢弃历史（ADR-0003）。
5. 复古闪烁 ≤ 1.5Hz（ADR-0004，本版本目标不含复古风格，先不实现）。
6. 字体自托管 + 同字形类别回退；切风格时须重新检测该风格实际使用的字体（ADR-0005）。

### 代码风格（房子风格）

2 空格、单引号、**无分号**、尾随逗号；`PascalCase.tsx` 具名导出 + 局部 `interface Props` +
显式 `: JSX.Element` 返回类型；`SCREAMING_SNAKE` 模块常量；`interface` 用于对象、`type` 用于联合；
`.tsx` 旁放纯逻辑 `.ts` 兄弟文件；注释用中文并解释「为什么」；无 eslint / prettier。

### 测试与验收

- Vitest 只测纯逻辑，集中 `tests/unit/`，**不用** `@testing-library/react`。
- UI 行为走 Playwright，`webServer` 健康检查用 `localhost`。
- 不测私有助手函数；规则引擎经公开 `createGame` / `move` / `swap` / `undo` / `tick` 测。
- **验收不止代码通过**：必须 Playwright 视觉检查 + 真实浏览器实际游玩。
- 每票完成需：`npx tsc --noEmit` 零错、`npm test` 全绿、`npm run build` 成功、
  相关 e2e 通过，并在真实浏览器里跑过。
- 不得把未实际运行的验证说成通过；不得声称 Pages / 真机证据。

### 提交

中文 Conventional 风格，正文用 `-` 列表，末尾 `验证：` 行；
提交信息结尾追加 `Co-Authored-By: Claude Code <noreply@anthropic.com>`。
不建额外分支（当前已在 worktree 分支上），不部署、不发布、不关闭 Issue 作为完成票的副作用。

---

## Task 1: T01 固化模式示例与结算边界

# T01 固化模式示例与结算边界

- 状态：已发布，待项目所有者决策；GitHub [#2](https://github.com/CaiYan12/2048/issues/2)
- 类型：decision gate
- 原计划阶段：P1
- SPEC 用户故事：3–16、21
- Blocked by: none

## 交付范围

在 `docs/SPEC.md` 与 `tests/unit/fixtures/` 固化四个 Walls 坐标、非 Classic 生成权重、Fibonacci 连锁合并示例，以及终局后 Undo／作弊交换是否可恢复和结算时点。不得在此票实现游戏。

## 验收标准

- [ ] 所有未定参数都有明确取值与至少一个具体例子；不再出现“实现时定”。
- [ ] 死局、限时到时、达标后继续、终局后操作与结算的先后关系可画成无歧义状态图。
- [ ] 更新 SPEC、计划与受影响 ADR；下游 ticket 可据此写确定性测试。

## 验证

人工对照 SPEC 第 5 节与原计划；确认每项已被明确决策。

## Task 2: T02 建立可运行、可检查的空壳应用

# T02 建立可运行、可检查的空壳应用

- 状态：已发布，待执行；GitHub [#3](https://github.com/CaiYan12/2048/issues/3)
- 类型：enabling infrastructure
- 原计划阶段：P0
- SPEC 用户故事：29–30
- Blocked by: none

## 交付范围

建立根目录 `index.html`、钉死的依赖与 lockfile、Vite/TypeScript/Tailwind、Vitest/Playwright 配置和最小 React 空壳。CI 从 `npm ci` 到 typecheck、测试与构建；配置 Pages 子路径但本票不发布。

## 验收标准

- [ ] `npm run dev`、`npm run typecheck`、`npm run build`、`npm run preview` 可执行。
- [ ] Playwright 的本地服务地址与 `baseURL` 一致，构建预览能加载 CSS 与已有字体。
- [ ] P0 零测试通过被明确标记为工具链检查；第一条真实测试加入后移除 `passWithNoTests`。

## 验证

执行四个 npm 脚本、检查构建资源路径与 CI 配置；记录准确的依赖版本。

## Task 3: T03 交付可移动和计分的 Classic 纵向切片

# T03 交付可移动和计分的 Classic 纵向切片

- 状态：已发布，待执行；GitHub [#4](https://github.com/CaiYan12/2048/issues/4)
- 类型：vertical
- 原计划阶段：P1–P2
- SPEC 用户故事：1–5、27–29
- Blocked by: T01, T02

## 交付范围

以 Classic 数据贯通纯规则内核、可恢复随机源、单 Zustand store、固定 Board/Tile DOM、`board.css`、Classic 设计卡与样式、键盘操作和得分 UI。

## 验收标准

- [ ] 固定棋盘中一次合法 Move 按合并表滑动、合并、计分并生成；无效 Move 不生成。
- [ ] Tile 身份不随位置变化；输入键仅在游戏目标上拦截，其他控件保留默认键盘行为。
- [ ] 有纯逻辑测试与确定性 Playwright 合并测试；P1 起单测不能零测试通过。

## 验证

`npm test`、typecheck、build、Playwright 固定局面测试及真实浏览器键盘试玩。

## Task 4: T04 交付胜利、死局与新游戏路径

# T04 交付胜利、死局与新游戏路径

- 状态：已发布，待执行；GitHub [#5](https://github.com/CaiYan12/2048/issues/5)
- 类型：vertical
- 原计划阶段：P2–P3
- SPEC 用户故事：6–7
- Blocked by: T03

## 交付范围

在规则状态、Store 与界面贯通目标达成、继续玩、死局、结算原因及新游戏；提供 WinPanel 与 GameOverPanel。

## 验收标准

- [ ] 首次达到目标只显示一次胜利状态；继续玩保留分数和棋盘。
- [ ] 四方向皆无合法 Move 时显示死局；新游戏不沿用旧局面。
- [ ] 确定性单测与 e2e 覆盖胜利继续、死局和重开。

## 验证

`npm test`、Playwright 终局路径、桌面浏览器人工复核。

## Task 5: T05 交付 Fibonacci 模式

# T05 交付 Fibonacci 模式

- 状态：已发布，待执行；GitHub [#6](https://github.com/CaiYan12/2048/issues/6)
- 类型：vertical
- 原计划阶段：P1
- SPEC 用户故事：8
- Blocked by: T01, T03

## 交付范围

以已固化的合并表和生成权重贯通模式声明、规则内核、数值标签、模式选择和棋盘 UI。

## 验收标准

- [ ] `1+1→2`、`1+2→3` 及更多相邻斐波那契对按固定顺序合并；每 Tile 每 Move 最多参与一次合并。
- [ ] 开局和后续生成只使用该模式声明的数值与权重；目标为 2584。
- [ ] 单测覆盖合并顺序、得分、生成、死局和胜利；Playwright 可选择并游玩该模式。

## 验证

单测加浏览器模式切换与固定局面 e2e；检查长数字显示。

## Task 6: T06 交付 Big Board 模式

# T06 交付 Big Board 模式

- 状态：已发布，待执行；GitHub [#7](https://github.com/CaiYan12/2048/issues/7)
- 类型：vertical
- 原计划阶段：P1
- SPEC 用户故事：9
- Blocked by: T01, T03

## 交付范围

贯通 5×5 模式声明、规则状态、Board 布局和响应式显示。

## 验收标准

- [ ] 棋盘确为 25 Cell、目标为 4096，移动与生成覆盖边缘行列。
- [ ] 桌面与手机视口均无横向溢出、Tile 遮挡或不可点击控件。
- [ ] 单测与 Playwright 覆盖 5×5 开局、移动、终局。

## 验证

单测、两个视口的 Playwright 与截图复核。

## Task 7: T07 交付 Walls 模式

# T07 交付 Walls 模式

- 状态：已发布，待执行；GitHub [#8](https://github.com/CaiYan12/2048/issues/8)
- 类型：vertical
- 原计划阶段：P1
- SPEC 用户故事：10
- Blocked by: T01, T03

## 交付范围

使用已固化四格图案贯通模式声明、障碍分段移动、固定障碍呈现和模式选择。

## 验收标准

- [ ] Wall 永不移动、合并或生成 Tile，移动轨道被 Wall 正确分段。
- [ ] 开局可玩；障碍与数值 Tile 在键盘和视觉上可区分。
- [ ] 单测覆盖 Wall 两侧滑动/合并/死局，Playwright 可游玩并看到四格图案。

## 验证

确定性单测与桌面/手机 e2e。

## Task 8: T08 交付 UTC Daily 模式

# T08 交付 UTC Daily 模式

- 状态：已发布，待执行；GitHub [#9](https://github.com/CaiYan12/2048/issues/9)
- 类型：vertical
- 原计划阶段：P1
- SPEC 用户故事：11
- Blocked by: T01, T03

## 交付范围

贯通 UTC 日期到种子、可恢复的 PRNG 进度、Daily 入口与日期说明。

## 验收标准

- [ ] 相同 UTC 日期与输入序列得到相同初始及后续棋盘；时区变化不改变结果。
- [ ] UTC 零点后的新局使用新题，已开始的一局保持原种子。
- [ ] 单测覆盖日期边界与确定性序列，Playwright 能选择和游玩 Daily。

## 验证

以注入时间做单测；浏览器验证日期标签与玩法。

## Task 9: T09 交付 Time Attack 模式

# T09 交付 Time Attack 模式

- 状态：已发布，待执行；GitHub [#10](https://github.com/CaiYan12/2048/issues/10)
- 类型：vertical
- 原计划阶段：P1–P3
- SPEC 用户故事：12
- Blocked by: T01, T04

## 交付范围

贯通三分钟截止时间、可区分的超时/死局原因、倒计时 UI、模式选择与时间注入。

## 验收标准

- [ ] 三分钟实时时间到即结束；后台、刷新不延长时限。
- [ ] 提前死局时以死局原因结束；计时器不会创建第二次结算。
- [ ] 单测覆盖边界时间与结束原因，Playwright 使用可控时钟验证界面。

## 验证

单测、Playwright 时钟测试和真实浏览器后台/刷新复核。

## Task 10: T10 交付触屏滑动和方向按钮

# T10 交付触屏滑动和方向按钮

- 状态：已发布，待执行；GitHub [#11](https://github.com/CaiYan12/2048/issues/11)
- 类型：vertical
- 原计划阶段：P3
- SPEC 用户故事：13
- Blocked by: T03

## 交付范围

把指针手势与触摸设备方向按钮接到同一 Move action；输入原始位置保存在 ref，派生显示状态按需进入 React。

## 验收标准

- [ ] 四方向滑动达到阈值时各触发一次 Move，短滑/取消不误触。
- [ ] 触摸设备可见方向按钮，非触摸设备不占用布局。
- [ ] Playwright 手机视口覆盖滑动与按钮，键盘路径无回归。

## 验证

移动设备仿真 e2e 与真实触屏浏览器试玩。

## Task 11: T11 交付无次数上限的撤销

# T11 交付无次数上限的撤销

- 状态：已发布，待执行；GitHub [#12](https://github.com/CaiYan12/2048/issues/12)
- 类型：vertical
- 原计划阶段：P3
- SPEC 用户故事：14
- Blocked by: T01, T03, T04

## 交付范围

贯通纯逻辑前态、Store 历史、Undo 按钮与键盘操作；不加 assisted 标记。

## 验收标准

- [ ] 仅有效 Move 进入历史；连续 Undo 可从超过旧 N 步的长局回到开局。
- [ ] 棋盘、分数、Tile 身份、随机源进度和胜利/终局状态随 Undo 一起恢复。
- [ ] 测试测量长局历史成本，不通过截断旧状态满足内存限制。

## 验证

确定性单测、长局自动化撤销与浏览器 UI 验证。

## Task 12: T12 交付可撤销的作弊交换

# T12 交付可撤销的作弊交换

- 状态：已发布，待执行；GitHub [#13](https://github.com/CaiYan12/2048/issues/13)
- 类型：vertical
- 原计划阶段：P4
- SPEC 用户故事：15–16
- Blocked by: T01, T07, T11

## 交付范围

贯通 swap 规则、选择态、StatusBar 按钮、键盘/Esc 路径、障碍限制和操作播报。

## 验收标准

- [ ] 两枚数值 Tile 交换位置且分数不变；同格二次选择取消，Wall 不能选。
- [ ] 交换加入 Undo 历史并重判死局；终局后行为遵守 T01 的结算决策。
- [ ] 纯键盘与指针均可完成和退出交换；单测/e2e 覆盖。

## 验证

单测与 Playwright 键盘/指针/Walls 用例。

## Task 13: T13 用 Material 交付第一条完整风格切换路径

# T13 用 Material 交付第一条完整风格切换路径

- 状态：已发布，待执行；GitHub [#14](https://github.com/CaiYan12/2048/issues/14)
- 类型：vertical
- 原计划阶段：P5
- SPEC 用户故事：17–18、27–28
- Blocked by: T03

## 交付范围

建立主题注册、`data-style`、两装饰插槽、风格选择器和 Material 的独立设计卡/样式，使 Classic↔Material 在局中切换。

## 验收标准

- [ ] 风格切换立即改变外观，但棋盘、分数、计时及 PRNG 进度不变。
- [ ] Material 具有独立的色彩、层级、排版及响应式处理；开局与局中均能选择。
- [ ] 局部修改只涉及主题文件夹、注册表及通用风格选择 UI，不改规则内核。

## 验证

Playwright 切换状态不变断言、桌面/手机截图与设计卡核对。

## Task 14: T14 补齐字体切换与风格对比度验收

# T14 补齐字体切换与风格对比度验收

- 状态：已发布，待执行；GitHub [#15](https://github.com/CaiYan12/2048/issues/15)
- 类型：vertical
- 原计划阶段：P5
- SPEC 用户故事：24、26–27
- Blocked by: T13

## 交付范围

以 Classic/Material 为真实样本修复切换后字体状态、逐家族版权/OFL、`contrast.json` 与校验脚本，并验证页面实际计算样式。

## 验收标准

- [ ] 切到首次使用的字体时 loading/ready/fallback 正确更新；慢网和 404 不永久误报 ready。
- [ ] 两套风格的文字、Tile、按钮与焦点前景/背景对达到统一阈值；声明与 computed style 一致。
- [ ] 每个已用字体家族有对应授权及版权文本，构建预览能加载本地字体。

## 验证

`npm run check:contrast`、Playwright 拦截字体请求与浏览器样式检查。

## Task 15: T15 交付 Claude Design 风格

# T15 交付 Claude Design 风格

- 状态：已发布，待执行；GitHub [#16](https://github.com/CaiYan12/2048/issues/16)
- 类型：vertical
- 原计划阶段：P5
- SPEC 用户故事：17–18、24、26–28
- Blocked by: T14

## 交付范围

在 `src/renderer/styles/themes/claude/` 先写 `DESIGN.md`，再实现 `tokens.css`、`styles.css`、`config.ts`、`contrast.json` 并注册该风格。设计卡需使“排版、留白与暖色层级”可被识别；重点检查标题、正文、卡片与长数值的协调。只使用固定 Board 结构和两个装饰插槽，不改规则内核。

## 验收标准

- [ ] 开局风格选择器与局中切换均可选择 Claude Design；切换前后棋盘、分数、随机进度及计时不变。
- [ ] 桌面与手机截图能逐项对照设计卡；目标、长数值、胜负面板、键盘焦点及触屏操作保持可用。
- [ ] `contrast.json` 达统一阈值且与计算样式一致；该风格的字体失败和 reduced-motion 状态有明确回退。
- [ ] Playwright 覆盖该风格与当前已完成模式的基础路径；全部六模式完成后纳入 18 组合矩阵。

## 验证

运行 typecheck、build、contrast 与该风格的 e2e；人工检查桌面/手机截图及设计卡。

## Task 16: T16 保存并恢复设置与当前一局

# T16 保存并恢复设置与当前一局

- 状态：已发布，待执行；GitHub [#17](https://github.com/CaiYan12/2048/issues/17)
- 类型：vertical
- 原计划阶段：P6
- SPEC 用户故事：19–20
- Blocked by: T08, T09, T11, T12, T13

## 交付范围

以版本化本地存储贯通 settings/session 与 UI：保存模式、风格、音效开关、棋盘、分数、PRNG 进度、Undo 历史、胜利状态和限时截止时间；提供损坏/写入失败提示。

## 验收标准

- [ ] F5 后棋盘、下一次随机生成、Undo 路径、当前风格及 Time Attack 剩余时间与未刷新时一致。
- [ ] 旧版或损坏数据不静默当作可续玩；写入失败在界面可见。
- [ ] 新游戏放弃未结算 session，不擦除已结算数据；用浏览器 e2e 验证。

## 验证

存储恢复的纯序列化测试、Playwright 刷新/损坏/配额失败路径。

## Task 17: T17 按结算风格写入记录并展示统计

# T17 按结算风格写入记录并展示统计

- 状态：已发布，待执行；GitHub [#18](https://github.com/CaiYan12/2048/issues/18)
- 类型：vertical
- 原计划阶段：P6–P7
- SPEC 用户故事：21–22
- Blocked by: T04, T13, T16

## 交付范围

贯通 run settlement、`records[mode][style]`、基础 stats 和 StatsPanel；达标后继续玩的胜局标志保留到结算。

## 验收标准

- [ ] 切换风格本身不写记录；结算时仅当前风格的记录变化。
- [ ] 最高分、最高 Tile、总局数、胜局数和时长按规则更新，新游戏放弃未结算局不记记录。
- [ ] 浏览器可按模式和风格查看结果；单测/e2e 覆盖切风格后结算。

## 验证

确定性结算单测及 Playwright 记录/统计流程。

## Task 18: T18 交付九个模式轴成就

# T18 交付九个模式轴成就

- 状态：已发布，待执行；GitHub [#19](https://github.com/CaiYan12/2048/issues/19)
- 类型：vertical
- 原计划阶段：P7
- SPEC 用户故事：22
- Blocked by: T05, T06, T07, T08, T09, T17

## 交付范围

以纯函数判定和持久化进度贯通计划附录中的九个模式轴成就及即时提示；每日坚守按连续 UTC 日期。

## 验收标准

- [ ] 九个成就均有可重放的解锁和不解锁用例；跨局进度在刷新后保持。
- [ ] 撤销、作弊与继续玩是否满足“完美一局/无作弊通关”遵照 T01 固化的结算定义。
- [ ] UI 提示每次解锁一次，StatsPanel 可查看已解锁状态。

## 验证

纯逻辑成就测试与 Playwright 跨局/刷新验证。

## Task 19: T19 交付风格旅行者成就

# T19 交付风格旅行者成就

- 状态：已发布，待执行；GitHub [#20](https://github.com/CaiYan12/2048/issues/20)
- 类型：vertical
- 原计划阶段：P7
- SPEC 用户故事：22
- Blocked by: T15, T17, T18

## 交付范围

贯通本次唯一风格轴成就“风格旅行者”的切换计数、即时提示和持久化。只统计同一局内真实的风格切换事件；未来的“全风格征服”与“复古大师”留在 README TODO。

## 验收标准

- [ ] 同一局内实际切换超过计划阈值时只解锁一次；重复选择当前风格不计次。
- [ ] 刷新后本局切换计数与已解锁状态保持，结束后不会给未来风格成就记进度。
- [ ] 纯函数与 Playwright 覆盖阈值前后、刷新和重复选择。

## 验证

运行成就单测和三基准风格间切换的 Playwright 用例。

## Task 20: T20 交付可静音的程序化音效

# T20 交付可静音的程序化音效

- 状态：已发布，待执行；GitHub [#21](https://github.com/CaiYan12/2048/issues/21)
- 类型：vertical
- 原计划阶段：P8
- SPEC 用户故事：23
- Blocked by: T03, T16

## 交付范围

在移动、合并、胜利和失败事件中使用 WebAudio 实时合成不同音色，音高随 Tile 数值变化；提供持久化 mute 控件。

## 验收标准

- [ ] 首次用户手势前不创建 AudioContext；仓库不增加音频文件。
- [ ] mute 后不触发可听输出，刷新后保持 mute；音效不改变规则状态。
- [ ] 浏览器验证常见事件的发声与静音切换。

## 验证

浏览器事件验证、Playwright mute 状态与仓库资产检查。

## Task 21: T21 交付方块动效与静态替代

# T21 交付方块动效与静态替代

- 状态：已发布，待执行；GitHub [#22](https://github.com/CaiYan12/2048/issues/22)
- 类型：vertical
- 原计划阶段：P9
- SPEC 用户故事：24、27
- Blocked by: T14, T15

## 交付范围

基于 Tile 稳定身份实现移动连续、生成入场、合并脉冲和胜利序列；逐项设计 reduced-motion 静态替代。

## 验收标准

- [ ] 滑动、生成、合并和胜利的视觉反馈与实际状态一致，无重复 Tile 或瞬移。
- [ ] `@starting-style` 仅用于适用的入场，其他动作采用合适的 CSS 过渡/动画。
- [ ] reduced-motion 下无位移动画但状态和操作完整。

## 验证

Playwright 动效状态及 reduced-motion 用例、真实浏览器截图/录屏复核。

## Task 22: T22 完成键盘、触屏与屏幕阅读器验收

# T22 完成键盘、触屏与屏幕阅读器验收

- 状态：已发布，待执行；GitHub [#23](https://github.com/CaiYan12/2048/issues/23)
- 类型：vertical
- 原计划阶段：P10
- SPEC 用户故事：13–16、24–26
- Blocked by: T09, T10, T12, T19, T20, T21

## 交付范围

对完整游戏流程做键盘焦点、控件语义、状态播报和 reduced-motion 验收；各风格自己的视觉与对比度验收留在对应风格 ticket，矩阵与响应式总验收由 T23 负责。

## 验收标准

- [ ] 纯键盘可从开局到结束，含选择风格、Undo、作弊交换和重开；控件焦点始终可见。
- [ ] 屏幕阅读器能理解棋盘及关键结果，Move 不产生重复播报。
- [ ] 触屏与 reduced-motion 下关键路径可用；发现的跨风格问题有明确修复和复验结果。

## 验证

Playwright 关键流程、手动键盘/触屏/屏幕阅读器会话与截图证据。

## Task 23: T23 完成全部模式 × 风格的浏览器矩阵验收

# T23 完成全部模式 × 风格的浏览器矩阵验收

- 状态：已发布，待执行；GitHub [#24](https://github.com/CaiYan12/2048/issues/24)
- 类型：vertical
- 原计划阶段：P5、P10
- SPEC 用户故事：17–18、24、26–29
- Blocked by: T05, T06, T07, T08, T09, T15, T22

## 交付范围

以已实现的六模式与三套基准风格为对象，自动遍历 18 组合；桌面和手机视口检查启动、至少一次合法操作、控制台错误和横向溢出。再按风格设计卡做代表局面的人工视觉复核，包括 5×5、障碍、长数值、终局与缩放。

## 验收标准

- [ ] 18 个组合均在桌面和手机视口可加载、可操作、无控制台错误和横向溢出。
- [ ] 每套风格的设计卡均有桌面/手机截图与逐项复核结果；视觉特征并非只换颜色。
- [ ] 代表局面覆盖六模式的特殊状态，Tile、文字、焦点和控件不遮挡或丢失。

## 验证

运行矩阵 Playwright，并保存可追溯的视觉复核记录；发现问题回到对应风格或模式 ticket 修复后复验。

