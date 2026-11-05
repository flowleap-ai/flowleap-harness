// Lists the boxes inside the content panel (rule R8, checklist item 8). Paste into DevTools on a built screen, or let
// check-mockups.mjs run it. The panel is the mockups' `.panel` or the built app's Records view
// (`[data-testid="flowleap-records"]`). A box is an element at least 32 px high (a row, an Activity line, a card)
// that has a shadow, or a border on a background that differs from its parent's. A shadow counts on any background:
// in the light theme --dsw-alias-bg-layer-2 equals --dsw-alias-bg-base, so only the shadow shows the box. Allowed: the
// decision bar (with the bulk bar of selected rows, the decision bar of a selection), a file row, evidence (quote,
// excerpt, letter drawing), a notice, the icon tile of an empty state, a text field, menus and popovers, board columns
// and cards, the agent dock, and controls (buttons, keys, chips, avatars, segmented controls). Returns the class names
// of every other box.
(() => {
  // A mockup class name, or the local name of a CSS module class of the built app (`<hash>_<local>`).
  const parts = {
    // The part and everything inside it.
    tree: ['decision', 'file', 'menu', 'card', 'dock', 'seg',
      // Built app: the decision bar (Decision.module.css), the bulk bar of selected rows, which components.md makes
      // the decision bar of a selection (Selection.module.css), a segmented control (Detail.module.css).
      'bar', 'bulk', 'segment'],
    // The part only.
    self: ['quote', 'excerpt', 'letter', 'notice', 'empty-art', 'cb-in', 'col', 'other', 'btn', 'iconbtn', 'kbd', 'chip', 'fact', 'av', 'check', 'doc', 'pill',
      // Built app: the icon tile of an empty state (States.module.css), a board column (Board.module.css).
      'tile', 'column'],
  };
  const root = '.panel, [data-testid="flowleap-records"]';
  const named = (el, names) => [...el.classList].some(c => names.some(n => c === n || c.endsWith(`_${n}`)));
  // The element and its ancestors inside the panel; the app frame around the panel allows nothing.
  const inPanel = el => { const out = []; for (let p = el; p && !p.matches(root); p = p.parentElement) out.push(p); return out; };
  const floating = '[role="menu"], [role="dialog"], [role="tooltip"]';
  const control = `button, [role="button"], input, textarea, select, kbd, ${floating}`;
  const allowed = el => named(el, parts.self) || el.matches(control) || inPanel(el).some(p => named(p, parts.tree) || p.matches(floating));
  const clear = c => c === 'rgba(0, 0, 0, 0)' || c === 'transparent';
  const under = el => { for (let p = el.parentElement; p; p = p.parentElement) { const c = getComputedStyle(p).backgroundColor; if (!clear(c)) return c; } return ''; };
  return [...document.querySelectorAll('.panel *, [data-testid="flowleap-records"] *')].filter(el => {
    if (el.getClientRects().length === 0 || el.getBoundingClientRect().height < 32 || allowed(el)) return false;
    const s = getComputedStyle(el);
    if (s.boxShadow !== 'none') return true;
    const bordered = ['Top', 'Right', 'Bottom', 'Left'].filter(x => parseFloat(s[`border${x}Width`]) > 0).length === 4;
    return bordered && !clear(s.backgroundColor) && s.backgroundColor !== under(el);
  }).map(el => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`);
})()
