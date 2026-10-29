import { Context } from '@deepseek-ai/cordis'
import { createConnectors } from '@flowleap/connectors'
import { describe, expect, it, vi } from 'vitest'
import {
  FlowleapConnectorsController, createConnectorHost, createCredentialStore,
} from '@deepseek-ai/dsh-flowleap-connectors'
import { parseCredentialKey } from '@deepseek-ai/dsh-credentials'
import { MemoryCredentials } from './memory-credentials.ts'

async function bench() {
  const ctx = new Context()
  const credentials = new MemoryCredentials(ctx)
  const store = createCredentialStore(credentials)
  const fetchSpy = vi.fn<typeof fetch>(() => Promise.reject(new Error('no network in this spec')))
  const bound = createConnectorHost({ store, logger: ctx.logger, cacheEntries: 10, fetch: fetchSpy })
  const connectors = createConnectors(bound.host)
  await ctx.plugin(FlowleapConnectorsController, { store, connectors, bound })
  return { ctx, credentials, controller: ctx.flowleapConnectors, fetchSpy }
}

describe('the flowleapConnectors Remote', () => {
  it('describes presence per connector, stores and removes records, and never returns a value', async () => {
    const { controller, credentials } = await bench()
    expect(await controller.describe()).toEqual({
      'epo-ops': { configured: false, writable: true, fields: ['consumerKey', 'consumerSecret'] },
      'uspto-odp': { configured: false, writable: true, fields: ['apiKey'] },
      'semantic-scholar': { configured: false, writable: true, fields: ['apiKey'] },
      mistral: { configured: false, writable: true, fields: ['apiKey'] },
    })
    await controller.set('epo-ops', { consumerKey: 'ck', consumerSecret: 'cs' })
    const described = await controller.describe()
    expect(described['epo-ops']).toEqual({ configured: true, source: 'stored', writable: true, fields: ['consumerKey', 'consumerSecret'] })
    expect(JSON.stringify(described)).not.toContain('ck')
    expect(credentials.records.size).toBe(1)
    await controller.unset('epo-ops')
    expect((await controller.describe())['epo-ops']).toMatchObject({ configured: false })
  })

  it('refuses unknown connectors and incomplete fields as gateway/bad-request or flowleap-connectors/rejected', async () => {
    const { controller } = await bench()
    await expect(controller.set('dpma', { apiKey: 'x' })).rejects.toMatchObject({ code: 'gateway/bad-request' })
    await expect(controller.unset('dpma')).rejects.toMatchObject({ code: 'gateway/bad-request' })
    await expect(controller.test('dpma', new AbortController().signal)).rejects.toMatchObject({ code: 'gateway/bad-request' })
    await expect(controller.set('epo-ops', { consumerKey: 'ck' })).rejects.toMatchObject({
      code: 'flowleap-connectors/rejected', message: 'EPO OPS: field "consumerSecret" is required', details: { id: 'epo-ops' },
    })
  })

  it('reports a missing key as a failed test without calling anything', async () => {
    const { controller, fetchSpy } = await bench()
    const signal = new AbortController().signal
    expect(await controller.test('epo-ops', signal)).toEqual({ ok: false, message: 'EPO OPS key not configured' })
    expect(await controller.test('uspto-odp', signal)).toEqual({ ok: false, message: 'USPTO ODP key not configured' })
    expect(await controller.test('semantic-scholar', signal)).toEqual({ ok: false, message: 'Semantic Scholar key not configured' })
    expect(await controller.test('mistral', signal)).toEqual({ ok: false, message: 'Mistral key not configured' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('runs one cheap call per stored connector, verifies the Mistral key with one GET, and folds an upstream refusal into a failed test', async () => {
    const { controller, fetchSpy } = await bench()
    const signal = new AbortController().signal
    await controller.set('epo-ops', { consumerKey: 'ck', consumerSecret: 'cs' })
    await controller.set('mistral', { apiKey: 'mk' })
    fetchSpy.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ access_token: 'tok', expires_in: '1200' }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })))
    expect(await controller.test('epo-ops', signal)).toEqual({ ok: true, message: 'EPO OPS: access token issued' })
    expect(fetchSpy.mock.calls[0]?.[0]).toBe('https://ops.epo.org/3.2/auth/accesstoken')
    expect(await controller.test('mistral', signal)).toEqual({ ok: true, message: 'Mistral: Mistral accepted the key.' })
    const [mistralUrl, mistralInit] = fetchSpy.mock.calls[1] ?? []
    expect(mistralUrl).toBe('https://api.mistral.ai/v1/models')
    expect(new Headers(mistralInit?.headers).get('authorization')).toBe('Bearer mk')

    fetchSpy.mockImplementation(() => Promise.resolve(new Response('denied', { status: 401 })))
    await controller.set('uspto-odp', { apiKey: 'bad' })
    const rejected = await controller.test('uspto-odp', signal)
    expect(rejected.ok).toBe(false)
    expect(rejected.message).toContain('USPTO ODP')
    expect(await controller.test('mistral', signal)).toEqual({ ok: false, message: 'Mistral: Mistral rejected the key (HTTP 401).' })
  })

  it('tests a Mistral record with a gateway baseUrl by one OCR page at that base, and reports an invalid baseUrl without a call', async () => {
    const { controller, credentials, fetchSpy } = await bench()
    const signal = new AbortController().signal
    const mistral = parseCredentialKey('flowleap-connectors/mistral')
    credentials.records.set(mistral, { kind: 'grant', payload: { apiKey: 'virtual', baseUrl: 'http://flowleap-gateway:4000' } })
    fetchSpy.mockImplementation(() => Promise.resolve(Response.json({ pages: [{ index: 0, markdown: '' }] })))
    expect(await controller.test('mistral', signal)).toEqual({ ok: true, message: 'Mistral: Mistral accepted the key.' })
    const [url, init] = fetchSpy.mock.calls[0] ?? []
    expect(url).toBe('http://flowleap-gateway:4000/v1/ocr')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer virtual')

    credentials.records.set(mistral, { kind: 'grant', payload: { apiKey: 'virtual', baseUrl: 'ftp://flowleap-gateway' } })
    expect(await controller.test('mistral', signal)).toEqual({
      ok: false,
      message: 'Mistral: The Mistral base URL "ftp://flowleap-gateway" is not allowed: use https, or http only to a host name without dots.',
    })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('refuses field values that are not strings as gateway/bad-request', async () => {
    const { controller, credentials } = await bench()
    const values = JSON.parse('{"apiKey":5}') as Record<string, string>
    await expect(controller.set('mistral', values)).rejects.toMatchObject({ code: 'gateway/bad-request' })
    expect(credentials.records.size).toBe(0)
  })

  it('reports a store refusal that is not an Error as flowleap-connectors/rejected with its text', async () => {
    const { controller, credentials } = await bench()
    credentials.modifyRecord = async () => {
      throw 'disk full'
    }
    await expect(controller.set('mistral', { apiKey: 'mk' })).rejects.toMatchObject({
      code: 'flowleap-connectors/rejected', message: 'disk full', details: { id: 'mistral' },
    })
  })

  it('tests USPTO ODP by one lookup of a known application, reporting the answer or the upstream refusal', async () => {
    const { controller, fetchSpy } = await bench()
    const signal = new AbortController().signal
    await controller.set('uspto-odp', { apiKey: 'ok' })
    fetchSpy.mockImplementation(() => Promise.resolve(Response.json({ count: 1, patentFileWrapperDataBag: [] })))
    expect(await controller.test('uspto-odp', signal)).toEqual({ ok: true, message: 'USPTO ODP: application 15043224 answered' })
    expect(fetchSpy.mock.calls[0]?.[0]).toEqual(expect.stringContaining('/patent/applications/15043224'))

    fetchSpy.mockImplementation(() => Promise.resolve(new Response('bad request', { status: 400 })))
    const refused = await controller.test('uspto-odp', signal)
    expect(refused.ok).toBe(false)
    expect(refused.message).toMatch(/^USPTO ODP: ./)
  })

  it('tests Semantic Scholar by one one-paper search, reporting the answer or the failed search', async () => {
    const { controller, fetchSpy } = await bench()
    const signal = new AbortController().signal
    await controller.set('semantic-scholar', { apiKey: 'sk' })
    fetchSpy.mockImplementation(() => Promise.resolve(new Response('bad request', { status: 400 })))
    const failed = await controller.test('semantic-scholar', signal)
    expect(failed.ok).toBe(false)
    expect(failed.message).toContain('Semantic Scholar: Every academic source failed')

    fetchSpy.mockImplementation(() => Promise.resolve(Response.json({ total: 1, data: [{ title: 'T', paperId: 'p1', authors: [], year: 2020 }] })))
    expect(await controller.test('semantic-scholar', signal)).toEqual({ ok: true, message: 'Semantic Scholar: search answered' })
  })

  it('folds a probe failure that is not an Error into a failed test with its text', async () => {
    const { controller, credentials, fetchSpy } = await bench()
    await controller.set('epo-ops', { consumerKey: 'ck', consumerSecret: 'cs' })
    const readRecord = credentials.readRecord.bind(credentials)
    let reads = 0
    credentials.readRecord = async (key) => {
      if (++reads > 1) throw 'keychain locked'
      return readRecord(key)
    }
    expect(await controller.test('epo-ops', new AbortController().signal)).toEqual({ ok: false, message: 'EPO OPS: keychain locked' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
