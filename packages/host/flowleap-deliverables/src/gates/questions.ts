/**
 * The attorney gates as question cards (port plan section 4, founder ruling
 * of 2026-10-23: cards are the main path, the slash commands of `commands.ts`
 * the strict path). A drafting tool that stops at a closed gate asks the
 * attorney through `ctx.userQuestions.ask()`: the answer comes from the Web
 * answerer, never from the model's arguments, so the model can cause the
 * question but cannot answer it (ADR 0012 decision 3, PRD 0025 decision 1).
 * On "yes" the gate writes the flag or the waiver through the pure edits of
 * `edits.ts`, reads the flag back from the file before the tool continues (the
 * file stays the only gate), and adds one record line (`record.ts`). A
 * cancelled ask (`ASK_ABORTED`), a child agent (`DELEGATED_CALLER`), a missing
 * answerer or "Not yet" writes nothing: the tool returns its refusal unchanged.
 *
 * `remove_claim` confirms through `ctx.approval.request` instead; when the
 * session's approval policy is `never` (the `danger-full-access` preset of the
 * `flowleap-web` profile rejects every ask deterministically) or no answerer
 * is composed, it falls back to a one-option card `Remove claim N` / `Keep it`.
 * @module
 */

import type { Session } from '@deepseek-ai/dsh-session'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { ApprovalOutcome, ApprovalRequest } from '@deepseek-ai/dsh-user-approval'
import type { AskUserQuestionAnswer, AskUserQuestionAnswerItem, AskUserQuestionRequest } from '@deepseek-ai/dsh-user-questions'
import { findingLine, type DraftFinding } from '../drafting/finding.ts'
import { isWaivableError, parseFindingsFileItems } from '../drafting/findings-file.ts'
import { parseDraftingFrontmatter, readGateFlag, type DraftingGateFlag } from '../drafting/frontmatter.ts'
import { claimsHash, type DraftingWorkspace } from '../drafting/workspace.ts'
import { GATE_LABEL, waiveChoices, withGateFlag, withWaivers } from './edits.ts'
import { GATE_RECORD_LABEL, recordGateDecision, recordWaivers } from './record.ts'

/** `ctx.userQuestions.ask`, or a test's answerer. */
export type GateAsker = (request: AskUserQuestionRequest) => Promise<AskUserQuestionAnswer>

/** `ctx.approval.request`, or a test's decider. */
export type GateApprover = (request: ApprovalRequest) => Promise<ApprovalOutcome>

/** The interaction seams a gate runs on; each getter reads the service mounted at call time. */
export interface GateSeams {
  /** The question-card answerer; `undefined` without `dsh-user-questions`. */
  readonly ask: () => GateAsker | undefined
  /** The approval answerer; `undefined` without `dsh-user-approval`. */
  readonly approve: () => GateApprover | undefined
  /** The session's effective approval policy; `undefined` when unknown. */
  readonly approvalPolicy: (session: Session) => 'ask' | 'never' | undefined
  /** The clock of the record lines; a test passes its own. */
  readonly now?: () => Date
  /** Where a gate says what it did and why it did not open. */
  readonly info?: (message: string) => void
}

/** Why a gate did not open; the tool returns the same refusal for each. */
export type GateClosedReason = 'no-answerer' | 'no-agent' | 'declined' | 'aborted' | 'delegated' | 'not-set' | 'not-live' | 'failed' | 'no-file'

/** The outcome of a gate: opened (the file now carries the flag or the waivers), or closed with the reason. */
export type GateOutcome =
  | { readonly opened: true; readonly detail: string }
  | { readonly opened: false; readonly reason: GateClosedReason }

/** The question ids of the three cards. */
export const GATE_QUESTION_ID: Readonly<Record<DraftingGateFlag, string>> = { confirmed: 'confirm-feature-list', approved: 'approve-claims' }

/** The question ids of the two-question waive batch. */
export const WAIVE_QUESTION_ID = { items: 'waive-items', reason: 'waive-reason' } as const

/** The "no" option of the gate cards. */
export const NOT_YET = 'Not yet'

/** The error code of a `UserQuestionError`, when the thrown value carries one. */
function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : undefined
}

function closedBy(error: unknown): GateClosedReason {
  switch (errorCode(error)) {
    case 'ASK_ABORTED': return 'aborted'
    case 'DELEGATED_CALLER': return 'delegated'
    case 'CALLER_NOT_LIVE': return 'not-live'
    case 'NO_PROVIDER': return 'no-answerer'
    default: return 'failed'
  }
}

/**
 * The answer item of one question of a batch.
 * @param answer - the card's answer.
 * @param id - the question id.
 * @returns the item, or `undefined` when the question was not answered.
 */
export function answerOf(answer: AskUserQuestionAnswer, id: string): AskUserQuestionAnswerItem | undefined {
  return answer.answers.find(item => item.id === id)
}

/**
 * Ask the attorney one card and return the answer, or the reason no answer came.
 * @param seams - the seams.
 * @param exec - the tool call the card is keyed by.
 * @param questions - the card's questions.
 * @returns the answer, or the closed reason.
 */
