/**
 * The Ticket ingress over a real WebServer and the real webhook runtime, with fake Agents, presets, Workspaces, and a
 * Firm Record double: the HTTP answers, the run Session request, the run-started report, and the at-most-once Session per
 * delivery, also after a restart.
 */
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { brandNumber } from '@deepseek-ai/dsh-brand'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import type { RecordCommandResult, RecordSeq, RunStart, RunStartReceipt, TicketId } from '@deepseek-ai/dsh-flowleap-record'
import WebhookRuntime from '@deepseek-ai/dsh-webhook'
import * as Ticket from '../src/index.ts'
import { DELIVERY, SECRET, sign } from './fixtures.ts'

const DEFAULTS = { source: 'firm-record', path: '/api/flowleap/ticket', secretRef: 'FLOWLEAP_TICKET_SECRET', maxBodyBytes: 65_536 }

/** Wait until the server log has a line that matches. */
async function logged(warn: { mock: { calls: unknown[][] } }, pattern: RegExp): Promise<string> {
  let line = ''
  await vi.waitFor(() => {
    line = warn.mock.calls.map(([text]) => String(text)).find(text => pattern.test(text)) ?? ''
    expect(line).not.toBe('')
  })
  return line
}

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

interface Created {
  readonly title: string
  readonly prompt: string
  readonly workspace: string
  readonly agentPreset: string
  readonly permission: string
}

/** How the doubles behave: the secret, the answers of run-started in order (the last one repeats), and Session failures. */
interface HostOptions {
  readonly secret?: string | null
  readonly runStarted?: ReadonlyArray<RecordCommandResult<RunStartReceipt>>
  readonly failedCreates?: number
  readonly attempts?: number
}

/** The services the runtime and the ingress need, as fakes that record what the run asked for. */
async function host(stateDir: string, options: HostOptions = {}) {
  const secret = options.secret === undefined ? SECRET : options.secret
  const answers = options.runStarted ?? [{ recordSeq: seq(8) }]
  let failedCreates = options.failedCreates ?? 0
  const ctx = new Context()
  cleanups.push(async () => { await ctx.fiber.dispose() })
  const created: Created[] = []
  const runStarts: Array<{ ticket: TicketId; command: RunStart }> = []
  const sessionsReady = Promise.withResolvers<boolean>()
  let pending: Partial<Created> = {}
  ctx.provide('credentials', {
    resolve: async (ref: string) => ref === 'FLOWLEAP_TICKET_SECRET' && secret !== null ? { value: secret, source: 'environment' } : undefined,
  } as never)
  ctx.provide('flowleapRecord', {
    runStarted: async (ticket: TicketId, command: RunStart) => {
      runStarts.push({ ticket, command })
      sessionsReady.resolve(true)
      return answers[Math.min(runStarts.length, answers.length) - 1]
    },
  } as never)
  ctx.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'p', model: 'm' }) } as never)
  ctx.provide('permissionPresets', {
    resolve: () => ({}),
    set: (_session: unknown, name: string) => { pending = { ...pending, permission: name } },
  } as never)
  ctx.provide('agentPresets', {
    resolve: async (id: string) => ({ id }),
    acquireScope: async () => ({ key: {}, [Symbol.asyncDispose]: async () => {} }),
    mount: async (_agentCtx: unknown, id: string) => { pending = { ...pending, agentPreset: id } },
  } as never)
  ctx.provide('workspaceRegistry', {
    create: async (path: string) => {
      pending = { ...pending, workspace: path }
      return { path, attachSession: async () => {}, detachSession: async () => {} }
    },
  } as never)
  ctx.provide('sessionTitle', { rename: (_session: unknown, title: string) => { pending = { ...pending, title } } } as never)
  ctx.provide('agents', {
    create: async (options: { setup?: (agentCtx: unknown, agent: unknown) => Promise<void> }) => {
      if (failedCreates > 0) {
        failedCreates--
        throw new Error('the model provider is not configured')
      }
      const agent = {
        session: {},
        followup: (message: { content: Array<{ text: string }> }) => {
          created.push({ ...pending, prompt: message.content[0]?.text ?? '' } as Created)
          pending = {}
        },
      }
      await options.setup?.({ on: () => () => {} }, agent)
      return { agent, dispose: async () => {} }
    },
  } as never)
  await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
  await ctx.plugin(WebhookRuntime)
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  cleanups.push(async () => { warn.mockRestore() })
  vi.spyOn(ctx.logger, 'warn').mockImplementation(() => {})
  const fiber = ctx.plugin(Ticket, {
    ...DEFAULTS,
    runStartedAttempts: options.attempts ?? 3,
    runStartedBackoffMs: 1,
    stateDir,
    workspacePath: '/firm/runs',
    agentPreset: 'patent',
    permissionPreset: 'workspace-write',
    template: 'client-report.docx',
  })
  await fiber.await()
  const url = `http://127.0.0.1:${String(ctx.webServer.port)}/api/flowleap/ticket`
  return { ctx, fiber, url, created, runStarts, sessionsReady: sessionsReady.promise, warn }
}

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'flowleap-ticket-'))
  cleanups.push(async () => { await rm(dir, { recursive: true, force: true }) })
  return dir
}

