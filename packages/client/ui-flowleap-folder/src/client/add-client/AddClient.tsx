/**
 * The Add client view of the client folder page: the top bar with the location and the page's act, then one page of
 * the flow (find the company, review and decide, record the client). Also the parts that the Clients list shows: the
 * Watching list and the toast after an act.
 */

import { useLayoutEffect, type KeyboardEvent, type ReactNode } from 'react'
import clsx from 'clsx'
import {
  Button, IconCheckOutlineRegular, IconCloseOutlineRegular, IconCordisPluginOutlineRegular, IconFolderOpenRegular,
  IconInfoOutlineRegular, IconRefreshOutlineRegular, IconSearchOutlineRegular, IconShieldOutlineRegular, IconUsersOutlineRegular,
  IconWarningTriangleOutlineRegular, Keycap, type KeycapBox,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { LocaleId } from '@deepseek-ai/dsh-client-locale/client'
import { pressed, type KeyHandlers, type RecordKey } from '../keys.ts'
import panel from '../Panel.module.css'
import { PATSTAT, asOfText, dayText, publicationLabel, type AddClientTranslate } from './format.ts'
import type { HostFailure } from './api.ts'
import { blockerOf, recordStatus, type AddClientModel, type AddClientView, type FindView, type Toast } from './model.ts'
import type { FirmClient, RecordError } from './records.ts'
import { RecordPage } from './RecordPage.tsx'
import { ReviewPage } from './ReviewPage.tsx'
import css from './AddClient.module.css'

/** What every Add client page gets. */
export interface PageProps {
  readonly t: AddClientTranslate
  readonly model: AddClientModel
  readonly locale: LocaleId
  readonly recordKey: RecordKey
  readonly retryKeycaps: readonly KeycapBox[]
}

/**
 * Render the open Add client page.
 * @param props - the view, the model, copy and the keys.
 * @returns the top bar and the page.
 */
export function AddClientPage(props: PageProps & {
  readonly view: AddClientView
  /** Set the handlers of the page's keys. */
  readonly setKeys: (handlers: KeyHandlers) => void
}) {
  const { t, view, model, setKeys, recordKey } = props
  const retry = retryOf(view)
  useLayoutEffect(() => { setKeys(retry ? { retry: () => { void model.retry() } } : {}) })
  const name = view.page === 'find' ? null : view.page === 'review' ? view.subject.name : view.name
  // The decision bar's primary act runs on the app's Record the decision key while the focus is in Add client.
  const onKeyDown = (event: KeyboardEvent) => {
    if (view.page !== 'review' || !pressed(event.nativeEvent, recordKey.binding)) return
    event.preventDefault()
    if (blockerOf(view) === null) void model.record()
  }
  return (
    <div className={css.work} onKeyDown={onKeyDown} data-testid="add-client">
      <header className={panel.topbar} data-frame-top-row="">
        <nav className={panel.crumbs} aria-label={t('crumbs.label')}>
          <button type="button" className={clsx(panel.crumb, panel.wide)} onClick={() => { model.close() }}>{t('crumbs.clients')}</button>
          <span className={clsx(panel.sep, panel.wide)}>›</span>
          {name === null
            ? <span className={panel.here}>{t('title')}</span>
            : <><span className={panel.wide}>{t('title')}</span><span className={clsx(panel.sep, panel.wide)}>›</span><span className={panel.here} title={name}>{name}</span></>}
        </nav>
        <div className={panel.actions}>
          {view.page === 'find' && (
            <Button variant="primary" size="sm" disabled={!canContinue(view)} onClick={() => { void model.continue() }}>{t('act.continue')}</Button>
          )}
          {view.page === 'record' && (
            <Button variant="primary" size="sm" icon={<IconFolderOpenRegular size={16} />} disabled={recordStatus(view) === 'running' || view.folder.state === 'making'}
              onClick={() => { void model.openClientPage() }}>{t('act.openClient')}</Button>
          )}
        </div>
      </header>
      {view.page === 'find' && <FindPage {...props} view={view} />}
      {view.page === 'review' && <ReviewPage {...props} view={view} />}
      {view.page === 'record' && <RecordPage {...props} view={view} />}
    </div>
  )
}

/** Whether the find page's Continue may run. */
function canContinue(view: FindView): boolean {
  if (view.find.status === 'group') return view.find.names.some(item => item.ticked)
  return view.find.status === 'no-plugin'
}

/** Whether a page offers Try again now. */
function retryOf(view: AddClientView): boolean {
  if (view.page === 'find') return view.find.status === 'error'
  if (view.page === 'review') return view.recording.status === 'failed' || view.review.status === 'error' || view.firm.status === 'error'
  return recordStatus(view) === 'failed'
}

/**
 * The line of the three steps of Add client.
 * @param props - copy and the current step, from 1.
 * @returns the steps.
 */
export function Steps({ t, current }: { readonly t: AddClientTranslate; readonly current: 1 | 2 | 3 }) {
  const steps = [t('steps.company'), t('steps.role'), t('steps.record')]
  return (
    <ol className={css.steps} aria-label={t('steps.label')}>
      {steps.map((step, index) => (
        <li key={step} className={clsx(index + 1 < current && css.stepDone, index + 1 === current && css.stepOn)} aria-current={index + 1 === current ? 'step' : undefined}>
          {index + 1 < current && <IconCheckOutlineRegular size={14} />}{step}
        </li>
      ))}
    </ol>
  )
}

/**
 * One section of a page: a heading with its count and acts, then its content.
 * @param props - the heading, the count, the acts at the right and the content.
 * @returns the section.
 */
export function Section({ title, count, right, children }: {
  readonly title: string
  readonly count?: string | undefined
  readonly right?: ReactNode
  readonly children?: ReactNode
}) {
  return (
    <section className={css.section}>
      <div className={css.sectionHead}>
        <h2>{title}</h2>
        {count !== undefined && <span className={css.count}>{count}</span>}
        {right !== undefined && <span className={css.sectionRight}>{right}</span>}
      </div>
      {children}
    </section>
  )
}

/**
 * A notice: info, a warning, or a failure, with an act at the right.
 * @param props - the tone, the lead sentence, the rest and the act.
 * @returns the notice.
 */
export function Notice({ tone, lead, rest, act }: {
  readonly tone: 'info' | 'warn' | 'bad'
  readonly lead: string
  readonly rest?: string | undefined
  readonly act?: ReactNode
}) {
  return (
    <div className={clsx(css.notice, tone === 'warn' && css.warn, tone === 'bad' && css.bad)} role={tone === 'bad' ? 'alert' : 'status'}>
      {tone === 'info' ? <IconInfoOutlineRegular size={16} /> : <IconWarningTriangleOutlineRegular size={16} />}
      <div><span className={css.lead}>{lead}</span>{rest !== undefined && <> <span>{rest}</span></>}</div>
      {act}
    </div>
  )
}

/**
 * The Try again button with its key.
 * @param props - copy, the keycaps, the act, and whether it waits for another act.
 * @returns the button.
 */
export function RetryButton({ t, keycaps, onClick, disabled = false }: {
  readonly t: AddClientTranslate
  readonly keycaps: readonly KeycapBox[]
  readonly onClick: () => void
  readonly disabled?: boolean
}) {
  return (
    <Button variant="outline" size="sm" icon={<IconRefreshOutlineRegular size={16} />} onClick={onClick} disabled={disabled}>
      {t('act.retry')}
      {keycaps.length > 0 && <Keycap keycaps={keycaps} className={clsx(panel.keycap, css.keys)} />}
    </Button>
  )
}

/**
 * The sentence of a Host failure.
 * @param t - the translate function.
 * @param error - the failure.
 * @returns the sentence.
 */
export function hostText(t: AddClientTranslate, error: HostFailure): string {
  return t(`host.${error}`)
}

/**
 * The sentence of a Firm Record failure.
 * @param t - the translate function.
 * @param error - the failure.
 * @returns the sentence; a refusal says its contract code in words.
 */
export function recordText(t: AddClientTranslate, error: RecordError): string {
  if (error.kind !== 'refused') return t(`error.${error.kind}`)
  return error.code === null ? t('refusal.other') : t(`refusal.${error.code}`)
}

function FindPage({ t, view, model, locale, retryKeycaps }: PageProps & { readonly view: FindView }) {
  const { find, existing, query } = view
  const name = query.trim()
  const byName = <Button variant="outline" size="sm" onClick={() => { void model.continue() }}>{t('act.byName')}</Button>
  return (
    <div className={css.scroll}>
      <div className={css.flow}>
        <Steps t={t} current={1} />
        <h1 className={panel.title}>{t('title')}</h1>
        <p className={css.lede}>{t('find.lede')}</p>
        <div className={css.fieldWrap}>
          <IconSearchOutlineRegular size={16} />
          <input className={css.field} type="search" value={query} aria-label={t('find.field')} placeholder={t('find.field')} autoFocus
            onChange={(event) => { model.type(event.currentTarget.value) }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              event.preventDefault()
              void model.search()
            }} />
        </div>
        <p className={css.privacy}><IconShieldOutlineRegular size={16} /><span>{t('find.privacy')}</span></p>
        {existing !== null && <ExistingNotice t={t} existing={existing} locale={locale} />}
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
        {find.status === 'group' && <GroupSection t={t} find={find} existing={existing} model={model} locale={locale} />}
        {find.status === 'error' && (
          <>
            <Notice tone="bad" lead={t('find.error.lead')} rest={t('find.error.rest')} act={<RetryButton t={t} keycaps={retryKeycaps} onClick={() => { void model.retry() }} />} />
            <p className={css.hint}><IconInfoOutlineRegular size={16} /><span>{t('find.error.hint', { name })}</span>{byName}</p>
          </>
        )}
        {find.status === 'no-key' && <Notice tone="bad" lead={t('find.noKey.title')} rest={t('find.noKey.body', { name })} act={byName} />}
        {find.status === 'no-plugin' && (
          <Empty icon={<IconCordisPluginOutlineRegular size={24} />} title={t('find.plugin.title')} body={t('find.plugin.body', { name })} />
        )}
      </div>
    </div>
  )
}

