/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The prior-art completion check: a turn that owes a structured report ends
 * with a receipt for it, at the requested path, after the last retrieval, with
 * the report and its evidence companion unchanged on disk; and an invalidity
 * chart with open points ends with a Round Report. Copied from the check half
 * of the IDE's `priorArtReportCompletion.ts` (see SOURCE.json). The IDE ran it
 * inside its tool-calling loop over VS Code tool rounds; here the turns are
 * folded from the Session's own events (`turn-tracker.ts`) and the result
 * reaches the model through `agent.steer()` from an `agent/turn-stopping`
 * listener (`steer.ts`). Harness tool names stand where the IDE named its own.
 * @module
 */

import { escapeRegExpCharacters, sha256Hex } from '../report/text.ts'
import {
  finalizesStructuredReport, parseReceipt, requestsFindBetter, requestsInvalidityChart, requestsPriorArtReport,
  ROUND_REPORT_NUDGE_MARKER, ROUND_REPORT_PROMPT, WRITER_TOOL_NAME, type GuardToolCall, type ParsedReportReceipt,
} from '../report/receipt.ts'

/** One model step of a turn: the calls it made, the text it wrote, and any steer text that preceded it. */
export interface GuardRound {
  readonly toolCalls: readonly GuardToolCall[]
  /** The assistant text of the step. */
  readonly response: string
  /** Text this plugin steered into the turn before the step, when it did. */
  readonly hookContext?: string
}

/** One turn as the check reads it: the user's request, the steps, and each tool call's result text by call id. */
export interface ReportCompletionTurn {
  readonly message: string
  readonly rounds: readonly GuardRound[]
  readonly results: Readonly<Record<string, string>>
}

/** The one filesystem read the check makes: the current bytes of a path, or `undefined` when the file is gone. */
export interface ReceiptFileReader {
  /**
	 * Read a file the receipt names.
	 * @param path - the canonical process path recorded in the receipt.
	 * @returns the file's text, or `undefined` when no such file exists; throws on any other failure.
	 */
  readText(path: string): Promise<string | undefined>
}

/** The harness tools that retrieve patent evidence; a turn with one of them has research to finalize. */
export const RETRIEVAL_TOOLS: ReadonlySet<string> = new Set(['search_patents', 'get_claims', 'get_description', 'get_abstract', 'get_bibliography', 'mcp__flowleap__get_fulltext'])

/** The harness tools that write files or run commands outside the writer; a prior-art turn that uses one owes a validated save. */
export const GENERIC_WRITE_TOOLS: ReadonlySet<string> = new Set(['write', 'edit', 'str_replace_editor', 'bash', 'pwsh', 'run_code'])

/**
 * Generic writes are allowed as drafts, but only a current structured-writer receipt finalizes research.
 * @param history - the earlier turns of the session, oldest first.
 * @param current - the turn that is ending.
 * @param files - reads the report and companion bytes the receipts name.
 * @returns the steer text when the turn is incomplete, or `undefined` when it may end.
 */
