// Writes the client model mockups, each page in English (<name>.html) and German (<name>.de.html), from this one source.
// Usage: node build.mjs. Edit this file, never the generated HTML. The data is public and real (EP Register, read on
// 2026-11-09), except where README.md names an example. "Your firm" stands for the firm's name.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { CLIENT, ASOF, ASOF_HM, DOCKET, NAMES, MATTERS, OTHERS, FOUND, LARGE, EMPTY, EVENTS, CLIENTS } from './data.mjs';

const OUT = import.meta.dirname;
const RECORDS_CSS = '../../../../.agents/skills/flowleap-design-language/references/mockups/records.css';
const PERSON = 'Dr. Anna Becker';
// The application where work started in the demo: a person opened it and dropped the firm's files.
const WORKED = MATTERS[0];
const TEMPLATE = ['Associates', 'Client', 'Drafts', 'Internal', 'Office', 'Search'];

let lang = 'en';
const t = (en, de) => (lang === 'de' ? de : en);

// ---------- words and formats ----------
const MO = { en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], de: ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'] };
const date = iso => { const [y, m, d] = iso.split('-').map(Number); return lang === 'de' ? `${d}. ${MO.de[m - 1]} ${y}` : `${d} ${MO.en[m - 1]} ${y}`; };
const app = a => `EP ${a.slice(2, 4)} ${a.slice(4, 7)} ${a.slice(7)}`;
const pub = p => { const [n, k] = p.split(' '); return `EP ${n.slice(2, 3)} ${n.slice(3, 6)} ${n.slice(6)} ${k}`; };
const int = n => n.toLocaleString(lang === 'de' ? 'de-DE' : 'en-GB');
const capped = n => (n >= 10000 ? `${int(10000)}+` : int(n));
/** Data from a source (a register status, an event, an applicant name, a file name): not product copy. */
const nm = s => `<span data-verbatim>${s}</span>`;
const at = (iso, hm) => t(`${date(iso)}, ${hm}`, `${date(iso)}, ${hm}`);
const addClient = () => t('Add client', 'Mandant hinzufügen');
const steps = n => `<div class="steps-line">${[t('Company', 'Unternehmen'), t('Role and matters', 'Rolle und Akten'), t('Record', 'Erfassen')].map((s, i) => i + 1 < n ? `<span class="done" data-i="check">${s}</span>` : i + 1 === n ? `<span class="on">${s}</span>` : `<span>${s}</span>`).join('')}</div>`;
const exNote = () => `<span class="ex-note">${t('Example', 'Beispiel')}</span>`;

// ---------- parts ----------
const page = ({ title, body, after = '' }) => `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<!-- Generated from build.mjs: edit that file and run node build.mjs, never this file -->
<link rel="stylesheet" href="${RECORDS_CSS}">
<link rel="stylesheet" href="../add-client/add-client.css">
<link rel="stylesheet" href="client-model.css">
</head>
<body>
${body}
${after}<script src="../add-client/frame.js"></script>
<script src="table.js"></script>
<script src="walk.js"></script>
</body>
</html>
`;
const frame = ({ ws = '', side = 'clients', body }) => `<div class="app">
  <nav data-sidebar="${side}"${ws ? ` data-ws="${ws}"` : ''}></nav>
  <main class="main">
    <section class="panel fixed">
${body}
    </section>
  </main>
</div>`;
const btn = (label, { kind = 'secondary', icon = '', cls = '', attrs = '', key = '', act = '' } = {}) =>
  `<span class="btn btn-${kind}${cls ? ` ${cls}` : ''}"${icon ? ` data-i="${icon}"` : ''}${act ? ` data-act="${act}"` : ''} role="button"${attrs}>${label}${key ? ` <span class="kbd">${key}</span>` : ''}</span>`;
const iconbtn = (icon, label, cls = '') => `<span class="iconbtn${cls ? ` ${cls}` : ''}" data-i="${icon}" role="button" aria-label="${label}"></span>`;
const off = ' aria-disabled="true"';
const topbar = (trail, right = '', { root = t('Clients', 'Mandanten'), icon = 'clients', tabs = '' } = {}) => `      <header class="topbar">
        <div class="crumbs"><span class="ico hide-sm" data-i="${icon}"></span>${trail.length ? `<span class="hide-sm">${root}</span>` : `<span class="here">${root}</span>`}${trail.map((c, i) => `<span class="sep hide-sm">›</span><span class="${i === trail.length - 1 ? `here${tabs ? ' hide-sm' : ''}` : 'lvl hide-sm'}">${c}</span>`).join('')}</div>${tabs}
        <div class="bar-right">${right}</div>
      </header>`;
const section = (h, count, inner, right = '') => `<div class="section"><div class="section-h"><h2>${h}</h2>${count === '' ? '' : `<span class="count">${count}</span>`}${right ? `<span class="right">${right}</span>` : ''}</div>${inner}</div>`;
const notice = (cls, icon, lead, rest = '', act = '') => `<div class="notice${cls ? ` ${cls}` : ''}" data-i="${icon}"><div><span class="lead">${lead}</span>${rest ? ` <span>${rest}</span>` : ''}</div>${act ? `<span class="spacer"></span>${act}` : ''}</div>`;
const retry = () => btn(t('Try again', 'Erneut versuchen'), { icon: 'retry', act: 'retry', key: 'R' });
// The footer of a wizard step: Back, Cancel, what happens next, and the one primary act. It is a plain bar docked
// under the scrolling form, not a floating card; it keeps the class `decision` so check-mockups proves that the
// primary act stays in view (R13).
const formFoot = ({ note, primary, disabled = false, back = '3-find.html' }) => `          <div class="decision wiz-foot">
            ${btn(`<span class="hide-sm">${t('Back', 'Zurück')}</span>`, { kind: 'ghost', icon: 'back', attrs: ` aria-label="${t('Back', 'Zurück')}" data-href="${back}"` })}${btn(t('Cancel', 'Abbrechen'), { kind: 'ghost', attrs: ' data-href="0-clients.html"' })}
            <span class="note">${note}</span>
            ${btn(primary, { kind: 'primary', icon: 'check', cls: 'btn-lg', act: 'record', key: '⇧⌘↵', attrs: disabled ? off : ' data-walk="record" data-href="5-record.html"' })}
          </div>`;
const work = (scroll, dock = '') => `      <div class="work">
        <div class="work-scroll"><div class="flow">
${scroll}
        </div></div>
${dock}
      </div>`;

// ---------- the docket: its state line, used by step 1 and the firm identity setting ----------
const docketReady = (d = DOCKET) => `<div class="docket-line ok" data-i="check"><span><span class="lead">${t(`Your firm’s EP docket: ${int(d.rows)} EP applications.`, `EP-Bestand Ihrer Kanzlei: ${int(d.rows)} EP-Anmeldungen.`)}</span> ${t(`Read from the EP Register with ${d.queries} queries, as of ${at(ASOF, DOCKET.hm)}.`, `Aus dem EP-Register mit ${d.queries} Abfragen gelesen, Stand ${at(ASOF, DOCKET.hm)}.`)}</span></div>`;
const docketReading = () => `<div class="docket-line run" data-i="spin"><span><span class="lead">${t(`Reading your firm’s EP docket: 2 of ${DOCKET.queries} queries, 21 rows.`, `Der EP-Bestand Ihrer Kanzlei wird gelesen: 2 von ${DOCKET.queries} Abfragen, 21 Zeilen.`)}</span> ${t('The counts At your firm wait until the docket is read.', 'Die Zahlen „In Ihrer Kanzlei“ warten, bis der Bestand gelesen ist.')}<div class="bar p50"><span></span></div></span></div>`;
const docketPartial = () => notice('warn', 'warn', t('Your firm’s EP docket is incomplete.', 'Der EP-Bestand Ihrer Kanzlei ist unvollständig.'), t(`1 of ${DOCKET.queries} queries could not be read: the representative Weber, Jonas. The counts At your firm can be too low.`, `1 von ${DOCKET.queries} Abfragen konnte nicht gelesen werden: der Vertreter Weber, Jonas. Die Zahlen „In Ihrer Kanzlei“ können zu niedrig sein.`), retry());
const docketFailed = () => notice('bad', 'warn', t('FlowLeap could not read your firm’s EP docket.', 'FlowLeap konnte den EP-Bestand Ihrer Kanzlei nicht lesen.'), t(`The EP Register did not answer at ${DOCKET.hm}. FlowLeap does not know your firm’s matters, so it shows no count At your firm.`, `Das EP-Register hat um ${DOCKET.hm} nicht geantwortet. FlowLeap kennt die Akten Ihrer Kanzlei nicht und zeigt darum keine Zahl „In Ihrer Kanzlei“.`), retry());
const docketNone = () => notice('', 'info', t('FlowLeap cannot find your firm’s matters yet.', 'FlowLeap kann die Akten Ihrer Kanzlei noch nicht finden.'), t('Set your firm’s names and addresses in Settings, Firm identity. FlowLeap then reads your EP docket.', 'Tragen Sie die Namen und Adressen Ihrer Kanzlei in Einstellungen, Kanzleidaten ein. FlowLeap liest dann Ihren EP-Bestand.'), btn(t('Open firm identity', 'Kanzleidaten öffnen'), { icon: 'gear' }));
const privacyDocket = () => `<div class="privacy t12" data-i="lock"><span>${t('FlowLeap sends your firm’s names to the EP Register, through your firm’s EPO account, to read your EP docket. It sends no client name.', 'FlowLeap sendet die Namen Ihrer Kanzlei über das EPA-Konto Ihrer Kanzlei an das EP-Register, um Ihren EP-Bestand zu lesen. Es sendet keinen Mandantennamen.')}</span></div>`;

