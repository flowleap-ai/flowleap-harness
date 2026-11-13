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
/** Opaque id of the agent's reading of a letter. */
export type ReadingId = Branded<'RecordsReadingId'>
/** The id of a work item's run Session in the routed attorney's runtime. */
export type RunSessionId = Branded<'RecordsRunSessionId'>
/** The path of one page image under the Records API, `documents/<sha256>/pages/<n>`. */
export type PageHref = Branded<'RecordsPageHref'>
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
  reading: branded<ReadingId>(UUID, 'a reading id'),
  session: branded<RunSessionId>(OPAQUE, 'a session id'),
  page: branded<PageHref>(/^documents\/[0-9a-f]{64}\/pages\/[1-9][0-9]{0,3}$/, 'a page image path'),
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

/**
 * Who did something: a person, or FlowLeap, the AI mailbox, the scan mailbox (the scan of a letter), the firm's MyEPO reader,
 * or the attorney's agent (its person is the event's `for`).
 */
export type Actor =
  | { readonly kind: 'person'; readonly person: Person }
  | { readonly kind: 'system'; readonly name: 'flowleap' | 'mailbox' | 'scan-mailbox' | 'myepo' | 'agent' }

const actor: Parse<Actor> = (value, path) => {
  const source = objectAt(value, path)
  const kind = oneOf(['person', 'system'])(source['kind'], `${path}.kind`)
  return kind === 'person'
    ? { kind, person: person(source['person'], `${path}.person`) }
    : { kind, name: oneOf(['flowleap', 'mailbox', 'scan-mailbox', 'myepo', 'agent'])(source['name'], `${path}.name`) }
}

const eventWords = obj({ en: str, de: str })
const activityEvent: Parse<ActivityEvent> = (value, path) => {
  const source = objectAt(value, path)
  const parsed = obj({ seq: num, at: isoTime, type: str, actor, for: nullable(person), detail: anyObject })(value, path)
  return source['words'] === undefined ? parsed : { ...parsed, words: nullable(eventWords)(source['words'], `${path}.words`) }
}
/** One event of a record. `seq` and `type` show only in Audit. */
export interface ActivityEvent {
  readonly seq: number
  readonly at: IsoTime
  readonly type: string
  readonly actor: Actor
  readonly for: Person | null
  readonly detail: Readonly<Record<string, unknown>>
  /**
   * What the actor did, in the os's English and German words; `null` for an event that only Audit lists (task and
   * outbox steps, the seed load). Absent from an os that sends no words: the views word the event from `type` and
   * `detail`.
   */
  readonly words?: { readonly en: string; readonly de: string } | null
}
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

/**
 * The reader fields of a letter. `title` is the letter's title line, such as "Communication under Rule 71(3) EPC",
 * which the views quote for the letter's kind; `formNumber` is the office's form code, which shows only in Audit (R19).
 * Each field is optional: a reading without its span has no quote.
 */
export const READER_FIELDS = ['title', 'formNumber', 'documentDate', 'applicationNumber', 'reference'] as const
/** One reader field. */
export type ReaderField = (typeof READER_FIELDS)[number]
const fieldValue = obj({ value: str, span })
/** A value that a reader read, with its exact span. */
export type FieldValue = Parsed<typeof fieldValue>

// GET me

/** The firm roles of a person. */
export const FIRM_ROLES = ['attorney', 'partner', 'formalities', 'administrator'] as const
/** One firm role. */
export type FirmRole = (typeof FIRM_ROLES)[number]
const me = obj({
  person: member, admin: bool, roles: arrayOf(oneOf(FIRM_ROLES)), role: nullable(oneOf(FIRM_ROLES)), firm: obj({ timeZone: str }),
})
/** The signed-in person, with the roles and the one role that the account menu shows (null for none). */
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

// Tasks

/** The task kinds of atlas sheet 0; the views word each kind and never show the os text of `title` or `why`. */
export const TASK_KINDS = [
  'file-letter', 'enter-office-event', 'decide-office-event', 'enter-period', 'enter-date', 'confirm-deadline', 'decide-dispute',
  'assign-person', 'restart-run', 'decide-work', 'work-by-hand', 'send-report', 'fix-message', 'follow-up', 'day-check',
  'answer',
] as const
/** One task kind. */
export type TaskKind = (typeof TASK_KINDS)[number]
/** The due-time groups of My work. */
export type WorkGroup = 'overdue' | 'today' | 'later'