function ExistingNotice({ t, existing, locale }: {
  readonly t: AddClientTranslate
  readonly existing: FirmClient
  readonly locale: LocaleId
}) {
  const date = dayText(existing.addedAt, locale)
  return (
    <Notice tone="info" lead={t(`find.existing.${existing.role}`, { name: existing.name })}
      rest={existing.addedBy.name === null ? t('find.existing.at', { date }) : t('find.existing.by', { person: existing.addedBy.name, date })} />
  )
}

function GroupSection({ t, find, existing, model, locale }: {
  readonly t: AddClientTranslate
  readonly find: Extract<FindView['find'], { status: 'group' }>
  readonly existing: FirmClient | null
  readonly model: AddClientModel
  readonly locale: LocaleId
}) {
  const number = new Intl.NumberFormat(locale)
  const ticked = find.names.filter(item => item.ticked)
  const applications = number.format(ticked.reduce((sum, item) => sum + item.applications, 0))
  const linked = new Set(existing?.names.map(item => item.name))
  const fresh = find.names.filter(item => !linked.has(item.name)).length
  const count = existing === null
    ? t('find.group.count', { ticked: ticked.length, total: find.names.length, applications })
    : fresh === 0 ? t('find.existing.noNew', { count: find.names.length }) : t('find.existing.new', { count: find.names.length, new: fresh })
  const patstat = find.source === 'patstat'
  return (
    <Section title={existing === null ? t('find.group.title') : t('find.existing.group')} count={count}>
      {existing === null && <p className={css.hint}><IconInfoOutlineRegular size={16} /><span>{t('find.group.hint')}</span></p>}
      <div className={css.table} role="table" aria-label={t('find.group.title')}>
        <div className={clsx(css.thead, css.names)} role="row">
          <span />
          <span role="columnheader">{patstat ? t('find.col.patstat', { product: PATSTAT }) : t('find.col.register')}</span>
          <span role="columnheader" className={css.end}>{patstat ? t('find.col.applications') : t('find.col.epApplications')}</span>
        </div>
        {find.names.map(item => (
          <label key={item.name} className={clsx(css.row, css.names, !item.ticked && css.off)} role="row">
            <input type="checkbox" checked={item.ticked} aria-label={t('find.tick', { name: item.name })}
              onChange={(event) => { model.tick(item.name, event.currentTarget.checked) }} />
            <span className={css.text} role="cell">{item.name}</span>
            <span className={clsx(css.cell, css.end)} role="cell">{number.format(item.applications)}</span>
          </label>
        ))}
      </div>
      {find.truncated && <p className={css.hint}><IconInfoOutlineRegular size={16} /><span>{t('find.truncated')}</span></p>}
      <p className={css.sourceLine}>
        {patstat
          ? `${t('find.source.patstat', { product: PATSTAT, edition: find.edition ?? '' })} ${t('find.attribution')}`
          : t('find.source.register', { asOf: asOfText(t, find.asOf, locale) })}
      </p>
    </Section>
  )
}

