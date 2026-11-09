import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FindAnswer } from '../src/add-client/wire.ts'
import type { HostResult } from '../src/client/add-client/api.ts'
import {
  AddClientModel, FIND_WAIT_MS, SKELETON_AFTER_MS, SKELETON_MIN_MS,
  applicationsOf, blockerOf, clientIdOf, clientOfFolder, decisionOf, hitsOf, recordStatus,
  type AddClientView, type FindView, type RecordView, type ReviewView,
} from '../src/client/add-client/model.ts'
import { hitsHash, type ClientDetail, type PartyId } from '../src/client/add-client/records.ts'
import {
  SCHUBERT_ID, SYNTEGON_ID, fakeHost, fakeRecord, firmClient, found, matter, okHost, reference, registerHit, reviewed,
} from './add-client-fakes.client.ts'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

/** Syntegon, a client of your firm, with one recorded application. */
const SYNTEGON: ClientDetail = {
  client: firmClient(SYNTEGON_ID, 'Syntegon', 'client', ['SYNTEGON TECHNOLOGY']),
  names: [{ name: 'SYNTEGON TECHNOLOGY', source: 'patstat', edition: '2026 Spring', applications: 600 }],
  applications: [{ applicationNumber: 'EP23171862', roles: [{ partyId: 'party-9' as PartyId, party: 'Syntegon Technology GmbH', role: 'applicant' }] }],
  conflictChecks: ['none'],
}

function setup(start: Parameters<typeof fakeRecord>[0] = { details: [SYNTEGON] }) {
  const host = fakeHost()
  const firm = fakeRecord(start)
  const opened: string[] = []
  const model = new AddClientModel({ api: host, record: firm.record, open: (id) => { opened.push(id) } })
  const view = (): AddClientView | null => model.state.view
  const find = () => view() as FindView
  const review = () => view() as ReviewView
  const record = () => view() as RecordView
  return { model, host, firm, opened, view, find, review, record }
}

const settle = () => vi.advanceTimersByTimeAsync(0)

/** A Host answer that comes after `ms`. */
const later = <T>(ms: number, value: HostResult<T>) => new Promise<HostResult<T>>((resolve) => { setTimeout(() => { resolve(value) }, ms) })

/** Find a company, then continue to its review. */
async function toReview(s: ReturnType<typeof setup>, name: string, names: FindAnswer = found([[name.toUpperCase(), 57]])) {
  s.host.find.mockResolvedValueOnce(okHost(names))
  s.model.start()
  s.model.type(name)
  await vi.advanceTimersByTimeAsync(FIND_WAIT_MS)
  await s.model.continue()
  await settle()
}

