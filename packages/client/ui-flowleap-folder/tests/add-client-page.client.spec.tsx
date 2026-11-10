// @vitest-environment jsdom
import { useSyncExternalStore } from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { DocketState } from '../src/add-client/wire.ts'
import { AddClientPage } from '../src/client/add-client/AddClient.tsx'
import { asOfText } from '../src/client/add-client/format.ts'
import { en } from '../src/client/add-client/locales/index.ts'
import { splitBatches, type RecordBatch } from '../src/client/add-client/batches.ts'
import { AddClientModel, type AddClientView, type RecordView } from '../src/client/add-client/model.ts'
import type { ApplicationDecision } from '../src/client/add-client/plan.ts'
import type { ClientDetail, PartyId } from '../src/client/add-client/records.ts'
import type { WizardView } from '../src/client/add-client/wizard.ts'
import type { KeyHandlers, RecordKey } from '../src/client/keys.ts'
import {
  AS_OF, SCHUBERT_ID, SYNTEGON_ID, checked, docketRow, fakeHost, fakeRecord, firmClient, found, matters, okHost, others, registerHit,
  wizardView,
} from './add-client-fakes.client.ts'

afterEach(() => { cleanup() })

const flush = async () => { for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve() }) }

/** Syntegon, a client of your firm, with one application that Gerhard Schubert GmbH opposed. */
const SYNTEGON: ClientDetail = {
  client: firmClient(SYNTEGON_ID, 'Syntegon', 'client', ['SYNTEGON TECHNOLOGY']),
  names: [{ name: 'SYNTEGON TECHNOLOGY', source: 'patstat' }],
  applications: [
    { applicationNumber: 'EP23171862', title: 'Method and apparatus for producing a packaging element', roles: [{ partyId: 'party-1' as PartyId, party: 'Syntegon Technology GmbH', role: 'applicant' }] },
    { applicationNumber: 'EP23709335', roles: [] },
  ],
  conflictChecks: [],
}

const READY_DOCKET: DocketState = { state: 'ready', rows: 412, asOf: AS_OF }

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
  const wizard = () => model.state.view as WizardView
  return { model, host, firm, opened, keys, set, wizard }
}

type Mounted = ReturnType<typeof mount>

const button = (name: string | RegExp) => screen.getByRole('button', { name })
const disabled = (name: string | RegExp) => (button(name) as HTMLButtonElement).disabled
const click = async (target: Element) => {
  fireEvent.click(target)
  await flush()
}
const field = () => screen.getByRole('searchbox', { name: en['find.field'] })
const heading = () => screen.getByRole('heading', { level: 1 }).textContent
const note = () => document.querySelector('footer > span')?.textContent
const waiting = () => screen.queryByRole('note')?.textContent ?? null
const steps = () => within(screen.getByRole('list', { name: en['steps.label'] })).getAllByRole('listitem').map(item => item.textContent)
const links = () => within(screen.getByRole('list', { name: en['steps.label'] })).queryAllByRole('button').map(item => item.textContent?.replace(/^\d/, '').replace(/,.*$/, ''))
const recordKey = () => { fireEvent.keyDown(screen.getByTestId('add-client'), { code: 'Enter', key: 'Enter', metaKey: true, shiftKey: true }) }
const docket = (state: DocketState, fields: Partial<Extract<WizardView['docket'], { status: 'read' }>> = {}): WizardView['docket'] => ({ status: 'read', docket: state, counts: [], rows: [], ...fields })

/** Open Add client and search a company with Enter. */
async function search(s: Mounted, name: string, names: [string, number][] = [[name.toUpperCase(), 57]]) {
  s.host.find.mockResolvedValueOnce(okHost(found(names)))
  act(() => { s.model.start() })
  fireEvent.change(field(), { target: { value: name } })
  fireEvent.keyDown(field(), { key: 'Enter' })
  await flush()
}

describe('the frame of the wizard', () => {
  it('shows the location, the stepper with the open step, and goes back to the Clients list', async () => {
    const s = mount()
    act(() => { s.model.start() })
    expect(screen.getByRole('navigation', { name: en['crumbs.label'] }).textContent).toBe('Clients›Add client')
    expect(steps()).toEqual(['1Company, current step', '2Matters, not yet', '3Role, not yet', '4Conflict check, not yet', '5Review, not yet'])
    expect(links()).toEqual([])
    expect(screen.queryByRole('button', { name: en['act.back'] })).toBeNull()
    await click(button(en['crumbs.clients']))
    expect(screen.getByText('closed')).toBeTruthy()
  })

  it('names the company in the location once the group is confirmed, and Cancel closes the wizard', async () => {
    const s = mount()
    await s.set(wizardView({ at: 'role' }))
    expect(screen.getByRole('navigation', { name: en['crumbs.label'] }).textContent).toBe('Clients›Add client›Syntegon')
    await click(button(en['act.cancel']))
    expect(screen.getByText('closed')).toBeTruthy()
  })

  it('links the reached steps in the stepper, marks an open conflict blocked, and opens a step', async () => {
    const s = mount({ details: [SYNTEGON] })
    await s.set(wizardView({ at: 'role', check: { status: 'checked', answer: checked([registerHit(SYNTEGON_ID)]) }, firm: { status: 'ready', details: [SYNTEGON], asOf: AS_OF } }))
    expect(steps()).toEqual(['Company, done', 'Matters, done', '3Role, current step', 'Conflict check, blocked', '5Review, not yet'])
    expect(links()).toEqual(['Company', 'Matters', 'Conflict check', 'Review'])
    await click(within(screen.getByRole('list', { name: en['steps.label'] })).getByRole('button', { name: /^Matters/ }))
    expect(s.wizard().at).toBe('matters')
    await s.set(wizardView({ role: 'watch', at: 'review' }))
    expect(steps()).toEqual(['Company, done', 'Matters, done', 'Role, done', '4Review, current step'])
  })
})

describe('a wizard with no confirmed group', () => {
  it('shows each later step without a company name', async () => {
    const s = mount()
    await s.set(wizardView({ at: 'matters', group: null }))
    expect(heading()).toBe(': 0 EP applications at your firm')
    expect(screen.getByText(en['matters.byName'])).toBeTruthy()
    await s.set(wizardView({ at: 'role', group: null }))
    expect(heading()).toBe('The role of ')
    await s.set(wizardView({ at: 'conflict', group: null }))
    expect(heading()).toBe('Conflict check for ')
    expect(screen.getByText(en['conflict.noneBodyOne'])).toBeTruthy()
    await s.set(wizardView({ at: 'matter', role: 'other-party', group: null }))
    expect(heading()).toBe('The matter of ')
    await s.set(wizardView({ at: 'review', role: 'watch', group: null }))
    expect(note()).toBe('FlowLeap puts  on the Watch list. It adds no client.')
  })
})

