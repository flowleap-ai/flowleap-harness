// Fails on any styling value that is not a token of the harness client theme (packages/client/ui-theme) or on the
// spacing scale (rules R1, R2, R3, R5, R7, R8, R9, R10, R15).
// Usage: node check-css.mjs <file or dir>... [--pairs] [--theme <ui-theme styles dir>]. Exits 1 on a failure, 2 on a
// usage error, a missing theme or no input file. Reads .css files; <style> blocks, style attributes and SVG colour
// attributes in .html files; and style strings, el.style assignments, cssText and setProperty() in .js files.
// --pairs prints each foreground and background token pair that one CSS rule sets; a pair without a row in
// contrast.mjs, or a text pair whose row is not a text row, is a failure.
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
if (!files.length) {
  console.error(`check-css: no .css, .html or .js file in ${inputs.join(', ')}`);
  process.exit(2);
}

/** The spacing scale of R5; the client has no spacing tokens. */
const SPACE = new Set(['0', '2px', '4px', '8px', '12px', '16px', '24px', '32px', '48px']);
/** The type roles of R1; every other --dsw-font-* size (markdown, 11 px, 16 px) fails. */
const ROLES = '(?:xxs-12|xs-13|xs-strong-13|s-14|l-20|xl-24)';
const SIZE_TOKEN = new RegExp(`^var\\(--dsw-font-${ROLES}-font-size\\)$`);
const LINE_TOKEN = new RegExp(`^var\\(--dsw-font-${ROLES}-line-height\\)$`);
const WEIGHT_TOKEN = new RegExp(`^var\\(--dsw-font-${ROLES}-font-weight\\)$`);
const FAMILY_TOKEN = /^var\(--(?:dsw-font-family|ds-font-family-code)\)$/;
const NAMED = 'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen canvas canvastext linktext visitedtext activetext buttonface buttontext buttonborder field fieldtext highlight highlighttext graytext mark marktext';
const COLOUR = new RegExp(`#[0-9a-f]{3,8}\\b|\\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color|color-mix|light-dark)\\(|(?<![\\w-])(?:${NAMED.split(' ').join('|')})(?![\\w-])`, 'i');
// --dsw-alias-border-l4 and the label colours may draw a 1 px border that alone identifies a control (WCAG 1.4.11).
const NEUTRAL_LINE = /var\(--dsw-alias-border-l[123](?:-darkmode-thin)?\)/;
const LINE_PROP = /^(?:border|outline)(?!.*radius)(?:-[\w-]+)?$/;
const SPACE_PROPS = /^(?:margin|padding)(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?$|^(?:row-|column-)?gap$/;
/** R15: only these may transition or animate. */
const MOTION_OK = /^(?:transform|translate|scale|rotate|opacity|color|background-color|border-color|outline-color|fill|stroke|text-decoration-color|box-shadow)$/;
const SVG_COLOUR_ATTRS = 'fill|stroke|stop-color|color|flood-color|lighting-color|bgcolor';
const stripVars = v => v.replace(/var\(--[\w-]+\)/g, 'TOKEN');

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
const lastCompound = selector => selector.split(',').map(s => s.trim().split(/\s*[\s>+~]\s*/).pop());
const targetsSvg = selector => lastCompound(selector).every(c => /^(?:svg|path|circle|rect)\b/.test(c) || /(?:^|[.\]])svg\b/.test(c));
const classesOf = compound => new Set([...compound.matchAll(/\.([\w-]+)/g)].map(m => m[1]));

/** Local custom properties (not --dsw-* or --ds-*) defined in the checked files; a component may define its own. */
const local = new Set();

