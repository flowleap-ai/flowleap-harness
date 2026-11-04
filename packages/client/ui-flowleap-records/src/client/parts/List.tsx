/**
 * Lists are tables (R17): 44px rows with no hairlines under a sticky 32px column header, grouped by atlas state in
 * sticky tinted 36px headers with a count. `X` or ⇧ click selects rows: the checkbox takes the place of the status
 * icon in every row, and the selection bar offers one bulk act. The open row has a 2px accent bar. A row's context
 * menu comes from the `ui-context-menu` trigger props that the screen passes.
 */

import { useRef, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import clsx from 'clsx'
import { Checkbox } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ContextMenuTriggerProps } from '@deepseek-ai/dsh-client-ui-context-menu/client'
import type { AtlasRef } from '../atlas.ts'
import { ActButton, type ActSpec } from './Act.tsx'
import { AtlasStatus, RowStatusIcon, type AtlasWord } from './Status.tsx'
import css from './List.module.css'

/**
 * Render a list: its scroll area, the sticky column header and the rows or groups. Every row and the header share
 * the column grid.
 * @param props.label - the list's accessible name.
 * @param props.columns - the `grid-template-columns` of the rows, the status column first, such as
 * `14px minmax(0, 1fr) 92px 20px 64px`.
 * @param props.header - the cells of the column header, one for each column; the first is the status column.
 * @param props.selecting - whether the rows show their checkboxes.
 * @param props.children - the groups or rows.
 * @param props.footer - the selection bar, docked at the bottom of the scroll area.
 * @returns the list.
 */
export function ListFrame({ label, columns, header, selecting = false, children, footer }: {
  label: string
  columns: string
  header: readonly ReactNode[]
  selecting?: boolean
  children: ReactNode
  footer?: ReactNode
}) {
  const style = { '--records-columns': columns } as CSSProperties
  return (
    <div className={css.pane} style={style} data-selecting={selecting || undefined}>
      <div className={css.header} aria-hidden="true">
        {header.map((cell, index) => <span key={index} className={css.headerCell}>{cell}</span>)}
      </div>
      <div className={css.list} role="list" aria-label={label}>{children}</div>
      {footer}
    </div>
  )
}

/**
 * Render a group of rows under its sticky header: the state's icon and word and the count. An empty group renders
 * nothing.
 * @param props.status - the group's atlas state.
 * @param props.word - its word.
 * @param props.count - the rows in the group.
 * @param props.children - the rows.
 * @returns the group.
 */
export function ListGroup({ status, word, count, children }: { status: AtlasRef; word: AtlasWord; count: number; children: ReactNode }) {
  if (count === 0) return null
  return (
    <div className={css.group} role="listitem">
      <div className={css.groupHeader}>
        <AtlasStatus status={status} word={word} />
        <span className={css.count}>{count}</span>
      </div>
      <div role="list">{children}</div>
    </div>
  )
}

/** The selection of one row. */
export interface RowSelection {
  readonly checked: boolean
  /** The checkbox's accessible name, such as "Select Rule 71(3) communication". */
  readonly label: string
  /**
   * Check or uncheck the row.
   * @param next - the new state.
   * @param range - ⇧ was held, so the selection runs from the last checked row to this one.
   */
  readonly onChange: (next: boolean, range: boolean) => void
}

/**
 * Render one 44px row: the status icon (or the checkbox while rows are selected) and the cells.
 * @param props.status - the state of the group header above the row; the icon is `aria-hidden`.
 * @param props.selection - the checkbox; while the list is selecting it replaces the icon.
 * @param props.open - the row is the open item: active background and the accent bar.
 * @param props.onOpen - open the row's item.
 * @param props.menu - the context menu trigger props from `useContextMenu().getTriggerProps(...)`.
 * @param props.children - the cells after the status column.
 * @returns the row.
 */
