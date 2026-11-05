/**
 * Intake: the filter chips of the three lists; the letters of one list grouped by atlas state under sticky headers
 * with counts, newest first in each group; and the open letter beside the list from 1366px, or as the item page with
 * "1 / N" below it. `X`, ⇧ click or a checkbox selects letters for one bulk decision (one act for each letter); a
 * right-click opens the row's acts. `J`/`K` and the arrows move, `↵` opens, Esc closes a step, clears the selection
 * or closes the letter.
 */

import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react'
import { Avatar, IconCheckOutlineRegular, IconCloseOutlineRegular, IconPaperPlaneOutlineRegular, Pill } from '@deepseek-ai/dsh-client-ui-primitives'
import type { CommandMenuItem } from '@deepseek-ai/dsh-client-ui-commands/client'
import { sameRequest, useActRunner } from '../act-runner.ts'
import type { Command, DocumentId, IntakeList, IntakeRow, IntakeView, QueueStatus } from '../api.ts'
import { commandId } from '../keys.ts'
import { useCommandItem, useKeyActs } from '../key-layer.ts'
import type { ActSpec } from '../parts/Act.tsx'
import { DecisionBar } from '../parts/Decision.tsx'
import { DetailHeader, QueueSplit, WorkColumn } from '../parts/Layout.tsx'
import { ListFrame, ListGroup, ListRow, ListSkeleton, MetaCell, SelectionBar, TimeCell, TitleCell } from '../parts/List.tsx'
import { EmptyState, LoadView, PageSpinner } from '../parts/States.tsx'
import { AtlasPill, atlasWord } from '../parts/Status.tsx'
import { letterTitle, listTimeText } from '../words.ts'
import { actOf, keyedOf, type ScreenContext, type ScreenProps } from './context.ts'
import { IntakeLetter } from './IntakeLetter.tsx'
import { copyLink } from './links.ts'
import { failureNotice, LoadError } from './shared.tsx'
import css from './Intake.module.css'

/** The column grid of an intake row: status, letter, matter, forwarder, received. */
export const INTAKE_COLUMNS = '14px minmax(0, 1fr) 92px 20px 64px'

/**
 * The column header of an intake list: status, letter, matter, forwarder, received.
 * @param t - the translate function.
 * @returns the header cells.
 */
function intakeHeader(t: ScreenContext['t']): readonly string[] {
  return ['', t('col.letter'), t('col.matter'), '', t('col.received')]
}

/** The group order of the lists, as the intake mockup shows it; other states follow. */
const GROUP_ORDER: readonly string[] = [
  'intake.match_proposed', 'intake.unmatched', 'intake.ambiguous', 'intake.kind_proposed', 'intake.duplicate_proposed',
  'intake.unreadable', 'deadline.code_proposed', 'deadline.awaiting_code',
]

/** The filter chips: each list with the count that names it. */
const LISTS: readonly { readonly list: IntakeView; readonly label: ListLabel; readonly count: keyof IntakeList['counts'] }[] = [
  { list: 'waiting', label: 'intake.list.waiting', count: 'waiting' },
  { list: 'filed-today', label: 'intake.list.filedToday', count: 'filedToday' },
  { list: 'not-relevant', label: 'intake.list.notRelevant', count: 'notRelevant' },
]

/** The label of each list. */
type ListLabel = 'intake.list.waiting' | 'intake.list.filedToday' | 'intake.list.notRelevant'
const LIST_LABEL: Readonly<Record<IntakeView, ListLabel>> = {
  'waiting': 'intake.list.waiting', 'filed-today': 'intake.list.filedToday', 'not-relevant': 'intake.list.notRelevant',
}

/** The command of one letter in a bulk decision. */
type LetterCommand = Extract<Command, { readonly kind: 'intake.match' | 'intake.notRelevant' }>

/** One group of rows. */
interface RowGroup {
  readonly status: QueueStatus
  readonly rows: readonly IntakeRow[]
}

const keyOf = (status: QueueStatus) => `${status.machine}.${status.state}`

const newest = (row: IntakeRow) => -Date.parse(row.receivedAt)

/**
 * Group rows by atlas state in the group order, newest first in each group ("Oldest last"); states outside the
 * order follow in the order they first appear.
 * @param rows - the rows, oldest first as the Records API sends them.
 * @returns the groups.
 */