describe('finding the company', () => {
  it('searches when typing pauses, shows the skeleton after 150 ms for at least 300 ms, and proposes the group', async () => {
    const s = setup()
    s.host.find.mockImplementationOnce(() => later(200, okHost(found([['SYNTEGON TECHNOLOGY', 600], ['SYNTEGON POUCH SYSTEMS', 12]]))))
    s.model.start()
    s.model.type('Syntegon')
    await vi.advanceTimersByTimeAsync(FIND_WAIT_MS - 1)
    expect(s.host.find).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(s.host.find).toHaveBeenCalledWith('Syntegon', expect.any(AbortSignal))
    expect(s.find().find).toEqual({ status: 'loading', skeleton: false })
    await vi.advanceTimersByTimeAsync(SKELETON_AFTER_MS)
    expect(s.find().find).toEqual({ status: 'loading', skeleton: true })
    await vi.advanceTimersByTimeAsync(SKELETON_MIN_MS - 1)
    expect(s.find().find.status).toBe('loading')
    await vi.advanceTimersByTimeAsync(1)
    expect(s.find()).toMatchObject({
      find: { status: 'group', source: 'patstat', edition: '2026 Spring', names: [{ name: 'SYNTEGON TECHNOLOGY', applications: 600, ticked: true }, { name: 'SYNTEGON POUCH SYSTEMS', applications: 12, ticked: true }] },
      existing: { clientId: SYNTEGON_ID },
    })
  })

  it('shows a quick answer with no skeleton, drops the answer of an emptied field, and searches at once on Enter', async () => {
    const s = setup()
    const seen: string[] = []
    s.model.store.subscribe(() => { const view = s.model.state.view; if (view?.page === 'find') seen.push(view.find.status + (view.find.status === 'loading' && view.find.skeleton ? '+' : '')) })
    s.model.start()
    await s.model.search()
    s.host.find.mockImplementationOnce(() => later(50, okHost(found([['SYNTEGON TECHNOLOGY', 600]]))))
    s.model.type('Syntegon')
    void s.model.search()
    await vi.advanceTimersByTimeAsync(50)
    expect(seen).not.toContain('loading+')
    expect(s.find().find.status).toBe('group')
    s.host.find.mockImplementationOnce(() => later(50, okHost(found([['OTHER', 1]]))))
    void s.model.search()
    s.model.type('  ')
    await vi.advanceTimersByTimeAsync(100)
    expect(s.find()).toMatchObject({ query: '  ', find: { status: 'empty' }, existing: null })
    s.model.close()
    s.model.type('x')
    expect(s.view()).toBeNull()
  })

  it('says why no names came: no EPO key, no data plugin, or a failure that Try again searches again', async () => {
    const s = setup({ clients: [] })
    s.model.start()
    s.model.type('Gerhard Schubert')
    s.host.find.mockResolvedValueOnce({ ok: false, error: 'no-key' })
    await s.model.search()
    expect(s.find().find).toEqual({ status: 'no-key' })
    s.host.find.mockResolvedValueOnce(okHost({ status: 'no-plugin' }))
    await s.model.search()
    expect(s.find().find).toEqual({ status: 'no-plugin' })
    s.host.find.mockResolvedValueOnce({ ok: false, error: 'unreachable' })
    await s.model.search()
    expect(s.find().find).toEqual({ status: 'error', error: 'unreachable' })
    s.host.find.mockResolvedValueOnce(okHost(found([['GERHARD SCHUBERT', 57]], { source: 'ep-register', edition: undefined })))
    await s.model.retry()
    expect(s.find().find).toMatchObject({ status: 'group', source: 'ep-register' })
    expect('edition' in s.find().find).toBe(false)
  })

  it('takes the ticked names on to the review, and waits while none is ticked', async () => {
    const s = setup({ clients: [] })
    s.model.start()
    await s.model.continue()
    s.model.type('Syntegon')
    await s.model.continue()
    s.host.find.mockResolvedValueOnce(okHost(found([['SYNTEGON TECHNOLOGY', 600], ['SYNTEGON POUCH SYSTEMS', 12]])))
    await s.model.search()
    s.model.tick('SYNTEGON POUCH SYSTEMS', false)
    s.model.tick('SYNTEGON TECHNOLOGY', false)
    await s.model.continue()
    expect(s.view()?.page).toBe('find')
    s.model.tick('SYNTEGON TECHNOLOGY', true)
    await s.model.continue()
    await settle()
    expect(s.review().subject).toEqual({ name: 'Syntegon', names: [{ name: 'SYNTEGON TECHNOLOGY', source: 'patstat', applications: 600, edition: '2026 Spring' }], existing: null })
    expect(s.host.review).toHaveBeenCalledWith({ names: ['SYNTEGON TECHNOLOGY'], clients: [] })
    s.model.tick('SYNTEGON TECHNOLOGY', false)
    expect(s.review().subject.names).toHaveLength(1)
  })
})