/**
 * An empty state inside the flow column.
 * @param props - the tile's icon, the heading and the sentence.
 * @returns the state.
 */
export function Empty({ icon, title, body }: { readonly icon: ReactNode; readonly title: string; readonly body: string }) {
  return (
    <div className={css.empty}>
      <div>
        <div className={css.emptyArt}>{icon}</div>
        <h2>{title}</h2>
        <p>{body}</p>
      </div>
    </div>
  )
}

/**
 * The toast after an act of Add client.
 * @param props - copy, the toast and its close act.
 * @returns the toast.
 */
export function AddClientToast({ t, toast, onClose }: {
  readonly t: AddClientTranslate
  readonly toast: Toast
  readonly onClose: () => void
}) {
  const text = toast.kind === 'watch'
    ? t('toast.watch', { name: toast.name })
    : toast.kind === 'party'
      ? t('toast.party', { name: toast.name, application: publicationLabel(toast.applicationNumber) })
      : recordText(t, toast.error)
  return (
    <div className={clsx(panel.toast, toast.kind === 'failed' && panel.toastFailed)} role={toast.kind === 'failed' ? 'alert' : 'status'}>
      {toast.kind === 'failed' ? <IconWarningTriangleOutlineRegular size={16} /> : <IconCheckOutlineRegular size={16} />}
      <span>{text}</span>
      <button type="button" className={panel.iconButton} aria-label={t('act.close')} onClick={onClose}><IconCloseOutlineRegular size={16} /></button>
    </div>
  )
}

/**
 * The Watching list below the clients.
 * @param props - copy and the companies on Watch.
 * @returns the list, or nothing without a company.
 */
export function WatchingList({ t, watching }: { readonly t: AddClientTranslate; readonly watching: readonly FirmClient[] }) {
  if (watching.length === 0) return null
  return (
    <section className={css.watching}>
      <h2>{t('list.watching')}<span className={css.count}>{watching.length}</span></h2>
      <ul aria-label={t('list.watchingLabel')}>
        {watching.map(client => (
          <li key={client.clientId}><IconSearchOutlineRegular size={16} /><span className={css.text}>{client.name}</span></li>
        ))}
      </ul>
    </section>
  )
}
