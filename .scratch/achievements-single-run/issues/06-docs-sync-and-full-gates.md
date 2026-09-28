# 06: 文档同步与全量闸门

**What to build:** 那件「只在文件真的存在之后才许说」的事——每套风格从五件套变成六件套，以及成就
数量口径（八个变六个，挂起两个变四个）在全部陈述它的地方同步；两则 ADR 的状态从「实现待做」改成
已实现；规格的验收项逐条勾选并留下证据；全量闸门（含完整 Playwright）一次跑绿。

**Blocked by:** 02、05

**Status:** ready-for-agent

- [x] 「五件套」表述改成六件套：根 SPEC、`docs/specs/style-catalog.md`、`AGENTS.md`、
      `docs/primal-setup-plan.md`、`docs/plans/2048-execution.md`、SC-03 票据、ADR-0002、
      装载器断言（`tests/unit/style-loader.test.ts`）
- [x] 成就数量口径同步（README 的「十个成就里的八个」等处 → 六个）
- [x] ADR-0007 与 ADR-0002 的状态从 implementation pending 改为已实现
- [x] `docs/specs/single-run-achievements.md` 的验收项逐条勾选，并写下 Evidence（真跑过的数字）
- [x] 本目录 `plan.md` 的 Progress 全部勾上
- [x] 全量闸门：`npm run typecheck`、`npm test`、`npm run build`、后台 headless 跑完整 Playwright
- [x] `.codex/memories/achievements-single-run.md` 更新为「已实现」，INDEX 描述同步

## Evidence（2026-09-28 实现会话）

**「9 处」这个数字经核对是 8 处，且其中两处与票面写的不一样**——按事实落，不按票面凑数：

- 真正枚举过那份清单的是：`docs/SPEC.md` §3.2、`docs/specs/style-catalog.md` 决策 3、
  `AGENTS.md`（风格目录状态一节两处）、`docs/primal-setup-plan.md`（目录树一处，
  另有 §159 只列「tokens + styles + config + contrast」，是风格施工顺序而不是必需件清单，
  不动）、`docs/plans/2048-execution.md`（铁律 2）、SC-03 票据
  `.scratch/style-catalog/issues/03-auto-load-style-folders.md`、装载器断言。
- **ADR-0006 里没有这份清单**（grep `DESIGN.md` / 五件 均无命中），所以那里无字可改；
  ADR-0002 是**就地修订**的那一处，它本来就写着「从五件变六件」，改的是那句
  「在实现落地时一并同步、在那之前不得声称已有该文件」——现在同步完成了，句子跟着改事实。
- `.scratch/style-catalog/open-items.md` 被票面点名，但它唯一沾「5」的地方是
  「`DESIGN.md`（5 处提到某个色值）」，与必需件清单无关，**不动**。
- 另外补了一处票面没列、但不改就会说谎的：`tests/unit/theme-contract.test.ts` 的
  「加一套新风格要交的东西」清单原先没列 `toast.tsx`。

**闸门（本次会话末实测）**

| 闸门 | 结果 |
| --- | --- |
| `npm run typecheck` | 0 错 |
| `npm test` | **739 passed / 40 files**（新增 `achievement-host.test.ts`） |
| `npm run build` | 通过（78 modules） |
| `npm run check:contrast` | 3 套风格 / 65 对全过 |
| `npx playwright test`（后台 + headless，日志 `.scratch/pw-full-final.log`） | **432 passed / 14 skipped / 0 failed**（2.0m） |

**视觉检验**：`toast-contract.spec.ts` 对三套风格 × 两个视口各跑 9 条真实渲染断言——
其中三条是逐项视觉的：祝贺的**计算底色**必须等于这一套 tokens.css 里那一个（三套互不相同，
实测 `rgb(111,96,85)` / `rgb(232,222,248)` / `rgb(240,238,230)`）；它的外接矩形必须完全落在
棋盘上沿之上、且在触摸设备上完全落在方向按钮行之上；reduced-motion 下渲染出的
`transition-duration` 是 `0s` 而底色不变。**54 passed**。计时行为（约 5 秒消失、悬停暂停、
聚焦暂停）也都由真实时钟等到并断言，不是读声明。

