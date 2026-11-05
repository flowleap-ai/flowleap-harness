/**
 * The Records API of flowleap-os as the IPMS views use it: the types of every answer, the parsers that check each
 * answer at the wire boundary, the reads, and the commands. The browser calls `<recordsHref>api/<path>` on the same
 * origin with the person's cookie; the firm proxy adds the person's identity. Each command carries an
 * `Idempotency-Key` that names one act of a person, so a retry of the same act cannot run it twice.
 *
 * The contract lives in the R1 IPMS screens plan (`2026-11-04-r1-ipms-screens-plan.md`); the os answers a refusal as
 * `{ error: <code>, detail?: <sentence> }` with the status of its refusal table.
 */

import type { Branded } from '@deepseek-ai/dsh-brand'
import { ATLAS, type AtlasMachine, type AtlasRef, type DeadlineState, type IntakeState, type OutboxState, type ReportState, type TicketState } from './atlas.ts'
import {
  anyObject, arrayOf, bool, branded, isoDate, isoTime, nullable, num, obj, objectAt, oneOf, partialRecord, str,
  WireError, type IsoDate, type IsoTime, type Parse, type Parsed,
} from './wire.ts'

export type { IsoDate, IsoTime } from './wire.ts'

/** Opaque id of a person: the key of the wall check and of "you"; never shown. */
export type PersonId = Branded<'RecordsPersonId'>
/** A document's SHA-256 in hex: the key of a letter, a report or a reply. */
export type DocumentId = Branded<'RecordsDocumentId'>
/** The firm's file number of a matter, such as `FL-2026-0001`; shown as the matter key. */
export type FileNumber = Branded<'RecordsFileNumber'>
/** Opaque id of a deadline. */
export type DeadlineId = Branded<'RecordsDeadlineId'>
/** Opaque id of a work item (a ticket). */
export type TicketId = Branded<'RecordsTicketId'>
/** Opaque id of an office event. */
export type OfficeEventId = Branded<'RecordsOfficeEventId'>
/** Opaque id of a report proposal. */
export type ProposalId = Branded<'RecordsProposalId'>
/** The id of a work item's run Session in the routed attorney's runtime. */
export type RunSessionId = Branded<'RecordsRunSessionId'>
/** The `Idempotency-Key` of one act of a person, `ipms:<uuid>`. */
export type IdempotencyKey = Branded<'RecordsIdempotencyKey'>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const OPAQUE = /^[\w.:-]{1,200}$/

