// The MyEPO card on the Keys page of the Firm admin console (flowleap-os lib/console/server.mjs), for a firm
// installation: only the firm administrator links MyEPO, the secret stays on the host, and one firm process reads the
// docket and the Mailbox into the Firm Record. The page repeats the console's parts (header, navigation, the key cards,
// the change banners, the "Save anyway" form) with client tokens; README.md lists where the console's look differs.

/** The console's own words for its frame and the provider key cards (lib/console/locales/en.json and de.json). */
const C = {
  en: { title: 'Firm admin', budgets: 'Budgets and spend', users: 'Users', keys: 'Keys', models: 'Models', system: 'System', back: 'Back to FlowLeap', signOut: 'Sign out', keysTitle: 'Provider keys', valid: 'Valid', lastTest: 'Last test', newKey: 'New key', replace: 'Replace key', note: 'The console never shows a key. The host side tests each key every hour with a call that uses no tokens.', force: 'Save anyway, without a test' },
  de: { title: 'Kanzleiverwaltung', budgets: 'Budgets und Kosten', users: 'Benutzer', keys: 'Schlüssel', models: 'Modelle', system: 'System', back: 'Zurück zu FlowLeap', signOut: 'Abmelden', keysTitle: 'Anbieterschlüssel', valid: 'Gültig', lastTest: 'Letzte Prüfung', newKey: 'Neuer Schlüssel', replace: 'Schlüssel ersetzen', note: 'Die Konsole zeigt nie einen Schlüssel. Die Host-Seite prüft jeden Schlüssel jede Stunde mit einem Aufruf, der keine Tokens verbraucht.', force: 'Trotzdem speichern, ohne Prüfung' },
};
const LANG_NAMES = ['English', '中文', '日本語', 'Español', 'Français', 'Deutsch', 'Русский', 'Português'];

