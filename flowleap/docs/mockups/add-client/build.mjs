// Writes the Add client mockups, each page in English (<name>.html) and German (<name>.de.html), from this one source.
// Usage: node build.mjs. Edit this file, never the generated HTML. The data is public and real: the PATSTAT 2026 Spring
// applicant names of Syntegon (demo loop 2), the EP Register reads of 2026-11-08 (demo loop 4 and this design), and the
// client folder of demo loop 4. "Your firm" stands for the firm's name.
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const OUT = import.meta.dirname;
const RECORDS_CSS = '../../../../.agents/skills/flowleap-design-language/references/mockups/records.css';

// ---------- data ----------
const CLIENT = 'Syntegon';
const ASOF = '2026-11-08', ASOF_HM = '14:02';
const PATSTAT = 'PATSTAT 2026 Spring';
// The applicant names that PATSTAT harmonizes, with their applications at all offices (patstat_portfolio, loop 2).
const ENTITIES = [
  ['SYNTEGON TECHNOLOGY', 600], ['SYNTEGON PACKAGING SYSTEMS', 94], ['SYNTEGON PACKAGING SOLUTIONS B V', 27],
  ['SYNTEGON PACKAGING SOLUTIONS', 15], ['SYNTEGON POUCH SYSTEMS', 12], ['SYNTEGON PACKAGING TECHNOLOGY', 11],
  ['SYNTEGON TECHNOLOGY K K', 7], ['SYNTEGON PACKAGING TECHNOLOGY (HANGZHOU)', 3],
];
// The 16 EP applications whose representative of record is your firm: application, publication, title, filing date,
// representative since (EP Register, 2026-11-08). All have the applicant Syntegon Technology GmbH.
const MATTERS = [
  ['EP23171862', 'EP4292805 A1', 'Method and apparatus for producing a packaging element', '2023-05-05', '2024-07-24'],
  ['EP23215725', 'EP4385719 A1', 'Method for sealing a stack of layers of a fibre-based packaging material', '2023-12-12', '2024-07-24'],
  ['EP23709335', 'EP4486513 A1', 'Device for coating an object with a silicone coating', '2023-03-01', '2024-12-06'],
  ['EP24199601', 'EP4527609 A1', 'Method and device for joining or forming a fibre-based packing material and packaging machine for producing a packaging', '2024-09-10', '2025-02-21'],
  ['EP25183540', 'EP4671722 A1', 'Device for the visualisation of gas flows in a room, especially in a clean room', '2025-06-18', '2025-11-28'],
  ['EP25210820', 'EP4737335 A2', 'Packaging machine with a system for detecting a packaging element', '2025-10-23', '2026-04-03'],
  ['EP24735552', 'EP4739983 A1', 'Container carrier for carrying a multiplicity of containers', '2024-06-17', '2026-04-10'],
  ['EP24758162', 'EP4762336 A1', 'Device for taking air samples in a clean room', '2024-08-12', '2026-05-22'],
  ['EP24768012', 'EP4774489 A1', 'Pinch valve for a filling device for filling containers with pharmaceutical contents', '2024-09-03', '2026-06-12'],
  ['EP26153983', 'EP4786383 A1', 'Device for adapting a distance between containers', '2026-01-26', '2026-07-03'],
  ['EP24817871', 'EP4820737 A1', 'Apparatus for the automated processing of dishes with a lid', '2024-11-28', '2026-09-11'],
  ['EP24817872', 'EP4820738 A1', 'Air sampling device', '2024-11-28', '2026-09-11'],
  ['EP26173840', 'EP4834776 A1', 'Device for providing stoppers for closing containers', '2026-04-21', '2026-10-02'],
  ['EP25712875', '', 'System for filling containers with contents, with fill level monitoring', '2025-03-14', '2026-10-08'],
  ['EP25712876', '', 'System for filling containers with contents, with fill level monitoring', '2025-03-14', '2026-10-08'],
  ['EP25712877', '', 'System for filling filling material into containers with fill level monitoring', '2025-03-14', '2026-10-08'],
];
// The first 10 of the 256 applications at other firms (EP Register, 2026-11-08): the town of the representative
// only; the reference list names no other firm.
const REFS = [
  ['EP19794879', 'Increasing the weighing accuracy when weighing nested pharmaceutical containers', 'Stuttgart', '2019-09-18'],
  ['EP23200762', 'Package made of fibre-based packaging material', 'Überlingen', '2023-09-29'],
  ['EP23730010', 'Product handling device and production machine', 'Überlingen', '2023-05-25'],
  ['EP23180719', 'Device and method for weighing individual containers', 'Onex', '2023-06-21'],
  ['EP23182737', 'Barrier system with handling device for automated sampling', 'Stuttgart', '2023-06-30'],
  ['EP22701233', 'System for transporting loose sterile closure elements', 'Onex', '2022-01-20'],
  ['EP21773848', 'Device for handling containers inside a clean room', 'Stuttgart', '2021-09-17'],
  ['EP20723107', 'Apparatus and method for weighing pharmaceutical containers nested in a carrier', 'Onex', '2020-04-29'],
  ['EP23165015', 'Isolator system', 'Onex', '2023-03-29'],
  ['EP23183720', 'Planar drive device and method for operating a planar drive device', 'Stuttgart', '2023-07-05'],
];
// The family folders of the demo loop 4 client folder, with the demo matter's family.
const FAMILIES = [
  'Apparatus for the automated processing of dishes with a lid (+1) (priority DE 10 2023 133 973, 05.12.2023)',
  'Container carrier for carrying a multiplicity of containers (priority DE 10 2023 117 585, 04.07.2023)',
  'Device for adapting a distance between containers (priority DE 10 2025 103 512, 30.01.2025)',
  'Device for coating an object with a silicone coating (priority DE 10 2022 104 872, 02.03.2022)',
  'Device for providing stoppers for closing containers (priority DE 10 2025 116 774, 30.04.2025)',
  'Device for taking air samples in a clean room (priority DE 10 2023 122 028, 17.08.2023)',
  'Device for the visualisation of gas flows in a room, especially in a clean room (priority DE 10 2024 117 673, 24.06.2024)',
  'Method and apparatus for producing a packaging element (priority DE 10 2022 111 528, 09.05.2022)',
  'Method and device for joining or forming a fibre-based packing material and packaging machine for producing a packaging (priority DE 10 2023 125 343, 19.09.2023)',
  'Method for sealing a stack of layers of a fibre-based packaging material (priority DE 10 2022 133 074, 13.12.2022)',
  'Packaging machine with a system for detecting a packaging element (priority DE 10 2024 131 911, 31.10.2024)',
  'Pinch valve for a filling device for filling containers with pharmaceutical contents, filling device and method for filling containers with pharmaceutical contents (priority DE 10 2023 124 084, 07.09.2023)',
  'System for filling containers with contents, with fill level monitoring (priority DE 10 2024 108 756, 27.03.2024)',
  'System for filling containers with contents, with fill level monitoring (priority DE 10 2024 108 758, 27.03.2024)',
  'System for filling filling material into containers with fill level monitoring (priority DE 10 2024 108 759, 27.03.2024)',
];
const FAM = FAMILIES[7], MATTER = 'EP 23 171 862';
const TEMPLATE = ['Associates', 'Client', 'Drafts', 'Internal', 'Office', 'Search'];
// The second client: Gerhard Schubert. PATSTAT 2026 Spring names, the EP Register count, and the opposition in which
// Syntegon Packaging Systems AG is the opponent (EP Register, 2026-11-08).
const OTHER = 'Gerhard Schubert';
const OTHER_NAMES = 4, OTHER_EP = 57;
const PERSON = 'Dr. Anna Becker';

