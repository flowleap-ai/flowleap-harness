/**
 * The Add client wizard: the stepper, the open step, and its docked footer. This file has the steps Company, Matters
 * and Role; `CheckSteps.tsx` has Conflict check and Matter, and `ReviewStep.tsx` has Review.
 */

import { useState, type ReactNode } from 'react'
import clsx from 'clsx'
import {
  Button, IconCheckOutlineRegular, IconCordisPluginOutlineRegular, IconEditOutlineRegular, IconFolderCloseRegular, IconInfoOutlineRegular,
  IconSearchOutlineRegular, IconShieldOutlineRegular, IconUserOutlineRegular, IconUsersOutlineRegular, Keycap,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { DocketMatter, DocketState } from '../../add-client/wire.ts'
import panel from '../Panel.module.css'
import { Empty, Notice, RetryButton, Section, StepFoot, Stepper, hostText, type PageProps } from './AddClient.tsx'
import { ConflictStep, MatterStep } from './CheckSteps.tsx'
import { PATSTAT, applicationLabel, asOfText, counted, dayText, publicationLabel, type AddClientTranslate } from './format.ts'
import { ReviewStep } from './ReviewStep.tsx'
import type { FirmClient } from './records.ts'
import {
  canOpen, capped, docketUsable, isTicked, markOf, matterRows, nextOf, previousOf, stepsOf, waitOf,
  type DocketStatus, type FindStatus, type OthersStatus, type WizardView,
} from './wizard.ts'
import css from './AddClient.module.css'

/** The props of a step page. */
export type StepProps = PageProps & { readonly view: WizardView }

/** How many matter rows show before Show more. */
const MATTER_ROWS = 100

/**
 * Render the wizard: the stepper, the open step, and its footer.
 * @param props - the wizard, the model, copy and the keys.
 * @returns the page.
 */
export function WizardPage(props: StepProps) {
  const { t, view, model } = props
  const items = stepsOf(view.role).map(step => ({
    step, mark: markOf(view, step), onOpen: canOpen(view, step) ? () => { void model.open(step) } : undefined,
  }))
  const stepper = <Stepper t={t} items={items} />
  return (
    <>
      <div className={css.scroll}>
        <div className={css.flow}>
          {view.at === 'company' && <CompanyStep {...props} stepper={stepper} />}
          {view.at === 'matters' && <MattersStep {...props} stepper={stepper} />}
          {view.at === 'role' && <RoleStep {...props} stepper={stepper} />}
          {view.at === 'conflict' && <ConflictStep {...props} stepper={stepper} />}
          {view.at === 'matter' && <MatterStep {...props} stepper={stepper} />}
          {view.at === 'review' && <ReviewStep {...props} stepper={stepper} />}
        </div>
      </div>
      {view.at === 'review' ? <ReviewFoot {...props} /> : <NextFoot {...props} />}
    </>
  )
}

/** The footer of a step other than Review: Next, or Back to review after Edit. */
function NextFoot({ t, view, model }: StepProps) {
  const wait = waitOf(view, view.at)
  const next = nextOf(view)
  const note = wait !== null ? waitText(t, view, wait) : view.editing ? t('next.backToReview') : t(`next.${next}`)
  return (
    <StepFoot t={t} onBack={previousOf(view) === null ? undefined : () => { model.back() }} onCancel={() => { model.close() }}
      note={note} waiting={wait !== null}>
      <Button variant="primary" size="md" disabled={wait !== null} onClick={() => { void model.next() }}>
        {view.editing ? t('act.backToReview') : t('act.next')}
      </Button>
    </StepFoot>
  )
}

/** The footer of Review: the one primary act of Add client. */
function ReviewFoot({ t, view, model, recordKey }: StepProps) {
  const wait = waitOf(view, 'review')
  const role = view.role ?? 'client'
  return (
    <StepFoot t={t} onBack={() => { model.back() }} onCancel={view.recording.status === 'running' ? undefined : () => { model.close() }}
      note={wait === null ? primaryNote(t, view) : wait === 'conflict-check' ? t('wait.review.conflict-check') : waitText(t, view, wait)} waiting={wait !== null}>
      <Button variant="primary" size="md" icon={<IconCheckOutlineRegular size={16} />} disabled={wait !== null} onClick={() => { void model.record() }}>
        {t(`primary.${role}`)}
        {recordKey.keycaps.length > 0 && <Keycap keycaps={recordKey.keycaps} tone="primary" className={clsx(panel.keycap, css.keys)} />}
      </Button>
    </StepFoot>
  )
}

/**
 * The sentence of a reason to wait.
 * @param t - the translate function.
 * @param view - the wizard.
 * @param wait - the reason.
 * @returns the sentence.
 */
function waitText(t: AddClientTranslate, view: WizardView, wait: NonNullable<ReturnType<typeof waitOf>>): string {
  const { recording } = view
  return wait === 'busy' && recording.status === 'running' ? t('wait.busy', { done: recording.done, total: recording.total }) : t(`wait.${wait}`)
}

/** What the primary act of Review records. */
function primaryNote(t: AddClientTranslate, view: WizardView): string {
  const name = view.group?.name ?? ''
  if (view.role === 'watch') return t('note.watch', { name })
  // Review does not wait, so the role Other party has its matter.
  if (view.role === 'other-party' && view.other.applicationNumber !== null) return t('note.other', { name, application: applicationLabel(view.other.applicationNumber) })
  const count = matterRows(view).filter(row => isTicked(view, row)).length
  return t('note.client', { applications: counted(t, count, 'applications.one', 'applications.many') })
}

/** The stepper, the title and the lede of a step. */
export function StepHead({ stepper, title, lede }: {
  readonly stepper: ReactNode
  readonly title: string
  readonly lede?: string | undefined
}) {
  return (
    <>
      {stepper}
      <h1 className={panel.title}>{title}</h1>
      {lede !== undefined && <p className={css.lede}>{lede}</p>}
    </>
  )
}

/**
 * A register count, with "+" at the EPO's cap.
 * @param count - the count.
 * @param number - the number format of the UI language.
 * @param t - the translate function.
 * @returns the count as text.
 */
function countText(count: number, number: Intl.NumberFormat, t: AddClientTranslate): string {
  return capped(count) ? t('find.count.capped', { count: number.format(count) }) : number.format(count)
}

// Step 1: Company.

function CompanyStep(props: StepProps & { readonly stepper: ReactNode }) {
  const { t, view, model, locale, retryKeycaps, stepper } = props
  const { find, existing, query } = view
  const name = query.trim()
  const byName = <Button variant="outline" size="sm" onClick={() => { model.byName() }}>{t('act.byName')}</Button>
  return (
    <>
      <StepHead stepper={stepper} title={t('company.title')} lede={t('company.lede')} />
      <div className={css.fieldWrap}>
        <IconSearchOutlineRegular size={16} />
        <input className={css.field} type="search" value={query} aria-label={t('find.field')} placeholder={t('find.field')} autoFocus
          onChange={(event) => { model.type(event.currentTarget.value) }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            void model.find()
          }} />
      </div>
      <p className={css.privacy}><IconShieldOutlineRegular size={16} /><span>{t('find.privacy')}</span></p>
      {existing !== null && <ExistingNotice t={t} existing={existing} locale={locale} />}
      <DocketLine {...props} docket={view.docket} />
      {find.status === 'empty' && (
        <Empty icon={<IconUsersOutlineRegular size={24} />} title={t('find.empty.title')} body={t('find.empty.body')} />
      )}
      {find.status === 'loading' && find.skeleton && (
        <Section title={t('find.group.title')}>
          <div className={css.table} role="status" aria-label={t('find.loading')}>
            {[60, 50, 70, 50, 60].map((width, index) => (
              <div key={index} className={css.skeletonRow}><span /><span style={{ width: `${width}%` }} /><span /></div>
            ))}
          </div>
        </Section>
      )}
      {find.status === 'found' && <GroupSection {...props} find={find} />}
      {find.status === 'error' && (
        <>
          <Notice tone="bad" lead={t('find.error.lead')} rest={`${hostText(t, find.error)} ${t('find.error.rest')}`} act={<RetryButton t={t} keycaps={retryKeycaps} onClick={() => { void model.retry() }} />} />
          <p className={css.hint}><IconInfoOutlineRegular size={16} /><span>{t('find.error.hint', { name })}</span>{byName}</p>
        </>
      )}
      {find.status === 'no-key' && <Notice tone="bad" lead={t('find.noKey.title')} rest={t('find.noKey.body', { name })} act={byName} />}
      {(find.status === 'no-plugin' || find.status === 'by-name') && (
        <Empty icon={<IconCordisPluginOutlineRegular size={24} />} title={t('find.plugin.title')} body={find.status === 'no-plugin' ? t('find.plugin.body', { name }) : t('matters.byName')} />
      )}
    </>
  )
}

