/**
 * The data set of the recorded sandbox answers (`../fixtures/myepo/`): the EPO's dummy data, for the specs of the MyEPO
 * client and link. The download ZIP holds a small PDF named as the sandbox named its one download.
 * @module
 */

import { readFileSync } from 'node:fs'
import { strToU8 } from 'fflate'
import type { MyEpoDoubleData, WireApplication, WireCommunication, WirePortfolio } from './double.ts'

/** One recorded answer: the status, the content type and the body. */
export interface Recorded {
  readonly status: number
  readonly body: unknown
  readonly contentType?: string | null
}

/**
 * Read one recorded answer.
 * @param name - the file name in `fixtures/myepo/` without `.json`.
 * @returns the recorded answer.
 */
export function recorded(name: string): Recorded {
  return JSON.parse(readFileSync(new URL(`../fixtures/myepo/${name}.json`, import.meta.url), 'utf8')) as Recorded
}

function content<T>(name: string): T[] {
  return (recorded(name).body as { content: T[] }).content
}

/** The sandbox's one recorded download name (`P79105WO1-2023.05.30-SE2023123456-I1015.pdf`). */
export const SANDBOX_PDF_NAME = 'P79105WO1-2023.05.30-SE2023123456-I1015.pdf'

/**
 * The recorded sandbox data set.
 * @returns the data set; every letter downloads as a one-PDF ZIP of {@link SANDBOX_PDF_NAME}.
 */
export function sandboxData(): MyEpoDoubleData {
  return {
    label: 'the EPO sandbox answers of 2026-11-09 (dummy data)',
    portfolios: content<WirePortfolio>('portfolios'),
    applications: content<WireApplication>('applications'),
    restricted: [],
    biblio: { 'EPC/EP00000001': recorded('biblio-EPC-EP00000001').body },
    dueDates: { 'EPC/EP00000001': recorded('due-dates-EPC-EP00000001').body },
    fees: { 'EPC/EP00000001': recorded('fees-EPC-EP00000001').body },
    terms: recorded('terms').body,
    folders: recorded('folders').body,
    letters: content<WireCommunication>('communications').map(communication => ({
      communication, filename: SANDBOX_PDF_NAME, pdf: () => strToU8('%PDF-1.4 dummy'),
    })),
    arrivals: [],
  }
}
