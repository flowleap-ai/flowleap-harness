// Writes the MyEPO surfaces mockups, each page in English (<name>.html) and German (<name>.de.html), from this one
// source. Usage: node build.mjs. Edit this file or data.mjs, never the generated HTML. README.md names the source of
// each value and every example.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { REVIEW } from './review.mjs';
import { LINKED, LINKED_HM, TODAY, P, M, CLIENTS, LETTERS, EXCEPTION, TRACES, DEADLINES, LARGE } from './data.mjs';

const OUT = import.meta.dirname;
const RECORDS_CSS = '../../../../.agents/skills/flowleap-design-language/references/mockups/records.css';

let lang = 'en';
const t = (en, de) => (lang === 'de' ? de : en);

// ---------- words and formats ----------
const MO = { en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], de: ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'] };
const MOL = { en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'], de: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'] };
const WDL = { en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], de: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'] };
const parts = iso => { const d = new Date(`${iso}T12:00:00Z`); return [d.getUTCDay(), d.getUTCDate(), d.getUTCMonth(), d.getUTCFullYear()]; };
const date = iso => { const [, d, m, y] = parts(iso); return lang === 'de' ? `${d}. ${MO.de[m]} ${y}` : `${d} ${MO.en[m]} ${y}`; };
const long = iso => { const [w, d, m, y] = parts(iso); return lang === 'de' ? `${WDL.de[w]}, ${d}. ${MOL.de[m]} ${y}` : `${WDL.en[w]}, ${d} ${MOL.en[m]} ${y}`; };
const at = (iso, hm) => `${date(iso)}, ${hm}`;
const int = n => n.toLocaleString(lang === 'de' ? 'de-DE' : 'en-GB');
const app = key => { const a = M[key].app; return `EP ${a.slice(2, 4)} ${a.slice(4, 7)} ${a.slice(7)}.${M[key].check}`; };
/** Data from a source (an applicant name, a register status, a file name): not product copy. */
const nm = s => `<span data-verbatim>${s}</span>`;
const exNote = (w = t('Example', 'Beispiel')) => `<span class="ex-note">${w}</span>`;
const draft = () => `<span class="draft-tag" data-i="pen">${t('Design not yet approved', 'Entwurf, nicht freigegeben')}</span>`;
const initial = p => P[p].name.replace(/^Dr\. /, '')[0];
const av = p => `<span class="av" title="${P[p].name}" aria-label="${P[p].name}">${initial(p)}</span>`;
const who = p => `<span class="who">${av(p)}${P[p].name}</span>`;
const clientOf = key => CLIENTS[M[key].client];

const KIND = {
  r71: () => t('Rule 71(3) communication', 'Mitteilung nach Regel 71(3)'),
  a94: () => t('Article 94(3) communication', 'Bescheid nach Artikel 94(3)'),
  grant: () => t('Decision to grant', 'Entscheidung über die Erteilung'),
  opp: () => t('Notice of opposition', 'Mitteilung über einen Einspruch'),
  reps: () => t('Change in the list of professional representatives', 'Änderung der Liste der zugelassenen Vertreter'),
};
const KIND_SHORT = { r71: () => 'Rule 71(3) EPC', a94: () => t('Article 94(3) EPC', 'Artikel 94(3) EPÜ'), grant: () => t('Decision to grant', 'Erteilung'), opp: () => t('Opposition', 'Einspruch'), reps: () => t('Representatives', 'Vertreter') };

// ---------- keys (keys.md, macOS) ----------
const KEYS = { record: ['⇧⌘↵'], reject: ['2'], 'open-letter': ['O'], calculation: ['C'], retry: ['R'], open: ['↵'], 'go-matter': ['G', 'M'], search: ['⌘K'] };
const caps = act => KEYS[act].map(x => `<span class="kbd">${x}</span>`).join('');
const btn = (label, { kind = 'secondary', icon = '', cls = '', attrs = '', act = '' } = {}) =>
  `<span class="btn btn-${kind}${cls ? ` ${cls}` : ''}"${icon ? ` data-i="${icon}"` : ''}${act ? ` data-act="${act}"` : ''} role="button"${attrs}>${label}${act ? ` ${caps(act)}` : ''}</span>`;
const iconbtn = (icon, label, cls = '') => `<span class="iconbtn${cls ? ` ${cls}` : ''}" data-i="${icon}" role="button" aria-label="${label}"></span>`;
const mi = (act, label, icon, on = false) => `<div class="mi${on ? ' on' : ''}" data-i="${icon}"${act ? ` data-act="${act}"` : ''}>${label}${act ? `<span class="kbds">${caps(act)}</span>` : ''}</div>`;
const off = ' aria-disabled="true"';
const retry = () => btn(t('Try again', 'Erneut versuchen'), { icon: 'retry', act: 'retry' });

// ---------- status: the atlas states (status-map.md) and the letter states (not atlas states) ----------
const ATLAS = {
  'deadline.active': ['ok', 'Active', 'Aktiv'],
  'deadline.deadline_proposed': ['wait', 'Deadline proposed', 'Frist vorgeschlagen'],
  'deadline.engine_refused': ['bad', 'Not computed', 'Nicht berechnet'],
  'deadline.stale': ['stale', 'Stale', 'Veraltet'],
  'intake.unmatched': ['wait', 'No matter found', 'Keine Akte gefunden'],
  'ticket.proposals_ready': ['wait', 'Proposals ready', 'Vorschläge bereit'],
};
const status = (key, cls = 'status') => { const [shape, en, de] = ATLAS[key]; return `<span class="${cls}${cls === 'pill' ? ` ${shape}` : ''}" data-atlas="${key}"><span class="st" data-s="${shape}"></span>${t(en, de)}</span>`; };
/** The states of a letter (founder decision 2). They are not atlas states, so they use the class cstatus. */
const LSTATE = {
  listed: ['run', 'Listed', 'Gelistet'],
  filed: ['run', 'Filed on its matter', 'In der Akte abgelegt'],
  computed: ['wait', 'Deadline computed', 'Frist berechnet'],
  confirmed: ['ok', 'Deadline confirmed', 'Frist bestätigt'],
  done: ['idle', 'Done', 'Erledigt'],
  person: ['wait', 'Needs a person', 'Braucht eine Person'],
};
const lstate = (s, cls = 'cstatus') => { const [shape, en, de] = LSTATE[s]; return `<span class="${cls}${cls === 'cpill' ? ` ${shape}` : ''}"><span class="cst" data-s="${shape}"></span>${t(en, de)}</span>`; };

// ---------- the page frame ----------
const page = ({ title, body, after = '', extraCss = '', frameJs = 'frame.js' }) => `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<!-- Generated from build.mjs: edit that file and run node build.mjs, never this file -->
<link rel="stylesheet" href="${RECORDS_CSS}">
<link rel="stylesheet" href="../add-client/add-client.css">
<link rel="stylesheet" href="../client-model/client-model.css">
${extraCss}<link rel="stylesheet" href="myepo-surfaces.css">
</head>
<body>
${body}
${after}<script src="${frameJs}"></script>
<script src="table.js"></script>
<script src="walk.js"></script>
</body>
</html>
`;
/** My work counts of the viewers: what the sidebar shows beside My work. */
const COUNT = { lena: 2, anna: 3, martin: '', felix: '' };
const app_ = ({ person, side, body, as = null, fixed = true }) => `<div class="app">
  <nav data-sidebar="${side}" data-name="${P[person].name}" data-role="${t(...P[person].role)}" data-count="${COUNT[person]}"${as ? ` data-as='${JSON.stringify(Object.fromEntries(Object.entries(as).map(([s, p]) => [s, { name: P[p].name, role: t(...P[p].role), count: String(COUNT[p]) }])))}'` : ''}></nav>
  <main class="main">
    <section class="panel${fixed ? ' fixed' : ''}">
${body}
    </section>
  </main>
</div>`;
const topbar = (crumbs, right = '', tabs = '') => `      <header class="topbar">
        <div class="crumbs">${crumbs}</div>${tabs}
        <div class="bar-right">${right}</div>
      </header>`;
const crumb = (icon, root, here = '', rootHref = '') => here
  ? `<span class="ico hide-sm" data-i="${icon}"></span><a class="lvl hide-sm" href="${rootHref}" data-walk="crumb">${root}</a><span class="sep hide-sm">›</span><span class="here">${here}</span>`
  : `<span class="ico" data-i="${icon}"></span><span class="here">${root}</span>`;
const pager = (n, of) => `<span class="pager"><b>${n}</b>&nbsp;/ ${of}</span><span class="iconbtn boxed" data-i="up" role="button" aria-label="${t('Previous', 'Vorheriges')}"></span><span class="iconbtn boxed" data-i="down" role="button" aria-label="${t('Next', 'Nächstes')}"></span>`;
const section = (h, inner, right = '', count = '') => `<div class="section"><div class="section-h"><h2>${h}</h2>${count === '' ? '' : `<span class="count">${count}</span>`}${right ? `<span class="right">${right}</span>` : ''}</div>${inner}</div>`;
const notice = (cls, icon, lead, rest = '', act = '') => `<div class="notice${cls ? ` ${cls}` : ''}" data-i="${icon}"><div><span class="lead">${lead}</span>${rest ? ` <span>${rest}</span>` : ''}</div>${act ? `<span class="spacer"></span>${act}` : ''}</div>`;
const work = (scroll, dock = '') => `      <div class="work">
        <div class="work-scroll"><div class="flow">
${scroll}
        </div></div>
${dock}
      </div>`;

/** A data table (the client model's): sortable headers, a filter bar, pagination. Columns { key, label, cls, sort }; rows { cells, values, href, narrow, attrs }. */
const table = ({ cols, rows, sortKey, sortDir = 'ascending', filters = '', total = rows.length, pageSize = 25, note = '', foot = true, cls = '' }) => {
  const head = cols.map(c => `<th class="${c.cls || ''}"${c.sort === false ? '' : ` data-sort="${c.key}"`}${c.key === sortKey ? ` aria-sort="${sortDir}"` : ''} scope="col"><span>${c.label}</span>${c.sort === false ? '' : '<span class="sort" data-i="chevd" aria-hidden="true"></span>'}</th>`).join('');
  const body = rows.map(r => `<tr${r.href ? ` data-href="${r.href}"` : ''}${r.narrow ? ` data-narrow-href="${r.narrow}"` : ''}${Object.entries(r.values || {}).map(([k, v]) => ` data-${k}="${v}"`).join('')}${r.attrs || ''}>${r.cells.map((c, i) => `<td class="${cols[i].cls || ''}">${c}</td>`).join('')}</tr>`).join('\n');
  const sizes = [10, 25, 50, 100].map(n => `<option${n === pageSize ? ' selected' : ''}>${n}</option>`).join('');
  return `${filters}<div class="dt-wrap"><table class="dt${cls ? ` ${cls}` : ''}" data-table data-total="${total}" data-page-size="${pageSize}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table><div class="dt-none" hidden>${t('No row matches these filters.', 'Keine Zeile passt zu diesen Filtern.')}</div>${note ? `<div class="dt-more" hidden>${note}</div>` : ''}</div>
${foot ? `<div class="dt-foot"><label class="dt-size">${t('Rows per page', 'Zeilen pro Seite')} <select class="field small" data-size aria-label="${t('Rows per page', 'Zeilen pro Seite')}">${sizes}</select></label><span class="dt-range" data-range></span>${iconbtn('back', t('Previous page', 'Vorherige Seite'), 'boxed dt-prev')}${iconbtn('chev', t('Next page', 'Nächste Seite'), 'boxed dt-next')}</div>` : ''}`;
};
const select = (key, label, options, selected = '') => `<select class="field small" data-filter="${key}" aria-label="${label}"><option value="">${label}: ${t('all', 'alle')}</option>${options.map(([v, w]) => `<option value="${v}"${v === selected ? ' selected' : ''}>${w}</option>`).join('')}</select>`;
const find = placeholder => `<div class="fwrap find" data-i="search"><input class="field small" data-filter="text" aria-label="${t('Find in this table', 'In dieser Tabelle suchen')}" placeholder="${placeholder}"></div>`;

