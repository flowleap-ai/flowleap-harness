/**
 * Vocabulary of the `flowleapRecord` seam: one matter's view as the Firm Record of flowleap-os answers it, with the
 * record position the view was read at, the work of the token's person (work items and matters), the three run
 * commands of a Ticket run (run started, report proposed, run finished), and why a read or a command is refused.
 * Types only.
 * @module @deepseek-ai/dsh-flowleap-record/types
 */

import type { Branded, BrandedNumber } from '@deepseek-ai/dsh-brand'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /**
     * The Firm Record as a runtime uses it: one matter's view, the work of the runtime's person, and the run commands
     * of a Ticket routed to the runtime's person. A runtime proposes and reports; it never writes a decision.
     */
    flowleapRecord: FlowleapRecord
  }
}

/** A matter's file number as the firm writes it, such as `FL-2026-0001`; parsed from model input by the tool. */
export type MatterFileNumber = Branded<'MatterFileNumber'>

/** Id of a deadline in the Firm Record. */
export type DeadlineId = Branded<'DeadlineId'>

/** Id of a rule of `flowleap-deadlines`, such as `ep.r71-3.grant-communication`. */
export type RuleId = Branded<'RuleId'>

/** Position in the record log: the `seq` of the newest record event the view includes. */
export type RecordSeq = BrandedNumber<'RecordSeq'>

/** SHA-256 of the canonical JSON of the view without the hash, as lower-case hex. */
export type ViewHash = Branded<'ViewHash'>

/** A calendar date `YYYY-MM-DD`. */
export type LocalDate = Branded<'LocalDate'>

/** Whether the firm still works the matter. */
export type MatterState = 'open' | 'closed'

/** The R0 subset of the deadline state machine: a proposal becomes active when a person confirms it, or rejected. */
export type DeadlineState = 'proposed' | 'active' | 'rejected'

/** One step of the deadline engine's computation, with the legal citation that justifies it. */
export interface TraceStep {
  /** `delivery`, `start`, `add-period`, `month-end`, or `closure-roll`; a later engine version may add an operation. */
  readonly op: string
  readonly from: LocalDate
  readonly to: LocalDate
  /** The legal basis of the step, such as `R.131(2) EPC`. */
  readonly cite: string
}

/** The matter as the record projects it. */
export interface MatterSummary {
  readonly fileNumber: MatterFileNumber
  readonly title: string
  readonly client: string
  /**
   * The display name of the responsible attorney; `null` while that person has no display name, as before the
   * firm's sign-in gives names. A matter always has a responsible attorney; the view never names one by the sign-in.
   */
  readonly responsible: string | null
  /** The application number as the firm recorded it, for example `EP24166597`; `null` when the record holds none. */
  readonly applicationNumber: string | null
  readonly state: MatterState
}

/** One deadline of the matter. */
export interface DeadlineView {
  readonly id: DeadlineId
  readonly ruleId: RuleId
  readonly ruleVersion: number
  readonly due: LocalDate
  readonly state: DeadlineState
  readonly trace: TraceStep[]
}

/** Id of a Ticket: one run case per application and day (atlas sheet 3). */
export type TicketId = Branded<'TicketId'>

/** Id of an office event in the Firm Record. */
export type OfficeEventId = Branded<'OfficeEventId'>

/** SHA-256 of a document's bytes as lower-case hex; the Firm Record keys every document by it. */
export type DocumentSha256 = Branded<'DocumentSha256'>

/** Id of a proposal in the Firm Record. */
export type ProposalId = Branded<'ProposalId'>

/** Id of a reading of a letter in the Firm Record. */
export type ReadingId = Branded<'ReadingId'>

/** Id of an outbox item (a reply that the mailbox sends at most once). */
export type OutboxId = Branded<'OutboxId'>

/** Whether the client allows AI on its matters (atlas sheet 4, `client.aiUse`). */
export type ClientAiUse = 'not-recorded' | 'allowed' | 'local-model-only' | 'not-allowed'

/** Whether the client allows AI drafts of letters to it (atlas sheet 4, `client.aiLetters`). */
export type ClientAiLetters = 'allowed' | 'not-allowed'

