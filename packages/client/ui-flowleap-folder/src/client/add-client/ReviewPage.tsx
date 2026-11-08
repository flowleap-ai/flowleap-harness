/**
 * Pages 2 and 3 of Add client: the company's EP matters at your firm, the reference list at other firms with This is
 * ours, the conflict check, what Watch follows, the matter picker of Other party, and the docked decision bar with the
 * role and the one primary act.
 */

import { useState, type ReactNode } from 'react'
import clsx from 'clsx'
import {
  Button, IconCheckOutlineRegular, IconChevronDownOutlineRegular, IconChevronRightOutlineRegular, IconCloseOutlineRegular,
  IconDeliverDocRegular, IconFolderCloseRegular, IconInfoOutlineRegular, IconLinkOutlineRegular, IconSearchOutlineRegular,
  IconSettingsOutlineRegular, IconUserOutlineRegular, IconWarningTriangleOutlineRegular, Keycap, SegmentedControl,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ConflictHit, ReferenceRow } from '../../add-client/wire.ts'
import panel from '../Panel.module.css'
import { Empty, Notice, RetryButton, Section, Steps, hostText, recordText, type PageProps } from './AddClient.tsx'
import { applicationLabel, asOfText, counted, dayText, publicationLabel, rich, type AddClientTranslate } from './format.ts'
import { blockerOf, hitsOf, type Blocker, type Reviewed, type ReviewView } from './model.ts'
import type { OtherPartyRole } from './plan.ts'
import { hitKey, type ClientRole, type Hit } from './records.ts'
import css from './AddClient.module.css'

type ReviewProps = PageProps & { readonly view: ReviewView }

/** How many rows of the reference list show before "N more". */
const REFERENCE_ROWS = 10

/**
 * Render the review and the decision.
 * @param props - the review view, the model, copy and the keys.
 * @returns the page.
 */
export function ReviewPage(props: ReviewProps) {
  const { t, view, model } = props
  const { subject, review, role } = view
  const reviewed = review.status === 'reviewed' ? review : null
  const hits = hitsOf(view)
  const strong = (key: 'role.client' | 'role.watch' | 'role.other-party') => <b>{t(key)}</b>
  const matters = reviewed === null ? null : <MattersSection {...props} answer={reviewed.answer} claimed={reviewed.claimed} />
  const conflict = <ConflictSection {...props} hits={hits} />
  return (
    <>
      <div className={css.scroll}>
        <div className={css.flow}>
          <Steps t={t} current={2} />
          <h1 className={panel.title}>{subject.name}</h1>
          {reviewed !== null && role === 'client' && (
            <p className={css.keyfact}>{counted(t, reviewed.answer.atFirm.length + reviewed.claimed.length, 'review.keyfact.one', 'review.keyfact.many')}</p>
          )}
          <Lede {...props} />
          <p className={clsx(css.hint, css.roleHint)}>
            <IconInfoOutlineRegular size={16} />
            <span>{rich(t, 'review.roleHint', { name: subject.name }, { client: strong('role.client'), watch: strong('role.watch'), other: strong('role.other-party') })}</span>
          </p>
          <div id={`add-client-role-${role}-panel`} role="tabpanel" aria-labelledby={`add-client-role-${role}`}>
            {role === 'client' && (
              <>
                <ReviewState {...props} />
                {hits.length > 0 ? <>{conflict}{matters}</> : <>{matters}{conflict}</>}
                {reviewed !== null && <ReferenceSection {...props} rows={reviewed.answer.atOtherFirms} claimed={reviewed.claimed} />}
              </>
            )}
            {role === 'watch' && <WatchSection t={t} name={subject.name} />}
            {role === 'other-party' && <OtherSection {...props} />}
          </div>
        </div>
      </div>
      <div className={css.dock}>
        <DecisionBar {...props} hits={hits} onRole={(next) => { model.setRole(next) }} />
      </div>
    </>
  )
}

function Lede({ t, view, locale }: ReviewProps) {
  const names = counted(t, view.subject.names.length, 'names.one', 'names.many')
  if (view.review.status === 'by-name') return <p className={css.lede}>{t('review.byName')}</p>
  if (view.review.status !== 'reviewed') return <p className={css.lede}>{names}</p>
  const { answer } = view.review
  const values = { names, applications: new Intl.NumberFormat(locale).format(answer.total), asOf: asOfText(t, answer.asOf, locale) }
  return <p className={css.lede}>{answer.truncated ? t('review.ledeTruncated', values) : t('review.lede', values)}</p>
}

