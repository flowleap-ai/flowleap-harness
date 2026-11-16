// The deadline rule pages of sheet 08 (process atlas, PR 391): the table of the rules, the review of one rule version
// with its decision, a new version of a signed rule, the daily control list and the weekly audit sample. The rule is
// Rule 71(3) EPC, version 1, of flowleap-deadlines; its steps, citations, golden cases and oracle are real. The FlowLeap
// review, the firm's signature, version 2 and the shadow numbers are example premises, marked on the pages.

/** Rule 71(3) EPC version 1 computed on seed letters and golden cases (flowleap-deadlines, 2026-11-10). */
const EXAMPLES = [
  { kind: 'open', key: 'SF-2023-0045', letter: '2026-09-29', steps: [['2026-09-30', 'start'], ['2027-01-29', 'add'], ['2027-01-29', 'open']], due: '2027-01-29', cite: 'OJ EPO 2026, A30' },
  { kind: 'weekend', key: 'SF-2022-0024', letter: '2026-04-01', steps: [['2026-04-02', 'start'], ['2026-08-01', 'add'], ['2026-08-03', 'roll-weekend']], due: '2026-08-03', cite: 'OJ EPO 2025, A40' },
  { kind: 'closure', key: 'SF-2021-0011', letter: '2025-08-29', steps: [['2025-08-30', 'start'], ['2025-12-29', 'add'], ['2026-01-02', 'roll-closure']], due: '2026-01-02', cite: 'OJ EPO 2024, A91 · OJ EPO 2025, A40' },
  { kind: 'month-end', key: '', letter: '2025-10-31', steps: [['2025-11-01', 'start'], ['2026-02-28', 'month-end'], ['2026-03-02', 'roll-weekend']], due: '2026-03-02', cite: 'OJ EPO 2025, A40' },
];
const GOLDEN = 51, ORACLE_DAYS = 1583, SEED_COMPUTED = 7;

