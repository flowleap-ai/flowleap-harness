/**
 * The Add client view of the client folder page: the top bar with the location, then the wizard (Company, Matters,
 * Role, Conflict check or Matter, Review) or the Record run, each with the stepper on top and a footer docked below.
 * Also the parts that the Clients list shows: the Watching list and the toast after an act.
 */

import { useLayoutEffect, type KeyboardEvent, type ReactNode } from 'react'
import clsx from 'clsx'
import {
  Button, IconCheckOutlineRegular, IconCloseOutlineRegular, IconInfoOutlineRegular, IconRefreshOutlineRegular, IconSearchOutlineRegular,
  IconWarningTriangleOutlineRegular, Keycap, type KeycapBox,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { LocaleId } from '@deepseek-ai/dsh-client-locale/client'
import { pressed, type KeyHandlers, type RecordKey } from '../keys.ts'
import panel from '../Panel.module.css'
import { publicationLabel, type AddClientTranslate } from './format.ts'
import type { HostFailure } from './api.ts'
import { recordStatus, type AddClientModel, type AddClientView, type Toast } from './model.ts'
import type { FirmClient, RecordError } from './records.ts'
import { RecordPage } from './RecordPage.tsx'
import { WizardPage } from './WizardPage.tsx'
import { waitOf, type StepId, type StepMark, type WizardView } from './wizard.ts'
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
  const name = view.page === 'record' ? view.name : view.group?.name ?? null
  // The primary act of Review runs on the app's Record the decision key while the focus is in Add client.
  const onKeyDown = (event: KeyboardEvent) => {
    if (view.page !== 'wizard' || view.at !== 'review' || !pressed(event.nativeEvent, recordKey.binding)) return
    event.preventDefault()
    if (waitOf(view, 'review') === null) void model.record()
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
      </header>
      {view.page === 'wizard' ? <WizardPage {...props} view={view} /> : <RecordPage {...props} view={view} />}
    </div>
  )
}

/** Whether a page offers Try again now. */
function retryOf(view: AddClientView): boolean {
  if (view.page === 'record') return recordStatus(view) === 'failed'
  return failedOf(view)
}

/**
 * Whether the open step of the wizard shows a failure with Try again.
 * @param view - the wizard.
 * @returns true when Try again has something to do.
 */
export function failedOf(view: WizardView): boolean {
  switch (view.at) {
    case 'company': {
      const { find, docket } = view
      if (find.status === 'error' || docket.status === 'error') return true
      return docket.status === 'read' && ['partial', 'failed', 'interrupted'].includes(docket.docket.state)
    }
    case 'matters':
      return view.others.status === 'error'
    case 'conflict': {
      const wait = waitOf(view, 'conflict')
      return wait === 'conflict-failed' || (wait === 'conflict-reading' && view.check.status === 'checked')
    }
    case 'matter':
      return view.firm.status === 'error'
    case 'role':
      return false
    case 'review':
      return view.recording.status === 'failed'
  }
}

/** One step of the stepper: its label, its mark, and its act when the stepper opens it. */
export interface StepperItem {
  readonly step: StepId
  readonly mark: StepMark
  readonly onOpen?: (() => void) | undefined
}

const STEP_CLASS: Readonly<Record<StepMark, string | undefined>> = {
  done: css.stepDone, current: css.stepCurrent, todo: undefined, blocked: css.stepBlocked,
}

/**
 * The numbered stepper of Add client. A step that the stepper opens is a button.
 * @param props - copy and the steps.
 * @returns the stepper.
 */
export function Stepper({ t, items }: { readonly t: AddClientTranslate; readonly items: readonly StepperItem[] }) {
  return (
    <ol className={css.stepper} aria-label={t('steps.label')}>
      {items.map(({ step, mark, onOpen }, index) => {
        const label = t(`step.${step}`)
        const inner = (
          <>
            <span className={css.stepMark}>
              {mark === 'done' ? <IconCheckOutlineRegular size={12} /> : mark === 'blocked' ? <IconWarningTriangleOutlineRegular size={12} /> : index + 1}
            </span>
            <span className={css.stepLabel}>{label}</span>
            <span className={css.srOnly}>, {t(`step.mark.${mark}`)}</span>
          </>
        )
        return (
          <li key={step} className={STEP_CLASS[mark]} title={label} aria-current={mark === 'current' ? 'step' : undefined}>
            {onOpen === undefined ? inner : <button type="button" className={css.stepOpen} onClick={onOpen}>{inner}</button>}
          </li>
        )
      })}
    </ol>
  )
}

/**
 * The footer docked below a step: Back, Cancel, one line, and the primary act.
 * @param props - copy, the Back act, the Cancel act, the line, whether the line says why the act waits, and the act.
 * @returns the footer.
 */
export function StepFoot({ t, onBack, onCancel, note, waiting, children }: {
  readonly t: AddClientTranslate
  readonly onBack?: (() => void) | undefined
  readonly onCancel?: (() => void) | undefined
  readonly note: string
  readonly waiting: boolean
  readonly children: ReactNode
}) {
  return (
    <footer className={css.foot}>
      {onBack !== undefined && (
        <Button variant="ghost" size="sm" aria-label={t('act.back')} onClick={onBack}><span className={css.hideSm}>{t('act.back')}</span></Button>
      )}
      {onCancel !== undefined && <Button variant="ghost" size="sm" onClick={onCancel}>{t('act.cancel')}</Button>}
      <span className={clsx(css.note, waiting && css.waiting)} role={waiting ? 'note' : undefined}>{note}</span>
      {children}
    </footer>
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
