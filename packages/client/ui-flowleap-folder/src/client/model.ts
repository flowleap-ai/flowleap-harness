/**
 * The state of the client folder page: which client folder is open, under which Session the browser reads its files,
 * which folder the middle area lists or which file it shows, the listings the tree has loaded, and the acts in
 * progress (a name in edit, a move, uploads and a name conflict). The page renders this snapshot and calls the
 * model's acts; the model calls the folder routes and refreshes the listings after each write.
 * @module
 */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { FolderEntry, FolderFailureCode } from '../route.ts'
import type { FolderApi, FolderResult } from './api.ts'

/** A failure the page words: a route failure, no answer, or a fault of the Host. */
export type FailureCode = FolderFailureCode | 'network' | 'internal'

/** What the page knows of one folder's listing. */
export interface ListingState {
  /** `loading` until the first answer; a failed reload keeps the last entries. */
  status: 'loading' | 'loaded' | 'failed'
  /** The entries of the last answer. */
  entries: FolderEntry[]
  /** The last answer was cut to the entry cap. */
  truncated: boolean
  /** ISO-8601 instant of the last answer. */
  asOf?: string
}

/** A name in edit: a new folder in `parent`, or a new name for the entry at `path`. */
export type NameEdit =
  | { kind: 'new-folder'; parent: string; error?: FailureCode }
  | { kind: 'rename'; path: string; error?: FailureCode }

/** One upload in progress. */
export interface UploadState {
  id: number
  /** The target folder. */
  dir: string
  name: string
  /** From 0 to 1. */
  progress: number
}

/** A dropped file whose name a file in the target folder already has. */
export interface ConflictState {
  id: number
  dir: string
  name: string
}

/** What the page shows when an act ends. */
export type Notice =
  | { kind: 'added'; count: number; folder: string }
  | { kind: 'failed'; error: FailureCode }

/** The page's snapshot; the store's drafts change it, so its fields are not `readonly`. */
export interface FolderSnapshot {
  /** The open client folder, or null on the Clients list. */
  workspaceId: WorkspaceId | null
  /** The Session the browser reads files under; null while it is resolved. */
  session: SessionId | null
  /** `failed` when no Session could be resolved for the client folder. */
  connect: 'idle' | 'connecting' | 'ready' | 'failed'
  /** The folder the middle area lists, relative to the client folder. */
  folder: string
  /** The file the middle area shows, relative to the client folder; null for the folder's list. */
  open: string | null
  /** The listings by folder path. */
  listings: Record<string, ListingState>
  /** The folders the tree shows open. */
  expanded: string[]
  /** The checked rows of the list, as entry paths. */
  checked: string[]
  edit: NameEdit | null
  /** The entries in the Move to dialog, or null when it is closed. */
  moving: string[] | null
  /** Why the last move failed, shown in the dialog. */
  moveError: FailureCode | null
  uploads: UploadState[]
  conflict: ConflictState | null
  notice: Notice | null
}

/** A listing that is not known yet. */
function loadingListing(): ListingState {
  return { status: 'loading', entries: [], truncated: false }
}

/**
 * The names in a folder, as the page knows them.
 * @param state - the page's snapshot.
 * @param folder - the folder.
 * @returns the names of its listed entries; none for a folder that is not listed.
 */
export function namesIn(state: FolderSnapshot, folder: string): Set<string> {
  return new Set((state.listings[folder]?.entries ?? []).map(entry => entry.name))
}

/** The join of a folder path and a name. */
export function childPath(folder: string, name: string): string {
  return folder === '' ? name : `${folder}/${name}`
}

/** The folder of an entry path. */
export function parentOf(path: string): string {
  const cut = path.lastIndexOf('/')
  return cut === -1 ? '' : path.slice(0, cut)
}

/** The last part of an entry path. */
export function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

/** Every folder above an entry, from the top. */
function ancestors(path: string): string[] {
  const parts = path === '' ? [] : path.split('/')
  return parts.map((_part, index) => parts.slice(0, index + 1).join('/'))
}

/**
 * The name that "Keep both" gives an uploaded file: the first of "name 2.ext", "name 3.ext", … that no entry has,
 * as the file manager of macOS names a copy.
 * @param name - the uploaded file's name.
 * @param taken - the names in the target folder.
 * @returns the free name.
 */