export async function checkPriorArtReportCompletion(
  history: readonly ReportCompletionTurn[],
  current: ReportCompletionTurn,
  files: ReceiptFileReader,
): Promise<string | undefined> {
  const currentCalls = current.rounds.flatMap(round => round.toolCalls)
  const hasResearch = currentCalls.some(isRetrieval)
  const turns = [...history, current]
  const requestIndex = turns.map(turn => requestsPriorArtReport(turn.message)).lastIndexOf(true)
  const reportRequest: ReportCompletionTurn | undefined = requestIndex < 0 ? undefined : turns[requestIndex]
  const activeHistory = requestIndex < 0 ? [] : turns.slice(requestIndex, -1)
  const currentReceipts = receipts(current)
  const priorReceipts = activeHistory.flatMap(turn => receipts(turn))
  const target = reportRequest === undefined ? undefined : requestedReportPath(reportRequest.message)
  const writingReport = currentCalls.some(finalizesStructuredReport)
  const mentionsTarget = !!target && currentCalls.some(call => mentionsPath(call, target))
  const continuing = /^\s*continue\b/i.test(current.message) || /\b(revise|update|correct)\b.*\b(report|review)\b/i.test(current.message)
  const pendingResearch = !priorReceipts.length && activeHistory.some(turn => turn.rounds.some(round => round.toolCalls.some(isRetrieval)))
  const genericWrite = currentCalls.some(call => GENERIC_WRITE_TOOLS.has(call.name))
  const currentReportRequest = requestsPriorArtReport(current.message)
  const required = writingReport
    || (currentReportRequest && (hasResearch || genericWrite))
    || (reportRequest !== undefined && hasResearch && (continuing || mentionsTarget))
    || (pendingResearch && (hasResearch || continuing || mentionsTarget))
  // The deliverable the user asked for decides which structured template finalizes it; both take the
  // same empty content and evidence-backed coverage.
  const requested = reportRequest === undefined ? current.message : reportRequest.message
  const findBetter = requestsFindBetter(requested)
  const invalidity = !findBetter && requestsInvalidityChart(requested)
  const deliverable = findBetter ? 'Find Better report' : invalidity ? 'invalidity chart' : 'prior-art report'
  const structuredTemplate = findBetter ? 'find-better-report' : invalidity ? 'invalidity-claim-chart' : 'prior-art-report'
  if (required && !currentReceipts.length) {
    return `The requested ${deliverable} has no successful structured finalization in this turn. Generic file writes and free-form writer calls are unvalidated drafts. Save the requested report with write_patent_results, template="${structuredTemplate}", empty content and the evidence-backed coverage fields. An honest interim report with unresolved features and explicit limitations is valid; do not invent support or repeat searches merely to pass validation.`
  }
  if (required && currentReceipts.length) {
    const finalization = [...currentReceipts].reverse().find(receipt => !target || matchesPath(receipt.reportUri, target))
    if (!finalization) {
      return `The validated report was saved to a different path. Finalize the requested deliverable at ${target} with write_patent_results and template="${structuredTemplate}".`
    }
    const lastResearch = currentCalls.map(isRetrieval).lastIndexOf(true)
    if (lastResearch > finalization.callIndex) { return `More patent evidence was retrieved after the saved report. Reconcile it and re-save the structured ${deliverable} so its evidence companion reflects the final research boundary.` }
  }
  // Read actual bytes, so edits made by any tool (including terminal/MCP) invalidate the receipt.
  // Latest receipt per path supersedes earlier revisions; unrelated notes do not invalidate reports.
  const relevantPriorReceipts = required || continuing || mentionsTarget ? priorReceipts : []
  const latest = new Map([...relevantPriorReceipts, ...currentReceipts].map(receipt => [receipt.reportUri, receipt]))
  for (const receipt of latest.values()) {
    try {
      const report = await files.readText(receipt.reportUri)
      const evidence = await files.readText(receipt.evidenceUri)
      if (report !== undefined && evidence !== undefined
        && sha256Hex(report) === receipt.reportDigest && sha256Hex(evidence) === receipt.evidenceDigest) { continue }
    } catch {
      // A removed artifact loses its validation, but a transient read failure must not block the user.
      continue
    }
    return `The report or its evidence companion changed after validation: ${receipt.reportUri}. Its previous validation no longer applies. If this is the requested deliverable, re-save it through write_patent_results with template="${structuredTemplate}" and revised structured evidence. If it was intentionally removed, explain that no validated deliverable remains. Do not restore a deliberately deleted file without user authorization.`
  }
  return invalidity ? roundReportNudge(current, currentReceipts, target) : undefined
}

/**
 * The Round Report of an invalidity chart (ADR 0016 amendment, decision 7): when the latest chart
 * saved in this turn for the requested path lists open points and the text the agent wrote after that
 * save holds no numbered question that names one of them, ask once for the Round Report. The guard
 * never asks for a Search Round: a round runs only on the expert's answer.
 */
function roundReportNudge(
  current: ReportCompletionTurn,
  currentReceipts: readonly ParsedReportReceipt[],
  target: string | undefined,
): string | undefined {
  const latest = [...currentReceipts].reverse().find(receipt => !target || matchesPath(receipt.reportUri, target))
  const ids = latest?.openPoints ?? []
  if (!latest || !ids.length) { return undefined }
  const after = current.rounds.slice(latest.roundIndex + 1)
  if (after.some(round => round.hookContext?.includes(ROUND_REPORT_NUDGE_MARKER))) { return undefined }
  if (namesOpenPoint(after.map(round => round.response).join('\n'), ids)) { return undefined }
  return `The saved chart lists ${ids.length} open ${ids.length === 1 ? 'point' : 'points'} (${ids.join(', ')}) and ${ROUND_REPORT_NUDGE_MARKER}. Write the Round Report now: the receipt, then each open point as a numbered question that names its id, with your recommended next step, then the line "${ROUND_REPORT_PROMPT}" Then end the turn. Do not run a Search Round before the expert answers.`
}

