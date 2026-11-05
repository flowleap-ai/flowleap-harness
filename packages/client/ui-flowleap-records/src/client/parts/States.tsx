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
 * @param props.action - the next step as one secondary act with its key; every empty state offers one.
 * @returns the state.
 */
export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action: ActSpec }) {
  return (
    <div className={css.empty}>
      <div className={css.emptyInner}>
        <div className={css.tile} aria-hidden="true">{icon}</div>
        <h2 className={css.emptyTitle}>{title}</h2>
        <p className={css.emptyBody}>{body}</p>
        <ActButton act={action} rank="secondary" />
      </div>
    </div>
  )
}

/** An error notice: what failed, what is still safe, and Try again unless another notice on the screen has it. */
export interface NoticeSpec {
  /** What failed, one plain sentence. */
  readonly lead: string
  /** What is still safe, such as "The list shows the letters as of 14:16." */
  readonly body?: string | undefined
  /** The Try again act; none when another notice's Try again also does this one's work. */
  readonly retry?: ActSpec | undefined
}

/**
 * Render an error notice in place, such as the failure of an act in its decision bar.
 * @param props.notice - the notice.
 * @returns the notice.
 */
export function Notice({ notice }: { notice: NoticeSpec }) {
  return (
    <div className={css.notice} role="alert">
      <IconWarningTriangleOutlineRegular size={16} />
      <div className={css.noticeText}>
        <span className={css.lead}>{notice.lead}</span>
        {notice.body !== undefined && ` ${notice.body}`}
      </div>
      {notice.retry !== undefined && <ActButton act={notice.retry} rank="secondary" />}
    </div>
  )
}

/**
 * Render the error notice above the content: what failed, what is still safe and how old the data is, and Try again.
 * @param props - the notice.
 * @returns the notice.
 */
export function ErrorNotice(props: NoticeSpec) {
  return <div className={css.noticeBar}><Notice notice={props} /></div>
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
