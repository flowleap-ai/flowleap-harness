/**
 * The reads of sliced EP Register queries on the Host: {@link readSlice} reads one date slice, and
 * {@link SlicedFileReader} keeps a file of sliced queries under `stateDir` and reads its unread slices one request at a
 * time, stores the progress, and reads the file again when it is older than its refresh age. The read again of a
 * complete read goes into a second file and takes the place of the complete read only when it ends complete. The firm
 * docket and the opponent index each own one reader, and {@link ReadTurns} lets one of their reads run at a time; the
 * conflict check of the review reads its slices with {@link readSlice} alone.
 * @module
 */

import { readFile, rm } from 'node:fs/promises'
import { PatentDataError, type PatentData, type RegisterRow } from '@deepseek-ai/dsh-flowleap-connectors'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { messageOf } from './message.ts'
import type { Clock } from './limiter.ts'
import {
  PAGE_ROWS, isComplete, nextUnread, oldestAsOf, settled, sliceQuery, splitRange, type ReadName, type Reads, type SliceAt,
  type SliceRead, type SlicedQuery, type UnreadSlice,
} from './slices.ts'

/**
 * The least time between two saves of a running read. A save writes the whole file, which holds every row, so a save
 * after each slice of a large read would write the file hundreds of times.
 */
export const SAVE_INTERVAL_MS = 30_000

/** What the read of one slice uses. */
export interface SliceReadOptions {
  /** `registerSliceRows`: the most rows of one date slice. */
  readonly sliceRows: number
  readonly clock: Pick<Clock, 'now'>
  /** The start of each log line, such as `ui-flowleap-folder: firm docket`. */
  readonly label: string
  readonly log: (message: string) => void
}

/**
 * Read one slice: split it when it has too many rows, else read its pages. Every fault of the read is kept in the
 * slice as a failed slice.
 * @param data - the patent data Service.
 * @param unread - the slice.
 * @param options - the slice size, the clock and the log.
 * @param signal - stops the read.
 * @returns the slices that take the place of the slice, the count of a slice of every date, and the register rows.
 * @throws the reason of `signal` when it aborts; nothing else.
 */
export async function readSlice(
  data: PatentData, unread: Pick<UnreadSlice, 'query' | 'range'>, options: SliceReadOptions, signal?: AbortSignal,
): Promise<SliceRead<RegisterRow>> {
  const { query, range } = unread
  const { clock, sliceRows, label, log } = options
  const now = () => new Date(clock.now()).toISOString()
  const cql = sliceQuery(query, range)
  try {
    signal?.throwIfAborted()
    const first = await data.searchRegister(cql, { begin: 1, end: Math.min(PAGE_ROWS, sliceRows) }, signal)
    const total = range.kind === 'all' ? { total: first.total } : {}
    if (first.total > sliceRows) {
      const parts = splitRange(range, new Date(clock.now()))
      if (parts !== undefined) return { ...total, slices: parts.map(part => ({ range: part, state: 'unread' })) }
      log(`${label}: ${cql} has ${String(first.total)} rows on one day; one query reads at most ${String(sliceRows)}`)
      return { ...total, slices: [{ range, state: 'failed', failure: 'day-over-limit', asOf: now() }] }
    }
    const rows = [...first.rows]
    while (rows.length < first.total) {
      const begin = rows.length + 1
      const page = await data.searchRegister(cql, { begin, end: Math.min(begin + PAGE_ROWS - 1, first.total) }, signal)
      if (page.rows.length === 0) break
      rows.push(...page.rows)
    }
    return { ...total, slices: [{ range, state: 'read', total: first.total, rows: rows.length, asOf: now() }], rows }
  } catch (error: unknown) {
    if (signal?.aborted === true) throw error
    log(`${label}: ${cql}: ${messageOf(error)}`)
    return { slices: [{ range, state: 'failed', failure: error instanceof PatentDataError ? error.code : 'internal', asOf: now() }] }
  }
}

