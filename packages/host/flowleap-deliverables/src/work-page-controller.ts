/**
 * Host owner of the `flowleapWorkPages` Remote namespace: the office action work pages that a client lists and reads,
 * and the review change of one objection. A caller sees only the pages whose chat remote access allows it. A review
 * change carries only the review fields; the findings of a page change only through a save of its report.
 * @module
 */

import { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remote-access'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'
import { workPageIdSchema, type WorkPages } from './work-page/store.ts'
import {
  MAX_NOTE_LENGTH, MAX_OWNER_LENGTH, REVIEW_STATES, type WorkPageId, type WorkPageReviewRequest, type WorkPageSummary, type WorkPageView,
} from './work-page/types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host owner of the `flowleapWorkPages` Remote namespace. */
    flowleapWorkPages: FlowleapWorkPagesController
  }
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** A request field is not valid. */
    'flowleap-work-pages/invalid': { readonly field: string; readonly reason: string }
  }
}

/** What the controller needs from the plugin. */
export interface FlowleapWorkPagesControllerOptions {
  /** The work pages. */
  readonly pages: WorkPages
}

/** A review request; the Host trims the owner and the note. */
const reviewSchema = z.strictObject({
  id: workPageIdSchema,
  objection: z.string().min(1).max(64),
  state: z.enum(REVIEW_STATES).optional(),
  owner: z.string().trim().max(MAX_OWNER_LENGTH).optional(),
  note: z.string().trim().max(MAX_NOTE_LENGTH).optional(),
})

function invalid(error: z.ZodError): RemoteError<'flowleap-work-pages/invalid'> {
  // A failed parse names at least one issue; the root path is the request itself.
  const issue = error.issues[0]
  const field = issue.path.length === 0 ? 'request' : issue.path.join('.')
  const reason = issue.message
  return new RemoteError('flowleap-work-pages/invalid', `${field}: ${reason}`, { field, reason })
}

/** Host service backing the generated `ctx.remote.flowleapWorkPages` namespace. */
export class FlowleapWorkPagesController extends TypertRemoteService {
  static inject = ['remoteAccess']

  private readonly pages: WorkPages

  /**
   * @param ctx - Host context.
   * @param options - the work pages.
   */
  constructor(ctx: Context, options: FlowleapWorkPagesControllerOptions) {
    super(ctx, 'flowleapWorkPages')
    this.pages = options.pages
  }

  /**
   * The work pages the caller may see.
   * @returns one summary per page, newest save first.
   */
  @Remote
  async list(): Promise<WorkPageSummary[]> {
    return this.pages.list(this.visible)
  }

  /**
   * One work page with its file.
   * @param id - the page.
   * @returns the view.
   * @throws RemoteError `flowleap-work-pages/not-found`, `flowleap-work-pages/unreadable` or
   * `flowleap-work-pages/invalid`.
   */
  @Remote
  async read(id: WorkPageId): Promise<WorkPageView> {
    const parsed = workPageIdSchema.safeParse(id)
    if (!parsed.success) throw invalid(parsed.error)
    return this.pages.read(parsed.data, this.visible)
  }

  /**
   * Change the review state, the owner or the note of one objection; an omitted field keeps its value.
   * @param request - the page, the objection, and the fields to change.
   * @returns the page after the change.
   * @throws RemoteError `flowleap-work-pages/invalid`, `flowleap-work-pages/not-found`,
   * `flowleap-work-pages/objection-not-found` or `flowleap-work-pages/unreadable`.
   */
  @Remote
  async review(request: WorkPageReviewRequest): Promise<WorkPageView> {
    const parsed = reviewSchema.safeParse(request)
    if (!parsed.success) throw invalid(parsed.error)
    return this.pages.review(parsed.data, this.visible)
  }

  private readonly visible = (sessionId: SessionId): boolean => this.ctx.remoteAccess.allows({ kind: 'session', id: sessionId })
}

export default FlowleapWorkPagesController
