/**
 * Vocabulary of the `flowleapRecord` seam: one matter's view as the Firm Record of flowleap-os answers it, with the
 * record position the view was read at, and why a view is not available. Types only.
 * @module @deepseek-ai/dsh-flowleap-record/types
 */

import type { Branded, BrandedNumber } from '@deepseek-ai/dsh-brand'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** One matter's view from the Firm Record; a runtime reads, it never writes a decision. */
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
  /** The responsible attorney. */
  readonly responsible: string
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

/** The view of one matter at one record position. */
export interface MatterView {
  readonly recordSeq: RecordSeq
  readonly viewHash: ViewHash
  readonly matter: MatterSummary
  readonly deadlines: DeadlineView[]
}

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

/** Service Definition of the seam: the Firm Record as a runtime reads it. */
export interface FlowleapRecord {
  /**
   * Read the current view of one matter.
   * @param fileNumber - the matter's file number.
   * @param signal - ends the read; the provider rejects when it fires.
   * @returns the view at the record position it was read at, or the refusal.
   */
  matterView(fileNumber: MatterFileNumber, signal: AbortSignal): Promise<MatterViewResult>
}
