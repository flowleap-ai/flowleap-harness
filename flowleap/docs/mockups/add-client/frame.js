// Add client mockup helper, from the client folder mockups' frame.js: the client theme from ?theme=, the app sidebar of
// the flowleap-web profile with the Clients entry and the Workspaces section, icons, and view states from ?state=.
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
    clients: '<path d="M2.5 13.5v-9h4l1.5 1.5h5.5v7.5z"/><path d="M5 9.5h6"/>',
    agents: '<circle cx="8" cy="6" r="2.5"/><path d="M3.5 13.5a4.5 4.5 0 0 1 9 0"/>',
    more: '<circle cx="4.5" cy="4.5" r="1.5"/><circle cx="11.5" cy="4.5" r="1.5"/><circle cx="4.5" cy="11.5" r="1.5"/><circle cx="11.5" cy="11.5" r="1.5"/>',
    folder: '<path d="M2.5 4.5h4l1.5 1.5h5.5v6.5h-11z"/>',
    folderopen: '<path d="M2.5 12.5v-8h4l1.5 1.5h4.5v1.5"/><path d="M2.5 12.5 4.5 8h9l-2 4.5z"/>',
    newfolder: '<path d="M2.5 4.5h4l1.5 1.5h5.5v6.5h-11z"/><path d="M8 7.5v3.5M6.25 9.25h3.5"/>',
    upload: '<path d="M8 10.5v-7M5 6.5l3-3 3 3"/><path d="M3 10v2.5h10V10"/>',
    move: '<path d="M2.5 4.5h4l1.5 1.5h5.5v6.5h-11z"/><path d="M6 9.25h4M8.5 7.75l1.5 1.5-1.5 1.5"/>',
    pen: '<path d="M10.5 3 13 5.5 6 12.5H3.5V10z"/>',
    ask: '<path d="M3 3.5h10v7H8l-3 2.5v-2.5H3z"/><path d="M6.5 6.5h3M6.5 8.5h2"/>',
    gear: '<circle cx="8" cy="8" r="2"/><path d="M8 2v2M8 12v2M2 8h2M12 8h2M3.8 3.8l1.4 1.4M10.8 10.8l1.4 1.4M3.8 12.2l1.4-1.4M10.8 5.2l1.4-1.4"/>',
    sidebar: '<rect x="2.5" y="3" width="11" height="10" rx="2"/><path d="M6.5 3v10"/>',
    tree: '<path d="M3 3.5h4M5 3.5v8.5h3M5 8h3"/><rect x="9" y="6.5" width="4" height="3" rx="1"/><rect x="9" y="10.5" width="4" height="3" rx="1"/>',
    dots: '<circle cx="3.5" cy="8" r="1"/><circle cx="8" cy="8" r="1"/><circle cx="12.5" cy="8" r="1"/>',
    link: '<path d="M7 9a2.5 2.5 0 0 0 3.5 0l2-2A2.5 2.5 0 0 0 9 3.5l-.5.5M9 7a2.5 2.5 0 0 0-3.5 0l-2 2A2.5 2.5 0 0 0 7 12.5l.5-.5"/>',
    doc: '<path d="M4 2.5h5.5L12 5v8.5H4z"/><path d="M9.5 2.5V5H12"/>',
    pdf: '<path d="M4 2.5h5.5L12 5v8.5H4z"/><path d="M9.5 2.5V5H12M6 9h4M6 11h2.5"/>',
    md: '<path d="M4 2.5h5.5L12 5v8.5H4z"/><path d="M9.5 2.5V5H12M6 8.5h4M6 10.5h4"/>',
    mail: '<rect x="2.5" y="3.5" width="11" height="9" rx="1.5"/><path d="m3 4.5 5 4 5-4"/>',
    chev: '<path d="M6 4l4 4-4 4"/>',
    chevd: '<path d="M4 6l4 4 4-4"/>',
    back: '<path d="M10 4 6 8l4 4"/>',
    check: '<path d="M3.5 8.5 6.5 11.5 12.5 4.5"/>',
    x: '<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>',
    info: '<circle cx="8" cy="8" r="5.75"/><path d="M8 7.5v3.5M8 5.2v.1"/>',
    warn: '<path d="M8 2.8 14 13H2z"/><path d="M8 7v2.5M8 11.2v.1"/>',
    retry: '<path d="M3 8a5 5 0 1 0 1.5-3.5M3 3v2.5h2.5"/>',
    external: '<path d="M9 3h4v4M13 3 7.5 8.5M11.5 9.5v3.5h-9v-9h3.5"/>',
    eye: '<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>',
    copy: '<rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-3h-8v8h3"/>',
    zoomin: '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14M5 7h4M7 5v4"/>',
    zoomout: '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14M5 7h4"/>',
    send: '<path d="M8 13V3M4 7l4-4 4 4"/>',
    attach: '<path d="M10.5 5.5 6 10a1.5 1.5 0 0 0 2 2l5-5a3 3 0 0 0-4.2-4.2L3.5 8a4.5 4.5 0 0 0 6.3 6.3"/>',
    bot: '<rect x="3" y="5" width="10" height="8" rx="2"/><path d="M8 2.5V5M6 9h.01M10 9h.01"/>',
    minus: '<path d="M4 8h8"/>',
    lock: '<rect x="3.5" y="7" width="9" height="6.5" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>',
    building: '<path d="M3 13.5V3.5h6v10M9 6.5h4v7M2 13.5h12M5 6h2M5 8.5h2M5 11h2M11 9h.01M11 11h.01"/>',
    ring: '<circle cx="8" cy="8" r="5.75" stroke-dasharray="2 2"/>',
    spin: '<circle cx="8" cy="8" r="5.75"/><path d="M8 2.25A5.75 5.75 0 0 1 13.75 8"/>',
    party: '<circle cx="5.5" cy="6" r="2"/><circle cx="11" cy="6" r="2"/><path d="M2 13a3.5 3.5 0 0 1 7 0M8 13a3.5 3.5 0 0 1 6.5-1"/>',
    filter: '<path d="M2.5 4h11M4.5 8h7M6.5 12h3"/>',
    display: '<rect x="2.5" y="3" width="11" height="10" rx="1.5"/><path d="M2.5 6.5h11M6 6.5V13"/>'
  };
  const svg = (name, extra = '') => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" ${extra}>${I[name] || ''}</svg>`;

  const logo = '<svg viewBox="0 0 36 36" fill="currentColor"><g transform="translate(2 2) scale(0.03628) translate(21 0)"><path d="M24 174.5L174.5 24L326 174.5L200.5 300L177 323.5L563.5 710.5L414 858L24 471V174.5Z"/><path fill-rule="evenodd" d="M375 75.5L378 378.5L640 635L781 497.605L677.202 300L642 335L375 75.5Z"/><path d="M816 463.5V162L677.202 300L781 497.605L816 463.5Z"/></g></svg>';

  const L = {
    en: { brand: 'FlowLeap Patent AI', newS: 'New session', search: 'Search', dash: 'Dashboard', chats: 'Chats', plugins: 'Plugins', auto: 'Automation tasks', review: 'Needs review', office: 'Office actions', matters: 'Matters', clients: 'Clients', agents: 'Agents', more: 'More', pinned: 'Pinned', pinHint: 'Pin a chat to keep it here.', ws: 'Workspaces', defaultWs: 'Default workspace', settings: 'Settings' },
    de: { brand: 'FlowLeap Patent AI', newS: 'Neue Sitzung', search: 'Suchen', dash: 'Übersicht', chats: 'Chats', plugins: 'Plugins', auto: 'Automatisierungsaufgaben', review: 'Zu prüfen', office: 'Amtsbescheide', matters: 'Akten', clients: 'Mandanten', agents: 'Agenten', more: 'Mehr', pinned: 'Angeheftet', pinHint: 'Heften Sie einen Chat hier an.', ws: 'Arbeitsbereiche', defaultWs: 'Standard-Arbeitsbereich', settings: 'Einstellungen' }
  }[lang];

  // The sidebar of the flowleap-web profile today, with the Clients entry of the folder plugin. data-sidebar names the
  // active entry; data-ws names the client workspace once Add client made it; data-session names a chat row under it.
  const sb = document.querySelector('[data-sidebar]');
  if (sb) {
    const { sidebar, session = '', ws = '' } = sb.dataset;
    const item = (k, icon) => `<div class="sb-item${sidebar === k ? ' is-active' : ''}">${svg(icon)}<span>${L[k]}</span></div>`;
    sb.className = 'sidebar';
    sb.innerHTML = `
      <div class="sb-brand">${logo}<span>${L.brand}</span><span class="collapse">${svg('sidebar')}</span></div>
      <div class="sb-new">${svg('plus')}<span>${L.newS}</span></div>
      ${item('search', 'search')}
      <div class="sb-gap"></div>
      ${item('dash', 'dash')}${item('chats', 'chats')}${item('plugins', 'plug')}${item('auto', 'clock')}${item('review', 'review')}${item('office', 'office')}${item('matters', 'matters')}${item('clients', 'clients')}${item('agents', 'agents')}${item('more', 'more')}
      <div class="sb-label">${L.pinned}</div><div class="sb-hint">${L.pinHint}</div>
      <div class="sb-label">${L.ws}</div>
      ${ws ? `<div class="sb-item">${svg('folder')}<span>${ws}</span></div>` : ''}
      ${session ? `<div class="sb-item sb-sub is-active"><span>${session}</span></div>` : ''}
      <div class="sb-item">${svg('folder')}<span>${L.defaultWs}</span></div>
      <div class="sb-foot">${item('settings', 'gear')}</div>`;
  }

  // At 390 px the sidebar hides; the top bar starts with the button that opens it.
  document.querySelectorAll('.topbar').forEach(el => el.insertAdjacentHTML('afterbegin', `<span class="iconbtn only-sm">${svg('sidebar')}</span>`));
  document.querySelectorAll('[data-i]').forEach(el => { el.innerHTML = svg(el.dataset.i) + el.innerHTML; });
  document.querySelectorAll('[data-logo]').forEach(el => { el.innerHTML = logo; });

  // View states for the screenshots: ?state=<name> shows the [data-state] elements that name it.
  const state = q.get('state');
  document.querySelectorAll('[data-state]').forEach(el => {
    el.hidden = !el.dataset.state.split(' ').includes(state || 'default');
  });
  // A modal dialog makes the page under it inert: its primary action takes no click.
  if ([...document.querySelectorAll('[data-modal]')].some(el => !el.hidden)) {
    document.querySelectorAll('.panel .btn-primary').forEach(el => el.setAttribute('aria-disabled', 'true'));
  }
})();
