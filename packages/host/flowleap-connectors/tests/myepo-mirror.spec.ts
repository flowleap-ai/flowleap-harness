import { describe, expect, it } from 'vitest'
import {
  createMyEpoClient, createRequestGate, MyEpoError, MyEpoIntakeError,
  type MyEpoApplicationKey, type MyEpoApplicationsCopy, type MyEpoMailboxCopy, type MyEpoMirror,
} from '@deepseek-ai/dsh-flowleap-connectors'
import { copyMyEpoToRecord, createMyEpoMirror } from '../src/myepo-mirror.ts'
import { createMyEpoDouble } from './myepo-double/double.ts'
import { DOUBLE_CLIENT, RESTRICTED_APPLICATION, seedData } from './myepo-double/seed-data.ts'

const ENDPOINT = { baseUrl: 'https://double.test/latest', tokenUrl: 'https://double.test/token', requestsPerSecond: 1000, timeoutSeconds: 5 }
const NOW = Date.parse('2026-11-16T08:00:00Z')
const READ_AT = '2026-11-16T08:00:00.000Z'
const RECORD = 'http://record.test/records/api/'

/** A fetch answer that replaces the answer of the double; `undefined` keeps it. */
type Answer = (url: URL) => Response | undefined

function setup(answer?: Answer) {
  const double = createMyEpoDouble(seedData(ENDPOINT.baseUrl), ENDPOINT, DOUBLE_CLIENT)
  const paths: string[] = []
  const reads = createMyEpoClient({
    endpoint: ENDPOINT, credentials: () => Promise.resolve(DOUBLE_CLIENT), gate: createRequestGate(ENDPOINT.requestsPerSecond),
    now: () => NOW,
    fetch: (input, init) => {
      const url = new URL(String(input instanceof Request ? input.url : input))
      paths.push(url.pathname)
      return Promise.resolve(answer?.(url)).then(own => own ?? double.fetch(input, init))
    },
  })
  return { double, reads, paths }
}

/** A Firm Record in memory: it keeps each copy, and names as stale what `stale` picks from the list. */
function memoryMirror(stale: (copy: MyEpoApplicationsCopy) => readonly MyEpoApplicationKey[] = () => []) {
  const details = new Map<string, { readAt: string; detail: unknown }>()
  const kept: { mailbox?: MyEpoMailboxCopy; applications?: MyEpoApplicationsCopy; details: typeof details } = { details }
  const mirror: MyEpoMirror = {
    mailbox: (copy) => {
      kept.mailbox = copy
      return Promise.resolve()
    },
    applications: (copy) => {
      kept.applications = copy
      return Promise.resolve(stale(copy))
    },
    detail: ({ procedure, number }, readAt, detail) => {
      kept.details.set(`${procedure}/${number}`, { readAt, detail })
      return Promise.resolve()
    },
  }
  return { mirror, kept }
}

const keyOf = ({ procedure, number }: MyEpoApplicationKey): MyEpoApplicationKey => ({ procedure, number })

