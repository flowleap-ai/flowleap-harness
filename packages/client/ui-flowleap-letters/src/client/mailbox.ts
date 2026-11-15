/**
 * The Letters page state over the `flowleapConnectors` Remote: the last answer of `myEpoMailbox()`, the view and the
 * text that filter it, the open letter and its PDF. The state lives in the page only; nothing here writes to MyEPO.
 * Opening a letter downloads its PDF, and the EPO then shows the letter as read.
 */

import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { MyEpoFolderView, MyEpoLetterPdf, MyEpoLetterView, MyEpoMailboxView } from '@deepseek-ai/dsh-api-remotes/client'

/** A view of the list: every letter, the unread ones, the ones not handled, or one Mailbox folder. */
export type MailboxViewId = 'all' | 'unread' | 'open' | `folder:${string}`

/** Why the last read gave no list: an outcome of the EPO, or a failed call to the Host. */
export type MailboxFailure =
  | Exclude<MyEpoMailboxView, { kind: 'read' }>
  | { readonly kind: 'error'; readonly message: string }

/** The PDF of the open letter. */
export type LetterPdf =
  | { readonly id: string; readonly status: 'loading' }
  | { readonly id: string; readonly status: 'ready'; readonly url: string; readonly fileName: string }
  | { readonly id: string; readonly status: 'failed'; readonly message: string }

/** What the page renders. */
export interface MailboxSnapshot {
  /** `loading` until the first answer. */
  readonly phase: 'loading' | 'ready'
  /** A read is crossing the wire. */
  readonly reading: boolean
  /** Why the last read gave no list; `null` after a read that answered. */
  readonly failure: MailboxFailure | null
  /** The letters of the last read that answered. */
  readonly letters: readonly MyEpoLetterView[]
  /** The folders of the last read that answered. */
  readonly folders: readonly MyEpoFolderView[]
  /** How many letters the Mailbox holds. */
  readonly total: number
  /** When the last read that answered ended, ISO 8601; `null` before it. */
  readonly readAt: string | null
  readonly view: MailboxViewId
  readonly query: string
  /** How many rows of the filtered list the page shows. */
  readonly limit: number
  /** The id of the open letter. */
  readonly selected: string | null
  /** The open letter uses the full width. */
  readonly wide: boolean
  readonly pdf: LetterPdf | null
  /** The letters that this page opened while MyEPO showed them as unread. */
  readonly opened: readonly string[]
}

/** A Remote answer. */
export type Answer<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: { readonly message: string } }

/** What the model needs from the browser and the Host. */
export interface MailboxDependencies {
  /** `flowleapConnectors.myEpoMailbox()`. */
  readonly read: () => Promise<Answer<MyEpoMailboxView>>
  /** `flowleapConnectors.myEpoLetterPdf(id)`. */
  readonly download: (id: string) => Promise<Answer<MyEpoLetterPdf>>
  /** Make an address for PDF bytes that a frame can show. */
  readonly createUrl: (pdf: Uint8Array) => string
  /** Release an address of {@link MailboxDependencies.createUrl}. */
  readonly revokeUrl: (url: string) => void
}

/** The page model: its observable state and its acts. */
export interface Mailbox {
  readonly hooks: { readonly mailbox: HostObservable<MailboxSnapshot> }
  /** Read the Mailbox again. */
  readonly refresh: () => Promise<void>
  /** Open one letter and download its PDF, or close the open letter with `null`. */
  readonly select: (id: string | null) => Promise<void>
  /** Open the letter before (-1) or after (1) the open one in the shown list; the first one when none is open. */
  readonly step: (direction: -1 | 1) => Promise<void>
  readonly setView: (view: MailboxViewId) => void
  readonly setQuery: (query: string) => void
  /** Show one more page of rows. */
  readonly more: () => void
  readonly setWide: (wide: boolean) => void
  /** Release the PDF address; the page is going away. */
  readonly dispose: () => void
}

/** How many rows the list shows at first, and how many each "show more" adds. */
export const PAGE_SIZE = 100

/**
 * Whether a letter belongs to a view.
 * @param letter - the letter.
 * @param view - the view.
 * @returns true when the view lists the letter.
 */
