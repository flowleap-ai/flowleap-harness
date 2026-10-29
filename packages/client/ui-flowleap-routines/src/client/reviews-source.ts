/** One shared read of the "Needs review" marks, the task catalog that names their tasks, and the register watches. */

import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { RoutineReview, RoutineWatch } from '@deepseek-ai/dsh-flowleap-routines/types'
import type { ScheduleCatalogEntry } from '@deepseek-ai/dsh-schedule/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** What every Needs review surface reads. */
export interface ReviewsSnapshot {
  /** Query state of the marks; a failed catalog read leaves the marks ready without task names. */
  readonly status: 'loading' | 'ready' | 'error'
  /** Chats whose mark is `needs_review`, newest mark first; a `running` mark is not shown. */
  readonly marked: readonly RoutineReview[]
  /** The Host task catalog of the last successful read, empty when that read failed. */
  readonly tasks: readonly ScheduleCatalogEntry[]
  /** Chats whose Mark as done request is in flight. */
  readonly pending: readonly SessionId[]
  /** Query state of the watches, apart from the marks: a failed watch read does not hide the marks. */
  readonly watchStatus: 'loading' | 'ready' | 'error'
  /** The register watches of the last successful read, next check first. */
  readonly watches: readonly RoutineWatch[]
}

/** Remote calls and invalidations the source uses. */
export interface ReviewsDependencies {
  /** Read every mark the caller may see. */
  readonly reviews: () => Promise<RemoteResult<RoutineReview[]>>
  /** Read the Host task catalog. */
  readonly catalog: () => Promise<RemoteResult<ScheduleCatalogEntry[]>>
  /** Read every register watch the caller may see. */
  readonly watches: () => Promise<RemoteResult<RoutineWatch[]>>
  /** Clear the mark of one chat. */
  readonly done: (sessionId: SessionId) => Promise<RemoteResult<void>>
  /** Observe changes of the marks or the catalog. */
  readonly subscribeChanged: (listener: () => void) => () => void
  /** Observe connection resets. */
  readonly subscribeReset: (listener: () => void) => () => void
}

/** The source's observable and actions. */
export interface ReviewsSource {
  /** The shared snapshot; the renderer binds it to the `useReviews` selector hook. */
  readonly hooks: { readonly reviews: HostObservable<ReviewsSnapshot> }
  /**
   * Clear the mark of one chat, then read again.
   * @param sessionId - the marked chat.
   * @returns whether the Host confirmed the request; `false` also for a request already in flight.
   */
  readonly onDone: (sessionId: SessionId) => Promise<boolean>
  /**
   * Read again after a failed read.
   * @returns resolution after the read result is published.
   */
  readonly onRetry: () => Promise<void>
}

/**
 * Create the source. It reads only while the framework observes it: the first subscriber reads and starts the
 * invalidation listeners, and the last unsubscribe stops them and discards responses still in flight.
 * @param deps - Remote calls and invalidation subscriptions.
 * @returns the observable snapshot and its actions.
 */
export function createReviewsSource(deps: ReviewsDependencies): ReviewsSource {
  let snapshot: ReviewsSnapshot = { status: 'loading', marked: [], tasks: [], pending: [], watchStatus: 'loading', watches: [] }
  const listeners = new Set<() => void>()
  let disposers: readonly (() => void)[] = []
  let epoch = 0
  const publish = (next: ReviewsSnapshot): void => {
    snapshot = next
    for (const listener of listeners) listener()
  }
  const read = async (): Promise<void> => {
    const current = ++epoch
    publish({ ...snapshot, status: 'loading', watchStatus: 'loading' })
    let reviews: RemoteResult<RoutineReview[]>
    let catalog: RemoteResult<ScheduleCatalogEntry[]>
    let watches: RemoteResult<RoutineWatch[]>
    try {
      [reviews, catalog, watches] = await Promise.all([deps.reviews(), deps.catalog(), deps.watches()])
    } catch (_error: unknown) {
      // A transport rejection has the same visible retry path as a Remote failure.
      if (current === epoch) publish({ ...snapshot, status: 'error', watchStatus: 'error' })
      return
    }
    if (current !== epoch) return
    const watchState = watches.ok
      ? { watchStatus: 'ready' as const, watches: watches.value }
      : { watchStatus: 'error' as const, watches: snapshot.watches }
    if (!reviews.ok) {
      publish({ ...snapshot, ...watchState, status: 'error' })
      return
    }
    const marked = reviews.value
      .filter(review => review.state === 'needs_review')
      .toSorted((left, right) => Date.parse(right.since) - Date.parse(left.since))
    publish({ ...snapshot, ...watchState, status: 'ready', marked, tasks: catalog.ok ? catalog.value : [] })
  }
  const invalidate = (): void => { void read() }
  return {
    hooks: {
      reviews: {
        getSnapshot: () => snapshot,
        subscribe(listener) {
          listeners.add(listener)
          if (listeners.size === 1) {
            disposers = [deps.subscribeChanged(invalidate), deps.subscribeReset(invalidate)]
            invalidate()
          }
          return () => {
            listeners.delete(listener)
            if (listeners.size !== 0) return
            for (const dispose of disposers) dispose()
            disposers = []
            epoch++
            snapshot = { ...snapshot, pending: [] }
          }
        },
      },
    },
    onDone: async (sessionId) => {
      if (snapshot.pending.includes(sessionId)) return false
      publish({ ...snapshot, pending: [...snapshot.pending, sessionId] })
      let result: RemoteResult<void> | undefined
      try {
        result = await deps.done(sessionId)
      } catch (_error: unknown) {
        // A rejected request does not establish that the mark changed; the caller reports the failure.
        result = undefined
      }
      publish({ ...snapshot, pending: snapshot.pending.filter(id => id !== sessionId) })
      if (result?.ok !== true) return false
      await read()
      return true
    },
    onRetry: read,
  }
}
