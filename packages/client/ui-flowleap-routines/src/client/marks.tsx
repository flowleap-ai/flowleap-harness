/**
 * The small Needs review surfaces: the Sidebar row badge, the panel launcher glyph with its count, the Session header
 * Mark as done button, and the Automation tasks filter tab. Each reads the one shared reviews source.
 */

import { useEffect, useMemo, useState } from 'react'
import { Button, IconCheckOutlineRegular, IconChecklistOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ScheduleManagerFilterOwnerProps } from '@deepseek-ai/dsh-client-ui-schedule/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { ScheduleId } from '@deepseek-ai/dsh-schedule/client'
import type { NS } from './locales.ts'
import type { ReviewsSource } from './reviews-source.ts'
import css from './NeedsReview.module.css'

/** Injected share of every Needs review surface: the shared source and its actions. */
export type ReviewsInjected = Pick<ReviewsSource, 'hooks'>

/** Injected share of a surface that clears a mark. */
export type ReviewsActionInjected = Pick<ReviewsSource, 'hooks' | 'onDone'>

type Copy = PropsLocale<typeof NS>

/** Props of the Sidebar row badge. */
export type NeedsReviewBadgeProps = Pick<PropsRuntime<'sidebar.session.row.trailing'>, 'sessionId'> & Copy & InjectFace<ReviewsInjected>

/**
 * Render the badge while the row's chat is marked `needs_review`.
 * @param props - the row's Session, the shared source, and copy.
 * @returns the decorative glyph with its accessible label, or nothing for an unmarked chat.
 */
export function NeedsReviewBadge({ sessionId, useReviews, t }: NeedsReviewBadgeProps) {
  const marked = useReviews(snapshot => snapshot.marked.some(review => review.sessionId === sessionId))
  if (!marked) return null
  return (
    <span className={css.badge} data-needs-review-badge="">
      <IconChecklistOutlineRegular size={14} aria-hidden="true" />
      <span className={css.visuallyHidden}>{t('badge.label')}</span>
    </span>
  )
}

/** Props of the panel launcher glyph. */
export type NeedsReviewPanelIconProps = Pick<PropsRuntime<'sidebar.panellist'>, 'size'> & InjectFace<ReviewsInjected>

/**
 * Render the launcher glyph with a dot while a chat is marked; the Sidebar owns the launcher's accessible name.
 * @param props - the requested glyph edge and the shared source.
 * @returns the glyph, with the dot when the count is above zero.
 */
export function NeedsReviewPanelIcon({ size, useReviews }: NeedsReviewPanelIconProps) {
  const count = useReviews(snapshot => snapshot.marked.length)
  if (count === 0) return <IconChecklistOutlineRegular size={size} />
  return (
    <span className={css.panelIcon}>
      <IconChecklistOutlineRegular size={size} />
      <span className={css.count} data-needs-review-count={count} />
    </span>
  )
}

/** Props of the Session header Mark as done button. */
export type MarkDoneActionProps = Pick<PropsRuntime<'conversation.session.header.utilities'>, 'sessionId'> & Copy
  & InjectFace<ReviewsActionInjected>

/**
 * Render Mark as done while the open chat is marked `needs_review`.
 * @param props - the open Session, the shared source, the done action, and copy.
 * @returns the button, or nothing for an unmarked chat.
 */
export function MarkDoneAction({ sessionId, useReviews, onDone, t }: MarkDoneActionProps) {
  const marked = useReviews(snapshot => snapshot.marked.some(review => review.sessionId === sessionId))
  const pending = useReviews(snapshot => snapshot.pending.includes(sessionId))
  const [failed, setFailed] = useState(false)
  if (!marked) return null
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        icon={<IconCheckOutlineRegular size={13} />}
        aria-busy={pending}
        onClick={() => {
          if (pending) return
          setFailed(false)
          void onDone(sessionId).then((ok) => { setFailed(!ok) })
        }}
      >
        {t(pending ? 'done.pending' : 'done.action')}
      </Button>
      {/* The chat stays marked after a failure, so the button itself stays for a retry. */}
      {failed && <span role="alert" className={css.visuallyHidden}>{t('done.error')}</span>}
    </>
  )
}

/** Props of the Automation tasks filter tab. */
export type NeedsReviewFilterProps = ScheduleManagerFilterOwnerProps & Copy & InjectFace<ReviewsInjected>

/**
 * Render the Needs review filter tab. The tab filters by the catalog tasks whose runs marked a chat that still needs
 * review, and hands the page a new set whenever that set changes while it is selected.
 * @param props - the page's owner share, the shared source, and copy.
 * @returns the filter tab.
 */
export function NeedsReviewFilter({ selected, select, className, selectedClassName, useReviews, t }: NeedsReviewFilterProps) {
  const marked = useReviews(snapshot => snapshot.marked)
  const tasks = useReviews(snapshot => snapshot.tasks)
  const taskIds = useMemo(() => {
    const reviewed = new Set<string>(marked.map(review => review.taskId))
    return new Set<ScheduleId>(tasks.filter(task => reviewed.has(task.id)).map(task => task.id))
  }, [marked, tasks])
  useEffect(() => { if (selected) select(taskIds) }, [selected, select, taskIds])
  return (
    <button
      type="button"
      className={selected ? `${className} ${selectedClassName}` : className}
      aria-pressed={selected}
      onClick={() => { select(taskIds) }}
    >
      {t('filter.label')}
    </button>
  )
}
