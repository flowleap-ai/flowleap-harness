// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import {
  allowAllAccess, bindSnapshotSelector, contextMenuHook, makeTranslate, RemoteError, StaticRemoteAccess, stubConfigForm,
} from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { RoutineReview, RoutineWatch } from '@deepseek-ai/dsh-flowleap-routines/types'
import type { ScheduleCatalogEntry, ScheduleId } from '@deepseek-ai/dsh-schedule/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { apply, inject } from '../src/client/index.ts'
import { apply as applyNode } from '../src/index.ts'
import { en, NS, zh } from '../src/client/locales.ts'
import { MarkDoneAction, NeedsReviewBadge, NeedsReviewFilter, NeedsReviewPanelIcon } from '../src/client/marks.tsx'
import { NeedsReviewPage, type NeedsReviewPageProps } from '../src/client/NeedsReviewPage.tsx'
import { createReviewsSource, type ReviewsDependencies, type ReviewsSource } from '../src/client/reviews-source.ts'
import { CasesWatchedMetric, ComingUpWidget, NeedsYourReviewWidget, WaitingForReviewMetric } from '../src/client/dashboard.tsx'
import { createWatchesSource, type WatchesDependencies } from '../src/client/watches-source.ts'
import type { DashboardSearch, DashboardSearchGroup } from '@deepseek-ai/dsh-client-ui-flowleap-dashboard/client'

afterEach(() => { cleanup() })

const alpha = 'chat-alpha' as SessionId
const beta = 'chat-beta' as SessionId
const gamma = 'chat-gamma' as SessionId

function review(sessionId: SessionId, taskId: string, since: string, state: RoutineReview['state'] = 'needs_review'): RoutineReview {
  return { sessionId, taskId, state, since }
}

function task(id: string, title: string): ScheduleCatalogEntry {
  return {
    id: id as ScheduleId, kind: 'daily', status: 'active', title, prompt: title,
    target: { kind: 'session', sessionId: 'chat-origin' as SessionId }, involvedSessionIds: ['chat-origin' as SessionId],
    time: '09:00:00.000', timeZone: 'UTC', scheduledAt: '2026-10-28T09:00:00.000Z',
  }
}

const marks = [
  review(alpha, 'watch', '2026-10-26T09:00:00.000Z'),
  review(beta, 'digest', '2026-10-27T09:00:00.000Z'),
  review(gamma, 'watch', '2026-10-27T10:00:00.000Z', 'running'),
]
const tasks = [task('watch', 'Register watch'), task('digest', 'Weekly digest'), task('other', 'Other task')]
const ok = <T,>(value: T): RemoteResult<T> => ({ ok: true, value })
const watches: RoutineWatch[] = [
  {
    taskId: 'watch' as ScheduleId, sessionId: 'chat-origin' as SessionId, title: 'Register watch', nextCheckAt: '2026-10-28T09:00:00.000Z',
    applications: [
      { application: 'EP3456789', readAt: '2026-10-27T09:00:00.000Z', latest: { date: '2026-10-20', code: 'RFEE', description: 'Renewal fee paid' } },
      { application: 'US17123456' },
    ],
  },
  { taskId: 'stopped' as ScheduleId, sessionId: 'chat-origin' as SessionId, title: 'Stopped watch', applications: [{ application: 'EP3456789' }] },
]

/** Remote doubles with emitters for the invalidations the source listens to. */
function remote(overrides: Partial<ReviewsDependencies> = {}) {
  const changed = new Set<() => void>()
  const reset = new Set<() => void>()
  const deps: ReviewsDependencies = {
    reviews: vi.fn(async () => ok(marks)),
    catalog: vi.fn(async () => ok(tasks)),
    done: vi.fn(async () => ok(undefined)),
    subscribeChanged: (listener) => { changed.add(listener); return () => { changed.delete(listener) } },
    subscribeReset: (listener) => { reset.add(listener); return () => { reset.delete(listener) } },
    ...overrides,
  }
  return {
    deps,
    emitChanged: () => { for (const listener of changed) listener() },
    emitReset: () => { for (const listener of reset) listener() },
    listening: () => changed.size + reset.size,
  }
}

async function settle(): Promise<void> {
  await act(async () => { await Promise.resolve() })
  await act(async () => { await Promise.resolve() })
}