let lang = 'en';
const t = (en, de) => (lang === 'de' ? de : en);

// ---------- words and formats ----------
const MO = { en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], de: ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'] };
const date = iso => { const [y, m, d] = iso.split('-').map(Number); return lang === 'de' ? `${d}. ${MO.de[m - 1]} ${y}` : `${d} ${MO.en[m - 1]} ${y}`; };
const app = a => `EP ${a.slice(2, 4)} ${a.slice(4, 7)} ${a.slice(7)}`;
const pub = p => { const [n, k] = p.split(' '); return `EP ${n.slice(2, 3)} ${n.slice(3, 6)} ${n.slice(6)} ${k}`; };
const int = n => n.toLocaleString(lang === 'de' ? 'de-DE' : 'en-GB');
/** Data from a source (a file name, an applicant name as PATSTAT writes it, a source name): not product copy. */
const nm = s => `<span data-verbatim>${s}</span>`;
const asOf = () => t(`as of ${date(ASOF)}, ${ASOF_HM}`, `Stand ${date(ASOF)}, ${ASOF_HM}`);
const REGISTER = () => t('EP Register', 'EP-Register');
const addClient = () => t('Add client', 'Mandant hinzufügen');
const steps = n => `<div class="steps-line">${[t('Company', 'Unternehmen'), t('Role and matters', 'Rolle und Akten'), t('Folder', 'Ordner')].map((s, i) => i + 1 < n ? `<span class="done" data-i="check">${s}</span>` : i + 1 === n ? `<span class="on">${s}</span>` : `<span>${s}</span>`).join('')}</div>`;

// ---------- parts ----------
const page = ({ title, body, after = '' }) => `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<!-- Generated from build.mjs: edit that file and run node build.mjs, never this file -->
<link rel="stylesheet" href="${RECORDS_CSS}">
<link rel="stylesheet" href="add-client.css">
</head>
<body>
${body}
${after}<script src="frame.js"></script>
</body>
</html>
`;
const frame = ({ ws = '', body }) => `<div class="app">
  <nav data-sidebar="clients"${ws ? ` data-ws="${ws}"` : ''}></nav>
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
const topbar = (trail, right = '') => `      <header class="topbar">
        <div class="crumbs"><span class="ico hide-sm" data-i="clients"></span><span class="hide-sm">${t('Clients', 'Mandanten')}</span>${trail.map((c, i) => `<span class="sep hide-sm">›</span><span class="${i === trail.length - 1 ? 'here' : 'lvl hide-sm'}">${c}</span>`).join('')}</div>
        <div class="bar-right">${right}</div>
      </header>`;
const section = (h, count, inner, right = '') => `<div class="section"><div class="section-h"><h2>${h}</h2>${count === '' ? '' : `<span class="count">${count}</span>`}${right ? `<span class="right">${right}</span>` : ''}</div>${inner}</div>`;
const notice = (cls, icon, lead, rest = '', act = '') => `<div class="notice${cls ? ` ${cls}` : ''}" data-i="${icon}"><div><span class="lead">${lead}</span>${rest ? ` <span>${rest}</span>` : ''}</div>${act ? `<span class="spacer"></span>${act}` : ''}</div>`;
const retry = () => btn(t('Try again', 'Erneut versuchen'), { icon: 'retry', act: 'retry', key: 'R' });
/** The docked decision bar: the question, one row for each part, and the acts. */
const decision = ({ q, why, parts, note, primary, disabled = false, ghost = t('Cancel', 'Abbrechen') }) => `          <div class="decision-dock">
            <div class="decision">
              <div class="decision-h"><span class="av a av-lg">A</span><span class="lbl">${t('Your decision', 'Ihre Entscheidung')}</span><span class="q">${q}</span><span class="why hide-sm" data-i="info">${why}</span></div>
              <div class="decision-b">${parts.map(p => `
                <div class="part"><span class="pi ${p.s}" data-i="${{ ok: 'check', wait: 'warn', none: 'minus' }[p.s]}"></span><div><div class="q">${p.q}</div><div class="d">${p.d}</div></div><span class="v">${p.v}</span></div>`).join('')}
              </div>
              <div class="decision-f">
                ${btn(ghost, { kind: 'ghost', icon: 'x' })}<span class="note">${note}</span>
                <div class="acts">${btn(primary, { kind: 'primary', icon: 'check', cls: 'btn-lg', act: 'record', key: '⇧⌘↵', attrs: disabled ? off : '' })}</div>
              </div>
            </div>
          </div>`;
const work = (scroll, dock = '') => `      <div class="work">
        <div class="work-scroll"><div class="flow">
${scroll}
        </div></div>
