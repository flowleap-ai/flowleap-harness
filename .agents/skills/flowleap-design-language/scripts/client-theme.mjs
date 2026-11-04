// Reads the harness client theme (packages/client/ui-theme/src/styles): every custom property it defines, with its
// light value (`body`, `:root`), its dark value (`body[data-ds-dark-theme]` over light), and the macOS overrides
// (`html[data-platform='darwin'] body` and its dark form) over each theme.
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

const SCOPES = {
  light: s => s === 'body' || s === ':root',
  dark: s => s === 'body[data-ds-dark-theme]',
  darwinLight: s => s === "html[data-platform='darwin'] body",
  darwinDark: s => s === "html[data-platform='darwin'] body[data-ds-dark-theme]",
};

/**
 * Returns the theme of a directory; values are the declared text, var() not resolved.
 * `names` holds only the tokens that the light theme defines: a token defined only for dark or only for macOS has no
 * value in the other theme, so feature CSS may not use it.
 */
export function loadTheme(dir) {
  const found = { light: {}, dark: {}, darwinLight: {}, darwinDark: {} };
  for (const file of readdirSync(dir).filter(f => f.endsWith('.css')).sort()) {
    const css = readFileSync(path.join(dir, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selectors = m[1].trim().split(',').map(s => s.trim().replace(/"/g, "'"));
      const scope = Object.keys(SCOPES).find(k => selectors.some(SCOPES[k]));
      if (!scope) continue;
      for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) found[scope][d[1]] = d[2].trim().replace(/\s+/g, ' ');
    }
  }
  const light = found.light;
  const dark = { ...light, ...found.dark };
  return {
    light,
    dark,
    darwin: { light: { ...light, ...found.darwinLight }, dark: { ...dark, ...found.darwinDark } },
    names: new Set(Object.keys(light)),
    darkOnly: Object.keys(found.dark).filter(k => !(k in light)),
  };
}
