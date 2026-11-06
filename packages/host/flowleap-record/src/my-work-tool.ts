/** The model-facing `record_my_work` tool: the matters of the person and what waits for them, from the Firm Record. */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { MyWork, MyWorkRefusal } from './types.ts'

/** Tool name. */
export const RECORD_MY_WORK_NAME = 'record_my_work'

/** A refused read as the model reads it. */
export interface RecordMyWorkError {
  readonly error: MyWorkRefusal
  /** What the refusal means and what to do. */
  readonly message: string
}

/** The canonical value of `record_my_work`: the work, or the refusal. */
export type RecordMyWorkResult = MyWork | RecordMyWorkError

const MESSAGES: Record<MyWorkRefusal, string> = {
  not_configured: 'This runtime has no Firm Record configured, so no work can be read.',
  no_key: 'This runtime has no record token, so the Firm Record refuses every read.',
  refused: 'The Firm Record refused the runtime\'s record token.',
  unreachable: 'The Firm Record did not answer. Try again later.',
  service_error: 'The Firm Record answered with an error, or has no list of work. Try again later.',
  invalid_answer: 'The Firm Record answered with data that is not a list of work.',
}

const LOCAL_DATE = { type: 'string', description: 'YYYY-MM-DD' } as const

const STRING_OR_NULL = { oneOf: [{ type: 'string' }, { type: 'null' }] } as const

const OUTPUT_SCHEMA = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        recordSeq: { type: 'integer', required: true, description: 'Position in the record log at which the list was read.' },
        person: {
          type: 'object',
          required: true,
          additionalProperties: false,
          properties: {
            id: { type: 'string', required: true },
            name: { ...STRING_OR_NULL, required: true, description: 'Display name; null when the person has none yet.' },
          },
        },
        work: {
          type: 'array',
          required: true,
          description: 'Every kind of work that waits for you, by due date (no date last), then by the time it began to wait.',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              id: { type: 'string', required: true, description: '<kind>:<object id>.' },
              kind: { type: 'string', required: true, description: 'The kind of work, such as confirm-deadline. A kind that you do not know is still work: read it through the other fields.' },
              title: { type: 'string', required: true, description: 'What you do, in plain words.' },
              why: { type: 'string', required: true, description: 'Why this work is yours.' },
              matter: {
                required: true,
                description: 'The matter of the work; null when it has none that you may see.',
                oneOf: [{
                  type: 'object',
                  additionalProperties: false,
                  properties: { fileNumber: { type: 'string', required: true }, title: { type: 'string', required: true } },
                }, { type: 'null' }],
              },
              due: { oneOf: [LOCAL_DATE, { type: 'null' }], required: true, description: 'The legal date when there is one; otherwise null.' },
              since: { type: 'string', required: true, description: 'ISO timestamp at which the work began to wait.' },
              act: { type: 'string', required: true, description: 'The address in the Records app where you act, such as deadline/<id>.' },
            },
          },
        },
        matters: {
          type: 'array',
          required: true,
          description: 'The matters inside your walls, the nearest due date first.',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              fileNumber: { type: 'string', required: true, description: 'Give this to record_read to read the matter in full.' },
              title: { type: 'string', required: true },
              client: { type: 'string', required: true },
              role: { type: 'string', required: true, enum: ['responsible', 'team'] },
              state: { type: 'string', required: true, enum: ['open', 'closed'] },
              nextDeadline: {
                required: true,
                description: 'The earliest proposed or active deadline; null when the matter has none.',
                oneOf: [{
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    id: { type: 'string', required: true },
                    due: { ...LOCAL_DATE, required: true },
                    state: { type: 'string', required: true, enum: ['deadline_proposed', 'active'] },
                  },
                }, { type: 'null' }],
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
  'List who you are in the firm\'s record and what waits for you. The list work holds every kind of work that waits for '
  + 'this person. Today the Firm Record derives it from the states of the record. Read each item through title, why, '
  + 'matter, due, since, and act, also for a kind that you do not know: a new kind is work too, and you do not skip it. '
  + 'The list matters is the context beside it: the matters inside the person\'s walls, each with the role of the person '
  + '(responsible or team), its state, and its next open deadline (null when it has none). Use the tool when the person '
  + 'asks which matters are theirs or what waits for them. Give no argument: the record token names the person. The '
  + 'lists hold only what this person may see. A null name means that the person has no display name yet: do not say that '
  + 'the person has no name or does not exist. A runtime never lists a letter that is not filed yet, so do not say that '
  + 'no letter waits to be filed. The result names recordSeq, the position of the record log the lists were read at. The '
  + 'read is read-only: you cannot change the record. To read one matter in full, call record_read with its fileNumber.'

/**
 * Register `record_my_work` in the scope that holds the `flowleapRecord` seam.
 * @param ctx - scope with `tools` and `flowleapRecord`.
 * @returns the disposer that removes the tool.
 */
export function registerRecordMyWorkTool(ctx: Context): () => void {
  return ctx.tools.register(defineTool({
    name: RECORD_MY_WORK_NAME,
    description: DESCRIPTION,
    parameters: {},
    output: { schema: OUTPUT_SCHEMA, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(_args, exec): Promise<RecordMyWorkResult> {
      const result = await ctx.flowleapRecord.myWork(exec.signal)
      return 'error' in result ? { error: result.error, message: MESSAGES[result.error] } : result
    },
    presentCall: () => ({ card: 'generic', title: 'Read my work', kind: 'read' }),
  }))
}
