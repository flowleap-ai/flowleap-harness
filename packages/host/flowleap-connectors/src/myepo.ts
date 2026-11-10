/**
 * The firm's MyEPO link: the `flowleap-connectors/myepo` credential record, the link and test that the settings card
 * runs, and the `flowleapMyEpo` service that Host plugins read the firm's EP applications, Mailbox letters, EPO due
 * dates and pending fees through. The record holds the client ID and the secret of the firm's B2B account and the
 * facts of the last passed test; a link is stored only after its test passed. Every operation here reads; none
 * marks a letter as handled, moves a letter or sets a file reference.
 * @module
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { credentialKey, type CredentialProvider } from '@deepseek-ai/dsh-credentials'
import { z } from 'zod'
import {
  createMyEpoClient, testMyEpoLink,
  type MyEpoCredentials, type MyEpoEndpoint, type MyEpoReads, type RequestGate,
} from './myepo-client.ts'
import { CREDENTIAL_SCOPE } from './credentials.ts'
import type { MyEpoLinkView, MyEpoTestOutcome } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The firm's MyEPO account, read with its own B2B credentials. */
    flowleapMyEpo: MyEpoSource
  }
}

/**
 * The Service Definition of `ctx.flowleapMyEpo`: the read operations of the MyEPO API on the stored link. Each
 * operation rejects with `MyEpoError`; `not-linked` while no link is stored. `downloadCommunication` marks the
 * letter as read in the firm's MyEPO, as the EPO does for every download; it stays unhandled there.
 */
export type MyEpoSource = MyEpoReads

/** The record id of the link inside the plugin's credential scope. */
export const MYEPO_RECORD = 'myepo'

/** The credential fields the settings card asks for, in display order. */
export const MYEPO_FIELDS = ['clientId', 'clientSecret'] as const

const recordSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  testedAt: z.iso.datetime(),
  portfolios: z.string().regex(/^\d+$/),
  mailbox: z.enum(['yes', 'no']),
})

/** The stored link: the credentials and the facts of their last passed test. */
interface LinkRecord extends MyEpoCredentials {
  readonly testedAt: string
  readonly portfolios: number
  readonly mailbox: boolean
}

/** The link operations of the settings card, over one credential provider. */
export interface MyEpoLink {
  /** The reads on the stored link, which `ctx.flowleapMyEpo` serves. */
  readonly reads: MyEpoReads
  /**
   * The link state for the card, without a credential value.
   * @returns not linked, or linked with the facts of the last passed test.
   */
  describe(): Promise<MyEpoLinkView>
  /**
   * Test new credentials and store them only when the test passed.
   * @param values - the client ID and the client secret, each non-empty after trimming.
   * @param signal - cancels the test.
   * @returns the test outcome; `passed` means the link is stored.
   * @throws TypeError when a field is missing or empty; Error when the credential store refuses the write.
   */
  link(values: Record<string, string>, signal?: AbortSignal): Promise<MyEpoTestOutcome>
  /**
   * Test the stored link and store the facts of a passed test.
   * @param signal - cancels the test.
   * @returns the test outcome; the stored credentials do not change.
   */
  test(signal?: AbortSignal): Promise<MyEpoTestOutcome>
  /** Remove the stored link; removing an absent link is a no-op. */
  unlink(): Promise<void>
}

/** What the link needs. */
export interface MyEpoLinkOptions {
  readonly credentials: CredentialProvider
  readonly endpoint: MyEpoEndpoint
  readonly gate: RequestGate
  /** The network. */
  readonly fetch: typeof fetch
  /** The clock, epoch ms. */
  readonly now: () => number
}

/**
 * Check the two credential fields of a link request.
 * @param values - the fields as the card sends them.
 * @returns the trimmed credentials.
 * @throws TypeError naming the first missing, empty or unknown field.
 */
export function validateMyEpoFields(values: Record<string, string>): MyEpoCredentials {
  for (const field of Object.keys(values)) {
    if (!(MYEPO_FIELDS as readonly string[]).includes(field)) throw new TypeError(`MyEPO: unknown field "${field}"`)
  }
  const [clientId, clientSecret] = MYEPO_FIELDS.map((field) => {
    const value = values[field]?.trim() ?? ''
    if (value.length === 0) throw new TypeError(`MyEPO: field "${field}" is required`)
    return value
  }) as [string, string]
  return { clientId, clientSecret }
}

