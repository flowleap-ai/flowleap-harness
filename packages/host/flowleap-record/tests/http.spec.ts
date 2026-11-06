import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { brandNumber, brandString } from '@deepseek-ai/dsh-brand'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import FlowleapRecordHttp, { idempotencyKey } from '../src/http.ts'
import type {
  DeadlineId, FlowleapRecord, MatterFileNumber, MatterViewResult, RecordSeq, ReportProposal, TicketId,
} from '../src/types.ts'
import { LETTER_SHA256, VIEW } from './fixtures/record-read/view.ts'

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
): Promise<{ url: string; tokens: string[]; paths: string[]; requests: Array<{ method: string; key: string; body: string }> }> {
  const tokens: string[] = []
  const paths: string[] = []
  const requests: Array<{ method: string; key: string; body: string }> = []
  const server = createServer((request, response) => {
    tokens.push(request.headers.authorization ?? '')
    paths.push(request.url ?? '')
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    request.on('end', () => {
      requests.push({
        method: request.method ?? '', key: String(request.headers['idempotency-key'] ?? ''), body: Buffer.concat(chunks).toString('utf8'),
      })
      handler(request, response)
    })
  })
  servers.push(server)
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  return { url: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`, tokens, paths, requests }
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

  it('reads a view whose responsible attorney has no display name yet and whose letter the intake filed before its code and date', async () => {
    const [event] = VIEW.officeEvents
    const view = {
      ...VIEW,
      matter: { ...VIEW.matter, responsible: null },
      officeEvents: [{ ...event!, code: null, documentDate: null, state: 'unclassified' }],
    }
    const double = await record(json(200, view))
    expect(await read(await provider({ url: double.url, key: TOKEN }))).toEqual(view)
  })

  it('reads the view of an R0 Firm Record without the R1 fields, and refuses a view with only some of them', async () => {
    const { recordSeq, viewHash, matter, deadlines } = VIEW
    const r0 = { recordSeq, viewHash, matter, deadlines }
    const double = await record(json(200, r0))
    const view = await read(await provider({ url: double.url, key: TOKEN }))
    expect(view).toEqual(r0)
    expect(Object.keys(view).sort()).toEqual(['deadlines', 'matter', 'recordSeq', 'viewHash'])
    const { documents: _documents, ...partial } = VIEW
    const partialDouble = await record(json(200, partial))
    expect(await read(await provider({ url: partialDouble.url, key: TOKEN }))).toEqual({ error: 'invalid_answer' })
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
      { ...VIEW, clientRules: { ...VIEW.clientRules, aiUse: 'sometimes' } },
      { ...VIEW, officeEvents: [{ ...VIEW.officeEvents[0], document: 'not-a-hash' }] },
      { ...VIEW, tickets: [{ ...VIEW.tickets[0], state: 'asleep' }] },
      { ...VIEW, documents: undefined },
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

const TICKET = brandString<TicketId>('tk-1')
const SESSION = SessionId('webhook-1')
const REPORT: ReportProposal = {
  fileName: 'report.docx',
  content: new TextEncoder().encode('docx bytes'),
  templateName: 'client-report.docx',
  templateVersion: `sha256:${'a'.repeat(64)}`,
  rulesSeq: brandNumber<RecordSeq>(3),
  statements: [{ text: 'The EPO intends to grant the patent.', evidence: [{ document: LETTER_SHA256, span: { page: 1, quote: 'intends to grant' } }] }],
  session: SESSION,
  toolCall: ToolCallId('call-7'),
}
const FINISH = { session: SESSION, deadline: { id: brandString<DeadlineId>('d-1'), state: 'proposed' as const, seq: brandNumber<RecordSeq>(7) } }

describe('flowleapRecord run commands over HTTP', () => {
  it('posts run-started, the report, and finish with the token, a JSON body, and a stable idempotency key', async () => {
    const answers = [
      [200, { recordSeq: 8 }],
      [201, { proposalId: 'p-1', document: 'b'.repeat(64), recordSeq: 10 }],
      [200, { recordSeq: 12, outbox: { id: 'o-1', state: 'queued' } }],
    ] as const
    let index = 0
    const double = await record((request, response) => {
      const [status, body] = answers[index++]!
      json(status, body)(request, response)
    })
    const service = await provider({ url: double.url, key: TOKEN })
    const signal = new AbortController().signal
    expect(await service.runStarted(TICKET, { session: SESSION }, signal)).toEqual({ recordSeq: 8 })
    expect(await service.proposeReport(TICKET, REPORT, signal)).toEqual({ proposalId: 'p-1', document: 'b'.repeat(64), recordSeq: 10 })
    expect(await service.finishRun(TICKET, FINISH, signal)).toEqual({ recordSeq: 12, outbox: { id: 'o-1', state: 'queued' } })
    expect(double.paths).toEqual(['/records/api/tickets/tk-1/run-started', '/records/api/tickets/tk-1/reports', '/records/api/tickets/tk-1/finish'])
    expect(double.tokens).toEqual([`Bearer ${TOKEN}`, `Bearer ${TOKEN}`, `Bearer ${TOKEN}`])
    expect(double.requests.map(request => request.method)).toEqual(['POST', 'POST', 'POST'])
    expect(double.requests.map(request => request.key)).toEqual([
      idempotencyKey('run-started', ['tk-1', 'webhook-1']),
      idempotencyKey('report', ['tk-1', 'webhook-1', 'call-7']),
      idempotencyKey('finish', ['tk-1', 'webhook-1']),
    ])
    for (const { key } of double.requests) expect(key).toMatch(/^[A-Za-z0-9._:-]{8,128}$/u)
    expect(JSON.parse(double.requests[0]!.body)).toEqual({ session: 'webhook-1' })
    expect(JSON.parse(double.requests[1]!.body)).toEqual({
      fileName: 'report.docx',
      contentBase64: Buffer.from('docx bytes').toString('base64'),
      templateName: 'client-report.docx',
      templateVersion: REPORT.templateVersion,
      rulesSeq: 3,
      statements: REPORT.statements,
      session: 'webhook-1',
      toolCall: 'call-7',
    })
    expect(JSON.parse(double.requests[2]!.body)).toEqual({ session: 'webhook-1', deadline: { id: 'd-1', state: 'proposed', seq: 7 } })
  })

  it('reads the page text of a document with the token and sends no idempotency key', async () => {
    const double = await record(json(200, { pages: ['Page one.', 'Page two.'] }))
    const service = await provider({ url: double.url, key: TOKEN })
    expect(await service.documentText(LETTER_SHA256, new AbortController().signal)).toEqual({ pages: ['Page one.', 'Page two.'] })
    expect(double.paths).toEqual([`/records/api/documents/${LETTER_SHA256}/text`])
    expect(double.tokens).toEqual([`Bearer ${TOKEN}`])
    expect(double.requests.map(request => [request.method, request.key, request.body])).toEqual([['GET', '', '']])
  })

  it('reports the refusal of a text read, and an answer without pages as invalid', async () => {
    const signal = new AbortController().signal
    for (const [status, body, error] of [
      [404, { error: 'not-found', detail: 'No text.' }, 'not_found'],
      [403, { error: 'no-identity' }, 'refused'],
      [500, 'down', 'service_error'],
      [200, { pages: 'text' }, 'invalid_answer'],
      [200, { pages: [7] }, 'invalid_answer'],
      [200, 'not json', 'invalid_answer'],
    ] as const) {
      const double = await record(json(status, body))
      const service = await provider({ url: double.url, key: TOKEN })
      vi.spyOn(contexts.at(-1)!.logger, 'warn').mockImplementation(() => {})
      expect(await service.documentText(LETTER_SHA256, signal)).toMatchObject({ error })
    }
    expect(await (await provider({ url: '', key: TOKEN })).documentText(LETTER_SHA256, signal)).toEqual({ error: 'not_configured' })
    expect(await (await provider({ url: 'http://127.0.0.1:9', key: undefined })).documentText(LETTER_SHA256, signal)).toEqual({ error: 'no_key' })
  })

  it('maps each refusal code of the Firm Record and keeps its detail', async () => {
    for (const [status, code, error] of [
      [403, 'agent-cannot-decide', 'agent_cannot_decide'],
      [403, 'not-routed-person', 'not_routed_person'],
      [404, 'not-found', 'not_found'],
      [400, 'invalid-body', 'invalid_body'],
      [409, 'ticket-not-waking', 'ticket_not_waking'],
      [409, 'ticket-not-running', 'ticket_not_running'],
      [409, 'report.no-ai-draft-against-client-rule', 'client_rule_forbids_ai_draft'],
      [422, 'report.statement-has-evidence', 'statement_without_evidence'],
      [422, 'report.statement-has-span', 'statement_without_span'],
      [422, 'report.quote-not-in-letter', 'quote_not_in_letter'],
      [422, 'report.quote-ambiguous', 'quote_ambiguous'],
      [409, 'no-proposals', 'no_proposals'],
      [413, 'document-too-large', 'document_too_large'],
      [409, 'idempotency-key-reused', 'idempotency_key_reused'],
      [403, 'some-new-code', 'refused'],
      [401, 'no-identity', 'refused'],
      [404, 'gone', 'not_found'],
      [500, 'down', 'service_error'],
    ] as const) {
      const double = await record(json(status, { error: code, detail: 'One sentence.' }))
      const service = await provider({ url: double.url, key: TOKEN })
      vi.spyOn(contexts.at(-1)!.logger, 'warn').mockImplementation(() => {})
      expect(await service.finishRun(TICKET, FINISH, new AbortController().signal)).toEqual({ error, detail: 'One sentence.' })
    }
    const bare = await record(json(502, 'bad gateway'))
    const service = await provider({ url: bare.url, key: TOKEN })
    vi.spyOn(contexts.at(-1)!.logger, 'warn').mockImplementation(() => {})
    expect(await service.runStarted(TICKET, { session: SESSION }, new AbortController().signal)).toEqual({ error: 'service_error' })
  })

  it('bounds the detail, and reports a receipt that is not one, a missing address or token, and a closed port', async () => {
    const long = await record(json(409, { error: 'no-proposals', detail: 'x'.repeat(1000) }))
    const refused = await (await provider({ url: long.url, key: TOKEN })).finishRun(TICKET, FINISH, new AbortController().signal)
    expect(refused).toEqual({ error: 'no_proposals', detail: 'x'.repeat(300) })
    const huge = `{"error":"no-proposals","pad":"${'x'.repeat(1_100_000)}"}`
    const hugeRefusal = await record(json(409, huge))
    expect(await (await provider({ url: hugeRefusal.url, key: TOKEN })).finishRun(TICKET, FINISH, new AbortController().signal))
      .toEqual({ error: 'service_error' })
    const hugeReceipt = await record(json(200, huge))
    expect(await (await provider({ url: hugeReceipt.url, key: TOKEN })).finishRun(TICKET, FINISH, new AbortController().signal))
      .toEqual({ error: 'invalid_answer' })
    for (const body of [{ recordSeq: '8' }, { proposalId: 'p-1' }, 'not json']) {
      const double = await record(json(200, body))
      const service = await provider({ url: double.url, key: TOKEN })
      expect(await service.proposeReport(TICKET, REPORT, new AbortController().signal)).toEqual({ error: 'invalid_answer' })
    }
    const fetch = vi.spyOn(globalThis, 'fetch')
    expect(await (await provider({ url: '', key: TOKEN })).runStarted(TICKET, { session: SESSION }, new AbortController().signal))
      .toEqual({ error: 'not_configured' })
    expect(await (await provider({ url: 'http://127.0.0.1:9', key: undefined })).runStarted(TICKET, { session: SESSION }, new AbortController().signal))
      .toEqual({ error: 'no_key' })
    expect(fetch).not.toHaveBeenCalled()
    fetch.mockRestore()
    const closed = await record(json(200, {}))
    await new Promise((resolve) => { servers.pop()!.close(resolve) })
    const service = await provider({ url: closed.url, key: TOKEN })
    const warn = vi.spyOn(contexts.at(-1)!.logger, 'warn').mockImplementation(() => {})
    expect(await service.finishRun(TICKET, FINISH, new AbortController().signal)).toEqual({ error: 'unreachable' })
    expect(warn.mock.calls.map(([line]) => String(line)).join('\n')).not.toContain(TOKEN)
  })
})
