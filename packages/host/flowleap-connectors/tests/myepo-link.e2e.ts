import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

const fixtures = fileURLToPath(new URL('./fixtures/myepo-link/', import.meta.url))
const driver = join(fixtures, 'driver.ts')
const repoTsconfig = fileURLToPath(new URL('../../../../tsconfig.json', import.meta.url))

describe('the MyEPO link in the headless profile', () => {
  it('stores the link only after a passed test, serves the reads, and never shows the secret', async () => {
    let outcome: Record<string, unknown> = {}
    let stored = ''
    await runLoaderSmoke({
      label: 'MyEPO link headless smoke',
      tempDirPrefix: 'myepo-link-e2e-',
      binScript: driver,
      libBinScript: driver,
      configPath: join(fixtures, 'myepo-link.patch.yml'),
      tsconfigPath: repoTsconfig,
      inspect: async (cwd) => {
        outcome = JSON.parse(await readFile(join(cwd, 'outcome.json'), 'utf8')) as Record<string, unknown>
        stored = await readFile(join(cwd, 'stored.txt'), 'utf8')
      },
    })

    expect(outcome).toMatchObject({
      before: { state: 'not-linked', writable: true },
      refused: { kind: 'refused' },
      linked: { kind: 'passed', mailbox: true },
      after: { state: 'linked', portfolios: 6, mailbox: true },
      applications: 8,
      unhandled: ['I1015', '1081', '1082', '1226CC', '1099', '2057', '2006A', '52301_CONF', 'Search Report'],
      tested: { kind: 'passed' },
    })
    expect(JSON.stringify(outcome)).not.toContain('sandbox-secret')
    expect(stored).toContain('flowleap-connectors/myepo')
    expect(stored).toContain('sandbox-secret')
    expect(stored).not.toContain('wrong')
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
