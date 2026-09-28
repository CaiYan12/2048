# Style Catalog implementation plan

**Status:** Local plan approved on 2026-09-28  
**Specification:** [Style Catalog and Folder Discovery](../../docs/specs/style-catalog.md)  
**Decision:** [ADR-0006](../../docs/adr/0006-style-catalog-source-of-truth.md)  
**Tracker:** Local tickets only; no GitHub issue is created or published in this plan.

## Goal

Use one pure catalog for stable style IDs, display names, and order; auto-load only matching renderer style folders; keep storage validation independent of CSS and React rendering types.

## Fixed decisions

- The catalog is the whitelist. A style folder absent from the catalog is dormant.
- A catalog entry missing its matching folder or required config fails build or acceptance.
- `StyleId` derives from catalog IDs. IDs are stable after persistence; retirement requires a migration.
- `StyleDefinition` and `OverlaySlot` are renderer-owned. The catalog has no React, CSS, DOM, or `src/game` dependency.
- Preserve the single Zustand store. Do not change visible UI, game rules, CSS tokens, style sheets, or animation behavior.
- The root SPEC is aligned locally. GitHub issue #1 has not been synchronized; no remote changes are authorized by this plan.

## Progress

- [x] SC-01 Expand pure catalog — signed off 2026-09-28 (see the ticket's Evidence section)
- [x] SC-02 Migrate validation and matrix consumers — signed off 2026-09-28 (see the ticket's
      Evidence section; the matrix command's 13 failures are proven pre-existing)
- [x] SC-03 Auto-load catalog-listed style folders — signed off 2026-09-28 (see the ticket's
      Evidence section; the 31 e2e failures in the style specs are proven pre-existing)

## Open items

**无未完成项**——全套闸门通过，含全量 Playwright（378 passed / 14 skipped / 0 failed）。
这一轮清掉的 14 类红条与两个需要人拍板的决定项，逐条留在
**[open-items.md](open-items.md)**（症状 → 根因 → 判据），供将来按图索骥。

## Ticket DAG

```text
SC-01 Expand pure catalog
  └── SC-02 Migrate validation and matrix consumers
        └── SC-03 Auto-load catalog-listed style folders and contract the manual registry
```

| Local ticket | Blocked by | Outcome |
| --- | --- | --- |
| [SC-01](issues/01-expand-style-catalog.md) | none | Pure catalog and derived `StyleId`, with the current renderer registry preserved |
| [SC-02](issues/02-migrate-catalog-consumers.md) | SC-01 | Persistence validation and browser matrix consume the catalog |
| [SC-03](issues/03-auto-load-style-folders.md) | SC-02 | Renderer loads matching folders automatically and removes duplicated registration metadata |

Work blockers-first. Each ticket targets one fresh implementation context and includes its own binary acceptance checks. Do not create or publish GitHub issues without separate authorization.

## Verification contract

- Keep all current styles and their rendered output unchanged.
- `StylePicker` order and labels remain `classic` / Classic, `material` / Material, `claude` / Claude.
- Session/settings/records still round-trip those IDs and reject unknown IDs.
- The browser matrix derives every case from `MODES × STYLE_CATALOG` and compares its expected entries with the rendered picker.
- Playwright must run headless in the background, following `AGENTS.md`.
