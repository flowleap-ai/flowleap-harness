/**
 * The "Needs review" mark: one row per chat that received a run, in the `reviews` table.
 *
 * ```
 * (none) --run delivered, Agent running--> running --Agent idle--> needs_review
 * (none) --run delivered, Agent idle-----> needs_review
 * running --Host start----------------------> needs_review
 * running | needs_review --user message or done--> (none)
 * ```
 * @module
 */

import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import type { ReviewRecord, routinesDomain, TaskId } from './storage.ts'
import type { RoutineReview } from './types.ts'

/** The live Agents, for the status of the chat that received a run. */
export interface AgentLookup {
  /**
   * The live Agent of one Session.
   * @param id - the Session.
   * @returns the Agent, or `undefined` while none is live.
   */
  get(id: SessionId): Agent | undefined
}

/** Owns the `reviews` table and announces each committed change. */
export class ReviewMarks {
  /**
   * @param domain - the `flowleap_routines` domain while it opens; every operation waits for it.
   * @param agents - the live Agents.
   * @param changed - called after each committed change.
   */
  constructor(
    private readonly domain: Promise<Domain<typeof routinesDomain>>,
    private readonly agents: AgentLookup,
    private readonly changed: () => void,
  ) {}

  /**
   * Mark the chat that received a run: `running` while its Agent runs, `needs_review` at once when no Agent runs there.
   * A mark already on the chat is replaced.
   * @param sessionId - the chat that received the run.
   * @param taskId - the task whose run it received.
   */
  async started(sessionId: SessionId, taskId: TaskId): Promise<void> {
    const running = this.agents.get(sessionId)?.status === 'running'
    await this.put(sessionId, { taskId, state: running ? 'running' : 'needs_review', since: now() })
  }

  /**
   * The Agent of a chat went idle: a `running` mark becomes `needs_review`; any other state is unchanged.
   * @param sessionId - the idle chat.
   */
  async idle(sessionId: SessionId): Promise<void> {
    const review = (await this.domain).table('reviews').get(sessionId)
    if (review?.state !== 'running') return
    await this.put(sessionId, { ...review, state: 'needs_review', since: now() })
  }

  /**
   * Host start: every `running` mark becomes `needs_review`, because the Host stop ended that run and the attorney
   * still reviews what it did.
   */
  async convertRunning(): Promise<void> {
    const reviews = (await this.domain).table('reviews')
    const running = [...reviews.entries()].filter(([, review]) => review.state === 'running')
    if (running.length === 0) return
    const since = now()
    for (const [sessionId, review] of running) await reviews.put(sessionId, { ...review, state: 'needs_review', since })
    this.changed()
  }

  /**
   * Clear the mark of one chat; a chat without a mark is unchanged and announces nothing.
   * @param sessionId - the chat.
   * @returns whether a mark was cleared.
   */
  async clear(sessionId: SessionId): Promise<boolean> {
    const reviews = (await this.domain).table('reviews')
    if (reviews.get(sessionId) === undefined) return false
    await reviews.delete(sessionId)
    this.changed()
    return true
  }

  /**
   * Every marked chat.
   * @returns one view per mark, in table order.
   */
  async list(): Promise<RoutineReview[]> {
    const reviews = (await this.domain).table('reviews')
    return [...reviews.entries()].map(([sessionId, review]) => ({ sessionId, ...review }))
  }

  private async put(sessionId: SessionId, review: ReviewRecord): Promise<void> {
    await (await this.domain).table('reviews').put(sessionId, review)
    this.changed()
  }
}

function now(): string {
  return new Date(Date.now()).toISOString()
}