/** The state of the public data: loading, a failure with Try again and Add by name only, or no EPO key. */
function ReviewState({ t, view, model, retryKeycaps }: ReviewProps) {
  const { review, subject } = view
  const byName = <Button variant="outline" size="sm" onClick={() => { model.byName() }}>{t('act.byName')}</Button>
  if (review.status === 'loading') {
    return <div className={panel.skeleton} role="status" aria-label={t('review.loading')}>{[70, 50, 60].map(width => <span key={width} style={{ width: `${width}%` }} />)}</div>
  }
  if (review.status === 'error') {
    return (
      <Notice tone="bad" lead={`${t('review.error.lead')} ${hostText(t, review.error)}`} rest={t('review.error.rest', { name: subject.name })}
        act={<><RetryButton t={t} keycaps={retryKeycaps} onClick={() => { void model.retry() }} />{byName}</>} />
    )
  }
  if (review.status === 'no-key') return <Notice tone="bad" lead={t('review.noKey.lead')} rest={t('review.noKey.rest', { name: subject.name })} act={byName} />
  return null
}

function Limits({ t }: { readonly t: AddClientTranslate }) {
  return (
    <div className={css.limits}>
      <div><IconInfoOutlineRegular size={16} /><span><b>{t('limits.title')}</b> {t('limits.body')}</span></div>
      <div><IconSettingsOutlineRegular size={16} /><span>{t('limits.identity')}</span></div>
    </div>
  )
}

function MattersSection({ t, view, model, locale, answer, claimed }: ReviewProps & {
  readonly answer: Reviewed
  readonly claimed: readonly string[]
}) {
  const claimedRows = answer.atOtherFirms.filter(row => claimed.includes(row.applicationNumber))
  const count = answer.atFirm.length + claimedRows.length
  const applicants = new Set(answer.atFirm.flatMap(row => row.applicants))
  const [applicant] = applicants
  const asOf = asOfText(t, answer.asOf, locale)
  return (
    <Section title={t('mine.title')} count={t('mine.count', { count, total: new Intl.NumberFormat(locale).format(answer.total) })}>
      {answer.identity === 'missing' && <Notice tone="info" lead={t('mine.identity')} />}
      {count === 0
        ? <Empty icon={<IconFolderCloseRegular size={24} />} title={t('mine.empty.title')} body={t('mine.empty.body', { total: answer.total, name: view.subject.name })} />
        : (
          <>
            <p className={css.sourceLine}>
              {t('mine.source', { asOf })}
              {applicants.size === 1 && applicant !== undefined && answer.atFirm.length > 1 && ` ${t('mine.applicant', { count: answer.atFirm.length, applicant })}`}
            </p>
            <div className={css.table} role="table" aria-label={t('mine.title')}>
              <div className={clsx(css.thead, css.matters)} role="row">
                <span role="columnheader">{t('col.application')}</span>
                <span role="columnheader">{t('col.title')}</span>
                <span role="columnheader">{t('col.publication')}</span>
                <span role="columnheader">{t('col.since')}</span>
              </div>
              <div className={css.group} role="row"><span role="rowheader">{t('group.atFirm')}</span><span className={css.count}>{count}</span></div>
              {answer.atFirm.map(row => (
                <div key={row.applicationNumber} className={clsx(css.row, css.matters)} role="row">
                  <span className={css.key} role="cell">{applicationLabel(row.applicationNumber)}</span>
                  <span className={css.text} role="cell" title={row.title}>{row.title}</span>
                  <span className={css.cell} role="cell">{row.publicationNumber === undefined ? t('mine.notYet') : publicationLabel(row.publicationNumber)}</span>
                  <span className={css.cell} role="cell">{row.representativeSince === undefined ? '' : dayText(row.representativeSince, locale)}</span>
                </div>
              ))}
              {claimedRows.map(row => (
                <div key={row.applicationNumber} className={clsx(css.row, css.matters)} role="row">
                  <span className={css.key} role="cell">{applicationLabel(row.applicationNumber)}</span>
                  <span className={css.text} role="cell" title={row.title}>{row.title}<span className={css.tag}>{t('mine.claimed')}</span></span>
                  <span className={css.cell} role="cell">{row.publicationNumber === undefined ? t('mine.notYet') : publicationLabel(row.publicationNumber)}</span>
                  <span role="cell"><Button variant="ghost" size="sm" onClick={() => { model.claim(row.applicationNumber, false) }}>{t('act.notOurs')}</Button></span>
                </div>
              ))}
            </div>
          </>
        )}
      <Limits t={t} />
    </Section>
  )
}

