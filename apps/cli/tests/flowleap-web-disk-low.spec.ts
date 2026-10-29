/** The resolved `flowleap-web` profile reads the firm host's disk low flag at one path for both upload kinds. */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { composeEntries, loadProfile } from '@deepseek-ai/dsh-app-boot'

const installAnchor = fileURLToPath(new URL('../package.json', import.meta.url))

it.each(['flowleap-web', 'web'])('%s sets the disk low flag of chat attachments and agent-builder uploads', (name) => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-flowleap-disk-low-'))
  try {
    const profile = loadProfile('dsh', name, installAnchor, home)
    const rows = composeEntries([...profile.layers.map(layer => layer.patches), profile.patches], () => {})
    const flagOf = (id: string): unknown =>
      (rows.find(row => row.id === id)?.config as { storageLowFlagPath?: string } | undefined)?.storageLowFlagPath
    expect(flagOf('attachment-local')).toBe(name === 'flowleap-web' ? '/run/flowleap/host/disk-low' : undefined)
    if (name === 'flowleap-web') expect(flagOf('flowleap-agent-builder')).toBe('/run/flowleap/host/disk-low')
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})
