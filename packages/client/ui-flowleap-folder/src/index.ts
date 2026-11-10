/**
 * FlowLeap client folder, Host half: the authenticated routes under `/api/flowleap/folder/` that name the workspaces
 * whose folder is a client folder in `clientsRoot`, list one folder of a client folder with each entry's modified time
 * and recorded source, make a folder, rename, move, write an uploaded file, move an entry to Trash and back, and find
 * entries by name. A client folder is the folder of one workspace;
 * every path is relative to it and is checked in `ClientFolder` before any disk act. No route deletes or replaces an
 * entry: Move to Trash moves it into the `Trash` folder at the client folder root. The Add client routes under
 * `add-client/` read the public patent data through the optional `flowleapPatentData` Service and build a client
 * folder inside `clientsRoot` as a job that goes on after its request ends. The browser half (`exports["./client"]`)
 * is the Clients page and the Add client page.
 *
 * See packages/client/ui-flowleap-folder/README.md.
 * @module @deepseek-ai/dsh-client-ui-flowleap-folder
 */

import { access, realpath } from 'node:fs/promises'
import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-client-connection'
import type { PatentData } from '@deepseek-ai/dsh-flowleap-connectors'
import type {} from '@deepseek-ai/dsh-workspace'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { widenBuild, type FolderTemplate } from './add-client/build.ts'
import type { FirmIdentity } from './add-client/identity.ts'
import { BuildJobs } from './add-client/jobs.ts'
import { AddClientRoutes } from './add-client/routes.ts'
import { ADD_CLIENT_ROUTES } from './add-client/wire.ts'
import { ClientFolder, FolderError, checkName } from './folder.ts'
import {
  FAILURE_STATUS, FOLDER_ROUTES, TRASH, isTrashPath, type ClientFoldersAnswer, type FolderFailure, type FolderSource, type FolderWritten,
  type MkdirRequest, type MoveRequest, type RenameRequest, type TrashRequest,
} from './route.ts'
import { sourceStore, trashStore, type RecordStore, type TrashOrigin } from './sources.ts'

export { FOLDER_API, FOLDER_ROUTES, TRASH, isTrashPath } from './route.ts'
export type * from './route.ts'
export { ADD_CLIENT_API, ADD_CLIENT_ROUTES, BUILD_STEPS } from './add-client/wire.ts'
export type * from './add-client/wire.ts'
export type { FolderTemplate } from './add-client/build.ts'
export type { FirmIdentity } from './add-client/identity.ts'

/** Cordis plugin name. */
export const name = 'ui-flowleap-folder'

/** The connection that authenticates the routes, and the workspaces whose folders they act on. */
export const inject = ['connection', 'workspaceRegistry']

/** Plugin config. */
export interface Config {
  /** The plugin's state folder; the source records go into its `sources/` folder. */
  stateDir: string
  /** Cap on the entries of one listing; the rest is dropped and reported cut. */
  maxEntries: number
  /** Inclusive byte cap of one uploaded file. */
  maxUploadBytes: number
  /** Cap on the hits of one search by name. */
  maxSearchHits: number
  /** A file whose presence means the Host disk is low; while it exists, uploads are refused. Empty: no check. */
  storageLowFlagPath: string
  /** The absolute folder that holds the client folders that Add client builds; every Add client write stays in it. */
  clientsRoot: string
  /** The folders that Add client makes in each client folder and each matter folder. */
  folderTemplate: FolderTemplate
  /** The firm's names, addresses and representatives; matched on the Host against the register, never sent out. */
  firmIdentity: FirmIdentity
  /** The row cap of one EP Register query of Add client; the EPO answers at most 10,000. */
  maxRegisterRows: number
}

/** Runtime schema for the folder row. */
export const Config: z<Config> = z.object({
  stateDir: z.string().required(),
  maxEntries: z.number().step(1).min(1).default(2000),
  maxUploadBytes: z.number().step(1).min(1).default(200 * 1024 * 1024),
  maxSearchHits: z.number().step(1).min(1).default(200),
  storageLowFlagPath: z.string().default(''),
  clientsRoot: z.string().required(),
  folderTemplate: z.object({
    client: z.array(String).default(['00 Client']),
    matter: z.array(String).default(['Associates', 'Client', 'Drafts', 'Internal', 'Office', 'Search']),
    publicData: z.string().default('Office'),
  }).default({ client: ['00 Client'], matter: ['Associates', 'Client', 'Drafts', 'Internal', 'Office', 'Search'], publicData: 'Office' }),
  firmIdentity: z.object({
    names: z.array(String).default([]),
    addresses: z.array(String).default([]),
    representatives: z.array(String).default([]),
  }).default({ names: [], addresses: [], representatives: [] }),
  maxRegisterRows: z.number().step(1).min(1).max(10000).default(500),
})

