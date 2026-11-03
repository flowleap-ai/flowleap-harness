/** The OfficeCLI runner: argv, the fixed environment, the bounds, and the reply. */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FlowleapOfficeError } from '../src/error.ts'
import { failureText, OfficeCliRunner, spawnEnvironment } from '../src/officecli/runner.ts'
import { fail, FakeSubprocess, ok } from './fake-officecli.ts'

const dirs: string[] = []
afterEach(async () => {
  vi.unstubAllEnvs()
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
})

async function setup(timeoutMs = 5_000, maxOutputBytes = 1_000) {
  const dir = await mkdtemp(join(tmpdir(), 'flowleap-office-runner-'))
  dirs.push(dir)
  const fake = new FakeSubprocess()
  const runner = new OfficeCliRunner(fake, { binaryPath: '/opt/officecli', home: '/state/home', stateDir: '/state/state', timeoutMs, maxOutputBytes })
  return { dir, fake, runner }
}

const signal = new AbortController().signal

async function rejection(promise: Promise<unknown>): Promise<FlowleapOfficeError> {
  const error: unknown = await promise.then(() => undefined, (reason: unknown) => reason)
  if (error instanceof FlowleapOfficeError) return error
  throw new Error(`expected a FlowleapOfficeError, got ${String(error)}`)
}

describe('OfficeCliRunner', () => {
  it('spawns the binary with typed argv in the call folder and only the fixed environment', async () => {
    vi.stubEnv('OFFICECLI_RESIDENT_FLUSH', 'each')
    vi.stubEnv('HTTPS_PROXY', 'http://proxy:8080')
    const { dir, fake, runner } = await setup()
    fake.responder = () => ok({ count: 0, errors: [] })
    const reply = await runner.reply({ kind: 'validate', file: 'a.docx' }, dir, signal)
    expect(reply).toEqual({ success: true, data: { count: 0, errors: [] } })
    const [spawned] = fake.spawned
    expect(spawned?.argv).toEqual(['/opt/officecli', 'validate', 'a.docx', '--json'])
    expect(spawned?.cwd).toBe(dir)
    const defined = Object.fromEntries(Object.entries(spawned?.env ?? {}).filter(([, value]) => value !== undefined))
    expect(defined).toEqual({
      HOME: '/state/home',
      OFFICECLI_STATE_DIR: '/state/state',
      OFFICECLI_SKIP_UPDATE: '1',
      OFFICECLI_NO_AUTO_INSTALL: '1',
      OFFICECLI_NO_AUTO_RESIDENT: '1',
      TMPDIR: dir,
    })
    expect(Object.hasOwn(spawned?.env ?? {}, 'OFFICECLI_RESIDENT_FLUSH')).toBe(true)
    expect(spawned?.env['OFFICECLI_RESIDENT_FLUSH']).toBeUndefined()
    expect(spawned?.env['HTTPS_PROXY']).toBeUndefined()
  })

  it('removes every ambient name and keeps the fixed values', () => {
    expect(spawnEnvironment({ HOME: '/h' }, { HOME: '/real', PATH: '/bin' })).toEqual({ HOME: '/h', PATH: undefined })
  })

  it('reports a timeout, a cancellation, a spawn failure, and output over the cap', async () => {
    const { dir, fake, runner } = await setup(50)
    fake.responder = () => ({ hang: true })
    expect((await rejection(runner.run({ kind: 'version' }, dir, signal))).code).toBe('timeout')
    const controller = new AbortController()
    const pending = runner.run({ kind: 'version' }, dir, controller.signal)
    controller.abort()
    expect((await rejection(pending)).code).toBe('aborted')
    fake.responder = () => ({ spawnError: new Error('ENOENT') })
    expect((await rejection(runner.run({ kind: 'version' }, dir, signal))).message).toContain('ENOENT')
    fake.responder = () => ({ stdout: 'x', lossy: true })
    expect((await rejection(runner.run({ kind: 'version' }, dir, signal))).code).toBe('output_too_large')
  })

  it('fails a reply that is not OfficeCLI JSON with the exit code and stderr', async () => {
    const { dir, fake, runner } = await setup()
    fake.responder = () => ({ exitCode: 3, stdout: 'not json', stderr: 'boom' })
    const error = await rejection(runner.reply({ kind: 'create', file: 'a.docx' }, dir, signal))
    expect(error.code).toBe('engine_failed')
    expect(error.message).toContain('exit 3')
    expect(error.message).toContain('boom')
    fake.responder = () => ({ stdout: '{"nope":1}' })
    expect((await rejection(runner.reply({ kind: 'create', file: 'a.docx' }, dir, signal))).code).toBe('engine_failed')
  })
})

describe('failureText', () => {
  it('names the engine error, the first failed batch item, or the message', () => {
    expect(failureText(JSON.parse(fail('corrupt').stdout ?? '') as { success: false; error: { error: string } })).toBe('corrupt')
    expect(failureText({ success: false, data: { results: [{ success: true }, { success: false, error: 'no revision matches' }] } })).toBe('no revision matches')
    expect(failureText({ success: false, data: { results: [{ success: true }] }, message: 'm' })).toBe('m')
    expect(failureText({ success: false })).toBe('the engine reported a failure')
  })
})
