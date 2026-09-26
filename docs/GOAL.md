# GOAL — 2048 实现目标与约束

设定日期：2026-09-26 · 由项目所有者指定

> **关于「/goal」**：本机不存在 `/goal` 技能或工具（已核查 `~/.agents/skills`、
> `~/.claude/skills`、superpowers 插件缓存三处）。因此改以本文件 + 项目记忆
> 固化目标。后续 session 读到本文件即视为目标仍然有效。

## 目标

生成**完整离线可玩页面**。

## 退出条件（目标模式）

同时满足以下四条，目标才算达成：

- [ ] 完整离线可玩页面已生成
- [ ] **暂不上线部署**（T24 的 Pages 发布不在本目标内）
- [ ] 由我派发并完成各项验证
- [ ] 验证结论：**游戏可玩、动画正常、设计方案正常**

## 约束（执行期间必须遵守）

1. **积极使用设计技能**。涉及 UI / 视觉 / 动效时加载 `/frontend-design`、`/animate`、
   `/review-animations`、`/emil-design-eng`、`/apple-design` 等。
   这些技能在 Skill 工具中可直接调用；`~/.agents/skills/<name>/SKILL.md` 下也有副本，
   Skill 工具未列出时用 Read 读取。
2. **积极使用编程技能**。涉及模块设计 / 接口 / 可测试性时加载
   `/mattpocock-skills:codebase-design`、`/mattpocock-skills:tdd` 等。
3. **待确认处采用我推荐的方案**，且该方案必须符合此前已达成的项目共识
   （`CONTEXT.md` 词汇表、`docs/SPEC.md`、`docs/adr/`、`docs/mode-contract.md`）。
4. **验收不只看代码通过**：必须包含 Playwright 视觉检查与**实际游玩**通过。

## 执行方式

按 `superpowers:subagent-driven-development` 协议：每个任务派发全新 implementer 子 agent，
任务后接任务评审（规范符合性 + 代码质量），全部任务完成后做整分支总评。
工作区为 `D:\Dev\2048\.claude\worktrees\t02-bootstrap-app`。

**排除范围**：部署上线、GitHub Pages 发布、T24 的对外发布动作。
