/**
 * Register watches over scheduled tasks: the baseline read when a watch starts,
 * the `schedule/admit` decision at each due run, and the seen-entry commit after
 * `schedule/delivered`.
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import type { RegisterApplication, RegisterSource } from '@deepseek-ai/dsh-flowleap-connectors'
import type { ScheduleAdmission, ScheduleAdmissionRequest, ScheduleDelivered } from '@deepseek-ai/dsh-schedule'
import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import type { ReadRecord, routinesDomain, TaskId, WatchRecord } from './storage.ts'
import {
  mergeSeen, newEntries, renderRunInstruction, type RegisterFailure, type RegisterFailureClass, type RegisterReport, type RunTextBounds,
} from './watch.ts'

/** One application's read. */
export interface ApplicationRead {
  /** Watched application. */
  readonly application: RegisterApplication
  /** The read in use. */
  readonly read: ReadRecord
}

/** The baseline of one application when a watch starts. */
export interface WatchBaseline {
  /** Watched application. */
  readonly application: RegisterApplication
  /** Number of entries the register lists now; none of them is reported. */
  readonly entries: number
}

/** What one watch store needs besides its domain and reader. */
export interface RegisterWatchOptions {
  /** Shortest time between two reads of one application. */
  readonly minReadIntervalMs: number
  /** Longest time all register reads of one run, or of one watch creation, may take. */
  readonly readDeadlineMs: number
  /** Most events and characters one run receives. */
  readonly bounds: RunTextBounds
}

/** Most characters of a failed read's message in the log. */
const MAX_LOGGED_MESSAGE = 500

/**
 * The class and the log text of a failed read.
 * @param error - what the read rejected with.
 * @param signal - the read's signal; an aborted one means the deadline or the stop ended the read.
 * @returns the class the model reads and the cut message the log keeps.
 */
export function classifyFailure(error: unknown, signal: AbortSignal): { failure: RegisterFailureClass; message: string } {
  const message = error instanceof Error ? error.message : String(error)
  return { failure: signal.aborted ? 'timeout' : 'read_failed', message: message.slice(0, MAX_LOGGED_MESSAGE) }
}

/**
 * A signal aborted by `parent` or after `ms`; the caller disposes the timer.
 * @param parent - the caller's signal.
 * @param ms - the deadline.
 * @returns the signal and its disposer.
 */
export function deadlineSignal(parent: AbortSignal, ms: number): { signal: AbortSignal; dispose: () => void } {
  const deadline = new AbortController()
  const timer = setTimeout(() => { deadline.abort(new Error('register read deadline passed')) }, ms)
  return { signal: AbortSignal.any([parent, deadline.signal]), dispose: () => { clearTimeout(timer) } }
}

/**
 * Settle with `work`, or reject when `signal` aborts first, so a reader that ignores its signal still ends at the deadline.
 * @param work - the read.
 * @param signal - the read's signal.
 * @returns what `work` returns.
 */
function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => { reject(signal.reason) }
    if (signal.aborted) abort()
    signal.addEventListener('abort', abort, { once: true })
    work.then(resolve, reject).finally(() => { signal.removeEventListener('abort', abort) })
  })
}

/** Owns the watch rows, the reads shared across watches, and the seen entries a pending delivery commits. */
export class RegisterWatches {
  /** The watch rows a delivery saves after it commits, per task. */
  private readonly pending = new Map<string, WatchRecord>()
  /** Orders watch starts, delivery commits, and prunes, so a prune never races a newer watch or a pending commit. */
  private chain: Promise<unknown> = Promise.resolve()

  /**
   * @param domain - the `flowleap_routines` domain while it opens; every operation waits for it.
   * @param source - register reader.
   * @param options - read interval, read deadline, and run text bounds.
   * @param logger - plugin logger for failed reads.
   */
  constructor(
    private readonly domain: Promise<Domain<typeof routinesDomain>>,
    private readonly source: RegisterSource,
    private readonly options: RegisterWatchOptions,
    private readonly logger: Context['logger'],
  ) {}

  /**
   * Read each application once for a new watch, within the read deadline.
   * @param applications - normalized applications.
   * @param signal - caller cancellation.
   * @returns the read per application, in order, saved as the latest reads; or the first failed application and its class.
   */
  async baseline(
    applications: readonly RegisterApplication[], signal: AbortSignal,
  ): Promise<ApplicationRead[] | { application: RegisterApplication; failure: RegisterFailureClass }> {
    const deadline = deadlineSignal(signal, this.options.readDeadlineMs)
    try {
      const reads: ApplicationRead[] = []
      for (const application of applications) {
        try {
          reads.push({ application, read: await this.read(application, deadline.signal) })
        } catch (error: unknown) {
          const { failure, message } = classifyFailure(error, deadline.signal)
          this.logger.warn(`register watch: ${application} not read: ${message}`)
          return { application, failure }
        }
      }
      return reads
    } finally {
      deadline.dispose()
    }
  }

