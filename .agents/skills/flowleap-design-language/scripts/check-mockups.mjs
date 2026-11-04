// Checks a folder of HTML mockups at 1440 x 900 in both themes, and optionally screenshots them.
// Usage: node check-mockups.mjs <dir> [--shoot]. Exits 1 on a failure.
// Checks: at most one enabled primary button per view; the primary button of each decision bar ends
// inside the first viewport; no day count typed into the page (compute it from one "today").
// A page picks its theme from ?theme=dark|light and its view state from ?state=<name> (data-state).
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const repo = path.resolve(import.meta.dirname, '../../../..');
const { chromium } = createRequire(path.join(repo, 'apps/web/package.json'))('playwright');
const dir = path.resolve(process.argv[2]);
const shoot = process.argv.includes('--shoot');
const VIEW = { width: 1440, height: 900 };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: VIEW });
let failed = 0;
for (const file of readdirSync(dir).filter(f => f.endsWith('.html')).sort()) {
  const html = readFileSync(path.join(dir, file), 'utf8');
  const typed = html.match(/\b\d+ (days left|Tage)\b|noch \d+ Tage/g);
  if (typed) { failed++; console.log(`FAIL ${file}: typed day count "${typed[0]}"`); }
  const states = [...new Set([...html.matchAll(/data-state="([^"]+)"/g)].flatMap(m => m[1].split(' ')))].filter(s => s !== 'default');
  for (const state of ['', ...states]) {
    for (const theme of ['dark', 'light']) {
      await page.goto(`file://${dir}/${file}?theme=${theme}${state ? `&state=${state}` : ''}`);
      const r = await page.evaluate(() => {
        const shown = el => el.offsetParent !== null || getComputedStyle(el).position === 'fixed';
        const enabled = [...document.querySelectorAll('.btn-primary')].filter(shown).filter(b => b.getAttribute('aria-disabled') !== 'true');
        const bars = [...document.querySelectorAll('.decision .btn-primary')].filter(shown).map(b => Math.round(b.getBoundingClientRect().bottom));
        return { primaries: enabled.length, bars, fixed: !!document.querySelector('.panel.fixed') };
      });
      const ok = r.primaries <= 1 && r.bars.every(y => y <= VIEW.height);
      if (!ok) failed++;
      const name = `${file.replace(/\.html$/, '').replace('.', '-')}${state ? `-${state}` : ''}-${theme}`;
      console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${r.primaries} enabled primary; decision button ends at ${r.bars.length ? r.bars.join(', ') + ' px' : 'none'}`);
      if (shoot) {
        mkdirSync(path.join(dir, 'screenshots'), { recursive: true });
        await page.screenshot({ path: path.join(dir, 'screenshots', `${name}.png`), fullPage: !r.fixed, animations: 'disabled' });
      }
    }
  }
}
await browser.close();
process.exit(failed ? 1 : 0);
