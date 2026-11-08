/**
 * The browser's calls to the folder routes of the Host half, at document-relative paths on the same origin.
 * @module
 */

import { FOLDER_ROUTES, type FolderFailureCode, type FolderListing, type FolderWritten } from '../route.ts'

/** The answer of one folder act: its value, or the failure code (`network` when no answer came). */
export type FolderResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: FolderFailureCode | 'network' | 'internal' }

/** A route path relative to the document, like the other app routes. */
const relative = (route: string): string => route.slice(1)

/** The failure code of an answer body, or `internal`. */
function codeOf(body: unknown): FolderFailureCode | 'internal' {
  return typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
    ? body.error as FolderFailureCode
    : 'internal'
}

/** Read one answer. */
async function answer<T>(response: Response): Promise<FolderResult<T>> {
  let body: unknown
  try {
    body = await response.json()
  } catch (_error: unknown) {
    // An answer that is not JSON is a fault of the Host, not of the request.
    return { ok: false, error: 'internal' }
  }
  return response.ok ? { ok: true, value: body as T } : { ok: false, error: codeOf(body) }
}

/** Send one request; a failed network call is `network`. */
async function call<T>(url: string, init: RequestInit): Promise<FolderResult<T>> {
  let response: Response
  try {
    response = await fetch(url, { credentials: 'include', cache: 'no-store', ...init })
  } catch (_error: unknown) {
    // No answer: the connection failed or the request was aborted.
    return { ok: false, error: 'network' }
  }
  return answer<T>(response)
}

/** One upload's progress, from 0 to 1. */
export type UploadProgress = (fraction: number) => void

/** The folder acts of one client folder. */
export interface FolderApi {
  /** List one folder. */
  list(path: string, signal?: AbortSignal): Promise<FolderResult<FolderListing>>
  /** Make a folder in `parent`. */
  mkdir(parent: string, name: string): Promise<FolderResult<FolderWritten>>
  /** Rename an entry in its folder. */
  rename(path: string, name: string): Promise<FolderResult<FolderWritten>>
  /** Move an entry into the folder `to`. */
  move(path: string, to: string): Promise<FolderResult<FolderWritten>>
  /** Upload one file into `dir` under `name`. */
  upload(dir: string, name: string, file: Blob, progress: UploadProgress): Promise<FolderResult<FolderWritten>>
}

/**
 * The folder acts of one workspace.
 * @param workspace - the workspace id.
 * @returns the acts.
 */
export function createFolderApi(workspace: string): FolderApi {
  const post = <T>(route: string, body: object): Promise<FolderResult<T>> => call<T>(relative(route), {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspace, ...body }),
  })
  return {
    list: (path, signal) => call(`${relative(FOLDER_ROUTES.list)}?${new URLSearchParams({ workspace, path })}`, signal === undefined ? {} : { signal }),
    mkdir: (parent, name) => post(FOLDER_ROUTES.mkdir, { parent, name }),
    rename: (path, name) => post(FOLDER_ROUTES.rename, { path, name }),
    move: (path, to) => post(FOLDER_ROUTES.move, { path, to }),
    upload: (dir, name, file, progress) => new Promise((resolve) => {
      // XMLHttpRequest reports the progress of a request body; fetch does not.
      const request = new XMLHttpRequest()
      request.open('POST', `${relative(FOLDER_ROUTES.upload)}?${new URLSearchParams({ workspace, dir, name })}`)
      request.withCredentials = true
      request.upload.onprogress = (event) => { if (event.lengthComputable) progress(event.loaded / event.total) }
      request.onerror = () => { resolve({ ok: false, error: 'network' }) }
      request.onload = () => {
        void answer<FolderWritten>(new Response(request.responseText, { status: request.status })).then(resolve)
      }
      request.send(file)
    }),
  }
}
