/**
 * The reads of the MyEPO pages (Letters and Applications): the Mailbox, the applications and one application, each as
 * the page shows it. Two callers use them: the `flowleapConnectors` Remote namespace, which reads MyEPO at the request of
 * a page, and the firm worker, which copies the same data into the Firm Record (`myepo-mirror.ts`). A read changes nothing
 * in MyEPO and rejects with the {@link MyEpoError} of the client.
 * @module
 */

import { brandString } from '@deepseek-ai/dsh-brand'
import type { MyEpoReads } from './myepo-client.ts'
import type { MyEpoApplicationNumber, MyEpoCommunication, MyEpoPage, MyEpoTerm } from './myepo-wire.ts'
import type { MyEpoApplicationDetailView, MyEpoApplicationView, MyEpoFolderView, MyEpoLetterView } from './types.ts'

/** The page size of a list read. */
const LIST_PAGE_SIZE = 50

/** The most letters one Mailbox read returns. */
export const MAILBOX_LIMIT = 500

/** The most applications one read of the list returns. */
export const APPLICATIONS_LIMIT = 2000

/** An application number as MyEPO writes it in a path. */
export const APPLICATION_NUMBER = /^EP\d{8}$/u

/** The data, the EPO due dates and the pending fees of one application that the EPO gave. */
export type MyEpoApplicationDetail = Omit<Extract<MyEpoApplicationDetailView, { kind: 'read' }>, 'kind'>

/** The term descriptions by term key. */
export type MyEpoTermDescriptions = ReadonlyMap<string, MyEpoTerm['description']>

/**
 * Read a paged MyEPO list from its first page until the list ends, a page is empty, or the limit is reached.
 * @param read - reads one 0-based page.
 * @param limit - the most items to return.
 * @returns the items read and the total the EPO reports.
 */
async function readPages<T>(read: (page: number) => Promise<MyEpoPage<T>>, limit: number): Promise<{ items: T[]; total: number }> {
  const items: T[] = []
  let total = 0
  for (let page = 0; items.length < limit; page++) {
    const result = await read(page)
    total = result.total
    items.push(...result.items)
    if (result.items.length === 0 || items.length >= total) break
  }
  return { items, total }
}

/**
 * One letter as the Letters page shows it.
 * @param letter - the letter of the MyEPO list.
 * @returns the fields of the page, with `null` for a field that the EPO did not send.
 */
export function letterView(letter: MyEpoCommunication): MyEpoLetterView {
  return {
    id: letter.id,
    title: letter.title,
    documentCode: letter.documentCode,
    dispatchDate: letter.dispatchDate,
    read: letter.read,
    handled: letter.handled,
    folderId: letter.folderId,
    applicationNumber: letter.applicationNumber ?? null,
    userReference: letter.userReference ?? null,
    applicantName: letter.applicantName ?? null,
    recipientName: letter.recipientName ?? null,
    digitalFile: letter.digitalFile ?? null,
  }
}

/**
 * Read the Mailbox: the folders and every letter of the list (handled or not), at most {@link MAILBOX_LIMIT}.
 * @param reads - the MyEPO client.
 * @param signal - cancels the read.
 * @returns the letters in the order of the MyEPO list, the folders, and how many letters the Mailbox holds.
 */
export async function readMailbox(
  reads: Pick<MyEpoReads, 'folders' | 'communications'>, signal?: AbortSignal,
): Promise<{ letters: MyEpoCommunication[]; folders: MyEpoFolderView[]; total: number }> {
  const folders = await reads.folders(signal)
  const { items: letters, total } = await readPages(page => reads.communications({ page, size: LIST_PAGE_SIZE }, signal), MAILBOX_LIMIT)
  return { letters, folders: folders.map(({ id, name }) => ({ id, name })), total }
}

/**
 * Read the applications of the portfolios that the account may read: every page of `GET /applications`, at most
 * {@link APPLICATIONS_LIMIT}.
 * @param reads - the MyEPO client.
 * @param signal - cancels the read.
 * @returns the applications in the order of the MyEPO list, and how many the list holds.
 */
export async function readApplicationList(
  reads: Pick<MyEpoReads, 'applications'>, signal?: AbortSignal,
): Promise<{ applications: MyEpoApplicationView[]; total: number }> {
  const { items, total } = await readPages(page => reads.applications({ page, size: LIST_PAGE_SIZE }, signal), APPLICATIONS_LIMIT)
  return {
    applications: items.map(application => ({
      procedure: application.procedure,
      number: application.number,
      numberWithCheckDigit: application.numberWithCheckDigit,
      filingDate: application.filingDate,
      fileReference: application.fileReference ?? null,
      portfolioId: application.portfolioId,
      portfolioName: application.portfolioName,
    })),
    total,
  }
}

/**
 * Read the term descriptions by term key (`GET /terms`).
 * @param reads - the MyEPO client.
 * @param signal - cancels the read.
 * @returns the description of each term key.
 */
export async function readTermDescriptions(reads: Pick<MyEpoReads, 'terms'>, signal?: AbortSignal): Promise<MyEpoTermDescriptions> {
  return new Map((await reads.terms(signal)).map(term => [term.termKey, term.description]))
}

/**
 * Read one application: its bibliographic data, the EPO due dates with the words of their terms, and the pending fees.
 * @param reads - the MyEPO client.
 * @param application - the procedure, and the number as MyEPO writes it in a path ({@link APPLICATION_NUMBER}).
 * @param terms - the term descriptions, which the caller reads once.
 * @param signal - cancels the read.
 * @returns the data of the application.
 */
export async function readApplicationDetail(
  reads: Pick<MyEpoReads, 'bibliographicData' | 'dueDates' | 'pendingFees'>,
  application: { readonly procedure: 'EPC' | 'UPP'; readonly number: string },
  terms: Promise<MyEpoTermDescriptions>, signal?: AbortSignal,
): Promise<MyEpoApplicationDetail> {
  const ref = { procedure: application.procedure, number: brandString<MyEpoApplicationNumber>(application.number) } as const
  const [data, dueDates, fees, descriptions] = await Promise.all([
    reads.bibliographicData(ref, signal),
    reads.dueDates(ref, signal),
    reads.pendingFees(ref, signal),
    terms,
  ])
  return {
    titles: { ...data.titles },
    applicants: [...data.applicants],
    inventors: [...data.inventors],
    representatives: [...data.representatives],
    publications: data.publications.map(publication => ({ ...publication })),
    priorities: data.priorities.map(priority => ({ ...priority })),
    ipc: [...data.ipc],
    cpc: [...data.cpc],
    dueDates: dueDates.map(({ termKey, dueDate, actor }) => ({ termKey, description: descriptions.get(termKey) ?? null, dueDate, actor })),
    fees: fees.map(({ feeCode, amount, currency, dueDate }) => ({ feeCode, amount, currency: currency ?? null, dueDate })),
  }
}
