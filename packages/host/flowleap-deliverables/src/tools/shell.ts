/**
 * What the drafting tool shells share: the matter argument, the working
 * directory, the `DraftingWorkspace` over `ctx.fs`, the text value every
 * drafting tool returns, the delivery-card queue and the gate seams. The IDE's shells return a
 * `LanguageModelToolResult` of one text part and open files with
 * `vscode.open`; here the value is `{ ok, text }` rendered as one text block,
 * and the files go to `PresentQueue` so this plugin's `tools/result` listener
 * appends `deliverables/presented`.
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { PresentedFile } from '@deepseek-ai/dsh-tool-present/types'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type {} from '@deepseek-ai/dsh-working-directory'
import { DraftingWorkspace, workspaceFiles, type DraftingWorkspaceOptions } from '../drafting/workspace.ts'
import type { GateSeams } from '../gates/questions.ts'
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
  /** The question-card and approval seams of the attorney gates (S5 D3). */
  readonly gates: GateSeams
  readonly warn: (message: string) => void
  readonly info: (message: string) => void
  /** The clock of the record lines; a test passes its own. */
  readonly now?: () => Date
}

/** The gate seams of a composition without `dsh-user-questions` and `dsh-user-approval`: every gate stays a file edit. */
export const NO_GATE_SEAMS: GateSeams = { ask: () => undefined, approve: () => undefined, approvalPolicy: () => undefined }

/**
 * The gate seams a tool shell hands to the gates: the dependencies' seams with the shell's clock and logger.
 * @param deps - the tool dependencies.
 * @returns the seams.
 */
export function gateSeams(deps: DraftingToolDependencies): GateSeams {
  return { ...deps.gates, ...deps.now ? { now: deps.now } : {}, info: deps.info }
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
 * @param refusal - the sentence that starts the refusal text.
 * @returns the workspace, or the refusal when the matter name is not a folder name.
 */
export async function openMatter(
  ctx: Context, matter: string, exec: ToolRunContext, options: DraftingWorkspaceOptions, refusal: string,
): Promise<DraftingWorkspace | DraftingToolValue> {
  const cwd = exec.agent === undefined
    ? ctx.workingDirectory.defaultDirectory
    : await ctx.workingDirectory.ensure(exec.agent, exec.signal)
  const files = await workspaceFiles(ctx, cwd, exec.signal)
  const workspace = DraftingWorkspace.locate(matter, files, options)
  return typeof workspace === 'string' ? refused(`${refusal} ${workspace}`) : workspace
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

/**
 * The clock of a drafting tool's record lines.
 * @param deps - the tool dependencies.
 * @returns the dependencies' clock, else the system clock.
 */
export function toolClock(deps: DraftingToolDependencies): () => Date {
  return deps.now ?? (() => new Date())
}

/** The parts in which drafting tool shells differ. */
export interface DraftingToolSpec<Input> {
  readonly name: string
  readonly description: string
  readonly parameters: Record<string, unknown>
  /**
   * Parse the model's arguments; a throw fails the call before the matter opens.
   * @param args - the model's arguments.
   * @returns the parsed input.
   */
  readonly parse: (args: unknown) => Input
  /**
   * The matter folder name of the call.
   * @param input - the parsed input.
   * @returns the folder name under `drafting/`, as given.
   */
  readonly matter: (input: Input) => string
  /**
   * The sentence that starts every refusal of the call, a thrown failure included.
   * @param input - the parsed input.
   * @returns the sentence.
   */
  readonly refusal: (input: Input) => string
  /**
   * Do the tool's work in the opened matter.
   * @param workspace - the matter.
   * @param exec - the tool execution.
   * @param input - the parsed input.
   * @param refusal - the sentence that starts every refusal.
   * @returns the drafting tool value.
   */
  readonly execute: (workspace: DraftingWorkspace, exec: ToolRunContext, input: Input, refusal: string) => Promise<DraftingToolValue>
}

/**
 * Build a drafting tool definition: it opens the matter, renders one text block per value,
 * and logs a thrown failure and returns it as a refusal.
 * @param ctx - a context whose `fs` and `workingDirectory` are active.
 * @param deps - the loggers and the clock.
 * @param spec - the tool's name, schema, parser, matter, refusal sentence and work.
 * @returns the unregistered dsh definition.
 */
export function draftingToolDefinition<Input>(ctx: Context, deps: DraftingToolDependencies, spec: DraftingToolSpec<Input>): ToolDefinition {
  const now = toolClock(deps)
  return {
    name: spec.name,
    description: spec.description,
    parameters: spec.parameters,
    output: {
      schema: {},
      render: (_args, value) => [{ type: 'text', text: isDraftingToolValue(value) ? value.text : JSON.stringify(value) }],
    },
    async execute(args: unknown, exec: ToolRunContext): Promise<JsonValue> {
      const input = spec.parse(args)
      const refusal = spec.refusal(input)
      try {
        const workspace = await openMatter(ctx, spec.matter(input), exec, { now }, refusal)
        return { ...workspace instanceof DraftingWorkspace ? await spec.execute(workspace, exec, input, refusal) : workspace }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        deps.warn(`flowleap-deliverables: ${spec.name} failed: ${message}`)
        return { ...refused(`${refusal} ${message}`) }
      }
    },
  }
}
