import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { HostConnectionService } from '@deepseek-ai/dsh-client-connection'
import type { BrowserAuth } from '@deepseek-ai/dsh-client-connection/src/browser-auth.ts'
import { BuildJobs, isBuildStatus, type BuildJob } from '../src/add-client/jobs.ts'
import type { BuildStatus } from '../src/add-client/wire.ts'

const CLIENT = '0b7c3c3e-0000-4000-8000-000000000001'

/** A promise that a test resolves. */
function gate() {
  let open = () => {}
  const opened = new Promise<void>((resolve) => { open = resolve })
  return { opened, open }
}

let dir: string
let logs: string[]

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'flowleap-build-jobs-'))
  logs = []
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function jobs() {
  return new BuildJobs(dir, () => new Date('2026-11-08T14:02:00Z'), (message) => { logs.push(message) })
}

async function until(read: () => Promise<BuildStatus | undefined>, state: BuildStatus['state']): Promise<BuildStatus> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const status = await read()
    if (status?.state === state) return status
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw new Error(`the build never reached ${state}`)
}

describe('Add client build jobs', () => {
  it('goes on after the request that started it ends, behind the real Host Fetch routes', async () => {
    const ctx = new Context()
    const runner = jobs()
    const first = gate()
    const second = gate()
    const fiber = ctx.plugin((pluginCtx) => {
      const connection = new HostConnectionService(pluginCtx, [], {} as BrowserAuth)
      pluginCtx.effect(() => connection.fetch.register({
        path: '/api/spike/build', methods: ['POST'], requestBody: 'buffered',
        fetch: async () => Response.json(await runner.start(CLIENT, 'Syntegon', async (job: BuildJob) => {
          await job.start('matters', 2)
          await first.opened
          await job.advance('matters')
          await second.opened
          await job.advance('matters')
          await job.finish('matters')
        }), { status: 202 }),
      }), 'spike build')
      pluginCtx.effect(() => connection.fetch.register({
        path: '/api/spike/status', methods: ['GET'], requestBody: 'buffered',
        fetch: async () => Response.json(await runner.get(CLIENT) ?? null),
      }), 'spike status')
    })
    await fiber.await()
    const connection = ctx.get('connection') as HostConnectionService
    const shared = connection.createSharedFetchHandler('/api')
    const status = async (): Promise<BuildStatus | undefined> => {
      const response = await shared.fetch(new Request('http://host/api/spike/status'), connection.browserPeer)
      return await response.json() as BuildStatus
    }

    const request = new AbortController()
    const started = await shared.fetch(new Request('http://host/api/spike/build', { method: 'POST', body: '{}', signal: request.signal }), connection.browserPeer)
    expect(started.status).toBe(202)
    expect((await started.json() as BuildStatus).state).toBe('running')
    // The person leaves the page: the request is gone, the build is not.
    request.abort()

    expect((await status())?.steps.matters).toEqual({ state: 'running', done: 0, total: 2, failed: [] })
    first.open()
    await expect.poll(async () => (await status())?.steps.matters.done).toBe(1)
    second.open()
    const done = await until(status, 'done')
    expect(done.steps.matters).toEqual({ state: 'done', done: 2, total: 2, failed: [] })
    expect(done.finishedAt).toBe('2026-11-08T14:02:00.000Z')
    await fiber.dispose()
  })

  it('runs one job for a client at a time and answers the running one again', async () => {
    const runner = jobs()
    const hold = gate()
    let runs = 0
    const work = async () => { runs += 1; await hold.opened }
    const first = await runner.start(CLIENT, 'Syntegon', work)
    const again = await runner.start(CLIENT, 'Syntegon', work)
    expect(again).toBe(first)
    hold.open()
    await until(() => runner.get(CLIENT), 'done')
    expect(runs).toBe(1)
    expect(await runner.all()).toHaveLength(1)
  })

  it('reads as interrupted after a Host stop, from a new runner over the same files', async () => {
    const runner = jobs()
    await runner.start(CLIENT, 'Syntegon', async (job) => {
      await job.start('public-data', 16)
      await job.advance('public-data')
      await new Promise((_resolve, reject) => { job.signal.addEventListener('abort', () => { reject(new Error('stopped')) }) })
    })
    await expect.poll(async () => (await runner.get(CLIENT))?.steps['public-data'].done).toBe(1)
    await runner.dispose()
    await expect(runner.start(CLIENT, 'Syntegon', async () => {})).rejects.toThrow('stopped')
    const after = await jobs().get(CLIENT)
    expect(after?.state).toBe('interrupted')
    expect(after?.steps['public-data']).toEqual({ state: 'failed', done: 1, total: 16, failed: [] })
    expect(logs).toEqual([])
  })

  it('reads a status file that a stop left as running as interrupted', async () => {
    const runner = jobs()
    await runner.start(CLIENT, 'Syntegon', async () => {})
    await until(() => runner.get(CLIENT), 'done')
    const file = path.join(dir, `${CLIENT}.json`)
    const stored = JSON.parse(await readFile(file, 'utf8')) as BuildStatus
    await writeFile(file, JSON.stringify({ ...stored, state: 'running' }))
    expect((await jobs().all()).map(status => status.state)).toEqual(['interrupted'])
  })

  it('says failed when an item or the work fails, and logs a fault', async () => {
    const runner = jobs()
    await runner.start(CLIENT, 'Syntegon', async (job) => {
      await job.start('public-data', 2)
      await job.fail('public-data', 'EP4820737A1')
      await job.advance('public-data')
      await job.finish('public-data')
      await job.note({ workspace: 'ws-1', families: 1, matters: 2 })
    })
    const failed = await until(() => runner.get(CLIENT), 'failed')
    expect(failed.steps['public-data']).toEqual({ state: 'failed', done: 1, total: 2, failed: ['EP4820737A1'] })
    expect(failed).toMatchObject({ workspace: 'ws-1', families: 1, matters: 2 })

    const other = '0b7c3c3e-0000-4000-8000-000000000002'
    await runner.start(other, 'Schubert', async () => { throw new Error('disk full') })
    await until(() => runner.get(other), 'failed')
    await runner.start(other, 'Schubert', async () => { throw 'no error object' })
    await runner.dispose()
    expect(logs).toHaveLength(2)
    expect(logs[0]).toContain('disk full')
    expect(logs[1]).toContain('no error object')
  })

  it('logs a status it cannot write and still ends the job', async () => {
    const runner = jobs()
    await runner.start(CLIENT, 'Syntegon', async () => {
      await rm(dir, { recursive: true, force: true })
      await writeFile(dir, 'a file where the folder was')
    })
    await runner.dispose()
    expect(logs.some(line => line.includes('build status of'))).toBe(true)
    // The status is lost with its folder; the next build writes a new one.
    expect(await runner.get(CLIENT)).toBeUndefined()
    await rm(dir, { force: true })
  })

  it('has no status before a build and skips damaged or foreign files', async () => {
    expect(await jobs().all()).toEqual([])
    expect(await jobs().get(CLIENT)).toBeUndefined()
    await writeFile(path.join(dir, 'damaged.json'), '{')
    await writeFile(path.join(dir, 'other.json'), JSON.stringify({ clientId: CLIENT }))
    await writeFile(path.join(dir, 'notes.txt'), 'x')
    expect(await jobs().all()).toEqual([])
    expect(isBuildStatus(null)).toBe(false)
    expect(isBuildStatus({ clientId: CLIENT, state: 'done', steps: null })).toBe(false)
  })
})
