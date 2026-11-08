/**
 * The folder routes that both halves share: their paths, their request fields and their JSON answers.
 * @module
 */

/** Absolute Host path of the folder routes on the shared `/api` channel. */
export const FOLDER_API = '/api/flowleap/folder'

/** One route for each act: the listing, the JSON writes, the streamed upload, Trash and Restore, and the search. */
export const FOLDER_ROUTES = {
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

/** How a file or a folder came into the client folder, when this plugin wrote it. */
export type FolderSourceKind = 'upload' | 'folder'

/** The recorded source of one entry: the act that wrote it and when. */
export interface FolderSource {
  /** `upload` for an uploaded file, `folder` for a folder made with New folder. */
  readonly kind: FolderSourceKind
  /** ISO-8601 instant of the act. */
  readonly at: string
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
