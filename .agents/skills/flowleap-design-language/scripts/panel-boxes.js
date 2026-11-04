// Lists the boxes inside the content panel (rule R8, checklist item 8). Paste into DevTools on a built screen, or let
// check-mockups.mjs run it. A box is an element at least 48 px high whose background differs from its parent's and that
// has a border or a shadow. Allowed: the decision bar, a file row, evidence (quote, excerpt, letter drawing), a notice,
// the icon tile of an empty state, a text field, menus and popovers, board columns and cards, and the agent dock. Returns the class names of every other box.
(() => {
  const allowed = '.decision, .decision *, .file, .quote, .excerpt, .letter, .notice, .empty-art, .cb-in, .menu, .menu *, .col, .card, .other, .dock, .dock *';
  const clear = c => c === 'rgba(0, 0, 0, 0)' || c === 'transparent';
  const under = el => { for (let p = el.parentElement; p; p = p.parentElement) { const c = getComputedStyle(p).backgroundColor; if (!clear(c)) return c; } return ''; };
  return [...document.querySelectorAll('.panel *')].filter(el => {
    if (el.offsetParent === null || el.getBoundingClientRect().height < 48 || el.matches(allowed)) return false;
    const s = getComputedStyle(el);
    const bg = s.backgroundColor;
    if (clear(bg) || bg === under(el)) return false;
    return s.boxShadow !== 'none' || parseFloat(s.borderTopWidth) > 0 || parseFloat(s.borderLeftWidth) > 0;
  }).map(el => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`);
})()
