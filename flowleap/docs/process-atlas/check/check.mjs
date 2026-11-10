// Checks each transition table of machines.mjs against the method rules of the atlas README, checks that every
// state that waits for a person has a task (sheet 00) and that every live state of a machine with evidence names its
// facts and their routes, and compares the generated tables and Mermaid charts with the blocks between the markers
// in each sheet.
// Usage: node check.mjs (check), node check.mjs --write (rewrite the blocks). No dependencies.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { evidence, machines, routes, taskKinds, tasks } from './machines.mjs'

const atlas = join(dirname(fileURLToPath(import.meta.url)), '..')
const write = process.argv.includes('--write')
let failed = false
const fail = (name, msg) => { failed = true; console.error(`FAIL ${name}: ${msg}`) }

const expand = (m) => m.t.flatMap(([from, to, ...rest]) => (Array.isArray(from) ? from : [from]).map((f) => [f, to, ...rest]))
const label = (event) => (event[0].toLowerCase() + event.slice(1)).replaceAll(':', '').replaceAll(';', ',')
const state = (s) => (s === '[*]' ? 'start' : `\`${s}\``)

function check(name, m, rows) {
  const states = new Set(rows.flatMap(([f, to]) => [f, to]).filter((s) => s !== '[*]'))
  const allowed = (f, to) => m.loops.some(([a, b]) => a === f && b === to) || m.corrections.some(([a, b]) => a === f && b === to)
  for (const s of m.terminal) if (!states.has(s)) fail(name, `end state ${s} is not a state`)
  for (const [f, to] of rows) if (f === to && !m.loops.some(([a]) => a === f)) fail(name, `undeclared self step on ${f}`)
  for (const [f, to] of rows) if (m.terminal.includes(f) && !allowed(f, to)) fail(name, `end state ${f} has an undeclared step to ${to}`)
  for (const [f, to] of [...m.loops, ...m.corrections]) if (!rows.some(([a, b]) => a === f && b === to)) fail(name, `declared step ${f} -> ${to} has no row`)
  for (const row of m.t) if (row.length !== 5 || row.some((c) => !c || c.length === 0)) fail(name, `row without actor or evidence: ${row[2]}`)
  const reach = new Set([m.start])
  for (let grew = true; grew;) { grew = false; for (const [f, to] of rows) if (reach.has(f) && !reach.has(to)) { reach.add(to); grew = true } }
  for (const s of states) if (!reach.has(s)) fail(name, `${s} is not reachable from the start`)
  for (const s of states) {
    if (m.terminal.includes(s)) continue
    if (!rows.some(([f, to]) => f === s && to !== s)) fail(name, `${s} is stuck`)
    const seen = new Set([s]); const queue = [s]; let ends = false
    while (queue.length > 0 && !ends) { const c = queue.shift(); ends = m.terminal.includes(c); for (const [f, to] of rows) if (f === c && !seen.has(to)) { seen.add(to); queue.push(to) } }
    if (!ends) fail(name, `${s} cannot reach an end state`)
  }
  return states.size
}

function render(m, rows, count) {
  const transitions = rows.filter(([f]) => f !== '[*]').length
  const table = m.t.map(([f, to, ev, actor, evidence]) => `| ${Array.isArray(f) ? f.map(state).join(', ') : state(f)} | ${state(to)} | ${ev} | ${actor} | ${evidence} |`)
  const corrections = m.corrections.map(([f, to]) => `${state(f)} to ${state(to)}`)
  return [
    `It has **${count} states and ${transitions} transitions**, plus the start.`, '',
    '| From | To | Event | Actor | Evidence in the record log |', '|---|---|---|---|---|', ...table, '',
    `End states: ${m.terminal.map(state).join(', ')}.${corrections.length > 0 ? ` Declared corrections out of an end state: ${corrections.join('; ')}.` : ''}`, '',
    '```mermaid', 'stateDiagram-v2',
    ...rows.map(([f, to, ev]) => `    ${f} --> ${to}: ${label(ev)}`),
    ...m.terminal.map((s) => `    ${s} --> [*]`),
    '```',
  ].join('\n')
}

