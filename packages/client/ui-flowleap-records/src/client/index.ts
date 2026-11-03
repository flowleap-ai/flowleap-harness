/**
 * Browser half of FlowLeap records: asks the Host route once at start and, when the answer names the Records pages,
 * registers the Records launcher in `sidebar.panellist` and the Records page in the keyed `main` slot. The page
 * embeds the Firm Record's pages from the same origin with the client's color scheme; a confirm goes from the page to
 * the Firm Record through the firm proxy, never through the runtime. A failed request, an aborted request, or any
 * other answer registers nothing and shows no error.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import { RECORDS_LINK_PATH } from '../route.ts'
import { de, en, es, fr, ja, NS, pt, ru, zh, type FlowleapRecordsKey } from './locales.ts'
import { RecordsIcon, RecordsPage, type ColorScheme } from './RecordsPage.tsx'

export type { FlowleapRecordsKey } from './locales.ts'
export { frameSrc } from './RecordsPage.tsx'
export type { ColorScheme, RecordsIconProps, RecordsPageInjected, RecordsPageProps } from './RecordsPage.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Records launcher, frame, and empty state copy. */
    'flowleapRecords': FlowleapRecordsKey
  }
}

/** Main panel id of the Records page and its Sidebar launcher. */
export const PANEL_ID = 'flowleap-records' as MainPanelId

/** The Host route relative to the document, like the other app routes. */
export const RECORDS_LINK_ROUTE = RECORDS_LINK_PATH.slice(1)

/** Required services: slots, copy, and the theme. */
export const inject = ['slots', 'locale', 'theme']

/**
 * Ask the Host where the Records pages are.
 * @param signal - aborts the request when the plugin is disposed.
 * @returns the pages' path, or null for a failed or aborted request, an error status, or an answer it cannot read.
 */
export async function readRecordsLink(signal: AbortSignal): Promise<string | null> {
  let response: Response
  try {
    response = await fetch(RECORDS_LINK_ROUTE, { credentials: 'include', cache: 'no-store', signal })
  } catch {
    // A network failure or an abort: no page, and no error for the attorney.
    return null
  }
  if (response.status !== 200) return null
  let body: unknown
  try {
    body = await response.json()
  } catch {
    // A body that is not JSON: no page, and no error for the attorney.
    return null
  }
  if (typeof body !== 'object' || body === null || !('href' in body)) return null
  return typeof body.href === 'string' && body.href !== '' ? body.href : null
}

/**
 * Whether the Records pages answer at their address.
 * @param href - the pages, relative to the document.
 * @param signal - aborts the request when the page unmounts.
 * @returns `true` for a `200`; `false` for any other status, a failed request, or an abort.
 */
export async function probeRecords(href: string, signal: AbortSignal): Promise<boolean> {
  let response: Response
  try {
    response = await fetch(`${href}?embedded=1`, { credentials: 'include', cache: 'no-store', signal })
  } catch {
    // The proxy does not serve the pages, or the page unmounted: the empty state.
    return false
  }
  return response.status === 200
}

/**
 * Register the dictionaries, then the Records launcher and page when the Host answers a path.
 * @param ctx - browser services used by these contributions.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'ui-flowleap-records: dictionaries')
  const t = ctx.locale.bind(NS)
  const colorScheme = createSnapshotStore<ColorScheme>(ctx.theme.getTheme().active.colorScheme)
  ctx.on('theme/change', (snapshot) => { colorScheme.set(snapshot.active.colorScheme) })
  const controller = new AbortController()
  ctx.effect(() => () => { controller.abort() }, 'ui-flowleap-records: request')
  void readRecordsLink(controller.signal).then((href) => {
    if (href === null || controller.signal.aborted) return
    const injected = { href, probe: (signal: AbortSignal) => probeRecords(href, signal), colorScheme }
    ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
      name: 'sidebar.panellist', id: PANEL_ID, order: 18, locale: NS, label: () => t('panel'),
    }, RecordsIcon))
    ctx.slots.inject('main', () => ctx.slots.register({
      name: 'main', key: PANEL_ID, locale: NS, inject: () => injected,
    }, RecordsPage))
  })
}