/**
 * The order of the background reads of one plugin instance, the firm docket and the opponent index: one read at a
 * time, in the order of the requests, so that the firm's names and the names of its clients never go out together. A
 * read holds its turn from its first slice to its end or its stop.
 */
export class ReadTurns {
  private busy = false
  private readonly waiting: (() => void)[] = []

  /**
   * Wait for the turn.
   * @param signal - stops the wait.
   * @returns the end of the turn, which gives the turn to the next read; call it once.
   * @throws the reason of `signal` when it aborts before the turn comes.
   */
  take(signal: AbortSignal): Promise<() => void> {
    return new Promise((resolve, reject) => {
      signal.throwIfAborted()
      const grant = () => {
        signal.removeEventListener('abort', abort)
        resolve(() => { this.pass() })
      }
      const abort = () => {
        this.waiting.splice(this.waiting.indexOf(grant), 1)
        reject(signal.reason as Error)
      }
      if (!this.busy) {
        this.busy = true
        grant()
        return
      }
      this.waiting.push(grant)
      signal.addEventListener('abort', abort, { once: true })
    })
  }

  /** Give the turn to the read that waits longest, or free it. */
  private pass(): void {
    const next = this.waiting.shift()
    if (next === undefined) this.busy = false
    else next()
  }
}

/** A stored file of sliced queries. */
export interface SlicedFile {
  readonly queries: readonly SlicedQuery[]
}

/** What a reader of one kind of file uses. */
export interface SlicedFileReaderOptions<F extends SlicedFile> extends SliceReadOptions {
  /** The file of the served read. */
  readonly file: string
  /** The file of the read again of a complete served read, until it ends complete and takes the place of `file`. */
  readonly refreshFile: string
  /** The clock of the slices and of the refresh. */
  readonly clock: Clock
  /** The age in milliseconds after which a read file is read again. */
  readonly refreshAge: number
  /** The patent data Service now, behind the shared limiter; undefined while the runtime has none. */
  readonly data: () => PatentData | undefined
  /** The order of the background reads of the plugin instance. */
  readonly turns: ReadTurns
  /**
   * Check a stored file: the file is a durable input.
   * @throws Error when a field is missing or has the wrong type.
   */
  readonly parse: (value: unknown) => F
  /** The file after the read of one slice. */
  readonly withRead: (file: F, at: SliceAt, read: SliceRead<RegisterRow>) => F
  /** A new read of every query of a file, for the refresh. */
  readonly fresh: (file: F) => F
}

/** The settings of a reader that its owner gives: the files, the slice size, the refresh age, the Service and the log. */
export type SlicedFileSettings = Pick<
  SlicedFileReaderOptions<SlicedFile>, 'file' | 'refreshFile' | 'sliceRows' | 'refreshAge' | 'data' | 'clock' | 'log' | 'turns'
>

/** One read that runs now. */
interface Run {
  readonly controller: AbortController
  readonly done: Promise<void>
  readonly name: ReadName
}

/** The read that a run reads into: its name, its file now, and the reads with a new version of it. */
interface Target<F> {
  readonly name: ReadName
  readonly file: F
  readonly with: (file: F) => Reads<F>
}

/** The reader of one file of sliced queries; one instance owns the file and the file of its read again. */
export class SlicedFileReader<F extends SlicedFile> {
  /** The reads now; undefined when there is none. */
  private current: Reads<F> | undefined
  /** The last change; every change starts after it. */
  private changing: Promise<void> = Promise.resolve()
  private run: Run | undefined
  private cancelTimer: (() => void) | undefined
  private stopped = false
  private lastSave = Number.NEGATIVE_INFINITY

  /** @param options - the files, the settings, the Service and the kind of file. */
  constructor(private readonly options: SlicedFileReaderOptions<F>) {}

  /** The reads now, with the progress of a running read. */
  get reads(): Reads<F> | undefined {
    return this.current
  }

  /** The read that runs now, if one runs. */
  get reading(): ReadName | undefined {
    return this.run?.name
  }

