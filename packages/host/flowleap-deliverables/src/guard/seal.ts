/**
 * The seal on a delivered file: every path `write_patent_results` saved for a
 * Session is remembered, and the first direct `edit`, `write` or
 * `str_replace_editor` of that path by the model steers one message into the
 * turn (the D1 `steer.ts` pattern, once per Session and path). The edit is not
 * blocked: the attorney may have asked for it. The steer is the seal: it tells
 * the model that the record, the evidence companion and the delivery card now
 * describe a file that no longer exists, and that a re-save through the writer
 * makes them true again (S5 acceptance defect C, 2026-10-25).
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { FsError } from '@deepseek-ai/dsh-fs'
import type { ToolExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-working-directory'
import { STEER_SOURCE_KIND } from './turn-tracker.ts'

/** The generic file tools whose direct use on a delivered path is steered. */
export const DIRECT_EDIT_TOOLS: ReadonlySet<string> = new Set(['edit', 'write', 'str_replace_editor'])

/** The one sentence steered into the turn after the model edits a delivered file directly. */
export const DIRECT_EDIT_STEER = 'This file was delivered to the attorney with a card. Re-save it through write_patent_results so the record, evidence and card stay true; direct edits leave the card stale.'

/** The delivered paths of the live Sessions, and which of them were steered already. */
export class DeliveredPaths {
  private readonly delivered = new Map<string, Set<string>>()
  private readonly steered = new Set<string>()

  /**
   * Remember a path the writer delivered.
   * @param sessionId - the owning Session.
   * @param processPath - the canonical process path of the saved file.
   */
  mark(sessionId: string, processPath: string): void {
    let paths = this.delivered.get(sessionId)
    if (paths === undefined) {
      paths = new Set()
      this.delivered.set(sessionId, paths)
    }
    paths.add(processPath)
  }

  /**
   * Whether a path was delivered in a Session.
   * @param sessionId - the owning Session.
   * @param processPath - the canonical process path.
   * @returns `true` when the writer saved it.
   */
  has(sessionId: string, processPath: string): boolean {
    return this.delivered.get(sessionId)?.has(processPath) ?? false
  }

  /**
   * Claim the one steer of a delivered path.
   * @param sessionId - the owning Session.
   * @param processPath - the canonical process path.
   * @returns `true` the first time for a Session and path, `false` after.
   */
  claimSteer(sessionId: string, processPath: string): boolean {
    const key = `${sessionId}\n${processPath}`
    if (this.steered.has(key)) return false
    this.steered.add(key)
    return true
  }

  /**
   * Forget a disposed Session.
   * @param sessionId - the Session id.
   */
  forget(sessionId: string): void {
    this.delivered.delete(sessionId)
    for (const key of this.steered) if (key.startsWith(`${sessionId}\n`)) this.steered.delete(key)
  }
}

/**
 * The path a direct edit names: `file_path` of `edit` and `write`, `path` of a `str_replace_editor`
 * command that changes the file (`view` reads it).
 * @param name - the registered tool name.
 * @param args - the frozen parsed arguments.
 * @returns the path as the model wrote it, or `undefined` when the call changes no file.
 */
export function editedPath(name: string, args: unknown): string | undefined {
  if (!DIRECT_EDIT_TOOLS.has(name) || typeof args !== 'object' || args === null) return undefined
  const record = args as Record<string, unknown>
  if (name === 'str_replace_editor') {
    if (record['command'] === 'view') return undefined
    return typeof record['path'] === 'string' && record['path'].trim() ? record['path'] : undefined
  }
  return typeof record['file_path'] === 'string' && record['file_path'].trim() ? record['file_path'] : undefined
}

/**
 * Attach the seal: after a successful direct edit of a delivered path, steer the one sentence into
 * the turn, once per Session and path. The `tools/post-execute` projection is awaited by the
 * registry, so the steer is queued before the edit's result reaches the model; the decision is
 * returned unchanged.
 * @param ctx - the plugin context, with `fs` and `workingDirectory` active.
 * @param delivered - the delivered paths the writer marks.
 * @param onSteer - optional observer of the steer text (tests).
 */
export function registerEditSeal(ctx: Context, delivered: DeliveredPaths, onSteer?: (agent: Agent, text: string) => void): void {
  ctx.on('tools/post-execute', async (exec: ToolExecution, result: Readonly<ToolExecutionResult>, next) => {
    const decision = await next()
    const agent = exec.agent
    const path = editedPath(exec.name, exec.arguments)
    if (agent === undefined || path === undefined || result.isError) return decision
    try {
      const cwd = await ctx.workingDirectory.ensure(agent, exec.signal)
      const target = await ctx.fs.resolve(path, { cwd, signal: exec.signal })
      const processPath = ctx.fs.processPath(target)
      if (!delivered.has(agent.session.id, processPath) || !delivered.claimSteer(agent.session.id, processPath)) return decision
      const text = `\`${path}\`: ${DIRECT_EDIT_STEER}`
      onSteer?.(agent, text)
      agent.steer(createUserMessage({ content: [{ type: 'text', text }], source: { kind: STEER_SOURCE_KIND } }))
    } catch (error) {
      // A path the filesystem cannot resolve was not delivered; anything else is logged, never thrown into the tool result.
      if (!(error instanceof FsError)) {
        ctx.logger.warn(`flowleap-deliverables: edit seal failed for ${exec.name}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    return decision
  })
}
