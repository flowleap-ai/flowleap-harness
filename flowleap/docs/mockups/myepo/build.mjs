// Writes the MyEPO card mockup in English (myepo.html) and German (myepo.de.html) from this one source.
// Usage: node build.mjs. Edit this file, never the generated HTML. The portfolios are the dummy data of the EPO sandbox
// (GET /portfolios, read on 2026-11-09 after the reset); the rights are those of the approved MyEPO study.
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const OUT = import.meta.dirname;
const RECORDS_CSS = '../../../../.agents/skills/flowleap-design-language/references/mockups/records.css';

// ---------- data ----------
// The EPO sandbox portfolios: name, type, hasFullAccess.
const PORTFOLIOS = [
  ['Applicant Portfolio 1', 'applicant', true], ['Representative Portfolio 1', 'representative', true],
  ['Association Portfolio 1', 'association', true], ['Applicant Portfolio 2', 'applicant', false],
  ['Representative Portfolio 2', 'representative', false], ['Association Portfolio 2', 'association', false],
];
const TESTED = '2026-11-09', TESTED_HM = '14:02';

let lang = 'en';
const t = (en, de) => (lang === 'de' ? de : en);

// ---------- words and formats ----------
const MO = { en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], de: ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'] };
const date = iso => { const [y, m, d] = iso.split('-').map(Number); return lang === 'de' ? `${d}. ${MO.de[m - 1]} ${y}` : `${d} ${MO.en[m - 1]} ${y}`; };
const when = () => t(`${date(TESTED)}, ${TESTED_HM}`, `${date(TESTED)}, ${TESTED_HM}`);
/** A MyEPO menu name or a value as MyEPO writes it: not product copy, so the deny-list does not apply. */
const nm = s => `<span data-verbatim>${s}</span>`;
const TYPE = { applicant: () => t('Applicant', 'Anmelder'), representative: () => t('Representative', 'Vertreter'), association: () => t('Association', 'Zusammenschluss') };

// ---------- parts ----------
const btn = (label, { kind = 'secondary', icon = '', cls = '', attrs = '', key = '', act = '' } = {}) =>
  `<span class="btn btn-${kind}${cls ? ` ${cls}` : ''}"${icon ? ` data-i="${icon}"` : ''}${act ? ` data-act="${act}"` : ''} role="button"${attrs}>${label}${key ? ` <span class="kbd">${key}</span>` : ''}</span>`;
const off = ' aria-disabled="true"';
/** A link state of the connector: the status shape of the design language and its word. Not an atlas state. */
const status = (s, word) => `<span class="cstatus"><span class="cst" data-s="${s}"></span>${word}</span>`;
const notice = (cls, icon, lead, rest) => `<div class="notice${cls ? ` ${cls}` : ''}" data-i="${icon}" role="${cls === 'bad' ? 'alert' : 'status'}"><div><span class="lead">${lead}</span> <span>${rest}</span></div></div>`;
const part = (inner, label = '') => `<div class="ccard-part">${label ? `<div class="label-12">${label}</div>` : ''}${inner}</div>`;
const retry = () => btn(t('Try again', 'Erneut versuchen'), { kind: 'primary', icon: 'retry', act: 'retry', key: 'R' });

const NOT_LINKED = () => status('idle', t('Not linked', 'Nicht verbunden'));
const TESTING = () => status('run', t('Testing', 'Wird getestet'));
const LINKED = () => status('ok', t('Linked', 'Verbunden'));
const NO_PORTFOLIO = () => status('wait', t('Waits for portfolio permission', 'Wartet auf Portfolio-Freigabe'));
const FAILED = () => status('bad', t('Test failed', 'Test fehlgeschlagen'));