/** Parsers of the opaque ids. */
export const ids = {
  person: branded<PersonId>(OPAQUE, 'a person id'),
  document: branded<DocumentId>(/^[0-9a-f]{64}$/, 'a SHA-256 in hex'),
  fileNumber: branded<FileNumber>(/^[^\s/?#][^/?#]{0,99}$/, 'a file number'),
  deadline: branded<DeadlineId>(UUID, 'a deadline id'),
  ticket: branded<TicketId>(UUID, 'a work id'),
  officeEvent: branded<OfficeEventId>(UUID, 'an office event id'),
  proposal: branded<ProposalId>(OPAQUE, 'a proposal id'),
  session: branded<RunSessionId>(OPAQUE, 'a session id'),
} as const

/**
 * A state of one atlas machine.
 * @param machine - the machine.
 * @returns the parser.
 */
function stateOf<M extends AtlasMachine>(machine: M) {
  return oneOf(Object.keys(ATLAS[machine]) as (keyof (typeof ATLAS)[M] & string)[])
}

const intakeState: Parse<IntakeState> = stateOf('intake')
const deadlineState: Parse<DeadlineState> = stateOf('deadline')
const ticketState: Parse<TicketState> = stateOf('ticket')
const reportState: Parse<ReportState> = stateOf('report')
const outboxState: Parse<OutboxState> = stateOf('outbox')

/**
 * An `intake` or `deadline` machine with its state, from the `machine` and `state` fields of an object.
 * @param source - the object.
 * @param path - where it is.
 * @returns the atlas state.
 */
function queueStatus(source: Readonly<Record<string, unknown>>, path: string): QueueStatus {
  const machine = oneOf(['intake', 'deadline'])(source['machine'], `${path}.machine`)
  return machine === 'intake'
    ? { machine, state: intakeState(source['state'], `${path}.state`) }
    : { machine, state: deadlineState(source['state'], `${path}.state`) }
}

/** The atlas state of a queue row: an intake state, or a deadline state for a letter whose office event waits. */
export type QueueStatus = Extract<AtlasRef, { machine: 'intake' | 'deadline' }>

// Common types.

/** A member of the matter's team: the id keys the person; `name` is the display name, or null when it has none yet. */
export interface TeamMember {
  readonly id: PersonId
  readonly name: string | null
}

/** Anyone outside the matter's team, and any mail address of no person: the os names neither (product rule 8). */
export interface Outsider {
  readonly id: null
  readonly name: null
}

/** A person in an answer: a member of the matter's team, or someone outside it whom the views never name. */
export type Person = TeamMember | Outsider

const person: Parse<Person> = (value, path) => {
  const source = objectAt(value, path)
  const id = nullable(ids.person)(source['id'], `${path}.id`)
  const name = nullable(str)(source['name'], `${path}.name`)
  if (id !== null) return { id, name }
  if (name !== null) throw new WireError(`${path}.name`, 'null for a person outside the team')
  return { id: null, name: null }
}

const member: Parse<TeamMember> = (value, path) => {
  const parsed = person(value, path)
  if (parsed.id === null) throw new WireError(`${path}.id`, 'a person id of a team member')
  return parsed
}

const excerpt = obj({ before: str, after: str })
const span = obj({ page: num, start: num, end: num, quote: str, excerpt: nullable(excerpt) })
/** An exact span of a document: the page, the offsets in that page's text, the quote, and the text around it. */
export type Span = Parsed<typeof span>

/** Who did something: a person, or FlowLeap, the AI mailbox or the attorney's agent (its person is the event's `for`). */
export type Actor =
  | { readonly kind: 'person'; readonly person: Person }
  | { readonly kind: 'system'; readonly name: 'flowleap' | 'mailbox' | 'agent' }

const actor: Parse<Actor> = (value, path) => {
  const source = objectAt(value, path)
  const kind = oneOf(['person', 'system'])(source['kind'], `${path}.kind`)
  return kind === 'person'
    ? { kind, person: person(source['person'], `${path}.person`) }
    : { kind, name: oneOf(['flowleap', 'mailbox', 'agent'])(source['name'], `${path}.name`) }
}

const activityEvent = obj({ seq: num, at: isoTime, type: str, actor, for: nullable(person), detail: anyObject })
/** One event of a record. `seq` and `type` show only in Audit; the views word the event from `type` and `detail`. */
export type ActivityEvent = Parsed<typeof activityEvent>
const activity = arrayOf(activityEvent)

/** Why a person may not decide. */
export type MayDecideReason = 'proposer' | 'code-decider' | 'not-in-team' | 'not-routed-person' | 'not-ready' | 'decided'

/** Whether the signed-in person may make the decision, and if not, why and who may. */
export type MayDecide =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: MayDecideReason; readonly decider: Person | null }

const mayDecide: Parse<MayDecide> = (value, path) => {
  const source = objectAt(value, path)
  if (bool(source['allowed'], `${path}.allowed`)) return { allowed: true }
  return {
    allowed: false,
    reason: oneOf<MayDecideReason>(['proposer', 'code-decider', 'not-in-team', 'not-routed-person', 'not-ready', 'decided'])(source['reason'], `${path}.reason`),
    decider: nullable(person)(source['decider'], `${path}.decider`),
  }
}

/** Why a person may not decide a work item: another person is routed, the run has not finished, or it is decided. */
export type WorkRefusal = 'not-routed-person' | 'not-ready' | 'decided'

/** Whether the signed-in person may decide a work item: as the responsible attorney or as the routed deputy. */
export type WorkMayDecide =
  | { readonly allowed: true; readonly as: 'responsible' | 'deputy' }
  | { readonly allowed: false; readonly reason: WorkRefusal; readonly decider: Person | null }

const workMayDecide: Parse<WorkMayDecide> = (value, path) => {
  const source = objectAt(value, path)
  if (bool(source['allowed'], `${path}.allowed`)) return { allowed: true, as: oneOf(['responsible', 'deputy'])(source['as'], `${path}.as`) }
  return {
    allowed: false,
    reason: oneOf<WorkRefusal>(['not-routed-person', 'not-ready', 'decided'])(source['reason'], `${path}.reason`),
    decider: nullable(person)(source['decider'], `${path}.decider`),
  }
}

const matterRef = obj({ fileNumber: ids.fileNumber, title: str })
/** A matter by its file number and title. */
export type MatterRef = Parsed<typeof matterRef>

/** The reader fields of a letter. */
export const READER_FIELDS = ['formNumber', 'documentDate', 'applicationNumber', 'reference'] as const
/** One reader field. */
export type ReaderField = (typeof READER_FIELDS)[number]
const fieldValue = obj({ value: str, span })
/** A value that a reader read, with its exact span. */
export type FieldValue = Parsed<typeof fieldValue>

// GET me

const me = obj({ person: member, admin: bool })
/** The signed-in person. */
export type Me = Parsed<typeof me>

// GET matters

const matterRow = obj({
  fileNumber: ids.fileNumber, title: str, client: str, responsible: nullable(person), state: oneOf(['open', 'closed']),
  openDeadlines: num, nextDue: nullable(isoDate),
})
const mattersList = obj({ rows: arrayOf(matterRow) })
/** One matter in the matters list. */
export type MatterRow = Parsed<typeof matterRow>
/** The matters the person may see, next due first. */
export type MattersList = Parsed<typeof mattersList>

// GET matters/<fileNumber>

const matterDetail = obj({
  recordSeq: num,
  matter: obj({ fileNumber: ids.fileNumber, title: str, client: str, state: oneOf(['open', 'closed']), applicationNumber: nullable(str) }),
  responsible: nullable(person),
  team: arrayOf(member),
  deadlines: arrayOf(obj({
    id: ids.deadline, due: isoDate, state: deadlineState, code: nullable(str), officeEventId: ids.officeEvent,
  })),
  work: arrayOf(obj({
    id: ids.ticket, state: ticketState, code: nullable(str), routedTo: nullable(person), updatedAt: isoTime,
    report: nullable(obj({ state: reportState })), reply: nullable(obj({ state: outboxState })),
  })),
  officeEvents: arrayOf(obj({
    id: ids.officeEvent, code: nullable(str), documentDate: nullable(isoDate), state: deadlineState,
    document: nullable(ids.document), receivedAt: nullable(isoDate),
  })),
  documents: arrayOf(obj({ sha256: ids.document, fileName: str, mediaType: str, source: oneOf(['mail', 'agent']), at: isoTime })),
  activity,
})
/** One matter with its deadlines, work, office events, documents and Activity. */
export type MatterDetail = Parsed<typeof matterDetail>

// GET deadlines/<id>

const reading = obj({ code: nullable(str), documentDate: nullable(isoDate), applicationNumber: nullable(str) })
const deadlineDetail = obj({
  recordSeq: num,
  deadline: obj({
    id: ids.deadline, due: isoDate, state: deadlineState, ruleId: str, ruleVersion: num,
    trace: arrayOf(obj({ op: str, from: isoDate, to: isoDate, cite: str })),
    notes: arrayOf(obj({ kind: str, text: str, cite: str })),
    sources: arrayOf(obj({ cite: str, url: str })),
  }),
  matter: matterRef,
  responsible: nullable(person),
  officeEvent: obj({
    id: ids.officeEvent, code: nullable(str), documentDate: nullable(isoDate), applicationNumber: nullable(str),
    document: nullable(ids.document), fileName: nullable(str), state: deadlineState,
  }),
  readers: obj({
    code: nullable(obj({ result: nullable(reading), fields: partialRecord(READER_FIELDS, fieldValue) })),
    model: nullable(obj({ result: nullable(reading), model: str })),
    agree: nullable(bool),
  }),
  proposer: nullable(person), confirmer: nullable(person), rejecter: nullable(person), reason: nullable(str),
  mayConfirm: mayDecide,
  activity,
})
/** One deadline with its calculation, the two readings, the people and Activity. */
export type DeadlineDetail = Parsed<typeof deadlineDetail>

// GET intake?view=

/**
 * The three intake lists. They are filters, not partitions: a letter filed today whose code waits for a person is in
 * `waiting` and in `filed-today`, and the counts count it twice. Each list is oldest first.
 */
export type IntakeView = 'waiting' | 'filed-today' | 'not-relevant'

const intakeRow: Parse<IntakeRow> = (value, path) => {
  const source = objectAt(value, path)
  return {
    document: ids.document(source['document'], `${path}.document`),
    status: queueStatus(source, path),
    code: nullable(str)(source['code'], `${path}.code`),
    office: nullable(str)(source['office'], `${path}.office`),
    matter: nullable(matterRef)(source['matter'], `${path}.matter`),
    matterCount: num(source['matterCount'], `${path}.matterCount`),
    forwarder: nullable(person)(source['forwarder'], `${path}.forwarder`),
    receivedAt: isoTime(source['receivedAt'], `${path}.receivedAt`),
    since: isoTime(source['since'], `${path}.since`),
  }
}
/** One letter in an intake list; `status` joins the wire's `machine` and `state`. */
export interface IntakeRow {
  readonly document: DocumentId
  readonly status: QueueStatus
  /** The office event code, such as `EPO:R71(3)`; the views word it. */
  readonly code: string | null
  readonly office: string | null
  readonly matter: MatterRef | null
  /** Matters that the person may see whose file number is the letter's reference: 0 or 1 in R1. */
  readonly matterCount: number
  readonly forwarder: Person | null
  readonly receivedAt: IsoTime
  /** When the letter entered its current state. */
  readonly since: IsoTime
}
const intakeList = obj({
  asOf: isoTime,
  counts: obj({ waiting: num, filedToday: num, notRelevant: num }),
  rows: arrayOf(intakeRow),
})
/** One intake list with the counts of all three lists. */
export type IntakeList = Parsed<typeof intakeList>

// GET intake/documents/<sha256>

const intakeDocument: Parse<IntakeDocument> = (value, path) => {
  const source = objectAt(value, path)
  const rest = obj({
    document: ids.document, fileName: str, mediaType: str, pages: nullable(num), since: isoTime,
    mail: obj({ forwarder: nullable(person), receivedAt: isoTime, subject: str }),
    code: nullable(str), office: nullable(str), documentDate: nullable(isoDate), applicationNumber: nullable(str),
    fields: partialRecord(READER_FIELDS, fieldValue),
    proposed: nullable(obj({ fileNumber: ids.fileNumber, title: str, client: str, responsible: nullable(person), matchedBy: oneOf(['reference']) })),
    candidates: num,
    filed: nullable(matterRef),
    officeEvent: nullable(obj({ id: ids.officeEvent, state: deadlineState })),
    matters: arrayOf(matterRef),
    mayDecide,
    activity,
  })(value, path)
  return { ...rest, status: queueStatus(source, path) }
}
/** One letter of intake with its reading, the proposed matter, the matters the person may pick, and Activity. */
export interface IntakeDocument {
  readonly document: DocumentId
  readonly fileName: string
  readonly mediaType: string
  readonly pages: number | null
  readonly status: QueueStatus
  readonly since: IsoTime
  readonly mail: { readonly forwarder: Person | null; readonly receivedAt: IsoTime; readonly subject: string }
  readonly code: string | null
  readonly office: string | null
  readonly documentDate: IsoDate | null
  readonly applicationNumber: string | null
  /** What reader 1 read, each with its span, for the letter drawing and the reasons. */
  readonly fields: Partial<Readonly<Record<ReaderField, FieldValue>>>
  readonly proposed: {
    readonly fileNumber: FileNumber
    readonly title: string
    readonly client: string
    readonly responsible: Person | null
    readonly matchedBy: 'reference'
  } | null
  /** Matters that the person may see whose file number is the letter's reference: 0 or 1 in R1. */
  readonly candidates: number
  readonly filed: MatterRef | null
  readonly officeEvent: { readonly id: OfficeEventId; readonly state: DeadlineState } | null
  /** The "Other matter" picker: only matters the person may see, by file number. */
  readonly matters: readonly MatterRef[]
  readonly mayDecide: MayDecide
  readonly activity: readonly ActivityEvent[]
}

// GET tickets

const ticketRow = obj({
  id: ids.ticket, state: ticketState, code: nullable(str), matter: matterRef, team: arrayOf(member), routedTo: nullable(person),
  due: nullable(isoDate), deadline: nullable(obj({ state: deadlineState })), report: nullable(obj({ state: reportState })),
  reply: nullable(obj({ state: outboxState })), updatedAt: isoTime,
})
const ticketsList = obj({ rows: arrayOf(ticketRow) })
/** One work item on the board. */
export type TicketRow = Parsed<typeof ticketRow>
/** The work the person may see. */
export type TicketsList = Parsed<typeof ticketsList>

// GET tickets/<id>

const statement = obj({ text: str, evidence: arrayOf(obj({ document: ids.document, span: nullable(span) })) })
/** One statement of a draft with its evidence; a statement with no span is missing evidence. */
export type Statement = Parsed<typeof statement>
const ticketDetail = obj({
  recordSeq: num,
  ticket: obj({
    id: ids.ticket, pass: num, state: ticketState, since: isoTime, routedTo: nullable(person), decidedBy: nullable(person),
    decidedAt: nullable(isoTime),
  }),
  matter: matterRef,
  responsible: nullable(person),
  team: arrayOf(member),
  letter: nullable(obj({
    document: ids.document, fileName: str, pages: nullable(num), code: nullable(str), documentDate: nullable(isoDate),
    applicationNumber: nullable(str),
  })),
  reports: arrayOf(obj({
    proposalId: ids.proposal, document: ids.document, fileName: str, state: reportState, templateName: nullable(str),
    language: nullable(str), pages: nullable(num), statements: arrayOf(statement),
  })),
  deadline: nullable(obj({ id: ids.deadline, due: isoDate, state: deadlineState, confirmer: nullable(person) })),
  reply: nullable(obj({ state: outboxState, to: arrayOf(person) })),
  run: nullable(obj({ model: nullable(str), steps: nullable(num), finishedAt: nullable(isoTime), session: nullable(ids.session) })),
  mayDecide: workMayDecide,
  activity,
})
/** One work item on a letter: the letter, the proposed reports with their statements, the deadline, the reply. */
export type TicketDetail = Parsed<typeof ticketDetail>

/** The parsers of every read, for tests and fixtures. */
export const parsers = { me, mattersList, matterDetail, deadlineDetail, intakeList, intakeDocument, ticketsList, ticketDetail } as const

// Failures.

/**
 * Why a read or a command failed: no answer (`network`), a refusal of the Records service (`refused`, with its code
 * and status), an answer that does not match the contract (`malformed`, with the path), or a request that the view
 * stopped (`aborted`, never shown).
 */
export type RecordsError =
  | { readonly kind: 'network' }
  | { readonly kind: 'refused'; readonly status: number; readonly code: string | null; readonly detail: string | null }
  | { readonly kind: 'malformed'; readonly path: string }
  | { readonly kind: 'aborted' }

/** The answer of a read or a command. */
export type Fetched<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: RecordsError }

