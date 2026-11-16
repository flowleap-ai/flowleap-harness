/**
 * The parts that the MyEPO mirror pages share: the page before its list is read, the line that a later read failed,
 * the search field, and the summary line with the new read. Each page passes its own copy and its own style classes.
 */

import type { ReactNode } from 'react'
import { IconSearchOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ReadFailure, ReadSnapshot } from './read.ts'

/** The copy of a list read and its outcomes, in the language of the page. */
export interface ReadCopy {
  /** The accessible name of the page. */
  readonly page: string
  /** The line while the first read runs. */
  readonly loading: string
  /** The heading when MyEPO is not linked. */
  readonly notLinkedTitle: string
  /** What to do when MyEPO is not linked. */
  readonly notLinked: string
  readonly refused: string
  readonly unreachable: string
  /** The sentence for a person who does not have the MyEPO pages. */
  readonly noAccess: string
  /** The sentence while the firm has no copy of the data. */
  readonly notRead: string
  /** The sentence for an error answer, with the EPO's message. */
  readonly failed: (message: string) => string
  /** The sentence that the list is as old as a time. */
  readonly stale: (time: string) => string
  /** The label of the act that reads again. */
  readonly refresh: string
  /** The locale of the page, such as `en-GB`. */
  readonly locale: string
}

/** The keys of {@link ReadCopy} in the dictionary of a page. */
type ReadKey =
  | 'page.label' | 'state.loading' | 'state.notLinked.title' | 'state.notLinked.body' | 'state.refused' | 'state.unreachable'
  | 'state.noAccess' | 'state.notRead' | 'state.failed' | 'state.stale' | 'act.refresh' | 'time.locale'

/**
 * The copy of a list read from the dictionary of a page.
 * @param t - the translate function of the page; its dictionary has every {@link ReadKey}.
 * @returns the copy.
 */
export function readCopy(t: (key: ReadKey, params?: Record<string, string>) => string): ReadCopy {
  return {
    page: t('page.label'),
    loading: t('state.loading'),
    notLinkedTitle: t('state.notLinked.title'),
    notLinked: t('state.notLinked.body'),
    refused: t('state.refused'),
    unreachable: t('state.unreachable'),
    noAccess: t('state.noAccess'),
    notRead: t('state.notRead'),
    failed: message => t('state.failed', { message }),
    stale: time => t('state.stale', { time }),
    refresh: t('act.refresh'),
    locale: t('time.locale'),
  }
}

/**
 * The stylesheet of the page. The shared parts use its classes `page`, `state`, `button`, `notice`, `search`, `summary`
 * and `link`.
 */
export type ReadClasses = Readonly<Record<string, string | undefined>>

/**
 * The sentence of a read that gave no list.
 * @param copy - the copy of the page.
 * @param failure - why the read gave no list.
 * @returns the sentence.
 */
export function failureText(copy: ReadCopy, failure: ReadFailure): string {
  switch (failure.kind) {
    case 'not-linked': return copy.notLinked
    case 'refused': return copy.refused
    case 'unreachable': return copy.unreachable
    case 'no-access': return copy.noAccess
    case 'not-read': return copy.notRead
    case 'failed':
    case 'error': return copy.failed(failure.message)
  }
}

/**
 * Whether a page has no list to show yet: its first read runs, or no read has answered.
 * @param read - the read state of the page.
 * @returns true when the page shows {@link Unread}.
 */
export function isUnread(read: ReadSnapshot): boolean {
  return read.phase === 'loading' || (read.failure !== null && read.readAt === null)
}

/** The page before its list is read: the read in progress, or why MyEPO gave no list, with a new read. */
export function Unread({ read, copy, classes, onRefresh }: {
  read: ReadSnapshot
  copy: ReadCopy
  classes: ReadClasses
  onRefresh: () => void
}) {
  const { failure } = read
  return (
    <section className={classes.page} aria-label={copy.page}>
      {failure === null
        ? <p className={classes.state} role="status">{copy.loading}</p>
        : (
          <div className={classes.state} role="alert">
            {failure.kind === 'not-linked' ? <h2>{copy.notLinkedTitle}</h2> : null}
            <p>{failureText(copy, failure)}</p>
            <button type="button" className={classes.button} disabled={read.reading} onClick={onRefresh}>{copy.refresh}</button>
          </div>
        )}
    </section>
  )
}

/** The line that a read failed after a read that answered: why, and how old the shown list is. Nothing otherwise. */
export function StaleNotice({ read, copy, classes }: { read: ReadSnapshot; copy: ReadCopy; classes: ReadClasses }): ReactNode {
  if (read.failure === null) return null
  // A page shows this part only after a read that answered ({@link isUnread} is false), so the time of that read is set.
  const time = new Intl.DateTimeFormat(copy.locale, { dateStyle: 'medium', timeStyle: 'short' }).format(Date.parse(read.readAt as string))
  return <p className={classes.notice} role="alert">{failureText(copy, read.failure)} {copy.stale(time)}</p>
}

/** The search field of a list. */
export function SearchField({ value, label, classes, onChange }: {
  value: string
  label: string
  classes: ReadClasses
  onChange: (value: string) => void
}) {
  return (
    <label className={classes.search}>
      <IconSearchOutlineRegular size={16} />
      <input type="search" value={value} placeholder={label} aria-label={label} onChange={(event) => { onChange(event.target.value) }} />
    </label>
  )
}

/** The summary line of a list, with the act that reads again. */
export function Summary({ text, read, copy, classes, onRefresh }: {
  text: string
  read: ReadSnapshot
  copy: ReadCopy
  classes: ReadClasses
  onRefresh: () => void
}) {
  return (
    <div className={classes.summary}>
      <span>{text}</span>
      <button type="button" className={classes.link} disabled={read.reading} onClick={onRefresh}>{copy.refresh}</button>
    </div>
  )
}
