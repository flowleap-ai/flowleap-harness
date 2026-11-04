/**
 * The Ticket ingress over a real WebServer and the real webhook runtime, with fake Agents, presets, Workspaces, and a
 * Firm Record double: the HTTP answers, the run Session request, the run-started report, and the at-most-once Session per
 * delivery, also after a restart.
 */
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import type { RunStart, TicketId } from '@deepseek-ai/dsh-flowleap-record'
import WebhookRuntime from '@deepseek-ai/dsh-webhook'
import * as Ticket from '../src/index.ts'
import { DELIVERY, SECRET, sign } from './fixtures.ts'

const DEFAULTS = { source: 'firm-record', path: '/api/flowleap/ticket', secretRef: 'FLOWLEAP_TICKET_SECRET', maxBodyBytes: 65_536 }

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

/** The services the runtime and the ingress need, as fakes that record what the run asked for. */
async function host(stateDir: string, secret: string | null = SECRET) {
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
      return { recordSeq: 8 }
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
  const warn = vi.spyOn(ctx.logger, 'warn').mockImplementation(() => {})
  const fiber = ctx.plugin(Ticket, {
    ...DEFAULTS,
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
    expect(await readdir(stateDir)).toHaveLength(1)
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
    const { url } = await host(await tempDir(), null)
    expect((await post(url, BODY)).status).toBe(503)
  })

  it('fails loud at load for an unusable config, and removes the route when it unloads', async () => {
    const { ctx, fiber, url } = await host(await tempDir())
    const base = { ...DEFAULTS, stateDir: '/state', workspacePath: '/firm/runs', agentPreset: 'patent', permissionPreset: 'workspace-write', template: 'client-report.docx' }
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
