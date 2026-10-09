/**
 * scripts/check-contrast.mjs 的类型声明
 *
 * 为什么需要它：单测要从 tests/unit 里 import 那个闸门的 pure 半边（算术 + auditPair），
 * 而 .mjs 不被 tsc 检查（tsconfig 的 include 只列了 src / tests / 三个配置文件）。
 * 没有这份声明，`npm run typecheck` 会在 import 那一行直接报找不到模块。
 * 声明与实现是两份真相，风险由 tests/unit/contrast.test.ts 压住——它拿这些函数
 * 复算每一对，公式或判定写错立刻炸。
 */

export interface ContrastPair {
  usage: string;
  basis: string;
  foreground: string;
  background: string;
  /** 前景不是完整色值、要压在背景上才成形时（Classic 的 .panel__label 当年用 opacity .85；T15 已换成显式声明的色值，三套风格的表里现在一对都没有，这一条留给将来真需要半透明文字的实现） */
  from?: { base: string; opacity: number };
  minimum: number;
  ratio: number;
  scene: string;
  probe?: {
    selector: string;
    /** color（默认）/ background / ring */
    read?: string;
    background?: string;
    hover?: boolean;
    /** 读到这一对之前先把开关点一下（翻到另一态）——T39 的静音开关两态各一对，默认态那
     * 几对直接量，带这个旗标的几对由浏览器那一层先点一下开关再读 */
    toggle?: boolean;
    /** 读到这一对之前先把风格列表展开——T42 的列表只在开着时存在（没有退场动画），
     * 带这个旗标的几对由浏览器那一层先点一下触发钮再读 */
    expandList?: boolean;
  };
}

export declare const SCENES: readonly [
  'start',
  'run',
  'walls',
  'milestone',
  'egg',
  'wish',
  'pinned',
  'settings',
];

export declare const BASIS_MINIMUM: Readonly<Record<string, number>>;

export declare const RATIO_TOLERANCE: number;

export declare const COMPOSITE_TOLERANCE: number;

/** '#rrggbb' / '#rgb' → '#rrggbb' */
export declare function normaliseHex(hex: string): string;

/** sRGB 0..255 → 线性光 0..1 */
export declare function linearChannel(byte: number): number;

/** '#rrggbb' → WCAG 相对亮度 */
export declare function relativeLuminance(hex: string): number;

/** WCAG 2.x 对比度：(亮的 + 0.05) / (暗的 + 0.05) */
export declare function contrastRatio(foreground: string, background: string): number;

/** 半透明压在底色上的合成结果（半透明前景就是这么成形的） */
export declare function compositeHex(foreground: string, background: string, alpha: number): string;

/** 一对的「有效前景」：整色就是它自己，半透明就合成一份 */
export declare function effectiveForeground(pair: ContrastPair): string;

/** 单对声明的全部校验；返回问题列表（空 = 这一对没问题） */
export declare function auditPair(tokensCss: string, pair: ContrastPair): string[];
