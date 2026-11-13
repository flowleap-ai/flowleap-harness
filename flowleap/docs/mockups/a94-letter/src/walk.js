// The clickable walkthrough of process sheet 9. The page opens on step 1 (or ?walk=<n>); each step names a view state,
// says what the person sees, and marks the one control that goes on with a blue outline. With ?state=<name> and no
// ?walk the page is a plain mockup, so the design checks never see the panel.
(() => {
  // The My work screens name their sidebar entry, as the design checks expect (nav[data-sidebar]); frame.js has run.
  document.querySelectorAll('nav[data-nav]').forEach(nav => { nav.dataset.sidebar = nav.dataset.nav; });
  const q = new URLSearchParams(location.search);
  if (q.has('state') && !q.has('walk')) return;

  // [path, view state, title, what to do, the data-walk control that goes on (null: Next)]
  const STEPS = [
    ['Main', 'sabine-mywork', 'Sabine Wolf (formalities): My work', 'The letter came from MyEPO at 07:02. FlowLeap filed it, read the period on page 1 and proposed the deadline; the agent read the letter for Jonas Weber. One task waits for Sabine. Click the row.', 'row'],
    ['Main', 'sabine-deadline', 'The letter board: the deadline', 'One page for the whole letter. Every value says where it came from, in one place. Page 1 is beside the form with the period marked. The footer says that nothing is recorded before Confirm. Click Confirm deadline.', 'confirm'],
    ['Main', 'sabine-done', 'Deadline confirmed', 'Sabine\'s one act is done; her task closed with it. The reading waits for Jonas Weber, on the same page. Click Next to sign in as Jonas.', null],
    ['Main', 'jonas-mywork', 'Jonas Weber (attorney): My work', 'One task: review the reading. The row says that the deadline is already active. Click the row.', 'row'],
    ['Main', 'jonas-board', 'Step 1 of 3: Objections', 'The five objections in full, with a stepper and a slim footer, not a card. Objection 3 has a warning: the agent wrote claims 2–14, its own passage says 2-15. Click the passage of objection 1.', 'quote-1'],
    ['Main', 'jonas-quote', 'A passage opens its place in the letter', 'The letter pane shows page 3 with the passage marked. Click Accept on objection 1.', 'accept-1'],
    ['Main', 'jonas-marked', 'Each mark is saved at once', 'Objections 1, 2, 4 and 5 are accepted (one click each). The footer says "4 of 5 reviewed · saved · not accepted yet". Click Correct on objection 3.', 'correct-3'],
    ['Main', 'jonas-correct', 'Correct one field', 'The agent\'s value stays in the record; the corrected value and the reason are a new record event. Four good objections stay. Click Save correction.', 'save'],
    ['Main', 'jonas-allmarked', '5 of 5 reviewed', 'Objection 3 is corrected to claims 2–15. Next is on now. Click Next.', 'next'],
    ['Main', 'jonas-docs', 'Step 2 of 3: Cited documents and claims', 'D1 to D5, where the letter cites each, and which objections use it. Below, each claim with the objections that name it. Click Next.', 'next'],
    ['Main', 'jonas-review', 'Step 3 of 3: Review', 'Every mark with Edit, the deadline that Sabine confirmed, and Jonas\'s own check of the date: one line, not a second confirmation. Accept waits for the check. Click the check.', 'check'],
    ['Main', 'jonas-review-checked', 'Ready to accept', 'The one primary act of the page. Click Accept the reading.', 'next'],
    ['Main', 'jonas-done', 'All decided', 'The deadline is active and the reading is accepted. Other offices and Reply are named places for later. Activity shows sentences; the record events are behind Record log. Click Next for the path "Ask the agent".', null],
    ['Ask the agent', 'agent-open', 'The agent beside the work', 'Jonas has marked objections 1, 2, 4 and 5; objection 3 has the warning. The right column has two tabs, Letter and Agent. Click Agent.', 'agent-tab'],
    ['Ask the agent', 'agent-ask', 'Ask about this letter', 'The Agent tab takes the place of the letter; the form, its marks and its step stay. Jonas typed a question. Click Send.', 'send'],
    ['Ask the agent', 'agent-answer', 'The answer stays on the board', 'Each statement points to a passage. The agent proposes a correction of objection 3; the objection row shows it. The agent cannot mark the item: Jonas does. Click Accept the suggestion.', 'accept-sug'],
    ['Ask the agent', 'agent-done', 'Corrected by Jonas, suggested by the agent', 'Objection 3 is corrected; the record names Jonas as the actor and the suggestion as evidence. Asked to accept the reading, the agent says that this act is Jonas\'s. Click Next for the path "New reading".', null],
    ['New reading', 'jonas-board', 'A reading that is wrong as a whole', 'Back at step 1. The ⋯ in the footer holds Ask for a new reading and Reject the reading. Click ⋯.', 'more'],
    ['New reading', 'rerun-ask', 'Ask for a new reading', 'Jonas writes what is wrong. The reason goes into the new run, so the session log shows it. Click Ask for a new reading.', 'ask'],
    ['New reading', 'rerun-running', 'FlowLeap reads again', 'Reading 1 and Jonas\'s mark stay in the record. Jonas can leave the page. Click Next.', null],
    ['New reading', 'rerun-ready', 'Reading 2', 'One line says why reading 1 was replaced. The mark on objection 1 carried over, because the item is the same; objection 3 now reads claims 2–15 with no warning. Click Next for the path "Reject".', null],
    ['Reject', 'jonas-board', 'Reject the reading', 'Click ⋯ in the footer.', 'more'],
    ['Reject', 'reject-form', 'Reject: two choices', 'A new reading is the recommended choice. Here Jonas rejects and works by hand, with a reason. Click Reject the reading.', 'reject'],
    ['Reject', 'reject-done', 'Rejected, by hand', 'The work goes on by hand; the deadline stays active. Click Next for the path "Moved task".', null],
    ['Moved task', 'moved-jonas', 'A task that moved to a colleague', 'Jonas was absent; the decide-by time passed in working hours and the task moved to Lena Hoffmann. It does not vanish: it shows under Moved to others, with who has it and why. Click Take back.', 'take'],
    ['Moved task', 'moved-taken', 'Taken back', 'The task is Jonas\'s again. Tasks move only in working hours. Click Next for the path "Scan".', null],
    ['Scan', 'scan-mywork', 'A scan with no text', 'The same letter comes as a scan by scan-to-email. Sabine has a task to file it. Click the row.', 'row'],
    ['Scan', 'scan-file', 'File the scan', 'The page images beside the form. Sabine enters the type, the date and the period from page 1. Click File letter.', 'file'],
    ['Scan', 'scan-tobias', 'Tobias Schmitt (formalities): My work', 'Sabine made the evidence of this deadline, so a colleague confirms. Click the row.', 'row'],
    ['Scan', 'scan-confirm', 'Confirm a deadline that a person entered', 'The board says who entered each value and why Tobias confirms. Click Confirm deadline.', 'confirm'],
    ['Scan', 'scan-jonas', 'No reading for a scan', 'FlowLeap cannot quote a scan, so there is no reading. Jonas works by hand with the page images beside the form. This is the end of the walkthrough.', null],
  ];
  const PATHS = [...new Set(STEPS.map(s => s[0]))];

  const panel = document.createElement('div');
  panel.className = 'walk';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', 'Walkthrough');
  document.body.append(panel);

  let n = Math.min(Math.max(Number(q.get('walk')) || 1, 1), STEPS.length);
  let target = null;

  function show() {
    const [path, state, title, hint, walk] = STEPS[n - 1];
    document.querySelectorAll('.app[data-state]').forEach(el => { el.hidden = !el.dataset.state.split(' ').includes(state); });
    const app = document.querySelector(`.app[data-state~="${state}"]`);
    document.querySelectorAll('.walk-target').forEach(el => el.classList.remove('walk-target'));
    target = walk ? [...app.querySelectorAll(`[data-walk="${walk}"]`)].find(el => el.getClientRects().length) ?? null : null;
    if (target) { target.classList.add('walk-target'); target.scrollIntoView({ block: 'center' }); }
    const mark = app.querySelector('mark[data-mark]');
    if (mark) mark.scrollIntoView({ block: 'center' });
    const inPath = STEPS.filter(s => s[0] === path);
    const at = STEPS.slice(0, n).filter(s => s[0] === path).length;
    const dark = document.body.hasAttribute('data-ds-dark-theme');
    panel.innerHTML = `<div class="wk-paths">${PATHS.map(p => `<span data-path="${p}" class="${p === path ? 'on' : ''}" role="button">${p}</span>`).join('')}</div>
      <div class="wk-n">${path} · step ${at} of ${inPath.length}</div><div class="wk-t">${title}</div><p class="wk-h">${hint}</p>
      <div class="wk-f"><span class="btn btn-secondary" data-go="back" role="button"${n === 1 ? ' aria-disabled="true"' : ''}>Back</span><span class="btn btn-secondary" data-go="next" role="button"${n === STEPS.length ? ' aria-disabled="true"' : ''}>Next</span><span class="spacer"></span><span class="btn btn-ghost" data-go="min" role="button">${panel.classList.contains('min') ? 'Show' : 'Hide'}</span><span class="btn btn-ghost" data-go="theme" role="button">${dark ? 'Light' : 'Dark'}</span></div>`;
    const u = new URL(location.href);
    u.searchParams.set('walk', String(n));
    u.searchParams.set('theme', dark ? 'dark' : 'light');
    u.searchParams.delete('state');
    history.replaceState(null, '', u);
  }
  const go = to => { if (to >= 1 && to <= STEPS.length) { n = to; show(); } };

  panel.addEventListener('click', e => {
    const b = e.target.closest('[data-go], [data-path]');
    if (!b) return;
    if (b.dataset.path) go(STEPS.findIndex(s => s[0] === b.dataset.path) + 1);
    else if (b.dataset.go === 'back') go(n - 1);
    else if (b.dataset.go === 'next') go(n + 1);
    else if (b.dataset.go === 'min') { panel.classList.toggle('min'); show(); }
    else {
      const dark = document.body.toggleAttribute('data-ds-dark-theme');
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
      show();
    }
  });
  document.addEventListener('click', e => {
    if (panel.contains(e.target)) return;
    if (target && target.contains(e.target)) { go(n + 1); return; }
    if (e.target.closest('[role="button"], .btn, .row, .pref, label')) {
      panel.classList.remove('nudge');
      requestAnimationFrame(() => panel.classList.add('nudge'));
      setTimeout(() => panel.classList.remove('nudge'), 900);
    }
  });
  show();
})();
