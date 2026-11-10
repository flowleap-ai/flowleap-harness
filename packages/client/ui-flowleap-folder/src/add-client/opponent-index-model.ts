/**
 * The opponent index as data: one `op=` query for each name of the firm's clients, read in date slices
 * (`slices.ts`), with the EP applications that the name opposed. The conflict check of the review looks for the
 * group's applications in it, on the Host. Everything here is pure; `opponent-index.ts` reads, stores and schedules.
 * @module
 */

import type { RegisterRow } from '@deepseek-ai/dsh-flowleap-connectors'
import { z } from 'zod'
import { termWords } from './docket-model.ts'
import { companyKey } from './identity.ts'
import {
  retryFailedSlices, slicedReadState, storedSchemas, unreadSlices, withSliceRead, type ReadSummary, type Reads, type SliceAt,
  type SliceRead, type SlicedQuery, type StateSettings,
} from './slices.ts'
import type { OpponentIndexState } from './wire.ts'

/** One EP application that a name of the firm's clients opposed, with the facts that a conflict hit shows. */
export interface OpposedRow {
  readonly applicationNumber: string
  readonly publicationNumber?: string
  readonly title?: string
  readonly applicants: readonly string[]
  /** The representatives of record of the application, to say whether the register names your firm. */
  readonly representatives: readonly { readonly name: string; readonly address: readonly string[] }[]
  readonly opponents: readonly { readonly name: string; readonly filedOn?: string }[]
  /** The EP Register status, as the register writes it. */
  readonly status?: string
}

/** The `op=` query of one name of the firm's clients, with its slices and the applications that the name opposed. */
export interface IndexQuery extends SlicedQuery {
  /** The company key of the name; the index has one query for each key. */
  readonly key: string
  /** The opposed applications by application number: the rows with an opponent of this key. */
  readonly rows: Readonly<Record<string, OpposedRow>>
}

/** The opponent index file under `stateDir`. */
export interface OpponentIndexFile {
  readonly version: 1
  /** ISO-8601 instant at which this read of the whole index started. */
  readonly startedAt: string
  readonly queries: readonly IndexQuery[]
}

const { instant, query, application } = storedSchemas

/** Runtime schema of the index file; a file that does not pass is no index. */
const indexFileSchema: z.ZodType<OpponentIndexFile> = z.object({
  version: z.literal(1),
  startedAt: instant,
  queries: z.array(z.object({
    key: z.string(),
    ...query,
    rows: z.record(z.string(), z.object({
      ...application,
      representatives: z.array(z.object({ name: z.string(), address: z.array(z.string()) })),
      opponents: z.array(z.object({ name: z.string(), filedOn: z.string().exactOptional() })),
    })),
  })),
})

/**
 * Read a stored index file: the file is a durable input, so every field is checked.
 * @param value - the parsed JSON of the file.
 * @returns the index.
 * @throws ZodError when a field is missing or has the wrong type.
 */
export function parseIndexFile(value: unknown): OpponentIndexFile {
  return indexFileSchema.parse(value)
}

/**
 * The `op=` term of a name: its words without `&` and punctuation, as the docket writes its terms.
 * @param name - an applicant or client name.
 * @returns the term, or undefined for a name with no word.
 */
export function opponentTerm(name: string): string | undefined {
  const words = termWords(name)
  return words.length === 0 ? undefined : `op="${words.join(' ')}"`
}

/**
 * The `op=` terms of a list of names by company key, the term of the first name of each key; a name with no key or no
 * term is left out.
 * @param names - the names.
 * @returns each key with its term.
 */
export function termsByKey(names: readonly string[]): Map<string, string> {
  const keys = new Map<string, string>()
  for (const name of names) {
    const key = companyKey(name)
    const term = opponentTerm(name)
    if (key !== '' && term !== undefined && !keys.has(key)) keys.set(key, term)
  }
  return keys
}

/**
 * Whether an index reads for the same names: the same company keys in any order.
 * @param index - the index now; undefined is an index of no name.
 * @param names - the names.
 * @returns true when the keys are the same.
 */
export function sameNames(index: OpponentIndexFile | undefined, names: readonly string[]): boolean {
  const keys = termsByKey(names)
  const now = index?.queries ?? []
  return now.length === keys.size && now.every(query => keys.has(query.key))
}

