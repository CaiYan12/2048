# T32 二念：扣下棋盘与顶端那条悬顶

- 状态：本地实现与验收完成（GitHub #34 未在本阶段更新）
- 类型：vertical（tracer bullet 的倒数第二格）
- 父级规格：[`docs/specs/easter-egg.md`](../specs/easter-egg.md)（GitHub #30）
- 本票对应：架构决策 **8**（扣下）、**9** 后半（第四颗入册）、**10**（悬顶与 toast 栈让位）、**6**（一遍怎么算）；
  用户故事 **28–33**
- Blocked by: T29 神魔码与抉择（GitHub #32）、T31 彩蛋的那几行字（GitHub #37）

## 交付范围

第二遍的代价与最奇怪的那枚勋章。四块：

1. **遍数计数器**（`ShenmoChoice.ts` 的 `ShenmoState.passes`）：二念的唯一判据是「这是第二遍」，
   而「第几遍」只有走过的人知道——先点 A、放任任一段窗口流尽都**不算一遍**（父规格架构决策 6）。
   计数器只在完整走完 B → A 时 +1。**这是派发令唯一授权改 `ShenmoChoice.ts` 的地方**，
   约束是 T29 那 24 条单测原样通过（见验证与「踩到的坑」第 1 条）。
2. **第二个果 + 第四颗成就**：`ShenmoOutcome` 多 `second-pass`、注册表多 `shenmo-second-pass`
   （走火入魔 😈，条件「本局在抉择里第二次先 B 后 A」），`note` 装 T31 停在注释里等它的那句诗
   「一念为神，一念成魔，念念为贪，非念而魔」。十 → 十一，所有写死个数的地方同步。
3. **扣下**（`App.tsx` 的一个渲染层分支）：第二遍走完，页面清空到只剩一颗「重新开始」。
   `phase` 不变、不结算、不写记录、统计桶一格不动、规则内核一行没改。
4. **悬顶**（新增 `ShenmoStrip.tsx` + 共享外壳 CSS + 三套 token/CSS）：emoji + 名字 + 那句诗，
   钉在视口顶端，本局余下时间都在，不落、不淡、**不是 toast**；toast 栈的 `top` 改成读一个
   变量，由外壳在有悬顶时设置。

**为什么「第二遍」必须是一个新的果**（这是本票最重要的一条设计判断，写在 ADR-0007 的增补里）：
store 的 `recordShenmoOutcome` 是**幂等**的——同一个果记两遍只留第一条。所以第二遍若还结
`first-pass`，store 那儿一个比特都不会动，走火入魔永远解锁不了。让机器在第二遍结出一个
**新**的果，`includes('second-pass')` 就是最直白的判据，而「第三遍及以后」也自然落在同一个
成员上（轮回没有第三种果）。

## 验收标准

- [x] 「一遍」只在 B → A 完整走完时计数；先点 A 与两级窗口流尽都不计数，也不推进轮回。
- [x] 第二遍的菜单、破碎、环与第一遍**逐项相同**（阶段迁移序列逐格比），只有最后那一下的
      结局不同：第一遍结 `first-pass`，第二遍及以后结 `second-pass`。
- [x] 第二遍走完：页面清空到只剩「重新开始」；`phase` 不变、不结算、不写记录、统计桶一格
      不动、规则内核一行没改（浏览器侧从**盘上**证：session 桶里那一局照旧躺着且分数与盘面
      未变，records 与 stats 一个字节都没多）。
- [x] 刷新页面这一局照旧回来（T16 的恢复路径），悬顶与扣下一起没；恢复之后彩蛋进度从零起，
      **还能再走一次火入魔、再被扣下一次**——e2e 一路走完四遍。
- [x] 成就「走火入魔」入册（十 → 十一），用 T31 立好的 `note` 装那句诗；所有写死成就个数的
      地方同步到十一（见 Evidence 的「同步清单」）。
- [x] 悬顶带 emoji、名字与那句诗，住在视口顶端，不落、不淡、不是 toast；刷新即没。
- [x] 悬顶与 toast 栈共用视口顶端而不重叠：三套 `.toast-stack` 的 `top` 改成
      `var(--toast-top, 1rem)`，外壳在 `data-shenmo-pinned` 时把它设成「悬顶高度 + 1rem」。
