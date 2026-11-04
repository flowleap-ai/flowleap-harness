// Checks each transition table of machines.mjs against the method rules of the atlas README and
// compares the generated table and Mermaid chart with the block between the markers in each sheet.
// Usage: node check.mjs (check), node check.mjs --write (rewrite the blocks). No dependencies.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { machines } from './machines.mjs'

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

for (const [name, m] of Object.entries(machines)) {
  const rows = expand(m)
  const block = render(m, rows, check(name, m, rows))
  const path = join(atlas, m.sheet)
  const text = readFileSync(path, 'utf8')
  const open = `<!-- atlas:${name} -->\n`; const close = `\n<!-- /atlas:${name} -->`
  const a = text.indexOf(open); const b = text.indexOf(close)
  if (a < 0 || b < a) { fail(name, `${m.sheet} has no ${open.trim()} block`); continue }
  const updated = text.slice(0, a + open.length) + block + text.slice(b)
  if (write) writeFileSync(path, updated)
  else if (updated !== text) fail(name, `${m.sheet} differs from the generated table or chart; run node check.mjs --write`)
}
if (!failed) console.log(`ok: ${Object.keys(machines).length} machines`)
process.exit(failed ? 1 : 0)
