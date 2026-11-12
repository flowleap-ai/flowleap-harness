/**
 * The MyEPO double: the EPO login service and the read operations of the MyEPO API, answered from one data set in the
 * wire format of the recorded sandbox answers (`../fixtures/myepo/`). It is a Fetch handler with no network, so the
 * specs call it in process through {@link MyEpoDouble.fetch} and `server.ts` serves it on a loopback port. The Mailbox
 * state (the `read` flag of each letter and the letters that arrived) lasts until {@link MyEpoDouble.reset}.
 * @module
 */

import { zipSync } from 'fflate'

/** The client that the login service accepts. */
export interface DoubleClient {
  readonly clientId: string
  readonly clientSecret: string
}

/** Where the double answers: the API base (`…/latest`) and the token URL, both as the client calls them. */
export interface DoubleEndpoint {
  readonly baseUrl: string
  readonly tokenUrl: string
}

/** One portfolio row of `GET /portfolios`, as the EPO writes it. */
export interface WirePortfolio {
  readonly id: string
  readonly name: string
  readonly type: string
  readonly hasFullAccess: boolean
  readonly [field: string]: unknown
}

/** One application row of `GET /applications`, as the EPO writes it. */
export interface WireApplication {
  readonly bibliographicData: {
    readonly applicationIdentification: {
      readonly procedure: string
      readonly applicationNumber: string
      readonly [field: string]: unknown
    }
  }
  readonly applicantFileReference?: string | null
  readonly portfolioId: string
  readonly procedure: string
  readonly [field: string]: unknown
}

/** One Mailbox letter row of `GET /communications`, as the EPO writes it. */
export interface WireCommunication {
  readonly id: string
  readonly dispatchDate: string
  readonly read: boolean
  readonly handled: boolean
  readonly folderId: string
  readonly [field: string]: unknown
}

/** One letter: its row and the one PDF of its download ZIP. */
export interface DoubleLetter {
  readonly communication: WireCommunication
  /** The PDF file name inside the ZIP. */
  readonly filename: string
  /** Reads the PDF bytes at each download. */
  readonly pdf: () => Uint8Array
}

/** One due date or fee row, as the EPO writes it, and the letter that must be in the Mailbox before the row shows. */
export interface DatedEntry {
  readonly row: unknown
  /** The id of the letter that states the value; absent when the value does not wait for a letter. */
  readonly letterId?: string
}

/** The due dates of one application: the `applicationIdentification` of the answer and its rows. */
export interface DueDateRecord {
  readonly identification: unknown
  readonly entries: readonly DatedEntry[]
}

/**
 * Everything the double serves. The keys of `biblio`, `dueDates` and `fees` are `<procedure>/<application>` as the
 * request path writes them, for example `EPC/EP23771920`.
 */
export interface MyEpoDoubleData {
  /** What a person sees about the data, for the start line and the control surface. */
  readonly label: string
  /** The portfolios that the account may read. */
  readonly portfolios: readonly WirePortfolio[]
  readonly applications: readonly WireApplication[]
  /** Applications that exist outside the readable portfolios: each per-application read answers `403 ERR_20`. */
  readonly restricted: readonly string[]
  readonly biblio: Readonly<Record<string, unknown>>
  readonly dueDates: Readonly<Record<string, DueDateRecord>>
  readonly fees: Readonly<Record<string, readonly DatedEntry[]>>
  readonly terms: unknown
  readonly folders: unknown
  /** The letters in the Mailbox at the start and after each reset. */
  readonly letters: readonly DoubleLetter[]
  /** The letters that {@link MyEpoDouble.arrive} adds, in order; absent from the Mailbox until then. */
  readonly arrivals: readonly DoubleLetter[]
  /**
   * The text version of a letter, by its seed row: a test fixture with a text layer that FlowLeap made from the scan, under its
   * own communication id; absent from the Mailbox until {@link MyEpoDouble.arriveText}.
   */
  readonly textVersions: Readonly<Record<number, DoubleLetter>>
}

