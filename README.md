# 2048

A 2048 variant collection whose real payload is its **style system** — twelve completely
different design languages running on one rules core.

> 🚧 **Design complete, implementation not started.**
> The requirements, domain model, and architecture decisions are settled
> ([`docs/primal-setup-plan.md`](docs/primal-setup-plan.md)). No game code exists yet.

## What it is

Two orthogonal axes:

- **Mode** (rules) — 6 modes: Classic, Fibonacci, Big Board, Walls, Daily, Time Attack
- **Style** (presentation) — 12 styles: Classic, Material, Claude Design, Frutiger Aero,
  Web 2000, Terminal, Win10 Metro, Win98, Aqua, Cyberpunk, Bauhaus, Newspaper

Any style can be applied to any mode, and styles can be switched mid-game.

The project exists to practise frontend craft. Balance is explicitly **not** a goal —
undo is unlimited, records are local toys, and there is a cheat button that swaps two
tiles.

## What's here now

| Path                       | What                                                              |
| -------------------------- | ----------------------------------------------------------------- |
| [`CONTEXT.md`](CONTEXT.md) | Domain glossary. Terminology is enforced — see its `_Avoid_` list  |
| `docs/primal-setup-plan.md`| The execution blueprint: P0–P10, mode table, style list, directory structure, verification gates |
| `docs/adr/`                | Four architecture decisions, each with the trade-off that produced it |
| `AGENTS.md`                | Coding rules, tech stack, two hard architectural constraints       |
| `docs/agents/`             | Per-repo config the engineering skills read                        |
| `LICENSE`                  | MIT                                                                |

## Architecture in one paragraph

`src/game/` is pure logic with zero DOM references and an injectable RNG.
`src/renderer/` is React 19 + Tailwind. A **style is one folder** —
`tokens.css` + `styles.css` + `config.ts` — applied against a fixed board structure
with two decoration slots, so adding a style never touches the engine. The board and
tile layer deliberately does *not* use Tailwind utilities; Tailwind only dresses the
chrome around it. See [ADR-0002](docs/adr/0002-style-as-folder-with-decoration-slots.md).

## Workflow

Issues are tracked in [GitHub Issues](../../issues). The project is built with
[Matt Pocock's agent skills](https://github.com/mattpocock/skills), installed as the
`mattpocock-skills` Claude Code plugin; the per-repo conventions those skills follow
are documented in [`docs/agents/`](docs/agents/).

## License

[MIT](LICENSE) © WindowsIt
