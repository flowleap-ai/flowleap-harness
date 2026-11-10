// oxlint-disable typescript/no-deprecated -- the service reads FamilyMember.number, the DOCDB priority number the library still sends
import { Context } from '@deepseek-ai/cordis'
import {
  DataKeysRequiredError, ErrorCodes, REPRESENTATIVE_PUBLICATION_RULE, createConnectors,
  type AbstractResponse, type BiblioData, type ClaimsResponse, type RoutedClaims, type FamilyMember, type FamilyResponse,
  type ProviderReadFailure,
  type ProviderReadResult, type RegisterSearchItem, type RegisterSearchResponse,
} from '@flowleap/connectors'
import { describe, expect, it, vi } from 'vitest'
import {
  FlowleapConnectorsController, FlowleapPatentData, PatentDataError, createConnectorHost, createCredentialStore, createMyEpoLink,
  normalizeName, parseEpApplication, parseEpPublication,
  type EpApplicationNumber, type EpPublicationNumber, type PatentDataConnectors, type PatentDataFailure,
} from '@deepseek-ai/dsh-flowleap-connectors'
import { MemoryCredentials } from './memory-credentials.ts'

function application(input: string): EpApplicationNumber {
  const parsed = parseEpApplication(input)
  if (parsed === undefined) throw new Error(`not an application: ${input}`)
  return parsed
}

function publication(input: string): EpPublicationNumber {
  const parsed = parseEpPublication(input)
  if (parsed === undefined) throw new Error(`not a publication: ${input}`)
  return parsed
}

function ok<T>(data: T): ProviderReadResult<T> {
  return { ok: true, data, cached: false }
}

/** A library answer whose fields do not match the declared type, as a changed library would send it. */
function wrong<T extends object>(data: object): ProviderReadResult<T> {
  return { ok: true, data: data as T, cached: false }
}

function failed(status: number, code: string, cause?: unknown): ProviderReadFailure {
  return { ok: false, status, headers: {}, body: { success: false, error: { code, message: `${code} message` }, status }, cause }
}

function doc(overrides: Partial<RegisterSearchItem> = {}): RegisterSearchItem {
  return {
    docId: 'EP4292805',
    applicationNumber: 'EP23171862',
    title: 'Beispiel title',
    applicants: ['Beispiel Maschinenbau GmbH'],
    representatives: [],
    representativesChangeGazette: null,
    representativesChangeDate: null,
    opponents: [],
    status: null,
    dates: { filing: null, publication: null },
    ...overrides,
  }
}

function page(
  docs: RegisterSearchItem[],
  total = docs.length,
  range = { begin: 1, end: docs.length },
): ProviderReadResult<RegisterSearchResponse> {
  return ok({ total, returned: docs.length, query: 'q', range, docs })
}

function member(refType: FamilyMember['refType'], overrides: Partial<FamilyMember> = {}): FamilyMember {
  return { refType, country: 'US', number: '10374408', kind: null, date: null, publication: null, docdbApplication: null, ...overrides }
}

function familyResponse(members: FamilyMember[], publications: (string | null)[], overrides: Partial<FamilyResponse> = {}): FamilyResponse {
  return {
    docId: 'EP4292805',
    members,
    representatives: {
      rule: REPRESENTATIVE_PUBLICATION_RULE,
      members: publications.map(representativePublication => (
        { application: null, representativePublication, isGrant: false, publications: [] }
      )),
      note: '',
    },
    memberCount: publications.length,
    recordCount: members.length,
    ...overrides,
  }
}

/** The fakes of the library calls, and the service over them. */
async function bench() {
  const ctx = new Context()
  const store = createCredentialStore(new MemoryCredentials(ctx))
  await store.write('epo-ops', { consumerKey: 'key', consumerSecret: 'secret' })
  const bound = createConnectorHost({ store, logger: ctx.logger, cacheEntries: 10 })
  const ops = {
    searchRegister: vi.fn<PatentDataConnectors['ops']['searchRegister']>(),
    getFamily: vi.fn<PatentDataConnectors['ops']['getFamily']>(),
    getBiblio: vi.fn<PatentDataConnectors['ops']['getBiblio']>(),
    getAbstract: vi.fn<PatentDataConnectors['ops']['getAbstract']>(),
    getClaimsRouted: vi.fn<PatentDataConnectors['fulltext']['getClaimsRouted']>(),
  }
  const service = new FlowleapPatentData(ctx, { connectors: { ops, fulltext: ops, host: bound.host }, bound })
  return { ops, store, service }
}

function urlOf(input: Parameters<typeof fetch>[0]): string {
  return input instanceof Request ? input.url : input.toString()
}

async function failureOf(work: Promise<unknown>): Promise<PatentDataError> {
  const error = await work.then(() => undefined, (rejected: unknown) => rejected)
  if (!(error instanceof PatentDataError)) throw new Error('expected a PatentDataError')
  return error
}

