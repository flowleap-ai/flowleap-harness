import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { ScheduleCatalogEntry } from '@deepseek-ai/dsh-schedule'
import { MemoryMediaPool } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import * as Routines from '../src/index.ts'
import { createWatch, disposeContexts, EP_EVENTS, host, US_EVENTS } from './helpers.ts'

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-02T00:00:00Z')) })
afterEach(async () => {
  await disposeContexts()
  vi.useRealTimers()
})

function task(id: string, status: 'active' | 'inactive'): ScheduleCatalogEntry {
  return {
    id, kind: 'daily', title: `Watch ${id}`, prompt: 'p', time: '07:00:00.000', timeZone: 'UTC',
    scheduledAt: '2026-11-03T07:00:00.000Z', sessionId: SessionId('chat'), status,
  } as ScheduleCatalogEntry
}

const read = (entries: Routines.ReadRecord['entries']): Routines.ReadRecord => ({ readAt: '2026-11-01T07:00:00.000Z', entries })

describe('watch views', () => {
  it('lists each watch of an existing task in catalog order with the newest event of each saved read', () => {
    const watches = new Map<string, Routines.WatchRecord>([
      ['b', { applications: [{ application: 'EP3456789' as never, seen: {} }, { application: 'US17123456' as never, seen: {} }], newChat: true, needsReview: true }],
      ['a', { applications: [{ application: 'EP1000000' as never, seen: {} }], newChat: false, needsReview: false }],
      ['gone', { applications: [{ application: 'EP2000000' as never, seen: {} }], newChat: false, needsReview: false }],
    ])
    const reads = new Map<string, Routines.ReadRecord>([
      ['EP3456789', read([
        { date: '2026-10-01', code: 'A', description: 'First' },
        { date: '2026-10-09', code: 'B', description: 'Newest' },
        { date: '2026-10-09', code: 'C', description: 'Newest, listed last' },
        { date: '2026-09-30', code: 'D', description: 'Older' },
      ])],
      ['EP1000000', read([])],
    ])
    expect(Routines.watchViews([task('a', 'inactive'), task('b', 'active')], { watches, reads })).toEqual([
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
})
