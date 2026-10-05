# AGENTS.md

## Skill Rule: 

We have compiled a set of "skills": folders of best practices for different forms of work. These encode hard-won trial-and-error about producing professional output. Several may apply to one task, so don't read just one. You need always be smart to use skills like:

- /grill-me on big changes sessions or any informations you need to know. PS: You need to call the agent's internal qa tool for grilling session.

- /design-flow on every ui/ux designing, changing or frontend processing. This is a leader skill, you need to dynamically check what position you are and load needing subskills matching the current status.

- /self-improvement when you make mistakes.

- /wayfinder on loose or unclear messages.

- /chinese-encoding on chinese language write-in or bash sessions.

- /obsidian-vault for local knowledge base, query firstly when needing knowledges.

- /context7-mcp or other needing MCP servers.

- /thesvg for needing brand icons.

- /pexels for needing actual no-copyright pictures.

- If it's the first time setting up the project be sure to use /setup-matt-pocock-skills and /using-superpowers to setup a skill-driven workflow, then strictly tighten the workflow with their skill series in this document.

  Read the skills, and involve the useful skills in your plan before you already know what to plan and to do.

---

## Coding Rule:

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

## Plan Mode Rule

### 1. Automatically triggers Plan Mode on

- Custom code solving a specific or foggy user problem

- Any long-form creative writing

- Structured reference content users will save or follow

- Modifying/iterating on an existing artifact; content that will be edited or reused

- A standalone text-heavy uploaded document >100 lines, or a plan or a handoff file mentioned by the user.

### 2. Plan File

When generating a plan, follow these instructions to sharpen a plan:

1. Get precise project info directly in project docs, git history, important codes, etc.
2. Run /grill-with-docs for a grilling session for more detailed info.
3. Turn the detailed task into different workable steps.

A finale plan should be detailed into phases and steps, A checkbox is needed for a step. When working for a plan, you need to update the status of each steps.

---

## Memory & Experience Rule

You have a persistent memory filesystem. You could reach your direct memories simply at "\.codex\memories" in Appdata

### 1. Project Memory is Needed

Except for your persist memory system, You could setup your specific project-based memory filesystem "\.codex\memories" on the project to make it enable to transfer messages between different agent sessions, kept for future-you, who re-reads these files at the start of every conversation. 

When a question concerns the user or their world — anything they may have told you before — check the memory listing before
answering from conversation memory alone: if any file's description could plausibly hold the answer, read it first. 

Always read before saying you DON'T have or know something.

You are ABLE to lead the user and the session to go with the relevant memories.

### 2. Memory Settings

- You are running in **chat**. Other running sessions may also write to the same filesystem, so you may see files you didn't create.
- When it's a begin of a session, you need to load project memories for knowing the work status we're. Memories are needed for primal context.
- For faster querying, the memory filesystem requires an index file.

### 3. Memory Querying

- When you've hit a wall, you can find the answers in your memories.
- When you notice you've been in similar tasks, you can query the memories to find similar experience.
- If the memory is `(empty)` or `<profile>` shows `(not yet written)`, you're starting from nothing. Just help the user and answer from the conversation.
- Index file will help you querying.
- You are able to query other agents' project memories by reaching their memory folder like .zcode/, .trae/, .workbuddy/, or .learning/, etc.

### 4. Memory Appending

- When user are stressing a point or you noticed some important messages, append that into your memories.

### 5. Outdated Memories

- Mission-completed tasks and dated over 60 days memories are considered outdated. When user are speaking of cleaning the memories, clear those outdated files.

---

## Git Rule

### 1. Commit Rule

- .git folder, README.md, AGENTS.md, .gitignore or other any git needing file are needing for a git commit.
- At most of the time, the .gitignore file is convincing and precise as long as it's updated. You can do the commit directly without file analysis.
- An closely updated README.md, AGENTS.md or other needing docs shall never be ignored in a commit.

### 2. Push Rule

- Normally when a commit passed real testing, a push should be ready to lead by you.
- Do not create branches unless the user mentions.
- Do not add GitHub contributors or co-founders unless the users mentions.
- Open-source publish uses MIT.

### 3. .gitignore Updating Rule

Agents memories(like .zcode/, .trae/, .workbuddy/, .claude/, .codex/), plugin files(like .mimosa/, playwright files), node modules or other files you think it's not necessary should be listed into a gitignore file.

The gitignore file should be updated when: 

- New functions updated, or previous functions changed or deleted.
- New essential library or dependency added.
- User mentioned.

---

## How to suggest

- You should call online and local search with keywords drawn from the task itself and suggest only results genuinely relevant to what the person is doing, because irrelevant suggestions teach the person to ignore the cards — if nothing fits well, you should suggest nothing.
- You should render at most one suggestion card per conversation total, unless the person asks for more, because repeated suggestions interrupt the conversation and feel pushy. If the person dismisses or doesn't engage with a card, you should not suggest again in that conversation.
- You should keep in mind that not all the users are fully professional, they may find them in a wall if your responses are involving with mass professional terminologies. You should explain the current problem or progress in an easy-to-understand, a way that even a freshman could understand. Sometimes a metaphor would be useful.
- Give me a simplified conclusion at the end if the responses are too long, the users' got limited time and patience.
- You have the responsibility to lead the user what to do next. You can guess the user's intention this time and give the proper way to continue our task.
- Your tone should be direct and precise, do not go around the bush.

## Running Environment

Your agent and bash are running on:

### System & Device

