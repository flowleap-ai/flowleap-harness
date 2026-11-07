// Writes the first-demo mockups, each page in English (<name>.html) and German (<name>.de.html), from this one source.
// Usage: node build.mjs. Edit this file, never the generated HTML. The persons, the matters and the demo times are in
// the data at the top; the status words come from the skill's status map, so a page cannot show a word the atlas lacks.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { STATUS } from '../../../../.agents/skills/flowleap-design-language/scripts/status-map.mjs';

const OUT = import.meta.dirname;
const RECORDS_CSS = '../../../../.agents/skills/flowleap-design-language/references/mockups/records.css';

// ---------- data: the seed firm (flowleap-seed-firm), the demo letter and the demo day ----------
// The demo persons follow the seed wall of SF-2023-0045 (coordinator, 2026-11-07): its formalities person, its
// responsible attorney since 2026-10-15, and the other confirmer. One place, so a change of the cast is one edit here.
const P = {
  formal: { name: 'Tobias Schmitt', role: ['Formalities', 'Formalitäten'] },
  attorney: { name: 'Dr. Anna Becker', role: ['Patent attorney', 'Patentanwältin'] },
  lena: { name: 'Lena Hoffmann', role: ['Patent attorney', 'Patentanwältin'] },
};
const M = {
  demo: { key: 'SF-2023-0045', title: 'Apparatus and method for position encoding', client: 'Renishaw plc', app: 'EP 23 771 920.8', register: 'https://register.epo.org/application?number=EP23771920&lng=en',
    // The client's recorded AI wishes (seed firm, founder 2026-11-07): AI use and AI drafts of client letters allowed.
    aiWishes: ['Drafts, client report', 'Entwürfe, Mandantenbericht'] },
  labels: { key: 'SF-2020-0031', title: 'Labelling materials for marking electrical installations and method for producing a labelling strip', client: 'Phoenix Contact GmbH & Co. KG', app: 'EP 20 706 232.4' },
  terminal: { key: 'SF-2026-0019', title: 'Terminal for electrical wire', client: 'Phoenix Contact GmbH & Co. KG', app: 'EP 21 810 318.2' },
};
// The Rule 71(3) communication of seed case r71-3-en-open (row 18): dated 2026-09-29, footer date 2026-09-25.
// Due date from flowleap-deadlines rule ep.r71-3.grant-communication v1 with the EPO 2027 closing days (OJ EPO 2026, A30).
const LETTER = '2026-09-29', FOOTER = '2026-09-25', START = '2026-09-30', DUE = '2027-01-29';
// The demo day is the viewer's day in the real calendar (founder, 2026-11-07): the letter of 29 September arrives
// today. frame.js fills every "days left" and the [data-day] line from the real clock; 'today' in a row's due is that day.
const TODAY = 'today';
// The date by which the client report asks the client for instructions: a firm choice, two weeks before the due date.
const INSTRUCT_BY = '2027-01-15';

let lang = 'en';
const t = (en, de) => (lang === 'de' ? de : en);
const role = p => t(...P[p].role);
const initial = p => P[p].name.replace(/^Dr\. /, '')[0];

// ---------- dates, written out; frame.js computes every "days left" from today ----------
const WD = { en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], de: ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.'] };
const WDL = { en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], de: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'] };
const MO = { en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], de: ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'] };
const MOL = { en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'], de: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'] };
const parts = iso => { const d = new Date(`${iso}T12:00:00Z`); return [d.getUTCDay(), d.getUTCDate(), d.getUTCMonth(), d.getUTCFullYear()]; };
const day = iso => { const [w, d, m, y] = parts(iso); return lang === 'de' ? `${WD.de[w]}, ${d}. ${MO.de[m]} ${y}` : `${WD.en[w]}, ${d} ${MO.en[m]} ${y}`; };
const long = iso => { const [w, d, m, y] = parts(iso); return lang === 'de' ? `${WDL.de[w]}, ${d}. ${MOL.de[m]} ${y}` : `${WDL.en[w]}, ${d} ${MOL.en[m]} ${y}`; };
const short = iso => { const [, d, m] = parts(iso); return lang === 'de' ? `${d}. ${MO.de[m]}` : `${d} ${MO.en[m]}`; };

// ---------- parts ----------
const KEYS = { record: ['⇧⌘↵'], reject: ['2'], accept: ['1'], 'other-matter': ['M'], preview: () => [t('Space', 'Leer')], calculation: ['C'], 'open-letter': ['O'], retry: ['R'], 'show-filed': ['F'], open: ['↵'], search: ['⌘K'], find: ['/'], 'go-matter': ['G', 'M'] };
const caps = act => { const k = KEYS[act]; return (typeof k === 'function' ? k() : k).map(x => `<span class="kbd">${x}</span>`).join(''); };
const btn = (act, label, { kind = 'secondary', icon = 'check', cls = '', attrs = '' } = {}) =>
  `<span class="btn btn-${kind}${cls ? ` ${cls}` : ''}" data-i="${icon}"${act ? ` data-act="${act}"` : ''}${attrs}>${label}${act ? ` ${caps(act)}` : ''}</span>`;
const mi = (act, label, icon) => `<div class="mi" data-i="${icon}"${act ? ` data-act="${act}"` : ''}>${label}${act ? `<span class="kbds">${caps(act)}</span>` : ''}</div>`;
/** A status icon with its atlas word; cls 'pill' is the header capsule. */
const status = (key, cls = 'status') => {
  const [m, s] = key.split('.');
  const [shape, en, de] = STATUS[m][s];
  return `<span class="${cls}${cls === 'pill' ? ` ${shape}` : ''}" data-atlas="${key}"><span class="st" data-s="${shape}"></span>${t(en, de)}</span>`;
};
const av = (p, lg = '') => `<span class="av a${lg ? ' av-lg' : ''}">${initial(p)}</span>`;
const who = p => `<span class="who">${av(p)}${P[p].name}</span>`;
const quote = (q, page) => `<span class="span-ref"><span class="quote">${q}</span><span class="page-ref">${t('p.', 'S.')} ${page}</span></span>`;
const ev = (icon, html, time, person) => person
  ? `<div class="ev person"><span class="ico">${av(person, 'lg')}</span><div class="txt">${html}<span class="t">${time}</span></div></div>`
  : `<div class="ev"><span class="ico"><span class="av sys" data-i="${icon}"></span></span><div class="txt">${html}<span class="t">${time}</span></div></div>`;
const b = s => `<b>${s}</b>`;
const FL = '<b>FlowLeap</b>';

const page = ({ name, title, body, after = '' }) => `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<!-- Generated from build.mjs: edit that file and run node build.mjs, never this file -->
<link rel="stylesheet" href="${RECORDS_CSS}">
<link rel="stylesheet" href="first-demo.css">
</head>
<body>
${body}
${after}<script src="frame.js"></script>
</body>
</html>
`;
const href = name => `${name}${lang === 'de' ? '.de' : ''}.html`;
const app = ({ person, side, count = '', zero = '', body, fixed = true }) => `<div class="app">
  <nav data-sidebar="${side}" data-name="${P[person].name}" data-role="${role(person)}" data-count="${count}"${zero ? ` data-zero="${zero}"` : ''}></nav>
  <main class="main">
    <section class="panel${fixed ? ' fixed' : ''}">
${body}
    </section>
  </main>
</div>`;
const findBtn = () => `<span class="btn btn-ghost" data-i="search" data-act="find" aria-label="${t('Find a matter', 'Akte finden')}"><span class="hide-sm">${t('Find a matter', 'Akte finden')}</span>${caps('find')}</span>`;
const topbar = (crumbs, right = '') => `      <header class="topbar">
        <div class="crumbs">${crumbs}</div>
        <div class="bar-right">${right}</div>
      </header>`;
const myWorkCrumb = here => `<span class="ico hide-sm" data-i="mywork"></span><span class="hide-sm">${t('My work', 'Meine Arbeit')}</span><span class="sep hide-sm">›</span><span class="here">${here}</span>`;
const pager = (n, of) => `<span class="pager"><b>${n}</b>&nbsp;/ ${of}</span><span class="iconbtn boxed" data-i="up"></span><span class="iconbtn boxed" data-i="down"></span><span class="iconbtn hide-sm" data-i="link"></span>`;
const overflow = items => `<div class="menu ctx-menu overflow-menu" id="more-menu" data-state="more" role="menu">${items}</div>`;
const more = () => `<span class="more" data-overflow="more-menu"><span class="iconbtn" data-i="dots" aria-label="${t('More acts', 'Weitere Aktionen')}"></span></span>`;
const decision = ({ person, q, why, parts, left = '', note = '', acts }) => `          <div class="decision-dock">
            <div class="decision">
              <div class="decision-h">
                ${av(person, 'lg')}<span class="lbl">${t('Your decision', 'Ihre Entscheidung')}</span><span class="q">${q}</span>
                <span class="why hide-sm" data-i="info">${why}</span>
              </div>
              <div class="decision-b">${parts}</div>
              <div class="decision-f">
                ${left}${note ? `<span class="note">${note}</span>` : ''}
                <div class="acts">${acts}</div>
              </div>
            </div>
          </div>`;
