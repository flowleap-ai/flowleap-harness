/**
 * Lists are tables (R17): 44px rows with no hairlines under a sticky 32px column header, grouped by atlas state in
 * sticky tinted 36px headers with a count. `X` or ⇧ click selects rows: the checkbox takes the place of the status
 * icon in every row, and the selection bar offers one bulk act. On a touch screen a long press selects the row, and
 * while rows are selected a tap checks or unchecks a row instead of opening it. The open row has a 2px accent bar. A
 * row's context menu comes from the `ui-context-menu` trigger props that the screen passes; a touch has no context
 * menu, so the selection bar's overflow menu offers the row's acts.
 */

import { createContext, useContext, useEffect, useRef, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import clsx from 'clsx'
import { Checkbox } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ContextMenuTriggerProps } from '@deepseek-ai/dsh-client-ui-context-menu/client'
import type { AtlasRef } from '../atlas.ts'
import { ActButton, OverflowActs, type ActSpec } from './Act.tsx'
import { AtlasStatus, RowStatusIcon, type AtlasWord } from './Status.tsx'
import css from './List.module.css'
import bulk from './Selection.module.css'

/**
 * Render a list: its scroll area, the sticky column header and the rows or groups. Every row and the header share
 * the column grid.
 * @param props.label - the list's accessible name.
 * @param props.grid - the class of the screen's CSS that sets `--records-columns`, the `grid-template-columns` of the
 * header and the rows with the status column first; without it the list has one column.
 * @param props.header - the cells of the column header, one for each column; the first is the status column.
 * @param props.selecting - whether the rows show their checkboxes.
 * @param props.children - the groups or rows.
 * @param props.footer - the selection bar, docked at the bottom of the scroll area.
 * @returns the list.
 */
export function ListFrame({ label, grid, header, selecting = false, children, footer }: {
  label: string
  grid: string | undefined
  header: readonly ReactNode[]
  selecting?: boolean
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className={clsx(css.pane, grid)} data-list="" data-selecting={selecting || undefined}>
      <ListHeader header={header} />
      <Selecting.Provider value={selecting}>
        <div className={css.list} role="list" aria-label={label}>{children}</div>
      </Selecting.Provider>
      {footer}
    </div>
  )
}

/**
 * Render the sticky column header of a list.
 * @param props.header - one cell for each column.
 * @returns the header, hidden from assistive technology because each row names its own values.
 */
function ListHeader({ header }: { header: readonly ReactNode[] }) {
  return (
    <div className={css.header} aria-hidden="true">
      {header.map((cell, index) => <span key={index} className={css.headerCell}>{cell}</span>)}
    </div>
  )
}

/** Whether the rows of the list show their checkboxes; a tap on a touch screen then checks a row. */
const Selecting = createContext(false)

/** How long a touch rests on a row before it selects the row, as the platform long press. */
const LONG_PRESS_MS = 500

/** How far a touch may move before it is a scroll and not a long press. */
const PRESS_SLOP_PX = 8

/** What a group header names: an atlas state with its word, or, in My work, a due-time group with its UI icon. */
export type GroupHeading =
  | { readonly status: AtlasRef; readonly word: AtlasWord }
  | { readonly icon: ReactNode; readonly label: string }

/**
 * Render a group of rows under its sticky header: the state's icon and word (or the group's icon and label) and the
 * count. An empty group renders nothing.
 * @param props.count - the rows in the group.
 * @param props.children - the rows.
 * @returns the group.
 */
export function ListGroup({ count, children, ...heading }: GroupHeading & { count: number; children: ReactNode }) {
  if (count === 0) return null
  return (
    <div className={css.group} role="listitem">
      <div className={css.groupHeader}>
        {'status' in heading
          ? <AtlasStatus status={heading.status} word={heading.word} />
          : <span className={css.groupLabel}>{heading.icon}{heading.label}</span>}
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
 * @param props.status - the state of the group header above the row; the icon is `aria-hidden`. A row of a list grouped
 * by another key (My work) has no status column, and its cells name the status.
 * @param props.selection - the checkbox; while the list is selecting it replaces the icon. A row of a list with no
 * bulk act has none.
 * @param props.open - the row is the open item: active background and the accent bar.
 * @param props.onOpen - open the row's item.
 * @param props.menu - the context menu trigger props from `useContextMenu().getTriggerProps(...)`.
 * @param props.rowKey - the row's item id as `data-row`, so a key of the view layer finds the focused row.
 * @param props.children - the cells after the status column.
 * @returns the row.
 */
export function ListRow({ status, selection, open = false, onOpen, menu, rowKey, children }: {
  status?: AtlasRef | undefined
  selection?: RowSelection | undefined
  rowKey?: string | undefined
  open?: boolean
  onOpen: () => void
  menu?: ContextMenuTriggerProps | undefined
  children: ReactNode
}) {
  const range = useRef(false)
  const selecting = useContext(Selecting)
  const press = useRef<{ pointer: string; x: number; y: number; timer: ReturnType<typeof setTimeout> | null; done: boolean }>({
    pointer: 'mouse', x: 0, y: 0, timer: null, done: false,
  })
  const cancelPress = () => {
    if (press.current.timer !== null) clearTimeout(press.current.timer)
    press.current.timer = null
  }
  useEffect(() => cancelPress, [])
  const pressLong = () => {
    cancelPress()
    press.current.done = true
    selection?.onChange(true, false)
  }
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    if (press.current.done) {
      // The click that ends a long press: the press selected the row, so the row does not open.
      press.current.done = false
      return
    }
    if (selection !== undefined && (event.shiftKey || selecting && press.current.pointer === 'touch')) {
      selection.onChange(!selection.checked, event.shiftKey)
      return
    }
    onOpen()
  }
  const touchHandlers = selection === undefined
    ? {}
    : {
      onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
        cancelPress()
        press.current = { pointer: event.pointerType, x: event.clientX, y: event.clientY, timer: null, done: false }
        if (event.pointerType === 'touch') press.current.timer = setTimeout(pressLong, LONG_PRESS_MS)
      },
      onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
        if (Math.hypot(event.clientX - press.current.x, event.clientY - press.current.y) > PRESS_SLOP_PX) cancelPress()
      },
      onPointerUp: cancelPress,
      onPointerCancel: cancelPress,
      // A browser that turns a long press into a context menu (Chrome on Android) selects the row instead.
      onContextMenu: (event: MouseEvent<HTMLDivElement>) => {
        if (press.current.pointer === 'touch') {
          event.preventDefault()
          if (!press.current.done) pressLong()
        }
        menu?.onContextMenu?.(event)
      },
    }
  return (
    <div
      {...menu}
      {...touchHandlers}
      role="listitem"
      className={css.row}
      data-open={open || undefined}
      data-checked={selection?.checked === true || undefined}
      data-row={rowKey}
      aria-current={open || undefined}
      tabIndex={open ? 0 : -1}
      onClick={onClick}
    >
      {status !== undefined && (
        <span
          className={css.lead}
          onClickCapture={(event) => { range.current = event.shiftKey }}
          onClick={(event) => { event.stopPropagation() }}
        >
          <span className={css.icon}><RowStatusIcon status={status} /></span>
          {selection !== undefined && (
            <Checkbox
              className={css.check}
              checked={selection.checked}
              label={selection.label}
              onChange={(next) => { selection.onChange(next, range.current) }}
            />
          )}
        </span>
      )}
      {children}
    </div>
  )
}

