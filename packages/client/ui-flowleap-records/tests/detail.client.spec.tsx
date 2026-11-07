// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector, contextMenuHook, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { LocaleId } from '@deepseek-ai/dsh-client-locale/client'
import type {
  Act, DeadlineDetail, DeadlineId, DocumentId, Fetched, FileNumber, IsoDate, MatterDetail, PersonId, RecordsApi, TicketDetail, TicketId,
} from '../src/client/api.ts'
import type { IsoTime } from '../src/client/wire.ts'
import { CommandItemRegistry, KeyActRegistry } from '../src/client/key-layer.ts'
import type { CommandName } from '../src/client/keys.ts'
import { de, en, es, fr, ja, pt, ru, zh, type FlowleapRecordsKey } from '../src/client/locales.ts'
import { createRecordsModel, type Route } from '../src/client/model.ts'
import { RecordsPanel, type PanelProps } from '../src/client/Panel.tsx'
import { agentProps } from './agent-fakes.client.tsx'
import { createFixtureApi, fixtures, FIXTURE_IDS, OUTSIDE_WALL, PEOPLE, R71_DOCUMENT, uuid } from './fixtures.client.ts'
import { deniedText, FORM_CODE, mainViewText } from './screen-harness.client.tsx'

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
  language: keyof typeof LANGUAGES = 'en',
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
    t: makeTranslate(LANGUAGES[language]),
    useScreen: bindSnapshotSelector(model.screen),
    useMe: bindSnapshotSelector(model.me),
    useMyWork: bindSnapshotSelector(model.myWork), useWaitingCount: bindSnapshotSelector(model.waitingCount),
    useCatalog: bindSnapshotSelector(createSnapshotStore([])),
    useFixedCatalog: bindSnapshotSelector(createSnapshotStore([])),
    useLanguage: bindSnapshotSelector(createSnapshotStore<LocaleId>(language)),
    useContextMenu: contextMenuHook(),
    navigate: (next: Route) => { model.navigate(next) },
    retry: () => { model.retry() },
    refresh: () => { model.refresh() },
    perform: (sent: readonly Act[]) => model.perform(sent),
    contentHref: (document: DocumentId) => api.contentHref(document),
    pageHref: href => api.pageHref(href),
    nextConfirmer: (document, fileNumber, signal) => api.nextConfirmer(document, fileNumber, signal),
    openFind: vi.fn(), openInMatters: vi.fn(), openMyWork: vi.fn(), root: 'matters',
    keyActs,
    commandItems,
  } as PanelProps<'records.agent.conversation'>
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

/** The copy of each language the panel ships in. */
const LANGUAGES = { en, de, es, fr, ja, pt, ru, zh } as const satisfies Readonly<
  Record<string, Readonly<Record<FlowleapRecordsKey, string>>>
>

