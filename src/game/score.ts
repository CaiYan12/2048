/**
 * 一次合并的得分增量
 *
 * 当前所有模式同口径：**加合并产物的数值**（mode-contract §2）。把它单独放一个模块，
 * 是为了让「分数怎么算」只有这一个家——日后若某个模式要改成别的口径（比如连击加成），
 * 改这里即可，引擎里的调用点不必跟着动。T03 没有第二种口径，所以它就是恒等。
 */
export function mergeScore(successorValue: number): number {
  return successorValue
}
