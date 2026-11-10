import { createHash } from 'node:crypto'
import { brandString } from '@deepseek-ai/dsh-brand'
import { loadSeed } from 'flowleap-seed-firm'
import { describe, expect, it } from 'vitest'
import {
  createMyEpoClient, MyEpoError, parseApplications, parseBibliographicData, parseCommunications, parseDueDates, parseFees,
  parseFolders, parsePortfolios, parseTerms,
  type MyEpoApplicationNumber, type MyEpoFailure, type MyEpoPortfolioId, type MyEpoReads,
} from '@deepseek-ai/dsh-flowleap-connectors'
import { API_REFUSED, createMyEpoDouble, NOT_PERMITTED, READ_ONLY, TOKEN_REFUSED, UNKNOWN_APPLICATION, type MyEpoDouble } from './myepo-double/double.ts'
import { recorded, sandboxData } from './myepo-double/sandbox-data.ts'
import { ARRIVAL, DERIVED, DOUBLE_CLIENT, RESTRICTED_APPLICATION, SAMPLE_MARKER, seedData } from './myepo-double/seed-data.ts'
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
    expect({ status: answer.status, body }).toEqual({ status: expected.status, body: expected.body })
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
    expect(await client.dueDates(ep('EP23771920'))).toEqual([{ termKey: 'DUE_TERM_21', dueDate: '2027-01-29', actor: 'applicant' }])
    expect(await client.pendingFees(ep('EP23771920'))).toEqual([{ feeCode: '007', amount: 1135, dueDate: '2027-01-29' }, { feeCode: '035', amount: 1050, dueDate: '2027-09-30' }])
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
    expect(document.filename).toBe('P-2020-0063DEWOEP-2026.10.14-EP21810318-2317A.pdf')
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
    expect(arrived).toMatchObject({ applicationNumber: 'EP23771920.8', documentCode: '2004C', dispatchDate: '2026-09-29', userReference: '1206/EPw/0', read: false, handled: false })
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

  it('names the source of every derived due date and fee, and keeps them out of the past', () => {
    for (const entry of DERIVED) {
      expect(entry.source.length, entry.application).toBeGreaterThan(20)
      expect(entry.value.dueDate >= seed.clocks.clocks[seed.clocks.default]!, entry.application).toBe(true)
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
