import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId, type Session } from '@deepseek-ai/dsh-session'
import { MemoryMediaPool } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import type { HarnessAgent } from '../../../schedule/schedule/tests/harness.ts'
import * as Routines from '../src/index.ts'
import type { RunChatHost } from '../src/index.ts'
import { agentFor, harness } from '../../../schedule/schedule/tests/harness.ts'
import { contexts, createWatch, DAY, disposeContexts, EP_EVENTS, gatedBackend, host, sentPrompt, sentText } from './helpers.ts'

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-02T00:00:00Z')) })
afterEach(async () => {
  await disposeContexts()
  vi.useRealTimers()
})

const application = 'EP3456789' as Routines.RegisterReport['application']
const TITLE = 'EP3456789: No opposition filed within time limit (2020-12-18)'

/** Append a message to a chat as its Session log records it. */
function answer(agent: HarnessAgent, source: { kind: 'user' } | { kind: 'schedule' }): void {
  agent.session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'Thanks' }], source }), { surfaceOp: 'append' })
}

/** Create a watch and run it once with the newest EP event: the first run uses the baseline read, the second one reads again. */
async function runOnce(test: Awaited<ReturnType<typeof host>>, options: Parameters<typeof createWatch>[2] = {}) {
  const created = await createWatch(test, ['EP 3 456 789'], options)
  expect(created.isError).toBe(false)
  test.register.state.set('EP3456789', EP_EVENTS)
  await vi.advanceTimersByTimeAsync(2 * DAY)
  return (created.value as { id: string }).id
}

describe('run chat title', () => {
  it('names the application, the first event, and its date, then counts the other new events', () => {
    const entries = [
      { date: '2026-11-05', code: 'CTNF', description: 'Non-Final Rejection' },
      { date: '2026-11-06', code: 'A', description: 'Second' },
    ]
    expect(Routines.runChatTitle([{ application, entries: [entries[0]!] }])).toBe('EP3456789: Non-Final Rejection (2026-11-05)')
    expect(Routines.runChatTitle([{ application, entries }, { application, entries }]))
      .toBe('EP3456789: Non-Final Rejection (2026-11-05) +3')
    expect(Routines.runChatTitle([{ application, entries: [] }, { application, entries }]))
      .toBe('EP3456789: Non-Final Rejection (2026-11-05) +1')
    expect(Routines.runChatTitle([])).toBe('Register event')
  })

  it('turns bidirectional overrides and isolates into spaces, so the title shows in its stored order', () => {
    const entries = [{ date: '2026-11-05', code: 'X', description: 'Notice\u202Efdp.exe\u202C of \u2066grant\u2069' }]
    expect(Routines.runChatTitle([{ application, entries }])).toBe('EP3456789: Notice fdp.exe  of  grant  (2026-11-05)')
  })

  it('flattens control characters and cuts the title to the maximum with the count kept', () => {
    const entries = [
      { date: '2026-11-05', code: 'X', description: `Line one\nline two ${'x'.repeat(200)}` },
      { date: '2026-11-06', code: 'Y', description: 'Second' },
    ]
    const title = Routines.runChatTitle([{ application, entries }])
    expect(title).toHaveLength(Routines.MAX_CHAT_TITLE_LENGTH)
    expect(title.startsWith('EP3456789: Line one line two xxx')).toBe(true)
    expect(title.endsWith('… +1')).toBe(true)
  })
})

