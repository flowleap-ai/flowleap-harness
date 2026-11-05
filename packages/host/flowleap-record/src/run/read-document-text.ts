/** The `record_read_document_text` tool: the page text of a document of the record, the text that a report quotes. @module */

import type { Context } from '@deepseek-ai/cordis'
import { parseArgs } from '@deepseek-ai/dsh-flowleap-office'
import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import { z } from 'zod'
import { sha256Arg } from './args.ts'
import { RUN_ERROR_SCHEMA, runRefusal, type RunCommandError } from './refusal.ts'

/** Tool name. */
export const READ_DOCUMENT_TEXT_NAME = 'record_read_document_text'

/** The canonical value of `record_read_document_text`: the page text, or the refusal. */
export type ReadDocumentTextResult = { pages: string[] } | RunCommandError

const Args = z.object({ document: sha256Arg }).strict()

const DESCRIPTION =
  'Read the text of a document of the record, page by page. Give the SHA-256 of the document as record_read lists it. '
  + 'The result pages holds the text of each page, and pages[0] is page 1. Read the office letter with this tool before '
  + 'you propose a report: every statement of the report quotes this text. A quote is a part of one page, copied '
  + 'character for character, with that page number. The tool changes nothing in the record.'

const NOT_FOUND =
  'The Firm Record has no text for this document: the hash is not a document of the record, or the document has no '
  + 'text layer. Check the hash against record_read. If the document has no text layer, tell the attorney in this chat.'

const OUTPUT_SCHEMA = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        pages: { type: 'array', required: true, description: 'The text of each page; the first item is page 1.', items: { type: 'string' } },
      },
    },
    RUN_ERROR_SCHEMA,
  ],
} as const

/**
 * Build `record_read_document_text`.
 * @param ctx - context with `flowleapRecord`.
 * @returns the unregistered definition.
 */
export function readDocumentTextTool(ctx: Context): ToolDefinition {
  return defineTool({
    name: READ_DOCUMENT_TEXT_NAME,
    description: DESCRIPTION,
    parameters: {
      document: { type: 'string', required: true, description: 'SHA-256 of a document of the record, as record_read lists it.' },
    },
    output: { schema: OUTPUT_SCHEMA, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(raw, exec): Promise<ReadDocumentTextResult> {
      const args = parseArgs(Args, raw)
      const result = await ctx.flowleapRecord.documentText(args.document, exec.signal)
      return 'error' in result ? runRefusal(result, { not_found: NOT_FOUND }) : { pages: [...result.pages] }
    },
    presentCall: args => ({ card: 'generic', title: 'Read the document text', kind: 'read', rawInput: args.document }),
  })
}
