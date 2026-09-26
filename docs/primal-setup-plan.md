# 2048 项目 · 奠基计划

> **状态**：需求细化完成（grilling session 已收口，frontier 为空）。
> 本文是执行蓝图，**尚未开始实现**——所有 checkbox 均为未勾选。
> 术语以 [`CONTEXT.md`](../CONTEXT.md) 为准，硬性架构决策见 [`docs/adr/`](../docs/adr/)。

## Context

这是一个**前端练手项目**。用户的目标是练手能力，不是做竞技完整的 2048——平衡性明确
不在目标内，所以撤销无限、不作弊标记、记录本来就是给自己看的玩具。

项目真正的重心是**风格系统**：十二套完全不同的设计语言（Material / Claude Design /
Frutiger Aero / Web 2000 / Terminal / Win10 Metro / Win98 / Aqua / Cyberpunk /
Bauhaus / Newspaper / Classic）套在同一套规则内核上。2048 只是承载风格的内容。

两条轴**正交**：模式（Mode）管规则，风格（Style）管呈现。任何风格可套任何模式。

## 已定决策（速查）

| 维度 | 决定 |
| --- | --- |
| 模式 | 6 个：Classic / Fibonacci / Big Board / Walls / Daily / Time Attack |
| 胜利 | 每模式声明目标块；达成给面板 + 可继续；失败 = 死局 |
| 撤销 | **无限**，无 assisted 标记（ADR-0003） |
| 作弊交换 | 切换式按钮，点两个已有数值的格子交换；入撤销历史、不改分数、障碍块不可选 |
| 风格系统 | 一套风格 = 一个文件夹（tokens.css + styles.css + config.ts）+ 棋盘固定结构 + 两个装饰插槽（ADR-0002） |
| 风格数 | **12 套** |
| 风格选择 | 开局前选，游戏中可随时切换且即时生效；持久化进 settings |
| 记录 | 按 **模式 × 风格** 双轴 |
| 成就 | 12 个（9 模式轴 + 3 风格轴） |
| 音效 | WebAudio 程序化合成，零音频文件，音高随块值升高 |
| 复古动效 | 默认全开，闪烁频率压 1.5Hz（ADR-0004） |
| 对比度 | 每套风格在 `contrast.json` 里声明自己的 `minRatio`，脚本校验，不靠眼睛 |
| 字体 | 自托管（Google Fonts 的字体家族，从自己 origin 提供） |
| 无障碍 | `prefers-reduced-motion` 全量降级 + 完整键盘 + `aria-live` 播报 |
| 交付 | 纯静态 + GitHub Pages（Actions）；PWA 留后 |
| 栈 | React 19 + TS + Vite 7 + Tailwind 3 + Zustand（单 store 无中间件） |
| 测试 | Vitest 只测纯逻辑（集中 `tests/unit/`，**不用** `@testing-library/react`）+ Playwright 测 UI |
| 核心 | 纯函数层与渲染层分离，RNG 可注入（ADR-0001） |

## 目录结构

```
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
│   ├── daily.ts                日期 → 种子
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
│   │   └── themes/<id>/        tokens.css + styles.css + config.ts + contrast.json
│   └── App.tsx                 唯一 default export
├── main.tsx
└── index.html
tests/
├── unit/                       Vitest，纯逻辑
└── e2e/                        Playwright，真实浏览器
scripts/
└── check-contrast.mjs          读每套风格 contrast.json → 算比值 → 不达标报错
```

**风格清单（12 套）**：`classic` `material` `claude` `frutiger-aero` `web2000`
`terminal` `win10-metro` `win98` `aqua` `cyberpunk` `bauhaus` `newspaper`

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
- Walls 的障碍图案：一套固定的 4 格，实现时定，定完写进 `modes.ts` 与 `tests/unit/fixtures`。
- Daily 种子：本地时区 `YYYY-MM-DD` 的哈希，本地零点重置。

## 执行计划

### P0 工具链与空壳