describe('reviews source', () => {
  it('reads only while observed and shows needs_review marks newest first', async () => {
    const r = remote()
    const source = createReviewsSource(r.deps)
    expect(r.deps.reviews).not.toHaveBeenCalled()
    const stop = source.hooks.reviews.subscribe(() => {})
    await settle()
    const snapshot = source.hooks.reviews.getSnapshot()
    expect(snapshot.status).toBe('ready')
    expect(snapshot.marked.map(mark => mark.sessionId)).toEqual([beta, alpha])
    expect(snapshot.tasks).toEqual(tasks)
    stop()
    expect(r.listening()).toBe(0)
  })

  it('reads again on a change event and a connection reset', async () => {
    const r = remote()
    const source = createReviewsSource(r.deps)
    const stop = source.hooks.reviews.subscribe(() => {})
    await settle()
    r.emitChanged()
    r.emitReset()
    await settle()
    expect(r.deps.reviews).toHaveBeenCalledTimes(3)
    stop()
  })

  it('keeps marks without task names when the catalog read fails, and reports a failed marks read', async () => {
    const r = remote({ catalog: vi.fn(async (): Promise<RemoteResult<ScheduleCatalogEntry[]>> => ({ ok: false, error: new RemoteError('gateway/internal', 'Unavailable', {}) })) })
    const source = createReviewsSource(r.deps)
    const stop = source.hooks.reviews.subscribe(() => {})
    await settle()
    expect(source.hooks.reviews.getSnapshot()).toMatchObject({ status: 'ready', tasks: [] })
    stop()
    const failing = remote({ reviews: vi.fn(async () => { throw new Error('transport closed') }) })
    const broken = createReviewsSource(failing.deps)
    const stopBroken = broken.hooks.reviews.subscribe(() => {})
    await settle()
    expect(broken.hooks.reviews.getSnapshot().status).toBe('error')
    stopBroken()
  })

  it('clears a mark, reads again, and reports a failure', async () => {
    const r = remote()
    const source = createReviewsSource(r.deps)
    const stop = source.hooks.reviews.subscribe(() => {})
    await settle()
    await expect(source.onDone(alpha)).resolves.toBe(true)
    expect(r.deps.done).toHaveBeenCalledWith(alpha)
    expect(r.deps.reviews).toHaveBeenCalledTimes(2)
    vi.mocked(r.deps.done).mockResolvedValueOnce({ ok: false, error: new RemoteError('gateway/internal', 'Unavailable', {}) })
    await expect(source.onDone(alpha)).resolves.toBe(false)
    expect(source.hooks.reviews.getSnapshot().pending).toEqual([])
    stop()
  })
})

const unavailable = (): RemoteResult<never> => ({ ok: false, error: new RemoteError('gateway/internal', 'Unavailable', {}) })

/** A promise the test settles by hand. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('reviews source failures', () => {
  it('reports a failed marks read and recovers on retry', async () => {
    let fail = true
    const r = remote({ reviews: vi.fn(async () => (fail ? unavailable() : ok(marks))) })
    const source = createReviewsSource(r.deps)
    const stop = source.hooks.reviews.subscribe(() => {})
    await settle()
    expect(source.hooks.reviews.getSnapshot().status).toBe('error')
    fail = false
    await act(async () => { await source.onRetry() })
    expect(source.hooks.reviews.getSnapshot().status).toBe('ready')
    stop()
  })

  it('discards a rejected read that settles after the last unsubscribe', async () => {
    const pendingRead = deferred<RemoteResult<RoutineReview[]>>()
    const r = remote({ reviews: vi.fn(() => pendingRead.promise) })
    const source = createReviewsSource(r.deps)
    const stop = source.hooks.reviews.subscribe(() => {})
    stop()
    pendingRead.reject(new Error('transport closed'))
    await settle()
    expect(source.hooks.reviews.getSnapshot().status).toBe('loading')
  })

  it('ignores a second Mark as done for a chat in flight and reports a rejected request', async () => {
    const request = deferred<RemoteResult<void>>()
    const r = remote({ done: vi.fn(() => request.promise) })
    const source = createReviewsSource(r.deps)
    const stop = source.hooks.reviews.subscribe(() => {})
    await settle()
    const first = source.onDone(alpha)
    await expect(source.onDone(alpha)).resolves.toBe(false)
    expect(source.hooks.reviews.getSnapshot().pending).toEqual([alpha])
    request.reject(new Error('transport closed'))
    await expect(first).resolves.toBe(false)
    expect(source.hooks.reviews.getSnapshot().pending).toEqual([])
    expect(r.deps.done).toHaveBeenCalledTimes(1)
    stop()
  })
})

/** A ready source over the fixture marks, for the components. */
async function readySource(overrides: Partial<ReviewsDependencies> = {}) {
  const r = remote(overrides)
  const source = createReviewsSource(r.deps)
  const stop = source.hooks.reviews.subscribe(() => {})
  await settle()
  return { r, source, stop, useReviews: bindSnapshotSelector(source.hooks.reviews) }
}

