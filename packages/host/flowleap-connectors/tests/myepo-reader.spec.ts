import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createMyEpoClient, createMyEpoLetterIntake, createRequestGate, MyEpoError, MyEpoIntakeError, readMyEpoLetters,
  type MyEpoCommunication, type MyEpoCommunicationId, type MyEpoDeliveryAnswer, type MyEpoDocument, type MyEpoFolderId,
  type MyEpoLetterDelivery, type MyEpoLetterIntake, type MyEpoReads,
} from '@deepseek-ai/dsh-flowleap-connectors'
import { createMyEpoDouble, type MyEpoDouble } from './myepo-double/double.ts'
import { DOUBLE_CLIENT, seedData } from './myepo-double/seed-data.ts'

const ENDPOINT = { baseUrl: 'https://double.test/latest', tokenUrl: 'https://double.test/token', requestsPerSecond: 1000, timeoutSeconds: 5 }
const NOW = Date.parse('2026-11-10T08:00:00Z')

function setup(secret = DOUBLE_CLIENT.clientSecret) {
  const double = createMyEpoDouble(seedData(ENDPOINT.baseUrl), ENDPOINT, DOUBLE_CLIENT)
  const reads = createMyEpoClient({
    endpoint: ENDPOINT, credentials: () => Promise.resolve({ clientId: DOUBLE_CLIENT.clientId, clientSecret: secret }),
    gate: createRequestGate(ENDPOINT.requestsPerSecond), fetch: double.fetch, now: () => NOW,
  })
  return { double, reads }
}

/** A Firm Record intake in memory: it keeps each delivered letter by its communication id. */
function memoryIntake(answer: (letter: MyEpoLetterDelivery) => MyEpoDeliveryAnswer = () => ({ state: 'filed', matter: 'SF-2023-0045', reason: null })) {
  const letters = new Map<MyEpoCommunicationId, MyEpoLetterDelivery>()
  const intake: MyEpoLetterIntake = {
    known: id => Promise.resolve(letters.has(id)),
    deliver: (letter) => {
      const result = answer(letter)
      letters.set(letter.communication.id, letter)
      return Promise.resolve(result)
    },
  }
  return { intake, letters }
}

const read = (double: MyEpoDouble) => double.state().letters.filter(letter => letter.read).map(letter => letter.id)

