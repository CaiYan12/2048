/**
 * `?seed=` 调试缝的解析：查询串 → 种子
 *
 * 与 `fixture.ts` 的 `fixtureFromQuery(query, ...)` 同一条性质：**吃一个 query 串的
 * 纯函数**，window 由调用方（store）传进来。窗口只留在 store 一侧，这里不碰 DOM，
 * 于是这条缝本身可以被单测直接驱动（`tests/unit/seed-query.test.ts`）。
 *
 * 为什么要单独拎出来：T04 起这条缝就读过一次 `Number(...)`，而
 * `Number(null) === 0`、`Number.isInteger(0) === true`——「参数缺失」因此被读成
 * 「seed=0」。浏览器里每一局不带 `?seed=` 的开局都从种子 0 开始（盘面每次一模一样，
 * `drawSeed()` 永远走不到），而所有 fixture 都显式带 `?seed=` 或 `?board=`，所以
 * 一条断言都没看见它，从 T04 一路存活到 T08。**测试缝自己必须可测**，否则它正是
 * bug 最能藏身的地方。
 *
 * 本项目无服务器、无排行榜、也不主张竞技公平（SPEC §6），所以它是调试 / 验收入口，
 * 不是作弊面：不带该参数（或给了空值 / 非整数）时退回 `drawSeed()` 随机抽种——
 * 每一局都不一样，这才是浏览器里的常态。
 *
 * **Daily 不吃这条缝**：题目由 UTC 日期决定，`?seed=` 只对其余模式生效。三条理由：
 *   1. 本模式的承诺是「同一个 UTC 日期 → 同一张盘」。一条 URL 就能把题换掉的话，
 *      这个承诺处处是洞，分享出去的链接会把每个人都带去不同的盘；
 *   2. 日期标签写的是 initialSeed 所属的那个日期。?seed= 把题面换掉，标签与盘面就
 *      对不上——这正是本模式最不该出现的错；
 *   3. 要固定日期，测试该固定的是时钟（Playwright 的 page.clock），而不是借道一个
 *      与 Daily 语义无关的参数。
 */
export function seedFromSearch(search: string): number | null {
  const raw = new URLSearchParams(search).get('seed')
  // 「没给」有三种形态：参数不存在、空串、纯空白（`?seed=`、`?seed=+`）。三者的
  // Number() 都是 0，而 0 既是合法种子又是 ?? 的非空值——不先显式挡掉，缺失就会
  // 被读成 seed=0，随机抽种就此失达。所以「没给」必须在这里就说清楚。
  if (raw === null || raw.trim() === '') return null
  const seed = Number(raw)
  // 非整数的 seed 视为没给：宁可退回随机，也不要拿 NaN 当种子开局
  return Number.isInteger(seed) ? seed : null
}
