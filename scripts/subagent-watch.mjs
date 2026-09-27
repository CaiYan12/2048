#!/usr/bin/env node
/**
 * 子代理监督探针（subagent watch）
 *
 * 目的：在实现子代理跑动的过程中，用**文件活动**而不是墙钟判断它是「在推进」还是
 * 「卡住了」。长任务是正当的——一个 40 分钟的票不能因为跑得久就被判卡住；真正的
 * 信号是**一段时间内一个字节都没落盘**。
 *
 * 判读（阈值与处置见 docs/agents/subagent-supervision.md）：
 *   有落盘活动          → 正常，不干预
 *   无落盘 > 10 分钟    → 发一条状态消息，问它在做什么
 *   无落盘 > 15 分钟    → 大概率卡住或空转，停掉并重派（带收窄后的指令）
 *   只有临时脚本在动    → 它在攻一个子问题；确认那是主要矛盾还是次要矛盾
 *
 * 第二件事：浏览器约束核查。所有者会在同一台机器上并行工作，任何可见浏览器窗口
 * 都会抢走键盘焦点。这里按「profile 是不是默认目录」找出自动化开的 Chrome——
 * 判别式不是「有没有 --user-data-dir」，因为所有者自己的 Chrome 也带这个参数。
 *
 * 用法：node scripts/subagent-watch.mjs [--since-minutes N]
 */

import { execSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const SINCE_MINUTES = Number(
  process.argv.includes('--since-minutes')
    ? process.argv[process.argv.indexOf('--since-minutes') + 1]
    : 10
)
const WATCH_DIRS = ['src', 'tests']
const now = Date.now()

/** 递归列出目录下所有文件，跳过 node_modules 与 .git */
function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

const changed = []
for (const dir of WATCH_DIRS) {
  for (const file of walk(dir)) {
    const age = Math.round((now - statSync(file).mtimeMs) / 60000)
    if (age <= SINCE_MINUTES) changed.push({ file: relative('.', file), age })
  }
}
changed.sort((a, b) => a.age - b.age)

const dirty = execSync('git status --porcelain --untracked-files=all', {
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean)

console.log(`HEAD: ${execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()}`)
console.log(`过去 ${SINCE_MINUTES} 分钟内落盘：`)
if (changed.length === 0) console.log('  （无）')
else for (const { file, age } of changed) console.log(`  ${age} 分钟前  ${file}`)
console.log(`工作树：${dirty.length === 0 ? '干净' : dirty.length + ' 项变动'}`)
for (const line of dirty) console.log(`  ${line}`)

// ---- 浏览器约束核查 ----
if (process.platform !== 'win32') {
  console.log('浏览器：非 win32，未做进程核查，请手动确认')
} else {
  // PowerShell 嵌套引号是出名的坑：-Command "..." 里的双引号会被外层吃掉。
  // 用 -EncodedCommand 传 UTF-16LE base64 绕开整层引号解释。各元素自带管道符，
  // 用空格拼接（早先误用 ' | ' 拼成 "| |"，PowerShell 直接解析失败）。
  const script = [
    "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\"",
    '| Select-Object ProcessId, CommandLine',
    '| ConvertTo-Json -Compress',
  ].join(' ')

  const rows = []
  try {
    const encoded = Buffer.from(script, 'utf16le').toString('base64')
    const raw = execSync(`powershell -NoProfile -EncodedCommand ${encoded}`, {
      encoding: 'utf8',
    }).trim()
    if (raw.startsWith('#< CLIXML')) {
      console.log('浏览器：进程核查没跑成（PowerShell 报错），请手动确认')
    } else if (raw && raw !== 'null') {
      const parsed = JSON.parse(raw)
      for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
        if (!item || !item.CommandLine) continue
        const cmd = item.CommandLine
        if (!cmd.includes('--user-data-dir')) continue
        // 不抽取路径：用户名带空格（"Einn Tzai"），引号配对还受 ConvertTo-Json
        // 转义影响，任何抽取都会截短，进而在所有者判断上误判——那会让你去杀所有者
        // 自己的浏览器。改为在整条命令行上做子串判断，抽不抽得准都影响不到它。
        rows.push({
          id: item.ProcessId,
          isOwner: /Google[\\/]+Chrome[\\/]+User Data/i.test(cmd),
          shown: cmd.slice(
            cmd.indexOf('--user-data-dir'),
            cmd.indexOf('--user-data-dir') + 70
          ),
        })
      }
    }
  } catch {
    console.log('浏览器：进程核查没跑成（powershell 查询失败），请手动确认')
  }

  const rogue = rows.filter((r) => !r.isOwner)
  if (rogue.length === 0) {
    console.log(
      rows.length === 0
        ? '浏览器：未发现带 --user-data-dir 的 Chrome'
        : `浏览器：${rows.length} 个 Chrome 的 profile 均为默认目录，未发现自动化实例`
    )
  } else {
    console.log('浏览器：**发现自动化 Chrome，违反无头约束**')
    for (const r of rogue) console.log(`  PID ${r.id}  ${r.shown}`)
    console.log('  处置：按 PID 精确结束该进程树，不要碰默认 profile 的 Chrome')
  }
}