const part = (icon, q, d, ctl = '<span></span>') => `
                <div class="part"><span class="pi${icon === 'warn' ? ' warn' : ''}" data-i="${icon}"></span><div><div class="q">${q}</div>${d ? `<div class="d">${d}</div>` : ''}</div>${ctl}</div>`;
const cpart = (icon, q, d, ctl = '<span></span>') => `
                <div class="part compact">${icon}<div class="cq"><span class="q">${q}</span><span class="d">${d}</span></div>${ctl}</div>`;
const seg = on => `<div class="seg"><span${on ? ' class="on"' : ''} data-i="check" data-act="accept">${t('Accept', 'Annehmen')} ${caps('accept')}</span><span data-i="x" data-act="reject">${t('Reject…', 'Ablehnen…')} ${caps('reject')}</span></div>`;
const scanImage = (marks, cap) => `<div class="sticky-ev">
                <div class="letter scan"><img src="scan/r71-3-page-1.webp" alt="${t('Page 1 of the scanned Rule 71(3) communication', 'Seite 1 der gescannten Mitteilung nach Regel 71(3)')}" width="910" height="1287">${marks.map(m => `<span class="mark mk-${m}" aria-hidden="true"></span>`).join('')}</div>
                <div class="scan-pages"><span>${t('Page 1 of 4', 'Seite 1 von 4')}</span><span class="spacer"></span><span>${cap}</span></div>
              </div>`;
const activity = evs => `            <div class="activity">
              <h2>${t('Activity', 'Aktivität')}</h2>
              ${evs.join('\n              ')}
            </div>
            <details class="audit" data-audit><summary data-i="chev">Audit</summary></details>`;

// The readings of the demo letter: [label, text reading, image reading, agree?]
const readRow = (k, a, b2, agree = true) => `<div class="k">${k}</div><div class="v">${a}</div><div class="v">${b2}</div><div class="agree-cell">${agree ? `<span class="agree" data-i="check">${t('Agree', 'Stimmen überein')}</span>` : `<span class="differ" data-i="warn">${t('Differ', 'Weichen ab')}</span>`}</div>`;
const readsHead = () => `<div class="h"></div><div class="h">${t('From the text of the scan', 'Aus dem Text des Scans')}</div><div class="h">${t('From the page image', 'Aus dem Seitenbild')}</div><div class="h agree-cell"></div>`;
const codeRow = () => readRow(t('Office event', 'Amtsereignis'), `${t('Rule 71(3) communication', 'Mitteilung nach Regel 71(3)')}${quote('Communication under Rule 71(3) EPC', 1)}`, t('Rule 71(3) communication', 'Mitteilung nach Regel 71(3)'));
const dateRow = (agree = true) => agree
  ? readRow(t('Date of the letter', 'Datum des Schreibens'), `${day(LETTER)}${quote('29.09.2026', 1)}`, day(LETTER))
  : readRow(t('Date of the letter', 'Datum des Schreibens'), `${day(FOOTER)}${quote('(25.09.2026)', 1)}`, `${day(LETTER)}${quote('29.09.2026', 1)}`, false);
const appRow = () => readRow(t('Application', 'Anmeldung'), `${M.demo.app}${quote('23 771 920.8 - 1001', 1)}`, M.demo.app);

// ---------- 1. My work ----------
/** The first line, counted from the rows: what arrived or was worked, and how many need the person. */
function firstLine(rows) {
  const arrived = rows.filter(r => r.kind === 'file-letter').length, worked = rows.filter(r => r.kind === 'decide-work').length;
  const letters = n => (n === 1 ? t('1 letter', '1 Schreiben') : t(`${n} letters`, `${n} Schreiben`));
  const need = rows.length === 1 ? t('1 needs you', '1 braucht Sie') : t(`${rows.length} need you`, `${rows.length} brauchen Sie`);
  return [arrived && `${letters(arrived)} ${t('arrived', 'eingegangen')}`, worked && `${letters(worked)} ${t('worked', 'bearbeitet')}`].filter(Boolean).join(', ') + `, ${need}`;
}
/** The second line: today and the count of each due group. */
function subLine(rows) {
  const n = g => rows.filter(r => r.group === g).length;
  const counts = [n('over') && t(`${n('over')} overdue`, `${n('over')} überfällig`), n('today') && t(`${n('today')} due today`, `${n('today')} heute fällig`), n('later') && t(`${n('later')} later`, `${n('later')} später`)].filter(Boolean);
  return `<span data-day></span> · ${counts.join(', ')}`;
}
/** rows: { group: 'over'|'today'|'later', kind, page (a mockup page, or none), atlas, task, why, m, legal, due } */
function myWork({ person, time, rows, states = false }) {
  const groups = [['over', 'warn', t('Overdue', 'Überfällig')], ['today', 'today', t('Today', 'Heute')], ['later', 'later', t('Later', 'Später')]];
  const row = r => {
    const tag = r.page ? 'a' : 'div';
    return `<${tag} class="row${r === rows[0] ? ' is-context' : ''}"${r.page ? ` href="${href(r.page)}"` : ''}><span class="t c-task"><span class="task">${r.task}</span><span class="muted hide-sm">${r.why}</span></span>${status(r.atlas)}<span class="m num c-key">${r.m.key}</span><span class="m hide-sm">${r.m.client}</span><span class="hide-sm">${r.legal ? `<span class="legal" data-i="scale">${day(r.legal)}</span>` : ''}</span><span class="r c-due" data-due="${r.due}"></span></${tag}>`;
  };
  const list = groups.map(([g, icon, word]) => {
    const rs = rows.filter(r => r.group === g);
    return rs.length ? `<div class="group"><span class="gi${g === 'over' ? ' over' : ''}" data-i="${icon}"></span>${word}<span class="count">${rs.length}</span></div>\n${rs.map(row).join('\n')}` : '';
  }).filter(Boolean).join('\n');
  const thead = `<div class="thead"><span>${t('Task', 'Aufgabe')}</span><span>${t('Status', 'Status')}</span><span>${t('Matter', 'Akte')}</span><span>${t('Client', 'Mandant')}</span><span>${t('Legal date', 'Fristende')}</span><span class="end">${t('Due', 'Fällig')}</span></div>`;
  const skel = ['w70', 'w50', 'w80', 'w60'].map(w => `<div class="row"><span class="skel ${w} c-task"></span><span class="skel w80"></span><span class="skel w80 c-key"></span><span class="skel w60 hide-sm"></span><span class="skel w70 hide-sm"></span><span class="skel w50 end c-due"></span></div>`).join('\n');
  const S = s => (states ? ` data-state="${s}"` : '');
  // My work has no row selection and no bulk act (founder exception to product rule 1); a row's context menu opens it,
  // opens its matter or copies its link.
  const rowMenu = `<div class="menu ctx-menu ctx-at" id="row-menu" data-state="context" role="menu">
  ${mi('open', t('Open', 'Öffnen'), 'eye').replace('class="mi"', 'class="mi on"')}
  ${mi('go-matter', t('Open matter', 'Akte öffnen'), 'matters')}
  <div class="sep"></div>
  ${mi('', t('Copy link', 'Link kopieren'), 'link')}
</div>`;
  const body = app({ person, side: 'mywork', count: rows.length, body: `${topbar(`<span class="ico" data-i="mywork"></span><span class="here">${t('My work', 'Meine Arbeit')}</span>`, `${findBtn()}<span class="iconbtn boxed" data-i="filter" aria-label="${t('Filter', 'Filter')}"></span><span class="iconbtn boxed hide-sm" data-i="display" aria-label="${t('Display', 'Anzeige')}"></span>`)}
      <div class="list-pane">
        <div class="mw-head"${S('default error context')}>
          <h1 class="title">${firstLine(rows)}</h1>
          <p class="lede">${subLine(rows)}</p>
        </div>
${states ? `        <div class="error-bar"${S('error')}>
          <div class="notice bad" data-i="warn"><div><span class="lead">${t('FlowLeap could not load your work.', 'FlowLeap konnte Ihre Arbeit nicht laden.')}</span> ${t(`The list shows your work as of ${time}. Nothing in the record changed.`, `Die Liste zeigt Ihre Arbeit mit Stand ${time} Uhr. Im Record hat sich nichts geändert.`)}</div><span class="spacer"></span>${btn('retry', t('Try again', 'Erneut versuchen'), { icon: 'retry' })}</div>
        </div>
` : ''}        <div class="list mw" data-list="my-work"${S('default error context')}>
          ${thead}
${list}
        </div>
${states ? `        <div class="mw-head mw" data-state="loading"><div class="skel w50"></div></div>
        <div class="list mw" data-state="loading">
          ${thead}
${skel}
        </div>
        <div class="empty" data-state="empty">
          <div class="empty-in">
            <div class="empty-art" data-i="mywork"></div>
            <h2>${t('Nothing waits for you', 'Nichts wartet auf Sie')}</h2>
            <p>${t('When a letter, a deadline or a draft needs you, it shows here with the step and its due date. FlowLeap names one person for each step.', 'Wenn ein Schreiben, eine Frist oder ein Entwurf Sie braucht, steht es hier mit dem Schritt und seinem Termin. FlowLeap nennt für jeden Schritt eine Person.')}</p>
            ${btn('show-filed', t('Show filed today', 'Heute abgelegt zeigen'))}
          </div>
        </div>` : ''}
      </div>` });
  return { body, after: rowMenu };
}

