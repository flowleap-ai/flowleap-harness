// Writes the client folder mockups, each page in English (<name>.html) and German (<name>.de.html), from this one
// source. Usage: node build.mjs. Edit this file, never the generated HTML. The folder data is a snapshot of the demo
// folder ~/flowleap-demo/Syntegon of 2026-11-08 (demo loop 4): the real folder and file names and sizes.
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const OUT = import.meta.dirname;
const RECORDS_CSS = '../../../../.agents/skills/flowleap-design-language/references/mockups/records.css';

// ---------- data: the Syntegon client folder ----------
const CLIENT = 'Syntegon';
const FAMILIES = [
  ['Apparatus for the automated processing of dishes with a lid (+1) (priority DE 10 2023 133 973, 05.12.2023)', ['EP 24 817 871', 'EP 24 817 872']],
  ['Container carrier for carrying a multiplicity of containers (priority DE 10 2023 117 585, 04.07.2023)', ['EP 24 735 552']],
  ['Device for adapting a distance between containers (priority DE 10 2025 103 512, 30.01.2025)', ['EP 26 153 983']],
  ['Device for coating an object with a silicone coating (priority DE 10 2022 104 872, 02.03.2022)', ['EP 23 709 335']],
  ['Device for providing stoppers for closing containers (priority DE 10 2025 116 774, 30.04.2025)', ['EP 26 173 840']],
  ['Device for taking air samples in a clean room (priority DE 10 2023 122 028, 17.08.2023)', ['EP 24 758 162']],
  ['Device for the visualisation of gas flows in a room, especially in a clean room (priority DE 10 2024 117 673, 24.06.2024)', ['EP 25 183 540']],
  ['Method and apparatus for producing a packaging element (priority DE 10 2022 111 528, 09.05.2022)', ['EP 23 171 862']],
  ['Method and device for joining or forming a fibre-based packing material and packaging machine for producing a packaging (priority DE 10 2023 125 343, 19.09.2023)', ['EP 24 199 601']],
  ['Method for sealing a stack of layers of a fibre-based packaging material (priority DE 10 2022 133 074, 13.12.2022)', ['EP 23 215 725']],
  ['Packaging machine with a system for detecting a packaging element (priority DE 10 2024 131 911, 31.10.2024)', ['EP 25 210 820']],
  ['Pinch valve for a filling device for filling containers with pharmaceutical contents, filling device and method for filling containers with pharmaceutical contents (priority DE 10 2023 124 084, 07.09.2023)', ['EP 24 768 012']],
  ['System for filling containers with contents, with fill level monitoring (priority DE 10 2024 108 756, 27.03.2024)', ['EP 25 712 875']],
  ['System for filling containers with contents, with fill level monitoring (priority DE 10 2024 108 758, 27.03.2024)', ['EP 25 712 876']],
  ['System for filling filling material into containers with fill level monitoring (priority DE 10 2024 108 759, 27.03.2024)', ['EP 25 712 877']],
];
// The demo matter: the family of EP 23 171 862 and its six template folders.
const FAM = FAMILIES[7][0];
const MATTER = 'EP 23 171 862';
const TEMPLATE = ['Associates', 'Client', 'Drafts', 'Internal', 'Office', 'Search'];
const MAIL = '2026-11-06 SAMPLE client mail - search report question.eml';
const PDF = 'EP 4 292 805 A1.pdf';
const BUILT = '2026-11-08';
// Uploads of the drop state: the cited documents D1 and D2 of the search report, and a second Search report.md.
const D1 = 'D1 DE 20 2022 100 041 U1.pdf', D2 = 'D2 US 2021300609 A1.pdf';
// The person at the keyboard; the cast of the design language's reference mockups.
const PERSON = 'Dr. Anna Becker';

let lang = 'en';
const t = (en, de) => (lang === 'de' ? de : en);

// ---------- words ----------
const SRC = {
  add: () => t('Add client', 'Mandant hinzufügen'),
  register: () => t('EP Register', 'EP-Register'),
  pubserver: () => t('EPO publication server', 'EPA-Veröffentlichungsserver'),
  ops: () => t('EPO OPS', 'EPA OPS'),
  sample: () => t('Demo sample', 'Demo-Beispiel'),
  person: () => PERSON,
};
const KIND = {
  folder: () => t('Folder', 'Ordner'), family: () => t('Family', 'Familie'), matter: () => t('Matter', 'Akte'), pdf: () => t('PDF document', 'PDF-Dokument'), md: () => 'Markdown', mail: () => t('Mail', 'E-Mail'),
};
const ICON = { folder: 'folder', family: 'folder', matter: 'folder', pdf: 'pdf', md: 'md', mail: 'mail' };
const MO = { en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], de: ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'] };
const date = iso => { const [y, m, d] = iso.split('-').map(Number); return lang === 'de' ? `${d}. ${MO.de[m - 1]} ${y}` : `${d} ${MO.en[m - 1]} ${y}`; };
const today = hm => t(`Today, ${hm}`, `Heute, ${hm}`);
const matters = n => (n === 1 ? t('1 matter', '1 Akte') : t(`${n} matters`, `${n} Akten`));
const items = n => (n === 0 ? t('Empty', 'Leer') : n === 1 ? t('1 item', '1 Element') : t(`${n} items`, `${n} Elemente`));
const bytes = n => (n < 1000 ? `${n} ${t('bytes', 'Byte')}` : n < 1e6 ? `${Math.round(n / 1000)} KB` : `${(n / 1e6).toFixed(1).replace('.', t('.', ','))} MB`);
/** A file or folder name from disk: data, not product copy, so the copy deny-list does not apply (data-verbatim). */
const nm = s => `<span data-verbatim>${s}</span>`;
const ask = () => t('Ask about this', 'Hierzu fragen');

