// The status shape and word of every process-atlas state (rule R11), checked against the atlas machines.
// Usage: node status-map.mjs [--machines <machines.mjs>] [--write <status-map.md>]
// Without --write it compares status-map.md beside the skill with the generated table and fails when it is stale.
// machines.mjs: --machines, else $FLOWLEAP_ATLAS_MACHINES, else <git root>/flowleap/docs/process-atlas/check/machines.mjs.
// Checks: every atlas state has one row and every row is an atlas state; an end state is never "wait" or "run";
// a "wait" state has a step that a person takes; a "run" state has a step that the system takes; words are unique
// in a machine and pass the check-copy deny-list. Exits 1 on a failure, 2 when machines.mjs is missing.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { denied } from './check-copy.mjs';

/** The six shapes of components.md: wait, ok (done), run (working), bad (refused), stale (stale or disputed), idle (no action). */
export const SHAPES = {
  wait: 'Waits for a person: dashed ring with a centre dot',
  ok: 'Done: filled disc with a check',
  run: 'Working: ring with a filled sector',
  bad: 'Refused or rejected: filled disc with a cross',
  stale: 'Stale or disputed: filled triangle with a bar',
  idle: 'No action needed: ring with a dash',
};

/** machine -> state -> [shape, English word]. A word is the state name in sentence case unless the name is a technical word. */
export const STATUS = {
  intake: {
    stored: ['run', 'Stored'], read: ['run', 'Read'], matched: ['run', 'Matched'],
    unreadable: ['wait', 'Unreadable'], kind_proposed: ['wait', 'Kind proposed'], duplicate_proposed: ['wait', 'Duplicate proposed'],
    match_proposed: ['wait', 'Match proposed'], ambiguous: ['wait', 'Two or more matters'], unmatched: ['wait', 'No matter found'],
    filed: ['ok', 'Filed'], duplicate: ['idle', 'Duplicate'], replaced: ['idle', 'Replaced'], not_relevant: ['idle', 'Not relevant'],
  },
  deadline: {
    awaiting_code: ['run', 'Reading the letter'], recorded: ['run', 'Office event recorded'],
    code_proposed: ['wait', 'Office event proposed'], deadline_proposed: ['wait', 'Deadline proposed'],
    manual_proposed: ['wait', 'Entered date proposed'], engine_refused: ['bad', 'Not computed'],
    active: ['ok', 'Active'], to_docket: ['ok', 'In the docket'],
    rejected: ['bad', 'Rejected'], stale: ['stale', 'Stale'], disputed: ['stale', 'Disputed'],
    no_event: ['idle', 'No office event'], no_period: ['idle', 'No period'], closed_without_act: ['idle', 'Closed without act'],
  },
  ticket: {
    opened: ['run', 'Opened'], routed: ['run', 'Assigned'], waking: ['run', 'Starting'], running: ['run', 'Running'],
    no_person: ['wait', 'No one assigned'], proposals_ready: ['wait', 'Proposals ready'],
    decided: ['ok', 'Decided'], run_failed: ['bad', 'Run failed'],
    observed: ['idle', 'Observed only'], by_hand: ['idle', 'By hand'], cancelled: ['idle', 'Cancelled'],
  },
  report: {
    checking_rule: ['run', 'Checking client rules'], proposed: ['wait', 'Proposed'], approved: ['wait', 'Approved, not sent'],
    send_unconfirmed: ['wait', 'Send not confirmed'], sent: ['ok', 'Sent'], rejected: ['bad', 'Rejected'],
    flagged: ['stale', 'Flagged'], stale: ['stale', 'Stale'],
    not_needed: ['idle', 'Not needed'], by_hand: ['idle', 'By hand'], withdrawn: ['idle', 'Withdrawn'],
  },
  outbox: {
    composed: ['run', 'Composed'], queued: ['run', 'Queued'], drafted: ['run', 'Drafted'], send_requested: ['run', 'Sending'],
    retrying: ['run', 'Retrying'], sent: ['ok', 'Sent'], refused: ['bad', 'Refused'], dead: ['bad', 'Not sent'],
  },
};

const skill = path.resolve(import.meta.dirname, '..');