function ExistingNotice({ t, existing, locale }: { readonly t: AddClientTranslate; readonly existing: FirmClient; readonly locale: PageProps['locale'] }) {
  const date = dayText(existing.addedAt, locale)
  return (
    <Notice tone="info" lead={t(`find.existing.${existing.role}`, { name: existing.name })}
      rest={existing.addedBy.name === null ? t('find.existing.at', { date }) : t('find.existing.by', { person: existing.addedBy.name, date })} />
  )
}

/** The state of the firm docket on the Company step; nothing while no name is searched. */
function DocketLine({ t, model, locale, retryKeycaps, docket }: StepProps & { readonly docket: DocketStatus }) {
  const retry = <RetryButton t={t} keycaps={retryKeycaps} onClick={() => { void model.retry() }} />
  const rows = (count: number) => counted(t, count, 'docket.rows.one', 'docket.rows.many')
  switch (docket.status) {
    case 'idle':
    case 'loading':
      return null
    case 'no-plugin':
      return <Notice tone="info" lead={t('docket.noPlugin')} />
    case 'error':
      return <Notice tone="bad" lead={t('company.docketError')} rest={hostText(t, docket.error)} act={retry} />
    case 'read':
      return <DocketStateLine t={t} state={docket.docket} rows={rows} locale={locale} retry={retry} />
  }
}