// ---------- parts ----------
const page = ({ title, body, after = '' }) => `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<!-- Generated from build.mjs: edit that file and run node build.mjs, never this file -->
<link rel="stylesheet" href="${RECORDS_CSS}">
<link rel="stylesheet" href="client-folder.css">
</head>
<body>
${body}
${after}<script src="frame.js"></script>
</body>
</html>
`;
const app = ({ side = 'clients', session = '', body }) => `<div class="app">
  <nav data-sidebar="${side}"${session ? ` data-session="${session}"` : ''}></nav>
  <main class="main">
    <section class="panel fixed">
${body}
    </section>
  </main>
</div>`;
// The keys of the page's acts (keys.md, founder decision 3); a button or menu item of an act carries its data-act and keycap.
const KEYS = { ask: 'A', 'new-folder': '⇧N', upload: 'U', rename: 'F2', move: '⇧M', open: '↵', retry: 'R' };
const kbd = act => `<span class="kbd">${KEYS[act]}</span>`;
const btn = (label, { kind = 'secondary', icon = '', cls = '', attrs = '', act = '' } = {}) =>
  `<span class="btn btn-${kind}${cls ? ` ${cls}` : ''}"${icon ? ` data-i="${icon}"` : ''}${act ? ` data-act="${act}"` : ''} role="button"${attrs}>${label}${act ? ` ${kbd(act)}` : ''}</span>`;
const mi = (act, icon, label) => `<div class="mi" data-i="${icon}"${act ? ` data-act="${act}"` : ''}>${label}${act ? `<span class="kbds">${kbd(act)}</span>` : ''}</div>`;
const iconbtn = (icon, label, cls = '') => `<span class="iconbtn${cls ? ` ${cls}` : ''}" data-i="${icon}" role="button" aria-label="${label}"></span>`;
const crumbs = (trail, here) => `${trail.length ? iconbtn('back', t('Up one folder', 'Einen Ordner höher'), 'only-sm') : ''}${iconbtn('tree', t('Show the folders', 'Ordner zeigen'), 'only-sm')}<span class="ico hide-sm" data-i="clients"></span><span class="hide-sm">${t('Clients', 'Mandanten')}</span>${trail.map(c => `<span class="sep hide-sm">›</span>${c === '…' ? iconbtn('dots', t('Show the folders between', 'Ordner dazwischen zeigen'), 'hide-sm') : `<span class="lvl hide-sm">${nm(c)}</span>`}`).join('')}<span class="sep hide-sm">›</span><span class="here">${nm(here)}</span>`;
const folderActs = ({ primary = true } = {}) => `${iconbtn('search', t('Find in this folder', 'In diesem Ordner suchen'), 'hide-sm')}${btn(t('New folder', 'Neuer Ordner'), { icon: 'newfolder', cls: 'hide-sm', act: 'new-folder' })}${btn(t('Upload files', 'Dateien hochladen'), { icon: 'upload', cls: 'hide-sm', act: 'upload' })}<span class="more" data-overflow="more-menu">${iconbtn('dots', t('More acts', 'Weitere Aktionen'))}</span>${primary ? btn(ask(), { kind: 'primary', icon: 'ask', act: 'ask' }) : ''}`;
const topbar = (crumbHtml, right) => `      <header class="topbar">
        <div class="crumbs">${crumbHtml}</div>
        <div class="bar-right">${right}</div>
      </header>`;
const overflow = () => `<div class="menu ctx-menu overflow-menu" id="more-menu" data-state="more" role="menu">
  ${mi('new-folder', 'newfolder', t('New folder', 'Neuer Ordner'))}
  ${mi('upload', 'upload', t('Upload files', 'Dateien hochladen'))}
  <div class="mi" data-i="search">${t('Find in this folder', 'In diesem Ordner suchen')}</div>
</div>`;

// The tree: [depth, kind, name, open, selected] rows; a folder row has a chevron, a file row has none.
const node = ([d, kind, name, open = false, sel = false, target = false]) =>
  `<div class="row node d${d}${sel ? ' is-selected' : ''}${target ? ' is-target' : ''}" title="${name}" data-verbatim>${'<span></span>'.repeat(d ? 1 : 0)}<span class="tw" data-i="${kind === 'folder' ? (open ? 'chevd' : 'chev') : ''}"></span><span class="fi" data-i="${kind === 'folder' && open ? 'folderopen' : ICON[kind]}"></span><span class="t">${nm(name)}</span></div>`;
