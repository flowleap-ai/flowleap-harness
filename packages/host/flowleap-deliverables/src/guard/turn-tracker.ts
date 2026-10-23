/**
 * Fold a Session's events into the turns the completion check reads: the
 * user's request, one round per model step with its tool calls and assistant
 * text, each tool call's result text by call id, and the steer text this
 * plugin added. The tracker observes `session/event` as events are appended,
 * so it never reads the Session log synchronously.
 * @module
 */

import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { contentText } from '../ledger/recorder.ts'
import type { GuardRound, ReportCompletionTurn } from './completion.ts'

/**
 * The `MessageSource.kind` of the context this plugin steers into a turn and of
 * the judge prompts: the user kind, as the agent loop's own steering uses, so no
 * persisted source type is added. The tracker tells the steer from the user's
 * request by position: the first user message of a turn is the request, a later
 * one is context the turn received.
 */
export const STEER_SOURCE_KIND = 'user'

/** A turn being folded: mutable while open, read as a {@link ReportCompletionTurn}. */
interface OpenTurn {
  readonly turn: number
  message: string
  readonly rounds: MutableRound[]
  readonly results: Record<string, string>
  /** Steer text seen before the next step opened its round. */
  pendingHook: string | undefined
}

interface MutableRound {
  toolCalls: { id: string; name: string; arguments: string }[]
  response: string
  hookContext?: string
}

/** One Session's turns, folded from its events in order. */
export class TurnTracker {
  private readonly closed: ReportCompletionTurn[] = []
  private open: OpenTurn | undefined

  /**
   * Fold one event. Events of other kinds are ignored.
   * @param event - the appended Session event.
   */
  observe(event: SessionEvent): void {
    switch (event.type) {
      case 'turn/start': {
        this.close()
        this.open = { turn: event.data.turn, message: '', rounds: [], results: {}, pendingHook: undefined }
        return
      }
      case 'turn/end': {
        this.close()
        return
      }
      case 'user/message': {
        const turn = this.open
        if (turn === undefined) return
        if (event.data.source.kind !== STEER_SOURCE_KIND) return
        const text = contentText(event.data.content)
        if (turn.message === '') turn.message = text
        else turn.pendingHook = text
        return
      }
      case 'step/start': {
        const turn = this.open
        if (turn === undefined) return
        const round: MutableRound = { toolCalls: [], response: '' }
        if (turn.pendingHook !== undefined) {
          round.hookContext = turn.pendingHook
          turn.pendingHook = undefined
        }
        turn.rounds.push(round)
        return
      }
      case 'tool/call': {
        const round = this.currentRound()
        round?.toolCalls.push({ id: event.data.callId, name: event.data.name, arguments: event.data.arguments })
        return
      }
      case 'assistant/message': {
        const round = this.currentRound()
        if (round !== undefined) round.response += contentText(event.data.message.content)
        return
      }
      case 'tool/result': {
        const turn = this.open
        if (turn === undefined) return
        turn.results[event.data.message.toolCallId] = contentText(event.data.message.content)
        return
      }
      default:
        return
    }
  }

  /**
   * The turns so far: every closed turn, then the open one when `turn` names it.
   * @param turn - the turn number the caller is ending; the open turn is included only when it matches.
   * @returns the history and the current turn, or `undefined` when no such turn is open.
   */
  turns(turn: number): { history: readonly ReportCompletionTurn[]; current: ReportCompletionTurn } | undefined {
    if (this.open === undefined || this.open.turn !== turn) return undefined
    return { history: this.closed, current: snapshot(this.open) }
  }

  /**
   * The open turn's number.
   * @returns the number, or `undefined` between turns.
   */
  openTurn(): number | undefined {
    return this.open?.turn
  }

  private currentRound(): MutableRound | undefined {
    const turn = this.open
    if (turn === undefined) return undefined
    if (turn.rounds.length === 0) turn.rounds.push({ toolCalls: [], response: '' })
    return turn.rounds[turn.rounds.length - 1]
  }

  private close(): void {
    if (this.open === undefined) return
    this.closed.push(snapshot(this.open))
    this.open = undefined
  }
}

function snapshot(turn: OpenTurn): ReportCompletionTurn {
  const rounds: GuardRound[] = turn.rounds.map(round => ({
    toolCalls: round.toolCalls.map(call => ({ ...call })),
    response: round.response,
    ...round.hookContext === undefined ? {} : { hookContext: round.hookContext },
  }))
  return { message: turn.message, rounds, results: { ...turn.results } }
}
