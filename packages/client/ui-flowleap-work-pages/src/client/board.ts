/**
 * Office action board source: the work pages that the Host lists, the page on show with its file, and the page state.
 * Every read and change goes through the `flowleapWorkPages` Remote: the board changes only the review fields of an
 * objection, never a finding. A `flowleap-work-pages/changed` event carries the changed page, so the board applies it
 * without a new read. A new save of another page does not replace the page on show: the board names it in `newer`, and
 * the attorney chooses to show it. While a chosen page is read, the page on show takes no attorney change. "Write
 * response plan" sends one chat message into the chat that saved the page, and the form opens a new chat with a drafted
 * message; the page itself never calls the model or a connector.
 */

import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import {
  REVIEW_STATES,
  type ReviewFields, type WorkPageReviewState, type WorkPageId, type WorkPageReviewRequest, type WorkPageSummary, type WorkPageView,
} from '@deepseek-ai/dsh-flowleap-deliverables/work-pages'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/**
 * Read a menu item id back as a review state.
 * @param id - an item id of the state menu.
 * @returns the state.
 * @throws when the id is not a review state.
 */
export function reviewState(id: string): WorkPageReviewState {
  const state = REVIEW_STATES.find(value => value === id)
  if (state === undefined) throw new Error(`unknown review state "${id}"`)
  return state
}

/** A result that the board reports in its notice line. */
export type Notice = 'sent' | 'sendFailed' | 'saveFailed'

/** What the board page and its launcher read. */
export interface BoardSnapshot {
  /** Query state of the page list; `error` keeps the last list. */
  readonly status: 'loading' | 'ready' | 'error'
  /** The work pages, newest save first. */
  readonly pages: readonly WorkPageSummary[]
  /** The page on show, or `null` while there is none. */
  readonly page: WorkPageView | null
  /** The page that the attorney chose and that the board reads; the page on show takes no change until it arrives. */
  readonly opening: WorkPageId | null
  /** The newest save of another page after the page on show was saved, until the attorney shows or hides it. */
  readonly newer: WorkPageSummary | null
  /** Objection open in the side panel. */
  readonly selected: string | null
  readonly formOpen: boolean
  /** The plan message is on its way to the chat. */
  readonly sending: boolean
  readonly notice: Notice | null
}

/** Remote calls, navigation, and message copy that the source uses. */
export interface BoardDependencies {
  readonly list: () => Promise<RemoteResult<WorkPageSummary[]>>
  readonly read: (id: WorkPageId) => Promise<RemoteResult<WorkPageView>>
  readonly review: (request: WorkPageReviewRequest) => Promise<RemoteResult<WorkPageView>>
  /** Send one user message into a chat. */
  readonly send: (sessionId: SessionId, text: string) => Promise<RemoteResult<unknown>>
  /** Show a chat. */
  readonly openSession: (sessionId: SessionId) => void
  /** Open a new chat with a drafted message that the attorney sends. */
  readonly draftChat: (text: string) => void
  /** The response plan message for a page. */
  readonly planMessage: (view: WorkPageView) => string
  /** The analysis message for an application number. */
  readonly analysisMessage: (application: string) => string
  /** Observe changes of the work pages; the listener gets the page after the change. */
  readonly subscribeChanged: (listener: (view: WorkPageView) => void) => () => void
  /** Observe connection resets. */
  readonly subscribeReset: (listener: () => void) => () => void
}

/** The board: its observable snapshot and the attorney actions. */
export interface Board {
  readonly hooks: { readonly board: HostObservable<BoardSnapshot> }
  /**
   * Show another page.
   * @param id - the page.
   * @returns resolution after the page is read.
   */
  readonly choose: (id: WorkPageId) => Promise<void>
  /**
   * Change the review fields of one objection on the page on show.
   * @param objection - the objection.
   * @param fields - the fields to change.
   * @returns resolution after the Host answered.
   */
  readonly setReview: (objection: string, fields: Partial<ReviewFields>) => Promise<void>
  /**
   * Open one objection in the side panel, or close the panel.
   * @param id - the objection, or `null` to close.
   */
  readonly select: (id: string | null) => void
  /**
   * Open or close the analysis form.
   * @param open - the new form state.
   */
  readonly setFormOpen: (open: boolean) => void
  /** Hide the notice. */
  readonly dismiss: () => void
  /** Hide the newer save. */
  readonly dismissNewer: () => void
  /**
   * Send the response plan message into the chat of the page on show, then show that chat.
   * @returns resolution after the Host answered.
   */
  readonly writePlan: () => Promise<void>
  /** Show the chat of the page on show. */
  readonly openChat: () => void
  /**
   * Open a new chat with the analysis message drafted for an application.
   * @param application - the application number.
   */
  readonly startAnalysis: (application: string) => void
  /**
   * Read the pages again.
   * @returns resolution after the read result is published.
   */
  readonly retry: () => Promise<void>
}

