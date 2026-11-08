import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  commandRequest, createFirmRecord, hitKey, hitsHash, newClientId, normalizeName, sha256Hex, RECORDS_LINK,
  type Hit, type PartyId, type RecordCommand,
} from '../src/client/add-client/records.ts'
import { AS_OF, SCHUBERT_ID, SYNTEGON_ID } from './add-client-fakes.client.ts'

afterEach(() => { vi.restoreAllMocks() })

const hit = (extra: Partial<Hit> = {}): Hit => ({
  applicationNumber: 'EP16188900', otherParty: 'Gerhard Schubert GmbH', otherPartyRole: 'patent-owner',
  existingClientId: SYNTEGON_ID, existingClientParty: 'Syntegon Packaging Systems AG', source: 'ep-register', asOf: AS_OF, ...extra,
})

describe('names, keys and hashes of the contract', () => {
  it('normalizes a name with NFKC, lower case, no punctuation and single spaces', () => {
    expect(normalizeName('  SYNTEGON  Packaging-Systems, A.G. ')).toBe('syntegon packagingsystems ag')
    expect(normalizeName('ＳＹＮＴＥＧＯＮ\tGmbH')).toBe('syntegon gmbh')
  })

  it('hashes with SHA-256 in hex, and hashes no hit as none', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(await hitsHash([])).toBe('none')
    const one = hit()
    const two = hit({ applicationNumber: 'EP12345678', otherPartyRole: 'opponent' })
    expect(hitKey(one)).toBe(`EP16188900|${SYNTEGON_ID}|patent-owner|gerhard schubert gmbh`)
    expect(await hitsHash([two, one])).toBe(await sha256Hex([hitKey(two), hitKey(one)].sort().join('\n')))
    expect(await hitsHash([two, one])).toBe(await hitsHash([one, two]))
  })

  it('makes a client id as a UUID in lower case', () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('6F1C2A40-1B2C-4D3E-8F90-A1B2C3D4E5F6')
    expect(newClientId()).toBe('6f1c2a40-1b2c-4d3e-8f90-a1b2c3d4e5f6')
  })

  it('sends each command to its path with its body and its deterministic key', async () => {
    const nameKey = await sha256Hex('syntegon technology')
    const requests = await Promise.all(([
      { kind: 'conflict-check', clientId: SCHUBERT_ID, hits: [{ ...hit(), opposedOn: '2025-01-08', status: 'Patent revoked' } as Hit], reason: 'Closed.' },
      { kind: 'conflict-check', clientId: SYNTEGON_ID, hits: [] },
      { kind: 'client', clientId: SYNTEGON_ID, name: 'Syntegon', role: 'client' },
      { kind: 'name', clientId: SYNTEGON_ID, name: { name: 'SYNTEGON TECHNOLOGY', source: 'patstat', edition: '2026 Spring', applications: 600 } },
      { kind: 'party', name: 'Syntegon Technology GmbH' },
      { kind: 'application', clientId: SYNTEGON_ID, application: { applicationNumber: 'EP23171862', publicationNumber: 'EP4292805A1', title: 'T', representativeSince: '2024-07-24', basis: 'register' } },
      { kind: 'application', clientId: SYNTEGON_ID, application: { applicationNumber: 'EP23171863', publicationNumber: 'EP4292805', basis: 'claimed' } },
      { kind: 'role', applicationNumber: 'EP23171862', partyId: 'party-1' as PartyId, role: 'applicant', clientId: SYNTEGON_ID },
    ] satisfies RecordCommand[]).map(commandRequest))
    expect(requests).toEqual([
      { path: `clients/${SCHUBERT_ID}/conflict-check`, body: { hits: [{ ...hit(), publicationNumber: undefined, title: undefined }], reason: 'Closed.' }, key: `add-client:${SCHUBERT_ID}:conflict:${await hitsHash([hit()])}` },
      { path: `clients/${SYNTEGON_ID}/conflict-check`, body: { hits: [] }, key: `add-client:${SYNTEGON_ID}:conflict:none` },
      { path: 'clients', body: { clientId: SYNTEGON_ID, name: 'Syntegon', role: 'client' }, key: `add-client:${SYNTEGON_ID}` },
      { path: `clients/${SYNTEGON_ID}/names`, body: { name: 'SYNTEGON TECHNOLOGY', source: 'patstat', edition: '2026 Spring', applications: 600 }, key: `add-client:${SYNTEGON_ID}:name:${nameKey}` },
      { path: 'parties', body: { name: 'Syntegon Technology GmbH' }, key: `party:${await sha256Hex('syntegon technology gmbh')}` },
      { path: `clients/${SYNTEGON_ID}/applications`, body: { applicationNumber: 'EP23171862', publicationNumber: 'EP4292805A1', title: 'T', representativeSince: '2024-07-24', basis: 'register' }, key: `add-client:${SYNTEGON_ID}:application:EP23171862` },
      { path: `clients/${SYNTEGON_ID}/applications`, body: { applicationNumber: 'EP23171863', basis: 'claimed' }, key: `add-client:${SYNTEGON_ID}:application:EP23171863` },
      { path: 'applications/EP23171862/roles', body: { partyId: 'party-1', role: 'applicant', clientId: SYNTEGON_ID }, key: 'role:EP23171862:party-1:applicant' },
    ])
    // The key charset of the Firm Record.
    for (const { key } of requests) expect(key).toMatch(/^[\w.:-]{8,128}$/)
    expect(JSON.stringify(requests[0]!.body)).not.toContain('opposedOn')
  })

  it('sends a publication number only with its kind code and a title only of 1 to 1000 characters, as the contract takes them', async () => {
    const register = hit({ publicationNumber: 'EP4292805', title: 'x'.repeat(1001) })
    const published = hit({ applicationNumber: 'EP12345678', publicationNumber: 'EP4292805A1', title: 'Packaging' })
    const check = await commandRequest({ kind: 'conflict-check', clientId: SCHUBERT_ID, hits: [register, published], reason: 'Closed.' })
    expect(check.body['hits']).toEqual([
      { applicationNumber: 'EP16188900', otherParty: 'Gerhard Schubert GmbH', otherPartyRole: 'patent-owner', existingClientId: SYNTEGON_ID, existingClientParty: 'Syntegon Packaging Systems AG', source: 'ep-register', asOf: AS_OF },
      { ...published },
    ])
    const application = await commandRequest({ kind: 'application', clientId: SYNTEGON_ID, application: { applicationNumber: 'EP23171862', publicationNumber: 'EP4292805', title: '  ', basis: 'register' } })
    expect(application.body).toEqual({ applicationNumber: 'EP23171862', basis: 'register' })
  })
})

