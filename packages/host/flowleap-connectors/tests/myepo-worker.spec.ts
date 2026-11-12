import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { internals, provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apply, createMyEpoWorker, type Config, type MyEpoWorkerStatus } from '../src/myepo-worker.ts'
import { createMyEpoDouble } from './myepo-double/double.ts'
import { DOUBLE_CLIENT, seedData } from './myepo-double/seed-data.ts'

const MYEPO = { baseUrl: 'https://double.test/latest', tokenUrl: 'https://double.test/token', requestsPerSecond: 1000, timeoutSeconds: 5 }
const RECORD = 'http://record.test/records/api/'
const MARK = '(public sample data, not a live MyEPO account)'
const folders: string[] = []

afterEach(() => {
  for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true })
  internals.stdout = process.stdout
  internals.stderr = process.stderr
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** An answer that replaces the default answer of the EPO or of the Firm Record; `undefined` keeps the default. */
type Answer = (url: URL, init: RequestInit | undefined) => Response | Promise<Response> | undefined

/** The text body of a request that the spec's fetch receives. */
function bodyOf(init: RequestInit | undefined): string {
  return typeof init?.body === 'string' ? init.body : ''
}

/** A fetch answer that waits until the call is stopped, and rejects with the reason of the stop. */
function waitForStop(init: RequestInit | undefined, stopped: () => void = () => {}): Promise<Response> {
  return new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      const reason: unknown = init.signal?.reason
      reject(reason instanceof Error ? reason : new Error('the call was stopped'))
      stopped()
    })
  })
}

/** The worker's folders as install.sh makes them, in a temporary root that the spec removes. */
function makeFolders() {
  const root = mkdtempSync(join(tmpdir(), 'myepo-worker-'))
  folders.push(root)
  const dir = join(root, 'myepo')
  const testsDir = join(root, 'tests')
  for (const d of [dir, testsDir]) mkdirSync(d, { mode: 0o700 })
  writeFileSync(join(dir, 'intake-token'), 'intake-token-value\n', { mode: 0o600 })
  return { root, dir, testsDir }
}

/** A worker over temporary folders, the double, an in-memory Firm Record intake and a clock that the spec moves. */
function setup(options: { log?: (line: string) => void } = {}) {
  const { dir, testsDir } = makeFolders()
  const double = createMyEpoDouble(seedData(MYEPO.baseUrl), MYEPO, DOUBLE_CLIENT)
  const filed = new Map<string, unknown>()
  let epoCalls = 0
  let epoDown = false
  let epoAnswer: Answer | undefined
  let recordAnswer: Answer | undefined
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url.startsWith(RECORD)) {
      const own = recordAnswer?.(new URL(url), init)
      if (own !== undefined) return own
      const id = decodeURIComponent(url.slice(`${RECORD}intake/myepo-letters/`.length))
      if ((init?.method ?? 'GET') === 'GET') return Response.json({ known: filed.has(id) })
      const letter = JSON.parse(bodyOf(init)) as { communication: { id: string } }
      filed.set(letter.communication.id, letter)
      return Response.json({ state: 'filed', matter: 'SF-2023-0045', reason: null })
    }
    epoCalls++
    if (epoDown) throw new TypeError('fetch failed')
    const own = epoAnswer?.(new URL(url), init)
    if (own !== undefined) return own
    return double.fetch(input, init)
  }
  let clock = Date.parse('2026-11-10T08:00:00Z')
  const config: Config = {
    dir, testsDir, recordUrl: RECORD, myepo: MYEPO, download: 'on-arrival', everySeconds: 60, testEverySeconds: 3600, pollSeconds: 2,
  }
  const lines: string[] = []
  const make = () => createMyEpoWorker({ config, fetch, now: () => clock, log: options.log ?? ((line) => { lines.push(line) }) })
  const worker = make()
  const status = (): MyEpoWorkerStatus => JSON.parse(readFileSync(join(dir, 'status.json'), 'utf8')) as MyEpoWorkerStatus
  const link = (clientSecret: string): void => {
    writeFileSync(join(dir, 'link.json'), JSON.stringify({ clientId: DOUBLE_CLIENT.clientId, clientSecret, linkedBy: 'admin', linkedAt: '2026-11-10T07:59:00.000Z' }), { mode: 0o600 })
  }
  return {
    dir, testsDir, double, filed, worker, status, link, lines,
    /** A new worker process over the same folders, network and clock. */
    restart: make,
    epoCalls: () => epoCalls,
    setEpoDown: (down: boolean) => { epoDown = down },
    onEpo: (answer: Answer | undefined) => { epoAnswer = answer },
    onRecord: (answer: Answer | undefined) => { recordAnswer = answer },
    advance: (seconds: number) => { clock += seconds * 1000 },
  }
}

