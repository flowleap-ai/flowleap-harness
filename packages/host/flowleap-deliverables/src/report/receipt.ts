/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The prior-art artifact receipt: the line a structured save prints to bind the
 * report and its evidence companion to the bytes written, the Fallback Coverage
 * and open points an invalidity chart adds to it, and the routing predicates
 * that decide when a turn owes a report. Copied from the receipt half of the
 * IDE's `priorArtReportCompletion.ts` (see SOURCE.json); the receipt's
 * `reportUri`/`evidenceUri` fields carry the harness's canonical process paths
 * where the IDE put `file://` URIs, and the text format is otherwise unchanged.
 * The turn-level check that reads receipts back lives in `../guard/completion.ts`.
 * @module
 */

import { sha256Hex } from './text.ts'

/** The four fields that bind one save: the report and its evidence companion, each with its digest. */
export interface ReportReceipt {
  readonly reportUri: string
  readonly reportDigest: string
  readonly evidenceUri: string
  readonly evidenceDigest: string
}

/**
 * One open point of a saved invalidity chart (PRD 0024 C4): a short id the Round Report and a Search
 * Round's `answers` name, and one line that says what is open. Computed by the writer from the record.
 */
export interface ReceiptOpenPoint {
  readonly id: string
  readonly text: string
}

/**
 * Fallback Coverage of a saved invalidity chart, as its receipt states it (PRD 0024 C3): how many
 * fallbacks the cited art does not cover, how many Search Rounds the chart records, and which
 * fallbacks are not covered (claim numbers, or a description fallback's feature). The receipt also
 * lists the chart's open points (C4), in the order the Round Report numbers them.
 */
export interface ReceiptFallbacks {
  readonly fallbacksNotCovered: number
  readonly rounds: number
  readonly notCovered: readonly string[]
  readonly openPoints: readonly ReceiptOpenPoint[]
  /** The chart's structured critical date; absent when the chart gave none, so the date check was skipped. */
  readonly criticalDate?: string
}

/** A receipt read back from a tool result, with where in the turn the writer call sat. */
export interface ParsedReportReceipt extends ReportReceipt {
  /** The index of the round that holds the writer call, within its turn. */
  readonly roundIndex: number
  readonly callIndex: number
  /** The ids of the open points the receipt lists; absent on older receipts and on other templates. */
  readonly openPoints?: readonly string[]
}

/** The line prefix every receipt starts with. */
export const RECEIPT_PREFIX = 'Prior-art artifact receipt: '
const fallbackFields = ' fallbacksNotCovered='
const openPointsHeader = 'Open points: '
const openPointLine = /^Open point \[(?<id>[^\]\s]+)\]: /

/** The words that mark the Round Report nudge in a round's recorded hook context. */
export const ROUND_REPORT_NUDGE_MARKER = 'this turn ends without a Round Report'

/**
 * The prompt line that closes every Round Report (ADR 0016 amendment, decision 7). It asks for the
 * open-point ids, not the question numbers: question numbers and claim numbers share the same small
 * integers, and a rung is named by a claim number (#745).
 */
export const ROUND_REPORT_PROMPT = 'Reply with the ids to run (for example rung-3, element-1.3), \'all\', or your own steer.'

/**
 * Bind the report and its evidence revision to the bytes the structured writer actually saved. An
 * invalidity chart's receipt also states its Fallback Coverage counts and, one line each, its open
 * points, so the completion guard reads no file to decide on a Round Report.
 * @param report - the report's canonical process path.
 * @param document - the report bytes as written.
 * @param evidence - the evidence companion's canonical process path.
 * @param snapshot - the evidence companion bytes as written.
 * @param fallbacks - the Fallback Coverage of an invalidity chart, when the save was one.
 * @returns the receipt text, one or more lines.
 */
export function priorArtReportReceipt(
  report: string,
  document: string,
  evidence: string,
  snapshot: string,
  fallbacks?: ReceiptFallbacks,
): string {
  const receipt: ReportReceipt = {
    reportUri: report, reportDigest: sha256Hex(document), evidenceUri: evidence, evidenceDigest: sha256Hex(snapshot),
  }
  const line = RECEIPT_PREFIX + JSON.stringify(receipt)
  if (!fallbacks) { return line }
  // One line each: a description fallback's feature may hold line breaks, which would split a line.
  const oneLine = (value: string) => value.replace(/\s+/g, ' ').trim()
  const notCovered = fallbacks.notCovered.map(oneLine).filter(Boolean).join(',')
  const criticalDate = fallbacks.criticalDate ? `Critical date: ${fallbacks.criticalDate}.` : 'Critical date: not given (no criticalDate), so the publication dates of the cited documents were not checked.'
  const points = fallbacks.openPoints
  const header = points.length
    ? `${openPointsHeader}${points.length}. ${criticalDate} Write the Round Report now: this receipt, then one numbered question per open point in this order, each with its id and your recommended next step, then the line "${ROUND_REPORT_PROMPT}" Then end the turn; run a Search Round only on the expert's answer.`
    : `${openPointsHeader}none. ${criticalDate}`
  return [`${line}${fallbackFields}${fallbacks.fallbacksNotCovered} rounds=${fallbacks.rounds} notCovered=${notCovered}`, header, ...points.map(point => `Open point [${point.id}]: ${oneLine(point.text)}`)].join('\n')
}