export async function askCard(seams: GateSeams, exec: ToolRunContext, questions: AskUserQuestionRequest['questions']): Promise<AskUserQuestionAnswer | GateClosedReason> {
  const ask = seams.ask()
  if (ask === undefined) return 'no-answerer'
  if (exec.agent === undefined) return 'no-agent'
  try {
    return await ask({ questions, agent: exec.agent, signal: exec.signal, wait: { callId: exec.callId } })
  } catch (error) {
    const reason = closedBy(error)
    seams.info?.(`flowleap-deliverables: gate card not answered (${reason}): ${error instanceof Error ? error.message : String(error)}`)
    return reason
  }
}

/**
 * The Confirm Feature List or Approve Claims card: shows the file body, offers
 * `Confirm Feature List` / `Approve Claims` and `Not yet`; on "yes" sets the flag
 * (comments kept), reads it back and records the decision with the call id.
 * @param workspace - the matter.
 * @param exec - the tool call that stopped at the gate.
 * @param seams - the seams.
 * @param flag - the gate.
 * @returns opened, or the reason it stayed closed.
 */
export async function askGate(
  workspace: DraftingWorkspace, exec: ToolRunContext, seams: GateSeams, flag: DraftingGateFlag,
): Promise<GateOutcome> {
  const { folder } = workspace
  const path = flag === 'confirmed' ? folder.featureList : folder.claims
  const before = await workspace.read(path)
  if (before === undefined) return { opened: false, reason: 'no-file' }
  const subject = flag === 'confirmed' ? 'Feature List' : 'claims'
  const answer = await askCard(seams, exec, [{
    id: GATE_QUESTION_ID[flag],
    header: flag === 'confirmed' ? 'Feature List' : 'Claims',
    question: `${flag === 'confirmed' ? 'Confirm the Feature List' : 'Approve the claims'} of ${folder.matter}? Only the attorney opens this gate; the agent cannot.`,
    detail: parseDraftingFrontmatter(before).body.trim(),
    options: [
      { label: GATE_LABEL[flag], description: `Writes \`${flag}: true\` to ${path} and records the decision in the Working Record.` },
      { label: NOT_YET, description: `Nothing is written; review the ${subject} first.` },
    ],
  }])
  if (typeof answer === 'string') return { opened: false, reason: answer }
  if (!answerOf(answer, GATE_QUESTION_ID[flag])?.selected.includes(GATE_LABEL[flag])) return { opened: false, reason: 'declined' }
  // The file may have changed while the card was open: set the flag on what is there now.
  const current = await workspace.read(path)
  if (current === undefined) return { opened: false, reason: 'no-file' }
  const next = withGateFlag(current, flag)
  if (next !== undefined) await workspace.write(path, next)
  // Read back: the file is the gate, not the answer.
  const after = await workspace.read(path)
  if (after === undefined || readGateFlag(parseDraftingFrontmatter(after).fields, flag) !== 'set') return { opened: false, reason: 'not-set' }
  const hash = flag === 'approved' ? claimsHash(after) : undefined
  await recordGateDecision(workspace, flag, { kind: 'question-card', callId: String(exec.callId) }, (seams.now ?? (() => new Date()))(), hash)
  seams.info?.(`flowleap-deliverables: ${GATE_RECORD_LABEL[flag]} by the attorney (question card, call ${String(exec.callId)}) in ${folder.folder}`)
  return { opened: true, detail: `${GATE_RECORD_LABEL[flag]} by the attorney in chat (question card).` }
}

/**
 * The Waive Errors card: two questions in one batch, `waive-items` (multi-select, one option
 * per open Error and one `All N Errors of rule X` per rule with more than two) and
 * `waive-reason` (free text). On an answer with items and a reason it writes `  - Waived:
 * <reason>` under each chosen item, reads the file back and records one line per waived rule.
 * An empty reason or no item writes nothing.
 * @param workspace - the matter.
 * @param exec - the tool call that stopped at the Errors.
 * @param seams - the seams.
 * @param blocking - the blocking findings, for the card's detail.
 * @returns opened with the count, or the reason it stayed closed.
 */
