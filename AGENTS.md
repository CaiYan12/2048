# AGENTS.md

## Skill Rule: 

We have compiled a set of "skills": folders of best practices for different forms of work. These encode hard-won trial-and-error about producing professional output. Several may apply to one task, so don't read just one. You need always be smart to use skills like:

- /grill-me on big changes sessions or any other you need to know.

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



## Agent skills

### Issue tracker

GitHub Issues, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical defaults — `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