const bar = (heading = 'Your decision') => screen.getByRole('region', { name: heading })
/** The icon of the deadline part in the decision bar. */
const partIcon = () => bar().querySelector('[class*="partIcon"] svg')?.getAttribute('data-icon')

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
      useMyWork: bindSnapshotSelector(model.myWork), useWaitingCount: bindSnapshotSelector(model.waitingCount),
      useCatalog: bindSnapshotSelector(createSnapshotStore([])),
      useFixedCatalog: bindSnapshotSelector(createSnapshotStore([])), useLanguage: bindSnapshotSelector(createSnapshotStore<LocaleId>('en')), useAsk: bindSnapshotSelector(createSnapshotStore(null)),
      useContextMenu: contextMenuHook(), navigate: () => {}, retry: () => {}, refresh: () => {},
      perform: () => Promise.resolve({ failed: [] }),
      contentHref: () => '', pageHref: () => '', nextConfirmer: () => Promise.resolve({ ok: true, value: null }), keyActs: new KeyActRegistry(), commandItems: new CommandItemRegistry(),
      openFind: vi.fn(), openInMatters: vi.fn(), openMyWork: vi.fn(), root: 'matters',
    } as PanelProps<'records.agent.conversation'>
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
  it('shows What waits, the deadlines, the e-file, Activity and the properties of the matter and its people, and opens each record', async () => {
    const { model, commandItems } = await mount(MATTER)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Pressure sensor housing')
    const lede = screen.getByRole('heading', { level: 1 }).parentElement!.textContent
    expect(lede).toContain('FL-2026-0001')
    expect(lede).toContain('Kessler Sensorik GmbH')
    expect(screen.getByRole('link', { name: /EP 24 123 456\.7/ }).getAttribute('href')).toContain('register.epo.org')
    expect(screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent)).toEqual(['What waits', 'Deadlines', 'E-file', 'Activity'])
    for (const name of ['Work', 'Office events', 'Documents']) expect(screen.queryByRole('table', { name })).toBeNull()
    expect(document.body.textContent).not.toContain('waits for a second person')
    const waits = screen.getByRole('table', { name: 'What waits' })
    expect(within(waits).getAllByRole('columnheader').map(cell => cell.textContent)).toEqual(['State', 'Task', 'Who', 'Due'])
    expect(within(waits).getAllByRole('row')[1]!.querySelector('[data-atlas]')?.getAttribute('data-atlas')).toBe('deadline.deadline_proposed')
    expect(within(waits).getByRole('button').textContent).toBe('Next stepConfirm the deadline')
    expect(waits.textContent).toContain('Lena Hoffmann')
    expect(waits.textContent).toContain('Due today')
    const deadlines = screen.getByRole('table', { name: 'Deadlines' })
    expect(within(deadlines).getAllByRole('row')[1]!.querySelector('[data-atlas]')?.getAttribute('data-atlas')).toBe('deadline.deadline_proposed')
    expect(deadlines.textContent).toContain('Rule 71(3) EPC')
    expect(deadlines.textContent).toContain('117 days left')
    // At 390px the due date moves to the right edge of its row, and its header with it.
    expect(within(deadlines).getByRole('columnheader', { name: 'Due' }).className).toContain('endNarrow')
    const panel = screen.getByRole('complementary', { name: 'Properties' })
    expect([...panel.querySelectorAll('h3')].map(heading => heading.textContent)).toEqual(['Matter', 'People'])
    expect([...panel.querySelectorAll('dt')].map(label => label.textContent)).toEqual([
      'File number', 'Client', 'AI allowed for', 'Language', 'Application', 'Responsible', 'Formalities', 'Team', 'Wall',
    ])
    const values = [...panel.querySelectorAll('dd')].map(value => value.textContent)
    expect(values.slice(0, 5)).toEqual(['FL-2026-0001', 'Kessler Sensorik GmbH', 'Drafts, client report', 'English', 'EP 24 123 456.7'])
    expect(values[5]).toContain('Dr. Anna Becker')
    expect(values[6]).toContain('Lena Hoffmann')
    expect(values[7]).toContain('3 people')
    expect(values[8]).toBe('The team · 2 people screened')
    expect(panel.textContent).not.toContain('Next deadline')
    expect(screen.getByRole('table', { name: 'E-file' }).textContent).toContain('Rule 71(3) communication')
    expect(document.querySelector('[data-audit]')).not.toBeNull()
    expect(commandItems.item()?.label).toBe('FL-2026-0001 · Pressure sensor housing')
    fireEvent.click(within(screen.getByRole('table', { name: 'E-file' })).getByRole('button'))
    expect(opened).toHaveBeenCalledWith(`records/api/documents/${R71_DOCUMENT}/content`)
    fireEvent.click(within(waits).getByRole('button'))
    await flush()
    expect(model.screen.getSnapshot()).toMatchObject({ view: 'deadline', id: FIXTURE_IDS.deadline })
    act(() => { model.navigate(MATTER) })
    await flush()
    fireEvent.click(within(screen.getByRole('table', { name: 'Deadlines' })).getByRole('button'))
    await flush()
    expect(model.screen.getSnapshot().view).toBe('deadline')
    act(() => { model.navigate(MATTER) })
    await flush()
    const acts = commandItems.item()!.groups[0]!.acts
    expect(acts.map(entry => entry.label)).toEqual(['Confirm the deadline', 'Deadline Mon, 1 Mar 2027'])
    act(() => { acts[1]!.run() })
    await flush()
    expect(model.screen.getSnapshot().view).toBe('deadline')
    act(() => { model.navigate(MATTER) })
    await flush()
    act(() => { acts[0]!.run() })
    await flush()
    expect(model.screen.getSnapshot()).toMatchObject({ view: 'deadline', id: FIXTURE_IDS.deadline })
    expect(document.body.textContent).not.toContain(OUTSIDE_WALL.name)
  })

  it('words a sparse matter: no responsible, no formalities person, no deadline, a wait with no page, and an agent document', async () => {
    const matter: MatterDetail = {
      ...fixtures.matter,
      responsible: null,
      formalitiesPerson: null,
      deadlines: [],
      waits: [{ ...fixtures.matter.waits[0]!, act: 'board', owner: PEOPLE.jonas as never }],
      documents: [...fixtures.matter.documents, { sha256: 'b'.repeat(64) as DocumentId, fileName: 'other.pdf', mediaType: 'application/pdf', source: 'mail', at: '2026-11-04T14:16:00Z' as never }, { ...fixtures.matter.documents[0]!, sha256: 'c'.repeat(64) as DocumentId, source: 'agent' }],
    }
    const { commandItems } = await mount(MATTER, { matter })
    const properties = screen.getByRole('complementary', { name: 'Properties' })
    expect([...properties.querySelectorAll('dd')].slice(5, 7).map(value => value.textContent)).toEqual(['None', 'None'])
    expect(properties.textContent).not.toContain('Next deadline')
    const waits = screen.getByRole('table', { name: 'What waits' })
    expect(waits.textContent).toContain('Jonas Weber')
    expect(within(waits).queryByRole('button')).toBeNull()
    expect(waits.textContent).not.toContain('Next step')
    expect(commandItems.item()!.groups[0]!.acts).toEqual([])
    expect(screen.queryByRole('table', { name: 'Deadlines' })).toBeNull()
    expect(screen.getByRole('table', { name: 'E-file' }).textContent).toContain('Client report')
    expect(screen.getByRole('table', { name: 'E-file' }).textContent).toContain('Letter')
    fireEvent.click(within(screen.getByRole('table', { name: 'E-file' })).getAllByRole('button')[0]!)
    expect(opened).toHaveBeenCalled()
  })

  it('says in one sentence what a section has none of, instead of a column header with no row', async () => {
    const section = (name: string) => screen.getByRole('heading', { name }).closest('section')!.textContent
    await mount(MATTER, { matter: { ...fixtures.matter, waits: [] } })
    expect(screen.queryByRole('table', { name: 'What waits' })).toBeNull()
    expect(section('What waits')).toBe('What waits0Nothing on this matter waits for a person.')
    expect(screen.getByRole('table', { name: 'Deadlines' })).toBeTruthy()
    expect(screen.getByRole('table', { name: 'E-file' })).toBeTruthy()
    cleanup()
    const none: MatterDetail = { ...fixtures.matter, waits: [], deadlines: [], officeEvents: [], documents: [] }
    await mount(MATTER, { matter: none })
    for (const name of ['What waits', 'Deadlines', 'E-file']) expect(screen.queryByRole('table', { name })).toBeNull()
    expect(['What waits', 'Deadlines', 'E-file'].map(section)).toEqual([
      'What waits0Nothing on this matter waits for a person.', 'Deadlines0No deadlines on this matter yet.', 'E-file0No documents on this matter yet.',
    ])
    cleanup()
    await mount(MATTER, { matter: none }, 'de')
    expect(['Was wartet', 'Fristen', 'E-Akte'].map(section)).toEqual([
      'Was wartet0In dieser Akte wartet nichts auf eine Person.', 'Fristen0Noch keine Fristen in dieser Akte.', 'E-Akte0Noch keine Dokumente in dieser Akte.',
    ])
  })

  it('lists each wait with its owner and tags only the first as the next step, also a wait for a person outside the team', async () => {
    const first = fixtures.matter.waits[0]!
    const letter = { ...first, id: `file-letter:${R71_DOCUMENT}`, kind: 'file-letter' as const, act: `intake/waiting/${R71_DOCUMENT}` }
    const outsider = { ...first, id: 'confirm-deadline:outside', owner: { id: null, name: null } } as const
    const matter: MatterDetail = { ...fixtures.matter, waits: [first, letter, outsider] }
    const { model } = await mount(MATTER, { matter })
    const waits = screen.getByRole('table', { name: 'What waits' })
    expect(within(waits).getAllByRole('row')).toHaveLength(4)
    expect(within(waits).getAllByText('Next step')).toHaveLength(1)
    expect(within(within(waits).getAllByRole('row')[1]!).getByText('Next step')).toBeTruthy()
    expect(waits.textContent).toContain('File this letter')
    expect(waits.textContent).toContain('A person outside the team')
    const anonymous = [...waits.querySelectorAll('[data-anonymous]')]
    expect(anonymous).toHaveLength(1)
    expect(anonymous.every(avatar => avatar.textContent === '')).toBe(true)
    fireEvent.click(within(waits).getByRole('button', { name: /File this letter/ }))
    await flush()
    expect(model.screen.getSnapshot()).toMatchObject({ view: 'letter', document: R71_DOCUMENT })
  })

  it('marks an overdue deadline in its row with the warning glyph, and nowhere else on the page', async () => {
    const overdue = { ...fixtures.matter.deadlines[0]!, state: 'active' as const, due: '2026-03-02' as IsoDate }
    await mount(MATTER, { matter: { ...fixtures.matter, deadlines: [overdue, { ...overdue, id: uuid(32) as DeadlineId, state: 'rejected' }], waits: [] } })
    const marks = [...document.querySelectorAll<HTMLElement>('[data-overdue]')]
    const where = (element: HTMLElement) => element.closest('[role="table"], aside')?.getAttribute('aria-label') ?? 'page'
    expect(marks.map(mark => [where(mark), mark.textContent])).toEqual([
      ['Deadlines', 'Overdue by 247 days'],
      ['Deadlines', 'Overdue by 247 days'],
      ['Deadlines', 'Overdue by 247 days'],
      ['Deadlines', 'Overdue by 247 days'],
    ])
    for (const mark of marks) {
      expect(mark.firstElementChild!.tagName.toLowerCase()).toBe('svg')
      expect(mark.querySelector('[data-shape]')).toBeNull()
    }
    expect(document.body.textContent).not.toContain('is overdue')
    expect(screen.getByRole('complementary', { name: 'Properties' }).textContent).not.toContain('Overdue')
  })

  it('marks a wait whose date has passed as overdue in the What waits row', async () => {
    const late = { ...fixtures.matter.waits[0]!, dueAt: '2026-11-01T09:00:00Z' as IsoTime }
    await mount(MATTER, { matter: { ...fixtures.matter, waits: [late], deadlines: [] } })
    const marks = [...document.querySelectorAll<HTMLElement>('[data-overdue]')]
    expect(marks.map(mark => [mark.closest('[role="table"]')?.getAttribute('aria-label'), mark.textContent])).toEqual([['What waits', 'Overdue by 3 days']])
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
    // Each read value from the text has its span: the office event the letter's title line, never its form code.
    expect(within(readings).getAllByRole('row').slice(1).map(row => row.querySelector('[role="cell"]')?.textContent)).toEqual([
      'Rule 71(3) EPCCommunication under Rule 71(3) EPCp. 1', 'Fri, 30 Oct 202630.10.2026p. 1', 'EP 24 123 456.724 123 456.7p. 1',
    ])
    expect(within(readings).getAllByText('EP 24 123 456.7')).toHaveLength(2)
    expect(within(readings).getAllByText('Agree')).toHaveLength(3)
    expect(screen.getByRole('link', { name: 'Rule 134 EPC' }).getAttribute('href')).toBe('https://www.epo.org/en/legal/epc/2020/r134.html')
    expect(screen.queryByRole('complementary', { name: 'Properties' })).toBeNull()
    expect(screen.getByRole('img', { name: 'Drawing of page 1 of the letter' })).toBeTruthy()
    expect(within(bar()).getByText(/^When you confirm, the deadline is active, confirmed by /)).toBeTruthy()
    expect(within(bar()).getByText('You did not record or classify this letter, so you can confirm')).toBeTruthy()
    expect(within(bar()).getByText('4 steps · both readings agree · FlowLeap checks the date again when you confirm')).toBeTruthy()
    expect(partIcon()).toBe('dsw-icon-check-outline-regular')
    expect(screen.getByRole('navigation', { name: 'Location' }).textContent).toContain('Deadline 1 Mar 2027')
    expect(document.body.textContent).not.toContain(OUTSIDE_WALL.name)
  })

  it('quotes the letter\'s title line for the office event and shows the form code only in Audit', async () => {
    await mount(DEADLINE)
    expect(mainViewText()).not.toMatch(FORM_CODE)
    expect(deniedText()).toContain('Communication under Rule 71(3) EPCp. 1')
    expect(document.querySelector('[data-audit]')!.textContent).toContain('formNumber2004Cp. 1')
    cleanup()
    // A reading with no title line quotes nothing for the office event, and never falls back to the form code.
    const { title: _title, ...fields } = fixtures.deadline.readers.code!.fields
    const code = { ...fixtures.deadline.readers.code!, fields }
    await mount(DEADLINE, { deadline: { ...fixtures.deadline, readers: { ...fixtures.deadline.readers, code } } })
    const readings = screen.getByRole('table', { name: 'What FlowLeap read, twice' })
    expect(readings.querySelector('[role="cell"]')!.textContent).toBe('Rule 71(3) EPC')
    expect(mainViewText()).not.toMatch(FORM_CODE)
  })

  it('confirms with the record position the person saw, from the button and from ⇧⌘↵', async () => {
    const { acts, press } = await mount(DEADLINE)
    fireEvent.click(within(bar()).getByRole('button', { name: /^Confirm\b/ }))
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
    expect(screen.queryByText('Your decision')).toBeNull()
    expect(within(bar('Not your decision')).getByText('You proposed this date, so a second person confirms it.')).toBeTruthy()
    expect(within(bar('Not your decision')).queryByRole('button', { name: /^Confirm\b/ })).toBeNull()
    expect(within(bar('Not your decision')).queryByRole('button', { name: /Reject/ })).toBeNull()
    expect(keyActs.handler('record')).toBeUndefined()
    expect(screen.getByRole('list', { name: 'How FlowLeap computed the date' })).toBeTruthy()
    expect(screen.queryByRole('complementary', { name: 'Properties' })).toBeNull()
    expect(within(bar('Not your decision')).queryByText(/^When you confirm/)).toBeNull()
  })

  it.each([
    ['code-decider', null, 'Not your decision', 'You classified this letter, so a second person confirms the date.'],
    ['not-in-team', null, 'Not your decision', 'Only the team of this matter confirms the date.'],
    ['not-ready', null, 'Not your decision', 'FlowLeap cannot check the date now. Try again later.'],
    ['not-routed-person', PEOPLE.jonas, 'Jonas Weber decides', 'Jonas Weber decides this.'],
  ] as const)('says why for %s, and names the decider in the bar\'s header', async (reason, decider, heading, text) => {
    await mount(DEADLINE, { deadline: { ...fixtures.deadline, mayConfirm: { allowed: false, reason, decider: decider as never } } })
    expect(screen.queryByText('Your decision')).toBeNull()
    expect(within(bar(heading)).getByText(text)).toBeTruthy()
  })

  it.each([
    ['en', 'you'], ['de', 'sie'], ['es', 'usted'], ['fr', 'vous'], ['ja', 'あなた'], ['pt', 'você'], ['ru', 'вы'], ['zh', '[您你]'],
  ] as const)('speaks of the confirmation without the second person in the bar of a person who may not confirm (%s)', async (language, pronoun) => {
    const you = new RegExp(`(?<!\\p{L})${pronoun}(?!\\p{L})`, 'iu')
    const copy = LANGUAGES[language]
    const partOf = (heading: string, tail: string) => within(bar(heading)).getByText(
      (_, element) => element?.textContent.endsWith(tail) === true && element.children.length === 0,
    )
    await mount(DEADLINE, { deadline: { ...fixtures.deadline, mayConfirm: { allowed: false, reason: 'not-in-team', decider: null } } }, language)
    expect(partOf(copy['decision.notYoursHeading'], copy['deadline.part.recheckOther']).textContent).not.toMatch(you)
    cleanup()
    await mount(DEADLINE, {}, language)
    expect(partOf(copy['decision.yours'], copy['deadline.part.recheck'])).toBeTruthy()
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
      officeEvent: { ...fixtures.deadline.officeEvent, code: 'EPO:UNKNOWN', documentDate: null },
      readers: { ...fixtures.deadline.readers, model: { model: 'm', result: { formNumber: null, code: 'EPO:R71(3)', documentDate: '2026-10-03' as never, applicationNumber: null } }, agree: false, differences: ['documentDate'] as const },
    }
    await mount(DEADLINE, { deadline: differ })
    expect(within(bar()).getByText(/the readings differ, so check the letter/)).toBeTruthy()
    expect(partIcon()).toBe('dsw-icon-warning-triangle-outline-regular')
    expect(screen.getByText('Differ')).toBeTruthy()
    expect(screen.getAllByText('Not read').length).toBeGreaterThan(0)
    expect(screen.getByText('The office is open on this day')).toBeTruthy()
    expect(screen.getByText('Calculation step')).toBeTruthy()
    expect(screen.getByText('Period added')).toBeTruthy()
    expect(screen.getByText(/The letter reached the firm late/)).toBeTruthy()
    expect(screen.getAllByText('An engine note.').every(cell => cell.closest('[data-audit]') !== null)).toBe(true)
    expect(screen.queryByText('Legal sources')).toBeNull()
    expect(screen.queryByRole('complementary', { name: 'Properties' })).toBeNull()
    cleanup()
    const oneReading = { code: null, model: differ.readers.model, agree: null, differences: null }
    await mount(DEADLINE, { deadline: { ...differ, officeEvent: { ...differ.officeEvent, code: null }, readers: oneReading } })
    expect(within(bar()).getByText(/one reading only/)).toBeTruthy()
    expect(partIcon()).toBe('dsw-icon-info-outline-regular')
    cleanup()
    const empty = { formNumber: null, code: null, documentDate: null, applicationNumber: null }
    await mount(DEADLINE, { deadline: { ...differ, readers: { code: { result: empty, fields: {}, source: { kind: 'text-layer' } as const }, model: null, agree: null, differences: null } } })
    expect(screen.getAllByText('Not read').length).toBeGreaterThan(0)
    cleanup()
    await mount(DEADLINE, { deadline: { ...differ, readers: { code: null, model: null, agree: null, differences: null } } })
    expect(screen.getByText('FlowLeap has no reading of this letter.')).toBeTruthy()
    expect(partIcon()).toBe('dsw-icon-warning-triangle-outline-regular')
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
    fireEvent.click(within(bar()).getByRole('button', { name: /^Confirm\b/ }))
    await flush()
    const notice = within(bar()).getByRole('alert')
    expect(notice.textContent).toBe('No answer from FlowLeap. The decision may be recorded. A second try is safe: FlowLeap records it only once.Try again')
    fireEvent.click(within(notice).getByRole('button', { name: /Try again/ }))
    await flush()
    await press('retry')
    fail = false
    fireEvent.click(within(bar()).getByRole('button', { name: /^Confirm\b/ }))
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
    fireEvent.click(within(bar()).getByRole('button', { name: /^Confirm\b/ }))
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
    const confirm = () => within(bar()).getByRole('button', { name: /^Confirm\b/ })
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
    fireEvent.click(within(bar()).getByRole('button', { name: /^Confirm\b/ }))
    await flush()
    expect(within(bar()).getByRole('alert').textContent).toContain('FlowLeap refused to confirm the deadline. It recorded nothing.')
    await press('reject')
    expect(within(bar()).queryByRole('alert')).toBeNull()
    fireEvent.change(screen.getByLabelText('Why is this date wrong?'), { target: { value: 'Wrong period' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    await flush()
    expect(within(bar()).getByRole('alert').textContent).toContain('FlowLeap refused to reject the deadline.')
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
    expect(within(screen.getByRole('region', { name: 'Ihre Entscheidung' })).getByRole('button', { name: /^Bestätigen\b/ })).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Ihre Entscheidung' })).getByText(/^Wenn Sie bestätigen, ist die Frist aktiv, bestätigt von /)).toBeTruthy()
    expect(screen.queryByRole('complementary', { name: 'Eigenschaften' })).toBeNull()
  })

  it('shows "No source letter" for an office event entered by hand, and names who entered it and who confirmed it', async () => {
    const byHand: DeadlineDetail = {
      ...fixtures.deadline,
      deadline: { ...fixtures.deadline.deadline, state: 'manual_proposed' },
      officeEvent: { ...fixtures.deadline.officeEvent, document: null, fileName: null },
      readers: { code: null, model: null, agree: null, differences: null },
      proposer: { ...PEOPLE.jonas, id: PEOPLE.jonas.id as PersonId },
    }
    const { keyActs } = await mount(DEADLINE, { deadline: byHand }, 'de')
    expect(keyActs.handler('openLetter')).toBeUndefined()
    const read = screen.getByRole('region', { name: 'Das Amtsereignis' })
    expect(read.textContent).toContain('Kein Amtsschreiben')
    expect(read.textContent).toContain('Jonas Weber hat das Amtsereignis von Hand erfasst. Eine zweite Person bestätigt es.')
    expect(within(bar('Ihre Entscheidung')).getByText(/Kein Amtsschreiben/)).toBeTruthy()
    expect(document.body.textContent).not.toContain('Beleg fehlt')
    expect(document.body.textContent).not.toContain('FlowLeap hat dieses Schreiben nicht gelesen')
    expect(screen.queryByRole('complementary', { name: 'Eigenschaften' })).toBeNull()
    expect(screen.queryByRole('img', { name: 'Zeichnung von Seite 1 des Schreibens' })).toBeNull()
    cleanup()
    await mount(DEADLINE, { deadline: { ...byHand, proposer: null } })
    expect(screen.getByRole('region', { name: 'The office event' }).textContent).toBe('The office eventNo source letter')
    cleanup()
    await mount(DEADLINE, { deadline: { ...byHand, deadline: { ...byHand.deadline, state: 'active' }, confirmer: { ...PEOPLE.anna, id: PEOPLE.anna.id as PersonId } } })
    expect(screen.getByRole('region', { name: 'The office event' }).textContent).toContain('No source letterJonas Weber entered the office event by hand, and Dr. Anna Becker confirmed it.')
  })

  it('words an office event entered by hand as an entry by its person, never as a letter that FlowLeap read', async () => {
    const jonas = { ...PEOPLE.jonas, id: PEOPLE.jonas.id as PersonId }
    const entered = { officeEventId: FIXTURE_IDS.officeEvent, code: 'EPO:R71(3)', documentDate: '2026-10-30', receivedAt: null }
    const byHand: DeadlineDetail = {
      ...fixtures.deadline,
      deadline: { ...fixtures.deadline.deadline, state: 'manual_proposed' },
      officeEvent: { ...fixtures.deadline.officeEvent, document: null, fileName: null },
      readers: { code: null, model: null, agree: null, differences: null },
      proposer: jonas,
      activity: [
        { seq: 120, at: '2026-11-04T14:10:00Z' as never, type: 'office-event/recorded', actor: { kind: 'person', person: jonas }, for: null, detail: entered },
        ...fixtures.deadline.activity.slice(1),
      ],
    }
    await mount(DEADLINE, { deadline: byHand })
    expect(within(bar()).getByText('Jonas Weber entered this office event, so you can confirm it')).toBeTruthy()
    expect(document.body.textContent).not.toContain('You did not record or classify this letter')
    expect(screen.queryByRole('region', { name: 'What FlowLeap read, twice' })).toBeNull()
    expect(screen.getByRole('region', { name: 'The office event' }).textContent).toBe('The office eventNo source letterJonas Weber entered the office event by hand. A second person confirms it.')
    const steps = within(screen.getByRole('list', { name: 'How FlowLeap computed the date' })).getAllByRole('listitem')
    expect(steps[0]!.textContent).toContain('Delivered on the date of the office event')
    expect(document.body.textContent).not.toContain('the date of the letter')
    expect(document.body.textContent).toContain('Jonas Weber entered the office event by hand')
    cleanup()
    await mount(DEADLINE, { deadline: { ...byHand, proposer: null } })
    expect(within(bar()).getByText('Another person entered this office event, so you can confirm it')).toBeTruthy()
    cleanup()
    await mount(DEADLINE, { deadline: { ...byHand, mayConfirm: { allowed: false, reason: 'proposer', decider: null } } })
    expect(bar('Not your decision').textContent).toContain('You entered this office event, so another person confirms its deadline.')
    expect(document.body.textContent).not.toContain('You proposed this date')
    cleanup()
    // An office event that a person recorded from a letter names its document; it stays a confirm of the reading.
    const fromLetter = { ...entered, document: R71_DOCUMENT, codeSource: { kind: 'decided' } }
    await mount(DEADLINE, { deadline: { ...fixtures.deadline, activity: [{ ...byHand.activity[0]!, detail: fromLetter }], mayConfirm: { allowed: false, reason: 'proposer', decider: null } } })
    expect(document.body.textContent).toContain('Jonas Weber confirmed the office event')
    expect(document.body.textContent).not.toContain('entered the office event by hand')
    expect(within(screen.getByRole('list', { name: 'How FlowLeap computed the date' })).getAllByRole('listitem')[0]!.textContent).toContain('Delivered on the date of the letter')
    expect(bar('Not your decision').textContent).toContain('You proposed this date, so a second person confirms it.')
  })

  it('words the legal citations and the office in the UI language, and keeps a citation it does not know as it is', async () => {
    const steps = () => within(screen.getByRole('list', { name: 'Wie FlowLeap das Datum berechnet hat' })).getAllByRole('listitem').map(step => step.querySelector('[class*="law"]')?.textContent)
    const trace = [...fixtures.deadline.deadline.trace, { op: 'start', from: '2026-10-30' as never, to: '2026-10-31' as never, cite: 'Article 94(3) EPC; Guidelines E-VIII, 1' }]
    await mount(DEADLINE, { deadline: { ...fixtures.deadline, deadline: { ...fixtures.deadline.deadline, trace } } }, 'de')
    expect(steps()).toEqual([
      'Regel 126(2) EPÜ · Regel 127(2) EPÜ · ABl. EPA 2023, A29',
      'Regel 131(2) EPÜ',
      'Regel 71(3) EPÜ · Regel 131(4) EPÜ, letzter Tag des Monats',
      'Regel 134(1) EPÜ · Kalender des EPA 2027',
      'Artikel 94(3) EPÜ · Guidelines E-VIII, 1',
    ])
    expect(screen.getByRole('link', { name: 'ABl. EPA 2023, A29' }).getAttribute('href')).toBe('https://www.epo.org/en/legal/official-journal/2023/03/a29')
    expect(screen.getByRole('link', { name: 'Regel 134 EPÜ' })).toBeTruthy()
    // A quote and the drawing of the letter keep the letter's own words, which the UI language does not translate.
    const words = document.body.cloneNode(true) as HTMLElement
    for (const quote of words.querySelectorAll('[class*="quote"], [data-verbatim]')) quote.remove()
    expect(words.textContent).not.toMatch(/\bEPO\b|\bEPC\b|\bRule\b|\bOJ\b/)
    for (const [language, cite] of [['fr', 'Règle 126(2) CBE · Règle 127(2) CBE · JO OEB 2023, A29'], ['es', 'Regla 126(2) CPE · Regla 127(2) CPE · DO OEP 2023, A29']] as const) {
      cleanup()
      await mount(DEADLINE, {}, language)
      expect(document.body.textContent).toContain(cite)
    }
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

  it('shows the related deadline and reply before the client report', async () => {
    await mount(WORK)
    const headings = screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent)
    expect(headings.indexOf('Related')).toBeGreaterThanOrEqual(0)
    expect(headings.indexOf('Related')).toBeLessThan(headings.indexOf('Client report'))
  })

  it('names the record of each status on the page, so a sent report and a sent reply never read the same', async () => {
    const report = sourced.reports[0]!
    const sentReport = { ...report, state: 'sent' } as const
    await mount(WORK, { ticket: { ...sourced, ticket: { ...sourced.ticket, state: 'decided' }, reports: [sentReport], clientReport: sentReport } })
    const sent = [...document.querySelectorAll('[data-atlas="report.sent"], [data-atlas="outbox.sent"]')]
    // A related record's row names it in its main cell (mockup 4-review-work). The report's section heading names it once
    // ("Client report"), so its status carries no second "Report" label. The agent panel's result card names the work
    // product in its title row, before the file and the status.
    expect(sent[0]!.closest('[role="row"]')!.textContent).toMatch(/^Sent\s*Reply to /u)
    expect(sent.slice(1).map(status => status.previousElementSibling?.textContent ?? status.parentElement!.textContent)).toEqual(['Client report', 'Client reportreport-FL-2026-0001-r71-3.docx'])
    expect(sent[1]!.parentElement!.textContent).not.toContain('Report')
    expect(document.querySelector('[data-atlas="deadline.active"]')!.closest('[role="row"]')!.textContent).toMatch(/^Active\s*Deadline /u)
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
    expect(screen.queryByText('Your decision')).toBeNull()
    const theirs = bar('Dr. Anna Becker decides')
    expect(theirs.querySelector('header')!.textContent).toBe('ADr. Anna Becker decides2 parts, both required')
    expect(within(theirs).getByText('Dr. Anna Becker decides this work: FlowLeap assigned it to them.')).toBeTruthy()
    expect(within(theirs).queryByRole('button', { name: /Record decision/ })).toBeNull()
    expect(within(theirs).queryByRole('button', { name: /^Accept/ })).toBeNull()
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
    expect(within(bar('Dr. Anna Becker decides')).getByText('The agent has not finished. Dr. Anna Becker decides when it has.')).toBeTruthy()
    cleanup()
    await mount(WORK, { ticket: { ...sourced, mayDecide: { allowed: false, reason: 'not-ready', decider: null } } })
    expect(within(bar('Not your decision')).getByText('Another person decides this work.')).toBeTruthy()
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
      clientReport: null,
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
    expect(within(bar()).getByRole('alert').textContent).toContain('No answer from FlowLeap. The decision may be recorded.')
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
