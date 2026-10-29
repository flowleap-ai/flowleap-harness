/** One shared read of the register watches, for the Cases watched card and the Coming up panel. */

import { createLazyRemoteSource } from '@deepseek-ai/dsh-client-store'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { RoutineWatch } from '@deepseek-ai/dsh-flowleap-routines/types'

/** What the watch surfaces read. */
export interface WatchesSnapshot {
  /** Query state; a failed read keeps the watches of the last successful read. */
  readonly status: 'loading' | 'ready' | 'error'
  /** The register watches of the last successful read, next check first. */
  readonly watches: readonly RoutineWatch[]
}

/** Remote call and invalidations the source uses. */
export interface WatchesDependencies {
  /** Read every register watch the caller may see. */
  readonly watches: () => Promise<RemoteResult<RoutineWatch[]>>
  /** Observe changes of the watches or the task catalog. */
  readonly subscribeChanged: (listener: () => void) => () => void
  /** Observe connection resets. */
  readonly subscribeReset: (listener: () => void) => () => void
}

/**
 * Create the source. It reads while a surface observes it, again at each change and connection reset.
 * @param deps - the Remote call and the invalidation subscriptions.
 * @returns the observable snapshot.
 */
export function createWatchesSource(deps: WatchesDependencies): HostObservable<WatchesSnapshot> {
  const source: HostObservable<WatchesSnapshot> = createLazyRemoteSource<WatchesSnapshot>({
    initial: { status: 'loading', watches: [] },
    read: async (): Promise<WatchesSnapshot> => {
      const previous = source.getSnapshot().watches
      try {
        const result = await deps.watches()
        return result.ok ? { status: 'ready', watches: result.value } : { status: 'error', watches: previous }
      } catch (_error: unknown) {
        // A transport rejection has the same visible state as a Remote failure.
        return { status: 'error', watches: previous }
      }
    },
    invalidations: [deps.subscribeChanged, deps.subscribeReset],
  })
  return source
}