const tree = rows => `        <nav class="tree list" aria-label="${t('Folders', 'Ordner')}">${rows.map(node).join('')}</nav>`;
/** The client folder with the demo family open down to the given depth; sel names the selected row. */
const clientTree = ({ open = 0, sel = CLIENT, target = '', files = [] } = {}) => {
  const rows = [[0, 'folder', CLIENT, true, sel === CLIENT], [1, 'folder', '00 Client', open === 'client', sel === '00 Client']];
  if (open === 'client') rows.push([2, 'mail', MAIL, false, sel === MAIL]);
  for (const [f] of FAMILIES) {
    const isFam = f === FAM;
    rows.push([1, 'folder', f, isFam && open >= 1, sel === f]);
    if (isFam && open >= 1) {
      rows.push([2, 'folder', MATTER, open >= 2, sel === MATTER]);
      if (open >= 2) for (const s of TEMPLATE) {
        const withFiles = open >= 3 && files.some(x => x[0] === s);
        rows.push([3, 'folder', s, withFiles, sel === s, target === s]);
        if (withFiles) for (const [, fn, k] of files.filter(x => x[0] === s)) rows.push([4, k, fn, false, sel === fn]);
      }
      rows.push([2, 'md', 'Family members.md', false, false]);
    }
  }
  return tree(rows);
};
const OFFICE_FILES = [['Office', 'A1 claims.md', 'md'], ['Office', PDF, 'pdf'], ['Office', 'EP-Register.md', 'md']];

/** One row of the file list. cells: [kind, name, size, modified, source]. */
const row = ({ kind, name, size, mod, src, sel = false, checked = false, ctx = false, isNew = false, extra = '', nameHtml = '' }) =>
  `<div class="row${sel ? ' is-selected' : ''}${checked ? ' is-checked' : ''}${ctx ? ' is-context' : ''}${isNew ? ' is-new' : ''}"${extra}>
            <span class="lead"><span class="fi" data-i="${ICON[kind]}"></span><span class="sel"><span class="check${checked ? ' on' : ''}" data-i="${checked ? 'check' : ''}"></span></span></span>
            <span class="t">${nameHtml || nm(name)}</span><span class="c">${KIND[kind]()}</span><span class="c">${size}</span><span class="c sm">${mod}</span><span class="c${src === PERSON ? ' who' : ''}">${src}</span>
          </div>`;
const thead = () => `<div class="thead"><span></span><span>${t('Name', 'Name')}</span><span>${t('Kind', 'Art')}</span><span>${t('Size', 'Größe')}</span><span>${t('Modified', 'Geändert')}</span><span>${t('Source', 'Quelle')}</span></div>`;
const group = (label, n) => `<div class="group">${label} <span class="count num">${n}</span></div>`;
const list = (groups, cls = '') => `<div class="list files${cls ? ` ${cls}` : ''}">${thead()}${groups.filter(g => g.rows.length).map(g => `${group(g.label, g.rows.length)}${g.rows.join('')}`).join('')}</div>`;
const head = (title, lede) => `<div class="fv-head"><h1 class="title">${nm(title)}</h1><p class="lede">${lede}</p></div>`;
const skeleton = () => `<div class="list files">${thead()}${['w50', 'w70', 'w60', 'w30', 'w60', 'w50', 'w70'].map(w => `<div class="row"><span class="skel dot"></span><span class="skel ${w}"></span><span class="skel w60"></span><span class="skel w50"></span><span class="skel w60"></span><span class="skel w70"></span></div>`).join('')}</div>`;
const errorNotice = asOf => `<div class="error-bar"><div class="notice bad" role="alert" data-i="warn"><span class="lead">${t('The folder could not be read.', 'Der Ordner konnte nicht gelesen werden.')}</span><span>${t(`The list shows it as of ${asOf}.`, `Die Liste zeigt den Stand von ${asOf}.`)}</span><span class="spacer"></span><span class="btn btn-secondary" data-i="retry" data-act="retry" role="button">${t('Try again', 'Erneut versuchen')} <span class="kbd">R</span></span></div></div>`;

// ---------- the client folder: families, the client mail folder, and two files ----------
const clientRows = ({ checked = [], ctx = '' } = {}) => ({
  folders: [
    row({ kind: 'folder', name: '00 Client', size: items(1), mod: date(BUILT), src: SRC.add(), checked: checked.includes('00 Client'), ctx: ctx === '00 Client' }),
    ...FAMILIES.map(([f, ms]) => row({ kind: 'family', name: f, size: matters(ms.length), mod: date(BUILT), src: SRC.add(), checked: checked.includes(f), ctx: ctx === f })),
  ],
  files: [
    row({ kind: 'md', name: 'About this folder.md', size: bytes(767), mod: date(BUILT), src: SRC.add() }),
    row({ kind: 'md', name: 'Reference - 256 at other firms.md', size: bytes(691), mod: date(BUILT), src: SRC.register() }),
  ],
});
const ctxMenu = (what = 'folder') => `<div class="menu ctx-menu ctx-at" data-state="context" role="menu">
  <div class="mi on" data-i="${what === 'folder' ? 'folderopen' : 'eye'}" data-act="open">${t('Open', 'Öffnen')}<span class="kbds"><span class="kbd">↵</span></span></div>
  ${mi('ask', 'ask', ask())}
  <div class="sep"></div>
  ${mi('rename', 'pen', t('Rename', 'Umbenennen'))}
  ${mi('move', 'move', t('Move to…', 'Verschieben nach …'))}
  <div class="sep"></div>
  <div class="mi" data-i="external">${t('Show in Finder', 'Im Finder zeigen')}</div>
  <div class="mi" data-i="copy">${t('Copy path', 'Pfad kopieren')}</div>
</div>`;
const bulkBar = n => `<div class="bulk-dock" data-state="select">
            <div class="decision bulk" data-bulk>
              <div class="decision-f">
                ${iconbtn('x', t('Clear the selection', 'Auswahl aufheben'))}<span class="lbl">${t(`${n} selected`, `${n} ausgewählt`)}</span>
                <div class="acts">
                  ${btn(t('Move to…', 'Verschieben nach …'), { kind: 'ghost', icon: 'move', act: 'move' })}
                  ${btn(t(`Ask about these ${n}`, `Zu diesen ${n} fragen`), { kind: 'primary', icon: 'ask', act: 'ask' })}
                </div>
              </div>
            </div>
          </div>`;