/** The short intro: the account, the four things that FlowLeap reads, and the two notes that every firm must see. */
const intro = () => `<div class="ccard-b"><p>${t('Uses your firm\'s own MyEPO API account. FlowLeap reads:', 'Nutzt das eigene MyEPO-API-Konto Ihrer Kanzlei. FlowLeap liest:')}</p>
<div class="rchips">${READS().map(([icon, w]) => `<span class="rchip" data-i="${icon}">${w}</span>`).join('')}</div>
<div class="line" data-i="shield"><div>${t('Read only. FlowLeap never pays, signs, sends or marks a letter as handled.', 'Nur lesen. FlowLeap zahlt nie, unterschreibt nie, sendet nie und markiert keinen Brief als erledigt.')}</div></div>
${readFlag()}</div>`;

/** The note on the read flag: a downloaded letter shows as read in MyEPO. */
const readFlag = () => `<div class="line" data-i="info"><div>${t('A letter that FlowLeap downloads shows as read in MyEPO.', 'Ein Brief, den FlowLeap herunterlädt, ist in MyEPO als gelesen markiert.')}</div></div>`;

const READS = () => [
  ['matters', t('EP applications', 'EP-Anmeldungen'), t('With your file references, from the portfolios that the account may read.', 'Mit Ihren Aktenzeichen, aus den Portfolios, die das Konto lesen darf.')],
  ['mail', t('Mailbox letters', 'Mailbox-Briefe'), t('With the application number, your reference and the document type. Mailbox letters to Intake come later; a downloaded letter then shows as read in MyEPO and stays unhandled there.', 'Mit der Anmeldenummer, Ihrem Zeichen und der Art des Schriftstücks. Mailbox-Briefe in den Eingang kommen später; ein heruntergeladener Brief ist dann in MyEPO als gelesen markiert und bleibt dort unerledigt.')],
  ['cal', t('EPO due dates', 'Fristen des EPA'), t('A check of your deadlines. Your deadline stays the source.', 'Eine Prüfung Ihrer Fristen. Ihre Frist bleibt die Quelle.')],
  ['fee', t('Pending fees', 'Offene Gebühren'), t('For each application, with the amount and the due date.', 'Für jede Anmeldung, mit Betrag und Fälligkeit.')],
];

/** One row that opens with a click: its title, a one-line summary, and the content when open. */
const disclosure = (title, summary, open, content) => `<div class="disc${open ? ' open' : ''}">
<div class="disc-h" role="button" aria-expanded="${open}" data-i="${open ? 'chevd' : 'chev'}"><span class="w">${title}</span><span class="right">${summary}</span></div>
${open ? `<div class="disc-b">${content}</div>` : ''}</div>`;

const details = (open = false) => disclosure(t('What FlowLeap reads', 'Was FlowLeap liest'), t('The details of the 4 sources and where the secret stays', 'Die Einzelheiten der 4 Quellen und wo das Secret bleibt'), open,
  `<ul class="reads">${READS().map(([icon, w, d]) => `<li data-i="${icon}"><div><div class="w">${w}</div><div class="d">${d}</div></div></li>`).join('')}</ul>
<div class="line" data-i="lock"><div>${t('The client secret stays on this installation and never goes to the agent or a log.', 'Das Client-Secret bleibt auf dieser Installation und geht nie an den Agenten oder in ein Protokoll.')}</div></div>`);

const RIGHTS = () => [
  ['Mailbox access', t('Yes', 'Ja'), 'check', t('The API reads the Mailbox only with this right.', 'Die API liest die Mailbox nur mit diesem Recht.')],
  ['Fee payment rights', t('No rights', 'Keine Rechte'), 'minus', t('FlowLeap does not pay fees.', 'FlowLeap zahlt keine Gebühren.')],
  ['Admin rights', t('No', 'Nein'), 'minus', t('The account must not change members or rights.', 'Das Konto darf keine Mitglieder oder Rechte ändern.')],
  ['Signing rights', t('No', 'Nein'), 'minus', t('FlowLeap does not sign.', 'FlowLeap unterschreibt nicht.')],
  ['Sending rights', t('No', 'Nein'), 'minus', t('FlowLeap does not send to the EPO.', 'FlowLeap sendet nichts an das EPA.')],
];
const rights = () => `<div class="mtbl rights" role="table">
  <div class="tr th" role="row"><span role="columnheader">${t('Right in MyEPO', 'Recht in MyEPO')}</span><span role="columnheader">${t('Setting', 'Einstellung')}</span><span role="columnheader">${t('Why', 'Warum')}</span></div>
  ${RIGHTS().map(([r, v, i, why]) => `<div class="tr" role="row"><span role="cell">${nm(r)}</span><span role="cell" class="set" data-i="${i}">${v}</span><span role="cell" class="c2">${why}</span></div>`).join('\n  ')}
</div>`;

