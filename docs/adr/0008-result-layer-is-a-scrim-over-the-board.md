# The result layer is a scrim over the board, with an opaque card on top

**Status: Accepted; implemented 2026-10-01**

A run pauses three times — reaching the target tile (`won`), deadlocking (`stuck`), settling
(`ended`) — and all three show the same thing today: an opaque panel the colour of the page, laid
over the board. The board the player just built is gone for as long as the layer is up.
The result layer keeps everything the panel already says, gains the four numbers a player wants at
a pause, and stops hiding the board: a semi-transparent **scrim** covers the board, and an opaque
**card** carries title, sentence, readouts and buttons on top of it.

**This is a reversal of a decision already recorded here, not a new development.** Three identical
comments above the three themes' `.overlay` rules and three design-card passages (§6) hold the
opposite position, in almost the same words: use an opaque base rather than a translucent one,
because a translucent layer lets the finished tiles show through, and a tile shown through a
finished position looks like a tile that can still be played.

**Why**: that argument is not dismissed here, it is answered. Tiles showing through were never the
problem; reading them as *live* was. A board dimmed under a scrim does not look like a board waiting
for the next move — it looks like a board held still, which is what a pause is. Opaque cover solved
this by deleting the evidence; dimming solves it by marking the evidence as paused. The difference
shows exactly where the old panel was weakest: at a deadlock the board is the reason to undo rather
than accept, and it was covered; at settlement the final position is the thing worth looking at, and
it was covered.

**Decision**, in three parts:

- **Two elements, not one.** The existing `.overlay` element becomes the scrim — it already is the
  board's absolutely positioned, `inset: 0` sibling — and a new card sits inside it. This is not a
  stylistic preference: two of the three design cards forbid using `opacity` to dim text, because a
  translucent foreground is a different colour that the contrast gate cannot read back from computed
  style. A separate, fully opaque card keeps every existing text and button ratio measurable exactly
  as it is today, which is what makes the change affordable.
- **Three scrim strengths, one per phase, ordered by how much decision is left.** `stuck` is the
  brightest, because the player must read the board to choose between undo, swap and acceptance;
  `won` is between, because the board is a reward to look at and the player is about to return to
  it; `ended` is the darkest, because nothing is left to decide. Same structure, same card, three
  values per style, and each style answers in its own words whether its scrim makes the board
  recede. A veil that leaves the tiles as bright as before has only moved the old argument, not
  answered it.
- **Four new readouts on the card:** this run's score, the best for this mode and style, the number
  of moves made, and a marker when this run is a new best. Title, sentence and buttons are
  unchanged.

**What it trades.** The board becomes legible under the layer — the whole point — and that is a real
cost: a player can now see a position they cannot move. The per-phase scrim strength is what pays
for it, not opacity on the card. The second cost is structural: the card must stay a separate
opaque element, or the contrast gate stops measuring the layer's text at all. No rule, no phase, no
recovery path, no settlement timing, no undo history and no record semantics move.

**Consequences**

- Styles contribute tokens and CSS only. **This is not a fourth presentation slot**, and ADR-0002's
  own test says why: the toast was accepted as a per-style slot on the ground that its behaviour
  surface is narrow enough for one shared test to pin down across all three styles, and the result
  layer fails that test — it binds four actions to the store, walks the full keyboard path, and
  manages focus restoration. A slot would also add one required file to every future style, with ten
  styles queued behind this release.
- The best-score readout describes the run that was played, so it follows the style the run settled
  into after settlement and the current style before it. Records are still written once, at
  settlement, to the style active at that moment.
- The three stylesheet comments and the three design-card passages are rewritten in place to state
  the new decision and to point here. A written argument left standing gets used later to "fix" the
  implementation back into it.
- The two browser contracts that assert the layer's geometry and its z-position are unchanged,
  because they still describe the new layer: it still sits above the board, still matches the
  board's box exactly, still does not push the layout.

**Considered Options**

- Keep the opaque panel and put the new numbers in the header. Rejected: the header already carries
  the live score, and the position that produced it is the thing the panel hides.
- One translucent element carrying everything. Rejected above: it moves the layer's text outside
  what the contrast gate can measure.
- Give each style its own result-layer slot. Rejected above: it fails ADR-0002's slot test and
  raises the cost of every future style.
