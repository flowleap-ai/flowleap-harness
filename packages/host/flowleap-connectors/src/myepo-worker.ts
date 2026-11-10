/**
 * The firm worker's MyEPO job (process atlas sheet 6; ADR 0003): the one firm process that holds the firm's MyEPO pair,
 * tests a new pair for the Firm admin console, reads the firm's Mailbox with the letter reader of `myepo-reader.ts` and
 * sends each letter to the intake of the Firm Record. The `flowleap-firm-worker` profile mounts this row alone: no model,
 * no tool, no chat store and no listening port.
 *
 * The row reads and writes two host folders and nothing else:
 *
 * - `dir`, readable by the worker's account only: `link.json` (the pair that the console saved, mode 600), `intake-token`
 *   (the Firm Record's intake token, mode 600), and `status.json`, which the worker writes: the link state, the readable
 *   portfolios, the last test, the last successful read and the last failure, never a secret.
 * - `testsDir`, on a memory file system of the host: `<id>.json` holds a pair to test; the worker deletes it at once, tests
 *   the pair, and writes `<id>.result.json` with the test outcome and no secret. The worker never saves a pair.
 *
 * The worker makes no MyEPO call while no pair is saved or after the EPO refused the saved pair; a new `link.json` starts
 * it again. It never writes to MyEPO: the client has no write operation.
 * @module @deepseek-ai/dsh-flowleap-connectors/myepo-worker
 */

