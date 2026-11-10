/** The model-facing `record_my_work` tool: the matters of the person and what waits for them, from the Firm Record. */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { LOCAL_DATE, REFUSAL_OUTPUT, SEAM_MESSAGES, STRING_OR_NULL } from './tool-output.ts'
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
  ...SEAM_MESSAGES,
  not_configured: 'This runtime has no Firm Record configured, so no work can be read.',
  service_error: 'The Firm Record answered with an error, or has no list of work. Try again later.',
  invalid_answer: 'The Firm Record answered with data that is not a list of work.',
}

const WORK_ITEM = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', required: true, description: '<kind>:<object id>.' },
    task: { type: 'string', description: 'The task id.' },
    kind: { type: 'string', required: true, description: 'The task kind, such as confirm-deadline. A kind that you do not know is still work: read it through the other fields.' },
    title: { type: 'string', required: true, description: 'What you do, in plain words.' },
    why: { type: 'string', required: true, description: 'Why this task is yours.' },
    state: { type: 'string', enum: ['assigned', 'queued', 'escalated', 'alarm'], description: 'assigned: yours. queued: nobody may do it now, and you keep the queue. escalated: its due time passed, and it came to you. alarm: every person of its chain passed the due time.' },
    group: { type: 'string', enum: ['overdue', 'today', 'later'], description: 'The group of My work, in the firm\'s time zone.' },
    matter: {
      required: true,
      description: 'The matter of the task; null when it has none that you may see.',
      oneOf: [{
        type: 'object',
        additionalProperties: false,
        properties: { fileNumber: { type: 'string', required: true }, title: { type: 'string', required: true } },
      }, { type: 'null' }],
    },
    due: { oneOf: [LOCAL_DATE, { type: 'null' }], required: true, description: 'The legal date when there is one; otherwise null.' },
    dueAt: { type: 'string', description: 'ISO timestamp: the task\'s own due time.' },
    since: { type: 'string', required: true, description: 'ISO timestamp at which the task opened.' },
    act: { type: 'string', required: true, description: 'The address in the Records app where you act, such as deadline/<id>.' },
  },
} as const

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
        summary: {
          type: 'object',
          additionalProperties: false,
          description: 'The first line of My work: "N letters arrived, M need you". lettersArrived: the letters stored today that you may see; needYou: your open tasks; overdue, today, later: your open tasks in each group.',
          properties: {
            lettersArrived: { type: 'integer', required: true },
            needYou: { type: 'integer', required: true },
            overdue: { type: 'integer', required: true },
            today: { type: 'integer', required: true },
            later: { type: 'integer', required: true },
          },
        },
        work: {
          type: 'array',
          required: true,
          description: 'Your open tasks, the next step first: by the earlier of the task\'s due time and the end of its legal date, then by the time the task opened.',
          items: WORK_ITEM,
        },
        inSight: {
          type: 'array',
          description: 'The open tasks that you held before their due time passed and they went to the next person of their chain.',
          items: WORK_ITEM,
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
              applicationNumber: { ...STRING_OR_NULL, required: true, description: 'The application number of the matter, for example EP24166597; null when the record holds none.' },
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
    REFUSAL_OUTPUT,
  ],
} as const

const DESCRIPTION =
  'List who you are in the firm\'s record and what waits for you. The list work holds your open tasks: the Firm Record '
  + 'opens one task for one named person at each step that waits for a person, and closes it when the act on its object '
  + 'is recorded, so the list is the same as the person\'s My work screen. summary is its first line: '
  + 'lettersArrived letters arrived today, needYou need the person, with the count of each group (overdue, today, later). '
  + 'Read each item through title, why, matter, due, since, and act, also for a kind that you do not know: a new kind is '
  + 'work too, and you do not skip it. due is the legal date; dueAt is the task\'s own due time. inSight holds the tasks '
  + 'that the person held before they went to the next person of their chain. '
  + 'The list matters is the context beside it: the matters inside the person\'s walls, each with the role of the person '
  + '(responsible or team), its state, and its next open deadline (null when it has none). Each matter has '
  + 'applicationNumber, the application number of the matter, for example EP24166597. The register and patent tools take it. '
  + 'When it has a value, use it, and do not ask the person for a publication number or an application number. '
  + 'applicationNumber is null when the record holds none. Use the tool when the person '
  + 'asks which matters are theirs or what waits for them. Give no argument: the record token names the person. The '
  + 'lists hold only what this person may see. A null name means that the person has no display name yet: do not say that '
  + 'the person has no name or does not exist. A letter in the Intake that waits to be filed is a file-letter task of one '
  + 'intake person; you cannot read such a letter before it is filed. You cannot close a task: the person acts on its object '
  + 'in the Records app (act). The result names '
  + 'recordSeq, the position of the record log the lists were read at. The '
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
