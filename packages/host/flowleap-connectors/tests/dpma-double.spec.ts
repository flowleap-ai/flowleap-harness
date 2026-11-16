import { Context } from '@deepseek-ai/cordis'
import { createConnectors, DPMA_BASE_URL, type Connectors } from '@flowleap/connectors'
import { describe, expect, it, vi } from 'vitest'
import { createConnectorHost, createCredentialStore } from '@deepseek-ai/dsh-flowleap-connectors'
import { createDpmaDouble, type DpmaDouble, type DpmaDoubleData } from './dpma-double/double.ts'
import { DOUBLE_ACCOUNT, SAMPLE_MARKER, fixtureData } from './dpma-double/fixture-data.ts'
import { startDpmaDoubleServer } from './dpma-double/server.ts'
import { MemoryCredentials } from './memory-credentials.ts'

/** The URL of one request. */
function href(input: string | URL | Request): string {
  if (typeof input === 'string') return input
  return input instanceof URL ? input.href : input.url
}

/** The library on a host whose network is the double, linked with the given DPMA access. */
async function linked(
  double: DpmaDouble, access: { username: string; password: string } = DOUBLE_ACCOUNT,
): Promise<{ connectors: Connectors; calls: ReturnType<typeof vi.fn<typeof fetch>> }> {
  const ctx = new Context()
  const store = createCredentialStore(new MemoryCredentials(ctx))
  await store.write('dpma', { username: access.username, password: access.password })
  const calls = vi.fn<typeof fetch>((input, init) => double.fetch(href(input), init))
  const bound = createConnectorHost({ store, logger: ctx.logger, cacheEntries: 10, fetch: calls })
  return { connectors: createConnectors(bound.host), calls }
}

/** The recorded record with other values, as one more file of a data set. */
function variant(xml: string, changes: Readonly<Record<string, string>>): string {
  return Object.entries(changes).reduce((text, [from, to]) => text.replaceAll(from, to), xml)
}

describe('the DPMA double on the recorded register record', () => {
  it('answers the version, a search and a register record to the DPMA register connector', async () => {
    const { connectors, calls } = await linked(await createDpmaDouble(fixtureData(), DOUBLE_ACCOUNT))
    expect(await connectors.dpma.getVersion()).toEqual({ ok: true, data: '8.26.0-b12' })

    const search = await connectors.dpma.searchRegister('VTR=Kuhnen UND AT>=01.01.2000')
    if (!search.ok) throw new Error(search.error.message)
    expect(search.data).toMatchObject({ hitCount: 1, limited: false })
    expect(search.data.hits[0]).toMatchObject({
      leadingRegisteredNumber: '100273602', registeredNumber: '10027360.2', type: 'Patent', legalStatus: 'Not pending/lapsed',
      title: 'Dreh-Energieumsetzer für ein Hybrid-Elektrofahrzeug', applicationDate: '2000-06-02',
      applicants: ['DENSO CORPORATION, Kariya-city, Aichi-pref., JP'],
      agent: 'KUHNEN & WACKER Patent- und Rechtsanwaltsbüro, 85354 Freising, DE',
    })

    // The key of the hit reads the record: the two steps of a docket import.
    const record = await connectors.dpma.getRegisterInfo(search.data.hits[0]!.leadingRegisteredNumber)
    expect(record).toMatchObject({ ok: true, data: { applicationNumber: '10027360.2', status: 'nicht-anhaengig-erloschen' } })
    expect(calls.mock.calls.map(([url]) => href(url))).toEqual([
      `${DPMA_BASE_URL}/DPMAregisterPatService/version`,
      `${DPMA_BASE_URL}/DPMAregisterPatService/search/${encodeURIComponent('VTR=Kuhnen UND AT>=01.01.2000')}`,
      `${DPMA_BASE_URL}/DPMAregisterPatService/getRegisterInfo/100273602`,
    ])
  })

  it('answers a search with no hit as an empty list', async () => {
    const { connectors } = await linked(await createDpmaDouble(fixtureData(), DOUBLE_ACCOUNT))
    for (const query of ['INH=Siemens', 'TI=Elektrofahrzeug UND AT<=01.01.1990', 'AKZ=102019105526']) {
      expect(await connectors.dpma.searchRegister(query)).toEqual({ ok: true, data: { hitCount: 0, limited: false, hits: [] } })
    }
    expect(await connectors.dpma.searchRegister('AKZ=10027360.2')).toMatchObject({ ok: true, data: { hitCount: 1 } })
    expect(await connectors.dpma.searchRegister('TI=hybrid? AND INH="DENSO"')).toMatchObject({ ok: true, data: { hitCount: 1 } })
  })

  it('refuses a query that it cannot read, as the DPMA does', async () => {
    const { connectors } = await linked(await createDpmaDouble(fixtureData(), DOUBLE_ACCOUNT))
    for (const query of ['(', 'TI=Motor ODER TI=Rotor', 'IC=H02K', 'AT>=2000-01-01', 'TI>=Motor']) {
      const result = await connectors.dpma.searchRegister(query)
      expect(result, query).toMatchObject({ ok: false, error: { kind: 'query' } })
      if (!result.ok) expect(result.error.message).toContain('not admissible at this place')
    }
  })

  it('refuses a wrong user name or password', async () => {
    const { connectors } = await linked(await createDpmaDouble(fixtureData(), DOUBLE_ACCOUNT), { username: DOUBLE_ACCOUNT.username, password: 'wrong' })
    expect(await connectors.dpma.getVersion()).toEqual({ ok: false, error: { kind: 'auth', message: 'Authentification failed', status: 401 } })
    expect(await connectors.dpma.searchRegister('TI=Motor')).toMatchObject({ ok: false, error: { kind: 'auth' } })
  })

  it('answers "data not available" for an unknown file and for each register extract', async () => {
    const { connectors } = await linked(await createDpmaDouble(fixtureData(), DOUBLE_ACCOUNT))
    expect(await connectors.dpma.getRegisterInfo('102019105526')).toMatchObject({ ok: false, error: { kind: 'not_available', message: 'Data not available' } })
    expect(await connectors.dpma.getRegisterExtract('2026-11-16', 'daily')).toMatchObject({ ok: false, error: { kind: 'not_available' } })
  })

  it('cuts a hit list at the hit limit of the account and says so', async () => {
    const base = fixtureData()
    const xml = base.records[0]!.xml
    const data: DpmaDoubleData = {
      ...base,
      records: [
        ...base.records,
        { leadingRegisteredNumber: '100273610', xml: variant(xml, { '10027360.2': '10027361.0', 'Dreh-Energieumsetzer': 'Zweiter Dreh-Energieumsetzer' }) },
        { leadingRegisteredNumber: '100273629', xml: variant(xml, { '10027360.2': '10027362.9', 'Dreh-Energieumsetzer': 'Dritter Dreh-Energieumsetzer' }) },
      ],
    }
    const { connectors } = await linked(await createDpmaDouble(data, { ...DOUBLE_ACCOUNT, hitLimit: 2 }))
    const cut = await connectors.dpma.searchRegister('INH=DENSO')
    if (!cut.ok) throw new Error(cut.error.message)
    expect(cut.data).toMatchObject({ hitCount: 3, limited: true })
    expect(cut.data.hits.map(hit => hit.leadingRegisteredNumber)).toEqual(['100273602', '100273610'])
    expect(await connectors.dpma.searchRegister('TI=Dritter')).toMatchObject({ ok: true, data: { hitCount: 1, limited: false } })
  })

  it('refuses a data set with a record that is not a register record', async () => {
    await expect(createDpmaDouble({ label: 'bad', version: '1', records: [{ leadingRegisteredNumber: '1', xml: '<other/>' }] }, DOUBLE_ACCOUNT))
      .rejects.toThrow('DPMA double: record 1 of "bad"')
  })

  it('answers 404 outside the patent service and 405 to a write', async () => {
    const double = await createDpmaDouble(fixtureData(), DOUBLE_ACCOUNT)
    const authorization = `Basic ${Buffer.from(`${DOUBLE_ACCOUNT.username}:${DOUBLE_ACCOUNT.password}`).toString('base64')}`
    expect((await double.fetch(`${DPMA_BASE_URL}/DPMAregisterMarkeService/version`, { headers: { authorization } })).status).toBe(404)
    expect((await double.fetch(`${DPMA_BASE_URL}/DPMAregisterPatService/getPublikationsdaten_XML/202601`, { headers: { authorization } })).status).toBe(404)
    expect((await double.fetch(`${DPMA_BASE_URL}/DPMAregisterPatService/version`, { method: 'POST', headers: { authorization } })).status).toBe(405)
  })

  it('names its data as sample data', () => {
    expect(fixtureData().label).toBe(SAMPLE_MARKER)
    expect(SAMPLE_MARKER).toContain('not a live DPMA answer')
  })
})