function ReferenceSection({ t, model, locale, rows, claimed }: ReviewProps & {
  readonly rows: readonly ReferenceRow[]
  readonly claimed: readonly string[]
}) {
  const [open, setOpen] = useState(false)
  const [all, setAll] = useState(false)
  const openRows = rows.filter(row => !claimed.includes(row.applicationNumber))
  const shown = all ? openRows : openRows.slice(0, REFERENCE_ROWS)
  const toggle = (
    <Button variant="ghost" size="sm" icon={open ? <IconChevronDownOutlineRegular size={16} /> : <IconChevronRightOutlineRegular size={16} />}
      aria-expanded={open} onClick={() => { setOpen(value => !value) }}>
      {open ? t('act.hideList') : t('act.showList')}
    </Button>
  )
  return (
    <Section title={t('group.atOther')} count={t('ref.count', { count: openRows.length })} right={openRows.length > 0 ? toggle : undefined}>
      <p className={css.sourceLine}>{t('ref.source')}</p>
      {open && (
        <>
          <p className={css.sourceLine}>{t('ref.claim')}</p>
          <div className={css.table} role="table" aria-label={t('group.atOther')}>
            <div className={clsx(css.thead, css.refs)} role="row">
              <span role="columnheader">{t('col.application')}</span>
              <span role="columnheader">{t('col.title')}</span>
              <span role="columnheader">{t('col.town')}</span>
              <span role="columnheader">{t('col.filed')}</span>
              <span />
            </div>
            <div className={css.group} role="row"><span role="rowheader">{t('group.atOther')}</span><span className={css.count}>{openRows.length}</span></div>
            {shown.map(row => (
              <div key={row.applicationNumber} className={clsx(css.row, css.refs)} role="row">
                <span className={css.key} role="cell">{applicationLabel(row.applicationNumber)}</span>
                <span className={css.text} role="cell" title={row.title}>{row.title}</span>
                <span className={css.cell} role="cell">{row.town ?? t('ref.noTown')}</span>
                <span className={css.cell} role="cell">{row.filed === undefined ? '' : dayText(row.filed, locale)}</span>
                <span role="cell"><Button variant="ghost" size="sm" onClick={() => { model.claim(row.applicationNumber, true) }}>{t('act.ours')}</Button></span>
              </div>
            ))}
            {shown.length < openRows.length && (
              <div className={css.moreRow}>
                <Button variant="ghost" size="sm" onClick={() => { setAll(true) }}>{t('act.more', { count: openRows.length - shown.length })}</Button>
              </div>
            )}
          </div>
        </>
      )}
    </Section>
  )
}

