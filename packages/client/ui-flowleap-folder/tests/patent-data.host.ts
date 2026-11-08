import {
  PatentDataError, parseEpApplication, parseEpPublication, type EpApplicationNumber, type EpPublicationNumber, type FamilyRead,
  type PatentData, type PublicationText, type RegisterRow,
} from '@deepseek-ai/dsh-flowleap-connectors'
import { companyKey } from '../src/add-client/identity.ts'

/** An EP application number for a test. */
export function app(number: string): EpApplicationNumber {
  const parsed = parseEpApplication(number)
  if (parsed === undefined) throw new Error(`not an application: ${number}`)
  return parsed
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

  async searchRegister(query: string, range: { readonly begin: number; readonly end: number }) {
    this.check(query)
    this.queries.push(`${query}|${range.begin}-${range.end}`)
    const terms = [...query.matchAll(/(pa|op)="([^"]*)"/gu)].map(match => ({ index: match[1], key: companyKey(match[2] ?? '') }))
    const hits = this.rows.filter(item => terms.some(({ index, key }) => (index === 'pa' ? item.applicants : item.opponents.map(party => party.name))
      .some(name => companyKey(name).includes(key))))
    const rows = hits.slice(range.begin - 1, range.end)
    return { total: hits.length, begin: range.begin, end: Math.min(range.end, hits.length), rows }
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
