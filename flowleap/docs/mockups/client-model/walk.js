// The clickable walkthrough of the client model mockups. Open 0-clients.html?walk=1: each step names the page and
// its state, says what the person sees, and marks the one control that goes to the next step. Without ?walk the
// pages stay plain mockups, so the design checks never see the walkthrough panel.
(() => {
  // [page, state, title, what to do, the control that goes on (none: Next; `auto`: on by itself)]
  const STEPS = [
    ['0-clients.html', 'default', 'The Clients list', 'Clients in the sidebar opens the list of your firm’s clients. Click Add client.', '[data-walk=add]'],
    ['3-find.html', 'empty', 'Add client: find the company', 'Click the field and type the company name.', '[data-walk=field]'],
    ['3-find.html', 'default', 'Add client: confirm the names', 'Syntegon typed. Each applicant name shows its EP applications at your firm and its matching EP applications. Click Continue.', '[data-walk=continue]'],
    ['4-review.html', 'default', 'Add client: review', 'The 16 EP applications at your firm, the conflict check and the role. Click Add client.', '[data-walk=record]'],
    ['5-record.html', 'default', 'Add client: record', 'FlowLeap writes the client record and its 16 applications. This takes seconds.', 'auto'],
    ['5-record.html', 'done', 'Add client: done', 'Syntegon is recorded, with no matter folder yet. Click Open client page.', '[data-walk=open]'],
    ['1-client-applications.html', 'default', 'The client page', 'The table of the 16 applications, with its sources and times. No application has a matter folder yet. Click EP 23 171 862.', '[data-walk=row]'],
    ['7-matter.html', 'EP23171862', 'An application, no work yet', 'Its story from the EP Register and the Firm Record, and no matter folder. Drop the client’s instruction letter: click Upload files.', '[data-walk=upload]'],
    ['7-matter.html', 'work', 'The first file', 'The first file made the matter folder. The chat is a placeholder. Click Syntegon in the top bar to go back.', '[data-walk=client]'],
    ['1-client-applications.html', 'work', 'Back on the client page', 'EP 23 171 862 now has a matter folder. Click Files.', '[data-walk=files]'],
    ['2-client-files.html', 'work', 'The Files tab', '00 Client, About this folder, and the one matter folder where work started. Click Clients in the sidebar.', '[data-walk=sb-clients]'],
    ['0-clients.html', 'after', 'Syntegon is a client', 'Syntegon with 16 applications and 1 matter folder. The way in to an existing client: click Syntegon.', '[data-walk=syntegon]'],
    ['1-client-applications.html', 'work', 'End of the walkthrough', 'This is the whole flow. Restart it, or open the pages one by one from the README.', null],
  ];
  const q = new URLSearchParams(location.search);
  // `go` marks a step that the person reached forward; Back never runs an automatic step again.
  const url = (n, forward = false) => `${STEPS[n - 1][0]}?state=${STEPS[n - 1][1]}&walk=${n}${forward ? '&go=1' : ''}`;
  const go = n => { location.href = url(n, true); };

  const n = Number(q.get('walk'));
  if (!n || !STEPS[n - 1]) {
    document.querySelector('[data-walk=sb-clients]')?.addEventListener('click', () => { location.href = '0-clients.html'; });
    return;
  }
  const [, , title, hint, target] = STEPS[n - 1];
  const last = n === STEPS.length;

  const panel = document.createElement('aside');
  panel.className = 'walk';
  panel.setAttribute('aria-label', 'Walkthrough');
  panel.innerHTML = `<div class="walk-h"><span>Walkthrough</span><span class="num">${n} of ${STEPS.length}</span></div>
<div class="walk-dots" aria-hidden="true">${STEPS.map((_, i) => `<span${i < n ? ' class="on"' : ''}></span>`).join('')}</div>
<div class="walk-t">${title}</div><div class="walk-d">${hint}</div>
<div class="walk-f">${n > 1 ? `<a class="btn btn-ghost" href="${url(n - 1)}">Back</a>` : ''}<a class="btn btn-secondary" href="${last ? url(1, true) : url(n + 1, true)}">${last ? 'Restart' : 'Next'}</a></div>`;
  document.body.append(panel);

  const el = target && target !== 'auto' && [...document.querySelectorAll(target)].find(e => e.offsetParent !== null);
  if (el) {
    el.classList.add('walk-target');
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
