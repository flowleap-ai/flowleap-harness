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

const lede = () => `<div class="ccard-b"><p>${t(
  'Your firm\'s EP applications, EPO Mailbox letters, EPO due dates and pending fees, read with your firm\'s own MyEPO API account.',
  'Die EP-Anmeldungen Ihrer Kanzlei, die Briefe der EPA-Mailbox, die Fristen des EPA und die offenen Gebühren, gelesen mit dem eigenen MyEPO-API-Konto Ihrer Kanzlei.')}</p></div>`;

const reads = () => part(`<ul class="reads">
  <li data-i="matters"><div><div class="w">${t('EP applications', 'EP-Anmeldungen')}</div><div class="d">${t('With your file references, from the portfolios that the account may read.', 'Mit Ihren Aktenzeichen, aus den Portfolios, die das Konto lesen darf.')}</div></div></li>
  <li data-i="mail"><div><div class="w">${t('Mailbox letters', 'Mailbox-Briefe')}</div><div class="d">${t('With the application number, your reference and the document type.', 'Mit der Anmeldenummer, Ihrem Zeichen und der Art des Schriftstücks.')}</div></div></li>
  <li data-i="cal"><div><div class="w">${t('EPO due dates', 'Fristen des EPA')}</div><div class="d">${t('A check of your deadlines. Your deadline stays the source.', 'Eine Prüfung Ihrer Fristen. Ihre Frist bleibt die Quelle.')}</div></div></li>
  <li data-i="fee"><div><div class="w">${t('Pending fees', 'Offene Gebühren')}</div><div class="d">${t('For each application, with the amount and the due date.', 'Für jede Anmeldung, mit Betrag und Fälligkeit.')}</div></div></li>
</ul>
<div class="line" data-i="shield"><div><span class="lead">${t('FlowLeap only reads.', 'FlowLeap liest nur.')}</span> ${t(
  'It does not pay fees, sign, send to the EPO or mark a letter as handled. The client secret stays on this installation and never goes to the agent or a log.',
  'Es zahlt keine Gebühren, unterschreibt nicht, sendet nichts an das EPA und markiert keinen Brief als erledigt. Das Client-Secret bleibt auf dieser Installation und geht nie an den Agenten oder in ein Protokoll.')}</div></div>
${mailboxNote()}`, t('What FlowLeap reads', 'Was FlowLeap liest'));

/** The note on the read flag: a downloaded letter shows as read in MyEPO. */
const mailboxNote = () => `<div class="line" data-i="info"><div><span class="lead">${t('Mailbox letters to Intake come later.', 'Mailbox-Briefe in den Eingang kommen später.')}</span> ${t(
  'When you turn it on, each letter that FlowLeap downloads shows as read in MyEPO. It stays unhandled there.',
  'Wenn Sie ihn einschalten, ist jeder Brief, den FlowLeap herunterlädt, in MyEPO als gelesen markiert. Er bleibt dort unerledigt.')}</div></div>`;

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

const guide = (open = true) => part(open ? `<div class="disclose" data-i="chevd">${t('Set up the account at the EPO', 'Konto beim EPA einrichten')}<span class="right">${t('Your MyEPO administrator does this once', 'Ihre MyEPO-Administration macht das einmal')}</span></div>
<ol class="guide">
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
<div class="line"><span class="ext" data-i="external">${t('EPO guide: APIs for IP management systems', 'EPA-Leitfaden: APIs für IP-Management-Systeme')}</span></div>`
  : `<div class="disclose" data-i="chev">${t('Set up the account at the EPO', 'Konto beim EPA einrichten')}<span class="right">${t('3 steps', '3 Schritte')}</span></div>`);

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
const retryTest = () => btn(t('Test again', 'Erneut testen'), { kind: 'primary', icon: 'retry', act: 'retry', key: 'R' });

const portfolios = () => `<div class="mtbl ports" role="table">
  <div class="tr th" role="row"><span role="columnheader">${t('Portfolio', 'Portfolio')}</span><span role="columnheader">${t('Type', 'Typ')}</span><span role="columnheader">${t('Access', 'Zugriff')}</span></div>
  ${PORTFOLIOS.map(([name, type, full]) => `<div class="tr" role="row"><span role="cell">${nm(name)}</span><span role="cell" class="c2">${TYPE[type]()}</span><span role="cell" class="c2">${full ? t('Full', 'Voll') : t('Limited', 'Eingeschränkt')}</span></div>`).join('\n  ')}
</div>`;

const head = (st, right = '') => `<div class="ccard-h"><span class="ccard-mark" data-i="epo"></span><span class="name">MyEPO</span>${st}${right ? `<span class="right">${right}</span>` : ''}</div>`;

