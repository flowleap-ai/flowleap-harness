// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { allowAllAccess, bindSnapshotSelector, makeTranslate, stubConfigForm } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { IconFlatListOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { apply, createSearchRegistry, inject } from '../src/client/index.ts'
import { apply as applyNode } from '../src/index.ts'
import { matchesQuery, type DashboardSearch, type DashboardSearchGroup } from '../src/client/contract.ts'
import { en, NS, zh } from '../src/client/locales.ts'
import { DashboardPage, type DashboardPageProps } from '../src/client/DashboardPage.tsx'
import { AgentActivity, chatRows } from '../src/client/widgets.tsx'
import { AgentsPage, ChatsPage } from '../src/client/AppPages.tsx'
import { InstallCard } from '../src/client/InstallCard.tsx'
import {
  AgentsIcon, ChatsIcon, DashboardIcon, PinnedSection, SearchAction,
} from '../src/client/sidebar.tsx'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

const t = makeTranslate(en) as DashboardPageProps['t']

type Row = { id: string; title: string; running?: boolean; blank?: boolean; updatedAt: number }

function sessions(rows: readonly Row[], phase: SessionListState['phase'] = 'ready'): SessionListState {
  const byId = Object.fromEntries(rows.map((row): [string, SessionSummary] => [row.id, {
    id: SessionId(row.id), displayTitle: row.title, running: row.running ?? false, blank: row.blank ?? false,
    updatedAt: row.updatedAt, retainedBy: {},
  }]))
  return { ids: rows.map(row => SessionId(row.id)), byId, phase, projectionsBySession: {} }
}

const entries = (labels: readonly string[]) => labels.map((label, order) => ({ id: label, order, label }))

/** The global standard seat every root-scope entry receives. */
const standardHook = <T,>(value: T) => <R,>(select: (state: T) => R): R => select(value)
function standard(list: SessionListState, pinnedSessionIds: readonly SessionId[] = []): GlobalStandardProps {
  return {
    useSessions: standardHook(list),
    useSessionStatus: standardHook(new Map()),
    useSessionRetainInfo: () => undefined,
    usePanelInfo: standardHook({ activePanelId: null }),
    useResource: () => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} }),
    useWorkspaces: standardHook<WorkspaceSnapshot>({ items: [], archivedSessionIds: [], pinnedSessionIds, state: 'idle', phase: 'ready', error: null }),
    ...allowAllAccess,
  }
}

/** A search group over fixed titles whose results record their opening. */
function group(id: string, order: number, titles: readonly string[], opened: string[] = []): DashboardSearchGroup & { emit: () => void } {
  const listeners = new Set<() => void>()
  let shown = titles
  return {
    id, order, label: () => `${id} group`,
    results: query => shown.filter(title => query.matches(title)).map(title => ({
      id: title, title, ...(title.includes('running') ? { detail: 'Running' } : {}), icon: IconFlatListOutlineRegular,
      open: () => { opened.push(title) },
    })),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    emit: () => {
      shown = [...shown, 'Claim chart added']
      for (const listener of listeners) listener()
    },
  }
}

function pageProps(list: SessionListState, options: { onAsk?: (text: string) => void; groups?: readonly DashboardSearchGroup[] } = {}) {
  const renderSlot = vi.fn<DashboardPageProps['renderSlot']>((name, _props, slot) => <p>{`${name}:${String(slot?.only)}`}</p>)
  const props: DashboardPageProps = {
    ...standard(list),
    useMetrics: bindSnapshotSelector(createSnapshotStore(entries(['Waiting for review']))),
    useWidgets: bindSnapshotSelector(createSnapshotStore(entries(['Needs your review', 'Coming up']))),
    useSearches: bindSnapshotSelector(createSnapshotStore(options.groups ?? [])),
    useFocusRequests: bindSnapshotSelector(createSnapshotStore(0)),
    onAsk: options.onAsk ?? vi.fn(),
    renderSlot,
    t,
  }
  return { props, renderSlot }
}

