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
  /** Document text, cut to the characters that the lists leave of the budget. */
  readonly text: string
  /** Whether the text was cut. */
  readonly truncated: boolean
  /** Word headings; empty for Excel. */
  readonly headings: { level: number; text: string }[]
  /** Word tracked changes; empty for Excel. */
  readonly revisions: { id: number; type: string; author: string; date?: string; text: string }[]
  /** Excel sheets; empty for Word. */
  readonly sheets: { name: string; rows: number; cols: number }[]
  /** How many headings, tracked changes, and sheets the budget left out. */
  readonly omitted: { headings: number; revisions: number; sheets: number }
}

type Revision = OfficeReadValue['revisions'][number]
type Sheet = OfficeReadValue['sheets'][number]

const headingLine = (heading: OfficeReadValue['headings'][number]) => `${'  '.repeat(heading.level - 1)}- ${heading.text}`
const revisionLine = (revision: Revision) =>
  `- id ${String(revision.id)} ${revision.type} by ${revision.author}${revision.date === undefined ? '' : ` on ${revision.date}`}: ${JSON.stringify(revision.text)}`
const sheetLine = (sheet: Sheet) => `- ${sheet.name}: ${String(sheet.rows)} rows, ${String(sheet.cols)} columns`

/**
 * The tool value of a readout within one character budget. The headings, the tracked changes, and the sheets come
 * first, in this order, while their lines fit in half of the budget; the text gets the rest of the budget.
 * @param readout - what the service read.
 * @param maxChars - most characters of the text and the list lines together.
 * @returns the value with the counts of the items left out.
 */
export function readValue(readout: OfficeReadout, maxChars: number): OfficeReadValue {
  const listBudget = Math.floor(maxChars / 2)
  let used = 0
  let full = false
  const fit = <T>(items: readonly T[], line: (item: T) => string): T[] => {
    const kept: T[] = []
    for (const item of items) {
      const cost = Array.from(line(item)).length + 1
      if (full || used + cost > listBudget) {
        full = true
        break
      }
      used += cost
      kept.push(item)
    }
    return kept
  }
  const lists = readout.format === 'docx'
    ? { headings: readout.headings, revisions: readout.revisions, sheets: [] }
    : { headings: [], revisions: [], sheets: readout.sheets }
  const headings = fit(lists.headings, headingLine)
  const revisions = fit(lists.revisions, revisionLine)
  const sheets = fit(lists.sheets, sheetLine)
  const characters = Array.from(readout.text)
  const textChars = maxChars - used
  return {
    format: readout.format,
    text: characters.slice(0, textChars).join(''),
    truncated: characters.length > textChars,
    headings,
    revisions,
    sheets,
    omitted: {
      headings: lists.headings.length - headings.length,
      revisions: lists.revisions.length - revisions.length,
      sheets: lists.sheets.length - sheets.length,
    },
  }
}

/**
 * The model-facing text of a read.
 * @param value - the read value.
 * @param maxChars - the character budget the value was cut to.
 * @returns one text block.
 */
export function renderRead(value: OfficeReadValue, maxChars: number): ContentBlock[] {
  const parts = [value.text]
  if (value.truncated) parts.push(`[Text cut to stay within ${String(maxChars)} characters.]`)
  if (value.headings.length > 0) parts.push(`Headings:\n${value.headings.map(headingLine).join('\n')}`)
  if (value.revisions.length > 0) parts.push(`Tracked changes:\n${value.revisions.map(revisionLine).join('\n')}`)
  else if (value.format === 'docx' && value.omitted.revisions === 0) parts.push('Tracked changes: none.')
  if (value.sheets.length > 0) parts.push(`Sheets:\n${value.sheets.map(sheetLine).join('\n')}`)
  const omitted = [
    [value.omitted.headings, 'heading(s)'], [value.omitted.revisions, 'tracked change(s)'], [value.omitted.sheets, 'sheet(s)'],
  ] as const
  const left = omitted.filter(([count]) => count > 0).map(([count, what]) => `${String(count)} ${what}`)
  if (left.length > 0) parts.push(`[Left out to stay within ${String(maxChars)} characters: ${left.join(', ')}.]`)
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
          omitted: {
            type: 'object', required: true, additionalProperties: false,
            properties: { headings: { type: 'integer', required: true }, revisions: { type: 'integer', required: true }, sheets: { type: 'integer', required: true } },
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
