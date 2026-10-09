# The Settings Drawer: A Layer Over the Page

**Status:** Drafted 2026-10-09 and **revised the same day after the design stage** — **not
implemented**. This spec is the parent of its own ticket group. The revision folds in what the design
stage settled, so decision 10 and the motion acceptance criteria no longer say what the first draft
said.
**Date:** 2026-10-09
**Decisions:** ADR-0010 (to be written by this group's root ticket — why the drawer is shell and not a
fifth presentation slot, the third refusal of the same request after ADR-0008 and ADR-0009, **and why
the drawer carries its own motion values while the other two layers keep the shared posture**);
[ADR-0002](../adr/0002-style-as-folder-with-decoration-slots.md) (slot boundary and the criterion being
applied, unchanged); [ADR-0008](../adr/0008-result-layer-is-a-scrim-over-the-board.md) (the leaving-pointer
rule and the delayed-unmount precedent this spec reuses); [ADR-0009](../adr/0009-shenmo-is-shell-not-a-fourth-slot.md)
(the second refusal); [ADR-0006](../adr/0006-style-catalog-is-the-source-of-truth.md) (style identity);
[`docs/SPEC.md`](../SPEC.md) §3.2 (the style contract), §3.3 (the settings bucket), §3.4 (keyboard —
**amended in place by this spec**), §4 (seams), §6 (out of scope);
[`docs/mode-contract.md`](../mode-contract.md) §3 (the state machine, unchanged)

## Problem

The page has no settings. Everything that is a setting is currently loose in the layout: the style
picker sits in the middle of the column on the start screen and again mid-run, and the sound switch
is a bare button in a footer block that appears before a run and during one. The README already
commits this project to more settings than that — saved presets, a background-music switch, a
per-event sound switch list, a god-mode row, and language — and there is nowhere for any of them to
live.

Two things make that worse than untidy:

- **Mid-run style switching is a first-class contract, but its control reads as a start-screen
  choice.** Putting a style at the top of the column next to the mode buttons makes "how this run
  looks" look like "how you chose to start".
- **There is no way to reach a setting without the page being in play.** A player who wants to turn
  the sound off mid-run has to press a button that is sitting among the run's own controls, with the
  board live underneath and nothing stopping a stray key from moving it.

## Goal

Give the page **one settings entry** that opens **one layer**, and give that layer the whole page
while it is open: no pointer anywhere else, no keyboard anywhere else, nothing tabbable behind it.
Closing it returns the player to exactly the state they left, with focus back where it was.

The first tenant of that layer is the sound switch that already exists, re-housed as a labelled row
with a switch. The layer's shell is built so the settings the README already commits to can move in
later without rebuilding it.

The layer has a title and its own way out, so that leaving it is not something a player has to guess
at; it takes the full width on a narrow viewport rather than leaving a strip of page that is visible
but unclickable; and it arrives and leaves on motion values of its own, because a whole panel pushed
in from an edge is a different gesture from a 4px rise.

The change is presentation and input routing only. No rule, no phase, no recovery path, no
settlement timing, no undo history, no record semantics, no achievement and no storage shape moves.
The one setting that moves house already persists itself, so the storage format does not change and
no version is bumped.

## User stories

1. As a player, I want a settings entry that is always in the same place, so that I do not have to
   look for it depending on whether a run is in progress.
2. As a player, I want the entry to be reachable both before a run and during one, so that a setting
   is a setting at either time.
3. As a player, I want the entry to tell me whether the drawer is open, so that its state is legible
   without opening it twice.
4. As a player who cannot see the icon, I want the entry to announce itself as settings, so that an
   icon-only control is still a named control.
5. As a player, when I open settings I want the whole page to stop taking input, so that nothing I do
   in a settings layer can move a board I am not looking at.
6. As a player, I want the page behind the drawer to be visually quieter than the drawer, so that I
   can tell which one I am talking to.
7. As a player, I want to close the drawer by clicking outside it, so that the usual way out of a
   layer works.
8. As a player, I want an explicit close control inside the drawer, so that there is a way out that
   does not depend on guessing where "outside" is.
