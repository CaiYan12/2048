# Open items · Style Catalog phase

**Updated:** 2026-09-28
**Tracker:** local file only. No GitHub issue is created or published for these.

**当前状态：无未完成项。** 全套闸门通过——
`npm run typecheck`、759 条单测 / 39 个文件、`npm run build`（76 模块）、
`npm run check:contrast`（3 套风格 65 对），以及**全量 Playwright：378 passed / 14 skipped / 0 failed**。

下面按「这一轮到底发生了什么」留档，供将来看到类似症状时按图索骥。
每一条都写清了**症状 → 根因 → 判据**；判据都是实测出来的，不是推断。

---

## 一、清掉的 14 类红条（全部是测试侧问题，产品代码只动过风格身份那一层）

### 1. e2e 对 IndexedDB 写死版本号
- 症状：`VersionError: The requested version (1) is less than the existing version (2)`。
- 根因：应用用 `DB_VERSION = 2`（T17 加了两个桶），规格写死 1。
- 改法：**不带版本号**打开（不升级 = 不会被挡 = 不会再漂）。

### 2. 在 `onupgradeneeded` 里开事务摆种子
- 症状：种子**从来没写进去过**（断言读到 undefined），且那次连接不关会把应用的升级挡住，
  页面停在「正在恢复上次的一局…」。
- 判据：探针拿到 `InvalidStateError: A version change transaction is running`。
- 改法：等应用把库建好之后再写，用不带版本号的连接。

### 3. 夹具用例漏了「先从界面选模式」
- 症状：分尺寸——25 格的夹具对不上默认 Classic 的 16 格就**整条退回随机开局**（分数一起丢）；
  同样是 4×4 但阶梯不同的（斐波那契）**照收却按 Classic 取档**。
- 判据：报出的实测值 `53` 恰好等于 `fitCellSize(4, 320)`，一句话定位。
- 改法：收成帮手 `startRun(page, mode)`，三处共用（缩放 / 终局结算 / 长数值）。

### 4. `boxShadow !== 'none'` 判不出「有没有投影」
- 根因：`board.css` 给方块永远留着一个 box-shadow 槽（`var(--tile-elevation, 0 0 #0000)`），
  兜底是**全透明**的一层，所以 computed 永不为 `'none'`。
- 判据：探针实测 Classic/Claude 是 `rgba(0,0,0,0) 0px 0px 0px 0px` 且变量为空串，Material 两层真投影
  ——**实现与三张设计卡一致，错的是判据**。
- 改法：判「颜色带不带不透明度」。

### 5. Claude 纸面色抄错一个十六进制位
- 症状：期望 `rgb(240,238,226)`，实测 `rgb(240,238,230)`。
- 判据：`tokens.css`、`DESIGN.md`（5 处）、`contrast.json`（7 对实测背景）**三处都是 `#f0eee6`**，
  只有测试写 `#f0eee2`。没有需要人裁的方向。

### 6. 断言写进 `page.evaluate`
- 症状：`ReferenceError: expect is not defined`。
- 改法：回调只回传事实，断言留在 Node 侧。

### 7. `getBoundingClientRect().y` 当成「棋盘动了」
- 判据（探针）：大棋盘桌面结算后**页面滚了 22px**（文档坐标没变）；限时两个视口是
  **倒计时那一行消失**、整页矮 72px（棋盘在文档坐标里真的上移）。两者都不是面板干的。
- 改法：直接断言机制——面板 `position: absolute` 且矩形与棋盘逐像素相同。

### 8. `resetFontStateTrace` 重新赋值数组
- 症状：trace 永远是 `[]`。
- 根因：`MutationObserver` 的回调闭包握着原数组，`bank.__fontStates = []` 只换了 window 上的引用。

### 9. initScript 里 `observe(document.documentElement)`
- 症状：同上，trace 从第一步就是空的。
- 根因：initScript 跑在「文档刚建起来、根元素可能还没生成」的那一刻，`observe(null)` 抛
  TypeError → 整个 initScript 静默失效（`__fontStates` 已挂在上一行，所以读到空数组而不是 undefined）。
- 改法：`observe(document, { subtree: true })`。

### 10. `openStats` 不是幂等的
- 根因：那个按钮是**开关**（aria-expanded），面板已开时再点一次是关掉它。

