/**
 * The file rules every Office tool shares. A model path is relative to the Session working directory and stays inside
 * it; an output must have the tool's extension and must not exist yet, so no tool replaces an attorney's file. A
 * template comes from the firm's template folder by its bare file name, never from a model path. Bytes go through the
 * host-path round trip of `dsh-flowleap-deliverables`.
 * @module
 */

import { readdir, readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { writeWorkspaceBytes } from '@deepseek-ai/dsh-flowleap-deliverables'
import type { FsTarget } from '@deepseek-ai/dsh-fs'
import type { ToolExecution, ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { PresentedFile } from '@deepseek-ai/dsh-tool-present/types'
import { z } from 'zod'

/** The working directory of one tool call. */
export interface CallWorkspace {
  /** The working directory as a path. */
  readonly cwd: string
  /** The working directory as a target. */
  readonly root: FsTarget
}

/**
 * The working directory of a call.
 * @param ctx - context with `fs` and `workingDirectory`.
 * @param exec - the tool call; it must belong to an agent Session.
 * @returns the working directory.
 */
export async function callWorkspace(ctx: Context, exec: ToolRunContext): Promise<CallWorkspace> {
  if (exec.agent === undefined) throw new Error('Office tools need an agent Session.')
  const cwd = await ctx.workingDirectory.ensure(exec.agent, exec.signal)
  return { cwd, root: await ctx.fs.resolve(cwd, { signal: exec.signal }) }
}

async function inside(ctx: Context, workspace: CallWorkspace, path: string, extension: string, signal: AbortSignal): Promise<FsTarget> {
  if (path.trim() === '' || isAbsolute(path)) throw new Error(`"${path}" must be a path relative to the working directory.`)
  if (!path.toLowerCase().endsWith(extension)) throw new Error(`"${path}" must end with ${extension}.`)
  const target = await ctx.fs.resolve(path, { cwd: workspace.cwd, signal })
  if (!ctx.fs.contains(workspace.root, target)) throw new Error(`"${path}" is outside the working directory.`)
  return target
}

/**
 * Resolve a new output file.
 * @param ctx - context with `fs`.
 * @param workspace - the call's working directory.
 * @param path - the model's relative path.
 * @param extension - the required extension, for example `.docx`.
 * @param signal - cancellation.
 * @returns the target.
 * @throws when the path is absolute, outside the working directory, of another type, or already exists.
 */
export async function outputTarget(
  ctx: Context, workspace: CallWorkspace, path: string, extension: string, signal: AbortSignal,
): Promise<FsTarget> {
  const target = await inside(ctx, workspace, path, extension, signal)
  if (await ctx.fs.stat(target, signal) !== undefined) throw new Error(`"${path}" already exists; name a new file.`)
  return target
}

/**
 * Read a document of the working directory.
 * @param ctx - context with `fs`.
 * @param workspace - the call's working directory.
 * @param path - the model's relative path.
 * @param extension - the required extension.
 * @param maxBytes - largest accepted file.
 * @param signal - cancellation.
 * @returns the bytes.
 * @throws when the path breaks a rule or the file does not exist; the filesystem rejects a file larger than `maxBytes`.
 */
export async function readInput(
  ctx: Context, workspace: CallWorkspace, path: string, extension: string, maxBytes: number, signal: AbortSignal,
): Promise<Uint8Array> {
  const target = await inside(ctx, workspace, path, extension, signal)
  const info = await ctx.fs.stat(target, signal)
  if (info?.type !== 'file') throw new Error(`"${path}" is not a file in the working directory.`)
  return ctx.fs.readBytes(target, signal, maxBytes)
}

/**
 * Write a new document into the working directory.
 * @param ctx - context with `fs`.
 * @param workspace - the call's working directory.
 * @param target - a target from {@link outputTarget}.
 * @param bytes - the file content.
 * @param signal - cancellation.
 * @returns the absolute process path of the written file.
 */
export async function writeOutput(
  ctx: Context, workspace: CallWorkspace, target: FsTarget, bytes: Uint8Array, signal: AbortSignal,
): Promise<string> {
  await writeWorkspaceBytes(ctx.fs, workspace.root, target, bytes, signal)
  return ctx.fs.processPath(target)
}

const TEMPLATE_NAME = /^[^/\\]+\.docx$/iu

/**
 * Read a firm template by its bare file name.
 * @param templatesDir - the firm's template folder.
 * @param name - the file name, for example `reply-letter.docx`.
 * @param maxBytes - largest accepted file.
 * @returns the bytes.
 * @throws naming the templates that exist when no template has the name.
 */
export async function readTemplate(templatesDir: string, name: string, maxBytes: number): Promise<Uint8Array> {
  const available = (await readdir(templatesDir)).filter(file => TEMPLATE_NAME.test(file)).sort()
  if (!TEMPLATE_NAME.test(name) || name.startsWith('.') || !available.includes(name)) {
    throw new Error(`No firm template is named "${name}". Templates: ${available.length === 0 ? 'none' : available.join(', ')}.`)
  }
  const bytes = await readFile(join(templatesDir, name))
  if (bytes.byteLength > maxBytes) throw new Error(`The template "${name}" is larger than ${String(maxBytes)} bytes.`)
  return new Uint8Array(bytes)
}

/**
 * Parse tool arguments with the rules the tool schema cannot state.
 * @param schema - the strict schema.
 * @param args - the arguments the registry validated.
 * @returns the parsed arguments.
 * @throws an `Error` that lists each broken rule.
 */
export function parseArgs<T>(schema: z.ZodType<T>, args: unknown): T {
  const parsed = schema.safeParse(args)
  if (!parsed.success) throw new Error(`Invalid arguments:\n${z.prettifyError(parsed.error)}`)
  return parsed.data
}

/** Files a successful call presents, released when its result settles. */
export class OfficeDeliveries {
  private readonly pending = new WeakMap<ToolExecution, { files: PresentedFile[] }>()

  /**
   * Queue the written files of one call.
   * @param exec - the tool call.
   * @param files - absolute process paths with descriptions.
   */
  queue(exec: ToolExecution, files: PresentedFile[]): void {
    this.pending.set(exec, { files })
  }

  /**
   * Append `deliverables/presented` for each successful call that queued files.
   * @param ctx - context with `tools` and `agents`.
   */
  register(ctx: Context): void {
    ctx.on('tools/result', (exec, result) => {
      const delivery = this.pending.get(exec)
      this.pending.delete(exec)
      if (delivery === undefined || result.isError || exec.agent === undefined) return
      const session = exec.agent.session
      const turn = ctx.agents.turnBoundaryOf(session).lastTurn
      session.append('deliverables/presented', { turn, callId: exec.callId, files: delivery.files })
    })
  }
}
