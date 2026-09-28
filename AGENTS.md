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
`docs/primal-setup-plan.md`，术语见 `CONTEXT.md`。

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



## Agent skills

### Issue tracker

GitHub Issues, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical defaults — `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

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
- 一句话：成就条件**单局可自证**（撤下模式收藏家与每日坚守，8 → 6），祝贺由**每套风格自己
  实现**的 toast 呈现（呈现插槽，与两个装饰插槽分列），宿主按「锁定 → 解锁」的跃迁发号、
  撤销会收回（`style-traveller` 是写明理由的例外）。
- **2026-09-28 追加**：应所有者要求加了第七个成就 `first-merge`「首次合并」（条件
  「本局完成第一次合并」，阈值 `merges >= 1`），排在注册表第一位。它不在原附录里，但同样
  单局可自证；加它的实际收益是「随便开一局，几步之内第一次合并就能看见这套祝贺机制」——
  在此之前最快的一个也要打到合出 4096 或切够五次风格。规格的决策 2 与验收 2、ADR-0007 的
  Consequences、README 的成就口径都已同步成七个。
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
