# T27 交付结果层的进出动效并跑完全量验收

- 状态：本地实现与验收完成（GitHub #29 未在本阶段更新）
- 类型：vertical
- 原计划阶段：README TODO · 成功与失败界面变更
- 父级规格：[结果层 spec](result-layer.md)（GitHub [#26](https://github.com/CaiYan12/2048/issues/26)）
- SPEC 用户故事：11、12、13、19
- Blocked by: T26

## 交付范围

给结果层补上进出动效：进场与退场都播，退场第一帧就把指针还给棋盘；`won → stuck` 连击两段相接；
reduced-motion 下一个位移都没有。然后跑完这一组的全量闸门并回填 Evidence。

## 验收标准

- [x] 进场与退场都播；节奏沿用项目已接受的共享动效姿态（150ms + 内置 `ease-out`），退场时长
      与进场一致。进场：遮罩淡入、卡片淡入并升起 4px；退场：遮罩淡出、卡片淡出并沉 2px。
      三条动画（遮罩进 / 卡片进 / 卡片退）在无头 Chromium 里逐帧复核过：开始、结束各一次，
      零 `animationcancel`。
- [x] 退场第一帧起遮罩即不吃指针：继续玩之后马上按方向键或滑动，棋盘当场有反应。键盘本来就
      跟着 `phase` 放行，指针跟着一起放——`data-result-leaving` 与 `phase` 变在**同一次提交**
      里落到 DOM 上，`pointer-events: none` 由那个属性驱动。e2e 在同一帧里点「继续玩」、读
      DOM、按方向键，三件事一次做完（分两次调用会错过那 150ms）。
- [x] `won` 继续玩直接掉进 `stuck` 时，胜利层播完退场、死局层再进场，中间没有一个被宣告为
      当前的旧层。判据是 `data-result-leaving`：退场中的那一层带着它，当前那一层不带。
- [x] `prefers-reduced-motion: reduce` 下无任何位移动画；层照旧出现与消失、棋盘照旧能推、
      读数照旧可读。卡片逐帧 computed `transform` 恒为 `none`，动画换成只淡入淡出那一对。
- [x] 键盘全流程（到达 → 撤销 → 交换 → 结算 → 新开局）随新契约一起通过；焦点按既有约定回棋盘
      （T22 的结论不许回归）。延迟卸载会让「被聚焦的按钮多活 150ms」，T22 那条 effect 因此在
       phase 变的那一刻提前返回、等层真的卸载时又不再跑——键盘会断。修法是在 App 里补同一
      条 effect，依赖换成 `presence.layer`（详见 Evidence 的「踩到的坑」第 2 条）。

## 验证

**自动验证**

- `npm run typecheck`、`npm test`、`npm run build`、`npm run check:contrast` 全通过。
- 全量 Playwright（**后台、headless**）0 failed；`game.spec.ts` 按既有做法另跑 `--repeat-each=4`。

**浏览器与绘制帧复核**

- 无头 Chromium 对三套风格的进场 / 退场各做一次绘制帧复核：动画开始、结束各一次，无取消、
  无可见的基础态闪帧（T21 在这里踩过坑：胜利标题若加 rAF 状态门控，可见基础态会先画一帧再闪隐）。
  实现方式是同一个 `page.evaluate` 里触发输入 + 逐帧读计算样式 + 在 document 上接动画事件
  （细节见 Evidence）。
- 真机试玩一局到结算，回来汇报退场那 150ms 里棋盘是不是真的当场就动。

**控制人复跑与复核记录（2026-10-01）**

- 复跑 `npm run typecheck` / `npm test`（774 passed / 42 files）/ `check:contrast`（3 风格
  68 对）/ `npm run build`（80 modules）全绿；全量 Playwright 由控制人独立复跑
  **490 passed / 14 skipped / 0 failed**（1.9m，exit 0）。
- **收官全量已补跑**（控制人安排）：**502 passed / 14 skipped / 0 failed**（2.0m，exit 0）；
  `game.spec.ts --repeat-each=4` **40 passed / 0 failed**。补跑的触发原因是上一轮被系统因
  内存不足杀掉，不是测试失败。至此三道闸门齐全。
- 复核时抓到并修掉一个 T27 自己漏掉的真缺陷：**`onAnimationEnd` 会接收冒泡上来的子元素
  动画事件**。胜利标题那条 180ms 关键帧长在 `.overlay__title` 上、正是卡片的后代，且比卡片
  那一条长 30ms：玩家在胜利层出现后 150–180ms 内点「继续玩」时，标题那一条会代替卡片的退场
  把层摘掉，退场只播约 130ms，卡片剩一截透明度凭空消失。修法是判
  `event.target === event.currentTarget`。补了一条**不靠墙钟**的回归用例（合成一个从标题
  冒泡上来的 `animationend`，两次派发写在同一个 `page.evaluate` 里以免错过那 150ms），并
  **临时拆掉守卫验证它真的会红**：6/6 failed，恢复后 6/6 passed。
- 另两处小修：`GameOverPanel` 改递 `panel={spec.panel}` 而不是写死 `"gameover"`（它只在
  `spec.panel !== 'win'` 那一支被渲染，所以是对的，但写死会让人以为它与持有层无关）；仓库
  记忆 `INDEX.md` 里 unit 数被写成了 774 / 41，实测为 773 / 42，已改回。
- 三轮全量里未观察到 flake；`game.spec.ts --repeat-each=4` 复跑 40/40 绿。

## Evidence

**实现落在哪**

- `src/renderer/components/ResultPresence.ts`（新增）：在场裁决。纯函数 `nextPresence` +
  hook `useResultLayerPresence` + `phase → 哪一层` 的唯一映射 `layerForPhase`。
- `src/renderer/components/ResultLayer.tsx`：多两个 prop——`leaving`（落下
  `data-result-leaving`）与 `onExited`（卡片退场动画结束时通知宿主摘层）。
- `src/renderer/styles/index.css`：四条关键帧与它们的规则、`pointer-events`、reduced-motion
  降级。**三套风格一行都没改**——姿态是项目共享的，不该由风格分叉。
- `src/renderer/App.tsx`：T26 的两条 phase 条件合成一条（`presence.layer`），外加补上 T22
  的焦点回落（见下面第 2 条坑）。
- `src/renderer/components/GameOverPanel.tsx`：改吃**持有中的那一层**（`spec`），不再现问
  `game.phase`；`WinPanel` 只多转交两个 prop（它写死 won / win，而那正是它唯一可能的持有层）。
- `src/renderer/components/runEndLabel.ts`：文案表拆成 `endReasonLabel` + `runEndLabel`，
  **行为与文案一字未变**（拆开是为了让退场中的层按持有层说话）。

**验收数字**

- `npm run typecheck`：**0 error**。
- `npm test`：**773 passed / 42 files**（本次前 `git stash` 基线 758 / 41，差额全是新增的
  15 条在场裁决单测）。
- `npm run check:contrast`：**3 套风格 65 对**，全部达标，与改动前同一个数——本票只加了
  动画与一个属性，一个色值都没动。
- `npm run build`：**✓ 80 modules transformed，built in 245ms**（T26 是 79 modules，
  多出来的是 ResultPresence.ts）。
- 全量 Playwright（**后台、headless**，`workers: 4`）：**490 passed / 14 skipped / 0 failed**。
- `game.spec.ts` 另跑 `--repeat-each=4`：**40 passed / 0 failed**（既有做法，键盘全流程那条）。

**新增 / 改写的浏览器契约**（都在 `tests/e2e/result-layer.spec.ts`，对三套风格各跑一遍，
桌面 + Pixel 5 两个视口 = 4 条 × 3 风格 × 2 视口 = 24 条）

1. `进场与退场都播`：同一个 evaluate 里按键 / 点按钮，逐帧读卡片与遮罩的计算样式，并在
   document 上接 `animationstart` / `end` / `cancel`。进场断 `result-card-in` /
   `result-fade-in`、**第一帧不透明度小于 1**（T21 的基础态闪帧）、升起 4px 且落到 0、
   淡到 1、三条动画各自开始与结束、零 cancel、`0.15s` + `ease-out`；退场断 `result-card-out` /
   `result-fade-out`、下沉不超过 2px、摘掉前那一帧已淡到 0.2 以下、层真的不在 DOM 里。
   胜利标题那条 `win-panel-title-enter` 也断在内——它必须还附着在第一次渲染上。
2. `退场第一帧就把指针与键盘都还给棋盘`：同一个 evaluate 里点「继续玩」→ 下一帧读 DOM。
   断 `data-result-leaving` 在、computed `pointer-events` 是 `none`、`elementFromPoint`
   打棋盘上沿正中的窄条**不**落在结果层上，并在同一帧派发方向键 → 分数从 4596 涨到 8692
   （两个 2048 合成 4096）。退场播完层不在 DOM 里，再补一刀真手势（page.mouse 划一下）
   证指针那条路也通了。
3. `reduced-motion`：新开一个 `reducedMotion: 'reduce'` 的 context。进场逐帧 computed
   `transform` 恒为 `none`（卡片退到只淡入淡出那一对），层照旧出现、读数照旧在、撤销照旧
   让它消失、再走一步照旧能推。
4. `won 继续玩直接掉进 stuck`：新夹具（一步既达标又是最后一步合法移动，全盘只用 8 / 16 /
   1024，于是与 seed 无关，已拿 60 个种子逐个验过）。断胜利层在退场且不接指针；退场播完
   当前那一层是 `stuck`、不带 leaving 标记、`[data-panel="win"]` 计数为 0、重新接指针、
   四个按钮齐全。

**踩到的坑（三条，都是本票自己踩的）**

1. **退场的终点不能是 `setTimeout`。** 第一版用一个 150ms 的定时器摘层，全量 Playwright 当场
   红四条（`time-attack.spec.ts` 的「提前死局不会被到点改判」与「胜利之后继续玩」各两遍）：
   那两条用 `page.clock.pauseAt` 装了假时钟，`setTimeout` 整个冻住，层的退场永远播不完。
   改成听卡片退场动画的 `animationend`（渲染管线发的事件，JS 定时器怎么假都够不着它）。
   顺带删掉了那个同时活在 JS 与 CSS 两边的 150ms。
2. **延迟卸载会把 T22 修好的键盘又弄断。** Board 那条「焦点掉到 body 就还给棋盘」的 effect
   依赖 `game`：phase 一变它就跑，而那时被聚焦的按钮还在 DOM 上（正跟着层一起淡出），判据
   不成立、提前返回；等层真的卸载、焦点掉到 body 时，`game` 不再变，effect 不再跑。修法是在
   App 里补同一条 effect，依赖换成 `presence.layer`——它翻成「没有层」的那一次提交正是层从
   DOM 上消失的那一次。守卫与判据都抄 Board 那条（拾取进行中不还）。
3. **退场中的层不能现问 `game.phase`。** 第一版只把 `leaving` 递下去，`GameOverPanel` 仍按
   `game.phase` 算 tier / endReason / 那一句话：换层连击那 150ms 里 phase 已经是下一档，于是
   一个正在离开的层被描述成当前档（`data-result-tier="ended"` 配 `data-result-leaving`），
   还顺带把内容换成下一档的。指标是 T26 自己那条「遮罩照旧接指针」的用例红了一帧都不到的
   时间——`elementFromPoint` 落到棋盘的方块上。修法是面板改吃持有中的那一层
   （`spec.tier` / `spec.endReason`），读数仍每帧现算（不冻结）。

**没做的 / 边界**

- **人眼复核没做**：三套风格 × 三阶段（won / stuck / ended）× 桌面 / Pixel 5 共 18 个组合，
   控制人在自己机器上看。headless 与「不许开真实窗口」的约定下这一半不能由 agent 代做——本票
   所有绘制证据都是读回计算样式与动画事件，没有人眼看过一次。
- **退场上没有加定时器兜底**：动画结束事件不到场时层会留着。判断是「浏览器完全不跑 CSS 动画」
   只可能来自扩展或被改过的设置，而那正是 reduced-motion 要服务的场景；另一条兜底（定时器）
   会在假时钟测试里把同一个坑再踩一遍。
