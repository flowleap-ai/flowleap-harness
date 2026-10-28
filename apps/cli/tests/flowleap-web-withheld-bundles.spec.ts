/** The optional bundles the resolved `flowleap-web` profile withholds from the Plugins page. */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { composeEntries, loadProfile } from '@deepseek-ai/dsh-app-boot'
import { OPTIONAL_BUNDLES } from '@deepseek-ai/dsh-official-bundles'

const installAnchor = fileURLToPath(new URL('../package.json', import.meta.url))
const withheld = ['@deepseek-ai/dsh-experimental-liveshare', '@deepseek-ai/dsh-experimental-forge-bundle']

it.each(['flowleap-web', 'web'])('%s plugin-manager withholds Live Share and Forge only in flowleap-web', (name) => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-flowleap-withheld-'))
  try {
    const profile = loadProfile('dsh', name, installAnchor, home)
    const rows = composeEntries([...profile.layers.map(layer => layer.patches), profile.patches], () => {})
    const manager = rows.find(row => row.id === 'plugin-manager')
    expect(manager?.name).toBe('@deepseek-ai/dsh-plugin-manager')
    expect((manager?.config as { withheldBundles?: string[] } | undefined)?.withheldBundles)
      .toEqual(name === 'flowleap-web' ? withheld : undefined)
    for (const bundle of withheld) expect(OPTIONAL_BUNDLES).toContain(bundle)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})
