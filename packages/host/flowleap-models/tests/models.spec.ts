import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import FlowleapModels, { type Config, type ModelProviderId } from '../src/index.ts'

const servers: Server[] = []
const contexts: Context[] = []

afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  await Promise.all(servers.splice(0).map(server => new Promise((resolve) => { server.close(resolve) })))
  vi.restoreAllMocks()
})

interface Seen { method: string; url: string; headers: IncomingMessage['headers']; body: string }

/** A provider double: answers each request with `handler` and records what it received. */
async function provider(handler: (seen: Seen, response: ServerResponse) => void): Promise<{ url: string; seen: Seen[] }> {
  const seen: Seen[] = []
  const server = createServer((request, response) => {
    let body = ''
    request.on('data', (chunk: Buffer) => { body += chunk.toString() })
    request.on('end', () => {
      const entry = { method: request.method ?? '', url: request.url ?? '', headers: request.headers, body }
      seen.push(entry)
      handler(entry, response)
    })
  })
  servers.push(server)
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  return { url: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`, seen }
}

function status(code: number, body: unknown = {}) {
  return (_seen: Seen, response: ServerResponse) => {
    response.writeHead(code, { 'content-type': 'application/json' })
    response.end(JSON.stringify(body))
  }
}

interface Mount {
  service: FlowleapModels
  keys: Map<string, string>
  saved: { provider: string; model: string }[]
}

/** Mount the service over an in-memory credential store and a default-model double. */
async function mount(options: {
  baseURL?: string
  keys?: Record<string, string>
  defaultProvider?: string
  lockedRefs?: string[]
  connectTimeoutMs?: number
  routes?: string[]
  keyLabel?: string
  unreadableKeys?: boolean
  defaultModel?: 'absent' | 'unsaveable'
}): Promise<Mount> {
  const ctx = new Context()
  contexts.push(ctx)
  const keys = new Map(Object.entries(options.keys ?? {}))
  const saved: Mount['saved'] = []
  ctx.provide('credentials', {
    resolve: async (ref: string) => {
      if (options.unreadableKeys === true) throw new Error('keychain locked')
      return keys.has(ref) ? { value: keys.get(ref) } : undefined
    },
    set: async (ref: string, value: string) => {
      if (options.lockedRefs?.includes(ref) === true) throw new Error(`"${ref}" is locked`)
      keys.set(ref, value)
    },
  } as never)
  if (options.routes !== undefined) {
    const routes = options.routes
    ctx.provide('llm', { listProviders: () => routes.map(id => ({ id, name: id })) } as never)
  }
  let current = options.defaultProvider ?? 'anthropic'
  if (options.defaultModel !== 'absent') ctx.provide('agentDefaultModel', {
    currentSelection: () => ({ provider: current, model: 'm' }),
    saveSelection: async (next: { provider: string; model: string }) => {
      if (options.defaultModel === 'unsaveable') throw new Error('settings file is read-only')
      saved.push(next)
      current = next.provider
    },
  } as never)
  const base = options.baseURL ?? 'http://127.0.0.1:9'
  const config: Config = {
    providers: {
      anthropic: { baseURL: base, apiKeyRef: 'ANTHROPIC_API_KEY', model: 'claude-sonnet-5-5' },
      openai: { baseURL: `${base}/v1`, apiKeyRef: 'OPENAI_API_KEY', model: 'gpt-5.5' },
      openrouter: { baseURL: `${base}/api/v1`, apiKeyRef: 'OPENROUTER_API_KEY', model: 'anthropic/claude-sonnet-5.5' },
    },
    openRouterAuthURL: 'https://openrouter.example/auth',
    openRouterKeyLabel: options.keyLabel ?? 'Desktop',
    requestTimeoutMs: 5000,
    connectTimeoutMs: options.connectTimeoutMs ?? 60_000,
  }
  await ctx.plugin(FlowleapModels, config)
  return { service: ctx.get('flowleapModels')!, keys, saved }
}

const never = new AbortController().signal

describe('flowleapModels.test', () => {
  it.each<[ModelProviderId, string, string, string]>([
    ['anthropic', 'ANTHROPIC_API_KEY', '/v1/models?limit=1', 'x-api-key'],
    ['openai', 'OPENAI_API_KEY', '/v1/models', 'authorization'],
    ['openrouter', 'OPENROUTER_API_KEY', '/api/v1/key', 'authorization'],
  ])('%s: reads one authenticated address at that provider with the stored key', async (id, ref, path, header) => {
    const double = await provider(status(200))
    const { service } = await mount({ baseURL: double.url, keys: { [ref]: 'sk-1', ANTHROPIC_API_KEY: 'sk-1' } })
    expect(await service.test(id, never)).toEqual({ ok: true })
    expect(double.seen.map(entry => [entry.method, entry.url])).toEqual([['GET', path]])
    expect(double.seen[0]?.headers[header]).toBe(header === 'authorization' ? 'Bearer sk-1' : 'sk-1')
  })

  it('reports a refused key with its status, and another error status as a provider error', async () => {
    const refused = await provider(status(401))
    expect(await (await mount({ baseURL: refused.url, keys: { OPENAI_API_KEY: 'bad' } })).service.test('openai', never))
      .toEqual({ ok: false, reason: 'refused', status: 401 })
    const broken = await provider(status(503))
    expect(await (await mount({ baseURL: broken.url, keys: { OPENAI_API_KEY: 'k' } })).service.test('openai', never))
      .toEqual({ ok: false, reason: 'provider_error', status: 503 })
  })

  it('reports no key without a request, and an unreachable provider', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    expect(await (await mount({})).service.test('anthropic', never)).toEqual({ ok: false, reason: 'no_key' })
    expect(fetch).not.toHaveBeenCalled()
    fetch.mockRestore()
    expect(await (await mount({ keys: { ANTHROPIC_API_KEY: 'k' } })).service.test('anthropic', never))
      .toEqual({ ok: false, reason: 'unreachable' })
  })

  it('makes new chats use the tested provider when the default provider has no key', async () => {
    const double = await provider(status(200))
    const { service, saved } = await mount({ baseURL: double.url, keys: { OPENAI_API_KEY: 'k' }, defaultProvider: 'anthropic' })
    expect(await service.test('openai', never)).toEqual({ ok: true, adopted: { provider: 'openai', model: 'gpt-5.5' } })
    expect(saved).toEqual([{ provider: 'openai', model: 'gpt-5.5' }])
  })

  it('keeps a default whose provider has a key, and a default on another registered route', async () => {
    const double = await provider(status(200))
    const withKey = await mount({ baseURL: double.url, keys: { OPENAI_API_KEY: 'k', ANTHROPIC_API_KEY: 'k' } })
    expect(await withKey.service.test('openai', never)).toEqual({ ok: true })
    const other = await mount({ baseURL: double.url, keys: { OPENAI_API_KEY: 'k' }, defaultProvider: 'mistral', routes: ['mistral'] })
    expect(await other.service.test('openai', never)).toEqual({ ok: true })
    expect([...withKey.saved, ...other.saved]).toEqual([])
  })

  it('replaces a default on a route that no adapter registered', async () => {
    const double = await provider(status(200))
    const { service, saved } = await mount({ baseURL: double.url, keys: { OPENAI_API_KEY: 'k' }, defaultProvider: 'deepseek-official', routes: ['openai'] })
    expect(await service.test('openai', never)).toEqual({ ok: true, adopted: { provider: 'openai', model: 'gpt-5.5' } })
    expect(saved).toEqual([{ provider: 'openai', model: 'gpt-5.5' }])
  })

  it('reports no key when the key store cannot be read', async () => {
    expect(await (await mount({ keys: { OPENAI_API_KEY: 'k' }, unreadableKeys: true })).service.test('openai', never))
      .toEqual({ ok: false, reason: 'no_key' })
  })

  it('keeps the default model when no default-model service is loaded, or when the new default cannot be saved', async () => {
    const double = await provider(status(200))
    const absent = await mount({ baseURL: double.url, keys: { OPENAI_API_KEY: 'k' }, defaultModel: 'absent' })
    expect(await absent.service.test('openai', never)).toEqual({ ok: true })
    const unsaveable = await mount({ baseURL: double.url, keys: { OPENAI_API_KEY: 'k' }, defaultModel: 'unsaveable' })
    expect(await unsaveable.service.test('openai', never)).toEqual({ ok: true })
  })

  it('refuses an unknown provider', async () => {
    await expect((await mount({})).service.test('mistral', never)).rejects.toThrow('unknown provider "mistral"')
  })
})

/** Follow the authorization page's redirect as the browser does after the attorney authorizes. */
async function callback(start: string, params: Record<string, string>): Promise<Response> {
  const page = new URL(start)
  const target = new URL(page.searchParams.get('callback_url')!)
  target.hostname = '127.0.0.1'
  for (const [name, value] of Object.entries(params)) target.searchParams.set(name, value)
  return fetch(target)
}

describe('flowleapModels OpenRouter connect', () => {
  it('exchanges the code with the PKCE verifier, stores the key, and adopts the OpenRouter model', async () => {
    const double = await provider(status(200, { key: 'sk-or-new', user_id: 'u' }))
    const { service, keys, saved } = await mount({ baseURL: double.url })
    const { url } = await service.startOpenRouter()
    const page = new URL(url)
    expect(page.origin + page.pathname).toBe('https://openrouter.example/auth')
    expect(page.searchParams.get('code_challenge_method')).toBe('S256')
    expect(page.searchParams.get('key_label')).toBe('Desktop')
    expect(page.searchParams.get('callback_url')).toMatch(/^http:\/\/localhost:\d+\/callback$/u)
    const result = service.awaitOpenRouter(never)
    const answer = await callback(url, { code: 'c-1', state: page.searchParams.get('state')! })
    expect(await answer.text()).toContain('OpenRouter is connected')
    expect(await result).toEqual({ state: 'connected', adopted: { provider: 'openrouter', model: 'anthropic/claude-sonnet-5.5' } })
    expect(keys.get('OPENROUTER_API_KEY')).toBe('sk-or-new')
    expect(saved).toEqual([{ provider: 'openrouter', model: 'anthropic/claude-sonnet-5.5' }])
    const exchange = double.seen[0]!
    expect([exchange.method, exchange.url]).toEqual(['POST', '/api/v1/auth/keys'])
    const body = JSON.parse(exchange.body) as { code: string; code_verifier: string; code_challenge_method: string }
    expect(body.code).toBe('c-1')
    expect(body.code_challenge_method).toBe('S256')
    const { createHash } = await import('node:crypto')
    expect(createHash('sha256').update(body.code_verifier).digest('base64url')).toBe(page.searchParams.get('code_challenge'))
  })

  it('ignores a code with another state, and ends as denied when the callback has no code', async () => {
    const double = await provider(status(200, { key: 'k' }))
    const { service, keys } = await mount({ baseURL: double.url })
    const { url } = await service.startOpenRouter()
    const result = service.awaitOpenRouter(never)
    expect((await callback(url, { code: 'c', state: 'other' })).status).toBe(400)
    await callback(url, {})
    expect(await result).toEqual({ state: 'failed', reason: 'denied' })
    expect(double.seen).toEqual([])
    expect(keys.size).toBe(0)
  })

  it('reports a refused exchange, and a key the store refuses', async () => {
    const refused = await provider(status(403))
    const first = await mount({ baseURL: refused.url })
    const one = await first.service.startOpenRouter()
    const ended = first.service.awaitOpenRouter(never)
    await callback(one.url, { code: 'c', state: new URL(one.url).searchParams.get('state')! })
    expect(await ended).toEqual({ state: 'failed', reason: 'exchange_refused' })

    const exchange = await provider(status(200, { key: 'k' }))
    const locked = await mount({ baseURL: exchange.url, lockedRefs: ['OPENROUTER_API_KEY'] })
    const two = await locked.service.startOpenRouter()
    const refusedStore = locked.service.awaitOpenRouter(never)
    await callback(two.url, { code: 'c', state: new URL(two.url).searchParams.get('state')! })
    expect(await refusedStore).toEqual({ state: 'failed', reason: 'store_refused' })
  })

  it('ends as cancelled on the caller signal and closes the listener', async () => {
    const { service } = await mount({})
    const { url } = await service.startOpenRouter()
    const controller = new AbortController()
    const result = service.awaitOpenRouter(controller.signal)
    controller.abort()
    expect(await result).toEqual({ state: 'cancelled' })
    await expect(callback(url, { code: 'c' })).rejects.toThrow()
  })

  it('ends as timeout without a callback, and reports a wait with no attempt', async () => {
    const { service } = await mount({ connectTimeoutMs: 1000 })
    expect(await service.awaitOpenRouter(never)).toEqual({ state: 'failed', reason: 'not_started' })
    await service.startOpenRouter()
    expect(await service.awaitOpenRouter(never)).toEqual({ state: 'failed', reason: 'timeout' })
  })

  it('cancelOpenRouter ends the current attempt as cancelled', async () => {
    const { service } = await mount({})
    await service.startOpenRouter()
    const result = service.awaitOpenRouter(never)
    service.cancelOpenRouter()
    expect(await result).toEqual({ state: 'cancelled' })
  })

  it('a second start cancels the first attempt', async () => {
    const { service } = await mount({})
    await service.startOpenRouter()
    const first = service.awaitOpenRouter(never)
    await service.startOpenRouter()
    expect(await first).toEqual({ state: 'cancelled' })
  })

  it('omits the key label when none is configured, and adopts nothing when OpenRouter is already the default', async () => {
    const double = await provider(status(200, { key: 'sk-or' }))
    const { service, saved } = await mount({ baseURL: double.url, keyLabel: '', defaultProvider: 'openrouter' })
    const { url } = await service.startOpenRouter()
    expect(new URL(url).searchParams.has('key_label')).toBe(false)
    const result = service.awaitOpenRouter(never)
    await callback(url, { code: 'c', state: new URL(url).searchParams.get('state')! })
    expect(await result).toEqual({ state: 'connected' })
    expect(saved).toEqual([])
  })

  it('gives the end of one attempt to every wait on it', async () => {
    const { service } = await mount({})
    await service.startOpenRouter()
    const first = service.awaitOpenRouter(never)
    const second = service.awaitOpenRouter(never)
    service.cancelOpenRouter()
    expect(await Promise.all([first, second])).toEqual([{ state: 'cancelled' }, { state: 'cancelled' }])
  })

  it('keeps the first end of an attempt when a cancel comes after it', async () => {
    const { service } = await mount({})
    const { url } = await service.startOpenRouter()
    await callback(url, {})
    service.cancelOpenRouter()
    expect(await service.awaitOpenRouter(never)).toEqual({ state: 'failed', reason: 'denied' })
  })

  it('answers another address on the listener with 404 and keeps waiting', async () => {
    const double = await provider(status(200, { key: 'k' }))
    const { service } = await mount({ baseURL: double.url })
    const { url } = await service.startOpenRouter()
    const other = new URL(new URL(url).searchParams.get('callback_url')!)
    other.hostname = '127.0.0.1'
    other.pathname = '/favicon.ico'
    expect((await fetch(other)).status).toBe(404)
    const result = service.awaitOpenRouter(never)
    await callback(url, { code: 'c', state: new URL(url).searchParams.get('state')! })
    expect(await result).toEqual({ state: 'connected', adopted: { provider: 'openrouter', model: 'anthropic/claude-sonnet-5.5' } })
  })

  it('refuses a second callback while the first code is in exchange', async () => {
    const held = Promise.withResolvers<undefined>()
    const double = await provider((_seen, response) => {
      void held.promise.then(() => { status(200, { key: 'k' })(_seen, response) })
    })
    const { service } = await mount({ baseURL: double.url })
    const { url } = await service.startOpenRouter()
    const state = new URL(url).searchParams.get('state')!
    const result = service.awaitOpenRouter(never)
    const first = callback(url, { code: 'c-1', state })
    await vi.waitFor(() => { expect(double.seen).toHaveLength(1) })
    const second = await callback(url, { code: 'c-2', state })
    expect(second.status).toBe(409)
    expect(await second.text()).toContain('already used')
    held.resolve(undefined)
    expect((await first).status).toBe(200)
    expect(await result).toEqual({ state: 'connected', adopted: { provider: 'openrouter', model: 'anthropic/claude-sonnet-5.5' } })
    expect(double.seen).toHaveLength(1)
  })

  it('reports an exchange endpoint it cannot reach as unreachable', async () => {
    const { service, keys } = await mount({})
    const { url } = await service.startOpenRouter()
    const result = service.awaitOpenRouter(never)
    const answer = await callback(url, { code: 'c', state: new URL(url).searchParams.get('state')! })
    expect(await answer.text()).toContain('OpenRouter was not connected')
    expect(await result).toEqual({ state: 'failed', reason: 'unreachable' })
    expect(keys.size).toBe(0)
  })

  it.each([
    ['an answer that is not JSON', (_seen: Seen, response: ServerResponse) => { response.end('<html>sign in</html>') }],
    ['an answer above 16 KiB', status(200, { key: 'k', padding: 'x'.repeat(16 * 1024) })],
  ])('refuses %s as an exchange without a key', async (_name, handler) => {
    const double = await provider(handler)
    const { service, keys } = await mount({ baseURL: double.url })
    const { url } = await service.startOpenRouter()
    const result = service.awaitOpenRouter(never)
    await callback(url, { code: 'c', state: new URL(url).searchParams.get('state')! })
    expect(await result).toEqual({ state: 'failed', reason: 'exchange_refused' })
    expect(keys.size).toBe(0)
  })
})