describe('dashboard page', () => {
  it('shows the first steps on a first sign-in until the user hides them', () => {
    render(<DashboardPage {...pageProps(sessions([{ id: 'blank', title: 'New', blank: true, updatedAt: 1 }])).props} />)
    const steps = screen.getByRole('region', { name: en['firstSteps.title'] })
    expect(within(steps).getAllByRole('listitem')).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: en['firstSteps.hide'] }))
    expect(screen.queryByRole('region', { name: en['firstSteps.title'] })).toBeNull()
    expect(window.localStorage.getItem('flowleap.dashboard.firstStepsHidden')).toBe('true')
  })

  it('shows no first steps after the first chat, frames each card and panel with its label, and shows no sample data', () => {
    const { container } = render(<DashboardPage {...pageProps(sessions([{ id: 'a', title: 'Claim chart', updatedAt: 1 }])).props} />)
    expect(screen.queryByRole('region', { name: en['firstSteps.title'] })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Waiting for review' })).toBeTruthy()
    expect(screen.getByText('dashboard.widget:Coming up')).toBeTruthy()
    expect(screen.getByTestId('flowleap-install')).toBeTruthy()
    expect(container.querySelector('[data-sample-data]')).toBeNull()
  })

  it('opens a new chat with the asked text', () => {
    const onAsk = vi.fn()
    render(<DashboardPage {...pageProps(sessions([]), { onAsk }).props} />)
    fireEvent.change(screen.getByRole('textbox', { name: en['ask.label'] }), { target: { value: '  Summarise EP 1 234 567  ' } })
    fireEvent.click(screen.getByRole('button', { name: en['ask.submit'] }))
    expect(onAsk).toHaveBeenCalledWith('Summarise EP 1 234 567')
  })

  it('shows the results of each group for the trimmed query, five at most, and opens a picked result after it clears the bar', () => {
    const opened: string[] = []
    const chats = group('chats', 10, ['Claim chart EP 1', 'Claim chart running', 'Claim chart EP 3', 'Claim chart EP 4', 'Claim chart EP 5', 'Claim chart EP 6'], opened)
    const agents = group('agents', 20, ['Opposition watcher'], opened)
    render(<DashboardPage {...pageProps(sessions([]), { groups: [chats, agents] }).props} />)
    const bar = screen.getByRole('textbox', { name: en['ask.label'] })
    expect(screen.queryByTestId('flowleap-search-results')).toBeNull()
    fireEvent.change(bar, { target: { value: ' claim CHART ' } })
    const results = screen.getByRole('region', { name: en['search.label'] })
    expect(within(results).getByText(en['search.hint'])).toBeTruthy()
    const chatGroup = within(results).getByRole('region', { name: 'chats group' })
    expect(within(chatGroup).getByRole('heading', { name: 'chats group' })).toBeTruthy()
    expect(within(chatGroup).getAllByRole('button')).toHaveLength(5)
    expect(within(chatGroup).getByText('Running')).toBeTruthy()
    expect(within(results).queryByRole('region', { name: 'agents group' })).toBeNull()
    fireEvent.click(within(chatGroup).getByRole('button', { name: /Claim chart EP 3/u }))
    expect(opened).toEqual(['Claim chart EP 3'])
    expect((bar as HTMLInputElement).value).toBe('')
    expect(screen.queryByTestId('flowleap-search-results')).toBeNull()
    fireEvent.change(bar, { target: { value: 'added' } })
    expect(screen.queryByRole('region', { name: 'chats group' })).toBeNull()
    act(() => { chats.emit() })
    expect(screen.getByRole('button', { name: /Claim chart added/u })).toBeTruthy()
    fireEvent.keyDown(bar, { key: 'Escape' })
    expect((bar as HTMLInputElement).value).toBe('')
    fireEvent.keyDown(bar, { key: 'Escape' })
    fireEvent.keyDown(bar, { key: 'Enter' })
  })
})

