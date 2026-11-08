import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FindAnswer } from '../src/add-client/wire.ts'
import type { HostResult } from '../src/client/add-client/api.ts'
import {
  AddClientModel, FIND_WAIT_MS, POLL_MS, SKELETON_AFTER_MS, SKELETON_MIN_MS,
  applicationsOf, blockerOf, buildFailed, clientIdOf, decisionOf, hitsOf,
  type AddClientView, type BuildView, type FindView, type ReviewView,
} from '../src/client/add-client/model.ts'
import { hitsHash, type ClientDetail, type PartyId } from '../src/client/add-client/records.ts'
import {
  SCHUBERT_ID, SYNTEGON_ID, buildStatus, fakeHost, fakeRecord, firmClient, found, matter, okHost, reference, registerHit, reviewed,
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
  const build = () => view() as BuildView
  return { model, host, firm, opened, view, find, review, build }
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
  it('blocks Add client until the person checks the conflict and writes why, then records and builds the folder', async () => {
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
    s.host.status.mockResolvedValue(okHost({ builds: [buildStatus(clientIdOf(s.review()), 'Gerhard Schubert', { matters: 0, families: 0 })] }))
    const unfollow = s.model.follow()
    await s.model.record()
    const id = s.build().clientId
    expect(s.firm.sent.map(command => command.kind)).toEqual(['conflict-check', 'client', 'name'])
    expect(s.firm.sent[0]).toMatchObject({ reason: 'The opposition is closed.', hits: [{ otherParty: 'Gerhard Schubert GmbH' }] })
    expect(s.host.build).toHaveBeenCalledWith({ clientId: id, name: 'Gerhard Schubert', names: ['GERHARD SCHUBERT'], applications: [] })
    expect(s.build()).toMatchObject({ recorded: { names: 1, matters: 0, hits: 1 }, status: { state: 'running' } })
    s.host.status.mockResolvedValue(okHost({ builds: [buildStatus(id, 'Gerhard Schubert', { state: 'done', workspace: 'ws-schubert', matters: 0, families: 0 })] }))
    await vi.advanceTimersByTimeAsync(POLL_MS)
    expect(s.view()).toBeNull()
    expect(s.opened).toEqual(['ws-schubert'])
    expect(s.model.state.toast).toEqual({ kind: 'client', name: 'Gerhard Schubert', matters: 0, families: 0 })
    s.model.dismissToast()
    expect(s.model.state.toast).toBeNull()
    unfollow()
    unfollow()
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
    expect(s.firm.sent.map(command => command.kind)).toEqual(['conflict-check', 'client', 'name', 'party', 'application', 'role', 'application', 'role', 'application', 'role', 'application', 'role'])
    expect(s.host.build).toHaveBeenCalledWith(expect.objectContaining({ applications: ['EP23171862', 'EP25712875', 'EP23165015', 'EP23200762'] }))
  })

  it('keeps the keys of a failed recording, and Try again sends only what is missing', async () => {
    const s = setup({ clients: [] })
    s.host.review.mockResolvedValueOnce(okHost(reviewed({ atFirm: [matter('EP23171862')] })))
    await toReview(s, 'Syntegon')
    s.firm.state.failNext.set('application', { kind: 'network' })
    await s.model.record()
    expect(s.review().recording).toEqual({ status: 'failed', error: { kind: 'network' } })
    const first = s.firm.sent.length
    s.model.setRole('client')
    expect(s.review().recording).toEqual({ status: 'idle' })
    s.firm.state.failNext.set('application', { kind: 'network' })
    await s.model.record()
    await s.model.retry()
    // The party has no role yet, so the plan reads its id again; the Firm Record answers the same party.
    expect(s.firm.sent.slice(first).map(command => command.kind)).toEqual(['party', 'application', 'party', 'application', 'role'])
    expect(s.view()?.page).toBe('build')
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
    expect(s.build().clientId).toBe(SYNTEGON_ID)
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
    expect(s.model.state).toMatchObject({ view: null, toast: { kind: 'watch', name: 'Gerhard Schubert' }, watching: [{ name: 'Gerhard Schubert', role: 'watch' }] })
    expect(s.host.build).not.toHaveBeenCalled()
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

describe('following a build', () => {
  it('shows the builds that run while a view follows them, and stops reading when none runs', async () => {
    const s = setup()
    s.host.status.mockResolvedValue(okHost({ builds: [buildStatus(SYNTEGON_ID, 'Syntegon')] }))
    const unfollow = s.model.follow()
    await settle()
    expect(s.model.state.builds).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(POLL_MS)
    expect(s.host.status).toHaveBeenCalledTimes(2)
    s.host.status.mockResolvedValue(okHost({ builds: [buildStatus(SYNTEGON_ID, 'Syntegon', { state: 'done', workspace: 'ws-1' })] }))
    await vi.advanceTimersByTimeAsync(POLL_MS)
    await vi.advanceTimersByTimeAsync(POLL_MS * 3)
    expect(s.host.status).toHaveBeenCalledTimes(3)
    unfollow()
    s.host.status.mockResolvedValue({ ok: false, error: 'network' })
    s.model.follow()
    await settle()
    expect(s.model.state.builds).toHaveLength(1)
    s.model.dispose()
    s.model.follow()
    await settle()
    expect(s.host.status).toHaveBeenCalledTimes(4)
  })

  it('opens a stopped build from the list, and Try again reads the request from the Firm Record', async () => {
    const s = setup()
    const failed = buildStatus(SYNTEGON_ID, 'Syntegon', { state: 'failed', workspace: 'ws-syntegon' })
    s.host.status.mockResolvedValue(okHost({ builds: [failed] }))
    s.model.follow()
    await settle()
    s.model.openBuild('unknown')
    expect(s.view()).toBeNull()
    s.model.openBuild(SYNTEGON_ID)
    await settle()
    expect(buildFailed(s.build())).toBe(true)
    s.firm.state.detailErrors.set(SYNTEGON_ID, { kind: 'network' })
    await s.model.retry()
    expect(s.build().error).toEqual({ kind: 'network' })
    s.firm.state.detailErrors.clear()
    s.host.build.mockResolvedValueOnce({ ok: false, error: 'stopped' })
    await s.model.retry()
    expect(s.host.build).toHaveBeenLastCalledWith({ clientId: SYNTEGON_ID, name: 'Syntegon', names: ['SYNTEGON TECHNOLOGY'], applications: ['EP23171862'] })
    expect(s.build().error).toBe('stopped')
    s.host.status.mockResolvedValue({ ok: false, error: 'network' })
    s.host.build.mockResolvedValueOnce(okHost(failed))
    await s.model.retry()
    await vi.advanceTimersByTimeAsync(0)
    expect(s.build().error).toBe('network')
    expect(s.model.openFolder()).toBe(true)
    expect(s.opened).toEqual(['ws-syntegon'])
    expect(s.model.openFolder()).toBe(false)
  })

  it('shows the status of another client\'s build only on the list, and waits for a done build to name its folder', async () => {
    const s = setup()
    s.host.status.mockResolvedValue(okHost({ builds: [buildStatus(SYNTEGON_ID, 'Syntegon'), buildStatus(SCHUBERT_ID, 'Gerhard Schubert')] }))
    s.model.follow()
    await settle()
    s.model.openBuild(SYNTEGON_ID)
    s.host.status.mockResolvedValue(okHost({ builds: [buildStatus(SYNTEGON_ID, 'Syntegon', { state: 'done' })] }))
    await vi.advanceTimersByTimeAsync(POLL_MS)
    expect(s.build().status?.state).toBe('done')
    await s.model.retry()
    expect(s.host.build).not.toHaveBeenCalled()
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
    s.host.status.mockResolvedValue(okHost({ builds: [] }))
    await s.model.record()
    // The client, its name, its application and the conflict check of no hit are in the Firm Record already.
    expect(s.firm.sent).toEqual([])
    expect(s.view()?.page).toBe('build')
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
  expect(s.model.openFolder()).toBe(false)
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
    expect(s.host.build).not.toHaveBeenCalled()
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

  it('drops the request read and the build answer of a build page that closed', async () => {
    const s = setup()
    s.host.status.mockResolvedValue(okHost({ builds: [buildStatus(SYNTEGON_ID, 'Syntegon', { state: 'interrupted' })] }))
    s.model.follow()
    await settle()
    s.model.openBuild(SYNTEGON_ID)
    await settle()
    const detail = deferred<Awaited<ReturnType<typeof s.firm.record.client>>>()
    s.firm.mock.client.mockImplementationOnce(() => detail.promise)
    const first = s.model.retry()
    s.model.close()
    detail.resolve({ ok: true, value: SYNTEGON })
    await first
    expect(s.host.build).not.toHaveBeenCalled()
    s.model.openBuild(SYNTEGON_ID)
    await settle()
    const started = deferred<Awaited<ReturnType<typeof s.host.build>>>()
    s.host.build.mockImplementationOnce(() => started.promise)
    const second = s.model.retry()
    await settle()
    s.model.close()
    started.resolve(okHost(buildStatus(SYNTEGON_ID, 'Syntegon')))
    await second
    expect(s.view()).toBeNull()
  })

  it('stops reading the builds when the page is gone', async () => {
    const s = setup()
    s.host.status.mockResolvedValue(okHost({ builds: [buildStatus(SYNTEGON_ID, 'Syntegon')] }))
    s.model.follow()
    await settle()
    s.model.dispose()
    await vi.advanceTimersByTimeAsync(POLL_MS * 2)
    expect(s.host.status).toHaveBeenCalledTimes(1)
    const t = setup()
    const answer = deferred<Awaited<ReturnType<typeof t.host.status>>>()
    t.host.status.mockImplementationOnce(() => answer.promise)
    t.model.follow()
    await settle()
    t.model.dispose()
    answer.resolve(okHost({ builds: [buildStatus(SYNTEGON_ID, 'Syntegon')] }))
    await settle()
    expect(t.model.state.builds).toEqual([])
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
    s.model.follow()
    await settle()
    expect(s.model.state.watching).toEqual([])
  })
})
