/**
 * What the two drafting tool shells share: the matter argument, the working
 * directory, the `DraftingWorkspace` over `ctx.fs`, the text value every
 * drafting tool returns and the delivery-card queue. The IDE's shells return a
 * `LanguageModelToolResult` of one text part and open files with
 * `vscode.open`; here the value is `{ ok, text }` rendered as one text block,
 * and the files go to `PresentQueue` so this plugin's `tools/result` listener
 * appends `deliverables/presented`.
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { PresentedFile } from '@deepseek-ai/dsh-tool-present/types'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type {} from '@deepseek-ai/dsh-working-directory'
import { DraftingWorkspace, workspaceFiles, type DraftingWorkspaceOptions } from '../drafting/workspace.ts'
import { DELIVERED_LINE, type PresentQueue } from '../present.ts'

/** The canonical value of a drafting tool call: whether it did its work, and the text the model reads. */
export interface DraftingToolValue {
  /** False for every refusal. */
  ok: boolean
  /** The full result text, the IDE's wording. */
  text: string
  /** The process paths of the files the call presented, when it wrote any. */
  files?: string[]
}

/** The services a drafting tool shell runs on. */
export interface DraftingToolDependencies {
  readonly present: PresentQueue
  readonly warn: (message: string) => void
  readonly info: (message: string) => void
  /** The clock of the record lines; a test passes its own. */
  readonly now?: () => Date
}

/**
 * Whether a canonical value is a drafting tool's.
 * @param value - the value a tool returned.
 * @returns true for `{ ok, text }`.
 */
export function isDraftingToolValue(value: JsonValue): value is DraftingToolValue & JsonValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && typeof value['text'] === 'string' && typeof value['ok'] === 'boolean'
}

/**
 * The `matter` argument of a drafting tool.
 * @param name - the tool name, for the error.
 * @param args - the model's arguments.
 * @returns the matter folder name as given.
 * @throws when the arguments are not an object with a string `matter`.
 */
export function matterArgument(name: string, args: unknown): string {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) { throw new Error(`${name}: invalid arguments: expected an object`) }
  const matter = (args as Record<string, unknown>)['matter']
  if (typeof matter !== 'string') { throw new Error(`${name}: invalid arguments: matter must be a string (the folder name under drafting/)`) }
  return matter
}

/**
 * Open the drafting matter of the call's working directory.
 * @param ctx - a context whose `fs` and `workingDirectory` are active.
 * @param matter - the matter folder name under `drafting/`.
 * @param exec - the tool execution, for the agent's working directory and signal.
 * @param options - the clock and the optional PDF reader.
 * @returns the workspace, or the refusal text when the matter name is not a folder name.
 */
export async function openMatter(
  ctx: Context, matter: string, exec: ToolRunContext, options: DraftingWorkspaceOptions,
): Promise<DraftingWorkspace | string> {
  const cwd = exec.agent === undefined
    ? ctx.workingDirectory.defaultDirectory
    : await ctx.workingDirectory.ensure(exec.agent, exec.signal)
  const files = await workspaceFiles(ctx, cwd, exec.signal)
  return DraftingWorkspace.locate(matter, files, options)
}

/**
 * Queue the written files for the delivery card and end the result with the delivered line.
 * @param deps - the queue.
 * @param exec - the execution whose result settles the card.
 * @param workspace - the matter, for the process paths.
 * @param files - workspace-relative paths with their card descriptions, in card order.
 * @param text - the result text so far.
 * @returns the value with the presented process paths.
 */
export async function delivered(
  deps: DraftingToolDependencies,
  exec: ToolRunContext,
  workspace: DraftingWorkspace,
  files: readonly { path: string; description: string }[],
  text: string,
): Promise<DraftingToolValue> {
  const presented: PresentedFile[] = []
  for (const file of files) {
    presented.push({ path: await workspace.files.processPath(file.path), description: file.description })
  }
  deps.present.queue(exec, presented)
  return { ok: true, text: `${text}\n${DELIVERED_LINE}`, files: presented.map(file => file.path) }
}

/**
 * A refusal value.
 * @param text - the refusal text the model reads.
 * @returns the value with `ok: false`.
 */
export function refused(text: string): DraftingToolValue {
  return { ok: false, text }
}
