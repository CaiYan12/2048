# 2048 项目 · 奠基计划

> **状态**：需求细化完成（grilling session 已收口，frontier 为空）。
> 本文保留需求形成时的阶段蓝图；可实施的行为与验收以 [`SPEC.md`](SPEC.md) 和 [`tickets/README.md`](tickets/README.md) 为准。游戏尚未开始实现，字体资产与基础样式已有部分代码；Checkbox 以当前仓库状态为准。
> 术语以 [`GLOSSARY.md`](../GLOSSARY.md) 为准，硬性架构决策见 [`docs/adr/`](../docs/adr/)。

## Context

这是一个**前端练手项目**。用户的目标是练手能力，不是做竞技完整的 2048——平衡性明确
不在目标内，所以撤销无限、不作弊标记、记录本来就是给自己看的玩具。

项目真正的重心是**风格系统**：本次先以 Classic、Material、Claude Design 三套基准风格
套在同一套规则内核上，跑通切换与测试。其余九套特色风格及开源参考放在
[`README.md` 的 TODO](../README.md#todo远期规划)，不进入本次实现与发布验收。2048 只是承载风格的内容。

两条轴**正交**：模式（Mode）管规则，风格（Style）管呈现。任何风格可套任何模式。

## 已定决策（速查）

| 维度 | 决定 |
| --- | --- |
| 模式 | 6 个：Classic / Fibonacci / Big Board / Walls / Daily / Time Attack |
| 胜利 | 每模式声明目标块；达成给面板 + 可继续；所有模式死局结束，Time Attack 到时也结束 |
| 撤销 | 不设次数上限，可逐步撤到开局；无 assisted 标记（ADR-0003） |
| 作弊交换 | 切换式按钮，点两个已有数值的格子交换；入撤销历史、不改分数、障碍块不可选 |
| 风格系统 | 一套风格 = 一个文件夹（tokens.css + styles.css + config.ts）+ 棋盘固定结构 + 两个装饰插槽（ADR-0002） |
| 风格数 | 本次 **3 套基准风格**；9 套特色风格列入 README TODO |
| 风格选择 | 开局前选，游戏中可随时切换且即时生效；持久化进 settings |
| 记录 | 按 **模式 × 风格** 双轴；一局结算时只记入结束时正在使用的风格 |
| 成就 | 本次 10 个（9 模式轴 + 风格旅行者）；依赖未来风格的 2 个成就延期 |
| 音效 | WebAudio 程序化合成，零音频文件，音高随块值升高 |
| 复古动效 | 属于远期特色风格；届时遵守 ADR-0004 的闪烁上限 |
| 对比度 | 各风格列出实际文字、控件、焦点的前景／背景组合，按统一验收阈值校验 |
| 字体 | **自托管本地资源**，13 个文件 / 340 KB，`font-display: swap` + 同字形类别回退（ADR-0005） |
| 无障碍 | `prefers-reduced-motion` 全量降级 + 完整键盘 + `aria-live` 播报 |
| 交付 | 纯静态 + GitHub Pages（Actions）；PWA 留后 |
| 栈 | React 19 + TS + Vite 8 + Tailwind 4 + Zustand（单 store 无中间件） |
| 测试 | Vitest 只测纯逻辑（集中 `tests/unit/`，**不用** `@testing-library/react`）+ Playwright 测 UI |
| 核心 | 纯函数层与渲染层分离，RNG 可注入（ADR-0001） |

## 目录结构

```
index.html                        Vite 默认入口（项目根目录）
src/
├── shared/                     跨层类型与契约
│   ├── types.ts                Tile / Cell / Board / GameState / Mode / Style / Run
│   ├── modes.ts                六个模式的声明（规则数据，非逻辑）
│   └── rng.ts                  RNG 类型 + mulberry32 + 日期→种子
├── game/                       纯逻辑，零 DOM
│   ├── board.ts                棋盘表示 / 合法移动 / 死局判定
│   ├── merge.ts                按合并表的滑动 + 合并
│   ├── spawn.ts                生成
│   ├── score.ts                计分
│   ├── engine.ts               createGame / move / swap / undo / tick
│   ├── daily.ts                Daily 日期与种子规则
│   └── achievements.ts         成就判定（纯函数）
├── renderer/
│   ├── components/             *.tsx + 兄弟 *.ts 纯逻辑（house style）
│   │   ├── Board.tsx           固定结构 + boardOverlay / tileOverlay 两个插槽
│   │   ├── BoardLayout.ts      坐标与尺寸计算（纯函数）
│   │   ├── TileView.tsx        方块渲染
│   │   ├── TileLabel.ts        数值 → 可读标签（斐波那契要特殊处理）
│   │   ├── StartScreen.tsx     模式 + 风格选择
│   │   ├── StylePicker.tsx     风格缩略预览
│   │   ├── StatusBar.tsx       分数 / 目标 / 撤销 / 作弊按钮
│   │   ├── WinPanel.tsx        胜利面板 + 继续玩
│   │   ├── GameOverPanel.tsx   死局面板
│   │   └── StatsPanel.tsx      统计与成就
│   ├── stores/useGameStore.ts  Zustand 单 store，无 slice / 无中间件
│   ├── audio/synth.ts          WebAudio 程序化音效
│   ├── styles/
│   │   ├── index.css           Tailwind 入口 + 全局
│   │   ├── board.css           棋盘 / 方块层（不用 Tailwind utility）
│   │   └── themes/             index.ts 注册表 + 每套风格文件夹
│   │       └── <id>/           DESIGN.md + tokens.css + styles.css + config.ts + contrast.json + toast.tsx
│   └── App.tsx                 唯一 default export
├── main.tsx
tests/
├── unit/                       Vitest，纯逻辑
└── e2e/                        Playwright，真实浏览器
scripts/
└── check-contrast.mjs          读每套风格 contrast.json → 算比值 → 不达标报错
```

**本次风格清单（3 套）**：`classic` `material` `claude`。其余特色风格见
[`README.md` 的 TODO](../README.md#todo远期规划)。

## 六个模式

| 模式 | 棋盘 | 合并表 | 生成值 | 目标块 | 障碍块 | 限时 | 种子 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Classic | 4×4 | 2 的幂 | 2(90%) / 4(10%) | 2048 | 无 | 无 | 随机 |
| Fibonacci | 4×4 | 斐波那契对 | 1 / 2 | 2584 | 无 | 无 | 随机 |
| Big Board | 5×5 | 2 的幂 | 2 / 4 | 4096 | 无 | 无 | 随机 |
| Walls | 4×4 | 2 的幂 | 2 / 4 | 2048 | **有**（固定图案） | 无 | 随机 |
| Daily | 4×4 | 2 的幂 | 2 / 4 | 2048 | 无 | 无 | 当天日期推导 |
| Time Attack | 4×4 | 2 的幂 | 2 / 4 | 2048 | 无 | **3 分钟** | 随机 |

- 模式是**数据**，不是 if-else 分支——`modes.ts` 里六个字面量对象。
- Walls 的障碍图案：P1 开工前定好固定的 4 格，写进 `modes.ts` 与 `tests/unit/fixtures`，并验证开局可生成、至少有一条合法移动。
- Fibonacci 的合并表包含不同数值相邻合并（如 `1+2→3`），移动算法不得假设只有等值对能合并；合并表与生成概率要在 P1 测试前确定。
- Daily 使用 UTC 日期 `YYYY-MM-DD` 推导种子，全球在同一 UTC 日期使用同一初始局面与随机序列，UTC 零点换题；同样输入序列才会得到同样后续局面。
- Time Attack 以注入的当前时间计算固定 3 分钟；切到后台或刷新不会暂停。死局会提前结束，到时也结束；两种结束原因须可区分。
- 游戏中切换风格只改呈现；结算时只将记录与“在某风格获胜／达到数值”类成就记给**结束时正在使用的风格**。切换次数类成就按本局真实切换事件计数；结算前不把临时风格写入最终记录。

## 风格练习与验收契约

每套风格单独交付，不把“换色成功”当作完成。实现前在该风格文件夹写 `DESIGN.md` 设计卡：参考特征、色彩角色、字体角色、布局与密度、棋盘／外壳的不同处理、独有装饰与动效、禁用的通用样式、手机窄屏策略。固定棋盘结构与两个插槽仍以 ADR-0002 为边界；若设计卡要求改动规则或整块替换棋盘组件，先调整设计卡。

每套完成后保存桌面与手机实机浏览器截图，与设计卡逐项对照，检查辨识度、文字层级、交互态、长数值、胜负面板、触屏与键盘路径。自动化遍历本次全部 3 × 6 = 18 组合，检查可加载、可操作、无横向溢出和控制台错误；从不同棋盘尺寸、障碍块、限时与长数值中选代表组合做人眼视觉复核。三套完成后先发布可用版本，再根据 README TODO 逐套扩展。

## 执行计划

P0–P10 是主题阶段，**不是一阶段一张大票**。实施时按下表进入独立的纵向 ticket；阶段内的复选项作为来源清单，不代表可以跳过 ticket 自身的依赖、验收和验证。详细范围与 `Blocked by` 见 [`tickets/README.md`](tickets/README.md)。

| 原阶段 | 对应 ticket | 交付重心 |
| --- | --- | --- |
| P0 | T02 | 工具链与空壳 |
| P1 | T01、T03、T05–T09 | 规则示例闸门、Classic 可玩切片和其余五模式 |
| P2 | T03–T04 | Classic 棋盘、胜利与死局 |
| P3 | T09–T11 | 限时、触屏与撤销 |
| P4 | T12 | 作弊交换 |
| P5 | T13–T15、T23 | 风格框架、三套基准风格和最终矩阵 |
| P6 | T16–T17 | 续玩、记录与统计 |
| P7 | T18–T19 | 模式轴与风格旅行者成就 |
| P8 | T20 | 程序化音效 |
| P9 | T21 | 方块动效与静态替代 |
| P10 | T22–T24 | 无障碍、组合验收与发布 |

T01 有待项目所有者确认的规则取值和结算边界；T02 不依赖 T01，可先执行。其余 ticket 仅在各自 `Blocked by` 都完成后开始，避免把阶段顺序误当成真实依赖。

### P0 工具链与空壳

- [ ] `package.json`：dev / build / preview / typecheck / test / test:e2e / check:contrast 脚本；提交 lockfile；版本沿用 `opia-rss-reader` 已验证组合并**钉死**，理由写进 AGENTS.md 的版本钉死表
- [ ] `vite.config.ts` + `tsconfig.json`（`strict: true`，其余沿用 house style：不开 `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes` / `verbatimModuleSyntax`）
- [ ] `index.html` 放仓库根目录；`vite.config.ts` 为 GitHub Pages 仓库子路径配置 `base`，并验证构建后的脚本、CSS、字体资源路径
- [ ] `vitest.config.ts`：纯逻辑测试使用默认 `node` 环境、`include: ['tests/unit/**/*.test.ts']`；P0 可临时 `passWithNoTests: true`，P1 第一条真实测试加入后撤掉
- [ ] `playwright.config.ts`：为本地服务明确相同的 `webServer.url` 与 `use.baseURL`，配置桌面与手机视口；CI 不复用残留服务
- [ ] Tailwind 接入：**Tailwind 4**（CSS-first，`@theme` 里定义语义类 → CSS 变量映射，不再有 `tailwind.config.js`）
- [ ] GitHub Actions：先建立 `npm ci` → typecheck → unit test → build 的检查链；Pages 选择 GitHub Actions 作为来源，使用 `dist`、所需部署权限与构建产物上传，发布闸门留到 P10
- [ ] **验证**：`npm run dev` 显示空壳页；typecheck、build 成功；P0 的零测试绿色只代表工具链可运行，不代表规则通过；以预定 Pages `base` 预览构建产物并检查资源路径，线上验证留到 P10

### P1 规则内核（纯逻辑，无 UI）

- [ ] `shared/types.ts` / `rng.ts` / `modes.ts`
- [ ] `game/board.ts` / `merge.ts` / `spawn.ts` / `score.ts` / `daily.ts` / `engine.ts`
- [ ] `engine.ts` 导出 `createGame / move / swap / undo / tick`；随机源与 `tick` 的当前时间均由调用方注入，状态保存可恢复的随机源进度与限时截止时间（ADR-0001）
- [ ] `tests/unit/`：六模式各自的移动 / 合并 / 生成 / 死局 / 胜利；Fibonacci 不同数值的合并及顺序；一个方块一次移动最多合并一次；无效移动不生成；Walls 障碍分段处理；超时结束原因
- [ ] Daily：同一 UTC 日期、同一输入序列得到同一局面；UTC 零点前后换题，且不受设备本地时区影响
- [ ] 给定种子与输入序列可断言第 N 步的具体结果；保存并恢复后，下一次生成结果与未刷新的结果相同
- [ ] **验证**：至少有真实测试、`npm test` 全绿；`game/` 下零 DOM 引用（静态检查加测试，而非仅查两个词）

### P2 最小可玩 + Classic 风格

- [ ] `stores/useGameStore.ts`：单 store，扁平 state + action 方法，跨 store 用 `getState()`
- [ ] `components/Board.tsx`：固定 DOM 结构 + `boardOverlay` / `tileOverlay` 两个插槽
- [ ] `styles/board.css`：棋盘与方块层，绝对定位 + `transform: translate()` + transition
- [ ] `themes/classic/`：先写 `DESIGN.md` 设计卡，再实现 tokens.css + styles.css + config.ts + contrast.json
- [ ] 键盘：方向键 + WASD，`keydown` 里 `preventDefault` 阻止页面滚动
- [ ] **验证**：浏览器里能用键盘从开局玩到死局；Playwright 使用固定测试棋盘或种子验证一次合法移动，并用可确定的合并局面断言分数变化

### P3 交互完备

- [ ] 触屏滑动手势：raw pointer 状态放 `dragRef`（可变，不进 React state），派生值进 `useState`；阈值常量 `SCREAMING_SNAKE` 命名
- [ ] 屏幕方向按钮：仅检测到触摸设备时显示
- [ ] 无限撤销：每次有效移动或交换保留完整的前态，不设最近 N 步截断；先用完整快照实现，长局内存成本以测试测量，不在丢失旧状态后仍声称可撤到开局（ADR-0003）
- [ ] `WinPanel`：胜利面板 + 「继续玩」按钮
- [ ] `GameOverPanel`：死局面板 + 重开
- [ ] **验证**：触屏可玩；超过旧方案 N 步后仍可逐步撤到开局；胜利后可继续到死局；Time Attack 到时结束

### P4 作弊交换

- [ ] `StatusBar` 一个作弊按钮，切换式，激活时棋盘高亮可点
- [ ] 选中态：点 A → 点 B → 交换；同一格点两次 = 取消选择
- [ ] 交换写入撤销历史；**分数不变**
- [ ] 障碍块不可选（无数值）；交换后重判死局
- [ ] Esc / 再点按钮退出作弊态
- [ ] `aria-live` 播报「已交换」
- [ ] **验证**：交换后分数不变；交换可被撤销； Walls 模式障碍块点不中；键盘可完整走一遍作弊流程

### P5 风格系统 + 三套基准风格

- [x] `src/renderer/styles/fonts.css`：13 个 `@font-face`（`font-display: swap`、latin 子集）+ 按字形类别集中的系统回退栈
- [x] `src/renderer/styles/fontState.ts`：已实现初始加载时的 `data-font-state` 三态；切换风格后的检测尚未完成
- [x] 字体文件落到 `public/fonts/<family>/`（见下方「字体资产」）
- [ ] 为每个字体家族保存对应的版权声明与 OFL 许可文本；核对字体文件的来源、授权与保留名称，不以一份通用许可代替各家族声明
- [ ] `styles/themes/index.ts`：注册表 + `applyStyle(id)` 在根元素设 `data-style`；加风格只改其文件夹与注册表，不改规则内核和棋盘组件
- [ ] 棋盘插槽由 `config.ts` 声明装饰；本次以三套基准风格证明同一棋盘结构可承载不同呈现
- [ ] `scripts/check-contrast.mjs` + 每套风格 `contrast.json`：记录实际使用的文字、方块、按钮、焦点状态的前景／背景对；普通文字至少 4.5:1，大文字和必要的非文字状态至少 3:1，并在浏览器核对声明与实际 CSS 一致
- [ ] 三套逐个实现并逐套验收：`classic`（P2）→ `material` → `claude`；每套先写 `DESIGN.md`，后完成桌面／手机视觉验收
- [ ] 每套风格在自己的 `tokens.css` 里设 `--font-display` / `--font-body` / `--font-mono`，写法固定为 `'<本地字体>', var(--fallback-<类别>)`
- [ ] `StartScreen` + `StylePicker`：开局前选风格，带缩略预览
- [ ] 游戏中切换：顶栏风格指示器，点开即切，即时生效，不动棋盘
- [ ] 风格切换时重新检查当前风格实际使用的字体；首次未使用的字体在切换后才加载、慢网与 404 三种情况均更新 `data-font-state`，不让初始 `document.fonts.ready` 的一次结果永久锁住后续状态
- [ ] **验证**：三套设计卡与桌面／手机截图逐项核对；`npm run check:contrast` 全过且抽查实际计算样式；自动遍历全部 3 × 6 = 18 组合；游戏中切风格不改变棋盘／分数，结算记录只进结束时的风格；断网／字体 404 时仍按相应类别回退；用 Pages `base` 预览构建产物时字体可加载

### P6 持久化四类

- [ ] `settings`：当前模式 / 当前风格 / 音效开关
- [ ] `records`：`records[mode][style]` 双轴，存最高分与最高块；只在一局结算时按当时风格写入，切换过程不提前写入
- [ ] `session`：当前模式、当前风格、棋盘、分数、步数、状态、可恢复的随机源进度、完整撤销历史与限时截止时间 → 刷新后继续同一局
- [ ] `stats`：总局数 / 胜局 / 总时长 / 成就解锁；局面须保留“本局曾达到目标块”的标志，继续玩后结算仍算胜局
- [ ] 显式「新游戏」按钮放弃尚未结算的一局并清 session；已结算的记录与统计不清除
- [ ] 明确持久化结构版本；读取旧版或损坏数据时保留可读的设置／记录，无法恢复的局面给出可见说明；写入失败时不声称已保存
- [ ] **验证**：F5 后下一次生成、剩余时间与撤销路径和未刷新时一致；切换风格后仅结算风格的 record 变化；存储失败时玩家能看到状态

### P7 统计与成就

- [ ] `StatsPanel`：按模式 × 风格双轴展示
- [ ] `game/achievements.ts`：纯函数判定，9 模式轴 + 风格旅行者；切换次数按本局真实切换事件统计，其余两个风格轴成就留待远期风格完成
- [ ] 成就解锁即时提示 + 持久化
- [ ] **验证**：成就判定逻辑在 `tests/unit` 里可复现（纯函数，无 UI 依赖）

### P8 WebAudio 程序化音效

- [ ] `audio/synth.ts`：振荡器实时生成，**不引入任何音频文件**
- [ ] 音高随块值升高；移动 / 合并 / 胜利 / 失败各一音色
- [ ] mute 开关 → 持久化进 settings
- [ ] **验证**：仓库里无音频文件；mute 后彻底静音；首次用户手势后才创建 `AudioContext`（浏览器自动播放策略）

### P9 动效 juice + reduced-motion

- [ ] 生成弹入可用 `@starting-style` 做首次入场；方块滑动、合并脉冲、胜利序列按实际状态变化选用 CSS transition 或 animation，不把 `@starting-style` 当作通用动效机制
- [ ] 瓦片稳定身份保证滑动连续（P1 的 Tile identity 是前提）
- [ ] JS/CSS 时长契约：模块级常量，注释标明「必须与 board.css 保持一致」
- [ ] `prefers-reduced-motion: reduce` 下**每个**动画都有静态替代
- [ ] **验证**：开 reduced-motion 后无位移动画但状态正确；三套基准风格的动效均有静态替代

### P10 无障碍收口 + 发布

- [ ] 完整键盘：Tab 可达所有控件、Enter 开新局、Esc 退出作弊态、方向键只在未聚焦输入框时走子
- [ ] 适量使用 `aria-live` 播报得分／合并／死局／胜利／模式／风格／作弊交换，避免一次移动重复播报；棋盘及操作说明能被屏幕阅读器理解
- [ ] 焦点环可见，对比度 3:1
- [ ] 重写 `README.md`：按实际能力写，不再只是脚手架说明
- [ ] 回填 `AGENTS.md` 的 `## Techstack Info:`
- [ ] **验证**：纯键盘（不碰鼠标）能完成一整局含作弊交换；屏幕阅读器播报关键状态；Pages 部署工作流成功、线上页面可操作，脚本、CSS、字体均非 404

## 总体验证口径

每阶段只对已经存在的能力执行对应检查；P0 的空测试通过不能充当 P1 的规则验收。宣布最终交付完成前需满足：

1. `npx tsc --noEmit` 零错误
2. `npm test` 全绿（纯逻辑）
3. `npm run check:contrast` 全过
4. `npm run build` 成功
5. `npm run test:e2e` 通过，包括本次 6 × 3 = 18 组合的基础矩阵及关键交互
6. 浏览器里实际跑过桌面与手机视口，并核对三套基准风格的设计卡和截图
7. GitHub Pages 的部署、线上入口和关键资源经过实测

不满足就不许声称完成。

配置与验收依据：[Vite 构建入口及 `base`](https://vite.dev/guide/build)、[Vite GitHub Pages 部署](https://vite.dev/guide/static-deploy)、[Vitest 测试环境](https://vitest.dev/guide/environment.html)、[CSS `@starting-style`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40starting-style)、[WCAG 文字对比度](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum)、[WCAG 闪光限制](https://www.w3.org/WAI/WCAG21/Understanding/three-flashes-or-below-threshold)。

## 附录：字体资产

13 个 woff2，全部自托管于 `public/fonts/<family>/`，共 **342,420 字节（0.33 MB）**。
只取 **latin 子集**（含基本标点与常用符号）——中文文本不会触发这些文件，由系统字体接管，
这是有意的：不把西文字形硬套到汉字上。

| 家族 | 文件 | 字节 | 字重轴 | 许可 | 供谁用 |
| --- | --- | --- | --- | --- | --- |
| Inter | `inter-latin-wght-normal.woff2` | 48,256 | 100–900 | OFL | classic、win10-metro、claude(body)、全局 UI |
| Roboto Flex | `roboto-flex-latin-wght-normal.woff2` | 34,320 | 100–900 | OFL | material |
| Fraunces | `fraunces-latin-wght-normal.woff2` | 36,620 | 100–900 | OFL | claude(headings) |
| Source Sans 3 | `source-sans-3-latin-wght-normal.woff2` | 28,740 | 200–900 | OFL | frutiger-aero、aqua |
| JetBrains Mono | `jetbrains-mono-latin-wght-normal.woff2` | 40,404 | 100–800 | OFL | terminal、等宽读数 |
| Jost | `jost-latin-wght-normal.woff2` | 26,576 | 100–900 | OFL | bauhaus |
| Playfair Display | `playfair-display-latin-wght-normal.woff2` | 38,404 | 400–900 | OFL | newspaper |
| Pixelify Sans | `pixelify-sans-latin-wght-normal.woff2` | 12,016 | 400–700 | OFL | win98 |
| Comic Neue | `comic-neue-latin-400-normal.woff2` | 19,572 | 静态 400 | OFL | web2000(body) |
| Comic Neue | `comic-neue-latin-700-normal.woff2` | 19,244 | 静态 700 | OFL | web2000(body 粗) |
| Anton | `anton-latin-400-normal.woff2` | 18,612 | 静态 400 | OFL | web2000(大标题) |
| Chakra Petch | `chakra-petch-latin-400-normal.woff2` | 9,756 | 静态 400 | OFL | cyberpunk |
| Chakra Petch | `chakra-petch-latin-700-normal.woff2` | 9,900 | 静态 700 | OFL | cyberpunk |

文件来源记录为 [Fontsource](https://fontsource.org/)（经 jsDelivr CDN 取得）。P5 发布前需逐家族
核对授权，随文件提供对应版权声明与 OFL 文本；仓库当前尚未放入这些许可文件。

### 回退策略（ADR-0005）

每套风格的字体栈**必须**写成 `'<本地字体>', var(--fallback-<类别>)`，回退类别在
`src/renderer/styles/fonts.css` 的 `:root` 里集中声明：`grotesk` / `geometric` /
`humanist` / `ui-sans` / `novel` / `poster` / `techno` / `serif` / `display-serif` /
`mono` / `pixel`。缺字时在**同一字形类别内**降级，风格仍然成立。

两道机制：

1. `font-display: swap` —— 浏览器绝不为等字体阻塞渲染，先用回退画出来再换。
2. `data-font-state`（`loading` / `ready` / `fallback`）——现有 `fontState.ts` 在初始化时用
   `document.fonts.ready` 与 2500ms 超时赛跑；P5 还需在风格切换时针对新风格实际使用的字体
   重新检测，并区分已加载、仍在加载和失败。主题可据此补偿形态。

`unicode-range` 限定 latin，所以中文内容天然走系统字体，不下载这些文件。

## 附录：本次成就清单（10 个）

模式轴（9）：

| 成就 | 条件 |
| --- | --- |
| 首胜 | 任一模式首次胜利 |
| 模式收藏家 | 六个模式各赢至少一次 |
| 4096 | 任一模式合出 4096 |
| 大数猎人 | 合出 8192 |
| 完美一局 | 不使用撤销通关 |
| 快手 | Time Attack 单局超过 20000 分 |
| 每日坚守 | 连续 7 个 UTC 日期各结算至少一局 Daily |
| 合并机器 | 单局完成 200 次合并 |
| 无作弊通关 | 不使用作弊交换通关 |

风格轴（1）：

| 成就 | 条件 |
| --- | --- |
| 风格旅行者 | 单局内切换 5 次以上风格 |

`全风格征服` 与 `复古大师` 依赖远期特色风格，放在 [`README.md` 的 TODO](../README.md#todo远期规划)，本次不实现。
