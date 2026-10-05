# T31 彩蛋的那几行字：卡片那一行的两处用法、败局墓志铭，以及四颗成就各自的梗

- 状态：本地实现与验收完成（GitHub #37 未在本阶段更新）
- 类型：vertical（tracer bullet 的最后一格呈现）
- 父级规格：[`docs/specs/easter-egg.md`](../specs/easter-egg.md)（GitHub #30）
- 本票对应：架构决策 9 后半（`note` 字段）、17（一个座位两处用法）；用户故事 36、37
- Blocked by: T29 神魔码与抉择（GitHub #32）

## 交付范围

彩蛋说出口的那几行字。三件，都关于「多一行话」：

1. **注册表的可选字段 `note`**（`AchievementDefinition.note`）：一念神魔四颗成就各装一句用户给的原话，
   前三颗由本票补进 T29 已入册的定义，第四颗（走火入魔）的那句诗原样停在它 T32 要补的那一行旁边
   ——**字段本票立好，T32 照形状填一行即可，不必再决定一次 `note` 长什么样**。
2. **三套 toast 读它**：成就带 `note` 时下行显示这句话，不带时照旧显示本套自己的祝词。
   两行结构（上行图标 + 成就名、下行这句话）一个字节没动；三份实现依旧「逐条相同、只有祝词不同」。
3. **卡片那一行，一个机制两处用法**（父规格的架构决策 17 点名不许写成两套）：
   `src/renderer/components/resultCardLine.ts`（新增纯模块，照 `runEndLabel` 的路子）喂出
   道通成魔那一局的梗、与死局 / 超时 / 放弃那一刻的本局总结（分数、最高块、合并次数、步数；
   放弃那次的死因是**弃甲曳兵**），挂在结果层卡片最末（`.overlay__line`）。

**为什么 note 住注册表、不由三套各写一句**（写在这里，日后谁想把它搬去 styles.css 先读这段）：
emoji 在 ADR-0007 里已被裁定为「内容，不是装饰」，所以三套共用一份；这几句话是同一类东西——
**它们是这四颗成就的笑话本身，不是风格的嗓音**。风格的祝词留给其余七颗，一个字节不动。
搬去三套各自的祝词位，等于让同一句梗有三份副本，而三份副本必然漂开（ADR-0002 防漂移的
全部办法就是「同一套断言跑三遍」，那治不了三个真相）。

## 验收标准

- [x] 注册表有可选的 `note` 字段；四颗彩蛋成就各装用户给的那句话，前三颗由本票补进已入册的定义
      （第十一颗仍由 T32 入册，注册表**仍是十条**，那句诗停在它要补的那一行旁边）。
- [x] 三套 toast 在成就带 `note` 时显示它，不带时照旧显示本套自己的那句祝词；两行结构不变
      （上行图标 + 成就名，下行这句话），三套的既有契约不回归。
- [x] 解锁时的屏幕阅读器播报包含那句话（toast 本来就是 `role="status"`，这句话进 DOM 就够）——
      e2e 断 `role="status"` 且子树文本里整句在场。
- [x] 卡片那一行：道通成魔那一局的梗；死局 / 超时 / 放弃的本局总结。四种 `endReason` 各有一句，
      放弃那句是「弃甲曳兵」。
- [x] 那句话是纯函数从本局事实生成，不写死任何数值；单测覆盖四种 `endReason` 与「没什么可说」的边界。
- [x] reduced-motion 下这几行字一个字节不变——它们是文字，不是动效。
- [x] 成就总数与各处声明不变（仍是十个）；本票不加新成就，只给已有的加一行话。

## 验证

**自动闸门**（全部实跑，数字见 Evidence；快照时刻 2026-10-01 15:54）

- `npm run typecheck`：**本票涉及的文件 0 error**（全树当前另有 2 条 error，在 T33 未提交的
  `tests/unit/shenmo-clock.test.ts`，见 Evidence 的「与在飞票的冲突」）。
- `npm test`：**869 passed / 47 files / 0 failed**（本票新增 12 条 `result-card-line.test.ts`，
  改写 2 条 `achievements.test.ts`。15:46 的快照是 852 / 4 failed，那 4 条是 T30 / T33 在飞中的红，现已转绿）。