// Commands.

/** A person's decision on one proposed report. */
export interface ReportDecision {
  readonly proposalId: ProposalId
  readonly decision: 'approve' | 'reject'
  /** Required for a rejection. */
  readonly reason?: string
}

/** The deadline states that a work decision can record as checked. */
export type CheckedDeadlineState = Extract<DeadlineState, 'deadline_proposed' | 'active' | 'rejected' | 'engine_refused'>

/**
 * The deadline that a work decision checked, as the person saw it, or `none-yet` when the work has no deadline.
 * `seq` is the `recordSeq` of the work item that the person saw.
 */
export type DeadlineCheck =
  | { readonly id: DeadlineId; readonly state: CheckedDeadlineState; readonly seq: number }
  | { readonly id: 'none-yet'; readonly state: 'none-yet'; readonly seq: number }

/** One command of a person. */
export type Command =
  | { readonly kind: 'intake.match'; readonly document: DocumentId; readonly fileNumber: FileNumber }
  | { readonly kind: 'intake.notRelevant'; readonly document: DocumentId; readonly reason: string }
  | { readonly kind: 'officeEvent.decide'; readonly id: OfficeEventId; readonly code: string; readonly documentDate: IsoDate; readonly applicationNumber: string }
  | { readonly kind: 'deadline.confirm'; readonly id: DeadlineId; readonly seen: number }
  | { readonly kind: 'deadline.reject'; readonly id: DeadlineId; readonly reason: string }
  | { readonly kind: 'ticket.decide'; readonly id: TicketId; readonly reports: readonly ReportDecision[]; readonly deadlineCheck: DeadlineCheck }

