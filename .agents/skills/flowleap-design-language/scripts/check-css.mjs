// Fails on any styling value that is not a token of the harness client theme (packages/client/ui-theme) or on the
// spacing scale (rules R1, R2, R5, R7, R8, R9, R10, R15).
// Usage: node check-css.mjs <file or dir>... [--pairs] [--theme <ui-theme styles dir>]. Exits 1 on a failure, 2 on a
// usage error or a missing theme. Reads .css files, <style> blocks and style="" attributes in .html files, and style=""
// strings in .js files. --pairs prints each foreground and background token pair that one CSS rule sets; a pair
// without a row in contrast.mjs is a failure.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { loadTheme, themeDir } from './client-theme.mjs';
import { pairs as measured } from './contrast.mjs';

const args = process.argv.slice(2);
const listPairs = args.includes('--pairs');
const inputs = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--theme');
if (!inputs.length) {
  console.error('Usage: node check-css.mjs <file or dir>... [--pairs] [--theme <dir>]');
  process.exit(2);
}
const theme = loadTheme(themeDir());

const files = [];
const walk = p => {
  if (statSync(p).isDirectory()) for (const f of readdirSync(p)) walk(path.join(p, f));
  else if (/\.(css|html|js)$/.test(p)) files.push(p);
};
inputs.forEach(walk);

