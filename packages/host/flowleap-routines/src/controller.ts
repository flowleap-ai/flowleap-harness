/**
 * Host owner of the `flowleapRoutines` Remote namespace: the "Needs review" marks a client lists, and the explicit
 * "done" that clears one.
 * @module
 */

import { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remote-access'
import { SessionId } from '@deepseek-ai/dsh-session'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { ReviewMarks } from './reviews.ts'
import type { RoutineReview } from './types.ts'

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
}

/** Host service backing the generated `ctx.remote.flowleapRoutines` namespace. */
export class FlowleapRoutinesController extends TypertRemoteService {
  static inject = ['remoteAccess']

  private readonly marks: ReviewMarks

  /**
   * @param ctx - Host context.
   * @param options - the marks.
   */
  constructor(ctx: Context, options: FlowleapRoutinesControllerOptions) {
    super(ctx, 'flowleapRoutines')
    this.marks = options.reviews
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
   * Clear the mark of one chat; a chat without a mark is a no-op. The Gateway gates the call on the `session` resource
   * the `sessionId` parameter names.
   * @param sessionId - the chat.
   */
  @Remote
  async done(sessionId: string): Promise<void> {
    await this.marks.clear(SessionId(sessionId))
  }
}

export default FlowleapRoutinesController
