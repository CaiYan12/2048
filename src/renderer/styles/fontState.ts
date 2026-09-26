import { firstLocalFamily, watchState, type FontFacts, type FontState } from './fontProbe'

/**
 * 字体加载态
 *
 * 把「字体没到位」变成 CSS 能看见的**设计态**，而不是一场事故。
 *
 * `font-display: swap` 保证浏览器不会因为等字体而阻塞渲染，但它有个盲区：
 * 慢网或 404 时，页面上静悄悄地用着回退字体，没人知道本地字体到底来没来。
 * 这里补上第二道机制——在 <html> 上落一个 data-font-state，主题可以据此补偿形态
 * （比如缺字时加重字重、拉宽字距，让回退形态仍然贴合该风格）。
 *
 * 三态：
 *   loading  初始。先用回退字体渲染，不作补偿。
 *   ready    本地字体可用，或加载失败但系统回退已在同类内。
 *   fallback 超时仍未就绪。主题应当进入降级形态。
 *
 * ready 之后不会再退回 fallback——升级是单向的，避免视觉反复横跳。
 *
 * —— T14：换风格时重新跑一遍状态机（ADR-0005 的最后一句要求的正是这件事）——
 *
 * 上面那套机制原本只在应用启动时跑一次。可用哪套字体是**风格**的事：每套风格的
 * tokens.css 都覆盖 --font-display / --font-body（Classic 是 Inter、Material 是
 * Roboto Flex），于是启动时那一次观察的结论在新风格上不成立——Roboto Flex 可能
 * 压根还没开始下载，页面却继续报着 ready。所以这里多出 recheckEffectiveFont：
 * 按**当前风格实际在用的字体**重新观察，并且只在「正在观察的那一组」真的变了时
 * 才动。切回一份已经加载过的字体不许先闪一下 loading，那正是单向升级要防的横跳。
 */

const FONT_READY_TIMEOUT_MS = 2500

/**
 * 探测用的 <font> 简写。check() / load() 都按家族匹配，字号取什么不影响结论；
 * 两者的 text 参数默认是 U+0020，而每个 latin 子集的 unicode-range 都含它
 * （fonts.css），所以这一问能问到本地的那个文件。
 */
const PROBE_FONT = '12px'

/** 当前正在观察的那一组本地字体。null = 还没有观察过（与「空集」不是一回事） */
let watching: readonly string[] | null = null
/** 每次重新观察换一个号：连续切换时，旧的那一次不许再落状态 */
let token = 0
/** 当前这一次观察的硬上限定时器 */
let timer = 0

function setState(state: FontState): void {
  document.documentElement.dataset.fontState = state
}

/** 一个家族的两个事实：check() 答「准备好了吗」，face.status 答「彻底挂了吗」 */
function factsFor(family: string): FontFacts {
  let failed = false
  for (const face of document.fonts) {
    if (face.family === family && face.status === 'error') {
      failed = true
      break
    }
  }
  return {
    ready: document.fonts.check(`${PROBE_FONT} '${family}'`),
    failed,
  }
}

/**
 * 这一套风格实际在用的本地字体：两个三角色（展示 / 正文）的字体栈各取第一个本地族。
 *
 * 为什么从计算样式读，而不是在仓库里维护一张「风格 → 字体」表：那张表会和主题的
 * tokens.css 脱同步——而这正是本票要堵的一类 bug（声明与实渲染对不上）。计算样式是
 * 浏览器代入 var() 之后的真值，主题漏了本地字体名、或者写了个没有 @font-face 的
 * 名字，这里读到的东西就是页面上真正在用的东西。
 *
 * 不含 --font-mono：目前没有一套风格在渲染它（index.css 记着 font-mono 的 alias
 * 为什么不建），问了它只会等一个没人下载的文件，直到超时误判成 fallback。
 */
function effectiveFamilies(shell: HTMLElement): readonly string[] {
  const styles = getComputedStyle(shell)
  const families = ['--font-display', '--font-body'].map((name) =>
    firstLocalFamily(styles.getPropertyValue(name))
  )
  return [
    ...new Set(families.filter((family): family is string => family !== null)),
  ].sort()
}

function startWatch(families: readonly string[], current: number): void {
  let kicked = false
  window.clearTimeout(timer)

  const finish = (state: FontState): void => {
    if (current !== token) return
    window.clearTimeout(timer)
    setState(state)
  }

  // 一次探测。只认最新一次观察的结论：连续切风格时，上一套的慢网不许落这一套的状态
  const probe = (): void => {
    if (current !== token) return
    const state = watchState(families.map(factsFor))
    if (state !== 'loading') {
      finish(state)
      return
    }
    setState('loading')
    if (!kicked) {
      kicked = true
      // 主动请求一次，理由见文件头：check() 不触发下载，而本界面以中文文案为主、
      // unicode-range 只含 latin，一位没被任何一段西文触发的字体会让我们一直等到
      // 超时——那是把「没人在用」误判成「挂了」。kicked 保证不重复请求。
      //
      // load() 的收口有两边（MDN：只有「全部加载成功」才 fulfill，有一位失败就 reject），
      // 所以 reject 也要 re-probe：404 要**立刻**落 fallback，不是等 2500ms 超时才收口。
      // 不加这个 catch 的话那是一次 unhandled rejection，页面会记一条 console error。
      void Promise.all(
        families.map((family) => document.fonts.load(`${PROBE_FONT} '${family}'`))
      )
        .catch(() => undefined)
        .then(probe)
    }
  }

  // 硬上限：慢网的兜底。到点重新探一次再收口，别把「正好在最后一刻到位」判成 fallback
  timer = window.setTimeout(() => {
    if (current !== token) return
    finish(watchState(families.map(factsFor)))
  }, FONT_READY_TIMEOUT_MS)

  probe()
}

export function initFontState(): void {
  // 落 loading 的时机要在首屏文本之前（font-display: swap 的配套，见文件头）。
  // 真正的观察不在这里开始：这一套风格的字体栈在**渲染出来的 shell** 上，而本函数
  // 在 createRoot().render() 之前调用（main.tsx），那时 DOM 上还没有它。第一次观察
  // 由 App 的 effect 在挂载后发起（见 recheckEffectiveFont）。
  document.documentElement.dataset.fontState = 'loading'
}

/**
 * 重新跑一遍字体状态机：按当前风格实际在用的本地字体观察（T14 验收标准 1）。
 *
 * App 的 effect 在 styleId 变化时调用。同一组字体重复调用是空操作——切回一份
 * 已经加载过的字体必须先问过 check()，问过了就直接是 ready，不闪 loading。
 */
export function recheckEffectiveFont(shell: HTMLElement | null): void {
  if (shell === null) return
  const families = effectiveFamilies(shell)
  // 「正在观察的就是这一组」时什么都不做：换风格不等于换字体（classic ⇄ material
  // 换，某两套同字族的风格之间换就不算）。判据用逐个相等，不用引用相等——
  // effectiveFamilies 每次渲染都造一个新数组
  if (
    watching !== null &&
    watching.length === families.length &&
    watching.every((family, index) => family === families[index])
  ) {
    return
  }
  watching = families
  token += 1
  startWatch(families, token)
}