- Windows 11 Home Chinese Version x64
- Device
- LENOVO Legion Y7000P IRX9
- Intel Core i7-14700HX
- 15.7 GB (16 GB) RAM
- NVIDIA GeForce RTX 4070 Laptop GPU
- Realtek 8852CE WiFi 6E

### Dev Tools

- Shell: PowerShell 7.6.5
- Legacy PowerShell: 5.1 also available
- Git: 2.48.1
- Node.js: 24.18.0
- npm: available through `npm.ps1`
- Filesystem access: unrestricted in the current environment
- Network access: enabled





---

# Project Info:

**!IMPORTANT: Above are fixed and read-only finale context, you MUST follow these rules strictly, you CANNOT write, delete or add new words when updating or initializing AGENTS.md. Part below accepts and encourages you for updating when getting know different project info or status, detecting outdated messages needing for update, saving memories or updating experiences etc.**



# 2048

A tiny 2048 game built in web.

## Techstack Info:

React 19 + TypeScript + Vite 8 + Tailwind 4 + Zustand（单 store，无 slice / 无中间件）。
测试：Vitest（纯逻辑，`tests/unit/`，**不用** `@testing-library/react`）+ Playwright（UI，`tests/e2e/`）。
无 eslint / prettier。

代码风格（沿用 `opia-rss-reader` 的房子风格）：2 空格、单引号、**无分号**、尾随逗号；
`PascalCase.tsx` 具名导出 + 局部 `interface Props` + 显式 `: JSX.Element` 返回类型；
`SCREAMING_SNAKE` 模块常量；`interface` 用于对象、`type` 用于联合；注释用中文、解释「为什么」。

架构两条铁律：

1. **规则内核与渲染层分离**（ADR-0001）：`src/game/` 下零 DOM 引用，RNG 由调用方注入。
2. **风格是一个文件夹 + 棋盘固定结构 + 两个装饰插槽**（ADR-0002）：`src/renderer/styles/themes/<id>/`，
   加一套风格不动引擎。棋盘 / 方块层**不用** Tailwind utility，独立 `board.css`；
   Tailwind 只用于外壳。

依赖版本在 T02 按当前主线钉死并记录在下方「版本钉死表」（未沿用 `opia-rss-reader` 的旧基线，
理由见表下），升级前先查理由。

### 版本钉死表

| 依赖 | 版本 | 钉死理由 |
| --- | --- | --- |
| vite | 8.3.1 | 当前主版本；T02 核过 plugin-react 6、vitest 5 的 peer 均指向 Vite 8 |
| @vitejs/plugin-react | 6.1.1 | peer 要求 `vite ^8.0.0`，与上表同时定 |
| vitest | 5.0.2 | peer 接受 `vite ^6 \|\| ^7 \|\| ^8`；与 Vite 8 验证过可共装 |
| tailwindcss + @tailwindcss/vite | 4.3.3 | CSS-first 无 `tailwind.config.js`，`@theme` 原生自定义属性，与各风格 `tokens.css` 直接组合 |
| react / react-dom | 19.3.0 | 当前 minor；`@types/react` 对齐 |
| typescript | 7.0.2 | `tsc --noEmit` 已通过；strict 全开 |
| @playwright/test | 1.63.0 | e2e 用构建预览跑，版本跟随当前 |
| @types/node | 26.6.3 | 配置文件与 Node API 类型 |
| zustand | 5.0.15 | T03 引入单 store（SPEC §4：无 slice、无中间件）；v5 的 TS 类型要求 `create<T>()(...)` 双调用形式，钉死以免误升到破坏类型接口的大版本 |

回退基线：`tailwindcss@3.4.19`（npm `v3-lts`）+ Vite 7 + Vitest 4 + plugin-react 5，理由见
SDD ledger 的「依赖版本走当前」裁决。Node 需 `>=22.12.0`（`engines`）。

关于 lockfile 的 registry：`package-lock.json` 里每条 `resolved` 都指向
`registry.npmmirror.com`，因为这台机器在国内网络，走官方源装不动。**这是有意的**，
不是谁手滑写进镜像——所以别去「修正」回 npmjs。也不要因此给仓库加 `.npmrc` 去 pin 镜像源：
`npm ci` 严格按 lockfile 安装，pin 了既无效、又只会拖慢 ubuntu runner。

六模式的规则声明在 `src/shared/modes.ts`；本次只实现 `classic`、`material`、`claude`
三套基准风格，放在 `src/renderer/styles/themes/`。其余特色风格见 `README.md` 的 TODO。
当前实现范围与验收见 `docs/SPEC.md`，纵向任务见 `docs/tickets/`；原阶段蓝图见
`docs/primal-setup-plan.md`，术语见 `GLOSSARY.md`。

**Playwright 只准在后台跑，且一律 headless。** 项目所有者会在自己的机器上同时做别的事，
弹出的浏览器窗口会抢走键盘焦点，前台任务会被打断。具体要求：

- `npx playwright test` 用后台方式执行（`run_in_background: true`），不要前台阻塞并刷屏；
  轮询结果时用有界等待，不要长时间静默占用前台。
- 永不使用 `--headed`、`--debug`、`--ui`，不打开 trace viewer、HTML report 或 `codegen`。
- 需要看渲染结果时读回 DOM（computed style、`data-*`、文本内容），不开可见窗口。
- `playwright.config.ts` 里 `headless: true` 是显式约定，不是默认值巧合。
- **禁参数列表不够。** `chrome-devtools-mcp` 一类驱动真实浏览器的 MCP **默认开可见窗口**，
  而且能在一个被叮嘱过「保持 headless」的 agent 里跑起来。所以每条派发指令都要另写一句：
  不许用任何驱动真实浏览器的 MCP / Puppeteer / 会开真实窗口的东西；**如果你认为需要浏览器，
  先问，不要自己开。**

