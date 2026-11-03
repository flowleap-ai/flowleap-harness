import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import FlowleapRecordHttp from '../src/http.ts'
import type { FlowleapRecord, MatterFileNumber, MatterViewResult } from '../src/types.ts'
import { VIEW } from './fixtures/record-read/view.ts'

const TOKEN = 'rt-runtime-record-token'
const FILE = brandString<MatterFileNumber>('FL-2026-0001')
const servers: Server[] = []
const contexts: Context[] = []

afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  await Promise.all(servers.splice(0).map(server => new Promise((resolve) => { server.close(resolve) })))
  vi.restoreAllMocks()
})

/** A Firm Record double that answers each request with `handler`; it records the bearer token and the path it received. */
async function record(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<{ url: string; tokens: string[]; paths: string[] }> {
  const tokens: string[] = []
  const paths: string[] = []
  const server = createServer((request, response) => {
    tokens.push(request.headers.authorization ?? '')
    paths.push(request.url ?? '')
    handler(request, response)
  })
  servers.push(server)
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  return { url: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`, tokens, paths }
}

function json(status: number, body: unknown) {
  return (_request: IncomingMessage, response: ServerResponse) => {
    response.writeHead(status, { 'content-type': 'application/json' })
    response.end(typeof body === 'string' ? body : JSON.stringify(body))
  }
}

/** Mount the provider with a credential store double that knows only `FLOWLEAP_RECORD_TOKEN`. */
async function provider(config: { url: string; timeoutMs?: number; key?: string | undefined }): Promise<FlowleapRecord> {
  const ctx = new Context()
  contexts.push(ctx)
  ctx.provide('credentials', {
    resolve: async (ref: string) => ref === 'FLOWLEAP_RECORD_TOKEN' && config.key !== undefined ? { value: config.key } : undefined,
  } as never)
  await ctx.plugin(FlowleapRecordHttp, { baseURL: config.url, apiKeyRef: 'FLOWLEAP_RECORD_TOKEN', timeoutMs: config.timeoutMs ?? 5000 })
  return ctx.get('flowleapRecord')!
}

const read = (service: FlowleapRecord, fileNumber = FILE): Promise<MatterViewResult> =>
  service.matterView(fileNumber, new AbortController().signal)

describe('flowleapRecord.matterView over HTTP', () => {
  it('reads the view of the matter with the record token and keeps the record position', async () => {
    const double = await record(json(200, VIEW))
    const service = await provider({ url: double.url, key: TOKEN })
    expect(await read(service)).toEqual(VIEW)
    expect(double.tokens).toEqual([`Bearer ${TOKEN}`])
    expect(double.paths).toEqual(['/records/api/matters/FL-2026-0001/view'])
  })

  it('reads on the origin of the base URL and encodes the file number', async () => {
    const double = await record(json(200, VIEW))
    const service = await provider({ url: `${double.url}/records/`, key: TOKEN })
    await read(service, brandString<MatterFileNumber>('P 12/EP'))
    expect(double.paths).toEqual(['/records/api/matters/P%2012%2FEP/view'])
  })

  it('reports the refusal, never a view, without an address or a token', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    expect(await read(await provider({ url: '', key: TOKEN }))).toEqual({ error: 'not_configured' })
    expect(await read(await provider({ url: 'http://127.0.0.1:9', key: undefined }))).toEqual({ error: 'no_key' })
    expect(await read(await provider({ url: 'http://127.0.0.1:9', key: '' }))).toEqual({ error: 'no_key' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('reports no_key and logs one line when the credential store fails', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    ctx.provide('credentials', { resolve: async () => { throw new Error('store locked') } } as never)
    await ctx.plugin(FlowleapRecordHttp, { baseURL: 'http://127.0.0.1:9', apiKeyRef: 'FLOWLEAP_RECORD_TOKEN', timeoutMs: 5000 })
    const warn = vi.spyOn(ctx.logger, 'warn').mockImplementation(() => {})
    expect(await read(ctx.get('flowleapRecord')!)).toEqual({ error: 'no_key' })
    expect(warn).toHaveBeenCalledOnce()
  })

  it('reports a missing matter, a refused token, an error status, an empty answer, a redirect, a slow service or body, and a closed port', async () => {
    const warn = vi.fn()
    for (const [handler, error] of [
      [json(404, { error: 'not-found' }), 'not_found'],
      [json(401, { error: 'no identity' }), 'refused'],
      [json(403, { error: 'agent-cannot-decide' }), 'refused'],
      [json(500, { error: 'down' }), 'service_error'],
      [(_request: IncomingMessage, response: ServerResponse) => { response.writeHead(204).end() }, 'invalid_answer'],
      [json(502, 'bad gateway'), 'service_error'],
      [(_request: IncomingMessage, response: ServerResponse) => { response.writeHead(302, { location: 'http://127.0.0.1:9/' }).end() }, 'unreachable'],
      [(_request: IncomingMessage, response: ServerResponse) => { response.writeHead(200, { 'content-type': 'application/json' }).write('{"recordSeq":') }, 'unreachable'],
      [() => { /* never answers */ }, 'unreachable'],
    ] as const) {
      const double = await record(handler)
      const service = await provider({ url: double.url, key: TOKEN, timeoutMs: 200 })
      vi.spyOn(contexts.at(-1)!.logger, 'warn').mockImplementation(warn)
      expect(await read(service)).toEqual({ error })
    }
    const closed = await record(json(200, {}))
    await new Promise((resolve) => { servers.pop()!.close(resolve) })
    const service = await provider({ url: closed.url, key: TOKEN })
    vi.spyOn(contexts.at(-1)!.logger, 'warn').mockImplementation(warn)
    expect(await read(service)).toEqual({ error: 'unreachable' })
    expect(warn.mock.calls.map(([line]) => String(line)).join('\n')).not.toContain(TOKEN)
  })

  it('rejects when the caller ends the read', async () => {
    const double = await record(() => { /* never answers */ })
    const service = await provider({ url: double.url, key: TOKEN })
    const controller = new AbortController()
    const pending = service.matterView(FILE, controller.signal)
    controller.abort()
    await expect(pending).rejects.toThrow()
  })

  it('reports an answer that is not a matter view as invalid', async () => {
    const [deadline] = VIEW.deadlines
    for (const body of [
      'not json',
      { ...VIEW, recordSeq: -1 },
      { ...VIEW, recordSeq: '7' },
      { ...VIEW, viewHash: 'abc' },
      { ...VIEW, matter: { ...VIEW.matter, state: 'pending' } },
      { ...VIEW, deadlines: [{ ...deadline, due: '2 March 2026' }] },
      { ...VIEW, deadlines: [{ ...deadline, state: 'confirmed' }] },
      { ...VIEW, deadlines: [{ ...deadline, trace: [{ op: 'start', from: '2025-10-30' }] }] },
      { recordSeq: 7 },
    ]) {
      const double = await record(json(200, body))
      expect(await read(await provider({ url: double.url, key: TOKEN }))).toEqual({ error: 'invalid_answer' })
    }
  })

  it('reports a body above 1 MiB as invalid without reading the rest', async () => {
    const double = await record(json(200, `{"recordSeq":7,"pad":"${'x'.repeat(1_100_000)}"}`))
    expect(await read(await provider({ url: double.url, key: TOKEN }))).toEqual({ error: 'invalid_answer' })
  })

  it('fails loud at load for a base URL that may leak the token or an invalid token reference', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    ctx.provide('credentials', { resolve: async () => undefined } as never)
    const load = (baseURL: string, apiKeyRef = 'FLOWLEAP_RECORD_TOKEN') =>
      ctx.plugin(FlowleapRecordHttp, { baseURL, apiKeyRef, timeoutMs: 5000 })
    for (const url of ['file:///etc/passwd', 'not a url', 'http://record.example.com', 'http://10.0.0.5:8091']) {
      await expect(load(url)).rejects.toThrow(/https URL/u)
    }
    await expect(load('', 'not-a-name')).rejects.toThrow(/credential ref/u)
    for (const url of ['https://record.example.com', 'http://flowleap-record:8091', 'http://localhost:8091', 'http://[::1]:8091', 'http://127.0.0.1:8091']) {
      const fiber = await load(url)
      await fiber.dispose()
    }
  })
})
