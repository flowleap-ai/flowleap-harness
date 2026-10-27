/**
 * Client-safe vocabulary of the `flowleapRoutines` Remote: the "Needs review" mark of a chat and the change event the
 * Host forwards. Types only; nothing here reaches a Host-only symbol.
 * @module @deepseek-ai/dsh-flowleap-routines/types
 */

import type {} from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** `running` while the run that marked the chat works; `needs_review` once it finished or the Host restarted. */
export type ReviewState = 'running' | 'needs_review'

/** The mark of one chat that received a routine run. */
export interface RoutineReview {
  /** The chat that received the run. */
  readonly sessionId: SessionId
  /** The scheduled task whose run the chat received. */
  readonly taskId: string
  /** Where the mark stands. */
  readonly state: ReviewState
  /** RFC 3339 UTC time the state was entered. */
  readonly since: string
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * A "Needs review" mark was put, changed, or cleared; clients refetch `flowleapRoutines.reviews()`.
     * @mode emit
     */
    'flowleap-routines/changed'(): void
  }
}
