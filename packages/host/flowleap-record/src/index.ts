/**
 * The Firm Record of flowleap-os in the harness. This entry is a Consumer of the `flowleapRecord` seam: the function
 * plugin registers the read-only `record_read` tool, whose JSON result names the record position (`recordSeq`) and the
 * view hash, so the Session log holds the position a model answer rests on, and the read-only `record_my_work` tool,
 * whose JSON result lists the work that waits for the person that the record token names, and the person's matters. The Service
 * Definition is in `./types.ts`; the http Provider is the `./http` entry; the run tools of a Ticket run are the `./run`
 * entry.
 * @module @deepseek-ai/dsh-flowleap-record
 */

import type { Context } from '@deepseek-ai/cordis'
import { registerRecordMyWorkTool } from './my-work-tool.ts'
import { registerRecordReadTool } from './tool.ts'

export type {
  ClientAiLetters, ClientAiUse, ClientRules, DeadlineId, DeadlineState, DeadlineSummary, DeadlineView, DocumentSha256,
  DocumentSpan, DocumentText, DocumentView, FlowleapRecord, KnownWorkKind, LocalDate, MatterFileNumber, MatterRole,
  MatterState, MatterSummary, MatterView, MatterViewBase, MatterViewR1, MatterViewRefusal, MatterViewResult, MyWork,
  MyWorkMatter, MyWorkPerson, MyWorkRefusal, MyWorkResult, MyWorkSummary, NextDeadline, OfficeEventId, OfficeEventView, OutboxId,
  PersonId, ProposalId, RecordCommandError, RecordCommandRefusal, RecordCommandResult, RecordSeq, ReportKind, ReportProposal,
  ReportReceipt, ReportStatement, RuleId, RunFinish, RunFinishReceipt, RunStart, RunStartReceipt, StatementEvidence,
  SummaryDeadlineState, TaskState, TicketId, TicketState, TicketSummary, TraceStep, ViewHash, WorkGroup, WorkItem, WorkKind, WorkMatter,
} from './types.ts'
export { parseFileNumber, RECORD_READ_NAME, refusal, registerRecordReadTool } from './tool.ts'
export { RECORD_MY_WORK_NAME, registerRecordMyWorkTool } from './my-work-tool.ts'
export type { RecordMyWorkError, RecordMyWorkResult } from './my-work-tool.ts'
export type { RecordReadError, RecordReadRefusal, RecordReadResult } from './tool.ts'

/** Cordis plugin name. */
export const name = 'flowleap-record'

/** Required services: the tool registry and the seam. */
export const inject = ['tools', 'flowleapRecord']

/**
 * Register `record_read` and `record_my_work`; disposing the plugin removes them.
 * @param ctx - the mounting context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => registerRecordReadTool(ctx), 'flowleap-record: record_read')
  ctx.effect(() => registerRecordMyWorkTool(ctx), 'flowleap-record: record_my_work')
}
