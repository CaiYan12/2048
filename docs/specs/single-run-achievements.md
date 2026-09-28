# Achievements Earned in a Single Run, and the Styled Toast

**Status:** Agreed design; **implemented 2026-09-28** (acceptance evidence in the Evidence section)
**Date:** 2026-09-28
**Decisions:** [ADR-0007](../adr/0007-achievements-are-earned-in-a-single-run.md); [ADR-0002](../adr/0002-style-as-folder-with-decoration-slots.md) (amended 2026-09-28); [ADR-0003](../adr/0003-unlimited-undo-no-assisted-flag.md)

## Problem

Achievements keep an accumulated progress record — highest tile ever reached, most merges in one
run, best Time Attack score, the set of modes won, the length of the daily streak — inside the
settlement statistics, and six of the eight conditions read it. That record makes the achievement
list a second, silent game state: it needs storage, a restore path, a decoder, and a migration
story, and it gives the rules layer a reason to know about persistence. It also makes the only
answer to "have I already got this?" come from storage, so a player cannot tell from the board in
front of them what they have done.

Two further problems sit on top of that one. The README TODO asks for achievements to stop being
persisted and for the unlock to stop rewriting page text; taken literally against the current
conditions, that direction would leave six of eight achievements permanently unreachable. And the
repository has no toast infrastructure at all — the acknowledgement is a notice that stays on the
page until the player dismisses it.

## Goal

Make every achievement condition provable from the run being played, so that nothing about
achievements is written to storage and the achievement list stops being a second game state. Turn
the acknowledgement into a short-lived, per-style toast that the current style renders, while the
rules-facing half — what is unlocked right now, and when that changed — stays in one host that
needs no browser to test.

This document is the README TODO's **achievement-mechanism group**, plus the one thing that group
needs to exist: a place for a styled toast to live.

## User stories

1. As a player, I want an achievement to unlock the moment I satisfy its condition, so that the
   acknowledgement lands while the move that earned it is still on screen.
2. As a player, I want the acknowledgement to name what I earned, so that I do not have to guess
   which milestone it was.
3. As a player, I want the acknowledgement to leave on its own, so that it never becomes one more
   thing I have to dismiss.
4. As a player, I want it to wait while I am reading it — pointer over it, or focus inside it — so
   that I am not rushed by a timer I cannot see.
5. As a player, I want several unlocks to be readable without fighting for the same spot, so that
   each one is legible on its own.
6. As a player, I want the oldest to be dropped when they pile up, so that the newest — the one I
   just earned — is always the one I can see.
7. As a player, I want the acknowledgement to look like the style I am playing in, so that it
   belongs to the board rather than to the browser.
8. As a player, I want the unlock list to reflect what is true now, so that undoing the move that
   satisfied a condition does not leave me congratulated for something no longer on my board.
9. As a player, I want earning it again after an undo to be acknowledged again, so that the moment
   still lands when it genuinely happens a second time.
10. As a player, I want a refresh not to replay congratulations for things I earned before the
    refresh, so that restoring a long run does not turn into a fanfare.
11. As a player, I want a refresh to keep what I earned in a restored run, so that reopening the
    tab does not silently take an unlock away.
12. As a player, I want the acknowledgement never to cover the board or the four direction
    buttons, so that I can keep playing while it is on screen.
13. As a player, I want it never to take my keyboard focus, so that my arrow keys keep going to
    the board.
14. As a player who asked for reduced motion, I want the acknowledgement to respect that, so that
    a congratulations cannot make me motion-sick.
15. As a player, I want the achievement list to tell me what I have not earned yet, so that I have
    something to aim at.
16. As a player, I want the statistics panel to stop claiming what is unlocked, so that everything
    it says is something it can actually know.
17. As a player using a screen reader, I want each acknowledgement announced once, so that I do
    not miss an unlock I cannot see.
18. As a player who reads slowly, I want the announcement to remain available in the accessibility
    tree while it is on screen, rather than being over after a single announcement.
19. As a Time Attack player, I want the big-score achievement to be about this run, so that a good
    run today counts today.
20. As a style author, I want the acknowledgement's structure, appearance and dismissal to be mine
    to write, so that my style's voice reaches the player at their best moment.
21. As a style author, I want the host to tell me what to render and when, so that I do not
    reimplement unlock detection or the undo rules.
22. As a style author, I want a missing acknowledgement implementation to fail loudly, so that I
    find out at build time rather than from a player.
23. As a style author, I want one shared contract to satisfy, so that "my style renders its own
    toast" does not turn into "my style may do anything".
24. As a maintainer, I want every condition provable from the current run, so that the achievement
    list stops being a second game state that must be stored and migrated.