describe('reviewing and deciding', () => {
  it('blocks Add client until the person checks the conflict and writes why, then records the client and makes its folder', async () => {
    const s = setup()
    s.host.review.mockResolvedValueOnce(okHost(reviewed({ total: 57, conflicts: [registerHit(SYNTEGON_ID)] })))
    await toReview(s, 'Gerhard Schubert')
    expect(s.host.review).toHaveBeenCalledWith({ names: ['GERHARD SCHUBERT'], clients: [{ clientId: SYNTEGON_ID, names: ['Syntegon', 'SYNTEGON TECHNOLOGY'] }] })
    expect(hitsOf(s.review())).toHaveLength(1)
    expect(blockerOf(s.review())).toBe('conflict')
    s.model.setConflict(true, '  ')
    expect(blockerOf(s.review())).toBe('conflict')
    s.model.setConflict(true, ' The opposition is closed. ')
    expect(blockerOf(s.review())).toBeNull()
    const id = clientIdOf(s.review())
    s.host.clientFolder.mockResolvedValueOnce(okHost({ workspace: 'ws-schubert', folder: 'Gerhard Schubert', made: true }))
    await s.model.record()
    expect(s.firm.sent.map(command => command.kind)).toEqual(['conflict-check', 'client', 'name'])
    expect(s.firm.sent[0]).toMatchObject({ reason: 'The opposition is closed.', hits: [{ otherParty: 'Gerhard Schubert GmbH' }] })
    expect(s.host.clientFolder).toHaveBeenCalledWith({ clientId: id, name: 'Gerhard Schubert', names: ['GERHARD SCHUBERT'] })
    expect(s.record()).toMatchObject({ page: 'record', clientId: id, names: ['GERHARD SCHUBERT'], hits: 1, applications: [], batches: [], folder: { state: 'made', workspace: 'ws-schubert' }, error: null })
    expect(recordStatus(s.record())).toBe('done')
    expect(await s.model.openClientPage()).toBe(true)
    expect(s.view()).toBeNull()
    expect(s.opened).toEqual(['ws-schubert'])
    expect(s.host.clientFolder).toHaveBeenCalledTimes(1)
  })

  it('records the matters at your firm and those claimed with This is ours, each with its applicants', async () => {
    const s = setup({ clients: [] })
    s.host.review.mockResolvedValueOnce(okHost(reviewed({
      atFirm: [matter('EP23171862'), matter('EP25712875', { publicationNumber: undefined, title: undefined, representativeSince: undefined })],
      atOtherFirms: [reference('EP23165015', { publicationNumber: 'EP4250000A1' }), reference('EP23183720', { title: undefined }), reference('EP23200762', { title: undefined })],
    })))
    await toReview(s, 'Syntegon')
    s.model.claim('EP23165015', true)
    s.model.claim('EP23183720', true)
    s.model.claim('EP23183720', false)
    s.model.claim('EP23200762', true)
    expect(applicationsOf(s.review().review).map(item => item.fact)).toEqual([
      { applicationNumber: 'EP23171862', basis: 'register', publicationNumber: 'EP4292805A1', title: 'Method and apparatus for producing a packaging element', representativeSince: '2024-07-24' },
      { applicationNumber: 'EP25712875', basis: 'register' },
      { applicationNumber: 'EP23165015', basis: 'claimed', publicationNumber: 'EP4250000A1', title: 'Isolator system' },
      { applicationNumber: 'EP23200762', basis: 'claimed' },
    ])
    await s.model.record()
    expect(s.firm.sent.map(command => command.kind)).toEqual(['conflict-check', 'client', 'name', 'party', 'applications'])
    const batch = s.firm.sent.at(-1)
    expect(batch?.kind === 'applications' && batch.applications.map(item => [item.application.applicationNumber, item.roles.map(role => role.partyId)])).toEqual([
      ['EP23171862', ['party-1']], ['EP25712875', ['party-1']], ['EP23165015', ['party-1']], ['EP23200762', ['party-1']],
    ])
    expect(s.record().batches).toEqual([{ applications: s.record().applications, state: 'recorded' }])
    expect(recordStatus(s.record())).toBe('done')
  })

  it('keeps the keys of a failed recording, and Try again sends only what is missing', async () => {
    const s = setup({ clients: [] })
    s.host.review.mockResolvedValueOnce(okHost(reviewed({ atFirm: [matter('EP23171862')] })))
    await toReview(s, 'Syntegon')
    s.firm.state.failNext.set('name', { kind: 'network' })
    await s.model.record()
    expect(s.review().recording).toEqual({ status: 'failed', error: { kind: 'network' } })
    const first = s.firm.sent.length
    s.model.setRole('client')
    expect(s.review().recording).toEqual({ status: 'idle' })
    s.firm.state.failNext.set('name', { kind: 'network' })
    await s.model.record()
    await s.model.retry()
    // The conflict check and the client are in the Firm Record; Try again sends only the name, then the applications.
    expect(s.firm.sent.slice(first).map(command => command.kind)).toEqual(['name', 'name', 'party', 'applications'])
    expect(s.view()?.page).toBe('record')
  })

  it('stops when the client cannot be read before the records, and runs again for a client of the same name and role', async () => {
    const s = setup({ clients: [] })
    await toReview(s, 'Syntegon')
    const id = clientIdOf(s.review())
    s.firm.state.detailErrors.set(id, { kind: 'service', status: 503 })
    await s.model.record()
    expect(s.review().recording).toEqual({ status: 'failed', error: { kind: 'service', status: 503 } })
    s.firm.state.detailErrors.clear()
    // The Firm Record has Syntegon under another id, which the find step did not see.
    s.firm.details.set(SYNTEGON_ID, { client: SYNTEGON.client, names: [], applications: [], conflictChecks: [] })
    s.firm.state.failNext.set('client', { kind: 'refused', status: 409, code: 'client-exists', clientId: SYNTEGON_ID })
    await s.model.record()
    expect(s.firm.sent.filter(command => command.kind === 'client').map(command => command.clientId)).toEqual([id])
    expect(s.firm.sent.at(-1)).toMatchObject({ kind: 'name', clientId: SYNTEGON_ID })
    expect(s.record().clientId).toBe(SYNTEGON_ID)
  })

  it('shows a refusal of a client that exists under an id it cannot read', async () => {
    const s = setup({ clients: [] })
    await toReview(s, 'Syntegon')
    s.firm.state.detailErrors.set(SCHUBERT_ID, { kind: 'network' })
    s.firm.state.failNext.set('client', { kind: 'refused', status: 409, code: 'client-exists', clientId: SCHUBERT_ID })
    await s.model.record()
    expect(s.review().recording).toMatchObject({ status: 'failed', error: { code: 'client-exists' } })
  })

  it('adds a company to Watch with its names and no conflict check or folder', async () => {
    const s = setup()
    s.firm.state.clientsError = { kind: 'network' }
    await toReview(s, 'Gerhard Schubert')
    expect(s.review().firm).toEqual({ status: 'error', error: { kind: 'network' } })
    expect(blockerOf(s.review())).toBe('firm')
    s.model.setRole('watch')
    expect(blockerOf(s.review())).toBeNull()
    s.firm.state.clientsError = null
    await s.model.record()
    await settle()
    expect(s.firm.sent.map(command => command.kind)).toEqual(['client', 'name'])
    expect(s.firm.sent[0]).toMatchObject({ role: 'watch' })
    expect(s.model.state).toMatchObject({ view: null, toast: { kind: 'watch', name: 'Gerhard Schubert' } })
    expect(s.model.state.clients.filter(client => client.role === 'watch')).toMatchObject([{ name: 'Gerhard Schubert' }])
    expect(s.host.clientFolder).not.toHaveBeenCalled()
  })

  it('links another party to a chosen matter of your firm with its role', async () => {
    const s = setup()
    await toReview(s, 'Gerhard Schubert')
    s.model.setRole('other-party')
    expect(blockerOf(s.review())).toBe('matter')
    s.model.setOther('EP23171862', 'licensee')
    await s.model.record()
    expect(s.firm.sent.map(command => command.kind)).toEqual(['client', 'name', 'party', 'role'])
    expect(s.firm.sent.at(-1)).toMatchObject({ applicationNumber: 'EP23171862', role: 'licensee' })
    expect(s.model.state.toast).toEqual({ kind: 'party', name: 'Gerhard Schubert', applicationNumber: 'EP23171862' })
  })

  it('adds a client by name only without a data plugin, and after a failed or keyless review', async () => {
    const s = setup({ clients: [] })
    s.host.find.mockResolvedValueOnce(okHost({ status: 'no-plugin' }))
    s.model.start()
    s.model.type('Neue GmbH')
    await s.model.search()
    await s.model.continue()
    await settle()
    expect(s.review().review).toEqual({ status: 'by-name' })
    expect(s.host.review).not.toHaveBeenCalled()
    // FlowLeap read no EP opposition: the person checks conflicts and writes how.
    expect(blockerOf(s.review())).toBe('self-check')
    s.model.setConflict(true, ' ')
    expect(blockerOf(s.review())).toBe('self-check')
    s.model.setConflict(true, 'Asked the partners. ')
    expect(blockerOf(s.review())).toBeNull()
    expect(decisionOf(s.review())).toMatchObject({ role: 'client', names: [], hits: [], applications: [], reason: 'Asked the partners.' })
    // No folder can have the name: nothing is recorded before the person picks another form of it.
    expect(blockerOf({ ...s.review(), subject: { ...s.review().subject, name: 'CON' } })).toBe('name')
    expect(blockerOf({ ...s.review(), subject: { ...s.review().subject, name: 'Novo Nordisk A/S' } })).toBeNull()
    s.host.review.mockResolvedValueOnce({ ok: false, error: 'unreachable' })
    await toReview(s, 'Syntegon')
    expect(s.review().review).toEqual({ status: 'error', error: 'unreachable' })
    expect(blockerOf(s.review())).toBe('review')
    s.host.review.mockResolvedValueOnce({ ok: false, error: 'no-key' })
    await s.model.retry()
    expect(s.review().review).toEqual({ status: 'no-key' })
    s.model.byName()
    expect(blockerOf(s.review())).toBe('self-check')
    s.host.review.mockResolvedValueOnce(okHost({ status: 'no-plugin' }))
    await toReview(s, 'Syntegon')
    expect(s.review().review).toEqual({ status: 'by-name' })
  })

  it('reads the Firm Record again on Try again after it failed, and keeps the decision so far', async () => {
    const s = setup()
    s.firm.state.detailErrors.set(SYNTEGON_ID, { kind: 'network' })
    await toReview(s, 'Gerhard Schubert')
    expect(s.review().firm).toEqual({ status: 'error', error: { kind: 'network' } })
    s.model.setOther('EP1', 'other')
    s.firm.state.detailErrors.clear()
    await s.model.retry()
    expect(s.review()).toMatchObject({ firm: { status: 'ready' }, other: { applicationNumber: 'EP1', role: 'other' } })
    s.model.claim('EP1', true)
    await s.model.retry()
    expect(s.review().firm.status).toBe('ready')
  })

  it('does nothing while the recording runs, and drops what a closed review answers', async () => {
    const s = setup({ clients: [] })
    await toReview(s, 'Syntegon')
    s.firm.mock.send.mockImplementation(() => new Promise(() => {}))
    void s.model.record()
    await settle()
    expect(blockerOf(s.review())).toBe('busy')
    expect(s.review().recording).toEqual({ status: 'running', done: 0, total: 3 })
    await s.model.record()
    s.model.setConflict(true, 'x')
    expect(s.review().recording.status).toBe('running')
    s.model.close()
    expect(s.view()).toBeNull()
    s.model.setRole('watch')
    s.model.byName()
  })
})

