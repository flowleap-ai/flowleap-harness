/** The resolved `flowleap-web` profile shows the firm gateway's budget warning on its gateway routes only. */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { composeEntries, loadProfile } from '@deepseek-ai/dsh-app-boot'

const installAnchor = fileURLToPath(new URL('../package.json', import.meta.url))

it('flowleap-web routes anthropic and openrouter report x-flowleap-budget-warning', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-flowleap-budget-'))
  try {
    const profile = loadProfile('dsh', 'flowleap-web', installAnchor, home)
    const rows = composeEntries([...profile.layers.map(layer => layer.patches), profile.patches], () => {})
    const providers = (rows.find(row => row.id === 'llm-pi-ai')?.config as {
      providers: Record<string, { noticeHeaders?: string[] }>
    }).providers
    expect(Object.fromEntries(Object.entries(providers).map(([route, profile]) => [route, profile.noticeHeaders]))).toEqual({
      anthropic: ['x-flowleap-budget-warning'],
      openrouter: ['x-flowleap-budget-warning'],
      mistral: undefined,
    })
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})
