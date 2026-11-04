/**
 * Designed empty, loading and error states (R18). Empty says what appears here and how, and offers the next step.
 * Loading is the list's skeleton, or one centred spinner on a page that is not a list. An error keeps the last data
 * at full contrast under one notice that says what failed, how old the data is, and Try again.
 */

import type { ReactNode } from 'react'
import { IconWarningTriangleOutlineRegular, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Load } from '../load.ts'
import { ActButton, type ActSpec } from './Act.tsx'
import css from './States.module.css'

/**
 * Render the empty state of a list, centred in the list area.
 * @param props.icon - a 16px UI icon on a 48px raised tile.
 * @param props.title - the good outcome, such as "Nothing waits for you".
 * @param props.body - one sentence on what appears here and how.
 * @param props.action - the next step as one secondary act.
 * @returns the state.
 */
export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ActSpec | undefined }) {
  return (
    <div className={css.empty}>
      <div className={css.emptyInner}>
        <div className={css.tile} aria-hidden="true">{icon}</div>
        <h2 className={css.emptyTitle}>{title}</h2>
        <p className={css.emptyBody}>{body}</p>
        {action !== undefined && <ActButton act={action} rank="secondary" />}
      </div>
    </div>
  )
}

/**
 * Render the error notice above the content: what failed, what is still safe and how old the data is, and Try again.
 * @param props.lead - what failed, one plain sentence.
 * @param props.body - what is still safe and the data's time, such as "The list shows the letters as of 14:16."
 * @param props.retry - the Try again act.
 * @returns the notice.
 */
export function ErrorNotice({ lead, body, retry }: { lead: string; body?: string | undefined; retry: ActSpec }) {
  return (
    <div className={css.noticeBar}>
      <div className={css.notice} role="alert">
        <IconWarningTriangleOutlineRegular size={16} />
        <div className={css.noticeText}>
          <span className={css.lead}>{lead}</span>
          {body !== undefined && ` ${body}`}
        </div>
        <ActButton act={retry} rank="secondary" />
      </div>
    </div>
  )
}

/**
 * Render the one centred spinner of a page that is not a list.
 * @param props.label - the accessible name, such as "Loading".
 * @returns the spinner.
 */
export function PageSpinner({ label }: { label: string }) {
  return <div className={css.spinner} role="status" aria-label={label}><StateDot state="ongoing" size={24} /></div>
}

/** What a view shows for each phase of a load. */
export interface LoadRenderers<T> {
  /** The skeleton of a list, or a `PageSpinner`. */
  readonly loading: () => ReactNode
  /** The view with its data. */
  readonly ready: (data: T, at: number) => ReactNode
  /** The error notice; `at` is the time of the last data, or null when there is none. */
  readonly failed: (at: number | null) => ReactNode
}

/**
 * Render one load: nothing in its first 150ms, then the loading state; the data; or the error notice above the last
 * data, at full contrast.
 * @param props.load - the load.
 * @param props.render - the renderers of each phase.
 * @returns the view.
 */
export function LoadView<T>({ load, render }: { load: Load<T>; render: LoadRenderers<T> }) {
  switch (load.phase) {
    case 'waiting': return null
    case 'skeleton': return <>{render.loading()}</>
    case 'ready': return <>{render.ready(load.data, load.at)}</>
    case 'failed': return (
      <>
        {render.failed(load.last?.at ?? null)}
        {load.last !== null && render.ready(load.last.data, load.last.at)}
      </>
    )
  }
}
