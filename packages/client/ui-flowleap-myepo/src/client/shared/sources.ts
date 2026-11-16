/**
 * Where the MyEPO pages read their data. On a single-user installation the Host reads MyEPO at each request
 * (`flowleapConnectors` Remote). On a firm installation only the firm worker reads MyEPO, and the pages read the copy
 * that the Firm Record keeps, through the firm's sign-in: the Firm Record gives it only to a person who has the MyEPO
 * pages. The Host's records-link route says which of the two applies.
 */
import { z } from 'zod'
import type {
  MyEpoApplicationDetailView, MyEpoApplicationsView, MyEpoLetterPdf, MyEpoMailboxView,
} from '@deepseek-ai/dsh-api-remotes/client'
import type { LetterDownload } from '../letters/mailbox.ts'
import type { Answer, EpoFailure } from './read.ts'

/** The four reads of the MyEPO pages. */
export interface MyEpoSource {
  readonly mailbox: () => Promise<Answer<MyEpoMailboxView | EpoFailure>>
  /** The PDF of one letter; `null` when the source has none. */
  readonly letterPdf: (id: string) => Promise<Answer<LetterDownload | null>>
  readonly applications: () => Promise<Answer<MyEpoApplicationsView | EpoFailure>>
  readonly application: (procedure: string, number: string) => Promise<Answer<MyEpoApplicationDetailView | EpoFailure>>
}

/** The `flowleapConnectors` calls that the pages use. */
export interface MyEpoRemote {
  readonly myEpoMailbox: () => Promise<Answer<MyEpoMailboxView>>
  readonly myEpoLetterPdf: (id: string) => Promise<Answer<MyEpoLetterPdf>>
  readonly myEpoApplications: () => Promise<Answer<MyEpoApplicationsView>>
  readonly myEpoApplication: (procedure: string, number: string) => Promise<Answer<MyEpoApplicationDetailView>>
}

/**
 * The source that reads MyEPO through the Host. A download makes MyEPO show the letter as read.
 * @param remote - the `flowleapConnectors` Remote namespace.
 * @returns the source.
 */
export function remoteSource(remote: MyEpoRemote): MyEpoSource {
  return {
    mailbox: () => remote.myEpoMailbox(),
    letterPdf: async (id) => {
      const answer = await remote.myEpoLetterPdf(id)
      return answer.ok ? { ok: true, value: { ...answer.value, marksRead: true } } : answer
    },
    applications: () => remote.myEpoApplications(),
    application: (procedure, number) => remote.myEpoApplication(procedure, number),
  }
}

/** The Host route that answers where the Firm Record is, relative to the document. */
export const RECORDS_LINK_ROUTE = 'api/flowleap/records-link'

const linkSchema = z.object({ href: z.string().min(1) })

/**
 * Ask the Host where the Firm Record is.
 * @param fetchImpl - the fetch to use.
 * @returns the path of the Firm Record's pages relative to the document, ending in `/`; `null` when the installation
 *   has no Firm Record, or the Host gave no answer that the page can read.
 */
export async function readRecordsHref(fetchImpl: typeof fetch): Promise<string | null> {
  const response = await fetchImpl(RECORDS_LINK_ROUTE, { credentials: 'include', cache: 'no-store' }).catch(() => null)
  if (response?.status !== 200) return null
  return linkSchema.safeParse(await response.json().catch(() => null)).data?.href ?? null
}

const text = z.string()
const optionalText = z.string().nullable()
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u)
const notRead = z.object({ kind: z.literal('not-read') })
const mailboxSchema = z.discriminatedUnion('kind', [notRead, z.object({
  kind: z.literal('read'),
  readAt: text,
  total: z.number(),
  folders: z.array(z.object({ id: text, name: text })),
  letters: z.array(z.object({
    id: text, title: text, documentCode: text, dispatchDate: date, read: z.boolean(), handled: z.boolean(), folderId: text,
    applicationNumber: optionalText, userReference: optionalText, applicantName: optionalText, recipientName: optionalText,
    digitalFile: optionalText,
  })),
})])
const applicationsSchema = z.discriminatedUnion('kind', [notRead, z.object({
  kind: z.literal('read'),
  readAt: text,
  total: z.number(),
  applications: z.array(z.object({
    procedure: z.enum(['EPC', 'UPP']), number: text, numberWithCheckDigit: text, filingDate: date, fileReference: optionalText,
    portfolioId: text, portfolioName: text,
  })),
})])
const applicationSchema = z.discriminatedUnion('kind', [notRead, z.object({
  kind: z.literal('read'),
  titles: z.record(text, text),
  applicants: z.array(text),
  inventors: z.array(text),
  representatives: z.array(text),
  publications: z.array(z.object({ office: text, number: text, kind: text, date })),
  priorities: z.array(z.object({ office: text, number: text, filingDate: date })),
  ipc: z.array(text),
  cpc: z.array(text),
  dueDates: z.array(z.object({
    termKey: text, description: z.object({ en: text, fr: text, de: text }).nullable(), dueDate: date, actor: text,
  })),
  fees: z.array(z.object({ feeCode: text, amount: z.number(), currency: optionalText, dueDate: date })),
})])
const errorSchema = z.object({ error: z.string() })

