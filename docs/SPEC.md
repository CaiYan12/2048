# 2048 多风格练习项目 · SPEC

> 状态：实现参考规格，已发布为 GitHub [#1](https://github.com/CaiYan12/2048/issues/1)。由 [`primal-setup-plan.md`](primal-setup-plan.md)、[`CONTEXT.md`](../CONTEXT.md)、现有代码和 ADR-0001～0005 整理；尚未实现的能力不视为已验证。
> 本文定义交付行为与边界；阶段清单仍留在原计划，具体实施单元由 tickets 管理。若两者发生冲突，先更新本 SPEC、相应 ADR 与 ticket，再编码。

## 1. 问题与方案

**问题**：单一外观的 2048 难以用于反复练习不同前端设计语言；把每套外观做成独立游戏又会复制规则和交互，妨碍比较与维护。

**本次方案**：在一套纯逻辑规则内核上提供六种模式和 **Classic、Material、Claude 三套基准风格**，先验证风格切换与质量闸门。模式决定棋盘、合并、生成、胜利和结束条件；风格只决定呈现。玩家可以在一局中切换风格而不改变规则状态；每套风格独立编写设计卡并通过桌面、手机及交互验收。其余九套特色风格列在 README TODO，作为远期规划，不计入本次验收。本项目是本地练习与娱乐项目，不追求竞技公平性。

## 2. 用户故事

以下故事中的“玩家”包括键盘、触屏和辅助技术用户；“练习者”是新增风格的开发者。

1. As a player, I want to choose a mode and style before starting, so that I can decide both rules and appearance.
2. As a player, I want to move tiles with arrow keys or WASD, so that I can play without a pointer.
3. As a player, I want an invalid move to leave the board and score unchanged, so that my inputs have predictable results.
4. As a player, I want a valid move to merge according to the selected mode and spawn one new tile, so that each mode follows its stated rules.
5. As a player, I want to see the target, score, and highest tile, so that I can understand my progress.
6. As a player, I want to be told when I reach the target and choose whether to continue, so that a win does not forcibly end my run.
7. As a player, I want to see why a run ended and start another run, so that deadlock and timeout are distinguishable.
8. As a player, I want Fibonacci tiles to merge using consecutive values, so that the mode differs from Classic beyond its label.
9. As a player, I want Big Board to use a playable 5×5 board, so that the larger grid changes the challenge without breaking the layout.
10. As a player, I want Walls to keep fixed unplayable cells, so that movement and merge behavior is clear around them.
11. As a player, I want Daily to use the same UTC-date seed everywhere, so that the initial board and random sequence are reproducible.
12. As a player, I want Time Attack to end after three real-time minutes or an earlier deadlock, so that the timer has a clear result.
13. As a touch player, I want to swipe or use on-screen directions, so that I can play without a keyboard.
14. As a player, I want to undo every effective move or swap back to the start of a run, so that I can recover from mistakes.
15. As a player, I want to swap two numeric tiles without changing score, so that I can experiment with a stuck board.
16. As a keyboard player, I want to activate, complete, cancel, and exit a swap without a pointer, so that the cheat control remains usable.
17. As a player, I want to switch styles during a run without changing the board, score, random progress, or timer, so that I can compare appearances directly.
18. As a player, I want the style picker to preview each available style, so that I can choose intentionally.
19. As a player, I want my settings and current run to survive a refresh, so that I can resume with the same undo path and next random result.
20. As a player, I want a clear notice when my run cannot be restored or saved, so that I do not mistake lost progress for a saved run.
21. As a player, I want my best result recorded under the mode and style active at settlement, so that local records have a consistent meaning.
22. As a player, I want to inspect statistics and achievements, so that I can see which modes and styles I have explored.
23. As a player, I want synthesized sounds for important events and a persistent mute control, so that audio is optional.
24. As a motion-sensitive player, I want a non-animated alternative for each effect, so that the game remains usable with reduced motion.
25. As a screen-reader player, I want the board, controls, and important results announced without repeated chatter, so that I can follow the game.
26. As a player, I want each style to keep legible text and visible focus when fonts fail, so that presentation remains usable.
27. As a learner, I want each of the three baseline styles to have its own design card and verified rendered result, so that I can test the theme system before expanding it.
28. As a learner, I want to add a style by editing its folder and registry only, so that I can iterate without changing rules or board interactions.
29. As a maintainer, I want unit, browser, contrast, build, and deployment checks, so that incomplete or broken work is not called finished.
30. As a visitor, I want the published Pages build to load its scripts, CSS, and fonts under the repository path, so that the hosted game actually works.

## 3. Functional contract

### 3.1 Mode and run

| Mode | Board | Merge family | Spawn values | Target | Special rule |
| --- | --- | --- | --- | --- | --- |
| Classic | 4×4 | powers of two | 2 at 90%, 4 at 10% | 2048 | baseline |
| Fibonacci | 4×4 | consecutive Fibonacci values, including `1+1→2` | 1 / 2 | 2584 | unequal adjacent values may merge |
| Big Board | 5×5 | powers of two | 2 / 4 | 4096 | larger board |
| Walls | 4×4 | powers of two | 2 / 4 | 2048 | four fixed Wall cells |
| Daily | 4×4 | powers of two | 2 / 4 | 2048 | UTC-date seed |
| Time Attack | 4×4 | powers of two | 2 / 4 | 2048 | three minutes of wall-clock time |

Mode definitions are declarative data in `src/shared/modes.ts`. A Move slides along the chosen direction, merges adjacent eligible tiles at most once per tile, scores the successors, and spawns only if the board changed. Walls split movement lanes; they never move, merge, spawn, or participate in swap. A Tile has an identity independent of its Cell. Reaching the target is a win event, after which the player may continue. Every mode ends on deadlock; Time Attack also ends on timeout, including when the tab is hidden or refreshed. The end reason is retained separately from whether the target was ever reached.

Daily derives its seed from UTC `YYYY-MM-DD`. The same date and input sequence produce the same random sequence and board; different input sequences need not yield the same later board. An already-started run keeps its seed after UTC midnight. Ordinary runs receive an initial seed from the caller. Random-generator progress and Time Attack deadline are restorable state, not inferred from a fresh `Math.random` or a restarted timer.

Undo has no product-imposed count limit. Every effective Move and cheat swap has a restorable prior state; repeated Undo can return to the beginning. Ineffective inputs do not add history. The initial implementation retains full states and measures memory and storage cost. A later compressed representation is allowed only if it preserves this behavior. Swap selects two existing numeric tiles, changes their positions, leaves score unchanged, enters undo history, and rechecks end conditions; selecting the same cell twice cancels selection.

### 3.2 Style and visual practice

The fixed Board DOM owns interaction and Tile identity. `boardOverlay` and `tileOverlay` permit decoration only. Each style lives in `src/renderer/styles/themes/<id>/` with `DESIGN.md`, `tokens.css`, `styles.css`, `config.ts`, and `contrast.json`; registry changes are confined to `themes/index.ts`. The board and Tile layer use `board.css`, while Tailwind is limited to the surrounding interface. A style cannot alter rules, scores, timers, or the accessible meaning of controls.

The three IDs in this release are `classic`, `material`, and `claude`. A design card specifies recognizable references, color and font roles, density, board and shell treatment, signature decoration and motion, exclusions, and narrow-screen behavior. Each style needs rendered desktop and mobile review, not only a successful CSS build. The registry and style picker expose only completed styles; changing style during a run updates presentation immediately. Future style names and researched repositories are kept in the README TODO, outside this release.

Font assets are self-hosted. Each distributed family retains its own license and copyright notice. Font fallback stays in the same visual family; font state must be checked again when a newly selected style first uses a font. Regular text has at least 4.5:1 contrast, large text and applicable non-text indicators at least 3:1. Reduced-motion mode provides static alternatives. The retro flashing cap in ADR-0004 applies when those future styles are implemented; it is not a requirement to add flashing in this release.

### 3.3 Records, statistics, achievements, sound

`settings` stores selected mode, selected style, and mute. `session` stores the current mode and style, board, score, progress, random-generator state, full undo path, win state, and deadline where applicable. `records[mode][style]` stores best score and highest Tile; a run contributes only to the style active when that run settles. A new-game action abandons an unfinished run without creating a record. `stats` stores total runs, wins, time played, and achievement unlocks. Storage needs a version; invalid or unwritable state must be surfaced without pretending restoration or persistence succeeded.

This release includes the nine mode-axis achievements and the `风格旅行者` style-switch achievement from the plan appendix. `全风格征服` and `复古大师` require future styles and remain in README TODO. Win-related records use the style at settlement, including a run that reached the target and continued. `风格旅行者` counts actual switch events. Sound is synthesized with WebAudio and no audio files; AudioContext is created only after a user gesture, and mute persists.

### 3.4 Accessibility and publication

Keyboard operation covers mode/style choice, Move, Undo, swap, new run, panels, and statistics. Movement keys are handled only when the game is the intended target; interactive controls retain native keyboard behavior. Important state changes are announced without duplicating every intermediate value. Touch and pointer controls remain operable on narrow screens. GitHub Pages publishes the built static site under its configured Vite `base`, with no runtime backend.

## 4. Architecture and external test seams

`src/game/` is DOM-free, with deterministic state transitions and injected randomness/time (ADR-0001). `src/renderer/` owns React, browser events, CSS, WebAudio, and storage. The single Zustand store coordinates the Run and exposes UI actions without becoming a second rule engine. The theme contract follows ADR-0002; undo and fonts follow ADR-0003/0005.

Test the rule engine through its public `createGame`, `move`, `swap`, `undo`, and `tick` behavior with fixed seeds and time values. Test user paths through the rendered app in Playwright using deterministic fixtures where a particular merge or outcome is asserted. Do not test private helpers merely to mirror implementation. The final browser matrix visits all **18 mode/style combinations** on desktop and mobile-sized viewports; human visual review uses representative states and each of the three design cards. `check:contrast` validates declared pairs, with browser computed-style checks to catch declarations that differ from rendered CSS. CI runs typecheck, real unit tests, build, and applicable e2e checks; Pages is verified after deployment.

## 5. Decisions that must be fixed before their implementation ticket

The source plan intentionally does not supply these exact values or behaviors. Do not invent them during coding:

1. The four Walls coordinates, initial-board rules, and non-Classic spawn weights (including Fibonacci's 1/2 and other modes' 2/4) must be recorded as fixtures in the mode-contract ticket before mode implementation.
2. The precise order of Fibonacci merges when more than two eligible Tiles line up must be written as examples and tests before implementing that mode.
3. The behavior of Undo and cheat swap after a run has visibly ended, and the exact instant at which a run settles, must be fixed before those controls and record writing are implemented. The current sources establish that a settled run has a single record style; they do not settle post-end recovery.
4. Long-run storage limits must be measured before choosing a persistence representation. The product promise is no deliberate undo truncation; a storage failure requires a visible notice.

These are explicit ticket gates, not permission to silently choose semantics in downstream implementation.

## 6. Out of scope

- Online accounts, multiplayer, global leaderboards, competitive anti-cheat, and an `assisted` flag.
- Backend/API, server-side saves, analytics, advertisements, and external product services.
- PWA installation and guaranteed first-visit offline access. Self-hosted fonts alone do not provide offline access.
- Replacing the fixed Board DOM per style or adding per-style rule branches.
- UI unit tests with `@testing-library/react`, or adding ESLint/Prettier solely for this project.
- The nine future specialty styles in README TODO and their two dependent achievements; no UI placeholder should imply that they are available now.
- New modes, dependency upgrades, or unrelated refactors beyond the specified scope.
