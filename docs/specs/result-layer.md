# The Result Layer: a Scrim Over the Board

**Status:** Implemented 2026-10-01 (acceptance evidence in the Evidence section)
**Date:** 2026-10-01
**Decisions:** [ADR-0008](../adr/0008-result-layer-is-a-scrim-over-the-board.md) (new — this spec's
record of why the opaque panel was replaced); [ADR-0002](../adr/0002-style-as-folder-with-decoration-slots.md)
(slot boundary, unchanged — the result layer stays shell); [ADR-0003](../adr/0003-unlimited-undo-no-assisted-flag.md);
[ADR-0007](../adr/0007-achievements-are-earned-in-a-single-run.md) (the per-style toast precedent);
[`docs/mode-contract.md`](../mode-contract.md) §3 (state machine, unchanged)

## Problem

A run pauses three times: when it reaches the target tile, when it deadlocks, and when it settles.
At each of those moments the screen the player is looking at is replaced — an opaque panel the
colour of the page is laid over the board, and the board they spent the whole run building is
gone. The score stays visible in the header, but the position that produced it does not.

This matters most exactly where it should matter least. Reaching the target is a reward, and the
reward is hidden. Deadlocking is a decision — undo, swap, or accept — and the board is the
evidence for that decision, which is now covered. Settling is the end of a run, and the final
position is the thing worth looking at.

The README TODO asks for this in one line: the settlement screen should stop covering the whole
picture and become a translucent layer, so the board at the end is still visible. Taken literally
that line is wrong twice over, and both errors need fixing before work starts. It says the panel
"covers the whole picture", but it has never covered the viewport — it is an absolutely
positioned sibling of the board, sized to the board's box. What it does is cover the **board
completely and opaquely**. And the repository already carries a written argument against the
change, in three identical comments above the three themes' overlay rules and in three design
cards: a translucent layer lets the finished tiles show through, and tiles shown through a
finished run look playable. That argument is not wrong. It has to be answered, not overridden.

There is also a fourth pause the TODO does not mention, which the design leaves flat: the layer
carries a title, one sentence, and buttons. A player who wants to know how this run compares to
their best for this mode and style has to go and look at the statistics panel.

## Goal

Turn the settlement screen into a **result layer**: a semi-transparent scrim over the board with
an opaque card on top of it, shared by all three non-playing phases, so that the board at the
moment of the pause stays visible while everything the layer says stays exactly as legible as it
is today. The scrim is dimmed hardest where there is no decision left to make and lightest where
there is one. The card gains the numbers a player actually wants at a pause — this run's score,
the best for this mode and style, the moves made, and whether this run is a new best — and loses
nothing it already had.

The change is presentation only. No rule, no phase, no recovery path, no settlement timing, no
undo history, and no record semantics move. The old rationale is recorded as what it was, and
every place that states it is rewritten to state the new decision and point at the record of why.

## User stories

1. As a player, when a run reaches the target tile, I want to still see the board that got me
   there, so that reaching it is something I look at rather than a screen that replaced it.
2. As a player, when I am deadlocked, I want the board bright enough to judge whether one undo
   would rescue it, so that the choice is a decision rather than a guess.
3. As a player, when the run has settled, I want the final position to stay visible, so that the
   run ends on the board I actually played.
4. As a player, I want the layer over the board to read as "this board is paused", so that I never
   mistake a finished position for a live one.
5. As a player, I want the pause to look lighter when a decision is left to me than when the run
   is already over, so that the two states do not read the same.
6. As a player, I want the layer's text and buttons to stay as legible as they are today, so that
   visibility is bought without spending readability.
7. As a player, I want to see this run's score, my best for this mode and style, and how many
   moves I made, so that the summary is one glance rather than a trip to another panel.
8. As a player, I want to be told when this run is a new best, so that beating my own record is
   visible rather than inferred.
9. As a player, I want the move count to fall back when I undo, so that it keeps telling the
   truth about the path I took instead of how many keys I pressed.
10. As a player, when I switch style after a run has settled, I want the best score to keep
    describing the run I just played, so that it does not silently become another style's record.
11. As a player, I want the layer to stop taking pointer input the instant I choose to continue,
    so that I can keep playing without waiting for an animation to finish.
12. As a player, I want the layer to arrive and leave with motion rather than a hard cut, so that
    a pause reads as a transition instead of a glitch.
