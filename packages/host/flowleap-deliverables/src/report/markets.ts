/**
 * The markets an FTO memo clears come from the user, not from the model. An
 * FTO opinion answers whether the client may make and sell the product in the
 * client's markets; where the patents are in force is a different fact. The
 * first `fto-memo` save of a path in a Session asks the user one question card
 * (the model's `jurisdictions` is the proposed option, any other markets are
 * typed); the answer fills the `Jurisdiction(s)` header cell and is remembered
 * for the Session and path. A re-save that proposes nothing or the remembered
 * markets does not ask again; a different proposal asks again, so only the user
 * changes the markets. The model never sees the card, so the save result
 * states the answer and tells the model to fit the memo body to it. An empty answer or
 * a cancelled card refuses the save. When no answer can come (no
 * `dsh-user-questions`, a delegated caller, no live caller), the model's value
 * fills the cell marked as not confirmed (S5 acceptance pass 4, 2026-10-26).
 * @module
 */

import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { answerOf, askCard, type GateSeams } from '../gates/questions.ts'

/** The question id of the markets card. */
export const MARKETS_QUESTION_ID = 'fto-markets'

/** The suffix of a cell value the user did not confirm. */
export const UNCONFIRMED_MARKETS = '(not confirmed by the user)'

/** The confirmed markets of the live Sessions, per report path. */
export class ConfirmedMarkets {
  private readonly confirmed = new Map<string, string>()

  /**
   * The markets the user confirmed for a report.
   * @param sessionId - the owning Session.
   * @param processPath - the canonical process path of the report.
   * @returns the markets, or `undefined` before the user answered.
   */
  get(sessionId: string, processPath: string): string | undefined {
    return this.confirmed.get(`${sessionId}\n${processPath}`)
  }

  /**
   * Remember the markets the user confirmed for a report.
   * @param sessionId - the owning Session.
   * @param processPath - the canonical process path of the report.
   * @param markets - the user's answer.
   */
  set(sessionId: string, processPath: string, markets: string): void {
    this.confirmed.set(`${sessionId}\n${processPath}`, markets)
  }

  /**
   * Forget a disposed Session.
   * @param sessionId - the Session id.
   */
  forget(sessionId: string): void {
    for (const key of this.confirmed.keys()) if (key.startsWith(`${sessionId}\n`)) this.confirmed.delete(key)
  }
}

/** The markets an fto-memo save writes into its header, or why it writes nothing. */
export type MarketsResolution =
  | { readonly kind: 'confirmed'; readonly markets: string; readonly via: 'card' | 'earlier-card'; readonly proposed: string | undefined }
  | { readonly kind: 'unconfirmed'; readonly markets: string | undefined }
  | { readonly kind: 'refused'; readonly text: string }

/**
 * Resolve the markets of an fto-memo save: the remembered answer, else the user's answer to the
 * markets card, else (no answer possible) the model's proposal marked as not confirmed.
 * @param seams - the question seams.
 * @param exec - the save call the card is keyed by.
 * @param memory - the confirmed markets.
 * @param processPath - the canonical process path of the report.
 * @param proposed - the model's `jurisdictions`, offered as the first option.
 * @returns the resolution.
 */
export async function resolveMarkets(
  seams: GateSeams, exec: ToolRunContext, memory: ConfirmedMarkets, processPath: string, proposed: string | undefined,
): Promise<MarketsResolution> {
  const sessionId = exec.agent?.session.id
  const offer = proposed?.trim() || undefined
  if (sessionId === undefined) return { kind: 'unconfirmed', markets: offer }
  const remembered = memory.get(sessionId, processPath)
  if (remembered !== undefined && (offer === undefined || offer === remembered)) {
    return { kind: 'confirmed', markets: remembered, via: 'earlier-card', proposed: offer }
  }
  const answer = await askCard(seams, exec, [{
    id: MARKETS_QUESTION_ID,
    header: 'Markets',
    question: 'Which markets must this FTO memo clear? The memo states them in its Jurisdiction(s) row and assesses the risk for these markets only.',
    ...offer ? { options: [{ label: offer, description: 'Proposed by the agent. Type other markets to replace them.' }] } : {},
  }])
  if (answer === 'aborted') return { kind: 'refused', text: 'Report was not saved. The markets question was cancelled; nothing was written.' }
  if (typeof answer === 'string') return { kind: 'unconfirmed', markets: offer }
  const item = answerOf(answer, MARKETS_QUESTION_ID)
  const markets = (item?.custom ?? item?.selected[0] ?? '').trim()
  if (!markets) {
    return { kind: 'refused', text: 'Report was not saved. The user named no markets for the FTO memo. Ask the user which markets the memo must clear, then save again.' }
  }
  memory.set(sessionId, processPath, markets)
  return { kind: 'confirmed', markets, via: 'card', proposed: offer }
}

/**
 * The save result's line about the markets, the model's only view of the card.
 * @param resolution - a resolution that did not refuse the save.
 * @returns the line, starting with a newline.
 */
export function marketsResultLine(resolution: Exclude<MarketsResolution, { readonly kind: 'refused' }>): string {
  if (resolution.kind === 'unconfirmed') {
    return `\nMarkets: not confirmed by the user (no answer was possible); the memo header marks them ${UNCONFIRMED_MARKETS}.`
  }
  const fit = `Assess the risk for these markets only: if the memo body covers other markets or leaves one of them out, revise the body for ${resolution.markets} and save again.`
  if (resolution.via === 'earlier-card') {
    return `\nMarkets: ${resolution.markets}, the user's answer to the Markets question card earlier in this Session; the memo header states them. ${fit}`
  }
  const proposal = resolution.proposed === undefined ? 'you proposed none' : `your proposal was "${resolution.proposed}"`
  return `\nMarkets: the user answered this save's Markets question card with "${resolution.markets}" (${proposal}); the memo header states them. ${fit}`
}

/**
 * The `jurisdictions` value a resolution writes into the header cell.
 * @param resolution - a resolution that did not refuse the save.
 * @returns the cell value, or `undefined` when there is none.
 */
export function marketsCellValue(resolution: Exclude<MarketsResolution, { readonly kind: 'refused' }>): string | undefined {
  if (resolution.kind === 'confirmed') return resolution.markets
  return resolution.markets === undefined ? undefined : `${resolution.markets} ${UNCONFIRMED_MARKETS}`
}
