/**
 * The stored firm identity: the identity that a person saved in Settings, kept in one file under `stateDir`. Before
 * the first save, and while the file is damaged, the identity is the `firmIdentity` of the row config, so a firm patch
 * that sets it keeps working until a person saves another one. A saved identity wins over the row config.
 * @module
 */

import { readFile } from 'node:fs/promises'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { z } from 'zod'
import { normalizeIdentity, type FirmIdentity } from './identity.ts'
import { messageOf } from './jobs.ts'

/** The identity file as JSON. */
const IDENTITY_FILE = z.object({
  version: z.literal(1),
  identity: z.object({ names: z.array(z.string()), addresses: z.array(z.string()), representatives: z.array(z.string()) }),
  /** ISO-8601 time of the save. */
  savedAt: z.string(),
})

/** What the identity store uses. */
export interface FirmIdentityStoreOptions {
  /** The identity file. */
  readonly file: string
  /** The `firmIdentity` of the row config: the identity until a person saves one. */
  readonly initial: FirmIdentity
  readonly now: () => Date
  /** Reports a damaged or unreadable identity file; the store then uses the row config. */
  readonly log: (message: string) => void
}

/** The firm identity of this plugin; one instance owns the identity file. */
export class FirmIdentityStore {
  private identity: FirmIdentity
  private readonly loaded: Promise<void>
  /** The last save; the next save starts after it, so the file and {@link current} end with the last request. */
  private saving: Promise<unknown> = Promise.resolve()

  /**
   * Read the identity file.
   * @param options - the file, the row config identity, the clock and the log.
   */
  constructor(private readonly options: FirmIdentityStoreOptions) {
    this.identity = normalizeIdentity(options.initial)
    this.loaded = this.load()
  }

  /**
   * The firm identity now.
   * @returns the saved identity, else the row config identity; normalized.
   */
  async current(): Promise<FirmIdentity> {
    await this.loaded
    return this.identity
  }

  /**
   * Save a new firm identity. Lists with no entry left mean no identity; the file then holds the empty identity, so
   * the row config identity does not come back at the next start.
   * @param identity - the identity as the person wrote it.
   * @returns the normalized identity that the file holds now.
   * @throws Error when the file cannot be written; the identity then stays as it was.
   */
  async save(identity: FirmIdentity): Promise<FirmIdentity> {
    const next = normalizeIdentity(identity)
    const write = this.saving.then(async () => {
      await this.loaded
      const file: z.infer<typeof IDENTITY_FILE> = { version: 1, identity: next, savedAt: this.options.now().toISOString() }
      await writeFileAtomic(this.options.file, JSON.stringify(file), { mode: 0o600 })
      this.identity = next
    })
    // A failed save does not stop the saves after it.
    this.saving = write.catch(() => undefined)
    await write
    return next
  }

  /** Read the saved identity; a missing file leaves the row config identity, a damaged one too with a log line. */
  private async load(): Promise<void> {
    let text: string
    try {
      text = await readFile(this.options.file, 'utf8')
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.options.log(`ui-flowleap-folder: firm identity: ${messageOf(error)}`)
      return
    }
    try {
      this.identity = normalizeIdentity(IDENTITY_FILE.parse(JSON.parse(text)).identity)
    } catch (error: unknown) {
      // The page shows the row config identity, and the next save writes the file again.
      this.options.log(`ui-flowleap-folder: firm identity: the saved identity is damaged, so the row config identity is used: ${messageOf(error)}`)
    }
  }
}