const setup = (open = false) => disclosure(t('Set up the account at the EPO', 'Konto beim EPA einrichten'), t('3 steps that your MyEPO administrator does once', '3 Schritte, die Ihre MyEPO-Administration einmal macht'), open, `<ol class="guide">
  <li><div><div class="w">${t('Ask the EPO for API access', 'API-Zugang beim EPA anfragen')}</div><div class="d">${t(
    'Your MyEPO company administrator writes to <span data-address>support@epo.org</span> and asks for production client credentials for the MyEPO API. The EPO sends a client ID and a client secret to the administrator.',
    'Die Unternehmensadministration Ihrer Kanzlei in MyEPO schreibt an <span data-address>support@epo.org</span> und fragt nach Produktions-Zugangsdaten für die MyEPO-API. Das EPA sendet eine Client-ID und ein Client-Secret an die Administration.')}</div></div></li>
  <li><div><div class="w">${t('Give the account only these rights', 'Dem Konto nur diese Rechte geben')}</div><div class="d">${t(
    `In MyEPO, open <span class="path">${nm('Admin area › Group members')}</span> and select the API account.`,
    `Öffnen Sie in MyEPO <span class="path">${nm('Admin area › Group members')}</span> und wählen Sie das API-Konto.`)}</div>${rights()}</div></li>
  <li><div><div class="w">${t('Give it permission on your portfolios', 'Freigabe für Ihre Portfolios geben')}</div><div class="d">${t(
    `In <span class="path">${nm('Applications and patents')}</span>, give the API account permission on each portfolio that FlowLeap may read. Without it, FlowLeap reads no application.`,
    `Geben Sie dem API-Konto unter <span class="path">${nm('Applications and patents')}</span> die Freigabe für jedes Portfolio, das FlowLeap lesen darf. Ohne Freigabe liest FlowLeap keine Anmeldung.`)}</div></div></li>
</ol>
<div class="line"><span class="ext" data-i="external">${t('EPO guide: APIs for IP management systems', 'EPA-Leitfaden: APIs für IP-Management-Systeme')}</span></div>`);

/** The two collapsed rows of a card, in one part. */
const more = ({ reads = false, guide = false, withReads = true } = {}) => `<div class="ccard-part discs">${withReads ? details(reads) : ''}${setup(guide)}</div>`;

const DOTS = '••••••••••••••••••••••••';
/** The two credential fields as the client's SettingsSecretField draws them: label, stored-state badge, write-only field. */
const fields = ({ filled = false, disabled = false, focus = '' } = {}) => part(`<div class="fields">
  ${[['id', t('Client ID', 'Client-ID')], ['secret', t('Client secret', 'Client-Secret')]].map(([k, label]) => `<label class="fld"><span class="fld-h"><span class="lbl">${label}</span><span class="tag">${t('Not set', 'Nicht gesetzt')}</span></span><span class="inp${filled ? ' filled' : ''}${focus === k ? ' focus' : ''}"${disabled ? off : ''}>${filled ? DOTS : ''}</span></label>`).join('\n  ')}
</div>
<div class="fhint">${t('Write-only. FlowLeap never shows a stored value. Enter both fields to replace the stored credentials.', 'Nur schreibbar. FlowLeap zeigt einen gespeicherten Wert nie an. Füllen Sie beide Felder aus, um die gespeicherten Zugangsdaten zu ersetzen.')}</div>`, t('Credentials from the EPO', 'Zugangsdaten vom EPA'));

