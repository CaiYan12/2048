# 2048

A 2048 variant collection built to practise frontend styles on one rules core. The first
release targets three baseline styles; specialty styles are future work.

> 🚧 **SPEC and local tickets drafted; game implementation not started.**
> Scope and acceptance are in [`docs/SPEC.md`](docs/SPEC.md). The original stages and
> decisions remain in [`docs/primal-setup-plan.md`](docs/primal-setup-plan.md).

## What it is

Two orthogonal axes:

- **Mode** (rules) — 6 modes: Classic, Fibonacci, Big Board, Walls, Daily, Time Attack
- **Style** (presentation) — first release: Classic, Material, Claude Design

Any style can be applied to any mode, and styles can be switched mid-game.

The project exists to practise frontend craft. Balance is explicitly **not** a goal —
undo is unlimited, records are local toys, and there is a cheat button that swaps two
tiles.

## What's here now

| Path                       | What                                                              |
| -------------------------- | ----------------------------------------------------------------- |
| [`CONTEXT.md`](CONTEXT.md) | Domain glossary. Terminology is enforced — see its `_Avoid_` list  |
| `docs/primal-setup-plan.md`| The original P0–P10 blueprint and its ticket mapping |
| `docs/SPEC.md`           | Buildable behavior, user stories, architecture and verification contract |
| `docs/tickets/`          | Small, dependency-linked implementation tickets with acceptance checks |
| `docs/adr/`                | Five architecture decisions, each with the trade-off that produced it |
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

Issues are tracked in [GitHub Issues](https://github.com/CaiYan12/2048/issues). The project is built with
[Matt Pocock's agent skills](https://github.com/mattpocock/skills), installed as the
`mattpocock-skills` Claude Code plugin; the per-repo conventions those skills follow
are documented in [`docs/agents/`](docs/agents/).

## TODO（远期规划）

先完成 Classic、Material、Claude 的切换与 3 × 6 组合验收，再逐套决定是否实施下列特色风格。以下仓库是在 2026-09-26 核对过的**设计研究参考**，本次不安装依赖、不复制素材；将来使用代码、字体或图像前分别复核其许可证与项目约束。

- [ ] **Terminal** — [Terminalize](https://github.com/pabletos/terminalize)（MIT）：研究终端面板、等宽排版及可选屏幕效果。
- [ ] **Frutiger Aero** — [frutiger-aero-everywhere](https://github.com/TheAgencyMGE/frutiger-aero-everywhere)（MIT）：研究 glass/gloss 层次和不改变原有布局的装饰策略。
- [ ] **Web 2000** — [GeoCities Web 1.0](https://github.com/NovusGFX/retro-design-system/blob/main/styles/14-geocities-web10/index.html) 与 [Y2K Chrome](https://github.com/NovusGFX/retro-design-system/blob/main/styles/50-y2k-chrome/index.html)（同属 MIT 项目）：分别研究早期网页排版与千禧年镀铬效果。
- [ ] **Win10 Metro** — [Metro UI](https://github.com/olton/metroui)（MIT）：研究平面磁贴、字体层级及响应式组件组织。
- [ ] **Win98** — [98.css](https://github.com/jdan/98.css)（MIT）：研究窗口、按钮、边框和控件状态的经典 Windows 视觉语法。
- [ ] **Aqua** — [Aqua](https://github.com/igorfelipeduca/aqua)（MIT）：研究凝胶按钮、条纹和金属窗口的层次；只作视觉参考，不引入其 shadcn 组件体系。
- [ ] **Cyberpunk** — [cyberpunk-ui](https://github.com/laddtnov/cyberpunk-ui)（MIT）：研究色彩 token、发光边缘和动效的静态替代。
- [ ] **Bauhaus** — [Hammhaus](https://github.com/g3hamm/hammhaus)（MIT）：研究纸张、原色、几何和海报式排版的 token 系统。
- [ ] **Newspaper** — [the-lamplighter](https://github.com/starinzlob/the-lamplighter)（代码 MIT，字体 OFL）：研究报纸网格、纸张纹理及中英文字体层级。
- [ ] 在对应风格上线后再实现 `全风格征服` 与 `复古大师`；当前版本只实现九个模式轴成就与 `风格旅行者`。

每个远期风格都需先写自己的 `DESIGN.md`，沿用固定 Board 与两个装饰插槽，并单独通过对比度、桌面/手机视觉和交互验收。参考仓库的设计语言不等于本项目可以直接复制其组件树。

## License

[MIT](LICENSE) © WindowsIt
