// @vitest-environment jsdom
import { useSyncExternalStore } from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { BuildStatus } from '../src/add-client/wire.ts'
import { AddClientPage } from '../src/client/add-client/AddClient.tsx'
import { en } from '../src/client/add-client/locales/index.ts'
import { AddClientModel, type AddClientView, type ReviewView } from '../src/client/add-client/model.ts'
import type { ClientDetail, PartyId } from '../src/client/add-client/records.ts'
import type { KeyHandlers, RecordKey } from '../src/client/keys.ts'
import {
  AS_OF, SCHUBERT_ID, SYNTEGON_ID, buildStatus, fakeHost, fakeRecord, firmClient, found, matter, okHost, reference, registerHit, reviewed,
} from './add-client-fakes.client.ts'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const flush = async () => { for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve() }) }

/** Syntegon, a client of your firm, with one application on which a party of another firm is the opponent. */
const SYNTEGON: ClientDetail = {
  client: firmClient(SYNTEGON_ID, 'Syntegon', 'client', ['SYNTEGON TECHNOLOGY']),
  names: [{ name: 'SYNTEGON TECHNOLOGY', source: 'patstat' }],
  applications: [
    { applicationNumber: 'EP23171862', title: 'Method and apparatus for producing a packaging element', roles: [{ partyId: 'party-1' as PartyId, party: 'Syntegon Technology GmbH', role: 'applicant' }] },
    { applicationNumber: 'EP23709335', roles: [] },
  ],
  conflictChecks: [],
}

const RECORD: RecordKey = { keycaps: [['⇧', '⌘', '↵']], binding: { code: 'Enter', modifiers: ['shift', 'meta'] } }

function mount(start: Parameters<typeof fakeRecord>[0] = { details: [SYNTEGON] }, recordKey: RecordKey = RECORD) {
  const host = fakeHost()
  const firm = fakeRecord(start)
  const opened: string[] = []
  const model = new AddClientModel({ api: host, record: firm.record, open: (id) => { opened.push(id) } })
  const keys: { current: KeyHandlers } = { current: {} }
  function Harness() {
    const state = useSyncExternalStore(listener => model.store.subscribe(listener), () => model.store.getSnapshot())
    return state.view === null
      ? <p>closed</p>
      : <AddClientPage t={makeTranslate(en)} view={state.view} model={model} locale="en" recordKey={recordKey} retryKeycaps={[['R']]}
        setKeys={(handlers) => { keys.current = handlers }} />
  }
  render(<Harness />)
  const set = async (view: AddClientView) => {
    await act(async () => { model.store.update((draft) => { draft.view = view }) })
  }
  return { model, host, firm, opened, keys, set }
}

const button = (name: string | RegExp) => screen.getByRole('button', { name })
const click = async (target: Element) => {
  fireEvent.click(target)
  await flush()
}
const field = () => screen.getByRole('searchbox', { name: en['find.field'] })

/** Search a company and go to its review. */
async function review(s: ReturnType<typeof mount>, name: string, answer = reviewed()) {
  s.host.find.mockResolvedValueOnce(okHost(found([[name.toUpperCase(), 57], [`${name.toUpperCase()} AG`, 3]])))
  s.host.review.mockResolvedValueOnce(okHost(answer))
  act(() => { s.model.start() })
  fireEvent.change(field(), { target: { value: name } })
  fireEvent.keyDown(field(), { key: 'Enter' })
  await flush()
  await click(button(en['act.continue']))
}

