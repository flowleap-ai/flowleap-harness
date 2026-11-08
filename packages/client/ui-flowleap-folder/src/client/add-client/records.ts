/**
 * The Firm Record of flowleap-os as Add client uses it: the reads of the clients, the six record commands, and their
 * deterministic `Idempotency-Key`s. The browser sends each command with the person's cookie to
 * `<records>api/<path>`, where `<records>` comes from the records-link route; only a person may write, so the Host
 * never sends these commands. Every answer is checked here: a field that Add client uses and that does not match the
 * contract is a `malformed` failure, never a value. The contract is the Add client contract between flowleap-os and
 * the harness of 2026-11-08, with its section "Changed 2026-11-08".
 * @module
 */

import type { Branded } from '@deepseek-ai/dsh-brand'

/** A client id of the Firm Record: a UUID in lower case. */
export type ClientId = Branded<'FirmClientId'>
/** A party id of the Firm Record, which the `parties` command answers. */
export type PartyId = Branded<'FirmPartyId'>

/** The role of a company that the firm records. */
export type ClientRole = 'client' | 'watch' | 'other-party'
/** The role of a party in an application. */
export type PartyRole = 'applicant' | 'opponent' | 'patent-owner' | 'licensee' | 'other'
/** Where a linked applicant name comes from. */
export type NameOrigin = 'patstat' | 'ep-register'

/** One applicant name that the Firm Record links to a client. */
export interface LinkedName {
  readonly name: string
  readonly source: NameOrigin
  readonly edition?: string
  readonly applications?: number
}

/** A person as the Firm Record shows them; both fields are null when the reader's walls do not show that person. */
export interface RecordPerson {
  readonly id: string | null
  readonly name: string | null
}

/** One client of the `clients` read. */
export interface FirmClient {
  readonly clientId: ClientId
  readonly name: string
  readonly role: ClientRole
  /** ISO-8601 instant. */
  readonly addedAt: string
  readonly addedBy: RecordPerson
  readonly names: readonly LinkedName[]
  /** How many applications the Firm Record has for the client. */
  readonly applications: number
}

/** One party role on a recorded application. */
export interface RecordedRole {
  readonly partyId: PartyId
  /** The party's name as the Firm Record writes it. */
  readonly party: string
  readonly role: PartyRole
}

/** One application that the Firm Record has for a client. */
export interface RecordedApplication {
  readonly applicationNumber: string
  readonly publicationNumber?: string
  readonly title?: string
  readonly roles: readonly RecordedRole[]
}

/** The `clients/<id>` read: the client, its names, its applications with their roles, and its conflict checks. */
export interface ClientDetail {
  readonly client: FirmClient
  readonly names: readonly LinkedName[]
  readonly applications: readonly RecordedApplication[]
  /** The hits hash of each recorded conflict check. */
  readonly conflictChecks: readonly string[]
}

/** One possible conflict, with the fields of the contract `Hit` only. */
export interface Hit {
  readonly applicationNumber: string
  readonly publicationNumber?: string
  readonly title?: string
  readonly otherParty: string
  readonly otherPartyRole: 'opponent' | 'patent-owner' | 'other'
  readonly existingClientId: string
  readonly existingClientParty: string
  readonly source: 'firm-record' | 'ep-register'
  /** ISO-8601 instant of the read. */
  readonly asOf: string
}

/** One EP application that a client command records. */
export interface ApplicationFact {
  /** `EP` and 8 digits. */
  readonly applicationNumber: string
  /** `EP`, digits and kind; absent when the source gives no kind code. */
  readonly publicationNumber?: string
  readonly title?: string
  /** `YYYY-MM-DD`. */
  readonly representativeSince?: string
  /** `register`: the EP Register names your firm; `claimed`: a person selected This is ours. */
  readonly basis: 'register' | 'claimed'
}