${dock}
      </div>`;

// ---------- 1. Find the company and confirm its group ----------
function find() {
  const intro = `${steps(1)}<h1 class="title">${addClient()}</h1><p class="lede">${t('Type the company. FlowLeap finds its applicant names in the public patent data and the EP matters where the EP Register names your firm as the representative.', 'Geben Sie das Unternehmen ein. FlowLeap findet seine Anmeldernamen in den öffentlichen Patentdaten und die EP-Akten, bei denen das EP-Register Ihre Kanzlei als Vertreter nennt.')}</p>`;
  const field = typed => `<div class="fwrap" data-i="search"><input class="field" aria-label="${t('Company name', 'Firmenname')}" placeholder="${t('Company name, for example Syntegon', 'Firmenname, zum Beispiel Syntegon')}"${typed ? ` value="${CLIENT}"` : ''}></div>
<div class="privacy t12" data-i="lock"><span>${t('FlowLeap sends only this name to the patent data plugin. Nothing from your firm’s files leaves the firm.', 'FlowLeap sendet nur diesen Namen an das Patentdaten-Plugin. Nichts aus den Akten Ihrer Kanzlei verlässt die Kanzlei.')}</span></div>`;
  const thead = () => `<div class="thead"><span></span><span>${t(`Applicant name in ${nm('PATSTAT')}`, `Anmeldername in ${nm('PATSTAT')}`)}</span><span class="end">${t('Applications', 'Anmeldungen')}</span></div>`;
  const rows = (untick = -1) => ENTITIES.map(([n, c], i) => `<div class="row${i === untick ? ' off' : ''}"><span class="check${i === untick ? '' : ' on'}" data-i="${i === untick ? '' : 'check'}"></span><span class="t">${nm(n)}</span><span class="c end">${int(c)}</span></div>`).join('');
  const total = ENTITIES.reduce((s, [, c]) => s + c, 0);
  const src = `<p class="src-line t12">${t(`Source: ${nm(PATSTAT)}, harmonized applicant names with their applications at all offices. This product contains data sourced from EPO databases, © European Patent Organisation.`, `Quelle: ${nm(PATSTAT)}, vereinheitlichte Anmeldernamen mit ihren Anmeldungen bei allen Ämtern. This product contains data sourced from EPO databases, © European Patent Organisation.`)}</p>`;
  const group = `${section(t('The client group that FlowLeap proposes', 'Die Mandantengruppe, die FlowLeap vorschlägt'), t(`8 of 8 names · ${int(total)} applications`, `8 von 8 Namen · ${int(total)} Anmeldungen`),
    `<div class="hint-line" data-i="info"><span>${t('FlowLeap groups these names because they match the company. It is a proposal, not a legal fact: untick a name that is not part of the client.', 'FlowLeap gruppiert diese Namen, weil sie zum Unternehmen passen. Das ist ein Vorschlag, keine rechtliche Tatsache: Entfernen Sie den Haken bei einem Namen, der nicht zum Mandanten gehört.')}</span></div><div class="list cos">${thead()}${rows()}</div>${src}`)}`;
  const skeleton = `${section(t('The client group that FlowLeap proposes', 'Die Mandantengruppe, die FlowLeap vorschlägt'), '', `<div class="list cos">${thead()}${['w60', 'w50', 'w70', 'w50', 'w60'].map(w => `<div class="row"><span class="skel dot"></span><span class="skel ${w}"></span><span class="skel w50"></span></div>`).join('')}</div>`)}`;
  const empty = `<div class="empty inflow"><div class="empty-in"><div class="empty-art" data-i="building"></div><h2>${t('Start with the company’s name', 'Beginnen Sie mit dem Namen des Unternehmens')}</h2><p>${t('FlowLeap shows the applicant names that belong to it. You confirm the group, choose the role, and see your firm’s matters before anything is added.', 'FlowLeap zeigt die Anmeldernamen, die dazugehören. Sie bestätigen die Gruppe, wählen die Rolle und sehen die Akten Ihrer Kanzlei, bevor etwas hinzugefügt wird.')}</p></div></div>`;
  const error = `<div class="error-bar">${notice('bad', 'warn', t('FlowLeap could not reach the patent data plugin.', 'FlowLeap konnte das Patentdaten-Plugin nicht erreichen.'), t('Nothing was searched and nothing was added.', 'Es wurde nichts gesucht und nichts hinzugefügt.'), retry())}</div>
<div class="hint-line" data-i="info"><span>${t('You can also add Syntegon by name only. The folder then starts with the template folders, and you load its matters later.', 'Sie können Syntegon auch nur mit dem Namen hinzufügen. Der Ordner beginnt dann mit den Vorlagenordnern, und Sie laden die Akten später.')}</span></div>`;
  const plugin = `<div class="empty inflow"><div class="empty-in"><div class="empty-art" data-i="plug"></div><h2>${t('Add the client by name', 'Mandant mit Namen hinzufügen')}</h2><p>${t('The FlowLeap patent data plugin is not installed, so FlowLeap cannot find the applicant names or the matters. Without it, FlowLeap adds Syntegon by name and makes its client folder with the template folders.', 'Das FlowLeap-Patentdaten-Plugin ist nicht installiert. Darum findet FlowLeap weder die Anmeldernamen noch die Akten. Ohne das Plugin fügt FlowLeap Syntegon mit dem Namen hinzu und legt den Mandantenordner mit den Vorlagenordnern an.')}</p>${btn(t('Open plugins', 'Plugins öffnen'), { icon: 'plug' })}</div></div>`;
  const existing = `${notice('', 'info', t('Syntegon is already a client of your firm.', 'Syntegon ist bereits Mandant Ihrer Kanzlei.'), t(`${PERSON} added it on ${date(ASOF)}. Add client reads the public data again and adds only what is new: new names, new matters, and a new dated file where the register data changed.`, `${PERSON} hat ihn am ${date(ASOF)} hinzugefügt. „Mandant hinzufügen“ liest die öffentlichen Daten erneut und fügt nur Neues hinzu: neue Namen, neue Akten und eine neue datierte Datei, wo sich die Registerdaten geändert haben.`))}
