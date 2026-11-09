/**
 * The review of Add client: the EP applications of a group of applicant names, split by the firm identity into the
 * firm's matters and the reference list, and the possible conflicts that the EP Register shows. The conflict check has
 * two halves: the group opposed a client of the firm (date-sliced `op=` reads of the group's names), and a client of
 * the firm opposed the group (the group's applications in the opponent index). Only the group's names leave the firm;
 * the firm identity and the names of the firm's clients are matched here.
 * @module
 */

import type { PatentData, RegisterRow } from '@deepseek-ai/dsh-flowleap-connectors'
import { companyKey, identitySet, isFirm, townOf, type FirmIdentity } from './identity.ts'
import { opponentTerm, type OpponentIndexFile, type OpposedRow } from './opponent-index-model.ts'
import { readSlice, type SliceReadOptions } from './sliced-read.ts'
import {
  failedSlices, nextUnread, oldestAsOf, sumMismatch, unreadSlices, withSliceRead, type SlicedQuery,
} from './slices.ts'
import type { ConflictHalf, ConflictHit, KnownClient, MatterRow, ReferenceRow, ReviewAnswer } from './wire.ts'

/** The most names in one register query: the EPO answered a query of 4 names and refused one of 8 (2026-11-08). */
const NAMES_PER_QUERY = 4

/** The most rows of one register page. */
const PAGE_ROWS = 100

/** The EP applications of a group, read from the EP Register. */
export interface GroupRead {
  /** One row for each application, in the register's order. */
  readonly rows: readonly RegisterRow[]
  /** Whether a query stopped at the row cap. */
  readonly truncated: boolean
}

/** The queries for a list of terms, a few terms each. */
function queries(terms: readonly string[]): string[] {
  const out: string[] = []
  for (let start = 0; start < terms.length; start += NAMES_PER_QUERY) out.push(terms.slice(start, start + NAMES_PER_QUERY).join(' or '))
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
  const read = await readAll(data, queries(names.map(name => `pa="${name.replaceAll('"', '')}"`)), maxRows, signal)
  return { rows: read.rows.filter(row => row.applicants.some(applicant => group.has(companyKey(applicant)))), truncated: read.truncated }
}

/** The company keys of the known clients' names, to their client ids. */
function clientKeys(clients: readonly KnownClient[]): Map<string, string> {
  const keys = new Map<string, string>()
  for (const client of clients) for (const key of keysOf(client.names)) keys.set(key, client.clientId)
  return keys
}

/** The first name of a list that is a client of your firm, with that client. */
function firstClient(
  names: readonly string[], clients: ReadonlyMap<string, string>,
): { readonly party: string; readonly clientId: string } | undefined {
  for (const party of names) {
    const clientId = clients.get(companyKey(party))
    if (clientId !== undefined) return { party, clientId }
  }
  return undefined
}

/** What a conflict check reads and matches with. */
interface CheckContext {
  /** The company keys of the group's names. */
  readonly group: ReadonlySet<string>
  /** The company keys of the clients' names, to their client ids. */
  readonly known: ReadonlyMap<string, string>
  readonly identity: FirmIdentity
  /** ISO-8601 instant of the review. */
  readonly asOf: string
}

/** The facts of a hit that come from its row. */
function rowFacts(
  row: RegisterRow | OpposedRow, identity: FirmIdentity,
): Pick<ConflictHit, 'applicationNumber' | 'publicationNumber' | 'title' | 'status' | 'yourFirm'> {
  const named = row.representatives.some(party => isFirm(party, identity))
  return {
    applicationNumber: row.applicationNumber,
    ...(row.publicationNumber === undefined ? {} : { publicationNumber: row.publicationNumber }),
    ...(row.title === undefined ? {} : { title: row.title }),
    ...(row.status === undefined ? {} : { status: row.status }),
    yourFirm: !identitySet(identity) ? 'unknown' : named ? 'named' : 'not-named',
  }
}