/**
 * Render a row's title cell: the title, then its source in the secondary colour. In a queue row only this cell
 * and the matter cell truncate; the full value is in the detail. The title truncates first, so a short source such
 * as the office code stays whole; a long source takes at most half of the cell.
 * @param props.title - the title.
 * @param props.source - the source, such as the office.
 * @returns the cell.
 */
export function TitleCell({ title, source }: { title: string; source?: string | null | undefined }) {
  return (
    <span className={css.title}>
      <span className={css.titleText}>{title}</span>
      {source != null && source !== '' && <span className={css.source} data-source="">{source}</span>}
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
 * Render one bone of a skeleton row on the skeleton colour, with no shimmer; a bar takes a width that varies by place.
 * @param props.cell - the kind of bone.
 * @param props.place - the bone's place in the skeleton, which picks a bar's width.
 * @param props.className - a class of the caller's skeleton that sizes the bone, such as a pill or a letter tile.
 * @returns the bone.
 */
export function SkeletonBone({ cell, place, className }: { cell: SkeletonCell; place: number; className?: string | undefined }) {
  return <span className={clsx(css.bone, css[cell], (cell === 'bar' || cell === 'end') && css[`w${WIDTHS[place % WIDTHS.length]}`], className)} />
}

/**
 * Render a loading list (R18): the list's column header and skeleton rows on the same column grid as its real rows.
 * @param props.label - the accessible name of the loading list, such as "Loading".
 * @param props.grid - the column grid class of the real list, as `ListFrame` takes it.
 * @param props.header - the cells of the real column header.
 * @param props.cells - one bone for each column.
 * @param props.count - the rows (default 6).
 * @returns the loading list.
 */
export function ListSkeleton({ label, grid, header, cells, count = 6 }: {
  label: string
  grid: string | undefined
  header: readonly ReactNode[]
  cells: readonly SkeletonCell[]
  count?: number
}) {
  return (
    <div className={clsx(css.pane, grid)} data-list="" role="status" aria-label={label}>
      <ListHeader header={header} />
      <div className={css.skeleton} data-skeleton="" aria-hidden="true">
        {Array.from({ length: count }, (_, row) => (
          <div key={row} className={css.row}>
            {cells.map((cell, column) => <SkeletonBone key={column} cell={cell} place={row + column} />)}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Render the selection bar docked at the bottom of the list: the count and the one bulk decision.
 * @param props.label - the count as text, such as "3 selected".
 * @param props.acts - the tertiary and secondary acts, at the left of the primary.
 * @param props.more - the overflow menu (⋯) at the left of the primary: its accessible name and its acts, such as the
 * acts of the one selected row and Clear the selection, which a touch screen reaches nowhere else.
 * @param props.more.label - the accessible name, "More acts".
 * @param props.more.acts - the acts.
 * @param props.primary - the bulk primary act, such as "Accept and file 3".
 * @returns the bar; `data-bulk` marks it for the design checks.
 */
export function SelectionBar({ label, acts, more, primary }: {
  label: string
  acts: readonly ActSpec[]
  more?: { readonly label: string; readonly acts: readonly ActSpec[] } | undefined
  primary: ActSpec
}) {
  return (
    <div className={bulk.bulkDock}>
      <div className={bulk.bulk} data-fdl-part="decision" data-bulk="">
        <span className={bulk.bulkCount}>{label}</span>
        <div className={bulk.bulkActs}>
          {acts.map(act => <ActButton key={act.id} act={act} rank="tertiary" />)}
          {more !== undefined && more.acts.length > 0 && <OverflowActs label={more.label} acts={more.acts} />}
          <ActButton act={primary} rank="primary" size="md" />
        </div>
      </div>
    </div>
  )
}
