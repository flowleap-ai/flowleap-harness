import { describe, expect, it, vi } from 'vitest'
import {
  commandRequest, createAct, createRecordsApi, ids, parsers, type Act, type Command, type DeadlineId, type DocumentId,
  type FileNumber, type OfficeEventId, type ProposalId, type TicketId,
} from '../src/client/api.ts'
import { atlasKey, shapeOf } from '../src/client/atlas.ts'
import { arrayOf, isoDate, isoTime, nullable, num, obj, oneOf, partialRecord, str, WireError } from '../src/client/wire.ts'
import { deadlineWire, FIXTURE_IDS, fixtures, intakeDocumentWire, intakeWaitingWire, matterWire, mattersWire, meWire, R71_DOCUMENT, ticketsWire, ticketWire } from './fixtures.client.ts'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/**
 * The error of a parser on a value.
 * @param run - runs the parser.
 * @returns the path of the WireError.
 */
function pathOf(run: () => unknown): string {
  try {
    run()
  } catch (error: unknown) {
    if (error instanceof WireError) return error.path
    throw error
  }
  throw new Error('the value parsed')
}

describe('wire parsers', () => {
  it('names the path of the first value that does not match', () => {
    expect(pathOf(() => str(1, 'a'))).toBe('a')
    expect(pathOf(() => num(Number.NaN, 'n'))).toBe('n')
    expect(pathOf(() => oneOf(['x'])('y', 's'))).toBe('s')
    expect(pathOf(() => arrayOf(str)('x', 'list'))).toBe('list')
    expect(pathOf(() => arrayOf(str)(['a', 2], 'list'))).toBe('list[1]')
    expect(pathOf(() => obj({ a: str })(null, 'o'))).toBe('o')
    expect(pathOf(() => obj({ a: str })([], 'o'))).toBe('o')
    expect(pathOf(() => obj({ a: obj({ b: num }) })({ a: { b: 'x' } }, 'o'))).toBe('o.a.b')
    expect(pathOf(() => partialRecord(['a'], num)({ a: 'x' }, 'p'))).toBe('p.a')
    expect(pathOf(() => ids.document('abc', 'd'))).toBe('d')
    expect(pathOf(() => parsers.me({ person: { id: 'p', name: 'A' }, admin: 'yes' }, 'body'))).toBe('body.admin')
  })

  it('keeps only the named fields and the present fields of a partial record', () => {
    expect(obj({ a: str })({ a: 'x', extra: 1 }, 'o')).toEqual({ a: 'x' })
    expect(partialRecord(['a', 'b'], num)({ a: 1, c: 3 }, 'p')).toEqual({ a: 1 })
    expect(nullable(str)(null, 'n')).toBeNull()
  })

  it('reads real ISO times and calendar dates only', () => {
    expect(isoTime('2026-11-04T14:16:00Z', 't')).toBe('2026-11-04T14:16:00Z')
    expect(pathOf(() => isoTime('2026-11-04', 't'))).toBe('t')
    expect(pathOf(() => isoTime('2026-13-45T99:00:00Z', 't'))).toBe('t')
    expect(isoDate('2027-02-28', 'd')).toBe('2027-02-28')
    expect(pathOf(() => isoDate('2027-02-30', 'd'))).toBe('d')
    expect(pathOf(() => isoDate('1.3.2027', 'd'))).toBe('d')
  })
})

