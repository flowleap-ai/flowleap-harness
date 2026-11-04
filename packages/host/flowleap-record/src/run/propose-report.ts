/** The `record_propose_report` tool: the client report letter of a Ticket run, proposed with its evidence. @module */

import { createHash } from 'node:crypto'
import { basename } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { callWorkspace, parseArgs, readInput, readTemplate } from '@deepseek-ai/dsh-flowleap-office'
import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import { z } from 'zod'
import type { DocumentSha256, ReportReceipt, ReportStatement } from '../types.ts'
import { callSession, nonEmpty, recordSeqArg, ticketIdArg } from './args.ts'
import { RUN_ERROR_SCHEMA, runRefusal, type RunCommandError } from './refusal.ts'

/** Tool name. */
export const PROPOSE_REPORT_NAME = 'record_propose_report'

/** Most bytes of a proposed letter; the Firm Record takes no larger document. */
export const MAX_REPORT_BYTES = 5 * 1024 * 1024

/** Most bytes of a firm template that the tool hashes. */
const MAX_TEMPLATE_BYTES = 32 * 1024 * 1024

/** The canonical value of `record_propose_report`: the receipt, or the refusal. */
export type ProposeReportResult = ReportReceipt | RunCommandError

const sha256Arg = z.string().regex(/^[0-9a-f]{64}$/u, 'Use the SHA-256 of a document of the record, as record_read lists it.')
  .transform(value => brandString<DocumentSha256>(value))

const Span = z.object({
  page: z.number().int().positive(),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  quote: z.string().min(1).max(200),
}).strict().refine(span => span.end >= span.start, 'span.end must not be before span.start.')

const Evidence = z.object({ document: sha256Arg, span: Span.optional() }).strict()

const Statement = z.object({
  text: z.string().trim().min(1),
  evidence: z.array(Evidence).min(1, 'Every statement needs at least one source document.'),
}).strict()

const Args = z.object({
  ticket_id: ticketIdArg,
  file: z.string().min(1),
  template: z.string().min(1),
  rules_seq: recordSeqArg,
  statements: z.array(Statement).min(1),
}).strict()

const DESCRIPTION =
  'Propose the client report letter of this Ticket run to the attorney. The letter is a .docx file in the working '
  + 'directory that office_letter_from_template wrote on a firm template. Give each statement that the letter makes about '
  + 'the office letter, the matter, or the deadline, each with at least one source: the SHA-256 of a document of the '
  + 'record (record_read lists them) and, when you can, the quoted place. rules_seq is the seq of the client rules '
  + '(clientRules.seq of record_read) that the letter follows. The Firm Record stores the letter as a proposal; the '
  + 'attorney accepts or rejects it in the Records app. You do not send the letter, and nobody sends it before the '
  + 'attorney decides.'

const OUTPUT_SCHEMA = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        proposalId: { type: 'string', required: true },
        document: { type: 'string', required: true, description: 'SHA-256 of the stored letter.' },
        recordSeq: { type: 'integer', required: true, description: 'Record seq of the report/proposed event.' },
      },
    },
    RUN_ERROR_SCHEMA,
  ],
} as const

/**
 * Build `record_propose_report`.
 * @param ctx - context with `flowleapRecord`, `fs`, and `workingDirectory`.
 * @param templatesDir - the firm's template folder, the same folder the Office tools read.
 * @returns the unregistered definition.
 */
export function proposeReportTool(ctx: Context, templatesDir: string): ToolDefinition {
  return defineTool({
    name: PROPOSE_REPORT_NAME,
    description: DESCRIPTION,
    parameters: {
      ticket_id: { type: 'string', required: true, description: 'The ticket id of the run message.' },
      file: { type: 'string', required: true, description: 'The .docx letter, relative to the working directory.' },
      template: { type: 'string', required: true, description: 'File name of the firm template the letter is on, as given to office_letter_from_template.' },
      rules_seq: { type: 'integer', required: true, description: 'clientRules.seq of record_read.' },
      statements: {
        type: 'array',
        required: true,
        description: 'The statements of the letter, each with its sources.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            text: { type: 'string', required: true, description: 'One statement of the letter.' },
            evidence: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  document: { type: 'string', required: true, description: 'SHA-256 of a document of the record.' },
                  span: {
                    type: 'object',
                    additionalProperties: false,
                    description: 'The quoted place in the page text of the document.',
                    properties: {
                      page: { type: 'integer', required: true },
                      start: { type: 'integer', required: true },
                      end: { type: 'integer', required: true },
                      quote: { type: 'string', required: true, description: 'At most 200 characters.' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    output: { schema: OUTPUT_SCHEMA, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(raw, exec): Promise<ProposeReportResult> {
      const args = parseArgs(Args, raw)
      const session = callSession(exec)
      const workspace = await callWorkspace(ctx, exec)
      const content = await readInput(ctx, workspace, args.file, '.docx', MAX_REPORT_BYTES, exec.signal)
      const template = await readTemplate(templatesDir, args.template, MAX_TEMPLATE_BYTES)
      const statements = nonEmpty(args.statements.map((statement): ReportStatement => ({
        text: statement.text,
        evidence: nonEmpty(statement.evidence.map(({ document, span }) => span === undefined ? { document } : { document, span })),
      })))
      const result = await ctx.flowleapRecord.proposeReport(args.ticket_id, {
        fileName: basename(args.file),
        content,
        templateVersion: `sha256:${createHash('sha256').update(template).digest('hex')}`,
        rulesSeq: args.rules_seq,
        statements,
        session,
        toolCall: exec.rootCallId,
      }, exec.signal)
      return 'error' in result ? runRefusal(result) : result
    },
    presentCall: args => ({
      card: 'generic', title: 'Propose the report letter', kind: 'other', locations: [{ path: args.file }],
    }),
  })
}
