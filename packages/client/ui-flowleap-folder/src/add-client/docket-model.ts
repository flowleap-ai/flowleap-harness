/**
 * The firm docket as data: the `re=` queries of the firm identity, the date slices of each query, the stored docket
 * file, and the state that the page shows. Everything here is pure; `docket.ts` reads, stores and schedules.
 *
 * A query whose count is over `registerSliceRows` splits by year, a year by month, and a month into halves of its days,
 * until each slice has at most `registerSliceRows` rows; the EPO reads at most 2,000 rows of one query. A slice still
 * over the limit on one day fails. The slices of a query must sum to its count, which the EPO caps at 10,000.
 * @module
 */

import type { RegisterRow } from '@deepseek-ai/dsh-flowleap-connectors'
import { z } from 'zod'
import { firmMatch, sameFirmIdentity, type FirmIdentity, type FirmMatch } from './identity.ts'
import type { DocketFailedSlice, DocketFailureCode, DocketState, DocketSumMismatch } from './wire.ts'

/** The count at which the EPO stops counting the rows of one query. */
export const REGISTER_COUNT_CAP = 10_000

/** The year of the first EP publications. */
export const FIRST_EP_YEAR = 1978

/** The most rows of one register page. */
export const PAGE_ROWS = 100

/** The kind of a firm identity entry that a query reads for. */
export type IdentityEntryKind = 'name' | 'address' | 'representative'

/** The publication dates of one slice: every date, one year, one month, or a range of days (`YYYY-MM-DD`, inclusive). */
export type SliceRange =
  | { readonly kind: 'all' }
  | { readonly kind: 'year'; readonly year: number }
  | { readonly kind: 'month'; readonly year: number; readonly month: number }
  | { readonly kind: 'days'; readonly from: string; readonly to: string }

/** One date slice of a query and how its read ended. `rows` counts the register rows read, before the firm check. */
export type Slice =
  | { readonly range: SliceRange; readonly state: 'unread' }
  | { readonly range: SliceRange; readonly state: 'read'; readonly total: number; readonly rows: number; readonly asOf: string }
  | { readonly range: SliceRange; readonly state: 'failed'; readonly failure: DocketFailureCode; readonly asOf: string }

/** One `re=` query of the firm identity with its slices. */
export interface DocketQuery {
  readonly kind: IdentityEntryKind
  /** The register CQL without dates, such as `re="Muster Partner"`. */
  readonly query: string
  /** The EPO count of the whole query, once read; capped at {@link REGISTER_COUNT_CAP}. */
  readonly total?: number
  /** The slices in date order; a split slice is replaced by its parts. */
  readonly slices: readonly Slice[]
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

const count = z.number().int().nonnegative()
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u)
const instant = z.iso.datetime()
const rangeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('all') }),
  z.object({ kind: z.literal('year'), year: count }),
  z.object({ kind: z.literal('month'), year: count, month: z.number().int().min(1).max(12) }),
  z.object({ kind: z.literal('days'), from: day, to: day }),
])