/** The read state of one letter, for the control surface. */
export interface LetterState {
  readonly id: string
  readonly read: boolean
  readonly handled: boolean
}

/** A double of the EPO for one data set. */
export interface MyEpoDouble {
  /** Answers one request to the token URL or to the API base; any other URL answers `404`. */
  readonly fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
  /** The number of tokens issued; the API accepts only `token-<tokens>`. A spec may raise it to expire the current token. */
  tokens: number
  /** Restores the Mailbox of the data set: every `read` flag and no arrived letter. Tokens stay valid. */
  reset(): void
  /**
   * Adds the next letter of `arrivals` to the Mailbox, unread and unhandled.
   * @returns the letter's row, or `undefined` when every arrival has arrived.
   */
  arrive(): WireCommunication | undefined
  /**
   * Adds the text version of the letter of seed row `row` to the Mailbox, unread and unhandled.
   * @param row - the seed row of the letter.
   * @returns the letter's row, or `undefined` when the row has no text version or it is in the Mailbox already.
   */
  arriveText(row: number): WireCommunication | undefined
  /**
   * The Mailbox now.
   * @returns each letter's id, `read` and `handled` in dispatch order, and how many arrivals wait.
   */
  state(): { readonly letters: readonly LetterState[]; readonly waiting: number }
}

/** The body of `403 ERR_20`, as the sandbox answered `GET /applications?portfolioId=999`. */
export const NOT_PERMITTED = { code: 'ERR_20', message: 'User is not authorised to perform this action.' }

/** The body of `400 ERR_30`, as the sandbox answered a bibliographic read of an unknown application. */
export const UNKNOWN_APPLICATION = { code: 'ERR_30', message: 'Invalid procedure' }

/** The login service's refusal of a wrong client secret, as recorded (`token-refused.json`). */
export const TOKEN_REFUSED = { error: 'invalid_client', error_description: 'The client secret supplied for a confidential client is invalid.' }

/** The API's refusal of a token it did not issue, as recorded (`api-401.json`). */
export const API_REFUSED = 'Jwt is not in the form of Header.Payload.Signature with two dots and 3 sections'

/** The answer to a `page` or `size` that is not a whole number (`size` at least 1); the sandbox answer is not recorded. */
export const BAD_PAGE = { code: 'DOUBLE_BAD_PAGE', message: 'page must be a whole number from 0 and size a whole number from 1' }

/** The answer to a download of a letter that is not in the Mailbox; the sandbox answer is not recorded. */
export const UNKNOWN_COMMUNICATION = { code: 'DOUBLE_UNKNOWN_COMMUNICATION', message: 'The provided communication id is not valid' }

/** The content type of the sandbox's list answers of the Mailbox, as recorded. */
const MAILBOX_JSON = 'application/json;charset=utf-8'

/** The answer to each of the four write operations of the API: the double reads only. */
export const READ_ONLY = { code: 'DOUBLE_READ_ONLY', message: 'The MyEPO double serves the read operations only; it refuses every write.' }

const TOKEN_SECONDS = 3600
const DEFAULT_PAGE_SIZE = 10

/**
 * Create a double over one data set.
 * @param data - the data set; the double copies each letter row, so its answers never change `data`.
 * @param endpoint - the API base and the token URL that requests use.
 * @param client - the one client that the login service accepts.
 * @returns the double.
 */