export async function askWaiver(
  workspace: DraftingWorkspace, exec: ToolRunContext, seams: GateSeams, blocking: readonly DraftFinding[],
): Promise<GateOutcome> {
  const { folder } = workspace
  const before = await workspace.read(folder.findings)
  if (before === undefined) return { opened: false, reason: 'no-file' }
  const choices = waiveChoices(before)
  if (!choices.length) return { opened: false, reason: 'declined' }
  const answer = await askCard(seams, exec, [
    {
      id: WAIVE_QUESTION_ID.items,
      header: 'Waive Errors',
      question: `Which open Errors of ${folder.findings} does the attorney waive? Skip to fix them in the draft instead.`,
      detail: blocking.map(findingLine).join('\n'),
      options: choices.map(choice => ({ label: choice.label, ...choice.description ? { description: choice.description } : {} })),
      multiSelect: true,
    },
    {
      id: WAIVE_QUESTION_ID.reason,
      header: 'Reason',
      question: `Reason for the waiver, written as \`  - Waived: <reason>\` under each chosen item in ${folder.findings}. One line; an empty reason waives nothing.`,
    },
  ])
  if (typeof answer === 'string') return { opened: false, reason: answer }
  const chosen = new Set(answerOf(answer, WAIVE_QUESTION_ID.items)?.selected ?? [])
  const lines = [...new Set(choices.filter(choice => chosen.has(choice.label)).flatMap(choice => choice.fileLines))]
  const reasonAnswer = answerOf(answer, WAIVE_QUESTION_ID.reason)
  const reason = (reasonAnswer?.custom ?? reasonAnswer?.selected[0] ?? '').trim()
  if (!lines.length || !reason) return { opened: false, reason: 'declined' }
  const current = await workspace.read(folder.findings)
  if (current === undefined) return { opened: false, reason: 'no-file' }
  const openBefore = parseFindingsFileItems(current).filter(isWaivableError).length
  const next = withWaivers(current, lines, reason)
  if (next === undefined) return { opened: false, reason: 'declined' }
  await workspace.write(folder.findings, next.text)
  // Read back: the waivers count only when the file carries them.
  const after = await workspace.read(folder.findings)
  const openAfter = after === undefined ? openBefore : parseFindingsFileItems(after).filter(isWaivableError).length
  if (openAfter !== openBefore - next.waived.length) return { opened: false, reason: 'not-set' }
  await recordWaivers(workspace, next.waived, { kind: 'question-card', callId: String(exec.callId) }, (seams.now ?? (() => new Date()))())
  seams.info?.(`flowleap-deliverables: ${String(next.waived.length)} Error(s) waived by the attorney (question card, call ${String(exec.callId)}) in ${folder.folder}`)
  return { opened: true, detail: `${String(next.waived.length)} Error(s) waived by the attorney in chat (question card); the reason is under each item in ${folder.findings}.` }
}

/** How the attorney confirmed a claim removal. */
export type RemovalConfirmation =
  | { readonly confirmed: true; readonly via: 'approval' | 'question-card' }
  | { readonly confirmed: false; readonly reason: GateClosedReason | 'rejected' | 'no-channel' }

/**
 * Confirm a claim removal: `ctx.approval.request` first (the plan's choice), unless the
 * session's policy is `never`, which would reject deterministically; then, when the approval
 * answerer is unavailable or the policy is `never`, the one-option card `Remove claim N` / `Keep it`.
 * @param workspace - the matter.
 * @param exec - the `remove_claim` call.
 * @param seams - the seams.
 * @param claim - the claim number.
 * @param cost - the sentence that states what the removal does, for the card and the audit reason.
 * @returns whether the attorney confirmed, and through which channel.
 */
export async function confirmRemoval(
  workspace: DraftingWorkspace, exec: ToolRunContext, seams: GateSeams, claim: number, cost: string,
): Promise<RemovalConfirmation> {
  const approve = seams.approve()
  const agent = exec.agent
  const policy = agent === undefined ? undefined : seams.approvalPolicy(agent.session)
  if (approve !== undefined && agent !== undefined && policy !== 'never') {
    let outcome: ApprovalOutcome
    try {
      outcome = await approve({ agent, toolName: 'remove_claim', callId: exec.callId, reason: cost, signal: exec.signal })
    } catch (error) {
      seams.info?.(`flowleap-deliverables: remove_claim approval request failed: ${error instanceof Error ? error.message : String(error)}`)
      outcome = 'unavailable'
    }
    seams.info?.(`flowleap-deliverables: remove_claim approval outcome ${outcome} (policy ${policy ?? 'unknown'})`)
    if (outcome === 'allowed-once') return { confirmed: true, via: 'approval' }
    if (outcome === 'rejected') return { confirmed: false, reason: 'rejected' }
    if (outcome === 'cancelled') return { confirmed: false, reason: 'aborted' }
  } else if (policy === 'never') {
    seams.info?.('flowleap-deliverables: remove_claim approval skipped: the session policy is never; asking a question card instead')
  }
  const label = `Remove claim ${String(claim)}`
  const answer = await askCard(seams, exec, [{
    id: 'remove-claim',
    header: 'Remove Claim',
    question: `Remove claim ${String(claim)} of ${workspace.folder.matter} from ${workspace.folder.claims}?`,
    detail: cost,
    options: [
      { label, description: 'Removes the claim, renumbers the later claims and re-opens the claims approval.' },
      { label: 'Keep it', description: 'Nothing is written.' },
    ],
  }])
  if (typeof answer === 'string') return { confirmed: false, reason: answer === 'no-answerer' && approve === undefined ? 'no-channel' : answer }
  return answerOf(answer, 'remove-claim')?.selected.includes(label) ? { confirmed: true, via: 'question-card' } : { confirmed: false, reason: 'declined' }
}