describe('parseEpApplication', () => {
  it('normalizes the forms an attorney writes and drops a check digit after a dot', () => {
    expect(parseEpApplication('EP 23 171 862')).toBe('EP23171862')
    expect(parseEpApplication('ep23171862')).toBe('EP23171862')
    expect(parseEpApplication('EP23171862.1')).toBe('EP23171862')
    expect(parseEpApplication(' EP 23/171 862.1 ')).toBe('EP23171862')
  })

  it('refuses a publication, another office and a short number', () => {
    expect(parseEpApplication('EP4292805A1')).toBeUndefined()
    expect(parseEpApplication('EP2317186.2')).toBeUndefined()
    expect(parseEpApplication('US 17/123,456')).toBeUndefined()
    expect(parseEpApplication('EP231718620')).toBeUndefined()
  })
})

describe('parseEpPublication', () => {
  it('keeps the kind code when there is one', () => {
    expect(parseEpPublication('EP 4 292 805 A1')).toBe('EP4292805A1')
    expect(parseEpPublication('EP4292805A1')).toBe('EP4292805A1')
    expect(parseEpPublication('ep4292805b')).toBe('EP4292805B')
    expect(parseEpPublication('EP4292805')).toBe('EP4292805')
  })

  it('refuses an application number and other forms', () => {
    expect(parseEpPublication('EP23171862')).toBeUndefined()
    expect(parseEpPublication('WO2020123456')).toBeUndefined()
    expect(parseEpPublication('EP42928')).toBeUndefined()
  })
})

describe('normalizeName', () => {
  it('lowers case, removes punctuation and collapses spaces', () => {
    expect(normalizeName('  Procter & Gamble,  Co.  ')).toBe('procter gamble co')
    expect(normalizeName('MÜLLER-BBM GmbH')).toBe('müllerbbm gmbh')
    expect(normalizeName('Ｓｉｅｍｅｎｓ')).toBe('siemens')
  })

  it('answers an empty key for a name without a letter or digit', () => {
    expect(normalizeName(' - & . ')).toBe('')
  })
})

describe('searchRegister', () => {
  it('maps a register page to rows with ISO dates and leaves absent fields out', async () => {
    const { ops, service } = await bench()
    ops.searchRegister.mockResolvedValue(page([
      doc({
        representatives: [{ name: 'Muster, Erika', country: 'DE', address: ['Musterstrasse 1', '10115 Berlin'] }, { name: 'Muster Patent PartG', country: null, address: [] }],
        representativesChangeDate: '20251128',
        opponents: [
          { name: 'Rival AG', country: 'CH', address: ['Seeweg 2'], filingDate: '20240105', status: 'ADMISSIBLE' },
          { name: 'Other Ltd', country: null, address: [], filingDate: null, status: null },
        ],
        status: 'Examination is in progress',
        dates: { filing: '20230505', publication: '20231213' },
      }),
      doc({ docId: null, applicationNumber: 'EP23171863', title: null, applicants: [] }),
    ], 845, { begin: 11, end: 12 }))
    const result = await service.searchRegister('re=Muster', { begin: 11, end: 12 })
    expect(ops.searchRegister).toHaveBeenCalledWith('re=Muster', '11-12')
    expect(result).toEqual({
      total: 845,
      begin: 11,
      end: 12,
      rows: [
        {
          applicationNumber: 'EP23171862',
          publicationNumber: 'EP4292805',
          title: 'Beispiel title',
          applicants: ['Beispiel Maschinenbau GmbH'],
          representatives: [
            { name: 'Muster, Erika', country: 'DE', address: ['Musterstrasse 1', '10115 Berlin'] },
            { name: 'Muster Patent PartG', address: [] },
          ],
          representativeSince: '2025-11-28',
          opponents: [
            { name: 'Rival AG', country: 'CH', address: ['Seeweg 2'], filedOn: '2024-01-05', status: 'ADMISSIBLE' },
            { name: 'Other Ltd', address: [] },
          ],
          status: 'Examination is in progress',
          filed: '2023-05-05',
          published: '2023-12-13',
        },
        { applicationNumber: 'EP23171863', applicants: [], representatives: [], opponents: [] },
      ],
    })
    expect(Object.keys(result.rows[1] ?? {})).not.toContain('publicationNumber')
  })

  it('accepts dates that already read YYYY-MM-DD', async () => {
    const { ops, service } = await bench()
    ops.searchRegister.mockResolvedValue(page([doc({ dates: { filing: '2023-05-05', publication: null } })]))
    expect((await service.searchRegister('q', { begin: 1, end: 1 })).rows[0]?.filed).toBe('2023-05-05')
  })

  it('refuses a range that is not 1 to 100 rows from row 1 on, as a caller bug', async () => {
    const { ops, service } = await bench()
    await expect(service.searchRegister('q', { begin: 0, end: 10 })).rejects.toBeInstanceOf(RangeError)
    await expect(service.searchRegister('q', { begin: 5, end: 4 })).rejects.toBeInstanceOf(RangeError)
    await expect(service.searchRegister('q', { begin: 1, end: 101 })).rejects.toBeInstanceOf(RangeError)
    await expect(service.searchRegister('q', { begin: 1.5, end: 3 })).rejects.toBeInstanceOf(RangeError)
    await expect(service.searchRegister('q', { begin: 1, end: Number.NaN })).rejects.toBeInstanceOf(RangeError)
    expect(ops.searchRegister).not.toHaveBeenCalled()
    ops.searchRegister.mockResolvedValue(page([]))
    await expect(service.searchRegister('q', { begin: 101, end: 200 })).resolves.toMatchObject({ rows: [] })
  })

  it('throws malformed for a wrong field and names the path, not the value', async () => {
    const { ops, service } = await bench()
    ops.searchRegister.mockResolvedValue(wrong<RegisterSearchResponse>({ total: 'many', range: { begin: 1, end: 1 }, docs: [] }))
    const error = await failureOf(service.searchRegister('q', { begin: 1, end: 1 }))
    expect(error.code).toBe('malformed')
    expect(error.message).toContain('total')
    expect(error.message).not.toContain('many')
    expect(error.cause).toBeDefined()
  })

  it('names the root when the answer is not an object', async () => {
    const { ops, service } = await bench()
    ops.searchRegister.mockResolvedValue(wrong<RegisterSearchResponse>([]))
    expect((await failureOf(service.searchRegister('q', { begin: 1, end: 1 }))).message).toContain('(root)')
  })

  it('throws malformed for a date that is neither YYYYMMDD nor YYYY-MM-DD', async () => {
    const { ops, service } = await bench()
    ops.searchRegister.mockResolvedValue(page([doc({ dates: { filing: '5 May 2023', publication: null } })]))
    expect((await failureOf(service.searchRegister('q', { begin: 1, end: 1 }))).code).toBe('malformed')
  })

  it('throws malformed for a row without a valid EP application number or publication number', async () => {
    const { ops, service } = await bench()
    ops.searchRegister.mockResolvedValue(page([doc({ applicationNumber: null })]))
    const missing = await failureOf(service.searchRegister('q', { begin: 1, end: 1 }))
    expect(missing.code).toBe('malformed')
    ops.searchRegister.mockResolvedValue(page([doc({ applicationNumber: 'US17123456' })]))
    expect((await failureOf(service.searchRegister('q', { begin: 1, end: 1 }))).message).toContain('US17123456')
    ops.searchRegister.mockResolvedValue(page([doc({ docId: 'WO2020123456' })]))
    expect((await failureOf(service.searchRegister('q', { begin: 1, end: 1 }))).message).toContain('WO2020123456')
  })
})

