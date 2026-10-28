#!/usr/bin/env node
// Print the evidence summary of one persisted Session log.
//
//   node session-log.mjs <DSH_HOME | session dir | session*.jsonl[.zstd]> [--json]
//
// With a DSH_HOME it reads the newest Session under <DSH_HOME>/sessions.
// The summary names the preset (the last `agent-preset/selected`, else the header), the route, each turn's end reason, every tool call with its
// result head, the token usage, and the last assistant text. --json prints the
// same summary as one JSON object.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const [target, flag] = process.argv.slice(2)
if (!target) {
  console.error('usage: session-log.mjs <DSH_HOME | session dir | session file> [--json]')
  process.exit(2)
}

function newest(paths) {
  return paths.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]
}

function sessionFile(path) {
  if (statSync(path).isFile()) return path
  const logs = readdirSync(path).filter(name => /^session(\.v\d+)?\.jsonl(\.zstd)?$/.test(name))
  if (logs.length > 0) return newest(logs.map(name => join(path, name)))
  const root = readdirSync(path).includes('sessions') ? join(path, 'sessions') : path
  const dirs = readdirSync(root, { recursive: true })
    .map(rel => join(root, rel))
    .filter(p => /session-[^/]+$/.test(p) && statSync(p).isDirectory())
  if (dirs.length === 0) throw new Error(`no Session under ${root}`)
  return sessionFile(newest(dirs))
}

const file = sessionFile(target)
const raw = readFileSync(file)
// The JSONL store writes several zstd frames; node:zlib decodes only the first, the zstd CLI decodes all.
const text = file.endsWith('.zstd') ? execFileSync('zstd', ['-dc', file], { encoding: 'utf8', maxBuffer: 1 << 30 }) : raw.toString('utf8')
const events = text.split('\n').filter(Boolean).map(line => JSON.parse(line))

const summary = { file, session: null, routes: [], userMessages: [], toolCalls: [], turns: [], usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0 }, lastAssistantText: '', eventCounts: {} }
const calls = new Map()
for (const event of events) {
  summary.eventCounts[event.type] = (summary.eventCounts[event.type] ?? 0) + 1
  const data = event.data ?? {}
  switch (event.type) {
    case 'session':
      summary.session = { id: event.id, cwd: event.cwd, agentPreset: event.agentPreset, version: event.version }
      break
    case 'agent-preset/selected':
      if (summary.session) summary.session.agentPreset = data.agentPreset
      break
    case 'request/context':
      summary.routes.push(`${data.provider}/${data.model}`)
      break
    case 'user/message':
      if (data.source?.kind !== 'user') break
      summary.userMessages.push(data.content?.filter(part => part.type === 'text').map(part => part.text).join(''))
      break
    case 'tool/call': {
      const call = { turn: data.turn, name: data.name, arguments: data.arguments, result: null }
      calls.set(data.callId, call)
      summary.toolCalls.push(call)
      break
    }
    case 'tool/result': {
      const call = calls.get(data.message?.toolCallId)
      const body = data.message?.content?.filter(part => part.type === 'text').map(part => part.text).join('') ?? ''
      if (call) call.result = body.slice(0, 200)
      break
    }
    case 'assistant/message': {
      for (const key of Object.keys(summary.usage)) summary.usage[key] += data.usage?.[key] ?? 0
      const said = data.message?.content?.filter(part => part.type === 'text').map(part => part.text).join('')
      if (said) summary.lastAssistantText = said
      break
    }
    case 'turn/end':
      summary.turns.push({ turn: data.turn, reason: data.reason?.kind })
      break
    default:
      break
  }
}
summary.routes = [...new Set(summary.routes)]

if (flag === '--json') {
  console.log(JSON.stringify(summary, null, 2))
} else {
  console.log(`file: ${file}`)
  console.log(`session: ${summary.session?.id} preset=${summary.session?.agentPreset} cwd=${summary.session?.cwd}`)
  console.log(`routes: ${summary.routes.join(', ') || 'none'}`)
  for (const message of summary.userMessages) console.log(`user: ${message}`)
  for (const call of summary.toolCalls) console.log(`tool (turn ${call.turn}): ${call.name} ${call.arguments}\n  -> ${call.result ?? 'no result'}`)
  for (const turn of summary.turns) console.log(`turn ${turn.turn}: ${turn.reason}`)
  console.log(`usage: input=${summary.usage.inputTokens} cacheRead=${summary.usage.cacheReadTokens} cacheWrite=${summary.usage.cacheWriteTokens} output=${summary.usage.outputTokens} total=${summary.usage.totalTokens}`)
  console.log(`assistant: ${summary.lastAssistantText.slice(0, 600)}`)
}