export function consolePage({ lang, t, page, btn, nm, at, P, LINKED, LINKED_HM, TODAY }) {
  const c = C[lang];
  const off = ' aria-disabled="true"';
  const header = `<header class="cn-head"><a class="cn-brand" href="#"><span data-logo class="cn-mark"></span><span>FlowLeap</span><span class="cn-area">${c.title}</span></a>
<nav class="cn-nav" aria-label="${c.title}"><a href="#">${c.budgets}</a><a href="#">${c.users}</a><a href="#" aria-current="page">${c.keys}</a><a href="#">${c.models}</a><a href="#">${c.system}</a>
<span class="cn-langs">${LANG_NAMES.map(n => n === (lang === 'de' ? 'Deutsch' : 'English') ? `<b>${n}</b>` : `<a href="#">${n}</a>`).join(' ')}</span><a href="#" data-walk="back-to-app" data-href="5-myepo-card.html?state=firm">${c.back}</a><a href="#">${c.signOut}</a></nav></header>`;
  // The model provider cards as the console draws them today, all valid (an example state).
  const providers = ['Anthropic', 'OpenRouter', 'Mistral OCR'].map(name => `<section class="cn-card ok"><h3>${name}</h3><p class="cn-figure">${c.valid}</p><dl class="cn-dl"><dt>${c.lastTest}</dt><dd class="num">${at(TODAY, '08:00')}</dd></dl>
<div class="cn-form"><label><span>${c.newKey}</span><input class="cn-input" type="password" aria-label="${name}: ${c.newKey}"></label>${btn(c.replace)}</div></section>`).join('\n');

  const fields = (label) => `<div class="cn-form"><label><span>${t('Client ID', 'Client-ID')}</span><input class="cn-input" type="password" aria-label="${t('Client ID', 'Client-ID')}"></label><label><span>${t('Client secret', 'Client-Secret')}</span><input class="cn-input" type="password" aria-label="${t('Client secret', 'Client-Secret')}"></label>${label}</div>`;
  const saveBtn = (enabled = true) => btn(t('Test and save', 'Prüfen und speichern'), { kind: 'primary', attrs: enabled ? '' : off });
  const testNote = `<p class="cn-note">${t('FlowLeap gets a token from the EPO and reads the portfolios before it saves the credentials. Credentials that the EPO refuses are not saved.', 'FlowLeap holt ein Token vom EPA und liest die Portfolios, bevor es die Zugangsdaten speichert. Zugangsdaten, die das EPA ablehnt, werden nicht gespeichert.')}</p>`;
  const where = `<p class="cn-note">${t('The credentials stay on the host. One firm process reads the EP docket and the Mailbox for the whole firm and writes them into the Firm Record; each person reads only the matters of their teams. No attorney’s FlowLeap calls MyEPO.', 'Die Zugangsdaten bleiben auf dem Host. Ein Kanzleiprozess liest den EP-Bestand und die Mailbox für die ganze Kanzlei und schreibt sie in den Firm Record; jede Person liest nur die Akten ihrer Teams. Kein FlowLeap einer Anwältin oder eines Anwalts ruft MyEPO auf.')}</p>`;

  const mode = (on, k, h, d, what) => `<div class="opt mode${on ? ' on' : ''}" role="radio" aria-checked="${on}"${k === 'arrival' && !on ? ' data-walk="mode-arrival" data-href="6-console-keys.html?state=arrival"' : ''}${k === 'opened' && !on ? ' data-walk="mode-opened" data-href="6-console-keys.html?state=linked"' : ''}><span class="radio${on ? ' on' : ''}"></span><div><div class="h">${h}</div><div class="d">${d}</div><ul class="what">${what.map(([icon, w]) => `<li data-i="${icon}">${w}</li>`).join('')}</ul></div></div>`;
  const setting = (arrival, saved) => `<div class="cn-part"><h4>${t('Letters from the Mailbox', 'Schreiben aus der Mailbox')}</h4>
<p class="cn-text">${t('A download marks a letter as read in your firm’s MyEPO. Choose when FlowLeap downloads.', 'Ein Download markiert ein Schreiben im MyEPO Ihrer Kanzlei als gelesen. Wählen Sie, wann FlowLeap herunterlädt.')}</p>
<div class="opts" role="radiogroup" aria-label="${t('When FlowLeap downloads a letter', 'Wann FlowLeap ein Schreiben herunterlädt')}">${mode(!arrival, 'opened', t('Download a letter when a person or a task opens it', 'Ein Schreiben herunterladen, wenn eine Person oder eine Aufgabe es öffnet'), t('Default. For the time beside your old docket: MyEPO stays as your team knows it.', 'Standard. Für die Zeit neben Ihrem alten Fristenkalender: MyEPO bleibt, wie Ihr Team es kennt.'), [
    ['check', t('In your MyEPO, a letter stays unread until a person or a task opens it in FlowLeap.', 'In Ihrem MyEPO bleibt ein Schreiben ungelesen, bis eine Person oder eine Aufgabe es in FlowLeap öffnet.')],
    ['check', t('FlowLeap files each letter and computes its deadline at arrival, from the list data.', 'FlowLeap legt jedes Schreiben bei Eingang ab und berechnet seine Frist aus den Listendaten.')],
    ['info', t('The agent prepares the work on a letter only after a person opens it.', 'Der Agent bereitet die Arbeit an einem Schreiben erst vor, wenn eine Person es öffnet.')],
  ])}${mode(arrival, 'arrival', t('Download each letter when it arrives', 'Jedes Schreiben bei Eingang herunterladen'), t('The agent prepares the work before anybody opens the letter.', 'Der Agent bereitet die Arbeit vor, bevor jemand das Schreiben öffnet.'), [
    ['warn', t('In your MyEPO, every letter shows as read a few minutes after it arrives. A person who works in MyEPO no longer sees which letters are new.', 'In Ihrem MyEPO ist jedes Schreiben wenige Minuten nach Eingang als gelesen markiert. Wer in MyEPO arbeitet, sieht nicht mehr, welche Schreiben neu sind.')],
    ['check', t('FlowLeap files each letter and computes its deadline at arrival, from the list data.', 'FlowLeap legt jedes Schreiben bei Eingang ab und berechnet seine Frist aus den Listendaten.')],
    ['check', t('The agent reads the PDF and prepares the work at once.', 'Der Agent liest das PDF und bereitet die Arbeit sofort vor.')],
  ])}</div>
<p class="part-note" data-i="shield">${t('In both modes, FlowLeap never marks a letter as handled in MyEPO.', 'In beiden Modi markiert FlowLeap ein Schreiben in MyEPO nie als erledigt.')}${saved ? ` ${t(`Changed by ${P.felix.name}, ${at(TODAY, '08:40')}. It applies from the next letter.`, `Geändert von ${P.felix.name}, ${at(TODAY, '08:40')}. Es gilt ab dem nächsten Schreiben.`)}` : ''}</p>
<div class="cn-acts">${btn(t('Save setting', 'Einstellung speichern'), { kind: 'primary', attrs: arrival && !saved ? ' data-walk="save"' : off })}</div></div>`;

  const linkedFacts = `<dl class="cn-dl"><dt>${t('Portfolios', 'Portfolios')}</dt><dd>${t('6 that the account may read', '6, die das Konto lesen darf')}</dd><dt>${t('Mailbox access', 'Mailbox-Zugriff')}</dt><dd>${t('Yes', 'Ja')}</dd><dt>${c.lastTest}</dt><dd class="num">${at(LINKED, '14:02')}</dd><dt>${t('Last read of the Mailbox', 'Letzter Abruf der Mailbox')}</dt><dd class="num">${at(TODAY, '09:00')}</dd><dt>${t('Linked by', 'Verbunden von')}</dt><dd>${P.felix.name}</dd></dl>`;
  const replace = `<details class="cn-replace"><summary data-i="chev">${t('Replace credentials', 'Zugangsdaten ersetzen')}</summary>${fields(btn(t('Test and replace', 'Prüfen und ersetzen')))}</details>`;
  const linkedCard = (arrival, saved, banner = '') => `${banner}<section class="cn-card wide ok"><h3>MyEPO</h3><p class="cn-figure"><span class="cstatus"><span class="cst" data-s="ok"></span>${t('Linked', 'Verbunden')}</span></p>${linkedFacts}${replace}<div class="cn-acts">${btn(t('Unlink', 'Verbindung trennen'), { kind: 'ghost' })}</div>${setting(arrival, saved)}${where}</section>`;
  const notLinked = (banner = '', force = false) => `${banner}<section class="cn-card wide${banner ? ' failed' : ''}"><h3>MyEPO</h3><p class="cn-figure"><span class="cstatus"><span class="cst" data-s="idle"></span>${t('Not linked', 'Nicht verbunden')}</span></p>
<p class="cn-text">${t('Your firm’s own MyEPO API account. The EPO sends the client ID and the client secret to your MyEPO company administrator.', 'Das eigene MyEPO-API-Konto Ihrer Kanzlei. Das EPA sendet die Client-ID und das Client-Secret an den Unternehmensadministrator Ihres MyEPO.')}</p>
${fields(saveBtn())}${force ? `<label class="cn-force"><input type="checkbox"> ${c.force}</label>` : ''}${testNote}${where}</section>`;
  const banner = (cls, text) => `<p class="cn-banner ${cls}" role="${cls === 'error' ? 'alert' : 'status'}">${text}</p>`;
  const STATES = {
    default: notLinked(),
    refused: notLinked(banner('error', t('The EPO refused the client ID or the client secret. Nothing was saved.', 'Das EPA hat die Client-ID oder das Client-Secret abgelehnt. Nichts wurde gespeichert.'))),
    untested: notLinked(banner('error', t('The EPO could not be reached, so the credentials were not tested and not saved. To save them without a test, type them again and select "Save anyway".', 'Das EPA war nicht erreichbar, daher wurden die Zugangsdaten weder geprüft noch gespeichert. Um sie ohne Prüfung zu speichern, geben Sie sie erneut ein und wählen Sie „Trotzdem speichern“.')), true),
    done: linkedCard(false, false, banner('done', t('MyEPO is linked: the EPO accepted the credentials, and the account may read 6 portfolios. The firm process reads the docket and the Mailbox from now on.', 'MyEPO ist verbunden: Das EPA hat die Zugangsdaten angenommen, und das Konto darf 6 Portfolios lesen. Der Kanzleiprozess liest ab jetzt den Bestand und die Mailbox.'))),
    linked: linkedCard(false, false),
    arrival: linkedCard(true, false),
    saved: linkedCard(true, true),
  };
  const body = `<div class="cn">${header}
<main class="cn-main"><h1 class="cn-h1">${c.keysTitle}</h1>
<h2 class="cn-h2">${t('Your firm’s EPO account', 'EPA-Konto Ihrer Kanzlei')}</h2>
${Object.entries(STATES).map(([s, html]) => `<div class="cset" data-state="${s}">${html}</div>`).join('\n')}
<h2 class="cn-h2">${t('Model providers', 'Modellanbieter')}</h2>
<div class="cn-cards">${providers}</div>
<p class="cn-note">${c.note}</p></main></div>`;
  return page({ title: `${c.keysTitle} · FlowLeap`, body });
}
