// Writes the Mailbox mirror mockups, each page in English (<name>.html) and German (<name>.de.html), from this one
// source. Usage: node build.mjs. Edit this file, never the generated HTML. README.md names the source of each value
// and every example.
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const OUT = import.meta.dirname;
const RECORDS_CSS = '../../../../.agents/skills/flowleap-design-language/references/mockups/records.css';

let lang = 'en';
const t = (en, de) => (lang === 'de' ? de : en);

// ---------- data ----------
/** The time of the last read of the Mailbox: an example. */
const READ_DAY = '2026-11-10', READ_HM = '09:00';
const VIEWER = { name: 'Lena Hoffmann', role: ['Patent attorney', 'Patentanwältin'] };

/** The seed applications (flowleap-seed-firm): the firm's reference, the application number with its check digit, the applicant as published. */
const A = {
  'SF-2021-0011': { app: 'EP21755382', check: '5', applicant: 'Wago Verwaltungsgesellschaft mbH' },
  'SF-2026-0019': { app: 'EP21810318', check: '2', applicant: 'Phoenix Contact GmbH & Co. KG' },
  'SF-2022-0024': { app: 'EP22213933', check: '9', applicant: 'Wago Verwaltungsgesellschaft mbH' },
  'SF-2023-0042': { app: 'EP23755468', check: '8', applicant: 'Renishaw plc' },
  'SF-2023-0045': { app: 'EP23771920', check: '8', applicant: 'Renishaw plc' },
  'SF-2024-0007': { app: 'EP24166597', check: '5', applicant: 'Wago Verwaltungsgesellschaft mbH' },
};
/** The titles of the letters, as the EPO writes them (flowleap-os lib/record/office-codes.mjs; `reps` is a letter of the EPO sandbox Mailbox). */
const TITLE = {
  r71: ['Communication under Rule 71(3) EPC', 'Mitteilung nach Regel 71(3) EPÜ'],
  a94: ['Communication under Article 94(3) EPC', 'Mitteilung nach Artikel 94(3) EPÜ'],
  grant: ['Decision to grant a European patent (Article 97(1) EPC)', 'Entscheidung über die Erteilung eines europäischen Patents (Artikel 97(1) EPÜ)'],
  opp: ['Communication of notices of opposition (Rule 79(1) EPC)', 'Mitteilung von Einsprüchen (Regel 79(1) EPÜ)'],
  reps: ['Change in the list of professional representatives', 'Änderung der Liste der zugelassenen Vertreter'],
};
/**
 * The letters of the Mailbox: the seed letters with their dispatch dates, and one letter with no application (`x1`).
 * `read` and `handled` are the two flags of the MyEPO list; their values here are examples.
 */
const LETTERS = [
  { id: 'x1', key: '', kind: 'reps', date: '2026-11-09', read: false, handled: false },
  { id: 'r15', key: 'SF-2026-0019', kind: 'opp', date: '2026-10-14', read: false, handled: false },
  { id: 'r18', key: 'SF-2023-0045', kind: 'r71', date: '2026-09-29', read: true, handled: false },
  { id: 'r6', key: 'SF-2024-0007', kind: 'a94', date: '2026-09-18', read: false, handled: false },
  { id: 'r16', key: 'SF-2023-0042', kind: 'a94', date: '2026-06-09', read: true, handled: false },
  { id: 'r5', key: 'SF-2022-0024', kind: 'r71', date: '2026-04-01', read: true, handled: false },
  { id: 'r3', key: 'SF-2021-0011', kind: 'grant', date: '2025-10-23', read: true, handled: true },
  { id: 'r2', key: 'SF-2021-0011', kind: 'r71', date: '2025-08-29', read: true, handled: true },
  { id: 'r1', key: 'SF-2021-0011', kind: 'r71', date: '2025-06-20', read: true, handled: true },
  { id: 'r4', key: 'SF-2022-0024', kind: 'a94', date: '2024-09-11', read: true, handled: true },
];
/** The letter that the default view shows open. */
const OPEN = 'r18';

