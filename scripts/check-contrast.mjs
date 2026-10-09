#!/usr/bin/env node
/**
 * 对比度闸门 · 第一层（浏览器之外）
 *
 * SPEC §4：「`check:contrast` validates declared pairs, with browser computed-style
 * checks to catch declarations that differ from rendered CSS」——那句话是**两层**，
 * 本脚本是第一层，浏览器那一层在 tests/e2e/contrast-computed.spec.ts 读计算样式。
 *
 * 本层做什么（全部只读文本，不碰浏览器）：
 *   1. 每一对重新算一遍 WCAG 2.x 相对亮度对比度，与表上声明的 ratio 对不上就炸
 *      （±0.02，容两位小数的四舍五入；表上的数是实测值，不是拍出来的目标值）；
 *   2. 低于自己声明的 minimum 就炸；
 *   3. basis 与 minimum 必须自洽：regular 4.5、large / non-text 3。口径写进表里，
 *      闸门才可审计——否则「哪一对靠大字豁免」就只剩记忆，而记忆会漂；
 *   4. 引用了 tokens.css 里没有声明的色值就炸（漏 declaration 的墙就是这么来的，
 *      见 Classic 设计卡 §2 与 theme-contract.test.ts）；
 *   5. 前景是半透明压出来的（.panel__label 的 opacity .85）时，按 from 复算合成色，
 *      再对 tokens.css 核对 base——那一对因此是可推导的，不是「相信我量过」；
 *   6. probe 的形状要合法：它是浏览器那一层按图索骥的地址，写错了必须在这里先炸，
 *      而不是等 e2e 安静地找不到元素。
 *
 * 用法：npm run check:contrast（也接受 `node scripts/check-contrast.mjs`）。
 * 退出码：0 全部通过；1 有失败并逐条列出来。
 *
 * 纯算术与 auditPair 从本文件导出，tests/unit/contrast.test.ts 直接 import 它们——
 * 一份实现两个消费者，免得闸门与它的测试各自抄一份公式然后悄悄漂开。
 * （类型声明在同目录的 check-contrast.d.mts：.mjs 是纯 ESM，不放 TS 语法。）
 */

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const THEMES_DIR = join(REPO_ROOT, 'src', 'renderer', 'styles', 'themes');

/**
 * 每一对是在哪个页面状态下量到的（浏览器那一层按它分工况）
 * T26 加 milestone：结果层挂上的那一刻（四个 1024 一次左移合出 2048）——量的是
 * 卡片那一面，而卡片底虽然在表里与页面同一个 token，探针以前只落在记分卡上。
 * T29 加 egg：一念神魔的两颗圆钮在场（打完 ↑↑↓↓←→←→）——彩蛋不是第四个插槽，
 * 但它的两颗钮是新长出来的可交互控件，于是它们自己的色对要量（父规格用户故事 40）。
 * **T33 起 egg 这一幕铺到堕落态**（点过 B、只剩 A）：同一幕里还量堕落染墨的十二档
 * 暗档（父Spec 的架构决策 15）。不另起场景——堕落态的页面正是抉择页面本身，而「暗档
 * 落实为令牌变暗」的全部意义就在于闸门能在同一个场景里把它量出来。
 * T30 加 wish：一念的奖品在场（先 B 后 A 走完一遍）——那一念的按钮同样是新长出来的
 * 可交互控件，一句话说「别让一个玩笑花掉可读性」就要把它也量了。
 * T32 加 pinned：**第二遍走完**（先 B 后 A 两遍）——棋盘被扣下，视口顶端多出那条
 * 悬顶，它是这一票新长出来的**一整面**（不是一个控件），所以也归这句话管。
 * T39 加 settings：**设置抽屉开着**（右上角那颗齿轮点开）——抽屉是 T37 才长出来的
 * 一整面，一面此前没载过文字就继承不到任何一次测量，所以抽屉面自己的标题与行标签要入表；
 * 而抽屉里那个静音开关是新长出来的可交互控件，两态（滑块 vs 关态 / 开态轨道）各一对。
 * 开关默认是开的，所以开态那几对直接量；关态那几对由浏览器那一层先点一下开关
 * （`probe.toggle`）再量。
 */
