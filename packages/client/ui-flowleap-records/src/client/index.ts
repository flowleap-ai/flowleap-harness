/**
 * Browser half of FlowLeap records, the IPMS views: asks the Host route once at start and, when the answer names the
 * Records service, registers the Matters launcher in `sidebar.panellist`, the Matters panel in the keyed `main` slot,
 * the intake row's context menu, and the keys and the ⌘K item of its screens. Where the runtime has Sessions and
 * client resources, it also provides the run Session resource that the work page's agent panel shows. The panel reads
 * and writes through the Records API of flowleap-os at `<recordsHref>api/` on the same origin; the firm proxy adds the
 * person's identity.
 * A failed request, an aborted request, or any other answer registers nothing and shows no error.
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
import { RECORDS_LINK_PATH } from '../route.ts'
import { readRouteAddress, syncRouteAddress, writeRouteAddress } from './address.ts'
import { createRecordsApi } from './api.ts'
import { de, en, es, fr, ja, NS, pt, ru, zh, type FlowleapRecordsKey } from './locales.ts'
import { createRecordsModel, TAB_ROUTE, type Route } from './model.ts'
import { MattersIcon, RecordsPanel, type PanelInjected } from './Panel.tsx'
import { CommandItemRegistry, KeyActRegistry, registerKeyLayer } from './key-layer.ts'
import { registerRowMenu } from './row-menu.ts'
import { runSessionProvider } from './agent-run.ts'
import { RunConversation } from './RunConversation.tsx'

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

/** The Host route relative to the document, like the other app routes. */
export const RECORDS_LINK_ROUTE = RECORDS_LINK_PATH.slice(1)

/** Required services: slots, copy with the UI language, the shortcuts and their catalog, the context menus and ⌘K. */
export const inject = ['slots', 'locale', 'shortcuts', 'contextMenus', 'commandMenu', 'layout']

/**
 * Ask the Host where the Records service is.
 * @param signal - aborts the request when the plugin is disposed.
 * @returns the service's path, or null for a failed or aborted request, an error status, or an answer it cannot read.
 */
export async function readRecordsLink(signal: AbortSignal): Promise<string | null> {
  let body: unknown
  try {
    const response = await fetch(RECORDS_LINK_ROUTE, { credentials: 'include', cache: 'no-store', signal })
    if (response.status !== 200) return null
    body = await response.json()
  } catch (_error: unknown) {
    // A network failure, an abort, or a body that is not JSON: no panel, and no error for the attorney.
    return null
  }
  const href = typeof body === 'object' && body !== null && 'href' in body ? body.href : undefined
  return typeof href === 'string' && href !== '' ? href : null
}

/**
 * Register the dictionaries, then the launcher, the panel and the row menu when the Host answers a path.
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
  // Read before the request: the start restoration of the workspace can rewrite the address while it waits.
  const startRoute = readRouteAddress(window.location.search, PANEL_ID)
  void readRecordsLink(controller.signal).then((href) => {
    if (href === null || controller.signal.aborted) return
    const api = createRecordsApi(href)
    const model = createRecordsModel(api, startRoute ?? TAB_ROUTE.intake)
    ctx.effect(() => () => { model.dispose() }, 'ui-flowleap-records: model')
    const linkOf = (route: Route) => writeRouteAddress(window.location.href, PANEL_ID, route)
    registerRowMenu(ctx, model, t, linkOf)
    const keyActs = new KeyActRegistry()
    const commandItems = new CommandItemRegistry()
    registerKeyLayer(ctx, keyActs, commandItems, t)
    const panelInfo = ctx.layout.panelInfo
    const active = {
      getSnapshot: () => panelInfo.getSnapshot().activePanelId === PANEL_ID,
      subscribe: (change: () => void) => panelInfo.subscribe(change),
    }
    ctx.effect(() => syncRouteAddress({
      route: model.screen, active, panel: PANEL_ID,
      address: { href: () => window.location.href, replace: (next) => { window.history.replaceState(window.history.state, '', next) } },
    }), 'ui-flowleap-records: address')
    const injected: PanelInjected = {
      hooks: {
        screen: model.screen, me: model.me, waitingCount: model.waitingCount, catalog: ctx.shortcuts.catalog,
        fixedCatalog: ctx.shortcuts.fixedCatalog, language,
      },
      navigate: (route) => { model.navigate(route) },
      retry: () => { model.retry() },
      refresh: () => { model.refresh() },
      perform: acts => model.perform(acts),
      contentHref: document => api.contentHref(document),
      keyActs,
      commandItems,
      linkOf,
      openSearch: () => { ctx.commandMenu.open() },
    }
    ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
      name: 'sidebar.panellist', id: PANEL_ID, order: 18, locale: NS, label: () => t('panel'),
    }, MattersIcon))
    ctx.slots.inject('main', () => ctx.slots.register({
      name: 'main', key: PANEL_ID, locale: NS, inject: () => injected,
      children: { 'records.agent.conversation': { kind: 'single', scope: 'session' } },
    }, RecordsPanel))
    ctx.slots.inject('records.agent.conversation', () => ctx.slots.register({ name: 'records.agent.conversation' }, RunConversation))
    if (startRoute !== null) selectWhenRegistered(ctx.layout, controller.signal)
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
 * @param later - schedules the next try.
 */
export function selectWhenRegistered(
  layout: Pick<ILayout, 'panelInfo' | 'selectPanel'>,
  signal: AbortSignal,
  later: (next: () => void) => void = (next) => { setTimeout(next, SELECT_WAIT_MS) },
): void {
  let tries = 0
  const attempt = (): void => {
    if (signal.aborted || layout.panelInfo.getSnapshot().activePanelId === PANEL_ID) return
    tries += 1
    try {
      layout.selectPanel(PANEL_ID)
    } catch (_error: unknown) {
      // The main slot registers this panel on a later turn; selectPanel throws until it is registered.
      if (tries < SELECT_TRIES) later(attempt)
    }
  }
  attempt()
}
