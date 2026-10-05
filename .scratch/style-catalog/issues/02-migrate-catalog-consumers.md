# SC-02 · Migrate validation and matrix consumers

- **Type:** Migrate / vertical architecture slice
- **Blocked by:** SC-01
- **Spec:** [Style Catalog and Folder Discovery](../../../docs/specs/style-catalog.md)
- **ADR:** [ADR-0006](../../../docs/adr/0006-style-catalog-source-of-truth.md)

## Goal

Use the pure catalog wherever code needs to know whether a persisted or expected style ID is valid, while the existing explicit renderer registry remains in place.

## Scope

- Replace `THEMES` imports used only for known-style validation in `session.ts` and `records.ts` with catalog membership.
- Replace source-regex theme discovery in `tests/e2e/task-23-matrix.spec.ts` with catalog data.
- Retain a browser assertion that the rendered picker has exactly the catalog IDs, labels, and order.
- Preserve the current strict decoder behavior for unknown IDs.

## Acceptance criteria

- [x] Settings, session, and records decoders accept every catalog ID and reject an unknown ID.
- [x] Storage-validation modules no longer import the renderer registry or style CSS for ID checks.
- [x] The browser matrix derives all expected styles from the catalog; it no longer parses `themes/index.ts` or style config source with regular expressions.
- [x] The rendered style picker still matches the catalog exactly.
- [x] All existing style switching and persistence behavior remains unchanged.
- [x] No UI, CSS, theme token, or animation files are modified.

## Verification

- `npm test`
- `npm run typecheck`
- `npm run build`
- `npm run test:e2e -- tests/e2e/task-23-matrix.spec.ts`

## Evidence (2026-09-28)

- Delivered: `src/renderer/stores/session.ts` (`isKnownStyle` asks `STYLE_CATALOG`),
  `src/renderer/stores/records.ts` (`parseRecordKey` asks `STYLE_CATALOG`),
  `tests/e2e/task-23-matrix.spec.ts` (regex source parsing deleted; the local list is now
  `STYLE_CATALOG`, renamed `THEMES`/`ThemeInfo` → `STYLES`/`StyleInfo` per `GLOSSARY.md`
  vocabulary), `tests/unit/style-catalog-consumers.test.ts` (6 tests).
- `npm run typecheck` pass. `npm test` 751 passed / 38 files (was 745 / 37). `npm run build`
  pass (76 modules, +1: the catalog is now genuinely in the runtime graph).
- `npm run test:e2e -- tests/e2e/task-23-matrix.spec.ts` → **62 passed, 1 skipped, 13 failed**.
  The SC-02-relevant guard (`目录与界面一致`, ids + labels + order read back from the DOM) is
  in the passing set.
- **The 13 failures are pre-existing.** Verified by stashing this ticket's three files and
  re-running the identical command on the baseline: **the same 13 tests failed, in the same
  two projects, byte-identical in name**; the only textual difference was a 21-line shift in
  the reported line numbers, exactly the diff this ticket's edit produced. Their causes are
  app-vs-spec content drift unrelated to style identity, e.g. `data-bucket` for the
  Fibonacci target (expected 11, app gives 12), missing 4096 tile in Big Board, a Classic
  tile-shadow expectation, and a Claude page colour off by one channel step
  (`rgb(240,238,226)` expected vs `rgb(240,238,230)` rendered).
- Extra regression batch (`session` / `records` / `style-switch` / `style-traveller`):
  12 failed / 38 passed — also 12 failed / 38 passed on the baseline. Its systemic cause is
  now root-caused: **stale specs**, not the catalog. `src/renderer/stores/sessionStore.ts:48`
  opens IndexedDB at `DB_VERSION = 2` (T17 added the `records` / `stats` buckets) while
  `tests/e2e/session.spec.ts:219,321,354` and `tests/e2e/daily.spec.ts:134` still call
  `indexedDB.open('2048', 1)`, so they die with
  `VersionError: The requested version (1) is less than the existing version (2)`.
- One test differed between the two batch runs (`records.spec.ts:207` desktop passed on the
  baseline, failed on this ticket). Isolated `--repeat-each=3` runs settle it as flakiness in
  both directions: `records.spec.ts:207` passes 3/3 **with** this change, and
  `style-traveller.spec.ts:153` (desktop) fails 3/3 with this change and 2/3 on the baseline,
  with the same assertion (achievement notice text). Neither is caused by this ticket.

## Outcome

SC-02 signed off for its own scope. `THEMES` remains the explicit renderer registry (SC-03 is
not started); nothing was done about the pre-existing e2e drift recorded above.

## Out of scope

- Removing the explicit renderer registry or loading folders automatically (SC-03).
- Changing unknown-ID migration policy or retiring any style ID.
- Adding styles or changing visual output.
