import type { MergeFamily } from '../shared/modes'

/**
 * 斐波那契合并表的项数上限
 *
 * 契约写的是「…按斐波那契数列延续」，表没有天然终点；但也没必要真的无穷——目标块
 * 2584，之后继续玩也就 4181、6765 这个量级，撑到十亿已经远超任何可玩局面。
 * 先算成一张表而不是每次现场推数列：一次移动最多合并十几次，查表成本可以忽略，
 * 而「表里到底有哪几对」能被单测逐条对着 mode-contract.json 的 mergeTable 核。
 */
const FIBONACCI_CEILING = 1_000_000_000

/**
 * 顺数列走一遍，把每一对相邻项和它们的后继写进表。
 *
 * 为什么是「走一遍」而不是照抄六对：契约冻结的 mergeTable 只列到 5+8→13，正文却写着
 * 延续到 2584。照抄那五对的话 13+21 合不了，整条长链在中途断掉——而引擎对表以外
 * 的组合一律回 null，断链的表现是「漏合并 + 错计分」，不是报错。
 */
function buildFibonacciSuccessors(ceiling: number): ReadonlyMap<string, number> {
  const table = new Map<string, number>()
  let earlier = 1
  let later = 1
  while (earlier + later <= ceiling) {
    const successor = earlier + later
    // 两个方向都写进去：合并本身与顺序无关（加法可交换）。调用方按 lane 自然序传参
    // 的口径见下面 MERGE 的说明，这里不挑食——少一个「只有单向才配得上」的暗礁。
    table.set(`${earlier}+${later}`, successor)
    table.set(`${later}+${earlier}`, successor)
    earlier = later
    later = successor
  }
  return table
}

/** 相邻斐波那契项 → 后继项。掉出表的组合（2+2、1+3、5+13…）合不了 */
const FIBONACCI_SUCCESSORS = buildFibonacciSuccessors(FIBONACCI_CEILING)

/**
 * 按合并家族分派的合并表
 *
 * 一次查找，不是 if-else：引擎只问「这两个数按当前家族合成什么」，不关心是哪个模式。
 * 所以加斐波那契只是往表里填一行，引擎零改动。
 *
 * 传参口径：调用方一律按 **lane 的自然序**（行是左块,右块；列是上块,下块）传，
 * 与移动方向无关。
 * 它和「扫描方向」是两件事，别混：mode-contract §2 的 `[1,2,3]` 向右必须合出 `2+3→5`，
 * 说的是**哪一对被选中**——从右边缘向里扫，选中的是右边那一对；选中之后两个操作数谁前
 * 谁后仍归自然序，所以同一个扫描向左时是 (1,2)、向右时是 (2,3)。这条口径的裁决住在
 * `src/game/board.ts`：pair 就是在那里挑出来的，这里只是按口径消费。
 *
 * 斐波那契表是**双向**的，每个相邻对的两种写法都进了表（见 buildFibonacciSuccessors）。
 * 自然序确实会给出「大数在前」的 `(large, small)`——`[1597, 987]` 向左就是 (1597, 987)，
 * 靠的正是第二次 `table.set`；删掉它，这类合并一律配不上表，**漏合并还错计分，且不报错**。
 * 双向也顺带兜住误改：调用方哪天真按「离目标边近的在前」传参，合并照样合得上、分也照算
 * ——但口径不改，理由见 board.ts。Classic 等值合并不受顺序影响，表的形状要为 T05 现在就定对。
 */
export const MERGE: Record<MergeFamily, (a: number, b: number) => number | null> = {
  // 幂：等值才合
  'powers-of-two': (a, b) => (a === b ? a + b : null),
  // 斐波那契：相邻数列项可合，含 1+1→2（T05 落表，取自 mode-contract.json 的 mergeTable）
  fibonacci: (a, b) => FIBONACCI_SUCCESSORS.get(`${a}+${b}`) ?? null,
}
