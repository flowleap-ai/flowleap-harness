// Client model mockup tables: a header sorts its column, the filter bar filters the rows, the footer pages them, and an
// element with data-href opens its page. In a build, one shared table component on TanStack Table does this (README).
(() => {
  const de = document.documentElement.lang === 'de';
  const fmt = n => n.toLocaleString(de ? 'de-DE' : 'en-GB');
  for (const table of document.querySelectorAll('[data-table]')) {
    const wrap = table.closest('.dt-wrap');
    const bar = wrap.previousElementSibling?.matches('.dt-filters') ? wrap.previousElementSibling : null;
    const foot = wrap.nextElementSibling;
    const none = wrap.querySelector('.dt-none');
    const rows = [...table.tBodies[0].rows];
    const sorted = table.querySelector('th[aria-sort]');
    const view = { key: sorted?.dataset.sort, dir: sorted?.getAttribute('aria-sort'), page: 0, size: Number(table.dataset.pageSize) };
    const value = (row, key) => row.dataset[key] ?? '';
    const compare = (a, b) => {
      const x = value(a, view.key), y = value(b, view.key);
      const order = x !== '' && y !== '' && !Number.isNaN(Number(x)) && !Number.isNaN(Number(y)) ? Number(x) - Number(y) : x.localeCompare(y);
      return view.dir === 'ascending' ? order : -order;
    };
    const render = () => {
      const text = bar?.querySelector('[data-filter=text]')?.value.trim().toLowerCase() ?? '';
      const status = bar?.querySelector('[data-filter=status]')?.value ?? '';
      const folder = bar?.querySelector('[data-filter=folder]')?.value ?? '';
      const shown = rows.filter(r => (!text || value(r, 'text').includes(text)) && (!status || value(r, 'status') === status) && (!folder || value(r, 'folder') === folder));
      if (view.key) shown.sort(compare);
      const filtered = Boolean(text || status || folder);
      // An example table names the total of its client; a filtered table counts its own rows.
      const total = filtered ? shown.length : Number(table.dataset.total);
      const pages = Math.max(1, Math.ceil(total / view.size));
      view.page = Math.min(view.page, pages - 1);
      const first = view.page * view.size;
      const page = shown.slice(first, first + view.size);
      for (const r of rows) r.hidden = !page.includes(r);
      for (const r of page) table.tBodies[0].append(r);
      if (none) none.hidden = shown.length > 0;
      // An example table has fewer rows than its total: say so where the rows end.
      const more = wrap.querySelector('.dt-more');
      if (more) more.hidden = page.length >= Math.min(view.size, total - first);
      foot.querySelector('[data-range]').textContent = total ? `${fmt(first + 1)}–${fmt(Math.min(first + view.size, total))} ${de ? 'von' : 'of'} ${fmt(total)}` : (de ? '0 von 0' : '0 of 0');
      foot.querySelector('.dt-prev').setAttribute('aria-disabled', String(view.page === 0));
      foot.querySelector('.dt-next').setAttribute('aria-disabled', String(view.page >= pages - 1));
    };
    for (const th of table.querySelectorAll('th[data-sort]')) {
      th.addEventListener('click', () => {
        view.dir = view.key === th.dataset.sort && view.dir === 'ascending' ? 'descending' : 'ascending';
        view.key = th.dataset.sort;
        for (const h of table.querySelectorAll('th')) h.removeAttribute('aria-sort');
        th.setAttribute('aria-sort', view.dir);
        render();
      });
    }
    bar?.addEventListener('input', () => { view.page = 0; render(); });
    foot.querySelector('[data-size]').addEventListener('change', e => { view.size = Number(e.target.value); view.page = 0; render(); });
    foot.querySelector('.dt-prev').addEventListener('click', () => { view.page = Math.max(0, view.page - 1); render(); });
    foot.querySelector('.dt-next').addEventListener('click', () => { view.page += 1; render(); });
    render();
  }
  document.addEventListener('click', e => {
    const link = e.target.closest('[data-href]');
    if (!link || link.closest('[aria-disabled=true]') || e.defaultPrevented) return;
    location.href = link.dataset.href;
  });
})();
