/**
 * The resolved `flowleap-web` profile mounts no row with a default network destination on a DeepSeek domain, and the
 * DeepSeek telemetry rows are off and locked. A row counts as mounted unless its `disabled` is the literal `true`, so a
 * `!!js` condition fails this test. The scan reads each mounted row's config and its package `src/`, except locale copy.
 */

import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { composeEntries, loadProfile } from '@deepseek-ai/dsh-app-boot'

const installAnchor = fileURLToPath(new URL('../package.json', import.meta.url))
const DEEPSEEK_HOST = /[\w.-]*deepseek(?:svc)?\.(?:com|cn|ai|net|io|org)\b/gi
const TELEMETRY_ROWS = ['session-telemetry-otel', 'desktop-product-telemetry', 'product-analytics']
// The pi-ai provider catalog names every provider's base URL; the deepseek route is not in this profile's providers.
const CATALOG_ROWS = new Set(['llm-pi-ai'])

const sourceHosts = (packageName: string): string[] => {
  const dir = join(dirname(createRequire(installAnchor).resolve(`${packageName}/package.json`)), 'src')
  const files = readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(file => file.isFile() && /\.(?:[cm]?[jt]sx?|json)$/.test(file.name) && !file.name.startsWith('locales'))
  return files.flatMap(file => readFileSync(join(file.parentPath, file.name), 'utf8').match(DEEPSEEK_HOST) ?? [])
}

it('flowleap-web mounts no row with a DeepSeek destination and locks the telemetry rows off', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-flowleap-deepseek-'))
  try {
    const profile = loadProfile('dsh', 'flowleap-web', installAnchor, home)
    const rows = composeEntries([...profile.layers.map(layer => layer.patches), profile.patches], () => {})
    const locked = new Set(profile.layers.flatMap(layer => layer.lockedRows ?? []))
    for (const id of TELEMETRY_ROWS) {
      expect.soft(rows.find(row => row.id === id)?.disabled, `${id} is off`).toBe(true)
      expect.soft(locked.has(id), `${id} is locked`).toBe(true)
    }
    const mounted = rows.filter(row => row.disabled !== true)
    const destinations = mounted.flatMap(row => [
      ...(JSON.stringify(row.config ?? {}).match(DEEPSEEK_HOST) ?? []).map(host => `${row.id} config: ${host}`),
      ...CATALOG_ROWS.has(row.id) ? [] : sourceHosts(row.name.split('/').slice(0, 2).join('/'))
        .map(host => `${row.id} ${row.name} default: ${host}`),
    ])
    expect(destinations).toEqual([])
    const piAi = rows.find(row => row.id === 'llm-pi-ai')?.config as { fixedRoutes?: boolean; providers?: object }
    expect(piAi.fixedRoutes).toBe(true)
    expect(Object.keys(piAi.providers ?? {})).not.toContain('deepseek')
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})
