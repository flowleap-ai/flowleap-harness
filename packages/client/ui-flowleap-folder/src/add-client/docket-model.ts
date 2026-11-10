/**
 * The firm docket as data: the `re=` queries of the firm identity, the stored docket file, and the state that the page
 * shows. Each query is read in date slices (`slices.ts`). Everything here is pure; `docket.ts` reads, stores and
 * schedules.
 * @module
 */

import type { RegisterRow } from '@deepseek-ai/dsh-flowleap-connectors'
import { z } from 'zod'
import { firmMatch, sameFirmIdentity, type FirmIdentity, type FirmMatch } from './identity.ts'
import {
  retryFailedSlices, slicedReadState, storedSchemas, unreadSlices, withSliceRead, type ReadSummary, type Reads, type SliceAt,
  type SliceRead, type SlicedQuery, type StateSettings,
} from './slices.ts'
import type { DocketState } from './wire.ts'

/** The kind of a firm identity entry that a query reads for. */
export type IdentityEntryKind = 'name' | 'address' | 'representative'

/** One `re=` query of the firm identity with its slices, such as `re="Muster Partner"`. */
export interface DocketQuery extends SlicedQuery {
  readonly kind: IdentityEntryKind
}

/** One EP application of the firm docket. */
export interface DocketRow {
  readonly applicationNumber: string
  readonly publicationNumber?: string
  readonly title?: string
  readonly applicants: readonly string[]
  /** The EP Register status, as the register writes it. */
  readonly status?: string
  /** The day the register recorded the current representative, `YYYY-MM-DD`. */
  readonly representativeSince?: string
  readonly match: FirmMatch
}

/** The docket file under `stateDir`. */
export interface DocketFile {
  readonly version: 1
  /** The identity that the docket was read for; another identity reads it again. */
  readonly identity: FirmIdentity
  /** ISO-8601 instant at which this read of the whole docket started. */
  readonly startedAt: string
  readonly queries: readonly DocketQuery[]
  /** The firm's applications, by application number; each one once over all queries. */
  readonly rows: Readonly<Record<string, DocketRow>>
}

const { instant, query, application } = storedSchemas

/** Runtime schema of the docket file; a file that does not pass is no docket. */
const docketFileSchema: z.ZodType<DocketFile> = z.object({
  version: z.literal(1),
  identity: z.object({ names: z.array(z.string()), addresses: z.array(z.string()), representatives: z.array(z.string()) }),
  startedAt: instant,
  queries: z.array(z.object({
    kind: z.enum(['name', 'address', 'representative']),
    ...query,
  })),
  rows: z.record(z.string(), z.object({
    ...application,
    representativeSince: z.string().exactOptional(),
    match: z.enum(['name', 'representative', 'address']),
  })),
})

/**
 * Read a stored docket file: the file is a durable input, so every field is checked.
 * @param value - the parsed JSON of the file.
 * @returns the docket.
 * @throws ZodError when a field is missing or has the wrong type.
 */
export function parseDocketFile(value: unknown): DocketFile {
  return docketFileSchema.parse(value)
}

/** The order of the matches, strongest first. */
const MATCH_RANK: Readonly<Record<FirmMatch, number>> = { name: 0, representative: 1, address: 2 }

/**
 * A register row as a docket row, when the firm check passes: `re=` matches words anywhere in a representative and its
 * address, so it also finds other firms.
 * @param row - the register row.
 * @param identity - the firm identity.
 * @returns the row with its strongest match over its representatives, or undefined when no representative is the firm.
 */
export function docketRow(row: RegisterRow, identity: FirmIdentity): DocketRow | undefined {
  let match: FirmMatch | undefined
  for (const party of row.representatives) {
    const found = firmMatch(party, identity)
    if (found !== undefined && (match === undefined || MATCH_RANK[found] < MATCH_RANK[match])) match = found
  }
  if (match === undefined) return undefined
  return {
    applicationNumber: row.applicationNumber,
    ...(row.publicationNumber === undefined ? {} : { publicationNumber: row.publicationNumber }),
    ...(row.title === undefined ? {} : { title: row.title }),
    applicants: row.applicants,
    ...(row.status === undefined ? {} : { status: row.status }),
    ...(row.representativeSince === undefined ? {} : { representativeSince: row.representativeSince }),
    match,
  }
}

/**
 * The words of a name for a register term, with punctuation and `&` as spaces and the case kept: the register index
 * has no `&`, and a name with `&` finds no row.
 * @param text - a name or an address line.
 * @returns the words.
 */
export function termWords(text: string): string[] {
  return text.normalize('NFKC').replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ').split(/\s+/u).filter(word => word !== '')
}