  /**
   * Save a watch whose current entries count as seen.
   * @param id - the scheduled task that runs the watch.
   * @param reads - the baseline reads.
   * @returns the baseline per application.
   */
  async start(id: TaskId, reads: readonly ApplicationRead[]): Promise<WatchBaseline[]> {
    const watch: WatchRecord = {
      applications: reads.map(({ application, read }) => ({ application, seen: mergeSeen({}, read.entries) })),
    }
    const domain = await this.domain
    await this.serialize(() => domain.table('watches').put(id, watch))
    return reads.map(({ application, read }) => ({ application, entries: read.entries.length }))
  }

  /**
   * Decide one due occurrence after the later listeners: a skip stays a skip; a delivery of a watch task gets the new entries
   * after its prompt, or becomes a skip when none is new. Tasks without a watch keep the later decision.
   * All reads of one run share the read deadline and stop with the Schedule runtime. A failed read does not stop the run;
   * without a new entry it is logged and the run is skipped.
   * @param request - due occurrence.
   * @param next - the later admission listeners.
   * @returns the admission.
   */
  async admit(request: ScheduleAdmissionRequest, next: () => Promise<ScheduleAdmission>): Promise<ScheduleAdmission> {
    const later = await next()
    const watch = (await this.domain).table('watches').get(request.record.id)
    if (watch === undefined || later.kind === 'skip') return later
    const deadline = deadlineSignal(request.signal, this.options.readDeadlineMs)
    const reports: RegisterReport[] = []
    const failures: RegisterFailure[] = []
    const applications: WatchRecord['applications'] = []
    try {
      for (const watched of watch.applications) {
        let read: ReadRecord
        try {
          read = await this.read(watched.application, deadline.signal)
        } catch (error: unknown) {
          const { failure, message } = classifyFailure(error, deadline.signal)
          this.logger.warn(`register watch ${request.record.id}: ${watched.application} not read: ${message}`)
          failures.push({ application: watched.application, failure })
          applications.push(watched)
          continue
        }
        const entries = newEntries(read.entries, watched.seen)
        if (entries.length > 0) reports.push({ application: watched.application, entries })
        applications.push({ application: watched.application, seen: mergeSeen(watched.seen, read.entries) })
      }
    } finally {
      deadline.dispose()
    }
    if (reports.length === 0) return { kind: 'skip' }
    this.pending.set(request.record.id, { applications })
    return { kind: 'deliver', prompt: renderRunInstruction(later.prompt, reports, failures, this.options.bounds) }
  }

  /**
   * Save the seen entries a committed delivery reported; a delivery without a pending watch row saves nothing.
   * @param delivery - the committed delivery.
   */
  async delivered(delivery: ScheduleDelivered): Promise<void> {
    const domain = await this.domain
    await this.serialize(async () => {
      const watch = this.pending.get(delivery.id)
      if (watch === undefined) return
      this.pending.delete(delivery.id)
      await domain.table('watches').put(delivery.id, watch)
    })
  }

  /**
   * Remove watches whose task no longer exists, with their pending rows and the reads no remaining watch names.
   * @param readTasks - reads the ids of every stored task inside the queue.
   */
  async prune(readTasks: () => Promise<ReadonlySet<string>>): Promise<void> {
    const domain = await this.domain
    await this.serialize(async () => {
      const tasks = await readTasks()
      const watches = domain.table('watches')
      const gone = [...watches.entries()].filter(([id]) => !tasks.has(id))
      if (gone.length === 0) return
      for (const [id] of gone) this.pending.delete(id)
      await watches.deleteMany(gone.map(([id]) => id))
      // Only reads of removed watches go: a read saved for a watch that is still starting has no watch row yet.
      const named = new Set([...watches.entries()].flatMap(([, watch]) => watch.applications.map(({ application }) => application)))
      const unused = [...new Set(gone.flatMap(([, watch]) => watch.applications.map(({ application }) => application)))]
        .filter(application => !named.has(application))
      await domain.table('reads').deleteMany(unused)
    })
  }

  private serialize<T>(work: () => Promise<T>): Promise<T> {
    const pending = this.chain.then(work)
    this.chain = pending.catch(() => undefined) // The caller receives the failure; the queue continues.
    return pending
  }

  /**
   * The latest read of one application: the saved one while it is newer than the minimum interval, otherwise a new read.
   * @param application - watched application.
   * @param signal - caller cancellation.
   * @returns the read in use.
   */
  private async read(application: RegisterApplication, signal: AbortSignal): Promise<ReadRecord> {
    const reads = (await this.domain).table('reads')
    const saved = reads.get(application)
    const now = Date.now()
    if (saved !== undefined && now - Date.parse(saved.readAt) < this.options.minReadIntervalMs) return saved
    const entries = await untilAborted(this.source.read(application, signal), signal)
    const read: ReadRecord = { readAt: new Date(now).toISOString(), entries: [...entries] }
    await reads.put(application, read)
    return read
  }
}
