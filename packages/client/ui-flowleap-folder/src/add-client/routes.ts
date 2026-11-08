/**
 * The Add client routes of the Host half: `find` reads the applicant names of a company, `review` reads the group's EP
 * applications and possible conflicts, `build` starts the client folder build, and `status` reports every build. The
 * routes read public data through the `flowleapPatentData` Service when the runtime has it; without it, `find` and
 * `review` say so and `build` makes the folder with the template folders only.
 * @module
 */

import { PatentDataError, parseEpApplication, type EpApplicationNumber, type PatentData } from '@deepseek-ai/dsh-flowleap-connectors'
import { FolderError, checkName } from '../folder.ts'
import type { FolderSource } from '../route.ts'
import type { RecordStore } from '../sources.ts'
import { buildClientFolder, type FolderTemplate } from './build.ts'
import type { FirmIdentity } from './identity.ts'
import { messageOf, type BuildJobs } from './jobs.ts'
import { review } from './review.ts'
import {
  ADD_CLIENT_STATUS, type AddClientFailure, type AddClientFailureCode, type FindAnswer, type KnownClient, type StatusAnswer,
} from './wire.ts'

/** A refused Add client act; `code` is the wire failure code. */
export class AddClientError extends Error {
  override readonly name = 'AddClientError'

  /**
   * @param code - the failure code the client words.
   * @param detail - a diagnostic message for the Host log, never shown to the person.
   */
  constructor(readonly code: AddClientFailureCode, detail: string) {
    super(detail)
  }
}

/** The settings of Add client from the row config. */
export interface AddClientSettings {
  readonly clientsRoot: string
  readonly folderTemplate: FolderTemplate
  readonly firmIdentity: FirmIdentity
  readonly maxRegisterRows: number
}

/** What the routes use. */
export interface AddClientServices {
  /** The patent data Service now, or undefined while the runtime has none. */
  readonly data: () => PatentData | undefined
  readonly jobs: BuildJobs
  readonly sources: RecordStore<FolderSource>
  readonly createWorkspace: (folder: string, title: string) => Promise<{ readonly id: string }>
  readonly now: () => Date
  readonly log: (message: string) => void
}

/** A UUID in lower case, the form of a Firm Record client id. */
const CLIENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u

/** A JSON answer that is never cached. */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
}

/** The JSON object body of a request, or a `bad-request` refusal. */
async function bodyOf(request: Request): Promise<Record<string, unknown>> {
  let body: unknown
  try {
    body = await request.json()
  } catch (_error: unknown) {
    // A body that is not JSON is the caller's fault: the route answers 400.
    throw new AddClientError('bad-request', 'the body is not JSON')
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new AddClientError('bad-request', 'the body is not an object')
  return body as Record<string, unknown>
}

/** A string field, or a `bad-request` refusal. */
function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new AddClientError('bad-request', `${label} must be a non-empty string`)
  return value
}

/** A list of strings, or a `bad-request` refusal. */
function texts(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new AddClientError('bad-request', `${label} must be a list`)
  return value.map((item, index) => text(item, `${label}[${index}]`))
}

/** The known clients of a review request. */
function knownClients(value: unknown): KnownClient[] {
  if (!Array.isArray(value)) throw new AddClientError('bad-request', 'clients must be a list')
  return value.map((item: unknown, index) => {
    if (typeof item !== 'object' || item === null) throw new AddClientError('bad-request', `clients[${index}] is not an object`)
    const { clientId, names } = item as Record<string, unknown>
    return { clientId: text(clientId, `clients[${index}].clientId`), names: texts(names, `clients[${index}].names`) }
  })
}

/** The Add client acts behind the routes. */
export class AddClientRoutes {
  /**
   * @param settings - the checked settings of the row config.
   * @param services - the Service, the jobs, the source records and the workspace registry.
   */
  constructor(private readonly settings: AddClientSettings, private readonly services: AddClientServices) {}

  /**
   * Answer one request, turning a refused act or a failed read into its failure answer.
   * @param act - the act.
   * @returns the act's answer.
   */
  async answer(act: () => Promise<Response>): Promise<Response> {
    try {
      return await act()
    } catch (error: unknown) {
      const code = codeOf(error)
      if (code === 'internal') this.services.log(`ui-flowleap-folder: Add client: ${messageOf(error)}`)
      const body: AddClientFailure = { error: code }
      return json(body, ADD_CLIENT_STATUS[code])
    }
  }

