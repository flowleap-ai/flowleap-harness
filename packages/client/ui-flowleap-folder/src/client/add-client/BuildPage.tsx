/**
 * Page 4 of Add client: the records that the decision wrote, then one line for each step of the folder build with the
 * step that runs, and a failure with Try again, which does only the missing work.
 */

import type { ReactNode } from 'react'
import clsx from 'clsx'
import {
  IconCheckOutlineRegular, IconClockOutlineRegular, IconInfoOutlineRegular, IconLoadingOutlineRegular, IconWarningTriangleOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { BUILD_STEPS, type BuildStatus, type BuildStep, type BuildStepId } from '../../add-client/wire.ts'
import panel from '../Panel.module.css'
import { Notice, RetryButton, Steps, hostText, recordText, type PageProps } from './AddClient.tsx'
import { counted, publicationLabel, type AddClientTranslate } from './format.ts'
import { buildFailure, type BuildFailure, type BuildView } from './model.ts'
import css from './AddClient.module.css'

/**
 * Render the build of a client folder.
 * @param props - the build view, the model, copy and the keys.
 * @returns the page.
 */
export function BuildPage({ t, view, model, retryKeycaps }: PageProps & { readonly view: BuildView }) {
  const { status, recorded, name } = view
  const failed = buildFailure(view)
  const retry = <RetryButton t={t} keycaps={retryKeycaps} onClick={() => { void model.retry() }} />
  const failure = failed === null ? null : <FailureNotice t={t} failure={failed} retry={retry} />
  const matters = recorded?.matters ?? status?.matters ?? 0
  return (
    <div className={css.scroll}>
      <div className={css.flow}>
        <Steps t={t} current={3} />
        <h1 className={panel.title}>{t('build.title', { name })}</h1>
        <p className={css.lede}>{t('build.lede')}</p>
        {failure}
        {status === null && view.error === null
          ? <div className={panel.skeleton} role="status" aria-label={t('build.loading')}>{[70, 50, 60].map(width => <span key={width} style={{ width: `${width}%` }} />)}</div>
          : (
            <ol className={css.buildSteps}>
              <Line state="done" title={recorded === null || recorded.names === 0 ? t('build.recordedOnly', { name }) : t('build.recorded', { name, names: counted(t, recorded.names, 'names.one', 'names.many') })}
                body={t('build.recordedBody')} />
              <Line state="done" title={t('build.conflict')}
                body={recorded === null ? undefined : recorded.hits === 0 ? t('part.conflict.none') : counted(t, recorded.hits, 'conflict.count.one', 'conflict.count.many')} />
              {matters > 0 && <Line state="done" title={t('build.recordedMatters', { matters: counted(t, matters, 'matters.one', 'matters.many') })} body={t('build.recordedMattersBody')} />}
              {status !== null && BUILD_STEPS.map(id => <StepLine key={id} t={t} id={id} step={status.steps[id]} status={status} />)}
              <Line state="waiting" title={t('build.open')} />
            </ol>
          )}
        <p className={css.buildFoot}><IconInfoOutlineRegular size={16} /><span>{t('build.foot')}</span></p>
      </div>
    </div>
  )
}

/** The failure of a build: what failed, that everything else is done, and Try again. */
function FailureNotice({ t, failure, retry }: {
  readonly t: AddClientTranslate
  readonly failure: BuildFailure
  readonly retry: ReactNode
}) {
  if (failure.kind === 'start') {
    const lead = typeof failure.error === 'string' ? hostText(t, failure.error) : recordText(t, failure.error)
    return <Notice tone="bad" lead={lead} rest={t('build.failed.start')} act={retry} />
  }
  const failed = failure.status.steps['public-data'].failed.length
  const lead = failure.status.state === 'interrupted'
    ? t('build.failed.interrupted')
    : failed > 0 ? counted(t, failed, 'build.failed.publications.one', 'build.failed.publications.many') : t('build.failed.step')
  return <Notice tone="bad" lead={lead} rest={t('build.failed.rest')} act={retry} />
}

type LineState = BuildStep['state']

/** One line of the build: its state icon, what it does, its evidence or progress, and its count. */
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

/** The words of a step in each state. */
function stepTitle(t: AddClientTranslate, id: BuildStepId, step: BuildStep, status: BuildStatus): string {
  const done = step.state === 'done' || step.state === 'failed'
  switch (id) {
    case 'folder': return t(done ? 'build.folder.done' : 'build.folder.now')
    case 'matters': {
      const values = {
        families: counted(t, status.families, 'build.folders.families.one', 'build.folders.families.many'),
        matters: counted(t, status.matters, 'build.folders.matters.one', 'build.folders.matters.many'),
      }
      return t(done ? 'build.matters.done' : 'build.matters.now', values)
    }
    case 'public-data':
      if (step.state === 'failed' && step.failed.length > 0) return t('build.data.failed', { count: step.failed.length })
      return t(done ? 'build.data.done' : step.state === 'running' ? 'build.data.now' : 'build.data.next')
    case 'reference': return t(done ? 'build.reference.done' : step.state === 'running' ? 'build.reference.now' : 'build.reference.next')
  }
}

function StepLine({ t, id, step, status }: {
  readonly t: AddClientTranslate
  readonly id: BuildStepId
  readonly step: BuildStep
  readonly status: BuildStatus
}) {
  const progress = step.total > 0 ? t('build.progress', { done: step.done, total: step.total }) : undefined
  const evidence = id === 'matters' ? t('build.mattersBody') : id === 'public-data' ? t('build.dataBody') : undefined
  const body = step.state === 'failed'
    ? step.failed.length > 0 && id === 'public-data'
      ? t('build.data.failedBody', { items: step.failed.map(publicationLabel).join(', ') })
      : t('build.step.failed')
    : step.state === 'running' && step.total > 0
      ? <>{evidence}<span className={css.progress}><span style={{ width: `${Math.round(step.done / step.total * 100)}%` }} /></span></>
      : evidence
  return <Line state={step.state} title={stepTitle(t, id, step, status)} body={body} count={step.state === 'waiting' ? undefined : progress} />
}
