/** The `office_review_changes` tool: accept or reject tracked changes of a Word file into a new copy. @module */

import type { Context } from '@deepseek-ai/cordis'
import { DELIVERED_LINE } from '@deepseek-ai/dsh-flowleap-deliverables'
import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import { z } from 'zod'
import type { ReviewSelection } from '../types.ts'
import type { OfficeToolDeps } from './deps.ts'
import { callWorkspace, outputTarget, parseArgs, readInput, writeOutput } from './workspace.ts'

/** Tool name. */
export const REVIEW_CHANGES_NAME = 'office_review_changes'

const Args = z.object({
  path: z.string().min(1),
  output: z.string().min(1),
  action: z.enum(['accept', 'reject']),
  author: z.string().trim().min(1).optional(),
  ids: z.array(z.number().int().nonnegative()).min(1).optional(),
}).refine(args => args.author === undefined || args.ids === undefined, 'give author or ids, not both')

/**
 * The selection of a review call.
 * @param args - the parsed arguments.
 * @returns every change, the changes of one author, or the named changes.
 */
export function reviewSelection(args: { author?: string | undefined; ids?: readonly number[] | undefined }): ReviewSelection {
  if (args.author !== undefined) return { kind: 'author', author: args.author }
  if (args.ids !== undefined) return { kind: 'ids', ids: args.ids }
  return { kind: 'all' }
}

/**
 * Build `office_review_changes`.
 * @param ctx - context with `fs` and `workingDirectory`.
 * @param deps - the Office service and settings.
 * @returns the unregistered definition.
 */
export function reviewChangesTool(ctx: Context, deps: OfficeToolDeps): ToolDefinition {
  return defineTool({
    name: REVIEW_CHANGES_NAME,
    description: 'Accept or reject tracked changes of a Word file and write the result as a new file; the original file stays as it is. '
      + 'Without author and ids the action applies to every tracked change; author selects the changes of one author, '
      + 'ids the changes office_read lists.',
    parameters: {
      path: { type: 'string', required: true, description: '.docx path of the file with tracked changes, relative to the working directory.' },
      output: { type: 'string', required: true, description: 'New .docx path for the result.' },
      action: { type: 'string', required: true, enum: ['accept', 'reject'] },
      author: { type: 'string', description: 'Apply only to the changes of this author.' },
      ids: { type: 'array', items: { type: 'integer' }, description: 'Apply only to these change ids.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: { file: { type: 'string', required: true }, changed: { type: 'integer', required: true } },
      },
      render: (args, value) => [{
        type: 'text',
        text: `Wrote ${value.file}: ${String(value.changed)} tracked change(s) ${args.action === 'accept' ? 'accepted' : 'rejected'}; ${args.path} is unchanged.\n${DELIVERED_LINE}`,
      }],
    },
    async execute(raw, exec) {
      const args = parseArgs(Args, raw)
      const workspace = await callWorkspace(ctx, exec)
      const target = await outputTarget(ctx, workspace, args.output, '.docx', exec.signal)
      const file = await readInput(ctx, workspace, args.path, '.docx', deps.maxInputBytes, exec.signal)
      const result = await deps.office.reviewChanges({ file, action: args.action, selection: reviewSelection(args) }, exec.signal)
      const path = await writeOutput(ctx, workspace, target, result.file, exec.signal)
      deps.deliveries.queue(exec, [{ path, description: `Tracked changes ${args.action === 'accept' ? 'accepted' : 'rejected'} (Word)` }])
      return { file: args.output, changed: result.changed }
    },
    presentCall: args => ({ card: 'generic', title: 'Review tracked changes', kind: 'edit', locations: [{ path: args.path }, { path: args.output }] }),
  })
}
