/** Shared fixture of the routines specs: the recorded register, the Schedule harness, and the watch tool call. */
import { readFileSync } from 'node:fs'
import { vi } from 'vitest'
import { Service, type Context } from '@deepseek-ai/cordis'
import type { AgentStatus } from '@deepseek-ai/dsh-agent'
import type { SessionController } from '@deepseek-ai/dsh-api-session-controller'
import {
  entriesFromOdp, entriesFromOps, type RegisterApplication, type RegisterEntry, type RegisterSource,
} from '@deepseek-ai/dsh-flowleap-connectors'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { RegisterEventsResponse } from '@flowleap/connectors'
import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import type { KvUnit, KvUnitDescriptor, StorageBackend } from '@deepseek-ai/dsh-storage'
import { WorkspaceId, type Workspace } from '@deepseek-ai/dsh-workspace'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import { agentFor, harness, type HarnessAgent } from '../../../schedule/schedule/tests/harness.ts'
import * as Routines from '../src/index.ts'

const fixtures = new URL('../../flowleap-connectors/tests/fixtures/register/', import.meta.url)
/** The recorded EP 3 456 789 events, newest first. */
export const EP_EVENTS = entriesFromOps((JSON.parse(readFileSync(new URL('ep3456789a1-events.json', fixtures), 'utf8')) as RegisterEventsResponse).events)
/** The recorded US 17/123,456 transactions. */
export const US_EVENTS = entriesFromOdp(JSON.parse(readFileSync(new URL('us17123456-transactions.json', fixtures), 'utf8')))

/** One day in milliseconds. */
export const DAY = 86_400_000

/** Every Context `host` mounted; a spec disposes them after each case. */
export const contexts: Context[] = []

/** Dispose every mounted Context. */
export async function disposeContexts(): Promise<void> {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
}

/** The register as the recorded responses show it, with the newest EP event not yet listed. */
export class RecordedRegister extends Service implements RegisterSource {
  readonly state = new Map<string, RegisterEntry[]>([
    ['EP3456789', EP_EVENTS.slice(1)],
    ['US17123456', US_EVENTS],
  ])
  readonly offline = new Set<string>()
  readonly read = vi.fn(async (application: RegisterApplication): Promise<readonly RegisterEntry[]> => {
    // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- A foreign reader can reject with a non-Error value.
    if (this.offline.has(application)) return Promise.reject('register offline')
    const entries = this.state.get(application)
    if (entries === undefined) throw new Error(`no register entry for ${application}`)
    return entries
  })

  constructor(ctx: Context) {
    super(ctx, 'flowleapRegister')
  }
}

/**
 * Memory backend whose `flowleap_routines` writes pass through hooks, so a case can reject one.
 * @param pool - media the backend serves.
 * @param traps - hook per primitive.
 * @returns the backend for `harness`.
 */
export function gatedBackend(pool: MemoryMediaPool, traps: {
  putRecord?: (table: string) => Promise<void> | undefined
  deleteRecords?: (table: string) => Promise<void> | undefined
}): StorageBackend {
  const memory = new MemoryStorageBackend(pool)
  return {
    close: () => memory.close(),
    kv: {
      open: async (descriptor: KvUnitDescriptor): Promise<KvUnit> => {
        const unit = await memory.kv.open(descriptor)
        if (descriptor.name !== 'flowleap_routines') return unit
        return {
          loadAll: () => unit.loadAll(),
          putRecord: async (table, key, value) => {
            await traps.putRecord?.(table)
            await unit.putRecord(table, key, value)
          },
          deleteRecord: (table, key) => unit.deleteRecord(table, key),
          deleteRecords: async (table, keys) => {
            await traps.deleteRecords?.(table)
            await unit.deleteRecords(table, keys)
          },
          setGlobal: value => unit.setGlobal(value),
          close: () => unit.close(),
        }
      },
    },
  }
}

/** The Web services a `newChat` run needs, faked: one workspace holding the original chat, and a controller that opens chats. */
export interface ChatHost {
  /** Chats the controller opened, in order; each has a live Agent the resolver returns. */
  readonly opened: HarnessAgent[]
  readonly create: ReturnType<typeof vi.fn<SessionController['create']>>
  readonly rename: ReturnType<typeof vi.fn<SessionController['rename']>>
  /** The remote access decision per Session resource; true by default. */
  readonly allows: ReturnType<typeof vi.fn<(resource: { kind: string; id: string }) => boolean>>
  /** Whether the original chat is in the workspace; false makes the opener fall back to the chat's directory. */
  inWorkspace: boolean
  /** The Agent status every chat opened from now on reports; `idle` by default. */
  nextStatus: AgentStatus
}

/**
 * Mount the Schedule harness, the recorded register, and the routines plugin.
 * @param pool - media of the storage backend, shared across restarts.
 * @param options - a gated backend, and `chats` to fake the Session controller, the workspace registry, and remote access.
 * @returns the harness, the original Agent, the register, the plugin fiber, and the fake chat host when asked for.
 */