13. As a player who asked for less motion, I want the layer to appear and disappear without any
    movement at all, so that it does not become one more moving thing.
14. As a player, while a cheat-swap pick is in progress, I want the whole layer out of my way, so
    that I can see and pick the two tiles.
15. As a player, I want the movement keys to keep doing nothing while the layer is up, so that a
    stray keypress does not move a board that is not mine to move.
16. As a player, I want the score in the header to still be there after the pause, so that the
    numbers do not quietly move somewhere new.
17. As a player using only the keyboard, I want every control on the layer reachable, and focus to
    return to the board when the layer closes, so that I never lose the keyboard — this is the
    existing accessibility contract and it must not regress.
18. As a player on a phone, I want the layer to stay inside the board's box, so that the layout
    does not overflow and push the buttons off screen.
19. As a player, when reaching the target is also my last legal move, I want the two layers to
    hand over cleanly, so that I am not left looking at a stale one.
20. As a player, I want the three pauses — target reached, deadlocked, settled — to look like one
    family, so that a change of state does not look like a change of application.

## Architecture decisions

1. **The result layer is shell, not style.** It keeps one shared structure, one shared set of
   buttons, one shared set of copy, and one shared readout. Each style contributes tokens and CSS
   only, exactly as it does today. This is not a fourth presentation slot. ADR-0002 accepted the
   toast as a per-style slot on an explicit test — "its behaviour surface is narrow enough that
   one shared test can pin it down across all three styles" — and the result layer fails that
   test: it binds four actions to the store, walks the full keyboard path, and manages focus
   restoration. The three stylesheets already state the ownership in a comment above their
   overlay rules ("it is a shell element; only its colour rides the theme tokens"). Adding a
   slot would also raise the cost of every future style by one more required file, with ten
   styles queued behind this release.

2. **The layer is two elements: a scrim and a card.** The scrim is the translucent wash that
   covers the board; the card is the opaque surface that carries title, sentence, readouts and
   buttons. Two elements rather than one translucent container is not a stylistic preference —
   two of the three design cards forbid using `opacity` to dim text, on the ground that a
   translucent foreground is a different colour that the contrast gate cannot read back from
   computed style. Making the card a separate, fully opaque element keeps the text exactly as
   measurable as it is today, which is what makes this change affordable.

3. **The scrim has three strengths, one per non-playing phase, ordered by how much decision is
   left.** `stuck` is the brightest, because the player must read the board to choose between
   undo, swap, and acceptance. `won` is between, because the board is a reward to look at and the
   player is about to return to it. `ended` is the darkest, because nothing is left to decide.
   Same structure, same card, three values per style.

4. **Whether a scrim darkens or veils is decided per style, in the design process.** Every
   baseline surface is a light paper colour, so a translucent layer has two opposite directions:
   a wash of the style's own ink darkens the board, a wash of the page colour veils it. Both are
   available to all three styles and neither is mandated here. The one thing each style must
   answer, in its own words, is whether its scrim makes the board recede. A veil that leaves the
   tiles as bright as before has not answered the original argument; it has only moved it.

5. **The card carries four readouts.** This run's score, the best score for this mode and style,
   the number of moves made, and a marker when this run is a new best. The existing title,
   sentence and buttons are unchanged. The header's own score stays where it is, so the score
   appears twice — accepted, because the card is a summary and the header is the live value.

6. **The best score describes the run that was played, not the style the player happened to
   leave selected.** Records are keyed by mode × style and written once, at settlement, and the
   record belongs to the style active at that moment. Style switching has no phase guard, so
   after settlement a player can still change style. Therefore the run remembers the style it
   settled into, and the readout reads that style's record; before settlement the readout reads
   the current style, because the run has not been attributed yet. This is one in-memory field
   with no persistence: a settled run is not restorable — settling clears the session and a
   restored session whose run has settled is discarded on load — so there is nothing for it to
   survive across.

7. **A new best is a pure comparison, taken at the write point.** Whether this run beat the
   record is decided by comparing this run's score against the record that existed before the
   settlement. That value is available where the record is written, and must be captured there
   rather than reconstructed afterwards, because the write is idempotent by construction and
   leaves no "before" behind.

8. **The move count is reported as it stands.** It counts the moves on the path the player is
   currently on, so it falls back when a move is undone, and it does not count a cheat swap. The
   label is 「步数」 and no other word. This is the same accounting the merge achievement already
   uses, and it is the honest reading of "how far I got" rather than "how many keys I pressed".

