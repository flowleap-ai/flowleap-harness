/**
 * The firm docket: every EP application where the EP Register names the firm as the representative, read on the Host
 * through the patent data Service, kept in one file under `stateDir`, and read again when it is older than
 * `docketRefreshAge`. The read starts when the plugin loads with a firm identity, not at the first Add client, and
 * waits while the opponent index reads, so the firm's queries and a client's queries do not go out together. A read
 * sends one request at a time and stores its progress, so a Host stop loses at most the slices of the last
 * `SAVE_INTERVAL_MS`, and the next start reads only the slices that are not on disk. A read again of a complete docket
 * goes into a second file, and the complete docket stays the served docket until the read again ends complete. A
 * docket of another identity is dropped; with no identity the files are removed. A new identity
 * ({@link FirmDocket.setIdentity}) stops the read, drops the rows and reads again without a restart.
 * @module
 */

import {
  docketState, freshDocket, parseDocketFile, retryLatest, sameIdentity, withSlice, type DocketFile, type DocketRow,
} from './docket-model.ts'
import { identitySet, sameFirmIdentity, type FirmIdentity } from './identity.ts'
import { SlicedFileReader, type SlicedFileSettings } from './sliced-read.ts'
import type { DocketReadRequest, DocketState } from './wire.ts'

/** What the firm docket uses: the docket file, `registerSliceRows`, `docketRefreshAge`, the Service and the identity. */
export interface FirmDocketOptions extends SlicedFileSettings {
  /** The firm identity at load; {@link FirmDocket.setIdentity} changes it later. */
  readonly identity: Promise<FirmIdentity>
}

/** The state of the firm docket with its served rows. */
export interface ServedDocket {
  readonly state: DocketState
  /** The rows of the served docket; undefined unless the state is `ready`, `stale` or `partial`. */
  readonly rows: readonly DocketRow[] | undefined
}

/** The firm docket of this plugin; one instance owns the docket file. */
export class FirmDocket {
  private identity: FirmIdentity = { names: [], addresses: [], representatives: [] }
  /** The load, then each identity change after it; every act waits for the last one. */
  private loaded: Promise<void>
  /** The docket files; they hold no docket while they load and when the identity names nothing. */
  private readonly reader: SlicedFileReader<DocketFile>

  /**
   * Load the stored docket. Nothing is read until {@link wake}.
   * @param options - the file, the identity, the settings and the Service.
   */
  constructor(private readonly options: FirmDocketOptions) {
    this.reader = new SlicedFileReader<DocketFile>({
      ...options, label: 'ui-flowleap-folder: firm docket', parse: parseDocketFile, withRead: withSlice,
      fresh: docket => freshDocket(docket.identity, this.now()),
    })
    this.loaded = options.identity.then(identity => this.change(identity))
  }

  /**
   * Start what the docket needs now: a new read, the rest of an interrupted read, or a read again when the docket is
   * older than the refresh age; else arm the refresh. Nothing starts without the patent data Service or while a read
   * runs.
   * @returns once the docket is loaded and the decision is made.
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
   * The state of the docket now.
   * @returns the state.
   */
  async state(): Promise<DocketState> {
    await this.loaded
    const reads = this.reader.reads
    if (reads === undefined) return { state: 'no_identity' }
    const { clock, refreshAge } = this.options
    return docketState(reads, { reading: this.reader.reading, now: clock.now(), refreshAge })
  }

  /**
   * The state of the docket now, with the rows of the served docket when they can be used: when the state is `ready`,
   * `stale` or `partial`. A `partial` docket can miss rows.
   * @returns the state, and the rows or undefined.
   */
  async served(): Promise<ServedDocket> {
    const state = await this.state()
    const reads = this.reader.reads
    const usable = state.state === 'ready' || state.state === 'stale' || state.state === 'partial'
    return { state, rows: usable && reads !== undefined ? Object.values(reads.served.rows) : undefined }
  }

  /**
   * Read the docket again: every slice, beside a complete docket that stays served until the new read ends complete;
   * or only the failed slices and the queries whose slices did not sum to their count, of the read again when there
   * is one. While a read runs, nothing changes.
   * @param slices - which slices.
   * @returns the state after the read started.
   */
  async readAgain(slices: DocketReadRequest['slices']): Promise<DocketState> {
    await this.loaded
    if (this.reader.reading === undefined && this.options.data() !== undefined) {
      if (slices === 'all') await this.reader.readAgain()
      else await this.reader.change(reads => reads && retryLatest(reads))
      this.reader.begin()
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
    this.loaded = this.loaded.then(async () => {
      if (sameFirmIdentity(identity, this.identity)) return
      await this.change(identity)
      this.reader.begin()
    })
    await this.loaded
    return this.state()
  }

  /**
   * Stop the read and the refresh timer for good.
   * @returns once the read ended and its progress is on disk.
   */
  async dispose(): Promise<void> {
    await this.loaded
    await this.reader.dispose()
  }

  /**
   * Take an identity: keep the stored docket reads of this identity, else start a new docket, whose rows of another
   * identity leave the disk at once with any read again; with no identity, remove the files.
   */
  private async change(identity: FirmIdentity): Promise<void> {
    this.identity = identity
    const stored = identitySet(identity) ? await this.reader.stored() : undefined
    await this.reader.change(() => {
      if (!identitySet(identity)) return undefined
      return stored !== undefined && sameIdentity(stored.served, identity) ? stored : { served: freshDocket(identity, this.now()) }
    })
  }

  /** The time now, as ISO-8601. */
  private now(): string {
    return new Date(this.options.clock.now()).toISOString()
  }
}
