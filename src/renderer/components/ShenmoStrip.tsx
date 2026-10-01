import type { JSX } from 'react'
import {
  achievementEmoji,
  achievementNoteOf,
  achievementUnlockLabel,
  type AchievementId,
} from '../../game/achievements'

interface Props {
  /** 悬着的那一颗成就。它自带的那句 `note` 就是这一行字（父规格的架构决策 9 / 10） */
  id: AchievementId
}

/**
 * **悬顶**（T32 · 父规格的架构决策 10 与术语表）：走火入魔那一颗成就，钉在视口顶端。
 *
 * 它**不是 toast**——那句话是这个项目里最要紧的一条区分。toast 是一句五秒钟就走的
 * 「你刚做到了」，而这一条要说的是「这件事发生在你身上了，而且这一局剩下的时间里
 * 它一直在这儿」：不落、不淡、不自动消失。所以它不走 toast 栈那条计时路径，
 * 连 `data-toast` 都不带（带了就会被 toast 契约那一套断言抓住）。
 *
 * 三条性质，逐条对应一个会被问到的「为什么不」：
 *   · **不落盘**：成就在这个项目里一个字节都不写进存储，一颗彩蛋不配破例
 *     （架构决策 10）。所以刷新即没——而同一局恢复之后还能再走一次火入魔、再扣下一次，
 *     这是那个决策的**后果**，不是漏掉了一处。
 *   · **不吃指针**：它是这一局余下时间里唯一挂着的可见物，而玩家能做的事只有一件
 *     （点「重新开始」）。让它接指针就等于把整页的点击都吞了——本仓库记过最多次的
 *     那一类坑（`.codex/memories/result-layer.md` 第 1 条：看得见不等于点得到）。
 *   · **只读、不进 Tab 顺序**：它没有任何可操作的东西，塞一个 tabindex 只会让每次
 *     Tab 都停在一句话上。读屏软件那一边由 `role="status"` 负责（隐式 polite +
 *     atomic）：它出现的那一刻整条播报一次，之后一直留在无障碍树里可回读。
 *
 * 长相分两处（与两颗圆钮、一念按钮同一条规矩，ADR-0002 增补 / 父规格架构决策 11）：
 * **结构、摆位与节奏**在 `styles/index.css`，**底面与字色**在三套风格自己的
 * tokens.css 与 styles.css 里——彩蛋不是第四个插槽。
 */
export function ShenmoStrip({ id }: Props): JSX.Element {
  const note = achievementNoteOf([id])

  return (
    <div className="shenmo-strip" data-shenmo-strip role="status">
      <p className="shenmo-strip__head">
        {/* 图标是内容（它报出拿到了哪一个），而名字已经把这个意思说全了，所以对读屏
            软件隐藏它——与三套 toast 里那一个 aria-hidden 同一条理由 */}
        <span className="shenmo-strip__emoji" aria-hidden="true">
          {achievementEmoji(id)}
        </span>
        {achievementUnlockLabel(id)}
      </p>
      {/* null = 这一颗没有梗。此刻悬着的一定有（那句诗），但分支照旧写：
          一个空 <p> 会在屏幕上留下一行空白，而「什么都不说」该是一个节点都不在 */}
      {note !== null && <p className="shenmo-strip__note">{note}</p>}
    </div>
  )
}