const workItemShape = {
  id: str, task: str, kind: oneOf(TASK_KINDS), state: oneOf(['assigned', 'queued', 'escalated', 'alarm']),
  group: oneOf(['overdue', 'today', 'later']), matter: nullable(matterRef), due: nullable(isoDate), dueAt: isoTime,
  since: isoTime, act: str,
}
const task = obj(workItemShape)
/** The fields that every task has, in My work and in a dossier's What waits. */
export type Task = Parsed<typeof task>
const workItem = obj({
  ...workItemShape,
  reason: obj({ en: str, de: str }),
  subject: obj({
    letterDate: nullable(isoDate), arrivedAt: nullable(isoTime), code: nullable(str),
    deadline: nullable(obj({ due: isoDate, state: deadlineState })),
  }),
})
/**
 * One open task: its kind, its task state, its due-time group, the matter (null for a letter that is not filed, to an
 * owner outside the proposed matter's team), the legal date of its deadline (`due`) apart from the task's own due time
 * (`dueAt`), and `act`, the record address of its object: `intake/<list>/<sha256>`, `deadline/<id>` or `work/<id>`.
 * `reason` is the os's words for why the task waits, in English and German; `subject` is the letter and the deadline
 * that the task is about.
 */
export type WorkItem = Parsed<typeof workItem>
// GET matters/<fileNumber>

/** What the client allows the AI to do with its matters. */
export const AI_USE = ['not-recorded', 'allowed', 'local-model-only', 'not-allowed'] as const
const reportEvents: Parse<'all-office-actions' | readonly string[]> = (value, path) =>
  value === 'all-office-actions' ? value : arrayOf(str)(value, path)

/** The client's AI wishes: what AI may do, whether it may draft a letter to the client, and its report language. */
const clientRules = obj({
  aiUse: oneOf(AI_USE), aiLetters: oneOf(['allowed', 'not-allowed']), reportEvents, language: nullable(str), text: str,
  recordSeq: num,
})
/** The role of a person in the matter's wall. */
const WALL_ROLES = ['responsible', 'formalities', 'team'] as const
/** A person of the wall: a team member (with no display name yet, as on a firm before its people sync) and the role. */
const wallMember: Parse<TeamMember & { readonly role: (typeof WALL_ROLES)[number] }> = (value, path) =>
  ({ ...member(value, path), role: oneOf(WALL_ROLES)(objectAt(value, path)['role'], `${path}.role`) })
const matterDetail = obj({
  recordSeq: num,
  matter: obj({ fileNumber: ids.fileNumber, title: str, client: str, state: oneOf(['open', 'closed']), applicationNumber: nullable(str) }),
  responsible: nullable(person),
  formalitiesPerson: nullable(person),
  team: arrayOf(member),
  waits: arrayOf(obj({ ...workItemShape, owner: person })),
  deadlines: arrayOf(obj({
    id: ids.deadline, due: isoDate, state: deadlineState, code: nullable(str), officeEventId: ids.officeEvent,
    confirmedBy: nullable(person), rejectedBy: nullable(person),
  })),
  clientRules: nullable(clientRules),
  language: nullable(str),
  wall: obj({ team: arrayOf(wallMember), screened: num }),
  work: arrayOf(obj({
    id: ids.ticket, state: ticketState, code: nullable(str), routedTo: nullable(person), updatedAt: isoTime,
    report: nullable(obj({ state: reportState })), reply: nullable(obj({ state: outboxState })),
  })),
  officeEvents: arrayOf(obj({
    id: ids.officeEvent, code: nullable(str), documentDate: nullable(isoDate), state: deadlineState,
    document: nullable(ids.document), receivedAt: nullable(isoDate),
  })),
  documents: arrayOf(obj({
    sha256: ids.document, fileName: str, mediaType: str, source: oneOf(['mail', 'myepo', 'agent']), at: isoTime,
    state: oneOf(['filed', 'proposed']), code: nullable(str), letterDate: nullable(isoDate), filedBy: nullable(person),
  })),
  activity,
})
/**
 * One matter with its deadlines (each with who confirmed or rejected it), work, office events, documents and Activity;
 * the client's rules for AI work, the client's report language, and the wall: the team with each one's role, and the
 * count of people screened from the matter.
 */