- `npm run build`：**✓ 85 modules transformed，built in 271ms**（本票新增 `resultCardLine.ts` 一个模块）。
- `npm run check:contrast`：**3 套风格 122 对，全部达标**——本票**一对都没加**（那一行用的是
  `--ink-variant` on 卡片面，milestone 场景早已量过），只在 e2e 里断了「它与读数小标签同一支墨」。
  对数从 T29 收官的 77 涨到 122，是 T30 的 wish 九对与 T33 的堕落染墨三十六对，都不是本票的。
- 全量 Playwright（**后台、headless**，`workers: 4`，preview 构建产物）：见 Evidence。
  本票新增的两个 spec（`result-card-line.spec.ts` 16 条 + `toast-contract.spec.ts` 66 条，
  含本票新增的 2 条契约 × 3 风格 × 2 视口）**全绿，合计 82 条**。

**人眼复核没做**：三套风格下卡片最末那一行的长相（换行位置、与读数组的疏密）、以及那句梗
「一念收下了，账照算」读起来是不是一句笑话——headless 与「不许开真实窗口」的约定下这一半
不能由 agent 代做。本票所有文字证据都是读回 DOM 文本，没有人眼看过一次。

## Evidence

**实现落在哪**

- `src/game/achievements.ts`：`AchievementDefinition` 多一个可选字段 `note`（带一整段「为什么它不住
  `condition`、不住三套祝词里」的注释）；前三颗彩蛋成就各填一句；`achievementNoteOf(ids)` 取这一条
  祝贺的梗（null = 本套自己说祝词）；文件头补一段「`note` 只归一念神魔那四颗」。
- `src/renderer/styles/themes/{classic,material,claude}/toast.tsx`：三份**逐条相同**的两处小改——
  取 `achievementNoteOf(toast.ids)`、下行 `{note === null ? \`${TAG} · ${FLAVOUR}\` : note}`。
  三份文件头的那段「两行」各加一句 note 的例外说明。**没有第四种插槽，没有新 token，没有新色值。**
- `src/renderer/components/resultCardLine.ts`（新增）：纯函数 `resultCardLine(facts)`
  + `CardLineFacts` + 穷尽 switch 的 `endedHead`（照 `runEndLabel` 的 `assertNever` 路子）。
  **零 DOM、零计时、零写死数值**：四个数字全部来自入参，四种 ending 与彩蛋那一局共用同一个
  字符串插值 `ledger(facts)`——「一个机制」最直白的那一处。
- `src/renderer/components/ResultLayer.tsx`：多一个 prop `line: string | null`，渲染在记录标记之后、
  按钮之前；**null 不挂元素**（不留一句空话）。文件头「为什么是两个元素」那段补上「那一行」。
- `src/renderer/components/WinPanel.tsx` / `GameOverPanel.tsx`：各多一个 prop 并转交。
  **文案判断一处都没有**——否则父规格的架构决策 17 就白写了。
- `src/renderer/App.tsx`：在 `presence` 之后现算 `resultLine`（按**持有中的那一层**算，不按活的
  `phase`），递进两个面板。彩蛋那个事实直接复用 T30 已经派生的 `wishGranted`，没有第二处
  `shenmoOutcomes.includes('first-pass')`。
- `src/renderer/styles/index.css`：`.overlay__line` 一条规则（`max-width` / `color` / `font-size`），
  全项目唯一新增的 CSS。

**验收数字**（快照 2026-10-01 15:54；全树状态在几分钟内被在飞票改过三次，逐次的数都在）

- `npm run typecheck`：**本票文件 0 error**（全树状态见「与在飞票的冲突」）。
- `npm test`：**869 passed / 47 files / 0 failed**。本票的两个文件单独跑 **44 passed / 0 failed**
  （`result-card-line.test.ts` 12 + `achievements.test.ts` 32）。
  15:46 的快照曾是 **852 / 4 failed**，那 4 条全是在飞的 T30 / T33：
  `contrast.test.ts`「Claude 的暖色只出现在三个用法上」（5 → 6 对暖色）与 `theme-contract.test.ts`
  三套各自的「棋盘层的每个色值都在 contrast.json 里量过」（`tokens.css` 的 `--tile-*` 12 → 24，
  即 T33 的堕落染墨）。现已全部转绿。