/** The latest client rules of the matter's client, as a person recorded them. */
export interface ClientRules {
  /** The record seq of the `client/rules-recorded` event; a report proposal names it as `rulesSeq`. */
  readonly seq: RecordSeq
  readonly aiUse: ClientAiUse
  readonly aiLetters: ClientAiLetters
  /** The office event codes that need a report to the client, or all office actions. */
  readonly reportEvents: 'all-office-actions' | string[]
  /** The language of letters to the client. */
  readonly language: 'de' | 'en'
  /** The client's wishes in plain language. */
  readonly text: string
}

/** One office event of the matter. */
export interface OfficeEventView {
  readonly id: OfficeEventId
  /** The record seq of the event that recorded it. */
  readonly seq: RecordSeq
  /** The versioned event code, such as `EPO:R71(3)`; `null` for a letter the intake filed before a person or reader decided its code. */
  readonly code: string | null
  /** The date the document bears; `null` for a letter the intake filed before its date was read. */
  readonly documentDate: LocalDate | null
  /** The application number; `null` for an event that a person recorded without a document. */
  readonly applicationNumber: string | null
  /** The document of the event; `null` for an event that a person recorded without a document. */
  readonly document: DocumentSha256 | null
  /** The state of the office-event machine of atlas sheet 2, such as `observed`. */
  readonly state: string
}

/** The states of the Ticket machine of atlas sheet 3. */
export type TicketState =
  | 'opened' | 'no_person' | 'routed' | 'observed' | 'by_hand' | 'waking' | 'running' | 'run_failed'
  | 'proposals_ready' | 'decided' | 'cancelled'

/** One Ticket of the matter. */
export interface TicketSummary {
  readonly id: TicketId
  /** The pass number; a later event after the end of a Ticket opens the next pass. */
  readonly pass: number
  readonly state: TicketState
  /** The display name of the routed person; `null` before routing. */
  readonly routedTo: string | null
}

/** One document in the e-file of the matter. */
export interface DocumentView {
  readonly sha256: DocumentSha256
  readonly fileName: string
  readonly mediaType: string
  /** Where the document came from, such as `mail` or `agent`. */
  readonly source: string
}

/** The fields of the view that every Firm Record answers, R0 included. */
export interface MatterViewBase {
  readonly recordSeq: RecordSeq
  readonly viewHash: ViewHash
  readonly matter: MatterSummary
  readonly deadlines: DeadlineView[]
}

/** The fields that a Firm Record of R1 or later adds to the view; an R0 Firm Record answers none of them. */
export interface MatterViewR1 {
  /** The latest client rules, or `null` when no person recorded them (a run then does not start). */
  readonly clientRules: ClientRules | null
  readonly officeEvents: OfficeEventView[]
  readonly tickets: TicketSummary[]
  readonly documents: DocumentView[]
}

/**
 * The view of one matter at one record position. A Firm Record of R1 or later answers all four R1 fields; an R0 Firm
 * Record answers none, and the view then has none of them, never an empty list in their place, because the R0 record
 * does not hold the client rules, office events, Tickets, or documents at all.
 */
export type MatterView = MatterViewBase & (MatterViewR1 | { readonly [K in keyof MatterViewR1]?: never })

/** Why a view is not available. */
export type MatterViewRefusal =
  /** No matter with this file number inside the reader's wall. */
  | 'not_found'
  /** No Firm Record address is configured, for example in a local run. */
  | 'not_configured'
  /** The runtime's record token is not set. */
  | 'no_key'
  /** The Firm Record refused the token (HTTP 401 or 403). */
  | 'refused'
  /** The connection failed, the service redirected, or the answer did not arrive in time. */
  | 'unreachable'
  /** The Firm Record answered with an HTTP error status other than 401, 403, and 404. */
  | 'service_error'
  /** The Firm Record answered with a body that is not a matter view. */
  | 'invalid_answer'

/** The view, or why it is not available; never a made-up view. */
export type MatterViewResult = MatterView | { readonly error: MatterViewRefusal }

/** Id of a person in the Firm Record: an Entra object ID, or `admin` for the local administrator. */
export type PersonId = Branded<'PersonId'>

