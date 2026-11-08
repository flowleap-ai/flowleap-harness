/**
 * EP patent data for Host plugins, read on the firm's EPO OPS key without a
 * Session or a tool call: the `flowleapPatentData` service that the "Add client"
 * flow of the client folder plugin consumes. It searches the EP Register, reads
 * one register record, one family and the text of one publication, and finds the
 * applicant names that match a typed company name.
 *
 * Every answer of the library is checked with zod before it leaves this module.
 * Only company names and EP application or publication numbers go to the EPO.
 * @module
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import {
  DataKeysRequiredError, ErrorCodes, ProviderKeyInvalidError,
  type ConnectorHost, type Connectors, type ProviderReadFailure, type ProviderReadResult,
} from '@flowleap/connectors'
import { z } from 'zod'
import type { BoundConnectorHost } from './host.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** EP Register and family reads on the firm's EPO OPS key. */
    flowleapPatentData: PatentData
  }
}

/** An EP application number: `EP` and eight digits, for example `EP23171862`. */
export type EpApplicationNumber = Branded<'EpApplicationNumber'>

/** An EP publication number: `EP`, seven digits and an optional kind code, for example `EP4292805A1` or `EP4292805`. */
export type EpPublicationNumber = Branded<'EpPublicationNumber'>

/** A party that the EP Register names: a representative or an opponent. */
export interface RegisterParty {
  /** The name as the register writes it. */
  readonly name: string
  /** The country of the address, not the nationality. */
  readonly country?: string
  /** The address lines, in the order of the register. */
  readonly address: readonly string[]
}

/** An opponent that the EP Register names. */
export interface RegisterOpponent extends RegisterParty {
  /** The day the opposition was filed, `YYYY-MM-DD`. */
  readonly filedOn?: string
  /** The status of the opponent in the register, for example `ADMISSIBLE`. */
  readonly status?: string
}

/** One EP application as the EP Register lists it. */
export interface RegisterRow {
  /** The EP application number. */
  readonly applicationNumber: EpApplicationNumber
  /** The earliest EP publication. The kind code is absent: the library drops it. */
  readonly publicationNumber?: EpPublicationNumber
  /** The English title when the register has several languages, else the first. */
  readonly title?: string
  /** The applicant names in the order of the register. */
  readonly applicants: readonly string[]
  /** The professional representatives of record. Empty when the register names none. */
  readonly representatives: readonly RegisterParty[]
  /** The day the current representatives were recorded, `YYYY-MM-DD`. */
  readonly representativeSince?: string
  /** The opponents of every opposition. */
  readonly opponents: readonly RegisterOpponent[]
  /** The status text of the register. */
  readonly status?: string
  /** The filing day, `YYYY-MM-DD`. */
  readonly filed?: string
  /** The day of the earliest publication, `YYYY-MM-DD`. */
  readonly published?: string
}

/** One page of an EP Register search. */
export interface RegisterPage {
  /** The count of the EPO for the whole query. The EPO caps it at 10000. */
  readonly total: number
  /** The first row of this page, counted from 1. */
  readonly begin: number
  /** The last row of this page. It is below `begin` when the page is empty. */
  readonly end: number
  /** The rows of this page. */
  readonly rows: readonly RegisterRow[]
}

/** The applicant names that match a typed company name. */
export interface ApplicantNames {
  /** Where the names come from. `patstat` is reserved for a later provider. */
  readonly source: 'patstat' | 'ep-register'
  /** The PATSTAT edition. It is absent for the register. */
  readonly edition?: string
  /**
   * One name for each company key, with its count of EP applications, by count (high first), then by name. Names that
   * differ only in case or punctuation are one name: the spelling that the register uses most, with the applications
   * of all its spellings, each application once.
   */
  readonly names: readonly { readonly name: string; readonly applications: number }[]
  /** True when the read stopped at `maxRows` and the register holds more rows. */
  readonly truncated: boolean
}

/** The family of one EP application. */
export interface FamilyRead {
  /** The INPADOC family id, when the EPO gives one. */
  readonly familyId?: string
  /** The priority filings, earliest first, each once. The number reads `US 10374408`; it has at most 37 characters. */
  readonly priorities: readonly { readonly number: string; readonly date?: string }[]
  /** The citable publication of each family member, for example `US7722129B2`. Any office. */
  readonly publications: readonly string[]
}

