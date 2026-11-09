import { brandString } from '@deepseek-ai/dsh-brand'
import { describe, expect, it, vi } from 'vitest'
import {
  createMyEpoClient, createRequestGate, describeFailure, MyEpoError, parseBibliographicData, parsePortfolios,
  type MyEpoApplicationNumber, type MyEpoCommunication, type MyEpoCredentials, type MyEpoFailure, type MyEpoFolderId,
  type MyEpoReads, type RequestGate,
} from '@deepseek-ai/dsh-flowleap-connectors'
import { CREDENTIALS, ENDPOINT, fakeEpo, json, zipOf, type FakeEpo } from './myepo-fake.ts'

const OPEN_GATE: RequestGate = { wait: () => Promise.resolve() }
const EP1 = { procedure: 'EPC' as const, number: brandString<MyEpoApplicationNumber>('EP00000001') }

function client(epo: FakeEpo, options: { credentials?: MyEpoCredentials | undefined; now?: () => number } = {}): MyEpoReads {
  const credentials = 'credentials' in options ? options.credentials : CREDENTIALS
  return createMyEpoClient({
    endpoint: ENDPOINT, gate: OPEN_GATE, fetch: epo.fetch, credentials: () => Promise.resolve(credentials), now: options.now ?? Date.now,
  })
}

async function failureOf(read: Promise<unknown>): Promise<MyEpoFailure> {
  const error = await read.then(() => undefined, (cause: unknown) => cause)
  expect(error).toBeInstanceOf(MyEpoError)
  return (error as MyEpoError).failure
}