/** One act of a person: a command and the key that makes its retries safe. */
export interface Act {
  readonly command: Command
  readonly key: IdempotencyKey
}

/**
 * Start one act of a person with a new `Idempotency-Key`. Keep the act to retry it: a retry sends the same key.
 * @param command - what the person does.
 * @returns the act.
 */
export function createAct(command: Command): Act {
  return { command, key: `ipms:${globalThis.crypto.randomUUID()}` as IdempotencyKey }
}

/**
 * The path and the body of a command.
 * @param command - the command.
 * @returns the path under `api/` and the JSON body.
 */
export function commandRequest(command: Command): { readonly path: string; readonly body: Readonly<Record<string, unknown>> } {
  switch (command.kind) {
    case 'intake.match': return { path: `intake/documents/${command.document}/match`, body: { fileNumber: command.fileNumber } }
    case 'intake.notRelevant': return { path: `intake/documents/${command.document}/not-relevant`, body: { reason: command.reason } }
    case 'officeEvent.decide': return {
      path: `office-events/${command.id}/decide`,
      body: { code: command.code, documentDate: command.documentDate, applicationNumber: command.applicationNumber },
    }
    case 'deadline.confirm': return { path: `deadlines/${command.id}/confirm`, body: { seen: command.seen } }
    case 'deadline.reject': return { path: `deadlines/${command.id}/reject`, body: { reason: command.reason } }
    case 'ticket.decide': return { path: `tickets/${command.id}/decide`, body: { reports: command.reports, deadlineCheck: command.deadlineCheck } }
  }
}

