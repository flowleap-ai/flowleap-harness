/**
 * A client folder in memory behind the `FolderApi` of the browser half: listings by folder path, the four writes with
 * the Host's refusals (`exists`, `into-itself`), one scripted failure for the next call of an act, and a gate that
 * holds the next call of an act until the test opens it.
 */

import type { FolderEntry, FolderListing, FolderWritten } from '../src/route.ts'
import type { FolderApi, FolderResult } from '../src/client/api.ts'
import { baseName, childPath, parentOf, type FailureCode } from '../src/client/model.ts'

/** The modified time of every fixture entry. */
export const MODIFIED = '2026-11-08T09:00:00.000Z'

/** A folder entry. */
export const dir = (name: string, extra: Partial<FolderEntry> = {}): FolderEntry => ({ name, kind: 'directory', modifiedAt: MODIFIED, ...extra })

/** A file entry. */
export const file = (name: string, size = 1200, extra: Partial<FolderEntry> = {}): FolderEntry => ({ name, kind: 'file', size, modifiedAt: MODIFIED, ...extra })

type Act = keyof FolderApi

/**
 * The fixture client folder.
 * @param initial - the entries of each folder, by folder path.
 * @returns the API, the folders, the call log, and the failure and gate controls.
 */
export function memoryFolder(initial: Record<string, FolderEntry[]>) {
  const tree = new Map(Object.entries(initial).map(([path, entries]) => [path, [...entries]]))
  const failures = new Map<Act, FailureCode>()
  const gates = new Map<Act, Promise<void>>()
  const calls: string[] = []
  const ok = <T>(value: T): FolderResult<T> => ({ ok: true, value })
  const fail = (error: FailureCode): FolderResult<never> => ({ ok: false, error })
  /** Wait at an open gate, then answer the scripted failure, if any. */
  const enter = async (act: Act, label: string): Promise<FailureCode | undefined> => {
    calls.push(label)
    const gate = gates.get(act)
    gates.delete(act)
    if (gate !== undefined) await gate
    const failure = failures.get(act)
    failures.delete(act)
    return failure
  }
  const has = (folder: string, name: string) => (tree.get(folder) ?? []).some(entry => entry.name === name)
  const take = (path: string): FolderEntry => {
    const entries = tree.get(parentOf(path)) ?? []
    const entry = entries.find(item => item.name === baseName(path))!
    tree.set(parentOf(path), entries.filter(item => item !== entry))
    return entry
  }
  const put = (folder: string, entry: FolderEntry) => { tree.set(folder, [...tree.get(folder) ?? [], entry]) }
  /** Carry a moved folder's listings, and those below it, to the new path. */
  const carry = (from: string, to: string) => {
    for (const [key, entries] of [...tree]) {
      if (key !== from && !key.startsWith(`${from}/`)) continue
      tree.delete(key)
      tree.set(to + key.slice(from.length), entries)
    }
  }
  const api: FolderApi = {
    list: async (path) => {
      const failure = await enter('list', `list ${path}`)
      if (failure !== undefined) return fail(failure)
      const entries = tree.get(path)
      return entries === undefined ? fail('not-found') : ok<FolderListing>({ path, entries: [...entries], truncated: false })
    },
    mkdir: async (parent, name) => {
      const failure = await enter('mkdir', `mkdir ${childPath(parent, name)}`)
      if (failure !== undefined) return fail(failure)
      if (has(parent, name)) return fail('exists')
      put(parent, dir(name))
      tree.set(childPath(parent, name), [])
      return ok<FolderWritten>({ path: childPath(parent, name) })
    },
    rename: async (path, name) => {
      const failure = await enter('rename', `rename ${path} ${name}`)
      if (failure !== undefined) return fail(failure)
      if (has(parentOf(path), name)) return fail('exists')
      const entry = take(path)
      const renamed = childPath(parentOf(path), name)
      put(parentOf(path), { ...entry, name })
      carry(path, renamed)
      return ok<FolderWritten>({ path: renamed })
    },
    move: async (path, to) => {
      const failure = await enter('move', `move ${path} ${to}`)
      if (failure !== undefined) return fail(failure)
      if (to === path || to.startsWith(`${path}/`)) return fail('into-itself')
      if (has(to, baseName(path))) return fail('exists')
      const moved = childPath(to, baseName(path))
      put(to, take(path))
      carry(path, moved)
      return ok<FolderWritten>({ path: moved })
    },
    upload: async (folder, name, blob, progress) => {
      const failure = await enter('upload', `upload ${childPath(folder, name)}`)
      if (failure !== undefined) return fail(failure)
      if (has(folder, name)) return fail('exists')
      progress(0.5)
      put(folder, file(name, blob.size, { source: { kind: 'upload', at: MODIFIED } }))
      return ok<FolderWritten>({ path: childPath(folder, name) })
    },
  }
  return {
    api,
    tree,
    calls,
    /** Answer the next call of an act with a failure. */
    failNext(act: Act, error: FailureCode) { failures.set(act, error) },
    /**
     * Hold the next call of an act.
     * @returns the opener.
     */
    hold(act: Act): () => void {
      let open = () => {}
      gates.set(act, new Promise<void>((resolve) => { open = resolve }))
      return () => { open() }
    },
  }
}
