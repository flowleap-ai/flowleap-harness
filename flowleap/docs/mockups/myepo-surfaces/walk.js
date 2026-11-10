// The clickable walkthrough of the MyEPO surfaces mockups, from the client model walk.js. Open
// 6-console-keys.html?state=linked&walk=1 (German: 6-console-keys.de.html?state=linked&walk=1), or start it from index.html:
// each step names the page and its state, says what the person sees, and marks the one control that goes to the next
// step. Without ?walk the pages stay plain mockups, so the design checks never see the walkthrough panel.
(() => {
  const de = document.documentElement.lang === 'de';
  const tr = (en, deText) => (de ? deText : en);
  // [page, state, title, what to do, the control that goes on (`auto`: on by itself; null: the end)]
  const STEPS = [
    ['6-console-keys', 'linked', tr('Felix Neumann links MyEPO for the firm', 'Felix Neumann verbindet MyEPO für die Kanzlei'), tr('The Firm admin console, Keys: MyEPO is linked, and the secret stays on the host. Only the administrator chooses when FlowLeap downloads a letter. Click the other mode.', 'Die Kanzleiverwaltung, Schlüssel: MyEPO ist verbunden, und das Secret bleibt auf dem Host. Nur der Administrator wählt, wann FlowLeap ein Schreiben herunterlädt. Klicken Sie auf den anderen Modus.'), '[data-walk=mode-arrival]'],
    ['6-console-keys', 'arrival', tr('Download each letter when it arrives', 'Jedes Schreiben bei Eingang herunterladen'), tr('The card says what this changes in your firm’s MyEPO: every letter shows as read. This walkthrough keeps the default: click it again.', 'Die Karte sagt, was sich im MyEPO Ihrer Kanzlei ändert: Jedes Schreiben ist als gelesen markiert. Dieser Rundgang behält den Standard: Klicken Sie ihn wieder an.'), '[data-walk=mode-opened]'],
    ['6-console-keys', 'linked', tr('Back to FlowLeap', 'Zurück zu FlowLeap'), tr('The firm process reads the docket and the Mailbox from now on. Click Back to FlowLeap.', 'Der Kanzleiprozess liest ab jetzt den Bestand und die Mailbox. Klicken Sie auf „Zurück zu FlowLeap“.'), '[data-walk=back-to-app]'],
    ['5-myepo-card', 'firm', tr('Dr. Martin Krüger sees the card in the app', 'Dr. Martin Krüger sieht die Karte in der App'), tr('On a firm installation the app card has no field: only the facts, and the note that the administrator links MyEPO. The single-user card is below for comparison. Click Import your EP docket.', 'Auf einer Kanzleiinstallation hat die App-Karte kein Feld: nur die Fakten und den Hinweis, dass der Administrator MyEPO verbindet. Die Einzelplatz-Karte steht zum Vergleich darunter. Klicken Sie auf „EP-Bestand importieren“.'), '[data-walk=import]'],
    ['1a-docket', 'reading', tr('Dr. Martin Krüger imports the docket', 'Dr. Martin Krüger importiert den Bestand'), tr('FlowLeap reads the 7 applications and the applicant names of each one.', 'FlowLeap liest die 7 Anmeldungen und die Anmeldernamen jeder Anmeldung.'), 'auto'],
    ['1a-docket', 'default', tr('Import 1 of 4: Docket', 'Import 1 von 4: Bestand'), tr('7 applications, 4 applicant names, 3 proposed clients. Click Next.', '7 Anmeldungen, 4 Anmeldernamen, 3 vorgeschlagene Mandanten. Klicken Sie auf „Weiter“.'), '[data-walk=next]'],
    ['1b-clients', 'default', tr('Import 2 of 4: Clients', 'Import 2 von 4: Mandanten'), tr('One list to confirm. Phoenix Contact has two spellings and is one client. Click Next.', 'Eine Liste zum Bestätigen. Phoenix Contact hat zwei Schreibweisen und ist ein Mandant. Klicken Sie auf „Weiter“.'), '[data-walk=next]'],
    ['1c-conflict', 'default', tr('Import 3 of 4: Conflict check', 'Import 3 von 4: Kollisionsprüfung'), tr('No conflict among the 3 clients. Click Next.', 'Keine Kollision unter den 3 Mandanten. Klicken Sie auf „Weiter“.'), '[data-walk=next]'],
    ['1d-review', 'default', tr('Import 4 of 4: Review', 'Import 4 von 4: Prüfen'), tr('Every choice with Edit. The one primary act records the import. Click Import 3 clients.', 'Alle Angaben mit „Bearbeiten“. Die eine Hauptaktion erfasst den Import. Klicken Sie auf „3 Mandanten importieren“.'), '[data-walk=record]'],
    ['1e-record', 'default', tr('Import: record', 'Import: erfassen'), tr('FlowLeap writes the clients and the matters.', 'FlowLeap schreibt die Mandanten und die Akten.'), 'auto'],
    ['1e-record', 'done', tr('The docket is imported', 'Der Bestand ist importiert'), tr('FlowLeap starts to read the Mailbox. Click Open clients to go on to the next morning.', 'FlowLeap beginnt, die Mailbox zu lesen. Klicken Sie auf „Mandanten öffnen“, um zum nächsten Morgen zu gehen.'), '[data-walk=open]'],
    ['2-letters', 'unopened', tr('Lena Hoffmann opens Letters', 'Lena Hoffmann öffnet „Schreiben“'), tr('The Rule 71(3) communication of SF-2023-0045 is listed, not opened. FlowLeap filed it and computed and confirmed its deadline from the list data. Click Open the letter.', 'Die Mitteilung nach Regel 71(3) zu SF-2023-0045 ist gelistet, nicht geöffnet. FlowLeap hat sie abgelegt und ihre Frist aus den Listendaten berechnet und bestätigt. Klicken Sie auf „Schreiben öffnen“.'), '[data-walk=open-letter]'],
    ['2-letters', 'default', tr('The letter is open', 'Das Schreiben ist geöffnet'), tr('The PDF, the matter and the deadline. MyEPO now shows the letter as read. Click Show the calculation.', 'Das PDF, die Akte und die Frist. MyEPO zeigt das Schreiben jetzt als gelesen. Klicken Sie auf „Berechnung zeigen“.'), '[data-walk=calc]'],
    ['3-deadline', 'default', tr('Confirmed automatically', 'Automatisch bestätigt'), tr('The three conditions of decision 6, the sources, the rule and the steps with their citations. Click Deadlines.', 'Die drei Bedingungen von Entscheidung 6, die Quellen, die Regel und die Schritte mit ihren Fundstellen. Klicken Sie auf „Fristen“.'), '[data-walk=crumb]'],
    ['3-deadlines', 'default', tr('Deadlines by due date', 'Fristen nach Fristende'), tr('Two deadlines have no date yet, one is overdue. The dates also go to Outlook. Click Month.', 'Zwei Fristen haben noch kein Datum, eine ist überfällig. Die Daten gehen auch in Outlook. Klicken Sie auf „Monat“.'), '[data-walk=tab-month]'],
    ['3-deadlines', 'month', tr('The month view', 'Die Monatsansicht'), tr('A legal deadline cannot move, so there is no drag and drop. Click 1 overdue.', 'Eine gesetzliche Frist kann sich nicht verschieben, darum gibt es kein Ziehen und Ablegen. Klicken Sie auf „1 überfällig“.'), '[data-walk=month-over]'],
    ['3-deadline', 'person', tr('A deadline that needs a person', 'Eine Frist, die eine Person braucht'), tr('Overdue, with its two reasons: the rule version is not signed, and the sources differ. Confirm deadline is in the footer. Now Jonas Weber, who is screened from this matter: click Letters.', 'Überfällig, mit ihren zwei Gründen: Die Regelversion ist nicht unterschrieben, und die Quellen weichen ab. „Frist bestätigen“ steht in der Fußzeile. Jetzt Jonas Weber, der von dieser Akte ausgeschlossen ist: Klicken Sie auf „Schreiben“.'), '[data-walk=sb-letters]'],
    ['2-letters', 'jonas', tr('The wall: Jonas Weber’s Letters', 'Der Bereich: „Schreiben“ von Jonas Weber'), tr('Only the letters of his teams. SF-2022-0024 shows no row and no count, because he is screened from it. Now Dr. Anna Becker: click My work.', 'Nur die Schreiben seiner Teams. SF-2022-0024 zeigt keine Zeile und keine Zahl, weil er davon ausgeschlossen ist. Jetzt Dr. Anna Becker: Klicken Sie auf „Meine Arbeit“.'), '[data-walk=sb-mywork]'],
    ['4-my-work', 'default', tr('My work of Dr. Anna Becker', '„Meine Arbeit“ von Dr. Anna Becker'), tr('Three MyEPO items in the My work that exists: a deadline with no rule, a letter that FlowLeap cannot file, and prepared work. Click Look at this letter.', 'Drei MyEPO-Einträge in der bestehenden „Meine Arbeit“: eine Frist ohne Regel, ein Schreiben, das FlowLeap nicht ablegen kann, und vorbereitete Arbeit. Klicken Sie auf „Dieses Schreiben ansehen“.'), '[data-walk=exception]'],
    ['2-letter', 'x1', tr('End: a letter with no application number', 'Ende: ein Schreiben ohne Anmeldenummer'), tr('FlowLeap says why it cannot file the letter. Restart the walkthrough, or open the screens one by one from the review page.', 'FlowLeap sagt, warum es das Schreiben nicht ablegen kann. Starten Sie den Rundgang neu, oder öffnen Sie die Seiten einzeln von der Übersichtsseite.'), null],
  ];
  // Below 1366 px the Letters list fills the view and a letter opens on its own page (R20), so the walkthrough goes there.
  const file = (name, state = '') => `${name === '2-letters' && state !== 'jonas' && innerWidth < 1366 ? '2-letter' : name}${de ? '.de' : ''}.html`;
  const q = new URLSearchParams(location.search);
  const theme = q.get('theme') ? `&theme=${q.get('theme')}` : '';
  const url = (n, forward = false) => `${file(STEPS[n - 1][0], STEPS[n - 1][1])}?state=${STEPS[n - 1][1]}&walk=${n}${theme}${forward ? '&go=1' : ''}`;
  const go = n => { location.href = url(n, true); };
  const n = Number(q.get('walk'));
  if (!n || !STEPS[n - 1]) return;
  const [, , title, hint, target] = STEPS[n - 1];
  const last = n === STEPS.length;
  const panel = document.createElement('aside');
  panel.className = 'walk';
  panel.setAttribute('aria-label', tr('Walkthrough', 'Rundgang'));
  panel.innerHTML = `<div class="walk-h"><span>${tr('Walkthrough', 'Rundgang')}</span><span class="num">${tr(`${n} of ${STEPS.length}`, `${n} von ${STEPS.length}`)}</span></div>
<div class="walk-dots" aria-hidden="true">${STEPS.map((_, i) => `<span${i < n ? ' class="on"' : ''}></span>`).join('')}</div>
<div class="walk-t">${title}</div><div class="walk-d">${hint}</div>
<div class="walk-f">${n > 1 ? `<a class="btn btn-ghost" href="${url(n - 1)}">${tr('Back', 'Zurück')}</a>` : `<a class="btn btn-ghost" href="${file('index')}">${tr('Review page', 'Übersicht')}</a>`}<a class="btn btn-secondary" href="${last ? url(1, true) : url(n + 1, true)}">${last ? tr('Restart', 'Neu starten') : tr('Next', 'Weiter')}</a></div>`;
  document.body.append(panel);
  const el = target && target !== 'auto' && [...document.querySelectorAll(target)].find(e => e.offsetParent !== null || e.getClientRects().length);
  // On a narrow view the marked control can be in the hidden sidebar or top bar; Next in the panel then goes on.
  if (!el && target && target !== 'auto') panel.querySelector('.walk-f .btn-secondary').classList.add('walk-target');
  if (el) {
    el.classList.add('walk-target');
    el.scrollIntoView({ block: 'nearest' });
    const a = el.getBoundingClientRect(), b = panel.getBoundingClientRect();
    if (a.bottom > b.top && a.top < b.bottom && a.right > b.left && a.left < b.right) panel.classList.add('top');
    el.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); go(n + 1); }, true);
  }
  document.addEventListener('click', e => {
    const link = e.target.closest('a[href], [data-href]');
    if (!link || panel.contains(link) || link === el) return;
    e.preventDefault();
    e.stopPropagation();
    panel.classList.remove('nudge');
    void panel.offsetWidth;
    panel.classList.add('nudge');
  }, true);
  if (target === 'auto' && q.get('go')) setTimeout(() => go(n + 1), 2500);
})();
