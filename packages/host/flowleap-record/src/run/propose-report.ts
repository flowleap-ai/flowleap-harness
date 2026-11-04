/** The `record_propose_report` tool: the client report letter of a Ticket run, proposed with its evidence. @module */

import { createHash } from 'node:crypto'
import { basename } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { callWorkspace, parseArgs, readInput, readTemplate } from '@deepseek-ai/dsh-flowleap-office'
import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import { z } from 'zod'
import type { ReportReceipt, ReportStatement } from '../types.ts'
import { callSession, nonEmpty, recordSeqArg, sha256Arg, ticketIdArg } from './args.ts'
import { RUN_ERROR_SCHEMA, runRefusal, type RunCommandError } from './refusal.ts'

/** Tool name. */
export const PROPOSE_REPORT_NAME = 'record_propose_report'

/** Most bytes of a proposed letter; the Firm Record takes no larger document. */
export const MAX_REPORT_BYTES = 5 * 1024 * 1024

/** Most bytes of a firm template that the tool hashes. */
const MAX_TEMPLATE_BYTES = 32 * 1024 * 1024

/** The canonical value of `record_propose_report`: the receipt, or the refusal. */
export type ProposeReportResult = ReportReceipt | RunCommandError

const Span = z.object({
  page: z.number().int().positive(),
  quote: z.string().min(1).max(200),
}).strict()

const Evidence = z.object({ document: sha256Arg, span: Span }).strict()

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
  + 'the office letter, the matter, or the deadline, each with at least one source. A source is the SHA-256 of a document '
  + 'of the record (record_read lists them) and a span: the page number and a quote of at most 200 characters that you '
  + 'copy character for character from that page of the text that record_read_document_text gives. The quote must be on '
  + 'that page exactly once, so use a longer quote when a short one is on the page more than once. The Firm Record finds '
  + 'the quote and stores its place; it refuses a source without a span and a quote that it does not find. rules_seq is the seq of the client rules '
  + '(clientRules.seq of record_read) that the letter follows. The Firm Record stores the letter as a proposal; the '
  + 'attorney accepts or rejects it in the Records app. Nothing goes to the client before the attorney decides: when the '
  + 'run finishes, the Firm Record attaches the letter as a draft to one reply to firm addresses only, the person who '
  + 'forwarded the office letter and the routed attorney. You do not send the letter.'

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
                    required: true,
                    additionalProperties: false,
                    description: 'The exact place in the page text of the document, as record_read_document_text gives it.',
                    properties: {
                      page: { type: 'integer', required: true, description: 'Page number, from 1.' },
                      quote: { type: 'string', required: true, description: 'Text of that page, copied character for character; 1 to 200 characters; on the page exactly once.' },
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
        evidence: nonEmpty(statement.evidence),
      })))
      const result = await ctx.flowleapRecord.proposeReport(args.ticket_id, {
        fileName: basename(args.file),
        content,
        templateName: args.template,
        templateVersion: `sha256:${createHash('sha256').update(template).digest('hex')}`,
        rulesSeq: args.rules_seq,
        statements,
        session,
        toolCall: exec.callId,
      }, exec.signal)
      return 'error' in result ? runRefusal(result) : result
    },
    presentCall: args => ({
      card: 'generic', title: 'Propose the report letter', kind: 'other', locations: [{ path: args.file }],
    }),
  })
}