- [x] 悬顶不吃指针（computed `pointer-events: none`）、不占 Tab 停靠点（连按 4 次 Tab 焦点
      永不落它身上）、`role="status"` 让读屏软件播报一次且可回读；红线照旧（两种视口下
      `scrollWidth <= clientWidth`）。
- [x] 对比度闸门：悬顶是新面，三套各补一对并新开 `pinned` 场景。
- [x] 单测钉住：第二遍授予什么、第一遍不重复授予、轮回只按完整遍数推进。

## 验证

**自动闸门**（全部实跑，数字见 Evidence）

- `npm run typecheck`：**0 error**。
- `npm test`：**886 passed / 47 files / 0 failed**。
- `npm run build`：**✓ 86 modules transformed，built in 259ms**。
- `npm run check:contrast`：**3 套风格 125 对**，全部达标（本票 +3，122 → 125）。
- 全量 Playwright（**后台、headless**，`workers: 4`，preview 构建产物）：
  **678 passed / 14 skipped / 12 failed**——12 条红的逐条点过，**没有一条属于本票**
  （清单见 Evidence）。
- `game.spec.ts` 按既有做法另跑 `--repeat-each=4`：**40 passed / 0 failed**。

**人眼复核没做**：三套风格下那条悬顶的长相（深棕带 / tonal 紫带 / 纸上一条细线三种语气）、
扣下之后那一页「空」的感觉、以及那句诗在窄视口上换不换行——headless 与「不许开真实窗口」的
约定下这一半不能由 agent 代做。本票所有绘制证据都是读回 DOM、计算样式、合成动画事件与
IndexedDB 里的字节，没有人眼看过一次。

## Evidence

**实现落在哪**

- `src/renderer/components/ShenmoChoice.ts`：`ShenmoState` 多第五个字段 `passes`（带一整段
  「为什么遍数必须住在机器里」的注释），`INITIAL_SHENMO` 同步；`choose` + A 那一支按
  `current.passes === 0` 结 `first-pass` / `second-pass`；`sameShenmo` 多比一项；`nextShenmo`
  的规则 6 与文件头注释各补一句。**`shenmoCleared` 不动**——它只清码缓冲与摊，遍数不跟着
  Esc 清零（一轮的历史是「一念 → 二念 → 之后轮回」）。
- `src/game/achievements.ts`：`ShenmoOutcome` 多 `second-pass`（注释写明它为什么不是一个
  新机制）；`AchievementId` 多 `shenmo-second-pass`；`ACHIEVEMENTS` 补第四行定义
  （走火入魔 / 😈 / 「本局在抉择里第二次先 B 后 A」/ 那句诗）；`unlockedAchievements` 多一条
  `includes`；文件头与 `FIRST_MERGE_COUNT` 的注释从十改到十一。
- `src/renderer/components/ShenmoStrip.tsx`（新增）：纯呈现。`achievementEmoji` /
  `achievementUnlockLabel` / `achievementNoteOf` 三个既有帮手取字，**一个字都不新写**；
  `note === null` 时整个 `<p>` 不在 DOM 里（不留一行空白）。
- `src/renderer/App.tsx`：`shenmoSecondPass = shenmoOutcomes.includes('second-pass')` 一个派生
  驱动三件事——外壳的 `data-shenmo-pinned`、`<ShenmoStrip>`、以及扣下那一个分支。
  「战绩与统计」那一串入口在扣下时一并收起（`!shenmoSecondPass &&`），而存档出错那条提示
  照旧显示（它是故障，任何时候都不该被藏起来）。
- `src/renderer/styles/index.css`：`.shenmo-strip` 的结构 / 摆位 / 节奏 / 两条子元素排版，
  以及 `[data-shenmo-pinned='true']` 那一条——它同时设置 `--shenmo-strip-block` 与
  `--toast-top`，**两个数一个来源**（条长高短只改一处）。
- 三套 `tokens.css` 各 2–3 个 token、三套 `styles.css` 各两条规则（`.toast-stack` 的
  `top: var(--toast-top, 1rem)` + `.shenmo-strip` 的配色）。**没有第四种插槽**（父规格架构决策 11）。