  /**
   * `GET find?name=`: the applicant names that match a company name. Only the name leaves the firm.
   * @param request - the authenticated request.
   * @returns the JSON answer.
   */
  async find(request: Request): Promise<Response> {
    const name = text(new URL(request.url).searchParams.get('name'), 'name')
    const data = this.services.data()
    if (data === undefined) return json({ status: 'no-plugin' } satisfies FindAnswer)
    const asOf = this.services.now().toISOString()
    const found = await data.findApplicantNames(name, { maxRows: this.settings.maxRegisterRows }, request.signal)
    return json({
      status: 'found', source: found.source, ...(found.edition === undefined ? {} : { edition: found.edition }),
      names: found.names, asOf, truncated: found.truncated,
    } satisfies FindAnswer)
  }

  /**
   * `POST review` with a a `ReviewRequest`: the group's EP applications at your firm and at other firms, and the
   * possible conflicts that the EP Register shows.
   * @param request - the authenticated request.
   * @returns the JSON answer.
   */
  async review(request: Request): Promise<Response> {
    const body = await bodyOf(request)
    const names = texts(body.names, 'names')
    const clients = knownClients(body.clients)
    const data = this.services.data()
    if (data === undefined) return json({ status: 'no-plugin' })
    const asOf = this.services.now().toISOString()
    const input = { names, clients, identity: this.settings.firmIdentity, maxRows: this.settings.maxRegisterRows }
    return json(await review(data, input, asOf, request.signal))
  }

  /**
   * `POST build` with a a `BuildRequest`: start the client folder build and answer its status at once. The build
   * goes on after the request ends; a build that runs for the client now is answered again.
   * @param request - the authenticated request.
   * @returns the JSON answer, status 202.
   */
  async build(request: Request): Promise<Response> {
    const body = await bodyOf(request)
    const clientId = text(body.clientId, 'clientId')
    if (!CLIENT_ID.test(clientId)) throw new AddClientError('bad-request', 'clientId must be a lower-case UUID')
    const name = text(body.name, 'name')
    try {
      checkName(name)
    } catch (_error: unknown) {
      // A client name that a folder cannot have: the page words it and the person renames the client.
      throw new AddClientError('invalid-name', `the client name ${JSON.stringify(name)} cannot be a folder name`)
    }
    const applications = texts(body.applications, 'applications').map((item): EpApplicationNumber => {
      const parsed = parseEpApplication(item)
      if (parsed === undefined) throw new AddClientError('bad-request', `${item} is not an EP application number`)
      return parsed
    })
    const input = { clientId, name, names: texts(body.names, 'names'), applications }
    const { services, settings } = this
    let status
    try {
      status = await services.jobs.start(clientId, name, job => buildClientFolder(job, {
        request: input, data: services.data(), clientsRoot: settings.clientsRoot, template: settings.folderTemplate,
        maxRows: settings.maxRegisterRows, sources: services.sources, createWorkspace: services.createWorkspace,
        now: services.now, log: services.log,
      }))
    } catch (_error: unknown) {
      // The jobs stop only when the plugin stops; the page asks again after the runtime is back.
      throw new AddClientError('stopped', 'the build jobs are stopped')
    }
    return json(status, 202)
  }

  /**
   * `GET status`: every build that this plugin ran.
   * @returns the JSON answer.
   */
  async status(): Promise<Response> {
    return json({ builds: await this.services.jobs.all() } satisfies StatusAnswer)
  }
}

/**
 * The failure code of an error of an act.
 * @param error - the error.
 * @returns the code; `internal` for an error that no code names.
 */
export function codeOf(error: unknown): AddClientFailureCode {
  if (error instanceof AddClientError) return error.code
  if (error instanceof PatentDataError) return error.code === 'no-key' ? 'no-key' : 'unreachable'
  if (error instanceof FolderError) return error.code === 'invalid-name' ? 'invalid-name' : 'internal'
  return 'internal'
}