/**
 * Check the row config.
 * @param config - the row config.
 * @throws Error when `clientsRoot` is not absolute, a template folder name is not a valid name or repeats, or
 *   `publicData` is not a matter template folder.
 */
export function checkConfig(config: Config): void {
  if (!path.isAbsolute(config.clientsRoot)) throw new Error(`ui-flowleap-folder: clientsRoot must be an absolute path, got ${JSON.stringify(config.clientsRoot)}`)
  const { client, matter, publicData } = config.folderTemplate
  for (const [label, names] of [['client', client], ['matter', matter]] as const) {
    for (const name of names) {
      try {
        checkName(name)
      } catch (_error: unknown) {
        // The template is the firm's config: a bad name stops the row at load, with the name.
        throw new Error(`ui-flowleap-folder: folderTemplate.${label} has the invalid folder name ${JSON.stringify(name)}`)
      }
    }
    if (new Set(names).size !== names.length) throw new Error(`ui-flowleap-folder: folderTemplate.${label} repeats a folder name`)
  }
  if (!matter.includes(publicData)) throw new Error(`ui-flowleap-folder: folderTemplate.publicData ${JSON.stringify(publicData)} is not a matter folder`)
}

/** A JSON answer that is never cached. */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
}

/** The JSON answer of a refused act. */
function failure(error: FolderError): Response {
  const body: FolderFailure = { error: error.code }
  return json(body, FAILURE_STATUS[error.code])
}

/** A string field of a request, or a `bad-request` refusal. */
function field(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new FolderError('bad-request', `${label} must be a string`)
  return value
}

/** The JSON object body of a request, or a `bad-request` refusal. */
async function bodyOf(request: Request): Promise<Record<string, unknown>> {
  let body: unknown
  try {
    body = await request.json()
  } catch (_error: unknown) {
    // A body that is not JSON is the caller's fault: the route answers 400.
    throw new FolderError('bad-request', 'the body is not JSON')
  }
  if (typeof body !== 'object' || body === null) throw new FolderError('bad-request', 'the body is not an object')
  return body as Record<string, unknown>
}