export const SCENES = Object.freeze([
  'start',
  'run',
  'walls',
  'milestone',
  'egg',
  'wish',
  'pinned',
  'settings',
]);

/**
 * 口径 → 门槛。SPEC §3.2：普通文字 4.5:1，大字与适用的非文字指示器 3:1。
 * 大字 = ≥18.66px，或 ≥14px 粗体。
 */
export const BASIS_MINIMUM = Object.freeze({ regular: 4.5, large: 3, 'non-text': 3 });

/** 表上的 ratio 是两位小数的实测值，容这一个差 */
export const RATIO_TOLERANCE = 0.02;

/** 合成色按 8bit 通道复算，四舍五入各通道容 1 */
export const COMPOSITE_TOLERANCE = 1;

/** sRGB 0..255 → 线性光 0..1 */
export function linearChannel(byte) {
  const channel = byte / 255;
  return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
}

/** '#rrggbb' / '#rgb' → '#rrggbb'；不合形直接抛，别让 NaN 流进算式 */
export function normaliseHex(hex) {
  const digits = String(hex).replace('#', '').toLowerCase();
  if (/^[0-9a-f]{6}$/.test(digits)) return digits;
  if (/^[0-9a-f]{3}$/.test(digits)) {
    return digits
      .split('')
      .map((c) => c + c)
      .join('');
  }
  throw new Error(`不是 6 位（或 3 位）十六进制色值：${hex}`);
}

