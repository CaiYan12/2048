import { readFileSync, writeFileSync } from 'node:fs'

/**
 * 行尾免疫的替换：读原文 → 归一成 LF 再匹配 → 替换 → 按原行尾写回。
 * 这个工作树开着 core.autocrlf=true，盘上是 CRLF；上一版脚本用 LF 查找串，
 * 六处多行匹配全部落空（单行的那六处反而命中）。
 */
function apply(file, find, replace) {
  const raw = readFileSync(file, 'utf8')
  const eol = raw.includes('\r\n') ? '\r\n' : '\n'
  const normalised = raw.replace(/\r\n/g, '\n')
  const count = normalised.split(find).length - 1
  if (count !== 1) {
    console.log(`✗ ${file}：期望 1 处、实际 ${count} 处`)
    if (count === 0) {
      // 诊断：把最接近的一行打出来
      const firstWord = find.split('\n')[0].slice(0, 40)
      const line = normalised.split('\n').find((l) => l.includes(firstWord.slice(0, 24)))
      console.log(`   找不到的定位词：「${firstWord.replace(/\n/g, '')}」`)
      console.log(`   文件里最接近的行：${line ? line.trim().slice(0, 120) : '(无)'}`)
    }
    return false
  }
  writeFileSync(file, normalised.replace(find, replace).replace(/\n/g, eol))
  console.log(`✓ ${file}（1 处）`)
  return true
}

const jobs = [
  {
    file: 'docs/specs/settings-drawer.md',
    find: `- \`npm run check:contrast\` — **3 styles, 141 pairs** (was **125** before this group; the \`settings\`
  scene is the eighth in \`SCENES\` and in \`contrast-computed.spec.ts\`'s \`setupScene\`).`,
    replace: `- \`npm run check:contrast\` — **3 styles, 141 pairs** (was **131** before this group: the \`settings\`
  scene adds ten pairs — six switch pairs, two per style, plus each style's drawer-surface title and
  row label — and it is the eighth in \`SCENES\` and in \`contrast-computed.spec.ts\`'s \`setupScene\`).`,
  },
  {
    file: 'docs/specs/settings-drawer.md',
    find: `## To sync when the implementation lands

- \`README.md\`'s settings group: its status line and the two bullets this spec delivers.
- \`docs/SPEC.md\` §3.4 (amended in place by decision 9) and §3.2 if the drawer's existence changes how
  the style contract is described.
- **Four in-place amendments created by the design stage, before or with the implementation.** This
  spec's own motion decision — **done** in the revision above, and the published issue carries it. Each
  of the three cards' §6 motion paragraph gains the drawer's exception. And Claude's card §7 stops
  enumerating three places for its warm colour and says four. Until those three land, each of those
  cards contains a sentence the drawer contradicts.
- \`GLOSSARY.md\`: the new term and its avoid list, and the second-pass entry amended (decision 5).
- The three design cards: a new section each (the toast and the easter egg set the precedent), plus the
  colour roles each style gains in its §2 and the new pair notes in its §9.
- \`AGENTS.md\`: a dated status section for this group, in the shape the existing status sections use.
- The shell's own comment on the cleared page state, and the sound component's note about its
  accessible name (decision 14).
- The design process's state file, so the next session sees this group's design stage as done.`,
    replace: `## To sync when the implementation lands

**Every item below landed with the implementation (2026-10-09, T37–T40).** Kept as a record of what
the group owed and delivered — not as outstanding work.

- **Landed** — \`README.md\`'s settings group: its status line marks this first slice as delivered (the
  entry, the drawer shell and the moved sound switch) and ticks that bullet; the group's other six
  bullets stay open, which is what "they are not in this slice" looks like.
- **Landed** — \`docs/SPEC.md\` §3.4, amended in place by decision 9. §3.2 needed no change: the drawer
  does not alter how the style contract is described.
- **Landed** — the four in-place amendments the design stage created: this spec's own motion decision
  (revised above and carried by the published issue), each of the three cards' §6 motion paragraph now
  carries the drawer's exception, and Claude's card §7 enumerates four places for its warm colour.
- **Landed** — \`GLOSSARY.md\`: the 设置 section with the new term and its avoid list, and the
  second-pass entry amended (decision 5).
- **Landed** — the three design cards: a new §12 each (the toast and the easter egg set the precedent),
  the colour roles their §2 gained and the new pair notes in their §9.
- **Landed** — \`AGENTS.md\`: a dated status section for this group, in the shape the existing status
  sections use.
- **Landed** — the shell's comment on the cleared page state, and the sound component's note about its
  accessible name (decision 14).
- **Landed** — the design process's state file, so the next session reads this group's design stage as
  done.`,
  },
  {
    file: 'docs/tickets/40-settings-drawer-contract-gates.md',
    find: '当前基线 **131 対**',
    replace: '当前基线 **141 対**（T39 落地后）',
  },
  {
    file: 'docs/specs/settings-drawer.md',
    find: `   scrim is the layer's "outside" for the purposes of click-to-close and the thing that makes "nothing
   else is clickable" true. It is one element doing one job; the entry itself sits under it while the
   drawer is open, so clicking the entry again lands on the scrim and closes.`,
    replace: `   scrim is the layer's "outside" for the purposes of click-to-close and the thing that makes "nothing
   else is clickable" true. It is one element doing one job; the entry itself sits under the scrim
   *and* under the drawer while the drawer is open, so clicking it again hits the drawer's own panel
   and does nothing to the page — the ways out from there are the close control and \`Esc\`, and the
   scrim takes the rest of the viewport.`,
  },
  {
    file: 'docs/specs/settings-drawer.md',
    find: `- [x] Opening the drawer leaves nothing on the page clickable: every pointer path to the board, the
      direction pad, the swipe surface, the new-game button, the statistics entry and the result
      layer's controls lands on the scrim.`,
    replace: `- [x] Opening the drawer leaves nothing on the page clickable: every pointer path to the board, the
      direction pad, the swipe surface, the new-game button, the statistics entry and the result
      layer's controls lands on the scrim or on the drawer itself — nothing reaches the page.`,
  },
  {
    file: 'docs/specs/settings-drawer.md',
    find: `   This requires the page content to be wrapped in one element, with the scrim and the drawer left
   outside it but still inside the shell, so the style tokens keep inheriting.`,
    replace: `   This requires the page content to be wrapped in one element, with the scrim and the drawer left
   outside it but still inside the shell, so the style tokens keep inheriting.

   **An accepted consequence of that scoping, recorded rather than discovered later:** the cannon sits
   outside the wrapper too, and HTML has no way to exempt a descendant from an ancestor's inertness —
   so its in-flow reduced-motion line (\`.cannon__still\`, the one visible trace a reduced-motion player
   gets) moved from inside the game column to the top of the page, above the content it used to sit
   under. The full-motion canvas does not care (it is \`position: fixed\`). Accepted because the
   alternative is either inverting decision 6 or exempting the cannon from inertness, which the
   platform does not allow; the placement is pinned by the e2e case that proves the still line sits
   outside the inert block.`,
  },
]

let failures = 0
for (const job of jobs) {
  if (!apply(job.file, job.find, job.replace)) failures++
}

if (failures > 0) {
  console.log(`\n✗ ${failures} 处替换失败`)
  process.exitCode = 1
} else {
  console.log(`\n✓ 全部 ${jobs.length} 处替换成功`)
}