${section(t('The client group', 'Die Mandantengruppe'), t('8 names, no new name', '8 Namen, kein neuer Name'), `<div class="list cos">${thead()}${rows()}</div>${src}`)}`;
  const cont = dis => btn(t('Continue', 'Weiter'), { kind: 'primary', attrs: dis ? off : '' });
  const body = `${topbar([addClient()], `<span class="cset" data-state="default loading error">${cont(true)}</span><span class="cset" data-state="group existing plugin">${cont(false)}</span>`)}
${work(`${intro}
<div data-state="default">${field(false)}${empty}</div>
<div data-state="loading">${field(true)}${skeleton}</div>
<div data-state="group">${field(true)}${group}</div>
<div data-state="error">${field(true)}<div class="section">${error}</div></div>
<div data-state="plugin">${field(true)}${plugin}</div>
<div data-state="existing">${field(true)}<div class="section">${existing}</div></div>`)}`;
  return page({ title: t('Add client: find the company', 'Mandant hinzufügen: Unternehmen finden'), body: frame({ body }) });
}

// ---------- the role: a segmented control in the decision bar, and one line that explains it ----------
const roleSeg = on => `<div class="seg" role="radiogroup" aria-label="${t('Role', 'Rolle')}">${[['client', t('Client', 'Mandant')], ['watch', t('Watch', 'Beobachten')], ['other', t('Other party', 'Andere Partei')]].map(([k, l]) => `<span${k === on ? ' class="on"' : ''} role="radio" aria-checked="${k === on}">${l}</span>`).join('')}</div>`;
const roleHint = name => `<div class="hint-line role-hint" data-i="info"><span>${t(`Choose the role in your decision: <b>Client</b> when your firm acts for ${name}, also with no EP matter; <b>Watch</b> for a competitor to follow; <b>Other party</b> for a party in one of your matters. FlowLeap never takes the role from the register.`, `Wählen Sie die Rolle in Ihrer Entscheidung: <b>Mandant</b>, wenn Ihre Kanzlei für ${name} handelt, auch ohne EP-Akte; <b>Beobachten</b> für einen Wettbewerber; <b>Andere Partei</b> für eine Partei in einer Ihrer Akten. FlowLeap übernimmt die Rolle nie aus dem Register.`)}</span></div>`;
const rolePart = on => ({ s: 'ok', q: t('Role', 'Rolle'), d: t('Your firm’s decision', 'Entscheidung Ihrer Kanzlei'), v: roleSeg(on) });

const limits = () => `<div class="limits t12">
<div data-i="info"><span><b>${t('What public data cannot show.', 'Was öffentliche Daten nicht zeigen.')}</b> ${t('National matters at the DPMA; applications that are not published yet (the first 18 months); matters where the register still shows an earlier name or address of your firm; and matters that your firm handles without being the EP representative, for example through a foreign associate.', 'Nationale Akten beim DPMA; Anmeldungen, die noch nicht veröffentlicht sind (die ersten 18 Monate); Akten, bei denen das Register noch einen früheren Namen oder eine frühere Adresse Ihrer Kanzlei zeigt; und Akten, die Ihre Kanzlei bearbeitet, ohne EP-Vertreter zu sein, zum Beispiel über einen ausländischen Kollegen.')}</span></div>
<div data-i="gear"><span>${t('FlowLeap finds your firm by the names and addresses in Settings, Firm identity. Add an earlier address there to find older matters.', 'FlowLeap findet Ihre Kanzlei über die Namen und Adressen in Einstellungen, Kanzleidaten. Tragen Sie dort eine frühere Adresse ein, um ältere Akten zu finden.')}</span></div>
</div>`;

// ---------- 2. Syntegon: role, conflict check, these are your matters ----------
function review() {
  const intro = `${steps(2)}<h1 class="title">${CLIENT}</h1><div class="keyfact"><span class="big">${t('16 EP matters at your firm', '16 EP-Akten in Ihrer Kanzlei')}</span></div><p class="lede">${t(`8 applicant names · 272 EP applications in the EP Register, ${asOf()}`, `8 Anmeldernamen · 272 EP-Anmeldungen im EP-Register, ${asOf()}`)}</p>${roleHint(CLIENT)}`;
  const conflict = section(t('Conflict check', 'Kollisionsprüfung'), '', `<div class="ok-line" data-i="check"><div><div>${t('No conflict found.', 'Keine Kollision gefunden.')}</div><div class="d">${t('None of the 8 names is the other side in a matter of your clients: not in your Firm Record, and not as an opponent or patent owner in an EP opposition.', 'Keiner der 8 Namen ist Gegenseite in einer Akte Ihrer Mandanten: nicht in Ihrem Firm Record und nicht als Einsprechender oder Patentinhaber in einem EP-Einspruch.')}</div></div></div>`);
  const mthead = `<div class="thead"><span>${t('Application', 'Anmeldung')}</span><span>${t('Title', 'Titel')}</span><span>${t('Publication', 'Veröffentlichung')}</span><span>${t('Representative since', 'Vertreter seit')}</span></div>`;
  const mrows = MATTERS.map(([a, p, ti, , since]) => `<div class="row"><span class="k">${app(a)}</span><span class="t" title="${ti}">${ti}</span><span class="c">${p ? pub(p) : t('Not yet as EP', 'Noch nicht als EP')}</span><span class="c">${date(since)}</span></div>`).join('');
  const mine = section(t('These are your matters', 'Das sind Ihre Akten'), t('16 of 272', '16 von 272'), `<p class="src-line t12">${t(`The EP applications of the group where the EP Register names your firm as the representative, ${asOf()}. The applicant of all 16 is Syntegon Technology GmbH.`, `Die EP-Anmeldungen der Gruppe, bei denen das EP-Register Ihre Kanzlei als Vertreter nennt, ${asOf()}. Anmelderin aller 16 ist die Syntegon Technology GmbH.`)}</p><div class="list mats">${mthead}<div class="group">${t('At your firm', 'In Ihrer Kanzlei')} <span class="count num">16</span></div>${mrows}</div>${limits()}`);
  const rthead = `<div class="thead"><span>${t('Application', 'Anmeldung')}</span><span>${t('Title', 'Titel')}</span><span>${t('Representative in', 'Vertreter in')}</span><span>${t('Filed', 'Angemeldet')}</span></div>`;
  const rrows = REFS.map(([a, ti, town, filed]) => `<div class="row"><span class="k">${app(a)}</span><span class="t" title="${ti}">${ti}</span><span class="c">${town}</span><span class="c">${date(filed)}</span></div>`).join('');
  const refShort = section(t('At other firms', 'Bei anderen Kanzleien'), t('256 · for reference', '256 · zur Information'), `<p class="src-line t12">${t('Read only. FlowLeap does not add them to the client folder; it writes them into one dated reference file there.', 'Nur zum Lesen. FlowLeap nimmt sie nicht in den Mandantenordner auf; es schreibt sie dort in eine datierte Referenzdatei.')}</p>`, btn(t('Show the list', 'Liste zeigen'), { kind: 'ghost', icon: 'chevd' }));
  const refLong = section(t('At other firms', 'Bei anderen Kanzleien'), t('256 · for reference', '256 · zur Information'), `<p class="src-line t12">${t('Read only. FlowLeap does not add them to the client folder; it writes them into one dated reference file there. The list names the town of the representative, not the firm.', 'Nur zum Lesen. FlowLeap nimmt sie nicht in den Mandantenordner auf; es schreibt sie dort in eine datierte Referenzdatei. Die Liste nennt den Ort des Vertreters, nicht die Kanzlei.')}</p><div class="list refs">${rthead}<div class="group">${t('At other firms', 'Bei anderen Kanzleien')} <span class="count num">256</span></div>${rrows}<div class="row more-row"><span>${t('246 more', '246 weitere')}</span></div></div>`, btn(t('Hide the list', 'Liste ausblenden'), { kind: 'ghost', icon: 'chev' }));
  const dock = decision({
    q: t('Add Syntegon as a client of your firm?', 'Syntegon als Mandant Ihrer Kanzlei hinzufügen?'),
    why: t('Recorded with your name', 'Wird mit Ihrem Namen erfasst'),
    parts: [
      rolePart('client'),
      { s: 'ok', q: t('Conflict check', 'Kollisionsprüfung'), d: t('Firm Record and EP oppositions', 'Firm Record und EP-Einsprüche'), v: t('No conflict found', 'Keine Kollision') },
      { s: 'ok', q: t('Matters', 'Akten'), d: t(`EP Register, ${asOf()}`, `EP-Register, ${asOf()}`), v: t('16 at your firm', '16 in Ihrer Kanzlei') },
    ],
    note: t('FlowLeap then builds the folder: 15 families, 16 matters.', 'Danach legt FlowLeap den Ordner an: 15 Familien, 16 Akten.'),
    primary: addClient(),
  });
  const body = `${topbar([addClient(), CLIENT])}
