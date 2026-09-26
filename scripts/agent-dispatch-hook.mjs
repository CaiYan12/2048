#!/usr/bin/env node
/**
 * 子代理派发 / 结束钩子（agent supervision hook）
 *
 * 目的：把「派出去的子代理要被持续监督」从一件靠记性的事，变成结构上必然发生的事。
 * 使用者指出这点时，T07 已经卡了 13 分钟才被发现——而那类信号本该由机制先抓到。
 *
 * 挂在两个事件上（见 .claude/settings.json，该文件被 gitignore，所以接线是本地的，
 * 逻辑放这里是为了可版本化、可评审）：
 *
 *   PreToolUse  matcher: Agent
 *     在派发子代理**之前**触发。记一笔派发流水，并打印监督指令——不阻塞派发，
 *     永不 exit 2（那会拦住 Agent 调用本身）。
 *
 *   SubagentStop
 *     在子代理**结束时**触发。这是最强的「唤起监督」时机：此刻一定有东西待评审。
 *
 * 监督判据是落盘活动而非墙钟，阈值与处置见 docs/agents/subagent-supervision.md。
 *
 * 输入：hook 的 JSON 从 stdin 进。任何异常都吞掉并 exit 0——钩子的失败不该让派发失败。
 */

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd()
const STATE_DIR = join(PROJECT_DIR, '.superpowers', 'sdd', '2048-execution')
const STATE_FILE = join(STATE_DIR, 'watch-state.jsonl')

/**
 * 读 stdin 里的 hook JSON。
 *
 * 早先这里写成 require('node:fs')——本包是 "type": "module"，ESM 里没有 require，
 * 调用必抛，而外层 try/catch 又把它吞成空串，于是整个钩子静默变成空转：不记流水、
 * 不打印指令，exit 0 一切「正常」。这类错误最坏的形态就是无声，所以读取失败要
 * 写到 stderr 让人看见，同时仍然 exit 0——钩子的失败不该让派发失败。
 */
function readStdin() {
  try {
    return readFileSync(0, 'utf8')
  } catch (error) {
    process.stderr.write(`[agent-dispatch-hook] 读不到 stdin：${error.message}\n`)
    return ''
  }
}

function parse(raw) {
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

const hook = parse(readStdin())
const event = hook.hook_event_name || ''
const now = new Date().toISOString()

// ---- 记流水：让节奏巡检知道此刻有什么在飞 ----
try {
  mkdirSync(STATE_DIR, { recursive: true })
  const record = { at: now, event }
  if (event === 'PreToolUse') {
    const input = hook.tool_input || {}
    record.tool = hook.tool_name || 'Agent'
    record.description = String(input.description || input.prompt || '').slice(0, 160)
    record.subagent_type = input.subagent_type || null
  }
  appendFileSync(STATE_FILE, `${JSON.stringify(record)}\n`, 'utf8')
} catch {
  // 记不上不影响派发
}

const WATCH = 'node scripts/subagent-watch.mjs --since-minutes 10'

if (event === 'PreToolUse') {
  const what = String((hook.tool_input || {}).description || '子代理').slice(0, 60)
  console.log(
    [
      `[监督已武装] 派出「${what}」。`,
      `监督是控制人职责：此后每 5 分钟跑 \`${WATCH}\`，判据是**落盘活动不是墙钟**`,
      `（10 分钟无落盘→问它在做什么；15 分钟→停掉并先诊断再重派；只有临时脚本在动→确认是主要矛盾）。`,
      `本次若因「给了一个无解/欠定任务」而卡住，先自己解出来再把答案交给它，别让它证否你的派发令。`,
    ].join('\n')
  )
} else if (event === 'SubagentStop') {
  console.log(
    [
      `[子代理已结束] 此刻是唤起监督与评审的时机：`,
      `1. 跑 \`${WATCH}\` 确认没有下一个在飞的 agent 正在空转；`,
      `2. 读它的报告，派任务评审（规格符合 + 代码质量，两者都要）；`,
      `3. 把结论记进 .superpowers/sdd/2048-execution/progress.md——没有账本的干预等于没干预。`,
    ].join('\n')
  )
} else {
  // 未挂载的事件：安静放过
}

process.exit(0)
