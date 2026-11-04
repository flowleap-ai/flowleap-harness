// WCAG 2.x contrast of every text, icon and control token pair in both themes.
// Usage: node contrast.mjs <tokens.css> [out.md]. Exits 1 when a pair is below its minimum.
// Add a row to `pairs` for every new text, icon or control colour pair.
// The CSS must hold the dark set in `:root {` and the light set in `:root[data-theme='light'] {`.
import { readFileSync, writeFileSync } from 'node:fs';

const [cssPath, outPath] = process.argv.slice(2);
const css = readFileSync(cssPath, 'utf8');

function block(selector) {
  const start = css.indexOf(selector + ' {');
  if (start < 0) throw new Error(`${cssPath}: no block ${selector}`);
  const body = css.slice(start, css.indexOf('\n}', start));
  const vars = {};
  for (const m of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
  return vars;
}
const dark = block(':root');
const light = { ...dark, ...block(":root[data-theme='light']") };

// oklch(L C h / a) -> gamma-encoded sRGB in [0,1], clipped to the gamut, plus alpha.
function parse(value, vars) {
  const ref = value.match(/^var\((--[\w-]+)\)$/);
  if (ref) return parse(vars[ref[1]], vars);
  const m = value.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)$/);
  if (!m) throw new Error(`not an oklch colour: ${value}`);
  const [L, C, h] = [Number(m[1]), Number(m[2]), Number(m[3]) * Math.PI / 180];
  const a = C * Math.cos(h), b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * mm + 1.7076147010 * s,
  ];
  const enc = x => { x = Math.min(1, Math.max(0, x)); return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055; };
  return { rgb: lin.map(enc), alpha: m[4] === undefined ? 1 : Number(m[4]) };
}
// Browsers blend in gamma-encoded sRGB.
const over = (fg, bg) => fg.rgb.map((c, i) => c * fg.alpha + bg[i] * (1 - fg.alpha));
const luminance = rgb => {
  const [r, g, b] = rgb.map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
// A surface is a stack of colours, bottom first: ['--bg-main', '--bg-selected'].
function surface(stack, vars) {
  let rgb = [1, 1, 1];
  for (const token of stack) rgb = over(parse(vars[token] ?? token, vars), rgb);
  return rgb;
}
const ratio = (fg, bgStack, vars) => {
  const bg = surface(bgStack, vars);
  const a = luminance(over(parse(vars[fg] ?? fg, vars), bg)), b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

// [use, foreground, background stack, minimum]. 4.5 = text below 24 px (18.66 px bold);
// 3 = icons, large text and the border that alone identifies a control (WCAG 1.4.11).
const TEXT = ['--text-1', '--text-2', '--text-3'];
const SURFACES = {
  main: ['--bg-main'], raised: ['--bg-raised'], sunken: ['--bg-sunken'], overlay: ['--bg-overlay'],
  'main + hover': ['--bg-main', '--bg-hover'], 'main + selected': ['--bg-main', '--bg-selected'],
  'overlay + selected': ['--bg-overlay', '--bg-selected'],
};
const pairs = [];
for (const fg of TEXT) for (const [name, stack] of Object.entries(SURFACES)) pairs.push([`text on ${name}`, fg, stack, 4.5]);
pairs.push(
  ['sidebar text', '--text-sidebar', ['--bg-sidebar'], 4.5],
  ['sidebar text, active row', '--text-1', ['--bg-sidebar', '--bg-selected'], 4.5],
  ['sidebar label', '--text-3', ['--bg-sidebar'], 4.5],
  ['link and law chip', '--accent-text', ['--bg-main', '--bg-hover'], 4.5],
  ['mention chip', '--accent-text', ['--bg-raised', '--accent-tint'], 4.5],
  ['primary button text', '--on-accent', ['--accent'], 4.5],
  ['primary button text, hover', '--on-accent', ['--accent-hover'], 4.5],
  ['primary button key', '--on-accent-2', ['--accent', '--on-accent-tint'], 4.5],
  ['key in a button', '--text-3', ['--bg-raised', '--bg-hover'], 4.5],
  ['status pill, waits', '--st-wait-text', ['--bg-main', '--st-wait-tint'], 4.5],
  ['status pill, done', '--st-ok-text', ['--bg-main', '--st-ok-tint'], 4.5],
  ['status pill, refused', '--st-bad-text', ['--bg-main', '--st-bad-tint'], 4.5],
  ['days left', '--st-wait-text', ['--bg-main'], 4.5],
  ['overdue', '--st-bad-text', ['--bg-main'], 4.5],
  ['agree, accepted choice', '--st-ok-text', ['--bg-overlay'], 4.5],
  ['evidence quote', '--text-1', ['--bg-raised', '--st-wait-tint'], 4.5],
  ['missing evidence', '--st-wait-text', ['--bg-raised', '--st-wait-tint'], 4.5],
  ['decision note', '--text-3', ['--bg-sunken'], 4.5],
  ['letter text', '--paper-ink', ['--paper'], 4.5],
  ['avatar letter', '--on-avatar', ['--av-1'], 4.5],
  ['avatar letter', '--on-avatar', ['--av-2'], 4.5],
  ['icon', '--text-4', ['--bg-main'], 3],
  ['icon', '--text-4', ['--bg-sidebar'], 3],
  ['status icon, waits', '--st-wait', ['--bg-main'], 3],
  ['status icon, done', '--st-ok', ['--bg-main'], 3],
  ['status icon, working', '--st-run', ['--bg-main'], 3],
  ['status icon, refused', '--st-bad', ['--bg-main'], 3],
  ['status icon, no action', '--st-idle', ['--bg-main'], 3],
  ['status icon on selected row', '--st-wait', ['--bg-main', '--bg-selected'], 3],
  ['checkbox border', '--line-control', ['--bg-main'], 3],
  ['selection bar, focus ring', '--accent', ['--bg-main'], 3],
  ['decision border', '--accent-line', ['--bg-main'], 3],
);

let failed = 0;
const rows = [];
for (const [use, fg, bg, min] of pairs) {
  const cells = [dark, light].map(vars => {
    const r = ratio(fg, bg, vars);
    if (r < min) failed++;
    return `${r.toFixed(2)}${r < min ? ' FAIL' : ''}`;
  });
  rows.push(`| ${use} | \`${fg}\` | ${bg.map(t => `\`${t}\``).join(' + ')} | ${min} | ${cells[0]} | ${cells[1]} |`);
}
const table = [
  '# Token contrast',
  '',
  'Generated by `node scripts/contrast.mjs tokens.css contrast.md`. Do not edit by hand.',
  '',
  `Contrast of ${cssPath.split('/').pop()} (WCAG 2.x, OKLCH converted to sRGB, alpha blended over the surface). ${pairs.length * 2} checks, ${failed} below the minimum.`,
  '',
  '| Use | Foreground | Surface | Min | Dark | Light |',
  '|---|---|---|---|---|---|',
  ...rows,
].join('\n') + '\n';
if (outPath) writeFileSync(outPath, table);
process.stdout.write(table);
process.exit(failed ? 1 : 0);