describe('step 1: Company', () => {
  it('starts empty, searches on Enter, proposes the group with its counts, and goes on with the ticked names', async () => {
    const s = mount({ clients: [] })
    act(() => { s.model.start() })
    expect(heading()).toBe(en['company.title'])
    expect(screen.getByText(en['find.empty.title'])).toBeTruthy()
    expect(screen.getByText(en['find.privacy'])).toBeTruthy()
    expect(disabled(en['act.next'])).toBe(true)
    expect(waiting()).toBe(en['wait.type'])
    fireEvent.keyDown(field(), { key: 'a' })
    s.host.matters.mockResolvedValueOnce(okHost(matters(['SYNTEGON TECHNOLOGY', 'SYNTEGON POUCH SYSTEMS'], [docketRow('EP23171862'), docketRow('EP23000002')])))
    await search(s, 'Syntegon', [['SYNTEGON TECHNOLOGY', 600], ['SYNTEGON POUCH SYSTEMS', 12_000]])
    expect(screen.getByText(en['find.group.title'], { selector: 'h2' })).toBeTruthy()
    expect(screen.getByText('2 of 2 names')).toBeTruthy()
    expect(screen.getByText('Applicant name in PATSTAT')).toBeTruthy()
    const table = screen.getByRole('table', { name: en['find.group.title'] })
    expect(within(table).getAllByRole('row').slice(1).map(row => within(row).getAllByRole('cell').map(cell => cell.textContent))).toEqual([
      ['SYNTEGON TECHNOLOGY', 'At your firm 2', '600'],
      ['SYNTEGON POUCH SYSTEMS', 'At your firm 0', '12,000+'],
    ])
    const source = screen.getByText(/^At your firm: your firm’s EP docket\./).textContent
    expect(source).toContain(en['find.source.capped'])
    expect(source).toContain('FlowLeap found these names in your docket and in a register sample of 5,000 rows')
    expect(source).toContain(en['find.attribution'])
    expect(screen.getByText(/^Your firm’s EP docket: 412 EP applications\./)).toBeTruthy()
    expect(note()).toBe(en['next.matters'])
    fireEvent.click(screen.getByRole('checkbox', { name: 'Keep SYNTEGON POUCH SYSTEMS in the client group' }))
    expect(screen.getByText('1 of 2 names')).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Keep SYNTEGON TECHNOLOGY in the client group' }))
    expect(disabled(en['act.next'])).toBe(true)
    expect(waiting()).toBe(en['wait.names'])
    fireEvent.click(screen.getByRole('checkbox', { name: 'Keep SYNTEGON TECHNOLOGY in the client group' }))
    await click(button(en['act.next']))
    expect(heading()).toBe('Syntegon: 2 EP applications at your firm')
    expect(s.host.others).toHaveBeenCalledWith(['SYNTEGON TECHNOLOGY'])
  })

  it('shows the skeleton while the search runs, the counts while the docket is read, and the register as the source', async () => {
    const s = mount({ clients: [] })
    await s.set(wizardView({ at: 'company', group: null, find: { status: 'loading', skeleton: true }, docket: { status: 'idle' } }))
    expect(screen.getByRole('status', { name: en['find.loading'] })).toBeTruthy()
    expect(waiting()).toBe(en['wait.search'])
    await s.set(wizardView({ at: 'company', group: null, find: { status: 'loading', skeleton: false }, docket: { status: 'idle' } }))
    expect(screen.queryByRole('status', { name: en['find.loading'] })).toBeNull()
    const register = { status: 'found' as const, source: 'ep-register' as const, asOf: AS_OF, truncated: false, sampleRows: 5000, omitted: 1, names: [{ name: 'SYNTEGON TECHNOLOGY GMBH', matching: 1234, ticked: true }] }
    await s.set(wizardView({ at: 'company', find: register, docket: { status: 'loading' } }))
    expect(screen.getByText(en['find.col.register'])).toBeTruthy()
    expect(screen.getByRole('cell', { name: en['find.loading'] })).toBeTruthy()
    expect(screen.getByText('1,234')).toBeTruthy()
    expect(screen.getByText(en['find.omitted.one'])).toBeTruthy()
    expect(screen.getByText(/^At your firm: your firm’s EP docket\./).textContent).not.toContain(en['find.attribution'])
    await s.set(wizardView({ at: 'company', find: { ...register, omitted: 3 }, docket: docket({ state: 'reading', progress: { slicesDone: 2, slices: 10, rows: 30 } }) }))
    expect(screen.getByRole('cell', { name: en['find.loading'] })).toBeTruthy()
    expect(screen.getByText(/^3 more names match/)).toBeTruthy()
    expect(screen.getByText('Reading your firm’s EP docket: 2 of 10 parts, 30 EP applications so far.')).toBeTruthy()
    expect(document.querySelector<HTMLElement>('p[role="status"] span[class*="progress"] span')?.style.width).toBe('20%')
    expect(waiting()).toBe(en['wait.docket'])
  })

  it('says "at least" for a partial docket, "Not known" without one, and how the docket stands', async () => {
    const s = mount({ clients: [] })
    const names = [{ name: 'SYNTEGON TECHNOLOGY', matching: 600, ticked: true }, { name: 'SYNTEGON POUCH SYSTEMS', matching: 12, ticked: true }]
    const find = { status: 'found' as const, source: 'patstat' as const, edition: '2026 Spring', asOf: AS_OF, truncated: false, sampleRows: 5000, omitted: 0, names }
    const counts = [{ name: 'SYNTEGON TECHNOLOGY', atFirm: 7 }, { name: 'SYNTEGON POUCH SYSTEMS', atFirm: 0 }]
    const atFirm = () => screen.getAllByRole('row').slice(1).map(row => within(row).getAllByRole('cell')[1]?.textContent)
    await s.set(wizardView({ at: 'company', find, docket: docket({ state: 'partial', rows: 30, asOf: AS_OF, failed: [], mismatches: [] }, { counts }) }))
    expect(atFirm()).toEqual(['At your firm at least 7', 'At your firm none found'])
    expect(screen.getByRole('status', { name: '' }).textContent).toContain(en['docket.partial.lead'])
    expect(screen.getByText(/^30 EP applications, as of Nov 8, 2026/)).toBeTruthy()
    expect(s.keys.current.retry).toBeTypeOf('function')
    await s.set(wizardView({ at: 'company', find, docket: docket({ state: 'stale', rows: 1, asOf: AS_OF }) }))
    expect(atFirm()).toEqual(['At your firm 0', 'At your firm 0'])
    expect(screen.getByText(/^Your firm’s EP docket: 1 EP application\./)).toBeTruthy()
    expect(s.keys.current.retry).toBeUndefined()
    await s.set(wizardView({ at: 'company', find, docket: docket({ state: 'failed', reason: 'day-over-limit', failed: [] }) }))
    expect(atFirm()).toEqual(['At your firm Not known', 'At your firm Not known'])
    expect(screen.getByRole('alert').textContent).toBe(`${en['docket.failed.lead']} ${en['docket.reason.day-over-limit']} ${en['docket.failed.rest']}Try againR`)
    expect(screen.getByText(/FlowLeap found these names in a register sample of 5,000 rows/)).toBeTruthy()
    await s.set(wizardView({ at: 'company', find, docket: docket({ state: 'interrupted', progress: { slicesDone: 4, slices: 9, rows: 3 } }) }))
    expect(screen.getByText('The read of your firm’s EP docket stopped at 4 of 9 parts.')).toBeTruthy()
    expect(s.keys.current.retry).toBeTypeOf('function')
    await s.set(wizardView({ at: 'company', find, docket: docket({ state: 'no_identity' }) }))
    expect(screen.getByText(en['company.noIdentity.lead'])).toBeTruthy()
    expect(waiting()).toBeNull()
    await s.set(wizardView({ at: 'company', find, docket: { status: 'no-plugin' } }))
    expect(screen.getByText(en['docket.noPlugin'])).toBeTruthy()
    s.host.matters.mockResolvedValueOnce(okHost(matters(['SYNTEGON TECHNOLOGY'])))
    await s.set(wizardView({ at: 'company', find, docket: { status: 'error', error: 'unreachable' } }))
    expect(screen.getByRole('alert').textContent).toBe(`${en['company.docketError']} ${en['host.unreachable']}Try againR`)
    await click(button(/Try again/))
    expect(s.host.matters).toHaveBeenCalledWith(['SYNTEGON TECHNOLOGY', 'SYNTEGON POUCH SYSTEMS'])
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('says who added an existing client', async () => {
    const s = mount()
    await s.set(wizardView({ at: 'company', existing: SYNTEGON.client }))
    expect(screen.getByText('Syntegon is already a client of your firm.')).toBeTruthy()
    expect(screen.getByText(/^Dr\. Anna Becker added it on Nov 1, 2026\./)).toBeTruthy()
    await s.set(wizardView({ at: 'company', existing: { ...firmClient(SCHUBERT_ID, 'Syntegon', 'watch'), addedBy: { id: null, name: null } } }))
    expect(screen.getByText('Syntegon is already on your Watch list.')).toBeTruthy()
    expect(screen.getByText(/^It was added on Nov 1, 2026\./)).toBeTruthy()
  })

  it('offers Try again and Add by name only when the search fails, and says when there is no key or no plugin', async () => {
    const s = mount({ clients: [] })
    act(() => { s.model.start() })
    fireEvent.change(field(), { target: { value: 'Neue GmbH' } })
    s.host.find.mockResolvedValueOnce({ ok: false, error: 'unreachable' })
    fireEvent.keyDown(field(), { key: 'Enter' })
    await flush()
    expect(screen.getByRole('alert').textContent).toBe(`${en['find.error.lead']} ${en['host.unreachable']} ${en['find.error.rest']}Try againR`)
    expect(screen.getByText('You can also add Neue GmbH by name only, and check for its matters later.')).toBeTruthy()
    expect(waiting()).toBe(en['wait.find-failed'])
    expect(s.keys.current.retry).toBeTypeOf('function')
    s.host.find.mockResolvedValueOnce({ ok: false, error: 'unreachable' })
    await act(async () => { s.keys.current.retry?.() })
    await flush()
    expect(s.host.find).toHaveBeenCalledTimes(2)
    s.host.find.mockResolvedValueOnce({ ok: false, error: 'no-key' })
    await click(button(/Try again/))
    expect(screen.getByRole('alert').textContent).toContain(en['find.noKey.title'])
    expect(s.keys.current.retry).toBeUndefined()
    await click(button(en['act.byName']))
    expect(screen.getByText(en['find.plugin.title'])).toBeTruthy()
    expect(screen.getByText(en['matters.byName'])).toBeTruthy()
    expect(disabled(en['act.next'])).toBe(false)
    s.host.find.mockResolvedValueOnce(okHost({ status: 'no-plugin' }))
    fireEvent.keyDown(field(), { key: 'Enter' })
    await flush()
    expect(screen.getByText(/^The FlowLeap patent data plugin is not installed, so FlowLeap cannot find/)).toBeTruthy()
    expect(screen.getByText(en['docket.noPlugin'])).toBeTruthy()
    s.host.find.mockResolvedValueOnce({ ok: false, error: 'internal' })
    fireEvent.keyDown(field(), { key: 'Enter' })
    await flush()
    await click(button(en['act.byName']))
    await click(button(en['act.next']))
    expect(heading()).toBe('Neue GmbH: 0 EP applications at your firm')
    expect(screen.getByText(en['matters.byName'])).toBeTruthy()
    expect(s.host.others).not.toHaveBeenCalled()
  })
})

describe('step 2: Matters', () => {
  const rows = [
    docketRow('EP23171862'),
    docketRow('EP25712875', { publicationNumber: undefined, representativeSince: undefined }),
    docketRow('EP23165015', { addressOnly: true, title: 'Isolator system' }),
  ]
  const at = (fields: Partial<WizardView> = {}) => wizardView({ at: 'matters', docket: docket({ state: 'ready', rows: 3, asOf: AS_OF }, { rows }), ...fields })

  it('lists the firm\'s rows and the address-only rows unticked, and counts only the ticked rows', async () => {
    const s = mount()
    await s.set(at({ others: { status: 'counted', answer: others(214, { atLeast: true }) } }))
    expect(heading()).toBe('Syntegon: 2 EP applications at your firm')
    const table = screen.getByRole('table', { name: en['matters.section'] })
    expect(within(table).getAllByRole('row').map(row => row.textContent)).toEqual([
      'ApplicationTitlePublicationRepresentative changed',
      'At your firm2',
      'EP 23 171 862Method and apparatus for producing a packaging elementEP 4 292 805 A1Jul 24, 2024',
      `EP 25 712 875Method and apparatus for producing a packaging element${en['matters.notYet']}`,
      `${en['matters.address']}1${en['matters.addressWhy']}`,
      'EP 23 165 015Isolator systemEP 4 292 805 A1Jul 24, 2024',
    ])
    expect(screen.getByText(/^From your firm’s EP docket, as of Nov 8, 2026/)).toBeTruthy()
    expect(screen.getByText('At least 214 more EP applications of the group are at other firms.')).toBeTruthy()
    expect(note()).toBe(en['next.role'])
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Record EP 23 165 015 for the client' }).checked).toBe(false)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Record EP 23 165 015 for the client' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Record EP 23 171 862 for the client' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Record EP 25 712 875 for the client' }))
    expect(heading()).toBe('Syntegon: 1 EP application at your firm')
    await click(button(en['act.back']))
    expect(s.wizard().at).toBe('company')
  })

  it('shows 100 rows and then 100 more, and says when the docket is partial', async () => {
    const s = mount()
    const many = Array.from({ length: 205 }, (_, index) => docketRow(`EP23${String(index + 1).padStart(6, '0')}`))
    await s.set(at({ docket: docket({ state: 'partial', rows: 205, asOf: AS_OF, failed: [], mismatches: [] }, { rows: many }) }))
    expect(screen.getByText(en['matters.partial'])).toBeTruthy()
    expect(screen.getAllByRole('checkbox')).toHaveLength(100)
    await click(button('Show 100 more of 105'))
    await click(button('Show 100 more of 5'))
    expect(screen.getAllByRole('checkbox')).toHaveLength(205)
    expect(screen.queryByRole('button', { name: /^Show 100 more/ })).toBeNull()
  })

  it('says why no matter shows: by name only, no firm identity, or no matter of the names', async () => {
    const s = mount()
    await s.set(at({ group: { name: 'Neue GmbH', names: [], byName: true }, others: { status: 'none' } }))
    expect(screen.getByText(en['matters.byName'])).toBeTruthy()
    await s.set(at({ docket: { status: 'no-plugin' } }))
    expect(screen.getByText(en['matters.byName'])).toBeTruthy()
    await s.set(at({ docket: docket({ state: 'no_identity' }) }))
    expect(screen.getByText(en['matters.noDocket'])).toBeTruthy()
    await s.set(at({ docket: docket(READY_DOCKET) }))
    expect(screen.getByText(en['matters.empty.title'])).toBeTruthy()
    expect(screen.getByText(/^Your firm’s EP docket has no EP application of these names\. You can still add Syntegon/)).toBeTruthy()
  })

  it('counts the applications at other firms, with Try again when the count failed', async () => {
    const s = mount()
    await s.set(at({ others: { status: 'loading' } }))
    expect(screen.getByText(en['others.loading'])).toBeTruthy()
    await s.set(at({ others: { status: 'counted', answer: others(10_000, { capped: true, atLeast: true }) } }))
    expect(screen.getByText('10,000+ more EP applications of the group are at other firms.')).toBeTruthy()
    await s.set(at({ others: { status: 'counted', answer: others(3) } }))
    expect(screen.getByText('3 more EP applications of the group are at other firms.')).toBeTruthy()
    s.host.others.mockResolvedValueOnce(okHost(others(4)))
    await s.set(at({ others: { status: 'error', error: 'unreachable' } }))
    expect(screen.getByRole('alert').textContent).toBe(`${en['others.error']} ${en['host.unreachable']}Try againR`)
    expect(s.keys.current.retry).toBeTypeOf('function')
    await click(button(/Try again/))
    expect(screen.getByText('4 more EP applications of the group are at other firms.')).toBeTruthy()
  })
})

