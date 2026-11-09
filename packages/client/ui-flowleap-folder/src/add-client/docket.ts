/**
 * The firm docket: every EP application where the EP Register names the firm as the representative, read on the Host
 * through the patent data Service, kept in one file under `stateDir`, and read again when it is older than
 * `docketRefreshAge`. The read starts when the plugin loads with a firm identity, not at the first Add client, so the
 * firm's queries and a client's queries do not go out together. A read sends one request at a time and stores its
 * progress, so a Host stop loses at most the slices of the last {@link SAVE_INTERVAL_MS}, and the next start reads
 * only the slices that are not on disk. A docket of another identity is dropped; with no identity the file is removed.
 * A new identity ({@link FirmDocket.setIdentity}) stops the read, drops the rows and reads again without a restart.
 * @module
 */

import { readFile, rm } from 'node:fs/promises'
import { PatentDataError, type PatentData } from '@deepseek-ai/dsh-flowleap-connectors'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import {
  PAGE_ROWS, docketRow, docketState, freshDocket, nextUnread, oldestAsOf, retryFailed, sameIdentity, sliceQuery,
  parseDocketFile, splitRange, withSlice, type DocketFile, type DocketRow, type SliceResult, type UnreadSlice,
} from './docket-model.ts'
import { identitySet, sameFirmIdentity, type FirmIdentity } from './identity.ts'
import { messageOf } from './jobs.ts'
import type { Clock } from './limiter.ts'
import type { DocketReadRequest, DocketState } from './wire.ts'

/**
 * The least time between two saves of a running read. A save writes the whole file, which holds every row, so a save
 * after each slice of a large docket would write the file hundreds of times.
 */
export const SAVE_INTERVAL_MS = 30_000

/** What the firm docket uses. */
export interface FirmDocketOptions {
  /** The docket file. */
  readonly file: string
  /** The firm identity at load; {@link FirmDocket.setIdentity} changes it later. */
  readonly identity: Promise<FirmIdentity>
  /** `registerSliceRows`: the most rows of one date slice. */
  readonly sliceRows: number
  /** `docketRefreshAge`, in milliseconds. */
  readonly refreshAge: number
  /** The patent data Service now, behind the shared limiter; undefined while the runtime has none. */
  readonly data: () => PatentData | undefined
  readonly clock: Clock
  /** Reports a fault of the Host, such as a failed save; the person sees the state. */
  readonly log: (message: string) => void
}

/** One read that runs now. */
interface Run {
  readonly controller: AbortController
  readonly done: Promise<void>
}

/** The firm docket of this plugin; one instance owns the docket file. */
export class FirmDocket {
  /** The docket of the identity; undefined while it loads and when the identity names nothing. */
  private docket: DocketFile | undefined
  private identity: FirmIdentity = { names: [], addresses: [], representatives: [] }
  /** The load, then each identity change after it; every act waits for the last one. */
  private loaded: Promise<void>
  private run: Run | undefined
  private cancelTimer: (() => void) | undefined
  private stopped = false
  private lastSave = Number.NEGATIVE_INFINITY

  /**
   * Load the stored docket. Nothing is read until {@link wake}.
   * @param options - the file, the identity, the settings and the Service.
   */
  constructor(private readonly options: FirmDocketOptions) {
    this.loaded = options.identity.then((identity) => {
      this.identity = identity
      return this.load()
    })
  }

  /**
   * Start what the docket needs now: a new read, the rest of an interrupted read, or a read again when the docket is
   * older than the refresh age; else arm the refresh. Nothing starts without the patent data Service or while a read
   * runs.
   * @returns once the docket is loaded and the decision is made.
   */
  async wake(): Promise<void> {
    await this.loaded
    this.begin()
  }

  /**
   * Stop the running read, for example when the patent data Service goes; the unread slices stay for the next
   * {@link wake}.
   * @returns once the read ended and its progress is on disk.
   */
  async pause(): Promise<void> {
    const run = this.run
    run?.controller.abort()
    await run?.done
  }