// The client.

/** Reads and commands of the Records API. */
export interface RecordsApi {
  me(signal: AbortSignal): Promise<Fetched<Me>>
  matters(signal: AbortSignal): Promise<Fetched<MattersList>>
  matter(fileNumber: FileNumber, signal: AbortSignal): Promise<Fetched<MatterDetail>>
  deadline(id: DeadlineId, signal: AbortSignal): Promise<Fetched<DeadlineDetail>>
  intake(view: IntakeView, signal: AbortSignal): Promise<Fetched<IntakeList>>
  intakeDocument(document: DocumentId, signal: AbortSignal): Promise<Fetched<IntakeDocument>>
  tickets(signal: AbortSignal): Promise<Fetched<TicketsList>>
  ticket(id: TicketId, signal: AbortSignal): Promise<Fetched<TicketDetail>>
  /**
   * Send one act. A retry of the same act passes the same `Act`, so its key is the same.
   * @returns ok with no value, or the failure; a network failure leaves the outcome unknown, so retry with the act.
   */
  perform(act: Act, signal?: AbortSignal): Promise<Fetched<null>>
  /**
   * The address of a document's bytes for Open the letter and Preview: `documents/<sha>/content`, the person's path
   * (the os refuses `intake/documents/<sha>/content` to a person).
   * @param document - the document.
   * @returns the same-origin address.
   */
  contentHref(document: DocumentId): string
}

