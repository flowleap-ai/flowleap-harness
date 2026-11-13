/**
 * Provider of `ctx.flowleapRecord` over HTTP with the runtime's record token as a bearer token: reads
 * `GET <baseURL>/records/api/matters/<fileNumber>/view`, reads the work of the token's person with
 * `GET <baseURL>/records/api/my-work`, reads the text layer of a document with
 * `GET <baseURL>/records/api/documents/<sha256>/text`, and sends the run commands
 * `POST <baseURL>/records/api/tickets/<ticketId>/run-started`, `.../reports`, and `.../finish`, each with an
 * `Idempotency-Key` derived from the Ticket, the Session, and (for a report) the tool call, so a repeat is the same
 * command. Without a configured address, without the token, or without a valid answer the call reports the refusal,
 * never a view or a receipt.
 * @module @deepseek-ai/dsh-flowleap-record/http
 */

import { createHash } from 'node:crypto'
import { Service, type Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { z as zod } from 'zod'
import { brandNumber, brandString } from '@deepseek-ai/dsh-brand'
import { credentialRef, type CredentialRef } from '@deepseek-ai/dsh-credentials'
import { readBoundedText } from '@deepseek-ai/dsh-flowleap-connectors'
import type {
  DeadlineId, DocumentSha256, DocumentText, FlowleapRecord, LocalDate, MatterFileNumber, MatterView, MatterViewRefusal, MatterViewResult,
  MyWork, MyWorkResult, OfficeEventId, OutboxId, PersonId, ProposalId, RecordCommandError, RecordCommandRefusal,
  RecordCommandResult, RecordSeq, ReadingId, ReadingProposal, ReadingReceipt, ReportProposal, ReportReceipt, RuleId, RunFinish,
  RunFinishReceipt, RunStart, RunStartReceipt,
  TicketId, ViewHash,
} from './types.ts'

/** Plugin config. */
export interface Config {
  /**
   * Base URL of the Firm Record, for example `http://flowleap-record:8091`; empty when the runtime has no Firm Record,
   * and every call then reports `not_configured`.
   */
  baseURL: string
  /** Credential reference (environment-variable name) of the runtime's record token; sent as a bearer token. */
  apiKeyRef: string
  /** Longest time one call may take, body included, in milliseconds. */
  timeoutMs: number
}

/** Most bytes of an answer body; a larger body is an invalid answer. A view with its traces stays far below this. */
const MAX_BODY_BYTES = 1024 * 1024

/** Most characters of the Firm Record's refusal detail that the provider keeps. */
const MAX_DETAIL_CHARS = 300

const seq = zod.number().int().nonnegative().transform(value => brandNumber<RecordSeq>(value))
const sha256 = zod.string().regex(/^[0-9a-f]{64}$/u).transform(value => brandString<DocumentSha256>(value))
const localDate = zod.string().regex(/^\d{4}-\d{2}-\d{2}$/u).transform(value => brandString<LocalDate>(value))

const traceStep = zod.object({ op: zod.string().min(1), from: localDate, to: localDate, cite: zod.string() })

const deadline = zod.object({
  id: zod.string().min(1).transform(value => brandString<DeadlineId>(value)),
  ruleId: zod.string().min(1).transform(value => brandString<RuleId>(value)),
  ruleVersion: zod.number().int().positive(),
  due: localDate,
  state: zod.enum(['proposed', 'active', 'rejected']),
  trace: zod.array(traceStep),
})

const clientRules = zod.object({
  seq,
  aiUse: zod.enum(['not-recorded', 'allowed', 'local-model-only', 'not-allowed']),
  aiLetters: zod.enum(['allowed', 'not-allowed']),
  reportEvents: zod.union([zod.literal('all-office-actions'), zod.array(zod.string().min(1))]),
  language: zod.enum(['de', 'en']),
  text: zod.string(),
})

const officeEvent = zod.object({
  id: zod.string().min(1).transform(value => brandString<OfficeEventId>(value)),
  seq,
  code: zod.string().min(1).nullable(),
  documentDate: localDate.nullable(),
  applicationNumber: zod.string().min(1).nullable(),
  document: sha256.nullable(),
  state: zod.string().min(1),
})

const ticket = zod.object({
  id: zod.string().min(1).transform(value => brandString<TicketId>(value)),
  pass: zod.number().int().positive(),
  state: zod.enum([
    'opened', 'no_person', 'routed', 'observed', 'by_hand', 'waking', 'running', 'run_failed', 'proposals_ready', 'decided',
    'cancelled',
  ]),
  routedTo: zod.string().nullable(),
})

const recordDocument = zod.object({
  sha256,
  fileName: zod.string().min(1),
  mediaType: zod.string().min(1),
  source: zod.string().min(1),
})

/** A Firm Record before the application number sends no such field; the model then reads `null`, never a missing field. */
const applicationNumber = zod.string().min(1).nullable().default(null)

/** The fields of a view that every Firm Record answers. */
const viewSchema = zod.object({
  recordSeq: seq,
  viewHash: zod.string().regex(/^[0-9a-f]{64}$/u).transform(value => brandString<ViewHash>(value)),
  matter: zod.object({
    fileNumber: zod.string().min(1).transform(value => brandString<MatterFileNumber>(value)),
    title: zod.string(),
    client: zod.string(),
    responsible: zod.string().nullable(),
    applicationNumber,
    state: zod.enum(['open', 'closed']),
  }),
  deadlines: zod.array(deadline),
})

/**
 * The Firm Record's answer to a view read: an R1 view with all four R1 fields, or an R0 view with none of them. A view
 * with only some of them is not a view.
 */
const matterViewSchema = zod.union([
  viewSchema.extend({
    clientRules: clientRules.nullable(),
    officeEvents: zod.array(officeEvent),
    tickets: zod.array(ticket),
    documents: zod.array(recordDocument),
  }),
  viewSchema.extend({
    clientRules: zod.never().optional(),
    officeEvents: zod.never().optional(),
    tickets: zod.never().optional(),
    documents: zod.never().optional(),
  }).transform(({ recordSeq, viewHash, matter, deadlines }) => ({ recordSeq, viewHash, matter, deadlines })),
])

/** A work item. The kind is any non-empty string, so a kind that this runtime does not know is still an item. */
const workItem = zod.object({
  id: zod.string().min(1),
  kind: zod.string().min(1),
  title: zod.string(),
  why: zod.string(),
  matter: zod.object({
    fileNumber: zod.string().min(1).transform(value => brandString<MatterFileNumber>(value)),
    title: zod.string(),
  }).nullable(),
  due: localDate.nullable(),
  since: zod.iso.datetime({ offset: true }),
  act: zod.string().min(1),
  task: zod.string().min(1).exactOptional(),
  state: zod.enum(['assigned', 'queued', 'escalated', 'alarm']).exactOptional(),
  group: zod.enum(['overdue', 'today', 'later']).exactOptional(),
  dueAt: zod.iso.datetime({ offset: true }).exactOptional(),
})

const count = zod.number().int().nonnegative()

/** The Firm Record's answer to a work read. */
const myWorkSchema = zod.object({
  recordSeq: seq,
  person: zod.object({
    id: zod.string().min(1).transform(value => brandString<PersonId>(value)),
    name: zod.string().nullable(),
  }),
  summary: zod.object({ lettersArrived: count, needYou: count, overdue: count, today: count, later: count }).exactOptional(),
  work: zod.array(workItem),
  inSight: zod.array(workItem).exactOptional(),
  matters: zod.array(zod.object({
    fileNumber: zod.string().min(1).transform(value => brandString<MatterFileNumber>(value)),
    title: zod.string(),
    client: zod.string(),
    applicationNumber,
    role: zod.enum(['responsible', 'team']),
    state: zod.enum(['open', 'closed']),
    nextDeadline: zod.object({
      id: zod.string().min(1).transform(value => brandString<DeadlineId>(value)),
      due: localDate,
      state: zod.enum(['deadline_proposed', 'active']),
    }).nullable(),
  })),
})

const documentTextSchema = zod.object({ pages: zod.array(zod.string()) })

const runStartSchema = zod.object({ recordSeq: seq })

const reportSchema = zod.object({
  proposalId: zod.string().min(1).transform(value => brandString<ProposalId>(value)),
  document: sha256,
  recordSeq: seq,
})

const readingSchema = zod.object({
  readingId: zod.string().min(1).transform(value => brandString<ReadingId>(value)),
  recordSeq: seq,
})

const finishSchema = zod.object({
  recordSeq: seq,
  outbox: zod.object({
    id: zod.string().min(1).transform(value => brandString<OutboxId>(value)),
    state: zod.enum(['queued', 'refused']),
  }).nullable(),
})

const refusalSchema = zod.object({ error: zod.string(), detail: zod.string().optional() })

/** The Firm Record's refusal codes of the run commands. */
const COMMAND_CODES: Readonly<Record<string, RecordCommandRefusal>> = {
  'agent-cannot-decide': 'agent_cannot_decide',
  'not-routed-person': 'not_routed_person',
  'not-found': 'not_found',
  'invalid-body': 'invalid_body',
  'ticket-not-waking': 'ticket_not_waking',
  'ticket-not-running': 'ticket_not_running',
  'report.no-ai-draft-against-client-rule': 'client_rule_forbids_ai_draft',
  'ai-not-allowed': 'client_rule_forbids_ai_read',
  'report.statement-has-evidence': 'statement_without_evidence',
  'report.statement-has-span': 'statement_without_span',
  'report.quote-not-in-letter': 'quote_not_in_letter',
  'report.quote-ambiguous': 'quote_ambiguous',
  'report.evidence-outside-matter': 'evidence_outside_matter',
  'no-proposals': 'no_proposals',
  'document-too-large': 'document_too_large',
  'idempotency-key-reused': 'idempotency_key_reused',
}

/**
 * A host that plain http may carry the token to: a loopback address, or a single-label name such as the in-cluster
 * `flowleap-record`, which does not leave the firm's network.
 */
const PLAIN_HTTP_HOST = /^(?:localhost|\[::1\]|127(?:\.\d{1,3}){3}|[a-z0-9-]+)$/iu

/**
 * Check the Firm Record address at load.
 * @param baseURL - the configured base URL.
 * @returns the origin, or `undefined` when no base URL is configured.
 * @throws when the base URL is not https (or http to a private host).
 */
function recordOrigin(baseURL: string): URL | undefined {
  if (baseURL === '') return undefined
  const base = URL.parse(baseURL)
  if (base === null || !(base.protocol === 'https:' || (base.protocol === 'http:' && PLAIN_HTTP_HOST.test(base.hostname)))) {
    throw new Error(`flowleap-record: baseURL must be empty, an https URL, or an http URL to a loopback or single-label host, got "${baseURL}"`)
  }
  return new URL(base.origin)
}

/**
 * The view refusal an HTTP status stands for.
 * @param status - the answer status.
 * @returns the refusal, or `undefined` for a successful status.
 */
function viewRefusalOf(status: number): MatterViewRefusal | undefined {
  if (status >= 200 && status < 300) return undefined
  if (status === 404) return 'not_found'
  if (status === 401 || status === 403) return 'refused'
  return 'service_error'
}

/**
 * The command refusal an error answer stands for: the Firm Record's code when it is known, else the status.
 * @param status - the error status.
 * @param text - the answer body, when it was read.
 * @returns the refusal with the Firm Record's detail.
 */
function commandRefusalOf(status: number, text: string | undefined): RecordCommandError {
  const body = text === undefined ? undefined : parseJson(text, refusalSchema)
  const code = body === undefined ? undefined : COMMAND_CODES[body.error]
  const error: RecordCommandRefusal = code
    ?? (status === 404 ? 'not_found' : status === 401 || status === 403 ? 'refused' : 'service_error')
  const detail = body?.detail?.slice(0, MAX_DETAIL_CHARS)
  return detail === undefined || detail === '' ? { error } : { error, detail }
}

/**
 * The value a JSON body holds.
 * @param text - the answer body.
 * @param schema - the answer's schema.
 * @returns the typed value, or `undefined` when the body is not JSON of that schema.
 */
function parseJson<T>(text: string, schema: zod.ZodType<T>): T | undefined {
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch (_error: unknown) {
    return undefined
  }
  const parsed = schema.safeParse(body)
  return parsed.success ? parsed.data : undefined
}

/**
 * The `Idempotency-Key` of a command: its kind and the SHA-256 of its identifying parts, so a repeat sends the same
 * key and the key stays inside the Firm Record's `[A-Za-z0-9._:-]{8,128}`.
 * @param kind - the command, such as `report`.
 * @param parts - the Ticket, the Session, and for a report the tool call.
 * @returns the key.
 */
export function idempotencyKey(kind: 'run-started' | 'report' | 'reading' | 'finish', parts: readonly string[]): string {
  return `${kind}:${createHash('sha256').update(JSON.stringify(parts)).digest('hex')}`
}

/** One HTTP exchange with the Firm Record: the answer status and its bounded body. */
type Exchange = { readonly status: number; readonly text: string | undefined } | { readonly error: 'unreachable' }

/** Provider of `ctx.flowleapRecord` over the Firm Record's HTTP API. */
export default class FlowleapRecordHttp extends Service implements FlowleapRecord {
  static inject = ['credentials']
  static Config: z<Config> = z.object({
    baseURL: z.string().default(''),
    apiKeyRef: z.string().required(),
    timeoutMs: z.number().step(1).min(100).max(60_000).default(5000),
  })

  private readonly origin: URL | undefined
  private readonly keyRef: CredentialRef

  /**
   * @param ctx - Host context.
   * @param config - the Firm Record address, the token reference, and the call deadline.
   * @throws when the base URL or the token reference is not valid.
   */
  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'flowleapRecord')
    this.origin = recordOrigin(config.baseURL)
    this.keyRef = credentialRef(config.apiKeyRef)
  }

  /**
   * Read the current view of one matter from the Firm Record.
   * @param fileNumber - the matter's file number.
   * @param signal - ends the read; the method rejects when it fires.
   * @returns the view, or the refusal.
   */
  async matterView(fileNumber: MatterFileNumber, signal: AbortSignal): Promise<MatterViewResult> {
    if (this.origin === undefined) return { error: 'not_configured' }
    const key = await this.key()
    if (key === undefined) return { error: 'no_key' }
    const exchange = await this.exchange(this.origin, `matters/${encodeURIComponent(fileNumber)}/view`, key, undefined, signal)
    if ('error' in exchange) return exchange
    const refusal = viewRefusalOf(exchange.status)
    if (refusal !== undefined) {
      if (refusal === 'service_error') this.ctx.logger.warn(`flowleap-record: the Firm Record answered HTTP ${String(exchange.status)}`)
      return { error: refusal }
    }
    const view: MatterView | undefined = exchange.text === undefined ? undefined : parseJson(exchange.text, matterViewSchema)
    return view ?? { error: 'invalid_answer' }
  }

  /**
   * Read the work of the token's person from the Firm Record. The request has no person id: the Firm Record takes the
   * person from the token.
   * @param signal - ends the read; the method rejects when it fires.
   * @returns the work, or the refusal. A 404 (a Firm Record without this path) is a `service_error`.
   */
  async myWork(signal: AbortSignal): Promise<MyWorkResult> {
    if (this.origin === undefined) return { error: 'not_configured' }
    const key = await this.key()
    if (key === undefined) return { error: 'no_key' }
    const exchange = await this.exchange(this.origin, 'my-work', key, undefined, signal)
    if ('error' in exchange) return exchange
    const refusal = viewRefusalOf(exchange.status)
    if (refusal !== undefined) {
      const error = refusal === 'not_found' ? 'service_error' : refusal
      if (error === 'service_error') this.ctx.logger.warn(`flowleap-record: the Firm Record answered HTTP ${String(exchange.status)} to my-work`)
      return { error }
    }
    const work: MyWork | undefined = exchange.text === undefined ? undefined : parseJson(exchange.text, myWorkSchema)
    return work ?? { error: 'invalid_answer' }
  }

  /**
   * Report that the run chat of a Ticket opened.
   * @param ticket - the Ticket of the wake.
   * @param command - the Session of the run chat.
   * @param signal - ends the command; the method rejects when it fires.
   * @returns the receipt, or the refusal.
   */
  runStarted(ticket: TicketId, command: RunStart, signal: AbortSignal): Promise<RecordCommandResult<RunStartReceipt>> {
    return this.command(ticket, 'run-started', idempotencyKey('run-started', [ticket, command.session]), { session: command.session }, runStartSchema, signal)
  }

  /**
   * Propose a client report letter for the attorney's decision.
   * @param ticket - the running Ticket.
   * @param command - the letter, its statements with evidence, and its sources.
   * @param signal - ends the command; the method rejects when it fires.
   * @returns the receipt, or the refusal.
   */
  proposeReport(ticket: TicketId, command: ReportProposal, signal: AbortSignal): Promise<RecordCommandResult<ReportReceipt>> {
    const body = {
      kind: command.kind,
      fileName: command.fileName,
      contentBase64: Buffer.from(command.content).toString('base64'),
      templateName: command.templateName,
      templateVersion: command.templateVersion,
      rulesSeq: command.rulesSeq,
      statements: command.statements,
      session: command.session,
      toolCall: command.toolCall,
    }
    return this.command(ticket, 'reports', idempotencyKey('report', [ticket, command.session, command.toolCall]), body, reportSchema, signal)
  }

  /**
   * Propose a reading of an office letter for the attorney's decision.
   * @param ticket - the running Ticket.
   * @param command - the letter, its objections and cited documents with their passages, and the language.
   * @param signal - ends the command; the method rejects when it fires.
   * @returns the receipt, or the refusal.
   */
  proposeReading(ticket: TicketId, command: ReadingProposal, signal: AbortSignal): Promise<RecordCommandResult<ReadingReceipt>> {
    return this.command(ticket, 'readings', idempotencyKey('reading', [ticket, command.session, command.toolCall]), command, readingSchema, signal)
  }

  /**
   * Read the text layer of a document of the record.
   * @param document - the SHA-256 of the document.
   * @param signal - ends the read; the method rejects when it fires.
   * @returns the text of each page, or the refusal.
   */
  documentText(document: DocumentSha256, signal: AbortSignal): Promise<RecordCommandResult<DocumentText>> {
    return this.send(`documents/${document}/text`, undefined, documentTextSchema, signal)
  }

  /**
   * End the run with its proposals and the deadline summary.
   * @param ticket - the running Ticket.
   * @param command - the Session and the deadline summary.
   * @param signal - ends the command; the method rejects when it fires.
   * @returns the receipt, or the refusal.
   */
  finishRun(ticket: TicketId, command: RunFinish, signal: AbortSignal): Promise<RecordCommandResult<RunFinishReceipt>> {
    return this.command(ticket, 'finish', idempotencyKey('finish', [ticket, command.session]), command, finishSchema, signal)
  }

  private async command<T>(
    ticket: TicketId, action: 'run-started' | 'reports' | 'readings' | 'finish', idempotency: string, body: object,
    schema: zod.ZodType<T>, signal: AbortSignal,
  ): Promise<RecordCommandResult<T>> {
    return this.send(`tickets/${encodeURIComponent(ticket)}/${action}`, { idempotency, json: JSON.stringify(body) }, schema, signal)
  }

  /** One authorized call to the Firm Record: a GET without `post`, else a POST; the receipt or the refusal. */
  private async send<T>(
    path: string, post: { idempotency: string; json: string } | undefined, schema: zod.ZodType<T>, signal: AbortSignal,
  ): Promise<RecordCommandResult<T>> {
    if (this.origin === undefined) return { error: 'not_configured' }
    const key = await this.key()
    if (key === undefined) return { error: 'no_key' }
    const exchange = await this.exchange(this.origin, path, key, post, signal)
    if ('error' in exchange) return exchange
    if (exchange.status < 200 || exchange.status >= 300) {
      const refusal = commandRefusalOf(exchange.status, exchange.text)
      if (refusal.error === 'service_error') this.ctx.logger.warn(`flowleap-record: the Firm Record answered HTTP ${String(exchange.status)} to ${path}`)
      return refusal
    }
    const receipt = exchange.text === undefined ? undefined : parseJson(exchange.text, schema)
    return receipt ?? { error: 'invalid_answer' }
  }

  private async exchange(
    origin: URL, path: string, key: string, post: { idempotency: string; json: string } | undefined, signal: AbortSignal,
  ): Promise<Exchange> {
    const url = new URL(`/records/api/${path}`, origin)
    try {
      const response = await fetch(url, {
        method: post === undefined ? 'GET' : 'POST',
        headers: {
          authorization: `Bearer ${key}`,
          accept: 'application/json',
          ...(post === undefined ? {} : { 'content-type': 'application/json', 'idempotency-key': post.idempotency }),
        },
        ...(post === undefined ? {} : { body: post.json }),
        redirect: 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(this.config.timeoutMs)]),
      })
      return { status: response.status, text: await readBoundedText(response, MAX_BODY_BYTES) }
    } catch (error: unknown) {
      if (signal.aborted) throw error
      this.ctx.logger.warn(`flowleap-record: the Firm Record was not reached or the answer not read: ${String(error).slice(0, 300)}`)
      return { error: 'unreachable' }
    }
  }

  private async key(): Promise<string | undefined> {
    let value: string | undefined
    try {
      value = (await this.ctx.credentials.resolve(this.keyRef))?.value
    } catch (error: unknown) {
      this.ctx.logger.warn(`flowleap-record: the record token was not read: ${String(error).slice(0, 300)}`)
      return undefined
    }
    return value === undefined || value === '' ? undefined : value
  }
}
