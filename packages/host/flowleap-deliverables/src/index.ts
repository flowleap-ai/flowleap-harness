/**
 * The FlowLeap deliverable tools (S5): `write_patent_results` with the IDE's
 * report templates, evidence validation, working record, evidence ledger and
 * delivery card (D1), and `export_draft_docx` and `inventor_questions` with the
 * IDE's Application Drafting layer and Word builders (D2), ported from
 * flowleap-agent-v2 onto the dsh seams. One row mounts the ledger recorder on
 * `tools/result`, the three tools on `ctx.tools`, the delivery card through
 * `deliverables/presented`, the second-read judge on `ctx.llm`, and the
 * one-time "report not written" steer on `agent/turn-stopping`.
 *
 * See packages/host/flowleap-deliverables/README.md.
 * @module @deepseek-ai/dsh-flowleap-deliverables
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-working-directory'
import { registerCompletionGuard, TurnTrackers } from './guard/steer.ts'
import { createJudge, NO_LLM_JUDGE, type SecondReadJudge } from './judge.ts'
import { registerRecorder, type RecorderMode } from './ledger/recorder.ts'
import { ledgerDomainSpec, ledgerPersistence, PatentLedger } from './ledger/store.ts'
import { PresentQueue, registerPresent } from './present.ts'
import { registerDeliverableTools } from './register.ts'
import { exportDraftDocxTool } from './tools/export-draft-docx.ts'
import { inventorQuestionsTool } from './tools/inventor-questions.ts'
import { writePatentResultsTool, type SecondReadMode } from './writer.ts'

export { DOCUMENT_MODE, hostPathOf, LOCAL_WORKSPACE_NEEDED, writeWorkspaceBytes } from './bytes.ts'
export type { BytesFileSystem } from './bytes.ts'
export {
  forgetRefusals, MAX_DRAFTING_FILE_BYTES, withoutEditorButtons, workspaceFiles,
} from './drafting/workspace.ts'
export type { DraftingFiles, DraftingWorkspaceOptions } from './drafting/workspace.ts'
export { checkPriorArtReportCompletion, GENERIC_WRITE_TOOLS, RETRIEVAL_TOOLS } from './guard/completion.ts'
export type { GuardRound, ReceiptFileReader, ReportCompletionTurn } from './guard/completion.ts'
export { receiptFileReader, registerCompletionGuard, TurnTrackers } from './guard/steer.ts'
export { STEER_SOURCE_KIND, TurnTracker } from './guard/turn-tracker.ts'
export { createJudge, NO_LLM_JUDGE, parseJudgeRoute, SECOND_READ_RETRY_DELAY, SECOND_READ_ROW_LIMIT } from './judge.ts'
export type { JudgeOptions, JudgeRoute, SecondReadJudge } from './judge.ts'
export {
  anchorLabel, anchorLabels, bareToolName, contentText, derivedSources, executionOf, registerRecorder, structuredSources,
} from './ledger/recorder.ts'
export type { RecordedOutcome, RecorderMode } from './ledger/recorder.ts'
export { ledgerDomainSpec, ledgerPersistence, PatentLedger } from './ledger/store.ts'
export type { LedgerPersistence, LedgerSessionRecord, NewPatentExecution } from './ledger/store.ts'
export * from './ledger/types.ts'
export { DELIVERED_LINE, PresentQueue, registerPresent } from './present.ts'
export { registerDeliverableTools } from './register.ts'
export * from './report/candidate-review.ts'
export * from './report/document-reference.ts'
export * from './report/fallback-ladder.ts'
export * from './report/find-better.ts'
export * from './report/provenance.ts'
export * from './report/receipt.ts'
export * from './report/second-read.ts'
export * from './report/templates.ts'
export { escape, escapeRegExpCharacters, sha256Hex } from './report/text.ts'
export { EXPORT_DRAFT_DOCX_DESCRIPTION, EXPORT_DRAFT_DOCX_NAME, EXPORT_DRAFT_DOCX_PARAMETERS, exportDraftDocxTool } from './tools/export-draft-docx.ts'
export {
  INVENTOR_QUESTIONS_DESCRIPTION, INVENTOR_QUESTIONS_NAME, INVENTOR_QUESTIONS_PARAMETERS, inventorQuestionsTool, parseInventorQuestionsArgs,
} from './tools/inventor-questions.ts'
export type { InventorQuestionsInput } from './tools/inventor-questions.ts'
export { delivered, isDraftingToolValue, matterArgument, openMatter, refused } from './tools/shell.ts'
export type { DraftingToolDependencies, DraftingToolValue } from './tools/shell.ts'
export {
  draftingNotAvailable, evidencePath, parseWriterArgs, secondReadPath, workingRecordPath, writePatentResultsTool,
} from './writer.ts'
export type { SecondReadMode, WritePatentResultsInput, WritePatentResultsValue, WriterDependencies } from './writer.ts'
export {
  DRAFTING_TEMPLATES, REPORT_TEMPLATES, WRITE_PATENT_RESULTS_DESCRIPTION, WRITE_PATENT_RESULTS_NAME, WRITE_PATENT_RESULTS_PARAMETERS,
} from './writer-schema.ts'

/** Cordis plugin name. */
export const name = 'flowleap-deliverables'