export function groupRows(rows: readonly IntakeRow[]): RowGroup[] {
  const groups = new Map<string, { status: QueueStatus; rows: IntakeRow[] }>()
  for (const row of rows) {
    const group = groups.get(keyOf(row.status))
    if (group === undefined) groups.set(keyOf(row.status), { status: row.status, rows: [row] })
    else group.rows.push(row)
  }
  const rank = (status: QueueStatus) => {
    const index = GROUP_ORDER.indexOf(keyOf(status))
    return index === -1 ? GROUP_ORDER.length : index
  }
  return [...groups.values()]
    .toSorted((left, right) => rank(left.status) - rank(right.status))
    .map(group => ({ status: group.status, rows: group.rows.toSorted((left, right) => newest(left) - newest(right)) }))
}

/**
 * The rows in the order the list shows them, for "1 / N", `J` and `K`.
 * @param rows - the rows of the list.
 * @returns the rows in display order.
 */
export function shownOrder(rows: readonly IntakeRow[]): IntakeRow[] {
  return groupRows(rows).flatMap(group => group.rows)
}

/**
 * The letters among the checked ones that Accept and file takes: a proposed match on a matter.
 * @param rows - the rows of the list.
 * @param checked - the checked letters.
 * @returns one match for each acceptable letter.
 */
export function acceptable(rows: readonly IntakeRow[], checked: ReadonlySet<DocumentId>): { document: DocumentId; fileNumber: NonNullable<IntakeRow['matter']>['fileNumber'] }[] {
  return rows.flatMap(row => checked.has(row.document) && row.matter !== null && row.status.machine === 'intake' && row.status.state === 'match_proposed'
    ? [{ document: row.document, fileNumber: row.matter.fileNumber }]
    : [])
}

/** The width from which a queue shows its list and the open item side by side (R20). */
export const SPLIT_QUERY = '(min-width: 1366px)'

/**
 * Whether the view is wide enough for the list and the open item side by side.
 * @returns true from 1366px.
 */
function useSplit(): boolean {
  return useSyncExternalStore(
    (change) => {
      const query = window.matchMedia(SPLIT_QUERY)
      query.addEventListener('change', change)
      return () => { query.removeEventListener('change', change) }
    },
    () => window.matchMedia(SPLIT_QUERY).matches,
  )
}

/** The row element that holds focus inside the list, from the `data-row` attribute that `ListRow` writes. */
const focusedRow = (): DocumentId | null => {
  const row = document.activeElement?.closest('[data-row]')
  return (row?.getAttribute('data-row') ?? null) as DocumentId | null
}

/**
 * Whether a key event comes from a field, a menu or a dialog, which handle Esc themselves.
 * @param target - the event target.
 * @returns true when the screen leaves the key to its owner.
 */
function ownedElsewhere(target: EventTarget): boolean {
  return target instanceof Element && target.closest('input, textarea, select, [contenteditable], [role="menu"], [role="dialog"], [role="listbox"]') !== null
}

/**
 * Render the intake screen.
 * @param props.screen - the intake route with the list and the open letter.
 * @param props.ctx - the screen context.
 * @returns the queue.
 */