describe('copyMyEpoToRecord', () => {
  it('sends the Mailbox with each letter of the list and the folders, and the applications, and downloads no letter', async () => {
    const { double, reads, paths } = setup()
    const { mirror, kept } = memoryMirror()
    const before = double.state().letters.filter(letter => letter.read).length
    const pass = await copyMyEpoToRecord({ reads, mirror, now: () => NOW })
    const letters = double.state().letters
    expect(pass).toEqual({ letters: letters.length, applications: kept.applications!.applications.length, details: 0, noDetail: [] })
    expect(kept.mailbox!.readAt).toBe(READ_AT)
    expect(kept.mailbox!.total).toBe(letters.length)
    expect(kept.mailbox!.letters.map(letter => letter.id).sort()).toEqual(letters.map(letter => letter.id).sort())
    expect(kept.mailbox!.letters.some(letter => letter.handled)).toBe(true)
    expect(kept.mailbox!.folders.length).toBeGreaterThan(0)
    expect(kept.applications!.readAt).toBe(READ_AT)
    expect(kept.applications!.applications.length).toBeGreaterThan(0)
    expect(kept.applications!.applications[0]).toEqual(expect.objectContaining({ procedure: 'EPC', number: expect.stringMatching(/^EP\d{8}$/u) as string }))
    expect(double.state().letters.filter(letter => letter.read).length).toBe(before)
    expect(paths.some(path => path.includes('/download/') || path.endsWith('/terms'))).toBe(false)
  })

  it('reads and stores the data of each application that the record names, and stores no data for one that the account may not read', async () => {
    const { reads, paths } = setup()
    const { mirror, kept } = memoryMirror(copy => copy.applications.slice(0, 3).map(keyOf).concat({ procedure: 'EPC', number: RESTRICTED_APPLICATION }))
    const pass = await copyMyEpoToRecord({ reads, mirror, now: () => NOW })
    expect(pass.details).toBe(3)
    expect(pass.noDetail).toEqual([{ application: { procedure: 'EPC', number: RESTRICTED_APPLICATION }, reason: expect.any(String) as string }])
    expect(kept.details.get(`EPC/${RESTRICTED_APPLICATION}`)).toEqual({ readAt: READ_AT, detail: null })
    const first = kept.applications!.applications[0]!
    const stored = kept.details.get(`${first.procedure}/${first.number}`)!
    expect(stored.readAt).toBe(READ_AT)
    expect(Object.keys(stored.detail as object)).toEqual(expect.arrayContaining(['titles', 'applicants', 'dueDates', 'fees']))
    expect(paths.filter(path => path.endsWith('/terms')).length).toBe(1)
  })

  it('sends an empty list when the account may read no portfolio', async () => {
    const { reads } = setup(url => url.pathname.endsWith('/applications') ? Response.json({ code: 'ERR_20', message: 'no portfolio' }, { status: 403 }) : undefined)
    const { mirror, kept } = memoryMirror()
    const pass = await copyMyEpoToRecord({ reads, mirror, now: () => NOW })
    expect(pass.applications).toBe(0)
    expect(kept.applications).toEqual({ readAt: READ_AT, total: 0, applications: [] })
  })

  it('stops the pass when MyEPO does not answer the list, a wait answers an application, or the terms give no answer', async () => {
    const down = (path: string, status: number): Answer => url => url.pathname.endsWith(path) ? Response.json({ code: 'ERR', message: 'spec' }, { status }) : undefined
    const all = (copy: MyEpoApplicationsCopy) => copy.applications.slice(0, 1).map(keyOf)
    const list = setup(down('/applications', 503))
    await expect(copyMyEpoToRecord({ reads: list.reads, mirror: memoryMirror().mirror, now: () => NOW })).rejects.toBeInstanceOf(MyEpoError)
    const wait = setup(down('/dueDates', 429))
    const waited = memoryMirror(all)
    await expect(copyMyEpoToRecord({ reads: wait.reads, mirror: waited.mirror, now: () => NOW })).rejects.toBeInstanceOf(MyEpoError)
    expect(waited.kept.details.size).toBe(0)
    const gone = setup(down('/dueDates', 503))
    const unreached = memoryMirror(all)
    await expect(copyMyEpoToRecord({ reads: gone.reads, mirror: unreached.mirror, now: () => NOW })).rejects.toBeInstanceOf(MyEpoError)
    expect(unreached.kept.details.size).toBe(0)
    const terms = setup(down('/terms', 400))
    const termless = memoryMirror(all)
    await expect(copyMyEpoToRecord({ reads: terms.reads, mirror: termless.mirror, now: () => NOW })).rejects.toBeInstanceOf(MyEpoError)
    expect(termless.kept.details.size).toBe(0)
  })

  it('stores no data for an application that the EPO rejects for its own cause, and fails on an error that is not of MyEPO', async () => {
    const one = (copy: MyEpoApplicationsCopy) => copy.applications.slice(0, 1).map(keyOf)
    const rejected = setup(url => url.pathname.endsWith('/fees') ? Response.json({ code: 'ERR_30', message: 'spec' }, { status: 400 }) : undefined)
    const kept = memoryMirror(one)
    const pass = await copyMyEpoToRecord({ reads: rejected.reads, mirror: kept.mirror, now: () => NOW })
    expect([pass.details, pass.noDetail.length, [...kept.kept.details.values()]]).toEqual([0, 1, [{ readAt: READ_AT, detail: null }]])
    const { reads } = setup()
    const broken = { ...reads, pendingFees: () => Promise.reject(new TypeError('not of MyEPO')) }
    await expect(copyMyEpoToRecord({ reads: broken, mirror: memoryMirror(one).mirror, now: () => NOW })).rejects.toBeInstanceOf(TypeError)
  })
})

describe('createMyEpoMirror', () => {
  it('sends each copy with PUT and the intake token, and returns the applications that the record names', async () => {
    const calls: { url: string; method: string | undefined; auth: string | null; body: unknown }[] = []
    const mirror = createMyEpoMirror({
      url: RECORD.slice(0, -1), token: 'intake-token-value',
      fetch: (input, init) => {
        const url = input instanceof Request ? input.url : input.toString()
        calls.push({ url, method: init?.method, auth: new Headers(init?.headers).get('authorization'), body: JSON.parse(typeof init?.body === 'string' ? init.body : '') })
        if (url.endsWith('/mailbox')) return Promise.resolve(Response.json({ letters: 0 }))
        if (url.endsWith('/applications')) return Promise.resolve(Response.json({ applications: 1, stale: [{ procedure: 'UPP', number: 'EP00000001' }] }))
        return Promise.resolve(Response.json({ stored: true }))
      },
    })
    const mailbox = { readAt: READ_AT, total: 0, folders: [], letters: [] }
    const applications = { readAt: READ_AT, total: 0, applications: [] }
    await mirror.mailbox(mailbox)
    expect(await mirror.applications(applications)).toEqual([{ procedure: 'UPP', number: 'EP00000001' }])
    await mirror.detail({ procedure: 'UPP', number: 'EP00000001' }, READ_AT, null)
    expect(calls).toEqual([
      { url: `${RECORD}intake/myepo-mirror/mailbox`, method: 'PUT', auth: 'Bearer intake-token-value', body: mailbox },
      { url: `${RECORD}intake/myepo-mirror/applications`, method: 'PUT', auth: 'Bearer intake-token-value', body: applications },
      { url: `${RECORD}intake/myepo-mirror/applications/UPP/EP00000001`, method: 'PUT', auth: 'Bearer intake-token-value', body: { readAt: READ_AT, detail: null } },
    ])
  })

  it('rejects with the refusal of the record, and with unavailable for an answer that it cannot read', async () => {
    const answer = (response: Response) => createMyEpoMirror({ url: RECORD, token: 't', fetch: () => Promise.resolve(response) })
    await expect(answer(Response.json({ error: 'not-in-the-list' }, { status: 404 })).detail({ procedure: 'EPC', number: 'EP00000001' }, READ_AT, null))
      .rejects.toEqual(expect.objectContaining({ kind: 'refused', status: 404, code: 'not-in-the-list' }))
    await expect(answer(Response.json({ stale: 'none' })).applications({ readAt: READ_AT, total: 0, applications: [] }))
      .rejects.toBeInstanceOf(MyEpoIntakeError)
  })
})
