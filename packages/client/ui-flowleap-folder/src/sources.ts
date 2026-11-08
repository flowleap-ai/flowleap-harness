/**
 * The source record: for each entry that this plugin wrote into a client folder, how it came there and when. One
 * JSON file for each workspace under the plugin's state folder; it moves into the Firm Record's document index in M1.
 * @module
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { FolderSource } from './route.ts'

/** The stored file: entry path relative to the client folder, to its source. */
type SourceFile = Record<string, FolderSource>

/** Whether a stored value is a source. */
function isSource(value: unknown): value is FolderSource {
  if (typeof value !== 'object' || value === null) return false
  const { kind, at } = value as Record<string, unknown>
  return (kind === 'upload' || kind === 'folder') && typeof at === 'string'
}

/**
 * The source records of all client folders. Writes for one workspace run one after another, so a record never loses
 * a concurrent change.
 */
export class SourceStore {
  private readonly queues = new Map<string, Promise<unknown>>()

  /**
   * @param dir - the plugin's state folder; the records go into its `sources/` folder.
   */
  constructor(private readonly dir: string) {}

  /**
   * Read the record of one workspace.
   * @param workspace - the workspace id.
   * @returns the sources by entry path; empty when no record exists. A record that is not valid JSON reads as empty.
   */
  async read(workspace: string): Promise<Map<string, FolderSource>> {
    let text: string
    try {
      text = await readFile(this.fileOf(workspace), 'utf8')
    } catch (_error: unknown) {
      // No record yet: this plugin wrote nothing into the folder.
      return new Map()
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch (_error: unknown) {
      // A damaged record shows every entry as not recorded; the next write replaces it.
      return new Map()
    }
    if (typeof parsed !== 'object' || parsed === null) return new Map()
    return new Map(Object.entries(parsed).filter((pair): pair is [string, FolderSource] => isSource(pair[1])))
  }

  /**
   * Record the source of a new entry.
   * @param workspace - the workspace id.
   * @param entry - the entry path relative to the client folder.
   * @param source - how and when it came.
   * @returns once the record is on disk.
   */
  record(workspace: string, entry: string, source: FolderSource): Promise<void> {
    return this.update(workspace, (sources) => { sources.set(entry, source) })
  }

  /**
   * Carry the sources of a renamed or moved entry, and of everything below it, to the new path.
   * @param workspace - the workspace id.
   * @param from - the old entry path.
   * @param to - the new entry path.
   * @returns once the record is on disk.
   */
  moved(workspace: string, from: string, to: string): Promise<void> {
    return this.update(workspace, (sources) => {
      for (const [key, source] of [...sources]) {
        if (key !== from && !key.startsWith(`${from}/`)) continue
        sources.delete(key)
        sources.set(to + key.slice(from.length), source)
      }
    })
  }

  /** Run one change of a workspace's record after the earlier ones, and write the record through a renamed file. */
  private update(workspace: string, change: (sources: Map<string, FolderSource>) => void): Promise<void> {
    const before = this.queues.get(workspace) ?? Promise.resolve()
    const next = before.catch(() => undefined).then(async () => {
      const sources = await this.read(workspace)
      change(sources)
      const file = this.fileOf(workspace)
      await mkdir(path.dirname(file), { recursive: true })
      const body: SourceFile = Object.fromEntries(sources)
      const temporary = `${file}.${process.pid}.tmp`
      await writeFile(temporary, `${JSON.stringify(body, null, 2)}\n`, 'utf8')
      await rename(temporary, file)
    })
    this.queues.set(workspace, next)
    return next
  }

  /** The record file of one workspace; the id is a UUID, so it is a plain file name. */
  private fileOf(workspace: string): string {
    return path.join(this.dir, 'sources', `${encodeURIComponent(workspace)}.json`)
  }
}