describe('dashboard search', () => {
  it('matches when each word of the query is in the text, without regard to case', () => {
    expect(matchesQuery('Claim chart for EP 1 234 567', 'claim EP')).toBe(true)
    expect(matchesQuery('Claim chart', 'claim opposition')).toBe(false)
  })

  it('keeps the registered groups in order and removes each on its disposer', () => {
    const { registry, groups } = createSearchRegistry()
    const second = registry.register(group('second', 20, []))
    const first = registry.register(group('first', 10, []))
    expect(groups.getSnapshot().map(item => item.id)).toEqual(['first', 'second'])
    second()
    first()
    expect(groups.getSnapshot()).toEqual([])
  })
})

describe('dashboard panels', () => {
  it('lists the user chats running first, then the most recent, without blank or subagent chats', () => {
    const list = sessions([
      { id: 'old', title: 'Old', updatedAt: 1 },
      { id: 'new', title: 'New', updatedAt: 3 },
      { id: 'run', title: 'Run', running: true, updatedAt: 2 },
      { id: 'blank', title: 'Blank', blank: true, updatedAt: 4 },
    ])
    expect(chatRows(list).map(row => row.id)).toEqual(['run', 'new', 'old'])
  })
})

/** The ui-workspace face the dashboard uses; each provide records its disposer. */
function workspaceDouble() {
  return {
    openSession: vi.fn(),
    startSession: vi.fn(),
    provideSearch: vi.fn((_open: () => void) => vi.fn()),
    provideLanding: vi.fn((_panelId: string) => vi.fn()),
  }
}

async function pluginContext(list: SessionListState) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const workspace = workspaceDouble()
  const panelInfo = createSnapshotStore<{ activePanelId: string | null }>({ activePanelId: null })
  const layout = { selectPanel: vi.fn((id: string | null) => { panelInfo.set({ activePanelId: id }) }), panelInfo }
  const sessionList = createSnapshotStore(list)
  ctx.provide('uiWorkspace', workspace as never)
  ctx.provide('layout', layout as never)
  ctx.provide('sessions', { list: sessionList } as never)
  ctx.provide('remote', { $on: () => () => {} } as never)
  ctx.provide('configForms', { developerTools: { enabled: createSnapshotStore(true) }, get: () => stubConfigForm().scope } as never)
  await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
  ctx.slots.register({
    name: 'root',
    children: {
      main: { kind: 'keyed', scope: 'root' },
      'sidebar.panellist': { kind: 'list', scope: 'root' },
      'sidebar.actions': { kind: 'list', scope: 'root' },
      'sidebar.sections': { kind: 'list', scope: 'root' },
    },
  } as never, () => null)
  return { ctx, workspace, layout, panelInfo, sessionList }
}