- [ ] `package.json`：dev / build / test / test:e2e / check:contrast 五个脚本；版本沿用 `opia-rss-reader` 已验证组合并**钉死**，理由写进 AGENTS.md 的版本钉死表
- [ ] `vite.config.ts` + `tsconfig.json`（`strict: true`，其余沿用 house style：不开 `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes` / `verbatimModuleSyntax`）
- [ ] `vitest.config.ts`：`environment: 'happy-dom'`、`include: ['tests/unit/**/*.test.ts']`、`passWithNoTests: true`
- [ ] `playwright.config.ts`：`webServer` 健康检查用 `localhost`
- [ ] `tailwind.config.js`：语义类 → CSS 变量映射
- [ ] GitHub Actions：`push` 到 main 时 `tsc --noEmit` → `vitest run` → `vite build` → 部署 Pages
- [ ] **验证**：`npm run dev` 出白屏；`npm test` 绿；`npx tsc --noEmit` 零错；CI 全绿

### P1 规则内核（纯逻辑，无 UI）

- [ ] `shared/types.ts` / `rng.ts` / `modes.ts`
- [ ] `game/board.ts` / `merge.ts` / `spawn.ts` / `score.ts` / `daily.ts` / `engine.ts`
- [ ] `engine.ts` 导出 `createGame / move / swap / undo / tick`，签名签入可注入 `rng`（ADR-0001）
- [ ] `tests/unit/` 全量：六模式各自的移动 / 合并 / 生成 / 死局 / 胜利；「一个方块一次移动最多合并一次」；同序不动则不生成
- [ ] Daily：同一天两次 `createGame` 得到同一棋盘
- [ ] 给定种子可断言第 N 步的具体结果
- [ ] **验证**：`npm test` 全绿；`game/` 下零 DOM 引用（grep `document` / `window` 无命中）

### P2 最小可玩 + Classic 风格

- [ ] `stores/useGameStore.ts`：单 store，扁平 state + action 方法，跨 store 用 `getState()`
- [ ] `components/Board.tsx`：固定 DOM 结构 + `boardOverlay` / `tileOverlay` 两个插槽
- [ ] `styles/board.css`：棋盘与方块层，绝对定位 + `transform: translate()` + transition
- [ ] `themes/classic/`：tokens.css + styles.css + config.ts + contrast.json
- [ ] 键盘：方向键 + WASD，`keydown` 里 `preventDefault` 阻止页面滚动
- [ ] **验证**：浏览器里能用键盘从开局玩到死局；Playwright 一条 e2e（开局 → 按方向键 → 分数变化）

### P3 交互完备

- [ ] 触屏滑动手势：raw pointer 状态放 `dragRef`（可变，不进 React state），派生值进 `useState`；阈值常量 `SCREAMING_SNAKE` 命名
- [ ] 屏幕方向按钮：仅检测到触摸设备时显示
- [ ] 无限撤销：历史栈「最近 N 个快照 + 计数器」（ADR-0003 的内存约束）
- [ ] `WinPanel`：胜利面板 + 「继续玩」按钮
- [ ] `GameOverPanel`：死局面板 + 重开
- [ ] **验证**：触屏可玩；撤销可无限次回到开局；胜利后可继续到死局

### P4 作弊交换

- [ ] `StatusBar` 一个作弊按钮，切换式，激活时棋盘高亮可点
- [ ] 选中态：点 A → 点 B → 交换；同一格点两次 = 取消选择
- [ ] 交换写入撤销历史；**分数不变**
- [ ] 障碍块不可选（无数值）；交换后重判死局
- [ ] Esc / 再点按钮退出作弊态
- [ ] `aria-live` 播报「已交换」
- [ ] **验证**：交换后分数不变；交换可被撤销； Walls 模式障碍块点不中；键盘可完整走一遍作弊流程

### P5 风格系统 + 十二套

- [ ] `styles/themes/index.ts`：注册表 + `applyStyle(id)` 在根元素设 `data-style`
- [ ] 棋盘插槽由 `config.ts` 声明要填什么（Aero→gloss、Terminal→扫描线、Web2000→斜面高光）
- [ ] `scripts/check-contrast.mjs` + 每套风格 `contrast.json`
- [ ] 自托管字体（OFL / Apache 许可的家族），`license/` 放许可文件
- [ ] 十二套逐个实现，顺序：`classic`(P2 已有) → `material` → `claude` → `terminal` → `frutiger-aero` → `web2000` → `win10-metro` → `win98` → `aqua` → `cyberpunk` → `bauhaus` → `newspaper`
- [ ] 复古风格动效：跑马灯 / 闪烁 / 欢迎动画全实现，**闪烁 1.5Hz**（ADR-0004）
- [ ] `StartScreen` + `StylePicker`：开局前选风格，带缩略预览
- [ ] 游戏中切换：顶栏风格指示器，点开即切，即时生效，不动棋盘
- [ ] **验证**：`npm run check:contrast` 全过；12 × 6 = 72 组合抽查无破版；游戏中切风格分数与棋盘不变；开 `prefers-reduced-motion` 后复古风格不再闪