describe('a new chat for each run', () => {
  it('opens a titled chat in the workspace of the task chat and delivers the run there', async () => {
    const test = await host(new MemoryMediaPool(), { chats: true })
    const chats = test.chats!
    const id = await runOnce(test)
    expect(chats.create).toHaveBeenCalledExactlyOnceWith({ workspaceId: 'firm' })
    expect(chats.rename).toHaveBeenCalledExactlyOnceWith({ sessionId: SessionId('review-1'), title: TITLE })
    expect(test.agent.followup).not.toHaveBeenCalled()
    const review = chats.opened[0]!
    expect(review.followup).toHaveBeenCalledOnce()
    expect(sentPrompt(review, 0)).toContain('No opposition filed within time limit')
    const [entry] = await test.ctx.schedule.catalog()
    expect(entry).toMatchObject({ id, target: { kind: 'session', sessionId: SessionId('original') }, involvedSessionIds: [SessionId('original')], status: 'active' })
    expect(entry?.lastDelivery).toBeDefined()
  })

  it('opens the run chat in the default directory and lists no watch when the task target creates a chat for every run', async () => {
    const test = await host(new MemoryMediaPool(), { chats: true })
    const chats = test.chats!
    const created = await createWatch(test, ['EP 3 456 789'])
    const id = (created.value as { id: Routines.TaskId }).id
    const [task] = await test.ctx.schedule.catalog()
    const edited = await test.ctx.schedule.edit({
      id, action: 'update', expectedUpdatedAt: task!.updatedAt ?? null, patch: { target: { kind: 'new' } },
    })
    expect(edited).toMatchObject({ target: { kind: 'new' } })
    expect(await test.ctx.flowleapRoutines.watches()).toEqual([])
    test.register.state.set('EP3456789', EP_EVENTS)
    await vi.advanceTimersByTimeAsync(2 * DAY)
    expect(chats.create).toHaveBeenCalledExactlyOnceWith({})
    const review = chats.opened[0]!
    expect(review.followup).toHaveBeenCalledOnce()
    // A task without a target Session is delivered alone, so the run uses the one-reminder framing.
    expect(sentText(review, 0)).toContain('No opposition filed within time limit')
    expect(test.agent.followup).not.toHaveBeenCalled()
  })

  it('opens one chat per pending run in the directory of a task chat outside every workspace, or the default directory', async () => {
    let opened = 0
    const create = vi.fn<RunChatHost['sessionController']['create']>(async () => {
      opened += 1
      return { sessionId: SessionId(`chat-${String(opened)}`) }
    })
    const rename = vi.fn<RunChatHost['sessionController']['rename']>(async request => ({ title: request.title, seq: 1 }))
    const test = await harness({ pool: new MemoryMediaPool() })
    contexts.push(test.ctx)
    const live = new Map<string, Session>([['original', test.ctx.sessions.create(SessionId('task-chat'), { meta: { cwd: '/work/firm' } })]])
    let mounted = false
    const chatHost: RunChatHost = {
      sessionController: { create, rename }, workspaceRegistry: { list: () => [] },
      sessions: { get: id => live.get(id) }, logger: test.ctx.logger,
    }
    const chats = new Routines.RunChats(test.ctx.storageDomain.open(Routines.routinesDomain), () => mounted ? chatHost : undefined)
    const task = 'task-1' as Routines.TaskId
    const first = '2026-11-04T07:00:00.000Z'
    expect(chats.available()).toBe(false)
    expect(await chats.open(task, first, SessionId('original'), 'T')).toBeUndefined()
    mounted = true
    expect(chats.available()).toBe(true)
    expect(await chats.open(task, first, SessionId('original'), 'T')).toBe(SessionId('chat-1'))
    expect(await chats.open(task, first, SessionId('original'), 'T')).toBe(SessionId('chat-1'))
    expect(create).toHaveBeenCalledExactlyOnceWith({ cwd: '/work/firm' })
    expect(rename).toHaveBeenCalledExactlyOnceWith({ sessionId: SessionId('chat-1'), title: 'T' })
    // A link of an earlier target belongs to a delivered run whose link was not forgotten.
    expect(await chats.open(task, '2026-11-05T07:00:00.000Z', SessionId('ghost'), 'T')).toBe(SessionId('chat-2'))
    expect(create).toHaveBeenLastCalledWith({})
    await chats.settle([task, 'task-without-chat'])
    expect(await chats.open(task, '2026-11-05T07:00:00.000Z', SessionId('original'), 'T')).toBe(SessionId('chat-3'))
  })

  it('reuses the chat of an occurrence whose delivery failed, and logs a title the controller refuses', async () => {
    const test = await host(new MemoryMediaPool(), { chats: true })
    const chats = test.chats!
    const warn = vi.spyOn(test.ctx.logger, 'warn').mockImplementation(() => {})
    try {
      chats.rename.mockRejectedValueOnce(new Error('no session-title service'))
      await createWatch(test, ['EP 3 456 789'])
      test.register.state.set('EP3456789', EP_EVENTS)
      test.flush.mockImplementationOnce(async () => { throw new Error('disk full') })
      await vi.advanceTimersByTimeAsync(2 * DAY)
      expect(chats.create).toHaveBeenCalledOnce()
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('chat review-1 not titled: Error: no session-title service'))
      expect(chats.opened[0]!.followup).toHaveBeenCalledOnce()
      const [entry] = await test.ctx.schedule.catalog()
      expect(entry?.lastDelivery).toBeUndefined()
      // A management write wakes the timer; the same occurrence is admitted again.
      await test.ctx.schedule.create({
        title: 'Wake', prompt: 'Wake', timing: { kind: 'after', after_seconds: 60 },
        target: { kind: 'session', sessionId: test.agent.session.id },
      }, test.agent.session.id)
      await vi.advanceTimersByTimeAsync(60_000)
      expect(chats.create).toHaveBeenCalledOnce()
      expect(chats.opened[0]!.followup).toHaveBeenCalledTimes(2)
      const watch = (await test.ctx.schedule.catalog()).find(candidate => candidate.title === 'Office actions')
      expect(watch?.lastDelivery).toBeDefined()
    } finally { warn.mockRestore() }
  })

  it('keeps the events of a failed run unseen through a Run now, so a later timed run reports them', async () => {
    const test = await host(new MemoryMediaPool(), { chats: true })
    const warn = vi.spyOn(test.ctx.logger, 'warn').mockImplementation(() => {})
    try {
      const created = await createWatch(test, ['EP 3 456 789'], { newChat: false })
      const id = (created.value as { id: Routines.TaskId }).id
      test.register.state.set('EP3456789', EP_EVENTS)
      test.flush.mockImplementationOnce(async () => { throw new Error('disk full') })
      await vi.advanceTimersByTimeAsync(2 * DAY)
      expect(test.agent.followup).toHaveBeenCalledOnce()
      expect((await test.ctx.schedule.view({ id }))).not.toHaveProperty('lastDelivery')
      // The attorney runs the task by hand: the stored instruction goes out without register events.
      const run = await test.ctx.schedule.run({ id })
      expect(run).toHaveProperty('lastDelivery')
      expect(test.agent.followup).toHaveBeenCalledTimes(2)
      expect(sentText(test.agent, 1)).not.toContain('No opposition filed within time limit')
      await vi.advanceTimersByTimeAsync(0)
      expect(await test.ctx.flowleapRoutines.reviews()).toEqual([])
      // The failed occurrence is due again after the delivery floor and still reports the event.
      await vi.advanceTimersByTimeAsync(DAY)
      expect(test.agent.followup).toHaveBeenCalledTimes(3)
      expect(sentPrompt(test.agent, 2)).toContain('No opposition filed within time limit')
    } finally { warn.mockRestore() }
  })

  it('runs a new-chat watch in the task chat, with a log line, where no Session controller is mounted', async () => {
    const pool = new MemoryMediaPool()
    const first = await host(pool, { chats: true })
    expect((await createWatch(first, ['EP 3 456 789'], { newChat: true })).isError).toBe(false)
    await first.ctx.fiber.dispose()
    contexts.splice(contexts.indexOf(first.ctx), 1)
    const second = await host(pool)
    const warn = vi.spyOn(second.ctx.logger, 'warn').mockImplementation(() => {})
    try {
      second.register.state.set('EP3456789', EP_EVENTS)
      await vi.advanceTimersByTimeAsync(2 * DAY)
      expect(second.agent.followup).toHaveBeenCalledOnce()
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("no Session controller to open a chat; the run goes to the task's chat"))
    } finally { warn.mockRestore() }
  })

  it('sends a run admitted again after a Host stop to the chat it opened before the stop', async () => {
    const pool = new MemoryMediaPool()
    const first = await host(pool, { chats: true })
    expect((await createWatch(first, ['EP 3 456 789'])).isError).toBe(false)
    first.register.state.set('EP3456789', EP_EVENTS)
    // The chat opens, then the delivery fails, and the Host stops before the run is delivered.
    first.flush.mockImplementation(async () => { throw new Error('disk full') })
    await vi.advanceTimersByTimeAsync(2 * DAY)
    expect(first.chats!.create).toHaveBeenCalledOnce()
    const [entry] = await first.ctx.schedule.catalog()
    expect(entry?.lastDelivery).toBeUndefined()
    await first.ctx.fiber.dispose()
    contexts.splice(contexts.indexOf(first.ctx), 1)

    // Before the due run's target: the Schedule harness drives overdue tasks before this plugin mounts.
    vi.setSystemTime(new Date('2026-11-03T06:00:00Z'))
    const second = await host(pool, { chats: true })
    const before = agentFor(second.ctx, 'review-1')
    second.resolve.mockImplementation(async sessionId => sessionId === before.id ? { agent: before } : { agent: second.agent })
    await vi.advanceTimersByTimeAsync(2 * 3_600_000)
    expect(second.chats!.create).not.toHaveBeenCalled()
    expect(before.followup).toHaveBeenCalledOnce()
    const watch = (await second.ctx.schedule.catalog()).find(candidate => candidate.title === 'Office actions')
    expect(watch?.lastDelivery).toBeDefined()
  })

  it('opens a new chat for the next run when the delivered run could not forget its chat', async () => {
    const pool = new MemoryMediaPool()
    const test = await host(pool, {
      chats: true, backend: gatedBackend(pool, { deleteRecords: table => table === 'run_chats' ? Promise.reject(new Error('disk full')) : undefined }),
    })
    const warn = vi.spyOn(test.ctx.logger, 'warn').mockImplementation(() => {})
    try {
      await runOnce(test)
      expect(test.chats!.create).toHaveBeenCalledOnce()
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('seen events not saved: Error: disk full'))
      test.register.state.set('EP3456789', [{ date: '2026-11-04', code: 'CTNF', description: 'Non-Final Rejection' }, ...EP_EVENTS])
      await vi.advanceTimersByTimeAsync(DAY)
      expect(test.chats!.create).toHaveBeenCalledTimes(2)
      expect(test.chats!.opened[1]!.followup).toHaveBeenCalledOnce()
    } finally { warn.mockRestore() }
  })

  it('refuses new_chat_per_run where no chat can open, and resolves an omitted one to off', async () => {
    const test = await host(new MemoryMediaPool())
    const refused = await createWatch(test, ['EP 3 456 789'], { newChat: true })
    expect(refused.value).toMatchObject({ code: 'new_chat_unavailable' })
    await runOnce(test)
    expect(test.agent.followup).toHaveBeenCalledOnce()
  })

  it('behaves as before when both options are off', async () => {
    const test = await host(new MemoryMediaPool(), { chats: true })
    await runOnce(test, { newChat: false, needsReview: false })
    expect(test.chats!.create).not.toHaveBeenCalled()
    expect(test.agent.followup).toHaveBeenCalledOnce()
    expect(await test.ctx.flowleapRoutines.reviews()).toEqual([])
  })
})

