/**
 * The firm's MyEPO letter reader (process atlas sheet 1, section 8, and sheet 6): one pass reads the unhandled letters of the
 * firm's MyEPO Mailbox, downloads each letter that the Firm Record does not have, and sends it with its list data to the
 * intake of the Firm Record (`POST intake/myepo-letters`), which files it by its application number or gives it to a person.
 * The reader only reads MyEPO, names no matter, team or person, and sends each letter as one insert-only observation. It runs in
 * a firm process, never in a person's runtime (ADR 0003): in this version the development-only launcher
 * `tests/myepo-reader/bin.ts`, and after migration step 6 the firm worker profile.
 * @module
 */

import { createHash } from 'node:crypto'
import { z } from 'zod'
import { MyEpoError, type MyEpoReads } from './myepo-client.ts'
import type { MyEpoCommunication, MyEpoCommunicationId } from './myepo-wire.ts'

/**
 * When the reader downloads a letter (atlas sheet 1, section 8, setting `myepo.download`). Only `on-arrival` is built: the
 * Firm Record stores a letter with its bytes. A download marks the letter as read in the firm's MyEPO.
 */
export type MyEpoDownloadMode = 'on-arrival'

/** Why a PDF is not sent: the HTTP status of the record's refusal (0 for a download failure) and its code. */
export interface MyEpoRefusal {
  readonly status: number
  readonly code: string | null
}

/** The body of `POST intake/myepo-letters`: the list data of one letter, its PDF and its download. */
export interface MyEpoLetterDelivery {
  readonly communication: {
    readonly id: MyEpoCommunicationId
    readonly applicationNumber: string | null
    readonly userReference: string | null
    readonly documentCode: string
    readonly title: string
    readonly dispatchDate: string
    /** When the reader read the list that showed the letter, ISO time. */
    readonly listedAt: string
  }
  /** The PDF; null when the record refused it or the download gave no PDF: the record then keeps the list data only. */
  readonly document: { readonly fileName: string; readonly mediaType: 'application/pdf'; readonly sha256: string; readonly contentBase64: string } | null
  /** `refused`: why the PDF is not sent, the record's earlier answer to it or the download's failure. */
  readonly download: { readonly at: string; readonly cause: MyEpoDownloadMode; readonly refused?: MyEpoRefusal }
}

/** What the Firm Record answered for one delivered letter: its intake state, the matter it is filed on, or why a person files it. */
export interface MyEpoDeliveryAnswer {
  readonly state: string
  readonly matter: string | null
  readonly reason: string | null
}

/**
 * Why the Firm Record did not take a letter. `refused`: a 4xx answer other than a wait; the reader logs it and goes on with
 * the next letter. `unavailable`: no answer, a server error, a wait (408, 425, 429) or an answer FlowLeap cannot read (code
 * `invalid-answer`); the outcome is not known, so the pass stops and the next pass tries again.
 */
export class MyEpoIntakeError extends Error {
  /**
   * @param kind - `refused` or `unavailable`.
   * @param status - the HTTP status, 0 for no answer.
   * @param code - the `error` of the Firm Record's JSON answer, when it has one.
   * @param options - the network error of a call with no answer.
   */
  constructor(readonly kind: 'refused' | 'unavailable', readonly status: number, readonly code: string | null, options?: ErrorOptions) {
    super(`the Firm Record ${kind === 'refused' ? 'refused' : 'did not take'} the letter: ${status}${code === null ? '' : ` ${code}`}`, options)
    this.name = 'MyEpoIntakeError'
  }
}

/** The intake of the Firm Record, as the reader uses it. */
export interface MyEpoLetterIntake {
  /**
   * Ask whether the Firm Record has the letter (`GET intake/myepo-letters/<id>`).
   * @param id - the EPO communication id.
   * @returns true when the record has it.
   */
  known(id: MyEpoCommunicationId): Promise<boolean>
  /**
   * Send one letter (`POST intake/myepo-letters`). The record keys it by its communication id, so a second send adds nothing.
   * @param letter - the list data, the PDF and the download.
   * @returns the record's answer.
   */
  deliver(letter: MyEpoLetterDelivery): Promise<MyEpoDeliveryAnswer>
}

