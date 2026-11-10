// Regression cases for the skill's checks: each case writes one defect into a fresh copy of the skill and the client
// theme in a temporary folder, runs one check, and passes only when that check exits 1 with the expected message.
// The cases include every defect that the second and the final review of PR 288 found passing. The clean copy must pass every check.
// Usage: node self-test.mjs [--only <case id part>] [--theme <ui-theme styles dir>]. Exits 1 when a case does not
// fail as expected or the clean copy fails. check-mockups cases need Playwright as check-mockups.mjs finds it.
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { themeDir } from './client-theme.mjs';

const skill = path.resolve(import.meta.dirname, '..');
const theme = themeDir();
const onlyAt = process.argv.indexOf('--only');
const only = onlyAt > 0 ? process.argv[onlyAt + 1] : null;
if (!process.env.FLOWLEAP_PLAYWRIGHT) {
  try { process.env.FLOWLEAP_PLAYWRIGHT = path.dirname(execFileSync('node', ['-p', "require.resolve('playwright/package.json')"], { cwd: path.resolve(skill, '../../../apps/web'), encoding: 'utf8' }).trim()); } catch { /* check-mockups.mjs names the other ways */ }
}

/** A fresh copy: <root>/.agents/skills/flowleap-design-language and <root>/packages/client/ui-theme/src/styles. */
function copy(withTheme = true) {
  const root = mkdtempSync(path.join(tmpdir(), 'fdl-'));
  const dest = path.join(root, '.agents/skills/flowleap-design-language');
  cpSync(skill, dest, { recursive: true, filter: s => !s.includes(`${path.sep}screenshots`) });
  if (withTheme) cpSync(theme, path.join(root, 'packages/client/ui-theme/src/styles'), { recursive: true });
  return { root, dest, mockups: path.join(dest, 'references/mockups') };
}
const edit = (file, find, replace, all = false) => {
  const s = readFileSync(file, 'utf8');
  if (!s.includes(find)) throw new Error(`self-test: "${find.slice(0, 60)}" is not in ${path.basename(file)}`);
  writeFileSync(file, all ? s.replaceAll(find, replace) : s.replace(find, replace));
};
/** Writes a CSS, HTML or JS defect file and runs check-css on it. */
const css = (name, text) => ({ check: 'check-css', run: c => { const f = path.join(c.root, name); writeFileSync(f, text); return [f]; } });
/** Edits one mockup (keeping only it and the pages it needs) and runs check-mockups on it. */
const mock = (page, find, replace, extra = []) => ({
  check: 'check-mockups',
  run: c => { edit(path.join(c.mockups, page), find, replace); return [c.mockups, '--only', page.replace(/\.html$/, '')].concat(extra); },
});
/** Applies several [find, replace, all] edits to one mockup and runs check-mockups on it. */
const mockAll = (page, edits) => ({
  check: 'check-mockups',
  run: c => { for (const [find, replace, all] of edits) edit(path.join(c.mockups, page), find, replace, all); return [c.mockups, '--only', page.replace(/\.html$/, '')]; },
});
const STATUS_WORD = '<span class="st" data-s="wait"></span>Proposals ready</span>';
const hideWord = how => mockAll('c-matter.html', [['</head>', `<style>.vh { ${how} }</style></head>`], [STATUS_WORD, '<span class="st" data-s="wait"></span><span class="vh">Proposals ready</span></span>']]);
const UNCHECK = [['row is-selected is-checked', 'row is-selected'], ['<div class="row is-checked">', '<div class="row">', true], ['check sel on" data-i="check"', 'check sel"', true]];
const EYEBROW = '<div class="eyebrow">';
const EYEBROW_DE = '<div class="eyebrow">';

