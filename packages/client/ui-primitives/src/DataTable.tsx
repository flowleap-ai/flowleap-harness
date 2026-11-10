// DataTable: the shared data table of the IPMS pages on TanStack Table (headless), drawn with the client tokens.

import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import clsx from 'clsx'
import {
  getCoreRowModel, getFilteredRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type ColumnFiltersState, type FilterFn, type SortingFn, type SortingState,
} from '@tanstack/react-table'
import { Button } from './Button.tsx'
import { Input } from './Input.tsx'
import { Pill } from './Pill.tsx'
import { Tooltip } from './Tooltip.tsx'
import {
  IconChevronDownOutlineRegular, IconChevronLeftOutlineRegular, IconChevronRightOutlineRegular, IconSearchOutlineRegular,
} from './icons/index.tsx'
import css from './DataTable.module.css'

/** The rows per page that the footer offers. */
export const DATA_TABLE_PAGE_SIZES = [10, 25, 50, 100] as const

/** One of {@link DATA_TABLE_PAGE_SIZES}. */
export type DataTablePageSize = (typeof DATA_TABLE_PAGE_SIZES)[number]

/** The sorted column and its direction, in the words of `aria-sort`. */
export interface DataTableSort {
  readonly column: string
  readonly direction: 'ascending' | 'descending'
}

/**
 * The view of a table: its sort, its filters and its page. A filter or sort change starts again at page 0.
 */
export interface DataTableState {
  /** Null shows the rows in the order of `rows`. */
  readonly sort: DataTableSort | null
  /** The text of the text filter as typed; an empty or blank text does not filter. */
  readonly text: string
  /**
   * The column filters that are on, by column id: the option value of a `select` filter, or `true` for a `chip` filter.
   * A column with no entry is not filtered.
   */
  readonly filters: Readonly<Record<string, string | true>>
  /** The page, from 0, and its size. */
  readonly page: { readonly index: number; readonly size: DataTablePageSize }
}

/** One option of a `select` filter. */
export interface DataTableFilterOption {
  readonly value: string
  readonly label: string
}

/**
 * The filter of a column in the filter bar. `select` keeps the rows whose `value` is the chosen option; its first
 * option `all` turns it off. `chip` is a toggle that keeps the rows for which `test` is true while it is pressed. In
 * server mode the table calls neither function: the state names the filter and the server applies it.
 */
export type DataTableFilter<Row> =
  | {
    readonly kind: 'select'
    /** The accessible name of the select. */
    readonly label: string
    /** The label of the first option, which turns the filter off. */
    readonly all: string
    readonly options: readonly DataTableFilterOption[]
    readonly value: (row: Row) => string
  }
  | {
    readonly kind: 'chip'
    /** The chip's text. */
    readonly label: string
    readonly test: (row: Row) => boolean
  }

/** One column of a table. */
export interface DataTableColumn<Row> {
  /** Stable id: the key of the sort and of the column filter in {@link DataTableState}. */
  readonly id: string
  /** Localized header text. */
  readonly header: string
  readonly cell: (row: Row) => ReactNode
  /**
   * The sort key of a row; a column without one has no sort control. Numbers compare as numbers, text compares in
   * the browser's locale with numbers inside the text in numeric order. In server mode the table does not call it.
   */
  readonly sortValue?: (row: Row) => string | number
  readonly filter?: DataTableFilter<Row>
  /** Fixed width in px; columns without one share the remaining width. */
  readonly width?: number
  /** `end` aligns the header and the cells at the end, with tabular figures, for numbers. Default `start`. */
  readonly align?: 'start' | 'end'
  /** Hide the column at viewport widths of this many px and less. */
  readonly hideBelow?: 1080 | 720
}

/** The rows that a page shows, from 1; all three are 0 when no row matches. */
export interface DataTableRange {
  readonly first: number
  readonly last: number
  readonly total: number
}

/** Localized copy of a table. */
export interface DataTableLabels {
  /** The accessible name of the table. */
  readonly table: string
  /** The text below the header when no row matches. */
  readonly empty: string
  /** The label of the page size select. */
  readonly pageSize: string
  readonly previous: string
  readonly next: string
  /** The footer's range, such as `1–25 of 1,132`; for a range of zeros, such as `0 of 0`. */
  readonly range: (range: DataTableRange) => string
}

/**
 * Who sorts, filters and pages. In `client` mode `rows` are all rows and the table owns its state from `sort` and
 * `pageSize`. In `server` mode `rows` are the rows of the current page, the caller owns `state` and gets each change
 * through `onStateChange`, and `total` counts the rows that match the filters. The caller sets the next state at once
 * (the text field shows `state.text`) and can wait before it asks the server.
 */
export type DataTableMode =
  | { readonly kind: 'client'; readonly sort: DataTableSort | null; readonly pageSize: DataTablePageSize }
  | {
    readonly kind: 'server'
    readonly state: DataTableState
    readonly onStateChange: (state: DataTableState) => void
    readonly total: number
  }

