/**
 * Browser half of FlowLeap records, the IPMS views: asks the Host route once at start and, when the answer names the
 * Records service, registers the Matters launcher in `sidebar.panellist`, the Matters panel in the keyed `main` slot,
 * and the intake row's context menu. The panel reads and writes through the Records API of flowleap-os at
 * `<recordsHref>api/` on the same origin; the firm proxy adds the person's identity. A failed request, an aborted
 * request, or any other answer registers nothing and shows no error.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { LocaleId } from '@deepseek-ai/dsh-client-locale/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-shortcuts/client'
import type {} from '@deepseek-ai/dsh-client-ui-context-menu/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { RECORDS_LINK_PATH } from '../route.ts'
import { createRecordsApi } from './api.ts'
import { de, en, es, fr, ja, NS, pt, ru, zh, type FlowleapRecordsKey } from './locales.ts'
import { createRecordsModel, TAB_ROUTE } from './model.ts'
import { MattersIcon, RecordsPanel, type PanelInjected } from './Panel.tsx'
import { registerRowMenu } from './row-menu.ts'

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

/** Required services: slots, copy with the UI language, the shortcut catalog for keycaps, and the context menus. */
export const inject = ['slots', 'locale', 'shortcuts', 'contextMenus']

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
  void readRecordsLink(controller.signal).then((href) => {
    if (href === null || controller.signal.aborted) return
    const api = createRecordsApi(href)
    const model = createRecordsModel(api, TAB_ROUTE.intake)
    ctx.effect(() => () => { model.dispose() }, 'ui-flowleap-records: model')
    registerRowMenu(ctx, model, t)
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
    }
    ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
      name: 'sidebar.panellist', id: PANEL_ID, order: 18, locale: NS, label: () => t('panel'),
    }, MattersIcon))
    ctx.slots.inject('main', () => ctx.slots.register({
      name: 'main', key: PANEL_ID, locale: NS, inject: () => injected,
    }, RecordsPanel))
  })
}
