/** What the Office tools share. @module */

import type { FlowleapOffice } from '../types.ts'
import type { OfficeDeliveries } from './workspace.ts'

/** The services and settings of the Office tools. */
export interface OfficeToolDeps {
  /** The Office service. */
  readonly office: FlowleapOffice
  /** The written files of each call, for the delivery card. */
  readonly deliveries: OfficeDeliveries
  /** Absolute folder of the firm templates. */
  readonly templatesDir: string
  /** Author of tracked changes when a call names none. */
  readonly revisionAuthor: string
  /** Most characters of document text `office_read` returns. */
  readonly maxReadChars: number
  /** Largest input document or template, in bytes. */
  readonly maxInputBytes: number
  /** The clock of tracked-change dates. */
  readonly now: () => Date
}