  /**
   * The stored reads; a missing served file is none, and a damaged file is none with a log line. A complete read
   * again, which a Host stop left before it took the place of the served read, takes that place now, also on disk.
   * @returns the reads.
   */
  async stored(): Promise<Reads<F> | undefined> {
    const served = await this.storedFile(this.options.file)
    if (served === undefined) return undefined
    const refresh = await this.storedFile(this.options.refreshFile)
    const reads = settled(refresh === undefined ? { served } : { served, refresh })
    if (reads.served === refresh) await this.promote(refresh)
    return reads
  }

  /**
   * Take the stored reads as the reads now; for the load, before any change.
   * @returns once the files are read.
   */
  async load(): Promise<void> {
    this.current = await this.stored()
  }

  /**
   * Replace the reads: stop the running read and the refresh, and store the new reads (or remove both files for none).
   * A read again that the change makes complete takes the place of the served read. Nothing is read until
   * {@link begin}. Changes run one after another, in the order of the calls.
   * @param change - the new reads from the reads now, after the running read stopped; undefined for none.
   * @returns once the new reads are stored.
   */
  async change(change: (current: Reads<F> | undefined) => Reads<F> | undefined): Promise<void> {
    this.changing = this.changing.then(async () => {
      await this.pause()
      // The read that ended armed the refresh of the old reads.
      this.cancelTimer?.()
      this.cancelTimer = undefined
      const reads = change(this.current)
      this.current = reads === undefined ? undefined : settled(reads)
      await this.persist(this.current)
    })
    await this.changing
  }

  /**
   * Start a new read of every slice: beside a complete served read, else in the place of the served read. Nothing is
   * read until {@link begin}.
   * @returns once the new reads are stored.
   */
  async readAgain(): Promise<void> {
    await this.change((reads) => {
      if (reads === undefined) return undefined
      const target = this.again(reads)
      return target.with(target.file)
    })
  }

  /**
   * Start what the reads need now: the rest of an unfinished read, the served read first, or a new read of every slice
   * when the latest read is older than the refresh age; else arm the refresh. Nothing starts without the patent data
   * Service or while a read runs.
   */
  begin(): void {
    const data = this.options.data()
    const reads = this.current
    if (this.stopped || this.run !== undefined || reads === undefined || data === undefined) return
    let target = this.unread(reads)
    let fresh = false
    if (target === undefined) {
      const oldest = oldestAsOf((reads.refresh ?? reads.served).queries)
      if (oldest === undefined || this.options.clock.now() - Date.parse(oldest) < this.options.refreshAge) {
        this.arm(oldest)
        return
      }
      target = this.again(reads)
      this.current = target.with(target.file)
      fresh = true
    }
    this.cancelTimer?.()
    const controller = new AbortController()
    this.run = {
      controller,
      name: target.name,
      done: this.readAll(data, target, fresh, controller.signal).then(() => {
        this.run = undefined
        // A stopped read waits for the act that stopped it; a read that ended starts what is left, or arms the refresh.
        if (!controller.signal.aborted) this.begin()
      }),
    }
  }

  /**
   * Stop the running read; the unread slices stay for the next {@link begin}.
   * @returns once the read ended and its progress is on disk.
   */
  async pause(): Promise<void> {
    const run = this.run
    run?.controller.abort()
    await run?.done
  }

  /**
   * Stop the read and the refresh timer for good.
   * @returns once the read ended and its progress is on disk.
   */
  async dispose(): Promise<void> {
    this.stopped = true
    this.cancelTimer?.()
    await this.changing
    await this.pause()
  }

  /** The read with unread slices, the served read first. */
  private unread(reads: Reads<F>): Target<F> | undefined {
    const { served, refresh } = reads
    if (nextUnread(served.queries) !== undefined) return { name: 'served', file: served, with: file => ({ ...reads, served: file }) }
    if (refresh === undefined || nextUnread(refresh.queries) === undefined) return undefined
    return { name: 'refresh', file: refresh, with: file => ({ served, refresh: file }) }
  }