9. As a player, I want `Esc` to close the drawer, so that the keyboard has the same way out.
10. As a player, when the drawer is open I want a press of `Esc` to close the drawer rather than
    cancel something underneath it, so that closing the topmost layer is always what `Esc` does.
11. As a player, when the drawer is open I want the movement keys and the undo key to do nothing at
    all — not move the board, not undo — so that a settings layer cannot change my run.
12. As a player, when the drawer is open I want the arrow keys to still not scroll the page, so that
    "the page only scrolls with the wheel" keeps being true.
13. As a player typing in a future text field inside the drawer, I want the arrow keys to belong to
    that field, so that the drawer never eats a control's own keys.
14. As a keyboard-only player, I want `Tab` to stay inside the drawer while it is open, so that I
    cannot walk into a page that is not taking input.
15. As a keyboard-only player, when the drawer opens I want focus to move into it, so that I am
    never left outside a page where nothing is focusable.
16. As a keyboard-only player, when the drawer closes I want focus to come back to the entry I opened
    it with, so that the keyboard is exactly where it was.
17. As a player who asked for less motion, I want the drawer to arrive and leave without any sliding,
    so that it does not become one more moving thing.
18. As a player, I want the drawer to arrive and leave with motion rather than a hard cut, so that
    opening settings reads as a transition and not a glitch.
19. As a player, I want the drawer to stop taking pointer input the instant I close it, so that
    clicking a fresh new game right after closing is not swallowed by a layer that is still fading.
20. As a player, I want to see the sound switch as a labelled row rather than a bare button whose
    words change, so that I can find it by reading a label that never changes.
21. As a player using a screen reader, I want the sound row to announce itself as a switch and tell
    me whether sound is on, so that I do not have to infer it from a button's wording.
22. As a player on a phone, I want a switch I can hit without precision, so that the row is usable
    with a thumb.
23. As a player, I want my sound choice to survive a refresh, so that muting is not something I do
    again every visit.
24. As a player in a timed run, I want to know that opening settings costs me time, so that the
    drawer's cost is a decision I make rather than a surprise — the clock is deliberately **not**
    held while the drawer is open.
25. As a player, when a run settles while the drawer is open, I want the drawer to stay where I left
    it, so that a layer I opened is not pulled out from under me; closing it lands me on the result.
26. As a player, when a result layer is up, I want opening settings to put the result's own buttons
    out of play until I close the drawer, so that "settings blocks everything" is one rule rather
    than a rule with an exception nobody can remember.
27. As a player, I want the drawer to look like it belongs to the style I am using, so that opening
    settings does not feel like leaving the application.
28. As a player, I want the drawer to open and close identically while a run is suspended on the
    cleared page after the easter egg's second pass, so that the entry is not a control that
    disappears in one state and not another.
29. As a player, I want the drawer to be unreachable for the moment the page is still reading my
    saved settings, so that a change I make is not silently reverted by the load that was already in
    flight.
30. As a future maintainer adding a style, I want the drawer to need tokens and CSS from me and
    nothing else, so that adding a style still never means adding a file that renders.

## Architecture decisions

1. **The drawer is shell, not a fifth presentation slot.** ADR-0002's criterion is that a slot has to
   be narrow enough for one shared test suite to pin it down. The drawer binds several store actions,
   takes pointer and keyboard away from the whole page, manages focus, and will later hold presets,
   sound switches, god mode and language. That is wider than the toast slot. So the three styles
   contribute tokens and CSS for this feature and nothing else — the same shape ADR-0008 chose for
   the result layer and ADR-0009 for the easter egg. This is the **third** refusal of the same
   request, and ADR-0010 records it as such.

2. **One entry, icon-only, drawn by one inline SVG shared by all three styles.** Colouring it with
   the button's current text colour means it needs no colour of its own, so it adds no contrast pair.
   An emoji is refused for two reasons: the achievement registry already spends a gear glyph on a
   different meaning, and each design card bans emoji as decoration on the static board, tile and
   shell — that ban was narrowed for the toast only because a toast's glyph is *content*. A settings
   entry is decoration. One shared drawing, not three, for the same reason the achievement glyph is
   shared: three copies drift.

   The accepted cost is that one drawing has to survive three drawing languages. The cards are flat
   filled shapes (Classic), elevation and tonal surfaces (Material), and hairlines on paper (Claude);
   stroke weight is the conflict, and the colour-only fix does not touch it. The icon is drawn as a
   **filled** shape so that no style has to accept a line weight it does not use; the per-style
   geometry decisions are the design cards' business, and the icon's exact shape is recorded there.