export function IntakeScreen({ screen, ctx }: ScreenProps<'intake'>) {
  const { t } = ctx
  const [checked, setChecked] = useState<ReadonlySet<DocumentId>>(new Set())
  const [anchor, setAnchor] = useState<DocumentId | null>(null)
  const [bulkReason, setBulkReason] = useState(false)
  const runner = useActRunner(ctx.perform)
  const busy = runner.run.phase === 'running'
  const sent = useRef<readonly LetterCommand[]>([])
  const loaded = screen.intake.phase === 'ready' ? screen.intake.data : screen.intake.phase === 'failed' ? screen.intake.last?.data ?? null : null
  const rows = loaded === null ? [] : shownOrder(loaded.rows)
  const order = rows.map(row => row.document)
  const open = (document: DocumentId | null) => { ctx.navigate({ view: 'intake', list: screen.list, open: document }) }
  const toggle = (document: DocumentId, next: boolean, range: boolean) => {
    const from = range && anchor !== null ? order.indexOf(anchor) : -1
    const to = order.indexOf(document)
    const span = from === -1 ? [document] : order.slice(Math.min(from, to), Math.max(from, to) + 1)
    const after = new Set(checked)
    for (const id of span) {
      if (next) after.add(id)
      else after.delete(id)
    }
    setChecked(after)
    setAnchor(document)
    runner.clear()
  }
  const clear = () => {
    setChecked(new Set())
    setBulkReason(false)
    runner.clear()
  }
  // J and K move the focus; with a letter open they also open the next letter, so X then selects the letter shown.
  const step = (by: 1 | -1) => () => {
    const current = screen.open ?? focusedRow()
    const next = current === null ? order[by === 1 ? 0 : order.length - 1] : order[order.indexOf(current) + by]
    if (next === undefined) return
    if (screen.open !== null) open(next)
    document.querySelector<HTMLElement>(`[data-row="${next}"]`)?.focus()
  }
  const matches = loaded === null ? [] : acceptable(loaded.rows, checked)
  /**
   * Send one act for each letter; the letters whose act failed stay checked, so the person can try again.
   * @param commands - the command of each letter.
   */
  const performEach = (commands: readonly LetterCommand[]) => {
    setBulkReason(false)
    void runner.submit(commands).then((result) => {
      if (result === null) return
      sent.current = commands
      const failed = commands.filter(command => result.failed.some(({ act }) => sameRequest(act.command, command)))
      setChecked(new Set(failed.map(command => command.document)))
    })
  }
  const acceptAll = () => { performEach(matches.map(row => ({ kind: 'intake.match', ...row }))) }
  const closeAll = (reason: string) => { performEach([...checked].map(document => ({ kind: 'intake.notRelevant', document, reason }))) }
  // While the failure shows, the checked letters are the letters whose act failed: a change of the selection clears it.
  const retryAll = () => { performEach(sent.current.filter(command => checked.has(command.document))) }
  const selecting = checked.size > 0
  const split = useSplit()
  const first = rows[0]?.document
  // From 1366px the queue always shows a letter beside the list, as Linear's triage does: the first one until the
  // person opens another.
  useEffect(() => {
    if (split && screen.open === null && !selecting && first !== undefined) ctx.navigate({ view: 'intake', list: screen.list, open: first })
  }, [split, screen.open, selecting, first, screen.list, ctx.navigate])
  const selectedText = checked.size === 1 ? t('intake.selectedOne') : t('intake.selected', { count: checked.size })
  const showFiled = () => { ctx.navigate({ view: 'intake', list: 'filed-today', open: null }) }
  useKeyActs(ctx, {
    next: step(1),
    previous: step(-1),
    open: () => {
      const row = focusedRow()
      if (row !== null) open(row)
    },
    select: () => {
      const row = focusedRow() ?? screen.open
      if (row !== null) toggle(row, !checked.has(row), false)
    },
    showFiled,
    goIntake: () => { ctx.navigate({ view: 'intake', list: 'waiting', open: null }) },
    retry: ctx.retry,
    ...(selecting ? { record: matches.length > 0 ? acceptAll : () => {}, reject: () => { setBulkReason(true) } } : {}),
    ...(runner.run.phase === 'failed' ? { retry: retryAll } : {}),
  })
  const listItem: CommandMenuItem = {
    label: selecting ? selectedText : t(LIST_LABEL[screen.list]),
    groups: [
      ...(selecting
        ? [{ id: 'selection', label: t('intake.menu.selection'), acts: [
          { id: 'accept', label: t('act.acceptFileCount', { count: matches.length }), commandId: commandId('record'), disabled: matches.length === 0 || busy, run: acceptAll },
          { id: 'reject', label: t('act.notRelevant'), commandId: commandId('reject'), run: () => { setBulkReason(true) } },
          { id: 'clear', label: t('selection.clear'), run: clear },
        ] }]
        : []),
      { id: 'lists', label: t('intake.menu.lists'), acts: LISTS.map(({ list, label }) => ({
        id: list, label: t(label), ...(list === 'filed-today' ? { commandId: commandId('showFiled') } : {}),
        run: () => { ctx.navigate({ view: 'intake', list, open: null }) },
      })) },
    ],
  }
  useCommandItem(ctx, listItem)

  const bulkBar = ctx.me === null || !selecting
    ? null
    : (
      <DecisionBar
        person={ctx.me.person}
        question={t('intake.bulk.question', { count: matches.length })}
        labels={{ yours: t('decision.yours'), more: t('decision.more') }}
        failure={failureNotice(ctx, runner.run, retryAll, runner.run.phase === 'failed' ? t('intake.bulk.failed', { count: runner.run.failed.length }) : undefined)}
        negative={{
          ...keyedOf(ctx, 'reject'),
          label: t('act.notRelevant'),
          icon: <IconCloseOutlineRegular size={16} />,
          open: bulkReason,
          onOpenChange: setBulkReason,
          reasonLabel: t('intake.bulk.reason', { count: checked.size }),
          confirmLabel: t('act.markNotRelevant'),
          cancelLabel: t('act.cancel'),
          onConfirm: closeAll,
        }}
        primary={{ ...actOf(ctx, 'record', t('act.acceptFileCount', { count: matches.length }), acceptAll, { icon: <IconCheckOutlineRegular size={16} />, disabled: matches.length === 0 }), busy }}
      />
    )
  const statuses = new Set(rows.filter(row => checked.has(row.document)).map(row => keyOf(row.status)))
  const shared = statuses.size === 1 ? rows.find(row => checked.has(row.document))?.status : undefined
  const selection = !selecting
    ? null
    : (
      <WorkColumn decision={bulkBar}>
        <DetailHeader
          eyebrow={shared === undefined ? null : <AtlasPill status={shared} word={atlasWord(t, shared)} />}
          title={selectedText}
          lede={t('intake.bulk.lede')}
        />
        <ul className={css.files}>
          {rows.filter(row => checked.has(row.document)).map(row => (
            <li key={row.document} className={css.file}>
              <span className={css.fileTitle}>{letterTitle(t, row.code, row.status)}</span>
              <span className={css.fileSub}>{row.matter === null ? atlasWord(t, row.status) : `${row.matter.fileNumber} ${row.matter.title}`}</span>
            </li>
          ))}
        </ul>
      </WorkColumn>
    )
  const item = selection ?? (screen.item === null || screen.open === null
    ? null
    : (
      <LoadView
        key={`${screen.open}:${screen.step ?? ''}`}
        load={screen.item}
        render={{
          loading: () => <PageSpinner label={t('loading')} />,
          failed: at => <LoadError ctx={ctx} at={at} />,
          ready: letter => <IntakeLetter key={`${letter.document}:${screen.step ?? ''}`} ctx={ctx} list={screen.list} letter={letter} step={screen.step} />,
        }}
      />
    ))
  // A touch screen has no row context menu: the overflow menu offers the acts of the one selected row instead.
  const [only] = checked.size === 1 ? checked : []
  const rowActs: ActSpec[] = only === undefined
    ? []
    : [
      { id: 'open', label: t('act.open'), keycaps: [], run: () => { clear(); open(only) } },
      { id: 'other-matter', label: t('act.otherMatterMenu'), keycaps: [], run: () => { clear(); ctx.navigate({ view: 'intake', list: screen.list, open: only, step: 'other-matter' }) } },
      { id: 'copy-link', label: t('intake.act.copyLink'), keycaps: [], run: () => { void copyLink(ctx.linkOf({ view: 'intake', list: screen.list, open: only })) } },
    ]
  const narrowBulk = !selecting
    ? undefined
    : bulkReason
      ? <div className={css.bulkSlot}>{bulkBar}</div>
      : (
        <div className={css.bulkSlot}>
          <SelectionBar
            label={t('selection.count', { count: checked.size })}
            acts={[{ ...keyedOf(ctx, 'reject'), label: t('act.notRelevant'), icon: <IconCloseOutlineRegular size={16} />, run: () => { setBulkReason(true) } }]}
            more={{ label: t('decision.more'), acts: [...rowActs, { id: 'clear', label: t('selection.clear'), keycaps: [], run: clear }] }}
            primary={{ ...actOf(ctx, 'record', t('act.acceptFileCount', { count: matches.length }), acceptAll, { icon: <IconCheckOutlineRegular size={16} />, disabled: matches.length === 0 }), busy }}
          />
        </div>
      )
  const list = (
    <LoadView
      load={screen.intake}
      render={{
        loading: () => <ListSkeleton label={t('loading')} columns={INTAKE_COLUMNS} header={intakeHeader(t)} cells={['dot', 'bar', 'bar', 'avatar', 'end']} />,
        failed: at => <LoadError ctx={ctx} at={at} />,
        ready: data => (
          <IntakeListView
            ctx={ctx}
            data={data}
            list={screen.list}
            open={screen.open}
            checked={checked}
            onCheck={toggle}
            footer={narrowBulk}
          />
        ),
      }}
    />
  )
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || event.defaultPrevented || ownedElsewhere(event.target)) return
    if (bulkReason) setBulkReason(false)
    else if (selecting) clear()
    else if (screen.open !== null && !split) open(null)
    else return
    event.preventDefault()
  }
  return (
    <div className={css.screen} tabIndex={-1} data-testid="intake" data-open={screen.open !== null || undefined} onKeyDown={onKeyDown}>
      <div className={css.viewbar}>
        {LISTS.map(({ list: name, label, count }) => (
          <Pill
            key={name}
            active={name === screen.list}
            aria-pressed={name === screen.list}
            className={name === 'waiting' ? undefined : css.wideChip}
            onClick={() => { ctx.navigate({ view: 'intake', list: name, open: null }) }}
          >
            {t(label)}
            {loaded !== null && <span className={css.count}>{loaded.counts[count]}</span>}
          </Pill>
        ))}
        <span className={css.order}>{t('intake.order')}</span>
      </div>
      <QueueSplit list={list} item={item} itemWideOnly={selecting} />
    </div>
  )
}