function DocketStateLine({ t, state, rows, locale, retry }: {
  readonly t: AddClientTranslate
  readonly state: DocketState
  readonly rows: (count: number) => string
  readonly locale: PageProps['locale']
  readonly retry: ReactNode
}) {
  switch (state.state) {
    case 'no_identity':
      return <Notice tone="info" lead={t('company.noIdentity.lead')} rest={t('company.noIdentity.rest')} />
    case 'reading':
      return (
        <p className={css.docketLine} role="status">
          <span><span className={css.lead}>{t('docket.reading', { done: state.progress.slicesDone, total: state.progress.slices, rows: rows(state.progress.rows) })}</span> {t('docket.reading.rest')}</span>
          <span className={css.progress}><span style={{ width: `${Math.round(state.progress.slicesDone / Math.max(1, state.progress.slices) * 100)}%` }} /></span>
        </p>
      )
    case 'interrupted':
      return <Notice tone="warn" lead={t('docket.interrupted', { done: state.progress.slicesDone, total: state.progress.slices })} act={retry} />
    case 'ready':
    case 'stale':
      return (
        <p className={css.docketLine}>
          <IconCheckOutlineRegular size={16} className={css.okIcon} />
          <span><span className={css.lead}>{t('docket.ready', { rows: rows(state.rows) })}</span> {t('docket.asOf', { asOf: asOfText(t, state.asOf, locale) })}</span>
        </p>
      )
    case 'partial':
      return <Notice tone="warn" lead={t('docket.partial.lead')} rest={t('docket.partial.rest', { rows: rows(state.rows), asOf: asOfText(t, state.asOf, locale) })} act={retry} />
    case 'failed':
      return <Notice tone="bad" lead={t('docket.failed.lead')} rest={`${t(`docket.reason.${state.reason}`)} ${t('docket.failed.rest')}`} act={retry} />
  }
}

