/**
 * The Ticket delivery: the signed body that the Work router of the Firm Record posts to wake the routed person's
 * runtime for one Ticket pass. Types only.
 * @module @deepseek-ai/dsh-experimental-flowleap-ticket/types
 */

import type {
  DeadlineId, DeadlineState, DocumentSha256, LocalDate, MatterFileNumber, RecordSeq, TicketId,
} from '@deepseek-ai/dsh-flowleap-record'

/** One office event of the Ticket. */
export interface TicketEvent {
  /** The record seq of the office event. */
  readonly officeEventSeq: RecordSeq
  /** The versioned event code, such as `EPO:R71(3)`; it selects the task type and its Mandate. */
  readonly code: string
  /** The date the document bears. */
  readonly documentDate: LocalDate
  readonly applicationNumber: string
  /** The SHA-256 of the office letter. */
  readonly document: DocumentSha256
}

/** The deadline of the event as the record holds it when the Work router wakes the runtime. */
export interface TicketDeadline {
  readonly id: DeadlineId
  readonly state: DeadlineState
  readonly due: LocalDate
}

/** The body of `POST <path>` from the Work router. */
export interface TicketDelivery {
  readonly ticketId: TicketId
  /** The pass number, from 1; the delivery id is `<ticketId>/<pass>`. */
  readonly pass: number
  readonly matter: { readonly fileNumber: MatterFileNumber; readonly title: string }
  /** The office events of the Ticket, at least one. */
  readonly events: readonly [TicketEvent, ...TicketEvent[]]
  /** The deadline of the event, or `null` when the record has none yet. */
  readonly deadline: TicketDeadline | null
  /** The record position the Work router read the Ticket at. */
  readonly recordSeq: RecordSeq
}

/** The provider kind of a Ticket delivery in the webhook runtime. */
export type TicketDeliveryKind = 'flowleap-ticket'

declare module '@deepseek-ai/dsh-webhook' {
  interface WebhookEventMap {
    'flowleap-ticket': TicketDelivery
  }
}