const WAIT_STATUSES = new Set([408, 425, 429])
const recordErrorSchema = z.object({ error: z.string() })
const knownSchema = z.object({ known: z.boolean() })
const deliveryAnswerSchema = z.object({ state: z.string(), matter: z.string().nullable(), reason: z.string().nullable() })

/**
 * Create the client of the Firm Record's intake paths, with the intake token.
 * @param options - `url`, the API base (for example `http://record:8091/records/api/`); `token`, the intake token; `fetch`.
 * @returns the intake.
 */
export function createMyEpoLetterIntake(
  options: { readonly url: string; readonly token: string; readonly fetch: typeof fetch },
): MyEpoLetterIntake {
  const base = options.url.replace(/\/?$/, '/')
  const auth = { authorization: `Bearer ${options.token}` }
  const call = async <T>(path: string, init: RequestInit, schema: z.ZodType<T>): Promise<T> => {
    let response: Response
    try {
      response = await options.fetch(new URL(path, base), init)
    } catch (error) {
      throw new MyEpoIntakeError('unavailable', 0, null, { cause: error })
    }
    // A body that is not JSON (a proxy's error page) carries no record code; the status alone classifies the answer.
    const body: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      const kind = response.status >= 500 || WAIT_STATUSES.has(response.status) ? 'unavailable' : 'refused'
      throw new MyEpoIntakeError(kind, response.status, recordErrorSchema.safeParse(body).data?.error ?? null)
    }
    const parsed = schema.safeParse(body)
    if (!parsed.success) throw new MyEpoIntakeError('unavailable', response.status, 'invalid-answer', { cause: parsed.error })
    return parsed.data
  }
  return {
    known: async id => (await call(`intake/myepo-letters/${encodeURIComponent(id)}`, { headers: auth }, knownSchema)).known,
    deliver: letter => call('intake/myepo-letters', {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json', 'idempotency-key': `myepo-letter:${letter.communication.id}:${Date.parse(letter.download.at)}` },
      body: JSON.stringify(letter),
    }, deliveryAnswerSchema),
  }
}

/** What one pass did. */
export interface MyEpoReadPass {
  /** The unhandled letters that the list showed. */
  readonly listed: number
  /** The letters that the Firm Record already had: not downloaded again. */
  readonly known: number
  /** The letters sent, each with the record's answer; `listOnly` when the record keeps the list data without the PDF. */
  readonly delivered: readonly { readonly id: MyEpoCommunicationId; readonly answer: MyEpoDeliveryAnswer; readonly listOnly: boolean }[]
  /** The letters whose PDF the record already has from the mail (`already-stored`): settled, never sent again. */
  readonly alreadyStored: readonly MyEpoCommunicationId[]
  /** The letters that MyEPO did not give now or the record refused even as list data, each with why; the next pass tries them again. */
  readonly failed: readonly { readonly id: MyEpoCommunicationId; readonly reason: string }[]
}

/** The most unhandled letters that one list request asks for. */
const PAGE_SIZE = 50

/**
 * One read of the firm's unhandled MyEPO letters. Each letter that the Firm Record does not have is downloaded (MyEPO marks it
 * as read; the reader never marks it handled) and sent to the intake. No letter is dropped: when the record refuses the PDF
 * (too large, not readable) or the ZIP has no readable PDF, the letter is sent again as list data only, and the record keeps it
 * in its Intake with the reason. A letter whose PDF the record already has from the mail is settled. A MyEPO failure that can
 * pass (`unreachable`, `rejected`, `no-permission`, `not-ready`) and a list-data send that the record refuses are reported, and
 * the next pass tries again. A refused link (`refused`, `not-linked`) or an intake whose outcome is not known stops the pass with
 * its error, so nothing is lost and the next pass reads the list again.
 * @param options - `reads`, the MyEPO client with its request gate; `intake`, the Firm Record; `mode`, the download mode;
 *   `now`, the clock (epoch ms); `settled`, the ids that need no new send, which the caller keeps across passes and the pass
 *   fills, so a settled letter costs no request.
 * @returns what the pass did.
 */