${work(`${intro}
${mine}
${conflict}
<div data-state="default">${refShort}</div>
<div data-state="reference">${refLong}</div>`, dock)}`;
  return page({ title: t('Add client: Syntegon', 'Mandant hinzufügen: Syntegon'), body: frame({ body }) });
}

// ---------- 3. Gerhard Schubert: a conflict to check, zero matters, Watch and Other party ----------
function conflict() {
  const intro = `${steps(2)}<h1 class="title">${OTHER}</h1><p class="lede">${t(`${OTHER_NAMES} applicant names · ${OTHER_EP} EP applications in the EP Register, ${asOf()}`, `${OTHER_NAMES} Anmeldernamen · ${OTHER_EP} EP-Anmeldungen im EP-Register, ${asOf()}`)}</p>${roleHint(OTHER)}`;
  const facts = `<div class="facts-tbl">
<div class="k">${t('Patent', 'Patent')}</div><div><span class="num">EP 3 296 081 B1</span> · ${t('Method and device for producing tubular bags', 'Verfahren und Vorrichtung zum Herstellen von Schlauchbeuteln')}</div>
<div class="k">${t('Patent owner', 'Patentinhaber')}</div><div>Gerhard Schubert GmbH</div>
<div class="k">${t('Opponent', 'Einsprechender')}</div><div>Syntegon Packaging Systems AG, ${t('a company of your client Syntegon', 'ein Unternehmen Ihres Mandanten Syntegon')}</div>
<div class="k">${t('Opposition filed', 'Einspruch eingelegt')}</div><div class="num">${date('2025-01-08')}</div>
<div class="k">${t('Register status', 'Registerstatus')}</div><div>${t('Patent revoked', 'Patent widerrufen')}</div>
<div class="k">${t('Your firm', 'Ihre Kanzlei')}</div><div>${t('Not named in this opposition', 'In diesem Einspruch nicht genannt')}</div>
<div class="k">${t('Source', 'Quelle')}</div><div>${t(`EP Register, ${asOf()}`, `EP-Register, ${asOf()}`)}</div>
</div>`;
  const check = done => `<div class="opts top"><div class="opt${done ? ' on' : ''}" role="checkbox" aria-checked="${done}"><span class="check${done ? ' on' : ''}" data-i="${done ? 'check' : ''}"></span><span></span><div><div class="h">${t('I checked this conflict', 'Ich habe diese Kollision geprüft')}</div><div class="d">${t('Write why Gerhard Schubert can be a client. FlowLeap records the reason with your name.', 'Schreiben Sie, warum Gerhard Schubert Mandant sein kann. FlowLeap erfasst die Begründung mit Ihrem Namen.')}</div></div></div></div>
