/**
 * The routine surfaces on the FlowLeap dashboard: the "Waiting for review" and "Cases watched" metric cards, the
 * "Needs your review" and "Coming up" panels, and the Routines group of the search results. All read the one shared
 * source, so the numbers are the Needs review page's numbers.
 */

import { Button, IconAlarmClockOutlineRegular, IconChecklistOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-flowleap-dashboard/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { NS } from './locales.ts'
import type { ReviewsInjected } from './marks.tsx'
import css from './NeedsReview.module.css'

/** Most marked chats the panel lists; the Needs review page lists all. */
const PANEL_ROWS = 5

/** Props of the metric card. */
export type WaitingForReviewMetricProps = PropsRuntime<'dashboard.metric'> & PropsLocale<typeof NS> & InjectFace<ReviewsInjected>

/**
 * Render the count of marked chats.
 * @param props - the shared source and copy.
 * @returns the card body.
 */
export function WaitingForReviewMetric({ useReviews, t }: WaitingForReviewMetricProps) {
  const count = useReviews(snapshot => snapshot.marked.length)
  return (
    <>
      <span className={css.metricValue}>{count}</span>
      <span className={css.metricCaption}>{t('dashboard.metric.caption')}</span>
    </>
  )
}

/** Injected share of the panel. */
export interface NeedsYourReviewInjected extends ReviewsInjected {
  /**
   * Open one chat in the conversation column.
   * @param sessionId - the marked chat.
   */
  readonly onOpenSession: (sessionId: SessionId) => void
  /** Open the Needs review page. */
  readonly onOpenAll: () => void
}

/** Props of the panel. */
export type NeedsYourReviewWidgetProps = PropsRuntime<'dashboard.widget'> & PropsLocale<typeof NS> & InjectFace<NeedsYourReviewInjected>

/**
 * Render the newest marked chats; each row opens its chat.
 * @param props - the shared source, the Session list, the open actions, and copy.
 * @returns the panel body.
 */
export function NeedsYourReviewWidget({ useReviews, useSessions, onOpenSession, onOpenAll, t }: NeedsYourReviewWidgetProps) {
  const status = useReviews(snapshot => snapshot.status)
  const marked = useReviews(snapshot => snapshot.marked)
  const sessions = useSessions(list => list.byId)
  const format = new Intl.DateTimeFormat(t('time.locale'), { dateStyle: 'medium', timeStyle: 'short' })
  if (status === 'error') return <p className={css.widgetEmpty} role="alert">{t('list.error')}</p>
  if (marked.length === 0) return <p className={css.widgetEmpty}>{t(status === 'loading' ? 'list.loading' : 'empty.title')}</p>
  return (
    <>
      <ul className={css.rows} aria-label={t('list.label')}>
        {marked.slice(0, PANEL_ROWS).map((review) => {
          const title = sessions[review.sessionId]?.displayTitle ?? t('row.untitled')
          return (
            <li key={review.sessionId} className={css.row}>
              <Button className={css.open} aria-label={t('row.open', { title })} onClick={() => { onOpenSession(review.sessionId) }}>
                <IconChecklistOutlineRegular size={16} className={css.glyph} />
                <span className={css.rowContent}>
                  <span className={css.rowTitle}>{title}</span>
                  <span className={css.rowSummary}><time dateTime={review.since}>{format.format(Date.parse(review.since))}</time></span>
                </span>
              </Button>
            </li>
          )
        })}
      </ul>
      <Button variant="ghost" size="sm" className={css.widgetAll} onClick={onOpenAll}>{t('dashboard.widget.all')}</Button>
    </>
  )
}

/** Props of the Cases watched card. */
export type CasesWatchedMetricProps = PropsRuntime<'dashboard.metric'> & PropsLocale<typeof NS> & InjectFace<ReviewsInjected>

/**
 * Render the number of different applications that the register watches name.
 * @param props - the shared source and copy.
 * @returns the card body; a failed read shows the error, never a number.
 */
export function CasesWatchedMetric({ useReviews, t }: CasesWatchedMetricProps) {
  const status = useReviews(snapshot => snapshot.watchStatus)
  const watches = useReviews(snapshot => snapshot.watches)
  if (status === 'error') return <p className={css.widgetEmpty} role="alert">{t('watches.error')}</p>
  const count = new Set(watches.flatMap(watch => watch.applications.map(item => item.application))).size
  return (
    <>
      <span className={css.metricValue}>{status === 'loading' && count === 0 ? '…' : count}</span>
      <span className={css.metricCaption}>{t('cases.metric.caption')}</span>
    </>
  )
}

/** Props of the Coming up panel. */
export type ComingUpWidgetProps = PropsRuntime<'dashboard.widget'> & PropsLocale<typeof NS> & InjectFace<NeedsYourReviewInjected>

/**
 * Render the active register watches, next check first: the time of the next check and, per application, the newest
 * event of its last read. Each row opens the chat that owns the watch task. A note says that no deadline is computed.
 * @param props - the shared source, the open action, and copy.
 * @returns the panel body.
 */
export function ComingUpWidget({ useReviews, onOpenSession, t }: ComingUpWidgetProps) {
  const status = useReviews(snapshot => snapshot.watchStatus)
  const watches = useReviews(snapshot => snapshot.watches)
  const time = new Intl.DateTimeFormat(t('time.locale'), { dateStyle: 'medium', timeStyle: 'short' })
  // A register date is a calendar day; UTC keeps it on the same day in every time zone.
  const day = new Intl.DateTimeFormat(t('time.locale'), { dateStyle: 'medium', timeZone: 'UTC' })
  const active = watches.flatMap(watch => watch.nextCheckAt === undefined ? [] : [{ ...watch, nextCheckAt: watch.nextCheckAt }])
  if (status === 'error') return <p className={css.widgetEmpty} role="alert">{t('watches.error')}</p>
  if (active.length === 0) return <p className={css.widgetEmpty}>{t(status === 'loading' ? 'list.loading' : 'comingUp.empty')}</p>
  return (
    <>
      <ul className={css.rows}>
        {active.slice(0, PANEL_ROWS).map(watch => (
          <li key={watch.taskId} className={css.row}>
            <Button className={css.open} aria-label={t('comingUp.open', { title: watch.title })} onClick={() => { onOpenSession(watch.sessionId) }}>
              <IconAlarmClockOutlineRegular size={16} className={css.glyph} />
              <span className={css.rowContent}>
                <span className={css.rowTitle}>{watch.title}</span>
                <span className={css.rowSummary}>
                  <time dateTime={watch.nextCheckAt}>{t('comingUp.next', { time: time.format(Date.parse(watch.nextCheckAt)) })}</time>
                </span>
                {watch.applications.map(item => (
                  <span key={item.application} className={css.rowSummary}>
                    {item.latest === undefined
                      ? t('comingUp.noEvent', { application: item.application })
                      : t('comingUp.latest', {
                        application: item.application, date: day.format(Date.parse(item.latest.date)), description: item.latest.description,
                      })}
                  </span>
                ))}
              </span>
            </Button>
          </li>
        ))}
      </ul>
      <p className={css.widgetNote}>{t('comingUp.note')}</p>
    </>
  )
}

/** Props of the Routines search group. */
export type RoutineSearchProps = PropsRuntime<'dashboard.search'> & PropsLocale<typeof NS> & InjectFace<NeedsYourReviewInjected>

/**
 * Render the scheduled tasks whose title, or for a register watch one of whose applications, matches the query; each
 * row opens the chat that owns the task.
 * @param props - the match rule, the pick report, the shared source, the open action, and copy.
 * @returns the group, or nothing when no task matches.
 */
export function RoutineSearch({ matches, onPicked, useReviews, onOpenSession, t }: RoutineSearchProps) {
  const tasks = useReviews(snapshot => snapshot.tasks)
  const watches = useReviews(snapshot => snapshot.watches)
  const found = tasks.filter((task) => {
    const applications = watches.find(watch => watch.taskId === task.id)?.applications.map(item => item.application) ?? []
    return matches([task.title, ...applications].join(' '))
  })
  if (found.length === 0) return null
  return (
    <section aria-label={t('search.heading')}>
      <h3 className={css.searchHeading}>{t('search.heading')}</h3>
      <ul className={css.rows}>
        {found.slice(0, PANEL_ROWS).map(task => (
          <li key={task.id} className={css.row}>
            <Button className={css.open} aria-label={t('search.open', { title: task.title })} onClick={() => {
              onPicked()
              onOpenSession(task.sessionId)
            }}>
              <IconAlarmClockOutlineRegular size={16} className={css.glyph} />
              <span className={css.rowContent}><span className={css.rowTitle}>{task.title}</span></span>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