const formalRows = () => [
  { group: 'today', kind: 'file-letter', page: '2-file-letter', atlas: 'intake.match_proposed', task: t('File this letter', 'Dieses Schreiben ablegen'), why: t(`Letter of ${short(LETTER)} · arrived today`, `Schreiben vom ${short(LETTER)} · heute eingegangen`), m: M.demo, legal: null, due: TODAY },
];
// Seed case r79-1-opposition: four months from 2026-10-14 end on Sunday, so Monday 2027-02-15. Its worked state is a
// demo assumption, with ticket.decideBy one month before the legal date; no mockup page opens it.
const attorneyRows = () => [
  { group: 'today', kind: 'decide-work', page: '4-review-work', atlas: 'ticket.proposals_ready', task: t('Review the work', 'Arbeit prüfen'), why: t(`Rule 71(3) communication worked; deadline confirmed by ${P.formal.name}`, `Mitteilung nach Regel 71(3) bearbeitet; Frist von ${P.formal.name} bestätigt`), m: M.demo, legal: DUE, due: TODAY },
  { group: 'later', kind: 'decide-work', page: null, atlas: 'ticket.proposals_ready', task: t('Review the work', 'Arbeit prüfen'), why: t('Notice of opposition worked; draft observations ready', 'Mitteilung über den Einspruch bearbeitet; Entwurf der Stellungnahme liegt vor'), m: M.terminal, legal: '2027-02-15', due: '2027-01-15' },
];

// ---------- 2. File this letter, with the states "readings differ" and "no reading" ----------
function fileLetter() {
  const S = s => ` data-state="${s}"`;
  const matterCard = `<div class="found">
                <div class="sub-h">${t('Proposed matter', 'Vorgeschlagene Akte')}</div>
                <div class="card-matter">
                  <div class="muted num">${M.demo.key}</div>
                  <div class="name">${M.demo.title}</div>
                  <div class="meta">${M.demo.client}<span>·</span><span class="pk">${t('Responsible', 'Verantwortlich')}</span>${who('attorney')}<span>·</span><span class="pk">${t('Formalities', 'Formalitäten')}</span>${who('formal')}</div>
                </div>
                <div class="reasons">
                  <div class="reason" data-i="key"><div>${t(`Found by the application number on page 1. ${M.demo.app} belongs to this matter only.`, `Gefunden über die Anmeldenummer auf Seite 1. ${M.demo.app} gehört nur zu dieser Akte.`)}</div></div>
                  <div class="reason" data-i="info"><div>${t('Your firm asks a person to file each letter, also when the application number matches.', 'Ihre Kanzlei lässt jedes Schreiben von einer Person ablegen, auch wenn die Anmeldenummer passt.')}</div></div>
                </div>
              </div>`;
  const next = `<div class="section">
                <div class="sub-h">${t('When you file', 'Wenn Sie ablegen')}</div>
                <div class="reasons">
                  <div class="reason" data-i="check"><div>${t('FlowLeap records the office event and computes the deadline. You confirm it next.', 'FlowLeap erfasst das Amtsereignis und berechnet die Frist. Danach bestätigen Sie sie.')}</div></div>
                  <div class="reason" data-i="check"><div>${t(`The patent agent drafts the reply and the client report for ${P.attorney.name}.`, `Der Patent-Agent entwirft die Antwort und den Mandantenbericht für ${P.attorney.name}.`)}</div></div>
                </div>
              </div>`;
  const body = app({ person: 'formal', side: 'mywork', count: 1, body: `${topbar(myWorkCrumb(t('Rule 71(3) communication', 'Mitteilung nach Regel 71(3)')), `${pager(1, 1)}<span class="iconbtn" data-i="dots"></span>`)}
      <div class="detail fill solo">
        <div class="work">
          <div class="work-scroll">
            <div class="eyebrow"${S('default more')}>${status('intake.match_proposed', 'pill')}<span class="hide-sm">${t('Waits for you since 08:02', 'Wartet seit 08:02 Uhr auf Sie')}</span></div>
            <div class="eyebrow"${S('disagree disagree-ready')}>${status('deadline.code_proposed', 'pill')}<span class="hide-sm">${t('Filed by you at 08:03 · waits for you', 'Von Ihnen um 08:03 Uhr abgelegt · wartet auf Sie')}</span></div>
            <div class="eyebrow"${S('no-reading')}>${status('intake.unreadable', 'pill')}<span class="hide-sm">${t('Waits for you since 08:02', 'Wartet seit 08:02 Uhr auf Sie')}</span></div>
            <h1 class="title">${t('Rule 71(3) communication', 'Mitteilung nach Regel 71(3)')}</h1>
            <p class="lede"${S('default more')}>${t('The scan came from the scan mailbox at 08:00. FlowLeap read it twice, and both readings agree.', 'Der Scan kam um 08:00 Uhr aus dem Scan-Postfach. FlowLeap hat ihn zweimal gelesen, beide Lesungen stimmen überein.')}</p>
            <p class="lede"${S('disagree disagree-ready')}>${t(`You filed this letter on ${M.demo.key}. The two readings differ on the date of the letter, so you decide it. Then ${P.lena.name} confirms the deadline.`, `Sie haben dieses Schreiben in ${M.demo.key} abgelegt. Die beiden Lesungen weichen beim Datum ab, darum entscheiden Sie es. Danach bestätigt ${P.lena.name} die Frist.`)}</p>
            <p class="lede"${S('no-reading')}>${t(`FlowLeap could not read this scan. Read the page image and enter what it says. Then ${P.lena.name} confirms the deadline, because you entered the event.`, `FlowLeap konnte diesen Scan nicht lesen. Lesen Sie das Seitenbild und geben Sie ein, was darauf steht. Danach bestätigt ${P.lena.name} die Frist, weil Sie das Ereignis eingegeben haben.`)}</p>
            <div class="ev-split">
              <div>
                <div${S('default disagree disagree-ready more')}>
                  <div class="sub-h">${t('What FlowLeap read', 'Was FlowLeap gelesen hat')} <span class="muted">· ${t('two independent readings', 'zwei unabhängige Lesungen')}</span></div>
                  <div class="reads"${S('default more')}>${readsHead()}${codeRow()}${dateRow()}${appRow()}</div>
                  <div class="reads"${S('disagree disagree-ready')}>${readsHead()}${codeRow()}${dateRow(false)}${appRow()}</div>
                </div>
                <div${S('default more')}>${matterCard}${next}</div>
                <div class="section"${S('disagree disagree-ready')}>
                  <div class="sub-h">${t('Why the readings differ', 'Warum die Lesungen abweichen')}</div>
                  <div class="reasons"><div class="reason" data-i="info"><div>${t('Page 1 has two dates: the date of the letter in the box at the top, and the print date of the form in the footer. The letter bears the date in the box.', 'Seite 1 hat zwei Daten: das Datum des Schreibens im Kasten oben und das Druckdatum des Formulars in der Fußzeile. Maßgeblich ist das Datum im Kasten.')}</div></div></div>
                </div>
                <div${S('no-reading')}>
                  <div class="sub-h">${t('Enter what the page says', 'Geben Sie ein, was auf der Seite steht')}</div>
                  <div class="fields">
                    <div class="field"><span class="k">${t('Application number', 'Anmeldenummer')}</span><input class="input num" value="${M.demo.app}" readonly><span class="muted t12">${t(`Matches ${M.demo.key}, ${M.demo.title}`, `Passt zu ${M.demo.key}, ${M.demo.title}`)}</span></div>
                    <div class="field"><span class="k">${t('Office event', 'Amtsereignis')}</span><select class="input"><option>${t('Rule 71(3) communication', 'Mitteilung nach Regel 71(3)')}</option></select></div>
                    <div class="field"><span class="k">${t('Date of the letter', 'Datum des Schreibens')}</span><input class="input num" value="${day(LETTER)}" readonly><span class="muted t12">${t('The date in the box at the top of page 1, not the print date in the footer.', 'Das Datum im Kasten oben auf Seite 1, nicht das Druckdatum in der Fußzeile.')}</span></div>
                  </div>
                </div>
              </div>
              <div${S('default more')}>${scanImage(['app', 'date', 'code'], t('3 marked spans', '3 markierte Stellen'))}</div>
              <div${S('disagree disagree-ready')}>${scanImage(['date', 'foot'], t('2 dates marked', '2 Daten markiert'))}</div>
              <div${S('no-reading')}>${scanImage([], t('No reading', 'Keine Lesung'))}</div>
            </div>
            <div${S('default more')}>
${activity([
    ev('scan', t(`${b(t('Scan mailbox', 'Scan-Postfach'))} delivered the scan, 4 pages`, `${b('Scan-Postfach')} hat den Scan geliefert, 4 Seiten`), '08:00'),
    ev('eye', t(`${FL} read the scan twice; both readings agree`, `${FL} hat den Scan zweimal gelesen; beide Lesungen stimmen überein`), '08:02'),
    ev('sparkle', t(`${FL} proposed ${M.demo.key} from the application number`, `${FL} hat ${M.demo.key} über die Anmeldenummer vorgeschlagen`), '08:02'),
  ])}
            </div>
            <div${S('disagree disagree-ready')}>
${activity([
    ev('scan', t(`${b('Scan mailbox')} delivered the scan, 4 pages`, `${b('Scan-Postfach')} hat den Scan geliefert, 4 Seiten`), '08:00'),
    ev('eye', t(`${FL} read the scan twice; the readings differ on the date`, `${FL} hat den Scan zweimal gelesen; die Lesungen weichen beim Datum ab`), '08:02'),
    ev('', t(`${b(P.formal.name)} filed the letter on ${M.demo.key}`, `${b(P.formal.name)} hat das Schreiben in ${M.demo.key} abgelegt`), '08:03', 'formal'),
  ])}
            </div>
            <div${S('no-reading')}>
${activity([
    ev('scan', t(`${b('Scan mailbox')} delivered the scan, 4 pages`, `${b('Scan-Postfach')} hat den Scan geliefert, 4 Seiten`), '08:00'),
    ev('eye', t(`${FL} could not read the scan, so it waits for a person`, `${FL} konnte den Scan nicht lesen, darum wartet er auf eine Person`), '08:02'),
  ])}
            </div>
          </div>
          <div${S('default more')}>
${decision({
    person: 'formal', q: t('Which matter is this letter for?', 'Zu welcher Akte gehört dieses Schreiben?'), why: t(`You are the formalities person of ${M.demo.key}`, `Sie betreuen die Formalitäten von ${M.demo.key}`),
    parts: part('check', `${M.demo.key} ${M.demo.title}`, t('Found by the application number on page 1 · both readings agree', 'Über die Anmeldenummer auf Seite 1 gefunden · beide Lesungen stimmen überein')),
    left: btn('reject', t('Not relevant…', 'Nicht relevant…'), { kind: 'ghost', icon: 'x' }),
    acts: `${more()}${btn('other-matter', t('Other matter…', 'Andere Akte…'), { icon: 'matters', cls: 'hide-sm' })}${btn('record', t('File', 'Ablegen'), { kind: 'primary', cls: 'btn-lg' })}`,
  })}
          </div>
          <div${S('disagree')}>
${decision({
    person: 'formal', q: t('Which date does the letter bear?', 'Welches Datum trägt das Schreiben?'), why: t(`You are the formalities person of ${M.demo.key}`, `Sie betreuen die Formalitäten von ${M.demo.key}`),
    parts: part('calendar', t('Date of the letter', 'Datum des Schreibens'), t('Not chosen: the two readings differ', 'Nicht gewählt: die beiden Lesungen weichen ab'), `<div class="seg"><span>${short(LETTER)} · ${t('box', 'Kasten')}</span><span>${short(FOOTER)} · ${t('footer', 'Fußzeile')}</span></div>`)
      + part('info', t(`${P.lena.name} confirms the deadline`, `${P.lena.name} bestätigt die Frist`), t('You decide the date, so a second person confirms the deadline', 'Sie entscheiden das Datum, darum bestätigt eine zweite Person die Frist')),
    note: t('Choose the date to record your decision.', 'Wählen Sie das Datum, um Ihre Entscheidung zu erfassen.'),
    acts: btn('record', t('Record decision', 'Entscheidung erfassen'), { kind: 'primary', cls: 'btn-lg', attrs: ' aria-disabled="true"' }),
  })}
          </div>
          <div${S('disagree-ready')}>
${decision({
    person: 'formal', q: t('Which date does the letter bear?', 'Welches Datum trägt das Schreiben?'), why: t(`You are the formalities person of ${M.demo.key}`, `Sie betreuen die Formalitäten von ${M.demo.key}`),
    parts: part('calendar', t('Date of the letter', 'Datum des Schreibens'), t(`You chose ${day(LETTER)}, the date in the box`, `Sie haben ${day(LETTER)} gewählt, das Datum im Kasten`), `<div class="seg"><span class="on" data-i="check">${short(LETTER)} · ${t('box', 'Kasten')}</span><span>${short(FOOTER)} · ${t('footer', 'Fußzeile')}</span></div>`)
      + part('info', t(`${P.lena.name} confirms the deadline`, `${P.lena.name} bestätigt die Frist`), t('You decide the date, so a second person confirms the deadline', 'Sie entscheiden das Datum, darum bestätigt eine zweite Person die Frist')),
    note: t(`${P.lena.name} gets a notice when you record it.`, `${P.lena.name} erhält eine Nachricht, wenn Sie es erfassen.`),
    acts: btn('record', t('Record decision', 'Entscheidung erfassen'), { kind: 'primary', cls: 'btn-lg' }),
  })}
          </div>
          <div${S('no-reading')}>
${decision({
    person: 'formal', q: t('What does this letter say?', 'Was steht in diesem Schreiben?'), why: t(`You are the formalities person of ${M.demo.key}`, `Sie betreuen die Formalitäten von ${M.demo.key}`),
    parts: part('matters', `${M.demo.key} ${M.demo.title}`, t('From the application number that you entered', 'Aus der Anmeldenummer, die Sie eingegeben haben'))
      + part('pen', t(`Rule 71(3) communication of ${day(LETTER)}`, `Mitteilung nach Regel 71(3) vom ${day(LETTER)}`), t('Entered by you from the page image', 'Von Ihnen aus dem Seitenbild eingegeben')),
    note: t(`${P.lena.name} confirms the deadline, because you entered the event.`, `${P.lena.name} bestätigt die Frist, weil Sie das Ereignis eingegeben haben.`),
    acts: btn('record', t('Enter office event', 'Amtsereignis eingeben'), { kind: 'primary', cls: 'btn-lg', icon: 'pen' }),
  })}
          </div>
        </div>
      </div>` });
  return { body, after: `${overflow(`${mi('other-matter', t('Other matter…', 'Andere Akte…'), 'matters')}<div class="sep"></div>${mi('', t('Copy link', 'Link kopieren'), 'link')}`)}\n` };
}