**派出去的每个子代理都要被持续监督，频率自定但必须固定。** 本项目默认每 5 分钟一次：跑
`node scripts/subagent-watch.mjs --since-minutes 10`，配合 `ListAgents` 看已跑时长。
**判据是落盘活动，不是墙钟**——一个 40 分钟的票是正当的，13 分钟只写了一个临时脚本则不是。
阈值与处置、以及「先诊断再重派」（是派发令太宽、是你给了无解任务、还是它真卡在代码上）
见 `docs/agents/subagent-supervision.md`。监督是控制人的职责，不是使用者的：本次会话里
「T07 卡住」就是使用者发现的，而那类信号本该由这套机制先抓到。



### 键盘作用域（2026-09-28）

- 键盘监听从**棋盘元素**搬到 **`App.tsx`**（先到 window，再往上到 App）。起因是所有者实测：
  鼠标点一下棋盘以外的空白，焦点落到 body，方向键就既推不动棋盘、又把页面滚走。现在整页
  都是棋盘的操作区，**方向键一律 `preventDefault`**——页面只由滚轮滚动。
- **住在 App 而不是 Board，是因为所有者把范围又扩了一格**：开局界面（还没有棋盘，Board
  根本没挂）方向键也要吃掉。App 比 Board 活得久，于是那条 `game === null` 分支只做
  `preventDefault`、什么都不推。`MOVE_KEYS` / `UNDO_KEYS` / `allowsNativeKeys` 跟着搬家；
  Board 只留指针路径要用的 `isInteractiveTarget`，`onUndo` / `onExitSwap` 两个 prop 随之取消
  （`onMove` 留着——滑动手势走它）。
- 三道让路（`allowsNativeKeys`）：文本入口（`input` / `textarea` / `select` /
  `contenteditable`）、**棋盘区内**的交互控件（T03 就钉过这条）、以及带 Ctrl / ⌘ / Alt 的
  组合（Alt+← 仍是后退；挂在棋盘上时范围小没管，搬到整页必须让开）。`Esc` 也收紧了：
  只在真的收着交换摊时才拦，免得吃掉浏览器的停止加载与退出全屏。
- **旧契约「移动键只在棋盘是预定目标时生效」由本次取代**，SPEC §3.4 就地修订。钉它的那条
  e2e（`game.spec.ts`）是**故意改写**的，不是被改绿：现在断言焦点离开棋盘照样推得动，并新增
  一条「方向键被吃掉、`scrollY` 不动、滚轮照旧能滚」。`run-endings.spec.ts` 里那条注释也据实
  改写——面板按钮上的键现在真的走到处理器，拦住它的是 store 的 `phase`（`move` 对 won 拒绝）。
- **开局界面也在范围内**（2026-09-28 追加）：那边方向键被吃掉但没有棋盘可推，按键就是
  什么都不做。留白的只有空格 / PageDown / Home / End——它们照旧能滚页面。
- 收官验证：typecheck 0 错、741 unit tests / 40 files、build 通过、全量 Playwright
  **436 passed / 14 skipped / 0 failed**（`game.spec.ts` 另跑 `--repeat-each=4`，40/40 绿）。

## Agent skills

### 结果层动效状态 (2026-10-01)

- T27 已实现、已验收。进出动效全部住在**共享外壳**（`src/renderer/styles/index.css`）：
  **150ms + 内置 `ease-out`**（T21 为方块定下、已接受的共享姿态，别引入第二条曲线）。
  进场遮罩淡入、卡片淡入并升起 4px；退场遮罩淡出、卡片淡出并沉 2px。三套风格一行都没改。
- **「此刻场上该有哪一层」不再等于 `phase` 意味着哪一层**：中间多一段退场时间，裁决住在
  `src/renderer/components/ResultPresence.ts`（纯函数 `nextPresence` + hook +
  `layerForPhase` 唯一映射）。**渲染层而不是 store**：这段延迟没有第二个消费者。
  它只持 `tier` / `panel` / `endReason` 三个字，**不冻结读数**（退场那一刻数字是对的）。
- **`data-result-leaving` 是总开关**：`pointer-events: none` 由它驱动，且它与 phase 变在
  **同一次提交**里落上 DOM（渲染期校正 state，不是 effect）——这是 ADR-0008 架构决策 9
  最重要的一条：继续玩之后马上划一下，棋盘必须当场就有反应。
- **`won → stuck` 连击播两段**：引擎的 `continueRun` 是一个纯迁移，那一下提交里直接换层；
  层自己接住顺序——旧层播完退场、新层再进场。中途换层则**立刻换**并取消退场标记
  （不在一段退场上再叠一段进场）。
- **reduced-motion 只留淡入淡出**（`result-fade-in` / `result-fade-out`），卡片一个位移都没有。
- **三条会重复踩的坑**（细节在 `.codex/memories/result-layer.md`）：退场的终点不能是
  `setTimeout`（`time-attack.spec.ts` 装假时钟会把它冻住，改用卡片的 `animationend`）；
  延迟卸载会把 T22 修好的键盘又弄断（在 App 里补同一条 focus effect，依赖换成
  `presence.layer`）；退场中的层不能现问 `game.phase`（面板改吃持有中的那一层）。
  第四条是控制人复核时抓到的：**`animationend` 会冒泡**，胜利标题那条 180ms 关键帧长在
  `.overlay__title` 上、正是卡片的后代且比卡片长 30ms——不判 `event.target ===
  event.currentTarget` 的话，标题那一条会在退场只播 130ms 时把层摘掉。回归用例用合成
  事件而不是墙钟，并已临时拆掉守卫验证它真的会红（6/6 failed）。
