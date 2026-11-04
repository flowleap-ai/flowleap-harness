/**
 * The Firm Record of flowleap-os in the harness. This entry is a Consumer of the `flowleapRecord` seam: the function
 * plugin registers the read-only `record_read` tool, whose JSON result names the record position (`recordSeq`) and the
 * view hash, so the Session log holds the position a model answer rests on. The Service Definition is in
 * `./types.ts`; the http Provider is the `./http` entry; the run tools of a Ticket run are the `./run` entry.
 * @module @deepseek-ai/dsh-flowleap-record
 */

import type { Context } from '@deepseek-ai/cordis'
import { registerRecordReadTool } from './tool.ts'

export type {
  ClientAiLetters, ClientAiUse, ClientRules, DeadlineId, DeadlineState, DeadlineSummary, DeadlineView, DocumentSha256,
  DocumentSpan, DocumentText, DocumentView, FlowleapRecord, LocalDate, MatterFileNumber, MatterState, MatterSummary, MatterView,
  MatterViewBase, MatterViewR1, MatterViewRefusal, MatterViewResult, OfficeEventId, OfficeEventView, OutboxId,
  ProposalId, RecordCommandError, RecordCommandRefusal, RecordCommandResult, RecordSeq, ReportProposal, ReportReceipt,
  ReportStatement, RuleId, RunFinish, RunFinishReceipt, RunStart, RunStartReceipt, StatementEvidence,
  SummaryDeadlineState, TicketId, TicketState, TicketSummary, TraceStep, ViewHash,
} from './types.ts'
export { parseFileNumber, RECORD_READ_NAME, refusal, registerRecordReadTool } from './tool.ts'
export type { RecordReadError, RecordReadRefusal, RecordReadResult } from './tool.ts'

/** Cordis plugin name. */
export const name = 'flowleap-record'

/** Required services: the tool registry and the seam. */
export const inject = ['tools', 'flowleapRecord']

/**
 * Register `record_read`; disposing the plugin removes it.
 * @param ctx - the mounting context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => registerRecordReadTool(ctx), 'flowleap-record: record_read')
}
