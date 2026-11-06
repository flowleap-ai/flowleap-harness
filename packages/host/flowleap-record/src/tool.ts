/** The model-facing `record_read` tool: one matter's view from the Firm Record, with the record position it was read at. */

import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { LOCAL_DATE, REFUSAL_OUTPUT, SEAM_MESSAGES, STRING_OR_NULL } from './tool-output.ts'
import type { MatterFileNumber, MatterView, MatterViewRefusal } from './types.ts'

/** Tool name. */
export const RECORD_READ_NAME = 'record_read'

/** Why `record_read` gives no view: a seam refusal, or a file number the model wrote that cannot name a matter. */
export type RecordReadRefusal = MatterViewRefusal | 'invalid_file_number'

/** A refused read as the model reads it. */
export interface RecordReadError {
  readonly error: RecordReadRefusal
  /** What the refusal means and what to do. */
  readonly message: string
}

/** The canonical value of `record_read`: the view, or the refusal. */
export type RecordReadResult = MatterView | RecordReadError

/** One to 64 characters: letters, digits, dot, underscore, space, slash, or hyphen, starting with a letter or digit. */
const FILE_NUMBER = /^[A-Za-z0-9][A-Za-z0-9._ /-]{0,63}$/u

const MESSAGES: Record<RecordReadRefusal, string> = {
  invalid_file_number: 'Not a file number. Use the firm\'s file number of the matter, for example FL-2026-0001.',
  not_found: 'The Firm Record has no matter with this file number that this runtime may read.',
  ...SEAM_MESSAGES,
  not_configured: 'This runtime has no Firm Record configured, so no matter can be read.',
  service_error: 'The Firm Record answered with an error. Try again later.',
  invalid_answer: 'The Firm Record answered with data that is not a matter view.',
}

const OUTPUT_SCHEMA = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        recordSeq: { type: 'integer', required: true, description: 'Position in the record log at which the view was read.' },
        viewHash: { type: 'string', required: true, description: 'SHA-256 of the view at that position.' },
        matter: {
          type: 'object',
          required: true,
          additionalProperties: false,
          properties: {
            fileNumber: { type: 'string', required: true },
            title: { type: 'string', required: true },
            client: { type: 'string', required: true },
            responsible: { ...STRING_OR_NULL, required: true, description: 'Display name of the responsible attorney; null when the person has none yet.' },
            applicationNumber: { ...STRING_OR_NULL, required: true, description: 'The application number of the matter, for example EP24166597; null when the record holds none.' },
            state: { type: 'string', required: true, enum: ['open', 'closed'] },
          },
        },
        deadlines: {
          type: 'array',
          required: true,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              id: { type: 'string', required: true },
              ruleId: { type: 'string', required: true },
              ruleVersion: { type: 'integer', required: true },
              due: { ...LOCAL_DATE, required: true },
              state: { type: 'string', required: true, enum: ['proposed', 'active', 'rejected'] },
              trace: {
                type: 'array',
                required: true,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    op: { type: 'string', required: true },
                    from: { ...LOCAL_DATE, required: true },
                    to: { ...LOCAL_DATE, required: true },
                    cite: { type: 'string', required: true },
                  },
                },
              },
            },
          },
        },
        clientRules: {
          description: 'The client\'s latest recorded rules; null when none are recorded; absent from a Firm Record before R1.',
          oneOf: [{ type: 'null' }, {
            type: 'object',
            additionalProperties: false,
            properties: {
              seq: { type: 'integer', required: true, description: 'Record seq of the rules; a report names it as rules_seq.' },
              aiUse: { type: 'string', required: true, enum: ['not-recorded', 'allowed', 'local-model-only', 'not-allowed'] },
              aiLetters: { type: 'string', required: true, enum: ['allowed', 'not-allowed'] },
              reportEvents: {
                required: true,
                oneOf: [{ type: 'string', enum: ['all-office-actions'] }, { type: 'array', items: { type: 'string' } }],
              },
              language: { type: 'string', required: true, enum: ['de', 'en'] },
              text: { type: 'string', required: true },
            },
          }],
        },
        officeEvents: {
          type: 'array',
          description: 'Absent from a Firm Record before R1.',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              id: { type: 'string', required: true },
              seq: { type: 'integer', required: true },
              code: { ...STRING_OR_NULL, required: true, description: 'Event code; null for a filed letter whose code is not decided yet.' },
              documentDate: { oneOf: [LOCAL_DATE, { type: 'null' }], required: true, description: 'Date of the document; null until it is read.' },
              applicationNumber: { ...STRING_OR_NULL, required: true },
              document: { ...STRING_OR_NULL, required: true, description: 'SHA-256 of the document.' },
              state: { type: 'string', required: true },
            },
          },
        },
        tickets: {
          type: 'array',
          description: 'Absent from a Firm Record before R1.',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              id: { type: 'string', required: true },
              pass: { type: 'integer', required: true },
              state: { type: 'string', required: true },
              routedTo: { ...STRING_OR_NULL, required: true, description: 'The routed person; null before routing.' },
            },
          },
        },
        documents: {
          type: 'array',
          description: 'Absent from a Firm Record before R1.',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              sha256: { type: 'string', required: true },
              fileName: { type: 'string', required: true },
              mediaType: { type: 'string', required: true },
              source: { type: 'string', required: true },
            },
          },
        },
      },
    },
    REFUSAL_OUTPUT,
  ],
} as const

