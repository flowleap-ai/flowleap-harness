/**
 * The folder routes that both halves share: their paths, their request fields and their JSON answers.
 * @module
 */

import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'

/** Absolute Host path of the folder routes on the shared `/api` channel. */
export const FOLDER_API = '/api/flowleap/folder'

/**
 * One route for each act: the client folders, the listing, the JSON writes, the streamed upload, Trash and Restore,
 * and the search.
 */
export const FOLDER_ROUTES = {
  clients: `${FOLDER_API}/clients`,
  list: `${FOLDER_API}/list`,
  mkdir: `${FOLDER_API}/mkdir`,
  rename: `${FOLDER_API}/rename`,
  move: `${FOLDER_API}/move`,
  upload: `${FOLDER_API}/upload`,
  trash: `${FOLDER_API}/trash`,
  restore: `${FOLDER_API}/restore`,
  search: `${FOLDER_API}/search`,
} as const

/** The folder at the client folder root that Move to Trash moves entries into; nothing in it is deleted. */
export const TRASH = 'Trash'

/**
 * Whether a path is Trash or lies in it.
 * @param relative - a path relative to the client folder.
 * @returns true for `Trash` and every path below it.
 */
export function isTrashPath(relative: string): boolean {
  return relative === TRASH || relative.startsWith(`${TRASH}/`)
}

/** The longest entry name in UTF-8 bytes that common file systems accept. */
const MAX_NAME_BYTES = 255

/** Device names that Windows reserves in any folder, with or without an extension. */
const WINDOWS_RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu

/** The length of a text in UTF-8 bytes. */
function bytesOf(text: string): number {
  return new TextEncoder().encode(text).length
}

/**
 * Whether a text can be the name of one entry: not empty, not `.` or `..`, no separator or NUL, no space at the start
 * or the end, at most 255 UTF-8 bytes, and not a reserved Windows device name.
 * @param name - the name.
 * @returns true when every file system that the plugin supports accepts the name.
 */
export function isEntryName(name: string): boolean {
  return name !== '' && name !== '.' && name !== '..' && !/[/\\\0]/u.test(name) && name.trim() === name
    && bytesOf(name) <= MAX_NAME_BYTES && !WINDOWS_RESERVED.test(name)
}

/**
 * The longest start of a text that has at most `maxBytes` UTF-8 bytes, cut between two user-perceived characters, so a
 * cut never splits an emoji or a letter with its accent.
 * @param text - the text.
 * @param maxBytes - the byte limit; at 0 or below, the answer is empty.
 * @returns the start of the text.
 */
export function cutToBytes(text: string, maxBytes: number): string {
  let cut = ''
  for (const { segment } of new Intl.Segmenter().segment(text)) {
    if (bytesOf(cut + segment) > maxBytes) break
    cut += segment
  }
  return cut
}

/**
 * A text as a folder name: each separator or NUL becomes `-`, white space becomes one space, the ends lose their
 * spaces, and the name is cut to 255 UTF-8 bytes with {@link cutToBytes}. Add client names its client, family and
 * matter folders this way, so a name such as `Novo Nordisk A/S` has the folder `Novo Nordisk A-S`.
 * @param text - the text, such as a client name or a title.
 * @returns the folder name; check it with {@link isEntryName}, because `.`, `..`, an empty text and a reserved Windows
 *   device name stay invalid.
 */
export function folderNameOf(text: string): string {
  return cutToBytes(text.replace(/[/\\\0]/gu, '-').replace(/\s+/gu, ' ').trim(), MAX_NAME_BYTES).trimEnd()
}

/** How a file or a folder came into the client folder, when this plugin wrote it. */
export type FolderSourceKind = 'upload' | 'folder' | 'add-client'

/** Where Add client took an entry from: the folder template, the EP Register, or the EPO publication server. */
export type AddClientOrigin = 'template' | 'ep-register' | 'epo-publication'

/** The role of a folder that Add client built. */
export type FolderRole = 'family' | 'matter'

/** The recorded source of one entry: the act that wrote it and when. */
export type FolderSource =
  | {
    /** `upload` for an uploaded file, `folder` for a folder made with New folder. */
    readonly kind: 'upload' | 'folder'
    /** ISO-8601 instant of the act. */
    readonly at: string
  }
  | {
    /** An entry that Add client wrote. */
    readonly kind: 'add-client'
    /** ISO-8601 instant of the read or the write. */
    readonly at: string
    readonly from: AddClientOrigin
    /** For a family or matter folder: its role. */
    readonly role?: FolderRole
    /** For a matter folder: its EP application number; for a family folder: the family id or its first application. */
    readonly key?: string
  }