/** The tool registry the three tools join, and the filesystem and session directory every save runs under. */
export const inject = ['tools', 'fs', 'workingDirectory']

/** Plugin config. */
export interface Config {
  /**
   * How much of the second read the user sees: `off` disables it; `log` records the verdicts beside
   * the evidence companion and in the working record; `render` (the IDE default) also names in the
   * tool result what the independent read did not confirm. One model call per coverage row.
   */
  secondRead: SecondReadMode
  /** The `provider/model` route the second read judges with; empty means the session's own logged route. */
  secondReadModel: string
}

/** Runtime schema for the row. */
export const Config: z<Config> = z.object({
  secondRead: z.union(['off', 'log', 'render']).default('render'),
  secondReadModel: z.string().default(''),
})

/**
 * Mount the ledger, the recorder, the writer, the two drafting tools, the delivery card and the completion guard.
 * @param ctx - the mounting context, carrying `tools`, `fs` and `workingDirectory`.
 * @param config - the second-read mode and model.
 */
export function apply(ctx: Context, config: Config): void {
  const ledger = new PatentLedger()
  const trackers = new TurnTrackers()
  const present = new PresentQueue()
  const modes = new Map<RecorderMode, number>()
  let judge: SecondReadJudge = NO_LLM_JUDGE

  // The ledger persists when storage is mounted; a composition without it keeps the records in memory.
  ctx.inject(['storageDomain'], (storeCtx) => {
    storeCtx.effect(() => {
      const opened = storeCtx.storageDomain.open(ledgerDomainSpec)
        .then((domain) => { ledger.attach(ledgerPersistence(domain)); return domain })
        .catch((error: unknown) => {
          storeCtx.logger.warn(`flowleap-deliverables: ledger storage unavailable, records stay in memory: ${error instanceof Error ? error.message : String(error)}`)
          return undefined
        })
      return () => {
        ledger.attach(undefined)
        void opened.then(domain => domain?.close())
      }
    }, 'flowleap-deliverables: ledger storage')
  })
  // The judge needs a model service; without one every second read is a stated skip.
  ctx.inject(['llm'], (llmCtx) => {
    llmCtx.effect(() => {
      judge = createJudge(llmCtx, {
        ...config.secondReadModel.trim() ? { configuredModel: config.secondReadModel } : {},
        warn: (message) => { llmCtx.logger.warn(message) },
      })
      return () => { judge = NO_LLM_JUDGE }
    }, 'flowleap-deliverables: second-read judge')
  })

  registerRecorder(ctx, ledger, (mode, tool) => {
    const seen = modes.get(mode) ?? 0
    modes.set(mode, seen + 1)
    if (seen === 0) ctx.logger.info(`flowleap-deliverables: evidence ledger recording in ${mode} mode (first result from ${tool})`)
  })
  registerPresent(ctx, present, sessionId => trackers.openTurn(sessionId))
  registerCompletionGuard(ctx, trackers)
  ctx.on('session/disposed', (session) => { ledger.forget(session.id) })
  const log = {
    warn: (message: string) => { ctx.logger.warn(message) },
    info: (message: string) => { ctx.logger.info(message) },
  }
  ctx.effect(() => registerDeliverableTools(ctx, [
    writePatentResultsTool(ctx, { ledger, judge: () => judge, present, secondRead: () => config.secondRead, ...log }),
    exportDraftDocxTool(ctx, { present, ...log }),
    inventorQuestionsTool(ctx, { present, ...log }),
  ]), 'flowleap-deliverables: tools')
}
