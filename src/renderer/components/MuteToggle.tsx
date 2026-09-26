import type { JSX } from 'react'

interface Props {
  /** 此刻是否静音 */
  muted: boolean
  /** 开 / 关。参数是翻转之后的值，调用方不必自己再算一次 */
  onToggle(muted: boolean): void
}

/**
 * 静音开关（T20 · SPEC 用户故事 23「audio is optional」）
 *
 * 摆在两个分支**外面**（开局界面与局中都看得见），与「战绩与统计」同一个位置：
 * 静音是**设置**，不是「这一局的状态」，所以它不该跟着 phase 生灭。
 *
 * 名字随状态变（「音效已开」/「音效已关」），**不给 aria-pressed**：一个名字会变的
 * 切换按钮已经把状态说清楚了，再叠一个 pressed 会让读屏软件念出「音效已关、
 * 已按下」这种自相矛盾的一句。选中的那套配色（`.control[aria-pressed='true']`）
 * 是给风格选择器用的，这里不需要。
 */
export function MuteToggle({ muted, onToggle }: Props): JSX.Element {
  return (
    <button
      type="button"
      className="control"
      // data-mute 是 e2e 的断言点（与 StatusBar 的 data-score 同一个口径）
      data-mute={muted}
      onClick={() => onToggle(!muted)}
    >
      {muted ? '音效已关' : '音效已开'}
    </button>
  )
}
