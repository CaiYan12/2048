import type { AnimationEvent, JSX, ReactNode } from 'react'
import type { EndReason } from '../../shared/types'
import type { ResultReadout } from '../stores/records'

/**
 * 结果层的三档（ADR-0008 的第三条：强度按「还剩多少决定可做」排）。
 *
 * `won` 达标（棋盘是奖励，玩家正要回到它上面）、`stuck` 死局（要看清棋盘才选得出
 * 撤销、交换还是认命）、`ended` 已结算（什么都不用决定了）。它同时写进 DOM 的
 * `data-result-tier`，于是遮罩该取哪一档、以及 e2e 要断言哪一档，都是同一个属性。
 */
export type ResultTier = 'won' | 'stuck' | 'ended'

/** 哪一处：`data-panel` 从 T04 起就是这两个值（win = 达标那一层，gameover = 死局与
    终局那一层），两条几何契约按它找这一层。词汇表把「面板」让给了棋盘禁词与记分卡的类名，
    所以这里只说「哪一处」 */
export type PanelId = 'win' | 'gameover'

interface Props {
  tier: ResultTier
  panel: PanelId
  /**
   * 为什么结束（`data-end-reason`）。win 那一处不给：它不是终局，于是这个属性整个不出现
   * ——与改动前一致（React 对 null / undefined 的自定义属性一律不渲染）。
   */
  endReason?: EndReason | null
  /** 四项读数。判定住在 records.ts 的纯函数里，这里一个字节的算术都没有 */
  readout: ResultReadout
  /**
   * 卡片那一行（T31 · 父规格的架构决策 17）：道通成魔那一局的梗，与死局 / 超时 /
   * 放弃那一刻的本局总结，同一个座位两处用法。null = 这一层没什么可说——**不挂这个
   * 元素**，而不是挂一句空话。
   *
   * 句子由 `resultCardLine` 从本局 facts 生成（App 现算递进来，与读数同一条路子）；
   * 这里只管排版，一个字节的文案判断都没有。
   */
  line: string | null
  title: string
  sentence: string
  /**
   * 正在退场（T27）。只做一件事：在 section 上落下 `data-result-leaving`，由它把指针
   * 交给棋盘、并把两条动画换成退场那一组（styles/index.css）。**它不改变这一层的长相**，
   * 组件只负责在正确的时刻把它挂上去。
   *
   * 什么时候该由谁挂：App 每次把当前这一层连同这个旗标一起递进来（旗标本身由
   * ResultPresence.ts 算），所以这里不做任何计时。
   */
  leaving?: boolean
  /**
   * 退场播完了（T27）。由卡片那条退场动画的 `animationend` 触发，宿主（App 经
   * ResultPresence.ts）据此把层从 DOM 上摘掉。
   *
   * **为什么是动画结束而不是定时器**：装假时钟的测试（time-attack 用 `page.clock`）会把
   * `setTimeout` 冻住，层的退场就永远播不完；动画结束事件来自渲染管线，假时钟够不着它。
   * 与 toast 那条 `onDone` 是同一条路子—— disappearing 的时机由这一层自己报。
   */
  onExited?(): void
  /** 按钮。两处各自给内容，行容器在这里（gap 与排序只有一份） */
  actions: ReactNode
}

/**
 * 结果层（T26 · ADR-0008）：**半透明遮罩 + 不透明卡片**，三种非对局阶段共用同一结构。
 *
 * **为什么是两个元素**：半透明的前景是另一个颜色值，`getComputedStyle().color` 读不到
 * 合成结果（三张设计卡 §7 都禁「用 opacity 调文字明度」，同一条理由）。所以遮罩与卡片
 * 分开：遮罩负责让棋盘退后，卡片整个不透明，于是标题、那一句话、四项读数、那一行与
 * 按钮的对比度与改动前逐字节相同——这就是这套改动敢这么做的原因。
 *
 * **读数为什么住在这一处**：两处各写一遍「分数 / 最高分 / 步数」必然漂开，所以 markup
 * 只有这一份，两处把自己的标题、那一句话与按钮递进来（两者的文案逐字节未改）。
 *
 * **`aria-hidden` 的遮罩**：它没有文字、也没有子元素，是一层纯装饰。读屏玩家要的是那段
 * 标题、那句话与四个读数——那一层遮罩念出来只是噪音。
 *
 * 遮罩的强度由 `.overlay` 上的 `data-result-tier` 选（styles/index.css 的三条规则 →
 * 各风格 tokens.css 的三个 token）；卡片的长相在各风格自己的 styles.css。
 *
 * **进出动效（T27 · ADR-0008 的架构决策 9 / 10）**：进场与退场都播，节奏是项目为方块定下
 * 的那一套（150ms + 内置 `ease-out`），两条动画都写在 styles/index.css 的共享外壳里——
 * 三套风格同一套姿态，换风格不换节奏。`data-result-leaving` 是这一切的开关：它一挂上，
 * 遮罩与卡片同时换成退场那一组关键帧，而**指针当场就还给棋盘**（架构决策 9 的原话：
 * 否则继续玩之后马上划一下的玩家会对着一块不动的棋盘发懵)。胜利标题那一条关键帧
 * （`win-panel-title-enter`）照旧附着在第一次渲染上，与卡片自己的淡入叠在一起——两段各
 * 自动各的元素，本来就不冲突。
 */
