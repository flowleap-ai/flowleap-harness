/**
 * The Firm Record of flowleap-os in the harness. This entry is the Consumer of the `flowleapRecord` seam: the function
 * plugin registers the read-only `record_read` tool, whose JSON result names the record position (`recordSeq`) and the
 * view hash, so the Session log holds the position a model answer rests on. The Service Definition is in
 * `./types.ts`; the http Provider is the `./http` entry.
 * @module @deepseek-ai/dsh-flowleap-record
 */

import type { Context } from '@deepseek-ai/cordis'
import { registerRecordReadTool } from './tool.ts'

export type {
  DeadlineId, DeadlineState, DeadlineView, FlowleapRecord, LocalDate, MatterFileNumber, MatterState, MatterSummary, MatterView,
  MatterViewRefusal, MatterViewResult, RecordSeq, RuleId, TraceStep, ViewHash,
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
