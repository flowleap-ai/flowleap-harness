import { Context } from '@deepseek-ai/cordis'
import { parseCredentialKey } from '@deepseek-ai/dsh-credentials'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createConnectorHost, createCredentialStore, lookupCredentials, LruCache, validateConnectorFields,
} from '@deepseek-ai/dsh-flowleap-connectors'
import { MemoryCredentials } from './memory-credentials.ts'

function bench() {
  const ctx = new Context()
  const credentials = new MemoryCredentials(ctx)
  return { ctx, credentials, store: createCredentialStore(credentials) }
}

describe('the connector credential records', () => {
  it('round-trips every connector through the credential seam under flowleap-connectors/<id>, exposing presence but never values', async () => {
    const { credentials, store } = bench()
    await store.write('epo-ops', { consumerKey: ' ck ', consumerSecret: 'cs' })
    await store.write('uspto-odp', { apiKey: 'odp' })
    await store.write('semantic-scholar', { apiKey: 's2' })
    await store.write('mistral', { apiKey: 'mi' })

    expect([...credentials.records.keys()].sort()).toEqual([
      'flowleap-connectors/epo-ops', 'flowleap-connectors/mistral', 'flowleap-connectors/semantic-scholar', 'flowleap-connectors/uspto-odp',
    ])
    expect(credentials.records.get(parseCredentialKey('flowleap-connectors/epo-ops'))).toEqual({
      kind: 'grant', payload: { consumerKey: 'ck', consumerSecret: 'cs' },
    })
    expect(await store.read('epo-ops')).toEqual({ consumerKey: 'ck', consumerSecret: 'cs' })
    expect(await store.describe('epo-ops')).toEqual({ configured: true, source: 'stored', writable: true, fields: ['consumerKey', 'consumerSecret'] })
    expect(await lookupCredentials(store, 'epoOps')).toEqual({
      status: 'available', credentials: { consumerKey: 'ck', consumerSecret: 'cs' }, owner: 'user', stored: true,
    })
    expect(await lookupCredentials(store, 'usptoOdp')).toEqual({ status: 'available', credentials: { apiKey: 'odp' }, owner: 'user', stored: true })
    expect(await lookupCredentials(store, 'semanticScholar')).toEqual({ status: 'available', credentials: { apiKey: 's2' }, owner: 'user', stored: true })

    await store.remove('epo-ops')
    expect(await store.describe('epo-ops')).toEqual({ configured: false, writable: true, fields: ['consumerKey', 'consumerSecret'] })
    expect(await lookupCredentials(store, 'epoOps')).toEqual({ status: 'missing' })
    await expect(store.remove('epo-ops')).resolves.toBeUndefined()
  })

  it('refuses an incomplete or foreign field map before writing, and reads a half record as not configured', async () => {
    const { credentials, store } = bench()
    await expect(store.write('epo-ops', { consumerKey: 'ck' })).rejects.toThrow('EPO OPS: field "consumerSecret" is required')
    await expect(store.write('uspto-odp', { apiKey: '  ' })).rejects.toThrow('USPTO ODP: field "apiKey" is required')
    await expect(store.write('mistral', { apiKey: 'x', extra: 'y' })).rejects.toThrow('Mistral: unknown field "extra"')
    expect(credentials.records.size).toBe(0)
    expect(validateConnectorFields('semantic-scholar', { apiKey: ' k ' })).toEqual({ apiKey: 'k' })

    credentials.records.set(parseCredentialKey('flowleap-connectors/epo-ops'), { kind: 'grant', payload: { consumerKey: 'only' } })
    credentials.records.set(parseCredentialKey('flowleap-connectors/uspto-odp'), { kind: 'api-key', key: 'wrong-kind' })
    expect(await store.read('epo-ops')).toBeUndefined()
    expect(await store.describe('uspto-odp')).toMatchObject({ configured: false })
    credentials.records.set(parseCredentialKey('flowleap-connectors/mistral'), { kind: 'grant', payload: { apiKey: 42 } })
    expect(await store.read('mistral')).toBeUndefined()
  })

  it('passes a Mistral baseUrl from a deployment record to the library, and keeps the card fields to apiKey', async () => {
    const { credentials, store } = bench()
    credentials.records.set(parseCredentialKey('flowleap-connectors/mistral'), {
      kind: 'grant', payload: { apiKey: 'virtual', baseUrl: ' http://flowleap-gateway:4000 ' },
    })
    expect(await lookupCredentials(store, 'mistral')).toEqual({
      status: 'available', credentials: { apiKey: 'virtual', baseUrl: 'http://flowleap-gateway:4000' }, owner: 'user', stored: true,
    })
    expect(await store.describe('mistral')).toEqual({ configured: true, source: 'stored', writable: true, fields: ['apiKey'] })

    await store.write('mistral', { apiKey: 'own' })
    expect(await lookupCredentials(store, 'mistral')).toEqual({ status: 'available', credentials: { apiKey: 'own' }, owner: 'user', stored: true })
    await expect(store.write('mistral', { apiKey: 'k', baseUrl: ' ' })).rejects.toThrow('Mistral: field "baseUrl" is empty')
    await expect(store.write('uspto-odp', { apiKey: 'k', baseUrl: 'https://x' })).rejects.toThrow('USPTO ODP: unknown field "baseUrl"')
  })

  it('reports the store writability a read-only deployment has', async () => {
    const { credentials, store } = bench()
    credentials.writable = false
    expect(await store.describe('mistral')).toEqual({ configured: false, writable: false, fields: ['apiKey'] })
    await expect(store.write('mistral', { apiKey: 'k' })).rejects.toThrow('read-only')
  })
})

