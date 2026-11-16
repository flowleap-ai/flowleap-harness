/**
 * The firm's copy of MyEPO in the Firm Record, for the MyEPO pages (Letters and Applications) of a firm installation:
 * one pass reads the Mailbox and the applications as the pages show them (`myepo-views.ts`) and sends them to the intake of
 * the Firm Record, which replaces its copy and gives it only to a person who has the MyEPO pages. The copy is a second
 * use of the reads of the firm worker (`myepo-worker.ts`): only that process holds the firm's MyEPO pair. The pass only
 * reads MyEPO and downloads no letter.
 * @module
 */

import { z } from 'zod'
import { MyEpoError, type MyEpoFailure, type MyEpoReads } from './myepo-client.ts'
import { createRecordIntakeCall, WAIT_STATUSES, type RecordIntakeRequest } from './myepo-reader.ts'
import {
  letterView, readApplicationDetail, readApplicationList, readMailbox, readTermDescriptions, type MyEpoApplicationDetail,
} from './myepo-views.ts'
import type { MyEpoApplicationView, MyEpoFolderView, MyEpoLetterView } from './types.ts'

/** One application of the copy, as its path names it. */
export interface MyEpoApplicationKey {
  readonly procedure: 'EPC' | 'UPP'
  readonly number: string
}

/** The Mailbox copy: the body of `PUT intake/myepo-mirror/mailbox`. */
export interface MyEpoMailboxCopy {
  /** When the read of MyEPO ended, ISO time. */
  readonly readAt: string
  /** How many letters the Mailbox holds; more than `letters.length` when the list was cut. */
  readonly total: number
  readonly folders: readonly MyEpoFolderView[]
  readonly letters: readonly MyEpoLetterView[]
}

/** The applications copy: the body of `PUT intake/myepo-mirror/applications`. */
export interface MyEpoApplicationsCopy {
  /** When the read of MyEPO ended, ISO time. */
  readonly readAt: string
  /** How many applications the list holds; more than `applications.length` when the list was cut. */
  readonly total: number
  readonly applications: readonly MyEpoApplicationView[]
}

/** The MyEPO copy paths of the Firm Record's intake, as the pass uses them. */
export interface MyEpoMirror {
  /**
   * Replace the Mailbox copy (`PUT intake/myepo-mirror/mailbox`).
   * @param copy - the folders and the letters of one read.
   */
  mailbox(copy: MyEpoMailboxCopy): Promise<void>
  /**
   * Replace the list of applications (`PUT intake/myepo-mirror/applications`). The record keeps the stored data of an
   * application that is still in the list.
   * @param copy - the applications of one read.
   * @returns the applications whose data the record does not have or has had for the longest time, at most 20.
   */
  applications(copy: MyEpoApplicationsCopy): Promise<readonly MyEpoApplicationKey[]>
  /**
   * Store the data of one application of the list (`PUT intake/myepo-mirror/applications/<procedure>/<number>`).
   * @param application - the application.
   * @param readAt - when the read of MyEPO ended, ISO time.
   * @param detail - the data, or `null` when MyEPO gave none at this read.
   */
  detail(application: MyEpoApplicationKey, readAt: string, detail: MyEpoApplicationDetail | null): Promise<void>
}

const mailboxAnswerSchema = z.object({ letters: z.number() })
const applicationsAnswerSchema = z.object({
  stale: z.array(z.object({ procedure: z.enum(['EPC', 'UPP']), number: z.string().regex(/^EP\d{8}$/u) })),
})
const detailAnswerSchema = z.object({ stored: z.literal(true) })

/**
 * Create the client of the Firm Record's MyEPO copy paths, with the intake token.
 * @param options - `url`, the API base (for example `http://record:8091/records/api/`); `token`, the intake token; `fetch`.
 * @returns the client; each call rejects with a `MyEpoIntakeError` when the record does not take the copy.
 */
