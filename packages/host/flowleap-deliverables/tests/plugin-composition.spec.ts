/**
 * The plugin row with its optional services composed: the ledger storage (opened, failed, closed
 * on dispose), the judge on `llm` (with a configured route and with the Session's route), the gate
 * cards on `userQuestions`, the removal confirmation on `approval` with each policy source, the
 * gate commands on `commands`, the Session disposal, and the all-or-nothing tool registration.
 * Each optional service is a small fake provided on the context before the plugin mounts.
 */

import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { provideWorkingDirectoryFixture, unsupportedInbox, unsupportedModel } from '@deepseek-ai/dsh-agent-loop-testkit'
import type { CommandDefinition } from '@deepseek-ai/dsh-commands'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { type ToolDefinition } from '@deepseek-ai/dsh-tools'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { executeModelToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import type {} from '@deepseek-ai/dsh-tool-present/types'
import type { AskUserQuestionRequest } from '@deepseek-ai/dsh-user-questions'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Deliverables from '../src/index.ts'
import { claims, featureList } from './drafting-matter-fixtures.ts'
import { textOf } from './gates-test-bench.ts'

const dirs: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
})

/** The optional services the row picks up, as fakes the test inspects. */
interface Services {
  readonly storageDomain?: { open: () => Promise<{ table: (name: string) => { get: () => undefined; entries: () => never[]; put: () => Promise<void> }; close: () => Promise<void> }> }
  readonly llm?: object
  readonly userQuestions?: { ask: (request: AskUserQuestionRequest) => Promise<unknown> }
  readonly approval?: { request: () => Promise<string>; overrideOf: () => string | undefined; config: { policy?: string } }
  readonly commands?: { register: (definition: CommandDefinition) => () => void }
}

async function mount(services: Services, config: Partial<Deliverables.Config> = {}) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'dsh-plugin-')))
  dirs.push(dir)
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(NativeToolExecutor)
  await ctx.plugin(LocalFileSystem, { cwd: dir })
  await ctx.plugin(SessionStore)
  provideWorkingDirectoryFixture(ctx, dir)
  const logged: string[] = []
  ctx.logger.exporter({ levels: { default: 3 }, export(message) {
    if (message.type === 'warn' || message.type === 'info') logged.push(`${message.type}: ${message.args.map(String).join(' ')}`)
  } })
  const withdraw = new Map(Object.entries(services).map(([name, value]) => [name, ctx.provide(name, value)]))
  const plugin = ctx.plugin(Deliverables, { secondRead: 'off', secondReadModel: '', ...config })
  await plugin
  const session = ctx.sessions.prepare(SessionId(`plugin-${String(dirs.length)}`), { meta: { cwd: dir } })
  const detach = ctx.sessions.enter(session)
  ctx.sessions.announce(session)
  const agent: Agent = {
    id: session.id, options: {}, session, model: unsupportedModel(), inbox: unsupportedInbox(), status: 'idle', ctx,
    send: () => {}, followup: () => {}, steer: () => {}, inject: () => {}, cancel() {},
    runMaintenance: task => task(new AbortController().signal), whenIdle: () => Promise.resolve(),
  }
  let calls = 0
  const call = async (name: string, args: unknown) => textOf((await executeModelToolFixture(ctx, {
    callId: ToolCallId(`plugin-call-${String(++calls)}`), name, arguments: args, signal: new AbortController().signal, agent,
  })).content[0])
  const { mkdir, writeFile } = await import('node:fs/promises')
  const write = async (path: string, text: string) => {
    await mkdir(join(dir, path, '..'), { recursive: true })
    await writeFile(join(dir, path), text)
  }
  return { ctx, dir, plugin, session, detach, agent, call, write, logged, withdraw }
}