// ---------- 3. Confirm the deadline (state "waiting": the formalities person decided the date, the second person confirms) ----------
const TRACE = () => `<ol class="trace">
                  <li><span class="dot"></span><div><div class="what">${t('Delivered on the date the letter bears', 'Zugestellt am Datum des Schreibens')}</div><div class="law">Rule 126(2) EPC · OJ EPO 2023, A29</div></div><div class="to">${day(LETTER)}</div></li>
                  <li><span class="dot"></span><div><div class="what">${t('The period starts the next day', 'Die Frist beginnt am nächsten Tag')}</div><div class="law">Rule 131(2) EPC</div></div><div class="to">${day(START)}</div></li>
                  <li><span class="dot"></span><div><div class="what">${t('Four months later, on the day with the same number', 'Vier Monate später, am Tag mit derselben Zahl')}</div><div class="law">Rule 71(3) EPC · Rule 131(4) EPC</div></div><div class="to">${day(DUE)}</div></li>
                  <li><span class="dot"></span><div><div class="what">${t('The EPO is open on that day, so the date stays', 'Das EPA ist an diesem Tag geöffnet, das Datum bleibt')}</div><div class="law">Rule 134(1) EPC · OJ EPO 2026, A30</div></div><div class="to">${day(DUE)}</div></li>
                </ol>`;
const LAWS = [['Rule 71 EPC', 'https://www.epo.org/en/legal/epc/2020/r71.html'], ['Rule 126 EPC', 'https://www.epo.org/en/legal/epc/2020/r126.html'], ['Rule 131 EPC', 'https://www.epo.org/en/legal/epc/2020/r131.html'], ['Rule 134 EPC', 'https://www.epo.org/en/legal/epc/2020/r134.html'], ['OJ EPO 2023, A29', 'https://www.epo.org/en/legal/official-journal/2023/03/a29'], ['OJ EPO 2026, A30', 'https://www.epo.org/en/legal/official-journal/2026/06/a30']];
const lawChips = () => `<div class="law-chips">${LAWS.map(([l, u]) => `<a class="law-chip" href="${u}" data-i="external">${l}</a>`).join('')}</div>`;