export type MatterDetail = Parsed<typeof matterDetail>

// GET deadlines/<id>

const pageImage = obj({ page: num, width: num, height: num, href: ids.page })
/** One page of a letter as an image, with its size in pixels and its path under the Records API. */
export type PageImage = Parsed<typeof pageImage>
const mark = obj({ field: oneOf(['formNumber', 'documentDate', 'applicationNumber']), page: num, quote: str, excerpt: nullable(excerpt) })
/** One read value of a letter with its page and its quote; the OCR gives no position on the page. */
export type Mark = Parsed<typeof mark>
const reading = obj({ code: nullable(str), documentDate: nullable(isoDate), applicationNumber: nullable(str) })
/** Where reader 1 read the text: the PDF's text layer, or the OCR text of a scan. */
export type ReaderSource = { readonly kind: 'text-layer' } | { readonly kind: 'ocr'; readonly provider: string; readonly model: string }
const readerSource: Parse<ReaderSource> = (value, path) => {
  const kind = oneOf(['text-layer', 'ocr'])(objectAt(value, path)['kind'], `${path}.kind`)
  return kind === 'text-layer' ? { kind } : { kind, ...obj({ provider: str, model: str })(value, path) }
}
/** Why reader 2 read a letter: before the filing, for the matter that its application number names, or after it. */
export const READER2_RULES = ['before-file-application-number', 'after-file'] as const
/** How the readings of a letter came out: both agree, they differ, one reading only, or none. */
export const READING_OUTCOMES = ['agree', 'differ', 'one-reading', 'no-reading'] as const
/** The ways in which the two readings of a letter differ. */
export const READING_DIFFERENCES = ['code', 'documentDate', 'applicationNumber', 'no-code-result', 'no-model-result'] as const
const readers = obj({
  code: nullable(obj({ result: nullable(reading), fields: partialRecord(READER_FIELDS, fieldValue), source: readerSource })),
  model: nullable(obj({ result: nullable(reading), model: str, rule: oneOf(READER2_RULES) })),
  agree: nullable(bool),
  differences: nullable(arrayOf(oneOf(READING_DIFFERENCES))),
  outcome: oneOf(READING_OUTCOMES),
})
/**
 * The two readings of a letter: reader 1 from the text (with its spans and where it read the text), reader 2 from the
 * page image, whether they agree, and how they differ.
 */
export type Readers = Parsed<typeof readers>
/**
 * The period that the letter of an office event sets (Rule 132(2) EPC, for example an Art. 94(3) communication): `known` with the
 * months and where they come from (read on a page of the letter, with the words and their `place` on that page, null for a period
 * that the os read before it kept the place, or entered by a person), or `missing` with why
 * the os read none, the values it found, the range of the rule and the record position that the entry sends. A reason that this
 * client does not know reads as `other`.
 */
export type LetterPeriod =
  | {
    readonly state: 'known'
    readonly months: number
    readonly source:
      | { readonly kind: 'reader'; readonly page: number; readonly quote: string; readonly place: { readonly start: number; readonly end: number } | null }
      | { readonly kind: 'entered'; readonly by: Person }
  }
  | {
    readonly state: 'missing'
    readonly reason: PeriodReason
    readonly found: readonly number[]
    readonly range: { readonly minMonths: number; readonly maxMonths: number }
    readonly recordSeq: number
  }
/**
 * Why the os read no period: no text layer, an OCR text only, no wording on page 1, two values, a value outside the range, or a
 * letter recorded before the os read periods.
 */
const PERIOD_REASONS = ['no-text', 'ocr-text', 'not-found', 'two-values', 'out-of-range', 'not-read'] as const
type PeriodReason = typeof PERIOD_REASONS[number] | 'other'
const periodReason: Parse<PeriodReason> = (value, path) => {
  const reason = str(value, path)
  return PERIOD_REASONS.find(known => known === reason) ?? 'other'
}
const periodSource: Parse<Extract<LetterPeriod, { state: 'known' }>['source']> = (value, path) =>
  oneOf(['reader', 'entered'])(objectAt(value, path)['kind'], `${path}.kind`) === 'reader'
    ? { kind: 'reader', ...obj({ page: num, quote: str })(value, path), place: placeOf(value, path) }
    : { kind: 'entered', ...obj({ by: person })(value, path) }
