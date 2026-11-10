/**
 * The writes and the listing of one client folder on the Host's disk. Every path a request names is relative to the
 * client folder (the workspace root) and is checked here, before any disk act: a target outside the root, a link as
 * the final part, and a name that a file system or a person could misread are refused. No act replaces an entry.
 * @module
 */

import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { link, lstat, mkdir, open, readdir, realpath, rename, unlink } from 'node:fs/promises'
import path from 'node:path'
import {
  TRASH, isTrashPath, type FolderEntry, type FolderFailureCode, type FolderListing, type FolderSource, type FolderSearchAnswer,
  type FolderSearchHit,
} from './route.ts'

/** A refused folder act; `code` is the wire failure code. */
export class FolderError extends Error {
  override readonly name = 'FolderError'

  /**
   * @param code - the failure code the client words.
   * @param detail - a diagnostic message for the Host log, never shown to the person.
   */
  constructor(readonly code: FolderFailureCode, detail: string) {
    super(detail)
  }
}

/** Prefix of the hidden file that an upload writes before it takes its name. */
export const UPLOAD_PREFIX = '.flowleap-upload-'

/** Longest name in UTF-8 bytes that common file systems accept. */
const MAX_NAME_BYTES = 255

/** Device names that Windows reserves in any folder, with or without an extension. */
const WINDOWS_RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu

/**
 * Check one entry name.
 * @param name - the name a person typed or a dropped file carried.
 * @returns the name.
 * @throws FolderError `invalid-name` for an empty name, `.` or `..`, a separator or NUL, a space at the start or the
 *   end, more than 255 UTF-8 bytes, or a reserved Windows device name.
 */
export function checkName(name: string): string {
  const bad = name === '' || name === '.' || name === '..' || /[/\\\0]/u.test(name) || name.trim() !== name
    || Buffer.byteLength(name, 'utf8') > MAX_NAME_BYTES || WINDOWS_RESERVED.test(name)
  if (bad) throw new FolderError('invalid-name', `invalid name ${JSON.stringify(name)}`)
  return name
}

/** Refuse a write into Trash: only Move to Trash puts entries there, with their recorded origin. */
function keepOutOfTrash(folder: string): void {
  if (isTrashPath(folder)) throw new FolderError('in-trash', `${folder} is Trash or in it`)
}

/**
 * Split a client-folder path into its parts.
 * @param relative - `/`-separated path relative to the client folder; empty for the client folder.
 * @returns the parts.
 * @throws FolderError `outside` for an absolute path, a backslash, NUL, or a `.` or `..` part.
 */
export function partsOf(relative: string): string[] {
  if (relative === '') return []
  const parts = relative.split('/')
  if (relative.startsWith('/') || /[\\\0]/u.test(relative) || parts.some(part => part === '' || part === '.' || part === '..')) {
    throw new FolderError('outside', `path ${JSON.stringify(relative)} is not a plain relative path`)
  }
  return parts
}

/** Whether `child` is `root` or below it, for two real paths. */
function within(root: string, child: string): boolean {
  return child === root || child.startsWith(root.endsWith(path.sep) ? root : root + path.sep)
}

/** The error code of a Node file system error, or undefined. */
function codeOf(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException).code
}

/** A name in lower case with its accents taken off, for a search that ignores case and accents. */
function fold(name: string): string {
  return name.normalize('NFKD').replace(/\p{Mark}/gu, '').toLowerCase()
}

/**
 * The first free form of a name in a folder: the name, then "name 2.ext", "name 3.ext", …, as the file manager of
 * macOS names a copy.
 * @param dir - the folder's real path.
 * @param name - the wanted name.
 * @returns a name that no entry of the folder has.
 */
export async function freeName(dir: string, name: string): Promise<string> {
  const dot = name.lastIndexOf('.')
  const [stem, extension] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, '']
  for (let count = 1; ; count += 1) {
    const candidate = count === 1 ? name : `${stem} ${count}${extension}`
    try {
      await lstat(path.join(dir, candidate))
    } catch (error: unknown) {
      if (codeOf(error) === 'ENOENT') return candidate
      throw error
    }
  }
}

/** Where an upload's bytes go and how many it may have. */
export interface UploadLimits {
  /** Inclusive byte cap of one file. */
  readonly maxBytes: number
}