- **不止 `won → stuck`，所有换层都播两段**（tier 变了就旧层退场、新层进场，`stuck → ended`
  与 `won → ended` 也一样，结算那一刻约多 300ms）。这是决策 10 机制的自然结果、有单测钉住、
  记录写入时机一步没动，但人眼复核时值得看一眼「结算是不是变得更拖了」。
- 收官验证：typecheck 0 错、**774 unit tests / 42 files**、build 通过（80 modules）、
  check:contrast 3 风格 68 对，全量 Playwright **502 passed / 14 skipped / 0 failed**
  （`game.spec.ts` 另跑 `--repeat-each=4` 40/40 绿）。**人眼复核没做**——18 个组合留给控制人。
- 规格的状态、Evidence 与 15 条验收框在收官时一并回填（`docs/specs/result-layer.md`），
  ADR-0008 的状态行改成 implemented——契约文档写着「未实现」而票写着「完成」正是决策 12
  要防的那类文字。

### 结果层两件套与读数状态（2026-10-01）

T25 / T26 已实现并验收，形状与踩到的坑见上节与 `.codex/memories/result-layer.md`。这里只记
几条**不写下来就会被改错**的：

- **规范词是「结果层」**，词条在 `GLOSSARY.md` 末尾新小节。`_Avoid_` 禁「面板」（已禁给棋盘、
  又是记分卡的 `.panel` 类名）、「弹窗 / 通知」（已被 Toast 条目花掉）、以及拿「结算界面」
  指 `won` 阶段。本组新写与改写的正文已清；历史文档、既有用例名、`src/game/engine.ts` 与
  SPEC §5 冻结文本刻意没动，理由写在 T25 的验证节。
- **不新增第四个插槽。** ADR-0002 的判据是「行为面窄到一套共享测试能钉住」；结果层绑四个
  store 动作、走完整键盘路径、管焦点回落，不够窄。风格只出 token 与 CSS。
- **遮罩继续斥指针**，所以 `App.tsx` 的 `!swapArmed` 分支省不掉：半透明不改变「接不接指针」
  这个二值。别看到遮罩是半透明的就顺手删它。`TileMotion.ts` 的 `EFFECT_REDUCED_MOTION.win`
  是这张表的权威——它曾漂回「棋盘保持覆盖」，已补一条用例钉住。
- **结算即清档**，刷新后看不到结果层，所以「结算那一刻的风格」只是内存字段、不落盘。
- **「本局刷新了最高分」在未结算时是预告**：记录只在结算时写一次，从 `won` / `stuck` 点
  「新游戏」等于放弃本局、不写记录。判据本身（写入前那条当门槛）是对的，要改也只改文案。

### 一念神魔彩蛋状态（2026-10-01）

T28–T34 七张票已实现并验收。父规格 `docs/specs/easter-egg.md`，裁决 `docs/adr/0009-shenmo-is-shell-not-a-fourth-slot.md`，票据 `docs/tickets/28`–`34`，记忆 `.codex/memories/shenmo-easter-egg.md`（十条会重复踩的坑，读它再动手）。

- **共享外壳，不是第四个插槽**：与 ADR-0008 对结果层同一条判据。风格只出 `--shenmo-*` 令牌与 CSS；三套 `styles.css` 至今一条 `@keyframes` 都没有，节奏全在 `styles/index.css`。
- **口令是八下**（上上下下左右左右，Konami 方向段），不是六下——规格与票一度写成「六下」，术语表与 ADR 已改。**读着「六下」去对 `SHENMO_CODE` 最省事的修法就是删掉两个方向，那正好把彩蛋改坏。**
- **口令是被旁听的**：`MOVE_KEYS` 既有的查表把方向键与 WASD 归一，`move()` 之后顺手递进 `ShenmoChoice.ts` 那台纯机器。不新增输入态、不吞键，`allowsNativeKeys` 三条让路与 Esc 的既有行为一字未改（Esc 只多一条本地条件）。**代价：「回到输码之前的状态」只能指菜单与输码态，那八步落子不回溯。**
- **两个 30 秒都由动画驱动、听 `animationend`**，没有一个是 JS 定时器（`page.clock.pauseAt` 会冻住后者）。**reduced-motion 下计时动画必须留下**，只把环换成不可见的 `shenmo-ring-still`——关掉动画会把 collapse 一起关掉。
- **时之狭要把按住的时间还回去**：`shenmoHeldMs` 从喂给 `tick` 与 `Countdown` 的 now 里减掉，显示与截止点比较吃同一个 effective now。只冻显示是**让倒计时说谎**，已否决。`deadline` 一字节不改、引擎零接触。
- **堕落染墨落实为令牌变暗**，不盖遮罩——闸门读元素自己的计算样式，遮罩在它眼里是隐形的。36 对新探针，闸门 **68 → 125 对**。
- **四颗成就，七 → 十一**，全走 `unlockedAchievements(facts)` 既有机制，所以彩蛋进度是 store 字段 `shenmoOutcomes`（彩蛋唯一碰 store 的地方），不随撤销回退、不落盘。
- **二念扣下页面只是渲染层一个状态**：不结算、不写记录、不动引擎，刷新靠 session 恢复；旗标不落盘所以恢复后还能再扣一次。**这是设计后果不是漏洞。**
- **遍数计数器曾跨局泄漏**（第 2 局第一遍被判成二念、当场扣下页面且永远拿不到一念按钮），而**四道闸门全绿——没有任何用例覆盖「走完一遍再开新局」**。修法是把「换局 vs 换阶段」做成导出纯函数 `shenmoAfterRunChange`。教训：**绿不等于对，绿只等于被测到的地方没错。**
- 收官数字（控制人在修复后的最终树上亲跑）：typecheck 0 错、unit **889 / 47 files**、build 86 modules、check:contrast **3 风格 125 对**、全量 Playwright **722 passed / 14 skipped / 0 failed**、`game.spec.ts --repeat-each=4` 40/40。**人眼复核仍欠**：三套风格下按钮/破碎/礼炮/染墨/悬顶/扣下页的长相、两个占位音、reduced-motion 那行静止的字，以及整段发现体验。

