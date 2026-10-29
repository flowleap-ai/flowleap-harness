/**
 * An in-memory {@link DraftingFiles} for the drafting workspace and save specs. A `null` value is
 * a file that a folder listing names but a read no longer finds, as when it is deleted between
 * the two calls. Each instance has its own root, so the chat advice of one spec never sees the
 * refusals of another.
 */

import { DraftingWorkspace, type DraftingFiles, type DraftingWorkspaceOptions } from '../src/drafting/workspace.ts'
import { resolveDraftingFolder } from '../src/drafting/folder-contract.ts'

let roots = 0

/** The in-memory files and the map that holds them. */
export interface MemoryFiles extends DraftingFiles {
  readonly entries: Map<string, string | Uint8Array | null>
}

/**
 * In-memory files with the given entries.
 * @param initial - the files by workspace-relative path.
 * @returns the files.
 */
export function memoryFiles(initial: Record<string, string | Uint8Array | null> = {}): MemoryFiles {
  const entries = new Map(Object.entries(initial))
  const root = `/memory-${String(++roots)}`
  const bytesOf = (value: string | Uint8Array) => typeof value === 'string' ? new TextEncoder().encode(value) : value
  return {
    root,
    entries,
    read: path => {
      const value = entries.get(path)
      return Promise.resolve(value == null ? undefined : typeof value === 'string' ? value : new TextDecoder().decode(value))
    },
    readBytes: path => {
      const value = entries.get(path)
      return Promise.resolve(value == null ? undefined : bytesOf(value))
    },
    write: (path, text) => {
      entries.set(path, text)
      return Promise.resolve()
    },
    writeBytes: (path, bytes) => {
      entries.set(path, bytes)
      return Promise.resolve()
    },
    listFiles: folder => Promise.resolve([...entries.keys()]
      .filter(path => path.startsWith(`${folder}/`) && !path.slice(folder.length + 1).includes('/'))
      .map(path => path.slice(folder.length + 1))
      .sort()),
    exists: path => Promise.resolve(entries.has(path) || [...entries.keys()].some(key => key.startsWith(`${path}/`))),
    processPath: path => Promise.resolve(`${root}/${path}`),
  }
}

/**
 * A workspace of the `hinge` matter over in-memory files.
 * @param initial - the files by workspace-relative path.
 * @param options - the workspace options.
 * @returns the workspace and its files.
 */
export function memoryWorkspace(initial: Record<string, string | Uint8Array | null> = {}, options: DraftingWorkspaceOptions = { now: () => new Date('2026-10-23T12:00:00.000Z') }) {
  const files = memoryFiles(initial)
  return { files, workspace: new DraftingWorkspace(files, resolveDraftingFolder('hinge')!, options) }
}
