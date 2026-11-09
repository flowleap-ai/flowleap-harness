// The clickable walkthrough of the client model mockups. Open 0-clients.html?walk=1 (German: 0-clients.de.html?walk=1):
// each step names the page and its state, says what the person sees, and marks the one control that goes to the next
// step. Without ?walk the pages stay plain mockups, so the design checks never see the walkthrough panel.
(() => {
  const de = document.documentElement.lang === 'de';
  const tr = (en, deText) => (de ? deText : en);
  // [page, state, title, what to do, the control that goes on (none: Next; `auto`: on by itself)]
  const STEPS = [
    ['0-clients', 'default', tr('The Clients list', 'Die Mandantenliste'), tr('Clients in the sidebar opens the list of your firm’s clients. Click Add client.', '„Mandanten“ in der Seitenleiste öffnet die Liste der Mandanten Ihrer Kanzlei. Klicken Sie auf „Mandant hinzufügen“.'), '[data-walk=add]'],
    ['3-find', 'empty', tr('Add client: find the company', 'Mandant hinzufügen: das Unternehmen finden'), tr('Click the field and type the company name.', 'Klicken Sie in das Feld und geben Sie den Namen des Unternehmens ein.'), '[data-walk=field]'],
    ['3-find', 'default', tr('Add client: confirm the names', 'Mandant hinzufügen: die Namen bestätigen'), tr('Syntegon typed. Each applicant name shows its EP applications at your firm and its matching EP applications. Click Continue.', 'Syntegon ist eingegeben. Jeder Anmeldername zeigt seine EP-Anmeldungen in Ihrer Kanzlei und seine passenden EP-Anmeldungen. Klicken Sie auf „Weiter“.'), '[data-walk=continue]'],
    ['4-review', 'default', tr('Add client: review', 'Mandant hinzufügen: prüfen'), tr('The role, the conflict check and the 16 EP applications at your firm. The check found one possible conflict, so Add client waits. Click I checked this conflict.', 'Die Rolle, die Kollisionsprüfung und die 16 EP-Anmeldungen in Ihrer Kanzlei. Die Prüfung hat eine mögliche Kollision gefunden, darum wartet „Mandant hinzufügen“. Klicken Sie auf „Ich habe diese Kollision geprüft“.'), '[data-walk=conflict]'],
    ['4-review', 'checked', tr('Add client: the reason', 'Mandant hinzufügen: die Begründung'), tr('Your reason is written and recorded with your name, so Add client is on. Click Add client.', 'Ihre Begründung ist geschrieben und wird mit Ihrem Namen erfasst, darum ist „Mandant hinzufügen“ aktiv. Klicken Sie auf „Mandant hinzufügen“.'), '[data-walk=record]'],
    ['5-record', 'default', tr('Add client: record', 'Mandant hinzufügen: erfassen'), tr('FlowLeap writes the client record and its 16 applications. This takes seconds.', 'FlowLeap schreibt den Mandanteneintrag und seine 16 Anmeldungen. Das dauert Sekunden.'), 'auto'],
    ['5-record', 'done', tr('Add client: done', 'Mandant hinzufügen: fertig'), tr('Syntegon is recorded, with no matter folder yet. Click Open client page.', 'Syntegon ist erfasst, noch ohne Aktenordner. Klicken Sie auf „Mandantenseite öffnen“.'), '[data-walk=open]'],
    ['1-client-applications', 'default', tr('The client page', 'Die Mandantenseite'), tr('The table of the 16 applications, with its sources and times. No application has a matter folder yet. Click EP 23 171 862.', 'Die Tabelle der 16 Anmeldungen, mit ihren Quellen und Zeiten. Noch keine Anmeldung hat einen Aktenordner. Klicken Sie auf EP 23 171 862.'), '[data-walk=row]'],
    ['7-matter', 'EP23171862', tr('An application, no work yet', 'Eine Anmeldung, noch ohne Arbeit'), tr('Its story from the EP Register and the Firm Record, and no matter folder. Drop the client’s instruction letter: click Upload files.', 'Ihre Geschichte aus dem EP-Register und dem Firm Record, und kein Aktenordner. Legen Sie das Auftragsschreiben des Mandanten ab: Klicken Sie auf „Dateien hochladen“.'), '[data-walk=upload]'],
    ['7-matter', 'work', tr('The first file', 'Die erste Datei'), tr('The first file made the matter folder. The chat is a placeholder. Click Syntegon in the top bar to go back.', 'Die erste Datei hat den Aktenordner angelegt. Der Chat ist ein Platzhalter. Klicken Sie oben auf Syntegon, um zurückzugehen.'), '[data-walk=client]'],
    ['1-client-applications', 'work', tr('Back on the client page', 'Zurück auf der Mandantenseite'), tr('EP 23 171 862 now has a matter folder. Click Files.', 'EP 23 171 862 hat jetzt einen Aktenordner. Klicken Sie auf „Dateien“.'), '[data-walk=files]'],
    ['2-client-files', 'work', tr('The Files tab', 'Der Reiter „Dateien“'), tr('00 Client, About this folder, and the one matter folder where work started. Click Clients in the sidebar.', '00 Client, „About this folder“ und der eine Aktenordner, wo die Arbeit begonnen hat. Klicken Sie in der Seitenleiste auf „Mandanten“.'), '[data-walk=sb-clients]'],
    ['0-clients', 'after', tr('Syntegon is a client', 'Syntegon ist Mandant'), tr('Syntegon with 16 applications and 1 matter folder. The way in to an existing client: click Syntegon.', 'Syntegon mit 16 Anmeldungen und 1 Aktenordner. Der Weg zu einem bestehenden Mandanten: Klicken Sie auf Syntegon.'), '[data-walk=syntegon]'],
    ['1-client-applications', 'work', tr('End of the walkthrough', 'Ende des Rundgangs'), tr('This is the whole flow. Restart it, or open the pages one by one from the README.', 'Das ist der ganze Ablauf. Starten Sie ihn neu, oder öffnen Sie die Seiten einzeln aus dem README.'), null],
  ];
  const file = name => `${name}${de ? '.de' : ''}.html`;
  const q = new URLSearchParams(location.search);
  // `go` marks a step that the person reached forward; Back never runs an automatic step again.
  const url = (n, forward = false) => `${file(STEPS[n - 1][0])}?state=${STEPS[n - 1][1]}&walk=${n}${forward ? '&go=1' : ''}`;
  const go = n => { location.href = url(n, true); };

  const n = Number(q.get('walk'));
  if (!n || !STEPS[n - 1]) {
    document.querySelector('[data-walk=sb-clients]')?.addEventListener('click', () => { location.href = file('0-clients'); });
    return;
  }
  const [, , title, hint, target] = STEPS[n - 1];
  const last = n === STEPS.length;

  const panel = document.createElement('aside');
  panel.className = 'walk';
  panel.setAttribute('aria-label', tr('Walkthrough', 'Rundgang'));
  panel.innerHTML = `<div class="walk-h"><span>${tr('Walkthrough', 'Rundgang')}</span><span class="num">${tr(`${n} of ${STEPS.length}`, `${n} von ${STEPS.length}`)}</span></div>
<div class="walk-dots" aria-hidden="true">${STEPS.map((_, i) => `<span${i < n ? ' class="on"' : ''}></span>`).join('')}</div>
<div class="walk-t">${title}</div><div class="walk-d">${hint}</div>
<div class="walk-f">${n > 1 ? `<a class="btn btn-ghost" href="${url(n - 1)}">${tr('Back', 'Zurück')}</a>` : ''}<a class="btn btn-secondary" href="${last ? url(1, true) : url(n + 1, true)}">${last ? tr('Restart', 'Neu starten') : tr('Next', 'Weiter')}</a></div>`;
  document.body.append(panel);

  const el = target && target !== 'auto' && [...document.querySelectorAll(target)].find(e => e.offsetParent !== null);
  if (el) {
    el.classList.add('walk-target');
    el.scrollIntoView({ block: 'nearest' });
    // On a narrow view the panel can cover the marked control; it then moves to the top.
    const a = el.getBoundingClientRect(), b = panel.getBoundingClientRect();
    if (a.bottom > b.top && a.top < b.bottom && a.right > b.left && a.left < b.right) panel.classList.add('top');
    el.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); go(n + 1); }, true);
  }
  // During the walkthrough, a link other than the marked control does not leave it: the panel says what to click.
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