### P6 持久化四类

- [ ] `settings`：当前模式 / 当前风格 / 音效开关
- [ ] `records`：`records[mode][style]` 双轴，存最高分与最高块（ADR-0002 的双轴结论）
- [ ] `session`：当前模式的棋盘 / 分数 / 步数 / 种子 / 状态 → 刷新原样续玩
- [ ] `stats`：总局数 / 胜局 / 总时长 / 成就解锁
- [ ] 显式「新游戏」按钮清 session
- [ ] **验证**：F5 后续玩同一局；换风格后两套 records 分开累加

### P7 统计与成就

- [ ] `StatsPanel`：按模式 × 风格双轴展示
- [ ] `game/achievements.ts`：纯函数判定，9 模式轴 + 3 风格轴
- [ ] 成就解锁即时提示 + 持久化
- [ ] **验证**：成就判定逻辑在 `tests/unit` 里可复现（纯函数，无 UI 依赖）

### P8 WebAudio 程序化音效

- [ ] `audio/synth.ts`：振荡器实时生成，**不引入任何音频文件**
- [ ] 音高随块值升高；移动 / 合并 / 胜利 / 失败各一音色
- [ ] mute 开关 → 持久化进 settings
- [ ] **验证**：仓库里无音频文件；mute 后彻底静音；首次用户手势后才创建 `AudioContext`（浏览器自动播放策略）

### P9 动效 juice + reduced-motion

- [ ] 生成弹入 / 合并脉冲 / 胜利序列，全部走 CSS + `@starting-style`
- [ ] 瓦片稳定身份保证滑动连续（P1 的 Tile identity 是前提）
- [ ] JS/CSS 时长契约：模块级常量，注释标明「必须与 board.css 保持一致」
- [ ] `prefers-reduced-motion: reduce` 下**每个**动画都有静态替代
- [ ] **验证**：开 reduced-motion 后无位移动画但状态正确；复古风格闪烁 ≤ 1.5Hz

### P10 无障碍收口 + 发布

- [ ] 完整键盘：Tab 可达所有控件、Enter 开新局、Esc 退出作弊态、方向键只在未聚焦输入框时走子
- [ ] `aria-live="polite"` 播报：得分 / 合出 / 死局 / 胜利 / 切换模式 / 切换风格 / 作弊交换
- [ ] 焦点环可见，对比度 3:1
- [ ] 重写 `README.md`：按实际能力写，不再只是脚手架说明
- [ ] 回填 `AGENTS.md` 的 `## Techstack Info:`
- [ ] **验证**：**纯键盘**（不碰鼠标）能完成一整局含作弊交换；屏幕阅读器播报关键状态；Pages 上线可访问

## 总体验证口径

按 AGENTS.md 的验证标准，任何「已完成」必须同时满足：

1. `npx tsc --noEmit` 零错误
2. `npm test` 全绿（纯逻辑）
3. `npm run check:contrast` 全过
4. `npm run build` 成功
5. Playwright e2e 通过
6. 浏览器里**实际跑过**（不是只读代码）
7. `npm run test:e2e` 针对 UI 变更

不满足就不许声称完成。

## 附录：成就清单（12 个）

模式轴（9）：

| 成就 | 条件 |
| --- | --- |
| 首胜 | 任一模式首次胜利 |
| 模式收藏家 | 六个模式各赢至少一次 |
| 4096 | 任一模式合出 4096 |
| 大数猎人 | 合出 8192 |
| 完美一局 | 不使用撤销通关 |
| 快手 | Time Attack 单局超过 20000 分 |
| 每日坚守 | 连续 7 天完成 Daily |
| 合并机器 | 单局完成 200 次合并 |
| 无作弊通关 | 不使用作弊交换通关 |

风格轴（3）：

| 成就 | 条件 |
| --- | --- |
| 全风格征服 | 12 套风格各赢至少一局 |
| 风格旅行者 | 单局内切换 5 次以上风格 |
| 复古大师 | Web2000 / Win98 / Aqua 三个风格都合出过 512 |
