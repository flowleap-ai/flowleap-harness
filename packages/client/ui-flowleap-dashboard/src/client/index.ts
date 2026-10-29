/**
 * Browser half of the FlowLeap dashboard (flowleap-harness#60). It registers the dashboard as a keyed `main` page,
 * opens the item of a deep link or else the dashboard when the client starts, keeps the address equal to the open
 * item, and declares the `dashboard.metric`, `dashboard.widget`, `dashboard.link`, and `dashboard.search` list slots
 * that apps fill. The Search command (Cmd+K) opens the dashboard search. It also adds the OS sidebar layers: the
 * Search action, the Dashboard, Chats, and Agents app launchers, and the Pinned section.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { AgentsPage, ChatsPage } from './AppPages.tsx'
import type { DashboardEntry } from './contract.ts'
import { DashboardPage } from './DashboardPage.tsx'
import { installDeepLinks } from './deep-link.ts'
import { de, en, es, fr, ja, NS, pt, ru, zh, type FlowleapDashboardKey } from './locales.ts'
import { AgentsIcon, ChatsIcon, DashboardIcon, PinnedSection, SearchAction } from './sidebar.tsx'
import { AgentActivity, ChatSearch } from './widgets.tsx'

export type { DashboardEntry, DashboardSearchOwnerProps, DashboardWidgetOwnerProps } from './contract.ts'
export type { DeepLink } from './deep-link.ts'
export type { FlowleapDashboardKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Dashboard page, panels, search, Install card, and sidebar layer copy. */
    'flowleapDashboard': FlowleapDashboardKey
  }
}

/** Main panel id of the dashboard and its Sidebar launcher. */
export const DASHBOARD_PANEL_ID = 'flowleap-dashboard' as MainPanelId
const CHATS_PANEL_ID = 'flowleap-chats' as MainPanelId
const AGENTS_PANEL_ID = 'flowleap-agents' as MainPanelId

/** Required services: slots, copy, layout, the Session list, and Session navigation. */
export const inject = ['slots', 'locale', 'layout', 'sessions', 'uiWorkspace']

type DashboardListSlot = 'dashboard.metric' | 'dashboard.widget' | 'dashboard.link' | 'dashboard.search'

/**
 * Keep the ordered metadata of one dashboard list slot.
 * @param ctx - browser services.
 * @param slot - the list slot.
 * @returns the observable entries.
 */
function entriesOf(ctx: ClientContext, slot: DashboardListSlot) {
  const store = createSnapshotStore<readonly DashboardEntry[]>([])
  const sync = (): void => {
    store.set(ctx.slots.entriesOfSlot(slot).map(({ options }) => {
      // The list registration requires an id; StoredEntry erases the slot kind.
      const id = options.id as string
      return { id, order: options.order ?? 0, label: resolveSlotLabel(options.label) ?? id }
    }).toSorted((left, right) => left.order - right.order))
  }
  ctx.effect(() => ctx.slots.subscribe(slot, sync), `ui-flowleap-dashboard: ${slot} entries`)
  ctx.effect(() => ctx.locale.subscribe(sync), `ui-flowleap-dashboard: ${slot} labels`)
  sync()
  return store
}

/**
 * Register the dashboard, its own panel and search group, the app pages, the sidebar layers, the Search command, and
 * the deep links.
 * @param ctx - browser services used by these contributions.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'ui-flowleap-dashboard: dictionaries')
  const t = ctx.locale.bind(NS)
  const hooks = {
    metrics: entriesOf(ctx, 'dashboard.metric'),
    widgets: entriesOf(ctx, 'dashboard.widget'),
    links: entriesOf(ctx, 'dashboard.link'),
    searches: entriesOf(ctx, 'dashboard.search'),
    focusRequests: createSnapshotStore(0),
  }
  const openSession = (sessionId: SessionId): void => { ctx.uiWorkspace.openSession(sessionId) }
  const search = (): void => {
    ctx.layout.selectPanel(DASHBOARD_PANEL_ID)
    hooks.focusRequests.set(hooks.focusRequests.getSnapshot() + 1)
  }
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: DASHBOARD_PANEL_ID, locale: NS,
    children: {
      'dashboard.metric': { kind: 'list', scope: 'root' },
      'dashboard.widget': { kind: 'list', scope: 'root' },
      'dashboard.link': { kind: 'list', scope: 'root' },
      'dashboard.search': { kind: 'list', scope: 'root' },
    },
    inject: () => ({
      hooks,
      onAsk: (text: string) => { ctx.uiWorkspace.startSession(undefined, text === '' ? undefined : { prompt: text }) },
    }),
  }, DashboardPage))
  installDeepLinks(ctx, DASHBOARD_PANEL_ID)
  ctx.effect(() => ctx.uiWorkspace.provideSearch(search), 'ui-flowleap-dashboard: Search command')
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: CHATS_PANEL_ID, locale: NS, inject: () => ({ onOpenSession: openSession }),
  }, ChatsPage))
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: AGENTS_PANEL_ID, locale: NS, inject: () => ({ onNewChat: () => { ctx.uiWorkspace.startSession() } }),
  }, AgentsPage))

  const launchers = [
    { id: DASHBOARD_PANEL_ID, order: -100, label: 'panel.dashboard', icon: DashboardIcon },
    { id: CHATS_PANEL_ID, order: -90, label: 'panel.chats', icon: ChatsIcon },
    { id: AGENTS_PANEL_ID, order: 30, label: 'panel.agents', icon: AgentsIcon },
  ] as const
  for (const launcher of launchers) {
    ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
      name: 'sidebar.panellist', id: launcher.id, order: launcher.order, locale: NS, label: () => t(launcher.label),
    }, launcher.icon))
  }
  ctx.slots.inject('sidebar.actions', () => ctx.slots.register({
    name: 'sidebar.actions', id: 'flowleap-search', order: 10, locale: NS, inject: () => ({ onSearch: search }),
  }, SearchAction))
  ctx.slots.inject('sidebar.sections', () => ctx.slots.register({
    name: 'sidebar.sections', id: 'flowleap-pinned', order: 10, locale: NS, inject: () => ({ onOpenSession: openSession }),
  }, PinnedSection))

  ctx.slots.inject('dashboard.widget', () => ctx.slots.register({
    name: 'dashboard.widget', id: 'flowleap-agent-activity', order: 30, locale: NS, label: () => t('widget.activity'),
    inject: () => ({ onOpenSession: openSession }),
  }, AgentActivity))
  ctx.slots.inject('dashboard.search', () => ctx.slots.register({
    name: 'dashboard.search', id: 'flowleap-chats', order: 10, locale: NS, label: () => t('search.chats'),
    inject: () => ({ onOpenSession: openSession }),
  }, ChatSearch))
}
