/**
 * The client folder of Add client: one folder in `clientsRoot` with the client template folders and the About file, and
 * its workspace. Add client copies no public data into it and makes no family or matter folder. Every write goes
 * through `ClientFolder` and never replaces a file or a folder, so a second call for the same client finds everything
 * and changes nothing.
 * @module
 */

import { lstat, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { ClientFolder, FolderError } from '../folder.ts'
import type { FolderSource } from '../route.ts'
import type { RecordStore } from '../sources.ts'
import { clientFolderName, type ClientFolderAnswer, type ClientFolderRequest } from './wire.ts'

/** The folders of the firm's template. */
export interface FolderTemplate {
  /** The folders at the client folder root, such as `00 Client`. */
  client: string[]
  /** The folders of each matter folder, for the matter folder that a later change makes when work on a matter starts. */
  matter: string[]
  /** The matter folder that takes the dated copies of public data; one of `matter`. */
  publicData: string
}

/** The file at the client folder root that says what the folder is. */
export const ABOUT_FILE = 'About this folder.md'

/** What making a client folder needs. */
export interface ClientFolderPlan {
  readonly request: ClientFolderRequest
  /** The folder that holds the client folders. */
  readonly clientsRoot: string
  /** The folders at the client folder root. */
  readonly template: readonly string[]
  readonly sources: RecordStore<FolderSource>
  /** Make the client folder a workspace; a second call for the same path gives the same workspace. */
  readonly createWorkspace: (folder: string, title: string) => Promise<{ readonly id: string }>
  readonly now: () => Date
}

/**
 * Make the client folder, its template folders, its About file and its workspace, or find them. The source record of
 * each template folder and of the About file says `add-client` from `template`.
 * @param plan - the request and what it needs.
 * @returns the workspace, the folder relative to `clientsRoot`, and whether this call made the client folder.
 * @throws FolderError `invalid-name` when no folder can have the client name, `outside` when a link or a file has it,
 *   `not-directory` when a file has the name of a template folder.
 */
export async function makeClientFolder(plan: ClientFolderPlan): Promise<ClientFolderAnswer> {
  const { request, sources, now } = plan
  const name = clientFolderName(request.name)
  if (name === undefined) throw new FolderError('invalid-name', `the client name ${JSON.stringify(request.name)} cannot be a folder name`)
  const root = path.join(plan.clientsRoot, name)
  const made = await mkdir(root, { recursive: true }) !== undefined
  // The folder name has no separator, so a real folder (not a link) at this path is inside clientsRoot.
  if (!(await lstat(root)).isDirectory()) throw new FolderError('outside', `${root} is a link or a file, not a client folder`)
  const workspace = (await plan.createWorkspace(root, request.name)).id
  const folder = await ClientFolder.at(root)
  const source = (): FolderSource => ({ kind: 'add-client', at: now().toISOString(), from: 'template' })
  for (const child of plan.template) {
    const ensured = await folder.ensure('', child)
    if (ensured.made) await sources.record(workspace, ensured.path, source())
  }
  let about: string
  try {
    about = await folder.writeNew('', ABOUT_FILE, aboutMarkdown(request, now()))
  } catch (error: unknown) {
    // An earlier request for the client wrote the file, with its source record.
    if (error instanceof FolderError && error.code === 'exists') return { workspace, folder: name, made }
    throw error
  }
  await sources.record(workspace, about, source())
  return { workspace, folder: name, made }
}

/** The Markdown of the About file; file content, in English like the other files that the plugin writes. */
function aboutMarkdown(request: ClientFolderRequest, at: Date): string {
  return `# ${request.name}\n\nAdd client made this client folder on ${at.toISOString().slice(0, 10)}. The Firm Record has the client, its conflict check and its EP applications. FlowLeap copied no public data into this folder.\n\nApplicant names of the client group: ${request.names.length === 0 ? 'none' : request.names.join('; ')}.\n`
}