<textarea class="reason-field${done ? ' on' : ''}" aria-label="${t('Reason', 'Begründung')}" placeholder="${t('Reason', 'Begründung')}">${done ? t('The opposition is closed and the patent is revoked. Our firm did not act in it.', 'Der Einspruch ist abgeschlossen und das Patent widerrufen. Unsere Kanzlei war nicht beteiligt.') : ''}</textarea>`;
  const conflictSec = done => section(t('Conflict check', 'Kollisionsprüfung'), t('1 possible conflict', '1 mögliche Kollision'), `${notice('warn', 'warn', t('Gerhard Schubert GmbH is the other side of your client Syntegon in one EP opposition.', 'Die Gerhard Schubert GmbH ist in einem EP-Einspruch die Gegenseite Ihres Mandanten Syntegon.'), t('Decide before you add the client.', 'Entscheiden Sie, bevor Sie den Mandanten hinzufügen.'))}${facts}${check(done)}`);
  const zero = section(t('These are your matters', 'Das sind Ihre Akten'), t(`0 of ${OTHER_EP}`, `0 von ${OTHER_EP}`), `<div class="empty inflow"><div class="empty-in"><div class="empty-art" data-i="folder"></div><h2>${t('No EP matters at your firm yet', 'Noch keine EP-Akten in Ihrer Kanzlei')}</h2><p>${t(`None of the ${OTHER_EP} EP applications names your firm as the representative. You can still add Gerhard Schubert as a client, for example a new client, DE work only, or a recent transfer. The folder starts with the template folders.`, `Keine der ${OTHER_EP} EP-Anmeldungen nennt Ihre Kanzlei als Vertreter. Sie können Gerhard Schubert trotzdem als Mandanten hinzufügen, zum Beispiel einen neuen Mandanten, nur DE-Arbeit oder eine kürzliche Übernahme. Der Ordner beginnt mit den Vorlagenordnern.`)}</p></div></div>${limits()}`);
  const refs = section(t('At other firms', 'Bei anderen Kanzleien'), t(`${OTHER_EP} · for reference`, `${OTHER_EP} · zur Information`), '', btn(t('Show the list', 'Liste zeigen'), { kind: 'ghost', icon: 'chevd' }));
  const watchSec = section(t('What Watch will follow', 'Was „Beobachten“ verfolgt'), '', `<div class="limits">
<div data-i="doc"><span><b>${t('New EP filings', 'Neue EP-Anmeldungen')}</b> ${t(`of the ${OTHER_NAMES} applicant names, from their publication.`, `der ${OTHER_NAMES} Anmeldernamen, ab ihrer Veröffentlichung.`)}</span></div>
<div data-i="party"><span><b>${t('Oppositions', 'Einsprüche')}</b> ${t('that Gerhard Schubert files or receives.', 'die Gerhard Schubert einlegt oder erhält.')}</span></div>
<div data-i="link"><span><b>${t('Citations', 'Zitate')}</b> ${t('of its patents against the matters of your clients.', 'seiner Patente gegen die Akten Ihrer Mandanten.')}</span></div>
</div><div class="hint-line t12" data-i="info"><span>${t('Watch itself comes later. Now FlowLeap records Gerhard Schubert on the Watch list. It builds no folder and runs no conflict check, because Watch adds no client.', 'Die Beobachtung selbst kommt später. Jetzt erfasst FlowLeap Gerhard Schubert auf der Beobachtungsliste. Es legt keinen Ordner an und prüft keine Kollision, weil „Beobachten“ keinen Mandanten hinzufügt.')}</span></div>`);
  const otherSec = section(t('Link to a matter', 'Mit einer Akte verbinden'), '', `<div class="hint-line" data-i="info"><span>${t('Choose the matter of your firm in which Gerhard Schubert is a party, and its role there.', 'Wählen Sie die Akte Ihrer Kanzlei, in der Gerhard Schubert Partei ist, und seine Rolle dort.')}</span></div>
<div class="fwrap pick" data-i="search"><input class="field pick-field" aria-label="${t('Find a matter', 'Akte suchen')}" placeholder="${t('Find a matter', 'Akte suchen')}"></div>
<div class="menu pick-menu" role="menu">${[0, 2, 6, 9].map(i => MATTERS[i]).map(([a, , ti], i) => `<div class="pk-i${i === 0 ? ' on' : ''}"><span class="num">${app(a)}</span><span class="tt">${ti}</span></div>`).join('')}<div class="pk-foot">${t('Only the matters you may see', 'Nur die Akten, die Sie sehen dürfen')}</div></div>
<div class="field-label">${t('Role in the matter', 'Rolle in der Akte')}</div><div class="seg inline" role="radiogroup" aria-label="${t('Role in the matter', 'Rolle in der Akte')}"><span>${t('Opponent', 'Einsprechender')}</span><span>${t('Licensee', 'Lizenznehmer')}</span><span>${t('Other', 'Andere')}</span></div>`);
  const clientParts = done => [
    rolePart('client'),
    done ? { s: 'ok', q: t('Conflict check', 'Kollisionsprüfung'), d: t('1 possible conflict, checked by you', '1 mögliche Kollision, von Ihnen geprüft'), v: t('Checked', 'Geprüft') }
      : { s: 'wait', q: t('Conflict check', 'Kollisionsprüfung'), d: t('1 possible conflict with your client Syntegon', '1 mögliche Kollision mit Ihrem Mandanten Syntegon'), v: t('Not checked', 'Nicht geprüft') },
    { s: 'none', q: t('Matters', 'Akten'), d: t('The folder starts with the template folders', 'Der Ordner beginnt mit den Vorlagenordnern'), v: t('None at your firm', 'Keine in Ihrer Kanzlei') },
  ];
  const clientDock = done => decision({
    q: t('Add Gerhard Schubert as a client of your firm?', 'Gerhard Schubert als Mandant Ihrer Kanzlei hinzufügen?'),
    why: t('Recorded with your name', 'Wird mit Ihrem Namen erfasst'),
    parts: clientParts(done),
    note: done ? t('FlowLeap then builds an empty client folder.', 'Danach legt FlowLeap einen leeren Mandantenordner an.') : t('Check the conflict first.', 'Prüfen Sie zuerst die Kollision.'),
    primary: addClient(), disabled: !done,
  });
  const watchDock = decision({
    q: t('Add Gerhard Schubert to Watch?', 'Gerhard Schubert zur Beobachtung hinzufügen?'),
    why: t('Recorded with your name', 'Wird mit Ihrem Namen erfasst'),
    parts: [rolePart('watch'), { s: 'none', q: t('Folder', 'Ordner'), d: t('Watch adds no client', '„Beobachten“ fügt keinen Mandanten hinzu'), v: t('No folder', 'Kein Ordner') }],
    note: t('Watch itself comes later.', 'Die Beobachtung selbst kommt später.'),
    primary: t('Add to Watch', 'Zur Beobachtung hinzufügen'),
  });
  const otherDock = decision({
    q: t('Add Gerhard Schubert as a party to a matter?', 'Gerhard Schubert als Partei einer Akte hinzufügen?'),
    why: t('Recorded with your name', 'Wird mit Ihrem Namen erfasst'),
    parts: [rolePart('other'), { s: 'wait', q: t('Matter', 'Akte'), d: t('Choose the matter and the role in it', 'Wählen Sie die Akte und die Rolle darin'), v: t('Not chosen', 'Nicht gewählt') }],
    note: t('Choose a matter first.', 'Wählen Sie zuerst eine Akte.'),
    primary: t('Add party', 'Partei hinzufügen'), disabled: true,
  });
  const body = `${topbar([addClient(), OTHER])}
      <div class="cset" data-state="default">${work(`${intro}${conflictSec(false)}${zero}${refs}`, clientDock(false))}</div>
      <div class="cset" data-state="checked">${work(`${intro}${conflictSec(true)}${zero}${refs}`, clientDock(true))}</div>
      <div class="cset" data-state="watch">${work(`${intro}${watchSec}`, watchDock)}</div>
      <div class="cset" data-state="other">${work(`${intro}${otherSec}`, otherDock)}</div>`;
  return page({ title: t('Add client: Gerhard Schubert', 'Mandant hinzufügen: Gerhard Schubert'), body: frame({ body }) });
}

// ---------- 4. The build ----------
function build() {
  const li = (cls, icon, h, d, n = '') => `<li class="${cls}"><span data-i="${icon}"></span><div><div class="h">${h}</div>${d ? `<div class="d">${d}</div>` : ''}</div><span class="n">${n}</span></li>`;
  const list = failed => `<ol class="bsteps">