const t = makeTranslate(en)
const workspaces: WorkspaceSnapshot = { items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null }
const noSessions: SessionListState = { ids: [], byId: {}, phase: 'ready', projectionsBySession: {} }

/**
 * Compose the page props the renderer would pass.
 * @param source - the shared reviews source.
 * @param sessions - the Session list the page names chats from.
 * @param onOpenSession - the navigation spy.
 * @returns the full page props.
 */
function pageProps(source: ReviewsSource, sessions: SessionListState, onOpenSession = vi.fn()): NeedsReviewPageProps {
  return {
    useReviews: bindSnapshotSelector(source.hooks.reviews),
    useSessions: select => select(sessions),
    useWorkspaces: select => select(workspaces),
    usePanelInfo: select => select({ activePanelId: null }),
    useSessionStatus: select => select(new Map()),
    useSessionRetainInfo: () => undefined,
    useResource: () => { throw new Error('The page loads no document resources') },
    ...allowAllAccess,
    useContextMenu: contextMenuHook(),
    onDone: source.onDone,
    onRetry: source.onRetry,
    onOpenSession,
    t,
  }
}

describe('Needs review surfaces', () => {
  it('marks only a needs_review row, with an accessible label', async () => {
    const { useReviews, stop } = await readySource()
    const { container, rerender } = render(<NeedsReviewBadge sessionId={alpha} useReviews={useReviews} t={t} />)
    expect(screen.getByText(en['badge.label'])).toBeDefined()
    rerender(<NeedsReviewBadge sessionId={gamma} useReviews={useReviews} t={t} />)
    expect(container.textContent).toBe('')
    stop()
  })

  it('shows the count on the panel glyph only when a chat needs review', async () => {
    const { useReviews, stop } = await readySource()
    const { container } = render(<NeedsReviewPanelIcon size={16} useReviews={useReviews} />)
    expect(container.querySelector('[data-needs-review-count]')?.getAttribute('data-needs-review-count')).toBe('2')
    expect(container.textContent).toBe('')
    stop()
    const empty = await readySource({ reviews: vi.fn(async () => ok([])) })
    cleanup()
    const view = render(<NeedsReviewPanelIcon size={16} useReviews={empty.useReviews} />)
    expect(view.container.querySelector('[data-needs-review-count]')).toBeNull()
    empty.stop()
  })

  it('lists marked chats newest first, opens one, and marks one as done', async () => {
    const { source, stop, r } = await readySource()
    const sessions: SessionListState = {
      ids: [alpha, beta],
      byId: {
        [alpha]: { id: alpha, displayTitle: 'EP 1234567 opposition', running: false, blank: false, updatedAt: 0, retainedBy: {} },
        [beta]: { id: beta, displayTitle: 'US 9876543 office action', running: false, blank: false, updatedAt: 0, retainedBy: {} },
      },
      phase: 'ready', projectionsBySession: {},
    }
    const onOpenSession = vi.fn()
    render(<NeedsReviewPage {...pageProps(source, sessions, onOpenSession)} />)
    const list = screen.getByRole('list', { name: en['list.label'] })
    const opens = within(list).getAllByRole('button', { name: /^Open chat/ })
    expect(opens.map(button => button.getAttribute('aria-label'))).toEqual([
      'Open chat: US 9876543 office action', 'Open chat: EP 1234567 opposition',
    ])
    expect(opens[0]?.textContent).toContain('Task: Weekly digest')
    fireEvent.click(opens[1]!)
    expect(onOpenSession).toHaveBeenCalledWith(alpha)
    fireEvent.click(within(list).getByRole('button', { name: 'Mark "EP 1234567 opposition" as done' }))
    await settle()
    expect(r.deps.done).toHaveBeenCalledWith(alpha)
    stop()
  })

  it('states an empty list', async () => {
    const { source, stop } = await readySource({ reviews: vi.fn(async () => ok([])) })
    render(<NeedsReviewPage {...pageProps(source, noSessions)} />)
    expect(screen.getByRole('status').textContent).toContain(en['empty.title'])
    stop()
  })

  it('offers Mark as done in the header only while the open chat needs review', async () => {
    const { useReviews, source, stop, r } = await readySource()
    const { container, rerender } = render(<MarkDoneAction sessionId={gamma} useReviews={useReviews} onDone={source.onDone} t={t} />)
    expect(container.textContent).toBe('')
    rerender(<MarkDoneAction sessionId={beta} useReviews={useReviews} onDone={source.onDone} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: en['done.action'] }))
    await settle()
    expect(r.deps.done).toHaveBeenCalledWith(beta)
    stop()
  })

  it('selects the catalog tasks of the marked chats', async () => {
    const { useReviews, stop } = await readySource()
    const select = vi.fn()
    render(<NeedsReviewFilter selected={false} select={select} className="tab" selectedClassName="on" useReviews={useReviews} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: en['filter.label'] }))
    expect([...select.mock.calls[0]![0] as ReadonlySet<ScheduleId>].sort()).toEqual(['digest', 'watch'])
    stop()
  })
})

