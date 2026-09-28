# 05: 呈现插槽、三套风格 toast、删除旧通知

**What to build:** 玩家在任意风格下解锁成就时，看到的是**当前风格自己的 toast**：约 5 秒后自行
消失，鼠标悬停或焦点进到里面时暂停，带礼貌播报，最多三条同屏。风格拿到渲染权与消失表现，宿主
只把「这一批成就 + 一条『本条已结束』回调」递给它。某套风格没交 toast 时**注册表抛错**，绝不回退
到别的风格的长相。旧的、停在页面上等玩家点掉的页面通知连同它的 DOM 钩子一起删除。

**Blocked by:** 03（宿主状态）、04（视觉方案）

**Status:** ready-for-agent

- [x] 共享类型里出现第三个插槽，接受一批成就与一个「本条已结束」回调
- [x] 每套风格自己的 toast 文件存在并实现该插槽；缺文件的风格在注册表解析时抛错
- [x] 玩家可见：解锁时当前风格的 toast 出现，约 5 秒后自行消失，悬停/聚焦暂停
- [x] 每条 toast 带礼貌状态播报，一次一条，从不抢走键盘焦点
- [x] 尊重 `prefers-reduced-motion`
- [x] 同一套契约断言在 Playwright 里对**三套风格各跑一遍**（防止三份实现漂移）
- [x] 旧的页面通知组件与其 DOM 钩子删除，全仓无引用残留
- [x] 装载器的「必需件」断言更新为六件套
- [x] 既有的成就 / 战绩 / 矩阵 / a11y 规格全绿；`typecheck`、`build` 全绿

## Evidence（2026-09-28 实现会话）

- **第三个插槽**：`src/renderer/styles/types.ts` 里多出 `ToastSlotProps`（一批成就 + 一个
  「本条已结束」回调）与 `ToastSlot`；`StyleDefinition` 与 `StyleSlots` 各加一个 `toast`，
  `resolveThemes` 在 `typeof slots.toast !== 'function'` 时抛错（新单测：缺呈现插槽同样抛）。
- **三套实现**：`themes/classic/toast.tsx`、`material/toast.tsx`、`claude/toast.tsx` 各一份，
  由各自的 `config.ts` 转出；`styles.css` 里各有一段按 `[data-style]` 隔开的 `.toast-stack` /
  `.toast` 规则（坐标与长相照设计卡 §10）。
- **旧通知拆干净**：`components/AchievementNotice.tsx` 删除；store 的 `achievementNotice`
  与 `dismissAchievementNotice` 删除；App 的接线删除。全仓已无
  `AchievementNotice` / `data-achievement-notice` 的引用（含 e2e 的断言）。
- **装载器的必需件断言**更新为六件套（`tests/unit/style-loader.test.ts`：文件清单加
  `toast.tsx`、config 交出的键从两个变三个）。
- **共享契约**：`tests/e2e/toast-contract.spec.ts` 对三套风格各跑 9 条——解锁当场出现、
  底色就是这一套自己的、约 5 秒自行消失、指针悬停暂停、焦点在内暂停、从不抢键盘焦点、
  最多三条且丢最旧、不遮棋盘与四个方向钮、容器 `pointer-events: none`（卡片之外点击穿透）、
  `prefers-reduced-motion` 下照旧出现且时长归零。**实测 54 passed（3 风格 × 9 条 × 2 视口）**。
