/**
 * Client-safe vocabulary of the `flowleapRoutines` Remote: the "Needs review" mark of a chat, the register watches,
 * and the change event the Host forwards. Types only; nothing here reaches a Host-only symbol.
 * @module @deepseek-ai/dsh-flowleap-routines/types
 */

import type {} from '@deepseek-ai/cordis'
import type { ScheduleId } from '@deepseek-ai/dsh-schedule/client'
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

/** One register event as the office lists it. */
export interface RegisterEventView {
  /** ISO calendar date `YYYY-MM-DD` of the event. */
  readonly date: string
  /** Office event code. */
  readonly code: string
  /** Office event text. */
  readonly description: string
}

/** One watched application with what the last register read recorded. */
export interface WatchedApplication {
  /** Normalized application, for example `EP3456789` or `US17123456`. */
  readonly application: string
  /** RFC 3339 UTC time of the latest saved read; absent when no read is saved. */
  readonly readAt?: string
  /** The newest event of that read by date; absent when the read lists no event or no read is saved. */
  readonly latest?: RegisterEventView
}

/**
 * One register watch: the scheduled task that runs it and its applications. The watch records register events after
 * the office lists them; it does not compute deadlines.
 */
export interface RoutineWatch {
  /** The scheduled task that runs the watch. */
  readonly taskId: ScheduleId
  /** The chat that owns the task. */
  readonly sessionId: SessionId
  /** Task title. */
  readonly title: string
  /** RFC 3339 UTC time of the next register check while the task is active; absent for an inactive task. */
  readonly nextCheckAt?: string
  /** Watched applications in the order the attorney named them. */
  readonly applications: readonly WatchedApplication[]
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * A "Needs review" mark was put, changed, or cleared, or a register watch was saved or removed; clients refetch
     * `flowleapRoutines.reviews()` and `flowleapRoutines.watches()`.
     * @mode emit
     */
    'flowleap-routines/changed'(): void
  }
}