const foot = (acts, note = t('The credentials stay on this installation.', 'Die Zugangsdaten bleiben auf dieser Installation.'), noteIcon = 'lock') =>
  `<div class="ccard-f"><span class="note"${noteIcon ? ` data-i="${noteIcon}"` : ''}>${note}</span><div class="acts">${acts}</div></div>`;
const saveTest = (enabled) => btn(t('Save and test', 'Speichern und testen'), { kind: 'primary', attrs: enabled ? '' : off });
const linkedActs = (primaryTest = false) => `${btn(t('Unlink', 'Verbindung trennen'), { kind: 'ghost' })}${btn(t('Replace credentials', 'Zugangsdaten ersetzen'), { kind: 'secondary', icon: 'key' })}${primaryTest ? retryTest() : btn(t('Test', 'Testen'), { kind: 'secondary', icon: 'retry' })}`;
/** The acts of a linked card in its header: Test, and the menu with Replace credentials and Unlink. */
const headActs = () => `${btn(t('Test', 'Testen'), { kind: 'secondary', icon: 'retry' })}<span class="iconbtn boxed" data-i="dots" role="button" aria-label="${t('More acts: Replace credentials, Unlink', 'Weitere Aktionen: Zugangsdaten ersetzen, Verbindung trennen')}"></span>`;
const retryTest = () => btn(t('Test again', 'Erneut testen'), { kind: 'primary', icon: 'retry', act: 'retry', key: 'R' });

const portfolios = () => `<div class="mtbl ports" role="table">
  <div class="tr th" role="row"><span role="columnheader">${t('Portfolio', 'Portfolio')}</span><span role="columnheader">${t('Type', 'Typ')}</span><span role="columnheader">${t('Access', 'Zugriff')}</span></div>
  ${PORTFOLIOS.map(([name, type, full]) => `<div class="tr" role="row"><span role="cell">${nm(name)}</span><span role="cell" class="c2">${TYPE[type]()}</span><span role="cell" class="c2">${full ? t('Full', 'Voll') : t('Limited', 'Eingeschränkt')}</span></div>`).join('\n  ')}
</div>`;

const head = (st, right = '') => `<div class="ccard-h"><span class="ccard-mark" data-i="epo"></span><span class="name">MyEPO</span>${st}${right ? `<span class="right">${right}</span>` : ''}</div>`;

