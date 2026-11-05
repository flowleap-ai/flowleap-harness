// Mockup helper: the client theme from ?theme=, the FlowLeap app sidebar, icons, and view states from ?state=.
(() => {
  const q = new URLSearchParams(location.search);
  const theme = q.get('theme') || 'dark';
  // The client's dark theme is body[data-ds-dark-theme]; light is the default.
  if (theme === 'dark') document.body.setAttribute('data-ds-dark-theme', '');
  document.documentElement.style.colorScheme = theme;
  const lang = document.documentElement.lang || 'en';

  const I = {
    plus: '<circle cx="8" cy="8" r="6.25"/><path d="M8 5.5v5M5.5 8h5"/>',
    search: '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/>',
    dash: '<path d="M2.5 11a5.5 5.5 0 1 1 11 0"/><path d="M8 11l2.5-3"/>',
    chats: '<path d="M3 4h10M3 8h10M3 12h6"/>',
    plug: '<path d="M8 2.5 13.5 8 8 13.5 2.5 8z"/>',
    clock: '<circle cx="8" cy="8" r="5.75"/><path d="M8 5v3l2 1.5"/>',
    review: '<path d="M3 4h2M3 8h2M3 12h2M7 4h6M7 8h6M7 12h4"/>',
    office: '<path d="M4 2.5h6l2.5 2.5v8.5H4z"/><path d="M6 7h4M6 9.5h4"/>',
    matters: '<rect x="2.5" y="3" width="11" height="10" rx="1.5"/><path d="M2.5 6.5h11"/>',
    agents: '<circle cx="8" cy="6" r="2.5"/><path d="M3.5 13.5a4.5 4.5 0 0 1 9 0"/>',
    more: '<circle cx="4.5" cy="4.5" r="1.5"/><circle cx="11.5" cy="4.5" r="1.5"/><circle cx="4.5" cy="11.5" r="1.5"/><circle cx="11.5" cy="11.5" r="1.5"/>',
    folder: '<path d="M2.5 4.5h4l1.5 1.5h5.5v6.5h-11z"/>',
    gear: '<circle cx="8" cy="8" r="2"/><path d="M8 2v2M8 12v2M2 8h2M12 8h2M3.8 3.8l1.4 1.4M10.8 10.8l1.4 1.4M3.8 12.2l1.4-1.4M10.8 5.2l1.4-1.4"/>',
    sidebar: '<rect x="2.5" y="3" width="11" height="10" rx="2"/><path d="M6.5 3v10"/>',
    up: '<path d="M4.5 9.5 8 6l3.5 3.5"/>',
    down: '<path d="M4.5 6.5 8 10l3.5-3.5"/>',
    dots: '<circle cx="3.5" cy="8" r="1"/><circle cx="8" cy="8" r="1"/><circle cx="12.5" cy="8" r="1"/>',
    link: '<path d="M7 9a2.5 2.5 0 0 0 3.5 0l2-2A2.5 2.5 0 0 0 9 3.5l-.5.5M9 7a2.5 2.5 0 0 0-3.5 0l-2 2A2.5 2.5 0 0 0 7 12.5l.5-.5"/>',
    filter: '<path d="M3 4.5h10M5 8h6M7 11.5h2"/>',
    display: '<path d="M3 5h6M11 5h2M3 11h2M7 11h6"/><circle cx="10" cy="5" r="1.25"/><circle cx="6" cy="11" r="1.25"/>',
    doc: '<path d="M4 2.5h5.5L12 5v8.5H4z"/><path d="M9.5 2.5V5H12"/>',
    page: '<path d="M4 2.5h5.5L12 5v8.5H4z"/>',
    mail: '<rect x="2.5" y="3.5" width="11" height="9" rx="1.5"/><path d="m3 4.5 5 4 5-4"/>',
    chev: '<path d="M6 4l4 4-4 4"/>',
    chevd: '<path d="M4 6l4 4 4-4"/>',
    check: '<path d="M3.5 8.5 6.5 11.5 12.5 4.5"/>',
    x: '<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>',
    info: '<circle cx="8" cy="8" r="5.75"/><path d="M8 7.5v3.5M8 5.2v.1"/>',
    warn: '<path d="M8 2.8 14 13H2z"/><path d="M8 7v2.5M8 11.2v.1"/>',
    engine: '<rect x="3" y="3" width="10" height="10" rx="2"/><path d="M6 6h4v4H6z"/>',
    bot: '<rect x="3" y="5" width="10" height="8" rx="2"/><path d="M8 2.5V5M6 9h.01M10 9h.01"/>',
    inbox: '<path d="M2.5 9.5 4.5 3.5h7l2 6v3h-11z"/><path d="M2.5 9.5h3l1 1.5h3l1-1.5h3"/>',
    send: '<path d="M8 13V3M4 7l4-4 4 4"/>',
    attach: '<path d="M10.5 5.5 6 10a1.5 1.5 0 0 0 2 2l5-5a3 3 0 0 0-4.2-4.2L3.5 8a4.5 4.5 0 0 0 6.3 6.3"/>',
    min: '<path d="M4 8h8"/>',
    expand: '<path d="M9.5 3h3.5v3.5M6.5 13H3V9.5M13 3 9 7M3 13l4-4"/>',
    eye: '<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>',
    calendar: '<rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3"/>',
    scale: '<path d="M8 2.5v11M4 13.5h8M3 5.5h10M3 5.5 1.5 9.5a1.6 1.6 0 0 0 3 0zM13 5.5l-1.5 4a1.6 1.6 0 0 0 3 0z"/>',
    pen: '<path d="M10.5 3 13 5.5 6 12.5H3.5V10z"/>',
    split: '<path d="M8 2.5v4M8 6.5 4 10v3.5M8 6.5l4 3.5v3.5"/>',
    reply: '<path d="M6.5 4 2.5 8l4 4M2.5 8h7a4 4 0 0 1 4 4"/>',
    key: '<circle cx="5.5" cy="10.5" r="3"/><path d="m7.6 8.4 5.4-5.4M11 4.5l1.5 1.5"/>',
    sparkle: '<path d="M8 2.5 9.3 6.7 13.5 8 9.3 9.3 8 13.5 6.7 9.3 2.5 8 6.7 6.7z"/>',
    star: '<path d="M8 2.5l1.7 3.5 3.8.5-2.8 2.6.7 3.8L8 11.1l-3.4 1.8.7-3.8L2.5 6.5l3.8-.5z"/>',
    branch: '<circle cx="5" cy="4" r="1.5"/><circle cx="5" cy="12" r="1.5"/><circle cx="11" cy="6" r="1.5"/><path d="M5 5.5v5M11 7.5c0 2-2 2.5-6 3"/>',
    cmd: '<path d="M6 6V4.5A1.5 1.5 0 1 0 4.5 6H11.5A1.5 1.5 0 1 0 10 4.5V11.5A1.5 1.5 0 1 0 11.5 10H4.5A1.5 1.5 0 1 0 6 11.5z"/>',
    retry: '<path d="M3 8a5 5 0 1 0 1.5-3.5M3 3v2.5h2.5"/>'
  };
  const svg = (name, extra = '') => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" ${extra}>${I[name] || ''}</svg>`;

  // Status icons: shape carries the meaning, colour repeats it.
  const S = {
    // waits for a person: open ring with a centre dot
    wait: '<circle cx="8" cy="8" r="5.6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-dasharray="2.2 1.6"/><circle cx="8" cy="8" r="2" fill="currentColor"/>',
    // done: filled disc with a check
    ok: '<circle cx="8" cy="8" r="6.5" fill="currentColor"/><path d="M5.2 8.2 7.2 10.1 10.9 6" stroke="var(--dsw-alias-bg-base)" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    // working: ring with a filled sector
    run: '<circle cx="8" cy="8" r="5.6" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 4.4A3.6 3.6 0 0 1 11.6 8H8z" fill="currentColor"/><path d="M8 8h3.6A3.6 3.6 0 0 1 8 11.6z" fill="currentColor"/>',
    // refused or rejected: filled disc with a cross
    bad: '<circle cx="8" cy="8" r="6.5" fill="currentColor"/><path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4" stroke="var(--dsw-alias-bg-base)" stroke-width="1.6" stroke-linecap="round"/>',
    // stale or disputed: triangle
    stale: '<path d="M8 2.2 14.3 13.3H1.7z" fill="currentColor"/><path d="M8 6.5v3M8 11.3v.1" stroke="var(--dsw-alias-bg-base)" stroke-width="1.6" stroke-linecap="round"/>',
    // no action needed: ring with a dash
    idle: '<circle cx="8" cy="8" r="5.6" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M5.5 8h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'
  };
  const cls = { wait: 'st-wait', ok: 'st-ok', run: 'st-run', bad: 'st-bad', stale: 'st-bad', idle: 'st-idle' };

  const logo = '<svg viewBox="0 0 36 36" fill="currentColor"><g transform="translate(2 2) scale(0.03628) translate(21 0)"><path d="M24 174.5L174.5 24L326 174.5L200.5 300L177 323.5L563.5 710.5L414 858L24 471V174.5Z"/><path fill-rule="evenodd" d="M375 75.5L378 378.5L640 635L781 497.605L677.202 300L642 335L375 75.5Z"/><path d="M816 463.5V162L677.202 300L781 497.605L816 463.5Z"/></g></svg>';

  const L = {
    en: { brand: 'FlowLeap Patent AI', newS: 'New Session', search: 'Search', dash: 'Dashboard', chats: 'Chats', plugins: 'Plugins', auto: 'Automation tasks', review: 'Needs review', office: 'Office actions', matters: 'Matters', agents: 'Agents', more: 'More', pinned: 'Pinned', pinHint: 'Pin a chat to keep it here.', ws: 'Workspaces', defWs: 'Default workspace', settings: 'Settings' },
    de: { brand: 'FlowLeap Patent AI', newS: 'Neue Sitzung', search: 'Suchen', dash: 'Dashboard', chats: 'Chats', plugins: 'Plugins', auto: 'Automatisierungsaufgaben', review: 'Zu prüfen', office: 'Amtsbescheide', matters: 'Akten', agents: 'Agenten', more: 'Mehr', pinned: 'Angeheftet', pinHint: 'Heften Sie einen Chat hier an.', ws: 'Arbeitsbereiche', defWs: 'Standard-Arbeitsbereich', settings: 'Einstellungen' }
  }[lang];

  const sb = document.querySelector('[data-sidebar]');
  if (sb) {
    const active = sb.dataset.sidebar;
    const item = (k, icon) => `<div class="sb-item${active === k ? ' is-active' : ''}">${svg(icon)}<span>${L[k]}</span></div>`;
    sb.className = 'sidebar';
    sb.innerHTML = `
      <div class="sb-brand">${logo}<span>${L.brand}</span><span class="collapse">${svg('sidebar')}</span></div>
      <div class="sb-new">${svg('plus')}<span>${L.newS}</span></div>
      ${item('search', 'search')}
      <div class="sb-gap"></div>
      ${item('dash', 'dash')}${item('chats', 'chats')}${item('plugins', 'plug')}${item('auto', 'clock')}${item('review', 'review')}${item('office', 'office')}${item('matters', 'matters')}${item('agents', 'agents')}${item('more', 'more')}
      <div class="sb-label">${L.pinned}</div><div class="sb-hint">${L.pinHint}</div>
      <div class="sb-label">${L.ws}</div>
      ${item('defWs', 'folder')}
      <div class="sb-foot">${item('settings', 'gear')}</div>`;
  }

  // At 390 px the sidebar hides; the top bar starts with the button that opens it.
  document.querySelectorAll('.topbar').forEach(el => el.insertAdjacentHTML('afterbegin', `<span class="iconbtn only-sm">${svg('sidebar')}</span>`));

  document.querySelectorAll('[data-i]').forEach(el => { el.innerHTML = svg(el.dataset.i) + el.innerHTML; });
  document.querySelectorAll('.st[data-s]').forEach(el => {
    el.classList.add(cls[el.dataset.s]);
    el.innerHTML = `<svg viewBox="0 0 16 16">${S[el.dataset.s]}</svg>`;
  });
  document.querySelectorAll('[data-logo]').forEach(el => { el.innerHTML = logo; });

  // Days left come from one fixed demo date, never from typed text. A past date says "overdue". No short form ("117 d").
  const TODAY = Date.parse('2026-11-04');
  const D = {
    en: { left: n => `${n} days left`, one: 'Due tomorrow', today: 'Due today', over: n => `Overdue by ${n} day${n === 1 ? '' : 's'}` },
    de: { left: n => `noch ${n} Tage`, one: 'Fällig morgen', today: 'Heute fällig', over: n => `${n} ${n === 1 ? 'Tag' : 'Tage'} überfällig` }
  }[lang];
  document.querySelectorAll('[data-due]').forEach(el => {
    const n = Math.round((Date.parse(el.dataset.due) - TODAY) / 864e5);
    el.textContent = n < 0 ? D.over(-n) : n === 0 ? D.today : n === 1 ? D.one : D.left(n);
    el.classList.add(n < 0 ? 'over' : 'left');
    if (n < 0) el.insertAdjacentHTML('afterbegin', svg('warn', 'aria-hidden="true"'));
  });

  // view states for the screenshots: ?state=<name> shows the [data-state] elements that name it
  const state = q.get('state');
  document.querySelectorAll('[data-state]').forEach(el => {
    const show = el.dataset.state.split(' ').includes(state || 'default');
    el.hidden = !show;
  });
  if (state === 'empty') document.querySelectorAll('.tab .count, .chip .num').forEach(el => { el.textContent = '0'; });
  if (state === 'evidence') document.querySelectorAll('[data-hover]').forEach(el => el.classList.add('is-hover'));
  if (state === 'missing') document.querySelectorAll('.is-missing').forEach(el => el.scrollIntoView({ block: 'center' }));
  // ?state=activity scrolls the work column to its end; ?state=scrolled scrolls a list so its headers stick.
  if (state === 'activity') document.querySelectorAll('.work-scroll').forEach(el => { el.scrollTop = el.scrollHeight; });
  if (state === 'scrolled') document.querySelectorAll('.list-pane').forEach(el => { el.scrollTop = 500; });
  if (state === 'select') document.querySelectorAll('.list').forEach(el => el.classList.add('selecting'));
  if (state === 'context') document.querySelectorAll('.list').forEach(el => el.classList.add('ctx-open'));
})();
