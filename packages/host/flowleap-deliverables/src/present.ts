/**
 * The delivery card: after a successful save the writer queues the report and
 * the working record here, and this plugin's own `tools/result` listener
 * appends one `deliverables/presented` event keyed by the writer's call id.
 * The event type is the one `dsh-tool-present` declares, so the Web delivery
 * card shows the two files without a new Session event type. The evidence and
 * second-read JSON companions are never presented.
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ToolExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import type { PresentedFile } from '@deepseek-ai/dsh-tool-present/types'
import type {} from '@deepseek-ai/dsh-session'

/** The trailing line of every successful save's result text. */
export const DELIVERED_LINE = 'Delivered to the user; do not call `present` for these files.'

/** Files a save queued for the delivery card, released when its result settles. */
export class PresentQueue {
  private readonly pending = new WeakMap<ToolExecution, PresentedFile[]>()

  /**
   * Queue the files of one save; they are presented only if the result is not an error.
   * @param exec - the writer's execution.
   * @param files - the report and the working record, absolute process paths.
   */
  queue(exec: ToolExecution, files: PresentedFile[]): void {
    this.pending.set(exec, files)
  }

  /**
   * Take the queued files of one execution.
   * @param exec - the settled execution.
   * @returns the files, or `undefined` when nothing was queued.
   */
  take(exec: ToolExecution): PresentedFile[] | undefined {
    const files = this.pending.get(exec)
    this.pending.delete(exec)
    return files
  }
}

/**
 * Append `deliverables/presented` for every settled save that queued files.
 * @param ctx - the plugin context, with `tools` active.
 * @param queue - the writer's queue.
 * @param turnOf - the open turn number of a Session, from this plugin's turn tracker.
 */
export function registerPresent(ctx: Context, queue: PresentQueue, turnOf: (sessionId: string) => number | undefined): void {
  ctx.on('tools/result', (exec: Readonly<ToolExecution>, result: Readonly<ToolExecutionResult>) => {
    const files = queue.take(exec)
    if (files === undefined || result.isError || exec.agent === undefined) return
    const session = exec.agent.session
    session.append('deliverables/presented', { turn: turnOf(session.id) ?? 0, callId: exec.callId, files })
  })
}
