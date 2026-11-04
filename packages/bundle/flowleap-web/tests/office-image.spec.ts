/** The firm image's office overlay over the composed FlowLeap Web profile: the office rows are on and the sandbox denies the network. */

import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { load } from 'js-yaml'
import { afterAll, describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../../..', import.meta.url))
const home = mkdtempSync(join(tmpdir(), 'flowleap-office-image-'))
afterAll(() => { rmSync(home, { recursive: true, force: true }) })

/**
 * The composed rows of `--dump-config` for flowleap-web plus the image overlay and any later overlays.
 * @param patches - overlay files applied after `deploy/office.patch.yml`.
 */
function composed(...patches: string[]): string {
  const overlays = ['deploy/office.patch.yml', ...patches].flatMap(patch => ['--patch', patch])
  const result = spawnSync(process.execPath, ['--import', 'tsx/esm', 'apps/cli/src/bin.ts', ...overlays, '--profile', 'flowleap-web', '--dump-config'], {
    cwd: root, encoding: 'utf8', timeout: 60_000, env: { ...process.env, DSH_HOME: home },
  })
  expect(result.status, result.stderr).toBe(0)
  return result.stdout
}

/**
 * One row of the dump, parsed alone because other rows carry `!!js` tags.
 * @param dump - the `--dump-config` output.
 * @param id - the row id.
 */
function row(dump: string, id: string): { disabled?: boolean; config?: Record<string, unknown> } {
  const lines = dump.split('\n')
  const start = lines.findIndex(line => line === `- id: ${id}`)
  expect(start, `row ${id}`).toBeGreaterThanOrEqual(0)
  const end = lines.findIndex((line, index) => index > start && (line.startsWith('- id: ') || line.startsWith('# ==')))
  const [entry] = load(lines.slice(start, end === -1 ? undefined : end).join('\n').replace(/!!js .*$/gmu, 'null')) as [{ disabled?: boolean; config?: Record<string, unknown> }]
  return entry
}

describe('deploy/office.patch.yml over flowleap-web', () => {
  it('switches on both office rows and keeps the sandbox network denied', () => {
    const dump = composed()
    expect(row(dump, 'sandbox').config?.['network']).toBe('deny')
    expect(row(dump, 'flowleap-office-officecli').disabled).toBe(false)
    expect(row(dump, 'flowleap-office').disabled).toBe(false)
  }, 60_000)

  it('reads the composed value, so a later overlay that keeps the network shows as such', () => {
    const inherit = join(home, 'inherit.patch.yml')
    writeFileSync(inherit, '- id: sandbox\n  config:\n    network: inherit\n')
    expect(row(composed(inherit), 'sandbox').config?.['network']).toBe('inherit')
  }, 60_000)
})