3. **The entry is fixed to the viewport's top-right corner, and the stacking order is declared once.**
   The shell is a single centred column with no header, so there is no in-flow top-right to attach to.
   Entry, scrim and drawer get explicit levels declared in one place, above the levels already in use
   (the toast stack and the easter egg's cannon), with the reason written beside them — on a narrow
   viewport the entry and the toast stack share the top band, and without a number the winner would be
   decided by declaration order.

4. **The entry is visible in every page state except one.** Open on the start screen, during a run,
   while a result layer is up, and on the page the easter egg's second pass clears. The single
   exception is while the page is still reading saved settings. That exception is not tidiness: the
   load applies the persisted settings in one state commit with **no guard** against values the player
   has already changed in this session, so a switch flipped in that window is silently reverted while
   the disk keeps the new value. Hiding the entry makes that window unreachable. The accepted cost is
   that "always visible" is an almost-always, and the exception has to be stated wherever the ruling
   is.

5. **Two of the six sentences this contradicts are amended in place.** The glossary's entry for the
   second pass currently says that page is cleared to a single restart button, which stops being true
   the moment the entry is always visible; and the shell's own comment on that state says the same
   thing. Both are rewritten to name the entry. The rule they describe does not change — what the
   page *does* is untouched.

6. **`inert` on the page content is what denies `Tab`, not a hand-rolled trap.** The keyboard listener
   does not see `Tab`, so without this a keyboard player can walk behind the scrim and activate a
   control that is supposed to be out of play. `inert` does the whole job — pointer, focus, find-in-page,
   assistive-technology exposure — with no JavaScript focus loop, and it is baseline-available in the
   browsers this project already assumes. It is applied to the page content only: the fixed overlays
   (the toast stack, the pinned strip, the cannon) stay out of it, because the toast's own contract
   is that hovering or focusing it pauses its dismissal, and an inert toast cannot be hovered.

   This requires the page content to be wrapped in one element, with the scrim and the drawer left
   outside it but still inside the shell, so the style tokens keep inheriting.

7. **The drawer is a dialog with a name, and focus goes to the dialog itself on open.** Because the
   page content is inert, focus necessarily falls to the document body when the drawer opens — this is
   not a choice about whether to move focus, only about where to. It goes to the container rather than
   to the close control, because a stray `Enter` on a focused close control would shut the layer
   immediately. `aria-modal` is deliberately **not** set: with the background inert the background is
   already gone from the accessibility tree, and this project states a thing once.

8. **The scrim takes all pointer input, and that is the whole of "settings blocks the page".** The
   scrim is the layer's "outside" for the purposes of click-to-close and the thing that makes "nothing
   else is clickable" true. It is one element doing one job; the entry itself sits under it while the
   drawer is open, so clicking the entry again lands on the scrim and closes.

9. **While the drawer is open the keyboard is swallowed, but still consumed.** Movement keys, `WASD`
   and the undo key are prevented from their default *and* from reaching the board — the page still
   only scrolls with the wheel, which is this project's standing rule, and the board is not in play.
   Text entries keep their native keys, on the existing rule that a text control's own keys belong to
   it; this is the case that guard was originally written in anticipation of. `Esc` closes the drawer
   and takes priority over the cheat-swap pick and the easter egg's choice, because closing the
   topmost layer is what `Esc` means.

   This amends **SPEC §3.4** in place. Its current wording says a control elsewhere on the page does
   not swallow movement keys; the drawer is a second exception beside the two already listed.

10. **The drawer's arrival and departure are its own pair of values, and departure is ended by an
    animation, never a timer.** A slide-in from the right plus a scrim fade, **250ms in and 200ms
    out**, on **`cubic-bezier(0.32, 0.72, 0, 1)`** — the curve built for a whole panel pushed in from
    an edge, with a fast start and a soft landing, which a built-in easing cannot give over a
    full-width travel. The two durations are deliberately **asymmetric**, and this project already
    carries the same intuition in another projection: the result layer's card departs by 2px where it
    arrived by 4px, recorded as "falling is lighter than rising". The slow half belongs where the
    player is deciding, the fast half where the system is answering.

    **This pair is scoped to the drawer**, and to any future layer that covers the page. The result
    layer and the easter egg's menu keep the shared 150ms on the built-in ease-out: their acceptance
    was done against that posture and is closed, and the reason for a second curve — a full-page
    travel — does not apply to a 4px rise and a 2px sink. ADR-0010 records both the scope and the
    reason, so that the next reader does not read two motion values in one file as drift.

    Unmounting is still driven by the animation's end event, for a reason this project has already paid
    for twice: a test that installs a fake clock freezes timers, so a timer-driven departure never
    finishes. **The accepted cost of keeping keyframes is stated**: closing the drawer inside its
    250ms arrival snaps it to fully open before it slides out. A transition would retarget instead, but
    the arrival would then need `@starting-style` or a two-phase render, and the latter is exactly the
    one-frame flash this project caught on the win title.

    The leaving flag lands in the **same commit** as the state change, so pointer input is released on
    that frame rather than one frame later. Under reduced motion the slide is dropped and only the
    opacity change remains; the two durations are unchanged, because reduced motion means less
    movement, not less feedback.

11. **"Is the layer mounted" is not the same question as "is the drawer open", and the difference is a
    pure function in the renderer.** The layer outlives the closed state by one animation, exactly as
    the result layer outlives its phase. That transition is a pure function plus a thin hook, with no
    React inside the function, in the same shape and against the same unit seam as the result layer's
    presence module and the easter egg's fall module. It lives in the renderer rather than the store
    because the delay has no second consumer — the same reason the store does not own the statistics
    panel's open state.

12. **The timed run's clock is not held while the drawer is open.** The one precedent for holding the
    clock was ruled on a specific principle: that hold exists because that window is *imposed by the
    game*. Opening settings is the player's own choice, and the game should not pay for a choice the
    player made. The accepted cost is stated rather than hidden: in Time Attack, time spent in the
    drawer is time spent. Borrowing the hold's machinery would also mean adding a second accumulator
    and diluting a ruling that was named for one feature.

13. **A run settling underneath an open drawer does not close the drawer.** With the entry always
    visible there is no dead end to escape — closing the drawer lands on the result layer — and
    pulling a layer out from under a player who is using it is worse than leaving it. This decision
    requires no mechanism: "do not close" is doing nothing.

14. **The sound switch becomes a labelled row whose switch carries the state.** The label is static
    and the switch reports on/off, which is what a switch is for. The accessible name is the visible
    label itself, referenced rather than duplicated, so there is one string to keep true; the visible
    label is not a `<label>` element, because that would quietly add "clicking the label toggles it"
    behaviour nobody asked for. There is no visible state word: a changing word would either join the
    accessible name (which must stay constant for a switch) or be hidden from assistive technology
    (which makes it text that only the eye reads, duplicating the switch position).

    **The whole row is clickable**, and that is a stated, testable intent rather than a side effect of
    the markup: the label is not a `<label>` element precisely so the browser does not quietly forward
    a click into the control, while the row's own handler is something this spec asks for and the
    browser contract asserts.

    This is why the component's existing note about *not* using a pressed state is **rewritten rather
    than deleted**: that note's reasoning was that a button whose own wording changes must not also
    report a pressed state, and a static label removes exactly that contradiction. The note should say
    so, so the next reader does not restore the old pattern.

15. **The switch carries its two states by position *and* by colour, it needs no new colour value in
    any style — only new role names — and its thumb changes colour between states in two of the three.**
    The house habit for "this control is in its selected state" is a change of fill, not a change of
    position, in all three styles, so the track changes colour between states. Two states means two
    non-text contrast pairs per style, so **the switch adds six entries**, two per style. On top of
    those, each style's drawer surface carries its own title-and-label pair, because a surface that did
    not exist before cannot inherit a measurement (decision 19 counts those).

    **Why the thumb has to change, with the arithmetic on the record.** A single thumb colour works only
    where it clears the non-text floor against *both* track colours. **Classic is that case** — its
    bright ink clears both by a wide margin — so it declares two track tokens and reuses its existing
    ink for the thumb. **Material and Claude are not**: on Claude the dark ink against the warm selected
    fill lands at **2.68:1**, under the 3:1 floor, and that number is derivable from that card's own
    recorded luminances rather than measured by eye — the card gives the warm fill's ratio against a
    known light ink, and the dark ink's luminance, and the rest is arithmetic. The fix is the one
    Material already uses by convention: a thumb that becomes light when the switch is on. So Material
    and Claude each declare four tokens.

    **Every value involved is already in that style's palette.** What is new is the *role names*, so no
    style's palette grows a colour, and each new pair is one colour ruling the gate then guards forever.

    **The geometry is shared even though the colours are not**: one track size, one thumb size and one
    travel distance for all three, because a control that should read as the same control must not have
    three skeletons. What differs between styles is the track colour, the thumb colours, the radius and
    the focus ring.

    The first draft left "is a switch that is on the same thing as a control that is selected" to the
    design stage; the design stage answered it in favour of **reuse** — the switch's on state is the
    same decision the selected control already expresses, so it uses the same fill, which is why
    Claude's card stops enumerating three places for its warm colour and says four.

16. **No storage shape changes and no storage version is bumped.** The sound switch's value is already
    persisted; the drawer's open state is session state and is deliberately not persisted (a page that
    reloads into an open settings layer would be a page that remembers a mistake). Adding settings
    later will need a shape decision of its own; that is not this spec's.