function clientFolder() {
  const lede = t('Client folder · 15 families with 16 matters at your firm', 'Mandantenordner · 15 Familien mit 16 Akten Ihrer Kanzlei');
  const base = clientRows();
  const sel = clientRows({ checked: [FAMILIES[0][0], FAMILIES[2][0]] });
  const ctx = clientRows({ ctx: FAM });
  const groups = r => [{ label: t('Folders', 'Ordner'), rows: r.folders }, { label: t('Files', 'Dateien'), rows: r.files }];
  const body = `${topbar(crumbs([], CLIENT), `<span class="cset" data-state="default loading error context more">${folderActs()}</span><span class="cset" data-state="select">${folderActs({ primary: false })}</span>`)}
      <div class="fp">
${clientTree()}
        <div class="mid">
          <div class="fv" data-state="default more">${head(CLIENT, lede)}${list(groups(base))}</div>
          <div class="fv" data-state="context">${head(CLIENT, lede)}${list(groups(ctx), 'ctx-open')}</div>
          <div class="fv" data-state="select">${head(CLIENT, lede)}${list(groups(sel), 'selecting')}</div>
          <div class="fv" data-state="loading">${head(CLIENT, lede)}${skeleton()}</div>
          <div class="fv" data-state="error">${errorNotice('14:16')}${head(CLIENT, lede)}${list(groups(base))}</div>
          ${bulkBar(2)}
        </div>
      </div>`;
  return page({ title: t('Client folder: Syntegon', 'Mandantenordner: Syntegon'), body: app({ body }), after: `${ctxMenu()}\n${overflow()}\n` });
}

// ---------- a matter folder: the Office folder with its files; the matter root; an empty Drafts folder ----------
function matterFolder() {
  const office = [
    row({ kind: 'md', name: 'A1 claims.md', size: bytes(5155), mod: date(BUILT), src: SRC.pubserver() }),
    row({ kind: 'pdf', name: PDF, size: bytes(389316), mod: date(BUILT), src: SRC.pubserver() }),
    row({ kind: 'md', name: 'EP-Register.md', size: bytes(889), mod: date(BUILT), src: SRC.register() }),
  ];
  const counts = { Associates: 0, Client: 0, Drafts: 0, Internal: 0, Office: 3, Search: 1 };
  const subs = TEMPLATE.map(s => row({ kind: 'folder', name: s, size: items(counts[s]), mod: date(BUILT), src: SRC.add() }));
  const famLede = nm(FAM);
  const empty = `<div class="empty"><div class="empty-in"><div class="empty-art" data-i="folder"></div><h2>${t('Nothing in Drafts yet', 'Noch nichts in Drafts')}</h2><p>${t('Drop files here, or upload them. A draft that the agent writes for this matter also goes here.', 'Legen Sie Dateien hier ab oder laden Sie sie hoch. Ein Entwurf, den der Agent für diese Akte schreibt, kommt auch hierher.')}</p>${btn(t('Upload files', 'Dateien hochladen'), { icon: 'upload', act: 'upload' })}</div></div>`;
  const body = `${topbar(`<span class="cset" data-state="default loading error more tree">${crumbs([CLIENT, '…', MATTER], 'Office')}</span><span class="cset" data-state="matter">${crumbs([CLIENT, '…'], MATTER)}</span><span class="cset" data-state="empty">${crumbs([CLIENT, '…', MATTER], 'Drafts')}</span>`, folderActs())}
      <div class="fp">
        <span class="cset" data-state="default loading error more tree">${clientTree({ open: 3, sel: 'Office', files: OFFICE_FILES })}</span>
        <span class="cset" data-state="matter">${clientTree({ open: 2, sel: MATTER })}</span>
        <span class="cset" data-state="empty">${clientTree({ open: 2, sel: 'Drafts' })}</span>
        <div class="mid">
          <div class="fv" data-state="default more tree">${head('Office', `${MATTER} · ${famLede}`)}${list([{ label: t('Files', 'Dateien'), rows: office }])}</div>
          <div class="fv" data-state="matter">${head(MATTER, famLede)}${list([{ label: t('Folders', 'Ordner'), rows: subs }])}</div>
          <div class="fv" data-state="empty">${head('Drafts', `${MATTER} · ${famLede}`)}${empty}</div>
          <div class="fv" data-state="loading">${head('Office', `${MATTER} · ${famLede}`)}${skeleton()}</div>
          <div class="fv" data-state="error">${errorNotice('14:16')}${head('Office', `${MATTER} · ${famLede}`)}${list([{ label: t('Files', 'Dateien'), rows: office }])}</div>
        </div>
      </div>`;
  return page({ title: t('Matter folder: EP 23 171 862', 'Aktenordner: EP 23 171 862'), body: app({ body }), after: `${overflow()}\n` });
}