  /** A new read of every slice: the read again of a complete served read, else a new served read. */
  private again(reads: Reads<F>): Target<F> {
    const { served } = reads
    const file = this.options.fresh(served)
    return isComplete(served.queries)
      ? { name: 'refresh', file, with: refresh => ({ served, refresh }) }
      : { name: 'served', file, with: next => ({ served: next }) }
  }

  /**
   * Arm the refresh for the time when the oldest slice is older than the refresh age.
   * @param oldest - the time of the oldest slice that a read ended; with none, nothing is armed.
   */
  private arm(oldest: string | undefined): void {
    this.cancelTimer?.()
    this.cancelTimer = undefined
    if (oldest === undefined) return
    const { clock, refreshAge } = this.options
    this.cancelTimer = clock.timer(Date.parse(oldest) + refreshAge - clock.now(), () => {
      this.cancelTimer = undefined
      this.begin()
    })
  }

  /**
   * Read every unread slice of one read in its turn, one after another, and store the progress. A read again that
   * ends complete then takes the place of the served read.
   */
  private async readAll(data: PatentData, target: Target<F>, fresh: boolean, signal: AbortSignal): Promise<void> {
    const path = target.name === 'served' ? this.options.file : this.options.refreshFile
    let file = target.file
    let end: (() => void) | undefined
    try {
      if (fresh) await (target.name === 'served' ? this.persist(this.current) : this.save(path, file))
      end = await this.options.turns.take(signal)
      for (let unread = nextUnread(file.queries); unread !== undefined; unread = nextUnread(file.queries)) {
        file = this.options.withRead(file, unread.at, await readSlice(data, unread, this.options, signal))
        this.current = target.with(file)
        if (this.options.clock.now() - this.lastSave >= SAVE_INTERVAL_MS) await this.save(path, file)
      }
    } catch (_error: unknown) {
      // `readSlice` keeps every fault in its slice, and the wait for the turn fails only on a stop; so only the abort of
      // a stop comes here, and the unread slices stay for the next start.
    } finally {
      end?.()
    }
    if (target.name === 'refresh' && isComplete(file.queries)) {
      await this.promote(file)
      this.current = { served: file }
    } else {
      await this.save(path, file)
    }
  }

  /** The stored file at a path; a missing file is none, and a damaged one is none with a log line. */
  private async storedFile(at: string): Promise<F | undefined> {
    const { label, log, parse } = this.options
    let text: string
    try {
      text = await readFile(at, 'utf8')
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') log(`${label}: ${messageOf(error)}`)
      return undefined
    }
    try {
      return parse(JSON.parse(text))
    } catch (error: unknown) {
      // A damaged file is read again from the register.
      log(`${label}: the stored file is damaged, so it is read again: ${messageOf(error)}`)
      return undefined
    }
  }

  /**
   * Store the reads, or remove both files for none. The file of the read again goes first, so that a stop between the
   * two leaves no read again beside a served read of another identity.
   */
  private async persist(reads: Reads<F> | undefined): Promise<void> {
    if (reads?.refresh === undefined) await this.remove(this.options.refreshFile)
    else await this.save(this.options.refreshFile, reads.refresh)
    if (reads === undefined) await this.remove(this.options.file)
    else await this.save(this.options.file, reads.served)
  }

  /**
   * Store a complete read again as the served read, then remove the file of the read again. After a stop between the
   * two, the next load finds the same complete read again and does this again.
   */
  private async promote(file: F): Promise<void> {
    await this.save(this.options.file, file)
    await this.remove(this.options.refreshFile)
  }

  /** Write a file; a failed write is logged, and the next save or the next start writes it again. */
  private async save(at: string, file: F): Promise<void> {
    this.lastSave = this.options.clock.now()
    try {
      await writeFileAtomic(at, JSON.stringify(file), { mode: 0o600 })
    } catch (error: unknown) {
      this.options.log(`${this.options.label}: ${messageOf(error)}`)
    }
  }

  /** Remove a file; a failed removal is logged. */
  private async remove(at: string): Promise<void> {
    try {
      await rm(at, { force: true })
    } catch (error: unknown) {
      this.options.log(`${this.options.label}: ${messageOf(error)}`)
    }
  }
}