// ---------- words and formats ----------
const MO = { en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], de: ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'] };
const date = iso => { const d = new Date(`${iso}T12:00:00Z`); return lang === 'de' ? `${d.getUTCDate()}. ${MO.de[d.getUTCMonth()]} ${d.getUTCFullYear()}` : `${d.getUTCDate()} ${MO.en[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const at = (iso, hm) => `${date(iso)}, ${hm}`;
const app = key => { const a = A[key].app; return `EP ${a.slice(2, 4)} ${a.slice(4, 7)} ${a.slice(7)}.${A[key].check}`; };
/** Data from a source (an EPO title, an applicant name): not product copy. */
const nm = s => `<span data-verbatim>${s}</span>`;
const title = l => nm(t(...TITLE[l.kind]));
const none = () => `<span class="muted">${t('None', 'Keine')}</span>`;

const KEYS = { 'open-letter': ['O'], retry: ['R'], search: ['⌘K'] };
const caps = act => KEYS[act].map(x => `<span class="kbd">${x}</span>`).join('');
const btn = (label, { kind = 'secondary', icon = '', cls = '', attrs = '', act = '' } = {}) =>
  `<span class="btn btn-${kind}${cls ? ` ${cls}` : ''}"${icon ? ` data-i="${icon}"` : ''}${act ? ` data-act="${act}"` : ''} role="button"${attrs}>${label}${act ? ` ${caps(act)}` : ''}</span>`;
const iconbtn = (icon, label, cls = '') => `<span class="iconbtn${cls ? ` ${cls}` : ''}" data-i="${icon}" role="button" aria-label="${label}"></span>`;

/** The handled flag of MyEPO: a status shape with its word. It is not an atlas state, so it uses the class cstatus. */
const handled = (l, cls = 'cstatus') => { const [shape, en, de] = l.handled ? ['ok', 'Handled', 'Erledigt'] : ['wait', 'Not handled', 'Nicht erledigt']; return `<span class="${cls}${cls === 'cpill' ? ` ${shape}` : ''}"><span class="cst" data-s="${shape}"></span>${t(en, de)}</span>`; };
const readWord = l => l.read ? t('Read', 'Gelesen') : t('Unread', 'Ungelesen');

// ---------- the page frame ----------
const page = ({ title, body }) => `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<!-- Generated from build.mjs: edit that file and run node build.mjs, never this file -->
<link rel="stylesheet" href="${RECORDS_CSS}">
<link rel="stylesheet" href="../add-client/add-client.css">
<link rel="stylesheet" href="../client-model/client-model.css">
<link rel="stylesheet" href="surfaces.css">
<link rel="stylesheet" href="mailbox.css">
</head>
<body>
${body}
<script src="frame.js"></script>
<script src="table.js"></script>
</body>
</html>
`;
const app_ = body => `<div class="app">
  <nav data-sidebar="letters" data-name="${VIEWER.name}" data-role="${t(...VIEWER.role)}" data-count=""></nav>
  <main class="main">
    <section class="panel fixed">
${body}
    </section>
  </main>
</div>`;
const topbar = (crumbs, right = '') => `      <header class="topbar">
        <div class="crumbs">${crumbs}</div>
        <div class="bar-right">${right}</div>
      </header>`;
const crumb = (here = '') => here
  ? `<span class="ico hide-sm" data-i="inbox"></span><a class="lvl hide-sm" href="mailbox${lang === 'de' ? '.de' : ''}.html">${t('Letters', 'Schreiben')}</a><span class="sep hide-sm">›</span><span class="here">${here}</span>`
  : `<span class="ico" data-i="inbox"></span><span class="here">${t('Letters', 'Schreiben')}</span>`;
const section = (h, inner, right = '') => `<div class="section"><div class="section-h"><h2>${h}</h2>${right ? `<span class="right">${right}</span>` : ''}</div>${inner}</div>`;
const notice = (cls, icon, lead, rest = '', act = '') => `<div class="notice${cls ? ` ${cls}` : ''}" data-i="${icon}"><div><span class="lead">${lead}</span>${rest ? ` <span>${rest}</span>` : ''}</div>${act ? `<span class="spacer"></span>${act}` : ''}</div>`;
const work = scroll => `      <div class="work">
        <div class="work-scroll"><div class="flow">
${scroll}
        </div></div>
      </div>`;

// ---------- the table ----------
const COLS = () => [
  { key: 'kind', label: t('Document', 'Dokument'), cls: 'c-doc' },
  { key: 'app', label: t('Application', 'Anmeldung'), cls: 'c-app w-split' },
  { key: 'key', label: t('Your reference', 'Ihr Zeichen'), cls: 'c-key' },
  { key: 'applicant', label: t('Applicant', 'Anmelder'), cls: 'c-applicant w-split' },
  { key: 'date', label: t('Dispatched', 'Versandt'), cls: 'c-date w-split' },
  { key: 'read', label: t('Read', 'Gelesen'), cls: 'c-read w-split' },
  { key: 'handled', label: t('Handled', 'Erledigt'), cls: 'c-handled' },
];
const suffix = () => (lang === 'de' ? '.de' : '');
const stateOf = (l, view) => (l.id === OPEN ? (view === 'unopened' ? 'unopened' : 'default') : l.id);
function rows(view) {
  const selected = view === 'default' || view === 'unopened' ? OPEN : view;
  return LETTERS.map(l => {
    const a = l.key ? A[l.key] : null;
    return {
      href: `mailbox${suffix()}.html?state=${stateOf(l, view)}`,
      narrow: `letter${suffix()}.html?state=${l.id === OPEN ? 'default' : l.id}`,
      values: { date: l.date, kind: l.kind, key: l.key.toLowerCase(), app: a ? a.app : '', applicant: a ? a.applicant.split(' ')[0].toLowerCase() : '', read: l.read ? 'read' : 'unread', handled: l.handled ? 'handled' : 'not', text: `${t(...TITLE[l.kind])} ${l.key} ${a ? `${a.app} ${a.applicant}` : ''}`.toLowerCase() },
      cls: `${l.id === selected ? 'is-sel' : ''}${l.read ? '' : ' is-unread'}`.trim(),
      sel: l.id === selected,
      cells: [
        `<span class="doc-line">${l.read ? '' : `<span class="unread-dot" role="img" aria-label="${t('Unread', 'Ungelesen')}"></span>`}<span class="clamp1">${title(l)}</span></span><span class="only-split muted t12 num">${date(l.date)}</span>`,
        a ? `<span class="num">${app(l.key)}</span>` : none(),
        l.key ? `<span class="num">${l.key}</span>` : none(),
        a ? nm(a.applicant) : none(),
        `<span class="num">${date(l.date)}</span>`,
        l.read ? `<span class="muted">${readWord(l)}</span>` : readWord(l),
        handled(l),
      ],
    };
  });
}
const table = view => {
  const cols = COLS();
  const head = cols.map(c => `<th class="${c.cls}" data-sort="${c.key}"${c.key === 'date' ? ' aria-sort="descending"' : ''} scope="col"><span>${c.label}</span><span class="sort" data-i="chevd" aria-hidden="true"></span></th>`).join('');
  const body = rows(view).map(r => `<tr data-href="${r.href}" data-narrow-href="${r.narrow}"${Object.entries(r.values).map(([k, v]) => ` data-${k}="${v}"`).join('')}${r.cls ? ` class="${r.cls}"` : ''}${r.sel ? ' aria-selected="true"' : ''}>${r.cells.map((c, i) => `<td class="${cols[i].cls}">${c}</td>`).join('')}</tr>`).join('\n');
  const sizes = [10, 25, 50, 100].map(n => `<option${n === 25 ? ' selected' : ''}>${n}</option>`).join('');
  return `${filters()}<div class="dt-wrap"><table class="dt lt-tbl mb-tbl" data-table data-total="${LETTERS.length}" data-page-size="25"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table><div class="dt-none" hidden>${t('No letter matches these filters.', 'Kein Schreiben passt zu diesen Filtern.')}</div></div>
<div class="dt-foot"><label class="dt-size">${t('Rows per page', 'Zeilen pro Seite')} <select class="field small" data-size aria-label="${t('Rows per page', 'Zeilen pro Seite')}">${sizes}</select></label><span class="dt-range" data-range></span>${iconbtn('back', t('Previous page', 'Vorherige Seite'), 'boxed dt-prev')}${iconbtn('chev', t('Next page', 'Nächste Seite'), 'boxed dt-next')}</div>`;
};
const select = (key, label, options) => `<select class="field small" data-filter="${key}" aria-label="${label}"><option value="">${label}: ${t('all', 'alle')}</option>${options.map(([v, w]) => `<option value="${v}">${w}</option>`).join('')}</select>`;
const filters = () => `<div class="dt-filters"><div class="fwrap find" data-i="search"><input class="field small" data-filter="text" aria-label="${t('Find in this table', 'In dieser Tabelle suchen')}" placeholder="${t('Find a letter', 'Schreiben suchen')}"></div>${select('handled', t('Handled', 'Erledigt'), [['not', t('Not handled', 'Nicht erledigt')], ['handled', t('Handled', 'Erledigt')]])}${select('read', t('Read', 'Gelesen'), [['unread', t('Unread', 'Ungelesen')], ['read', t('Read', 'Gelesen')]])}${select('applicant', t('Applicant', 'Anmelder'), [['wago', 'Wago'], ['renishaw', 'Renishaw'], ['phoenix', 'Phoenix Contact']])}${select('kind', t('Document', 'Dokument'), Object.keys(TITLE).map(k => [k, t(...TITLE[k])]))}</div>`;

// ---------- one letter ----------
/** What a person sees of one letter: in the reading pane and on the letter page. */
function letterBody(l, isOpen) {
  const a = l.key ? A[l.key] : null;
  const prop = (k, v) => `<div class="prop"><span class="k">${k}</span><span class="v">${v}</span></div>`;
  const props = `<div class="pane-props">
${prop(t('Application', 'Anmeldung'), a ? `<span class="num">${app(l.key)}</span>` : none())}
${prop(t('Your reference', 'Ihr Zeichen'), l.key ? `<span class="num">${l.key}</span>` : none())}
${prop(t('Applicant', 'Anmelder'), a ? nm(a.applicant) : none())}
${prop(t('Dispatched', 'Versandt'), `<span class="num">${date(l.date)}</span>`)}
${prop(t('Read', 'Gelesen'), l.read ? t('Read in MyEPO', 'In MyEPO gelesen') : t('Unread in MyEPO', 'In MyEPO ungelesen'))}
${prop(t('Handled', 'Erledigt'), l.handled ? t('Handled in MyEPO', 'In MyEPO erledigt') : t('Not handled in MyEPO', 'In MyEPO nicht erledigt'))}
</div>`;
  const head = `<div class="eyebrow">${handled(l, 'cpill')}<span>${t('MyEPO Mailbox', 'MyEPO-Mailbox')}</span></div>
<h1 class="title">${title(l)}</h1>${props}`;
  const pdf = isOpen
    ? section(t('The letter', 'Das Schreiben'), `<div class="letter scan"><img src="scan/r71-3-page-1.webp" alt="${t('Page 1 of the communication under Rule 71(3) EPC of 29 Sep 2026', 'Seite 1 der Mitteilung nach Regel 71(3) EPÜ vom 29. Sept. 2026')}" width="910" height="1287"></div>
<div class="scan-pages"><span>${t('Page 1 of 4', 'Seite 1 von 4')}</span></div>`, btn(t('Download', 'Herunterladen'), { icon: 'download', kind: 'ghost' }))
    : section(t('The letter', 'Das Schreiben'), `<div class="unopened"><span class="unopened-i" data-i="mail"></span><div><div class="h">${t('Not opened here yet', 'Hier noch nicht geöffnet')}</div><p class="muted">${l.read ? t('Opening downloads the PDF from MyEPO.', 'Öffnen lädt das PDF aus MyEPO herunter.') : t('Opening downloads the PDF from MyEPO. MyEPO then shows the letter as read for everyone at your firm.', 'Öffnen lädt das PDF aus MyEPO herunter. MyEPO zeigt das Schreiben dann für alle in Ihrer Kanzlei als gelesen.')}</p>${btn(t('Open the letter', 'Schreiben öffnen'), { kind: 'primary', icon: 'eye', act: 'open-letter', attrs: l.id === OPEN ? ` data-href="?state=default"` : '' })}</div></div>`);
  return `${head}${pdf}`;
}
const isOpen = (l, view) => l.id === OPEN && view !== 'unopened';
const letterOf = view => LETTERS.find(l => l.id === (view === 'default' || view === 'unopened' ? OPEN : view));

function mailbox() {
  const views = ['default', 'unopened', ...LETTERS.filter(l => l.id !== OPEN).map(l => l.id)];
  const unread = LETTERS.filter(l => !l.read).length, open = LETTERS.filter(l => !l.handled).length;
  const head = `<div class="lt-head"><h1 class="title">${t('Letters', 'Schreiben')}</h1><p class="lede">${t(`The MyEPO Mailbox of your firm: ${LETTERS.length} letters, ${unread} unread, ${open} not handled. Last read ${at(READ_DAY, READ_HM)}.`, `Die MyEPO-Mailbox Ihrer Kanzlei: ${LETTERS.length} Schreiben, ${unread} ungelesen, ${open} nicht erledigt. Zuletzt gelesen ${at(READ_DAY, READ_HM)}.`)}</p></div>`;
  const list = v => `<div class="list-pane lt-list" data-state="${v}">${head}${table(v)}</div>`;
  const pane = v => `<div class="detail-pane" data-state="${v}">${work(letterBody(letterOf(v), isOpen(letterOf(v), v)))}</div>`;
  const cols = COLS();
  const skeleton = `<div class="dt-wrap"><table class="dt lt-tbl mb-tbl"><thead><tr>${cols.map(c => `<th class="${c.cls}">${c.label}</th>`).join('')}</tr></thead><tbody>${['w60', 'w70', 'w50', 'w65', 'w55'].map(w => `<tr>${cols.map(c => `<td class="${c.cls}"><span class="skel ${w}"></span></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const plainHead = `<div class="lt-head"><h1 class="title">${t('Letters', 'Schreiben')}</h1><p class="lede">${t('The MyEPO Mailbox of your firm.', 'Die MyEPO-Mailbox Ihrer Kanzlei.')}</p></div>`;
  const loading = `<div class="list-pane lt-list mb-full" data-state="loading">${plainHead}${skeleton}</div>`;
  const error = `<div class="list-pane lt-list mb-full" data-state="error">${head}<div class="error-bar">${notice('bad', 'warn', t('MyEPO did not answer.', 'MyEPO hat nicht geantwortet.'), t(`The list shows the Mailbox as of ${at(READ_DAY, READ_HM)}.`, `Die Liste zeigt die Mailbox mit Stand ${at(READ_DAY, READ_HM)}.`), btn(t('Try again', 'Erneut versuchen'), { icon: 'retry', act: 'retry' }))}</div>${table('none')}</div>`;
  const empty = `<div class="empty" data-state="empty"><div class="empty-in"><div class="empty-art" data-i="inbox"></div><h2>${t('MyEPO is not linked', 'MyEPO ist nicht verbunden')}</h2><p>${t('When your firm links its MyEPO account, the letters of its Mailbox show here.', 'Wenn Ihre Kanzlei ihr MyEPO-Konto verbindet, stehen hier die Schreiben ihrer Mailbox.')}</p>${btn(t('Open the MyEPO card', 'MyEPO-Karte öffnen'), { icon: 'gear' })}</div></div>`;
  const body = `${topbar(crumb(), btn(t('Search', 'Suchen'), { kind: 'ghost', icon: 'search', act: 'search' }))}
      <div class="split lt-split">
${views.map(v => list(v) + pane(v)).join('\n')}
${loading}${error}
      </div>
${empty}`;
  return page({ title: t('Letters', 'Schreiben'), body: app_(body) });
}

/** The letter page: below 1366 px a row opens it. */
function letterPage() {
  const views = [['default', true], ['unopened', false], ...LETTERS.filter(l => l.id !== OPEN).map(l => [l.id, false])];
  const pager = n => `<span class="pager"><b>${n}</b>&nbsp;/ ${LETTERS.length}</span>${iconbtn('up', t('Previous', 'Vorheriges'), 'boxed')}${iconbtn('down', t('Next', 'Nächstes'), 'boxed')}`;
  const body = views.map(([v, open]) => { const l = letterOf(v); return `<div class="cset" data-state="${v}">${topbar(crumb(l.key || t('No application', 'Keine Anmeldung')), pager(LETTERS.indexOf(l) + 1))}
${work(letterBody(l, open))}</div>`; }).join('\n');
  return page({ title: t('Letter', 'Schreiben'), body: app_(body) });
}

for (const [name, make] of [['mailbox', mailbox], ['letter', letterPage]]) {
  for (const l of ['en', 'de']) {
    lang = l;
    writeFileSync(path.join(OUT, `${name}${l === 'de' ? '.de' : ''}.html`), make());
  }
}
console.log('wrote mailbox and letter, en and de');