9. **Both entry and exit animate, and the exit releases the pointer immediately.** The layer
   animates in on arrival and out on dismissal, on the shared motion posture the project already
   settled on for tiles. Because the exit starts the moment the phase has already changed back,
   the scrim stops taking pointer input at the first frame of the exit — otherwise a player who
   continues and immediately swipes would find the board unresponsive for the length of a fade,
   which is the exact confusion the old opaque panel was written to avoid. Movement keys are
   already released with the phase; the pointer is released with it too.

10. **When continuing turns a win straight into a deadlock, the two layers hand over in
    sequence.** Reaching the target can be the last legal move, so continuing can lead directly
    from the milestone to the deadlock layer. The win layer plays its exit, then the deadlock
    layer plays its entry. Two animations in a row is the natural result of a delayed unmount and
    reads correctly: the milestone withdraws, the deadlock arrives.

11. **The cheat-swap special case stays.** While a pick is in progress the layer is hidden
    entirely, because it covers the board and would block picking. The scrim intercepts pointer
    input exactly as the opaque panel did, so this branch is not made redundant by
    translucency — pointer interception is a binary, not a matter of degree. The branch and the
    tests that pin it are untouched.

12. **The old rationale is recorded rather than quietly overwritten.** The three comments and the
    three design-card passages that argue for an opaque panel are rewritten in place to state the
    new decision and to point at the ADR that explains the reversal. The reason is the one this
    repository has already been bitten by: a written argument left standing gets used later to
    "fix" the new implementation back. The two browser contracts that assert the layer's geometry
    and its z-position are left exactly as they are, because they still describe the new layer —
    it still sits above the board, still matches the board's box, still does not push the layout.

## Acceptance criteria

- [x] All three non-playing phases — milestone, deadlock, settled — render the same result-layer
      structure: a translucent scrim over the board plus an opaque card on top of it.
- [x] The board stays in the document under the layer, with every cell still present and its
      final values intact.
- [x] The scrim's computed background is translucent in all three phases, and its strength
      differs across the three phases in the order deadlock (lightest) → milestone → settled
      (darkest).
- [x] The card's background is opaque, and its text and buttons keep the contrast ratios they
      have today — no contrast declaration is loosened to accommodate the scrim.
- [x] The card shows this run's score, the best score for the current mode and style, the move
      count, and a marker when this run is a new best; the existing title, sentence and buttons
      are unchanged.
- [x] The best score readout follows the style the run settled into after settlement, and the
      style the player is using before settlement.
- [x] The move count falls back by one when a move is undone, and does not change on a cheat swap.
- [x] The layer animates in on arrival and out on dismissal; under a reduced-motion preference it
      appears and disappears with no movement at all.
- [x] From the first frame of the exit the scrim takes no pointer input, and the board responds
      to both pointer and keyboard immediately.
- [x] Continuing from the milestone while deadlocked shows the deadlock layer after the milestone
      layer has finished leaving; at no point is a dismissed layer still described as current.
- [x] While a cheat-swap pick is in progress the layer is hidden entirely and the two tiles can
      be picked; the layer returns when the pick completes or is cancelled.
- [x] The layer's position, its box, and its z-order relative to the toast and the board are
      unchanged; nothing in the layout overflows on a phone-sized viewport.
- [x] The full existing keyboard walkthrough — reaching, undoing, swapping, settling, starting a
      new run, and the announcement of each state change — still passes with no change.
- [x] No rule, phase transition, record write, undo entry, or settlement timing differs from
      `docs/mode-contract.md` §3; the two browser contracts that assert the layer's geometry pass
      unchanged.
- [x] Every place that states the old rationale — the three stylesheet comments, the three design
      cards, the README TODO item, and the state-contract wording — reads as the new decision and
      points at the ADR.

## Test strategy

**Seams are existing ones wherever they exist; none of them is new.**

- **The rules layer is untouched.** No test in this group touches `src/game/`. The phase machine,
  the settlement timing and the record semantics are already covered by `tests/unit/run-endings.test.ts`
  and `tests/unit/records-settle.test.ts`, and those tests are expected to pass without edit —
  if any of them needs changing, the change has escaped this spec's scope.
