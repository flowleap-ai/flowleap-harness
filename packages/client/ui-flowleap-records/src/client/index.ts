/**
 * Browser half of FlowLeap records, the IPMS views: provides My work as the landing page, asks the Host route once at
 * start and, when the answer names the Records service, registers the My work and Matters launchers in
 * `sidebar.panellist` (My work first), their panels in the keyed `main` slot, the row context menus of My work and
 * Intake, the keys and the ⌘K item of its screens, Find a matter, and the account button at the sidebar foot. Where
 * the runtime has Sessions and client resources, it also provides the run Session resource that the work page's agent
 * panel shows; where it has Session navigation, the panel's composer starts a new chat about the letter with the
 * question drafted. The panels read and write through the Records API of flowleap-os at `<recordsHref>api/` on the
 * same origin; the firm proxy adds the person's identity.
 * A failed request, an aborted request, or any other answer registers nothing, takes the landing back and shows no
 * error.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { LocaleId } from '@deepseek-ai/dsh-client-locale/client'
import type { ILayout, MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-shortcuts/client'
import type {} from '@deepseek-ai/dsh-client-ui-commands/client'
import type {} from '@deepseek-ai/dsh-client-ui-context-menu/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { RECORDS_LINK_PATH } from '../route.ts'
import { readRouteAddress, syncRouteAddress, writeRouteAddress } from './address.ts'
import { createRecordsApi } from './api.ts'
import { de, en, es, fr, ja, NS, pt, ru, zh, type FlowleapRecordsKey } from './locales.ts'
import { createRecordsModel, ROOT_ROUTE, type Route } from './model.ts'
import { MattersIcon, MyWorkIcon, MyWorkPanel, RecordsPanel, type PanelInjected } from './Panel.tsx'
import { CommandItemRegistry, KeyActRegistry, registerKeyLayer } from './key-layer.ts'
import { createMatterFinder } from './find.ts'
import { AccountButton, type AccountInjected } from './Account.tsx'
import { registerRowMenu, registerWorkRowMenu } from './row-menu.ts'
import { runSessionProvider } from './agent-run.ts'
import { RunConversation } from './RunConversation.tsx'
import type { NewChat } from './screens/context.ts'

export type { FlowleapRecordsKey } from './locales.ts'
export type { PanelInjected, PanelProps } from './Panel.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Matters launcher and the IPMS views. */
    'flowleapRecords': FlowleapRecordsKey
  }
}

/** Main panel id of the Matters panel and its Sidebar launcher. */
export const PANEL_ID = 'flowleap-records' as MainPanelId
/** Main panel id of My work and its Sidebar launcher, the first row of the sidebar. */
export const MY_WORK_PANEL_ID = 'flowleap-my-work' as MainPanelId

/** The Host route relative to the document, like the other app routes. */
export const RECORDS_LINK_ROUTE = RECORDS_LINK_PATH.slice(1)

/** Required services: slots, copy with the UI language, the shortcuts and their catalog, the context menus and ⌘K. */
export const inject = ['slots', 'locale', 'shortcuts', 'contextMenus', 'commandMenu', 'layout']

/** What the Host route answers: where the Records service is, and where Sign out goes. */
export interface RecordsLink {
  readonly href: string
  readonly signOutHref: string | null
}

/**
 * Ask the Host where the Records service is.
 * @param signal - aborts the request when the plugin is disposed.
 * @returns the service's path and the sign-out path, or null for a failed or aborted request, an error status, or an
 * answer it cannot read.
 */
export async function readRecordsLink(signal: AbortSignal): Promise<RecordsLink | null> {
  let body: unknown
  try {
    const response = await fetch(RECORDS_LINK_ROUTE, { credentials: 'include', cache: 'no-store', signal })
    if (response.status !== 200) return null
    body = await response.json()
  } catch (_error: unknown) {
    // A network failure, an abort, or a body that is not JSON: no panel, and no error for the attorney.
    return null
  }
  if (typeof body !== 'object' || body === null) return null
  const href = 'href' in body ? body.href : undefined
  const signOutHref = 'signOutHref' in body ? body.signOutHref : null
  if (typeof href !== 'string' || href === '' || (signOutHref !== null && typeof signOutHref !== 'string')) return null
  return { href, signOutHref }
}

