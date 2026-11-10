/**
 * The opponent index: the EP applications that the names of the firm's clients opposed, read on the Host through the
 * patent data Service with one `op=` query for each name, kept in one file under `stateDir`, and read again with the
 * firm docket's refresh age. The Host cannot read the Firm Record, so the browser sends the clients' names
 * ({@link OpponentIndex.setNames}) when the Clients list or Add client opens. A changed list reads only the new names
 * and drops the removed names with their rows. Like the docket, a read sends one request at a time behind the shared
 * limiter, stores its progress, reads only the unread slices after a Host stop, and reads a complete index again into
 * a second file while the complete index stays served.
 *
 * The index sends the names of the firm's clients to the EP Register; Add client sent each of them already, under the
 * same EPO account. Its reads wait while the firm docket reads, so the clients' names and the firm's names do not go
 * out together.
 * @module
 */

import { freshIndex, indexState, parseIndexFile, sameNames, withIndexSlice, withNames, type OpponentIndexFile } from './opponent-index-model.ts'
import { SlicedFileReader, type SlicedFileSettings } from './sliced-read.ts'
import { hasFailures } from './slices.ts'
import type { OpponentIndexState } from './wire.ts'

/** The opponent index of this plugin; one instance owns the index file. */
export class OpponentIndex {
  private readonly reader: SlicedFileReader<OpponentIndexFile>
  /** The load, then each change of the names after it; every act waits for the last one. */
  private loaded: Promise<void>

  /**
   * Load the stored index. Nothing is read until {@link wake}.
   * @param options - the index file, `registerSliceRows`, `docketRefreshAge`, the Service and the log.
   */
  constructor(private readonly options: SlicedFileSettings) {
    this.reader = new SlicedFileReader<OpponentIndexFile>({
      ...options, label: 'ui-flowleap-folder: opponent index', parse: parseIndexFile, withRead: withIndexSlice,
      fresh: index => freshIndex(index, this.now()),
    })
    this.loaded = this.reader.load()
  }

  /**
   * Start what the index needs now: the rest of an unfinished read, or a read again when the index is older than the
   * refresh age; else arm the refresh. Nothing starts without the patent data Service or while a read runs.
   * @returns once the index is loaded and the decision is made.
   */
  async wake(): Promise<void> {
    await this.loaded
    this.reader.begin()
  }

  /**
   * Stop the running read, for example when the patent data Service goes; the unread slices stay for the next
   * {@link wake}.
   * @returns once the read ended and its progress is on disk.
   */
  pause(): Promise<void> {
    return this.reader.pause()
  }

  /**
   * Take the names of the firm's clients, in the served index and in its read again: stop the running read, keep the
   * queries of the names that stay, add an unread query for each new name, drop the others with their rows, and read
   * on, the served index first. The same names in any order change nothing, except that with no read running they
   * read the failed slices again; no name removes the files. Changes run one after another, in the order of the
   * calls.
   * @param names - the names of every client with the role client, and their linked applicant names.
   * @returns the state after the change.
   */
  async setNames(names: readonly string[]): Promise<OpponentIndexState> {
    this.loaded = this.loaded.then(async () => {
      const reads = this.reader.reads
      const queries = [...reads?.served.queries ?? [], ...reads?.refresh?.queries ?? []]
      if (sameNames(reads?.served, names) && (this.reader.reading !== undefined || !hasFailures(queries))) return
      await this.reader.change((current) => {
        const served = withNames(current?.served, names, this.now())
        const refresh = current?.refresh === undefined ? undefined : withNames(current.refresh, names, this.now())
        return served === undefined ? undefined : { served, ...(refresh === undefined ? {} : { refresh }) }
      })
      this.reader.begin()
    })
    await this.loaded
    return this.state()
  }

  /**
   * The served index now: the last complete index while a read again runs, else the index with the progress of a
   * running read.
   * @returns the index, or undefined while it has no name.
   */
  async current(): Promise<OpponentIndexFile | undefined> {
    await this.loaded
    return this.reader.reads?.served
  }

  /**
   * The state of the index now.
   * @returns the state.
   */
  async state(): Promise<OpponentIndexState> {
    await this.loaded
    const { clock, refreshAge } = this.options
    return indexState(this.reader.reads, { reading: this.reader.reading, now: clock.now(), refreshAge })
  }

  /**
   * Stop the read and the refresh timer for good.
   * @returns once the read ended and its progress is on disk.
   */
  async dispose(): Promise<void> {
    await this.loaded
    await this.reader.dispose()
  }

  /** The time now, as ISO-8601. */
  private now(): string {
    return new Date(this.options.clock.now()).toISOString()
  }
}