import { createHash } from 'node:crypto'
import { statSync } from 'node:fs'
import { readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { parseCmdline } from '@deepseek-ai/dsh-cmdline'
import { Command } from 'commander'
import z from '@deepseek-ai/schemastery'
import { z as zod } from 'zod'
import {
  createMyEpoClient, createRequestGate, describeFailure, MyEpoError, testMyEpoLink,
  type MyEpoCredentials, type MyEpoEndpoint, type RequestGate,
} from './myepo-client.ts'
import { createMyEpoLetterIntake, MyEpoIntakeError, readMyEpoLetters, type MyEpoLetterIntake } from './myepo-reader.ts'
import type { MyEpoCommunicationId } from './myepo-wire.ts'
import type { MyEpoPortfolioView, MyEpoTestOutcome } from './types.ts'

/** Cordis plugin name. */
export const name = 'flowleap-myepo-worker'

/** The launcher's command line: the worker answers `--help` and starts only on a parsed invocation. */
export const inject = ['cmdlineArgs']

/** Plugin config. */
export interface Config {
  /** The worker's host folder: `link.json`, `intake-token` and `status.json`. */
  dir: string
  /** The folder of the console's test requests, on a memory file system. */
  testsDir: string
  /** The API base of the Firm Record, for example `http://flowleap-record:8091/records/api/`. */
  recordUrl: string
  /** Where the worker calls MyEPO and how fast; the defaults are the EPO's production services. */
  myepo: MyEpoEndpoint
  /** When a letter is downloaded; only `on-arrival` is built. A download marks the letter as read in the firm's MyEPO. */
  download: 'on-arrival'
  /** Seconds between two reads of the unhandled letters. */
  everySeconds: number
  /** Seconds between two tests of the saved pair. */
  testEverySeconds: number
  /** Seconds between two looks at the folders for a new pair or a test request. */
  pollSeconds: number
}

/** Runtime schema for the row. */
export const Config: z<Config> = z.object({
  dir: z.string().required(),
  testsDir: z.string().required(),
  recordUrl: z.string().required(),
  myepo: z.object({
    baseUrl: z.string().default('https://api.apps.epo.org/latest'),
    tokenUrl: z.string().default('https://login.epo.org/oauth2/aus6hh2ns9ORf2PD3417/v1/token'),
    // Sheet 6, myepo.requestsPerSecond: the EPO publishes no limit.
    requestsPerSecond: z.number().min(0.1).max(50).default(2),
    timeoutSeconds: z.number().min(1).max(300).default(30),
  }),
  download: z.const('on-arrival').default('on-arrival'),
  // Sheet 6, myepo.unhandledEvery: 15 minutes.
  everySeconds: z.number().step(1).min(1).max(86_400).default(900),
  // Sheet 6, myepo.testEvery: 1 hour.
  testEverySeconds: z.number().step(1).min(60).max(86_400).default(3600),
  pollSeconds: z.number().step(1).min(1).max(60).default(2),
})

/**
 * The link state of `status.json`. `checking`: a pair is saved and its first test since the worker started has no
 * answer yet. `permission-missing`: the EPO gave a token, but the account may read no portfolio or not the Mailbox.
 * `refused`: the EPO refused the saved pair; the worker makes no call until a new pair is saved.
 */
export type MyEpoLinkState = 'not-linked' | 'checking' | 'linked' | 'permission-missing' | 'refused'

/** `status.json`: what the console shows of the link. It holds no secret. */
export interface MyEpoWorkerStatus {
  readonly v: 1
  readonly link: MyEpoLinkState
  readonly clientId: string | null
  /** The administrator who saved the pair, and when. */
  readonly linkedBy: string | null
  readonly linkedAt: string | null
  /** The portfolios of the last passed test. */
  readonly portfolios: readonly MyEpoPortfolioView[] | null
  /** Whether the Mailbox answered at the last passed test. */
  readonly mailbox: boolean | null
  readonly testedAt: string | null
  /** The end of the last read of the Mailbox that had no failure. */
  readonly lastReadAt: string | null
  /** The last failed test or read since the last good one; `since` is the first failure of the series. */
  readonly failure: { readonly at: string; readonly since: string; readonly message: string } | null
}

const linkSchema = zod.object({
  clientId: zod.string().trim().min(1),
  clientSecret: zod.string().trim().min(1),
  linkedBy: zod.string().min(1),
  linkedAt: zod.iso.datetime(),
})
type SavedLink = zod.infer<typeof linkSchema>
const testRequestSchema = zod.object({ clientId: zod.string().trim().min(1), clientSecret: zod.string().trim().min(1) })
const TEST_REQUEST = /^([0-9a-f]{32})\.json$/

/** The longest wait after failed reads, as a multiple of `everySeconds`. */
const MAX_BACKOFF_STEPS = 6

/**
 * Read a secret file of the worker: present, not empty, and readable by its owner only.
 * @param file - the path.
 * @returns the content, or `undefined` when the file does not exist.
 * @throws Error when other accounts can read the file.
 */
async function readSecretFile(file: string): Promise<string | undefined> {
  let mode: number
  try {
    mode = (await stat(file)).mode
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
  if ((mode & 0o077) !== 0) throw new Error(`${file} is readable by other accounts (mode ${(mode & 0o777).toString(8)})`)
  return readFile(file, 'utf8')
}

/** Write a file whole, so that a reader never sees half of it. */
async function writeWhole(file: string, content: string): Promise<void> {
  const tmp = `${file}.${process.pid}.tmp`
  await writeFile(tmp, content, { mode: 0o600 })
  await rename(tmp, file)
}

/** The worker's view of one saved pair: its fingerprint and when it is next tested and read. */
interface Schedule {
  readonly fingerprint: string
  nextTest: number
  nextRead: number
  failedReads: number
}

/** What one worker needs; specs pass a fake network and clock. */
export interface MyEpoWorkerOptions {
  readonly config: Config
  readonly fetch: typeof fetch
  readonly now: () => number
  readonly log: (line: string) => void
}

/** One worker: `tick` does the work that is due, and `close` cancels the call in progress. */
export interface MyEpoWorker {
  /** Answer the waiting test requests, notice a new or removed pair, then test and read as the schedule says. */
  tick(): Promise<void>
  close(): void
}

/**
 * Create the worker over its folders.
 * @param options - the row config, the network, the clock and the log.
 * @returns the worker.
 */
export function createMyEpoWorker(options: MyEpoWorkerOptions): MyEpoWorker {
  const { config, now, log } = options
  const gate: RequestGate = createRequestGate(config.myepo.requestsPerSecond, now)
  const abort = new AbortController()
  const iso = (): string => new Date(now()).toISOString()
  const clientOf = (credentials: MyEpoCredentials) =>
    createMyEpoClient({ endpoint: config.myepo, credentials: () => Promise.resolve(credentials), gate, fetch: options.fetch, now })

  let status: MyEpoWorkerStatus = {
    v: 1, link: 'not-linked', clientId: null, linkedBy: null, linkedAt: null, portfolios: null, mailbox: null,
    testedAt: null, lastReadAt: null, failure: null,
  }
  let written = ''
  let schedule: Schedule | undefined
  let intake: MyEpoLetterIntake | undefined
  /** Letters that the Firm Record has: no new send while this process runs. */
  const settled = new Set<MyEpoCommunicationId>()

  const update = (change: Partial<MyEpoWorkerStatus>): void => {
    status = { ...status, ...change }
  }
  const fail = (message: string): void => {
    update({ failure: { at: iso(), since: status.failure?.since ?? iso(), message } })
  }
  const flush = async (): Promise<void> => {
    const content = `${JSON.stringify(status)}\n`
    if (content === written) return
    await writeWhole(join(config.dir, 'status.json'), content)
    written = content
  }

  const answerTests = async (): Promise<void> => {
    let names: string[]
    try {
      names = await readdir(config.testsDir)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }
    for (const file of names.sort()) {
      const id = TEST_REQUEST.exec(file)?.[1]
      if (id === undefined) continue
      const path = join(config.testsDir, file)
      const body = await readSecretFile(path).catch((error: unknown) => {
        log(`test ${id}: the request cannot be read: ${(error as Error).message}`)
        return undefined
      })
      // The pair leaves the disk before the test starts.
      await rm(path, { force: true })
      if (body === undefined) continue
      const pair = testRequestSchema.safeParse(JSON.parse(body))
      const outcome: MyEpoTestOutcome = pair.success
        ? await testMyEpoLink(clientOf(pair.data), now, abort.signal)
        : { kind: 'failed', message: 'the test request has no client ID or no client secret' }
      log(`test ${id}: ${outcome.kind}`)
      await writeWhole(join(config.testsDir, `${id}.result.json`), `${JSON.stringify(outcome)}\n`)
    }
  }

  const readLink = async (): Promise<{ readonly link: SavedLink; readonly fingerprint: string } | 'absent' | 'unreadable'> => {
    let body: string | undefined
    try {
      body = await readSecretFile(join(config.dir, 'link.json'))
    } catch (error) {
      log(`the saved pair cannot be read: ${(error as Error).message}`)
      return 'unreadable'
    }
    if (body === undefined) return 'absent'
    const parsed = linkSchema.safeParse(JSON.parse(body))
    if (!parsed.success) {
      log('the saved pair has no client ID or no client secret')
      return 'unreadable'
    }
    return { link: parsed.data, fingerprint: createHash('sha256').update(body).digest('hex') }
  }

  /** Apply one test of the saved pair to the link state. */
  const testSaved = async (link: SavedLink, due: Schedule): Promise<void> => {
    const outcome = await testMyEpoLink(clientOf(link), now, abort.signal)
    due.nextTest = now() + config.testEverySeconds * 1000
    switch (outcome.kind) {
      case 'passed': {
        const missing = outcome.portfolios.length === 0 || !outcome.mailbox
        update({ link: missing ? 'permission-missing' : 'linked', portfolios: outcome.portfolios, mailbox: outcome.mailbox, testedAt: outcome.testedAt })
        return
      }
      case 'refused':
        // myepo.stops-when-not-readable: no new login with this pair.
        update({ link: 'refused' })
        log('the EPO refused the saved pair; no MyEPO call until a new pair is saved')
        return
      case 'unreachable':
      case 'failed':
        fail(outcome.kind === 'unreachable' ? describeFailure({ kind: 'unreachable' }) : outcome.message)
        due.nextTest = now() + config.everySeconds * 1000
        return
      case 'not-linked':
        return
    }
  }

  const read = async (link: SavedLink, due: Schedule): Promise<void> => {
    if (intake === undefined) {
      const token = (await readSecretFile(join(config.dir, 'intake-token')))?.trim()
      if (token === undefined || token === '') {
        fail('the intake token of the Firm Record is missing')
        return
      }
      intake = createMyEpoLetterIntake({ url: config.recordUrl, token, fetch: options.fetch })
    }
    try {
      const pass = await readMyEpoLetters({ reads: clientOf(link), intake, mode: config.download, now, settled })
      for (const { id, answer, listOnly } of pass.delivered) {
        log(`letter ${id}: ${answer.state}${answer.matter === null ? '' : ` on ${answer.matter}`}${answer.reason === null ? '' : ` (${answer.reason})`}${listOnly ? ', list data only' : ''}`)
      }
      for (const id of pass.alreadyStored) log(`letter ${id}: the Firm Record has its PDF from the mail; not sent again`)
      for (const { id, reason } of pass.failed) log(`letter ${id} not taken, the next read tries again: ${reason}`)
      update({ lastReadAt: iso(), failure: pass.failed.length === 0 ? null : status.failure })
      if (pass.failed.length > 0) fail(`${pass.failed.length} letters were not taken; the next read tries again`)
      due.failedReads = 0
    } catch (error) {
      if (error instanceof MyEpoError && error.failure.kind === 'refused') {
        update({ link: 'refused' })
        log('the EPO refused the saved pair; no MyEPO call until a new pair is saved')
        return
      }
      if (error instanceof MyEpoError && error.failure.kind === 'no-permission') update({ link: 'permission-missing' })
      if (!(error instanceof MyEpoError || error instanceof MyEpoIntakeError)) throw error
      due.failedReads += 1
      fail(error.message)
      log(`the read failed, the next read tries again: ${error.message}`)
    }
    const steps = 2 ** Math.min(due.failedReads, MAX_BACKOFF_STEPS)
    due.nextRead = now() + config.everySeconds * 1000 * (due.failedReads === 0 ? 1 : steps)
  }

  return {
    async tick() {
      await answerTests()
      const saved = await readLink()
      if (saved === 'absent' || saved === 'unreadable') {
        if (schedule !== undefined) log(saved === 'absent' ? 'the pair was removed; MyEPO is not linked' : 'the saved pair is not usable; MyEPO is not linked')
        schedule = undefined
        settled.clear()
        update({ link: 'not-linked', clientId: null, linkedBy: null, linkedAt: null, portfolios: null, mailbox: null, testedAt: null, failure: null })
        await flush()
        return
      }
      const { link, fingerprint } = saved
      if (schedule?.fingerprint !== fingerprint) {
        log(`a pair is saved for client ${link.clientId}; testing it`)
        schedule = { fingerprint, nextTest: 0, nextRead: 0, failedReads: 0 }
        update({ link: 'checking', clientId: link.clientId, linkedBy: link.linkedBy, linkedAt: link.linkedAt, portfolios: null, mailbox: null, testedAt: null, failure: null })
      }
      const due = schedule
      if (status.link !== 'refused' && now() >= due.nextTest) await testSaved(link, due)
      if ((status.link === 'linked' || status.link === 'permission-missing') && status.mailbox === true && now() >= due.nextRead) await read(link, due)
      await flush()
    },
    close() {
      abort.abort(new Error('the worker stops'))
    },
  }
}

/** The worker's command line: no option but `--help`. */
function workerCommand(): Command {
  return new Command()
    .name('dsh --profile flowleap-firm-worker')
    .description('Read the firm\'s MyEPO Mailbox and send each new letter to the Firm Record, until SIGTERM.')
    .helpOption('-h, --help', 'show this help')
    .addHelpText('after', `
The firm OS sets the folders, the Firm Record and the MyEPO endpoint with a --patch file.

Example:
  dsh --profile flowleap-firm-worker --patch worker.patch.yml
`)
}

/** Check one folder of the row at load: a missing folder is a misconfiguration, not a state to wait in. */
function assertFolder(field: string, path: string): void {
  if (!statSync(path, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`flowleap-myepo-worker: ${field} ${path} is not a folder`)
}

/** Check one address of the row at load. */
function assertAddress(field: string, value: string): void {
  const url = URL.parse(value)
  if (url === null || (url.protocol !== 'https:' && url.protocol !== 'http:')) throw new Error(`flowleap-myepo-worker: ${field} ${value} is not an http or https address`)
}

/**
 * Run the worker: one tick every `pollSeconds`, never two at the same time, until the row is disposed.
 * @param ctx - the row's context, with the launcher's command line.
 * @param config - the row config.
 */
export function apply(ctx: Context, config: Config): void {
  const program = workerCommand()
  program.action(() => {
    assertFolder('dir', config.dir)
    assertFolder('testsDir', config.testsDir)
    assertAddress('recordUrl', config.recordUrl)
    assertAddress('myepo.baseUrl', config.myepo.baseUrl)
    assertAddress('myepo.tokenUrl', config.myepo.tokenUrl)
    start(ctx, config)
  })
  parseCmdline(ctx, program)
}

function start(ctx: Context, config: Config): void {
  const log = (line: string): void => {
    console.log(`flowleap-myepo-worker: ${line}`)
  }
  ctx.effect(() => {
    const worker = createMyEpoWorker({ config, fetch: globalThis.fetch.bind(globalThis), now: Date.now, log })
    let timer: NodeJS.Timeout | undefined
    let stopped = false
    const run = async (): Promise<void> => {
      try {
        await worker.tick()
      } catch (error) {
        if (!stopped) log(`the step failed, the next step tries again: ${error instanceof Error ? error.message : String(error)}`)
      }
      if (!stopped) timer = setTimeout(() => void run(), config.pollSeconds * 1000)
    }
    log(`reads ${config.myepo.baseUrl}, downloads ${config.download}, sends to ${config.recordUrl}`)
    void run()
    return () => {
      stopped = true
      clearTimeout(timer)
      worker.close()
    }
  }, 'flowleap-myepo-worker: the MyEPO job')
}
