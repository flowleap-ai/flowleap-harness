import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { HostConnectionService } from '@deepseek-ai/dsh-client-connection'
import type { BrowserAuth } from '@deepseek-ai/dsh-client-connection/src/browser-auth.ts'
import { BuildJobs, BuildJobsStopped, isBuildStatus, messageOf, type BuildJob } from '../src/add-client/jobs.ts'
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

/** The request of a test build: the applications to build. */
type Apps = readonly string[]

function jobs() {
  return new BuildJobs<Apps>(dir, () => new Date('2026-11-08T14:02:00Z'), (message) => { logs.push(message) }, (running, next) => [...new Set([...running, ...next])])
}

async function until(read: () => Promise<BuildStatus | undefined>, state: BuildStatus['state']): Promise<BuildStatus> {
  for (let attempt = 0; attempt < 2000; attempt += 1) {
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
        fetch: async () => Response.json(await runner.start(CLIENT, 'Syntegon', [], async (job: BuildJob) => {
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

  it('runs one job for a client at a time, answers the running one again, and then runs once more', async () => {
    const runner = jobs()
    const hold = gate()
    let runs = 0
    const work = async () => { runs += 1; await hold.opened }
    const first = await runner.start(CLIENT, 'Syntegon', [], work)
    const again = await runner.start(CLIENT, 'Syntegon', [], work)
    expect(again).toBe(first)
    hold.open()
    await until(() => runner.get(CLIENT), 'done')
    expect(runs).toBe(2)
    expect(await runner.all()).toHaveLength(1)
  })

  it('runs once more when a request comes while a job runs, with both requests, and shows running until the last run ends', async () => {
    const runner = jobs()
    const hold = gate()
    const runs: Apps[] = []
    const work = async (job: BuildJob, apps: Apps) => {
      runs.push(apps)
      await job.start('matters', apps.length)
      if (runs.length === 1) await hold.opened
      await job.finish('matters')
    }
    await runner.start(CLIENT, 'Syntegon', ['EP1', 'EP2'], work)
    await runner.start(CLIENT, 'Syntegon', ['EP3'], work)
    const again = await runner.start(CLIENT, 'Syntegon AG', ['EP2', 'EP4'], work)
    expect(again.state).toBe('running')
    hold.open()
    const states: string[] = []
    let status: BuildStatus | undefined
    do {
      status = await runner.get(CLIENT)
      states.push(status?.state ?? 'none')
      await new Promise(resolve => setTimeout(resolve, 1))
    } while (status?.state === 'running')
    expect(states.filter(state => state !== 'running')).toEqual(['done'])
    expect(runs).toEqual([['EP1', 'EP2'], ['EP1', 'EP2', 'EP3', 'EP4']])
    expect(status).toMatchObject({ name: 'Syntegon AG', steps: { matters: { state: 'done', total: 4 } } })
  })

  it('logs a status it cannot write between two runs and still runs the second one', async () => {
    const runner = jobs()
    const hold = gate()
    let runs = 0
    await runner.start(CLIENT, 'Syntegon', [], async () => {
      runs += 1
      await hold.opened
      await rm(dir, { recursive: true, force: true })
      await writeFile(dir, 'a file where the folder was')
    })
    await runner.start(CLIENT, 'Syntegon', [], async () => { runs += 1 })
    hold.open()
    await expect.poll(() => logs.filter(line => line.includes('build status of')).length).toBe(2)
    expect(runs).toBe(2)
    await rm(dir, { force: true })
  })

  it('does not run again after a stop', async () => {
    const runner = jobs()
    let runs = 0
    await runner.start(CLIENT, 'Syntegon', [], async (job) => {
      runs += 1
      await new Promise((_resolve, reject) => { job.signal.addEventListener('abort', () => { reject(new Error('stopped')) }) })
    })
    await runner.start(CLIENT, 'Syntegon', [], async () => { runs += 1 })
    await runner.dispose()
    expect(runs).toBe(1)
    expect((await runner.get(CLIENT))?.state).toBe('interrupted')
  })

  it('runs no job and keeps the client free when the first status cannot be written', async () => {
    await writeFile(path.join(dir, 'state'), 'a file where the folder should be')
    const blocked = new BuildJobs<Apps>(path.join(dir, 'state', 'builds'), () => new Date(), () => {}, (_running, next) => next)
    let runs = 0
    await expect(blocked.start(CLIENT, 'Syntegon', [], async () => { runs += 1 })).rejects.toThrow()
    await rm(path.join(dir, 'state'))
    const status = await blocked.start(CLIENT, 'Syntegon', [], async () => { runs += 1 })
    expect(status.state).toBe('running')
    await expect.poll(async () => (await blocked.get(CLIENT))?.state).toBe('done')
    expect(runs).toBe(1)
  })

  it('answers the end of a job that ended in this process over an older status file', async () => {
    const runner = jobs()
    await runner.start(CLIENT, 'Syntegon', [], async () => {})
    await until(() => runner.get(CLIENT), 'done')
    // A read that started while the job ran gives the file as it was then.
    const file = path.join(dir, `${CLIENT}.json`)
    const stored = JSON.parse(await readFile(file, 'utf8')) as BuildStatus
    await writeFile(file, JSON.stringify({ ...stored, state: 'running' }))
    expect((await runner.all()).map(status => status.state)).toEqual(['done'])
    expect((await runner.get(CLIENT))?.state).toBe('done')
  })

  it('reads as interrupted after a Host stop, from a new runner over the same files', async () => {
    const runner = jobs()
    await runner.start(CLIENT, 'Syntegon', [], async (job) => {
      await job.start('public-data', 16)
      await job.advance('public-data')
      await new Promise((_resolve, reject) => { job.signal.addEventListener('abort', () => { reject(new Error('stopped')) }) })
    })
    await expect.poll(async () => (await runner.get(CLIENT))?.steps['public-data'].done).toBe(1)
    await runner.dispose()
    await expect(runner.start(CLIENT, 'Syntegon', [], async () => {})).rejects.toBeInstanceOf(BuildJobsStopped)
    const after = await jobs().get(CLIENT)
    expect(after?.state).toBe('interrupted')
    expect(after?.steps['public-data']).toEqual({ state: 'failed', done: 1, total: 16, failed: [] })
    expect(logs).toEqual([])
  })

  it('reads a status file that a stop left as running as interrupted', async () => {
    const runner = jobs()
    await runner.start(CLIENT, 'Syntegon', [], async () => {})
    await until(() => runner.get(CLIENT), 'done')
    const file = path.join(dir, `${CLIENT}.json`)
    const stored = JSON.parse(await readFile(file, 'utf8')) as BuildStatus
    await writeFile(file, JSON.stringify({ ...stored, state: 'running' }))
    expect((await jobs().all()).map(status => status.state)).toEqual(['interrupted'])
  })

  it('says failed when an item or the work fails, and logs a fault', async () => {
    const runner = jobs()
    await runner.start(CLIENT, 'Syntegon', [], async (job) => {
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
    await runner.start(other, 'Schubert', [], async () => { throw new Error('disk full') })
    await until(() => runner.get(other), 'failed')
    await runner.start(other, 'Schubert', [], async () => { throw 'no error object' })
    await runner.dispose()
    expect(logs).toHaveLength(2)
    expect(logs[0]).toContain('disk full')
    expect(logs[1]).toContain('no error object')
  })

  it('writes the next status after a status that it could not write', async () => {
    const runner = jobs()
    await runner.start(CLIENT, 'Syntegon', [], async (job) => {
      await rm(dir, { recursive: true, force: true })
      await writeFile(dir, 'a file where the folder was')
      await job.start('folder', 1).catch(() => undefined)
      await rm(dir, { force: true })
      await job.advance('folder')
    })
    await runner.dispose()
    expect((await runner.get(CLIENT))?.steps.folder).toMatchObject({ done: 1 })
  })

  it('words an error that is not an error object', () => {
    expect(messageOf(new Error('disk full'))).toBe('disk full')
    expect(messageOf('disk gone')).toBe('disk gone')
  })

  it('logs a status it cannot write and still ends the job', async () => {
    const runner = jobs()
    await runner.start(CLIENT, 'Syntegon', [], async () => {
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
    expect(await new BuildJobs<Apps>(path.join(dir, 'none'), () => new Date(), () => {}, (_running, next) => next).all()).toEqual([])
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