/** The offsets of the period's words on their page: both numbers, or none (an os or a period from before the os kept them). */
const placeOf = (value: unknown, path: string): { readonly start: number; readonly end: number } | null => {
  const { start, end } = obj({ start: optionalNumber, end: optionalNumber })(value, path)
  return start === null || end === null ? null : { start, end }
}
const optionalNumber: Parse<number | null> = (value, path) => value === undefined ? null : nullable(num)(value, path)
const letterPeriodOf: Parse<LetterPeriod> = (value, path) =>
  oneOf(['known', 'missing'])(objectAt(value, path)['state'], `${path}.state`) === 'known'
    ? { state: 'known', ...obj({ months: num, source: periodSource })(value, path) }
    : {
      state: 'missing',
      ...obj({ reason: periodReason, found: arrayOf(num), range: obj({ minMonths: num, maxMonths: num }), recordSeq: num })(value, path),
    }
/** The period of an answer: absent (an os before the period) reads as null, like null. */
const letterPeriod: Parse<LetterPeriod | null> = (value, path) => value === undefined ? null : nullable(letterPeriodOf)(value, path)
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
    document: nullable(ids.document), fileName: nullable(str), state: deadlineState, period: letterPeriod,
  }),
  readers,
  pageImages: arrayOf(pageImage),
  marks: arrayOf(mark),
  proposer: nullable(person), confirmer: nullable(person), rejecter: nullable(person), reason: nullable(str),
  mayConfirm: mayDecide,
  confirmTask: nullable(obj({ owner: person, queued: bool, noticeAt: nullable(isoTime) })),
  activity,
})
/** One deadline with its calculation, the two readings, the page images and marks of the letter, the people and Activity. */
export type DeadlineDetail = Parsed<typeof deadlineDetail>

// GET intake?view=

/**
 * The three intake lists. They are filters, not partitions: a letter filed today whose code waits for a person is in
 * `waiting` and in `filed-today`, and the counts count it twice. Each list is oldest first.
 */
export type IntakeView = 'waiting' | 'filed-today' | 'not-relevant'

/** How a letter came: from the firm's scan mailbox, or forwarded by a person, who gets the reply. */
export const MAIL_ROUTES = ['scan-mailbox', 'forward', 'myepo'] as const
/** One route of `MAIL_ROUTES`. */
export type MailRoute = (typeof MAIL_ROUTES)[number]