/**
 * One client folder: the real path of a workspace root and the acts on it.
 */
export class ClientFolder {
  /**
   * @param root - the real path of the client folder.
   */
  private constructor(readonly root: string) {}

  /**
   * Open a client folder at a workspace path.
   * @param workspacePath - the workspace's canonical path.
   * @returns the folder over its real path.
   * @throws FolderError `not-found` when the path is gone.
   */
  static async at(workspacePath: string): Promise<ClientFolder> {
    try {
      return new ClientFolder(await realpath(workspacePath))
    } catch (error: unknown) {
      throw new FolderError('not-found', `workspace folder ${workspacePath}: ${String(error)}`)
    }
  }

  /**
   * Resolve an existing folder inside the client folder, through its real path.
   * @param relative - the folder relative to the client folder.
   * @returns its real path.
   * @throws FolderError `not-found`, `not-directory`, or `outside` when a link leads out of the client folder.
   */
  async folder(relative: string): Promise<string> {
    const target = path.join(this.root, ...partsOf(relative))
    let real: string
    try {
      real = await realpath(target)
    } catch (error: unknown) {
      throw new FolderError('not-found', `${relative}: ${String(error)}`)
    }
    if (!within(this.root, real)) throw new FolderError('outside', `${relative} resolves outside the client folder`)
    const info = await lstat(real)
    if (!info.isDirectory()) throw new FolderError('not-directory', `${relative} is not a folder`)
    return real
  }

  /**
   * Resolve an existing file or folder whose final part is not a link.
   * @param relative - the entry relative to the client folder; never the client folder itself.
   * @returns the real path of its folder and its name.
   * @throws FolderError `not-found`, `outside`, or `bad-request` for the client folder itself.
   */
  async entry(relative: string): Promise<{ readonly dir: string; readonly name: string; readonly isDirectory: boolean }> {
    const parts = partsOf(relative)
    const name = parts.pop()
    if (name === undefined) throw new FolderError('bad-request', 'the client folder itself cannot be renamed or moved')
    const dir = await this.folder(parts.join('/'))
    let info
    try {
      info = await lstat(path.join(dir, name))
    } catch (error: unknown) {
      throw new FolderError('not-found', `${relative}: ${String(error)}`)
    }
    if (!info.isFile() && !info.isDirectory()) throw new FolderError('outside', `${relative} is a link or a special file`)
    return { dir, name, isDirectory: info.isDirectory() }
  }

  /**
   * List one folder. Hidden entries (a name that starts with `.`), links and special files are left out.
   * @param relative - the folder relative to the client folder.
   * @param maxEntries - the cap on returned entries.
   * @param sources - the recorded sources by path.
   * @param trashed - the recorded Trash origins by path, shown on the entries of Trash.
   * @returns the listing.
   */
  async list(
    relative: string,
    maxEntries: number,
    sources: ReadonlyMap<string, FolderSource>,
    trashed: ReadonlyMap<string, { readonly from: string }> = new Map(),
  ): Promise<FolderListing> {
    const dir = await this.folder(relative)
    const prefix = partsOf(relative).join('/')
    const entries: FolderEntry[] = []
    let truncated = false
    for (const dirent of await readdir(dir, { withFileTypes: true })) {
      if (dirent.name.startsWith('.') || !(dirent.isFile() || dirent.isDirectory())) continue
      if (entries.length === maxEntries) {
        truncated = true
        break
      }
      let info
      try {
        info = await lstat(path.join(dir, dirent.name))
      } catch (_error: unknown) {
        // The entry went away between the read of the folder and its stat: it is not listed.
        continue
      }
      const key = prefix === '' ? dirent.name : `${prefix}/${dirent.name}`
      const source = sources.get(key)
      const origin = trashed.get(key)
      entries.push({
        name: dirent.name,
        kind: info.isDirectory() ? 'directory' : 'file',
        ...(info.isFile() ? { size: info.size } : {}),
        modifiedAt: info.mtime.toISOString(),
        ...(source === undefined ? {} : { source }),
        ...(origin === undefined ? {} : { trashedFrom: origin.from }),
      })
    }
    return { path: prefix, entries, truncated }
  }

