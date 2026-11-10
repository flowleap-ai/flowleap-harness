/** The shared load of a settings card store: one snapshot, one read at a time, and a refresh only after the first load. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'

/** The load state every page snapshot carries: `idle` before the first load, `error` when the read failed. */
export interface PageLoadState {
  status: 'idle' | 'loading' | 'ready' | 'error'
}

/** A page store over the `flowleapConnectors` Remote; a subclass reads the Host in {@link RemotePageStore.read}. */
export abstract class RemotePageStore<S extends PageLoadState> {
  /** uSES-safe state source of the page. */
  readonly store: SnapshotStore<S>

  private loading: Promise<void> | undefined

  /**
   * @param ctx - the page plugin's context, whose `remote.flowleapConnectors` namespace the subclass calls.
   * @param initial - the state before the first load.
   */
  constructor(protected readonly ctx: ClientContext, initial: S) {
    this.store = createSnapshotStore<S>(initial)
  }

  /**
   * Read the Host and publish the result. Concurrent callers share one read.
   * @returns settlement after the snapshot is published.
   */
  load(): Promise<void> {
    this.loading ??= this.read().finally(() => { this.loading = undefined })
    return this.loading
  }

  /** Read again, but only once the page has loaded: an unopened page does not fetch on invalidations. */
  refresh(): void {
    if (this.store.getSnapshot().status === 'idle') return
    void this.load()
  }

  /** Read the Host and publish the result into {@link RemotePageStore.store}. */
  protected abstract read(): Promise<void>
}
