# Style Catalog and Folder Discovery

**Status:** Agreed architecture; implementation pending  
**Date:** 2026-09-28  
**Decision:** [ADR-0006](../adr/0006-style-catalog-source-of-truth.md)

## Problem

Style identity is currently spread across the `StyleId` union, per-style config exports, the renderer registry, storage validators, and a source-parsing helper in the browser matrix. The renderer registry imports each style config, which imports CSS. Persistence validation and tests therefore depend on a registry that carries rendering dependencies. This duplication will become more costly as the README TODO adds more styles.

## Goal

Make style identity and availability come from one pure catalog, while keeping each style's visual implementation inside its existing folder. Catalog consumers must not import CSS or React decoration types to validate a stored style ID.

## User stories

1. As a learner, I want one catalog to define each available style's stable ID, display name, and display order, so that selection, persistence, and tests agree.
2. As a player, I want a saved style ID to resolve to exactly one available style, so that restored settings and runs do not silently select a different style.
3. As a style author, I want a catalog entry to load the matching style folder automatically, so that I do not maintain a second renderer registration list.
4. As a maintainer, I want unlisted style folders to remain dormant and incomplete catalog entries to fail acceptance, so that drafts are not exposed and missing implementations are visible.
5. As a test maintainer, I want the browser matrix to derive its expected styles from the same catalog, so that it stays complete as styles are added.

## Architecture decisions

1. A pure catalog in `src/shared` is the single source for style IDs, display names, and display order. Catalog order defines display order; no separate order value is maintained. The `StyleId` type is derived from the catalog IDs.
2. The catalog is a whitelist. The renderer automatically loads the visual implementation from the matching `src/renderer/styles/themes/<id>/` folder. A folder absent from the catalog remains dormant; no manual renderer-registry entry is required.
3. Each available style keeps its `DESIGN.md`, `tokens.css`, `styles.css`, `config.ts`, `contrast.json`, and `toast.tsx` in its folder. CSS, the two decoration slots, and the presentation slot (`toast`) remain renderer-owned. `StyleDefinition`, `OverlaySlot`, and `ToastSlot` move to the renderer style module; they do not enter the pure catalog.
4. Settings, session, and records validation use the catalog's known IDs without importing the render registry. The browser style picker and mode/style matrix derive expected IDs, labels, and order from the catalog, then verify rendered choices against it.
5. A catalog entry without a matching folder or required config is a build/acceptance failure. Duplicate catalog IDs are rejected. Unlisted folders are not loaded.
6. Style IDs are persistent identifiers. Renaming a display name or changing display order does not change an ID. Retiring or remapping an ID requires an explicit storage migration; direct deletion must not silently invalidate existing settings, sessions, or records.
7. The catalog and renderer loader remain outside `src/game`. The game rule core stays DOM-free. The project keeps its single Zustand store without slices or middleware.

## Acceptance criteria

- [ ] The pure catalog can be imported by TypeScript code and tests without evaluating CSS or React rendering modules.
- [ ] The `StyleId` type and runtime known-ID validation derive from the catalog; no second manually maintained ID union remains.
- [ ] Renderer discovery loads exactly the folders named by the catalog. Unlisted folders stay dormant.
- [ ] A catalog entry with a missing folder or required config fails build or acceptance; duplicate catalog IDs fail acceptance.
- [ ] `session` and `records` decoders accept catalog IDs and reject unknown IDs using the existing strict rejection behavior.
- [ ] The style picker follows catalog order, and the browser matrix checks that rendered choices match catalog IDs and labels.
- [ ] The matrix is generated from `MODES × catalog`, covering all baseline combinations and every future available style on desktop and mobile-sized viewports.
- [ ] Existing style switching, persistence, and the 18-combination baseline remain valid.
- [ ] No visual, interaction, CSS token, or animation behavior changes. The fixed Board and its two decoration slots remain as defined by ADR-0002.

## Test strategy

- Unit-test catalog ID uniqueness, derived `StyleId` coverage, labels, and order.
- Test session/settings/records decoders against every catalog ID and an unknown ID.
- Test catalog-to-folder completeness and that unlisted folders are not made available.
- Keep CSS token, contrast, and style-folder checks driven by the catalog.
- In Playwright, compare the rendered style picker and full mode × style matrix against catalog metadata.

## Out of scope

- Adding or redesigning any style.
- Changing existing UI structure, interactions, CSS, or animation timing.
- Implementing the README TODO settings or achievement behavior.
- Changing mode rules, `GameState`, records semantics, or the number of Zustand stores.
- Removing a persisted style ID without a separately specified migration.
- Publishing a GitHub issue or applying a remote triage label in this phase.

## Existing SPEC alignment before implementation

The local root SPEC's user story 28, §3.2, and §4 were amended on 2026-09-28 to reflect the catalog whitelist and folder loader. The published GitHub parent issue #1 has not been synchronized. No implementation code is authorized by this document alone.