/** One direct child of a listed folder. */
export interface FolderEntry {
  /** Basename inside the listed folder. */
  readonly name: string
  /** A regular file or a folder; links and other kinds are not listed. */
  readonly kind: 'file' | 'directory'
  /** Byte size of a file. */
  readonly size?: number
  /** ISO-8601 modification instant. */
  readonly modifiedAt: string
  /** The recorded source; absent when this plugin did not write the entry. */
  readonly source?: FolderSource
  /** For an entry in Trash: its path before Move to Trash, relative to the client folder. */
  readonly trashedFrom?: string
}

/** The answer of `GET clients`: the workspaces whose folder is a client folder, a direct child of `clientsRoot`. */
export interface ClientFoldersAnswer {
  /** The workspace ids, in the order of the workspace registry; empty while `clientsRoot` does not exist. */
  readonly workspaces: readonly WorkspaceId[]
}

/** The direct children of one folder inside the client folder. */
export interface FolderListing {
  /** The listed folder relative to the client folder, `/`-separated; empty for the client folder itself. */
  readonly path: string
  /** The children, in no particular order, cut to the configured entry cap. */
  readonly entries: readonly FolderEntry[]
  /** Whether the cap dropped children. */
  readonly truncated: boolean
}

/** The path of the entry that a write made, relative to the client folder. */
export interface FolderWritten {
  /** `/`-separated path of the new or moved entry. */
  readonly path: string
}

/** Why a folder act failed; each code is one localized sentence in the client. */
export type FolderFailureCode =
  | 'bad-request'
  | 'no-workspace'
  | 'not-found'
  | 'not-directory'
  | 'outside'
  | 'invalid-name'
  | 'exists'
  | 'into-itself'
  | 'too-large'
  | 'storage-low'
  | 'in-trash'
  | 'no-origin'

/** The JSON body of a failed folder act. */
export interface FolderFailure {
  /** The failure code. */
  readonly error: FolderFailureCode
}

/** HTTP status of each failure code. */
export const FAILURE_STATUS: Readonly<Record<FolderFailureCode, number>> = {
  'bad-request': 400,
  'no-workspace': 404,
  'not-found': 404,
  'not-directory': 409,
  'outside': 403,
  'invalid-name': 422,
  'exists': 409,
  'into-itself': 409,
  'too-large': 413,
  'storage-low': 507,
  'in-trash': 409,
  'no-origin': 409,
}

/** Body of `POST mkdir`: make `name` in the folder `parent`. */
export interface MkdirRequest {
  /** Workspace id of the client folder. */
  readonly workspace: string
  /** Parent folder relative to the client folder. */
  readonly parent: string
  /** Name of the new folder. */
  readonly name: string
}

/** Body of `POST rename`: give the entry at `path` the name `name` in the same folder. */
export interface RenameRequest {
  /** Workspace id of the client folder. */
  readonly workspace: string
  /** The entry relative to the client folder. */
  readonly path: string
  /** The new name. */
  readonly name: string
}

/** Body of `POST move`: move the entry at `path` into the folder `to`, keeping its name. */
export interface MoveRequest {
  /** Workspace id of the client folder. */
  readonly workspace: string
  /** The entry relative to the client folder. */
  readonly path: string
  /** The target folder relative to the client folder. */
  readonly to: string
}

/** Body of `POST trash` and `POST restore`: the entry to move to Trash, or the entry in Trash to put back. */
export interface TrashRequest {
  /** Workspace id of the client folder. */
  readonly workspace: string
  /** The entry relative to the client folder. */
  readonly path: string
}

/** One entry whose name matches a search. */
export interface FolderSearchHit {
  /** The entry relative to the client folder. */
  readonly path: string
  readonly kind: 'file' | 'directory'
}

/** The answer of `GET search?workspace=&q=`. */
export interface FolderSearchAnswer {
  /** The matching entries in path order, cut to the configured cap. */
  readonly hits: readonly FolderSearchHit[]
  /** Whether the cap dropped matches. */
  readonly truncated: boolean
}