/** One record command of Add client. */
export type RecordCommand =
  | { readonly kind: 'conflict-check'; readonly clientId: ClientId; readonly hits: readonly Hit[]; readonly reason?: string }
  | { readonly kind: 'client'; readonly clientId: ClientId; readonly name: string; readonly role: ClientRole }
  | { readonly kind: 'name'; readonly clientId: ClientId; readonly name: LinkedName }
  | { readonly kind: 'party'; readonly name: string }
  | { readonly kind: 'application'; readonly clientId: ClientId; readonly application: ApplicationFact }
  | { readonly kind: 'role'; readonly applicationNumber: string; readonly partyId: PartyId; readonly role: PartyRole; readonly clientId: ClientId }

/** What a recorded command answers: the party id of a `party` command, else nothing that Add client uses. */
export type RecordAnswer = { readonly kind: 'party'; readonly partyId: PartyId } | { readonly kind: 'recorded' }

/** The refusal codes of the contract; another code is `null`. */
export const REFUSALS = [
  'reason-required', 'not-allowed-to-decide-conflict', 'conflict-check-missing', 'client-exists', 'client-id-taken',
  'client-unknown', 'party-unknown', 'application-other-client', 'application-not-recorded', 'agent-cannot-decide',
] as const

/** A refusal code of the contract. */
export type RefusalCode = (typeof REFUSALS)[number]

/**
 * Why a read or a command failed: the records link is missing (`unavailable`), no answer (`network`), a failure of the
 * Firm Record or a proxy (`service`, a 5xx status), a refusal (`refused`, a 4xx status with the contract code, and the
 * client id that `client-exists` and `application-other-client` name), or an answer that does not match the contract
 * (`malformed`, with the path).
 */
export type RecordError =
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'network' }
  | { readonly kind: 'service'; readonly status: number }
  | { readonly kind: 'refused'; readonly status: number; readonly code: RefusalCode | null; readonly clientId?: ClientId }
  | { readonly kind: 'malformed'; readonly path: string }

/** The answer of a read or a command. */
export type RecordResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: RecordError }

// Names, keys and hashes, exactly as the contract writes them.

/**
 * The normalized form of a company name, for keys and matching.
 * @param name - the name as a source writes it.
 * @returns NFKC, lower case, no punctuation, single spaces, trimmed.
 */
export function normalizeName(name: string): string {
  return name.normalize('NFKC').toLowerCase().replace(/\p{P}/gu, '').replace(/\s+/g, ' ').trim()
}

/**
 * The SHA-256 of a text in lower-case hex.
 * @param text - the text, as UTF-8.
 * @returns 64 hex digits.
 */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * The key of one hit in the hits hash.
 * @param hit - the hit.
 * @returns `<applicationNumber>|<existingClientId>|<otherPartyRole>|<normalized otherParty>`.
 */
export function hitKey(hit: Hit): string {
  return `${hit.applicationNumber}|${hit.existingClientId}|${hit.otherPartyRole}|${normalizeName(hit.otherParty)}`
}

/**
 * The hits hash of a conflict check.
 * @param hits - the hits.
 * @returns `none` for no hit, else the SHA-256 hex of the sorted hit keys joined by a line feed.
 */
export async function hitsHash(hits: readonly Hit[]): Promise<string> {
  return hits.length === 0 ? 'none' : sha256Hex(hits.map(hitKey).sort().join('\n'))
}

/**
 * A new client id.
 * @returns a random UUID in lower case.
 */
export function newClientId(): ClientId {
  return globalThis.crypto.randomUUID().toLowerCase() as ClientId
}

/** A publication number with its kind code, which the contract asks for. */
const PUBLICATION = /^EP\d+[A-Z]\d?$/

/** The path, the body and the `Idempotency-Key` of one command. */
export interface CommandRequest {
  readonly path: string
  readonly body: Readonly<Record<string, unknown>>
  readonly key: string
}

/**
 * The request of a command. Each key is deterministic, so a retry of the same fact sends the same key and the Firm
 * Record appends nothing twice.
 * @param command - the command.
 * @returns its path under `api/`, its JSON body and its key.
 */
