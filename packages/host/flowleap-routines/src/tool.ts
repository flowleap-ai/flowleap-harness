/** The model-facing `register_watch_create` tool: one daily scheduled task that runs only when a watched register lists a new event. */
import type { Context } from '@deepseek-ai/cordis'
import { parseRegisterApplication, type RegisterApplication } from '@deepseek-ai/dsh-flowleap-connectors'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { MAX_TITLE_LENGTH } from '@deepseek-ai/dsh-schedule'
import { delegationDepthOf } from '@deepseek-ai/dsh-subagent'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { RegisterWatches, WatchBaseline } from './register-watch.ts'
import { watchedLine } from './watch.ts'

/** Tool name. */
export const REGISTER_WATCH_CREATE_NAME = 'register_watch_create'

/** A created watch as the model reads it. */
export interface RegisterWatchView {
  /** Scheduled task id; `schedule_delete` and `schedule_update` act on it. */
  readonly id: string
  /** Task name. */
  readonly title: string
  /** Stored instruction, ending with the watched applications. */
  readonly prompt: string
  /** First run, RFC 3339 UTC. */
  readonly scheduledAt: string
  /** Register state when the watch started; these entries are never reported. */
  readonly applications: WatchBaseline[]
}

/** A refused creation. */
export interface RegisterWatchError {
  /** `invalid_application`, `subagent_session`, or `internal_error`. */
  readonly code: string
  /** What to change. */
  readonly message: string
}

const OUTPUT_SCHEMA = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'string', required: true },
        title: { type: 'string', required: true },
        prompt: { type: 'string', required: true },
        scheduledAt: { type: 'string', required: true },
        applications: {
          type: 'array',
          required: true,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              application: { type: 'string', required: true },
              entries: { type: 'integer', required: true },
            },
          },
        },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        code: { type: 'string', required: true },
        message: { type: 'string', required: true },
      },
    },
  ],
} as const

const DESCRIPTION =
  'Watch the patent registers of applications with one daily task in the current session. '
  + 'Each day the host reads the register events of each application without you; the task runs only when an event is new, '
  + 'and its prompt then lists the new events (date, application, event code, text). Events listed now are never reported. '
  + 'Manage the task with schedule_list, schedule_update, and schedule_delete.'

/**
 * Register `register_watch_create` in the scope that holds the Schedule service.
 * @param ctx - scope with `tools` and `schedule`.
 * @param watches - the watch store.
 * @param maxApplications - most applications one watch names.
 * @returns the disposer that removes the tool.
 */
export function registerWatchTool(ctx: Context, watches: RegisterWatches, maxApplications: number): () => void {
  return ctx.tools.register(defineTool({
    name: REGISTER_WATCH_CREATE_NAME,
    description: DESCRIPTION,
    parameters: {
      applications: {
        type: 'array',
        required: true,
        description: `EP publication numbers (for example "EP 3 456 789") or US application numbers (for example "US 17/123,456"); at most ${maxApplications}.`,
        items: { type: 'string' },
      },
      title: {
        type: 'string',
        required: true,
        description: `Concise task name in the user's language, at most ${MAX_TITLE_LENGTH} characters.`,
      },
      prompt: {
        type: 'string',
        required: true,
        description: 'What to do in a run, for example the skill to use on a new office action.',
      },
      daily: {
        type: 'object',
        required: true,
        additionalProperties: false,
        description: 'Local time of the daily register read.',
        properties: {
          time: { type: 'string', required: true, description: 'HH:mm:ss, for example 07:00:00.' },
          time_zone: { type: 'string', required: true, description: 'UTC or IANA Area/Location, for example Europe/Berlin.' },
        },
      },
    },
    output: { schema: OUTPUT_SCHEMA, render: renderValue },
    async execute(args, exec): Promise<RegisterWatchView | RegisterWatchError> {
      const agent = exec.agent
      if (agent === undefined) return internalError()
      if (delegationDepthOf(agent) > 0) {
        return { code: 'subagent_session', message: 'A delegated subagent cannot create a register watch.' }
      }
      const applications = parseApplications(args.applications, maxApplications)
      if ('code' in applications) return applications
      // A failed register read or an invalid daily time rejects the call before the task exists.
      const reads = await watches.baseline(applications, exec.signal)
      const record = await ctx.schedule.create(agent.session.id, {
        title: args.title, prompt: `${args.prompt.trim()}\n\n${watchedLine(applications)}`, daily: args.daily,
      }, exec.signal)
      try {
        const baseline = await watches.start(record.id, reads)
        return { id: record.id, title: record.title, prompt: record.prompt, scheduledAt: record.scheduledAt, applications: baseline }
      } catch (error: unknown) {
        // A task without its watch row would deliver the stored instruction every day.
        await ctx.schedule.delete({ sessionId: agent.session.id, id: record.id })
        throw error
      }
    },
    presentCall: args => ({ card: 'generic', title: 'Watch registers', kind: 'other', rawInput: args.applications }),
  }))
}

/**
 * Normalize the requested applications, without repetitions.
 * @param inputs - application numbers as the model wrote them.
 * @param max - most applications one watch names.
 * @returns the applications, or the refusal naming each invalid one.
 */
function parseApplications(inputs: readonly string[], max: number): RegisterApplication[] | RegisterWatchError {
  const parsed = inputs.map(input => ({ input, application: parseRegisterApplication(input) }))
  const invalid = parsed.filter(({ application }) => application === undefined).map(({ input }) => input)
  if (invalid.length > 0) {
    return {
      code: 'invalid_application',
      message: `Not an EP publication or US application number: ${invalid.join(', ')}. Use, for example, "EP 3 456 789" or "US 17/123,456".`,
    }
  }
  const applications = [...new Set(parsed
    .filter((entry): entry is { input: string; application: RegisterApplication } => entry.application !== undefined)
    .map(({ application }) => application))]
  if (applications.length === 0) return { code: 'invalid_application', message: 'Name at least one application.' }
  if (applications.length > max) return { code: 'invalid_application', message: `Name at most ${max} applications in one watch.` }
  return applications
}

function internalError(): RegisterWatchError {
  return { code: 'internal_error', message: 'The register watch could not be created.' }
}

function renderValue(_args: unknown, value: unknown): ContentBlock[] {
  return [{ type: 'text', text: JSON.stringify(value) }]
}
