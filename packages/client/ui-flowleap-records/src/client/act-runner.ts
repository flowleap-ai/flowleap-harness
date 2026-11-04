/**
 * The act runner of one decision. A decision that a person records is a legal act, so the runner sends it at most
 * once at a time and never sends an old decision again. While the acts of a submit run, another submit does
 * nothing, so a second click, key or ⌘K act sends no second act. A failed act keeps its `Idempotency-Key` for the
 * next submit only when its outcome is unknown (no answer) and the command built for that submit is the same request
 * (the same path and the same body, as the Records service compares them); every other command gets a new act. The
 * failure shows until the next submit or until the person changes the decision (`clear`).
 */

import { useRef, useState } from 'react'
import { deepEqualJson } from '@deepseek-ai/dsh-util-values'
import { commandRequest, createAct, type Act, type Command } from './api.ts'
import type { ActsResult } from './model.ts'

/** One failed act with its failure. */
export type ActFailure = ActsResult['failed'][number]

/** What the runner shows: nothing, the acts of a submit that run now, or the acts of the last submit that failed. */
export type ActRun =
  | { readonly phase: 'ready' }
  | { readonly phase: 'running' }
  | { readonly phase: 'failed'; readonly failed: readonly [ActFailure, ...ActFailure[]] }

/** The act runner of one decision. */
export interface ActRunner {
  readonly run: ActRun
  /**
   * Send one act for each command, one after another, unless a submit runs now.
   * @param commands - the commands of the decision as the person made it now.
   * @returns the result, or null when a submit ran already and nothing was sent.
   */
  readonly submit: (commands: readonly Command[]) => Promise<ActsResult | null>
  /**
   * Send the commands of the failed acts again, as `submit` does.
   * @returns the result, or null without a failure or while a submit runs.
   */
  readonly retry: () => Promise<ActsResult | null>
  /** Hide the failure, because the person changed the decision; the acts of a submit that runs now go on. */
  readonly clear: () => void
}

/**
 * Whether two commands are the same request, which a same-key retry may send.
 * @param left - one command.
 * @param right - the other command.
 * @returns true for the same path and the same body.
 */
export function sameRequest(left: Command, right: Command): boolean {
  return deepEqualJson(commandRequest(left), commandRequest(right))
}

/**
 * The act runner of one decision on a screen.
 * @param perform - the model's perform, which sends the acts one after another, refreshes once, and gives each
 * failure in its result (it does not reject).
 * @returns the runner.
 */
export function useActRunner(perform: (acts: readonly Act[]) => Promise<ActsResult>): ActRunner {
  const [run, setRun] = useState<ActRun>({ phase: 'ready' })
  const running = useRef(false)
  const unknown = useRef<readonly Act[]>([])
  const submit = async (commands: readonly Command[]): Promise<ActsResult | null> => {
    if (running.current) return null
    running.current = true
    const acts = commands.map(command => unknown.current.find(act => sameRequest(act.command, command)) ?? createAct(command))
    setRun({ phase: 'running' })
    const result = await perform(acts)
    running.current = false
    unknown.current = result.failed.flatMap(({ act, error }) => error.kind === 'network' ? [act] : [])
    const [first, ...rest] = result.failed
    setRun(first === undefined ? { phase: 'ready' } : { phase: 'failed', failed: [first, ...rest] })
    return result
  }
  const retry = () => run.phase === 'failed' ? submit(run.failed.map(({ act }) => act.command)) : Promise.resolve(null)
  const clear = () => { setRun(current => current.phase === 'failed' ? { phase: 'ready' } : current) }
  return { run, submit, retry, clear }
}
