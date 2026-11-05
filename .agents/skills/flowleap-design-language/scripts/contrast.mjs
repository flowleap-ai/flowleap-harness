// WCAG 2.x contrast of every text, icon and control pair of the harness client theme, in both themes.
// Usage: node contrast.mjs [out.md] [--theme <ui-theme styles dir>]. Exits 1 when a pair is below its minimum or a token
// has no value in a theme, 2 when the theme is missing. A row with the platform 'darwin' uses the macOS overrides. Add a row to `pairs` for every new text, icon or control colour pair; check-css.mjs
// imports `pairs` and fails on a foreground and background pair in one CSS rule that has no row here.
import { realpathSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadTheme, themeDir } from './client-theme.mjs';

const NAMED = { transparent: [0, 0, 0, 0], white: [255, 255, 255, 1], black: [0, 0, 0, 1] };

/** Parses a client colour value (rgb, rgba, var, color-mix in srgb, a named colour) to gamma-encoded sRGB and alpha. */
function parse(value, vars) {
  value = value.trim();
  const ref = value.match(/^var\((--[\w-]+)\)$/);
  if (ref) {
    if (!(ref[1] in vars)) throw new Error(`unknown token ${ref[1]}`);
    return parse(vars[ref[1]], vars);
  }
  if (NAMED[value]) { const [r, g, b, a] = NAMED[value]; return { rgb: [r / 255, g / 255, b / 255], alpha: a }; }
  const rgb = value.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+)(%?))?\s*\)$/);
  if (rgb) {
    const alpha = rgb[4] === undefined ? 1 : Number(rgb[4]) / (rgb[5] ? 100 : 1);
    return { rgb: [rgb[1], rgb[2], rgb[3]].map(c => Number(c) / 255), alpha };
  }
  const mix = value.match(/^color-mix\(in srgb,\s*(.+?)(?:\s+([\d.]+)%)?,\s*(.+?)(?:\s+([\d.]+)%)?\)$/);
  if (mix) {
    const a = parse(mix[1], vars), b = parse(mix[3], vars);
    const p = mix[2] !== undefined ? Number(mix[2]) / 100 : mix[4] !== undefined ? 1 - Number(mix[4]) / 100 : 0.5;
    const alpha = a.alpha * p + b.alpha * (1 - p);
    const rgbOut = a.rgb.map((c, i) => alpha ? (c * a.alpha * p + b.rgb[i] * b.alpha * (1 - p)) / alpha : 0);
    return { rgb: rgbOut, alpha };
  }
  throw new Error(`not a colour: ${value}`);
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
  for (const token of stack) rgb = over(parse(`var(${token})`, vars), rgb);
  return rgb;
}
const ratio = (fg, bgStack, vars) => {
  const bg = surface(bgStack, vars);
  const a = luminance(over(parse(`var(${fg})`, vars), bg)), b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

// [use, foreground, background stack bottom first, minimum]. 4.5 = text below 24 px (18.66 px bold);
// 3 = icons, large text and the border that alone identifies a control (WCAG 1.4.11).
const T = t => `--dsw-alias-${t}`;
// The light theme's --dsw-alias-label-tertiary is 3.71:1 on white, so it is an icon colour here, never text.
const TEXT = [T('label-primary'), T('label-secondary')];
const MENU = [T('bg-base'), T('bg-mask-2'), '--dsw-specific-menu'];
const SURFACES = {
  base: [T('bg-base')], sidebar: ['--dsw-specific-sidebar-fill'], 'layer 1': [T('bg-layer-1')], 'layer 2': [T('bg-layer-2')], 'layer 3': [T('bg-layer-3')],
  'base + hover': [T('bg-base'), T('interactive-bg-hover')], 'base + selected': [T('bg-base'), T('interactive-bg-active')],
  'sidebar + selected': ['--dsw-specific-sidebar-fill', T('interactive-bg-active')],
  'base + group header': [T('bg-base'), T('bg-multi-select')], 'menu material': MENU, 'menu material + highlighted': [...MENU, T('interactive-bg-hover')],
  'menu material + selected': [...MENU, T('interactive-bg-active')],
};
/** [use, foreground, background stack bottom first, minimum, platform]; minimum 0 records a pair without a minimum. */
export const pairs = [];
// Secondary text on the selected menu item is 4.42:1 in light, so a selected ⌘K item draws its text and keys in label-primary.
const PRIMARY_ONLY = new Set(['menu material + selected']);
for (const fg of TEXT) for (const [name, stack] of Object.entries(SURFACES)) if (fg === TEXT[0] || !PRIMARY_ONLY.has(name)) pairs.push([`text on ${name}`, fg, stack, 4.5]);
// On macOS an overlay without the MenuSurface backing draws the theme's 94 % opaque --dsw-specific-menu.
for (const fg of TEXT) for (const name of ['menu material', 'menu material + highlighted', 'menu material + selected']) if (fg === TEXT[0] || !PRIMARY_ONLY.has(name)) pairs.push([`text on ${name}, macOS`, fg, SURFACES[name], 4.5, 'darwin']);
pairs.push(
  ['primary button text', T('label-primary-foreground'), [T('button-primary-fill')], 4.5],
  ['primary button text, hover', T('label-primary-foreground'), [T('button-primary-hover')], 4.5],
  ['checked checkbox mark', T('label-primary-foreground'), [T('brand-primary')], 3],
  ['send button icon', T('label-primary-foreground'), [T('state-business-primary')], 3],
  ['mention chip', T('label-primary'), [T('bg-base'), T('state-business-tertiary')], 4.5],
  ['status pill or quote, waits', T('label-primary'), [T('bg-base'), T('state-warn-tertiary')], 4.5],
  ['status pill, done', T('label-primary'), [T('bg-base'), T('state-success-tertiary')], 4.5],
  ['status pill, working', T('label-primary'), [T('bg-base'), T('state-business-tertiary')], 4.5],
  ['status pill, refused or stale', T('label-primary'), [T('bg-base'), T('interactive-bg-hover-danger')], 4.5],
  ['status pill, no action', T('label-primary'), [T('bg-base'), T('bg-module-platform')], 4.5],
  ['quote in the decision bar', T('label-primary'), [T('bg-layer-2'), T('state-warn-tertiary')], 4.5],
  ['avatar initial', T('label-primary'), [T('bg-overlay')], 4.5],
  ['letter text', T('label-document-preview'), [T('bg-document-preview')], 4.5],
  ['letter text, marked span', T('label-document-preview'), [T('bg-document-preview'), T('state-warn-tertiary')], 4.5],
  // An overdue date (R11) is the primary-colour text after the warning glyph (a UI icon, none of the six status shapes) in the
  // refused colour, in a row, a fact chip, the properties panel and the decision bar. The refused colour
  // as text is 4.50:1 on white (4.498), 4.49:1 in dark on a hovered row and 3.68:1 on a selected row, so these rows record it
  // with no minimum and no text uses it.
  ['overdue text in the refused colour (not used: below 4.5)', T('state-error-primary'), [T('bg-base')], 0],
  ['overdue text in the refused colour on a hovered row (not used)', T('state-error-primary'), [T('bg-base'), T('interactive-bg-hover')], 0],
  ['overdue text in the refused colour on a selected row (not used)', T('state-error-primary'), [T('bg-base'), T('interactive-bg-active')], 0],
  ['overdue text in the refused colour in the decision bar (not used)', T('state-error-primary'), [T('bg-layer-2')], 0],
  ['overdue warning glyph', T('state-error-primary'), [T('bg-base')], 3],
  ['overdue warning glyph on a hovered row', T('state-error-primary'), [T('bg-base'), T('interactive-bg-hover')], 3],
  ['overdue warning glyph on a selected row', T('state-error-primary'), [T('bg-base'), T('interactive-bg-active')], 3],
  ['overdue warning glyph in the decision bar', T('state-error-primary'), [T('bg-layer-2')], 3],
  ['icon', T('label-tertiary'), [T('bg-base')], 3],
  ['icon on a selected row', T('label-tertiary'), [T('bg-base'), T('interactive-bg-active')], 3],
  ['icon in the sidebar', T('label-tertiary'), ['--dsw-specific-sidebar-fill'], 3],
  ['status icon, no action (drawn in the icon grey)', T('label-tertiary'), [T('bg-base')], 3],
  ['status icon, no action, on a group header', T('label-tertiary'), [T('bg-base'), T('bg-multi-select')], 3],
  ['checkbox border', T('label-tertiary'), [T('bg-base')], 3],
  ['selection bar, focus ring', T('state-business-primary'), [T('bg-base')], 3],
  // The act icon of a row context menu item, drawn by the client Menu in its icon colour.
  ['context menu icon', T('menu-icon'), MENU, 3],
  ['context menu icon, highlighted', T('menu-icon'), [...MENU, T('interactive-bg-hover')], 3],
  // A status icon always sits beside its word (R11), so the word carries the state and these icons have no minimum;
  // the rows record the client's state colours for client-gaps.md item 2. No action is drawn in the icon grey above.
  ['status icon beside its word, waits', T('state-warn-primary'), [T('bg-base')], 0],
  ['status icon beside its word, done', T('state-success-primary'), [T('bg-base')], 0],
  ['status icon beside its word, working', T('state-business-primary'), [T('bg-base')], 0],
  ['status icon beside its word, refused or stale', T('state-error-primary'), [T('bg-base')], 0],
  ['client state-idle colour (not used for the status icon)', T('state-idle-primary'), [T('bg-base')], 0],
  // The ⌘K group heading: 12 px secondary text on the menu material, and on its stuck fill while the list scrolls.
  ['⌘K group heading', T('label-secondary'), MENU, 4.5],
  ['⌘K group heading, stuck', T('label-secondary'), [...MENU, T('menu-group-header-fill')], 4.5],
  // The ring of a deadline calculation step is an icon in the icon grey.
  ['deadline calculation step ring', T('label-tertiary'), [T('bg-base')], 3],
  // On the open or a checked row the avatar fill (bg-overlay) equals the selected tint in light, so it takes label-secondary.
  ['avatar on a selected row', T('label-secondary'), [T('bg-base'), T('interactive-bg-active')], 3],
  ['avatar initial on a selected row', T('label-primary-foreground'), [T('bg-base'), T('interactive-bg-active'), T('label-secondary')], 4.5],
);

/** Measures every pair in both themes of the client theme; returns the Markdown table and the failure count. */
export function measure(dir) {
  const theme = loadTheme(dir);
  let failed = 0;
  const rows = [];
  for (const [use, fg, bg, min, platform] of pairs) {
    const sets = platform === 'darwin' ? [theme.darwin.dark, theme.darwin.light] : [theme.dark, theme.light];
    const cells = sets.map((vars, i) => {
      let r;
      try { r = ratio(fg, bg, vars); } catch (e) {
        failed++;
        return `${e.message} in ${i ? 'light' : 'dark'} FAIL`;
      }
      if (r < min) failed++;
      return `${r.toFixed(2)}${r < min ? ' FAIL' : ''}`;
    });
    rows.push(`| ${use} | \`${fg}\` | ${bg.map(t => `\`${t}\``).join(' + ')} | ${min || 'none'} | ${cells[0]} | ${cells[1]} |`);
  }
  const checked = pairs.filter(p => p[3] > 0).length;
  const table = [
    '# Token contrast',
    '',
    'Generated by `node scripts/contrast.mjs contrast.md` from the harness client theme (`packages/client/ui-theme/src/styles`). Do not edit by hand.',
    '',
    `WCAG 2.x contrast, alpha blended over the surface, bottom of the stack first. ${checked * 2} checks against a minimum, ${failed} below it; ${(pairs.length - checked) * 2} rows with no minimum record the client's state colours. A menu row stacks the Menu material over the scrim (\`--dsw-alias-bg-mask-2\`) over the content panel: off macOS the material is \`--dsw-menu-surface-fill\` (what \`MenuSurface\` draws), and a "macOS" row uses the 94 % opaque \`--dsw-specific-menu\` of an overlay without the MenuSurface backing. The material's backdrop blur is not modelled.`,
    '',
    '| Use | Foreground | Surface | Min | Dark | Light |',
    '|---|---|---|---|---|---|',
    ...rows,
  ].join('\n') + '\n';
  return { table, failed };
}

// realpath: a symlinked path (macOS /var is /private/var) must still count as running this file.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = process.argv.slice(2).find((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--theme');
  const { table, failed } = measure(themeDir());
  if (out) writeFileSync(out, table);
  process.stdout.write(table);
  process.exit(failed ? 1 : 0);
}