/** Review Syntegon with `count` matters at your firm, the batch size `size`, and the client recorded. */
async function toRecord(s: ReturnType<typeof setup>, count: number, size: number) {
  s.host.settings.mockResolvedValue(okHost({ recordBatchSize: size }))
  s.host.review.mockResolvedValueOnce(okHost(reviewed({ atFirm: Array.from({ length: count }, (_, index) => matter(`EP23${String(index + 1).padStart(6, '0')}`)) })))
  await toReview(s, 'Syntegon')
}

/** The application numbers of the batches that the Firm Record got. */
const sentBatches = (s: ReturnType<typeof setup>) => s.firm.sent.flatMap(command => command.kind === 'applications' ? [command.applications.map(item => item.application.applicationNumber)] : [])

describe('the Record page', () => {
  it('records the applications in batches of the size that the Host names, then makes the client folder', async () => {
    const s = setup({ clients: [] })
    await toRecord(s, 5, 2)
    const steps: string[] = []
    const unsubscribe = s.model.store.subscribe(() => {
      const view = s.model.state.view
      if (view?.page === 'record') steps.push(`${(view.batches ?? []).map(batch => batch.state).join(',')}|${view.folder.state}`)
    })
    await s.model.record()
    unsubscribe()
    expect(sentBatches(s)).toEqual([['EP23000001', 'EP23000002'], ['EP23000003', 'EP23000004'], ['EP23000005']])
    expect(steps).toContain('recorded,recording,waiting|waiting')
    expect(steps).toContain('recorded,recorded,recorded|making')
    expect(recordStatus(s.record())).toBe('done')
  })

  it('stops at a failed batch, and Try again records only the missing batches and then the folder', async () => {
    const s = setup({ clients: [] })
    await toRecord(s, 3, 1)
    let batches = 0
    const send = s.firm.mock.send.getMockImplementation()!
    s.firm.mock.send.mockImplementation(async command => command.kind === 'applications' && (batches += 1) === 2 ? { ok: false, error: { kind: 'service', status: 503 } } : send(command))
    s.firm.mock.send.mockClear()
    await s.model.record()
    expect(recordStatus(s.record())).toBe('failed')
    expect(s.record().error).toEqual({ kind: 'service', status: 503 })
    expect(s.record().batches?.map(batch => batch.state)).toEqual(['recorded', 'failed', 'waiting'])
    expect(s.host.clientFolder).not.toHaveBeenCalled()
    await s.model.retry()
    expect(recordStatus(s.record())).toBe('done')
    const sentNumbers = s.firm.mock.send.mock.calls.flatMap(([command]) => command.kind === 'applications' ? command.applications.map(item => item.application.applicationNumber) : [])
    expect(sentNumbers).toEqual(['EP23000001', 'EP23000002', 'EP23000002', 'EP23000003'])
    expect(s.host.clientFolder).toHaveBeenCalledTimes(1)
  })

  it('splits again when the Firm Record takes fewer applications in a batch', async () => {
    const s = setup({ clients: [] })
    await toRecord(s, 5, 5)
    s.firm.state.batchMax = 2
    await s.model.record()
    expect(sentBatches(s).map(numbers => numbers.length)).toEqual([5, 2, 2, 1])
    expect(recordStatus(s.record())).toBe('done')
  })

  it('reads the batch size again after its read failed, and makes the folder again after it failed', async () => {
    const s = setup({ clients: [] })
    await toRecord(s, 1, 100)
    s.host.settings.mockResolvedValueOnce({ ok: false, error: 'network' })
    await s.model.record()
    expect(s.record()).toMatchObject({ batches: null, error: 'network' })
    expect(recordStatus(s.record())).toBe('failed')
    s.host.clientFolder.mockResolvedValueOnce({ ok: false, error: 'invalid-name' })
    await s.model.retry()
    expect(s.record()).toMatchObject({ folder: { state: 'waiting' }, error: 'invalid-name' })
    expect(s.record().batches?.map(batch => batch.state)).toEqual(['recorded'])
    await s.model.retry()
    expect(recordStatus(s.record())).toBe('done')
    expect(sentBatches(s)).toHaveLength(1)
  })

  it('opens the client page after a failed batch by making the client folder first, and not while the run goes on', async () => {
    const s = setup({ clients: [] })
    await toRecord(s, 2, 1)
    const held = deferred<Awaited<ReturnType<typeof s.firm.record.send>>>()
    const send = s.firm.mock.send.getMockImplementation()!
    s.firm.mock.send.mockImplementation(async command => command.kind === 'applications' ? held.promise : send(command))
    const pending = s.model.record()
    await settle()
    expect(recordStatus(s.record())).toBe('running')
    expect(await s.model.openClientPage()).toBe(false)
    held.resolve({ ok: false, error: { kind: 'network' } })
    await pending
    expect(recordStatus(s.record())).toBe('failed')
    const folder = deferred<Awaited<ReturnType<typeof s.host.clientFolder>>>()
    s.host.clientFolder.mockImplementationOnce(() => folder.promise)
    const opening = s.model.openClientPage()
    await settle()
    expect(s.record().folder).toEqual({ state: 'making' })
    expect(await s.model.openClientPage()).toBe(false)
    folder.resolve(okHost({ workspace: 'ws-syntegon', folder: 'Syntegon', made: true }))
    expect(await opening).toBe(true)
    expect(s.opened).toEqual(['ws-syntegon'])
    expect(s.view()).toBeNull()
  })

  it('says why the client folder failed when Open client page makes it', async () => {
    const s = setup({ clients: [] })
    await toRecord(s, 1, 1)
    s.firm.state.failNext.set('applications', { kind: 'network' })
    await s.model.record()
    s.host.clientFolder.mockResolvedValueOnce({ ok: false, error: 'internal' })
    expect(await s.model.openClientPage()).toBe(false)
    expect(s.record()).toMatchObject({ folder: { state: 'waiting' }, error: 'internal' })
    expect(s.opened).toEqual([])
  })

  it('records nothing that the Firm Record has with every applicant role', async () => {
    const s = setup()
    s.host.review.mockResolvedValueOnce(okHost(reviewed({ atFirm: [matter('EP23171862'), matter('EP23999999')] })))
    await s.model.checkForNew(SYNTEGON_ID)
    await settle()
    await s.model.record()
    expect(s.record().applications.map(item => item.fact.applicationNumber)).toEqual(['EP23999999'])
    expect(s.firm.sent.map(command => command.kind)).toEqual(['applications'])
  })

  it('stops the run before its next batch when the page closes', async () => {
    const s = setup({ clients: [] })
    await toRecord(s, 2, 1)
    const held = deferred<Awaited<ReturnType<typeof s.firm.record.send>>>()
    const send = s.firm.mock.send.getMockImplementation()!
    s.firm.mock.send.mockImplementation(async command => command.kind === 'applications' ? held.promise : send(command))
    const pending = s.model.record()
    await settle()
    s.model.close()
    held.resolve({ ok: true, value: { kind: 'recorded' } })
    await pending
    expect(sentBatches(s)).toEqual([])
    expect(s.firm.mock.send.mock.calls.filter(([command]) => command.kind === 'applications')).toHaveLength(1)
    expect(s.host.clientFolder).not.toHaveBeenCalled()
  })
})