describe('failures of the library', () => {
  const cases: [string, ProviderReadFailure, PatentDataFailure][] = [
    ['no key stored', failed(400, ErrorCodes.data_keys_required), 'no-key'],
    ['key refused by the EPO', failed(400, ErrorCodes.patent_provider_key_invalid), 'no-key'],
    ['server fault', failed(503, ErrorCodes.upstream_unavailable), 'unreachable'],
    ['rate limit', failed(429, ErrorCodes.rate_limit_exceeded), 'unreachable'],
  ]
  for (const [label, failure, code] of cases) {
    it(`maps ${label} to ${code} and keeps the cause`, async () => {
      const { ops, service } = await bench()
      const cause = new Error('library error')
      ops.searchRegister.mockResolvedValue({ ...failure, cause })
      const error = await failureOf(service.searchRegister('q', { begin: 1, end: 1 }))
      expect(error.code).toBe(code)
      expect(error.cause).toBe(cause)
    })
  }

  it('keeps the error body as the cause when the library gives none', async () => {
    const { ops, service } = await bench()
    const failure = failed(502, ErrorCodes.upstream_error)
    ops.searchRegister.mockResolvedValue(failure)
    expect((await failureOf(service.searchRegister('q', { begin: 1, end: 1 }))).cause).toBe(failure.body)
  })

  it('throws no-key without a library call when the firm stored no EPO key', async () => {
    const { ops, store, service } = await bench()
    await store.remove('epo-ops')
    const error = await failureOf(service.searchRegister('q', { begin: 1, end: 1 }))
    expect(error.code).toBe('no-key')
    expect(ops.searchRegister).not.toHaveBeenCalled()
  })

  it('maps a thrown key error to no-key and any other thrown value to unreachable', async () => {
    const { ops, service } = await bench()
    const keyError = new DataKeysRequiredError('epo')
    ops.searchRegister.mockRejectedValue(keyError)
    const noKey = await failureOf(service.searchRegister('q', { begin: 1, end: 1 }))
    expect(noKey.code).toBe('no-key')
    expect(noKey.cause).toBe(keyError)
    ops.searchRegister.mockRejectedValue(new TypeError('fetch failed'))
    const network = await failureOf(service.searchRegister('q', { begin: 1, end: 1 }))
    expect(network.code).toBe('unreachable')
    expect(network.message).toContain('fetch failed')
    ops.searchRegister.mockRejectedValue('plain text')
    expect((await failureOf(service.searchRegister('q', { begin: 1, end: 1 }))).message).toBe('EPO OPS: the read failed')
  })

  it('rethrows the original error when the caller cancelled', async () => {
    const { ops, service } = await bench()
    const controller = new AbortController()
    const aborted = new Error('client gone')
    ops.searchRegister.mockImplementation(() => {
      controller.abort()
      return Promise.reject(aborted)
    })
    await expect(service.searchRegister('q', { begin: 1, end: 1 }, controller.signal)).rejects.toBe(aborted)
  })

  it('carries the caller signal to the library call', async () => {
    const { ops, service } = await bench()
    const controller = new AbortController()
    ops.searchRegister.mockImplementation(() => Promise.resolve(page([])))
    await service.searchRegister('q', { begin: 1, end: 1 }, controller.signal)
    expect(ops.searchRegister).toHaveBeenCalledTimes(1)
  })
})

