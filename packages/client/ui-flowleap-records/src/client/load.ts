/**
 * The loading state machine of one read (rule R18 of the IPMS design language). A first load shows nothing for
 * 150 ms, then a skeleton for at least 300 ms, so a fast answer never flashes a skeleton and a slow one never
 * flickers. A load over data that is already shown keeps that data visible. A failure keeps the last data and the
 * time it arrived, so the view shows the data at full contrast under one notice.
 */

import { createSnapshotStore, type ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { Fetched, RecordsError } from './api.ts'

/** After this time with no answer, a first load shows its skeleton. */
export const SKELETON_DELAY_MS = 150
/** Once shown, a skeleton stays for at least this time. */
export const SKELETON_MIN_MS = 300

/** Data with the time it arrived (epoch milliseconds). */
export interface Dated<T> {
  readonly data: T
  readonly at: number
}

/**
 * What a view shows for one read.
 * - `waiting`: a first load in its first 150 ms; show nothing new.
 * - `skeleton`: a first load past 150 ms; show the skeleton.
 * - `ready`: the data; `refreshing` while a newer load runs behind it.
 * - `failed`: the failure, with the last data when there is any; `retrying` while a new load runs.
 */
export type Load<T> =
  | { readonly phase: 'waiting' }
  | { readonly phase: 'skeleton' }
  | { readonly phase: 'ready'; readonly data: T; readonly at: number; readonly refreshing: boolean }
  | { readonly phase: 'failed'; readonly error: RecordsError; readonly last: Dated<T> | null; readonly retrying: boolean }

/** One read and its observable state. */
export interface Loader<T> {
  readonly source: ObservableSnapshot<Load<T>>
  /** Start a load; a load still running is stopped. */
  load(): void
  /** Stop the running load and every timer; the loader does nothing after this. */
  dispose(): void
}

/**
 * Create the loader of one read. It does not start a load.
 * @param read - the read; its signal aborts when a newer load starts or the loader is disposed.
 * @returns the loader.
 */
export function createLoader<T>(read: (signal: AbortSignal) => Promise<Fetched<T>>): Loader<T> {
  const store = createSnapshotStore<Load<T>>({ phase: 'waiting' })
  let last: Dated<T> | null = null
  let controller: AbortController | null = null
  let skeletonSince: number | null = null
  let delay: ReturnType<typeof setTimeout> | null = null
  let hold: ReturnType<typeof setTimeout> | null = null
  let disposed = false

  const clearTimers = (): void => {
    if (delay !== null) clearTimeout(delay)
    if (hold !== null) clearTimeout(hold)
    delay = null
    hold = null
  }

  const settle = (result: Fetched<T>): void => {
    clearTimers()
    skeletonSince = null
    if (result.ok) {
      last = { data: result.value, at: Date.now() }
      store.set({ phase: 'ready', data: last.data, at: last.at, refreshing: false })
    } else {
      store.set({ phase: 'failed', error: result.error, last, retrying: false })
    }
  }

  const begin = (): void => {
    const current = store.getSnapshot()
    if (last !== null && current.phase === 'ready') store.set({ ...current, refreshing: true })
    else if (last !== null && current.phase === 'failed') store.set({ ...current, retrying: true })
    else if (current.phase !== 'skeleton') {
      store.set({ phase: 'waiting' })
      delay = setTimeout(() => {
        delay = null
        skeletonSince = Date.now()
        store.set({ phase: 'skeleton' })
      }, SKELETON_DELAY_MS)
    }
  }

  return {
    source: store,
    load() {
      if (disposed) return
      controller?.abort()
      clearTimers()
      const own = new AbortController()
      controller = own
      begin()
      void read(own.signal).then((result) => {
        if (own.signal.aborted || (!result.ok && result.error.kind === 'aborted')) return
        const remaining = skeletonSince === null ? 0 : skeletonSince + SKELETON_MIN_MS - Date.now()
        if (remaining <= 0) settle(result)
        else hold = setTimeout(() => { settle(result) }, remaining)
      })
    },
    dispose() {
      disposed = true
      controller?.abort()
      clearTimers()
    },
  }
}

/**
 * The failure of a view that shows several loads, such as the intake list and its open letter: the view shows one
 * notice for all of them, with the time of the oldest data that stays on screen.
 * @param loads - the loads that the view shows.
 * @returns null when no load failed; else `at`, the time of the oldest last data of a failed load, or null when no
 * failed load has data.
 */
export function viewFailure(loads: readonly Load<unknown>[]): { readonly at: number | null } | null {
  const failed = loads.flatMap(load => load.phase === 'failed' ? [load] : [])
  if (failed.length === 0) return null
  const times = failed.flatMap(load => load.last === null ? [] : [load.last.at])
  return { at: times.length === 0 ? null : Math.min(...times) }
}

/**
 * The data a load can show: the ready data, or the last data of a failure.
 * @param load - the load.
 * @returns the data with its time, or null when there is none.
 */
export function shownData<T>(load: Load<T>): Dated<T> | null {
  if (load.phase === 'ready') return { data: load.data, at: load.at }
  return load.phase === 'failed' ? load.last : null
}
