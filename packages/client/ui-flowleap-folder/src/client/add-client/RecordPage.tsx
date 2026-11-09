/**
 * Page 4 of Add client: the Record run of a client. One line each for the client, its conflict check, its applications
 * in batches with the batch that runs, and the client folder. While the run goes on, the page asks the person to keep it
 * open; a failure names what stopped and offers Try again, which records only the missing batches.
 */

import type { ReactNode } from 'react'
import clsx from 'clsx'
import {
  IconCheckOutlineRegular, IconClockOutlineRegular, IconInfoOutlineRegular, IconLoadingOutlineRegular, IconWarningTriangleOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import panel from '../Panel.module.css'
import { Notice, RetryButton, Steps, hostText, recordText, type PageProps } from './AddClient.tsx'
import { recordedCount, type RecordBatch } from './batches.ts'
import { counted, type AddClientTranslate } from './format.ts'
import { recordStatus, type RecordView } from './model.ts'
import css from './AddClient.module.css'

/** The state of one line. */
type LineState = 'waiting' | 'running' | 'done' | 'failed'

/** The step that a failure stopped: the read of the batch size, a batch, or the client folder. */
type FailedStep = 'settings' | 'batch' | 'folder'

/**
 * The step that the failure of a Record view stopped.
 * @param view - the Record view, with its failure.
 * @returns the step.
 */
function failedStep(view: RecordView): FailedStep {
  if (view.batches === null) return 'settings'
  return view.batches.some(batch => batch.state === 'failed') ? 'batch' : 'folder'
}

/** The sentence of a failure. */
function errorText(t: AddClientTranslate, error: NonNullable<RecordView['error']>): string {
  return typeof error === 'string' ? hostText(t, error) : recordText(t, error)
}

/**
 * Render the Record run of a client.
 * @param props - the Record view, the model, copy and the keys.
 * @returns the page.
 */
export function RecordPage({ t, view, model, retryKeycaps }: PageProps & { readonly view: RecordView }) {
  const { name, error } = view
  const status = recordStatus(view)
  const total = view.applications.length
  const missing = total - recordedCount(view.batches ?? [])
  const retry = <RetryButton t={t} keycaps={retryKeycaps} onClick={() => { void model.retry() }} />
  const failure = error === null
    ? null
    : failedStep(view) === 'batch'
      ? <Notice tone="bad" lead={counted(t, missing, 'record.notYet.one', 'record.notYet.many')} rest={t('record.safe')} act={retry} />
      : <Notice tone="bad" lead={errorText(t, error)} rest={t('record.safe')} act={retry} />
  return (
    <div className={css.scroll}>
      <div className={css.flow}>
        <Steps t={t} current={3} />
        <h1 className={panel.title}>{t(status === 'done' ? 'record.titleDone' : 'record.title', { name })}</h1>
        <p className={css.lede}>{t(status === 'done' ? 'record.ledeDone' : 'record.lede')}</p>
        {status === 'running' && <Notice tone="info" lead={t('record.keep.lead')} rest={t('record.keep.rest')} />}
        {failure}
        <ol className={css.recordSteps}>
          <Line state="done" title={view.names.length === 0 ? t('record.clientOnly', { name }) : t('record.client', { name, names: counted(t, view.names.length, 'names.one', 'names.many') })}
            body={t('record.clientBody')} />
          <Line state="done" title={t('record.conflict')} body={view.hits === 0 ? t('part.conflict.none') : counted(t, view.hits, 'conflict.count.one', 'conflict.count.many')} />
          {total > 0 && <ApplicationsLine t={t} view={view} />}
          <FolderLine t={t} view={view} />
        </ol>
        <p className={css.recordFoot}><IconInfoOutlineRegular size={16} /><span>{t(`record.foot.${status}`)}</span></p>
      </div>
    </div>
  )
}

/** The line of the applications: the batch that runs, the failed batch with what Try again does, or the count. */
function ApplicationsLine({ t, view }: { readonly t: AddClientTranslate; readonly view: RecordView }) {
  const total = view.applications.length
  const batches = view.batches ?? []
  const done = recordedCount(batches)
  const count = t('record.progress', { done, total })
  const applications = counted(t, total, 'applications.one', 'applications.many')
  if (done === total && batches.length > 0) {
    return <Line state="done" title={t('record.apps.done', { applications })} body={counted(t, batches.length, 'record.batches.one', 'record.batches.many')} count={count} />
  }
  if (view.error !== null && failedStep(view) !== 'folder') {
    const failed = batches.findIndex(batch => batch.state === 'failed')
    const left = batches.length - batches.filter(batch => batch.state === 'recorded').length
    const body = failed === -1
      ? undefined
      : [
        t('record.batch.failed', { number: failed + 1, count: batches.length }),
        errorText(t, view.error),
        t('record.batch.retry', { missing: counted(t, left, 'record.missing.one', 'record.missing.many') }),
      ].join(' ')
    return <Line state="failed" title={t('record.apps.failed', { done, applications })} body={body} count={count} />
  }
  const now = batches.findIndex(batch => batch.state !== 'recorded')
  const progress = (
    <>
      {t('record.batch.now', { number: now + 1, count: batches.length, size: sizeOf(batches) })}
      <span className={css.progress}><span style={{ width: `${Math.round(done / total * 100)}%` }} /></span>
    </>
  )
  const body = view.batches === null ? undefined : batches.length === 1 ? t('record.batch.one', { applications }) : progress
  return <Line state="running" title={t('record.apps.now', { applications })} body={body} count={count} />
}

/** The most applications of a batch that is not recorded yet. */
function sizeOf(batches: readonly RecordBatch[]): number {
  return Math.max(...batches.filter(batch => batch.state !== 'recorded').map(batch => batch.applications.length))
}

/** The line of the client folder. */
function FolderLine({ t, view }: { readonly t: AddClientTranslate; readonly view: RecordView }) {
  const { folder, error } = view
  if (folder.state === 'made') return <Line state="done" title={t('record.folder.done')} body={t('record.folderBody')} />
  if (folder.state === 'making') return <Line state="running" title={t('record.folder.now')} body={t('record.folderBody')} />
  const failed = error !== null && failedStep(view) === 'folder'
  return <Line state={failed ? 'failed' : 'waiting'} title={t('record.folder.next')} body={failed ? errorText(t, error) : t('record.folderBody')} />
}

/** One line: its state icon, what it does, its evidence or progress, and its count. */
function Line({ state, title, body, count }: {
  readonly state: LineState
  readonly title: string
  readonly body?: ReactNode
  readonly count?: string | undefined
}) {
  const icon = state === 'done'
    ? <IconCheckOutlineRegular size={16} className={css.stepDoneIcon} />
    : state === 'running' ? <IconLoadingOutlineRegular size={16} /> : state === 'failed' ? <IconWarningTriangleOutlineRegular size={16} /> : <IconClockOutlineRegular size={16} />
  return (
    <li className={clsx(state === 'running' && css.now, state === 'waiting' && css.next, state === 'failed' && css.fail)} aria-current={state === 'running' ? 'step' : undefined}>
      {icon}
      <div><div>{title}</div>{body !== undefined && <div className={css.sub}>{body}</div>}</div>
      <span className={css.stepCount}>{count}</span>
    </li>
  )
}