  /**
   * The state of the docket now.
   * @returns the state.
   */
  async state(): Promise<DocketState> {
    await this.loaded
    if (this.docket === undefined) return { state: 'no_identity' }
    const { clock, refreshAge } = this.options
    return docketState(this.docket, { reading: this.run !== undefined, now: clock.now(), refreshAge })
  }

  /**
   * Read the docket again: every slice, or only the failed slices and the queries whose slices did not sum to their
   * count. While a read runs, nothing changes.
   * @param slices - which slices.
   * @returns the state after the read started.
   */
  async readAgain(slices: DocketReadRequest['slices']): Promise<DocketState> {
    await this.loaded
    const docket = this.docket
    if (docket !== undefined && this.run === undefined && this.options.data() !== undefined) {
      this.docket = slices === 'all' ? this.fresh() : retryFailed(docket)
      this.begin()
    }
    return this.state()
  }

  /**
   * Take a new firm identity: stop the running read, drop the rows of the old identity, and read the docket of the new
   * one when the patent data Service is there. With no identity, the docket file is removed and the state is
   * `no_identity`. The same identity changes nothing. Changes run one after another, in the order of the calls.
   * @param identity - the new identity, normalized.
   * @returns the state after the change.
   */
  async setIdentity(identity: FirmIdentity): Promise<DocketState> {
    this.loaded = this.loaded.then(() => this.change(identity))
    await this.loaded
    return this.state()
  }

  /**
   * Stop the read and the refresh timer for good.
   * @returns once the read ended and its progress is on disk.
   */
  async dispose(): Promise<void> {
    this.stopped = true
    this.cancelTimer?.()
    await this.loaded
    await this.pause()
  }

  /** Replace the identity and the docket; see {@link setIdentity}. */
  private async change(identity: FirmIdentity): Promise<void> {
    if (sameFirmIdentity(identity, this.identity)) return
    this.identity = identity
    await this.pause()
    // The read that ended armed the refresh of the old docket.
    this.cancelTimer?.()
    this.cancelTimer = undefined
    this.docket = undefined
    await this.load()
    this.begin()
  }

  /** Read the stored docket of this identity, or start a new one; with no identity, remove the file. */
  private async load(): Promise<void> {
    const { identity } = this
    const { file, log } = this.options
    if (!identitySet(identity)) {
      try {
        await rm(file, { force: true })
      } catch (error: unknown) {
        log(`ui-flowleap-folder: firm docket: ${messageOf(error)}`)
      }
      return
    }
    const stored = await this.read()
    if (stored !== undefined && sameIdentity(stored, identity)) {
      this.docket = stored
      return
    }
    // The rows of another identity leave the disk at once, not only when a read starts.
    this.docket = this.fresh()
    await this.save(this.docket)
  }

  /** The stored docket; a missing file is none, and a damaged one is none with a log line. */
  private async read(): Promise<DocketFile | undefined> {
    let text: string
    try {
      text = await readFile(this.options.file, 'utf8')
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.options.log(`ui-flowleap-folder: firm docket: ${messageOf(error)}`)
      return undefined
    }
    try {
      return parseDocketFile(JSON.parse(text))
    } catch (error: unknown) {
      // A damaged file is read again from the register.
      this.options.log(`ui-flowleap-folder: firm docket: the stored docket is damaged, so it is read again: ${messageOf(error)}`)
      return undefined
    }
  }

  /** A new read of the whole docket. */
  private fresh(): DocketFile {
    return freshDocket(this.identity, new Date(this.options.clock.now()).toISOString())
  }

  /** Start a read when the docket needs one and the Service is there; else arm the refresh. */
  private begin(): void {
    const data = this.options.data()
    if (this.stopped || this.run !== undefined || this.docket === undefined || data === undefined) return
    if (nextUnread(this.docket) === undefined) {
      const oldest = oldestAsOf(this.docket)
      if (oldest === undefined || this.options.clock.now() - Date.parse(oldest) < this.options.refreshAge) {
        this.arm(oldest)
        return
      }
      this.docket = this.fresh()
    }
    this.cancelTimer?.()
    const controller = new AbortController()
    this.run = {
      controller,
      done: this.readAll(data, this.docket, controller.signal).then((read) => {
        this.run = undefined
        this.arm(oldestAsOf(read))
      }),
    }
  }