describe('the MyEPO reads on the recorded sandbox answers', () => {
  it('reads the portfolios, a page of applications, the bibliographic data, the due dates, the terms and the fees', async () => {
    const reads = client(fakeEpo())
    expect(await reads.portfolios()).toEqual([
      { id: '1', name: 'Applicant Portfolio 1', type: 'applicant', fullAccess: true },
      { id: '2', name: 'Representative Portfolio 1', type: 'representative', fullAccess: true },
      { id: '3', name: 'Association Portfolio 1', type: 'association', fullAccess: true },
      { id: '4', name: 'Applicant Portfolio 2', type: 'applicant', fullAccess: false },
      { id: '5', name: 'Representative Portfolio 2', type: 'representative', fullAccess: false },
      { id: '6', name: 'Association Portfolio 2', type: 'association', fullAccess: false },
    ])
    const all = await reads.applications()
    expect(all).toMatchObject({ page: 0, total: 8 })
    expect(all.items[0]).toEqual({
      procedure: 'EPC', number: 'EP00000001', numberWithCheckDigit: 'EP00000001.8', filingDate: '2024-06-06',
      fileReference: 'Applicant reference 1', portfolioId: '111', portfolioName: 'Portfolio Name 1',
    })
    expect(await reads.applications({ page: 1, size: 2 })).toMatchObject({ page: 1, size: 2, total: 8, items: [{ number: 'EP00000002' }, { number: 'EP00000002' }] })
    expect(await reads.bibliographicData(EP1)).toEqual({
      procedure: 'EPC', number: '00000001', filingDate: '2014-01-01',
      titles: { EN: 'Dummy title EN', DE: 'Dummy title DE', FR: 'Dummy title FR' },
      applicants: ['Dummy applicant 1, Paris, FR'],
      inventors: ['Dummy, Inventor1, Paris, FR', 'Other, Inventor2, Paris, FR'],
      representatives: ['Dummy Representative, Address Line 1, Address Line 2, Address Line 3, Address Line 4, DE'],
      publications: [{ office: 'EP', number: '123456', kind: 'A1', date: '2014-02-01' }],
      priorities: [{ office: 'FR', number: 'FRA     123456', filingDate: '2014-02-01' }],
      ipc: ['dummySymbol'],
      cpc: ['dummySymbol1', 'dummySymbol2', 'dummySymbol3'],
    })
    expect(await reads.dueDates(EP1)).toEqual([
      { termKey: 'DUE_TERM_11', dueDate: '2024-01-01', actor: 'actor1' },
      { termKey: 'DUE_TERM_10', dueDate: '2023-01-01', actor: 'actor2' },
    ])
    const terms = await reads.terms()
    expect(terms).toHaveLength(82)
    expect(terms[0]).toEqual({
      termKey: 'DUE_TERM_73',
      description: { en: 'Remedy formal deficiency', fr: 'Remédier à un vice de forme', de: 'Behebung eines Formmangels' },
    })
    expect(await reads.pendingFees(EP1)).toEqual([
      { feeCode: '001', amount: 123, dueDate: '2024-01-01' },
      { feeCode: '002', amount: 321, dueDate: '2024-02-01' },
      { feeCode: '003', amount: 999, dueDate: '2024-03-01' },
    ])
  })

  it('reads the Mailbox: the letters with and without an application, the unhandled ones, and the folders', async () => {
    const reads = client(fakeEpo())
    const letters = await reads.communications()
    expect(letters).toMatchObject({ page: 0, size: 10, total: 9 })
    expect(letters.items[0]).toEqual({
      id: 'l9s8o3a1luusand', applicationNumber: 'PCT/SE2023/123456', userReference: 'P79105WO1', applicantName: 'Dummy applicant 1',
      recipientName: 'Dummy recipient 000026', documentCode: 'I1015', title: 'Important information concerning EPO Form 1010',
      dispatchDate: '2023-05-30', read: true, handled: false, folderId: 'l3ldt00aluu2917',
    })
    const noApplication = letters.items.find(letter => letter.documentCode === '52301_CONF')
    expect(noApplication).not.toHaveProperty('applicationNumber')
    expect(noApplication).not.toHaveProperty('userReference')
    expect((await reads.unhandledCommunications()).items).toHaveLength(9)
    expect(await reads.folders()).toEqual([{ id: 'l3ldt00aluu2917', name: 'Drafts' }, { id: 'kih7dx82luu148t', name: 'PDFs' }])
  })

  it('sends the filters of a list as a query string and leaves absent ones out', async () => {
    const epo = fakeEpo()
    epo.answer('/communications?folderId=kih7dx82luu148t&page=0', () => json(200, { content: [], size: 10, number: 0, totalElements: 0 }))
    epo.answer('/communications/unhandled?size=5', () => json(200, { content: [], size: 5, number: 0, totalElements: 0 }))
    const reads = client(epo)
    expect(await reads.communications({ folderId: brandString<MyEpoFolderId>('kih7dx82luu148t'), page: 0 })).toEqual({ items: [], page: 0, size: 10, total: 0 })
    expect((await reads.unhandledCommunications({ size: 5 })).size).toBe(5)
    await expect(reads.applications({ procedure: 'UPP', applicantFileReference: undefined })).rejects.toBeInstanceOf(MyEpoError)
    expect(epo.calls.at(-1)?.url).toBe(`${ENDPOINT.baseUrl}/applications?procedure=UPP`)
  })

  it('downloads a letter as the one PDF of the EPO ZIP, with the communication it belongs to', async () => {
    const reads = client(fakeEpo())
    const letter = (await reads.communications()).items[0] as MyEpoCommunication
    const document = await reads.downloadCommunication(letter)
    expect(document.communication).toBe(letter)
    expect(document.filename).toBe('P79105WO1-2023.05.30-SE2023123456-I1015.pdf')
    expect(new TextDecoder().decode(document.pdf)).toBe('%PDF-1.4 dummy')
  })

  it('refuses a download that is no ZIP, or that holds no PDF or two', async () => {
    const epo = fakeEpo()
    const reads = client(epo)
    const letter = (await reads.communications()).items[0] as MyEpoCommunication
    const path = `/communications/download/${letter.id}`
    epo.answer(path, () => new Response('not a zip'))
    expect(await failureOf(reads.downloadCommunication(letter))).toEqual({ kind: 'invalid-response', message: 'download is not a ZIP' })
    epo.answer(path, () => new Response(zipOf({ 'note.txt': 'x' })))
    expect(await failureOf(reads.downloadCommunication(letter))).toEqual({ kind: 'invalid-response', message: 'download holds 0 PDF files' })
    epo.answer(path, () => new Response(zipOf({ 'a.pdf': 'a', 'b.PDF': 'b' })))
    expect(await failureOf(reads.downloadCommunication(letter))).toEqual({ kind: 'invalid-response', message: 'download holds 2 PDF files' })
  })
})

