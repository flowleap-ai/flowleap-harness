import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Service, type Context } from '@deepseek-ai/cordis'
import {
  entriesFromOdp, entriesFromOps, type RegisterApplication, type RegisterEntry, type RegisterSource,
} from '@deepseek-ai/dsh-flowleap-connectors'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { ScheduleRecord } from '@deepseek-ai/dsh-schedule'
import type { RegisterEventsResponse } from '@flowleap/connectors'
import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import type { KvUnit, KvUnitDescriptor, StorageBackend } from '@deepseek-ai/dsh-storage'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import { agentFor, harness, type HarnessAgent } from '../../../schedule/schedule/tests/harness.ts'
import * as Routines from '../src/index.ts'

const fixtures = new URL('../../flowleap-connectors/tests/fixtures/register/', import.meta.url)
const EP_EVENTS = entriesFromOps((JSON.parse(readFileSync(new URL('ep3456789a1-events.json', fixtures), 'utf8')) as RegisterEventsResponse).events)
const US_EVENTS = entriesFromOdp(JSON.parse(readFileSync(new URL('us17123456-transactions.json', fixtures), 'utf8')))

/** The register as the recorded responses show it, with the newest EP event not yet listed. */
class RecordedRegister extends Service implements RegisterSource {
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

const contexts: Context[] = []
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-02T00:00:00Z')) })
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  vi.useRealTimers()
})

/**
 * Memory backend whose `flowleap_routines` writes pass through hooks, so a case can reject one.
 * @param pool - media the backend serves.
 * @param traps - hook per primitive.
 * @returns the backend for `harness`.
 */