export async function commandRequest(command: RecordCommand): Promise<CommandRequest> {
  switch (command.kind) {
    case 'conflict-check': {
      const { clientId, hits, reason } = command
      // The body holds the contract's Hit fields only.
      const body = hits.map(hit => ({
        applicationNumber: hit.applicationNumber, publicationNumber: hit.publicationNumber, title: hit.title, otherParty: hit.otherParty,
        otherPartyRole: hit.otherPartyRole, existingClientId: hit.existingClientId, existingClientParty: hit.existingClientParty,
        source: hit.source, asOf: hit.asOf,
      }))
      return { path: `clients/${clientId}/conflict-check`, body: reason === undefined ? { hits: body } : { hits: body, reason }, key: `add-client:${clientId}:conflict:${await hitsHash(hits)}` }
    }
    case 'client': return { path: 'clients', body: { clientId: command.clientId, name: command.name, role: command.role }, key: `add-client:${command.clientId}` }
    case 'name': return {
      path: `clients/${command.clientId}/names`, body: { ...command.name }, key: `add-client:${command.clientId}:name:${await sha256Hex(normalizeName(command.name.name))}`,
    }
    case 'party': return { path: 'parties', body: { name: command.name }, key: `party:${await sha256Hex(normalizeName(command.name))}` }
    case 'application': {
      const { publicationNumber, ...rest } = command.application
      // The EP Register gives a publication number without its kind code, such as `EP4292805`; the contract wants
      // `EP`, digits and kind, so a number without a kind stays out of the record.
      const body = publicationNumber !== undefined && PUBLICATION.test(publicationNumber) ? { ...rest, publicationNumber } : rest
      return { path: `clients/${command.clientId}/applications`, body, key: `add-client:${command.clientId}:application:${command.application.applicationNumber}` }
    }
    case 'role': return {
      path: `applications/${command.applicationNumber}/roles`,
      body: { partyId: command.partyId, role: command.role, clientId: command.clientId },
      key: `role:${command.applicationNumber}:${command.partyId}:${command.role}`,
    }
  }
}

// Wire checks.

/** A value of an answer did not match the contract. */
class Malformed extends Error {
  /** @param path - where the value is, such as `body.clients[2].role`. */
  constructor(readonly path: string) {
    super(`malformed Firm Record answer at ${path}`)
    this.name = 'Malformed'
  }
}

type Json = Readonly<Record<string, unknown>>

function objectAt(value: unknown, path: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Malformed(path)
  return value as Json
}

function textAt(source: Json, key: string, path: string): string {
  const value = source[key]
  if (typeof value !== 'string') throw new Malformed(`${path}.${key}`)
  return value
}

function optionalText(source: Json, key: string, path: string): string | undefined {
  return source[key] === undefined || source[key] === null ? undefined : textAt(source, key, path)
}