/** The spacing scale of R5; the client has no spacing tokens. */
const SPACE = new Set(['0', '2px', '4px', '8px', '12px', '16px', '24px', '32px', '48px']);
const COLOUR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color|color-mix)\(|\b(?:white|black|red|green|blue|gray|grey|orange|yellow|purple|pink)\b/i;
// --dsw-alias-border-l4 and the label colours may draw a 1 px border that alone identifies a control (WCAG 1.4.11).
const NEUTRAL_LINE = /var\(--dsw-alias-border-l[123](?:-darkmode-thin)?\)/;
const SPACE_PROPS = /^(?:margin|padding)(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?$|^(?:row-|column-)?gap$/;
const LAYOUT_PROPS = /^(?:all|width|height|min-|max-|margin|padding|top|left|right|bottom|inset|gap|grid|flex|font-size|line-height|letter-spacing)/;
const stripVars = v => v.replace(/var\(--[\w-]+\)/g, 'TOKEN');
const px = v => Number.parseFloat(v);

/** Splits a value at each separator that is outside parentheses. */
function splitTop(v, sep) {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of v.trim()) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth === 0 && sep.test(ch)) { if (cur) out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out.map(x => x.trim()).filter(Boolean);
}
const parts = v => splitTop(v, /\s/);
const topLevel = v => splitTop(v, /,/);
const spaceOk = p => SPACE.has(p) || p === 'auto' || /^\d+vh$/.test(p) || SPACE.has(p.match(/^calc\(-1 \* (\d+px)\)$/)?.[1]);

/** Returns the reason a declaration breaks a rule, or null. */
function judge(prop, value, rule) {
  const v = value.replace(/\s*!important$/, '').trim();
  for (const m of v.matchAll(/var\((--[\w-]+)/g)) {
    if (!theme.names.has(m[1])) return `${m[1]} is not a token of the client theme`;
    if (m[1].startsWith('--dsw-static-')) return 'R9: feature CSS uses --dsw-alias-* roles, never the --dsw-static-* palette (docs/web-styling.md)';
  }
  if (v === 'inherit' || v === 'unset' || v === 'initial') return null;
  if (prop === 'font-size') return /^var\(--dsw-font-[\w-]+-font-size\)$/.test(v) ? null : 'R1: font-size is a client --dsw-font-*-font-size token';
  if (prop === 'line-height') return /^var\(--dsw-font-[\w-]+-line-height\)$/.test(v) || v === '1' ? null : 'R1: line-height is the --dsw-font-*-line-height token of the size, or 1 for an icon or a key';
  if (prop === 'font-family') return /^var\(--(?:dsw-font-family|ds-font-family-code)\)$/.test(v) ? null : 'R1: font-family is --dsw-font-family or --ds-font-family-code';
  if (prop === 'letter-spacing') return v === '0' || v === 'normal' ? null : 'R1: the client theme has no tracking tokens';
  if (prop === 'font-weight' || prop === 'font') {
    const w = prop === 'font-weight' ? v : v.match(/var\(--dsw-font-[\w-]+-font-weight\)/)?.[0];
    if (prop === 'font' && /\d/.test(stripVars(v).replace(/\/1(?=\s)/, ''))) return 'R1/R2: the font shorthand uses only client font tokens';
    if (prop === 'font-weight' && !/^var\(--dsw-font-[\w-]+-font-weight\)$/.test(v)) return 'R2: font-weight is a client --dsw-font-*-font-weight token';
    if (w && Number(theme.light[w.slice(4, -1)]) > 500) return `R2: ${w} is above the 500 cap`;
    return null;
  }
  if (/^border(?:-[\w]+)*-radius$/.test(prop)) {
    return parts(v).every(p => p === '0' || p === '999px' || p === '50%' || /^var\(--dsw-radius-[\w-]+\)$/.test(p)) ? null : 'R7: border-radius is a --dsw-radius-* token, 999px for a capsule or 50% for a circle';
  }
  if (SPACE_PROPS.test(prop)) return parts(v).every(spaceOk) ? null : 'R5: margin, padding and gap are 0, auto or the scale 2, 4, 8, 12, 16, 24, 32, 48 px';
  if (prop === 'opacity' && !rule.keyframes) return ['0', '1', '0.4'].includes(v) ? null : 'R10: opacity is 0, 1, or 0.4 on an inactive control (the client Button); never dim readable text';
  if (/^(?:transition|animation)(?:-duration|-delay)?$/.test(prop)) {
    if (/\d(?:ms|s)\b/.test(stripVars(v))) return 'R15: durations are the client --ds-transition-duration* tokens';
    if (prop === 'transition') {
      for (const t of topLevel(v)) {
        const name = t.split(/\s+/)[0];
        if (LAYOUT_PROPS.test(name)) return `R15: "${name}" may not transition; use transform, opacity or a colour`;
        if (/\b(?:ease-in|linear)\b(?!-)|cubic-bezier/.test(t)) return 'R15: easing is var(--ds-ease-in-out), ease, ease-out or ease-in-out; never ease-in or a literal curve';
      }
    }
    return null;
  }
  if (prop === 'transition-timing-function') return 'R15: set the easing inside the transition shorthand';
  if (/^border(?:-(?:top|right|bottom|left))?$/.test(prop) && NEUTRAL_LINE.test(v) && /\bsolid\b/.test(v) && !/(?:^|\s)0\.5px\b/.test(v)) {
    return 'R8: a neutral solid border is 0.5px';
  }
  if (!prop.startsWith('--') && COLOUR.test(stripVars(v))) return 'R9: colours are client token roles; no literal colour and no runtime color-mix';
  return null;
}

let failed = 0;
const usedPairs = new Map();
const fail = (file, where, msg) => { failed++; console.log(`FAIL ${file}${where}: ${msg}`); };

function checkRule(file, rule) {
  const decls = rule.decls;
  for (const [prop, value] of decls) {
    const why = judge(prop, value, rule);
    if (why) fail(file, ` ${rule.selector}`, `${prop}: ${value} (${why})`);
  }
  const get = p => decls.filter(([k]) => k === p).map(([, v]) => v).pop();
  const shadow = get('box-shadow');
  if (shadow && /var\(--dsw-elevation-/.test(shadow)) {
    const border = decls.find(([k, v]) => /^border(?:-(?:top|right|bottom|left))?$/.test(k) && v.trim() !== '0' && v.trim() !== 'none' && NEUTRAL_LINE.test(v));
    if (border) fail(file, ` ${rule.selector}`, `${border[0]}: ${border[1]} with an elevation shadow (R8: an elevated surface takes a --dsw-elevation-* shadow and border: 0)`);
  }
  const fg = (get('color') || '').match(/^var\((--[\w-]+)\)$/)?.[1];
  const bg = (get('background') || get('background-color') || '').match(/^var\((--[\w-]+)\)$/)?.[1];
  if (fg && bg) {
    const key = `${fg} on ${bg}`;
    if (!usedPairs.has(key)) usedPairs.set(key, `${file} ${rule.selector}`);
  }
}

function parseCss(css, file) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const stack = [];
  let buf = '';
  for (const ch of css) {
    if (ch === '{') {
      stack.push({ selector: buf.trim(), keyframes: /^@keyframes/.test(buf.trim()) || stack.some(s => s.keyframes), decls: [] });
      buf = '';
    } else if (ch === '}') {
      const rule = stack.pop();
      if (!rule) continue;
      addDecls(rule, buf);
      buf = '';
      if (!rule.selector.startsWith('@')) checkRule(file, rule);
    } else if (ch === ';' && stack.length) {
      addDecls(stack[stack.length - 1], buf);
      buf = '';
    } else buf += ch;
  }
}
function addDecls(rule, text) {
  const m = text.trim().match(/^([\w-]+)\s*:\s*([\s\S]+)$/);
  if (m) rule.decls.push([m[1].toLowerCase(), m[2].trim()]);
}

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const rel = path.relative(process.cwd(), file);
  if (file.endsWith('.css')) parseCss(src, rel);
  else {
    if (file.endsWith('.html')) for (const m of src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) parseCss(m[1], rel);
    for (const m of src.matchAll(/\sstyle="([^"]*)"/g)) {
      const line = src.slice(0, m.index).split('\n').length;
      parseCss(`[style] { ${m[1]} }`, `${rel}:${line}`);
    }
    for (const m of src.matchAll(/\s(fill|stroke|stop-color)="([^"]*)"/g)) {
      if (COLOUR.test(stripVars(m[2]))) fail(`${rel}:${src.slice(0, m.index).split('\n').length}`, '', `${m[1]}="${m[2]}" (R9: colours are token roles)`);
    }
  }
}

const known = ([fg, bg]) => measured.some(([, f, stack]) => f === fg && stack.includes(bg));
for (const [key, where] of usedPairs) {
  const [fg, bg] = key.split(' on ');
  const ok = known([fg, bg]);
  if (!ok) fail(where, '', `${key} has no row in contrast.mjs (R10)`);
  if (listPairs) console.log(`PAIR ${key}${ok ? '' : ' (not measured)'}`);
}
console.log(`${failed ? 'FAIL' : 'PASS'} check-css: ${files.length} file(s), ${failed} failure(s)`);
process.exit(failed ? 1 : 0);
