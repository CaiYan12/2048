import { getMode, type ModeId } from '../../shared/modes'
import type { Board, Cell, GameState, Tile } from '../../shared/types'
import { createGame } from '../../game/engine'
import { holdsAtLeast } from '../../game/board'

/**
 * 开局局面夹具：`?board=<格子>&score=<整数>` 指定开局局面
 *
 * 与 `?seed=` 同一条性质：调试 / 验收入口，不是作弊面（SPEC §6）。为什么需要它：
 * T04 要测的是胜利与死局路径，而这两条路径靠人手按键几乎无法复现——合出 2048 要
 * 上百步，死局要恰好填满棋盘且四方向无可合并对。给一个「从给定棋盘开局」的缝之后，
 * 后续的每一步仍然走真实按键与真实规则内核，被断言的是引擎的真实迁移。
 *
 * 形状：`board` 行优先、逗号分隔，长度必须正好 size²，空串 = 空格，`1`~`n` 的数字 = 方块值；
 * `score` 可省，缺省 0。
 * 任何一处不合法都返回 null，退回随机开局——宁可让断言失败，也不要拿 NaN 当方块开局。
 *
 * `now` 是调用方注入的当前时刻，原样传给 createGame：限时模式的 deadline 由它算出，
 * 于是 `?board=` 开局的一局 Time Attack 与普通开局一样带截止点。
 */
export function fixtureFromQuery(
  query: string,
  modeId: ModeId,
  seed: number,
  now: number
): GameState | null {
  const params = new URLSearchParams(query)
  const raw = params.get('board')
  if (raw === null) return null

  const mode = getMode(modeId)
  const specs = raw.split(',')
  if (specs.length !== mode.size * mode.size) return null

  // 只接受纯十进制正整数：Number('') 是 0、Number(' 2') 是 2、Number('0x2') 是 0，
  // 这些宽松写法都会悄悄改变开局局面，所以先用正则把形状卡死再转换
  const values: (number | null)[] = []
  for (const spec of specs) {
    if (spec === '') {
      values.push(null)
      continue
    }
    if (!/^[1-9]\d*$/.test(spec)) return null
    values.push(Number(spec))
  }

  const rawScore = params.get('score')
  if (rawScore !== null && !/^\d+$/.test(rawScore)) return null
  const score = rawScore === null ? 0 : Number(rawScore)

  // 借 createGame 取一份合法初态：rngState / moves / deadline / phase 都在里面，
  // 于是后续的生成仍由这个 rngState 决定——同 seed 同结果，e2e 才可复现。
  const base = createGame(modeId, seed, now)
  let nextTileId = 1
  const board: Board = base.board.map((row, r) =>
    row.map((cell, c): Cell => {
      const value = values[r * mode.size + c] ?? null
      // 障碍格一律保持 'wall'：夹具只描述数值方块与空格。classic 无墙，写这一句是
      // 为了让 T07 的 e2e 不能靠这个缝把方块塞到墙上去。
      if (cell === 'wall') return 'wall'
      if (value === null) return null
      const tile: Tile = { id: nextTileId, value }
      nextTileId += 1
      return tile
    })
  )

  return {
    ...base,
    board,
    score,
    // 里程碑按棋盘判定，用的就是 move 里那个函数：局面里已经有目标块就等于「曾经达标」。
    // 不在 store 里另写一份「达标」判据（SPEC §4：协调者不是第二套规则引擎）。
    reachedTarget: holdsAtLeast(board, mode.target),
    nextTileId,
  }
}
