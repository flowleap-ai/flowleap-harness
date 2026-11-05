/** Argument rules that the run tools share. @module */

import { brandNumber, brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { z } from 'zod'
import type { RecordSeq, TicketId } from '../types.ts'

/** A Ticket id as the run message names it: 1 to 128 letters, digits, dot, underscore, colon, or hyphen. */
export const ticketIdArg = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u, 'Use the ticket id of the run message.')
  .transform(value => brandString<TicketId>(value))

/** A record position. */
export const recordSeqArg = z.number().int().nonnegative().transform(value => brandNumber<RecordSeq>(value))

/**
 * The Session of a run-tool call.
 * @param exec - the tool call.
 * @returns the id of the Session the call belongs to.
 * @throws when the call belongs to no agent Session.
 */
export function callSession(exec: ToolRunContext): SessionId {
  if (exec.agent === undefined) throw new Error('The run tools need an agent Session.')
  return exec.agent.session.id
}

/**
 * A list that the argument schema already required to be non-empty, as a non-empty tuple.
 * @param items - the parsed list.
 * @returns the same items.
 * @throws when the list is empty.
 */
export function nonEmpty<T>(items: readonly T[]): [T, ...T[]] {
  const [first, ...rest] = items
  if (first === undefined) throw new Error('The list must not be empty.')
  return [first, ...rest]
}