export function createMyEpoDouble(data: MyEpoDoubleData, endpoint: DoubleEndpoint, client: DoubleClient): MyEpoDouble {
  let mailbox: Map<string, { letter: DoubleLetter; row: WireCommunication }> = new Map()
  let waiting: DoubleLetter[] = []
  const reset = (): void => {
    mailbox = new Map(data.letters.map(letter => [letter.communication.id, { letter, row: { ...letter.communication } }]))
    waiting = [...data.arrivals]
  }
  reset()
  const byDispatch = (): WireCommunication[] =>
    [...mailbox.values()].map(entry => entry.row).sort((left, right) => right.dispatchDate.localeCompare(left.dispatchDate))
  const permitted = new Set(data.portfolios.map(portfolio => portfolio.id))
  const known = new Set(data.applications.map(row => `${row.procedure}/${row.bibliographicData.applicationIdentification.applicationNumber}`))
  const restricted = new Set(data.restricted)

  /** The answer of a per-application read: the record, `403 ERR_20` outside the portfolios, else `400 ERR_30`. */
  const perApplication = <T>(records: Readonly<Record<string, T>>, key: string, body: (record: T) => unknown): Response => {
    if (restricted.has(key)) return json(403, NOT_PERMITTED)
    const record = records[key]
    if (!known.has(key) || record === undefined) return json(400, UNKNOWN_APPLICATION)
    return json(200, body(record))
  }
  /** The rows whose letter is in the Mailbox, so no value shows before the letter that states it arrives. */
  const visible = (entries: readonly DatedEntry[]): unknown[] =>
    entries.filter(entry => entry.letterId === undefined || mailbox.has(entry.letterId)).map(entry => entry.row)

  const read = (path: string, query: URLSearchParams): Response => {
    if (path === '/portfolios') return json(200, { content: data.portfolios, totalElements: data.portfolios.length })
    if (path === '/applications') {
      const portfolioId = query.get('portfolioId')
      if (portfolioId !== null && !permitted.has(portfolioId)) return json(403, NOT_PERMITTED)
      const rows = data.applications.filter(row =>
        (portfolioId === null || row.portfolioId === portfolioId)
        && matches(query.get('applicationNumber'), row.bibliographicData.applicationIdentification.applicationNumber)
        && matches(query.get('applicantFileReference'), row.applicantFileReference)
        && matches(query.get('procedure'), row.procedure))
      return paged(rows, query)
    }
    if (path === '/communications') {
      const folderId = query.get('folderId')
      return paged(byDispatch().filter(row => folderId === null || row.folderId === folderId), query, MAILBOX_JSON)
    }
    if (path === '/communications/unhandled') return paged(byDispatch().filter(row => !row.handled), query, MAILBOX_JSON)
    if (path === '/communications/folders') return json(200, data.folders, MAILBOX_JSON)
    if (path === '/terms') return json(200, data.terms)
    const download = /^\/communications\/download\/([^/]+)$/.exec(path)
    if (download !== null) {
      const entry = mailbox.get(decodeURIComponent(download[1]!))
      if (entry === undefined) return json(400, UNKNOWN_COMMUNICATION)
      entry.row = { ...entry.row, read: true }
      return new Response(zipSync({ [entry.letter.filename]: entry.letter.pdf() }), { status: 200, headers: { 'content-type': 'application/octet-stream' } })
    }
    const biblio = /^\/biblio-data\/([^/]+)\/applications\/([^/]+)$/.exec(path)
    if (biblio !== null) return perApplication(data.biblio, `${biblio[1]}/${decodeURIComponent(biblio[2]!)}`, record => record)
    const perApp = /^\/([^/]+)\/applications\/([^/]+)\/(dueDates|fees)$/.exec(path)
    if (perApp !== null) {
      const key = `${perApp[1]}/${decodeURIComponent(perApp[2]!)}`
      return perApp[3] === 'fees'
        ? perApplication(data.fees, key, visible)
        : perApplication(data.dueDates, key, record =>
          ({ applicationIdentification: record.identification, dueDates: visible(record.entries) }))
    }
    return json(404, { code: 'DOUBLE_NO_ROUTE', message: `The MyEPO double has no read at ${path}` })
  }

  const double: MyEpoDouble = {
    tokens: 0,
    reset,
    arrive() {
      const next = waiting.shift()
      if (next === undefined) return undefined
      const row = { ...next.communication, read: false, handled: false }
      mailbox.set(row.id, { letter: next, row })
      return row
    },
    arriveText(row) {
      const letter = data.textVersions[row]
      if (letter === undefined || mailbox.has(letter.communication.id)) return undefined
      const added = { ...letter.communication, read: false, handled: false }
      mailbox.set(added.id, { letter, row: added })
      return added
    },
    state: () => ({ letters: byDispatch().map(({ id, read: seen, handled }) => ({ id, read: seen, handled })), waiting: waiting.length }),
    async fetch(input, init) {
      const request = input instanceof Request ? input : new Request(input, init)
      const url = request.url
      if (url === endpoint.tokenUrl) return token(request, client, () => `token-${++double.tokens}`)
      if (!url.startsWith(`${endpoint.baseUrl}/`)) return json(404, { code: 'DOUBLE_NO_ROUTE', message: `The MyEPO double does not serve ${url}` })
      if (request.headers.get('authorization') !== `Bearer token-${double.tokens}`) {
        return new Response(API_REFUSED, { status: 401, headers: { 'content-type': 'text/plain' } })
      }
      const target = new URL(url)
      const path = target.pathname.slice(new URL(endpoint.baseUrl).pathname.length)
      if (isWrite(request.method, path)) return json(501, READ_ONLY)
      if (request.method !== 'GET') return json(405, { code: 'DOUBLE_METHOD', message: `The MyEPO double answers GET at ${path}` })
      return read(path, target.searchParams)
    },
  }
  return double
}

