# SC-03 · Auto-load catalog-listed style folders

- **Type:** Contract / vertical architecture slice
- **Blocked by:** SC-02
- **Spec:** [Style Catalog and Folder Discovery](../../../docs/specs/style-catalog.md)
- **ADR:** [ADR-0006](../../../docs/adr/0006-style-catalog-source-of-truth.md)

## Goal

Make the catalog whitelist drive renderer loading, removing the separate hand-maintained style registration list without changing the visible style picker or any visual behavior.

## Scope

- Load the renderer config from the folder matching each catalog ID, preserving catalog order and the exported `THEMES` behavior expected by current callers.
- Remove duplicated style IDs and labels from per-style config modules; the catalog owns that metadata.
- Move React-bearing `StyleDefinition` and `OverlaySlot` types from shared types to a renderer-owned style types module.
- Keep each style's `DESIGN.md`, `tokens.css`, `styles.css`, `config.ts`, `contrast.json`, and `toast.tsx` in its folder.
- Leave folders absent from the catalog dormant.

## Acceptance criteria

- [x] Every catalog ID resolves to exactly one matching style folder and required config.
- [x] A catalog entry with a missing folder/config fails build or acceptance; it is never silently omitted or replaced with Classic.
- [x] A folder absent from the catalog is not loaded and does not appear in the picker or matrix.
- [x] The renderer registry exposes entries in catalog order with the same IDs and labels.
- [x] Persisted IDs remain stable; retirement or remapping requires a migration before removal.
- [x] Shared catalog and game-rule modules import no React, CSS, DOM, or renderer modules.
- [x] Existing baseline styles, style switching, storage records, accessibility behavior, and all animations remain unchanged.
- [x] No `App.tsx`, `Board.tsx`, `TileMotion.ts`, `WinPanel.tsx`, `GameOverPanel.tsx`, board CSS, theme CSS, or token files are modified.

## Verification

- `npm test`
- `npm run typecheck`
- `npm run build`
- `npm run test:e2e -- tests/e2e/task-23-matrix.spec.ts`
- `npm run check:contrast`

## Evidence (2026-09-28)

- Delivered:
  - `src/renderer/styles/themes/index.ts` — `resolveThemes(modules)` resolves the registry from
    `STYLE_CATALOG` and throws when an entry has no config or is missing its two slots; the
    discovered map comes from `import.meta.glob<StyleSlots>('./*/config.ts', { eager: true })`;
    `DEFAULT_THEME_ID` is an explicit `'classic'` literal.
  - `src/renderer/styles/types.ts` (new) — renderer-owned `OverlaySlot` and `StyleDefinition`.
  - the three `config.ts` files — only `boardOverlay` / `tileOverlay` remain; ids and labels are gone.
  - `src/shared/types.ts` — no longer imports React at all; it re-exports `StyleId` and points at
    the renderer types module.
  - `tests/unit/style-loader.test.ts` (new, 8 tests).
- **Vite API checked against current docs, not memory.** Context7 is not configured in this
  environment (no MCP tools besides GitHub), so the official docs were fetched directly:
  `vite.dev/guide/features.html`, page version v8.3.1 — confirms `import.meta.glob` is supported,
  `eager: true` yields statically imported module namespaces, keys are the relative pattern form,
  and **arguments must be literals** (no variables/expressions). That last constraint is exactly
  why `resolveThemes` takes the discovered map as a parameter instead of globbing internally.
- `npm run typecheck` pass. `npm test` **759 passed / 39 files** (was 751 / 38; +8).
  `npm run build` pass — **76 modules, same count as before**, i.e. the glob produces the same
  module graph. `npm run check:contrast` pass (3 styles, 65 pairs).
- Rendered output unchanged: the built CSS still carries every style's scoped rules
  (`[data-style=classic]` ×25, `[data-style=material]` ×24, `[data-style=claude]` ×25 occurrences),
  which is the evidence that glob discovery still pulls each folder's CSS into the bundle.
- e2e, headless in the background, `style-switch` / `task-23-matrix` / `contrast-computed` /
  `fonts` / `claude`: **31 failed / 1 skipped / 106 passed**. The identical command on the
  SC-03-reverted tree gives **31 failed / 1 skipped / 106 passed, line-for-line the same list**,
  so this ticket introduces **no** e2e regression. `tests/e2e/style-switch.spec.ts` is fully green
  (16/16) in both states — that is the direct evidence for "style switching is unchanged".
- The 31 pre-existing failures are recorded with causes in
  [../open-items.md](../open-items.md) (B4 and B7); they are design-card/spec drift and font
  loading, unrelated to how styles are registered.

## Outcome

SC-03 signed off for its own scope. Adding a style is now: add a catalog line + add a folder.
`THEMES`, the picker, stats, persistence and the matrix all take identity from the catalog.

## Out of scope

- Adding a fourth style or changing any existing design card.
- Changing visible UI, interactions, colors, typography, or animation behavior.
- Changing the single Zustand store, records semantics, or storage version.
- Publishing GitHub issues or pushing commits.
