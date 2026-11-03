import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'
import { VIEW } from './fixtures/record-read/view.ts'

const fixtures = fileURLToPath(new URL('./fixtures/record-read/', import.meta.url))
const driver = join(fixtures, 'driver.ts')
const repoTsconfig = fileURLToPath(new URL('../../../../tsconfig.json', import.meta.url))

async function sessionLog(dir: string): Promise<string> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true })
  const log = entries.find(entry => entry.isFile() && entry.name.endsWith('.jsonl'))
  if (log === undefined) throw new Error('no session log')
  return readFile(join(log.parentPath, log.name), 'utf8')
}

describe('record_read through the Loader', () => {
  it('reads the matter from chat and logs the view with its record position in the Session', async () => {
    let outcome: Record<string, unknown> = {}
    let log = ''
    await runLoaderSmoke({
      label: 'record read headless smoke',
      tempDirPrefix: 'record-read-e2e-',
      binScript: driver,
      libBinScript: driver,
      configPath: join(fixtures, 'record-read.patch.yml'),
      tsconfigPath: repoTsconfig,
      inspect: async (cwd) => {
        outcome = JSON.parse(await readFile(join(cwd, 'outcome.json'), 'utf8')) as Record<string, unknown>
        log = await sessionLog(join(cwd, '.sessions'))
      },
    })

    expect(outcome['answer']).toBe('Record position 7; due 2026-03-02.')
    const lines = log.split('\n')
    expect(lines.find(line => line.includes('"type":"tool/call"'))).toContain('"name":"record_read"')
    const toolResult = lines.find(line => line.includes('"type":"tool/result"'))
    expect(toolResult).toContain('\\"recordSeq\\":7')
    expect(toolResult).toContain(`\\"viewHash\\":\\"${VIEW.viewHash}\\"`)
    expect(toolResult).toContain('ep.r71-3.grant-communication')
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