describe('the connector host', () => {
  it('answers the library from the records, caches with an LRU bound and TTL, and carries the caller signal', async () => {
    const { ctx, store } = bench()
    let now = 1_000_000
    const bound = createConnectorHost({ store, logger: ctx.logger, cacheEntries: 2, now: () => now })
    await store.write('uspto-odp', { apiKey: 'odp' })

    expect(await bound.host.credentials('usptoOdp')).toMatchObject({ status: 'available', credentials: { apiKey: 'odp' } })
    expect(await bound.host.credentials('epoOps')).toEqual({ status: 'missing' })
    expect(bound.host.now()).toBe(1_000_000)
    expect(bound.host.signal?.()).toBeUndefined()
    const controller = new AbortController()
    expect(await bound.withSignal(controller.signal, () => Promise.resolve(bound.host.signal?.()))).toBe(controller.signal)

    const cache = bound.cache
    await cache.set('a', { n: 1 }, 10)
    await cache.set('b', { n: 2 }, 10)
    expect(await cache.get('a')).toEqual({ n: 1 })
    await cache.set('c', { n: 3 }, 10)
    expect([await cache.get('a'), await cache.get('b'), await cache.get('c')]).toEqual([{ n: 1 }, undefined, { n: 3 }])
    now += 10_001
    expect(await cache.get('a')).toBeUndefined()
    expect(cache.size).toBe(0)
    await cache.set('e', 1, 10)
    expect(cache.size).toBe(1)
    await cache.set('d', 1, 0)
    expect(cache.size).toBe(1)
    expect(() => new LruCache(0)).toThrow('positive integer')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends requests through the global fetch when no fetch is given', async () => {
    const { ctx, store } = bench()
    const globalFetch = vi.fn<typeof fetch>(() => Promise.resolve(new Response('ok')))
    vi.stubGlobal('fetch', globalFetch)
    const bound = createConnectorHost({ store, logger: ctx.logger, cacheEntries: 1 })
    const response = await bound.host.fetch('https://ops.epo.org/3.2/auth/accesstoken', { method: 'POST' })
    expect(await response.text()).toBe('ok')
    expect(globalFetch).toHaveBeenCalledWith('https://ops.epo.org/3.2/auth/accesstoken', { method: 'POST' })
  })
})