const DESCRIPTION =
  'Read one matter of the firm\'s record: its file number, title, client, responsible attorney, state, and each deadline '
  + 'with its rule, due date, state, and the computation trace with legal citations; the client\'s recorded rules (AI use, '
  + 'AI letters, the events that need a report, the letter language, and their text); the office events, the Tickets, '
  + 'and the documents of the e-file with their SHA-256. A Firm Record before R1 holds none of clientRules, officeEvents, '
  + 'tickets, and documents: the result then has none of these four fields, and you do not know the client\'s rules, '
  + 'so you do not assume them. Every matter has a responsible attorney: matter.responsible is that person\'s display '
  + 'name, and responsible is null while the responsible attorney has no display name yet, so you do not say that the '
  + 'matter has none. matter.applicationNumber is the application number of the matter, for example EP24166597. The '
  + 'register and patent tools take it. When it has a value, use it, and do not ask the person for a publication number or '
  + 'an application number. applicationNumber is null when the record holds none. An office event\'s code and documentDate are null while the letter is filed but its event code is '
  + 'not decided and its date is not read. The result names recordSeq, the '
  + 'position of the record log the view was read at, and viewHash, so the view can be rebuilt later. '
  + 'The read is read-only: you cannot change the record, and a proposed deadline becomes active only when a person '
  + 'confirms it in the Records app.'

/**
 * Parse a file number the model wrote.
 * @param input - the argument as the model wrote it.
 * @returns the trimmed file number, or `undefined` when it cannot name a matter.
 */
export function parseFileNumber(input: string): MatterFileNumber | undefined {
  const trimmed = input.trim()
  return FILE_NUMBER.test(trimmed) ? brandString<MatterFileNumber>(trimmed) : undefined
}

/**
 * The refusal as the model reads it.
 * @param error - the refusal.
 * @returns the error value with its message.
 */
export function refusal(error: RecordReadRefusal): RecordReadError {
  return { error, message: MESSAGES[error] }
}

/**
 * Register `record_read` in the scope that holds the `flowleapRecord` seam.
 * @param ctx - scope with `tools` and `flowleapRecord`.
 * @returns the disposer that removes the tool.
 */
export function registerRecordReadTool(ctx: Context): () => void {
  return ctx.tools.register(defineTool({
    name: RECORD_READ_NAME,
    description: DESCRIPTION,
    parameters: {
      file_number: {
        type: 'string',
        required: true,
        description: 'The firm\'s file number of the matter, for example FL-2026-0001.',
      },
    },
    output: { schema: OUTPUT_SCHEMA, render: renderValue },
    async execute(args, exec): Promise<RecordReadResult> {
      const fileNumber = parseFileNumber(args.file_number)
      if (fileNumber === undefined) return refusal('invalid_file_number')
      const result = await ctx.flowleapRecord.matterView(fileNumber, exec.signal)
      return 'error' in result ? refusal(result.error) : result
    },
    presentCall: args => ({ card: 'generic', title: 'Read the firm record', kind: 'read', rawInput: args.file_number }),
  }))
}

function renderValue(_args: unknown, value: unknown): ContentBlock[] {
  return [{ type: 'text', text: JSON.stringify(value) }]
}
