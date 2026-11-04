// Checks a folder of HTML mockups in a browser, in both themes, at 1440 x 900, 1366 x 650 and 390 x 844.
// Usage: node check-mockups.mjs <dir> [--shoot <outdir>]. Exits 1 on a failure, 2 when Playwright is missing.
// Checks: at most one enabled primary button per view (R12); the primary button of each decision bar is inside
// the view at every size (R13); no page-wide horizontal scroll and nothing cut at the right edge (checklist 25); each key shown matches
// keys.md (R16); each [data-atlas] status shows the shape and word of status-map.mjs (R11); no day count typed
// into the page outside the [data-due] elements that frame.js fills (R11); no deny-list word (R19); no box inside
// the content panel other than the allowed ones of panel-boxes.js (R8).
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
const shootAt = process.argv.indexOf('--shoot');
const outdir = shootAt > 0 ? path.resolve(process.argv[shootAt + 1] ?? path.join(dir, 'screenshots')) : null;

/** act id -> { mac, de } from the key map table. */
const keys = {};
for (const line of readFileSync(path.join(skill, 'keys.md'), 'utf8').split('\n')) {
  const c = line.split('|').map(s => s.trim());
  const id = c[2]?.match(/^`([\w-]+)`$/)?.[1];
  if (id) keys[id] = { mac: c[3], de: c[5] || c[3] };
}
const atlas = Object.fromEntries(Object.entries(STATUS).flatMap(([m, states]) => Object.entries(states).map(([s, v]) => [`${m}.${s}`, v])));
const panelBoxes = readFileSync(path.join(import.meta.dirname, 'panel-boxes.js'), 'utf8');
const deny = DENY.map(([rule, re]) => [rule, re.source, re.flags]);

const VIEWS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1366', width: 1366, height: 650 },
  { name: '390', width: 390, height: 844 },
];

const { chromium } = loadPlaywright();
const browser = await chromium.launch();
let failed = 0;
for (const view of VIEWS) {
  const page = await browser.newPage({ viewport: { width: view.width, height: view.height } });
  for (const file of readdirSync(dir).filter(f => f.endsWith('.html')).sort()) {
    const html = readFileSync(path.join(dir, file), 'utf8');
    const states = [...new Set([...html.matchAll(/data-state="([^"]+)"/g)].flatMap(m => m[1].split(' ')))].filter(s => s !== 'default');
    for (const state of ['', ...states]) {
      for (const theme of ['dark', 'light']) {
        await page.goto(`file://${dir}/${file}?theme=${theme}${state ? `&state=${state}` : ''}`);
        await page.evaluate(() => document.fonts.ready);
        const r = await page.evaluate(({ keys, atlas, deny }) => {
          const lang = document.documentElement.lang;
          const shown = el => el.offsetParent !== null || getComputedStyle(el).position === 'fixed';
          const problems = [];
          const enabled = [...document.querySelectorAll('.btn-primary')].filter(shown).filter(b => b.getAttribute('aria-disabled') !== 'true');
          if (enabled.length > 1) problems.push(`${enabled.length} enabled primary buttons`);
          const bars = [...document.querySelectorAll('.decision .btn-primary')].filter(shown).map(b => b.getBoundingClientRect());
          for (const b of bars) if (b.bottom > innerHeight || b.top < 0) problems.push(`decision button at ${Math.round(b.top)} to ${Math.round(b.bottom)} px, outside the ${innerHeight} px view`);
          const wide = document.scrollingElement.scrollWidth - innerWidth;
          if (wide > 0) problems.push(`the page scrolls ${wide} px sideways`);
          const scrolls = el => { for (let p = el.parentElement; p; p = p.parentElement) if (/auto|scroll/.test(getComputedStyle(p).overflowX)) return true; return false; };
          for (const el of document.querySelectorAll('body *')) {
            const b = el.getBoundingClientRect();
            if (b.width && b.right > innerWidth + 1 && b.left < innerWidth && shown(el) && !scrolls(el)) { problems.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} is cut at the right edge`); break; }
          }
          for (const k of document.querySelectorAll('.kbd')) {
            const act = k.closest('[data-act]');
            if (!act) { problems.push(`key "${k.textContent}" with no data-act`); continue; }
            const want = keys[act.dataset.act];
            const got = [...act.querySelectorAll('.kbd')].map(x => x.textContent.trim()).join(' ');
            if (!want) problems.push(`data-act="${act.dataset.act}" is not in keys.md`);
            else if (got !== (lang === 'de' ? want.de : want.mac)) problems.push(`${act.dataset.act} shows "${got}", keys.md says "${lang === 'de' ? want.de : want.mac}"`);
          }
          for (const el of document.querySelectorAll('[data-atlas]')) {
            const want = atlas[el.dataset.atlas];
            const st = el.querySelector('.st[data-s]');
            if (!want) { problems.push(`data-atlas="${el.dataset.atlas}" is not an atlas state`); continue; }
            if (!st || st.dataset.s !== want[0]) problems.push(`${el.dataset.atlas} shows the shape ${st?.dataset.s ?? 'none'}, the status map says ${want[0]}`);
            if (lang === 'en' && el.textContent.trim() !== want[1]) problems.push(`${el.dataset.atlas} says "${el.textContent.trim()}", the status map says "${want[1]}"`);
          }
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          for (let n; (n = walker.nextNode());) {
            if (n.parentElement.closest('[data-due], script, style')) continue;
            const typed = n.textContent.match(/\b\d+\s*(?:days?|d|Tage?n?|T)\b/i);
            if (typed) problems.push(`typed day count "${typed[0]}"`);
          }
          const words = [];
          const shownText = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          for (let n; (n = shownText.nextNode());) if (!n.parentElement.closest('[data-verbatim], [data-audit], script, style, [hidden]')) words.push(n.textContent);
          const text = words.join(' ').replace(/\S+@\S+\.\w+/g, ' ');
          for (const [rule, src, flags] of deny) for (const m of text.matchAll(new RegExp(src, flags))) problems.push(`${rule} "${m[0]}"`);
          return { problems: [...new Set(problems)], primaries: enabled.length, bars: bars.map(b => Math.round(b.bottom)), fixed: !!document.querySelector('.panel.fixed') };
        }, { keys, atlas, deny });
        for (const box of await page.evaluate(panelBoxes)) r.problems.push(`a box inside the panel: ${box}`);
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
  await page.close();
}
await browser.close();
console.log(`${failed ? 'FAIL' : 'PASS'} check-mockups: ${failed} failing view(s)`);
process.exit(failed ? 1 : 0);