describe('step 3: Role', () => {
  it('waits for a role, and offers Client, Watch and Other party', async () => {
    const s = mount()
    await s.set(wizardView({ at: 'role', role: null }))
    expect(heading()).toBe('The role of Syntegon')
    expect(waiting()).toBe(en['wait.role'])
    const radios = () => screen.getAllByRole('radio').map(radio => [radio.textContent, radio.getAttribute('aria-checked')])
    expect(radios().map(([text]) => text?.slice(0, 12))).toEqual(['ClientYour f', 'WatchA compe', 'Other partyA'])
    expect(screen.getByText(/^A competitor to follow\. FlowLeap puts Syntegon on the Watch list/)).toBeTruthy()
    await click(screen.getByRole('radio', { name: /^Watch/ }))
    expect(radios().map(([, on]) => on)).toEqual(['false', 'true', 'false'])
    expect(note()).toBe(en['next.review'])
    await click(screen.getByRole('radio', { name: /^Other party/ }))
    expect(note()).toBe(en['next.matter'])
    expect(steps().at(3)).toBe('4Matter, not yet')
    await click(screen.getByRole('radio', { name: /^Client/ }))
    expect(note()).toBe(en['next.conflict'])
    await s.set(wizardView({ at: 'role', recording: { status: 'running', done: 1, total: 3 } }))
    expect(screen.getAllByRole('radio').every(radio => (radio as HTMLButtonElement).disabled)).toBe(true)
  })
})

