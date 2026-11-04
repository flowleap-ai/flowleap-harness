// Checks a folder of HTML mockups in a browser, in both themes, at 1440 x 900, 1366 x 650 and 390 x 844 (a touch
// screen: coarse pointer, no hover).
// Usage: node check-mockups.mjs <dir> [--shoot <outdir>] [--only <name part>]. Exits 1 on a failure, 2 when Playwright is missing or the
// folder has no mockup.
// Checks, in each page, view state, theme and size:
// - the client theme loaded (--dsw-alias-bg-base resolves);
// - at most one enabled primary button, found by its computed fill, not its class (R12);
// - the primary button of each decision bar is inside the view, takes a click and nothing covers it, unless a
//   [data-modal] is open, also with each scroll container scrolled to its end, and it does not move when a container
//   scrolls (R13);
// - a bulk decision bar ([data-bulk]) shows only when 1 or more rows are checked, and each number in it is the
//   checked count (R12);
// - no page-wide horizontal scroll and nothing cut at the right edge (checklist 25);
// - each key shown matches keys.md; no key typed into a label; keys hide on a touch screen; a button for an act with a
//   key shows it on a fine pointer; one label names one act and one key on a page (R16);
// - each status icon (.st) sits in a [data-atlas] element with the shape and the English or German word of
//   status-map.mjs, with the word seen (a box of 2 x 2 px or more, no clip, not transparent), or is an aria-hidden
//   row or card icon under a group or column header of the same shape; each .pill and .status is a [data-atlas]
//   element (R11);
// - no day or week count typed outside the [data-due] elements that frame.js fills (R11);
// - no deny-list match in the shown text or in title, aria-label, placeholder and alt (R19);
// - no text in --dsw-alias-label-tertiary (R3);
// - no box inside the content panel other than the allowed ones of panel-boxes.js, and no element with both a neutral
//   border and a shadow (R8);
// - each radius is on the client scale and fits the element's height band: R4 below 20 px, R8 for 20 to 28 px, R12
//   for 32 to 40 px, R12 or more above 40 px (R7);
// - nothing is cut with an ellipsis at 1440 and 1366 px except a title or matter cell of a queue list row (R17);
// - every act that a button offers at 1440 px is reachable at 390 px: shown, in the menu that a shown
//   [data-overflow="<menu id>"] opens, or on the
//   page that [data-narrow-page] names (checklist 25).
// A page picks its theme from ?theme=dark|light and its view state from ?state=<name> (data-state).
// Playwright: $FLOWLEAP_PLAYWRIGHT (a playwright package directory), else the current directory's node_modules,
// else the flowleap-harness checkout that holds this skill (apps/web).
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DENY } from './check-copy.mjs';
import { STATUS } from './status-map.mjs';

const skill = path.resolve(import.meta.dirname, '..');

function loadPlaywright() {
  const tries = [
    process.env.FLOWLEAP_PLAYWRIGHT && (() => createRequire(path.join(path.resolve(process.env.FLOWLEAP_PLAYWRIGHT), 'package.json'))('./')),
    () => createRequire(path.join(process.cwd(), 'package.json'))('playwright'),
    () => createRequire(path.resolve(skill, '../../../apps/web/package.json'))('playwright'),
  ].filter(Boolean);
  for (const t of tries) {
    try { return t(); } catch { /* try the next place; the message below names all three */ }
  }
  console.error('check-mockups: Playwright not found. Set FLOWLEAP_PLAYWRIGHT to a playwright package directory (for example <flowleap-harness>/apps/web/node_modules/playwright), or run from a directory that has playwright in node_modules (npm i -D playwright, then npx playwright install chromium).');
  process.exit(2);
}

const dir = path.resolve(process.argv[2] ?? '');
if (!process.argv[2] || !existsSync(dir)) {
  console.error('Usage: node check-mockups.mjs <dir> [--shoot <outdir>]');
  process.exit(2);
}
const onlyAt = process.argv.indexOf('--only');
const pages = readdirSync(dir).filter(f => f.endsWith('.html') && (onlyAt < 0 || f.includes(process.argv[onlyAt + 1]))).sort();
if (!pages.length) {
  console.error(`check-mockups: no .html mockup in ${dir}`);
  process.exit(2);
}
const shootAt = process.argv.indexOf('--shoot');
const outdir = shootAt > 0 ? path.resolve(process.argv[shootAt + 1] ?? path.join(dir, 'screenshots')) : null;

