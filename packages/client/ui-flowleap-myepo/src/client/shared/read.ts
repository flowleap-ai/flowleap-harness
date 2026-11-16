/**
 * What the MyEPO mirror pages share below their components: the state of a list read from the Host, one observable
 * store for a page, and the read itself with its outcomes.
 */

import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'

/**
 * Why a read gave no list: an outcome of the EPO, or, on a firm installation, of the Firm Record. `no-access`: the
 * administrator did not give the MyEPO pages to the person. `not-read`: the firm has no copy of the data yet.
 */
export type EpoFailure =
  | { readonly kind: 'no-access' }
  | { readonly kind: 'not-read' }
  | { readonly kind: 'not-linked' }
  | { readonly kind: 'refused' }
  | { readonly kind: 'unreachable' }
  | { readonly kind: 'failed'; readonly message: string }

/** Why the last read gave no list: an outcome of the EPO, or a failed call to the Host. */
export type ReadFailure = EpoFailure | { readonly kind: 'error'; readonly message: string }

/** The part of a page state that describes its list read. */
export interface ReadSnapshot {
  /** `loading` until the first answer. */
  readonly phase: 'loading' | 'ready'
  /** A list read is crossing the wire. */
  readonly reading: boolean
  /** Why the last read gave no list; `null` after a read that answered. */
  readonly failure: ReadFailure | null
  /** When the last read that answered ended, ISO 8601; `null` before it. */
  readonly readAt: string | null
}

/** A Remote answer. */
export type Answer<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: { readonly message: string } }

/** The state of one page: read it, change it, and observe it. */
export interface PageStore<S> {
  /** @returns the current state. */
  readonly get: () => S
  /** @param change - the fields that change; every observer is told. */
  readonly publish: (change: Partial<S>) => void
  readonly observable: HostObservable<S>
}

/**
 * Create the state of one page. The first observer of a page that has not read its list starts the first read.
 * @param start - the state before the first read.
 * @param firstRead - starts the first list read.
 * @returns the store.
 */
export function createPageStore<S extends ReadSnapshot>(start: S, firstRead: () => void): PageStore<S> {
  let snapshot = start
  const listeners = new Set<() => void>()
  return {
    get: () => snapshot,
    publish: (change) => {
      snapshot = { ...snapshot, ...change }
      listeners.forEach((listener) => { listener() })
    },
    observable: {
      getSnapshot: () => snapshot,
      subscribe: (listener) => {
        listeners.add(listener)
        if (listeners.size === 1 && snapshot.phase === 'loading') firstRead()
        return () => { listeners.delete(listener) }
      },
    },
  }
}

/**
 * Read a list through the Host and record its outcome. A read while another one crosses the wire does nothing. A
 * failed read keeps the list of the last read that answered.
 * @param store - the page state.
 * @param read - the Remote call: the list of a read that answered, or why the EPO gave none.
 * @param onRead - stores the list of a read that answered; the phase, the reading flag and the failure are set for it.
 */
export async function readList<R extends { readonly kind: 'read' }, S extends ReadSnapshot>(
  store: PageStore<S>, read: () => Promise<Answer<R | EpoFailure>>, onRead: (view: R) => void,
): Promise<void> {
  if (store.get().reading) return
  const settle = (failure: ReadFailure | null): void => {
    const change: Partial<ReadSnapshot> = { phase: 'ready', reading: false, failure }
    store.publish(change as Partial<S>)
  }
  const reading: Partial<ReadSnapshot> = { reading: true }
  store.publish(reading as Partial<S>)
  const answer = await read()
  if (!answer.ok) {
    settle({ kind: 'error', message: answer.error.message })
    return
  }
  const view = answer.value
  if (view.kind !== 'read') {
    settle(view)
    return
  }
  settle(null)
  onRead(view)
}

/**
 * A calendar date of MyEPO for a person; the EPO writes it without a time zone.
 * @param locale - the locale of the page, such as `en-GB`.
 * @param date - the ISO calendar date.
 * @returns the date in the medium style of the locale.
 */
export function dateOf(locale: string, date: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(Date.parse(date))
}
