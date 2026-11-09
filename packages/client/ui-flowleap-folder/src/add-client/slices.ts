/**
 * The date slices of EP Register queries, as data: the firm docket, the opponent index and the conflict check of the
 * review read each query in slices. Everything here is pure; `sliced-read.ts` reads the slices.
 *
 * A query whose count is over `registerSliceRows` splits by year, a year by month, and a month into halves of its days,
 * until each slice has at most `registerSliceRows` rows; the EPO reads at most 2,000 rows of one query. A slice still
 * over the limit on one day fails. The slices of a query must sum to its count, which the EPO caps at 10,000.
 * @module
 */

import { z } from 'zod'
import type { FailedSlice, RefreshState, SliceFailureCode, SliceProgress, SlicedReadState, SumMismatch } from './wire.ts'

/** The count at which the EPO stops counting the rows of one query. */
export const REGISTER_COUNT_CAP = 10_000

/** The year of the first EP publications. */
export const FIRST_EP_YEAR = 1978

/** The most rows of one register page. */
export const PAGE_ROWS = 100

/** The publication dates of one slice: every date, one year, one month, or a range of days (`YYYY-MM-DD`, inclusive). */
export type SliceRange =
  | { readonly kind: 'all' }
  | { readonly kind: 'year'; readonly year: number }
  | { readonly kind: 'month'; readonly year: number; readonly month: number }
  | { readonly kind: 'days'; readonly from: string; readonly to: string }

/** One date slice of a query and how its read ended. `rows` counts the register rows read, before any row check. */
export type Slice =
  | { readonly range: SliceRange; readonly state: 'unread' }
  | { readonly range: SliceRange; readonly state: 'read'; readonly total: number; readonly rows: number; readonly asOf: string }
  | { readonly range: SliceRange; readonly state: 'failed'; readonly failure: SliceFailureCode; readonly asOf: string }