describe('the Needs review mark', () => {
  it('marks the chat running, then needs_review when its Agent goes idle, and clears it on the user answer', async () => {
    const test = await host(new MemoryMediaPool(), { chats: true })
    const changed = vi.fn()
    test.ctx.on('flowleap-routines/changed', changed)
    test.chats!.nextStatus = 'running'
    const id = await runOnce(test)
    // The first change is the saved watch, the second the mark.
    const review = test.chats!.opened[0]!
    expect(await test.ctx.flowleapRoutines.reviews()).toEqual([
      { sessionId: review.id, taskId: id, state: 'running', since: '2026-11-03T07:00:00.000Z' },
    ])
    expect(changed).toHaveBeenCalledTimes(2)
    vi.setSystemTime(new Date('2026-11-03T07:05:00Z'))
    test.ctx.emit('agent/status', { agent: test.agent, status: 'idle' })
    test.ctx.emit('agent/status', { agent: review, status: 'running' })
    await vi.advanceTimersByTimeAsync(0)
    expect(await test.ctx.flowleapRoutines.reviews()).toMatchObject([{ state: 'running' }])
    test.ctx.emit('agent/status', { agent: review, status: 'idle' })
    await vi.advanceTimersByTimeAsync(0)
    expect(await test.ctx.flowleapRoutines.reviews()).toEqual([
      { sessionId: review.id, taskId: id, state: 'needs_review', since: '2026-11-03T07:05:00.000Z' },
    ])
    expect(changed).toHaveBeenCalledTimes(3)
    test.ctx.emit('agent/status', { agent: review, status: 'idle' })
    answer(review, { kind: 'schedule' })
    await vi.advanceTimersByTimeAsync(0)
    expect(await test.ctx.flowleapRoutines.reviews()).toHaveLength(1)
    answer(test.agent, { kind: 'user' })
    answer(review, { kind: 'user' })
    await vi.advanceTimersByTimeAsync(0)
    expect(await test.ctx.flowleapRoutines.reviews()).toEqual([])
    expect(changed).toHaveBeenCalledTimes(4)
  })

  it('marks a chat whose Agent is idle at delivery needs_review at once, and keeps the mark of a deleted task', async () => {
    const test = await host(new MemoryMediaPool(), { chats: true })
    const id = await runOnce(test)
    const review = test.chats!.opened[0]!
    expect(await test.ctx.flowleapRoutines.reviews()).toEqual([
      { sessionId: review.id, taskId: id, state: 'needs_review', since: '2026-11-03T07:00:00.000Z' },
    ])
    await test.ctx.schedule.edit({ id: id as Routines.TaskId, action: 'delete' }, test.agent.session.id)
    await vi.advanceTimersByTimeAsync(0)
    expect(await test.ctx.flowleapRoutines.reviews()).toHaveLength(1)
  })

  it('turns a running mark to needs_review when the Agent goes idle while the mark is written', async () => {
    const pool = new MemoryMediaPool()
    let release: () => void = () => {}
    let held = false
    const test = await host(pool, {
      chats: true,
      backend: gatedBackend(pool, {
        putRecord: (table) => {
          if (table !== 'reviews' || held) return undefined
          held = true
          return new Promise<void>((resolve) => { release = resolve })
        },
      }),
    })
    test.chats!.nextStatus = 'running'
    await runOnce(test)
    const review = test.chats!.opened[0]!
    expect(held).toBe(true)
    Object.assign(review, { status: 'idle' })
    test.ctx.emit('agent/status', { agent: review, status: 'idle' })
    release()
    await vi.advanceTimersByTimeAsync(0)
    expect(await test.ctx.flowleapRoutines.reviews()).toMatchObject([{ sessionId: review.id, state: 'needs_review' }])
  })

  it('converts running marks to needs_review when the Host starts', async () => {
    const pool = new MemoryMediaPool()
    const first = await host(pool, { chats: true })
    first.chats!.nextStatus = 'running'
    const id = await runOnce(first)
    expect(await first.ctx.flowleapRoutines.reviews()).toMatchObject([{ state: 'running' }])
    await first.ctx.fiber.dispose()
    contexts.splice(contexts.indexOf(first.ctx), 1)
    // Before the next occurrence: the Schedule harness drives overdue tasks before this plugin mounts.
    vi.setSystemTime(new Date('2026-11-04T00:00:00Z'))
    const second = await host(pool, { chats: true })
    const changed = vi.fn()
    second.ctx.on('flowleap-routines/changed', changed)
    await vi.advanceTimersByTimeAsync(0)
    expect(await second.ctx.flowleapRoutines.reviews()).toEqual([
      { sessionId: SessionId('review-1'), taskId: id, state: 'needs_review', since: '2026-11-04T00:00:00.000Z' },
    ])
    await second.ctx.fiber.dispose()
    contexts.splice(contexts.indexOf(second.ctx), 1)
    const third = await host(pool, { chats: true })
    const unchanged = vi.fn()
    third.ctx.on('flowleap-routines/changed', unchanged)
    await vi.advanceTimersByTimeAsync(0)
    expect(unchanged).not.toHaveBeenCalled()
  })

  it('lists only the chats remote access allows, and clears one on done', async () => {
    const test = await host(new MemoryMediaPool(), { chats: true })
    const id = await runOnce(test)
    const allows = test.chats!.allows
    allows.mockReturnValueOnce(false)
    expect(await test.ctx.flowleapRoutines.reviews()).toEqual([])
    expect(allows).toHaveBeenCalledWith({ kind: 'session', id: SessionId('review-1') })
    expect(await test.ctx.flowleapRoutines.reviews()).toMatchObject([{ taskId: id }])
    const changed = vi.fn()
    test.ctx.on('flowleap-routines/changed', changed)
    await test.ctx.flowleapRoutines.done(SessionId('review-9'))
    expect(changed).not.toHaveBeenCalled()
    await test.ctx.flowleapRoutines.done(SessionId('review-1'))
    expect(changed).toHaveBeenCalledOnce()
    expect(await test.ctx.flowleapRoutines.reviews()).toEqual([])
  })

  it('logs a mark that cannot be saved', async () => {
    const pool = new MemoryMediaPool()
    const test = await host(pool, {
      chats: true, backend: gatedBackend(pool, { putRecord: table => table === 'reviews' ? Promise.reject(new Error('disk full')) : undefined }),
    })
    const warn = vi.spyOn(test.ctx.logger, 'warn').mockImplementation(() => {})
    try {
      const id = await runOnce(test)
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(`${id} not marked: Error: disk full`))
      expect(await test.ctx.flowleapRoutines.reviews()).toEqual([])
    } finally { warn.mockRestore() }
  })
})
