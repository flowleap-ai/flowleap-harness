// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { bindSnapshotSelector, makeTranslate, stubConfigForm } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { apply, inject } from '../src/client/index.ts'
import { apply as applyNode } from '../src/index.ts'
import { matchesQuery, type DashboardSearchOwnerProps } from '../src/client/contract.ts'
import { readDeepLink, writeDeepLink } from '../src/client/deep-link.ts'
import { en, NS, zh } from '../src/client/locales.ts'
import { DashboardPage, type DashboardPageProps } from '../src/client/DashboardPage.tsx'
import { AgentActivity, chatRows, ChatSearch, type AgentActivityProps, type ChatSearchProps } from '../src/client/widgets.tsx'
import { AgentsPage, ChatsPage, type AgentsPageProps, type ChatsPageProps } from '../src/client/AppPages.tsx'
import { InstallCard } from '../src/client/InstallCard.tsx'
import {
  AgentsIcon, ChatsIcon, DashboardIcon, PinnedSection, SearchAction, type PinnedSectionProps, type SearchActionProps,
} from '../src/client/sidebar.tsx'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  window.history.replaceState(null, '', '/')
})

const t = makeTranslate(en) as DashboardPageProps['t']

type Row = { id: string; title: string; running?: boolean; blank?: boolean; updatedAt: number; mainView?: boolean }

function sessions(rows: readonly Row[], phase: SessionListState['phase'] = 'ready'): SessionListState {
  const byId = Object.fromEntries(rows.map(row => [row.id, {
    id: row.id, displayTitle: row.title, running: row.running ?? false, blank: row.blank ?? false, updatedAt: row.updatedAt,
    retainedBy: row.mainView === true ? { mainView: 1 } : {},
  }]))
  return { ids: rows.map(row => row.id as SessionId), byId, phase, projectionsBySession: {} } as never
}

const entries = (labels: readonly string[]) => labels.map((label, order) => ({ id: label, order, label }))

function pageProps(list: SessionListState, options: { onAsk?: (text: string) => void; links?: readonly string[] } = {}) {
  const renderSlot = vi.fn((name: string, props: Partial<DashboardSearchOwnerProps>, slot: { only: string }) => (
    name === 'dashboard.search'
      ? <button type="button" onClick={props.onPicked}>{`${slot.only}:${props.query}:${String(props.matches?.('Claim chart EP 1'))}`}</button>
      : <p>{`${name}:${slot.only}`}</p>
  ))
  const props = {
    useMetrics: bindSnapshotSelector(createSnapshotStore(entries(['Waiting for review']))),
    useWidgets: bindSnapshotSelector(createSnapshotStore(entries(['Needs your review', 'Coming up']))),
    useLinks: bindSnapshotSelector(createSnapshotStore(entries(options.links ?? []))),
    useSearches: bindSnapshotSelector(createSnapshotStore(entries(['chats', 'agents']))),
    useFocusRequests: bindSnapshotSelector(createSnapshotStore(0)),
    useSessions: bindSnapshotSelector(createSnapshotStore(list)),
    onAsk: options.onAsk ?? vi.fn(),
    renderSlot,
    t,
  } as never as DashboardPageProps
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

  it('shows each search group with the trimmed query while the bar holds text, and clears it on a pick or Escape', () => {
    render(<DashboardPage {...pageProps(sessions([])).props} />)
    const bar = screen.getByRole('textbox', { name: en['ask.label'] })
    expect(screen.queryByTestId('flowleap-search-results')).toBeNull()
    fireEvent.change(bar, { target: { value: ' claim ep ' } })
    const results = screen.getByRole('region', { name: en['search.label'] })
    expect(within(results).getByText(en['search.hint'])).toBeTruthy()
    fireEvent.click(within(results).getByRole('button', { name: 'agents:claim ep:true' }))
    expect(screen.queryByTestId('flowleap-search-results')).toBeNull()
    fireEvent.change(bar, { target: { value: 'nothing' } })
    expect(screen.getByRole('button', { name: 'chats:nothing:false' })).toBeTruthy()
    fireEvent.keyDown(bar, { key: 'Escape' })
    expect((bar as HTMLInputElement).value).toBe('')
    fireEvent.keyDown(bar, { key: 'Escape' })
    fireEvent.keyDown(bar, { key: 'Enter' })
  })

  it('shows the app link row only while an app registers a link', () => {
    const { unmount } = render(<DashboardPage {...pageProps(sessions([])).props} />)
    expect(screen.queryByRole('navigation', { name: en['links.label'] })).toBeNull()
    unmount()
    render(<DashboardPage {...pageProps(sessions([]), { links: ['office'] }).props} />)
    expect(within(screen.getByRole('navigation', { name: en['links.label'] })).getByText('dashboard.link:office')).toBeTruthy()
  })
})

