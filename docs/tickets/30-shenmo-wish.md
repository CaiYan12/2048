# T30 一念的奖品与礼炮

- 状态：本地实现与验收完成（GitHub #33 未在本阶段更新）
- 类型：vertical（tracer bullet）
- 原计划阶段：README TODO · 一念神魔
- 父级规格：[`docs/specs/easter-egg.md`](../specs/easter-egg.md)（GitHub [#30](https://github.com/CaiYan12/2048/issues/30)）
- 本票对应：架构决策 7、13；用户故事 18、20–27、38、40、41
- Blocked by: T29 神魔码与抉择（GitHub #32）

## 交付范围

第一遍走完的报酬。三块，加一条对比度：

1. **礼炮**（新增 `src/renderer/components/Cannon.tsx` + `CannonParticles.ts`）：先 B 后 A 的
   那一刻，页面左上与右上各射一发。canvas 手写粒子（**无第三方库**，仓库一个都没有）：
   约 150 颗/发、重力、阻尼、旋转、衰减、寿命；粒子颜色取色阶顶端三档的令牌
   （`--tile-9/10/11`），于是三套风格的礼炮自动各成一套。覆盖层 `pointer-events: none`，
   `z-index: 5`（压在祝贺之上：粒子从那一行字前面飘过去）。**reduced-motion 下不画 canvas**，
   降级成一行静止的文字。
2. **一念按钮**：页面底部（棋盘正下方、方向按钮之上），第一遍走完时授予、非 `playing`
   阶段不渲染、开新局收回。按下它调 store 的新动作 `plantWish`，**照 Cheat swap 的形状**：
   压历史、写 session、不计步数、不记分、只在 `playing` 有效、拾取态一并收摊。
3. **那一对怎么算**（新增 `src/renderer/components/WishPair.ts`，纯函数）：从模式**自己声明的**
   阶梯与合并表推出「合一次就达标」的相邻一对——经典 1024/1024、斐波那契 987/1597、
   大棋盘合到 4096。六模式通用，**不按家族写特例**。没有空格可摆时按字面把两处相邻的**方块**
   改掉；障碍格一律跳过（T07：墙永不持数值）。
4. **对比度**：那颗按钮自己的三对色对进闸门（新场景 `wish`），三套各三对，77 → 86 对。

**纯逻辑缝两条**：粒子运动（位置 / 速度 / 重力 / 阻尼 / 旋转 / 寿命）抽成时间的纯函数配单测；
「那一对怎么算出来」也抽成纯函数配单测（不写死任何数值）。canvas 本身与 DOM 不单测。

**不属于本票**（别处的活）：卡片那一行、败局墓志铭、四颗成就的梗（T31）；二念与悬顶（T32）；
堕落染墨、时之狭、音效（T33）；`CONTEXT.md` / ADR / README（T28 已收官）。
`src/renderer/components/ShenmoChoice.ts` **一行都没动**（它已收官并被单测钉住）——本票挂的是
「一念达成」那个结局，而那个果早就通过 store 的 `shenmoOutcomes` 到了外壳手上。

## 验收标准

- [x] 先 B 后 A 时两上角各射一发礼炮：真粒子（读回像素）、有重力与旋转与衰减（纯函数 +
      单测）、颜色来自顶端三档令牌（data 属性与计算样式逐字对账 + 像素逐色对）、覆盖层不吃指针
      （`elementFromPoint` 打不中它）。
- [x] 成就「道通成魔」通过既有 toast 落地，文案与 emoji 由注册表供（本票没有新写一个字）。
- [x] 页面底部出现「一念神魔」按钮：第一遍授予、非 playing 阶段不渲染（store 另有一道
      `playing` 守卫）、开新局消失；它的长相与普通控件有区分（自己的 token，三套各出，
      药丸 + display 字体 + 字距），不是又一个「新游戏」。
- [x] 按钮摆下一对相邻方块，一次合并即达成本模式的达标块；六个模式全部通用（性质逐模式
      各证一遍，没有家族分支）；没有空格时改掉两处相邻方块；障碍格一律跳过。
- [x] 摆下那一对可撤销、写 session（盘上那一对等得到落盘）、不计分、不记步数（步数不在
      DOM 上，由单测逐字段钉）；撤销后棋盘照旧说真话，而**授予不收回**。
- [x] 粒子运动是时间的纯函数（位置 / 速度 / 重力 / 阻尼 / 旋转 / 寿命），单测钉住它，
      canvas 本身不测。
- [x] reduced-motion 下礼炮变成一行静态文字，其余报酬不变（按钮照旧授予、照旧摆得下）。

## 验证

**自动闸门**（全部实跑，数字见 Evidence）

- `npm run typecheck`、`npm test`、`npm run build`、`npm run check:contrast` 全通过。
- 全量 Playwright（**后台、headless**，`workers: 4`，preview 构建产物）见 Evidence。
- 本文件新增的 `tests/e2e/wish.spec.ts`（7 条共享契约 × 3 风格 × 2 视口 = 42，加 8 条通用
  × 2 视口 = 16）全绿；`tests/e2e/contrast-computed.spec.ts` 新增的 `wish` 场景同例全绿。

**人眼复核没做**：礼炮「像不像礼花」、三套各自的配色好看不好看、那颗药丸在三套里的气质
——headless 与「不许开真实窗口」的约定下这一半不能由 agent 代做。本票所有绘制证据都是读回
计算样式、data 属性与 canvas 像素，没有人眼看过一次。

## Evidence

**实现落在哪**

- `src/renderer/components/CannonParticles.ts`（新增，纯函数）：`spawnBurst` / `stepParticle` /
  `stepBurst` / `alphaOf` / `cannonOrigins`。零 DOM、零 canvas、零 rAF——随机源由调用方注入
  （ADR-0001 的同一条纪律）。常数全是 `SCREAMING_SNAKE` 模块常量，一个数值都不藏在算式里。
- `src/renderer/components/Cannon.tsx`（新增）：读令牌 → 按帧推进 → 画 → 自己摘掉自己。
  **终点不是 `setTimeout`**（假时钟会把它冻住；最后一颗粒子熄灭的那一帧就是终点）。
- `src/renderer/components/WishPair.ts`（新增，纯函数）：`wishPair`（那一对）、`wishCells`
  （摆哪两格）、`plantWishPair`（落成新状态：只换 board 与 `nextTileId + 2`）。
- `src/renderer/stores/useGameStore.ts`：一个动作 `plantWish` + 一条 import。**引擎一个字节
  都没动**——父规格的 Out of scope 第一条就是「规则不许动」，作弊交换住在 `engine.ts` 是因为
  mode-contract §3 把它列成了恢复动作，而一念是外壳递的一份礼物，不是一条规则。
- `src/renderer/App.tsx`：`<Cannon granted={wishGranted} />` 与那颗按钮（都在棋盘正下方、
  方向按钮之上），文件头补两行。授予与收回的唯一开关是 store 的 `shenmoOutcomes` 里有
  `first-pass`——礼炮与按钮同一个事实，于是「第一遍授予、开新局收回」只有一处说了算。
- `src/renderer/styles/index.css`：`.cannon`（fixed / inset 0 / `pointer-events: none` / z-index 5）、
  `.cannon__still`（reduced-motion 那一行）、`.wish`（药丸 + display 字体 + 字距，一个色值都没有）。
- 三套 `tokens.css` 各四个 token（Material 五个，多一个投影）、三套 `styles.css` 各三条规则
  （底面 / 悬停 / 焦点环，Material 多一条投影）。**没有第四种插槽**。
- 三套 `contrast.json` 各三对新色对，`scripts/check-contrast.mjs` 与
  `tests/e2e/contrast-computed.spec.ts` 各登记一个新场景 `wish`。
- 测试：`tests/unit/wish-pair.test.ts`（新增 18 条）、`tests/unit/cannon-particles.test.ts`
  （新增 12 条）、`tests/e2e/wish.spec.ts`（新增 58 条）。

**验收数字**

- `npm run typecheck`：**0 error**。
- `npm test`：**869 passed / 47 files**（0 error）。本票**新增 30 条**（`wish-pair.test.ts` 18 +
  `cannon-particles.test.ts` 12）；同树其余部分 839 条 / 45 文件，两个数相减就是新增量
  （工作树里同时有 T31 / T32 / T33 未提交的改动，跑全量就是会带上它们的数字）。
- `npm run build`：**✓ 85 modules transformed，built in 282ms**。T29 收官时是 81 modules，
  本票多三个文件（Cannon / CannonParticles / WishPair），其余增量来自并行票。
- `npm run check:contrast`：**3 套风格 122 对，全部达标**。本票 **+9**（77 → 86，三套各三对
  一念按钮自己的色对）；122 与 77 之间其余的增量来自并行票（T32 的堕落染墨）。
- 全量 Playwright（**后台、headless**，`workers: 4`，preview 构建产物）：**582 passed /
  14 skipped / 0 failed**（3.8m，exit 0）。T29 收官时是 502 / 14 / 0；差额包含本票
  `wish.spec.ts` 的 58 条与 `contrast-computed.spec.ts` 新 `wish` 场景的 6 条，以及并行票
  （T31 / T32 / T33）未提交的增量——**工作树是共享的**，全量数字必然带着它们的份。
- 本票新增 `tests/e2e/wish.spec.ts`：7 条共享契约 × 3 风格 × 2 视口 = 42，加「三套各穿自己的
  衣服」1 × 2 = 2，加六模式通用 6 × 2 = 12，加满盘兜底 1 × 2 = 2，合计 **58 条全绿**。
- 收尾清掉一处重复注释之后**复跑了本票自己的两份契约**（`wish.spec.ts` 58 条 +
  `contrast-computed.spec.ts` 26 条）：**84 passed / 0 failed**（44.6s）。
- `game.spec.ts` 按既有做法另跑 `--repeat-each=4`：**40 passed / 0 failed**（31.6s）。本票把
  一念按钮插到棋盘与方向按钮之间，键盘那条契约（方向键整页在线、滚页面、滚轮、守卫插槽控件）
  值得单独钉一遍——它一遍都没红。

**新增 / 改写的测试契约**

1. `tests/unit/wish-pair.test.ts`（新增 18 条）：纯函数半边十一条 + store 半边七条。
   - 纯函数：六个模式各证一遍「`MERGE(低, 高) === 该模式 target`、两个值都在自己的阶梯里、
     都低于 target」；规格点名的三个答案（1024/1024、987/1597、2048/2048）作为同一式子的
     三个解；「取的是最高那一对」用斐波那契钉住（(377, 610) 也合成 987，但不是 target）；
     摆位四条（两格都空时优先、障碍格一律跳过、满盘兜底、一处相邻都没有时返回 null）；
     落成新状态四条（棋盘逐格、十个 GameState 字段逐项、墙一格没碰、六个模式都能一合达标
     ——最后一条用真的内核 `slideBoard` 走过去）。
   - store：进历史恰好一条且前态是同一个引用、撤销收回奖品而**授予不收回**、三个非 playing
     阶段各原样返回、没开局原样返回、满盘兜底照样进历史、拾取中的半个选择一并收摊。
2. `tests/unit/cannon-particles.test.ts`（新增 12 条）：发射（数量、两个上角对射的方向符号、
     四个区间、固定序列下的精确值、同一个随机源给出同一发）、走一步（重力与阻尼的**手算值**、
     入参不被改、重力越拉越大而阻尼越磨越小）、一发放完（寿命耗尽的被摘掉、放到寿命上限之外
     必然自己空、透明度跟着剩余寿命走）。
3. `tests/e2e/wish.spec.ts`（新增 58 条）：共享契约七条 + 八条通用。
   - `先 B 后 A：两上角各射一发真粒子，覆盖层一个指针都不吃`：computed `position: fixed` /
     `pointer-events: none` / `z-index: 5` / `aria-hidden`；`elementFromPoint` 打在两处都不落在
     canvas 上；**读回两个上角的像素**（逐帧等到两个角都画出 200+ 个不透明像素为止）。
   - `粒子颜色来自色阶顶端三档的令牌`：`data-cannon-palette` 与 computed `--tile-9/10/11`
     逐字相等；三档都真的出现在画面上（逐档断言，不断「至少一个」）；每个画出来的颜色都必须
     落在这三档两两的三条连线上（blend 判据，见下面第 2 条坑）。
   - `按钮授予、可撤销、不计分；开新局收回`：按钮文字、动了且只动两格、两格正交相邻、
     两个 1024、`data-score` 前后一致、撤销后棋盘回去而按钮还在、墙一格没少、开新局后
     按钮与 canvas 一齐消失。
   - `写 session`：轮询 IndexedDB 里那一局的方块数跟上盘面（等盘上那个值，不等墙钟）。
   - `非 playing 阶段无效`：把那一对合掉 → 胜利面板露头 → 按钮不在、面板上也没有第二颗
     同名按钮；点「继续玩」→ 按钮回来。
   - `reduced-motion`：canvas 一个节点都没有、那一行字在且文案逐字对、它的 computed
     `animation-name` 是 `none` 且 `transition-duration` 是 `0s`；按钮与那一对照旧。
   - `红线`：两种视口下 `scrollWidth <= clientWidth`。
   - 八条通用：三套的按钮底面 / 描边 / 礼炮配色**两两不同**（不写死色值）；六个模式各证
     「一次合并即达标 + 两格正交相邻 + 墙一格没碰」；满盘兜底（两处**原来都有方块**，
     顶上来的是两个 1024）。
4. `tests/e2e/contrast-computed.spec.ts`：`SCENES` 加 `wish`，`setupScene` 加一个分支
   （空盘 → 打码 → 点 B → 合成 `animationend` → 点 A → 等按钮现身）。

**踩到的坑（六条，四条是本票自己踩的）**

1. **锥角乘上「方向号」不改变水平分量的符号。** 右上那一发写成
   `angle = toward * aim` 之后 `vx = cos(angle) * speed`——而 **`cos` 是偶函数**，vx 照旧
   是正的，整发打向画面外。是单测抓到的（`expect(particle.vx).toBeLessThan(0)`），
   不是人眼：粒子的位置每帧都在变，肉眼只会觉得「右边那发好像没什么东西」。修法是把方向
   单独乘在**水平分量**上。这条值得记下来——它是「角度带符号」这个直觉的典型陷阱。
2. **canvas 像素不能逐色断言。** 第一版断言「每个像素都落在三个色值附近（容 3）」，Claude
   两处视口全红：像素是**预乘**存进缓冲的，alpha 低的边缘像素读回来 RGB 被摊薄；而三百颗
   粒子从同一个点发射，互相压出来的 blend 本来就该出现（实测 `132,67,46`——陶土色 72%
   压在墨色上）。三处修法叠起来才是对的：只读 `alpha ≥ 250` 的像素；blend 判据从「离某一档
   近」换成「离这三档两两的三条**连线**近」（Claude 的陶土色离它那两档墨色有 98 个通道远，
   比「离两头都近」是两回事）；另外逐档断「这一档真的画上去了」。
3. **一念按钮的 DOM 位置决定 Tab 停靠点。** 第一版把它排在方向按钮之后（与「新游戏」作伴），
   于是手机上从棋盘 Tab 出去落在方向按钮的「向上」上，`.wish:focus-visible` 探针量不到它；
   桌面端它又是第一个。同一个 hook 在两个 project 上按不同的键走，写死走法就会有一个
   project 说谎。修法是把按钮（与 canvas）搬到**方向按钮之前**——它因此也成了「机器答话
   之后递给你的东西该贴着棋盘出现」的那个位置。顺带一个性质：非 playing 阶段它卸载时焦点
   掉到 body，而 T27 那条「层卸载时把焦点还给棋盘」的 effect 正好兜住（与「新游戏」同一条路）。
4. **裸 `[data-toast]` 撞 strict mode。** 空盘打码那几下会顺手合出第一次合并，屏幕上同时有
   两条祝贺——`toContainText('道通成魔')` 当场报 strict mode violation。改成
   `.filter({ hasText })` 再数 1。
5. **预览端口被并行票占着。** `playwright.config.ts` 的 `reuseExistingServer: false` 是硬约定
   （宁可失败也不复用陈旧产物），而 T31 / T32 / T33 同时在同一棵树上跑 Playwright。本票的
   e2e 是「等 4173 的 LISTENING 消失再跑」的轮询式后台任务，不是改配置。
6. **工作树是共享的。** 收尾 `npm run typecheck` 一度报两个错，都不在本票的文件里
   （`useGameStore.ts` 的 `ShenmoSound`、`achievements.test.ts` 的 `shenmo-second-pass`、
   `shenmo-clock.test.ts` 的 `Board → CellSpec[][]`）——那是并行票改到一半的样子。
   本票的做法是**只核对自己的文件**，等它们落定再取最终数字，没有替别人改代码。

**两处歧义 / 一个当场定下来的形状，按证据裁了，写在明处**

1. **「非 playing 阶段无效」是不渲染还是禁用。** 选**不渲染**：与「新游戏」同一条形状
   （面板露头时它也在），而一颗点不动的灰按钮要么得为三套各出一套禁用样式、要么就是在骗人。
   store 的 `plantWish` 里另有一道 `phase !== 'playing'` 守卫——「界面不画」与「动作拒绝」
   是两件事，后者由单测钉住（三个终局阶段各原样返回）。
2. **奖品那一对从顶端往下扫，而不是直接取末尾两档。** 末尾两档在两个家族里都恰好是答案，
   但「恰好」是阶梯**构造**的一个性质，不是一个可以顺手假设的前提。扫一遍的代价是 O(n²)
   （n ≤ 17），换来的是「为什么这一对能达标」当场可验。斐波那契那条用例钉的就是这件事：
   (377, 610) 也能合成 987，但它不是 target。
3. **礼炮压在祝贺之上（z-index 5）而不是之下。** 粒子从那一行字前面飘过去比被它盖住更像
   「同一时刻」，而它不接指针、`aria-hidden`，压过去的只是一些 3–7px 的小纸片。

**顺带补上的一件事**：用户故事 40（「别让一个玩笑花掉可读性」）落在本票的是**那颗按钮**自己，
于是新开一个 `wish` 场景、三套各三对。reduced-motion 那一行字复用既有的 `--ink on --page`
（与 `.hint` 同一对色值），没有新增色对。

**设计技能（业主点名，已读并遵循）**：`~/.agents/skills/design-flow/SKILL.md`（总索引）+ 三个子技能
`frontend-design` / `animate` / `frontend-ui-engineering`。按它们做了这几条：

- `frontend-design`「Spend your boldness in one place」——全特性只有一个签名时刻：**两上角
  对射的那两发粒子**。按钮因此刻意安静：与 `.control` 同一族颜色，只把形状换成药丸 +
  display 字体 + 0.08em 字距——「机器递过来的东西」与「这一局的操作」在排版上分得开，
  不需要第二种颜色。
- `frontend-design`「Typography carries the personality」——按钮用 `--font-display` + 700，
  与 T29 的两颗圆钮同一句话；礼炮的三个色值也**不写死**，从令牌读，于是三套各成一套。
- `animate`「Should this animate at all」——礼炮是「rare / first-time（celebration）」那一档，
   delight 预算正该花在这儿；而**按钮没有进场动画**：它与「新游戏」并排，只给其中一个加
  淡入会读成 bug。这一条是这条规则的产物，不是漏做。
- `animate`「Cheapest tool that works」+「transform / opacity only」——粒子是 canvas 手写物理
  （三百颗粒子每帧各转各的，CSS 无能为力），一个库都没引；`cannon__still` 一条动画都没有。
- `animate`「Reduced motion ships with the animation」——不画 canvas，降级成一行静止的字，
  且那条字自身 `animation-name: none`。
- `frontend-ui-engineering`「Contrast ≥ 4.5 / ≥ 3」——按钮自己的三对色对进闸门（77 → 86）。
- `frontend-ui-engineering`「Keyboard accessible」——按钮是真 `<button>`、有可见文字、
  Tab 到得了（它的位置因此被钉在方向按钮之前）；canvas `aria-hidden`（这一声是装饰）。

**与本项目既有约定冲突、而我选了既有约定的地方（两处）**

1. `animate` 的 `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`「别用内置 ease-out 做刻意的动画」——
   本项目从 T21 起把 **150ms + 内置 ease-out** 记成一条「已接受的稳定性决定」（AGENTS.md
   的 T21 一节明写「别引入第二条曲线」）。本票一条 CSS 动画都没加，所以两个都没有——
   礼炮的曲线是 canvas 里的物理（重力 + 指数阻尼），不是 easing。
2. `frontend-ui-engineering` 的 hover 建议（`@media (hover: hover) and (pointer: fine)` 门控）——
   本项目 `.control:hover` 一贯是裸的背景互换、不过门控（触屏上误触一次 hover 的代价只是
   颜色变一下）。照既有形状走，**没有**给一念按钮加 hover 门控。

**没做的 / 边界**

- **人眼复核没做**（见「验证」）。礼炮「像不像礼花」、三套配色各自的气质、按钮在三套里的
  分量感，都留给控制人。
- **没有一个真的粒子被数过「好看」**：像素断言只回答「画了」「画的是这三个色」。
- **衰减只做了一半在物理里，一半在画法里**：速度阻尼是物理（`DRAG`），透明度衰减是
  `alphaOf`——两者都在纯函数里，画布只负责读。没有「落地反弹」「被风吹」这类下一步，
  父规格只点了重力 / 旋转 / 衰减 / 寿命四样。
- **canvas 不随视口缩放重排**：尺寸在挂上那一刻量一次。窗口在那一两秒里被拖动的话，弹道
  仍按旧宽高算——这是可接受的（两发只活 1.1–2.1 秒），没有为它加 resize 监听。
- **那一行 reduced-motion 文字常驻**到这一局结束（不自动消失）：它是 reduced-motion 下这一局
  唯一的礼炮痕迹，而它一个字都不动，留着不扰人。
- **礼炮只在第一遍响**：`shenmoOutcomes` 对同一个果幂等，第二遍走完魔道不再授予任何果，
  于是也没有第二发（父规格的架构决策 6 说得很清楚：第二遍摆出的是同一副摊）。
- **没有给礼炮加「多来几发」或可配置数量的口子**：150 是 issue 的原话，一个常量。
