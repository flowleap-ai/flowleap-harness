// The status shape and word of every process-atlas state (rule R11), checked against the atlas machines.
// Usage: node status-map.mjs [--machines <machines.mjs>] [--write <status-map.md>]
// Without --write it compares status-map.md beside the skill with the generated table and fails when it is stale.
// machines.mjs: --machines, else $FLOWLEAP_ATLAS_MACHINES, else <git root>/flowleap/docs/process-atlas/check/machines.mjs.
// Checks: every atlas state has one row and every row is an atlas state; an end state is never "wait" or "run";
// a "wait" state has a step that a person takes; a "run" state has a step that the system takes; words are unique
// in a machine and pass the check-copy deny-list. Exits 1 on a failure, 2 when machines.mjs is missing.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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

/** machine -> state -> [shape, English word, German word]. A word is the state name in sentence case unless the name is a technical word; the client locale dictionaries carry the same words. */
export const STATUS = {
  intake: {
    stored: ['run', 'Stored', 'Gespeichert'], read: ['run', 'Read', 'Gelesen'], matched: ['run', 'Matched', 'Zugeordnet'],
    unreadable: ['wait', 'Unreadable', 'Nicht lesbar'], kind_proposed: ['wait', 'Kind proposed', 'Art vorgeschlagen'], duplicate_proposed: ['wait', 'Duplicate proposed', 'Duplikat vorgeschlagen'],
    match_proposed: ['wait', 'Match proposed', 'Akte vorgeschlagen'], ambiguous: ['wait', 'Two or more matters', 'Mehrere Akten'], unmatched: ['wait', 'No matter found', 'Keine Akte gefunden'],
    filed: ['ok', 'Filed', 'Abgelegt'], duplicate: ['idle', 'Duplicate', 'Duplikat'], replaced: ['idle', 'Replaced', 'Ersetzt'], not_relevant: ['idle', 'Not relevant', 'Nicht relevant'],
  },
  deadline: {
    awaiting_code: ['run', 'Reading the letter', 'Brief wird gelesen'], recorded: ['run', 'Office event recorded', 'Amtsereignis erfasst'],
    code_proposed: ['wait', 'Office event proposed', 'Amtsereignis vorgeschlagen'], deadline_proposed: ['wait', 'Deadline proposed', 'Frist vorgeschlagen'],
    manual_proposed: ['wait', 'Entered date proposed', 'Eingegebenes Datum vorgeschlagen'], engine_refused: ['bad', 'Not computed', 'Nicht berechnet'],
    active: ['ok', 'Active', 'Aktiv'], to_docket: ['ok', 'In the docket', 'Im Fristenkalender'],
    rejected: ['bad', 'Rejected', 'Abgelehnt'], stale: ['stale', 'Stale', 'Veraltet'], disputed: ['stale', 'Disputed', 'Strittig'],
    no_event: ['idle', 'No office event', 'Kein Amtsereignis'], no_period: ['idle', 'No period', 'Keine Frist'], closed_without_act: ['idle', 'Closed without act', 'Ohne Handlung geschlossen'],
  },
  ticket: {
    opened: ['run', 'Opened', 'Eröffnet'], routed: ['run', 'Assigned', 'Zugewiesen'], waking: ['run', 'Starting', 'Startet'], running: ['run', 'Running', 'Läuft'],
    no_person: ['wait', 'No one assigned', 'Niemand zugewiesen'], proposals_ready: ['wait', 'Proposals ready', 'Vorschläge bereit'],
    decided: ['ok', 'Decided', 'Entschieden'], run_failed: ['bad', 'Run failed', 'Lauf fehlgeschlagen'],
    observed: ['idle', 'Observed only', 'Nur beobachtet'], by_hand: ['idle', 'By hand', 'Von Hand'], cancelled: ['idle', 'Cancelled', 'Abgebrochen'],
  },
  report: {
    checking_rule: ['run', 'Checking client rules', 'Mandantenregeln werden geprüft'], proposed: ['wait', 'Proposed', 'Vorgeschlagen'], approved: ['wait', 'Approved, not sent', 'Freigegeben, nicht gesendet'],
    send_unconfirmed: ['wait', 'Send not confirmed', 'Versand nicht bestätigt'], sent: ['ok', 'Sent', 'Gesendet'], rejected: ['bad', 'Rejected', 'Abgelehnt'],
    flagged: ['stale', 'Flagged', 'Markiert'], stale: ['stale', 'Stale', 'Veraltet'],
    not_needed: ['idle', 'Not needed', 'Nicht nötig'], by_hand: ['idle', 'By hand', 'Von Hand'], withdrawn: ['idle', 'Withdrawn', 'Zurückgezogen'],
  },
  outbox: {
    composed: ['run', 'Composed', 'Verfasst'], queued: ['run', 'Queued', 'In der Warteschlange'], drafted: ['run', 'Drafted', 'Als Entwurf'], send_requested: ['run', 'Sending', 'Wird gesendet'],
    retrying: ['run', 'Retrying', 'Neuer Versuch'], sent: ['ok', 'Sent', 'Gesendet'], refused: ['bad', 'Refused', 'Abgewiesen'], dead: ['bad', 'Not sent', 'Nicht gesendet'],
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
    for (const [s, [shape, word, wordDe]] of Object.entries(map)) {
      if (!states.has(s)) { fails.push(`${name}.${s}: not a state of the atlas machine`); continue; }
      if (!SHAPES[shape]) fails.push(`${name}.${s}: unknown shape ${shape}`);
      const out = steps.filter(t => t.from === s && t.to !== s);
      if (m.terminal.includes(s) && (shape === 'wait' || shape === 'run')) fails.push(`${name}.${s}: an end state cannot be ${shape}`);
      if (shape === 'wait' && !out.some(t => /^person/.test(t.actor))) fails.push(`${name}.${s}: "wait" but no step out of it is a person's`);
      if (shape === 'run' && !out.some(t => !/^person/.test(t.actor))) fails.push(`${name}.${s}: "run" but the system takes no step out of it`);
      if (words.has(word)) fails.push(`${name}.${s}: the word "${word}" is also ${name}.${words.get(word)}`);
      if (!wordDe) fails.push(`${name}.${s}: no German word`);
      else if (words.has(`de:${wordDe}`)) fails.push(`${name}.${s}: the German word "${wordDe}" is also ${name}.${words.get(`de:${wordDe}`)}`);
      words.set(word, s);
      words.set(`de:${wordDe}`, s);
      for (const hit of [...denied(word), ...denied(wordDe ?? '')]) fails.push(`${name}.${s}: the word "${hit.match}" has a ${hit.rule}`);
      rows.push(`| ${name} | \`${s}\` | ${shape} | ${word} | ${wordDe} |`);
    }
  }
  const table = [
    '# Status map',
    '',
    'Generated by `node scripts/status-map.mjs --write status-map.md` from the process atlas (`flowleap/docs/process-atlas/check/machines.mjs`). Do not edit by hand; change `STATUS` in the script.',
    '',
    'Each atlas state shows one of the six shapes of [components.md](components.md#status-icon-with-the-atlas-word) and its word in sentence case, never the icon alone. The client locale dictionaries carry these words; `check-mockups.mjs` checks the English and the German word.',
    '',
    '| Shape | Meaning |',
    '|---|---|',
    ...Object.entries(SHAPES).map(([k, v]) => `| ${k} | ${v} |`),
    '',
    '| Machine | State | Shape | Word | German |',
    '|---|---|---|---|---|',
    ...rows,
  ].join('\n') + '\n';
  return { fails, table };
}

// realpath: a symlinked path (macOS /var is /private/var) must still count as running this file.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
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
