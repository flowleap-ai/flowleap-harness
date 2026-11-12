/**
 * The `record_propose_reading` tool: the run's reading of an office letter, one item per objection of the examiner and the
 * cited documents, each with exact passages of the letter. It proposes; the attorney accepts or rejects it in the Records app.
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import { parseArgs } from '@deepseek-ai/dsh-flowleap-office'
import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import { z } from 'zod'
import type { ReadingDocument, ReadingItem, ReadingLanguage, ReadingReceipt } from '../types.ts'
import { callSession, nonEmpty, sha256Arg, ticketIdArg } from './args.ts'
import { RUN_ERROR_SCHEMA, runRefusal, type RunCommandError } from './refusal.ts'

/** Tool name. */
export const PROPOSE_READING_NAME = 'record_propose_reading'

/** The canonical value of `record_propose_reading`: the receipt, or the refusal. */
export type ProposeReadingResult = ReadingReceipt | RunCommandError

const Span = z.object({
  page: z.number().int().positive(),
  quote: z.string().min(1).max(200),
}).strict()

const Spans = z.array(Span).min(1, 'Every objection and every cited document needs at least one passage of the letter.').max(10)

const LANGUAGES = ['de', 'en', 'fr'] as const satisfies readonly ReadingLanguage[]

const Item = z.object({
  ground: z.string().trim().min(1).max(200),
  claims: z.array(z.number().int().positive()).max(500).default([]),
  documents: z.array(z.string().regex(/^D\d{1,3}$/u)).default([]),
  reasoning: z.string().trim().min(1).max(2000),
  evidence: Spans,
}).strict()

const CitedDocument = z.object({
  label: z.string().regex(/^D\d{1,3}$/u),
  publication: z.string().trim().min(1).max(200),
  evidence: Spans,
}).strict()

const Args = z.object({
  ticket_id: ticketIdArg,
  document: sha256Arg,
  language: z.enum(LANGUAGES),
  items: z.array(Item).max(100),
  documents: z.array(CitedDocument).max(50).default([]),
  no_items_reason: z.string().trim().min(1).max(1000).optional(),
}).strict()

const DESCRIPTION =
  'Propose your reading of the office letter of this Ticket to the attorney: what the examiner said, and nothing else. '
  + 'Give one item per objection: the legal ground (for example "Art. 84 EPC: clarity"), the numbers of the claims it '
  + 'concerns, the labels of the cited documents it uses, and the examiner\'s reasoning in short, in the language of the '
  + 'letter. List the documents that the letter cites, each with its label (D1, D2 and so on) and its publication number as '
  + 'the letter prints it. Each item and each document needs at least one passage: the page number and a quote of at most '
  + '200 characters, copied character for character from that page of the text that record_read_document_text gives, '
  + 'never translated. A run of spaces and line breaks counts as one space; nothing else may differ. The quote must be on '
  + 'that page exactly once, so use a longer quote when a short one is on the page more than once. When the letter holds no '
  + 'objection (for example only the cover form, which names the reasons as an enclosure), give no item and say why in '
  + 'no_items_reason; do not guess an objection. The Firm Record finds each quote and stores its place, and refuses a '
  + 'passage that it does not find. The attorney accepts or rejects the reading in the Records app.'

const MESSAGES = {
  statement_without_evidence: 'Every objection and every cited document needs at least one passage of the letter. Add the passages and propose again.',
  no_proposals: 'The run has no proposal yet. Propose the reading with record_propose_reading first.',
  idempotency_key_reused: 'The Firm Record already took a different reading of this tool call. Do not repeat it; tell the attorney in this chat what differs.',
  evidence_outside_matter: 'The document is not the office letter of this Ticket. Use the document hash of the office event from record_read.',
} as const

const OUTPUT_SCHEMA = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        readingId: { type: 'string', required: true },
        recordSeq: { type: 'integer', required: true, description: 'Record seq of the reading/proposed event.' },
      },
    },
    RUN_ERROR_SCHEMA,
  ],
} as const

const SPANS_SCHEMA = {
  type: 'array',
  required: true,
  description: 'The passages of the letter that say it: 1 to 10.',
  items: {
    type: 'object',
    additionalProperties: false,
    properties: {
      page: { type: 'integer', required: true, description: 'Page number, from 1.' },
      quote: { type: 'string', required: true, description: 'Text of that page, copied character for character; 1 to 200 characters; on the page exactly once.' },
    },
  },
} as const

/**
 * Build `record_propose_reading`.
 * @param ctx - context with `flowleapRecord`.
 * @returns the unregistered definition.
 */
export function proposeReadingTool(ctx: Context): ToolDefinition {
  return defineTool({
    name: PROPOSE_READING_NAME,
    description: DESCRIPTION,
    parameters: {
      ticket_id: { type: 'string', required: true, description: 'The ticket id of the run message.' },
      document: { type: 'string', required: true, description: 'SHA-256 of the office letter, the document of the office event in record_read.' },
      language: { type: 'string', required: true, enum: [...LANGUAGES], description: 'The language of the letter.' },
      items: {
        type: 'array',
        required: true,
        description: 'One item per objection of the examiner; none when the letter holds no objection.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ground: { type: 'string', required: true, description: 'The legal ground, such as "Art. 56 EPC: inventive step".' },
            claims: { type: 'array', items: { type: 'integer' }, description: 'The numbers of the claims that the objection concerns.' },
            documents: { type: 'array', items: { type: 'string' }, description: 'The labels of the cited documents it uses, such as "D1".' },
            reasoning: { type: 'string', required: true, description: 'The examiner\'s reasoning in short, in the language of the letter.' },
            evidence: SPANS_SCHEMA,
          },
        },
      },
      documents: {
        type: 'array',
        description: 'The documents that the letter cites.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            label: { type: 'string', required: true, description: 'D1, D2 and so on, as the letter names it.' },
            publication: { type: 'string', required: true, description: 'The publication number as the letter prints it.' },
            evidence: SPANS_SCHEMA,
          },
        },
      },
      no_items_reason: { type: 'string', description: 'Only when there is no item: why the letter holds no objection.' },
    },
    output: { schema: OUTPUT_SCHEMA, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(raw, exec): Promise<ProposeReadingResult> {
      const args = parseArgs(Args, raw)
      const items = args.items.map((item): ReadingItem => ({ ...item, evidence: nonEmpty(item.evidence) }))
      const documents = args.documents.map((d): ReadingDocument => ({ ...d, evidence: nonEmpty(d.evidence) }))
      const result = await ctx.flowleapRecord.proposeReading(args.ticket_id, {
        document: args.document,
        language: args.language,
        items,
        documents,
        noItemsReason: args.no_items_reason ?? null,
        session: callSession(exec),
        toolCall: exec.callId,
      }, exec.signal)
      return 'error' in result ? runRefusal(result, MESSAGES) : result
    },
    presentCall: args => ({
      card: 'generic',
      title: Array.isArray(args.items) && args.items.length > 0 ? `Propose the reading: ${String(args.items.length)} objection(s)` : 'Propose the reading',
      kind: 'other',
    }),
  })
}