/** Resolves machines.mjs from the argument, the environment or the git root; exits 2 with the fix when it is missing. */
function machinesPath(arg) {
  let p = arg ?? process.env.FLOWLEAP_ATLAS_MACHINES;
  if (!p) {
    try {
      const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: process.cwd(), encoding: 'utf8' }).trim();
      p = path.join(root, 'flowleap/docs/process-atlas/check/machines.mjs');
    } catch { /* not a git checkout: the message below names the two other ways */ }
  }
  if (!p || !existsSync(p)) {
    console.error(`status-map: no process-atlas machines.mjs${p ? ` at ${p}` : ''}. Pass --machines <path> or set FLOWLEAP_ATLAS_MACHINES (the file is flowleap/docs/process-atlas/check/machines.mjs in flowleap-harness).`);
    process.exit(2);
  }
  return path.resolve(p);
}

/** Checks STATUS against the machines; returns the failures and the Markdown table. */
export function build(machines) {
  const fails = [];
  const rows = [];
  for (const [name, m] of Object.entries(machines)) {
    const map = STATUS[name] ?? {};
    if (!STATUS[name]) fails.push(`${name}: the atlas machine has no status map`);
    const steps = m.t.flatMap(([from, to, , actor]) => [from].flat().map(f => ({ from: f, to, actor })));
    const states = new Set(steps.flatMap(s => [s.from, s.to]).filter(s => s !== '[*]'));
    const words = new Map();
    for (const s of states) if (!map[s]) fails.push(`${name}.${s}: atlas state with no shape and word`);
    for (const [s, [shape, word]] of Object.entries(map)) {
      if (!states.has(s)) { fails.push(`${name}.${s}: not a state of the atlas machine`); continue; }
      if (!SHAPES[shape]) fails.push(`${name}.${s}: unknown shape ${shape}`);
      const out = steps.filter(t => t.from === s && t.to !== s);
      if (m.terminal.includes(s) && (shape === 'wait' || shape === 'run')) fails.push(`${name}.${s}: an end state cannot be ${shape}`);
      if (shape === 'wait' && !out.some(t => /^person/.test(t.actor))) fails.push(`${name}.${s}: "wait" but no step out of it is a person's`);
      if (shape === 'run' && !out.some(t => !/^person/.test(t.actor))) fails.push(`${name}.${s}: "run" but the system takes no step out of it`);
      if (words.has(word)) fails.push(`${name}.${s}: the word "${word}" is also ${name}.${words.get(word)}`);
      words.set(word, s);
      for (const hit of denied(word)) fails.push(`${name}.${s}: the word "${word}" has a ${hit.rule}`);
      rows.push(`| ${name} | \`${s}\` | ${shape} | ${word} |`);
    }
  }
  const table = [
    '# Status map',
    '',
    'Generated by `node scripts/status-map.mjs --write status-map.md` from the process atlas (`flowleap/docs/process-atlas/check/machines.mjs`). Do not edit by hand; change `STATUS` in the script.',
    '',
    'Each atlas state shows one of the six shapes of [components.md](components.md#status-icon-with-the-atlas-word) and its word in sentence case. The German word comes from the locale dictionary.',
    '',
    '| Shape | Meaning |',
    '|---|---|',
    ...Object.entries(SHAPES).map(([k, v]) => `| ${k} | ${v} |`),
    '',
    '| Machine | State | Shape | Word |',
    '|---|---|---|---|',
    ...rows,
  ].join('\n') + '\n';
  return { fails, table };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
  const { machines } = await import(pathToFileURL(machinesPath(arg('--machines'))).href);
  const { fails, table } = build(machines);
  for (const f of fails) console.log(`FAIL ${f}`);
  const out = arg('--write');
  if (out && !fails.length) writeFileSync(out, table);
  const committed = path.join(skill, 'status-map.md');
  if (!out && (!existsSync(committed) || readFileSync(committed, 'utf8') !== table)) {
    fails.push('status-map.md is stale');
    console.log('FAIL status-map.md is stale: run node scripts/status-map.mjs --write status-map.md');
  }
  const count = Object.values(STATUS).reduce((n, m) => n + Object.keys(m).length, 0);
  console.log(`${fails.length ? 'FAIL' : 'PASS'} status-map: ${count} states in ${Object.keys(STATUS).length} machines, ${fails.length} failure(s)`);
  process.exit(fails.length ? 1 : 0);
}