describe('step 4: Conflict check', () => {
  const at = (fields: Partial<WizardView> = {}) => wizardView({ at: 'conflict', firm: { status: 'ready', details: [SYNTEGON], asOf: AS_OF }, ...fields })

  it('says no conflict was found, and how complete the two halves are', async () => {
    const s = mount()
    await s.set(at())
    expect(heading()).toBe('Conflict check for Syntegon')
    expect(screen.getByText(en['conflict.none'])).toBeTruthy()
    expect(screen.getByText(en['conflict.noneBodyOne'])).toBeTruthy()
    expect(screen.getAllByText(/^Complete, as of Nov 8, 2026/)).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /Try again/ })).toBeNull()
    expect(note()).toBe(en['next.review'])
    const two = { name: 'Syntegon', names: [{ name: 'A', source: 'patstat' as const }, { name: 'B', source: 'patstat' as const }], byName: false }
    await s.set(at({ group: two }))
    expect(screen.getByText(/^None of the 2 names is the other side/)).toBeTruthy()
  })

  it('waits for a half that reads or is incomplete, and Try again reads the check again', async () => {
    const s = mount()
    await s.set(at({ check: { status: 'checked', answer: checked([], { groupOpposedClients: { state: 'reading' }, clientsOpposedGroup: { state: 'incomplete', failed: [], mismatches: [] } }) } }))
    expect(screen.getByText(en['conflict.half.reading'])).toBeTruthy()
    expect(screen.getByText(en['conflict.half.incomplete'])).toBeTruthy()
    expect(waiting()).toBe(en['wait.conflict-failed'])
    expect(s.keys.current.retry).toBeTypeOf('function')
    await s.set(at({ check: { status: 'checked', answer: checked([], { groupOpposedClients: { state: 'reading' }, clientsOpposedGroup: { state: 'complete', asOf: AS_OF } }) } }))
    expect(waiting()).toBe(en['wait.conflict-reading'])
    expect(s.keys.current.retry).toBeTypeOf('function')
    await click(button(/Try again/))
    expect(s.host.conflictCheck).toHaveBeenCalledWith({ names: ['SYNTEGON TECHNOLOGY'], clients: [{ clientId: SYNTEGON_ID, names: ['Syntegon', 'SYNTEGON TECHNOLOGY'] }] })
    expect(waiting()).toBeNull()
  })

  it('shows the loading state, and the failure of the Firm Record, the register or the key with Try again', async () => {
    const s = mount()
    await s.set(at({ firm: { status: 'loading' }, check: { status: 'loading' } }))
    expect(screen.getByText(en['conflict.loading'])).toBeTruthy()
    expect(waiting()).toBe(en['wait.conflict-reading'])
    expect(s.keys.current.retry).toBeUndefined()
    await s.set(at({ check: { status: 'loading' } }))
    expect(screen.getByText(en['conflict.loading'])).toBeTruthy()
    await s.set(at({ firm: { status: 'loading' } }))
    expect(screen.getByText(en['conflict.loading'])).toBeTruthy()
    await s.set(at({ firm: { status: 'error', error: { kind: 'refused', status: 403, code: null } } }))
    expect(screen.getByRole('alert').textContent).toBe(`${en['conflict.failed.lead']} ${en['refusal.other']}Try againR`)
    await s.set(at({ check: { status: 'error', error: 'unreachable' } }))
    expect(screen.getByRole('alert').textContent).toContain(en['host.unreachable'])
    await s.set(at({ check: { status: 'no-key' } }))
    expect(screen.getByRole('alert').textContent).toContain(en['host.no-key'])
    expect(waiting()).toBe(en['wait.conflict-failed'])
    await click(button(/Try again/))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows a possible conflict with its EP Register facts, and waits until it is checked with a reason', async () => {
    const s = mount()
    await s.set(at({ check: { status: 'checked', answer: checked([registerHit(SYNTEGON_ID)]) } }))
    expect(steps().at(3)).toBe('Conflict check, blocked')
    expect(screen.getByText('1 possible conflict')).toBeTruthy()
    expect(screen.getByText('Gerhard Schubert GmbH is the other side of your client Syntegon in EP 16 188 900.')).toBeTruthy()
    expect(screen.getByText('EP 16 188 900 · EP 3 296 081 B1 · Method and device for producing tubular bags')).toBeTruthy()
    expect(screen.getByText(en['fact.role.patent-owner'])).toBeTruthy()
    expect(screen.getByText('Syntegon Packaging Systems AG, a company of your client Syntegon')).toBeTruthy()
    expect(screen.getByText('Jan 8, 2025')).toBeTruthy()
    expect(screen.getByText('Patent revoked')).toBeTruthy()
    expect(screen.getByText(en['fact.yourFirm.not-named'])).toBeTruthy()
    expect(screen.getByText(/^EP Register, as of Nov 8, 2026/)).toBeTruthy()
    expect(waiting()).toBe(en['wait.conflict-check'])
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(`^${en['conflict.check']}`) }))
    fireEvent.change(screen.getByRole('textbox', { name: en['conflict.reason'] }), { target: { value: 'The opposition is closed.' } })
    expect(screen.getByText('1 possible conflict · checked')).toBeTruthy()
    expect(screen.getByText(en['conflict.checkedRest'])).toBeTruthy()
    expect(waiting()).toBeNull()
    await click(button(en['act.next']))
    expect(s.wizard().at).toBe('review')
  })

  it('words several hits, a hit of a client it cannot name, and the hits of the Firm Record', async () => {
    const s = mount()
    const opposed: ClientDetail = { ...SYNTEGON, applications: [{ applicationNumber: 'EP23171862', publicationNumber: 'EP4292805A1', roles: [{ partyId: 'party-2' as PartyId, party: 'SYNTEGON TECHNOLOGY', role: 'other' }] }] }
    const hit = registerHit(SCHUBERT_ID, { opposedOn: undefined, status: undefined, publicationNumber: undefined, title: undefined, yourFirm: 'unknown' })
    await s.set(at({ firm: { status: 'ready', details: [opposed], asOf: AS_OF }, check: { status: 'checked', answer: checked([hit]) } }))
    expect(screen.getByText('Names of the group are the other side of your clients in 2 applications.')).toBeTruthy()
    expect(screen.getByText('2 possible conflicts')).toBeTruthy()
    expect(screen.getByText(/^Firm Record, as of/)).toBeTruthy()
    expect(screen.getByText('EP 16 188 900')).toBeTruthy()
    expect(screen.getByText('EP 23 171 862 · EP 4 292 805 A1')).toBeTruthy()
    expect(screen.getByText('Syntegon Packaging Systems AG')).toBeTruthy()
    expect(screen.getByText(en['fact.yourFirm.unknown'])).toBeTruthy()
    expect(screen.queryByText(en['fact.opposed'])).toBeNull()
    await s.set(at({ firm: { status: 'ready', details: [], asOf: AS_OF }, check: { status: 'checked', answer: checked([registerHit(SCHUBERT_ID)]) } }))
    expect(screen.getByText('Gerhard Schubert GmbH is the other side of your client Syntegon Packaging Systems AG in EP 16 188 900.')).toBeTruthy()
  })

  it('asks the person to check conflicts by name only, also with a hit of the Firm Record', async () => {
    const s = mount()
    const opposed: ClientDetail = { ...SYNTEGON, applications: [{ applicationNumber: 'EP23171862', roles: [{ partyId: 'party-2' as PartyId, party: 'Neue GmbH', role: 'opponent' }] }] }
    await s.set(at({ group: { name: 'Neue GmbH', names: [], byName: true }, check: { status: 'by-name' }, firm: { status: 'ready', details: [], asOf: AS_OF } }))
    expect(screen.getByText(en['conflict.byName.lead'])).toBeTruthy()
    expect(screen.getByText(en['conflict.checkSelf'])).toBeTruthy()
    expect(screen.getByText('Write how you checked Neue GmbH. FlowLeap records it with your name.')).toBeTruthy()
    expect(screen.queryByText(en['conflict.halves'])).toBeNull()
    expect(waiting()).toBe(en['wait.conflict-check'])
    await s.set(at({ group: { name: 'Neue GmbH', names: [], byName: true }, check: { status: 'by-name' }, firm: { status: 'ready', details: [opposed], asOf: AS_OF } }))
    expect(screen.getByText('Neue GmbH is the other side of your client Syntegon in EP 23 171 862.')).toBeTruthy()
    expect(screen.getByText(en['conflict.byName.lead'])).toBeTruthy()
  })
})