/** act id -> { mac, de } from the key map table: the macOS column and the German keycap column. */
const keys = {};
let head = null;
for (const line of readFileSync(path.join(skill, 'keys.md'), 'utf8').split('\n')) {
  const c = line.split('|').map(s => s.trim());
  if (c.includes('`data-act`')) { head = c; continue; }
  const id = head && c[head.indexOf('`data-act`')]?.match(/^`([\w-]+)`$/)?.[1];
  if (!id) continue;
  const mac = c[head.indexOf('macOS')];
  keys[id] = { mac, de: c[head.indexOf('German keycap')] || mac };
}
if (!Object.keys(keys).length) {
  console.error('check-mockups: keys.md has no table with a `data-act` column');
  process.exit(2);
}
const atlas = Object.fromEntries(Object.entries(STATUS).flatMap(([m, states]) => Object.entries(states).map(([s, v]) => [`${m}.${s}`, v])));
const panelBoxes = readFileSync(path.join(import.meta.dirname, 'panel-boxes.js'), 'utf8');
const deny = DENY.map(([rule, re]) => [rule, re.source, re.flags]);

const VIEWS = [
  { name: '1440', viewport: { width: 1440, height: 900 } },
  { name: '1366', viewport: { width: 1366, height: 650 } },
  { name: '390', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
];

/** Runs in the page; returns { problems, primaries, bars, fixed, acts, reach }. */
function inspect({ keys, atlas, deny, view }) {
  const lang = document.documentElement.lang;
  const problems = [];
  const style = el => getComputedStyle(el);
  const shown = el => el.getClientRects().length > 0 && style(el).visibility !== 'hidden';
  const probe = (prop, value) => {
    const p = document.createElement('div');
    p.style.setProperty(prop, value);
    document.body.append(p);
    const v = style(p)[prop === 'background-color' ? 'backgroundColor' : 'color'];
    p.remove();
    return v;
  };
  if (!style(document.body).getPropertyValue('--dsw-alias-bg-base').trim()) {
    return { problems: ['the client theme did not load (--dsw-alias-bg-base does not resolve)'], primaries: 0, bars: [], fixed: false, acts: [], reach: [] };
  }

  // R12: primaries by their computed fill.
  const fill = probe('background-color', 'var(--dsw-alias-button-primary-fill)');
  const controls = [...document.querySelectorAll('.btn, button, [role=button], [data-act]')].filter(shown);
  const enabled = controls.filter(b => style(b).backgroundColor === fill && b.getAttribute('aria-disabled') !== 'true' && style(b).opacity !== '0.4');
  if (enabled.length > 1) problems.push(`${enabled.length} enabled primary buttons`);

  // R13: the decision is in view, not covered and takes a click, also with each scroll container at its end.
  const modal = [...document.querySelectorAll('[data-modal]')].some(shown);
  const decisionButtons = [...document.querySelectorAll('.decision [data-act]')].filter(shown).filter(b => style(b).backgroundColor === fill);
  const bars = decisionButtons.map(b => b.getBoundingClientRect());
  const name = el => `${el.tagName.toLowerCase()}${[...el.classList].map(c => `.${c}`).join('')}`;
  const reachable = where => decisionButtons.forEach(b => {
    const r = b.getBoundingClientRect();
    if (style(b).pointerEvents === 'none') {
      let from = b;
      while (from.parentElement && style(from.parentElement).pointerEvents === 'none') from = from.parentElement;
      problems.push(`the decision button takes no click: ${from === b ? 'it has' : `${name(from)} gives it`} pointer-events: none`);
    } else if (r.bottom > innerHeight || r.top < 0) problems.push(`decision button at ${Math.round(r.top)} to ${Math.round(r.bottom)} px, outside the ${innerHeight} px view${where}`);
    else if (!modal) {
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!hit || !b.contains(hit)) problems.push(`the decision button is covered by ${hit ? name(hit) : 'nothing it owns'}${where}`);
    }
  });
  reachable('');
  const scrollers = [document.scrollingElement, ...[...document.querySelectorAll('body *')].filter(el => shown(el) && /auto|scroll/.test(style(el).overflowY))]
    .filter(el => el.scrollHeight > el.clientHeight + 1);
  for (const el of scrollers) {
    const at = el.scrollTop;
    const where = ` when ${el === document.scrollingElement ? 'the page' : name(el)} scrolls to its end`;
    el.scrollTop = el.scrollHeight;
    reachable(where);
    decisionButtons.forEach((b, i) => {
      const moved = Math.round(b.getBoundingClientRect().top - bars[i].top);
      if (Math.abs(moved) > 1) problems.push(`the decision bar moves ${moved} px${where}; dock it below the scrolling content`);
    });
    el.scrollTop = at;
  }

  // Checklist 25: no sideways scroll, nothing cut at the right edge.
  const wide = document.scrollingElement.scrollWidth - innerWidth;
  if (wide > 0) problems.push(`the page scrolls ${wide} px sideways`);
  const scrolls = el => { for (let p = el.parentElement; p; p = p.parentElement) if (/auto|scroll/.test(style(p).overflowX)) return true; return false; };
  for (const el of document.querySelectorAll('body *')) {
    const b = el.getBoundingClientRect();
    if (b.width && b.right > innerWidth + 1 && b.left < innerWidth && shown(el) && !scrolls(el)) { problems.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} is cut at the right edge`); break; }
  }

  // R16: keys.
  const coarse = matchMedia('(pointer: coarse)').matches;
  for (const k of document.querySelectorAll('.kbd')) {
    if (!shown(k)) continue;
    if (coarse) { problems.push(`key "${k.textContent}" shows on a touch screen`); break; }
    const act = k.closest('[data-act]');
    if (!act) { problems.push(`key "${k.textContent}" with no data-act`); continue; }
    const want = keys[act.dataset.act];
    const got = [...act.querySelectorAll('.kbd')].map(x => x.textContent.trim()).join(' ');
    if (!want) problems.push(`data-act="${act.dataset.act}" is not in keys.md`);
    else if (got !== (lang === 'de' ? want.de : want.mac)) problems.push(`${act.dataset.act} shows "${got}", keys.md says "${lang === 'de' ? want.de : want.mac}"`);
  }
  if (!coarse) {
    for (const a of document.querySelectorAll('.btn[data-act], .cmdk-i[data-act], .mi[data-act], .seg > [data-act]')) {
      if (shown(a) && keys[a.dataset.act]?.mac && !a.querySelector('.kbd')) problems.push(`${a.dataset.act} shows no key; keys.md gives ${keys[a.dataset.act].mac}`);
    }
  }
  const textNodes = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode());) if (n.textContent.trim() && !n.parentElement.closest('script, style') && shown(n.parentElement)) textNodes.push(n);
  for (const n of textNodes) {
    if (n.parentElement.closest('.kbd')) continue;
    const typedKey = n.textContent.match(/(?<!\w)\((?:[⌘⌥⇧⌃]+\s*)?(?:[A-Z0-9]|↵|Space|Leer|Esc|Enter|Tab)\)|[⌘⌥⇧⌃↵]/);
    if (typedKey) problems.push(`key "${typedKey[0]}" typed into a label; show it with the keycap of its data-act`);
  }

  // R11: status icon with its word.
  const groupShape = el => {
    const row = el.closest('.row, .card');
    if (!row) return null;
    if (row.matches('.card')) return row.closest('.col')?.querySelector('.col-h [data-atlas] .st')?.dataset.s ?? null;
    for (let p = row.previousElementSibling; p; p = p.previousElementSibling) if (p.matches('.group')) return p.querySelector('[data-atlas] .st')?.dataset.s ?? null;
    return null;
  };
  /** Why a status word that innerText reports is not seen, or null: a box under 2 x 2 px, a clip, or no colour. */
  const wordHidden = owner => {
    const w = document.createTreeWalker(owner, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) {
      if (!n.textContent.trim()) continue;
      for (let el = n.parentElement; el && owner.contains(el); el = el.parentElement) {
        const s = style(el);
        const b = el.getBoundingClientRect();
        if (b.width < 2 || b.height < 2) return `${name(el)} is ${Math.round(b.width)} x ${Math.round(b.height)} px`;
        if (s.clip !== 'auto' && /absolute|fixed/.test(s.position)) return `${name(el)} has clip: ${s.clip}`;
        if (s.clipPath !== 'none') return `${name(el)} has clip-path: ${s.clipPath}`;
        if (parseFloat(s.opacity) === 0) return `${name(el)} has opacity: 0`;
      }
      const c = style(n.parentElement).color;
      const alpha = c === 'transparent' ? 0 : c.startsWith('rgba') ? parseFloat(c.split(',').pop()) : c.includes('/') ? parseFloat(c.split('/').pop()) : 1;
      if (alpha === 0) return `${name(n.parentElement)} has a transparent colour`;
    }
    return null;
  };
  for (const st of document.querySelectorAll('.st[data-s]')) {
    if (!shown(st)) continue;
    const owner = st.closest('[data-atlas]');
    if (owner) continue;
    if (st.getAttribute('aria-hidden') === 'true' && groupShape(st) === st.dataset.s) continue;
    problems.push(`a status icon (${st.dataset.s}) with no word: put it in a [data-atlas] element with its word, or mark a row icon aria-hidden under a header of the same state`);
    break;
  }
  for (const el of document.querySelectorAll('.pill, .status')) if (shown(el) && !el.matches('[data-atlas]')) { problems.push(`a .${el.classList[0]} "${el.textContent.trim()}" with no data-atlas`); break; }
  for (const el of document.querySelectorAll('[data-atlas]')) {
    if (!shown(el)) continue;
    const want = atlas[el.dataset.atlas];
    const st = el.querySelector('.st[data-s]');
    if (!want) { problems.push(`data-atlas="${el.dataset.atlas}" is not an atlas state`); continue; }
    if (!st || st.dataset.s !== want[0]) problems.push(`${el.dataset.atlas} shows the shape ${st?.dataset.s ?? 'none'}, the status map says ${want[0]}`);
    const word = lang === 'de' ? want[2] : want[1];
    if (el.innerText.trim() !== word) problems.push(`${el.dataset.atlas} shows "${el.innerText.trim()}", the status map says "${word}"`);
    const hidden = wordHidden(el);
    if (hidden) problems.push(`${el.dataset.atlas}: the word "${word}" is in the text but not seen: ${hidden}`);
  }

  // R11: no typed day or week counts.
  const NUM = '(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fourteen|thirty|ein|eine|einen|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|elf|zwölf|vierzehn|dreißig)';
  const COUNT = new RegExp(`(?<![\\w.])${NUM}[\\s-]*(?:days?|d|weeks?|wks?|business days?|working days?|Tage?n?|T|Werktage?n?|Arbeitstage?n?|Wochen?)\\b`, 'i');
  for (const n of textNodes) {
    if (n.parentElement.closest('[data-due]')) continue;
    const typed = n.textContent.match(COUNT);
    if (typed) problems.push(`typed day count "${typed[0]}"`);
  }

  // R19: deny-list on the shown text and the copy attributes.
  const exempt = el => el.closest('[data-verbatim], [data-audit], [data-address]');
  const words = textNodes.filter(n => !exempt(n.parentElement)).map(n => n.textContent);
  for (const el of document.querySelectorAll('[title], [aria-label], [placeholder], [alt]')) {
    if (exempt(el)) continue;
    for (const a of ['title', 'aria-label', 'placeholder', 'alt']) if (el.hasAttribute(a)) words.push(el.getAttribute(a));
  }
  const text = words.join(' ');
  for (const [rule, src, flags] of deny) for (const m of text.matchAll(new RegExp(src, flags))) problems.push(`${rule} "${m[0]}"`);

  // R3: no text in the icon grey.
  const tertiary = probe('color', 'var(--dsw-alias-label-tertiary)');
  for (const n of textNodes) if (style(n.parentElement).color === tertiary) { problems.push(`text "${n.textContent.trim().slice(0, 40)}" in --dsw-alias-label-tertiary`); break; }

  // R8: a neutral border and a shadow on one element.
  const neutral = new Set(['l1', 'l2', 'l3'].map(l => probe('color', `var(--dsw-alias-border-${l})`)));
  for (const el of document.querySelectorAll('body *')) {
    const s = style(el);
    if (!shown(el) || s.boxShadow === 'none') continue;
    const side = ['Top', 'Right', 'Bottom', 'Left'].find(x => parseFloat(s[`border${x}Width`]) > 0 && s[`border${x}Style`] === 'solid' && neutral.has(s[`border${x}Color`]));
    if (side) { problems.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} has a neutral border and a shadow`); break; }
  }

  // R7: radius on the scale and in the height band of docs/ui-radius.md.
  for (const el of document.querySelectorAll('body *')) {
    if (!shown(el) || el.closest('[data-drawing], [data-verbatim]')) continue;
    const s = style(el);
    if (s.display === 'inline') continue;
    const raw = s.borderTopLeftRadius;
    const r = parseFloat(raw);
    if (!r) continue;
    const b = el.getBoundingClientRect();
    if (raw.endsWith('%') || r >= Math.min(b.width, b.height) / 2 - 0.5) continue;
    const h = b.height;
    const onScale = [4, 8, 12, 16, 20, 28].includes(r);
    const hh = Math.round(h);
    const band = hh < 20 ? r === 4 : hh <= 28 ? r === 8 : hh < 32 ? r === 8 || r === 12 : hh <= 40 ? r === 12 : r >= 12;
    if (!onScale || !band) { problems.push(`${name(el)} is ${hh} px high with radius ${r} px; docs/ui-radius.md gives R4 below 20 px, R8 for 20 to 28 px controls, R12 for 32 to 40 px cells, R16 to R28 for cards and panels`); break; }
  }

  // R17: no ellipsis at desktop widths except a queue list row's title or matter cell.
  if (view !== '390') {
    for (const el of document.querySelectorAll('body *')) {
      if (!shown(el) || style(el).textOverflow !== 'ellipsis' || el.scrollWidth <= el.clientWidth + 1) continue;
      if (el.matches('.list .row .t, .list .row .m')) continue;
      problems.push(`"${el.textContent.trim().slice(0, 48)}" is cut with an ellipsis at ${innerWidth} px; shorten the value or give it room`);
    }
  }

  // R12: a bulk bar shows only for a selection, with the number of checked rows.
  const checked = [...document.querySelectorAll('.list .row.is-checked')].filter(r => shown(r) && r.closest('.list.selecting')).length;
  for (const bulk of document.querySelectorAll('[data-bulk]')) {
    if (!shown(bulk)) continue;
    if (!checked) { problems.push('a bulk decision bar shows with 0 rows checked; with no row checked there is no bulk bar'); continue; }
    const counts = textNodes.filter(n => bulk.contains(n) && !n.parentElement.closest('.kbd')).flatMap(n => n.textContent.match(/\d+/g) ?? []).map(Number);
    const wrong = counts.find(n => n !== checked);
    if (!counts.length || wrong !== undefined) problems.push(`a bulk decision bar says ${counts.length ? wrong : 'no number'}; ${checked} rows are checked`);
  }

  // R16: one label names one act with one key on a page.
  const labels = new Map();
  for (const a of document.querySelectorAll('.btn[data-act], .cmdk-i[data-act], .mi[data-act]')) {
    const label = [...a.childNodes].filter(n => n.nodeType === Node.TEXT_NODE || !n.matches('.kbd, .kbds, svg')).map(n => n.textContent).join('').trim();
    if (!label) continue;
    const key = [...a.querySelectorAll('.kbd')].map(k => k.textContent.trim()).join(' ');
    const e = labels.get(label) ?? { acts: new Set(), keys: new Set() };
    e.acts.add(a.dataset.act);
    if (key) e.keys.add(key);
    labels.set(label, e);
  }
  for (const [label, { acts, keys }] of labels) {
    if (acts.size > 1) problems.push(`the label "${label}" names ${acts.size} acts: ${[...acts].join(', ')}`);
    if (keys.size > 1) problems.push(`the label "${label}" shows ${keys.size} keys: ${[...keys].join(', ')}`);
  }

  // Checklist 25: the acts a page offers.
  const actOf = el => el.closest('[data-act]')?.dataset.act;
  const acts = [...document.querySelectorAll('.btn[data-act], .cmdk-i[data-act], .mi[data-act], .seg > [data-act]')].filter(shown).map(actOf);
  const overflow = [...document.querySelectorAll('[data-overflow]')].filter(shown).flatMap(o => [...(document.getElementById(o.dataset.overflow)?.querySelectorAll('[data-act]') ?? [])].map(actOf));
  const narrowPages = [...document.querySelectorAll('[data-narrow-page]')].map(e => [e.dataset.narrowPage, [...e.querySelectorAll('[data-act]')].map(actOf)]);
  return { problems: [...new Set(problems)], primaries: enabled.length, bars: bars.map(b => Math.round(b.bottom)), fixed: !!document.querySelector('.panel.fixed'), acts: [...new Set(acts)], reach: [...new Set([...acts, ...overflow])], narrowPages };
}