// ---------- a file open in the middle: the PDF, a Markdown file, the client mail ----------
function fileOpen() {
  const pdfHead = `<div class="pv-head"><div><h1 class="title">${nm(PDF)}</h1><div class="pv-meta"><span>${KIND.pdf()}</span><span>${bytes(389316)}</span><span>${SRC.pubserver()}</span><span>${date(BUILT)}</span></div></div>
            <div class="pv-tools"><span class="pager num">1 / 21</span>${iconbtn('zoomout', t('Zoom out', 'Verkleinern'))}${iconbtn('zoomin', t('Zoom in', 'Vergrößern'))}${iconbtn('external', t('Open in the system app', 'In der Systemanwendung öffnen'), 'hide-sm')}${btn(ask(), { kind: 'primary', icon: 'ask', act: 'ask' })}</div></div>`;
  const pdfBody = `<div class="pv-body"><div class="letter scan" data-verbatim><img src="scan/ep-4-292-805-a1-page-1.webp" alt="${t('Page 1 of EP 4 292 805 A1', 'Seite 1 von EP 4 292 805 A1')}" width="909" height="1286"></div></div>`;
  const mdHead = `<div class="pv-head"><div><h1 class="title">${nm('Search report.md')}</h1><div class="pv-meta"><span>Markdown</span><span>${bytes(2157)}</span><span>${SRC.pubserver()}</span><span>${date(BUILT)}</span></div></div>
            <div class="pv-tools">${iconbtn('external', t('Open in the system app', 'In der Systemanwendung öffnen'), 'hide-sm')}${btn(ask(), { kind: 'primary', icon: 'ask', act: 'ask' })}</div></div>`;
  const cl = (n, x, a) => `<tr><td>${n}</td><td>${x}</td><td>${a}</td></tr>`;
  const mdBody = `<div class="pv-body"><article class="md" data-verbatim>
            <p class="src">Source: EPO publication server. The search report is part of the A1 publication of 20.12.2023. Search completed: 08.11.2023.</p>
            <table><thead><tr><th></th><th>Document</th><th>Category (claims)</th><th>Date</th></tr></thead><tbody>
              <tr><td>D1</td><td>DE 20 2022 100 041 U1</td><td>X (claims 1-3,5,10,14,15); A (claims 4,6-9,11-13)</td><td>17.01.2022</td></tr>
              <tr><td>D2</td><td>US 2021300609 A1</td><td>X (claims 1-5,7-10,13-15); A (claims 6,11,12)</td><td>30.09.2021</td></tr>
              <tr><td>D3</td><td>DE 10 2017 105 119 A1</td><td>X (claims 1,3-5,7,8,10-13,15); A (claims 2,6,9,14)</td><td>13.09.2018</td></tr>
              <tr><td>D4</td><td>US 6126585 A</td><td>X (claims 1,2,4,6-8,15); A (claims 3,5,9-14)</td><td>03.10.2000</td></tr>
            </tbody></table>
            <h2>Each claim and its documents</h2>
            <p>Computed by the build script from the table above (not by a person or a model). 15 claims. Claims with no X document: none.</p>
            <table><thead><tr><th>Claim</th><th>X</th><th>A</th></tr></thead><tbody>
              ${cl(1, 'D1, D2, D3, D4', 'none')}${cl(2, 'D1, D2, D4', 'D3')}${cl(3, 'D1, D2, D3', 'D4')}${cl(6, 'D4', 'D1, D2, D3')}${cl(9, 'D2', 'D1, D3, D4')}${cl(11, 'D3', 'D1, D2, D4')}${cl(12, 'D3', 'D1, D2, D4')}
            </tbody></table>
          </article></div>`;
  const mailHead = `<div class="pv-head"><div><h1 class="title">${nm('SAMPLE - EP 23 171 862 (EP 4 292 805): status and search report')}</h1><div class="pv-meta"><span>${KIND.mail()}</span><span>${bytes(715)}</span><span>${SRC.sample()}</span><span>${nm(MAIL)}</span></div></div>
            <div class="pv-tools">${iconbtn('external', t('Open in the system app', 'In der Systemanwendung öffnen'), 'hide-sm')}${btn(ask(), { kind: 'primary', icon: 'ask', act: 'ask' })}</div></div>`;
  const mailBody = `<div class="pv-body"><div class="mail-facts"><div class="k">${t('From', 'Von')}</div><div data-address>SAMPLE Sender &lt;ip-sample@example.invalid&gt;</div><div class="k">${t('To', 'An')}</div><div data-address>SAMPLE Attorney &lt;attorney-sample@example.invalid&gt;</div><div class="k">${t('Date', 'Datum')}</div><div>${t('Friday, 6 November 2026, 09:14', 'Freitag, 6. November 2026, 09:14')}</div></div>
            <div class="mail-body" data-verbatim>THIS IS A SAMPLE MAIL FOR THE DEMO. IT IS NOT A REAL MAIL FROM THE CLIENT.

Dear colleagues,

our product team asks about the packaging element application EP 23 171 862.
1. Where does the examination stand, and is a time limit open?
2. The search report cites a utility model and a US application. Which claims are still free of X documents?
3. Do we need a decision from our side before the end of the year?

Best regards
SAMPLE Sender
IP department (SAMPLE)</div></div>`;
  const body = `${topbar(`<span class="cset" data-state="default more">${crumbs([CLIENT, '…', MATTER, 'Office'], PDF)}</span><span class="cset" data-state="markdown">${crumbs([CLIENT, '…', MATTER, 'Search'], 'Search report.md')}</span><span class="cset" data-state="mail">${crumbs([CLIENT, '00 Client'], MAIL)}</span>`, `<span class="more" data-overflow="more-menu">${iconbtn('dots', t('More acts', 'Weitere Aktionen'))}</span>`)}
      <div class="fp">
        <span class="cset" data-state="default more">${clientTree({ open: 3, sel: PDF, files: OFFICE_FILES })}</span>
        <span class="cset" data-state="markdown">${clientTree({ open: 3, sel: 'Search report.md', files: [['Search', 'Search report.md', 'md']] })}</span>
        <span class="cset" data-state="mail">${clientTree({ open: 'client', sel: MAIL })}</span>
        <div class="mid">
          <div class="pv" data-state="default more">${pdfHead}${pdfBody}</div>
          <div class="pv" data-state="markdown">${mdHead}${mdBody}</div>
          <div class="pv" data-state="mail">${mailHead}${mailBody}</div>
        </div>
      </div>`;
  const more = `<div class="menu ctx-menu overflow-menu" id="more-menu" data-state="more" role="menu">
  <div class="mi" data-i="external">${t('Open in the system app', 'In der Systemanwendung öffnen')}</div>
  ${mi('rename', 'pen', t('Rename', 'Umbenennen'))}
  ${mi('move', 'move', t('Move to…', 'Verschieben nach …'))}
  <div class="mi" data-i="copy">${t('Copy path', 'Pfad kopieren')}</div>
</div>`;
  return page({ title: t('File open: EP 4 292 805 A1', 'Datei offen: EP 4 292 805 A1'), body: app({ body }), after: `${more}\n` });
}

