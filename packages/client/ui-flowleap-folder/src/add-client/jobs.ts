/**
 * The build jobs of Add client. A build is a person's act on a page, not a Session's work, so `ctx.jobs` (Session-owned)
 * does not fit; until a job that a person's act owns exists upstream, the plugin runs the build itself. The `build`
 * route starts a job and answers at once; the job goes on after the request ends, and the `status` route reports each
 * step from the job's status file, so the person can leave the page and come back. One job runs for each client at a
 * time; a request for a client whose job runs makes that job run once more when it ends, with both requests widened
 * into one, so no request is lost and the page never sees `done` before the last run ends. A status file that says
 * `running` with no job in this process is a job that a Host stop ended: it reads as `interrupted`, and a new build
 * runs it again, which adds only what is missing.
 * @module
 */

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { BUILD_STEPS, type BuildAdded, type BuildStatus, type BuildStep, type BuildStepId } from './wire.ts'

/** What a running build reports. */
export interface BuildJob {
  /** Aborts when the plugin stops; the work stops at its next read or write. */
  readonly signal: AbortSignal
  /**
   * Start a step.
   * @param step - the step.
   * @param total - how many items the step has.
   */
  start(step: BuildStepId, total: number): Promise<void>
  /**
   * Count one item of a step as done.
   * @param step - the step.
   */
  advance(step: BuildStepId): Promise<void>
  /**
   * Count one item of a step as failed.
   * @param step - the step.
   * @param item - what failed, such as a publication number; the page names it.
   */
  fail(step: BuildStepId, item: string): Promise<void>
  /**
   * End a step: `failed` when an item failed, else `done`.
   * @param step - the step.
   */
  finish(step: BuildStepId): Promise<void>
  /**
   * Record facts that the page shows, such as the workspace of the client folder.
   * @param facts - the facts.
   */
  note(facts: Partial<Pick<BuildStatus, 'workspace' | 'folder' | 'families' | 'matters' | 'added'>>): Promise<void>
}

/**
 * The message of a thrown value, for the Host log.
 * @param error - the thrown value.
 * @returns its message, or its text when it is not an `Error`.
 */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * The work of one build.
 * @param job - reports each step.
 * @param request - what to build.
 */
export type BuildWork<R> = (job: BuildJob, request: R) => Promise<void>

/** `start` was called after the jobs stopped: the plugin is stopping. */
export class BuildJobsStopped extends Error {
  override readonly name = 'BuildJobsStopped'

  constructor() {
    super('the build jobs are stopped')
  }
}

/** A step that has not started. */
function waiting(): BuildStep {
  return { state: 'waiting', done: 0, total: 0, failed: [] }
}

/** Every step, from a function of the step id. */
function eachStep(of: (id: BuildStepId) => BuildStep): Record<BuildStepId, BuildStep> {
  return Object.fromEntries(BUILD_STEPS.map(id => [id, of(id)])) as Record<BuildStepId, BuildStep>
}

/** What a build made when it made nothing. */
const NOTHING_ADDED: BuildAdded = { client: false, families: 0, matters: 0, files: 0 }

/**
 * Read a stored build status.
 * @param value - a value read from a status file.
 * @returns the status when it has a client id, a state and every step; a status file from before the counts of what a
 *   build made counts nothing, and one with damaged counts is no status.
 */
export function parseBuildStatus(value: unknown): BuildStatus | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { clientId, state, steps, added } = value as Record<string, unknown>
  if (typeof clientId !== 'string' || typeof state !== 'string' || typeof steps !== 'object' || steps === null
    || !BUILD_STEPS.every(step => step in steps)) return undefined
  if (added === undefined) return { ...value as BuildStatus, added: NOTHING_ADDED }
  const counts = added as Record<string, unknown> | null
  const valid = typeof counts === 'object' && counts !== null && typeof counts['client'] === 'boolean'
    && (['families', 'matters', 'files'] as const).every(count => typeof counts[count] === 'number')
  return valid ? value as BuildStatus : undefined
}

/** The counts of two runs of one build together. */
function plus(a: BuildAdded, b: BuildAdded): BuildAdded {
  return { client: a.client || b.client, families: a.families + b.families, matters: a.matters + b.matters, files: a.files + b.files }
}