/** The person that the runtime's record token names. */
export interface MyWorkPerson {
  readonly id: PersonId
  /** The display name; `null` while the person has no display name yet. */
  readonly name: string | null
}

/** How the person stands in a matter. */
export type MatterRole = 'responsible' | 'team'

/** The earliest proposed or active deadline of a matter. */
export interface NextDeadline {
  readonly id: DeadlineId
  readonly due: LocalDate
  /** Here a deadline is `deadline_proposed` (a person has not confirmed it) or `active`. */
  readonly state: 'deadline_proposed' | 'active'
}

/** One matter inside the person's walls. */
export interface MyWorkMatter {
  readonly fileNumber: MatterFileNumber
  readonly title: string
  readonly client: string
  /** The application number as the firm recorded it, for example `EP24166597`; `null` when the record holds none. */
  readonly applicationNumber: string | null
  readonly role: MatterRole
  readonly state: MatterState
  /** `null` when the matter has no proposed or active deadline. */
  readonly nextDeadline: NextDeadline | null
}

/** The matter of a work item, with the title that a person reads. */
export interface WorkMatter {
  readonly fileNumber: MatterFileNumber
  readonly title: string
}

/**
 * The task kinds of the first demo (atlas sheet 0, the task map) that the Firm Record lists today. A later Firm Record may
 * list more; see {@link WorkKind}.
 */
export type KnownWorkKind =
  | 'file-letter' | 'enter-office-event' | 'decide-office-event' | 'enter-date' | 'confirm-deadline' | 'restart-run' | 'decide-work' | 'send-report'

/** The state of an open task: with its owner, in the queue that its owner keeps, past its due time, or past its whole chain. */
export type TaskState = 'assigned' | 'queued' | 'escalated' | 'alarm'

/** The group of My work: by the earlier of the task's due time and the end of its legal date, in the firm's time zone. */
export type WorkGroup = 'overdue' | 'today' | 'later'

/**
 * The kind of a work item. The union is merge-extensible: a Firm Record that has new features lists new kinds without a
 * change of the runtime, so any string is a kind. Code that switches on a kind handles the {@link KnownWorkKind}
 * literals and treats every other kind through the common fields of {@link WorkItem}, never as an error.
 */
export type WorkKind = KnownWorkKind | (string & {})

/**
 * One open task of the person. Every kind has these fields, so a reader needs no knowledge of the kind. A Firm Record of
 * schema 9 or earlier has no task, so `task`, `state`, `group` and `dueAt` are absent in its answer.
 */
export interface WorkItem {
  /** `<kind>:<object id>`. */
  readonly id: string
  /** The task id. */
  readonly task?: string
  readonly state?: TaskState
  readonly group?: WorkGroup
  /** The task's own due time, as an ISO 8601 timestamp; `due` is the legal date. */
  readonly dueAt?: string
  readonly kind: WorkKind
  /** What the person does, in plain words. */
  readonly title: string
  /** Why this work is the person's, in plain words. */
  readonly why: string
  /** `null` when the work has no matter that the person may see, such as a letter with no proposed matter. */
  readonly matter: WorkMatter | null
  /** The legal date when there is one; otherwise `null`. */
  readonly due: LocalDate | null
  /** When the task opened, as an ISO 8601 timestamp. */
  readonly since: string
  /** The address in the Records app where the person acts, such as `deadline/<id>`, `work/<id>`, or `intake/waiting/<sha256>`. */
  readonly act: string
}

/**
 * The work of the person that the runtime's record token names, at one record position. It holds only what that person
 * may see. The runtime never gives a person id: the token names the person.
 */
export interface MyWork {
  readonly recordSeq: RecordSeq
  readonly person: MyWorkPerson
  /** The first line of My work; absent from a Firm Record of schema 9 or earlier. */
  readonly summary?: MyWorkSummary
  /** The person's open tasks, the next step first: by the earlier of the task's due time and the end of its legal date. */
  readonly work: WorkItem[]
  /** The open tasks that the person held before they escalated to the next person of their chain. */
  readonly inSight?: WorkItem[]
  /** The matters inside the person's walls, the matter with the nearest due date first; the context beside `work`. */
  readonly matters: MyWorkMatter[]
}

