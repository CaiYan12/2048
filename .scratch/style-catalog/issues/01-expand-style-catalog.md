# SC-01 · Expand a pure style catalog

- **Type:** Expand / vertical architecture slice
- **Blocked by:** none
- **Spec:** [Style Catalog and Folder Discovery](../../../docs/specs/style-catalog.md)
- **ADR:** [ADR-0006](../../../docs/adr/0006-style-catalog-source-of-truth.md)

## Goal

Add the pure source of style IDs, display names, and display order while the existing renderer registry continues to drive the application unchanged.

## Scope

- Add a pure catalog under `src/shared` for the current entries: `classic` / `Classic`, `material` / `Material`, `claude` / `Claude`.
- Derive the `StyleId` union from catalog IDs; do not keep a second manually edited union.
- Keep the explicit `THEMES` renderer registry and its CSS imports for this expansion step.
- Add parity tests proving the catalog and existing renderer registry have identical IDs, labels, and order.

## Acceptance criteria

- [x] The catalog imports no React, CSS, DOM, or renderer modules.
- [x] `StyleId` accepts exactly the three existing IDs and is derived from the catalog.
- [x] IDs are unique; catalog order and labels match `THEMES` exactly.
- [x] Catalog IDs are stable persisted identities; label or order changes do not change an ID.
- [x] Existing storage and rendering behavior is unchanged.
- [x] No UI, CSS, theme token, or animation files are modified.

## Verification

- `npm test`
- `npm run typecheck`
- `npm run build`

## Evidence (2026-09-28)

- Delivered: `src/shared/styleCatalog.ts` (zero-import pure catalog + derived `StyleId`),
  `src/shared/types.ts` (re-exports `StyleId`; the hand-written union is deleted and the
  remaining edits are type-only), `tests/unit/style-catalog.test.ts` (7 tests).
- `npm run typecheck` pass. `npm test` 745 passed / 37 files (was 738 / 36 files; +7).
  `npm run build` pass (`vite v8.3.1`, 75 modules transformed).
- No runtime module imports the catalog: it is referenced only by the unit test and a
  `import type` in `src/shared/types.ts`, so the production bundle is unchanged.
- `git status` touched only those three files; no UI, CSS, token, theme, or animation file.
- Extra evidence, beyond the ticket's checklist: `npx playwright test
  tests/e2e/style-switch.spec.ts`, headless and in the background — **16 passed**.
  The first run was 14 passed / 2 failed on one test in both projects
  (`tests/e2e/style-switch.spec.ts:278`, at line 295):
  `page.evaluate: ReferenceError: expect is not defined`, because that test called `expect`
  inside a browser-context callback. Confirmed as a **pre-existing test defect** (it cannot
  pass for any application state) and fixed as a separate minimal change: the callback now
  returns the captured count bare, and the assertion lives on the Node side. A read-only
  scan of the other 22 spec files found no second occurrence of the same shape (three regex
  hits were inspected and are false positives — their `expect`s are Node-side). The 16
  passing cases include the three-style board comparison, the material/claude switching
  cases, and the tile-node reference-equality guard that previously never got to assert.

## Outcome

SC-01 signed off. `THEMES` remains the explicit renderer registry; no folder auto-loading was
introduced. SC-02 and SC-03 were not started.

## Out of scope

- Migrating storage validation or Playwright matrix discovery (SC-02).
- Changing the runtime renderer registry or auto-loading folders (SC-03).
- Adding styles or changing their visuals.
