// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DataTable, type DataTableColumn, type DataTableLabels, type DataTableState } from '../src/DataTable.tsx'

afterEach(cleanup)

interface Application {
  readonly number: string
  readonly status: 'Examination' | 'Granted'
  readonly claims: number
  readonly folder: boolean
}

const COLUMNS: readonly DataTableColumn<Application>[] = [
  { id: 'number', header: 'Application', cell: row => row.number, sortValue: row => row.number, width: 120 },
  {
    id: 'status', header: 'Status', cell: row => row.status, sortValue: row => row.status, hideBelow: 720,
    filter: { kind: 'select', label: 'Status', all: 'All statuses', options: [{ value: 'Examination', label: 'Examination' }, { value: 'Granted', label: 'Granted' }], value: row => row.status },
  },
  { id: 'claims', header: 'Claims', cell: row => row.claims, sortValue: row => row.claims, align: 'end', hideBelow: 1080 },
  { id: 'folder', header: 'Matter folder', cell: row => (row.folder ? 'Yes' : ''), filter: { kind: 'chip', label: 'With a matter folder', test: row => row.folder } },
]

const LABELS: DataTableLabels = {
  table: 'Applications',
  empty: 'No row matches these filters.',
  pageSize: 'Rows per page',
  previous: 'Previous page',
  next: 'Next page',
  range: ({ first, last, total }) => (total === 0 ? '0 of 0' : `${first}–${last} of ${total.toLocaleString('en-GB')}`),
}

const TEXT = { label: 'Find an application', text: (row: Application) => `${row.number} ${row.status}` }

const app = (n: number, overrides: Partial<Application> = {}): Application => ({
  number: `EP${String(23171800 + n)}`, status: n % 2 === 0 ? 'Granted' : 'Examination', claims: n, folder: n % 3 === 0, ...overrides,
})

const many = (count: number) => Array.from({ length: count }, (_, i) => app(i + 1))

/** The text of the first cell of each body row, in order. */
const firstCells = () => within(screen.getByRole('table', { name: 'Applications' })).getAllByRole('row').slice(1)
  .map(row => within(row).getAllByRole('cell')[0]!.textContent)
const range = (text: string) => screen.getByText(text)
const header = (name: string) => screen.getByRole('columnheader', { name: new RegExp(`^${name}`) })