/** The text of one EP publication. Each field is absent when the EPO holds no text for it. */
export interface PublicationText {
  /** The publication that was read. */
  readonly publicationNumber: EpPublicationNumber
  /** The title. */
  readonly title?: string
  /** The abstract. */
  readonly abstract?: string
  /** The claims, one blank line between two claims. */
  readonly claims?: string
}

/**
 * Why a read failed.
 * - `no-key`: the firm has no EPO OPS key, or the EPO refused the key.
 * - `unreachable`: a network fault, a server fault, a rate limit, or any other failure of the EPO.
 * - `malformed`: the answer of the library does not have the expected fields.
 */
export type PatentDataFailure = 'no-key' | 'unreachable' | 'malformed'

/** A failed patent data read. `cause` holds the original error when there is one. */
export class PatentDataError extends Error {
  /**
   * @param code - why the read failed.
   * @param message - a short English description for the log. It holds no secret.
   * @param options - the original error as `cause`.
   */
  constructor(readonly code: PatentDataFailure, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'PatentDataError'
  }
}

/** Reads EP patent data. Each method throws {@link PatentDataError} when the read fails. */
export interface PatentData {
  /**
   * Find the applicant names in the EP Register that match a company name.
   * The read searches `pa=<name>` in pages of 100 rows. A name matches when its
   * company key holds every word of the typed name's company key. Names with the
   * same company key are one name.
   * @param name - the company name as the attorney types it.
   * @param options - `maxRows`: the most register rows to read.
   * @param signal - caller cancellation.
   * @returns the matching names with their count of EP applications.
   * @throws RangeError when the name has no letter or digit, or `maxRows` is not a positive integer.
   */
  findApplicantNames(name: string, options: { readonly maxRows: number }, signal?: AbortSignal): Promise<ApplicantNames>
  /**
   * Run one EP Register search.
   * @param query - the register CQL, for example `re=Muster` or `pa="Gerhard Schubert"`.
   * @param range - the rows to read, counted from 1. The EPO allows at most 100 rows.
   * @param signal - caller cancellation.
   * @returns the page.
   * @throws RangeError when `begin` is below 1, `end` is below `begin`, or the range is over 100 rows.
   */
  searchRegister(query: string, range: { readonly begin: number; readonly end: number }, signal?: AbortSignal): Promise<RegisterPage>
  /**
   * Read the register record of one EP application.
   * @param application - the EP application number.
   * @param signal - caller cancellation.
   * @returns the record, or undefined when the register does not list the application.
   */
  registerRecord(application: EpApplicationNumber, signal?: AbortSignal): Promise<RegisterRow | undefined>
  /**
   * Read the family of one EP application through its earliest EP publication.
   * @param application - the EP application number.
   * @param signal - caller cancellation.
   * @returns the family. It is empty when the application has no EP publication or the EPO has no family for it.
   * @throws PatentDataError `malformed` when a member's office code is over 4 characters or its number over 32.
   */
  family(application: EpApplicationNumber, signal?: AbortSignal): Promise<FamilyRead>
  /**
   * Read the title, abstract and claims of one EP publication. The claims are in
   * English when the EPO has them, else in the first language it holds.
   * A Euro-PCT EP publication has no text at the EPO: its fields are absent.
   * @param publication - the EP publication number.
   * @param signal - caller cancellation.
   * @returns the text.
   */
  publication(publication: EpPublicationNumber, signal?: AbortSignal): Promise<PublicationText>
}

/** The most rows that the EPO returns for one register search. */
const MAX_PAGE_ROWS = 100

const SEPARATORS = /[\s/,.-]/g
const CHECK_DIGIT = /\.\d\s*$/
const EP_APPLICATION = /^EP\d{8}$/
const EP_PUBLICATION = /^EP\d{7}(?:[A-Z]\d?)?$/

