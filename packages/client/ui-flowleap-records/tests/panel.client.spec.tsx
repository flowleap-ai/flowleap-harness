// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector, contextMenuHook, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { ShortcutCatalogEntry, ShortcutCommandId, ShortcutFixedCatalogEntry } from '@deepseek-ai/dsh-client-shortcuts/client'
import type { LocaleId } from '@deepseek-ai/dsh-client-locale/client'
import type { Act, DeadlineId, DocumentId, Fetched, FileNumber, RecordsApi, TicketId } from '../src/client/api.ts'
import type { IntakeRowTarget } from '../src/client/row-menu.ts'
import type { MenuPoint } from '@deepseek-ai/dsh-client-ui-context-menu/client'
import { en } from '../src/client/locales.ts'
import { SKELETON_DELAY_MS } from '../src/client/load.ts'
import { CommandItemRegistry, KeyActRegistry } from '../src/client/key-layer.ts'
import { createRecordsModel, TAB_ROUTE, type Route } from '../src/client/model.ts'
import { RecordsPanel, MattersIcon, type PanelProps } from '../src/client/Panel.tsx'
import { createFixtureApi, fixtures, FIXTURE_IDS, OUTSIDE_WALL, R71_DOCUMENT } from './fixtures.client.ts'

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: query !== '(min-width: 1366px)', addEventListener() {}, removeEventListener() {} })))
  vi.setSystemTime(Date.parse('2026-11-04T15:00:00Z'))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve() }) }

const entry = (id: string, keycaps: readonly (readonly string[])[]): ShortcutCatalogEntry => ({
  id: id as ShortcutCommandId, label: id, aliases: [], keys: keycaps.flat(), keycaps, aria: undefined,
  binding: keycaps.length > 0 ? { code: 'Enter', modifiers: ['shift', 'meta'] } : null, modified: false, conflicts: [], issue: null,
})
const CATALOG: readonly ShortcutCatalogEntry[] = [entry('records.decision.record', [['⇧', '⌘', 'Enter']]), entry('records.part.reject', [])]
const FIXED: readonly ShortcutFixedCatalogEntry[] = [
  { id: 'records.row.open' as ShortcutCommandId, label: 'Open', keys: ['↵'], keycaps: [['↵']], bindings: [], group: 'application' },
]

/**
 * Mount the panel over a model of the fixture API.
 * @param api - the Records API.
 * @param route - the first route.
 * @returns the model, the context menu spy and the API.
 */
async function mount(api: RecordsApi = createFixtureApi().api, route: Route = TAB_ROUTE.intake) {
  const model = createRecordsModel(api, route)
  const openMenu = vi.fn((_target: { readonly kind: string; readonly value: IntakeRowTarget }, _point: MenuPoint) => {})
  const props = {
    t: makeTranslate(en),
    useScreen: bindSnapshotSelector(model.screen),
    useMe: bindSnapshotSelector(model.me),
    useWaitingCount: bindSnapshotSelector(model.waitingCount),
    useCatalog: bindSnapshotSelector(createSnapshotStore(CATALOG)),
    useFixedCatalog: bindSnapshotSelector(createSnapshotStore(FIXED)),
    useLanguage: bindSnapshotSelector(createSnapshotStore<LocaleId>('en')),
    useContextMenu: contextMenuHook(openMenu),
    navigate: (next: Route) => { model.navigate(next) },
    retry: () => { model.retry() },
    refresh: () => { model.refresh() },
    perform: (acts: readonly Act[]) => model.perform(acts),
    contentHref: (document: DocumentId) => api.contentHref(document),
    keyActs: new KeyActRegistry(),
    commandItems: new CommandItemRegistry(),
    linkOf: (next: Route) => `https://firm.test/?records=${next.view}`,
    openSearch: () => {},
  } as PanelProps
  render(<RecordsPanel {...props} />)
  await flush()
  return { model, openMenu }
}

