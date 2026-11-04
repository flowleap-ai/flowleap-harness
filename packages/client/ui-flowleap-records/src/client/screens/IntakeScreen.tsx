/**
 * Intake (placeholder for the intake screen agent): the letters of one intake list grouped by atlas state, with the
 * open letter beside the list from 1366px and as its own page below. Rows select for one bulk Accept and file; a row
 * opens its context menu. The open letter shows its proposed matter and its decision bar.
 */

import { useState } from 'react'
import { Avatar, IconCheckOutlineRegular, IconCloseOutlineRegular, IconFolderOpenOutlineRegular, IconPaperPlaneOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { createAct, type DocumentId, type IntakeDocument, type IntakeList, type IntakeRow, type IntakeView, type QueueStatus } from '../api.ts'
import { atlasWord, AtlasPill } from '../parts/Status.tsx'
import { DecisionBar, DecisionPart } from '../parts/Decision.tsx'
import { DetailHeader, KeyProperties, QueueSplit, WorkColumn } from '../parts/Layout.tsx'
import { ListFrame, ListGroup, ListRow, MetaCell, SelectionBar, SkeletonRows, TimeCell, TitleCell } from '../parts/List.tsx'
import { EmptyState, LoadView, PageSpinner } from '../parts/States.tsx'
import { letterTitle, listTimeText } from '../words.ts'
import { actOf, keyedOf, type ScreenContext, type ScreenProps } from './context.ts'
import { deciderText, LoadError, RecordActivity } from './shared.tsx'

/** The column grid of an intake row: status, letter, matter, forwarder, received. */
export const INTAKE_COLUMNS = '14px minmax(0, 1fr) 92px 20px 64px'

/** The group order of the waiting list, as the intake mockup shows it; other states follow. */
const GROUP_ORDER: readonly string[] = [
  'intake.match_proposed', 'intake.unmatched', 'intake.ambiguous', 'intake.kind_proposed', 'intake.duplicate_proposed',
  'intake.unreadable', 'deadline.code_proposed', 'deadline.awaiting_code',
]

/** One group of rows. */
interface RowGroup {
  readonly status: QueueStatus
  readonly rows: readonly IntakeRow[]
}

const keyOf = (status: QueueStatus) => `${status.machine}.${status.state}`

/**
 * Group rows by atlas state in the group order; states outside it follow in the order they first appear.
 * @param rows - the rows.
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
  return [...groups.values()].toSorted((left, right) => rank(left.status) - rank(right.status))
}

/**
 * Render the intake screen.
 * @param props.screen - the intake route with the list and the open letter.
 * @param props.ctx - the screen context.
 * @returns the queue.
 */
export function IntakeScreen({ screen, ctx }: ScreenProps<'intake'>) {
  const item = screen.item === null || screen.open === null
    ? null
    : <IntakeItem key={`${screen.open}:${screen.step ?? ''}`} ctx={ctx} list={screen.list} load={screen.item} reasonFirst={screen.step === 'reason'} />
  const list = (
    <LoadView
      load={screen.intake}
      render={{
        loading: () => <SkeletonRows label={ctx.t('loading')} cells={['dot', 'bar', 'bar', 'avatar', 'end']} />,
        failed: at => <LoadError ctx={ctx} at={at} />,
        ready: data => <IntakeListView ctx={ctx} data={data} list={screen.list} open={screen.open} />,
      }}
    />
  )
  return <QueueSplit list={list} item={item} />
}

/**
 * Render the rows of one intake list, or its empty state.
 * @param props.ctx - the screen context.
 * @param props.data - the list.
 * @param props.list - which list.
 * @param props.open - the open letter.
 * @returns the list.
 */
function IntakeListView({ ctx, data, list, open }: { ctx: ScreenContext; data: IntakeList; list: IntakeView; open: DocumentId | null }) {
  const { t } = ctx
  const [checked, setChecked] = useState<ReadonlySet<DocumentId>>(new Set())
  const [anchor, setAnchor] = useState<DocumentId | null>(null)
  if (data.rows.length === 0) {
    return (
      <EmptyState
        icon={<IconPaperPlaneOutlineRegular size={16} />}
        title={t('empty.intake.title')}
        body={t('empty.intake.body')}
        action={actOf(ctx, 'showFiled', t('act.showFiled'), () => { ctx.navigate({ view: 'intake', list: 'filed-today', open: null }) })}
      />
    )
  }
  const groups = groupRows(data.rows)
  const order = groups.flatMap(group => group.rows.map(row => row.document))
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
  }
  const acceptable = data.rows.flatMap(row => checked.has(row.document) && row.matter !== null && row.status.state === 'match_proposed'
    ? [{ document: row.document, fileNumber: row.matter.fileNumber }]
    : [])
  const bar = checked.size === 0
    ? undefined
    : (
      <SelectionBar
        label={t('selection.count', { count: checked.size })}
        acts={[{ id: 'clear', label: t('selection.clear'), keycaps: [], icon: <IconCloseOutlineRegular size={16} />, run: () => { setChecked(new Set()) } }]}
        primary={actOf(ctx, 'record', t('act.acceptFileCount', { count: acceptable.length }), () => {
          void ctx.perform(acceptable.map(row => createAct({ kind: 'intake.match', ...row })))
          setChecked(new Set())
        }, { icon: <IconCheckOutlineRegular size={16} />, disabled: acceptable.length === 0 })}
      />
    )
  return (
    <ListFrame
      label={t('intake.listLabel')}
      columns={INTAKE_COLUMNS}
      header={['', t('col.letter'), t('col.matter'), '', t('col.received')]}
      selecting={checked.size > 0}
      footer={bar}
    >
      {groups.map(group => (
        <ListGroup key={keyOf(group.status)} status={group.status} word={atlasWord(t, group.status)} count={group.rows.length}>
          {group.rows.map((row) => {
            const title = letterTitle(t, row.code, row.status)
            return (
              <ListRow
                key={row.document}
                status={group.status}
                open={row.document === open}
                selection={{ checked: checked.has(row.document), label: t('select.row', { title }), onChange: (next, range) => { toggle(row.document, next, range) } }}
                onOpen={() => { ctx.navigate({ view: 'intake', list, open: row.document }) }}
                menu={ctx.rowMenu({ document: row.document, list, proposed: row.status.state === 'match_proposed' ? row.matter?.fileNumber ?? null : null })}
              >
                <TitleCell title={title} source={row.office} />
                <MetaCell truncate>{row.matter?.fileNumber ?? (row.matterCount > 1 ? t('matter.count', { count: row.matterCount }) : t('matter.none'))}</MetaCell>
                {row.forwarder === null ? <span /> : <Avatar person={{ name: row.forwarder.name, label: t('row.forwardedBy', { person: row.forwarder.name }) }} />}
                <TimeCell>{listTimeText(ctx, row.receivedAt)}</TimeCell>
              </ListRow>
            )
          })}
        </ListGroup>
      ))}
    </ListFrame>
  )
}

