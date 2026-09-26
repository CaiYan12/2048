# Subagent Supervision

How to judge whether a dispatched subagent is progressing, stuck, or violating a constraint —
without asking the human to notice it for you.

## The principle

**Wall-clock is not the signal. File activity is.** A 40-minute ticket is legitimate; a 13-minute
run that has written one scratch file is not. The question is never "has it been long?" but
"has anything landed on disk recently?"

## The cadence

Check every dispatched agent on a fixed interval — **every 5 minutes** is the default for this
repo's ticket sizes (implementers run 20–40 min; a stall is expensive after ~13). Between checks,
keep doing your own work; the check is meant to be a few seconds.

A check is not a status report to the human. Most checks end in "still progressing, no action".

## What to look at, in order

Run the probe:

```
node scripts/subagent-watch.mjs --since-minutes N
```

It reports HEAD, files under `src/` and `tests/` modified in the last N minutes, the dirty tree, and
whether any automation Chrome is running. Then combine it with `ListAgents` for elapsed time.

| Signal | Reading | Action |
| --- | --- | --- |
| Files landing | Progressing | None. |
| No writes for ~10 min | Possibly grinding | One short message: what are you working on right now? |
| No writes for ~15 min | Stuck or looping | Stop it. Diagnose, then re-dispatch. |
| Only scratch files landing | Attacking a sub-problem | Confirm it is the *primary* problem, not a secondary one it should defer. |
| `git status` dirty but no new writes for a while | Mid-edit, possibly stuck on one hunk | Ask what specifically is blocking. |

## Diagnose before re-dispatching

Stopping without a diagnosis just burns the agent's context. Three causes, three different fixes:

1. **The mandate was too broad.** Symptom: the agent ran 9+ minutes without returning and ignored a
   status ping. Fix: re-dispatch with a **priority tier** — "Priority 1 gets most of the budget,
   Priority 3 only if time remains" — and tell it explicitly not to re-verify what you already
   verified yourself.
2. **You gave it an impossible or under-specified task.** Symptom: a scratch script full of
   candidate values and no source writes. Fix: **solve the problem yourself first**, then hand the
   answer over. If the task was "find an X satisfying constraints A and B", check A and B are
   jointly satisfiable *before* dispatching — not after watching an agent prove otherwise.
3. **It is genuinely stuck on the code.** Fix: resume it (`SendMessage`) if its context is still
   valuable, or re-dispatch fresh with the specific blocker named.

## Before re-dispatching, check what it already produced

A stopped agent's working tree survives. Read it before discarding: an agent that pivoted correctly
and built the right derivation harness is worth *resuming*, not replacing. Resume preserves its
file-reading context; a fresh agent pays for that again.

## The browser constraint is checked every time

The owner works on this machine while agents run. A visible browser window steals their keyboard
focus, so browser automation must be backgrounded and headless.

**A dispatch prompt's blacklist is not sufficient.** `--headed` / `--debug` / `--ui` bans do not
cover browser-driving MCP servers such as `chrome-devtools-mcp`, which **default to a visible
window** and happily run inside an agent that was told to stay headless. So:

- every dispatch states: no browser-driving MCP, no Puppeteer, nothing that opens a real window —
  and if you think you need one, **ask first**;
- every supervision check runs the process probe. The discriminator is **not** "does the command
  line contain `--user-data-dir`" — the owner's own Chrome contains it, pointing at the *default*
  profile. It is "is that path the default `Google/Chrome/User Data` directory". Anything else is
  automation;
- if one is found, kill it **by PID**, and never touch the default-profile Chrome. A false positive
  here means closing the owner's browser;
- if the probe cannot run, say so rather than assuming compliance.

## When you find a violation you caused

Report it plainly, correct the record, and fix the mechanism. An unattributed "a subagent broke the
rules" is worse than useless if the cause was your own dispatch: check ownership before naming a
culprit. In this repo that has happened once — a visible Chrome was found and blamed on the review
agent, which denied it with a specific command log, and the process evidence (an independent
`chrome-devtools-mcp` profile) supported the denial. The window belonged to another session on the
machine.

## Recording it

Every intervention goes in the SDD ledger: what the signal was, what you concluded, what you did,
and what it costs if the conclusion was wrong. The ledger is what survives compaction; a stall you
noticed and fixed without recording is a stall the next session repeats.
