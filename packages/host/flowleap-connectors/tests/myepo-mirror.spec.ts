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
function memoryMirror(
  stale: (copy: MyEpoApplicationsCopy) => readonly MyEpoApplicationKey[] = () => [],
  missing: (copy: MyEpoMailboxCopy) => readonly string[] = () => [],
  takePdf: (id: string) => Promise<void> = () => Promise.resolve(),
) {
  const pdfs = new Map<string, { fileName: string; pdf: Uint8Array } | null>()
  const details = new Map<string, { readAt: string; detail: unknown }>()
  const kept: { mailbox?: MyEpoMailboxCopy; applications?: MyEpoApplicationsCopy; details: typeof details } = { details }
  const mirror: MyEpoMirror = {
    mailbox: (copy) => {
      kept.mailbox = copy
      return Promise.resolve(missing(copy))
    },
    letterPdf: async (id, document) => {
      if (document !== null) await takePdf(id)
      pdfs.set(id, document)
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
  return { mirror, kept, pdfs }
}

const keyOf = ({ procedure, number }: MyEpoApplicationKey): MyEpoApplicationKey => ({ procedure, number })

describe('copyMyEpoToRecord', () => {
  it('sends the Mailbox with each letter of the list and the folders, and the applications, and downloads no letter', async () => {
    const { double, reads, paths } = setup()
    const { mirror, kept } = memoryMirror()
    const before = double.state().letters.filter(letter => letter.read).length
    const pass = await copyMyEpoToRecord({ reads, mirror, now: () => NOW })
    const letters = double.state().letters
    expect(pass).toEqual({
      letters: letters.length, pdfs: 0, noPdf: [], applications: kept.applications!.applications.length, details: 0, noDetail: [],
    })
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

describe('copyMyEpoToRecord, the PDFs of read letters', () => {
  const readIds = (copy: MyEpoMailboxCopy) => copy.letters.filter(letter => letter.read).map(letter => letter.id)

  it('downloads the PDF of each read letter that the record names, and never one of an unread or unknown letter', async () => {
    const { double, reads, paths } = setup()
    const unread = double.state().letters.filter(letter => !letter.read).map(letter => letter.id)
    const { mirror, pdfs } = memoryMirror(undefined, copy => [...readIds(copy).slice(0, 2), unread[0]!, 'not-in-the-mailbox'])
    const pass = await copyMyEpoToRecord({ reads, mirror, now: () => NOW })
    expect([pass.pdfs, pass.noPdf]).toEqual([2, []])
    expect(pdfs.size).toBe(2)
    for (const document of pdfs.values()) {
      expect(Buffer.from(document!.pdf).subarray(0, 5).toString('latin1')).toBe('%PDF-')
      expect(document!.fileName).toMatch(/^[^/\\]+\.pdf$/u)
    }
    expect(paths.filter(path => path.includes('/download/')).length).toBe(2)
    expect(double.state().letters.filter(letter => !letter.read).map(letter => letter.id)).toEqual(unread)
  })

  it('stores no PDF for a letter that MyEPO gives none for, or whose PDF the record refuses, and goes on', async () => {
    const epo = setup(url => url.pathname.includes('/download/') ? Response.json({ code: 'ERR_30', message: 'spec' }, { status: 400 }) : undefined)
    const none = memoryMirror(undefined, copy => readIds(copy).slice(0, 1))
    const first = await copyMyEpoToRecord({ reads: epo.reads, mirror: none.mirror, now: () => NOW })
    expect([first.pdfs, first.noPdf.length, [...none.pdfs.values()]]).toEqual([0, 1, [null]])

    const refused = memoryMirror(undefined, copy => readIds(copy).slice(0, 2), id => id === refusedId ? Promise.reject(new MyEpoIntakeError('refused', 413, 'document-too-large')) : Promise.resolve())
    const { double, reads } = setup()
    const refusedId = double.state().letters.find(letter => letter.read)!.id
    const second = await copyMyEpoToRecord({ reads, mirror: refused.mirror, now: () => NOW })
    expect([second.pdfs, second.noPdf.map(entry => entry.id), refused.pdfs.get(refusedId)]).toEqual([1, [refusedId], null])
  })

  it('stops the pass when MyEPO does not answer a download, or the record does not answer', async () => {
    const epo = setup(url => url.pathname.includes('/download/') ? new Response(null, { status: 503 }) : undefined)
    const named = memoryMirror(undefined, copy => readIds(copy).slice(0, 1))
    await expect(copyMyEpoToRecord({ reads: epo.reads, mirror: named.mirror, now: () => NOW })).rejects.toBeInstanceOf(MyEpoError)
    expect(named.pdfs.size).toBe(0)
    const away = memoryMirror(undefined, copy => readIds(copy).slice(0, 1), () => Promise.reject(new MyEpoIntakeError('unavailable', 0, null)))
    await expect(copyMyEpoToRecord({ reads: setup().reads, mirror: away.mirror, now: () => NOW })).rejects.toBeInstanceOf(MyEpoIntakeError)
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
        if (url.endsWith('/mailbox')) return Promise.resolve(Response.json({ letters: 0, missingPdf: ['a/b'] }))
        if (url.endsWith('/applications')) return Promise.resolve(Response.json({ applications: 1, stale: [{ procedure: 'UPP', number: 'EP00000001' }] }))
        return Promise.resolve(Response.json({ stored: true }))
      },
    })
    const mailbox = { readAt: READ_AT, total: 0, folders: [], letters: [] }
    const applications = { readAt: READ_AT, total: 0, applications: [] }
    expect(await mirror.mailbox(mailbox)).toEqual(['a/b'])
    expect(await mirror.applications(applications)).toEqual([{ procedure: 'UPP', number: 'EP00000001' }])
    await mirror.detail({ procedure: 'UPP', number: 'EP00000001' }, READ_AT, null)
    await mirror.letterPdf('a/b', { fileName: 'letter.pdf', pdf: new TextEncoder().encode('%PDF-1.4') })
    await mirror.letterPdf('a/b', null)
    expect(calls.slice(3)).toEqual([
      {
        url: `${RECORD}intake/myepo-mirror/letters/a%2Fb/content`, method: 'PUT', auth: 'Bearer intake-token-value',
        body: { document: { fileName: 'letter.pdf', sha256: 'e16fa5d9b51928755db85b917f0297babaf22c7a47e97d9212adab56e61ba04e', contentBase64: 'JVBERi0xLjQ=' } },
      },
      { url: `${RECORD}intake/myepo-mirror/letters/a%2Fb/content`, method: 'PUT', auth: 'Bearer intake-token-value', body: { document: null } },
    ])
    expect(calls.slice(0, 3)).toEqual([
      { url: `${RECORD}intake/myepo-mirror/mailbox`, method: 'PUT', auth: 'Bearer intake-token-value', body: mailbox },
      { url: `${RECORD}intake/myepo-mirror/applications`, method: 'PUT', auth: 'Bearer intake-token-value', body: applications },
      { url: `${RECORD}intake/myepo-mirror/applications/UPP/EP00000001`, method: 'PUT', auth: 'Bearer intake-token-value', body: { readAt: READ_AT, detail: null } },
    ])
  })

  it('reads no missing PDF from the answer of a record of an earlier version', async () => {
    const old = createMyEpoMirror({ url: 'http://old.test/records/api/', token: 't', fetch: () => Promise.resolve(Response.json({ letters: 0 })) })
    expect(await old.mailbox({ readAt: READ_AT, total: 0, folders: [], letters: [] })).toEqual([])
  })

  it('rejects with the refusal of the record, and with unavailable for an answer that it cannot read', async () => {
    const answer = (response: Response) => createMyEpoMirror({ url: RECORD, token: 't', fetch: () => Promise.resolve(response) })
    await expect(answer(Response.json({ error: 'not-in-the-list' }, { status: 404 })).detail({ procedure: 'EPC', number: 'EP00000001' }, READ_AT, null))
      .rejects.toEqual(expect.objectContaining({ kind: 'refused', status: 404, code: 'not-in-the-list' }))
    await expect(answer(Response.json({ stale: 'none' })).applications({ readAt: READ_AT, total: 0, applications: [] }))
      .rejects.toBeInstanceOf(MyEpoIntakeError)
  })
})