  /**
   * Arm the refresh for the time when the oldest slice is older than the refresh age.
   * @param oldest - the time of the oldest slice that a read ended; with none, nothing is armed.
   */
  private arm(oldest: string | undefined): void {
    this.cancelTimer?.()
    this.cancelTimer = undefined
    if (this.stopped || oldest === undefined) return
    const { clock, refreshAge } = this.options
    this.cancelTimer = clock.timer(Date.parse(oldest) + refreshAge - clock.now(), () => {
      this.cancelTimer = undefined
      this.begin()
    })
  }

  /** Read every unread slice, one after another, store the progress, and give the docket as the read left it. */
  private async readAll(data: PatentData, start: DocketFile, signal: AbortSignal): Promise<DocketFile> {
    let docket = start
    await this.save(docket)
    try {
      for (let unread = nextUnread(docket); unread !== undefined; unread = nextUnread(docket)) {
        docket = withSlice(docket, unread.at, await this.readSlice(data, unread, signal))
        this.docket = docket
        if (this.options.clock.now() - this.lastSave >= SAVE_INTERVAL_MS) await this.save(docket)
      }
    } catch (_error: unknown) {
      // `readSlice` keeps every fault in its slice and lets only the abort of a stop through; the unread slices stay
      // for the next start.
    }
    await this.save(docket)
    return docket
  }

  /** Read one slice: split it when it has too many rows, else read its pages and keep the firm's rows. */
  private async readSlice(data: PatentData, { query, range }: UnreadSlice, signal: AbortSignal): Promise<SliceResult> {
    const { clock, sliceRows, log } = this.options
    const { identity } = this
    const cql = sliceQuery(query, range)
    let result: SliceResult
    try {
      signal.throwIfAborted()
      const first = await data.searchRegister(cql, { begin: 1, end: Math.min(PAGE_ROWS, sliceRows) }, signal)
      const total = range.kind === 'all' ? { total: first.total } : {}
      if (first.total > sliceRows) {
        const parts = splitRange(range, new Date(clock.now()))
        if (parts === undefined) log(`ui-flowleap-folder: firm docket: ${cql} has ${String(first.total)} rows on one day; one query reads at most ${String(sliceRows)}`)
        result = parts === undefined
          ? { ...total, slices: [{ range, state: 'failed', failure: 'day-over-limit', asOf: this.now() }] }
          : { ...total, slices: parts.map(part => ({ range: part, state: 'unread' })) }
      } else {
        const rows = [...first.rows]
        while (rows.length < first.total) {
          const begin = rows.length + 1
          const page = await data.searchRegister(cql, { begin, end: Math.min(begin + PAGE_ROWS - 1, first.total) }, signal)
          if (page.rows.length === 0) break
          rows.push(...page.rows)
        }
        result = {
          ...total,
          slices: [{ range, state: 'read', total: first.total, rows: rows.length, asOf: this.now() }],
          rows: rows.map(row => docketRow(row, identity)).filter((row): row is DocketRow => row !== undefined),
        }
      }
    } catch (error: unknown) {
      if (signal.aborted) throw error
      const failure = error instanceof PatentDataError ? error.code : 'internal'
      log(`ui-flowleap-folder: firm docket: ${cql}: ${messageOf(error)}`)
      result = { slices: [{ range, state: 'failed', failure, asOf: this.now() }] }
    }
    return result
  }

  /** The time now, as ISO-8601. */
  private now(): string {
    return new Date(this.options.clock.now()).toISOString()
  }

  /** Write the docket file; a failed write is logged, and the next save or the next start writes it again. */
  private async save(docket: DocketFile): Promise<void> {
    this.lastSave = this.options.clock.now()
    try {
      await writeFileAtomic(this.options.file, JSON.stringify(docket), { mode: 0o600 })
    } catch (error: unknown) {
      this.options.log(`ui-flowleap-folder: firm docket: ${messageOf(error)}`)
    }
  }
}