- 三套 `contrast.json` 各补一对（scene `pinned`），`scripts/check-contrast.mjs` 的 `SCENES`
  登记新场景，`tests/e2e/contrast-computed.spec.ts` 的 `setupScene` 补一个「两遍完整走完」的分支。
- 测试：`tests/unit/shenmo-choice.test.ts` +6、`tests/unit/achievements.test.ts` +5、
  `tests/unit/achievement-host.test.ts` +2、`tests/e2e/shenmo.spec.ts` +2 条共享契约
  （3 风格 × 2 视口 = 12 次）+ `EGG_NAMES` 补上第四个名字。
- 文档：`README.md` 成就个数那一句、`AGENTS.md` 成就小节补一条带日期的修订行、
  `docs/adr/0007` 补一条 2026-10-01 的增补（原文一字未改）、`.codex/memories/INDEX.md`
  的当前状态一句话补一句。**父规格 `docs/specs/easter-egg.md` 一行未动**——它的验收框与
  Evidence 要等整组收官一次填完，而「seven to eleven」说的正是这一颗落地之后的口径。

**验收数字**

- `npm run typecheck`：**0 error**。
- `npm test`：**886 passed / 47 files / 0 failed**（本票 +13：`shenmo-choice.test.ts` 6 +
  `achievements.test.ts` 5 + `achievement-host.test.ts` 2）。工作树里同时有 T28–T33 未提交的
  改动，全量数字必然带着它们的份；本票自己的三个文件单独跑 **91 passed / 0 failed**
  （30 + 37 + 24）。
- `npm run build`：**✓ 86 modules transformed，built in 259ms**（T31 收官时 85，多的是
  `ShenmoStrip.tsx`）。
- `npm run check:contrast`：**3 套风格 125 对**，全部达标。本票 **+3**（122 → 125，三套各一对
  悬顶自己的色对：5.60 / 13.24 / 13.35）。Material 与 Claude 复用各自现成的 tonal / 纸面值，
  没有新配色。
- 全量 Playwright（**后台、headless**，`workers: 4`，preview 构建产物，**完整日志不截断**）：
  **678 passed / 14 skipped / 12 failed**（704 条，2.8m，exit 1）。12 条红的逐条点过，
  **没有一条属于本票**，而且与 T31 Evidence 里记的在飞红完全同一批：
  · `contrast-computed.spec.ts` 的 `wish` 场景 6 条（三套 × 两视口）——T30 的活，
    失败信息是那颗按钮在探针期望的时刻没渲染出来（`toHaveCount`）；
  · `wish.spec.ts` 的「粒子颜色来自色阶顶端三档的令牌」6 条（三套 × 两视口）——T30 的活，
    礼炮调色板读的令牌不对。
  本票新写与改写的用例（`shenmo.spec.ts` 80 条、`contrast-computed.spec.ts` 的 `pinned`
  场景 6 条、`achievements.spec.ts` 的十一个成就两条）**一条都没红**。
- 本票新增的两个共享契约单独跑一轮：`shenmo.spec.ts` **80 passed / 0 failed**（23.3s）。
- `game.spec.ts` 按既有做法另跑 `--repeat-each=4`：**40 passed / 0 failed**（16.1s）。

**写死成就个数的地方：判断标准是「描写现在 → 跟着现在走；描写当时 → 留在当时」**

- **已同步成十一**：`src/game/achievements.ts` 文件头与 `FIRST_MERGE_COUNT` 注释、
  `tests/unit/achievements.test.ts` 的长度断言 / id 数组 / 两个 describe 标题 / note 清单、
  `tests/e2e/achievements.spec.ts` 的行数与 id 列表、`README.md` 成就个数那一句、
  `AGENTS.md` 成就小节、`docs/adr/0007`（补一条带日期的增补）、`.codex/memories/INDEX.md`。
- **一个字都没动**：`docs/tickets/29-*-33-*` 的 Evidence（已收官票据在当时验到的内容）、
  `docs/specs/easter-egg.md` 的验收框与 Evidence（整组收官时一次填）、
  `docs/primal-setup-plan.md` 的附录（原阶段蓝图）。
