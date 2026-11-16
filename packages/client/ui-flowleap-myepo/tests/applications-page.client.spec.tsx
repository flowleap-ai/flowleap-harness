// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { allowAllAccess, bindSnapshotSelector, contextMenuHook, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { MyEpoApplicationDetailView } from '@deepseek-ai/dsh-api-remotes/client'
import { ApplicationsPage, type ApplicationsPageProps } from '../src/client/applications/ApplicationsPage.tsx'
import { ApplicationsPanelIcon } from '../src/client/applications/ApplicationsPanelIcon.tsx'
import { en } from '../src/client/locales/applications.ts'
import { PAGE_SIZE, type ApplicationData, type Docket, type DocketSnapshot } from '../src/client/applications/docket.ts'
import { APPLICATIONS, DETAIL, KEYS, LIST, TODAY } from './applications-fixture.client.ts'

afterEach(() => { cleanup() })

const ready = (detail: MyEpoApplicationDetailView): ApplicationData => ({ status: 'ready', detail })

const READY: DocketSnapshot = {
  phase: 'ready', reading: false, failure: null, applications: APPLICATIONS, total: APPLICATIONS.length, readAt: LIST.readAt, data: {},
  view: 'all', portfolio: null, query: '', sort: { column: 'filed', direction: 'descending' }, limit: PAGE_SIZE, selected: null,
}

/** Render the page over one fixed state; the acts are spies. */
function page(state: Partial<DocketSnapshot> = {}, copy: Partial<Record<keyof typeof en, string>> = {}) {
  const snapshot = { ...READY, ...state }
  const acts = {
    refresh: vi.fn(() => Promise.resolve()), update: vi.fn(() => Promise.resolve()),
    select: vi.fn(), step: vi.fn(), retry: vi.fn(), setView: vi.fn(), setPortfolio: vi.fn(),
    setQuery: vi.fn(), sortBy: vi.fn(), more: vi.fn(),
  }
  const hooks: Docket['hooks'] = { docket: { getSnapshot: () => snapshot, subscribe: () => () => {} } }
  const props: ApplicationsPageProps = {
    ...acts,
    today: () => TODAY,
    useDocket: bindSnapshotSelector(hooks.docket),
    usePanelInfo: select => select({ activePanelId: null }),
    useSessions: () => { throw new Error('The page reads no Session') },
    useWorkspaces: () => { throw new Error('The page reads no workspace') },
    useSessionStatus: () => { throw new Error('The page reads no Session status') },
    useSessionRetainInfo: () => undefined,
    useResource: () => { throw new Error('The page loads no document resources') },
    ...allowAllAccess,
    useContextMenu: contextMenuHook(),
    t: makeTranslate({ ...en, ...copy }),
  }
  const view = render(<ApplicationsPage {...props} />)
  return { ...view, acts }
}

const cells = (row: HTMLElement): (string | null)[] => within(row).getAllByRole('cell').map(cell => cell.textContent)
const tableRows = (): HTMLElement[] => within(screen.getByRole('table', { name: 'Applications in MyEPO' })).getAllByRole('row').slice(1)

