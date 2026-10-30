/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The `write_patent_results` tool: saves reports (free-form and templated),
 * the evidence companion, the second-read verdicts and the working record
 * under the session's working directory. Ported from the IDE's
 * `writePatentResultsTool.ts` (see SOURCE.json) onto the dsh seams: `ctx.fs`
 * for every read and write, the ledger of `./ledger` for the recorded
 * evidence, `./judge.ts` for the second read, `./present.ts` for the delivery
 * card. The validation strings, the receipt and the result text are the IDE's.
 * The two drafting templates save through `./drafting/draft-application-save.ts`
 * and `./drafting/draft-outline-save.ts` into `drafting/<matter>/` (the folder
 * contract, `matchDraftingPath`), with the refusal and the delivery card of the
 * IDE's `saveDraftingFile` (S5 D3).
 *
 * One format change against the IDE: the companions have stable names,
 * `<report>.evidence.json` and `<report>.second-read.json`, replaced by each
 * save, because `ctx.fs` has no delete for the IDE's `<report>.<uuid>.*` sweep.
 * The receipt binds the report digest and the evidence digest, so a stable
 * name loses nothing. The working record keeps PR #372's
 * `<stem>.working-record.md`.
 * @module
 */

import { basename, posix, relative, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { FsError, type FsTarget } from '@deepseek-ai/dsh-fs'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ToolDefinition as DshToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type {} from '@deepseek-ai/dsh-working-directory'
import { saveDraftApplication } from './drafting/draft-application-save.ts'
import { saveDraftOutline } from './drafting/draft-outline-save.ts'
import { DRAFTING_FILE_NAMES, matchDraftingPath, resolveDraftingFolder } from './drafting/folder-contract.ts'
import { DraftingWorkspace, workspaceFiles, type DraftingSaveResult } from './drafting/workspace.ts'
import type { PatentLedger } from './ledger/store.ts'
import type { PatentExecutionSnapshot } from './ledger/types.ts'
import type { DeliveredPaths } from './guard/seal.ts'
import type { SecondReadJudge } from './judge.ts'
import type { WorkPages } from './work-page/store.ts'
import { officeActionTemplateSave } from './work-page/template-save.ts'
import { DELIVERED_LINE, type PresentQueue } from './present.ts'
import { CandidateReviewVariant, candidateWordingReview, challengedClaims, chartOpenPoints, materializeCandidateReview, PatentCandidateReview, renderCandidateReview, renderWorkingRecord, validateCandidateReview } from './report/candidate-review.ts'
import { deriveFallbackLadder, fallbackCoverage, fallbacksNotCovered, roundAnswerErrors, roundOrderErrors } from './report/fallback-ladder.ts'
import { baselineIntegrityNote, baselineSource, claimComparisons, countLine, ExaminerBaseline, findBetterMissingInputs, flattenSides, gapCount, ignoredNumericFields, incompleteSearch } from './report/find-better.ts'
import { extractFigures, figureProvenance, figureSentence, ftoProvenanceResult, renderFtoAppendix, renderLandscapeAppendix } from './report/provenance.ts'
import { fillHeaderCell, unfilledHeaderCells, unfilledHeaderCellsRefusal, REQUIRED_HEADER_CELLS } from './report/header-cells.ts'
import { ConfirmedMarkets, marketsCellValue, marketsResultLine, resolveMarkets } from './report/markets.ts'
import type { GateSeams } from './gates/questions.ts'
import { priorArtReportReceipt, ReceiptFallbacks } from './report/receipt.ts'
import { SecondReadOutcome, unconfirmedVerdicts } from './report/second-read.ts'
import { buildPatentReport, contentRequirementError, PatentReportTemplate } from './report/templates.ts'
import { DRAFTING_TEMPLATES, REPORT_TEMPLATES, WRITE_PATENT_RESULTS_DESCRIPTION, WRITE_PATENT_RESULTS_NAME, WRITE_PATENT_RESULTS_PARAMETERS } from './writer-schema.ts'

/** The templates that save a file of an Application Drafting matter, outside the report templates. */
type DraftingTemplate = typeof DRAFTING_TEMPLATES[number]

/** The file, the label and the save of a drafting template: the IDE's `DRAFTING_TEMPLATES` table. */
interface DraftingTemplateSave {
  readonly file: string
  readonly label: string
  readonly save: (workspace: DraftingWorkspace, input: WritePatentResultsInput) => Promise<DraftingSaveResult>
}

const DRAFTING_SAVES: Readonly<Record<DraftingTemplate, DraftingTemplateSave>> = {
  'draft-application': { file: DRAFTING_FILE_NAMES.draft, label: 'Draft', save: saveDraftApplication },
  'draft-outline': { file: DRAFTING_FILE_NAMES.draftOutline, label: 'Draft Outline', save: (workspace, input) => saveDraftOutline(workspace, input.content) },
}

function isDraftingTemplate(template: string | undefined): template is DraftingTemplate {
  return template !== undefined && (DRAFTING_TEMPLATES as readonly string[]).includes(template)
}

/** The model's arguments: the IDE's `IWritePatentResultsParams`. */
export interface WritePatentResultsInput extends PatentCandidateReview {
  readonly filePath: string
  readonly content: string
  /** Optional report template. Omitted = free-form save of `content` unchanged. */
  readonly template?: PatentReportTemplate | DraftingTemplate
  /** Matter/case reference or the document's identifying number, when the user provided one. */
  readonly matter?: string
  /** The technology/product/portfolio the report is about, in a short phrase. */
  readonly subject?: string
  /** fto-memo: the jurisdictions the memo clears, as a short list; fills the header's `Jurisdiction(s)` cell (harness-only input). */
  readonly jurisdictions?: string
  /** One or two sentences: the question the work answers (prior-art-report). */
  readonly objective?: string
  /** Short summary of databases, codes, and key queries used (prior-art and landscape reports). */
  readonly searchStrategy?: string
  /** draft-application: the office, when the content's frontmatter does not name it. */
  readonly office?: string
  /** draft-application: the model the disclosure went to, when the frontmatter does not name it. */
  readonly model?: string
  /** draft-application: the provider the disclosure went to, when the frontmatter does not name it. */
  readonly provider?: string
  /** draft-application: the version of the invention disclosure the draft is made from. */
  readonly disclosureVersion?: string
  /** draft-application: a short summary of the prompts and instructions the draft was made with. */
  readonly promptsSummary?: string
  /** office-action-scaffold: the analysis as structured fields, as parsed JSON; its template save validates it. */
  readonly officeAction?: unknown
}

/** The report on disk, as the after-save step of its template reads it. */
export interface SavedReport {
  /** Process path of the report. */
  readonly reportPath: string
  /** The report path as the save named it. */
  readonly displayPath: string
  /** The chat that saved the report; `undefined` for a save without an Agent. */
  readonly sessionId: SessionId | undefined
  readonly signal: AbortSignal
}

/** A save that the template step prepared: refused, or the body to save and the step that runs after the report is on disk. */
export type PreparedSave =
  | { readonly kind: 'refused'; readonly text: string }
  | {
    readonly kind: 'ready'
    /** The report body to save in place of the model's `content`. */
    readonly content: string
    /**
     * Write the files of the template beside the saved report. It never throws: it reports its own failure in the
     * returned lines, because the report is already on disk.
     * @returns the lines for the save result.
     */
    readonly afterSave: (saved: SavedReport) => Promise<string>
  }

/** What one report template adds to a save: the check of its structured input before any disk access. */
export interface TemplateSave {
  /**
   * Validate the structured input of the template.
   * @param input - the model's arguments.
   * @returns the refusal, or the body and the after-save step.
   */
  readonly prepare: (input: WritePatentResultsInput) => PreparedSave
}

/**
 * How much of the second read the user sees. `off` disables it; `log` and `render` both record the
 * verdicts in a file beside the evidence companion and state them in the working record, and
 * `render` additionally names in the tool result what an independent read did not confirm, so the
 * model has to decide whether to revise a row or defend it.
 */
export type SecondReadMode = 'off' | 'log' | 'render'

/** The canonical value of one call: whether a file was written, the text the model reads, and the paths. */
export interface WritePatentResultsValue {
  /** Whether the report reached disk. */
  saved: boolean
  /** The full result text, the IDE's wording. */
  text: string
  /** The report's canonical process path, when saved. */
  report?: string
  /** The working record's canonical process path, when written. */
  workingRecord?: string
  /** The evidence companion's canonical process path, when written. */
  evidence?: string
}

/**
 * The working record beside a report: a stable name, with no companion id, because a later session
 * on the same matter looks for it by name and a refinement save must replace it rather than leave a
 * second copy.
 * @param reportPath - the report path.
 * @returns the record path.
 */
export function workingRecordPath(reportPath: string): string {
  return reportPath.replace(/\.md$/i, '') + '.working-record.md'
}

/**
 * The evidence companion beside a report: a stable name, replaced by each save.
 * @param reportPath - the report path.
 * @returns the companion path.
 */
export function evidencePath(reportPath: string): string {
  return reportPath + '.evidence.json'
}

/**
 * The second-read verdicts beside a report: a stable name, replaced by each judged save.
 * @param reportPath - the report path.
 * @returns the verdict file path.
 */
export function secondReadPath(reportPath: string): string {
  return reportPath + '.second-read.json'
}

/**
 * Where the report sits inside the working directory, e.g. `outputs/prior-art-review.md`. The renderer
 * links a saved drawing page relative to this, so a cited figure opens from the report wherever the
 * project folder is.
 */
function reportWorkspacePath(cwd: string, reportPath: string): string {
  const rel = relative(cwd, reportPath)
  if (!rel || rel.startsWith('..')) { return '' }
  return rel.split(sep).join(posix.sep)
}

/** Unconfirmed elements named in the tool result; the rest are counted and left to the report. */
const SECOND_READ_RESULT_LIMIT = 6

/**
 * Saves of one report that may follow a second read with open objections. The judge reads the
 * reworded rows each time and can raise new objections on every pass, so the loop needs an end: after
 * this many re-saves the receipt tells the model to stop and leave the rest to the reviewer (#538).
 */
const SECOND_READ_RESAVE_LIMIT = 2

/**
 * What the model may do about open second-read objections. The first save that has them is not a
 * re-save, so a report gets {@link SECOND_READ_RESAVE_LIMIT} re-saves after it; then it must stop.
 */
function resaveGuidance(objectedSaves: number): string {
  const left = SECOND_READ_RESAVE_LIMIT + 1 - objectedSaves
  return left > 0
    ? `If a disagreement is right, downgrade or reword that row and re-save; if the second read is wrong, leave the row and say why in its gap. Re-save at most ${left === 1 ? 'once more' : `${left} more times`} for second-read objections.`
    : 'Stop: remaining objections are recorded for the reviewer. Do not re-save for them again; list them in the chat summary as open second-read points.'
}

/**
 * The saved report is the record; the chat summary that follows it must not become more certain than
 * that record, so the save states the contract the summary has to keep.
 */
const SUMMARY_CONTRACT = 'Chat summary contract: repeat each coverage row\'s status word exactly (supported / partial / unresolved), do not add novelty, anticipation, obviousness or teaching-away conclusions, and state the retrieved-but-not-cited count and any untranslated documents. The summary must not be more certain than the saved report.'

/**
 * The Fallback Coverage counts an invalidity chart's receipt states (PRD 0024 C3): the fallbacks the
 * validated rows leave not covered, their names, and the Search Rounds the chart records; and its open
 * points (C4), computed from the record, which the Round Report numbers.
 */
function receiptFallbacks(
  review: PatentCandidateReview,
  snapshot: PatentExecutionSnapshot,
  challengedPublication: string | undefined,
): ReceiptFallbacks {
  const coverage = fallbackCoverage(review, deriveFallbackLadder(snapshot, challengedPublication))
  const criticalDate = review.criticalDate?.trim() || undefined
  return {
    fallbacksNotCovered: fallbacksNotCovered(coverage),
    rounds: review.rounds?.length ?? 0,
    notCovered: coverage.flatMap(claim => claim.notCovered),
    openPoints: chartOpenPoints(review, snapshot),
    criticalDate,
  }
}

/**
 * The summary contract of a Find Better report, with the numbers the summary must repeat: the counts
 * are the saved report's own, counted from validated rows, so the summary quotes them instead of
 * re-deriving them.
 */
function findBetterSummaryContract(review: PatentCandidateReview): string {
  const counts = claimComparisons(review).map(comparison => `claim ${comparison.claim} — ${countLine(comparison)}`).join('; ')
  const gaps = gapCount(review)
  // "No better art found" is a complete result only over a complete search (#529).
  const incomplete = incompleteSearch(review)
  const result = incomplete.length
    ? `state that the search is incomplete (${incomplete.join('; ')}) and do not present "no better art found" as a complete result`
    : 'where no better art was found, say so as a complete result'
  return `Chat summary contract: repeat each cell's status word exactly (disclosed / partially disclosed / not found); state each claim's counts exactly as the saved report counts them (${counts}); state that the Baseline has ${gaps} gap${gaps === 1 ? '' : 's'} in the offices' records and that a gap is not "nothing cited"; ${result}. Do not add invalidity, anticipation or obviousness conclusions. The summary must not be more certain than the saved report.`
}

/**
 * The refusal of a drafting save whose path is not `drafting/<matter>/<file>` of the working directory.
 * @param template - the drafting template the model asked for.
 * @returns the refusal text, the IDE's.
 */
export function draftingPathRefusal(template: DraftingTemplate): string {
  const { file, label } = DRAFTING_SAVES[template]
  return `${label} was not saved. The ${template} template saves to drafting/<matter>/${file} inside a workspace folder.`
}

/** The services the writer runs on. */
export interface WriterDependencies {
  readonly ledger: PatentLedger
  readonly judge: () => SecondReadJudge
  readonly present: PresentQueue
  readonly secondRead: () => SecondReadMode
  readonly warn: (message: string) => void
  readonly info: (message: string) => void
  /** The clock the report date and the verdict file use; a test passes its own. */
  readonly now?: () => Date
  /** The seal's register of delivered paths; every saved report (free-form or templated) is marked. */
  readonly delivered?: DeliveredPaths
  /** The office action work pages; a structured `office-action-scaffold` save writes its page through them. */
  readonly workPages: WorkPages
  /** The question seams of the fto-memo markets card. */
  readonly gates: GateSeams
  /** The markets the user confirmed, per Session and report path. */
  readonly markets: ConfirmedMarkets
}

/**
 * Validate the raw arguments; the registry hands them over as parsed JSON and this tool owns its schema.
 * @param args - the model's arguments.
 * @returns the typed input.
 * @throws when `filePath`, `content` or `template` is not of its declared shape.
 */
export function parseWriterArgs(args: unknown): WritePatentResultsInput {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) { throw new Error(`${WRITE_PATENT_RESULTS_NAME}: invalid arguments: expected an object`) }
  const record = args as Record<string, unknown>
  const filePath = record['filePath']
  if (typeof filePath !== 'string' || filePath.trim().length === 0 || filePath.includes('\0')) { throw new Error(`${WRITE_PATENT_RESULTS_NAME}: invalid arguments: filePath must be a non-empty string`) }
  const content = record['content']
  if (typeof content !== 'string') { throw new Error(`${WRITE_PATENT_RESULTS_NAME}: invalid arguments: content must be a string (empty for the structured templates)`) }
  const template = record['template']
  if (template !== undefined && template !== null && !(typeof template === 'string' && [...REPORT_TEMPLATES, ...DRAFTING_TEMPLATES].includes(template as PatentReportTemplate | DraftingTemplate))) {
    throw new Error(`${WRITE_PATENT_RESULTS_NAME}: invalid arguments: template must be one of ${[...REPORT_TEMPLATES, ...DRAFTING_TEMPLATES].join(', ')}`)
  }
  const { template: _template, ...rest } = record
  return { ...rest, filePath, content, ...(typeof template === 'string' ? { template: template as PatentReportTemplate | DraftingTemplate } : {}) }
}