// ---------- a drop on the Search folder: dragging, adding, a name conflict, done ----------
function drop() {
  const report = row({ kind: 'md', name: 'Search report.md', size: bytes(2157), mod: date(BUILT), src: SRC.pubserver() });
  const adding = (name, p) => `<div class="row is-new">
            <span class="lead"><span class="fi" data-i="pdf"></span></span>
            <span class="t">${nm(name)}</span><span class="c">${KIND.pdf()}</span><span class="c"><span class="prog"><span class="${p}"></span></span></span><span class="c sm">${t('Adding…', 'Wird hinzugefügt …')}</span><span class="c who">${PERSON}</span>
          </div>`;
  const added = [
    row({ kind: 'pdf', name: D1, size: '1.2 MB'.replace('.', t('.', ',')), mod: today('14:02'), src: PERSON, isNew: true }),
    row({ kind: 'pdf', name: D2, size: '2.4 MB'.replace('.', t('.', ',')), mod: today('14:02'), src: PERSON, isNew: true }),
    report,
    row({ kind: 'md', name: 'Search report 2.md', size: bytes(3410), mod: today('14:02'), src: PERSON, isNew: true }),
  ];
  const lede = `${MATTER} · ${nm(FAM)}`;
  const body = `${topbar(crumbs([CLIENT, '…', MATTER], 'Search'), folderActs())}
      <div class="fp">
        <span class="cset" data-state="default">${clientTree({ open: 2, sel: 'Search', target: 'Search' })}</span>
        <span class="cset" data-state="adding conflict done more">${clientTree({ open: 2, sel: 'Search' })}</span>
        <div class="mid">
          <div class="fv is-drop" data-state="default">${head('Search', lede)}${list([{ label: t('Files', 'Dateien'), rows: [report] }])}
            <div class="drop-hint"><div class="notice" data-i="upload">${t('Drop to add 3 files to Search', '3 Dateien in Search ablegen')}</div></div></div>
          <div class="fv" data-state="adding conflict more">${head('Search', lede)}${list([{ label: t('Files', 'Dateien'), rows: [adding(D1, 'p64'), adding(D2, 'p20'), report] }])}</div>
          <div class="fv" data-state="done">${head('Search', lede)}${list([{ label: t('Files', 'Dateien'), rows: added }])}</div>
        </div>
      </div>`;
  const ghost = `<div class="ghost" data-state="default" aria-hidden="true"><div class="file"><span class="ico-inline" data-i="pdf"></span><div><div class="t">${t('3 files', '3 Dateien')}</div><div class="s">${nm(`${D1}, ${D2}, Search report.md`)}</div></div></div></div>`;
  const conflict = `<div class="dialog-scrim" data-state="conflict" data-modal><div class="menu dialog" role="dialog" aria-modal="true" aria-labelledby="conflict-h">
  <div class="dialog-h"><h2 id="conflict-h">${t(`${nm('Search report.md')} is already in Search`, `${nm('Search report.md')} ist schon in Search`)}</h2><p>${t(`FlowLeap never replaces a file. Keep both adds the new file as ${nm('Search report 2.md')}.`, `FlowLeap ersetzt nie eine Datei. Beide behalten legt die neue Datei als ${nm('Search report 2.md')} ab.`)}</p></div>
  <div class="dialog-f">${btn(t('Skip this file', 'Diese Datei überspringen'), { kind: 'ghost' })}${btn(t('Keep both', 'Beide behalten'), { kind: 'primary' })}</div>
</div></div>`;
  const toast = `<div class="toast" role="status" data-state="done" data-i="check">${t('3 files added to Search', '3 Dateien zu Search hinzugefügt')}</div>`;
  return page({ title: t('Drop files on a folder', 'Dateien auf einen Ordner ziehen'), body: app({ body }), after: `${ghost}\n${conflict}\n${toast}\n${overflow()}\n` });
}