**基线对照**：本会话开工前同一套全量 Playwright 是 377 passed / 1 failed（`style-traveller`
那条已知的时红时绿）/ 14 skipped，日志 `.scratch/pw-baseline.log`。收官时 0 failed。

## Code review（`code-review` skill，两条轴各跑一个子代理）

**Standards 轴**（对照 AGENTS.md 的代码风格 / 架构铁律 + Fowler 坏味基线）

| 发现 | 处置 |
| --- | --- |
| `toast.tsx` 文件名小写，与 AGENTS.md 的 `PascalCase.tsx` 规则冲突 | **不改**：ADR-0002 与规格都点名 `toast.tsx`，而且它是文件夹里的模块不是组件文件（同目录的 `config.ts` / `tokens.css` 也小写）。更具体的规定优先 |
| 局部接口叫 `ItemProps`，规则要求 `interface Props` | **已改**：三份都改成 `Props` |
| `config.ts` 注释里用「主题」指风格（违 CONTEXT.md） | **不改**：那两行是既有文字，本次没动过它；按「不动无关注释」留着 |
| 注释写「ADR-0007 决策 12」——ADR-0007 没有编号决策 | **已改**：编号属于规格的 Architecture decisions，7 处（含 3 张设计卡）改成指向 `docs/specs/single-run-achievements.md` |
| 坏味：三份 `toast.tsx` 与三段 `.toast-stack` 逐字重复 | **刻意保留**：ADR-0002 增补明文接受，规格决策 8 要求每套风格在自己文件夹里交一份；防漂移靠同一套断言跑三遍 |
| 坏味：`advanceAchievements(state, runFactsOf(...))` 在多处各拼一遍 | **已改**：抽出 `advance(state, game, runMerges, styleSwitches)`，5 处调用点收敛 |
| 坏味：`AchievementState` 三字段恒同行 / `AchievementToast` 放在 `src/game` | **不改**：前者已在代码里注明是同一台状态机的输出；后者是零 DOM 的数据，放在 `AchievementId` 旁边 |

**Spec 轴**（对照规格的验收标准与三条测试缝）

| 发现 | 处置 |
| --- | --- |
| **暂停由单个 boolean 承载：悬停与聚焦互相解除**（契约原文是 `pointer over it, **or** focus inside it`） | **已改——本轮唯一的真缺陷**。三份都拆成 `hovering` / `focused` 两个条件（`paused = hovering \|\| focused`），并把 e2e 的聚焦用例扩成「聚焦 → 悬停 → 把指针移开 → 仍暂停」，覆盖到这条联合条件 |
| `<li role="status">` 把 `listitem` 覆盖掉，剩下的 `<ul>` 在无障碍树里是空列表 | **已改**：容器与条目都改用 `div`（三张设计卡 §10 与 e2e 注释同步） |
| `tabIndex=0` 与「从不抢焦点」存在张力 | **保留并已写明**：`tabIndex` 只让用户**主动** Tab 进来暂停（那正是「焦点在内时暂停」成立的前提），规格与设计卡说的都是「从不**自动**抢焦点」；e2e 断言解锁不改变 `document.activeElement` |
| 注释仍引用 `AchievementNotice`（`RunAnnouncer.tsx` / `StatusBar.tsx`） | **已改**：验收 12 要求「nothing references them」，注释也算引用；两处改成「各风格的成就祝贺」 |
| `records.ts` 注释仍写「四项统计」 | **已改**：改成「它那几个统计数字」，与落地后三个数字一致 |
| Seam 3 少一条「缺 toast.tsx 的文件夹大声失败」的浏览器断言 | **据实记录**：那是构建期性质，浏览器那一侧观察不到（缺文件 = 产物根本生不出来）；装载器缝的单测覆盖了它，浏览器那一侧用「底色必须是这一套自己的」证明没有回退到别的风格的长相 |
| session 桶仍写 `styleSwitches` | **无需处置**：规格决策 4 与 12 都点名要它（`style-traveller` 跨刷新要活） |

两条轴都没有发现 scope creep。修完之后的闸门数字见本文件顶部那张表（重跑过的即为最终值）。