describe('ui-flowleap-dashboard browser half', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'layout', 'sessions', 'uiWorkspace'])
  })

  it('provides the landing page, its slots, the search registry with the Chats group, the sidebar layers, and the Search command, and removes everything on dispose', async () => {
    const { ctx, workspace, layout, sessionList } = await pluginContext(sessions([
      { id: 'a', title: 'Claim chart EP 1', updatedAt: 2 },
      { id: 'b', title: 'Claim chart EP 2', running: true, updatedAt: 1 },
      { id: 'c', title: 'Opposition', updatedAt: 3 },
    ]))
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(workspace.provideLanding).toHaveBeenCalledExactlyOnceWith('flowleap-dashboard')
    expect(ctx.slots.entries('main')).toHaveLength(3)
    expect(ctx.slots.entries('sidebar.panellist').map(entry => entry.options.id)).toEqual(['flowleap-dashboard', 'flowleap-chats', 'flowleap-agents'])
    expect(ctx.slots.entries('sidebar.actions')).toHaveLength(1)
    expect(ctx.slots.entries('sidebar.sections')).toHaveLength(1)
    expect(ctx.slots.entries('dashboard.metric')).toHaveLength(0)
    expect(ctx.slots.entries('dashboard.widget')).toHaveLength(1)

    const page = ctx.slots.entries('main').find(entry => entry.options.key === 'flowleap-dashboard')!.inject!() as {
      onAsk: (text: string) => void
      hooks: {
        widgets: { getSnapshot: () => readonly { label: string }[] }
        searches: { getSnapshot: () => readonly DashboardSearchGroup[] }
        focusRequests: { getSnapshot: () => number }
      }
    }
    expect(page.hooks.widgets.getSnapshot().map(entry => entry.label)).toEqual([en['widget.activity']])
    const registry = ctx.get('dashboardSearch') as DashboardSearch
    expect(page.hooks.searches.getSnapshot()).toHaveLength(1)
    const chats = page.hooks.searches.getSnapshot()[0]!
    expect(chats.label()).toBe(en['search.chats'])
    const changed = vi.fn()
    const stop = chats.subscribe(changed)
    sessionList.set({ ...sessionList.getSnapshot() })
    expect(changed).toHaveBeenCalled()
    stop()
    const found = chats.results({ text: 'claim', matches: value => matchesQuery(value, 'claim') })
    expect(found.map(result => [result.title, result.detail])).toEqual([['Claim chart EP 2', en['activity.running']], ['Claim chart EP 1', undefined]])
    found[1]!.open()
    expect(workspace.openSession).toHaveBeenCalledWith('a')
    const other = registry.register(group('agents', 20, []))
    expect(page.hooks.searches.getSnapshot().map(item => item.id)).toEqual(['flowleap-chats', 'agents'])
    other()

    page.onAsk('Watch EP 1')
    expect(workspace.startSession).toHaveBeenCalledWith(undefined, { prompt: 'Watch EP 1' })
    page.onAsk('')
    expect(workspace.startSession).toHaveBeenLastCalledWith(undefined, undefined)
    const searchAction = ctx.slots.entries('sidebar.actions')[0]!.inject!() as { onSearch: () => void }
    searchAction.onSearch()
    expect(layout.selectPanel).toHaveBeenLastCalledWith('flowleap-dashboard')
    expect(page.hooks.focusRequests.getSnapshot()).toBe(1)
    expect(workspace.provideSearch).toHaveBeenCalledOnce()
    workspace.provideSearch.mock.calls[0]![0]()
    expect(page.hooks.focusRequests.getSnapshot()).toBe(2)
    expect(ctx.locale.bind(NS)('panel.dashboard')).toBe(en['panel.dashboard'])

    await fiber.dispose()
    expect(workspace.provideSearch.mock.results[0]!.value).toHaveBeenCalledOnce()
    expect(workspace.provideLanding.mock.results[0]!.value).toHaveBeenCalledOnce()
    expect(page.hooks.searches.getSnapshot()).toEqual([])
    for (const seat of ['main', 'sidebar.panellist', 'sidebar.actions', 'sidebar.sections'] as const) {
      expect(ctx.slots.entries(seat)).toEqual([])
    }
    await ctx.fiber.dispose()
  })
})

describe('dashboard page, first steps and focus', () => {
  it('runs each first step: focus the bar, open an empty chat for an agent, and ask to watch a patent', () => {
    const onAsk = vi.fn()
    render(<DashboardPage {...pageProps(sessions([]), { onAsk }).props} />)
    const steps = within(screen.getByRole('region', { name: en['firstSteps.title'] })).getAllByRole('listitem')
      .map(item => within(item).getByRole('button'))
    fireEvent.click(steps[0]!)
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: en['ask.label'] }))
    fireEvent.click(steps[1]!)
    expect(onAsk).toHaveBeenLastCalledWith('')
    fireEvent.click(steps[2]!)
    expect(onAsk).toHaveBeenLastCalledWith(en['firstSteps.watch.prompt'])
  })

  it('greets by the time of day', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      for (const [hour, key] of [[9, 'greeting.morning'], [14, 'greeting.afternoon'], [20, 'greeting.evening']] as const) {
        vi.setSystemTime(new Date(2026, 9, 29, hour))
        render(<DashboardPage {...pageProps(sessions([])).props} />)
        expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(en[key])
        cleanup()
      }
    } finally { vi.useRealTimers() }
  })

  it('focuses the bar when the Search command asks', () => {
    const { props } = pageProps(sessions([]))
    render(<DashboardPage {...props} useFocusRequests={bindSnapshotSelector(createSnapshotStore(1))} />)
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: en['ask.label'] }))
  })

  it('shows the first steps and hides them for this page load when browser storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    try {
      render(<DashboardPage {...pageProps(sessions([])).props} />)
      fireEvent.click(screen.getByRole('button', { name: en['firstSteps.hide'] }))
      expect(screen.queryByRole('region', { name: en['firstSteps.title'] })).toBeNull()
    } finally { vi.restoreAllMocks() }
  })
})