describe('registerRecord', () => {
  it('searches ap=<number> for one row and answers the row of that application', async () => {
    const { ops, service } = await bench()
    ops.searchRegister.mockResolvedValue(page([doc()]))
    const row = await service.registerRecord(application('EP23171862'))
    expect(ops.searchRegister).toHaveBeenCalledWith('ap=EP23171862', '1-1')
    expect(row?.publicationNumber).toBe('EP4292805')
  })

  it('answers undefined when the register lists no row, or only another application', async () => {
    const { ops, service } = await bench()
    ops.searchRegister.mockResolvedValue(page([]))
    expect(await service.registerRecord(application('EP23171862'))).toBeUndefined()
    ops.searchRegister.mockResolvedValue(page([doc({ applicationNumber: 'EP23171863' })]))
    expect(await service.registerRecord(application('EP23171862'))).toBeUndefined()
  })
})

describe('family', () => {
  it('reads priorities, earliest first and each once, and the citable publications of the members', async () => {
    const { ops, service } = await bench()
    ops.searchRegister.mockResolvedValue(page([doc()]))
    ops.getFamily.mockResolvedValue(ok(familyResponse([
      member('publication', { country: 'EP', number: '4292805', date: '20231213' }),
      member('priority', { country: 'DE', number: '102022111111', date: '20220505' }),
      member('priority', { country: 'US', number: '10374408', date: '20220101' }),
      member('priority', { country: 'US', number: '10374408', date: '20220101' }),
      member('priority', { country: 'FR', number: '2200001' }),
      member('priority', { country: 'AT', number: 'A1' }),
      member('priority', { country: 'DE', number: '102022000000', date: '20220505' }),
      member('application', { country: 'EP', number: '23171862', date: '20230505' }),
    ], ['US7722129B2', null, 'EP4292805A1', 'US7722129B2'], { familyId: '12345' })))
    const result = await service.family(application('EP23171862'))
    expect(ops.getFamily).toHaveBeenCalledWith('EP4292805')
    expect(result).toEqual({
      familyId: '12345',
      priorities: [
        { number: 'US 10374408', date: '2022-01-01' },
        { number: 'DE 102022000000', date: '2022-05-05' },
        { number: 'DE 102022111111', date: '2022-05-05' },
        { number: 'AT A1' },
        { number: 'FR 2200001' },
      ],
      publications: ['US7722129B2', 'EP4292805A1'],
    })
  })

  it('leaves the family id out when the EPO gives none', async () => {
    const { ops, service } = await bench()
    ops.searchRegister.mockResolvedValue(page([doc()]))
    ops.getFamily.mockResolvedValue(ok(familyResponse([], [])))
    expect(await service.family(application('EP23171862'))).toEqual({ priorities: [], publications: [] })
  })

  it('answers an empty family without a library call when the application has no EP publication', async () => {
    const { ops, service } = await bench()
    ops.searchRegister.mockResolvedValue(page([doc({ docId: null })]))
    expect(await service.family(application('EP23171862'))).toEqual({ priorities: [], publications: [] })
    ops.searchRegister.mockResolvedValue(page([]))
    expect(await service.family(application('EP23171862'))).toEqual({ priorities: [], publications: [] })
    expect(ops.getFamily).not.toHaveBeenCalled()
  })

  it('answers an empty family when the EPO has none (404) and fails on any other error', async () => {
    const { ops, service } = await bench()
    ops.searchRegister.mockResolvedValue(page([doc()]))
    ops.getFamily.mockResolvedValue(failed(404, ErrorCodes.NOT_FOUND))
    expect(await service.family(application('EP23171862'))).toEqual({ priorities: [], publications: [] })
    ops.getFamily.mockResolvedValue(failed(503, ErrorCodes.upstream_unavailable))
    expect((await failureOf(service.family(application('EP23171862')))).code).toBe('unreachable')
  })

  it('throws malformed for a member number or office code over its length bound', async () => {
    const { ops, service } = await bench()
    ops.searchRegister.mockResolvedValue(page([doc()]))
    ops.getFamily.mockResolvedValue(ok(familyResponse([member('priority', { country: 'DE', number: '1'.repeat(33) })], [])))
    expect((await failureOf(service.family(application('EP23171862')))).code).toBe('malformed')
    ops.getFamily.mockResolvedValue(ok(familyResponse([member('priority', { country: 'DEUTS', number: '1' })], [])))
    expect((await failureOf(service.family(application('EP23171862')))).code).toBe('malformed')
    ops.getFamily.mockResolvedValue(ok(familyResponse([member('priority', { country: 'DE', number: '1'.repeat(32) })], [])))
    expect((await service.family(application('EP23171862'))).priorities).toEqual([{ number: `DE ${'1'.repeat(32)}` }])
  })

  it('throws malformed for a family without members', async () => {
    const { ops, service } = await bench()
    ops.searchRegister.mockResolvedValue(page([doc()]))
    ops.getFamily.mockResolvedValue(wrong<FamilyResponse>({ docId: 'EP4292805' }))
    expect((await failureOf(service.family(application('EP23171862')))).code).toBe('malformed')
  })
})

