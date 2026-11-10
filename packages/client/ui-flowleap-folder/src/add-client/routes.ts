/**
 * The Add client routes of the Host half: `find` gives the applicant names of a company with their register counts,
 * `matters` gives the firm's matters of a group of names from the firm docket, `others` counts the group's EP
 * applications at other firms, `conflict-check` reads the possible conflicts, `client-folder` makes the client folder of
 * a recorded client, `settings` reports the batch size of the Firm Record commands, `docket` reports the state of the
 * firm docket, `docket/read` reads it again, `identity` reports the firm identity with the docket state,
 * `identity/save` saves a new firm identity, which reads the docket again, and `client-names` takes the names of the
 * firm's clients for the opponent index. Only a firm administrator may save the identity, and `identity` answers
 * whether this request may; the docket routes stay open to every person, because they only read the public register
 * again for the saved identity. The routes read public data through the `flowleapPatentData` Service when the runtime
 * has it; without it, every route but `client-folder`, `settings` and the identity routes says so, and a saved identity
 * and the client names wait for the Service. `client-folder` reads no public data.
 * @module
 */

import { PatentDataError, type PatentData } from '@deepseek-ai/dsh-flowleap-connectors'
import { FolderError } from '../folder.ts'
import type { FolderSource } from '../route.ts'
import type { RecordStore } from '../sources.ts'
import { makeClientFolder, type FolderTemplate } from './client-folder.ts'
import { registerConflicts } from './conflict-check.ts'
import type { FirmDocket } from './docket.ts'
import { countNames, firmMatters, matchingNames, othersCount } from './group.ts'
import type { FirmIdentityStore } from './identity-store.ts'
import { messageOf } from './message.ts'
import type { OpponentIndex } from './opponent-index.ts'
import {
  ADD_CLIENT_STATUS, type AddClientFailure, type AddClientFailureCode, type AddClientSettingsAnswer, type ClientFolderAnswer,
  type ConflictCheckAnswer, type DocketAnswer, type FindAnswer, type FirmIdentity, type FirmIdentityAnswer, type KnownClient,
  type MattersAnswer, type OpponentIndexAnswer, type OthersAnswer,
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
  /** The rows of the register sample of `find`. */
  readonly findSampleRows: number
  /** The most names that `find` counts. */
  readonly findNameLimit: number
  /** The most rows of one date slice of the `op=` reads of the conflict check. */
  readonly registerSliceRows: number
  /** The most applications in one batch command of the Firm Record, which the browser sends. */
  readonly recordBatchSize: number
}

/** What the routes use. */
export interface AddClientServices {
  /** The patent data Service now, or undefined while the runtime has none. */
  readonly data: () => PatentData | undefined
  readonly docket: FirmDocket
  /** The applications that the names of the firm's clients opposed, for the conflict check. */
  readonly index: OpponentIndex
  /** The firm identity that the conflict check matches and the docket reads for. */
  readonly identity: FirmIdentityStore
  /** Whether a request is of a firm administrator, who alone may save the firm identity. */
  readonly isAdmin: (request: Request) => Promise<boolean>
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

/** A list of strings that may be empty or blank, or a `bad-request` refusal. */
function entries(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.every((item): item is string => typeof item === 'string')) throw new AddClientError('bad-request', `${label} must be a list of strings`)
  return value
}

/** The firm identity of a save request. */
function identityOf(value: unknown): FirmIdentity {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new AddClientError('bad-request', 'identity must be an object')
  const { names, addresses, representatives } = value as Record<string, unknown>
  return {
    names: entries(names, 'identity.names'), addresses: entries(addresses, 'identity.addresses'),
    representatives: entries(representatives, 'identity.representatives'),
  }
}