/** Runtime schema of the docket file; a file that does not pass is no docket. */
const docketFileSchema: z.ZodType<DocketFile> = z.object({
  version: z.literal(1),
  identity: z.object({ names: z.array(z.string()), addresses: z.array(z.string()), representatives: z.array(z.string()) }),
  startedAt: instant,
  queries: z.array(z.object({
    kind: z.enum(['name', 'address', 'representative']),
    query: z.string(),
    total: count.exactOptional(),
    slices: z.array(z.discriminatedUnion('state', [
      z.object({ range: rangeSchema, state: z.literal('unread') }),
      z.object({ range: rangeSchema, state: z.literal('read'), total: count, rows: count, asOf: instant }),
      z.object({ range: rangeSchema, state: z.literal('failed'), failure: z.enum(['no-key', 'unreachable', 'malformed', 'day-over-limit', 'internal']), asOf: instant }),
    ])),
  })),
  rows: z.record(z.string(), z.object({
    applicationNumber: z.string(),
    publicationNumber: z.string().exactOptional(),
    title: z.string().exactOptional(),
    applicants: z.array(z.string()),
    status: z.string().exactOptional(),
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

/** The words of an identity entry with punctuation and `&` as spaces, case kept: the register index has no `&`. */
function termWords(text: string): string[] {
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
    queries.push({ kind, query: `re="${term}"`, slices: [{ range: { kind: 'all' }, state: 'unread' }] })
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

/** Two digits. */
function two(value: number): string {
  return String(value).padStart(2, '0')
}

/** `YYYY-MM-DD` of a UTC day. */
function dayText(date: Date): string {
  return `${date.getUTCFullYear()}-${two(date.getUTCMonth() + 1)}-${two(date.getUTCDate())}`
}

/** The UTC day of `YYYY-MM-DD`, in days since the epoch. */
function dayNumber(day: string): number {
  return Date.parse(`${day}T00:00:00Z`) / 86_400_000
}

/**
 * The register CQL of one slice of a query, in the date forms that the EP Register answered on 2026-11-09:
 * `pd within "2025"`, `pd within "202503"` and `pd>=20250101 and pd<=20250331`.
 * @param query - the query without dates.
 * @param range - the slice.
 * @returns the CQL.
 */
export function sliceQuery(query: string, range: SliceRange): string {
  switch (range.kind) {
    case 'all': return query
    case 'year': return `${query} and pd within "${String(range.year)}"`
    case 'month': return `${query} and pd within "${String(range.year)}${two(range.month)}"`
    case 'days': return `${query} and pd>=${range.from.replaceAll('-', '')} and pd<=${range.to.replaceAll('-', '')}`
  }
}

/**
 * The parts of a slice with too many rows: every date splits into the years from {@link FIRST_EP_YEAR} to this year,
 * a year into its months up to today, a month and a range of days into two halves of its days.
 * @param range - the slice.
 * @param today - the date now, which ends the years and months.
 * @returns the parts in date order, or undefined for one day, which cannot split.
 */
export function splitRange(range: SliceRange, today: Date): SliceRange[] | undefined {
  switch (range.kind) {
    case 'all': {
      const years: SliceRange[] = []
      for (let year = FIRST_EP_YEAR; year <= today.getUTCFullYear(); year += 1) years.push({ kind: 'year', year })
      return years
    }
    case 'year': {
      const last = range.year === today.getUTCFullYear() ? today.getUTCMonth() + 1 : 12
      return Array.from({ length: last }, (_unused, index): SliceRange => ({ kind: 'month', year: range.year, month: index + 1 }))
    }
    case 'month': {
      const from = `${String(range.year)}-${two(range.month)}-01`
      return halves(from, dayText(new Date(Date.UTC(range.year, range.month, 0))))
    }
    case 'days': return range.from === range.to ? undefined : halves(range.from, range.to)
  }
}

/** Two halves of a range of at least two days. */
function halves(from: string, to: string): SliceRange[] {
  const first = dayNumber(from)
  const middle = Math.floor((first + dayNumber(to)) / 2)
  return [
    { kind: 'days', from, to: dayText(new Date(middle * 86_400_000)) },
    { kind: 'days', from: dayText(new Date((middle + 1) * 86_400_000)), to },
  ]
}

/**
 * The sum check of a query whose slices are all read: the rows of its slices must be its count, or at least the cap
 * when the EPO capped the count.
 * @param query - the query.
 * @returns the mismatch, or undefined when the sum is right or the query is not read completely.
 */
export function sumMismatch(query: DocketQuery): DocketSumMismatch | undefined {
  if (query.total === undefined) return undefined
  let counted = 0
  for (const slice of query.slices) {
    if (slice.state !== 'read') return undefined
    counted += slice.rows
  }
  const expected = Math.min(query.total, REGISTER_COUNT_CAP)
  const right = query.total >= REGISTER_COUNT_CAP ? counted >= REGISTER_COUNT_CAP : counted === query.total
  return right ? undefined : { query: query.query, total: query.total, counted, missing: expected - counted }
}

/** The settings that decide the state. */
export interface StateSettings {
  /** Whether a read runs now. */
  readonly reading: boolean
  /** The time now, in milliseconds since the epoch. */
  readonly now: number
  /** `docketRefreshAge`: the age at which a read docket is stale. */
  readonly refreshAge: number
}

/**
 * The time of the oldest slice that a read ended, read or failed.
 * @param docket - the docket.
 * @param only - `read` to count only the read slices.
 * @returns the ISO-8601 instant, or undefined when no slice ended.
 */
export function oldestAsOf(docket: DocketFile, only?: 'read'): string | undefined {
  let oldest: string | undefined
  for (const query of docket.queries) {
    for (const slice of query.slices) {
      if (slice.state === 'unread' || (only === 'read' && slice.state !== 'read')) continue
      if (oldest === undefined || Date.parse(slice.asOf) < Date.parse(oldest)) oldest = slice.asOf
    }
  }
  return oldest
}

/**
 * The state of the docket of a firm identity that names something; with no such identity there is no docket, and the
 * state is `no_identity`.
 * @param docket - the docket of the identity now.
 * @param settings - whether a read runs, the time and the refresh age.
 * @returns the state that the page shows.
 */
export function docketState(docket: DocketFile, settings: StateSettings): Exclude<DocketState, { state: 'no_identity' }> {
  const slices = docket.queries.flatMap(query => query.slices.map(slice => ({ query: query.query, slice })))
  const rows = Object.keys(docket.rows).length
  const progress = { slicesDone: slices.filter(({ slice }) => slice.state !== 'unread').length, slices: slices.length, rows }
  if (settings.reading) return { state: 'reading', progress }
  if (progress.slicesDone < progress.slices) return { state: 'interrupted', progress }
  const failed: DocketFailedSlice[] = []
  for (const { query, slice } of slices) {
    if (slice.state === 'failed') failed.push({ query: sliceQuery(query, slice.range), reason: slice.failure })
  }
  const [first] = failed
  if (first !== undefined && failed.length === slices.length) return { state: 'failed', reason: first.reason, failed }
  // A docket of no query has nothing to read: it is read when it starts.
  const asOf = oldestAsOf(docket, 'read') ?? docket.startedAt
  const mismatches = docket.queries.map(sumMismatch).filter(mismatch => mismatch !== undefined)
  if (failed.length > 0 || mismatches.length > 0) return { state: 'partial', rows, asOf, failed, mismatches }
  return { state: settings.now - Date.parse(asOf) >= settings.refreshAge ? 'stale' : 'ready', rows, asOf }
}

/** The place of one slice: the index of its query and its index in that query. */
export interface SliceAt {
  readonly query: number
  readonly slice: number
}

/** An unread slice: its place, its query and its dates. */
export interface UnreadSlice {
  readonly at: SliceAt
  /** The register CQL of its query, without dates. */
  readonly query: string
  readonly range: SliceRange
}

/**
 * The first unread slice.
 * @param docket - the docket.
 * @returns the slice, or undefined when every slice ended.
 */
export function nextUnread(docket: DocketFile): UnreadSlice | undefined {
  for (const [query, entry] of docket.queries.entries()) {
    for (const [slice, item] of entry.slices.entries()) {
      if (item.state === 'unread') return { at: { query, slice }, query: entry.query, range: item.range }
    }
  }
  return undefined
}

/** What the read of one slice adds to its query and to the rows. */
export interface SliceResult {
  /** The slices that take the place of the slice: the slice as it ended, or its parts. */
  readonly slices: readonly Slice[]
  /** The count of the whole query, from the read of its slice of every date. */
  readonly total?: number
  /** The firm's rows of the slice. */
  readonly rows?: readonly DocketRow[]
}

/**
 * The docket after the read of one slice.
 * @param docket - the docket.
 * @param at - the slice.
 * @param result - what the read gave.
 * @returns the new docket.
 */
export function withSlice(docket: DocketFile, at: SliceAt, result: SliceResult): DocketFile {
  const rows = { ...docket.rows }
  for (const row of result.rows ?? []) rows[row.applicationNumber] = row
  return {
    ...docket,
    rows,
    queries: docket.queries.map((query, index): DocketQuery => index !== at.query ? query : {
      ...query,
      ...(result.total === undefined ? {} : { total: result.total }),
      slices: [...query.slices.slice(0, at.slice), ...result.slices, ...query.slices.slice(at.slice + 1)],
    }),
  }
}

/**
 * The docket for Try again: the failed slices unread, and every slice of a query whose sum was wrong replaced by one
 * slice of every date. The rows stay.
 * @param docket - the docket.
 * @returns the docket to read on.
 */
export function retryFailed(docket: DocketFile): DocketFile {
  return {
    ...docket,
    queries: docket.queries.map((query): DocketQuery => sumMismatch(query) === undefined
      ? { ...query, slices: query.slices.map((slice): Slice => slice.state === 'failed' ? { range: slice.range, state: 'unread' } : slice) }
      : { kind: query.kind, query: query.query, slices: [{ range: { kind: 'all' }, state: 'unread' }] }),
  }
}