/** A text answer the model reads; `saved` is false for every refusal. */
function refusal(text: string): WritePatentResultsValue {
  return { saved: false, text }
}

/**
 * Build the `write_patent_results` definition over the mounted `fs` and `workingDirectory` services.
 * @param ctx - a context whose `fs` and `workingDirectory` are active.
 * @param deps - the ledger, the judge, the delivery queue and the config readers.
 * @returns the unregistered dsh definition.
 */
export function writePatentResultsTool(ctx: Context, deps: WriterDependencies): DshToolDefinition {
  /** Per session and report, how many saves in a row ended with open second-read objections. */
  const objectedSaves = new Map<string, number>()
  const now = deps.now ?? (() => new Date())
  /** The templates whose save has its own structured input and files. */
  const templateSaves: Partial<Record<PatentReportTemplate, TemplateSave>> = {
    'office-action-scaffold': officeActionTemplateSave(deps),
  }

  /** The target of a model-supplied path inside the working directory, or `undefined` when it escapes or cannot resolve. */
  const resolveInside = async (path: string, cwd: string, root: FsTarget, signal: AbortSignal): Promise<FsTarget | undefined> => {
    try {
      const target = await ctx.fs.resolve(path, { cwd, signal })
      return ctx.fs.contains(root, target) ? target : undefined
    } catch (error) {
      if (error instanceof FsError) return undefined
      throw error
    }
  }

  /** Read the CLI's `--json` Baseline from the workspace: the parsed object, or the reason it cannot be used. */
  const readBaseline = async (path: string, cwd: string, root: FsTarget, signal: AbortSignal): Promise<ExaminerBaseline | string> => {
    const target = await resolveInside(path, cwd, root, signal)
    if (target === undefined) {
      return `baselinePath "${path}" is not a path inside the working directory. Save the Baseline in the workspace with the examiner_baseline tool (or the --json output of flowleap patent examiner-baseline <publication>) and give its path.`
    }
    try {
      const value: unknown = JSON.parse(await ctx.fs.readText(target, signal))
      if (!value || typeof value !== 'object' || Array.isArray(value)) { return `baselinePath "${path}" does not hold a Baseline object. It must be the unedited file the examiner_baseline tool wrote, or the unedited --json output of flowleap patent examiner-baseline.` }
      return value
    } catch (error) {
      return `baselinePath "${path}" could not be read as JSON (${error instanceof Error ? error.message : String(error)}). It must be the unedited file the examiner_baseline tool wrote, or the unedited --json output of flowleap patent examiner-baseline.`
    }
  }

  /** Count this save against the re-save limit of its report (see the IDE). Returns the count including this save. */
  const countObjectedSave = (key: string, outcome: SecondReadOutcome | undefined): number => {
    if (outcome?.kind !== 'judged') { return objectedSaves.get(key) ?? 0 }
    if (!unconfirmedVerdicts(outcome.rows).length) {
      objectedSaves.delete(key)
      return 0
    }
    const count = (objectedSaves.get(key) ?? 0) + 1
    objectedSaves.set(key, count)
    return count
  }

  /** What the model is told about the figures it just saved. */
  const landscapeResult = (content: string, snapshot: PatentExecutionSnapshot): string => {
    const provenance = figureProvenance(extractFigures(content), snapshot, content)
    return `\nFigure provenance: ${figureSentence(provenance)}`
			+ (provenance.unmatched.length ? ' Give each figure that was not found its counting basis and source in a follow-up save, or replace it with a figure a recorded output supports.' : '')
			+ ' The report lists them in its generated provenance appendix.'
  }

  /** What the model is told about the second read (see the IDE). */
  const secondReadResult = (
    mode: SecondReadMode,
    outcome: SecondReadOutcome | undefined,
    verdictFileName: string | undefined,
    objected: number,
  ): string => {
    if (!outcome) { return '' }
    if (outcome.kind === 'skipped') { return `\nSecond read (diagnostic): skipped (${outcome.reason}).` }
    if (outcome.kind === 'notRun') { return `\nSecond read: not run (${outcome.reason}). The report and the working record say so.` }
    const { elements, disagree, unclear, unparsed } = outcome.summary
    if (mode === 'log') {
      return `\nSecond read (diagnostic): ${elements} elements judged, ${disagree} disagree, ${unclear} unclear, ${unparsed} unparsed; verdicts in ${verdictFileName ?? 'no file (write failed)'}.`
    }
    const unconfirmed = unconfirmedVerdicts(outcome.rows)
    const shown = unconfirmed.slice(0, SECOND_READ_RESULT_LIMIT)
    // Each reason is its own sentence; the list punctuates itself, so a trailing stop is dropped.
    const listed = shown.map(item => `${item.feature} / ${item.element} — ${item.reason.trim().replace(/\.$/, '')}`).join('; ')
			+ (unconfirmed.length > shown.length ? `; and ${unconfirmed.length - shown.length} more in the working record` : '')
    return `\nSecond read (${outcome.model}): ${elements} elements judged, ${disagree} not confirmed${unclear ? `, ${unclear} unclear` : ''}.`
			+ (unconfirmed.length ? ` Not confirmed: ${listed}.\n${resaveGuidance(objected)}` : '')
  }

  /** Write one text file under the working directory; parent directories are created by the backend. */
  const write = async (target: FsTarget, text: string, signal: AbortSignal): Promise<void> => {
    await ctx.fs.writeText(target, text, undefined, signal)
  }

  /**
   * The saves of an Application Drafting matter (the IDE's `saveDraftingFile`), never wrapped in a
   * report template and never blocked by findings (ADR 0012): `draft-application` writes the draft
   * as the model gave it, with its frontmatter on line 1; `draft-outline` writes the Draft Outline
   * with the office and the Approved Claims hash in its frontmatter (PRD 0022). The written file is
   * presented; the IDE opened it in the editor instead.
   */
  const saveDraftingFile = async (
    input: WritePatentResultsInput, template: DraftingTemplate, exec: ToolRunContext,
  ): Promise<WritePatentResultsValue> => {
    const { file, label, save } = DRAFTING_SAVES[template]
    const cwd = exec.agent === undefined
      ? ctx.workingDirectory.defaultDirectory
      : await ctx.workingDirectory.ensure(exec.agent, exec.signal)
    const root = await ctx.fs.resolve(cwd, { signal: exec.signal })
    const target = await resolveInside(input.filePath, cwd, root, exec.signal)
    const matter = target === undefined ? undefined : matchDraftingPath(reportWorkspacePath(cwd, ctx.fs.processPath(target)), file)
    const folder = matter === undefined ? undefined : resolveDraftingFolder(matter)
    if (target === undefined || folder === undefined) {
      return refusal(draftingPathRefusal(template))
    }
    try {
      const workspace = new DraftingWorkspace(await workspaceFiles(ctx, cwd, exec.signal), folder, { now })
      const outcome = await save(workspace, input)
      if (!outcome.saved) {
        return refusal(`${label} was not saved. ${outcome.reason}`)
      }
      const reportPath = ctx.fs.processPath(target)
      deps.info(`flowleap-deliverables: wrote ${input.filePath} (${template})`)
      deps.present.queue(exec, [{ path: reportPath, description: label }])
      return { saved: true, text: `${outcome.message}\n${DELIVERED_LINE}`, report: reportPath }
    } catch (error) {
      const message = error instanceof FsError ? `${error.message} (${error.code})` : error instanceof Error ? error.message : 'Unknown error occurred'
      deps.warn(`flowleap-deliverables: ${WRITE_PATENT_RESULTS_NAME} ${template} failed: ${message}`)
      return refusal(`Error: ${message}`)
    }
  }

  const execute = async (input: WritePatentResultsInput, exec: ToolRunContext): Promise<WritePatentResultsValue> => {
    const { filePath, template } = input
    if (isDraftingTemplate(template)) {
      return saveDraftingFile(input, template, exec)
    }
    const prepared = template === undefined ? undefined : templateSaves[template]?.prepare(input)
    if (prepared?.kind === 'refused') {
      return refusal(prepared.text)
    }
    const content = prepared?.content ?? input.content

    // prior-art-report and find-better-report always generate their body from structured coverage;
    // invalidity-claim-chart does so when the model supplies coverage, and keeps the written-content
    // chart when it does not.
    const findBetter = template === 'find-better-report'
    const structuredBody = template === 'prior-art-report' || findBetter || (template === 'invalidity-claim-chart' && !!input.coverage?.length)
    const variant: CandidateReviewVariant = template === 'invalidity-claim-chart' ? 'invalidity' : findBetter ? 'find-better' : 'prior-art'

    // A Find Better report without its structured inputs has nothing to compare, so it is refused
    // before any path is resolved, naming what is missing.
    const missing = findBetter ? findBetterMissingInputs(input) : undefined
    if (missing) {
      return refusal(`Report was not saved. ${missing}`)
    }

    // A templated report with no body saves a shell of section stubs while the findings stay in
    // the chat, so the requirement is checked before any path resolution or disk access.
    const requirement = contentRequirementError(template, content, structuredBody)
    if (requirement) {
      return refusal(`Report was not saved. ${requirement} Retry with the report body in content.`)
    }

    const cwd = exec.agent === undefined
      ? ctx.workingDirectory.defaultDirectory
      : await ctx.workingDirectory.ensure(exec.agent, exec.signal)
    const root = await ctx.fs.resolve(cwd, { signal: exec.signal })
    const target = await resolveInside(filePath, cwd, root, exec.signal)
    if (target === undefined) {
      return refusal(`Error: Patent result writes must stay within the working directory ${cwd}.`)
    }
    const reportPath = ctx.fs.processPath(target)
    const sessionId = exec.agent?.session.id
    // The markets an FTO memo clears are the user's answer, asked before any costly step of the save.
    const markets = template === 'fto-memo' ? await resolveMarkets(deps.gates, exec, deps.markets, reportPath, input.jurisdictions) : undefined
    if (markets?.kind === 'refused') {
      return refusal(markets.text)
    }
    const cellInput = markets === undefined ? input : { ...input, jurisdictions: marketsCellValue(markets) }

    try {
      // A Baseline given by path is read from the workspace once, then checked exactly like an inline one.
      const loaded = findBetter && input.baselinePath?.trim()
        ? await readBaseline(input.baselinePath.trim(), cwd, root, exec.signal)
        : undefined
      if (typeof loaded === 'string') {
        return refusal(`Report was not saved. ${loaded}`)
      }
      const sided = loaded ? { ...input, baseline: loaded } : input
      const snapshot = structuredBody ? await deps.ledger.read(sessionId ?? '') : undefined
      const materialized = snapshot ? materializeCandidateReview(sided, snapshot) : sided
      // A Find Better row's two sides become two ordinary rows for every check and for the second
      // read; the two-sided input is what the report renders.
      const flat = flattenSides(materialized)
      // The Fallback Ladder is derived for the challenged patent the chart's header names, so the
      // checks, the chart and the working record read the same fallback to matter the header does.
      const checked = variant === 'invalidity' ? { ...materialized, challengedPublication: materialized.challengedPublication ?? input.matter } : materialized
      const workspacePath = reportWorkspacePath(cwd, reportPath)
      if (snapshot) {
        const errors = validateCandidateReview(checked, snapshot, [content, materialized.objective, materialized.searchStrategy, ...(materialized.concepts ?? []).flatMap(entry => [entry.concept, ...entry.synonyms]), ...(materialized.classifications ?? []).flatMap(entry => [entry.code, entry.meaning]), ...(flat.coverage ?? []).flatMap(row => [row.feature, row.gap, ...(row.evidence ?? []).flatMap(evidence => [evidence.quote, evidence.scope, evidence.qualifiers, evidence.quantityBasis])]), ...(materialized.limitations ?? []), materialized.stopReason].filter(Boolean).join('\n'), variant)
        // A Search Round added in a re-save of this chart must be a search that ran after the
        // chart's previous save (#725); the path is the one the save record below names.
        if (variant === 'invalidity') {
          errors.push(...roundOrderErrors(checked, snapshot, workspacePath), ...roundAnswerErrors(checked, snapshot, workspacePath))
        }
        if (errors.length) {
          return refusal('Candidate draft was not saved. Correct these issues and retry with the revised content:\n- ' + errors.join('\n- '))
        }
      }
      const evidenceTarget = await ctx.fs.resolve(evidencePath(reportPath), { signal: exec.signal })
      const recordTarget = await ctx.fs.resolve(workingRecordPath(reportPath), { signal: exec.signal })
      // The report is written once, with the second read already in it, so the receipt covers the
      // final bytes. A judge failure is caught by the judge and never reaches the save.
      const mode = deps.secondRead()
      const secondRead = snapshot && mode !== 'off' ? await deps.judge().judge(flat, snapshot, exec.agent?.session, exec.signal) : undefined
      // Wrap the model's content in the chosen professional report structure, or write it
      // verbatim when no template is requested. The tool stamps what it knows (date, AI
      // authorship); the model supplies what the conversation knows; only genuinely
      // practitioner-owned fields keep the placeholder.
      const candidateContent = snapshot
        ? renderCandidateReview(checked, snapshot, basename(recordTarget.displayPath), variant, workspacePath)
        : content
      const wording = snapshot ? candidateWordingReview(materialized, variant) : []
      // A landscape report is a page of numbers; every other content template is a page of
      // statuses, dates and quoted claims. The generated sections state which of them appear in the
      // text a tool returned, which tables never say what they count, and which quotations stand in
      // the recorded claim text of the document they are cited to.
      const provenance = template && !structuredBody ? await deps.ledger.read(sessionId ?? '') : undefined
      const appendix = !provenance ? undefined : template === 'landscape-report' ? renderLandscapeAppendix(content, provenance) : renderFtoAppendix(content, provenance)
      // The structured chart's header fields are read off the rows themselves, so the claims it
      // states are the claims it actually charts.
      const invalidityFields = structuredBody && variant !== 'prior-art' ? {
        challengedPublication: materialized.challengedPublication ?? input.matter,
        claimsAtIssue: challengedClaims(materialized).join(', '),
        criticalDateBasis: input.objective,
      } : {}
      const rendered = buildPatentReport(candidateContent, template, {
        matter: input.matter,
        subject: input.subject,
        objective: input.objective,
        searchStrategy: input.searchStrategy,
        date: now().toISOString().slice(0, 10),
        preparedBy: 'FlowLeap Patent AI (AI-assisted draft)',
        ...invalidityFields,
      }, appendix, structuredBody)
      // The header cells the request answers are the save's to fill; the harness has no editor in
      // which the practitioner would fill them later, so a required cell left as the placeholder
      // refuses the save, naming the cell and the input (S5 acceptance defect B).
      const document = (template === undefined ? [] : REQUIRED_HEADER_CELLS[template] ?? [])
        .reduce((text, cell) => fillHeaderCell(text, cell.label, cellInput[cell.input]), rendered)
      const unfilled = unfilledHeaderCells(document, template)
      if (template !== undefined && unfilled.length) {
        return refusal(unfilledHeaderCellsRefusal(template, unfilled))
      }

      const evidenceDocument = snapshot ? JSON.stringify({ schemaVersion: 1, ...snapshot }, null, 2) : undefined
      if (evidenceDocument) {
        await write(evidenceTarget, evidenceDocument, exec.signal)
      }
      await write(target, document, exec.signal)
      const templateResult = prepared === undefined ? '' : `\n${await prepared.afterSave({ reportPath, displayPath: filePath, sessionId, signal: exec.signal })}`
      // The verdicts beside the evidence companion. The record is what a human adjudicates later,
      // so losing it must not cost the save that already succeeded.
      let verdictFileName: string | undefined
      if (secondRead?.kind === 'judged') {
        try {
          const verdictTarget = await ctx.fs.resolve(secondReadPath(reportPath), { signal: exec.signal })
          const verdicts = { model: secondRead.model, judgedAt: now().toISOString(), rows: secondRead.rows, summary: secondRead.summary }
          await write(verdictTarget, JSON.stringify(verdicts, null, 2), exec.signal)
          verdictFileName = basename(verdictTarget.displayPath)
        } catch (error) {
          deps.warn(`flowleap-deliverables: second-read verdicts were not written: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      // The record links the verdict file, so it is written after it; losing it must not cost the
      // report that is already on disk, so a failure is a warning and an unnamed record.
      let recordWritten = false
      if (snapshot) {
        try {
          const record = renderWorkingRecord(
            checked, snapshot, basename(target.displayPath), basename(evidenceTarget.displayPath), verdictFileName, secondRead, variant,
          )
          await write(recordTarget, record, exec.signal)
          recordWritten = true
        } catch (error) {
          deps.warn(`flowleap-deliverables: working record was not written: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      const objected = countObjectedSave(`${sessionId ?? ''}|${reportPath}`, secondRead)
      deps.info(`flowleap-deliverables: wrote ${filePath}`)
      // The file is delivered with a card; a later direct edit of it is steered once (the seal).
      if (sessionId !== undefined) deps.delivered?.mark(sessionId, reportPath)

      // The delivery card: the report and the working record; never the JSON companions.
      const recordPath = ctx.fs.processPath(recordTarget)
      deps.present.queue(exec, [
        { path: reportPath, description: 'Report' },
        ...recordWritten ? [{ path: recordPath, description: 'Working record' }] : [],
      ])

      // A save that carries a generated provenance appendix is a checked report, not a free-form
      // artifact, so it states what was traced instead of that nothing was.
      const provenanceResult = !provenance ? '' : template === 'landscape-report' ? landscapeResult(content, provenance) : ftoProvenanceResult(content, provenance, template === 'fto-memo' ? 'fto-memo' : 'report')
      // The comparison is a count over validated rows; a number the model typed has no field to land
      // in, so it is dropped and named rather than silently lost.
      const ignored = findBetter ? ignoredNumericFields(input) : []
      const integrityNote = findBetter ? baselineIntegrityNote(materialized.baseline) : undefined
      const sourceResult = findBetter ? `\nExaminer Baseline source: ${baselineSource(materialized)}.${integrityNote ? ` ${integrityNote}` : ''}` : ''
      // An invalidity chart's receipt states its Fallback Coverage and its open points, so the
      // completion guard can ask for the Round Report without reading the report.
      const fallbacks = snapshot && variant === 'invalidity' ? receiptFallbacks(checked, snapshot, checked.challengedPublication) : undefined
      // The chart is on disk: mark the save in the ledger, so a Search Round added in a later
      // save of this path can be checked against the position of this one (#725) and against the
      // open points this receipt lists (C4).
      if (fallbacks && sessionId !== undefined) {
        await deps.ledger.record(sessionId, { kind: 'save', status: 'succeeded', tool: 'write_patent_results', request: workspacePath, rounds: fallbacks.rounds, openPoints: fallbacks.openPoints.map(point => point.id) })
      }
      const ignoredResult = ignored.length ? `\nIgnored model-supplied numeric field(s): ${ignored.join(', ')}. A Find Better report counts disclosed elements from the validated rows only; no model-supplied number reaches the report.` : ''
      const evidenceProcessPath = ctx.fs.processPath(evidenceTarget)
      const marketsResult = markets === undefined ? '' : marketsResultLine(markets)
      const text = `Successfully wrote patent results to ${filePath}` + marketsResult + provenanceResult + (evidenceDocument ? `${wording.length ? `\nWording review: ${wording.length} phrase(s) flagged in the working record; reword them in a follow-up save if they are conclusions rather than disclaimers.` : ''}${secondReadResult(mode, secondRead, verdictFileName, objected)}${sourceResult}${ignoredResult}\n${findBetter ? findBetterSummaryContract(materialized) : SUMMARY_CONTRACT}\n${priorArtReportReceipt(reportPath, document, evidenceProcessPath, evidenceDocument, fallbacks)}${recordWritten ? `\nWorking record: ${workingRecordPath(filePath)}` : ''}` : provenance ? '' : '\nFree-form artifact: evidence validation was not performed.')
				+ templateResult
				+ `\n${DELIVERED_LINE}`
      return {
        saved: true,
        text,
        report: reportPath,
        ...recordWritten ? { workingRecord: recordPath } : {},
        ...evidenceDocument ? { evidence: evidenceProcessPath } : {},
      }
    } catch (error) {
      const message = error instanceof FsError ? `${error.message} (${error.code})` : error instanceof Error ? error.message : 'Unknown error occurred'
      deps.warn(`flowleap-deliverables: ${WRITE_PATENT_RESULTS_NAME} failed: ${message}`)
      return refusal(`Error: ${message}`)
    }
  }

  return {
    name: WRITE_PATENT_RESULTS_NAME,
    description: WRITE_PATENT_RESULTS_DESCRIPTION,
    parameters: WRITE_PATENT_RESULTS_PARAMETERS,
    output: {
      schema: {},
      render: (_args, value) => [{ type: 'text', text: isWriterValue(value) ? value.text : JSON.stringify(value) }],
    },
    async execute(args: unknown, exec: ToolRunContext): Promise<JsonValue> {
      const input = parseWriterArgs(args)
      const value = await execute(input, exec)
      return { ...value }
    },
  }
}

/** Whether a canonical value is this tool's. */
function isWriterValue(value: JsonValue): value is WritePatentResultsValue & JsonValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && typeof value['text'] === 'string' && typeof value['saved'] === 'boolean'
}
