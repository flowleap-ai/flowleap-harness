/** The resolved `flowleap-web` profile fixes the model routes and keys; the `web` profile does not. */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { composeEntries, loadProfile } from '@deepseek-ai/dsh-app-boot'

const installAnchor = fileURLToPath(new URL('../package.json', import.meta.url))

it.each(['flowleap-web', 'web'])('%s: only flowleap-web fixes the model routes, the model keys, the Models page, and the plugin manager', (name) => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-flowleap-models-'))
  try {
    const profile = loadProfile('dsh', name, installAnchor, home)
    const rows = composeEntries([...profile.layers.map(layer => layer.patches), profile.patches], () => {})
    const config = (id: string): Record<string, unknown> | undefined =>
      rows.find(row => row.id === id)?.config as Record<string, unknown> | undefined
    const firm = name === 'flowleap-web'
    expect(config('llm-pi-ai')?.fixedRoutes).toBe(firm ? true : undefined)
    expect(config('credentials')?.lockedRefs)
      .toEqual(firm ? ['ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY', 'MISTRAL_API_KEY'] : undefined)
    expect(config('ui-settings-models')?.managed).toBe(firm ? true : undefined)
    expect(config('plugin-manager')?.installBundles).toBe(firm ? false : undefined)
    expect(profile.layers.some(layer => (layer.lockedRows ?? []).includes('llm-pi-ai'))).toBe(firm)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})