describe('the client of a client folder', () => {
  it('is the one client with the role client whose folder name is the folder name', () => {
    const clients = [firmClient(SYNTEGON_ID, 'Novo Nordisk A/S'), firmClient(SCHUBERT_ID, 'Gerhard Schubert', 'watch')]
    expect(clientOfFolder(clients, '/home/firm/clients/Novo Nordisk A-S')?.clientId).toBe(SYNTEGON_ID)
    expect(clientOfFolder(clients, 'C:\\Clients\\Novo Nordisk A-S')?.clientId).toBe(SYNTEGON_ID)
    expect(clientOfFolder(clients, '/home/firm/clients/Gerhard Schubert')).toBeNull()
    expect(clientOfFolder([...clients, firmClient(SCHUBERT_ID, 'Novo Nordisk A\\S')], '/clients/Novo Nordisk A-S')).toBeNull()
  })
})

describe('checking a client folder for new matters', () => {
  it('reads the client\'s names and goes straight to the review, without the client among the compared clients', async () => {
    const s = setup()
    await s.model.checkForNew(SYNTEGON_ID)
    await settle()
    expect(s.review()).toMatchObject({ role: 'client', subject: { name: 'Syntegon', existing: { clientId: SYNTEGON_ID } } })
    expect(s.host.review).toHaveBeenCalledWith({ names: ['SYNTEGON TECHNOLOGY'], clients: [] })
    expect(clientIdOf(s.review())).toBe(SYNTEGON_ID)
    await s.model.record()
    // The client, its name and the conflict check of no hit are in the Firm Record already, and no matter is new.
    expect(s.firm.sent).toEqual([])
    expect(s.view()?.page).toBe('record')
  })

  it('says when the client cannot be read, and goes by name for a client with no linked name', async () => {
    const s = setup({ details: [{ ...SYNTEGON, names: [], conflictChecks: [await hitsHash([])] }] })
    s.firm.state.detailErrors.set(SCHUBERT_ID, { kind: 'malformed', path: 'body' })
    await s.model.checkForNew(SCHUBERT_ID)
    expect(s.model.state.toast).toEqual({ kind: 'failed', error: { kind: 'malformed', path: 'body' } })
    await s.model.checkForNew(SYNTEGON_ID)
    await settle()
    expect(s.review().review).toEqual({ status: 'by-name' })
    s.model.start()
    expect(s.model.state.toast).toBeNull()
  })

  it('drops a check whose page closed before the client was read', async () => {
    const s = setup()
    const pending = s.model.checkForNew(SYNTEGON_ID)
    s.model.close()
    await pending
    expect(s.view()).toBeNull()
  })
})

