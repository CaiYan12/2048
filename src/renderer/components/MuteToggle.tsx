import type { JSX } from 'react'

interface Props {
  /** 此刻是否静音 */
  muted: boolean
  /** 开 / 关。参数是翻转之后的值，调用方不必自己再算一次 */
  onToggle(muted: boolean): void
}

/**
 * 音效标签的 id。**静态、三套风格共用一份**（行只有一个，抽屉也只有一个），
 * 所以不必用 `useId`——那会让 e2e 与读屏软件读到一串随机的冒号串。
 */
const LABEL_ID = 'settings-sound-label'

/**
 * 静音行（T20 的裸按钮 · T39 搬进设置抽屉，变成「左标签 + 右开关」的一行）
 *
 * **摆进抽屉**（T39）：静音是**设置**，而设置现在有一层自己的壳（T37 搭的抽屉），
 * 所以 T20 那颗挂在页脚、与「战绩与统计」并列的裸按钮搬进抽屉里来。搬的只是位置与
 * 长相，`data-mute` 那个断言点与它的语义（true = 静音）一字未动——e2e 里关于落盘值
 * 的断言因此一行都没改。
 *
 * **标签是静态的、开关报告状态**（父规格决策 14）。左边一个从不改字的 `<span id>`，
 * 右边的开关用 `aria-labelledby` **引用它本身**当可访问名——一份字，不是抄成两份
 * `aria-label`。标签刻意**不是** `<label>`：那会让浏览器悄悄把点击转发进控件，而这一行
 * 的「整行可点」是规格明写的、可测的意图，不是那个副作用的借光（所以行自己接了 onClick）。
 *
 * **开关是 `role="switch"` + `aria-checked`，可访问名不随状态变**：屏幕阅读器念的是
 * 「音效，开关，开 / 关」，状态由 `aria-checked` 说，行里**没有可见的状态文字**——
 * 一个会变的字要么挤进可访问名（而开关的名字必须恒定），要么对读屏软件藏起来
 * （那就成了只有眼睛读得到、与开关位置重复的东西，两种都不对）。
 *
 * **那条「不给 pressed」的老注释就地改写**：T20 的说法是「一个名字会变的切换按钮不该
 * 再叠一个 pressed，否则读屏软件念出『音效已关、已按下』这种自相矛盾的一句」。T39 把
 * 名字改成静态标签之后，那处矛盾**从根上没有了**——名字恒定、状态归 `aria-checked`，
 * 于是用 pressed（这里等价的是 switch 的 checked 语义）**本来就是对的**。这条注释留成
 * 现在这句，免得下一个人照着老理由把按钮改回「随状态变名字」的模式。
 */
export function MuteToggle({ muted, onToggle }: Props): JSX.Element {
  return (
    // 整行可点：指针落在标签或空白上，跟落在开关上一样翻一次。这不是 `<label>` 的转发，
    // 是这一行自己接的手——规格要的可测意图。
    // data-mute-row 是 e2e 的断言点（T42 审查修复）：风格行进场后 `.settings-row` 有两行，
    // e2e 靠它把静音行从两行里挑出来
    <div className="settings-row" data-mute-row onClick={() => onToggle(!muted)}>
      <span className="settings-row__label" id={LABEL_ID}>
        音效
      </span>
      {/* 开关自己不再接 onClick：点它（或键盘回车 / 空格激活它）冒泡到上面那个行处理器，
          一次点击只翻一次——两处各接一个会翻两遍，净变化为零。 */}
      <button
        type="button"
        className="settings-switch"
        role="switch"
        aria-checked={!muted}
        aria-labelledby={LABEL_ID}
        // data-mute 是 e2e 的断言点（与 StatusBar 的 data-score 同一个口径）：
        // true = 静音。语义自 T20 起没变
        data-mute={muted}
      >
        {/* 滑块：装饰（位置与颜色已经把状态说全），不进无障碍树 */}
        <span className="settings-switch__thumb" aria-hidden="true" />
      </button>
    </div>
  )
}