/**
 * Normalize an EP application number as an attorney writes it.
 * A check digit after a dot is dropped.
 * @param input - for example `EP 23 171 862`, `ep23171862` or `EP23171862.1`.
 * @returns `EP` and eight digits, or undefined for any other form.
 */
export function parseEpApplication(input: string): EpApplicationNumber | undefined {
  const compact = input.toUpperCase().replace(CHECK_DIGIT, '').replace(SEPARATORS, '')
  return EP_APPLICATION.test(compact) ? brandString<EpApplicationNumber>(compact) : undefined
}

/**
 * Normalize an EP publication number as an attorney writes it.
 * @param input - for example `EP 4 292 805 A1`, `EP4292805A1` or `EP4292805`.
 * @returns `EP`, seven digits and the kind code when there is one, or undefined for any other form.
 */
export function parseEpPublication(input: string): EpPublicationNumber | undefined {
  const compact = input.toUpperCase().replace(SEPARATORS, '')
  return EP_PUBLICATION.test(compact) ? brandString<EpPublicationNumber>(compact) : undefined
}

/**
 * The company key of a name: Unicode NFKC, lower case, punctuation removed, spaces collapsed.
 * @param name - a company or applicant name.
 * @returns the key. It is empty when the name has no letter or digit.
 */
export function normalizeName(name: string): string {
  return name.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim()
}