export async function host(pool: MemoryMediaPool, options: { backend?: StorageBackend; chats?: true } = {}) {
  const test = await harness({
    pool, ...(options.backend === undefined ? {} : { backend: options.backend }),
    ...(options.chats === undefined ? {} : { sessionController: false }),
  })
  contexts.push(test.ctx)
  const agent: HarnessAgent = agentFor(test.ctx)
  const agents = new Map<string, HarnessAgent>([[agent.id, agent]])
  test.resolve.mockImplementation(async (sessionId) => {
    const found = agents.get(sessionId)
    if (found === undefined) throw new Error(`no agent for ${sessionId}`)
    return { agent: found }
  })
  let chats: ChatHost | undefined
  if (options.chats !== undefined) {
    const opened: HarnessAgent[] = []
    const create = vi.fn<SessionController['create']>(async () => {
      const created: HarnessAgent = { ...agentFor(test.ctx, `review-${String(opened.length + 1)}`), status: chats!.nextStatus }
      opened.push(created)
      agents.set(created.id, created)
      // Registered, so the plugin reads the chat's Agent status.
      await test.ctx.agents.register(created)
      return { sessionId: created.id }
    })
    const rename = vi.fn<SessionController['rename']>(async request => ({ title: request.title, seq: 1 }))
    const allows = vi.fn<(resource: { kind: string; id: string }) => boolean>(() => true)
    chats = { opened, create, rename, allows, inWorkspace: true, nextStatus: 'idle' }
    const controller: Pick<SessionController, 'resolveAgent' | 'create' | 'rename'> = { resolveAgent: test.resolve, create, rename }
    test.ctx.provide('sessionController', controller as never)
    const workspace: Pick<Workspace, 'id' | 'sessionIds'> = {
      id: WorkspaceId('firm'), get sessionIds() { return chats?.inWorkspace === true ? [SessionId('original')] : [] },
    }
    test.ctx.provide('workspaceRegistry', { list: () => [workspace], archivedSessionIds: [] } as never)
    test.ctx.provide('remoteAccess', { allows } as never)
  }
  await test.ctx.plugin(RecordedRegister)
  const register = test.ctx.get('flowleapRegister')
  if (!(register instanceof RecordedRegister)) throw new Error('recorded register not mounted')
  const routines = await test.ctx.plugin(Routines, {
    minReadIntervalHours: 12, maxApplications: 2, readDeadlineSeconds: 30, maxEventsPerRun: 50, maxEventTextLength: 300,
  })
  return { ...test, agent, register, routines, chats }
}

/**
 * Call `register_watch_create`.
 * @param test - the mounted host.
 * @param applications - application numbers as the model writes them.
 * @param options - the calling Agent (`null` for none), the time zone, and the two options when the call names them.
 * @returns the tool result.
 */
export async function createWatch(test: Awaited<ReturnType<typeof host>>, applications: string[], options: {
  agent?: HarnessAgent | null
  timeZone?: string
  newChat?: boolean
  needsReview?: boolean
} = {}) {
  const agent = options.agent === null ? undefined : options.agent ?? test.agent
  return executeToolFixture(test.ctx, {
    callId: ToolCallId('watch-call'), signal: new AbortController().signal, name: 'register_watch_create',
    ...(agent === undefined ? {} : { agent }),
    arguments: {
      applications, title: 'Office actions', prompt: 'When a new office action arrives, prepare the analysis.',
      daily: { time: '07:00:00', time_zone: options.timeZone ?? 'UTC' },
      ...(options.newChat === undefined ? {} : { new_chat_per_run: options.newChat }),
      ...(options.needsReview === undefined ? {} : { needs_review: options.needsReview }),
    },
  })
}

/**
 * The instruction a run received: the reminder prompt inside the Schedule batch framing.
 * @param agent - the Agent that received the run.
 * @param call - index of the follow-up.
 * @returns the reminder prompt.
 */
export function sentPrompt(agent: HarnessAgent, call: number): string {
  const text = sentText(agent, call)
  const reminders = JSON.parse(text.slice(text.indexOf('reminders_json: ') + 'reminders_json: '.length)) as { reminder_prompt: string }[]
  return reminders[0]!.reminder_prompt
}

/**
 * One JSON line of a run instruction, parsed.
 * @param prompt - the run instruction.
 * @param key - the line's key.
 * @returns the parsed value, or `undefined` without such a line.
 */
export function jsonLine(prompt: string, key: string): unknown {
  const line = prompt.split('\n').find(candidate => candidate.startsWith(`${key}: `))
  return line === undefined ? undefined : JSON.parse(line.slice(key.length + 2))
}

/**
 * The text of one follow-up message.
 * @param agent - the Agent that received it.
 * @param call - index of the follow-up.
 * @returns the joined text blocks.
 */
export function sentText(agent: HarnessAgent, call: number): string {
  return agent.followup.mock.calls[call]![0].content.map(block => block.type === 'text' ? block.text : '').join('')
}