describe('Records API answers', () => {
  it('parses every fixture answer of the contract', () => {
    expect(fixtures.me.person.name).toBe('Dr. Anna Becker')
    expect(fixtures.matters.rows).toHaveLength(9)
    expect(fixtures.matter.deadlines[0]!.state).toBe('deadline_proposed')
    expect(fixtures.deadline.readers.agree).toBe(true)
    expect(fixtures.intake.rows).toHaveLength(22)
    expect(fixtures.intake.rows[0]!.status).toEqual({ machine: 'intake', state: 'match_proposed' })
    expect(fixtures.intakeDocument.fields.reference?.span.quote).toBe('FL-2026-0001')
    expect(fixtures.deadline.readers.code?.fields.title?.span.quote).toBe('Communication under Rule 71(3) EPC')
    expect(fixtures.tickets.rows).toHaveLength(8)
    expect(fixtures.ticket.reports[0]!.statements[4]!.evidence[0]!.span).toBeNull()
  })

  it('reads a deadline row of the queue and a system or person actor', () => {
    const row = { ...intakeWaitingWire.rows[0], machine: 'deadline', state: 'code_proposed' }
    expect(parsers.intakeList({ ...intakeWaitingWire, rows: [row] }, 'body').rows[0]!.status).toEqual({ machine: 'deadline', state: 'code_proposed' })
    expect(pathOf(() => parsers.intakeList({ ...intakeWaitingWire, rows: [{ ...row, state: 'filed' }] }, 'body'))).toBe('body.rows[0].state')
    expect(pathOf(() => parsers.intakeList({ ...intakeWaitingWire, rows: [{ ...row, machine: 'ticket' }] }, 'body'))).toBe('body.rows[0].machine')
    expect(fixtures.matter.activity[0]!.actor).toEqual({ kind: 'person', person: { id: 'p-jonas', name: 'Jonas Weber' } })
    expect(pathOf(() => parsers.matterDetail({ ...matterWire, activity: [{ ...matterWire.activity[1], actor: { kind: 'system', name: 'router' } }] }, 'body'))).toBe('body.activity[0].actor.name')
  })

  it('reads a document of a matter that came from the firm\'s MyEPO Mailbox, and refuses an unknown source', () => {
    const fromMyEpo = { ...matterWire, documents: [{ ...matterWire.documents[0], source: 'myepo' }] }
    expect(parsers.matterDetail(fromMyEpo, 'body').documents[0]!.source).toBe('myepo')
    expect(pathOf(() => parsers.matterDetail({ ...matterWire, documents: [{ ...matterWire.documents[0], source: 'fax' }] }, 'body'))).toBe('body.documents[0].source')
  })

  it('reads who may decide and why not', () => {
    const refused = parsers.intakeDocument({ ...intakeDocumentWire, mayDecide: { allowed: false, reason: 'proposer', decider: { id: 'p-lena', name: 'Lena Hoffmann' } } }, 'body')
    expect(refused.mayDecide).toEqual({ allowed: false, reason: 'proposer', decider: { id: 'p-lena', name: 'Lena Hoffmann' } })
    expect(pathOf(() => parsers.intakeDocument({ ...intakeDocumentWire, mayDecide: { allowed: false, reason: 'busy', decider: null } }, 'body'))).toBe('body.mayDecide.reason')
  })

  it('reads why a person may decide a work item', () => {
    expect(fixtures.ticket.mayDecide).toEqual({ allowed: true, as: 'responsible' })
    const other = parsers.ticketDetail({ ...ticketWire, mayDecide: { allowed: false, reason: 'not-routed-person', decider: { id: 'p-anna', name: 'Dr. Anna Becker' } } }, 'body')
    expect(other.mayDecide).toEqual({ allowed: false, reason: 'not-routed-person', decider: { id: 'p-anna', name: 'Dr. Anna Becker' } })
    expect(pathOf(() => parsers.ticketDetail({ ...ticketWire, mayDecide: { allowed: false, reason: 'proposer', decider: null } }, 'body'))).toBe('body.mayDecide.reason')
    expect(pathOf(() => parsers.ticketDetail({ ...ticketWire, mayDecide: { allowed: true } }, 'body'))).toBe('body.mayDecide.as')
    expect(fixtures.ticket.run?.session).toBe('ses_r71work')
    expect(fixtures.deadline.deadline.ruleVersion).toBe(1)
  })
})

describe('people', () => {
  it('reads a team member with or without a display name, and anyone outside the team with neither id nor name', () => {
    const reply = parsers.ticketDetail({ ...ticketWire, reply: { state: 'sent', to: [{ id: 'p-lena', name: null }, { id: null, name: null }] } }, 'body')
    expect(reply.reply?.to).toEqual([{ id: 'p-lena', name: null }, { id: null, name: null }])
    expect(fixtures.ticket.reply?.to.at(-1)).toEqual({ id: null, name: null })
  })

  it('refuses a name for a person outside the team, and a team or a signed-in person with no id', () => {
    expect(pathOf(() => parsers.ticketDetail({ ...ticketWire, reply: { state: 'sent', to: [{ id: null, name: 'Markus Brandt' }] } }, 'body'))).toBe('body.reply.to[0].name')
    expect(pathOf(() => parsers.ticketDetail({ ...ticketWire, team: [{ id: null, name: null }] }, 'body'))).toBe('body.team[0].id')
    expect(pathOf(() => parsers.me({ person: { id: null, name: null }, admin: false }, 'body'))).toBe('body.person.id')
  })
})