describe('Needs review surfaces, edge states', () => {
  it('shows one dot, not a number, for many marked chats', async () => {
    const many = Array.from({ length: 100 }, (_, index) => review(`chat-${index}` as SessionId, 'watch', '2026-10-27T09:00:00.000Z'))
    const { useReviews, stop } = await readySource({ reviews: vi.fn(async () => ok(many)) })
    const { container } = render(<NeedsReviewPanelIcon size={16} useReviews={useReviews} />)
    expect(container.querySelector('[data-needs-review-count]')?.getAttribute('data-needs-review-count')).toBe('100')
    expect(container.textContent).toBe('')
    stop()
  })

  it('keeps Mark as done busy while the request is in flight and reports a failure', async () => {
    const request = deferred<RemoteResult<void>>()
    const { useReviews, source, stop, r } = await readySource({ done: vi.fn(() => request.promise) })
    render(<MarkDoneAction sessionId={beta} useReviews={useReviews} onDone={source.onDone} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: en['done.action'] }))
    const busy = screen.getByRole('button', { name: en['done.pending'] })
    expect(busy.getAttribute('aria-busy')).toBe('true')
    fireEvent.click(busy)
    expect(r.deps.done).toHaveBeenCalledTimes(1)
    await act(async () => { request.resolve(unavailable()); await Promise.resolve() })
    expect((await screen.findByRole('alert')).textContent).toBe(en['done.error'])
    fireEvent.click(screen.getByRole('button', { name: en['done.action'] }))
    expect(screen.queryByRole('alert')).toBeNull()
    stop()
  })

  it('selects its tasks as soon as the tab is selected and styles the selected tab', async () => {
    const { useReviews, stop } = await readySource()
    const select = vi.fn()
    render(<NeedsReviewFilter selected select={select} className="tab" selectedClassName="on" useReviews={useReviews} t={t} />)
    expect(select).toHaveBeenCalled()
    const tab = screen.getByRole('button', { name: en['filter.label'] })
    expect(tab.className).toBe('tab on')
    expect(tab.getAttribute('aria-pressed')).toBe('true')
    stop()
  })

  it('names a chat without a title and omits an unknown task', async () => {
    const orphan = [review(alpha, 'deleted-task', '2026-10-26T09:00:00.000Z')]
    const { source, stop } = await readySource({ reviews: vi.fn(async () => ok(orphan)) })
    render(<NeedsReviewPage {...pageProps(source, noSessions)} />)
    const open = screen.getByRole('button', { name: `Open chat: ${en['row.untitled']}` })
    expect(open.textContent).not.toContain('Task:')
    stop()
  })

  it('shows a loading state before the first read settles', () => {
    const source = createReviewsSource(remote({ reviews: () => new Promise(() => {}) }).deps)
    source.hooks.reviews.subscribe(() => {})
    render(<NeedsReviewPage {...pageProps(source, noSessions)} />)
    expect(screen.getByRole('status', { name: en['list.loading'] })).toBeDefined()
  })

  it('offers a retry after a failed read', async () => {
    let fail = true
    const { source, stop, r } = await readySource({ reviews: vi.fn(async () => (fail ? unavailable() : ok(marks))) })
    render(<NeedsReviewPage {...pageProps(source, noSessions)} />)
    expect(screen.getByRole('alert').textContent).toBe(en['list.error'])
    fail = false
    fireEvent.click(screen.getByRole('button', { name: en['list.retry'] }))
    await settle()
    expect(r.deps.reviews).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).toBeNull()
    stop()
  })

  it('reports a failed Mark as done and ignores a click while it is in flight', async () => {
    const request = deferred<RemoteResult<void>>()
    const { source, stop, r } = await readySource({ done: vi.fn(() => request.promise) })
    render(<NeedsReviewPage {...pageProps(source, noSessions)} />)
    const [first] = screen.getAllByRole('button', { name: /^Mark ".*" as done$/ })
    fireEvent.click(first!)
    fireEvent.click(screen.getAllByRole('button', { name: /^Mark ".*" as done$/ })[0]!)
    expect(r.deps.done).toHaveBeenCalledTimes(1)
    await act(async () => { request.resolve(unavailable()); await Promise.resolve() })
    expect((await screen.findByRole('alert')).textContent).toBe(en['done.error'])
    stop()
  })
})