it('ignores acts that do not belong to the open page', async () => {
  const s = setup()
  s.model.tick('x', true)
  s.model.claim('x', true)
  await s.model.retry()
  await s.model.record()
  expect(await s.model.openClientPage()).toBe(false)
  s.model.start()
  s.model.claim('x', true)
  await s.model.retry()
  expect(s.view()?.page).toBe('find')
  expect(clientIdOf({ ...(await (async () => { await toReview(s, 'Syntegon'); return s.review() })()), subject: { name: 'S', names: [], existing: firmClient(SCHUBERT_ID, 'S', 'watch') } })).not.toBe(SCHUBERT_ID)
})

/** A promise that a test resolves. */
function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

describe('a page that closed while it waited', () => {
  it('drops the clients read and the review of a closed review', async () => {
    const s = setup()
    s.host.find.mockResolvedValueOnce(okHost(found([['X', 1]])))
    s.model.start()
    s.model.type('X')
    await s.model.search()
    const clients = deferred<Awaited<ReturnType<typeof s.firm.record.clients>>>()
    s.firm.mock.clients.mockImplementationOnce(() => clients.promise)
    const first = s.model.continue()
    s.model.close()
    clients.resolve({ ok: true, value: [] })
    await first
    expect(s.host.review).not.toHaveBeenCalled()
    const answer = deferred<Awaited<ReturnType<typeof s.host.review>>>()
    s.host.review.mockImplementationOnce(() => answer.promise)
    s.host.find.mockResolvedValueOnce(okHost(found([['X', 1]])))
    s.model.start()
    s.model.type('X')
    await s.model.search()
    const second = s.model.continue()
    await settle()
    s.model.close()
    answer.resolve(okHost(reviewed()))
    await second
    expect(s.view()).toBeNull()
  })

  it('drops the progress and the outcome of a recording whose page closed', async () => {
    const s = setup({ clients: [] })
    await toReview(s, 'Syntegon')
    const sent = deferred<Awaited<ReturnType<typeof s.firm.record.send>>>()
    s.firm.mock.send.mockImplementationOnce(() => sent.promise)
    const pending = s.model.record()
    await settle()
    s.model.close()
    sent.resolve({ ok: true, value: { kind: 'recorded' } })
    await pending
    expect(s.view()).toBeNull()
    expect(s.host.settings).not.toHaveBeenCalled()
  })

  it('drops the adopted client of a page that closed', async () => {
    const s = setup({ clients: [] })
    await toReview(s, 'Syntegon')
    const adopted = deferred<Awaited<ReturnType<typeof s.firm.record.client>>>()
    s.firm.mock.client.mockImplementation(async id => id === SCHUBERT_ID ? adopted.promise : { ok: false, error: { kind: 'refused', status: 409, code: 'client-unknown' } })
    s.firm.state.failNext.set('client', { kind: 'refused', status: 409, code: 'client-exists', clientId: SCHUBERT_ID })
    const pending = s.model.record()
    await settle()
    s.model.close()
    adopted.resolve({ ok: true, value: SYNTEGON })
    await pending
    expect(s.view()).toBeNull()
  })

  it('drops the batch size and the client folder of a Record page that closed', async () => {
    const s = setup({ clients: [] })
    await toRecord(s, 1, 1)
    const settings = deferred<Awaited<ReturnType<typeof s.host.settings>>>()
    s.host.settings.mockImplementationOnce(() => settings.promise)
    const first = s.model.record()
    await settle()
    s.model.close()
    settings.resolve(okHost({ recordBatchSize: 1 }))
    await first
    expect(s.firm.sent.some(command => command.kind === 'applications')).toBe(false)
    await toRecord(s, 1, 1)
    const folder = deferred<Awaited<ReturnType<typeof s.host.clientFolder>>>()
    s.host.clientFolder.mockImplementationOnce(() => folder.promise)
    const second = s.model.record()
    await settle()
    s.model.close()
    folder.resolve(okHost({ workspace: 'ws-1', folder: 'Syntegon', made: true }))
    await second
    expect(s.view()).toBeNull()
    expect(s.opened).toEqual([])
  })
})