// ---------- organize: a new folder being named, a name error, rename, move ----------
function organize() {
  const counts = { Associates: 0, Client: 0, Drafts: 0, Internal: 0, Office: 3, Search: 1 };
  const subs = TEMPLATE.map(s => row({ kind: 'folder', name: s, size: items(counts[s]), mod: date(BUILT), src: SRC.add() }));
  const field = (value, kind = 'folder', err = '') => `<div class="row is-new edit">
            <span class="lead"><span class="fi" data-i="${ICON[kind]}"></span></span>
            <span class="t"><input class="input name-field" value="${value}" aria-label="${t('Name', 'Name')}" data-verbatim>${err}</span><span class="c">${KIND[kind]()}</span><span class="c">${kind === 'md' ? bytes(5155) : items(0)}</span><span class="c sm">${kind === 'md' ? date(BUILT) : today('14:05')}</span><span class="c${kind === 'md' ? '' : ' who'}">${kind === 'md' ? SRC.pubserver() : PERSON}</span>
          </div>`;
  const err = `<span class="menu name-error" role="tooltip" data-i="warn">${t('A folder named Office is already here.', 'Ein Ordner namens Office ist schon hier.')}</span>`;
  const lede = nm(FAM);
  const office = [
    row({ kind: 'pdf', name: PDF, size: bytes(389316), mod: date(BUILT), src: SRC.pubserver() }),
    row({ kind: 'md', name: 'EP-Register.md', size: bytes(889), mod: date(BUILT), src: SRC.register() }),
  ];
  const client = [row({ kind: 'mail', name: MAIL, size: bytes(715), mod: date(BUILT), src: SRC.sample(), sel: true })];
  const body = `${topbar(`<span class="cset" data-state="default invalid more">${crumbs([CLIENT, '…'], MATTER)}</span><span class="cset" data-state="rename">${crumbs([CLIENT, '…', MATTER], 'Office')}</span><span class="cset" data-state="move">${crumbs([CLIENT], '00 Client')}</span>`, folderActs())}
      <div class="fp">
        <span class="cset" data-state="default invalid more">${clientTree({ open: 2, sel: MATTER })}</span>
        <span class="cset" data-state="rename">${clientTree({ open: 2, sel: 'Office' })}</span>
        <span class="cset" data-state="move">${clientTree({ open: 'client', sel: '00 Client' })}</span>
        <div class="mid">
          <div class="fv" data-state="default more">${head(MATTER, lede)}${list([{ label: t('Folders', 'Ordner'), rows: [field(t('Examination', 'Prüfung')), ...subs] }])}</div>
          <div class="fv" data-state="invalid">${head(MATTER, lede)}${list([{ label: t('Folders', 'Ordner'), rows: [field('Office', 'folder', err), ...subs] }])}</div>
          <div class="fv" data-state="rename">${head('Office', `${MATTER} · ${lede}`)}${list([{ label: t('Files', 'Dateien'), rows: [field('A1 claims.md', 'md'), ...office] }])}</div>
          <div class="fv" data-state="move">${head('00 Client', t('Client mail of Syntegon', 'Mandantenpost von Syntegon'))}${list([{ label: t('Files', 'Dateien'), rows: client }])}</div>
        </div>
      </div>`;
  const pick = (d, name, cls = '') => `<div class="pick d${d}${cls ? ` ${cls}` : ''}">${d ? '<span></span>' : ''}<span data-i="folder"></span><span class="t">${nm(name)}</span></div>`;
  const move = `<div class="dialog-scrim" data-state="move" data-modal><div class="menu dialog" role="dialog" aria-modal="true" aria-labelledby="move-h">
  <div class="dialog-h"><h2 id="move-h">${t('Move 1 file to…', '1 Datei verschieben nach …')}</h2><p>${t('A file can move only inside the Syntegon folder.', 'Eine Datei kann nur im Ordner Syntegon verschoben werden.')}</p></div>
  <div class="dialog-b"><div class="pick-search" data-i="search">${nm(MATTER)}</div>
    <div class="pick-list">${pick(0, FAM)}${pick(1, MATTER)}${TEMPLATE.map(s => pick(2, s, s === 'Client' ? 'on' : '')).join('')}</div></div>
  <div class="dialog-f">${btn(t('Cancel', 'Abbrechen'), { kind: 'ghost' })}${btn(t('Move here', 'Hierher verschieben'), { kind: 'primary', icon: 'move' })}</div>
</div></div>`;
  return page({ title: t('Organize the folder', 'Den Ordner ordnen'), body: app({ body }), after: `${move}\n${overflow()}\n` });
}

