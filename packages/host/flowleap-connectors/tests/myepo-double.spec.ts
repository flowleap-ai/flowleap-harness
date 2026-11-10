import { createHash } from 'node:crypto'
import { brandString } from '@deepseek-ai/dsh-brand'
import { loadSeed } from 'flowleap-seed-firm'
import { describe, expect, it, vi } from 'vitest'
import {
  createMyEpoClient, MyEpoError, parseApplications, parseBibliographicData, parseCommunications, parseDueDates, parseFees,
  parseFolders, parsePortfolios, parseTerms,
  type MyEpoApplicationNumber, type MyEpoFailure, type MyEpoFolderId, type MyEpoPortfolioId, type MyEpoReads,
} from '@deepseek-ai/dsh-flowleap-connectors'
import {
  API_REFUSED, BAD_PAGE, createMyEpoDouble, NOT_PERMITTED, READ_ONLY, TOKEN_REFUSED, UNKNOWN_APPLICATION, UNKNOWN_COMMUNICATION,
  type MyEpoDouble, type MyEpoDoubleData,
} from './myepo-double/double.ts'
import { recorded, sandboxData } from './myepo-double/sandbox-data.ts'
import { ARRIVAL, derivedValues, DOUBLE_CLIENT, RECIPIENT, RESTRICTED_APPLICATION, SAMPLE_MARKER, seedData } from './myepo-double/seed-data.ts'
import { startMyEpoDoubleServer } from './myepo-double/server.ts'

const ENDPOINT = { baseUrl: 'https://double.test/latest', tokenUrl: 'https://double.test/token' }
const seed = loadSeed()
const ep = (number: string): { procedure: 'EPC'; number: MyEpoApplicationNumber } => ({ procedure: 'EPC', number: brandString<MyEpoApplicationNumber>(number) })

function seedDouble(): MyEpoDouble {
  return createMyEpoDouble(seedData(ENDPOINT.baseUrl, seed), ENDPOINT, DOUBLE_CLIENT)
}

function reads(double: MyEpoDouble): MyEpoReads {
  return createMyEpoClient({
    endpoint: { ...ENDPOINT, requestsPerSecond: 1000, timeoutSeconds: 5 },
    gate: { wait: () => Promise.resolve() },
    fetch: double.fetch,
    credentials: () => Promise.resolve(DOUBLE_CLIENT),
    now: Date.now,
  })
}

async function failureOf(read: Promise<unknown>): Promise<MyEpoFailure> {
  const error = await read.then(() => undefined, (cause: unknown) => cause)
  expect(error).toBeInstanceOf(MyEpoError)
  return (error as MyEpoError).failure
}

async function tokenOf(double: MyEpoDouble): Promise<string> {
  const answer = await double.fetch(ENDPOINT.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'mailboxapi', client_id: DOUBLE_CLIENT.clientId, client_secret: DOUBLE_CLIENT.clientSecret }).toString(),
  })
  return ((await answer.json()) as { access_token: string }).access_token
}

async function get(double: MyEpoDouble, path: string, method = 'GET'): Promise<Response> {
  return double.fetch(`${ENDPOINT.baseUrl}${path}`, { method, headers: { authorization: `Bearer ${await tokenOf(double)}` } })
}