describe('the MyEPO token', () => {
  it('asks the login service once with the client credentials and keeps the token until shortly before it expires', async () => {
    const epo = fakeEpo()
    let clock = 0
    const reads = client(epo, { now: () => clock })
    await reads.portfolios()
    await reads.folders()
    expect(epo.tokens).toBe(1)
    const tokenCall = epo.calls[0]
    expect(tokenCall).toMatchObject({ url: ENDPOINT.tokenUrl, method: 'POST', body: 'grant_type=client_credentials&scope=mailboxapi' })
    clock = 3_600_000 - 61_000
    await reads.folders()
    expect(epo.tokens).toBe(1)
    clock = 3_600_000 - 59_000
    await reads.folders()
    expect(epo.tokens).toBe(2)
  })

  it('shares one token request between concurrent reads', async () => {
    const epo = fakeEpo()
    const reads = client(epo)
    await Promise.all([reads.portfolios(), reads.folders(), reads.terms()])
    expect(epo.tokens).toBe(1)
  })

  it('asks for a new token when the stored credentials change', async () => {
    const epo = fakeEpo()
    let credentials: MyEpoCredentials = CREDENTIALS
    const reads = createMyEpoClient({
      endpoint: ENDPOINT, gate: OPEN_GATE, fetch: epo.fetch, now: Date.now, credentials: () => Promise.resolve(credentials),
    })
    await reads.folders()
    credentials = { ...CREDENTIALS, clientSecret: 'replaced' }
    expect(await failureOf(reads.folders())).toEqual({ kind: 'refused' })
    credentials = { ...CREDENTIALS, clientId: 'other' }
    expect(await failureOf(reads.folders())).toEqual({ kind: 'refused' })
  })

  it('retries a read once with a fresh token when the API refuses the token, and reports a second refusal as refused', async () => {
    const epo = fakeEpo()
    const reads = client(epo)
    await reads.folders()
    epo.tokens += 1
    expect(await reads.folders()).toHaveLength(2)
    expect(epo.tokens).toBe(3)
    epo.answer('/communications/folders', () => new Response('Jwt is not valid', { status: 401 }))
    expect(await failureOf(reads.folders())).toEqual({ kind: 'refused' })
  })

  it('reports no credentials as not linked without a call', async () => {
    const epo = fakeEpo()
    expect(await failureOf(client(epo, { credentials: undefined }).portfolios())).toEqual({ kind: 'not-linked' })
    expect(epo.calls).toHaveLength(0)
  })

  it('reports a login service error as unreachable and an unreadable token answer as invalid', async () => {
    const epo = fakeEpo()
    epo.answer(ENDPOINT.tokenUrl, () => new Response('down', { status: 503 }))
    expect(await failureOf(client(epo).portfolios())).toEqual({ kind: 'unreachable', status: 503 })
    epo.answer(ENDPOINT.tokenUrl, () => json(200, { token_type: 'Bearer' }))
    expect(await failureOf(client(epo).portfolios())).toEqual({ kind: 'invalid-response', message: 'token answer' })
    epo.answer(ENDPOINT.tokenUrl, () => new Response('<html>', { status: 200 }))
    expect(await failureOf(client(epo).portfolios())).toEqual({ kind: 'invalid-response', message: 'not JSON' })
    epo.answer(ENDPOINT.tokenUrl, () => new Response('bad request', { status: 400 }))
    expect(await failureOf(client(epo).portfolios())).toEqual({ kind: 'refused' })
  })
})