// ======================================================================================================
// 1. Import your EP docket: the Add client stepper, with the docket from MyEPO
// ======================================================================================================
const IMPORT = () => t('Import your EP docket', 'EP-Bestand importieren');
const IMP_STEPS = () => [['1a-docket', t('Docket', 'Bestand')], ['1b-clients', t('Clients', 'Mandanten')], ['1c-conflict', t('Conflict check', 'Kollisionsprüfung')], ['1d-review', t('Review', 'Prüfen')]];
/** The stepper of Add client with the steps of the import; `at` 5 on Record, where every step is done. */
const stepper = (at, state = '') => `<ol class="stepper" aria-label="${t('Steps of Import your EP docket', 'Schritte von „EP-Bestand importieren“')}">${IMP_STEPS().map(([pg, label], i) => {
  const n = i + 1;
  const kind = n < at ? 'done' : n === at ? 'current' : 'todo';
  const mark = kind === 'done' ? '<span class="sn" data-i="check"></span>' : `<span class="sn num">${n}</span>`;
  const said = { done: t('done', 'erledigt'), current: t('current step', 'aktueller Schritt'), todo: t('not yet', 'noch nicht') }[kind];
  const inner = `${mark}<span class="sl">${label}</span><span class="sr">, ${said}</span>`;
  return `<li class="stp-${kind}${n === at ? ' stp-current' : ''}" title="${label}"${n === at ? ' aria-current="step"' : ''}>${kind === 'done' && at < 5 ? `<a href="${pg}.html${state ? `?state=${state}` : ''}">${inner}</a>` : inner}</li>`;
}).join('')}</ol>`;
const stepFoot = ({ back = '', next = '', note, disabled = false, record = false, n = 3 }) => `          <div class="decision wiz-foot">
            ${back ? btn(`<span class="hide-sm">${t('Back', 'Zurück')}</span>`, { kind: 'ghost', icon: 'back', attrs: ` aria-label="${t('Back', 'Zurück')}" data-href="${back}"` }) : ''}${btn(t('Cancel', 'Abbrechen'), { kind: 'ghost', attrs: ' data-href="5-myepo-card.html?state=linked"' })}
            <span class="note">${note}</span>
            ${record
    ? btn(t(`Import ${int(n)} clients`, `${int(n)} Mandanten importieren`), { kind: 'primary', icon: 'check', cls: 'btn-lg', act: 'record', attrs: disabled ? off : ` data-walk="record" data-href="${next}"` })
    : btn(t('Next', 'Weiter'), { kind: 'primary', cls: 'btn-lg', attrs: disabled ? off : ` data-walk="next" data-href="${next}"` })}
          </div>`;
const cset = (states, html) => `<div class="cset" data-state="${states}">${html}</div>`;
const importTop = () => topbar(crumb('clients', t('Clients', 'Mandanten'), IMPORT(), '#'));
const SEED_N = Object.keys(M).length;
const factRow = facts => `<div class="kfacts">${facts.map(([n, w, ex]) => `<div class="kf"><div class="kn num">${n}</div><div class="kw">${w}${ex ? ` ${exNote()}` : ''}</div></div>`).join('')}</div>`;

function docket() {
  const lede = t('FlowLeap reads the EP applications in the portfolios that your MyEPO account may read, and the bibliographic data of each one. It then proposes your clients from the applicant names.', 'FlowLeap liest die EP-Anmeldungen in den Portfolios, die Ihr MyEPO-Konto lesen darf, und die bibliografischen Daten jeder Anmeldung. Dann schlägt es Ihre Mandanten aus den Anmeldernamen vor.');
  const head = `${stepper(1)}<h1 class="title">${t('Your EP docket in MyEPO', 'Ihr EP-Bestand in MyEPO')}</h1><p class="lede">${lede}</p>`;
  const src = (n, hm = LINKED_HM) => `<p class="src-line t12">${t(`MyEPO, read on ${at(LINKED, hm)}: ${int(n)} applications and ${int(n)} reads of bibliographic data. FlowLeap copies no file.`, `MyEPO, gelesen am ${at(LINKED, hm)}: ${int(n)} Anmeldungen und ${int(n)} Abrufe bibliografischer Daten. FlowLeap kopiert keine Datei.`)}</p>`;
  const reading = (done, total, minutes, large) => `<ol class="bsteps">
<li class="done"><span data-i="check"></span><div><div class="h">${t(`Read the list of ${int(total)} EP applications`, `Liste der ${int(total)} EP-Anmeldungen gelesen`)}${large ? ` ${exNote()}` : ''}</div><div class="d">${t('With your file number for each application.', 'Mit Ihrem Aktenzeichen zu jeder Anmeldung.')}</div></div><span class="n"></span></li>
<li class="now"><span data-i="spin"></span><div><div class="h">${t('Reading the applicant names of each application', 'Anmeldernamen jeder Anmeldung werden gelesen')}</div><div class="d">${t(`One read for each application. About ${minutes} minutes left; you can leave this page, and FlowLeap goes on.`, `Ein Abruf je Anmeldung. Noch etwa ${minutes} Minuten; Sie können diese Seite verlassen, FlowLeap macht weiter.`)}<div class="bar p${large ? '38' : '62'}"><span></span></div></div></div><span class="n num">${int(done)} / ${int(total)}</span></li>
<li class="next"><span data-i="ring"></span><div><div class="h">${t('Propose the clients from the applicant names', 'Mandanten aus den Anmeldernamen vorschlagen')}</div></div><span class="n"></span></li>
</ol>`;
  const body = `${importTop()}
${cset('default', work(`${head}${factRow([[int(SEED_N), t('EP applications in MyEPO', 'EP-Anmeldungen in MyEPO')], ['4', t('applicant names', 'Anmeldernamen')], ['3', t('proposed clients', 'vorgeschlagene Mandanten')]])}${section(t('What FlowLeap found', 'Was FlowLeap gefunden hat'), `<ul class="found-list">
<li data-i="check">${t(`All ${SEED_N} applications have your file number, so each one opens as a matter at once.`, `Alle ${SEED_N} Anmeldungen haben Ihr Aktenzeichen, darum öffnet jede sofort als Akte.`)}</li>
<li data-i="check">${t('Two applicant names differ only in their capital letters. FlowLeap proposes them as one client; you can split them in the next step.', 'Zwei Anmeldernamen unterscheiden sich nur in der Groß- und Kleinschreibung. FlowLeap schlägt sie als einen Mandanten vor; im nächsten Schritt können Sie sie trennen.')}</li>
<li data-i="info">${t('MyEPO shows only your firm’s own applications. A client with no EP application, a Watch company or an other party still comes through Add client.', 'MyEPO zeigt nur die eigenen Anmeldungen Ihrer Kanzlei. Ein Mandant ohne EP-Anmeldung, ein beobachtetes Unternehmen oder eine andere Partei kommt weiter über „Mandant hinzufügen“.')}</li>
</ul>${src(SEED_N)}`)}`, stepFoot({ next: '1b-clients.html', note: t('Next: confirm the proposed clients.', 'Weiter: die vorgeschlagenen Mandanten bestätigen.') })))}
${cset('reading', work(`${head}${reading(4, SEED_N, 1, false)}`, stepFoot({ next: '', note: t('Next waits until FlowLeap has read every application.', '„Weiter“ wartet, bis FlowLeap jede Anmeldung gelesen hat.'), disabled: true })))}
${cset('large-reading', work(`${head}${reading(LARGE.read, LARGE.apps, LARGE.minutes, true)}`, stepFoot({ next: '', note: t('Next waits until FlowLeap has read every application.', '„Weiter“ wartet, bis FlowLeap jede Anmeldung gelesen hat.'), disabled: true })))}
${cset('large', work(`${head}${factRow([[int(LARGE.apps), t('EP applications in MyEPO', 'EP-Anmeldungen in MyEPO'), true], [int(LARGE.names), t('applicant names', 'Anmeldernamen'), true], [int(LARGE.clients), t('proposed clients', 'vorgeschlagene Mandanten'), true]])}${section(t('What FlowLeap found', 'Was FlowLeap gefunden hat'), `<ul class="found-list">
<li data-i="check">${t(`${int(LARGE.apps - 18)} applications have your file number.`, `${int(LARGE.apps - 18)} Anmeldungen haben Ihr Aktenzeichen.`)} ${exNote()}</li>
<li data-i="warn">${t('18 applications have no file number in MyEPO. They become matters with the application number as their name; set the file number later on the matter.', '18 Anmeldungen haben in MyEPO kein Aktenzeichen. Sie werden Akten mit der Anmeldenummer als Namen; das Aktenzeichen setzen Sie später in der Akte.')} ${exNote()}</li>
</ul>${src(LARGE.apps, '14:12')}`)}`, stepFoot({ next: '1b-clients.html?state=large', note: t('Next: confirm the proposed clients.', 'Weiter: die vorgeschlagenen Mandanten bestätigen.') })))}
${cset('failed', work(`${head}<div class="section">${notice('bad', 'warn', t('FlowLeap could not read your docket from MyEPO.', 'FlowLeap konnte Ihren Bestand nicht aus MyEPO lesen.'), t(`MyEPO did not answer at ${LINKED_HM}. FlowLeap recorded nothing. Try again reads the docket again.`, `MyEPO hat um ${LINKED_HM} nicht geantwortet. FlowLeap hat nichts erfasst. „Erneut versuchen“ liest den Bestand neu.`), retry())}</div>`, stepFoot({ next: '', note: t('Next waits for the docket.', '„Weiter“ wartet auf den Bestand.'), disabled: true })))}`;
  return page({ title: t('Import your EP docket: docket', 'EP-Bestand importieren: Bestand'), body: app_({ person: 'martin', side: 'clients', body }) });
}

