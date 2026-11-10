import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DocketState, FindAnswer } from '../src/add-client/wire.ts'
import type { HostResult } from '../src/client/add-client/api.ts'
import {
  AddClientModel, DOCKET_POLL_MS, FIND_WAIT_MS, SKELETON_AFTER_MS, SKELETON_MIN_MS, clientOfFolder, recordStatus,
  type AddClientView, type RecordView,
} from '../src/client/add-client/model.ts'
import { hitsHash, type ClientDetail, type PartyId } from '../src/client/add-client/records.ts'
import { applicationsOf, clientIdOf, hitsOf, waitOf, type WizardView } from '../src/client/add-client/wizard.ts'
import {
  SCHUBERT_ID, SYNTEGON_ID, checked, docketRow, fakeHost, fakeRecord, firmClient, found, matters, okHost, others, registerHit,
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

const SYNTEGON_NAMES: [string, number][] = [['SYNTEGON TECHNOLOGY', 600], ['SYNTEGON POUCH SYSTEMS', 12]]
const READING: DocketState = { state: 'reading', progress: { slicesDone: 2, slices: 10, rows: 30 } }
const PARTIAL: DocketState = { state: 'partial', rows: 30, asOf: '2026-11-08T14:02:00.000Z', failed: [{ query: 'q', reason: 'unreachable' }], mismatches: [] }

function setup(start: Parameters<typeof fakeRecord>[0] = { details: [SYNTEGON] }) {
  const host = fakeHost()
  const firm = fakeRecord(start)
  const opened: string[] = []
  const model = new AddClientModel({ api: host, record: firm.record, open: (id) => { opened.push(id) } })
  const view = (): AddClientView | null => model.state.view
  const wizard = () => view() as WizardView
  const record = () => view() as RecordView
  return { model, host, firm, opened, view, wizard, record }
}

type Setup = ReturnType<typeof setup>

const settle = () => vi.advanceTimersByTimeAsync(0)

/** A Host answer that comes after `ms`. */
const later = <T>(ms: number, value: HostResult<T>) => new Promise<HostResult<T>>((resolve) => { setTimeout(() => { resolve(value) }, ms) })

/** A promise that a test resolves. */
function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

/** Open Add client and search a company now. */
async function search(s: Setup, name: string, answer: FindAnswer = found([[name.toUpperCase(), 57]])) {
  s.host.find.mockResolvedValueOnce(okHost(answer))
  s.model.start()
  s.model.type(name)
  await s.model.find()
}

/** Search a company, choose a role, and go through the steps to Review. */
async function toReview(s: Setup, name: string, role: 'client' | 'watch' | 'other-party' = 'client', answer?: FindAnswer) {
  await search(s, name, answer)
  await s.model.next()
  await s.model.next()
  s.model.setRole(role)
  await s.model.next()
  if (role !== 'watch') await s.model.next()
}

describe('the Company step', () => {
  it('searches when typing pauses, shows the skeleton after 150 ms for at least 300 ms, and proposes the group with the firm docket', async () => {
    const s = setup()
    s.host.find.mockImplementationOnce(() => later(200, okHost(found(SYNTEGON_NAMES))))
    s.model.start()
    expect(s.wizard()).toMatchObject({ at: 'company', reached: 'company', query: '', find: { status: 'empty' }, docket: { status: 'idle' } })
    s.model.type('Syntegon')
    await vi.advanceTimersByTimeAsync(FIND_WAIT_MS - 1)
    expect(s.host.find).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(s.host.find).toHaveBeenCalledWith('Syntegon', expect.any(AbortSignal))
    expect(s.wizard().find).toEqual({ status: 'loading', skeleton: false })
    await vi.advanceTimersByTimeAsync(SKELETON_AFTER_MS)
    expect(s.wizard().find).toEqual({ status: 'loading', skeleton: true })
    await vi.advanceTimersByTimeAsync(SKELETON_MIN_MS - 1)
    expect(s.wizard().find.status).toBe('loading')
    await vi.advanceTimersByTimeAsync(1)
    expect(s.wizard()).toMatchObject({
      find: {
        status: 'found', source: 'patstat', edition: '2026 Spring', sampleRows: 5000, omitted: 0,
        names: [{ name: 'SYNTEGON TECHNOLOGY', matching: 600, ticked: true }, { name: 'SYNTEGON POUCH SYSTEMS', matching: 12, ticked: true }],
      },
      existing: { clientId: SYNTEGON_ID },
      role: 'client',
      docket: { status: 'read', docket: { state: 'ready' }, counts: [{ name: 'SYNTEGON TECHNOLOGY', atFirm: 0 }, { name: 'SYNTEGON POUCH SYSTEMS', atFirm: 0 }] },
    })
    expect(s.host.matters).toHaveBeenCalledWith(['SYNTEGON TECHNOLOGY', 'SYNTEGON POUCH SYSTEMS'])
    expect(waitOf(s.wizard(), 'company')).toBeNull()
  })

  it('shows a quick answer with no skeleton, drops the answer of an emptied field, and searches at once on Enter', async () => {
    const s = setup({ clients: [] })
    const seen: string[] = []
    s.model.store.subscribe(() => {
      const view = s.model.state.view
      if (view?.page === 'wizard') seen.push(view.find.status + (view.find.status === 'loading' && view.find.skeleton ? '+' : ''))
    })
    s.model.start()
    await s.model.find()
    expect(s.host.find).not.toHaveBeenCalled()
    s.host.find.mockImplementationOnce(() => later(50, okHost(found([['SYNTEGON TECHNOLOGY', 600]]))))
    s.model.type('Syntegon')
    void s.model.find()
    await vi.advanceTimersByTimeAsync(50)
    expect(seen).not.toContain('loading+')
    expect(s.wizard().find.status).toBe('found')
    s.host.find.mockImplementationOnce(() => later(400, okHost(found([['OTHER', 1]]))))
    void s.model.find()
    await vi.advanceTimersByTimeAsync(100)
    s.model.type('  ')
    // The skeleton of the dropped search does not show.
    await vi.advanceTimersByTimeAsync(1000)
    expect(s.wizard()).toMatchObject({ query: '  ', find: { status: 'empty' }, docket: { status: 'idle' }, existing: null })
    expect(seen.at(-1)).toBe('empty')
    s.model.close()
    s.model.type('x')
    expect(s.view()).toBeNull()
  })

  it('says why no names came: no EPO key, no data plugin, or a failure that Try again searches again', async () => {
    const s = setup({ clients: [] })
    s.model.start()
    s.model.type('Gerhard Schubert')
    s.host.find.mockResolvedValueOnce({ ok: false, error: 'no-key' })
    await s.model.find()
    expect(s.wizard()).toMatchObject({ find: { status: 'no-key' }, docket: { status: 'idle' } })
    expect(waitOf(s.wizard(), 'company')).toBe('find-failed')
    s.host.find.mockResolvedValueOnce(okHost({ status: 'no-plugin' }))
    await s.model.find()
    expect(s.wizard()).toMatchObject({ find: { status: 'no-plugin' }, docket: { status: 'no-plugin' } })
    expect(waitOf(s.wizard(), 'company')).toBeNull()
    s.host.find.mockResolvedValueOnce({ ok: false, error: 'unreachable' })
    await s.model.find()
    expect(s.wizard().find).toEqual({ status: 'error', error: 'unreachable' })
    s.host.find.mockResolvedValueOnce(okHost(found([['GERHARD SCHUBERT', 57]], { source: 'ep-register', edition: undefined })))
    await s.model.retry()
    expect(s.wizard().find).toMatchObject({ status: 'found', source: 'ep-register' })
    expect('edition' in s.wizard().find).toBe(false)
    expect(s.host.matters).toHaveBeenCalledTimes(1)
  })

  it('goes on by name only after a failed or keyless search, and not after a search that found names', async () => {
    const s = setup({ clients: [] })
    await search(s, 'Neue GmbH')
    s.model.byName()
    expect(s.wizard().find.status).toBe('found')
    s.host.find.mockResolvedValueOnce({ ok: false, error: 'no-key' })
    await s.model.find()
    s.model.byName()
    expect(s.wizard()).toMatchObject({ find: { status: 'by-name' }, docket: { status: 'idle' } })
    s.host.find.mockResolvedValueOnce({ ok: false, error: 'internal' })
    await s.model.find()
    s.model.byName()
    expect(s.wizard().find).toEqual({ status: 'by-name' })
    expect(waitOf(s.wizard(), 'company')).toBeNull()
  })

  it('waits on Next until a name is ticked and the firm docket is read', async () => {
    const s = setup({ clients: [] })
    s.model.start()
    await s.model.next()
    expect(s.wizard().at).toBe('company')
    s.host.matters.mockResolvedValueOnce({ ok: false, error: 'unreachable' })
    await search(s, 'Syntegon', found(SYNTEGON_NAMES))
    expect(s.wizard().docket).toEqual({ status: 'error', error: 'unreachable' })
    expect(waitOf(s.wizard(), 'company')).toBe('docket')
    await s.model.next()
    expect(s.wizard().at).toBe('company')
    // Try again reads the rows of the names again.
    await s.model.retry()
    expect(s.wizard().docket.status).toBe('read')
    s.model.tick('SYNTEGON POUCH SYSTEMS', false)
    s.model.tick('SYNTEGON TECHNOLOGY', false)
    expect(waitOf(s.wizard(), 'company')).toBe('names')
    s.model.tick('SYNTEGON TECHNOLOGY', true)
    await s.model.next()
    expect(s.wizard()).toMatchObject({ at: 'matters', reached: 'matters', group: { name: 'Syntegon', names: [{ name: 'SYNTEGON TECHNOLOGY', source: 'patstat', applications: 600, edition: '2026 Spring' }], byName: false } })
  })

  it('reads the docket rows again every 2 s while the Host reads the docket, and stops when the read ends or the page closes', async () => {
    const s = setup({ clients: [] })
    s.host.matters.mockResolvedValueOnce(okHost(matters(['SYNTEGON'], [], READING)))
    s.host.matters.mockResolvedValueOnce(okHost(matters(['SYNTEGON'], [], READING)))
    await search(s, 'Syntegon')
    expect(s.wizard().docket).toMatchObject({ status: 'read', docket: { state: 'reading' } })
    expect(waitOf(s.wizard(), 'company')).toBe('docket')
    await vi.advanceTimersByTimeAsync(DOCKET_POLL_MS - 1)
    expect(s.host.matters).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(s.host.matters).toHaveBeenCalledTimes(2)
    // The rows stay while the next read runs: the page shows no loading state between two reads.
    await vi.advanceTimersByTimeAsync(DOCKET_POLL_MS)
    expect(s.host.matters).toHaveBeenCalledTimes(3)
    expect(s.wizard().docket).toMatchObject({ status: 'read', docket: { state: 'ready' } })
    await vi.advanceTimersByTimeAsync(DOCKET_POLL_MS * 3)
    expect(s.host.matters).toHaveBeenCalledTimes(3)
    s.host.matters.mockResolvedValue(okHost(matters(['SYNTEGON'], [], READING)))
    await search(s, 'Syntegon')
    s.model.dispose()
    await vi.advanceTimersByTimeAsync(DOCKET_POLL_MS * 3)
    expect(s.host.matters).toHaveBeenCalledTimes(4)
  })

  it('asks the Host to read a partial or interrupted docket again on Try again, then reads the rows again', async () => {
    const s = setup({ clients: [] })
    s.host.matters.mockResolvedValueOnce(okHost(matters(['SYNTEGON'], [], PARTIAL)))
    await search(s, 'Syntegon')
    expect(waitOf(s.wizard(), 'company')).toBeNull()
    await s.model.retry()
    expect(s.host.readDocket).toHaveBeenCalledTimes(1)
    expect(s.host.matters).toHaveBeenCalledTimes(2)
    expect(s.wizard().docket).toMatchObject({ docket: { state: 'ready' } })
    // A failed request to read again changes nothing.
    s.host.readDocket.mockResolvedValueOnce({ ok: false, error: 'network' })
    await s.model.retryDocket()
    expect(s.host.matters).toHaveBeenCalledTimes(2)
    // A new search while the Host starts the read drops the rows of the old names.
    const read = deferred<Awaited<ReturnType<typeof s.host.readDocket>>>()
    s.host.readDocket.mockImplementationOnce(() => read.promise)
    const pending = s.model.retryDocket()
    s.model.type('')
    read.resolve(okHost({ status: 'docket', docket: { state: 'ready', rows: 1, asOf: '2026-11-08T14:02:00.000Z' } }))
    await pending
    expect(s.host.matters).toHaveBeenCalledTimes(2)
    // With no docket rows read, Try again has nothing to read again.
    await s.model.retryDocket()
    expect(s.host.readDocket).toHaveBeenCalledTimes(3)
  })

  it('shows no docket for a runtime with no data plugin, and drops the rows of an older search', async () => {
    const s = setup({ clients: [] })
    s.host.matters.mockResolvedValueOnce(okHost({ status: 'no-plugin' }))
    await search(s, 'Syntegon')
    expect(s.wizard().docket).toEqual({ status: 'no-plugin' })
    const rows = deferred<Awaited<ReturnType<typeof s.host.matters>>>()
    s.host.matters.mockImplementationOnce(() => rows.promise)
    s.host.find.mockResolvedValueOnce(okHost(found([['SYNTEGON', 1]])))
    const first = s.model.find()
    await settle()
    expect(s.wizard().docket).toEqual({ status: 'loading' })
    s.host.find.mockResolvedValueOnce(okHost(found([['OTHER', 1]])))
    s.model.type('Other')
    await s.model.find()
    rows.resolve(okHost(matters(['SYNTEGON'], [docketRow('EP1')])))
    await first
    expect(s.wizard().docket).toMatchObject({ status: 'read', rows: [] })
  })

  it('finds no existing client when the Firm Record cannot be read, and keeps a chosen role on a new search', async () => {
    const s = setup()
    s.firm.state.clientsError = { kind: 'network' }
    await search(s, 'Syntegon')
    expect(s.wizard()).toMatchObject({ existing: null, role: null })
    s.firm.state.clientsError = null
    await s.model.next()
    s.model.setRole('watch')
    s.model.back()
    s.model.back()
    s.host.find.mockResolvedValueOnce(okHost(found([['SYNTEGON', 1]])))
    await s.model.find()
    expect(s.wizard()).toMatchObject({ existing: { clientId: SYNTEGON_ID }, role: 'watch' })
  })
})

describe('the Matters step', () => {
  it('confirms the group when Company is left, counts its applications at other firms, and reads the conflict check', async () => {
    const watched = firmClient(SCHUBERT_ID, 'Gerhard Schubert', 'watch')
    const s = setup({ clients: [watched], details: [SYNTEGON] })
    s.host.others.mockResolvedValueOnce(okHost(others(214, { atLeast: true })))
    await search(s, 'Acme', found([['ACME', 3], ['ACME GMBH', 2]]))
    s.model.tick('ACME GMBH', false)
    await s.model.next()
    expect(s.wizard()).toMatchObject({
      at: 'matters', group: { name: 'Acme', names: [{ name: 'ACME' }] },
      others: { status: 'counted', answer: { count: 214, atLeast: true } },
      check: { status: 'checked' }, firm: { status: 'ready', details: [{ client: { clientId: SYNTEGON_ID } }] },
    })
    expect(s.host.others).toHaveBeenCalledWith(['ACME'])
    expect(s.host.conflictCheck).toHaveBeenCalledWith({ names: ['ACME'], clients: [{ clientId: SYNTEGON_ID, names: ['Syntegon', 'SYNTEGON TECHNOLOGY'] }] })
    // The opponent index gets the clients' names before the check reads it.
    expect(s.host.clientNames).toHaveBeenCalledWith(['Syntegon', 'SYNTEGON TECHNOLOGY'])
    expect(s.host.clientNames.mock.invocationCallOrder[0]).toBeLessThan(s.host.conflictCheck.mock.invocationCallOrder[0] ?? 0)
  })

  it('starts an address-only row unticked, and records only the ticked rows', async () => {
    const s = setup({ clients: [] })
    s.host.matters.mockResolvedValueOnce(okHost(matters(['SYNTEGON'], [
      docketRow('EP23171862', { names: ['SYNTEGON'] }), docketRow('EP23165015', { names: ['SYNTEGON'], addressOnly: true }),
    ])))
    await search(s, 'Syntegon')
    await s.model.next()
    expect(applicationsOf(s.wizard()).map(item => item.fact.applicationNumber)).toEqual(['EP23171862'])
    s.model.tickMatter('EP23165015', true)
    s.model.tickMatter('EP23171862', false)
    expect(applicationsOf(s.wizard()).map(item => item.fact.applicationNumber)).toEqual(['EP23165015'])
  })

  it('counts again on Try again after the count at other firms failed, and shows no count without a data plugin', async () => {
    const s = setup({ clients: [] })
    s.host.others.mockResolvedValueOnce({ ok: false, error: 'unreachable' })
    await search(s, 'Syntegon')
    await s.model.next()
    expect(s.wizard().others).toEqual({ status: 'error', error: 'unreachable' })
    expect(waitOf(s.wizard(), 'matters')).toBeNull()
    s.host.others.mockResolvedValueOnce(okHost({ status: 'no-plugin' }))
    await s.model.retry()
    expect(s.wizard().others).toEqual({ status: 'none' })
    await s.model.retry()
    expect(s.host.others).toHaveBeenCalledTimes(2)
  })

  it('reads no public data for a client by name only', async () => {
    const s = setup({ clients: [] })
    s.host.find.mockResolvedValueOnce(okHost({ status: 'no-plugin' }))
    s.model.start()
    s.model.type('Neue GmbH')
    await s.model.find()
    await s.model.next()
    expect(s.wizard()).toMatchObject({ at: 'matters', group: { name: 'Neue GmbH', names: [], byName: true }, others: { status: 'none' }, check: { status: 'by-name' }, firm: { status: 'ready' } })
    expect(s.host.others).not.toHaveBeenCalled()
    expect(s.host.conflictCheck).not.toHaveBeenCalled()
  })

  it('checks conflicts by name only when the register check has no data plugin', async () => {
    const s = setup({ clients: [] })
    s.host.conflictCheck.mockResolvedValueOnce(okHost({ status: 'no-plugin' }))
    await search(s, 'Syntegon')
    await s.model.next()
    expect(s.wizard().check).toEqual({ status: 'by-name' })
    expect(waitOf(s.wizard(), 'conflict')).toBe('conflict-check')
  })
})

describe('moving between the steps', () => {
  it('goes back one step, opens only the steps that the stepper links, and does not go on from a step that waits', async () => {
    const s = setup({ clients: [] })
    await search(s, 'Syntegon')
    await s.model.next()
    await s.model.next()
    expect(s.wizard()).toMatchObject({ at: 'role', reached: 'role' })
    await s.model.next()
    expect(s.wizard().at).toBe('role')
    await s.model.open('review')
    expect(s.wizard().at).toBe('role')
    await s.model.open('company')
    expect(s.wizard()).toMatchObject({ at: 'company', reached: 'role' })
    await s.model.open('role')
    s.model.back()
    expect(s.wizard().at).toBe('matters')
    s.model.back()
    s.model.back()
    expect(s.wizard().at).toBe('company')
    // The stepper and Next ask for the same data only once for a group that did not change.
    expect(s.host.conflictCheck).toHaveBeenCalledTimes(1)
  })

  it('opens a step with Edit from Review, goes back to Review, and keeps every later choice', async () => {
    const s = setup({ clients: [] })
    s.host.matters.mockResolvedValueOnce(okHost(matters(['SYNTEGON'], [docketRow('EP23171862', { names: ['SYNTEGON'] })])))
    await toReview(s, 'Syntegon')
    expect(s.wizard()).toMatchObject({ at: 'review', reached: 'review', editing: false })
    s.model.edit('matters')
    expect(s.wizard()).toMatchObject({ at: 'matters', editing: true })
    s.model.tickMatter('EP23171862', false)
    await s.model.next()
    expect(s.wizard()).toMatchObject({ at: 'review', editing: false, role: 'client', ticks: { EP23171862: false } })
    s.model.edit('role')
    await s.model.open('company')
    expect(s.wizard()).toMatchObject({ at: 'company', editing: true })
    await s.model.open('review')
    expect(s.wizard()).toMatchObject({ at: 'review', editing: false })
    expect(s.host.others).toHaveBeenCalledTimes(1)
    // Edit works only from Review.
    s.model.back()
    s.model.edit('company')
    expect(s.wizard().at).toBe('conflict')
  })

  it('drops the matter ticks and the conflict tick of a changed group, keeps the reason, and reads its data again', async () => {
    const s = setup()
    s.host.find.mockResolvedValueOnce(okHost(found([['GERHARD SCHUBERT', 57], ['SCHUBERT GMBH', 4]])))
    s.host.conflictCheck.mockResolvedValue(okHost(checked([registerHit(SYNTEGON_ID)])))
    s.model.start()
    s.model.type('Gerhard Schubert')
    await s.model.find()
    await s.model.next()
    s.model.tickMatter('EP1', true)
    await s.model.next()
    s.model.setRole('client')
    await s.model.next()
    s.model.setConflict(true, 'The opposition is closed.')
    await s.model.next()
    expect(waitOf(s.wizard(), 'review')).toBeNull()
    s.model.edit('company')
    s.model.tick('SCHUBERT GMBH', false)
    await s.model.next()
    expect(s.wizard()).toMatchObject({
      at: 'review', editing: false, ticks: {}, conflict: { checked: false, reason: 'The opposition is closed.' }, role: 'client',
      group: { names: [{ name: 'GERHARD SCHUBERT' }] },
    })
    expect(s.host.others).toHaveBeenCalledTimes(2)
    expect(s.host.conflictCheck).toHaveBeenLastCalledWith({ names: ['GERHARD SCHUBERT'], clients: [{ clientId: SYNTEGON_ID, names: ['Syntegon', 'SYNTEGON TECHNOLOGY'] }] })
    expect(waitOf(s.wizard(), 'review')).toBe('conflict-check')
  })

  it('drops the count and the conflict check of a group that changed while they were read', async () => {
    const s = setup({ clients: [] })
    const count = deferred<Awaited<ReturnType<typeof s.host.others>>>()
    const clients = deferred<Awaited<ReturnType<typeof s.firm.record.clients>>>()
    s.host.others.mockImplementationOnce(() => count.promise)
    await search(s, 'Syntegon', found(SYNTEGON_NAMES))
    s.firm.mock.clients.mockImplementationOnce(() => clients.promise)
    const first = s.model.next()
    await settle()
    s.model.back()
    s.model.tick('SYNTEGON POUCH SYSTEMS', false)
    await s.model.next()
    count.resolve(okHost(others(999)))
    clients.resolve({ ok: true, value: [] })
    await first
    expect(s.wizard().others).toEqual({ status: 'counted', answer: others(0) })
    expect(s.host.conflictCheck).toHaveBeenCalledTimes(1)
  })
})

describe('the Conflict check step', () => {
  it('waits for a possible conflict to be checked with a reason, then records the client with the reason and makes its folder', async () => {
    const s = setup()
    s.host.conflictCheck.mockResolvedValueOnce(okHost(checked([registerHit(SYNTEGON_ID)])))
    await search(s, 'Gerhard Schubert')
    await s.model.next()
    await s.model.next()
    s.model.setRole('client')
    await s.model.next()
    expect(s.wizard().at).toBe('conflict')
    expect(hitsOf(s.wizard())).toHaveLength(1)
    await s.model.next()
    expect(s.wizard().at).toBe('conflict')
    s.model.setConflict(true, '  ')
    expect(waitOf(s.wizard(), 'conflict')).toBe('conflict-check')
    s.model.setConflict(true, ' The opposition is closed. ')
    await s.model.next()
    expect(s.wizard().at).toBe('review')
    const id = clientIdOf(s.wizard())
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
  })

  it('reads the conflict check again on Try again after the register, the key or the Firm Record failed', async () => {
    const s = setup()
    s.host.conflictCheck.mockResolvedValueOnce({ ok: false, error: 'unreachable' })
    await search(s, 'Gerhard Schubert')
    await s.model.next()
    expect(s.wizard().check).toEqual({ status: 'error', error: 'unreachable' })
    await s.model.next()
    s.model.setRole('client')
    await s.model.next()
    expect(waitOf(s.wizard(), 'conflict')).toBe('conflict-failed')
    s.host.conflictCheck.mockResolvedValueOnce({ ok: false, error: 'no-key' })
    await s.model.retry()
    expect(s.wizard().check).toEqual({ status: 'no-key' })
    s.firm.state.detailErrors.set(SYNTEGON_ID, { kind: 'network' })
    await s.model.retry()
    expect(s.wizard()).toMatchObject({ check: { status: 'checked' }, firm: { status: 'error', error: { kind: 'network' } } })
    s.firm.state.detailErrors.clear()
    s.firm.state.clientsError = { kind: 'service', status: 503 }
    await s.model.retry()
    expect(s.wizard()).toMatchObject({ check: { status: 'checked' }, firm: { status: 'error', error: { kind: 'service', status: 503 } } })
    expect(s.host.conflictCheck).toHaveBeenLastCalledWith({ names: ['GERHARD SCHUBERT'], clients: [] })
    s.firm.state.clientsError = null
    await s.model.retry()
    expect(waitOf(s.wizard(), 'conflict')).toBeNull()
    await s.model.next()
    expect(s.wizard().at).toBe('review')
  })

  it('drops a conflict check of a closed wizard', async () => {
    const s = setup({ clients: [] })
    await search(s, 'Syntegon')
    const answer = deferred<Awaited<ReturnType<typeof s.host.conflictCheck>>>()
    s.host.conflictCheck.mockImplementationOnce(() => answer.promise)
    const pending = s.model.next()
    await settle()
    s.model.close()
    answer.resolve(okHost(checked()))
    await pending
    expect(s.view()).toBeNull()
  })
})

describe('Watch and Other party', () => {
  it('adds a company to Watch with no conflict check and no folder, and says so in a toast', async () => {
    const s = setup()
    s.firm.state.clientsError = { kind: 'network' }
    await toReview(s, 'Gerhard Schubert', 'watch')
    expect(s.wizard()).toMatchObject({ at: 'review', firm: { status: 'error' } })
    expect(waitOf(s.wizard(), 'review')).toBeNull()
    s.firm.state.clientsError = null
    await s.model.record()
    await settle()
    expect(s.firm.sent.map(command => command.kind)).toEqual(['client', 'name'])
    expect(s.firm.sent[0]).toMatchObject({ role: 'watch' })
    expect(s.model.state).toMatchObject({ view: null, toast: { kind: 'watch', name: 'Gerhard Schubert' } })
    expect(s.model.state.clients.filter(client => client.role === 'watch')).toMatchObject([{ name: 'Gerhard Schubert' }])
    expect(s.host.clientFolder).not.toHaveBeenCalled()
    s.model.dismissToast()
    expect(s.model.state.toast).toBeNull()
  })

  it('links another party to a chosen matter of your firm with its role, and says so in a toast', async () => {
    const s = setup()
    await toReview(s, 'Gerhard Schubert', 'other-party')
    expect(s.wizard().at).toBe('matter')
    expect(waitOf(s.wizard(), 'matter')).toBe('matter')
    s.model.setOther('EP23171862', 'licensee')
    await s.model.next()
    expect(s.wizard().at).toBe('review')
    await s.model.record()
    expect(s.firm.sent.map(command => command.kind)).toEqual(['client', 'name', 'party', 'role'])
    expect(s.firm.sent.at(-1)).toMatchObject({ applicationNumber: 'EP23171862', role: 'licensee' })
    expect(s.model.state.toast).toEqual({ kind: 'party', name: 'Gerhard Schubert', applicationNumber: 'EP23171862' })
  })

  it('reads the Firm Record again on Try again on the Matter step, and keeps the matter so far', async () => {
    const s = setup()
    s.firm.state.detailErrors.set(SYNTEGON_ID, { kind: 'network' })
    await toReview(s, 'Gerhard Schubert', 'other-party')
    expect(s.wizard().firm).toEqual({ status: 'error', error: { kind: 'network' } })
    s.model.setOther('EP1', 'other')
    s.firm.state.detailErrors.clear()
    await s.model.retry()
    expect(s.wizard()).toMatchObject({ firm: { status: 'ready' }, other: { applicationNumber: 'EP1', role: 'other' } })
  })
})

describe('recording from Review', () => {
  it('records the client with the ticked matters, each with its applicants, in one batch', async () => {
    const s = setup({ clients: [] })
    s.host.matters.mockResolvedValueOnce(okHost(matters(['SYNTEGON'], [
      docketRow('EP23171862', { names: ['SYNTEGON'] }),
      docketRow('EP25712875', { names: ['SYNTEGON'], publicationNumber: undefined, title: undefined, representativeSince: undefined }),
      docketRow('EP23165015', { names: ['SYNTEGON'], addressOnly: true }),
    ])))
    await search(s, 'Syntegon')
    await s.model.next()
    s.model.tickMatter('EP23165015', true)
    await s.model.next()
    s.model.setRole('client')
    await s.model.next()
    await s.model.next()
    await s.model.record()
    expect(s.firm.sent.map(command => command.kind)).toEqual(['conflict-check', 'client', 'name', 'party', 'applications'])
    const batch = s.firm.sent.at(-1)
    expect(batch?.kind === 'applications' && batch.applications.map(item => [item.application.applicationNumber, item.roles.map(role => role.partyId)])).toEqual([
      ['EP23171862', ['party-1']], ['EP25712875', ['party-1']], ['EP23165015', ['party-1']],
    ])
    expect(s.record().batches).toEqual([{ applications: s.record().applications, state: 'recorded' }])
    expect(recordStatus(s.record())).toBe('done')
  })

  it('keeps the keys of a failed recording, and Try again sends only what is missing', async () => {
    const s = setup({ clients: [] })
    s.host.matters.mockResolvedValueOnce(okHost(matters(['SYNTEGON'], [docketRow('EP23171862', { names: ['SYNTEGON'] })])))
    await toReview(s, 'Syntegon')
    s.firm.state.failNext.set('name', { kind: 'network' })
    await s.model.record()
    expect(s.wizard().recording).toEqual({ status: 'failed', error: { kind: 'network' } })
    const first = s.firm.sent.length
    s.model.setConflict(false, '')
    expect(s.wizard().recording).toEqual({ status: 'idle' })
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
    const id = clientIdOf(s.wizard())
    s.firm.state.detailErrors.set(id, { kind: 'service', status: 503 })
    await s.model.record()
    expect(s.wizard().recording).toEqual({ status: 'failed', error: { kind: 'service', status: 503 } })
    s.firm.state.detailErrors.clear()
    // The Firm Record has Syntegon under another id, which the Company step did not see.
    s.firm.details.set(SYNTEGON_ID, { client: SYNTEGON.client, names: [], applications: [], conflictChecks: [] })
    s.firm.state.failNext.set('client', { kind: 'refused', status: 409, code: 'client-exists', clientId: SYNTEGON_ID })
    await s.model.record()
    expect(s.firm.sent.filter(command => command.kind === 'client').map(command => command.clientId)).toEqual([id])
    expect(s.firm.sent.at(-1)).toMatchObject({ kind: 'name', clientId: SYNTEGON_ID })
    expect(s.record().clientId).toBe(SYNTEGON_ID)
  })

  it('shows a refusal of a client that exists under an id it cannot read, or with no id', async () => {
    const s = setup({ clients: [] })
    await toReview(s, 'Syntegon')
    s.firm.state.detailErrors.set(SCHUBERT_ID, { kind: 'network' })
    s.firm.state.failNext.set('client', { kind: 'refused', status: 409, code: 'client-exists', clientId: SCHUBERT_ID })
    await s.model.record()
    expect(s.wizard().recording).toMatchObject({ status: 'failed', error: { code: 'client-exists' } })
    s.firm.state.failNext.set('client', { kind: 'refused', status: 409, code: 'client-exists' })
    await s.model.retry()
    expect(s.wizard().recording).toMatchObject({ status: 'failed', error: { code: 'client-exists' } })
    expect(s.firm.mock.client).not.toHaveBeenCalledWith(undefined)
  })

  it('takes a client that the Firm Record does not know as a new client', async () => {
    const s = setup({ clients: [] })
    await toReview(s, 'Syntegon')
    s.firm.state.detailErrors.set(clientIdOf(s.wizard()), { kind: 'refused', status: 409, code: 'client-unknown' })
    await s.model.record()
    expect(s.firm.sent.map(command => command.kind)).toEqual(['conflict-check', 'client', 'name'])
  })

  it('does nothing while the recording runs, and records nothing from a step that waits', async () => {
    const s = setup({ clients: [] })
    await search(s, 'Syntegon')
    await s.model.record()
    expect(s.firm.sent).toEqual([])
    await toReview(s, 'Syntegon')
    s.firm.mock.send.mockImplementation(() => new Promise(() => {}))
    void s.model.record()
    await settle()
    expect(waitOf(s.wizard(), 'review')).toBe('busy')
    expect(s.wizard().recording).toEqual({ status: 'running', done: 0, total: 3 })
    await s.model.record()
    s.model.setConflict(true, 'x')
    s.model.setRole('watch')
    s.model.edit('role')
    expect(s.wizard()).toMatchObject({ at: 'review', role: 'client', conflict: { checked: false }, recording: { status: 'running' } })
    s.model.close()
    expect(s.view()).toBeNull()
    s.model.setRole('watch')
    s.model.setConflict(true, 'x')
    s.model.setOther('EP1', 'other')
    s.model.tickMatter('EP1', true)
    s.model.byName()
    s.model.back()
    s.model.edit('company')
    await s.model.next()
    await s.model.open('company')
    await s.model.retryDocket()
    expect(s.view()).toBeNull()
  })
})

/** Go to the Review of Syntegon with `count` matters at your firm and the batch size `size`. */
async function toRecord(s: Setup, count: number, size: number) {
  s.host.settings.mockResolvedValue(okHost({ recordBatchSize: size }))
  s.host.matters.mockResolvedValueOnce(okHost(matters(['SYNTEGON'], Array.from({ length: count }, (_, index) => docketRow(`EP23${String(index + 1).padStart(6, '0')}`, { names: ['SYNTEGON'] })))))
  await toReview(s, 'Syntegon')
}

/** The application numbers of the batches that the Firm Record got. */
const sentBatches = (s: Setup) => s.firm.sent.flatMap(command => command.kind === 'applications' ? [command.applications.map(item => item.application.applicationNumber)] : [])

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
    await s.model.retry()
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

describe('checking a client folder for new matters', () => {
  it('reads the client\'s names and opens the Matters step, without the client among the compared clients', async () => {
    const s = setup()
    s.host.matters.mockResolvedValueOnce(okHost(matters(['SYNTEGON TECHNOLOGY'], [docketRow('EP23171862'), docketRow('EP23999999')])))
    await s.model.checkForNew(SYNTEGON_ID)
    expect(s.wizard()).toMatchObject({
      at: 'matters', reached: 'matters', role: 'client', query: 'Syntegon', existing: { clientId: SYNTEGON_ID },
      find: { status: 'found', source: 'patstat', edition: '2026 Spring', names: [{ name: 'SYNTEGON TECHNOLOGY', matching: 600, ticked: true }] },
      group: { name: 'Syntegon', names: [{ name: 'SYNTEGON TECHNOLOGY' }] },
    })
    expect(s.host.matters).toHaveBeenCalledWith(['SYNTEGON TECHNOLOGY'])
    expect(s.host.conflictCheck).toHaveBeenCalledWith({ names: ['SYNTEGON TECHNOLOGY'], clients: [] })
    expect(clientIdOf(s.wizard())).toBe(SYNTEGON_ID)
    await s.model.next()
    await s.model.next()
    await s.model.next()
    await s.model.record()
    // The client, its name and the conflict check of no hit are in the Firm Record already; only the new matter is recorded.
    expect(s.record().applications.map(item => item.fact.applicationNumber)).toEqual(['EP23999999'])
    expect(s.firm.sent.map(command => command.kind)).toEqual(['applications'])
  })

  it('says when the client cannot be read, and goes by name for a client with no linked name', async () => {
    const s = setup({ details: [{ ...SYNTEGON, names: [], conflictChecks: [await hitsHash([])] }] })
    s.firm.state.detailErrors.set(SCHUBERT_ID, { kind: 'malformed', path: 'body' })
    await s.model.checkForNew(SCHUBERT_ID)
    expect(s.model.state.toast).toEqual({ kind: 'failed', error: { kind: 'malformed', path: 'body' } })
    await s.model.checkForNew(SYNTEGON_ID)
    expect(s.wizard()).toMatchObject({ at: 'matters', find: { status: 'by-name' }, check: { status: 'by-name' } })
    expect(s.host.matters).not.toHaveBeenCalled()
    s.model.start()
    expect(s.model.state.toast).toBeNull()
  })

  it('takes a linked name with no source edition or count as it is', async () => {
    const s = setup({ details: [{ ...SYNTEGON, names: [{ name: 'SYNTEGON TECHNOLOGY', source: 'ep-register' }] }] })
    await s.model.checkForNew(SYNTEGON_ID)
    expect(s.wizard().find).toMatchObject({ status: 'found', source: 'ep-register', names: [{ name: 'SYNTEGON TECHNOLOGY', matching: 0 }] })
    expect('edition' in s.wizard().find).toBe(false)
  })

  it('drops a check whose page closed before the client or its docket rows were read', async () => {
    const s = setup()
    const first = s.model.checkForNew(SYNTEGON_ID)
    s.model.close()
    await first
    expect(s.view()).toBeNull()
    const rows = deferred<Awaited<ReturnType<typeof s.host.matters>>>()
    s.host.matters.mockImplementationOnce(() => rows.promise)
    const second = s.model.checkForNew(SYNTEGON_ID)
    await settle()
    s.model.close()
    rows.resolve(okHost(matters(['SYNTEGON TECHNOLOGY'])))
    await second
    expect(s.view()).toBeNull()
    expect(s.host.conflictCheck).not.toHaveBeenCalled()
  })
})

describe('a page that closed while it waited', () => {
  it('drops the answer of a search whose page closed, and a slow search skeleton keeps its shortest time', async () => {
    const s = setup()
    s.host.find.mockImplementationOnce(() => later(200, okHost(found([['X', 1]]))))
    s.model.start()
    s.model.type('X')
    const pending = s.model.find()
    await vi.advanceTimersByTimeAsync(SKELETON_AFTER_MS)
    s.model.close()
    await vi.advanceTimersByTimeAsync(1000)
    await pending
    expect(s.view()).toBeNull()
    expect(s.host.matters).not.toHaveBeenCalled()
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

  it('does not mark a new wizard as recording when the recording of a closed wizard goes on', async () => {
    const s = setup({ clients: [] })
    await toReview(s, 'Syntegon')
    const read = deferred<Awaited<ReturnType<typeof s.firm.record.client>>>()
    s.firm.mock.client.mockImplementationOnce(() => read.promise)
    const pending = s.model.record()
    await settle()
    s.model.close()
    s.model.start()
    read.resolve({ ok: false, error: { kind: 'refused', status: 404, code: null } })
    await pending
    expect(s.wizard()).toMatchObject({ at: 'company', recording: { status: 'idle' } })
  })

  it('writes no answer into a page that the store no longer shows', async () => {
    const s = setup({ clients: [] })
    await search(s, 'Syntegon')
    const answer = deferred<Awaited<ReturnType<typeof s.host.conflictCheck>>>()
    s.host.conflictCheck.mockImplementationOnce(() => answer.promise)
    const pending = s.model.next()
    await settle()
    s.model.store.update((draft) => { draft.view = null })
    answer.resolve(okHost(checked()))
    await pending
    expect(s.view()).toBeNull()
    await toRecord(s, 1, 1)
    const settings = deferred<Awaited<ReturnType<typeof s.host.settings>>>()
    s.host.settings.mockImplementationOnce(() => settings.promise)
    const recording = s.model.record()
    await settle()
    s.model.store.update((draft) => { draft.view = null })
    settings.resolve(okHost({ recordBatchSize: 1 }))
    await recording
    expect(s.view()).toBeNull()
  })

  it('drops the outcome of a recording whose page closed after a failure', async () => {
    const s = setup({ clients: [] })
    await toReview(s, 'Syntegon')
    const sent = deferred<Awaited<ReturnType<typeof s.firm.record.send>>>()
    s.firm.mock.send.mockImplementationOnce(() => sent.promise)
    const pending = s.model.record()
    await settle()
    s.model.close()
    sent.resolve({ ok: false, error: { kind: 'network' } })
    await pending
    expect(s.view()).toBeNull()
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

it('ignores acts that do not belong to the open page', async () => {
  const s = setup()
  s.model.tick('x', true)
  await s.model.retry()
  await s.model.record()
  expect(await s.model.openClientPage()).toBe(false)
  s.model.start()
  s.model.tick('x', true)
  await s.model.retry()
  s.model.back()
  expect(s.wizard()).toMatchObject({ at: 'company', find: { status: 'empty' } })
  // Review has nothing to try again before a recording failed, and Role never has.
  await toReview(s, 'Syntegon', 'watch')
  await s.model.retry()
  expect(s.firm.sent).toEqual([])
  s.model.back()
  await s.model.retry()
  expect(s.wizard().at).toBe('role')
  // A step past Company with no group has no data to read again.
  s.model.store.update((draft) => { draft.view = { ...s.wizard(), at: 'conflict', group: null } })
  await s.model.retry()
  expect(s.host.conflictCheck).toHaveBeenCalledTimes(1)
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

describe('the names of the opponent index', () => {
  it('sends the names of the clients with the role client when the list opens, and nothing when the Firm Record fails', async () => {
    const watched = firmClient(SCHUBERT_ID, 'Gerhard Schubert', 'watch', ['Gerhard Schubert GmbH'])
    const s = setup({ clients: [watched], details: [SYNTEGON] })
    await s.model.refresh()
    expect(s.host.clientNames).toHaveBeenCalledWith(['Syntegon', 'SYNTEGON TECHNOLOGY'])
    expect(s.model.state.clients.map(client => client.name)).toEqual(['Gerhard Schubert', 'Syntegon'])
    s.firm.state.clientsError = { kind: 'network' }
    s.host.clientNames.mockClear()
    await s.model.refresh()
    expect(s.host.clientNames).not.toHaveBeenCalled()
    expect(s.model.state.clients).toHaveLength(2)
  })
})
