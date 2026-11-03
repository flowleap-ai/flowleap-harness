/** The `office_letter_from_template` tool: a Word letter on a firm template. @module */

import type { Context } from '@deepseek-ai/cordis'
import { DELIVERED_LINE } from '@deepseek-ai/dsh-flowleap-deliverables'
import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import { z } from 'zod'
import type { LetterBlock } from '../types.ts'
import type { OfficeToolDeps } from './deps.ts'
import { callWorkspace, outputTarget, parseArgs, readTemplate, writeOutput } from './workspace.ts'

/** Tool name. */
export const LETTER_NAME = 'office_letter_from_template'

const Block = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('heading'), level: z.union([z.literal(1), z.literal(2)]), text: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('paragraph'), text: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('table'), header: z.array(z.string()).min(1), rows: z.array(z.array(z.string())) }).strict(),
])

const Args = z.object({
  template: z.string().min(1),
  output: z.string().min(1),
  fields: z.record(z.string(), z.string()).default({}),
  blocks: z.array(Block).min(1),
})

/**
 * Build `office_letter_from_template`.
 * @param ctx - context with `fs` and `workingDirectory`.
 * @param deps - the Office service and settings.
 * @returns the unregistered definition.
 */
export function letterTool(ctx: Context, deps: OfficeToolDeps): ToolDefinition {
  return defineTool({
    name: LETTER_NAME,
    description: 'Write a Word letter on a firm template, for example a reply to an office action. '
      + 'The template fills its {{name}} placeholders from fields; every placeholder needs a value. '
      + 'The blocks follow the template text in order: headings (level 1 or 2), paragraphs, and tables with a header row and the firm table style. '
      + 'Values must not start with http:// or https://. The letter is a new file; the tool never changes an existing file.',
    parameters: {
      template: { type: 'string', required: true, description: 'File name of a firm template, for example reply-letter.docx.' },
      output: { type: 'string', required: true, description: 'New .docx path relative to the working directory.' },
      fields: { type: 'object', additionalProperties: true, description: 'Placeholder values by name, for example {"datum": "3. November 2026"}.' },
      blocks: {
        type: 'array', required: true, description: 'Letter body in order.',
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            kind: { type: 'string', required: true, enum: ['heading', 'paragraph', 'table'] },
            level: { type: 'integer', enum: [1, 2], description: 'Heading level; heading only.' },
            text: { type: 'string', description: 'Heading or paragraph text; a line feed is a line break.' },
            header: { type: 'array', items: { type: 'string' }, description: 'Header cells; table only.' },
            rows: { type: 'array', items: { type: 'array', items: { type: 'string' } }, description: 'Body rows with as many cells as the header; table only.' },
          },
        },
      },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { file: { type: 'string', required: true } } },
      render: (_args, value) => [{ type: 'text', text: `Wrote the letter ${value.file}.\n${DELIVERED_LINE}` }],
    },
    async execute(raw, exec) {
      const args = parseArgs(Args, raw)
      const workspace = await callWorkspace(ctx, exec)
      const target = await outputTarget(ctx, workspace, args.output, '.docx', exec.signal)
      const template = await readTemplate(deps.templatesDir, args.template, deps.maxInputBytes)
      const blocks: LetterBlock[] = args.blocks
      const bytes = await deps.office.letter({ template, fields: args.fields, blocks }, exec.signal)
      const path = await writeOutput(ctx, workspace, target, bytes, exec.signal)
      deps.deliveries.queue(exec, [{ path, description: 'Letter (Word)' }])
      return { file: args.output }
    },
    presentCall: args => ({ card: 'generic', title: 'Write letter', kind: 'edit', locations: [{ path: args.output }] }),
  })
}