/** One register query with its slices. */
export interface SlicedQuery {
  /** The register CQL without dates, such as `re="Muster Partner"`. */
  readonly query: string
  /** The EPO count of the whole query, once read; capped at {@link REGISTER_COUNT_CAP}. */
  readonly total?: number
  /** The slices in date order; a split slice is replaced by its parts. */
  readonly slices: readonly Slice[]
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

/**
 * Runtime schemas of the files that keep sliced queries: an ISO-8601 instant, the fields of a {@link SlicedQuery}, and
 * the fields of an EP application that every stored row has.
 */
export const storedSchemas = {
  instant,
  query: {
    query: z.string(),
    total: count.exactOptional(),
    slices: z.array(z.discriminatedUnion('state', [
      z.object({ range: rangeSchema, state: z.literal('unread') }),
      z.object({ range: rangeSchema, state: z.literal('read'), total: count, rows: count, asOf: instant }),
      z.object({ range: rangeSchema, state: z.literal('failed'), failure: z.enum(['no-key', 'unreachable', 'malformed', 'day-over-limit', 'internal']), asOf: instant }),
    ])),
  },
  application: {
    applicationNumber: z.string(),
    publicationNumber: z.string().exactOptional(),
    title: z.string().exactOptional(),
    applicants: z.array(z.string()),
    status: z.string().exactOptional(),
  },
}

/**
 * The slices of a query that is not read yet: one slice of every date.
 * @returns the slices.
 */
export function unreadSlices(): Slice[] {
  return [{ range: { kind: 'all' }, state: 'unread' }]
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
function dayNumber(text: string): number {
  return Date.parse(`${text}T00:00:00Z`) / 86_400_000
}

/**
 * The register CQL of one slice of a query, in the date forms that the EP Register answered on 2026-11-09:
 * `pd within "2025"`, `pd within "202503"` and `pd>=20250101 and pd<=20250331`. A query with `or` is in parentheses.
 * @param query - the query without dates.
 * @param range - the slice.
 * @returns the CQL.
 */
export function sliceQuery(query: string, range: SliceRange): string {
  if (range.kind === 'all') return query
  const base = query.includes(' or ') ? `(${query})` : query
  switch (range.kind) {
    case 'year': return `${base} and pd within "${String(range.year)}"`
    case 'month': return `${base} and pd within "${String(range.year)}${two(range.month)}"`
    case 'days': return `${base} and pd>=${range.from.replaceAll('-', '')} and pd<=${range.to.replaceAll('-', '')}`
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
export function sumMismatch(query: SlicedQuery): SumMismatch | undefined {
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

/**
 * The time of the oldest slice that a read ended, read or failed.
 * @param queries - the queries.
 * @param only - `read` to count only the read slices.
 * @returns the ISO-8601 instant, or undefined when no slice ended.
 */
export function oldestAsOf(queries: readonly SlicedQuery[], only?: 'read'): string | undefined {
  let oldest: string | undefined
  for (const query of queries) {
    for (const slice of query.slices) {
      if (slice.state === 'unread' || (only === 'read' && slice.state !== 'read')) continue
      if (oldest === undefined || Date.parse(slice.asOf) < Date.parse(oldest)) oldest = slice.asOf
    }
  }
  return oldest
}

/**
 * The failed slices of queries, each with its dated CQL.
 * @param queries - the queries.
 * @returns the failed slices in query order.
 */
export function failedSlices(queries: readonly SlicedQuery[]): FailedSlice[] {
  return queries.flatMap(query => query.slices.flatMap(slice => slice.state === 'failed' ? [{ query: sliceQuery(query.query, slice.range), reason: slice.failure }] : []))
}

/**
 * The reads of one file of sliced queries. `served` is the read that the page and the review use. `refresh` is a read
 * again that started beside a complete served read: it runs beside the served read and takes its place when it ends
 * complete.
 */
export interface Reads<F> {
  readonly served: F
  readonly refresh?: F
}

/** One of the reads of a file: the served read or its read again. */
export type ReadName = keyof Reads<unknown>

/**
 * Whether a read ended complete: every slice read, and the slices of each query sum to its count.
 * @param queries - the queries of the read.
 * @returns true for a complete read.
 */
export function isComplete(queries: readonly SlicedQuery[]): boolean {
  return nextUnread(queries) === undefined && !hasFailures(queries)
}

/**
 * The reads with a read again that ended complete in the place of the served read.
 * @param reads - the reads.
 * @returns the reads, with no read again when it ended complete.
 */
export function settled<F extends { readonly queries: readonly SlicedQuery[] }>(reads: Reads<F>): Reads<F> {
  return reads.refresh !== undefined && isComplete(reads.refresh.queries) ? { served: reads.refresh } : reads
}

/** One read of sliced queries, as its state counts it. */
export interface ReadSummary {
  readonly queries: readonly SlicedQuery[]
  /** The rows kept so far. */
  readonly rows: number
  /** ISO-8601 instant at which the read started; the as-of time of a read with no query. */
  readonly startedAt: string
}

/** The settings that decide the state. */
export interface StateSettings {
  /** The read that runs now, if one runs. */
  readonly reading: ReadName | undefined
  /** The time now, in milliseconds since the epoch. */
  readonly now: number
  /** The age at which a read file is stale. */
  readonly refreshAge: number
}

/** The slices that a read ended, the slices known, and the rows kept. */
function progressOf(read: ReadSummary): SliceProgress {
  const slices = read.queries.flatMap(query => query.slices)
  return { slicesDone: slices.filter(slice => slice.state !== 'unread').length, slices: slices.length, rows: read.rows }
}

/** The queries of a read whose slices do not sum to their count. */
function mismatchesOf(queries: readonly SlicedQuery[]): SumMismatch[] {
  return queries.map(sumMismatch).filter(mismatch => mismatch !== undefined)
}

/** The state of one read, as the only read of its file. */
function readState(read: ReadSummary, reading: boolean, settings: StateSettings): SlicedReadState {
  const progress = progressOf(read)
  if (reading) return { state: 'reading', progress }
  if (progress.slicesDone < progress.slices) return { state: 'interrupted', progress }
  const failed = failedSlices(read.queries)
  const [first] = failed
  if (first !== undefined && failed.length === progress.slices) return { state: 'failed', reason: first.reason, failed }
  // A read of no query has nothing to read: it is read when it starts.
  const asOf = oldestAsOf(read.queries, 'read') ?? read.startedAt
  const mismatches = mismatchesOf(read.queries)
  if (failed.length > 0 || mismatches.length > 0) return { state: 'partial', rows: read.rows, asOf, failed, mismatches }
  return { state: settings.now - Date.parse(asOf) >= settings.refreshAge ? 'stale' : 'ready', rows: read.rows, asOf }
}

/** The state of a read again, which never ends complete: a complete read again takes the place of the served read. */
function refreshState(refresh: ReadSummary, reading: boolean): RefreshState {
  const progress = progressOf(refresh)
  if (reading) return { state: 'reading', progress }
  if (progress.slicesDone < progress.slices) return { state: 'interrupted', progress }
  return { state: 'failed', failed: failedSlices(refresh.queries), mismatches: mismatchesOf(refresh.queries) }
}

/**
 * The state of the reads of a file of sliced queries. A complete served read is `ready` or `stale` with its rows and
 * as-of time, and with the state of its read again when there is one; else the state is that of the served read.
 * @param served - the served read.
 * @param refresh - the read again of a complete served read, when there is one.
 * @param settings - whether a read runs, the time and the refresh age.
 * @returns the state that the page shows.
 */
export function slicedReadState(served: ReadSummary, refresh: ReadSummary | undefined, settings: StateSettings): SlicedReadState {
  const state = readState(served, settings.reading === 'served', settings)
  if (refresh === undefined || (state.state !== 'ready' && state.state !== 'stale')) return state
  return { ...state, refresh: refreshState(refresh, settings.reading === 'refresh') }
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
 * @param queries - the queries.
 * @returns the slice, or undefined when every slice ended.
 */
export function nextUnread(queries: readonly SlicedQuery[]): UnreadSlice | undefined {
  for (const [query, entry] of queries.entries()) {
    for (const [slice, item] of entry.slices.entries()) {
      if (item.state === 'unread') return { at: { query, slice }, query: entry.query, range: item.range }
    }
  }
  return undefined
}

/** What the read of one slice gives, with the rows of its kind. */
export interface SliceRead<R> {
  /** The slices that take the place of the slice: the slice as it ended, or its parts. */
  readonly slices: readonly Slice[]
  /** The count of the whole query, from the read of its slice of every date. */
  readonly total?: number
  /** The rows of the slice. */
  readonly rows?: readonly R[]
}

/**
 * A query after the read of one of its slices.
 * @param query - the query.
 * @param slice - the index of the slice in the query.
 * @param read - what the read gave.
 * @returns the new query.
 */
export function withSliceRead<Q extends SlicedQuery>(query: Q, slice: number, read: SliceRead<unknown>): Q {
  return {
    ...query,
    ...(read.total === undefined ? {} : { total: read.total }),
    slices: [...query.slices.slice(0, slice), ...read.slices, ...query.slices.slice(slice + 1)],
  }
}

/**
 * Whether a read of queries has failed slices or a query whose sum was wrong.
 * @param queries - the queries.
 * @returns true when Try again has something to read.
 */
export function hasFailures(queries: readonly SlicedQuery[]): boolean {
  return failedSlices(queries).length > 0 || queries.some(query => sumMismatch(query) !== undefined)
}

/**
 * Queries for Try again: the failed slices unread, and every query whose sum was wrong read again from its count.
 * @param queries - the queries.
 * @param unread - the query read again from its count: one unread slice of every date, no count, and no rows.
 * @returns the queries to read on.
 */
export function retryFailedSlices<Q extends SlicedQuery>(queries: readonly Q[], unread: (query: Q) => Q): Q[] {
  return queries.map((query): Q => sumMismatch(query) === undefined
    ? { ...query, slices: query.slices.map((slice): Slice => slice.state === 'failed' ? { range: slice.range, state: 'unread' } : slice) }
    : unread(query))
}
