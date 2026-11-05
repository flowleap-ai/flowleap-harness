// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector, contextMenuHook, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { LocaleId } from '@deepseek-ai/dsh-client-locale/client'
import type {
  Act, DeadlineDetail, DeadlineId, DocumentId, Fetched, FileNumber, IsoDate, MatterDetail, RecordsApi, TicketDetail, TicketId,
} from '../src/client/api.ts'
import { CommandItemRegistry, KeyActRegistry } from '../src/client/key-layer.ts'
import type { CommandName } from '../src/client/keys.ts'
import { de, en } from '../src/client/locales.ts'
import { createRecordsModel, type Route } from '../src/client/model.ts'
import { RecordsPanel, type PanelProps } from '../src/client/Panel.tsx'
import { agentProps } from './agent-fakes.client.tsx'
import { createFixtureApi, fixtures, FIXTURE_IDS, OUTSIDE_WALL, PEOPLE, R71_DOCUMENT, uuid } from './fixtures.client.ts'

const opened = vi.fn()
beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener() {}, removeEventListener() {} })))
  vi.setSystemTime(Date.parse('2026-11-04T15:00:00Z'))
  opened.mockReset()
  vi.spyOn(window, 'open').mockImplementation((url) => { opened(String(url)); return null })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve() }) }

const DEADLINE = { view: 'deadline', id: FIXTURE_IDS.deadline as DeadlineId } as const satisfies Route
const WORK = { view: 'work', id: FIXTURE_IDS.ticket as TicketId } as const satisfies Route
const MATTER = { view: 'matter', fileNumber: 'FL-2026-0001' as FileNumber } as const satisfies Route

/** The first four statements: each has a span. */
const sourced: TicketDetail = {
  ...fixtures.ticket,
  reports: fixtures.ticket.reports.map(report => ({ ...report, statements: report.statements.slice(0, 4) })),
}

/**
 * Mount the panel over a model of a fixture API with overrides.
 * @param route - the first route.
 * @param overrides - answers that replace the fixtures.
 * @param language - the UI language.
 * @param fixture - the fixture API and its acts.
 * @returns the acts sent, the model and the key handlers.
 */
async function mount(
  route: Route,
  overrides: { deadline?: DeadlineDetail; ticket?: TicketDetail; matter?: MatterDetail; perform?: RecordsApi['perform'] } = {},
  language: 'en' | 'de' = 'en',
  { api, acts } = createFixtureApi(),
) {
  if (overrides.deadline !== undefined) vi.spyOn(api, 'deadline').mockResolvedValue({ ok: true, value: overrides.deadline })
  if (overrides.ticket !== undefined) vi.spyOn(api, 'ticket').mockResolvedValue({ ok: true, value: overrides.ticket })
  if (overrides.matter !== undefined) vi.spyOn(api, 'matter').mockResolvedValue({ ok: true, value: overrides.matter })
  if (overrides.perform !== undefined) vi.spyOn(api, 'perform').mockImplementation(overrides.perform)
  const model = createRecordsModel(api, route)
  const keyActs = new KeyActRegistry()
  const commandItems = new CommandItemRegistry()
  const props = {
    ...agentProps().props,
    t: makeTranslate(language === 'de' ? de : en),
    useScreen: bindSnapshotSelector(model.screen),
    useMe: bindSnapshotSelector(model.me),
    useWaitingCount: bindSnapshotSelector(model.waitingCount),
    useCatalog: bindSnapshotSelector(createSnapshotStore([])),
    useFixedCatalog: bindSnapshotSelector(createSnapshotStore([])),
    useLanguage: bindSnapshotSelector(createSnapshotStore<LocaleId>(language)),
    useContextMenu: contextMenuHook(),
    navigate: (next: Route) => { model.navigate(next) },
    retry: () => { model.retry() },
    refresh: () => { model.refresh() },
    perform: (sent: readonly Act[]) => model.perform(sent),
    contentHref: (document: DocumentId) => api.contentHref(document),
    keyActs,
    commandItems,
  } as PanelProps
  render(<RecordsPanel {...props} />)
  await flush()
  const press = async (name: CommandName) => {
    const run = keyActs.handler(name)
    if (run === undefined) throw new Error(`no handler for ${name}`)
    act(() => { run() })
    await flush()
  }
  return { acts, model, keyActs, commandItems, press }
}

const bar = () => screen.getByRole('region', { name: 'Your decision' })

describe('the matters list', () => {
  it('lists the matters with their next due date and opens one', async () => {
    const { model, keyActs } = await mount({ view: 'matters' })
    const table = screen.getByRole('table', { name: 'Matters' })
    expect(within(table).getAllByRole('row')).toHaveLength(10)
    expect(table.textContent).toContain('117 days left')
    expect(table.textContent).toContain('No deadline')
    expect(screen.getAllByRole('img', { name: 'Responsible: Dr. Anna Becker' }).length).toBeGreaterThan(0)
    const buttons = within(table).getAllByRole('button')
    act(() => { keyActs.handler('next')?.() })
    expect(document.activeElement).toBe(buttons[0])
    act(() => { keyActs.handler('next')?.() })
    act(() => { keyActs.handler('previous')?.() })
    act(() => { keyActs.handler('previous')?.() })
    expect(document.activeElement).toBe(buttons[0])
    fireEvent.click(buttons[0]!)
    await flush()
    expect(model.screen.getSnapshot()).toMatchObject({ view: 'matter', fileNumber: 'FL-2026-0001' })
  })

  it('names a closed matter', async () => {
    const { api } = createFixtureApi()
    const rows = fixtures.matters.rows.map((row, index) => index === 0 ? { ...row, state: 'closed' as const, responsible: null } : row)
    const model = createRecordsModel({ ...api, matters: () => Promise.resolve({ ok: true, value: { rows } }) }, { view: 'matters' })
    const props = {
      t: makeTranslate(en), useScreen: bindSnapshotSelector(model.screen), useMe: bindSnapshotSelector(model.me),
      useWaitingCount: bindSnapshotSelector(model.waitingCount), useCatalog: bindSnapshotSelector(createSnapshotStore([])),
      useFixedCatalog: bindSnapshotSelector(createSnapshotStore([])), useLanguage: bindSnapshotSelector(createSnapshotStore<LocaleId>('en')), useAsk: bindSnapshotSelector(createSnapshotStore(null)),
      useContextMenu: contextMenuHook(), navigate: () => {}, retry: () => {}, refresh: () => {},
      perform: () => Promise.resolve({ failed: [] }),
      contentHref: () => '', keyActs: new KeyActRegistry(), commandItems: new CommandItemRegistry(),
    } as PanelProps
    render(<RecordsPanel {...props} />)
    await flush()
    expect(screen.getByText('Kessler Sensorik GmbH · closed')).toBeTruthy()
  })

  it('shows skeleton rows on the list\'s column grid while loading, then the empty list with its next step', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    vi.setSystemTime(Date.parse('2026-11-04T15:00:00Z'))
    const fixture = createFixtureApi()
    let answer: ((value: Fetched<{ rows: [] }>) => void) | null = null
    vi.spyOn(fixture.api, 'matters').mockImplementation(() => new Promise((resolve) => { answer = resolve }))
    const { model, keyActs } = await mount({ view: 'matters' }, {}, 'en', fixture)
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    expect(document.querySelector('[role="status"][aria-label="Loading"] svg')).toBeNull()
    const table = within(screen.getByRole('status', { name: 'Loading' })).getByRole('table', { name: 'Matters' })
    expect(table.className).toContain('mattersColumns')
    expect(within(table).getAllByRole('columnheader').map(cell => cell.textContent)).toEqual(['', 'Matter', 'File number', '', 'Open deadlines', 'Next due'])
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(6)
    for (const row of rows) expect(within(row).getAllByRole('cell')).toHaveLength(6)
    await act(async () => { answer?.({ ok: true, value: { rows: [] } }) })
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    expect(screen.getByText('No matters yet')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Go to Intake/ })).toBeTruthy()
    act(() => { keyActs.handler('goIntake')?.() })
    expect(model.screen.getSnapshot()).toMatchObject({ view: 'intake' })
  })
})