function ConflictSection({ t, view, model, locale, retryKeycaps, hits }: ReviewProps & { readonly hits: readonly Hit[] }) {
  const { firm, review, subject, conflict } = view
  if (firm.status === 'error') {
    return (
      <Section title={t('conflict.title')}>
        <Notice tone="bad" lead={t('conflict.firmError')} rest={recordText(t, firm.error)} act={<RetryButton t={t} keycaps={retryKeycaps} onClick={() => { void model.retry() }} />} />
      </Section>
    )
  }
  if (firm.status === 'loading' || review.status === 'loading') {
    return <Section title={t('conflict.title')}><p className={css.hint} role="status">{t('conflict.loading')}</p></Section>
  }
  if (hits.length === 0) {
    const count = subject.names.length
    return (
      <Section title={t('conflict.title')}>
        <div className={css.okLine}>
          <IconCheckOutlineRegular size={16} />
          <div><div>{t('conflict.none')}</div><div className={css.sub}>{count > 1 ? t('conflict.noneBody', { count }) : t('conflict.noneBodyOne')}</div></div>
        </div>
      </Section>
    )
  }
  const clientName = (id: string) => firm.details.find(detail => detail.client.clientId === id)?.client.name
  const register = new Map((review.status === 'reviewed' ? review.answer.conflicts : []).map(item => [hitKey(item), item]))
  const [first] = hits
  const applications = new Set(hits.map(hit => hit.applicationNumber)).size
  const lead = hits.length === 1 && first !== undefined
    ? t('conflict.lead.one', { party: first.otherParty, client: clientName(first.existingClientId) ?? first.existingClientParty, application: applicationLabel(first.applicationNumber) })
    : t('conflict.lead.many', { count: applications })
  return (
    <Section title={t('conflict.title')} count={counted(t, hits.length, 'conflict.count.one', 'conflict.count.many')}>
      <Notice tone="warn" lead={lead} rest={t('conflict.rest')} />
      {hits.map(hit => (
        <HitFacts key={hitKey(hit)} t={t} hit={hit} detail={register.get(hitKey(hit))} client={clientName(hit.existingClientId)}
          locale={locale} />
      ))}
      <label className={clsx(css.checkRow, conflict.checked && css.on)}>
        <input type="checkbox" checked={conflict.checked} onChange={(event) => { model.setConflict(event.currentTarget.checked, conflict.reason) }} />
        <span><span className={css.strong}>{t('conflict.check')}</span><span className={clsx(css.sub, css.block)}>{t('conflict.checkBody', { name: subject.name })}</span></span>
      </label>
      <textarea className={css.reason} value={conflict.reason} aria-label={t('conflict.reason')} placeholder={t('conflict.reason')}
        onChange={(event) => { model.setConflict(conflict.checked, event.currentTarget.value) }} />
    </Section>
  )
}

function HitFacts({ t, hit, detail, client, locale }: {
  readonly t: AddClientTranslate
  readonly hit: Hit
  readonly detail: ConflictHit | undefined
  readonly client: string | undefined
  readonly locale: PageProps['locale']
}) {
  const publication = hit.publicationNumber === undefined ? undefined : publicationLabel(hit.publicationNumber)
  const patent = [applicationLabel(hit.applicationNumber), publication, hit.title]
    .filter((part): part is string => part !== undefined).join(' · ')
  const rows: [string, ReactNode][] = [
    [t('fact.patent'), patent],
    [t(`fact.role.${hit.otherPartyRole}`), hit.otherParty],
    [t('fact.yourClient'), client === undefined ? hit.existingClientParty : t('fact.clientParty', { party: hit.existingClientParty, client })],
    ...detail?.opposedOn === undefined ? [] : [[t('fact.opposed'), dayText(detail.opposedOn, locale)] as [string, ReactNode]],
    ...detail?.status === undefined ? [] : [[t('fact.status'), detail.status] as [string, ReactNode]],
    [t('fact.source'), t(`fact.source.${hit.source}`, { asOf: asOfText(t, hit.asOf, locale) })],
  ]
  return <div className={css.facts}>{rows.map(([key, value]) => <FactRow key={key} name={key} value={value} />)}</div>
}

function FactRow({ name, value }: { readonly name: string; readonly value: ReactNode }) {
  return <><div className={css.factKey}>{name}</div><div>{value}</div></>
}

function WatchSection({ t, name }: { readonly t: AddClientTranslate; readonly name: string }) {
  return (
    <Section title={t('watch.title')}>
      <div className={css.limits}>
        <div><IconDeliverDocRegular size={16} /><span><b>{t('watch.filings')}</b> {t('watch.filingsBody')}</span></div>
        <div><IconUserOutlineRegular size={16} /><span><b>{t('watch.oppositions')}</b> {t('watch.oppositionsBody', { name })}</span></div>
        <div><IconLinkOutlineRegular size={16} /><span><b>{t('watch.citations')}</b> {t('watch.citationsBody')}</span></div>
      </div>
      <p className={css.hint}><IconInfoOutlineRegular size={16} /><span>{t('watch.hint', { name })}</span></p>
    </Section>
  )
}

const OTHER_ROLES: readonly OtherPartyRole[] = ['opponent', 'licensee', 'other']

