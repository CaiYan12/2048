# Achievements are earned inside a single run, and never persisted

**Status: Accepted; implemented (2026-09-28)**

实现落在 `src/game/achievements.ts`（派生判定，注册表七条）、`src/renderer/stores/useGameStore.ts`
（宿主状态机：跃迁 / 收回 / 堆叠）、各风格的 `themes/<id>/toast.tsx`（呈现插槽）与
`src/renderer/stores/records.ts`（容忍未知字段的解码器）。验收证据见
`docs/specs/single-run-achievements.md` 的 Evidence 一节。

An achievement unlocks the moment its condition holds in the run being played. That moment is the
whole of its existence: nothing about achievements is written to storage, nothing survives a
reload, and the congratulations is a per-style toast rather than a line of text left behind on the
page. The rules layer answers one question and no other — does the run in front of the player
satisfy this condition?

**Why**: the previous shape kept an accumulated progress record (highest tile ever reached, most
merges in one run, best Time Attack score, the set of modes won, the length of the daily streak)
in the settlement statistics, and six of the eight achievements read it. That made the achievement
list a second, silent game state with its own restore path and its own reason for the rules layer
to care about persistence. Worse, "have I already got this?" was answerable only from storage, so
a player could not tell from the board in front of them what they had done.

**Consequences**

- Every condition must be provable from the current run. `mode-collector` (win in all six modes)
  and `daily-stand` (settle one Daily on seven consecutive UTC dates) cannot be, so they were
  retired rather than propped up: six of the appendix's achievements remain, with the thresholds
  they always had and wording that says "this run". The registry holds no rows for the retired pair.
  (**2026-09-28, after this decision shipped:** at the owner's request the registry gained a seventh,
  `first-merge` — "this run's first merge", threshold `merges >= 1`. It is not from the appendix, and
  it satisfies the same rule as the rest: a single run proves it. It sits first in the registry
  because it is the earliest milestone available in any run.)
- An achievement id stops being a persisted identity. Retiring one no longer needs a storage
  migration; ids become interface and test identities only. This is the one place where the style
  ids' rule — retirement requires a migration — deliberately does not apply.
- The unlocked set is **derived from run state, not accumulated**: the same run state always
  produces the same set. So undo revokes — undoing the move that satisfied a condition takes the
  achievement back, and satisfying it again counts as a new unlock rather than a repeat.
- One deliberate exception: `style-traveller` counts switches with a counter that does not roll
  back with undo, so once unlocked it stays unlocked for the rest of the run. Making that counter
  undoable would let a player farm congratulations by undoing and switching again.
- The one fact that cannot be read off the state (merges performed this run) is maintained
  incrementally and rolled back by the per-step difference on undo. That keeps it O(1) per step
  and leaves the game state and the stored session shape untouched — a stored shape change would
  drag the decoder's tolerance rules along with it.
- Storage keeps the settlement statistics. Its decoder now **ignores** unknown achievement ids and
  unknown fields instead of rejecting the whole record, so a stale record can never cost the
  player their statistics. Old bytes disappear on their own: the record is rewritten whole at the
  next settlement, so there is no version bump and no migration script.
- The congratulations itself is a per-style toast rendered by the style, and the always-present
  notice component is deleted rather than kept beside it. Its contract belongs to ADR-0002's
  presentation slot.

**Considered Options**

- Keep accumulating progress in memory only. Satisfies "not persisted" literally, but a refresh
  silently resets progress, and streak-shaped conditions become unreachable in practice.
- Persist only an "already congratulated" set. Stops the congratulations from repeating, but it is
  still storage the feature does not need, and it cannot answer "is this unlocked right now" —
  which is exactly the question undo makes meaningful.
- Keep the six cross-run conditions and the progress record, dropping only the notice's
  persistence. Preserves the achievement set, but keeps the achievement list a second game state
  that must be stored, migrated and reasoned about — the thing this decision exists to remove.
- Keep the two impossible-to-prove conditions as permanently suspended rows. Rejected: a row that
  can never light up is a promise the product cannot keep, and the registry already has a
  precedent for retiring achievements without placeholders.