describe('the Applications page', () => {
  it('shows the read in progress, then why MyEPO gave no list, with a new read', () => {
    page({ phase: 'loading', readAt: null })
    expect(screen.getByRole('status').textContent).toBe('Reading the applications from MyEPO…')
    cleanup()
    const { acts } = page({ readAt: null, applications: [], failure: { kind: 'not-linked' } })
    expect(screen.getByRole('heading', { name: 'MyEPO is not linked' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Read again' }))
    expect(acts.refresh).toHaveBeenCalledTimes(1)
    for (const [failure, text] of [
      [{ kind: 'refused' }, en['state.refused']],
      [{ kind: 'unreachable' }, 'MyEPO did not answer.'],
      [{ kind: 'failed', message: 'ERR_15' }, 'MyEPO answered with an error: ERR_15'],
      [{ kind: 'error', message: 'connection lost' }, 'MyEPO answered with an error: connection lost'],
    ] as const) {
      cleanup()
      page({ readAt: null, applications: [], failure, reading: true })
      expect(screen.getByRole('alert').textContent).toContain(text)
      expect(screen.queryByRole('heading')).toBeNull()
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Read again' }).disabled).toBe(true)
    }
  })

  it('lists the applications with the fields of the MyEPO list, and the title, the applicant and the next due date once they are read', () => {
    const { acts } = page({
      data: { [KEYS[0]]: ready(DETAIL), [KEYS[1]]: { status: 'loading' }, [KEYS[3]]: ready({ ...DETAIL, titles: {}, applicants: [], dueDates: [] }) },
    })
    const rows = tableRows()
    expect(rows).toHaveLength(4)
    expect(cells(rows[0]!)).toEqual(['B-ref', 'EP00000001.8', 'EPC', 'Scale', 'Renishaw plc', 'Portfolio one', '6 Jun 2024', '29 Jan 2027'])
    // The data is on its way; not read yet; read with no title, no applicant and no due date.
    expect(cells(rows[1]!)).toEqual(['A-ref', 'EP00000001.8', 'UPP', 'Reading…', 'Reading…', 'Portfolio one', '10 May 2024', 'Reading…'])
    expect(cells(rows[2]!)).toEqual(['None', 'EP00000002.6', 'EPC', 'Not read', 'Not read', 'Portfolio two', '6 Jun 2023', 'Not read'])
    expect(cells(rows[3]!)).toEqual(['C-ref', 'EP00000003.4', 'EPC', 'None', 'None', 'Portfolio two', '6 Jun 2022', 'None'])
    expect(within(rows[1]!).getByText('UPP').getAttribute('title')).toBe('Unitary patent')
    expect(within(rows[0]!).getByText('EPC').getAttribute('title')).toBe('European patent')
    fireEvent.click(rows[2]!)
    expect(acts.select).toHaveBeenCalledWith(KEYS[2])
    expect(screen.queryByRole('article')).toBeNull()
    expect(screen.getByText('Applications: 4')).toBeTruthy()
  })

  it('sorts by a column header, filters by type, portfolio and text, and reads again', () => {
    const { acts } = page({ view: 'EPC', portfolio: 'p2' })
    expect(screen.getByRole('columnheader', { name: 'Filed' }).getAttribute('aria-sort')).toBe('descending')
    expect(screen.getByRole('columnheader', { name: 'Your reference' }).hasAttribute('aria-sort')).toBe(false)
    for (const column of ['Your reference', 'Application', 'Portfolio', 'Filed', 'Next due date']) fireEvent.click(screen.getByRole('button', { name: column }))
    expect(acts.sortBy.mock.calls).toEqual([['reference'], ['number'], ['portfolio'], ['filed'], ['due']])
    const views = within(screen.getByRole('group', { name: 'Type' }))
    expect(views.getAllByRole('button').map(button => [button.textContent, button.getAttribute('aria-pressed')])).toEqual([
      ['All 4', 'false'], ['European patent 3', 'true'], ['Unitary patent 1', 'false'],
    ])
    fireEvent.click(views.getByRole('button', { name: /Unitary patent/ }))
    expect(acts.setView).toHaveBeenCalledWith('UPP')
    const portfolio = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Portfolio' })
    expect([...portfolio.options].map(option => option.textContent)).toEqual(['Portfolio: all', 'Portfolio one', 'Portfolio two'])
    expect(portfolio.value).toBe('p2')
    fireEvent.change(portfolio, { target: { value: 'p1' } })
    fireEvent.change(portfolio, { target: { value: '' } })
    expect(acts.setPortfolio.mock.calls).toEqual([['p1'], [null]])
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find an application' }), { target: { value: 'ref' } })
    expect(acts.setQuery).toHaveBeenCalledWith('ref')
    fireEvent.click(screen.getByRole('button', { name: 'Read again' }))
    expect(acts.refresh).toHaveBeenCalledTimes(1)
    expect(tableRows()).toHaveLength(2)
  })

  it('says that no application matches, that MyEPO lists none, that rows are left, and that the list was cut', () => {
    page({ query: 'nothing' })
    expect(screen.getByText('No application matches.')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    cleanup()
    page({ applications: [], total: 0 })
    expect(screen.getByText(en['list.empty'])).toBeTruthy()
    cleanup()
    const { acts } = page({ limit: 1, total: 2132, failure: { kind: 'unreachable' } })
    expect(tableRows()).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Show 3 more of 4' }))
    expect(acts.more).toHaveBeenCalledTimes(1)
    expect(screen.getByText('The page shows the first 4 of 2,132 applications.')).toBeTruthy()
    // A failed read after a read that answered keeps the list, with its time.
    const notice = screen.getByRole('alert').textContent
    expect(notice).toContain('MyEPO did not answer.')
    expect(notice).toContain('The list shows MyEPO as of')
  })

  it('shows the open application: the EPO due dates with their terms, the pending fees and the data', () => {
    const { acts, container } = page({ selected: KEYS[0], data: { [KEYS[0]]: ready(DETAIL) } })
    expect(container.querySelector('section')?.hasAttribute('data-open')).toBe(true)
    const side = within(screen.getByRole('article', { name: 'The open application' }))
    expect(side.getByRole('heading', { level: 1, name: 'Scale' })).toBeTruthy()
    expect([...container.querySelectorAll('dl > div')].map(item => item.textContent)).toEqual(['ApplicationEP00000001.8', 'Your referenceB-ref', 'Filed6 Jun 2024'])
    const [dueDates, fees] = side.getAllByRole('table')
    // The due dates are in date order; the first one is in the past and its term key is not in the EPO's list.
    expect(within(dueDates!).getAllByRole('row').slice(1).map(row => cells(row))).toEqual([
      ['13 Jan 2025 past', 'Unknown term (DUE_TERM_NEW)', 'Applicant'],
      ['29 Jan 2027', 'Reply to communication', 'Representative'],
    ])
    expect(within(dueDates!).getAllByRole('row')[1]!.hasAttribute('data-past')).toBe(true)
    expect(within(fees!).getAllByRole('row').slice(1).map(row => cells(row))).toEqual([
      ['30 Nov 2026', '033', '1,915.00 EUR'],
      ['29 Jan 2027', '007', '123.00'],
    ])
    expect(side.getByText('From the EPO, not checked by FlowLeap')).toBeTruthy()
    expect(side.getByText('Renishaw plc, Wotton-under-Edge, GB')).toBeTruthy()
    expect(side.getByText('EP 22275123 · 8 Sept 2022')).toBeTruthy()
    expect(side.getByText('EP4584557 A1 · 16 Jul 2025')).toBeTruthy()
    // Five inventors: four show until the person asks for all; the application has no CPC class.
    expect(side.queryByText('Five, E')).toBeNull()
    fireEvent.click(side.getByRole('button', { name: 'Show all 5' }))
    expect(side.getByText('Five, E')).toBeTruthy()
    fireEvent.click(side.getByRole('button', { name: 'Show less' }))
    expect(side.queryByText('Five, E')).toBeNull()
    expect(side.getAllByText('None')).toHaveLength(1)
    expect(tableRows()[0]!.getAttribute('aria-selected')).toBe('true')

    fireEvent.click(side.getByRole('button', { name: 'Previous application' }))
    fireEvent.click(side.getByRole('button', { name: 'Next application' }))
    expect(acts.step.mock.calls).toEqual([[-1], [1]])
    fireEvent.click(side.getByRole('button', { name: 'Close' }))
    fireEvent.click(side.getByRole('button', { name: 'Applications' }))
    expect(acts.select.mock.calls).toEqual([[null], [null]])
  })

  it('writes the term of a due date in the language of the page', () => {
    page({ selected: KEYS[0], data: { [KEYS[0]]: ready(DETAIL) } }, { 'term.language': 'de' })
    expect(screen.getByText('Bescheid erwidern')).toBeTruthy()
    cleanup()
    page({ selected: KEYS[0], data: { [KEYS[0]]: ready(DETAIL) } }, { 'term.language': 'fr' })
    expect(screen.getByText('Répondre à la notification')).toBeTruthy()
  })

  it('says that the EPO lists no due date and no fee, and that the data is on its way, missing or not permitted', () => {
    page({ selected: KEYS[2], data: { [KEYS[2]]: ready({ ...DETAIL, titles: {}, dueDates: [], fees: [] }) } })
    expect(screen.getByRole('heading', { level: 1, name: 'No title' })).toBeTruthy()
    expect(screen.getByText('The EPO lists no due date for this application.')).toBeTruthy()
    expect(screen.getByText('No fee is pending.')).toBeTruthy()
    // The application has no reference.
    expect(screen.getAllByText('None').length).toBeGreaterThan(1)
    cleanup()
    page({ selected: KEYS[0] })
    expect(screen.getByRole('status').textContent).toBe('Reading the application from MyEPO…')
    cleanup()
    // The data of a firm's copy says when the firm worker read it.
    page({ selected: KEYS[0], data: { [KEYS[0]]: { status: 'ready', detail: { ...DETAIL, readAt: '2026-11-16T08:00:00.000Z' } } } })
    expect(screen.getByText(/^Copied from MyEPO: 16 Nov 2026, /u)).toBeTruthy()
    cleanup()
    page({ selected: KEYS[0], data: { [KEYS[0]]: { status: 'loading' } } })
    expect(screen.getByRole('status').textContent).toBe('Reading the application from MyEPO…')
    cleanup()
    page({ selected: KEYS[0], data: { [KEYS[0]]: ready({ kind: 'no-permission' }) } })
    expect(screen.getByText(en['detail.noPermission'])).toBeTruthy()
    cleanup()
    const failedCall = page({ selected: KEYS[0], data: { [KEYS[0]]: { status: 'failed', message: 'connection lost' } } })
    expect(screen.getByRole('alert').textContent).toContain('MyEPO gave no data for this application: connection lost')
    fireEvent.click(within(screen.getByRole('article')).getByRole('button', { name: 'Read again' }))
    expect(failedCall.acts.retry).toHaveBeenCalledWith(KEYS[0])
    cleanup()
    const refused = page({ selected: KEYS[0], data: { [KEYS[0]]: ready({ kind: 'unreachable' }) } })
    expect(within(screen.getByRole('article')).getByRole('alert').textContent).toContain('MyEPO did not answer.')
    fireEvent.click(within(screen.getByRole('article')).getByRole('button', { name: 'Read again' }))
    expect(refused.acts.retry).toHaveBeenCalledWith(KEYS[0])
    cleanup()
    // The open application left the list with a later read.
    page({ selected: 'EPC:EP99999999' })
    expect(screen.queryByRole('article')).toBeNull()
  })

  it('steps and closes with the keys, and leaves the keys of a field alone', () => {
    const { acts, container } = page()
    const section = container.querySelector('section') as HTMLElement
    for (const key of ['j', 'ArrowDown', 'k', 'ArrowUp', 'x', 'Escape']) fireEvent.keyDown(section, { key })
    expect(acts.step.mock.calls).toEqual([[1], [1], [-1], [-1]])
    expect(acts.select).toHaveBeenCalledWith(null)
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'j' })
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'j' })
    expect(acts.step).toHaveBeenCalledTimes(4)
  })
})

describe('the Applications launcher glyph', () => {
  it('draws at the requested edge', () => {
    const { container } = render(<ApplicationsPanelIcon size={18} />)
    expect(container.querySelector('svg')).not.toBeNull()
  })
})
