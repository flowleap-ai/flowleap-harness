/**
 * Office action board source: the work pages that the Host lists, the page on show with its file, and the page state.
 * Every read and change goes through the `flowleapWorkPages` Remote: the board changes only the review fields of an
 * objection, never a finding. "Write response plan" sends one chat message into the chat that saved the page, and the
 * form opens a new chat with a drafted message; the page itself never calls the model or a connector.
 */

import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  ReviewFields, WorkPageReviewState, WorkPageId, WorkPageReviewRequest, WorkPageSummary, WorkPageView,
} from '@deepseek-ai/dsh-flowleap-deliverables/work-pages'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Review states in menu order. */
export const REVIEW_STATES: readonly WorkPageReviewState[] = ['needs_review', 'relevant', 'done', 'not_relevant']

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

/** The review fields of an objection that the file does not list: a page written by an older save. */
const NO_REVIEW: ReviewFields = { state: 'needs_review', owner: '', note: '' }

/**
 * Read the review fields of one objection.
 * @param view - the page.
 * @param id - the objection.
 * @returns the fields.
 */
export function reviewOf(view: WorkPageView, id: string): ReviewFields {
  return view.file.review[id] ?? NO_REVIEW
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
  /** Observe changes of the work pages. */
  readonly subscribeChanged: (listener: () => void) => () => void
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
  let snapshot: BoardSnapshot = { status: 'loading', pages: [], page: null, selected: null, formOpen: false, sending: false, notice: null }
  const listeners = new Set<() => void>()
  let disposers: readonly (() => void)[] = []
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
  const read = async (wanted?: WorkPageId): Promise<void> => {
    const current = ++epoch
    publish({ status: 'loading' })
    const pages = await settle(deps.list)
    if (current !== epoch) return
    if (pages?.ok !== true) {
      publish({ status: 'error' })
      return
    }
    const id = wanted ?? snapshot.page?.summary.id
    const shown = pages.value.find(page => page.id === id) ?? pages.value[0]
    if (shown === undefined) {
      publish({ status: 'ready', pages: pages.value, page: null, selected: null })
      return
    }
    const view = await settle(() => deps.read(shown.id))
    if (current !== epoch) return
    if (view?.ok !== true) {
      publish({ status: 'error', pages: pages.value })
      return
    }
    const { selected } = snapshot
    const keep = snapshot.page?.summary.id === shown.id && selected !== null && Object.hasOwn(view.value.file.review, selected)
    publish({ status: 'ready', pages: pages.value, page: view.value, selected: keep ? selected : null })
  }
  const invalidate = (): void => { void read() }
  return {
    hooks: {
      board: {
        getSnapshot: () => snapshot,
        subscribe(listener) {
          listeners.add(listener)
          if (listeners.size === 1) {
            disposers = [deps.subscribeChanged(invalidate), deps.subscribeReset(invalidate)]
            invalidate()
          }
          return () => {
            listeners.delete(listener)
            if (listeners.size !== 0) return
            for (const dispose of disposers) dispose()
            disposers = []
            epoch++
          }
        },
      },
    },
    choose: async (id) => {
      publish({ selected: null })
      await read(id)
    },
    setReview: async (objection, fields) => {
      const page = snapshot.page
      if (page === null) return
      const result = await settle(() => deps.review({ id: page.summary.id, objection, ...fields }))
      if (result?.ok !== true) {
        publish({ notice: 'saveFailed' })
        return
      }
      if (snapshot.page?.summary.id !== page.summary.id) return
      publish({
        page: result.value,
        pages: snapshot.pages.map(summary => summary.id === page.summary.id ? result.value.summary : summary),
      })
    },
    select: (selected) => { publish({ selected }) },
    setFormOpen: (formOpen) => { publish({ formOpen }) },
    dismiss: () => { publish({ notice: null }) },
    writePlan: async () => {
      const page = snapshot.page
      if (page === null || snapshot.sending) return
      publish({ sending: true, notice: null })
      const result = await settle(() => deps.send(page.summary.sessionId, deps.planMessage(page)))
      publish({ sending: false, notice: result?.ok === true ? 'sent' : 'sendFailed' })
      if (result?.ok === true) deps.openSession(page.summary.sessionId)
    },
    openChat: () => {
      if (snapshot.page !== null) deps.openSession(snapshot.page.summary.sessionId)
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