describe('DataTable in client mode', () => {
  it('sorts by its first sort, then by a pressed header, ascending first and descending on the second press', () => {
    const rows = [app(2), app(10), app(1)]
    render(<DataTable columns={COLUMNS} rows={rows} rowKey={row => row.number} labels={LABELS} mode={{ kind: 'client', sort: { column: 'number', direction: 'descending' }, pageSize: 25 }} />)
    expect(firstCells()).toEqual(['EP23171810', 'EP23171802', 'EP23171801'])
    expect(header('Application').getAttribute('aria-sort')).toBe('descending')

    fireEvent.click(within(header('Claims')).getByRole('button', { name: 'Claims' }))
    expect(firstCells()).toEqual(['EP23171801', 'EP23171802', 'EP23171810'])
    expect(header('Claims').getAttribute('aria-sort')).toBe('ascending')
    expect(header('Application').hasAttribute('aria-sort')).toBe(false)

    fireEvent.click(within(header('Claims')).getByRole('button', { name: 'Claims' }))
    expect(firstCells()).toEqual(['EP23171810', 'EP23171802', 'EP23171801'])
    expect(header('Claims').getAttribute('aria-sort')).toBe('descending')
  })

  it('keeps the order of the rows with no sort, gives a header without a sort key no control, and sets fixed widths', () => {
    render(<DataTable columns={COLUMNS} rows={[app(2), app(1)]} rowKey={row => row.number} labels={LABELS} mode={{ kind: 'client', sort: null, pageSize: 25 }} />)
    expect(firstCells()).toEqual(['EP23171802', 'EP23171801'])
    expect(within(header('Matter folder')).queryByRole('button')).toBeNull()
    expect(header('Application').style.width).toBe('120px')
    expect(header('Status').style.width).toBe('')
  })

  it('filters by the text, ignoring case, and says when no row matches', () => {
    render(<DataTable columns={COLUMNS} rows={many(3)} rowKey={row => row.number} labels={LABELS} textFilter={TEXT} mode={{ kind: 'client', sort: null, pageSize: 25 }} />)
    const field = screen.getByRole('searchbox', { name: 'Find an application' })
    fireEvent.change(field, { target: { value: '  granted ' } })
    expect(firstCells()).toEqual(['EP23171802'])
    expect(range('1–1 of 1')).toBeTruthy()
    fireEvent.change(field, { target: { value: 'EP99' } })
    expect(firstCells()).toEqual([])
    expect(screen.getByText(LABELS.empty)).toBeTruthy()
    expect(range('0 of 0')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Previous page' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Next page' })).toHaveProperty('disabled', true)
  })

  it('filters by a select and by a chip from the column metadata, and turns each off again', () => {
    render(<DataTable columns={COLUMNS} rows={many(6)} rowKey={row => row.number} labels={LABELS} mode={{ kind: 'client', sort: null, pageSize: 25 }} />)
    expect(screen.queryByRole('searchbox')).toBeNull()
    const status = screen.getByRole('combobox', { name: 'Status' })
    fireEvent.change(status, { target: { value: 'Granted' } })
    expect(firstCells()).toEqual(['EP23171802', 'EP23171804', 'EP23171806'])

    const chip = screen.getByRole('button', { name: 'With a matter folder' })
    fireEvent.click(chip)
    expect(chip.getAttribute('aria-pressed')).toBe('true')
    expect(firstCells()).toEqual(['EP23171806'])

    fireEvent.change(status, { target: { value: '' } })
    expect(firstCells()).toEqual(['EP23171803', 'EP23171806'])
    fireEvent.click(chip)
    expect(chip.getAttribute('aria-pressed')).toBe('false')
    expect(firstCells()).toHaveLength(6)
  })

  it('pages with Next and Previous, changes the page size, and starts again at the first page on a filter', () => {
    render(<DataTable columns={COLUMNS} rows={many(30)} rowKey={row => row.number} labels={LABELS} textFilter={TEXT} mode={{ kind: 'client', sort: null, pageSize: 10 }} />)
    const previous = screen.getByRole('button', { name: 'Previous page' })
    const next = screen.getByRole('button', { name: 'Next page' })
    expect(range('1–10 of 30')).toBeTruthy()
    expect(previous).toHaveProperty('disabled', true)
    fireEvent.click(next)
    expect(range('11–20 of 30')).toBeTruthy()
    expect(firstCells()[0]).toBe('EP23171811')
    fireEvent.click(next)
    expect(range('21–30 of 30')).toBeTruthy()
    expect(next).toHaveProperty('disabled', true)
    fireEvent.click(previous)
    expect(range('11–20 of 30')).toBeTruthy()

    const size = screen.getByRole('combobox', { name: 'Rows per page' })
    expect([...size.querySelectorAll('option')].map(option => option.textContent)).toEqual(['10', '25', '50', '100'])
    fireEvent.change(size, { target: { value: '25' } })
    expect(range('1–25 of 30')).toBeTruthy()
    fireEvent.click(next)
    expect(range('26–30 of 30')).toBeTruthy()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'EP2317180' } })
    expect(range('1–9 of 9')).toBeTruthy()
  })

  it('shows the last page when the rows shrink below the open page', () => {
    const props = { columns: COLUMNS, rowKey: (row: Application) => row.number, labels: LABELS, mode: { kind: 'client', sort: null, pageSize: 10 } as const }
    const { rerender } = render(<DataTable {...props} rows={many(30)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    rerender(<DataTable {...props} rows={many(12)} />)
    expect(range('11–12 of 12')).toBeTruthy()
    expect(firstCells()).toEqual(['EP23171811', 'EP23171812'])
  })

  it('stops rendering after its owner renders it again', async () => {
    const cell = vi.fn((row: Application) => row.number)
    const props = {
      columns: [{ ...COLUMNS[0]!, cell }, ...COLUMNS.slice(1)], rows: many(3), rowKey: (row: Application) => row.number, labels: LABELS,
      mode: { kind: 'client', sort: { column: 'number', direction: 'ascending' }, pageSize: 10 } as const,
    }
    const settle = () => act(async () => { await new Promise((resolve) => { setTimeout(resolve, 20) }) })
    const { rerender } = render(<DataTable {...props} />)
    await settle()
    rerender(<DataTable {...props} />)
    await settle()
    const drawn = cell.mock.calls.length
    await settle()
    expect(cell.mock.calls.length).toBe(drawn)
  })

  it('opens a row on a click and on Enter while the row has the focus', () => {
    const onOpen = vi.fn()
    render(<DataTable columns={COLUMNS} rows={many(2)} rowKey={row => row.number} labels={LABELS} mode={{ kind: 'client', sort: null, pageSize: 25 }} onOpen={onOpen} />)
    const [, first, second] = screen.getAllByRole('row')
    fireEvent.click(within(first!).getByText('EP23171801'))
    expect(onOpen).toHaveBeenLastCalledWith(app(1))
    second!.focus()
    expect(document.activeElement).toBe(second)
    fireEvent.keyDown(second!, { key: ' ' })
    expect(onOpen).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(second!, { key: 'Enter' })
    expect(onOpen).toHaveBeenLastCalledWith(app(2))
    fireEvent.keyDown(within(second!).getByText('EP23171802'), { key: 'Enter' })
    expect(onOpen).toHaveBeenCalledTimes(2)
  })

  it('gives rows no focus and no open act without onOpen', () => {
    render(<DataTable columns={COLUMNS} rows={many(1)} rowKey={row => row.number} labels={LABELS} mode={{ kind: 'client', sort: null, pageSize: 25 }} />)
    expect(screen.getAllByRole('row')[1]!.hasAttribute('tabindex')).toBe(false)
  })
})

