# T28 立起「一念神魔」的术语与它的裁决记录

- 状态：本地实现与验收完成（GitHub #31 已关）
- 类型：docs
- 原计划阶段：README TODO · 彩蛋（一念神魔）
- 父级规格：[一念神魔 spec](../specs/easter-egg.md)（GitHub [#30](https://github.com/CaiYan12/2048/issues/30)）
- Blocked by: 无

## 交付范围

把「一念神魔」这组东西的语言与裁决立起来：`GLOSSARY.md` 收六个规范词与它们的禁词，
新建 ADR-0009 记两条裁决，ADR-0002 / ADR-0008 就地增补互引，README 新增「彩蛋」一组。
只动字，不动行为。

## 验收标准

- [x] `GLOSSARY.md` 末尾新小节「一念神魔（彩蛋）」：一念神魔（彩蛋）/ 神魔码 / 抉择 / 一念 /
      二念 / 悬顶 六个规范词，各带定义与 `_Avoid_` 行。
- [x] ADR-0009 记两条裁决——**共享外壳而非第四个插槽**（引 ADR-0002 的判据原文，并说明
      本特性为何不够窄）与**口令是被旁听的**（并写明代价：「回到输码之前的状态」只能指菜单
      与输码态，那八步落子不回溯）；ADR-0002 与 ADR-0008 各加一条指向它的互引。
- [x] README 新增「### 彩蛋」一组：说明游戏里有彩蛋、口令绝不写进界面任何地方、重力掉落
      那个子彩蛋仍欠（一条明确的待办）。
- [x] 产品行为零变化：typecheck、既有单测、既有 e2e 与对比度闸门全部原样通过。

## 验证

**自动验证**（改动前后各跑一次，数字逐项对齐）

| 闸门 | 改动前 | 改动后 |
| --- | --- | --- |
| `npm run typecheck` | 0 error | 0 error |
| `npm test` | 774 passed / 42 files | 774 passed / 42 files |
| `npm run build` | 80 modules | 80 modules |
| `npm run check:contrast` | 3 风格 68 对 | 3 风格 68 对 |
| 全量 Playwright（后台、headless） | 502 / 14 / 0 | 502 / 14 / 0 |

后两项超出了本票要求（本票只动文档），主动跑是为了证明「没有碰坏任何东西」不是一句空话。

## Evidence

**改动落在哪**

- `GLOSSARY.md`：末尾新增 44 行，一个条目六段定义 + 六个 `_Avoid_` 行。
- `docs/adr/0009-shenmo-is-shell-not-a-fourth-slot.md`：新建。Status: Accepted；2026-10-01，
  implementation pending (spec tickets T28–T33)。含 Why（两部分）/ Decision（两部分）/ What it
  trades / Consequences / Considered Options 四项被否方案。
- `docs/adr/0002`：末尾增补一段（2026-10-01），说明「结果层」与彩蛋两次驳回开插槽的申请，
  判据本身一字未改。
- `docs/adr/0008`：第一条 Consequences 里加三句，指向 ADR-0009 把同一条裁决用到了下一个
  开口要插槽的功能上。
- `README.md`：TODO 段末尾新增「### 彩蛋」一组（一段说明 + 两条待办 + 三条约定）。
- `src/` 与 `tests/`：**零行改动**（`git diff --name-only -- src/ tests/` 为空）。

**控制人复核时裁定/更正的四处**

1. **README 两处一行改照留**：「Eight architecture decisions」→「Nine」（加了 ADR-0009 之后
   原句即成假话）；TODO 引言「收录三类内容」→ 把彩蛋补进枚举。两处都是本票自己的改动造成
   的孤儿，属于 AGENTS.md 第 3 条要清的那一类，不是顺手改进。
2. **`GLOSSARY.md` 多出的四个禁词照留**：一念禁「许愿钮 / 神灯」，二念禁「惩罚 / 清零」。
   依据是这份文件自己的不变量——**30 个条目、30 条 `_Avoid_`，无一条空缺**；不加禁词反而
   会破坏它。四个词分别落在父规格的架构决策 7、8 上。
3. **ADR-0009 状态行的票号区间写错，已改**：原文写 `spec T29–T34`，实际是 `T28–T33`。
   决策记录里一个查无此票的区间，比没有区间更糟。全仓库 grep 确认只此一处。
4. **它报的「票与规格对成就个数说法不一致」经判不成立**：规格决策 9 说的是终局（七 → 十一），
   票说的是增量（T29 到十、T32 到十一）。两者层级不同，都不是错。但它肯把看着像矛盾的地方
   报上来而不是自行抹平，这点是对的。

**没做的**

- ADR-0009 的 Status 在实现全部落地后再改成 implemented（与 ADR-0008 同一路子）。
