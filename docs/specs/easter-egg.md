# 一念神魔: A Cheat Code That Asks Back

**Status:** Implemented 2026-10-01 (acceptance evidence in the Evidence section)
**Date:** 2026-10-01
**Decisions:** [ADR-0009](../adr/0009-shenmo-is-shell-not-a-fourth-slot.md) (new — why the easter
egg is shell, not a slot, and why the code is passive); [ADR-0008](../adr/0008-result-layer-is-a-scrim-over-the-board.md)
(the shell-over-slot precedent, and the card's extra line); [ADR-0002](../adr/0002-style-as-folder-with-decoration-slots.md)
(slot boundary, unchanged); [ADR-0007](../adr/0007-achievements-are-earned-in-a-single-run.md)
(the four new achievements are single-run, as always); [ADR-0001](../adr/0001-pure-core-with-injectable-rng.md)
(the rules kernel stays untouched); [ADR-0004](../adr/0004-retro-flicker-capped-at-1-5hz.md) (why
the last seconds of time attack stay still); [`docs/mode-contract.md`](../mode-contract.md) §3
(state machine, unchanged)

## Problem

The game has no secrets. Across six modes and three styles there is exactly one key the interface
does not tell the player about — Z, which undoes — and that one is on a button. A player who
presses things just to see what happens learns, correctly, that nothing happens.

The repository is the proof that the temptation is real. For a while it carried a button labelled
一念神魔 that planted a pair of tiles so the owner could see the win screen without playing
eighty moves. When the owner was done with it, it was commented out rather than deleted, with a
note that reads: a hidden path is worse than no path, because the next person will mistake it for
a feature. That note is exactly right about a debug hook and exactly wrong about an easter egg. A
debug hook is an unearned back door with no payoff; an easter egg is a payoff with a back door
built into its shape. The difference is not the hiding — it is whether anything on the other side
was designed.

There is a second, smaller gap. The game is unfailingly polite. Nothing in it is funny, nothing
answers back, and nothing in the product carries the personality its own documentation is written
with. The interesting moments it already has — the choice at a deadlock, the pause at the target
tile — are all delivered straight.

## Goal

One easter egg, `一念神魔`. The player types the classic console code — up, up, down, down, left,
right, left, right — and the machine answers: two round buttons appear beside the board, one
marked A and one marked B. What happens next is a small story with three endings and a price.

- Click **B** first and it breaks — the demon path. Only A is left, with a ring thinning over
  thirty seconds. Click A before it runs out and confetti fires from both top corners, a button
  labelled 一念神魔 appears, and an achievement lands. Let the ring run out and a different
  achievement lands, for hesitating.
- Click **A** first and both buttons leave at once, with an achievement that remarks on your
  form.
- Go through the whole thing a **second** time and the board is taken away: the page first floods
  with blood over about six hundred milliseconds, holds a beat, then fades out, and only then does
  it empty down to a restart button. A refresh brings the run back, because the run was never
  touched.
- In time attack, the thirty seconds you spend standing at the choice stop the countdown.

Four achievements, one of them pinned to the top of the viewport for the rest of the run. Confetti
that is real particles. Two new sounds. The board floods with blood at the end of the second pass,
and that dye is gated like everything else in this project. A deadlock or a timeout gets a
line about how the run actually went.

The change is presentation and coordination. No rule, no phase, no record, no settlement timing
and no undo history moves. There is no new input mode: the eight presses are ordinary moves that
the game overhears.

## User stories

1. As a player, I want to type a classic game-console code into the board, so that the game
   acknowledges that I know it.
2. As a player, I want the code to work without any valid move, so that a board that refuses my
   direction still hears me.
3. As a player, I want WASD to work as well as the arrow keys, so that the code does not care
   which hand I play with.
4. As a player, I want one wrong key to start me over, so that the code means what it has always
   meant.
5. As a player, I want no time limit between the presses, so that I can look the code up halfway
   through.
6. As a player, I want the eight presses to still move my board, so that typing the code never
   costs me a run.
7. As a player, I want the code to do nothing on the start screen, so that a game with no board
   does not pretend otherwise.
8. As a player, I want the code state to reset on a phase change and on a new run, so that a
   half-typed code cannot complete itself later.
9. As a player, when the code completes, I want two round buttons beside the board, so that the
   moment reads as a machine answering me.
10. As a player on a phone, I want those buttons below the board rather than beside it, so that
    they never push the layout sideways.
11. As a player, I want the menu not to block the board, so that I can keep playing while the
    buttons wait for me.
12. As a player, I want Esc to put the buttons away, so that I am never stuck holding something I
    did not mean to summon.
13. As a player who clicks nothing, I want the buttons to leave quietly after thirty seconds with
    no comment, so that a code I typed by accident does not accuse me of anything.
14. As a player who clicks B, I want to watch it break, so that choosing the demon reads as a
    fall rather than a selection.
15. As a player who clicked B, I want A left alone with a ring thinning over the same thirty
    seconds, so that I can see the time I have left.
16. As a player who clicked B and let the ring run out, I want to be told that I hesitated, so
    that the joke lands on me and not on the game.
17. As a player, I want a phase change to clear the menu without granting anything, so that being
    interrupted is not reported as wavering.
18. As a player who clicks B and then A, I want confetti from both top corners and a button
    labelled 一念神魔, so that the payoff feels like one.
19. As a player who clicks A first, I want both buttons to leave together with a remark about my
    form, so that the wrong order is a joke rather than a dead end.
20. As a player, I want the first completion to leave a wish button at the bottom of the page, so
    that the code bought me something I can use.
21. As a player in the classic mode, I want the wish button to plant two adjacent 1024s, so that
    one merge reaches the target tile.
22. As a player in the Fibonacci mode, I want it to plant 987 and 1597, so that the same single
    merge works there too.
23. As a player in the big-board mode, I want it to plant the pair that merges to 4096, so that
    the button is not a classic-mode joke.
24. As a player, I want the wish button to do nothing while the run is not being played, so that
    it cannot be used at a pause.
25. As a player, I want to be able to undo the planted pair, so that it is a move I made rather
    than a fact of the world.
26. As a player, I want the planted pair not to count as a move or as score, so that the run's
    numbers keep telling the truth about how I played.
27. As a player, I want the wish button to disappear when I start a new run, so that the gift
    belongs to the run that earned it.
28. As a player who goes through the entire flow a second time, I want the board to be taken away,
    so that greed has a price.
29. As a player whose board was taken away, I want a refresh to bring the run back, so that the
    game never actually breaks.
30. As a player, I want the second pass to write no record and end no run, so that an easter egg
    cannot touch my scores or my statistics.
31. As a player, I want all four achievements to arrive as the ordinary toast, so that the easter
    egg speaks the same language as the rest of the game.
32. As a player, I want the strangest of them to stay pinned at the top of the viewport for the
    rest of the run, so that what happened to me stays visible.
33. As a player, I want that pinned line to be gone after a refresh, so that nothing about the
    easter egg outlives the run it happened in.
34. As a player in time attack, I want the countdown to hold still while I stand at the choice, so
    that the thirty seconds mean something.
35. As a player, I want the countdown to resume the moment the choice resolves, so that nothing is
    quietly lost.
36. As a player who deadlocked or timed out, I want a line about how the run actually went, so
    that losing has a last word.
37. As a player who walked away from a run, I want that line to notice, so that abandoning is also
    a way to end.
38. As a player who asked for less motion, I want the confetti and the shatter to become still
    text, so that the easter egg does not become one more moving thing.
39. As a player using only the keyboard, I want both buttons reachable and labelled, so that the
    easter egg is not mouse-only.
40. As a player, I want the buttons, the pinned line and the wish button to keep the contrast the
    rest of the game has, so that a joke never costs me legibility.
41. As a player, I want the three styles to give the buttons their own look, so that the machine
    answers in the style I chose.
42. As a player, I want the tiles to stay readable while the board is dimmed, so that a darker
    world does not become an unreadable one.
43. As a player, I want no rule, record, phase or settlement to change, so that a cheat code stays
    a cheat code and does not quietly become a rule change.

## Architecture decisions

1. **The code is passive; there is no new input mode.** The eight presses are ordinary moves that
   the window listener overhears. Direction is already normalised to one table that maps both the
   arrow keys and WASD, an invalid move already counts as a press, and the three rules that let
   native keys through — text entry, interactive controls inside the board, and modified
   combinations — are untouched. Nothing about Esc changes either: it already cancels a cheat-swap
   pick when one is open, and this adds a second, equally local condition. The cost of this
   choice is accepted and stated plainly: because the presses really do move the board, "back to
   the state before the code" can only ever mean the menu and the code buffer. The eight moves stay
   moved.

2. **What is overheard lives in one place, and it is not the store's coordination surface.** The
   code buffer, which stage the choice is at, and the two countdowns are the state of one small
   machine in the renderer — a pure transition function plus a hook, no React inside it, with the
   same shape and the same unit seam as the result layer's presence module. The store keeps one
   thing and one thing only: how far the player got through the easter egg this run, because
   achievements are derived from run facts and the run facts are assembled in the store. That flag
   is the whole reason the easter egg touches the store at all.

3. **Both countdowns are driven by an animation and end on `animationend`.** Neither is a
   JavaScript timer. The reason is on the record already: a test that installs a fake clock freezes
   the timer queue, and a countdown that a test cannot finish is a countdown that never fires.
   Listening to the animation's end is the same discipline the result layer's exit uses. The first
   window's ring is drawn invisible — a ring nobody is meant to see yet — so that both windows
   have an animation to listen to and the code has one path, not two.

4. **Under reduced motion the timer animation stays; only the ring disappears.** This is the
   sharpest trap in the whole feature. Swapping the countdown animation off the way the result
   layer swaps its entry and exit would leave nothing to listen to, and the menu would never
   collapse. The reduced-motion block therefore removes the visible ring and keeps a timer
   animation running on an element with no paint.

5. **Three endings, and only one of them is granted by the clock running out.** The first window
   expiring clears the menu silently and grants nothing — a code typed by accident must not
   accuse anyone. The second window expiring grants the hesitation achievement. A phase change
   clears the menu at once and grants nothing: being interrupted is not wavering. Only the clock
   running out while A is alone grants anything.

6. **A pass counts only a complete B-then-A.** Clicking A first, or letting either window expire,
   is not a pass and does not advance anything. So the run's history through the easter egg is
   always one thought, then two thoughts, then the loop. The second pass presents exactly the same
   menu as the first — same buttons, same break, same ring — and only the last click's outcome
   differs. The joke is that you did it again.

7. **The wish button is the run's, and it borrows the cheat-swap shape.** Granted on the first
   pass, inert outside the playing phase, gone on a new run. Pressing it plants an adjacent pair
   that merges in one move into the mode's target tile. The pair is derived from the mode's own
   declared data — the value ladder and the merge table — so the same code works for all six modes
   without a special case per family; the pair for the classic mode is 1024 and 1024, for Fibonacci
   987 and 1597, for the big board the pair that reaches 4096. It writes to the undo history and to
   the session exactly as a cheat swap does, and it does not count as a move and does not score.
   The old debug hook's fallback is kept: if there is no empty adjacent pair, two adjacent tiles
   are overwritten, because a full board is a board that is about to be stuck anyway.

8. **The second pass takes the board away, and the run does not notice.** The page empties down to
   a restart button. The phase stays what it was, no settlement is written, no record moves, the
   rules kernel is not opened. This is a renderer state with one job: hide the board and offer a
   way out. A refresh restores the run, because the run was never the thing that ended — the
   session still holds it, exactly as it holds every other run. The achievement's flag is memory
   only and is not part of the session, so a restored run can earn it again; that is a consequence
   of the decision, not an oversight.

9. **Four achievements, registered in the order they can happen.** The wish, the wrong order, the
   hesitation, and the second pass. All four are single-run and self-provable, as the registry
   requires, and all four are derived from run facts — which is why the easter egg's progress is a
   store field and not a renderer local. The registry grows from seven to eleven and every place
   that states the number is on the sync list. The second-pass achievement carries a line the
   others do not: the registry's definition gains an optional note field, and only the achievement
   that is meant to stay on screen reads it.

10. **One of them stays on screen, and it is memory only.** The second-pass achievement is pinned
    to the top of the viewport for the rest of the run, as a strip carrying its icon, its name and
    its note. It does not fall, it does not fade, it is not a toast — a toast is a sentence that
    disappears in five seconds and that is exactly wrong here. It is not persisted either:
    achievements are not written to storage in this project, and one easter egg does not get to
    overturn that. The strip and the toast stack share the top of the viewport, so the stack's
    offset becomes a variable that the shell sets when a strip is present, and the three theme
    stylesheets read it instead of hardcoding their distance from the top.

11. **The easter egg is shell, not a fourth slot.** This is ADR-0009 and it is the same ruling
    ADR-0008 made for the result layer, for the same reason. The accepted test for a per-style slot
    is that the behaviour surface is narrow enough for one shared test to pin down across all
    three styles. This feature binds two clicks, two countdowns, a keyboard path, focus handling
    and a mode-specific pause to the same state machine; it is not narrow. Each style contributes
    tokens and CSS only — the two buttons' surfaces, edges and shadows, the strip's surface, the
    wish button's surface, and the twelve dimmed tile values. Adding a slot would also raise the
    cost of every future style by one more required file, with styles queued behind this release.

12. **The buttons sit in the shell's gutters on a wide viewport and under the board on a narrow
    one.** On a desktop viewport the shell that wraps the board has room on both sides; the
    buttons are positioned into it and are allowed to extend past the board's own box, because the
    shell is not the board. On a phone there is no room at all — the measured margin beside a
    four-by-four board is a few pixels per side — so the pair moves to a row under the board, on
    the same reasoning as the direction pad. The red line in both cases is the existing contract
    that the document never scrolls sideways.

13. **The confetti is real particles in a canvas, coloured from the ladder's top.** Two bursts,
    one from each top corner of the page, with gravity, spin and decay; the palette is read from
    the three highest tile tokens, so each style's confetti is automatically its own. The canvas
    is an overlay that takes no pointer input — a decorative layer that eats clicks is the oldest
    defect this repository has recorded. Particle motion is a pure function of time, which is what
    makes it testable without a canvas.

14. **Two new sound events, both placeholder tones.** One for the button breaking — low, dull,
    short, in the register the blocked-move sound already occupies, because it says the same kind
    of nothing. One for the confetti — an ascending arpeggio in the register the win sound uses.
    Neither is final audio; the project's audio is placeholder synthesis throughout and the README
    already says so.

15. **The dye is a real change to the tile tokens, and it is gated.** At the end of the second
    pass, the twelve tile values each take a blood-red step. This is deliberately not a
    translucent overlay laid on top of the board: the contrast gate reads an element's own
    computed style, so an overlay would be invisible to it and nobody would be told when a tile
    stopped being readable. Making the tokens change colour means the existing per-bucket probes
    measure the new reality, and thirty-six new pairs (three styles by twelve buckets) do that
    measuring. The gate goes from sixty-eight pairs to seventy-seven with the two buttons
    themselves (nine pairs, three per style, landed by the ticket that builds them), to one
    hundred and thirteen with the dye, and a little more again with the wish button's own surface
    — one hundred and twenty-two by the time the last of them lands. **The trigger is the second
    pass, not the demon path** (decision 20): standing on the demon path is a choice still being
    made, and no blood shows there.

16. **Standing at the choice stops the clock in time attack, and only there.** While the demon
    path is open in a mode with a deadline, the store's tick returns the state untouched. The
    countdown resumes the moment the choice resolves, with the remaining time intact. This is a
    guard in the coordination layer, not a rule: the deadline is unchanged and the engine is
    unaware. It is the one place the easter egg is worth something in play, and it is also the
    reason the thinning ring is not merely decoration.

17. **The card's extra line is one mechanism, used twice.** A deadlock, a timeout and an
    abandonment each get one line summarising the run from its own facts; the run that earned the
    wish gets one line of its own in the same place. Both are the same slot in the same card, fed
    by the same kind of pure function, because two mechanisms for "one more line at the bottom of
    the card" is one more thing to keep in agreement.

18. **Six terms, and they go in the glossary.** The feature is 一念神魔 (an easter egg). The
    sequence is the 神魔码. The interval in which the two buttons are on screen is the 抉择. The
    first completed pass and the button it grants are 一念. The second and the page it clears are
    二念. The pinned achievement is the 悬顶. The forbidden words are written with them: 作弊码,
    外挂 and 调数 are already spent on the cheat swap, and 弹窗 and 通知 on the toast.

19. **The old debug hook is deleted, not commented.** The commented block and its two comment
    blocks leave with this feature, and the wish button replaces what they were for. A commented
    hook is a hidden path with no payoff, which is the thing the repository's own note objected to;
    the payoff is what makes this one different, and leaving both would leave the objection
    standing.

20. **The second pass ends in two beats, and the dye belongs to the first of them.** Ruling issued
    by the project owner on 2026-10-01, against a build that dyed the board during the demon path:
    「这个染血色的触发条件是**重复输入两次作弊码**，先染出血色，然后**淡出关闭棋盘页面**。
    并非是输错了，输错了直接重来。」Asked whether the choice still appears on the second pass,
    the answer was that it does — the A/B pair comes up first, and the dye comes only once the
    pass is walked through. So the sequence at the end of the second pass is: the dye floods up
    over about 600ms, the scene holds a beat of about 200ms, the whole game column (board, status
    bar and controls) fades out over about 400ms, and only then does the page empty to a restart
    button and the pinned strip — which is the behaviour T32 shipped and which this ruling does
    not change, only delays. The demon path itself shows **no blood at all**: a mistyped key still
    clears the buffer and starts over, exactly as before, and that has nothing to do with the dye.
    Two clocks are involved and they are different things: the held countdown stays where it was
    (decision 16, still gated on the demon path), and the ending's own 1200ms holds it too, because
    the player is looking at blood and must not be interrupted by a timeout. The two beats are
    driven by CSS animations ended by `animationend`, never by a JS timer — a fake clock freezes
    `setTimeout` and would leave the ending stuck half-played. They live in the renderer
    (`ShenmoFall.ts`), not in the rules machine: the machine times nothing, and the only fact the
    ending needs is already a rule (a second pass happened). The held-clock grant and the
    achievement's toast both land on the frame the dye starts, not after the page empties.

## Acceptance criteria

- [x] The code is recognised from the arrow keys and from WASD alike, an invalid direction counts
      as a press, one wrong key clears the buffer, and there is no minimum interval between presses.
- [x] The eight presses move the board exactly as they would without the feature; no input mode, no
      key suppression, and the three native-key allowances are unchanged.
- [x] The code does nothing on the start screen, and the buffer clears on a phase change and on a
      new run.
- [x] Two round buttons, A and B, appear with the board between them on a wide viewport and below
      the board on a phone-sized one, and nothing overflows sideways at either width.
- [x] The menu does not block the board: the movement keys keep moving while the buttons are up,
      and Esc closes them.
- [x] The first window expires silently after thirty seconds and grants nothing; the menu is gone.
- [x] Clicking B plays a break, leaves A alone with a thinning ring, and dims the twelve tile
      values by one step.
- [x] Letting the second window expire grants the hesitation achievement and clears the menu;
      clicking A first grants the wrong-order achievement and clears both buttons at once.
- [x] A phase change clears the menu and grants nothing.
- [x] B then A fires confetti from both top corners, grants the wish achievement, and leaves a
      一念神魔 button at the bottom of the page for the rest of the run.
- [x] The wish button plants an adjacent pair that merges into the mode's target tile, works in
      all six modes, does nothing outside the playing phase, is undoable, does not count as a move
      and does not score.
- [x] A complete second pass empties the page down to a restart button, writes no record, ends no
      run, and is undone by a refresh.
- [x] All four achievements arrive through the ordinary toast; the second-pass achievement is also
      pinned to the top of the viewport for the rest of the run and is gone after a refresh.
- [x] The toast stack and the pinned strip share the top of the viewport without overlapping.
- [x] In time attack the countdown holds while the demon path is open and resumes with its
      remaining time when the choice resolves; in every other mode nothing about time changes.
- [x] A deadlock, a timeout and an abandonment each show the run's summary line; the wish run shows
      its own line in the same place.
- [x] Under reduced motion there is no confetti, no break animation and no movement, the button
      pair is still reachable and labelled, the whole easter egg still completes, and the two
      countdowns still expire.
- [x] The contrast gate covers the buttons, their focus rings, the pinned strip and the twelve
      dimmed buckets, and passes at three styles — sixty-eight pairs today, seventy-seven once the
      buttons are built, one hundred and thirteen once the dim is, and one hundred and twenty-two
      once every surface the feature adds has been measured.
- [x] No rule, phase transition, record write, undo entry, or settlement timing differs from
      `docs/mode-contract.md` §3; the existing keyboard, overflow and geometry contracts pass
      unchanged.
- [x] The commented debug hook is gone, the glossary carries the six terms with their forbidden
      words, and the README records that the game has an easter egg and that one more is still
      owed.

## Test strategy

**Seams are existing ones wherever they exist. Two are new, and one of them is a pure module.**

- **The easter-egg machine is a pure function in the renderer, node-tested.** The code buffer, the
  stage transitions, what each ending grants, and what a pass counts are all decidable without a
  browser and without React, and they are the parts most worth pinning: a red test in the browser
  cannot tell a broken state machine from a broken selector. Prior art is the result layer's
  presence module, which is unit-tested the same way for the same reason. The store keeps only the
  progress flag, and that flag is exercised through the existing achievement-host pattern —
  including the guarantee that undo still revokes what a move earned, which the easter egg's flag
  does not take part in.
- **One shared browser contract, run once per style and once per viewport.** The flow is driven
  with real key presses and real clicks, and everything is read back from the DOM and computed
  style: the buttons appear and are positioned, B breaks, the ring runs, the confetti canvas
  exists and takes no pointer input, the wish button appears and plants a pair, the second pass
  clears the page, and a phase change clears the menu. The two exits are pinned with synthetic
  animation events rather than wall-clock waits, exactly as the result layer's exit regression is.
  Prior art: the toast contract spec and the result-layer spec, both of which run the same shared
  contract across all three styles.
- **Everything else reuses an existing seam, and none of them is allowed to need editing to make
  this feature pass.** The achievement registry and its pure judgement; the store's action tests,
  which already cover the cheat-swap shape the wish button copies; the fake-clock time-attack
  cases, which prove the countdown holds and resumes; the keyboard-scope contract, which proves the
  code is passive; the overflow contracts, which prove the buttons do not push the layout; the
  theme contract, which proves each style still ships its slots and its own rules; and the
  contrast gate, which gains one scene for the easter egg's own surfaces and the thirty-six dimmed
  pairs.
- **Human review and a real playthrough.** A cheat code is discovered by hand, not by a selector.
  Before this is called done, the owner types the code on their own machine in all three styles,
  at both widths, and walks one run through to the second pass.

## Out of scope

- Any change to the rules, the phase machine, the recovery paths, the settlement timing, the
  records or the statistics buckets. The easter egg grants a wish; it does not grant an exception.
- A fourth presentation slot. Styles contribute tokens and CSS only, exactly as they do for the
  result layer.
- The gravity sub-easter-egg: page elements falling with weight after the second pass. It is the
  natural continuation of the page being cleared and it is explicitly deferred, with a README TODO
  line recording that it is owed.
- Further achievements celebrating the easter egg — a medal for fifty undos, a medal for playing a
  whole run without touching the keyboard, a medal for reaching the target tile in all three
  styles in one run. All three were considered and set aside.
- A second cheat code, in particular one that reveals the next tile to spawn. It changes what the
  player is doing rather than how the game looks, and a second code is far harder to find than the
  first.
- A heartbeat or any other pulse in the last seconds of time attack. ADR-0004 already records a
  deliberate flicker that reads as a bug to a newcomer; this would add to it rather than to the
  game.
- Cracking the wall cells of the walls mode, or any other change that would make a wall playable.
- A remark from the start screen when the code is typed there.
- New sound beyond the two events above, and any new record type.

## To sync when the implementation lands

`CONTEXT.md` gains the 一念神魔 entry with the six terms and their forbidden words;
`README.md` gains an easter-egg TODO group that records the feature's existence, the deferred
gravity idea, and the fact that the code is deliberately never spelled out in the interface;
ADR-0009 is written, and ADR-0002 and ADR-0008 get a cross-reference to it; the three design cards
each answer, in their own words, what their buttons look like when one of them breaks; the
achievement-count sentences across the README, the project notes, the ADR, the frozen spec and the
existing statistics spec move from seven to eleven, and the browser and unit assertions that hard
code seven move with them; `docs/SPEC.md` §5's frozen endgame rule is untouched but its
achievement-count sentence is not; `AGENTS.md` gains a status section; the ticket set is
published; and the commented debug hook is deleted from the app shell.

**Landed 2026-10-01 (T34's closing grep).** Two of the above were still open when the last ticket
started, and both are now done: the design cards each gained a §11 answering what their four easter-egg
surfaces look like when one of them breaks (T32 had deferred this to a documentation group that never
picked it up, and its own Evidence says so), and `docs/SPEC.md` §3.3's achievement-count sentence had
stopped at "ten … three easter-egg achievements" when T32 added the fourth — it now reads eleven and
four. Everything else on the list was already in place and was re-checked by grep, not assumed: the
glossary's six terms with their forbidden words, the README TODO group and the deferred gravity line,
ADR-0009 with its cross-references from ADR-0002 and ADR-0008, and the registry-size assertions in
`tests/unit/achievements.test.ts` and `tests/e2e/achievements.spec.ts` (eleven). Sentences that
describe a *past* ruling — ADR-0007's, the single-run spec's acceptance and Evidence — were left
exactly as they were.

## Evidence

2026-10-01. Tickets T28 (terms and ADR-0009), T29 (the code and the choice), T30 (the wish and the
cannon), T31 (the card's line and `note`), T32 (the second pass and the pinned strip), T33 (the dim,
the held clock and the two sounds) and T34 (the browser contract and the closing gates) are all
implemented locally and closed; the per-ticket numbers are in their Evidence sections. Every
acceptance criterion was checked against a real run and a real test, with the one whole class of
exception named at the end of this section.

**The four gates** (each run by T34 in the final state, with no change after the last run):

- `npm run typecheck`: **0 errors**.
- `npm test`: **886 passed / 47 files**.
- `npm run build`: **✓ 86 modules transformed**.
- `npm run check:contrast`: **3 styles / 125 pairs**, all passing, declarations and measurements in
  agreement. The arithmetic: 68 pairs before this feature, +9 (the two buttons, T29), +9 (the wish
  button, T30), +3 (the pinned strip, T31), +36 (the twelve dimmed buckets, T33) = **125**. §15's
  arithmetic stopped at 122 because it predates the strip's three pairs.

**Full Playwright suite, backgrounded and headless** (`workers: 4`, preview build):
**710 passed / 14 skipped / 0 failed** (3.0m, exit 0) on the final tree. The 14 skips are the same
pre-existing touch/mobile skips the project has carried since before this feature; this ticket added
none. `game.spec.ts --repeat-each=4`: **40 passed / 0 failed**.

*On the count itself, honestly:* three full runs were made on this tree. The first two were
710 / 0 and 709 / 0-with-one-failure, and the third — the one reported above, on the exact bytes now
on disk — is clean. The one failure was `result-layer.spec.ts`'s entry/exit sampling case on
`[mobile] · Classic` (`退场播完层还在 DOM 里`), a **pre-existing flake under load**, not a
regression from this ticket: it passed 36/36 when re-run on its own, and the case never runs the
easter egg's code path at all. It is recorded in `.codex/memories/e2e-debt.md` with the diagnosis
(bounded frame sampling races React's removal commit when rAF is delayed) and left unfixed, because
neither the diagnosis nor the fix belongs to this spec. T34 added exactly 20 test cases (two
shared-contract cases in `shenmo.spec.ts` × 3 styles × 2 viewports = 12, and `shenmo-clock.spec.ts`
going from one style to three = +8) and removed none — `wish.spec.ts` and `contrast-computed.spec.ts`
changed only inside existing cases. The recorded baselines do not line up with that: T32's Evidence
records 704 cases (678 passed / 12 failed / 14 skipped) and T33's records 676 (662 / 0 / 14), i.e. a
28-case gap that opened *between* those two tickets and not in this one. The 710 above is what the
tree measures today.

**The shared browser contract is three spec files, and each runs the full 3 styles × desktop /
Pixel 5 matrix.** The spec's Test strategy asked for "one shared browser contract, run once per style
and once per viewport"; the implementation delivered three, split by *setup* rather than by claim —
`shenmo.spec.ts` (silent board, real clock: the code, the three endings, the dim, the second pass,
keyboard, reduced motion), `wish.spec.ts` (empty board, canvas pixels: the cannon, the wish button,
six modes) and `shenmo-clock.spec.ts` (full board, **fake clock**, time-attack mode: the held
countdown). Every item in the issue's contract list lives in exactly one of the three, and all three
now run 3 × 2. Keeping them apart was a judgement call: the three setups are mutually exclusive (an
empty board cannot measure the dim, a fake clock cannot measure the cannon, and merging them would
mean a shared fixture layer for boards that must contradict each other), and 200+ cases of churn
risk more than the merge would buy. The one place two files touch the same fact — both assert that
the first-pass toast arrives — is a *precondition* on the wish side (the button is granted by the
same outcome), not one invariant pinned twice. T34 extended the clock spec from Classic-only to all
three styles so the matrix claim holds for all three files.

**Two test defects were fixed in T34. Neither was a product defect.**

1. `contrast-computed.spec.ts`'s `wish` scene never clicked 抉择 A. The machine's `broke` only moves
   the stage from `breaking` to `ring`, and `.shenmo` renders for any stage but `idle` — so the two
   assertions after it ("the menu is gone", "the 一念神魔 button is visible") could never hold, and
   `grant()` (which resets the stage) is what the click does. 6 cases (3 styles × 2 viewports).
2. `wish.spec.ts`'s particle-palette check had two layers. `distanceToBlend` handed `"88,64,149"` to
   a parser that only reads `#rrggbb`, so the colour collapsed to `[0,0,8]` and every blend reported
   ~105 channels of error. Underneath it the *model* was wrong: it asked "is this near one of the
   three segments", when source-over over palette-coloured particles yields **any convex
   combination** of the three tokens — a point inside the triangle, far from every edge. The fix is
   a distance-to-triangle measure in channel space (barycentric-with-tolerance was tried and
   rejected: Classic's and Material's top three tokens are nearly collinear, so the triangle is
   thinner than one channel and a one-channel readback error becomes a whole unit of barycentric
   offset). Both fixes were proved by temporarily restoring the defect and watching the cases go red
   (6 and 6), exactly as T33 did for the held clock.
   *A finding worth recording:* with the parser fixed, the old segment criterion also passes at its
   old tolerance of 12 — the pixels a burst actually paints are dominated by single-particle and
   two-particle overlaps, so deep interior blends are rare. The triangle criterion is kept anyway
   because it is the true model and because it measures a tighter quantity: the worst observed
   distance to the triangle is **2.83 – 5.26 channels** (3 styles × 2 viewports), and 12 covers that
   with room for the accumulated 8-bit rounding of a corner pixel that dozens of particles crossed
   in one frame.

**Two contracts added in T34, both with a red proof.**

- **Keyboard reachability, end to end** (`shenmo.spec.ts`): typing the code does not steal focus;
  A and B are one and two Tabs after the board; Enter and Space activate them; Esc closes them from
  the button itself. After B is torn down mid-break the focus falls to `body` and the direction keys
  still move the board — that is the 2026-09-28 window-level keyboard contract seen from the easter
  egg's side.
- **The 29.95-second race** (`shenmo.spec.ts`): with the break still playing, the first window's
  `animationend` must not collapse the menu, because the player who clicked B acted. Removing the
  machine's `stage !== 'choice'` guard turns this case red in all 6 combinations.
- **Focus landing** (in `App.tsx`, one effect following the T17 stats-panel and T22 result-layer
  precedent): when the second pass clears the page, the button the player just pressed leaves the DOM
  with it, so focus falls to `body`; it is moved to the page's only remaining control, 重新开始. The
  direction keys were never broken by this (they live on the window), so what this buys is a keyboard
  or screen-reader user a place to be, not the ability to play. Removing the effect turns the second
  pass case red in all 6 combinations.

**What was *not* verified.**

- **The entire discovery experience.** No test can type a code it has been told. Nobody has typed
  ↑↑↓↓←→←→ into a board on a real machine, in any style, at either width, and then walked one run
  through both passes. Every claim above is about what the machine does once it is told the code.
- **Every visual judgement.** The break, the confetti, the dim, the pinned strip and the emptied page
  were verified as computed style, `data-*` attributes, synthetic animation events, canvas pixels read
  back and fake-clock readings — never looked at. Whether the dim reads as "one step darker" rather
  than "broken", whether the shards read as a break, whether the confetti reads as a celebration and
  whether the placeholder shatter and fanfare are tolerable, are all owed by the project owner.
- **Every reduced-motion judgement.** The contract proves there is no canvas, no shard, no
  displacement and that both windows still expire; it does not prove the still line of text reads as
  an acceptable substitute for two cannon shots.
- **No real 30 seconds was ever waited out.** Both windows end on synthetic `animationend` (T29's
  rule) or a fake clock advanced past the deadline (T33's rule); a wall clock in a test freezes the
  suite's own fake-clock cases.
- **The three design cards' new §11 is untested prose.** It records what each style contributes to
  the easter egg's four surfaces; nothing asserts that the prose matches the CSS.

## Existing SPEC alignment before implementation

Nothing in the frozen endgame rule changes: settlement still executes exactly once, records still
go to the style active at settlement, a deadlock still offers recovery before it settles, and time
attack still settles immediately with no undo afterwards. The time-attack pause holds the clock by
not asking it, and it **gives the held time back**: the store keeps how long the choice stood open
and subtracts that from the moment it feeds both the countdown and the deadline comparison, so the
frozen rule — the deadline is never rewritten — survives while the player genuinely gets the thirty
seconds. Freezing only the display was considered and rejected: a countdown that lies about the time
left is the exact defect this project has already argued against once, and the easter egg does not
get to introduce a second one. §3.4's keyboard contract is unchanged, and the code is deliberately
built so that it could not change it. The one premise this spec corrects is the repository's own:
the note that says a hidden path is worse than no path is true of a debug hook and false of a
designed payoff, and this feature is written to be the second thing.