/**
 * Register the dictionaries, the landing on My work and the My work panel at once, so the start restoration lands on
 * it; then, when the Host answers a path, the Matters panel, the row menus, the keys, Find a matter and the account
 * button. A Host with no Records service takes the landing and the My work panel back.
 * @param ctx - browser services used by these contributions.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'ui-flowleap-records: dictionaries')
  const t = ctx.locale.bind(NS)
  const language = createSnapshotStore<LocaleId>(ctx.locale.getLocale().active)
  ctx.on('locale/change', (snapshot) => { language.set(snapshot.active) })
  const controller = new AbortController()
  ctx.effect(() => () => { controller.abort() }, 'ui-flowleap-records: request')
  // The agent panel shows a run Session only where this runtime has Sessions and resources; without them it says so.
  ctx.inject(['resources', 'sessions'], (scope) => {
    scope.effect(() => scope.resources.register(runSessionProvider(scope.sessions)), 'ui-flowleap-records: run Sessions')
  })
  // The agent panel's composer starts a new chat only where the runtime has Session navigation; without it, no composer.
  const ask = createSnapshotStore<NewChat | null>(null)
  // My work is the first screen (sheet 00, decision Q6).
  const takeBack: (() => void)[] = []
  ctx.inject(['uiWorkspace'], (scope) => {
    scope.effect(() => {
      ask.set({ start: (prompt) => { scope.uiWorkspace.startSession(undefined, { prompt, whenDraftExists: 'append' }) } })
      return () => { ask.set(null) }
    }, 'ui-flowleap-records: new chat')
    scope.effect(() => {
      const dispose = scope.uiWorkspace.provideLanding(MY_WORK_PANEL_ID)
      takeBack.push(dispose)
      return dispose
    }, 'ui-flowleap-records: landing on My work')
  })
  // Read before the request: the start restoration of the workspace can rewrite the address while it waits.
  const startMatters = readRouteAddress(window.location.search, PANEL_ID)
  const startMyWork = readRouteAddress(window.location.search, MY_WORK_PANEL_ID, true)
  const link = readRecordsLink(controller.signal)
  const api = createRecordsApi(link.then(answer => answer?.href ?? null))
  const myWork = createRecordsModel(api, startMyWork ?? ROOT_ROUTE['my-work'], 'my-work')
  const matters = createRecordsModel(api, startMatters ?? ROOT_ROUTE.matters, 'matters')
  ctx.effect(() => () => {
    matters.dispose()
    myWork.dispose()
  }, 'ui-flowleap-records: models')
  const linkOf = (panel: MainPanelId) => (route: Route) => writeRouteAddress(window.location.href, panel, route, panel === MY_WORK_PANEL_ID)
  const openInMatters = (route: Route) => {
    matters.navigate(route)
    ctx.layout.selectPanel(PANEL_ID)
  }
  const openMyWork = () => {
    myWork.navigate(ROOT_ROUTE['my-work'])
    ctx.layout.selectPanel(MY_WORK_PANEL_ID)
  }
  const panelInfo = ctx.layout.panelInfo
  const recordsOpen = () => [PANEL_ID, MY_WORK_PANEL_ID].includes(panelInfo.getSnapshot().activePanelId as MainPanelId)
  const keyActs = new KeyActRegistry()
  const finder = createMatterFinder(api, t, openInMatters, recordsOpen)
  const commandItems = new CommandItemRegistry(() => finder.item())
  const openFind = () => {
    void finder.refresh(controller.signal).then(() => {
      commandItems.offer(finder.item(true))
      ctx.commandMenu.open()
    })
  }
  const panels = [
    {
      id: MY_WORK_PANEL_ID, root: 'my-work', model: myWork, order: -120, label: 'mywork.panel', icon: MyWorkIcon,
    },
    {
      id: PANEL_ID, root: 'matters', model: matters, order: -110, label: 'panel', icon: MattersIcon,
    },
  ] as const
  /** Register one panel with its launcher, its address and its conversation slot. */
  const registerPanel = (panel: (typeof panels)[number]): (() => void)[] => {
    const active = {
      getSnapshot: () => panelInfo.getSnapshot().activePanelId === panel.id,
      subscribe: (change: () => void) => panelInfo.subscribe(change),
    }
    const injected: PanelInjected = {
      hooks: {
        screen: panel.model.screen, me: panel.model.me, myWork: panel.model.myWork, waitingCount: panel.model.waitingCount,
        catalog: ctx.shortcuts.catalog, fixedCatalog: ctx.shortcuts.fixedCatalog, language, ask,
      },
      root: panel.root,
      navigate: (route) => { panel.model.navigate(route) },
      retry: () => { panel.model.retry() },
      refresh: () => { panel.model.refresh() },
      perform: acts => panel.model.perform(acts),
      contentHref: document => api.contentHref(document),
      keyActs,
      commandItems,
      linkOf: linkOf(panel.id),
      openSearch: () => { ctx.commandMenu.open() },
      openFind,
      openInMatters,
      openMyWork,
    }
    return [
      ctx.effect(() => syncRouteAddress({
        route: panel.model.screen, active, panel: panel.id, landing: panel.root === 'my-work',
        address: { href: () => window.location.href, replace: (next) => { window.history.replaceState(window.history.state, '', next) } },
      }), `ui-flowleap-records: ${panel.root} address`),
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist', id: panel.id, order: panel.order, locale: NS, label: () => t(panel.label),
      }, panel.icon)),
      // A slot is declared by one entry, so each panel declares its own conversation slot for the agent panel.
      panel.root === 'my-work'
        ? ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main', key: panel.id, locale: NS, inject: () => injected,
          children: { 'records.mywork.agent.conversation': { kind: 'single', scope: 'session' } },
        }, MyWorkPanel))
        : ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main', key: panel.id, locale: NS, inject: () => injected,
          children: { 'records.agent.conversation': { kind: 'single', scope: 'session' } },
        }, RecordsPanel)),
      panel.root === 'my-work'
        ? ctx.slots.inject('records.mywork.agent.conversation', () => ctx.slots.register({ name: 'records.mywork.agent.conversation' }, RunConversation))
        : ctx.slots.inject('records.agent.conversation', () => ctx.slots.register({ name: 'records.agent.conversation' }, RunConversation)),
    ]
  }
  takeBack.push(...registerPanel(panels[0]))
  void link.then((answer) => {
    if (controller.signal.aborted) return
    if (answer === null) {
      for (const dispose of takeBack) dispose()
      return
    }
    registerRowMenu(ctx, matters, t, linkOf(PANEL_ID))
    registerWorkRowMenu(ctx, { navigate: (route) => { myWork.navigate(route) }, openInMatters, linkOf: linkOf(MY_WORK_PANEL_ID) }, t)
    registerKeyLayer(ctx, keyActs, commandItems, t)
    void finder.refresh(controller.signal)
    registerPanel(panels[1])
    const account: AccountInjected = {
      hooks: { me: myWork.me },
      signOutHref: answer.signOutHref,
      openSettings: () => { ctx.get('settingsNavigation')?.openSection('general') },
      leave: (href) => { window.location.assign(href) },
    }
    ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
      name: 'sidebar.footer.action', id: 'flowleap-account', order: 0, locale: NS, inject: () => account,
    }, AccountButton))
    if (startMatters !== null) selectWhenRegistered(ctx.layout, controller.signal, PANEL_ID)
    else if (startMyWork !== null) selectWhenRegistered(ctx.layout, controller.signal, MY_WORK_PANEL_ID)
  })
}

