/** The one shared read of `flowleapBudget.month()` behind the budget card and panel. */

import { createLazyRemoteSource } from '@deepseek-ai/dsh-client-store'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { BudgetMonth } from '@deepseek-ai/dsh-flowleap-budget/types'

/** The shared read: `undefined` until the first answer. */
export type BudgetSnapshot = BudgetMonth | undefined

/** Remote call and invalidations the source uses. */
export interface BudgetDependencies {
  /** Read the month's figures. */
  readonly month: () => Promise<RemoteResult<BudgetMonth>>
  /** Observe connection resets. */
  readonly subscribeReset: (listener: () => void) => () => void
  /** Observe the window getting the focus again, so a spend that changed in another tab or chat shows. */
  readonly subscribeFocus: (listener: () => void) => () => void
}

/**
 * Create the shared read. It reads when the first surface observes it (each time the dashboard shows), at a
 * connection reset, and when the window gets the focus; a failed call is the `unreachable` reason.
 * @param deps - the Remote call and the invalidation subscriptions.
 * @returns the observable snapshot.
 */
export function createBudgetSource(deps: BudgetDependencies): HostObservable<BudgetSnapshot> {
  return createLazyRemoteSource<BudgetSnapshot>({
    initial: undefined,
    read: async () => {
      try {
        const result = await deps.month()
        return result.ok ? result.value : { state: 'unknown', reason: 'unreachable' }
      } catch (_error: unknown) {
        // A transport rejection is the same visible state as a Remote failure: the gateway figures are not known.
        return { state: 'unknown', reason: 'unreachable' }
      }
    },
    invalidations: [deps.subscribeReset, deps.subscribeFocus],
  })
}