17. **The glossary gains one term and its avoid list, and the entry's meaning is fixed there.** The
    canonical term is 设置抽屉 (settings drawer). It avoids 设置会话 (session is already spent on the
    saved run), 设置面板 (panel is already spent on the board and is also the scorecard's class name),
    弹窗 and 通知 (both already spent on the toast), and 侧边栏 (which names a position, not a
    behaviour).

18. **Nothing in this feature reaches the rules kernel, the phase machine or the store's run state.**
    The rules layer has no knowledge that a settings layer exists, which is the point: the same way
    the result layer and the easter egg are invisible to it.

19. **The drawer says "this is on top" differently in each style, and every style says it with tokens it
    already has.** The result layer's precedent — a surface the colour of the page, carrying no shadow,
    with the scrim doing all the work of saying "on top" — was considered and **rejected for this
    layer**, because that precedent was set for a card sitting on a scrim *over the board*, while this
    is a panel covering the page. So: Classic uses its dark control surface and no shadow, because a
    dark surface on paper is how that style has already said "above" three times (the toast, the two
    round buttons, the pinned strip); Material uses its tonal surface with the same elevation group as
    its toast; Claude uses the brighter paper its own board is made of, plus the hairline rule that
    board is outlined with. The three styles therefore do **not** share a drawer surface, which is
    deliberate — each card's own requirement is that it can say what makes it different from the other
    two.

    **The contrast cost of that choice is not uniform, and it is stated rather than discovered later.**
    A surface that did not exist before cannot inherit a measurement, so each style's drawer surface
    carries its own title-and-label pair. For Classic and Material those are colour combinations their
    tables already contain — their control surfaces already carry text — so only the entry is new. For
    Claude they are **two genuinely new colour combinations**, because its drawer is the paper its own
    board is made of, and that paper has never carried text. Claude is therefore the only style whose
    surface choice costs colour rulings as well as entries. The alternative — using the page colour, as
    that style's toast does — would cost none, and is recorded in that card as the fallback if the
    surface ever needs to be cheapened.

20. **The scrim belongs to the viewport and reuses a value already measured.** The result layer's three
    scrim strengths are ranked by how much decision is left to the player, and a settings drawer leaves
    none, so it takes the **darkest tier's value** — the settlement tier — in each style. All three
    cards already state that a scrim is a backdrop colour and not a text foreground and therefore does
    not enter the contrast table, so this adds no pair. The accepted cost is stated: that value was
    tuned to dim a board, and it now covers a whole viewport including a large area of page colour, so
    it will read heavier. If it reads too heavy on the real thing, the fallback is the middle tier or a
    per-style value, and that is a revision with evidence rather than a preference.

21. **The drawer is titled, carries its own way out, and is full-bleed on a narrow viewport.** The title
    and the close control exist because "click outside" is not an affordance a player can be asked to
    guess at, and the close control uses the **same word** the statistics panel already uses for
    closing a layer — one repository should not carry two words for the same act. The width is
    `min(22rem, 100vw)`, reusing the number the toast stack already established as this project's
    floating-layer width, and it goes **full-bleed on narrow viewports** rather than leaving a strip of
    page: this layer denies the page all input, so a visible-but-unclickable strip is a trap. The
    accepted cost is that click-outside-to-close is unavailable there — which is exactly why the close
    control is not optional.

22. **The entry keeps three states and declines two general-purpose recommendations, on the record.** It
    has a hover state, a focus ring and an open state, and that is all. Two recommendations from the
    general frontend guidance the design stage loaded are **declined**: a scale-on-press active state,
    and a hover state gated to fine pointers. No control in this repository has an active state, and all
    three styles use a bare hover, so adopting either for the entry alone would make it the only control
    that behaves that way. Adopting them means adopting them across the existing control family, which
    is a separate piece of work with its own acceptance, not a side effect of adding a settings entry.

## Acceptance criteria

**The entry**

- [ ] It is reachable on the start screen and during a run, at the same place in both.
- [ ] It is visible while a result layer is up, on the page the second pass clears, and during a
      cheat-swap pick, and it is hidden only while saved settings are still being read.
- [ ] It is an icon-only button whose accessible name is settings.
- [ ] It reports whether the drawer is open.
- [ ] Its drawing is one shared inline SVG, coloured by the button's own text colour, adding no
      colour pair and no per-style file.
- [ ] Its hit area is the same 3rem the direction keys and the two round buttons already use.
- [ ] It has exactly three states — hover, focus ring, open — and no press animation.

**Opening and blocking**

- [ ] Opening the drawer leaves nothing on the page clickable: every pointer path to the board, the
      direction pad, the swipe surface, the new-game button, the statistics entry and the result
      layer's controls lands on the scrim.
- [ ] While the drawer is open the movement keys, `WASD` and the undo key neither move the board nor
      undo nor scroll the page.
- [ ] `Tab` cannot reach the page behind the drawer.
- [ ] A control inside the drawer that takes text keeps its own keys.
- [ ] The result layer's own controls are provably out of play while the drawer is open — this is
      asserted directly, not left as an implication of the scrim being present.

**Closing**

- [ ] Clicking outside closes it.
- [ ] The close control inside closes it.
- [ ] `Esc` closes it, and `Esc` while the drawer is open closes the drawer rather than the
      cheat-swap pick or the easter egg's choice underneath.
- [ ] Closing returns the page to exactly the state it was left in: a run in progress is still in
      progress, a result layer is still there, the cleared page is still cleared.
- [ ] Pointer input is live on the page on the frame the drawer starts leaving, not one frame later.

**The drawer's shape**

- [ ] It is titled, and it carries its own close control.
- [ ] Its width is `min(22rem, 100vw)`, and it is full-bleed on a narrow viewport.
- [ ] The scrim covers the viewport, uses the settlement tier's value in each style, and adds no
      contrast pair.
- [ ] The three styles' drawer surfaces differ from each other, and each is built from tokens that
      already existed before this change.

**Focus and assistive technology**

- [ ] Opening moves focus into the drawer, to the drawer itself rather than to a control that a
      stray `Enter` would trigger.
- [ ] Closing returns focus to the entry, and only when focus has actually been lost — it never takes
      focus from somewhere the player is using.
- [ ] The drawer announces itself as a named dialog.
- [ ] The sound row announces itself as a switch, named by its visible label, reporting on or off.
- [ ] The sound row's accessible name does not change with the state.

**Motion**

- [ ] Arrival takes 250ms and departure 200ms on the drawer's own curve, and the departure's end is
      what unmounts the layer.
- [ ] The drawer's motion values are declared in one place, and the result layer's and the easter egg
      menu's 150ms values are untouched — a check that the scope did not leak.
- [ ] A test that installs a fake clock does not strand the layer open.
- [ ] Under reduced motion there is no slide at all, and the two durations are unchanged.

**The sound row**

- [ ] It is a labelled row: a static label, and a switch that carries the state by position and by
      track colour.
- [ ] The whole row is clickable, not only the switch.
- [ ] The switch's two states differ by the thumb's position **and** by the track's colour.
- [ ] The thumb is light in the on state in the two styles whose arithmetic requires it, and that
      measure is asserted by the gate rather than assumed.
- [ ] The track and thumb geometry is identical in all three styles.
- [ ] It toggles sound, and the old assertion point for "muted" still reports the same value it did
      before this change.
- [ ] Toggling it and refreshing keeps the choice.

**Across the three styles**

- [ ] One shared browser contract, run once per style, proves every behaviour above. The behaviours
      are the same in all three; only tokens and CSS differ.
- [ ] The contrast gate covers every new pair, and the count of declared pairs grows by exactly the
      number the new pairs add — no style gains a pair it does not use.

**Things that must not have moved**

- [ ] No change to the phase machine, settlement timing, recovery paths, undo history, records,
      achievements or the storage format.
- [ ] The rules layer has no reference to anything in this feature.
- [ ] Every existing suite passes except the specific assertions this spec names as changed.

## Test strategy

**Seams are existing ones wherever they exist; no new seam kind is introduced.**

- **The rules layer is untouched.** No test in this group touches the rules kernel, and the existing
  engine, phase and settlement suites are expected to pass without edit. If any of them needs
  changing, the change has escaped this spec's scope.
- **One new pure module, against the existing node seam.** The mounted-versus-open transition is a
  pure function in the renderer, unit-tested in node with no browser and no React, in the same shape
  as the result layer's presence module and the easter egg's fall module. Prior art: the unit suites
  that drive those two machines directly.
- **One shared browser contract, run once per style.** The drawer's cross-style invariants live in a
  single spec exercised three times, mirroring the result-layer and toast contract specs: the four
  opening and closing paths, the scrim taking pointer over each of the page's interactive surfaces,
  the keyboard being swallowed but still consumed, `Tab` staying inside, focus going in on open and
  back on close, the same behaviour on the cleared page and with a result layer up, the departure
  releasing pointer on the first frame, and the loop under a fake clock. The three styles differ only
  through their tokens, so the assertions are written once and parameterised by style.
- **The per-style look is not tested here; it is designed elsewhere and referenced.** The three design
  cards own the surface colours, the radii, the densities, the title's typography and the switch's
  geometry; this spec fixes the constraints those answers must satisfy. So the browser contract asserts
  the **constraints** — the width, the full-bleed behaviour, the scrim's coverage, the two states
  differing by position *and* colour, one shared geometry, and that the two other layers' motion values
  did not move — and not the coordinates.
- **The contrast gate's growth is the count, not a new kind of check.** Six new non-text pairs, two per
  style, declared for both halves of the gate in the same shape the last two groups used.
- **The keyboard contract is re-verified where it already lives.** SPEC §3.4's arrow-key assertions
  are the existing seam for "the page never scrolls with arrow keys", and the drawer adds a case to
  them rather than a new suite.
- **The existing sound suite changes in exactly one way.** Its assertions about the old control's own
  wording change to the new row's; its assertions about the persisted value do not change and are
  expected to pass unmodified. That asymmetry is the check that this spec moved the control without
  touching what it means.
- **The contrast gate.** `check:contrast` validates the declared pairs against the token files, and
  the browser computed-style spec reads each pair's probe off the rendered page. New pairs are
  declared for both a declared-value check and a computed-style check, per pair; the existing
  precedent is the pairs added by the last two groups.
- **Per-style visual design and the design cards.** The drawer's title, the close control's wording
  and position, the drawer's width and narrow-screen behaviour, the entry icon's exact shape and the
  switch's geometry are decided in the design process and land in the three design cards, the way the
  toast's and the result layer's appearance did. This spec fixes constraints; the cards fix
  coordinates.
- **Human review.** Computed-style checks prove declarations, not experience. Each of the three styles
  needs the entry, the drawer and the switch looked at in a real run, on desktop and on a phone,
  before this is called done.

## Out of scope

- **The rest of the README's settings group**: saved presets, the background-music switch, the
  per-event sound switch list, the god-mode row, and language. They move into this shell later; each
  needs its own decision about storage shape and about what the row looks like.
- **Moving the style picker into the drawer.** It is a stated commitment of the same README group, but
  it is a move rather than new capability, and it touches the way a large share of the existing browser
  suite selects a style. It gets its own ticket, after this one.
- Any change to the rules, the phase machine, recovery, settlement timing, records, achievements or
  the storage format.
- A fifth presentation slot, and any per-style rule branch.
- The three design cards' per-style visual answers (title, close control, width, narrow-screen
  strategy, icon shape, switch geometry). This spec fixes the constraints they must satisfy.