describe('readMyEpoLetters', () => {
  it('sends each unhandled letter once with its list data and PDF, and downloads a letter only when the Firm Record does not have it', async () => {
    const { double, reads } = setup()
    const { intake, letters } = memoryIntake()
    const unread = double.state().letters.filter(letter => !letter.handled).map(letter => letter.id)
    const first = await readMyEpoLetters({ reads, intake, mode: 'on-arrival', now: () => NOW, settled: new Set() })
    expect(first.listed).toBe(unread.length)
    expect(first.delivered.map(d => d.id).sort()).toEqual([...unread].sort())
    const readAfterFirst = read(double)

    const arrived = double.arrive()!
    const second = await readMyEpoLetters({ reads, intake, mode: 'on-arrival', now: () => NOW, settled: new Set() })
    expect([second.known, second.delivered.map(d => d.id)]).toEqual([unread.length, [arrived.id]])
    expect(new Set(read(double))).toEqual(new Set([...readAfterFirst, arrived.id]))

    const letter = letters.get(arrived.id as MyEpoCommunicationId)!
    expect(letter.communication).toEqual({
      id: arrived.id, applicationNumber: 'EP23771920.8', userReference: 'SF-2023-0045', documentCode: '2004C',
      title: arrived.title, dispatchDate: '2026-09-29', listedAt: '2026-11-10T08:00:00.000Z',
    })
    const document = letter.document!
    const pdf = Buffer.from(document.contentBase64, 'base64')
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    expect(document.sha256).toBe(createHash('sha256').update(pdf).digest('hex'))
    expect(letter.download).toEqual({ at: '2026-11-10T08:00:00.000Z', cause: 'on-arrival' })

    const third = await readMyEpoLetters({ reads, intake, mode: 'on-arrival', now: () => NOW, settled: new Set() })
    expect([third.known, third.delivered.length]).toEqual([unread.length + 1, 0])
  })

  it('sends the list data only when the record refuses the PDF, settles a letter that the record has from the mail, reports a list-data refusal, and stops when the record does not answer', async () => {
    const { double, reads } = setup()
    const [first, second, third] = double.state().letters.filter(letter => !letter.handled).map(letter => letter.id as MyEpoCommunicationId)
    const sent: MyEpoLetterDelivery[] = []
    const refusing: MyEpoLetterIntake = {
      known: () => Promise.resolve(false),
      deliver: (letter) => {
        sent.push(letter)
        const id = letter.communication.id
        if (id === first && letter.document !== null) return Promise.reject(new MyEpoIntakeError('refused', 413, 'document-too-large'))
        if (id === second) return Promise.reject(new MyEpoIntakeError('refused', 409, 'already-stored'))
        if (id === third) return Promise.reject(new MyEpoIntakeError('refused', 400, 'invalid-body'))
        return Promise.resolve({ state: 'unmatched', matter: null, reason: 'document-too-large' })
      },
    }
    const settled = new Set<MyEpoCommunicationId>()
    const pass = await readMyEpoLetters({ reads, intake: refusing, mode: 'on-arrival', now: () => NOW, settled })
    expect(pass.delivered).toEqual([{ id: first, answer: { state: 'unmatched', matter: null, reason: 'document-too-large' }, listOnly: true }])
    const firstSends = sent.filter(letter => letter.communication.id === first)
    expect(firstSends.map(letter => [letter.document === null, letter.download.refused])).toEqual([
      [false, undefined], [true, { status: 413, code: 'document-too-large' }],
    ])
    expect(pass.alreadyStored).toEqual([second])
    expect(pass.failed).toEqual([{ id: third, reason: 'the Firm Record refused the letter: 400 invalid-body' }])
    expect([...settled].sort()).toEqual([first, second].sort())

    const down: MyEpoLetterIntake = { known: () => Promise.reject(new MyEpoIntakeError('unavailable', 0, null)), deliver: () => Promise.reject(new Error('not called')) }
    await expect(readMyEpoLetters({ reads, intake: down, mode: 'on-arrival', now: () => NOW, settled: new Set() })).rejects.toThrow(MyEpoIntakeError)
  })

  it('asks the record about a settled letter only once while the caller keeps the settled ids', async () => {
    const { reads } = setup()
    const { intake } = memoryIntake()
    let asked = 0
    const counting: MyEpoLetterIntake = { known: (id) => { asked++; return intake.known(id) }, deliver: letter => intake.deliver(letter) }
    const settled = new Set<MyEpoCommunicationId>()
    const first = await readMyEpoLetters({ reads, intake: counting, mode: 'on-arrival', now: () => NOW, settled })
    const askedFirst = asked
    const second = await readMyEpoLetters({ reads, intake: counting, mode: 'on-arrival', now: () => NOW, settled })
    expect([askedFirst, asked, second.known, second.delivered.length]).toEqual([first.listed, first.listed, first.listed, 0])
  })

  it('stops at a refused client secret and downloads nothing', async () => {
    const { double, reads } = setup('wrong-secret')
    const { intake, letters } = memoryIntake()
    const before = read(double)
    const failure = await readMyEpoLetters({ reads, intake, mode: 'on-arrival', now: () => NOW, settled: new Set() }).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(MyEpoError)
    expect((failure as MyEpoError).failure.kind).toBe('refused')
    expect([read(double), letters.size]).toEqual([before, 0])
  })
})

const LETTER: MyEpoLetterDelivery = {
  communication: { id: 'EP23771920-18' as MyEpoCommunicationId, applicationNumber: null, userReference: null, documentCode: '2004C', title: 't', dispatchDate: '2026-09-29', listedAt: '2026-11-10T08:00:00Z' },
  document: { fileName: '18.pdf', mediaType: 'application/pdf', sha256: '0'.repeat(64), contentBase64: '' },
  download: { at: '2026-11-10T08:00:00Z', cause: 'on-arrival' },
}

describe('createMyEpoLetterIntake', () => {
  function intakeOf(answers: (() => Response | Promise<Response>)[]) {
    const seen: { url: string; init: RequestInit | undefined }[] = []
    const intake = createMyEpoLetterIntake({
      url: 'http://127.0.0.1:1/records/api', token: 'intake-token-value',
      fetch: ((url: URL, init?: RequestInit) => {
        seen.push({ url: String(url), init })
        return Promise.resolve(answers.shift()!())
      }) as typeof fetch,
    })
    return { intake, seen }
  }

  it('sends the intake token and reads whether a letter is known and the answer to a delivered letter', async () => {
    const { intake, seen } = intakeOf([
      () => Response.json({ communicationId: 'EP23771920-18', known: true }),
      () => Response.json({ document: 'a', state: 'filed', recordSeq: 9, matter: 'SF-2023-0045', reason: null, officeEvent: null }, { status: 201 }),
    ])
    expect(await intake.known(LETTER.communication.id)).toBe(true)
    expect(seen[0]!.url).toBe('http://127.0.0.1:1/records/api/intake/myepo-letters/EP23771920-18')
    expect((seen[0]!.init?.headers as Record<string, string>).authorization).toBe('Bearer intake-token-value')
    expect(await intake.deliver(LETTER)).toEqual({ state: 'filed', matter: 'SF-2023-0045', reason: null })
    expect((seen[1]!.init?.headers as Record<string, string>)['idempotency-key']).toBe(`myepo-letter:EP23771920-18:${Date.parse('2026-11-10T08:00:00Z')}`)
  })

  it('classifies a refusal, a wait, a server error page, an unreadable answer and no answer', async () => {
    const { intake } = intakeOf([
      () => Response.json({ error: 'invalid-body' }, { status: 400 }),
      () => Response.json({ error: 'busy' }, { status: 429 }),
      () => new Response('<html>Bad gateway</html>', { status: 502 }),
      () => Response.json({ state: 'filed' }, { status: 201 }),
      () => { throw new TypeError('fetch failed') },
    ])
    await expect(intake.deliver(LETTER)).rejects.toMatchObject({ kind: 'refused', status: 400, code: 'invalid-body' })
    await expect(intake.deliver(LETTER)).rejects.toMatchObject({ kind: 'unavailable', status: 429, code: 'busy' })
    await expect(intake.deliver(LETTER)).rejects.toMatchObject({ kind: 'unavailable', status: 502, code: null })
    await expect(intake.deliver(LETTER)).rejects.toMatchObject({ kind: 'unavailable', status: 201, code: 'invalid-answer' })
    await expect(intake.known(LETTER.communication.id)).rejects.toMatchObject({ kind: 'unavailable', status: 0, message: 'the Firm Record did not take the letter: 0' })
  })
})