25. As a maintainer, I want the unlocked set derived from run state rather than accumulated, so
    that undo can revoke an unlock without a reconciliation table.
26. As a maintainer, I want the count that cannot be read off the state to roll back by the
    per-step difference, so that revocation stays O(1) per step and the stored session shape is
    untouched.
27. As a maintainer, I want the storage decoder to ignore unknown achievement ids and unknown
    fields, so that retiring an achievement can never cost a player their statistics.
28. As a maintainer, I want no database version bump and no migration script, so that "stop
    persisting" is the whole of the migration.
29. As a maintainer, I want retirement to leave no placeholder rows, so that the interface never
    promises something that cannot happen.
30. As a maintainer, I want the previous notice component deleted rather than left beside the new
    one, so that two competing presentations cannot coexist.
31. As a maintainer, I want one contract test that runs against all three styles, so that three
    implementations cannot drift apart.
32. As a maintainer, I want the host's state to live where it can be tested without a browser, so
    that transitions, revocation and the stack cap are not verified only through Playwright.
33. As a maintainer, I want the factual documents that describe today's style folders to be
    updated when the new file exists, not before, so that no document claims something the code
    does not do.

## Architecture decisions

1. **Conditions are provable from the current run.** The rules-layer achievement module answers
   one question: given this run's facts, which achievements are satisfied? It takes no accumulated
   progress. Thresholds are unchanged (4096, 8192, 20000 points, 200 merges, 5 switches); the
   wording of each condition becomes "this run".
2. **Six achievements remain.** `mode-collector` (win in all six modes) and `daily-stand` (settle
   one Daily on seven consecutive UTC dates) cannot be satisfied by a single run and are retired
   outright: no registry rows, no interface placeholders, following the precedent already set for
   the suspended achievements.
3. **The unlocked set is derived, never accumulated.** Every derivation of the same run state
   produces the same set. Consequently undo revokes: the set is recomputed after the run state
   moves, and an achievement whose condition no longer holds leaves the set.