- **检查过而没有要改的**：`docs/SPEC.md` 通篇不提成就个数（0 处「成就」）；
  `docs/specs/single-run-achievements.md` 也不提。`tests/unit/contrast.test.ts` 与
  `theme-contract.test.ts` 断的是色档数量（12 / 24）与场景合法性，与成就个数无关。

**踩到的坑（七条，六条是本票自己踩的）**

1. **T29 有一条单测断的是「状态里没有计时字段」，而它的证据是 `Object.keys(state)` 的名单。**
   加遍数计数器就必然多一个键，那条当场红。派发令要求「24 条原样通过、一条都不许改」，
   而这条的**主张**（这一层不表达时间）一个字都不用改，要改的只是它用来证明主张的那份名单。
   处理：只在名单里补上 `passes`，并把「它与时间无关」写进同一条注释；本票其他 23 条
   **逐字未改**。这是本票唯一一处对既有测试文件的让步，记在这里备查。
2. **`--toast-top` 的 fallback 是硬要求。** 第一反应是让三套直接读 `var(--toast-top)`——那在
   **没有**悬顶时等于 `top: auto`，整叠卡片掉回文档流、把棋盘往下推（`.toast-stack` 的
   `position: fixed` 还在，但顶端距离没了）。所以三份都写成 `var(--toast-top, 1rem)`，
   回落值就是改动前那个写死的 1rem。
3. **「键盘可达」不能断言成「按一次 Tab 就落到重新开始」。** 扣下那一页上 toast 自己带着
   `tabindex="0"`（T31 的两行结构要「焦点在内时暂停计时」），而它排在悬顶后面、重新开始
   前面。所以这里断的是它**真正**承诺的那件事：悬顶自己不占停靠点——连按 4 次 Tab，
   `document.activeElement.closest('.shenmo-strip')` 恒为 null。
4. **扣下之后方向键照旧在推棋盘，只是看不见。** 派发令说「这是渲染层一个扣下状态，不是引擎
   的一次结束」，所以 keydown 那条路没有加守卫：八下口令还能打、无效移动还会响一声
   （T33 的 `blocked`）。这是「这一局一点没被碰过」的直白代价，写在这里免得日后有人以为漏了
   一道守卫——**不建议补**：补了就把「渲染层状态」这件事改成了「引擎被禁用一个阶段」。
5. **四条我自己写错的断言，三条是仓库里已经写下来的坑。**（按踩到的顺序）
   - **裸 `[data-toast]` + `toContainText` 撞 strict mode**：第二遍走完那一刻屏幕上同时有
     **三条**祝贺——打码那几下合出的「首次合并」、第一遍的「道通成魔」、第二遍的「走火入魔」
     （每条活 5 秒以上）。改成先 `.filter({ hasText })` 再数 1 条。T30 的第 4 条坑原话就是这条。
   - **`page.reload()` 看到的不是「这一局回来了」**：`silentUrl()` 带 `?seed=` 与 `?board=`，
     而 `hasExplicitStart` 让 hydrate **拒绝恢复存档**——带着参数刷新看到的是开局界面。
     改成 `page.goto('/')`（T16 与 `records.spec.ts` 为这件事各留过一条注释）。
   - **拿扣下前那一帧的分数去比盘上的分数**：第二遍那八下会合并、会加分，而无效方向不计
     步数（这副 fixture 十六下里只有十二下真的推动了棋盘，所以「步数 ≥ 16」也错）。
     最后断的是两件稳定的事：**起始时刻一个都没变**（换局 / 结算清档 / 恢复失败都会动它）
     与分数没少。
   - **IDB 的空桶给 `undefined` 而不是 `null`**：`objectStore.get('current')` 在键不存在时
     返回 undefined，`toBeNull()` 当场红。在读桶的那个助手里归一成 null——「桶是空的」
     只该有一种说法。
6. **主题 styles.css 的注释里不能写不带回落值的 `var(--x)`。** 我把 `--toast-top` 写进了
   `.toast-stack` 那条规则的注释里，`theme-contract.test.ts` 的必需令牌清单当场要求三套
   tokens.css 都声明它（3 条红）。原因是那份清单从 styles.css 的**文本**里扫 `var(`，
   而它**不剥注释**——只有外壳那份 index.css 会剥。注释改写掉即可，规则本身一个字节都不用动。
   这条值得记：它是「扫描 CSS 文本」这套办法的固有边界，以后往主题样式表里写注释都要留意。
