/**
 * The resolved `flowleap-web` patent preset mounts no `@deepseek-ai/dsh-tool-web` row, the only plugin that declares
 * `web_search` and `web_fetch`. The FlowLeap agent presets copy the patent preset's plugins, so they inherit this. A row
 * counts as mounted unless its `disabled` is the literal `true`, so a `!!js` condition fails this test.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { composeEntries, loadProfile } from '@deepseek-ai/dsh-app-boot'

const installAnchor = fileURLToPath(new URL('../package.json', import.meta.url))

interface PluginRow { id?: string; name?: string; disabled?: unknown; config?: unknown }

const mountedNames = (rows: readonly PluginRow[]): string[] => rows
  .filter(row => row.disabled !== true)
  .flatMap(row => [row.name ?? '', ...Array.isArray(row.config) ? mountedNames(row.config as PluginRow[]) : []])

it('flowleap-web: the patent preset declares neither web_search nor web_fetch', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-flowleap-web-tools-'))
  try {
    const profile = loadProfile('dsh', 'flowleap-web', installAnchor, home)
    const rows = composeEntries([...profile.layers.map(layer => layer.patches), profile.patches], () => {})
    const preset = rows.find(row => row.id === 'preset-patent')
    const plugins = (preset?.config as { plugins?: PluginRow[] } | undefined)?.plugins
    expect(plugins?.length, 'the patent preset has plugins').toBeGreaterThan(0)
    expect(mountedNames(plugins ?? [])).not.toContain('@deepseek-ai/dsh-tool-web')
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})
