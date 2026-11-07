/**
 * The address of a Matters panel route, so a reload, a bookmark, "Copy link" and a link in a reply mail open the same
 * view. The client's landing names the open main panel in the query (`?page=flowleap-records`); this module adds the
 * route as `records=<route>` beside it, in the query and not the fragment, because a sign-in redirect keeps the query.
 * The text of each route:
 *
 * - `my-work`: My work. `letter/<sha256>`: one letter of intake as its own page.
 * - `intake`, `intake/filed-today`, `intake/not-relevant`: an intake list.
 * - `intake/<list>/<sha256>`: a letter open on its list, such as `intake/waiting/<sha256>`.
 * - `work/<ticket id>`: the work on a letter. `board`, `board/list`: the work board and its list layout.
 * - `matters`, `matter/<file number>` (URI-encoded), `deadline/<deadline id>`.
 */

import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import { ids, type DocumentId, type IntakeView } from './api.ts'
import { WireError } from './wire.ts'
import type { Route } from './model.ts'

/** The query parameter of the route. */
export const ROUTE_PARAM = 'records'
/** The query parameter of the open main panel, which the client's landing writes. */
export const PAGE_PARAM = 'page'

const LISTS: readonly IntakeView[] = ['waiting', 'filed-today', 'not-relevant']

/**
 * The address path of a route. A step of the open letter is not part of the address.
 * @param route - the route.
 * @returns the text.
 */
export function routePath(route: Route): string {
  switch (route.view) {
    case 'my-work': return 'my-work'
    case 'letter': return `letter/${route.document}`
    case 'matters': return 'matters'
    case 'matter': return `matter/${encodeURIComponent(route.fileNumber)}`
    case 'deadline': return `deadline/${route.id}`
    case 'work': return `work/${route.id}`
    case 'board': return route.layout === 'list' ? 'board/list' : 'board'
    case 'intake': {
      if (route.open !== null) return `intake/${route.list}/${route.open}`
      return route.list === 'waiting' ? 'intake' : `intake/${route.list}`
    }
  }
}

/**
 * Read a route from its address path. The text is outside input, so each id is checked as the wire checks it.
 * @param text - the text of the `records` parameter.
 * @returns the route, or null for a text that names no route.
 */
export function parseRoutePath(text: string): Route | null {
  const [view, first, second, ...rest] = text.split('/')
  if (rest.length > 0) return null
  try {
    switch (view) {
      case 'my-work': return first === undefined ? { view: 'my-work' } : null
      case 'letter': return first !== undefined && second === undefined ? { view: 'letter', document: ids.document(first, ROUTE_PARAM) } : null
      case 'matters': return first === undefined ? { view: 'matters' } : null
      case 'board':
        if (first === undefined) return { view: 'board' }
        return first === 'list' && second === undefined ? { view: 'board', layout: 'list' } : null
      case 'work': return first !== undefined && second === undefined ? { view: 'work', id: ids.ticket(first, ROUTE_PARAM) } : null
      case 'deadline': return first !== undefined && second === undefined ? { view: 'deadline', id: ids.deadline(first, ROUTE_PARAM) } : null
      case 'matter': return first !== undefined && second === undefined
        ? { view: 'matter', fileNumber: ids.fileNumber(decodeURIComponent(first), ROUTE_PARAM) }
        : null
      case 'intake': {
        const list = first ?? 'waiting'
        if (!LISTS.includes(list as IntakeView)) return null
        const open: DocumentId | null = second === undefined ? null : ids.document(second, ROUTE_PARAM)
        return { view: 'intake', list: list as IntakeView, open }
      }
      default: return null
    }
  } catch (error: unknown) {
    // A malformed id or a broken percent escape names no route; any other failure is a defect.
    if (error instanceof WireError || error instanceof URIError) return null
    throw error
  }
}

/**
 * The page of a task's object, from the task's record address (`act`): a letter of intake opens as its own page, a
 * deadline and a work item open as they do from the Matters panel.
 * @param act - `intake/<list>/<sha256>`, `deadline/<id>` or `work/<id>`.
 * @returns the route, or null for an address that names no page.
 */
export function routeOfAct(act: string): Route | null {
  const [view, list, document, ...rest] = act.split('/')
  if (view === 'intake') {
    if (rest.length > 0 || document === undefined || !LISTS.includes(list as IntakeView)) return null
    return parseRoutePath(`letter/${document}`)
  }
  return view === 'deadline' || view === 'work' ? parseRoutePath(act) : null
}

/**
 * The route that an address names for this panel.
 * @param search - `location.search`.
 * @param panel - the panel id that `page` must name.
 * @param landing - the panel is the landing page, whose address has no `page` (the client's landing removes it).
 * @returns the route, or null when the address names another page or no route.
 */
export function readRouteAddress(search: string, panel: string, landing = false): Route | null {
  const params = new URLSearchParams(search)
  const text = params.get(ROUTE_PARAM)
  const page = params.get(PAGE_PARAM)
  const ours = page === panel || (landing && page === null && !params.has('chat'))
  return ours && text !== null ? parseRoutePath(text) : null
}

/**
 * The address of a route, from the current address; other parameters and the fragment stay.
 * @param href - the current address.
 * @param panel - the panel id.
 * @param route - the route, or null to remove it from the address.
 * @param landing - the panel is the landing page: the address names no `page`, as the client's landing writes it.
 * @returns the new address.
 */
export function writeRouteAddress(href: string, panel: string, route: Route | null, landing = false): string {
  const url = new URL(href)
  if (route === null) {
    url.searchParams.delete(ROUTE_PARAM)
  } else {
    if (landing) url.searchParams.delete(PAGE_PARAM)
    else url.searchParams.set(PAGE_PARAM, panel)
    url.searchParams.set(ROUTE_PARAM, routePath(route))
  }
  return url.href
}

/** The browser address, read and replaced without a new history entry. */
export interface BrowserAddress {
  /** @returns the whole address, `location.href`. */
  href(): string
  /**
   * Replace the address in the browser history.
   * @param href - the new address.
   */
  replace(href: string): void
}

/**
 * Keep the route in the address while the panel is open, and take it out while another panel or a chat is open after
 * the panel was open once.
 * The client's landing owns the `page` parameter; this writes `records`, and `page` only together with it.
 * @param options.route - the panel's current route.
 * @param options.active - whether the panel is the open main panel.
 * @param options.address - the browser address.
 * @param options.panel - the panel id.
 * @returns the disposer, which stops the updates.
 */
export function syncRouteAddress(options: {
  route: ObservableSnapshot<Route>
  active: ObservableSnapshot<boolean>
  address: BrowserAddress
  panel: string
  /** The panel is the landing page, whose address names no `page`. */
  landing?: boolean
}): () => void {
  const { route, active, address, panel, landing = false } = options
  // Until the panel has been open once, the address may hold a start route that the panel has not read yet.
  let opened = false
  const sync = () => {
    if (active.getSnapshot()) opened = true
    if (!opened) return
    const href = address.href()
    const next = writeRouteAddress(href, panel, active.getSnapshot() ? route.getSnapshot() : null, landing)
    if (next !== href) address.replace(next)
  }
  sync()
  const stopRoute = route.subscribe(sync)
  const stopActive = active.subscribe(sync)
  return () => {
    stopRoute()
    stopActive()
  }
}
