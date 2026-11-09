/**
 * The MyEPO API client: an OAuth 2.0 client-credentials token kept in memory and renewed before it expires, a
 * request gate that spaces the calls at the configured rate, the read operations of the API, and the typed
 * failures every caller switches on. The client reads its credentials through a callback on each token fetch, so a
 * replaced credential record takes effect at the next token. It holds no write operation.
 * @module
 */

import { unzipSync } from 'fflate'
import {
  errorBodySchema, parseApplications, parseBibliographicData, parseCommunications, parseDueDates, parseFees, parseFolders,
  parsePortfolios, parseTerms, tokenSchema,
  type MyEpoApplication, type MyEpoApplicationNumber, type MyEpoBibliographicData, type MyEpoCommunication, type MyEpoDueDate,
  type MyEpoFee, type MyEpoFolder, type MyEpoFolderId, type MyEpoPage, type MyEpoPortfolio, type MyEpoPortfolioId,
  type MyEpoProcedure, type MyEpoTerm,
} from './myepo-wire.ts'

/** The client ID and the client secret of the firm's MyEPO B2B account. */
export interface MyEpoCredentials {
  readonly clientId: string
  readonly clientSecret: string
}

/** Where the client calls and how fast: the `myepo` part of the plugin `Config`. */
export interface MyEpoEndpoint {
  /** The API base, for example `https://api.apps.epo.org/latest`; no trailing slash. */
  readonly baseUrl: string
  /** The OAuth 2.0 token endpoint of the EPO login service. */
  readonly tokenUrl: string
  /** The most requests the client starts in one second, token requests included. */
  readonly requestsPerSecond: number
  /** The deadline of one request, in seconds. */
  readonly timeoutSeconds: number
}

/**
 * Why a MyEPO call failed. `refused`: the login service refused the client ID or the secret, or the API refused a
 * fresh token. `no-permission`: the account lacks the right or the portfolio permission (`403`, `ERR_20`).
 * `not-ready`: the sandbox has no data before its first reset (`400`, `ERR_15`). `rejected`: another refusal, with the
 * EPO's code. `unreachable`: no answer before the deadline, a network failure, or a server error.
 * `invalid-response`: an answer FlowLeap cannot read. `not-linked`: no credentials are stored.
 */
export type MyEpoFailure =
  | { readonly kind: 'not-linked' }
  | { readonly kind: 'refused' }
  | { readonly kind: 'no-permission'; readonly code?: string }
  | { readonly kind: 'not-ready'; readonly code: string }
  | { readonly kind: 'rejected'; readonly status: number; readonly code?: string; readonly message: string }
  | { readonly kind: 'unreachable'; readonly status?: number }
  | { readonly kind: 'invalid-response'; readonly message: string }

/** A failed MyEPO call; `failure` says why. */
export class MyEpoError extends Error {
  /**
   * @param failure - why the call failed.
   * @param options - the underlying error, when there is one.
   */
  constructor(readonly failure: MyEpoFailure, options?: ErrorOptions) {
    super(describeFailure(failure), options)
    this.name = 'MyEpoError'
  }
}

/**
 * A one-line description of a failure, without a credential value.
 * @param failure - the failure.
 * @returns the description.
 */
export function describeFailure(failure: MyEpoFailure): string {
  switch (failure.kind) {
    case 'not-linked': return 'MyEPO is not linked'
    case 'refused': return 'the EPO refused the client ID or the client secret'
    case 'no-permission': return `the MyEPO account has no permission for this read${failure.code === undefined ? '' : ` (${failure.code})`}`
    case 'not-ready': return `the MyEPO sandbox has no data before its reset (${failure.code})`
    case 'rejected': return `the EPO refused the read: ${failure.status}${failure.code === undefined ? '' : ` ${failure.code}`} ${failure.message}`
    case 'unreachable': return `the EPO did not answer${failure.status === undefined ? '' : ` (${failure.status})`}`
    case 'invalid-response': return `the EPO answer could not be read: ${failure.message}`
  }
}

/** An application in a path: its procedure and number. */
export interface MyEpoApplicationRef {
  readonly procedure: MyEpoProcedure
  readonly number: MyEpoApplicationNumber
}

/** A page request: the 0-based page and its size; the EPO's defaults apply to an absent field. */
export interface MyEpoPageQuery {
  readonly page?: number
  readonly size?: number
}

/** The filters of `GET /applications`. */
export interface MyEpoApplicationQuery extends MyEpoPageQuery {
  readonly portfolioId?: MyEpoPortfolioId
  readonly applicationNumber?: MyEpoApplicationNumber
  readonly applicantFileReference?: string
  readonly procedure?: MyEpoProcedure
}

/** The filter of `GET /communications`. */
export interface MyEpoCommunicationQuery extends MyEpoPageQuery {
  readonly folderId?: MyEpoFolderId
}

/** A downloaded letter: the PDF of the EPO's ZIP and the communication it belongs to. */
export interface MyEpoDocument {
  readonly communication: MyEpoCommunication
  /** The file name inside the ZIP, for example `P79105WO1-2023.05.30-SE2023123456-I1015.pdf`. */
  readonly filename: string
  readonly pdf: Uint8Array
}