export function keepBothName(name: string, taken: ReadonlySet<string>): string {
  const dot = name.lastIndexOf('.')
  const [stem, extension] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, '']
  for (let count = 2; ; count += 1) {
    const candidate = `${stem} ${count}${extension}`
    if (!taken.has(candidate)) return candidate
  }
}

/** What the model needs from the app. */
export interface FolderModelDeps {
  /** The Session to read a client folder's files under: the workspace's blank Session. */
  readonly connect: (workspaceId: WorkspaceId) => Promise<SessionId>
  /** The folder acts of a workspace. */
  readonly apiFor: (workspaceId: WorkspaceId) => FolderApi
  /** Follow the changes of one folder under a Session; returns its disposer. */
  readonly watch?: (session: SessionId, folder: string, changed: () => void) => () => void
  /** The clock of a listing's time. */
  readonly now?: () => Date
}

const EMPTY: FolderSnapshot = {
  workspaceId: null, session: null, connect: 'idle', folder: '', open: null, listings: {}, expanded: [], checked: [],
  edit: null, moving: null, moveError: null, uploads: [], conflict: null, notice: null,
}

/** The client folder page's state and acts. */
export class FolderModel {
  readonly store: SnapshotStore<FolderSnapshot> = createSnapshotStore<FolderSnapshot>(EMPTY, { flush: 'sync' })
  private api: FolderApi | null = null
  private generation = 0
  private nextId = 1
  private stopWatch: (() => void) | null = null
  /** The dropped files that wait for their upload or for a conflict decision, in upload order; `state.uploads` shows them. */
  private queue: { readonly id: number; readonly dir: string; name: string; readonly file: File }[] = []
  /** The client-folder generation whose upload loop runs; a later drop of that generation joins its queue. */
  private drainingGeneration: number | null = null

  /** @param deps - the app's Session and folder routes. */
  constructor(private readonly deps: FolderModelDeps) {}

  /** The current snapshot. */
  get state(): FolderSnapshot {
    return this.store.getSnapshot()
  }

  /**
   * Open a client folder at a folder, or close it with null.
   * @param workspaceId - the client's workspace, or null for the Clients list.
   * @param folder - the folder to list, relative to the client folder.
   * @returns once the Session is resolved and the folder is listed.
   */
  async openClient(workspaceId: WorkspaceId | null, folder = ''): Promise<void> {
    this.generation += 1
    const generation = this.generation
    this.stopWatching()
    this.queue = []
    this.api = workspaceId === null ? null : this.deps.apiFor(workspaceId)
    this.store.set({ ...EMPTY, workspaceId, connect: workspaceId === null ? 'idle' : 'connecting' })
    if (workspaceId === null) return
    let session: SessionId
    try {
      session = await this.deps.connect(workspaceId)
    } catch (_error: unknown) {
      // The Host refused the blank Session; the page says the folder cannot open and offers Try again.
      if (generation === this.generation) this.store.update((draft) => { draft.connect = 'failed' })
      return
    }
    if (generation !== this.generation) return
    this.store.update((draft) => {
      draft.session = session
      draft.connect = 'ready'
    })
    await this.go(folder)
  }

  /**
   * List a folder in the middle area and open it and the folders above it in the tree.
   * @param folder - the folder relative to the client folder.
   * @returns once it is listed.
   */
  async go(folder: string): Promise<void> {
    this.store.update((draft) => {
      draft.folder = folder
      draft.open = null
      draft.checked = []
      draft.edit = null
      draft.expanded = [...new Set([...draft.expanded, ...ancestors(folder)])]
    })
    this.follow(folder)
    await Promise.all(['', ...ancestors(folder)].map(path => this.refresh(path)))
  }

  /**
   * Show a file in the middle area.
   * @param path - the file relative to the client folder.
   */
  openFile(path: string): void {
    const folder = parentOf(path)
    this.store.update((draft) => {
      draft.folder = folder
      draft.open = path
      draft.checked = []
      draft.edit = null
      draft.expanded = [...new Set([...draft.expanded, ...ancestors(folder)])]
    })
    this.follow(folder)
  }