describe('the rules of a review', () => {
  it('takes a client that the Firm Record does not know as a new client', async () => {
    const s = setup({ clients: [] })
    await toReview(s, 'Syntegon')
    s.firm.state.detailErrors.set(clientIdOf(s.review()), { kind: 'refused', status: 409, code: 'client-unknown' })
    await s.model.record()
    expect(s.firm.sent.map(command => command.kind)).toEqual(['conflict-check', 'client', 'name'])
  })

  it('finds no hit before the Firm Record answers, and names no matter before the person picks one', async () => {
    const s = setup()
    const clients = deferred<Awaited<ReturnType<typeof s.firm.record.clients>>>()
    s.host.find.mockResolvedValueOnce(okHost(found([['GERHARD SCHUBERT', 57]], { source: 'ep-register', edition: undefined })))
    s.model.start()
    s.model.type('Gerhard Schubert')
    await s.model.search()
    s.firm.mock.clients.mockImplementationOnce(() => clients.promise)
    void s.model.continue()
    await settle()
    expect(s.review().subject.names).toEqual([{ name: 'GERHARD SCHUBERT', source: 'ep-register', applications: 57 }])
    expect(hitsOf(s.review())).toEqual([])
    expect(decisionOf({ ...s.review(), role: 'other-party' })).toMatchObject({ matter: { applicationNumber: '' } })
    clients.resolve({ ok: true, value: [] })
    await settle()
  })

  it('claims nothing while the review has no public data, and keeps the Watch list when the Firm Record fails', async () => {
    const s = setup({ clients: [] })
    s.host.find.mockResolvedValueOnce(okHost({ status: 'no-plugin' }))
    s.model.start()
    s.model.type('Neue GmbH')
    await s.model.search()
    await s.model.continue()
    s.model.claim('EP1', true)
    expect(s.review().review).toEqual({ status: 'by-name' })
    s.firm.state.clientsError = { kind: 'network' }
    await s.model.refresh()
    expect(s.model.state.clients).toEqual([])
  })
})

describe('the names of the opponent index', () => {
  it('sends the names of the clients with the role client when the list opens, and before the review reads the index', async () => {
    const watched = firmClient(SCHUBERT_ID, 'Gerhard Schubert', 'watch', ['Gerhard Schubert GmbH'])
    const s = setup({ clients: [watched], details: [SYNTEGON] })
    await s.model.refresh()
    expect(s.host.clientNames).toHaveBeenCalledWith(['Syntegon', 'SYNTEGON TECHNOLOGY'])
    s.host.clientNames.mockClear()
    await toReview(s, 'Acme')
    expect(s.host.clientNames).toHaveBeenCalledWith(['Syntegon', 'SYNTEGON TECHNOLOGY'])
    expect(s.host.clientNames.mock.invocationCallOrder[0]).toBeLessThan(s.host.review.mock.invocationCallOrder.at(-1) ?? 0)
    s.firm.state.clientsError = { kind: 'network' }
    s.host.clientNames.mockClear()
    await s.model.refresh()
    expect(s.host.clientNames).not.toHaveBeenCalled()
  })
})