function post(url: string, body: string, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-flowleap-signature': sign(body), 'x-flowleap-delivery': 'tk-1/1', ...headers },
    body,
  })
}

const BODY = JSON.stringify(DELIVERY)
const seq = (value: number): RecordSeq => brandNumber<RecordSeq>(value)

describe('the Ticket ingress', () => {
  it('opens one run Session with the Mandate first and reports run-started with its Session', async () => {
    const stateDir = await tempDir()
    const { url, created, runStarts, sessionsReady } = await host(stateDir)
    const response = await post(url, BODY)
    expect(response.status).toBe(202)
    await sessionsReady
    expect(created).toHaveLength(1)
    const [run] = created as [Created]
    expect(run).toMatchObject({
      title: 'Report to the client, FL-2026-0001', workspace: '/firm/runs', agentPreset: 'patent', permission: 'workspace-write',
    })
    expect(run.prompt.startsWith('Mandate: you work for the responsible attorney of this matter. Analyse and draft; never file, send or pay.')).toBe(true)
    expect(run.prompt).toContain('"client-report.docx"')
    expect(run.prompt).toContain(`ticket_delivery_json: ${BODY}`)
    expect(runStarts).toHaveLength(1)
    expect(runStarts[0]?.ticket).toBe('tk-1')
    expect(runStarts[0]?.command.session).toMatch(/^webhook-/u)
    await vi.waitFor(async () => { expect(await readdir(stateDir)).toHaveLength(1) })
  })

  it('answers a repeat of the delivery with 200 and opens no second Session, also after a restart', async () => {
    const stateDir = await tempDir()
    const first = await host(stateDir)
    const [one, two] = await Promise.all([post(first.url, BODY), post(first.url, BODY)])
    expect([one.status, two.status].sort()).toEqual([200, 202])
    await first.sessionsReady
    expect((await post(first.url, BODY)).status).toBe(200)
    await first.fiber.dispose()
    const second = await host(stateDir)
    expect((await post(second.url, BODY)).status).toBe(200)
    expect(first.created).toHaveLength(1)
    expect(second.created).toHaveLength(0)
    expect(second.runStarts).toHaveLength(0)
  })

  it('gives the claim back when the run Session cannot be created, so a repeat of the delivery opens it', async () => {
    const stateDir = await tempDir()
    const { url, created, runStarts, warn } = await host(stateDir, { failedCreates: 1 })
    expect((await post(url, BODY)).status).toBe(202)
    const line = await logged(warn, /no run Session opened/u)
    expect(line).toBe('flowleap-ticket: no run Session opened for delivery "tk-1/1": Error: the model provider is not configured')
    expect(await readdir(stateDir)).toEqual([])
    expect((await post(url, BODY)).status).toBe(202)
    await vi.waitFor(() => { expect(runStarts).toHaveLength(1) })
    expect(created).toHaveLength(1)
    await vi.waitFor(async () => { expect(await readdir(stateDir)).toHaveLength(1) })
  })

  it('gives the claim back and records nothing when the Firm Record refuses run-started', async () => {
    const stateDir = await tempDir()
    const { url, created, runStarts, warn } = await host(stateDir, { runStarted: [{ error: 'ticket_not_waking' }, { recordSeq: seq(9) }] })
    expect((await post(url, BODY)).status).toBe(202)
    const line = await logged(warn, /did not accept run-started/u)
    expect(line).toContain('for delivery "tk-1/1": ticket_not_waking')
    expect(runStarts).toHaveLength(1)
    expect(await readdir(stateDir)).toEqual([])
    expect((await post(url, BODY)).status).toBe(202)
    await vi.waitFor(async () => { expect(await readdir(stateDir)).toHaveLength(1) })
    expect(created).toHaveLength(2)
    expect((await post(url, BODY)).status).toBe(200)
  })

  it('sends run-started again with the same Session while the Firm Record is unreachable or answers 5xx, then records the delivery', async () => {
    const stateDir = await tempDir()
    const { url, runStarts } = await host(stateDir, { runStarted: [{ error: 'unreachable' }, { error: 'service_error' }, { recordSeq: seq(8) }] })
    expect((await post(url, BODY)).status).toBe(202)
    await vi.waitFor(async () => { expect(await readdir(stateDir)).toHaveLength(1) })
    expect(runStarts).toHaveLength(3)
    expect(new Set(runStarts.map(entry => entry.command.session)).size).toBe(1)
  })

  it('stops after runStartedAttempts sends to an unreachable Firm Record and gives the claim back', async () => {
    const stateDir = await tempDir()
    const { url, runStarts, warn } = await host(stateDir, { runStarted: [{ error: 'unreachable' }], attempts: 2 })
    expect((await post(url, BODY)).status).toBe(202)
    expect(await logged(warn, /did not accept run-started/u)).toContain(': unreachable;')
    expect(runStarts).toHaveLength(2)
    expect(await readdir(stateDir)).toEqual([])
    expect((await post(url, BODY)).status).toBe(202)
  })

  it('logs a ledger that cannot be written after the Firm Record accepted the Session', async () => {
    const dir = await tempDir()
    const stateDir = join(dir, 'state')
    const { url, runStarts, warn } = await host(stateDir)
    await writeFile(stateDir, '')
    expect((await post(url, BODY)).status).toBe(503)
    await rm(stateDir)
    vi.spyOn(Ticket.DeliveryLedger.prototype, 'record').mockRejectedValueOnce(new Error('disk full'))
    expect((await post(url, BODY)).status).toBe(202)
    expect(await logged(warn, /ledger did not record/u)).toBe('flowleap-ticket: the ledger did not record delivery "tk-1/1": Error: disk full')
    expect(runStarts).toHaveLength(1)
    expect(await logged(warn, /request failed/u)).toBe('flowleap-ticket: request failed')
  })

  it('answers 503 and gives the claim back when the dispatch is unavailable', async () => {
    const stateDir = await tempDir()
    const { ctx, url, created, warn } = await host(stateDir)
    const dispatch = vi.spyOn(ctx.webhookRuntime, 'dispatch').mockImplementationOnce(() => { throw new Error('webhook runtime is closing') })
    expect((await post(url, BODY)).status).toBe(503)
    expect(await logged(warn, /dispatch/u)).toBe('flowleap-ticket: dispatch unavailable')
    dispatch.mockRestore()
    expect((await post(url, BODY)).status).toBe(202)
    await vi.waitFor(() => { expect(created).toHaveLength(1) })
  })

  it('refuses a wrong signature with 401 and logs one line without the body or the secret', async () => {
    const { url, created, warn } = await host(await tempDir())
    const response = await post(url, BODY, { 'x-flowleap-signature': sign(BODY, 'not-the-secret') })
    expect(response.status).toBe(401)
    expect(warn).toHaveBeenCalledOnce()
    const line = String(warn.mock.calls[0]?.[0])
    expect(line).toContain('wrong signature')
    expect(line).not.toContain(SECRET)
    expect(line).not.toContain('FL-2026-0001')
    expect(created).toEqual([])
  })

  it('answers each invalid request with its status before any dispatch', async () => {
    const { url, created } = await host(await tempDir())
    const unknownCode = JSON.stringify({ ...DELIVERY, events: [{ ...DELIVERY.events[0], code: 'EPO:R70(2)' }] })
    const cases: Array<[Promise<Response>, number]> = [
      [fetch(url), 405],
      [post(url, BODY, { 'content-type': 'text/plain' }), 415],
      [post(url, BODY, { 'x-flowleap-delivery': 'tk-1/2' }), 400],
      [post(url, 'not json'), 400],
      [post(url, JSON.stringify({ ...DELIVERY, events: [] })), 400],
      [post(url, unknownCode), 422],
      [post(url, `{"pad":"${'x'.repeat(70_000)}"}`), 413],
    ]
    for (const [pending, status] of cases) expect((await pending).status).toBe(status)
    const unsigned = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-flowleap-delivery': 'tk-1/1' }, body: BODY })
    expect(unsigned.status).toBe(400)
    expect(created).toEqual([])
  })

  it('answers 503 without the secret', async () => {
    const { url } = await host(await tempDir(), { secret: null })
    expect((await post(url, BODY)).status).toBe(503)
  })

  it('fails loud at load for an unusable config, and removes the route when it unloads', async () => {
    const { ctx, fiber, url } = await host(await tempDir())
    const base = { ...DEFAULTS, runStartedAttempts: 3, runStartedBackoffMs: 1, stateDir: '/state', workspacePath: '/firm/runs', agentPreset: 'patent', permissionPreset: 'workspace-write', template: 'client-report.docx' }
    for (const [patch, message] of [
      [{ stateDir: 'state' }, /stateDir must be an absolute path/u],
      [{ workspacePath: 'runs' }, /workspacePath must be an absolute path/u],
      [{ template: 'templates/client-report.docx' }, /template must be a .docx file name/u],
      [{ path: '/api/flowleap/ticket/' }, /path must be/u],
      [{ source: ' firm' }, /source must be/u],
    ] as const) {
      await expect(ctx.plugin(Ticket, { ...base, ...patch, path: 'path' in patch ? patch.path : '/other' })).rejects.toThrow(message)
    }
    await fiber.dispose()
    expect((await post(url, BODY)).status).toBe(404)
  })
})