/** An EPO error answer for one API path, for example `/portfolios`. */
function epoRefuses(path: string, status: number): Answer {
  return url => url.pathname.endsWith(path) ? Response.json({ code: 'ERR_20', message: 'refused by the spec' }, { status }) : undefined
}

describe('createMyEpoWorker', () => {
  it('reports not linked and calls MyEPO not at all while no pair is saved', async () => {
    const w = setup()
    for (let i = 0; i < 3; i++) await w.worker.tick()
    expect(w.status().link).toBe('not-linked')
    expect(w.epoCalls()).toBe(0)
  })

  it('answers a test request of the console and deletes the pair before the test, and saves nothing', async () => {
    const w = setup()
    writeFileSync(join(w.testsDir, `${'a'.repeat(32)}.json`), JSON.stringify({ clientId: DOUBLE_CLIENT.clientId, clientSecret: 'wrong' }), { mode: 0o600 })
    writeFileSync(join(w.testsDir, `${'b'.repeat(32)}.json`), JSON.stringify(DOUBLE_CLIENT), { mode: 0o600 })
    await w.worker.tick()
    expect(readdirSync(w.testsDir).sort()).toEqual([`${'a'.repeat(32)}.result.json`, `${'b'.repeat(32)}.result.json`])
    const refused = readFileSync(join(w.testsDir, `${'a'.repeat(32)}.result.json`), 'utf8')
    const passed = readFileSync(join(w.testsDir, `${'b'.repeat(32)}.result.json`), 'utf8')
    expect(JSON.parse(refused)).toEqual({ kind: 'refused' })
    expect(JSON.parse(passed)).toMatchObject({ kind: 'passed', mailbox: true })
    expect((JSON.parse(passed) as { portfolios: { name: string }[] }).portfolios.every(p => p.name.endsWith(MARK))).toBe(true)
    expect(passed + refused).not.toContain(DOUBLE_CLIENT.clientSecret)
    expect(existsSync(join(w.dir, 'link.json'))).toBe(false)
    expect(w.status().link).toBe('not-linked')
  })

  it('tests a saved pair, reports it linked with the portfolios, reads the letters, and files an arrival at the next due read', async () => {
    const w = setup()
    w.link(DOUBLE_CLIENT.clientSecret)
    await w.worker.tick()
    const linked = w.status()
    expect(linked).toMatchObject({ link: 'linked', clientId: DOUBLE_CLIENT.clientId, linkedBy: 'admin', mailbox: true, failure: null })
    expect(linked.portfolios?.length).toBe(3)
    expect(linked.lastReadAt).not.toBeNull()
    const first = w.filed.size
    expect(first).toBeGreaterThan(0)
    expect(readFileSync(join(w.dir, 'status.json'), 'utf8')).not.toContain(DOUBLE_CLIENT.clientSecret)
    w.double.arrive()
    await w.worker.tick()
    expect(w.filed.size).toBe(first)
    w.advance(60)
    await w.worker.tick()
    expect(w.filed.size).toBe(first + 1)
    const numbers = [...w.filed.values()]
      .map(letter => (letter as { communication: { applicationNumber: string | null } }).communication.applicationNumber)
    expect(numbers.filter(number => number?.startsWith('EP23771920'))).toHaveLength(1)
  })

  it('stops every MyEPO call after the EPO refuses the saved pair, and tests again when a new pair is saved', async () => {
    const w = setup()
    w.link('not-the-secret')
    await w.worker.tick()
    expect(w.status().link).toBe('refused')
    const calls = w.epoCalls()
    for (let i = 0; i < 3; i++) { w.advance(7200); await w.worker.tick() }
    expect(w.epoCalls()).toBe(calls)
    w.link(DOUBLE_CLIENT.clientSecret)
    await w.worker.tick()
    expect(w.status().link).toBe('linked')
  })

  it('keeps the link when the EPO does not answer a read, reports the failure, and waits longer after each failed read', async () => {
    const w = setup()
    w.link(DOUBLE_CLIENT.clientSecret)
    await w.worker.tick()
    w.setEpoDown(true)
    w.advance(60)
    await w.worker.tick()
    const failed = w.status()
    expect(failed.link).toBe('linked')
    expect(failed.failure?.message).toMatch(/did not answer/)
    const calls = w.epoCalls()
    w.advance(60)
    await w.worker.tick()
    expect(w.epoCalls()).toBe(calls)
    w.advance(60)
    w.setEpoDown(false)
    await w.worker.tick()
    expect(w.status().failure).toBeNull()
  })

  it('reports not linked and calls MyEPO not at all when the pair is unlinked', async () => {
    const w = setup()
    w.link(DOUBLE_CLIENT.clientSecret)
    await w.worker.tick()
    rmSync(join(w.dir, 'link.json'))
    const calls = w.epoCalls()
    w.advance(3600)
    await w.worker.tick()
    expect(w.status()).toMatchObject({ link: 'not-linked', clientId: null, portfolios: null })
    expect(w.epoCalls()).toBe(calls)
  })

  it('reports not linked and calls MyEPO not at all when the saved pair cannot be read', async () => {
    const w = setup()
    symlinkSync(join(w.dir, 'link.json'), join(w.dir, 'link.json'))
    await w.worker.tick()
    expect(w.status().link).toBe('not-linked')
    expect(w.lines.at(-1)).toMatch(/^the saved pair cannot be read: /)
    expect(w.epoCalls()).toBe(0)
  })

  it.skipIf(process.platform === 'win32')('reports not linked and calls MyEPO not at all when other accounts can read the pair', async () => {
    const w = setup()
    w.link(DOUBLE_CLIENT.clientSecret)
    chmodSync(join(w.dir, 'link.json'), 0o644)
    await w.worker.tick()
    expect(w.status().link).toBe('not-linked')
    expect(w.lines.at(-1)).toMatch(/^the saved pair cannot be read: .* is readable by other accounts \(mode 644\)$/)
    expect(w.epoCalls()).toBe(0)
  })
})

