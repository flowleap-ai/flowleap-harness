import { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import { createConnectors } from '@flowleap/connectors'
import { describe, expect, it } from 'vitest'
import {
  Config, FlowleapConnectorsController, FlowleapMyEpo, createConnectorHost, createCredentialStore, createMyEpoLink,
  validateMyEpoFields, validateMyEpoUrl,
  type MyEpoApplicationNumber, type MyEpoCommunication, type MyEpoReads,
} from '@deepseek-ai/dsh-flowleap-connectors'
import { MemoryCredentials } from './memory-credentials.ts'
import { CREDENTIALS, ENDPOINT, fakeEpo, json, type FakeEpo } from './myepo-fake.ts'

const KEY = credentialKey('flowleap-connectors', 'myepo')
const NOON = Date.parse('2026-11-09T12:00:00.000Z')

function bench(epo: FakeEpo = fakeEpo()) {
  const ctx = new Context()
  const credentials = new MemoryCredentials(ctx)
  let clock = NOON
  const link = createMyEpoLink({
    credentials, endpoint: ENDPOINT, gate: { wait: () => Promise.resolve() }, fetch: epo.fetch, now: () => clock,
  })
  return { ctx, credentials, link, epo, tick: (ms: number) => { clock += ms } }
}

describe('the MyEPO link', () => {
  it('stores credentials only after their test passed, with the facts of the test, and never shows a value', async () => {
    const { link, credentials } = bench()
    expect(await link.describe()).toEqual({ state: 'not-linked', writable: true })
    const outcome = await link.link({ clientId: ` ${CREDENTIALS.clientId} `, clientSecret: CREDENTIALS.clientSecret })
    expect(outcome).toMatchObject({ kind: 'passed', testedAt: '2026-11-09T12:00:00.000Z', mailbox: true })
    expect(outcome.kind === 'passed' ? outcome.portfolios : []).toEqual([
      { name: 'Applicant Portfolio 1', type: 'applicant', fullAccess: true },
      { name: 'Representative Portfolio 1', type: 'representative', fullAccess: true },
      { name: 'Association Portfolio 1', type: 'association', fullAccess: true },
      { name: 'Applicant Portfolio 2', type: 'applicant', fullAccess: false },
      { name: 'Representative Portfolio 2', type: 'representative', fullAccess: false },
      { name: 'Association Portfolio 2', type: 'association', fullAccess: false },
    ])
    expect(credentials.records.get(KEY)).toEqual({
      kind: 'grant',
      payload: { ...CREDENTIALS, testedAt: '2026-11-09T12:00:00.000Z', portfolios: '6', mailbox: 'yes' },
    })
    const view = await link.describe()
    expect(view).toEqual({ state: 'linked', writable: true, testedAt: '2026-11-09T12:00:00.000Z', portfolios: 6, mailbox: true })
    expect(JSON.stringify(view)).not.toContain(CREDENTIALS.clientSecret)
    expect(JSON.stringify(outcome)).not.toContain(CREDENTIALS.clientSecret)
  })

  it('stores nothing when the EPO refuses the credentials or does not answer', async () => {
    const { link, credentials, epo } = bench()
    expect(await link.link({ clientId: CREDENTIALS.clientId, clientSecret: 'wrong' })).toEqual({ kind: 'refused' })
    epo.answer(ENDPOINT.tokenUrl, () => Promise.reject(new TypeError('fetch failed')))
    expect(await link.link(CREDENTIALS)).toEqual({ kind: 'unreachable' })
    expect(credentials.records.size).toBe(0)
  })

  it('links an account with no portfolio permission or no Mailbox right, and says so', async () => {
    const { link, epo } = bench()
    epo.answer('/portfolios', () => json(200, { content: [], totalElements: 0 }))
    epo.answer('/communications/folders', () => json(403, { code: 'ERR_20', message: 'User is not authorised to perform this action.' }))
    expect(await link.link(CREDENTIALS)).toMatchObject({ kind: 'passed', portfolios: [], mailbox: false })
    expect(await link.describe()).toMatchObject({ state: 'linked', portfolios: 0, mailbox: false })
    epo.answer('/portfolios', () => json(403, { code: 'ERR_20', message: 'User is not authorised to perform this action.' }))
    expect(await link.test()).toMatchObject({ kind: 'passed', portfolios: [] })
  })

  it('reports another EPO refusal as a failed test with the EPO code', async () => {
    const { link, epo, credentials } = bench()
    epo.answer('/portfolios', () => json(400, { code: 'ERR_15', message: 'Error retrieving from S3' }))
    expect(await link.link(CREDENTIALS)).toEqual({ kind: 'failed', message: 'the MyEPO sandbox has no data before its reset (ERR_15)' })
    epo.answer('/portfolios', () => json(200, { content: [] }))
    epo.answer('/communications/folders', () => json(500, {}))
    expect(await link.link(CREDENTIALS)).toEqual({ kind: 'unreachable' })
    epo.answer('/communications/folders', () => json(400, { code: 'ERR_30', message: 'Invalid procedure' }))
    expect(await link.link(CREDENTIALS)).toEqual({ kind: 'failed', message: 'the EPO refused the read: 400 ERR_30 Invalid procedure' })
    epo.answer('/portfolios', () => json(400, { code: 'ERR_15', message: 'x' }))
    expect(credentials.records.size).toBe(0)
  })

  it('lets a caller cancellation through instead of reading it as a test outcome', async () => {
    const { link, epo } = bench()
    const cancel = new AbortController()
    const reason = new Error('the person left the page')
    epo.answer(ENDPOINT.tokenUrl, () => { cancel.abort(reason); return Promise.reject(reason) })
    await expect(link.link(CREDENTIALS, cancel.signal)).rejects.toBe(reason)
  })

  it('tests the stored link, stores the facts of a passed test, and keeps the link when the EPO does not answer', async () => {
    const { link, epo, tick } = bench()
    expect(await link.test()).toEqual({ kind: 'not-linked' })
    await link.link(CREDENTIALS)
    tick(3_600_000)
    expect(await link.test()).toMatchObject({ kind: 'passed', testedAt: '2026-11-09T13:00:00.000Z' })
    epo.answer('/portfolios', () => Promise.reject(new TypeError('fetch failed')))
    expect(await link.test()).toEqual({ kind: 'unreachable' })
    expect(await link.describe()).toMatchObject({ state: 'linked', testedAt: '2026-11-09T13:00:00.000Z' })
    await link.unlink()
    await link.unlink()
    expect(await link.describe()).toEqual({ state: 'not-linked', writable: true })
  })

  it('reads a record of another kind or with a missing fact as not linked', async () => {
    const { link, credentials } = bench()
    credentials.records.set(KEY, { kind: 'api-key', key: 'x' })
    expect(await link.describe()).toMatchObject({ state: 'not-linked' })
    credentials.records.set(KEY, { kind: 'grant', payload: { ...CREDENTIALS } })
    expect(await link.describe()).toMatchObject({ state: 'not-linked' })
    credentials.writable = false
    expect(await link.describe()).toEqual({ state: 'not-linked', writable: false })
  })

  it('checks the two fields of a link request', () => {
    expect(validateMyEpoFields({ clientId: ' a ', clientSecret: 'b' })).toEqual({ clientId: 'a', clientSecret: 'b' })
    expect(() => validateMyEpoFields({ clientId: 'a' })).toThrow('MyEPO: field "clientSecret" is required')
    expect(() => validateMyEpoFields({ clientId: ' ', clientSecret: 'b' })).toThrow('MyEPO: field "clientId" is required')
    expect(() => validateMyEpoFields({ clientId: 'a', clientSecret: 'b', scope: 'x' })).toThrow('MyEPO: unknown field "scope"')
  })
})

describe('the flowleapMyEpo service', () => {
  it('serves every read on the stored link and refuses while no link is stored', async () => {
    const { ctx, link } = bench()
    await ctx.plugin(FlowleapMyEpo, { reads: link.reads })
    const service: MyEpoReads = ctx.flowleapMyEpo
    await expect(service.portfolios()).rejects.toMatchObject({ failure: { kind: 'not-linked' } })
    await link.link(CREDENTIALS)
    const ep1 = { procedure: 'EPC' as const, number: brandString<MyEpoApplicationNumber>('EP00000001') }
    expect(await service.portfolios()).toHaveLength(6)
    expect((await service.applications()).total).toBe(8)
    expect((await service.bibliographicData(ep1)).titles['EN']).toBe('Dummy title EN')
    const letters = await service.communications()
    expect(letters.total).toBe(9)
    expect((await service.unhandledCommunications()).items).toHaveLength(9)
    expect(await service.folders()).toHaveLength(2)
    expect((await service.downloadCommunication(letters.items[0] as MyEpoCommunication)).filename).toMatch(/\.pdf$/)
    expect(await service.dueDates(ep1)).toHaveLength(2)
    expect(await service.terms()).toHaveLength(82)
    expect(await service.pendingFees(ep1)).toHaveLength(3)
  })
})

describe('the MyEPO Remote methods', () => {
  async function remote() {
    const { ctx, credentials, link, epo } = bench()
    const store = createCredentialStore(credentials)
    const bound = createConnectorHost({ store, logger: ctx.logger, cacheEntries: 10, fetch: () => Promise.reject(new Error('no office calls')) })
    await ctx.plugin(FlowleapConnectorsController, { store, connectors: createConnectors(bound.host), bound, myEpo: link })
    return { controller: ctx.flowleapConnectors, credentials, epo }
  }

  it('describes, links, tests and unlinks', async () => {
    const { controller } = await remote()
    const signal = new AbortController().signal
    expect(await controller.myEpoDescribe()).toEqual({ state: 'not-linked', writable: true })
    expect(await controller.myEpoTest(signal)).toEqual({ kind: 'not-linked' })
    expect(await controller.myEpoLink({ ...CREDENTIALS }, signal)).toMatchObject({ kind: 'passed' })
    expect(await controller.myEpoTest(signal)).toMatchObject({ kind: 'passed' })
    expect(await controller.myEpoDescribe()).toMatchObject({ state: 'linked', portfolios: 6 })
    await controller.myEpoUnlink()
    expect(await controller.myEpoDescribe()).toMatchObject({ state: 'not-linked' })
  })

  it('refuses a bad payload as gateway/bad-request and a refused write as flowleap-connectors/rejected', async () => {
    const { controller, credentials } = await remote()
    const signal = new AbortController().signal
    await expect(controller.myEpoLink({ clientId: 'a' }, signal)).rejects.toMatchObject({
      code: 'gateway/bad-request', message: 'MyEPO: field "clientSecret" is required',
    })
    const wrongType = Object.fromEntries([['clientId', 1], ['clientSecret', 'b']]) as Record<string, string>
    await expect(controller.myEpoLink(wrongType, signal)).rejects.toMatchObject({ code: 'gateway/bad-request' })
    credentials.writable = false
    await expect(controller.myEpoLink({ ...CREDENTIALS }, signal)).rejects.toMatchObject({
      code: 'flowleap-connectors/rejected', message: 'memory credentials: read-only', details: { id: 'myepo' },
    })
    await expect(controller.myEpoUnlink()).rejects.toMatchObject({ code: 'flowleap-connectors/rejected', details: { id: 'myepo' } })
  })
})

describe('the MyEPO Config', () => {
  it('defaults to the EPO production services and validates each field', () => {
    const parse = (input: { myepo?: Partial<Config['myepo']> }) => Config(input as Config)
    expect(parse({}).myepo).toEqual({
      baseUrl: 'https://api.apps.epo.org/latest',
      tokenUrl: 'https://login.epo.org/oauth2/aus6hh2ns9ORf2PD3417/v1/token',
      requestsPerSecond: 4,
      timeoutSeconds: 30,
    })
    expect(() => parse({ myepo: { requestsPerSecond: 0 } })).toThrow()
    expect(() => parse({ myepo: { timeoutSeconds: 0 } })).toThrow()
  })

  it('accepts HTTPS, or HTTP to a loopback double, and removes a trailing slash', () => {
    expect(validateMyEpoUrl('baseUrl', 'https://api-sandbox.apps-staging.epo.org/latest/')).toBe('https://api-sandbox.apps-staging.epo.org/latest')
    expect(validateMyEpoUrl('baseUrl', 'http://127.0.0.1:9000/latest')).toBe('http://127.0.0.1:9000/latest')
    expect(validateMyEpoUrl('baseUrl', 'http://localhost:9000')).toBe('http://localhost:9000')
    expect(validateMyEpoUrl('baseUrl', 'http://[::1]:9000')).toBe('http://[::1]:9000')
    expect(() => validateMyEpoUrl('tokenUrl', 'http://login.epo.org/token')).toThrow('flowleap-connectors: myepo.tokenUrl must use HTTPS: http://login.epo.org/token')
    expect(() => validateMyEpoUrl('baseUrl', 'not a url')).toThrow('flowleap-connectors: myepo.baseUrl is not a URL: not a url')
  })
})