/** "N letters arrived, M need you": the letters stored today that the person may see, and the person's open tasks by group. */
export interface MyWorkSummary {
  readonly lettersArrived: number
  readonly needYou: number
  readonly overdue: number
  readonly today: number
  readonly later: number
}

/** Why the work is not available; the same reasons as for a view, except that no matter is looked up. */
export type MyWorkRefusal = Exclude<MatterViewRefusal, 'not_found'>

/** The work, or why it is not available; never made-up work. */
export type MyWorkResult = MyWork | { readonly error: MyWorkRefusal }

/**
 * A place in the page text of a document, as a run names it. The Firm Record finds the quote on the page and stores the
 * offsets itself, so a run sends no offsets.
 */
export interface DocumentSpan {
  /** Page number, from 1. */
  readonly page: number
  /** The text of the place, copied character for character from the page text; 1 to 200 characters. */
  readonly quote: string
}

/** The text layer of a document of the record: the text of each page, in page order. */
export interface DocumentText {
  /** The text of each page; `pages[0]` is page 1. */
  readonly pages: readonly string[]
}

/** The source of one statement of a report: a document of the record and the exact place in its page text. */
export interface StatementEvidence {
  readonly document: DocumentSha256
  readonly span: DocumentSpan
}

/** One statement of a report letter with its sources; a statement without a source is refused. */
export interface ReportStatement {
  readonly text: string
  readonly evidence: readonly [StatementEvidence, ...StatementEvidence[]]
}

/** `POST tickets/<id>/run-started`: the run chat of the Ticket opened. */
export interface RunStart {
  readonly session: SessionId
}

/**
 * What a proposed letter is: the report to the client, or the draft reply to the office. The client's `aiLetters` rule
 * applies to a client report only, and an accepted office reply opens no task to send it.
 */
export type ReportKind = 'client-report' | 'office-reply'

/** `POST tickets/<id>/reports`: a letter of the run, proposed for the attorney's decision. */
export interface ReportProposal {
  readonly kind: ReportKind
  /** The file name of the letter, such as `report-r71-3.docx`. */
  readonly fileName: string
  /** The `.docx` bytes; the Firm Record takes at most 5 MiB. */
  readonly content: Uint8Array
  /** The file name of the firm template the letter is on, which the Records app shows. */
  readonly templateName: string
  /** The version of the firm template the letter is on, `sha256:<hex>` of the template file. */
  readonly templateVersion: string
  /** The record seq of the client rules the letter follows. */
  readonly rulesSeq: RecordSeq
  readonly statements: readonly [ReportStatement, ...ReportStatement[]]
  readonly session: SessionId
  /** The id of the tool call that proposed the letter; a call inside a PTC program has its own id, not the root call id. */
  readonly toolCall: ToolCallId
}

/** The language of a letter, which a reading keeps for its reasoning; a quote is never translated. */
export type ReadingLanguage = 'de' | 'en' | 'fr'

/** One objection of the examiner in a reading of a letter: what the examiner said, with the passages that say it. */
export interface ReadingItem {
  /** The legal ground, such as `Art. 84 EPC: clarity`. */
  readonly ground: string
  /** The numbers of the claims that the objection concerns. */
  readonly claims: readonly number[]
  /** The labels of the cited documents that the objection uses, such as `D1`. */
  readonly documents: readonly string[]
  /** The examiner's reasoning in short, in the language of the letter. */
  readonly reasoning: string
  readonly evidence: readonly [DocumentSpan, ...DocumentSpan[]]
}

/** A document that the letter cites, with its publication number as the letter prints it. */
export interface ReadingDocument {
  /** `D1`, `D2` and so on. */
  readonly label: string
  readonly publication: string
  readonly evidence: readonly [DocumentSpan, ...DocumentSpan[]]
}

/**
 * `POST tickets/<id>/readings`: the run's reading of an office letter, for the attorney's decision. No argument and no draft:
 * only what the letter says, each passage found in the stored text layer of `document`.
 */
