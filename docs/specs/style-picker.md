# Spec: 风格选择搬进设置抽屉（README TODO「设置界面引入」第二条）

**Status:** Drafted 2026-10-09 — **not implemented**. Single ticket (T42). Parent context:
`docs/specs/settings-drawer.md` (its Out of scope promised this "gets its own ticket, after this one").
**Date:** 2026-10-09
**Decisions:** no new ADR — the move is reversible and the reasoning lives here (ratified in grilling,
`.codex/memories/style-picker.md`). The drawer stays shell per ADR-0010; this adds a tenant, not a slot.

## Problem Statement

Mid-run, the only way to change the presentation style is the three buttons in the main panel —
a page-resident control for what is functionally a setting. The settings drawer now exists and is
the in-run home for settings, but it carries only the sound row. Style is the README group's second
commitment: "把主面板的风格选择移进设置".

## Solution

The settings drawer gains a second row: a static label 「风格」 and a trigger button showing the
current style's name. Activating it opens a self-drawn dropdown list — a trigger plus a popped-open
option list built from the style registry. The list is keyboard-complete (arrows, Home/End, Enter,
Esc), returns focus where it came from, and layers correctly under the drawer's own Esc. The main
panel's style entry is removed; the start screen's button group stays. Changing a style from the
open drawer re-skins the whole page live — board, tiles, fonts — without closing anything.

## User stories

1. As a player, I want a style control inside the settings drawer, so that style lives with the
   other settings instead of on the page.
2. As a player, I want the trigger to show the current style's name, so that I can see which style
   is active without opening anything.
3. As a player, I want to open the list by pressing the row's label too, so that the whole row is
   one target (the same intent the sound row states).
4. As a player, I want the list to offer exactly the registered styles, so that the options can
   never drift from the actual capability.
5. As a player, I want the active style marked in the list, so that I can tell which option is
   current before choosing.
6. As a keyboard player, I want focus to land on the selected option when the list opens, so that
   my place is kept and the next `ArrowDown` moves from there.
7. As a keyboard player, I want `ArrowUp`/`ArrowDown` to move between options and `Home`/`End` to
   jump to the ends, wrapping, so that three options are fully reachable.
8. As a keyboard player, I want `Enter` (or a click) to choose the focused option, so that
   selection is one step.
9. As a keyboard player, I want `Esc` on an open list to close just the list and put focus back on
   the trigger, so that a mis-key doesn't tear down the whole drawer.
10. As a keyboard player, I want `Tab` on an open list to close it and move on, so that Tab order
    never strands me inside a popup.
11. As a keyboard player, I want `Esc` on a closed list to still close the drawer, so that
    "topmost layer answers `Esc`" keeps being true — list above drawer above the trays underneath.
12. As a player, I want the arrow keys to never scroll the page while the list is open, so that
    "the page only scrolls with the wheel" survives the new control.
13. As a player, I want the style change to apply immediately — board, tiles, fonts — while the
    drawer stays open and keeps focus, so that switching is its own live preview.
14. As a player, I want the trigger's name to update the moment I choose, so that the control
    always tells the truth.
15. As a player, I want the main panel's style buttons gone, so that the page carries one fewer
    control and settings is the single in-run home for style.
16. As a player, I want the start screen's style buttons to stay as they are, so that the
    choose-mode-then-style-then-start flow remains one screen.
17. As a screen-reader user, I want the trigger to expose expanded/collapsed and the list's options
    by name with the selected one marked, so that the control is operable without sight.
18. As a player mid-run, I want switching a style to keep touching only presentation — no score, no
    board state, no undo, no timers — so that the domain promise behind "style is pure presentation"
    holds from the drawer too.
19. As a player, I want the list's options read in the same order everywhere, so that the registry
    order is the interface order.
20. As a tester, I want the six duplicated `pickStyle` copies replaced by one shared helper, so that
    the next e2e that needs a style stops copying.

## Implementation decisions

