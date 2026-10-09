# T40 收尾：共享契约、四处修订与全量验收

- 状态：已完成（GitHub [#42](https://github.com/CaiYan12/2048/issues/42) 未在本阶段更新）
- 类型：vertical
- 原计划阶段：README TODO · 设置界面引入（第一刀）
- 父级规格：[`docs/specs/settings-drawer.md`](../specs/settings-drawer.md)（GitHub [#38](https://github.com/CaiYan12/2048/issues/38)）
- 本票对应：验收标准里「Across the three styles」「Things that must not have moved」两组，
  加 Test strategy 的共享契约与人眼复核两条
- Blocked by: T38（GitHub [#40](https://github.com/CaiYan12/2048/issues/40)）、
  T39（GitHub [#41](https://github.com/CaiYan12/2048/issues/41)）

## 交付范围

收口。一条共享契约对三套风格各跑一遍抽屉的全部不变量；四处就地修订落地；四道闸门与全量跑完；
三套风格在桌面与手机上人眼复核。

## 验收标准

- [x] 一条契约 spec，三套风格各跑一遍：四条开合路径、遮罩吃掉页面上每一个可交互面、
      键盘被吞掉但仍被消费、`Tab` 留在抽屉里、焦点进出、被扣下的那一页与结果层在场时行为一致、
      退场第一帧就还指针、假时钟下不卡住。
- [x] 一条「作用域没有漏」的检查：结果层与彩蛋菜单的 150ms 值未被改动。
- [x] `SPEC.md` §3.4 就地修订：抽屉成为「页面别处的控件不吞移动键」的第二个例外。
- [x] 外壳那条 `pageCleared` 注释与 `GLOSSARY.md`「二念」条的说法一致（后者已在本次会话修订：
      那一页现在还有设置入口）。
- [x] `README.md` 该组标状态；`AGENTS.md` 加一节带日期的状态（照既有状态小节的形状）。
- [x] 四道闸门：`npm run typecheck` 0 错、`npm test` 全绿、`npm run build` 通过、
      `npm run check:contrast` 三套风格（对数以实际为准，当前基线 **141 对**（T39 落地后））；全量 Playwright
      （后台、headless）**0 failed**，`game.spec.ts` 按既有做法另跑 `--repeat-each=4`。
- [ ] 人眼复核：三套风格 × 桌面 / 手机，看入口、抽屉、开关，以及**被打断的那一次进场弹跳**
      （250ms 内又关掉）。**——没有做**（headless 约定下不能由 agent 代做，见 Evidence「没有验证的」）。
- [x] Evidence 回填到这一组的每一张票，并写明**没有**被验证的是什么。

## 验证

**自动闸门**（全部实跑，数字见下）

- `npm run typecheck`：**0 error**（`tsc --noEmit`）。
- `npm test`：**910 passed / 49 files**（基线 910 / 49，本票一条都没增删——只改了一条标题的单位）。
- `npm run build`：**✓ 89 modules**。
- `npm run check:contrast`：**3 套风格 141 对**（T39 之后是 141；本票复核通过）。
- 全量 Playwright（**后台、headless**，`workers: 4`，preview 构建产物）：**842 passed /
  14 skipped / 0 failed**（4.0m，exit 0）。
- `game.spec.ts` 按既有做法另跑 `--repeat-each=4`：**40 passed / 0 failed**。
- `settings-drawer.spec.ts` 单跑：**90 passed / 0 failed**（11 条/风格 → 14 条/风格，加了本票的
  三条新契约，× 3 风格 × 2 视口）。

## Evidence

**补上的两处契约（T37 独立审查者点名的缺口，不是本票的新发现）**

1. **神魔摊的 `Esc` 优先序**（`settings-drawer.spec.ts`，「Esc 优先于底下的神魔摊」，进风格循环）：
   打码召出两颗圆钮（`data-shenmo-stage="choice"`）→ 开抽屉 → `Esc` 关掉抽屉而摊照旧开着
   （`.shenmo` 计数仍为 1）→ 再按一次 `Esc` 才收摊（计数 0）。与既有的交换摊那条并列——App 的
   `Esc` 分支里 `swapOpen || shenmoOpen` 是**两个并列条件**，两摊同时开着的概率为零，所以将来
   谁只删一条分支、只留一条断言，另一条会照旧绿。用满盘开局：那八下全是无效移动，棋盘一个格子
   都不动、码才攒得住。
2. **Toast 栈 / 礼炮不在 `inert` 那一块里**——从结构证据升成断言（同文件两条新用例，进风格循环）：
   - **Toast**：用「一步恰好一次合并」的满盘（`ONE_PAIR`）触发确定性的「首次合并」祝贺 →
     开抽屉 → 断言 `main > div.contents` 被 `inert`、`[data-toast-stack]` 仍在 DOM 里、且
     **不被那个包裹元素包含**（`.contains(stack) === false`）。
   - **礼炮**：正常形态是满屏 `fixed` 的粒子 canvas，粒子 1.1–2.1 秒熄完就 `onSpent` 卸载自己，
     按墙钟去抢是竞态（本地快就过、CI 慢就红）。所以改用 **reduced-motion 下那行 `.cannon__still`**
     来证同一条 DOM 归属——它**整局都在场**（reduced 分支不画 canvas，也就没有 `onSpent` 来置
     `spent`）。两种形态由同一个 `<Cannon>` 渲染、都是 `main` 的直接子节点（`.contents` 的兄弟）。
     断言与 Toast 同形。悬顶（`.shenmo-strip`）那条原本就在「入口在四种页面状态下同址」用例里
     （它在那一路局里稳定在场），未动。

**作用域没有漏**：`settings-drawer.spec.ts` 末尾那条独立用例（T38 建）继续跑通——结果层的
`.overlay__card` / `.overlay__scrim` 与彩蛋菜单 `.shenmo` 仍是 `0.15s + ease-out`。它跑一遍
（值住在共享外壳 `styles/index.css`，与风格无关），本票复核通过、未被后续改动碰到。

**就地修订（本票授权范围内，逐条）**

- `docs/SPEC.md` §3.4：`a control elsewhere does not swallow movement keys — a second exception is
  the settings drawer (amended 2026-10-09)`（照 2026-09-28 那次就地修订的写法）。
- `GLOSSARY.md`：无改动（「二念」条在本组落笔时已改好）；`src/renderer/App.tsx` 里那段
  `pageCleared` 注释改到与它一致（那一页清到只剩重开按钮 + 悬顶 + 右上角那**一个设置入口**）。
- `README.md` 的「设置界面引入」：加状态行（第一刀已交付什么、其余六条仍欠），第一条勾上。
- `AGENTS.md`：新增「设置抽屉第一刀状态 (2026-10-09)」一节，体例照既有状态小节。
- `src/renderer/styles/themes/claude/DESIGN.md` §2：暖色从「三个地方」改成「四个地方」并把开关
  开态轨道（`--switch-track-on`）列进去，与同卡表行（第 37 行）和 §7 一致。
- `tests/unit/contrast.test.ts` 第 179 行那条标题：改成「暖色只落在**四处角色位置**上（表里共
  **六对色值**）」，让标题的单位与断言（`toHaveLength(6)`）对得上。**断言值一个字节没动**（6 是对的）。

**没有验证的**

- **人眼复核**：三套风格 × 桌面 / 手机下的入口、抽屉、开关，以及**被打断的那一次进场弹跳**
  （250ms 内又关掉）。这台机器的约定是 Playwright 一律后台、headless，且不许开任何会弹真实
  窗口的工具，所以这一半**不能由 agent 代做**，如实挂账（父规格 Test strategy 的 Human review 一条）。
- 礼炮**粒子 canvas** 本身的 DOM 归属没有在正常形态下直接断言（它是瞬态的），只借 reduced-motion
  那一行同源证物证得；两种形态的渲染路径在 `Cannon.tsx` 里是同一个返回值分支，结构逐字相同。
- GitHub 相关一律没动：不提交、不推送、不建分支、不关改任何 issue / PR。
