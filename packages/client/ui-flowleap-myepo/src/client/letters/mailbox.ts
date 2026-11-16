/**
 * The Letters page state: the last read of the Mailbox, the view and the text that filter it, the open letter and its
 * PDF. The state lives in the page only; nothing here writes to MyEPO. Opening a letter gets its PDF; after a download
 * from MyEPO, the EPO shows the letter as read.
 */

import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import { createPageStore, readList, type Answer, type EpoFailure, type ReadFailure, type ReadSnapshot } from '../shared/read.ts'
import type { MyEpoFolderView, MyEpoLetterView, MyEpoMailboxView } from '@deepseek-ai/dsh-api-remotes/client'

/** A view of the list: every letter, the unread ones, the ones not handled, or one Mailbox folder. */
export type MailboxViewId = 'all' | 'unread' | 'open' | `folder:${string}`

/** Why the last read gave no list: an outcome of the EPO, or a failed call to the Host. */
export type MailboxFailure = ReadFailure

/** The PDF of the open letter. */
export type LetterPdf =
  | { readonly id: string; readonly status: 'loading' }
  | { readonly id: string; readonly status: 'ready'; readonly url: string; readonly fileName: string }
  | { readonly id: string; readonly status: 'failed'; readonly message: string }
  /** The firm has no copy of the letter; the person opens it in MyEPO. */
  | { readonly id: string; readonly status: 'none' }

/** The PDF that a download gave. */
export interface LetterDownload {
  /** The file name that the EPO gave the PDF. */
  readonly fileName: string
  readonly pdf: Uint8Array
  /** Whether the download made MyEPO show the letter as read: true for a download from MyEPO, false for the firm's copy. */
  readonly marksRead: boolean
}

/** What the page renders. */
export interface MailboxSnapshot extends ReadSnapshot {
  /** The letters of the last read that answered. */
  readonly letters: readonly MyEpoLetterView[]
  /** The folders of the last read that answered. */
  readonly folders: readonly MyEpoFolderView[]
  /** How many letters the Mailbox holds. */
  readonly total: number
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

export type { Answer } from '../shared/read.ts'

/** What the model needs from the browser and the Host. */
export interface MailboxDependencies {
  /** Read the Mailbox: from MyEPO through the Host, or the firm's copy. */
  readonly read: () => Promise<Answer<MyEpoMailboxView | EpoFailure>>
  /** Get the PDF of one letter; `null` when the firm has no copy of it. */
  readonly download: (id: string) => Promise<Answer<LetterDownload | null>>
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
  const store = createPageStore(START, () => { void refresh() })
  const { publish } = store
  const release = (): void => {
    const { pdf } = store.get()
    if (pdf?.status === 'ready') deps.revokeUrl(pdf.url)
  }

  const refresh = (): Promise<void> => readList<Extract<MyEpoMailboxView, { kind: 'read' }>, MailboxSnapshot>(store, deps.read, (view) => {
    publish({ letters: view.letters, folders: view.folders, total: view.total, readAt: view.readAt })
  })

  const select = async (id: string | null): Promise<void> => {
    if (id === store.get().selected) return
    release()
    if (id === null) {
      publish({ selected: null, wide: false, pdf: null })
      return
    }
    publish({ selected: id, pdf: { id, status: 'loading' } })
    const answer = await deps.download(id)
    // The person opened another letter, or closed this one, while the download ran.
    if (store.get().selected !== id) return
    if (!answer.ok) {
      publish({ pdf: { id, status: 'failed', message: answer.error.message } })
      return
    }
    const download = answer.value
    if (download === null) {
      publish({ pdf: { id, status: 'none' } })
      return
    }
    const pdf = { id, status: 'ready', url: deps.createUrl(download.pdf), fileName: download.fileName } as const
    if (!download.marksRead) {
      publish({ pdf })
      return
    }
    const wasUnread = store.get().letters.some(letter => letter.id === id && !letter.read)
    publish({
      pdf,
      letters: store.get().letters.map(letter => (letter.id === id ? { ...letter, read: true } : letter)),
      opened: wasUnread ? [...store.get().opened, id] : store.get().opened,
    })
  }

  return {
    hooks: { mailbox: store.observable },
    refresh,
    select,
    step: (direction) => {
      const list = shownLetters(store.get())
      const first = list[0]
      if (first === undefined) return Promise.resolve()
      const at = list.findIndex(letter => letter.id === store.get().selected)
      const next = at === -1 ? first : list[Math.max(0, Math.min(list.length - 1, at + direction))] as MyEpoLetterView
      return select(next.id)
    },
    setView: (view) => { publish({ view, limit: PAGE_SIZE }) },
    setQuery: (query) => { publish({ query, limit: PAGE_SIZE }) },
    more: () => { publish({ limit: store.get().limit + PAGE_SIZE }) },
    setWide: (wide) => { publish({ wide }) },
    dispose: release,
  }
}