// ---------- the MyEPO card in each state ----------
const CARD = {
  // Not linked: what MyEPO gives, what the firm must do at the EPO, the empty fields.
  default: () => [head(NOT_LINKED()), lede(), reads(), guide(true), fields({ focus: '' }), foot(saveTest(false))],
  // Both fields entered; the guide is closed.
  entering: () => [head(NOT_LINKED()), lede(), reads(), guide(false), fields({ filled: true, focus: 'secret' }), foot(saveTest(true))],
  // Save and test runs: a token first, then the portfolios.
  testing: () => [head(TESTING()), lede(), guide(false), fields({ filled: true, disabled: true }),
    part(`<ul class="run"><li><span class="cst" data-s="ok"></span>${t('Got a token from the EPO', 'Token vom EPA erhalten')}</li><li><span class="cst" data-s="run"></span>${t('Reading the portfolios that the account may read', 'Portfolios lesen, die das Konto lesen darf')}</li><li class="todo"><span class="cst" data-s="idle"></span>${t('Checking Mailbox access', 'Mailbox-Zugriff prüfen')}</li></ul>`, t('Test', 'Test')),
    foot(btn(t('Testing…', 'Wird getestet…'), { kind: 'primary', attrs: off }))],
  // Test passed: the portfolios that the account may read, with type and access.
  passed: () => [head(LINKED()), lede(),
    part(`<div class="res-h"><span class="big">${t('6 portfolios', '6 Portfolios')}</span><span>${t('that the account may read', 'darf das Konto lesen')}</span><span class="when">${t('Tested', 'Getestet')} ${when()}</span></div>
${portfolios()}
<div class="checks"><span class="cstatus"><span class="cst" data-s="ok"></span>${t('Token', 'Token')}</span><span class="cstatus"><span class="cst" data-s="ok"></span>${t('Portfolios', 'Portfolios')}</span><span class="cstatus"><span class="cst" data-s="ok"></span>${t('Mailbox access', 'Mailbox-Zugriff')}</span></div>`, t('Test passed', 'Test bestanden')),
    part(mailboxNote().replace('class="line"', 'class="line first"')),
    foot(linkedActs(), t('FlowLeap reads these portfolios.', 'FlowLeap liest diese Portfolios.'), 'check')],
  // Test passed, but the portfolio list is empty: the administrator must give portfolio permission.
  empty: () => [head(NO_PORTFOLIO()), lede(),
    part(`${notice('wait', 'warn', t('The account may read no portfolio.', 'Das Konto darf kein Portfolio lesen.'), t(
      `The credentials work and the Mailbox answers, but FlowLeap can read no application, due date or fee. Ask your MyEPO company administrator to give the API account permission on your portfolios in ${nm('Applications and patents')}. Then test again.`,
      `Die Zugangsdaten funktionieren und die Mailbox antwortet, aber FlowLeap kann keine Anmeldung, Frist oder Gebühr lesen. Bitten Sie die Unternehmensadministration in MyEPO, dem API-Konto unter ${nm('Applications and patents')} die Freigabe für Ihre Portfolios zu geben. Testen Sie dann erneut.`))}
<div class="checks"><span class="cstatus"><span class="cst" data-s="ok"></span>${t('Token', 'Token')}</span><span class="cstatus"><span class="cst" data-s="wait"></span>${t('No portfolio', 'Kein Portfolio')}</span><span class="cstatus"><span class="cst" data-s="ok"></span>${t('Mailbox access', 'Mailbox-Zugriff')}</span></div>
<div class="line"><span class="ext" data-i="external">${t('EPO guide: APIs for IP management systems', 'EPA-Leitfaden: APIs für IP-Management-Systeme')}</span></div>`, `${t('Tested', 'Getestet')} ${when()}`),
    foot(linkedActs(true), '', '')],
  // Test failed: the EPO refused the client ID or the secret.
  refused: () => [head(FAILED()), lede(),
    part(notice('bad', 'warn', t('The EPO refused the client ID or the client secret.', 'Das EPA hat die Client-ID oder das Client-Secret abgelehnt.'), t(
      'Check both values against the EPO\'s e-mail to your MyEPO administrator, enter them again, then save and test. FlowLeap reads nothing with these credentials.',
      'Prüfen Sie beide Werte in der E-Mail des EPA an Ihre MyEPO-Administration, geben Sie sie erneut ein und speichern und testen Sie. FlowLeap liest mit diesen Zugangsdaten nichts.'))),
    guide(false), fields({ focus: 'id' }), foot(saveTest(false))],
  // Test failed: the EPO did not answer.
  offline: () => [head(FAILED()), lede(),
    part(notice('bad', 'warn', t('The EPO did not answer.', 'Das EPA hat nicht geantwortet.'), t(
      'FlowLeap could not get a token. The stored credentials did not change. Check that this installation can reach the EPO, then try again.',
      'FlowLeap hat kein Token erhalten. Die gespeicherten Zugangsdaten haben sich nicht geändert. Prüfen Sie, ob diese Installation das EPA erreicht, und versuchen Sie es dann erneut.'))),
    foot(`${btn(t('Replace credentials', 'Zugangsdaten ersetzen'), { kind: 'secondary', icon: 'key' })}${retry()}`, `${t('Last test passed', 'Letzter bestandener Test')} ${when()}`, 'clock')],
  // Linked: the card on a later visit.
  linked: () => [head(LINKED()),
    `<div class="ccard-b"><div class="summary"><span><b>${t('6 portfolios', '6 Portfolios')}</b></span><span>${t('Mailbox access', 'Mailbox-Zugriff')}</span><span>${t('Last test', 'Letzter Test')} ${when()}</span></div></div>`,
    part(`<div class="intake" data-i="mail"><div><div class="w">${t('Mailbox letters to Intake', 'Mailbox-Briefe in den Eingang')}</div><div class="d">${t(
      'Comes later. When it is on, each letter that FlowLeap downloads shows as read in MyEPO. FlowLeap does not mark it as handled.',
      'Kommt später. Wenn er eingeschaltet ist, ist jeder Brief, den FlowLeap herunterlädt, in MyEPO als gelesen markiert. FlowLeap markiert ihn nicht als erledigt.')}</div></div>${status('idle', t('Off', 'Aus'))}</div>`),
    foot(linkedActs(), '', '')],
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