describe('createMyEpoWorker test requests', () => {
  it('deletes a test request that cannot be read, writes no result, and keeps other files', async () => {
    const w = setup()
    const loop = `${'b'.repeat(32)}.json`
    symlinkSync(join(w.testsDir, loop), join(w.testsDir, loop))
    writeFileSync(join(w.testsDir, 'notes.txt'), 'not a test request')
    await w.worker.tick()
    expect(readdirSync(w.testsDir)).toEqual(['notes.txt'])
    expect(w.lines).toEqual([expect.stringMatching(new RegExp(`^test ${'b'.repeat(32)}: the request cannot be read: `))])
    expect(w.epoCalls()).toBe(0)
  })

  it.skipIf(process.platform === 'win32')('deletes a test request that other accounts can read and writes no result', async () => {
    const w = setup()
    const open = `${'a'.repeat(32)}.json`
    writeFileSync(join(w.testsDir, open), JSON.stringify(DOUBLE_CLIENT), { mode: 0o644 })
    chmodSync(join(w.testsDir, open), 0o644)
    await w.worker.tick()
    expect(readdirSync(w.testsDir)).toEqual([])
    expect(w.lines).toEqual([expect.stringMatching(new RegExp(`^test ${'a'.repeat(32)}: the request cannot be read: .* is readable by other accounts \\(mode 644\\)$`))])
    expect(w.epoCalls()).toBe(0)
  })

  it('answers failed to a test request that has no client secret, and calls MyEPO not at all', async () => {
    const w = setup()
    writeFileSync(join(w.testsDir, `${'c'.repeat(32)}.json`), JSON.stringify({ clientId: DOUBLE_CLIENT.clientId }), { mode: 0o600 })
    await w.worker.tick()
    const result: unknown = JSON.parse(readFileSync(join(w.testsDir, `${'c'.repeat(32)}.result.json`), 'utf8'))
    expect(result).toEqual({ kind: 'failed', message: 'the test request has no client ID or no client secret' })
    expect(w.epoCalls()).toBe(0)
  })

  it('does its other work while the tests folder does not exist, and fails the step when the tests folder is a file', async () => {
    const w = setup()
    rmSync(w.testsDir, { recursive: true })
    w.link(DOUBLE_CLIENT.clientSecret)
    await w.worker.tick()
    expect(w.status().link).toBe('linked')
    writeFileSync(w.testsDir, 'not a folder')
    await expect(w.worker.tick()).rejects.toMatchObject({ code: 'ENOTDIR' })
  })
})