class RemoteStub extends Service {
  constructor(ctx: Context, readonly $on: (event: string, listener: () => void) => () => void) {
    super(ctx, 'remote')
  }
}

async function pluginContext(allows: (action: string) => boolean = () => true): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  new StaticRemoteAccess(ctx, allows)
  new RemoteStub(ctx, () => () => {})
  await ctx.plugin({ apply(provider: Context) {
    provider.provide('remote.flowleapRoutines', {
      reviews: async () => ok(marks), watches: async () => ok(watches), done: async () => ok(undefined),
    } as never)
    provider.provide('dashboardSearch', searchRegistry())
    provider.provide('remote.schedule', { catalog: async () => ok(tasks) } as never)
  } }).await()
  ctx.provide('uiWorkspace', { openSession: vi.fn() } as never)
  ctx.provide('layout', { selectPanel: vi.fn() } as never)
  ctx.provide('configForms', { developerTools: { enabled: createSnapshotStore(true) }, get: () => stubConfigForm().scope } as never)
  await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
  ctx.slots.register({
    name: 'root',
    children: {
      'sidebar.session.row.trailing': { kind: 'list', scope: 'root', inline: true },
      'sidebar.panellist': { kind: 'list', scope: 'root' },
      main: { kind: 'keyed', scope: 'root' },
      'conversation.session.header.utilities': { kind: 'list', scope: 'session' },
      'schedule.manager.filter': { kind: 'list', scope: 'root', inline: true },
      'dashboard.metric': { kind: 'list', scope: 'root' },
      'dashboard.widget': { kind: 'list', scope: 'root' },
    },
  } as never, () => null)
  return ctx
}

/** A dashboard search registry that keeps the registered groups. */
function searchRegistry(): DashboardSearch & { readonly groups: DashboardSearchGroup[] } {
  const groups: DashboardSearchGroup[] = []
  return {
    groups,
    register: (group) => {
      groups.push(group)
      return () => { groups.splice(groups.indexOf(group), 1) }
    },
  }
}

const SEATS = [
  'sidebar.session.row.trailing', 'sidebar.panellist', 'main', 'conversation.session.header.utilities', 'schedule.manager.filter',
  'dashboard.metric', 'dashboard.widget',
] as const
const SEAT_COUNTS: Record<typeof SEATS[number], number> = {
  'sidebar.session.row.trailing': 1, 'sidebar.panellist': 1, main: 1, 'conversation.session.header.utilities': 1,
  'schedule.manager.filter': 1, 'dashboard.metric': 2, 'dashboard.widget': 2,
}