1. **Only the main-panel instance moves.** The start screen keeps its button group
   (`role="group"` + `aria-pressed`), because that screen is the choose-then-start flow and the
   README commits only "主面板的风格选择". After the move, exactly one `group` named 「风格」
   remains in the DOM (start screen), so the existing role query stays unambiguous.
2. **The drawer's control is a self-drawn listbox** — a trigger button plus a popped-open list —
   owner's ruling. A native `<select>` was rejected because its option surface is OS-rendered and
   cannot be skinned by the three styles; reusing the button group was rejected because the owner
   wants a dropdown. The cost is accepted: this is the repo's first hand-written focus-managed
   widget, and its keyboard contract is specified here and tested below.
3. **Row grammar copies the sound row**: a static `<span id>` label 「风格」 on the left, referenced
   by `aria-labelledby` as the trigger's accessible name; the trigger on the right is a `.control`
   showing the current style's name with `aria-expanded` + `aria-haspopup="listbox"`, and no
   `aria-pressed` (expansion is said by `aria-expanded`, the same judgement as the drawer entry).
   The whole row is clickable — pressing the label opens the list; stated, testable intent, not a
   `<label>`'s silent forwarding.
4. **Options grow from the registry** (`THEMES`), same reason as the existing picker: the list is
   the capability. Option name = the theme's label; the selected option carries `aria-selected`.
   Three items, no scrolling.
5. **Focus enters the list** (W3C APG listbox shape): opening moves DOM focus onto the *selected*
   option; `ArrowUp`/`ArrowDown` move real focus between options and `Home`/`End` jump to the ends,
   **wrapping**; `Enter` chooses; `Esc` closes and returns focus to the trigger; `Tab` closes the
   list and continues. `aria-activedescendant` was rejected: id bookkeeping and screen-reader
   correctness for a hand-written first — real focus is directly observable and testable.
6. **Three-layer `Esc` priority: list > drawer > the trays underneath.** While the list is open,
   `Esc` closes only the list (focus to the trigger); with the list closed, `Esc` closes the drawer
   exactly as before. This **amends the drawer spec's decision 9** in place. The list's open state
   is held at the same dispatch point as the drawer's (one keydown dispatcher, one priority chain —
   not a second listener racing it).
7. **Second released-keys exception**: with the list open, `ArrowUp`/`ArrowDown`/`Home`/`End`
   belong to the list — the component consumes them (preventDefault, no board, no page scroll).
   With the list closed, the drawer's existing rule applies unchanged (movement keys swallowed).
   This extends SPEC §3.4's exception list: text entries (first), the open list (second).
8. **Pointer outside the list but inside the drawer closes the list**, not the drawer; the scrim
   keeps closing the drawer (which unmounts the list with it). No nested-scrim is introduced —
   "outside" for the list means "a press the list did not consume, inside the drawer".
9. **Switching a style while the drawer is open changes only `data-style`** — the drawer itself
   re-skins (surface, radii, switch colours) with no unmount and no focus loss; the font state
   machine reruns along the path ADR-0005 already requires for restore. The list closes on choose
   (selection made), focus returns to the trigger showing the new name.
10. **The list gets no entrance animation in this slice.** It is a state change inside an open
    layer, not a layer; the drawer's 250/200 scope (ADR-0010) is untouched, and nothing new joins
    the house's motion inventory.
11. **Settlement under an open list auto-closes nothing** — the drawer's own ruling extended one
    layer down: `Esc` (list) → `Esc` (drawer) → result layer. No mechanism, no dead end: the list
    is inside a layer the player opened.
12. **No preview**: options are names only, exactly as the current picker is. Thumbnails stay the
    T14 story.
13. **The shared e2e helper module is created by this ticket** — the standing commitment from the
    review-fix phase that this move is its moment. `openSettings` / `closeSettings` / `pickStyle`
    move into one module; the six per-file copies of `pickStyle` are deleted, and every migrated
    caller goes through the drawer path (open → trigger → option → close). The start-screen
    group's own tests keep their local query.
