import {
  PatentDataError, normalizeName, parseEpApplication, parseEpPublication, type EpApplicationNumber, type EpPublicationNumber,
  type FamilyRead,
  type PatentData, type PublicationText, type RegisterParty, type RegisterRow, type WoPublicationNumber,
} from '@deepseek-ai/dsh-flowleap-connectors'
import { brandString } from '@deepseek-ai/dsh-brand'
import { companyKey } from '../src/add-client/identity.ts'

/** An EP application number for a test. */
export function app(number: string): EpApplicationNumber {
  const parsed = parseEpApplication(number)
  if (parsed === undefined) throw new Error(`not an application: ${number}`)
  return parsed
}

/** A WO publication number for a test. */
export function wo(number: string): WoPublicationNumber {
  return brandString<WoPublicationNumber>(number)
}

/** An EP publication number for a test. */
export function pub(number: string): EpPublicationNumber {
  const parsed = parseEpPublication(number)
  if (parsed === undefined) throw new Error(`not a publication: ${number}`)
  return parsed
}

/** A register row with the fields a test names. */
export function row(fields: Partial<Omit<RegisterRow, 'applicationNumber'>> & { readonly applicationNumber: string }): RegisterRow {
  return { applicants: [], representatives: [], opponents: [], ...fields, applicationNumber: app(fields.applicationNumber) }
}

const wordsOfParty = new WeakMap<RegisterParty, Set<string>>()

/** The words of a representative's name and address lines, which `re=` searches. */
function partyWords(party: RegisterParty): Set<string> {
  let words = wordsOfParty.get(party)
  if (words === undefined) {
    words = new Set(normalizeName([party.name, ...party.address].join(' ')).split(' '))
    wordsOfParty.set(party, words)
  }
  return words
}

/** Whether a row is in the publication dates of a query: `pd within "2025"`, `pd within "202503"` or `pd>=… and pd<=…`. */
function published(query: string, item: RegisterRow): boolean {
  const day = item.published?.replaceAll('-', '')
  const within = /pd within "(\d+)"/u.exec(query)?.[1]
  if (within !== undefined) return day?.startsWith(within) === true
  const from = /pd>=(\d{8})/u.exec(query)?.[1]
  const to = /pd<=(\d{8})/u.exec(query)?.[1]
  if (from === undefined || to === undefined) return true
  return day !== undefined && day >= from && day <= to
}

/** A patent data Service over a list of register rows, which records the queries that left the firm. */
export class FakePatentData implements PatentData {
  readonly queries: string[] = []
  readonly families = new Map<string, FamilyRead>()
  readonly texts = new Map<string, PublicationText>()
  readonly failing = new Set<string>()

  constructor(public rows: RegisterRow[]) {}

  async findApplicantNames(name: string, options: { readonly maxRows: number }): Promise<{ source: 'ep-register'; names: { name: string; applications: number }[]; truncated: boolean }> {
    this.check(`find:${name}`)
    this.queries.push(`find:${name}:${options.maxRows}`)
    return { source: 'ep-register', names: [{ name, applications: this.rows.length }], truncated: false }
  }

  async searchRegister(query: string, range: { readonly begin: number; readonly end: number }, _signal?: AbortSignal) {
    this.check(query)
    this.queries.push(`${query}|${range.begin}-${range.end}`)
    // The EPO reads no row after 2,000 of one query (measured on 2026-11-09).
    if (range.end > 2000) throw new PatentDataError('unreachable', 'CLIENT.InvalidQuery')
    const representative = /^re="([^"]*)"/u.exec(query)?.[1]
    const found = representative === undefined ? this.byParty(query) : this.byRepresentative(representative)
    const hits = found.filter(item => published(query, item))
    const rows = hits.slice(range.begin - 1, range.end)
    // The EPO stops counting at 10,000.
    return { total: Math.min(hits.length, 10_000), begin: range.begin, end: Math.min(range.end, hits.length), rows }
  }

  private byParty(query: string): RegisterRow[] {
    const terms = [...query.matchAll(/(pa|op)="([^"]*)"/gu)].map(match => ({ index: match[1], key: companyKey(match[2] ?? '') }))
    return this.rows.filter(item => terms.some(({ index, key }) => (index === 'pa' ? item.applicants : item.opponents.map(party => party.name))
      .some(name => companyKey(name).includes(key))))
  }

  /** `re=` finds the words of the term anywhere in a representative's name and address lines. */
  private byRepresentative(term: string): RegisterRow[] {
    const words = normalizeName(term).split(' ')
    return this.rows.filter(item => item.representatives.some(party => words.every(word => partyWords(party).has(word))))
  }

  async registerRecord(application: EpApplicationNumber): Promise<RegisterRow | undefined> {
    this.check(`record:${application}`)
    return this.rows.find(item => item.applicationNumber === application)
  }

  async family(application: EpApplicationNumber): Promise<FamilyRead> {
    this.check(`family:${application}`)
    return this.families.get(application) ?? { priorities: [], publications: [] }
  }

  async publication(publication: EpPublicationNumber): Promise<PublicationText> {
    this.check(`publication:${publication}`)
    return this.texts.get(publication) ?? { publicationNumber: publication }
  }

  private check(what: string): void {
    if (this.failing.has(what)) throw new PatentDataError('unreachable', `no answer for ${what}`)
  }
}
