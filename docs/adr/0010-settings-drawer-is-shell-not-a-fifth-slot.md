# Settings drawer is shell, not a fifth slot — and it carries its own motion pair

**Status: Accepted; 2026-10-09, implementation pending (parent spec GitHub #38)**

A settings entry appears in the page's top-right corner. It opens a drawer that slides in from the
right edge, covers the page with a scrim while it is open, and takes the whole page out of play —
pointer, keyboard and tab order. Its first tenant is the sound switch that already exists, re-housed
as a labelled row. Everything the README already commits to (saved presets, background music,
per-event sound switches, a god-mode row, language) moves into this shell later.

**This is not a new development either. It is the ruling ADR-0002 already made, applied to the third
feature that asked for a slot — and it adds a second and third ruling that the first two did not
need, both about motion.**

**Why**, in three parts, because there are three rulings here.

- **Why shell, and not a slot.** A per-style slot is not a default in this project; it is an
  exception ADR-0002 accepted once, for the toast, on one stated ground: 「它的行为面窄到一套共享
  测试能对三套风格逐套钉住」. The result layer was refused on that ground (ADR-0008) and the easter
  egg was refused again (ADR-0009). This feature fails the test at least as widely as the easter egg
  did: it binds several store actions, takes pointer and keyboard away from the whole page, manages
  focus in and out, and is explicitly built to hold four more settings that do not exist yet. Two of
  those are not style business at all. What the three styles actually want to say here is small and
  visual — a surface, a radius, a density, two track colours, two thumb colours — and all of it is
  tokens and CSS. The cost is not symmetric either: ADR-0002 has already moved the required-items
  list from five to six, and every future style pays that file again, with nine specialty styles
  still queued behind this release.
- **Why the drawer gets its own motion pair.** The repository's motion posture is 150ms on the
  built-in ease-out, set by T21 for the tiles and deliberately reused by the result layer's card
  (T27) and the easter egg's menu (T35). T21 recorded it as an accepted stability decision and left
  one instruction: revisit it only with fresh frame-level evidence. This is not that evidence — the
  drawer is a different gesture class, not a correction of that one. Its travel is a whole viewport
  width rather than a 4px rise, and the general frontend guidance consulted during design says what
  the house posture deliberately does not say: drawers sit in a longer band than small UI, and the
  built-in easings are too weak to carry a full-width travel. So the drawer takes **250ms in and
  200ms out on `cubic-bezier(0.32, 0.72, 0, 1)`**. The asymmetry is not decoration: the repository
  already carries the same intuition in another projection, in the result layer's card, whose
  departure moves 2px where its arrival moved 4px, recorded as 「落下比升起轻」. The slow half
  belongs where the player is deciding, the fast half where the system is answering.
  **The scope is the drawer, and any future layer that covers the page** — the result layer and the
  menu keep the shared posture untouched, because their acceptance was done against it and is closed,
  and because the reason for a second curve does not apply to a 4px rise and a 2px sink.
- **Why the departure stays keyframe-driven, and its cost.** The alternative is a transition, which
  retargets instead of restarting. It is not free: the arrival would then need `@starting-style` or a
  two-phase render, and the two-phase render is exactly the one-frame flash this project caught on
  the win title (a visible base state painting before the animation attaches). Keeping keyframes
  means the departure is ended by `animationend`, which is the only ending a test with a fake clock
  can finish. The cost is stated and accepted: **closing the drawer inside its 250ms arrival snaps it
  to fully open before it slides out.** The trigger is a player closing within a quarter second of
  opening, and the consequence is one visible bounce.

**Decision**, in three parts.

- **The settings drawer is shared shell.** The entry, the scrim, the drawer, its title and its close
  control are shell elements. Styles contribute tokens and CSS only, exactly as they do for the
  result layer and the easter egg. There is no `settings.tsx`, the required-items list stays at six,
  and the registry's folder check does not learn a fifth slot.
- **The drawer's motion is its own pair, scoped.** 250ms in, 200ms out, on
  `cubic-bezier(0.32, 0.72, 0, 1)`, applied to the drawer and to any future page-covering layer. Both
  values are declared in one place beside the shared 150ms posture, each labelled with the gesture
  class it belongs to, so that two motion values in one file read as a decision rather than drift.
- **The rest of the layer's contract follows the two precedents rather than inventing a third.** The
  leaving flag lands in the same commit as the state change, so pointer input is released on that
  frame (ADR-0008's decision 9). Unmounting is driven by the animation's end event, never a timer
  (the reason both previous layers paid for). Under reduced motion the slide is dropped and only the
  opacity change remains, with the durations unchanged.

**What it trades.** Shell means a style that wanted the drawer to behave differently cannot have one.
A second motion pair means the repository no longer has *one* motion posture — it has one posture for
small movements and one for a page-covering layer, and every future page-covering layer must be able
to say which side it is on. The keyframe choice means a rare, visible snap on an interrupted arrival,
bought in exchange for not introducing a new entry mechanism. And because the drawer denies the page
all input, the click-outside affordance is unavailable on a narrow viewport where the drawer is
full-bleed — which is why the close control is not optional and why `Esc` is wired to it.

**Consequences**

- ADR-0002 gains a line pointing here as the **third** refusal of the same request. ADR-0008's and
  ADR-0009's consequences gain a line each, deferring to this one for the same reason those two
  defer to each other. All three are amended in place, not rewritten — a written argument left
  standing gets used later to "fix" the implementation back into it.
- **The three design cards carry the look, not this ADR and not the spec.** Each gains a section for
  the entry, the drawer surface and the sound row, and each answers "what makes this one different
  from the other two" in its own terms: Classic uses its dark control surface with no shadow,
  Material its tonal surface with the same elevation group as its toast, Claude the brighter paper its
  own board is made of plus the hairline that board is outlined with. The three styles therefore do
  not share a drawer surface, which is the point rather than an oversight.
- **Two of the three styles need their switch's thumb to change colour between states**, and the
  reason is arithmetic rather than taste: a single thumb colour must clear the non-text floor against
  *both* track colours, and on Claude the dark ink against the warm selected fill lands at 2.68:1.
  Classic is the one style where a single thumb colour works. **No style's palette gains a colour
  value** — what is new is role names.
- **The contrast gate's scene list grows by one**, because none of the existing scenes has the drawer
  open. Both layers of the gate learn it: the declared-value layer's scene list and the
  computed-style layer's scene setup, exactly as T26, T29, T30 and T32 each taught the gate their own
  scene. The gate's own check that every declared scene has someone measuring it means the new scene
  cannot be registered without a pair in it.
- **Claude pays two colour combinations that the other two styles do not**, because its drawer
  surface is the board's paper, which has never carried text before. The two combinations are
  recorded in that card with their ratios; the alternative — using the page colour, as that style's
  toast does — would cost none, and remains available if the surface ever needs to be cheapened.
- SPEC §3.4 is amended in place: the drawer becomes a second exception to 「a control elsewhere does
  not swallow movement keys」. No rule, no phase transition, no record write, no undo entry and no
  settlement timing differs from `docs/mode-contract.md` §3.

**Considered Options**

- A fifth presentation slot (`settings.tsx`, or one file per visual part). Rejected above: it fails
  ADR-0002's slot test by a wider margin than either previous refusal, and it raises the cost of every
  future style by one more required file.
- Keep the shared 150ms posture for the drawer. Rejected: a full-width travel and a 4px rise are not
  the same gesture, and the general guidance consulted in design says so explicitly. The cost of
  keeping it would be a drawer that reads as a glitch rather than a transition — and the cost of
  splitting it is two documented values instead of one, which this ADR pays.
- Use a transition for the drawer so it retargets when interrupted. Rejected: it needs
  `@starting-style` or a two-phase render for the arrival, and this project has already been bitten
  by the two-phase render once.
- Make the drawer's scrim a newly-tuned value. Rejected: the result layer's three scrim strengths are
  already ranked by how much decision is left, and a drawer leaves none, so the darkest tier's value
  is the right one — and a scrim is a backdrop colour and not a text foreground, so it enters no
  contrast table. The cost, if the settled value reads too heavy over a whole viewport, is a
  revision with evidence.
- Hold the timed run's clock while the drawer is open. Rejected: the one hold on the record exists
  because that window is *imposed by the game*; opening settings is the player's own choice, and the
  game should not pay for a choice the player made. Time spent in the drawer is time spent, and that
  is stated in the spec rather than hidden.
