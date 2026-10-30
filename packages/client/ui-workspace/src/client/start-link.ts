/**
 * The landing page and the address links of the start restoration. While a plugin provides a landing panel, the
 * client shows that panel at the start, a start address with `?chat=<id>` opens that chat and one with `?page=<id>`
 * selects that main panel, and the address then names the open item, so a bookmark, a shared address, or a reload
 * opens it again. The query (not the fragment) carries the item, so a sign-in redirect that keeps the query keeps it.
 */

import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { ILayout, MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** The item an address names, as raw text; a lookup in the Session list or the main-panel registry admits the id. */
export interface AddressLink {
  readonly kind: 'chat' | 'page'
  readonly id: string
}

/** The registered main panels, as the start links read them. */
export interface MainPanels {
  /**
   * Find a registered main panel.
   * @param id - raw text, for example from the address.
   * @returns the registered panel id, or `undefined` while no panel has that id.
   */
  find(id: string): MainPanelId | undefined
  /**
   * Observe main-panel registrations.
   * @param listener - called after a panel registers or leaves.
   * @returns the disposer.
   */
  subscribe(listener: () => void): () => void
}

/** The browser address, read and replaced without a new history entry. */
export interface StartAddress {
  /** @returns the query, `location.search`. */
  search(): string
  /** @returns the whole address, `location.href`. */
  href(): string
  /**
   * Replace the address in the browser history.
   * @param href - the new address.
   */
  replace(href: string): void
}

/** The registered main panels and the browser address, which the start links read. */
export interface StartEnvironment {
  readonly mainPanels: MainPanels
  readonly address: StartAddress
}

const CHAT = 'chat'
const PAGE = 'page'

/**
 * Read the item of an address query.
 * @param search - `location.search`.
 * @returns the chat when `chat` is set, else the page when `page` is set, else `undefined`.
 */
export function readAddressLink(search: string): AddressLink | undefined {
  const params = new URLSearchParams(search)
  const chat = params.get(CHAT)
  if (chat !== null && chat !== '') return { kind: 'chat', id: chat }
  const page = params.get(PAGE)
  return page !== null && page !== '' ? { kind: 'page', id: page } : undefined
}

/**
 * Write the item into an address; other query parameters and the fragment stay.
 * @param href - the current address.
 * @param link - the open item; `undefined` for the landing panel or no item.
 * @returns the new address.
 */
export function writeAddressLink(href: string, link: AddressLink | undefined): string {
  const url = new URL(href)
  url.searchParams.delete(CHAT)
  url.searchParams.delete(PAGE)
  if (link !== undefined) url.searchParams.set(link.kind === 'chat' ? CHAT : PAGE, link.id)
  return url.toString()
}

/** What the start links read and do. */
export interface StartLinkDependencies extends StartEnvironment {
  readonly layout: ILayout
  readonly sessions: ObservableSnapshot<SessionListState>
  /** The chat open in the main view. */
  readonly mainSession: ObservableSnapshot<SessionId | undefined>
  /**
   * The provided landing panel.
   * @returns the latest provided panel, or `undefined` while none is provided.
   */
  readonly landing: () => MainPanelId | undefined
  /**
   * Open a chat in the main view and show it.
   * @param sessionId - a listed chat.
   */
  readonly openChat: (sessionId: SessionId) => void
}

/**
 * The start state of the landing panel and the address links. The start restoration of `UiWorkspaceService` calls
 * {@link StartLinks.beginRestoration} before it begins a navigation and {@link StartLinks.endRestoration} when it is
 * done; a panel selection during a navigation would abort that navigation. Without a provided landing it reads and
 * writes nothing.
 */
export class StartLinks {
  private pending: AddressLink | undefined
  private phase: 'waiting' | 'restoring' | 'done' = 'waiting'
  private landed = false
  private stops: readonly (() => void)[] | undefined

  /** @param deps - the layout, the Session list, the environment, the open chat, the landing, and the chat opener. */
  constructor(private readonly deps: StartLinkDependencies) {}

  /**
   * Follow a change of the provided landing: the first landing before the start restoration reads the start address,
   * and the observers of the landing, the pending link, and the address run only while a landing is provided.
   */
  landingChanged(): void {
    const provided = this.deps.landing() !== undefined
    if (provided && this.stops === undefined) {
      if (this.phase === 'waiting') this.pending ??= readAddressLink(this.deps.address.search())
      this.stops = [
        this.deps.mainPanels.subscribe(() => { this.update() }),
        this.deps.sessions.subscribe(() => { this.update() }),
        this.deps.mainSession.subscribe(() => { this.update() }),
        this.deps.layout.panelInfo.subscribe(() => { this.panelChanged() }),
      ]
    } else if (!provided) {
      this.dispose()
      return
    }
    this.update()
  }

  /** Stop observing. */
  dispose(): void {
    for (const stop of this.stops ?? []) stop()
    this.stops = undefined
  }

  /**
   * Start the restoration: open the chat of a chat link that the Session list has, else show the landing panel.
   * @param list - the ready Session list.
   * @returns `true` when the chat of the link opened, so the restoration has nothing more to open.
   */
  beginRestoration(list: SessionListState): boolean {
    this.phase = 'restoring'
    const link = this.pending
    if (link?.kind === 'chat') {
      this.pending = undefined
      const sessionId = list.ids.find(id => id === link.id)
      if (sessionId !== undefined) {
        this.landed = true
        this.deps.openChat(sessionId)
        return true
      }
    }
    this.land()
    return false
  }

  /** End the restoration: select the page of a page link, and keep the address equal to the open item from now. */
  endRestoration(): void {
    this.phase = 'done'
    if (this.pending?.kind === 'chat') this.pending = undefined
    this.update()
  }

  private update(): void {
    if (this.phase === 'waiting') this.land()
    if (this.phase !== 'done') return
    this.openPage()
    this.sync()
  }

  private land(): void {
    if (this.landed || this.pending?.kind === 'chat') return
    const landing = this.deps.landing()
    if (landing === undefined || this.deps.mainPanels.find(landing) === undefined) return
    this.landed = true
    this.deps.layout.selectPanel(landing)
  }

  private panelChanged(): void {
    // The user left the landing panel before the linked page could open: the link no longer applies.
    const active = this.deps.layout.panelInfo.getSnapshot().activePanelId
    if (this.landed && this.pending?.kind === 'page' && active !== this.deps.landing()) this.pending = undefined
    this.update()
  }

  private openPage(): void {
    const link = this.pending
    if (link?.kind !== 'page') return
    if (!this.landed) {
      this.pending = undefined
      return
    }
    const page = this.deps.mainPanels.find(link.id)
    if (page === undefined) return
    this.pending = undefined
    this.deps.layout.selectPanel(page)
  }

  private current(landing: MainPanelId): AddressLink | undefined {
    const panel = this.deps.layout.panelInfo.getSnapshot().activePanelId
    if (panel !== null) return panel === landing ? undefined : { kind: 'page', id: panel }
    const sessionId = this.deps.mainSession.getSnapshot()
    const row = sessionId === undefined ? undefined : this.deps.sessions.getSnapshot().byId[sessionId]
    return row === undefined || row.blank ? undefined : { kind: 'chat', id: row.id }
  }

  private sync(): void {
    const landing = this.deps.landing()
    if (landing === undefined || this.pending !== undefined) return
    const current = this.current(landing)
    const shown = readAddressLink(this.deps.address.search())
    if (shown?.kind === current?.kind && shown?.id === current?.id) return
    this.deps.address.replace(writeAddressLink(this.deps.address.href(), current))
  }
}
