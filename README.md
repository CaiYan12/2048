# 2048

A 2048 implementation.

> 🚧 **Scaffolding stage — no game code yet.**
> This repository currently holds the *working setup* for an agent-driven
> development workflow. The game itself has not been written.

## What's here now

| Path              | What                                                                          |
| ----------------- | ----------------------------------------------------------------------------- |
| `AGENTS.md`       | Agent-skill wiring: issue tracker, triage labels, domain docs                  |
| `docs/agents/`    | Per-repo config the engineering skills read                                    |
| `.gitignore`      | Agent tooling workspaces, IDE state, build and test artifacts                  |
| `LICENSE`         | MIT                                                                            |

## Workflow

Issues are tracked in [GitHub Issues](../../issues).

The project is built with [Matt Pocock's agent skills](https://github.com/mattpocock/skills),
installed as the `mattpocock-skills` Claude Code plugin. The per-repo conventions those
skills follow — how to read and write the issue tracker, the triage label vocabulary, and
how domain documentation is organised — are documented in [`docs/agents/`](docs/agents/).

## License

[MIT](LICENSE) © WindowsIt