describe('readMyEpoLetters over a hand-made Mailbox', () => {
  const communication = (id: string): MyEpoCommunication => ({
    id: id as MyEpoCommunicationId, documentCode: '0000', title: 'A change in the list of professional representatives', dispatchDate: '2026-11-02',
    read: false, handled: false, folderId: 'inbox' as MyEpoFolderId,
  })
  /** A Mailbox of `total` letters served one per page, whose downloads `download` answers. */
  function mailbox(total: number, download: (c: MyEpoCommunication) => Promise<MyEpoDocument>): Pick<MyEpoReads, 'unhandledCommunications' | 'downloadCommunication'> {
    return {
      unhandledCommunications: query => Promise.resolve({ items: query!.page! < total ? [communication(`letter-${query!.page}`)] : [], page: query!.page!, size: 1, total: total + 1 }),
      downloadCommunication: download,
    }
  }
  const pdf = (c: MyEpoCommunication): Promise<MyEpoDocument> => Promise.resolve({ communication: c, filename: `folder/${c.id}.pdf`, pdf: new TextEncoder().encode('%PDF-1.4') })

  it('reads every page, and sends a letter with no application number or reference with null fields and the file name of the ZIP entry', async () => {
    const { intake, letters } = memoryIntake()
    const pass = await readMyEpoLetters({ reads: mailbox(2, pdf), intake, mode: 'on-arrival', now: () => NOW, settled: new Set() })
    expect(pass.listed).toBe(2)
    const letter = letters.get('letter-0' as MyEpoCommunicationId)!
    expect([letter.communication.applicationNumber, letter.communication.userReference, letter.document?.fileName]).toEqual([null, null, 'letter-0.pdf'])
  })

  it('reports a letter that MyEPO cannot give and goes on; stops at a refused or missing link and at any other error', async () => {
    const unreachable = mailbox(2, c => (c.id === 'letter-0' ? Promise.reject(new MyEpoError({ kind: 'unreachable', status: 503 })) : pdf(c)))
    const pass = await readMyEpoLetters({ reads: unreachable, intake: memoryIntake().intake, mode: 'on-arrival', now: () => NOW, settled: new Set() })
    expect([pass.failed, pass.delivered.map(d => d.id)]).toEqual([[{ id: 'letter-0', reason: 'the EPO did not answer (503)' }], ['letter-1']])
    const unreadable = mailbox(1, () => Promise.reject(new MyEpoError({ kind: 'invalid-response', message: 'download holds 2 PDF files' })))
    const { intake, letters } = memoryIntake()
    const listed = await readMyEpoLetters({ reads: unreadable, intake, mode: 'on-arrival', now: () => NOW, settled: new Set() })
    expect([listed.delivered[0]?.listOnly, letters.get('letter-0' as MyEpoCommunicationId)?.download.refused]).toEqual([true, { status: 0, code: 'download-not-readable' }])
    for (const error of [new MyEpoError({ kind: 'not-linked' }), new MyEpoError({ kind: 'refused' }), new TypeError('broken')]) {
      await expect(readMyEpoLetters({ reads: mailbox(1, () => Promise.reject(error)), intake: memoryIntake().intake, mode: 'on-arrival', now: () => NOW, settled: new Set() })).rejects.toBe(error)
    }
    const failing: MyEpoLetterIntake = { known: () => Promise.resolve(false), deliver: () => Promise.reject(new TypeError('broken intake')) }
    await expect(readMyEpoLetters({ reads: mailbox(1, pdf), intake: failing, mode: 'on-arrival', now: () => NOW, settled: new Set() })).rejects.toThrow('broken intake')
  })
})