describe('dashboard surfaces', () => {
  const list = sessions([
    { id: 'a', title: 'Claim chart', updatedAt: Date.UTC(2026, 9, 1) },
    { id: 'b', title: 'Opposition', running: true, updatedAt: Date.UTC(2026, 9, 2) },
  ])

  it('lists running and recent chats in Agent activity and opens one', () => {
    const onOpenSession = vi.fn()
    render(<AgentActivity {...standard(list)} onOpenSession={onOpenSession} t={t} />)
    const rows = screen.getAllByRole('button')
    expect(rows[0]!.textContent).toContain(en['activity.running'])
    expect(rows[1]!.textContent).toContain(en['activity.idle'])
    fireEvent.click(rows[1]!)
    expect(onOpenSession).toHaveBeenCalledWith('a')
  })

  it('states loading and the empty list', () => {
    const activity = (state: SessionListState) => render(<AgentActivity {...standard(state)} onOpenSession={vi.fn()} t={t} />)
    expect(activity(sessions([], 'pending')).getByRole('status').textContent).toBe(en['activity.loading'])
    cleanup()
    expect(activity(sessions([])).container.textContent).toBe(en['activity.empty'])
  })

  it('shows every chat on the Chats page and starts a chat from the Agents page', () => {
    const onOpenSession = vi.fn()
    render(<ChatsPage {...standard(list)} onOpenSession={onOpenSession} t={t} />)
    expect(screen.getByRole('heading', { name: en['chats.title'] })).toBeTruthy()
    expect(screen.getAllByRole('button')).toHaveLength(2)
    cleanup()
    const onNewChat = vi.fn()
    render(<AgentsPage {...standard(sessions([]))} onNewChat={onNewChat} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: en['placeholder.newAgent'] }))
    expect(onNewChat).toHaveBeenCalledOnce()
  })

  it('offers the browser install prompt while the browser offers one', () => {
    render(<InstallCard t={t} />)
    expect(screen.getByText(en['install.browser.manual'])).toBeTruthy()
    const prompt = vi.fn(async () => {})
    const offer = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt })
    act(() => { window.dispatchEvent(offer) })
    expect(offer.defaultPrevented).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: en['install.browser.action'] }))
    expect(prompt).toHaveBeenCalledOnce()
    act(() => { window.dispatchEvent(new Event('appinstalled')) })
    expect(screen.queryByRole('button', { name: en['install.browser.action'] })).toBeNull()
  })

  it('draws the Search row, the app glyphs, and the Pinned section; the rail shows no section', () => {
    const classes = { rowClassName: 'row', activeRowClassName: 'active', glyphClassName: 'glyph', titleClassName: 'title' }
    const onSearch = vi.fn()
    const wide = render(<SearchAction {...{ ...classes, wide: true, onSearch, t }} />)
    fireEvent.click(wide.getByRole('button', { name: en['sidebar.search'] }))
    expect(onSearch).toHaveBeenCalledOnce()
    expect(wide.container.textContent).toBe(en['sidebar.search'])
    cleanup()
    expect(render(<SearchAction {...{ ...classes, wide: false, onSearch, t }} />).container.textContent).toBe('')
    cleanup()
    for (const Icon of [DashboardIcon, ChatsIcon, AgentsIcon]) expect(render(<Icon size={16} />).container.querySelector('svg')).toBeTruthy()
    cleanup()
    const onOpenSession = vi.fn()
    const pinned = (wideColumn: boolean, ids: string[]) => {
      const { useSessions, useWorkspaces } = standard(list, ids.map(id => SessionId(id)))
      return render(
        <PinnedSection
          {...classes} wide={wideColumn} useSessions={useSessions} useWorkspaces={useWorkspaces} onOpenSession={onOpenSession} t={t}
        />,
      )
    }
    const section = pinned(true, ['b', 'gone'])
    fireEvent.click(section.getByRole('button', { name: 'Opposition' }))
    expect(onOpenSession).toHaveBeenCalledWith('b')
    cleanup()
    expect(pinned(true, []).getByText(en['sidebar.pinned.empty'])).toBeTruthy()
    cleanup()
    expect(pinned(false, ['b']).container.innerHTML).toBe('')
  })
})

