/**
 * The run Session of a work item as a client resource (`dsh-resource://recordsrun/session/<id>`). While a view reads
 * the address, the provider holds one reference to the Session in this runtime; the work page's agent panel shows
 * its conversation. A Session that the Session list of this runtime does not have is `missing`, and it becomes
 * `ready` when the list gets it.
 */

import type { ISessions, SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ResourceProvider } from '@deepseek-ai/dsh-client-resources/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { RunSessionId } from './api.ts'

/** The run Session as the agent panel reads it. */
export type RunSession =
  /** This runtime has the Session; the reference holds it while the panel shows it. */
  | { readonly kind: 'ready'; readonly reference: SessionReference }
  /** The Session list of this runtime has no Session with this id. */
  | { readonly kind: 'missing' }

declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface SessionReferenceSourceMap {
    /** The agent panel of a work item in the Matters panel. */
    recordsRun: unknown
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface ResourceProtocolMap {
    recordsrun: RunSession
  }
}

const PREFIX = 'dsh-resource://recordsrun/session/'
const MISSING: RunSession = { kind: 'missing' }

/**
 * The resource address of a run Session.
 * @param id - the run Session.
 * @returns the address.
 */
export function runSessionAddress(id: RunSessionId): string {
  return `${PREFIX}${encodeURIComponent(id)}`
}

/**
 * The Session id of a run Session address.
 * @param address - the address.
 * @returns the id, or undefined for another address.
 */
function sessionOf(address: string): SessionId | undefined {
  if (!address.startsWith(PREFIX)) return undefined
  try {
    const id = decodeURIComponent(address.slice(PREFIX.length))
    return id === '' ? undefined : id as SessionId
  } catch (_malformed: unknown) {
    // A broken percent escape names no Session.
    return undefined
  }
}

/**
 * Wait for the next change of the Session list, or for the abort.
 * @param sessions - the Sessions service.
 * @param signal - ends the wait.
 * @returns when the list changes or the signal aborts.
 */
function nextChange(sessions: ISessions, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve()
  return new Promise((resolve) => {
    const stop = sessions.list.subscribe(() => { done() })
    const done = () => {
      stop()
      signal.removeEventListener('abort', done)
      resolve()
    }
    signal.addEventListener('abort', done, { once: true })
  })
}

/**
 * Wait for the abort of a signal.
 * @param signal - the signal.
 * @returns when it aborts.
 */
function aborted(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve()
  return new Promise((resolve) => { signal.addEventListener('abort', () => { resolve() }, { once: true }) })
}

/**
 * The provider of the run Session resources.
 * @param sessions - the Sessions service of this runtime.
 * @returns the provider.
 */
export function runSessionProvider(sessions: ISessions): ResourceProvider<'recordsrun'> {
  return {
    protocol: 'recordsrun',
    async *open(address, { signal }) {
      const id = sessionOf(address)
      if (id === undefined) {
        yield { ok: true, value: MISSING }
        return
      }
      let missing = false
      for (;;) {
        const list = sessions.list.getSnapshot()
        if (id in list.byId) break
        if (list.phase === 'ready' && !missing) {
          missing = true
          yield { ok: true, value: MISSING }
        }
        await nextChange(sessions, signal)
        if (signal.aborted) return
      }
      const reference = sessions.retain(id, { source: 'recordsRun', signal })
      try {
        yield { ok: true, value: { kind: 'ready', reference } }
        await aborted(signal)
      } finally {
        reference.release()
      }
    },
  }
}