  /**
   * Make a folder.
   * @param parent - the parent folder relative to the client folder.
   * @param name - the new folder's name.
   * @returns the new folder relative to the client folder.
   * @throws FolderError `exists` when an entry has the name, `in-trash` for a parent that is Trash or in it.
   */
  async mkdir(parent: string, name: string): Promise<string> {
    checkName(name)
    keepOutOfTrash(parent)
    const dir = await this.folder(parent)
    try {
      await mkdir(path.join(dir, name))
    } catch (error: unknown) {
      if (codeOf(error) === 'EEXIST') throw new FolderError('exists', `${name} exists in ${parent}`)
      throw error
    }
    return this.relativeOf(dir, name)
  }

  /**
   * Give an entry a new name in its folder. A change of case alone is allowed on a file system that ignores case.
   * @param relative - the entry relative to the client folder.
   * @param name - the new name.
   * @returns the renamed entry relative to the client folder.
   * @throws FolderError `exists` when another entry has the name, `in-trash` for Trash itself.
   */
  async rename(relative: string, name: string): Promise<string> {
    checkName(name)
    if (relative === TRASH) throw new FolderError('in-trash', 'Trash keeps its name')
    const { dir, name: from } = await this.entry(relative)
    await this.claim(dir, name, path.join(dir, from))
    await rename(path.join(dir, from), path.join(dir, name))
    return this.relativeOf(dir, name)
  }

  /**
   * Move an entry into another folder of the client folder, keeping its name.
   * @param relative - the entry relative to the client folder.
   * @param to - the target folder relative to the client folder.
   * @returns the moved entry relative to the client folder.
   * @throws FolderError `into-itself` for a folder moved into itself or below it, `exists` when the target folder has
   *   an entry with the name, `in-trash` for Trash itself or a target that is Trash or in it (Move to Trash records
   *   the origin; a plain move does not).
   */
  async move(relative: string, to: string): Promise<string> {
    if (relative === TRASH) throw new FolderError('in-trash', 'Trash stays at the client folder root')
    keepOutOfTrash(to)
    const { dir, name, isDirectory } = await this.entry(relative)
    const target = await this.folder(to)
    const source = path.join(dir, name)
    if (isDirectory && within(source, target)) throw new FolderError('into-itself', `${relative} cannot move into ${to}`)
    if (target === dir) return this.relativeOf(dir, name)
    await this.claim(target, name)
    await rename(source, path.join(target, name))
    return this.relativeOf(target, name)
  }