4. **One deliberate exception.** `style-traveller` counts switches with a counter that does not
   roll back with undo (ADR-0003's settlement of that counter). Once unlocked it stays unlocked for
   the remainder of the run. Making that counter undoable would let a player farm acknowledgements
   by undoing and switching again. The asymmetry is recorded in ADR-0007 rather than fixed.
5. **Merges performed this run are counted incrementally** and rolled back by the per-step
   difference when a step is undone. This keeps the cost O(1) per step and leaves the game state
   and the stored session shape untouched; a shape change would drag the decoder's tolerance rules
   along with it.
6. **The host owns what and when; the style owns how.** A single host holds the currently unlocked
   set, detects the locked-to-unlocked transitions, merges the achievements of one transition into
   a single acknowledgement, and maintains a stack capped at three (dropping the oldest). The host
   lives in the store, so its state machine is testable without rendering.
7. **The toast is a presentation slot, not a decoration slot.** ADR-0002 now names two kinds of
   slot: decoration slots (`boardOverlay`, `tileOverlay`) which may only add skin to fixed DOM, and
   the presentation slot (`toast`) which owns structure and behaviour. The host hands the slot a
   batch of unlocked achievements plus a "this one is finished" callback; the slot decides its
   markup, its appearance and its dismissal, and calls back when it is gone so the host can shrink
   the stack.
8. **Every style supplies its own acknowledgement**, in its own file inside its folder, so a style
   folder goes from five required pieces to six. A style that does not supply it fails loudly at
   registry resolution, exactly as a missing decoration slot does; there is no silent fallback to
   another style's toast.
9. **The shared contract for every style's toast** is: about five seconds before it leaves on its
   own; leaving paused while the pointer is over it or focus is inside it; a polite status role so
   each acknowledgement is announced once; at most three on screen; never taking keyboard focus;
   honouring the reduced-motion preference; and not covering the board or the direction buttons.
   Exactly where it sits and exactly what it looks like are design decisions for the UI design
   process, not for this document.
10. **Nothing about achievements is persisted.** The settlement statistics record loses the
    achievement field. Its decoder becomes tolerant on read — unknown achievement ids and unknown
    fields are dropped, the rest of the record survives — so retiring an achievement id can no
    longer invalidate a player's statistics. No database version bump and no migration script: the
    record is rewritten whole at the next settlement, so stale bytes disappear by themselves.
11. **Achievement ids stop being persisted identities.** Retiring one no longer needs a storage
    migration; ids become interface and test identities only. This is the one place where the style
    ids' rule — retirement requires a migration — deliberately does not apply.
12. **Hydration establishes the baseline silently.** When a run is restored from storage, the
    unlocked set is derived from the restored run without emitting acknowledgements. Only changes
    that happen while the player is playing produce acknowledgements. (This is what makes story 10
    and story 11 hold at the same time.)
13. **The previous notice component is deleted**, not kept beside the new one, and the statistics
    panel lists achievements as a static list — every achievement with its condition — without
    claiming anything about being unlocked.
14. **No achievement state enters the rules core.** The achievement module stays DOM-free and
    storage-free; the store owns the host state; the styles own rendering.

## Acceptance criteria

- [x] Every registered achievement condition can be satisfied, and evaluated, using only the run
      being played; no code path reads accumulated progress to decide an unlock.
- [x] Six achievements are registered: the first win, 4096, 8192, the Time Attack score milestone,
      the merge milestone, and the style traveller. The two retired achievements have no registry
      row and no placeholder anywhere in the interface.
- [x] Undoing the move that satisfied a condition revokes that unlock; satisfying it again
      acknowledges it again; `style-traveller` is the documented exception and stays unlocked.
- [x] One transition that satisfies several achievements produces one acknowledgement, naming them
      together.
- [x] At most three acknowledgements are on screen; a fourth drops the oldest.
- [x] Each style's acknowledgement is rendered by that style, and a style folder missing it fails
      registry resolution loudly.
- [x] The shared contract holds for all three styles: it leaves on its own after about five
      seconds, pauses while hovered or focused, carries a polite status role, never takes focus,
      honours reduced motion, and covers neither the board nor the direction buttons.
- [x] The settlement statistics record no longer carries achievement state, and a record written by
      the previous version — including one naming an achievement id that no longer exists — still
      yields its statistics rather than being rejected.
- [x] No database version bump and no migration script are required for the change.
- [x] Nothing about achievements reaches storage: no bucket write, and no achievement field in any
      persisted shape.
- [x] The statistics panel never claims that an achievement is unlocked.
- [x] The previous notice component and its DOM hook are gone, and nothing references them.
- [x] A run restored from storage comes back with its achievements unlocked and without replaying
      acknowledgements.
- [x] Mode rules, scoring, spawning, undo history depth, records semantics, and the number of
      stores are unchanged.

## Test strategy

Three existing seams, no new ones. The repository already tests in two layers — pure logic in unit
tests, DOM behaviour in Playwright — and this feature is checked at the same three points.

**Seam 1 — the pure decision layer** (existing seam: the achievement unit test file drives the
rules-layer achievement module directly; the storage decoders sit in the same layer and in the
existing records unit test file).

- Every surviving condition at, just below, and just above its threshold.
- Derivation: the same run facts always produce the same unlocked set, and no accumulated input
  can change it.
- Decoder tolerance: an unknown achievement id and an unknown field are dropped while the rest of
  the record survives; a malformed record is still rejected rather than half-believed.

**Seam 2 — the store** (existing seam: the store driven with a fake storage backend and a fake
audio module, the arrangement the audio-store and session-persistence tests already use).

- A locked-to-unlocked transition acknowledges once; staying unlocked does not acknowledge again.
- One transition satisfying several achievements acknowledges once, naming all of them.
- Undo revokes; re-satisfying acknowledges again; the style-traveller exception behaves as
  documented.
- The merges counter rolls back with undo, step by step.
- The stack caps at three and drops the oldest.
- No achievement write reaches the fake storage backend.
- Hydration of a restored run establishes the baseline without acknowledging.
- Test the observable state the host exposes, not its internal bookkeeping.

**Seam 3 — the browser** (existing seam: Playwright against the built preview, driving the real
DOM the achievement spec already drives).

- The shared contract, run once per style, so three implementations cannot drift: leave timing,
  pause on hover and on focus, the status role, the three-item cap, focus never stolen.
- A style folder that does not supply its acknowledgement fails loudly rather than rendering
  another style's.
- A statistics record seeded in the previous version's shape, naming a retired achievement id,
  still yields its statistics in the panel.

**Prior art.** The achievement unit tests and the records unit tests for seam 1; the audio-store
and session-persistence suites for the store-with-fakes arrangement in seam 2; the style-switch
suite's three-style loop, the theme-contract suite, and the achievement suite for seam 3.

A good test here observes what a player or another module can see — the acknowledgement that
appeared, the set the host exposes, the statistics that survived — and never asserts a private
field name or an internal call order.

## Out of scope

- Implementing any of this. This document is the agreed design; implementation gets its own
  tickets.
- The toast's visual design and its exact position: constraints only here, coordinates and
  appearance in the UI design process.
- Showing what a run unlocked, during the run or after it, beyond the acknowledgement itself;
  that presentation belongs to the settlement-interface work in the README TODO.
- Redesigning the statistics panel beyond removing its claim about unlocks, and any other change to
  records or statistics semantics.
- The other README TODO groups (settings panel, settlement panel, further styles).
- The sound side: the blocked-move sound event already shipped separately.
- Publishing a GitHub issue or applying a remote triage label in this phase.

## To sync when the implementation lands

The new required file makes a style folder six pieces instead of five. That fact is stated in nine
places — the root SPEC, this directory's style-catalog spec, the repository agent notes, ADR-0002,
ADR-0006, the primal setup plan, the execution plan, the catalog ticket, and the open-items list —
plus one loader assertion that enumerates the required pieces. All of them, and the achievement
count (eight becomes six, two suspended becomes four), are updated when the file exists, not
before.

Specs that will move with this change: the achievement suite, the records suite, the achievement
end-to-end spec, and the statistics assertions in the records end-to-end spec.

## Evidence (2026-09-28, implementation landed)

Every acceptance criterion above was checked against a real run, not against the design.

- **Where the code lives.** `src/game/achievements.ts` (the derived decision, no accumulated
  input), `src/renderer/stores/useGameStore.ts` (the host: transitions, revocation, the three-item
  stack, the silent hydration baseline), `src/renderer/styles/themes/<id>/toast.tsx` plus the
  `[data-style]`-scoped rules in each `styles.css` (the presentation slot), and
  `src/renderer/stores/records.ts` (the tolerant decoder).
- **Gates.** `npm run typecheck` clean; `npm test` **739 passed / 40 files**;
  `npm run build` succeeded (78 modules); `npm run check:contrast` 3 styles / 65 pairs passing;
  full headless Playwright **432 passed / 14 skipped / 0 failed** (2.4m). The same suite measured
  377 passed / 1 failed (a known flaky case) / 14 skipped before this work started, so the change
  removed that flake rather than adding any.
- **The toast contract, three times over.** `tests/e2e/toast-contract.spec.ts` runs nine
  assertions per style against the built preview: it appears on the unlocking move (not at
  settlement), its background is that style's own (three distinct measured values), it leaves on
  its own after about five seconds, hovering pauses it, focusing it pauses it, focus is never
  stolen from the board, four transitions leave three on screen with the oldest dropped, the stack
  never reaches the board or the direction pad, the container is `pointer-events: none` with the
  cards `auto`, and under `prefers-reduced-motion` it still appears with a zero transition duration.
  Measured: **54 passed** (3 styles × 9 × desktop/mobile).
- **Storage.** `DB_VERSION` is still 2 and there is no migration script. A record written in the
  previous shape — `achievements` block included, naming the retired `mode-collector` and
  `daily-stand` — still yields its three statistics in the panel (unit: `records.test.ts`,
  `records-settle.test.ts`; browser: `records.spec.ts`). Garbage shapes are still rejected.
- **One deviation worth recording.** Ticket 02's acceptance line says a previous-version record
  still shows "its four statistics". Landed, the panel shows **three**: the fourth cell was the
  achievement-unlock count, which criterion 11 requires removing. The record itself is still read
  whole (three counters plus the idempotency key).
- **Two things this spec's Seam 3 asked for that a browser cannot observe**, recorded rather than
  quietly dropped. (1) "A style folder that does not supply its acknowledgement fails loudly" is a
  build-time property: without `toast.tsx` the bundle is never produced, so no page can be loaded
  to assert it. It is covered where the loud failure happens — the loader unit test
  (`resolveThemes` throws) — and the browser half of the same intent ("rather than rendering
  another style's") is covered by asserting each style's own measured background. (2) The
  pause-on-hover and pause-on-focus clauses are each asserted; the spec's "or" is also covered by
  the focus case, which hovers, moves the pointer away, and asserts the toast still stays.
- **Review.** The change was reviewed along two axes (Standards against the repo's documented
  conventions plus the Fowler smell baseline; Spec against this document). Findings and their
  dispositions are recorded in `.scratch/achievements-single-run/issues/06-docs-sync-and-full-gates.md`.
  One real defect came out of it — hover and focus were carried by a single boolean, so either
  event cleared the other, contradicting "pointer over it, **or** focus inside it" — and it is
  fixed, with the focus case extended to cover the interaction.

## Existing SPEC alignment before implementation

Both items recorded here before implementation have since been synchronised: `docs/SPEC.md` §3.2
now names `toast.tsx` and the presentation slot alongside the two decoration slots, and the style
folder's required pieces read as six in every document that enumerates them (see ADR-0002's
amended Consequences for the list, which also records that ADR-0006 never enumerated them). The
published parent issue is still out of sync; publishing it is outside this phase (and outside the
authorisation given to the implementing session).