### 11. 「切风格」连点同一枚按钮
- 症状：计数少一次（期望 5 停在 4），风格旅行者因此不解锁，时红时绿。
- 根因（两条，都实测）：① 点完不等 React 提交就读 `aria-pressed`，第二次又点同一枚（no-op）；
  ② 刷新后 hydrate 未落定时，选择器的 `aria-pressed` 与 store 的 `styleId` 不一致，
  点到「看起来没选中、其实已选中」的那一枚（也是 no-op）。
- 改法：点完 `await expect(button).toHaveAttribute('aria-pressed','true')`；刷新后先等
  `main[data-style='material']` 再切。

### 12. 伪造配额错误时「先 abort 再派发请求错误」
- 根因：应用 `settleWrite` 明写「请求的错误先于中止事件」，规格把顺序写反了，
  于是事务的 AbortError 先到，界面说了句没信息量的白话。
- 附带：错误派发本身会了结事务，随后的 `abort()` 会抛 —— 要 `try/catch`，
  否则它以 pageerror 落到 `problems` 里。

### 13. `readActiveRing` 切颜色切到第一个空格
- 症状：`认不出的颜色：rgb(74,`（7 条用例 × 2 视口）。
- 根因：`layer[0].slice(0, layer[0].indexOf(' '))` 里的第一个空格在 `rgb(74, 68, 63)` **括号内**。
- 改法：切到 `)` 为止。

### 14. 另外四处「前提没摆对」的断言
- `records` 第二次按方向键前没把焦点交回棋盘（点过风格按钮，焦点在按钮上）。
- 按 ArrowLeft 假定一定推得动——新游戏盘面随机，无效移动不生成 → 改四个方向依次试。
- `achievements` 用 `goto('/')` 的随机盘面求死局 → 改确定的一步即死局面。
- `achievements` 断言成就行却没打开面板；`task-22-a11y` 假定 Tab 下一站就是「战绩与统计」
  → 改成有界地转到它为止。
- `task-22-a11y` 用四个 1024 验「一次 Move 什么都不播」——那一动**就是达标**，
  与同一条用例后面的 `[data-run-status="won"]` 自相矛盾 → 普通合并改用 `MERGE`（2 2 → 4）。
- `task-22-a11y` 写死「第 1 行第 1 列」，而 id=1 的方块位置由随机流决定 → 从 `data-row`/`data-col` 推。

---

## 二、真正剩下的两个**决定项**（不是红条，需要人拍板）

1. **`unreadable` 这条拒绝理由在生产路径上没有调用者。**
   `RejectReason` 含 `'unreadable'`，只由 `decodeSessionText`（`JSON.parse` 失败）产出，
   而 `src/` 里没有任何模块调用它——应用读桶走结构化克隆的值。删掉它会动
   `restoreFailureMessage` 的穷尽 switch 与几处单测；留着就是一个「将来存档改成文本形态」的接口。
   **未动，因为删它属于改产品行为。**

2. **`scripts/check-contrast.mjs` 从文件系统枚举风格，不读目录。**
   `themeIds()` 用 `readdirSync`，与 `STYLE_CATALOG` 无关；影响是目录之外的休眠文件夹也会被审一遍
   （无害，但不是目录说了算）。若干单测同样用 `THEMES` 枚举风格产物
   （`theme-contract` / `font-licences` / `focus-visibility` / `records.test.ts`）——
   它们问的是「风格产物齐不齐」，不是「id 合不合法」，所以不在 SC-02 的范围里。
   SPEC 的测试策略里有一句「contrast、token 与文件夹检查由目录驱动」，可以作为将来的依据。

---

## 三、方法（这一轮真正沉淀下来的东西）

- **报「这是回归」之前先取基线**：`git stash` 收起本票改动跑同一条命令，逐行比失败清单。
- **先探针取真实值再判方向**：这一轮 14 类里有 9 类是靠一个临时 Playwright 探针定案的
  （写完即删），靠读代码猜的话至少错三次。
- **判不了的只记录、不擅自改断言**：`B9`（结算后棋盘 y）当初就是按这条办的——
  后来探针证明那是滚动与倒计时行，才敢改成断言机制。