function GroupSection({ t, view, model, locale, find }: StepProps & { readonly find: Extract<FindStatus, { status: 'found' }> }) {
  const number = new Intl.NumberFormat(locale)
  const ticked = find.names.filter(item => item.ticked)
  const { docket } = view
  const known = docket.status === 'read' && docketUsable(docket.docket) ? docket : null
  const counting = docket.status === 'loading' || (docket.status === 'read' && docket.docket.state === 'reading')
  const atFirm = (name: string) => {
    if (known === null) return t('find.count.unknown')
    const count = known.counts.find(item => item.name === name)?.atFirm ?? 0
    if (known.docket.state !== 'partial') return number.format(count)
    return count === 0 ? t('find.count.noneFound') : t('find.count.atLeast', { count: number.format(count) })
  }
  const sample = { rows: number.format(find.sampleRows), asOf: asOfText(t, find.asOf, locale) }
  const patstat = find.source === 'patstat'
  return (
    <Section title={t('find.group.title')} count={t('sum.names.value', { ticked: ticked.length, total: find.names.length })}>
      <p className={css.hint}><IconInfoOutlineRegular size={16} /><span>{t('find.group.hint')}</span></p>
      <div className={css.table} role="table" aria-label={t('find.group.title')}>
        <div className={clsx(css.thead, css.names)} role="row">
          <span />
          <span role="columnheader">{patstat ? t('find.col.patstat', { product: PATSTAT }) : t('find.col.register')}</span>
          <span role="columnheader" className={css.end}>{t('find.col.atFirm')}</span>
          <span role="columnheader" className={clsx(css.end, css.wide)}>{t('find.col.matching')}</span>
        </div>
        {find.names.map(item => (
          <label key={item.name} className={clsx(css.row, css.names, !item.ticked && css.off)} role="row">
            <input type="checkbox" checked={item.ticked} aria-label={t('find.tick', { name: item.name })}
              onChange={(event) => { model.tick(item.name, event.currentTarget.checked) }} />
            <span className={css.text} role="cell">{item.name}</span>
            {counting
              ? <span className={clsx(css.end, css.skeletonCell)} role="cell" aria-label={t('find.loading')}><span /></span>
              : <span className={clsx(css.cell, css.end)} role="cell"><span className={css.onlySm}>{t('find.col.atFirm')} </span>{atFirm(item.name)}</span>}
            <span className={clsx(css.cell, css.end, css.wide)} role="cell">{countText(item.matching, number, t)}</span>
          </label>
        ))}
      </div>
      {find.omitted > 0 && <p className={css.hint}><IconInfoOutlineRegular size={16} /><span>{counted(t, find.omitted, 'find.omitted.one', 'find.omitted.many')}</span></p>}
      <p className={css.sourceLine}>
        {t('find.source.counts')}
        {find.names.some(item => capped(item.matching)) && ` ${t('find.source.capped')}`}
        {' '}{known === null ? t('find.source.sample', sample) : t('find.source.sampleDocket', sample)}
        {patstat && ` ${t('find.attribution')}`}
      </p>
    </Section>
  )
}

// Step 2: Matters.

function MattersStep(props: StepProps & { readonly stepper: ReactNode }) {
  const { t, view, model, locale, stepper } = props
  const [shown, setShown] = useState(MATTER_ROWS)
  const group = view.group
  const name = group?.name ?? ''
  const rows = matterRows(view)
  const firm = rows.filter(row => !row.addressOnly)
  const address = rows.filter(row => row.addressOnly)
  const count = rows.filter(row => isTicked(view, row)).length
  const title = count === 1 ? t('matters.title.one', { name }) : t('matters.title.many', { name, count })
  const { docket } = view
  const state = docket.status === 'read' ? docket.docket : null
  let body: ReactNode
  if (group === null || group.byName || docket.status === 'no-plugin') body = <Notice tone="info" lead={t('matters.byName')} />
  else if (state?.state === 'no_identity') body = <Notice tone="info" lead={t('matters.noDocket')} />
  else if (rows.length === 0) body = <Empty icon={<IconFolderCloseRegular size={24} />} title={t('matters.empty.title')} body={t('matters.empty.body', { name })} />
  else {
    body = (
      <Section title={t('matters.section')} count={new Intl.NumberFormat(locale).format(count)}>
        {state?.state === 'partial' && <Notice tone="warn" lead={t('matters.partial')} />}
        {state !== null && 'asOf' in state && <p className={css.sourceLine}>{t('matters.source', { asOf: asOfText(t, state.asOf, locale) })}</p>}
        <div className={css.table} role="table" aria-label={t('matters.section')}>
          <div className={clsx(css.thead, css.matters)} role="row">
            <span />
            <span role="columnheader">{t('col.application')}</span>
            <span role="columnheader">{t('col.title')}</span>
            <span role="columnheader">{t('col.publication')}</span>
            <span role="columnheader">{t('col.since')}</span>
          </div>
          <div className={css.group} role="row"><span role="rowheader">{t('group.atFirm')}</span><span className={css.count}>{firm.length}</span></div>
          {firm.slice(0, shown).map(row => <MatterRow key={row.applicationNumber} {...props} row={row} />)}
          {firm.length > shown && (
            <div className={css.moreRow}>
              <Button variant="ghost" size="sm" onClick={() => { setShown(value => value + MATTER_ROWS) }}>{t('matters.more', { count: firm.length - shown })}</Button>
            </div>
          )}
          {address.length > 0 && (
            <>
              <div className={css.group} role="row">
                <span role="rowheader">{t('matters.address')}</span><span className={css.count}>{address.length}</span>
                <span className={css.groupWhy}>{t('matters.addressWhy')}</span>
              </div>
              {address.map(row => <MatterRow key={row.applicationNumber} {...props} row={row} />)}
            </>
          )}
        </div>
      </Section>
    )
  }
  return (
    <>
      <StepHead stepper={stepper} title={title} lede={t('matters.lede')} />
      {body}
      <Others t={t} others={view.others} locale={locale} retry={() => { void model.retry() }} retryKeycaps={props.retryKeycaps} />
      <div className={css.limits}>
        <div><IconInfoOutlineRegular size={16} /><span><b>{t('limits.title')}</b> {t('limits.body')}</span></div>
        <div><IconEditOutlineRegular size={16} /><span>{t('limits.identity')}</span></div>
      </div>
    </>
  )
}