/** Props of {@link DataTable}. */
export interface DataTableProps<Row> {
  /** The columns in order; keep the array stable across renders, because a new array sorts and filters again. */
  readonly columns: readonly DataTableColumn<Row>[]
  readonly rows: readonly Row[]
  /** A stable key of a row. */
  readonly rowKey: (row: Row) => string
  readonly labels: DataTableLabels
  readonly mode: DataTableMode
  /**
   * The text filter of the filter bar: its accessible name and placeholder, and the text of a row that a typed text
   * must be in, ignoring case. Without it the filter bar has no text field.
   */
  readonly textFilter?: { readonly label: string; readonly text: (row: Row) => string }
  /** Open a row; with it, each row takes the focus and opens on a click or Enter. */
  readonly onOpen?: (row: Row) => void
  readonly className?: string | undefined
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/**
 * Compare two sort keys: numbers by value, text by {@link collator}.
 * @param x - the first key.
 * @param y - the second key.
 * @returns a negative number, 0 or a positive number, as `Array.prototype.sort` takes it.
 */
function compareKeys(x: string | number, y: string | number): number {
  return typeof x === 'number' && typeof y === 'number' ? x - y : collator.compare(String(x), String(y))
}

/**
 * The accessor of every column. TanStack filters and sorts only columns with an accessor; each column reads the row
 * through its own sort key and filter.
 * @param row - a row.
 * @returns the row.
 */
function wholeRow<Row>(row: Row): Row {
  return row
}

const HIDE_BELOW = { 1080: css.below1080, 720: css.below720 } as const

/**
 * Render a data table with sortable headers, a filter bar, pagination and an empty result. It has no row selection
 * and no row menu.
 * @param props - the columns, the rows, the copy, the mode, the text filter and the open act.
 * @returns the filter bar, the table and its footer.
 */
export function DataTable<Row>({ columns, rows, rowKey, labels, mode, textFilter, onOpen, className }: DataTableProps<Row>) {
  const [local, setLocal] = useState<DataTableState>(() => mode.kind === 'server'
    ? mode.state
    : { sort: mode.sort, text: '', filters: {}, page: { index: 0, size: mode.pageSize } })
  const server = mode.kind === 'server'
  const state = server ? mode.state : local
  const update = (next: DataTableState) => { if (server) mode.onStateChange(next); else setLocal(next) }
  const restart = (change: Partial<DataTableState>) => { update({ ...state, ...change, page: { ...state.page, index: 0 } }) }

  const defs = useMemo(() => columns.map((column): ColumnDef<Row> => {
    const { sortValue, filter } = column
    const filterFn: FilterFn<Row> | undefined = filter === undefined
      ? undefined
      : filter.kind === 'select'
        ? (row, _id, value) => filter.value(row.original) === value
        : row => filter.test(row.original)
    const sortingFn: SortingFn<Row> | undefined = sortValue === undefined
      ? undefined
      : (a, b) => compareKeys(sortValue(a.original), sortValue(b.original))
    return {
      id: column.id,
      accessorFn: wholeRow,
      enableSorting: sortingFn !== undefined,
      ...(sortingFn === undefined ? {} : { sortingFn }),
      ...(filterFn === undefined ? {} : { filterFn }),
    }
  }), [columns])
  const text = state.text.trim().toLocaleLowerCase()
  // TanStack sorts and filters again when these arrays change, so they change only with the state.
  const sorting: SortingState = useMemo(
    () => (state.sort === null ? [] : [{ id: state.sort.column, desc: state.sort.direction === 'descending' }]),
    [state.sort],
  )
  const columnFilters: ColumnFiltersState = useMemo(
    () => Object.entries(state.filters).map(([id, value]) => ({ id, value })),
    [state.filters],
  )
  const table = useReactTable<Row>({
    data: rows as Row[],
    columns: defs,
    getRowId: row => rowKey(row),
    state: { sorting, columnFilters, globalFilter: textFilter === undefined ? '' : text },
    manualSorting: server,
    manualFiltering: server,
    enableSortingRemoval: false,
    // This table owns its page. TanStack's own page reset after a new sort or filter result sets TanStack's internal
    // state, which renders the table again and, with a new sort or filter array, resets again without end.
    autoResetPageIndex: false,
    // The text filter reads the whole row once, so it runs on one column only.
    getColumnCanGlobalFilter: column => column.getIndex() === 0,
    ...(textFilter === undefined ? {} : {
      globalFilterFn: (row, _id, value: string) => textFilter.text(row.original).toLocaleLowerCase().includes(value),
    }),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  const matching = table.getPrePaginationRowModel().rows
  const total = server ? mode.total : matching.length
  const size = state.page.size
  const pages = Math.max(1, Math.ceil(total / size))
  const index = Math.min(state.page.index, pages - 1)
  const shown = server ? matching : matching.slice(index * size, (index + 1) * size)
  const range: DataTableRange = total === 0
    ? { first: 0, last: 0, total: 0 }
    : { first: index * size + 1, last: Math.min((index + 1) * size, total), total }
  const go = (to: number) => { update({ ...state, page: { ...state.page, index: to } }) }
  const sortBy = (column: string) => {
    const direction = state.sort?.column === column && state.sort.direction === 'ascending' ? 'descending' : 'ascending'
    restart({ sort: { column, direction } })
  }
  const filtered = columns.flatMap(({ id, filter }) => filter === undefined ? [] : [{ id, filter }])
  const openKey = (event: KeyboardEvent<HTMLTableRowElement>, row: Row) => {
    if (event.key === 'Enter' && event.target === event.currentTarget) onOpen?.(row)
  }

  return (
    <div className={clsx(css.root, className)}>
      {(textFilter !== undefined || filtered.length > 0) && (
        <div className={css.filters}>
          {textFilter !== undefined && (
            <Input className={clsx(css.find)} type="search" icon={<IconSearchOutlineRegular size={16} />} value={state.text}
              aria-label={textFilter.label} placeholder={textFilter.label}
              onChange={(event) => { restart({ text: event.target.value }) }} />
          )}
          {filtered.map(({ id, filter }) => filter.kind === 'select'
            ? (
              <select key={id} className={css.select} aria-label={filter.label} value={state.filters[id] === undefined ? '' : String(state.filters[id])}
                onChange={(event) => { restart({ filters: withFilter(state.filters, id, event.target.value === '' ? undefined : event.target.value) }) }}>
                <option value="">{filter.all}</option>
                {filter.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            )
            : (
              <Pill key={id} active={state.filters[id] === true} aria-pressed={state.filters[id] === true}
                onClick={() => { restart({ filters: withFilter(state.filters, id, state.filters[id] === true ? undefined : true) }) }}>
                {filter.label}
              </Pill>
            ))}
        </div>
      )}
      <div className={css.wrap}>
        <table className={css.table} aria-label={labels.table}>
          <thead>
            <tr>
              {columns.map((column) => {
                const sorted = state.sort?.column === column.id ? state.sort.direction : undefined
                return (
                  <th key={column.id} scope="col" aria-sort={sorted} style={{ width: column.width }}
                    className={clsx(css.th, column.align === 'end' && css.end, column.hideBelow !== undefined && HIDE_BELOW[column.hideBelow])}>
                    {column.sortValue === undefined
                      ? column.header
                      : (
                        <button type="button" className={clsx(css.sort, sorted !== undefined && css.sorted, sorted === 'ascending' && css.ascending)}
                          onClick={() => { sortBy(column.id) }}>
                          <span>{column.header}</span>
                          <IconChevronDownOutlineRegular size={12} className={css.chevron} />
                        </button>
                      )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map(row => (
              <tr key={row.id} className={clsx(onOpen !== undefined && css.open)} tabIndex={onOpen === undefined ? undefined : 0}
                onClick={onOpen === undefined ? undefined : () => { onOpen(row.original) }}
                onKeyDown={onOpen === undefined ? undefined : (event) => { openKey(event, row.original) }}>
                {columns.map(column => (
                  <td key={column.id} className={clsx(css.td, column.align === 'end' && css.end, column.hideBelow !== undefined && HIDE_BELOW[column.hideBelow])}>
                    {column.cell(row.original)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <p className={css.none}>{labels.empty}</p>}
      </div>
      <div className={css.foot}>
        <label className={css.size}>
          {labels.pageSize}
          <select className={css.select} value={size}
            onChange={(event) => { update({ ...state, page: { index: 0, size: Number(event.target.value) as DataTablePageSize } }) }}>
            {DATA_TABLE_PAGE_SIZES.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <span className={css.range}>{labels.range(range)}</span>
        <Tooltip label={labels.previous} side="top">
          <Button variant="outline" size="sm" aria-label={labels.previous} icon={<IconChevronLeftOutlineRegular size={16} />}
            disabled={index === 0} onClick={() => { go(index - 1) }} />
        </Tooltip>
        <Tooltip label={labels.next} side="top">
          <Button variant="outline" size="sm" aria-label={labels.next} icon={<IconChevronRightOutlineRegular size={16} />}
            disabled={index >= pages - 1} onClick={() => { go(index + 1) }} />
        </Tooltip>
      </div>
    </div>
  )
}

/**
 * Set or clear one column filter.
 * @param filters - the filters that are on.
 * @param id - the column id.
 * @param value - the new value; undefined turns the filter off.
 * @returns the new filters.
 */
function withFilter(filters: DataTableState['filters'], id: string, value: string | true | undefined): DataTableState['filters'] {
  const { [id]: _off, ...rest } = filters
  return value === undefined ? rest : { ...rest, [id]: value }
}