/**
 * Create the link over one credential provider.
 * @param options - the credential provider, the endpoint, the shared gate, the network and the clock.
 * @returns the link operations and the reads on the stored link.
 */
export function createMyEpoLink(options: MyEpoLinkOptions): MyEpoLink {
  const key = credentialKey(CREDENTIAL_SCOPE, MYEPO_RECORD)
  const { now } = options
  const clientOptions = { endpoint: options.endpoint, gate: options.gate, fetch: options.fetch, now }

  const read = async (): Promise<LinkRecord | undefined> => {
    const record = await options.credentials.readRecord(key)
    if (record?.kind !== 'grant') return undefined
    const payload = recordSchema.safeParse(record.payload)
    if (!payload.success) return undefined
    const { portfolios, mailbox, ...rest } = payload.data
    return { ...rest, portfolios: Number(portfolios), mailbox: mailbox === 'yes' }
  }

  const write = async (credentials: MyEpoCredentials, outcome: Extract<MyEpoTestOutcome, { kind: 'passed' }>): Promise<void> => {
    await options.credentials.modifyRecord(key, () => Promise.resolve({
      kind: 'grant',
      payload: {
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
        testedAt: outcome.testedAt,
        portfolios: String(outcome.portfolios.length),
        mailbox: outcome.mailbox ? 'yes' : 'no',
      },
    }))
  }

  const reads = createMyEpoClient({ ...clientOptions, credentials: read })

  return {
    reads,
    async describe() {
      const [info, record] = await Promise.all([options.credentials.describeRecord(key), read()])
      if (record === undefined) return { state: 'not-linked', writable: info.writable }
      return { state: 'linked', writable: info.writable, testedAt: record.testedAt, portfolios: record.portfolios, mailbox: record.mailbox }
    },
    async link(values, signal) {
      const credentials = validateMyEpoFields(values)
      const client = createMyEpoClient({ ...clientOptions, credentials: () => Promise.resolve(credentials) })
      const outcome = await testMyEpoLink(client, now, signal)
      if (outcome.kind === 'passed') await write(credentials, outcome)
      return outcome
    },
    async test(signal) {
      const stored = await read()
      if (stored === undefined) return { kind: 'not-linked' }
      const outcome = await testMyEpoLink(reads, now, signal)
      if (outcome.kind === 'passed') await write(stored, outcome)
      return outcome
    },
    unlink: () => options.credentials.deleteRecord(key),
  }
}

/** Options of the provider. */
export interface FlowleapMyEpoOptions {
  /** The reads on the stored link. */
  readonly reads: MyEpoReads
}

/** Provider of `ctx.flowleapMyEpo` over the stored link. */
export class FlowleapMyEpo extends Service implements MyEpoSource {
  private readonly reads: MyEpoReads

  /**
   * @param ctx - Host context.
   * @param options - the reads on the stored link.
   */
  constructor(ctx: Context, options: FlowleapMyEpoOptions) {
    super(ctx, 'flowleapMyEpo')
    this.reads = options.reads
  }

  portfolios: MyEpoReads['portfolios'] = signal => this.reads.portfolios(signal)
  applications: MyEpoReads['applications'] = (query, signal) => this.reads.applications(query, signal)
  bibliographicData: MyEpoReads['bibliographicData'] = (application, signal) => this.reads.bibliographicData(application, signal)
  communications: MyEpoReads['communications'] = (query, signal) => this.reads.communications(query, signal)
  unhandledCommunications: MyEpoReads['unhandledCommunications'] = (query, signal) => this.reads.unhandledCommunications(query, signal)
  folders: MyEpoReads['folders'] = signal => this.reads.folders(signal)
  downloadCommunication: MyEpoReads['downloadCommunication'] = (communication, signal) => this.reads.downloadCommunication(communication, signal)
  dueDates: MyEpoReads['dueDates'] = (application, signal) => this.reads.dueDates(application, signal)
  terms: MyEpoReads['terms'] = signal => this.reads.terms(signal)
  pendingFees: MyEpoReads['pendingFees'] = (application, signal) => this.reads.pendingFees(application, signal)
}