describe('the DPMA double as a server', () => {
  it('answers over HTTP to a host whose dpmaBaseUrl is the server', async () => {
    const server = await startDpmaDoubleServer({ port: 0, data: fixtureData(), account: DOUBLE_ACCOUNT })
    try {
      const ctx = new Context()
      const store = createCredentialStore(new MemoryCredentials(ctx))
      await store.write('dpma', { username: DOUBLE_ACCOUNT.username, password: DOUBLE_ACCOUNT.password })
      const network = vi.fn<typeof fetch>((input, init) => fetch(input, init))
      const bound = createConnectorHost({ store, logger: ctx.logger, cacheEntries: 10, fetch: network, dpmaBaseUrl: server.baseUrl })
      const { dpma } = createConnectors(bound.host)
      expect(await dpma.getVersion()).toEqual({ ok: true, data: '8.26.0-b12' })
      expect(await dpma.getRegisterInfo('100273602')).toMatchObject({ ok: true, data: { applicationNumber: '10027360.2' } })
      expect(href(network.mock.calls[0]![0])).toBe(`${server.baseUrl}/DPMAregisterPatService/version`)
      expect(server.double.leadingRegisteredNumbers).toEqual(['100273602'])
    } finally {
      await server.close()
    }
  })
})

describe('the dpmaBaseUrl of the connector host', () => {
  it('moves only DPMA calls to the configured base', async () => {
    const ctx = new Context()
    const network = vi.fn<typeof fetch>(() => Promise.resolve(new Response('')))
    const { host } = createConnectorHost({
      store: createCredentialStore(new MemoryCredentials(ctx)), logger: ctx.logger, cacheEntries: 1, fetch: network, dpmaBaseUrl: 'http://127.0.0.1:8291/dpmaws/rest-services',
    })
    await host.fetch(`${DPMA_BASE_URL}/DPMAregisterPatService/version`)
    await host.fetch(new URL('https://ops.epo.org/3.2/rest-services/register'))
    await host.fetch(`${DPMA_BASE_URL}-other/x`)
    expect(network.mock.calls.map(([url]) => href(url))).toEqual([
      'http://127.0.0.1:8291/dpmaws/rest-services/DPMAregisterPatService/version',
      'https://ops.epo.org/3.2/rest-services/register',
      `${DPMA_BASE_URL}-other/x`,
    ])
  })
})
