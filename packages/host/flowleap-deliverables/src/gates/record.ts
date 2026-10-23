/**
 * The record of an attorney decision: one line in
 * `drafting/<matter>/draft-application.working-record.md` per gate opened or
 * Error waived, with the IDE's labels plus the source of the decision, since
 * the harness has no editor whose save is the record. A question card writes
 * `by the attorney in chat (question card, call <callId>)`; a slash command
 * writes `by the attorney in chat (command /approve-claims)`. The waiver reason
 * itself stays in `findings.md`, as in the IDE; the record names the rule.
 * @module
 */

import { addRecordLine, emptyWorkingRecord } from '../drafting/working-record.ts'
import type { DraftingWorkspace } from '../drafting/workspace.ts'
import type { DraftingGateFlag } from '../drafting/frontmatter.ts'
import type { FindingsFileItem } from '../drafting/findings-file.ts'

/** The record labels of the gate decisions: the IDE's "set" CodeLens titles, and the waiver. */
export const GATE_RECORD_LABEL: Readonly<Record<DraftingGateFlag, string>> = { confirmed: 'Feature List confirmed', approved: 'Claims approved' }

/** The record label of a waiver. */
export const WAIVED_RECORD_LABEL = 'Error waived'

/** Where the decision came from: the question card of one tool call, or a slash command. */
export type DecisionSource =
  | { readonly kind: 'question-card'; readonly callId: string }
  | { readonly kind: 'command'; readonly command: string }

/**
 * The source clause of a record line.
 * @param source - the decision source.
 * @returns `by the attorney in chat (question card, call <id>)` or `by the attorney in chat (command /<name>)`.
 */
export function decisionSourceText(source: DecisionSource): string {
  return source.kind === 'question-card'
    ? `by the attorney in chat (question card, call ${source.callId})`
    : `by the attorney in chat (command /${source.command})`
}

/**
 * The value of a gate record line.
 * @param flag - the gate.
 * @param source - the decision source.
 * @param at - the decision time.
 * @param claimsHash - the SHA-256 of the approved claims body, for the `approved` gate.
 * @returns e.g. `by the attorney in chat (question card, call c1) at 2026-10-23T10:00:00.000Z; claims SHA-256 <hash>`.
 */
export function gateRecordValue(flag: DraftingGateFlag, source: DecisionSource, at: Date, claimsHash?: string): string {
  const hash = flag === 'approved' && claimsHash ? `; claims SHA-256 ${claimsHash}` : ''
  return `${decisionSourceText(source)} at ${at.toISOString()}${hash}`
}

/**
 * Add one gate record line to the matter's Working Record (created when none exists).
 * @param workspace - the matter.
 * @param flag - the gate opened.
 * @param source - the decision source.
 * @param at - the decision time.
 * @param claimsHash - the SHA-256 of the approved claims body, for the `approved` gate.
 */
export async function recordGateDecision(
  workspace: DraftingWorkspace, flag: DraftingGateFlag, source: DecisionSource, at: Date, claimsHash?: string,
): Promise<void> {
  const { workingRecord, matter } = workspace.folder
  const record = await workspace.read(workingRecord) ?? emptyWorkingRecord(matter)
  await workspace.write(workingRecord, addRecordLine(record, GATE_RECORD_LABEL[flag], gateRecordValue(flag, source, at, claimsHash)))
}

/**
 * Add one record line per waived rule: `Error waived: <rule> (<n> item(s), findings.md lines a, b) by the attorney in chat (…) at <time>`.
 * The reason is in `findings.md` under each item, not here.
 * @param workspace - the matter.
 * @param waived - the items waived, with their `findings.md` lines.
 * @param source - the decision source.
 * @param at - the decision time.
 */
export async function recordWaivers(
  workspace: DraftingWorkspace, waived: readonly FindingsFileItem[], source: DecisionSource, at: Date,
): Promise<void> {
  if (!waived.length) return
  let record = await workspace.read(workspace.folder.workingRecord) ?? emptyWorkingRecord(workspace.folder.matter)
  for (const rule of [...new Set(waived.map(item => item.finding.rule))]) {
    const ofRule = waived.filter(item => item.finding.rule === rule)
    const value = `${rule} (${String(ofRule.length)} item(s), findings.md line${ofRule.length > 1 ? 's' : ''} ${ofRule.map(item => String(item.fileLine)).join(', ')}) ${decisionSourceText(source)} at ${at.toISOString()}`
    record = addRecordLine(record, WAIVED_RECORD_LABEL, value)
  }
  await workspace.write(workspace.folder.workingRecord, record)
}