describe('publication', () => {
  const biblio = (title: string | null): ProviderReadResult<BiblioData> => ok({
    docId: 'EP4292805A1', title, abstract: null, applicants: [], inventors: [], ipc: [], cpc: [],
    dates: { filing: null, publication: null, priority: [] },
  })
  const abstract = (text: string | null): ProviderReadResult<AbstractResponse> => ok({ docId: 'EP4292805A1', lang: 'en', abstract: text })
  const claims = (texts: string[]): ProviderReadResult<ClaimsResponse> => ok({ docId: 'EP4292805A1', lang: 'en', claims: texts })

  it('reads title, abstract and claims, claims separated by a blank line', async () => {
    const { ops, service } = await bench()
    ops.getBiblio.mockResolvedValue(biblio('A device'))
    ops.getAbstract.mockResolvedValue(abstract('The device flattens a strip.'))
    ops.getClaimsRouted.mockResolvedValue(claims(['1. A device.', '2. The device of claim 1.']))
    expect(await service.publication(publication('EP4292805A1'))).toEqual({
      publicationNumber: 'EP4292805A1',
      title: 'A device',
      abstract: 'The device flattens a strip.',
      claims: '1. A device.\n\n2. The device of claim 1.',
    })
    expect(ops.getClaimsRouted).toHaveBeenCalledWith('EP4292805A1', 'en')
  })

  it('leaves a field out when the EPO has no text for it (Euro-PCT) or the text is blank', async () => {
    const { ops, service } = await bench()
    ops.getBiblio.mockResolvedValue(failed(404, ErrorCodes.NOT_FOUND))
    ops.getAbstract.mockResolvedValue(failed(404, ErrorCodes.NOT_FOUND))
    ops.getClaimsRouted.mockResolvedValue(failed(404, ErrorCodes.NOT_FOUND))
    expect(await service.publication(publication('EP4292805'))).toEqual({ publicationNumber: 'EP4292805' })
    ops.getBiblio.mockResolvedValue(biblio('  '))
    ops.getAbstract.mockResolvedValue(abstract(null))
    ops.getClaimsRouted.mockResolvedValue(claims([]))
    expect(await service.publication(publication('EP4292805'))).toEqual({ publicationNumber: 'EP4292805' })
  })

  describe('a Euro-PCT publication without text of its own', () => {
    const routed = (served: string): ProviderReadResult<RoutedClaims> => ok({
      docId: served, lang: 'de', claims: ['1. Vorrichtung.', '2. Vorrichtung nach Anspruch 1.'],
      fallback: { reason: 'euro_pct_fulltext_in_wo', requestedDocId: 'EP4820738A1', servedDocId: served, note: '' },
    })

    it('has the claims and the abstract of the WO publication that the text router served', async () => {
      const { ops, service } = await bench()
      ops.getBiblio.mockResolvedValue(biblio('AIR SAMPLING DEVICE'))
      ops.getAbstract.mockImplementation(async number => number === 'WO2025119775A1' ? abstract('The device takes air samples.') : failed(404, ErrorCodes.NOT_FOUND))
      ops.getClaimsRouted.mockResolvedValue(routed('WO2025119775A1'))
      expect(await service.publication(publication('EP4820738A1'))).toEqual({
        publicationNumber: 'EP4820738A1',
        textFrom: 'WO2025119775A1',
        title: 'AIR SAMPLING DEVICE',
        abstract: 'The device takes air samples.',
        claims: '1. Vorrichtung.\n\n2. Vorrichtung nach Anspruch 1.',
      })
      expect(ops.getClaimsRouted).toHaveBeenCalledWith('EP4820738A1', 'en')
    })

    it('finds the WO publication of a sister application through the PCT application that the bibliography names', async () => {
      const { ops, service } = await bench()
      const pct: ProviderReadResult<BiblioData> = ok({
        docId: 'EP4820738A1', title: 'AIR SAMPLING DEVICE', abstract: null, applicants: [], inventors: [], ipc: [], cpc: [],
        dates: { filing: null, publication: null, priority: [
          { date: '20231205', country: 'DE', epodocApplication: 'DE202310133973', docdbApplication: 'DE102023133973 (A)', originalApplication: '102023133973', kind: 'A' },
          { date: '20241128', country: 'EP', epodocApplication: 'WO2024EP83985', docdbApplication: 'EP2024083985 (W)', originalApplication: 'EP2024083985', kind: 'W' },
        ] },
      })
      const family = (members: readonly (readonly [string, string])[]): ProviderReadResult<FamilyResponse> => {
        const answer = familyResponse([], [])
        const rows = members.map(([application, representativePublication]) => (
          { application, representativePublication, isGrant: false, publications: [] }
        ))
        return ok({ ...answer, representatives: { ...answer.representatives, members: rows } })
      }
      ops.getBiblio.mockResolvedValue(pct)
      ops.getAbstract.mockImplementation(async number => number === 'WO2025119775A1' ? abstract('The device takes air samples.') : failed(404, ErrorCodes.NOT_FOUND))
      ops.getClaimsRouted.mockImplementation(async number => number === 'WO2025119775A1' ? claims(['1. A device.']) : failed(404, ErrorCodes.NOT_FOUND))
      ops.getFamily.mockResolvedValue(family([['EP2024083984 (W)', 'WO2025119774A1'], ['EP2024083985 (W)', 'WO2025119775A1']]))
      expect(await service.publication(publication('EP4820738A1'))).toEqual({
        publicationNumber: 'EP4820738A1', textFrom: 'WO2025119775A1', title: 'AIR SAMPLING DEVICE', abstract: 'The device takes air samples.', claims: '1. A device.',
      })
      expect(ops.getFamily).toHaveBeenCalledWith('EP4820738A1')

      const titleOnly = { publicationNumber: 'EP4820738A1', title: 'AIR SAMPLING DEVICE' }
      ops.getFamily.mockResolvedValue(family([['EP2024083984 (W)', 'WO2025119774A1']]))
      expect(await service.publication(publication('EP4820738A1'))).toEqual(titleOnly)
      ops.getFamily.mockResolvedValue(family([['EP2024083985 (W)', 'US2025000001A1']]))
      expect(await service.publication(publication('EP4820738A1'))).toEqual(titleOnly)
      ops.getFamily.mockResolvedValue(failed(404, ErrorCodes.NOT_FOUND))
      expect(await service.publication(publication('EP4820738A1'))).toEqual(titleOnly)
      ops.getFamily.mockResolvedValue(family([['EP2024083985 (W)', 'WO2025119776A1']]))
      expect(await service.publication(publication('EP4820738A1'))).toEqual(titleOnly)
    })

    it('throws malformed when the router names a publication that is not a WO number', async () => {
      const { ops, service } = await bench()
      ops.getBiblio.mockResolvedValue(biblio('AIR SAMPLING DEVICE'))
      ops.getAbstract.mockResolvedValue(failed(404, ErrorCodes.NOT_FOUND))
      ops.getClaimsRouted.mockResolvedValue(routed('US2025000001A1'))
      expect((await failureOf(service.publication(publication('EP4820738A1')))).code).toBe('malformed')
    })
  })

  it('fails when the EPO fails for another reason than a missing text', async () => {
    const { ops, service } = await bench()
    ops.getBiblio.mockResolvedValue(biblio('A device'))
    ops.getAbstract.mockResolvedValue(abstract('Text.'))
    ops.getClaimsRouted.mockResolvedValue(failed(400, ErrorCodes.data_keys_required))
    expect((await failureOf(service.publication(publication('EP4292805A1')))).code).toBe('no-key')
  })

  it('throws malformed for a wrong field in any of the three answers', async () => {
    const { ops, service } = await bench()
    ops.getBiblio.mockResolvedValue(biblio('A device'))
    ops.getAbstract.mockResolvedValue(abstract('Text.'))
    ops.getClaimsRouted.mockResolvedValue(claims(['1. A device.']))
    ops.getBiblio.mockResolvedValue(wrong<BiblioData>({ title: 5 }))
    expect((await failureOf(service.publication(publication('EP4292805A1')))).message).toContain('bibliography')
    ops.getBiblio.mockResolvedValue(biblio('A device'))
    ops.getAbstract.mockResolvedValue(wrong<AbstractResponse>({ abstract: 5 }))
    expect((await failureOf(service.publication(publication('EP4292805A1')))).message).toContain('abstract')
    ops.getAbstract.mockResolvedValue(abstract('Text.'))
    ops.getClaimsRouted.mockResolvedValue(wrong<ClaimsResponse>({ claims: 'one' }))
    expect((await failureOf(service.publication(publication('EP4292805A1')))).message).toContain('claims')
  })
})

