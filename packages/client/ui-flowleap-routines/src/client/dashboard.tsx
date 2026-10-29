/**
 * The Needs review surfaces on the FlowLeap dashboard: the "Waiting for review" metric card and the "Needs your
 * review" panel. Both read the one shared reviews source, so the numbers are the Needs review page's numbers.
 */

import { Button, IconChecklistOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
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