describe('the MyEPO failures', () => {
  it('maps the recorded refusals: ERR_20 to no permission, ERR_30 to rejected, ERR_15 to not ready', async () => {
    const epo = fakeEpo()
    const reads = client(epo)
    expect(await failureOf(reads.applications({ portfolioId: brandString('999') }))).toEqual({ kind: 'no-permission', code: 'ERR_20' })
    expect(await failureOf(reads.bibliographicData({ ...EP1, number: brandString('EP99999999') }))).toEqual({
      kind: 'rejected', status: 400, code: 'ERR_30', message: 'Invalid procedure',
    })
    epo.answer('/portfolios', () => json(400, { code: 'ERR_15', message: 'Error retrieving from S3' }))
    expect(await failureOf(reads.portfolios())).toEqual({ kind: 'not-ready', code: 'ERR_15' })
    epo.answer('/portfolios', () => new Response('forbidden', { status: 403 }))
    expect(await failureOf(reads.portfolios())).toEqual({ kind: 'no-permission' })
    epo.answer('/portfolios', () => json(409, { error: 'conflict' }))
    expect(await failureOf(reads.portfolios())).toEqual({ kind: 'rejected', status: 409, message: '{"error":"conflict"}' })
    epo.answer('/portfolios', () => new Response('teapot', { status: 418 }))
    expect(await failureOf(reads.portfolios())).toEqual({ kind: 'rejected', status: 418, message: 'teapot' })
    epo.answer('/portfolios', () => new Response(null, { status: 502 }))
    expect(await failureOf(reads.portfolios())).toEqual({ kind: 'unreachable', status: 502 })
  })

  it('reports a network failure as unreachable, and a caller cancellation as the caller\'s own error', async () => {
    const epo = fakeEpo()
    const reads = client(epo)
    await reads.folders()
    epo.answer('/communications/folders', () => Promise.reject(new TypeError('fetch failed')))
    expect(await failureOf(reads.folders())).toEqual({ kind: 'unreachable' })
    const cancel = new AbortController()
    const reason = new Error('the person closed the page')
    epo.answer('/communications/folders', () => { cancel.abort(reason); return Promise.reject(reason) })
    await expect(reads.folders(cancel.signal)).rejects.toBe(reason)
  })

  it('reports an answer that does not match its schema as invalid, and keeps other parser errors', async () => {
    const epo = fakeEpo()
    const reads = client(epo)
    epo.answer('/portfolios', () => json(200, { content: [{ id: '1' }] }))
    expect(await failureOf(reads.portfolios())).toEqual({ kind: 'invalid-response', message: '/portfolios' })
    epo.answer('/applications?size=1', () => json(200, { content: [], size: 'one' }))
    expect(await failureOf(reads.applications({ size: 1 }))).toEqual({ kind: 'invalid-response', message: '/applications' })
  })

  it('reads a bibliographic record without its optional parts as empty lists', () => {
    expect(parseBibliographicData({
      application: { bibliographicData: { applicationIdentification: { procedure: 'UPP', applicationNumber: '00000002', filingDate: '2022-01-13' } } },
    })).toEqual({
      procedure: 'UPP', number: '00000002', filingDate: '2022-01-13', titles: {}, applicants: [], inventors: [], representatives: [],
      publications: [], priorities: [], ipc: [], cpc: [],
    })
    expect(parseBibliographicData({
      application: {
        bibliographicData: { applicationIdentification: { procedure: 'EPC', applicationNumber: '1', filingDate: '2022-01-13' } },
        patentClassificationBag: {}, partyBag: {},
      },
    })).toMatchObject({ ipc: [], cpc: [], applicants: [], inventors: [], representatives: [] })
  })

  it('reads an unknown portfolio type as other', () => {
    expect(parsePortfolios({ content: [{ id: '9', name: 'New', type: 'licensee', hasFullAccess: false }] })).toEqual([
      { id: '9', name: 'New', type: 'other', fullAccess: false },
    ])
  })

  it('describes each failure in one line without a credential value', () => {
    const lines = ([
      { kind: 'not-linked' }, { kind: 'refused' }, { kind: 'no-permission' }, { kind: 'no-permission', code: 'ERR_20' },
      { kind: 'not-ready', code: 'ERR_15' }, { kind: 'rejected', status: 400, message: 'bad' },
      { kind: 'rejected', status: 400, code: 'ERR_30', message: 'Invalid procedure' }, { kind: 'unreachable' },
      { kind: 'unreachable', status: 503 }, { kind: 'invalid-response', message: '/terms' },
    ] satisfies MyEpoFailure[]).map(describeFailure)
    expect(lines).toEqual([
      'MyEPO is not linked',
      'the EPO refused the client ID or the client secret',
      'the MyEPO account has no permission for this read',
      'the MyEPO account has no permission for this read (ERR_20)',
      'the MyEPO sandbox has no data before its reset (ERR_15)',
      'the EPO refused the read: 400 bad',
      'the EPO refused the read: 400 ERR_30 Invalid procedure',
      'the EPO did not answer',
      'the EPO did not answer (503)',
      'the EPO answer could not be read: /terms',
    ])
    expect(new MyEpoError({ kind: 'refused' })).toMatchObject({ name: 'MyEpoError', message: 'the EPO refused the client ID or the client secret' })
  })
})

describe('the MyEPO request gate', () => {
  it('starts at most the configured number of requests in each second, in call order', async () => {
    let clock = 1_000
    const waits: number[] = []
    const gate = createRequestGate(4, () => clock, (ms) => { waits.push(ms); return Promise.resolve() })
    await Promise.all([gate.wait(), gate.wait(), gate.wait()])
    expect(waits).toEqual([250, 500])
    clock += 2_000
    await gate.wait()
    expect(waits).toEqual([250, 500])
  })

  it('waits on the real clock and stops waiting when the caller cancels', async () => {
    vi.useFakeTimers()
    try {
      const gate = createRequestGate(1)
      await gate.wait()
      const second = gate.wait()
      await vi.advanceTimersByTimeAsync(1_000)
      await expect(second).resolves.toBeUndefined()
      const cancel = new AbortController()
      const third = gate.wait(cancel.signal)
      cancel.abort(new Error('closed'))
      await expect(third).rejects.toThrow('closed')
      const aborted = AbortSignal.abort(new Error('already closed'))
      await expect(gate.wait(aborted)).rejects.toThrow('already closed')
    } finally {
      vi.useRealTimers()
    }
  })
})
