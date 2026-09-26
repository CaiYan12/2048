# 风格是一个文件夹，棋盘渲染固定结构 + 装饰插槽

每套风格是 `themes/<id>/` 下的 `tokens.css` + `styles.css` + `config.ts`；棋盘组件只渲染
一套固定 DOM 结构，另留两个装饰插槽（`boardOverlay` / `tileOverlay`）交给风格填。

**为什么**：Material 的高程阴影、Frutiger Aero 的玻璃 gloss、Terminal 的 CRT 扫描线、
Web 2000 的斜面边框，它们之间差的是**结构**不只是颜色——单纯换 CSS 变量做不出这十来套。
但让每套风格替换整块 React 组件树，又会让十来份平行实现各自腐烂、bug 修十来遍。固定
结构 + 插槽是这两者之间唯一站得住的位置。

**Considered Options**

- 只换 CSS 变量：十二套风格里的大半会被砍残，Aero 的 gloss 和 Terminal 的扫描线直接
  做不出来。
- 风格自带组件：平行实现，作弊交换、撤销历史、键盘与 `aria-live` 全要重接十来遍，
  加新风格的门槛会高到没人加。

**Consequences**

加一套风格 = 加一个文件夹，引擎零改动。但风格**不能**把棋盘变成 ASCII 字符画这类结构性
改写——这是这套机制明确划出的边界，不是缺陷。