export function ResultLayer({
  tier,
  panel,
  endReason,
  readout,
  line,
  title,
  sentence,
  leaving,
  onExited,
  actions,
}: Props): JSX.Element {
  const handleAnimationEnd = (event: AnimationEvent<HTMLDivElement>): void => {
    // 进场那一组放完时 `leaving` 还是 false——这一句就是判据，于是「动画是哪一条关键帧」
    // 一个字都不必写进 JS（reduced-motion 下卡片换的是淡入淡出那一条，名字不同而判据不变）
    //
    // `event.target === event.currentTarget` 也是判据的一部分：animationend 会**冒泡**，
    // 而胜利标题那条 180ms 关键帧长在 .overlay__title 上、正是这张卡片的后代。不挡这一下的
    // 话，玩家在胜利层出现后 150–180ms 内点「继续玩」时，标题那一条会代替卡片的退场把层
    // 摘掉——退场只播了约 130ms，卡片剩一截透明度凭空消失。挡掉之后只有卡片自己的动画
    // 能触发摘层，reduced-motion 换成淡入淡出那一条也同样成立。
    if (leaving && event.target === event.currentTarget) onExited?.()
  }
  return (
    <section
      className="overlay"
      data-panel={panel}
      data-end-reason={endReason}
      data-result-tier={tier}
      data-result-leaving={leaving ? 'true' : undefined}
    >
      <div className="overlay__scrim" aria-hidden="true" />
      <div className="overlay__card" onAnimationEnd={handleAnimationEnd}>
        <h2 className="overlay__title">{title}</h2>
        <p className="overlay__text">{sentence}</p>
        <dl className="overlay__readout">
          <div>
            <dt>分数</dt>
            <dd>{readout.score}</dd>
          </div>
          <div>
            <dt>最高分</dt>
            <dd>{readout.bestScore}</dd>
          </div>
          {/* 步数报的是**眼前这条路**（GameState.moves），不是按了多少次键：撤销一步它
              减一，作弊交换不动它。别把它「修」成一个只增的计数器——那一口气说的就是
              另一件事（ADR-0008 的架构决策 8）。合并成就用的也是这一把尺子。 */}
          <div>
            <dt>步数</dt>
            <dd>{readout.moves}</dd>
          </div>
        </dl>
        {/* 新纪录标记。**未结算时它是预告，不是既成事实**：`won` / `stuck` 两层上一个字节
            的记录都还没写（records 只在结算时写一次），玩家从这两层点「新游戏」等于放弃
            本局、不写任何记录，那句话当场就不成立。规格的架构决策 5 与决策 7 合起来把
            「三个阶段都能判」与「基准线取在写入处」都定了，这里按前者三档都显示，按后者
            用写入前那条当门槛。将来若要按阶段分文案，该分的是这一句话，不是判据本身。 */}
        {readout.isNewBest && <p className="overlay__record">本局刷新了最高分</p>}
        {/* 卡片那一行（T31）。放在记录标记之后、按钮之前——它是这张卡片的**最后一句话**，
            对一局怎么走的总结，或者彩蛋那一局的梗。没有就不在 DOM 里留一个空节点 */}
        {line !== null && <p className="overlay__line">{line}</p>}
        <div className="flex gap-2">{actions}</div>
      </div>
    </section>
  )
}