/**
 * How complete the reads of sliced queries are: `reading` while a slice is unread, `incomplete` with failed slices or
 * a wrong sum, else `complete` as of the oldest read.
 * @param read - the queries.
 * @param asOf - the as-of time when no slice was read, such as for no query.
 * @returns the half.
 */
function halfOf(read: readonly SlicedQuery[], asOf: string): ConflictHalf {
  if (nextUnread(read) !== undefined) return { state: 'reading' }
  const failed = failedSlices(read)
  const mismatches = read.map(sumMismatch).filter(mismatch => mismatch !== undefined)
  if (failed.length > 0 || mismatches.length > 0) return { state: 'incomplete', failed, mismatches }
  return { state: 'complete', asOf: oldestAsOf(read, 'read') ?? asOf }
}

/** One half of the conflict check: how complete it is, and its hits. */
interface HalfResult {
  readonly half: ConflictHalf
  readonly hits: readonly ConflictHit[]
}

/**
 * The first half: the group opposed a client of your firm. Each query of up to four of the group's names is read in
 * date slices, so the half is complete for any group size.
 * @param data - the patent data Service.
 * @param names - the ticked applicant names.
 * @param context - the keys, the identity and the time.
 * @param options - the slice size, the clock and the log.
 * @param signal - stops the reads.
 * @returns the half and its hits.
 */
async function groupOpposedClients(
  data: PatentData, names: readonly string[], context: CheckContext, options: SliceReadOptions, signal?: AbortSignal,
): Promise<HalfResult> {
  const terms = names.map(opponentTerm).filter(term => term !== undefined)
  let read: SlicedQuery[] = queries(terms).map(query => ({ query, slices: unreadSlices() }))
  const hits: ConflictHit[] = []
  for (let unread = nextUnread(read); unread !== undefined; unread = nextUnread(read)) {
    const slice = await readSlice(data, unread, options, signal)
    const { at } = unread
    read = read.map((query, index) => index === at.query ? withSliceRead(query, at.slice, slice) : query)
    for (const row of slice.rows ?? []) {
      const owner = firstClient(row.applicants, context.known)
      if (owner === undefined) continue
      for (const opponent of row.opponents.filter(party => context.group.has(companyKey(party.name)))) {
        hits.push({
          ...rowFacts(row, context.identity), otherParty: opponent.name, otherPartyRole: 'opponent', existingClientId: owner.clientId,
          existingClientParty: owner.party, source: 'ep-register', asOf: context.asOf, ...(opponent.filedOn === undefined ? {} : { opposedOn: opponent.filedOn }),
        })
      }
    }
  }
  return { half: halfOf(read, context.asOf), hits }
}

/**
 * The second half: a client of your firm opposed the group. Each client name has one query in the opponent index; the
 * half is complete when the query of every name is read completely.
 * @param index - the opponent index now.
 * @param context - the keys, the identity and the time.
 * @returns the half and its hits, each as of the read of its query.
 */
function clientsOpposedGroup(index: OpponentIndexFile | undefined, context: CheckContext): HalfResult {
  const used = [...context.known.keys()].map(key => index?.queries.find(query => query.key === key))
  if (used.some(query => query === undefined)) return { half: { state: 'reading' }, hits: [] }
  const read = used.filter(query => query !== undefined)
  const hits: ConflictHit[] = []
  for (const query of read) {
    const asOf = oldestAsOf([query], 'read') ?? context.asOf
    for (const row of Object.values(query.rows)) {
      const owner = row.applicants.find(applicant => context.group.has(companyKey(applicant)))
      if (owner === undefined) continue
      for (const opponent of row.opponents) {
        const client = context.known.get(companyKey(opponent.name))
        if (client === undefined) continue
        hits.push({
          ...rowFacts(row, context.identity), otherParty: owner, otherPartyRole: 'patent-owner', existingClientId: client,
          existingClientParty: opponent.name, source: 'ep-register', asOf, ...(opponent.filedOn === undefined ? {} : { opposedOn: opponent.filedOn }),
        })
      }
    }
  }
  return { half: halfOf(read, context.asOf), hits }
}

