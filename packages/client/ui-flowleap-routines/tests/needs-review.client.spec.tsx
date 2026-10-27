// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import {
  allowAllAccess, bindSnapshotSelector, makeTranslate, RemoteError, StaticRemoteAccess, stubConfigForm,
} from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { RoutineReview } from '@deepseek-ai/dsh-flowleap-routines/types'
import type { ScheduleCatalogEntry, ScheduleId } from '@deepseek-ai/dsh-schedule/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { apply, inject } from '../src/client/index.ts'
import { en, NS, zh } from '../src/client/locales.ts'
import { MarkDoneAction, NeedsReviewBadge, NeedsReviewFilter, NeedsReviewPanelIcon } from '../src/client/marks.tsx'
import { NeedsReviewPage, type NeedsReviewPageProps } from '../src/client/NeedsReviewPage.tsx'
import { createReviewsSource, type ReviewsDependencies, type ReviewsSource } from '../src/client/reviews-source.ts'

afterEach(() => { cleanup() })

const alpha = 'chat-alpha' as SessionId
const beta = 'chat-beta' as SessionId
const gamma = 'chat-gamma' as SessionId

function review(sessionId: SessionId, taskId: string, since: string, state: RoutineReview['state'] = 'needs_review'): RoutineReview {
  return { sessionId, taskId, state, since }
}

function task(id: string, title: string): ScheduleCatalogEntry {
  return {
    id: id as ScheduleId, sessionId: 'chat-origin' as SessionId, kind: 'daily', status: 'active', title, prompt: title,
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
    const r = remote({ catalog: vi.fn(async () => ({ ok: false, error: new RemoteError('denied') }) as RemoteResult<ScheduleCatalogEntry[]>) })
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
    vi.mocked(r.deps.done).mockResolvedValueOnce({ ok: false, error: new RemoteError('denied') })
    await expect(source.onDone(alpha)).resolves.toBe(false)
    expect(source.hooks.reviews.getSnapshot().pending).toEqual([])
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
    const { container } = render(<NeedsReviewPanelIcon size={16} active={false} useReviews={useReviews} t={t} />)
    expect(container.querySelector('[data-needs-review-count]')?.textContent).toBe('2')
    stop()
    const empty = await readySource({ reviews: vi.fn(async () => ok([])) })
    cleanup()
    const view = render(<NeedsReviewPanelIcon size={16} active={false} useReviews={empty.useReviews} t={t} />)
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
    provider.provide('remote.flowleapRoutines', { reviews: async () => ok(marks), done: async () => ok(undefined) } as never)
    provider.provide('remote.schedule', { catalog: async () => ok(tasks) } as never)
  } }).await()
  ctx.provide('uiWorkspace', { openSession: vi.fn() } as never)
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
    },
  } as never, () => null)
  return ctx
}

const SEATS = [
  'sidebar.session.row.trailing', 'sidebar.panellist', 'main', 'conversation.session.header.utilities', 'schedule.manager.filter',
] as const

describe('ui-flowleap-routines browser half', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'remote', 'remote.flowleapRoutines', 'remote.schedule', 'uiWorkspace', 'remoteAccess'])
  })

  it('registers every surface while the Peer may read the marks and removes them on dispose', async () => {
    for (const allowed of [false, true]) {
      const allows = vi.fn(() => allowed)
      const ctx = await pluginContext(allows)
      const fiber = ctx.plugin({ inject: [...inject], apply })
      await fiber.await()
      expect(allows).toHaveBeenCalledWith('flowleapRoutines/reviews')
      for (const seat of SEATS) expect(ctx.slots.entries(seat)).toHaveLength(allowed ? 1 : 0)
      await fiber.dispose()
      for (const seat of SEATS) expect(ctx.slots.entries(seat)).toEqual([])
      await ctx.fiber.dispose()
    }
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