/** One run of a build: the client's name, the request and the work. */
interface Run<R> {
  readonly name: string
  readonly request: R
  readonly work: BuildWork<R>
}

/** One job that runs in this process. */
interface Running<R> {
  status: BuildStatus
  done: Promise<void>
  run: Run<R>
  /** The widened request of each `start` while the job ran; the job runs once more with it. */
  again: Run<R> | null
}

/** The build jobs of all clients, with one status file each in the folder `dir`. */
export class BuildJobs<R> {
  private readonly running = new Map<string, Running<R>>()
  /** The last status of each job that ended in this process; it is newer than a status file read while the job ran. */
  private readonly ended = new Map<string, BuildStatus>()
  private readonly writes = new Map<string, Promise<unknown>>()
  private readonly stop = new AbortController()

  /**
   * @param dir - the folder of the status files.
   * @param now - the clock of the statuses.
   * @param log - reports a job's unexpected fault; the status says `failed`.
   * @param widen - one request that does the work of two: the request of the job and the request that came while it ran.
   */
  constructor(
    private readonly dir: string,
    private readonly now: () => Date,
    private readonly log: (message: string) => void,
    private readonly widen: (running: R, next: R) => R,
  ) {}

  /**
   * Start the build of a client. When a job runs for the client now, the job runs once more when it ends, with the
   * request of the job widened by this request. The work runs after this returns and after the request ends.
   * @param clientId - the client.
   * @param name - the client's name, which the Clients list shows while the build runs.
   * @param request - what to build.
   * @param work - the build.
   * @returns the status of the job that runs now.
   * @throws BuildJobsStopped when the jobs are stopped; the error of the first status write when it fails, and then no
   *   job runs.
   */
  async start(clientId: string, name: string, request: R, work: BuildWork<R>): Promise<BuildStatus> {
    const current = this.running.get(clientId)
    if (current !== undefined) {
      current.again = { name, request: this.widen((current.again ?? current.run).request, request), work }
      return current.status
    }
    if (this.stop.signal.aborted) throw new BuildJobsStopped()
    const entry: Running<R> = { status: this.fresh(clientId, name), done: Promise.resolve(), run: { name, request, work }, again: null }
    this.running.set(clientId, entry)
    try {
      await this.save(entry.status)
    } catch (error: unknown) {
      // No job runs without its status file, so the next request starts it again.
      this.running.delete(clientId)
      throw error
    }
    entry.done = this.run(entry)
    return entry.status
  }

  /**
   * The status of every build that this plugin ran.
   * @returns the statuses; a job that a Host stop ended reads as `interrupted`.
   */
  async all(): Promise<BuildStatus[]> {
    let names: string[]
    try {
      names = await readdir(this.dir)
    } catch (_error: unknown) {
      // No status folder yet: no build ran.
      return []
    }
    const statuses = await Promise.all(names.filter(file => file.endsWith('.json')).map(file => this.read(path.join(this.dir, file))))
    return statuses.filter((status): status is BuildStatus => status !== undefined).map(status => this.live(status))
  }

  /**
   * The status of one client's build.
   * @param clientId - the client.
   * @returns the status, or undefined when no build ran.
   */
  async get(clientId: string): Promise<BuildStatus | undefined> {
    const running = this.running.get(clientId)
    if (running !== undefined) return running.status
    const status = await this.read(this.fileOf(clientId))
    return status === undefined ? undefined : this.live(status)
  }

  /**
   * Stop every job: their work stops at its next read or write, and their status says `interrupted`.
   * @returns once every job ended and its status is on disk.
   */
  async dispose(): Promise<void> {
    this.stop.abort()
    await Promise.all([...this.running.values()].map(entry => entry.done))
  }