/** The OAuth 2.0 client-credentials grant: HTTP Basic or form fields, scope `mailboxapi`. */
async function token(request: Request, client: DoubleClient, issue: () => string): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'invalid_request', error_description: 'The token endpoint answers POST' })
  const form = new URLSearchParams(await request.text())
  const basic = /^Basic (.+)$/.exec(request.headers.get('authorization') ?? '')
  const [id, secret] = basic === null
    ? [form.get('client_id'), form.get('client_secret')]
    : splitOnce(Buffer.from(basic[1]!, 'base64').toString('utf8'))
  if (id !== client.clientId || secret !== client.clientSecret) return json(401, TOKEN_REFUSED)
  if (form.get('grant_type') !== 'client_credentials') return json(400, { error: 'unsupported_grant_type', error_description: 'The grant type must be client_credentials' })
  if (form.get('scope') !== 'mailboxapi') return json(400, { error: 'invalid_scope', error_description: 'The scope must be mailboxapi' })
  return json(200, { token_type: 'Bearer', expires_in: TOKEN_SECONDS, access_token: issue(), scope: 'mailboxapi' })
}

function splitOnce(pair: string): [string, string] {
  const at = pair.indexOf(':')
  return at < 0 ? [pair, ''] : [pair.slice(0, at), pair.slice(at + 1)]
}

/** Whether a request is one of the API's write operations: handle, move, or set the file reference. */
function isWrite(method: string, path: string): boolean {
  if (method === 'POST') return /^\/communications\/(handle(\/[^/]+)?|move\/[^/]+)$/.test(path)
  return method === 'PATCH' && /^\/[^/]+\/applications\/[^/]+$/.test(path)
}

function matches(filter: string | null, value: string | null | undefined): boolean {
  return filter === null || filter === value
}

/**
 * One page of rows, as the EPO writes a page: `content`, `size`, `number` (0-based) and `totalElements`. A `page` or
 * `size` that is not a whole number in range answers `400` with {@link BAD_PAGE}.
 */
function paged(rows: readonly unknown[], query: URLSearchParams, contentType = 'application/json'): Response {
  const size = wholeNumber(query.get('size'), DEFAULT_PAGE_SIZE)
  const number = wholeNumber(query.get('page'), 0)
  if (size === undefined || number === undefined || size < 1) return json(400, BAD_PAGE)
  return json(200, { content: rows.slice(number * size, (number + 1) * size), size, number, totalElements: rows.length }, contentType)
}

/** A query value as a whole number from 0, the fallback when absent, or `undefined` when it is not one. */
function wholeNumber(value: string | null, fallback: number): number | undefined {
  if (value === null) return fallback
  return /^\d+$/.test(value) ? Number(value) : undefined
}

function json(status: number, body: unknown, contentType = 'application/json'): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': contentType } })
}
