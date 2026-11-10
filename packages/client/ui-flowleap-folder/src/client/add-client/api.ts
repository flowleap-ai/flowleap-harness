/**
 * The browser's calls to the Add client routes of the Host half, at document-relative paths on the same origin: the
 * routes of the Add client steps, and the firm identity and docket routes of the Firm identity section of Settings. The Host
 * and this page ship together and share the answer types of `wire.ts`.
 * @module
 */

import {
  ADD_CLIENT_ROUTES, ADD_CLIENT_STATUS, type AddClientFailureCode, type AddClientSettingsAnswer, type ClientFolderAnswer,
  type ClientFolderRequest, type ClientNamesRequest, type ConflictCheckAnswer, type ConflictCheckRequest, type DocketAnswer,
  type DocketReadRequest, type FindAnswer, type FirmIdentity, type FirmIdentityAnswer, type MattersAnswer, type NamesRequest,
  type OpponentIndexAnswer, type OthersAnswer,
} from '../../add-client/wire.ts'

/** Why a Host call failed: a route failure, no answer (`network`), or an answer that is not JSON (`internal`). */
export type HostFailure = AddClientFailureCode | 'network'

/** The answer of one Host call. */
export type HostResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: HostFailure }

const CODES: ReadonlySet<string> = new Set(Object.keys(ADD_CLIENT_STATUS))

/** A route path relative to the document, like the other app routes. */
const relative = (route: string): string => route.slice(1)

async function call<T>(url: string, init: RequestInit): Promise<HostResult<T>> {
  let response: Response
  try {
    response = await fetch(url, { credentials: 'include', cache: 'no-store', ...init })
  } catch (_error: unknown) {
    // No answer: the connection failed or the request was aborted.
    return { ok: false, error: 'network' }
  }
  let body: unknown
  try {
    body = await response.json()
  } catch (_error: unknown) {
    // An answer that is not JSON is a fault of the Host, not of the request.
    return { ok: false, error: 'internal' }
  }
  if (response.ok) return { ok: true, value: body as T }
  const code = typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string' && CODES.has(body.error) ? body.error as AddClientFailureCode : 'internal'
  return { ok: false, error: code }
}

const post = <T>(route: string, body: object, signal?: AbortSignal): Promise<HostResult<T>> => call<T>(relative(route), {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), ...(signal === undefined ? {} : { signal }),
})

/** The Add client routes. */
export interface AddClientApi {
  /** The applicant names that match a company name. */
  find(name: string, signal?: AbortSignal): Promise<HostResult<FindAnswer>>
  /** The firm's EP applications of applicant names, from the firm docket, with the docket state. */
  matters(names: readonly string[], signal?: AbortSignal): Promise<HostResult<MattersAnswer>>
  /** The count of a group's EP applications at other firms. */
  others(names: readonly string[], signal?: AbortSignal): Promise<HostResult<OthersAnswer>>
  /** The two halves of the conflict check, and the conflicts that the EP Register shows. */
  conflictCheck(request: ConflictCheckRequest, signal?: AbortSignal): Promise<HostResult<ConflictCheckAnswer>>
  /** Read the failed slices of the firm docket again, or go on with an interrupted read. */
  readDocket(): Promise<HostResult<DocketAnswer>>
  /** Make the client folder of a recorded client, or find it. */
  clientFolder(request: ClientFolderRequest): Promise<HostResult<ClientFolderAnswer>>
  /** The settings of the row config that the browser uses, such as the batch size of the Firm Record commands. */
  settings(signal?: AbortSignal): Promise<HostResult<AddClientSettingsAnswer>>
  /** Send the names of the firm's clients, for the opponent index of the conflict check. */
  clientNames(names: readonly string[]): Promise<HostResult<OpponentIndexAnswer>>
}

/** The Add client routes on the same origin. */
export const addClientApi: AddClientApi = {
  find: (name, signal) => call(`${relative(ADD_CLIENT_ROUTES.find)}?${new URLSearchParams({ name })}`, signal === undefined ? {} : { signal }),
  matters: (names, signal) => post(ADD_CLIENT_ROUTES.matters, { names } satisfies NamesRequest, signal),
  others: (names, signal) => post(ADD_CLIENT_ROUTES.others, { names } satisfies NamesRequest, signal),
  conflictCheck: (request, signal) => post(ADD_CLIENT_ROUTES.conflictCheck, request, signal),
  readDocket: () => post(ADD_CLIENT_ROUTES.docketRead, { slices: 'failed' } satisfies DocketReadRequest),
  clientFolder: request => post(ADD_CLIENT_ROUTES.clientFolder, request),
  settings: signal => call(relative(ADD_CLIENT_ROUTES.settings), signal === undefined ? {} : { signal }),
  clientNames: names => post(ADD_CLIENT_ROUTES.clientNames, { names } satisfies ClientNamesRequest),
}

/** The firm identity and firm docket routes. */
export interface FirmIdentityApi {
  /** The firm identity now, the docket state, and whether this person may save. */
  identity(signal?: AbortSignal): Promise<HostResult<FirmIdentityAnswer>>
  /** Save the whole firm identity; the docket then reads again. A person who is not a firm administrator gets `not-admin`. */
  save(identity: FirmIdentity): Promise<HostResult<FirmIdentityAnswer>>
  /** The docket state. */
  docket(signal?: AbortSignal): Promise<HostResult<DocketAnswer>>
  /** Read every slice of the docket again, or only the failed slices. */
  readDocket(slices: DocketReadRequest['slices']): Promise<HostResult<DocketAnswer>>
}

/** The firm identity and firm docket routes on the same origin. */
export const firmIdentityApi: FirmIdentityApi = {
  identity: signal => call(relative(ADD_CLIENT_ROUTES.identity), signal === undefined ? {} : { signal }),
  save: identity => post(ADD_CLIENT_ROUTES.identitySave, { identity }),
  docket: signal => call(relative(ADD_CLIENT_ROUTES.docket), signal === undefined ? {} : { signal }),
  readDocket: slices => post(ADD_CLIENT_ROUTES.docketRead, { slices } satisfies DocketReadRequest),
}