/** A numbered list item or question: `1.`, `1)`, `**1.**`, `- 1.`, `Q1:` or `#1`. */
const numberedLine = /^\s*(?:[-*]\s+)?(?:\*\*)?(?:Q|#)?\d+(?:\*\*)?[.):]/i

/** Whether a numbered line of the text names one of the open-point ids, as `[rung-3]` or bare. */
function namesOpenPoint(text: string, ids: readonly string[]): boolean {
  const named = ids.map(id => new RegExp(`(?<![\\w.-])${escapeRegExpCharacters(id)}(?![\\w-]|\\.\\w)`, 'i'))
  return text.split('\n').some(line => numberedLine.test(line) && named.some(pattern => pattern.test(line)))
}

function receipts(turn: ReportCompletionTurn): ParsedReportReceipt[] {
  const calls = turn.rounds.flatMap((round, roundIndex) => round.toolCalls.map(call => ({ call, roundIndex })))
  return calls.flatMap(({ call, roundIndex }, callIndex) => {
    if (!finalizesStructuredReport(call)) { return [] }
    if (!Object.hasOwn(turn.results, call.id)) { return [] }
    const text = turn.results[call.id]
    const receipt = parseReceipt(text, { roundIndex, callIndex })
    return receipt ? [receipt] : []
  })
}

/** Capture an explicitly named Markdown deliverable, including quoted paths with spaces. */
function requestedReportPath(message: string): string | undefined {
  // oxlint-disable-next-line @stylistic/max-len -- the IDE's one-line pattern, kept whole so a re-port stays a plain diff.
  const target = /\b(?:save|write|update|revise)\b(?:\s+(?:it|the|a|report|review|outputs?|results?|to|at|as|into))*\s+(?:[`"'](?<quoted>[^`"'\n]+\.md)[`"']|(?<plain>[^\s`"']+\.md)(?=\s|[,.;:]|$))/i.exec(message)
  return (target?.groups?.['quoted'] ?? target?.groups?.['plain'])?.replace(/\\/g, '/').replace(/^\.\//, '')
}

function isRetrieval(call: GuardToolCall): boolean {
  return RETRIEVAL_TOOLS.has(call.name)
}

/**
 * Compare two path-like strings on one shape: either separator, and drive-letter paths case-folded.
 * The host platform must not decide case sensitivity, which would validate the same transcript
 * differently per machine, so the drive-letter shape decides it here instead.
 */
function comparable(left: string, right: string): readonly [string, string] {
  const first = left.replace(/[\\/]+/g, '/')
  const second = right.replace(/[\\/]+/g, '/')
  const drivePath = /(?:^|\/)[a-zA-Z]:\//
  return drivePath.test(first) || drivePath.test(second) ? [first.toLowerCase(), second.toLowerCase()] : [first, second]
}

/** The path a receipt names: a `file:` URI from an IDE-era receipt is decoded; a harness receipt holds the path itself. */
function receiptPath(reportUri: string): string {
  if (!reportUri.startsWith('file:')) { return reportUri }
  try { return decodeURIComponent(new URL(reportUri).pathname) } catch { return reportUri }
}

/** Absolute targets must be the whole path; a relative target matches any trailing segment run. */
function matchesPath(reportUri: string, target: string): boolean {
  const [path, wanted] = comparable(receiptPath(reportUri), target)
  return /^(?:\/|[a-zA-Z]:\/)/.test(wanted) ? path === wanted || path === '/' + wanted : path.endsWith('/' + wanted)
}

/** Windows separators are escaped inside the arguments JSON, so prefer the parsed path argument. */
function mentionsPath(call: GuardToolCall, target: string): boolean {
  if (call.name === WRITER_TOOL_NAME) {
    const filePath = parsedFilePath(call.arguments)
    if (filePath !== undefined) {
      const [path, wanted] = comparable(filePath, target)
      return path === wanted || path.endsWith('/' + wanted.replace(/^\//, ''))
    }
  }
  const [text, wanted] = comparable(call.arguments, target)
  return text.includes(wanted)
}

function parsedFilePath(argumentsText: string): string | undefined {
  try {
    const value: unknown = JSON.parse(argumentsText)
    if (typeof value !== 'object' || value === null) { return undefined }
    const filePath: unknown = (value as { filePath?: unknown }).filePath
    return typeof filePath === 'string' ? filePath : undefined
  } catch { return undefined }
}