export interface ReadingProposal {
  /** The SHA-256 of the office letter, the document of an office event of the Ticket. */
  readonly document: DocumentSha256
  readonly language: ReadingLanguage
  readonly items: readonly ReadingItem[]
  readonly documents: readonly ReadingDocument[]
  /** Why a reading has no objection, such as a letter that holds only the cover form; `null` when it has objections. */
  readonly noItemsReason: string | null
  readonly session: SessionId
  readonly toolCall: ToolCallId
}

/** The Firm Record checked each passage and appended `reading/proposed`. */
export interface ReadingReceipt {
  readonly readingId: ReadingId
  readonly recordSeq: RecordSeq
}

/** The state of the deadline that a run read, or `none-yet` when the event has no deadline in the record. */
export type SummaryDeadlineState = DeadlineState | 'none-yet'

/** The deadline summary that ends a run: what the run read about the deadline of the event. */
export type DeadlineSummary =
  | { readonly id: DeadlineId; readonly state: DeadlineState; readonly seq: RecordSeq }
  | { readonly id: 'none-yet'; readonly state: 'none-yet'; readonly seq: RecordSeq }

/** `POST tickets/<id>/finish`: the run ends with its proposals and the deadline summary. */
export interface RunFinish {
  readonly session: SessionId
  readonly deadline: DeadlineSummary
}

/** The Firm Record appended `ticket/run-started`. */
export interface RunStartReceipt {
  /** The seq of the last event the command appended. */
  readonly recordSeq: RecordSeq
}

/** The Firm Record stored the letter and appended `report/proposed`. */
export interface ReportReceipt {
  readonly proposalId: ProposalId
  /** The SHA-256 of the stored letter. */
  readonly document: DocumentSha256
  readonly recordSeq: RecordSeq
}

/**
 * The Firm Record appended `ticket/proposals-ready` and composed one reply with the proposed letters attached as drafts
 * to the forwarder of the office letter and the routed person; it sends to firm addresses only, never to the client.
 */
export interface RunFinishReceipt {
  readonly recordSeq: RecordSeq
  /**
   * The reply's outbox item: `queued` for the mailbox, or `refused` because a recipient is not a firm address; null when
   * no person forwarded the office letter (it came from the scan mailbox), so there is no reply.
   */
  readonly outbox: { readonly id: OutboxId; readonly state: 'queued' | 'refused' } | null
}

/** Why the Firm Record did not take a run command. */
export type RecordCommandRefusal =
  /** No Firm Record address is configured. */
  | 'not_configured'
  /** The runtime's record token is not set. */
  | 'no_key'
  /** The Firm Record refused the token (HTTP 401, or 403 without a known code). */
  | 'refused'
  /** The command is a decision; only a person decides (403 `agent-cannot-decide`). */
  | 'agent_cannot_decide'
  /** The Ticket is not routed to the token's person (403 `not-routed-person`). */
  | 'not_routed_person'
  /** No Ticket with this id (404). */
  | 'not_found'
  /** The Firm Record found the body invalid (400 `invalid-body`). */
  | 'invalid_body'
  /** `run-started` for a Ticket that is not `waking` (409 `ticket-not-waking`). */
  | 'ticket_not_waking'
  /** A report or finish for a Ticket that is not `running` (409 `ticket-not-running`). */
  | 'ticket_not_running'
  /** The client rules do not allow an AI draft of a client letter (409 `report.no-ai-draft-against-client-rule`). */
  | 'client_rule_forbids_ai_draft'
  /**
   * The client's AI wishes do not allow a model to read the letter, or the firm has no contract with the provider
   * (403 `ai-not-allowed`).
   */
  | 'client_rule_forbids_ai_read'
  /** A statement has no evidence (422 `report.statement-has-evidence`). */
  | 'statement_without_evidence'
  /** An evidence item has no span (422 `report.statement-has-span`). */
  | 'statement_without_span'
  /** A quote is not in the page text of the document (422 `report.quote-not-in-letter`). */
  | 'quote_not_in_letter'
  /** A quote is in the page text of the document more than once (422 `report.quote-ambiguous`). */
  | 'quote_ambiguous'
  /** A cited document is not filed on the Ticket's matter (422 `report.evidence-outside-matter`). */
  | 'evidence_outside_matter'
  /** A finish without a proposal of this Ticket and pass (409 `no-proposals`). */
  | 'no_proposals'
  /** The letter is larger than the Firm Record takes (413 `document-too-large`). */
  | 'document_too_large'
  /**
   * The Firm Record already took a command with the same Idempotency-Key and another body (409
   * `idempotency-key-reused`): a second finish of the run with another deadline summary, or a report of the same tool call
   * with another letter.
   */
  | 'idempotency_key_reused'
  /** The connection failed, the service redirected, or the answer did not arrive in time. */
  | 'unreachable'
  /** The Firm Record answered with another HTTP error. */
  | 'service_error'
  /** The Firm Record answered with a body that is not the command's receipt. */
  | 'invalid_answer'