describe('step 4: Matter of Other party', () => {
  const at = (fields: Partial<WizardView> = {}) => wizardView({ at: 'matter', role: 'other-party', firm: { status: 'ready', details: [SYNTEGON], asOf: AS_OF }, ...fields })

  it('finds a matter of your firm, picks it with its role, and goes on to Review', async () => {
    const s = mount()
    await s.set(at())
    expect(heading()).toBe('The matter of Syntegon')
    expect(waiting()).toBe(en['wait.matter'])
    const list = screen.getByRole('listbox', { name: en['other.find'] })
    expect(within(list).getAllByRole('option').map(option => option.textContent)).toEqual(['EP 23 171 862Method and apparatus for producing a packaging element', 'EP 23 709 335Syntegon'])
    expect(within(list).getByText(en['other.foot'])).toBeTruthy()
    fireEvent.change(screen.getByRole('searchbox', { name: en['other.find'] }), { target: { value: 'nothing here' } })
    expect(within(list).getByText(en['other.none'])).toBeTruthy()
    fireEvent.change(screen.getByRole('searchbox', { name: en['other.find'] }), { target: { value: 'packaging 23 171' } })
    await click(within(list).getByRole('option'))
    expect(within(list).getByRole('option').getAttribute('aria-selected')).toBe('true')
    fireEvent.click(screen.getByRole('tab', { name: en['other.role.licensee'] }))
    await flush()
    expect(s.wizard().other).toEqual({ applicationNumber: 'EP23171862', role: 'licensee' })
    await click(button(en['act.next']))
    expect(screen.getByText('EP 23 171 862 · Licensee')).toBeTruthy()
    expect(note()).toBe('FlowLeap records Syntegon as a party to EP 23 171 862. It makes no folder.')
  })

  it('says when the Firm Record has no matter, is read, or cannot be read', async () => {
    const s = mount()
    await s.set(at({ firm: { status: 'ready', details: [], asOf: AS_OF } }))
    expect(screen.getByText(en['other.empty'])).toBeTruthy()
    await s.set(at({ firm: { status: 'loading' } }))
    expect(screen.getByText(en['conflict.loading'])).toBeTruthy()
    expect(waiting()).toBe(en['wait.firm'])
    await s.set(at({ firm: { status: 'error', error: { kind: 'malformed', path: 'body' } } }))
    expect(screen.getByRole('alert').textContent).toContain(en['error.malformed'])
    expect(waiting()).toBe(en['wait.firm-failed'])
    expect(s.keys.current.retry).toBeTypeOf('function')
    await click(button(/Try again/))
    expect(screen.getAllByRole('option')).toHaveLength(2)
  })
})