function gatedBackend(pool: MemoryMediaPool, traps: {
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

async function host(pool: MemoryMediaPool, backend?: StorageBackend) {
  const test = await harness(backend === undefined ? { pool } : { pool, backend })
  contexts.push(test.ctx)
  const agent: HarnessAgent = agentFor(test.ctx)
  test.resolve.mockResolvedValue({ agent })
  await test.ctx.plugin(RecordedRegister)
  const register = test.ctx.get('flowleapRegister')
  if (!(register instanceof RecordedRegister)) throw new Error('recorded register not mounted')
  const routines = await test.ctx.plugin(Routines, { minReadIntervalHours: 12, maxApplications: 2 })
  return { ...test, agent, register, routines }
}

async function createWatch(test: Awaited<ReturnType<typeof host>>, applications: string[], options: {
  agent?: HarnessAgent | null
  timeZone?: string
} = {}) {
  const agent = options.agent === null ? undefined : options.agent ?? test.agent
  return executeToolFixture(test.ctx, {
    callId: ToolCallId('watch-call'), signal: new AbortController().signal, name: 'register_watch_create',
    ...(agent === undefined ? {} : { agent }),
    arguments: {
      applications, title: 'Office actions', prompt: 'When a new office action arrives, prepare the analysis.',
      daily: { time: '07:00:00', time_zone: options.timeZone ?? 'UTC' },
    },
  })
}

function sentText(agent: HarnessAgent, call: number): string {
  return agent.followup.mock.calls[call]![0].content.map(block => block.type === 'text' ? block.text : '').join('')
}

const DAY = 86_400_000

describe('register watch', () => {
  it('creates one daily task that names the applications and counts the current events as seen', async () => {
    const test = await host(new MemoryMediaPool())
    const created = await createWatch(test, ['EP 3 456 789', 'US 17/123,456'])
    expect(created.isError).toBe(false)
    expect(created.value).toMatchObject({
      title: 'Office actions', scheduledAt: '2026-11-02T07:00:00.000Z',
      applications: [{ application: 'EP3456789', entries: 4 }, { application: 'US17123456', entries: 49 }],
    })
    const [entry] = await test.ctx.schedule.catalog()
    expect(entry?.prompt).toBe('When a new office action arrives, prepare the analysis.\n\nWatched applications: EP3456789, US17123456')
    expect(test.register.read).toHaveBeenCalledTimes(2)
  })

  it('refuses invalid requests without creating a task', async () => {
    const test = await host(new MemoryMediaPool())
    expect((await createWatch(test, ['WO 2020/123456'])).value).toMatchObject({ code: 'invalid_application' })
    expect((await createWatch(test, [])).value).toEqual({ code: 'invalid_application', message: 'Name at least one application.' })
    expect((await createWatch(test, ['EP3456789', 'US17123456', 'EP1234567'])).value)
      .toEqual({ code: 'invalid_application', message: 'Name at most 2 applications in one watch.' })
    expect((await createWatch(test, ['EP3456789'], { agent: null })).value).toMatchObject({ code: 'internal_error' })
    const child = agentFor(test.ctx, 'delegated-child', { delegationDepth: 1 })
    expect((await createWatch(test, ['EP3456789'], { agent: child })).value).toMatchObject({ code: 'subagent_session' })
    const zone = await createWatch(test, ['EP3456789'], { timeZone: 'Mars/Olympus' })
    expect(zone.isError).toBe(true)
    test.register.state.delete('US17123456')
    const unread = await createWatch(test, ['US 17/123,456'])
    expect(unread.isError).toBe(true)
    expect(JSON.stringify(unread.content)).toContain('no register entry for US17123456')
    expect(await test.ctx.schedule.catalog()).toEqual([])
    expect(test.ctx.tools.get('register_watch_create', test.agent)?.presentCall?.({
      applications: ['EP3456789'], title: 'T', prompt: 'P', daily: { time: '07:00:00', time_zone: 'UTC' },
    })).toEqual({ card: 'generic', title: 'Watch registers', kind: 'other', rawInput: ['EP3456789'] })
  })

  it('deletes the task when its watch row cannot be saved', async () => {
    const pool = new MemoryMediaPool()
    const test = await host(pool, gatedBackend(pool, {
      putRecord: table => table === 'watches' ? Promise.reject(new Error('disk full')) : undefined,
    }))
    const created = await createWatch(test, ['EP 3 456 789'])
    expect(created.isError).toBe(true)
    expect(await test.ctx.schedule.catalog()).toEqual([])
  })

  it('passes other tasks to the next admission listener unchanged', async () => {
    const test = await host(new MemoryMediaPool())
    await test.ctx.schedule.create(test.agent.session.id, { title: 'Plain', prompt: 'Plain reminder', after_seconds: 60 })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(sentText(test.agent, 0)).toContain(JSON.stringify('Plain reminder'))
  })

  it('skips a run whose only read failed, and logs the failure', async () => {
    const test = await host(new MemoryMediaPool())
    const warn = vi.spyOn(test.ctx.logger, 'warn').mockImplementation(() => {})
    try {
      await createWatch(test, ['EP 3 456 789'])
      test.register.offline.add('EP3456789')
      await vi.advanceTimersByTimeAsync(2 * DAY)
      expect(test.agent.followup).not.toHaveBeenCalled()
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('EP3456789 not read: register offline'))
    } finally { warn.mockRestore() }
  })

  it('logs a delivered run whose seen events cannot be saved, and reports them again', async () => {
    const pool = new MemoryMediaPool()
    let failWatches = false
    const test = await host(pool, gatedBackend(pool, {
      putRecord: table => failWatches && table === 'watches' ? Promise.reject(new Error('disk full')) : undefined,
    }))
    const warn = vi.spyOn(test.ctx.logger, 'warn').mockImplementation(() => {})
    try {
      await createWatch(test, ['EP 3 456 789'])
      failWatches = true
      test.register.state.set('EP3456789', EP_EVENTS)
      await vi.advanceTimersByTimeAsync(3 * DAY)
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('seen events not saved'))
      expect(test.agent.followup).toHaveBeenCalledTimes(2)
    } finally { warn.mockRestore() }
  })

  it('logs a prune that cannot remove a watch', async () => {
    const pool = new MemoryMediaPool()
    const test = await host(pool, gatedBackend(pool, {
      deleteRecords: table => table === 'watches' ? Promise.reject(new Error('disk full')) : undefined,
    }))
    const warn = vi.spyOn(test.ctx.logger, 'warn').mockImplementation(() => {})
    try {
      await createWatch(test, ['EP 3 456 789'])
      const [entry] = await test.ctx.schedule.catalog()
      await test.ctx.schedule.delete({ sessionId: test.agent.session.id, id: entry!.id })
      await vi.advanceTimersByTimeAsync(0)
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('prune failed'))
    } finally { warn.mockRestore() }
  })

  it('refuses to open a domain with a row that is not a normalized application', async () => {
    const pool = new MemoryMediaPool()
    const loose = defineDomain({
      name: 'flowleap_routines', version: 1,
      tables: { watches: domainTable<string, unknown>(z.unknown()), reads: domainTable<string, unknown>(z.unknown()) },
    })
    const writer = await harness({ pool })
    contexts.push(writer.ctx)
    const domain = await writer.ctx.storageDomain.open(loose)
    await domain.table('watches').put('schedule-1', { applications: [{ application: 'EP 3 456 789', seen: {} }] })
    await domain.close()
    await expect(writer.ctx.storageDomain.open(Routines.routinesDomain)).rejects.toThrow()
  })

  it('starts no run and restores no Session on a day without a new event', async () => {
    const test = await host(new MemoryMediaPool())
    await createWatch(test, ['EP 3 456 789', 'US 17/123,456'])
    await vi.advanceTimersByTimeAsync(DAY)
    expect(test.agent.followup).not.toHaveBeenCalled()
    expect(test.resolve).not.toHaveBeenCalled()
    const [entry] = await test.ctx.schedule.catalog()
    expect(entry).toMatchObject({ status: 'active', scheduledAt: '2026-11-03T07:00:00.000Z' })
    expect(entry?.lastDelivery).toBeUndefined()
  })

  it('reads each application at most once in the minimum interval', async () => {
    const test = await host(new MemoryMediaPool())
    await createWatch(test, ['EP 3 456 789'])
    // The first run, seven hours after the baseline read, uses the saved read.
    await vi.advanceTimersByTimeAsync(7 * 3_600_000)
    expect(test.register.read).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(DAY)
    expect(test.register.read).toHaveBeenCalledTimes(2)
  })

  it('starts one run with the new events, and never reports an event twice, also after a restart', async () => {
    const pool = new MemoryMediaPool()
    const first = await host(pool)
    await createWatch(first, ['EP 3 456 789', 'US 17/123,456'])
    await vi.advanceTimersByTimeAsync(DAY)
    first.register.state.set('EP3456789', EP_EVENTS)
    await vi.advanceTimersByTimeAsync(DAY)
    expect(first.agent.followup).toHaveBeenCalledOnce()
    const text = sentText(first.agent, 0)
    expect(text).toContain('[SCHEDULE REMINDER BATCH]')
    expect(text).toContain(JSON.stringify([
      'When a new office action arrives, prepare the analysis.', '', 'Watched applications: EP3456789, US17123456', '',
      'New register events:', '- 2020-12-18 EP3456789 [7] No opposition filed within time limit',
    ].join('\n')).slice(1, -1))
    expect(text).not.toContain('US17123456 [')
    const [entry] = await first.ctx.schedule.catalog()
    expect(entry?.prompt).toBe('When a new office action arrives, prepare the analysis.\n\nWatched applications: EP3456789, US17123456')
    await vi.advanceTimersByTimeAsync(DAY)
    expect(first.agent.followup).toHaveBeenCalledOnce()

    const state = first.register.state
    await first.ctx.fiber.dispose()
    contexts.splice(contexts.indexOf(first.ctx), 1)
    const second = await host(pool)
    for (const [application, entries] of state) second.register.state.set(application, entries)
    await vi.advanceTimersByTimeAsync(DAY)
    expect(second.agent.followup).not.toHaveBeenCalled()
    second.register.state.set('US17123456', [
      { date: '2026-11-05', code: 'CTNF', description: 'Non-Final Rejection' }, ...US_EVENTS,
    ])
    await vi.advanceTimersByTimeAsync(DAY)
    expect(second.agent.followup).toHaveBeenCalledOnce()
    expect(sentText(second.agent, 0)).toContain('- 2026-11-05 US17123456 [CTNF] Non-Final Rejection')
    expect(sentText(second.agent, 0)).not.toContain('EP3456789 [7]')
  })

  it('names a failed read beside the new events of another application', async () => {
    const test = await host(new MemoryMediaPool())
    await createWatch(test, ['EP 3 456 789', 'US 17/123,456'])
    test.register.state.set('EP3456789', EP_EVENTS)
    test.register.state.delete('US17123456')
    await vi.advanceTimersByTimeAsync(2 * DAY)
    expect(sentText(test.agent, 0)).toContain('Register reads that failed at this run:\\n- US17123456: no register entry for US17123456')
  })

  it('removes the watch when the task is deleted, and the reads no other watch names', async () => {
    const pool = new MemoryMediaPool()
    const test = await host(pool)
    const kept = await createWatch(test, ['EP 3 456 789'])
    const removed = await createWatch(test, ['EP 3 456 789', 'US 17/123,456'])
    const id = (removed.value as { id: ScheduleRecord['id'] }).id
    await test.ctx.schedule.delete({ sessionId: test.agent.session.id, id })
    await vi.advanceTimersByTimeAsync(0)
    await test.ctx.fiber.dispose()
    contexts.splice(contexts.indexOf(test.ctx), 1)
    const reopened = await harness({ pool })
    contexts.push(reopened.ctx)
    const domain = await reopened.ctx.storageDomain.open(Routines.routinesDomain)
    expect([...domain.table('watches').keys()]).toEqual([(kept.value as { id: string }).id])
    expect([...domain.table('reads').keys()]).toEqual(['EP3456789'])
    await domain.close()
  })

  it('removes the tool and the listeners when the plugin unloads', async () => {
    const test = await host(new MemoryMediaPool())
    await createWatch(test, ['EP 3 456 789'])
    test.register.state.set('EP3456789', EP_EVENTS)
    expect(test.ctx.tools.get('register_watch_create', test.agent)).toBeDefined()
    await test.routines.dispose()
    expect(test.ctx.tools.get('register_watch_create', test.agent)).toBeUndefined()
    await vi.advanceTimersByTimeAsync(2 * DAY)
    expect(sentText(test.agent, 0)).not.toContain('New register events')
  })
})
