/**
 * The review of Add client: the EP applications of a group of applicant names, split by the firm identity into the
 * firm's matters and the reference list, and the possible conflicts that the EP Register shows. Only the group's names
 * leave the firm; the firm identity and the names of the firm's clients are matched here.
 * @module
 */

import type { PatentData, RegisterRow } from '@deepseek-ai/dsh-flowleap-connectors'
import { companyKey, identitySet, isFirm, townOf, type FirmIdentity } from './identity.ts'
import type { ConflictHit, KnownClient, MatterRow, ReferenceRow, ReviewAnswer } from './wire.ts'

/** The most names in one register query, so a query stays short. */
const NAMES_PER_QUERY = 8

/** The most rows of one register page. */
const PAGE_ROWS = 100

/** The EP applications of a group, read from the EP Register. */
export interface GroupRead {
  /** One row for each application, in the register's order. */
  readonly rows: readonly RegisterRow[]
  /** Whether a query stopped at the row cap. */
  readonly truncated: boolean
}

/** A name as a register CQL term of one index. */
function term(index: string, name: string): string {
  return `${index}="${name.replaceAll('"', '')}"`
}

/** The queries for a list of names on one index, a few names each. */
function queries(index: string, names: readonly string[]): string[] {
  const out: string[] = []
  for (let start = 0; start < names.length; start += NAMES_PER_QUERY) {
    out.push(names.slice(start, start + NAMES_PER_QUERY).map(name => term(index, name)).join(' or '))
  }
  return out
}

/**
 * Read every row of register queries, page by page, up to a row cap for each query; each application once.
 * @param data - the patent data Service.
 * @param list - the queries.
 * @param maxRows - the row cap of one query.
 * @param signal - stops the reads.
 * @returns the rows and whether a cap cut a query.
 */
async function readAll(data: PatentData, list: readonly string[], maxRows: number, signal?: AbortSignal): Promise<GroupRead> {
  const rows = new Map<string, RegisterRow>()
  let truncated = false
  for (const query of list) {
    for (let begin = 1; begin <= maxRows; begin += PAGE_ROWS) {
      const page = await data.searchRegister(query, { begin, end: Math.min(begin + PAGE_ROWS - 1, maxRows) }, signal)
      // Several queries can give one application; the first row of it stays.
      for (const row of page.rows) {
        if (!rows.has(row.applicationNumber)) rows.set(row.applicationNumber, row)
      }
      if (page.end >= page.total || page.rows.length === 0) break
      if (page.end >= maxRows) truncated = true
    }
  }
  return { rows: [...rows.values()], truncated }
}

/** The company keys of a list of names, without empty keys. */
function keysOf(names: readonly string[]): Set<string> {
  return new Set(names.map(companyKey).filter(key => key !== ''))
}

/**
 * Read the EP applications of a group: the rows that name one of the group's names as an applicant.
 * @param data - the patent data Service.
 * @param names - the ticked applicant names.
 * @param maxRows - the row cap of one query.
 * @param signal - stops the reads.
 * @returns the group's rows.
 */
export async function readGroup(data: PatentData, names: readonly string[], maxRows: number, signal?: AbortSignal): Promise<GroupRead> {
  const group = keysOf(names)
  const read = await readAll(data, queries('pa', names), maxRows, signal)
  return { rows: read.rows.filter(row => row.applicants.some(applicant => group.has(companyKey(applicant)))), truncated: read.truncated }
}

/** The client of a party name, by company key. */
function clientOf(name: string, clients: ReadonlyMap<string, string>): string | undefined {
  return clients.get(companyKey(name))
}

/** The first name of a list that is a client of your firm, with that client. */
function firstClient(
  names: readonly string[], clients: ReadonlyMap<string, string>,
): { readonly party: string; readonly clientId: string } | undefined {
  for (const party of names) {
    const clientId = clientOf(party, clients)
    if (clientId !== undefined) return { party, clientId }
  }
  return undefined
}

/** The company keys of the known clients' names, to their client ids. */
function clientKeys(clients: readonly KnownClient[]): Map<string, string> {
  const keys = new Map<string, string>()
  for (const client of clients) for (const key of keysOf(client.names)) keys.set(key, client.clientId)
  return keys
}

/** The fields of a hit that come from its row. */
function rowFacts(row: RegisterRow): Pick<ConflictHit, 'applicationNumber' | 'publicationNumber' | 'title' | 'status'> {
  return {
    applicationNumber: row.applicationNumber,
    ...(row.publicationNumber === undefined ? {} : { publicationNumber: row.publicationNumber }),
    ...(row.title === undefined ? {} : { title: row.title }),
    ...(row.status === undefined ? {} : { status: row.status }),
  }
}