${li('done', 'check', t('Recorded Syntegon as a client, with its 8 applicant names', 'Syntegon als Mandant erfasst, mit seinen 8 Anmeldernamen'), t(`Firm Record, by ${PERSON}`, `Firm Record, durch ${PERSON}`))}
${li('done', 'check', t('Recorded the conflict check', 'Kollisionsprüfung erfasst'), t('No conflict found', 'Keine Kollision gefunden'))}
${li('done', 'check', t('Recorded 16 matters with their application numbers', '16 Akten mit ihren Anmeldenummern erfasst'), t('The applicant of each as a party', 'Jeweils die Anmelderin als Partei'))}
${li('done', 'check', t('Made the client folder and its workspace', 'Mandantenordner und Arbeitsbereich angelegt'), nm('Clients/Syntegon'))}
${failed ? li('done', 'check', t('Made 15 family folders and 16 matter folders', '15 Familienordner und 16 Aktenordner angelegt'), t('Each matter with the template folders', 'Jede Akte mit den Vorlagenordnern'), '16 / 16')
    : li('now', 'spin', t('Making 15 family folders and 16 matter folders', '15 Familienordner und 16 Aktenordner anlegen'), `${t('Each matter with the template folders', 'Jede Akte mit den Vorlagenordnern')}<div class="bar"><span></span></div>`, '9 / 16')}
${failed ? li('fail', 'warn', t('Wrote the public data as dated files, except 3', 'Öffentliche Daten als datierte Dateien geschrieben, außer 3'), t('The EPO publication server did not answer for EP 4 820 737 A1, EP 4 820 738 A1 and EP 4 834 776 A1.', 'Der EPA-Veröffentlichungsserver hat für EP 4 820 737 A1, EP 4 820 738 A1 und EP 4 834 776 A1 nicht geantwortet.'), '61 / 64')
    : li('next', 'ring', t('Write the public data as dated files', 'Öffentliche Daten als datierte Dateien schreiben'), t('EP Register data, publications, claims, search reports and family members', 'EP-Registerdaten, Veröffentlichungen, Ansprüche, Recherchenberichte und Familienmitglieder'))}
${li('next', 'ring', t('Open the client folder', 'Mandantenordner öffnen'), '')}
</ol>`;
  const intro = `${steps(3)}<h1 class="title">${t('Building the Syntegon folder', 'Der Syntegon-Ordner wird angelegt')}</h1><p class="lede">${t('FlowLeap records the client first, then builds the folder. You can leave this page: the build goes on, and the Clients list shows it.', 'FlowLeap erfasst zuerst den Mandanten und legt dann den Ordner an. Sie können diese Seite verlassen: Der Aufbau läuft weiter, und die Mandantenliste zeigt ihn.')}</p>`;
  const openBtn = dis => btn(t('Open client folder', 'Mandantenordner öffnen'), { kind: 'primary', icon: 'folderopen', attrs: dis ? off : '' });
  const body = `${topbar([addClient(), CLIENT], `<span class="cset" data-state="default">${openBtn(true)}</span><span class="cset" data-state="failed">${openBtn(false)}</span>`)}