export function ListRow({ status, selection, open = false, onOpen, menu, children }: {
  status: AtlasRef
  selection: RowSelection
  open?: boolean
  onOpen: () => void
  menu?: ContextMenuTriggerProps | undefined
  children: ReactNode
}) {
  const range = useRef(false)
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.shiftKey) {
      selection.onChange(!selection.checked, true)
      return
    }
    onOpen()
  }
  return (
    <div
      {...menu}
      role="listitem"
      className={css.row}
      data-open={open || undefined}
      data-checked={selection.checked || undefined}
      aria-current={open || undefined}
      tabIndex={open ? 0 : -1}
      onClick={onClick}
    >
      <span
        className={css.lead}
        onClickCapture={(event) => { range.current = event.shiftKey }}
        onClick={(event) => { event.stopPropagation() }}
      >
        <span className={css.icon}><RowStatusIcon status={status} /></span>
        <Checkbox
          className={css.check}
          checked={selection.checked}
          label={selection.label}
          onChange={(next) => { selection.onChange(next, range.current) }}
        />
      </span>
      {children}
    </div>
  )
}

/**
 * Render a row's title cell: the title, then its source in the secondary colour. In a queue row only this cell
 * and the matter cell truncate; the full value is in the detail.
 * @param props.title - the title.
 * @param props.source - the source, such as the office.
 * @returns the cell.
 */
export function TitleCell({ title, source }: { title: string; source?: string | null | undefined }) {
  return (
    <span className={css.title}>
      {title}
      {source != null && source !== '' && <span className={css.source}>{source}</span>}
    </span>
  )
}

/**
 * Render a structured cell in the secondary colour, such as the matter's file number.
 * @param props.children - the value.
 * @param props.truncate - the value may truncate (a queue row's matter cell).
 * @returns the cell.
 */
export function MetaCell({ children, truncate = false }: { children: ReactNode; truncate?: boolean }) {
  return <span className={clsx(css.meta, truncate && css.truncate)}>{children}</span>
}

/**
 * Render the time cell, right-aligned in tabular figures.
 * @param props.children - the time.
 * @returns the cell.
 */
export function TimeCell({ children }: { children: ReactNode }) {
  return <span className={css.time}>{children}</span>
}

/** A cell of a skeleton row: the status dot, an avatar circle, a bar, or a bar at the end of the row. */
export type SkeletonCell = 'dot' | 'avatar' | 'bar' | 'end'

const WIDTHS = [60, 45, 70, 50, 65, 40, 55, 75] as const

/**
 * Render skeleton rows on the real column grid (R18): no shimmer, the skeleton colour.
 * @param props.cells - one entry for each column.
 * @param props.count - the rows (default 6).
 * @param props.label - the accessible name of the loading list.
 * @returns the rows.
 */
export function SkeletonRows({ cells, count = 6, label }: { cells: readonly SkeletonCell[]; count?: number; label: string }) {
  return (
    <div className={css.skeleton} role="status" aria-label={label}>
      {Array.from({ length: count }, (_, row) => (
        <div key={row} className={css.row} aria-hidden="true">
          {cells.map((cell, column) => (
            <span key={column} className={clsx(css.bone, css[cell], (cell === 'bar' || cell === 'end') && css[`w${WIDTHS[(row + column) % WIDTHS.length]}`])} />
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * Render the selection bar docked at the bottom of the list: the count and the one bulk decision.
 * @param props.label - the count as text, such as "3 selected".
 * @param props.acts - the tertiary and secondary acts, at the left of the primary.
 * @param props.primary - the bulk primary act, such as "Accept and file 3".
 * @returns the bar; `data-bulk` marks it for the design checks.
 */
export function SelectionBar({ label, acts, primary }: { label: string; acts: readonly ActSpec[]; primary: ActSpec }) {
  return (
    <div className={css.bulkDock}>
      <div className={css.bulk} data-bulk="">
        <span className={css.bulkCount}>{label}</span>
        <div className={css.bulkActs}>
          {acts.map(act => <ActButton key={act.id} act={act} rank="tertiary" />)}
          <ActButton act={primary} rank="primary" size="md" />
        </div>
      </div>
    </div>
  )
}