describe('step 5: Review', () => {
  const at = (fields: Partial<WizardView> = {}) => wizardView({ at: 'review', ...fields })
  const summary = () => [...document.querySelectorAll('[class*="sumRow"]')].map(row => [...row.children].slice(0, 2).map(cell => cell.textContent))

  it('sums up every choice with Edit to its step, and records the client with the record key', async () => {
    const s = mount({ clients: [] })
    const rows = [docketRow('EP23171862'), docketRow('EP23165015', { addressOnly: true })]
    await s.set(at({ docket: docket(READY_DOCKET, { rows }), others: { status: 'counted', answer: others(214) } }))
    expect(heading()).toBe('Review: Syntegon')
    expect(summary()).toEqual([
      ['Company', 'Syntegon1 applicant name'],
      ['Names', '1 of 1 namesSYNTEGON TECHNOLOGY'],
      ['Matters', `1 EP application at your firmMatched by address only and not ticked: 1. From your firm’s EP docket, as of ${asOfText(makeTranslate(en), AS_OF, 'en')}. 214 more EP applications of the group are at other firms.`],
      ['Role', `Client${en['sum.role.detail']}`],
      ['Conflict check', `${en['sum.conflict.none']}${en['conflict.searched']}`],
    ])
    expect(note()).toBe('FlowLeap records the client and its 1 application. It copies no files.')
    expect(within(button(new RegExp(`^${en['primary.client']}`))).getByText('⇧⌘↵')).toBeTruthy()
    await click(button('Edit Matters'))
    expect(s.wizard()).toMatchObject({ at: 'matters', editing: true })
    expect(note()).toBe(en['next.backToReview'])
    await click(button(en['act.backToReview']))
    expect(s.wizard()).toMatchObject({ at: 'review', editing: false })
    fireEvent.keyDown(screen.getByTestId('add-client'), { code: 'Enter', key: 'Enter', metaKey: true })
    await flush()
    expect(s.firm.sent).toEqual([])
    recordKey()
    await flush()
    expect(s.firm.sent[0]).toMatchObject({ kind: 'conflict-check', hits: [] })
    expect(heading()).toBe('Syntegon is recorded')
  })

  it('waits for an open conflict, says why, and records nothing on the record key', async () => {
    const s = mount()
    await s.set(at({ check: { status: 'checked', answer: checked([registerHit(SYNTEGON_ID)]) }, firm: { status: 'ready', details: [SYNTEGON], asOf: AS_OF } }))
    expect(summary().at(-1)).toEqual(['Conflict check', `1 possible conflict, not checked${en['sum.conflict.openBody']}`])
    expect(waiting()).toBe(en['wait.review.conflict-check'])
    expect(disabled(new RegExp(`^${en['primary.client']}`))).toBe(true)
    recordKey()
    await flush()
    expect(s.firm.sent).toEqual([])
    await s.set(at({ check: { status: 'checked', answer: checked([registerHit(SYNTEGON_ID)]) }, firm: { status: 'ready', details: [SYNTEGON], asOf: AS_OF }, conflict: { checked: true, reason: ' Closed. ' } }))
    expect(summary().at(-1)).toEqual(['Conflict check', '1 possible conflict, checked by youYour reason: “Closed.”'])
    expect(waiting()).toBeNull()
  })

  it('words the conflict check that is not complete, and by name only checked or not', async () => {
    const s = mount()
    await s.set(at({ firm: { status: 'loading' } }))
    expect(summary().at(-1)).toEqual(['Conflict check', en['sum.conflict.waiting']])
    expect(waiting()).toBe(en['wait.conflict-reading'])
    await s.set(at({ check: { status: 'checked', answer: checked([], { groupOpposedClients: { state: 'complete', asOf: AS_OF }, clientsOpposedGroup: { state: 'reading' } }) } }))
    expect(summary().at(-1)).toEqual(['Conflict check', en['sum.conflict.waiting']])
    await s.set(at({ check: { status: 'checked', answer: checked([], { groupOpposedClients: { state: 'reading' }, clientsOpposedGroup: { state: 'complete', asOf: AS_OF } }) } }))
    expect(summary().at(-1)).toEqual(['Conflict check', en['sum.conflict.waiting']])
    await s.set(at({ check: { status: 'error', error: 'internal' } }))
    expect(summary().at(-1)).toEqual(['Conflict check', en['sum.conflict.waiting']])
    const byName = { name: 'Neue GmbH', names: [], byName: true }
    await s.set(at({ group: byName, find: { status: 'by-name' }, docket: { status: 'idle' }, others: { status: 'none' }, check: { status: 'by-name' } }))
    expect(summary()).toEqual([
      ['Company', `Neue GmbH${en['sum.company.byName']}`],
      ['Names', en['sum.names.none']],
      ['Matters', '0 EP applications at your firm'],
      ['Role', `Client${en['sum.role.detail']}`],
      ['Conflict check', `${en['sum.conflict.selfOpen']}${en['sum.conflict.openBody']}`],
    ])
    await s.set(at({ group: byName, find: { status: 'by-name' }, docket: { status: 'idle' }, check: { status: 'by-name' }, conflict: { checked: true, reason: 'Asked the partners.' } }))
    expect(summary().at(-1)).toEqual(['Conflict check', `${en['sum.conflict.self']}Your reason: “Asked the partners.”`])
    await s.set(at({ group: { ...byName, name: 'CON' }, find: { status: 'by-name' }, docket: { status: 'idle' }, check: { status: 'by-name' }, conflict: { checked: true, reason: 'x' } }))
    expect(waiting()).toBe(en['wait.name'])
  })

  it('sums up Watch with no conflict check, Other party with its matter, and a step that waits', async () => {
    const s = mount()
    await s.set(at({ role: 'watch' }))
    expect(summary().map(([key]) => key)).toEqual(['Company', 'Names', 'Matters', 'Role'])
    expect(note()).toBe('FlowLeap puts Syntegon on the Watch list. It adds no client.')
    expect(button(new RegExp(`^${en['primary.watch']}`))).toBeTruthy()
    await s.set(at({ role: 'other-party' }))
    expect(summary().at(-1)).toEqual(['Matter', ''])
    expect(waiting()).toBe(en['wait.matter'])
    await s.set(at({ role: null, group: null }))
    expect(summary().find(([key]) => key === 'Role')).toEqual(['Role', en['sum.role.detail']])
    expect(button(new RegExp(`^${en['primary.client']}`))).toBeTruthy()
    expect(heading()).toBe('Review: ')
  })

  it('shows the progress of a recording, the failure with Try again, and closes on Cancel', async () => {
    const s = mount()
    await s.set(at({ recording: { status: 'running', done: 1, total: 3 } }))
    expect(waiting()).toBe('Recording 1 of 3')
    expect(screen.queryByRole('button', { name: en['act.cancel'] })).toBeNull()
    expect(screen.getAllByRole('button', { name: /^Edit / }).every(item => (item as HTMLButtonElement).disabled)).toBe(true)
    await s.set(at({ recording: { status: 'failed', error: { kind: 'refused', status: 409, code: 'idempotency-key-reused' } } }))
    expect(screen.getByRole('alert').textContent).toBe(`${en['refusal.idempotency-key-reused']} ${en['record.safe']}Try againR`)
    expect(s.keys.current.retry).toBeTypeOf('function')
    await click(button(/Try again/))
    expect(s.firm.sent.map(command => command.kind)).toEqual(['conflict-check', 'client', 'name'])
    expect(heading()).toBe('Syntegon is recorded')
    await s.set(at())
    await click(button(en['act.back']))
    expect(s.wizard().at).toBe('conflict')
    await s.set(at())
    await click(button(en['act.cancel']))
    expect(screen.getByText('closed')).toBeTruthy()
  })

  it('shows no key on the primary act when the app command has none', async () => {
    const s = mount({ clients: [] }, { keycaps: [], binding: null })
    await s.set(at())
    expect(screen.queryByText('⇧⌘↵')).toBeNull()
    recordKey()
    await flush()
    expect(s.firm.sent).toEqual([])
  })
})