/** The folder acts behind the routes, over the workspaces and the source records. */
export class FolderRoutes {
  /**
   * @param ctx - the Host context, carrying `workspaceRegistry` and the logger.
   * @param config - the checked row config.
   * @param sources - the source records.
   * @param trash - the Trash records.
   * @param now - the clock of the records.
   */
  constructor(
    private readonly ctx: Context,
    private readonly config: Config,
    private readonly sources: RecordStore<FolderSource>,
    private readonly trash: RecordStore<TrashOrigin>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * Answer one request, turning a refused act into its failure answer and any other error into a 500 that names
   * nothing of the disk.
   * @param act - the act.
   * @returns the act's answer.
   */
  async answer(act: () => Promise<Response>): Promise<Response> {
    try {
      return await act()
    } catch (error: unknown) {
      if (error instanceof FolderError) return failure(error)
      this.ctx.logger.warn(`ui-flowleap-folder: ${error instanceof Error ? error.message : String(error)}`)
      return json({ error: 'internal' }, 500)
    }
  }

  /**
   * The client folder of a workspace id.
   * @param workspace - the workspace id from the request.
   * @returns the checked client folder.
   */
  async folderOf(workspace: string): Promise<ClientFolder> {
    const entity = this.ctx.workspaceRegistry.get(workspace as WorkspaceId)
    if (entity === undefined) throw new FolderError('no-workspace', `no workspace ${workspace}`)
    return ClientFolder.at(entity.path)
  }

  /**
   * `GET clients`: the workspaces whose folder is a direct child of `clientsRoot`, so the Clients list leaves out every
   * other workspace of the runtime, such as its default workspace.
   * @returns the JSON answer.
   */
  async clients(): Promise<Response> {
    let root: string
    try {
      // The registry keeps each workspace path through `fs.realpath`, so the root is compared in the same form.
      root = await realpath(this.config.clientsRoot)
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      // Add client makes `clientsRoot` with the first client folder: before that, no workspace is a client folder.
      return json({ workspaces: [] } satisfies ClientFoldersAnswer)
    }
    const workspaces = this.ctx.workspaceRegistry.list().filter(entity => path.dirname(entity.path) === root).map(entity => entity.id)
    return json({ workspaces } satisfies ClientFoldersAnswer)
  }

  /**
   * `GET list?workspace=&path=`.
   * @param request - the authenticated request.
   * @returns the JSON answer.
   */
  async list(request: Request): Promise<Response> {
    const query = new URL(request.url).searchParams
    const workspace = field(query.get('workspace'), 'workspace')
    const folder = await this.folderOf(workspace)
    const listed = query.get('path') ?? ''
    const trashed = listed === TRASH ? await this.trash.read(workspace) : new Map<string, TrashOrigin>()
    return json(await folder.list(listed, this.config.maxEntries, await this.sources.read(workspace), trashed))
  }

  /**
   * `POST mkdir` with a {@link MkdirRequest}.
   * @param request - the authenticated request.
   * @returns the JSON answer.
   */
  async mkdir(request: Request): Promise<Response> {
    const body = await bodyOf(request)
    const input: MkdirRequest = { workspace: field(body.workspace, 'workspace'), parent: field(body.parent, 'parent'), name: field(body.name, 'name') }
    const made = await (await this.folderOf(input.workspace)).mkdir(input.parent, input.name)
    await this.sources.record(input.workspace, made, { kind: 'folder', at: this.now().toISOString() })
    return json({ path: made } satisfies FolderWritten)
  }

  /**
   * `POST rename` with a {@link RenameRequest}.
   * @param request - the authenticated request.
   * @returns the JSON answer.
   */
  async rename(request: Request): Promise<Response> {
    const body = await bodyOf(request)
    const input: RenameRequest = { workspace: field(body.workspace, 'workspace'), path: field(body.path, 'path'), name: field(body.name, 'name') }
    const renamed = await (await this.folderOf(input.workspace)).rename(input.path, input.name)
    await this.carry(input.workspace, input.path, renamed)
    return json({ path: renamed } satisfies FolderWritten)
  }

  /**
   * `POST move` with a {@link MoveRequest}.
   * @param request - the authenticated request.
   * @returns the JSON answer.
   */
  async move(request: Request): Promise<Response> {
    const body = await bodyOf(request)
    const input: MoveRequest = { workspace: field(body.workspace, 'workspace'), path: field(body.path, 'path'), to: field(body.to, 'to') }
    const moved = await (await this.folderOf(input.workspace)).move(input.path, input.to)
    // An entry moved out of Trash is back in use: its origin no longer applies.
    if (isTrashPath(input.path)) await this.trash.forget(input.workspace, input.path)
    await this.carry(input.workspace, input.path, moved)
    return json({ path: moved } satisfies FolderWritten)
  }

  /**
   * `POST trash` with a {@link TrashRequest}: the entry moves into Trash and its origin is recorded.
   * @param request - the authenticated request.
   * @returns the JSON answer.
   */
  async moveToTrash(request: Request): Promise<Response> {
    const input = await trashInput(request)
    const trashed = await (await this.folderOf(input.workspace)).trash(input.path)
    await this.carry(input.workspace, input.path, trashed)
    await this.trash.record(input.workspace, trashed, { from: input.path, at: this.now().toISOString() })
    return json({ path: trashed } satisfies FolderWritten)
  }

  /**
   * `POST restore` with a {@link TrashRequest}: the entry of Trash goes back to its recorded origin.
   * @param request - the authenticated request.
   * @returns the JSON answer.
   */
  async restore(request: Request): Promise<Response> {
    const input = await trashInput(request)
    const origin = (await this.trash.read(input.workspace)).get(input.path)
    if (origin === undefined) throw new FolderError('no-origin', `${input.path} has no recorded origin`)
    const restored = await (await this.folderOf(input.workspace)).restore(input.path, origin.from)
    await this.trash.forget(input.workspace, input.path)
    await this.sources.moved(input.workspace, input.path, restored)
    return json({ path: restored } satisfies FolderWritten)
  }

  /**
   * `GET search?workspace=&q=`: the files and folders whose name holds every word of the query.
   * @param request - the authenticated request.
   * @returns the JSON answer.
   */
  async search(request: Request): Promise<Response> {
    const query = new URL(request.url).searchParams
    const folder = await this.folderOf(field(query.get('workspace'), 'workspace'))
    return json(await folder.search(field(query.get('q'), 'q'), this.config.maxSearchHits))
  }

  /** Carry the records of a renamed or moved entry, and of everything below it, to its new path. */
  private async carry(workspace: string, from: string, to: string): Promise<void> {
    await this.sources.moved(workspace, from, to)
    await this.trash.moved(workspace, from, to)
  }

  /**
   * `POST upload?workspace=&dir=&name=` with the file's bytes as the body.
   * @param request - the authenticated request.
   * @returns the JSON answer.
   */
  async upload(request: Request): Promise<Response> {
    const query = new URL(request.url).searchParams
    const workspace = field(query.get('workspace'), 'workspace')
    const dir = field(query.get('dir'), 'dir')
    const fileName = field(query.get('name'), 'name')
    if (this.config.storageLowFlagPath !== '' && await exists(this.config.storageLowFlagPath)) {
      throw new FolderError('storage-low', 'the Host disk is low')
    }
    const folder = await this.folderOf(workspace)
    const written = await folder.upload(dir, fileName, request.body ?? emptyBody(), { maxBytes: this.config.maxUploadBytes })
    await this.sources.record(workspace, written, { kind: 'upload', at: this.now().toISOString() })
    return json({ path: written } satisfies FolderWritten)
  }
}

/** The body of a Trash or Restore request. */
async function trashInput(request: Request): Promise<TrashRequest> {
  const body = await bodyOf(request)
  return { workspace: field(body.workspace, 'workspace'), path: field(body.path, 'path') }
}

/** Whether a path exists. */
async function exists(file: string): Promise<boolean> {
  try {
    await access(file)
    return true
  } catch (_error: unknown) {
    // Absent or unreadable: the flag is not set.
    return false
  }
}

/** The bytes of a request with no body. */
async function* emptyBody(): AsyncIterable<Uint8Array> {}

/**
 * Register the folder routes.
 * @param ctx - the mounting context, carrying `connection` and `workspaceRegistry`.
 * @param config - the row config.
 */
export function apply(ctx: Context, config: Config): void {
  checkConfig(config)
  const sources = sourceStore(config.stateDir)
  const routes = new FolderRoutes(ctx, config, sources, trashStore(config.stateDir))
  const warn = (message: string) => { ctx.logger.warn(message) }
  const jobs = new BuildJobs(path.join(config.stateDir, 'builds'), () => new Date(), warn, widenBuild)
  ctx.effect(() => () => jobs.dispose(), 'ui-flowleap-folder: Add client builds')
  // The patent data plugin is optional: without it, Add client adds a client by name with the template folders.
  let data: PatentData | undefined
  ctx.inject(['flowleapPatentData'], (scope) => {
    data = scope.flowleapPatentData
    scope.effect(() => () => { data = undefined }, 'ui-flowleap-folder: patent data')
  })
  const addClient = new AddClientRoutes(config, {
    data: () => data, jobs, sources, now: () => new Date(), log: warn,
    createWorkspace: (folder, title) => ctx.workspaceRegistry.create(folder, title),
  })
  const register = (path: string, method: 'GET' | 'POST', requestBody: 'buffered' | 'streaming', act: (request: Request) => Promise<Response>) => {
    ctx.effect(() => ctx.connection.fetch.register({
      path, methods: [method], requestBody, fetch: request => routes.answer(() => act(request)),
    }), `ui-flowleap-folder: ${path}`)
  }
  register(FOLDER_ROUTES.clients, 'GET', 'buffered', () => routes.clients())
  register(FOLDER_ROUTES.list, 'GET', 'buffered', request => routes.list(request))
  register(FOLDER_ROUTES.mkdir, 'POST', 'buffered', request => routes.mkdir(request))
  register(FOLDER_ROUTES.rename, 'POST', 'buffered', request => routes.rename(request))
  register(FOLDER_ROUTES.move, 'POST', 'buffered', request => routes.move(request))
  register(FOLDER_ROUTES.upload, 'POST', 'streaming', request => routes.upload(request))
  register(FOLDER_ROUTES.trash, 'POST', 'buffered', request => routes.moveToTrash(request))
  register(FOLDER_ROUTES.restore, 'POST', 'buffered', request => routes.restore(request))
  register(FOLDER_ROUTES.search, 'GET', 'buffered', request => routes.search(request))
  const registerAddClient = (path: string, method: 'GET' | 'POST', act: (request: Request) => Promise<Response>) => {
    ctx.effect(() => ctx.connection.fetch.register({
      path, methods: [method], requestBody: 'buffered', fetch: request => addClient.answer(() => act(request)),
    }), `ui-flowleap-folder: ${path}`)
  }
  registerAddClient(ADD_CLIENT_ROUTES.find, 'GET', request => addClient.find(request))
  registerAddClient(ADD_CLIENT_ROUTES.review, 'POST', request => addClient.review(request))
  registerAddClient(ADD_CLIENT_ROUTES.build, 'POST', request => addClient.build(request))
  registerAddClient(ADD_CLIENT_ROUTES.status, 'GET', () => addClient.status())
}