/** The proposed clients of the seed docket: client, its names as published, its applications (file numbers). */
const PROPOSED = () => Object.entries(CLIENTS).map(([id, c]) => [c, Object.entries(M).filter(([, m]) => m.client === id).map(([k]) => k)]);
const roleSelect = () => `<select class="field small" aria-label="${t('Role', 'Rolle')}"><option>${t('Client', 'Mandant')}</option><option>${t('Other party', 'Andere Partei')}</option></select>`;
function clientsStep() {
  const head = (state = '') => `${stepper(2, state)}<h1 class="title">${t('Confirm your clients', 'Ihre Mandanten bestätigen')}</h1><p class="lede">${t('One row for each proposed client, with the applicant names that FlowLeap grouped. Untick a row that is not your client, for example when a foreign associate instructs you. The role is Client unless you change it.', 'Eine Zeile je vorgeschlagenem Mandanten, mit den Anmeldernamen, die FlowLeap zusammengefasst hat. Entfernen Sie den Haken bei einer Zeile, die nicht Ihr Mandant ist, zum Beispiel wenn ein ausländischer Kollege Sie beauftragt. Die Rolle ist „Mandant“, solange Sie sie nicht ändern.')}</p>`;
  const cols = [
    { key: 'pick', label: `<span class="sr">${t('Import', 'Importieren')}</span>`, cls: 'c-pick', sort: false },
    { key: 'client', label: t('Client', 'Mandant'), cls: 'c-client' },
    { key: 'names', label: t('Applicant names', 'Anmeldernamen'), cls: 'c-names', sort: false },
    { key: 'n', label: t('EP applications', 'EP-Anmeldungen'), cls: 'c-num' },
    { key: 'role', label: t('Role', 'Rolle'), cls: 'c-role', sort: false },
  ];
  const cb = `<span class="check on" role="checkbox" aria-checked="true" aria-label="${t('Import this client', 'Diesen Mandanten importieren')}" data-i="check"></span>`;
  const seedRows = PROPOSED().map(([c, keys]) => ({
    values: { client: c.name.toLowerCase(), n: keys.length, text: `${c.names.join(' ')} ${keys.join(' ')}`.toLowerCase() },
    cells: [cb, nm(c.name), `${c.names.map(nm).join('<br>')}${c.names.length > 1 ? `<div class="muted t12">${t('Grouped: the same name in other capital letters', 'Zusammengefasst: derselbe Name in anderer Schreibung')}</div>` : ''}`, `<span class="num">${keys.length}</span>`, roleSelect()],
  }));
  const largeRows = LARGE.rows.map(([c, names, n]) => ({
    values: { client: c.toLowerCase(), n, text: `${c} ${names.join(' ')}`.toLowerCase() },
    cells: [cb, nm(c), `${names.map(nm).join('<br>')}${names.length > 1 ? `<div class="muted t12">${t('Grouped: one company, several names', 'Zusammengefasst: ein Unternehmen, mehrere Namen')}</div>` : ''}`, `<span class="num">${int(n)}</span>`, roleSelect()],
  }));
  const filters = `<div class="dt-filters">${find(t('Find a client or a name', 'Mandant oder Namen suchen'))}</div>`;
  const body = `${importTop()}
${cset('default', work(`${head()}${table({ cols, rows: seedRows, sortKey: 'client', filters, foot: false, cls: 'pick-tbl' })}<p class="src-line t12">${t('3 of 3 clients ticked, with 7 EP applications.', '3 von 3 Mandanten angehakt, mit 7 EP-Anmeldungen.')}</p>`, stepFoot({ back: '1a-docket.html', next: '1c-conflict.html', note: t('Next: the conflict check of the 3 clients.', 'Weiter: die Kollisionsprüfung der 3 Mandanten.') })))}
${cset('large', work(`${head('large')}<div class="section">${notice('', 'info', t('287 proposed clients from 312 applicant names.', '287 vorgeschlagene Mandanten aus 312 Anmeldernamen.'), `${t('FlowLeap groups names that differ only in capital letters, punctuation or the legal form. Two different companies stay apart, as Siemens Aktiengesellschaft and Siemens Healthineers AG.', 'FlowLeap fasst Namen zusammen, die sich nur in Schreibung, Satzzeichen oder Rechtsform unterscheiden. Zwei verschiedene Unternehmen bleiben getrennt, wie Siemens Aktiengesellschaft und Siemens Healthineers AG.')} ${exNote()}`)}</div>${table({ cols, rows: largeRows, sortKey: 'n', sortDir: 'descending', filters, total: LARGE.clients, note: t('The example rows end here. The built table pages through all 287 proposed clients.', 'Die Beispielzeilen enden hier. Die gebaute Tabelle blättert durch alle 287 vorgeschlagenen Mandanten.'), cls: 'pick-tbl' })}`, stepFoot({ back: '1a-docket.html?state=large', next: '1c-conflict.html?state=large', note: t('Next: the conflict check of the 287 clients.', 'Weiter: die Kollisionsprüfung der 287 Mandanten.') })))}`;
  return page({ title: t('Import your EP docket: clients', 'EP-Bestand importieren: Mandanten'), body: app_({ person: 'martin', side: 'clients', body }) });
}

const searched = n => t(`FlowLeap searched the names of the ${n} clients in your Firm Record and as opponent or patent owner in EP oppositions.`, `FlowLeap hat die Namen der ${n} Mandanten in Ihrem Firm Record und als Einsprechende oder Patentinhaber in EP-Einsprüchen gesucht.`);
function conflictStep() {
  const head = (state = '') => `${stepper(3, state)}<h1 class="title">${t('Conflict check', 'Kollisionsprüfung')}</h1><p class="lede">${t('Each proposed client against your other clients and against the other side of their EP oppositions.', 'Jeder vorgeschlagene Mandant gegen Ihre anderen Mandanten und gegen die Gegenseite ihrer EP-Einsprüche.')}</p>`;
  const body = `${importTop()}
${cset('default', work(`${head()}<div class="section"><div class="ok-line" data-i="check"><span><b>${t('No conflict found', 'Keine Kollision gefunden')}</b> ${searched(3)}</span></div><p class="src-line t12">${t(`One opposition is on file: ${nm('HARTING Electric Stiftung & Co. KG')} opposed the patent of your client Phoenix Contact on 30 Sep 2026. It is not one of your clients.`, `Ein Einspruch ist bekannt: Die ${nm('HARTING Electric Stiftung & Co. KG')} hat am 30. Sept. 2026 gegen das Patent Ihres Mandanten Phoenix Contact Einspruch eingelegt. Sie ist kein Mandant Ihrer Kanzlei.`)}</p></div>`, stepFoot({ back: '1b-clients.html', next: '1d-review.html', note: t('Next: review before FlowLeap records anything.', 'Weiter: prüfen, bevor FlowLeap etwas erfasst.') })))}
${cset('large', work(`${head('large')}<div class="section">${notice('warn', 'warn', t('1 possible conflict between two proposed clients.', '1 mögliche Kollision zwischen zwei vorgeschlagenen Mandanten.'), t('Syntegon Packaging Systems AG, one name of the proposed client Syntegon Technology GmbH, opposed EP 3 296 081 of the proposed client Gerhard Schubert GmbH on 8 Jan 2025. The patent is revoked.', 'Die Syntegon Packaging Systems AG, ein Name des vorgeschlagenen Mandanten Syntegon Technology GmbH, hat am 8. Jan. 2025 gegen EP 3 296 081 des vorgeschlagenen Mandanten Gerhard Schubert GmbH Einspruch eingelegt. Das Patent ist widerrufen.'))}<div class="field-label reason-h">${t('Why both can be your clients', 'Warum beide Mandanten sein können')}</div><textarea class="reason-field" aria-label="${t('Reason', 'Begründung')}" placeholder="${t('Reason', 'Begründung')}"></textarea><p class="src-line t12">${searched(287)} ${exNote()}</p></div>`, stepFoot({ back: '1b-clients.html?state=large', next: '', note: t('Next waits until you check the conflict and write why.', '„Weiter“ wartet, bis Sie die Kollision geprüft und die Begründung geschrieben haben.'), disabled: true })))}`;
  return page({ title: t('Import your EP docket: conflict check', 'EP-Bestand importieren: Kollisionsprüfung'), body: app_({ person: 'martin', side: 'clients', body }) });
}

function reviewStep() {
  const edit = href => `<a class="sum-edit" href="${href}">${t('Edit', 'Bearbeiten')}</a>`;
  const row = (label, value, detail, href) => `<div class="sum-row"><div class="sum-k">${label}</div><div class="sum-v"><div>${value}</div>${detail ? `<div class="d">${detail}</div>` : ''}</div>${edit(href)}</div>`;
  const head = (state = '') => `${stepper(4, state)}<h1 class="title">${t('Review the import', 'Import prüfen')}</h1><p class="lede">${t('Your choices before FlowLeap records anything. Edit opens a step again.', 'Ihre Angaben, bevor FlowLeap etwas erfasst. „Bearbeiten“ öffnet einen Schritt erneut.')}</p>`;
  const seed = `<div class="sum">
${row(t('Docket', 'Bestand'), t(`${SEED_N} EP applications in MyEPO`, `${SEED_N} EP-Anmeldungen in MyEPO`), t(`All with your file number. Read on ${at(LINKED, LINKED_HM)}.`, `Alle mit Ihrem Aktenzeichen. Gelesen am ${at(LINKED, LINKED_HM)}.`), '1a-docket.html')}
${row(t('Clients', 'Mandanten'), t('3 clients, each with the role Client', '3 Mandanten, jeder mit der Rolle „Mandant“'), Object.values(CLIENTS).map(c => nm(c.name)).join(', '), '1b-clients.html')}
${row(t('Conflict check', 'Kollisionsprüfung'), t('No conflict found', 'Keine Kollision gefunden'), searched(3), '1c-conflict.html')}
${row(t('Letters', 'Schreiben'), t('Download a letter when a person or a task opens it', 'Ein Schreiben herunterladen, wenn eine Person oder eine Aufgabe es öffnet'), t('The setting of the MyEPO card. After the import, FlowLeap lists your MyEPO Mailbox letters, files each one on its matter and computes its deadline.', 'Die Einstellung der MyEPO-Karte. Nach dem Import listet FlowLeap die Schreiben Ihrer MyEPO-Mailbox, legt jedes in seiner Akte ab und berechnet seine Frist.'), '5-myepo-card.html?state=linked')}
</div>`;
  const large = `<div class="sum">
${row(t('Docket', 'Bestand'), t(`${int(LARGE.apps)} EP applications in MyEPO`, `${int(LARGE.apps)} EP-Anmeldungen in MyEPO`), `${exNote()} ${t('18 with no file number.', '18 ohne Aktenzeichen.')}`, '1a-docket.html?state=large')}
${row(t('Clients', 'Mandanten'), t(`${int(LARGE.clients)} clients`, `${int(LARGE.clients)} Mandanten`), t('286 with the role Client, 1 with the role Other party.', '286 mit der Rolle „Mandant“, 1 mit der Rolle „Andere Partei“.'), '1b-clients.html?state=large')}
${row(t('Conflict check', 'Kollisionsprüfung'), t('1 possible conflict, checked by you', '1 mögliche Kollision, von Ihnen geprüft'), t('Syntegon and Gerhard Schubert, with your reason.', 'Syntegon und Gerhard Schubert, mit Ihrer Begründung.'), '1c-conflict.html?state=large')}
</div>`;
  const note = (c, n) => t(`FlowLeap records ${c} clients and their ${n} applications. It copies no files.`, `FlowLeap erfasst ${c} Mandanten und ihre ${n} Anmeldungen, ohne Dateien zu kopieren.`);
  const body = `${importTop()}
${cset('default', work(`${head()}${seed}`, stepFoot({ back: '1c-conflict.html', next: '1e-record.html', note: note(3, SEED_N), record: true, n: 3 })))}
${cset('large', work(`${head('large')}${large}`, stepFoot({ back: '1c-conflict.html?state=large', next: '1e-record.html?state=large', note: note(int(LARGE.clients), int(LARGE.apps)), record: true, n: LARGE.clients })))}`;
  return page({ title: t('Import your EP docket: review', 'EP-Bestand importieren: prüfen'), body: app_({ person: 'martin', side: 'clients', body }) });
}

function recordStep() {
  const li = (cls, icon, h, d, n = '') => `<li class="${cls}"><span data-i="${icon}"></span><div><div class="h">${h}</div>${d ? `<div class="d">${d}</div>` : ''}</div><span class="n num">${n}</span></li>`;
  const list = (c, n, mode) => `<ol class="bsteps">
${li('done', 'check', t(`Recorded ${int(c)} clients with their applicant names`, `${int(c)} Mandanten mit ihren Anmeldernamen erfasst`), t(`Firm Record, by ${P.martin.name}`, `Firm Record, durch ${P.martin.name}`))}
${mode === 'done' ? li('done', 'check', t(`Recorded the ${int(n)} applications`, `Die ${int(n)} Anmeldungen erfasst`), t('Firm Record, as matters with your file numbers', 'Firm Record, als Akten mit Ihren Aktenzeichen'), `${int(n)} / ${int(n)}`) : li('now', 'spin', t(`Recording the ${int(n)} applications`, `Die ${int(n)} Anmeldungen werden erfasst`), n > 100 ? `${t('Batch 5 of 12, 100 applications each', 'Paket 5 von 12, je 100 Anmeldungen')}<div class="bar p38"><span></span></div>` : t('1 batch', '1 Paket'), `${int(n > 100 ? 400 : 0)} / ${int(n)}`)}
${li(mode === 'done' ? 'done' : 'next', mode === 'done' ? 'check' : 'ring', mode === 'done' ? t('Started to read the Mailbox', 'Lesen der Mailbox gestartet') : t('Start to read the Mailbox', 'Lesen der Mailbox starten'), t('FlowLeap lists your MyEPO letters, files each one on its matter by its application number and computes its deadline. It downloads a letter when a person or a task opens it.', 'FlowLeap listet Ihre MyEPO-Schreiben, legt jedes über die Anmeldenummer in seiner Akte ab und berechnet seine Frist. Es lädt ein Schreiben herunter, wenn eine Person oder eine Aufgabe es öffnet.'))}
</ol>`;
  const intro = mode => `${stepper(5)}<h1 class="title">${mode === 'done' ? t('Your EP docket is imported', 'Ihr EP-Bestand ist importiert') : t('Importing your EP docket', 'Ihr EP-Bestand wird importiert')}</h1><p class="lede">${mode === 'done' ? t('The Clients list shows your 3 clients and their 7 matters. Letters and Deadlines fill from your MyEPO Mailbox.', 'Die Mandantenliste zeigt Ihre 3 Mandanten und ihre 7 Akten. „Schreiben“ und „Fristen“ füllen sich aus Ihrer MyEPO-Mailbox.') : t('FlowLeap writes the clients and the matters in batches. It copies no public data.', 'FlowLeap schreibt die Mandanten und die Akten in Paketen. Es kopiert keine öffentlichen Daten.')}</p>`;
  const openBtn = dis => btn(t('Open clients', 'Mandanten öffnen'), { kind: 'primary', icon: 'clients', attrs: dis ? off : ' data-walk="open" data-href="#"' });
  const foot = (note, dis) => `<div class="decision wiz-foot"><span class="note">${note}</span>${openBtn(dis)}</div>`;
  const body = `${importTop()}
${cset('default', work(`${intro('now')}${list(3, SEED_N, 'now')}`, foot(t('The Clients list opens when the records are written.', 'Die Mandantenliste öffnet sich, sobald die Einträge geschrieben sind.'), true)))}
${cset('large', work(`${intro('now')}${list(LARGE.clients, LARGE.apps, 'now')}`, foot(t('The Clients list opens when the records are written.', 'Die Mandantenliste öffnet sich, sobald die Einträge geschrieben sind.'), true)))}
${cset('done', work(`${intro('done')}${list(3, SEED_N, 'done')}`, foot(t('Recorded with your name. FlowLeap copied no files.', 'Mit Ihrem Namen erfasst. FlowLeap hat keine Dateien kopiert.'), false)))}`;
  return page({ title: t('Import your EP docket: record', 'EP-Bestand importieren: erfassen'), body: app_({ person: 'martin', side: 'clients', body }) });
}