const { chromium } = loadPlaywright();
// channel 'chromium' is the full browser in its new headless mode: the headless shell draws no backdrop-filter, so a
// menu would show see-through in a screenshot. A phone's primary pointer is coarse and cannot hover; Playwright's touch emulation keeps (pointer: fine), so the
// 390 px view runs in a browser whose Blink settings declare a touch screen.
const browsers = {
  fine: await chromium.launch({ channel: 'chromium' }),
  coarse: await chromium.launch({ channel: 'chromium', args: ['--blink-settings=primaryPointerType=2,availablePointerTypes=2,primaryHoverType=1,availableHoverTypes=1'] }),
};
let failed = 0;
/** `${file}|${state}|${theme}` -> { wide: acts at 1440, narrow: acts reachable at 390, narrowPages }. */
const reach = new Map();
for (const view of VIEWS) {
  const context = await browsers[view.hasTouch ? 'coarse' : 'fine'].newContext({ viewport: view.viewport, isMobile: !!view.isMobile, hasTouch: !!view.hasTouch });
  const page = await context.newPage();
  for (const file of pages) {
    const html = readFileSync(path.join(dir, file), 'utf8');
    const states = [...new Set([...html.matchAll(/data-state="([^"]+)"/g)].flatMap(m => m[1].split(' ')))].filter(s => s !== 'default');
    for (const state of ['', ...states]) {
      for (const theme of ['dark', 'light']) {
        await page.goto(`file://${dir}/${file}?theme=${theme}${state ? `&state=${state}` : ''}`);
        await page.evaluate(() => document.fonts.ready);
        const r = await page.evaluate(inspect, { keys, atlas, deny, view: view.name });
        if (view.hasTouch && !(await page.evaluate(() => matchMedia('(pointer: coarse)').matches))) r.problems.push('the 390 px view did not emulate a coarse pointer');
        if (!r.problems[0]?.startsWith('the client theme did not load')) for (const box of await page.evaluate(panelBoxes)) r.problems.push(`a box inside the panel: ${box}`);
        const key = `${file}|${state}|${theme}`;
        const entry = reach.get(key) ?? {};
        if (view.name === '1440') Object.assign(entry, { wide: r.acts, narrowPages: r.narrowPages });
        if (view.name === '390') entry.narrow = r.reach;
        reach.set(key, entry);
        const name = `${file.replace(/\.html$/, '').replace('.', '-')}${state ? `-${state}` : ''}-${theme}-${view.name}`;
        if (r.problems.length) failed++;
        console.log(`${r.problems.length ? 'FAIL' : 'PASS'} ${name}: ${r.primaries} enabled primary; decision button ends at ${r.bars.length ? r.bars.join(', ') + ' px' : 'none'}${r.problems.length ? '; ' + r.problems.join('; ') : ''}`);
        if (outdir) {
          mkdirSync(outdir, { recursive: true });
          await page.screenshot({ path: path.join(outdir, `${name}.png`), fullPage: !r.fixed, animations: 'disabled' });
        }
      }
    }
  }
  await context.close();
}
await browsers.fine.close();
await browsers.coarse.close();

// Checklist 25: every act offered at 1440 px has a path at 390 px.
for (const [key, { wide = [], narrow = [], narrowPages = [] }] of reach) {
  const [file, state, theme] = key.split('|');
  const elsewhere = narrowPages.flatMap(([page, acts]) => !pages.includes(page) || acts.every(a => (reach.get(`${page}||${theme}`)?.narrow ?? []).includes(a)) ? acts : []);
  const missing = wide.filter(a => !narrow.includes(a) && !elsewhere.includes(a));
  if (missing.length) {
    failed++;
    console.log(`FAIL ${file.replace(/\.html$/, '')}${state ? `-${state}` : ''}-${theme}: at 390 px no path to ${missing.join(', ')}; show it, put it in a [data-overflow] menu, or name its page with data-narrow-page`);
  }
}
console.log(`${failed ? 'FAIL' : 'PASS'} check-mockups: ${failed} failing view(s)`);
process.exit(failed ? 1 : 0);
