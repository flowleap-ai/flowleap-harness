import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

const fixtures = fileURLToPath(new URL('./fixtures/register-watch/', import.meta.url))
const driver = join(fixtures, 'driver.ts')
const repoTsconfig = fileURLToPath(new URL('../../../../tsconfig.json', import.meta.url))

async function sessionLog(dir: string): Promise<string> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true })
  const log = entries.find(entry => entry.isFile() && entry.name.endsWith('.jsonl'))
  if (log === undefined) throw new Error('no session log')
  return readFile(join(log.parentPath, log.name), 'utf8')
}

describe('register watch through the Loader', () => {
  it('creates watches from chat, skips a day without a new event, and runs once with the new event', async () => {
    let outcome: Record<string, unknown> = {}
    let log = ''
    await runLoaderSmoke({
      label: 'register watch headless smoke',
      tempDirPrefix: 'register-watch-e2e-',
      binScript: driver,
      libBinScript: driver,
      configPath: join(fixtures, 'register-watch.patch.yml'),
      tsconfigPath: repoTsconfig,
      inspect: async (cwd) => {
        outcome = JSON.parse(await readFile(join(cwd, 'outcome.json'), 'utf8')) as Record<string, unknown>
        log = await sessionLog(join(cwd, '.sessions'))
      },
    })

    const prompt = 'When a new office action arrives, prepare the analysis.\n\nWatched applications: EP3456789'
    expect(outcome['created']).toEqual([prompt, prompt])
    expect(outcome['quiet']).toMatchObject({ status: 'ended', prompt })
    expect(outcome['quiet']).not.toHaveProperty('lastDelivery')
    expect(outcome['active']).toMatchObject({ status: 'ended', prompt })
    expect(outcome['active']).toHaveProperty('lastDelivery')
    expect(outcome['answers']).toBe(Number(outcome['answersAfterCreation']) + 1)
    expect(log).toContain('register_watch_create')
    expect(log).toContain('register_events_json')
    expect(log).toContain('No opposition filed within time limit')
    expect(log).toContain('Run received.')
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