describe('the MyEPO double on the recorded sandbox data', () => {
  const answers: [string, string][] = [
    ['/portfolios', 'portfolios'],
    ['/applications', 'applications'],
    ['/applications?page=1&size=2', 'applications-page'],
    ['/applications?portfolioId=999', 'applications-portfolio-999'],
    ['/biblio-data/EPC/applications/EP00000001', 'biblio-EPC-EP00000001'],
    ['/biblio-data/EPC/applications/EP99999999', 'biblio-unknown'],
    ['/communications', 'communications'],
    ['/communications/unhandled', 'communications-unhandled'],
    ['/communications/folders', 'folders'],
    ['/EPC/applications/EP00000001/dueDates', 'due-dates-EPC-EP00000001'],
    ['/terms', 'terms'],
    ['/EPC/applications/EP00000001/fees', 'fees-EPC-EP00000001'],
  ]
  it.each(answers)('answers GET %s as the sandbox did (%s)', async (path, name) => {
    const double = createMyEpoDouble(sandboxData(), ENDPOINT, DOUBLE_CLIENT)
    const answer = await get(double, path)
    const expected = recorded(name)
    const body: unknown = await answer.json()
    expect({ status: answer.status, contentType: answer.headers.get('content-type'), body })
      .toEqual({ status: expected.status, contentType: expected.contentType, body: expected.body })
  })

  it('refuses a wrong secret and a foreign token in the recorded forms', async () => {
    const double = createMyEpoDouble(sandboxData(), ENDPOINT, DOUBLE_CLIENT)
    const refused = await double.fetch(ENDPOINT.tokenUrl, {
      method: 'POST',
      headers: { authorization: `Basic ${Buffer.from(`${DOUBLE_CLIENT.clientId}:wrong`).toString('base64')}` },
      body: 'grant_type=client_credentials&scope=mailboxapi',
    })
    const refusal: unknown = await refused.json()
    expect({ status: refused.status, body: refusal }).toEqual(recorded('token-refused'))
    expect(TOKEN_REFUSED).toEqual(recorded('token-refused').body)
    const foreign = await double.fetch(`${ENDPOINT.baseUrl}/portfolios`, { headers: { authorization: 'Bearer not-issued' } })
    expect({ status: foreign.status, contentType: foreign.headers.get('content-type'), body: await foreign.text() })
      .toEqual({ status: 401, contentType: 'text/plain', body: API_REFUSED })
    expect(API_REFUSED).toBe(recorded('api-401').body)
  })

  it('uses the recorded error bodies for ERR_20 and ERR_30', () => {
    expect(NOT_PERMITTED).toEqual(recorded('applications-portfolio-999').body)
    expect(UNKNOWN_APPLICATION).toEqual(recorded('biblio-unknown').body)
  })
})

