/**
 * The applicant names of a client group against the firm docket and the EP Register counts: the names that the find
 * step of Add client gives with their counts, the group's matters in the firm docket, and the count of the group's EP
 * applications at other firms. The firm docket is matched here; only the group's names go to the EP Register.
 * @module
 */

import { normalizeName, type PatentData } from '@deepseek-ai/dsh-flowleap-connectors'
import { NAMES_PER_QUERY, queries } from './conflict-check.ts'
import type { DocketRow } from './docket-model.ts'
import { companyKey } from './identity.ts'
import { REGISTER_COUNT_CAP, type ApplicantName, type DocketMatter, type NameCount } from './wire.ts'

/** The `pa=` term of an applicant name: the name in double quotes, without the double quotes of the name. */
function applicantTerm(name: string): string {
  return `pa="${name.replaceAll('"', '')}"`
}

/** The `total` of one register count query, at most {@link REGISTER_COUNT_CAP}. */
async function countOf(data: PatentData, query: string, signal?: AbortSignal): Promise<number> {
  const page = await data.searchRegister(query, { begin: 1, end: 1 }, signal)
  return Math.min(page.total, REGISTER_COUNT_CAP)
}

/**
 * The applicant names that hold every word of a company name, by the word rule of `findApplicantNames`: the names of
 * the register sample in their order, then the applicant names of the firm docket rows. Each company key comes once,
 * with its first name.
 * @param name - the company name as the person typed it.
 * @param sample - the names of the register sample.
 * @param rows - the rows of the firm docket; none while the docket cannot be used.
 * @returns the names.
 */
export function matchingNames(name: string, sample: readonly string[], rows: readonly DocketRow[]): string[] {
  const words = normalizeName(name).split(' ')
  const holdsWords = (applicant: string): boolean => {
    const own = new Set(normalizeName(applicant).split(' '))
    return words.every(word => own.has(word))
  }
  const keys = new Set<string>()
  const names: string[] = []
  for (const candidate of [...sample, ...rows.flatMap(row => row.applicants).filter(holdsWords)]) {
    const key = companyKey(candidate)
    if (keys.has(key)) continue
    keys.add(key)
    names.push(candidate)
  }
  return names
}

/**
 * Count the EP applications of each name with one register count query `pa="<name>"`.
 * @param data - the patent data Service.
 * @param names - the names.
 * @param signal - stops the reads.
 * @returns the names with their counts, most matching applications first, then by name.
 */
export async function countNames(data: PatentData, names: readonly string[], signal?: AbortSignal): Promise<ApplicantName[]> {
  const counted = await Promise.all(names.map(async name => ({ name, matching: await countOf(data, applicantTerm(name), signal) })))
  return counted.sort((a, b) => b.matching - a.matching || a.name.localeCompare(b.name, 'en'))
}

/** The firm's matters of a group of names. */
export interface FirmMatters {
  /** One count for each name, in the order of the names. */
  readonly counts: readonly NameCount[]
  /** The docket rows with an applicant of the names, each once, in the order of the docket. */
  readonly rows: readonly DocketMatter[]
}

/**
 * The firm docket rows of a group of names: a row is in when an applicant has the company key of a name.
 * @param names - the applicant names of the group.
 * @param rows - the rows of the firm docket; undefined while the docket cannot be used, which gives no row and counts
 *   of 0.
 * @returns the counts of each name without the rows matched by address only, and the rows.
 */
export function firmMatters(names: readonly string[], rows: readonly DocketRow[] | undefined): FirmMatters {
  const keyed = names.map(name => ({ name, key: companyKey(name) }))
  const matters: DocketMatter[] = []
  for (const row of rows ?? []) {
    const applicants = new Set(row.applicants.map(companyKey))
    const own = keyed.filter(({ key }) => key !== '' && applicants.has(key)).map(({ name }) => name)
    if (own.length === 0) continue
    const { match, ...fields } = row
    matters.push({ ...fields, addressOnly: match === 'address', names: own })
  }
  const counts = names.map(name => ({ name, atFirm: matters.filter(matter => !matter.addressOnly && matter.names.includes(name)).length }))
  return { counts, rows: matters }
}

/** The count of a group's EP applications at other firms. */
export interface OthersCount {
  /** The sum of the count queries less the firm's rows; never below 0. */
  readonly count: number
  /** Whether a count query stopped at {@link REGISTER_COUNT_CAP}. */
  readonly capped: boolean
  /** True with more than {@link NAMES_PER_QUERY} names: two queries can count one application twice. */
  readonly atLeast: boolean
}

/**
 * Count the group's EP applications at other firms: one count query for each {@link NAMES_PER_QUERY} names, less the
 * firm's docket rows of the names.
 * @param data - the patent data Service.
 * @param names - the applicant names of the group.
 * @param atFirm - the firm's docket rows of the names, without the rows matched by address only.
 * @param signal - stops the reads.
 * @returns the count.
 */
export async function othersCount(data: PatentData, names: readonly string[], atFirm: number, signal?: AbortSignal): Promise<OthersCount> {
  const totals = await Promise.all(queries(names.map(applicantTerm)).map(query => countOf(data, query, signal)))
  const sum = totals.reduce((total, value) => total + value, 0)
  return {
    count: Math.max(0, sum - atFirm), capped: totals.some(total => total >= REGISTER_COUNT_CAP), atLeast: names.length > NAMES_PER_QUERY,
  }
}