describe('createMyEpoWorker saved pair', () => {
  it('reports not linked and logs it when the saved pair has no client secret, and logs a removed pair', async () => {
    const w = setup()
    w.link(DOUBLE_CLIENT.clientSecret)
    await w.worker.tick()
    writeFileSync(join(w.dir, 'link.json'), JSON.stringify({ clientId: DOUBLE_CLIENT.clientId, linkedBy: 'admin', linkedAt: '2026-11-10T07:59:00.000Z' }), { mode: 0o600 })
    await w.worker.tick()
    expect(w.status()).toMatchObject({ link: 'not-linked', clientId: null })
    expect(w.lines.slice(-2)).toEqual(['the saved pair has no client ID or no client secret', 'the saved pair is not usable; MyEPO is not linked'])
    w.link(DOUBLE_CLIENT.clientSecret)
    await w.worker.tick()
    expect(w.status().link).toBe('linked')
    rmSync(join(w.dir, 'link.json'))
    await w.worker.tick()
    expect(w.lines.at(-1)).toBe('the pair was removed; MyEPO is not linked')
  })

  it('keeps the state checking while the first test gets no answer or fails, keeps the first failure time, and tests again after everySeconds', async () => {
    const w = setup()
    w.setEpoDown(true)
    w.link(DOUBLE_CLIENT.clientSecret)
    await w.worker.tick()
    const first = w.status()
    expect(first).toMatchObject({ link: 'checking', failure: { message: 'the EPO did not answer' } })
    const calls = w.epoCalls()
    w.advance(30)
    await w.worker.tick()
    expect(w.epoCalls()).toBe(calls)
    w.advance(30)
    w.setEpoDown(false)
    w.onEpo(epoRefuses('/portfolios', 418))
    await w.worker.tick()
    const second = w.status()
    expect(second.link).toBe('checking')
    expect(second.failure?.message).toMatch(/418/)
    expect(second.failure?.since).toBe(first.failure?.since)
    expect(second.failure?.at).not.toBe(first.failure?.at)
    w.onEpo(undefined)
    w.advance(60)
    await w.worker.tick()
    expect(w.status()).toMatchObject({ link: 'linked', failure: null })
  })

  it('reports permission missing and reads the Mailbox when the account may read no portfolio', async () => {
    const w = setup()
    w.onEpo(epoRefuses('/portfolios', 403))
    w.link(DOUBLE_CLIENT.clientSecret)
    await w.worker.tick()
    expect(w.status()).toMatchObject({ link: 'permission-missing', portfolios: [], mailbox: true })
    expect(w.filed.size).toBeGreaterThan(0)
  })

  it('reports permission missing and reads nothing when the Mailbox does not answer the test', async () => {
    const w = setup()
    w.onEpo(epoRefuses('/communications/folders', 403))
    w.link(DOUBLE_CLIENT.clientSecret)
    await w.worker.tick()
    expect(w.status()).toMatchObject({ link: 'permission-missing', mailbox: false, lastReadAt: null })
    expect(w.filed.size).toBe(0)
  })
})