7. **我自己的过程错误：`npx playwright test … | tail -30` 会把退出码和失败清单一起吃掉。**
   本票两个新 spec 第一次跑「看起来全绿」（94 passed）就是这么来的——失败清单与
   `N failed` 都在被 tail 截掉的后面。教训与 e2e-debt 里那条「先取基线再说话」同族：
   **看 Playwright 结果要么不截断、要么把整份日志落盘再读**。本票最终数字全部来自完整日志。

**设计技能（业主点名，已读并遵循）**

`~/.agents/skills/design-flow/SKILL.md`（总索引）+ 两个子技能 `frontend-design` /
`frontend-ui-engineering`。按它们做了这几条：

- `frontend-design`「Spend your boldness in one place」——**这一票的签名时刻就是「空」**：
  扣下之后那一页什么都不摆，连标题都不要。唯一被允许张扬的是那条悬顶，其余全部安静。
- `frontend-design`「Words are design material / 从屏幕那一边写」——那颗按钮写「重新开始」
  而不是 "Restart"，因为它就是玩家此刻唯一能做的事；悬顶只说成就自己的名字与那句诗，
  **一句解释都不加**（「你的棋盘被收走了」这种话交给空白的版面说，比写出来更像那句话）。
- `frontend-design`「Let each element do exactly one job」——悬顶只负责「这件事发生在你身上了」，
  不当重启入口、不当面板、不当第二条 toast；重启按钮就是一颗普通的 `.control`（与「新游戏」
  同一个形状），不新造第二套按钮语言。
- `frontend-ui-engineering`「Contrast ≥ 4.5」——新面必过闸门：三套各补一对并新开 `pinned` 场景，
  5.60 / 13.24 / 13.35 全部达线。Material 与 Claude 直接复用各自现成的 tonal / 纸面值，
  没有新配色。
- `frontend-ui-engineering`「Keyboard Navigation / Accessibility」——悬顶里没有任何可操作的东西，
  所以**不给 tabindex**（一个不能操作的 Tab 停靠点只是噪音）；它用 `role="status"`
  （隐式 polite + atomic）让读屏软件在它出现的那一刻整条播报一次，之后一直可回读。
  这一页剩下的唯一交互是一颗真 `<button>`，原生可达。
- `frontend-ui-engineering`「Meaningful empty states / 不显示空白」——扣下那一页是**故意的**
  空状态，而按那句技能的说法「空屏是一次行动的邀请」：唯一的行动在正中央。
  `note === null` 的分支也照办：一个节点都不渲染，而不是挂一个空 `<p>` 占位。
- `frontend-ui-engineering`「Inline styles or arbitrary pixel values」是红旗——悬顶的尺寸全在
  rem 阶梯上，而它占的高度是**一个变量**，同时喂给自己和 toast 栈的偏移。

**没做的 / 边界**

- **人眼复核没做**（见「验证」）。三套各自那条带子的语气、扣下那一页空得好不好看、那句诗在
  320px 上换不换行，留给控制人。算过一遍宽度：18 个全角字符 × 13px + 两侧 32px 内边距
  ≈ 266px， smallest 手机视口也放得下一行；真换行了也只是 `min-height` 长高几像素，
  与 toast 栈的偏移差几像素，不影响两者都读得清。
- **三套设计卡的 DESIGN.md §10 没有补悬顶那一节**：本票的搭眼睛证据是三套各自的
  tokens.css / styles.css 注释，卡片那一节归 T28 的文档组；控制人若要补，三处措辞已经写在
  本票据里（Classic 深棕带 / Material tonal 紫带 + elevation / Claude 纸面 + 下边缘一条细线）。
- **`tests/e2e/toast-contract.spec.ts` 没有加第二遍的用例**：走火入魔那条 toast 走的是与其余
  三颗完全相同的通道（同两行结构、同 `note` 分支），而「它有那句诗」已经由
  `shenmo.spec.ts` 在三套 × 两视口下各断过一遍。再造一组会把同一件事钉第四遍。
- **没有一个真的 30 秒被等完**：破碎退场与两段窗口全部用合成 `animationend`，与
  `shenmo.spec.ts` 既有用例同一条路子。