/** Returns the reason a declaration breaks a rule, or null. */
function judge(prop, value, rule) {
  const v = value.replace(/\s*!important$/, '').trim();
  if (prop.startsWith('--')) {
    if (/^--dsw?-/.test(prop)) return `R9: feature CSS never defines a client theme token (${prop}); the theme owns every --dsw-* and --ds-* value`;
    local.add(prop);
  }
  for (const m of v.matchAll(/var\((--[\w-]+)/g)) {
    if (m[1].startsWith('--dsw-static-')) return 'R9: feature CSS uses --dsw-alias-* roles, never the --dsw-static-* palette (docs/web-styling.md)';
    if (theme.darkOnly.includes(m[1])) return `${m[1]} is defined only for the dark theme`;
    if (!theme.names.has(m[1]) && !local.has(m[1])) return `${m[1]} is not a token of the client theme`;
    if (/^--dsw-font-/.test(m[1]) && !/-(?:font-size|line-height|font-weight)$|^--dsw-font-family$/.test(m[1])) return `R1/R2: ${m[1]} is a composite font token; use its -font-size, -line-height and -font-weight parts`;
  }
  if (v === 'inherit' || v === 'unset' || v === 'initial') return null;
  if (prop === 'font-size') return SIZE_TOKEN.test(v) ? null : 'R1: font-size is one of the client roles xxs-12, xs-13, s-14, l-20, xl-24 (--dsw-font-*-font-size)';
  if (prop === 'line-height') return LINE_TOKEN.test(v) || v === '1' ? null : 'R1: line-height is the --dsw-font-*-line-height token of the size, or 1 for an icon or a key';
  if (prop === 'font-family') return FAMILY_TOKEN.test(v) ? null : 'R1: font-family is --dsw-font-family or --ds-font-family-code';
  if (prop === 'letter-spacing') return v === '0' || v === 'normal' ? null : 'R1: the client theme has no tracking tokens';
  if (prop === 'font-weight') {
    if (!WEIGHT_TOKEN.test(v)) return 'R2: font-weight is a client --dsw-font-*-font-weight token';
    return Number(theme.light[v.slice(4, -1)]) > 500 ? `R2: ${v} is above the 500 cap` : null;
  }
  if (prop === 'font') {
    for (const p of splitTop(v, /[\s/]/)) {
      if (!(SIZE_TOKEN.test(p) || LINE_TOKEN.test(p) || WEIGHT_TOKEN.test(p) || FAMILY_TOKEN.test(p) || p === '1')) return `R1/R2: the font shorthand takes only client font tokens; "${p}" is not one`;
      if (WEIGHT_TOKEN.test(p) && Number(theme.light[p.slice(4, -1)]) > 500) return `R2: ${p} is above the 500 cap`;
    }
    return null;
  }
  if (/^border(?:-[\w]+)*-radius$/.test(prop)) {
    return parts(v).every(p => p === '0' || p === '999px' || p === '50%' || /^var\(--dsw-radius-[\w-]+\)$/.test(p)) ? null : 'R7: border-radius is a --dsw-radius-* token, 999px for a capsule or 50% for a circle';
  }
  if (SPACE_PROPS.test(prop)) return parts(v).every(spaceOk) ? null : 'R5: margin, padding and gap are 0, auto or the scale 2, 4, 8, 12, 16, 24, 32, 48 px';
  if (prop === 'opacity') {
    if (rule.keyframes) return ['0', '1'].includes(v) ? null : 'R10: a keyframe opacity is 0 or 1; never hold readable text dimmed';
    return ['0', '1', '0.4'].includes(v) ? null : 'R10: opacity is 0, 1, or 0.4 on an inactive control (the client Button); never dim readable text';
  }
  if (/^(?:-webkit-)?(?:backdrop-)?filter$/.test(prop) && /opacity\(/.test(v)) return 'R10: never dim with filter: opacity()';
  if (/^(?:transition|animation)(?:-duration|-delay)?$/.test(prop)) {
    if (/\d(?:ms|s)\b/.test(stripVars(v))) return 'R15: durations are the client --ds-transition-duration* tokens';
    if (prop === 'transition') {
      for (const t of topLevel(v)) {
        const name = t.split(/\s+/)[0];
        if (!MOTION_OK.test(name)) return `R15: "${name}" may not transition; use transform, opacity or a colour`;
        if (/\b(?:ease-in|linear)\b(?!-)|cubic-bezier|steps\(/.test(t)) return 'R15: easing is var(--ds-ease-in-out), ease, ease-out or ease-in-out; never ease-in or a literal curve';
      }
    }
    return null;
  }
  if (prop === 'transition-property') {
    const bad = topLevel(v).find(n => !MOTION_OK.test(n));
    return bad ? `R15: "${bad}" may not transition; use transform, opacity or a colour` : null;
  }
  if (prop === 'transition-timing-function' || prop === 'animation-timing-function') return 'R15: set the easing inside the transition shorthand';
  if (prop === 'box-shadow' && /var\(--dsw-elevation-/.test(v) && topLevel(v).length > 1) return 'R8: an elevation shadow is the whole box-shadow; its first layer is already the 0.5 px stroke';
  if (prop === 'box-shadow') {
    for (const layer of topLevel(v)) {
      if (!NEUTRAL_LINE.test(layer)) continue;
      const lengths = parts(layer.replace(/\binset\b/, '')).filter(p => /^-?[\d.]+(?:px)?$/.test(p));
      if (lengths[3] !== '0.5px') return 'R8: a neutral ring drawn with box-shadow is 0.5px';
    }
  }
  if (prop === 'color' && v === 'var(--dsw-alias-label-tertiary)' && !targetsSvg(rule.selector)) return 'R3: --dsw-alias-label-tertiary is for icons only (a rule whose selector ends in svg), never text';
  if (!prop.startsWith('--') || local.has(prop)) {
    if (COLOUR.test(stripVars(v))) return 'R9: colours are client token roles; no literal colour, no named colour and no runtime color-mix';
  }
  return null;
}

let failed = 0;
const usedPairs = new Map();
const elevated = [], bordered = [];
const fail = (file, where, msg) => { failed++; console.log(`FAIL ${file}${where}: ${msg}`); };

/** R8: the widths of the neutral solid lines that a rule draws with border-* or outline-* declarations. */
function neutralWidths(decls) {
  const lines = decls.filter(([k]) => LINE_PROP.test(k));
  if (!lines.some(([, v]) => NEUTRAL_LINE.test(v))) return [];
  const styles = lines.flatMap(([k, v]) => /-style$/.test(k) || !/-(?:width|color)$/.test(k) ? parts(stripVars(v)).filter(p => /^(?:solid|dashed|dotted|double|none|hidden)$/.test(p)) : []);
  if (styles.length && styles.every(s => /^(?:dashed|dotted|none|hidden)$/.test(s))) return [];
  return lines.flatMap(([k, v]) => /-(?:style|color)$/.test(k) ? [] : parts(stripVars(v)).filter(p => /^(?:[\d.]+(?:px|em|rem)?|thin|medium|thick)$/.test(p)));
}

function checkRule(file, rule) {
  const decls = rule.decls;
  for (const [prop, value] of decls) {
    const why = judge(prop, value, rule);
    if (why) fail(file, ` ${rule.selector}`, `${prop}: ${value} (${why})`);
  }
  if (rule.keyframes) return;
  const widths = neutralWidths(decls).filter(w => w !== '0');
  const wide = widths.find(w => w !== '0.5px');
  if (wide) fail(file, ` ${rule.selector}`, `a neutral solid line of ${wide} (R8: every neutral border and outline is 0.5px; dashed affordances and state colours stay 1px)`);
  const get = p => decls.filter(([k]) => k === p).map(([, v]) => v).pop();
  const shadow = get('box-shadow');
  const resetsBorder = decls.some(([k, v]) => k === 'border' && /^(?:0|none)$/.test(v.trim()));
  const compounds = lastCompound(rule.selector).map(classesOf);
  if (shadow && /var\(--dsw-elevation-/.test(shadow)) {
    if (widths.length) fail(file, ` ${rule.selector}`, `a neutral border with an elevation shadow (R8: an elevated surface takes a --dsw-elevation-* shadow and border: 0)`);
    else if (!resetsBorder) elevated.push({ file, selector: rule.selector, compounds });
  }
  if (widths.length && !(shadow && /var\(--dsw-elevation-/.test(shadow))) bordered.push({ file, selector: rule.selector, compounds });
  const radius = decls.find(([k, v]) => /^border(?:-[\w]+)*-radius$/.test(k) && /(?:^|\s)(?:999px|50%|100%)(?:\s|$)/.test(v));
  if (radius && !decls.some(([k, v]) => k === 'corner-shape' && v.trim() === 'round')) fail(file, ` ${rule.selector}`, `${radius[0]}: ${radius[1]} without corner-shape: round (R7: docs/web-styling.md pairs every full-round radius with it)`);
  const fg = (get('color') || '').match(/^var\((--[\w-]+)\)$/)?.[1];
  const bg = (get('background') || get('background-color') || '').match(/^var\((--[\w-]+)\)$/)?.[1];
  if (fg && bg) {
    const key = `${fg} on ${bg}`;
    if (!usedPairs.has(key)) usedPairs.set(key, { where: `${file} ${rule.selector}`, icon: targetsSvg(rule.selector) });
  }
}

function parseCss(css, file) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const stack = [];
  let buf = '';
  for (const ch of css) {
    if (ch === '{') {
      const selector = buf.trim();
      if (/^@font-face/.test(selector)) fail(file, '', 'R1: no @font-face; the client theme owns the font (--dsw-font-family)');
      stack.push({ selector, keyframes: /^@keyframes/.test(selector) || stack.some(s => s.keyframes), decls: [] });
      buf = '';
    } else if (ch === '}') {
      const rule = stack.pop();
      if (!rule) continue;
      addDecls(rule, buf);
      buf = '';
      if (!/^@(?:media|supports|layer|container|keyframes)/.test(rule.selector) && !/^@font-face/.test(rule.selector)) checkRule(file, rule);
    } else if (ch === ';' && stack.length) {
      addDecls(stack[stack.length - 1], buf);
      buf = '';
    } else if (ch === ';') {
      const at = buf.trim();
      if (/^@import/.test(at) && !/ui-theme\/src\/styles\/[\w-]+\.css/.test(at)) fail(file, '', `${at} (R1/R9: import only the client theme's own style sheets; no web font or outside style sheet)`);
      buf = '';
    } else buf += ch;
  }
}
function addDecls(rule, text) {
  const m = text.trim().match(/^([\w-]+)\s*:\s*([\s\S]+)$/);
  if (m) rule.decls.push([m[1].startsWith('--') ? m[1] : m[1].toLowerCase(), m[2].trim()]);
}
const kebab = s => s.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
const lineOf = (src, index) => src.slice(0, index).split('\n').length;

// Local custom properties first, so a var() that names one is known wherever it is used.
for (const file of files) for (const m of readFileSync(file, 'utf8').matchAll(/(?:^|[;{\s])(--[\w-]+)\s*:/g)) if (!/^--dsw?-/.test(m[1])) local.add(m[1]);

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const rel = path.relative(process.cwd(), file);
  if (file.endsWith('.css')) { parseCss(src, rel); continue; }
  if (file.endsWith('.html')) for (const m of src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) parseCss(m[1], rel);
  for (const m of src.matchAll(/\sstyle=(["'])([^"']*)\1/g)) parseCss(`[style] { ${m[2]} }`, `${rel}:${lineOf(src, m.index)}`);
  for (const m of src.matchAll(new RegExp(`\\s(${SVG_COLOUR_ATTRS})=(["'])([^"']*)\\2`, 'g'))) {
    if (COLOUR.test(stripVars(m[3]))) fail(`${rel}:${lineOf(src, m.index)}`, '', `${m[1]}="${m[3]}" (R9: colours are token roles)`);
  }
  if (file.endsWith('.js')) {
    for (const m of src.matchAll(/\.style\.([a-zA-Z]+)\s*=\s*(["'`])([^"'`]*)\2/g)) {
      if (m[1] === 'cssText') parseCss(`[style] { ${m[3]} }`, `${rel}:${lineOf(src, m.index)}`);
      else parseCss(`[style] { ${kebab(m[1])}: ${m[3]} }`, `${rel}:${lineOf(src, m.index)}`);
    }
    for (const m of src.matchAll(/\.style\.setProperty\(\s*(["'`])([\w-]+)\1\s*,\s*(["'`])([^"'`]*)\3/g)) parseCss(`[style] { ${m[2]}: ${m[4]} }`, `${rel}:${lineOf(src, m.index)}`);
  }
}

// R8 across rules: an element class that one rule elevates and another rule borders.
for (const e of elevated) {
  for (const b of bordered) {
    const shared = e.compounds.some(ec => b.compounds.some(bc => bc.size && [...bc].every(c => ec.has(c))));
    if (shared) fail(b.file, ` ${b.selector}`, `a neutral border on an element that ${e.selector} elevates (R8: an elevated surface takes no neutral border)`);
  }
}

const rowOf = ([fg, bg]) => measured.filter(([, f, stack]) => f === fg && stack[stack.length - 1] === bg);
for (const [key, { where, icon }] of usedPairs) {
  const [fg, bg] = key.split(' on ');
  const rows = rowOf([fg, bg]);
  const ok = rows.some(r => icon ? r[3] >= 3 : r[3] >= 4.5);
  if (!ok) fail(where, '', `${key} has no ${icon ? 'icon' : 'text'} row in contrast.mjs (R10)`);
  if (listPairs) console.log(`PAIR ${key}${ok ? '' : ' (not measured)'}`);
}
console.log(`${failed ? 'FAIL' : 'PASS'} check-css: ${files.length} file(s), ${failed} failure(s)`);
process.exit(failed ? 1 : 0);