/**
 * Render the rows of one intake list, or its empty state.
 * @param props.ctx - the screen context.
 * @param props.data - the list.
 * @param props.list - which list.
 * @param props.open - the open letter.
 * @param props.checked - the checked letters.
 * @param props.onCheck - check or uncheck a letter; `range` selects from the last one.
 * @param props.footer - the bulk bar below 1366px.
 * @returns the list.
 */
function IntakeListView({ ctx, data, list, open, checked, onCheck, footer }: {
  ctx: ScreenContext
  data: IntakeList
  list: IntakeView
  open: DocumentId | null
  checked: ReadonlySet<DocumentId>
  onCheck: (document: DocumentId, next: boolean, range: boolean) => void
  footer: ReactNode
}) {
  const { t } = ctx
  if (data.rows.length === 0) {
    const empty = list === 'waiting'
      ? { title: t('empty.intake.title'), body: t('empty.intake.body') }
      : list === 'filed-today'
        ? { title: t('intake.empty.filedTitle'), body: t('intake.empty.filedBody') }
        : { title: t('intake.empty.closedTitle'), body: t('intake.empty.closedBody') }
    return (
      <EmptyState
        icon={<IconPaperPlaneOutlineRegular size={16} />}
        title={empty.title}
        body={empty.body}
        action={list === 'filed-today'
          ? actOf(ctx, 'goIntake', t('intake.list.waiting'), () => { ctx.navigate({ view: 'intake', list: 'waiting', open: null }) })
          : actOf(ctx, 'showFiled', t('act.showFiled'), () => { ctx.navigate({ view: 'intake', list: 'filed-today', open: null }) })}
      />
    )
  }
  return (
    <ListFrame
      label={t('intake.listLabel')}
      columns={INTAKE_COLUMNS}
      header={intakeHeader(t)}
      selecting={checked.size > 0}
      footer={footer}
    >
      {groupRows(data.rows).map(group => (
        <ListGroup key={keyOf(group.status)} status={group.status} word={atlasWord(t, group.status)} count={group.rows.length}>
          {group.rows.map((row) => {
            const title = letterTitle(t, row.code, row.status)
            const sender = row.forwarder
            return (
              <ListRow
                key={row.document}
                rowKey={row.document}
                status={group.status}
                open={row.document === open}
                selection={{ checked: checked.has(row.document), label: t('select.row', { title }), onChange: (next, range) => { onCheck(row.document, next, range) } }}
                onOpen={() => { ctx.navigate({ view: 'intake', list, open: row.document }) }}
                menu={ctx.rowMenu({ document: row.document, list, proposed: row.status.state === 'match_proposed' ? row.matter?.fileNumber ?? null : null })}
              >
                <TitleCell title={title} source={row.office} />
                <MetaCell truncate>{row.matter?.fileNumber ?? (row.matterCount > 1 ? t('matter.count', { count: row.matterCount }) : t('matter.none'))}</MetaCell>
                {sender === null
                  ? <span />
                  : <span data-address={sender.id === null ? '' : undefined}><Avatar person={{ name: sender.name, label: t('row.forwardedBy', { person: sender.name }) }} /></span>}
                <TimeCell>{listTimeText(ctx, row.receivedAt)}</TimeCell>
              </ListRow>
            )
          })}
        </ListGroup>
      ))}
    </ListFrame>
  )
}