/** The file name of a `content-disposition` header, or the name for a header that has none. */
function fileNameOf(header: string | null, fallback: string): string {
  return /filename="([^"]+)"/u.exec(header ?? '')?.[1] ?? fallback
}

/**
 * The source that reads the firm's copy of MyEPO in the Firm Record. A person who does not have the MyEPO pages gets
 * `no-access`; before the first copy, a read gets `not-read`. A PDF is the firm's copy, so MyEPO does not change.
 * @param recordsHref - the Firm Record's pages relative to the document, ending in `/`, such as `records/`.
 * @param fetchImpl - the fetch to use.
 * @returns the source.
 */
export function recordSource(recordsHref: string, fetchImpl: typeof fetch): MyEpoSource {
  const failed = (message: string): { ok: false; error: { message: string } } => ({ ok: false, error: { message } })
  /** One GET below `api/myepo/`: the body that `read` takes from a 200 answer, the value of `refusal` for a refusal it names. */
  const get = async <T>(
    path: string, read: (response: Response) => Promise<T | undefined>,
    refusal: (status: number, code: string | undefined) => T | undefined,
  ): Promise<Answer<T>> => {
    let response: Response
    try {
      response = await fetchImpl(`${recordsHref}api/myepo/${path}`, { credentials: 'include', cache: 'no-store' })
    } catch (error) {
      return failed(String(error))
    }
    if (response.status === 200) {
      const value = await read(response).catch(() => undefined)
      return value === undefined ? failed('The Firm Record gave an answer that this page cannot read.') : { ok: true, value }
    }
    const code = errorSchema.safeParse(await response.json().catch(() => null)).data?.error
    const value = refusal(response.status, code)
    if (value !== undefined) return { ok: true, value }
    return failed(`The Firm Record answered ${String(response.status)}${code === undefined ? '' : ` ${code}`}.`)
  }
  const json = <T>(schema: z.ZodType<T>) =>
    async (response: Response): Promise<T | undefined> => schema.safeParse(await response.json()).data
  const noAccess = (status: number, code: string | undefined): EpoFailure | undefined =>
    status === 403 && code === 'no-myepo-access' ? { kind: 'no-access' } : undefined
  return {
    mailbox: () => get<MyEpoMailboxView | EpoFailure>('mailbox', json(mailboxSchema), noAccess),
    letterPdf: id => get<LetterDownload | null>(
      `letters/${encodeURIComponent(id)}/content`,
      async response => ({
        fileName: fileNameOf(response.headers.get('content-disposition'), `${id}.pdf`),
        pdf: new Uint8Array(await response.arrayBuffer()),
        marksRead: false,
      }),
      (status, code) => (status === 404 && code === 'no-copy' ? null : undefined),
    ),
    applications: () => get<MyEpoApplicationsView | EpoFailure>('applications', json(applicationsSchema), noAccess),
    application: (procedure, number) => get<MyEpoApplicationDetailView | EpoFailure>(
      `applications/${encodeURIComponent(procedure)}/${encodeURIComponent(number)}`, json(applicationSchema), noAccess,
    ),
  }
}

/**
 * The source of an installation: the Firm Record when the Host names one, else MyEPO through the Host. Each read waits
 * for the Host's answer to the records-link route, which is asked once.
 * @param remote - the `flowleapConnectors` Remote namespace.
 * @param fetchImpl - the fetch to use.
 * @returns the source.
 */
export function installationSource(remote: MyEpoRemote, fetchImpl: typeof fetch): MyEpoSource {
  const chosen = readRecordsHref(fetchImpl).then(href => (href === null ? remoteSource(remote) : recordSource(href, fetchImpl)))
  return {
    mailbox: async () => (await chosen).mailbox(),
    letterPdf: async id => (await chosen).letterPdf(id),
    applications: async () => (await chosen).applications(),
    application: async (procedure, number) => (await chosen).application(procedure, number),
  }
}