${work(`${intro}
<div data-state="default">${list(false)}<div class="build-foot t12" data-i="info"><span>${t('A step that stops can run again: FlowLeap adds only what is missing and never writes a file twice.', 'Ein Schritt, der stoppt, kann erneut laufen: FlowLeap fügt nur Fehlendes hinzu und schreibt keine Datei doppelt.')}</span></div></div>
<div data-state="failed"><div class="section"><div class="error-bar">${notice('bad', 'warn', t('3 publications could not be read.', '3 Veröffentlichungen konnten nicht gelesen werden.'), t('Everything else is done, and the folder is ready to use. Try again reads only the 3 missing files.', 'Alles andere ist fertig, und der Ordner ist nutzbar. „Erneut versuchen“ liest nur die 3 fehlenden Dateien.'), retry())}</div></div>${list(true)}</div>`)}`;
  return page({ title: t('Add client: building the folder', 'Mandant hinzufügen: Ordner wird angelegt'), body: frame({ body }) });
}

// ---------- 5. The end: the client folder page ----------
function folder() {
  const node = ([d, kind, name, open = false, sel = false]) => `<div class="row node d${d}${sel ? ' is-selected' : ''}" title="${name}" data-verbatim>${d ? '<span></span>' : ''}<span class="tw" data-i="${kind === 'folder' ? (open ? 'chevd' : 'chev') : ''}"></span><span class="fi" data-i="${kind === 'folder' ? (open ? 'folderopen' : 'folder') : 'md'}"></span><span class="t">${nm(name)}</span></div>`;
  const REG_FILE = `EP Register ${ASOF}.md`;
  const treeRows = snap => {
    const r = [[0, 'folder', CLIENT, true, !snap], [1, 'folder', '00 Client']];
    for (const f of FAMILIES) {
      r.push([1, 'folder', f, snap && f === FAM]);
      if (snap && f === FAM) {
        r.push([2, 'folder', MATTER, true]);
        for (const s of TEMPLATE) { r.push([3, 'folder', s, s === 'Office']); if (s === 'Office') r.push([4, 'md', REG_FILE, false, true]); }
      }
    }
    return `<nav class="tree list" aria-label="${t('Folders', 'Ordner')}">${r.map(node).join('')}</nav>`;
  };
  const SRC = t('Add client', 'Mandant hinzufügen');
  const row = (icon, name, kind, size, src, isNew = false) => `<div class="row${isNew ? ' is-new' : ''}"><span class="lead"><span class="fi" data-i="${icon}"></span></span><span class="t">${nm(name)}</span><span class="c">${kind}</span><span class="c">${size}</span><span class="c sm">${t('Today, 14:03', 'Heute, 14:03')}</span><span class="c">${src}</span></div>`;
  const thead = `<div class="thead"><span></span><span>${t('Name', 'Name')}</span><span>${t('Kind', 'Art')}</span><span>${t('Size', 'Größe')}</span><span>${t('Modified', 'Geändert')}</span><span>${t('Source', 'Quelle')}</span></div>`;
  const matters = n => (n === 1 ? t('1 matter', '1 Akte') : t(`${n} matters`, `${n} Akten`));
  const folders = [row('folder', '00 Client', t('Folder', 'Ordner'), t('Empty', 'Leer'), SRC), ...FAMILIES.map((f, i) => row('folder', f, t('Family', 'Familie'), matters(i === 0 ? 2 : 1), SRC))];
  const files = [row('md', 'About this folder.md', 'Markdown', '1 KB', SRC), row('md', `Reference - at other firms ${ASOF}.md`, 'Markdown', '24 KB', REGISTER())];
  const list = `<div class="list files">${thead}<div class="group">${t('Folders', 'Ordner')} <span class="count num">16</span></div>${folders.join('')}<div class="group">${t('Files', 'Dateien')} <span class="count num">2</span></div>${files.join('')}</div>`;
  const fv = `<div class="fv"><div class="fv-head"><h1 class="title">${CLIENT}</h1><p class="lede">${t('Client folder · 15 families with 16 matters at your firm · added today', 'Mandantenordner · 15 Familien mit 16 Akten Ihrer Kanzlei · heute hinzugefügt')}</p></div>${list}</div>`;
  const m = MATTERS[0];
  const snap = `<div class="pv"><div class="pv-head"><div><h1 class="title">${nm(REG_FILE)}</h1><div class="pv-meta"><span>Markdown · 2 KB</span><span>${t(`Source: Add client, from the EP Register`, `Quelle: Mandant hinzufügen, aus dem EP-Register`)}</span></div></div></div>
<div class="pv-body"><div class="notice asof" data-i="clock"><div><span class="lead">${t(`As of ${date(ASOF)}, ${ASOF_HM}, from the EP Register.`, `Stand ${date(ASOF)}, ${ASOF_HM}, aus dem EP-Register.`)}</span> <span>${t('A dated copy: it does not change when the register changes. A later Add client writes a new dated file when the data changed.', 'Eine datierte Kopie: Sie ändert sich nicht, wenn sich das Register ändert. Ein späteres „Mandant hinzufügen“ schreibt eine neue datierte Datei, wenn sich die Daten geändert haben.')}</span></div></div>
<div class="md" data-verbatim><table><tr><th>Field</th><th>Value</th></tr><tr><td>Application</td><td>${app(m[0])}</td></tr><tr><td>Publication</td><td>${pub(m[1])}</td></tr><tr><td>Title</td><td>${m[2]}</td></tr><tr><td>Applicant</td><td>Syntegon Technology GmbH</td></tr><tr><td>Representative of record</td><td>your firm, since 24.07.2024</td></tr><tr><td>Status</td><td>Examination is in progress</td></tr><tr><td>Filing date</td><td>05.05.2023</td></tr><tr><td>Publication date</td><td>20.12.2023</td></tr></table>
<h2>Status history</h2><table><tr><th>Date of the status change</th><th>Register status</th></tr><tr><td>13.12.2024</td><td>Examination is in progress</td></tr><tr><td>01.03.2024</td><td>Request for examination was made</td></tr><tr><td>17.11.2023</td><td>The application has been published</td></tr></table>
<p class="src">Source: EP Register, read by Add client on 08.11.2026, 14:02.</p></div></div></div>`;
  const acts = `${iconbtn('search', t('Find in this folder', 'In diesem Ordner suchen'), 'hide-sm')}${btn(t('New folder', 'Neuer Ordner'), { icon: 'newfolder', cls: 'hide-sm' })}${btn(t('Upload files', 'Dateien hochladen'), { icon: 'upload', cls: 'hide-sm' })}${btn(t('Ask about this', 'Hierzu fragen'), { kind: 'primary', icon: 'ask' })}`;
  const body = `      <div class="cset" data-state="default">${topbar([CLIENT], acts)}<div class="fp">${treeRows(false)}<div class="mid">${fv}</div></div></div>
      <div class="cset" data-state="snapshot">${topbar([CLIENT, MATTER, 'Office', nm(REG_FILE)], btn(t('Ask about this', 'Hierzu fragen'), { kind: 'primary', icon: 'ask' }))}<div class="fp">${treeRows(true)}<div class="mid">${snap}</div></div></div>`;
  const toast = `<div class="toast" data-state="default" role="status" data-i="check"><span>${t('Syntegon added: 16 matters in 15 families', 'Syntegon hinzugefügt: 16 Akten in 15 Familien')}</span></div>\n`;
  return page({ title: t('Client folder: Syntegon', 'Mandantenordner: Syntegon'), body: frame({ ws: CLIENT, body }), after: toast });
}

const PAGES = [['1-find', find], ['2-review', review], ['3-conflict', conflict], ['4-build', build], ['5-client-folder', folder]];
for (const l of ['en', 'de']) {
  lang = l;
  for (const [name, fn] of PAGES) writeFileSync(path.join(OUT, `${name}${l === 'de' ? '.de' : ''}.html`), fn());
}
console.log(`wrote ${PAGES.length * 2} pages`);