describe('dashboard search', () => {
  it('matches when each word of the query is in the text, without regard to case', () => {
    expect(matchesQuery('Claim chart for EP 1 234 567', 'claim EP')).toBe(true)
    expect(matchesQuery('Claim chart', 'claim opposition')).toBe(false)
  })

  it('lists the matching chats, running first, and opens the picked chat', () => {
    const onOpenSession = vi.fn()
    const onPicked = vi.fn()
    const list = sessions([
      { id: 'a', title: 'Claim chart EP 1', updatedAt: 2 },
      { id: 'b', title: 'Claim chart EP 2', running: true, updatedAt: 1 },
      { id: 'c', title: 'Opposition', updatedAt: 3 },
    ])
    const props = {
      query: 'claim', matches: (text: string) => matchesQuery(text, 'claim'), onPicked, onOpenSession, t,
      useSessions: bindSnapshotSelector(createSnapshotStore(list)),
    } as never as ChatSearchProps
    render(<ChatSearch {...props} />)
    const group = screen.getByRole('region', { name: en['search.chats'] })
    const rows = within(group).getAllByRole('button')
    expect(rows.map(row => row.getAttribute('aria-label'))).toEqual(['Open chat: Claim chart EP 2', 'Open chat: Claim chart EP 1'])
    expect(within(group).getByText(en['activity.running'])).toBeTruthy()
    fireEvent.click(rows[1]!)
    expect(onPicked).toHaveBeenCalledOnce()
    expect(onOpenSession).toHaveBeenCalledWith('a')
  })

  it('renders nothing when no chat matches', () => {
    const props = {
      query: 'zzz', matches: () => false, onPicked: vi.fn(), onOpenSession: vi.fn(), t,
      useSessions: bindSnapshotSelector(createSnapshotStore(sessions([{ id: 'a', title: 'A', updatedAt: 1 }]))),
    } as never as ChatSearchProps
    const { container } = render(<ChatSearch {...props} />)
    expect(container.innerHTML).toBe('')
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

describe('deep links', () => {
  it('reads a chat before a page and ignores empty values', () => {
    expect(readDeepLink('?chat=s1&page=p1')).toEqual({ kind: 'chat', id: 's1' })
    expect(readDeepLink('?page=p1')).toEqual({ kind: 'page', id: 'p1' })
    expect(readDeepLink('?chat=&page=')).toBeUndefined()
    expect(readDeepLink('')).toBeUndefined()
  })

  it('writes the item and keeps other parameters and the fragment', () => {
    expect(writeDeepLink('https://firm.test/?lang=de&page=x#top', { kind: 'chat', id: 's 1' })).toBe('https://firm.test/?lang=de&chat=s+1#top')
    expect(writeDeepLink('https://firm.test/?chat=s1', undefined)).toBe('https://firm.test/')
  })
})

async function pluginContext(list: SessionListState) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const workspace = { openSession: vi.fn(), startSession: vi.fn(), provideSearch: vi.fn(() => vi.fn()) }
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

  it('lands on the dashboard, fills its slots and the sidebar layers, takes the Search command, and removes everything on dispose', async () => {
    const { ctx, workspace, layout } = await pluginContext(sessions([]))
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    await vi.waitFor(() => { expect(layout.selectPanel).toHaveBeenCalledWith('flowleap-dashboard') })
    expect(window.location.search).toBe('')
    expect(ctx.slots.entries('main')).toHaveLength(3)
    expect(ctx.slots.entries('sidebar.panellist').map(entry => entry.options.id)).toEqual(['flowleap-dashboard', 'flowleap-chats', 'flowleap-agents'])
    expect(ctx.slots.entries('sidebar.actions')).toHaveLength(1)
    expect(ctx.slots.entries('sidebar.sections')).toHaveLength(1)
    expect(ctx.slots.entries('dashboard.metric')).toHaveLength(0)
    expect(ctx.slots.entries('dashboard.widget')).toHaveLength(1)
    expect(ctx.slots.entries('dashboard.search')).toHaveLength(1)

    const page = ctx.slots.entries('main').find(entry => entry.options.key === 'flowleap-dashboard')!.inject!() as {
      onAsk: (text: string) => void
      hooks: {
        widgets: { getSnapshot: () => readonly { label: string }[] }
        searches: { getSnapshot: () => readonly { label: string }[] }
        focusRequests: { getSnapshot: () => number }
      }
    }
    expect(page.hooks.widgets.getSnapshot().map(entry => entry.label)).toEqual([en['widget.activity']])
    expect(page.hooks.searches.getSnapshot().map(entry => entry.label)).toEqual([en['search.chats']])
    page.onAsk('Watch EP 1')
    expect(workspace.startSession).toHaveBeenCalledWith(undefined, { prompt: 'Watch EP 1' })
    page.onAsk('')
    expect(workspace.startSession).toHaveBeenLastCalledWith(undefined, undefined)
    const searchAction = ctx.slots.entries('sidebar.actions')[0]!.inject!() as { onSearch: () => void }
    searchAction.onSearch()
    expect(layout.selectPanel).toHaveBeenLastCalledWith('flowleap-dashboard')
    expect(page.hooks.focusRequests.getSnapshot()).toBe(1)
    expect(workspace.provideSearch).toHaveBeenCalledOnce()
    const openSearch = workspace.provideSearch.mock.calls[0]![0] as unknown as () => void
    openSearch()
    expect(page.hooks.focusRequests.getSnapshot()).toBe(2)
    const chatSearch = ctx.slots.entries('dashboard.search')[0]!.inject!() as { onOpenSession: (id: SessionId) => void }
    chatSearch.onOpenSession('s1' as SessionId)
    expect(workspace.openSession).toHaveBeenCalledWith('s1')
    expect(ctx.locale.bind(NS)('panel.dashboard')).toBe(en['panel.dashboard'])

    await fiber.dispose()
    expect(workspace.provideSearch.mock.results[0]!.value).toHaveBeenCalledOnce()
    for (const seat of ['main', 'sidebar.panellist', 'sidebar.actions', 'sidebar.sections'] as const) {
      expect(ctx.slots.entries(seat)).toEqual([])
    }
    await ctx.fiber.dispose()
  })

  it('shows the dashboard at once, opens the chat of a deep link when the Session list is ready, then keeps the address equal to the open item', async () => {
    window.history.replaceState(null, '', '/?chat=s1&lang=de')
    const { ctx, workspace, layout, panelInfo, sessionList } = await pluginContext(sessions([], 'loading'))
    workspace.openSession.mockImplementation(() => { panelInfo.set({ activePanelId: null }) })
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    await vi.waitFor(() => { expect(layout.selectPanel).toHaveBeenCalledWith('flowleap-dashboard') })
    expect(workspace.openSession).not.toHaveBeenCalled()
    sessionList.set(sessions([{ id: 'other', title: 'Other', updatedAt: 2 }, { id: 's1', title: 'Claim chart', updatedAt: 1, mainView: true }]))
    expect(workspace.openSession).toHaveBeenCalledOnce()
    expect(workspace.openSession).toHaveBeenCalledWith('s1')
    expect(window.location.search).toBe('?lang=de&chat=s1')
    panelInfo.set({ activePanelId: 'flowleap-chats' })
    expect(window.location.search).toBe('?lang=de&page=flowleap-chats')
    panelInfo.set({ activePanelId: 'flowleap-dashboard' })
    expect(window.location.search).toBe('?lang=de')
    panelInfo.set({ activePanelId: null })
    sessionList.set(sessions([{ id: 's1', title: 'Claim chart', updatedAt: 1, blank: true, mainView: true }]))
    expect(window.location.search).toBe('?lang=de')
    expect(layout.selectPanel).toHaveBeenCalledOnce()
    await fiber.dispose()
    await ctx.fiber.dispose()
  })

  it('keeps the dashboard for a missing chat or page', async () => {
    for (const address of ['/?page=gone', '/?chat=gone']) {
      window.history.replaceState(null, '', address)
      const { ctx, workspace, layout } = await pluginContext(sessions([{ id: 's1', title: 'A', updatedAt: 1, mainView: true }]))
      const fiber = ctx.plugin({ inject: [...inject], apply })
      await fiber.await()
      await vi.waitFor(() => { expect(layout.selectPanel).toHaveBeenCalledWith('flowleap-dashboard') })
      await new Promise(resolve => setTimeout(resolve, 5))
      expect(layout.selectPanel.mock.calls.map(([id]) => id)).toEqual(['flowleap-dashboard'])
      expect(workspace.openSession).not.toHaveBeenCalled()
      expect(window.location.search).toBe('')
      await fiber.dispose()
      await ctx.fiber.dispose()
    }
  })

  it('selects a linked page once it is registered and the start restoration opened its chat, unless the user left the dashboard', async () => {
    for (const leave of [false, true]) {
      window.history.replaceState(null, '', '/?page=late-page')
      const { ctx, layout, panelInfo, sessionList } = await pluginContext(sessions([]))
      const fiber = ctx.plugin({ inject: [...inject], apply })
      await fiber.await()
      await vi.waitFor(() => { expect(layout.selectPanel).toHaveBeenCalledWith('flowleap-dashboard') })
      const dispose = ctx.slots.register({ name: 'main', key: 'late-page' } as never, () => null)
      sessionList.set(sessions([{ id: 'other', title: 'Other', updatedAt: 1 }]))
      await new Promise(resolve => setTimeout(resolve, 5))
      expect(layout.selectPanel.mock.calls.map(([id]) => id)).toEqual(['flowleap-dashboard'])
      if (leave) panelInfo.set({ activePanelId: 'flowleap-chats' })
      sessionList.set(sessions([{ id: 'blank', title: 'New', blank: true, updatedAt: 1, mainView: true }]))
      expect(layout.selectPanel.mock.calls.map(([id]) => id)).toEqual(leave ? ['flowleap-dashboard'] : ['flowleap-dashboard', 'late-page'])
      dispose()
      await fiber.dispose()
      await ctx.fiber.dispose()
    }
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
    const props = { useSessions: bindSnapshotSelector(createSnapshotStore(list)), onOpenSession, t } as never as AgentActivityProps
    render(<AgentActivity {...props} />)
    const rows = screen.getAllByRole('button')
    expect(rows[0]!.textContent).toContain(en['activity.running'])
    expect(rows[1]!.textContent).toContain(en['activity.idle'])
    fireEvent.click(rows[1]!)
    expect(onOpenSession).toHaveBeenCalledWith('a')
  })

  type ActivityProps = AgentActivityProps

  it('states loading and the empty list', () => {
    const activity = (state: SessionListState) => {
      const props = { useSessions: bindSnapshotSelector(createSnapshotStore(state)), onOpenSession: vi.fn(), t } as never as ActivityProps
      return render(<AgentActivity {...props} />)
    }
    expect(activity(sessions([], 'loading')).getByRole('status').textContent).toBe(en['activity.loading'])
    cleanup()
    expect(activity(sessions([])).container.textContent).toBe(en['activity.empty'])
  })

  it('shows every chat on the Chats page and starts a chat from the Agents page', () => {
    const onOpenSession = vi.fn()
    render(<ChatsPage {...{ useSessions: bindSnapshotSelector(createSnapshotStore(list)), onOpenSession, t } as never as ChatsPageProps} />)
    expect(screen.getByRole('heading', { name: en['chats.title'] })).toBeTruthy()
    expect(screen.getAllByRole('button')).toHaveLength(2)
    cleanup()
    const onNewChat = vi.fn()
    render(<AgentsPage {...{ onNewChat, t } as never as AgentsPageProps} />)
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
    const classes = { rowClassName: 'row', glyphClassName: 'glyph', titleClassName: 'title' }
    const onSearch = vi.fn()
    const wide = render(<SearchAction {...{ ...classes, wide: true, onSearch, t } as never as SearchActionProps} />)
    fireEvent.click(wide.getByRole('button', { name: en['sidebar.search'] }))
    expect(onSearch).toHaveBeenCalledOnce()
    expect(wide.container.textContent).toBe(en['sidebar.search'])
    cleanup()
    expect(render(<SearchAction {...{ ...classes, wide: false, onSearch, t } as never as SearchActionProps} />).container.textContent).toBe('')
    cleanup()
    for (const Icon of [DashboardIcon, ChatsIcon, AgentsIcon]) expect(render(<Icon size={16} />).container.querySelector('svg')).toBeTruthy()
    cleanup()
    const workspaces = (pinnedSessionIds: string[]) => bindSnapshotSelector(createSnapshotStore({ pinnedSessionIds }))
    const onOpenSession = vi.fn()
    const pinned = (wideColumn: boolean, ids: string[]) => render(<PinnedSection {...{
      ...classes, wide: wideColumn, useWorkspaces: workspaces(ids), useSessions: bindSnapshotSelector(createSnapshotStore(list)),
      onOpenSession, t,
    } as never as PinnedSectionProps} />)
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
    page('flowleap-chats').onOpenSession!('c1' as SessionId)
    expect(workspace.openSession).toHaveBeenCalledWith('c1')
    page('flowleap-agents').onNewChat!()
    expect(workspace.startSession).toHaveBeenCalledWith()
    const pinned = ctx.slots.entries('sidebar.sections')[0]!.inject!() as { onOpenSession: (id: SessionId) => void }
    pinned.onOpenSession('c2' as SessionId)
    expect(workspace.openSession).toHaveBeenCalledWith('c2')
    const activity = ctx.slots.entries('dashboard.widget')[0]!.inject!() as { onOpenSession: (id: SessionId) => void }
    activity.onOpenSession('c3' as SessionId)
    expect(workspace.openSession).toHaveBeenCalledWith('c3')
    expect(ctx.slots.entries('sidebar.panellist').map(entry => (entry.options.label as () => string)()))
      .toEqual([en['panel.dashboard'], en['panel.chats'], en['panel.agents']])
    const searches = (ctx.slots.entries('main').find(entry => entry.options.key === 'flowleap-dashboard')!.inject!() as {
      hooks: { searches: { getSnapshot: () => readonly { label: string }[] } }
    }).hooks.searches
    ctx.locale.setLocale('zh')
    await vi.waitFor(() => { expect(searches.getSnapshot().map(entry => entry.label)).toEqual([zh['search.chats']]) })
    const dashboard = ctx.slots.entries('main').find(entry => entry.options.key === 'flowleap-dashboard')!.inject!() as {
      hooks: { links: { getSnapshot: () => readonly { id: string; order: number; label: string }[] } }
    }
    const dispose = ctx.slots.register({ name: 'dashboard.link', id: 'bare' } as never, () => null)
    const first = ctx.slots.register({ name: 'dashboard.link', id: 'first', order: -1, label: () => 'First' } as never, () => null)
    await vi.waitFor(() => {
      expect(dashboard.hooks.links.getSnapshot()).toEqual([{ id: 'first', order: -1, label: 'First' }, { id: 'bare', order: 0, label: 'bare' }])
    })
    first()
    dispose()
    await vi.waitFor(() => { expect(dashboard.hooks.links.getSnapshot()).toEqual([]) })
    await fiber.dispose()
    await ctx.fiber.dispose()
  })
})

describe('ui-flowleap-dashboard node half', () => {
  it('registers nothing on the host', () => {
    expect(() => { applyNode() }).not.toThrow()
  })
})