/** The read operations of the MyEPO API. Each call may reject with {@link MyEpoError}. */
export interface MyEpoReads {
  portfolios(signal?: AbortSignal): Promise<readonly MyEpoPortfolio[]>
  applications(query?: MyEpoApplicationQuery, signal?: AbortSignal): Promise<MyEpoPage<MyEpoApplication>>
  bibliographicData(application: MyEpoApplicationRef, signal?: AbortSignal): Promise<MyEpoBibliographicData>
  communications(query?: MyEpoCommunicationQuery, signal?: AbortSignal): Promise<MyEpoPage<MyEpoCommunication>>
  unhandledCommunications(query?: MyEpoPageQuery, signal?: AbortSignal): Promise<MyEpoPage<MyEpoCommunication>>
  folders(signal?: AbortSignal): Promise<readonly MyEpoFolder[]>
  downloadCommunication(communication: MyEpoCommunication, signal?: AbortSignal): Promise<MyEpoDocument>
  dueDates(application: MyEpoApplicationRef, signal?: AbortSignal): Promise<readonly MyEpoDueDate[]>
  terms(signal?: AbortSignal): Promise<readonly MyEpoTerm[]>
  pendingFees(application: MyEpoApplicationRef, signal?: AbortSignal): Promise<readonly MyEpoFee[]>
}

/** Spaces the start of each request at the configured rate, in call order. */
export interface RequestGate {
  /**
   * Wait for the next free start.
   * @param signal - cancels the wait.
   * @returns settles when the request may start.
   */
  wait(signal?: AbortSignal): Promise<void>
}

/**
 * Create a gate that starts at most `requestsPerSecond` requests in each second.
 * @param requestsPerSecond - the rate; positive.
 * @param now - the clock, epoch ms.
 * @param sleep - waits the given milliseconds; specs pass a fake.
 * @returns the gate.
 */