/** The known clients of a conflict check request. */
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
      // A failed patent data read logs its reason too: the person sees only `unreachable` or `no-key`.
      if (code === 'internal' || error instanceof PatentDataError) this.services.log(`ui-flowleap-folder: Add client: ${messageOf(error)}`)
      const body: AddClientFailure = { error: code }
      return json(body, ADD_CLIENT_STATUS[code])
    }
  }

  /**
   * `GET find?name=`: the applicant names that hold every word of a company name, from a register sample of
   * `findSampleRows` rows and from the firm docket, at most `findNameLimit` of them, each with its register count. Only
   * the typed name and the found names leave the firm.
   * @param request - the authenticated request.
   * @returns the JSON answer.
   */
  async find(request: Request): Promise<Response> {
    const name = text(new URL(request.url).searchParams.get('name'), 'name')
    const data = this.services.data()
    if (data === undefined) return json({ status: 'no-plugin' } satisfies FindAnswer)
    const { findSampleRows, findNameLimit } = this.settings
    const asOf = this.services.now().toISOString()
    const sample = await data.findApplicantNames(name, { maxRows: findSampleRows }, request.signal)
    const { rows } = await this.services.docket.served()
    const found = matchingNames(name, sample.names.map(entry => entry.name), rows ?? [])
    const kept = found.slice(0, findNameLimit)
    return json({
      status: 'found', source: sample.source, ...(sample.edition === undefined ? {} : { edition: sample.edition }),
      names: await countNames(data, kept, request.signal), omitted: found.length - kept.length, sampleRows: findSampleRows,
      truncated: sample.truncated, asOf,
    } satisfies FindAnswer)
  }

  /**
   * `POST matters` with a `NamesRequest`: the firm's EP applications of the names, from the firm docket. Nothing is read
   * from the EP Register.
   * @param request - the authenticated request.
   * @returns the JSON answer.
   */
  async matters(request: Request): Promise<Response> {
    const { names } = await bodyOf(request)
    const group = texts(names, 'names')
    if (this.services.data() === undefined) return json({ status: 'no-plugin' } satisfies MattersAnswer)
    const { state, rows } = await this.services.docket.served()
    return json({ status: 'matters', docket: state, ...firmMatters(group, rows) } satisfies MattersAnswer)
  }

  /**
   * `POST others` with a `NamesRequest`: the count of the group's EP applications whose representative is not the firm.
   * @param request - the authenticated request.
   * @returns the JSON answer.
   */
  async others(request: Request): Promise<Response> {
    const { names } = await bodyOf(request)
    const group = texts(names, 'names')
    const data = this.services.data()
    if (data === undefined) return json({ status: 'no-plugin' } satisfies OthersAnswer)
    const asOf = this.services.now().toISOString()
    const { rows } = await this.services.docket.served()
    const atFirm = firmMatters(group, rows).rows.filter(row => !row.addressOnly).length
    return json({ status: 'counted', ...await othersCount(data, group, atFirm, request.signal), asOf } satisfies OthersAnswer)
  }

  /**
   * `POST conflict-check` with a `ConflictCheckRequest`: the possible conflicts that the EP Register shows, in two
   * halves, with how complete each half is.
   * @param request - the authenticated request.
   * @returns the JSON answer.
   */
  async conflictCheck(request: Request): Promise<Response> {
    const body = await bodyOf(request)
    const names = texts(body.names, 'names')
    const clients = knownClients(body.clients)
    const data = this.services.data()
    if (data === undefined) return json({ status: 'no-plugin' } satisfies ConflictCheckAnswer)
    const { services, settings } = this
    const asOf = services.now().toISOString()
    const input = {
      names, clients, identity: await services.identity.current(), index: await services.index.current(),
      slices: { sliceRows: settings.registerSliceRows, clock: { now: () => services.now().getTime() }, label: 'ui-flowleap-folder: conflict check', log: services.log },
    }
    const { hits, groupOpposedClients, clientsOpposedGroup } = await registerConflicts(data, input, asOf, request.signal)
    return json({ status: 'checked', asOf, conflicts: hits, conflictCheck: { groupOpposedClients, clientsOpposedGroup } } satisfies ConflictCheckAnswer)
  }

  /**
   * `POST client-folder` with a `ClientFolderRequest`: make the client folder of a client that the Firm Record has now,
   * with the client template folders, the About file and its workspace, or find them.
   * @param request - the authenticated request.
   * @returns the JSON answer.
   */
  async clientFolder(request: Request): Promise<Response> {
    const body = await bodyOf(request)
    const clientId = text(body.clientId, 'clientId')
    if (!CLIENT_ID.test(clientId)) throw new AddClientError('bad-request', 'clientId must be a lower-case UUID')
    const { services, settings } = this
    const answer = await makeClientFolder({
      request: { clientId, name: text(body.name, 'name'), names: texts(body.names, 'names') }, clientsRoot: settings.clientsRoot,
      template: settings.folderTemplate.client, sources: services.sources, createWorkspace: services.createWorkspace, now: services.now,
    })
    return json(answer satisfies ClientFolderAnswer)
  }

  /**
   * `GET settings`: the Add client settings that the browser uses.
   * @returns the JSON answer.
   */
  settingsAnswer(): Response {
    return json({ recordBatchSize: this.settings.recordBatchSize } satisfies AddClientSettingsAnswer)
  }

  /**
   * `GET docket`: the state of the firm docket.
   * @returns the JSON answer.
   */
  async docket(): Promise<Response> {
    return json(await this.docketAnswer())
  }

  /**
   * `POST docket/read` with a `DocketReadRequest`: read every slice of the firm docket again, or only the failed
   * slices. While a read runs, the answer is its state and nothing else changes.
   * @param request - the authenticated request.
   * @returns the JSON answer.
   */
  async docketRead(request: Request): Promise<Response> {
    const { slices } = await bodyOf(request)
    if (slices !== 'all' && slices !== 'failed') throw new AddClientError('bad-request', 'slices must be "all" or "failed"')
    if (this.services.data() === undefined) return json({ status: 'no-plugin' } satisfies DocketAnswer)
    return json({ status: 'docket', docket: await this.services.docket.readAgain(slices) } satisfies DocketAnswer)
  }

  /**
   * `GET identity`: the firm identity now, the state of the firm docket, and whether this request may save.
   * @param request - the authenticated request.
   * @returns the JSON answer.
   */
  async identity(request: Request): Promise<Response> {
    const identity = await this.services.identity.current()
    const canSave = await this.services.isAdmin(request)
    return json({ identity, docket: await this.docketAnswer(), canSave } satisfies FirmIdentityAnswer)
  }

  /**
   * `POST identity/save` with a `FirmIdentitySaveRequest`: save the firm identity, then give it to the firm docket,
   * which drops the rows of the old identity and reads again. The same identity reads nothing again.
   * @param request - the authenticated request.
   * @returns the JSON answer with the saved identity and the docket state after the change.
   * @throws {AddClientError} `not-admin` when the request is not of a firm administrator; nothing changes.
   */
  async identitySave(request: Request): Promise<Response> {
    if (!await this.services.isAdmin(request)) throw new AddClientError('not-admin', 'a firm identity save without a valid X-Flowleap-Admin header')
    const { identity: body } = await bodyOf(request)
    const identity = await this.services.identity.save(identityOf(body))
    const docket = await this.services.docket.setIdentity(identity)
    const answer: DocketAnswer = this.services.data() === undefined ? { status: 'no-plugin' } : { status: 'docket', docket }
    return json({ identity, docket: answer, canSave: true } satisfies FirmIdentityAnswer)
  }

  /**
   * `POST client-names` with a `ClientNamesRequest`: keep the names of the firm's clients and read the opponent index
   * for them. Without the patent data Service, the names wait for it.
   * @param request - the authenticated request.
   * @returns the JSON answer with the index state after the change.
   */
  async clientNames(request: Request): Promise<Response> {
    const { names } = await bodyOf(request)
    const index = await this.services.index.setNames(texts(names, 'names'))
    return json((this.services.data() === undefined ? { status: 'no-plugin' } : { status: 'index', index }) satisfies OpponentIndexAnswer)
  }

  /** The docket answer now. */
  private async docketAnswer(): Promise<DocketAnswer> {
    if (this.services.data() === undefined) return { status: 'no-plugin' }
    return { status: 'docket', docket: await this.services.docket.state() }
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