/** How often and how long the panel tries to select itself for a start address: 20 tries, 50 ms apart. */
const SELECT_TRIES = 20
const SELECT_WAIT_MS = 50

/**
 * Select the panel for a start address that names a route. The panel registers only after the records-link answer;
 * by then the start restoration may have landed on another page, so the panel selects itself once it is registered.
 * It stops when the panel is open, when the plugin is disposed, or after the last try.
 * @param layout - the panel selection.
 * @param signal - aborted when the plugin is disposed.
 * @param panel - the panel that the start address names.
 * @param later - schedules the next try.
 */
export function selectWhenRegistered(
  layout: Pick<ILayout, 'panelInfo' | 'selectPanel'>,
  signal: AbortSignal,
  panel: MainPanelId = PANEL_ID,
  later: (next: () => void) => void = (next) => { setTimeout(next, SELECT_WAIT_MS) },
): void {
  let tries = 0
  const attempt = (): void => {
    if (signal.aborted || layout.panelInfo.getSnapshot().activePanelId === panel) return
    tries += 1
    try {
      layout.selectPanel(panel)
    } catch (_error: unknown) {
      // The main slot registers this panel on a later turn; selectPanel throws until it is registered.
      if (tries < SELECT_TRIES) later(attempt)
    }
  }
  attempt()
}
