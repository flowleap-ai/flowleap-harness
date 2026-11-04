/**
 * The navigation and data model of the Matters panel. A route names one view; the screen is that route with the
 * load of each read the view needs. Navigating keeps a read that the next view also needs (the intake list while
 * another letter opens), so its data stays on screen, and stops every other read. The intake waiting list is always
 * held, because the Intake tab shows its count. Acts go through the model, so each one refreshes the screen and the
 * count after the Records service accepts it.
 */

import { createSnapshotStore, type ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type {
  Act, DeadlineDetail, DeadlineId, DocumentId, Fetched, FileNumber, IntakeDocument, IntakeList, IntakeView,
  MatterDetail, MattersList, Me, RecordsApi, RecordsError, TicketDetail, TicketId, TicketsList,
} from './api.ts'
import { createLoader, shownData, type Load, type Loader } from './load.ts'

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
export type Route = MattersRoute | IntakeRoute | MatterRoute | DeadlineRoute | WorkRoute | BoardRoute

/** A view of the panel. */
export type View = Route['view']

/** The route of each view with the loads that the view shows. */
export type Screen =
  | MattersRoute & { readonly matters: Load<MattersList> }
  | IntakeRoute & { readonly intake: Load<IntakeList>; readonly item: Load<IntakeDocument> | null }
  | MatterRoute & { readonly matter: Load<MatterDetail> }
  | DeadlineRoute & { readonly deadline: Load<DeadlineDetail> }
  | WorkRoute & { readonly ticket: Load<TicketDetail> }
  | BoardRoute & { readonly tickets: Load<TicketsList> }

/** The screen of one view. */
export type ScreenOf<V extends View> = Extract<Screen, { readonly view: V }>

/** The three view tabs of the top bar. */
export type Tab = 'matters' | 'intake' | 'work'

/** The tab of each view: intake views under Intake, the board under Work, the rest under Matters. */
export const TAB_OF: Readonly<Record<View, Tab>> = {
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

/** The model of the Matters panel. */
export interface RecordsModel {
  /** The current route with its loads. */
  readonly screen: ObservableSnapshot<Screen>
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
 * Create the model of the Matters panel and start the reads of the first route, the person and the waiting count.
 * @param api - the Records API.
 * @param initial - the first route.
 * @returns the model.
 */
export function createRecordsModel(api: RecordsApi, initial: Route): RecordsModel {
  const caches = {
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
  const waiting = () => caches.intake.get('waiting', () => { publish() })
  const waitingCount = createSnapshotStore<number | null>(null)

  /**
   * Build the screen of the route: get each loader it needs, then dispose the loaders it no longer needs.
   * @returns the screen and its loaders.
   */
  const build = (): { screen: Screen; loaders: readonly Loader<unknown>[] } => {
    const changed = () => { publish() }
    const keep: Record<keyof typeof caches, Set<string>> = {
      matters: new Set(), matter: new Set(), intake: new Set(['waiting']), intakeDocument: new Set(), deadline: new Set(),
      tickets: new Set(), ticket: new Set(),
    }
    let screen: Screen
    let loaders: Loader<unknown>[]
    switch (route.view) {
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
        keep.ticket.add(route.id)
        screen = { ...route, ticket: ticket.source.getSnapshot() }
        loaders = [ticket]
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
    const shown = shownData(waiting().source.getSnapshot())
    waitingCount.set(shown === null ? null : shown.data.counts.waiting)
  }

  publish()
  meLoader.load()

  return {
    screen,
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
      const loaders = new Set([...current, waiting() as Loader<unknown>])
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