describe('page 1: find the company', () => {
  it('starts empty, searches on Enter, proposes the group with its source, and continues with the ticked names', async () => {
    const s = mount({ clients: [] })
    act(() => { s.model.start() })
    expect(screen.getByRole('heading', { level: 1, name: en.title })).toBeTruthy()
    expect(screen.getByText(en['find.empty.title'])).toBeTruthy()
    expect(screen.getByText(en['find.privacy'])).toBeTruthy()
    expect((button(en['act.continue']) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.keyDown(field(), { key: 'a' })
    s.host.find.mockResolvedValueOnce(okHost(found([['SYNTEGON TECHNOLOGY', 600], ['SYNTEGON POUCH SYSTEMS', 12]], { truncated: true })))
    fireEvent.change(field(), { target: { value: 'Syntegon' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    await flush()
    expect(screen.getByText(en['find.group.title'], { selector: 'h2' })).toBeTruthy()
    expect(screen.getByText('2 of 2 names · 612 applications')).toBeTruthy()
    expect(screen.getByText('Applicant name in PATSTAT')).toBeTruthy()
    expect(screen.getByText(/^Source: PATSTAT 2026 Spring, .*European Patent Organisation\.$/)).toBeTruthy()
    expect(screen.getByText(en['find.truncated'])).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Keep SYNTEGON POUCH SYSTEMS in the client group' }))
    expect(screen.getByText('1 of 2 names · 600 applications')).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Keep SYNTEGON TECHNOLOGY in the client group' }))
    expect((button(en['act.continue']) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Keep SYNTEGON TECHNOLOGY in the client group' }))
    await click(button(en['act.continue']))
    expect(s.host.review).toHaveBeenCalledWith({ names: ['SYNTEGON TECHNOLOGY'], clients: [] })
    expect(screen.getByRole('heading', { level: 1, name: 'Syntegon' })).toBeTruthy()
  })

  it('shows the skeleton while the search runs, and the register as the source of its names', async () => {
    const s = mount({ clients: [] })
    act(() => { s.model.start() })
    await s.set({ page: 'find', query: 'Syntegon', find: { status: 'loading', skeleton: true }, existing: null })
    expect(screen.getByRole('status', { name: en['find.loading'] })).toBeTruthy()
    await s.set({ page: 'find', query: 'Syntegon', existing: null, find: { status: 'group', source: 'ep-register', asOf: AS_OF, truncated: false, names: [{ name: 'SYNTEGON TECHNOLOGY GMBH', applications: 1234, ticked: true }] } })
    expect(screen.getByText(en['find.col.register'])).toBeTruthy()
    expect(screen.getByText(en['find.col.epApplications'])).toBeTruthy()
    expect(screen.getByText('1,234')).toBeTruthy()
    expect(screen.getByText(/^Source: EP Register, as of Nov 8, 2026/)).toBeTruthy()
    await s.set({ page: 'find', query: 'Syntegon', find: { status: 'loading', skeleton: false }, existing: null })
    expect(screen.queryByRole('status', { name: en['find.loading'] })).toBeNull()
  })

  it('says who added an existing client and how many names are new', async () => {
    const s = mount()
    act(() => { s.model.start() })
    const group = { status: 'group' as const, source: 'patstat' as const, asOf: AS_OF, truncated: false, names: [{ name: 'SYNTEGON TECHNOLOGY', applications: 600, ticked: true }, { name: 'SYNTEGON POUCH SYSTEMS', applications: 12, ticked: true }] }
    await s.set({ page: 'find', query: 'Syntegon', find: group, existing: SYNTEGON.client })
    expect(screen.getByText('Syntegon is already a client of your firm.')).toBeTruthy()
    expect(screen.getByText(/^Dr\. Anna Becker added it on Nov 1, 2026\./)).toBeTruthy()
    expect(screen.getByText(en['find.existing.group'], { selector: 'h2' })).toBeTruthy()
    expect(screen.getByText('2 names, 1 new')).toBeTruthy()
    expect(screen.queryByText(en['find.group.hint'])).toBeNull()
    await s.set({ page: 'find', query: 'Syntegon', find: { ...group, names: group.names.slice(0, 1) }, existing: { ...firmClient(SCHUBERT_ID, 'Syntegon', 'watch', ['SYNTEGON TECHNOLOGY']), addedBy: { id: null, name: null } } })
    expect(screen.getByText('Syntegon is already on your Watch list.')).toBeTruthy()
    expect(screen.getByText(/^It was added on Nov 1, 2026\./)).toBeTruthy()
    expect(screen.getByText('1 names, no new name')).toBeTruthy()
  })

  it('offers Try again and Add by name only when the data plugin fails, and says when there is no key or no plugin', async () => {
    const s = mount({ clients: [] })
    act(() => { s.model.start() })
    fireEvent.change(field(), { target: { value: 'Neue GmbH' } })
    s.host.find.mockResolvedValueOnce({ ok: false, error: 'unreachable' })
    fireEvent.keyDown(field(), { key: 'Enter' })
    await flush()
    expect(screen.getByRole('alert').textContent).toContain(en['find.error.lead'])
    expect(screen.getByText('You can also add Neue GmbH by name only. The folder then starts with the template folders, and you load its matters later.')).toBeTruthy()
    expect(s.keys.current.retry).toBeTypeOf('function')
    s.host.find.mockResolvedValueOnce({ ok: false, error: 'no-key' })
    await click(button(/Try again/))
    expect(screen.getByRole('alert').textContent).toContain(en['find.noKey.title'])
    expect(s.keys.current.retry).toBeUndefined()
    s.host.find.mockResolvedValueOnce(okHost({ status: 'no-plugin' }))
    fireEvent.keyDown(field(), { key: 'Enter' })
    await flush()
    expect(screen.getByText(en['find.plugin.title'])).toBeTruthy()
    expect((button(en['act.continue']) as HTMLButtonElement).disabled).toBe(false)
    await s.set({ page: 'find', query: 'Neue GmbH', find: { status: 'no-key' }, existing: null })
    await click(button(en['act.byName']))
    expect(screen.getByText(en['review.byName'])).toBeTruthy()
    expect(s.host.review).not.toHaveBeenCalled()
  })

  it('goes back to the Clients list from the location', async () => {
    const s = mount()
    act(() => { s.model.start() })
    await click(button(en['crumbs.clients']))
    expect(screen.getByText('closed')).toBeTruthy()
  })
})

describe('pages 2 and 3: review and decide', () => {
  it('shows your matters, the reference list with This is ours, no conflict, and records the client with its key', async () => {
    const s = mount({ clients: [] })
    const others = Array.from({ length: 12 }, (_, index) => reference(`EP2316501${index.toString().padStart(1, '0')}`.slice(0, 10), { town: index === 0 ? undefined : 'Onex', filed: index === 1 ? undefined : '2023-03-29' }))
    await review(s, 'Syntegon', reviewed({
      truncated: true,
      atFirm: [matter('EP23171862'), matter('EP25712875', { publicationNumber: undefined, representativeSince: undefined })],
      atOtherFirms: others.map((row, index) => ({ ...row, applicationNumber: `EP231650${(10 + index).toString()}`, ...(index === 0 ? { publicationNumber: 'EP4250000A1' } : {}) })),
    }))
    expect(screen.getByText('2 EP matters at your firm')).toBeTruthy()
    expect(screen.getByText(/^2 applicant names · at least 272 EP applications in the EP Register, as of Nov 8, 2026/)).toBeTruthy()
    const mine = screen.getByRole('table', { name: en['mine.title'] })
    expect(within(mine).getByText('EP 23 171 862')).toBeTruthy()
    expect(within(mine).getByText('EP 4 292 805 A1')).toBeTruthy()
    expect(within(mine).getByText(en['mine.notYet'])).toBeTruthy()
    expect(within(mine).getByText('Jul 24, 2024')).toBeTruthy()
    expect(screen.getByText(/The applicant of all 2 is Syntegon Technology GmbH\.$/)).toBeTruthy()
    expect(screen.getByText(en['conflict.none'])).toBeTruthy()
    expect(screen.getByText(/^None of the 2 names is the other side/)).toBeTruthy()
    expect(screen.getByText('12 · for reference')).toBeTruthy()
    await click(button(en['act.showList']))
    const refs = screen.getByRole('table', { name: en['group.atOther'] })
    expect(within(refs).getAllByRole('button', { name: en['act.ours'] })).toHaveLength(10)
    expect(within(refs).getByText(en['ref.noTown'])).toBeTruthy()
    await click(within(refs).getByRole('button', { name: '2 more' }))
    expect(within(refs).getAllByRole('button', { name: en['act.ours'] })).toHaveLength(12)
    await click(within(refs).getAllByRole('button', { name: en['act.ours'] })[0]!)
    expect(screen.getByText('3 EP matters at your firm')).toBeTruthy()
    expect(within(mine).getByText(en['mine.claimed'])).toBeTruthy()
    expect(screen.getByText('11 · for reference')).toBeTruthy()
    expect(within(mine).getByText('EP 4 250 000 A1')).toBeTruthy()
    await click(within(mine).getByRole('button', { name: en['act.notOurs'] }))
    await click(screen.getAllByRole('button', { name: en['act.ours'] })[1]!)
    expect(within(mine).getAllByText(en['mine.notYet'])).toHaveLength(2)
    await click(button(en['act.hideList']))
    expect(screen.queryByRole('table', { name: en['group.atOther'] })).toBeNull()
    const bar = screen.getByRole('region', { name: en['decision.yours'] })
    expect(within(bar).getByText('Add Syntegon as a client of your firm?')).toBeTruthy()
    expect(within(bar).getByText('3 at your firm')).toBeTruthy()
    expect(within(bar).getByText('FlowLeap then builds the folder with 3 matters.')).toBeTruthy()
    expect(within(bar).getByText('⇧⌘↵')).toBeTruthy()
    fireEvent.keyDown(screen.getByTestId('add-client'), { code: 'Enter', key: 'Enter', metaKey: true })
    await flush()
    expect(s.firm.sent).toEqual([])
    fireEvent.keyDown(screen.getByTestId('add-client'), { code: 'Enter', key: 'Enter', metaKey: true, shiftKey: true })
    await flush()
    expect(s.firm.sent[0]).toMatchObject({ kind: 'conflict-check', hits: [] })
    expect(screen.getByRole('heading', { level: 1, name: 'Building the Syntegon folder' })).toBeTruthy()
  })

  it('blocks Add client until the conflict is checked with a reason, and words the evidence', async () => {
    const s = mount()
    await review(s, 'Gerhard Schubert', reviewed({ total: 57, conflicts: [registerHit(SYNTEGON_ID)] }))
    expect(screen.getByText(/^1 possible conflict$/, { selector: 'span' })).toBeTruthy()
    expect(screen.getByText('Gerhard Schubert GmbH is the other side of your client Syntegon in EP 16 188 900.')).toBeTruthy()
    expect(screen.getByText('EP 16 188 900 · EP 3 296 081 B1 · Method and device for producing tubular bags')).toBeTruthy()
    expect(screen.getByText('Syntegon Packaging Systems AG, a company of your client Syntegon')).toBeTruthy()
    expect(screen.getByText('Jan 8, 2025')).toBeTruthy()
    expect(screen.getByText('Patent revoked')).toBeTruthy()
    expect(screen.getByText(en['mine.empty.title'])).toBeTruthy()
    const primary = () => button(new RegExp(`^${en['primary.client']}`)) as HTMLButtonElement
    expect(primary().disabled).toBe(true)
    fireEvent.keyDown(screen.getByTestId('add-client'), { code: 'Enter', key: 'Enter', metaKey: true, shiftKey: true })
    await flush()
    expect(s.firm.sent).toEqual([])
    expect(screen.getByRole('note').textContent).toBe(en['blocked.conflict'])
    expect(screen.getByText(en['part.conflict.open'])).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.change(screen.getByRole('textbox', { name: en['conflict.reason'] }), { target: { value: 'The opposition is closed.' } })
    expect(primary().disabled).toBe(false)
    expect(screen.getByText(en['part.conflict.checked'])).toBeTruthy()
    expect(screen.getByText(en['note.clientEmpty'])).toBeTruthy()
    s.firm.state.failNext.set('conflict-check', { kind: 'refused', status: 403, code: 'not-allowed-to-decide-conflict' })
    await click(primary())
    expect(screen.getByRole('alert').textContent).toContain(en['refusal.not-allowed-to-decide-conflict'])
    s.firm.state.failNext.set('conflict-check', { kind: 'network' })
    await act(async () => { s.keys.current.retry?.() })
    await flush()
    expect(screen.getByRole('alert').textContent).toContain(en['error.network'])
    await click(within(screen.getByRole('alert')).getByRole('button', { name: /Try again/ }))
    expect(screen.getByRole('heading', { level: 1, name: 'Building the Gerhard Schubert folder' })).toBeTruthy()
  })

  it('words several hits, a hit of a client it cannot name, and the hits of the Firm Record', async () => {
    const detail: ClientDetail = {
      ...SYNTEGON,
      applications: [{ applicationNumber: 'EP23171862', publicationNumber: 'EP4292805A1', roles: [{ partyId: 'party-2' as PartyId, party: 'GERHARD SCHUBERT', role: 'opponent' }] }],
    }
    const s = mount({ details: [detail] })
    await review(s, 'Gerhard Schubert', reviewed({ conflicts: [registerHit(SCHUBERT_ID, { opposedOn: undefined, status: undefined, publicationNumber: undefined, title: undefined })] }))
    expect(screen.getByText('Names of the group are the other side of your clients in 2 applications.')).toBeTruthy()
    expect(screen.getByText('2 possible conflicts', { selector: 'span' })).toBeTruthy()
    expect(screen.getByText(/^Firm Record, as of/)).toBeTruthy()
    expect(screen.getAllByText('Syntegon Packaging Systems AG')).toHaveLength(1)
    expect(screen.queryByText(en['fact.opposed'])).toBeNull()
    await s.set({ ...(s.model.state.view as ReviewView), review: { status: 'by-name' } })
    expect(screen.getByText('GERHARD SCHUBERT is the other side of your client Syntegon in EP 23 171 862.')).toBeTruthy()
    expect(screen.getByText(en['conflict.byName.lead'])).toBeTruthy()
    expect(screen.getByText(en['conflict.checkSelf'])).toBeTruthy()
    await s.set({ ...(s.model.state.view as ReviewView), firm: { status: 'ready', details: [], asOf: AS_OF }, review: { status: 'reviewed', claimed: [], answer: reviewed({ conflicts: [registerHit(SCHUBERT_ID)] }) } })
    expect(screen.getByText('Gerhard Schubert GmbH is the other side of your client Syntegon Packaging Systems AG in EP 16 188 900.')).toBeTruthy()
  })

  it('says when the Firm Record or the register cannot be read, and goes on by name', async () => {
    const s = mount()
    s.firm.state.clientsError = { kind: 'unavailable' }
    s.host.review.mockResolvedValueOnce({ ok: false, error: 'unreachable' })
    s.host.find.mockResolvedValueOnce(okHost(found([['X', 1]])))
    act(() => { s.model.start() })
    fireEvent.change(field(), { target: { value: 'X' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    await flush()
    await click(button(en['act.continue']))
    const alerts = screen.getAllByRole('alert').map(alert => alert.textContent)
    expect(alerts[0]).toContain(`${en['review.error.lead']} ${en['host.unreachable']}`)
    expect(alerts[1]).toContain(en['error.unavailable'])
    expect(screen.getByRole('note').textContent).toBe(en['blocked.firm'])
    expect(screen.getByText(/^1 applicant name$/)).toBeTruthy()
    s.firm.state.clientsError = null
    s.host.review.mockResolvedValueOnce({ ok: false, error: 'no-key' })
    await click(screen.getAllByRole('button', { name: /Try again/ })[0]!)
    expect(screen.getByRole('alert').textContent).toContain(en['review.noKey.lead'])
    expect(screen.getByRole('note').textContent).toBe(en['blocked.review'])
    await click(button(en['act.byName']))
    expect(screen.getByText(en['part.mattersByName'])).toBeTruthy()
    await s.set({ ...(s.model.state.view as ReviewView), firm: { status: 'error', error: { kind: 'network' } } })
    await click(within(screen.getByRole('alert')).getByRole('button', { name: /Try again/ }))
    expect(screen.queryByRole('alert')).toBeNull()
    // By name only, FlowLeap read no EP opposition: the person checks conflicts and writes how.
    expect(screen.queryByText(/^The name is not the other side/)).toBeNull()
    expect(screen.getByText(en['conflict.byName.lead'])).toBeTruthy()
    expect(screen.getByText(en['part.conflictByName'])).toBeTruthy()
    expect(screen.getByRole('note').textContent).toBe(en['blocked.self-check'])
    const primary = () => button(new RegExp(`^${en['primary.client']}`)) as HTMLButtonElement
    expect(primary().disabled).toBe(true)
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(en['conflict.checkSelf']) }))
    fireEvent.change(screen.getByRole('textbox', { name: en['conflict.reason'] }), { target: { value: 'Asked the partners.' } })
    expect(screen.getByText(en['part.conflict.checked'])).toBeTruthy()
    s.firm.state.failNext.set('conflict-check', { kind: 'refused', status: 409, code: 'idempotency-key-reused' })
    await click(primary())
    expect(screen.getByRole('alert').textContent).toContain(en['refusal.idempotency-key-reused'])
    await click(within(screen.getByRole('alert')).getByRole('button', { name: /Try again/ }))
    expect(s.firm.sent[0]).toMatchObject({ kind: 'conflict-check', hits: [], reason: 'Asked the partners.' })
  })

  it('warns when the conflict check can be incomplete, and blocks a name that no folder can have', async () => {
    const s = mount()
    await review(s, 'Gerhard Schubert', reviewed({ conflictsTruncated: true }))
    expect(screen.getByText(en['conflict.truncated'])).toBeTruthy()
    expect(screen.getByText(en['conflict.none'])).toBeTruthy()
    await s.set({ ...(s.model.state.view as ReviewView), review: { status: 'reviewed', claimed: [], answer: reviewed({ conflictsTruncated: true, conflicts: [registerHit(SYNTEGON_ID)] }) } })
    expect(screen.getByText(en['conflict.truncated'])).toBeTruthy()
    expect(screen.getByText(en['conflict.check'])).toBeTruthy()
    const view = s.model.state.view as ReviewView
    await s.set({ ...view, subject: { ...view.subject, name: 'CON' } })
    expect(screen.getByRole('note').textContent).toBe(en['blocked.name'])
  })

  it('shows the zero-matter state, the empty firm identity, and the loading states', async () => {
    const s = mount()
    const clients = new Promise<never>(() => {})
    await review(s, 'Syntegon', reviewed({ identity: 'missing', total: 1 }))
    expect(screen.getByText(en['mine.identity'])).toBeTruthy()
    expect(screen.getByText(/^None of the 1 EP applications/)).toBeTruthy()
    s.firm.mock.clients.mockReturnValueOnce(clients)
    await act(async () => { void s.model.checkForNew(SYNTEGON_ID) })
    await flush()
    expect(screen.getByRole('status', { name: en['review.loading'] })).toBeTruthy()
    expect(screen.getByText(en['conflict.loading'])).toBeTruthy()
    expect(screen.getByText(en['part.matters.waiting'])).toBeTruthy()
    expect(screen.getByText(en['part.conflict.waiting'])).toBeTruthy()
  })

  it('adds a company to Watch, says what Watch follows, and keeps no folder', async () => {
    const s = mount()
    await review(s, 'Gerhard Schubert')
    fireEvent.click(screen.getByRole('tab', { name: en['role.watch'] }))
    await flush()
    expect(screen.getByText(en['watch.title'])).toBeTruthy()
    expect(screen.getByText('that Gerhard Schubert files or receives.')).toBeTruthy()
    expect(screen.getByText(en['part.folder.none'])).toBeTruthy()
    expect(screen.getByText(en['note.watch'])).toBeTruthy()
    await click(button(new RegExp(`^${en['primary.watch']}`)))
    expect(screen.getByText('closed')).toBeTruthy()
    expect(s.model.state.toast).toEqual({ kind: 'watch', name: 'Gerhard Schubert' })
  })

  it('links another party to a matter that the person finds and picks, with its role', async () => {
    const s = mount()
    await review(s, 'Gerhard Schubert')
    fireEvent.click(screen.getByRole('tab', { name: en['role.other-party'] }))
    await flush()
    expect(screen.getByRole('note').textContent).toBe(en['blocked.matter'])
    const list = screen.getByRole('listbox', { name: en['other.find'] })
    expect(within(list).getAllByRole('option')).toHaveLength(2)
    expect(within(list).getByText('Syntegon')).toBeTruthy()
    fireEvent.change(screen.getByRole('searchbox', { name: en['other.find'] }), { target: { value: 'nothing here' } })
    expect(within(list).getByText(en['other.none'])).toBeTruthy()
    fireEvent.change(screen.getByRole('searchbox', { name: en['other.find'] }), { target: { value: 'packaging 23 171' } })
    await click(within(list).getByRole('option'))
    fireEvent.click(screen.getByRole('tab', { name: en['other.role.licensee'] }))
    await flush()
    expect(screen.getByText('EP 23 171 862 · Licensee')).toBeTruthy()
    expect(screen.getByText(en['note.other'])).toBeTruthy()
    fireEvent.keyDown(screen.getByTestId('add-client'), { code: 'Enter', key: 'Enter', metaKey: true, shiftKey: true })
    await flush()
    expect(s.model.state.toast).toEqual({ kind: 'party', name: 'Gerhard Schubert', applicationNumber: 'EP23171862' })
  })

  it('says when the Firm Record has no matter to link or cannot be read for the picker', async () => {
    const s = mount({ clients: [] })
    await review(s, 'Gerhard Schubert')
    fireEvent.click(screen.getByRole('tab', { name: en['role.other-party'] }))
    await flush()
    expect(screen.getByText(en['other.empty'])).toBeTruthy()
    const view = s.model.state.view as ReviewView
    await s.set({ ...view, firm: { status: 'loading' } })
    expect(screen.getByText(en['conflict.loading'])).toBeTruthy()
    await s.set({ ...view, firm: { status: 'error', error: { kind: 'malformed', path: 'body' } } })
    expect(screen.getByRole('alert').textContent).toContain(en['error.malformed'])
    await click(button(/Try again/))
    expect(screen.getByText(en['other.empty'])).toBeTruthy()
  })

  it('shows the progress of a recording, and closes on Cancel', async () => {
    const s = mount()
    await review(s, 'Gerhard Schubert')
    const view = s.model.state.view as ReviewView
    await s.set({ ...view, recording: { status: 'running', done: 1, total: 3 } })
    expect(screen.getByText('Recording 1 of 3')).toBeTruthy()
    await s.set({ ...view, recording: { status: 'failed', error: { kind: 'refused', status: 409, code: null } } })
    expect(screen.getByRole('alert').textContent).toContain(en['refusal.other'])
    await click(button(en['act.cancel']))
    expect(screen.getByText('closed')).toBeTruthy()
  })

  it('shows no key on the primary act when the app command has none', async () => {
    const s = mount({ clients: [] }, { keycaps: [], binding: null })
    await review(s, 'Syntegon')
    expect(screen.queryByText('⇧⌘↵')).toBeNull()
  })
})

describe('page 4: the build', () => {
  const view = (status: BuildStatus | null, extra: Partial<Extract<AddClientView, { page: 'build' }>> = {}): AddClientView => ({
    page: 'build', clientId: SYNTEGON_ID, name: 'Syntegon', request: null, recorded: { names: 8, matters: 16, hits: 0 }, status, error: null, ...extra,
  })
  const step = (state: BuildStatus['steps']['folder']['state'], done = 0, total = 0, failed: string[] = []) => ({ state, done, total, failed })

  it('reads the build, then shows the records and the step that runs', async () => {
    const s = mount()
    await s.set(view(null))
    expect(screen.getByRole('status', { name: en['build.loading'] })).toBeTruthy()
    await s.set(view(buildStatus(SYNTEGON_ID, 'Syntegon')))
    expect(screen.getByText('Recorded Syntegon as a client, with its 8 applicant names')).toBeTruthy()
    expect(screen.getByText(en['part.conflict.none'])).toBeTruthy()
    expect(screen.getByText('Recorded 16 matters with their application numbers')).toBeTruthy()
    expect(screen.getByText(en['build.folder.done'])).toBeTruthy()
    expect(screen.getByText('Making 15 family folders and 16 matter folders')).toBeTruthy()
    expect(screen.getByText('9 / 16')).toBeTruthy()
    expect(screen.getByText(en['build.data.next'])).toBeTruthy()
    expect(screen.getByText(en['build.reference.next'])).toBeTruthy()
    expect((button(en['act.openFolder']) as HTMLButtonElement).disabled).toBe(true)
    await s.set(view(buildStatus(SYNTEGON_ID, 'Syntegon', {
      families: 1, matters: 1,
      steps: { 'folder': step('running'), 'matters': step('done', 1, 1), 'public-data': step('running', 3, 4), 'reference': step('done', 1, 1) },
    }), { recorded: null }))
    expect(screen.getByText('Recorded Syntegon as a client')).toBeTruthy()
    expect(screen.getByText('Recorded 1 matter with their application numbers')).toBeTruthy()
    expect(screen.getByText(en['build.folder.now'])).toBeTruthy()
    expect(screen.getByText('Made 1 family folder and 1 matter folder')).toBeTruthy()
    expect(screen.getByText(en['build.data.now'])).toBeTruthy()
    expect(screen.getByText(en['build.reference.done'])).toBeTruthy()
    await s.set(view(buildStatus(SYNTEGON_ID, 'Syntegon', { matters: 0, steps: { 'folder': step('done'), 'matters': step('done'), 'public-data': step('done'), 'reference': step('running') } }), { recorded: { names: 0, matters: 0, hits: 2 } }))
    expect(screen.getByText('2 possible conflicts')).toBeTruthy()
    expect(screen.queryByText(/with their application numbers/)).toBeNull()
    expect(screen.getByText(en['build.data.done'])).toBeTruthy()
    expect(screen.getByText(en['build.reference.now'])).toBeTruthy()
  })

  it('says what failed and that the rest is done, opens the folder, and Try again builds again', async () => {
    const s = mount()
    await s.set(view(buildStatus(SYNTEGON_ID, 'Syntegon', {
      state: 'failed', workspace: 'ws-syntegon',
      steps: { 'folder': step('done', 1, 1), 'matters': step('done', 16, 16), 'public-data': step('failed', 61, 64, ['EP4820737A1', 'EP4820738A1', 'EP4834776A1']), 'reference': step('failed') },
    })))
    expect(screen.getByRole('alert').textContent).toContain('3 publications could not be read.')
    expect(screen.getByText('Wrote the public data as dated files, except 3')).toBeTruthy()
    expect(screen.getByText('The EPO did not answer for EP 4 820 737 A1, EP 4 820 738 A1, EP 4 834 776 A1.')).toBeTruthy()
    expect(screen.getByText(en['build.step.failed'])).toBeTruthy()
    expect(s.keys.current.retry).toBeTypeOf('function')
    await click(button(/Try again/))
    expect(s.host.build).toHaveBeenCalledTimes(1)
    await s.set(view(buildStatus(SYNTEGON_ID, 'Syntegon', { state: 'failed', workspace: 'ws-syntegon', steps: { 'folder': step('failed'), 'matters': step('waiting'), 'public-data': step('waiting'), 'reference': step('waiting') } })))
    expect(screen.getByRole('alert').textContent).toContain(en['build.failed.step'])
    await s.set(view(buildStatus(SYNTEGON_ID, 'Syntegon', { state: 'interrupted', workspace: 'ws-syntegon' })))
    expect(screen.getByRole('alert').textContent).toContain(en['build.failed.interrupted'])
    await click(button(en['act.openFolder']))
    expect(s.opened).toEqual(['ws-syntegon'])
  })

  it('words a failed start of the build and a failed read of its client', async () => {
    const s = mount()
    await s.set(view(null, { error: 'unreachable', recorded: null }))
    expect(screen.getByRole('alert').textContent).toBe(`${en['host.unreachable']} ${en['build.failed.start']}Try againR`)
    await s.set(view(null, { error: { kind: 'service', status: 502 } }))
    expect(screen.getByRole('alert').textContent).toContain(en['error.service'])
  })
})