  /** Run one job, and once more for each request that came while it ran, then record how it ended. */
  private async run(entry: Running<R>): Promise<void> {
    let ended = await this.once(entry)
    for (let again = entry.again; again !== null && !this.stop.signal.aborted; again = entry.again) {
      entry.again = null
      entry.run = again
      entry.status = { ...this.fresh(entry.status.clientId, again.name), added: entry.status.added }
      try {
        await this.save(entry.status)
      } catch (error: unknown) {
        this.log(`ui-flowleap-folder: build status of ${entry.status.clientId}: ${messageOf(error)}`)
      }
      ended = await this.once(entry)
    }
    // A step that a fault or a stop cut keeps its counts and shows as failed, so Try again runs it again.
    const status = entry.status
    const final: BuildStatus = {
      ...status,
      state: ended,
      finishedAt: this.now().toISOString(),
      steps: eachStep(id => status.steps[id].state === 'running' ? { ...status.steps[id], state: 'failed' } : status.steps[id]),
    }
    // The end shows only once it is on disk, so a reader that sees it never sees an older file after it.
    try {
      await this.save(final)
    } catch (error: unknown) {
      this.log(`ui-flowleap-folder: build status of ${final.clientId}: ${messageOf(error)}`)
    }
    entry.status = final
    this.ended.set(final.clientId, final)
    this.running.delete(final.clientId)
  }

  /** Run the work of a job once. */
  private async once(entry: Running<R>): Promise<BuildStatus['state']> {
    // A run again counts on from what the earlier run made, so the end reports both runs.
    const before = entry.status.added
    const update = async (change: (status: BuildStatus) => BuildStatus): Promise<void> => {
      entry.status = change(entry.status)
      await this.save(entry.status)
    }
    const step = (id: BuildStepId, change: (current: BuildStep) => BuildStep) =>
      update(status => ({ ...status, steps: { ...status.steps, [id]: change(status.steps[id]) } }))
    const job: BuildJob = {
      signal: this.stop.signal,
      start: (id, total) => step(id, () => ({ state: 'running', done: 0, total, failed: [] })),
      advance: id => step(id, current => ({ ...current, done: current.done + 1 })),
      fail: (id, item) => step(id, current => ({ ...current, failed: [...current.failed, item] })),
      finish: id => step(id, current => ({ ...current, state: current.failed.length > 0 ? 'failed' : 'done' })),
      note: facts => update(status => ({ ...status, ...facts, ...facts.added === undefined ? {} : { added: plus(before, facts.added) } })),
    }
    try {
      await entry.run.work(job, entry.run.request)
      return BUILD_STEPS.some(id => entry.status.steps[id].state === 'failed') ? 'failed' : 'done'
    } catch (error: unknown) {
      if (this.stop.signal.aborted) return 'interrupted'
      this.log(`ui-flowleap-folder: build of ${entry.status.clientId}: ${messageOf(error)}`)
      return 'failed'
    }
  }

  /** The status of a job that starts now. */
  private fresh(clientId: string, name: string): BuildStatus {
    return { clientId, name, state: 'running', startedAt: this.now().toISOString(), families: 0, matters: 0, added: NOTHING_ADDED, steps: eachStep(waiting) }
  }

  /**
   * A stored status as it is now: the status of this process's job when there is one, else `running` with no job in
   * this process is `interrupted`.
   */
  private live(status: BuildStatus): BuildStatus {
    const own = this.running.get(status.clientId)?.status ?? this.ended.get(status.clientId)
    if (own !== undefined) return own
    return status.state === 'running' ? { ...status, state: 'interrupted' } : status
  }

  /** Read one status file. */
  private async read(file: string): Promise<BuildStatus | undefined> {
    try {
      const value: unknown = JSON.parse(await readFile(file, 'utf8'))
      return parseBuildStatus(value)
    } catch (_error: unknown) {
      // No file, or a damaged one: no status to show; the next build writes a new one.
      return undefined
    }
  }

  /**
   * Write one status after the earlier writes of the same client, through a renamed file. On Windows the rename can
   * meet a `status` read that holds the file open; `writeFileAtomic` tries it again.
   */
  private save(status: BuildStatus): Promise<void> {
    const before = this.writes.get(status.clientId) ?? Promise.resolve()
    const next = before.catch(() => undefined).then(() =>
      writeFileAtomic(this.fileOf(status.clientId), `${JSON.stringify(status, null, 2)}\n`, { mode: 0o600 }))
    this.writes.set(status.clientId, next)
    return next
  }

  /** The status file of one client; the id is a UUID, so it is a plain file name. */
  private fileOf(clientId: string): string {
    return path.join(this.dir, `${encodeURIComponent(clientId)}.json`)
  }
}