/** [id, what the review or this round found, case, expected message part]. */
const CASES = [
  ['d01', 'composite font token', css('a.css', '.title { font: var(--dsw-font-xl-24); }'), 'composite font token'],
  ['d02', '11 px font token', css('a.css', '.meta { font-size: var(--dsw-font-xxxs-11-font-size); }'), 'R1: font-size is one of the client roles'],
  ['d16', 'markdown font token', css('a.css', '.h { font-size: var(--dsw-font-markdown-h1-font-size); }'), 'R1: font-size is one of the client roles'],
  ['d16a', '16 px field size outside a coarse-pointer query', css('a.css', 'input { font-size: var(--dsw-font-base-16-font-size); }'), 'R1: the 16 px size is only for a text field'],
  ['d16b', '16 px on a class that is not a field', css('a.css', '@media (pointer: coarse) { .title { font-size: var(--dsw-font-base-16-font-size); } }'), 'R1: the 16 px size is only for a text field'],
  ['d16c', '16 px under a query that also matches a fine pointer', css('a.css', '@media (pointer: coarse), (min-width: 1px) { input { font-size: var(--dsw-font-base-16-font-size); } }'), 'R1: the 16 px size is only for a text field'],
  ['d16d', '16 px under a fine pointer', css('a.css', '@media (pointer: fine) { textarea { font-size: var(--dsw-font-base-16-font-size); } }'), 'R1: the 16 px size is only for a text field'],
  ['d16f', '16 px on an element that only has a field in it', css('a.css', '@media (pointer: coarse) { .title:has(> input) { font-size: var(--dsw-font-base-16-font-size); } }'), 'R1: the 16 px size is only for a text field'],
  ['d16g', '16 px on an input that is a button', css('a.css', '@media (pointer: coarse) { input[type=submit] { font-size: var(--dsw-font-base-16-font-size); } }'), 'R1: the 16 px size is only for a text field'],
  ['d16e', 'a literal 16px on a coarse-pointer field', css('a.css', '@media (pointer: coarse) { input { font-size: 16px; } }'), 'R1: font-size is one of the client roles'],
  ['d03', 'theme token redefined', css('a.css', ':root { --dsw-alias-label-secondary: #8a8f98; --dsw-font-family: "Inter Variable"; }'), 'never defines a client theme token'],
  ['d04', 'tertiary text', css('a.css', '.time { color: var(--dsw-alias-label-tertiary); background: var(--dsw-alias-bg-base); }'), 'R3: --dsw-alias-label-tertiary is for icons only'],
  ['d05', 'font: bold', css('a.css', '.lbl { font: bold var(--dsw-font-xs-13-font-size)/var(--dsw-font-xs-13-line-height) var(--dsw-font-family); }'), '"bold" is not one'],
  ['d06', 'named colours', css('a.css', '.warn { color: tomato; background: navy; }'), 'no named colour'],
  ['d07', 'transition-property', css('a.css', '.row { transition-property: height, all; }'), '"height" may not transition'],
  ['d08a', '1 px border by longhands', css('a.css', '.row { border-bottom-width: 1px; border-bottom-style: solid; border-bottom-color: var(--dsw-alias-border-l2); }'), 'a neutral solid line of 1px'],
  ['d08b', '1 px outline and logical side', css('a.css', '.card { outline: 1px solid var(--dsw-alias-border-l3); border-block-end: 1px solid var(--dsw-alias-border-l2); }'), 'a neutral solid line of 1px'],
  ['d09', 'elevation and border in two rules', css('a.css', '.decision { box-shadow: var(--dsw-elevation-prominent); } .panel .decision { border: 0.5px solid var(--dsw-alias-border-l2); }'), 'on an element that .decision elevates'],
  ['d10a', 'keyframe dims text', css('a.css', '@keyframes fade { to { opacity: 0.5; } } .stale { animation: fade var(--ds-transition-duration) forwards; }'), 'a keyframe opacity is 0 or 1'],
  ['d10b', 'filter: opacity()', css('a.css', '.old { filter: opacity(0.5); }'), 'never dim with filter'],
  ['d12a', '@font-face', css('a.css', '@font-face { font-family: "Inter Variable"; src: url(https://rsms.me/inter.woff2); }'), 'no @font-face'],
  ['d12b', 'web font @import', css('a.css', '@import url("https://fonts.googleapis.com/css2?family=Inter");'), 'import only the client theme'],
  ['d13', 'capsule without corner-shape', css('a.css', '.pill { border-radius: 999px; }'), 'without corner-shape: round'],
  ['d14', 'extra ring beside an elevation', css('a.css', '.x { box-shadow: var(--dsw-elevation-panel), 0 0 0 1px var(--dsw-alias-border-l2); }'), 'an elevation shadow is the whole box-shadow'],
  ['d15', 'dark-only token', { check: 'check-css', run: c => {
    const base = path.join(c.root, 'packages/client/ui-theme/src/styles/base.css');
    writeFileSync(base, `${readFileSync(base, 'utf8')}\nbody[data-ds-dark-theme] { --dsw-alias-label-fake-dark-only: rgba(255, 255, 255, 0.5); }\n`);
    const f = path.join(c.root, 'a.css'); writeFileSync(f, '.x { color: var(--dsw-alias-label-fake-dark-only); }');
    return [f, '--theme', path.dirname(base)];
  } }, 'is defined only for the dark theme'],
  ['d17', 'hex in single-quoted SVG and style attributes', css('a.html', "<svg viewBox='0 0 16 16'><path fill='#5e6ad2' d='M0 0h4v4z'/><circle color=\"#ff0000\" flood-color=\"#00ff00\" r='2'/></svg><div style='padding:10px;color:#f00'>x</div>"), 'flood-color="#00ff00"'],
  ['d18', 'el.style in a script', css('a.js', "el.style.padding = '10px'; el.style.cssText = 'color: #ff0000'; el.style.setProperty('gap','7px');"), 'gap: 7px'],
  ['contrast', 'a light token missing', { check: 'contrast', run: c => {
    const f = path.join(c.root, 'packages/client/ui-theme/src/styles/design-platform.css');
    edit(f, '--dsw-alias-label-secondary: var(--dsw-static-neutral-bluish-700);', '');
    return ['--theme', path.dirname(f)];
  } }, 'unknown token --dsw-alias-label-secondary in light'],
  ['B7a', 'locales.ts with handles, a form code and an actor', { check: 'check-copy', run: c => {
    const f = path.join(c.root, 'locales.ts'); writeFileSync(f, "export const de = { owner: 'a.becker', form: 'EPO Form 2004C', actor: 'the router assigned it' }\n"); return [f];
  } }, 'de.owner: account handle "a.becker"'],
  ['B7b', 'no input file', { check: 'check-copy', run: c => { const d = path.join(c.root, 'none'); mkdirSync(d); return [d]; }, exit: 2 }, 'no locale dictionary'],
  ['21', 'a language missing in locales.ts', { check: 'check-copy', run: c => {
    const f = path.join(c.root, 'locales.ts');
    writeFileSync(f, ['en', 'de', 'es', 'fr', 'ja', 'pt', 'ru'].map(l => `export const ${l} = {\n  'title': 'Intake',\n}\n`).join(''));
    return [f];
  } }, 'no zh dictionary'],
  ['B7c', 'the theme does not load', { check: 'check-mockups', copyTheme: false, run: c => [c.mockups, '--only', 'c-matter'] }, 'the client theme did not load'],
  ['13a', 'second primary by class, only at 390 px', mock('b-intake-item.html', EYEBROW, `<span class="btn btn-primary only-sm" data-act="record">Accept <span class="kbd">⇧⌘↵</span></span>${EYEBROW}`), '2 enabled primary buttons'],
  ['13b', 'second primary by inline fill', mock('b-intake-item.html', EYEBROW, `<span class="btn" data-act="record" style="background: var(--dsw-alias-button-primary-fill); color: var(--dsw-alias-label-primary-foreground)">Accept <span class="kbd">⇧⌘↵</span></span>${EYEBROW}`), '2 enabled primary buttons'],
  ['14', 'handles in text, title and aria-label', mock('b-intake-item.de.html', EYEBROW_DE, `<p>Weitergeleitet von ABECKER, Anna.Becker, KANZLEI\\jweber und a.becker@kanzlei.de</p><span title="j.weber" aria-label="Zugewiesen an a.boehm">x</span>${EYEBROW_DE}`), 'account handle "j.weber"'],
  ['15', 'form code without office, capitalised actors, hash in aria-label', mock('b-intake-item.html', EYEBROW, `<p>Form 2004C is on page 1. Router assigned it. Engine read it.</p><button aria-label="Open 3f9a2c1b4d">o</button>${EYEBROW}`), 'hash "3f9a2c1b4d"'],
  ['16', 'day counts in words and other forms', mock('b-intake-item.de.html', EYEBROW_DE, `<p>Frist: noch 3 Werktage, drei Tage, in 2 Wochen; a 3-day period</p>${EYEBROW_DE}`), 'typed day count "3 Werktage"'],
  ['17a', 'a status with no data-atlas', mock('b-intake-item.html', EYEBROW, `<div><span class="pill"><span class="st" data-s="ok"></span>Match proposed</span></div>${EYEBROW}`), 'with no data-atlas'],
  ['17b', 'a wrong German atlas word', mock('b-intake-item.de.html', '><span class="st" data-s="wait"></span>Akte vorgeschlagen</span>', '><span class="st" data-s="wait"></span>Akte zugeordnet</span>'), 'the status map says "Akte vorgeschlagen"'],
  ['18', 'a key typed into a label', mock('b-intake-item.html', 'Other matter… <span class="kbd">M</span></span>\n', 'Other matter (O)</span>\n'), 'key "(O)" typed into a label'],
  ['19', 'the decision bar covered by a fixed overlay', mock('b-intake-item.html', '<script src="frame.js"></script>', '<div style="position: fixed; left: 0; right: 0; bottom: 0; height: 240px; background: var(--dsw-alias-bg-layer-3); z-index: 9">Toast</div><script src="frame.js"></script>'), 'the decision button is covered by div'],
  ['20', 'Activity lines drawn as boxes (light)', mock('b-intake-item.html', '</head>', '<style>.ev { background: var(--dsw-alias-bg-layer-2); box-shadow: var(--dsw-elevation-panel); }</style></head>'), 'a box inside the panel: div.ev'],
  ['20b', 'a box inside the built app\'s Records view', { ...mock('b-intake-item.html', '</body>', '<div data-testid="flowleap-records"><div class="GLRFEW_row" style="height: 44px; box-shadow: var(--dsw-elevation-panel)">Row</div><section class="nk-x6W_bar" data-fdl-part="decision" style="height: 44px; box-shadow: var(--dsw-elevation-prominent)">Bar</section></div></body>'), absent: 'nk-x6W_bar' }, 'a box inside the panel: div.GLRFEW_row'],
  ['20c', 'a card by class name and a card drawn as a button in the built app', mock('b-intake-item.html', '</body>', '<div data-testid="flowleap-records"><section class="QQ_card" style="height: 44px; box-shadow: var(--dsw-elevation-panel)">Card</section><button class="ZZ_summary" style="display: block; height: 96px; box-shadow: var(--dsw-elevation-panel)">Summary</button></div></body>'), 'a box inside the panel: section.QQ_card'],
  ['4r', 'rendered text in the icon grey', mock('b-intake-item.html', EYEBROW, `<p style="color: var(--dsw-alias-label-tertiary)">Received today at 14:16</p>${EYEBROW}`), 'in --dsw-alias-label-tertiary'],
  ['B3', 'a large surface with a 4 px radius', mock('b-intake-item.html', '</head>', '<style>.decision { border-radius: var(--dsw-radius-xs); }</style></head>'), 'with radius 4 px'],
  ['B5a', 'a board chip status with no word', mock('f-work-board.html', '<span class="fact"><span class="k">Report</span><span class="status" data-atlas="report.proposed"><span class="st" data-s="wait"></span>Proposed</span></span>', '<span class="fact"><span class="st" data-s="wait"></span>Report</span>'), 'a status icon (wait) with no word'],
  ['B5b', 'a state word hidden at 390 px', mock('c-matter.html', '<span class="status" data-atlas="ticket.proposals_ready"><span class="st" data-s="wait"></span>Proposals ready</span>', '<span class="status" data-atlas="ticket.proposals_ready"><span class="st" data-s="wait"></span><span class="hide-sm">Proposals ready</span></span>'), 'the status map says "Proposals ready"'],
  ['B6', 'an act with no path at 390 px', mock('b-intake-item.html', '<span class="more" data-overflow="more-menu">', '<span class="more">'), 'at 390 px no path to other-matter'],
  ['B6k', 'keys on a touch screen', mock('b-intake-item.html', '</head>', '<style>@media (pointer: coarse) { span.kbd.kbd.kbd { display: inline-grid !important; } }</style></head>'), 'shows on a touch screen'],
  ['B4', 'a key shown with no keycap', mock('b-intake-item.html', 'Other matter… <span class="kbd">M</span></span>\n', 'Other matter…</span>\n'), 'other-matter shows no key'],
  ['8b', 'a neutral border and a shadow on one element', mock('b-intake-item.html', '</head>', '<style>.panel .decision { border: 0.5px solid var(--dsw-alias-border-l2); }</style></head>'), 'has a neutral border and a shadow'],
  ['G7a', 'a truncated rule name', mock('c-matter.html', '<span class="hide-sm">Rule 71(3) EPC</span>', '<span class="hide-sm t">Rule 71(3) EPC: intention to grant, with the text and drawings indicated</span>'), 'is cut with an ellipsis at 1440 px'],
  ['G7b', 'a short day count', mock('c-matter.html', '<span class="r">14:17</span>', '<span class="r">117 d</span>'), 'typed day count "117 d"'],
  ['N1a', 'a status word visually hidden (1 px box, clip)', hideWord('position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap;'), 'is 1 x 1 px'],
  ['N1b', 'a status word under clip-path', hideWord('clip-path: inset(50%);'), 'has clip-path: inset(50%)'],
  ['N1c', 'a status word in a transparent colour', hideWord('color: transparent;'), 'has a transparent colour'],
  ['N2', 'a decision bar that takes no click', mock('b-intake-item.html', '</head>', '<style>.decision-dock { pointer-events: none; }</style></head>'), 'div.decision-dock gives it pointer-events: none'],
  ['N3a', 'a bulk primary with 0 rows checked', mockAll('a-intake-list.html', [...UNCHECK, ['3 selected', '0 selected']]), 'a bulk decision bar shows with 0 rows checked'],
  ['N3b', 'a bulk number that is not the checked count', mock('a-intake-list.html', '3 selected', '4 selected'), 'a bulk decision bar says 4; 3 rows are checked'],
  ['R17a', 'a due-time group outside My work', mock('a-intake-list.html', '<div class="group"><span data-atlas="intake.unreadable" class="status"><span class="st" data-s="wait"></span>Unreadable</span>', '<div class="group"><span class="gi"></span>Today'), 'the group "Today" groups by due time outside My work'],
  ['R17b', 'a list marked My work with row checkboxes, state groups and no row menu', mockAll('a-intake-list.html', [['<div class="list intake" data-state="default cmdk error context select scrolled">', '<div class="list intake" data-list="my-work" data-state="default cmdk error context select scrolled">'], ['id="row-menu"', 'id="intake-row-menu"']]), 'My work has a row checkbox or a bulk bar'],
  ['R17c', 'a My work row-menu item that is not Open, Open matter or Copy link', mock('g-my-work.html', '<div class="mi" data-i="link">Copy link</div>', '<div class="mi" data-i="x">Archive</div><div class="mi" data-i="link">Copy link</div>'), 'the My work row menu holds open, go-matter, x, link'],
  ['R17d', 'My work with no row menu', mock('g-my-work.html', 'id="row-menu"', 'id="some-menu"'), 'the My work row menu holds nothing'],
  ['R17e', 'the My work exception on another screen', mock('g-my-work.html', '<nav data-sidebar="mywork">', '<nav data-sidebar="matters">'), 'on a screen that is not My work'],
  ['R17f', 'an item pane beside the My work list', mock('g-my-work.html', '<div class="list-pane">', '<div class="detail-pane"></div><div class="list-pane">'), 'My work has an item pane beside the list'],
  ['N4', 'a context-menu label with another act and key', mock('a-intake-list.html', '<div class="mi" data-i="x" data-act="reject">Not relevant…<span class="kbds"><span class="kbd">2</span></span></div>', '<div class="mi" data-i="x" data-act="accept">Not relevant…<span class="kbds"><span class="kbd">1</span></span></div>'), 'the label "Not relevant…" names 2 acts'],
  ['N5', 'an empty and a white-space German text', { check: 'check-copy', run: c => {
    const f = path.join(c.root, 'locales.ts');
    writeFileSync(f, ['en', 'de', 'es', 'fr', 'ja', 'pt', 'ru', 'zh'].map(l => `export const ${l} = {\n  'records.accept': '${l === 'de' ? '' : 'Accept and file'}',\n  'records.reject': '${l === 'de' ? '   ' : 'Not relevant'}',\n}\n`).join(''));
    return [f];
  } }, 'de.records.accept: the text is empty or only white space'],
  ['N6', 'a decision bar inside the scrolling content', { check: 'check-mockups', run: c => {
    const f = path.join(c.mockups, 'a-intake-list.html');
    const s = readFileSync(f, 'utf8');
    const start = s.indexOf('            <div class="decision-dock">');
    const end = s.indexOf('          </div>\n        </div>\n\n        <div class="detail-pane" data-state="select">');
    if (start < 0 || end < 0) throw new Error('self-test: the docked decision bar of a-intake-list.html moved');
    const title = '<h1 class="title">Rule 71(3) communication</h1>';
    writeFileSync(f, (s.slice(0, start) + s.slice(end)).replace(title, title + s.slice(start, end)));
    return [c.mockups, '--only', 'a-intake-list'];
  } }, 'the decision bar moves'],
];