describe('createMyEpoWorker reads', () => {
  it('reports permission missing and the failure when the read of the Mailbox answers no permission', async () => {
    const w = setup()
    w.onEpo(epoRefuses('/communications/unhandled', 403))
    w.link(DOUBLE_CLIENT.clientSecret)
    await w.worker.tick()
    expect(w.status()).toMatchObject({ link: 'permission-missing', lastReadAt: null, failure: { message: 'the MyEPO account has no permission for this read (ERR_20)' } })
    expect(w.lines.at(-1)).toBe('the read failed, the next read tries again: the MyEPO account has no permission for this read (ERR_20)')
  })

  it('stops every MyEPO call when the EPO refuses the saved pair at a read', async () => {
    const w = setup()
    w.onEpo(url => url.pathname.endsWith('/communications/unhandled') ? new Response('refused', { status: 401 }) : undefined)
    w.link(DOUBLE_CLIENT.clientSecret)
    await w.worker.tick()
    expect(w.status().link).toBe('refused')
    expect(w.lines.at(-1)).toBe('the EPO refused the saved pair; no MyEPO call until a new pair is saved')
    const calls = w.epoCalls()
    w.advance(7200)
    await w.worker.tick()
    expect(w.epoCalls()).toBe(calls)
  })

  it('keeps the link and reports the failure when the Firm Record does not answer', async () => {
    const w = setup()
    w.onRecord(() => Response.json({ error: 'busy' }, { status: 503 }))
    w.link(DOUBLE_CLIENT.clientSecret)
    await w.worker.tick()
    expect(w.status()).toMatchObject({ link: 'linked', lastReadAt: null, failure: { message: 'the Firm Record did not take the letter: 503 busy' } })
    expect(w.filed.size).toBe(0)
  })

  it('logs each letter by the answer of the Firm Record, reports the letters not taken, and clears the failure when all are taken', async () => {
    const w = setup()
    const order: string[] = []
    let refuse = true
    w.onRecord((_url, init) => {
      if ((init?.method ?? 'GET') !== 'POST') return undefined
      const letter = JSON.parse(bodyOf(init)) as { communication: { id: string }; document: unknown }
      const id = letter.communication.id
      if (!order.includes(id)) order.push(id)
      const index = order.indexOf(id)
      if (index === 0) return Response.json({ error: 'already-stored' }, { status: 409 })
      if (index === 1 && letter.document !== null) return Response.json({ error: 'too-large' }, { status: 422 })
      if (index === 1) return Response.json({ state: 'waiting', matter: null, reason: 'no matter has the application' })
      if (index === 2 && refuse) return Response.json({ error: 'bad-letter' }, { status: 422 })
      return undefined
    })
    w.link(DOUBLE_CLIENT.clientSecret)
    await w.worker.tick()
    expect(w.lines).toEqual(expect.arrayContaining([
      `letter ${order[0]}: the Firm Record has its PDF from the mail; not sent again`,
      `letter ${order[1]}: waiting (no matter has the application), list data only`,
      `letter ${order[2]} not taken, the next read tries again: the Firm Record refused the letter: 422 bad-letter`,
    ]))
    const failed = w.status()
    expect(failed).toMatchObject({ link: 'linked', failure: { message: '1 letters were not taken; the next read tries again' } })
    expect(failed.lastReadAt).not.toBeNull()
    refuse = false
    w.advance(60)
    await w.worker.tick()
    expect(w.status().failure).toBeNull()
    expect(w.filed.has(order[2] ?? '')).toBe(true)
  })

  it('reports the failure and reads nothing while the intake token is missing or empty', async () => {
    const w = setup()
    rmSync(join(w.dir, 'intake-token'))
    w.link(DOUBLE_CLIENT.clientSecret)
    await w.worker.tick()
    expect(w.status()).toMatchObject({ link: 'linked', lastReadAt: null, failure: { message: 'the intake token of the Firm Record is missing' } })
    writeFileSync(join(w.dir, 'intake-token'), ' \n', { mode: 0o600 })
    await w.worker.tick()
    expect(w.status().failure?.message).toBe('the intake token of the Firm Record is missing')
    expect(w.filed.size).toBe(0)
    writeFileSync(join(w.dir, 'intake-token'), 'intake-token-value\n', { mode: 0o600 })
    await w.worker.tick()
    expect(w.status().failure).toBeNull()
    expect(w.filed.size).toBeGreaterThan(0)
  })

  it('fails the step on a failure that is not of MyEPO and not of the Firm Record', async () => {
    const w = setup({ log: (line) => { if (line.startsWith('letter ')) throw new Error('the log cannot be written') } })
    w.link(DOUBLE_CLIENT.clientSecret)
    await expect(w.worker.tick()).rejects.toThrow('the log cannot be written')
  })

  it('stops the MyEPO call in progress on close', async () => {
    const w = setup()
    let started!: () => void
    const calling = new Promise<void>((resolve) => { started = resolve })
    w.onEpo((_url, init) => {
      started()
      return waitForStop(init)
    })
    w.link(DOUBLE_CLIENT.clientSecret)
    const tick = w.worker.tick()
    await calling
    w.worker.close()
    await expect(tick).rejects.toThrow('the worker stops')
  })
})

