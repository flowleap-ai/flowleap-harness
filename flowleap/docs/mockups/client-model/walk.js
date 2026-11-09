// The clickable walkthrough of the client model mockups. Open 0-clients.html?walk=1: each step names the page and
// its state, says what the person sees, and marks the one control that goes to the next step. Without ?walk the
// pages stay plain mockups, so the design checks never see the walkthrough panel.
(() => {
  // [page, state, title, what to do, the control that goes on (none: Next, or `auto` to go on by itself)]
  const STEPS = [
    ['0-clients.html', 'default', 'The Clients list', 'Clients in the sidebar opens the list of your firm’s clients. Click Add client.', '[data-walk=add]'],
    ['3-find.html', 'empty', 'Add client: find the company', 'Click the field and type the company name.', '[data-walk=field]'],
    ['3-find.html', 'default', 'Add client: confirm the names', 'Syntegon typed. Each applicant name shows its EP applications at your firm and its matching EP applications. Click Continue.', '[data-walk=continue]'],
    ['4-review.html', 'default', 'Add client: review', 'The 16 matters at your firm, the conflict check and the role. Click Add client.', '[data-walk=record]'],
    ['5-record.html', 'default', 'Add client: record', 'FlowLeap writes the client record and its 16 applications. This takes seconds.', 'auto'],
    ['5-record.html', 'done', 'Add client: done', 'Syntegon is recorded. Click Open client page.', '[data-walk=open]'],
    ['1-client-applications.html', 'default', 'The client page', 'The table of the 16 applications, with its sources and times. Sort, filter or page it; then click EP 23 171 862.', '[data-walk=row]'],
    ['7-matter.html', 'work', 'An application with work', 'Its story from the EP Register and the Firm Record, its matter folder, and the chat (a placeholder). Next shows an application with no work yet.', null],
    ['7-matter.html', 'empty', 'An application with no work yet', 'No matter folder: the first file makes it. Click Syntegon in the top bar to go back.', '[data-walk=client]'],
    ['1-client-applications.html', 'default', 'Back on the client page', 'Click Files.', '[data-walk=files]'],
    ['2-client-files.html', 'work', 'The Files tab', 'Only 00 Client, About this folder and the one matter folder where work started. Click Clients in the sidebar.', '[data-walk=sb-clients]'],
    ['0-clients.html', 'after', 'Syntegon is a client', 'The way in to an existing client: click Syntegon.', '[data-walk=syntegon]'],
    ['1-client-applications.html', 'default', 'End of the walkthrough', 'This is the whole flow. Restart it, or open the pages one by one from the README.', null],
  ];
  const url = n => `${STEPS[n - 1][0]}?state=${STEPS[n - 1][1]}&walk=${n}`;
  const go = n => { location.href = url(n); };

  document.querySelector('[data-walk=sb-clients]')?.addEventListener('click', () => { location.href = '0-clients.html'; });
  const n = Number(new URLSearchParams(location.search).get('walk'));
  if (!n || !STEPS[n - 1]) return;
  const [, , title, hint, target] = STEPS[n - 1];
  const last = n === STEPS.length;

  const panel = document.createElement('aside');
  panel.className = 'walk';
  panel.setAttribute('aria-label', 'Walkthrough');
  panel.innerHTML = `<div class="walk-h"><span>Walkthrough</span><span class="num">${n} of ${STEPS.length}</span></div>
<div class="walk-dots" aria-hidden="true">${STEPS.map((_, i) => `<span${i < n ? ' class="on"' : ''}></span>`).join('')}</div>
<div class="walk-t">${title}</div><div class="walk-d">${hint}</div>
<div class="walk-f">${n > 1 ? `<a class="btn btn-ghost" href="${url(n - 1)}">Back</a>` : ''}<a class="btn btn-secondary" href="${last ? url(1) : url(n + 1)}">${last ? 'Restart' : 'Next'}</a></div>`;
  document.body.append(panel);

  if (target === 'auto') { setTimeout(() => go(n + 1), 2500); return; }
  const el = target && [...document.querySelectorAll(target)].find(e => e.offsetParent !== null);
  if (!el) return;
  el.classList.add('walk-target');
  el.scrollIntoView({ block: 'nearest' });
  el.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); go(n + 1); }, true);
})();