/**
 * The failure of a non-2xx answer: the refusal code and detail when the body is the os refusal JSON.
 * @param response - the answer.
 * @returns the refusal.
 */
async function refusal(response: Response): Promise<RecordsError> {
  let code: string | null = null
  let detail: string | null = null
  try {
    const body = objectAt(await response.json(), 'body')
    code = typeof body['error'] === 'string' ? body['error'] : null
    detail = typeof body['detail'] === 'string' ? body['detail'] : null
  } catch (_error: unknown) {
    // A refusal from the proxy may have no JSON body; the status still names the failure.
  }
  return { kind: 'refused', status: response.status, code, detail }
}

/**
 * Run a request and read its answer.
 * @param run - the request.
 * @param read - reads the body of a 2xx answer.
 * @param signal - stops the request.
 * @returns the value or the failure.
 */
async function exchange<T>(
  run: () => Promise<Response>, read: (response: Response) => Promise<T>, signal: AbortSignal | undefined,
): Promise<Fetched<T>> {
  let response: Response
  try {
    response = await run()
  } catch (_error: unknown) {
    // fetch rejects for no answer and for an abort; the signal tells them apart.
    return { ok: false, error: signal?.aborted === true ? { kind: 'aborted' } : { kind: 'network' } }
  }
  if (response.status < 200 || response.status > 299) return { ok: false, error: await refusal(response) }
  try {
    return { ok: true, value: await read(response) }
  } catch (error: unknown) {
    if (error instanceof WireError) return { ok: false, error: { kind: 'malformed', path: error.path } }
    // The body is not JSON, or the connection broke while the body was read.
    return { ok: false, error: signal?.aborted === true ? { kind: 'aborted' } : { kind: 'malformed', path: 'body' } }
  }
}