- `npm run build`：**✓ 85 modules transformed，built in 271ms**。
- `npm run check:contrast`：**3 套风格 122 对**，全部达标。
  **本票 0 对**：那一行用的墨与字号都是现成的（`--ink-variant` / 0.75rem），新加一对只是对称。
  对数从 T29 收官的 77 涨到 122，是 T30 的 wish 九对与 T33 的堕落染墨三十六对。
- 全量 Playwright（**后台、headless**，`workers: 4`，preview 构建产物，完整日志不留尾）：
  最后一轮 **20 failed / 14 skipped / 642 passed**（676 条，2.3m，exit 1）。20 条红的逐条点过，
  **没有一条属于本票**：
  · `contrast-computed.spec.ts` 的 12 条（三套 × 两视口 × egg / wish 两场景）——egg 场景的失败
    信息是「**堕落态**里方块 2 上的数值（第 1 档）…… 背景对不上」，即 T33 的堕落染墨；
    wish 场景是 `toHaveCount` 失败（那头钮在探针期望的时刻没渲染出来，T30 的活）；
  · `wish.spec.ts` 的 8 条（T30 的新 spec）——「粒子画出了色阶之外的颜色」（礼炮调色板读的
    令牌不对）与「大棋盘」那一条的 `toHaveCount`。
  再往前一轮（T30 的 wish 场景落地之前）是 **597 passed / 14 skipped / 1 failed**（612 条），
  唯一那条红是 `contrast-computed.spec.ts` 的「认不得的场景」——T30 在跑批途中给
  `contrast.json` 加 `wish` 场景留下的竞态，单独复跑 **2 passed**。
- 本票自己的两个 spec 全绿：单独跑一轮 **82 passed / 0 failed**，最后一轮全量里也一条都没红
  （失败清单里没有这两个文件）——`result-card-line.spec.ts`（8 条 × 2 视口 = 16）
  + `toast-contract.spec.ts`（11 条 × 3 风格 × 2 视口 = 66）。

**新增 / 改写的测试契约**

1. `tests/unit/result-card-line.test.ts`（新增 12 条）：死局（stuck 与 ended+deadlock **同一句**，
   逐字节相同）、超时、**放弃 = 弃甲曳兵**（且不与 runEndLabel 那句「主动放弃了本局」共用词）、
   赢着收工、两处「没什么可说」（tier won 里程碑、ended 而 endReason 为 null）、彩蛋那句梗压在
   一切终局之上（三档各一句而四个数字一句不少）、数字全部来自入参（换一副事实 + 四个零的边界）、
   三档 × 五种结束原因穷尽往返不抛。
2. `tests/unit/achievements.test.ts`：新增两条——「一念神魔那几颗各带一句用户原话；其余七颗一个
   字节都没有」（逐个 id 钉住那句原文 + 七颗 `note === undefined` 的清单 + 注册表末颗仍是当断即断）、
   「取梗的帮手」（三个原话、一条里两个带 note 时取第一个、没有 note 给 null、空数组给 null）。
3. `tests/e2e/toast-contract.spec.ts`（共享契约，3 风格 × 2 视口 = 每条 6 次）：
   - `成就自带 note`：打完整条神魔码 → 先 B → 合成 `animationend` → 再 A → 断言一条祝贺、`role="status"`、
     `.toast__note` **整句**就是「既见未来，为何不拜？」、整条**不含**「解锁成就」（三套共用的 TAG）、
     整整两个 `<p>`（两行结构不变）、`.toast__head` 带「道通成魔」；
   - `reduced-motion 下这句话一个字节不变`：reduced-motion 装好后走同一条路，note 一字不差、
     TAG 仍不在、`transition-duration` 归零（动效确实降级了，字一个没动）。
   - `startRun` 多一个可选 `url` 形参（默认值即原 URL，11 处既有调用一个都没改）。
4. `tests/e2e/result-card-line.spec.ts`（新增 8 条 = 5 条通用 + 3 条逐风格，两个视口共 16 次）：
   死局那一刻整句、结算后逐字相同、里程碑那一层**一个节点都没有**而赢着收工之后才有、三分钟到点
   （假时钟）、道通成魔那一局（换 (0,0) 与 (3,3) 把一个锁死的局带走 → 卡片说那句梗而四个数字照旧）、
   三套风格各断「这一行与读数小标签同一支墨」（不引入新色值）。