// ---------- Ask about this: the new chat in the client's workspace with the reference ----------
function askPage() {
  const ref = (icon, label, full) => `<span class="ref" data-i="${icon}" title="${full}" data-verbatim>${label}</span>`;
  const fileRef = ref('pdf', PDF, `${FAM}/${MATTER}/Office/${PDF}`);
  const folderRef = ref('folder', MATTER, `${FAM}/${MATTER}/`);
  const q = t('Which claims are still free of X documents?', 'Welche Ansprüche sind noch frei von X-Dokumenten?');
  const composer = r => `<div class="composer"><div class="typed">${r} ${q}</div><div class="tools">${iconbtn('attach', t('Attach', 'Anhängen'))}<span class="chip" data-i="folder">Syntegon</span><span class="chip" data-i="bot">${t('Patent agent', 'Patent-Agent')}</span><span class="send" role="button" aria-label="${t('Send', 'Senden')}" data-i="send"></span></div></div>`;
  const hero = `<div class="chat-hero"><h2>${t('New chat in Syntegon', 'Neuer Chat in Syntegon')}</h2><p>${t('The agent can read every file in the Syntegon folder. The reference tells it where you are looking.', 'Der Agent kann jede Datei im Ordner Syntegon lesen. Der Verweis sagt ihm, wo Sie gerade schauen.')}</p></div>`;
  const answer = `<div class="chat-col">
            <div class="bubble">${fileRef} ${q}</div>
            <div class="worked" data-i="check">${t('Read 2 files', '2 Dateien gelesen')}</div>
            <div class="answer">
              <p>${t('No claim is free of X documents. Four claims have only one X document:', 'Kein Anspruch ist frei von X-Dokumenten. Vier Ansprüche haben nur ein X-Dokument:')}</p>
              <ul><li>${t('Claim 6: D4 (US 6126585 A)', 'Anspruch 6: D4 (US 6126585 A)')}</li><li>${t('Claim 9: D2 (US 2021300609 A1)', 'Anspruch 9: D2 (US 2021300609 A1)')}</li><li>${t('Claims 11 and 12: D3 (DE 10 2017 105 119 A1)', 'Ansprüche 11 und 12: D3 (DE 10 2017 105 119 A1)')}</li></ul>
              <p class="cite">${t('Source', 'Quelle')}: ${ref('md', 'Search report.md', `${FAM}/${MATTER}/Search/Search report.md`)} ${t('table “Each claim and its documents”', 'Tabelle „Each claim and its documents“')}</p>
            </div>
          </div>`;
  const side = `<aside class="side hide-sm"><div class="side-tabs"><span class="tab" data-i="folder">${t('Files', 'Dateien')}</span><span class="tab is-on" data-i="pdf">${nm(PDF)}</span></div>
          <div class="side-b"><div class="cap">${nm(`${MATTER} › Office`)}</div><div class="letter scan" data-verbatim><img src="scan/ep-4-292-805-a1-page-1.webp" alt="${t('Page 1 of EP 4 292 805 A1', 'Seite 1 von EP 4 292 805 A1')}" width="909" height="1286"></div></div></aside>`;
  const body = `${topbar(`<span class="ico hide-sm" data-i="folder"></span><span class="lvl hide-sm">Syntegon</span><span class="sep hide-sm">›</span><span class="here">${t('New chat', 'Neuer Chat')}</span>`, '')}
      <div class="chat">
        <div class="chat-main" data-fdl-part="dock">
          <div class="chat-scroll" data-state="default folder">${hero}</div>
          <div class="chat-scroll" data-state="sent">${answer}</div>
          <span class="cset" data-state="default">${composer(fileRef)}</span>
          <span class="cset" data-state="folder">${composer(folderRef)}</span>
          <span class="cset" data-state="sent"><div class="composer"><div class="typed muted">${t('Ask a follow-up', 'Nachfrage stellen')}</div><div class="tools">${iconbtn('attach', t('Attach', 'Anhängen'))}<span class="chip" data-i="folder">Syntegon</span><span class="chip" data-i="bot">${t('Patent agent', 'Patent-Agent')}</span><span class="send" role="button" aria-label="${t('Send', 'Senden')}" data-i="send"></span></div></div></span>
        </div>
        ${side}
      </div>`;
  return page({ title: t('Ask about this', 'Hierzu fragen'), body: app({ side: '', session: t('New chat', 'Neuer Chat'), body }) });
}

const PAGES = { '1-client-folder': clientFolder, '2-matter-folder': matterFolder, '3-file-open': fileOpen, '4-drop': drop, '5-organize': organize, '6-ask': askPage };
for (const l of ['en', 'de']) {
  lang = l;
  for (const [name, make] of Object.entries(PAGES)) writeFileSync(path.join(OUT, `${name}${l === 'de' ? '.de' : ''}.html`), make());
}
console.log(`wrote ${Object.keys(PAGES).length * 2} pages`);