function checkTasks() {
  for (const [name, m] of Object.entries(machines)) {
    if (name === 'task') continue
    const rows = expand(m)
    const states = new Set(rows.flatMap(([f, to]) => [f, to]).filter((s) => s !== '[*]'))
    const waits = [...states].filter((s) => !m.terminal.includes(s) && rows.some(([f, , , actor]) => f === s && /^person/.test(actor)))
    for (const s of waits) if (!tasks[name]?.[s]) fail('tasks', `${name}.${s} waits for a person and has no task`)
    for (const [s, kind] of Object.entries(tasks[name] ?? {})) {
      if (!states.has(s)) fail('tasks', `${name}.${s} is not a state`)
      else if (typeof kind === 'string' ? !taskKinds[kind] : !kind.none) fail('tasks', `${name}.${s} names no task kind and no reason`)
    }
  }
  for (const name of Object.keys(tasks)) if (!machines[name]) fail('tasks', `${name} is not a machine`)
  const used = new Set(Object.values(tasks).flatMap((m) => Object.values(m)).filter((k) => typeof k === 'string'))
  for (const [kind, k] of Object.entries(taskKinds)) {
    if (!['state', 'schedule', 'mention'].includes(k.from)) fail('tasks', `${kind} has no source`)
    if ((k.from === 'state') !== used.has(kind)) fail('tasks', `${kind} is ${k.from === 'state' ? 'a state task that no state opens' : 'opened by a state but not marked from: state'}`)
    if (!k.words || !k.owner || !k.due || !k.chain || !k.closes) fail('tasks', `${kind} lacks words, owner, due, chain or closes`)
  }
}

function renderTasks() {
  const kind = (k) => `**${taskKinds[k].words}** (\`${k}\`) | ${taskKinds[k].demo ? 'Yes' : 'Later'} | ${taskKinds[k].owner} | ${taskKinds[k].due} | ${taskKinds[k].chain} | ${taskKinds[k].closes}`
  const mapped = Object.entries(tasks).flatMap(([name, m]) => Object.entries(m).map(([s, k]) => `| ${name} | \`${s}\` | ${typeof k === 'string' ? kind(k) : `no task: ${k.none} | | | | |`} |`))
  const other = Object.keys(taskKinds).filter((k) => taskKinds[k].from !== 'state').map((k) => `| ${taskKinds[k].from} | | ${kind(k)} |`)
  return ['| Machine | State | Task | First demo | Owner | Due | Escalation | Closes when |', '|---|---|---|---|---|---|---|---|', ...mapped, ...other].join('\n')
}

function checkEvidence(name, m, rows) {
  const states = new Set(rows.flatMap(([f, to]) => [f, to]).filter((s) => s !== '[*]'))
  for (const s of states) if (!m.terminal.includes(s) && !evidence[name][s]) fail(`${name}-evidence`, `${s} names no evidence`)
  for (const [s, e] of Object.entries(evidence[name])) {
    if (!states.has(s)) fail(`${name}-evidence`, `${s} is not a state`)
    if (!e.task || e.facts.length === 0) fail(`${name}-evidence`, `${s} lacks its task or its facts`)
    for (const [fact, route] of e.facts) if (!fact || !routes[route]) fail(`${name}-evidence`, `${s}: fact "${fact}" has no known route`)
  }
}

function renderEvidence(name) {
  const rows = Object.entries(evidence[name]).flatMap(([s, e]) => e.facts.map(([fact, route], i) => `| ${i === 0 ? `\`${s}\`` : ''} | ${i === 0 ? e.task : ''} | ${fact} | ${routes[route]} |`))
  return ['| State | Next task | Fact that the task needs | Where it lives |', '|---|---|---|---|', ...rows].join('\n')
}

function sync(sheet, name, block) {
  const path = join(atlas, sheet)
  const text = readFileSync(path, 'utf8')
  const open = `<!-- atlas:${name} -->\n`; const close = `\n<!-- /atlas:${name} -->`
  const a = text.indexOf(open); const b = text.indexOf(close)
  if (a < 0 || b < a) { fail(name, `${sheet} has no ${open.trim()} block`); return }
  const updated = text.slice(0, a + open.length) + block + text.slice(b)
  if (write) writeFileSync(path, updated)
  else if (updated !== text) fail(name, `${sheet} differs from the generated table or chart; run node check.mjs --write`)
}

for (const [name, m] of Object.entries(machines)) {
  const rows = expand(m)
  sync(m.sheet, name, render(m, rows, check(name, m, rows)))
  if (evidence[name]) { checkEvidence(name, m, rows); sync(m.sheet, `${name}-evidence`, renderEvidence(name)) }
}
checkTasks()
sync(machines.task.sheet, 'task-map', renderTasks())
if (!failed) console.log(`ok: ${Object.keys(machines).length} machines, ${Object.keys(taskKinds).length} task kinds`)
process.exit(failed ? 1 : 0)
