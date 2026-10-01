# 一念神魔 is shell, not a fourth slot — and its code is overheard, not a new input mode

**Status: Accepted; 2026-10-01, implementation pending (spec tickets T28–T33)**

A classic console code — up, up, down, down, left, right, left, right — is typed into the board,
and the machine answers: two round buttons appear beside it, one marked A and one marked B. What
follows has three endings, a price, four achievements, confetti, and a button that plants a pair of
tiles.

**This is not a new development; it is the ruling ADR-0008 already made, applied to the next
feature that asked for a slot — and it also overturns one written position in this repository.**
The repository has carried a commented-out button labelled 「一念神魔」 for a while, planted so the
owner could see the win screen without playing eighty moves. The note beside it says a hidden path
is worse than no path, because the next person will mistake it for a feature. That note is exactly
right about a debug hook and exactly wrong about an easter egg. A debug hook is an unearned back
door with no payoff; an easter egg is a payoff with a back door built into its shape. The difference
is not the hiding — it is whether anything on the other side was designed. So the hook is deleted
rather than re-enabled, and the wish button is what it was standing in for. The objection is
answered, not re-asserted.

**Why**, in two parts, because there are two rulings here.

- **Why shell, and not a slot.** A per-style slot is not a default in this project; it is an
  exception ADR-0002 accepted once, for the toast, on one stated ground: 「它的行为面窄到一套
  共享测试能对三套风格逐套钉住」 — narrow enough that one shared contract can pin it down across
  all three styles. The result layer already refused on that ground (ADR-0008), and this feature
  fails it further: it binds two clicks, two countdowns, a keyboard path, focus restoration and a
  mode-specific pause to the same state machine. Two of those are not style business at all. What
  the three styles actually want to say here is small and visual — the two buttons' surfaces, edges
  and shadows, the pinned strip's surface, the wish button's surface, and the twelve dimmed tile
  values — and every bit of it is tokens and CSS. The cost is not symmetric either: ADR-0002 already
  moved the required-items list from five to six for exactly this kind of addition, and every
  future style pays that file again, with the specialty-style queue still waiting behind this
  release.
- **Why the code is overheard.** The alternative is to capture the eight keys and treat them as a
  mode of their own, which means deciding, a second time, what the keyboard does. Three answers are
  already written down: the whole page is the operating area and the arrow keys are always
  `preventDefault`ed; interactive controls inside the board yield to native keys; and `Esc` is
  intercepted only when a swap pick is actually closing. A new input state would have to re-derive
  all three, and the feature has no reason to touch any of them — so the eight presses (the classic
  console code's direction section is itself eight long — two ups, two downs, two lefts, two rights —
  spelled out in full in the first paragraph above) are ordinary moves that the window listener
  already receiving them simply also counts. The one thing `Esc` gains is a second, equally local
  condition, which is what it already is for the swap pick.

**Decision**, in two parts.

- **The easter egg is shared shell.** The buttons, the pinned strip, the wish button and the dim
  are shell elements, driven by one small machine in the renderer. Styles contribute tokens and CSS
  only, exactly as they do for the result layer. There is no `shenmo.tsx`, the required-items list
  stays at six, and the registry's folder check does not learn a fourth slot.
- **The code is passive.** No input mode, no key suppression, no change to the three native-key
  allowances, and no change to the direction table that already maps both the arrow keys and WASD.
  An invalid move already counts as a press. The cost is stated plainly and accepted: because the
  presses really do move the board, 「回到输码之前的状态」 can only ever mean the menu and the code
  buffer. The eight moves stay moved — a player who types the code has spent eight real moves, and
  the run's numbers keep telling the truth about how they played.

**What it trades.** The player cannot be protected from their own typing: half a code clears on a
phase change and on a new run, and a completed one is paid for out of the run. Shell means a style
that wanted the machine to answer differently cannot have one. And because the 「抉择」 does not block
the board, the player can walk away in the middle of it — which is exactly why the first window
expiring grants nothing and says nothing.

**Consequences**

- ADR-0002 gains a line pointing here; ADR-0008's first consequence gains a line deferring to this
  ruling. Both are amended in place, not rewritten — a written argument left standing gets used
  later to "fix" the implementation back into it.
- The easter egg's own state — the code buffer, which stage the choice is at, and the two
  countdowns — is one pure transition function plus a hook in the renderer, no React inside it,
  with the same shape and the same unit seam as the result layer's presence module. The store keeps
  one thing and one thing only: how far the player got through the easter egg this run, because
  achievements are derived from run facts and the run facts are assembled in the store.
- Both countdowns end on `animationend`, not `setTimeout`, for the reason already on the record: a
  test that installs a fake clock freezes the timer queue, and a countdown a test cannot finish is a
  countdown that never fires. Under reduced motion the timer animation stays and only the ring
  disappears — swapping the animation off would leave nothing to listen to, and the menu would never
  collapse.
- The dim on the twelve tile values is a real change to the tile tokens, not a translucent overlay
  laid on top of the board, because the contrast gate reads an element's own computed style and an
  overlay would be invisible to it. Thirty-six new pairs do that measuring; the gate goes from
  sixty-eight pairs to one hundred and four.
- Four achievements, all single-run and self-provable, registered in the order they can happen. The
  achievement registry grows, and every place that states its number is on the spec's sync list.
- SPEC §3.4's keyboard contract is unchanged, and the code is deliberately built so that it could
  not change it. No rule, no phase transition, no record write, no undo entry and no settlement
  timing differs from `docs/mode-contract.md` §3.

**Considered Options**

- A fourth presentation slot (`shenmo.tsx`). Rejected above: it fails ADR-0002's slot test, and it
  raises the cost of every future style by one more required file.
- Capture the eight keys and suppress them while the code is being typed. Rejected above: it is a new
  input mode, it contradicts the whole-page operating area and the three native-key allowances, and
  it would make the code cost the player the eight moves that the spec requires it not to cost.
- Keep the commented debug hook and add the easter egg beside it. Rejected: that leaves the
  repository's own objection standing, and two hidden paths is not one payoff.
- Persist the pinned line so it survives a refresh. Rejected: achievements are not written to
  storage in this project at all, and one easter egg does not get to overturn that.
