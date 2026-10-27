/** The Needs review page: the chats a routine run marked, newest first, each with its open and Mark as done actions. */

import { useState } from 'react'
import {
  Button, IconCheckOutlineRegular, IconChecklistOutlineRegular, StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { NS } from './locales.ts'
import type { ReviewsSource } from './reviews-source.ts'
import css from './NeedsReview.module.css'

/** Injected share of the page: the shared source, its actions, and chat navigation. */
export interface NeedsReviewPageInjected extends ReviewsSource {
  /**
   * Open one chat in the conversation column.
   * @param sessionId - the marked chat.
   */
  readonly onOpenSession: (sessionId: SessionId) => void
}

/** Full props of the page. */
export type NeedsReviewPageProps = PropsRuntime<'main'> & PropsLocale<typeof NS> & InjectFace<NeedsReviewPageInjected>

/**
 * Render the marked chats with the chat title, the routine task title, and the time the chat was marked.
 * @param props - the shared source, the Session list, the actions, and copy.
 * @returns the page.
 */
export function NeedsReviewPage({ useReviews, useSessions, onDone, onRetry, onOpenSession, t }: NeedsReviewPageProps) {
  const status = useReviews(snapshot => snapshot.status)
  const marked = useReviews(snapshot => snapshot.marked)
  const tasks = useReviews(snapshot => snapshot.tasks)
  const pending = useReviews(snapshot => snapshot.pending)
  const sessions = useSessions(list => list.byId)
  const [failed, setFailed] = useState(false)
  const format = new Intl.DateTimeFormat(t('time.locale'), { dateStyle: 'medium', timeStyle: 'short' })
  const populated = marked.length > 0
  return (
    <section className={css.page} aria-label={t('title')} data-testid="needs-review-page">
      <div className={css.content}>
        <div className={css.heading}>
          <h1>{t('title')}</h1>
          <p>{t('summary')}</p>
        </div>
        {status === 'error' && <div className={css.notice}>
          <p role="alert">{t('list.error')}</p>
          <Button variant="outline" size="sm" onClick={() => { void onRetry() }}>{t('list.retry')}</Button>
        </div>}
        {failed && <p className={css.notice} role="alert">{t('done.error')}</p>}
        {status === 'loading' && !populated && <div className={css.empty} role="status" aria-label={t('list.loading')}>
          <StateDot state="ongoing" />
        </div>}
        {status === 'ready' && !populated && <div className={css.empty} role="status">
          <IconChecklistOutlineRegular size={24} />
          <h2>{t('empty.title')}</h2>
          <p>{t('empty.description')}</p>
        </div>}
        <ul className={css.rows} aria-label={t('list.label')} aria-busy={status === 'loading'}>
          {marked.map((review) => {
            const title = sessions[review.sessionId]?.displayTitle ?? t('row.untitled')
            const task = tasks.find(record => record.id === review.taskId)?.title
            const busy = pending.includes(review.sessionId)
            return (
              <li key={review.sessionId} className={css.row}>
                <Button className={css.open} aria-label={t('row.open', { title })} onClick={() => { onOpenSession(review.sessionId) }}>
                  <IconChecklistOutlineRegular size={16} className={css.glyph} />
                  <span className={css.rowContent}>
                    <span className={css.rowTitle}>{title}</span>
                    <span className={css.rowSummary}>
                      {task !== undefined && <span>{t('row.task', { task })}</span>}
                      <time dateTime={review.since}>{format.format(Date.parse(review.since))}</time>
                    </span>
                  </span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className={css.done}
                  icon={<IconCheckOutlineRegular size={13} />}
                  aria-label={t('done.label', { title })}
                  aria-busy={busy}
                  onClick={() => {
                    if (busy) return
                    setFailed(false)
                    void onDone(review.sessionId).then((ok) => { setFailed(!ok) })
                  }}
                >
                  {t(busy ? 'done.pending' : 'done.action')}
                </Button>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
