# T40 收尾：共享契约、四处修订与全量验收

- 状态：未开始（GitHub [#42](https://github.com/CaiYan12/2048/issues/42)）
- 类型：vertical
- 原计划阶段：README TODO · 设置界面引入（第一刀）
- 父级规格：[`docs/specs/settings-drawer.md`](../specs/settings-drawer.md)（GitHub [#38](https://github.com/CaiYan12/2048/issues/38)）
- 本票对应：验收标准里「Across the three styles」「Things that must not have moved」两组，
  加 Test strategy 的共享契约与人眼复核两条
- Blocked by: T38（GitHub [#40](https://github.com/CaiYan12/2048/issues/40)）、
  T39（GitHub [#41](https://github.com/CaiYan12/2048/issues/41)）

## 交付范围

收口。一条共享契约对三套风格各跑一遍抽屉的全部不变量；四处就地修订落地；四道闸门与全量跑完；
三套风格在桌面与手机上人眼复核。

## 验收标准

- [ ] 一条契约 spec，三套风格各跑一遍：四条开合路径、遮罩吃掉页面上每一个可交互面、
      键盘被吞掉但仍被消费、`Tab` 留在抽屉里、焦点进出、被扣下的那一页与结果层在场时行为一致、
      退场第一帧就还指针、假时钟下不卡住。
- [ ] 一条「作用域没有漏」的检查：结果层与彩蛋菜单的 150ms 值未被改动。
- [ ] `SPEC.md` §3.4 就地修订：抽屉成为「页面别处的控件不吞移动键」的第二个例外。
- [ ] 外壳那条 `pageCleared` 注释与 `GLOSSARY.md`「二念」条的说法一致（后者已在本次会话修订：
      那一页现在还有设置入口）。
- [ ] `README.md` 该组标状态；`AGENTS.md` 加一节带日期的状态（照既有状态小节的形状）。
- [ ] 四道闸门：`npm run typecheck` 0 错、`npm test` 全绿、`npm run build` 通过、
      `npm run check:contrast` 三套风格（对数以实际为准，当前基线 **131 对**）；全量 Playwright
      （后台、headless）**0 failed**，`game.spec.ts` 按既有做法另跑 `--repeat-each=4`。
- [ ] 人眼复核：三套风格 × 桌面 / 手机，看入口、抽屉、开关，以及**被打断的那一次进场弹跳**
      （250ms 内又关掉）。
- [ ] Evidence 回填到这一组的每一张票，并写明**没有**被验证的是什么。

## 验证

未做。

## Evidence

未做。