/** A query of a name read again from its count: one unread slice of every date, no count, and no rows. */
function unreadQuery(query: Pick<IndexQuery, 'key' | 'query'>): IndexQuery {
  return { key: query.key, query: query.query, slices: unreadSlices(), rows: {} }
}

/**
 * The index for a list of names: the queries of the names that stay keep their slices and rows, with their failed
 * slices unread again; the new names get an unread query, and the names that are not in the list leave with their
 * rows. So each send of the names also reads again what failed.
 * @param index - the index now.
 * @param names - the names.
 * @param startedAt - ISO-8601 instant, the start of a new index.
 * @returns the index, or undefined for a list with no name.
 */
export function withNames(
  index: OpponentIndexFile | undefined, names: readonly string[], startedAt: string,
): OpponentIndexFile | undefined {
  const keys = termsByKey(names)
  if (keys.size === 0) return undefined
  const kept = retryFailedSlices(index?.queries ?? [], unreadQuery)
  const queries = [...keys].map(([key, query]) => kept.find(item => item.key === key) ?? unreadQuery({ key, query }))
  return { version: 1, startedAt: index?.startedAt ?? startedAt, queries }
}

/**
 * A new read of every query of an index, for the refresh: the slices unread and the rows dropped.
 * @param index - the index.
 * @param startedAt - ISO-8601 instant of the start.
 * @returns the index.
 */
export function freshIndex(index: OpponentIndexFile, startedAt: string): OpponentIndexFile {
  return { ...index, startedAt, queries: index.queries.map(unreadQuery) }
}

/**
 * A register row as an opposed row of a name, when one of its opponents has the key of the name: `op=` matches words,
 * so it also finds other opponents.
 * @param row - the register row.
 * @param key - the company key of the name.
 * @returns the row, or undefined when no opponent has the key.
 */
export function opposedRow(row: RegisterRow, key: string): OpposedRow | undefined {
  if (!row.opponents.some(opponent => companyKey(opponent.name) === key)) return undefined
  return {
    applicationNumber: row.applicationNumber,
    ...(row.publicationNumber === undefined ? {} : { publicationNumber: row.publicationNumber }),
    ...(row.title === undefined ? {} : { title: row.title }),
    applicants: row.applicants,
    representatives: row.representatives.map(party => ({ name: party.name, address: party.address })),
    opponents: row.opponents.map(({ name, filedOn }) => ({ name, ...(filedOn === undefined ? {} : { filedOn }) })),
    ...(row.status === undefined ? {} : { status: row.status }),
  }
}

/**
 * The index after the read of one slice: the slice replaced by what the read gave, and the opposed rows of its name
 * added.
 * @param index - the index.
 * @param at - the slice.
 * @param read - what the read gave.
 * @returns the new index.
 */
export function withIndexSlice(index: OpponentIndexFile, at: SliceAt, read: SliceRead<RegisterRow>): OpponentIndexFile {
  return {
    ...index,
    queries: index.queries.map((query, place): IndexQuery => {
      if (place !== at.query) return query
      const rows = { ...query.rows }
      for (const item of read.rows ?? []) {
        const kept = opposedRow(item, query.key)
        if (kept !== undefined) rows[kept.applicationNumber] = kept
      }
      return { ...withSliceRead(query, at.slice, read), rows }
    }),
  }
}

/** An index read as its state counts it: each opposed application once over all names. */
function summary(index: OpponentIndexFile): ReadSummary {
  return { queries: index.queries, rows: new Set(index.queries.flatMap(query => Object.keys(query.rows))).size, startedAt: index.startedAt }
}

/**
 * The state of the opponent index.
 * @param reads - the served index and its read again; undefined while the index has no name.
 * @param settings - whether a read runs, the time and the refresh age.
 * @returns the state.
 */
export function indexState(reads: Reads<OpponentIndexFile> | undefined, settings: StateSettings): OpponentIndexState {
  if (reads === undefined) return { state: 'no_clients' }
  return slicedReadState(summary(reads.served), reads.refresh === undefined ? undefined : summary(reads.refresh), settings)
}