const dateText = z.string()
  .regex(/^(?:\d{8}|\d{4}-\d{2}-\d{2})$/)
  .transform(value => value.length === 8 ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}` : value)

/**
 * A schema that reads null and a missing field as undefined.
 * @param schema - the schema of the present value.
 * @returns the optional schema.
 */
function maybe<S extends z.ZodType>(schema: S) {
  return schema.nullish().transform(value => value ?? undefined)
}

const partySchema = z.object({
  name: z.string(),
  country: maybe(z.string()),
  address: z.array(z.string()),
})

const registerPageSchema = z.object({
  total: z.number().int().nonnegative(),
  range: z.object({ begin: z.number().int(), end: z.number().int() }),
  docs: z.array(z.object({
    docId: maybe(z.string()),
    applicationNumber: z.string(),
    title: maybe(z.string()),
    applicants: z.array(z.string()),
    representatives: z.array(partySchema),
    representativesChangeDate: maybe(dateText),
    opponents: z.array(partySchema.extend({ filingDate: maybe(dateText), status: maybe(z.string()) })),
    status: maybe(z.string()),
    dates: z.object({ filing: maybe(dateText), publication: maybe(dateText) }),
  })),
})

/** The longest office code of a family member; the EPO writes two letters, such as `DE`. */
const MAX_COUNTRY_LENGTH = 4
/** The longest number of a family member; the longest that the EPO writes have about 15 characters. */
const MAX_NUMBER_LENGTH = 32

const familySchema = z.object({
  familyId: maybe(z.string()),
  members: z.array(z.object({
    refType: z.enum(['publication', 'application', 'priority']),
    country: z.string().max(MAX_COUNTRY_LENGTH),
    number: z.string().max(MAX_NUMBER_LENGTH),
    date: maybe(dateText),
  })),
  representatives: z.object({ members: z.array(z.object({ representativePublication: maybe(z.string()) })) }),
})

const biblioSchema = z.object({ title: maybe(z.string()) })
const abstractSchema = z.object({ abstract: maybe(z.string()) })
const claimsSchema = z.object({ claims: z.array(z.string()) })

/**
 * A one-key object when the value is present, else an empty one.
 * @param key - the property name.
 * @param value - the value, or undefined.
 * @returns an object to spread, so an absent value leaves no key.
 */
function present<K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> {
  return value === undefined ? {} : { [key]: value } as Partial<Record<K, V>>
}

/**
 * The trimmed text, or undefined when it is empty.
 * @param text - text that may be absent.
 * @returns the text for a field that is absent when it is empty.
 */
function nonEmpty(text: string | undefined): string | undefined {
  const trimmed = text?.trim()
  return trimmed === undefined || trimmed === '' ? undefined : trimmed
}

/**
 * Order two strings by code unit, so `YYYY-MM-DD` dates sort by day.
 * @param a - the first string.
 * @param b - the second string.
 * @returns the sign of the order.
 */
function order(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** The applications of one company key and the spellings of its name. */
interface KeyCount {
  /** The applications that name the key, each once. */
  applications: number
  /** The spelling that the register uses most; of two equally frequent spellings, the first in code unit order. */
  name: string
  /** How often the register uses `name`. */
  nameUses: number
  /** How often the register uses each spelling. */
  readonly spellings: Map<string, number>
}

/**
 * Count one use of a spelling and keep the most frequent spelling as the name of its key.
 * @param entry - the count of the key.
 * @param spelling - the name as one register row writes it.
 */
function countSpelling(entry: KeyCount, spelling: string): void {
  const uses = (entry.spellings.get(spelling) ?? 0) + 1
  entry.spellings.set(spelling, uses)
  if (uses > entry.nameUses || (uses === entry.nameUses && order(spelling, entry.name) < 0)) {
    entry.name = spelling
    entry.nameUses = uses
  }
}

/**
 * Check a library answer against its schema.
 * @param schema - the fields that this module uses.
 * @param data - the answer of the library.
 * @param what - the read, for the message.
 * @returns the parsed fields.
 * @throws PatentDataError `malformed` when a field is wrong. The message names the paths, never the values.
 */
function parseAnswer<S extends z.ZodType>(schema: S, data: unknown, what: string): z.output<S> {
  const parsed = schema.safeParse(data)
  if (parsed.success) return parsed.data
  const paths = parsed.error.issues.map(issue => issue.path.join('.') || '(root)').join(', ')
  throw new PatentDataError('malformed', `EPO OPS ${what}: wrong fields at ${paths}`, { cause: parsed.error })
}

/**
 * The error that stands for a failed library read.
 * @param what - the read, for the message.
 * @param failure - the failure of the library.
 * @returns `no-key` for a missing or refused key, else `unreachable`.
 */
function failureOf(what: string, failure: ProviderReadFailure): PatentDataError {
  const { code, message } = failure.body.error
  const noKey = code === ErrorCodes.data_keys_required || code === ErrorCodes.patent_provider_key_invalid
  return new PatentDataError(noKey ? 'no-key' : 'unreachable', `EPO OPS ${what}: ${message}`, { cause: failure.cause ?? failure.body })
}

/**
 * Unwrap a library result.
 * @param what - the read, for the message.
 * @param result - the result of the library.
 * @param absentOn404 - whether a 404 means "the EPO holds nothing" instead of a failure.
 * @returns the data, or undefined for an accepted 404.
 * @throws PatentDataError for any other failure.
 */
function unwrap<T>(what: string, result: ProviderReadResult<T>, absentOn404: boolean): T | undefined {
  if (result.ok) return result.data
  if (absentOn404 && result.status === 404) return undefined
  throw failureOf(what, result)
}

/**
 * Map a party of the register.
 * @param party - the checked party.
 * @returns the party without an absent country.
 */
function partyOf(party: z.output<typeof partySchema>): RegisterParty {
  return { name: party.name, ...present('country', party.country), address: party.address }
}

/**
 * Map one checked register document to a row.
 * @param doc - a checked document of a search page.
 * @returns the row.
 * @throws PatentDataError `malformed` when a number is not an EP number.
 */
function rowOf(doc: z.output<typeof registerPageSchema>['docs'][number]): RegisterRow {
  const applicationNumber = parseEpApplication(doc.applicationNumber)
  if (applicationNumber === undefined) {
    throw new PatentDataError('malformed', `EPO OPS register: "${doc.applicationNumber}" is not an EP application number`)
  }
  const publicationNumber = doc.docId === undefined ? undefined : parseEpPublication(doc.docId)
  if (doc.docId !== undefined && publicationNumber === undefined) {
    throw new PatentDataError('malformed', `EPO OPS register: "${doc.docId}" is not an EP publication number`)
  }
  return {
    applicationNumber,
    ...present('publicationNumber', publicationNumber),
    ...present('title', doc.title),
    applicants: doc.applicants,
    representatives: doc.representatives.map(partyOf),
    ...present('representativeSince', doc.representativesChangeDate),
    opponents: doc.opponents.map(opponent => ({
      ...partyOf(opponent),
      ...present('filedOn', opponent.filingDate),
      ...present('status', opponent.status),
    })),
    ...present('status', doc.status),
    ...present('filed', doc.dates.filing),
    ...present('published', doc.dates.publication),
  }
}

/**
 * The CQL value of a company name: quoted unless it is only letters and digits.
 * @param name - the typed name.
 * @returns the value after `pa=`.
 */
function cqlValue(name: string): string {
  const plain = name.replace(/"/g, ' ').replace(/\s+/g, ' ').trim()
  return /[^\p{L}\p{N}]/u.test(plain) ? `"${plain}"` : plain
}

/** The library clients that this service calls. A `Connectors` instance satisfies it. */
export interface PatentDataConnectors {
  /** The host, for the check that the firm stored an EPO OPS key. */
  readonly host: Pick<ConnectorHost, 'credentials'>
  /** The EPO OPS client. */
  readonly ops: Pick<Connectors['ops'], 'searchRegister' | 'getFamily' | 'getBiblio' | 'getAbstract' | 'getClaims'>
}

/** Options of the provider. */
export interface FlowleapPatentDataOptions {
  /** The shared library instance. */
  connectors: PatentDataConnectors
  /** The host's signal carrier. */
  bound: BoundConnectorHost
}

/** Provider of `ctx.flowleapPatentData` over the EPO OPS client. */
export class FlowleapPatentData extends Service implements PatentData {
  private readonly connectors: PatentDataConnectors
  private readonly bound: BoundConnectorHost

  /**
   * @param ctx - Host context.
   * @param options - the library instance and its signal carrier.
   */
  constructor(ctx: Context, options: FlowleapPatentDataOptions) {
    super(ctx, 'flowleapPatentData')
    this.connectors = options.connectors
    this.bound = options.bound
  }

  async findApplicantNames(name: string, options: { readonly maxRows: number }, signal?: AbortSignal): Promise<ApplicantNames> {
    const { maxRows } = options
    if (!Number.isInteger(maxRows) || maxRows < 1) throw new RangeError(`maxRows must be a positive integer, got ${String(maxRows)}`)
    const words = normalizeName(name).split(' ')
    if (words[0] === '') throw new RangeError('The company name needs a letter or a digit')
    const query = `pa=${cqlValue(name)}`
    // One entry for each company key, so case and punctuation variants of a name are one name.
    const keys = new Map<string, KeyCount>()
    const seen = new Set<EpApplicationNumber>()
    let read = 0
    let total = Infinity
    let rows = 1
    while (rows > 0 && read < Math.min(total, maxRows)) {
      const page = await this.searchRegister(query, { begin: read + 1, end: read + Math.min(MAX_PAGE_ROWS, maxRows - read) }, signal)
      total = page.total
      rows = page.rows.length
      read += rows
      for (const row of page.rows) {
        if (seen.has(row.applicationNumber)) continue
        seen.add(row.applicationNumber)
        const counted = new Set<string>()
        for (const applicant of row.applicants) {
          const key = normalizeName(applicant)
          const keyWords = new Set(key.split(' '))
          if (!words.every(word => keyWords.has(word))) continue
          const entry = keys.get(key) ?? { applications: 0, name: applicant, nameUses: 0, spellings: new Map<string, number>() }
          keys.set(key, entry)
          countSpelling(entry, applicant)
          if (!counted.has(key)) entry.applications += 1
          counted.add(key)
        }
      }
    }
    const names = [...keys.values()].map(entry => ({ name: entry.name, applications: entry.applications }))
      .sort((a, b) => b.applications - a.applications || order(a.name, b.name))
    return { source: 'ep-register', names, truncated: read < total }
  }

  async searchRegister(
    query: string,
    range: { readonly begin: number; readonly end: number },
    signal?: AbortSignal,
  ): Promise<RegisterPage> {
    const { begin, end } = range
    if (!Number.isInteger(begin) || !Number.isInteger(end) || begin < 1 || end < begin || end - begin + 1 > MAX_PAGE_ROWS) {
      throw new RangeError(`The register range ${String(begin)}-${String(end)} must hold 1 to ${String(MAX_PAGE_ROWS)} rows and start at 1 or later`)
    }
    const result = await this.read(signal, () => this.connectors.ops.searchRegister(query, `${String(begin)}-${String(end)}`))
    const page = parseAnswer(registerPageSchema, unwrap('register search', result, false), 'register search')
    return { total: page.total, begin, end: page.range.end, rows: page.docs.map(rowOf) }
  }

  async registerRecord(application: EpApplicationNumber, signal?: AbortSignal): Promise<RegisterRow | undefined> {
    const page = await this.searchRegister(`ap=${application}`, { begin: 1, end: 1 }, signal)
    return page.rows.find(row => row.applicationNumber === application)
  }

  async family(application: EpApplicationNumber, signal?: AbortSignal): Promise<FamilyRead> {
    const publication = (await this.registerRecord(application, signal))?.publicationNumber
    if (publication === undefined) return { priorities: [], publications: [] }
    const result = await this.read(signal, () => this.connectors.ops.getFamily(publication))
    const answer = unwrap('family', result, true)
    if (answer === undefined) return { priorities: [], publications: [] }
    const family = parseAnswer(familySchema, answer, 'family')
    const priorities = family.members.filter(member => member.refType === 'priority')
      .map(member => ({ number: `${member.country} ${member.number}`, ...present('date', member.date) }))
      .sort((a, b) => order(a.date ?? '9999-99-99', b.date ?? '9999-99-99') || order(a.number, b.number))
    return {
      ...present('familyId', family.familyId),
      priorities: [...new Map(priorities.map(priority => [priority.number, priority])).values()],
      publications: [...new Set(family.representatives.members.flatMap(member => member.representativePublication ?? []))],
    }
  }

  async publication(publication: EpPublicationNumber, signal?: AbortSignal): Promise<PublicationText> {
    const [biblio, abstract, claims] = await Promise.all([
      this.read(signal, () => this.connectors.ops.getBiblio(publication)),
      this.read(signal, () => this.connectors.ops.getAbstract(publication)),
      this.read(signal, () => this.connectors.ops.getClaims(publication, 'en')),
    ])
    const biblioAnswer = unwrap('bibliography', biblio, true)
    const abstractAnswer = unwrap('abstract', abstract, true)
    const claimsAnswer = unwrap('claims', claims, true)
    const title = biblioAnswer === undefined ? undefined : parseAnswer(biblioSchema, biblioAnswer, 'bibliography').title
    const abstractText = abstractAnswer === undefined ? undefined : parseAnswer(abstractSchema, abstractAnswer, 'abstract').abstract
    const claimsText = claimsAnswer === undefined ? undefined : parseAnswer(claimsSchema, claimsAnswer, 'claims').claims.join('\n\n')
    return {
      publicationNumber: publication,
      ...present('title', nonEmpty(title)),
      ...present('abstract', nonEmpty(abstractText)),
      ...present('claims', nonEmpty(claimsText)),
    }
  }

  /**
   * Run one library read under the caller signal.
   * @param signal - caller cancellation.
   * @param work - the library call.
   * @returns the result of the library.
   * @throws PatentDataError `no-key` when no EPO OPS key is stored or the library reports a key error.
   * @throws PatentDataError `unreachable` for any other thrown error.
   * @throws the original error when the caller cancelled.
   */
  private read<T>(signal: AbortSignal | undefined, work: () => Promise<ProviderReadResult<T>>): Promise<ProviderReadResult<T>> {
    return this.bound.withSignal(signal, async () => {
      // Without a stored key the library fails late with a plain error and a retry delay.
      if ((await this.connectors.host.credentials('epoOps')).status !== 'available') {
        throw new PatentDataError('no-key', 'EPO OPS: no key is stored for the firm')
      }
      try {
        return await work()
      } catch (error) {
        if (signal?.aborted === true) throw error
        const noKey = error instanceof DataKeysRequiredError || error instanceof ProviderKeyInvalidError
        throw new PatentDataError(noKey ? 'no-key' : 'unreachable', `EPO OPS: ${error instanceof Error ? error.message : 'the read failed'}`, { cause: error })
      }
    })
  }
}