describe('apply', () => {
  /** Load the row on a host context with the command line, with captured command output, exit requests and log lines. */
  function load(args: string[], config: Config) {
    const ctx = new Context()
    const exits: number[] = []
    let out = ''
    const capture = { write: (chunk: string) => { out += chunk; return true } }
    internals.stdout = capture
    internals.stderr = capture
    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((line: string) => { lines.push(line) })
    provideCmdline(ctx, { args, exit: code => void exits.push(code) })
    apply(ctx, config)
    return { ctx, exits, out: () => out, lines }
  }

  /** A row config over new temporary folders, with the fields that a case changes. */
  function rowConfig(change: { dir?: string; testsDir?: string; recordUrl?: string; baseUrl?: string; tokenUrl?: string } = {}): Config {
    const made = makeFolders()
    const at = (name: string): string => join(made.dir, name)
    return {
      dir: change.dir === undefined ? made.dir : at(change.dir),
      testsDir: change.testsDir === undefined ? made.testsDir : at(change.testsDir),
      recordUrl: change.recordUrl ?? RECORD,
      myepo: { ...MYEPO, baseUrl: change.baseUrl ?? MYEPO.baseUrl, tokenUrl: change.tokenUrl ?? MYEPO.tokenUrl },
      download: 'on-arrival', everySeconds: 60, testEverySeconds: 3600, pollSeconds: 1,
    }
  }

  it('prints the help on --help, requests exit 0, and starts nothing', async () => {
    const config = rowConfig()
    const { ctx, exits, out, lines } = load(['--help'], config)
    expect(out()).toContain('Usage: dsh --profile flowleap-firm-worker')
    expect(out()).toContain('dsh --profile flowleap-firm-worker --patch worker.patch.yml')
    expect(exits).toEqual([0])
    expect(lines).toEqual([])
    expect(existsSync(join(config.dir, 'status.json'))).toBe(false)
    await ctx.fiber.dispose()
  })

  it.each([
    ['dir', { dir: 'missing' }, /^flowleap-myepo-worker: dir .*missing is not a folder$/],
    ['testsDir', { testsDir: 'intake-token' }, /^flowleap-myepo-worker: testsDir .*intake-token is not a folder$/],
    ['recordUrl', { recordUrl: 'record' }, /^flowleap-myepo-worker: recordUrl record is not an http or https address$/],
    ['myepo.baseUrl', { baseUrl: 'ftp://double.test/latest' }, /^flowleap-myepo-worker: myepo.baseUrl ftp:/],
    ['myepo.tokenUrl', { tokenUrl: 'file:///token' }, /^flowleap-myepo-worker: myepo.tokenUrl file:/],
  ])('refuses to load when %s is wrong', (_field, change, message) => {
    expect(() => load([], rowConfig(change))).toThrow(message)
  })

  it('starts, does one step every pollSeconds, logs a failed step and goes on, and stops on dispose', async () => {
    const config = rowConfig()
    const double = createMyEpoDouble(seedData(MYEPO.baseUrl), MYEPO, DOUBLE_CLIENT)
    vi.stubGlobal('fetch', double.fetch)
    const { ctx, lines } = load([], config)
    expect(lines[0]).toBe(`flowleap-myepo-worker: reads ${MYEPO.baseUrl}, downloads on-arrival, sends to ${RECORD}`)
    await vi.waitFor(() => { expect(existsSync(join(config.dir, 'status.json'))).toBe(true) })
    rmSync(config.testsDir, { recursive: true })
    writeFileSync(config.testsDir, 'not a folder')
    const failed = /^flowleap-myepo-worker: the step failed, the next step tries again: ENOTDIR/
    await vi.waitFor(() => { expect(lines.at(-1)).toMatch(failed) }, { timeout: 5000 })
    rmSync(config.testsDir)
    mkdirSync(config.testsDir, { mode: 0o700 })
    const id = 'd'.repeat(32)
    writeFileSync(join(config.testsDir, `${id}.json`), JSON.stringify(DOUBLE_CLIENT), { mode: 0o600 })
    await vi.waitFor(() => { expect(existsSync(join(config.testsDir, `${id}.result.json`))).toBe(true) }, { timeout: 5000 })
    await ctx.fiber.dispose()
    writeFileSync(join(config.testsDir, `${'e'.repeat(32)}.json`), JSON.stringify(DOUBLE_CLIENT), { mode: 0o600 })
    await new Promise(resolve => setTimeout(resolve, 1500))
    expect(existsSync(join(config.testsDir, `${'e'.repeat(32)}.json`))).toBe(true)
  }, 15_000)

  it('logs a failed step that is not an Error by its text', async () => {
    const config = rowConfig()
    writeFileSync(join(config.dir, 'link.json'), JSON.stringify({ ...DOUBLE_CLIENT, linkedBy: 'admin', linkedAt: '2026-11-10T07:59:00.000Z' }), { mode: 0o600 })
    vi.stubGlobal('fetch', createMyEpoDouble(seedData(MYEPO.baseUrl), MYEPO, DOUBLE_CLIENT).fetch)
    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((line: string) => {
      if (line.includes('a pair is saved')) throw 'the log is full'
      lines.push(line)
    })
    const ctx = new Context()
    provideCmdline(ctx, { args: [], exit: () => {} })
    apply(ctx, config)
    await vi.waitFor(() => { expect(lines).toContain('flowleap-myepo-worker: the step failed, the next step tries again: the log is full') })
    await ctx.fiber.dispose()
  })

  it('stops the step in progress on dispose and logs no failure', async () => {
    const config = rowConfig()
    writeFileSync(join(config.dir, 'link.json'), JSON.stringify({ ...DOUBLE_CLIENT, linkedBy: 'admin', linkedAt: '2026-11-10T07:59:00.000Z' }), { mode: 0o600 })
    let started!: () => void
    const calling = new Promise<void>((resolve) => { started = resolve })
    let aborted!: () => void
    const stopped = new Promise<void>((resolve) => { aborted = resolve })
    vi.stubGlobal('fetch', (_input: string, init?: RequestInit) => {
      started()
      return waitForStop(init, aborted)
    })
    const { ctx, lines } = load([], config)
    await calling
    await ctx.fiber.dispose()
    await stopped
    await new Promise(resolve => setImmediate(resolve))
    expect(lines.filter(line => line.includes('the step failed'))).toEqual([])
  })
})

