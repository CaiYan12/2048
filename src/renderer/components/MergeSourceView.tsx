import { useLayoutEffect, useState, type CSSProperties, type JSX, type TransitionEvent } from 'react'
import { translateCss } from './BoardLayout'
import type { MergeSourceMotion } from './TileMotion'
import { tileDigits, tileLabel } from './TileLabel'

interface Props {
  source: MergeSourceMotion
  fromOffset: { x: number; y: number }
  toOffset: { x: number; y: number }
  rank: number
  slot: number
  onExitComplete(key: string): void
}

/** 合并时保留被吞操作数的短暂视觉载体，不把它混进规则棋盘或方块身份查询。 */
export function MergeSourceView({
  source,
  fromOffset,
  toOffset,
  rank,
  slot,
  onExitComplete,
}: Props): JSX.Element {
  const [leaving, setLeaving] = useState(false)
  const style = {
    '--merge-source-from': translateCss(fromOffset),
    '--merge-source-to': translateCss(toOffset),
  } as CSSProperties

  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => setLeaving(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  const handleTransitionEnd = (event: TransitionEvent<HTMLDivElement>): void => {
    if (
      event.target === event.currentTarget &&
      event.propertyName === 'translate' &&
      leaving
    ) {
      onExitComplete(source.key)
    }
  }

  return (
    <div
      className="board__tile"
      data-merge-source-id={source.tile.id}
      data-value={source.tile.value}
      data-rank={rank}
      data-bucket={slot}
      data-digits={tileDigits(source.tile.value)}
      data-row={source.from[0]}
      data-col={source.from[1]}
      data-leaving={leaving || undefined}
      aria-hidden="true"
      style={style}
      onTransitionEnd={handleTransitionEnd}
    >
      {tileLabel(source.tile.value)}
    </div>
  )
}