function confirmDeadline({ person }) {
  const S = s => ` data-state="${s}"`;
  const lenaView = person === 'lena';
  const decidedRow = readRow(t('Date of the letter', 'Datum des Schreibens'), `${day(FOOTER)}${quote('(25.09.2026)', 1)}`, `${day(LETTER)}${quote('29.09.2026', 1)}`, false);
  const readsDefault = `<div class="reads">${readsHead()}${codeRow()}${dateRow()}</div>`;
  const readsDecided = `<div class="reads">${readsHead()}${codeRow()}${decidedRow}</div>
                  <div class="reasons"><div class="reason" data-i="check"><div>${t(`${P.formal.name} decided the date at 08:05: ${day(LETTER)}, the date in the box at the top of page 1.`, `${P.formal.name} hat das Datum um 08:05 Uhr entschieden: ${day(LETTER)}, das Datum im Kasten oben auf Seite 1.`)}</div></div></div>`;
  const content = decided => `
            <div class="keyfact"><span class="big">${long(DUE)}</span><span data-due="${DUE}"></span></div>
            <div class="rule-line">${t('Rule 71(3) EPC, intention to grant', 'Regel 71(3) EPÜ, Mitteilung der Erteilungsabsicht')} <span class="muted">· ${t(`four months from the letter of ${day(LETTER)}`, `vier Monate ab dem Schreiben vom ${day(LETTER)}`)}</span></div>
            <p class="lede">${decided
    ? t(`FlowLeap computed this date from the Rule 71(3) communication that ${P.formal.name} filed on ${M.demo.key}. The letter is the office event that starts the period.`, `FlowLeap hat dieses Datum aus der Mitteilung nach Regel 71(3) berechnet, die ${P.formal.name} in ${M.demo.key} abgelegt hat. Das Schreiben ist das Amtsereignis, mit dem die Frist beginnt.`)
    : t(`FlowLeap computed this date from the Rule 71(3) communication that you filed on ${M.demo.key} at 08:03. The letter is the office event that starts the period.`, `FlowLeap hat dieses Datum aus der Mitteilung nach Regel 71(3) berechnet, die Sie um 08:03 Uhr in ${M.demo.key} abgelegt haben. Das Schreiben ist das Amtsereignis, mit dem die Frist beginnt.`)}</p>
            <div class="ev-split narrow-scan">
              <div>
                <div class="sub-h">${t('How FlowLeap computed the date', 'Wie FlowLeap das Datum berechnet hat')}</div>
                ${TRACE()}
                <div class="section">
                  <div class="sub-h">${t('What FlowLeap read', 'Was FlowLeap gelesen hat')} <span class="muted">· ${t('the computation uses these values', 'die Berechnung nutzt diese Werte')}</span></div>
                  ${decided ? readsDecided : readsDefault}
                </div>
                <div class="section">
                  <div class="sub-h">${t('Legal sources', 'Rechtsquellen')}</div>
                  ${lawChips()}
                </div>
              </div>
              ${scanImage(decided ? ['code', 'date', 'foot'] : ['code', 'date'], t('Office event and date marked', 'Amtsereignis und Datum markiert'))}
            </div>`;
  const evsDefault = [
    ev('', t(`${b(P.formal.name)} filed the letter on ${M.demo.key}`, `${b(P.formal.name)} hat das Schreiben in ${M.demo.key} abgelegt`), '08:03', 'formal'),
    ev('scale', t(`${FL} recorded the office event and computed ${day(DUE)}`, `${FL} hat das Amtsereignis erfasst und den ${day(DUE)} berechnet`), '08:03'),
    ev('mail', t(`${FL} sent a notice to ${b(P.formal.name)}`, `${FL} hat ${b(P.formal.name)} benachrichtigt`), '08:03'),
  ];
  const evsDecided = [
    ev('', t(`${b(P.formal.name)} filed the letter on ${M.demo.key}`, `${b(P.formal.name)} hat das Schreiben in ${M.demo.key} abgelegt`), '08:03', 'formal'),
    ev('', t(`${b(P.formal.name)} decided the date of the letter`, `${b(P.formal.name)} hat das Datum des Schreibens entschieden`), '08:05', 'formal'),
    ev('scale', t(`${FL} computed ${day(DUE)}`, `${FL} hat den ${day(DUE)} berechnet`), '08:05'),
    ev('mail', t(`${FL} sent a notice to ${b(P.lena.name)}`, `${FL} hat ${b(P.lena.name)} benachrichtigt`), '08:05'),
  ];
  const acts = btn('record', t('Confirm', 'Bestätigen'), { kind: 'primary', cls: 'btn-lg' });
  const left = btn('reject', t('Reject…', 'Ablehnen…'), { kind: 'ghost', icon: 'x' });
  const letterBtn = btn('open-letter', t('Open the letter', 'Schreiben öffnen'), { icon: 'doc', cls: 'hide-sm' });
  const crumbs = myWorkCrumb(t(`Deadline ${day(DUE)}`, `Frist ${day(DUE)}`));
  const pg = `${pager(1, 1)}<span class="iconbtn" data-i="dots"></span>`;
  let inner;
  if (lenaView) {
    inner = `          <div class="work-scroll">
            <div class="eyebrow">${status('deadline.deadline_proposed', 'pill')}<span class="hide-sm">${t('Waits for you · due today', 'Wartet auf Sie · heute fällig')}</span></div>${content(true)}
${activity(evsDecided)}
          </div>
${decision({
    person: 'lena', q: t('Is this date right?', 'Stimmt dieses Datum?'), why: t(`${P.formal.name} decided the date of the letter, so you confirm as the second person`, `${P.formal.name} hat das Datum entschieden, darum bestätigen Sie als zweite Person`),
    parts: part('check', day(DUE), t(`4 steps · date decided by ${P.formal.name} from page 1`, `4 Schritte · Datum von ${P.formal.name} aus Seite 1 entschieden`)),
    left, note: t(`When you confirm, the deadline is active, confirmed by ${P.lena.name}.`, `Wenn Sie bestätigen, ist die Frist aktiv, bestätigt von ${P.lena.name}.`),
    acts: `${more()}${letterBtn}${acts}`,
  })}`;
  } else {
    inner = `          <div class="work-scroll">
            <div class="eyebrow">${status('deadline.deadline_proposed', 'pill')}<span class="hide-sm" data-state="default more">${t('Waits for you · due today', 'Wartet auf Sie · heute fällig')}</span><span class="hide-sm" data-state="waiting">${t(`Waits for ${P.lena.name} · due today`, `Wartet auf ${P.lena.name} · heute fällig`)}</span></div>
            <div data-state="default more">${content(false)}
${activity(evsDefault)}
            </div>
            <div data-state="waiting">${content(true)}
${activity(evsDecided)}
            </div>
          </div>
          <div data-state="default more">
${decision({
    person: 'formal', q: t('Is this date right?', 'Stimmt dieses Datum?'), why: t('You did not decide the office event, so you may confirm', 'Sie haben das Amtsereignis nicht entschieden, darum dürfen Sie bestätigen'),
    parts: part('check', day(DUE), t('4 steps · both readings agree', '4 Schritte · beide Lesungen stimmen überein')),
    left, note: t(`When you confirm, the deadline is active, confirmed by ${P.formal.name}.`, `Wenn Sie bestätigen, ist die Frist aktiv, bestätigt von ${P.formal.name}.`),
    acts: `${more()}${letterBtn}${acts}`,
  })}
          </div>
          <div data-state="waiting">
          <div class="decision-dock">
            <div class="decision">
              <div class="decision-h">
                ${av('lena', 'lg')}<span class="lbl">${t(`${P.lena.name} decides`, `${P.lena.name} entscheidet`)}</span><span class="q">${t('Is this date right?', 'Stimmt dieses Datum?')}</span>
                <span class="why hide-sm" data-i="info">${t('You decided the date of the letter, so a second person confirms', 'Sie haben das Datum entschieden, darum bestätigt eine zweite Person')}</span>
              </div>
              <div class="decision-b">${part('info', t(`Not your decision: ${P.lena.name} confirms this deadline`, `Nicht Ihre Entscheidung: ${P.lena.name} bestätigt diese Frist`), t(`FlowLeap sent ${P.lena.name} a notice at 08:05. The deadline is in the docket only when it is confirmed.`, `FlowLeap hat ${P.lena.name} um 08:05 Uhr benachrichtigt. Die Frist ist erst nach der Bestätigung im Fristenkalender.`))}</div>
              <div class="decision-f">
                <span class="note">${t('The person who decides the date never confirms it.', 'Wer das Datum entscheidet, bestätigt es nie.')}</span>
              </div>
            </div>
          </div>
          </div>`;
  }
  const body = app({ person, side: 'mywork', count: 1, zero: lenaView ? '' : 'waiting', body: `${topbar(crumbs, pg)}
      <div class="detail fill solo">
        <div class="work">
${inner}
        </div>
      </div>` });
  return { body, after: `${overflow(`${mi('open-letter', t('Open the letter', 'Schreiben öffnen'), 'doc')}<div class="sep"></div>${mi('', t('Copy link', 'Link kopieren'), 'link')}`)}\n` };
}

// ---------- 4. Review the work ----------
/** The decision bar of Review the work: open (nothing chosen, Record decision disabled) or ready (state `ready`). */
function reviewBar(ready) {
  const box = ready ? '<span class="check on" data-i="check"></span>' : '<span class="check"></span>';
  const doc = '<span class="pi" data-i="doc"></span>';
  const parts = cpart(doc, t('Draft reply to the EPO', 'Antwortentwurf an das EPA'), t('3 of 3 statements sourced', '3 von 3 Aussagen belegt'), seg(ready))
    + cpart(doc, t('Client report', 'Mandantenbericht'), t('5 of 5 statements sourced', '5 von 5 Aussagen belegt'), seg(ready))
    + cpart(box, t(`I checked the deadline ${day(DUE)}`, `Frist ${day(DUE)} geprüft`), t(`confirmed by ${P.formal.name}`, `bestätigt von ${P.formal.name}`), btn('calculation', t('Calculation', 'Berechnung'), { kind: 'ghost', icon: 'calendar', cls: 'hide-sm' }));
  return `          <div data-state="${ready ? 'ready' : 'default evidence more'}">
${decision({
    person: 'attorney', q: ready ? t('All 3 parts decided', 'Alle 3 Teile entschieden') : t('3 parts open', '3 Teile offen'), why: t(`You are the responsible attorney of ${M.demo.key}`, `Sie sind verantwortlich für ${M.demo.key}`),
    parts,
    note: t(`Accept keeps the reply as a draft until ${M.demo.client} instructs.`, `Annehmen hält die Antwort als Entwurf, bis ${M.demo.client} Weisung gibt.`),
    acts: `${more()}${btn('record', t('Record decision', 'Entscheidung erfassen'), { kind: 'primary', cls: 'btn-lg', attrs: ready ? '' : ' aria-disabled="true"' })}`,
  })}
          </div>`;
}