// ======================================================================================================
// 2. Letters: the table with the reading pane, and the letter page below 1366 px
// ======================================================================================================
/** Lena Hoffmann's letters: her walls hold Wago (via matter teams) and Renishaw. */
const LENA_LETTERS = () => LETTERS;
/** Dr. Anna Becker's letters that her My work opens: the notice of opposition (her client Phoenix Contact) and the exception. */
const R15 = { id: 'r15', row: 15, key: 'SF-2026-0019', kind: 'opp', date: '2026-10-14', state: 'person', dl: { none: 'rule' }, files: 1 };
const REASON = {
  r6: () => t('No rule for this letter type yet. Enter the date that the letter states.', 'Noch keine Regel für diese Art von Schreiben. Tragen Sie das Datum ein, das das Schreiben nennt.'),
  r16: () => t('No rule for this letter type yet. Enter the date that the letter states.', 'Noch keine Regel für diese Art von Schreiben. Tragen Sie das Datum ein, das das Schreiben nennt.'),
  r15: () => t('No rule for this letter type yet. Enter the date that the letter states.', 'Noch keine Regel für diese Art von Schreiben. Tragen Sie das Datum ein, das das Schreiben nennt.'),
  r5: () => t('The date has passed and FlowLeap finds no act. The sources differ, and the rule version is not signed.', 'Das Datum ist vorbei, und FlowLeap findet keine Handlung. Die Quellen weichen ab, und die Regelversion ist nicht unterschrieben.'),
  x1: () => t('No application number, so FlowLeap cannot file it on a matter.', 'Keine Anmeldenummer, darum kann FlowLeap es keiner Akte zuordnen.'),
};
const CLOSED = {
  r1: () => t('Replaced by the Rule 71(3) communication of 29 Aug 2025.', 'Ersetzt durch die Mitteilung nach Regel 71(3) vom 29. Aug. 2025.'),
  r2: () => t('Closed: the decision to grant followed on 23 Oct 2025.', 'Geschlossen: Die Entscheidung über die Erteilung folgte am 23. Okt. 2025.'),
  r3: () => t('No period: the letter starts no deadline.', 'Keine Frist: Das Schreiben setzt keine Frist in Gang.'),
  r4: () => t('Closed: the Rule 71(3) communication of 1 Apr 2026 followed.', 'Geschlossen: Die Mitteilung nach Regel 71(3) vom 1. Apr. 2026 folgte.'),
  x1: () => t('No period.', 'Keine Frist.'),
};
const dlCell = l => l.state === 'done' ? `<span class="muted">${t('Closed', 'Geschlossen')}</span>`
  : l.dl.due ? `<span class="num">${date(l.dl.due)}</span>`
    : l.dl.none === 'rule' ? `<span class="muted">${t('Not computed', 'Nicht berechnet')}</span>` : `<span class="muted">${t('No period', 'Keine Frist')}</span>`;
/** The state of a letter id in a view state: the walkthrough's first view shows r18 before anybody opened it. */
const opened = (l, view) => l.id === 'r18' && view !== 'unopened';

function letterRows(view) {
  return LENA_LETTERS().map(l => {
    const m = M[l.key];
    const sel = (view === 'default' || view === 'unopened') ? l.id === 'r18' : view === l.id;
    return {
      href: `2-letters.html?state=${l.id === 'r18' ? (view === 'unopened' ? 'unopened' : 'default') : l.id}`,
      narrow: `2-letter.html?state=${l.id === 'r18' ? 'default' : l.id}`,
      values: { date: l.date, kind: l.kind, key: l.key, client: m.client, state: l.state, pdf: opened(l, view) ? 'opened' : 'not', text: `${KIND[l.kind]()} ${l.key} ${m.app} ${clientOf(l.key).name} ${m.title}`.toLowerCase() },
      attrs: sel ? ' class="is-sel" aria-selected="true"' : '',
      cells: [lstate(l.state), `<span class="clamp1">${KIND[l.kind]()}</span><span class="only-split muted t12 num">${date(l.date)}</span>`, `<span class="num">${l.key}</span>`, `<span class="num">${date(l.date)}</span>`, clientOf(l.key).short, dlCell(l), opened(l, view) ? t('Opened', 'Geöffnet') : `<span class="muted">${t('Not opened', 'Nicht geöffnet')}</span>`],
    };
  });
}
const LCOLS = () => [
  { key: 'state', label: t('State', 'Stand'), cls: 'c-lstate' },
  { key: 'kind', label: t('Document', 'Dokument'), cls: 'c-doc' },
  { key: 'key', label: t('Matter', 'Akte'), cls: 'c-key' },
  { key: 'date', label: t('Dispatched', 'Versandt'), cls: 'c-date w-split' },
  { key: 'client', label: t('Client', 'Mandant'), cls: 'c-cl w-split' },
  { key: 'dl', label: t('Deadline', 'Frist'), cls: 'c-dl w-split', sort: false },
  { key: 'pdf', label: 'PDF', cls: 'c-pdf w-split' },
];
const letterFilters = () => `<div class="dt-filters">${find(t('Find a letter', 'Schreiben suchen'))}${select('state', t('State', 'Stand'), Object.keys(LSTATE).map(s => [s, t(LSTATE[s][1], LSTATE[s][2])]))}${select('client', t('Client', 'Mandant'), [['wago', 'Wago'], ['renishaw', 'Renishaw']])}${select('key', t('Matter', 'Akte'), [...new Set(LETTERS.map(l => l.key))].sort().map(k => [k.toLowerCase(), k]))}${select('kind', t('Document', 'Dokument'), ['r71', 'a94', 'grant'].map(k => [k, KIND[k]()]))}${select('pdf', 'PDF', [['opened', t('Opened', 'Geöffnet')], ['not', t('Not opened', 'Nicht geöffnet')]])}</div>`;

/** The steps that FlowLeap took for a letter, as Activity lines. */
const letterActivity = (l, isOpen, viewer) => {
  const ev = (icon, html, time) => `<div class="ev"><span class="ico sys" data-i="${icon}"></span><div class="txt"><b>FlowLeap</b> ${html}<span class="t num">${time}</span></div></div>`;
  const person = (p, html, time) => `<div class="ev person"><span class="ico">${av(p)}</span><div class="txt"><b>${P[p].name}</b> ${html}<span class="t num">${time}</span></div></div>`;
  const lines = [ev('inbox', t('listed the letter from your MyEPO Mailbox', 'hat das Schreiben aus Ihrer MyEPO-Mailbox gelistet'), at(LINKED, LINKED_HM))];
  if (l.key) lines.push(ev('folder', t(`filed it on ${l.key} by its application number`, `hat es über die Anmeldenummer in ${l.key} abgelegt`), at(LINKED, LINKED_HM)));
  if (l.dl.due && l.state !== 'done') lines.push(ev('scale', t(`computed the deadline: ${date(l.dl.due)}`, `hat die Frist berechnet: ${date(l.dl.due)}`), at(LINKED, LINKED_HM)));
  if (l.state === 'confirmed') lines.push(ev('check', t('confirmed the deadline automatically', 'hat die Frist automatisch bestätigt'), at(LINKED, LINKED_HM)));
  if (l.state === 'person') lines.push(ev('warn', t(`put it in My work: ${REASON[l.id]().toLowerCase().replace(/\.$/, '')}`, `hat es in „Meine Arbeit“ gelegt: ${REASON[l.id]().replace(/\.$/, '')}`), at(LINKED, LINKED_HM)));
  if (isOpen) lines.push(person(viewer, t('opened the letter. MyEPO now shows it as read.', 'hat das Schreiben geöffnet. MyEPO zeigt es jetzt als gelesen.'), at(TODAY, '09:12')));
  return `<div class="activity"><h2>${t('Activity', 'Aktivität')}</h2>${lines.join('\n')}</div>`;
};