describe('the whole wizard', () => {
  it('goes from Company to Record with the ticked matters', async () => {
    const s = mount({ clients: [] })
    s.host.matters.mockResolvedValueOnce(okHost(matters(['SYNTEGON'], [docketRow('EP23171862', { names: ['SYNTEGON'] })])))
    await search(s, 'Syntegon')
    await click(button(en['act.next']))
    await click(button(en['act.next']))
    await click(screen.getByRole('radio', { name: /^Client/ }))
    await click(button(en['act.next']))
    expect(heading()).toBe('Conflict check for Syntegon')
    await click(button(en['act.next']))
    await click(button(new RegExp(`^${en['primary.client']}`)))
    expect(heading()).toBe('Syntegon is recorded')
    expect(s.firm.sent.map(command => command.kind)).toEqual(['conflict-check', 'client', 'name', 'party', 'applications'])
  })
})

/** Applications `EP23000001`, `EP23000002`, … with one applicant each. */
function applications(count: number): ApplicationDecision[] {
  return Array.from({ length: count }, (_, index) => ({ fact: { applicationNumber: `EP23${String(index + 1).padStart(6, '0')}`, basis: 'register' as const }, applicants: ['Syntegon Technology GmbH'] }))
}

/** Batches of 100 with the states given, in order. */
function batches(count: number, states: readonly RecordBatch['state'][]): RecordBatch[] {
  return splitBatches(applications(count), 100).map((batch, index) => ({ ...batch, state: states[index] ?? 'waiting' }))
}