  /** Go back from a file to its folder's list. */
  closeFile(): void {
    this.store.update((draft) => { draft.open = null })
  }

  /**
   * Open or close a folder in the tree; an opened folder is listed.
   * @param folder - the folder.
   * @param open - whether to open it.
   * @returns once an opened folder is listed.
   */
  async toggle(folder: string, open: boolean): Promise<void> {
    this.store.update((draft) => {
      draft.expanded = open ? [...new Set([...draft.expanded, folder])] : draft.expanded.filter(path => path !== folder)
    })
    if (open && this.state.listings[folder]?.status !== 'loaded') await this.refresh(folder)
  }

  /**
   * List one folder again. A failed listing keeps its last entries.
   * @param folder - the folder.
   * @returns once the answer is in.
   */
  async refresh(folder: string): Promise<void> {
    const api = this.api
    if (api === null) return
    const generation = this.generation
    this.store.update((draft) => { draft.listings[folder] ??= loadingListing() })
    const result = await api.list(folder)
    if (generation !== this.generation) return
    this.store.update((draft) => {
      const listing = draft.listings[folder] ??= loadingListing()
      if (result.ok) Object.assign(listing, { status: 'loaded', entries: [...result.value.entries], truncated: result.value.truncated, asOf: this.now().toISOString() })
      else listing.status = 'failed'
    })
  }

  /**
   * Check or uncheck a row.
   * @param path - the entry path.
   * @param on - whether it is checked.
   */
  check(path: string, on: boolean): void {
    this.store.update((draft) => {
      draft.checked = on ? [...new Set([...draft.checked, path])] : draft.checked.filter(item => item !== path)
    })
  }

  /** Uncheck every row. */
  clearChecks(): void {
    this.store.update((draft) => { draft.checked = [] })
  }

  /** Open the name field of a new folder in the listed folder. */
  startNewFolder(): void {
    this.store.update((draft) => {
      draft.open = null
      draft.edit = { kind: 'new-folder', parent: draft.folder }
    })
  }

  /**
   * Open the name field of an entry.
   * @param path - the entry.
   */
  startRename(path: string): void {
    this.store.update((draft) => { draft.edit = { kind: 'rename', path } })
  }

  /** Close the name field with no change. */
  cancelEdit(): void {
    this.store.update((draft) => { draft.edit = null })
  }

  /**
   * Make the folder or rename the entry of the open name field. A refusal keeps the field open with its reason.
   * @param name - the typed name.
   * @returns once the act is done.
   */
  async commitEdit(name: string): Promise<void> {
    const edit = this.state.edit
    const api = this.api
    if (edit === null || api === null) return
    const result = await (edit.kind === 'new-folder' ? api.mkdir(edit.parent, name) : api.rename(edit.path, name))
    if (!result.ok) {
      this.store.update((draft) => { if (draft.edit !== null) draft.edit = { ...draft.edit, error: result.error } })
      return
    }
    const parent = edit.kind === 'new-folder' ? edit.parent : parentOf(edit.path)
    this.store.update((draft) => {
      draft.edit = null
      draft.checked = []
      if (edit.kind === 'rename' && draft.open === edit.path) draft.open = result.value.path
    })
    await this.refresh(parent)
  }

  /**
   * Open the Move to dialog for entries.
   * @param paths - the entries.
   */
  startMove(paths: readonly string[]): void {
    if (paths.length === 0) return
    this.store.update((draft) => {
      draft.moving = [...paths]
      draft.moveError = null
    })
  }

  /** Close the Move to dialog. */
  cancelMove(): void {
    this.store.update((draft) => {
      draft.moving = null
      draft.moveError = null
    })
  }

  /**
   * Move the entries of the dialog into a folder. The dialog stays open with the reason when a move fails; the entries
   * that moved before it stay moved.
   * @param to - the target folder.
   * @returns once the moves are done.
   */
  async commitMove(to: string): Promise<void> {
    const paths = this.state.moving
    const api = this.api
    if (paths === null || api === null) return
    const touched = new Set([to])
    for (const path of paths) {
      const result = await api.move(path, to)
      touched.add(parentOf(path))
      if (!result.ok) {
        this.store.update((draft) => { draft.moveError = result.error })
        await Promise.all([...touched].map(folder => this.refresh(folder)))
        return
      }
      this.store.update((draft) => { if (draft.open === path) draft.open = result.value.path })
    }
    this.store.update((draft) => {
      draft.moving = null
      draft.checked = []
    })
    await Promise.all([...touched].map(folder => this.refresh(folder)))
  }