const SCRIPT = { 'check-css': 'check-css.mjs', 'check-copy': 'check-copy.mjs', 'check-mockups': 'check-mockups.mjs', contrast: 'contrast.mjs' };
let bad = 0;
const runCheck = (c, check, args) => spawnSync('node', [path.join(c.dest, 'scripts', SCRIPT[check]), ...args], { cwd: c.dest, encoding: 'utf8', env: { ...process.env, FLOWLEAP_UI_THEME: path.join(c.root, 'packages/client/ui-theme/src/styles') } });

for (const [id, what, test, expect] of CASES) {
  if (only && !id.includes(only)) continue;
  const c = copy(test.copyTheme !== false);
  try {
    const r = runCheck(c, test.check, test.run(c));
    const out = `${r.stdout}${r.stderr}`;
    const want = test.exit ?? 1;
    const hit = out.split('\n').find(l => l.includes(expect));
    const ok = r.status === want && !!hit && !(test.absent && out.includes(test.absent));
    if (!ok) bad++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${id.padEnd(5)} ${what.padEnd(48)} ${test.check} exit ${r.status} (want ${want})${hit ? `: ${hit.replace(/\S*fdl-\w+\//g, '').replace(/^FAIL /, '').trim().slice(0, 150)}` : `; no line with "${expect}"`}`);
  } finally { rmSync(c.root, { recursive: true, force: true }); }
}

if (!only) {
  const c = copy();
  try {
    for (const [check, args] of [['check-css', ['references/mockups']], ['check-copy', ['references/mockups']], ['contrast', []], ['check-mockups', ['references/mockups']]]) {
      const r = runCheck(c, check, args);
      if (r.status !== 0) bad++;
      console.log(`${r.status === 0 ? 'PASS' : 'FAIL'} clean ${check} exit ${r.status}: ${r.stdout.trim().split('\n').pop()}`);
    }
  } finally { rmSync(c.root, { recursive: true, force: true }); }
}
console.log(`${bad ? 'FAIL' : 'PASS'} self-test: ${bad} case(s) did not behave as expected`);
process.exit(bad ? 1 : 0);