describe('findApplicantNames', () => {
  /** Register rows numbered from `first`, one per applicant list. */
  function rows(first: number, applicants: string[][]): RegisterSearchItem[] {
    return applicants.map((names, index) => doc({ applicationNumber: `EP${String(23000000 + first + index)}`, docId: null, applicants: names }))
  }

  it('counts the EP applications of each applicant name whose company key holds every typed word', async () => {
    const { ops, service } = await bench()
    ops.searchRegister.mockResolvedValue(page(rows(1, [
      ['Gerhard Schubert GmbH'],
      ['Gerhard Schubert GmbH', 'Schubert, Anna'],
      ['Gerhard-Schubert Holding GmbH'],
      ['Gerhard Schubert GmbH', 'Gerhard Schubert GmbH'],
      ['Schubertstadt Werke AG'],
      ['GERHARD SCHUBERT Verpackung'],
      ['Gerhard Meier GmbH'],
    ])))
    const result = await service.findApplicantNames('Gerhard Schubert', { maxRows: 500 })
    expect(ops.searchRegister).toHaveBeenCalledWith('pa="Gerhard Schubert"', '1-100')
    expect(result).toEqual({
      source: 'ep-register',
      names: [
        { name: 'Gerhard Schubert GmbH', applications: 3 },
        { name: 'GERHARD SCHUBERT Verpackung', applications: 1 },
      ],
      truncated: false,
    })
    expect(Object.keys(result)).not.toContain('edition')
  })

  it('answers one name for spellings with the same company key, with the commonest spelling and every application once', async () => {
    const { ops, service } = await bench()
    ops.searchRegister.mockResolvedValue(page(rows(1, [
      ['Syntegon Technology GmbH'],
      ['SYNTEGON TECHNOLOGY GMBH'],
      ['Syntegon Technology GmbH', 'SYNTEGON TECHNOLOGY GMBH'],
      ['Syntegon Technology GmbH'],
      ['Syntegon Pouch Systems AG'],
      ['SYNTEGON POUCH SYSTEMS AG'],
      ['Syntegon Pouch Systems, AG'],
    ])))
    const result = await service.findApplicantNames('Syntegon', { maxRows: 100 })
    expect(result.names).toEqual([
      { name: 'Syntegon Technology GmbH', applications: 4 },
      { name: 'SYNTEGON POUCH SYSTEMS AG', applications: 3 },
    ])
  })

  it('breaks a tie in the count by name', async () => {
    const { ops, service } = await bench()
    ops.searchRegister.mockResolvedValue(page(rows(1, [['Siemens Healthcare'], ['Siemens AG'], ['Siemens Energy']])))
    const result = await service.findApplicantNames('siemens', { maxRows: 10 })
    expect(ops.searchRegister).toHaveBeenCalledWith('pa=siemens', '1-10')
    expect(result.names.map(entry => entry.name)).toEqual(['Siemens AG', 'Siemens Energy', 'Siemens Healthcare'])
  })

  it('quotes a name with punctuation and drops double quotes from it', async () => {
    const { ops, service } = await bench()
    ops.searchRegister.mockResolvedValue(page([]))
    await service.findApplicantNames('H&M "Hennes"', { maxRows: 5 })
    expect(ops.searchRegister).toHaveBeenCalledWith('pa="H&M Hennes"', '1-5')
  })

  it('reads pages of 100 until maxRows and reports the cut', async () => {
    const { ops, service } = await bench()
    ops.searchRegister.mockImplementation((_query, range) => {
      const [begin, end] = range?.split('-').map(Number) ?? []
      const count = (end ?? 0) - (begin ?? 0) + 1
      return Promise.resolve(page(rows(begin ?? 0, Array.from({ length: count }, () => ['Acme Works'])), 230))
    })
    const result = await service.findApplicantNames('Acme', { maxRows: 150 })
    expect(ops.searchRegister.mock.calls.map(call => call[1])).toEqual(['1-100', '101-150'])
    expect(result).toEqual({ source: 'ep-register', names: [{ name: 'Acme Works', applications: 150 }], truncated: true })
  })

  it('stops at the register total without a cut', async () => {
    const { ops, service } = await bench()
    ops.searchRegister.mockResolvedValue(page(rows(1, [['Acme Works'], ['Acme Works']]), 2))
    const result = await service.findApplicantNames('Acme', { maxRows: 1000 })
    expect(ops.searchRegister).toHaveBeenCalledTimes(1)
    expect(result.truncated).toBe(false)
  })

  it('counts an application once when two pages both list it, and stops on an empty page', async () => {
    const { ops, service } = await bench()
    ops.searchRegister
      .mockResolvedValueOnce(page(rows(1, [['Acme Works'], ['Acme Works']]), 5))
      .mockResolvedValueOnce(page(rows(2, [['Acme Works'], ['Acme Works']]), 5))
      .mockResolvedValueOnce(page([], 5))
    const result = await service.findApplicantNames('Acme', { maxRows: 1000 })
    expect(ops.searchRegister).toHaveBeenCalledTimes(3)
    expect(result).toEqual({ source: 'ep-register', names: [{ name: 'Acme Works', applications: 3 }], truncated: true })
  })

  it('answers no names for a register without a match', async () => {
    const { ops, service } = await bench()
    ops.searchRegister.mockResolvedValue(page([], 0, { begin: 1, end: 0 }))
    expect(await service.findApplicantNames('Nobody', { maxRows: 100 })).toEqual({ source: 'ep-register', names: [], truncated: false })
  })

  it('refuses a name without a letter or digit and a maxRows that is not a positive integer, as caller bugs', async () => {
    const { ops, service } = await bench()
    await expect(service.findApplicantNames(' - ', { maxRows: 10 })).rejects.toBeInstanceOf(RangeError)
    await expect(service.findApplicantNames('Acme', { maxRows: 0 })).rejects.toBeInstanceOf(RangeError)
    await expect(service.findApplicantNames('Acme', { maxRows: 2.5 })).rejects.toBeInstanceOf(RangeError)
    expect(ops.searchRegister).not.toHaveBeenCalled()
  })

  it('passes a failure of the register on', async () => {
    const { ops, service } = await bench()
    ops.searchRegister.mockResolvedValue(failed(400, ErrorCodes.data_keys_required))
    expect((await failureOf(service.findApplicantNames('Acme', { maxRows: 10 }))).code).toBe('no-key')
  })
})