const intakeRow: Parse<IntakeRow> = (value, path) => {
  const source = objectAt(value, path)
  return {
    document: ids.document(source['document'], `${path}.document`),
    status: queueStatus(source, path),
    code: nullable(str)(source['code'], `${path}.code`),
    office: nullable(str)(source['office'], `${path}.office`),
    matter: nullable(matterRef)(source['matter'], `${path}.matter`),
    matterCount: num(source['matterCount'], `${path}.matterCount`),
    route: oneOf(MAIL_ROUTES)(source['route'], `${path}.route`),
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
  /** How the letter came: from the firm's scan mailbox or the firm's MyEPO Mailbox (no forwarder), or forwarded by a person. */
  readonly route: MailRoute
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

const entry = obj({
  codes: arrayOf(obj({ code: str, form: str, title: obj({ en: str, de: str }) })),
  read: nullable(obj({ documentDate: nullable(isoDate), applicationNumber: nullable(str), fileNumber: nullable(ids.fileNumber) })),
})
/**
 * The hand entry of a letter with no office event code: the office events that a person may enter, each with its title
 * in English and German, and what reader 1 read of the letter (`read`, with the matter that its application number
 * names), or null when it read nothing.
 */
export type HandEntry = Parsed<typeof entry>

const intakeDocument: Parse<IntakeDocument> = (value, path) => {
  const source = objectAt(value, path)
  const rest = obj({
    document: ids.document, fileName: str, mediaType: str, pages: nullable(num), since: isoTime,
    mail: obj({ route: oneOf(MAIL_ROUTES), forwarder: nullable(person), receivedAt: isoTime, subject: str }),
    code: nullable(str), office: nullable(str), documentDate: nullable(isoDate), applicationNumber: nullable(str),
    fields: partialRecord(READER_FIELDS, fieldValue),
    proposed: nullable(obj({ fileNumber: ids.fileNumber, title: str, client: str, responsible: nullable(person), matchedBy: oneOf(['application-number', 'reference']) })),
    candidates: num,
    filed: nullable(matterRef),
    officeEvent: nullable(obj({ id: ids.officeEvent, state: deadlineState })),
    period: letterPeriod,
    matters: arrayOf(matterRef),
    mayDecide,
    activity,
    readers,
    pageImages: arrayOf(pageImage),
    marks: arrayOf(mark),
    nextConfirmer: nullable(obj({ person, queued: bool })),
    deadline: nullable(obj({ id: ids.deadline, due: isoDate, state: deadlineState, confirmer: nullable(person) })),
  })(value, path)
  const hand = source['entry'] === undefined ? null : nullable(entry)(source['entry'], `${path}.entry`)
  return { ...rest, status: queueStatus(source, path), entry: hand }
}
/** One letter of intake with its reading, the proposed matter, the matters the person may pick, and Activity. */
export interface IntakeDocument {
  readonly document: DocumentId
  readonly fileName: string
  readonly mediaType: string
  readonly pages: number | null
  readonly status: QueueStatus
  readonly since: IsoTime
  readonly mail: { readonly route: MailRoute; readonly forwarder: Person | null; readonly receivedAt: IsoTime; readonly subject: string }
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
    /** The key that found the matter: the application number of an office form, or the firm's reference. */
    readonly matchedBy: 'application-number' | 'reference'
  } | null
  /** Matters that the person may see whose file number is the letter's reference: 0 or 1 in R1. */
  readonly candidates: number
  readonly filed: MatterRef | null
  readonly officeEvent: { readonly id: OfficeEventId; readonly state: DeadlineState } | null
  /** The period that the letter sets, read or entered, or missing so that a person enters it; null when it needs none. */
  readonly period: LetterPeriod | null
  /** The "Other matter" picker: only matters the person may see, by file number. */
  readonly matters: readonly MatterRef[]
  readonly mayDecide: MayDecide
  readonly activity: readonly ActivityEvent[]
  /** Both readings: reader 1 from the text, reader 2 from the page image, and how they differ. */
  readonly readers: Readers
  /** The pages as images; empty for a letter stored before the intake sent them. */
  readonly pageImages: readonly PageImage[]
  /** The read values with their page and quote. */
  readonly marks: readonly Mark[]
  /**
   * Who gets Confirm the deadline when this person decides now; `queued` when that person keeps a queue. Null while no
   * matter is named.
   */
  readonly nextConfirmer: { readonly person: Person; readonly queued: boolean } | null
  /**
   * The deadline that the letter's office event made, with the owner of its open Confirm the deadline task
   * (`confirmer`); null before the engine proposed one.
   */
  readonly deadline: {
    readonly id: DeadlineId
    readonly due: IsoDate
    readonly state: DeadlineState
    readonly confirmer: Person | null
  } | null
  /**
   * The hand entry of a scan with no reading (`unreadable`), and of a filed letter whose office event waits with nothing read (a
   * MyEPO document code that the code table does not know); null for any other letter, or from an os without it.
   */
  readonly entry: HandEntry | null
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
const report = obj({
  proposalId: ids.proposal, kind: oneOf(['client-report', 'office-reply']), document: ids.document, fileName: str, state: reportState,
  templateName: nullable(str), language: nullable(str), statements: arrayOf(statement),
})
/** One proposed draft of the work: the client report or the reply to the office, with its statements. */
export type WorkDraft = Parsed<typeof report>
const letterReading = obj({
  readingId: ids.reading, pass: num, document: ids.document, language: oneOf(['de', 'en', 'fr']),
  state: oneOf(['proposed', 'approved', 'rejected', 'stale']), decidedBy: nullable(person), reason: nullable(str), noItemsReason: nullable(str),
  items: arrayOf(obj({ ground: str, claims: arrayOf(num), documents: arrayOf(str), reasoning: str, evidence: arrayOf(span) })),
  documents: arrayOf(obj({ label: str, publication: str, evidence: arrayOf(span) })),
})
/**
 * The agent's reading of an office letter, such as an Art. 94(3) EPC communication: one item for each objection with its
 * legal ground, claims, cited documents (D1, D2 …), reasoning in the letter's language and quotes, and the cited documents.
 */
export type LetterReading = Parsed<typeof letterReading>
/** The page images of the letter of a work item: absent (an os before them) reads as none. */
const pageImagesOrNone: Parse<readonly PageImage[]> = (value, path) => value === undefined ? [] : arrayOf(pageImage)(value, path)
/** The readings of an answer: absent (an os before readings) reads as none. */
const letterReadings: Parse<readonly LetterReading[]> = (value, path) => value === undefined ? [] : arrayOf(letterReading)(value, path)
const ticketDetail = obj({
  recordSeq: num,
  ticket: obj({
    id: ids.ticket, pass: num, state: ticketState, since: isoTime, routedTo: nullable(person), decidedBy: nullable(person),
    decidedAt: nullable(isoTime),
  }),
  matter: obj({ fileNumber: ids.fileNumber, title: str, client: str, formalitiesPerson: nullable(person) }),
  responsible: nullable(person),
  team: arrayOf(member),
  clientRules: nullable(clientRules),
  letter: nullable(obj({
    document: ids.document, fileName: str, pages: nullable(num), code: nullable(str), documentDate: nullable(isoDate),
    applicationNumber: nullable(str), source: nullable(oneOf(['text-layer', 'ocr'])), pageImages: pageImagesOrNone,
  })),
  reports: arrayOf(report),
  draftReply: nullable(report),
  clientReport: nullable(report),
  readings: letterReadings,
  deadline: nullable(obj({ id: ids.deadline, due: isoDate, state: deadlineState, confirmer: nullable(person) })),
  reply: nullable(obj({ state: outboxState, to: arrayOf(person) })),
  run: nullable(obj({ model: nullable(str), steps: nullable(num), finishedAt: nullable(isoTime), session: nullable(ids.session) })),
  mayDecide: workMayDecide,
  activity,
})
/**
 * One work item on a letter: the letter, the proposed drafts with their statements (`reports`, and the latest of each
 * kind as `clientReport` and `draftReply`), the agent's readings of the letter, the deadline, the reply.
 */
export type TicketDetail = Parsed<typeof ticketDetail>

// GET documents/<sha256>/text

const letterText = obj({ pages: arrayOf(str) })
/**
 * The text of a letter, one text for each page: its text layer, or the OCR text of a scan. Each span of the letter is a pair of
 * offsets into the text of its page.
 */
export type LetterText = Parsed<typeof letterText>

// GET my-work

const myMatter = obj({
  fileNumber: ids.fileNumber, title: str, client: str, applicationNumber: nullable(str), role: oneOf(['responsible', 'team']),
  state: oneOf(['open', 'closed']),
  nextDeadline: nullable(obj({ id: ids.deadline, due: isoDate, state: deadlineState })),
})
/** One matter of the person's teams, beside My work. */
export type MyMatter = Parsed<typeof myMatter>
const myWork = obj({
  recordSeq: num,
  person: member,
  summary: obj({ lettersArrived: num, lettersToFile: num, lettersWorked: num, needYou: num, overdue: num, today: num, later: num }),
  work: arrayOf(workItem),
  inSight: arrayOf(workItem),
  matters: arrayOf(myMatter),
})
/** The person's open tasks, the first line's counts, the tasks held in sight after an escalation, and the person's matters. */
export type MyWork = Parsed<typeof myWork>

// GET search?q=

const searchMatter = obj({
  fileNumber: ids.fileNumber, title: str, client: str, applicationNumber: nullable(str), state: oneOf(['open', 'closed']),
  responsible: nullable(person), formalitiesPerson: nullable(person),
  matched: arrayOf(obj({ field: oneOf(['fileNumber', 'title', 'client', 'applicationNumber', 'person']), value: str })),
})
/** One matter that a search found, with the fields that the words of the query matched. */
export type SearchMatter = Parsed<typeof searchMatter>
const searchAnswer = obj({ recordSeq: num, q: str, matters: arrayOf(searchMatter), more: bool })
/** The matters inside the person's walls that match a query, the exact file number first; `more` when the limit cut them. */
export type SearchAnswer = Parsed<typeof searchAnswer>

/** The parsers of every read, for tests and fixtures. */
export const parsers = {
  me, mattersList, matterDetail, deadlineDetail, intakeList, intakeDocument, ticketsList, ticketDetail, myWork, searchAnswer,
  letterText,
} as const

// Failures.

/**
 * Why a read or a command failed: no answer (`network`), a failure of the Records service or of a proxy before it
 * (`service`, a 5xx status), a refusal of the Records service (`refused`, a 4xx status with its code), an answer that
 * does not match the contract (`malformed`, with the path), or a request that the view stopped (`aborted`, never
 * shown).
 */
export type RecordsError =
  | { readonly kind: 'network' }
  | { readonly kind: 'service'; readonly status: number }
  | { readonly kind: 'refused'; readonly status: number; readonly code: string | null; readonly detail: string | null }
  | { readonly kind: 'malformed'; readonly path: string }
  | { readonly kind: 'aborted' }

/**
 * Whether the outcome of a failed command is unknown: with no answer or a service failure, the command may be
 * recorded, so a second try sends the same act; a refusal or a malformed answer recorded nothing.
 * @param error - the failure.
 * @returns true when the command may be recorded.
 */
export function outcomeUnknown(error: RecordsError): boolean {
  return error.kind === 'network' || error.kind === 'service'
}

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

/** A person's decision on one proposed reading of the letter. */
export interface ReadingDecision {
  readonly readingId: ReadingId
  readonly decision: 'accept' | 'reject'
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
  | {
    readonly kind: 'intake.file'
    readonly document: DocumentId
    readonly fileNumber: FileNumber
    readonly code: string
    readonly documentDate: IsoDate
    readonly applicationNumber: string
  }
  | { readonly kind: 'officeEvent.decide'; readonly id: OfficeEventId; readonly code: string; readonly documentDate: IsoDate; readonly applicationNumber: string }
  | { readonly kind: 'officeEvent.period'; readonly id: OfficeEventId; readonly months: number; readonly seen: number }
  | { readonly kind: 'officeEvent.noEvent'; readonly id: OfficeEventId; readonly reason: string }
  | { readonly kind: 'deadline.confirm'; readonly id: DeadlineId; readonly seen: number }
  | { readonly kind: 'deadline.reject'; readonly id: DeadlineId; readonly reason: string }
  | {
    readonly kind: 'ticket.decide'
    readonly id: TicketId
    readonly reports: readonly ReportDecision[]
    /** One decision for each proposed reading. */
    readonly readings: readonly ReadingDecision[]
    readonly deadlineCheck: DeadlineCheck
  }

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
    case 'intake.file': return {
      path: `intake/documents/${command.document}/file`,
      body: {
        fileNumber: command.fileNumber, code: command.code, documentDate: command.documentDate,
        applicationNumber: command.applicationNumber,
      },
    }
    case 'officeEvent.decide': return {
      path: `office-events/${command.id}/decide`,
      body: { code: command.code, documentDate: command.documentDate, applicationNumber: command.applicationNumber },
    }
    case 'officeEvent.period': return { path: `office-events/${command.id}/period`, body: { months: command.months, seen: command.seen } }
    case 'officeEvent.noEvent': return { path: `office-events/${command.id}/no-event`, body: { reason: command.reason } }
    case 'deadline.confirm': return { path: `deadlines/${command.id}/confirm`, body: { seen: command.seen } }
    case 'deadline.reject': return { path: `deadlines/${command.id}/reject`, body: { reason: command.reason } }
    case 'ticket.decide': return {
      path: `tickets/${command.id}/decide`,
      body: { reports: command.reports, readings: command.readings, deadlineCheck: command.deadlineCheck },
    }
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
  /**
   * Who gets Confirm the deadline when the person enters the office event of a scan on a matter now, before the filing
   * names the matter (`GET intake/documents/<sha256>?matter=<file number>`).
   * @param document - the scan.
   * @param fileNumber - the matter that the person picked.
   * @param signal - stops the read.
   * @returns the next confirmer, or null when the record names nobody.
   */
  nextConfirmer(document: DocumentId, fileNumber: FileNumber, signal: AbortSignal): Promise<Fetched<IntakeDocument['nextConfirmer']>>
  /**
   * The text of a letter inside the person's walls (`GET documents/<sha256>/text`); the os refuses 404 for a letter with no text.
   * The text stays in the view: it is never logged.
   * @param document - the letter.
   * @param signal - stops the read.
   * @returns the text of each page.
   */
  letterText(document: DocumentId, signal: AbortSignal): Promise<Fetched<LetterText>>
  tickets(signal: AbortSignal): Promise<Fetched<TicketsList>>
  ticket(id: TicketId, signal: AbortSignal): Promise<Fetched<TicketDetail>>
  myWork(signal: AbortSignal): Promise<Fetched<MyWork>>
  /**
   * Find the matters inside the person's walls whose file number, title, client, application number or team person
   * matches each word of the query (`GET search`).
   * @param query - 1 to 100 characters; the os refuses an empty or longer query.
   * @param signal - stops the read.
   * @returns the matters found, at most 20, and whether more match.
   */
  search(query: string, signal: AbortSignal): Promise<Fetched<SearchAnswer>>
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
  /**
   * The address of one page image of a letter.
   * @param href - the page's path from the answer.
   * @returns the same-origin address; empty until the Records API address is known.
   */
  pageHref(href: PageHref): string
}

/**
 * The failure of a non-2xx answer: a service failure for a 5xx status, else a refusal with the code and detail when
 * the body is the os refusal JSON.
 * @param response - the answer.
 * @returns the failure.
 */
async function refusal(response: Response): Promise<RecordsError> {
  if (response.status >= 500) return { kind: 'service', status: response.status }
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

/** The matters that one search shows; the os answers `more` when others match. */
const SEARCH_LIMIT = 20

/**
 * Create the Records API client.
 * @param recordsHref - the Records service as a document-relative path ending in `/`, such as `records/`, or the
 * promise of it while the Host has not answered; a promise of null (no Records service) fails every request with no
 * answer (`network`), and `contentHref` is empty until it resolves.
 * @param fetchImpl - the fetch to use; the global fetch by default.
 * @returns the client.
 */
export function createRecordsApi(
  recordsHref: string | Promise<string | null>, fetchImpl: typeof fetch = (input, init) => globalThis.fetch(input, init),
): RecordsApi {
  let known: string | null = typeof recordsHref === 'string' ? `${recordsHref}api/` : null
  const baseOf = typeof recordsHref === 'string'
    ? Promise.resolve(known)
    : recordsHref.then((href) => {
      known = href === null ? null : `${href}api/`
      return known
    })
  /** Fetch a path under the base, or reject as no answer when there is no Records service. */
  const fetchAt = async (path: string, init: RequestInit): Promise<Response> => {
    const base = await baseOf
    if (base === null) throw new TypeError('records: no Records service')
    return fetchImpl(`${base}${path}`, init)
  }
  const get = <T>(path: string, parse: Parse<T>, signal: AbortSignal): Promise<Fetched<T>> => exchange(
    () => fetchAt(path, { credentials: 'include', cache: 'no-store', headers: { accept: 'application/json' }, signal }),
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
    nextConfirmer: (document, fileNumber, signal) => get(
      `intake/documents/${document}?matter=${encodeURIComponent(fileNumber)}`, (value, path) => intakeDocument(value, path).nextConfirmer, signal,
    ),
    letterText: (document, signal) => get(`documents/${document}/text`, letterText, signal),
    tickets: signal => get('tickets', ticketsList, signal),
    ticket: (id, signal) => get(`tickets/${id}`, ticketDetail, signal),
    myWork: signal => get('my-work', myWork, signal),
    search: (query, signal) => get(`search?q=${encodeURIComponent(query)}&limit=${SEARCH_LIMIT}`, searchAnswer, signal),
    perform: (act, signal) => {
      const { path, body } = commandRequest(act.command)
      return exchange(
        () => fetchAt(path, {
          method: 'POST', credentials: 'include', cache: 'no-store', signal: signal ?? null,
          headers: { 'content-type': 'application/json', accept: 'application/json', 'idempotency-key': act.key },
          body: JSON.stringify(body),
        }),
        () => Promise.resolve(null),
        signal,
      )
    },
    contentHref: document => known === null ? '' : `${known}documents/${document}/content`,
    pageHref: href => known === null ? '' : `${known}${href}`,
  }
}
