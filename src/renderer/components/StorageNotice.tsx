import type { JSX } from 'react'
import type { StorageNotice } from '../stores/session'

interface Props {
  notice: StorageNotice
}

/**
 * 存档异常的界面提示（SPEC §3.3 最后一句、T16 验收标准 2）
 *
 * 只做一件事：把「这一局没有按你以为的那样恢复 / 保存」说出来。两句话的主语
 * 都必须说实话——写失败时是先说**页面内的撤销还在**，再说刷新可能续不上
 * （mode-contract §4 的原话口径）。顺序反了就是在说「进度丢了」，那不是事实。
 *
 * 为什么用 `.hint` 而不是新造一个类：这一句的对比度已经被 T14 的闸门按
 * contrast.json 里 `.hint`／`--page` 那一对验过（含三套风格各自的色值），
 * 复用现成类就不必再往表里加一对、也不必再赌一次深底上的可读性。
 *
 * `role="status"`：这一句出现时要被读屏软件念出来（SPEC 用户故事 20）。
 * 不抢焦点、不弹窗——它是一条状态，不是一个需要回应的对话。
 */
export function StorageNotice({ notice }: Props): JSX.Element {
  return (
    <p className="hint max-w-md text-center" data-storage-notice={notice.kind} role="status">
      {notice.message}
    </p>
  )
}