### 堕落染墨改址与二念的两拍终局（2026-10-01）

T28–T34 之后应所有者要求做的一处**结构性修正**：染墨原先挂在「点过 B 之后的 30 秒」上，业主的原话是「你似乎理解错我的意思了，这个染血色的触发条件是**重复输入两次作弊码**，先染出血色，然后**淡出关闭棋盘页面**。并非是输错了，输错了直接重来」；追问「第二次输对码时 A/B 抉择还出现吗」，答「仍然先出 A/B，走完才染血」。规格的架构决策 20 记下了这一条。

- **开关搬了地方**：`data-shenmo-dim` 由 `demonOpen`（breaking / ring）改成 `useShenmoFall(shenmoSecondPass)` 的 `falling`；`demonOpen` 留给时之狭（`clockHeld = demonOpen || falling`）。**魔道那 30 秒一眼血色都没有**，错键依旧整个清空重来（既有行为）。`shenmo.spec.ts 里量染墨那一条逐条改写成反话，一条断言都没删。
- **两拍住在渲染层，不在机器里**：新文件 `src/renderer/components/ShenmoFall.ts`（纯函数 `nextShenmoFall` + hook，照 `ResultPresence.ts`）。理由是机器**一个计时字段都没有**（架构决策 3 明写「两个窗口都不计时」），而它需要的全部事实——「第二遍发生了」——早已由 `passes` 计数器与 grant 说完。塞进机器就得给 `ShenmoStage` 加新档，而 T29/T32/T34 那几十条既有单测断的正是「每一条终局都落 `leaving`」。
- **三个时长只活在 `styles/index.css` 的 `[data-shenmo-fall]` 一块里**：血染 600ms / 停一拍 200ms / 淡出 400ms。推进全靠 `animationend`，一个 JS 定时器都没有（`page.clock.pauseAt` 会冻住后者）。宿主的两道判据一条都不能少：`event.target === event.currentTarget`（环的两条 30 秒、B 的破碎与四片碎渣、菜单自己的退场全是这一列的后代，`animationend` 会冒泡——T27 在结果层上栽过），以及认动画名（淡出在 reduced-motion 下换成 `shenmo-fall-fade`）。
- **血要「涌」不要「跳」**：`board.css` 给棋盘底面 / 空格 / 方块加 `transition: background-color 600ms`。**方块那条必须把 T21 的位移 / 入场 / 合并脉冲三条一起抄进来**——`transition` 是简写，只写 background-color 会把位移整个替掉，而症状只是「染血的时候方块不滑了」，没有任何报错。reduced-motion 把时长**置 0**（`--shenmo-dye-duration: 0s`）而不是把 transition 拆掉，同理。
- **血染那一拍另有一条 600ms 的节拍器动画**（照 `shenmo-window` 那个「全程不可见照样缩放」的老路子）：**过渡不能当节拍器**——reduced-motion 下它归零，那一刻连 `transitionend` 都不会来，终局会停在一半。节拍器自己一个位移都没有，所以 reduced-motion 也不用动它。
- **悬顶与祝贺落在血染那一帧**（不是页面扣下之后）：机器的 `onOutcome` → store 与两拍同一次提交。**焦点回落那条 effect 的判据随之换成 `pageCleared`**——授果那一刻抉择 A 还拿着焦点，`activeElement !== document.body` 会让它当场返回，而 1.2 秒后整列卸载、焦点掉到 body 时它已经不跑了（T34 钉的那条「重新开始」会当场红）。
- **两拍期间整列 `pointer-events: none`**：那一列里还有一颗「新游戏」，让它点得着，血染到一半就能被拽回一局能打的棋，那 1200ms 于是成了一条后门。
- **测试怎么不靠墙钟**：点击与第一次停住必须在同一次 `page.evaluate` 里（分开两步，几个协议往返一慢，菜单自己那条 150ms 的退场先把抉择 A 摘掉——`contrast-computed.spec.ts` 的 egg 场景量两颗圆钮那三对要的正是它）。等二念的果用的是 **Playwright 自己的轮询**，不是 `setTimeout` 也不是帧循环（装假时钟的用例那两条都会冻住）。
- **顺带修了一条与本票无关的既有红条**：`tests/unit/tile-motion.test.ts` 的 `.board__tile[data-merge-pulse='down'] {\n  scale: none;` 在 CRLF 工作区上必然红（这台机器 `core.autocrlf=true`，盘上读回的是 `\r\n`）——与本次改动无关，已用正则改写。教训：**写死 `\n` 的 CSS needle 只在一台 LF 的检出上成立**。
- 收官数字（子代理跑的，控制人可复核）：typecheck 0 错、unit **902 / 48 files**、build 通过、check:contrast **3 风格 131 对**；Playwright 只跑了四个 spec（`shenmo` 116 passed、`shenmo-clock` 18 passed、`contrast-computed` 44 passed、`wish` + `toast-contract` 各 18 passed），**全量留给控制人**。

### Issue tracker

GitHub Issues, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical defaults — `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### T21 motion status (2026-09-27)

- T21 implementation and local acceptance are complete; evidence and accepted tradeoffs are recorded in `docs/tickets/21-tile-motion.md`.
- Keep the win-title keyframe attached on its first render. Do not add a `requestAnimationFrame` state gate: the title's visible fallback can paint before the animation and flash.
- The merge value of 80ms is the total CSS scale-transition budget (40ms up + 40ms down). Browser wall-clock measurements were 130–160ms because React commits the second phase after `transitionend`; do not describe 80ms as end-to-end duration.
- Shared `150ms ease-out` motion across Classic, Material, and Claude is an accepted stability decision. Revisit it only with fresh frame-level evidence.
- Final verification: 738 unit tests, typecheck, production build, the full tile-motion Playwright suite, and the final targeted desktop/mobile preview cases passed. Playwright remains headless as required above.

### Style catalog status (2026-09-28)

- ADR-0006 shipped as SC-01 → SC-03. The approved plan, the three tickets, the open-items list
  and every evidence figure live in `.scratch/style-catalog/`. Project memory for this work is
  in `.codex/memories/` (start at its `INDEX.md`).
- Style identity has exactly one source: `src/shared/styleCatalog.ts` (a zero-import table of
  id + label; array order is display order). `StyleId` derives from it,
  `src/shared/types.ts` only re-exports it and imports no React, storage validation
  (`session.ts` / `records.ts`) asks the catalog rather than the renderer, and the browser
  matrix imports the catalog directly instead of parsing registry source.
- The renderer registry is **derived, not maintained**: `themes/index.ts` discovers folders with
  `import.meta.glob('./*/config.ts', { eager: true })` and `resolveThemes()` maps them onto the
  catalog, throwing when a catalog entry has no folder or a folder is missing one of its three
  slots (never silently omitted, never falling back to Classic). Each `config.ts` exports only
  `boardOverlay` / `tileOverlay` / `toast` plus its own CSS imports.
- Adding a style is two things: one line in the catalog + one `themes/<id>/` folder holding
  `DESIGN.md`, `tokens.css`, `styles.css`, `config.ts`, `contrast.json` and `toast.tsx`. The
  registry, picker, persistence and matrix need no edit. Style IDs are persistent identities;
  retiring one needs a storage migration.
- `import.meta.glob` arguments must be literals (Vite docs, Features → Glob Import), so discovery
  happens at module scope while the pure half `resolveThemes(modules)` is what unit tests drive.
  Never write a glob pattern inside a block comment: its `*/` closes the comment.
- Close-of-ticket verification: `npm run typecheck`, 759 unit tests across 39 files,
  `npm run build` (76 modules, unchanged from before), `npm run check:contrast` (3 styles,
  65 pairs), and the **full Playwright suite: 378 passed / 14 skipped / 0 failed**.
- **Standing practice, from this date:** every completed fix is distilled into `.codex/memories/`
  (add the file, then a line in `INDEX.md`) and into this section before moving on. Symptom-level
  detail — expected vs actual values, which cases are red — belongs in
  `.scratch/style-catalog/open-items.md`, not here.
- The e2e suite was taken from "red across eleven spec files" to fully green on 2026-09-28, and
  **every one of those failures turned out to be a test-side defect** — not one product bug.
  The trap catalogue (symptom → root cause → the check that proved it) is in
  `.codex/memories/e2e-debt.md`; read it before touching these specs. Three rules that would have
  prevented most of the churn: take a `git stash` baseline before calling anything a regression;
  write a throwaway probe to read the real value before deciding who is wrong; and when a spec's
  premise is wrong, fix the premise rather than loosening the assertion.

### 无法移动音效状态 (2026-09-28)

- T20 点名了四个音效事件（移动 / 合并 / 胜利 / 失败）。应项目所有者要求补上第五个
  `blocked`（无法移动）作为**占位代码**，理由写进 `README.md` 的 TODO 了：将来的音效下拉框
  要能列出它。落地在 `src/renderer/audio/tone.ts`（事件 + 占位音色）与
  `src/renderer/stores/useGameStore.ts`（`soundOfBlocked`）；完整交接见
  `.codex/memories/audio-events.md`。
- 它**只在 `phase === 'playing'` 时响**：won / stuck / ended 三个阶段是面板在接管输入，出声
  等于把「点不动」说成「走不了」。这条守卫由 `tests/unit/audio-store.test.ts` 钉着。
- T20 的旧契约「无效移动一个音都没有」被本改动**取代**，钉它的那条单测是故意改写的，
  不是被改绿。占位音色为 A2 / 0.05 s / 峰值 0.08，三项都低于移动音——这一声说的是
  「什么都没发生」。
- 「震动等特效」的简单实现已作为独立一项写进 README TODO，未实现。
- 收官验证：`npm run typecheck` 通过、763 unit tests / 39 files、`npm run build` 通过。

### 成就单局化状态 (2026-09-28)

- **已实现、已验收。** 决策在 `docs/adr/0007-achievements-are-earned-in-a-single-run.md`
  与 `docs/adr/0002-style-as-folder-with-decoration-slots.md`（就地修订），完整规格与
  Evidence 在 `docs/specs/single-run-achievements.md`，票据与逐项回填在
  `.scratch/achievements-single-run/`，设计结论在各风格 `DESIGN.md` §10。
- 一句话：成就条件**单局可自证**（撤下模式收藏家与每日坚守，8 → 6；2026-09-28 的
  `first-merge` 到七，2026-10-01 一念神魔的前三颗到十），祝贺由**每套风格自己
  实现**的 toast 呈现（呈现插槽，与两个装饰插槽分列），宿主按「锁定 → 解锁」的跃迁发号、
  撤销会收回（`style-traveller` 是写明理由的例外）。
- **2026-09-28 追加**：应所有者要求加了第七个成就 `first-merge`「首次合并」（条件
  「本局完成第一次合并」，阈值 `merges >= 1`），排在注册表第一位。它不在原附录里，但同样
  单局可自证；加它的实际收益是「随便开一局，几步之内第一次合并就能看见这套祝贺机制」——
  在此之前最快的一个也要打到合出 4096 或切够五次风格。规格的决策 2 与验收 2、ADR-0007 的
  Consequences、README 的成就口径都已同步成七个。（「第七个」是它当时的序号。）
- **2026-10-01 一念神魔（T29）**：注册表追加三颗，**七 → 十**。条件全是「本局」口径：
  `shenmo-first-pass`（道通成魔，抉择里先 B 后 A）、`shenmo-wrong-order`（学艺不精，先点了 A）、
  `shenmo-hesitation`（当断即断，放任那道环流尽）。三颗读的是同一个 store 字段
  `shenmoOutcomes`——彩蛋唯一碰 store 的地方（父规格架构决策 2：码缓冲、阶段、两个窗口
  都是协调状态，住在渲染层的 `ShenmoChoice.ts`）。`includes` 判定而不是计数：条件原话是
  「本局发生过什么」，发生过几次都只该祝贺一次。二念那一颗由 T31 加，届时才到十一。
- **2026-10-01 一念神魔（T32，二念）**：注册表**十 → 十一**，第四颗 `shenmo-second-pass`
  （走火入魔，条件是「本局第二次先 B 后 A」）。它带的 `note` 就是那句诗，也是全项目唯一
  一条**常驻屏幕**的成就文字。三条不写下来就会被改错的：
  · **「第二遍」是一个新的果，不是 `first-pass` 出现两次**。store 的 `recordShenmoOutcome`
    幂等，同一个果记两遍只留一条——所以第二遍若还结 `first-pass`，store 一个比特都不动，
    走火入魔永远解锁不了。机器因此多一个 `passes` 计数器（T29 那 24 条单测原样通过，
    只有「状态里没有计时字段」那条的字段名单补上它），遍数只在完整走完 B → A 时 +1。
  · **扣下是渲染层的一个状态，不是引擎的一次结束**。`phase` 不变、不结算、不写记录、
    统计桶一格不动、规则内核一行没改；页面清空到只剩一颗「重新开始」（就是 `newGame`），
    战绩入口一并收起，而存档出错那条提示照旧显示。**刷新即恢复**：彩蛋旗标不落盘，
    所以回来之后还能再走一次火入魔、再被扣下一次——这是父规格架构决策 8 的后果不是漏洞。
  · **悬顶不是 toast**：`position: fixed` 贴视口顶端、不落不淡、连 `data-toast` 都不带
    （带了会被 toast 契约那套断言抓住）、一个指针都不吃（`pointer-events: none`）、
    `role="status"` 播报一次而不进 Tab 顺序。toast 栈的 `top` 改成读变量 `--toast-top`，
    由外壳在 `data-shenmo-pinned` 时设成「悬顶高度 + 1rem」，三套主题各自写死距离的写法
    就此只有一处。contrast 新开 `pinned` 场景，122 → 125 对。
- **2026-10-01 一念神魔的机器与外壳**（票据 `docs/tickets/29-shenmo-code.md`）：口令是**八下**
  （↑↑↓↓←→←→；父规格与 issue 正文里的「六下」是笔误，两处写全序列的地方都是八下）。纯机器
  `ShenmoChoice.ts` 的形状与测试缝照 `ResultPresence.ts`：纯函数 + hook、**零计时字段**（30 秒只活在
  `styles/index.css`）、渲染期校正 state（摊与「这一局的身份」变在同一次提交里收起）。
  收起信号是**值不是布尔量**（`phase @ runStartedAt`）——只判 `phase === 'playing'` 会在
  `newGame` 之后失灵。共享外壳一行三风格不改；contrast 新开 `egg` 场景，68 → 77 对。
  收官：unit **812 / 44 files**、全量 Playwright **570 passed / 14 skipped / 0 failed**。
- **2026-09-28 再修订（应所有者要求）**：祝贺挪到视口**上方正中**（`top` / 左右各 `1rem`、
  `align-items: center`），改**两行**结构（上行 `.toast__head` = `图标 + 成就名`，下行
  `.toast__note` = 这一套风格自己的一句祝词），并配上 emoji。图标住在
  `AchievementDefinition.emoji`（三套共用一份，各抄三份必然漂开），且 `aria-hidden`——名字
  已经把「拿到了哪一个」说全。三套设计卡 §7 的「禁 emoji 当装饰」据此收窄到**棋盘、方块与
  外壳的静态部分**：祝贺里的图标是内容，不是装饰。位置、内外边距、各套祝词逐条写在 §10。
- **2026-09-28 再修订（应所有者要求「toast 要有阴影」）**：三套都有了自己的那一层影，而且是
  **三种说法**——Classic 全扁平所以最轻（`0 2px 8px rgba(74,68,63,.3)`，用本套墨色）、
  Material 本来就带板面那组 elevation（未改动）、Claude 静态版面零投影所以只是一声耳语
  （`0 2px 12px rgba(38,36,31,.14)`）。三张设计卡的「无投影/禁 box-shadow」据此收窄到
  **静态版面或棋盘、方块与外壳**：祝贺是瞬时浮层，不属于页面的静态层级。契约测试对三套各断
  「自己的那一层」（只断「不是 none」的话，三份实现互抄也照样过）。
- 三条测试缝都还在原处：纯判定与解码器（`achievements.test.ts` / `records.test.ts`）、宿主
  状态机（`achievement-host.test.ts`，假后端 + 假 synth 的既有接法）、浏览器共享契约
  （`tests/e2e/toast-contract.spec.ts` 对三套风格各跑一遍）。**没有新增测试缝。**
- 收官验证：typecheck 0 错、**741** unit tests / 40 files、build 通过、check:contrast 3 风格
  65 对、全量 Playwright **434 passed / 14 skipped / 0 failed**（见 06 票据的 Evidence 数字）。
- **顺带修掉了那条从 T19 起「时红时绿」的 `style-traveller` 老红条**（它在本次基线里就是唯一
  的失败）：根因是 `setStyle` 的两次写盘是 fire-and-forget，而那条 e2e 不等落盘就
  `page.goto('/')`，把还在飞的 IndexedDB 事务连同这一页丢掉了；单独跑够快就过、四路并行就红。
  判据与修法（探针读桶 → `waitForPersistedStyle` 轮询**盘上那个值**；切哪一枚从 `data-style`
  推而不是 `aria-pressed`）写进了 `.codex/memories/e2e-debt.md`。**不是产品缺陷**：玩家不可能
  在那几毫秒内按下 F5。

### 一念神魔彩蛋收官（2026-10-01）

- **七张票全部落地并验收**（T28 术语与 ADR-0009、T29 神魔码与抉择、T30 一念的奖品与礼炮、
  T31 卡片那一行与 `note`、T32 二念与悬顶、T33 堕落染墨 / 时之狭 / 两个音效、T34 浏览器契约
  与全量闸门）。父规格 `docs/specs/easter-egg.md` 的 20 条验收框全部打勾，Evidence 已回填。
- **彩蛋是外壳，不是第四个插槽**（ADR-0009，与 ADR-0008 同一条裁决）：`ShenmoChoice.ts` 是一台
  纯机器（码缓冲、四个阶段、两个窗口、遍数计数器，零计时字段），store 只多一个**不落盘**的
  `shenmoOutcomes`。三套风格各出 token 与 CSS（两颗圆钮 / 一念按钮 / 悬顶 / 十二档暗档），
  设计卡各加一节 §11。
- **两个 30 秒都挂在 CSS 动画上、`animationend` 收尾，一个 JS 定时器都没有**——装假时钟的用例
  因此走得完整套流程。reduced-motion 只撤环的颜料与两片碎渣，**计时动画必须留下**
  （架构决策 4：换掉它菜单就永远收不回去，一个请求了少动量的玩家会被困死在摊前）。
- **T34 修的两处测试缺陷，都在测试侧、都不是产品缺陷**：`contrast-computed` 的 `wish` 场景漏了
  「点 A」那一步（`broke` 只把 stage 搬到 `ring`，`grant()` 才置回 `idle`），影响 6 条；
  `wish.spec.ts` 的粒子调色板判据两层错（拿 `'88,64,149'` 当 `#rrggbb` 解析，塌成 `[0,0,8]`；
  模型问「离三条连线近不近」而真相是**三档色值的凸组合**——落在三角形内部）。判据改成
  「离三档张成的三角形有多远」（通道空间的距离；质心坐标容差试过但否决：Classic 与 Material
  的顶端三档几乎共线，三角形薄不过一个通道）。两处都临时拆回旧样子验过红（各 6 条）。
- **T34 新立的三条契约**：键盘全程可达（打码不偷焦点、Tab 到两颗钮、回车 / 空格激活、Esc
  收起）；「B 碎到一半时第一段窗口到期不算放任流尽」（机器规则 4 钉的是一个真的会发生的赛跑
  ——第 29.95 秒点 B）；二念扣下页面时**焦点落在「重新开始」上**（`App.tsx` 一个 effect，与
  T17 战绩面板、T22 结果层同一条路子；方向键从来不靠焦点，所以这一条买的是「有地方可去」）。
- **统一契约裁定：保留三份 spec，每份各自跑满 3 风格 × 2 视口**（`shenmo` / `wish` /
  `shenmo-clock`）。三份的分界线是**铺设**不是断言（空盘量礼炮、满盘量染墨、假时钟量时之狭）。
  T34 把 `shenmo-clock.spec.ts` 从「只跑 Classic」扩到三套，理由与代价写在规格的 Evidence 里。
- **人眼复核没做**：整段发现体验（一个没被告知口令的人打出它）、三套风格下那一刻的长相、
  两个占位音好不好听、reduced-motion 那一行静止的字像不像礼炮——headless 与「不许开真实
  窗口」的约定下这一半不能由 agent 代做。
- 收官验证：typecheck 0 错、**886 unit tests / 47 files**、build 通过（86 modules）、
  check:contrast 3 风格 125 对、全量 Playwright **710 passed / 14 skipped / 0 failed**
  （`game.spec.ts` 另跑 `--repeat-each=4` 40/40 绿）。14 个 skip 与本特性之前同一个数。