describe('the plugin row with its optional services', () => {
  it('opens the ledger and work page storage, closes both on dispose, and keeps the records in memory when storage fails', async () => {
    const closed: string[] = []
    const tables: string[] = []
    const domain = {
      table: (name: string) => { tables.push(name); return { get: () => undefined, entries: () => [], put: () => Promise.resolve() } },
      close: () => { closed.push('closed'); return Promise.resolve() },
    }
    const stored = await mount({ storageDomain: { open: () => Promise.resolve(domain) } })
    await stored.plugin.dispose()
    // A domain that opens after the dispose is closed and never used.
    const opening = Promise.withResolvers<typeof domain>()
    const late = await mount({ storageDomain: { open: () => opening.promise } })
    await late.plugin.dispose()
    opening.resolve(domain)
    // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- a failure that is not an Error is one of the cases under test
    const failedString = await mount({ storageDomain: { open: () => Promise.reject('no backend') } })
    const failedError = await mount({ storageDomain: { open: () => Promise.reject(new Error('disk full')) } })
    await failedString.plugin.dispose()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect({
      closed,
      tables,
      warned: [...failedString.logged, ...failedError.logged].filter(line => line.includes('storage unavailable')),
    }).toEqual({
      closed: ['closed', 'closed', 'closed', 'closed'],
      tables: ['sessions', 'pages'],
      warned: [
        'warn: flowleap-deliverables: ledger storage unavailable, the records stay in memory: no backend',
        'warn: flowleap-deliverables: work page index storage unavailable, the records stay in memory: no backend',
        'warn: flowleap-deliverables: ledger storage unavailable, the records stay in memory: disk full',
        'warn: flowleap-deliverables: work page index storage unavailable, the records stay in memory: disk full',
      ],
    })
  })

  it('builds the judge on the model service, warning about a configured route without a provider', async () => {
    const configured = await mount({ llm: {} }, { secondReadModel: 'no-slash' })
    const session = await mount({ llm: {} })
    await configured.plugin.dispose()
    expect({
      configured: configured.logged.filter(line => line.includes('secondReadModel')),
      session: session.logged.filter(line => line.includes('secondReadModel')),
    }).toEqual({
      configured: ['warn: flowleap-deliverables: secondReadModel "no-slash" is not "provider/model"; judging with the session\'s route.'],
      session: [],
    })
  })

  it('asks the gate card through the user-questions service and logs the gate commands', async () => {
    const asked: string[] = []
    const registered = new Map<string, CommandDefinition>()
    const row = await mount({
      userQuestions: { ask: (request) => { asked.push(request.questions[0]?.id ?? ''); return Promise.resolve({ answers: [] }) } },
      commands: { register: (definition) => { registered.set(definition.name, definition); return () => { registered.delete(definition.name) } } },
    })
    await row.write('drafting/hinge/feature-list.md', featureList('false'))
    await row.write('drafting/hinge/claims.md', claims('false'))
    await row.call('start_application_draft', { matter: 'hinge' })
    const command = await registered.get('confirm-features')?.handler({
      commandId: 'cmd-1' as never, agent: row.agent, rawInput: ' hinge', attachments: [], signal: new AbortController().signal,
    })
    const names = [...registered.keys()]
    await row.plugin.dispose()
    expect({
      asked,
      command: command?.kind,
      names,
      afterDispose: registered.size,
      info: row.logged.filter(line => line.includes('by the attorney (command /confirm-features)')).length,
    }).toEqual({ asked: ['confirm-feature-list'], command: 'success', names: ['confirm-features', 'approve-claims', 'waive'], afterDispose: 0, info: 1 })
  })

  it('reads the approval policy from the Session override, then the configured policy, then "ask"', async () => {
    const policies: (string | undefined)[][] = [[undefined, undefined], [undefined, 'never'], ['ask', 'never']]
    const outcomes: string[] = []
    for (const [override, policy] of policies) {
      const requested: string[] = []
      const row = await mount({
        approval: {
          request: () => { requested.push('approval'); return Promise.resolve('rejected') },
          overrideOf: () => override,
          config: policy === undefined ? {} : { policy },
        },
      })
      await row.write('drafting/hinge/claims.md', claims('false'))
      const result = await row.call('remove_claim', { matter: 'hinge', claim: 2 })
      outcomes.push(`${requested.length ? 'asked' : 'skipped'}: ${result.split('. ')[1] ?? ''}`)
    }
    // Without the approval service the removal falls back to the card, and without a card it has no channel.
    const row = await mount({ approval: { request: () => Promise.resolve('rejected'), overrideOf: () => undefined, config: {} } })
    await row.write('drafting/hinge/claims.md', claims('false'))
    row.withdraw.get('approval')?.()
    outcomes.push((await row.call('remove_claim', { matter: 'hinge', claim: 2 })).split('. ')[1] ?? '')
    const bare = await mount({})
    await bare.write('drafting/hinge/claims.md', claims('false'))
    outcomes.push((await bare.call('remove_claim', { matter: 'hinge', claim: 2 })).split('. ')[1] ?? '')
    expect(outcomes).toEqual([
      'asked: The attorney did not confirm the removal',
      'skipped: The confirmation did not arrive (no-answerer)',
      'asked: The attorney did not confirm the removal',
      'No confirmation channel is available in this session (no approval answerer and no question card)',
      'No confirmation channel is available in this session (no approval answerer and no question card)',
    ])
  })

  it('logs the recording mode once per mode, forgets a disposed Session and logs a drafting tool failure as a warning', async () => {
    const row = await mount({})
    row.ctx.tools.register({
      name: 'get_description',
      description: 'fake',
      parameters: { type: 'object', properties: {} },
      output: { schema: {}, render: () => [{ type: 'text', text: 'description' }] },
      execute: () => Promise.resolve({ documentReference: { publicationNumber: 'EP1', section: 'description' }, description: 'Text.' }),
    })
    await row.call('get_description', {})
    await row.call('get_description', {})
    await row.write('drafting/hinge/claims.md', claims('false'))
    vi.spyOn(row.ctx.fs, 'readText').mockRejectedValueOnce(new Error('disk failure'))
    const failed = await row.call('remove_claim', { matter: 'hinge', claim: 2 })
    row.detach()
    expect({
      failed,
      modes: row.logged.filter(line => line.includes('evidence ledger recording')),
      warned: row.logged.filter(line => line.startsWith('warn: flowleap-deliverables: remove_claim failed')),
    }).toEqual({
      failed: 'Claim 2 was not removed. disk failure',
      modes: ['info: flowleap-deliverables: evidence ledger recording in derived mode (first result from get_description)'],
      warned: ['warn: flowleap-deliverables: remove_claim failed: disk failure'],
    })
  })
})

describe('the tool registration', () => {
  /** A minimal tool definition. */
  const tool = (name: string): ToolDefinition => ({
    name,
    description: name,
    parameters: { type: 'object', properties: {} },
    output: { schema: {}, render: () => [{ type: 'text', text: name }] },
    execute: () => Promise.resolve(name),
  })

  it('registers all or nothing, and the disposer unregisters every tool', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    ctx.tools.register(tool('taken'))
    expect(() => Deliverables.registerDeliverableTools(ctx, [tool('first'), tool('taken')])).toThrow()
    const afterConflict = ctx.tools.schemas().map(schema => schema.name)
    const dispose = Deliverables.registerDeliverableTools(ctx, [tool('first'), tool('second')])
    const registered = ctx.tools.schemas().map(schema => schema.name)
    dispose()
    dispose()
    expect({ afterConflict, registered, disposed: ctx.tools.schemas().map(schema => schema.name) }).toEqual({
      afterConflict: ['taken'],
      registered: ['taken', 'first', 'second'],
      disposed: ['taken'],
    })
  })
})