// ---------- the MyEPO card in each state ----------
const CARD = {
  // Not linked: the short intro, the two collapsed rows, the empty fields.
  default: () => [head(NOT_LINKED()), intro(), more(), fields(), foot(saveTest(false))],
  // Not linked, with both rows open: one click on each row shows this.
  setup: () => [head(NOT_LINKED()), intro(), more({ reads: true, guide: true }), fields(), foot(saveTest(false))],
  // Both fields entered.
  entering: () => [head(NOT_LINKED()), intro(), more(), fields({ filled: true, focus: 'secret' }), foot(saveTest(true))],
  // Save and test runs: a token first, then the portfolios.
  testing: () => [head(TESTING()), fields({ filled: true, disabled: true }),
    part(`<ul class="run"><li><span class="cst" data-s="ok"></span>${t('Got a token from the EPO', 'Token vom EPA erhalten')}</li><li><span class="cst" data-s="run"></span>${t('Reading the portfolios that the account may read', 'Portfolios lesen, die das Konto lesen darf')}</li><li class="todo"><span class="cst" data-s="idle"></span>${t('Checking Mailbox access', 'Mailbox-Zugriff prüfen')}</li></ul>`, t('Test', 'Test')),
    foot(btn(t('Testing…', 'Wird getestet…'), { kind: 'primary', attrs: off }))],
  // Test passed: the portfolios that the account may read, with type and access.
  passed: () => [head(LINKED(), headActs()),
    part(`<div class="res-h"><span class="big">${t('6 portfolios', '6 Portfolios')}</span><span>${t('that the account may read', 'darf das Konto lesen')}</span><span class="when">${t('Tested', 'Getestet')} ${when()}</span></div>
${portfolios()}
<div class="checks"><span class="cstatus"><span class="cst" data-s="ok"></span>${t('Token', 'Token')}</span><span class="cstatus"><span class="cst" data-s="ok"></span>${t('Portfolios', 'Portfolios')}</span><span class="cstatus"><span class="cst" data-s="ok"></span>${t('Mailbox access', 'Mailbox-Zugriff')}</span></div>
${readFlag()}`, t('Test passed', 'Test bestanden')),
    more()],
  // Test passed, but the portfolio list is empty: the administrator must give portfolio permission.
  empty: () => [head(NO_PORTFOLIO()),
    part(`${notice('wait', 'warn', t('The account may read no portfolio.', 'Das Konto darf kein Portfolio lesen.'), t(
      `The credentials work and the Mailbox answers, but FlowLeap can read no application, due date or fee. Ask your MyEPO company administrator to give the API account permission on your portfolios in ${nm('Applications and patents')} (step 3 of the setup). Then test again.`,
      `Die Zugangsdaten funktionieren und die Mailbox antwortet, aber FlowLeap kann keine Anmeldung, Frist oder Gebühr lesen. Bitten Sie die Unternehmensadministration in MyEPO, dem API-Konto unter ${nm('Applications and patents')} die Freigabe für Ihre Portfolios zu geben (Schritt 3 der Einrichtung). Testen Sie dann erneut.`))}
<div class="checks"><span class="cstatus"><span class="cst" data-s="ok"></span>${t('Token', 'Token')}</span><span class="cstatus"><span class="cst" data-s="wait"></span>${t('No portfolio', 'Kein Portfolio')}</span><span class="cstatus"><span class="cst" data-s="ok"></span>${t('Mailbox access', 'Mailbox-Zugriff')}</span></div>`, `${t('Tested', 'Getestet')} ${when()}`),
    more(), foot(linkedActs(true), '', '')],
  // Test failed: the EPO refused the client ID or the secret.
  refused: () => [head(FAILED()),
    part(notice('bad', 'warn', t('The EPO refused the client ID or the client secret.', 'Das EPA hat die Client-ID oder das Client-Secret abgelehnt.'), t(
      'Check both values against the EPO\'s e-mail to your MyEPO administrator, enter them again, then save and test. FlowLeap reads nothing with these credentials.',
      'Prüfen Sie beide Werte in der E-Mail des EPA an Ihre MyEPO-Administration, geben Sie sie erneut ein und speichern und testen Sie. FlowLeap liest mit diesen Zugangsdaten nichts.'))),
    more(), fields({ focus: 'id' }), foot(saveTest(false))],
  // Test failed: the EPO did not answer.
  offline: () => [head(FAILED()),
    part(notice('bad', 'warn', t('The EPO did not answer.', 'Das EPA hat nicht geantwortet.'), t(
      'FlowLeap could not get a token. The stored credentials did not change. Check that this installation can reach the EPO, then try again.',
      'FlowLeap hat kein Token erhalten. Die gespeicherten Zugangsdaten haben sich nicht geändert. Prüfen Sie, ob diese Installation das EPA erreicht, und versuchen Sie es dann erneut.'))),
    foot(`${btn(t('Replace credentials', 'Zugangsdaten ersetzen'), { kind: 'secondary', icon: 'key' })}${retry()}`, `${t('Last test passed', 'Letzter bestandener Test')} ${when()}`, 'clock')],
  // Linked: the card on a later visit. Status and acts, one summary line, the collapsed setup.
  linked: () => [head(LINKED(), headActs()),
    `<div class="ccard-b"><div class="summary"><span><b>${t('6 portfolios', '6 Portfolios')}</b></span><span>${t('Mailbox access', 'Mailbox-Zugriff')}</span><span>${t('Last test', 'Letzter Test')} ${when()}</span></div></div>`,
    more({ withReads: false })],
};
const STATES = Object.keys(CARD);