describe('the matter page', () => {
  it('shows the facts, the four tables with their status words, the properties and Activity, and opens each record', async () => {
    const { model, commandItems } = await mount(MATTER)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Pressure sensor housing')
    expect(document.body.textContent).toContain('1deadline waits for a second person')
    expect(document.body.textContent).toContain('1work item waits for Dr. Anna Becker')
    for (const name of ['Deadlines', 'Work', 'Office events', 'Documents']) expect(screen.getByRole('table', { name })).toBeTruthy()
    const deadlines = screen.getByRole('table', { name: 'Deadlines' })
    expect(within(deadlines).getAllByRole('row')[1]!.querySelector('[data-atlas]')?.getAttribute('data-atlas')).toBe('deadline.deadline_proposed')
    expect(deadlines.textContent).toContain('Rule 71(3) EPC')
    expect(deadlines.textContent).toContain('117 days left')
    const panel = screen.getByRole('complementary', { name: 'Properties' })
    expect(panel.textContent).toContain('3 people')
    expect(panel.textContent).toContain('EP 24 123 456.7')
    expect(panel.textContent).toContain('Next deadline')
    expect(screen.getByRole('table', { name: 'Office events' }).textContent).toContain('Not recorded')
    expect(screen.getByRole('table', { name: 'Documents' }).textContent).toContain('Rule 71(3) communication')
    expect(document.querySelector('[data-audit]')).not.toBeNull()
    expect(commandItems.item()?.label).toBe('FL-2026-0001 · Pressure sensor housing')
    fireEvent.click(within(screen.getByRole('table', { name: 'Documents' })).getByRole('button'))
    expect(opened).toHaveBeenCalledWith(`records/api/documents/${R71_DOCUMENT}/content`)
    fireEvent.click(within(screen.getByRole('table', { name: 'Office events' })).getByRole('button'))
    await flush()
    expect(model.screen.getSnapshot().view).toBe('deadline')
    act(() => { model.navigate(MATTER) })
    await flush()
    fireEvent.click(within(screen.getByRole('table', { name: 'Work' })).getByRole('button'))
    await flush()
    expect(model.screen.getSnapshot().view).toBe('work')
    act(() => { model.navigate(MATTER) })
    await flush()
    const acts = commandItems.item()!.groups[0]!.acts
    act(() => { acts[1]!.run() })
    await flush()
    expect(model.screen.getSnapshot().view).toBe('work')
    act(() => { model.navigate(MATTER) })
    await flush()
    act(() => { acts[0]!.run() })
    await flush()
    expect(model.screen.getSnapshot().view).toBe('deadline')
    expect(document.body.textContent).not.toContain(OUTSIDE_WALL.name)
  })

  it('words a sparse matter: no responsible, no deadline, an office event with only its letter, and an agent document', async () => {
    const matter: MatterDetail = {
      ...fixtures.matter,
      responsible: null,
      deadlines: [],
      work: [{ ...fixtures.matter.work[0]!, routedTo: null }, { ...fixtures.matter.work[0]!, id: uuid(20) as TicketId, routedTo: PEOPLE.jonas as never, state: 'proposals_ready' }],
      officeEvents: [
        { ...fixtures.matter.officeEvents[0]!, receivedAt: '2026-11-02' as never },
        { ...fixtures.matter.officeEvents[0]!, id: uuid(21) as never, document: null, documentDate: null },
      ],
      documents: [...fixtures.matter.documents, { sha256: 'b'.repeat(64) as DocumentId, fileName: 'other.pdf', mediaType: 'application/pdf', source: 'mail', at: '2026-11-04T14:16:00Z' as never }, { ...fixtures.matter.documents[0]!, sha256: 'c'.repeat(64) as DocumentId, source: 'agent' }],
    }
    await mount(MATTER, { matter })
    expect(screen.getByRole('complementary', { name: 'Properties' }).textContent).toContain('None')
    expect(screen.getByRole('complementary', { name: 'Properties' }).textContent).not.toContain('Next deadline')
    expect(document.body.textContent).toContain('1work item waits for Jonas Weber')
    expect(document.body.textContent).not.toContain('deadline waits')
    expect(screen.getByRole('table', { name: 'Office events' }).textContent).toContain('2 Nov 2026')
    expect(screen.getByRole('table', { name: 'Documents' }).textContent).toContain('Client report')
    expect(screen.getByRole('table', { name: 'Documents' }).textContent).toContain('Letter')
    fireEvent.click(within(screen.getByRole('table', { name: 'Office events' })).getAllByRole('button')[0]!)
    expect(opened).toHaveBeenCalled()
  })

  it('counts two work items that wait for one person', async () => {
    const matter: MatterDetail = {
      ...fixtures.matter,
      deadlines: [fixtures.matter.deadlines[0]!, { ...fixtures.matter.deadlines[0]!, id: uuid(30) as DeadlineId }],
      work: [fixtures.matter.work[0]!, { ...fixtures.matter.work[0]!, id: uuid(31) as TicketId }],
    }
    await mount(MATTER, { matter })
    expect(document.body.textContent).toContain('2deadlines wait for a second person')
    expect(document.body.textContent).toContain('2work items wait for Dr. Anna Becker')
    cleanup()
    const outsider = { ...fixtures.matter.work[0]!, routedTo: { id: null, name: null } } as const
    await mount(MATTER, { matter: { ...matter, work: [...matter.work, outsider, { ...outsider, id: uuid(32) as TicketId }] } })
    expect(document.body.textContent).toContain('2work items wait for a person outside the team')
    expect(screen.getAllByRole('img', { name: 'For a person outside the team' }).every(avatar => avatar.textContent === '')).toBe(true)
    cleanup()
    await mount(MATTER, { matter: { ...fixtures.matter, deadlines: [{ ...fixtures.matter.deadlines[0]!, state: 'active' }], work: [] } })
    expect(document.body.textContent).not.toContain('waits for')
    expect(screen.getByRole('complementary', { name: 'Properties' }).textContent).toContain('Next deadline')
  })

  it('marks an overdue active deadline in its row, in a fact chip and in the next deadline, with the warning glyph', async () => {
    const overdue = { ...fixtures.matter.deadlines[0]!, state: 'active' as const, due: '2026-03-02' as IsoDate }
    await mount(MATTER, { matter: { ...fixtures.matter, deadlines: [overdue, { ...overdue, id: uuid(32) as DeadlineId, state: 'rejected' }], work: [] } })
    const marks = [...document.querySelectorAll<HTMLElement>('[data-overdue]')]
    const where = (element: HTMLElement) => element.closest('[role="table"], aside')?.getAttribute('aria-label') ?? 'facts'
    expect(marks.map(mark => [where(mark), mark.textContent])).toEqual([
      ['facts', '1'],
      ['Deadlines', 'Overdue by 247 days'],
      ['Deadlines', 'Overdue by 247 days'],
      ['Deadlines', 'Overdue by 247 days'],
      ['Deadlines', 'Overdue by 247 days'],
      ['Properties', 'Overdue by 247 days'],
    ])
    for (const mark of marks) {
      expect(mark.firstElementChild!.tagName.toLowerCase()).toBe('svg')
      expect(mark.querySelector('[data-shape]')).toBeNull()
    }
    expect(document.body.textContent).toContain('1deadline is overdue')
    expect(screen.getByRole('complementary', { name: 'Properties' }).textContent).toContain('Mon, 2 Mar 2026Overdue by 247 days')
    cleanup()
    await mount(MATTER, { matter: { ...fixtures.matter, deadlines: [overdue, { ...overdue, id: uuid(33) as DeadlineId, state: 'deadline_proposed' }], work: [] } })
    expect(document.body.textContent).toContain('2deadlines are overdue')
  })
})