- **Pure judgement for the new numbers.** The two new pure facts — whether this run is a new best,
  and which record this run belongs to — are node-testable functions beside the existing pure
  half of the records module, which already owns settlement attribution and idempotent maximum
  semantics. Prior art: the records unit tests that drive settlement and best-score behaviour
  without a browser.
- **Host state for the attribution and the delayed unmount.** The store's coordination of the
  settlement style — set at settlement, read by the layer, not persisted — follows the existing
  fake-backend host-test pattern used for the achievement host and for style switching, including
  the full list of fields a style switch may and may not touch.
- **One shared browser contract, run once per style.** The layer's cross-style invariants live in
  a single spec exercised three times, mirroring the toast contract spec: the scrim is
  translucent and differs across the three phases, the card is opaque, the board is still present
  underneath, the layer still matches the board's box and sits at the same z-index, the exit
  releases pointer input, the four readouts are present and correct, the best-score readout
  follows settlement attribution, and the layer is hidden entirely during a cheat-swap pick.
- **Per-style visual design and the design cards.** The scrim values and each style's direction
  are decided in the design process and land in the three design cards, the way the toast's
  appearance did. A style's answer to "does my scrim make the board recede" belongs in its card,
  in words, not only in a number.
- **Human review and a real playthrough.** Computed-style checks prove the declarations, not the
  experience. Each of the three styles needs the layer looked at in a real run on desktop and
  phone, at all three phases, before this is called done.

## Out of scope

- Any change to the phase machine, the recovery paths, or the settlement timing. Reaching the
  target and continuing, undoing from a deadlock, swapping from a deadlock, and settling exactly
  once are existing behaviour and stay exactly as they are.
- Any change to the rules, to records, or to achievements.
- A fourth presentation slot. Styles contribute tokens and CSS only.
- The start screen, where there is no board yet and nothing to see through.
- The other README TODO groups — the settings panel, the further style research, and the
  feedback on an invalid move.
- Restyling the header, the statistics panel, or the style picker.
- Any new sound, and any new record type.

## To sync when the implementation lands

`GLOSSARY.md` gains the result-layer entry (and the run phase it belongs to) with the same
`_Avoid_` discipline as its neighbours; `docs/mode-contract.md` §3 rewrites its panel wording to
the new term without touching a single invariant; the README TODO item is corrected — the panel
never covered the viewport, it covered the board — and its second box is marked as existing
behaviour; `docs/SPEC.md` gets a back-reference from the frozen endgame rule with no change to
any frozen value; ADR-0008 is written; the three design cards, the three stylesheet comments and
the geometry contract's explanatory comment are rewritten in place; the ticket set is published.

## Evidence

2026-10-01. Tickets T25 (terminology and the decision record), T26 (the two elements, the three
scrim strengths and the four readouts) and T27 (entry/exit motion and the full gates) are all
implemented locally and closed; the per-ticket numbers are in their Evidence sections. Every
acceptance criterion above was checked against a real run and a real test, not against the design:

- `npm run typecheck` 0 errors; `npm test` 774 passed / 42 files; `npm run build` 80 modules;
  `npm run check:contrast` 3 styles / **68 pairs**, all passing — the card keeps today's
  surface, so not one text pair moved. (65 pairs through T26; the control session added one
  per style for the readout label measured *on the card*, which no probe had ever measured.)
- Full Playwright suite, headless and backgrounded: **502 passed / 14 skipped / 0 failed**
  (T26 closed at 466; T27 added 24; the control session added a 6-case regression spec and a
  6-case contrast scene for the readout's card surface). The two browser geometry contracts
  pass with their **assertions unchanged**. `game.spec.ts --repeat-each=4` 40/40.
- The one thing that is *not* evidence: **nobody has looked at it**. All visual proof is
  computed style and animation events read back from a headless browser. The 18 combinations
  (3 styles × 3 phases × desktop / phone) and a real playthrough are still owed by the project
  owner on their own machine.

## Existing SPEC alignment before implementation

Nothing in `docs/SPEC.md` §5's frozen endgame rule changes: settlement still executes exactly
once, the record still goes to the style active at settlement, a deadlock still offers recovery
before it settles, and Time Attack still settles immediately with no undo afterwards. The frozen
values are untouched, so no new ruling is needed on that side. §3.4's keyboard contract is
unchanged. §3.2's per-style gate is what the three-style visual acceptance is measured against.
The one premise this spec corrects is the README TODO's own: the layer does not occlude the whole
picture, it occludes the board, and what it occludes it does opaquely.