  /**
   * Upload files into a folder, one after another. A file whose name is taken waits for the Keep both or Skip
   * decision, and the files after it wait for that decision.
   * @param files - the dropped or chosen files.
   * @param dir - the target folder.
   * @returns once every file is written, skipped, or waits for a decision.
   */
  async upload(files: readonly File[], dir: string): Promise<void> {
    const queued = files.map(file => ({ id: this.nextId++, dir, name: file.name, file }))
    this.queue.push(...queued)
    this.store.update((draft) => {
      draft.notice = null
      draft.uploads.push(...queued.map(({ id, name }) => ({ id, dir, name, progress: 0 })))
    })
    await this.drain()
  }

  /**
   * Decide a name conflict: Keep both gives the file a free name, Skip drops it.
   * @param keep - true for Keep both.
   * @returns once the waiting uploads are done or wait again.
   */
  async resolveConflict(keep: boolean): Promise<void> {
    const conflict = this.state.conflict
    const [head] = this.queue
    if (conflict === null || head === undefined) return
    if (keep) {
      head.name = keepBothName(conflict.name, namesIn(this.state, conflict.dir))
      this.store.update((draft) => {
        draft.conflict = null
        for (const upload of draft.uploads) if (upload.id === head.id) Object.assign(upload, { name: head.name, progress: 0 })
      })
    } else {
      this.queue.shift()
      this.store.update((draft) => {
        draft.conflict = null
        draft.uploads = draft.uploads.filter(item => item.id !== head.id)
      })
    }
    await this.drain()
  }

  /** Close the notice. */
  dismissNotice(): void {
    this.store.update((draft) => { draft.notice = null })
  }

  /** Stop following changes; the page is gone. */
  dispose(): void {
    this.generation += 1
    this.stopWatching()
  }

  /**
   * Upload the waiting files in order until one conflicts or none is left. One loop runs at a time, so a later drop only
   * adds to its queue; the loop stops when the person opens another client folder.
   */
  private async drain(): Promise<void> {
    const api = this.api
    const generation = this.generation
    if (api === null || this.drainingGeneration === generation || this.state.conflict !== null) return
    this.drainingGeneration = generation
    let added = 0
    let folder = ''
    try {
      for (let next = this.queue[0]; next !== undefined; next = this.queue[0]) {
        const { id, dir } = next
        const result: FolderResult<unknown> = await api.upload(dir, next.name, next.file, (progress) => {
          this.store.update((draft) => { for (const upload of draft.uploads) if (upload.id === id) upload.progress = progress })
        })
        if (generation !== this.generation) return
        if (!result.ok && result.error === 'exists') {
          await this.refresh(dir)
          const name = next.name
          this.store.update((draft) => { draft.conflict = { id, dir, name } })
          return
        }
        this.queue.shift()
        this.store.update((draft) => {
          draft.uploads = draft.uploads.filter(item => item.id !== id)
          if (!result.ok) draft.notice = { kind: 'failed', error: result.error }
        })
        if (result.ok) {
          added += 1
          folder = dir
        }
        await this.refresh(dir)
      }
      if (added > 0 && this.state.notice?.kind !== 'failed') {
        this.store.update((draft) => { draft.notice = { kind: 'added', count: added, folder } })
      }
    } finally {
      if (this.drainingGeneration === generation) this.drainingGeneration = null
    }
  }

  /** Follow the changes of the listed folder, and only of it. */
  private follow(folder: string): void {
    this.stopWatching()
    const session = this.state.session
    if (this.deps.watch === undefined || session === null) return
    this.stopWatch = this.deps.watch(session, folder, () => { void this.refresh(folder) })
  }

  private stopWatching(): void {
    this.stopWatch?.()
    this.stopWatch = null
  }

  private now(): Date {
    return this.deps.now?.() ?? new Date()
  }
}