export function inView(letter: MyEpoLetterView, view: MailboxViewId): boolean {
  if (view === 'all') return true
  if (view === 'unread') return !letter.read
  if (view === 'open') return !letter.handled
  return letter.folderId === view.slice('folder:'.length)
}

/**
 * The letters of the current view that match the text, in the order of the MyEPO list.
 * @param snapshot - the page state.
 * @returns the matching letters, not cut to `limit`.
 */
export function shownLetters(snapshot: Pick<MailboxSnapshot, 'letters' | 'view' | 'query'>): MyEpoLetterView[] {
  const query = snapshot.query.trim().toLowerCase()
  return snapshot.letters.filter((letter) => {
    if (!inView(letter, snapshot.view)) return false
    if (query === '') return true
    const text = [letter.title, letter.applicationNumber, letter.userReference, letter.applicantName, letter.documentCode].join(' ')
    return text.toLowerCase().includes(query)
  })
}

const START: MailboxSnapshot = {
  phase: 'loading', reading: false, failure: null, letters: [], folders: [], total: 0, readAt: null,
  view: 'all', query: '', limit: PAGE_SIZE, selected: null, wide: false, pdf: null, opened: [],
}

/**
 * Create the page model. The first observer starts the first read.
 * @param deps - the Remote calls and the PDF address functions.
 * @returns the model.
 */
export function createMailbox(deps: MailboxDependencies): Mailbox {
  let snapshot = START
  const listeners = new Set<() => void>()
  const publish = (change: Partial<MailboxSnapshot>): void => {
    snapshot = { ...snapshot, ...change }
    listeners.forEach((listener) => { listener() })
  }
  const release = (): void => {
    if (snapshot.pdf?.status === 'ready') deps.revokeUrl(snapshot.pdf.url)
  }

  const refresh = async (): Promise<void> => {
    if (snapshot.reading) return
    publish({ reading: true })
    const answer = await deps.read()
    if (!answer.ok) {
      publish({ phase: 'ready', reading: false, failure: { kind: 'error', message: answer.error.message } })
      return
    }
    const view = answer.value
    if (view.kind !== 'read') {
      publish({ phase: 'ready', reading: false, failure: view })
      return
    }
    publish({
      phase: 'ready', reading: false, failure: null, letters: view.letters, folders: view.folders, total: view.total, readAt: view.readAt,
    })
  }

  const select = async (id: string | null): Promise<void> => {
    if (id === snapshot.selected) return
    release()
    if (id === null) {
      publish({ selected: null, wide: false, pdf: null })
      return
    }
    publish({ selected: id, pdf: { id, status: 'loading' } })
    const answer = await deps.download(id)
    // The person opened another letter, or closed this one, while the download ran.
    if (snapshot.selected !== id) return
    if (!answer.ok) {
      publish({ pdf: { id, status: 'failed', message: answer.error.message } })
      return
    }
    const wasUnread = snapshot.letters.some(letter => letter.id === id && !letter.read)
    publish({
      pdf: { id, status: 'ready', url: deps.createUrl(answer.value.pdf), fileName: answer.value.fileName },
      letters: snapshot.letters.map(letter => (letter.id === id ? { ...letter, read: true } : letter)),
      opened: wasUnread ? [...snapshot.opened, id] : snapshot.opened,
    })
  }

  return {
    hooks: {
      mailbox: {
        getSnapshot: () => snapshot,
        subscribe: (listener) => {
          listeners.add(listener)
          if (listeners.size === 1 && snapshot.phase === 'loading') void refresh()
          return () => { listeners.delete(listener) }
        },
      },
    },
    refresh,
    select,
    step: (direction) => {
      const list = shownLetters(snapshot)
      const first = list[0]
      if (first === undefined) return Promise.resolve()
      const at = list.findIndex(letter => letter.id === snapshot.selected)
      const next = at === -1 ? first : list[Math.max(0, Math.min(list.length - 1, at + direction))] as MyEpoLetterView
      return select(next.id)
    },
    setView: (view) => { publish({ view, limit: PAGE_SIZE }) },
    setQuery: (query) => { publish({ query, limit: PAGE_SIZE }) },
    more: () => { publish({ limit: snapshot.limit + PAGE_SIZE }) },
    setWide: (wide) => { publish({ wide }) },
    dispose: release,
  }
}