describe('the deadline page', () => {
  it('shows the due date as the key fact, the calculation, both readings with their spans and the legal sources', async () => {
    await mount(DEADLINE)
    expect(screen.getByText('Monday, 1 March 2027')).toBeTruthy()
    expect(screen.getByText('117 days left')).toBeTruthy()
    expect(document.body.textContent).toContain('Rule 71(3) EPC: intention to grant · four months from the communication of 30 Oct 2026')
    const steps = screen.getByRole('list', { name: 'How FlowLeap computed the date' })
    expect(within(steps).getAllByRole('listitem').map(step => step.textContent)).toEqual([
      'Delivered on the date of the letterRule 126(2) EPC · Rule 127(2) EPC · OJ EPO 2023, A29→ 30 Oct 2026',
      'Start of the periodRule 131(2) EPC→ 31 Oct 2026',
      'Period added; that month has no such day, so its last dayRule 71(3) EPC · Rule 131(4) EPC, last day of the month→ Sun, 28 Feb 2027',
      'Moved to the next day the office is openRule 134(1) EPC · EPO calendar 2027→ Mon, 1 Mar 2027',
    ])
    const readings = screen.getByRole('table', { name: 'What FlowLeap read, twice' })
    expect(readings.textContent).toContain('30.10.2026')
    expect(within(readings).getAllByText('EP 24 123 456.7')).toHaveLength(2)
    expect(within(readings).getAllByText('Agree')).toHaveLength(3)
    expect(screen.getByRole('link', { name: 'Rule 134 EPC' }).getAttribute('href')).toBe('https://www.epo.org/en/legal/epc/2020/r134.html')
    const panel = screen.getByRole('complementary', { name: 'Properties' })
    expect(panel.textContent).toContain('4 months')
    expect(panel.textContent).toContain('FlowLeap')
    expect(panel.textContent).toContain('EPO, 30 Oct 2026')
    expect(within(bar()).getByText('You did not record or classify this letter, so you can confirm')).toBeTruthy()
    expect(within(bar()).getByText('4 steps · both readings agree · FlowLeap checks the date again when you confirm')).toBeTruthy()
    expect(screen.getByRole('navigation', { name: 'Location' }).textContent).toContain('Deadline 1 Mar 2027')
    expect(document.body.textContent).not.toContain(OUTSIDE_WALL.name)
  })

  it('confirms with the record position the person saw, from the button and from ⇧⌘↵', async () => {
    const { acts, press } = await mount(DEADLINE)
    fireEvent.click(within(bar()).getByRole('button', { name: /Confirm deadline/ }))
    await flush()
    expect(acts.at(-1)?.command).toEqual({ kind: 'deadline.confirm', id: FIXTURE_IDS.deadline, seen: 141 })
    await press('record')
    expect(acts).toHaveLength(2)
    expect(acts[1]!.command).toEqual(acts[0]!.command)
    expect(acts[1]!.key).not.toBe(acts[0]!.key)
  })

  it('rejects with a reason from 2, opens the letter with O, shows the calculation with C and goes to the matter with G M', async () => {
    const { acts, press, model, commandItems } = await mount(DEADLINE)
    await press('reject')
    fireEvent.change(screen.getByLabelText('Why is this date wrong?'), { target: { value: 'Wrong period' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    await flush()
    expect(acts.at(-1)?.command).toEqual({ kind: 'deadline.reject', id: FIXTURE_IDS.deadline, reason: 'Wrong period' })
    await press('openLetter')
    expect(opened).toHaveBeenCalledWith(`records/api/documents/${R71_DOCUMENT}/content`)
    Element.prototype.scrollIntoView = vi.fn()
    await press('calculation')
    expect(document.activeElement).toBe(screen.getByRole('list', { name: 'How FlowLeap computed the date' }))
    const groups = commandItems.item()!.groups
    expect(groups.map(group => group.acts.map(item => item.id))).toEqual([['record', 'reject'], ['open-letter', 'calculation', 'go-matter']])
    act(() => { groups[0]!.acts[1]!.run() })
    expect(screen.getByLabelText('Why is this date wrong?')).toBeTruthy()
    act(() => { groups[0]!.acts[0]!.run() })
    await flush()
    expect(acts.at(-1)?.command.kind).toBe('deadline.confirm')
    await press('goMatter')
    expect(model.screen.getSnapshot().view).toBe('matter')
  })

  it('keeps the evidence and names who confirms when the person proposed the date, with no primary act', async () => {
    const deadline: DeadlineDetail = { ...fixtures.deadline, proposer: fixtures.matter.team[0]!, mayConfirm: { allowed: false, reason: 'proposer', decider: null } }
    const { keyActs } = await mount(DEADLINE, { deadline })
    expect(within(bar()).getByText('You proposed this date, so a second person confirms it.')).toBeTruthy()
    expect(within(bar()).queryByRole('button', { name: /Confirm deadline/ })).toBeNull()
    expect(within(bar()).queryByRole('button', { name: /Reject/ })).toBeNull()
    expect(keyActs.handler('record')).toBeUndefined()
    expect(screen.getByRole('list', { name: 'How FlowLeap computed the date' })).toBeTruthy()
    expect(screen.getByRole('complementary', { name: 'Properties' }).textContent).toContain('Dr. Anna Becker')
  })

  it.each([
    ['code-decider', null, 'You classified this letter, so a second person confirms the date.'],
    ['not-in-team', null, 'Only the team of this matter confirms the date.'],
    ['not-ready', null, 'FlowLeap cannot check the date now. Try again later.'],
    ['decided', PEOPLE.jonas, 'Jonas Weber decides this.'],
  ] as const)('says why for %s', async (reason, decider, text) => {
    await mount(DEADLINE, { deadline: { ...fixtures.deadline, mayConfirm: { allowed: false, reason, decider: decider as never } } })
    expect(within(bar()).getByText(text)).toBeTruthy()
  })

  it('counts an overdue date from today', async () => {
    await mount(DEADLINE, { deadline: { ...fixtures.deadline, deadline: { ...fixtures.deadline.deadline, due: '2026-10-26' as never } } })
    expect(screen.getByText('Overdue by 9 days').hasAttribute('data-overdue')).toBe(true)
  })

  it('marks no date overdue while it is in the future', async () => {
    await mount(DEADLINE, { deadline: fixtures.deadline })
    expect(document.querySelector('[data-overdue]')).toBeNull()
  })

  it('has no decision bar once the date is confirmed or rejected', async () => {
    await mount(DEADLINE, { deadline: { ...fixtures.deadline, deadline: { ...fixtures.deadline.deadline, state: 'active' }, confirmer: PEOPLE.jonas as never, mayConfirm: { allowed: false, reason: 'decided', decider: PEOPLE.jonas as never } } })
    expect(screen.queryByRole('region', { name: 'Your decision' })).toBeNull()
    expect(screen.getByText('Confirmed by Jonas Weber')).toBeTruthy()
    cleanup()
    await mount(DEADLINE, { deadline: { ...fixtures.deadline, deadline: { ...fixtures.deadline.deadline, state: 'rejected' }, rejecter: PEOPLE.lena as never, reason: 'Wrong matter', mayConfirm: { allowed: false, reason: 'decided', decider: null } } })
    expect(screen.getByText('Rejected by Lena Hoffmann: Wrong matter')).toBeTruthy()
    cleanup()
    await mount(DEADLINE, { deadline: { ...fixtures.deadline, deadline: { ...fixtures.deadline.deadline, state: 'rejected' }, rejecter: PEOPLE.lena as never, reason: null, mayConfirm: { allowed: false, reason: 'decided', decider: null } } })
    expect(screen.getByText('Rejected by Lena Hoffmann:')).toBeTruthy()
    cleanup()
    await mount(DEADLINE, { deadline: { ...fixtures.deadline, deadline: { ...fixtures.deadline.deadline, state: 'stale' } } })
    expect(screen.queryByText('Waits for a second person')).toBeNull()
  })

  it('words readings that differ, a single reading, no reading, the engine notes and a rule it does not know', async () => {
    const differ: DeadlineDetail = {
      ...fixtures.deadline,
      deadline: {
        ...fixtures.deadline.deadline,
        trace: [...fixtures.deadline.deadline.trace, { op: 'add-period', from: '2026-10-31' as never, to: '2027-02-28' as never, cite: 'Rule 131(4) EPC' }, { op: 'closure-roll', from: '2027-03-01' as never, to: '2027-03-01' as never, cite: 'Rule 134(1) EPC' }, { op: 'other', from: '2027-03-01' as never, to: '2027-03-01' as never, cite: 'x' }],
        notes: [{ kind: 'late-receipt', text: 'late', cite: 'Rule 126(2) EPC' }, { kind: 'other', text: 'An engine note.', cite: '' }],
        sources: [],
      },
      officeEvent: { ...fixtures.deadline.officeEvent, code: 'EPO:UNKNOWN', documentDate: null, document: null },
      readers: { ...fixtures.deadline.readers, model: { model: 'm', result: { code: 'EPO:R71(3)', documentDate: '2026-10-03' as never, applicationNumber: null } }, agree: false },
    }
    const { keyActs } = await mount(DEADLINE, { deadline: differ })
    expect(within(bar()).getByText(/the readings differ, so check the letter/)).toBeTruthy()
    expect(screen.getByText('Differ')).toBeTruthy()
    expect(screen.getAllByText('Not read').length).toBeGreaterThan(0)
    expect(screen.getByText('The office is open on this day')).toBeTruthy()
    expect(screen.getByText('Calculation step')).toBeTruthy()
    expect(screen.getByText('Period added')).toBeTruthy()
    expect(screen.getByText(/The letter reached the firm late/)).toBeTruthy()
    expect(screen.getAllByText('An engine note.').every(cell => cell.closest('[data-audit]') !== null)).toBe(true)
    expect(screen.queryByText('Legal sources')).toBeNull()
    expect(screen.getByRole('complementary', { name: 'Properties' }).textContent).toContain('EPO')
    expect(keyActs.handler('openLetter')).toBeUndefined()
    cleanup()
    const oneReading = { code: null, model: differ.readers.model, agree: null }
    await mount(DEADLINE, { deadline: { ...differ, officeEvent: { ...differ.officeEvent, code: null }, readers: oneReading } })
    expect(within(bar()).getByText(/one reading only/)).toBeTruthy()
    expect(screen.getByRole('complementary', { name: 'Properties' }).textContent).toContain('Not recorded')
    cleanup()
    const empty = { code: null, documentDate: null, applicationNumber: null }
    await mount(DEADLINE, { deadline: { ...differ, readers: { code: { result: empty, fields: {} }, model: null, agree: null } } })
    expect(screen.getAllByText('Not read').length).toBeGreaterThan(0)
    cleanup()
    await mount(DEADLINE, { deadline: { ...differ, officeEvent: { ...differ.officeEvent, code: null, documentDate: '2026-10-30' as never } } })
    expect(screen.getByRole('complementary', { name: 'Properties' }).textContent).toContain(', 30 Oct 2026')
    cleanup()
    await mount(DEADLINE, { deadline: { ...differ, readers: { code: null, model: null, agree: null } } })
    expect(screen.getByText('FlowLeap has no reading of this letter.')).toBeTruthy()
  })

  it('words each engine note by its code, and shows the engine\'s English text only in Audit, also on a German page', async () => {
    const notes = [
      { kind: 'late-receipt', text: 'The letter arrived 12 days after the date it bears.', cite: 'Rule 126(2) EPC' },
      { kind: 'holiday-shift', text: 'An engine note in English.', cite: 'Rule 134 EPC' },
    ]
    await mount(DEADLINE, { deadline: { ...fixtures.deadline, deadline: { ...fixtures.deadline.deadline, notes } } }, 'de')
    const audit = document.querySelector('[data-audit]')!
    const page = (document.body.textContent ?? '').replace(audit.textContent ?? '', '')
    expect(page).toContain(de['deadline.note.lateReceipt'])
    for (const note of notes) {
      expect(page).not.toContain(note.text)
      expect(audit.textContent).toContain(note.text)
      expect(audit.textContent).toContain(note.kind)
    }
  })

  it('after no answer, shows the failure in the bar and tries again with the same act, from Try again or R', async () => {
    let fail = true
    const sent: Act[] = []
    const { press } = await mount(DEADLINE, { perform: (act) => { sent.push(act); return Promise.resolve(fail ? { ok: false, error: { kind: 'network' } } : { ok: true, value: null }) } })
    fireEvent.click(within(bar()).getByRole('button', { name: /Confirm deadline/ }))
    await flush()
    const notice = within(bar()).getByRole('alert')
    expect(notice.textContent).toBe('FlowLeap could not confirm the deadline. FlowLeap did not answer, so it may be recorded. A second try is safe: FlowLeap records it only one time.Try again')
    fireEvent.click(within(notice).getByRole('button', { name: /Try again/ }))
    await flush()
    await press('retry')
    fail = false
    fireEvent.click(within(bar()).getByRole('button', { name: /Confirm deadline/ }))
    await flush()
    expect(sent.map(act => act.key)).toEqual(Array(4).fill(sent[0]!.key))
    expect(within(bar()).queryByRole('alert')).toBeNull()
  })

  it('after a refusal, confirms again with a new act that names the record position on screen now', async () => {
    const { api } = createFixtureApi()
    const sent: Act[] = []
    let seq = 141
    vi.spyOn(api, 'deadline').mockImplementation(() => Promise.resolve({ ok: true, value: { ...fixtures.deadline, recordSeq: seq } }))
    await mount(DEADLINE, {
      perform: (act) => {
        sent.push(act)
        seq = 150
        return Promise.resolve(sent.length === 1 ? { ok: false, error: { kind: 'refused', status: 409, code: 'seen-is-stale', detail: null } } : { ok: true, value: null })
      },
    }, 'en', { api, acts: [] })
    fireEvent.click(within(bar()).getByRole('button', { name: /Confirm deadline/ }))
    await flush()
    expect(within(bar()).getByRole('alert').textContent).toContain('The record changed after you opened the page, so FlowLeap recorded nothing.')
    fireEvent.click(within(within(bar()).getByRole('alert')).getByRole('button', { name: /Try again/ }))
    await flush()
    expect(sent.map(act => act.command)).toEqual([
      { kind: 'deadline.confirm', id: FIXTURE_IDS.deadline, seen: 141 },
      { kind: 'deadline.confirm', id: FIXTURE_IDS.deadline, seen: 150 },
    ])
    expect(sent[1]!.key).not.toBe(sent[0]!.key)
  })

  it('sends one confirm while it runs: the primary is busy, and a click, ⇧⌘↵ and ⌘K send nothing more', async () => {
    let answer: ((result: Fetched<null>) => void) | undefined
    const sent: Act[] = []
    const perform: RecordsApi['perform'] = (act) => {
      sent.push(act)
      return new Promise((resolve) => { answer = resolve })
    }
    const { press, commandItems } = await mount(DEADLINE, { perform })
    const confirm = () => within(bar()).getByRole('button', { name: /Confirm deadline/ })
    fireEvent.click(confirm())
    await flush()
    expect(confirm().getAttribute('aria-busy')).toBe('true')
    expect(confirm().getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(confirm())
    await press('record')
    const record = commandItems.item()!.groups[0]!.acts[0]!
    expect(record.disabled).toBe(true)
    act(() => { record.run() })
    await flush()
    expect(sent).toHaveLength(1)
    await act(async () => { answer?.({ ok: true, value: null }) })
    await flush()
    expect(confirm().getAttribute('aria-busy')).toBeNull()
  })

  it('says when a reject failed, tries it again with its reason, and hides a confirm failure when the reject step opens', async () => {
    const sent: Act[] = []
    const { press } = await mount(DEADLINE, { perform: (act) => { sent.push(act); return Promise.resolve(sent.length < 3 ? { ok: false, error: { kind: 'refused', status: 409, code: 'not-proposed', detail: null } } : { ok: true, value: null }) } })
    fireEvent.click(within(bar()).getByRole('button', { name: /Confirm deadline/ }))
    await flush()
    expect(within(bar()).getByRole('alert').textContent).toContain('FlowLeap refused it and recorded nothing.')
    await press('reject')
    expect(within(bar()).queryByRole('alert')).toBeNull()
    fireEvent.change(screen.getByLabelText('Why is this date wrong?'), { target: { value: 'Wrong period' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    await flush()
    expect(within(bar()).getByRole('alert').textContent).toContain('FlowLeap could not reject the deadline.')
    await press('retry')
    expect(sent.map(act => act.command.kind)).toEqual(['deadline.confirm', 'deadline.reject', 'deadline.reject'])
    expect(sent[2]!.command).toEqual(sent[1]!.command)
    expect(sent[2]!.key).not.toBe(sent[1]!.key)
    expect(within(bar()).queryByRole('alert')).toBeNull()
  })

  it('links only an https legal source and shows any other address as text', async () => {
    const sources = [
      { cite: 'Rule 71 EPC', url: 'https://www.epo.org/en/legal/epc/2020/r71.html' },
      { cite: 'Script', url: 'javascript:alert(1)' },
      { cite: 'Plain', url: 'http://www.epo.org/r71' },
      { cite: 'Relative', url: '/r71' },
    ]
    await mount(DEADLINE, { deadline: { ...fixtures.deadline, deadline: { ...fixtures.deadline.deadline, sources } } })
    expect(screen.getAllByRole('link').map(link => link.textContent)).not.toContain('Script')
    expect(screen.getByRole('link', { name: 'Rule 71 EPC' }).getAttribute('href')).toBe('https://www.epo.org/en/legal/epc/2020/r71.html')
    for (const cite of ['Script', 'Plain', 'Relative']) {
      expect(screen.getByText(cite).tagName).toBe('SPAN')
      expect(screen.getByText(cite).getAttribute('href')).toBeNull()
    }
  })

  it('shows the German copy of the mockups', async () => {
    await mount(DEADLINE, {}, 'de')
    expect(screen.getByText('Wie FlowLeap das Datum berechnet hat')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Ihre Entscheidung' })).getByRole('button', { name: /Frist bestätigen/ })).toBeTruthy()
  })
})

describe('the work on a letter', () => {
  it('shows the client report, each statement with its exact quotes, the related records and the two parts', async () => {
    await mount(WORK)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Rule 71(3) communication of 30 Oct 2026')
    expect(document.body.textContent).toContain('The EPO intends to grant EP 24 123 456.7. The agent drafted the client report. Nothing went to the client.')
    expect(document.body.textContent).toMatch(/Waits for your decision since \d\d:\d\d/)
    expect(document.body.textContent).toContain('Inside the wall of FL-2026-0001')
    expect(document.body.textContent).toContain('report-FL-2026-0001-r71-3.docx · English · Firm template · 1 pages')
    expect(screen.getAllByText('Communication under Rule 71(3) EPC').length).toBeGreaterThan(0)
    expect(screen.getByText('Missing evidence')).toBeTruthy()
    const related = screen.getByRole('table', { name: 'Related' })
    expect(related.textContent).toContain('Confirmed by Jonas Weber')
    expect(related.textContent).toContain('Reply to Jonas Weber, Dr. Anna Becker')
    expect(within(bar()).getByText('2 parts, both required')).toBeTruthy()
    expect(within(bar()).getByText('Only you can decide. The agent never files, sends or pays.')).toBeTruthy()
    expect(within(bar()).getByText('Active · confirmed by Jonas Weber · 117 days left')).toBeTruthy()
    expect(screen.getByRole('navigation', { name: 'Location' }).textContent).toContain('Rule 71(3) communication of 30 Oct 2026')
    expect(document.body.textContent).not.toContain(OUTSIDE_WALL.name)
  })

  it('labels each status of the page, so a sent report and a sent reply never read the same', async () => {
    const report = sourced.reports[0]!
    await mount(WORK, { ticket: { ...sourced, ticket: { ...sourced.ticket, state: 'decided' }, reports: [{ ...report, state: 'sent' }] } })
    const sent = [...document.querySelectorAll('[data-atlas="report.sent"], [data-atlas="outbox.sent"]')]
    // The agent panel's result card names the work product in its title row, before the file and the status.
    expect(sent.map(status => status.parentElement!.textContent)).toEqual(['Report ·Sent', 'Reply ·Sent', 'Client reportreport-FL-2026-0001-r71-3.docxSent'])
    expect(document.querySelector('[data-atlas="deadline.active"]')!.parentElement!.textContent).toBe('Deadline ·Active')
  })

  it('blocks Accept and Record decision while a statement has no source, and lets the person reject the report', async () => {
    const { acts, keyActs } = await mount(WORK)
    expect(within(bar()).getAllByText('Statement 5 has no source, so Accept waits.').length).toBeGreaterThan(0)
    expect(within(bar()).getByRole('button', { name: /^Accept/ })).toHaveProperty('disabled', true)
    expect(within(bar()).getByRole('button', { name: /Record decision/ })).toHaveProperty('disabled', true)
    act(() => { keyActs.handler('accept')?.() })
    fireEvent.click(screen.getByRole('checkbox', { name: /I checked the deadline/ }))
    act(() => { keyActs.handler('record')?.() })
    await flush()
    expect(acts).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Remove from the draft' }))
    fireEvent.change(screen.getByLabelText('Why do you reject the client report?'), { target: { value: 'Statement 5 has no source' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    expect(within(bar()).getByText('Rejected: Statement 5 has no source')).toBeTruthy()
    fireEvent.click(within(bar()).getByRole('button', { name: /Record decision/ }))
    await flush()
    expect(acts.at(-1)?.command).toEqual({
      kind: 'ticket.decide', id: FIXTURE_IDS.ticket,
      reports: [{ proposalId: 'proposal-1', decision: 'reject', reason: 'Statement 5 has no source' }],
      deadlineCheck: { id: FIXTURE_IDS.deadline, state: 'active', seq: 142 },
    })
  })

  it('records both parts and the deadline check with ⇧⌘↵ once the person accepts and checks', async () => {
    const { acts, press, commandItems } = await mount(WORK, { ticket: sourced })
    const record = () => within(bar()).getByRole('button', { name: /Record decision/ })
    expect(record()).toHaveProperty('disabled', true)
    expect(within(bar()).getByText(/Choose Accept or Reject/)).toBeTruthy()
    await press('accept')
    expect(record()).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByRole('checkbox', { name: 'I checked the deadline Mon, 1 Mar 2027 against the letter' }))
    expect(record()).toHaveProperty('disabled', false)
    await press('record')
    expect(acts.at(-1)?.command).toEqual({
      kind: 'ticket.decide', id: FIXTURE_IDS.ticket,
      reports: [{ proposalId: 'proposal-1', decision: 'approve' }],
      deadlineCheck: { id: FIXTURE_IDS.deadline, state: 'active', seq: 142 },
    })
    expect(commandItems.item()?.groups.map(group => group.acts.map(item => item.id))).toEqual([
      ['accept', 'reject', 'record'], ['preview', 'open-in-word', 'calculation', 'open-letter', 'go-matter'],
    ])
  })

  it('runs the acts of the page from their keys and from ⌘K', async () => {
    const { press, model, commandItems } = await mount(WORK, { ticket: sourced })
    await press('preview')
    expect(opened).toHaveBeenLastCalledWith('records/api/documents/0000000000000000000000000000000000000000000000000000000000000064/content')
    await press('openLetter')
    expect(opened).toHaveBeenLastCalledWith(`records/api/documents/${R71_DOCUMENT}/content`)
    const acts = commandItems.item()!.groups
    act(() => { acts[1]!.acts[1]!.run() })
    expect(opened.mock.lastCall?.[0]).toMatch(/^ms-word:ofe\|u\|http.*\/records\/api\/documents\/0+64\/content$/)
    act(() => { acts[0]!.acts[1]!.run() })
    expect(screen.getByLabelText('Why do you reject the client report?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(within(bar()).getByRole('button', { name: /^Reject/ }))
    expect(screen.getByLabelText('Why do you reject the client report?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    act(() => { acts[0]!.acts[0]!.run() })
    act(() => { acts[0]!.acts[2]!.run() })
    await press('reject')
    fireEvent.keyDown(screen.getByLabelText('Why do you reject the client report?'), { key: 'Escape' })
    expect(screen.queryByLabelText('Why do you reject the client report?')).toBeNull()
    await press('calculation')
    expect(model.screen.getSnapshot()).toMatchObject({ view: 'deadline', id: FIXTURE_IDS.deadline })
    act(() => { model.navigate(WORK) })
    await flush()
    await press('goMatter')
    expect(model.screen.getSnapshot().view).toBe('matter')
    act(() => { model.navigate(WORK) })
    await flush()
    fireEvent.click(within(screen.getByRole('table', { name: 'Related' })).getByRole('button'))
    await flush()
    expect(model.screen.getSnapshot().view).toBe('deadline')
    act(() => { model.navigate(WORK) })
    await flush()
    fireEvent.click(within(bar()).getByRole('button', { name: /^Calculation/ }))
    await flush()
    expect(model.screen.getSnapshot().view).toBe('deadline')
  })

  it('moves through the work that waits for a decision with J, K and the pager', async () => {
    const { model, press, keyActs } = await mount(WORK, { ticket: sourced })
    const pager = screen.getByText('1 / 3')
    expect(pager).toBeTruthy()
    expect(keyActs.handler('previous')).toBeUndefined()
    await press('next')
    expect(model.screen.getSnapshot()).toMatchObject({ view: 'work', id: uuid(7) })
    await press('previous')
    expect(model.screen.getSnapshot()).toMatchObject({ view: 'work', id: uuid(3) })
    fireEvent.click(screen.getByRole('button', { name: 'Next letter' }))
    await flush()
    expect(model.screen.getSnapshot()).toMatchObject({ view: 'work', id: uuid(7) })
    fireEvent.click(screen.getByRole('button', { name: 'Previous letter' }))
    await flush()
    expect(model.screen.getSnapshot()).toMatchObject({ view: 'work', id: uuid(3) })
  })

  it('names the routed person and has no primary act when the decision is another person\'s', async () => {
    const { keyActs } = await mount(WORK, { ticket: { ...sourced, mayDecide: { allowed: false, reason: 'not-routed-person', decider: PEOPLE.anna as never } } })
    expect(within(bar()).getByText('Dr. Anna Becker decides this work: FlowLeap assigned it to them.')).toBeTruthy()
    expect(within(bar()).queryByRole('button', { name: /Record decision/ })).toBeNull()
    expect(within(bar()).queryByRole('button', { name: /^Accept/ })).toBeNull()
    expect(screen.getByRole('checkbox', { name: /I checked the deadline/ })).toHaveProperty('disabled', true)
    expect(document.body.textContent).toContain('Waits for the decision of Dr. Anna Becker')
    expect(keyActs.handler('record')).toBeUndefined()
    expect(screen.getAllByText('Communication under Rule 71(3) EPC').length).toBeGreaterThan(0)
  })

  it('says why for a deputy, a run that has not finished and an unknown decider', async () => {
    await mount(WORK, { ticket: { ...sourced, mayDecide: { allowed: true, as: 'deputy' } } })
    expect(within(bar()).getByText('You decide as the deputy of Dr. Anna Becker. The agent never files, sends or pays.')).toBeTruthy()
    cleanup()
    await mount(WORK, { ticket: { ...sourced, mayDecide: { allowed: false, reason: 'not-ready', decider: PEOPLE.anna as never } } })
    expect(within(bar()).getByText('The agent has not finished. Dr. Anna Becker decides when it has.')).toBeTruthy()
    cleanup()
    await mount(WORK, { ticket: { ...sourced, mayDecide: { allowed: false, reason: 'not-ready', decider: null } } })
    expect(within(bar()).getByText('Another person decides this work.')).toBeTruthy()
    cleanup()
    await mount(WORK, { ticket: { ...sourced, responsible: null, mayDecide: { allowed: true, as: 'deputy' } } })
    expect(within(bar()).getByText('You decide as the deputy of . The agent never files, sends or pays.')).toBeTruthy()
    cleanup()
    await mount(WORK, { ticket: { ...fixtures.ticket, ticket: { ...fixtures.ticket.ticket, routedTo: null }, mayDecide: { allowed: false, reason: 'not-routed-person', decider: null } } })
    expect(document.body.textContent).toContain('Waits for the decision of ')
    fireEvent.click(screen.getByRole('button', { name: 'Remove from the draft' }))
    expect(screen.queryByLabelText('Why do you reject the client report?')).toBeNull()
  })

  it('shows a decided work item with no decision bar and the decision in Activity', async () => {
    const decided: TicketDetail = {
      ...sourced,
      ticket: { ...sourced.ticket, state: 'decided', decidedBy: PEOPLE.anna as never, decidedAt: '2026-11-04T14:30:00Z' as never },
      reports: sourced.reports.map(report => ({ ...report, state: 'sent' })),
      mayDecide: { allowed: false, reason: 'decided', decider: PEOPLE.anna as never },
      activity: [...sourced.activity, { seq: 160, at: '2026-11-04T14:30:00Z' as never, type: 'ticket/decided', actor: { kind: 'person', person: PEOPLE.anna as never }, for: null, detail: {} }],
    }
    await mount(WORK, { ticket: decided })
    expect(screen.queryByRole('region', { name: 'Your decision' })).toBeNull()
    expect(document.body.textContent).toMatch(/Decided by Dr. Anna Becker, \d\d:\d\d/)
    expect(document.body.textContent).toContain('The report went to the client.')
    expect(document.body.textContent).toContain('Dr. Anna Becker recorded the decision')
    cleanup()
    await mount(WORK, { ticket: { ...decided, ticket: { ...decided.ticket, decidedAt: null } } })
    expect(document.body.textContent).toContain('Decided by Dr. Anna Becker,')
    cleanup()
    await mount(WORK, { ticket: { ...decided, ticket: { ...decided.ticket, state: 'running', decidedBy: null } } })
    expect(document.body.textContent).not.toContain('Decided by')
  })

  it('checks a work item with no deadline yet, and asks to settle a deadline that cannot be checked', async () => {
    const { acts } = await mount(WORK, { ticket: { ...sourced, deadline: null, reply: null } })
    fireEvent.click(within(bar()).getByRole('button', { name: /^Accept/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'I checked the letter: it sets no deadline yet' }))
    fireEvent.click(within(bar()).getByRole('button', { name: /Record decision/ }))
    await flush()
    expect(acts.at(-1)?.command).toMatchObject({ deadlineCheck: { id: 'none-yet', state: 'none-yet', seq: 142 } })
    expect(screen.queryByRole('table', { name: 'Related' })).toBeNull()
    cleanup()
    await mount(WORK, { ticket: { ...sourced, deadline: { ...sourced.deadline!, state: 'stale', confirmer: null } } })
    expect(within(bar()).getByText('The deadline is in the state "Stale". Open it and settle it first.')).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: /I checked the deadline/ })).toHaveProperty('disabled', true)
  })

  it('sends the deadline check as the person ticked it, and clears the tick when a refresh shows another deadline', async () => {
    const { api, acts } = createFixtureApi()
    const answer = vi.spyOn(api, 'ticket').mockResolvedValue({ ok: true, value: sourced })
    const { model } = await mount(WORK, {}, 'en', { api, acts })
    const box = () => screen.getByRole('checkbox', { name: /I checked the deadline/ })
    const refresh = async (ticket: TicketDetail) => {
      answer.mockResolvedValue({ ok: true, value: ticket })
      act(() => { model.refresh() })
      await flush()
    }
    fireEvent.click(within(bar()).getByRole('button', { name: /^Accept/ }))
    fireEvent.click(box())
    await refresh({ ...sourced, recordSeq: 150 })
    expect(box()).toHaveProperty('checked', true)
    fireEvent.click(within(bar()).getByRole('button', { name: /Record decision/ }))
    await flush()
    expect(acts.at(-1)?.command).toMatchObject({ deadlineCheck: { id: FIXTURE_IDS.deadline, state: 'active', seq: 142 } })
    await refresh({ ...sourced, recordSeq: 151, deadline: { ...sourced.deadline!, state: 'deadline_proposed', confirmer: null } })
    expect(box()).toHaveProperty('checked', false)
    expect(within(bar()).getByRole('button', { name: /Record decision/ })).toHaveProperty('disabled', true)
    fireEvent.click(box())
    fireEvent.click(within(bar()).getByRole('button', { name: /Record decision/ }))
    await flush()
    expect(acts.at(-1)?.command).toMatchObject({ deadlineCheck: { id: FIXTURE_IDS.deadline, state: 'deadline_proposed', seq: 151 } })
    expect(box()).toHaveProperty('checked', true)
    await refresh({ ...sourced, recordSeq: 152, deadline: { ...sourced.deadline!, id: uuid(99) as never } })
    expect(box()).toHaveProperty('checked', false)
    fireEvent.click(box())
    expect(box()).toHaveProperty('checked', true)
    await refresh({ ...sourced, recordSeq: 153, deadline: { ...sourced.deadline!, id: uuid(99) as never, state: 'stale' } })
    expect(box()).toHaveProperty('checked', false)
  })

  it('names the reply recipients of the team and counts the people outside it, so Markus Brandt shows nowhere', async () => {
    await mount(WORK)
    expect(screen.getByRole('table', { name: 'Related' }).textContent).toContain('Reply to Jonas Weber, Dr. Anna Becker, a person outside the team')
    expect(document.body.textContent).not.toContain(OUTSIDE_WALL.name)
    cleanup()
    await mount(WORK, { ticket: { ...sourced, reply: { state: 'sent', to: [PEOPLE.jonas as never, { id: null, name: null }, { id: null, name: null }] } } })
    expect(screen.getByRole('table', { name: 'Related' }).textContent).toContain('Reply to Jonas Weber, 2 people outside the team')
    cleanup()
    await mount(WORK, { ticket: { ...sourced, reply: { state: 'sent', to: [PEOPLE.jonas as never] } } })
    expect(screen.getByRole('table', { name: 'Related' }).textContent).toContain('Reply to Jonas WeberWith')
  })

  it('shows a team member with no display name as an unnamed person with no initial', async () => {
    const unnamed = { id: 'p-lena', name: null } as const
    await mount(WORK, {
      ticket: {
        ...sourced,
        responsible: unnamed as never,
        team: [PEOPLE.anna as never, unnamed as never],
        activity: [{ ...sourced.activity[0]!, actor: { kind: 'person', person: unnamed as never } }],
      },
    })
    expect(screen.getAllByText('Unnamed person').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByRole('img', { name: 'Unnamed person' }).textContent).toBe('')
  })

  it('words a letter with no report, another office event, no letter date and no responsible attorney', async () => {
    const bare: TicketDetail = {
      ...sourced,
      responsible: null,
      letter: { ...sourced.letter!, code: 'EPO:ART94(3)', documentDate: null, applicationNumber: null },
      reports: [],
      ticket: { ...sourced.ticket, state: 'running' },
      run: null,
    }
    await mount(WORK, { ticket: bare })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Communication under Article 94(3) EPC')
    expect(document.body.textContent).toContain('The office sent this letter on FL-2026-0001. The agent has not drafted a client report. Nothing went to the client.')
    expect(screen.queryByRole('region', { name: 'Your decision' })).toBeNull()
    cleanup()
    const report = sourced.reports[0]!
    await mount(WORK, { ticket: { ...sourced, letter: null, reports: [{ ...report, language: null, templateName: null, pages: null }, { ...report, proposalId: 'proposal-2' as never }] } })
    expect(document.body.textContent).toContain('report-FL-2026-0001-r71-3.docx')
    expect(within(bar()).getByText('3 parts, all required')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Letter')
  })

  it('after no answer, tries the same decision again with its act, and sends a changed decision as a new act', async () => {
    let fail = true
    const sent: Act[] = []
    await mount(WORK, { ticket: sourced, perform: (act) => { sent.push(act); return Promise.resolve(fail ? { ok: false, error: { kind: 'network' } } : { ok: true, value: null }) } })
    const recordDecision = () => { fireEvent.click(within(bar()).getByRole('button', { name: /Record decision/ })) }
    const check = () => { fireEvent.click(screen.getByRole('checkbox', { name: /I checked the deadline/ })) }
    fireEvent.click(within(bar()).getByRole('button', { name: /^Accept/ }))
    check()
    recordDecision()
    await flush()
    expect(within(bar()).getByRole('alert').textContent).toContain('FlowLeap could not record the decision. FlowLeap did not answer, so it may be recorded.')
    fireEvent.click(within(within(bar()).getByRole('alert')).getByRole('button', { name: /Try again/ }))
    await flush()
    check()
    expect(within(bar()).queryByRole('alert')).toBeNull()
    check()
    recordDecision()
    await flush()
    fireEvent.click(within(bar()).getAllByRole('button', { name: /^Reject/ })[0]!)
    fireEvent.change(screen.getByLabelText('Why do you reject the client report?'), { target: { value: 'Wrong client' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    expect(within(bar()).queryByRole('alert')).toBeNull()
    fail = false
    recordDecision()
    await flush()
    expect(sent.map(act => act.command.kind === 'ticket.decide' ? act.command.reports.map(report => report.decision) : [])).toEqual([
      ['approve'], ['approve'], ['approve'], ['reject'],
    ])
    expect(sent.slice(0, 3).map(act => act.key)).toEqual(Array(3).fill(sent[0]!.key))
    expect(sent[3]!.key).not.toBe(sent[0]!.key)
    expect(within(bar()).queryByRole('alert')).toBeNull()
  })
})
