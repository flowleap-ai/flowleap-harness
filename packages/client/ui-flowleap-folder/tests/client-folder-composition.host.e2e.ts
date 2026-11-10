import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

const fixtures = fileURLToPath(new URL('./fixtures/client-folder/', import.meta.url))
const driver = join(fixtures, 'driver.host.ts')
const repoTsconfig = fileURLToPath(new URL('../../../../tsconfig.json', import.meta.url))

describe('the client folder of Add client through the Loader', () => {
  it('makes the client folder with only 00 Client and the About file and its workspace once, with the configured batch size', async () => {
    let outcome: Record<string, unknown> = {}
    let folder: string[] = []
    let about = ''
    await runLoaderSmoke({
      label: 'client folder headless smoke',
      tempDirPrefix: 'client-folder-e2e-',
      binScript: driver,
      libBinScript: driver,
      configPath: join(fixtures, 'client-folder.patch.yml'),
      tsconfigPath: repoTsconfig,
      inspect: async (cwd) => {
        outcome = JSON.parse(await readFile(join(cwd, 'outcome.json'), 'utf8')) as Record<string, unknown>
        folder = (await readdir(join(cwd, 'Clients', 'Novo Nordisk A-S'))).sort()
        about = await readFile(join(cwd, 'Clients', 'Novo Nordisk A-S', 'About this folder.md'), 'utf8')
      },
    })

    expect(outcome['settings']).toEqual({ status: 200, body: { recordBatchSize: 7 } })
    expect(outcome['first']).toMatchObject({ status: 200, body: { folder: 'Novo Nordisk A-S', made: true } })
    expect(outcome['second']).toMatchObject({ status: 200, body: { folder: 'Novo Nordisk A-S', made: false } })
    const workspace = (outcome['first'] as { body: { workspace: string } }).body.workspace
    expect((outcome['second'] as { body: { workspace: string } }).body.workspace).toBe(workspace)
    expect(outcome['workspaces']).toEqual(expect.arrayContaining([{ id: workspace, title: 'Novo Nordisk A/S' }]))
    expect(folder).toEqual(['00 Client', 'About this folder.md'])
    expect(about).toContain('Applicant names of the client group: NOVO NORDISK AS.')
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
