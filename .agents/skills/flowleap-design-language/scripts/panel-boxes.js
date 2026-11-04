// Lists the boxes inside the content panel (rule R8, checklist item 8). Paste into DevTools on a built screen, or let
// check-mockups.mjs run it. A box is an element at least 32 px high (a row, an Activity line, a card) that has a shadow,
// or a border on a background that differs from its parent's. A shadow counts on any background: in the light theme
// --dsw-alias-bg-layer-2 equals --dsw-alias-bg-base, so only the shadow shows the box. Allowed: the decision bar, a
// file row, evidence (quote, excerpt, letter drawing), a notice, the icon tile of an empty state, a text field, menus
// and popovers, board columns and cards, the agent dock, and controls (buttons, keys, chips, avatars, segmented
// controls). Returns the class names of every other box.
(() => {
  const allowed = '.decision, .decision *, .file, .file *, .quote, .excerpt, .letter, .notice, .empty-art, .cb-in, .menu, .menu *, .col, .card, .card *, .other, .dock, .dock *, .btn, .iconbtn, .kbd, .chip, .fact, .av, .seg, .seg *, .check, .doc, .pill';
  const clear = c => c === 'rgba(0, 0, 0, 0)' || c === 'transparent';
  const under = el => { for (let p = el.parentElement; p; p = p.parentElement) { const c = getComputedStyle(p).backgroundColor; if (!clear(c)) return c; } return ''; };
  return [...document.querySelectorAll('.panel *')].filter(el => {
    if (el.getClientRects().length === 0 || el.getBoundingClientRect().height < 32 || el.matches(allowed)) return false;
    const s = getComputedStyle(el);
    if (s.boxShadow !== 'none') return true;
    const bordered = ['Top', 'Right', 'Bottom', 'Left'].filter(x => parseFloat(s[`border${x}Width`]) > 0).length === 4;
    return bordered && !clear(s.backgroundColor) && s.backgroundColor !== under(el);
  }).map(el => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`);
})()
