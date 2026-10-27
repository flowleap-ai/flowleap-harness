import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

const fixtures = fileURLToPath(new URL('./fixtures/read-only-keys/', import.meta.url))
const driver = join(fixtures, 'driver.ts')
const repoTsconfig = fileURLToPath(new URL('../../../../tsconfig.json', import.meta.url))

async function sessionLog(dir: string): Promise<string> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true })
  const log = entries.find(entry => entry.isFile() && entry.name.endsWith('.jsonl'))
  if (log === undefined) throw new Error('no session log')
  return readFile(join(log.parentPath, log.name), 'utf8')
}

describe('firm keys from a read-only credentials document', () => {
  it('serve the connectors and the model keys, refuse browser writes, and keep per-runtime keys in the managed store', async () => {
    let outcome: Record<string, unknown> = {}
    let managed = ''
    let log = ''
    await runLoaderSmoke({
      label: 'read-only keys headless smoke',
      tempDirPrefix: 'read-only-keys-e2e-',
      binScript: driver,
      libBinScript: driver,
      configPath: join(fixtures, 'read-only-keys.patch.yml'),
      tsconfigPath: repoTsconfig,
      inspect: async (cwd) => {
        outcome = JSON.parse(await readFile(join(cwd, 'outcome.json'), 'utf8')) as Record<string, unknown>
        managed = await readFile(join(cwd, 'runtime', 'credentials.yaml'), 'utf8')
        log = await sessionLog(join(cwd, '.sessions'))
      },
    })

    expect(outcome).toMatchObject({
      setFirmConnector: 'flowleap-connectors/rejected',
      setOwnConnector: 'stored',
      setFirmModelKey: expect.stringContaining('"OPENROUTER_API_KEY" is provided read-only'),
      modelKey: { value: 'firm-model-key', source: 'read-only' },
      presence: {
        'epo-ops': { configured: true, writable: false },
        'uspto-odp': { configured: true, writable: true },
        'semantic-scholar': { configured: false, writable: true },
      },
    })
    expect(managed).toContain('flowleap-connectors/uspto-odp')
    expect(managed).not.toContain('browser')
    expect(managed).not.toContain('OPENROUTER_API_KEY')
    expect(log).toContain('EPO OPS: key is set')
    expect(log).toContain('USPTO ODP: key is set')
    expect(log).toContain('Semantic Scholar: key is not set')
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