- **Two contradictions between the README's settings group and the current implementation**, which are
  recorded here so they are not lost, and deliberately not resolved by this spec: the group asks for
  the merge sound to stop varying by tile value, while the sound module documents that variation as a
  hard requirement; and the group asks for a rainbow gradient on the god-mode row, while one design
  card bans gradients outright. Both are design rulings, not cleanups, and both belong to the tickets
  that actually implement those rows.
- Any new sound, and any new record type.
- Any change to the other README groups — the specialty styles and the invalid-move feedback.

## To sync when the implementation lands

- `README.md`'s settings group: its status line and the two bullets this spec delivers.
- `docs/SPEC.md` §3.4 (amended in place by decision 9) and §3.2 if the drawer's existence changes how
  the style contract is described.
- **Four in-place amendments created by the design stage, before or with the implementation.** This
  spec's own motion decision — **done** in the revision above, and the published issue carries it. Each
  of the three cards' §6 motion paragraph gains the drawer's exception. And Claude's card §7 stops
  enumerating three places for its warm colour and says four. Until those three land, each of those
  cards contains a sentence the drawer contradicts.
- `GLOSSARY.md`: the new term and its avoid list, and the second-pass entry amended (decision 5).
- The three design cards: a new section each (the toast and the easter egg set the precedent), plus the
  colour roles each style gains in its §2 and the new pair notes in its §9.