/** The conflict check of a review. */
export interface RegisterConflicts {
  /** The hits of both halves, each once. */
  readonly hits: readonly ConflictHit[]
  readonly groupOpposedClients: ConflictHalf
  readonly clientsOpposedGroup: ConflictHalf
}

/** What the conflict check of a review uses. */
export interface ConflictInput {
  /** The ticked applicant names. */
  readonly names: readonly string[]
  /** The clients of your firm, without the client that Add client runs for again. */
  readonly clients: readonly KnownClient[]
  readonly identity: FirmIdentity
  /** The opponent index now; undefined while it has no name. */
  readonly index: OpponentIndexFile | undefined
  /** The slice size, the clock and the log of the `op=` reads of the group. */
  readonly slices: SliceReadOptions
}

/**
 * The possible conflicts that the EP Register shows, in two halves: a name of the group opposed an application of a
 * client of your firm, and a client of your firm opposed an application of the group. With no client, nothing is read
 * and both halves are complete.
 * @param data - the patent data Service.
 * @param input - the names, the clients, the identity, the opponent index and the slice settings.
 * @param asOf - the instant of the review.
 * @param signal - stops the reads.
 * @returns the hits, each once, and how complete each half is.
 */
export async function registerConflicts(
  data: PatentData, input: ConflictInput, asOf: string, signal?: AbortSignal,
): Promise<RegisterConflicts> {
  const context: CheckContext = { group: keysOf(input.names), known: clientKeys(input.clients), identity: input.identity, asOf }
  if (context.known.size === 0) return { hits: [], groupOpposedClients: { state: 'complete', asOf }, clientsOpposedGroup: { state: 'complete', asOf } }
  const first = await groupOpposedClients(data, input.names, context, input.slices, signal)
  const second = clientsOpposedGroup(input.index, context)
  const hits = new Map<string, ConflictHit>()
  for (const hit of [...first.hits, ...second.hits]) hits.set(`${hit.applicationNumber}|${hit.existingClientId}|${hit.otherPartyRole}|${companyKey(hit.otherParty)}`, hit)
  return { hits: [...hits.values()], groupOpposedClients: first.half, clientsOpposedGroup: second.half }
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
 * Review a group: its rows split by the firm identity, and its possible conflicts in two halves.
 * @param data - the patent data Service.
 * @param input - the ticked names, the clients of your firm, the firm identity, the opponent index, the slice settings
 *   and the row cap of the group read.
 * @param asOf - the instant of the read.
 * @param signal - stops the reads.
 * @returns the review.
 */
export async function review(
  data: PatentData, input: ConflictInput & { readonly maxRows: number }, asOf: string, signal?: AbortSignal,
): Promise<ReviewAnswer> {
  const group = await readGroup(data, input.names, input.maxRows, signal)
  const set = identitySet(input.identity)
  const mine = group.rows.filter(row => set && atFirm(row, input.identity))
  const others = group.rows.filter(row => !mine.includes(row))
  const conflicts = await registerConflicts(data, input, asOf, signal)
  const conflictCheck = { groupOpposedClients: conflicts.groupOpposedClients, clientsOpposedGroup: conflicts.clientsOpposedGroup }
  return {
    status: 'reviewed',
    asOf,
    total: group.rows.length,
    truncated: group.truncated,
    identity: set ? 'set' : 'missing',
    atFirm: mine.map(matterRow),
    atOtherFirms: others.map(referenceRow),
    conflicts: conflicts.hits,
    conflictsTruncated: conflictCheck.groupOpposedClients.state !== 'complete' || conflictCheck.clientsOpposedGroup.state !== 'complete',
    conflictCheck,
  }
}
