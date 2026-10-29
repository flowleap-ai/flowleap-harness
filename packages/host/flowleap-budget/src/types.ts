/**
 * Client-safe vocabulary of the `flowleapBudget` Remote: the attorney's model spend and budget of this month, as the
 * firm's model gateway reports them for the runtime's own virtual key. Types only.
 * @module @deepseek-ai/dsh-flowleap-budget/types
 */

/** Why the spend is not known. */
export type BudgetUnknownReason =
  /** No gateway budget address is configured, for example in a local run. */
  | 'not_configured'
  /** The credential of the runtime's virtual key is not set. */
  | 'no_key'
  /** The gateway refused the key (HTTP 401 or 403). */
  | 'refused'
  /** The connection failed, the gateway redirected, or the answer did not arrive in time. */
  | 'unreachable'
  /** The gateway answered with an HTTP error status other than 401 and 403. */
  | 'gateway_error'
  /** The gateway answered with a body that is not the budget record. */
  | 'invalid_answer'

/** The month's spend as the gateway reports it, or why it is not known; never a made-up value. */
export type BudgetMonth =
  | {
    readonly state: 'known'
    /** UTC calendar month of the figures, `YYYY-MM`. */
    readonly month: string
    /** Spend of the attorney in this month, in US dollars. */
    readonly spentUsd: number
    /** Monthly budget of the attorney in US dollars; `null` when the firm sets no budget. */
    readonly budgetUsd: number | null
  }
  | { readonly state: 'unknown'; readonly reason: BudgetUnknownReason }