export function createRequestGate(
  requestsPerSecond: number,
  now: () => number = Date.now,
  sleep: (ms: number, signal?: AbortSignal) => Promise<void> = delay,
): RequestGate {
  const spacing = 1000 / requestsPerSecond
  let next = 0
  return {
    async wait(signal) {
      const start = Math.max(now(), next)
      next = start + spacing
      const wait = start - now()
      if (wait > 0) await sleep(wait, signal)
    },
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(signal.reason as Error)
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(signal?.reason as Error)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** A token is renewed this many milliseconds before the EPO says it expires, so no request carries an expired one. */
const TOKEN_RENEWAL_MARGIN_MS = 60_000

/** Most bytes of an error body that the client reads. */
const ERROR_BODY_LIMIT = 4096

/** What the client needs. */
export interface MyEpoClientOptions {
  readonly endpoint: MyEpoEndpoint
  /** The credentials of each token fetch; `undefined` while none are stored. */
  readonly credentials: () => Promise<MyEpoCredentials | undefined>
  /** The gate shared by every client of the plugin. */
  readonly gate: RequestGate
  /** The network. */
  readonly fetch: typeof fetch
  /** The clock, epoch ms. */
  readonly now: () => number
}

/** One cached token and the credentials it was issued for. */
interface CachedToken {
  readonly value: string
  readonly expiresAt: number
  readonly clientId: string
  readonly clientSecret: string
}

/**
 * Create a MyEPO client.
 * @param options - the endpoint, the credential callback, the shared gate, the network and the clock.
 * @returns the read operations.
 */
export function createMyEpoClient(options: MyEpoClientOptions): MyEpoReads {
  const { endpoint, gate, now, fetch: network } = options
  let cached: CachedToken | undefined
  let minting: Promise<CachedToken> | undefined

  const send = async (url: string, init: RequestInit, signal: AbortSignal | undefined): Promise<Response> => {
    await gate.wait(signal)
    const deadline = AbortSignal.timeout(endpoint.timeoutSeconds * 1000)
    try {
      return await network(url, { ...init, signal: signal === undefined ? deadline : AbortSignal.any([signal, deadline]) })
    } catch (error) {
      if (signal?.aborted === true) throw error
      throw new MyEpoError({ kind: 'unreachable' }, { cause: error })
    }
  }

  const mint = async (credentials: MyEpoCredentials, signal: AbortSignal | undefined): Promise<CachedToken> => {
    const basic = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString('base64')
    const response = await send(endpoint.tokenUrl, {
      method: 'POST',
      headers: { authorization: `Basic ${basic}`, 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'mailboxapi' }).toString(),
    }, signal)
    if (response.status === 400 || response.status === 401) throw new MyEpoError({ kind: 'refused' })
    if (!response.ok) throw await failureOf(response)
    const token = tokenSchema.safeParse(await readJson(response))
    if (!token.success) throw new MyEpoError({ kind: 'invalid-response', message: 'token answer' }, { cause: token.error })
    return { value: token.data.access_token, expiresAt: now() + token.data.expires_in * 1000, ...credentials }
  }

  const token = async (signal: AbortSignal | undefined): Promise<string> => {
    const credentials = await options.credentials()
    if (credentials === undefined) throw new MyEpoError({ kind: 'not-linked' })
    const current = cached
    if (current !== undefined && current.clientId === credentials.clientId && current.clientSecret === credentials.clientSecret
      && now() < current.expiresAt - TOKEN_RENEWAL_MARGIN_MS) return current.value
    minting ??= mint(credentials, signal).finally(() => { minting = undefined })
    cached = await minting
    return cached.value
  }

  const request = async (path: string, signal: AbortSignal | undefined, accept = 'application/json'): Promise<Response> => {
    for (let attempt = 0; ; attempt++) {
      const bearer = await token(signal)
      const response = await send(`${endpoint.baseUrl}${path}`, { headers: { authorization: `Bearer ${bearer}`, accept } }, signal)
      if (response.ok) return response
      if (response.status === 401 && attempt === 0) {
        // The EPO revoked or expired the token early: drop it and retry once with a fresh one.
        await response.body?.cancel()
        cached = undefined
        continue
      }
      if (response.status === 401) throw new MyEpoError({ kind: 'refused' })
      throw await failureOf(response)
    }
  }

  const json = async <T>(path: string, parse: (body: unknown) => T, signal: AbortSignal | undefined): Promise<T> => {
    const body = await readJson(await request(path, signal))
    try {
      return parse(body)
    } catch (error) {
      // The parsers throw only a ZodError: a field the EPO left out or changed.
      throw new MyEpoError({ kind: 'invalid-response', message: path.replace(/\?.*$/, '') }, { cause: error })
    }
  }

  const appPath = (application: MyEpoApplicationRef): string =>
    `${application.procedure}/applications/${encodeURIComponent(application.number)}`

  return {
    portfolios: signal => json('/portfolios', parsePortfolios, signal),
    applications: (query = {}, signal) => json(`/applications${search(query)}`, parseApplications, signal),
    bibliographicData: (application, signal) => json(`/biblio-data/${appPath(application)}`, parseBibliographicData, signal),
    communications: (query = {}, signal) => json(`/communications${search(query)}`, parseCommunications, signal),
    unhandledCommunications: (query = {}, signal) => json(`/communications/unhandled${search(query)}`, parseCommunications, signal),
    folders: signal => json('/communications/folders', parseFolders, signal),
    dueDates: (application, signal) => json(`/${appPath(application)}/dueDates`, parseDueDates, signal),
    terms: signal => json('/terms', parseTerms, signal),
    pendingFees: (application, signal) => json(`/${appPath(application)}/fees`, parseFees, signal),
    async downloadCommunication(communication, signal) {
      const response = await request(`/communications/download/${encodeURIComponent(communication.id)}`, signal, 'application/octet-stream')
      const bytes = new Uint8Array(await response.arrayBuffer())
      return { communication, ...pdfOf(bytes) }
    },
  }
}

/** The query string of a page request and its filters; absent fields stay out. */
function search(query: object): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value))
  }
  const text = params.toString()
  return text.length === 0 ? '' : `?${text}`
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch (error) {
    throw new MyEpoError({ kind: 'invalid-response', message: 'not JSON' }, { cause: error })
  }
}

/** The failure of a refused answer, from its status and the EPO's error body. */
async function failureOf(response: Response): Promise<MyEpoError> {
  if (response.status >= 500) {
    await response.body?.cancel()
    return new MyEpoError({ kind: 'unreachable', status: response.status })
  }
  const text = (await response.text()).slice(0, ERROR_BODY_LIMIT)
  let body: { code: string; message: string } | undefined
  try {
    const parsed = errorBodySchema.safeParse(JSON.parse(text))
    body = parsed.success ? parsed.data : undefined
  } catch {
    // A text body, for example the gateway's own refusal, carries no EPO code; the status alone describes it.
    body = undefined
  }
  if (response.status === 403) return new MyEpoError(body === undefined ? { kind: 'no-permission' } : { kind: 'no-permission', code: body.code })
  if (body?.code === 'ERR_15') return new MyEpoError({ kind: 'not-ready', code: body.code })
  return new MyEpoError(body === undefined
    ? { kind: 'rejected', status: response.status, message: text }
    : { kind: 'rejected', status: response.status, code: body.code, message: body.message })
}

/** The one PDF of a downloaded ZIP. */
function pdfOf(bytes: Uint8Array): { filename: string; pdf: Uint8Array } {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes)
  } catch (error) {
    throw new MyEpoError({ kind: 'invalid-response', message: 'download is not a ZIP' }, { cause: error })
  }
  const pdfs = Object.entries(files).filter(([name]) => name.toLowerCase().endsWith('.pdf'))
  const [only] = pdfs
  if (only === undefined || pdfs.length > 1) {
    throw new MyEpoError({ kind: 'invalid-response', message: `download holds ${pdfs.length} PDF files` })
  }
  return { filename: only[0], pdf: only[1] }
}
