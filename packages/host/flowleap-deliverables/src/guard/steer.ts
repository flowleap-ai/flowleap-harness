/**
 * The one-time "report not written" nudge: at `agent/turn-stopping`, when the
 * turn owes a structured report (see `completion.ts`), the reason is steered
 * into the turn once through `agent.steer()`, so the model runs another step
 * instead of ending without the deliverable. A turn is steered at most once.
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { FsError } from '@deepseek-ai/dsh-fs'
import type { Session } from '@deepseek-ai/dsh-session'
import { checkPriorArtReportCompletion, type ReceiptFileReader } from './completion.ts'
import { STEER_SOURCE_KIND, TurnTracker } from './turn-tracker.ts'

/** The turn trackers of the live Sessions, keyed by Session. */
export class TurnTrackers {
  private readonly trackers = new Map<Session, TurnTracker>()

  /**
   * The tracker of one Session, created on first sight.
   * @param session - the Session.
   * @returns its tracker.
   */
  of(session: Session): TurnTracker {
    let tracker = this.trackers.get(session)
    if (tracker === undefined) {
      tracker = new TurnTracker()
      this.trackers.set(session, tracker)
    }
    return tracker
  }

  /**
   * The open turn number of a Session by id, for the delivery card.
   * @param sessionId - the Session id.
   * @returns the open turn, or `undefined` when none is open or the Session is unknown.
   */
  openTurn(sessionId: string): number | undefined {
    for (const [session, tracker] of this.trackers) {
      if (session.id === sessionId) return tracker.openTurn()
    }
    return undefined
  }

  /**
   * Forget a disposed Session.
   * @param session - the Session.
   */
  forget(session: Session): void {
    this.trackers.delete(session)
  }
}

/**
 * The receipt reader over `ctx.fs`: a missing file reads as `undefined`, any other failure throws.
 * @param ctx - a context whose `fs` is active.
 * @param signal - the turn's signal.
 * @returns the reader.
 */
export function receiptFileReader(ctx: Context, signal: AbortSignal): ReceiptFileReader {
  return {
    async readText(path) {
      try {
        const target = await ctx.fs.resolve(path, { signal })
        const info = await ctx.fs.stat(target, signal)
        if (info === undefined) return undefined
        return await ctx.fs.readText(target, signal)
      } catch (error) {
        if (error instanceof FsError && error.code === 'FS_NOT_FOUND') return undefined
        throw error
      }
    },
  }
}

/**
 * Attach the guard: fold every Session's events into turns and steer once per
 * turn that ends without its report.
 * @param ctx - the plugin context, with `fs` active.
 * @param trackers - the per-Session trackers.
 * @param onSteer - optional observer of the steer text (tests).
 */
export function registerCompletionGuard(ctx: Context, trackers: TurnTrackers, onSteer?: (agent: Agent, text: string) => void): void {
  const steered = new Set<string>()
  ctx.on('session/event', (session, event) => {
    trackers.of(session).observe(event)
  })
  ctx.on('session/disposed', (session) => {
    trackers.forget(session)
    for (const key of steered) if (key.startsWith(`${session.id}:`)) steered.delete(key)
  })
  ctx.on('agent/turn-stopping', async ({ agent, turn, signal }) => {
    const key = `${agent.session.id}:${String(turn)}`
    if (steered.has(key)) return
    const turns = trackers.of(agent.session).turns(turn)
    if (turns === undefined) return
    // The check contains its own read failures: a receipt it cannot read counts as unchanged.
    const reason = await checkPriorArtReportCompletion(turns.history, turns.current, receiptFileReader(ctx, signal))
    if (reason === undefined) return
    steered.add(key)
    onSteer?.(agent, reason)
    agent.steer(createUserMessage({ content: [{ type: 'text', text: reason }], source: { kind: STEER_SOURCE_KIND } }))
  })
}
