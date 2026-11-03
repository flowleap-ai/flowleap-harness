/** The `office_read` tool: the text, the headings, the tables, and the tracked changes of a Word or Excel file. @module */

import type { Context } from '@deepseek-ai/cordis'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import { z } from 'zod'
import type { OfficeFormat, OfficeReadout } from '../types.ts'
import type { OfficeToolDeps } from './deps.ts'
import { callWorkspace, parseArgs, readInput } from './workspace.ts'

/** Tool name. */
export const READ_NAME = 'office_read'

const Args = z.object({ path: z.string().min(1) })

/** What `office_read` returns. */
export interface OfficeReadValue {
  /** The file's format. */
  readonly format: OfficeFormat
  /** Document text, cut at the configured character count. */
  readonly text: string
  /** Whether the text was cut. */
  readonly truncated: boolean
  /** Word headings; empty for Excel. */
  readonly headings: { level: number; text: string }[]
  /** Word tracked changes; empty for Excel. */
  readonly revisions: { id: number; type: string; author: string; date?: string; text: string }[]
  /** Excel sheets; empty for Word. */
  readonly sheets: { name: string; rows: number; cols: number }[]
}

/**
 * The tool value of a readout.
 * @param readout - what the service read.
 * @param maxChars - most characters of text.
 * @returns the value.
 */
export function readValue(readout: OfficeReadout, maxChars: number): OfficeReadValue {
  const characters = Array.from(readout.text)
  const text = characters.slice(0, maxChars).join('')
  const truncated = characters.length > maxChars
  return readout.format === 'docx'
    ? { format: 'docx', text, truncated, headings: [...readout.headings], revisions: [...readout.revisions], sheets: [] }
    : { format: 'xlsx', text, truncated, headings: [], revisions: [], sheets: [...readout.sheets] }
}

/**
 * The model-facing text of a read.
 * @param value - the read value.
 * @param maxChars - the character cap the text was cut at.
 * @returns one text block.
 */
export function renderRead(value: OfficeReadValue, maxChars: number): ContentBlock[] {
  const parts = [value.text]
  if (value.truncated) parts.push(`[Text cut at ${String(maxChars)} characters.]`)
  if (value.headings.length > 0) parts.push(`Headings:\n${value.headings.map(heading => `${'  '.repeat(heading.level - 1)}- ${heading.text}`).join('\n')}`)
  if (value.format === 'docx') {
    parts.push(value.revisions.length === 0
      ? 'Tracked changes: none.'
      : `Tracked changes:\n${value.revisions.map(revision => `- id ${String(revision.id)} ${revision.type} by ${revision.author}${revision.date === undefined ? '' : ` on ${revision.date}`}: ${JSON.stringify(revision.text)}`).join('\n')}`)
  }
  if (value.sheets.length > 0) parts.push(`Sheets:\n${value.sheets.map(sheet => `- ${sheet.name}: ${String(sheet.rows)} rows, ${String(sheet.cols)} columns`).join('\n')}`)
  return [{ type: 'text', text: parts.join('\n\n') }]
}

/**
 * Build `office_read`.
 * @param ctx - context with `fs` and `workingDirectory`.
 * @param deps - the Office service and settings.
 * @returns the unregistered definition.
 */
export function readTool(ctx: Context, deps: OfficeToolDeps): ToolDefinition {
  return defineTool({
    name: READ_NAME,
    description: 'Read a Word (.docx) or Excel (.xlsx) file of the working directory: the text with tables one row per line, '
      + 'the Word headings and tracked changes (id, type, author, date, text), or the Excel sheets with their cells as A1=value. '
      + 'Use the change ids with office_review_changes.',
    parameters: {
      path: { type: 'string', required: true, description: '.docx or .xlsx path relative to the working directory.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          format: { type: 'string', required: true, enum: ['docx', 'xlsx'] },
          text: { type: 'string', required: true },
          truncated: { type: 'boolean', required: true },
          headings: {
            type: 'array', required: true,
            items: { type: 'object', additionalProperties: false, properties: { level: { type: 'integer', required: true }, text: { type: 'string', required: true } } },
          },
          revisions: {
            type: 'array', required: true,
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                id: { type: 'integer', required: true },
                type: { type: 'string', required: true },
                author: { type: 'string', required: true },
                date: { type: 'string' },
                text: { type: 'string', required: true },
              },
            },
          },
          sheets: {
            type: 'array', required: true,
            items: {
              type: 'object', additionalProperties: false,
              properties: { name: { type: 'string', required: true }, rows: { type: 'integer', required: true }, cols: { type: 'integer', required: true } },
            },
          },
        },
      },
      render: (_args, value) => renderRead(value, deps.maxReadChars),
    },
    async execute(raw, exec) {
      const args = parseArgs(Args, raw)
      const lower = args.path.toLowerCase()
      const format: OfficeFormat | undefined = lower.endsWith('.docx') ? 'docx' : lower.endsWith('.xlsx') ? 'xlsx' : undefined
      if (format === undefined) throw new Error(`"${args.path}" must end with .docx or .xlsx.`)
      const workspace = await callWorkspace(ctx, exec)
      const file = await readInput(ctx, workspace, args.path, `.${format}`, deps.maxInputBytes, exec.signal)
      return readValue(await deps.office.read({ file, format }, exec.signal), deps.maxReadChars)
    },
    presentCall: args => ({ card: 'generic', title: 'Read Office file', kind: 'read', locations: [{ path: args.path }] }),
  })
}
