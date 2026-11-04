// Reads the harness client theme (packages/client/ui-theme/src/styles): every custom property it defines, with its
// light value (`body`, `:root`) and its dark value (`body[data-ds-dark-theme]` over light).
// The theme directory: --theme <dir>, else $FLOWLEAP_UI_THEME, else <git root>/packages/client/ui-theme/src/styles.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Resolves the theme directory; exits 2 with the fix when it is missing. */
export function themeDir(argv = process.argv) {
  const i = argv.indexOf('--theme');
  let dir = i > 0 ? argv[i + 1] : process.env.FLOWLEAP_UI_THEME;
  if (!dir) {
    try {
      const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      dir = path.join(root, 'packages/client/ui-theme/src/styles');
    } catch { /* not a git checkout: the message below names the two other ways */ }
  }
  if (!dir || !existsSync(path.join(dir, 'design-platform.css'))) {
    console.error(`No harness client theme${dir ? ` at ${dir}` : ''}. Pass --theme <dir> or set FLOWLEAP_UI_THEME to packages/client/ui-theme/src/styles of a flowleap-harness checkout.`);
    process.exit(2);
  }
  return path.resolve(dir);
}

/** Returns { light, dark, names } for the theme directory; values are the declared text, var() not resolved. */
export function loadTheme(dir) {
  const light = {}, dark = {};
  for (const file of readdirSync(dir).filter(f => f.endsWith('.css')).sort()) {
    const css = readFileSync(path.join(dir, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selectors = m[1].trim().split(',').map(s => s.trim());
      const target = selectors.some(s => s === 'body[data-ds-dark-theme]') ? dark
        : selectors.some(s => s === 'body' || s === ':root') ? light : null;
      if (!target) continue;
      for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) target[d[1]] = d[2].trim().replace(/\s+/g, ' ');
    }
  }
  return { light, dark: { ...light, ...dark }, names: new Set([...Object.keys(light), ...Object.keys(dark)]) };
}
