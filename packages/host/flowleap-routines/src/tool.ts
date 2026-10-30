/** The model-facing `register_watch_create` tool: one daily scheduled task that runs only when a watched register lists a new event. */
import type { Context } from '@deepseek-ai/cordis'
import { parseRegisterApplication, type RegisterApplication } from '@deepseek-ai/dsh-flowleap-connectors'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { MAX_TITLE_LENGTH } from '@deepseek-ai/dsh-schedule'
import { delegationDepthOf } from '@deepseek-ai/dsh-subagent'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { RegisterWatches, WatchBaseline } from './register-watch.ts'
import type { WatchOptions } from './storage.ts'
import { watchedLine } from './watch.ts'

/** Tool name. */
export const REGISTER_WATCH_CREATE_NAME = 'register_watch_create'

/** A created watch as the model reads it. */
export interface RegisterWatchView {
  /** Scheduled task id; `schedule_view` and `schedule_edit` act on it. */
  readonly id: string
  /** Task name. */
  readonly title: string
  /** Stored instruction, ending with the watched applications. */
  readonly prompt: string
  /** Local time and time zone of the daily read, as requested. */
  readonly daily: { readonly time: string; readonly time_zone: string }
  /** Register state when the watch started; these entries are never reported. */
  readonly applications: WatchBaseline[]
}

/** A refused creation. */
export interface RegisterWatchError {
  /** `invalid_application`, `new_chat_unavailable`, `register_unavailable`, `empty_register`, `subagent_session`, or `internal_error`. */
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
        daily: {
          type: 'object',
          required: true,
          additionalProperties: false,
          properties: { time: { type: 'string', required: true }, time_zone: { type: 'string', required: true } },
        },
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
  + 'Manage the task with schedule_list, schedule_view, and schedule_edit. '
  + 'By default each run opens a new chat titled by the event and marks it "Needs review" when it finishes; '
  + 'new_chat_per_run and needs_review turn either off.'

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
      new_chat_per_run: {
        type: 'boolean',
        description: 'Each run opens a new chat in the workspace of this session, titled by the application and the event; false sends the run as a message in this session. Default true where the app can open chats.',
      },
      needs_review: {
        type: 'boolean',
        description: 'A finished run marks the chat that received it "Needs review" until the user answers or marks it done; false leaves no mark. Default true.',
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
      if (args.new_chat_per_run === true && !watches.chats.available()) {
        return { code: 'new_chat_unavailable', message: 'This app cannot open a new chat for each run. Omit new_chat_per_run or set it to false.' }
      }
      const reads = await watches.baseline(applications, exec.signal)
      if (!Array.isArray(reads)) {
        return { code: 'register_unavailable', message: `The register of ${reads.application} could not be read (${reads.failure}). Try again later.` }
      }
      const empty = reads.filter(({ read }) => read.entries.length === 0).map(({ application }) => application)
      if (empty.length > 0) {
        return {
          code: 'empty_register',
          message: `The register lists no events for ${empty.join(', ')}. Check the number: a US number must be an application number.`,
        }
      }
      // An invalid daily time rejects the call before the task exists.
      const record = await ctx.schedule.create({
        title: args.title, prompt: `${args.prompt.trim()}\n\n${watchedLine(applications)}`,
        timing: { kind: 'daily', daily: args.daily }, target: { kind: 'session', sessionId: agent.session.id },
      }, agent.session.id, exec.signal)
      try {
        const baseline = await watches.start(record.id, reads, resolveOptions(args, watches.chats.available()))
        return { id: record.id, title: record.title, prompt: record.prompt, daily: args.daily, applications: baseline }
      } catch (error: unknown) {
        // A task without its watch row would deliver the stored instruction every day.
        await ctx.schedule.edit({ id: record.id, action: 'delete' }, agent.session.id)
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

/**
 * The two options as stored: an omitted option is on, so a routine looks like work arriving; an omitted
 * `new_chat_per_run` is off where this app cannot open chats.
 * @param args - the tool arguments.
 * @param canOpenChats - whether this app can open a chat for a run.
 * @returns the options.
 */
export function resolveOptions(
  args: { new_chat_per_run?: boolean; needs_review?: boolean }, canOpenChats: boolean,
): WatchOptions {
  return { newChat: args.new_chat_per_run ?? canOpenChats, needsReview: args.needs_review ?? true }
}

function internalError(): RegisterWatchError {
  return { code: 'internal_error', message: 'The register watch could not be created.' }
}

function renderValue(_args: unknown, value: unknown): ContentBlock[] {
  return [{ type: 'text', text: JSON.stringify(value) }]
}
