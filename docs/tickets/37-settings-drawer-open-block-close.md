# T37 设置抽屉：打开、拦住、关掉，回到原处

- 状态：已完成（GitHub [#39](https://github.com/CaiYan12/2048/issues/39) 未在本阶段更新）
- 类型：vertical
- 原计划阶段：README TODO · 设置界面引入（第一刀）
- 父级规格：[`docs/specs/settings-drawer.md`](../specs/settings-drawer.md)（GitHub [#38](https://github.com/CaiYan12/2048/issues/38)）
- 裁决：[ADR-0010](../adr/0010-settings-drawer-is-shell-not-a-fifth-slot.md)
- 本票对应：验收标准里「The entry」「Opening and blocking」「Closing」「The drawer's shape」
  「Focus and assistive technology」五组
- Blocked by: 无

## 交付范围

从玩家角度：右上角那颗齿轮能打开一层设置，打开之后整页都不听他的（指针、键盘与 Tab 顺序
一起），三种方式能关掉，关掉之后回到他离开时的样子——正在打的一局还在打、结果层还在、
被扣下的那一页还是被扣下。**这一票先做硬切**：开合即挂载与卸载，动效是 T38。

结构上要先把页面内容收进一个包裹元素（零行为变化的一步前置），遮罩与抽屉留在那个包裹之外、
仍在 `<main>` 里，`data-style` 令牌才照旧继承。

## 验收标准

- [x] 入口在开局界面、局中、结果层在场、二念扣下时都在同一个位置，只在读档中（`restoring`）隐藏。
- [x] 入口是纯图标按钮，可访问名是设置，命中区 3rem，报出开着还是关着（`aria-expanded`），
      且**只有 hover / 焦点环 / 开着三个状态**（不加按下反馈、hover 不门控）。
- [x] 入口的图形是一份三套共用的内联 SVG，颜色走 `currentColor`，不新增任何色对、
      不新增任何按风格的文件。
- [x] 打开之后，页面上每一条指针路径都落在遮罩上：棋盘、方向键、滑动面、新游戏、战绩入口、
      结果层的按钮。
- [x] 打开之后，方向键 / WASD / Z 既不推棋也不撤销也**不滚页面**（先 `preventDefault` 再吞掉），
      文本入口仍拿得到自己的键。
- [x] `Tab` 到不了遮罩后面的页面（页面内容 `inert`），而 Toast 栈 / 悬顶 / 礼炮**不在**
      被 inert 的那一块里。（Toast 与礼炮那两半在 T40 由结构证据升成断言。）
- [x] 三种关法都通：点外侧、抽屉里的「收起」、`Esc`；且抽屉开着时 `Esc` 关的是抽屉，
      不是底下的交换摊或神魔摊。（神魔摊那半条由 T40 补上。）
- [x] 关掉之后页面回到离开时的状态；指针在**开始退场那一帧**就还回去了。
- [x] 焦点：打开时落在**容器**上（不是关闭按钮——一次误敲回车会当场关掉），关闭时回到入口，
      判据是「焦点真的掉了」。
- [x] 抽屉是 `role="dialog"` + 一个名字；`aria-modal` **不加**（`inert` 已经说了同一件事）。
- [x] 抽屉形状：贴右边缘、铺满高度、宽 `min(22rem, 100vw)`，窄屏铺满整屏。
- [x] 既有契约一条都不许为它改绿：键盘作用域（`game.spec.ts` 的方向键那两条）、
      结果层那两条几何、toast 契约、主题契约。
- [x] SPEC §3.4 的箭头键断言新增一例：抽屉开着时方向键被吃掉、`scrollY` 不动、滚轮照旧能滚。

## 验证

见父规格 Evidence 与 T40 的收官数字：`settings-drawer.spec.ts` 对三套风格各跑一遍（× 桌面 /
Pixel 5），四道闸门与全量 Playwright 全绿。

## Evidence

本票交付的抽屉前半（入口、打开、拦住、关掉、回到原处）全部落地在 `settings-drawer.spec.ts`
与 `src/renderer/components/SettingsDrawer.tsx` / `SettingsPresence.ts`；逐条断言在文件头部的
契约清单 1–9 里与票据验收标准一一对应。`inert` 挂在页面内容那个 `display: contents` 的包裹元素
上（零布局变化的前置）。**人眼复核没做**（headless 约定，见 T40 与父规格）。