- `AGENTS.md`: a dated status section for this group, in the shape the existing status sections use.
- The shell's own comment on the cleared page state, and the sound component's note about its
  accessible name (decision 14).
- The design process's state file, so the next session sees this group's design stage as done.

## Evidence

Not applicable yet — this spec is drafted and not implemented. Evidence lands when the implementation
tickets close, in the same shape the previous groups used: the before-and-after gate numbers, the
tickets' own verification tables, and the human review of the three styles.

## Existing SPEC alignment before implementation

- **§3.2 (style and visual practice)** — unchanged and relied on: a style contributes tokens and CSS,
  and this feature adds no per-style file that renders (decision 1).
- **§3.3 (records, statistics, achievements, sound)** — the settings bucket already carries the sound
  switch; no shape change (decision 16).
- **§3.4 (accessibility)** — **amended in place**: the drawer becomes a second exception to "a control
  elsewhere does not swallow movement keys", and the statement that movement keys are handled page-wide
  from load is unchanged in substance (decision 9).
- **§4 (external test seams)** — unchanged: the pure modules are tested in node, the user paths in the
  browser, and the contrast gate in both halves.
- **§6 (out of scope)** — consistent: no new mode, no dependency upgrade, no unrelated refactor, and
  no per-style rule branch.
- **[`docs/mode-contract.md`](../mode-contract.md) §3 (frozen endgame and settlement)** — untouched.
  A run settling while the drawer is open is the existing settlement path, not a new one.
