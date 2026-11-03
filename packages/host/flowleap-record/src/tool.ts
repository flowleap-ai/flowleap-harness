/** The model-facing `record_read` tool: one matter's view from the Firm Record, with the record position it was read at. */

import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
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
  not_configured: 'This runtime has no Firm Record configured, so no matter can be read.',
  no_key: 'This runtime has no record token, so the Firm Record refuses every read.',
  refused: 'The Firm Record refused the runtime\'s record token.',
  unreachable: 'The Firm Record did not answer. Try again later.',
  service_error: 'The Firm Record answered with an error. Try again later.',
  invalid_answer: 'The Firm Record answered with data that is not a matter view.',
}

const LOCAL_DATE = { type: 'string', description: 'YYYY-MM-DD' } as const

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
            responsible: { type: 'string', required: true },
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
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        error: { type: 'string', required: true },
        message: { type: 'string', required: true },
      },
    },
  ],
} as const

const DESCRIPTION =
  'Read one matter of the firm\'s record: its file number, title, client, responsible attorney, state, and each deadline '
  + 'with its rule, due date, state, and the computation trace with legal citations. The result names recordSeq, the '
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