describe('ui-flowleap-routines browser half', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'layout', 'remote', 'remote.flowleapRoutines', 'remote.schedule', 'uiWorkspace', 'remoteAccess'])
  })

  it('registers every surface while the Peer may read the marks and removes them on dispose', async () => {
    for (const allowed of [false, true]) {
      const allows = vi.fn(() => allowed)
      const ctx = await pluginContext(allows)
      const fiber = ctx.plugin({ inject: [...inject], apply })
      await fiber.await()
      expect(allows).toHaveBeenCalledWith('flowleapRoutines/reviews')
      for (const seat of SEATS) expect(ctx.slots.entries(seat)).toHaveLength(allowed ? SEAT_COUNTS[seat] : 0)
      const registry = ctx.get('dashboardSearch') as ReturnType<typeof searchRegistry>
      expect(registry.groups.map(group => group.id)).toEqual(allowed ? ['flowleap-routines'] : [])
      await fiber.dispose()
      for (const seat of SEATS) expect(ctx.slots.entries(seat)).toEqual([])
      expect(registry.groups).toEqual([])
      await ctx.fiber.dispose()
    }
  })

  it('wires every surface to the Remote namespaces and Session navigation', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    new StaticRemoteAccess(ctx, () => true)
    const listeners = new Map<string, Set<() => void>>()
    new RemoteStub(ctx, (event, listener) => {
      const set = listeners.get(event) ?? new Set()
      set.add(listener)
      listeners.set(event, set)
      return () => { set.delete(listener) }
    })
    const reviews = vi.fn(async () => ok(marks))
    // A task whose every run creates a chat has no chat of its own for the search group to open.
    const everyRun: ScheduleCatalogEntry = { ...task('fresh', 'Fresh chats'), target: { kind: 'new', create: {} }, involvedSessionIds: [] }
    const catalog = vi.fn(async () => ok([...tasks, everyRun]))
    const readWatches = vi.fn(async () => ok(watches))
    const done = vi.fn(async () => ok(undefined))
    const registry = searchRegistry()
    await ctx.plugin({ apply(provider: Context) {
      provider.provide('remote.flowleapRoutines', { reviews, watches: readWatches, done } as never)
      provider.provide('remote.schedule', { catalog } as never)
      provider.provide('dashboardSearch', registry)
    } }).await()
    const openSession = vi.fn()
    ctx.provide('uiWorkspace', { openSession } as never)
    const selectPanel = vi.fn()
    ctx.provide('layout', { selectPanel } as never)
    ctx.provide('configForms', { developerTools: { enabled: createSnapshotStore(true) }, get: () => stubConfigForm().scope } as never)
    await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
    ctx.slots.register({
      name: 'root',
      children: {
        'sidebar.session.row.trailing': { kind: 'list', scope: 'root', inline: true },
        'sidebar.panellist': { kind: 'list', scope: 'root' },
        main: { kind: 'keyed', scope: 'root' },
        'conversation.session.header.utilities': { kind: 'list', scope: 'session' },
        'schedule.manager.filter': { kind: 'list', scope: 'root', inline: true },
        'dashboard.metric': { kind: 'list', scope: 'root' },
        'dashboard.widget': { kind: 'list', scope: 'root' },
      },
    } as never, () => null)
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    type Injected = Record<string, unknown> & { hooks?: ReviewsSource['hooks']; onDone?: ReviewsSource['onDone']; onOpenSession?: (id: SessionId) => void }
    const injected = (seat: typeof SEATS[number]): Injected => {
      const entry = ctx.slots.entries(seat)[0]!
      return entry.inject!()
    }
    const label = ctx.slots.entries('sidebar.panellist')[0]!.options.label as () => string
    expect(label()).toBe(en.panel)

    const page = injected('main')
    const stop = page.hooks!.reviews.subscribe(() => {})
    await settle()
    expect(reviews).toHaveBeenCalledTimes(1)
    expect(catalog).toHaveBeenCalledTimes(1)
    expect(readWatches).not.toHaveBeenCalled()
    expect(listeners.get('flowleap-routines/changed')?.size).toBe(1)
    expect(listeners.get('schedule/changed')?.size).toBe(1)
    for (const event of ['flowleap-routines/changed', 'schedule/changed']) {
      for (const listener of listeners.get(event)!) listener()
    }
    ctx.emit('connection/reset')
    await settle()
    expect(reviews).toHaveBeenCalledTimes(4)

    page.onOpenSession!(alpha)
    expect(openSession).toHaveBeenCalledWith(alpha)
    await act(async () => { await injected('conversation.session.header.utilities').onDone!(alpha) })
    expect(done).toHaveBeenCalledWith(alpha)
    expect(injected('sidebar.session.row.trailing').hooks).toBeDefined()
    expect(injected('sidebar.panellist').hooks).toBeDefined()
    expect(injected('schedule.manager.filter').hooks).toBeDefined()
    expect(injected('dashboard.metric').hooks).toBeDefined()
    const widget = injected('dashboard.widget') as Injected & { onOpenAll: () => void }
    widget.onOpenSession!(beta)
    expect(openSession).toHaveBeenCalledWith(beta)
    widget.onOpenAll()
    expect(selectPanel).toHaveBeenCalledWith('flowleap-needs-review')
    expect((ctx.slots.entries('dashboard.widget')[0]!.options.label as () => string)()).toBe(en['dashboard.widget'])
    const labels = (seat: typeof SEATS[number]) => ctx.slots.entries(seat).map(entry => (entry.options.label as () => string)())
    expect(labels('dashboard.metric')).toEqual([en['dashboard.metric'], en['cases.metric']])
    expect(labels('dashboard.widget')).toEqual([en['dashboard.widget'], en['comingUp.widget']])
    const cases = ctx.slots.entries('dashboard.metric')[1]!.inject!() as { hooks: { watches: unknown } }
    const coming = ctx.slots.entries('dashboard.widget')[1]!.inject!() as { hooks: { watches: { subscribe: (listener: () => void) => () => void } }; onOpenSession: (id: SessionId) => void }
    expect(cases.hooks.watches).toBe(coming.hooks.watches)
    const stopWatches = coming.hooks.watches.subscribe(() => {})
    await settle()
    expect(readWatches).toHaveBeenCalledOnce()
    stopWatches()
    coming.onOpenSession(gamma)
    expect(openSession).toHaveBeenCalledWith(gamma)

    const group = registry.groups[0]!
    expect(group.label()).toBe(en['search.heading'])
    const stopGroup = group.subscribe(() => {})
    await settle()
    const query = (text: string) => ({ text, matches: (value: string) => value.toLowerCase().includes(text) })
    expect(group.results(query('us17123456')).map(result => result.title)).toEqual(['Register watch'])
    expect(group.results(query('digest')).map(result => result.title)).toEqual(['Weekly digest'])
    expect(group.results(query('nothing'))).toEqual([])
    expect(group.results(query('fresh'))).toEqual([])
    group.results(query('digest'))[0]!.open()
    expect(openSession).toHaveBeenLastCalledWith('chat-origin')
    stopGroup()

    stop()
    expect(listeners.get('flowleap-routines/changed')?.size).toBe(0)
    await fiber.dispose()
    await ctx.fiber.dispose()
  })

  it('registers key-identical dictionaries and releases them with its fiber', async () => {
    const ctx = await pluginContext()
    ctx.locale.setLocale('zh')
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const translate = ctx.locale.bind(NS)
    expect(translate('done.action')).toBe(zh['done.action'])
    ctx.locale.setLocale('en')
    expect(translate('done.action')).toBe('Mark as done')
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
    await fiber.dispose()
    expect(translate('done.action')).not.toBe(en['done.action'])
    await ctx.fiber.dispose()
  })
})