describe('the MyEPO double on the seed firm', () => {
  it('serves every answer in a form the connector parses', async () => {
    const double = seedDouble()
    const parsers: [string, (body: unknown) => unknown][] = [
      ['/portfolios', parsePortfolios],
      ['/applications', parseApplications],
      ['/communications', parseCommunications],
      ['/communications/unhandled', parseCommunications],
      ['/communications/folders', parseFolders],
      ['/terms', parseTerms],
      ...seed.matters.flatMap((matter): [string, (body: unknown) => unknown][] => [
        [`/biblio-data/EPC/applications/${matter.application}`, parseBibliographicData],
        [`/EPC/applications/${matter.application}/dueDates`, parseDueDates],
        [`/EPC/applications/${matter.application}/fees`, parseFees],
      ]),
    ]
    for (const [path, parse] of parsers) {
      const answer = await get(double, path)
      expect(answer.status, path).toBe(200)
      const body: unknown = await answer.json()
      expect(() => parse(body), path).not.toThrow()
    }
  })

  it('reads the seed matters, their published data and their letters through the connector', async () => {
    const client = reads(seedDouble())
    const portfolios = await client.portfolios()
    expect(portfolios.map(portfolio => portfolio.name)).toEqual(seed.clients.map(client => `${client.publishedNames[0]} (${SAMPLE_MARKER})`))
    const applications = await client.applications({ size: 50 })
    expect(applications.items.map(row => [row.number, row.fileReference]).sort())
      .toEqual(seed.matters.map(matter => [matter.application, matter.fileNumber]).sort())
    expect(applications.items.find(row => row.number === 'EP23771920')).toMatchObject({ numberWithCheckDigit: 'EP23771920.8', filingDate: '2023-09-06', fileReference: 'SF-2023-0045' })
    const renishaw = portfolios.find(portfolio => portfolio.name.startsWith('Renishaw'))!
    expect((await client.applications({ portfolioId: renishaw.id })).items.map(row => row.number)).toEqual(['EP23755468', 'EP23771920'])
    expect((await client.applications({ applicantFileReference: 'SF-2023-0045' })).items.map(row => row.number)).toEqual(['EP23771920'])

    expect(await client.bibliographicData(ep('EP23771920'))).toEqual({
      procedure: 'EPC', number: '23771920', filingDate: '2023-09-06',
      titles: { EN: 'APPARATUS AND METHOD FOR POSITION ENCODING' },
      applicants: ['Renishaw plc'],
      inventors: ['FISHER, Harrison, Clinton', 'GORDON-INGRAM, Iain, Robert'],
      representatives: ['Dunn, Paul Edward, et al, Renishaw plc Patent Department New Mills, Wotton-under-Edge, Glos. GL12 8JR, GB'],
      publications: [{ office: 'EP', number: '4584557', kind: 'A1', date: '2025-07-16' }],
      priorities: [{ office: 'EP', number: '22275123', filingDate: '2022-09-08' }],
      ipc: ['G01D 5/244', 'G01D 5/245', 'G01D 5/347'],
      cpc: ['G01D 5/2448', 'G01D 5/2455', 'G01D 5/34715', 'G01D 5/34792', 'G06T 7/73', 'G06T 2207/20056', 'G06T 2207/30204'],
    })
    expect(await client.dueDates(ep('EP23771920'))).toEqual([])
    expect(await client.pendingFees(ep('EP23771920'))).toEqual([{ feeCode: '035', amount: 1050, dueDate: '2027-09-30' }])
    expect(await client.pendingFees(ep('EP20706232'))).toEqual([])
    const terms = await client.terms()
    expect(terms).toHaveLength(82)
    expect(terms.find(term => term.termKey === 'DUE_TERM_21')?.description.en).toBe('Reply to communication about intention to grant')

    expect(await client.folders()).toEqual([{ id: 'sfinbox00000001', name: 'Inbox' }, { id: 'sfdone000000001', name: 'Done' }])
    const letters = await client.communications({ size: 50 })
    expect(letters.total).toBe(16)
    expect(new Set(letters.items.map(letter => letter.documentCode))).toEqual(new Set(['1081', '1503', '2001A', '2004C', '2006A', '2015C', '2317A']))
    const unhandled = (await client.unhandledCommunications()).items
    expect(unhandled.map(letter => [letter.applicationNumber, letter.documentCode, letter.dispatchDate])).toEqual([
      ['EP21810318.2', '2317A', '2026-10-14'],
      ['EP24166597.5', '2001A', '2026-09-18'],
      ['EP23755468.8', '2001A', '2026-06-09'],
    ])
  })

  it('downloads a seed letter as a ZIP of its register PDF and marks only that letter as read', async () => {
    const double = seedDouble()
    const client = reads(double)
    const opposition = (await client.unhandledCommunications()).items[0]!
    expect(opposition.read).toBe(false)
    const document = await client.downloadCommunication(opposition)
    const source = seed.matters.find(matter => matter.application === 'EP21810318')!.documents.find(row => row.row === 15) as { sha256?: string }
    expect(createHash('sha256').update(document.pdf).digest('hex')).toBe(source.sha256)
    expect(document.filename).toBe('SF-2026-0019-2026.10.14-EP21810318-2317A.pdf')
    expect(opposition.userReference).toBe('SF-2026-0019')
    const after = (await client.unhandledCommunications()).items
    expect(after.map(letter => [letter.id, letter.read, letter.handled])).toEqual([
      [opposition.id, true, false], [after[1]!.id, false, false], [after[2]!.id, false, false],
    ])
  })

  it('delivers the arrival unread on request, and a reset restores the Mailbox', async () => {
    const double = seedDouble()
    const client = reads(double)
    expect(double.state().waiting).toBe(1)
    const arrived = double.arrive()
    expect(arrived).toMatchObject({ applicationNumber: 'EP23771920.8', documentCode: '2004C', dispatchDate: '2026-09-29', userReference: 'SF-2023-0045', read: false, handled: false })
    expect(double.arrive()).toBeUndefined()
    const unhandled = (await client.unhandledCommunications()).items
    expect(unhandled.map(letter => letter.documentCode)).toEqual(['2317A', '2004C', '2001A', '2001A'])
    await client.downloadCommunication(unhandled[0]!)
    double.reset()
    expect(double.state().waiting).toBe(1)
    expect(double.state().letters.filter(letter => !letter.handled).map(letter => letter.read)).toEqual([false, false, false])
    expect(`${ARRIVAL.application}/${ARRIVAL.row}`).toBe('EP23771920/18')
  })

  it('answers 403 ERR_20 outside the portfolios and 400 ERR_30 for an unknown application', async () => {
    const client = reads(seedDouble())
    expect(await failureOf(client.bibliographicData(ep(RESTRICTED_APPLICATION)))).toEqual({ kind: 'no-permission', code: 'ERR_20' })
    expect(await failureOf(client.dueDates(ep(RESTRICTED_APPLICATION)))).toEqual({ kind: 'no-permission', code: 'ERR_20' })
    expect(await failureOf(client.applications({ portfolioId: brandString<MyEpoPortfolioId>('999') }))).toEqual({ kind: 'no-permission', code: 'ERR_20' })
    expect(await failureOf(client.pendingFees(ep('EP99999999')))).toEqual({ kind: 'rejected', status: 400, code: 'ERR_30', message: 'Invalid procedure' })
    expect(await failureOf(client.bibliographicData({ procedure: 'UPP', number: brandString<MyEpoApplicationNumber>('EP23771920') })))
      .toEqual({ kind: 'rejected', status: 400, code: 'ERR_30', message: 'Invalid procedure' })
  })

  it('refuses the four write operations of the API', async () => {
    const double = seedDouble()
    for (const [method, path] of [['POST', '/communications/handle'], ['POST', '/communications/handle/abc'], ['POST', '/communications/move/sfdone000000001'], ['PATCH', '/EPC/applications/EP23771920']]) {
      const answer = await get(double, path!, method)
      const body: unknown = await answer.json()
      expect({ status: answer.status, body }, `${method} ${path}`).toEqual({ status: 501, body: READ_ONLY })
    }
  })

  it('takes each due date from a flowleap-deadlines rule and names the source of every derived value', async () => {
    const filingDates = Object.fromEntries(seed.matters.map((matter) => {
      const filing = (matter.register['get_register_biblio']!.body as { dates: { filing: string } }).dates.filing
      return [matter.application, `${filing.slice(0, 4)}-${filing.slice(4, 6)}-${filing.slice(6, 8)}`]
    }))
    const derived = derivedValues(seed, filingDates)
    expect(derived.filter(entry => entry.kind === 'due-date').map(entry => [entry.application, entry.value.dueDate])).toEqual([['EP23771920', '2027-01-29']])
    expect(derived.find(entry => entry.kind === 'due-date')?.source).toContain('ep.r71-3.grant-communication v1 of flowleap-deadlines')
    expect(derived.find(entry => entry.kind === 'due-date')?.source).toContain('Rule 134(1) EPC; OJ EPO 2026, A30')
    for (const entry of derived) {
      expect(entry.source.length, entry.application).toBeGreaterThan(20)
      expect(entry.value.dueDate >= seed.clocks.clocks[seed.clocks.default]!, entry.application).toBe(true)
    }
    expect(() => derivedValues(seed, { ...filingDates, EP24166597: '2024-12-27' })).toThrow(/2027-12-31, a closed day of the EPO/)
    const client = reads(seedDouble())
    expect(await client.dueDates(ep('EP24166597'))).toEqual([])
    expect(await client.dueDates(ep('EP21810318'))).toEqual([])
    expect(await client.pendingFees(ep('EP22213933'))).toEqual([{ feeCode: '044', amount: 1865, dueDate: '2027-05-31' }])
  })

  it('shows the due date and the fee that a letter states only after that letter arrives, and again after a reset', async () => {
    const double = seedDouble()
    const client = reads(double)
    double.arrive()
    expect(await client.dueDates(ep('EP23771920'))).toEqual([{ termKey: 'DUE_TERM_21', dueDate: '2027-01-29', actor: 'applicant' }])
    expect(await client.pendingFees(ep('EP23771920')))
      .toEqual([{ feeCode: '007', amount: 1135, dueDate: '2027-01-29' }, { feeCode: '035', amount: 1050, dueDate: '2027-09-30' }])
    double.reset()
    expect(await client.dueDates(ep('EP23771920'))).toEqual([])
  })

  it('marks every letter and every application row as public sample data', async () => {
    const client = reads(seedDouble())
    const letters = (await client.communications({ size: 50 })).items
    expect(letters.every(letter => letter.recipientName === RECIPIENT && RECIPIENT.includes(SAMPLE_MARKER))).toBe(true)
    expect((await client.applications({ size: 50 })).items.every(row => row.portfolioName.includes(SAMPLE_MARKER))).toBe(true)
  })

  it('filters letters by folder and applications by number', async () => {
    const client = reads(seedDouble())
    const inbox = await client.communications({ folderId: brandString<MyEpoFolderId>('sfinbox00000001') })
    expect(inbox.items.map(letter => letter.documentCode)).toEqual(['2317A', '2001A', '2001A'])
    expect((await client.communications({ folderId: brandString<MyEpoFolderId>('sfdone000000001'), size: 50 })).total).toBe(13)
    const one = await client.applications({ applicationNumber: brandString<MyEpoApplicationNumber>('EP24166597') })
    expect(one.items.map(row => row.fileReference)).toEqual(['SF-2024-0007'])
    expect((await client.applications({ applicationNumber: brandString<MyEpoApplicationNumber>('EP99999999') })).total).toBe(0)
  })

  it('refuses a page or size that is not a whole number in range', async () => {
    const double = seedDouble()
    for (const query of ['size=0', 'size=-1', 'size=abc', 'page=1.5', 'page=-2']) {
      const answer = await get(double, `/communications?${query}`)
      const body: unknown = await answer.json()
      expect({ status: answer.status, body }, query).toEqual({ status: 400, body: BAD_PAGE })
    }
    const second: unknown = await (await get(double, '/applications?page=1&size=3')).json()
    expect(second).toMatchObject({ size: 3, number: 1, totalElements: 7 })
  })

  it('answers the token endpoint\'s refusals and the API\'s wrong method', async () => {
    const double = seedDouble()
    const basic = `Basic ${Buffer.from(`${DOUBLE_CLIENT.clientId}:${DOUBLE_CLIENT.clientSecret}`).toString('base64')}`
    const tokenCall = async (method: string, body?: string): Promise<{ status: number; body: unknown }> => {
      const init = { method, headers: { authorization: basic }, ...body === undefined ? {} : { body } }
      const answer = await double.fetch(ENDPOINT.tokenUrl, init)
      const json: unknown = await answer.json()
      return { status: answer.status, body: json }
    }
    expect(await tokenCall('GET')).toMatchObject({ status: 405, body: { error: 'invalid_request' } })
    expect(await tokenCall('POST', 'grant_type=password&scope=mailboxapi')).toMatchObject({ status: 400, body: { error: 'unsupported_grant_type' } })
    expect(await tokenCall('POST', 'grant_type=client_credentials&scope=other')).toMatchObject({ status: 400, body: { error: 'invalid_scope' } })
    const wrongMethod = await get(double, '/portfolios', 'DELETE')
    const body: unknown = await wrongMethod.json()
    expect({ status: wrongMethod.status, body }).toEqual({ status: 405, body: { code: 'DOUBLE_METHOD', message: 'The MyEPO double answers GET at /portfolios' } })
    const unknown = await get(double, '/communications/download/nothere')
    const unknownBody: unknown = await unknown.json()
    expect({ status: unknown.status, body: unknownBody }).toEqual({ status: 400, body: UNKNOWN_COMMUNICATION })
  })

  it('answers 500 and keeps serving when an answer fails', async () => {
    const broken = (baseUrl: string): MyEpoDoubleData => {
      const data = seedData(baseUrl, seed)
      return { ...data, letters: data.letters.map(letter => ({ ...letter, pdf: () => { throw new Error('the PDF is gone') } })) }
    }
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const server = await startMyEpoDoubleServer({ port: 0, data: broken, client: DOUBLE_CLIENT })
    try {
      const token = (await (await fetch(server.tokenUrl, {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: `grant_type=client_credentials&scope=mailboxapi&client_id=${DOUBLE_CLIENT.clientId}&client_secret=${DOUBLE_CLIENT.clientSecret}`,
      })).json()) as { access_token: string }
      const auth = { authorization: `Bearer ${token.access_token}` }
      const letter = server.double.state().letters[0]!
      expect((await fetch(`${server.baseUrl}/communications/download/${letter.id}`, { headers: auth })).status).toBe(500)
      expect(logged).toHaveBeenCalledWith('MyEPO double: answer failed', expect.any(Error))
      expect((await fetch(`${server.baseUrl}/portfolios`, { headers: auth })).status).toBe(200)
    } finally {
      logged.mockRestore()
      await server.close()
    }
  })

  it('serves the API, the token and the control surface on a loopback port', async () => {
    const server = await startMyEpoDoubleServer({ port: 0, data: seedData, client: DOUBLE_CLIENT })
    try {
      expect(server.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/latest$/)
      const client = createMyEpoClient({
        endpoint: { baseUrl: server.baseUrl, tokenUrl: server.tokenUrl, requestsPerSecond: 1000, timeoutSeconds: 5 },
        gate: { wait: () => Promise.resolve() }, fetch, credentials: () => Promise.resolve(DOUBLE_CLIENT), now: Date.now,
      })
      expect((await client.portfolios())[0]?.name).toContain(SAMPLE_MARKER)
      const arrive = await fetch(`${server.origin}/_double/arrive`, { method: 'POST' })
      expect(((await arrive.json()) as { arrived: { documentCode: string } }).arrived.documentCode).toBe('2004C')
      expect((await fetch(`${server.origin}/_double/arrive`, { method: 'POST' })).status).toBe(409)
      expect((await client.unhandledCommunications()).total).toBe(4)
      const reset = (await (await fetch(`${server.origin}/_double/reset`, { method: 'POST' })).json()) as { data: string; waiting: number }
      expect(reset.data).toContain(SAMPLE_MARKER)
      expect(reset.waiting).toBe(1)
      expect((await fetch(`${server.origin}/_double/nothing`)).status).toBe(404)
      expect((await fetch(`${server.origin}/elsewhere`)).status).toBe(404)
    } finally {
      await server.close()
    }
  })
})