/**
 * Create the board. It reads only while the framework observes it: the first subscriber reads and starts the
 * invalidation listeners, and the last unsubscribe stops them and discards responses still in flight.
 * @param deps - Remote calls, navigation, copy, and invalidation subscriptions.
 * @returns the board.
 */
export function createBoard(deps: BoardDependencies): Board {
  let snapshot: BoardSnapshot = {
    status: 'loading', pages: [], page: null, opening: null, newer: null, selected: null, formOpen: false, sending: false, notice: null,
  }
  const listeners = new Set<() => void>()
  let stops: readonly (() => void)[] = []
  let epoch = 0
  const publish = (next: Partial<BoardSnapshot>): void => {
    snapshot = { ...snapshot, ...next }
    for (const listener of listeners) listener()
  }
  const settle = async <T>(call: () => Promise<RemoteResult<T>>): Promise<RemoteResult<T> | undefined> => {
    try {
      return await call()
    } catch (_error: unknown) {
      // A transport rejection has the same visible path as a Remote failure.
      return undefined
    }
  }
  /** The changed pages since the current read started, by id; the answers of that read can be older than them. */
  let arrived = new Map<WorkPageId, WorkPageView>()
  /** A listed page list with the changed pages that arrived during the read, newest save first. */
  const withArrived = (pages: readonly WorkPageSummary[]): WorkPageSummary[] => {
    const summaries = [...arrived.values()].map(view => view.summary)
    return [...summaries, ...pages.filter(page => !arrived.has(page.id))].sort((left, right) => right.savedAt.localeCompare(left.savedAt))
  }
  /**
   * The newer save after a read: the newest listed page, other than the page on show and saved after it, that is the
   * current newer save or that the list before the read did not have with this save time.
   */
  const newestSave = (
    pages: readonly WorkPageSummary[], shown: WorkPageSummary, before: readonly WorkPageSummary[],
  ): WorkPageSummary | null =>
    pages.find(page => page.id !== shown.id && page.savedAt > shown.savedAt
      && (page.id === snapshot.newer?.id || !before.some(old => old.id === page.id && old.savedAt === page.savedAt))) ?? null
  const read = async (wanted?: WorkPageId): Promise<void> => {
    const current = ++epoch
    // A read that a reset or an unsubscribe superseded leaves `opening`, so the next read still shows the chosen page.
    const id = wanted ?? snapshot.opening ?? snapshot.page?.summary.id
    const before = snapshot.pages
    arrived = new Map()
    publish({ status: 'loading' })
    const pages = await settle(deps.list)
    if (current !== epoch) return
    if (pages?.ok !== true) {
      publish({ status: 'error', opening: null })
      return
    }
    const known = withArrived(pages.value)
    const shown = known.find(page => page.id === id) ?? known[0]
    if (shown === undefined) {
      publish({ status: 'ready', pages: [], page: null, opening: null, newer: null, selected: null })
      return
    }
    const view = await settle(() => deps.read(shown.id))
    if (current !== epoch) return
    const listed = withArrived(pages.value)
    if (view?.ok !== true) {
      publish({ status: 'error', pages: listed, newer: listed.find(page => page.id === snapshot.newer?.id) ?? null, opening: null })
      return
    }
    const latest = arrived.get(shown.id) ?? view.value
    publish({ status: 'ready', pages: listed, ...shownPage(latest, newestSave(listed, latest.summary, before)), opening: null })
  }
  /**
   * The page on show, the open objection and the newer save after a new view of a page: the objection stays open while
   * the page has it, and the newer save ends when it is on show or the page on show was saved after it.
   */
  const shownPage = (view: WorkPageView, newer: WorkPageSummary | null): Pick<BoardSnapshot, 'page' | 'selected' | 'newer'> => {
    const { selected } = snapshot
    const keep = snapshot.page?.summary.id === view.summary.id && selected !== null && Object.hasOwn(view.file.review, selected)
    const ended = newer === null || newer.id === view.summary.id || newer.savedAt <= view.summary.savedAt
    return { page: view, selected: keep ? selected : null, newer: ended ? null : newer }
  }
  /**
   * The newer save after a changed page that is not on show: a save of that page after the page on show was saved
   * becomes the newer save; a review change only refreshes the summary of the newer save.
   */
  const newerAfter = (view: WorkPageView): WorkPageSummary | null => {
    const { summary } = view
    const saved = snapshot.pages.find(page => page.id === summary.id)?.savedAt !== summary.savedAt
    if (saved && snapshot.page !== null && summary.savedAt > snapshot.page.summary.savedAt) return summary
    return snapshot.newer?.id === summary.id ? summary : snapshot.newer
  }
  /**
   * Apply a changed page: its summary replaces the old one in the list, and the page on show follows it. A changed page
   * that is not on show can become the newer save.
   * @param view - the page after the change.
   * @param status - the new query state; omitted, it stays.
   */
  const changed = (view: WorkPageView, status: Partial<Pick<BoardSnapshot, 'status'>> = {}): void => {
    arrived.set(view.summary.id, view)
    const pages = [view.summary, ...snapshot.pages.filter(summary => summary.id !== view.summary.id)]
      .sort((left, right) => right.savedAt.localeCompare(left.savedAt))
    const shown = snapshot.page === null || snapshot.page.summary.id === view.summary.id
    publish(shown ? { ...status, pages, ...shownPage(view, snapshot.newer) } : { ...status, pages, newer: newerAfter(view) })
  }
  const reset = (): void => { void read() }
  const observe = (listener: () => void): (() => void) => {
    listeners.add(listener)
    if (listeners.size === 1) {
      stops = [deps.subscribeChanged((view) => { changed(view) }), deps.subscribeReset(reset)]
      reset()
    }
    return () => {
      listeners.delete(listener)
      if (listeners.size > 0) return
      stops.forEach((stop) => { stop() })
      stops = []
      // Responses still in flight belong to the old observation.
      epoch += 1
    }
  }
  return {
    hooks: { board: { getSnapshot: () => snapshot, subscribe: observe } },
    choose: async (id) => {
      publish({ selected: null, opening: id })
      await read(id)
    },
    setReview: async (objection, fields) => {
      const page = snapshot.page
      if (page === null || snapshot.opening !== null) return
      // The answer is newer than a read that is still in flight, so that read is discarded.
      const current = ++epoch
      const result = await settle(() => deps.review({ id: page.summary.id, objection, ...fields }))
      if (result?.ok !== true) {
        publish({ notice: 'saveFailed' })
        return
      }
      // The discarded read cannot end the loading state, so the answer ends it.
      if (current === epoch) changed(result.value, { status: 'ready' })
    },
    select: (selected) => {
      if (snapshot.opening === null) publish({ selected })
    },
    setFormOpen: (formOpen) => { publish({ formOpen }) },
    dismiss: () => { publish({ notice: null }) },
    dismissNewer: () => { publish({ newer: null }) },
    writePlan: async () => {
      const page = snapshot.page
      if (page === null || snapshot.opening !== null || snapshot.sending) return
      publish({ sending: true, notice: null })
      const result = await settle(() => deps.send(page.summary.sessionId, deps.planMessage(page)))
      publish({ sending: false, notice: result?.ok === true ? 'sent' : 'sendFailed' })
      if (result?.ok === true) deps.openSession(page.summary.sessionId)
    },
    openChat: () => {
      if (snapshot.page !== null && snapshot.opening === null) deps.openSession(snapshot.page.summary.sessionId)
    },
    startAnalysis: (application) => {
      publish({ formOpen: false })
      deps.draftChat(deps.analysisMessage(application.trim()))
    },
    retry: () => read(),
  }
}

/**
 * Count the objections in the `needs_review` state over all pages.
 * @param pages - the page summaries.
 * @returns the count.
 */
export function needsReviewCount(pages: readonly WorkPageSummary[]): number {
  return pages.reduce((count, page) => count + page.needsReview, 0)
}

const DAY_MS = 86_400_000

/**
 * Whole calendar days from `now` to the deadline date, in UTC; negative after the deadline.
 * @param deadline - ISO 8601 date.
 * @param now - the current time in milliseconds.
 * @returns the day count.
 */
export function daysUntil(deadline: string, now: number): number {
  const today = new Date(now)
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  return Math.round((Date.parse(deadline) - start) / DAY_MS)
}
