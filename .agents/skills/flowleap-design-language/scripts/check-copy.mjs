// Deny-list for product copy (rule R19, product rule 4): words that belong in Audit, never in the main view.
// Usage: node check-copy.mjs <file or dir>... Reads client locale dictionaries (`locales.ts`, `<lang>.ts` under a
// `locales` folder: every string of every `export const <lang> = {...}`), locale .json files (every string value), and
// the text and the title, aria-label, placeholder and alt attributes of .html files (<script> and <style> removed).
// Exits 1 on a match, an empty or white-space text in a dictionary, or a dictionary that lacks a client UI language or
// an English key, 2 on a usage error or when no input file is found. check-mockups.mjs applies `denied` to the rendered
// text of every mockup state as well.
// Exempt in HTML: elements with data-verbatim (a picture of the source letter) and data-audit (the Audit view); an
// e-mail address inside data-address (a mailbox that the firm configured, shown on purpose).
import { readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The client UI languages (packages/client/locale/src/locales); each dictionary has every English key in each. */
export const LANGUAGES = ['en', 'de', 'es', 'fr', 'ja', 'pt', 'ru', 'zh'];

/** Each entry: [rule name, pattern]. "Intake" as a view name is the clerk's word; lower-case "intake" is the actor. */
export const DENY = [
  ['form code', /\b(?:(?:EPO|EPA|DPMA|WIPO|PCT|EUIPO|USPTO)[ /-]?)?(?:Form|Formblatt)\s*\d+\w*/gi],
  ['hash', /\b(?=[0-9a-f]*[a-f])(?=[0-9a-f]*\d)[0-9a-f]{7,}\b/g],
  ['snake_case id', /\b[a-z]+_[a-z0-9_]+\b/g],
  ['record position', /\bseq\b/gi],
  ['internal actor', /\b(?:[Rr]outer|[Ee]ngine|[Rr]eader|[Rr]untime|intake)\b/g],
  ['account handle', /\b[A-Za-z]+\.[A-Za-z]{2,}\b(?<!\.(?:pdf|docx?|xlsx?|eml|msg|txt|html?))/g],
  ['account handle', /\b[A-Z]{2,}\\[A-Za-z][\w.]*/g],
  ['account handle', /\b(?![A-Z]*(?:EPO|EPA|DPMA|WIPO|USPTO|EUIPO|EUR|PDF|FL)[A-Z]*\b)[A-Z]{6,}\b/g],
  ['e-mail address', /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g],
];

/** Returns each deny-list match in a text as { rule, match }. */
export function denied(text) {
  const hits = [];
  for (const [rule, re] of DENY) for (const m of text.matchAll(re)) hits.push({ rule, match: m[0] });
  return hits.filter((h, i) => !(h.rule === 'account handle' && hits.some((o, j) => j !== i && o.rule === 'e-mail address' && o.match.includes(h.match))));
}

/** Removes every element that carries one of the attributes, with its content. */
function dropElements(s, attr) {
  for (;;) {
    const m = s.match(new RegExp(`<(\\w+)\\b[^>]*\\s${attr}\\b[^>]*>`));
    if (!m) return s;
    let depth = 0, end = s.length;
    const open = new RegExp(`<${m[1]}\\b|</${m[1]}>`, 'g');
    open.lastIndex = m.index;
    for (let t; (t = open.exec(s));) {
      depth += t[0].startsWith('</') ? -1 : 1;
      if (depth === 0) { end = t.index + t[0].length; break; }
    }
    s = s.slice(0, m.index) + ' ' + s.slice(end);
  }
}

/** Returns the visible text and the copy attributes of an HTML source, without exempt elements, scripts and styles. */
export function htmlText(src) {
  let s = src.replace(/<(script|style)\b[\s\S]*?<\/\1>/g, ' ');
  s = dropElements(dropElements(dropElements(s, 'data-verbatim'), 'data-audit'), 'data-address');
  const attrs = [...s.matchAll(/\s(?:title|aria-label|placeholder|alt)=(["'])([^"']*)\1/g)].map(m => m[2]);
  return [s.replace(/<[^>]+>/g, ' '), ...attrs].join(' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}

/** Returns the end index of the object literal that opens at src[start] ('{'), skipping strings and comments. */
function objectEnd(src, start) {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (ch === "'" || ch === '"' || ch === '`') { for (i++; i < src.length && src[i] !== ch; i++) if (src[i] === '\\') i++; continue; }
    if (ch === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i < 0) return src.length; continue; }
    if (ch === '{') depth++;
    if (ch === '}' && --depth === 0) return i;
  }
  return src.length;
}

/** Reads `export const <lang> = { 'key': 'value', ... }` blocks of a TypeScript dictionary; returns lang -> key -> text. */
export function tsDictionaries(src) {
  const out = {};
  for (const m of src.matchAll(/export const (\w+)\s*=\s*\{/g)) {
    const open = m.index + m[0].length - 1;
    const body = src.slice(open + 1, objectEnd(src, open));
    const entries = {};
    for (const e of body.matchAll(/(?:^|[,{\n])\s*(?:'([^']+)'|"([^"]+)"|([\w$]+))\s*:\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`([^`]*)`)/g)) {
      entries[e[1] ?? e[2] ?? e[3]] = e[4] ?? e[5] ?? e[6];
    }
    if (Object.keys(entries).length) out[m[1]] = entries;
  }
  return out;
}

const strings = value => typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : [];

// realpath: a symlinked path (macOS /var is /private/var) must still count as running this file.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const inputs = process.argv.slice(2);
  if (!inputs.length) {
    console.error('Usage: node check-copy.mjs <file or dir>...');
    process.exit(2);
  }
  const files = [];
  const walk = p => {
    if (statSync(p).isDirectory()) { for (const f of readdirSync(p)) if (f !== 'node_modules' && f !== 'lib') walk(path.join(p, f)); }
    else if (/\.(json|html)$/.test(p) || /(?:^|\/)locales\.ts$|\/locales\/\w+\.ts$/.test(p)) files.push(p);
  };
  inputs.forEach(walk);
  if (!files.length) {
    console.error(`check-copy: no locale dictionary (locales.ts, locales/<lang>.ts, .json) or .html file in ${inputs.join(', ')}`);
    process.exit(2);
  }
  let failed = 0;
  const fail = msg => { failed++; console.log(`FAIL ${msg}`); };
  for (const file of files) {
    const rel = path.relative(process.cwd(), file);
    const src = readFileSync(file, 'utf8');
    let texts;
    if (file.endsWith('.ts')) {
      const dicts = tsDictionaries(src);
      texts = Object.entries(dicts).flatMap(([lang, d]) => Object.entries(d).map(([k, v]) => [`${lang}.${k}`, v]));
      for (const [where, text] of texts) if (!text.trim()) fail(`${rel} ${where}: the text is empty or only white space`);
      if (file.endsWith('locales.ts')) {
        const en = dicts.en;
        for (const lang of LANGUAGES) {
          if (!dicts[lang]) { fail(`${rel}: no ${lang} dictionary; the client ships ${LANGUAGES.join(', ')}`); continue; }
          for (const key of Object.keys(en ?? {})) if (!(key in dicts[lang])) fail(`${rel}: ${lang} has no "${key}"`);
        }
      }
    } else texts = file.endsWith('.json') ? strings(JSON.parse(src)).map(v => ['', v]) : [['', htmlText(src)]];
    for (const [where, text] of texts) for (const hit of denied(text)) fail(`${rel}${where ? ` ${where}` : ''}: ${hit.rule} "${hit.match}"`);
  }
  console.log(`${failed ? 'FAIL' : 'PASS'} check-copy: ${files.length} file(s), ${failed} failure(s)`);
  process.exit(failed ? 1 : 0);
}