  /**
   * Write an uploaded file. The bytes go into a hidden file in the target folder; a hard link then gives them their
   * name, which fails when the name is taken, so an existing file is never replaced and a partial file never shows.
   * @param dirRelative - the target folder relative to the client folder.
   * @param name - the file's name.
   * @param body - the file's bytes.
   * @param limits - the byte cap.
   * @returns the new file relative to the client folder.
   * @throws FolderError `exists` when the name is taken, `too-large` above the cap, `in-trash` for a target that is
   *   Trash or in it.
   */
  async upload(dirRelative: string, name: string, body: AsyncIterable<Uint8Array>, limits: UploadLimits): Promise<string> {
    checkName(name)
    keepOutOfTrash(dirRelative)
    const dir = await this.folder(dirRelative)
    const temporary = path.join(dir, `${UPLOAD_PREFIX}${randomUUID()}`)
    const handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o644)
    try {
      let written = 0
      try {
        for await (const chunk of body) {
          written += chunk.byteLength
          if (written > limits.maxBytes) throw new FolderError('too-large', `${name} is larger than ${limits.maxBytes} bytes`)
          await handle.write(chunk)
        }
      } finally {
        await handle.close()
      }
      try {
        await link(temporary, path.join(dir, name))
      } catch (error: unknown) {
        if (codeOf(error) === 'EEXIST') throw new FolderError('exists', `${name} exists in ${dirRelative}`)
        throw error
      }
    } finally {
      await unlink(temporary)
    }
    return this.relativeOf(dir, name)
  }

  /**
   * Move an entry into the Trash folder at the client folder root, which is made when it is missing. A name that Trash
   * already has gets the first free form "name 2.ext", "name 3.ext", …; nothing is deleted or replaced.
   * @param relative - the entry relative to the client folder.
   * @returns the entry's path in Trash.
   * @throws FolderError `in-trash` for Trash itself or an entry in it.
   */
  async trash(relative: string): Promise<string> {
    if (isTrashPath(relative)) throw new FolderError('in-trash', `${relative} is Trash or in it`)
    const { dir, name } = await this.entry(relative)
    const trash = await this.ensureFolder(TRASH)
    const free = await freeName(trash, name)
    await rename(path.join(dir, name), path.join(trash, free))
    return this.relativeOf(trash, free)
  }

  /**
   * Put an entry of Trash back where it came from. Folders on the way that are gone are made again; a name that is
   * taken there gets the first free form "name 2.ext", …
   * @param relative - the entry in Trash relative to the client folder.
   * @param from - the entry's path before Move to Trash.
   * @returns the entry's restored path.
   * @throws FolderError `bad-request` for an entry that is not in Trash, `outside` for an origin outside the client
   *   folder.
   */
  async restore(relative: string, from: string): Promise<string> {
    if (!relative.startsWith(`${TRASH}/`)) throw new FolderError('bad-request', `${relative} is not in Trash`)
    const { dir, name } = await this.entry(relative)
    const parts = partsOf(from)
    const wanted = parts.pop()
    if (wanted === undefined) throw new FolderError('bad-request', 'an empty origin')
    const target = await this.ensureFolder(parts.join('/'))
    const free = await freeName(target, wanted)
    await rename(path.join(dir, name), path.join(target, free))
    return this.relativeOf(target, free)
  }

  /**
   * Find the files and folders whose name holds every word of a query, case and accents aside. Hidden entries, links,
   * special files and Trash are left out.
   * @param query - the words to find.
   * @param maxHits - the cap on returned hits.
   * @returns the hits in path order and whether the cap dropped some.
   */
  async search(query: string, maxHits: number): Promise<FolderSearchAnswer> {
    const words = fold(query).split(/\s+/u).filter(word => word !== '')
    const hits: FolderSearchHit[] = []
    if (words.length === 0) return { hits, truncated: false }
    const walk = async (dir: string, prefix: string): Promise<boolean> => {
      const children = (await readdir(dir, { withFileTypes: true }))
        .filter(child => !child.name.startsWith('.') && (child.isFile() || child.isDirectory()) && !(prefix === '' && child.name === TRASH))
        .sort((a, b) => a.name.localeCompare(b.name))
      for (const child of children) {
        const key = prefix === '' ? child.name : `${prefix}/${child.name}`
        const name = fold(child.name)
        if (words.every(word => name.includes(word))) {
          if (hits.length === maxHits) return true
          hits.push({ path: key, kind: child.isDirectory() ? 'directory' : 'file' })
        }
        if (child.isDirectory() && await walk(path.join(dir, child.name), key)) return true
      }
      return false
    }
    const truncated = await walk(this.root, '')
    return { hits, truncated }
  }

  /**
   * Resolve a folder inside the client folder, making each missing part of it.
   * @param relative - the folder relative to the client folder.
   * @returns its real path.
   */
  private async ensureFolder(relative: string): Promise<string> {
    let current = this.root
    for (const part of partsOf(relative)) {
      try {
        await mkdir(path.join(current, part))
      } catch (error: unknown) {
        if (codeOf(error) !== 'EEXIST') throw error
      }
      current = await this.folder(path.relative(this.root, path.join(current, part)).split(path.sep).join('/'))
    }
    return current
  }

  /**
   * Refuse a name that another entry in a folder has.
   * @param dir - the folder's real path.
   * @param name - the wanted name.
   * @param self - the entry that is renamed, which may keep its own name in another case.
   */
  private async claim(dir: string, name: string, self?: string): Promise<void> {
    const wanted = path.join(dir, name)
    let existing: string
    try {
      existing = await realpath(wanted)
    } catch (error: unknown) {
      if (codeOf(error) === 'ENOENT') return
      throw error
    }
    if (self !== undefined && existing === await realpath(self)) return
    throw new FolderError('exists', `${name} exists`)
  }

  /** The `/`-separated path of `name` in the real folder `dir`, relative to the client folder. */
  private relativeOf(dir: string, name: string): string {
    return [...path.relative(this.root, dir).split(path.sep).filter(part => part !== ''), name].join('/')
  }
}