function reviewWork() {
  const stmt = (n, text, srcs, extra = '') => `<div class="stmt"><span class="n">${n}</span><div>${text}</div><div class="srcs">${srcs}</div>${extra}</div>`;
  const excerpt = `<div class="excerpt" data-state="evidence"><div class="cap"><span>${t('Letter, page 2', 'Schreiben, Seite 2')}</span><span>${t('Exact span', 'Genaue Stelle')}</span></div><div class="page" data-verbatim><span class="fade">2 Invitation. You are invited, </span><span class="hl">within a non-extendable period of four months</span><span class="fade"> of notification of this communication, to either approve the text communicated above and verify the bibliographic data…</span></div></div>`;
  const report = [
    stmt(1, t(`The EPO intends to grant ${M.demo.app}. The text has claims 1 to 15, filed on 19 September 2025, and the description and drawings as published.`, `Das EPA beabsichtigt, ${M.demo.app} zu erteilen. Der Text hat die Ansprüche 1 bis 15, eingereicht am 19. September 2025, sowie Beschreibung und Zeichnungen wie veröffentlicht.`), quote('intends to grant a European patent', 1) + quote('1-15 filed in electronic form on 19-09-2025', 1)),
    stmt(2, t('To approve the text, you file the claims in German and French and pay the fee for grant of EUR 1,135.', 'Um den Text zu genehmigen, reichen Sie die Ansprüche auf Deutsch und Französisch ein und zahlen die Erteilungsgebühr von 1.135 EUR.'), quote('a translation of the claim(s) in the other two official languages', 2) + quote('1135.00', 2)),
    stmt(3, t('No claims fees are due.', 'Anspruchsgebühren fallen nicht an.'), quote('number of claims fees payable: 0', 2)),
    stmt(4, t(`The period cannot be extended. It ends on ${long(DUE)}.`, `Die Frist ist nicht verlängerbar. Sie endet am ${long(DUE)}.`), `<span class="span-ref" data-hover><span class="quote">within a non-extendable period of four months</span><span class="page-ref">${t('p.', 'S.')} 2</span></span><span class="src-chip" data-i="calendar">${t('Deadline, active', 'Frist, aktiv')}</span>`, excerpt),
    stmt(5, t(`Please tell us by ${long(INSTRUCT_BY)} whether we approve the text for you (point 2.1) or request amendments (point 2.2).`, `Bitte teilen Sie uns bis ${long(INSTRUCT_BY)} mit, ob wir den Text für Sie genehmigen (Punkt 2.1) oder Änderungen beantragen (Punkt 2.2).`), quote('approve the text communicated above', 2) + quote('in the case of disapproval, to request reasoned amendments', 2)),
  ].join('\n');
  const reply = [
    stmt(1, t('We approve the text intended for grant and verify the bibliographic data.', 'Wir genehmigen die für die Erteilung vorgesehene Fassung und prüfen die bibliografischen Daten.'), quote('approve the text communicated above and verify the bibliographic data', 2)),
    stmt(2, t('The translations of claims 1 to 15 into German and French are enclosed.', 'Die Übersetzungen der Ansprüche 1 bis 15 ins Deutsche und Französische liegen bei.'), quote('a translation of the claim(s) in the other two official languages', 2)),
    stmt(3, t('The fee for grant of EUR 1,135 is paid from the deposit account.', 'Die Erteilungsgebühr von 1.135 EUR wird vom laufenden Konto gezahlt.'), quote('1135.00', 2)),
  ].join('\n');
  const head = `<div class="stmt-h"><span>#</span><span>${t('What the draft says', 'Was der Entwurf sagt')}</span><span class="hide-sm">${t('Source in the letter', 'Quelle im Schreiben')}</span></div>`;
  const body = app({ person: 'attorney', side: 'mywork', count: 2, body: `${topbar(myWorkCrumb(t(`Rule 71(3) communication of ${day(LETTER)}`, `Mitteilung nach Regel 71(3) vom ${day(LETTER)}`)), `${pager(1, 2)}<span class="iconbtn" data-i="dots"></span>`)}
      <div class="detail fill">
        <div class="work">
          <div class="work-scroll">
            <div class="eyebrow">${status('ticket.proposals_ready', 'pill')}<span class="hide-sm">${t('Waits for your decision since 08:25', 'Wartet seit 08:25 Uhr auf Ihre Entscheidung')}</span></div>
            <h1 class="title">${t(`Rule 71(3) communication of ${day(LETTER)}`, `Mitteilung nach Regel 71(3) vom ${day(LETTER)}`)}</h1>
            <p class="lede">${t(`The EPO intends to grant ${M.demo.app}. The patent agent drafted the reply to the EPO and the client report. Nothing went to the EPO or to the client.`, `Das EPA beabsichtigt, ${M.demo.app} zu erteilen. Der Patent-Agent hat die Antwort an das EPA und den Mandantenbericht entworfen. Nichts ging an das EPA oder an den Mandanten.`)}</p>

            <div class="section">
              <div class="section-h"><h2>${t('Deadline', 'Frist')}</h2></div>
              <div class="tbl dl">
                <a class="row" href="${href('3-confirm-deadline')}">${status('deadline.active')}<span class="c strong num">${day(DUE)}</span><span class="c muted hide-sm">${t(`Confirmed by ${P.formal.name}`, `Bestätigt von ${P.formal.name}`)}</span><span class="r" data-due="${DUE}"></span><span class="chev hide-sm" data-i="chev"></span></a>
              </div>
            </div>

            <div class="section">
              <div class="section-h"><h2>${t('Draft reply to the EPO', 'Antwortentwurf an das EPA')}</h2>
                <div class="right">${btn('preview', t('Preview', 'Vorschau'), { icon: 'eye' })}</div>
              </div>
              <div class="file"><span class="doc" data-drawing></span><div><div class="t">${t('Reply to the Rule 71(3) communication', 'Antwort auf die Mitteilung nach Regel 71(3)')}</div><div class="s">${t('Letter to the EPO · English · 1 page, with the claims in German and French', 'Schreiben an das EPA · Englisch · 1 Seite, mit den Ansprüchen auf Deutsch und Französisch')}</div></div></div>
              ${head}
              <div class="stmts">
${reply}
              </div>
            </div>

            <div class="section">
              <div class="section-h"><h2>${t('Client report', 'Mandantenbericht')}</h2>${status('report.proposed')}</div>
              <div class="file"><span class="doc" data-drawing></span><div><div class="t">${t('Client report on the Rule 71(3) communication', 'Mandantenbericht zur Mitteilung nach Regel 71(3)')}</div><div class="s">${t(`To ${M.demo.client} · English · firm template · 1 page`, `An ${M.demo.client} · Englisch · Kanzleivorlage · 1 Seite`)}</div></div></div>
              ${head}
              <div class="stmts">
${report}
              </div>
            </div>
${activity([
    ev('', t(`${b(P.formal.name)} filed the letter on ${M.demo.key}`, `${b(P.formal.name)} hat das Schreiben in ${M.demo.key} abgelegt`), '08:03', 'formal'),
    ev('bot', t(`${b('Patent agent')} started on the letter for ${b(P.attorney.name)}`, `${b('Patent-Agent')} hat für ${b(P.attorney.name)} mit dem Schreiben begonnen`), '08:03'),
    ev('', t(`${b(P.formal.name)} confirmed the deadline ${day(DUE)}`, `${b(P.formal.name)} hat die Frist ${day(DUE)} bestätigt`), '08:04', 'formal'),
    ev('sparkle', t(`${b('Patent agent')} proposed the draft reply and the client report`, `${b('Patent-Agent')} hat den Antwortentwurf und den Mandantenbericht vorgeschlagen`), '08:25'),
    ev('mail', t(`${FL} sent a notice to ${b(P.attorney.name)}`, `${FL} hat ${b(P.attorney.name)} benachrichtigt`), '08:25'),
  ])}
          </div>
${reviewBar(false)}
${reviewBar(true)}
        </div>
        <aside class="props">
          <h3>${t('Matter', 'Akte')}</h3>
          <div class="prop"><span class="k">${t('File number', 'Aktenzeichen')}</span><span class="v num">${M.demo.key}</span></div>
          <div class="prop"><span class="k">${t('Client', 'Mandant')}</span><span class="v">${M.demo.client}</span></div>
          <div class="prop"><span class="k">${t('AI allowed for', 'KI erlaubt für')}</span><span class="v">${t(M.demo.aiWishes[0], M.demo.aiWishes[1])}</span></div>
          <div class="prop"><span class="k">${t('Application', 'Anmeldung')}</span><span class="v num">${M.demo.app}</span></div>
          <h3>${t('People', 'Personen')}</h3>
          <div class="prop"><span class="k">${t('Responsible', 'Verantwortlich')}</span><span class="v">${av('attorney')}${P.attorney.name}</span></div>
          <div class="prop"><span class="k">${t('Formalities', 'Formalitäten')}</span><span class="v">${av('formal')}${P.formal.name}</span></div>
          <h3>${t('Work', 'Arbeit')}</h3>
          <div class="prop"><span class="k">${t('Drafted by', 'Entworfen von')}</span><span class="v"><span class="av sys" data-i="bot"></span>${t('Patent agent', 'Patent-Agent')}</span></div>
          <div class="prop"><span class="k">${t('Finished', 'Fertig')}</span><span class="v num">${t('Today, 08:25', 'Heute, 08:25 Uhr')}</span></div>
          <div class="prop"><span class="k">${t('Letter', 'Schreiben')}</span><span class="v">${t('4 pages, scan', '4 Seiten, Scan')}</span></div>
        </aside>
      </div>` });
  return { body, after: `${overflow(`${mi('calculation', t('Calculation', 'Berechnung'), 'calendar')}${mi('preview', t('Preview', 'Vorschau'), 'eye')}<div class="sep"></div>${mi('', t('Copy link', 'Link kopieren'), 'link')}`)}\n` };
}