// ---------- the client page header, its tabs and its application table ----------
/** The tabs of a client page; `state` keeps the walkthrough's state of the client (`work`: one matter folder exists). */
const tabs = (on, count, state = '') => `<div class="tabs"><a class="tab${on === 'apps' ? ' is-on' : ''}" data-walk="apps" href="1-client-applications.html${state ? `?state=${state}` : ''}" data-i="review">${t('Applications', 'Anmeldungen')} <span class="count">${int(count)}</span></a><a class="tab${on === 'files' ? ' is-on' : ''}" data-walk="files" href="2-client-files.html${state ? `?state=${state}` : ''}" data-i="folder">${t('Files', 'Dateien')}</a></div>`;
/** Below 1080 px the overflow button holds the top bar acts that hide. */
const moreActs = () => iconbtn('dots', t('More acts', 'Weitere Aktionen'), 'only-md');
const clientActs = () => `${btn(t('Check for new matters', 'Nach neuen Akten suchen'), { icon: 'retry', cls: 'hide-md' })}${moreActs()}${btn(t('Ask about this', 'Hierzu fragen'), { kind: 'primary', icon: 'ask' })}`;

/**
 * A data table: sortable headers, a filter bar and pagination, driven by table.js in the browser. Each column is
 * { key, label, cls, sort }; each row is { cells, values, href, attrs }, where `values` holds the sort and filter values.
 * `note` is the line that an example table shows where the mockup has no more rows.
 */
const table = ({ cols, rows, sortKey, sortDir = 'ascending', filters = '', total = rows.length, pageSize = 25, note = '' }) => {
  const head = cols.map(c => `<th class="${c.cls || ''}"${c.sort === false ? '' : ` data-sort="${c.key}"`}${c.key === sortKey ? ` aria-sort="${sortDir}"` : ''} scope="col"><span>${c.label}</span>${c.sort === false ? '' : '<span class="sort" data-i="chevd" aria-hidden="true"></span>'}</th>`).join('');
  const body = rows.map(r => `<tr${r.href ? ` data-href="${r.href}"` : ''}${Object.entries(r.values || {}).map(([k, v]) => ` data-${k}="${v}"`).join('')}${r.attrs || ''}>${r.cells.map((c, i) => `<td class="${cols[i].cls || ''}">${c}</td>`).join('')}</tr>`).join('');
  const sizes = [10, 25, 50, 100].map(n => `<option${n === pageSize ? ' selected' : ''}>${n}</option>`).join('');
  return `${filters}<div class="dt-wrap"><table class="dt" data-table data-total="${total}" data-page-size="${pageSize}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table><div class="dt-none" hidden>${t('No row matches these filters.', 'Keine Zeile passt zu diesen Filtern.')}</div>${note ? `<div class="dt-more" hidden>${note}</div>` : ''}</div>
<div class="dt-foot"><label class="dt-size">${t('Rows per page', 'Zeilen pro Seite')} <select class="field small" data-size aria-label="${t('Rows per page', 'Zeilen pro Seite')}">${sizes}</select></label><span class="dt-range" data-range>${t(`1–${int(Math.min(pageSize, total))} of ${int(total)}`, `1–${int(Math.min(pageSize, total))} von ${int(total)}`)}</span>${iconbtn('back', t('Previous page', 'Vorherige Seite'), 'boxed dt-prev')}${iconbtn('chev', t('Next page', 'Nächste Seite'), 'boxed dt-next')}</div>`;
};
const filterBar = statuses => `<div class="dt-filters"><div class="fwrap find" data-i="search"><input class="field small" data-filter="text" aria-label="${t('Find in this table', 'In dieser Tabelle suchen')}" placeholder="${t('Find by number or title', 'Nach Nummer oder Titel suchen')}"></div><select class="field small" data-filter="status" aria-label="${t('Status', 'Status')}"><option value="">${t('All statuses', 'Alle Status')}</option>${statuses.map(s => `<option value="${s}">${s}</option>`).join('')}</select><select class="field small" data-filter="folder" aria-label="${t('Matter folder', 'Aktenordner')}"><option value="">${t('Matter folder: all', 'Aktenordner: alle')}</option><option value="yes">${t('With a matter folder', 'Mit Aktenordner')}</option><option value="no">${t('No matter folder', 'Ohne Aktenordner')}</option></select></div>`;

