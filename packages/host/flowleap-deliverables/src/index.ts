/**
 * The FlowLeap deliverable tools (S5): `write_patent_results` with the IDE's
 * report templates, evidence validation, working record, evidence ledger and
 * delivery card (D1), `export_draft_docx` and `inventor_questions` with the
 * IDE's Application Drafting layer and Word builders (D2), and
 * `start_application_draft`, `validate_draft` and `remove_claim` with the
 * attorney gates as question cards and slash commands (D3), ported from
 * flowleap-agent-v2 onto the dsh seams. One row mounts the ledger recorder on
 * `tools/result`, the six tools on `ctx.tools`, the delivery card through
 * `deliverables/presented`, the second-read judge on `ctx.llm`, the gate cards
 * on `ctx.userQuestions`, the claim-removal confirmation on `ctx.approval`,
 * the gate commands on `ctx.commands`, the one-time "report not written"
 * steer on `agent/turn-stopping`, the seal on delivered files (one steer
 * on the first direct edit of a saved report), and the office action work
 * pages: the `<report>.work.json` file of each `office-action-scaffold` save
 * and the `flowleapWorkPages` Remote that lists the pages and changes their
 * review fields.
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
import type {} from '@deepseek-ai/dsh-user-questions'
import type {} from '@deepseek-ai/dsh-user-approval'
import type {} from '@deepseek-ai/dsh-commands'
import { registerGateCommands } from './gates/commands.ts'
import type { GateApprover, GateAsker, GateSeams } from './gates/questions.ts'
import { DeliveredPaths, registerEditSeal } from './guard/seal.ts'
import { ConfirmedMarkets } from './report/markets.ts'
import { registerCompletionGuard, TurnTrackers } from './guard/steer.ts'
import { createJudge, NO_LLM_JUDGE, type SecondReadJudge } from './judge.ts'
import { registerRecorder, type RecorderMode } from './ledger/recorder.ts'
import { ledgerDomainSpec, ledgerPersistence, PatentLedger } from './ledger/store.ts'
import { PresentQueue, registerPresent } from './present.ts'
import { registerDeliverableTools } from './register.ts'
import { exportDraftDocxTool } from './tools/export-draft-docx.ts'
import { inventorQuestionsTool } from './tools/inventor-questions.ts'
import { removeClaimTool } from './tools/remove-claim.ts'
import { startApplicationDraftTool } from './tools/start-application-draft.ts'
import { validateDraftTool } from './tools/validate-draft.ts'
import { FlowleapWorkPagesController } from './work-page-controller.ts'
import { WorkPages, workPagesDomainSpec } from './work-page/store.ts'
import { writePatentResultsTool, type SecondReadMode } from './writer.ts'

export { DOCUMENT_MODE, hostPathOf, LOCAL_WORKSPACE_NEEDED, writeWorkspaceBytes } from './bytes.ts'
export type { BytesFileSystem } from './bytes.ts'
export {
  forgetRefusals, MAX_DRAFTING_FILE_BYTES, withoutEditorButtons, workspaceFiles,
} from './drafting/workspace.ts'
export type { DraftingFiles, DraftingWorkspaceOptions } from './drafting/workspace.ts'
export { checkPriorArtReportCompletion, GENERIC_WRITE_TOOLS, RETRIEVAL_TOOLS } from './guard/completion.ts'
export type { GuardRound, ReceiptFileReader, ReportCompletionTurn } from './guard/completion.ts'
export { ConfirmedMarkets, MARKETS_QUESTION_ID, UNCONFIRMED_MARKETS } from './report/markets.ts'
export { DeliveredPaths, DIRECT_EDIT_STEER, DIRECT_EDIT_TOOLS, editedPath, FAILED_EDIT_STEER, registerEditSeal } from './guard/seal.ts'
export { receiptFileReader, registerCompletionGuard, TurnTrackers } from './guard/steer.ts'
export { registerGateCommands } from './gates/commands.ts'
export type { GateCommandDependencies, GateCommandRegistry } from './gates/commands.ts'
export { GATE_COMMAND, GATE_LABEL, WAIVE_COMMAND, waiveChoices, waiveTarget, withGateFlag, withWaivers } from './gates/edits.ts'
export type { WaiveChoice } from './gates/edits.ts'
export {
  askGate, askWaiver, confirmRemoval, GATE_QUESTION_ID, NOT_YET, WAIVE_QUESTION_ID,
} from './gates/questions.ts'
export type { GateApprover, GateAsker, GateClosedReason, GateOutcome, GateSeams, RemovalConfirmation } from './gates/questions.ts'
export { decisionSourceText, GATE_RECORD_LABEL, gateRecordValue, recordGateDecision, recordWaivers, WAIVED_RECORD_LABEL } from './gates/record.ts'
export type { DecisionSource } from './gates/record.ts'
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
export * from './report/header-cells.ts'
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
export { REMOVE_CLAIM_DESCRIPTION, REMOVE_CLAIM_NAME, REMOVE_CLAIM_PARAMETERS, removalCost, removeClaimTool, parseRemoveClaimArgs, renumberingSentence } from './tools/remove-claim.ts'
export type { RemoveClaimInput } from './tools/remove-claim.ts'
export { delivered, gateSeams, isDraftingToolValue, matterArgument, NO_GATE_SEAMS, openMatter, refused } from './tools/shell.ts'
export type { DraftingToolDependencies, DraftingToolValue } from './tools/shell.ts'
export {
  approvedClaims, confirmedFeatureList, START_APPLICATION_DRAFT_DESCRIPTION, START_APPLICATION_DRAFT_NAME,
  START_APPLICATION_DRAFT_PARAMETERS, startApplicationDraftTool,
} from './tools/start-application-draft.ts'
export {
  offerWaivers, parseValidateDraftArgs, VALIDATE_DRAFT_DESCRIPTION, VALIDATE_DRAFT_NAME, VALIDATE_DRAFT_PARAMETERS, validateDraftTool,
} from './tools/validate-draft.ts'
export type { AdvisoryItem, ValidateDraftInput } from './tools/validate-draft.ts'
export {
  draftingPathRefusal, evidencePath, parseWriterArgs, secondReadPath, workingRecordPath, writePatentResultsTool,
} from './writer.ts'
export type { SecondReadMode, WritePatentResultsInput, WritePatentResultsValue, WriterDependencies } from './writer.ts'
export { FlowleapWorkPagesController } from './work-page-controller.ts'
export type { FlowleapWorkPagesControllerOptions } from './work-page-controller.ts'
export { claimNumbers, parseOfficeActionReport, plainText, responseOptions, tableCells } from './work-page/office-action.ts'
export {
  aboutText, MAX_NOTE_LENGTH, MAX_OWNER_LENGTH, memoryIndex, NEW_REVIEW, REVIEW_STATES, WorkPages, workPageFileSchema, workPageId,
  workPagePath, workPagesDomainSpec,
} from './work-page/store.ts'
export type { WorkPageEntry, WorkPageFileSystem, WorkPageIndex, WorkPageSave } from './work-page/store.ts'
export type * from './work-page/types.ts'
export {
  DRAFTING_TEMPLATES, REPORT_TEMPLATES, WRITE_PATENT_RESULTS_DESCRIPTION, WRITE_PATENT_RESULTS_NAME, WRITE_PATENT_RESULTS_PARAMETERS,
} from './writer-schema.ts'

/** Cordis plugin name. */
export const name = 'flowleap-deliverables'