14. **Colour values: only new role names, no new colour values** — the standing principle. The
    list's surface is the drawer face, option text is the style's title ink, the focused option
    takes the style's `--control-bg-hover`, and the selected option takes the style's
    `--control-bg-selected` with its bright ink — so focus is always visible as one of two
    backgrounds (hover unless it is the selected option). All three styles already declare a hover
    token. Per-style specifics (radii, paddings, exact roles) go to the three design cards §12;
    the contrast gate grows by roughly three pairs per style, counted for real at implementation.

## Testing decisions

- **Unit (node, no React):** the highlight mover — pure function from (current index, key, count)
  to the next index, wrapping, `Home`/`End` pinned. Precedent: the presence modules' tests. The
  field-table contract in `style-switch.test.ts` is untouched and must stay green unchanged.
- **Browser (Playwright, background, headless):** one per-style contract for the row and the list —
  trigger semantics (`aria-expanded`, `haspopup`, name), whole-row click, focus landing on the
  selected option, arrows/Home/End/wrap, Enter chooses and closes, `Esc` layers (list → drawer →
  trays), Tab-out closes, switch updates trigger + board without closing or blurring, the main
  panel mount is gone, the start-screen group still exists and is the only `group` named 「风格」.
  Reuses the shared helpers this ticket creates. The drawer contract's pointer-path entry for the
  page's style buttons is updated by the same ticket.
- **Contrast gate, both halves:** the `settings` scene gains the listbox pairs (option text vs the
  list surface; option text vs the focused background; the selected option's pair), with a probe
  action that expands the list first — the `probe.toggle` pattern extended. Declaration side and
  computed-style side move together, as the closed `SCENES` list and the two-way assertions
  require.
- **What makes a good test here:** the list is exercised as a user reaches it — open drawer, press
  the row, keys — never by reaching into component state.

## Out of scope

- The README group's remaining items: presets, background music, per-event sound dropdowns, god
  mode, language.
- Thumbnail preview in the list (T14's story, unchanged).
- Redesigning the start screen's button group; a native `<select>` anywhere.
- Any entrance animation for the list (decision 10).
- The rules kernel, phase machine, recovery, settlement timing, records — untouched by definition
  (style is presentation; the field-table unit test pins it).

## To sync when the implementation lands

- `README.md`: the settings group's second item checked, with a status line; the wording
  「风格下拉框」 stays accurate (a trigger plus a popped list *is* a dropdown) — the canonical term
  is 「风格选择」.
- `AGENTS.md`: a dated status line on the settings section.
- `docs/specs/settings-drawer.md`: the decision 9 amendment gets its `(amended …)` date marker.
- The three design cards §12: the listbox section (roles per style).
- `GLOSSARY.md`: the 「风格选择」 entry lands with the implementation (written at grilling time).
- `.design-flow.json`: history for this slice.

## Evidence

- Owner rulings (two grilling rounds, 2026-10-09): self-drawn listbox over button-group reuse and
  native select; focus enters the list; three-layer Esc priority; mute-row grammar; independent
  spec; single ticket, no ADR. Recorded in `.codex/memories/style-picker.md`.
- Fact base: the picker is a button group mounted twice (start screen + main panel); `pickStyle`
  exists as six per-file copies; `style-switch.test.ts` pins the switch's field table; all three
  styles declare `--control-bg-hover`; the contrast gate stands at 141 pairs.
- Numbers: this spec is GitHub issue #44; its ticket is **T42 = #45**.

## Existing SPEC alignment

- `docs/specs/settings-drawer.md` decision 9 — **amended in place** by decision 6 here (the third
  Esc layer); its Out-of-scope promise is fulfilled by this document.
- SPEC §3.4 — extended by decision 7 (second released-keys exception), same in-place pattern as the
  drawer's first exception.
- ADR-0010 — untouched: the drawer is still shell; this adds a tenant to it.
- GLOSSARY — 「风格（呈现轴）」 unchanged (pure presentation, mid-run switching, settlement credits
  the style in use); a new 「风格选择」 entry records the concept and its two shapes.
