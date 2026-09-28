# 01: 本局成就判定与静态清单

**What to build:** 成就的达成只由**正在玩的这一局**决定：判定函数不再接受任何跨局进度，注册表收敛到
6 个（首胜、4096、大数猎人、快手、合并机器、风格旅行者），阈值不变，条件文案改成「本局」口径。
玩家在战绩面板上看到的是这 6 条与各自条件的一份**静态清单**——它列条件，不再声称谁已解锁。

**Blocked by:** None（可以立刻开始）

**Status:** ready-for-agent

- [x] 6 个成就：首胜（本局达标）、4096（本局合出 4096）、大数猎人（本局合出 8192）、
      快手（本局 Time Attack 超过 20000 分）、合并机器（本局合并 200 次）、
      风格旅行者（本局切换风格 5 次）；阈值与现在完全一致
- [x] 条件文案写成本局口径，面板上读得到这 6 条
- [x] 模式收藏家与每日坚守**不在**注册表里，界面上没有任何占位、灰条或暗示
- [x] 判定函数不接受也不读任何跨局累积进度；同一份本局事实永远给出同一份解锁集合
- [x] 战绩面板不再显示「已解锁 N」的计数，不再逐条声称解锁 / 未解锁状态
- [x] 模式规则、计分、生成、撤销历史、记录语义与 store 数量一律未变
- [x] `npm run typecheck`、`npm test`、`npm run build` 全绿（含被本次改动的既有断言）

## Evidence（2026-09-28 实现会话）

- `src/game/achievements.ts` 重写：`ACHIEVEMENTS` 就是那 6 条，条件文案全部是「本局」口径；
  `unlockedAchievements(facts)` 成为唯一的判定入口，没有任何累积入参；`RunFacts` 只剩
  modeId / score / highestTile / reachedTarget / merges / styleSwitches 六个字段。
- 随退休成就一起成为孤儿的 `utcDayNumberOf`、`MODE_COLLECTOR_TARGET`、`DAILY_STREAK_TARGET`
  连同 `AchievementProgress` / `applyRunToAchievements` / `decodeAchievementProgress` 一并删除。
- `src/renderer/components/StatsPanel.tsx`：撤下「成就解锁」那一格与每行的 `data-unlocked`，
  成就区改成「名字 + 条件」的静态清单。
- 单测：`tests/unit/achievements.test.ts` 重写为每条成就的「阈值下 / 正好 / 阈值上」与派生
  不变量（同一份事实永远给出同一份集合）。
- 闸门：`npm run typecheck` 0 错；`npm test` **739 passed / 40 files**；`npm run build` 通过
  （78 modules）。