/**
 * Render the open letter: its header, the proposed matter, Activity and the decision bar.
 * @param props.ctx - the screen context.
 * @param props.list - the open list.
 * @param props.load - the letter's load.
 * @param props.reasonFirst - the route opened the reason step.
 * @returns the item pane.
 */
function IntakeItem({ ctx, list, load, reasonFirst }: { ctx: ScreenContext; list: IntakeView; load: NonNullable<ScreenProps<'intake'>['screen']['item']>; reasonFirst: boolean }) {
  return (
    <LoadView
      load={load}
      render={{
        loading: () => <PageSpinner label={ctx.t('loading')} />,
        failed: at => <LoadError ctx={ctx} at={at} />,
        ready: letter => <IntakeLetter ctx={ctx} list={list} letter={letter} reasonFirst={reasonFirst} />,
      }}
    />
  )
}

/**
 * Render one letter with its decision.
 * @param props.ctx - the screen context.
 * @param props.list - the open list.
 * @param props.letter - the letter.
 * @param props.reasonFirst - open the reason step first.
 * @returns the work column.
 */
function IntakeLetter({ ctx, list, letter, reasonFirst }: {
  ctx: ScreenContext
  list: IntakeView
  letter: IntakeDocument
  reasonFirst: boolean
}) {
  const { t } = ctx
  const [reasonOpen, setReasonOpen] = useState(reasonFirst)
  const proposed = letter.proposed
  const me = ctx.me
  const decision = me === null
    ? null
    : (
      <DecisionBar
        person={me.person}
        question={t('decision.whichMatter')}
        labels={{ yours: t('decision.yours'), more: t('decision.more') }}
        decider={deciderText(ctx, letter.mayDecide)}
        parts={proposed === null ? undefined : (
          <DecisionPart icon={<IconCheckOutlineRegular size={16} />} title={`${proposed.fileNumber} ${proposed.title}`} detail={t('decision.matchedByReference')} />
        )}
        negative={{
          ...keyedOf(ctx, 'reject'),
          label: t('act.notRelevant'),
          icon: <IconCloseOutlineRegular size={16} />,
          open: reasonOpen,
          onOpenChange: setReasonOpen,
          reasonLabel: t('reason.notRelevant'),
          confirmLabel: t('act.markNotRelevant'),
          cancelLabel: t('act.cancel'),
          onConfirm: (reason) => { void ctx.perform([createAct({ kind: 'intake.notRelevant', document: letter.document, reason })]) },
        }}
        secondary={[actOf(ctx, 'otherMatter', t('act.otherMatter'), () => {
          ctx.navigate({ view: 'intake', list, open: letter.document, step: 'other-matter' })
        }, { icon: <IconFolderOpenOutlineRegular size={16} /> })]}
        primary={proposed === null ? null : actOf(ctx, 'record', t('act.acceptFile'), () => {
          void ctx.perform([createAct({ kind: 'intake.match', document: letter.document, fileNumber: proposed.fileNumber })])
        }, { icon: <IconCheckOutlineRegular size={16} /> })}
      />
    )
  return (
    <WorkColumn decision={decision}>
      <DetailHeader
        eyebrow={<><AtlasPill status={letter.status} word={atlasWord(t, letter.status)} /><span>{t('item.since', { time: listTimeText(ctx, letter.since) })}</span></>}
        title={letterTitle(t, letter.code, letter.status)}
        lede={letter.mail.forwarder === null ? undefined : t('item.forwarded', { person: letter.mail.forwarder.name })}
      />
      {proposed !== null && (
        <KeyProperties rows={[
          { label: t('prop.proposedMatter'), value: `${proposed.fileNumber} ${proposed.title}` },
          { label: t('prop.client'), value: proposed.client },
          { label: t('prop.responsible'), value: proposed.responsible?.name ?? t('matter.none') },
        ]} />
      )}
      <RecordActivity ctx={ctx} events={letter.activity} />
    </WorkColumn>
  )
}