export function rulePages(h) {
  const { t, page, btn, nm, at, date, long, P, app_, topbar, crumb, work, section, notice, table, select, find, exNote, draft, iconbtn, off, LINKED, LINKED_HM, TODAY } = h;
  const cs = (s, word) => `<span class="cstatus"><span class="cst" data-s="${s}"></span>${word}</span>`;
  const RSTATE = {
    planned: () => cs('idle', t('Not in the library yet', 'Noch nicht in der Bibliothek')),
    unreviewed: () => cs('idle', t('Not reviewed', 'Nicht geprüft')),
    reviewed: () => cs('wait', t('Reviewed by FlowLeap', 'Von FlowLeap geprüft')),
    signed: () => cs('ok', t('Signed for this firm', 'Für diese Kanzlei unterschrieben')),
    revoked: () => cs('bad', t('Revoked', 'Widerrufen')),
  };
  const RULE = () => t('Rule 71(3) EPC', 'Regel 71(3) EPÜ');
  const plain = () => t('The reply to the communication under Rule 71(3) EPC: approve the text for grant, pay the fees and file the claim translations.', 'Die Antwort auf die Mitteilung nach Regel 71(3) EPÜ: der Fassung zustimmen, die Gebühren zahlen und die Übersetzungen der Ansprüche einreichen.');
  const tabs = on => `<div class="tabs"><a class="tab${on === 'table' ? ' is-on' : ''}" data-i="table" href="3-deadlines.html">${t('Table', 'Tabelle')}</a><a class="tab${on === 'month' ? ' is-on' : ''}" data-i="grid" href="3-deadlines.html?state=month">${t('Month', 'Monat')}</a><a class="tab${on === 'rules' ? ' is-on' : ''}" data-i="scale" href="7-rules.html" data-walk="tab-rules">${t('Rules', 'Regeln')}</a></div>`;
  const checksActs = () => `<a class="btn btn-ghost" data-i="check" href="8-control-list.html" data-walk="control">${t('Control list', 'Kontrollliste')}</a><a class="btn btn-ghost hide-sm" data-i="eye" href="9-audit.html">${t('Audit sample', 'Prüfstichprobe')}</a>`;
  const top = (here, right = '') => topbar(here ? crumb('calendar', t('Deadline rules', 'Fristenregeln'), here, '7-rules.html') : crumb('calendar', t('Deadlines', 'Fristen')), right, here ? '' : tabs('rules'));

  // ---------- 7-rules: the table of the rules ----------
  function rulesTable() {
    const rows = [
      { id: 'r71v1', words: t('Reply to a Rule 71(3) communication: four months', 'Antwort auf eine Mitteilung nach Regel 71(3): vier Monate'), basis: 'Rule 71(3), 126(2), 131(4), 134(1) EPC', version: '1', from: '2023-11-01', state: 'signed', who: `${P.martin.name}, ${date('2026-11-02')}`, mode: t('Automatic', 'Automatisch'), modeEx: true, n: SEED_COMPUTED, href: '7-rule.html?state=signed' },
      { id: 'r71v2', words: t('Reply to a Rule 71(3) communication: four months', 'Antwort auf eine Mitteilung nach Regel 71(3): vier Monate'), basis: 'Rule 71(3), 126(2), 131(4), 134(1) EPC', version: '2', from: '2027-04-01', state: 'reviewed', who: '', mode: t('A person confirms each one', 'Eine Person bestätigt jede'), n: 0, href: '7-rule.html?state=v2', ex: true },
      { id: 'a94', words: t('Reply to an Article 94(3) communication: the period that the letter states', 'Antwort auf einen Bescheid nach Artikel 94(3): die Frist, die das Schreiben nennt'), basis: 'Art. 94(3) EPC, Rule 132 EPC', version: '', from: '', state: 'planned', who: '', mode: t('A person enters each date', 'Eine Person trägt jedes Datum ein'), n: 0 },
      { id: 'r70a', words: t('Reply to the invitation under Rule 70a EPC', 'Antwort auf die Aufforderung nach Regel 70a EPÜ'), basis: 'Rule 70a EPC', version: '', from: '', state: 'planned', who: '', mode: t('A person enters each date', 'Eine Person trägt jedes Datum ein'), n: 0 },
      { id: 'r62a', words: t('Reply to the invitation under Rule 62a or 63 EPC', 'Antwort auf die Aufforderung nach Regel 62a oder 63 EPÜ'), basis: 'Rules 62a, 63 EPC', version: '', from: '', state: 'planned', who: '', mode: t('A person enters each date', 'Eine Person trägt jedes Datum ein'), n: 0 },
    ];
    const cols = [
      { key: 'words', label: t('Rule', 'Regel'), cls: 'c-rule' },
      { key: 'basis', label: t('Legal basis', 'Rechtsgrundlage'), cls: 'c-basis w-md', sort: false },
      { key: 'version', label: t('Version', 'Version'), cls: 'c-ver' },
      { key: 'state', label: t('State', 'Stand'), cls: 'c-rstate' },
      { key: 'who', label: t('Signed by', 'Unterschrieben von'), cls: 'c-who w-md', sort: false },
      { key: 'mode', label: t('Confirmation', 'Bestätigung'), cls: 'c-mode', sort: false },
      { key: 'n', label: t('Deadlines computed', 'Berechnete Fristen'), cls: 'c-num' },
    ];
    const trs = rows.map(r => ({
      href: r.href, attrs: r.id === 'r71v1' ? ' data-walk="rule-row"' : '',
      values: { words: r.words.toLowerCase(), version: r.version || '9', state: r.state, n: r.n, text: `${r.words} ${r.basis}`.toLowerCase() },
      cells: [`${r.words}${r.ex ? ` ${exNote()}` : ''}`, `<span class="muted">${r.basis}</span>`, r.version ? `<span class="num">${r.version}</span><div class="muted t12">${t(`from ${date(r.from)}`, `ab ${date(r.from)}`)}</div>` : '<span class="muted">–</span>', RSTATE[r.state](), r.who || '<span class="muted">–</span>', `${r.mode}${r.modeEx ? ` ${exNote(t('Example premise', 'Beispielannahme'))}` : ''}`, `<span class="num">${int(r.n)}</span>`],
    }));
    const filters = `<div class="dt-filters">${find(t('Find a rule', 'Regel suchen'))}${select('state', t('State', 'Stand'), [['signed', t('Signed for this firm', 'Für diese Kanzlei unterschrieben')], ['reviewed', t('Reviewed by FlowLeap', 'Von FlowLeap geprüft')], ['planned', t('Not in the library yet', 'Noch nicht in der Bibliothek')]])}</div>`;
    const body = `${top('', `${checksActs()}`)}
      <div class="list-pane dl-page">
        <div class="lt-head"><div class="eyebrow">${draft()}</div><h1 class="title">${t('Deadline rules', 'Fristenregeln')}</h1><p class="lede">${t('Each rule computes one kind of EPO deadline. An attorney of your firm reviews a rule version one time; FlowLeap then applies it to every letter of that kind.', 'Jede Regel berechnet eine Art von EPA-Frist. Eine Anwältin oder ein Anwalt Ihrer Kanzlei prüft eine Regelversion einmal; FlowLeap wendet sie dann auf jedes Schreiben dieser Art an.')}</p>
        <p class="wall-line t12" data-i="info">${t('Your firm’s level is “A person confirms each deadline”, except for the rules that a partner allows to confirm automatically.', 'Die Stufe Ihrer Kanzlei ist „Eine Person bestätigt jede Frist“, außer für die Regeln, die ein Partner automatisch bestätigen lässt.')} ${exNote(t('Example premise', 'Beispielannahme'))}</p></div>
        ${table({ cols, rows: trs, sortKey: 'words', filters, cls: 'rl-tbl' })}
      </div>`;
    return page({ title: t('Deadline rules', 'Fristenregeln'), body: app_({ person: 'martin', side: 'deadlines', body }) });
  }
  const int = n => n.toLocaleString(t('en-GB', 'de-DE'));

  // ---------- 7-rule: one rule version, its review and its decision ----------
  const STEP = {
    delivery: () => [t('The letter is delivered on the date it bears.', 'Das Schreiben gilt an dem Datum als zugestellt, das es trägt.'), 'Rule 126(2) EPC · Rule 127(2) EPC · OJ EPO 2023, A29'],
    start: () => [t('The period starts on the next day.', 'Die Frist beginnt am nächsten Tag.'), 'Rule 131(2) EPC'],
    add: () => [t('It ends four months later, on the day with the same number. When that month has no such day, it ends on the last day of the month.', 'Sie endet vier Monate später, am Tag mit derselben Zahl. Hat dieser Monat keinen solchen Tag, endet sie am letzten Tag des Monats.'), 'Rule 71(3) EPC · Rule 131(4) EPC'],
    roll: () => [t('When an EPO filing office is closed on that day, the period ends on the next day on which all of them are open.', 'Ist an diesem Tag eine Annahmestelle des EPA geschlossen, endet die Frist am nächsten Tag, an dem alle geöffnet sind.'), t('Rule 134(1) EPC · the EPO notice of the closing days of each year', 'Regel 134(1) EPÜ · die EPA-Mitteilung der Schließtage jedes Jahres')],
  };
  const ruleSteps = () => `<ol class="rsteps">${['delivery', 'start', 'add', 'roll'].map((k, i) => { const [w, c] = STEP[k](); return `<li><span class="rs-n num">${i + 1}</span><div><div class="rs-w">${w}</div><div class="rs-c">${c}</div></div></li>`; }).join('')}</ol>
<ul class="found-list rs-not"><li data-i="info">${t('FlowLeap gives a note, not another date, when the letter arrived later than Rule 126(2) EPC allows. A person checks that case.', 'FlowLeap gibt einen Hinweis, kein anderes Datum, wenn das Schreiben später ankam, als Regel 126(2) EPÜ zulässt. Eine Person prüft diesen Fall.')}</li><li data-i="info">${t('The rule does not compute further processing, a disruption of the EPO services, or an extension after a failure of electronic filing. A person checks these.', 'Die Regel berechnet keine Weiterbehandlung, keine Störung der EPA-Dienste und keine Verlängerung nach einem Ausfall der elektronischen Einreichung. Eine Person prüft diese.')}</li></ul>`;
  const SLABEL = {
    start: () => t('The period starts', 'Die Frist beginnt'),
    add: () => t('Four months later', 'Vier Monate später'),
    'month-end': () => t('Four months later: February has no 31st, so its last day', 'Vier Monate später: Der Februar hat keinen 31., also sein letzter Tag'),
    open: () => t('The EPO is open: the date stays', 'Das EPA ist geöffnet: Das Datum bleibt'),
    'roll-weekend': () => t('Saturday or Sunday: the next open day', 'Samstag oder Sonntag: der nächste offene Tag'),
    'roll-closure': () => t('The EPO is closed from 24 Dec to 1 Jan: the next open day', 'Das EPA ist vom 24. Dez. bis 1. Jan. geschlossen: der nächste offene Tag'),
  };
  const EXTITLE = { open: () => t('A plain case', 'Ein einfacher Fall'), weekend: () => t('The end falls on a Saturday', 'Das Ende fällt auf einen Samstag'), closure: () => t('The end falls in the EPO closure at the year end', 'Das Ende fällt in die Schließzeit des EPA zum Jahresende'), 'month-end': () => t('A month end', 'Ein Monatsende') };
  const examples = () => `<div class="ex-grid">${EXAMPLES.map(e => `<div class="ex-card"><div class="ex-h"><span class="h">${EXTITLE[e.kind]()}</span><span class="muted t12">${e.key ? `<span class="num">${e.key}</span>` : t('A golden case, no seed letter', 'Ein Prüffall, kein Seed-Schreiben')}</span></div>
<dl class="ex-dl"><dt>${t('Letter dated', 'Schreiben vom')}</dt><dd class="num">${long(e.letter)}</dd>${e.steps.map(([d, k]) => `<dt>${SLABEL[k]()}</dt><dd class="num">${long(d)}</dd>`).join('')}<dt class="strong">${t('Due date', 'Fristende')}</dt><dd class="num strong">${long(e.due)}</dd></dl><div class="muted t12">${e.cite}</div></div>`).join('')}</div>`;
  const evidence = () => `<ul class="checks-list">
<li class="ck ok"><span class="ck-i" data-i="check"></span><div><div class="h">${t(`${GOLDEN} test cases, each derived from the legal text`, `${GOLDEN} Prüffälle, jeder aus dem Gesetzestext abgeleitet`)}</div><div class="d">${t('Month ends, Saturdays, closing days that are not weekends, the year-end closure, late receipt, and letters dated before the rule took effect.', 'Monatsenden, Samstage, Schließtage außerhalb des Wochenendes, die Schließzeit zum Jahresende, späte Zustellung und Schreiben vor dem Inkrafttreten der Regel.')}</div></div></li>
<li class="ck ok"><span class="ck-i" data-i="check"></span><div><div class="h">${t(`An independent second calculation agrees for every letter date from 1 Sep 2023 to 31 Dec 2027: ${int(ORACLE_DAYS)} dates`, `Eine unabhängige zweite Berechnung stimmt für jedes Schreibendatum vom 1. Sept. 2023 bis 31. Dez. 2027 überein: ${int(ORACLE_DAYS)} Daten`)}</div><div class="d">${t('It has its own copy of the closing days of each year.', 'Sie hat ihre eigene Kopie der Schließtage jedes Jahres.')}</div></div></li>
<li class="ck ok"><span class="ck-i" data-i="check"></span><div><div class="h">${t('Real files: the Rule 71(3) communications of the seed firm', 'Echte Akten: die Mitteilungen nach Regel 71(3) der Seed-Kanzlei')}</div><div class="d">${t('Seven letters of five applications, for example EP 23 771 920.8 with the due date 29 Jan 2027.', 'Sieben Schreiben aus fünf Anmeldungen, zum Beispiel EP 23 771 920.8 mit dem Fristende 29. Jan. 2027.')}</div></div></li>
</ul>`;
  const shadowNone = () => `<p class="plain">${t('Not started. Shadow mode compares each deadline of this rule with the date of your old docket, and FlowLeap shows each difference here. A rule confirms automatically only after 300 compared deadlines with no FlowLeap error.', 'Noch nicht begonnen. Der Schattenbetrieb vergleicht jede Frist dieser Regel mit dem Datum Ihres alten Fristenkalenders, und FlowLeap zeigt hier jede Abweichung. Eine Regel bestätigt erst nach 300 verglichenen Fristen ohne FlowLeap-Fehler automatisch.')}</p>`;
  const shadowSome = () => `<div class="shadow-facts">${[[int(41), t('deadlines compared', 'Fristen verglichen')], ['1', t('difference', 'Abweichung')], ['0', t('FlowLeap errors', 'FlowLeap-Fehler')]].map(([n, w]) => `<div class="kf"><div class="kn num">${n}</div><div class="kw">${w}</div></div>`).join('')}</div>
<div class="diff-row"><a class="lnk num" href="3-deadline.html">SF-2023-0045</a><span>${t('The old docket has 15 Jan 2027, FlowLeap 29 Jan 2027. Class: a convention of the firm (the internal reminder date entered as the due date).', 'Der alte Fristenkalender hat den 15. Jan. 2027, FlowLeap den 29. Jan. 2027. Art: eine Gewohnheit der Kanzlei (das interne Vorfristdatum als Fristende eingetragen).')}</span></div>
<p class="src-line t12">${exNote()} ${t('41 of the 300 compared deadlines that the rule needs before it may confirm automatically.', '41 der 300 verglichenen Fristen, die die Regel braucht, bevor sie automatisch bestätigen darf.')}</p>`;
  function ruleReview() {
    const head = (v, stateHtml) => `<div class="eyebrow">${stateHtml}${draft()}</div><h1 class="title">${t(`Rule 71(3) EPC, version ${v}`, `Regel 71(3) EPÜ, Version ${v}`)}</h1><p class="lede">${plain()}</p>
<div class="pane-props"><div class="prop"><span class="k">${t('In force', 'Gültig')}</span><span class="v">${v === '1' ? t('For letters dated from 1 Nov 2023', 'Für Schreiben ab dem 1. Nov. 2023') : t('For letters dated from 1 Apr 2027', 'Für Schreiben ab dem 1. Apr. 2027')}</span></div><div class="prop"><span class="k">${t('FlowLeap review', 'FlowLeap-Prüfung')}</span><span class="v">${t('Reviewed by FlowLeap’s patent attorney', 'Von der Patentanwältin oder dem Patentanwalt von FlowLeap geprüft')} ${exNote(t('Example premise', 'Beispielannahme'))}</span></div><div class="prop"><span class="k">${t('Deadlines computed', 'Berechnete Fristen')}</span><span class="v num">${v === '1' ? int(SEED_COMPUTED) : '0'}</span></div></div>`;
    const laws = `<div class="law-chips">${[['Rule 71 EPC', 'https://www.epo.org/en/legal/epc/2020/r71.html'], ['Rule 126 EPC', 'https://www.epo.org/en/legal/epc/2020/r126.html'], ['Rule 131 EPC', 'https://www.epo.org/en/legal/epc/2020/r131.html'], ['Rule 134 EPC', 'https://www.epo.org/en/legal/epc/2020/r134.html'], ['OJ EPO 2023, A29', 'https://www.epo.org/en/legal/official-journal/2023/03/a29']].map(([l, u]) => `<a class="law-chip" href="${u}" data-i="external">${l}</a>`).join('')}</div>`;
    const changedV1 = `<p class="plain">${t('This is the first version. There is no earlier version to compare.', 'Das ist die erste Version. Es gibt keine frühere Version zum Vergleich.')}</p>`;
    const changedV2 = `<ul class="found-list"><li data-i="warn">${t('Step 1 changes: a letter is delivered on the day after the date it bears. The other steps stay the same.', 'Schritt 1 ändert sich: Ein Schreiben gilt am Tag nach seinem Datum als zugestellt. Die anderen Schritte bleiben gleich.')} ${exNote(t('Example: not a real change of the law', 'Beispiel: keine echte Gesetzesänderung'))}</li><li data-i="info">${t('Version 1 stays the rule for every letter dated before 1 Apr 2027.', 'Version 1 bleibt die Regel für jedes Schreiben vor dem 1. Apr. 2027.')}</li></ul>`;
    const openOfV1 = `<div class="mtbl src-tbl" role="table"><div class="tr th" role="row"><span role="columnheader">${t('Deadline', 'Frist')}</span><span role="columnheader">${t('What happens', 'Was geschieht')}</span><span role="columnheader">${t('Due date', 'Fristende')}</span></div>
<div class="tr" role="row"><span role="cell"><a class="lnk num" href="3-deadline.html">SF-2023-0045</a></span><span role="cell">${t('No change: the letter of 29 Sep 2026 keeps version 1.', 'Keine Änderung: Das Schreiben vom 29. Sept. 2026 behält Version 1.')}</span><span role="cell" class="num">${date('2027-01-29')}</span></div>
<div class="tr" role="row"><span role="cell">${t('A letter dated from 1 Apr 2027', 'Ein Schreiben ab dem 1. Apr. 2027')}</span><span role="cell">${t('Version 2 computes it. Until your firm signs version 2, a person confirms each of these deadlines.', 'Version 2 berechnet sie. Bis Ihre Kanzlei Version 2 unterschreibt, bestätigt eine Person jede dieser Fristen.')}</span><span role="cell" class="muted">–</span></div></div>`;
    const sectionsFor = v => `${section(t('The rule in plain words', 'Die Regel in einfachen Worten'), `${ruleSteps()}${laws}`)}
${section(t('Worked examples', 'Durchgerechnete Beispiele'), examples())}
${section(t('What changed against the earlier version', 'Was sich gegenüber der früheren Version geändert hat'), v === '1' ? changedV1 : changedV2)}
${v === '2' ? section(t('Open deadlines of version 1', 'Offene Fristen von Version 1'), openOfV1) : ''}
${section(t('How FlowLeap tested it', 'Wie FlowLeap sie getestet hat'), evidence())}`;
    const shadowSec = some => section(t('Shadow mode', 'Schattenbetrieb'), some ? shadowSome() : shadowNone());
    const foot = (v, state) => state === 'sendback'
      ? `          <div class="decision wiz-foot">
            ${btn(t('Cancel', 'Abbrechen'), { kind: 'ghost', attrs: ' data-href="7-rule.html"' })}
            <span class="note">${t('FlowLeap’s reviewing attorney gets your reason. The version stays unsigned, so a person confirms each of its deadlines.', 'Die prüfende Anwältin oder der prüfende Anwalt von FlowLeap erhält Ihre Begründung. Die Version bleibt nicht unterschrieben, darum bestätigt eine Person jede ihrer Fristen.')}</span>
            ${btn(t('Send back', 'Zurückgeben'), { kind: 'primary', cls: 'btn-lg', act: 'record', attrs: off })}
          </div>`
      : `          <div class="decision wiz-foot">
            ${btn(t('Send back…', 'Zurückgeben…'), { kind: 'ghost', act: 'reject', attrs: ` data-href="7-rule.html?state=sendback"` })}
            <span class="note">${t(`You sign version ${v} for your firm. FlowLeap records your name, the time and the 51 test cases that you saw.`, `Sie unterschreiben Version ${v} für Ihre Kanzlei. FlowLeap erfasst Ihren Namen, die Zeit und die 51 Prüffälle, die Sie gesehen haben.`)}</span>
            ${btn(t('Sign for this firm', 'Für diese Kanzlei unterschreiben'), { kind: 'primary', icon: 'pen', cls: 'btn-lg', act: 'record', attrs: v === '1' ? ' data-walk="sign" data-href="7-rule.html?state=signed"' : '' })}
          </div>`;
    const signedLine = `<div class="section">${notice('', 'check', t(`Signed for this firm by ${P.martin.name}, ${at('2026-11-02', '16:20')}.`, `Für diese Kanzlei unterschrieben von ${P.martin.name}, ${at('2026-11-02', '16:20')}.`), `${t('A signer or a partner can revoke the signature with a reason; each open deadline of the version then goes to a person.', 'Eine unterschreibende Person oder ein Partner kann die Unterschrift mit Begründung widerrufen; jede offene Frist der Version geht dann an eine Person.')} ${exNote(t('Example premise', 'Beispielannahme'))}`, btn(t('Revoke…', 'Widerrufen…'), { kind: 'ghost' }))}</div>`;
    const newVersion = `<div class="section">${notice('warn', 'info', t('Version 2 of this rule arrived with a FlowLeap update.', 'Version 2 dieser Regel kam mit einem FlowLeap-Update.'), `${t('It computes nothing automatically until your firm signs it.', 'Sie berechnet nichts automatisch, bis Ihre Kanzlei sie unterschreibt.')} <a class="lnk" href="7-rule.html?state=v2" data-walk="v2">${t('Review version 2', 'Version 2 prüfen')}</a>`)}</div>`;
    const reasonBox = `<div class="section"><div class="field-label reason-h">${t('Why you send it back', 'Warum Sie sie zurückgeben')}</div><textarea class="reason-field" aria-label="${t('Reason', 'Begründung')}" placeholder="${t('Reason', 'Begründung')}"></textarea></div>`;
    const views = {
      default: [head('1', RSTATE.reviewed()), `${sectionsFor('1')}${shadowSec(false)}`, foot('1', 'default')],
      sendback: [head('1', RSTATE.reviewed()), `${reasonBox}${sectionsFor('1')}`, foot('1', 'sendback')],
      signed: [head('1', RSTATE.signed()), `${signedLine}${newVersion}${sectionsFor('1')}${shadowSec(true)}`, ''],
      v2: [head('2', RSTATE.reviewed()), `${sectionsFor('2')}`, foot('2', 'default')],
    };
    const body = Object.entries(views).map(([s, [hd, rest, dock]]) => `<div class="cset" data-state="${s}">${top(t(`Rule 71(3) EPC, version ${s === 'v2' ? 2 : 1}`, `Regel 71(3) EPÜ, Version ${s === 'v2' ? 2 : 1}`), checksActs())}
${work(`${hd}${rest}`, dock)}</div>`).join('\n');
    return page({ title: t('Deadline rule', 'Fristenregel'), body: app_({ person: 'martin', side: 'deadlines', body }) });
  }

  // ---------- 8-control-list: the deadlines that became active without a person on one day ----------
  const autoRow = () => ({
    values: { text: 'sf-2023-0045' },
    cells: [`<a class="lnk num" href="3-deadline.html">SF-2023-0045</a><div class="muted t12">Renishaw</div>`, `${t('Rule 71(3) communication', 'Mitteilung nach Regel 71(3)')}<div class="muted t12">${t(`of ${date('2026-09-29')}`, `vom ${date('2026-09-29')}`)}</div>`, t('Rule 71(3) EPC, version 1', 'Regel 71(3) EPÜ, Version 1'), `<span class="num">${date('2027-01-29')}</span>`, `<span class="num">${date('2027-01-29')}</span> ${exNote()}`, `<a class="btn btn-ghost btn-sm" data-i="eye" href="3-deadline.html">${t('Evidence', 'Nachweise')}</a>`],
  });
  const ACOLS = () => [
    { key: 'key', label: t('Matter', 'Akte'), cls: 'c-key', sort: false },
    { key: 'letter', label: t('Letter', 'Schreiben'), cls: 'c-ev', sort: false },
    { key: 'rule', label: t('Rule', 'Regel'), cls: 'c-ruleshort w-md', sort: false },
    { key: 'engine', label: t('Computed date', 'Berechnetes Datum'), cls: 'c-date', sort: false },
    { key: 'epo', label: t('EPO due date', 'Frist des EPA'), cls: 'c-date', sort: false },
    { key: 'ev', label: '', cls: 'c-evl', sort: false },
  ];
  function controlList() {
    const head = `<div class="eyebrow">${draft()}</div><h1 class="title">${t('Daily control list: Monday, 9 November 2026', 'Tägliche Kontrollliste: Montag, 9. November 2026')}</h1><p class="lede">${t('The deadlines that became active that day without a person. Check each row against its evidence, then record one check for the list.', 'Die Fristen, die an diesem Tag ohne eine Person aktiv wurden. Prüfen Sie jede Zeile an ihren Nachweisen und erfassen Sie dann eine Prüfung für die Liste.')}</p>`;
    const tbl = table({ cols: ACOLS(), rows: [autoRow()], foot: false, cls: 'au-tbl' });
    const views = {
      default: [`${head}<div class="section">${tbl}</div>`, `          <div class="decision wiz-foot">
            ${btn(t('Print', 'Drucken'), { kind: 'ghost', icon: 'doc' })}
            <span class="note">${t('One check for the whole list. If nobody checks it in the time that your firm sets, the firm goes back to “A person confirms each deadline”.', 'Eine Prüfung für die ganze Liste. Prüft sie niemand in der Zeit, die Ihre Kanzlei festlegt, geht die Kanzlei zurück zu „Eine Person bestätigt jede Frist“.')}</span>
            ${btn(t('Record the check', 'Prüfung erfassen'), { kind: 'primary', icon: 'check', cls: 'btn-lg', act: 'record', attrs: ' data-walk="check-list" data-href="8-control-list.html?state=checked"' })}
          </div>`],
      checked: [`${head}<div class="section">${notice('', 'check', t(`Checked by ${P.lena.name}, ${at(TODAY, '08:55')}.`, `Geprüft von ${P.lena.name}, ${at(TODAY, '08:55')}.`), `<a class="lnk" href="9-audit.html" data-walk="audit">${t('Open the weekly audit sample', 'Wöchentliche Prüfstichprobe öffnen')}</a>`)}</div><div class="section">${tbl}</div>`, ''],
    };
    const body = Object.entries(views).map(([s, [scroll, dock]]) => `<div class="cset" data-state="${s}">${topbar(crumb('calendar', t('Deadlines', 'Fristen'), t('Control list', 'Kontrollliste'), '3-deadlines.html'), '')}
${work(scroll, dock)}</div>`).join('\n');
    return page({ title: t('Control list', 'Kontrollliste'), body: app_({ person: 'lena', side: 'deadlines', body }) });
  }

  // ---------- 9-audit: the weekly random sample of the automatic deadlines ----------
  function audit() {
    const result = (chosen) => `<div class="seg" role="radiogroup" aria-label="${t('Result', 'Ergebnis')}"><span class="${chosen ? 'on' : ''}" role="radio" aria-checked="${chosen}"${chosen ? '' : ' data-walk="correct" data-href="9-audit.html?state=ready"'}>${t('Correct', 'Richtig')}</span><span role="radio" aria-checked="false">${t('Error…', 'Fehler…')}</span></div>`;
    const cols = [...ACOLS(), { key: 'res', label: t('Result', 'Ergebnis'), cls: 'c-res', sort: false }];
    const rowWith = chosen => { const r = autoRow(); r.cells = [...r.cells, result(chosen)]; return r; };
    const head = `<div class="eyebrow">${draft()}</div><h1 class="title">${t('Audit sample: week of 9 November 2026', 'Prüfstichprobe: Woche ab 9. November 2026')}</h1><p class="lede">${t('A random sample of the deadlines that became active without a person this week: at least 5, at least 5 %, and one of each rule. This week 1 deadline became active automatically, so the sample is that one.', 'Eine Zufallsstichprobe der Fristen, die diese Woche ohne eine Person aktiv wurden: mindestens 5, mindestens 5 % und eine je Regel. Diese Woche wurde 1 Frist automatisch aktiv, darum ist die Stichprobe diese eine.')} ${exNote()}</p>`;
    const note = t('One error removes the rule from automatic confirmation at once and sends its automatic deadlines of the period that your firm sets to a person.', 'Ein Fehler nimmt die Regel sofort aus der automatischen Bestätigung und gibt ihre automatischen Fristen des Zeitraums, den Ihre Kanzlei festlegt, an eine Person.');
    const foot = enabled => `          <div class="decision wiz-foot">
            <span class="note">${enabled ? note : t('Record the audit waits for a result in each row.', '„Prüfung erfassen“ wartet auf ein Ergebnis in jeder Zeile.')}</span>
            ${btn(t('Record the audit', 'Stichprobe erfassen'), { kind: 'primary', icon: 'check', cls: 'btn-lg', act: 'record', attrs: enabled ? ' data-walk="record-audit" data-href="9-audit.html?state=recorded"' : off })}
          </div>`;
    const views = {
      default: [`${head}<div class="section">${table({ cols, rows: [rowWith(false)], foot: false, cls: 'au-tbl' })}</div>`, foot(false)],
      ready: [`${head}<div class="section">${table({ cols, rows: [rowWith(true)], foot: false, cls: 'au-tbl' })}</div>`, foot(true)],
      recorded: [`${head}<div class="section">${notice('', 'check', t(`Recorded by ${P.martin.name}, ${at(TODAY, '10:05')}: 1 of 1 correct.`, `Erfasst von ${P.martin.name}, ${at(TODAY, '10:05')}: 1 von 1 richtig.`))}</div><div class="section">${table({ cols, rows: [rowWith(true)], foot: false, cls: 'au-tbl' })}</div>`, ''],
    };
    const body = Object.entries(views).map(([s, [scroll, dock]]) => `<div class="cset" data-state="${s}">${topbar(crumb('calendar', t('Deadlines', 'Fristen'), t('Audit sample', 'Prüfstichprobe'), '3-deadlines.html'), '')}
${work(scroll, dock)}</div>`).join('\n');
    return page({ title: t('Audit sample', 'Prüfstichprobe'), body: app_({ person: 'martin', side: 'deadlines', body }) });
  }

  return { tabs, rulesTable, ruleReview, controlList, audit };
}