describe('the Matters panel', () => {
  it('lists the 22 waiting letters in six groups with the count on the Intake tab', async () => {
    await mount()
    const tabs = screen.getByRole('navigation', { name: 'Views' })
    expect(within(tabs).getByRole('button', { name: /Intake/ }).textContent).toBe('Intake22')
    expect(within(tabs).getByRole('button', { name: /Intake/ }).getAttribute('aria-current')).toBe('page')
    const groups = [...document.querySelectorAll('[data-atlas]')].map(group => group.textContent)
    expect(groups).toEqual(['Match proposed', 'No matter found', 'Two or more matters', 'Kind proposed', 'Duplicate proposed', 'Unreadable'])
    expect(screen.getAllByRole('checkbox')).toHaveLength(22)
    expect(screen.getAllByText('Rule 71(3) communication')).toHaveLength(3)
    expect(screen.getByText('Scanned letter with no text')).toBeTruthy()
    expect(screen.getAllByText('Yesterday').length).toBeGreaterThan(0)
    expect(screen.getAllByText('2 matters')).toHaveLength(2)
    expect(document.body.textContent).not.toContain(OUTSIDE_WALL.name)
  })

  it('opens a letter beside the list with its decision, pager and breadcrumb, and files it', async () => {
    const { api, acts } = createFixtureApi()
    const { model } = await mount(api)
    fireEvent.click(screen.getAllByText('Rule 71(3) communication')[0]!)
    await flush()
    expect(model.screen.getSnapshot()).toMatchObject({ view: 'intake', open: R71_DOCUMENT })
    expect(screen.getByRole('region', { name: 'Your decision' })).toBeTruthy()
    expect(screen.getByText('Which matter is this letter for?')).toBeTruthy()
    expect(screen.getAllByText('Pressure sensor housing', { selector: 'dd' })[0]!.textContent).toBe('FL-2026-0001Pressure sensor housing')
    expect(screen.getByLabelText('Letter 1 of 22').textContent).toBe('1 / 22')
    const lede = /^Jonas Weber forwarded this letter to the AI mailbox\. The file number on page 1 names one matter\.$/
    expect(screen.getByText(lede)).toBeTruthy()
    const record = screen.getByRole('button', { name: /Accept and file/ })
    expect(record.querySelector('kbd')?.textContent).toBe('⇧⌘↵')
    fireEvent.click(record)
    await flush()
    expect(acts.at(-1)?.command).toEqual({ kind: 'intake.match', document: R71_DOCUMENT, fileNumber: 'FL-2026-0001' })
    fireEvent.click(screen.getByRole('button', { name: 'Next letter' }))
    await flush()
    expect(screen.getByLabelText('Letter 2 of 22')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Previous letter' }))
    await flush()
    fireEvent.click(screen.getAllByRole('button', { name: /Other matter/ }).at(-1)!)
    await flush()
    expect(screen.getByRole('button', { name: 'Choose a matter…' })).toBeTruthy()
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Location' })).getByRole('button', { name: 'Intake' }))
    await flush()
    expect(model.screen.getSnapshot()).toMatchObject({ view: 'intake', open: null })
  })

  it('records a not relevant act with its reason', async () => {
    const { api, acts } = createFixtureApi()
    const { model } = await mount(api)
    model.navigate({ view: 'intake', list: 'waiting', open: R71_DOCUMENT as DocumentId, step: 'reason' })
    await flush()
    fireEvent.change(screen.getByLabelText('Why is this letter not relevant?'), { target: { value: 'Advertising' } })
    fireEvent.click(screen.getByRole('button', { name: 'Mark not relevant' }))
    await flush()
    expect(acts.at(-1)?.command).toEqual({ kind: 'intake.notRelevant', document: R71_DOCUMENT, reason: 'Advertising' })
  })

  it('selects rows with a range and accepts the letters with a proposed matter in one act each', async () => {
    const { api, acts } = createFixtureApi()
    await mount(api)
    const boxes = screen.getAllByRole('checkbox')
    fireEvent.click(boxes[0]!)
    fireEvent.click(boxes[2]!, { shiftKey: true })
    await flush()
    expect(screen.getByText('3 selected')).toBeTruthy()
    fireEvent.click(boxes[1]!)
    fireEvent.click(boxes[1]!)
    fireEvent.click(screen.getAllByRole('button', { name: /Accept and file 3/ })[0]!)
    await flush()
    expect(acts.map(act => act.command.kind)).toEqual(['intake.match', 'intake.match', 'intake.match'])
    expect(new Set(acts.map(act => act.key)).size).toBe(3)
    fireEvent.click(screen.getAllByRole('checkbox')[9]!)
    await flush()
    expect(screen.getAllByRole('button', { name: /Accept and file 0/ })[0]).toHaveProperty('disabled', true)
    fireEvent.keyDown(screen.getByText('1 selected'), { key: 'Escape' })
    await flush()
    expect(screen.queryByText('1 selected')).toBeNull()
  })

  it('opens the row context menu on the row', async () => {
    const { openMenu } = await mount()
    fireEvent.contextMenu(screen.getAllByText('Rule 71(3) communication')[0]!, { clientX: 10, clientY: 20 })
    expect(openMenu).toHaveBeenCalledWith({ kind: 'records.intake-row', value: { document: R71_DOCUMENT, list: 'waiting', proposed: 'FL-2026-0001' } }, expect.anything())
  })

  it('shows the empty list with the next step', async () => {
    const { model } = await mount()
    model.navigate({ view: 'intake', list: 'not-relevant', open: null })
    await flush()
    expect(screen.getByText('No letters marked not relevant')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Show filed today/ }))
    await flush()
    expect(model.screen.getSnapshot()).toMatchObject({ list: 'filed-today' })
  })

  it('walks the matters, the matter, the deadline, the board and the work', async () => {
    const { api, acts } = createFixtureApi()
    const { model } = await mount(api)
    fireEvent.click(screen.getByRole('button', { name: 'Matters' }))
    await flush()
    expect(screen.getByRole('list', { name: 'Matters' }).children).toHaveLength(9)
    expect(screen.getByText('117 days left')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Pressure sensor housing/ }))
    await flush()
    expect(screen.getByRole('heading', { level: 1, name: 'Pressure sensor housing' })).toBeTruthy()
    expect(screen.getByText('Deadline proposed')).toBeTruthy()
    expect(screen.getByText('Jonas Weber', { selector: 'b' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Rule 71\(3\) communication/ }))
    await flush()
    expect(model.screen.getSnapshot().view).toBe('work')
    model.navigate({ view: 'matter', fileNumber: 'FL-2026-0001' as FileNumber })
    await flush()
    fireEvent.click(screen.getByRole('button', { name: /Mon, 1 Mar 2027/ }))
    await flush()
    expect(screen.getByText('Monday, 1 March 2027')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Confirm deadline/ }))
    await flush()
    expect(acts.at(-1)?.command).toEqual({ kind: 'deadline.confirm', id: FIXTURE_IDS.deadline, seen: 141 })
    fireEvent.click(screen.getByRole('button', { name: /Reject/ }))
    fireEvent.change(screen.getByLabelText('Why is this date wrong?'), { target: { value: 'Wrong period' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    await flush()
    expect(acts.at(-1)?.command).toEqual({ kind: 'deadline.reject', id: FIXTURE_IDS.deadline, reason: 'Wrong period' })
    const crumbs = screen.getByRole('navigation', { name: 'Location' })
    expect(crumbs.textContent).toContain('Deadline Mon, 1 Mar 2027')
    fireEvent.click(within(crumbs).getByRole('button', { name: 'Pressure sensor housing' }))
    await flush()
    expect(model.screen.getSnapshot().view).toBe('matter')
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Location' })).getByRole('button', { name: 'Matters' }))
    await flush()
    expect(model.screen.getSnapshot().view).toBe('matters')
    fireEvent.click(screen.getByRole('button', { name: 'Work' }))
    await flush()
    expect(screen.getAllByRole('article')).toHaveLength(8)
    expect(screen.getAllByText('In the docket')).toHaveLength(2)
    fireEvent.click(screen.getAllByRole('button', { name: 'Rule 71(3) communication' })[0]!)
    await flush()
    expect(screen.getByText('Missing evidence')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Record decision/ })).toHaveProperty('disabled', true)
    expect(screen.getAllByText('Statement 5 has no source, so Accept waits.').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Find the source' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove from the draft' }))
    const workCrumbs = screen.getByRole('navigation', { name: 'Location' })
    expect(workCrumbs.textContent).toContain('FL-2026-0001')
    fireEvent.click(within(workCrumbs).getByRole('button', { name: 'FL-2026-0001' }))
    await flush()
    expect(model.screen.getSnapshot().view).toBe('matter')
    expect(document.body.textContent).not.toContain(OUTSIDE_WALL.name)
  })

  it('records the work decision when every statement has a span', async () => {
    const { api, acts } = createFixtureApi()
    const reports = fixtures.ticket.reports.map(report => ({ ...report, statements: report.statements.slice(0, 4) }))
    const complete = { ...fixtures.ticket, deadline: null, reports }
    vi.spyOn(api, 'ticket').mockResolvedValue({ ok: true, value: complete })
    await mount(api, { view: 'work', id: FIXTURE_IDS.ticket as TicketId })
    fireEvent.click(screen.getByRole('button', { name: /Record decision/ }))
    await flush()
    expect(acts.at(-1)?.command).toMatchObject({ kind: 'ticket.decide', deadlineCheck: { id: 'none-yet', state: 'none-yet', seq: 142 } })
  })

  it('says who decides when the person may not', async () => {
    const { api } = createFixtureApi()
    vi.spyOn(api, 'deadline').mockResolvedValue({ ok: true, value: { ...fixtures.deadline, mayConfirm: { allowed: false, reason: 'proposer', decider: fixtures.matter.team[1]! } } })
    vi.spyOn(api, 'intakeDocument').mockResolvedValue({ ok: true, value: { ...fixtures.intakeDocument, proposed: null, mail: { ...fixtures.intakeDocument.mail, forwarder: null }, mayDecide: { allowed: false, reason: 'decided', decider: null } } })
    const { model } = await mount(api, { view: 'deadline', id: FIXTURE_IDS.deadline as DeadlineId })
    expect(screen.getByText('Jonas Weber decides this.')).toBeTruthy()
    model.navigate({ view: 'intake', list: 'waiting', open: R71_DOCUMENT as DocumentId })
    await flush()
    expect(screen.getByText('Another person decides this.')).toBeTruthy()
  })

  it('keeps the last data under the error notice and tries again', async () => {
    const { api } = createFixtureApi()
    let down = false
    vi.spyOn(api, 'matters').mockImplementation(() => Promise.resolve(down ? { ok: false, error: { kind: 'network' } } : { ok: true, value: fixtures.matters }))
    const { model } = await mount(api, { view: 'matters' })
    down = true
    model.refresh()
    await flush()
    expect(screen.getByRole('alert').textContent).toMatch(/FlowLeap could not load this view\. It shows the data as of \d\d:\d\d\./)
    expect(screen.getByRole('list', { name: 'Matters' })).toBeTruthy()
    down = false
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }))
    await flush()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows the error with no data and the empty matters list', async () => {
    const { api } = createFixtureApi()
    vi.spyOn(api, 'matters').mockResolvedValueOnce({ ok: false, error: { kind: 'network' } }).mockResolvedValue({ ok: true, value: { rows: [] } })
    await mount(api, { view: 'matters' })
    expect(screen.getByRole('alert').textContent).toContain('Nothing in the record changed.')
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }))
    await flush()
    expect(screen.getByText('No matters yet')).toBeTruthy()
  })

  it('shows the loading state of every view after 150 ms', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.parse('2026-11-04T15:00:00Z'))
    const never = () => new Promise<Fetched<never>>(() => {})
    const api: RecordsApi = {
      me: never, matters: never, matter: never, deadline: never, intake: never, intakeDocument: never, tickets: never, ticket: never,
      perform: () => Promise.resolve({ ok: true, value: null }), contentHref: () => '',
    }
    const { model } = await mount(api, { view: 'intake', list: 'waiting', open: R71_DOCUMENT as DocumentId })
    const routes: Route[] = [{ view: 'matters' }, { view: 'matter', fileNumber: 'FL-1' as FileNumber }, { view: 'deadline', id: 'd' as DeadlineId }, { view: 'work', id: 'w' as TicketId }, { view: 'board' }]
    await act(async () => { await vi.advanceTimersByTimeAsync(SKELETON_DELAY_MS) })
    expect(screen.getAllByRole('status', { name: 'Loading' })).toHaveLength(2)
    for (const route of routes) {
      act(() => { model.navigate(route) })
      await act(async () => { await vi.advanceTimersByTimeAsync(SKELETON_DELAY_MS) })
      expect(screen.getByRole('status', { name: 'Loading' })).toBeTruthy()
    }
    act(() => { model.navigate({ view: 'intake', list: 'waiting', open: R71_DOCUMENT as DocumentId }) })
    expect(screen.getByRole('navigation', { name: 'Location' }).textContent).toBe('Intake')
  })

  it('shows the error notice on every view whose read fails', async () => {
    const down = () => Promise.resolve<Fetched<never>>({ ok: false, error: { kind: 'refused', status: 503, code: null, detail: null } })
    const api: RecordsApi = {
      me: down, matters: down, matter: down, deadline: down, intake: down, intakeDocument: down, tickets: down, ticket: down,
      perform: () => Promise.resolve({ ok: true, value: null }), contentHref: () => '',
    }
    const { model } = await mount(api, { view: 'intake', list: 'waiting', open: R71_DOCUMENT as DocumentId })
    expect(screen.getAllByRole('alert')).toHaveLength(2)
    expect(screen.getByRole('navigation', { name: 'Location' }).textContent).toBe('Intake')
    const routes: Route[] = [{ view: 'matters' }, { view: 'matter', fileNumber: 'FL-1' as FileNumber }, { view: 'deadline', id: 'd' as DeadlineId }, { view: 'work', id: 'w' as TicketId }, { view: 'board' }]
    for (const route of routes) {
      act(() => { model.navigate(route) })
      await flush()
      expect(screen.getByRole('alert').textContent).toContain('FlowLeap could not load this view.')
    }
    expect(screen.getByRole('navigation', { name: 'Views' })).toBeTruthy()
  })

  it('renders sparse records: no person, no forwarder, no matter, no letter, and no decision bar before the person is known', async () => {
    const { api } = createFixtureApi()
    const rows = fixtures.intake.rows
    vi.spyOn(api, 'me').mockResolvedValue({ ok: false, error: { kind: 'network' } })
    vi.spyOn(api, 'intake').mockResolvedValue({ ok: true, value: { ...fixtures.intake, rows: [
      { ...rows[0]!, status: { machine: 'intake', state: 'filed' }, forwarder: null },
      { ...rows[1]!, matter: null },
    ] } })
    vi.spyOn(api, 'intakeDocument').mockResolvedValue({ ok: true, value: { ...fixtures.intakeDocument, proposed: { ...fixtures.intakeDocument.proposed!, responsible: null } } })
    vi.spyOn(api, 'matter').mockResolvedValue({ ok: true, value: { ...fixtures.matter, responsible: null, matter: { ...fixtures.matter.matter, applicationNumber: null } } })
    vi.spyOn(api, 'ticket').mockResolvedValue({ ok: true, value: { ...fixtures.ticket, letter: null } })
    vi.spyOn(api, 'tickets').mockResolvedValue({ ok: true, value: { rows: [{ ...fixtures.tickets.rows[0]!, deadline: null, due: null }] } })
    const { model, openMenu } = await mount(api, { view: 'intake', list: 'filed-today', open: rows[0]!.document })
    expect(screen.getByText('Filed')).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Your decision' })).toBeNull()
    expect(screen.getAllByText('None').length).toBeGreaterThan(0)
    fireEvent.contextMenu(screen.getByText('Communication under Article 94(3) EPC'))
    expect(openMenu.mock.calls[0]![0].value.proposed).toBeNull()
    for (const route of [{ view: 'matter', fileNumber: 'FL-2026-0001' as FileNumber }, { view: 'deadline', id: FIXTURE_IDS.deadline as DeadlineId }, { view: 'work', id: FIXTURE_IDS.ticket as TicketId }, { view: 'board' }] satisfies Route[]) {
      act(() => { model.navigate(route) })
      await flush()
      expect(screen.queryByRole('region', { name: 'Your decision' })).toBeNull()
    }
    expect(screen.getByRole('article').textContent).not.toContain('Deadline')
    act(() => { model.navigate({ view: 'work', id: FIXTURE_IDS.ticket as TicketId }) })
    await flush()
    expect(screen.getByRole('navigation', { name: 'Location' }).textContent).toContain('Letter')
  })

  it('draws the launcher glyph', () => {
    const { container } = render(<MattersIcon size={16} />)
    expect(container.querySelector('svg')).not.toBeNull()
  })
})
