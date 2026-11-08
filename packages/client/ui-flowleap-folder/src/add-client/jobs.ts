/**
 * The build jobs of Add client. A build is a person's act on a page, not a Session's work, so `ctx.jobs` (Session-owned)
 * does not fit; until a job that a person's act owns exists upstream, the plugin runs the build itself. The `build`
 * route starts a job and answers at once; the job goes on after the request ends, and the `status` route reports each
 * step from the job's status file, so the person can leave the page and come back. One job runs for each client at a
 * time. A status file that says `running` with no job in this process is a job that a Host stop ended: it reads as
 * `interrupted`, and a new build runs it again, which adds only what is missing.
 * @module
 */

import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { BUILD_STEPS, type BuildStatus, type BuildStep, type BuildStepId } from './wire.ts'

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
  note(facts: Partial<Pick<BuildStatus, 'workspace' | 'folder' | 'families' | 'matters'>>): Promise<void>
}

/**
 * The message of a thrown value, for the Host log.
 * @param error - the thrown value.
 * @returns its message, or its text when it is not an `Error`.
 */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** The work of one build. */
export type BuildWork = (job: BuildJob) => Promise<void>

/** A step that has not started. */
function waiting(): BuildStep {
  return { state: 'waiting', done: 0, total: 0, failed: [] }
}

/** Every step, from a function of the step id. */
function eachStep(of: (id: BuildStepId) => BuildStep): Record<BuildStepId, BuildStep> {
  return Object.fromEntries(BUILD_STEPS.map(id => [id, of(id)])) as Record<BuildStepId, BuildStep>
}

/**
 * Whether a stored value is a build status.
 * @param value - a value read from a status file.
 * @returns true for a status with a client id, a state and every step.
 */
export function isBuildStatus(value: unknown): value is BuildStatus {
  if (typeof value !== 'object' || value === null) return false
  const { clientId, state, steps } = value as Record<string, unknown>
  return typeof clientId === 'string' && typeof state === 'string' && typeof steps === 'object' && steps !== null
    && BUILD_STEPS.every(step => step in steps)
}

/** One job that runs in this process. */
interface Running {
  status: BuildStatus
  done: Promise<void>
}

/** The build jobs of all clients, with one status file each in the folder `dir`. */
export class BuildJobs {
  private readonly running = new Map<string, Running>()
  private readonly writes = new Map<string, Promise<unknown>>()
  private readonly stop = new AbortController()

  /**
   * @param dir - the folder of the status files.
   * @param now - the clock of the statuses.
   * @param log - reports a job's unexpected fault; the status says `failed`.
   */
  constructor(private readonly dir: string, private readonly now: () => Date, private readonly log: (message: string) => void) {}

  /**
   * Start the build of a client, unless one runs now. The work runs after this returns and after the request ends.
   * @param clientId - the client.
   * @param name - the client's name, which the Clients list shows while the build runs.
   * @param work - the build.
   * @returns the status of the job that runs now.
   * @throws Error when the jobs are stopped.
   */
  async start(clientId: string, name: string, work: BuildWork): Promise<BuildStatus> {
    const current = this.running.get(clientId)
    if (current !== undefined) return current.status
    if (this.stop.signal.aborted) throw new Error('the build jobs are stopped')
    const entry: Running = {
      status: { clientId, name, state: 'running', startedAt: this.now().toISOString(), families: 0, matters: 0, steps: eachStep(waiting) },
      done: Promise.resolve(),
    }
    this.running.set(clientId, entry)
    await this.save(entry.status)
    entry.done = this.run(entry, work)
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

  /** Run one job and record how it ended. */
  private async run(entry: Running, work: BuildWork): Promise<void> {
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
      note: facts => update(status => ({ ...status, ...facts })),
    }
    let ended: BuildStatus['state']
    try {
      await work(job)
      ended = BUILD_STEPS.some(id => entry.status.steps[id].state === 'failed') ? 'failed' : 'done'
    } catch (error: unknown) {
      ended = this.stop.signal.aborted ? 'interrupted' : 'failed'
      if (ended === 'failed') this.log(`ui-flowleap-folder: build of ${entry.status.clientId}: ${messageOf(error)}`)
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
    this.running.delete(final.clientId)
  }

  /** A stored status as it is now: `running` with no job in this process is `interrupted`. */
  private live(status: BuildStatus): BuildStatus {
    if (status.state !== 'running' || this.running.has(status.clientId)) return status
    return { ...status, state: 'interrupted' }
  }

  /** Read one status file. */
  private async read(file: string): Promise<BuildStatus | undefined> {
    try {
      const value: unknown = JSON.parse(await readFile(file, 'utf8'))
      return isBuildStatus(value) ? value : undefined
    } catch (_error: unknown) {
      // No file, or a damaged one: no status to show; the next build writes a new one.
      return undefined
    }
  }

  /** Write one status after the earlier writes of the same client, through a renamed file. */
  private save(status: BuildStatus): Promise<void> {
    const before = this.writes.get(status.clientId) ?? Promise.resolve()
    const next = before.catch(() => undefined).then(async () => {
      const file = this.fileOf(status.clientId)
      await mkdir(this.dir, { recursive: true })
      const temporary = `${file}.${process.pid}.tmp`
      await writeFile(temporary, `${JSON.stringify(status, null, 2)}\n`, 'utf8')
      await rename(temporary, file)
    })
    this.writes.set(status.clientId, next)
    return next
  }

  /** The status file of one client; the id is a UUID, so it is a plain file name. */
  private fileOf(clientId: string): string {
    return path.join(this.dir, `${encodeURIComponent(clientId)}.json`)
  }
}