export function createMyEpoMirror(options: { readonly url: string; readonly token: string; readonly fetch: typeof fetch }): MyEpoMirror {
  const call = createRecordIntakeCall(options)
  const put = (body: object): RecordIntakeRequest => ({ method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return {
    mailbox: async (copy) => {
      await call('intake/myepo-mirror/mailbox', put(copy), mailboxAnswerSchema)
    },
    applications: async copy => (await call('intake/myepo-mirror/applications', put(copy), applicationsAnswerSchema)).stale,
    detail: async ({ procedure, number }, readAt, detail) => {
      await call(`intake/myepo-mirror/applications/${procedure}/${encodeURIComponent(number)}`, put({ readAt, detail }), detailAnswerSchema)
    },
  }
}

/** What one copy pass did. */
export interface MyEpoCopyPass {
  /** The letters of the Mailbox copy. */
  readonly letters: number
  /** The applications of the list copy. */
  readonly applications: number
  /** The applications whose data the pass read and stored. */
  readonly details: number
  /** The applications for which MyEPO gave no data, each with why; the record keeps them without data. */
  readonly noDetail: readonly { readonly application: MyEpoApplicationKey; readonly reason: string }[]
}

/**
 * One copy of MyEPO into the Firm Record: the Mailbox, then the list of applications, then the data of the applications
 * that the record names as the oldest. An account with no portfolio permission has no application, and the pass sends an
 * empty list. An application whose data MyEPO does not give for a cause of that application (`no-permission`, `invalid-response`,
 * or `rejected` with a status other than `408`, `425` or `429`) is stored without data, so that the record asks for the others first. Each
 * other MyEPO failure and each `MyEpoIntakeError` of the record stops the pass; the next pass sends all again.
 * @param options - `reads`, the MyEPO client with its request gate; `mirror`, the Firm Record; `now`, the clock (epoch ms).
 * @returns what the pass did.
 */
export async function copyMyEpoToRecord(options: {
  readonly reads: Pick<MyEpoReads, 'folders' | 'communications' | 'applications' | 'bibliographicData' | 'dueDates' | 'pendingFees' | 'terms'>
  readonly mirror: MyEpoMirror
  readonly now: () => number
  readonly signal?: AbortSignal
}): Promise<MyEpoCopyPass> {
  const { reads, mirror, now, signal } = options
  const iso = (): string => new Date(now()).toISOString()
  const mailbox = await readMailbox(reads, signal)
  await mirror.mailbox({ readAt: iso(), total: mailbox.total, folders: mailbox.folders, letters: mailbox.letters.map(letterView) })
  const list = await readApplicationList(reads, signal).catch((error: unknown) => {
    if (error instanceof MyEpoError && error.failure.kind === 'no-permission') return { applications: [], total: 0 }
    throw error
  })
  const stale = await mirror.applications({ readAt: iso(), total: list.total, applications: list.applications })
  let details = 0
  const noDetail: { application: MyEpoApplicationKey; reason: string }[] = []
  if (stale.length === 0) return { letters: mailbox.letters.length, applications: list.applications.length, details, noDetail }
  const terms = readTermDescriptions(reads, signal)
  await terms
  for (const application of stale) {
    let detail: MyEpoApplicationDetail | null = null
    try {
      detail = await readApplicationDetail(reads, application, terms, signal)
      details++
    } catch (error) {
      if (!(error instanceof MyEpoError) || !ofOneApplication(error.failure)) throw error
      noDetail.push({ application, reason: error.message })
    }
    await mirror.detail(application, iso(), detail)
  }
  return { letters: mailbox.letters.length, applications: list.applications.length, details, noDetail }
}

/** The MyEPO failures that are a property of one application; each other kind is of the link or of the network. */
const OF_ONE_APPLICATION: ReadonlySet<MyEpoFailure['kind']> = new Set(['no-permission', 'invalid-response', 'unreadable-download'])

/** Whether a MyEPO failure is a property of one application, and not of the link, of the network or of a wait. */
function ofOneApplication(failure: MyEpoFailure): boolean {
  return failure.kind === 'rejected' ? !WAIT_STATUSES.has(failure.status) : OF_ONE_APPLICATION.has(failure.kind)
}
