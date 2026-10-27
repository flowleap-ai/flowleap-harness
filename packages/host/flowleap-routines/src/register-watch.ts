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
import { mergeSeen, newEntries, renderRunInstruction, type RegisterFailure, type RegisterReport } from './watch.ts'

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

/**
 * The message of a failed read.
 * @param error - what the read rejected with.
 * @returns the error message, or the value as text.
 */
export function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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
   * @param minReadIntervalMs - shortest time between two reads of one application.
   * @param logger - plugin logger for failed reads at a due run.
   */
  constructor(
    private readonly domain: Promise<Domain<typeof routinesDomain>>,
    private readonly source: RegisterSource,
    private readonly minReadIntervalMs: number,
    private readonly logger: Context['logger'],
  ) {}

  /**
   * Read each application once for a new watch; a failed read rejects and starts nothing.
   * @param applications - normalized applications.
   * @param signal - caller cancellation.
   * @returns the read per application, in order, saved as the latest reads.
   */
  async baseline(applications: readonly RegisterApplication[], signal?: AbortSignal): Promise<ApplicationRead[]> {
    const reads: ApplicationRead[] = []
    for (const application of applications) reads.push({ application, read: await this.read(application, signal) })
    return reads
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
   * Decide one due occurrence: deliver the stored instruction with the new entries, or skip when none is new.
   * Tasks without a watch pass to `next`. A failed read does not stop the run; without a new entry it is logged and the run is skipped.
   * @param request - due occurrence.
   * @param next - the next admission listener.
   * @returns the admission.
   */
  async admit(request: ScheduleAdmissionRequest, next: () => Promise<ScheduleAdmission>): Promise<ScheduleAdmission> {
    const watch = (await this.domain).table('watches').get(request.record.id)
    if (watch === undefined) return next()
    const reports: RegisterReport[] = []
    const failures: RegisterFailure[] = []
    const applications: WatchRecord['applications'] = []
    for (const watched of watch.applications) {
      let read: ReadRecord
      try {
        read = await this.read(watched.application)
      } catch (error: unknown) {
        failures.push({ application: watched.application, message: failureMessage(error) })
        applications.push(watched)
        continue
      }
      const entries = newEntries(read.entries, watched.seen)
      if (entries.length > 0) reports.push({ application: watched.application, entries })
      applications.push({ application: watched.application, seen: mergeSeen(watched.seen, read.entries) })
    }
    if (reports.length === 0) {
      for (const failure of failures) {
        this.logger.warn(`register watch ${request.record.id}: ${failure.application} not read: ${failure.message}`)
      }
      return { kind: 'skip' }
    }
    this.pending.set(request.record.id, { applications })
    return { kind: 'deliver', prompt: renderRunInstruction(request.record.prompt, reports, failures) }
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
  private async read(application: RegisterApplication, signal?: AbortSignal): Promise<ReadRecord> {
    const reads = (await this.domain).table('reads')
    const saved = reads.get(application)
    const now = Date.now()
    if (saved !== undefined && now - Date.parse(saved.readAt) < this.minReadIntervalMs) return saved
    const entries = await this.source.read(application, signal)
    const read: ReadRecord = { readAt: new Date(now).toISOString(), entries: [...entries] }
    await reads.put(application, read)
    return read
  }
}