function countAt(source: Json, key: string, path: string): number {
  const value = source[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Malformed(`${path}.${key}`)
  return value
}

function listAt<T>(source: Json, key: string, path: string, item: (value: unknown, at: string) => T): readonly T[] {
  const value = source[key]
  if (!Array.isArray(value)) throw new Malformed(`${path}.${key}`)
  return value.map((entry, index) => item(entry, `${path}.${key}[${index}]`))
}

function choiceAt<const L extends string>(source: Json, key: string, path: string, allowed: readonly L[]): L {
  const value = textAt(source, key, path)
  if (!(allowed as readonly string[]).includes(value)) throw new Malformed(`${path}.${key}`)
  return value as L
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const CLIENT_ROLES = ['client', 'watch', 'other-party'] as const
const PARTY_ROLES = ['applicant', 'opponent', 'patent-owner', 'licensee', 'other'] as const

function clientIdAt(source: Json, key: string, path: string): ClientId {
  const value = textAt(source, key, path)
  if (!UUID.test(value)) throw new Malformed(`${path}.${key}`)
  return value as ClientId
}

function partyIdAt(source: Json, key: string, path: string): PartyId {
  const value = textAt(source, key, path)
  if (!/^[\w.:-]{1,100}$/.test(value)) throw new Malformed(`${path}.${key}`)
  return value as PartyId
}

function linkedName(value: unknown, path: string): LinkedName {
  const source = objectAt(value, path)
  const edition = optionalText(source, 'edition', path)
  const applications = source['applications'] === undefined || source['applications'] === null ? undefined : countAt(source, 'applications', path)
  return {
    name: textAt(source, 'name', path),
    source: choiceAt(source, 'source', path, ['patstat', 'ep-register']),
    ...(edition === undefined ? {} : { edition }),
    ...(applications === undefined ? {} : { applications }),
  }
}

function person(value: unknown, path: string): RecordPerson {
  if (value === undefined || value === null) return { id: null, name: null }
  const source = objectAt(value, path)
  return { id: optionalText(source, 'id', path) ?? null, name: optionalText(source, 'name', path) ?? null }
}

function firmClient(value: unknown, path: string): FirmClient {
  const source = objectAt(value, path)
  return {
    clientId: clientIdAt(source, 'clientId', path),
    name: textAt(source, 'name', path),
    role: choiceAt(source, 'role', path, CLIENT_ROLES),
    addedAt: textAt(source, 'addedAt', path),
    addedBy: person(source['addedBy'], `${path}.addedBy`),
    names: source['names'] === undefined ? [] : listAt(source, 'names', path, linkedName),
    applications: source['applications'] === undefined ? 0 : countAt(source, 'applications', path),
  }
}

function recordedApplication(value: unknown, path: string): RecordedApplication {
  const source = objectAt(value, path)
  const publicationNumber = optionalText(source, 'publicationNumber', path)
  const title = optionalText(source, 'title', path)
  return {
    applicationNumber: textAt(source, 'applicationNumber', path),
    ...(publicationNumber === undefined ? {} : { publicationNumber }),
    ...(title === undefined ? {} : { title }),
    roles: listAt(source, 'roles', path, (item, at) => {
      const role = objectAt(item, at)
      return { partyId: partyIdAt(role, 'partyId', at), party: textAt(role, 'party', at), role: choiceAt(role, 'role', at, PARTY_ROLES) }
    }),
  }
}

/**
 * Check the `clients` read.
 * @param value - the JSON body.
 * @returns the clients.
 */
function clientsRead(value: unknown): readonly FirmClient[] {
  return listAt(objectAt(value, 'body'), 'clients', 'body', firmClient)
}

/**
 * Check the `clients/<id>` read.
 * @param value - the JSON body.
 * @returns the detail.
 */
function detailRead(value: unknown): ClientDetail {
  const source = objectAt(value, 'body')
  const client = firmClient(source['client'], 'body.client')
  return {
    client,
    names: listAt(source, 'names', 'body', linkedName),
    applications: listAt(source, 'applications', 'body', recordedApplication),
    conflictChecks: listAt(source, 'conflictChecks', 'body', (item, at) => textAt(objectAt(item, at), 'hitsHash', at)),
  }
}

/**
 * Check the answer of a command: the record position of every command, the party id of `parties`, and for a
 * conflict check the hits hash, which must be the one that the key names.
 */
async function commandRead(command: RecordCommand, value: unknown): Promise<RecordAnswer> {
  const source = objectAt(value, 'body')
  countAt(source, 'recordSeq', 'body')
  if (command.kind === 'party') return { kind: 'party', partyId: partyIdAt(source, 'partyId', 'body') }
  if (command.kind === 'conflict-check' && textAt(source, 'hitsHash', 'body') !== await hitsHash(command.hits)) throw new Malformed('body.hitsHash')
  return { kind: 'recorded' }
}

// The client.

/**
 * The failure of a non-2xx answer.
 * @param response - the answer.
 * @returns a service failure for a 5xx status, else a refusal with its contract code when the body names one.
 */
async function refusal(response: Response): Promise<RecordError> {
  if (response.status >= 500) return { kind: 'service', status: response.status }
  let body: Json = {}
  try {
    body = objectAt(await response.json(), 'body')
  } catch (_error: unknown) {
    // A refusal of the proxy may have no JSON body; the status still names the failure.
  }
  const code = typeof body['error'] === 'string' && (REFUSALS as readonly string[]).includes(body['error']) ? body['error'] as RefusalCode : null
  const clientId = typeof body['clientId'] === 'string' && UUID.test(body['clientId']) ? body['clientId'] as ClientId : undefined
  return { kind: 'refused', status: response.status, code, ...(clientId === undefined ? {} : { clientId }) }
}

/** The reads and the commands of the Firm Record that Add client uses. */
export interface FirmRecord {
  /** Every client of the Firm Record that the person may see. */
  clients(signal?: AbortSignal): Promise<RecordResult<readonly FirmClient[]>>
  /** One client with its names, applications, roles and conflict checks. */
  client(clientId: ClientId, signal?: AbortSignal): Promise<RecordResult<ClientDetail>>
  /**
   * Send one command with its deterministic key. 200 and 201 both mean recorded.
   * @returns the answer, or the failure; after a network failure, send the same command again.
   */
  send(command: RecordCommand): Promise<RecordResult<RecordAnswer>>
}

/** The records-link route of `ui-flowleap-records`, relative to the document. */
export const RECORDS_LINK = 'api/flowleap/records-link'

/**
 * Create the Firm Record client. The first call reads where the Records service is from the records-link route; a
 * failed read is `unavailable` and is read again on the next call.
 * @param fetchImpl - the fetch to use; the global fetch by default.
 * @returns the client.
 */
export function createFirmRecord(fetchImpl: typeof fetch = (input, init) => globalThis.fetch(input, init)): FirmRecord {
  let base: Promise<string | null> | null = null
  const baseOf = (): Promise<string | null> => {
    base ??= (async () => {
      try {
        const response = await fetchImpl(RECORDS_LINK, { credentials: 'include', cache: 'no-store' })
        const href = response.ok ? objectAt(await response.json(), 'body')['href'] : undefined
        return typeof href === 'string' && href.endsWith('/') ? `${href}api/` : null
      } catch (_error: unknown) {
        // No answer, or no JSON: the records link is not known now.
        return null
      }
    })()
    return base.then((value) => {
      if (value === null) base = null
      return value
    })
  }
  const exchange = async <T>(path: string, init: RequestInit, read: (value: unknown) => T | Promise<T>): Promise<RecordResult<T>> => {
    const root = await baseOf()
    if (root === null) return { ok: false, error: { kind: 'unavailable' } }
    let response: Response
    try {
      response = await fetchImpl(`${root}${path}`, { credentials: 'include', cache: 'no-store', ...init })
    } catch (_error: unknown) {
      // fetch rejects when no answer came.
      return { ok: false, error: { kind: 'network' } }
    }
    if (!response.ok) return { ok: false, error: await refusal(response) }
    try {
      return { ok: true, value: await read(await response.json()) }
    } catch (error: unknown) {
      return { ok: false, error: { kind: 'malformed', path: error instanceof Malformed ? error.path : 'body' } }
    }
  }
  const get = (signal: AbortSignal | undefined): RequestInit => ({ headers: { accept: 'application/json' }, ...(signal === undefined ? {} : { signal }) })
  return {
    clients: signal => exchange('clients', get(signal), clientsRead),
    client: (clientId, signal) => exchange(`clients/${clientId}`, get(signal), detailRead),
    send: async (command) => {
      const { path, body, key } = await commandRequest(command)
      return exchange(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json', 'idempotency-key': key },
        body: JSON.stringify(body),
      }, value => commandRead(command, value))
    },
  }
}
