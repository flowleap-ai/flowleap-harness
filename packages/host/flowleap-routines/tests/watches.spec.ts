import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import { ScheduleId, type ScheduleCatalogEntry } from '@deepseek-ai/dsh-schedule'
import { parseRegisterApplication, type RegisterApplication } from '@deepseek-ai/dsh-flowleap-connectors'
import { MemoryMediaPool } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import * as Routines from '../src/index.ts'
import { createWatch, disposeContexts, EP_EVENTS, host, US_EVENTS } from './helpers.ts'

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-02T00:00:00Z')) })
afterEach(async () => {
  await disposeContexts()
  vi.useRealTimers()
})

function task(id: string, status: 'active' | 'ended'): ScheduleCatalogEntry {
  return {
    id: ScheduleId(id), kind: 'daily', title: `Watch ${id}`, prompt: 'p', time: '07:00:00.000', timeZone: 'UTC',
    scheduledAt: '2026-11-03T07:00:00.000Z', target: { kind: 'session', sessionId: SessionId('chat') },
    involvedSessionIds: [SessionId('chat')], status,
  }
}

const application = (text: string): RegisterApplication => parseRegisterApplication(text)!

const read = (entries: Routines.ReadRecord['entries']): Routines.ReadRecord => ({ readAt: '2026-11-01T07:00:00.000Z', entries })

describe('watch views', () => {
  it('lists each watch of an existing task in catalog order with the newest event of each saved read', () => {
    const watches = new Map<Routines.TaskId, Routines.WatchRecord>([
      [ScheduleId('b'), { applications: [{ application: application('EP3456789'), seen: {} }, { application: application('US17123456'), seen: {} }], newChat: true, needsReview: true }],
      [ScheduleId('a'), { applications: [{ application: application('EP1000000'), seen: {} }], newChat: false, needsReview: false }],
      [ScheduleId('gone'), { applications: [{ application: application('EP2000000'), seen: {} }], newChat: false, needsReview: false }],
    ])
    const reads = new Map<RegisterApplication, Routines.ReadRecord>([
      [application('EP3456789'), read([
        { date: '2026-10-01', code: 'A', description: 'First' },
        { date: '2026-10-09', code: 'B', description: 'Newest' },
        { date: '2026-10-09', code: 'C', description: 'Newest, listed last' },
        { date: '2026-09-30', code: 'D', description: 'Older' },
      ])],
      [application('EP1000000'), read([])],
    ])
    expect(Routines.watchViews([task('a', 'ended'), task('reminder', 'active'), task('b', 'active')], { watches, reads })).toEqual([
      { taskId: 'a', sessionId: 'chat', title: 'Watch a', applications: [{ application: 'EP1000000', readAt: '2026-11-01T07:00:00.000Z' }] },
      {
        taskId: 'b', sessionId: 'chat', title: 'Watch b', nextCheckAt: '2026-11-03T07:00:00.000Z',
        applications: [
          { application: 'EP3456789', readAt: '2026-11-01T07:00:00.000Z', latest: { date: '2026-10-09', code: 'C', description: 'Newest, listed last' } },
          { application: 'US17123456' },
        ],
      },
    ])
  })
})

describe('the watches Remote', () => {
  it('lists the watches with their baseline reads, without the chats remote access denies', async () => {
    const test = await host(new MemoryMediaPool(), { chats: true })
    const created = await createWatch(test, ['EP 3 456 789', 'US 17/123,456'])
    expect(created.isError).toBe(false)
    const id = (created.value as { id: string }).id
    const [watch] = await test.ctx.flowleapRoutines.watches()
    expect(watch).toMatchObject({ taskId: id, sessionId: test.agent.id, title: 'Office actions' })
    expect(Date.parse(watch!.nextCheckAt!)).toBeGreaterThan(Date.now())
    const newest = (entries: typeof EP_EVENTS) => entries.reduce((latest, entry) => entry.date >= latest.date ? entry : latest)
    expect(watch!.applications).toEqual([
      { application: 'EP3456789', readAt: '2026-11-02T00:00:00.000Z', latest: newest(EP_EVENTS.slice(1)) },
      { application: 'US17123456', readAt: '2026-11-02T00:00:00.000Z', latest: newest(US_EVENTS) },
    ])
    test.chats!.allows.mockReturnValueOnce(false)
    expect(await test.ctx.flowleapRoutines.watches()).toEqual([])
    expect(test.chats!.allows).toHaveBeenCalledWith({ kind: 'session', id: test.agent.id })
  })

  it('tells clients to read again after a watch is saved and after a prune removes it', async () => {
    const test = await host(new MemoryMediaPool(), { chats: true })
    const changed = vi.fn()
    test.ctx.on('flowleap-routines/changed', changed)
    const created = await createWatch(test, ['EP 3 456 789'])
    expect(changed).toHaveBeenCalledOnce()
    expect(await test.ctx.flowleapRoutines.watches()).toHaveLength(1)
    await test.ctx.schedule.edit({ id: (created.value as { id: ScheduleCatalogEntry['id'] }).id, action: 'delete' }, test.agent.session.id)
    await vi.advanceTimersByTimeAsync(0)
    expect(changed).toHaveBeenCalledTimes(2)
    expect(await test.ctx.flowleapRoutines.watches()).toEqual([])
  })
})