**踩到的坑（六条，都是本票自己踩的）**

1. **卡片是 `grid` + `place-items: center`，宽度跟着最宽的子元素走。** 一个没有 `max-width` 的长句
   会把整张卡片悄悄撑宽（标题 1.5rem、按钮行本来就更宽，所以肉眼未必看得出）。`.overlay__line`
   因此带 `max-width: 16rem`，与 `.overlay__text` 对齐——**这是唯一一处「不写就会改卡片尺寸」的 CSS**。
2. **`endReason` 分不开「死局那一刻」与「里程碑那一层」。** 两者的 endReason 都是 null，而要的是两句
   不同的话（前者是死局总结，后者「还没结束，没什么可说」）。所以 `CardLineFacts` 收的是 `tier`
   而不是只收 `endReason`——光看 endReason 的话，`stuck` 与 `won` 会拿到同一句话。
3. **T30 已经在 App 里派生过 `wishGranted`。** 本票第一版自己也取了一遍 `shenmoOutcomes`，
   `tsc` 当场炸 `Cannot redeclare block-scoped variable`。改成直接用它的 `wishGranted`——
   同一个事实不该有两个出处（这也意味着本票与 T30 在 `App.tsx` 上是耦合的，见下）。
4. **`abandoned` 那一句在浏览器里没有那一刻。** 活跃局点「新游戏」立刻开新局（T04 起就这样），
   界面上露不出放弃那一档。所以「弃甲曳兵」只由单测证——同一个纯函数的另一半，不是没人证；
   这一点写进了 spec 文件头，免得日后有人以为漏了。
5. **彩蛋那条 e2e 需要一副「四方向全锁死」的满盘。** 神魔码的八下必须一步都不推动棋盘，否则
   棋盘会被推动、还可能撞进 won / stuck 把码缓冲清零（用户故事 8）。用一个 4 阶循环拉丁方：
   每行每列都是 2 / 4 / 8 / 16 的排列，横向纵向相邻一概不相等 → 四方向全不合法，而夹具按
   playing 开局。请卡片出来的那一手也验过：换 (0,0) 与 (3,3) 之后**仍是**死局。
6. **reduced-motion 下不能断言 `breaking` 那一档。** 破碎退场的时长在 reduced-motion 下归零，
   档位可能一帧就翻过去——断言它等于赌一次竞态（`shenmo.spec.ts` 的 reduced-motion 那条也不断它）。
   所以那一句只在非 reduced-motion 的用例里断。

**两处歧义，按证据裁了，写在明处**

1. **第四颗（走火入魔）那句诗装在哪。** issue 说「四颗彩蛋成就各装那句话」，同时说「前三颗由本票
   补进已入册的定义」与「不要新增成就（仍是十颗）」。三句话合起来的唯一自洽读法：**诗装好、定义
   留给 T32**。于是那句诗连同 T32 要补的那一行的形状，原样停在注册表里三颗彩蛋定义上方的注释里
   （`note: '一念为神，一念成魔，念念为贪，非念而魔'` 逐字在案），T32 照抄即可。
   **它因此不在运行时数据里**——注册表仍是十条，`ACHIEVEMENTS` 末颗仍是当断即断（单测钉住）。
2. **彩蛋那一局又死局收场时说哪句。** 父规格的架构决策 17 管它叫「the run that earned the wish
   gets one line of its own」，没写它与终局的先后。判据是「那一句是这一局的收礼」：**梗优先**，
   而四个数字一句不少（同一个 `ledger`）——彩蛋不收钱，账也没被抹掉。单测三档各断一句、并断言
   死局那一局的句子里四个数字照旧在场。
3. **`won`（赢着收工）要不要一句总结。** issue 的验收写「四种 `endReason` 各有一句」——四种即
   won / deadlock / abandoned / timeout，于是有；而**里程碑那一层**（tier won、未结算）是
   「没什么可说」的边界：那一局还活着。这一对边界由单测逐条钉住。

**设计技能（业主点名，已读并遵循）**

`~/.agents/skills/design-flow/SKILL.md`（总索引）+ 两个子技能 `frontend-design` /
`frontend-ui-engineering`。按它们做了这几条：