/**
 * The possible conflicts that the EP Register shows: a client of your firm opposed an application of the group, or a
 * name of the group opposed an application of a client of your firm.
 * @param data - the patent data Service.
 * @param names - the ticked applicant names.
 * @param groupRows - the group's rows.
 * @param clients - the clients of your firm.
 * @param maxRows - the row cap of one query.
 * @param asOf - the instant of the read.
 * @param signal - stops the reads.
 * @returns the hits, each once.
 */
export async function registerConflicts(
  data: PatentData, names: readonly string[], groupRows: readonly RegisterRow[], clients: readonly KnownClient[],
  maxRows: number, asOf: string, signal?: AbortSignal,
): Promise<ConflictHit[]> {
  const known = clientKeys(clients)
  if (known.size === 0) return []
  const group = keysOf(names)
  const hits = new Map<string, ConflictHit>()
  const add = (hit: ConflictHit) => { hits.set(`${hit.applicationNumber}|${hit.existingClientId}|${hit.otherPartyRole}|${companyKey(hit.otherParty)}`, hit) }
  for (const row of groupRows) {
    const owner = row.applicants.find(applicant => group.has(companyKey(applicant)))
    for (const opponent of row.opponents) {
      const client = clientOf(opponent.name, known)
      if (owner === undefined || client === undefined) continue
      add({
        ...rowFacts(row), otherParty: owner, otherPartyRole: 'patent-owner', existingClientId: client, existingClientParty: opponent.name,
        source: 'ep-register', asOf, ...(opponent.filedOn === undefined ? {} : { opposedOn: opponent.filedOn }),
      })
    }
  }
  const opposed = await readAll(data, queries('op', names), maxRows, signal)
  for (const row of opposed.rows) {
    const client = firstClient(row.applicants, known)
    if (client === undefined) continue
    for (const opponent of row.opponents) {
      if (!group.has(companyKey(opponent.name))) continue
      add({
        ...rowFacts(row), otherParty: opponent.name, otherPartyRole: 'opponent', existingClientId: client.clientId,
        existingClientParty: client.party, source: 'ep-register', asOf, ...(opponent.filedOn === undefined ? {} : { opposedOn: opponent.filedOn }),
      })
    }
  }
  return [...hits.values()]
}

/** The fields that a matter row and a reference row share. */
function sharedFields(row: RegisterRow): MatterRow & ReferenceRow {
  return {
    applicationNumber: row.applicationNumber,
    applicants: row.applicants,
    ...(row.publicationNumber === undefined ? {} : { publicationNumber: row.publicationNumber }),
    ...(row.title === undefined ? {} : { title: row.title }),
    ...(row.filed === undefined ? {} : { filed: row.filed }),
  }
}

/**
 * A row of the firm's matters.
 * @param row - the register row.
 * @returns the matter row.
 */
export function matterRow(row: RegisterRow): MatterRow {
  return {
    ...sharedFields(row),
    ...(row.representativeSince === undefined ? {} : { representativeSince: row.representativeSince }),
    ...(row.status === undefined ? {} : { status: row.status }),
  }
}

/**
 * A row of the reference list: the town of the representative, never its name.
 * @param row - the register row.
 * @returns the reference row.
 */
export function referenceRow(row: RegisterRow): ReferenceRow {
  const [representative] = row.representatives
  const town = representative === undefined ? undefined : townOf(representative)
  return { ...sharedFields(row), ...(town === undefined ? {} : { town }) }
}

/**
 * Whether the firm is a representative of record of a row.
 * @param row - the register row.
 * @param identity - the firm identity.
 * @returns true when a representative matches.
 */
export function atFirm(row: RegisterRow, identity: FirmIdentity): boolean {
  return row.representatives.some(party => isFirm(party, identity))
}

/**
 * Review a group: its rows split by the firm identity, and its possible conflicts.
 * @param data - the patent data Service.
 * @param input - the ticked names, the clients of your firm, the firm identity and the row cap.
 * @param input.names - the ticked names.
 * @param input.clients - the clients of your firm.
 * @param input.identity - the firm identity.
 * @param input.maxRows - the row cap of one query.
 * @param asOf - the instant of the read.
 * @param signal - stops the reads.
 * @returns the review.
 */
export async function review(
  data: PatentData,
  input: {
    readonly names: readonly string[]
    readonly clients: readonly KnownClient[]
    readonly identity: FirmIdentity
    readonly maxRows: number
  },
  asOf: string,
  signal?: AbortSignal,
): Promise<ReviewAnswer> {
  const group = await readGroup(data, input.names, input.maxRows, signal)
  const set = identitySet(input.identity)
  const mine = group.rows.filter(row => set && atFirm(row, input.identity))
  const others = group.rows.filter(row => !mine.includes(row))
  return {
    status: 'reviewed',
    asOf,
    total: group.rows.length,
    truncated: group.truncated,
    identity: set ? 'set' : 'missing',
    atFirm: mine.map(matterRow),
    atOtherFirms: others.map(referenceRow),
    conflicts: await registerConflicts(data, input.names, group.rows, input.clients, input.maxRows, asOf, signal),
  }
}
