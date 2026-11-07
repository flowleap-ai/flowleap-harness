/** The `record_finish_run` tool: the end of a Ticket run, with the deadline summary that the run read. @module */

import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { parseArgs } from '@deepseek-ai/dsh-flowleap-office'
import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import { z } from 'zod'
import type { DeadlineId, DeadlineSummary, RunFinishReceipt } from '../types.ts'
import { callSession, recordSeqArg, ticketIdArg } from './args.ts'
import { RUN_ERROR_SCHEMA, runRefusal, type RunCommandError } from './refusal.ts'

/** Tool name. */
export const FINISH_RUN_NAME = 'record_finish_run'

/** The canonical value of `record_finish_run`: the receipt, or the refusal. */
export type FinishRunResult = RunFinishReceipt | RunCommandError

const STATES = ['proposed', 'active', 'rejected', 'none-yet'] as const

const Args = z.object({
  ticket_id: ticketIdArg,
  deadline_id: z.string().trim().min(1),
  deadline_state: z.enum(STATES),
  record_seq: recordSeqArg,
}).strict().refine(
  args => (args.deadline_id === 'none-yet') === (args.deadline_state === 'none-yet'),
  'deadline_id and deadline_state are both none-yet when the event has no deadline in the record, and neither otherwise.',
)

const DESCRIPTION =
  'End this Ticket run after you proposed its letters. Give the deadline summary: the id and state of the deadline '
  + 'of the office event as record_read shows it, and the recordSeq of that read; give none-yet for both id and state '
  + 'when the record has no deadline for the event. You do not compute or change a date: the attorney checks the '
  + 'deadline and decides each proposal in the Records app. When a person forwarded the office letter, the Firm Record '
  + 'then queues one reply to firm addresses only, that person and the routed attorney, with the proposed letters '
  + 'attached as drafts; a letter from the scan mailbox gets no reply. Nothing goes to the client, and you send nothing.'

const OUTPUT_SCHEMA = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        recordSeq: { type: 'integer', required: true, description: 'Record seq of the last event the finish appended.' },
        outbox: {
          required: true,
          description: 'The reply with the drafts to the forwarder and the routed attorney: queued for the mailbox, or refused '
            + 'because a recipient is not a firm address; null for a letter from the scan mailbox, which gets no reply.',
          oneOf: [{ type: 'null' }, {
            type: 'object',
            additionalProperties: false,
            properties: {
              id: { type: 'string', required: true },
              state: { type: 'string', required: true, enum: ['queued', 'refused'] },
            },
          }],
        },
      },
    },
    RUN_ERROR_SCHEMA,
  ],
} as const

/**
 * Build `record_finish_run`.
 * @param ctx - context with `flowleapRecord`.
 * @returns the unregistered definition.
 */
export function finishRunTool(ctx: Context): ToolDefinition {
  return defineTool({
    name: FINISH_RUN_NAME,
    description: DESCRIPTION,
    parameters: {
      ticket_id: { type: 'string', required: true, description: 'The ticket id of the run message.' },
      deadline_id: { type: 'string', required: true, description: 'The id of the deadline of the office event, or none-yet.' },
      deadline_state: { type: 'string', required: true, enum: [...STATES], description: 'Its state as record_read shows it, or none-yet.' },
      record_seq: { type: 'integer', required: true, description: 'The recordSeq of the record_read view the summary rests on.' },
    },
    output: { schema: OUTPUT_SCHEMA, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(raw, exec): Promise<FinishRunResult> {
      const args = parseArgs(Args, raw)
      const session = callSession(exec)
      const deadline: DeadlineSummary = args.deadline_state === 'none-yet'
        ? { id: 'none-yet', state: 'none-yet', seq: args.record_seq }
        : { id: brandString<DeadlineId>(args.deadline_id), state: args.deadline_state, seq: args.record_seq }
      const result = await ctx.flowleapRecord.finishRun(args.ticket_id, { session, deadline }, exec.signal)
      return 'error' in result ? runRefusal(result) : result
    },
    presentCall: () => ({ card: 'generic', title: 'Finish the run', kind: 'other' }),
  })
}