function MatterRow({ t, view, model, locale, row }: StepProps & { readonly row: DocketMatter }) {
  const ticked = isTicked(view, row)
  const label = applicationLabel(row.applicationNumber)
  return (
    <label className={clsx(css.row, css.matters, !ticked && css.off)} role="row">
      <input type="checkbox" checked={ticked} aria-label={t('matters.tick', { application: label })}
        onChange={(event) => { model.tickMatter(row.applicationNumber, event.currentTarget.checked) }} />
      <span className={css.key} role="cell">{label}</span>
      <span className={css.text} role="cell" title={row.title}>{row.title}</span>
      <span className={css.cell} role="cell">{row.publicationNumber === undefined ? t('matters.notYet') : publicationLabel(row.publicationNumber)}</span>
      <span className={css.cell} role="cell">{row.representativeSince === undefined ? '' : dayText(row.representativeSince, locale)}</span>
    </label>
  )
}

/** The one quiet line on the group's applications at other firms. */
function Others({ t, others, locale, retry, retryKeycaps }: {
  readonly t: AddClientTranslate
  readonly others: OthersStatus
  readonly locale: PageProps['locale']
  readonly retry: () => void
  readonly retryKeycaps: PageProps['retryKeycaps']
}) {
  switch (others.status) {
    case 'none':
      return null
    case 'loading':
      return <p className={clsx(css.sourceLine, css.quiet)} role="status">{t('others.loading')}</p>
    case 'error':
      return <Notice tone="bad" lead={t('others.error')} rest={hostText(t, others.error)} act={<RetryButton t={t} keycaps={retryKeycaps} onClick={retry} />} />
    case 'counted':
      return <p className={clsx(css.sourceLine, css.quiet)}>{othersText(t, others, locale)}</p>
  }
}

/**
 * The line on the group's applications at other firms.
 * @param t - the translate function.
 * @param others - the count.
 * @param locale - the UI language.
 * @returns the line.
 */
export function othersText(t: AddClientTranslate, others: Extract<OthersStatus, { status: 'counted' }>, locale: PageProps['locale']): string {
  const { count, atLeast } = others.answer
  const text = countText(count, new Intl.NumberFormat(locale), t)
  return atLeast && !capped(count) ? t('others.atLeast', { count: text }) : t('others.line', { count: text })
}

// Step 3: Role.

const ROLE_ICONS = { 'client': IconUsersOutlineRegular, 'watch': IconSearchOutlineRegular, 'other-party': IconUserOutlineRegular } as const

function RoleStep({ t, view, model, stepper }: StepProps & { readonly stepper: ReactNode }) {
  const name = view.group?.name ?? ''
  return (
    <>
      <StepHead stepper={stepper} title={t('role.title', { name })} lede={t('role.lede')} />
      <div className={css.options} role="radiogroup" aria-label={t('step.role')}>
        {(['client', 'watch', 'other-party'] as const).map((role) => {
          const Icon = ROLE_ICONS[role]
          const on = view.role === role
          return (
            <button key={role} type="button" role="radio" aria-checked={on} className={clsx(css.option, on && css.on)}
              disabled={view.recording.status === 'running'} onClick={() => { model.setRole(role) }}>
              <span className={clsx(css.radio, on && css.on)} />
              <Icon size={16} />
              <span><span className={css.strong}>{t(`role.${role}`)}</span><span className={clsx(css.sub, css.block)}>{t(`role.${role}.body`, { name })}</span></span>
            </button>
          )
        })}
      </div>
      <p className={css.sourceLine}>{t('role.recorded')}</p>
    </>
  )
}