/** The answers of a Records service, by path; a function answers from the request. */
function service(routes: Record<string, Response | ((init: RequestInit) => Response)>) {
  const calls: [string, RequestInit][] = []
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    calls.push([url, init ?? {}])
    const route = routes[url]
    if (route === undefined) throw new TypeError('Failed to fetch')
    return typeof route === 'function' ? route(init ?? {}) : route.clone()
  }
  return { fetchImpl, calls }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const LINK = json({ href: 'records/' })
const CLIENT = { clientId: SYNTEGON_ID, name: 'Syntegon', role: 'client', addedAt: AS_OF, addedBy: { id: 'p-1', name: 'Dr. Anna Becker' }, names: [{ name: 'SYNTEGON TECHNOLOGY', source: 'patstat', edition: '2026 Spring', applications: 600 }], applications: 16 }

describe('the Firm Record client', () => {
  it('reads the clients under the records link with the person\'s cookie, and keeps only the fields it uses', async () => {
    const { fetchImpl, calls } = service({
      [RECORDS_LINK]: LINK,
      'records/api/clients': json({ clients: [CLIENT, { clientId: SCHUBERT_ID, name: 'Gerhard Schubert', role: 'watch', addedAt: AS_OF, addedBy: null, extra: 1 }] }),
    })
    const record = createFirmRecord(fetchImpl)
    const result = await record.clients()
    expect(result).toEqual({ ok: true, value: [
      { ...CLIENT },
      { clientId: SCHUBERT_ID, name: 'Gerhard Schubert', role: 'watch', addedAt: AS_OF, addedBy: { id: null, name: null }, names: [], applications: 0 },
    ] })
    expect(calls.map(([url, init]) => [url, init.credentials])).toEqual([[RECORDS_LINK, 'include'], ['records/api/clients', 'include']])
    // The records link is read once.
    await record.clients(new AbortController().signal)
    expect(calls.filter(([url]) => url === RECORDS_LINK)).toHaveLength(1)
  })

  it('reads a client with its names, applications, roles and conflict checks', async () => {
    const { fetchImpl } = service({
      [RECORDS_LINK]: LINK,
      [`records/api/clients/${SYNTEGON_ID}`]: json({
        client: { ...CLIENT, addedBy: { id: null, name: null } },
        names: [{ name: 'SYNTEGON TECHNOLOGY', source: 'patstat', edition: null, applications: null }],
        applications: [
          { applicationNumber: 'EP23171862', publicationNumber: 'EP4292805A1', title: 'T', recordedAt: AS_OF, fileNumber: null, roles: [{ partyId: 'party-1', party: 'Syntegon Technology GmbH', role: 'applicant', clientId: SYNTEGON_ID }] },
          { applicationNumber: 'EP25712875', roles: [] },
        ],
        conflictChecks: [{ checkId: 'c-1', hitsHash: 'none', reason: null }],
      }),
    })
    const result = await createFirmRecord(fetchImpl).client(SYNTEGON_ID)
    expect(result).toEqual({ ok: true, value: {
      client: { ...CLIENT, addedBy: { id: null, name: null } },
      names: [{ name: 'SYNTEGON TECHNOLOGY', source: 'patstat' }],
      applications: [
        { applicationNumber: 'EP23171862', publicationNumber: 'EP4292805A1', title: 'T', roles: [{ partyId: 'party-1', party: 'Syntegon Technology GmbH', role: 'applicant' }] },
        { applicationNumber: 'EP25712875', roles: [] },
      ],
      conflictChecks: ['none'],
    } })
  })

  it('names the path of the first value that does not match the contract', async () => {
    const cases: [unknown, string][] = [
      [[], 'body'],
      [{ clients: {} }, 'body.clients'],
      [{ clients: [{ ...CLIENT, clientId: 'not-a-uuid' }] }, 'body.clients[0].clientId'],
      [{ clients: [{ ...CLIENT, role: 'friend' }] }, 'body.clients[0].role'],
      [{ clients: [{ ...CLIENT, applications: 'many' }] }, 'body.clients[0].applications'],
      [{ clients: [{ ...CLIENT, names: [{ name: 'X', source: 'web' }] }] }, 'body.clients[0].names[0].source'],
      [{ clients: [{ ...CLIENT, addedBy: { id: 4 } }] }, 'body.clients[0].addedBy.id'],
      [{ clients: [{ ...CLIENT, name: 7 }] }, 'body.clients[0].name'],
    ]
    for (const [body, path] of cases) {
      const { fetchImpl } = service({ [RECORDS_LINK]: LINK, 'records/api/clients': json(body) })
      expect(await createFirmRecord(fetchImpl).clients()).toEqual({ ok: false, error: { kind: 'malformed', path } })
    }
    const party = service({ [RECORDS_LINK]: LINK, [`records/api/clients/${SYNTEGON_ID}`]: json({ client: CLIENT, names: [], applications: [{ applicationNumber: 'EP1', roles: [{ partyId: 'bad id!', party: 'X', role: 'applicant' }] }], conflictChecks: [] }) })
    expect(await createFirmRecord(party.fetchImpl).client(SYNTEGON_ID)).toEqual({ ok: false, error: { kind: 'malformed', path: 'body.applications[0].roles[0].partyId' } })
    const notJson = service({ [RECORDS_LINK]: LINK, 'records/api/clients': new Response('<html>', { status: 200 }) })
    expect(await createFirmRecord(notJson.fetchImpl).clients()).toEqual({ ok: false, error: { kind: 'malformed', path: 'body' } })
  })

  it('uses the global fetch by default', async () => {
    const fetchImpl = vi.fn(async () => new Response('missing', { status: 404 }))
    vi.stubGlobal('fetch', fetchImpl)
    expect(await createFirmRecord().clients()).toEqual({ ok: false, error: { kind: 'unavailable' } })
    expect(fetchImpl).toHaveBeenCalledWith(RECORDS_LINK, { credentials: 'include', cache: 'no-store' })
    vi.unstubAllGlobals()
  })

  it('is unavailable without a records link, and reads the link again on the next call', async () => {
    const routes: Record<string, Response | (() => Response)> = { [RECORDS_LINK]: new Response('missing', { status: 404 }) }
    const { fetchImpl } = service(routes)
    const record = createFirmRecord(fetchImpl)
    expect(await record.clients()).toEqual({ ok: false, error: { kind: 'unavailable' } })
    routes[RECORDS_LINK] = json({ href: 'records' })
    expect(await record.clients()).toEqual({ ok: false, error: { kind: 'unavailable' } })
    routes[RECORDS_LINK] = () => { throw new TypeError('Failed to fetch') }
    expect(await record.clients()).toEqual({ ok: false, error: { kind: 'unavailable' } })
    routes[RECORDS_LINK] = json({ href: 'records/' })
    routes['records/api/clients'] = json({ clients: [] })
    expect(await record.clients()).toEqual({ ok: true, value: [] })
  })

  it('sends a command with its key, and takes 200 and 201 as recorded', async () => {
    const { fetchImpl, calls } = service({
      [RECORDS_LINK]: LINK,
      'records/api/clients': json({ clientId: SYNTEGON_ID, recordSeq: 7 }, 201),
      'records/api/parties': json({ partyId: 'party-3', recordSeq: 2 }, 200),
      [`records/api/clients/${SYNTEGON_ID}/conflict-check`]: json({ checkId: 'c-1', hitsHash: 'none', recordSeq: 6 }, 201),
    })
    const record = createFirmRecord(fetchImpl)
    expect(await record.send({ kind: 'client', clientId: SYNTEGON_ID, name: 'Syntegon', role: 'client' })).toEqual({ ok: true, value: { kind: 'recorded' } })
    expect(await record.send({ kind: 'party', name: 'Syntegon Technology GmbH' })).toEqual({ ok: true, value: { kind: 'party', partyId: 'party-3' } })
    expect(await record.send({ kind: 'conflict-check', clientId: SYNTEGON_ID, hits: [] })).toEqual({ ok: true, value: { kind: 'recorded' } })
    const [, init] = calls[1]!
    expect([init.method, (init.headers as Record<string, string>)['idempotency-key'], init.body]).toEqual(['POST', `add-client:${SYNTEGON_ID}`, JSON.stringify({ clientId: SYNTEGON_ID, name: 'Syntegon', role: 'client' })])
  })

  it('refuses an answer whose hits hash is not the one its key names, or that has no record position', async () => {
    const { fetchImpl } = service({
      [RECORDS_LINK]: LINK,
      [`records/api/clients/${SYNTEGON_ID}/conflict-check`]: json({ checkId: 'c-1', hitsHash: 'abc', recordSeq: 6 }, 201),
      'records/api/clients': json({ clientId: SYNTEGON_ID }, 201),
    })
    const record = createFirmRecord(fetchImpl)
    expect(await record.send({ kind: 'conflict-check', clientId: SYNTEGON_ID, hits: [] })).toEqual({ ok: false, error: { kind: 'malformed', path: 'body.hitsHash' } })
    expect(await record.send({ kind: 'client', clientId: SYNTEGON_ID, name: 'Syntegon', role: 'client' })).toEqual({ ok: false, error: { kind: 'malformed', path: 'body.recordSeq' } })
  })

  it('keeps the refusal code of the contract, the client id that it names, and the status', async () => {
    const send = async (response: Response | undefined) => {
      const { fetchImpl } = service(response === undefined ? { [RECORDS_LINK]: LINK } : { [RECORDS_LINK]: LINK, 'records/api/clients': response })
      return createFirmRecord(fetchImpl).send({ kind: 'client', clientId: SYNTEGON_ID, name: 'Syntegon', role: 'client' })
    }
    expect(await send(json({ error: 'client-exists', clientId: SCHUBERT_ID }, 409))).toEqual({ ok: false, error: { kind: 'refused', status: 409, code: 'client-exists', clientId: SCHUBERT_ID } })
    expect(await send(json({ error: 'not-allowed-to-decide-conflict', detail: 'x' }, 403))).toEqual({ ok: false, error: { kind: 'refused', status: 403, code: 'not-allowed-to-decide-conflict' } })
    expect(await send(json({ error: 'idempotency-key-reused' }, 409))).toEqual({ ok: false, error: { kind: 'refused', status: 409, code: 'idempotency-key-reused' } })
    expect(await send(json({ error: 'invalid-body', detail: 'hits[0].publicationNumber' }, 400))).toEqual({ ok: false, error: { kind: 'refused', status: 400, code: 'invalid-body' } })
    expect(await send(json({ error: 'brand-new-code', clientId: 'not-a-uuid' }, 409))).toEqual({ ok: false, error: { kind: 'refused', status: 409, code: null } })
    expect(await send(new Response('Forbidden', { status: 403 }))).toEqual({ ok: false, error: { kind: 'refused', status: 403, code: null } })
    expect(await send(new Response('', { status: 502 }))).toEqual({ ok: false, error: { kind: 'service', status: 502 } })
    expect(await send(undefined)).toEqual({ ok: false, error: { kind: 'network' } })
  })
})
