// Deny-list for product copy (rule R19, product rule 4): words that belong in Audit, never in the main view.
// Usage: node check-copy.mjs <file or dir>... Reads locale .json files (every string value) and the text of
// .html files (tags, <script> and <style> removed). Exits 1 on a match, 2 on a usage error.
// check-mockups.mjs applies `denied` to the rendered text of every mockup state as well.
// Exempt in HTML: elements with data-verbatim (a picture of the source letter) and data-audit (the Audit view).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Each entry: [rule name, pattern]. Lower-case actor names only: "Intake" as a view name is the clerk's word. */
export const DENY = [
  ['form code', /\b(?:EPO|EPA|DPMA|WIPO|PCT)[ /-]?(?:Form|Formblatt)\s*\d+\w*/gi],
  ['hash', /\b(?=[0-9a-f]*[a-f])(?=[0-9a-f]*\d)[0-9a-f]{7,}\b/g],
  ['snake_case id', /\b[a-z]+_[a-z0-9_]+\b/g],
  ['record position', /\bseq\b/gi],
  ['internal actor', /\b(?:router|engine|reader|intake|runtime)\b/g],
  ['account handle', /\b[a-z]+\.[a-z]+\b(?<!\.(?:pdf|docx?|xlsx?|eml|msg|txt))/g],
];

/** Returns each deny-list match in a text as { rule, match }. E-mail addresses are not handles. */
export function denied(text) {
  const clean = text.replace(/\S+@\S+\.\w+/g, ' ');
  const hits = [];
  for (const [rule, re] of DENY) for (const m of clean.matchAll(re)) hits.push({ rule, match: m[0] });
  return hits;
}

/** Returns the visible text of an HTML source without exempt elements, scripts and styles. */
export function htmlText(src) {
  let s = src.replace(/<(script|style)\b[\s\S]*?<\/\1>/g, ' ');
  for (;;) {
    const m = s.match(/<(\w+)\b[^>]*\sdata-(?:verbatim|audit)\b[^>]*>/);
    if (!m) break;
    let depth = 0, i = m.index;
    const open = new RegExp(`<${m[1]}\\b|</${m[1]}>`, 'g');
    open.lastIndex = i;
    let end = s.length;
    for (let t; (t = open.exec(s));) {
      depth += t[0].startsWith('</') ? -1 : 1;
      if (depth === 0) { end = t.index + t[0].length; break; }
    }
    s = s.slice(0, i) + ' ' + s.slice(end);
  }
  return s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}

const strings = value => typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : [];

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const inputs = process.argv.slice(2);
  if (!inputs.length) {
    console.error('Usage: node check-copy.mjs <file or dir>...');
    process.exit(2);
  }
  const files = [];
  const walk = p => {
    if (statSync(p).isDirectory()) for (const f of readdirSync(p)) walk(path.join(p, f));
    else if (/\.(json|html)$/.test(p)) files.push(p);
  };
  inputs.forEach(walk);
  let failed = 0;
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    const texts = file.endsWith('.json') ? strings(JSON.parse(src)) : [htmlText(src)];
    for (const text of texts) for (const hit of denied(text)) {
      failed++;
      console.log(`FAIL ${path.relative(process.cwd(), file)}: ${hit.rule} "${hit.match}"`);
    }
  }
  console.log(`${failed ? 'FAIL' : 'PASS'} check-copy: ${files.length} file(s), ${failed} match(es)`);
  process.exit(failed ? 1 : 0);
}
