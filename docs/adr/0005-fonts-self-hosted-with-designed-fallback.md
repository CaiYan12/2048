# 字体自托管，回退是设计态而非事故

字体文件全部放在 `public/fonts/` 作为仓库内本地资源，只用 latin 子集；每个 `@font-face`
都写 `font-display: swap`；每套风格的字体栈由「本地字体名 + 同字形类别的系统回退栈」
组成，并在 `fonts.css` 里集中声明。

**为什么**：项目是「十二套设计语言」的练手项目，字体是风格成立的一半——Terminal 换成
无衬线、Newspaper 换成等宽，风格就没了。所以回退必须**在同类内降级**，而不是掉到系统
默认字体上。`font-display: swap` 只保证不阻塞渲染，它有一个盲区：慢网或 404 时页面静
悄悄用着回退字体，没人知道本地字体来没来。因此补一个 `data-font-state` 三态
（`loading` / `ready` / `fallback`），让主题能在缺字时主动补偿形态。

**Considered Options**

- 引入 Google Fonts CDN：多一次第三方阻塞渲染，且违背纯静态离线可玩的定位。
- 只写 `font-display: swap` 就满足需求：swap 只管「先画回退再换」，管不了「到底失败
  没有」， Terminal 风格缺字时不会知道该补偿。

**Consequences**

仓库多约 340 KB 的 woff2（13 个文件，见 `docs/primal-setup-plan.md` 的字体表）。
`unicode-range` 限定在 latin，所以中文文本（本项目注释与文案含中文）不会触发这些文件，
由系统字体接管——这是有意的，中文不强行套西文字形。
本地字体与系统回退之间一定会有一次视觉替换，这是 `swap` 的代价，可接受。
