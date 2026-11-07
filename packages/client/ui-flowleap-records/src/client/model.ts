/**
 * The navigation and data model of the Matters panel. A route names one view; the screen is that route with the
 * load of each read the view needs. Navigating keeps a read that the next view also needs (the intake list while
 * another letter opens), so its data stays on screen, and stops every other read. Each panel holds one list on every
 * view: My work its tasks (the pager and the sidebar count), the Matters panel the intake waiting list (the Intake tab's
 * count). Acts go through the model, so each one refreshes the screen and the
 * count after the Records service accepts it.
 */

import { createSnapshotStore, type ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type {
  Act, DeadlineDetail, DeadlineId, DocumentId, Fetched, FileNumber, IntakeDocument, IntakeList, IntakeView,
  MatterDetail, MattersList, Me, MyWork, RecordsApi, RecordsError, TicketDetail, TicketId, TicketsList,
} from './api.ts'
import { createLoader, shownData, type Load, type Loader } from './load.ts'

/** My work: the person's open tasks by due time. */
export interface MyWorkRoute { readonly view: 'my-work' }
/** One letter of intake as its own page, as My work opens it ("File this letter"). */
export interface LetterRoute { readonly view: 'letter'; readonly document: DocumentId }
/** The matters list. */
export interface MattersRoute { readonly view: 'matters' }
/** A step of the open letter's decision that a route can open: the matter picker or the reason step. */
export type IntakeStep = 'other-matter' | 'reason'
/**
 * An intake list and the open letter. From 1366 px the letter shows beside the list; below 1366 px an open letter
 * is the intake item page with "1 / N" over its list, so a width change keeps the view, its state and its focus.
 */
export interface IntakeRoute {
  readonly view: 'intake'
  readonly list: IntakeView
  readonly open: DocumentId | null
  /** A step that opens with the letter, such as the reason step from the row's context menu. */
  readonly step?: IntakeStep | undefined
}
/** One matter. */
export interface MatterRoute { readonly view: 'matter'; readonly fileNumber: FileNumber }
/** One deadline. */
export interface DeadlineRoute { readonly view: 'deadline'; readonly id: DeadlineId }
/** The work on one letter. */
export interface WorkRoute { readonly view: 'work'; readonly id: TicketId }
/** The work board, as columns (the default) or as a list grouped by state. */
export interface BoardRoute { readonly view: 'board'; readonly layout?: 'board' | 'list' | undefined }

/** Where the panel is. */
export type Route = MyWorkRoute | LetterRoute | MattersRoute | IntakeRoute | MatterRoute | DeadlineRoute | WorkRoute | BoardRoute

/** A view of the panel. */
export type View = Route['view']

/** The route of each view with the loads that the view shows. */
export type Screen =
  | MyWorkRoute & {
    readonly myWork: Load<MyWork>
    /** The intake waiting list, for the status of each letter that waits to be filed. */
    readonly letters: Load<IntakeList>
  }
  | LetterRoute & { readonly item: Load<IntakeDocument> }
  | MattersRoute & { readonly matters: Load<MattersList> }
  | IntakeRoute & { readonly intake: Load<IntakeList>; readonly item: Load<IntakeDocument> | null }
  | MatterRoute & { readonly matter: Load<MatterDetail> }
  | DeadlineRoute & { readonly deadline: Load<DeadlineDetail> }
  | WorkRoute & {
    readonly ticket: Load<TicketDetail>
    /** The board's work, for the "1 / N" of the work that waits for a decision. */
    readonly queue: Load<TicketsList>
  }
  | BoardRoute & { readonly tickets: Load<TicketsList> }

/** The screen of one view. */
export type ScreenOf<V extends View> = Extract<Screen, { readonly view: V }>

/** The three view tabs of the top bar. */
export type Tab = 'matters' | 'intake' | 'work'

/** The tab of each view: intake views under Intake, the board under Work, the rest under Matters. */
export const TAB_OF: Readonly<Record<View, Tab>> = {
  'my-work': 'matters', 'letter': 'intake',
  'matters': 'matters', 'matter': 'matters', 'deadline': 'matters', 'work': 'matters',
  'intake': 'intake', 'board': 'work',
}

/** The route that each tab opens. */
export const TAB_ROUTE: Readonly<Record<Tab, Route>> = {
  matters: { view: 'matters' },
  intake: { view: 'intake', list: 'waiting', open: null },
  work: { view: 'board' },
}

/** The result of a group of acts: the acts that failed, each with its failure. */
export interface ActsResult {
  readonly failed: readonly { readonly act: Act; readonly error: RecordsError }[]
}

/**
 * The panel a model serves. Both hold the intake waiting list on every view (the Intake tab's count, and the status of
 * a letter in My work); My work also holds the person's tasks, for its pager.
 */
export type PanelRoot = 'my-work' | 'matters'

/** The first route of each panel. */
export const ROOT_ROUTE: Readonly<Record<PanelRoot, Route>> = {
  'my-work': { view: 'my-work' },
  'matters': { view: 'intake', list: 'waiting', open: null },
}

/** The model of the Matters panel. */
export interface RecordsModel {
  /** The current route with its loads. */
  readonly screen: ObservableSnapshot<Screen>
  /** The person's tasks; null in the Matters panel, which does not hold them. */
  readonly myWork: ObservableSnapshot<Load<MyWork> | null>
  /** The signed-in person. */
  readonly me: ObservableSnapshot<Load<Me>>
  /** Letters that wait for a person, for the Intake tab; null until the first answer. */
  readonly waitingCount: ObservableSnapshot<number | null>
  /** Go to a route. */
  navigate(route: Route): void
  /** Load again each read of the screen that failed. */
  retry(): void
  /** Load again every read of the screen and the waiting count. */
  refresh(): void
  /**
   * Send acts one after another, then refresh once. Keep a failed act and pass it again to retry it with its key.
   * @param acts - the acts of one decision; a bulk accept is one act for each letter.
   * @returns the acts that failed.
   */
  perform(acts: readonly Act[]): Promise<ActsResult>
  /** Stop every read; the model does nothing after this. */
  dispose(): void
}

/** The loaders of one read kind, one for each key. */
class LoaderCache<T> {
  readonly #loaders = new Map<string, Loader<T>>()

  /**
   * @param read - the read of one key.
   */
  constructor(private readonly read: (key: string, signal: AbortSignal) => Promise<Fetched<T>>) {}

  /**
   * The loader of a key; a new loader starts its first load.
   * @param key - the read's key.
   * @param onChange - called on each change of a new loader.
   * @returns the loader.
   */
  get(key: string, onChange: () => void): Loader<T> {
    let loader = this.#loaders.get(key)
    if (loader === undefined) {
      loader = createLoader(signal => this.read(key, signal))
      this.#loaders.set(key, loader)
      loader.load()
      loader.source.subscribe(onChange)
    }
    return loader
  }

  /**
   * Dispose every loader whose key is not kept.
   * @param keep - the keys to keep.
   */
  retain(keep: ReadonlySet<string>): void {
    for (const [key, loader] of this.#loaders) {
      if (keep.has(key)) continue
      loader.dispose()
      this.#loaders.delete(key)
    }
  }
}

/**
 * Create the model of a panel and start the reads of the first route, the person, and the list that the panel holds.
 * @param api - the Records API.
 * @param initial - the first route.
 * @param root - the panel: My work holds the person's tasks, the Matters panel the waiting list.
 * @returns the model.
 */
export function createRecordsModel(api: RecordsApi, initial: Route, root: PanelRoot = 'matters'): RecordsModel {
  const caches = {
    myWork: new LoaderCache<MyWork>((_key, signal) => api.myWork(signal)),
    matters: new LoaderCache<MattersList>((_key, signal) => api.matters(signal)),
    matter: new LoaderCache<MatterDetail>((key, signal) => api.matter(key as FileNumber, signal)),
    intake: new LoaderCache<IntakeList>((key, signal) => api.intake(key as IntakeView, signal)),
    intakeDocument: new LoaderCache<IntakeDocument>((key, signal) => api.intakeDocument(key as DocumentId, signal)),
    deadline: new LoaderCache<DeadlineDetail>((key, signal) => api.deadline(key as DeadlineId, signal)),
    tickets: new LoaderCache<TicketsList>((_key, signal) => api.tickets(signal)),
    ticket: new LoaderCache<TicketDetail>((key, signal) => api.ticket(key as TicketId, signal)),
  }
  let route: Route = initial
  let current: readonly Loader<unknown>[] = []
  let disposed = false

  const meLoader = createLoader(signal => api.me(signal))
  const held = (): Loader<unknown>[] => [
    caches.intake.get('waiting', () => { publish() }),
    ...(root === 'my-work' ? [caches.myWork.get('mine', () => { publish() })] : []),
  ]
  const waitingCount = createSnapshotStore<number | null>(null)
  const myWork = createSnapshotStore<Load<MyWork> | null>(null)

  /**
   * Build the screen of the route: get each loader it needs, then dispose the loaders it no longer needs.
   * @returns the screen and its loaders.
   */
  const build = (): { screen: Screen; loaders: readonly Loader<unknown>[] } => {
    const changed = () => { publish() }
    const keep: Record<keyof typeof caches, Set<string>> = {
      myWork: new Set(root === 'my-work' ? ['mine'] : []), matters: new Set(),
      matter: new Set(), intake: new Set(['waiting']), intakeDocument: new Set(), deadline: new Set(),
      tickets: new Set(), ticket: new Set(),
    }
    let screen: Screen
    let loaders: Loader<unknown>[]
    switch (route.view) {
      case 'my-work': {
        const mine = caches.myWork.get('mine', changed)
        const letters = caches.intake.get('waiting', changed)
        keep.myWork.add('mine')
        screen = { ...route, myWork: mine.source.getSnapshot(), letters: letters.source.getSnapshot() }
        loaders = [mine, letters]
        break
      }
      case 'letter': {
        const item = caches.intakeDocument.get(route.document, changed)
        keep.intakeDocument.add(route.document)
        screen = { ...route, item: item.source.getSnapshot() }
        loaders = [item]
        break
      }
      case 'matters': {
        const matters = caches.matters.get('all', changed)
        keep.matters.add('all')
        screen = { ...route, matters: matters.source.getSnapshot() }
        loaders = [matters]
        break
      }
      case 'intake': {
        const intake = caches.intake.get(route.list, changed)
        keep.intake.add(route.list)
        const item = route.open === null ? null : caches.intakeDocument.get(route.open, changed)
        if (route.open !== null) keep.intakeDocument.add(route.open)
        screen = { ...route, intake: intake.source.getSnapshot(), item: item?.source.getSnapshot() ?? null }
        loaders = item === null ? [intake] : [intake, item]
        break
      }
      case 'matter': {
        const matter = caches.matter.get(route.fileNumber, changed)
        keep.matter.add(route.fileNumber)
        screen = { ...route, matter: matter.source.getSnapshot() }
        loaders = [matter]
        break
      }
      case 'deadline': {
        const deadline = caches.deadline.get(route.id, changed)
        keep.deadline.add(route.id)
        screen = { ...route, deadline: deadline.source.getSnapshot() }
        loaders = [deadline]
        break
      }
      case 'work': {
        const ticket = caches.ticket.get(route.id, changed)
        const queue = caches.tickets.get('all', changed)
        keep.ticket.add(route.id)
        keep.tickets.add('all')
        screen = { ...route, ticket: ticket.source.getSnapshot(), queue: queue.source.getSnapshot() }
        loaders = [ticket, queue]
        break
      }
      case 'board': {
        const tickets = caches.tickets.get('all', changed)
        keep.tickets.add('all')
        screen = { ...route, tickets: tickets.source.getSnapshot() }
        loaders = [tickets]
        break
      }
    }
    for (const kind of Object.keys(caches) as (keyof typeof caches)[]) caches[kind].retain(keep[kind])
    return { screen, loaders }
  }

  const screen = createSnapshotStore<Screen>(build().screen)

  /** Publish the screen of the current route and the waiting count. */
  function publish(): void {
    if (disposed) return
    const next = build()
    current = next.loaders
    screen.set(next.screen)
    if (root === 'my-work') myWork.set(caches.myWork.get('mine', () => { publish() }).source.getSnapshot())
    const shown = shownData(caches.intake.get('waiting', () => { publish() }).source.getSnapshot())
    waitingCount.set(shown === null ? null : shown.data.counts.waiting)
  }

  publish()
  meLoader.load()

  return {
    screen,
    myWork,
    me: meLoader.source,
    waitingCount,
    navigate(next) {
      route = next
      publish()
    },
    retry() {
      for (const loader of current) if (loader.source.getSnapshot().phase === 'failed') loader.load()
    },
    refresh() {
      const loaders = new Set([...current, ...held()])
      for (const loader of loaders) loader.load()
    },
    async perform(acts) {
      const failed: { act: Act; error: RecordsError }[] = []
      for (const act of acts) {
        const result = await api.perform(act)
        if (!result.ok) failed.push({ act, error: result.error })
      }
      if (!disposed) this.refresh()
      return { failed }
    },
    dispose() {
      disposed = true
      meLoader.dispose()
      for (const cache of Object.values(caches) as LoaderCache<unknown>[]) cache.retain(new Set())
    },
  }
}
