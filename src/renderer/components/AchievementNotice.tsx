import type { JSX } from 'react'
import { achievementUnlockLabel, type AchievementId } from '../../game/achievements'

interface Props {
  /** 这一次新解锁的成就。空数组 = 没有可提示的（调用方已经在外面挡掉） */
  ids: readonly AchievementId[]
  onDismiss(): void
}

/**
 * 成就解锁的即时提示（T18 验收标准 3 · SPEC §3.3 的「成就解锁即时提示」）
 *
 * **每次解锁只响一次。** 它不自己判断「解锁了没有」——那件事由写盘那一层在落库前后的
 * 进度相减得到（useGameStore.persistSettlement 的 `unlocked`），而结算只执行一次，
 * 所以这里也不可能自己再算出一次。刷新之后 hydrate 只读盘上那份已解锁列表，谁也不
 * 再算差——于是「刷新之后重新播报一遍」这件事在结构上就不会发生。
 *
 * 与 StorageNotice 同一条路子：`.hint` 的对比度已经被 T14 的闸门按 contrast.json 验过
 * （三套风格各自的色值），复用现成类就不必再往表里加一对、也不必再赌一次可读性。
 * `role="status"` 让这一句被读屏软件念出来（SPEC 用户故事 20），不抢焦点、不弹窗——
 * 它是一条状态，不是一个需要回应的对话。
 */
export function AchievementNotice({ ids, onDismiss }: Props): JSX.Element {
  if (ids.length === 0) return <></>
  const labels = ids.map(achievementUnlockLabel)
  return (
    <p className="hint flex max-w-md items-center gap-2" data-achievement-notice role="status">
      <span>
        解锁成就：{labels.join('、')}
      </span>
      <button type="button" className="control" onClick={onDismiss}>
        知道了
      </button>
    </p>
  )
}
