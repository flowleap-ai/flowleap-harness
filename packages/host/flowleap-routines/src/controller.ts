/**
 * Host owner of the `flowleapRoutines` Remote namespace: the "Needs review" marks a client lists, the explicit
 * "done" that clears one, and the register watches with what their last reads recorded.
 * @module
 */

import { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remote-access'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { ReviewMarks } from './reviews.ts'
import type { RoutineReview, RoutineWatch } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host owner of the `flowleapRoutines` Remote namespace. */
    flowleapRoutines: FlowleapRoutinesController
  }
}

/** What the controller needs from the plugin. */
export interface FlowleapRoutinesControllerOptions {
  /** The marks. */
  readonly reviews: ReviewMarks
  /** Reads every register watch whose task exists. */
  readonly watches: () => Promise<RoutineWatch[]>
}

/** Host service backing the generated `ctx.remote.flowleapRoutines` namespace. */
export class FlowleapRoutinesController extends TypertRemoteService {
  static inject = ['remoteAccess']

  private readonly marks: ReviewMarks
  private readonly readWatches: () => Promise<RoutineWatch[]>

  /**
   * @param ctx - Host context.
   * @param options - the marks and the watch reader.
   */
  constructor(ctx: Context, options: FlowleapRoutinesControllerOptions) {
    super(ctx, 'flowleapRoutines')
    this.marks = options.reviews
    this.readWatches = options.watches
  }

  /**
   * The marked chats the caller may see.
   * @returns one view per mark, without the chats remote access denies the caller.
   */
  @Remote
  async reviews(): Promise<RoutineReview[]> {
    const reviews = await this.marks.list()
    return reviews.filter(review => this.ctx.remoteAccess.allows({ kind: 'session', id: review.sessionId }))
  }

  /**
   * The register watches the caller may see, next check first.
   * @returns one view per watch, without the watches of chats remote access denies the caller.
   */
  @Remote
  async watches(): Promise<RoutineWatch[]> {
    const watches = await this.readWatches()
    return watches.filter(watch => this.ctx.remoteAccess.allows({ kind: 'session', id: watch.sessionId }))
  }

  /**
   * Clear the mark of one chat; a chat without a mark is a no-op. The Gateway gates the call on the `session` resource
   * the `sessionId` parameter names.
   * @param sessionId - the chat.
   */
  @Remote
  async done(sessionId: SessionId): Promise<void> {
    await this.marks.clear(sessionId)
  }
}

export default FlowleapRoutinesController
