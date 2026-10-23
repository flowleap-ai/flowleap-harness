/**
 * The one registration seam for the deliverable tools: all or nothing, like
 * the connectors plugin's `registerOfficeTools`, so a name conflict rolls back
 * every registration made so far and rethrows.
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'

/**
 * Register the deliverable tools on `ctx.tools`.
 * @param ctx - the plugin context carrying `tools`.
 * @param definitions - the tools, in registration order.
 * @returns the disposer unregistering every tool.
 */
export function registerDeliverableTools(ctx: Context, definitions: readonly ToolDefinition[]): () => void {
  const disposers: (() => void)[] = []
  try {
    for (const definition of definitions) {
      disposers.push(ctx.tools.register(definition))
    }
  } catch (error) {
    for (const dispose of disposers) dispose()
    throw error
  }
  return () => {
    for (const dispose of disposers.splice(0)) dispose()
  }
}