/** The tool registry the six tools join, and the filesystem and session directory every save runs under. */
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
 * Mount the ledger, the recorder, the writer, the five drafting tools with their gates, the gate
 * commands, the delivery card and the completion guard.
 * @param ctx - the mounting context, carrying `tools`, `fs` and `workingDirectory`.
 * @param config - the second-read mode and model.
 */
export function apply(ctx: Context, config: Config): void {
  const ledger = new PatentLedger()
  const trackers = new TurnTrackers()
  const present = new PresentQueue()
  const delivered = new DeliveredPaths()
  const markets = new ConfirmedMarkets()
  const modes = new Map<RecorderMode, number>()
  let judge: SecondReadJudge = NO_LLM_JUDGE
  let ask: GateAsker | undefined
  let approve: GateApprover | undefined
  let approvalPolicy: GateSeams['approvalPolicy'] = () => undefined
  const gates: GateSeams = { ask: () => ask, approve: () => approve, approvalPolicy: session => approvalPolicy(session) }
  const workPages = new WorkPages(ctx.fs, () => { ctx.emit('flowleap-work-pages/changed') })

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
  // The work page index persists when storage is mounted; a composition without it lists the pages of this process only.
  ctx.inject(['storageDomain'], (storeCtx) => {
    storeCtx.effect(() => {
      const opened = storeCtx.storageDomain.open(workPagesDomainSpec)
        .then(async (domain) => { await workPages.attach(domain.table('pages')); return domain })
        .catch((error: unknown) => {
          storeCtx.logger.warn(`flowleap-deliverables: work page index storage unavailable, the index stays in memory: ${error instanceof Error ? error.message : String(error)}`)
          return undefined
        })
      return () => {
        void workPages.attach(undefined)
        void opened.then(domain => domain?.close())
      }
    }, 'flowleap-deliverables: work page index storage')
  })
  ctx.plugin(FlowleapWorkPagesController, { pages: workPages })
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

  // The gate cards need the user-questions answerer waterfall; without it every gate stays a file edit.
  ctx.inject(['userQuestions'], (askCtx) => {
    askCtx.effect(() => {
      ask = request => askCtx.userQuestions.ask(request)
      return () => { ask = undefined }
    }, 'flowleap-deliverables: gate question cards')
  })
  // remove_claim confirms through the approval seam when its policy asks; `never` falls back to the card.
  ctx.inject(['approval'], (approvalCtx) => {
    approvalCtx.effect(() => {
      approve = request => approvalCtx.approval.request(request)
      approvalPolicy = session => approvalCtx.approval.overrideOf(session) ?? approvalCtx.approval.config.policy ?? 'ask'
      return () => { approve = undefined; approvalPolicy = () => undefined }
    }, 'flowleap-deliverables: remove_claim approval')
  })
  // The strict path: /confirm-features, /approve-claims and /waive, when a command registry is composed.
  ctx.inject(['commands'], (commandCtx) => {
    commandCtx.effect(() => registerGateCommands(commandCtx, {
      registry: commandCtx.commands,
      info: (message) => { commandCtx.logger.info(message) },
    }), 'flowleap-deliverables: gate commands')
  })

  registerRecorder(ctx, ledger, (mode, tool) => {
    const seen = modes.get(mode) ?? 0
    modes.set(mode, seen + 1)
    if (seen === 0) ctx.logger.info(`flowleap-deliverables: evidence ledger recording in ${mode} mode (first result from ${tool})`)
  })
  registerPresent(ctx, present, sessionId => trackers.openTurn(sessionId))
  registerCompletionGuard(ctx, trackers)
  registerEditSeal(ctx, delivered)
  ctx.on('session/disposed', (session) => { ledger.forget(session.id); delivered.forget(session.id); markets.forget(session.id) })
  const log = {
    warn: (message: string) => { ctx.logger.warn(message) },
    info: (message: string) => { ctx.logger.info(message) },
  }
  ctx.effect(() => registerDeliverableTools(ctx, [
    writePatentResultsTool(ctx, {
      ledger, judge: () => judge, present, delivered, gates, markets, workPages, secondRead: () => config.secondRead, ...log,
    }),
    startApplicationDraftTool(ctx, { present, gates, ...log }),
    validateDraftTool(ctx, { present, gates, ...log }),
    exportDraftDocxTool(ctx, { present, gates, ...log }),
    inventorQuestionsTool(ctx, { present, gates, ...log }),
    removeClaimTool(ctx, { present, gates, ...log }),
  ]), 'flowleap-deliverables: tools')
}
