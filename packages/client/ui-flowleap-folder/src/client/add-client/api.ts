/**
 * The browser's calls to the Add client routes of the Host half, at document-relative paths on the same origin: the
 * four routes of Add client, and the firm identity and docket routes of the Firm identity section of Settings. The Host
 * and this page ship together and share the answer types of `wire.ts`.
 * @module
 */

import {
  ADD_CLIENT_ROUTES, type AddClientFailureCode, type BuildRequest, type BuildStatus, type DocketAnswer, type DocketReadRequest,
  type FindAnswer, type FirmIdentity, type FirmIdentityAnswer, type ReviewAnswer, type ReviewRequest, type StatusAnswer,
} from '../../add-client/wire.ts'

/** Why a Host call failed: a route failure, no answer (`network`), or an answer that is not JSON (`internal`). */
export type HostFailure = AddClientFailureCode | 'network'

/** The answer of one Host call. */
export type HostResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: HostFailure }

const CODES: ReadonlySet<string> = new Set<AddClientFailureCode>(['bad-request', 'invalid-name', 'no-key', 'unreachable', 'stopped', 'internal'])

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
  /** The group's EP applications at your firm and at other firms, and the conflicts that the EP Register shows. */
  review(request: ReviewRequest, signal?: AbortSignal): Promise<HostResult<ReviewAnswer>>
  /** Start or resume the build of a client folder; the Host answers 202 with the status. */
  build(request: BuildRequest): Promise<HostResult<BuildStatus>>
  /** The status of every build. */
  status(signal?: AbortSignal): Promise<HostResult<StatusAnswer>>
}

/** The Add client routes on the same origin. */
export const addClientApi: AddClientApi = {
  find: (name, signal) => call(`${relative(ADD_CLIENT_ROUTES.find)}?${new URLSearchParams({ name })}`, signal === undefined ? {} : { signal }),
  review: (request, signal) => post(ADD_CLIENT_ROUTES.review, request, signal),
  build: request => post(ADD_CLIENT_ROUTES.build, request),
  status: signal => call(relative(ADD_CLIENT_ROUTES.status), signal === undefined ? {} : { signal }),
}

/** The firm identity and firm docket routes. */
export interface FirmIdentityApi {
  /** The firm identity now and the docket state. */
  identity(signal?: AbortSignal): Promise<HostResult<FirmIdentityAnswer>>
  /** Save the whole firm identity; the docket then reads again. */
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