- `frontend-design`「Words are design material / 从屏幕那一边写」——**这几行字本身就是这一票的
  全部界面**，所以每句都按「玩家眼前发生了什么」写，不按系统术语写：死局说「这一局是自己走完的」，
  超时说「钟比棋盘先满」，放弃那句是父规格点名要的「弃甲曳兵」，彩蛋那句说「账照算」。
- `frontend-design`「Let each element do exactly one job」——**这是本票最重要的一条设计决定**：
  那一行**刻意不重复死因**。卡片上「为什么结束」已经由标题与那一句话（`runEndLabel`）说清了，
  再说一遍就是一个元素干两件事。于是 summary 的话头是评注、不是复述；唯一要斟酌的「弃甲曳兵」
  也是一句新话（卡片那一句是「主动放弃了本局」），不是同一句换个说法。
- `frontend-design`「Spend your boldness in one place」——整个特性只有一个签名时刻（B 裂成两片，
  T29），本票不加第二处：那一行是 0.75rem 的注脚墨色，与读数小标签同一档。
- `frontend-ui-engineering`「Contrast ≥ 4.5」——**没有新色值**：那一行用 `--ink-variant` 压在卡片面上，
  而这一对在三套 `contrast.json` 的 milestone 场景早已量过（4.71 / 8.88 / 6.08）。于是不加新对，
  并在 e2e 里断「它与读数小标签同一支墨」——谁把它改成第二种颜色，红的是这一条。
- `frontend-ui-engineering`「Meaningful empty states / 不显示空白」——`line === null` 时**整个元素
  不在 DOM 里**（`{line !== null && <p …>}`），不是挂一个空 `<p>` 占位。
- `frontend-ui-engineering`「Accessibility」——那句话进的是 `role="status"`（隐式 polite + atomic）
  这棵子树，读屏软件会整条播报；e2e 断的正是「它真的在 DOM 里」，而不只是看得见。
  两行结构（`<p>` 的个数）也被钉住：`.toast__head` + `.toast__note`，一个不多一个不少。

**与在飞票的冲突（写下来，免得日后对不上账）**

本票与 T30（礼炮 / 一念按钮）、T33（堕落染墨 / 时之狭 / 音效）**在同一个工作树上并行**，所以：

- `App.tsx` 里 `wishGranted` 是 T30 的派生，本票直接用它。T30 若改名 / 改判据，本票这一处跟着动。
- 收官时的全树 `npm test` 有 4 条红、`typecheck` 有 6 条 error，**全部属于在飞的 T30 / T33**
  （`wish-pair.test.ts` 缺 `GameState` 导入、`cannon-particles.test.ts` 的字面量收窄、
  Claude 暖色用法 3 → 4、`tokens.css` 的 `--tile-*` 12 → 24）。本票一行都没碰那些文件，
  也没有为了「让全树变绿」去改它们的断言——那会把别人的票改成假话。
- 全量 Playwright 的 20 条红同样全是在飞票的：12 条 `contrast-computed.spec.ts` 的失败信息
  明写「**堕落态**里方块 2 上的数值（第 1 档）…… 背景对不上」（T33 的堕落染墨，`--tile-*`
  24 个而渲染与声明还对不上），8 条 `wish.spec.ts` 是 T30 自己的助手等不到「道通成魔」。
- 第一轮全量 Playwright 里那条 `contrast-computed.spec.ts` 的红，是 T30 在跑批途中给
  `contrast.json` 加 `wish` 场景造成的竞态；单独复跑 2 passed。

**没做的 / 边界**

- **人眼复核没做**（见「验证」）。三套 × 两个视口下那一行的换行与疏密，留给控制人。
- **没有一个真的 30 秒被等完**：彩蛋那条 e2e 的破碎退场用合成 `animationend`，与
  `shenmo.spec.ts` 同一条路子。
- **彩蛋那句梗引用了「一念」这个词**，而那个按钮是 T30 的活。当前玩家在 toast 上看到的是
  「道通成魔」，「一念」只见于术语表（GLOSSARY.md）与代码注释。等 T30 的按钮落地它就成了
  界面上看得见的词；在那之前它读起来像「一次心动」——两种读法都不错，但控制人该知道这一句
  是在按钮之前落地的。
- **战绩面板不显示 note**（它显示 `condition`）：这是刻意的，`note` 的文档里写了理由。
  将来若要在面板上也露一句，该新开一个字段而不是复用 `note`。