/**
 * The register term of a representative: the register stores persons as `Surname, First`. An entry with words before
 * a comma is already in that form; else its last word is the surname.
 */
function personTerm(entry: string): string {
  const comma = entry.indexOf(',')
  const before = comma === -1 ? [] : termWords(entry.slice(0, comma))
  const [surname, first] = before.length > 0
    ? [before, termWords(entry.slice(comma + 1))]
    : [termWords(entry).slice(-1), termWords(entry).slice(0, -1)]
  return first.length === 0 ? surname.join(' ') : `${surname.join(' ')}, ${first.join(' ')}`
}

/**
 * The `re=` queries of a firm identity: one for each name, each address line and each representative, each once.
 * No query holds anything but the firm's own words.
 * @param identity - the firm identity.
 * @returns the queries, each with one slice of every date, unread.
 */
export function docketQueries(identity: FirmIdentity): DocketQuery[] {
  const terms: { readonly kind: IdentityEntryKind; readonly term: string }[] = [
    ...identity.names.map(entry => ({ kind: 'name' as const, term: termWords(entry).join(' ') })),
    ...identity.addresses.map(entry => ({ kind: 'address' as const, term: termWords(entry).join(' ') })),
    ...identity.representatives.map(entry => ({ kind: 'representative' as const, term: personTerm(entry) })),
  ]
  const seen = new Set<string>()
  const queries: DocketQuery[] = []
  for (const { kind, term } of terms) {
    if (term === '' || seen.has(term.toLowerCase())) continue
    seen.add(term.toLowerCase())
    queries.push({ kind, query: `re="${term}"`, slices: unreadSlices() })
  }
  return queries
}

/**
 * A new docket read for an identity: every query unread and no rows.
 * @param identity - the firm identity.
 * @param startedAt - ISO-8601 instant of the start.
 * @returns the docket.
 */
export function freshDocket(identity: FirmIdentity, startedAt: string): DocketFile {
  return { version: 1, identity, startedAt, queries: docketQueries(identity), rows: {} }
}

/**
 * Whether a docket was read for this identity.
 * @param docket - the stored docket.
 * @param identity - the firm identity now.
 * @returns true when every entry is the same, in the same order.
 */
export function sameIdentity(docket: DocketFile, identity: FirmIdentity): boolean {
  return sameFirmIdentity(docket.identity, identity)
}

/** A docket read as its state counts it: one row for each application. */
function summary(docket: DocketFile): ReadSummary {
  return { queries: docket.queries, rows: Object.keys(docket.rows).length, startedAt: docket.startedAt }
}

/**
 * The state of the docket of a firm identity that names something; with no such identity there is no docket, and the
 * state is `no_identity`.
 * @param reads - the docket reads of the identity now: the served docket and its read again.
 * @param settings - whether a read runs, the time and the refresh age.
 * @returns the state that the page shows.
 */
export function docketState(reads: Reads<DocketFile>, settings: StateSettings): Exclude<DocketState, { state: 'no_identity' }> {
  return slicedReadState(summary(reads.served), reads.refresh === undefined ? undefined : summary(reads.refresh), settings)
}

/**
 * The docket after the read of one slice: the slice replaced by what the read gave, and the rows whose representative
 * is the firm of the docket's identity added.
 * @param docket - the docket.
 * @param at - the slice.
 * @param read - what the read gave.
 * @returns the new docket.
 */
export function withSlice(docket: DocketFile, at: SliceAt, read: SliceRead<RegisterRow>): DocketFile {
  const rows = { ...docket.rows }
  for (const item of read.rows ?? []) {
    const kept = docketRow(item, docket.identity)
    if (kept !== undefined) rows[kept.applicationNumber] = kept
  }
  const queries = docket.queries.map((query, index) => index === at.query ? withSliceRead(query, at.slice, read) : query)
  return { ...docket, rows, queries }
}

/**
 * The docket for Try again: the failed slices unread, and every query whose sum was wrong read again from its count.
 * The rows stay.
 * @param docket - the docket.
 * @returns the docket to read on.
 */
export function retryFailed(docket: DocketFile): DocketFile {
  const unread = (query: DocketQuery): DocketQuery => ({ kind: query.kind, query: query.query, slices: unreadSlices() })
  return { ...docket, queries: retryFailedSlices(docket.queries, unread) }
}

/**
 * The docket reads for Try again: {@link retryFailed} of the read again when there is one, else of the served docket.
 * @param reads - the docket reads.
 * @returns the reads to read on.
 */
export function retryLatest(reads: Reads<DocketFile>): Reads<DocketFile> {
  return reads.refresh === undefined ? { served: retryFailed(reads.served) } : { served: reads.served, refresh: retryFailed(reads.refresh) }
}
