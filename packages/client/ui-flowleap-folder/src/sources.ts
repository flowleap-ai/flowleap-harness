/**
 * The records that this plugin keeps for each client folder, one JSON file for each workspace under the plugin's state
 * folder: the source of each entry that the plugin wrote (it moves into the Firm Record's document index in M1), and
 * where each entry in Trash came from.
 * @module
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { FolderSource } from './route.ts'

/** Where an entry in Trash came from and when it went there. */
export interface TrashOrigin {
  /** The entry's path before it went to Trash, relative to the client folder. */
  readonly from: string
  /** ISO-8601 instant of the move to Trash. */
  readonly at: string
}

/** Whether a stored value is a source. */
export function isSource(value: unknown): value is FolderSource {
  if (typeof value !== 'object' || value === null) return false
  const { kind, at } = value as Record<string, unknown>
  return (kind === 'upload' || kind === 'folder') && typeof at === 'string'
}

/** Whether a stored value is a Trash origin. */
export function isTrashOrigin(value: unknown): value is TrashOrigin {
  if (typeof value !== 'object' || value === null) return false
  const { from, at } = value as Record<string, unknown>
  return typeof from === 'string' && typeof at === 'string'
}

/**
 * One kind of record for every client folder: entry path relative to the client folder, to a value. Writes for one
 * workspace run one after another, so a record never loses a concurrent change.
 */
export class RecordStore<T> {
  private readonly queues = new Map<string, Promise<unknown>>()

  /**
   * @param dir - the folder of this kind of record, one file for each workspace.
   * @param valid - whether a stored value is a record; others read as absent.
   */
  constructor(private readonly dir: string, private readonly valid: (value: unknown) => value is T) {}

  /**
   * Read the record of one workspace.
   * @param workspace - the workspace id.
   * @returns the values by entry path; empty when no record exists. A record that is not valid JSON reads as empty.
   */
  async read(workspace: string): Promise<Map<string, T>> {
    let text: string
    try {
      text = await readFile(this.fileOf(workspace), 'utf8')
    } catch (_error: unknown) {
      // No record yet: this plugin wrote nothing of this kind into the folder.
      return new Map()
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch (_error: unknown) {
      // A damaged record reads as empty; the next write replaces it.
      return new Map()
    }
    if (typeof parsed !== 'object' || parsed === null) return new Map()
    return new Map(Object.entries(parsed).filter((pair): pair is [string, T] => this.valid(pair[1])))
  }

  /**
   * Record the value of an entry.
   * @param workspace - the workspace id.
   * @param entry - the entry path relative to the client folder.
   * @param value - the value.
   * @returns once the record is on disk.
   */
  record(workspace: string, entry: string, value: T): Promise<void> {
    return this.update(workspace, (values) => { values.set(entry, value) })
  }

  /**
   * Forget the value of an entry.
   * @param workspace - the workspace id.
   * @param entry - the entry path relative to the client folder.
   * @returns once the record is on disk.
   */
  forget(workspace: string, entry: string): Promise<void> {
    return this.update(workspace, (values) => { values.delete(entry) })
  }

  /**
   * Carry the values of a renamed or moved entry, and of everything below it, to the new path.
   * @param workspace - the workspace id.
   * @param from - the old entry path.
   * @param to - the new entry path.
   * @returns once the record is on disk.
   */
  moved(workspace: string, from: string, to: string): Promise<void> {
    return this.update(workspace, (values) => {
      for (const [key, value] of [...values]) {
        if (key !== from && !key.startsWith(`${from}/`)) continue
        values.delete(key)
        values.set(to + key.slice(from.length), value)
      }
    })
  }

  /** Run one change of a workspace's record after the earlier ones, and write the record through a renamed file. */
  private update(workspace: string, change: (values: Map<string, T>) => void): Promise<void> {
    const before = this.queues.get(workspace) ?? Promise.resolve()
    const next = before.catch(() => undefined).then(async () => {
      const values = await this.read(workspace)
      change(values)
      const file = this.fileOf(workspace)
      await mkdir(path.dirname(file), { recursive: true })
      const temporary = `${file}.${process.pid}.tmp`
      await writeFile(temporary, `${JSON.stringify(Object.fromEntries(values), null, 2)}\n`, 'utf8')
      await rename(temporary, file)
    })
    this.queues.set(workspace, next)
    return next
  }

  /** The record file of one workspace; the id is a UUID, so it is a plain file name. */
  private fileOf(workspace: string): string {
    return path.join(this.dir, `${encodeURIComponent(workspace)}.json`)
  }
}

/**
 * The source records of all client folders, under `<stateDir>/sources/`.
 * @param stateDir - the plugin's state folder.
 * @returns the store.
 */
export function sourceStore(stateDir: string): RecordStore<FolderSource> {
  return new RecordStore(path.join(stateDir, 'sources'), isSource)
}

/**
 * The Trash records of all client folders, under `<stateDir>/trash/`.
 * @param stateDir - the plugin's state folder.
 * @returns the store.
 */
export function trashStore(stateDir: string): RecordStore<TrashOrigin> {
  return new RecordStore(path.join(stateDir, 'trash'), isTrashOrigin)
}