describe('the flowleapPatentData service over the real library', () => {
  const XML = `<?xml version="1.0" encoding="UTF-8"?>
<ops:world-patent-data xmlns:ops="http://ops.epo.org" xmlns:reg="http://www.epo.org/register">
  <ops:register-search total-result-count="1">
    <ops:query syntax="CQL">ap=EP23171862</ops:query>
    <ops:range begin="1" end="1"/>
    <reg:register-documents>
      <reg:register-document status="Examination is in progress">
        <reg:bibliographic-data country="EP" lang="en">
          <reg:publication-reference><reg:document-id lang="de"><reg:country>EP</reg:country><reg:doc-number>4292805</reg:doc-number><reg:kind>A1</reg:kind><reg:date>20231213</reg:date></reg:document-id></reg:publication-reference>
          <reg:application-reference><reg:document-id><reg:country>EP</reg:country><reg:doc-number>23171862</reg:doc-number><reg:date>20230505</reg:date></reg:document-id></reg:application-reference>
          <reg:parties>
            <reg:applicants><reg:applicant sequence="1"><reg:addressbook><reg:name>Beispiel Maschinenbau GmbH</reg:name></reg:addressbook></reg:applicant></reg:applicants>
            <reg:agents change-date="20251128"><reg:agent sequence="1"><reg:addressbook><reg:name>Muster Patent PartG</reg:name><reg:address><reg:address-1>Musterstrasse 1</reg:address-1><reg:country>DE</reg:country></reg:address></reg:addressbook></reg:agent></reg:agents>
          </reg:parties>
          <reg:invention-title lang="en">Device for flattening a strip</reg:invention-title>
        </reg:bibliographic-data>
      </reg:register-document>
    </reg:register-documents>
  </ops:register-search>
</ops:world-patent-data>`

  async function wired(withKey: boolean) {
    const ctx = new Context()
    const credentials = new MemoryCredentials(ctx)
    const store = createCredentialStore(credentials)
    const fetchSpy = vi.fn<typeof fetch>((input) => {
      if (urlOf(input).endsWith('/auth/accesstoken')) return Promise.resolve(Response.json({ access_token: 'token', expires_in: 1200 }))
      return Promise.resolve(new Response(XML, { headers: { 'content-type': 'application/xml' } }))
    })
    const bound = createConnectorHost({ store, logger: ctx.logger, cacheEntries: 10, fetch: fetchSpy })
    const connectors = createConnectors(bound.host)
    const myEpo = createMyEpoLink({
      credentials, fetch: fetchSpy, now: Date.now, gate: { wait: () => Promise.resolve() },
      endpoint: { baseUrl: 'https://myepo.test', tokenUrl: 'https://login.test/token', requestsPerSecond: 1, timeoutSeconds: 1 },
    })
    await ctx.plugin(FlowleapConnectorsController, { store, connectors, bound, myEpo })
    if (withKey) await ctx.flowleapConnectors.set('epo-ops', { consumerKey: 'key', consumerSecret: 'secret' })
    await ctx.plugin(FlowleapPatentData, { connectors, bound })
    return { ctx, fetchSpy }
  }

  it('reads one register record on the stored EPO key and sends only the application number', async () => {
    const { ctx, fetchSpy } = await wired(true)
    const row = await ctx.flowleapPatentData.registerRecord(application('EP23171862'))
    expect(row).toEqual({
      applicationNumber: 'EP23171862',
      publicationNumber: 'EP4292805',
      title: 'Device for flattening a strip',
      applicants: ['Beispiel Maschinenbau GmbH'],
      representatives: [{ name: 'Muster Patent PartG', country: 'DE', address: ['Musterstrasse 1'] }],
      representativeSince: '2025-11-28',
      opponents: [],
      status: 'Examination is in progress',
      filed: '2023-05-05',
      published: '2023-12-13',
    })
    const searched = fetchSpy.mock.calls.map(call => urlOf(call[0])).find(url => url.includes('/register/search/biblio'))
    expect(searched).toContain('q=ap%3DEP23171862')
  })

  it('throws no-key and makes no call without a stored EPO key', async () => {
    const { ctx, fetchSpy } = await wired(false)
    const error = await failureOf(ctx.flowleapPatentData.registerRecord(application('EP23171862')))
    expect(error.code).toBe('no-key')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