describe('ui-flowleap-routines node half', () => {
  it('registers nothing on the host', () => {
    expect(() => { applyNode() }).not.toThrow()
  })
})

/** The global standard seat every root-scope entry receives. */
const standardHook = <T,>(value: T) => <R,>(select: (state: T) => R): R => select(value)
const standard: GlobalStandardProps = {
  useSessions: standardHook<SessionListState>({ ids: [], byId: {}, phase: 'ready', projectionsBySession: {} }),
  useSessionStatus: standardHook(new Map()),
  useSessionRetainInfo: () => undefined,
  usePanelInfo: standardHook({ activePanelId: null }),
  useResource: () => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} }),
  useWorkspaces: standardHook<WorkspaceSnapshot>({ items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null }),
  ...allowAllAccess,
  useContextMenu: contextMenuHook(),
}

describe('routine surfaces on the dashboard', () => {
  it('counts the marked chats and lists the newest ones; each row opens its chat', async () => {
    const { useReviews, stop } = await readySource()
    const metric = render(<WaitingForReviewMetric {...standard} useReviews={useReviews} t={t} />)
    expect(metric.container.textContent).toBe(`2${en['dashboard.metric.caption']}`)
    metric.unmount()
    const onOpenSession = vi.fn()
    const onOpenAll = vi.fn()
    const named: SessionListState = { ...noSessions, ids: [beta], byId: { [beta]: { displayTitle: 'Weekly digest chat' } } as never }
    render(
      <NeedsYourReviewWidget {...standard} useReviews={useReviews} useSessions={select => select(named)} onOpenSession={onOpenSession}
        onOpenAll={onOpenAll}
        t={t} />,
    )
    const rows = within(screen.getByRole('list', { name: en['list.label'] })).getAllByRole('button')
    expect(rows.map(row => row.getAttribute('aria-label'))).toEqual(['Open chat: Weekly digest chat', `Open chat: ${en['row.untitled']}`])
    fireEvent.click(rows[0]!)
    expect(onOpenSession).toHaveBeenCalledWith(beta)
    fireEvent.click(screen.getByRole('button', { name: en['dashboard.widget.all'] }))
    expect(onOpenAll).toHaveBeenCalledOnce()
    stop()
  })

  it('states the loading, empty, and failed marks in the panel', async () => {
    const panel = (useReviews: Parameters<typeof NeedsYourReviewWidget>[0]['useReviews']) => render(
      <NeedsYourReviewWidget {...standard}
        useReviews={useReviews} useSessions={select => select(noSessions)} onOpenSession={vi.fn()} onOpenAll={vi.fn()}
        t={t} />,
    )
    const pending = createReviewsSource(remote({ reviews: vi.fn(() => new Promise<never>(() => {})) }).deps)
    const stopPending = pending.hooks.reviews.subscribe(() => {})
    expect(panel(bindSnapshotSelector(pending.hooks.reviews)).container.textContent).toBe(en['list.loading'])
    cleanup()
    stopPending()
    const empty = await readySource({ reviews: vi.fn(async () => ok([])) })
    expect(panel(empty.useReviews).container.textContent).toBe(en['empty.title'])
    cleanup()
    empty.stop()
    const failed = await readySource({ reviews: vi.fn(async (): Promise<RemoteResult<RoutineReview[]>> => ({ ok: false, error: new RemoteError('gateway/internal', 'Unavailable', {}) })) })
    expect(panel(failed.useReviews).getByRole('alert').textContent).toBe(en['list.error'])
    failed.stop()
  })

  it('counts the different watched applications and shows the next checks with the newest recorded event', async () => {
    const { useWatches, stop } = await readyWatches()
    const metric = render(<CasesWatchedMetric {...standard} useWatches={useWatches} t={t} />)
    expect(metric.container.textContent).toContain('2')
    expect(metric.container.textContent).toContain(en['cases.metric.caption'])
    metric.unmount()
    const onOpenSession = vi.fn()
    render(<ComingUpWidget {...standard} useWatches={useWatches} onOpenSession={onOpenSession} t={t} />)
    const rows = screen.getAllByRole('button')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.getAttribute('aria-label')).toBe('Open the chat of Register watch')
    expect(rows[0]!.textContent).toContain('Next register check: Oct 28, 2026')
    expect(rows[0]!.textContent).toContain('EP3456789: Oct 20, 2026, Renewal fee paid')
    expect(rows[0]!.textContent).toContain('US17123456: no register event read yet')
    expect(screen.getByText(en['comingUp.note'])).toBeTruthy()
    fireEvent.click(rows[0]!)
    expect(onOpenSession).toHaveBeenCalledWith('chat-origin')
    stop()
  })

  it('states loading, an empty watch list, and a failed watch read without a number', async () => {
    const widget = (useWatches: Awaited<ReturnType<typeof readyWatches>>['useWatches']) => (
      <>
        <CasesWatchedMetric {...standard} useWatches={useWatches} t={t} />
        <ComingUpWidget {...standard} useWatches={useWatches} onOpenSession={vi.fn()} t={t} />
      </>
    )
    const loading = createWatchesSource(watchRemote(vi.fn(() => new Promise<never>(() => {}))).deps)
    const stopLoading = loading.subscribe(() => {})
    const first = render(widget(bindSnapshotSelector(loading)))
    expect(first.container.textContent).toContain('…')
    expect(first.container.textContent).toContain(en['list.loading'])
    first.unmount()
    stopLoading()

    const empty = await readyWatches(vi.fn(async () => ok([])))
    const second = render(widget(empty.useWatches))
    expect(second.container.textContent).toContain('0')
    expect(second.container.textContent).toContain(en['comingUp.empty'])
    second.unmount()
    empty.stop()

    const failed = await readyWatches(vi.fn(async (): Promise<RemoteResult<RoutineWatch[]>> => ({ ok: false, error: new RemoteError('gateway/internal', 'Unavailable', {}) })))
    expect(failed.source.getSnapshot()).toEqual({ status: 'error', watches: [] })
    const third = render(widget(failed.useWatches))
    expect(screen.getAllByRole('alert').map(alert => alert.textContent)).toEqual([en['watches.error'], en['watches.error']])
    expect(third.container.textContent).not.toMatch(/\d/u)
    failed.stop()
  })

  it('keeps the watches of the last read when a later read fails or the transport rejects', async () => {
    const read = vi.fn(async (): Promise<RemoteResult<RoutineWatch[]>> => ok(watches))
    const r = watchRemote(read)
    const source = createWatchesSource(r.deps)
    const stop = source.subscribe(() => {})
    await settle()
    read.mockResolvedValueOnce({ ok: false, error: new RemoteError('gateway/internal', 'Unavailable', {}) })
    r.emitChanged()
    await settle()
    expect(source.getSnapshot()).toEqual({ status: 'error', watches })
    read.mockRejectedValueOnce(new Error('transport closed'))
    r.emitReset()
    await settle()
    expect(source.getSnapshot()).toEqual({ status: 'error', watches })
    stop()
    expect(r.listening()).toBe(0)
  })
})

/** Watch Remote double with emitters for the invalidations the watches source listens to. */
function watchRemote(read: WatchesDependencies['watches']) {
  const changed = new Set<() => void>()
  const reset = new Set<() => void>()
  const deps: WatchesDependencies = {
    watches: read,
    subscribeChanged: (listener) => { changed.add(listener); return () => { changed.delete(listener) } },
    subscribeReset: (listener) => { reset.add(listener); return () => { reset.delete(listener) } },
  }
  return {
    deps,
    emitChanged: () => { for (const listener of changed) listener() },
    emitReset: () => { for (const listener of reset) listener() },
    listening: () => changed.size + reset.size,
  }
}

/** A watches source after its first read. */
async function readyWatches(read: WatchesDependencies['watches'] = vi.fn(async () => ok(watches))) {
  const source = createWatchesSource(watchRemote(read).deps)
  const stop = source.subscribe(() => {})
  await settle()
  return { source, stop, useWatches: bindSnapshotSelector(source) }
}
