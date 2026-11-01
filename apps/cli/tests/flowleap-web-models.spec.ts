/** The firm-server `flowleap-web` profile fixes the model routes and keys; the `flowleap-desktop` and `web` profiles do not. */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { composeEntries, initProfile, loadProfile, resolveProfileDir, type Profile } from '@deepseek-ai/dsh-app-boot'

const installAnchor = fileURLToPath(new URL('../package.json', import.meta.url))
const MODEL_ROWS = ['llm-pi-ai', 'credentials', 'ui-settings-models']
const homes: string[] = []

afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true })
})

function newHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'dsh-flowleap-models-'))
  homes.push(home)
  return home
}

function composed(profile: Profile): (id: string) => Record<string, unknown> | undefined {
  const rows = composeEntries([...profile.layers.map(layer => layer.patches), profile.patches], () => {})
  return (id: string) => rows.find(row => row.id === id)?.config as Record<string, unknown> | undefined
}

const lockedRows = (profile: Profile): string[] => profile.layers.flatMap(layer => layer.lockedRows ?? [])

describe('model locks per profile', () => {
  it.each(['flowleap-web', 'flowleap-desktop', 'web'])('%s: only flowleap-web fixes the model routes, the model keys, and the Models page', (name) => {
    const profile = loadProfile('dsh', name, installAnchor, newHome())
    const config = composed(profile)
    const firm = name === 'flowleap-web'
    expect(config('llm-pi-ai')?.fixedRoutes).toBe(firm ? true : undefined)
    expect(config('credentials')?.lockedRefs)
      .toEqual(firm ? ['ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY', 'MISTRAL_API_KEY'] : undefined)
    expect(config('ui-settings-models')?.managed).toBe(firm ? true : undefined)
    for (const row of MODEL_ROWS) expect(lockedRows(profile).includes(row)).toBe(firm)
  })

  it.each(['flowleap-web', 'flowleap-desktop'])('%s: offers no subscription sign-in, and keeps the plugin manager and DeepSeek rows locked', (name) => {
    const profile = loadProfile('dsh', name, installAnchor, newHome())
    const config = composed(profile)
    expect(config('llm-pi-ai')?.fixedRoutes === true || config('llm-pi-ai')?.subscriptionSignIn === false).toBe(true)
    expect(config('plugin-manager')?.installBundles).toBe(false)
    expect(lockedRows(profile)).toEqual(expect.arrayContaining(['plugin-manager', 'llm-deepseek', 'session-telemetry-otel']))
  })

  it('the firm llm-pi-ai row restates the desktop routes and replaces subscriptionSignIn with fixedRoutes', () => {
    const firm = composed(loadProfile('dsh', 'flowleap-web', installAnchor, newHome()))('llm-pi-ai')
    const { subscriptionSignIn, ...desktop } = composed(loadProfile('dsh', 'flowleap-desktop', installAnchor, newHome()))('llm-pi-ai') ?? {}
    expect(subscriptionSignIn).toBe(false)
    expect(firm).toEqual({ ...desktop, fixedRoutes: true })
  })

  it('a flowleap-web profile written before the firm layer existed gets the firm layer and its locks', () => {
    const home = newHome()
    initProfile(resolveProfileDir('flowleap-web', home), ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-flowleap-web'])
    const profile = loadProfile('dsh', 'flowleap-web', installAnchor, home)
    expect(profile.layers.map(layer => layer.packageName)).toContain('@deepseek-ai/dsh-flowleap-firm')
    expect(composed(profile)('llm-pi-ai')?.fixedRoutes).toBe(true)
    expect(lockedRows(profile)).toEqual(expect.arrayContaining(MODEL_ROWS))
  })
})
