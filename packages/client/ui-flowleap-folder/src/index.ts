/**
 * FlowLeap client folder, Host half: the authenticated routes under `/api/flowleap/folder/` that list one folder of a
 * client folder with each entry's modified time and recorded source, make a folder, rename, move, and write an
 * uploaded file. A client folder is the folder of one workspace; every path is relative to it and is checked in
 * `ClientFolder` before any disk act. No route deletes or replaces an entry. The browser half
 * (`exports["./client"]`) is the Clients page.
 *
 * See packages/client/ui-flowleap-folder/README.md.
 * @module @deepseek-ai/dsh-client-ui-flowleap-folder
 */

import { access } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-workspace'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { ClientFolder, FolderError } from './folder.ts'
import {
  FAILURE_STATUS, FOLDER_ROUTES, type FolderFailure, type FolderWritten, type MkdirRequest, type MoveRequest,
  type RenameRequest,
} from './route.ts'
import { SourceStore } from './sources.ts'

export { FOLDER_API, FOLDER_ROUTES } from './route.ts'
export type * from './route.ts'

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
  /** A file whose presence means the Host disk is low; while it exists, uploads are refused. Empty: no check. */
  storageLowFlagPath: string
}

/** Runtime schema for the folder row. */
export const Config: z<Config> = z.object({
  stateDir: z.string().required(),
  maxEntries: z.number().step(1).min(1).default(2000),
  maxUploadBytes: z.number().step(1).min(1).default(200 * 1024 * 1024),
  storageLowFlagPath: z.string().default(''),
})

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
   * @param now - the clock of the recorded sources.
   */
  constructor(
    private readonly ctx: Context,
    private readonly config: Config,
    private readonly sources: SourceStore,
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

  /** The client folder of a workspace id. */
  async folderOf(workspace: string): Promise<ClientFolder> {
    const entity = this.ctx.workspaceRegistry.get(workspace as WorkspaceId)
    if (entity === undefined) throw new FolderError('no-workspace', `no workspace ${workspace}`)
    return ClientFolder.at(entity.path)
  }

  /** `GET list?workspace=&path=`. */
  async list(request: Request): Promise<Response> {
    const query = new URL(request.url).searchParams
    const workspace = field(query.get('workspace'), 'workspace')
    const folder = await this.folderOf(workspace)
    return json(await folder.list(query.get('path') ?? '', this.config.maxEntries, await this.sources.read(workspace)))
  }

  /** `POST mkdir` with a {@link MkdirRequest}. */
  async mkdir(request: Request): Promise<Response> {
    const body = await bodyOf(request)
    const input: MkdirRequest = { workspace: field(body.workspace, 'workspace'), parent: field(body.parent, 'parent'), name: field(body.name, 'name') }
    const made = await (await this.folderOf(input.workspace)).mkdir(input.parent, input.name)
    await this.sources.record(input.workspace, made, { kind: 'folder', at: this.now().toISOString() })
    return json({ path: made } satisfies FolderWritten)
  }

  /** `POST rename` with a {@link RenameRequest}. */
  async rename(request: Request): Promise<Response> {
    const body = await bodyOf(request)
    const input: RenameRequest = { workspace: field(body.workspace, 'workspace'), path: field(body.path, 'path'), name: field(body.name, 'name') }
    const renamed = await (await this.folderOf(input.workspace)).rename(input.path, input.name)
    await this.sources.moved(input.workspace, input.path, renamed)
    return json({ path: renamed } satisfies FolderWritten)
  }

  /** `POST move` with a {@link MoveRequest}. */
  async move(request: Request): Promise<Response> {
    const body = await bodyOf(request)
    const input: MoveRequest = { workspace: field(body.workspace, 'workspace'), path: field(body.path, 'path'), to: field(body.to, 'to') }
    const moved = await (await this.folderOf(input.workspace)).move(input.path, input.to)
    await this.sources.moved(input.workspace, input.path, moved)
    return json({ path: moved } satisfies FolderWritten)
  }

  /** `POST upload?workspace=&dir=&name=` with the file's bytes as the body. */
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
  const routes = new FolderRoutes(ctx, config, new SourceStore(config.stateDir))
  const register = (path: string, method: 'GET' | 'POST', requestBody: 'buffered' | 'streaming', act: (request: Request) => Promise<Response>) => {
    ctx.effect(() => ctx.connection.fetch.register({
      path, methods: [method], requestBody, fetch: request => routes.answer(() => act(request)),
    }), `ui-flowleap-folder: ${path}`)
  }
  register(FOLDER_ROUTES.list, 'GET', 'buffered', request => routes.list(request))
  register(FOLDER_ROUTES.mkdir, 'POST', 'buffered', request => routes.mkdir(request))
  register(FOLDER_ROUTES.rename, 'POST', 'buffered', request => routes.rename(request))
  register(FOLDER_ROUTES.move, 'POST', 'buffered', request => routes.move(request))
  register(FOLDER_ROUTES.upload, 'POST', 'streaming', request => routes.upload(request))
}
