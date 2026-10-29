/**
 * Deep links of the web client: the address names the open item, so a bookmark, a shared address, or a reload opens
 * that item. `?chat=<id>` opens a chat and `?page=<id>` an app page; the address without both opens the dashboard. The
 * query (not the fragment) carries the item, so a sign-in redirect that keeps the query keeps the item.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** The item an address names. */
export type DeepLink = { readonly kind: 'chat'; readonly id: string } | { readonly kind: 'page'; readonly id: string }

const CHAT = 'chat'
const PAGE = 'page'

/**
 * Read the item of an address query.
 * @param search - `location.search`.
 * @returns the chat when `chat` is set, else the page when `page` is set, else `undefined`.
 */
export function readDeepLink(search: string): DeepLink | undefined {
  const params = new URLSearchParams(search)
  const chat = params.get(CHAT)
  if (chat !== null && chat !== '') return { kind: 'chat', id: chat }
  const page = params.get(PAGE)
  return page !== null && page !== '' ? { kind: 'page', id: page } : undefined
}

/**
 * Write the item into an address; other query parameters and the fragment stay.
 * @param href - the current address.
 * @param link - the open item; `undefined` for the dashboard.
 * @returns the new address.
 */
export function writeDeepLink(href: string, link: DeepLink | undefined): string {
  const url = new URL(href)
  url.searchParams.delete(CHAT)
  url.searchParams.delete(PAGE)
  if (link !== undefined) url.searchParams.set(link.kind === 'chat' ? CHAT : PAGE, link.id)
  return url.toString()
}

/**
 * The item the client shows now.
 * @param ctx - browser services.
 * @param dashboardId - the dashboard's main panel id, which has no link.
 * @returns the open page, else the open chat with content, else `undefined`.
 */
function currentLink(ctx: ClientContext, dashboardId: MainPanelId): DeepLink | undefined {
  const panel = ctx.layout.panelInfo.getSnapshot().activePanelId
  if (panel !== null) return panel === dashboardId ? undefined : { kind: 'page', id: panel }
  const main = Object.values(ctx.sessions.list.getSnapshot().byId).find(row => (row.retainedBy.mainView ?? 0) > 0)
  return main === undefined || main.blank ? undefined : { kind: 'chat', id: main.id }
}

/**
 * Open the item of the start address once, then keep the address equal to the open item.
 *
 * The start waits until the `main` slot lists the dashboard and the Session list is ready: a chat link opens the chat
 * when the list has it, a page link selects the page when it is registered then; any other address, and a link to a
 * missing item, shows the dashboard. Each later change of the open page or chat replaces the address in the browser
 * history, without a new history entry.
 * @param ctx - browser services: slots, layout, Sessions, and Session navigation.
 * @param dashboardId - the dashboard's main panel id.
 */
export function installDeepLinks(ctx: ClientContext, dashboardId: MainPanelId): void {
  const link = readDeepLink(window.location.search)
  let landed = false
  const sync = (): void => {
    if (!landed) return
    const current = currentLink(ctx, dashboardId)
    const shown = readDeepLink(window.location.search)
    if (shown?.kind === current?.kind && shown?.id === current?.id) return
    window.history.replaceState(window.history.state, '', writeDeepLink(window.location.href, current))
  }
  const land = (): void => {
    const pages = ctx.slots.entries('main').map(entry => entry.options.key)
    if (landed || !pages.includes(dashboardId) || ctx.sessions.list.getSnapshot().phase !== 'ready') return
    landed = true
    if (link?.kind === 'chat' && ctx.sessions.list.getSnapshot().byId[link.id as SessionId] !== undefined) {
      ctx.uiWorkspace.openSession(link.id as SessionId)
    } else {
      ctx.layout.selectPanel(link?.kind === 'page' && pages.includes(link.id) ? link.id as MainPanelId : dashboardId)
    }
    sync()
  }
  ctx.effect(() => {
    const stops = [
      ctx.slots.subscribe('main', land),
      ctx.sessions.list.subscribe(() => { land(); sync() }),
      ctx.layout.panelInfo.subscribe(sync),
    ]
    // The dashboard entry is not listed while this plugin's fiber applies, so the first check waits one task.
    const timer = window.setTimeout(land, 0)
    return () => {
      window.clearTimeout(timer)
      for (const stop of stops) stop()
    }
  }, 'ui-flowleap-dashboard: start item and deep links')
}
