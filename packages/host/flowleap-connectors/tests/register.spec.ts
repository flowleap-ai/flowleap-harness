import { readFile } from 'node:fs/promises'
import { Context } from '@deepseek-ai/cordis'
import { createConnectors, type RegisterEventsResponse } from '@flowleap/connectors'
import { describe, expect, it, vi } from 'vitest'
import {
  FlowleapConnectorsController, FlowleapRegister, createConnectorHost, createCredentialStore, entriesFromOdp, entriesFromOps,
  parseRegisterApplication, type RegisterApplication,
} from '@deepseek-ai/dsh-flowleap-connectors'
import { MemoryCredentials } from './memory-credentials.ts'

async function fixture(name: string): Promise<string> {
  return readFile(new URL(`./fixtures/register/${name}`, import.meta.url), 'utf8')
}

function application(input: string): RegisterApplication {
  const parsed = parseRegisterApplication(input)
  if (parsed === undefined) throw new Error(`not an application: ${input}`)
  return parsed
}

describe('parseRegisterApplication', () => {
  it('normalizes EP publications and US applications as attorneys write them', () => {
    expect(parseRegisterApplication('EP 3 456 789')).toBe('EP3456789')
    expect(parseRegisterApplication('ep3456789a1')).toBe('EP3456789')
    expect(parseRegisterApplication('US 17/123,456')).toBe('US17123456')
    expect(parseRegisterApplication('US17123456')).toBe('US17123456')
  })

  it('refuses other offices and forms', () => {
    expect(parseRegisterApplication('WO 2020/123456')).toBeUndefined()
    expect(parseRegisterApplication('EP 345678')).toBeUndefined()
    expect(parseRegisterApplication('US 17/123')).toBeUndefined()
  })
})

describe('register entries from recorded responses', () => {
  it('maps the EP Register events of EP 3 456 789 with ISO dates', async () => {
    const recorded = JSON.parse(await fixture('ep3456789a1-events.json')) as RegisterEventsResponse
    const entries = entriesFromOps(recorded.events)
    expect(entries).toHaveLength(5)
    expect(entries[0]).toEqual({ date: '2020-12-18', code: '7', description: 'No opposition filed within time limit' })
  })

  it('maps the USPTO transactions of US 17/123,456 and keeps repeated events', async () => {
    const entries = entriesFromOdp(JSON.parse(await fixture('us17123456-transactions.json')))
    expect(entries).toHaveLength(49)
    expect(entries.filter(entry => entry.code === 'ELC_RVW' && entry.date === '2023-07-11')).toHaveLength(2)
    expect(entries).toContainEqual({ date: '2022-10-06', code: 'CTNF', description: 'Non-Final Rejection' })
  })

  it('keeps ISO dates and maps missing texts to empty ones', () => {
    expect(entriesFromOps([{ code: '7', date: '2020-12-18', description: null }]))
      .toEqual([{ date: '2020-12-18', code: '7', description: '' }])
    expect(entriesFromOdp({ patentFileWrapperDataBag: [{ eventDataBag: [{ eventCode: 'CTNF', eventDate: '2022-10-06' }] }] }))
      .toEqual([{ date: '2022-10-06', code: 'CTNF', description: '' }])
    expect(entriesFromOdp({ patentFileWrapperDataBag: [{}] })).toEqual([])
    expect(entriesFromOdp({ patentFileWrapperDataBag: [] })).toEqual([])
  })

  it('refuses a body without the transaction fields', () => {
    expect(() => entriesFromOdp({ count: 0 })).toThrow()
  })
})

describe('the flowleapRegister service', () => {
  it('reads US transactions through the ODP client on the stored key', async () => {
    const ctx = new Context()
    const credentials = new MemoryCredentials(ctx)
    const store = createCredentialStore(credentials)
    const body = await fixture('us17123456-transactions.json')
    const fetchSpy = vi.fn<typeof fetch>(async () => new Response(body, { headers: { 'content-type': 'application/json' } }))
    const bound = createConnectorHost({ store, logger: ctx.logger, cacheEntries: 10, fetch: fetchSpy })
    const connectors = createConnectors(bound.host)
    await ctx.plugin(FlowleapConnectorsController, { store, connectors, bound })
    await ctx.flowleapConnectors.set('uspto-odp', { apiKey: 'key' })
    await ctx.plugin(FlowleapRegister, { connectors, bound })
    const entries = await ctx.flowleapRegister.read(application('US 17/123,456'))
    expect(entries).toHaveLength(49)
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('/patent/applications/17123456/transactions'), expect.anything())
  })

  it('refuses a US read without a USPTO ODP key', async () => {
    const ctx = new Context()
    const store = createCredentialStore(new MemoryCredentials(ctx))
    const fetchSpy = vi.fn<typeof fetch>(() => Promise.reject(new Error('no network in this spec')))
    const bound = createConnectorHost({ store, logger: ctx.logger, cacheEntries: 10, fetch: fetchSpy })
    await ctx.plugin(FlowleapRegister, { connectors: createConnectors(bound.host), bound })
    await expect(ctx.flowleapRegister.read(application('US 17/123,456'))).rejects.toThrow(/^USPTO ODP: /)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refuses an EP read without an EPO OPS key', async () => {
    const ctx = new Context()
    const store = createCredentialStore(new MemoryCredentials(ctx))
    const fetchSpy = vi.fn<typeof fetch>(() => Promise.reject(new Error('no network in this spec')))
    const bound = createConnectorHost({ store, logger: ctx.logger, cacheEntries: 10, fetch: fetchSpy })
    await ctx.plugin(FlowleapRegister, { connectors: createConnectors(bound.host), bound })
    await expect(ctx.flowleapRegister.read(application('EP3456789'))).rejects.toThrow()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