function OtherSection({ t, view, model, retryKeycaps }: ReviewProps) {
  const [query, setQuery] = useState('')
  const { firm, other, subject } = view
  if (firm.status === 'loading') return <Section title={t('other.title')}><p className={css.hint} role="status">{t('conflict.loading')}</p></Section>
  if (firm.status === 'error') {
    return (
      <Section title={t('other.title')}>
        <Notice tone="bad" lead={recordText(t, firm.error)} act={<RetryButton t={t} keycaps={retryKeycaps} onClick={() => { void model.retry() }} />} />
      </Section>
    )
  }
  const words = query.trim().toLowerCase().split(/\s+/).filter(word => word !== '')
  const matters = firm.details.flatMap(detail => detail.applications.map(application => ({ ...application, client: detail.client.name })))
  const shown = matters.filter(matter => words.every(word => `${applicationLabel(matter.applicationNumber)} ${matter.applicationNumber} ${matter.title ?? ''} ${matter.client}`.toLowerCase().includes(word)))
  return (
    <Section title={t('other.title')}>
      <p className={css.hint}><IconInfoOutlineRegular size={16} /><span>{t('other.hint', { name: subject.name })}</span></p>
      <div className={clsx(css.fieldWrap, css.pick)}>
        <IconSearchOutlineRegular size={16} />
        <input className={clsx(css.field, css.pickField)} type="search" value={query} aria-label={t('other.find')} placeholder={t('other.find')}
          onChange={(event) => { setQuery(event.currentTarget.value) }} />
      </div>
      <ul className={css.pickList} role="listbox" aria-label={t('other.find')}>
        {matters.length === 0 && <li className={css.pickFoot}>{t('other.empty')}</li>}
        {matters.length > 0 && shown.length === 0 && <li className={css.pickFoot}>{t('other.none')}</li>}
        {shown.map(matter => (
          <li key={matter.applicationNumber}>
            <button type="button" className={css.pickItem} role="option" aria-selected={other.applicationNumber === matter.applicationNumber}
              onClick={() => { model.setOther(matter.applicationNumber, other.role) }}>
              <span className={css.key}>{applicationLabel(matter.applicationNumber)}</span>
              <span className={clsx(css.cell, css.text)}>{matter.title ?? matter.client}</span>
            </button>
          </li>
        ))}
        {matters.length > 0 && <li className={css.pickFoot}>{t('other.foot')}</li>}
      </ul>
      <div className={css.fieldLabel}>{t('other.role')}</div>
      <SegmentedControl id="add-client-matter-role" className={css.inlineSeg} label={t('other.role')} value={other.role}
        options={OTHER_ROLES.map(role => ({ value: role, label: t(`other.role.${role}`) }))}
        onChange={(role) => { model.setOther(other.applicationNumber, role) }} />
    </Section>
  )
}

const ROLES: readonly ClientRole[] = ['client', 'watch', 'other-party']

/** One part of the decision: its state icon, its name and evidence, and its value. */
function Part({ state, name, body, value }: {
  readonly state: 'ok' | 'wait' | 'none'
  readonly name: string
  readonly body: string
  readonly value: ReactNode
}) {
  return (
    <div className={css.part}>
      <span className={clsx(css.partIcon, css[state])}>
        {state === 'ok' ? <IconCheckOutlineRegular size={16} /> : state === 'wait' ? <IconWarningTriangleOutlineRegular size={16} /> : <IconInfoOutlineRegular size={16} />}
      </span>
      <div><div className={css.strong}>{name}</div><div className={css.sub}>{body}</div></div>
      <span className={css.partValue}>{value}</span>
    </div>
  )
}

function blockedText(t: AddClientTranslate, blocker: Exclude<Blocker, 'busy'>): string {
  return t(`blocked.${blocker}`)
}