// ---------- the other connectors, as the client draws them today ----------
const OLD = () => [
  ['EPO OPS', true, t('Open Patent Services consumer key and secret. Powers patent search, bibliographic data, families, legal status and the EP Register.', 'Consumer Key und Secret für Open Patent Services. Für Patentsuche, bibliografische Daten, Familien, Rechtsstand und das EP-Register.'), [t('Consumer key', 'Consumer Key'), t('Consumer secret', 'Consumer Secret')]],
  ['USPTO ODP', true, t('Open Data Portal API key. Powers US application data, file wrappers, continuity and citations.', 'API-Schlüssel des Open Data Portal. Für US-Anmeldedaten, Akteninhalte, Fortsetzungen und Zitate.'), [t('API key', 'API-Schlüssel')]],
  ['Semantic Scholar', false, t('Optional API key. Raises the rate limit of academic search; arXiv needs no key.', 'Optionaler API-Schlüssel. Erhöht das Abfragelimit der Literatursuche; arXiv braucht keinen Schlüssel.'), [t('API key', 'API-Schlüssel')]],
  ['Mistral', true, t('API key for OCR of scanned documents and PDFs. Billed by Mistral for each page.', 'API-Schlüssel für die Texterkennung gescannter Dokumente und PDFs. Mistral rechnet pro Seite ab.'), [t('API key', 'API-Schlüssel')]],
].map(([name, on, hint, fs]) => `<div class="ccard old">
  <div class="ccard-h"><span class="name">${name}</span><span class="tag${on ? ' info' : ''}">${on ? t('Configured', 'Konfiguriert') : t('Not configured', 'Nicht konfiguriert')}</span></div>
  <div class="ccard-b"><p>${hint}</p><div class="fields">${fs.map(f => `<label class="fld"><span class="fld-h"><span class="lbl">${f}</span><span class="tag">${on ? t('Stored', 'Gespeichert') : t('Not set', 'Nicht gesetzt')}</span></span><span class="inp"></span></label>`).join('')}</div>
  <div>${btn(t('Save', 'Speichern'), { kind: 'secondary', attrs: off })}${on ? ` ${btn(t('Test connection', 'Verbindung testen'))} ${btn(t('Remove', 'Entfernen'))}` : ''}</div></div>
</div>`).join('\n');

// ---------- the page ----------
const html = () => `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t('MyEPO connector', 'MyEPO-Anbindung')}</title>
<!-- Generated from build.mjs: edit that file and run node build.mjs, never this file -->
<link rel="stylesheet" href="${RECORDS_CSS}">
<link rel="stylesheet" href="myepo.css">
</head>
<body>
<div class="app">
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
      <p class="sec-intro">${t('FlowLeap reads your firm\'s EPO account and the patent data services with the firm\'s own keys. Keys stay in the credential store, never in the settings file, and FlowLeap never shows them again after you save them.', 'FlowLeap liest das EPA-Konto Ihrer Kanzlei und die Patentdatendienste mit den eigenen Schlüsseln der Kanzlei. Die Schlüssel bleiben im Zugangsdatenspeicher, nie in der Einstellungsdatei, und FlowLeap zeigt sie nach dem Speichern nie wieder an.')}</p>
      <div class="grp-h">${t('Your firm\'s EPO account', 'EPA-Konto Ihrer Kanzlei')}</div>
${STATES.map(s => `      <div class="ccard myepo" data-state="${s}">
${CARD[s]().join('\n')}
      </div>`).join('\n')}
      <div class="grp-h">${t('Patent data', 'Patentdaten')}</div>
      <div class="cards">
${OLD()}
      </div>
    </div>
  </div>
</div>
<script src="frame.js"></script>
</body>
</html>
`;

for (const l of ['en', 'de']) {
  lang = l;
  writeFileSync(path.join(OUT, l === 'en' ? 'myepo.html' : 'myepo.de.html'), html());
}
console.log(`wrote myepo.html and myepo.de.html with the states: ${STATES.join(', ')}`);