/**
 * Conservative routing for explicit English prior-art deliverable requests, not every patent question.
 * @param message - the user's message text.
 * @returns whether the message asks for a prior-art report, an invalidity chart or a Find Better report.
 */
export function requestsPriorArtReport(message: string): boolean {
  return (/\bprior[\s-]+art\b/i.test(message) && /\b(report|review|save|write|output)\b/i.test(message))
    || requestsInvalidityChart(message) || requestsFindBetter(message)
}

/**
 * A Find Better run is the same structured report, two-sided, so it is finalized on the same path.
 * @param message - the user's message text.
 * @returns whether the message asks for a Find Better report.
 */
export function requestsFindBetter(message: string): boolean {
  return /\bfind[\s-]+better\b/i.test(message)
}

/**
 * An invalidity deliverable is the same structured report with the challenged patent's elements as
 * its rows, so it is finalized and checked on the same path.
 * @param message - the user's message text.
 * @returns whether the message asks for an invalidity chart.
 */
export function requestsInvalidityChart(message: string): boolean {
  return /\binvalidity\b/i.test(message) && /\b(report|chart|analysis|case)\b/i.test(message)
}

/** The tool name the receipts belong to, shared with the IDE. */
export const WRITER_TOOL_NAME = 'write_patent_results'

/** One tool call as the guard sees it: the model's name for it, its id, and its arguments as JSON text. */
export interface GuardToolCall {
  readonly id: string
  readonly name: string
  readonly arguments: string
}

/**
 * A writer call that finalizes a structured report: `prior-art-report` and `find-better-report`
 * always, and `invalidity-claim-chart` when it carries the coverage rows the writer validates and
 * renders.
 * @param call - the tool call.
 * @returns whether the call is a structured save.
 */
export function finalizesStructuredReport(call: GuardToolCall): boolean {
  if (call.name !== WRITER_TOOL_NAME) { return false }
  try {
    const parsed: unknown = JSON.parse(call.arguments)
    if (typeof parsed !== 'object' || parsed === null) { return false }
    const value = parsed as { template?: unknown; coverage?: unknown }
    return value.template === 'prior-art-report' || value.template === 'find-better-report'
      || (value.template === 'invalidity-claim-chart' && Array.isArray(value.coverage) && value.coverage.length > 0)
  } catch { return false }
}

/**
 * Read one receipt out of a writer call's result text, when the call was a structured save and its
 * result carries a well-formed receipt line.
 * @param resultText - the result text of the writer call.
 * @param position - where the call sat in its turn.
 * @returns the parsed receipt, or `undefined`.
 */
export function parseReceipt(
  resultText: string,
  position: { readonly roundIndex: number; readonly callIndex: number },
): ParsedReportReceipt | undefined {
  const lines = resultText.split('\n')
  const line = lines.find(entry => entry.startsWith(RECEIPT_PREFIX))
  if (!line) { return undefined }
  // The JSON holds paths and hex digests only, so the first fallback field marks its end.
  const body = line.slice(RECEIPT_PREFIX.length)
  const fieldsAt = body.indexOf(fallbackFields)
  // Only a receipt with the open-points header lists open points; an older one lists none.
  const openPoints = lines.some(entry => entry.startsWith(openPointsHeader))
    ? lines.flatMap((entry) => { const id = openPointLine.exec(entry)?.groups?.['id']; return id ? [id] : [] })
    : undefined
  try {
    const parsed: unknown = JSON.parse(fieldsAt < 0 ? body : body.slice(0, fieldsAt))
    if (typeof parsed !== 'object' || parsed === null) { return undefined }
    const value = parsed as Partial<ReportReceipt>
    if ([value.reportUri, value.reportDigest, value.evidenceUri, value.evidenceDigest].every(field => typeof field === 'string') && value.reportUri && value.evidenceUri && value.reportDigest && value.evidenceDigest) {
      return {
        reportUri: value.reportUri, reportDigest: value.reportDigest, evidenceUri: value.evidenceUri, evidenceDigest: value.evidenceDigest,
        ...position, ...(openPoints ? { openPoints } : {}),
      }
    }
  } catch { /* Older or malformed result: no receipt. */ }
  return undefined
}