function DecisionBar({ t, view, model, locale, recordKey, retryKeycaps, hits, onRole }: ReviewProps & {
  readonly hits: readonly Hit[]
  readonly onRole: (role: ClientRole) => void
}) {
  const { role, subject, review, firm, recording, conflict, other } = view
  const blocker = blockerOf(view)
  const roleControl = (
    <SegmentedControl id="add-client-role" label={t('role.label')} value={role} disabled={recording.status === 'running'}
      options={ROLES.map(value => ({ value, label: t(`role.${value}`) }))} onChange={onRole} />
  )
  const parts: ReactNode[] = [<Part key="role" state="ok" name={t('part.role')} body={t('part.roleBody')} value={roleControl} />]
  let note: string
  if (role === 'client') {
    const conflictState = firm.status !== 'ready' || review.status === 'loading' ? 'wait' : hits.length === 0 || (conflict.checked && conflict.reason.trim() !== '') ? 'ok' : 'wait'
    const conflictValue = firm.status !== 'ready' || review.status === 'loading'
      ? t('part.conflict.waiting')
      : hits.length === 0 ? t('part.conflict.none') : conflictState === 'ok' ? t('part.conflict.checked') : t('part.conflict.open')
    parts.push(<Part key="conflict" state={conflictState} name={t('part.conflict')} value={conflictValue}
      body={hits.length === 0 ? t('part.conflictBody') : counted(t, hits.length, 'conflict.count.one', 'conflict.count.many')} />)
    const count = review.status === 'reviewed' ? review.answer.atFirm.length + review.claimed.length : 0
    parts.push(review.status === 'reviewed'
      ? <Part key="matters" state={count === 0 ? 'none' : 'ok'} name={t('part.matters')} body={count === 0 ? t('part.mattersEmpty') : t('part.mattersBody', { asOf: asOfText(t, review.answer.asOf, locale) })}
        value={count === 0 ? t('part.matters.none') : t('part.matters.count', { count })} />
      : review.status === 'by-name'
        ? <Part key="matters" state="none" name={t('part.matters')} body={t('part.mattersByName')} value={t('part.matters.none')} />
        : <Part key="matters" state="wait" name={t('part.matters')} body={t('part.mattersBody', { asOf: '' })} value={t('part.matters.waiting')} />)
    note = count === 0 ? t('note.clientEmpty') : t('note.client', { matters: counted(t, count, 'matters.one', 'matters.many') })
  } else if (role === 'watch') {
    parts.push(<Part key="folder" state="none" name={t('part.folder')} body={t('part.folderBody')} value={t('part.folder.none')} />)
    note = t('note.watch')
  } else {
    parts.push(<Part key="matter" state={other.applicationNumber === null ? 'wait' : 'ok'} name={t('part.matter')} body={t('part.matterBody')}
      value={other.applicationNumber === null ? t('part.matter.none') : `${applicationLabel(other.applicationNumber)} · ${t(`other.role.${other.role}`)}`} />)
    note = t('note.other')
  }
  return (
    <section className={css.decision} aria-label={t('decision.yours')}>
      <header className={css.decisionHead}>
        <span className={css.yours}>{t('decision.yours')}</span>
        <span className={css.question}>{t(`decision.q.${role}`, { name: subject.name })}</span>
        <span className={css.why}><IconInfoOutlineRegular size={16} />{t('decision.why')}</span>
      </header>
      <div className={css.parts}>{parts}</div>
      {recording.status === 'failed' && (
        <div className={css.failure}>
          <Notice tone="bad" lead={`${t('record.failed')} ${recordText(t, recording.error)}`} rest={t('record.safe')}
            act={<RetryButton t={t} keycaps={retryKeycaps} onClick={() => { void model.retry() }} />} />
        </div>
      )}
      <footer className={css.decisionFoot}>
        <Button variant="ghost" size="sm" icon={<IconCloseOutlineRegular size={16} />} onClick={() => { model.close() }}>{t('act.cancel')}</Button>
        {recording.status === 'running'
          ? <span className={css.note} role="status">{t('blocked.busy', { done: recording.done, total: recording.total })}</span>
          : blocker === null || blocker === 'busy'
            ? <span className={css.note}>{note}</span>
            : <span className={css.note} role="note"><IconWarningTriangleOutlineRegular size={16} />{blockedText(t, blocker)}</span>}
        <div className={css.acts}>
          <Button variant="primary" size="md" icon={<IconCheckOutlineRegular size={16} />} disabled={blocker !== null} onClick={() => { void model.record() }}>
            {t(`primary.${role}`)}
            {recordKey.keycaps.length > 0 && <Keycap keycaps={recordKey.keycaps} tone="primary" className={clsx(panel.keycap, css.keys)} />}
          </Button>
        </div>
      </footer>
    </section>
  )
}