// ---------- 5. The dossier, the account menu and search ----------
function dossier() {
  const body = app({ person: 'formal', side: 'matters', fixed: false, body: `${topbar(`<span class="ico hide-sm" data-i="matters"></span><span class="hide-sm">${t('Matters', 'Akten')}</span><span class="sep hide-sm">›</span><span class="here num">${M.demo.key}</span>`, `${findBtn()}<span class="iconbtn hide-sm" data-i="link"></span><span class="iconbtn" data-i="dots"></span>`)}
      <div class="detail">
        <div class="content">
          <h1 class="title">${M.demo.title}</h1>
          <div class="dossier-meta"><span class="num">${M.demo.key}</span><span>${M.demo.client}</span><a href="${M.demo.register}" data-i="external">${M.demo.app}</a><span class="hide-sm">${t('Prosecution', 'Prüfungsverfahren')}</span></div>

          <div class="section">
            <div class="section-h"><h2>${t('What waits', 'Was wartet')}</h2><span class="count">1</span></div>
            <div class="tbl waits">
              <a class="row" href="${href('4-review-work')}">${status('ticket.proposals_ready')}<span class="c"><span class="next-tag">${t('Next step', 'Nächster Schritt')}</span>${t('Review the work', 'Arbeit prüfen')}</span><span class="hide-sm">${who('attorney')}</span><span class="r hide-sm" data-due="${TODAY}"></span><span class="chev hide-sm" data-i="chev"></span></a>
            </div>
            <div class="then" data-i="info">${t(`Then: ${P.attorney.name} sends the client report. That step opens when the decision is recorded.`, `Danach: ${P.attorney.name} sendet den Mandantenbericht. Dieser Schritt öffnet sich, wenn die Entscheidung erfasst ist.`)}</div>
          </div>

          <div class="section">
            <div class="section-h"><h2>${t('Deadlines', 'Fristen')}</h2><span class="count">1</span></div>
            <div class="tbl dl">
              <a class="row" href="${href('3-confirm-deadline')}">${status('deadline.active')}<span class="c"><span class="strong num">${day(DUE)}</span> <span class="muted hide-sm">· ${t('Rule 71(3) EPC', 'Regel 71(3) EPÜ')}</span></span><span class="c muted hide-sm">${t(`Confirmed by ${P.formal.name}`, `Bestätigt von ${P.formal.name}`)}</span><span class="r" data-due="${DUE}"></span><span class="chev hide-sm" data-i="chev"></span></a>
            </div>
          </div>

          <div class="section">
            <div class="section-h"><h2>${t('E-file', 'E-Akte')}</h2><span class="count">2</span></div>
            <div class="tbl efile">
              <a class="row" href="${href('2-file-letter')}">${status('intake.filed')}<span class="c">${t('Rule 71(3) communication', 'Mitteilung nach Regel 71(3)')} <span class="muted hide-sm">· EPO</span></span><span class="c muted hide-sm">${t(`Letter of ${short(LETTER)} · arrived today`, `Schreiben vom ${short(LETTER)} · heute eingegangen`)}</span><span class="r hide-sm">${who('formal')}</span><span class="chev hide-sm" data-i="chev"></span></a>
              <a class="row" href="${href('4-review-work')}">${status('report.proposed')}<span class="c">${t('Client report', 'Mandantenbericht')} <span class="muted hide-sm">· ${t('draft', 'Entwurf')}</span></span><span class="c muted hide-sm">${t('By the patent agent', 'Vom Patent-Agenten')}</span><span class="r num hide-sm">${t('Today', 'Heute')}</span><span class="chev hide-sm" data-i="chev"></span></a>
            </div>
          </div>
${activity([
    ev('', t(`${b(P.lena.name)} handed the matter to ${b(P.attorney.name)}`, `${b(P.lena.name)} hat die Akte an ${b(P.attorney.name)} übergeben`), t('15 Oct', '15. Okt.'), 'lena'),
    ev('scan', t(`${b('Scan mailbox')} delivered a scan of 4 pages`, `${b('Scan-Postfach')} hat einen Scan mit 4 Seiten geliefert`), '08:00'),
    ev('eye', t(`${FL} read the scan twice; both readings agree`, `${FL} hat den Scan zweimal gelesen; beide Lesungen stimmen überein`), '08:02'),
    ev('', t(`${b(P.formal.name)} filed the Rule 71(3) communication`, `${b(P.formal.name)} hat die Mitteilung nach Regel 71(3) abgelegt`), '08:03', 'formal'),
    ev('scale', t(`${FL} computed the deadline ${day(DUE)}`, `${FL} hat die Frist ${day(DUE)} berechnet`), '08:03'),
    ev('', t(`${b(P.formal.name)} confirmed the deadline`, `${b(P.formal.name)} hat die Frist bestätigt`), '08:04', 'formal'),
    ev('sparkle', t(`${b('Patent agent')} proposed the draft reply and the client report for ${b(P.attorney.name)}`, `${b('Patent-Agent')} hat den Antwortentwurf und den Mandantenbericht für ${b(P.attorney.name)} vorgeschlagen`), '08:25'),
  ])}
        </div>
        <aside class="props">
          <h3>${t('Matter', 'Akte')}</h3>
          <div class="prop"><span class="k">${t('File number', 'Aktenzeichen')}</span><span class="v num">${M.demo.key}</span></div>
          <div class="prop"><span class="k">${t('Client', 'Mandant')}</span><span class="v">${M.demo.client}</span></div>
          <div class="prop"><span class="k">${t('AI allowed for', 'KI erlaubt für')}</span><span class="v">${t(M.demo.aiWishes[0], M.demo.aiWishes[1])}</span></div>
          <div class="prop"><span class="k">${t('Language', 'Sprache')}</span><span class="v">${t('English', 'Englisch')}</span></div>
          <h3>${t('People', 'Personen')}</h3>
          <div class="prop"><span class="k">${t('Responsible', 'Verantwortlich')}</span><span class="v">${av('attorney')}${P.attorney.name} <span class="muted">${t('since 15 Oct', 'seit 15. Okt.')}</span></span></div>
          <div class="prop"><span class="k">${t('Formalities', 'Formalitäten')}</span><span class="v">${av('formal')}${P.formal.name}</span></div>
          <div class="prop"><span class="k">${t('Team', 'Team')}</span><span class="v"><span class="stack">${av('attorney')}${av('formal')}${av('lena')}</span></span></div>
          <div class="prop"><span class="k">${t('Wall', 'Sichtbar für')}</span><span class="v">${t('Team and client group', 'Team und Mandantengruppe')}</span></div>
        </aside>
      </div>` });
  const acct = `<div class="menu ctx-menu acct-menu" data-state="account" role="menu">
  <div class="acct-h">${av('formal', 'lg')}<span class="sb-who"><span class="sb-name">${P.formal.name}</span><span class="sb-role">${role('formal')} · Seed firm</span></span></div>
  <div class="sep"></div>
  ${mi('', t('Settings', 'Einstellungen'), 'gear')}
  ${mi('', t('Sign out', 'Abmelden'), 'signout')}
  <div class="acct-foot">${t('After you sign out, Microsoft asks which account signs in next.', 'Nach dem Abmelden fragt Microsoft, welches Konto sich als Nächstes anmeldet.')}</div>
</div>`;
  const hit = (m, mark, sub, on) => `<div class="cmdk-i${on ? ' on' : ''}" data-i="matters"${on ? ' data-act="open"' : ''}><span class="num">${m.key}</span><span class="sub"><span>${m.title}</span><span class="cl">${sub.replace(mark, `<mark>${mark}</mark>`)}</span></span>${on ? `<span class="kbds">${caps('open')}</span>` : ''}</div>`;
  const search = `<div class="scrim" data-state="search" data-modal>
  <div class="cmdk menu">
    <span class="cmdk-ctx" data-i="matters">${t('Matters', 'Akten')}</span>
    <div class="cmdk-in">Phoenix<span class="caret"></span></div>
    <div class="cmdk-g">
      <div class="gh">${t('Matters · client', 'Akten · Mandant')}</div>
      ${hit(M.terminal, 'Phoenix', M.terminal.client, true)}
      ${hit(M.labels, 'Phoenix', M.labels.client, false)}
      <div class="gh">${t('Searches file number, title, client, application number and person. Only matters inside your walls show.', 'Sucht Aktenzeichen, Titel, Mandant, Anmeldenummer und Person. Nur Akten innerhalb Ihrer Wände erscheinen.')}</div>
    </div>
  </div>
</div>`;
  return { body, after: `<div class="drawer-scrim" data-state="account"></div>\n${acct}\n${search}\n` };
}