describe('DataTable in server mode', () => {
  const STATE: DataTableState = { sort: { column: 'number', direction: 'ascending' }, text: '', filters: {}, page: { index: 1, size: 25 } }

  /** Render a server page of rows over the given state. */
  const mount = (state: DataTableState = STATE, rows: readonly Application[] = [app(30), app(26)]) => {
    const onStateChange = vi.fn<(next: DataTableState) => void>()
    const view = render(
      <DataTable columns={COLUMNS} rows={rows} rowKey={row => row.number} labels={LABELS} textFilter={TEXT}
        mode={{ kind: 'server', state, onStateChange, total: 1132 }} />,
    )
    return { onStateChange, view }
  }

  it('shows the rows of the page as the server sent them, with the range of the total', () => {
    mount()
    expect(firstCells()).toEqual(['EP23171830', 'EP23171826'])
    expect(range('26–50 of 1,132')).toBeTruthy()
    expect(header('Application').getAttribute('aria-sort')).toBe('ascending')
  })

  it('asks for each change of sort, text, filter, page and page size, and starts again at page 0 on a sort or filter', () => {
    const { onStateChange } = mount()
    fireEvent.click(within(header('Application')).getByRole('button'))
    expect(onStateChange).toHaveBeenLastCalledWith({ ...STATE, sort: { column: 'number', direction: 'descending' }, page: { index: 0, size: 25 } })
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'granted' } })
    expect(onStateChange).toHaveBeenLastCalledWith({ ...STATE, text: 'granted', page: { index: 0, size: 25 } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'Granted' } })
    expect(onStateChange).toHaveBeenLastCalledWith({ ...STATE, filters: { status: 'Granted' }, page: { index: 0, size: 25 } })
    fireEvent.click(screen.getByRole('button', { name: 'With a matter folder' }))
    expect(onStateChange).toHaveBeenLastCalledWith({ ...STATE, filters: { folder: true }, page: { index: 0, size: 25 } })
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(onStateChange).toHaveBeenLastCalledWith({ ...STATE, page: { index: 2, size: 25 } })
    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }))
    expect(onStateChange).toHaveBeenLastCalledWith({ ...STATE, page: { index: 0, size: 25 } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Rows per page' }), { target: { value: '100' } })
    expect(onStateChange).toHaveBeenLastCalledWith({ ...STATE, page: { index: 0, size: 100 } })
    expect(firstCells()).toEqual(['EP23171830', 'EP23171826'])
  })

  it('shows the state it is given, filters included, and filters no row itself', () => {
    mount({ ...STATE, text: 'granted', filters: { status: 'Granted', folder: true }, page: { index: 0, size: 25 } })
    expect(screen.getByRole('searchbox')).toHaveProperty('value', 'granted')
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveProperty('value', 'Granted')
    expect(screen.getByRole('button', { name: 'With a matter folder' }).getAttribute('aria-pressed')).toBe('true')
    expect(firstCells()).toEqual(['EP23171830', 'EP23171826'])
  })

  it('turns a column filter off with its first option or a second press', () => {
    const { onStateChange } = mount({ ...STATE, filters: { status: 'Granted', folder: true } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: '' } })
    expect(onStateChange).toHaveBeenLastCalledWith({ ...STATE, filters: { folder: true }, page: { index: 0, size: 25 } })
    fireEvent.click(screen.getByRole('button', { name: 'With a matter folder' }))
    expect(onStateChange).toHaveBeenLastCalledWith({ ...STATE, filters: { status: 'Granted' }, page: { index: 0, size: 25 } })
  })
})
