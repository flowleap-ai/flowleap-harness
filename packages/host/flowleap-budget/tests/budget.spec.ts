import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import FlowleapBudget, { type BudgetMonth } from '../src/index.ts'

const KEY = 'sk-runtime-virtual-key'
const servers: Server[] = []
const contexts: Context[] = []

afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  await Promise.all(servers.splice(0).map(server => new Promise((resolve) => { server.close(resolve) })))
  vi.restoreAllMocks()
})

/** A gateway double that answers each request with `handler`; it records the bearer token it received. */
async function gateway(
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

/** Mount the service with a credential store double that knows only `ANTHROPIC_API_KEY`. */
async function budget(config: { url: string; path?: string; timeoutMs?: number; key?: string | undefined }): Promise<FlowleapBudget> {
  const ctx = new Context()
  contexts.push(ctx)
  ctx.provide('credentials', {
    resolve: async (ref: string) => ref === 'ANTHROPIC_API_KEY' && config.key !== undefined ? { value: config.key } : undefined,
  } as never)
  await ctx.plugin(FlowleapBudget, {
    baseURL: config.url, path: config.path ?? '/flowleap/budget', apiKeyRef: 'ANTHROPIC_API_KEY', timeoutMs: config.timeoutMs ?? 5000,
  })
  return ctx.get('flowleapBudget')!
}

describe('flowleapBudget.month', () => {
  it('reports the figures of the gateway for the runtime key', async () => {
    const double = await gateway(json(200, { month: '2026-10', spent_usd: 12.5, budget_usd: 50 }))
    const service = await budget({ url: double.url, key: KEY })
    expect(await service.month()).toEqual({ state: 'known', month: '2026-10', spentUsd: 12.5, budgetUsd: 50 } satisfies BudgetMonth)
    expect(double.tokens).toEqual([`Bearer ${KEY}`])
    expect(double.paths).toEqual(['/flowleap/budget'])
  })

  it('reads the configured path on the origin of the gateway base URL', async () => {
    const double = await gateway(json(200, { month: '2026-10', spent_usd: 1, budget_usd: 2 }))
    await (await budget({ url: `${double.url}/v1`, path: '/budget/read', key: KEY })).month()
    expect(double.paths).toEqual(['/budget/read'])
  })

  it('keeps a missing budget as null', async () => {
    const double = await gateway(json(200, { month: '2026-10', spent_usd: 0, budget_usd: null }))
    expect(await (await budget({ url: double.url, key: KEY })).month()).toEqual({ state: 'known', month: '2026-10', spentUsd: 0, budgetUsd: null })
  })

  it('reports unknown, never a number, without an address or a key', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    expect(await (await budget({ url: '', key: KEY })).month()).toEqual({ state: 'unknown', reason: 'not_configured' })
    expect(await (await budget({ url: 'http://127.0.0.1:9', key: undefined })).month()).toEqual({ state: 'unknown', reason: 'no_key' })
    expect(await (await budget({ url: 'http://127.0.0.1:9', key: '' })).month()).toEqual({ state: 'unknown', reason: 'no_key' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('reports no_key and logs one line when the credential store fails', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    ctx.provide('credentials', { resolve: async () => { throw new Error('store locked') } } as never)
    await ctx.plugin(FlowleapBudget, { baseURL: 'http://127.0.0.1:9', path: '/flowleap/budget', apiKeyRef: 'ANTHROPIC_API_KEY', timeoutMs: 5000 })
    const warn = vi.spyOn(ctx.logger, 'warn').mockImplementation(() => {})
    expect(await ctx.get('flowleapBudget')!.month()).toEqual({ state: 'unknown', reason: 'no_key' })
    expect(warn).toHaveBeenCalledOnce()
  })

  it('reports a refused key, an error status, a redirect, a slow gateway or body, and a closed port as unknown', async () => {
    const warn = vi.fn()
    for (const [handler, reason] of [
      [json(401, { error: 'invalid key' }), 'refused'],
      [json(403, { error: 'route not allowed' }), 'refused'],
      [json(500, { error: 'down' }), 'gateway_error'],
      [json(502, 'bad gateway'), 'gateway_error'],
      [(_request: IncomingMessage, response: ServerResponse) => { response.writeHead(302, { location: 'http://127.0.0.1:9/' }).end() }, 'unreachable'],
      [(_request: IncomingMessage, response: ServerResponse) => { response.writeHead(200, { 'content-type': 'application/json' }).write('{"month":') }, 'unreachable'],
      [() => { /* never answers */ }, 'unreachable'],
    ] as const) {
      const double = await gateway(handler)
      const service = await budget({ url: double.url, key: KEY, timeoutMs: 200 })
      vi.spyOn(contexts.at(-1)!.logger, 'warn').mockImplementation(warn)
      expect(await service.month()).toEqual({ state: 'unknown', reason })
    }
    const closed = await gateway(json(200, {}))
    await new Promise((resolve) => { servers.pop()!.close(resolve) })
    const service = await budget({ url: closed.url, key: KEY })
    vi.spyOn(contexts.at(-1)!.logger, 'warn').mockImplementation(warn)
    expect(await service.month()).toEqual({ state: 'unknown', reason: 'unreachable' })
    expect(warn.mock.calls.map(([line]) => String(line)).join('\n')).not.toContain(KEY)
  })

  it('reports an answer that is not the budget record as invalid', async () => {
    for (const body of ['not json', { month: '2026-13', spent_usd: 1, budget_usd: 2 }, { month: '2026-10', spent_usd: -1, budget_usd: 2 },
      { month: '2026-10', spent_usd: 1 }, { month: '2026-10', spent_usd: 1, budget_usd: 'many' }]) {
      const double = await gateway(json(200, body))
      expect(await (await budget({ url: double.url, key: KEY })).month()).toEqual({ state: 'unknown', reason: 'invalid_answer' })
    }
  })

  it('reports a body above 16 KiB as invalid without reading the rest', async () => {
    const double = await gateway(json(200, `{"month":"2026-10","pad":"${'x'.repeat(20_000)}"}`))
    expect(await (await budget({ url: double.url, key: KEY })).month()).toEqual({ state: 'unknown', reason: 'invalid_answer' })
  })

  it('fails loud at load for a base URL that may leak the key, a path without a slash, or an invalid key reference', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    ctx.provide('credentials', { resolve: async () => undefined } as never)
    const load = (baseURL: string, path = '/flowleap/budget', apiKeyRef = 'ANTHROPIC_API_KEY') =>
      ctx.plugin(FlowleapBudget, { baseURL, path, apiKeyRef, timeoutMs: 5000 })
    for (const url of ['file:///etc/passwd', 'not a url', 'http://gateway.example.com', 'http://10.0.0.5:4000']) {
      await expect(load(url)).rejects.toThrow(/https URL/u)
    }
    await expect(load('', 'flowleap/budget')).rejects.toThrow(/must start with/u)
    await expect(load('', '/flowleap/budget', 'not-a-name')).rejects.toThrow(/credential ref/u)
    for (const url of ['https://gateway.example.com', 'http://flowleap-gateway:4000', 'http://localhost:4000', 'http://[::1]:4000', 'http://127.0.0.1:4000']) {
      const fiber = await load(url)
      await fiber.dispose()
    }
  })
})