/** What a person sees of one letter: in the reading pane and on the letter page. */
function letterBody(l, { isOpen, viewer }) {
  const m = l.key ? M[l.key] : null;
  const c = l.key ? clientOf(l.key) : null;
  const props = `<div class="pane-props">
<div class="prop"><span class="k">${t('Matter', 'Akte')}</span><span class="v">${m ? `<a class="lnk num" href="#">${l.key}</a> <span class="muted">${nm(c.short)}</span>` : `<span class="muted">${t('None', 'Keine')}</span>`}</span></div>
<div class="prop"><span class="k">${t('Dispatched', 'Versandt')}</span><span class="v num">${date(l.date)}</span></div>
<div class="prop"><span class="k">PDF</span><span class="v">${isOpen ? t(`Opened by ${P[viewer].name}`, `Geöffnet von ${P[viewer].name}`) : t('Not opened', 'Nicht geöffnet')}</span></div>
</div>`;
  const head = `<div class="eyebrow">${lstate(l.state, 'cpill')}<span>${t('MyEPO Mailbox', 'MyEPO-Mailbox')}</span>${l.example ? exNote() : ''}</div>
<h1 class="title">${KIND[l.kind]()}</h1>
<p class="lede">${m ? `${nm(m.title)} · ${app(l.key)}` : t('A letter to your firm that names no application.', 'Ein Schreiben an Ihre Kanzlei, das keine Anmeldung nennt.')}</p>${props}`;
  const why = l.state === 'person' ? `<div class="section">${notice('warn', 'warn', t('This letter needs a person.', 'Dieses Schreiben braucht eine Person.'), `${REASON[l.id]()} ${l.id === 'x1' ? t(`It waits in the My work of ${P.anna.name}, the person for letters without a matter.`, `Es wartet in „Meine Arbeit“ von ${P.anna.name}, der Person für Schreiben ohne Akte.`) : t(`It waits in the My work of ${P[m.resp].name}.`, `Es wartet in „Meine Arbeit“ von ${P[m.resp].name}.`)}`)}</div>` : '';
  const dl = l.dl.due && l.state !== 'done'
    ? section(t('Deadline', 'Frist'), `<div class="keyfact"><span class="big num">${long(l.dl.due)}</span><span class="r" data-due="${l.dl.due}"></span></div>
<div class="dl-line">${l.state === 'confirmed' ? `${status('deadline.active')}<span class="muted">${t('Confirmed automatically', 'Automatisch bestätigt')} ${draft()}</span>` : `${status('deadline.deadline_proposed')}<span class="muted">${t(`Waits for ${P[m.resp].name}`, `Wartet auf ${P[m.resp].name}`)}</span>`}</div>
<p class="src-line t12">${t(`Computed from the MyEPO list data at arrival: the document type and the dispatch date. ${l.state === 'confirmed' ? `In the Outlook calendar of ${P[m.resp].name}.` : ''}`, `Bei Eingang aus den MyEPO-Listendaten berechnet: Art des Dokuments und Versanddatum. ${l.state === 'confirmed' ? `Im Outlook-Kalender von ${P[m.resp].name}.` : ''}`)}</p>
<div class="acts-line">${btn(t('Show the calculation', 'Berechnung zeigen'), { icon: 'scale', act: 'calculation', attrs: ` data-walk="calc" data-href="3-deadline.html${l.id === 'r18' ? '' : `?state=${l.id === 'r5' ? 'person' : l.id}`}"` })}</div>`)
    : section(t('Deadline', 'Frist'), `<p class="plain">${l.state === 'done' || l.dl.none === 'period' ? CLOSED[l.id]() : `${status('deadline.engine_refused')} <span class="muted">${t('FlowLeap has no rule for this letter type yet.', 'FlowLeap hat für diese Art von Schreiben noch keine Regel.')}</span>`}</p>${l.dl.none === 'rule' && l.state !== 'done' ? `<div class="acts-line">${btn(t('Show the deadline', 'Frist zeigen'), { icon: 'scale', attrs: ` data-href="3-deadline.html?state=${l.id}"` })}</div>` : ''}`);
  const pdf = isOpen
    ? section(t('The letter', 'Das Schreiben'), `<div class="letter scan"><img src="scan/r71-3-page-1.webp" alt="${t('Page 1 of the Rule 71(3) communication of 29 Sep 2026', 'Seite 1 der Mitteilung nach Regel 71(3) vom 29. Sept. 2026')}" width="910" height="1287"></div>
<div class="scan-pages"><span>${t('Page 1 of 4', 'Seite 1 von 4')}</span><span class="spacer"></span><span>${t('With the text intended for grant, 2 files', 'Mit der zur Erteilung vorgesehenen Fassung, 2 Dateien')}</span></div>`, btn(t('Download', 'Herunterladen'), { icon: 'download', kind: 'ghost' }))
    : section(t('The letter', 'Das Schreiben'), `<div class="unopened"><span class="unopened-i" data-i="mail"></span><div><div class="h">${t('Listed, not opened', 'Gelistet, nicht geöffnet')}</div><p>${t('FlowLeap has the list data from MyEPO, so it filed the letter and computed its deadline. It has not downloaded the PDF.', 'FlowLeap hat die Listendaten aus MyEPO, darum hat es das Schreiben abgelegt und seine Frist berechnet. Das PDF hat es nicht heruntergeladen.')}</p><p class="muted">${t('Opening downloads the PDF from MyEPO. MyEPO then shows the letter as read for everyone at your firm.', 'Öffnen lädt das PDF aus MyEPO herunter. MyEPO zeigt das Schreiben dann für alle in Ihrer Kanzlei als gelesen.')}</p>${btn(t('Open the letter', 'Schreiben öffnen'), { kind: 'primary', icon: 'eye', act: 'open-letter', attrs: ` data-walk="open-letter" data-href="${l.id === 'r18' ? '2-letters.html' : '#'}"` })}</div></div>`);
  const filed = m ? section(t('Filed on', 'Abgelegt in'), `<div class="file"><span data-i="pdf"></span><div><div>${nm(`${l.date} ${KIND[l.kind]()}.pdf`)}</div><div class="muted t12">${l.key} › Office</div></div><span class="muted t12">${isOpen ? t('In the matter folder', 'Im Aktenordner') : t('PDF when opened', 'PDF beim Öffnen')}</span></div><p class="src-line t12">${t(`The application number ${app(l.key)} names one matter at your firm.`, `Die Anmeldenummer ${app(l.key)} nennt genau eine Akte Ihrer Kanzlei.`)}</p>`) : '';
  return `${head}${why}${dl}${pdf}${filed}<div class="section">${letterActivity(l, isOpen, viewer)}</div>`;
}