// The register statuses in the order of the EP procedure: the order of the status filter.
const STATUS_ORDER = ['The international publication has been made', 'The application has been published', 'Request for examination was made', 'Examination is in progress', 'Grant of patent is intended', 'The patent has been granted', 'No opposition filed within time limit', 'Opposition filed', 'The application is deemed to be withdrawn', 'The application has been withdrawn', 'The application has been refused'];
const APP_COLS = (fileNos = false) => [
  { key: 'app', label: t('Application', 'Anmeldung'), cls: 'c-app' },
  ...(fileNos ? [{ key: 'file', label: t('File number', 'Aktenzeichen'), cls: 'c-file' }] : []),
  { key: 'pub', label: t('Publication', 'Veröffentlichung'), cls: 'c-pub w-md' },
  { key: 'title', label: t('Title', 'Titel'), cls: 'c-title' },
  { key: 'status', label: t('Status', 'Status'), cls: 'c-status' },
  { key: 'next', label: t('Next deadline', 'Nächste Frist'), cls: 'c-next w-md' },
  { key: 'event', label: t('Last register event', 'Letztes Registerereignis'), cls: 'c-event w-md' },
  ...(fileNos ? [] : [{ key: 'rep', label: t('Representative changed', 'Vertreter geändert'), cls: 'c-rep w-md' }]),
  { key: 'folder', label: t('Matter folder', 'Aktenordner'), cls: 'c-folder w-sm' },
];
/** A row of the application table; `worked` says whether the walkthrough's matter folder exists yet. */
const appRow = ([a, p, ti, , since, status, , ev, evDate], { fileNo = '', worked = false } = {}) => {
  const folder = worked && a === WORKED[0];
  return {
    href: `7-matter.html?state=${folder ? 'work' : a}`,
    values: { app: a, pub: p || '', title: ti.toLowerCase(), status, next: '', event: evDate || '', rep: since, folder: folder ? 'yes' : 'no', file: fileNo, text: `${a} ${app(a)} ${p} ${p ? pub(p) : ''} ${ti}`.toLowerCase() },
    attrs: a === WORKED[0] ? ' data-walk="row"' : '',
    cells: [
      `<span class="num">${app(a)}</span>`,
      ...(fileNo ? [`<span class="num">${fileNo}</span>`] : []),
      p ? `<span class="num">${pub(p)}</span>` : `<span class="muted">${t('Not yet as EP', 'Noch nicht als EP')}</span>`,
      `<span class="clamp">${ti}</span>`,
      nm(status),
      '<span class="muted">–</span>',
      ev ? `<span class="num">${date(evDate)}</span><br><span class="muted">${nm(ev)}</span>` : `<span class="muted">${t('No EP event read', 'Kein EP-Ereignis gelesen')}</span>`,
      ...(fileNo ? [] : [`<span class="num">${date(since)}</span>`]),
      folder ? `<span class="yes" data-i="folder">${t('Yes', 'Ja')}</span>` : '<span class="muted">–</span>',
    ],
  };
};
const statusesOf = rows => STATUS_ORDER.filter(st => rows.some(r => r[5] === st));
const appTable = (rows, { fileNos = null, total = rows.length, worked = false, note = '' } = {}) => table({
  cols: APP_COLS(Boolean(fileNos)), rows: rows.map(r => appRow(r, { fileNo: fileNos ? fileNos[r[0]] : '', worked })), sortKey: 'app', total, note,
  filters: filterBar(statusesOf(rows)),
});
const skeleton = () => `<div class="dt-wrap"><table class="dt"><thead><tr>${APP_COLS().map(c => `<th class="${c.cls}">${c.label}</th>`).join('')}</tr></thead><tbody>${['w60', 'w45', 'w70', 'w50', 'w65', 'w55'].map(w => `<tr>${APP_COLS().map((c, i) => `<td class="${c.cls}"><span class="skel ${i === 2 ? w : 'w70'}"></span></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const views = (atFirm, others, on = 'firm', state = '') => `<div class="viewbar"><a class="chip${on === 'firm' ? ' solid' : ''}" href="1-client-applications.html${state ? `?state=${state}` : ''}">${t('At your firm', 'In Ihrer Kanzlei')} <span class="num">${int(atFirm)}</span></a><a class="chip${on === 'others' ? ' solid' : ''}" href="1-client-applications.html?state=search">${t('At other firms', 'Bei anderen Kanzleien')} <span class="num">${capped(others)}</span></a></div>`;
/** The applications of the group at other firms: a live count and a search, never a list. */
const othersSearch = ({ count, atLeast = false, found = false }) => `<div class="hint-line" data-i="info"><span>${t(`${atLeast && count < 10000 ? `At least ${int(count)}` : capped(count)} EP applications of the group have another representative: a live count in the EP Register, ${ASOF_HM}. FlowLeap keeps no list of them. Find one by its number or title, for example to mark it as your firm’s.`, `${atLeast && count < 10000 ? `Mindestens ${int(count)}` : capped(count)} EP-Anmeldungen der Gruppe haben einen anderen Vertreter: eine aktuelle Zählung im EP-Register, ${ASOF_HM}. FlowLeap führt keine Liste davon. Suchen Sie eine nach Nummer oder Titel, zum Beispiel um sie als Akte Ihrer Kanzlei zu markieren.`)}${atLeast && count < 10000 ? t(' With more than 4 names, two count queries can count one application twice.', ' Bei mehr als 4 Namen können zwei Zählabfragen eine Anmeldung doppelt zählen.') : ''}</span></div>
<div class="fwrap" data-i="search"><input class="field" aria-label="${t('Find an application of the group', 'Anmeldung der Gruppe suchen')}" placeholder="${t('Application number, publication number or title', 'Anmeldenummer, Veröffentlichungsnummer oder Titel')}"${found ? ` value="${FOUND.query}"` : ''}></div>
${found ? `<div class="list found">${FOUND.rows.map(([a, ti, town]) => `<div class="row"><span class="k">${app(a)}</span><span class="t" title="${ti}">${ti}</span><span class="c">${t(`Representative in ${town}`, `Vertreter in ${town}`)}</span>${btn(t('This is ours', 'Das ist unsere'), { icon: 'check' })}</div>`).join('')}</div><p class="src-line t12">${t(`${FOUND.rows.length} of ${FOUND.total} matches, from the EP Register, ${ASOF_HM}. The list names the town of the representative, not the firm.`, `${FOUND.rows.length} von ${FOUND.total} Treffern, aus dem EP-Register, ${ASOF_HM}. Die Liste nennt den Ort des Vertreters, nicht die Kanzlei.`)}</p>` : ''}`;
const others = opts => `<div class="others">${section(t('At other firms', 'Bei anderen Kanzleien'), '', othersSearch(opts))}</div>`;

const INSTRUCTIONS = () => [
  ['mail', t('Ask the client before each validation outside DE, FR, GB and IT.', 'Vor jeder Validierung außerhalb von DE, FR, GB und IT beim Mandanten nachfragen.'), t('From a mail of the client, 14 Mar 2026', 'Aus einer Mail des Mandanten, 14. März 2026'), PERSON],
  ['mail', t('Send a copy of each EPO communication to the patent department in Waiblingen.', 'Eine Kopie jeder EPA-Mitteilung an die Patentabteilung in Waiblingen senden.'), t('From the instruction letter, 2 Feb 2026', 'Aus dem Auftragsschreiben, 2. Feb. 2026'), PERSON],
  ['pen', t('Send a cost estimate before each reply to an examination report over EUR 3,000.', 'Vor jeder Erwiderung auf einen Prüfungsbescheid über 3.000 EUR einen Kostenvoranschlag senden.'), t('Written by Dr. Anna Becker, 2 Oct 2026', 'Geschrieben von Dr. Anna Becker, 2. Okt. 2026'), PERSON],
];
const instructions = (filled, client = CLIENT) => `<div class="instr">${section(t('Instructions and wishes', 'Weisungen und Wünsche'), filled ? '3' : '', filled
  ? `<div>${INSTRUCTIONS().map(([icon, text, src, who]) => `<div class="ins" data-i="${icon}"><div><div>${text}</div><div class="d">${src}</div></div><span class="who">${t(`Confirmed by ${who}`, `Bestätigt von ${who}`)}</span></div>`).join('')}</div>`
  : `<div class="instr-empty" data-i="info"><span><span class="lead">${t('No instructions yet.', 'Noch keine Weisungen.')}</span> ${t(`Write down what ${client} wants, such as cost limits or who gets copies; FlowLeap also proposes instructions from the client’s mails for a person to confirm, and the agent reads them before each task.`, `Halten Sie fest, was ${client} wünscht, zum Beispiel Kostengrenzen oder wer Kopien bekommt; FlowLeap schlägt auch Weisungen aus den Mails des Mandanten zur Bestätigung vor, und der Agent liest sie vor jeder Aufgabe.`)}</span></div>`,
  `${filled ? exNote() : ''}${btn(t('Add an instruction', 'Weisung hinzufügen'), { icon: 'plus' })}`)}</div>`;

const clientHead = ({ name, names, added, conflictLine }) => `<div class="client-head"><h1 class="title">${name}</h1>
<div class="client-meta"><span class="role">${t('Client of your firm', 'Mandant Ihrer Kanzlei')}</span><span>${t(`Added by ${PERSON} on ${date(added)}`, `Hinzugefügt von ${PERSON} am ${date(added)}`)}</span><span>${conflictLine}</span></div>
<div class="names"><span>${names.length === 1 ? t('1 applicant name:', '1 Anmeldername:') : t(`${names.length} applicant names:`, `${names.length} Anmeldernamen:`)}</span>${names.slice(0, 3).map((n, i) => `<span class="nm">${nm(n)}${i < Math.min(names.length, 3) - 1 ? ',' : ''}</span>`).join('')}${names.length > 3 ? btn(t(`${names.length - 3} more`, `${names.length - 3} weitere`), { kind: 'ghost', icon: 'chevd' }) : ''}</div></div>`;

// ---------- 1. The client page: the Applications tab ----------
function applications() {
  const noConflict = t('No conflict found', 'Keine Kollision gefunden');
  const head = clientHead({ name: CLIENT, names: NAMES.map(n => n[0]), added: ASOF, conflictLine: t(`1 possible conflict, checked by ${PERSON}`, `1 mögliche Kollision, geprüft von ${PERSON}`) });
  const src = (hm = ASOF_HM) => `<p class="src-line t12">${t(`Rows: your firm’s EP docket, as of ${at(ASOF, DOCKET.hm)}. Status and last event: EP Register, read at ${hm}. Representative changed: the register’s last change of the representative entry. The next deadline shows when your firm’s deadline docket has it.`, `Zeilen: EP-Bestand Ihrer Kanzlei, Stand ${at(ASOF, DOCKET.hm)}. Status und letztes Ereignis: EP-Register, gelesen um ${hm}. Vertreter geändert: die letzte Änderung des Vertretereintrags im Register. Die nächste Frist erscheint, sobald der Fristenkalender Ihrer Kanzlei sie hat.`)}</p>`;
  const view = (inner, { instr = false, on = 'firm', state = '' } = {}) => `<div class="cp">${head}${instructions(instr)}${views(MATTERS.length, OTHERS, on, state)}${inner}</div>`;
  const error = `<div class="error-bar list-error">${notice('bad', 'warn', t('The EP Register did not answer.', 'Das EP-Register hat nicht geantwortet.'), t(`Status and last event are from the last read, ${at(ASOF, DOCKET.hm)}.`, `Status und letztes Ereignis sind vom letzten Lesen, ${at(ASOF, DOCKET.hm)}.`), retry())}</div>${src(DOCKET.hm)}${appTable(MATTERS)}`;
  const loading = `<p class="src-line t12">${t('Reading the status and the last event of each application in the EP Register.', 'Status und letztes Ereignis jeder Anmeldung werden im EP-Register gelesen.')}</p>${skeleton()}`;
  const search = `<div class="others">${othersSearch({ count: OTHERS, found: true })}</div>`;
  const fileNos = Object.fromEntries(MATTERS.map((r, i) => [r[0], `SY-${String(101 + i)}`]));
  const myepo = `<p class="src-line t12">${exNote()} ${t(`Later, with MyEPO linked: rows and file numbers from your firm’s MyEPO portfolio, as of ${at(ASOF, DOCKET.hm)}. Status and last event: EP Register, read at ${ASOF_HM}.`, `Später, mit verbundenem MyEPO: Zeilen und Aktenzeichen aus dem MyEPO-Portfolio Ihrer Kanzlei, Stand ${at(ASOF, DOCKET.hm)}. Status und letztes Ereignis: EP-Register, gelesen um ${ASOF_HM}.`)}</p>${appTable(MATTERS, { fileNos })}`;
  const E = EMPTY;
  const emptyHead = clientHead({ name: E.client, names: E.names, added: E.added, conflictLine: t(`1 possible conflict, checked by ${PERSON}`, `1 mögliche Kollision, geprüft von ${PERSON}`) });
  const empty = `<div class="cp">${emptyHead}${instructions(false, E.client)}${views(0, E.others)}<div class="empty inflow"><div class="empty-in"><div class="empty-art" data-i="folder"></div><h2>${t('No EP applications at your firm', 'Keine EP-Anmeldungen in Ihrer Kanzlei')}</h2><p>${t(`A row appears here when the EP Register names your firm on one of the ${E.others} EP applications of ${E.client}, or when you mark one as yours under At other firms.`, `Eine Zeile erscheint hier, sobald das EP-Register Ihre Kanzlei bei einer der ${E.others} EP-Anmeldungen von ${E.client} nennt oder Sie eine unter „Bei anderen Kanzleien“ als Ihre markieren.`)}</p>${btn(t('Find at other firms', 'Bei anderen Kanzleien suchen'), { icon: 'search' })}</div></div></div>`;
  const L = LARGE;
  const largeHead = clientHead({ name: L.client, names: L.names.map(n => n[0]), added: ASOF, conflictLine: noConflict });
  const largeSrc = `<p class="src-line t12">${exNote()} ${t(`Rows: your firm’s EP docket, as of ${at(ASOF, DOCKET.hm)}. The mockup has ${L.rows.length} example rows of the ${int(L.atFirm)}.`, `Zeilen: EP-Bestand Ihrer Kanzlei, Stand ${at(ASOF, DOCKET.hm)}. Das Mockup hat ${L.rows.length} Beispielzeilen der ${int(L.atFirm)}.`)}</p>`;
  const largeNote = `${exNote()} ${t(`The mockup has only ${L.rows.length} example rows; the built table pages through all ${int(L.atFirm)} from the docket.`, `Das Mockup hat nur ${L.rows.length} Beispielzeilen; die gebaute Tabelle blättert durch alle ${int(L.atFirm)} aus dem Bestand.`)}`;
  const large = `<div class="cp">${largeHead}${instructions(false, L.client)}${views(L.atFirm, L.others, 'firm', 'large')}${largeSrc}${appTable(L.rows, { total: L.atFirm, note: largeNote })}</div>`;
  const bar = (states, name, count, state = '') => `      <div class="cset" data-state="${states}">${topbar([name], clientActs(), { tabs: tabs('apps', count, state) })}</div>`;
  const body = `${bar('default instructions search myepo loading error', CLIENT, MATTERS.length)}
${bar('work', CLIENT, MATTERS.length, 'work')}
${bar('empty', E.client, 0)}
${bar('large', L.client, L.atFirm)}
      <div class="cset" data-state="default">${view(`${src()}${appTable(MATTERS)}`)}</div>
      <div class="cset" data-state="work">${view(`${src()}${appTable(MATTERS, { worked: true })}`, { state: 'work' })}</div>
      <div class="cset" data-state="instructions">${view(`${src()}${appTable(MATTERS)}`, { instr: true })}</div>
      <div class="cset" data-state="search">${view(search, { on: 'others' })}</div>
      <div class="cset" data-state="myepo">${view(myepo)}</div>
      <div class="cset" data-state="loading">${view(loading)}</div>
      <div class="cset" data-state="error">${view(error)}</div>
      <div class="cset" data-state="empty">${empty}</div>
      <div class="cset" data-state="large">${large}</div>`;
  return page({ title: t(`Client: ${CLIENT}`, `Mandant: ${CLIENT}`), body: frame({ ws: CLIENT, body }) });
}

// ---------- 0. The Clients list ----------
function clients() {
  const COLS = [
    { key: 'name', label: t('Client', 'Mandant'), cls: 'c-name' },
    { key: 'role', label: t('Role', 'Rolle'), cls: 'c-role w-sm' },
    { key: 'names', label: t('Applicant names', 'Anmeldernamen'), cls: 'c-names w-md' },
    { key: 'apps', label: t('EP applications at your firm', 'EP-Anmeldungen in Ihrer Kanzlei'), cls: 'c-num' },
    { key: 'folders', label: t('Matter folders', 'Aktenordner'), cls: 'c-num w-sm' },
    { key: 'added', label: t('Added', 'Hinzugefügt'), cls: 'c-added w-md' },
  ];
  const row = ([name, names, apps, folders, added, by], { href = '', walk = '' } = {}) => ({
    href,
    values: { name: name.toLowerCase(), role: 'client', names: names.length, apps, folders, added, text: `${name} ${names.join(' ')}`.toLowerCase() },
    attrs: walk ? ` data-walk="${walk}"` : '',
    cells: [`<span class="strong">${name}</span>`, t('Client', 'Mandant'), `<span class="muted">${names.map(nm).join(', ')}</span>`, `<span class="num">${int(apps)}</span>`, `<span class="num">${int(folders)}</span>`, `<span class="num">${date(added)}</span><br><span class="muted">${t(`by ${by}`, `von ${by}`)}</span>`],
  });
  const before = CLIENTS.map(c => row(c, { href: c[0] === EMPTY.client ? '1-client-applications.html?state=empty' : '' }));
  const after = [row([CLIENT, NAMES.map(n => n[0]), MATTERS.length, 1, ASOF, PERSON], { href: '1-client-applications.html?state=work', walk: 'syntegon' }), ...before];
  const list = rows => `<div class="cp"><div class="client-head"><h1 class="title">${t('Clients', 'Mandanten')}</h1><p class="lede">${t('The clients of your firm, each with its applicant names and its EP applications from your firm’s EP docket.', 'Die Mandanten Ihrer Kanzlei, jeweils mit ihren Anmeldernamen und ihren EP-Anmeldungen aus dem EP-Bestand Ihrer Kanzlei.')}</p></div>
<div class="cl-table">${table({ cols: COLS, rows, sortKey: 'name', filters: `<div class="dt-filters"><div class="fwrap find" data-i="search"><input class="field small" data-filter="text" aria-label="${t('Find a client', 'Mandant suchen')}" placeholder="${t('Find a client', 'Mandant suchen')}"></div></div>` })}</div>
<p class="src-line t12">${t(`EP applications at your firm: your firm’s EP docket, as of ${at(ASOF, DOCKET.hm)}.`, `EP-Anmeldungen in Ihrer Kanzlei: EP-Bestand Ihrer Kanzlei, Stand ${at(ASOF, DOCKET.hm)}.`)}</p></div>`;
  const acts = btn(addClient(), { kind: 'primary', icon: 'plus', attrs: ' data-walk="add" data-href="3-find.html?state=empty"' });
  const body = `${topbar([], acts)}
      <div class="cset" data-state="default">${list(before)}</div>
      <div class="cset" data-state="after">${list(after)}</div>`;
  return page({ title: t('Clients', 'Mandanten'), body: frame({ body }) });
}

// ---------- 7. An application of the client: the matter page, or its empty state ----------
function matter() {
  const REG = t('EP Register', 'EP-Register');
  const FR = 'Firm Record';
  const story = rows => `<ol class="story">${rows.map(([d, text, src, firm]) => `<li class="${firm ? 'firm' : ''}"><span class="dot" aria-hidden="true"></span><div><div>${text}</div><div class="d"><span class="num">${date(d)}</span> · ${src}</div></div></li>`).join('')}</ol>`;
  /** One application: `client` is Syntegon or the Siemens example; `worked` shows its matter folder after the first file. */
  const view = (m, { client = CLIENT, applicant = 'Syntegon Technology GmbH', worked = false, example = false, back = '1-client-applications.html' } = {}) => {
    const [a, p, ti, filed, since, status, , ev, evDate] = m;
    const register = EVENTS[a] ? EVENTS[a] : ev && !ev.startsWith('Change') ? [[evDate, ev]] : [];
    const rows = [
      ...(worked ? [[ASOF, t(`${PERSON} dropped the client’s instruction letter; FlowLeap made the matter folder`, `${PERSON} hat das Auftragsschreiben des Mandanten abgelegt; FlowLeap hat den Aktenordner angelegt`), FR, true]] : []),
      [ASOF, t(`${PERSON} added ${client} as a client with this application`, `${PERSON} hat ${client} mit dieser Anmeldung als Mandanten hinzugefügt`), FR, true],
      ...register.map(([d, e]) => [d, nm(e), REG, false]),
      [since, t('Representative entry changed: your firm', 'Vertretereintrag geändert: Ihre Kanzlei'), REG, false],
      [filed, t('Application filed', 'Anmeldung eingereicht'), REG, false],
    ].sort((x, y) => y[0].localeCompare(x[0]));
    const files = worked
      ? `<div class="list mfiles">${TEMPLATE.map(f => `<div class="row"><span class="lead"><span class="fi" data-i="${f === 'Client' ? 'folderopen' : 'folder'}"></span></span><span class="t">${nm(f)}</span><span class="c">${f === 'Client' ? t('1 file', '1 Datei') : t('Empty', 'Leer')}</span></div>${f === 'Client' ? `<div class="row sub"><span class="lead"><span class="fi" data-i="pdf"></span></span><span class="t">${nm('Instruction letter.pdf')}</span><span class="c">${exNote()}</span></div>` : ''}`).join('')}</div>`
      : `<div class="empty inflow"><div class="empty-in"><div class="empty-art" data-i="upload"></div><h2>${t('No matter folder yet', 'Noch kein Aktenordner')}</h2><p>${t('Drop a file here, or forward a mail or a letter on this application: FlowLeap makes the matter folder at the first file.', 'Legen Sie hier eine Datei ab oder leiten Sie eine Mail oder ein Schreiben zu dieser Anmeldung weiter: FlowLeap legt den Aktenordner bei der ersten Datei an.')}</p>${btn(t('Upload files', 'Dateien hochladen'), { icon: 'upload', attrs: a === WORKED[0] ? ' data-walk="upload" data-href="7-matter.html?state=work"' : '' })}</div></div>`;
    const chat = `<div class="chat-ph"><div class="section-h"><h2>${t('Chat about this matter', 'Chat zu dieser Akte')}</h2><span class="right"><span class="ex-note">${t('Placeholder', 'Platzhalter')}</span></span></div><p class="d">${t('The agent answers from the matter’s files and the live EP Register, with sources. The matter page with its chat is a later build step; this box only shows where the chat goes.', 'Der Agent antwortet aus den Dateien der Akte und dem aktuellen EP-Register, mit Quellen. Die Aktenseite mit ihrem Chat kommt in einem späteren Schritt; dieses Feld zeigt nur, wo der Chat sitzt.')}</p><div class="fwrap" data-i="ask"><input class="field" aria-label="${t('Ask about this matter', 'Zu dieser Akte fragen')}" placeholder="${t('Ask about this matter', 'Zu dieser Akte fragen')}"></div></div>`;
    const backLink = `<a class="iconbtn only-sm" data-i="back" href="${back}" aria-label="${t(`Back to ${client}`, `Zurück zu ${client}`)}"></a>`;
    return `${topbar([`<a class="lvl hide-sm" data-walk="client" href="${back}">${client}</a>`, app(a)], `${backLink}${moreActs()}${btn(t('Ask about this', 'Hierzu fragen'), { kind: 'primary', icon: 'ask' })}`)}
      <div class="cp"><div class="client-head"><h1 class="title"><span class="num">${app(a)}</span> ${ti}</h1>
<div class="client-meta"><span class="role">${nm(status)}</span><span>${p ? pub(p) : t('No EP publication yet', 'Noch keine EP-Veröffentlichung')}</span><span>${nm(applicant)}</span><span>${t(`Representative changed ${date(since)}`, `Vertreter geändert ${date(since)}`)}</span></div>
<p class="src-line t12">${example ? `${exNote()} ` : ''}${t(`Status and events: EP Register, read at ${ASOF_HM}. Firm events: Firm Record.`, `Status und Ereignisse: EP-Register, gelesen um ${ASOF_HM}. Ereignisse der Kanzlei: Firm Record.`)}</p></div>
<div class="mp"><div class="mp-story">${section(t('Story', 'Verlauf'), '', story(rows))}</div><div class="mp-side">${section(t('Files', 'Dateien'), worked ? t('1 matter folder', '1 Aktenordner') : '', files)}${chat}</div></div></div>`;
  };
  const body = [
    `      <div class="cset" data-state="default work">${view(WORKED, { worked: true, back: '1-client-applications.html?state=work' })}</div>`,
    ...MATTERS.map(m => `      <div class="cset" data-state="${m[0]}">${view(m)}</div>`),
    ...LARGE.rows.map(m => `      <div class="cset" data-state="${m[0]}">${view(m, { client: LARGE.client, applicant: 'Siemens Aktiengesellschaft', example: true, back: '1-client-applications.html?state=large' })}</div>`),
  ].join('\n');
  return page({ title: t('Application', 'Anmeldung'), body: frame({ ws: CLIENT, body }) });
}

// ---------- 2. The client page: the Files tab ----------
function files() {
  const famName = WORKED[10];
  const node = ([d, kind, name, open = false, sel = false]) => `<div class="row node d${d}${sel ? ' is-selected' : ''}" title="${name}" data-verbatim>${d ? '<span></span>' : ''}<span class="tw" data-i="${kind === 'folder' ? (open ? 'chevd' : 'chev') : ''}"></span><span class="fi" data-i="${kind === 'folder' ? (open ? 'folderopen' : 'folder') : 'md'}"></span><span class="t">${nm(name)}</span></div>`;
  const tree = worked => {
    const r = [[0, 'folder', CLIENT, true, true], [1, 'folder', '00 Client']];
    if (worked) {
      r.push([1, 'folder', famName, true], [2, 'folder', app(WORKED[0]), true]);
      for (const s of TEMPLATE) r.push([3, 'folder', s]);
    }
    r.push([1, 'md', 'About this folder.md']);
    return `<nav class="tree list" aria-label="${t('Folders', 'Ordner')}">${r.map(node).join('')}</nav>`;
  };
  const row = (icon, name, kind, size, when, src) => `<div class="row"><span class="lead"><span class="fi" data-i="${icon}"></span></span><span class="t">${nm(name)}</span><span class="c">${kind}</span><span class="c">${size}</span><span class="c sm">${when}</span><span class="c">${src}</span></div>`;
  const thead = `<div class="thead"><span></span><span>${t('Name', 'Name')}</span><span>${t('Kind', 'Art')}</span><span>${t('Size', 'Größe')}</span><span>${t('Modified', 'Geändert')}</span><span>${t('Source', 'Quelle')}</span></div>`;
  const today = t('Today, 14:03', 'Heute, 14:03');
  const list = worked => {
    const folders = [row('folder', '00 Client', t('Folder', 'Ordner'), t('Empty', 'Leer'), today, addClient())];
    if (worked) folders.push(row('folder', famName, t('Family', 'Familie'), t('1 matter', '1 Akte'), t('Today, 15:20', 'Heute, 15:20'), PERSON));
    return `<div class="list files">${thead}<div class="group">${t('Folders', 'Ordner')} <span class="count num">${folders.length}</span></div>${folders.join('')}<div class="group">${t('Files', 'Dateien')} <span class="count num">1</span></div>${row('md', 'About this folder.md', 'Markdown', '1 KB', today, addClient())}</div>`;
  };
  const hint = worked => `<div class="hint-line t12" data-i="info"><span>${worked
    ? t(`The folder of ${app(WORKED[0])} appeared when ${PERSON} dropped the first file on it. The other ${MATTERS.length - 1} applications have no folder: no work on them has started.`, `Der Ordner von ${app(WORKED[0])} entstand, als ${PERSON} die erste Datei darauf abgelegt hat. Die anderen ${MATTERS.length - 1} Anmeldungen haben keinen Ordner: Die Arbeit daran hat nicht begonnen.`)
    : t(`A matter folder appears here when work on a matter starts: a person opens the matter, a letter or a mail arrives, a person drops a file, or an agent task runs on it. The ${MATTERS.length} applications are on the Applications tab.`, `Ein Aktenordner erscheint hier, sobald die Arbeit an einer Akte beginnt: Eine Person öffnet die Akte, ein Schreiben oder eine Mail kommt an, eine Person legt eine Datei ab, oder eine Agentenaufgabe läuft darauf. Die ${MATTERS.length} Anmeldungen sind auf dem Reiter „Anmeldungen“.`)}</span></div>`;
  const fv = worked => `<div class="fv"><div class="fv-head"><h1 class="title">${CLIENT}</h1><p class="lede">${worked ? t('Client folder · 1 matter folder · added today', 'Mandantenordner · 1 Aktenordner · heute hinzugefügt') : t('Client folder · no matter folder yet · added today', 'Mandantenordner · noch kein Aktenordner · heute hinzugefügt')}</p>${hint(worked)}</div>${list(worked)}</div>`;
  const acts = `${iconbtn('search', t('Find in this folder', 'In diesem Ordner suchen'), 'hide-md')}${btn(t('New folder', 'Neuer Ordner'), { icon: 'newfolder', cls: 'hide-md' })}${btn(t('Upload files', 'Dateien hochladen'), { icon: 'upload', cls: 'hide-md' })}${moreActs()}${btn(t('Ask about this', 'Hierzu fragen'), { kind: 'primary', icon: 'ask' })}`;
  const body = `      <div class="cset" data-state="default">${topbar([CLIENT], acts, { tabs: tabs('files', MATTERS.length) })}</div>
      <div class="cset" data-state="work">${topbar([CLIENT], acts, { tabs: tabs('files', MATTERS.length, 'work') })}</div>
      <div class="cset" data-state="default"><div class="fp">${tree(false)}<div class="mid">${fv(false)}</div></div></div>
      <div class="cset" data-state="work"><div class="fp">${tree(true)}<div class="mid">${fv(true)}</div></div></div>`;
  return page({ title: t(`Client files: ${CLIENT}`, `Mandantendateien: ${CLIENT}`), body: frame({ ws: CLIENT, body }) });
}

// ---------- 3. Add client step 1: the two counts of each name and the docket state ----------
function find() {
  const intro = `${steps(1)}<h1 class="title">${addClient()}</h1><p class="lede">${t('Type the company. FlowLeap finds its applicant names in the EP Register, and your firm’s EP matters for them in your firm’s EP docket.', 'Geben Sie das Unternehmen ein. FlowLeap findet seine Anmeldernamen im EP-Register und die EP-Akten Ihrer Kanzlei dazu im EP-Bestand Ihrer Kanzlei.')}</p>`;
  const field = name => `<div class="fwrap" data-i="search"><input class="field" data-walk="field" aria-label="${t('Company name', 'Firmenname')}" placeholder="${t('Company name, for example Syntegon', 'Firmenname, zum Beispiel Syntegon')}" value="${name}"></div>
<div class="privacy t12" data-i="lock"><span>${t('FlowLeap sends only this name to the patent data plugin. Nothing from your firm’s files leaves the firm.', 'FlowLeap sendet nur diesen Namen an das Patentdaten-Plugin. Nichts aus den Akten Ihrer Kanzlei verlässt die Kanzlei.')}</span></div>`;
  const thead = `<div class="thead"><span></span><span>${t('Applicant name in the EP Register', 'Anmeldername im EP-Register')}</span><span class="end">${t('At your firm', 'In Ihrer Kanzlei')}</span><span class="end wide">${t('Matching EP applications', 'Passende EP-Anmeldungen')}</span></div>`;
  const firmCell = (n, mode) => ({ ready: int(n), large: int(n), partial: n ? t(`at least ${int(n)}`, `mind. ${int(n)}`) : t('none found', 'keine gefunden'), failed: t('Not known', 'Unbekannt'), none: t('Not known', 'Unbekannt') })[mode];
  const rows = (names, mode) => names.map(([n, total, firm]) => `<div class="row"><span class="check on" data-i="check"></span><span class="t">${nm(n)}</span>${mode === 'reading' ? '<span class="skel w50 end"></span>' : `<span class="c end"><span class="only-sm">${t('At your firm', 'In Ihrer Kanzlei')} </span>${firmCell(firm, mode)}</span>`}<span class="c end wide">${capped(total)}</span></div>`).join('');
  const src = (cap, docket) => `<p class="src-line t12">${t(`At your firm: your firm’s EP docket. Matching EP applications: a count in the EP Register of every application whose applicant contains the words of the name${cap ? ', “10,000+” where the EP Register stops counting' : ''}. An application with two of these names counts for each, so the counts do not add up to a group total. FlowLeap found these names in ${docket ? 'your docket and in ' : ''}a register sample of ${int(500)} rows; the sample can miss a name.`, `In Ihrer Kanzlei: der EP-Bestand Ihrer Kanzlei. Passende EP-Anmeldungen: eine Zählung im EP-Register aller Anmeldungen, deren Anmelder die Wörter des Namens enthält${cap ? ', „10.000+“, wo das EP-Register nicht weiter zählt' : ''}. Eine Anmeldung mit zwei dieser Namen zählt für jeden, darum ergeben die Zahlen keine Gruppensumme. FlowLeap hat diese Namen in ${docket ? 'Ihrem Bestand und in ' : ''}einer Registerstichprobe von ${int(500)} Zeilen gefunden; die Stichprobe kann einen Namen übersehen.`)}</p>`;
  const group = (names, mode, cap = false) => section(t('The client group that FlowLeap proposes', 'Die Mandantengruppe, die FlowLeap vorschlägt'), t(`${names.length} of ${names.length} names`, `${names.length} von ${names.length} Namen`),
    `<div class="hint-line" data-i="info"><span>${t('FlowLeap groups these names because they match the company. It is a proposal, not a legal fact: untick a name that is not part of the client.', 'FlowLeap gruppiert diese Namen, weil sie zum Unternehmen passen. Das ist ein Vorschlag, keine rechtliche Tatsache: Entfernen Sie den Haken bei einem Namen, der nicht zum Mandanten gehört.')}</span></div><div class="list cos2">${thead}${rows(names, mode)}</div>${src(cap, ['ready', 'large', 'partial'].includes(mode))}`);
  const docket = { large: `${docketReady(LARGE.docket)}<p class="src-line t12">${exNote()} ${t('Your firm has no Siemens matter. The count At your firm and the docket size show a large firm; the names and the matching counts are real.', 'Ihre Kanzlei hat keine Siemens-Akte. Die Zahl „In Ihrer Kanzlei“ und die Bestandsgröße zeigen eine große Kanzlei; die Namen und die passenden Zahlen sind echt.')}</p>`, ready: docketReady(), reading: docketReading(), partial: docketPartial(), failed: `<div class="error-bar">${docketFailed()}</div>`, none: docketNone() };
  const waits = `<div class="hint-line" data-i="info"><span>${t('Continue waits until FlowLeap has read your firm’s EP docket, because the next step shows your firm’s matters.', '„Weiter“ wartet, bis FlowLeap den EP-Bestand Ihrer Kanzlei gelesen hat, weil der nächste Schritt die Akten Ihrer Kanzlei zeigt.')}</span></div>`;
  const view = (state, mode, name, names, cap) => `<div data-state="${state}">${field(name)}<div class="docket">${docket[mode]}${['reading', 'failed'].includes(mode) ? waits : ''}</div>${group(names, mode, cap)}</div>`;
  const cont = dis => btn(t('Continue', 'Weiter'), { kind: 'primary', attrs: dis ? off : ' data-walk="continue" data-href="4-review.html"' });
  const body = `${topbar([addClient()], `<span class="cset" data-state="default partial none large">${cont(false)}</span><span class="cset" data-state="reading failed empty">${cont(true)}</span>`)}
${work(`${intro}
<div data-state="empty">${field('')}<div class="docket">${docket.ready}</div><div class="empty inflow"><div class="empty-in"><div class="empty-art" data-i="building"></div><h2>${t('Start with the company’s name', 'Beginnen Sie mit dem Namen des Unternehmens')}</h2><p>${t('FlowLeap shows its applicant names with your firm’s matters; you confirm the group, choose the role and check the conflicts before anything is recorded.', 'FlowLeap zeigt seine Anmeldernamen mit den Akten Ihrer Kanzlei; Sie bestätigen die Gruppe, wählen die Rolle und prüfen die Kollisionen, bevor etwas erfasst wird.')}</p></div></div></div>
${view('default', 'ready', CLIENT, NAMES)}
${view('reading', 'reading', CLIENT, NAMES)}
${view('partial', 'partial', CLIENT, NAMES)}
${view('failed', 'failed', CLIENT, NAMES)}
${view('none', 'none', CLIENT, NAMES)}
${view('large', 'large', LARGE.query, LARGE.names, true)}`)}`;
  return page({ title: t('Add client: find the company', 'Mandant hinzufügen: Unternehmen finden'), body: frame({ body }) });
}

// ---------- 4. Add client review: the role, the firm's matters from the docket, the conflict check, the other firms ----------
const ROLES = name => [
  ['client', 'building', t('Client', 'Mandant'), t(`Your firm represents ${name}, also with no EP matter yet. FlowLeap records the client and its EP applications at your firm.`, `Ihre Kanzlei vertritt ${name}, auch noch ohne EP-Akte. FlowLeap erfasst den Mandanten und seine EP-Anmeldungen in Ihrer Kanzlei.`)],
  ['watch', 'eye', t('Watch', 'Beobachten'), t(`A competitor to follow. FlowLeap puts ${name} on the Watch list; it adds no client and runs no conflict check.`, `Ein Wettbewerber, den Sie verfolgen. FlowLeap setzt ${name} auf die Beobachtungsliste; es fügt keinen Mandanten hinzu und prüft keine Kollision.`)],
  ['other', 'party', t('Other party', 'Andere Partei'), t('A party in one of your matters, such as an opponent or a licensee. You choose the matter next.', 'Eine Partei in einer Ihrer Akten, zum Beispiel ein Einsprechender oder ein Lizenznehmer. Die Akte wählen Sie danach.')],
];
const roleSection = name => section(t('Role', 'Rolle'), '', `<div class="opts role-opts" role="radiogroup" aria-label="${t('Role', 'Rolle')}">${ROLES(name).map(([k, icon, h, d]) => `<div class="opt${k === 'client' ? ' on' : ''}" role="radio" aria-checked="${k === 'client'}"><span class="radio${k === 'client' ? ' on' : ''}"></span><span data-i="${icon}"></span><div><div class="h">${h}</div><div class="d">${d}</div></div></div>`).join('')}</div>
<p class="src-line t12">${t(`The role is your firm’s decision. FlowLeap records it with your name, ${PERSON}.`, `Die Rolle ist die Entscheidung Ihrer Kanzlei. FlowLeap erfasst sie mit Ihrem Namen, ${PERSON}.`)}</p>`);
function review() {
  const mthead = `<div class="thead"><span></span><span>${t('Application', 'Anmeldung')}</span><span>${t('Title', 'Titel')}</span><span>${t('Publication', 'Veröffentlichung')}</span><span>${t('Representative changed', 'Vertreter geändert')}</span></div>`;
  const mrow = ([a, p, ti, , since], off = false) => `<div class="row${off ? ' off' : ''}"><span class="check${off ? '' : ' on'}" data-i="${off ? '' : 'check'}"></span><span class="k">${app(a)}</span><span class="t" title="${ti}">${ti}</span><span class="c">${p ? pub(p) : t('Not yet as EP', 'Noch nicht als EP')}</span><span class="c">${date(since)}</span></div>`;
  const ADDR = MATTERS[MATTERS.length - 1];
  const mine = (rows, total, { address = false, more = 0, example = false } = {}) => {
    const firm = address ? rows.filter(r => r !== ADDR) : rows;
    const groups = `<div class="group">${t('At your firm', 'In Ihrer Kanzlei')} <span class="count num">${int(total - (address ? 1 : 0))}</span></div>${firm.map(r => mrow(r)).join('')}${more ? `<div class="row more-row"><span>${t(`Show 100 more of ${int(more)}`, `100 weitere von ${int(more)} zeigen`)}</span></div>` : ''}${address ? `<div class="group">${t('Matched by address only', 'Nur über die Adresse gefunden')} <span class="count num">1</span><span class="why-addr">${t('Another firm can have the same address, so the row is not ticked. Tick it if it is yours.', 'Eine andere Kanzlei kann dieselbe Adresse haben, darum ist die Zeile nicht angehakt. Haken Sie sie an, wenn sie Ihre ist.')}</span></div>${mrow(ADDR, true)}` : ''}`;
    return section(t('These are your matters', 'Das sind Ihre Akten'), int(total - (address ? 1 : 0)), `<p class="src-line t12">${example ? `${exNote()} ` : ''}${t(`From your firm’s EP docket, as of ${at(ASOF, DOCKET.hm)}: the applications where the EP Register names your firm as the representative.`, `Aus dem EP-Bestand Ihrer Kanzlei, Stand ${at(ASOF, DOCKET.hm)}: die Anmeldungen, bei denen das EP-Register Ihre Kanzlei als Vertreter nennt.`)}${address ? ` ${exNote()}` : ''}</p><div class="list mats2">${mthead}${groups}</div>`);
  };
  const searched = n => t(`FlowLeap searched the ${n} names in your Firm Record and as opponent or patent owner in EP oppositions. Opposition index as of ${at(ASOF, DOCKET.hm)}.`, `FlowLeap hat die ${n} Namen in Ihrem Firm Record und als Einsprechenden oder Patentinhaber in EP-Einsprüchen gesucht. Einspruchsindex Stand ${at(ASOF, DOCKET.hm)}.`);
  const noConflict = n => section(t('Conflict check', 'Kollisionsprüfung'), t('No conflict', 'Keine Kollision'), `<div class="ok-line" data-i="check"><div><div>${t('No conflict found.', 'Keine Kollision gefunden.')}</div><div class="d">${t(`None of the ${n} names is the other side in a matter of your clients.`, `Keiner der ${n} Namen ist Gegenseite in einer Akte Ihrer Mandanten.`)} ${searched(n)}</div></div></div>`);
  // The one possible conflict of Syntegon, from the EP Register (get_register_biblio EP3296081B1, 2026-11-09).
  const facts = `<div class="facts-tbl">
<div class="k">${t('Patent', 'Patent')}</div><div><span class="num">EP 3 296 081 B1</span> · ${t('Method and device for producing tubular bags', 'Verfahren und Vorrichtung zum Herstellen von Schlauchbeuteln')}</div>
<div class="k">${t('Patent owner', 'Patentinhaber')}</div><div>Gerhard Schubert GmbH, ${t('your client Gerhard Schubert', 'Ihr Mandant Gerhard Schubert')}</div>
<div class="k">${t('Opponent', 'Einsprechender')}</div><div>Syntegon Packaging Systems AG, ${t('one of the 5 names', 'einer der 5 Namen')}</div>
<div class="k">${t('Opposition filed', 'Einspruch eingelegt')}</div><div class="num">${date('2025-01-08')}</div>
<div class="k">${t('Register status', 'Registerstatus')}</div><div>${t('Patent revoked', 'Patent widerrufen')}</div>
<div class="k">${t('Your firm', 'Ihre Kanzlei')}</div><div>${t('Not named in this opposition', 'In diesem Einspruch nicht genannt')}</div>
<div class="k">${t('Source', 'Quelle')}</div><div>${t(`EP Register, ${at(ASOF, ASOF_HM)}`, `EP-Register, ${at(ASOF, ASOF_HM)}`)}</div>
</div>`;
  const checkBox = done => `<div class="opts top"><div class="opt check-opt${done ? ' on' : ''}" role="checkbox" aria-checked="${done}"${done ? '' : ' data-walk="conflict" data-href="4-review.html?state=checked"'}><span class="check${done ? ' on' : ''}" data-i="${done ? 'check' : ''}"></span><div><div class="h">${t('I checked this conflict', 'Ich habe diese Kollision geprüft')}</div><div class="d">${t('Write why Syntegon can be a client of your firm. FlowLeap records the reason with your name.', 'Schreiben Sie, warum Syntegon Mandant Ihrer Kanzlei sein kann. FlowLeap erfasst die Begründung mit Ihrem Namen.')}</div></div></div></div>
<textarea class="reason-field${done ? ' on' : ''}" aria-label="${t('Reason', 'Begründung')}" placeholder="${t('Reason', 'Begründung')}">${done ? t('The opposition is closed and the patent is revoked. Our firm did not act for Gerhard Schubert in it.', 'Der Einspruch ist abgeschlossen und das Patent widerrufen. Unsere Kanzlei hat Gerhard Schubert darin nicht vertreten.') : ''}</textarea>`;
  const hit = done => section(t('Conflict check', 'Kollisionsprüfung'), done ? t('1 possible conflict · checked', '1 mögliche Kollision · geprüft') : t('1 possible conflict', '1 mögliche Kollision'), `${notice('warn', 'warn', t('Syntegon Packaging Systems AG is the other side of your client Gerhard Schubert in one EP opposition.', 'Die Syntegon Packaging Systems AG ist in einem EP-Einspruch die Gegenseite Ihres Mandanten Gerhard Schubert.'), done ? t('You checked the conflict.', 'Sie haben die Kollision geprüft.') : t('Check the conflict before you add the client.', 'Prüfen Sie die Kollision, bevor Sie den Mandanten hinzufügen.'))}${facts}<p class="src-line t12">${searched(NAMES.length)}</p>${checkBox(done)}`);
  const intro = (name, n, names, matching) => `${steps(2)}<h1 class="title">${name}</h1><div class="keyfact"><span class="big">${t(`${int(n)} EP applications at your firm`, `${int(n)} EP-Anmeldungen in Ihrer Kanzlei`)}</span></div><p class="lede">${t(`${names} applicant names · ${matching} matching EP applications in the EP Register, ${at(ASOF, ASOF_HM)}`, `${names} Anmeldernamen · ${matching} passende EP-Anmeldungen im EP-Register, ${at(ASOF, ASOF_HM)}`)}</p>`;
  const next = (name, n) => t(`FlowLeap then records ${name} as a client with ${int(n)} applications. It copies no files.`, `FlowLeap erfasst ${name} als Mandanten mit ${int(n)} Anmeldungen, ohne Dateien zu kopieren.`);
  const total = MATTERS.length;
  const L = LARGE;
  const syn = ({ done = true, address = false, found = false }) => {
    const n = total - (address ? 1 : 0);
    return work(`${intro(CLIENT, n, NAMES.length, int(OTHERS + total))}${roleSection(CLIENT)}${hit(done)}${mine(MATTERS, total, { address })}${others({ count: OTHERS, found })}`,
      formFoot({ note: done ? next(CLIENT, n) : t('Add client waits until you check the conflict and write the reason.', '„Mandant hinzufügen“ wartet, bis Sie die Kollision geprüft und die Begründung geschrieben haben.'), primary: addClient(), disabled: !done }));
  };
  const large = work(`${intro(L.client, L.atFirm, L.names.length, capped(L.matching))}${roleSection(L.client)}${noConflict(L.names.length)}${mine(L.rows, L.atFirm, { more: L.atFirm - L.rows.length, example: L.example })}${others({ count: L.others, atLeast: L.names.length > 4 })}`,
    formFoot({ note: next(L.client, L.atFirm), primary: addClient() }));
  const body = `      <div class="cset" data-state="default checked address search">${topbar([addClient(), CLIENT])}</div>
      <div class="cset" data-state="large">${topbar([addClient(), L.client])}</div>
      <div class="cset" data-state="default">${syn({ done: false })}</div>
      <div class="cset" data-state="checked">${syn({})}</div>
      <div class="cset" data-state="address">${syn({ address: true })}</div>
      <div class="cset" data-state="search">${syn({ found: true })}</div>
      <div class="cset" data-state="large">${large}</div>`;
  return page({ title: t(`Add client: ${CLIENT}`, `Mandant hinzufügen: ${CLIENT}`), body: frame({ body }) });
}

// ---------- 5. Add client Record: the records in batches, then the client page ----------
function record() {
  const li = (cls, icon, h, d, n = '') => `<li class="${cls}"><span data-i="${icon}"></span><div><div class="h">${h}</div>${d ? `<div class="d">${d}</div>` : ''}</div><span class="n">${n}</span></li>`;
  const batches = n => Math.ceil(n / 100);
  const list = (name, names, n, mode, conflict = t('No conflict found', 'Keine Kollision gefunden')) => {
    const b = batches(n), done = mode === 'done' ? b : mode === 'failed' ? 7 : b > 1 ? 7 : 0;
    const step = b === 1 ? t(`1 batch of ${int(n)} applications`, `1 Paket mit ${int(n)} Anmeldungen`) : t(`Batch ${done + 1} of ${b}, 100 applications each`, `Paket ${done + 1} von ${b}, je 100 Anmeldungen`);
    const apps = mode === 'done'
      ? li('done', 'check', t(`Recorded the ${int(n)} applications of the client`, `Die ${int(n)} Anmeldungen des Mandanten erfasst`), t(`Firm Record, ${b === 1 ? '1 batch' : `${b} batches`}`, `Firm Record, ${b === 1 ? '1 Paket' : `${b} Pakete`}`), `${int(n)} / ${int(n)}`)
      : mode === 'failed'
        ? li('fail', 'warn', t(`Recorded ${int(done * 100)} of ${int(n)} applications`, `${int(done * 100)} von ${int(n)} Anmeldungen erfasst`), t(`Batch ${done + 1} of ${b} was not recorded: the Firm Record did not answer. Try again records only the ${b - done} missing batches; a batch that was recorded is never recorded twice.`, `Paket ${done + 1} von ${b} wurde nicht erfasst: Der Firm Record hat nicht geantwortet. „Erneut versuchen“ erfasst nur die ${b - done} fehlenden Pakete; ein erfasstes Paket wird nie doppelt erfasst.`), `${int(done * 100)} / ${int(n)}`)
        : li('now', 'spin', t(`Recording the ${int(n)} applications of the client`, `Die ${int(n)} Anmeldungen des Mandanten erfassen`), `${step}${b > 1 ? '<div class="bar p62"><span></span></div>' : ''}`, `${int(done * 100)} / ${int(n)}`);
    return `<ol class="bsteps">
${li('done', 'check', t(`Recorded ${name} as a client, with its ${names} applicant names`, `${name} als Mandant erfasst, mit seinen ${names} Anmeldernamen`), t(`Firm Record, by ${PERSON}`, `Firm Record, durch ${PERSON}`))}
${li('done', 'check', t('Recorded the conflict check', 'Kollisionsprüfung erfasst'), conflict)}
${apps}
${li(mode === 'done' ? 'done' : 'next', mode === 'done' ? 'check' : 'ring', mode === 'done' ? t('Made the client folder', 'Mandantenordner angelegt') : t('Make the client folder', 'Mandantenordner anlegen'), t('Only 00 Client and “About this folder”. A matter folder appears when work on the matter starts.', 'Nur 00 Client und „About this folder“. Ein Aktenordner entsteht, sobald die Arbeit an der Akte beginnt.'))}
</ol>`;
  };
  const keep = `<div class="flow-notice">${notice('', 'info', t('Keep this page open until the records are written.', 'Lassen Sie diese Seite offen, bis die Einträge geschrieben sind.'), t('Each record is your act, so this page sends it. It takes a few seconds for any client size.', 'Jeder Eintrag ist Ihre Handlung, darum sendet ihn diese Seite. Das dauert für jede Mandantengröße nur Sekunden.'))}</div>`;
  const intro = (name, mode) => `${steps(3)}<h1 class="title">${mode === 'done' ? t(`${name} is recorded`, `${name} ist erfasst`) : t(`Recording ${name}`, `${name} wird erfasst`)}</h1><p class="lede">${mode === 'done' ? t('The client page shows its applications with their status. FlowLeap copied no files.', 'Die Mandantenseite zeigt seine Anmeldungen mit ihrem Status. FlowLeap hat keine Dateien kopiert.') : t('FlowLeap writes the client record and the application index in batches. It copies no public data: the client page reads it live.', 'FlowLeap schreibt den Mandanteneintrag und den Anmeldungsindex in Paketen. Es kopiert keine öffentlichen Daten: Die Mandantenseite liest sie live.')}</p>`;
  const openBtn = dis => btn(t('Open client page', 'Mandantenseite öffnen'), { kind: 'primary', icon: 'clients', attrs: dis ? off : ' data-walk="open" data-href="1-client-applications.html"' });
  const L = LARGE;
  const body = `${topbar([addClient(), `<span class="cset" data-state="default done">${CLIENT}</span><span class="cset" data-state="large failed">${L.client}</span>`], `<span class="cset" data-state="default large">${openBtn(true)}</span><span class="cset" data-state="done failed">${openBtn(false)}</span>`)}
${work(`<div data-state="default">${intro(CLIENT, 'now')}${keep}${list(CLIENT, NAMES.length, MATTERS.length, 'now', t(`1 possible conflict, checked by ${PERSON}, with the reason`, `1 mögliche Kollision, geprüft von ${PERSON}, mit der Begründung`))}</div>
<div data-state="large">${intro(L.client, 'now')}${keep}${list(L.client, L.names.length, L.atFirm, 'now')}</div>
<div data-state="failed">${intro(L.client, 'failed')}<div class="section"><div class="error-bar">${notice('bad', 'warn', t(`${int(L.atFirm - 700)} applications are not recorded yet.`, `${int(L.atFirm - 700)} Anmeldungen sind noch nicht erfasst.`), t(`The client and ${int(700)} applications are recorded; the client page shows them now.`, `Der Mandant und ${int(700)} Anmeldungen sind erfasst; die Mandantenseite zeigt sie schon.`), retry())}</div></div>${list(L.client, L.names.length, L.atFirm, 'failed')}</div>
<div data-state="done">${intro(CLIENT, 'done')}${list(CLIENT, NAMES.length, MATTERS.length, 'done', t(`1 possible conflict, checked by ${PERSON}, with the reason`, `1 mögliche Kollision, geprüft von ${PERSON}, mit der Begründung`))}</div>`)}`;
  return page({ title: t('Add client: record', 'Mandant hinzufügen: erfassen'), body: frame({ body }) });
}

// ---------- 6. The firm identity setting with the docket ----------
function identity() {
  const entries = (vals, ph) => `<div class="entries">${(vals.length ? vals : ['']).map(v => `<div class="entry"><input class="field" aria-label="${ph}" placeholder="${ph}" value="${v}">${iconbtn('x', t('Remove', 'Entfernen'))}</div>`).join('')}</div>`;
  const fields = empty => `<div class="fieldset"><h2>${t('Firm names', 'Kanzleinamen')}</h2><div class="d">${t('The current name and each earlier name, as the EP Register writes them.', 'Der aktuelle Name und jeder frühere Name, so wie das EP-Register sie schreibt.')}</div>${entries(empty ? [] : ['Muster & Partner Patentanwälte mbB'], t('Firm name', 'Kanzleiname'))}${btn(t('Add a name', 'Namen hinzufügen'), { kind: 'ghost', icon: 'plus' })}</div>
<div class="fieldset"><h2>${t('Addresses', 'Adressen')}</h2><div class="d">${t('The current address and each earlier one. The EP Register often names a person and puts the firm in the address lines.', 'Die aktuelle Adresse und jede frühere. Das EP-Register nennt oft eine Person und schreibt die Kanzlei in die Adresszeilen.')}</div>${entries(empty ? [] : ['Musterstraße 1, 40211 Düsseldorf'], t('Street and number, postcode and town', 'Straße und Nummer, PLZ und Ort'))}${btn(t('Add an address', 'Adresse hinzufügen'), { kind: 'ghost', icon: 'plus' })}</div>
<div class="fieldset"><h2>${t('Representatives', 'Vertreter')}</h2><div class="d">${t('The professional representatives of your firm before the EPO, surname first.', 'Die zugelassenen Vertreter Ihrer Kanzlei vor dem EPA, Nachname zuerst.')}</div>${entries(empty ? [] : ['Becker, Anna', 'Weber, Jonas'], t('Surname, first name', 'Nachname, Vorname'))}${btn(t('Add a representative', 'Vertreter hinzufügen'), { kind: 'ghost', icon: 'plus' })}</div>`;
  const facts = () => `<div class="dk-facts">
<div class="k">${t('Queries', 'Abfragen')}</div><div>${t(`${DOCKET.queries}: one for each name, address and representative`, `${DOCKET.queries}: eine für jeden Namen, jede Adresse und jeden Vertreter`)}</div>
<div class="k">${t('Next read', 'Nächstes Lesen')}</div><div>${t(`${date(DOCKET.next)}, and at Check for new matters when the last read is from an earlier day`, `${date(DOCKET.next)}, und bei „Nach neuen Akten suchen“, wenn das letzte Lesen von einem früheren Tag ist`)}</div>
<div class="k">${t('Opposition index', 'Einspruchsindex')}</div><div>${t('The EP oppositions of your clients’ names, read with the docket', 'Die EP-Einsprüche zu den Namen Ihrer Mandanten, mit dem Bestand gelesen')}</div>
</div>`;
  const dk = state => `<div class="dk"><div class="section-h"><h2>${t('Your firm’s EP docket', 'EP-Bestand Ihrer Kanzlei')}</h2><span class="right">${state === 'default' ? btn(t('Read again', 'Erneut lesen'), { icon: 'retry' }) : ''}</span></div>
${{ default: `${docketReady()}${facts()}`, reading: docketReading(), partial: `${docketPartial()}${facts()}`, failed: docketFailed(), empty: `<div class="docket-line" data-i="info"><span>${t('FlowLeap reads your EP docket when you save your firm’s names or addresses. Until then, Add client cannot find your firm’s matters.', 'FlowLeap liest Ihren EP-Bestand, sobald Sie die Namen oder Adressen Ihrer Kanzlei speichern. Bis dahin findet „Mandant hinzufügen“ die Akten Ihrer Kanzlei nicht.')}</span></div>` }[state]}
</div>`;
  const intro = `<h1 class="title">${t('Firm identity', 'Kanzleidaten')}</h1><p class="lede">${t('FlowLeap finds your firm’s EP matters by these names, addresses and representatives. A change reads your EP docket again.', 'FlowLeap findet die EP-Akten Ihrer Kanzlei über diese Namen, Adressen und Vertreter. Eine Änderung liest Ihren EP-Bestand erneut.')}</p>`;
  const save = dis => btn(t('Save', 'Speichern'), { kind: 'primary', attrs: dis ? off : '' });
  const view = s => `<div data-state="${s}"><div class="settings">${intro}${privacyDocket()}${dk(s)}<div class="dk">${fields(s === 'empty')}</div></div></div>`;
  const body = `${topbar([t('Firm identity', 'Kanzleidaten')], save(true), { root: t('Settings', 'Einstellungen'), icon: 'gear' })}
${work(['default', 'reading', 'partial', 'failed', 'empty'].map(view).join('\n'))}`;
  return page({ title: t('Settings: firm identity', 'Einstellungen: Kanzleidaten'), body: frame({ side: 'settings', body }) });
}

const PAGES = [['0-clients', clients], ['1-client-applications', applications], ['2-client-files', files], ['3-find', find], ['4-review', review], ['5-record', record], ['6-firm-identity', identity], ['7-matter', matter]];
for (const l of ['en', 'de']) {
  lang = l;
  // A German page links to the German page of each mockup.
  const local = html => l === 'de' ? html.replace(/(href="\d-[a-z-]+)\.html/g, '$1.de.html') : html;
  for (const [name, fn] of PAGES) writeFileSync(path.join(OUT, `${name}${l === 'de' ? '.de' : ''}.html`), local(fn()));
}
console.log(`wrote ${PAGES.length * 2} pages`);
