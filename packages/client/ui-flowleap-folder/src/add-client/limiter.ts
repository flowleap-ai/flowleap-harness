/**
 * The one request limiter of this plugin's EP Register reads. The firm docket, the opponent index and Add client
 * all read through the firm's one EPO OPS account, so they share one budget of `opsRequestsPerMinute`: at most that
 * many requests in any 60 s. Callers wait in the order they asked. The docket reads one request at a time, so a live
 * read of a page waits for at most one docket request before its own turn.
 * @module
 */

import type { EpApplicationNumber, EpPublicationNumber, PatentData } from '@deepseek-ai/dsh-flowleap-connectors'

/** The clock of the limiter and of the firm docket. */
export interface Clock {
  /**
   * The time now.
   * @returns milliseconds since the epoch.
   */
  now(): number
  /**
   * Run a callback once after a delay.
   * @param ms - the delay; a negative delay runs it at the next turn.
   * @param callback - what to run.
   * @returns cancels the callback when it has not run.
   */
  timer(ms: number, callback: () => void): () => void
}

/** The longest delay of one `setTimeout`; a longer delay fires at once in Node. */
const MAX_TIMEOUT_MS = 2 ** 31 - 1

/** The system clock. A delay longer than one `setTimeout` allows runs as several timeouts. */
export const systemClock: Clock = {
  now: () => Date.now(),
  timer(ms, callback) {
    let handle: NodeJS.Timeout
    const arm = (left: number): void => {
      handle = setTimeout(() => {
        if (left > MAX_TIMEOUT_MS) arm(left - MAX_TIMEOUT_MS)
        else callback()
      }, Math.max(0, Math.min(left, MAX_TIMEOUT_MS)))
    }
    arm(ms)
    return () => { clearTimeout(handle) }
  },
}

/**
 * Wait on a clock.
 * @param clock - the clock.
 * @param ms - the delay.
 * @param signal - stops the wait.
 * @returns once the delay is over.
 * @throws the reason of `signal` when it aborts first.
 */
export function sleep(clock: Clock, ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(signal.reason as Error)
      return
    }
    const onAbort = (): void => {
      cancel()
      reject(signal?.reason as Error)
    }
    const cancel = clock.timer(ms, () => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    })
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** One minute: the window of `opsRequestsPerMinute`. */
const WINDOW_MS = 60_000

/** A budget of requests per minute, shared by every caller. */
export class RequestLimiter {
  /** The times of the grants in the last window, oldest first; one entry for each request. */
  private readonly grants: number[] = []
  private queue: Promise<void> = Promise.resolve()

  /**
   * @param perMinute - the most requests in any 60 s.
   * @param clock - the clock of the window.
   */
  constructor(private readonly perMinute: number, private readonly clock: Clock) {}

  /**
   * Wait for a turn that may send `requests` requests. A call that needs more requests than one minute allows takes a
   * whole minute's budget.
   * @param requests - the most requests that the caller sends in this turn.
   * @param signal - stops the wait; the turn then goes to the next caller.
   * @returns once the caller may send.
   * @throws the reason of `signal` when it aborts first.
   */
  acquire(requests: number, signal?: AbortSignal): Promise<void> {
    const turn = this.queue.then(() => this.wait(Math.min(requests, this.perMinute), signal))
    this.queue = turn.catch(() => undefined)
    return turn
  }

  private async wait(requests: number, signal: AbortSignal | undefined): Promise<void> {
    for (;;) {
      signal?.throwIfAborted()
      const now = this.clock.now()
      while ((this.grants[0] ?? Infinity) <= now - WINDOW_MS) this.grants.shift()
      const over = this.grants.length + requests - this.perMinute
      if (over <= 0) {
        for (let count = 0; count < requests; count += 1) this.grants.push(now)
        return
      }
      // `requests` is at most `perMinute`, so `over` is at most the grants: the turn comes when the `over` oldest leave.
      await sleep(this.clock, (this.grants[over - 1] as number) + WINDOW_MS - now, signal)
    }
  }
}

/** The rows of one register page; `findApplicantNames` reads pages of this size. */
const PAGE_ROWS = 100

/**
 * The most OPS requests of one call of each read, so the limiter can grant them before the call. A publication read
 * takes the bibliography, the abstract and the claims, and for a Euro-PCT application the WO family, abstract and
 * claims.
 */
const REQUESTS = { registerRecord: 1, searchRegister: 1, family: 2, publication: 6 } as const

/**
 * The patent data Service with every read behind a limiter.
 * @param data - the Service.
 * @param limiter - the shared limiter.
 * @returns a Service that waits for its turn before each read.
 */
export function limitedPatentData(data: PatentData, limiter: RequestLimiter): PatentData {
  return {
    async findApplicantNames(name: string, options: { readonly maxRows: number }, signal?: AbortSignal) {
      await limiter.acquire(Math.max(1, Math.ceil(options.maxRows / PAGE_ROWS)), signal)
      return data.findApplicantNames(name, options, signal)
    },
    async searchRegister(query: string, range: { readonly begin: number; readonly end: number }, signal?: AbortSignal) {
      await limiter.acquire(REQUESTS.searchRegister, signal)
      return data.searchRegister(query, range, signal)
    },
    async registerRecord(application: EpApplicationNumber, signal?: AbortSignal) {
      await limiter.acquire(REQUESTS.registerRecord, signal)
      return data.registerRecord(application, signal)
    },
    async family(application: EpApplicationNumber, signal?: AbortSignal) {
      await limiter.acquire(REQUESTS.family, signal)
      return data.family(application, signal)
    },
    async publication(publication: EpPublicationNumber, signal?: AbortSignal) {
      await limiter.acquire(REQUESTS.publication, signal)
      return data.publication(publication, signal)
    },
  }
}