describe('the atlas', () => {
  it('gives each state its shape and word key', () => {
    expect(shapeOf({ machine: 'intake', state: 'match_proposed' })).toBe('wait')
    expect(shapeOf({ machine: 'deadline', state: 'disputed' })).toBe('stale')
    expect(shapeOf({ machine: 'outbox', state: 'dead' })).toBe('bad')
    expect(atlasKey({ machine: 'ticket', state: 'proposals_ready' })).toBe('atlas.ticket.proposals_ready')
  })
})

describe('createRecordsApi', () => {
  it('reads each path under <recordsHref>api/ with the cookie and parses the answer', async () => {
    const answers: Record<string, unknown> = {
      'records/api/me': meWire,
      'records/api/matters': mattersWire,
      'records/api/matters/FL%2F1': matterWire,
      [`records/api/deadlines/${FIXTURE_IDS.deadline}`]: deadlineWire,
      'records/api/intake?view=filed-today': intakeWaitingWire,
      [`records/api/intake/documents/${R71_DOCUMENT}`]: intakeDocumentWire,
      'records/api/tickets': ticketsWire,
      [`records/api/tickets/${FIXTURE_IDS.ticket}`]: ticketWire,
    }
    const fetchImpl = vi.fn((url: string | URL | Request, _init?: RequestInit) => Promise.resolve(json(answers[typeof url === 'string' ? url : ''])))
    const api = createRecordsApi('records/', fetchImpl)
    const signal = new AbortController().signal
    const results = await Promise.all([
      api.me(signal), api.matters(signal), api.matter('FL/1' as FileNumber, signal), api.deadline(FIXTURE_IDS.deadline as DeadlineId, signal),
      api.intake('filed-today', signal), api.intakeDocument(R71_DOCUMENT as DocumentId, signal), api.tickets(signal),
      api.ticket(FIXTURE_IDS.ticket as TicketId, signal),
    ])
    expect(results.every(result => result.ok)).toBe(true)
    expect(fetchImpl.mock.calls[0]![1]).toMatchObject({ credentials: 'include', cache: 'no-store', signal })
    expect(api.contentHref(R71_DOCUMENT as DocumentId)).toBe(`records/api/documents/${R71_DOCUMENT}/content`)
  })

  it('tells a refusal, a service failure, a malformed answer, no answer and an abort apart', async () => {
    const signal = new AbortController().signal
    const answer = (response: Response) => createRecordsApi('records/', () => Promise.resolve(response)).me(signal)
    expect(await answer(json({ error: 'not-signed-in', detail: 'Sign in again.' }, 403))).toEqual({ ok: false, error: { kind: 'refused', status: 403, code: 'not-signed-in', detail: 'Sign in again.' } })
    expect(await answer(json({ error: 1 }, 409))).toEqual({ ok: false, error: { kind: 'refused', status: 409, code: null, detail: null } })
    expect(await answer(new Response('<html>', { status: 502 }))).toEqual({ ok: false, error: { kind: 'service', status: 502 } })
    expect(await answer(new Response('<html>', { status: 404 }))).toEqual({ ok: false, error: { kind: 'refused', status: 404, code: null, detail: null } })
    expect(await answer(new Response('not json', { status: 200 }))).toEqual({ ok: false, error: { kind: 'malformed', path: 'body' } })
    expect(await answer(json({ person: null, admin: true }))).toEqual({ ok: false, error: { kind: 'malformed', path: 'body.person' } })
    const offline = createRecordsApi('records/', () => Promise.reject(new TypeError('Failed to fetch')))
    expect(await offline.me(signal)).toEqual({ ok: false, error: { kind: 'network' } })
    const stop = new AbortController()
    stop.abort()
    expect(await offline.me(stop.signal)).toEqual({ ok: false, error: { kind: 'aborted' } })
    const broken = new Response('{"person":', { status: 200 })
    expect(await createRecordsApi('records/', () => Promise.resolve(broken)).me(stop.signal)).toEqual({ ok: false, error: { kind: 'aborted' } })
  })

  it('uses the global fetch by default', async () => {
    const stub = vi.fn(() => Promise.resolve(json(meWire)))
    vi.stubGlobal('fetch', stub)
    try {
      expect((await createRecordsApi('records/').me(new AbortController().signal)).ok).toBe(true)
      expect(stub).toHaveBeenCalledOnce()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('commands', () => {
  const document = R71_DOCUMENT as DocumentId
  const deadline = FIXTURE_IDS.deadline as DeadlineId

  it.each<[Command, string, unknown]>([
    [{ kind: 'intake.match', document, fileNumber: 'FL-2026-0001' as FileNumber }, `intake/documents/${R71_DOCUMENT}/match`, { fileNumber: 'FL-2026-0001' }],
    [{ kind: 'intake.notRelevant', document, reason: 'Spam' }, `intake/documents/${R71_DOCUMENT}/not-relevant`, { reason: 'Spam' }],
    [{ kind: 'officeEvent.decide', id: FIXTURE_IDS.officeEvent as OfficeEventId, code: 'EPO:R71(3)', documentDate: fixtures.deadline.deadline.due, applicationNumber: '24 123 456.7' }, `office-events/${FIXTURE_IDS.officeEvent}/decide`, { code: 'EPO:R71(3)', documentDate: '2027-03-01', applicationNumber: '24 123 456.7' }],
    [{ kind: 'deadline.confirm', id: deadline, seen: 141 }, `deadlines/${deadline}/confirm`, { seen: 141 }],
    [{ kind: 'deadline.reject', id: deadline, reason: 'Wrong date' }, `deadlines/${deadline}/reject`, { reason: 'Wrong date' }],
    [{ kind: 'ticket.decide', id: FIXTURE_IDS.ticket as TicketId, reports: [{ proposalId: 'proposal-1' as ProposalId, decision: 'approve' }], deadlineCheck: { id: deadline, state: 'active', seq: 142 } }, `tickets/${FIXTURE_IDS.ticket}/decide`, { reports: [{ proposalId: 'proposal-1', decision: 'approve' }], deadlineCheck: { id: deadline, state: 'active', seq: 142 } }],
  ])('sends %j to its path', (command, path, body) => {
    expect(commandRequest(command)).toEqual({ path, body })
  })

  it('gives each act a new key and sends the same key when the act is sent again', async () => {
    const first = createAct({ kind: 'deadline.confirm', id: deadline, seen: 141 })
    const second = createAct(first.command)
    expect(first.key).toMatch(/^ipms:[0-9a-f-]{36}$/)
    expect(second.key).not.toBe(first.key)
    const fetchImpl = vi.fn((_url: string | URL | Request, _init?: RequestInit) => Promise.resolve(json({ ok: true })))
    const api = createRecordsApi('records/', fetchImpl)
    expect(await api.perform(first)).toEqual({ ok: true, value: null })
    await api.perform(first, new AbortController().signal)
    const sent = fetchImpl.mock.calls.map(([url, init]) => ({ url, key: (init?.headers as Record<string, string>)['idempotency-key'], method: init?.method, body: init?.body }))
    expect(sent[0]).toEqual({ url: `records/api/deadlines/${deadline}/confirm`, key: first.key, method: 'POST', body: '{"seen":141}' })
    expect(sent[1]!.key).toBe(first.key)
  })

  it('reports a refused act with its code', async () => {
    const act: Act = createAct({ kind: 'deadline.confirm', id: deadline, seen: 1 })
    const api = createRecordsApi('records/', () => Promise.resolve(json({ error: 'seen-is-stale' }, 409)))
    expect(await api.perform(act)).toEqual({ ok: false, error: { kind: 'refused', status: 409, code: 'seen-is-stale', detail: null } })
  })
})