export async function readMyEpoLetters(options: {
  readonly reads: Pick<MyEpoReads, 'unhandledCommunications' | 'downloadCommunication'>
  readonly intake: MyEpoLetterIntake
  readonly mode: MyEpoDownloadMode
  readonly now: () => number
  readonly settled: Set<MyEpoCommunicationId>
  readonly signal?: AbortSignal
}): Promise<MyEpoReadPass> {
  const { reads, intake, mode, now, settled, signal } = options
  const listedAt = new Date(now()).toISOString()
  const letters: MyEpoCommunication[] = []
  for (let page = 0; ; page++) {
    const result = await reads.unhandledCommunications({ page, size: PAGE_SIZE }, signal)
    letters.push(...result.items)
    if (result.items.length === 0 || letters.length >= result.total) break
  }
  let known = 0
  const delivered: { id: MyEpoCommunicationId; answer: MyEpoDeliveryAnswer; listOnly: boolean }[] = []
  const alreadyStored: MyEpoCommunicationId[] = []
  const failed: { id: MyEpoCommunicationId; reason: string }[] = []
  for (const communication of letters) {
    if (settled.has(communication.id) || await intake.known(communication.id)) {
      settled.add(communication.id)
      known++
      continue
    }
    let letter: MyEpoLetterDelivery
    try {
      letter = await download(reads, communication, mode, listedAt, now, signal)
    } catch (error) {
      if (!(error instanceof MyEpoError) || error.failure.kind === 'refused' || error.failure.kind === 'not-linked') throw error
      if (error.failure.kind !== 'invalid-response') {
        failed.push({ id: communication.id, reason: error.message })
        continue
      }
      // The EPO gave a download that holds no one readable PDF: the next read gets the same, so the list data goes now.
      letter = listOnly(communication, listedAt, now, mode, { status: 0, code: 'download-not-readable' })
    }
    try {
      delivered.push({ id: communication.id, ...await deliverOrListOnly(intake, letter) })
      settled.add(communication.id)
    } catch (error) {
      if (!(error instanceof MyEpoIntakeError) || error.kind === 'unavailable') throw error
      if (error.code === 'already-stored') {
        alreadyStored.push(communication.id)
        settled.add(communication.id)
      } else {
        failed.push({ id: communication.id, reason: error.message })
      }
    }
  }
  return { listed: letters.length, known, delivered, alreadyStored, failed }
}

/** Sends a letter; when the record refuses its PDF (any refusal but `already-stored`), sends its list data with that refusal. */
async function deliverOrListOnly(
  intake: MyEpoLetterIntake, letter: MyEpoLetterDelivery,
): Promise<{ answer: MyEpoDeliveryAnswer; listOnly: boolean }> {
  try {
    return { answer: await intake.deliver(letter), listOnly: letter.document === null }
  } catch (error) {
    if (!(error instanceof MyEpoIntakeError) || error.kind !== 'refused' || error.code === 'already-stored' || letter.document === null) throw error
    const refused = { status: error.status, code: error.code }
    return { answer: await intake.deliver({ ...letter, document: null, download: { ...letter.download, refused } }), listOnly: true }
  }
}

function listOnly(
  communication: MyEpoCommunication, listedAt: string, now: () => number, mode: MyEpoDownloadMode, refused: MyEpoRefusal,
): MyEpoLetterDelivery {
  const download = { at: new Date(now()).toISOString(), cause: mode, refused }
  return { communication: listData(communication, listedAt), document: null, download }
}

function listData(communication: MyEpoCommunication, listedAt: string): MyEpoLetterDelivery['communication'] {
  return {
    id: communication.id, applicationNumber: communication.applicationNumber ?? null, userReference: communication.userReference ?? null,
    documentCode: communication.documentCode, title: communication.title, dispatchDate: communication.dispatchDate, listedAt,
  }
}

async function download(
  reads: Pick<MyEpoReads, 'downloadCommunication'>, communication: MyEpoCommunication, mode: MyEpoDownloadMode, listedAt: string,
  now: () => number, signal: AbortSignal | undefined,
): Promise<MyEpoLetterDelivery> {
  const { filename, pdf } = await reads.downloadCommunication(communication, signal)
  const bytes = Buffer.from(pdf)
  return {
    communication: listData(communication, listedAt),
    document: {
      fileName: filename.replace(/^.*[/\\]/, ''), mediaType: 'application/pdf',
      sha256: createHash('sha256').update(bytes).digest('hex'), contentBase64: bytes.toString('base64'),
    },
    download: { at: new Date(now()).toISOString(), cause: mode },
  }
}