/**
 * Create the Records API client.
 * @param recordsHref - the Records service as a document-relative path ending in `/`, such as `records/`.
 * @param fetchImpl - the fetch to use; the global fetch by default.
 * @returns the client.
 */
export function createRecordsApi(
  recordsHref: string, fetchImpl: typeof fetch = (input, init) => globalThis.fetch(input, init),
): RecordsApi {
  const base = `${recordsHref}api/`
  const get = <T>(path: string, parse: Parse<T>, signal: AbortSignal): Promise<Fetched<T>> => exchange(
    () => fetchImpl(`${base}${path}`, { credentials: 'include', cache: 'no-store', headers: { accept: 'application/json' }, signal }),
    async response => parse(await response.json(), 'body'),
    signal,
  )
  return {
    me: signal => get('me', me, signal),
    matters: signal => get('matters', mattersList, signal),
    matter: (fileNumber, signal) => get(`matters/${encodeURIComponent(fileNumber)}`, matterDetail, signal),
    deadline: (id, signal) => get(`deadlines/${id}`, deadlineDetail, signal),
    intake: (view, signal) => get(`intake?view=${view}`, intakeList, signal),
    intakeDocument: (document, signal) => get(`intake/documents/${document}`, intakeDocument, signal),
    tickets: signal => get('tickets', ticketsList, signal),
    ticket: (id, signal) => get(`tickets/${id}`, ticketDetail, signal),
    perform: (act, signal) => {
      const { path, body } = commandRequest(act.command)
      return exchange(
        () => fetchImpl(`${base}${path}`, {
          method: 'POST', credentials: 'include', cache: 'no-store', signal: signal ?? null,
          headers: { 'content-type': 'application/json', accept: 'application/json', 'idempotency-key': act.key },
          body: JSON.stringify(body),
        }),
        () => Promise.resolve(null),
        signal,
      )
    },
    contentHref: document => `${base}documents/${document}/content`,
  }
}