describe('ui-flowleap-dashboard registrations', () => {
  it('injects the open actions of the app pages and the Pinned section, and labels each launcher', async () => {
    const { ctx, workspace } = await pluginContext(sessions([]))
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const page = (key: string) => ctx.slots.entries('main').find(entry => entry.options.key === key)!.inject!() as Record<string, (id?: SessionId) => void>
    page('flowleap-chats').onOpenSession!(SessionId('c1'))
    expect(workspace.openSession).toHaveBeenCalledWith('c1')
    page('flowleap-agents').onNewChat!()
    expect(workspace.startSession).toHaveBeenCalledWith()
    const pinned = ctx.slots.entries('sidebar.sections')[0]!.inject!() as { onOpenSession: (id: SessionId) => void }
    pinned.onOpenSession(SessionId('c2'))
    expect(workspace.openSession).toHaveBeenCalledWith('c2')
    const activity = ctx.slots.entries('dashboard.widget')[0]!.inject!() as { onOpenSession: (id: SessionId) => void }
    activity.onOpenSession(SessionId('c3'))
    expect(workspace.openSession).toHaveBeenCalledWith('c3')
    expect(ctx.slots.entries('sidebar.panellist').map(entry => (entry.options.label as () => string)()))
      .toEqual([en['panel.dashboard'], en['panel.chats'], en['panel.agents']])
    const widgets = (ctx.slots.entries('main').find(entry => entry.options.key === 'flowleap-dashboard')!.inject!() as {
      hooks: { widgets: { getSnapshot: () => readonly { label: string }[] } }
    }).hooks.widgets
    ctx.locale.setLocale('zh')
    await vi.waitFor(() => { expect(widgets.getSnapshot().map(entry => entry.label)).toEqual([zh['widget.activity']]) })
    const metrics = (ctx.slots.entries('main').find(entry => entry.options.key === 'flowleap-dashboard')!.inject!() as {
      hooks: { metrics: { getSnapshot: () => readonly { id: string; order: number; label: string }[] } }
    }).hooks.metrics
    const bare = ctx.slots.register({ name: 'dashboard.metric', id: 'bare' }, () => null)
    const first = ctx.slots.register({ name: 'dashboard.metric', id: 'first', order: -1, label: () => 'First' }, () => null)
    await vi.waitFor(() => {
      expect(metrics.getSnapshot()).toEqual([{ id: 'first', order: -1, label: 'First' }, { id: 'bare', order: 0, label: 'bare' }])
    })
    first()
    bare()
    await vi.waitFor(() => { expect(metrics.getSnapshot()).toEqual([]) })
    await fiber.dispose()
    await ctx.fiber.dispose()
  })
})

describe('ui-flowleap-dashboard node half', () => {
  it('registers nothing on the host', () => {
    expect(() => { applyNode() }).not.toThrow()
  })
})
