/** An observable snapshot that reads a remote value only while something observes it. */

import type { ObservableSnapshot } from './contract.ts'

/** Inputs of {@link createLazyRemoteSource}. */
export interface LazyRemoteSourceOptions<T> {
  /** Snapshot before the first read settles. */
  readonly initial: T
  /**
   * Read the next snapshot. Map every failure into a snapshot value: a rejection keeps the snapshot and is logged.
   * @returns the next snapshot.
   */
  readonly read: () => Promise<T>
  /** Subscriptions that make the snapshot stale, such as a change event or a connection reset; each returns its disposer. */
  readonly invalidations: readonly ((listener: () => void) => () => void)[]
}

/**
 * Create a source that reads when the first observer subscribes, again at each invalidation while it is observed, and
 * again at each later first observer. The last unsubscribe stops the invalidation subscriptions and drops each read
 * still in flight; a read that a later read superseded is dropped too. The snapshot stays between observers.
 * @param options - the initial snapshot, the read, and the invalidation subscriptions.
 * @returns the observable snapshot.
 */
export function createLazyRemoteSource<T>(options: LazyRemoteSourceOptions<T>): ObservableSnapshot<T> {
  let snapshot = options.initial
  const listeners = new Set<() => void>()
  let stops: readonly (() => void)[] = []
  let epoch = 0
  const read = async (): Promise<void> => {
    const current = ++epoch
    let next: T
    try {
      next = await options.read()
    } catch (error: unknown) {
      console.error('lazy remote source read failed:', error)
      return
    }
    if (current !== epoch) return
    snapshot = next
    for (const listener of [...listeners]) listener()
  }
  const invalidate = (): void => { void read() }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      if (listeners.size === 1) {
        stops = options.invalidations.map(subscribe => subscribe(invalidate))
        invalidate()
      }
      return () => {
        if (!listeners.delete(listener) || listeners.size !== 0) return
        for (const stop of stops) stop()
        stops = []
        epoch++
      }
    },
  }
}