describe('Record', () => {
  const view = (extra: Partial<RecordView> = {}): RecordView => ({
    page: 'record', clientId: SYNTEGON_ID, name: 'Syntegon', names: ['SYNTEGON TECHNOLOGY', 'SYNTEGON POUCH SYSTEMS'], hits: 0,
    applications: applications(1132), batches: null, parties: {}, folder: { state: 'waiting' }, error: null, ...extra,
  })

  it('shows every step done, asks to keep the page open while the batches run, and shows the batch that runs', async () => {
    const s = mount()
    await s.set(view())
    expect(steps()).toEqual(['Company, done', 'Matters, done', 'Role, done', 'Conflict check, done', 'Review, done'])
    expect(links()).toEqual([])
    expect(screen.getByRole('navigation', { name: en['crumbs.label'] }).textContent).toBe('Clients›Add client›Syntegon')
    expect(heading()).toBe('Recording Syntegon')
    expect(screen.getByText(en['record.keep.lead'])).toBeTruthy()
    expect(screen.getByText('Recorded Syntegon as a client, with its 2 applicant names')).toBeTruthy()
    expect(screen.getByText(en['sum.conflict.none'])).toBeTruthy()
    expect(screen.getByText('Recording the 1132 applications of the client')).toBeTruthy()
    expect(screen.getByText('0 / 1132')).toBeTruthy()
    expect(screen.getByText(en['record.folder.next'])).toBeTruthy()
    expect(note()).toBe(en['record.foot.running'])
    expect(disabled(en['act.openClient'])).toBe(true)
    expect(s.keys.current.retry).toBeUndefined()
    await s.set(view({ batches: batches(1132, ['recorded', 'recorded', 'recorded', 'recorded', 'recorded', 'recorded', 'recorded', 'recording']) }))
    expect(screen.getByText('Batch 8 of 12, 100 applications each')).toBeTruthy()
    expect(screen.getByText('700 / 1132')).toBeTruthy()
    const bar = document.querySelector<HTMLElement>('ol [aria-current="step"] span span')
    expect(bar?.style.width).toBe('62%')
  })

  it('says one batch for a small client, and the client with no applicant name and with hits', async () => {
    const s = mount()
    await s.set(view({ names: [], hits: 2, applications: applications(32), batches: batches(32, ['recording']) }))
    expect(screen.getByText('Recorded Syntegon as a client')).toBeTruthy()
    expect(screen.getByText('2 possible conflicts')).toBeTruthy()
    expect(screen.getByText('1 batch of 32 applications')).toBeTruthy()
    await s.set(view({ applications: applications(1), batches: batches(1, ['recording']) }))
    expect(screen.getByText('Recording the 1 application of the client')).toBeTruthy()
  })

  it('names a failed batch and what Try again records, and Try again records only the missing batches', async () => {
    const s = mount()
    const failed = batches(1132, ['recorded', 'recorded', 'recorded', 'recorded', 'recorded', 'recorded', 'recorded', 'failed'])
    await s.set(view({ batches: failed, error: { kind: 'service', status: 503 } }))
    expect(heading()).toBe('Recording Syntegon')
    expect(screen.queryByText(en['record.keep.lead'])).toBeNull()
    expect(screen.getByRole('alert').textContent).toBe(`432 applications are not recorded yet. ${en['record.safe']}Try againR`)
    expect(screen.getByText('Recorded 700 of 1132 applications')).toBeTruthy()
    expect(screen.getByText(`Batch 8 of 12 was not recorded. ${en['error.service']} Try again records only the 5 missing batches. A batch that was recorded is never recorded twice.`)).toBeTruthy()
    expect(note()).toBe(en['record.foot.failed'])
    expect(disabled(en['act.openClient'])).toBe(false)
    expect(s.keys.current.retry).toBeTypeOf('function')
    await s.set(view({ applications: applications(1), batches: batches(1, ['failed']), error: { kind: 'refused', status: 409, code: 'application-other-client', applicationNumber: 'EP23000001' } }))
    expect(screen.getByRole('alert').textContent).toContain('1 application is not recorded yet.')
    expect(screen.getByText(`Batch 1 of 1 was not recorded. ${en['refusal.application-other-client']} Try again records only the missing batch. A batch that was recorded is never recorded twice.`)).toBeTruthy()
    await click(button(/Try again/))
    expect(s.firm.sent.map(command => command.kind)).toEqual(['party', 'applications'])
    expect(s.host.clientFolder).toHaveBeenCalledTimes(1)
    expect(heading()).toBe('Syntegon is recorded')
  })

  it('says why the batch size or the client folder failed', async () => {
    const s = mount()
    await s.set(view({ error: 'network' }))
    expect(screen.getByRole('alert').textContent).toBe(`${en['host.network']} ${en['record.safe']}Try againR`)
    expect(screen.getByText('Recorded 0 of 1132 applications')).toBeTruthy()
    const recorded = batches(1132, Array.from({ length: 12 }, () => 'recorded' as const))
    await s.set(view({ batches: recorded, error: 'invalid-name' }))
    expect(screen.getByRole('alert').textContent).toContain(en['host.invalid-name'])
    expect(screen.getByText('Recorded the 1132 applications of the client')).toBeTruthy()
    expect(screen.getByText('Firm Record, 12 batches')).toBeTruthy()
    expect(screen.getAllByText(en['host.invalid-name'])).toHaveLength(2)
    await s.set(view({ applications: [], batches: [], error: { kind: 'malformed', path: 'body' } }))
    expect(screen.getAllByText(en['error.malformed'])).toHaveLength(2)
    expect(screen.queryByText(/applications of the client/)).toBeNull()
  })

  it('shows the folder that is made, then the done page, and opens the client page', async () => {
    const s = mount()
    const recorded = batches(32, ['recorded'])
    await s.set(view({ applications: applications(32), batches: recorded, folder: { state: 'making' } }))
    expect(screen.getByText(en['record.folder.now'])).toBeTruthy()
    expect(disabled(en['act.openClient'])).toBe(true)
    await s.set(view({ applications: applications(32), batches: recorded, folder: { state: 'made', workspace: 'ws-syntegon' as never } }))
    expect(heading()).toBe('Syntegon is recorded')
    expect(screen.getByText(en['record.ledeDone'])).toBeTruthy()
    expect(screen.getByText('Recorded the 32 applications of the client')).toBeTruthy()
    expect(screen.getByText('Firm Record, 1 batch')).toBeTruthy()
    expect(screen.getByText(en['record.folder.done'])).toBeTruthy()
    expect(note()).toBe(en['record.foot.done'])
    expect(screen.queryByRole('alert')).toBeNull()
    await click(button(en['act.openClient']))
    expect(s.opened).toEqual(['ws-syntegon'])
    expect(screen.getByText('closed')).toBeTruthy()
  })
})

describe('the page parts', () => {
  /** The parts of the page in order, which the rows of the `.work` grid follow (`layout-styles.client.spec.ts`). */
  const parts = () => [...screen.getByTestId('add-client').children].map(child => child.tagName === 'HEADER' ? 'top bar' : child.tagName === 'FOOTER' ? 'footer' : /scroll/u.exec(child.className)?.[0])

  it('puts the top bar first, then the scroll area, then the footer on every page', async () => {
    const s = mount({ clients: [] })
    act(() => { s.model.start() })
    expect(parts()).toEqual(['top bar', 'scroll', 'footer'])
    await s.set(wizardView({ at: 'review' }))
    expect(parts()).toEqual(['top bar', 'scroll', 'footer'])
    await s.set({ page: 'record', clientId: SYNTEGON_ID, name: 'Syntegon', names: [], hits: 0, applications: [], batches: null, parties: {}, folder: { state: 'waiting' }, error: null })
    expect(parts()).toEqual(['top bar', 'scroll', 'footer'])
  })
})
