/**
 * The resolved `flowleap-web` profile offers no agent preset that mounts `@deepseek-ai/dsh-tool-web`, the only plugin
 * that declares `web_search` and `web_fetch`. The FlowLeap agent presets copy the patent preset's plugins, so they inherit
 * this. A row counts as mounted unless its `disabled` is the literal `true`, so a `!!js` condition fails this test. The
 * bundle restates `preset-standard` and `preset-ptc` in full; the second test fails when a restated copy differs from its
 * upstream `dsh-web-app` preset in anything but the `tool-web` row.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { composeEntries, loadProfile } from '@deepseek-ai/dsh-app-boot'

const installAnchor = fileURLToPath(new URL('../package.json', import.meta.url))
const PRESET = '@deepseek-ai/dsh-agent-preset'
const TOOL_WEB = '@deepseek-ai/dsh-tool-web'
const RESTATED = ['preset-standard', 'preset-ptc']

interface PluginRow { id?: string; name?: string; disabled?: unknown; config?: unknown }

const composedRows = (profileName: string) => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-flowleap-web-tools-'))
  try {
    const profile = loadProfile('dsh', profileName, installAnchor, home)
    return composeEntries([...profile.layers.map(layer => layer.patches), profile.patches], () => {})
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
}

const presetPlugins = (row: PluginRow | undefined): PluginRow[] =>
  (row?.config as { plugins?: PluginRow[] } | undefined)?.plugins ?? []

const mountedNames = (rows: readonly PluginRow[]): string[] => rows
  .filter(row => row.disabled !== true)
  .flatMap(row => [row.name ?? '', ...Array.isArray(row.config) ? mountedNames(row.config as PluginRow[]) : []])

const withoutWebOff = (rows: readonly PluginRow[]): PluginRow[] => rows.map((row) => {
  if (row.name !== TOOL_WEB) return Array.isArray(row.config) ? { ...row, config: withoutWebOff(row.config as PluginRow[]) } : row
  const { disabled: _disabled, ...rest } = row
  return rest
})

it('flowleap-web: no offered agent preset declares web_search or web_fetch', () => {
  const presets = composedRows('flowleap-web').filter(row => row.name === PRESET && row.disabled !== true)
  expect(presets.map(row => row.id)).toContain('preset-patent')
  const withWeb = presets.filter(row => mountedNames(presetPlugins(row)).includes(TOOL_WEB)).map(row => row.id)
  expect(withWeb).toEqual([])
})

it('flowleap-web: each restated preset equals its upstream preset except for the tool-web row', () => {
  const firm = composedRows('flowleap-web')
  const upstream = composedRows('web')
  for (const id of RESTATED) {
    const firmRow = firm.find(row => row.id === id)
    const upstreamRow = upstream.find(row => row.id === id)
    expect.soft(presetPlugins(firmRow).find(row => row.name === TOOL_WEB)?.disabled, `${id} turns tool-web off`).toBe(true)
    const { plugins: _firmPlugins, ...firmRest } = firmRow?.config as Record<string, unknown>
    const { plugins: _upstreamPlugins, ...upstreamRest } = upstreamRow?.config as Record<string, unknown>
    expect.soft(firmRest, `${id} config`).toEqual(upstreamRest)
    expect.soft(withoutWebOff(presetPlugins(firmRow)), `${id} plugins`).toEqual(presetPlugins(upstreamRow))
  }
})