describe('createMyEpoWorker after a restart and with damaged files', () => {
  it('keeps a pair that the EPO refused before a restart refused, makes no call with it, and tests a new pair', async () => {
    const w = setup()
    w.link('not-the-secret')
    await w.worker.tick()
    expect(w.status().link).toBe('refused')
    const calls = w.epoCalls()
    const again = w.restart()
    await again.tick()
    expect(w.status().link).toBe('refused')
    expect(w.epoCalls()).toBe(calls)
    expect(w.lines.at(-1)).toMatch(/refused the saved pair of client flowleap-myepo-double before/)
    writeFileSync(join(w.dir, 'link.json'), JSON.stringify({ ...DOUBLE_CLIENT, linkedBy: 'admin', linkedAt: '2026-11-10T09:00:00.000Z' }), { mode: 0o600 })
    await again.tick()
    expect(w.status().link).toBe('linked')
  })

  it('tests a saved pair after a restart when the status before was not a refusal of that pair', async () => {
    const w = setup()
    w.link(DOUBLE_CLIENT.clientSecret)
    await w.worker.tick()
    writeFileSync(join(w.dir, 'status.json'), 'not json')
    const again = w.restart()
    await again.tick()
    expect(w.status().link).toBe('linked')
  })

  it('reports a damaged pair with a fixed text and never logs its content', async () => {
    const w = setup()
    writeFileSync(join(w.dir, 'link.json'), '{"clientId":"x","clientSecret":"public-sample-data"', { mode: 0o600 })
    writeFileSync(join(w.testsDir, `${'c'.repeat(32)}.json`), 'public-sample-data}', { mode: 0o600 })
    await w.worker.tick()
    expect(w.status().link).toBe('not-linked')
    expect(JSON.parse(readFileSync(join(w.testsDir, `${'c'.repeat(32)}.result.json`), 'utf8'))).toMatchObject({ kind: 'failed' })
    expect(w.lines.join('\n')).not.toContain('public-sample-data')
  })

  it('answers each test once when the test loop and a tick ask at the same time', async () => {
    const w = setup()
    writeFileSync(join(w.testsDir, `${'d'.repeat(32)}.json`), JSON.stringify(DOUBLE_CLIENT), { mode: 0o600 })
    await Promise.all([w.worker.answerTests(), w.worker.answerTests(), w.worker.tick()])
    expect(readdirSync(w.testsDir)).toEqual([`${'d'.repeat(32)}.result.json`])
    expect(w.lines.filter(line => line.startsWith('test '))).toHaveLength(1)
  })
})