function letters() {
  const views = ['default', 'unopened', ...LETTERS.filter(l => l.id !== 'r18').map(l => l.id)];
  const listHead = `<div class="lt-head"><h1 class="title">${t('Letters', 'Schreiben')}</h1><p class="lede">${t(`Your EPO letters from MyEPO, in the matters inside your walls. FlowLeap lists each letter, files it on its matter and computes its deadline. Last read ${at(TODAY, '09:00')}.`, `Ihre EPA-Schreiben aus MyEPO, in den Akten innerhalb Ihrer Bereiche. FlowLeap listet jedes Schreiben, legt es in seiner Akte ab und berechnet seine Frist. Zuletzt gelesen ${at(TODAY, '09:00')}.`)}</p></div>`;
  const pane = v => {
    const l = v === 'default' || v === 'unopened' ? LETTERS[0] : LETTERS.find(x => x.id === v);
    return `<div class="detail-pane" data-state="${v}" data-narrow-page="2-letter.html?state=${v}">${work(letterBody(l, { isOpen: opened(l, v), viewer: 'lena' }))}</div>`;
  };
  const list = v => `<div class="list-pane lt-list" data-state="${v}">${listHead}${table({ cols: LCOLS(), rows: letterRows(v), sortKey: 'date', sortDir: 'descending', filters: letterFilters(), cls: 'lt-tbl' })}</div>`;
  const loading = `<div class="list-pane lt-list" data-state="loading">${listHead}<div class="dt-wrap"><table class="dt lt-tbl"><thead><tr>${LCOLS().map(c => `<th class="${c.cls}">${c.label}</th>`).join('')}</tr></thead><tbody>${['w60', 'w70', 'w50', 'w65', 'w55'].map(w => `<tr>${LCOLS().map(c => `<td class="${c.cls}"><span class="skel ${w}"></span></td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
  const error = `<div class="list-pane lt-list" data-state="error">${listHead}<div class="error-bar">${notice('bad', 'warn', t('MyEPO did not answer.', 'MyEPO hat nicht geantwortet.'), t(`The list shows your letters as of ${at(TODAY, '09:00')}. Nothing in the record changed.`, `Die Liste zeigt Ihre Schreiben mit Stand ${at(TODAY, '09:00')}. Im Record hat sich nichts geändert.`), retry())}</div>${table({ cols: LCOLS(), rows: letterRows('default'), sortKey: 'date', sortDir: 'descending', filters: letterFilters(), cls: 'lt-tbl' })}</div>`;
  const empty = `<div class="empty" data-state="empty"><div class="empty-in"><div class="empty-art" data-i="inbox"></div><h2>${t('No EPO letter yet', 'Noch kein EPA-Schreiben')}</h2><p>${t('When your firm links its MyEPO account, its Mailbox letters show here, each filed on its matter with its deadline.', 'Wenn Ihre Kanzlei ihr MyEPO-Konto verbindet, stehen hier ihre Mailbox-Schreiben, jedes in seiner Akte und mit seiner Frist.')}</p>${btn(t('Open the MyEPO card', 'MyEPO-Karte öffnen'), { icon: 'gear', attrs: ' data-href="5-myepo-card.html"' })}</div></div>`;
  const body = `${topbar(crumb('inbox', t('Letters', 'Schreiben')), btn(t('Search', 'Suchen'), { kind: 'ghost', icon: 'search', act: 'search' }))}
      <div class="split lt-split">
${views.map(v => list(v) + pane(v)).join('\n')}
${loading}${error}
      </div>
${empty}`;
  return page({ title: t('Letters', 'Schreiben'), body: app_({ person: 'lena', side: 'letters', body }) });
}

/** The letter page: below 1366 px a row opens it, and My work opens the letters of Dr. Anna Becker. */
function letterPage() {
  const all = [...LETTERS, R15, EXCEPTION];
  const views = [['default', LETTERS[0], true, 'lena'], ['unopened', LETTERS[0], false, 'lena'], ...all.filter(l => l.id !== 'r18').map(l => [l.id, l, false, ['r15', 'x1'].includes(l.id) ? 'anna' : 'lena'])];
  const body = views.map(([v, l, isOpen, viewer]) => `<div class="cset" data-state="${v}">${topbar(crumb('inbox', t('Letters', 'Schreiben'), l.key || t('No matter', 'Keine Akte'), '2-letters.html'), pager(viewer === 'anna' ? 1 : LETTERS.indexOf(l) + 1, viewer === 'anna' ? 2 : LETTERS.length))}
${work(letterBody(l, { isOpen, viewer }))}</div>`).join('\n');
  return page({ title: t('Letter', 'Schreiben'), body: app_({ person: 'lena', side: 'letters', body, as: { r15: 'anna', x1: 'anna' } }) });
}

// ======================================================================================================
// 3. Deadlines: the table by due date, the month view, and one deadline with its evidence
// ======================================================================================================
const HOW = {
  auto: () => t('Automatic', 'Automatisch'),
  differ: () => t('Needs a person: sources differ', 'Braucht eine Person: Quellen weichen ab'),
  rule: () => t('Needs a person: no rule', 'Braucht eine Person: keine Regel'),
  superseded: () => t('Replaced by a later letter', 'Durch ein späteres Schreiben ersetzt'),
};
const DSTATE = { 'SF-2022-0024': 'person', 'SF-2023-0045': '', 'SF-2023-0042': 'r16', 'SF-2024-0007': 'r6', 'SF-2021-0011': 'r1' };
const dlHref = d => `3-deadline.html${DSTATE[d.key] ? `?state=${DSTATE[d.key]}` : ''}`;
function deadlineRows() {
  return DEADLINES.map(d => {
    const l = LETTERS.find(x => x.id === d.letter);
    const m = M[d.key];
    return {
      href: dlHref(d),
      values: { dueat: d.due || '0000', open: d.closed ? 'closed' : 'open', status: d.atlas.split('.')[1], client: m.client, how: d.how, text: `${d.key} ${m.app} ${KIND[l.kind]()} ${clientOf(d.key).name}`.toLowerCase() },
      attrs: d.how === 'differ' ? ' data-walk="overdue"' : '',
      cells: [
        d.due ? `<span class="num">${date(d.due)}</span>${d.closed ? '' : `<div class="t12 due-sub" data-due="${d.due}"></div>`}` : `<span class="muted">${t('No date yet', 'Noch kein Datum')}</span>`,
        status(d.atlas),
        `<span class="${d.how === 'auto' ? '' : 'muted'}">${HOW[d.how]()}</span>`,
        `<span class="num">${d.key}</span>`,
        clientOf(d.key).short,
        `${KIND[l.kind]()}<div class="muted t12">${t(`of ${date(l.date)}`, `vom ${date(l.date)}`)}</div>`,
        av(m.resp),
      ],
    };
  });
}
const DCOLS = () => [
  { key: 'dueat', label: t('Due date', 'Fristende'), cls: 'c-due' },
  { key: 'status', label: t('Status', 'Status'), cls: 'c-dstatus' },
  { key: 'how', label: t('Confirmation', 'Bestätigung'), cls: 'c-how' },
  { key: 'key', label: t('Matter', 'Akte'), cls: 'c-key' },
  { key: 'client', label: t('Client', 'Mandant'), cls: 'c-cl w-md' },
  { key: 'event', label: t('Office event', 'Amtsereignis'), cls: 'c-ev w-md', sort: false },
  { key: 'resp', label: t('Responsible', 'Zuständig'), cls: 'c-av', sort: false },
];
const outlookLine = () => `<p class="outlook-line t12" data-i="outlook">${t('FlowLeap puts each confirmed deadline in the Outlook calendar of its responsible attorney.', 'FlowLeap trägt jede bestätigte Frist in den Outlook-Kalender der zuständigen Person ein.')}</p>`;
const viewTabs = on => `<div class="tabs"><a class="tab${on === 'table' ? ' is-on' : ''}" data-i="table" href="3-deadlines.html" data-walk="tab-table">${t('Table', 'Tabelle')}</a><a class="tab${on === 'month' ? ' is-on' : ''}" data-i="grid" href="3-deadlines.html?state=month" data-walk="tab-month">${t('Month', 'Monat')}</a></div>`;

function monthView() {
  // January 2027: Friday 1 January; the weeks start on Monday.
  const first = new Date(Date.UTC(2027, 0, 1)), lead = (first.getUTCDay() + 6) % 7;
  const head = (lang === 'de' ? ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']).map(w => `<div class="mh">${w}</div>`).join('');
  const cells = [];
  for (let i = 0; i < 35; i++) {
    const n = i - lead + 1;
    const inMonth = n >= 1 && n <= 31;
    const iso = inMonth ? `2027-01-${String(n).padStart(2, '0')}` : '';
    const evs = inMonth ? DEADLINES.filter(d => d.due === iso && !d.closed) : [];
    cells.push(`<div class="md${inMonth ? '' : ' out'}${evs.length ? ' has' : ''}">${inMonth ? `<span class="mdn num">${n}</span><span class="mdw only-sm">${long(iso)}</span>` : ''}${evs.map(d => `<a class="mev" href="${dlHref(d)}">${status(d.atlas)}<span class="num">${d.key}</span><span class="muted">${KIND_SHORT[LETTERS.find(x => x.id === d.letter).kind]()}</span></a>`).join('')}</div>`);
  }
  const over = DEADLINES.filter(d => d.due && d.due < TODAY && !d.closed);
  const none = DEADLINES.filter(d => !d.due && !d.closed);
  return `<div class="mv-bar"><h2 class="mv-title">${t('January 2027', 'Januar 2027')}</h2>${iconbtn('back', t('Previous month', 'Vorheriger Monat'), 'boxed')}${iconbtn('chev', t('Next month', 'Nächster Monat'), 'boxed')}${btn(t('Today', 'Heute'), { kind: 'ghost' })}<span class="spacer"></span>
<a class="chip mv-chip" href="3-deadline.html?state=person" data-walk="month-over"><span class="over-i" data-i="warn"></span>${t(`${over.length} overdue, in August 2026`, `${over.length} überfällig, im August 2026`)}</a><a class="chip mv-chip" href="3-deadlines.html">${t(`${none.length} without a date`, `${none.length} ohne Datum`)}</a></div>
<div class="month" role="grid" aria-label="${t('January 2027', 'Januar 2027')}">${head}${cells.join('')}</div>
<p class="src-line t12">${t('A legal deadline cannot move, so the month view has no drag and drop. Each deadline shows on the date on which it ends.', 'Eine gesetzliche Frist kann sich nicht verschieben, darum hat die Monatsansicht kein Ziehen und Ablegen. Jede Frist steht an dem Datum, an dem sie endet.')}</p>`;
}

function deadlines() {
  const head = `<div class="lt-head"><h1 class="title">${t('Deadlines', 'Fristen')}</h1><p class="lede">${t('Every deadline in the matters inside your walls, by due date. A person decides in My work; this page is for looking, search and audit.', 'Jede Frist in den Akten innerhalb Ihrer Bereiche, nach Fristende. Entschieden wird in „Meine Arbeit“; diese Seite ist zum Ansehen, Suchen und Prüfen.')}</p>${outlookLine()}</div>`;
  const filters = `<div class="dt-filters">${find(t('Find a deadline', 'Frist suchen'))}${select('status', t('Status', 'Status'), [['deadline_proposed', t('Deadline proposed', 'Frist vorgeschlagen')], ['engine_refused', t('Not computed', 'Nicht berechnet')], ['active', t('Active', 'Aktiv')], ['stale', t('Stale', 'Veraltet')]])}${select('client', t('Client', 'Mandant'), [['wago', 'Wago'], ['renishaw', 'Renishaw']])}${select('how', t('Confirmation', 'Bestätigung'), [['auto', HOW.auto()], ['differ', HOW.differ()], ['rule', HOW.rule()]])}<select class="field small" data-filter="open" aria-label="${t('Show', 'Zeigen')}"><option value="open" selected>${t('Open deadlines', 'Offene Fristen')}</option><option value="">${t('All deadlines', 'Alle Fristen')}</option></select></div>`;
  const tbl = `${table({ cols: DCOLS(), rows: deadlineRows(), sortKey: 'dueat', filters, total: DEADLINES.filter(d => !d.closed).length, cls: 'dl-tbl' })}<p class="src-line t12 dl-note">${draft()} ${t('The Confirmation column follows founder decision 6.', 'Die Spalte „Bestätigung“ folgt der Gründerentscheidung 6.')}</p>`;
  const skel = `<div class="dt-wrap"><table class="dt dl-tbl"><thead><tr>${DCOLS().map(c => `<th class="${c.cls}">${c.label}</th>`).join('')}</tr></thead><tbody>${['w60', 'w70', 'w50', 'w65'].map(w => `<tr>${DCOLS().map(c => `<td class="${c.cls}"><span class="skel ${w}"></span></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const body = `${topbar(crumb('calendar', t('Deadlines', 'Fristen')), btn(t('Search', 'Suchen'), { kind: 'ghost', icon: 'search', act: 'search' }), `<span class="cset" data-state="default loading error">${viewTabs('table')}</span><span class="cset" data-state="month">${viewTabs('month')}</span>`)}
      <div class="list-pane dl-page">
        ${head}
        <div data-state="default">${tbl}</div>
        <div data-state="error"><div class="error-bar">${notice('bad', 'warn', t('FlowLeap could not load the deadlines.', 'FlowLeap konnte die Fristen nicht laden.'), t(`The table shows them as of ${at(TODAY, '09:00')}. No deadline changed.`, `Die Tabelle zeigt sie mit Stand ${at(TODAY, '09:00')}. Keine Frist hat sich geändert.`), retry())}</div>${tbl}</div>
        <div data-state="loading">${skel}</div>
        <div class="mv" data-state="month">${monthView()}</div>
      </div>`;
  return page({ title: t('Deadlines', 'Fristen'), body: app_({ person: 'lena', side: 'deadlines', body }) });
}

/** The engine's steps in the person's words. */
const STEP = {
  delivery: () => t('Delivered on the date the letter bears', 'Zugestellt am Datum des Schreibens'),
  start: () => t('The period starts the next day', 'Die Frist beginnt am nächsten Tag'),
  add: () => t('Four months later, on the day with the same number', 'Vier Monate später, am Tag mit derselben Zahl'),
  open: () => t('The EPO is open on that day, so the date stays', 'Das EPA ist an diesem Tag geöffnet, das Datum bleibt'),
  roll: () => t('Saturday: the EPO is closed, so the period ends on the next open day', 'Samstag: Das EPA ist geschlossen, darum endet die Frist am nächsten offenen Tag'),
};
const LAWS = [['Rule 71 EPC', 'https://www.epo.org/en/legal/epc/2020/r71.html'], ['Rule 126 EPC', 'https://www.epo.org/en/legal/epc/2020/r126.html'], ['Rule 131 EPC', 'https://www.epo.org/en/legal/epc/2020/r131.html'], ['Rule 134 EPC', 'https://www.epo.org/en/legal/epc/2020/r134.html'], ['OJ EPO 2023, A29', 'https://www.epo.org/en/legal/official-journal/2023/03/a29']];
const trace = key => `<ol class="trace">${TRACES[key].steps.map(([op, , to, cite]) => `<li><span class="dot"></span><div><div class="what">${STEP[op]()}</div><div class="law">${cite}</div></div><div class="to">${long(to)}</div></li>`).join('')}</ol>`;
const check = (ok, h, d, tag = '') => `<li class="ck ${ok ? 'ok' : 'no'}"><span class="ck-i" data-i="${ok ? 'check' : 'x'}"></span><div><div class="h">${h}${tag ? ` ${tag}` : ''}</div><div class="d">${d}</div></div></li>`;

function deadlineDetail() {
  const views = [];
  // Automatic confirmation: SF-2023-0045 (decision 6, with the premise that an attorney signed the rule version).
  {
    const key = 'SF-2023-0045', m = M[key], tr = TRACES[key];
    views.push(['default', 'lena', key, `<div class="eyebrow">${status('deadline.active', 'pill')}<span>Rule 71(3) EPC</span></div>
<div class="keyfact"><span class="big num">${long(tr.due)}</span><span class="r" data-due="${tr.due}"></span></div>
<p class="lede">${t(`Rule 71(3) communication of ${date(tr.letter)}`, `Mitteilung nach Regel 71(3) vom ${date(tr.letter)}`)} · <span class="num">${key}</span> · ${nm(clientOf(key).name)} · ${app(key)}</p>
<div class="pane-props"><div class="prop"><span class="k">${t('Responsible', 'Zuständig')}</span><span class="v">${who(m.resp)}</span></div><div class="prop"><span class="k">${t('Outlook', 'Outlook')}</span><span class="v">${t(`In the calendar of ${P[m.resp].name}`, `Im Kalender von ${P[m.resp].name}`)}</span></div><div class="prop"><span class="k">${t('Letter', 'Schreiben')}</span><span class="v">${btn(t('Open the letter', 'Schreiben öffnen'), { kind: 'ghost', icon: 'mail', act: 'open-letter', cls: 'btn-sm', attrs: ' data-href="2-letters.html"' })}</span></div></div>
${section(t('Confirmation', 'Bestätigung'), `<div class="decided">${lstate('confirmed')}<span class="muted">${t(`Confirmed automatically by FlowLeap, ${at(LINKED, LINKED_HM)}. All three conditions hold.`, `Automatisch von FlowLeap bestätigt, ${at(LINKED, LINKED_HM)}. Alle drei Bedingungen sind erfüllt.`)}</span></div>
<ul class="checks-list">
${check(true, t('The event comes from a structured source', 'Das Ereignis kommt aus einer strukturierten Quelle'), t('The MyEPO letter list gives the document type and the dispatch date. Nobody typed them.', 'Die MyEPO-Schreibenliste liefert die Art des Dokuments und das Versanddatum. Niemand hat sie eingetippt.'))}
${check(true, t('An attorney signed the rule version', 'Eine Anwältin oder ein Anwalt hat die Regelversion unterschrieben'), t(`Rule 71(3) EPC, version 1, signed by ${P.martin.name} on 2 Nov 2026.`, `Regel 71(3) EPÜ, Version 1, unterschrieben von ${P.martin.name} am 2. Nov. 2026.`), exNote(t('Example premise', 'Beispielannahme')))}
${check(true, t('A second, independent source agrees', 'Eine zweite, unabhängige Quelle stimmt überein'), t(`The EPO due date in MyEPO is ${date(tr.due)}, the same date.`, `Die Frist des EPA in MyEPO ist der ${date(tr.due)}, dasselbe Datum.`), exNote())}
</ul>`, draft())}`]);
  }
  // Needs a person: SF-2022-0024, overdue.
  {
    const key = 'SF-2022-0024', m = M[key], tr = TRACES[key];
    views.push(['person', 'lena', key, `<div class="eyebrow">${status('deadline.deadline_proposed', 'pill')}<span>Rule 71(3) EPC</span></div>
<div class="keyfact"><span class="big num">${long(tr.due)}</span><span class="r" data-due="${tr.due}"></span></div>
<p class="lede">${t(`Rule 71(3) communication of ${date(tr.letter)}`, `Mitteilung nach Regel 71(3) vom ${date(tr.letter)}`)} · <span class="num">${key}</span> · ${nm(clientOf(key).name)} · ${app(key)}</p>
<div class="pane-props"><div class="prop"><span class="k">${t('Responsible', 'Zuständig')}</span><span class="v">${who(m.resp)}</span></div><div class="prop"><span class="k">${t('Outlook', 'Outlook')}</span><span class="v">${t('Not yet: only a confirmed deadline goes there', 'Noch nicht: Nur eine bestätigte Frist kommt dorthin')}</span></div><div class="prop"><span class="k">${t('Letter', 'Schreiben')}</span><span class="v">${btn(t('Open the letter', 'Schreiben öffnen'), { kind: 'ghost', icon: 'mail', act: 'open-letter', cls: 'btn-sm', attrs: ' data-href="2-letters.html?state=r5"' })}</span></div></div>
${section(t('Confirmation', 'Bestätigung'), `<div class="decided">${lstate('person')}<span class="muted">${t('FlowLeap did not confirm this deadline, for the two reasons below.', 'FlowLeap hat diese Frist nicht bestätigt, aus den zwei Gründen unten.')}</span></div>
<ul class="checks-list">
${check(true, t('The event comes from a structured source', 'Das Ereignis kommt aus einer strukturierten Quelle'), t('The MyEPO letter list gives the document type and the dispatch date.', 'Die MyEPO-Schreibenliste liefert die Art des Dokuments und das Versanddatum.'))}
${check(false, t('The rule version is not signed', 'Die Regelversion ist nicht unterschrieben'), t('No attorney has signed Rule 71(3) EPC, version 1, yet.', 'Noch keine Anwältin und kein Anwalt hat Regel 71(3) EPÜ, Version 1, unterschrieben.'))}
${check(false, t('The sources differ', 'Die Quellen weichen ab'), t('MyEPO lists no open EPO due date for this application. The grant fee may be paid; the EP Register shows no act yet.', 'MyEPO nennt für diese Anmeldung keine offene Frist des EPA. Die Erteilungsgebühr ist vielleicht bezahlt; das EP-Register zeigt noch keine Handlung.'), exNote())}
</ul>`, draft())}`, `          <div class="decision wiz-foot">
            ${btn(t('Reject…', 'Ablehnen…'), { kind: 'ghost', act: 'reject' })}
            <span class="note">${t('Check the file for the act first. Confirm makes the deadline active and puts it in your Outlook calendar.', 'Prüfen Sie zuerst die Akte auf die Handlung. „Frist bestätigen“ macht die Frist aktiv und trägt sie in Ihren Outlook-Kalender ein.')}</span>
            ${btn(t('Confirm deadline', 'Frist bestätigen'), { kind: 'primary', icon: 'check', cls: 'btn-lg', act: 'record' })}
          </div>`]);
  }
  // No rule: the person enters the date that the letter states.
  for (const l of [LETTERS.find(x => x.id === 'r16'), LETTERS.find(x => x.id === 'r6'), R15]) {
    const key = l.key, m = M[key];
    const viewer = l.id === 'r15' ? 'anna' : 'lena';
    const mine = m.resp === viewer;
    views.push([l.id, viewer, key, `<div class="eyebrow">${status('deadline.engine_refused', 'pill')}<span>${KIND_SHORT[l.kind]()}</span></div>
<h1 class="title">${t('Enter the deadline', 'Frist eintragen')}</h1>
<p class="lede">${KIND[l.kind]()} ${t(`of ${date(l.date)}`, `vom ${date(l.date)}`)} · <span class="num">${key}</span> · ${nm(clientOf(key).name)} · ${app(key)}</p>
<div class="pane-props"><div class="prop"><span class="k">${t('Responsible', 'Zuständig')}</span><span class="v">${who(m.resp)}</span></div><div class="prop"><span class="k">${t('Outlook', 'Outlook')}</span><span class="v">${t('Not yet', 'Noch nicht')}</span></div><div class="prop"><span class="k">${t('Letter', 'Schreiben')}</span><span class="v">${btn(t('Open the letter', 'Schreiben öffnen'), { kind: 'ghost', icon: 'mail', act: 'open-letter', cls: 'btn-sm', attrs: ` data-href="2-letter.html?state=${l.id}"` })}</span></div></div>
${section(t('Confirmation', 'Bestätigung'), `<div class="decided">${lstate('person')}<span class="muted">${t('FlowLeap computed no date.', 'FlowLeap hat kein Datum berechnet.')}</span></div>
<ul class="checks-list">
${check(true, t('The event comes from a structured source', 'Das Ereignis kommt aus einer strukturierten Quelle'), t('The MyEPO letter list gives the document type and the dispatch date.', 'Die MyEPO-Schreibenliste liefert die Art des Dokuments und das Versanddatum.'))}
${check(false, t('No rule for this letter type', 'Keine Regel für diese Art von Schreiben'), t('FlowLeap has no rule yet that computes this deadline. The letter states its period.', 'FlowLeap hat noch keine Regel, die diese Frist berechnet. Das Schreiben nennt seine Frist.'))}
</ul>`, draft())}
${section(t('The date from the letter', 'Das Datum aus dem Schreiben'), `<div class="fields">
<label class="efield"><span class="k">${t('Period that the letter states', 'Frist, die das Schreiben nennt')}</span><select class="input" aria-label="${t('Period that the letter states', 'Frist, die das Schreiben nennt')}"><option>${t('Choose the period', 'Frist wählen')}</option><option>${t('2 months', '2 Monate')}</option><option>${t('4 months', '4 Monate')}</option><option>${t('6 months', '6 Monate')}</option></select></label>
<label class="efield"><span class="k">${t('Due date', 'Fristende')}</span><input class="input" aria-label="${t('Due date', 'Fristende')}" placeholder="${t('Choose a date', 'Datum wählen')}"></label>
</div><p class="src-line t12">${t('A second person confirms a date that a person enters. FlowLeap names that person.', 'Ein Datum, das eine Person einträgt, bestätigt eine zweite Person. FlowLeap nennt diese Person.')}</p>`)}`, mine ? `          <div class="decision wiz-foot">
            <span class="note">${t('Enter deadline waits for the period and the date.', '„Frist eintragen“ wartet auf die Frist und das Datum.')}</span>
            ${btn(t('Enter deadline', 'Frist eintragen'), { kind: 'primary', icon: 'check', cls: 'btn-lg', act: 'record', attrs: off })}
          </div>` : `          <div class="decision wiz-foot"><span class="note">${t(`${P[m.resp].name}, the responsible attorney, enters this deadline.`, `${P[m.resp].name}, die zuständige Person, trägt diese Frist ein.`)}</span></div>`]);
  }
  // A closed deadline: replaced by a later letter.
  {
    const key = 'SF-2021-0011';
    views.push(['r1', 'lena', key, `<div class="eyebrow">${status('deadline.stale', 'pill')}<span>Rule 71(3) EPC</span></div>
<div class="keyfact"><span class="big num">${long('2025-10-20')}</span></div>
<p class="lede">${t('Rule 71(3) communication of 20 Jun 2025', 'Mitteilung nach Regel 71(3) vom 20. Juni 2025')} · <span class="num">${key}</span> · ${nm(clientOf(key).name)} · ${app(key)}</p>
${section(t('Why it is closed', 'Warum sie geschlossen ist'), `<p class="plain">${CLOSED.r1()} ${t('FlowLeap keeps the deadline and its evidence for the audit.', 'FlowLeap behält die Frist und ihre Nachweise für die Prüfung.')}</p>`)}`]);
  }
  const evidence = key => TRACES[key] ? `${section(t('Sources', 'Quellen'), `<div class="mtbl src-tbl" role="table">
<div class="tr th" role="row"><span role="columnheader">${t('Source', 'Quelle')}</span><span role="columnheader">${t('What it says', 'Was sie sagt')}</span><span role="columnheader">${t('Read', 'Gelesen')}</span></div>
<div class="tr" role="row"><span role="cell">${t('MyEPO letter list', 'MyEPO-Schreibenliste')}</span><span role="cell">${t(`Rule 71(3) communication, dispatched ${date(TRACES[key].letter)}, ${app(key)}`, `Mitteilung nach Regel 71(3), versandt am ${date(TRACES[key].letter)}, ${app(key)}`)}</span><span role="cell" class="num">${at(LINKED, LINKED_HM)}</span></div>
<div class="tr" role="row"><span role="cell">${t('The letter', 'Das Schreiben')}</span><span role="cell">${key === 'SF-2023-0045' ? `<span class="span-ref"><span class="quote" data-verbatim>29.09.2026</span><span class="page-ref">${t('p.', 'S.')} 1</span></span> <span class="span-ref"><span class="quote" data-verbatim>Communication under Rule 71(3) EPC</span><span class="page-ref">${t('p.', 'S.')} 1</span></span>` : `<span class="muted">${t('Not opened. FlowLeap computed from the list data.', 'Nicht geöffnet. FlowLeap hat aus den Listendaten berechnet.')}</span>`}</span><span role="cell" class="num">${key === 'SF-2023-0045' ? at(TODAY, '09:12') : '–'}</span></div>
<div class="tr" role="row"><span role="cell">${t('EPO due dates in MyEPO', 'Fristen des EPA in MyEPO')}</span><span role="cell">${key === 'SF-2023-0045' ? date(TRACES[key].due) : t('No open due date', 'Keine offene Frist')} ${exNote()}</span><span role="cell" class="num">${at(LINKED, LINKED_HM)}</span></div>
<div class="tr" role="row"><span role="cell">${t('EP Register', 'EP-Register')}</span><span role="cell">${nm(M[key].status)}</span><span role="cell" class="num">${date(TODAY)}</span></div>
</div>`)}
${section(t('Rule', 'Regel'), `<p class="plain">${t('Rule 71(3) EPC, version 1, in force for letters from 1 Nov 2023: four months from the date that the letter bears, then Rule 134(1) EPC.', 'Regel 71(3) EPÜ, Version 1, gültig für Schreiben ab dem 1. Nov. 2023: vier Monate ab dem Datum des Schreibens, dann Regel 134(1) EPÜ.')}</p><div class="law-chips">${[...LAWS, key === 'SF-2023-0045' ? ['OJ EPO 2026, A30', 'https://www.epo.org/en/legal/official-journal/2026/06/a30'] : ['OJ EPO 2025, A40', 'https://www.epo.org/en/legal/official-journal/2025/05/a40']].map(([l, u]) => `<a class="law-chip" href="${u}" data-i="external">${l}</a>`).join('')}</div>`)}
${section(t('Computation', 'Berechnung'), trace(key))}` : '';
  const body = views.map(([v, viewer, key, scroll, dock = '']) => `<div class="cset" data-state="${v}">${topbar(crumb('calendar', t('Deadlines', 'Fristen'), key, '3-deadlines.html'), viewer === 'anna' ? '' : pager(Math.max(1, DEADLINES.findIndex(d => d.key === key) + 1), DEADLINES.length - 1))}
${work(`${scroll}${evidence(key)}`, dock)}</div>`).join('\n');
  return page({ title: t('Deadline', 'Frist'), body: app_({ person: 'lena', side: 'deadlines', body, as: { r15: 'anna' } }) });
}

// ======================================================================================================
// 4. My work of Dr. Anna Becker with the three kinds of MyEPO item (the My work of PR 343, not redesigned)
// ======================================================================================================
function myWork() {
  const rows = [
    { group: 'today', href: '3-deadline.html?state=r15', atlas: 'deadline.engine_refused', task: t('Enter the deadline', 'Frist eintragen'), why: t('Notice of opposition · no rule for this letter type', 'Einspruch · keine Regel für diese Art von Schreiben'), key: 'SF-2026-0019', client: 'Phoenix Contact', legal: '', due: TODAY },
    { group: 'today', href: '2-letter.html?state=x1', atlas: 'intake.unmatched', task: t('Look at this letter', 'Dieses Schreiben ansehen'), why: t('From MyEPO · no application number', 'Aus MyEPO · keine Anmeldenummer'), key: '', client: '', legal: '', due: TODAY, walk: 'exception' },
    { group: 'later', href: '', atlas: 'ticket.proposals_ready', task: t('Review the prepared work', 'Vorbereitete Arbeit prüfen'), why: t('Rule 71(3) communication · prepared when the letter arrived', 'Regel 71(3) · bei Eingang des Schreibens vorbereitet'), key: 'SF-2023-0045', client: 'Renishaw', legal: '2027-01-29', due: '2027-01-15' },
  ];
  const groups = [['over', 'warn', t('Overdue', 'Überfällig')], ['today', 'today', t('Today', 'Heute')], ['later', 'later', t('Later', 'Später')]];
  const row = (r, i) => {
    const tag = r.href ? 'a' : 'div';
    return `<${tag} class="row${i === 0 ? ' is-context' : ''}"${r.href ? ` href="${r.href}"` : ''}${r.walk ? ` data-walk="${r.walk}"` : ''}><span class="t c-task"><span class="task">${r.task}</span><span class="muted hide-sm">${r.why}</span></span>${status(r.atlas)}<span class="m num c-key">${r.key || '–'}</span><span class="m hide-sm">${r.client || '–'}</span><span class="hide-sm">${r.legal ? `<span class="legal" data-i="scale">${long(r.legal).replace(/^\S+ /, '')}</span>` : ''}</span><span class="r c-due" data-due="${r.due}"></span></${tag}>`;
  };
  let i = 0;
  const list = groups.map(([g, icon, word]) => {
    const rs = rows.filter(r => r.group === g);
    return rs.length ? `<div class="group"><span class="gi" data-i="${icon}"></span>${word}<span class="count">${rs.length}</span></div>\n${rs.map(r => row(r, i++)).join('\n')}` : '';
  }).filter(Boolean).join('\n');
  const thead = `<div class="thead"><span>${t('Task', 'Aufgabe')}</span><span>${t('Status', 'Status')}</span><span>${t('Matter', 'Akte')}</span><span>${t('Client', 'Mandant')}</span><span>${t('Legal date', 'Fristende')}</span><span class="end">${t('Due', 'Fällig')}</span></div>`;
  const menu = `<div class="menu ctx-menu ctx-at" id="row-menu" data-state="context" role="menu">
  ${mi('open', t('Open', 'Öffnen'), 'eye', true)}
  ${mi('go-matter', t('Open matter', 'Akte öffnen'), 'matters')}
  ${mi('open-letter', t('Open the letter', 'Schreiben öffnen'), 'mail')}
  <div class="sep"></div>
  ${mi('', t('Copy link', 'Link kopieren'), 'link')}
</div>`;
  const body = `${topbar(crumb('mywork', t('My work', 'Meine Arbeit')), `${btn(t('Search', 'Suchen'), { kind: 'ghost', icon: 'search', act: 'search' })}<span class="iconbtn boxed" data-i="filter" role="button" aria-label="${t('Filter', 'Filter')}"></span>`)}
      <div class="list-pane">
        <div class="mw-head">
          <h1 class="title">${t('2 letters arrived, 1 letter worked, 3 need you', '2 Schreiben eingegangen, 1 Schreiben bearbeitet, 3 brauchen Sie')}</h1>
          <p class="lede"><span data-day></span> · ${t('2 due today, 1 later', '2 heute fällig, 1 später')}</p>
        </div>
        <div class="list mw" data-list="my-work">
          ${thead}
${list}
        </div>
      </div>`;
  return page({ title: t('My work', 'Meine Arbeit'), body: app_({ person: 'anna', side: 'mywork', body }), after: menu });
}

// ======================================================================================================
// 5. The MyEPO card with the letter setting (an addition to the approved card of PR 365)
// ======================================================================================================
function card() {
  const mode = (on, k, h, d, what) => `<div class="opt mode${on ? ' on' : ''}" role="radio" aria-checked="${on}"${k === 'arrival' && !on ? ' data-walk="mode-arrival" data-href="5-myepo-card.html?state=arrival"' : ''}${k === 'opened' && !on ? ' data-walk="mode-opened" data-href="5-myepo-card.html?state=linked"' : ''}><span class="radio${on ? ' on' : ''}"></span><div><div class="h">${h}</div><div class="d">${d}</div><ul class="what">${what.map(([icon, w]) => `<li data-i="${icon}">${w}</li>`).join('')}</ul></div></div>`;
  const OPENED = on => mode(on, 'opened', t('Download a letter when a person or a task opens it', 'Ein Schreiben herunterladen, wenn eine Person oder eine Aufgabe es öffnet'), t('Default. For the time beside your old docket: MyEPO stays as your team knows it.', 'Standard. Für die Zeit neben Ihrem alten Fristenkalender: MyEPO bleibt, wie Ihr Team es kennt.'), [
    ['check', t('In your MyEPO, a letter stays unread until a person or a task opens it in FlowLeap.', 'In Ihrem MyEPO bleibt ein Schreiben ungelesen, bis eine Person oder eine Aufgabe es in FlowLeap öffnet.')],
    ['check', t('FlowLeap files each letter and computes its deadline at arrival, from the list data.', 'FlowLeap legt jedes Schreiben bei Eingang ab und berechnet seine Frist aus den Listendaten.')],
    ['info', t('The agent prepares the work on a letter only after a person opens it.', 'Der Agent bereitet die Arbeit an einem Schreiben erst vor, wenn eine Person es öffnet.')],
  ]);
  const ARRIVAL = on => mode(on, 'arrival', t('Download each letter when it arrives', 'Jedes Schreiben bei Eingang herunterladen'), t('The agent prepares the work before anybody opens the letter.', 'Der Agent bereitet die Arbeit vor, bevor jemand das Schreiben öffnet.'), [
    ['warn', t('In your MyEPO, every letter shows as read a few minutes after it arrives. A person who works in MyEPO no longer sees which letters are new.', 'In Ihrem MyEPO ist jedes Schreiben wenige Minuten nach Eingang als gelesen markiert. Wer in MyEPO arbeitet, sieht nicht mehr, welche Schreiben neu sind.')],
    ['check', t('FlowLeap files each letter and computes its deadline at arrival, from the list data.', 'FlowLeap legt jedes Schreiben bei Eingang ab und berechnet seine Frist aus den Listendaten.')],
    ['check', t('The agent reads the PDF and prepares the work at once.', 'Der Agent liest das PDF und bereitet die Arbeit sofort vor.')],
  ]);
  const both = t('In both modes, FlowLeap never marks a letter as handled in MyEPO.', 'In beiden Modi markiert FlowLeap ein Schreiben in MyEPO nie als erledigt.');
  const part = (arrival, saved, readonly = false) => `<div class="ccard-part letters-part"><div class="label-12">${t('Letters from the Mailbox', 'Schreiben aus der Mailbox')}</div>
<p class="part-intro">${t('A download marks a letter as read in your firm’s MyEPO. Choose when FlowLeap downloads.', 'Ein Download markiert ein Schreiben im MyEPO Ihrer Kanzlei als gelesen. Wählen Sie, wann FlowLeap herunterlädt.')}</p>
<div class="opts" role="radiogroup" aria-label="${t('When FlowLeap downloads a letter', 'Wann FlowLeap ein Schreiben herunterlädt')}"${readonly ? off : ''}>${OPENED(!arrival)}${ARRIVAL(arrival)}</div>
<p class="part-note" data-i="shield">${both}${readonly ? ` ${t(`Only an administrator changes this setting. Set by ${P.felix.name}.`, `Nur ein Administrator ändert diese Einstellung. Gesetzt von ${P.felix.name}.`)}` : saved ? ` ${t(`Changed by ${P.felix.name}, ${at(TODAY, '08:40')}.`, `Geändert von ${P.felix.name}, ${at(TODAY, '08:40')}.`)}` : ''}</p>
</div>`;
  const head = right => `<div class="ccard-h"><span class="ccard-mark" data-i="epo"></span><span class="name">MyEPO</span><span class="cstatus"><span class="cst" data-s="ok"></span>${t('Linked', 'Verbunden')}</span><span class="right">${right}</span></div>`;
  const headActs = `${btn(t('Test', 'Testen'), { icon: 'retry' })}<span class="iconbtn boxed" data-i="dots" role="button" aria-label="${t('More acts: Replace credentials, Unlink', 'Weitere Aktionen: Zugangsdaten ersetzen, Verbindung trennen')}"></span>`;
  const summary = `<div class="ccard-b"><div class="summary"><span><b>${t('6 portfolios', '6 Portfolios')}</b></span><span>${t('Mailbox access', 'Mailbox-Zugriff')}</span><span>${t('Last test', 'Letzter Test')} ${at(LINKED, '14:02')}</span></div></div>`;
  const importRow = `<div class="ccard-part next-part"><div><div class="h">${t('Next: import your EP docket', 'Als Nächstes: EP-Bestand importieren')}</div><div class="d">${t('FlowLeap proposes your clients from the applications in MyEPO, and starts to read the Mailbox after the import.', 'FlowLeap schlägt Ihre Mandanten aus den Anmeldungen in MyEPO vor und startet den Mailbox-Eingang nach dem Import.')}</div></div>${btn(IMPORT(), { kind: 'secondary', icon: 'clients', attrs: ' data-walk="import" data-href="1a-docket.html?state=reading"' })}</div>`;
  const foot = (enabled, note) => `<div class="ccard-f"><span class="note" data-i="lock">${note}</span><div class="acts">${btn(t('Save', 'Speichern'), { kind: 'primary', attrs: enabled ? ' data-walk="save" data-href="5-myepo-card.html?state=saved"' : off })}</div></div>`;
  const states = {
    linked: [head(headActs), summary, part(false, false), importRow, foot(false, t('Nothing changed.', 'Nichts geändert.'))],
    arrival: [head(headActs), summary, part(true, false), foot(true, t('Save applies the setting to the next letter.', '„Speichern“ gilt ab dem nächsten Schreiben.'))],
    saved: [head(headActs), summary, part(true, true), foot(false, t('Saved. It applies from the next letter.', 'Gespeichert. Es gilt ab dem nächsten Schreiben.'))],
    readonly: [head(btn(t('Test', 'Testen'), { icon: 'retry', attrs: off })), summary, part(false, false, true)],
  };
  const defaultState = `<div class="ccard myepo" data-state="default">${states.linked.join('\n')}</div>`;
  const body = `<div class="app">
  <nav data-sidebar="settings"></nav>
  <main class="main"><section class="panel"><div class="behind"></div></section></main>
</div>
<div class="overlay" role="presentation">
  <div class="mask" aria-hidden="true"></div>
  <div class="dlg" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
    <div class="dlg-title" id="dlg-title" data-dlg-title></div>
    <div class="dlg-header">${btn(t('Open configuration file', 'Konfigurationsdatei öffnen'))}<span class="iconbtn" data-i="x" role="button" aria-label="${t('Close', 'Schließen')}"></span></div>
    <nav class="dlg-nav" data-nav="connectors"></nav>
    <div class="dlg-options">
      <h2 class="sec-title">${t('Connectors', 'Anbindungen')}</h2>
      <p class="sec-intro">${t('FlowLeap reads your firm\'s EPO account and the patent data services with the firm\'s own keys.', 'FlowLeap liest das EPA-Konto Ihrer Kanzlei und die Patentdatendienste mit den eigenen Schlüsseln der Kanzlei.')}</p>
      <div class="grp-h">${t('Your firm\'s EPO account', 'EPA-Konto Ihrer Kanzlei')}</div>
${defaultState}
${Object.entries(states).map(([s, parts]) => `      <div class="ccard myepo" data-state="${s}">\n${parts.join('\n')}\n      </div>`).join('\n')}
    </div>
  </div>
</div>`;
  return page({ title: t('MyEPO connector: letters', 'MyEPO-Anbindung: Schreiben'), body, extraCss: '<link rel="stylesheet" href="../myepo/myepo.css">\n', frameJs: '../myepo/frame.js' });
}

// ======================================================================================================
// 0. The review page: every screen and state, the walkthrough, and the decisions for the founder
// ======================================================================================================
const PAGES = [['1a-docket', docket], ['1b-clients', clientsStep], ['1c-conflict', conflictStep], ['1d-review', reviewStep], ['1e-record', recordStep], ['2-letters', letters], ['2-letter', letterPage], ['3-deadlines', deadlines], ['3-deadline', deadlineDetail], ['4-my-work', myWork], ['5-myepo-card', card], ['index', () => REVIEW({ lang, t, page, nm })]];
for (const l of ['en', 'de']) {
  lang = l;
  // A German page links to the German page of each mockup.
  const local = html => (l === 'de' ? html.replace(/((?:href|data-href|data-narrow-href|data-narrow-page)="(?:\d[a-z]?-[a-z0-9-]+|index))\.html/g, '$1.de.html') : html);
  for (const [name, fn] of PAGES) writeFileSync(path.join(OUT, `${name}${l === 'de' ? '.de' : ''}.html`), local(fn()));
}
console.log(`wrote ${PAGES.length * 2} pages`);