/** '#rrggbb' → WCAG 相对亮度 */
export function relativeLuminance(hex) {
  const digits = normaliseHex(hex);
  const r = linearChannel(parseInt(digits.slice(0, 2), 16));
  const g = linearChannel(parseInt(digits.slice(2, 4), 16));
  const b = linearChannel(parseInt(digits.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x 对比度：(亮的 + 0.05) / (暗的 + 0.05) */
export function contrastRatio(foreground, background) {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * 半透明压在底色上的合成结果——浏览器把 opacity / rgba 做 alpha 合成时的同一个算式。
 * 用来复算 .panel__label 这类「前景色不完整、要叠在背景上才成形」的对。
 */
export function compositeHex(foreground, background, alpha) {
  const f = normaliseHex(foreground);
  const b = normaliseHex(background);
  const channels = [0, 1, 2].map((index) => {
    const top = parseInt(f.slice(index * 2, index * 2 + 2), 16);
    const under = parseInt(b.slice(index * 2, index * 2 + 2), 16);
    return Math.round(alpha * top + (1 - alpha) * under);
  });
  return `#${channels.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** 一对的「有效前景」：整色就用它自己，半透明就合成一份 */
export function effectiveForeground(pair) {
  if (pair.from === undefined) return pair.foreground;
  return compositeHex(pair.from.base, pair.background, pair.from.opacity);
}

/**
 * 单对声明的全部校验。返回问题列表（空数组 = 这一对没问题）。
 *
 * 导出它是为了让 tests/unit/contrast.test.ts 直接验证「闸门会咬人」：拿一对真实的
 * 数据改一个字段，这里必须给出问题——而不是只验证算术在自己的测试里自洽。
 */
export function auditPair(tokensCss, pair) {
  const problems = [];
  const where =
    typeof pair.usage === 'string' && pair.usage !== '' ? `「${pair.usage}」` : '（缺 usage 的一对）';

  // —— 形状 ——
  if (typeof pair.usage !== 'string' || pair.usage === '') {
    problems.push('缺 usage（这一对用在哪里；没有它这张表就不可审计）');
  }
  for (const field of ['foreground', 'background']) {
    if (typeof pair[field] !== 'string') {
      problems.push(`缺 ${field}`);
      return problems;
    }
    try {
      normaliseHex(pair[field]);
    } catch (error) {
      problems.push(`${field} ${error.message}`);
      return problems;
    }
  }
  if (BASIS_MINIMUM[pair.basis] === undefined) {
    problems.push(
      `basis 必须是 ${Object.keys(BASIS_MINIMUM).join(' / ')} 之一，现在是 ${JSON.stringify(pair.basis)}`
    );
    return problems;
  }
  if (pair.minimum !== BASIS_MINIMUM[pair.basis]) {
    problems.push(
      `口径 ${pair.basis} 的门槛是 ${BASIS_MINIMUM[pair.basis]}，声明的是 ${pair.minimum}——两者必须一致，否则「哪一对靠大字豁免」就能随便写`
    );
  }
  if (!SCENES.includes(pair.scene)) {
    problems.push(
      `scene 必须是 ${SCENES.join(' / ')} 之一，现在是 ${JSON.stringify(pair.scene)}`
    );
  }

  // —— 半透明合成（Classic 的 .panel__label 用 opacity .85）——
  let foreground = pair.foreground;
  if (pair.from !== undefined) {
    const { base, opacity } = pair.from;
    if (typeof base !== 'string' || typeof opacity !== 'number' || opacity < 0 || opacity > 1) {
      problems.push('from 必须是 { base: 色值, opacity: 0..1 }');
      return problems;
    }
    try {
      foreground = compositeHex(base, pair.background, opacity);
    } catch (error) {
      problems.push(`from.base ${error.message}`);
      return problems;
    }
    const declared = normaliseHex(pair.foreground);
    const drift = [0, 1, 2].some(
      (index) =>
        Math.abs(
          parseInt(declared.slice(index * 2, index * 2 + 2), 16) -
            parseInt(foreground.replace('#', '').slice(index * 2, index * 2 + 2), 16)
        ) > COMPOSITE_TOLERANCE
    );
    if (drift) {
      problems.push(
        `声明的合成前景 ${pair.foreground} 与 from 复算出来的 ${foreground} 不一致（base ${base} 压在 ${pair.background} 上，opacity ${opacity}）`
      );
    }
  }

  // —— 比值 ——
  const measured = contrastRatio(foreground, pair.background);
  if (measured < pair.minimum) {
    problems.push(
      `${foreground} on ${pair.background} = ${measured.toFixed(2)}，低于口径 ${pair.basis} 的门槛 ${pair.minimum}`
    );
  }
  if (typeof pair.ratio !== 'number') {
    problems.push('缺 ratio');
  } else if (Math.abs(measured - pair.ratio) > RATIO_TOLERANCE) {
    problems.push(
      `声明 ratio ${pair.ratio}，按 WCAG 2.x 复算 ${measured.toFixed(4)}（容差 ${RATIO_TOLERANCE}）`
    );
  }

  // —— 色值必须来自本风格的 tokens.css ——
  // 「墙变透明」那一类 bug 的同款：引用一个没声明的色值，浏览器不报，
  // 只是安静地不是你要的样子
  for (const [label, hex] of [
    ['背景', pair.background],
    ['前景', pair.from === undefined ? pair.foreground : pair.from.base],
  ]) {
    if (!tokensCss.toLowerCase().includes(normaliseHex(hex))) {
      problems.push(
        `${label} ${hex} 在 tokens.css 里没有声明——要么补声明，要么这张表引用了一个不属于本风格的色值`
      );
    }
  }

  // —— probe：浏览器那一层的地址 ——
  const probe = pair.probe ?? {};
  if (typeof probe.selector !== 'string' || probe.selector.trim() === '') {
    problems.push('缺 probe.selector（浏览器那一层要按它读计算样式）');
  }
  if (probe.background !== undefined && (typeof probe.background !== 'string' || probe.background.trim() === '')) {
    problems.push('probe.background 必须是非空选择器');
  }
  const read = probe.read ?? 'color';
  if (!['color', 'background', 'ring'].includes(read)) {
    problems.push(
      `probe.read 必须是 color / background / ring 之一，现在是 ${JSON.stringify(probe.read)}`
    );
  }
  if (probe.hover !== undefined && typeof probe.hover !== 'boolean') {
    problems.push('probe.hover 必须是布尔');
  }
  if (probe.toggle !== undefined && typeof probe.toggle !== 'boolean') {
    problems.push('probe.toggle 必须是布尔');
  }
  if (probe.expandList !== undefined && typeof probe.expandList !== 'boolean') {
    problems.push('probe.expandList 必须是布尔');
  }

  if (problems.length === 0) return problems;
  return problems.map((problem) => `${where}：${problem}`);
}

/** 风格文件夹列表（有 tokens.css 的才算一套风格） */
function themeIds() {
  return readdirSync(THEMES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function readThemeFile(styleId, file) {
  return readFileSync(join(THEMES_DIR, styleId, file), 'utf8');
}

/** 每个 pair 一行：色对 + 比值 + 门槛 + 口径 + 场景 */
function reportLine(pair) {
  const measured = contrastRatio(effectiveForeground(pair), pair.background);
  const value = `${pair.from === undefined ? pair.foreground : `${pair.from.base}→${effectiveForeground(pair)}`} on ${pair.background}`;
  const usage = pair.usage ?? '（缺 usage）';
  return `  ${value.padEnd(34)}${measured.toFixed(2).padStart(6)} ≥ ${String(pair.minimum).padEnd(4)} ${String(pair.basis).padEnd(9)} ${String(pair.scene).padEnd(6)} ${usage}`;
}

function main() {
  const failures = [];
  let pairCount = 0;

  console.log('check:contrast —— 从 contrast.json 与 tokens.css 重新取色，按 WCAG 2.x 相对亮度公式复算');
  console.log('（浏览器那一层：tests/e2e/contrast-computed.spec.ts 读计算样式，口径与阈值见 SPEC §3.2）\n');

  const themes = themeIds().map((id) => {
    let contrast = null;
    try {
      contrast = JSON.parse(readThemeFile(id, 'contrast.json'));
    } catch (error) {
      failures.push(`${id}：contrast.json 读不了：${error.message}`);
      return { id, contrast };
    }
    const tokensCss = readThemeFile(id, 'tokens.css');
    if (contrast.styleId !== id) {
      failures.push(`${id}：styleId 是 ${JSON.stringify(contrast.styleId)}，与文件夹名不一致`);
    }
    if (!Array.isArray(contrast.pairs) || contrast.pairs.length === 0) {
      failures.push(`${id}：pairs 是空的`);
      return { id, contrast: null };
    }
    for (const pair of contrast.pairs) {
      failures.push(...auditPair(tokensCss, pair).map((problem) => `${id} · ${problem}`));
    }
    return { id, contrast };
  });

  for (const { id, contrast } of themes) {
    if (contrast === null) continue;
    pairCount += contrast.pairs.length;
    console.log(`${id} · ${contrast.pairs.length} 对`);
    for (const pair of contrast.pairs) {
      console.log(reportLine(pair));
    }
    console.log('');
  }

  if (failures.length > 0) {
    console.log(`✗ check:contrast 失败，${failures.length} 处：`);
    for (const [index, item] of failures.entries()) {
      console.log(`  ${index + 1}. ${item}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(`✓ check:contrast 通过：${themes.length} 套风格 ${pairCount} 对，全部达到各自门槛，声明与实测一致`);
}

/**
 * 只在被直接执行时跑闸门（`npm run check:contrast` / `node scripts/check-contrast.mjs`）。
 *
 * 为什么要有这道判断：tests/unit/contrast.test.ts 要 import 本文件的 auditPair，
 * 没有这道判断的话那次 import 就会把闸门整个跑一遍——失败时还会把测试进程的退出码
 * 一起带走，于是「单测失败」和「闸门失败」互相冒充。import 只该拿到函数。
 */
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