/** A refused command, with the Firm Record's one-sentence detail when it gave one. */
export interface RecordCommandError {
  readonly error: RecordCommandRefusal
  readonly detail?: string
}

/** The receipt, or why the command was refused; never a made-up receipt. */
export type RecordCommandResult<T> = T | RecordCommandError

/** Service Definition of the seam: the Firm Record as a runtime uses it. */
export interface FlowleapRecord {
  /**
   * Read the current view of one matter.
   * @param fileNumber - the matter's file number.
   * @param signal - ends the read; the provider rejects when it fires.
   * @returns the view at the record position it was read at, or the refusal.
   */
  matterView(fileNumber: MatterFileNumber, signal: AbortSignal): Promise<MatterViewResult>
  /**
   * Read the work of the person that the runtime's record token names. The call has no person argument.
   * @param signal - ends the read; the provider rejects when it fires.
   * @returns the work and the matters of the person at the record position they were read at, or the refusal.
   */
  myWork(signal: AbortSignal): Promise<MyWorkResult>
  /**
   * Report that the run chat of a Ticket opened. A repeat with the same Ticket and Session is the same command.
   * @param ticket - the Ticket of the wake.
   * @param command - the Session of the run chat.
   * @param signal - ends the command; the provider rejects when it fires.
   * @returns the receipt, or the refusal.
   */
  runStarted(ticket: TicketId, command: RunStart, signal: AbortSignal): Promise<RecordCommandResult<RunStartReceipt>>
  /**
   * Propose a client report letter for the attorney's decision. A repeat with the same Ticket, Session, and tool call
   * is the same command.
   * @param ticket - the running Ticket.
   * @param command - the letter, its statements with evidence, and its sources.
   * @param signal - ends the command; the provider rejects when it fires.
   * @returns the receipt, or the refusal.
   */
  proposeReport(ticket: TicketId, command: ReportProposal, signal: AbortSignal): Promise<RecordCommandResult<ReportReceipt>>
  /**
   * Propose a reading of an office letter for the attorney's decision. A repeat with the same Ticket, Session, and tool call
   * is the same command.
   * @param ticket - the running Ticket.
   * @param command - the letter, its objections and cited documents with their passages, and the language.
   * @param signal - ends the command; the provider rejects when it fires.
   * @returns the receipt, or the refusal.
   */
  proposeReading(ticket: TicketId, command: ReadingProposal, signal: AbortSignal): Promise<RecordCommandResult<ReadingReceipt>>
  /**
   * Read the text layer of a document of the record, the text that a quote of a report must be copied from.
   * @param document - the SHA-256 of the document.
   * @param signal - ends the read; the provider rejects when it fires.
   * @returns the text of each page, or the refusal (`not_found` when the Firm Record has no text for the document).
   */
  documentText(document: DocumentSha256, signal: AbortSignal): Promise<RecordCommandResult<DocumentText>>
  /**
   * End the run with its proposals and the deadline summary. A repeat with the same Ticket and Session is the same
   * command.
   * @param ticket - the running Ticket.
   * @param command - the Session and the deadline summary.
   * @param signal - ends the command; the provider rejects when it fires.
   * @returns the receipt, or the refusal.
   */
  finishRun(ticket: TicketId, command: RunFinish, signal: AbortSignal): Promise<RecordCommandResult<RunFinishReceipt>>
}