// ---------- 6. The notice mails: the link opens the decision page; the mail never decides (README decision F2) ----------
function mail({ to, subject, time, lead, facts, cta, link, why }) {
  return `<div class="mail-app">
  <div class="mail-top"><span class="ico-inline" data-i="mail"></span><span>${t('Inbox', 'Posteingang')}</span></div>
  <div class="mail-pane">
    <h1 class="mail-subject">${subject}</h1>
    <div class="mail-from"><span class="logo-av" data-logo></span><div><div class="strong">FlowLeap</div><div class="to">${t('To', 'An')} ${P[to].name}</div></div><time>${t(`Today, ${time}`, `Heute, ${time} Uhr`)}</time></div>
    <div class="mail-body">
      <p>${lead}</p>
      <div class="mail-facts">${facts.map(([k, v]) => `<div class="k">${k}</div><div>${v}</div>`).join('')}</div>
      <div class="mail-cta"><a class="btn btn-primary btn-lg" href="${href(link)}" data-i="external">${cta}</a></div>
      <div class="mail-foot"><p>${t('This mail does not decide anything. The button opens the step in FlowLeap, where you decide.', 'Diese Mail entscheidet nichts. Die Schaltfläche öffnet den Schritt in FlowLeap, dort entscheiden Sie.')}</p><p>${why}</p></div>
    </div>
  </div>
</div>`;
}
const mailFormal = () => mail({
  to: 'formal', time: '08:03', link: '3-confirm-deadline',
  subject: t(`Confirm the Rule 71(3) deadline on ${M.demo.key}, due ${day(DUE)}`, `Frist nach Regel 71(3) in ${M.demo.key} bestätigen, fällig ${day(DUE)}`),
  lead: t(`FlowLeap computed the deadline of the Rule 71(3) communication that you filed at 08:03. Please confirm it today.`, `FlowLeap hat die Frist der Mitteilung nach Regel 71(3) berechnet, die Sie um 08:03 Uhr abgelegt haben. Bitte bestätigen Sie sie heute.`),
  facts: [[t('Matter', 'Akte'), `${M.demo.key} · ${M.demo.title}`], [t('Client', 'Mandant'), M.demo.client], [t('Letter', 'Schreiben'), t(`Rule 71(3) communication of ${day(LETTER)}`, `Mitteilung nach Regel 71(3) vom ${day(LETTER)}`)], [t('Due date', 'Fristende'), `<span class="strong">${day(DUE)}</span>`], [t('Computed', 'Berechnet'), t('Four months, Rule 71(3) EPC; the EPO is open that day', 'Vier Monate, Regel 71(3) EPÜ; das EPA ist an diesem Tag geöffnet')]],
  cta: t('Open the deadline', 'Frist öffnen'),
  why: t('You get this mail because you are the formalities person of the matter and the step is due today.', 'Sie erhalten diese Mail, weil Sie die Formalitäten der Akte betreuen und der Schritt heute fällig ist.'),
});
const mailAttorney = () => mail({
  to: 'attorney', time: '08:25', link: '4-review-work',
  subject: t(`Review the work: Rule 71(3) on ${M.demo.key} (${M.demo.client})`, `Arbeit prüfen: Regel 71(3) in ${M.demo.key} (${M.demo.client})`),
  lead: t(`The Rule 71(3) communication on ${M.demo.key} (${M.demo.client}) is worked. Its deadline, ${day(DUE)}, is confirmed by ${P.formal.name}. The draft reply and the client report wait for you.`, `Die Mitteilung nach Regel 71(3) in ${M.demo.key} (${M.demo.client}) ist bearbeitet. Ihre Frist, ${day(DUE)}, ist von ${P.formal.name} bestätigt. Der Antwortentwurf und der Mandantenbericht warten auf Sie.`),
  facts: [[t('Matter', 'Akte'), `${M.demo.key} · ${M.demo.title}`], [t('Deadline', 'Frist'), t(`${day(DUE)}, active, confirmed by ${P.formal.name}`, `${day(DUE)}, aktiv, bestätigt von ${P.formal.name}`)], [t('Drafts', 'Entwürfe'), t('Reply to the EPO, client report', 'Antwort an das EPA, Mandantenbericht')], [t('Evidence', 'Belege'), t('Each statement quotes the letter', 'Jede Aussage zitiert das Schreiben')]],
  cta: t('Review', 'Prüfen'),
  why: t('You get this mail because you are the responsible attorney of the matter. Nothing went to the EPO or to the client.', 'Sie erhalten diese Mail, weil Sie für die Akte verantwortlich sind. Nichts ging an das EPA oder an den Mandanten.'),
});

const mailSecond = () => mail({
  to: 'lena', time: '08:05', link: '3-confirm-deadline-second',
  subject: t(`Confirm the Rule 71(3) deadline on ${M.demo.key} as the second person, due ${day(DUE)}`, `Frist nach Regel 71(3) in ${M.demo.key} als zweite Person bestätigen, fällig ${day(DUE)}`),
  lead: t(`${P.formal.name} decided the date of the letter, so a second person confirms the deadline. You are on the team of ${M.demo.key}. Please confirm it today.`, `${P.formal.name} hat das Datum des Schreibens entschieden, darum bestätigt eine zweite Person die Frist. Sie sind im Team von ${M.demo.key}. Bitte bestätigen Sie sie heute.`),
  facts: [[t('Matter', 'Akte'), `${M.demo.key} · ${M.demo.title}`], [t('Client', 'Mandant'), M.demo.client], [t('Letter', 'Schreiben'), t(`Rule 71(3) communication of ${day(LETTER)}`, `Mitteilung nach Regel 71(3) vom ${day(LETTER)}`)], [t('Due date', 'Fristende'), `<span class="strong">${day(DUE)}</span>`], [t('Date decided', 'Datum entschieden'), t(`By ${P.formal.name}: the readings differed, page 1 has two dates`, `Von ${P.formal.name}: die Lesungen wichen ab, Seite 1 hat zwei Daten`)]],
  cta: t('Open the deadline', 'Frist öffnen'),
  why: t('You get this mail because the person who decides a date never confirms it, and you may confirm deadlines on this matter.', 'Sie erhalten diese Mail, weil die Person, die ein Datum entscheidet, es nie bestätigt, und Sie in dieser Akte Fristen bestätigen dürfen.'),
});

// ---------- write ----------
const PAGES = [
  ['1-my-work-formalities', () => t('My work', 'Meine Arbeit'), () => myWork({ person: 'formal', time: '08:01', states: true, rows: formalRows() })],
  ['1-my-work-attorney', () => t('My work', 'Meine Arbeit'), () => myWork({ person: 'attorney', time: '08:24', rows: attorneyRows() })],
  ['2-file-letter', () => t('File this letter', 'Dieses Schreiben ablegen'), fileLetter],
  ['3-confirm-deadline', () => t('Confirm the deadline', 'Frist bestätigen'), () => confirmDeadline({ person: 'formal' })],
  ['3-confirm-deadline-second', () => t('Confirm the deadline', 'Frist bestätigen'), () => confirmDeadline({ person: 'lena' })],
  ['4-review-work', () => t('Review the work', 'Arbeit prüfen'), reviewWork],
  ['5-dossier', () => M.demo.key, dossier],
  ['6-mail-formalities', () => t(`Notice mail to ${P.formal.name}`, `Nachricht an ${P.formal.name}`), () => ({ body: mailFormal() })],
  ['6-mail-attorney', () => t(`Notice mail to ${P.attorney.name}`, `Nachricht an ${P.attorney.name}`), () => ({ body: mailAttorney() })],
  ['6-mail-second', () => t(`Notice mail to ${P.lena.name}`, `Nachricht an ${P.lena.name}`), () => ({ body: mailSecond() })],
];
for (const l of ['en', 'de']) {
  lang = l;
  for (const [name, title, render] of PAGES) {
    const { body, after } = render();
    writeFileSync(path.join(OUT, `${name}${l === 'de' ? '.de' : ''}.html`), page({ name, title: title(), body, after }));
  }
}
console.log(`build: wrote ${PAGES.length * 2} pages`);
